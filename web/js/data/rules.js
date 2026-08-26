/**
 * Cross-cutting numeric rules — the GDD §17 "data placeholders" that live
 * OUTSIDE content tables (parts/enemies/waves carry their own). All values
 * are playtest-tunable; nothing here is a design unknown.
 */
export const RULES = {
  /** Call Early Coin: base + per-wave slope, claimed once per wave. */
  CALL_EARLY_BASE: 4,
  CALL_EARLY_PER_WAVE: 0.5,

  /** Campaign level first-clear Aether bonus. */
  FIRST_CLEAR_AETHER: 8,

  /** Camera pitch clamp (degrees) — settings slider + scroll/scroll-wheel. */
  PITCH_MIN: 8,
  PITCH_MAX: 58,
  PITCH_DEFAULT: 24,

  /** Undo stack depth (place/sell undo entries kept). */
  UNDO_STACK_CAP: 24,
};
