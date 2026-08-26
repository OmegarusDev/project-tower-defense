#!/usr/bin/env node
/**
 * Sim regression — the next Sim vs the committed behavioral corpus
 * (sim-traces.json, originally captured from the reference: same seeds, same
 * greedy-bot actions, full event streams + rounded state hashes). Regenerate
 * the corpus with simTrace.mjs when the game deliberately changes.
 *
 *   node tools/corpus/simParity.mjs [--presets fresh,earlyAA] [--seeds 1,42]
 */
import { Sim } from "../../web/js/sim/next/sim.js";
import { scenarioByName } from "../../web/js/balance/scenarios.js";
import { makeSlot } from "../../web/js/data/parts.js";
import { ENDLESS_GRID } from "../../web/js/data/endlessGrid.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = JSON.parse(readFileSync(join(HERE, "out", "sim-traces.json"), "utf8"));

function parseArgs(argv) {
  const a = { presets: ["fresh", "earlyAA", "parts2", "midMeta"], seeds: [1, 2, 42, 123] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--presets") a.presets = argv[++i].split(",");
    if (argv[i] === "--seeds") a.seeds = argv[++i].split(",").map(Number);
  }
  return a;
}

const round = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;

function setupBase(sim, base, seed) {
  sim.setup(ENDLESS_GRID.cols, ENDLESS_GRID.rows, seed, true);
  sim.runSeed = seed;
  sim.runLevelCap = base.runLevelCap;
  sim.setStartLives(base.startLives, { resetCurrent: true });
  sim.economy.battle = base.startBattle;
  if (base.partUpgrades) sim.setPartUpgrades(base.partUpgrades);
  if (base.globalMods) sim.setGlobalMods(base.globalMods);
  sim.setRoster(
    base.roster.map((s) => makeSlot(s.base, s.barrel, s.payload, s.levelCap || base.runLevelCap))
  );
  return sim;
}

function runTrace(sim, base, maxTicks) {
  // Recorder mirrors simTrace.mjs EXACTLY — the corpus format is the contract.
  const events = [];
  const rec = (type, data = {}) => events.push({ t: sim.tickIndex, type, ...data });
  const round2 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
  sim.on("wave_cleared", (e) => {
    rec("wave_cleared", { wave: e.wave });
    sim.running = false;
  });
  sim.on("leak", (e) => rec("leak", { kind: e.enemy?.kind, lives: e.lives, x: round2(e.enemy?.pos?.x), y: round2(e.enemy?.pos?.y) }));
  sim.on("enemy_killed", (e) => rec("kill", { kind: e.enemy?.kind }));
  sim.on("tower_leveled", (e) => rec("leveled", { id: e.tower?.id, level: e.tower?.level }));
  sim.on("portal_moved", (e) => rec("portal", { x: e.x }));
  sim.on("wall_placed", (e) => rec("wall", { x: e.wall?.cell?.x, y: e.wall?.cell?.y }));
  sim.on("game_over", () => rec("game_over"));
  sim.on("victory", (e) => rec("victory", { wave: e.wave }));

  let gameOver = false;
  sim.on("game_over", () => (gameOver = true));
  base.bot.act(sim, "betweenWaves");
  sim.startWave({ earlyBonus: 0 });
  let ticks = 0;
  while (ticks < maxTicks && !gameOver) {
    if (sim.waveIndex >= base.maxWaves && !sim.waves.waveActive && sim.enemies.length === 0) break;
    if (!sim.running) {
      if (sim.waveIndex >= base.maxWaves) break;
      base.bot.act(sim, "betweenWaves");
      if (gameOver) break;
      sim.startWave({ earlyBonus: 0 });
      continue;
    }
    if ((ticks & 15) === 0) base.bot.act(sim, "inWave");
    sim.tick();
    ticks += 1;
  }
  return { events, ticks, sim, gameOver };
}

function stateHash(sim) {
  // MUST match simTrace.mjs's hash exactly — the corpus format is the contract.
  return JSON.stringify({
    waveIndex: sim.waveIndex,
    lives: sim.lives,
    startLives: sim.startLives,
    battle: sim.economy.battle,
    portal: sim.portal,
    towers: sim.towers.map((t) => [t.id, t.cell.x, t.cell.y, t.base, t.barrel, t.payload, t.level, t.branch]),
    walls: sim.walls.map((w) => [w.id, w.cell.x, w.cell.y]),
    enemies: sim.enemies.map((e) => [e.id, e.kind, round(e.pos.x), round(e.pos.y), round(e.hp)]),
    tick: sim.tickIndex,
    leaks: sim.leakCount,
    kills: sim.killCount,
  });
}

const { presets, seeds } = parseArgs(process.argv.slice(2));
let failures = 0;
let checked = 0;
for (const preset of presets) {
  const base = scenarioByName(preset);
  for (const seed of seeds) {
    const entry = CORPUS[`${preset}@${seed}`];
    if (!entry) {
      failures++;
      console.log(`${preset}@${seed}: FAIL — no corpus entry (re-run simTrace.mjs)`);
      continue;
    }
    checked++;
    const maxTicks = base.maxTicks;
    const r = runTrace(setupBase(new Sim(), base, seed), base, maxTicks);

    let bad = null;
    const want = entry.events;
    const got = r.events;
    const n = Math.min(want.length, got.length);
    for (let i = 0; i < n; i++) {
      const a = JSON.stringify(want[i]);
      const b = JSON.stringify(got[i]);
      if (a !== b) {
        bad = `event ${i}: corpus ${a} vs sim ${b}`;
        break;
      }
    }
    if (!bad && want.length !== got.length) {
      bad = `event count: corpus ${want.length} vs sim ${got.length}`;
    }
    const h = stateHash(r.sim);
    if (!bad && h !== entry.stateHash) {
      bad = `state hash differs\n  corpus: ${entry.stateHash}\n  sim:    ${h}`;
    }

    if (bad) {
      failures++;
      console.log(`${preset}@${seed}: FAIL — ${bad}`);
    } else {
      console.log(
        `${preset}@${seed}: PASS — ${r.ticks}t ${got.length} events, ${r.gameOver ? "game over" : "maxed"}`
      );
    }
  }
}
console.log(failures === 0 ? `PARITY OK (${checked} traces)` : `${failures} run(s) diverged`);
process.exit(failures === 0 ? 0 : 1);
