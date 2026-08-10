/** Procedural enemy silhouettes — same 2.5D language as towers. */

import { cyl25, box25, frustum25 } from "./towerPainter.js";
import { deckRy } from "./view25.js";
import { shade, withAlpha, matsFrom } from "./drawUtil.js";

/**
 * Draw an enemy body at screen center (cx, cy) with footprint scale s.
 * @param {object} [opts] { t, flying }
 */
export function drawEnemyBody(ctx, palette, silhouette, cx, cy, s, opts = {}) {
  const kind = silhouette || "grub";
  const col = palette.enemyColor(kind);
  const m = matsFrom(col);
  const t = opts.t || 0;
  const fn = PAINTERS[kind] || PAINTERS.grub;
  ctx.save();
  // Kind motion tells
  if (kind === "runner") {
    const lean = Math.sin(t * 14) * 0.04;
    ctx.translate(cx, cy);
    ctx.rotate(lean);
    ctx.translate(-cx, -cy);
  } else if (kind === "skiff" || kind === "wraith") {
    cy += Math.sin(t * 3.2 + (opts.phase || 0)) * s * 0.04;
  } else if (kind === "leech") {
    const pulse = 1 + Math.sin(t * 5) * 0.04;
    ctx.translate(cx, cy);
    ctx.scale(pulse, 1 / pulse);
    ctx.translate(-cx, -cy);
  } else if (kind === "furnace") {
    // ember handled in painter
  } else if (kind === "overlord") {
    cy += Math.sin(t * 1.6) * s * 0.015;
  }
  fn(ctx, cx, cy, s, m, palette, t);
  // Shared brass rivet trim on armored kinds
  if (kind === "plate" || kind === "aegis" || kind === "overlord") {
    brassRivets(ctx, cx, cy - s * 0.08, s * 0.28, 3);
  }
  ctx.restore();
}

