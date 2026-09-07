/**
 * Combat — pure functions over state. Iteration order, float sequences,
 * plan cache and alt-toggle live ON STATE: they are the determinism
 * contract the parity traces pin (simParity.mjs). Do not reorder.
 */
import { buildAttackPlan, Pattern, planOptsFromParts } from "../attackPlan.js";
import { INF } from "../boardGrid.js";
import { allocId, emit } from "../state.js";
import { selectTarget } from "../combat/targeting.js";
import { applyHit, doChain, tickStatus } from "../combat/hits.js";
export { invalidatePlans, applyHit, doChain, tickStatus, grantXp } from "../combat/hits.js";

/**
 * Status payloads are plain two-level objects ({burn:{duration,dps,every}},
 * {slow:{amount,duration}}, …) — a hand-rolled copy is byte-identical to
 * structuredClone for these shapes and far cheaper per projectile.
 */
function cloneStatus(status) {
  if (!status) return {};
  const out = {};
  for (const k in status) {
    const v = status[k];
    out[k] = typeof v === "object" && v !== null ? { ...v } : v;
  }
  return out;
}

export function tickCombat(state) {
  refreshEnemyAuras(state);
  for (const t of state.towers) tickTower(state, t);
  tickProjectiles(state);
  tickStatus(state);
}

export function refreshEnemyAuras(state) {
  const es = state.enemies;
  // Fast path: no ward present — O(n) scan, no pairwise work.
  let ward = null;
  for (const e of es) {
    if (e.aura && e.hp > 0 && (e.aura.armor || 0) > 0) {
      ward = e;
      break;
    }
  }
  if (!ward) {
    if (state.auraApplied) {
      for (const e of es) e.auraArmor = 0;
      state.auraApplied = false;
    }
    return;
  }
  for (const e of es) e.auraArmor = 0;
  state.auraApplied = false;
  // Collect wards first — avoids re-checking !aura per inner iteration.
  const wards = [];
  for (const w of es) {
    const a = w.aura;
    if (a && w.hp > 0 && (a.armor | 0) > 0) wards.push(w);
  }
  for (const w of wards) {
    const r = w.aura.radius || 1.5;
    const r2 = r * r;
    const armor = w.aura.armor | 0;
    for (const e of es) {
      if (e === w) continue;
      const dx = e.pos.x - w.pos.x;
      const dy = e.pos.y - w.pos.y;
      if (dx * dx + dy * dy <= r2) {
        if (armor > (e.auraArmor | 0)) e.auraArmor = armor;
        state.auraApplied = true;
      }
    }
  }
}

function planOptsFor(state, t) {
  return planOptsFromParts(state.partUpgrades, state.globalMods, t);
}

function tickTower(state, t) {
  let plan = state.plans.get(t.id);
  if (!plan) {
    plan = buildAttackPlan(t.base, t.barrel, t.payload, t.level, planOptsFor(state, t));
    state.plans.set(t.id, plan);
  }

  const target = selectTarget(state, t, plan);
  if (target) {
    t.targetId = target.id;
    const ox = t.cell.x + 0.5;
    const oy = t.cell.y + 0.5;
    t.aimAngle = Math.atan2(target.pos.y - oy, target.pos.x - ox);
  }

  if (t.cooldown > 0) {
    t.cooldown -= state.dt;
    return;
  }
  if (!target) return;
  t.cooldown = plan.fireInterval;

  let fireX = t.cell.x + 0.5;
  let fireY = t.cell.y + 0.5;
  if (plan.pattern === Pattern.PULSE || plan.pattern === Pattern.HYBRID) {
    firePulse(state, t, plan);
  }
  if (plan.pattern === Pattern.PROJECTILE || plan.pattern === Pattern.HYBRID) {
    const muzzle = fireProjectiles(state, t, plan, target);
    if (muzzle) {
      fireX = muzzle.x;
      fireY = muzzle.y;
    }
  }
  emit(state, "tower_fired", {
    towerId: t.id,
    pattern: plan.pattern,
    x: fireX,
    y: fireY,
    angle: t.aimAngle || 0,
    damageType: plan.damageType,
  });
}

function firePulse(state, t, plan) {
  const ox = t.cell.x + 0.5;
  const oy = t.cell.y + 0.5;
  const hit = new Set();
  let closest = null;
  let closestD = INF;
  for (const e of state.enemies) {
    if (e.flying && !plan.airCapable) continue;
    if (e.hp <= 0) continue;
    const dx = e.pos.x - ox;
    const dy = e.pos.y - oy;
    const dist = Math.hypot(dx, dy);
    if (dist > plan.pulseRadius) continue;
    let dmg = plan.damage;
    if (plan.aoeFalloff && plan.pulseRadius > 0) dmg *= 1 - 0.5 * (dist / plan.pulseRadius);
    applyHit(state, e, dmg, plan, t, { pressure: true });
    hit.add(e.id);
    if (dist < closestD) {
      closestD = dist;
      closest = e;
    }
  }
  if (closest && (plan.chainJumps || 0) > 0) {
    doChain(state, closest, plan.damage, plan, t, hit, plan.chainJumps);
  }
}

