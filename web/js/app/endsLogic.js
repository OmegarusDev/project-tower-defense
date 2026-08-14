/**
 * End-of-run logic — PURE over (sim, meta, …). No app, no DOM.
 *
 * Endless new personal best: double the Parts/Aether earned this run, once,
 * at death. The gain record is bumped to ×2 in place so the Fallen screen
 * shows the doubled totals while the returned bonus stays the pre-double
 * amount (the vault credit).
 */
export function endBestBonus(sim, prevBest) {
  if (!sim?.modeEndless) return null;
  const wave = sim.waveIndex | 0;
  if (wave <= (prevBest | 0)) return null;
  const g = sim.economy.runWaveGains;
  const bonusParts = g.parts | 0;
  const bonusAether = g.aether | 0;
  if (!bonusParts && !bonusAether) return { parts: 0, aether: 0, wave };
  sim.economy.forge += bonusParts;
  sim.economy.aether += bonusAether;
  g.parts = bonusParts * 2;
  g.aether = bonusAether * 2;
  return { parts: bonusParts, aether: bonusAether, wave };
}
