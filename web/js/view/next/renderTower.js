/**
 * Generic tower renderer — interprets partVisuals over the unified two-factor
 * basis (groundBasis / capEllipse / prims25 / hubLiftFor / crownFactorFor).
 * Produces the ORACLE painter's exact pixels (golden-verified); the only
 * per-part knowledge lives in the visual data.
 */
import { VIEW25, deckRy, groundBasis, capEllipse } from "../view25.js";
import { vz, cyl25, box25, frustum25, diamondPrism25, ring25, rivetRing } from "../prims25.js";
import { shade, withAlpha, matsFrom, roundRect } from "../drawUtil.js";
import { BASE_VISUALS, BARREL_VISUALS, PAYLOAD_VISUALS } from "./partVisuals.js";

const BASE_SCALE = 1.22;
const BARREL_SCALE = 0.8;

/** Hub lift above the pad for a given sprite size + base (pixel units). */
const BASE_CROWN = {
  sentry: 0.26,
  bulwark: 0.26,
  spire: 0.34,
  aerie: 0.2,
  warden: 0.3,
  talon: 0.28,
};

export function hubLiftForNext(s, base) {
  return Math.max(
    s * VIEW25.rise,
    s * BASE_SCALE * (BASE_CROWN[base] || 0.22) * VIEW25.vExag
  );
}

export function crownFactorForNext(base) {
  return BASE_CROWN[base] || 0.22;
}

