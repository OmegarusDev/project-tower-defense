/** Ink & brass VFX — board-local space; BoardView projects via camera. */

import { withAlpha, shade } from "./drawUtil.js";

export class FxSystem {
  constructor() {
    this.items = [];
    this.floats = [];
  }

  clear() {
    this.items.length = 0;
    this.floats.length = 0;
  }

  hit(x, y, type = "kinetic") {
    if (type === "kinetic") this._kineticScrap(x, y);
    else if (type === "fire") this._fireEmbers(x, y);
    else if (type === "shock") this._shockBurst(x, y);
    else if (type === "frost") this._frostShards(x, y);
    else if (type === "acid") this._acidDrip(x, y);
    else if (type === "poison") this._poisonWisp(x, y);
    else this._kineticScrap(x, y);

    if (type !== "kinetic") {
      this.items.push({
        kind: "ring",
        x,
        y,
        life: 0.28,
        max: 0.28,
        type,
        r0: 0.06,
        r1: type === "shock" ? 0.55 : 0.4,
      });
    }
  }

  muzzle(x, y, angle, type = "kinetic") {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    this.items.push({
      kind: "flash",
      x: x + c * 0.35,
      y: y + s * 0.35,
      life: 0.08,
      max: 0.08,
      type,
      angle,
    });
    for (let i = 0; i < 3; i++) {
      const spread = (Math.random() - 0.5) * 0.7;
      const a = angle + spread;
      const sp = 1.6 + Math.random() * 1.4;
      this.items.push({
        kind: "spark",
        x: x + c * 0.3,
        y: y + s * 0.3,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.12 + Math.random() * 0.08,
        max: 0.2,
        type,
        size: 1.2 + Math.random() * 1.4,
      });
    }
  }

  damageNumber(x, y, amount, type = "kinetic") {
    if (!(amount > 0)) return;
    this.floats.push({
      x: x + (Math.random() - 0.5) * 0.25,
      y: y - 0.15,
      text: amount >= 10 ? String(Math.round(amount)) : amount.toFixed(1),
      life: 0.7,
      max: 0.7,
      type,
      vy: -0.9,
    });
  }

  chain(x0, y0, x1, y1) {
    this.items.push({
      kind: "bolt",
      x0,
      y0,
      x1,
      y1,
      life: 0.22,
      max: 0.22,
      type: "shock",
      seed: Math.random() * 1000,
      kinks: 3,
    });
  }

  statusPuff(x, y, type) {
    this.items.push({
      kind: "puff",
      x: x + (Math.random() - 0.5) * 0.22,
      y: y + (Math.random() - 0.5) * 0.22,
      life: 0.4,
      max: 0.4,
      type,
      vy: -0.55 - Math.random() * 0.4,
    });
  }

