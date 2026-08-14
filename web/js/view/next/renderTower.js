/**
 * Generic tower renderer — interprets partVisuals over the unified two-factor
 * basis (groundBasis / capEllipse / prims25 / hubLiftFor / crownFactorFor).
 * Produces the ORACLE painter's exact pixels (golden-verified); the only
 * per-part knowledge lives in the visual data.
 */
import { VIEW25, deckRy, groundBasis, capEllipse } from "../view25.js";
import { vz, cyl25, ring25, rivetRing } from "../prims25.js";
import { shade, withAlpha, matsFrom } from "../drawUtil.js";
import { hubLiftFor, crownFactorFor } from "../towerPainter.js";
import { BASE_VISUALS, BARREL_VISUALS, PAYLOAD_VISUALS } from "./partVisuals.js";

const BASE_SCALE = 1.22;
const BARREL_SCALE = 0.8;

export function renderTowerNext(ctx, palette, t, px, py, s, opts = {}) {
  const cx = px + s / 2;
  const groundY = py + s / 2;
  const baseS = s * BASE_SCALE;
  const hubY = groundY - hubLiftFor(s, t.base);
  const angle = Number.isFinite(t.aimAngle) ? t.aimAngle : -Math.PI / 2;
  const b = groundBasis(angle);
  const barrelS = s * BARREL_SCALE;
  const metal = palette.barrelColor(t.barrel);
  const tip = palette.payloadColor(t.payload);
  const baseMats = matsFrom(palette.baseColor(t.base));
  const barrelMats = matsFrom(metal);

  drawGroundShadow(ctx, cx, groundY, baseS);
  drawBaseVisuals(ctx, cx, groundY, baseS, t.base, baseMats);
  drawTurretStem(ctx, cx, groundY, hubY, baseS, t.base, metal);
  drawTurret(ctx, t, cx, hubY, barrelS, b, metal, tip, barrelMats);
}

