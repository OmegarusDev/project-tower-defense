/**
 * Critical/High audit regression: checkpoints, meta vault, early bonus,
 * pierce, level points, level cap, Iron Guard + forgeBuys migration.
 * Run: node js/tests/auditFixes.test.mjs
 */
import { SimWorld } from "../sim/simWorld.js";
import { buildAttackPlan } from "../sim/attackPlan.js";
import { PARTS, estimateForgeBuys, MAX_ROSTER_SLOTS } from "../data/parts.js";
import {
  migrateTechRanks,
  syncTechDerived,
  livesFromIronGuardRank,
  ironGuardRankFromLives,
  respecAllTech,
  getTechNode,
} from "../data/techTree.js";
import { normalizeMeta } from "../saveStore.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function placeOpen(sim, slot = 0) {
  sim.economy.battle = 500;
  for (let y = 2; y < sim.grid.rows - 2; y++) {
    for (let x = 2; x < sim.grid.cols - 2; x++) {
      if (sim.grid.isBuildable(x, y)) {
        const res = sim.tryPlaceTower(x, y, slot);
        if (res.ok) return res.tower;
      }
    }
  }
  throw new Error("no buildable cell");
}

// ——— C1: between-wave vs in-wave continue math ———
{
  // inWave: roll back so Call restarts saved wave
  const savedWave = 4;
  const phase = "inWave";
  let waveIndex = savedWave;
  if (phase === "inWave" && savedWave > 0) waveIndex = savedWave - 1;
  assert(waveIndex === 3, "inWave continue rolls back");
  assert(waveIndex + 1 === savedWave, "Call restarts saved wave");

  // betweenWaves: keep cleared index; Call starts next
  waveIndex = 4;
  const phase2 = "betweenWaves";
  if (phase2 === "inWave" && waveIndex > 0) waveIndex -= 1;
  assert(waveIndex === 4, "betweenWaves keeps cleared wave");
  assert(waveIndex + 1 === 5, "Call starts next wave");
}

{
  const sim = new SimWorld();
  sim.setup(11, 14, 42, true);
  sim.setRoster([
    { base: "sentry", barrel: "single", payload: "kinetic", complete: true, placeCost: 20, levelCap: 1 },
  ]);
  const t = placeOpen(sim);
  sim.economy.battle = 200;
  sim.waveIndex = 3;
  sim.checkpointPhase = "betweenWaves";
  const blob = sim.checkpoint();
  assert(blob.phase === "betweenWaves", "checkpoint stores betweenWaves");
  assert(blob.towers.length === 1, "between-wave board includes towers");

  const sim2 = new SimWorld();
  sim2.loadCheckpoint(blob);
  assert(sim2.waveIndex === 3, "load keeps cleared wave");
  assert(sim2.towers.length === 1 && sim2.towers[0].base === t.base, "towers restored");
  assert(sim2.checkpointPhase === "betweenWaves", "phase restored");
}

{
  const sim = new SimWorld();
  sim.setup(11, 14, 7, true);
  sim.startWave({ earlyBonus: 0 });
  assert(sim.checkpointPhase === "inWave", "wave start → inWave");
  assert(sim.waveIndex === 1, "first wave");
  const blob = sim.checkpoint();
  assert(blob.phase === "inWave", "inWave checkpoint");
  assert(blob.earlyBonusWave === 0, "no early bonus yet");
}

// ——— C3: Call Early double-dip ———
{
  const sim = new SimWorld();
  sim.setup(11, 14, 9, true);
  sim.economy.battle = 100;
  const r1 = sim.startWave({ earlyBonus: 5 });
  assert(r1.earlyBonus === 5, "first early bonus applied");
  assert(sim.economy.battle === 105, "battle +5");
  assert(sim.earlyBonusWave === 1, "tracks claimed wave");
  const blob = sim.checkpoint();

  const sim2 = new SimWorld();
  sim2.loadCheckpoint(blob);
  // Continue mid-wave rolls back index in app; simulate that:
  sim2.waveIndex = (blob.wave | 0) - 1;
  const before = sim2.economy.battle;
  const r2 = sim2.startWave({ earlyBonus: 5 });
  assert(r2.earlyBonus === 0, "Continue + Call skips already-claimed early bonus");
  assert(sim2.economy.battle === before, "no second early Coin");
  assert(sim2.waveIndex === 1, "restarts same wave");
}

