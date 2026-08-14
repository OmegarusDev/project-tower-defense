/**
 * the Cinder archetypes — Vein Claim reclaimers.
 * Stats are base values; WaveManager scales HP (and endless speed) by wave.
 *
 * armorKind: none | plate | insulated | energy
 * ballast: low | mid | high — frost vs pressure coupling
 * pathing: shortest (pure exit pursuit — basic tiers, tanks, boss)
 *        | evade (tower-aware: walks the far flank — the skulk, volt ward)
 *        The only consumer is movement.js's PATHING table — see boardGrid
 *        groundOptions for the cost modes.
 */

export const ENEMY_KINDS = {
  mite: {
    label: "Rivet Mite",
    pathing: "shortest",
    hp: 26,
    speed: 0.62,
    leakDamage: 1,
    battleDrop: 2,
    armorKind: "none",
    ballast: "mid",
    silhouette: "mite",
  },
  courier: {
    label: "Lash Courier",
    pathing: "shortest",
    hp: 12,
    speed: 1.95,
    leakDamage: 1,
    battleDrop: 2,
    armorKind: "none",
    ballast: "low",
    silhouette: "courier",
  },
  hauler: {
    label: "Slab Hauler",
    pathing: "shortest",
    hp: 88,
    speed: 0.32,
    leakDamage: 2,
    battleDrop: 3,
    armorFlat: 4,
    armorKind: "plate",
    ballast: "high",
    resist: { fire: 0.55 },
    silhouette: "hauler",
  },
  hauler_ceramite: {
    label: "Ceramite Hauler",
    pathing: "shortest",
    hp: 92,
    speed: 0.3,
    leakDamage: 2,
    battleDrop: 4,
    armorFlat: 4,
    armorKind: "insulated",
    ballast: "high",
    resist: { fire: 0.55, shock: 0.65 },
    silhouette: "hauler",
  },
  duct: {
    label: "Duct Hover",
    pathing: "shortest",
    hp: 20,
    speed: 1.15,
    flying: true,
    leakDamage: 1,
    battleDrop: 2,
    armorKind: "none",
    ballast: "low",
    silhouette: "duct",
  },
  ward: {
    label: "Ward Shell",
    pathing: "shortest",
    hp: 38,
    speed: 0.52,
    shieldHp: 28,
    armorFlat: 2,
    armorKind: "plate",
    ballast: "high",
    resist: { kinetic: 0.25, fire: 0.4 },
    aura: { armor: 1, radius: 1.6 },
    leakDamage: 2,
    battleDrop: 3,
    silhouette: "ward",
  },
  ward_volt: {
    label: "Volt Ward",
    pathing: "evade",
    hp: 42,
    speed: 0.5,
    shieldHp: 36,
    armorFlat: 1,
    armorKind: "energy",
    energyBlock: true,
    ballast: "high",
    resist: { fire: 0.7, shock: 0.7 },
    leakDamage: 2,
    battleDrop: 4,
    silhouette: "ward",
  },
  cask: {
    label: "Nest Cask",
    pathing: "shortest",
    hp: 48,
    speed: 0.58,
    splitsInto: 2,
    splitKind: "mite",
    leakDamage: 2,
    battleDrop: 3,
    armorKind: "none",
    ballast: "mid",
    silhouette: "cask",
  },
  phantom: {
    label: "Ash Phantom",
    pathing: "shortest",
    hp: 11,
    speed: 1.42,
    flying: true,
    resist: { frost: 0.4 },
    leakDamage: 1,
    battleDrop: 2,
    armorKind: "none",
    ballast: "low",
    silhouette: "phantom",
  },
  kiln: {
    label: "Kiln Walker",
    pathing: "shortest",
    hp: 70,
    speed: 0.38,
    resist: { fire: 0.7 },
    armorFlat: 2,
    armorKind: "plate",
    ballast: "high",
    spawns: 4,
    spawnEvery: 7,
    spawnKind: "mite",
    leakDamage: 2,
    battleDrop: 4,
    silhouette: "kiln",
  },
  siphon: {
    label: "Siphon Tick",
    pathing: "shortest",
    hp: 72,
    speed: 0.55,
    regen: 2.8,
    leakDamage: 2,
    battleDrop: 3,
    armorKind: "none",
    ballast: "mid",
    silhouette: "siphon",
  },
  claim: {
    label: "Claim Engine",
    pathing: "shortest",
    hp: 300,
    speed: 0.28,
    armorFlat: 6,
    armorKind: "plate",
    ballast: "high",
    resist: { fire: 0.35, poison: 0.3 },
    leakDamage: 5,
    battleDrop: 16,
    boss: true,
    silhouette: "claim",
  },
  skulk: {
    label: "Vein Skulk",
    pathing: "evade",
    hp: 55,
    speed: 0.6,
    leakDamage: 1,
    battleDrop: 3,
    armorKind: "none",
    ballast: "mid",
    silhouette: "skulk",
  },
};

/** Legacy + paper-TD ids → the Cinder kinds. */
const ENEMY_ALIASES = {
  // paper / early web
  basic: "mite",
  grub: "mite",
  heavy: "hauler",
  plate: "hauler",
  fast: "courier",
  runner: "courier",
  flying: "duct",
  skiff: "duct",
  shielded: "ward",
  aegis: "ward",
  splitter: "cask",
  cluster: "cask",
  boss: "claim",
  overlord: "claim",
  wraith: "phantom",
  furnace: "kiln",
  leech: "siphon",
};

export function resolveEnemyKind(id) {
  const k = ENEMY_ALIASES[id] || id;
  return ENEMY_KINDS[k] ? k : "mite";
}

export function enemyDef(id) {
  return ENEMY_KINDS[resolveEnemyKind(id)] || ENEMY_KINDS.mite;
}

/** Relative budget cost for endless pack building. */
export const ENEMY_COST = {
  mite: 1,
  courier: 1.05,
  hauler: 2.5,
  hauler_ceramite: 2.9,
  duct: 1.35,
  ward: 2.6,
  ward_volt: 2.8,
  cask: 2.0,
  phantom: 1.45,
  kiln: 2.9,
  siphon: 2.15,
  skulk: 3.2,
  claim: 8.5,
};

/** Frost potency multiplier by ballast (applied when moving). */
export function ballastSlowFactor(ballast) {
  if (ballast === "low") return 1.2;
  if (ballast === "high") return 0.5;
  return 1;
}

/** Pulse / launcher pressure multiplier by ballast. */
export function ballastPressureFactor(ballast) {
  if (ballast === "low") return 0.72;
  if (ballast === "high") return 1.28;
  return 1;
}

export function isConductive(e) {
  const kind = e?.armorKind || "none";
  return kind === "plate";
}
