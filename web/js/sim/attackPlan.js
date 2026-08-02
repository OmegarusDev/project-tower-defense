import { PARTS } from "../data/parts.js";

export const Pattern = { PROJECTILE: 0, PULSE: 1, HYBRID: 2 };

export function buildAttackPlan(baseId, barrelId, payloadId, level = 1, opts = {}) {
  const base = PARTS.bases[baseId] || {};
  const barrel = PARTS.barrels[barrelId] || {};
  const payload = PARTS.payloads[payloadId] || {};

  const plan = {
    pattern: Pattern.PROJECTILE,
    projectileCount: barrel.count ?? 1,
    spreadDeg: barrel.spreadDeg ?? 0,
    alternating: !!barrel.alternating,
    pierce: barrel.pierce ?? 0,
    pulseRadius: barrel.pulseRadius ?? 0,
    rangeCells: base.range ?? 3,
    fireInterval: base.fireInterval ?? 1,
    projectileSpeed: barrel.speed ?? 8,
    airCapable: !!barrel.airCapable,
    damage: payload.damage ?? 10,
    damageType: payload.damageType ?? "kinetic",
    // Blast radius comes from delivery (Launcher), not payload
    aoeRadius: barrel.aoeRadius ?? 0,
    aoeFalloff: barrel.aoeFalloff !== false,
    status: payload.status ? structuredClone(payload.status) : {},
    chainJumps: payload.chainJumps ?? 0,
    chainFalloff: payload.chainFalloff ?? 0.7,
    chainRange: payload.chainRange ?? 2.5,
    homing: barrel.homing !== false,
    doctrine: base.doctrine || "first",
    auraDamageMult: base.auraDamageMult ?? 1,
    auraRofMult: base.auraRofMult ?? 1,
    auraRadius: base.auraRadius ?? 0,
    providesAura: !!base.aura,
    pointBlankMult: base.pointBlankMult ?? 1,
    pointBlankRange: base.pointBlankRange ?? 0,
    airDamageMult: base.airDamageMult ?? 1,
    executeMult: base.executeMult ?? 1,
    executeThreshold: base.executeThreshold ?? 0,
  };

  plan.rangeCells *= barrel.rangeMult ?? 1;
  plan.fireInterval /= Math.max(0.05, barrel.rofMult ?? 1);
  if (payload.speed != null) plan.projectileSpeed = payload.speed;
  if (barrel.damageMult != null) plan.damage *= barrel.damageMult;
  // Aerie can engage the air layer with any delivery
  if (baseId === "aerie") plan.airCapable = true;

  const barrelPattern = barrel.pattern ?? "projectile";
  if (barrelPattern === "pulse") {
    plan.pattern = Pattern.PULSE;
    plan.pulseRadius = Math.max(plan.pulseRadius, barrel.pulseRadius ?? 0);
  } else if (barrelPattern === "hybrid") {
    plan.pattern = Pattern.HYBRID;
  }

  const lvl = Math.max(0, level - 1);
  const lvlMult = 1 + 0.12 * lvl;
  switch (base.levelBias) {
    case "range":
      plan.rangeCells *= 1 + 0.08 * lvl;
      plan.damage *= lvlMult;
      break;
    case "rof":
      plan.fireInterval /= 1 + 0.08 * lvl;
      plan.damage *= lvlMult * 0.9;
      break;
    case "aura":
      plan.auraDamageMult *= 1 + 0.05 * lvl;
      plan.auraRofMult *= 1 + 0.05 * lvl;
      plan.damage *= lvlMult * 0.85;
      break;
    default:
      plan.damage *= lvlMult;
      plan.rangeCells *= 1 + 0.03 * lvl;
  }

  // Shock lightning: base jumps + tower levels + tech chain ranks
  if (payload.chainUpgradeable || (payload.chainJumps || 0) > 0) {
    const rank = Math.max(0, opts.chainRank | 0);
    plan.chainJumps = (payload.chainJumps || 0) + lvl + rank;
    plan.chainRange = (payload.chainRange || 2.5) * (1 + 0.08 * rank);
    if (rank > 0) plan.damage *= 1 + 0.04 * rank;
  }

  // Payload Mastery (tech tree) — generic power ranks
  const power = Math.max(0, opts.powerRank | 0);
  if (power > 0) applyPayloadPower(plan, payloadId, power);

  return plan;
}

function applyPayloadPower(plan, payloadId, power) {
  plan.damage *= 1 + 0.12 * power;
  const st = plan.status || {};
  if (st.burn) {
    st.burn.dps = (st.burn.dps || 0) * (1 + 0.22 * power);
    st.burn.duration = (st.burn.duration || 0) + 0.6 * power;
  }
  if (st.slow) {
    st.slow.amount = Math.min(0.75, (st.slow.amount || 0) * (1 + 0.12 * power));
    st.slow.duration = (st.slow.duration || 0) + 0.4 * power;
  }
  if (st.poison) {
    st.poison.dps = (st.poison.dps || 0) * (1 + 0.22 * power);
    st.poison.duration = (st.poison.duration || 0) + 0.5 * power;
  }
  if (st.shred) {
    st.shred.amount = (st.shred.amount || 0) + power;
    st.shred.duration = (st.shred.duration || 0) + 0.6 * power;
  }
  // Kinetic has no status — damage mult is the mastery
  void payloadId;
}
