/** Extracted from App — pure move, no gameplay changes. */
import { normalizeRoster } from "../data/parts.js";
import { syncTechDerived, BASE_START_LIVES } from "../data/techTree.js";
import { saveMeta } from "../saveStore.js";

export function persistMeta(app) {
  app.meta.roster = normalizeRoster(
    app.meta.roster,
    app.meta.slotCount,
    app.meta.levelCap
  );
  saveMeta(app.meta);
  
}

/**
   * Apply permanent tech + Forge loadouts to a live sim.
   * `battleBase` only for fresh runs — continue keeps checkpoint Coin.
   */
export function applyRunTech(app, sim, { battleBase } = {}) {
  if (battleBase != null) {
    sim.economy.battle = (battleBase | 0) + (app.meta.startCashBonus | 0);
  }
  // Fresh run: seed vault currencies + refill lives from tech.
  syncSimFromMeta(app, sim, { seedVault: true, resetLives: true });
  
}

/**
   * Push Forge loadouts + derived combat/economy mods into the sim.
   * Does NOT touch Coin/lives unless explicitly asked — those belong to the run/checkpoint.
   */
export function syncSimFromMeta(app, sim, { seedVault = false, resetLives = false } = {}) {
  if (!sim) return;
  syncTechDerived(app.meta);
  app.meta.roster = normalizeRoster(
    app.meta.roster,
    app.meta.slotCount,
    app.meta.levelCap
  );
  sim.setStartLives(app.meta.startLives || BASE_START_LIVES, { resetCurrent: resetLives });
  if (seedVault) {
    sim.economy.injectMeta(app.meta.forge, app.meta.aether);
  }
  sim.economy.applyRunMods({
    wallCostMult: app.meta.wallCostMult ?? 1,
    towerCostMult: app.meta.towerCostMult ?? 1,
    waveCoinBonus: app.meta.waveCoinBonus | 0,
    wavePartsBonus: app.meta.wavePartsBonus | 0,
  });
  sim.setSellRefundMult(app.meta.sellRefundMult ?? 0.5);
  sim.setRoster(structuredClone(app.meta.roster));
  sim.runLevelCap = app.meta.levelCap | 0 || 1;
  for (const t of sim.towers || []) {
    t.levelCap = Math.max(t.levelCap | 0, sim.runLevelCap);
  }
  sim.setPartUpgrades(app.meta.partUpgrades);
  sim.setGlobalMods({
    damage: app.meta.globalDamageMult ?? 1,
    range: app.meta.globalRangeMult ?? 1,
    rof: app.meta.globalRofMult ?? 1,
  });
  
}

export function syncMetaProgress(app) {
  // Ghost replays and editor playtests are view-only — never credit meta.
  if (app._ghost || app.playtestFromEditor) return;
  // Delta-merge run gains only — never clobber meta with a stale sim vault
  // (hub spends + Continue would otherwise restore spent Forge/Aether).
  const gains = app.sim.economy.runWaveGains || { parts: 0, aether: 0 };
  const applied = app.sim.metaAppliedGains || { parts: 0, aether: 0 };
  const dParts = (gains.parts | 0) - (applied.parts | 0);
  const dAether = (gains.aether | 0) - (applied.aether | 0);
  if (dParts > 0) app.meta.forge = (app.meta.forge | 0) + dParts;
  if (dAether > 0) app.meta.aether = (app.meta.aether | 0) + dAether;
  app.sim.metaAppliedGains = {
    parts: gains.parts | 0,
    aether: gains.aether | 0,
  };
  // Keep sim vault aligned with meta after merge (display + further clears).
  app.sim.economy.injectMeta(app.meta.forge, app.meta.aether);
  // Endless progress record only — no wave-gift unlocks anymore (Forge is the
  // only source of new parts). Campaign clears never touch bestWave.
  if (app.sim.modeEndless) {
    app.meta.bestWave = Math.max(app.meta.bestWave | 0, app.sim.waveIndex);
  }
  persistMeta(app);
  // Wave-gift unlocks were removed — always return the (empty) list so the
  // wave_cleared toast path can consume it without special-casing.
  return [];
}