// ——— C2: delta-merge meta gains (unit of the merge math) ———
{
  const meta = { forge: 10, aether: 20 };
  const runWaveGains = { parts: 6, aether: 4 };
  let applied = { parts: 0, aether: 0 };
  // first sync
  let dP = runWaveGains.parts - applied.parts;
  let dA = runWaveGains.aether - applied.aether;
  meta.forge += dP;
  meta.aether += dA;
  applied = { ...runWaveGains };
  assert(meta.forge === 16 && meta.aether === 24, "first sync adds gains");
  // hub spend
  meta.forge -= 5;
  meta.aether -= 8;
  assert(meta.forge === 11 && meta.aether === 16, "hub spend sticks");
  // second sync with same gains must not restore spent currency
  dP = runWaveGains.parts - applied.parts;
  dA = runWaveGains.aether - applied.aether;
  if (dP > 0) meta.forge += dP;
  if (dA > 0) meta.aether += dA;
  assert(meta.forge === 11 && meta.aether === 16, "no vault clobber");
  // new wave gain
  runWaveGains.parts = 9;
  runWaveGains.aether = 4;
  dP = runWaveGains.parts - applied.parts;
  dA = runWaveGains.aether - applied.aether;
  if (dP > 0) meta.forge += dP;
  if (dA > 0) meta.aether += dA;
  applied = { parts: runWaveGains.parts, aether: runWaveGains.aether };
  assert(meta.forge === 14 && meta.aether === 16, "only new delta merges");
}

// ——— C4: rail pierce ———
{
  assert(PARTS.barrels.rail.homing === false, "rail is ballistic");
  assert((PARTS.barrels.rail.pierce | 0) >= 1, "rail has pierce");
  const plan = buildAttackPlan("sentry", "rail", "kinetic", 1);
  assert(plan.homing === false, "rail plan non-homing");
  assert(plan.pierce >= 1, "rail plan pierce");

  const sim = new SimWorld();
  sim.setup(11, 14, 11, true);
  const e1 = {
    id: 101,
    pos: { x: 5.5, y: 5.5 },
    cell: { x: 5, y: 5 },
    hp: 100,
    maxHp: 100,
    flying: false,
    resist: {},
    immune: [],
  };
  const e2 = {
    id: 102,
    pos: { x: 5.5, y: 6.2 },
    cell: { x: 5, y: 6 },
    hp: 100,
    maxHp: 100,
    flying: false,
    resist: {},
    immune: [],
  };
  sim.enemies.push(e1, e2);
  const p = {
    id: 1,
    pos: { x: 5.5, y: 5.5 },
    pierce: 1,
    hitIds: new Set(),
    damage: 10,
    damageType: "kinetic",
    aoeRadius: 0,
    status: {},
    chainJumps: 0,
    airCapable: true,
    towerId: -1,
    armorPierce: 0,
    emp: false,
  };
  const done1 = sim.combat._onHit(p, e1);
  assert(done1 === false, "first pierce hit keeps projectile");
  assert(p.pierce === 0, "pierce decremented");
  assert(e1.hp < 100, "first enemy damaged");
  const done2 = sim.combat._onHit(p, e2);
  assert(done2 === true, "pierce exhausted → despawn");
  assert(e2.hp < 100, "second enemy damaged");
  assert(sim.combat._onHit(p, e1) === false, "skip already-hit id");
}

// ——— H1: level points banked, spend via trySpendLevelPoint ———
{
  const sim = new SimWorld();
  sim.setup(11, 14, 3, true);
  sim.runLevelCap = 3;
  sim.setRoster([
    { base: "sentry", barrel: "single", payload: "kinetic", complete: true, placeCost: 20, levelCap: 3 },
  ]);
  const t = placeOpen(sim);
  assert(t.level === 1 && t.levelPoints === 0, "starts L1");
  t.xpToPoint = 5;
  for (let i = 0; i < 12; i++) sim.combat._grantXp(t, 1);
  assert(t.level === 1, "XP does not auto-level");
  assert(t.levelPoints >= 2, `banked points (got ${t.levelPoints})`);
  const r = sim.trySpendLevelPoint(t.id);
  assert(r.ok && r.level === 2, "spend point → L2");
  assert(t.levelPoints >= 1, "remainder banked");
  t.level = 3;
  t.levelPoints = 2;
  const capped = sim.trySpendLevelPoint(t.id);
  assert(!capped.ok && capped.reason === "at_cap", "respects levelCap");
}