export function renderTowerNext(ctx, palette, t, px, py, s, opts = {}) {
  const cx = px + s / 2;
  const groundY = py + s / 2;
  const baseS = s * BASE_SCALE;
  const hubY = groundY - hubLiftForNext(s, t.base);
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

  if (opts.showBadge !== false) {
    const lvl = Math.max(1, t.level | 0);
    const badgeR = Math.max(7, s * 0.14);
    const bx = px + s - badgeR - 2;
    const by = py + badgeR + 2;
    ctx.fillStyle = "rgba(20,16,12,0.75)";
    ctx.beginPath();
    ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(palette.accent, 0.85);
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.fillStyle = palette.text || "#ebe6d8";
    ctx.font = `700 ${Math.max(8, s * 0.2)}px "Chakra Petch", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${lvl}`, bx, by + 0.5);
    ctx.lineWidth = 1;
  }

  if (opts.selected) {
    ctx.strokeStyle = withAlpha(palette.accent, 0.85);
    ctx.lineWidth = 1.5;
    const inset = 3;
    roundRect(ctx, px + inset, py + inset, s - inset * 2, s - inset * 2, 4);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
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
  const yAt = (k) => deckY - vz(s, k);
  for (const [prim, e] of list) {
    switch (prim) {
      case "cyl":
        cyl25(ctx, cx + e.x * s, yAt(e.y), e.rx * s, vz(s, e.rise), m[e.top], m[e.side], e.bottom ? m[e.bottom] : undefined, { roundedBottom: e.roundedBottom === true });
        break;
      case "box":
        box25(ctx, cx, yAt(e.y), e.w * s, e.d * s, vz(s, e.h), { top: m[e.top], side: m[e.side], sideDark: m[e.dark] });
        break;
      case "frustum":
        frustum25(ctx, cx, yAt(e.y), e.rxBot * s, e.rxTop * s, vz(s, e.rise), { top: m[e.top], side: m[e.side], sideDark: m[e.dark] });
        break;
      case "diamond":
        diamondPrism25(ctx, cx, yAt(e.y), e.rx * s, vz(s, e.rise), { top: m[e.top], side: m[e.side], sideDark: m[e.dark] });
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
      case "stroke":
        ctx.strokeStyle = withAlpha(m[e.color], e.alpha);
        ctx.lineWidth = e.lw;
        ctx.beginPath();
        ctx.moveTo(cx + e.x0 * s, yAt(e.y));
        ctx.lineTo(cx + e.x1 * s, yAt(e.y));
        ctx.stroke();
        break;
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
      case "ellipseFill":
        ctx.fillStyle = withAlpha(m[e.color], e.alpha != null ? e.alpha : 1);
        ctx.beginPath();
        ctx.ellipse(cx + (e.x || 0) * s, yAt(e.y), e.rx * s, deckRy(e.ryFactor * s), e.rot || 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "rivets":
        rivetRing(ctx, cx, yAt(e.y), e.rx * s, e.n, m[e.color]);
        break;
      case "rivetDots":
        ctx.fillStyle = m[e.color];
        for (const [ox, oy] of e.pts) {
          ctx.beginPath();
          ctx.arc(cx + ox * s, yAt(e.y) + oy * s, s * e.r, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case "roundRectFill":
        ctx.fillStyle = withAlpha(m[e.color], e.alpha != null ? e.alpha : 1);
        roundRect(ctx, cx + e.x0 * s, yAt(e.y), e.w * s, vz(s, e.h), e.r);
        ctx.fill();
        if (e.stroke) {
          ctx.strokeStyle = withAlpha(m[e.stroke], e.strokeAlpha != null ? e.strokeAlpha : 1);
          ctx.stroke();
        }
        break;
      case "legs": {
        for (const ang of e.angles) {
          const fx = cx + Math.cos(ang) * e.r * s;
          const fy = deckY + Math.sin(ang) * e.dr * s;
          cyl25(ctx, fx, fy - vz(s, e.rise >= 0 ? 0.02 : 0.02), e.rx * s, vz(s, e.rise), m[e.top], m[e.side], m[e.bottom]);
        }
        break;
      }
      case "struts": {
        ctx.fillStyle = m[e.color];
        for (const ang of e.angles) {
          const fx = cx + Math.cos(ang) * e.r * s;
          const x0 = cx + Math.cos(ang) * e.r0 * s;
          ctx.beginPath();
          ctx.moveTo(x0 - 2, yAt(e.yTop));
          ctx.lineTo(fx - 2, deckY);
          ctx.lineTo(fx + 2, deckY);
          ctx.lineTo(x0 + 2, yAt(e.yTop));
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = withAlpha(m[e.rim], e.alpha);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        break;
      }
      case "claws": {
        ctx.strokeStyle = withAlpha(m[e.color], e.alpha);
        ctx.lineWidth = e.lw;
        for (const a of e.angles) {
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * e.r0 * s, yAt(e.y) + Math.sin(a) * e.dy0 * s);
          ctx.lineTo(cx + Math.cos(a) * e.r1 * s, yAt(e.y) + Math.sin(a) * e.dy1 * s);
          ctx.stroke();
        }
        break;
      }
      case "roof": {
        const roofH = vz(s, e.h);
        const topY = yAt(e.y);
        const hw = e.hw * s;
        ctx.fillStyle = m[e.fillRight];
        ctx.beginPath();
        ctx.moveTo(cx, topY - roofH);
        ctx.lineTo(cx + hw, topY);
        ctx.lineTo(cx + hw, topY + vz(s, e.lip));
        ctx.lineTo(cx, topY + vz(s, e.lip) - roofH * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = m[e.fillLeft];
        ctx.beginPath();
        ctx.moveTo(cx, topY - roofH);
        ctx.lineTo(cx - hw, topY);
        ctx.lineTo(cx - hw, topY + vz(s, e.lip));
        ctx.lineTo(cx, topY + vz(s, e.lip) - roofH * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = m[e.ridge];
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(cx, topY - roofH);
        ctx.lineTo(cx, topY + vz(s, 0.02));
        ctx.stroke();
        ctx.fillStyle = withAlpha(m[e.tip], e.tipAlpha);
        ctx.beginPath();
        ctx.arc(cx, topY - roofH + 1, s * 0.02, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
  }
}

/** Ported from drawTurretStem — bridge between base crown and hub. */
function drawTurretStem(ctx, cx, groundY, hubY, baseS, base, metal) {
  const crownY = groundY - vz(baseS, crownFactorForNext(base));
  const topY = hubY + Math.max(1, baseS * 0.015);
  const rise = crownY - topY;
  if (rise < 3) return;
  cyl25(ctx, cx, topY, baseS * 0.05, rise, shade(metal, 0.08), shade(metal, -0.12), shade(metal, -0.28));
}

/** Turret: hub + tubes + extras + hub cap, drawn in a frame at (cx, hubY). */
function drawTurret(ctx, t, cx, hubY, s, b, metal, tip, m) {
  ctx.save();
  ctx.translate(cx, hubY);
  const hubR = s * 0.125;
  drawHub(ctx, metal, hubR, b.D);
  const def = BARREL_VISUALS[t.barrel] || { tubes: [], extras: [] };
  for (const tube of def.tubes) {
    drawTube(ctx, metal, tip, tube.len * s, tube.th * s, tube.noGem ? "kinetic" : t.payload, b, (tube.off || 0) * s, tube.sub || 0);
  }
  for (const [prim, e] of def.extras || []) {
    switch (prim) {
      case "housing":
        housingQuad(ctx, b, e, s, metal);
        break;
      case "dish":
        drawDish(ctx, b, e, s, metal, tip, t.payload);
        break;
      case "gem":
        ctx.save();
        ctx.translate(b.ax * e.d * s, b.ay * e.d * s);
        ctx.rotate(Math.atan2(b.ay, b.ax));
        drawGem(ctx, tip, t.payload, e.size * s);
        ctx.restore();
        break;
      case "nose":
        drawNose(ctx, b, e, s, metal, tip);
        break;
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

/** Tube with optional perpendicular offset + sub-angle (scatter/twin/flak). */
function drawTube(ctx, metal, tip, length, th, payload, b, off, sub) {
  const bb = sub ? groundBasis(aimOf(b, sub)) : b;
  const ox = off * bb.px;
  const oy = off * bb.py;
  tubeBody(ctx, metal, tip, length, th, payload, bb, ox, oy);
}

function aimOf(b, sub) {
  // the painter recomputes the basis from the ORIGINAL angle + sub; we
  // recover the angle via atan2 of the un-squashed aim, then re-derive.
  const angle = Math.atan2(b.ay / b.D, b.ax);
  return angle + sub;
}

/** Exact orthographic cylinder (mirror of drawCannon) — tangent tubes + caps. */
function tubeBody(ctx, metal, tip, length, th, payload, b, ox, oy) {
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

  // Fake-3D muzzle dome - visible at head-on pitch (b.depth ≈ 0), vanishes at high pitch
  const domeHeight = r * (1 - b.depth) * 0.35;
  if (domeHeight > 0.3) {
    ctx.fillStyle = withAlpha(shade(tip, 0.15), 0.9);
    ctx.beginPath();
    ctx.ellipse(far.x, far.y - domeHeight * 0.3, fcap.rx * 0.9, fcap.ry * 0.9, fcap.rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(shade(tip, 0.35), 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(far.x, far.y - domeHeight * 0.2, fcap.rx * 0.7, fcap.ry * 0.7, fcap.rot, 0, Math.PI * 2);
    ctx.stroke();
  }

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

  if (payload && payload !== "kinetic") {
    ctx.save();
    ctx.translate(ex + b.ax * h * 0.1, ey + b.ay * h * 0.1);
    ctx.rotate(Math.atan2(b.ay, b.ax));
    drawGem(ctx, tip, payload, h * 0.5);
    ctx.restore();
  }
}

/** Rail/flak housing — aim-aligned quads (segQuad port; t is RAW like the oracle). */
function housingQuad(ctx, b, e, s, metal) {
  const fill = shade(metal, e.shade);
  const dy = e.dy * s;
  const x0 = b.ax * e.t0;
  const y0 = b.ay * e.t0;
  const x1 = b.ax * e.t1;
  const y1 = b.ay * e.t1;
  const w = e.w * s;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x0 + b.px * w, y0 + b.py * w + dy);
  ctx.lineTo(x0 - b.px * w, y0 - b.py * w + dy);
  ctx.lineTo(x1 - b.px * w, y1 - b.py * w + dy);
  ctx.lineTo(x1 + b.px * w, y1 + b.py * w + dy);
  ctx.closePath();
  ctx.fill();
}

/** Pulse emitter — depth-squashed dish along the aim + gem. */
function drawDish(ctx, b, e, s, metal, tip, payload) {
  const dishR = e.r * s;
  const ddx = b.ax * e.d * s;
  const ddy = b.ay * e.d * s;
  const angle = aimOf(b, 0);
  ctx.fillStyle = shade(metal, -0.22);
  ctx.beginPath();
  ctx.ellipse(ddx, ddy + s * 0.04, dishR, dishR * b.D, angle, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(metal, -0.05);
  ctx.beginPath();
  ctx.ellipse(ddx, ddy, dishR, dishR * b.D, angle, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(metal, 0.12);
  ctx.beginPath();
  ctx.ellipse(ddx, ddy - s * 0.02, dishR * 0.7, dishR * 0.7 * b.D, angle, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha(tip, 0.55);
  ctx.beginPath();
  ctx.ellipse(ddx, ddy, dishR * 0.4, dishR * 0.4 * b.D, angle, 0, Math.PI * 2);
  ctx.fill();
  void payload;
}

/** Launcher nose cone — 3 end-on ellipses scaled to the two factors. */
function drawNose(ctx, b, e, s, metal, tip) {
  const len = e.len * s;
  const th = e.th * s;
  const nx = b.ax * len;
  const ny = b.ay * len;
  const angle = aimOf(b, 0);
  const crx = th * 0.5 * b.D;
  const cry = th * 0.36 * b.V;
  ctx.fillStyle = shade(tip, -0.2);
  ctx.beginPath();
  ctx.ellipse(nx + b.ax * th * 0.4, ny + b.ay * th * 0.4 + s * 0.03, crx, cry, angle, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tip;
  ctx.beginPath();
  ctx.ellipse(nx + b.ax * th * 0.4, ny + b.ay * th * 0.4, crx, cry, angle, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(tip, 0.22);
  ctx.beginPath();
  ctx.ellipse(nx + b.ax * th * 0.3, ny + b.ay * th * 0.3 - th * 0.08, th * 0.18 * b.D, th * 0.12 * b.V, angle, 0, Math.PI * 2);
  ctx.fill();
  void metal;
}

/** Payload tip gem — shapes from PAYLOAD_VISUALS, drawn in the aim frame. */
function drawGem(ctx, tip, payload, size) {
  const list = PAYLOAD_VISUALS[payload];
  if (!list) return;
  ctx.save();
  ctx.translate(0, 0);
  ctx.fillStyle = tip;
  ctx.strokeStyle = shade(tip, 0.25);
  ctx.lineWidth = 1;
  for (const [prim, e] of list) {
    switch (prim) {
      case "poly": {
        ctx.beginPath();
        const pts = e.pts;
        ctx.moveTo(pts[0][0] * size, pts[0][1] * size);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * size, pts[i][1] * size);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "polyline": {
        ctx.strokeStyle = tip;
        ctx.lineWidth = Math.max(1.25, size * e.lw);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        const pts = e.pts;
        ctx.moveTo(pts[0][0] * size, pts[0][1] * size);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * size, pts[i][1] * size);
        ctx.stroke();
        break;
      }
      case "circle": {
        ctx.beginPath();
        ctx.arc(e.x * size, e.y * size, e.r * size, 0, Math.PI * 2);
        if (e.fill === "hi") ctx.fillStyle = shade(tip, 0.2);
        ctx.fill();
        break;
      }
      case "quadratic": {
        ctx.beginPath();
        const pts = e.pts;
        ctx.moveTo(pts[0][0] * size, pts[0][1] * size);
        ctx.quadraticCurveTo(pts[1][0] * size, pts[1][1] * size, pts[2][0] * size, pts[2][1] * size);
        ctx.closePath();
        ctx.fill();
        break;
      }
    }
  }
  ctx.restore();
}
