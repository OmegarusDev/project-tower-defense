#!/usr/bin/env node
/**
 * Sim parity harness — the oracle vs the pure sim, driven identically.
 * Compares normalized event streams AND rounded state hashes; reports the
 * first divergence (tick + detail) so a porting error is instantly local.
 *
 *   node tools/corpus/simParity.mjs [--seeds 1,2,42] [--maxTicks 20000]
 */
import { SimWorld } from "../../web/js/sim/simWorld.js";
import { Sim } from "../../web/js/sim/next/sim.js";
import { ENDLESS_GRID } from "../../web/js/data/endlessGrid.js";
import { BASE_START_CASH } from "../../web/js/data/techTree.js";

function parseArgs(argv) {
  const a = { seeds: [1, 2, 42, 123], maxTicks: 20000 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--seeds") a.seeds = argv[++i].split(",").map(Number);
    if (argv[i] === "--maxTicks") a.maxTicks = +argv[++i];
  }
  return a;
}

const round = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;

function buildOracle(seed) {
  const sim = new SimWorld();
  sim.setup(ENDLESS_GRID.cols, ENDLESS_GRID.rows, seed, true);
  sim.runSeed = seed;
  sim.economy.battle = BASE_START_CASH;
  sim.lives = 3;
  sim.startLives = 3;
  return sim;
}

function buildNew(seed) {
  const sim = new Sim();
  sim.setup(ENDLESS_GRID.cols, ENDLESS_GRID.rows, seed, true);
  sim.runSeed = seed;
  sim.economy.battle = BASE_START_CASH;
  return sim;
}

function runTrace(sim, maxTicks) {
  const events = [];
  const rec = (t, type, ...rest) => events.push([t, type, ...rest]);
  sim.on("enemy_spawned", (e) => rec(sim.tickIndex, "spawn", e.enemy?.kind, round(e.enemy?.pos?.x), round(e.enemy?.pos?.y)));
  sim.on("portal_moved", (e) => rec(sim.tickIndex, "portal", e.x));
  sim.on("leak", (e) => rec(sim.tickIndex, "leak", e.enemy?.kind, e.lives));
  sim.on("enemy_killed", (e) => rec(sim.tickIndex, "kill", e.enemy?.kind));
  sim.on("wave_composition", (e) => rec(sim.tickIndex, "compose", e.count, e.theme, e.event));
  sim.on("wave_cleared", (e) => rec(sim.tickIndex, "clear", e.wave));
  sim.on("game_over", () => rec(sim.tickIndex, "game_over"));
  sim.on("victory", (e) => rec(sim.tickIndex, "victory", e.wave));

  sim.startWave({ earlyBonus: 0 });
  let ticks = 0;
  while (ticks < maxTicks && sim.running) {
    sim.tick();
    ticks += 1;
  }
  return { events, ticks, sim };
}

function stateHash(sim) {
  const s = sim; // both expose the same fields (oracle mirrors)
  return JSON.stringify({
    waveIndex: s.waveIndex,
    lives: s.lives,
    battle: round(s.economy?.battle),
    portal: s.portal,
    tick: s.tickIndex,
    leaks: s.leakCount,
    kills: s.killCount,
    enemies: s.enemies.map((e) => [e.id, e.kind, round(e.pos.x), round(e.pos.y), round(e.hp)]),
    towers: s.towers.map((t) => [t.id, t.cell.x, t.cell.y]),
  });
}

const { seeds, maxTicks } = parseArgs(process.argv.slice(2));
let failures = 0;
for (const seed of seeds) {
  const oldR = runTrace(buildOracle(seed), maxTicks);
  const newR = runTrace(buildNew(seed), maxTicks);

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
    bad = `state hash differs\nalt oracle: ${hOld}\n        new: ${hNew}`;
  }

  if (bad) {
    failures++;
    console.log(`seed ${seed}: FAIL — ${bad}`);
  } else {
    console.log(
      `seed ${seed}: PASS — ${oldR.ticks}t ${oldR.events.length} events, hash ${hOld.slice(0, 24)}…`
    );
  }
}
console.log(failures === 0 ? "PARITY OK" : `${failures} seed(s) diverged`);
process.exit(failures === 0 ? 0 : 1);
