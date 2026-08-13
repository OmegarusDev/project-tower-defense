import { PARTS, XP_TO_POINT } from "../data/parts.js";
import { ballastPressureFactor, isConductive } from "../data/enemies.js";
import { buildAttackPlan, Pattern, planOptsFromParts } from "./attackPlan.js";
import { INF } from "./boardGrid.js";

export class CombatSystem {
  constructor(world) {
    this.world = world;
    this.altToggle = new Map();
    this._plans = new Map();
  }

  /** Plans are immutable per (tower id, upgrades, branch) — rebuild only on change. */
  invalidatePlans() {
    this._plans.clear();
  }

  tick() {
    this._refreshEnemyAuras();
    for (const t of this.world.towers) this._tickTower(t);
    this._tickProjectiles();
    this._tickStatus();
  }

  /** Ward shells project a small armor aura onto nearby enemies while alive. */
  _refreshEnemyAuras() {
    const es = this.world.enemies;
    // Skip the O(n^2) pass entirely unless a live ward is on the board.
    let ward = null;
    for (const e of es) {
      if (e.aura && e.hp > 0 && (e.aura.armor || 0) > 0) {
        ward = e;
        break;
      }
    }
    if (!ward) {
      if (this._auraApplied) {
        for (const e of es) e.auraArmor = 0;
        this._auraApplied = false;
      }
      return;
    }
    for (const e of es) e.auraArmor = 0;
    this._auraApplied = false;
    for (const w of es) {
      const a = w.aura;
      if (!a || w.hp <= 0 || !(a.armor > 0)) continue;
      const r = a.radius || 1.5;
      for (const e of es) {
        if (e === w) continue;
        if (Math.hypot(e.pos.x - w.pos.x, e.pos.y - w.pos.y) <= r) {
          e.auraArmor = Math.max(e.auraArmor, a.armor || 0);
          this._auraApplied = true;
        }
      }
    }
  }

  _planOpts(t) {
    return planOptsFromParts(this.world.partUpgrades, this.world.globalMods, t);
  }

  _tickTower(t) {
    let plan = this._plans.get(t.id);
    if (!plan) {
      plan = buildAttackPlan(t.base, t.barrel, t.payload, t.level, this._planOpts(t));
      this._plans.set(t.id, plan);
    }

    const target = this._selectTarget(t, plan);
    if (target) {
      t.targetId = target.id;
      const ox = t.cell.x + 0.5;
      const oy = t.cell.y + 0.5;
      t.aimAngle = Math.atan2(target.pos.y - oy, target.pos.x - ox);
    }

    if (t.cooldown > 0) {
      t.cooldown -= this.world.dt;
      return;
    }
    if (!target) return;
    t.cooldown = plan.fireInterval;

    if (plan.pattern === Pattern.PULSE || plan.pattern === Pattern.HYBRID) {
      this._firePulse(t, plan);
    }
    if (plan.pattern === Pattern.PROJECTILE || plan.pattern === Pattern.HYBRID) {
      this._fireProjectiles(t, plan, target);
    }
    this.world.emit("tower_fired", {
      towerId: t.id,
      pattern: plan.pattern,
      x: t.cell.x + 0.5,
      y: t.cell.y + 0.5,
      angle: t.aimAngle || 0,
      damageType: plan.damageType,
    });
  }

  _firePulse(t, plan) {
    const ox = t.cell.x + 0.5;
    const oy = t.cell.y + 0.5;
    const hit = new Set();
    let closest = null;
    let closestD = INF;
    for (const e of this.world.enemies) {
      if (e.flying && !plan.airCapable) continue;
      if (e.hp <= 0) continue;
      const dx = e.pos.x - ox;
      const dy = e.pos.y - oy;
      const dist = Math.hypot(dx, dy);
      if (dist > plan.pulseRadius) continue;
      let dmg = plan.damage;
      if (plan.aoeFalloff && plan.pulseRadius > 0) dmg *= 1 - 0.5 * (dist / plan.pulseRadius);
      this._applyHit(e, dmg, plan, t, { pressure: true });
      hit.add(e.id);
      if (dist < closestD) {
        closestD = dist;
        closest = e;
      }
    }
    if (closest && (plan.chainJumps || 0) > 0) {
      this._doChain(closest, plan.damage, plan, t, hit, plan.chainJumps);
    }
  }