function fireProjectiles(state, t, plan, target) {
  let count = plan.projectileCount;
  let muzzleSign = 0;
  if (plan.alternating) {
    const side = !!state.altToggle.get(t.id);
    state.altToggle.set(t.id, !side);
    count = 1;
    muzzleSign = side ? 1 : -1;
  }
  const cx = t.cell.x + 0.5;
  const cy = t.cell.y + 0.5;
  const baseAngle = Math.atan2(target.pos.y - cy, target.pos.x - cx);
  const off = (plan.muzzleOffset || 0) * muzzleSign;
  const ox = cx + Math.cos(baseAngle + Math.PI / 2) * off;
  const oy = cy + Math.sin(baseAngle + Math.PI / 2) * off;
  const spreadRad = ((plan.spreadDeg || 0) * Math.PI) / 180;
  const ballistic = !plan.homing && count > 1 && spreadRad > 0;

  for (let n = 0; n < count; n++) {
    let angle = baseAngle;
    if (ballistic) {
      const u = count === 1 ? 0.5 : n / (count - 1);
      angle = baseAngle + (u - 0.5) * spreadRad;
    }
    const proj = {
      id: allocId(state),
      pos: { x: ox, y: oy },
      targetId: target.id,
      speed: plan.projectileSpeed,
      damage: plan.damage,
      damageType: plan.damageType,
      pierce: plan.pierce | 0,
      hitIds: new Set(),
      homing: ballistic ? false : plan.homing,
      aoeRadius: plan.aoeRadius,
      aoeFalloff: plan.aoeFalloff,
      status: cloneStatus(plan.status),
      chainJumps: plan.chainJumps,
      chainFalloff: plan.chainFalloff,
      chainRange: plan.chainRange,
      airCapable: plan.airCapable,
      armorPierce: plan.armorPierce || 0,
      emp: !!plan.emp,
      towerId: t.id,
      traveled: 0,
      maxRange: plan.rangeCells * 1.15,
    };
    if (!proj.homing) {
      proj.vx = Math.cos(angle) * plan.projectileSpeed;
      proj.vy = Math.sin(angle) * plan.projectileSpeed;
    }
    state.projectiles.push(proj);
  }
  return { x: ox, y: oy };
}

function tickProjectiles(state) {
  const w = state;
  for (let i = 0; i < w.projectiles.length; ) {
    const p = w.projectiles[i];
    if (!p.homing && p.vx != null) {
      if (tickBallistic(state, p)) {
        w.projectiles.splice(i, 1);
        continue;
      }
      i++;
      continue;
    }
    // Homing shots respect their range cap too — target alive or not.
    if (p.traveled >= (p.maxRange || 4)) {
      if ((p.aoeRadius || 0) > 0) detonateAt(state, p, p.pos);
      w.projectiles.splice(i, 1);
      continue;
    }
    const target = (() => {
      const cand = w.enemiesById.get(p.targetId);
      return cand && cand.hp > 0 ? cand : null;
    })();
    if (!target && p.homing) {
      // H11: target died — AoE detonates at last pos; else coast on last velocity.
      if ((p.aoeRadius || 0) > 0) {
        detonateAt(state, p, p.pos);
        w.projectiles.splice(i, 1);
        continue;
      }
      p.homing = false;
      p.targetId = -1;
      const sp = p.speed || 8;
      p.vx = p._lastVx != null ? p._lastVx : 0;
      p.vy = p._lastVy != null ? p._lastVy : -sp;
      const rem = Math.max(0.75, (p.maxRange || 4) - (p.traveled || 0));
      p.maxRange = (p.traveled || 0) + rem;
      if (tickBallistic(state, p)) {
        w.projectiles.splice(i, 1);
        continue;
      }
      i++;
      continue;
    }
    const dest = target ? target.pos : p.pos;
    const vel = p.speed * w.dt;
    const dx = dest.x - p.pos.x;
    const dy = dest.y - p.pos.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-4) {
      p._lastVx = (dx / len) * p.speed;
      p._lastVy = (dy / len) * p.speed;
    }
    if (len <= vel || len < 1e-4) {
      if (target) {
        if (onHit(state, p, target)) {
          w.projectiles.splice(i, 1);
          continue;
        }
        // Pierce remaining — convert to ballistic through the pack.
        p.homing = false;
        p.targetId = -1;
        p.vx = p._lastVx != null ? p._lastVx : p.speed;
        p.vy = p._lastVy != null ? p._lastVy : 0;
      } else {
        w.projectiles.splice(i, 1);
        continue;
      }
      i++;
      continue;
    }
    p.pos.x += (dx / len) * vel;
    p.pos.y += (dy / len) * vel;
    p.traveled = (p.traveled || 0) + vel;
    i++;
  }
}

