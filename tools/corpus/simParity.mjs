#!/usr/bin/env node
/**
 * Bot-driven sim parity — the oracle vs the pure sim, driven by the greedy
 * bot over the ladder presets. Compares normalized event streams, rounded
 * state hashes AND the action log; reports the first diverging tick.
 *
 *   node tools/corpus/simParity.mjs [--presets fresh,earlyAA] [--seeds 1,42]
 */
import { SimWorld } from "../../web/js/sim/simWorld.js";
import { Sim } from "../../web/js/sim/next/sim.js";
import { scenarioByName } from "../../web/js/balance/scenarios.js";
import { makeSlot } from "../../web/js/data/parts.js";
import { ENDLESS_GRID } from "../../web/js/data/endlessGrid.js";

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
  const events = [];
  const rec = (t, type, ...rest) => events.push([t, type, ...rest]);
  const tk = () => sim.tickIndex;
  sim.on("enemy_spawned", (e) => rec(tk(), "spawn", e.enemy?.kind, round(e.enemy?.pos?.x), round(e.enemy?.pos?.y)));
  sim.on("portal_moved", (e) => rec(tk(), "portal", e.x));
  sim.on("leak", (e) => rec(tk(), "leak", e.enemy?.kind, e.lives));
  sim.on("enemy_killed", (e) => rec(tk(), "kill", e.enemy?.kind));
  sim.on("wave_composition", (e) => rec(tk(), "compose", e.count, e.theme, e.event));
  sim.on("wave_cleared", (e) => rec(tk(), "clear", e.wave));
  sim.on("game_over", () => rec(tk(), "game_over"));
  sim.on("victory", (e) => rec(tk(), "victory", e.wave));
  sim.on("tower_placed", (e) => rec(tk(), "tplace", e.tower?.id, e.tower?.cell?.x, e.tower?.cell?.y, e.surcharge));
  sim.on("wall_placed", (e) => rec(tk(), "wplace", e.wall?.id, e.wall?.cell?.x, e.wall?.cell?.y));
  sim.on("tower_sold", (e) => rec(tk(), "tsell", e.id, e.refund));
  sim.on("wall_sold", (e) => rec(tk(), "wsell", e.id, e.refund));
  sim.on("tower_leveled", (e) => rec(tk(), "leveled", e.tower?.id, e.level));
  sim.on("level_branch", (e) => rec(tk(), "branch", e.tower?.id, e.branch, e.ranks?.damage, e.ranks?.rof, e.ranks?.range));
  sim.on("tower_fired", (e) => rec(tk(), "fire", e.towerId, e.pattern, round(e.angle)));
  sim.on("hit", (e) => rec(tk(), "hit", e.enemyId, round(e.damage), e.type));

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
  return JSON.stringify({
    waveIndex: sim.waveIndex,
    lives: sim.lives,
    battle: round(sim.economy?.battle),
    portal: sim.portal,
    tick: sim.tickIndex,
    leaks: sim.leakCount,
    kills: sim.killCount,
    towers: sim.towers.map((t) => [t.id, t.cell.x, t.cell.y, t.base, t.barrel, t.payload, t.level, t.branch]),
    walls: sim.walls.map((w) => [w.id, w.cell.x, w.cell.y, w.preplaced ? 1 : 0]),
    enemies: sim.enemies.map((e) => [e.id, e.kind, round(e.pos.x), round(e.pos.y), round(e.hp)]),
    log: sim.actionLog,
  });
}

const { presets, seeds } = parseArgs(process.argv.slice(2));
let failures = 0;
for (const preset of presets) {
  const base = scenarioByName(preset);
  for (const seed of seeds) {
    const maxTicks = base.maxTicks;
    const oldR = runTrace(setupBase(new SimWorld(), base, seed), base, maxTicks);
    const newR = runTrace(setupBase(new Sim(), base, seed), base, maxTicks);

    let bad = null;
    const n = Math.min(oldR.events.length, newR.events.length);
    for (let i = 0; i < n; i++) {
      const a = JSON.stringify(oldR.events[i]);
      const b = JSON.stringify(newR.events[i]);
      if (a !== b) {
        bad = `event ${i}: oracle ${a} vs new ${b}`;
        break;
      }
    }
    if (!bad && oldR.events.length !== newR.events.length) {
      bad = `event count: oracle ${oldR.events.length} vs new ${newR.events.length}`;
    }
    const hOld = stateHash(oldR.sim);
    const hNew = stateHash(newR.sim);
    if (!bad && hOld !== hNew) {
      bad = `state hash differs\n alt: ${hOld}\n new: ${hNew}`;
    }

    if (bad) {
      failures++;
      console.log(`${preset}@${seed}: FAIL — ${bad}`);
    } else {
      console.log(
        `${preset}@${seed}: PASS — ${oldR.ticks}t ${oldR.events.length} events, ${oldR.gameOver ? "game over" : "maxed"}`
      );
    }
  }
}
console.log(failures === 0 ? "PARITY OK" : `${failures} run(s) diverged`);
process.exit(failures === 0 ? 0 : 1);
