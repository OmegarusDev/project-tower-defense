/**
 * Economy — math/rounding helpers over the state's plain economy object.
 * Rounding mode and operation order are pinned by unit tests.
 */

export function makeEconomy(battle = 0) {
  return {
    battle,
    forge: 0,
    aether: 0,
    runWaveGains: { coin: 0, parts: 0, aether: 0 },
    wallBase: 12,
    wallStep: 5,
    wallCostMult: 1,
    towerCostMult: 1,
    waveCoinBonus: 0,
    wavePartsBonus: 0,
    sellRefundMult: 0.5,
  };
}

export function injectMeta(eco, forge, aether) {
  eco.forge = forge | 0;
  eco.aether = aether | 0;
}

export function applyRunMods(eco, { wallCostMult = 1, towerCostMult = 1, waveCoinBonus = 0, wavePartsBonus = 0 } = {}) {
  eco.wallCostMult = wallCostMult > 0 ? wallCostMult : 1;
  eco.towerCostMult = towerCostMult > 0 ? towerCostMult : 1;
  eco.waveCoinBonus = waveCoinBonus | 0;
  eco.wavePartsBonus = wavePartsBonus | 0;
}

export function resetRunGains(eco) {
  eco.runWaveGains = { coin: 0, parts: 0, aether: 0 };
}

export function towerCost(eco, baseCost) {
  return Math.max(1, Math.round(baseCost * eco.towerCostMult));
}

export function wallCost(eco, owned) {
  const raw = eco.wallBase + eco.wallStep * owned;
  return Math.max(1, Math.round(raw * eco.wallCostMult));
}

export function placeSurcharge(eco, baseCost, towerCount) {
  if (towerCount < 2) return 0;
  return Math.floor(baseCost * 0.08 * (towerCount - 1));
}

export function quoteTowerPlace(eco, placeCost, towerCount) {
  const base = towerCost(eco, placeCost);
  const surcharge = placeSurcharge(eco, base, towerCount);
  return { base, surcharge, total: base + surcharge };
}

export function spendBattle(eco, n) {
  if (eco.battle < n) return false;
  eco.battle -= n;
  return true;
}

export function addBattle(eco, n) {
  eco.battle += n;
}

/** Per-wave-clear payouts (Coin always; Parts every 3rd; Aether every 5th). */
export function applyWaveClear(eco, wave) {
  const w = Math.max(1, wave | 0);
  const coin = 10 + (w - 1) + (eco.waveCoinBonus | 0);
  const partsBase = w % 3 === 0 ? 3 + Math.floor(w / 3) : 0;
  const parts = partsBase > 0 ? partsBase + (eco.wavePartsBonus | 0) : 0;
  const aether = w % 5 === 0 ? 2 + Math.floor(w / 5) : 0;
  if (coin) addBattle(eco, coin);
  if (parts) eco.forge += parts;
  if (aether) eco.aether += aether;
  eco.runWaveGains.coin += coin;
  eco.runWaveGains.parts += parts;
  eco.runWaveGains.aether += aether;
  return { coin, parts, aether };
}