  _fireProjectiles(t, plan, target) {
    let count = plan.projectileCount;
    if (plan.alternating) {
      const side = !!this.altToggle.get(t.id);
      this.altToggle.set(t.id, !side);
      count = 1;
    }
    const ox = t.cell.x + 0.5;
    const oy = t.cell.y + 0.5;
    const baseAngle = Math.atan2(target.pos.y - oy, target.pos.x - ox);
    const spreadRad = ((plan.spreadDeg || 0) * Math.PI) / 180;
    const ballistic = !plan.homing && count > 1 && spreadRad > 0;

    for (let n = 0; n < count; n++) {
      let angle = baseAngle;
      if (ballistic) {
        const u = count === 1 ? 0.5 : n / (count - 1);
        angle = baseAngle + (u - 0.5) * spreadRad;
      }
      const proj = {
        id: this.world.allocId(),
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
        status: structuredClone(plan.status),
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
      this.world.projectiles.push(proj);
    }
  }

  _tickProjectiles() {
    const w = this.world;
    for (let i = 0; i < w.projectiles.length; ) {
      const p = w.projectiles[i];
      if (!p.homing && p.vx != null) {
        if (this._tickBallistic(p)) {
          w.projectiles.splice(i, 1);
          continue;
        }
        i++;
        continue;
      }
      // Homing shots respect their range cap too — target alive or not.
      if (p.traveled >= (p.maxRange || 4)) {
        if ((p.aoeRadius || 0) > 0) this._detonateAt(p, p.pos);
        w.projectiles.splice(i, 1);
        continue;
      }
      const target = w.enemies.find((e) => e.id === p.targetId && e.hp > 0);
      if (!target && p.homing) {
        // H11: target died — AoE detonates at last pos; else coast on last velocity.
        if ((p.aoeRadius || 0) > 0) {
          this._detonateAt(p, p.pos);
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
        if (this._tickBallistic(p)) {
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
          if (this._onHit(p, target)) {
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
  _tickBallistic(p) {
    const w = this.world;
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
      return this._onHit(p, best);
    }
    return false;
  }

  /** Launcher (etc.): explode AoE at a world position with no primary target. */
  _detonateAt(p, pos) {
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
    const tower = this.world.towers.find((t) => t.id === p.towerId);
    if ((plan.aoeRadius || 0) <= 0) return;
    for (const e of this.world.enemies) {
      if (e.flying && !plan.airCapable) continue;
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.y - pos.y);
      if (d <= plan.aoeRadius) {
        let dmg = p.damage;
        if (plan.aoeFalloff) dmg *= 1 - 0.5 * (d / plan.aoeRadius);
        this._applyHit(e, dmg, plan, tower, { pressure: true });
      }
    }
  }

  /**
   * Apply projectile impact. Returns true when the projectile should despawn.
   * Pierce: decrement and keep flying (skip already-hit ids).
   */
  _onHit(p, target) {
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
    const tower = this.world.towers.find((t) => t.id === p.towerId);
    this._applyHit(target, p.damage, plan, tower, { pressure: false });

    if (plan.aoeRadius > 0) {
      for (const e of this.world.enemies) {
        if (e.id === target.id) continue;
        if (e.hp <= 0) continue;
        if (e.flying && !plan.airCapable) continue;
        const d = Math.hypot(e.pos.x - target.pos.x, e.pos.y - target.pos.y);
        if (d <= plan.aoeRadius) {
          let dmg = p.damage;
          if (plan.aoeFalloff) dmg *= 1 - 0.5 * (d / plan.aoeRadius);
          this._applyHit(e, dmg, plan, tower, { pressure: true });
        }
      }
    }

    if ((plan.chainJumps || 0) > 0) {
      this._doChain(target, p.damage, plan, tower, new Set([target.id]), plan.chainJumps);
    }

    // Pierce: keep the shot alive until pierces are exhausted.
    if ((p.pierce | 0) > 0) {
      p.pierce = (p.pierce | 0) - 1;
      return false;
    }
    return true;
  }

  _doChain(fromEnemy, damage, plan, tower, hit, jumps) {
    let dmg = damage;
    let from = { ...fromEnemy.pos };
    let left = jumps;
    // Frost x shock: chains leap further from a slowed enemy (frozen lightning)
    const maxChain = (plan.chainRange || 2.5) * ((fromEnemy.slowT || 0) > 0 ? 1.4 : 1);
    while (left-- > 0) {
      dmg *= plan.chainFalloff;
      let best = null;
      let bestScore = -1e9;
      for (const e of this.world.enemies) {
        if (hit.has(e.id)) continue;
        if (e.hp <= 0) continue;
        if (e.flying && !plan.airCapable) continue;
        if (e.armorKind === "insulated") continue;
        const d = Math.hypot(e.pos.x - from.x, e.pos.y - from.y);
        if (d > maxChain) continue;
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
      this.world.emit("chain_arc", {
        x0: from.x,
        y0: from.y,
        x1: best.pos.x,
        y1: best.pos.y,
      });
      this._applyHit(best, dmg, plan, tower);
      from = { ...best.pos };
    }
  }

  _applyHit(e, damage, plan, tower, opts = {}) {
    if ((e.immune || []).includes(plan.damageType)) {
      this.world.emit("hit_immune", { enemyId: e.id });
      return;
    }

    const dtype = plan.damageType || "kinetic";
    const armorKind = e.armorKind || "none";

    // EMP: strip energy block / melt shields
    if (plan.emp) {
      if (armorKind === "energy") {
        e.energyBlock = false;
        e._empT = Math.max(e._empT || 0, 4);
        e.resist = { ...(e.resist || {}), fire: Math.min(e.resist?.fire || 0, 0.25), shock: Math.min(e.resist?.shock || 0, 0.25) };
      }
      if ((e.shieldHp || 0) > 0) {
        e.shieldHp = Math.max(0, e.shieldHp - Math.max(18, damage * 2.2));
      }
    }

    // Energy full-block vs fire/shock until EMP strips the veil
    if (e.energyBlock && (dtype === "fire" || dtype === "shock") && !plan.emp) {
      this.world.emit("hit_immune", { enemyId: e.id, reason: "energy_block" });
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
      (e.shred || 0) < Math.max(1, (e.armorFlat || 0) - (plan.armorPierce || 0));
    if (heatBlock) {
      raw *= 0.55;
    }
    // Insulated shock dampen
    if (dtype === "shock" && armorKind === "insulated" && !plan.emp) {
      raw *= 0.35;
    }
    // Frost x shock: slowed enemies surge — shock deals bonus damage into them
    if (dtype === "shock" && (e.slowT || 0) > 0) raw *= 1.15;

    if (tower) {
      const ox = tower.cell.x + 0.5;
      const oy = tower.cell.y + 0.5;
      const dist = Math.hypot(e.pos.x - ox, e.pos.y - oy);
      const base = PARTS.bases[tower.base] || {};
      if ((base.pointBlankMult || 1) > 1 && dist <= (base.pointBlankRange || 0)) {
        raw *= base.pointBlankMult;
      }
      if ((plan.airDamageMult || 1) > 1 && e.flying) raw *= plan.airDamageMult;
      else if ((base.airDamageMult || 1) > 1 && e.flying) raw *= base.airDamageMult;
      const thr = base.executeThreshold || 0;
      if ((base.executeMult || 1) > 1 && thr > 0 && e.maxHp > 0 && e.hp / e.maxHp <= thr) {
        raw *= base.executeMult;
      }
    } else if ((plan.airDamageMult || 1) > 1 && e.flying) {
      raw *= plan.airDamageMult;
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
    this._applyStatus(e, plan.status || {});
    if (tower) this._grantXp(tower, 1);
    this.world.emit("hit", {
      enemyId: e.id,
      damage: dmg,
      type: plan.emp ? "shock" : dtype,
      x: e.pos.x,
      y: e.pos.y,
    });
  }

  _applyStatus(e, status) {
    if (status.burn) {
      e.burnT = Math.max(e.burnT || 0, status.burn.duration);
      e.burnDps = Math.max(e.burnDps || 0, status.burn.dps);
      e.burnEvery = status.burn.every || 0.5;
    }
    if (status.poison) {
      e.poisonT = Math.max(e.poisonT || 0, status.poison.duration);
      e.poisonDps = Math.max(e.poisonDps || 0, status.poison.dps);
      e.poisonEvery = status.poison.every || 0.5;
    }
    if (status.slow) {
      e.slowT = Math.max(e.slowT || 0, status.slow.duration);
      e.slowAmount = Math.max(e.slowAmount || 0, status.slow.amount);
      if (e.slowAmount >= 1) e.slowAmount = 1;
    }
    if (status.shred) {
      e.shred = Math.max(e.shred || 0, status.shred.amount || 0);
      e.shredT = Math.max(e.shredT || 0, status.shred.duration || 0);
    }
  }

  _grantXp(tower, amount) {
    const cap = Math.max(1, tower.levelCap || 1, this.world.runLevelCap | 0);
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
      this.invalidatePlans();
      this.world.emit("tower_leveled", {
        tower,
        level: tower.level,
        pendingPicks: tower.pendingPicks | 0,
        x: tower.cell.x + 0.5,
        y: tower.cell.y + 0.5,
      });
      this.world.emit("level_pick_ready", {
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
      this.world.logAction("auto_level", {
        id: tower.id,
        level: tower.level,
        gained,
        pendingPicks: tower.pendingPicks | 0,
      });
    }
  }

  _tickStatus() {
    const dt = this.world.dt;
    for (const e of this.world.enemies) {
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.burnAcc = (e.burnAcc || 0) + dt;
        if (e.burnAcc >= (e.burnEvery || 0.5)) {
          e.burnAcc -= e.burnEvery || 0.5;
          let tick = e.burnDps || 1;
          if ((e.armorKind || "none") === "none") tick *= 1.35;
          else if ((e.armorKind === "plate" || e.armorKind === "insulated") && (e.shred || 0) < (e.armorFlat || 0)) tick *= 0.55;
          e.hp -= tick;
        }
        e._fxBurn = (e._fxBurn || 0) + dt;
        if (e._fxBurn > 0.12) {
          e._fxBurn = 0;
          this.world.emit("status_fx", { x: e.pos.x, y: e.pos.y, type: "fire" });
        }
      }
      if (e.poisonT > 0) {
        e.poisonT -= dt;
        e.poisonAcc = (e.poisonAcc || 0) + dt;
        if (e.poisonAcc >= (e.poisonEvery || 0.5)) {
          e.poisonAcc -= e.poisonEvery || 0.5;
          let tick = e.poisonDps || 1;
          // Burn x poison: flames cook the toxin — burning targets take +50% poison
          if ((e.burnT || 0) > 0) tick *= 1.5;
          e.hp -= tick;
        }
        e._fxPoison = (e._fxPoison || 0) + dt;
        if (e._fxPoison > 0.16) {
          e._fxPoison = 0;
          this.world.emit("status_fx", { x: e.pos.x, y: e.pos.y, type: "poison" });
        }
      }
      if (e.slowT > 0) {
        e.slowT -= dt;
        if (e.slowT <= 0) e.slowAmount = 0;
        else {
          e._fxSlow = (e._fxSlow || 0) + dt;
          if (e._fxSlow > 0.22) {
            e._fxSlow = 0;
            this.world.emit("status_fx", { x: e.pos.x, y: e.pos.y, type: "frost" });
          }
        }
      }
      if (e.shredT > 0) {
        e.shredT -= dt;
        if (e.shredT <= 0) e.shred = 0;
        else {
          e._fxShred = (e._fxShred || 0) + dt;
          if (e._fxShred > 0.2) {
            e._fxShred = 0;
            this.world.emit("status_fx", { x: e.pos.x, y: e.pos.y, type: "acid" });
          }
        }
      }
    }
  }

  _selectTarget(t, plan) {
    const doctrine = plan.doctrine || PARTS.bases[t.base]?.doctrine || "first";
    const candidates = this._targetsInRange(t, plan);
    if (!candidates.length) return null;
    if (doctrine === "flying") {
      const air = candidates.filter((e) => e.flying);
      return this._bestByDoctrine(air.length ? air : candidates, t, "first");
    }
    return this._bestByDoctrine(candidates, t, doctrine);
  }

  _targetsInRange(t, plan) {
    const ox = t.cell.x + 0.5;
    const oy = t.cell.y + 0.5;
    const out = [];
    for (const e of this.world.enemies) {
      if (e.hp <= 0) continue;
      if (e.flying && !plan.airCapable) continue;
      const dist = Math.hypot(e.pos.x - ox, e.pos.y - oy);
      if (dist > plan.rangeCells) continue;
      out.push(e);
    }
    return out;
  }

  _bestByDoctrine(list, t, doctrine) {
    const ox = t.cell.x + 0.5;
    const oy = t.cell.y + 0.5;
    let best = null;
    let bestScore = -1e9;
    for (const e of list) {
      const dist = Math.hypot(e.pos.x - ox, e.pos.y - oy);
      let score = 0;
      switch (doctrine) {
        case "last":
          // furthest from exit among path (rear of pack / leak side)
          score = e.flying
            ? this.world.grid.airDist[this.world.grid.idx(e.cell.x, e.cell.y)]
            : this.world.grid.groundDistance(e.cell.x, e.cell.y);
          break;
        case "strongest":
          score = e.hp;
          break;
        case "weakest":
          score = -e.hp;
          break;
        case "closest":
          score = -dist;
          break;
        case "first":
        default:
          score = e.flying
            ? -this.world.grid.airDist[this.world.grid.idx(e.cell.x, e.cell.y)]
            : -this.world.grid.groundDistance(e.cell.x, e.cell.y);
      }
      if (!best || score > bestScore) {
        best = e;
        bestScore = score;
      }
    }
    return best;
  }
}