// ——— H3: level cap starts at 1 ———
{
  assert(getTechNode("level_cap")?.maxRank === 4, "cap ranks to L5");
  const meta = { tech: {} };
  syncTechDerived(meta);
  assert(meta.levelCap === 1, "base levelCap 1");
  meta.tech.level_cap = 4;
  syncTechDerived(meta);
  assert(meta.levelCap === 5, "max levelCap 5");

  const n = normalizeMeta({ levelCap: 2, tech: {} });
  assert(n.levelCap >= 1, "clamp min 1");
  // Old save with levelCap 2 migrates to rank 1 → still 2
  const migrated = migrateTechRanks({ levelCap: 2, tech: {} });
  assert(migrated.level_cap === 1, "old cap2 → rank 1");
  const m2 = { tech: migrated };
  syncTechDerived(m2);
  assert(m2.levelCap === 2, "preserves old cap 2");

  const oldHigh = migrateTechRanks({ levelCap: 5, tech: { level_cap: 3 } });
  assert(oldHigh.level_cap === 4, "old cap5 → rank 4");
}

// ——— H2: slots → 12 ———
{
  assert(MAX_ROSTER_SLOTS === 12, "max roster 12");
  assert(getTechNode("roster_slots")?.maxRank === 9, "9 ranks → slots 4..12");
  const meta = { tech: { roster_slots: 9 } };
  syncTechDerived(meta);
  assert(meta.slotCount === 12, "rank 9 → 12 slots");
  const n = normalizeMeta({ slotCount: 12, tech: { roster_slots: 9 } });
  assert(n.slotCount === 12, "normalize allows 12");
}

// ——— H4: Iron Guard migration no demote ———
{
  assert(livesFromIronGuardRank(0) === 3, "base 3");
  assert(ironGuardRankFromLives(8, { roundUp: true }) === 3, "8 → rank 3 (10), no demote");
  assert(ironGuardRankFromLives(5, { roundUp: true }) === 1, "5 → rank 1");
  const tech = migrateTechRanks({ startLives: 8, tech: {} });
  assert(tech.lives === 3, "old 8 lives → rank 3");
  const meta = { tech };
  syncTechDerived(meta);
  assert(meta.startLives === 10, "synced lives >= old 8");

  const oldFormula = migrateTechRanks({ tech: { lives: 3 } }); // ambiguous; prefer rank if matches new ladder
  // startLives missing, old rank 3 with new ladder already at 10 — keep rank
  assert((oldFormula.lives | 0) >= 3, "keeps high iron guard rank");
}

// ——— H5: forgeBuys backfill ———
{
  const owned = {
    bases: ["sentry", "bulwark"],
    barrels: ["single", "twin"],
    payloads: ["kinetic"],
  };
  // bestWave 0: twin/bulwark not wave-gifted yet → count as forge buys
  const est = estimateForgeBuys(owned, 0);
  assert(est === 2, `estimate paid parts (got ${est})`);
  // bestWave high enough for twin+bulwark gifts → 0 forge buys
  const gifted = estimateForgeBuys(owned, 99);
  assert(gifted === 0, "wave gifts excluded from forgeBuys");

  const n = normalizeMeta({ owned, bestWave: 0, forgeBuys: 0 });
  assert(n.forgeBuys === 2, "normalize backfills forgeBuys");
}

// ——— H9: respec refunds ———
{
  const meta = { aether: 0, forge: 0, tech: { level_cap: 2, cash: 1 } };
  syncTechDerived(meta);
  const beforeCap = meta.levelCap;
  assert(beforeCap === 3, "pre-respec cap");
  const { aether } = respecAllTech(meta);
  assert(aether > 0, "refunds aether");
  assert(Object.keys(meta.tech || {}).length === 0, "ranks cleared");
  assert(meta.levelCap === 1, "cap reset to 1");
  assert(meta.aether === aether, "aether restored");
}

console.log("ALL auditFixes tests passed");
