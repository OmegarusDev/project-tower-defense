/**
 * Status registry — the four statuses are data instances of two shared
 * shapes (dot = damage-over-time, timed = decaying amount), with identical
 * math to the oracle. Adding a new status = one data entry, not code.
 * Enemy fields keep the oracle's exact names/shape (burnT/burnDps/...),
 * so the state hash and parity are unaffected.
 */
import { emit } from "../state.js";
import { SYNERGIES, burnTickDamped } from "./synergy.js";

export const STATUSES = {
  burn: {
    kind: "dot",
    fxType: "fire",
    fxEvery: 0.12,
    /** Per-tick multiplier — the oracle's fire rules (soft bonus, plate block). */
    tickMult(e, tick) {
      const kind = e.armorKind || "none";
      if (kind === "none") return tick * 1.35;
      if ((kind === "plate" || kind === "insulated") && burnTickDamped(e)) {
        return tick * 0.55;
      }
      return tick;
    },
  },
  poison: {
    kind: "dot",
    fxType: "poison",
    fxEvery: 0.16,
    /** Burn x poison (synergy table): flames cook the toxin — +50%. */
    tickMult(e, tick) {
      return SYNERGIES.burnPoison.when(e) ? tick * SYNERGIES.burnPoison.poisonTickMult : tick;
    },
  },
  slow: {
    kind: "timed",
    fxType: "frost",
    fxEvery: 0.22,
    amountField: "slowAmount",
    onApply: (e, def) => {
      e.slowAmount = Math.max(e.slowAmount || 0, def.amount);
      if (e.slowAmount >= 1) e.slowAmount = 1;
    },
  },
  shred: {
    kind: "timed",
    fxType: "acid",
    fxEvery: 0.2,
    amountField: "shred",
  },
};

const FX_FIELD = { burn: "_fxBurn", poison: "_fxPoison", slow: "_fxSlow", shred: "_fxShred" };
const T_FIELD = { burn: "burnT", poison: "poisonT", slow: "slowT", shred: "shredT" };
const DPS_FIELD = { burn: "burnDps", poison: "poisonDps" };
const EVERY_FIELD = { burn: "burnEvery", poison: "poisonEvery" };
const ACC_FIELD = { burn: "burnAcc", poison: "poisonAcc" };

/** Ported verbatim from the oracle's _applyStatus — write order preserved. */
export function applyStatus(state, e, status) {
  if (status.burn) dotApply(e, "burn", status.burn);
  if (status.poison) dotApply(e, "poison", status.poison);
  if (status.slow) timedApply(e, "slow", status.slow);
  if (status.shred) timedApply(e, "shred", status.shred);
}

function dotApply(e, kind, def) {
  e[T_FIELD[kind]] = Math.max(e[T_FIELD[kind]] || 0, def.duration);
  e[DPS_FIELD[kind]] = Math.max(e[DPS_FIELD[kind]] || 0, def.dps);
  e[EVERY_FIELD[kind]] = def.every || 0.5;
}

function timedApply(e, kind, def) {
  const meta = STATUSES[kind];
  e[T_FIELD[kind]] = Math.max(e[T_FIELD[kind]] || 0, def.duration);
  if (meta.onApply) meta.onApply(e, def);
  else e[meta.amountField] = Math.max(e[meta.amountField] || 0, def.amount || 0);
}

/** Ported verbatim from the oracle's _tickStatus — same order, same floats. */
export function tickStatus(state) {
  const dt = state.dt;
  for (const e of state.enemies) {
    dotTick(state, e, "burn");
    dotTick(state, e, "poison");
    timedTick(state, e, "slow");
    timedTick(state, e, "shred");
  }
}

function dotTick(state, e, kind) {
  const dt = state.dt;
  const meta = STATUSES[kind];
  if (e[T_FIELD[kind]] > 0) {
    e[T_FIELD[kind]] -= dt;
    e[ACC_FIELD[kind]] = (e[ACC_FIELD[kind]] || 0) + dt;
    if (e[ACC_FIELD[kind]] >= (e[EVERY_FIELD[kind]] || 0.5)) {
      e[ACC_FIELD[kind]] -= e[EVERY_FIELD[kind]] || 0.5;
      let tick = e[DPS_FIELD[kind]] || 1;
      tick = meta.tickMult(e, tick);
      e.hp -= tick;
    }
    e[FX_FIELD[kind]] = (e[FX_FIELD[kind]] || 0) + dt;
    if (e[FX_FIELD[kind]] > meta.fxEvery) {
      e[FX_FIELD[kind]] = 0;
      emit(state, "status_fx", { x: e.pos.x, y: e.pos.y, type: meta.fxType });
    }
  }
}

function timedTick(state, e, kind) {
  const dt = state.dt;
  const meta = STATUSES[kind];
  if (e[T_FIELD[kind]] > 0) {
    e[T_FIELD[kind]] -= dt;
    if (e[T_FIELD[kind]] <= 0) {
      e[meta.amountField] = 0;
    } else {
      e[FX_FIELD[kind]] = (e[FX_FIELD[kind]] || 0) + dt;
      if (e[FX_FIELD[kind]] > meta.fxEvery) {
        e[FX_FIELD[kind]] = 0;
        emit(state, "status_fx", { x: e.pos.x, y: e.pos.y, type: meta.fxType });
      }
    }
  }
}
