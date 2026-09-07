/**
 * Hit resolution, chains, XP, status tick.
 */
import { PARTS, XP_TO_POINT } from "../../data/parts.js";
import { ballastPressureFactor, isConductive } from "../../data/enemies.js";
import { emit, logAction } from "../state.js";
import { applyStatus as applyStatusRegistry, tickStatus as tickStatusRegistry } from "./status.js";
import { SYNERGIES, heatBlockActive } from "./synergy.js";

export function invalidatePlans(state) {
  state.plans.clear();
}

export function doChain(state, fromEnemy, damage, plan, tower, hit, jumps) {
  let dmg = damage;
  let fromX = fromEnemy.pos.x;
  let fromY = fromEnemy.pos.y;
  let left = jumps;
  // Frost x shock (synergy table): chains leap further from a slowed enemy
  const maxChain =
    (plan.chainRange || 2.5) *
    (SYNERGIES.frostShock.when(fromEnemy) ? SYNERGIES.frostShock.chainRangeMult : 1);
  while (left-- > 0) {
    dmg *= plan.chainFalloff;
    let best = null;
    let bestScore = -1e9;
    for (const e of state.enemies) {
      if (hit.has(e.id)) continue;
      if (e.hp <= 0) continue;
      if (e.flying && !plan.airCapable) continue;
      if (e.armorKind === "insulated") continue;
      const dx = e.pos.x - fromX;
      const dy = e.pos.y - fromY;
      if (dx * dx + dy * dy > maxChain * maxChain) continue;
      const d = Math.hypot(dx, dy);
      // Prefer conductive plate for shock chains
      let score = maxChain - d;
      if (isConductive(e)) score += 1.5;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (!best) break;
    hit.add(best.id);
    emit(state, "chain_arc", {
      x0: fromX,
      y0: fromY,
      x1: best.pos.x,
      y1: best.pos.y,
    });
    applyHit(state, best, dmg, plan, tower);
    fromX = best.pos.x;
    fromY = best.pos.y;
  }
}

export function applyHit(state, e, damage, plan, tower, opts = {}) {
  if ((e.immune || []).includes(plan.damageType)) {
    emit(state, "hit_immune", { enemyId: e.id });
    return;
  }

  const dtype = plan.damageType || "kinetic";
  const armorKind = e.armorKind || "none";

  // EMP: strip energy block / melt shields
  if (plan.emp) {
    if (armorKind === "energy") {
      // EMP is a permanent strip by design: energy veil gone, resists capped.
      e.energyBlock = false;
      e.resist = { ...(e.resist || {}), fire: Math.min(e.resist?.fire || 0, 0.25), shock: Math.min(e.resist?.shock || 0, 0.25) };
    }
    if ((e.shieldHp || 0) > 0) {
      e.shieldHp = Math.max(0, e.shieldHp - Math.max(18, damage * 2.2));
    }
  }

  // Energy full-block vs fire/shock until EMP strips the veil
  if (e.energyBlock && (dtype === "fire" || dtype === "shock") && !plan.emp) {
    emit(state, "hit_immune", { enemyId: e.id, reason: "energy_block" });
    e._hitFlash = 0.4;
    return;
  }

  let raw = damage;
  if (opts.pressure) raw *= ballastPressureFactor(e.ballast || "mid");

  // Pyro bonus vs soft (no armor)
  if (dtype === "fire" && armorKind === "none") raw *= 1.35;

  // Plate / insulated heat block (extra on top of resist map).
  // Shred synergy: a fully stripped target loses the plate's heat resistance.
  const heatBlock =
    dtype === "fire" && (armorKind === "plate" || armorKind === "insulated") &&
    heatBlockActive(e, plan.armorPierce || 0);
  if (heatBlock) {
    raw *= 0.55;
  }
  // Insulated shock dampen
  if (dtype === "shock" && armorKind === "insulated" && !plan.emp) {
    raw *= 0.35;
  }
  // Frost x shock (synergy table): slowed enemies surge — shock bonus
  if (dtype === "shock" && SYNERGIES.frostShock.when(e)) raw *= SYNERGIES.frostShock.shockDamageMult;

  if (tower) {
    const ox = tower.cell.x + 0.5;
    const oy = tower.cell.y + 0.5;
    const dist = Math.hypot(e.pos.x - ox, e.pos.y - oy);
    const base = PARTS.bases[tower.base] || {};
    if ((base.pointBlankMult || 1) > 1 && dist <= (base.pointBlankRange || 0)) {
      raw *= base.pointBlankMult;
    }
    if (e.flying) raw *= plan.airDamageMult ?? 1;
    const thr = base.executeThreshold || 0;
    if ((base.executeMult || 1) > 1 && thr > 0 && e.maxHp > 0 && e.hp / e.maxHp <= thr) {
      raw *= base.executeMult;
    }
  } else if (e.flying) {
    raw *= plan.airDamageMult ?? 1;
  }
  const armor = Math.max(0, (e.armorFlat || 0) + (e.auraArmor || 0) - (e.shred || 0) - (plan.armorPierce || 0));
  const resist = (e.resist && e.resist[dtype]) || 0;
  let dmg = Math.max(0, raw - armor) * (1 - Math.min(0.95, resist));
  if ((e.shieldHp || 0) > 0) {
    const absorbed = Math.min(e.shieldHp, dmg);
    e.shieldHp -= absorbed;
    dmg -= absorbed;
  }
  e.hp -= dmg;
  e._hitFlash = 1;
  applyStatus(state, e, plan.status || {});
  if (tower) grantXp(state, tower, 1);
  emit(state, "hit", {
    enemyId: e.id,
    damage: dmg,
    type: plan.emp ? "shock" : dtype,
    x: e.pos.x,
    y: e.pos.y,
  });
}

function applyStatus(state, e, status) {
  return applyStatusRegistry(state, e, status);
}
export function tickStatus(state) {
  tickStatusRegistry(state);
}

export function grantXp(state, tower, amount) {
  const cap = Math.max(1, tower.levelCap || 1, state.runLevelCap | 0);
  tower.levelCap = cap;
  // At cap: freeze bar — no endless banked points.
  if ((tower.level | 0) >= cap) {
    const need = tower.xpToPoint || XP_TO_POINT;
    tower.xp = Math.min(tower.xp || 0, need - 1);
    return;
  }
  tower.xp = (tower.xp || 0) + amount;
  const need = tower.xpToPoint || XP_TO_POINT;
  let gained = 0;
  while (tower.xp >= need && (tower.level | 0) < cap) {
    tower.xp -= need;
    tower.level = (tower.level | 0) + 1;
    tower.pendingPicks = (tower.pendingPicks | 0) + 1;
    gained += 1;
    invalidatePlans(state);
    emit(state, "tower_leveled", {
      tower,
      level: tower.level,
      pendingPicks: tower.pendingPicks | 0,
      x: tower.cell.x + 0.5,
      y: tower.cell.y + 0.5,
    });
    emit(state, "level_pick_ready", {
      tower,
      pendingPicks: tower.pendingPicks | 0,
      x: tower.cell.x + 0.5,
      y: tower.cell.y + 0.5,
    });
  }
  if ((tower.level | 0) >= cap) {
    tower.xp = Math.min(tower.xp, need - 1);
  }
  if (gained > 0) {
    logAction(state, "auto_level", {
      id: tower.id,
      level: tower.level,
      gained,
      pendingPicks: tower.pendingPicks | 0,
    });
  }
}
