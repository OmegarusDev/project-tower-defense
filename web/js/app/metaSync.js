/** Extracted from App — pure move, no gameplay changes. */
import { normalizeRoster } from "../data/parts.js";
import { syncTechDerived, BASE_START_LIVES } from "../data/techTree.js";
import { saveMeta } from "../saveStore.js";

export function persistMeta(app) {
  persistMetaData(app.meta);
  
}

/** Pure: normalize + persist a meta object. */
export function persistMetaData(meta) {
  meta.roster = normalizeRoster(meta.roster, meta.slotCount, meta.levelCap);
  saveMeta(meta);
}

/**
   * Apply permanent tech + Forge loadouts to a live sim.
   * `battleBase` only for fresh runs — continue keeps checkpoint Coin.
   */
export function applyRunTech(app, sim, { battleBase } = {}) {
  return applyRunTechData(app.meta, sim, { battleBase });
}

/** Pure: fresh-run sim setup — battle base + vault seed + lives refill. */
export function applyRunTechData(meta, sim, { battleBase } = {}) {
  if (battleBase != null) {
    sim.economy.battle = (battleBase | 0) + (meta.startCashBonus | 0);
  }
  syncSimFromMetaData(meta, sim, { seedVault: true, resetLives: true });
}

/**
   * Push Forge loadouts + derived combat/economy mods into the sim.
   * Does NOT touch Coin/lives unless explicitly asked — those belong to the run/checkpoint.
   */
export function syncSimFromMeta(app, sim, opts = {}) {
  return syncSimFromMetaData(app.meta, sim, opts);
}

/**
 * Pure: push Forge loadouts + derived combat/economy mods into the sim.
 * Does NOT touch Coin/lives unless explicitly asked — those belong to the
 * run/checkpoint.
 */
export function syncSimFromMetaData(meta, sim, { seedVault = false, resetLives = false } = {}) {
  if (!sim) return;
  syncTechDerived(meta);
  meta.roster = normalizeRoster(meta.roster, meta.slotCount, meta.levelCap);
  sim.setStartLives(meta.startLives || BASE_START_LIVES, { resetCurrent: resetLives });
  if (seedVault) {
    sim.economy.injectMeta(meta.forge, meta.aether);
  }
  sim.economy.applyRunMods({
    wallCostMult: meta.wallCostMult ?? 1,
    towerCostMult: meta.towerCostMult ?? 1,
    waveCoinBonus: meta.waveCoinBonus | 0,
    wavePartsBonus: meta.wavePartsBonus | 0,
  });
  sim.setSellRefundMult(meta.sellRefundMult ?? 0.5);
  sim.setRoster(structuredClone(meta.roster));
  sim.runLevelCap = meta.levelCap | 0 || 1;
  for (const t of sim.towers || []) {
    t.levelCap = Math.max(t.levelCap | 0, sim.runLevelCap);
  }
  sim.setPartUpgrades(meta.partUpgrades);
  sim.setGlobalMods({
    damage: meta.globalDamageMult ?? 1,
    range: meta.globalRangeMult ?? 1,
    rof: meta.globalRofMult ?? 1,
  });
}

export function syncMetaProgress(app) {
  // Ghost replays and editor playtests are view-only — never credit meta.
  if (app._ghost || app.playtestFromEditor) return;
  const r = mergeRunGains(app.meta, app.sim);
  persistMeta(app);
  return r;
}

/** Pure: delta-merge run gains into meta + align the sim vault. No I/O. */
export function mergeRunGains(meta, sim) {
  // Delta-merge run gains only — never clobber meta with a stale sim vault
  // (hub spends + Continue would otherwise restore spent Forge/Aether).
  const gains = sim.economy.runWaveGains || { parts: 0, aether: 0 };
  const applied = sim.metaAppliedGains || { parts: 0, aether: 0 };
  const dParts = (gains.parts | 0) - (applied.parts | 0);
  const dAether = (gains.aether | 0) - (applied.aether | 0);
  if (dParts > 0) meta.forge = (meta.forge | 0) + dParts;
  if (dAether > 0) meta.aether = (meta.aether | 0) + dAether;
  sim.metaAppliedGains = {
    parts: gains.parts | 0,
    aether: gains.aether | 0,
  };
  // Keep sim vault aligned with meta after merge (display + further clears).
  sim.economy.injectMeta(meta.forge, meta.aether);
  // Endless progress record only — no wave-gift unlocks anymore (Forge is the
  // only source of new parts). Campaign clears never touch bestWave.
  if (sim.modeEndless) {
    meta.bestWave = Math.max(meta.bestWave | 0, sim.waveIndex);
  }
  // Wave-gift unlocks were removed — always return the (empty) list so the
  // wave_cleared toast path can consume it without special-casing.
  return [];
}
