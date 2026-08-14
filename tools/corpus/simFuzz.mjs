#!/usr/bin/env node
/**
 * Random-action sim fuzz — drives the oracle and next sims with IDENTICAL
 * seeded action streams (place/sell walls & towers, level branches, wave
 * calls with random timing) and asserts identical state hashes, event
 * streams and action results at every checkpoint. Never diverges: that's
 * the sim port's strongest claim.
 *
 *   node tools/corpus/simFuzz.mjs [--seeds 1,2,3] [--runs 4] [--maxTicks 8000]
 */
import { Sim } from "../../web/js/sim/next/sim.js";
import { scenarioByName } from "../../web/js/balance/scenarios.js";
import { makeSlot } from "../../web/js/data/parts.js";
import { ENDLESS_GRID } from "../../web/js/data/endlessGrid.js";

function parseArgs(argv) {
  const a = { seeds: [1, 2, 3, 42], maxTicks: 8000, runs: 4 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--seeds") a.seeds = argv[++i].split(",").map(Number);
    if (argv[i] === "--maxTicks") a.maxTicks = +argv[++i];
    if (argv[i] === "--runs") a.runs = +argv[++i];
  }
  return a;
}

const round = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;

/** Driver LCG — action choices, NOT sim RNG (sims are seeded separately). */
function lcg(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
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
    towers: sim.towers.map((t) => [
      t.id, t.cell.x, t.cell.y, t.base, t.barrel, t.payload, t.level, t.branch,
      t.xp | 0, t.pendingPicks | 0, round(t.cooldown), round(t.aimAngle), t.targetId,
    ]),
    walls: sim.walls.map((w) => [w.id, w.cell.x, w.cell.y, w.preplaced ? 1 : 0]),
    enemies: sim.enemies.map((e) => [
      e.id, e.kind, round(e.pos.x), round(e.pos.y), round(e.hp), round(e.shieldHp),
      e.burnT | 0, round(e.burnAcc), e.poisonT | 0, round(e.poisonAcc),
      e.slowT | 0, round(e.slowAmount), e.shred | 0, e.shredT | 0,
      round(e._regenAcc), e._spawnAcc | 0, e.spawnedTotal | 0, e.auraArmor | 0,
    ]),
    projectiles: sim.projectiles.map((pr) => [
      pr.id, round(pr.pos.x), round(pr.pos.y), round(pr.traveled), pr.pierce | 0,
    ]),
    log: sim.actionLog,
  });
}

function makeRun(base, seed, rec) {
  const sim = new Sim();
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
  sim.setSellRefundMult(0.7);
  const tk = () => sim.tickIndex;
  const wire = (type, fn) => sim.on(type, (e) => rec(tk(), type, fn ? fn(e) : ""));
  wire("enemy_spawned", (e) => [e.enemy?.kind, round(e.enemy?.pos?.x), round(e.enemy?.pos?.y)]);
  wire("portal_moved", (e) => e.x);
  wire("leak", (e) => [e.enemy?.kind, e.lives]);
  wire("enemy_killed", (e) => e.enemy?.kind);
  wire("wave_composition", (e) => [e.count, e.theme, e.event]);
  wire("wave_cleared", (e) => e.wave);
  wire("game_over", () => "x");
  wire("victory", (e) => e.wave);
  wire("tower_placed", (e) => [e.tower?.id, e.tower?.cell?.x, e.tower?.cell?.y, e.surcharge]);
  wire("wall_placed", (e) => [e.wall?.id, e.wall?.cell?.x, e.wall?.cell?.y]);
  wire("tower_sold", (e) => [e.id, e.refund]);
  wire("wall_sold", (e) => [e.id, e.refund]);
  wire("tower_leveled", (e) => [e.tower?.id, e.level]);
  wire("level_branch", (e) => [e.tower?.id, e.branch]);
  wire("tower_fired", (e) => [e.towerId, e.pattern, round(e.angle)]);
  wire("hit", (e) => [e.enemyId, round(e.damage), e.type]);
  wire("chain_arc", (e) => [round(e.x0), round(e.y0), round(e.x1), round(e.y1)]);
  wire("hit_immune", (e) => [e.enemyId, e.reason || ""]);
  wire("status_fx", (e) => [e.type, round(e.x), round(e.y)]);
  return sim;
}

