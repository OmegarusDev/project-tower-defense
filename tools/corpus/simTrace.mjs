#!/usr/bin/env node
/**
 * Sim trace corpus — the oracle's behavioral fingerprint.
 * For each (preset × seed): drives the run with the greedy bot and records
 * the full event stream plus a rounded state hash. The parity runner later
 * replays the same seeds/actions against the ported sim and requires an
 * identical stream + hash.
 *
 *   node tools/corpus/simTrace.mjs [--presets fresh,earlyAA] [--seeds 1,2,42]
 */
import { Sim } from "../../web/js/sim/next/sim.js";
import { scenarioByName } from "../../web/js/balance/scenarios.js";
import { makeSlot } from "../../web/js/data/parts.js";
import { ENDLESS_GRID } from "../../web/js/data/endlessGrid.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");

function parseArgs(argv) {
  const a = { presets: ["fresh", "earlyAA", "parts2", "midMeta"], seeds: [1, 2, 42, 123] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--presets") a.presets = argv[++i].split(",");
    if (argv[i] === "--seeds") a.seeds = argv[++i].split(",").map(Number);
  }
  return a;
}

function runTrace(preset, seed) {
  const base = scenarioByName(preset);
  const sim = new Sim();
  sim.setup(ENDLESS_GRID.cols, ENDLESS_GRID.rows, seed, true);
  sim.runSeed = seed;
  sim.runLevelCap = base.runLevelCap;
  sim.setStartLives(base.startLives, { resetCurrent: true });
  sim.economy.battle = base.startBattle;
  if (base.partUpgrades) sim.setPartUpgrades(base.partUpgrades);
  if (base.globalMods) sim.setGlobalMods(base.globalMods);
  sim.setRoster(base.roster.map((s) => makeSlot(s.base, s.barrel, s.payload, s.levelCap || base.runLevelCap)));

  const events = [];
  const rec = (type, data = {}) => events.push({ t: sim.tickIndex, type, ...data });
  sim.on("wave_cleared", (e) => {
    rec("wave_cleared", { wave: e.wave });
    sim.running = false;
  });
  sim.on("leak", (e) => rec("leak", { kind: e.enemy?.kind, lives: e.lives, x: round(e.enemy?.pos?.x), y: round(e.enemy?.pos?.y) }));
  sim.on("enemy_killed", (e) => rec("kill", { kind: e.enemy?.kind }));
  sim.on("tower_leveled", (e) => rec("leveled", { id: e.tower?.id, level: e.tower?.level }));
  sim.on("portal_moved", (e) => rec("portal", { x: e.x }));
  sim.on("wall_placed", (e) => rec("wall", { x: e.wall?.cell?.x, y: e.wall?.cell?.y }));
  sim.on("game_over", () => rec("game_over"));
  sim.on("victory", (e) => rec("victory", { wave: e.wave }));

  base.bot.act(sim, "betweenWaves");
  sim.startWave({ earlyBonus: 0 });
  const maxTicks = base.maxTicks;
  let ticks = 0;
  let gameOver = false;
  sim.on("game_over", () => (gameOver = true));
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

  const stateHash = JSON.stringify({
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

  return { preset, seed, ticks, events, stateHash };
}

function round(n) {
  return Math.round((Number(n) || 0) * 1e6) / 1e6;
}

const { presets, seeds } = parseArgs(process.argv.slice(2));
mkdirSync(OUT, { recursive: true });
const all = {};
for (const preset of presets) {
  for (const seed of seeds) {
    const trace = runTrace(preset, seed);
    const key = `${preset}@${seed}`;
    all[key] = trace;
    console.log(`${key}: ${trace.ticks}t ${trace.events.length} events ${trace.stateHash.slice(0, 24)}…`);
  }
}
const file = join(OUT, "sim-traces.json");
writeFileSync(file, JSON.stringify(all));
console.log(`wrote ${file} (${presets.length * seeds.length} traces)`);
