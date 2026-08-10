/**
 * Enemy archetypes — industrial invaders.
 * Stats are base values; WaveManager scales HP by wave.
 */

export const ENEMY_KINDS = {
  grub: {
    label: "Grub",
    hp: 28,
    speed: 0.88,
    leakDamage: 1,
    battleDrop: 2,
    silhouette: "grub",
  },
  runner: {
    label: "Runner",
    hp: 15,
    speed: 1.62,
    leakDamage: 1,
    battleDrop: 2,
    silhouette: "runner",
  },
  plate: {
    label: "Plate",
    hp: 78,
    speed: 0.4,
    leakDamage: 2,
    battleDrop: 3,
    armorFlat: 3,
    silhouette: "plate",
  },
  skiff: {
    label: "Skiff",
    hp: 22,
    speed: 1.05,
    flying: true,
    leakDamage: 1,
    battleDrop: 2,
    silhouette: "skiff",
  },
  aegis: {
    label: "Aegis",
    hp: 36,
    speed: 0.66,
    shieldHp: 26,
    armorFlat: 1,
    resist: { kinetic: 0.3 },
    leakDamage: 2,
    battleDrop: 3,
    silhouette: "aegis",
  },
  cluster: {
    label: "Cluster",
    hp: 46,
    speed: 0.7,
    splitsInto: 2,
    splitKind: "grub",
    leakDamage: 2,
    battleDrop: 3,
    silhouette: "cluster",
  },
  wraith: {
    label: "Wraith",
    hp: 13,
    speed: 1.28,
    flying: true,
    resist: { frost: 0.45 },
    leakDamage: 1,
    battleDrop: 2,
    silhouette: "wraith",
  },
  furnace: {
    label: "Furnace",
    hp: 55,
    speed: 0.52,
    resist: { fire: 0.55 },
    armorFlat: 1,
    leakDamage: 2,
    battleDrop: 4,
    silhouette: "furnace",
  },
  leech: {
    label: "Leech",
    hp: 40,
    speed: 0.68,
    regen: 2.4,
    leakDamage: 2,
    battleDrop: 3,
    silhouette: "leech",
  },
  overlord: {
    label: "Overlord",
    hp: 260,
    speed: 0.34,
    armorFlat: 5,
    resist: { fire: 0.15, poison: 0.3 },
    leakDamage: 5,
    battleDrop: 14,
    boss: true,
    silhouette: "overlord",
  },
};

/** Legacy ids → current kinds (saves / old scripts). */
export const ENEMY_ALIASES = {
  basic: "grub",
  heavy: "plate",
  fast: "runner",
  flying: "skiff",
  shielded: "aegis",
  splitter: "cluster",
  boss: "overlord",
};

export function resolveEnemyKind(id) {
  const k = ENEMY_ALIASES[id] || id;
  return ENEMY_KINDS[k] ? k : "grub";
}

export function enemyDef(id) {
  return ENEMY_KINDS[resolveEnemyKind(id)] || ENEMY_KINDS.grub;
}

/** Relative budget cost for endless pack building. */
export const ENEMY_COST = {
  grub: 1,
  runner: 1.1,
  plate: 2.4,
  skiff: 1.4,
  aegis: 2.2,
  cluster: 2.0,
  wraith: 1.5,
  furnace: 2.3,
  leech: 2.1,
  overlord: 8,
};
