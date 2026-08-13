/** Slag Host silhouettes — industrial reclaimers in the forgeworks dialect. */

import { cyl25, box25, frustum25 } from "./prims25.js";
import { deckRy } from "./view25.js";
import { shade, withAlpha, matsFrom } from "./drawUtil.js";

/**
 * @param {object} [opts] { t, phase, armorKind }
 */
export function drawEnemyBody(ctx, palette, silhouette, cx, cy, s, opts = {}) {
  const kind = silhouette || "mite";
  const col = palette.enemyColor(kind);
  const m = matsFrom(col);
  const t = opts.t || 0;
  const fn = PAINTERS[kind] || PAINTERS.mite;
  ctx.save();
  if (kind === "courier") {
    const lean = Math.sin(t * 16) * 0.05;
    ctx.translate(cx, cy);
    ctx.rotate(lean);
    ctx.translate(-cx, -cy);
  } else if (kind === "duct" || kind === "phantom") {
    cy += Math.sin(t * 3.4 + (opts.phase || 0)) * s * 0.045;
  } else if (kind === "siphon") {
    const pulse = 1 + Math.sin(t * 5.2) * 0.045;
    ctx.translate(cx, cy);
    ctx.scale(pulse, 1 / pulse);
    ctx.translate(-cx, -cy);
  } else if (kind === "claim") {
    cy += Math.sin(t * 1.5) * s * 0.012;
  }
  fn(ctx, cx, cy, s, m, palette, t, opts);
  if (kind === "hauler" || kind === "ward" || kind === "claim" || kind === "kiln") {
    brassRivets(ctx, cx, cy - s * 0.06, s * 0.26, kind === "claim" ? 5 : 3);
  }
  if (opts.armorKind === "energy" || kind === "ward") {
    // energy veil hint when energyBlock likely — soft rim
    if (opts.energyBlock) {
      ctx.strokeStyle = withAlpha("#9ec8f0", 0.55);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(cx, cy - s * 0.1, s * 0.34, deckRy(s * 0.32), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }
  ctx.restore();
}

function brassRivets(ctx, cx, cy, r, n) {
  ctx.fillStyle = withAlpha("#c9a227", 0.55);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.55, 1.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

function idPlate(ctx, cx, cy, w, h) {
  ctx.fillStyle = withAlpha("#c9a227", 0.35);
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.strokeStyle = withAlpha("#0a0c10", 0.4);
  ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
}

const PAINTERS = {
  mite(ctx, cx, cy, s, m) {
    const rise = s * 0.14;
    cyl25(ctx, cx, cy - rise * 0.45, s * 0.2, rise, m.top, m.side, m.sideDark);
    cyl25(ctx, cx, cy - rise * 1.0, s * 0.11, s * 0.07, m.topHi || m.top, m.side, m.sideDark);
    ctx.strokeStyle = withAlpha(m.sideDark, 0.6);
    ctx.lineWidth = 1;
    for (const oy of [0.25, 0.55]) {
      ctx.beginPath();
      ctx.ellipse(cx, cy - rise * oy, s * 0.18, deckRy(s * 0.08), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    brassRivets(ctx, cx, cy - rise * 0.3, s * 0.16, 4);
  },

  courier(ctx, cx, cy, s, m, _p, t = 0) {
    frustum25(ctx, cx, cy - s * 0.22, s * 0.07, s * 0.24, s * 0.2, m);
    // lash whip
    ctx.strokeStyle = withAlpha(m.side, 0.75);
    ctx.lineWidth = 1.8;
    const whip = Math.sin(t * 12) * s * 0.08;
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.08, cy - s * 0.05);
    ctx.quadraticCurveTo(cx + s * 0.28, cy + whip, cx + s * 0.22, cy + s * 0.18);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = m.sideDark;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.26, cy + s * 0.02);
    ctx.lineTo(cx - s * 0.06, cy - s * 0.1);
    ctx.lineTo(cx - s * 0.08, cy + s * 0.1);
    ctx.closePath();
    ctx.fill();
    idPlate(ctx, cx, cy - s * 0.28, s * 0.12, s * 0.05);
  },

  hauler(ctx, cx, cy, s, m) {
    const w = s * 0.42;
    const h = s * 0.22;
    // treads
    ctx.fillStyle = shade(m.sideDark, -0.1);
    ctx.fillRect(cx - w * 0.55, cy + h * 0.15, w * 1.1, h * 0.35);
    box25(ctx, cx, cy - h * 0.25, w, w * 0.72, h, m);
    box25(ctx, cx, cy - h * 0.8, w * 0.55, w * 0.4, h * 0.32, {
      ...m,
      top: shade(m.top, 0.1),
    });
    // weld crack
    ctx.strokeStyle = withAlpha("#0a0c10", 0.5);
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.22, cy - h * 0.1);
    ctx.lineTo(cx + w * 0.08, cy + h * 0.05);
    ctx.lineTo(cx + w * 0.25, cy - h * 0.25);
    ctx.stroke();
    idPlate(ctx, cx, cy - h * 0.15, s * 0.14, s * 0.05);
  },

  duct(ctx, cx, cy, s, m, _p, t = 0) {
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.28, s * 0.22, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    frustum25(ctx, cx, cy - s * 0.14, s * 0.28, s * 0.12, s * 0.11, m);
    const spin = t * 9;
    ctx.strokeStyle = withAlpha(m.rim || m.top, 0.6);
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.ellipse(cx, cy - s * 0.08, s * 0.36, s * 0.1, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = withAlpha("#c8d0e0", 0.28);
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const a = spin + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * s * 0.1, cy - s * 0.08 + Math.sin(a) * s * 0.035);
      ctx.lineTo(cx + Math.cos(a) * s * 0.34, cy - s * 0.08 + Math.sin(a) * s * 0.1);
      ctx.stroke();
    }
  },

  ward(ctx, cx, cy, s, m) {
    cyl25(ctx, cx, cy - s * 0.16, s * 0.22, s * 0.15, m.top, m.side, m.sideDark);
    const steel = matsFrom("#8aa4b8");
    box25(ctx, cx, cy - s * 0.04, s * 0.4, s * 0.16, s * 0.1, steel);
    ctx.strokeStyle = withAlpha("#c8e0f0", 0.55);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy - s * 0.2, s * 0.28, deckRy(s * 0.28), 0, 0, Math.PI * 2);
    ctx.stroke();
    idPlate(ctx, cx + s * 0.08, cy - s * 0.12, s * 0.1, s * 0.04);
    ctx.lineWidth = 1;
  },

  cask(ctx, cx, cy, s, m) {
    const a = matsFrom(shade(m.top, -0.05));
    const b = matsFrom(shade(m.side, 0.08));
    box25(ctx, cx, cy + s * 0.02, s * 0.34, s * 0.18, s * 0.1, m);
    cyl25(ctx, cx - s * 0.12, cy - s * 0.14, s * 0.13, s * 0.14, a.top, a.side, a.sideDark);
    cyl25(ctx, cx + s * 0.12, cy - s * 0.14, s * 0.13, s * 0.14, b.top, b.side, b.sideDark);
    // split seam
    ctx.strokeStyle = withAlpha("#c9a227", 0.5);
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.22);
    ctx.lineTo(cx, cy + s * 0.08);
    ctx.stroke();
    ctx.setLineDash([]);
  },

  phantom(ctx, cx, cy, s, m, _p, t = 0) {
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.22, s * 0.14, s * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7 + 0.12 * Math.sin(t * 4);
    frustum25(ctx, cx, cy - s * 0.18, s * 0.05, s * 0.2, s * 0.16, m);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = withAlpha("#e07a3a", 0.35);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.08, cy + s * 0.02);
    ctx.quadraticCurveTo(cx - s * 0.18, cy + s * 0.16, cx - s * 0.02, cy + s * 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.08, cy + s * 0.02);
    ctx.quadraticCurveTo(cx + s * 0.18, cy + s * 0.16, cx + s * 0.02, cy + s * 0.2);
    ctx.stroke();
    ctx.lineWidth = 1;
  },

  kiln(ctx, cx, cy, s, m, _p, t = 0) {
    box25(ctx, cx, cy - s * 0.08, s * 0.38, s * 0.28, s * 0.24, m);
    cyl25(ctx, cx + s * 0.1, cy - s * 0.4, s * 0.09, s * 0.18, m.sideDark, m.side, m.sideDark);
    const glow = 0.4 + 0.28 * (0.5 + 0.5 * Math.sin(t * 6));
    ctx.fillStyle = withAlpha("#e07a3a", glow);
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.06, cy, s * 0.1, deckRy(s * 0.07), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha("#ffb060", glow * 0.4);
    ctx.beginPath();
    ctx.arc(cx + s * 0.1, cy - s * 0.52, s * 0.045, 0, Math.PI * 2);
    ctx.fill();
    // grate lines
    ctx.strokeStyle = withAlpha("#0a0c10", 0.45);
    for (const dx of [-0.08, 0, 0.08]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * dx, cy - s * 0.02);
      ctx.lineTo(cx + s * dx, cy + s * 0.1);
      ctx.stroke();
    }
  },

  siphon(ctx, cx, cy, s, m, _p, t = 0) {
    cyl25(ctx, cx, cy - s * 0.04, s * 0.22, s * 0.12, m.top, m.side, m.sideDark);
    cyl25(ctx, cx + s * 0.12, cy - s * 0.16, s * 0.14, s * 0.1, m.top, m.side, m.sideDark);
    cyl25(ctx, cx - s * 0.1, cy - s * 0.24, s * 0.1, s * 0.08, m.topHi || m.top, m.side, m.sideDark);
    const pulse = 0.45 + 0.3 * (0.5 + 0.5 * Math.sin(t * 5));
    ctx.strokeStyle = withAlpha("#c45a6a", pulse);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.1, s * 0.18, deckRy(s * 0.11), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  },

  claim(ctx, cx, cy, s, m, _p, t = 0) {
    const w = s * 0.5;
    const h = s * 0.28;
    box25(ctx, cx, cy - h * 0.2, w, w * 0.68, h, m);
    box25(ctx, cx, cy - h * 0.9, w * 0.72, w * 0.48, h * 0.42, {
      ...m,
      top: shade(m.top, 0.08),
    });
    // excavator head
    const tip = matsFrom("#d4783a");
    for (const dx of [-0.18, 0, 0.18]) {
      frustum25(ctx, cx + s * dx, cy - h * 1.4, s * 0.045, s * 0.08, s * 0.14, tip);
    }
    const glow = 0.5 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.2));
    ctx.strokeStyle = withAlpha("#c9a227", glow);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(cx, cy - h * 0.15, w * 0.4, deckRy(w * 0.18), 0, 0, Math.PI * 2);
    ctx.stroke();
    idPlate(ctx, cx, cy - h * 0.35, s * 0.16, s * 0.055);
    ctx.lineWidth = 1;
  },
};
