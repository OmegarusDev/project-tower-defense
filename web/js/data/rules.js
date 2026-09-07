/**
 * Cross-cutting numeric rules — the GDD §17 "data placeholders" that live
 * OUTSIDE content tables (parts/enemies/waves carry their own). All values
 * are playtest-tunable; nothing here is a design unknown.
 */
export const RULES = {
  /** Call Early Coin: base + per-wave slope, claimed once per wave. */
  CALL_EARLY_BASE: 4,
  CALL_EARLY_PER_WAVE: 0.5,

  /** Campaign level first-clear lumps (once per Yard). 12 Æ = cheapest Foundations rank; 6 Parts ≈ Twin/Rail. */
  FIRST_CLEAR_AETHER: 12,
  FIRST_CLEAR_FORGE: 6,

  /** Camera pitch clamp (degrees) — settings slider + scroll/scroll-wheel. */
  PITCH_MIN: 8,
  PITCH_MAX: 58,
  PITCH_DEFAULT: 24,

  /** Undo stack depth (place/sell undo entries kept). */
  UNDO_STACK_CAP: 24,

  /**
   * Coin tax per already-placed copy of a part (base / barrel / payload).
   * First copy of a part is free of tax; the 2nd pays this fraction of that
   * part's cost, the 3rd pays 2×, and so on. Shared across the board so a
   * Sentry + Rail still pays Sentry tax if Sentries are already down.
   */
  PART_COPY_TAX: 0.25,
};
