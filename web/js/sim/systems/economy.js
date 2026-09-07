/**
 * Economy — math/rounding helpers over the state's plain economy object.
 * Rounding mode and operation order are pinned by unit tests.
 */

import { PARTS } from "../../data/parts.js";
import { RULES } from "../../data/rules.js";

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

const PART_KEYS = [
  ["base", "bases"],
  ["barrel", "barrels"],
  ["payload", "payloads"],
];

/** How many placed towers already use this part id on this axis. */
export function countPartCopies(towers, key, id) {
  if (!id) return 0;
  let n = 0;
  for (const t of towers || []) {
    if (t[key] === id) n += 1;
  }
  return n;
}

/** Coin tax for one part given copies already on the board. First copy is free. */
export function partCopySurcharge(partCost, copiesOnBoard, rate = RULES.PART_COPY_TAX) {
  if (copiesOnBoard <= 0 || partCost <= 0) return 0;
  return Math.floor(partCost * rate * copiesOnBoard);
}

/**
 * Quote a triad against the live board. Tax is per part, counted across
 * every placed tower that shares that base / barrel / payload — so slot 2's
 * Sentry gets more expensive when slot 1 already planted Sentries.
 */
export function quoteTowerPlace(eco, triad, towers = []) {
  let base = 0;
  let surcharge = 0;
  for (const [key, table] of PART_KEYS) {
    const id = triad?.[key];
    const raw = (id && PARTS[table][id]?.cost) || 0;
    const cost = raw > 0 ? towerCost(eco, raw) : 0;
    base += cost;
    surcharge += partCopySurcharge(cost, countPartCopies(towers, key, id));
  }
  return { base, surcharge, total: base + surcharge };
}

/** @deprecated use quoteTowerPlace; kept as the tax half for tests. */
export function placeSurcharge(eco, triad, towers = []) {
  return quoteTowerPlace(eco, triad, towers).surcharge;
}

export function spendBattle(eco, n) {
  if (eco.battle < n) return false;
  eco.battle -= n;
  return true;
}

export function addBattle(eco, n) {
  eco.battle += n;
}

export function addForge(eco, n) {
  const amt = n | 0;
  if (amt <= 0) return 0;
  eco.forge += amt;
  eco.runWaveGains.parts += amt;
  return amt;
}

/** Per-wave-clear payouts (Coin always; Parts every 3rd; Aether every 5th). */
export function applyWaveClear(eco, wave) {
  const w = Math.max(1, wave | 0);
  const coin = 10 + (w - 1) + (eco.waveCoinBonus | 0);
  const partsBase = w % 3 === 0 ? 3 + Math.floor(w / 3) : 0;
  const parts = partsBase > 0 ? partsBase + (eco.wavePartsBonus | 0) : 0;
  const aether = w % 5 === 0 ? 2 + Math.floor(w / 5) : 0;
  if (coin) addBattle(eco, coin);
  if (parts) addForge(eco, parts);
  if (aether) {
    eco.aether += aether;
    eco.runWaveGains.aether += aether;
  }
  eco.runWaveGains.coin += coin;
  return { coin, parts, aether };
}
