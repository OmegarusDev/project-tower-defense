/**
 * Generic enemy renderer — interprets ENEMY_VISUALS over the shared 2.5D
 * primitives with the oracle painter's exact wrapper (animation transform,
 * brass rivets, energy veil). Golden-verified per kind.
 */
import { deckRy } from "../view25.js";
import { cyl25, box25, frustum25 } from "../prims25.js";
import { shade, withAlpha, matsFrom } from "../drawUtil.js";
import { ENEMY_VISUALS } from "./enemyVisuals.js";

const BRASS = withAlpha("#c9a227", 0.55);
const ID_PLATE = "#c9a227";

export function renderEnemyNext(ctx, palette, kind, cx, cy, s, opts = {}) {
  const col = palette.enemyColor(kind);
  const m = matsFrom(col);
  const t = opts.t || 0;
  const def = ENEMY_VISUALS[kind] || ENEMY_VISUALS.mite;
  const m2 = { ...m };
  const steel = matsFrom("#8aa4b8");
  m2.steelTop = steel.top;
  m2.steelSide = steel.side;
  m2.steelDark = steel.sideDark;
  m2.tread = shade(m.sideDark, -0.1);
  m2.weld = "#0a0c10";
  m2.shadow = "#000000";
  m2.spoke = "#c8d0e0";
  m2.veil = "#c8e0f0";
  m2.seam = "#c9a227";
  m2.ember = "#e07a3a";
  m2.glow = "#e07a3a";
  m2.glow2 = "#ffb060";
  m2.grate = "#0a0c10";
  m2.pulse = "#c45a6a";
  m2.gold = "#c9a227";
  m2.eye = "#a8f0c8";
  m2.eyeRing = "#5a8a70";
  m2.rim = m.rim || m.top;
  const tip = matsFrom("#d4783a");
  m2.tip = tip.top;
  m2.tipSide = tip.side;
  m2.tipDark = tip.sideDark;
  const bar = matsFrom(shade(m.top, -0.05));
  const barB = matsFrom(shade(m.side, 0.08));
  m2.barrelA = bar.top;
  m2.barrelASide = bar.side;
  m2.barrelADark = bar.sideDark;
  m2.barrelB = barB.top;
  m2.barrelBSide = barB.side;
  m2.barrelBDark = barB.sideDark;

  ctx.save();
  applyAnim(ctx, def, kind, cx, cy, s, t, opts);
  for (const [prim, e] of def.parts || []) {
    drawPart(ctx, prim, e, cx, cy, s, m2, m, t);
  }
  if (def.rivets) brassRivets(ctx, cx, cy - s * 0.06, s * def.rivets.r, def.rivets.n);
  if ((opts.armorKind === "energy" || kind === "ward") && opts.energyBlock) {
    ctx.strokeStyle = withAlpha("#9ec8f0", 0.55);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy - s * 0.1, s * 0.34, deckRy(s * 0.32), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  ctx.restore();
}

function applyAnim(ctx, def, kind, cx, cy, s, t, opts) {
  if (kind === "courier") {
    const lean = Math.sin(t * 16) * 0.05;
    ctx.translate(cx, cy);
    ctx.rotate(lean);
    ctx.translate(-cx, -cy);
  } else if (kind === "duct" || kind === "phantom") {
    const bob = Math.sin(t * 3.4 + (opts.phase || 0)) * s * 0.045;
    ctx.translate(0, bob);
  } else if (kind === "siphon") {
    const pulse = 1 + Math.sin(t * 5.2) * 0.045;
    ctx.translate(cx, cy);
    ctx.scale(pulse, 1 / pulse);
    ctx.translate(-cx, -cy);
  } else if (kind === "claim") {
    ctx.translate(0, Math.sin(t * 1.5) * s * 0.012);
  }
  void def;
}

function drawPart(ctx, prim, e, cx, cy, s, m2, m, t) {
  const cyU = cy - e.yTop * s;
  switch (prim) {
    case "cyl":
      cyl25(ctx, cx + (e.x || 0) * s, cyU, e.rx * s, e.rise * s, m2[e.top] ?? m[e.top], m2[e.side] ?? m[e.side], m2[e.bottom] ?? m[e.bottom]);
      break;
    case "box":
      box25(ctx, cx + (e.x || 0) * s, cyU, e.w * s, e.d * s, e.h * s, {
        top: e.topShade != null ? shade(m2[e.top] ?? m[e.top], e.topShade) : m2[e.top] ?? m[e.top],
        side: m2[e.side] ?? m[e.side],
        sideDark: m2[e.dark] ?? m[e.dark],
      });
      break;
    case "frustum": {
      const alpha = typeof e.alpha === "function" ? e.alpha(t) : null;
      if (alpha != null) ctx.globalAlpha = alpha;
      frustum25(ctx, cx + (e.x || 0) * s, cyU, e.rxBot * s, e.rxTop * s, e.rise * s, {
        top: m2[e.top] ?? m[e.top],
        side: m2[e.side] ?? m[e.side],
        sideDark: m2[e.dark] ?? m[e.dark],
      });
      if (alpha != null) ctx.globalAlpha = 1;
      break;
    }
    case "ellipseStroke":
      ctx.strokeStyle = withAlpha(m2[e.color] ?? m[e.color], typeof e.alpha === "function" ? e.alpha(t) : e.alpha);
      ctx.lineWidth = e.lw;
      ctx.beginPath();
      ctx.ellipse(cx + (e.x || 0) * s, cyU, e.rx * s, e.plainRy ? e.ry * s : deckRy(e.ry * s), 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "ellipseFill":
      ctx.fillStyle = withAlpha(m2[e.color] ?? m[e.color], typeof e.alpha === "function" ? e.alpha(t) : e.alpha);
      ctx.beginPath();
      ctx.ellipse(cx + (e.x || 0) * s, cyU, e.rx * s, e.plainRy ? e.ry * s : deckRy(e.ry * s), 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "arcFill":
      ctx.fillStyle = withAlpha(m2[e.color] ?? m[e.color], typeof e.alpha === "function" ? e.alpha(t) : e.alpha);
      ctx.beginPath();
      ctx.arc(cx + (e.x || 0) * s, cyU, e.r * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "poly": {
      ctx.fillStyle = m2[e.fill] ?? m[e.fill];
      ctx.beginPath();
      const pts = e.pts;
      ctx.moveTo(cx + pts[0][0] * s, cy + pts[0][1] * s);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(cx + pts[i][0] * s, cy + pts[i][1] * s);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "polyline": {
      ctx.strokeStyle = withAlpha(m2[e.color] ?? m[e.color], e.alpha);
      ctx.lineWidth = e.lw;
      ctx.beginPath();
      const pts = e.pts;
      ctx.moveTo(cx + pts[0][0] * s, cy + pts[0][1] * s);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(cx + pts[i][0] * s, cy + pts[i][1] * s);
      ctx.stroke();
      break;
    }
    case "quadratic": {
      ctx.strokeStyle = withAlpha(m2[e.color] ?? m[e.color], e.alpha);
      ctx.lineWidth = e.lw;
      ctx.beginPath();
      const p0 = e.pts[0], p1 = e.pts[1], p2 = e.pts[2];
      const whip = e.whip ? Math.sin(t * 12) * s * 0.08 : 0;
      ctx.moveTo(cx + p0[0] * s, cy + p0[1] * s);
      ctx.quadraticCurveTo(cx + p1[0] * s, cy + p1[1] * s + whip, cx + p2[0] * s, cy + p2[1] * s);
      ctx.stroke();
      ctx.lineWidth = 1;
      break;
    }
    case "dashLine": {
      ctx.strokeStyle = withAlpha(m2[e.color] ?? m[e.color], e.alpha);
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(cx + e.pts[0][0] * s, cy + e.pts[0][1] * s);
      ctx.lineTo(cx + e.pts[1][0] * s, cy + e.pts[1][1] * s);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "fillRect":
      ctx.fillStyle = m2[e.color] ?? m[e.color];
      ctx.fillRect(cx + e.x * s, cy + e.y * s, e.w * s, e.h * s);
      break;
    case "brass":
      brassRivets(ctx, cx, cy - e.yTop * s, e.r * s, e.n);
      break;
    case "spokes": {
      ctx.strokeStyle = withAlpha(m2[e.color] ?? m[e.color], e.alpha);
      ctx.lineWidth = e.lw;
      const spin = t * 9;
      for (let i = 0; i < e.n; i++) {
        const a = spin + (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * e.r0 * s, cyU + Math.sin(a) * e.ry0 * s);
        ctx.lineTo(cx + Math.cos(a) * e.r1 * s, cyU + Math.sin(a) * e.ry1 * s);
        ctx.stroke();
      }
      break;
    }
    case "lineGrate": {
      ctx.strokeStyle = withAlpha(m2[e.color] ?? m[e.color], e.alpha);
      for (const dx of e.xs) {
        ctx.beginPath();
        ctx.moveTo(cx + dx * s, cy - e.y0 * s);
        ctx.lineTo(cx + dx * s, cy - e.y1 * s);
        ctx.stroke();
      }
      break;
    }
    case "plate": {
      ctx.fillStyle = withAlpha(ID_PLATE, 0.35);
      ctx.fillRect(cx + (e.x || 0) * s - (e.w * s) / 2, cy - e.yTop * s - (e.h * s) / 2, e.w * s, e.h * s);
      ctx.strokeStyle = withAlpha("#0a0c10", 0.4);
      ctx.strokeRect(cx + (e.x || 0) * s - (e.w * s) / 2, cy - e.yTop * s - (e.h * s) / 2, e.w * s, e.h * s);
      break;
    }
  }
}

function brassRivets(ctx, cx, cy, r, n) {
  ctx.fillStyle = BRASS;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.55, 1.35, 0, Math.PI * 2);
    ctx.fill();
  }
}
