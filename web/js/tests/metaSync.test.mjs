/**
 * Meta ↔ sim merge math — pure over (meta, sim), no app/DOM.
 * Run: node js/tests/metaSync.test.mjs
 */
import { Sim } from "../sim/sim.js";
import { makeSlot, normalizeRoster } from "../data/parts.js";
import { syncTechDerived } from "../data/techTree.js";
import {
  applyRunTechData,
  syncSimFromMetaData,
  mergeRunGains,
} from "../app/metaSync.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function freshMeta(over = {}) {
  const meta = {
    aether: 7,
    forge: 9,
    forgeBuys: 0,
    slotCount: 3,
    levelCap: 1,
    startCashBonus: 0,
    startLives: 3,
    wallCostMult: 1,
    towerCostMult: 1,
    waveCoinBonus: 0,
    wavePartsBonus: 0,
    sellRefundMult: 0.5,
    owned: {
      bases: ["sentry"],
      barrels: ["single"],
      payloads: ["kinetic"],
    },
    roster: normalizeRoster([], 3, 1),
    tech: {},
    campaign: { cleared: [] },
  };
  syncTechDerived(meta);
  return { ...meta, ...over, owned: { ...meta.owned, ...(over.owned || {}) } };
}

function world() {
  const sim = new Sim();
  sim.setup(9, 8, 7, true);
  return sim;
}

// applyRunTechData: battle base + cash bonus + vault seed + lives
{
  const meta = freshMeta({ startCashBonus: 5 });
  const sim = world();
  applyRunTechData(meta, sim, { battleBase: 55 });
  assert(sim.state.economy.battle === 60, "battle = base + cash bonus");
  assert(sim.state.economy.forge === meta.forge, "vault forge seeded");
  assert(sim.state.economy.aether === meta.aether, "vault aether seeded");
  assert(sim.state.lives === meta.startLives, "lives refilled");
  assert(sim.state.roster.length === 3, "roster pushed");
}

// syncSimFromMetaData: no battle/lives touch without flags
{
  // Real tech id is `lives` (rank 2 → 7 HP per IRON_GUARD_LIVES) — a rank
  // that must actually change startLives so this block isn't vacuous.
  const meta = freshMeta({ tech: { lives: 2 } });
  syncTechDerived(meta);
  const derivedLives = meta.startLives;
  assert(derivedLives === 7, `iron-guard rank 2 derives 7 HP (got ${derivedLives})`);
  const sim = world();
  sim.setStartLives(derivedLives, { resetCurrent: true });
  sim.state.economy.battle = 123;
  sim.state.economy.forge = 0;
  sim.state.lives = 1;
  syncSimFromMetaData(meta, sim);
  assert(sim.state.economy.battle === 123, "battle untouched without seedVault");
  assert(sim.state.lives === 1, "lives untouched without resetLives");
  sim.state.economy.battle = 99;
  syncSimFromMetaData(meta, sim, { seedVault: true, resetLives: true });
  assert(sim.state.economy.forge === meta.forge, "vault injected");
  assert(sim.state.lives === derivedLives, "lives refilled to the derived budget");
  assert(sim.state.runLevelCap === meta.levelCap, "levelCap pushed");
}

// Run mods + roster caps pushed (mods are tech-derived via syncTechDerived)
{
  const meta = freshMeta({ tech: { level_cap: 3, forge_cut: 2 } });
  syncTechDerived(meta);
  const sim = world();
  syncSimFromMetaData(meta, sim);
  assert(sim.state.economy.towerCostMult === 0.8, "bargainer mult pushed");
  assert(sim.state.runLevelCap === meta.levelCap, "runLevelCap pushed");
}

// syncMetaProgressData: delta-merge only, vault aligned, best wave recorded
{
  const meta = freshMeta({ forge: 10, aether: 20 });
  const sim = world();
  sim.state.modeEndless = true;
  sim.state.waves.index = 6;
  sim.state.economy.runWaveGains.parts = 6;
  sim.state.economy.runWaveGains.aether = 4;
  sim.state.economy.forge = 10;
  sim.state.economy.aether = 20;
  const appStub = { _ghost: false, playtestFromEditor: false };
  const r = mergeRunGains(meta, sim);
  assert(Array.isArray(r) && r.length === 0, "returns empty unlock list");
  assert(meta.forge === 16, "parts merged");
  assert(meta.aether === 24, "aether merged");
  assert(meta.bestWave === 6, "best wave recorded");
  assert(sim.state.economy.forge === meta.forge, "sim vault aligned after merge");
  // second call merges nothing (already applied)
  const r2 = mergeRunGains(meta, sim);
  assert(meta.forge === 16 && r2.length === 0, "no double-merge");
}

console.log("ALL metaSync tests passed");
