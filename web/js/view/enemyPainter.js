/** Procedural enemy silhouettes — same 2.5D language as towers. */

import { cyl25, box25, frustum25 } from "./towerPainter.js";
import { deckRy } from "./view25.js";
import { shade, withAlpha, matsFrom } from "./drawUtil.js";

/**
 * Draw an enemy body at screen center (cx, cy) with footprint scale s.
 * @param {string} silhouette enemy silhouette id
 */
export function drawEnemyBody(ctx, palette, silhouette, cx, cy, s) {
  const kind = silhouette || "grub";
  const col = palette.enemyColor(kind);
  const m = matsFrom(col);
  const fn = PAINTERS[kind] || PAINTERS.grub;
  fn(ctx, cx, cy, s, m, palette);
}

const PAINTERS = {
  grub(ctx, cx, cy, s, m) {
    const rise = s * 0.15;
    cyl25(ctx, cx, cy - rise * 0.5, s * 0.22, rise, m.top, m.side, m.sideDark);
    // head nub
    cyl25(ctx, cx, cy - rise * 1.05, s * 0.12, s * 0.08, m.topHi || m.top, m.side, m.sideDark);
  },

  runner(ctx, cx, cy, s, m) {
    frustum25(ctx, cx, cy - s * 0.24, s * 0.08, s * 0.26, s * 0.22, m);
    // blade fins
    ctx.fillStyle = m.sideDark;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.28, cy + s * 0.02);
    ctx.lineTo(cx - s * 0.08, cy - s * 0.08);
    ctx.lineTo(cx - s * 0.1, cy + s * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.28, cy + s * 0.02);
    ctx.lineTo(cx + s * 0.08, cy - s * 0.08);
    ctx.lineTo(cx + s * 0.1, cy + s * 0.1);
    ctx.closePath();
    ctx.fill();
  },

  plate(ctx, cx, cy, s, m) {
    const w = s * 0.4;
    const h = s * 0.24;
    box25(ctx, cx, cy - h * 0.3, w, w * 0.75, h, m);
    // armor ridge
    box25(ctx, cx, cy - h * 0.85, w * 0.55, w * 0.4, h * 0.35, {
      ...m,
      top: shade(m.top, 0.12),
      side: shade(m.side, -0.05),
    });
  },

  skiff(ctx, cx, cy, s, m) {
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.28, s * 0.22, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    frustum25(ctx, cx, cy - s * 0.16, s * 0.26, s * 0.14, s * 0.12, m);
    // rotor ring
    ctx.strokeStyle = withAlpha(m.rim || m.top, 0.55);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy - s * 0.1, s * 0.36, s * 0.1, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  },

  aegis(ctx, cx, cy, s, m) {
    cyl25(ctx, cx, cy - s * 0.18, s * 0.24, s * 0.16, m.top, m.side, m.sideDark);
    // shield plate
    const steel = matsFrom("#8aa4b8");
    box25(ctx, cx, cy - s * 0.06, s * 0.42, s * 0.18, s * 0.1, steel);
    ctx.strokeStyle = withAlpha("#c8e0f0", 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy - s * 0.22, s * 0.3, deckRy(s * 0.3), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  },

  cluster(ctx, cx, cy, s, m) {
    const a = matsFrom(shade(m.top, -0.05));
    const b = matsFrom(shade(m.side, 0.08));
    cyl25(ctx, cx - s * 0.12, cy - s * 0.12, s * 0.14, s * 0.13, a.top, a.side, a.sideDark);
    cyl25(ctx, cx + s * 0.12, cy - s * 0.12, s * 0.14, s * 0.13, b.top, b.side, b.sideDark);
    cyl25(ctx, cx, cy - s * 0.22, s * 0.12, s * 0.1, m.top, m.side, m.sideDark);
    box25(ctx, cx, cy + s * 0.02, s * 0.32, s * 0.16, s * 0.08, m);
  },

  wraith(ctx, cx, cy, s, m) {
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.24, s * 0.16, s * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    frustum25(ctx, cx, cy - s * 0.2, s * 0.06, s * 0.22, s * 0.18, m);
    ctx.globalAlpha = 1;
    // ghost trail wisps
    ctx.strokeStyle = withAlpha(m.top, 0.35);
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.1, cy + s * 0.05);
    ctx.quadraticCurveTo(cx - s * 0.2, cy + s * 0.18, cx - s * 0.05, cy + s * 0.22);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.1, cy + s * 0.05);
    ctx.quadraticCurveTo(cx + s * 0.2, cy + s * 0.18, cx + s * 0.05, cy + s * 0.22);
    ctx.stroke();
    ctx.lineWidth = 1;
  },

  furnace(ctx, cx, cy, s, m) {
    box25(ctx, cx, cy - s * 0.1, s * 0.36, s * 0.28, s * 0.22, m);
    // chimney
    cyl25(ctx, cx + s * 0.08, cy - s * 0.38, s * 0.08, s * 0.16, m.sideDark, m.side, m.sideDark);
    // ember glow
    ctx.fillStyle = withAlpha("#e07a3a", 0.55);
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.06, cy - s * 0.02, s * 0.08, deckRy(s * 0.06), 0, 0, Math.PI * 2);
    ctx.fill();
  },

  leech(ctx, cx, cy, s, m) {
    // coiled body
    cyl25(ctx, cx, cy - s * 0.06, s * 0.2, s * 0.12, m.top, m.side, m.sideDark);
    cyl25(ctx, cx + s * 0.1, cy - s * 0.18, s * 0.14, s * 0.1, m.top, m.side, m.sideDark);
    cyl25(ctx, cx - s * 0.08, cy - s * 0.26, s * 0.1, s * 0.08, m.topHi || m.top, m.side, m.sideDark);
    // sucker ring
    ctx.strokeStyle = withAlpha("#c45a6a", 0.65);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.08, s * 0.16, deckRy(s * 0.1), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  },

  overlord(ctx, cx, cy, s, m) {
    const w = s * 0.48;
    const h = s * 0.3;
    box25(ctx, cx, cy - h * 0.25, w, w * 0.7, h, m);
    box25(ctx, cx, cy - h * 0.95, w * 0.7, w * 0.5, h * 0.45, {
      ...m,
      top: shade(m.top, 0.1),
    });
    // crown spikes
    const tip = matsFrom("#d4783a");
    for (const dx of [-0.16, 0, 0.16]) {
      frustum25(ctx, cx + s * dx, cy - h * 1.45, s * 0.04, s * 0.07, s * 0.12, tip);
    }
    // brass band
    ctx.strokeStyle = withAlpha("#c9a227", 0.7);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy - h * 0.2, w * 0.42, deckRy(w * 0.2), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  },
};
