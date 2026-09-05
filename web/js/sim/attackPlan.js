import { PARTS } from "../data/parts.js";

export const Pattern = { PROJECTILE: 0, PULSE: 1, HYBRID: 2 };

/**
 * Build combat plan from triad + level + meta ranks.
 * Range/ROF stack: base envelope × base mults × barrel mults × part upgrade ranks × globals.
 */
export function buildAttackPlan(baseId, barrelId, payloadId, level = 1, opts = {}) {
  // using throw instead of fallback because typo should fail fast, not hide as free tower
  if (baseId && !PARTS.bases[baseId]) throw new Error(`unknown base "${baseId}"`);
  if (barrelId && !PARTS.barrels[barrelId]) throw new Error(`unknown barrel "${barrelId}"`);
  if (payloadId && !PARTS.payloads[payloadId]) throw new Error(`unknown payload "${payloadId}"`);
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
    rangeCells: (base.range ?? 3) * (base.rangeMult ?? 1),
    fireInterval: (base.fireInterval ?? 1) / Math.max(0.05, base.rofMult ?? 1),
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
    doctrine: base.doctrine ?? "first",
    pointBlankMult: base.pointBlankMult ?? 1,
    pointBlankRange: base.pointBlankRange ?? 0,
    airDamageMult: (base.airDamageMult ?? 1) * (barrel.airDamageMult ?? 1),
    armorPierce: payload.armorPierce ?? 0,
    emp: !!payload.emp,
    executeMult: base.executeMult ?? 1,
    executeThreshold: base.executeThreshold ?? 0,
  };

  // Barrel delivery mults stack on the base envelope
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

  // Auto-level: uniform Dmg / ROF / Range buffs (player branch picks add extra).
  const lvl = Math.max(0, level - 1);
  if (lvl > 0) {
    plan.damage *= 1 + 0.04 * lvl;
    plan.fireInterval /= 1 + 0.03 * lvl;
    plan.rangeCells *= 1 + 0.03 * lvl;
  }

  const branch = opts.branch || {};
  const bDmg = Math.max(0, branch.damage | 0);
  const bRof = Math.max(0, branch.rof | 0);
  const bRange = Math.max(0, branch.range | 0);
  if (bDmg > 0) plan.damage *= 1 + 0.05 * bDmg;
  if (bRof > 0) plan.fireInterval /= 1 + 0.05 * bRof;
  if (bRange > 0) plan.rangeCells *= 1 + 0.05 * bRange;

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

  const basePower = Math.max(0, opts.basePower | 0);
  if (basePower > 0) {
    plan.damage *= 1 + 0.08 * basePower;
    plan.rangeCells *= 1 + 0.04 * basePower;
  }

  const barrelPower = Math.max(0, opts.barrelPower | 0);
  if (barrelPower > 0) {
    plan.damage *= 1 + 0.07 * barrelPower;
    plan.fireInterval /= 1 + 0.04 * barrelPower;
  }

  // Per-part Arsenal range / ROF ranks (bases + barrels)
  const baseRange = Math.max(0, opts.baseRange | 0);
  const baseRof = Math.max(0, opts.baseRof | 0);
  const barrelRange = Math.max(0, opts.barrelRange | 0);
  const barrelRof = Math.max(0, opts.barrelRof | 0);
  if (baseRange > 0) plan.rangeCells *= 1 + 0.06 * baseRange;
  if (baseRof > 0) plan.fireInterval /= 1 + 0.05 * baseRof;
  if (barrelRange > 0) plan.rangeCells *= 1 + 0.06 * barrelRange;
  if (barrelRof > 0) plan.fireInterval /= 1 + 0.05 * barrelRof;

  const gDmg = opts.globalDamage > 0 ? opts.globalDamage : 1;
  const gRange = opts.globalRange > 0 ? opts.globalRange : 1;
  const gRof = opts.globalRof > 0 ? opts.globalRof : 1;
  plan.damage *= gDmg;
  plan.rangeCells *= gRange;
  plan.fireInterval /= gRof;

  return plan;
}

/** Shared opts builder for combat / ghost / board range rings. */
export function planOptsFromParts(partUpgrades, globalMods, triad) {
  const up = partUpgrades || {};
  const g = globalMods || {};
  const payload = up[triad?.payload] || {};
  const base = up[triad?.base] || {};
  const barrel = up[triad?.barrel] || {};
  const br = triad?.branch || {};
  return {
    chainRank: payload.chain | 0,
    powerRank: payload.power | 0,
    basePower: base.power | 0,
    barrelPower: barrel.power | 0,
    baseRange: base.range | 0,
    baseRof: base.rof | 0,
    barrelRange: barrel.range | 0,
    barrelRof: barrel.rof | 0,
    globalDamage: g.damage ?? 1,
    globalRange: g.range ?? 1,
    globalRof: g.rof ?? 1,
    branch: {
      damage: br.damage | 0,
      rof: br.rof | 0,
      range: br.range | 0,
    },
  };
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
  // Kinetic / breach / emp: damage (and pierce/emp flags) are the mastery
  void payloadId;
}