function brassRivets(ctx, cx, cy, r, n) {
  ctx.fillStyle = withAlpha("#c9a227", 0.55);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.55, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

const PAINTERS = {
  grub(ctx, cx, cy, s, m) {
    const rise = s * 0.15;
    cyl25(ctx, cx, cy - rise * 0.5, s * 0.22, rise, m.top, m.side, m.sideDark);
    cyl25(ctx, cx, cy - rise * 1.05, s * 0.12, s * 0.08, m.topHi || m.top, m.side, m.sideDark);
    // segment rings
    ctx.strokeStyle = withAlpha(m.sideDark, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy - rise * 0.35, s * 0.2, deckRy(s * 0.1), 0, 0, Math.PI * 2);
    ctx.stroke();
  },

  runner(ctx, cx, cy, s, m) {
    frustum25(ctx, cx, cy - s * 0.24, s * 0.08, s * 0.26, s * 0.22, m);
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
    // speed notch
    ctx.strokeStyle = withAlpha("#f0c878", 0.45);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.05, cy - s * 0.32);
    ctx.lineTo(cx + s * 0.05, cy - s * 0.32);
    ctx.stroke();
  },

  plate(ctx, cx, cy, s, m) {
    const w = s * 0.4;
    const h = s * 0.24;
    box25(ctx, cx, cy - h * 0.3, w, w * 0.75, h, m);
    box25(ctx, cx, cy - h * 0.85, w * 0.55, w * 0.4, h * 0.35, {
      ...m,
      top: shade(m.top, 0.12),
      side: shade(m.side, -0.05),
    });
    // cracked plate line
    ctx.strokeStyle = withAlpha("#0a0c10", 0.45);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.25, cy - h * 0.2);
    ctx.lineTo(cx + w * 0.1, cy - h * 0.05);
    ctx.lineTo(cx + w * 0.28, cy - h * 0.35);
    ctx.stroke();
  },

  skiff(ctx, cx, cy, s, m, _p, t = 0) {
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.28, s * 0.22, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    frustum25(ctx, cx, cy - s * 0.16, s * 0.26, s * 0.14, s * 0.12, m);
    const spin = t * 8;
    ctx.strokeStyle = withAlpha(m.rim || m.top, 0.55);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy - s * 0.1, s * 0.36, s * 0.1, 0, 0, Math.PI * 2);
    ctx.stroke();
    // rotor blur spokes
    ctx.strokeStyle = withAlpha("#c8d0e0", 0.25);
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const a = spin + (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * s * 0.12, cy - s * 0.1 + Math.sin(a) * s * 0.04);
      ctx.lineTo(cx + Math.cos(a) * s * 0.34, cy - s * 0.1 + Math.sin(a) * s * 0.1);
      ctx.stroke();
    }
  },

  aegis(ctx, cx, cy, s, m) {
    cyl25(ctx, cx, cy - s * 0.18, s * 0.24, s * 0.16, m.top, m.side, m.sideDark);
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
    ctx.strokeStyle = withAlpha("#c9a227", 0.4);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.1, cy - s * 0.06);
    ctx.lineTo(cx + s * 0.1, cy - s * 0.06);
    ctx.stroke();
  },

  wraith(ctx, cx, cy, s, m, _p, t = 0) {
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.24, s * 0.16, s * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.75 + 0.1 * Math.sin(t * 4);
    frustum25(ctx, cx, cy - s * 0.2, s * 0.06, s * 0.22, s * 0.18, m);
    ctx.globalAlpha = 1;
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

  furnace(ctx, cx, cy, s, m, _p, t = 0) {
    box25(ctx, cx, cy - s * 0.1, s * 0.36, s * 0.28, s * 0.22, m);
    cyl25(ctx, cx + s * 0.08, cy - s * 0.38, s * 0.08, s * 0.16, m.sideDark, m.side, m.sideDark);
    const glow = 0.4 + 0.25 * (0.5 + 0.5 * Math.sin(t * 6));
    ctx.fillStyle = withAlpha("#e07a3a", glow);
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.06, cy - s * 0.02, s * 0.08, deckRy(s * 0.06), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha("#ffb060", glow * 0.45);
    ctx.beginPath();
    ctx.arc(cx + s * 0.08, cy - s * 0.48, s * 0.04, 0, Math.PI * 2);
    ctx.fill();
  },

  leech(ctx, cx, cy, s, m, _p, t = 0) {
    cyl25(ctx, cx, cy - s * 0.06, s * 0.2, s * 0.12, m.top, m.side, m.sideDark);
    cyl25(ctx, cx + s * 0.1, cy - s * 0.18, s * 0.14, s * 0.1, m.top, m.side, m.sideDark);
    cyl25(ctx, cx - s * 0.08, cy - s * 0.26, s * 0.1, s * 0.08, m.topHi || m.top, m.side, m.sideDark);
    const pulse = 0.45 + 0.25 * (0.5 + 0.5 * Math.sin(t * 5));
    ctx.strokeStyle = withAlpha("#c45a6a", pulse);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.08, s * 0.16, deckRy(s * 0.1), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  },

  overlord(ctx, cx, cy, s, m, _p, t = 0) {
    const w = s * 0.48;
    const h = s * 0.3;
    box25(ctx, cx, cy - h * 0.25, w, w * 0.7, h, m);
    box25(ctx, cx, cy - h * 0.95, w * 0.7, w * 0.5, h * 0.45, {
      ...m,
      top: shade(m.top, 0.1),
    });
    const tip = matsFrom("#d4783a");
    const glow = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.4));
    for (const dx of [-0.16, 0, 0.16]) {
      frustum25(ctx, cx + s * dx, cy - h * 1.45, s * 0.04, s * 0.07, s * 0.12, tip);
    }
    ctx.strokeStyle = withAlpha("#c9a227", glow);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy - h * 0.2, w * 0.42, deckRy(w * 0.2), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = withAlpha("#e8a04a", glow * 0.35);
    ctx.beginPath();
    ctx.ellipse(cx, cy - h * 1.55, s * 0.2, deckRy(s * 0.08), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1;
  },
};