/** Returns true if projectile should be removed. */
function tickBallistic(state, p) {
  const w = state;
  const step = p.speed * w.dt;
  p.pos.x += p.vx * w.dt;
  p.pos.y += p.vy * w.dt;
  p.traveled = (p.traveled || 0) + step;

  const g = w.grid;
  if (
    p.pos.x < -0.5 ||
    p.pos.y < -0.5 ||
    p.pos.x > g.cols + 0.5 ||
    p.pos.y > g.rows + 0.5 ||
    p.traveled >= (p.maxRange || 4)
  ) {
    return true;
  }

  const hitR = 0.4;
  let best = null;
  let bestD = hitR;
  if (!p.hitIds) p.hitIds = new Set();
  for (const e of w.enemies) {
    if (p.hitIds.has(e.id)) continue;
    if (e.hp <= 0) continue;
    if (e.flying && !p.airCapable) continue;
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (best) {
    return onHit(state, p, best);
  }
  return false;
}

/** Launcher (etc.): explode AoE at a world position with no primary target. */
function detonateAt(state, p, pos) {
  const plan = {
    damageType: p.damageType,
    status: p.status,
    aoeRadius: p.aoeRadius,
    aoeFalloff: p.aoeFalloff,
    chainJumps: 0,
    chainFalloff: p.chainFalloff,
    chainRange: p.chainRange || 2.5,
    airCapable: p.airCapable,
    armorPierce: p.armorPierce || 0,
    emp: !!p.emp,
  };
  const tower = state.towersById.get(p.towerId) || null;
  if ((plan.aoeRadius || 0) <= 0) return;
  for (const e of state.enemies) {
    if (e.flying && !plan.airCapable) continue;
    if (e.hp <= 0) continue;
    const d = Math.hypot(e.pos.x - pos.x, e.pos.y - pos.y);
    if (d <= plan.aoeRadius) {
      let dmg = p.damage;
      if (plan.aoeFalloff) dmg *= 1 - 0.5 * (d / plan.aoeRadius);
      applyHit(state, e, dmg, plan, tower, { pressure: true });
    }
  }
}

/**
 * Apply projectile impact. Returns true when the projectile should despawn.
 * Pierce: decrement and keep flying (skip already-hit ids).
 */
export function onHit(state, p, target) {
  if (target.hp <= 0) return false;
  if (target.flying && !p.airCapable) return false;
  if (!p.hitIds) p.hitIds = new Set();
  if (p.hitIds.has(target.id)) return false;
  p.hitIds.add(target.id);

  const plan = {
    damageType: p.damageType,
    status: p.status,
    aoeRadius: p.aoeRadius,
    aoeFalloff: p.aoeFalloff,
    chainJumps: p.chainJumps,
    chainFalloff: p.chainFalloff,
    chainRange: p.chainRange || 2.5,
    airCapable: p.airCapable,
    armorPierce: p.armorPierce || 0,
    emp: !!p.emp,
  };
  const tower = state.towersById.get(p.towerId) || null;
  applyHit(state, target, p.damage, plan, tower, { pressure: false });

  if (plan.aoeRadius > 0) {
    for (const e of state.enemies) {
      if (e.id === target.id) continue;
      if (e.hp <= 0) continue;
      if (e.flying && !plan.airCapable) continue;
      const d = Math.hypot(e.pos.x - target.pos.x, e.pos.y - target.pos.y);
      if (d <= plan.aoeRadius) {
        let dmg = p.damage;
        if (plan.aoeFalloff) dmg *= 1 - 0.5 * (d / plan.aoeRadius);
        applyHit(state, e, dmg, plan, tower, { pressure: true });
      }
    }
  }

  if ((plan.chainJumps || 0) > 0) {
    doChain(state, target, p.damage, plan, tower, new Set([target.id]), plan.chainJumps);
  }

  // Pierce: keep the shot alive until pierces are exhausted.
  if ((p.pierce | 0) > 0) {
    p.pierce = (p.pierce | 0) - 1;
    return false;
  }
  return true;
}