  /**
   * Enemy death — soft scrap, plate shatter, or energy veil collapse.
   * @param {string} kind enemy kind id
   * @param {string} [armorKind] none|plate|insulated|energy
   */
  death(x, y, kind = "soft", armorKind = "none") {
    const armored = armorKind === "plate" || armorKind === "insulated" || kind === "hauler" || kind === "claim" || kind === "kiln";
    const energy = armorKind === "energy" || kind === "ward_volt";
    this.items.push({
      kind: "ring",
      x,
      y,
      life: 0.32,
      max: 0.32,
      type: energy ? "shock" : armored ? "kinetic" : "poison",
      r0: 0.05,
      r1: armored || energy ? 0.52 : 0.35,
    });
    const n = armored || energy ? 10 : 6;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.1 + Math.random() * (armored || energy ? 2.8 : 1.8);
      this.items.push({
        kind: armored ? "scrap" : energy ? "shard" : "spark",
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.4,
        life: 0.35 + Math.random() * 0.25,
        max: 0.6,
        type: energy ? "shock" : armored ? "kinetic" : kind === "kiln" ? "fire" : "kinetic",
        size: armored || energy ? 2 + Math.random() * 2.5 : 1.5 + Math.random() * 1.5,
        rot: Math.random() * Math.PI,
      });
    }
    if (!armored) {
      this.items.push({
        kind: "puff",
        x,
        y,
        life: 0.45,
        max: 0.45,
        type: energy ? "shock" : "poison",
        vy: -0.4,
      });
    }
  }

  portalMote(x, y) {
    const a = Math.random() * Math.PI * 2;
    const sp = 0.25 + Math.random() * 0.55;
    const inward = Math.random() > 0.45;
    this.items.push({
      kind: "spark",
      x: x + Math.cos(a) * (inward ? 0.28 : 0.08),
      y: y + Math.sin(a) * (inward ? 0.2 : 0.06),
      vx: Math.cos(a) * sp * (inward ? -1 : 1),
      vy: Math.sin(a) * sp * 0.55 * (inward ? -1 : 1),
      life: 0.5 + Math.random() * 0.35,
      max: 0.85,
      type: Math.random() > 0.5 ? "poison" : "frost",
      size: 1.4 + Math.random() * 2,
    });
  }

  _kineticScrap(x, y) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.2 + Math.random() * 2.4;
      this.items.push({
        kind: "scrap",
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.32 + Math.random() * 0.2,
        max: 0.52,
        type: "kinetic",
        size: 1.6 + Math.random() * 2,
        rot: Math.random() * Math.PI,
      });
    }
  }

  _fireEmbers(x, y) {
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const sp = 0.6 + Math.random() * 1.8;
      this.items.push({
        kind: "spark",
        x: x + (Math.random() - 0.5) * 0.15,
        y: y + (Math.random() - 0.5) * 0.1,
        vx: Math.cos(a) * sp * 0.4,
        vy: Math.sin(a) * sp - 0.8,
        life: 0.35 + Math.random() * 0.25,
        max: 0.6,
        type: "fire",
        size: 1.8 + Math.random() * 2.4,
      });
    }
  }

  _shockBurst(x, y) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.random() * 0.4;
      this.items.push({
        kind: "bolt",
        x0: x,
        y0: y,
        x1: x + Math.cos(a) * 0.35,
        y1: y + Math.sin(a) * 0.35,
        life: 0.16,
        max: 0.16,
        type: "shock",
        seed: Math.random() * 1000,
        kinks: 2,
      });
    }
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 2;
      this.items.push({
        kind: "spark",
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.2,
        max: 0.25,
        type: "shock",
        size: 1.5,
      });
    }
  }

  _frostShards(x, y) {
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.8 + Math.random() * 1.6;
      this.items.push({
        kind: "shard",
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.4 + Math.random() * 0.2,
        max: 0.6,
        type: "frost",
        size: 2 + Math.random() * 2.5,
        rot: a,
      });
    }
  }

  _acidDrip(x, y) {
    for (let i = 0; i < 6; i++) {
      this.items.push({
        kind: "drip",
        x: x + (Math.random() - 0.5) * 0.2,
        y: y - 0.05,
        vx: (Math.random() - 0.5) * 0.4,
        vy: 0.4 + Math.random() * 0.8,
        life: 0.45 + Math.random() * 0.2,
        max: 0.65,
        type: "acid",
        size: 1.8 + Math.random() * 1.5,
      });
    }
  }

  _poisonWisp(x, y) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      this.items.push({
        kind: "puff",
        x: x + Math.cos(a) * 0.1,
        y: y + Math.sin(a) * 0.08,
        life: 0.5,
        max: 0.5,
        type: "poison",
        vy: -0.35 - Math.random() * 0.35,
      });
    }
  }

  tick(dt) {
    for (let i = 0; i < this.items.length; ) {
      const it = this.items[i];
      it.life -= dt;
      if (it.kind === "spark" || it.kind === "scrap" || it.kind === "shard" || it.kind === "drip") {
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        it.vx *= 0.9;
        it.vy *= it.kind === "drip" ? 1.05 : 0.9;
        if (it.kind !== "drip") it.vy += 0.8 * dt;
        if (it.kind === "scrap" || it.kind === "shard") it.rot = (it.rot || 0) + dt * 6;
      } else if (it.kind === "puff") {
        it.y += it.vy * dt;
      }
      if (it.life <= 0) {
        const last = this.items.length - 1;
        this.items[i] = this.items[last];
        this.items.pop();
      } else i++;
    }
    for (let i = 0; i < this.floats.length; ) {
      const f = this.floats[i];
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 0.94;
      if (f.life <= 0) {
        const last = this.floats.length - 1;
        this.floats[i] = this.floats[last];
        this.floats.pop();
      } else i++;
    }
  }

  /** Draw in board space through BoardCamera.project. */
  drawProjected(ctx, cam, colorFn) {
    const cell = cam.cell;
    for (const it of this.items) {
      const a = Math.max(0, it.life / it.max);
      const col = colorFn(it.type);
      if (it.kind === "spark") {
        const p = cam.project(it.x * cell, it.y * cell);
        ctx.globalAlpha = a;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, it.size * a * p.s, 0, Math.PI * 2);
        ctx.fill();
      } else if (it.kind === "scrap") {
        const p = cam.project(it.x * cell, it.y * cell);
        const sz = it.size * a * p.s;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(it.rot || 0);
        ctx.globalAlpha = a;
        ctx.fillStyle = shade(col, -0.1);
        ctx.fillRect(-sz * 0.5, -sz * 0.25, sz, sz * 0.5);
        ctx.restore();
      } else if (it.kind === "shard") {
        const p = cam.project(it.x * cell, it.y * cell);
        const sz = it.size * a * p.s;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(it.rot || 0);
        ctx.globalAlpha = a;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(0, -sz);
        ctx.lineTo(sz * 0.45, sz * 0.5);
        ctx.lineTo(-sz * 0.45, sz * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (it.kind === "drip") {
        const p = cam.project(it.x * cell, it.y * cell);
        ctx.globalAlpha = a * 0.85;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, it.size * 0.45 * p.s, it.size * a * p.s, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (it.kind === "flash") {
        const p = cam.project(it.x * cell, it.y * cell);
        const r = (4 + a * 6) * p.s;
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2);
        glow.addColorStop(0, withAlpha("#fff8e0", 0.85 * a));
        glow.addColorStop(0.35, withAlpha(col, 0.55 * a));
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = 1;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (it.kind === "ring") {
        const p = cam.project(it.x * cell, it.y * cell);
        const r = (it.r0 + (it.r1 - it.r0) * (1 - a)) * cell * p.s;
        ctx.globalAlpha = a * 0.65;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (it.kind === "bolt") {
        const a0 = cam.project(it.x0 * cell, it.y0 * cell);
        const a1 = cam.project(it.x1 * cell, it.y1 * cell);
        const kinks = it.kinks || 1;
        ctx.globalAlpha = a;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.4;
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(a0.x, a0.y);
        for (let k = 1; k <= kinks; k++) {
          const t = k / (kinks + 1);
          const jx =
            a0.x + (a1.x - a0.x) * t + Math.sin(it.seed + a * 8 + k * 2.1) * (7 / kinks);
          const jy =
            a0.y + (a1.y - a0.y) * t + Math.cos(it.seed * 1.3 + k * 1.7) * (5 / kinks);
          ctx.lineTo(jx, jy);
        }
        ctx.lineTo(a1.x, a1.y);
        ctx.stroke();
        ctx.strokeStyle = withAlpha("#fff8e0", 0.5 * a);
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (it.kind === "puff") {
        const p = cam.project(it.x * cell, it.y * cell);
        ctx.globalAlpha = a * 0.7;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (2.5 + (1 - a) * 4) * p.s, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const f of this.floats) {
      const a = Math.max(0, f.life / f.max);
      const p = cam.project(f.x * cell, f.y * cell);
      const col = colorFn(f.type);
      ctx.globalAlpha = a;
      ctx.font = `700 ${Math.max(10, 13 * p.s)}px "Chakra Petch", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "rgba(10,12,16,0.75)";
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, p.x, p.y);
      ctx.fillStyle = col;
      ctx.fillText(f.text, p.x, p.y);
    }

    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }
}
