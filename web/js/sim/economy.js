/**
 * Wave-clear payouts (wave is 1-indexed).
 * Coin — every wave, starts at 10 and scales up (+ optional tech Spoils).
 * Parts — every 3rd wave.
 * Aether — every 5th wave.
 */
export function waveClearRewards(wave, coinBonus = 0) {
  const w = Math.max(1, wave | 0);
  const coin = 10 + (w - 1) + (coinBonus | 0);
  const parts = w % 3 === 0 ? 3 + Math.floor(w / 3) : 0;
  const aether = w % 5 === 0 ? 2 + Math.floor(w / 5) : 0;
  return { coin, parts, aether };
}

export class Economy {
  constructor() {
    this.battle = 115;
    this.forge = 0;
    this.aether = 0;
    this.wallBase = 12;
    this.wallStep = 5;
    this.wallCostMult = 1;
    this.towerCostMult = 1;
    this.waveCoinBonus = 0;
    /** Meta currencies + clear-coin earned from wave clears this run. */
    this.runWaveGains = { coin: 0, parts: 0, aether: 0 };
  }

  injectMeta(forge, aether) {
    this.forge = forge | 0;
    this.aether = aether | 0;
  }

  /** Permanent economy tech for this run. */
  applyRunMods({ wallCostMult = 1, towerCostMult = 1, waveCoinBonus = 0 } = {}) {
    this.wallCostMult = wallCostMult > 0 ? wallCostMult : 1;
    this.towerCostMult = towerCostMult > 0 ? towerCostMult : 1;
    this.waveCoinBonus = waveCoinBonus | 0;
  }

  /** Bargainer applies here — Coin to place towers, not Forge unlocks. */
  towerCost(baseCost) {
    return Math.max(1, Math.round(baseCost * this.towerCostMult));
  }

  resetRunGains() {
    this.runWaveGains = { coin: 0, parts: 0, aether: 0 };
  }

  wallCost(owned) {
    const raw = this.wallBase + this.wallStep * owned;
    return Math.max(1, Math.round(raw * this.wallCostMult));
  }

  /** Extra Coin as the board fills — first two towers free of tax. */
  placeSurcharge(baseCost, towerCount) {
    if (towerCount < 2) return 0;
    return Math.floor(baseCost * 0.08 * (towerCount - 1));
  }

  spendBattle(n) {
    if (this.battle < n) return false;
    this.battle -= n;
    return true;
  }

  addBattle(n) {
    this.battle += n;
  }

  /** Apply clear rewards; returns the payout used. */
  applyWaveClear(wave) {
    const r = waveClearRewards(wave, this.waveCoinBonus);
    if (r.coin) this.addBattle(r.coin);
    if (r.parts) this.forge += r.parts;
    if (r.aether) this.aether += r.aether;
    this.runWaveGains.coin += r.coin;
    this.runWaveGains.parts += r.parts;
    this.runWaveGains.aether += r.aether;
    return r;
  }
}
