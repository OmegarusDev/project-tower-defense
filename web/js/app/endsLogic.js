/**
 * End-of-run logic — PURE over (sim, meta, …). No app, no DOM.
 *
 * Endless new personal best: double the Parts/Aether earned this run, once,
 * at death. The gain record is bumped to ×2 in place so the Fallen screen
 * shows the doubled totals while the returned bonus stays the pre-double
 * amount (the vault credit).
 */
import { RULES } from "../data/rules.js";

/** First-seal lumps. Not written into runWaveGains (that would delta-merge twice). */
export function campaignFirstClearBonus() {
  return {
    aether: RULES.FIRST_CLEAR_AETHER | 0,
    parts: RULES.FIRST_CLEAR_FORGE | 0,
  };
}

/**
 * Credit first-clear Æ/Parts onto meta. Returns the bonus, or null if this
 * was a repeat seal (or a bogus id).
 */
export function grantCampaignFirstClear(meta, { first, levelId } = {}) {
  if (!first || !(levelId > 0) || !meta) return null;
  const bonus = campaignFirstClearBonus();
  meta.aether = (meta.aether | 0) + bonus.aether;
  meta.forge = (meta.forge | 0) + bonus.parts;
  return bonus;
}
export function endBestBonus(sim, prevBest) {
  if (!sim?.state?.modeEndless) return null;
  const wave = sim.state.waves.index | 0;
  if (wave <= (prevBest | 0)) return null;
  const g = sim.state.economy.runWaveGains;
  const bonusParts = g.parts | 0;
  const bonusAether = g.aether | 0;
  if (!bonusParts && !bonusAether) return { parts: 0, aether: 0, wave };
  sim.state.economy.forge += bonusParts;
  sim.state.economy.aether += bonusAether;
  g.parts = bonusParts * 2;
  g.aether = bonusAether * 2;
  return { parts: bonusParts, aether: bonusAether, wave };
}
