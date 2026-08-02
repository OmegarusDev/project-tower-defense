/** Ink & brass VFX — drawn in board-local space (camera transform applied by BoardView). */

import { withAlpha } from "./drawUtil.js";

export class FxSystem {
  constructor() {
    this.items = [];
  }

  clear() {
    this.items.length = 0;
  }

  hit(x, y, type = "kinetic") {
    const n = type === "kinetic" ? 5 : 8;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.1 + Math.random() * 2.2;
      this.items.push({
        kind: "spark",
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.28 + Math.random() * 0.22,
        max: 0.5,
        type,
        size: 1.4 + Math.random() * 2.2,
      });
    }
    if (type !== "kinetic") {
      this.items.push({
        kind: "ring",
        x,
        y,
        life: 0.22,
        max: 0.22,
        type,
        r0: 0.08,
        r1: type === "shock" ? 0.5 : 0.38,
      });
    }
  }

  chain(x0, y0, x1, y1) {
    this.items.push({
      kind: "bolt",
      x0,
      y0,
      x1,
      y1,
      life: 0.18,
      max: 0.18,
      type: "shock",
      seed: Math.random() * 1000,
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

  /** Soft portal mote (board cell coords). */
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

  tick(dt) {
    for (let i = 0; i < this.items.length; ) {
      const it = this.items[i];
      it.life -= dt;
      if (it.kind === "spark") {
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        it.vx *= 0.9;
        it.vy *= 0.9;
        it.vy += 0.8 * dt;
      } else if (it.kind === "puff") {
        it.y += it.vy * dt;
      }
      if (it.life <= 0) this.items.splice(i, 1);
      else i++;
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
        ctx.globalAlpha = a;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.4;
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(a0.x, a0.y);
        const jx = (a0.x + a1.x) / 2 + Math.sin(it.seed + a * 8) * 8;
        const jy = (a0.y + a1.y) / 2 + Math.cos(it.seed * 1.3) * 6;
        ctx.lineTo(jx, jy);
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
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }
}