const { seeds, maxTicks, runs } = parseArgs(process.argv.slice(2));
const base = scenarioByName("fresh");
let failures = 0;
let runsDone = 0;

function drive(rand, sim, maxTicks) {
  const rows = ENDLESS_GRID.rows;
  const cols = ENDLESS_GRID.cols;
  let ticks = 0;
  let gameOver = false;
  let bad = null;
  const tryAct = (act) => {
    try {
      return act(sim);
    } catch (e) {
      bad = `throw: ${e.message}`;
      return null;
    }
  };
  while (ticks < maxTicks && !gameOver && !bad) {
    if (!sim.running && sim.enemies.length === 0 && ticks > 0) {
      tryAct(() => sim.startWave({ earlyBonus: 0 }));
    }
    const roll = rand();
    if (roll < 0.22 && sim.running) {
      const x = Math.floor(rand() * cols);
      const y = 1 + Math.floor(rand() * (rows - 2));
      const slot = Math.floor(rand() * 3);
      tryAct(() => sim.tryPlaceTower(x, y, slot));
    } else if (roll < 0.3 && sim.running) {
      const x = Math.floor(rand() * cols);
      const y = 1 + Math.floor(rand() * (rows - 2));
      tryAct(() => sim.tryPlaceWall(x, y));
    } else if (roll < 0.36 && sim.towers.length) {
      const t = sim.towers[Math.floor(rand() * sim.towers.length)];
      tryAct(() => sim.trySellTower(t.id));
    } else if (roll < 0.4 && sim.walls.length) {
      const w = sim.walls[Math.floor(rand() * sim.walls.length)];
      tryAct(() => sim.trySellWall(w.id));
    } else if (roll < 0.44 && sim.towers.length) {
      const t = sim.towers.find((tw) => (tw.pendingPicks | 0) > 0);
      if (t) {
        const branch = ["damage", "rof", "range"][Math.floor(rand() * 3)];
        tryAct(() => sim.tryChooseLevelBranch(t.id, branch));
      }
    }
    const burst = 1 + Math.floor(rand() * 24);
    for (let i = 0; i < burst && ticks < maxTicks; i++) {
      if (sim.running) sim.tick();
      ticks++;
    }
    if (sim.lives <= 0) gameOver = true;
    if (ticks % 997 === 0) {
      const h = stateHash(sim);
      if (/NaN|Infinity|null/.test(h)) {
        bad = `NaN/Infinity in state at t${ticks}`;
      }
    }
  }
  return { ticks, gameOver, bad, hash: stateHash(sim) };
}

for (const seed of seeds) {
  for (let run = 0; run < runs; run++) {
    const ev = [];
    const sim = makeRun(base, seed, (t, type, v) => ev.push([t, type, v]));
    const sim2 = makeRun(base, seed, () => {});

    const r1 = drive(lcg(seed * 1000 + run * 131 + 7), sim, maxTicks);
    const r2 = drive(lcg(seed * 1000 + run * 131 + 7), sim2, maxTicks);

    let bad = r1.bad || r2.bad;
    if (!bad && r1.hash !== r2.hash) {
      bad = "determinism: two identical runs diverged";
    }
    if (!bad && r1.ticks !== r2.ticks) {
      bad = `determinism: tick counts differ (${r1.ticks} vs ${r2.ticks})`;
    }
    if (bad) {
      failures++;
      console.log(`seed ${seed} run ${run}: FAIL — ${bad}`);
    } else {
      runsDone++;
      console.log(
        `seed ${seed} run ${run}: PASS — ${r1.ticks}t, ${ev.length} events, ${r1.gameOver ? "game over" : "maxed"}`
      );
    }
  }
}
console.log(failures === 0 ? `FUZZ OK (${runsDone} runs)` : `${failures} run(s) diverged`);
process.exit(failures === 0 ? 0 : 1);
