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
import { SimWorld } from "../../web/js/sim/simWorld.js";
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

function makeRun(ctor, base, seed, rec) {
  const sim = new ctor();
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

for (const seed of seeds) {
  for (let run = 0; run < runs; run++) {
    const rand = lcg(seed * 1000 + run * 131 + 7);
    const evO = [];
    const evN = [];
    const o = makeRun(SimWorld, base, seed, (t, type, v) => evO.push([t, type, v]));
    const n = makeRun(Sim, base, seed, (t, type, v) => evN.push([t, type, v]));

    const rows = ENDLESS_GRID.rows;
    const cols = ENDLESS_GRID.cols;
    let bad = null;
    let ticks = 0;
    let gameOver = false;
    let evPtr = 0;

    const checkpoint = (at) => {
      if (bad) return;
      const hO = stateHash(o);
      const hN = stateHash(n);
      if (hO !== hN) {
        bad = `state hash diverged at ${at}\n  oracle: ${hO}\n  next:   ${hN}`;
        return;
      }
      const m = Math.min(evO.length, evN.length);
      for (let i = evPtr; i < m; i++) {
        const a = JSON.stringify(evO[i]);
        const b = JSON.stringify(evN[i]);
        if (a !== b) {
          bad = `event ${i} at ${at}: oracle ${a} vs next ${b}`;
          return;
        }
      }
      if (evO.length !== evN.length) {
        bad = `event count at ${at}: oracle ${evO.length} vs next ${evN.length}`;
        return;
      }
      evPtr = evO.length;
    };

    const tryAct = (fa, fb) => {
      let ro = null;
      let rn = null;
      try {
        ro = fa(o);
      } catch (e) {
        ro = { threw: e.message };
      }
      try {
        rn = fb(n);
      } catch (e) {
        rn = { threw: e.message };
      }
      if (JSON.stringify(ro) !== JSON.stringify(rn)) {
        bad = `action result diverge: oracle ${JSON.stringify(ro)} vs next ${JSON.stringify(rn)}`;
      }
    };

    try {
      while (ticks < maxTicks && !gameOver && !bad) {
        const idle = !o.running && o.enemies.length === 0;
        if (idle && ticks > 0) {
          tryAct(() => o.startWave({ earlyBonus: 0 }), () => n.startWave({ earlyBonus: 0 }));
        }
        const roll = rand();
        if (roll < 0.22 && o.running) {
          const x = Math.floor(rand() * cols);
          const y = 1 + Math.floor(rand() * (rows - 2));
          const slot = Math.floor(rand() * 3);
          tryAct(() => o.tryPlaceTower(x, y, slot), () => n.tryPlaceTower(x, y, slot));
        } else if (roll < 0.3 && o.running) {
          const x = Math.floor(rand() * cols);
          const y = 1 + Math.floor(rand() * (rows - 2));
          tryAct(() => o.tryPlaceWall(x, y), () => n.tryPlaceWall(x, y));
        } else if (roll < 0.36 && o.towers.length) {
          const t = o.towers[Math.floor(rand() * o.towers.length)];
          tryAct(() => o.trySellTower(t.id), () => n.trySellTower(t.id));
        } else if (roll < 0.4 && o.walls.length) {
          const w = o.walls[Math.floor(rand() * o.walls.length)];
          tryAct(() => o.trySellWall(w.id), () => n.trySellWall(w.id));
        } else if (roll < 0.44 && o.towers.length) {
          const t = o.towers.find((tw) => (tw.pendingPicks | 0) > 0);
          if (t) {
            const branch = ["damage", "rof", "range"][Math.floor(rand() * 3)];
            tryAct(() => o.tryChooseLevelBranch(t.id, branch), () => n.tryChooseLevelBranch(t.id, branch));
          }
        }
        const burst = 1 + Math.floor(rand() * 24);
        for (let i = 0; i < burst && ticks < maxTicks; i++) {
          if (o.running) o.tick();
          if (n.running) n.tick();
          ticks++;
        }
        if (o.lives <= 0) gameOver = true;
        checkpoint(`t${ticks}`);
      }
    } catch (e) {
      bad = `throw: ${e.message}`;
    }

    if (!bad && (o.lives <= 0) !== (n.lives <= 0)) {
      bad = `outcome diverge: oracle lives ${o.lives} vs next ${n.lives}`;
    }
    if (!bad && (o.lives <= 0) && !gameOver) {
      bad = "oracle ended, loop continued";
    }
    if (bad) {
      failures++;
      console.log(`seed ${seed} run ${run}: FAIL — ${bad}`);
    } else {
      runsDone++;
      console.log(
        `seed ${seed} run ${run}: PASS — ${ticks}t, ${evO.length} events, ${o.lives <= 0 ? "game over" : "maxed"}`
      );
    }
  }
}
console.log(failures === 0 ? `FUZZ OK (${runsDone} runs)` : `${failures} run(s) diverged`);
process.exit(failures === 0 ? 0 : 1);