function drawGroundShadow(ctx, cx, groundY, s) {
  const rx = s * 0.38;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(cx + s * VIEW25.shadowSkew * 1.4, groundY + s * 0.08, rx * 1.15, deckRy(rx) * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.beginPath();
  ctx.ellipse(cx + s * VIEW25.shadowSkew, groundY + s * 0.06, rx, deckRy(rx), 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Interpret a base's visual list with the oracle painter's exact calls. */
function drawBaseVisuals(ctx, cx, groundY, s, base, m) {
  const deckY = groundY - vz(s, 0.02);
  const list = BASE_VISUALS[base] || [];
  for (const [prim, e] of list) {
    const yAt = (k) => deckY - vz(s, k);
    switch (prim) {
      case "cyl":
        cyl25(
          ctx,
          cx + e.x * s,
          yAt(e.y),
          e.rx * s,
          vz(s, e.rise),
          m[e.top],
          m[e.side],
          e.bottom ? m[e.bottom] : undefined
        );
        break;
      case "vents": {
        ctx.strokeStyle = withAlpha(m[e.color], 0.7);
        ctx.lineWidth = Math.max(1, s * e.w);
        for (const ox of e.xs) {
          ctx.beginPath();
          ctx.moveTo(cx + ox * s, yAt(e.y0));
          ctx.lineTo(cx + ox * s, yAt(e.y1));
          ctx.stroke();
        }
        break;
      }
      case "ring":
        ring25(ctx, cx, yAt(e.y), e.rx * s, withAlpha(m[e.color], e.alpha));
        break;
      case "ellipseStroke":
        ctx.strokeStyle = withAlpha(m[e.color], e.alpha);
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.ellipse(cx, yAt(e.y), e.rx * s, deckRy(e.rx * s), 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "rivets":
        rivetRing(ctx, cx, yAt(e.y), e.rx * s, e.n, m[e.color]);
        break;
    }
  }
}

/** Ported from drawTurretStem — bridge between base crown and hub. */
function drawTurretStem(ctx, cx, groundY, hubY, baseS, base, metal) {
  const crownY = groundY - vz(baseS, crownFactorFor(base));
  const topY = hubY + Math.max(1, baseS * 0.015);
  const rise = crownY - topY;
  if (rise < 3) return;
  cyl25(
    ctx,
    cx,
    topY,
    baseS * 0.05,
    rise,
    shade(metal, 0.08),
    shade(metal, -0.12),
    shade(metal, -0.28)
  );
}

/** Turret: hub + tube visuals + hub cap (drawn in a frame at (cx, hubY)). */
function drawTurret(ctx, t, cx, hubY, s, b, metal, tip, m) {
  ctx.save();
  ctx.translate(cx, hubY);
  const hubR = s * 0.125;
  drawHub(ctx, metal, hubR, b.D);
  const barrels = BARREL_VISUALS[t.barrel] || [];
  for (const [prim, e] of barrels) {
    if (prim === "tube") {
      drawTube(ctx, metal, tip, e.len * s, e.th * s, t.payload, b, 0, 0);
    }
  }
  drawHubCap(ctx, metal, hubR * 0.72, b.D);
  ctx.restore();
}

function drawHub(ctx, metal, r, D) {
  ctx.fillStyle = shade(metal, -0.3);
  ctx.beginPath();
  ctx.ellipse(0, r * 0.15, r, r * D, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(metal, -0.08);
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * D, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha("#fff8e0", 0.16);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(-r * 0.15, -r * 0.1, r * 0.55, r * 0.45 * D, -0.4, Math.PI * 1.1, Math.PI * 1.85);
  ctx.stroke();
}

function drawHubCap(ctx, metal, r, D) {
  ctx.fillStyle = shade(metal, 0.14);
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.05, r, r * D, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(shade(metal, -0.35), 0.7);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.05, r * 0.72, r * 0.72 * D, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = shade(metal, -0.22);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.35, r * 0.35 * D, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha("#fff8e0", 0.25);
  ctx.beginPath();
  ctx.ellipse(-r * 0.08, -r * 0.12, r * 0.12, r * 0.12 * D, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Exact orthographic cylinder (mirror of drawCannon) — tangent tubes + caps. */
function drawTube(ctx, metal, tip, length, th, payload, b, ox, oy) {
  const h = th;
  const r = h / 2;
  const L = length * b.len;
  const ex = ox + b.ax * L;
  const ey = oy + b.ay * L;
  const near = { x: ox, y: oy };
  const far = { x: ex, y: ey };
  const cap = capEllipse(b, r);
  const converge = 1 - 0.22 * b.depth;
  const fcap = { rx: cap.rx * converge, ry: cap.ry * converge, rot: cap.rot };

  const tanPts = (c, rx, ry, rot) => {
    const dx = b.ax * Math.cos(-rot) - b.ay * Math.sin(-rot);
    const dy = b.ax * Math.sin(-rot) + b.ay * Math.cos(-rot);
    const k = 1 / Math.sqrt(dx * dx / (rx * rx) + dy * dy / (ry * ry) || 1e-9);
    const s0 = (-k * dx) / rx;
    const co = (k * dy) / ry;
    const t0 = Math.atan2(s0, co);
    const pt = (t) => ({
      x: c.x + Math.cos(rot) * (rx * Math.cos(t)) - Math.sin(rot) * (ry * Math.sin(t)),
      y: c.y + Math.sin(rot) * (rx * Math.cos(t)) + Math.cos(rot) * (ry * Math.sin(t)),
    });
    return [pt(t0), pt(t0 + Math.PI)];
  };
  const [nA, nB] = tanPts(near, cap.rx, cap.ry, cap.rot);
  const [fA, fB] = tanPts(far, fcap.rx, fcap.ry, fcap.rot);

  if (b.depth > 0.05) {
    ctx.fillStyle = `rgba(0,0,0,${(0.14 + b.depth * 0.1).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse((ox + ex) * 0.5, (oy + ey) * 0.5 + h * 1.05, Math.abs(ex - ox) * 0.55, h * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const dark = shade(metal, -0.3);
  const mid = metal;
  const light = shade(metal, 0.2);
  ctx.beginPath();
  ctx.moveTo(nA.x, nA.y);
  ctx.lineTo(fA.x, fA.y);
  ctx.lineTo(fB.x, fB.y);
  ctx.lineTo(nB.x, nB.y);
  ctx.closePath();
  const topY = Math.min(nA.y, nB.y) - r * b.V * 0.1;
  const botY = Math.max(nA.y, nB.y) + r * b.V * 0.1;
  const grad = ctx.createLinearGradient(0, topY, 0, botY);
  grad.addColorStop(0, dark);
  grad.addColorStop(0.32, mid);
  grad.addColorStop(0.45, light);
  grad.addColorStop(0.58, light);
  grad.addColorStop(0.72, mid);
  grad.addColorStop(1, dark);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.fillStyle = shade(metal, -0.2);
  ctx.beginPath();
  ctx.ellipse(far.x, far.y, fcap.rx, fcap.ry, fcap.rot, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = shade(metal, -0.4);
  for (const t of [0.28, 0.55]) {
    const rx = ox + (ex - ox) * t;
    const ry = oy + (ey - oy) * t;
    ctx.fillRect(rx - h * 0.09, ry - r * b.V, h * 0.18, r * b.V * 2);
  }

  const capT = Math.max(2.5, length * 0.16);
  const tA = 1 - capT / length;
  ctx.fillStyle = withAlpha(shade(tip, -0.15), 0.9);
  ctx.beginPath();
  ctx.moveTo(ox + (ex - ox) * tA, oy + (ey - oy) * tA - r * b.V);
  ctx.lineTo(ex, ey - r * b.V);
  ctx.lineTo(ex, ey + r * b.V);
  ctx.lineTo(ox + (ex - ox) * tA, oy + (ey - oy) * tA + r * b.V);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(tip, -0.35);
  ctx.beginPath();
  ctx.ellipse(ex, ey, capT * 0.5 * b.D, capT * 0.5 * b.V, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tip;
  ctx.beginPath();
  ctx.ellipse(ex, ey, capT * 0.38 * b.D, capT * 0.38 * b.V, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha("#0a0c10", 0.7);
  ctx.beginPath();
  ctx.ellipse(ex, ey, capT * 0.16 * b.D, capT * 0.16 * b.V, 0, 0, Math.PI * 2);
  ctx.fill();
}
