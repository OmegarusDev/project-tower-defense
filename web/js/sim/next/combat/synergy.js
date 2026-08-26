/**
 * Synergy registry — the game's documented cross-status rules as data.
 * Combat and status systems consult these tables; adding a synergy is a
 * data entry. The predicates/multipliers are pinned by combatSynergy tests.
 */
export const SYNERGIES = {
  /** Cooked Toxin — burning targets take +50% poison tick damage. */
  burnPoison: {
    name: "Cooked Toxin",
    when: (e) => (e.burnT || 0) > 0,
    poisonTickMult: 1.5,
  },
  /**
   * Melted Plate — a fully stripped (shredded) target loses the plate's
   * heat resistance: fire hits AND burn ticks skip the 0.55 block.
   */
  shredFire: {
    name: "Melted Plate",
    when: (e, pierce = 0) =>
      (e.shred || 0) >= Math.max(1, (e.armorFlat || 0) + (e.auraArmor || 0) - pierce),
  },
  /**
   * Frozen Lightning — slowed enemies surge: shock deals +15%, chains leap
   * 1.4x from a slowed source.
   */
  frostShock: {
    name: "Frozen Lightning",
    when: (e) => (e.slowT || 0) > 0,
    shockDamageMult: 1.15,
    chainRangeMult: 1.4,
  },
};

/** True when the target's plate heat block is active (fire hit, with pierce). */
export function heatBlockActive(e, pierce = 0) {
  return !SYNERGIES.shredFire.when(e, pierce);
}

/** True when a burn tick is damped by intact plate. */
export function burnTickDamped(e) {
  return !SYNERGIES.shredFire.when(e);
}
