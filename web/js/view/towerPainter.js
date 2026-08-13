/** Procedural tower = grounded Base + rotating turret (Barrel + Payload tip). */

import { VIEW25, aimToDrawAngle, deckRy, groundBasis } from "./view25.js";
import { shade, withAlpha, roundRect, matsFrom } from "./drawUtil.js";
import { vz, cyl25, box25, frustum25, diamondPrism25, ring25, rivetRing } from "./prims25.js";

/** Relative sizes vs the cell sprite scale. */
const BASE_SCALE = 1.22;
const BARREL_SCALE = 0.8;

/**
 * Tallest vz-factor of each base stack (visual constant, painter-local).
 * The turret hub must clear the crown at EVERY pitch — the pitch curve of
 * VIEW25.rise alone sinks the hub inside tall bases at low/mid pitch.
 */
const BASE_CROWN = {
  sentry: 0.26,
  bulwark: 0.26,
  spire: 0.34,
  aerie: 0.2,
  warden: 0.3,
  talon: 0.28,
};

/**
 * THE tower render entry point — all callers (board, dock slots, forge
 * preview, placement ghost) go through here. The painter owns every
 * transform: pitch foreshortening (vz/deckRy/foreshortenBarrel), badge,
 * selection ring. Callers supply only the tower truth + a box + options.
 */
/** Hub lift above the pad for a given sprite size + base (pixel units). */
export function hubLiftFor(s, base) {
  return Math.max(
    s * VIEW25.rise,
    s * BASE_SCALE * (BASE_CROWN[base] || 0.22) * VIEW25.vExag
  );
}

export function crownFactorFor(base) {
  return BASE_CROWN[base] || 0.22;
}

const _crownWarned = new Set();
function crownOf(base) {
  const c = BASE_CROWN[base];
  if (!c && !_crownWarned.has(base)) {
    _crownWarned.add(base);
    console.warn(`towerPainter: base "${base}" has no BASE_CROWN entry — hub may not clear its crown`);
  }
  return c || 0.22;
}

export function renderTower(ctx, palette, t, px, py, s, opts = {}) {
  const selected = opts.selected === true;
  const cx = px + s / 2;
  // Cell center = base pad / footprint. The turret hub lifts above it — at
  // least VIEW25.rise, and always clear of the base's tallest crown.
  const groundY = py + s / 2;
  const baseS = s * BASE_SCALE;
  const hubY = groundY - hubLiftFor(s, t.base);
  const angle = aimToDrawAngle(t.aimAngle);
  const barrelS = s * BARREL_SCALE;
  const showBadge = opts.showBadge !== false;

  drawGroundShadow(ctx, cx, groundY, baseS);
  drawBase(ctx, palette, t.base, cx, groundY, baseS);
  drawTurretStem(ctx, palette, t.base, t.barrel, cx, groundY, hubY, baseS);
  drawTurret(ctx, palette, t.barrel, t.payload, cx, hubY, barrelS, angle);

  if (showBadge) {
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

  if (selected) {
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
  // Stay on the cell footprint (caller passes cell center as groundY)
  ctx.ellipse(cx + s * VIEW25.shadowSkew, groundY + s * 0.06, rx, deckRy(rx), 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Bases share the board's high-angle camera (VIEW25).
 * `groundY` is the cell-center footprint — keep pad mass on/above it so
 * foreshortened ellipses don't spill into the next row.
 * Vertical stack offsets / extrusions use vz() so pitch can stretch height
 * without changing footprint radii or deckRy foreshortening.
 */
function drawBase(ctx, palette, base, cx, groundY, s) {
  const col = palette.baseColor(base);
  const mats = matsFrom(col);
  // Deck pad sits on the cell center; body stacks upward from there
  const deckY = groundY - vz(s, 0.02);

  switch (base) {
    case "bulwark":
      drawBaseBulwark(ctx, cx, deckY, s, mats);
      break;
    case "spire":
      drawBaseSpire(ctx, cx, deckY, s, mats);
      break;
    case "aerie":
      drawBaseAerie(ctx, cx, deckY, s, mats);
      break;
    case "warden":
      drawBaseWarden(ctx, cx, deckY, s, mats);
      break;
    case "talon":
      drawBaseTalon(ctx, cx, deckY, s, mats);
      break;
    case "sentry":
    default:
      drawBaseSentry(ctx, cx, deckY, s, mats);
      break;
  }
}

/** Thin column bridging pad crown → turret hub when rise clears the base. */
function drawTurretStem(ctx, palette, base, barrel, cx, groundY, hubY, baseS) {
  // Fill the air between the base crown and the hub (crown factor matches
  // the renderTower lift so the stem never pokes through a base).
  const crownY = groundY - vz(baseS, crownOf(base));
  const topY = hubY + Math.max(1, baseS * 0.015);
  const rise = crownY - topY;
  if (rise < 3) return;
  const metal = palette.barrelColor(barrel);
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

/** Round keep — wide drum + collar ring + vent slits. */
function drawBaseSentry(ctx, cx, deckY, s, m) {
  cyl25(ctx, cx, deckY + vz(s, 0.02), s * 0.3, vz(s, 0.05), m.sideDark, m.sideDeep, m.rim);
  cyl25(ctx, cx, deckY - vz(s, 0.08), s * 0.25, vz(s, 0.12), m.top, m.side, m.sideDark);
  // Side vents
  ctx.strokeStyle = withAlpha(m.sideDeep, 0.7);
  ctx.lineWidth = Math.max(1, s * 0.02);
  for (const ox of [-s * 0.16, s * 0.16]) {
    ctx.beginPath();
    ctx.moveTo(cx + ox, deckY - vz(s, 0.04));
    ctx.lineTo(cx + ox, deckY - vz(s, 0.12));
    ctx.stroke();
  }
  ring25(ctx, cx, deckY - vz(s, 0.1), s * 0.22, withAlpha(m.rim, 0.55));
  cyl25(ctx, cx, deckY - vz(s, 0.14), s * 0.16, vz(s, 0.06), m.topHi, m.accent, m.sideDark);
  ctx.strokeStyle = withAlpha(m.topHi, 0.55);
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.ellipse(cx, deckY - vz(s, 0.14), s * 0.14, deckRy(s * 0.14), 0, 0, Math.PI * 2);
  ctx.stroke();
  rivetRing(ctx, cx, deckY - vz(s, 0.14), s * 0.12, 6, m.rim);
}

/** Armored bunker — chunky iso box with bevelled top. */
function drawBaseBulwark(ctx, cx, deckY, s, m) {
  const w = s * 0.58;
  const d = s * 0.3;
  const h = vz(s, 0.12);
  box25(ctx, cx, deckY - vz(s, 0.12), w, d, h, m);
  // Armor seam across the front lip
  ctx.strokeStyle = withAlpha(m.rim, 0.55);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.35, deckY - vz(s, 0.02));
  ctx.lineTo(cx + w * 0.35, deckY - vz(s, 0.02));
  ctx.stroke();
  box25(ctx, cx, deckY - vz(s, 0.18), w * 0.72, d * 0.72, vz(s, 0.06), {
    top: m.topHi,
    side: m.accent,
    sideDark: m.sideDark,
  });
  ctx.fillStyle = m.rim;
  for (const [ox, oy] of [
    [-w * 0.22, -d * 0.12],
    [w * 0.22, -d * 0.12],
    [-w * 0.22, d * 0.08],
    [w * 0.22, d * 0.08],
    [0, -d * 0.02],
  ]) {
    ctx.beginPath();
    ctx.arc(cx + ox, deckY - vz(s, 0.18) + oy, s * 0.024, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Tall tapered stack — sniper pedestal. */
function drawBaseSpire(ctx, cx, deckY, s, m) {
  cyl25(ctx, cx, deckY - vz(s, 0.02), s * 0.28, vz(s, 0.04), m.sideDark, m.sideDeep, m.rim);
  rivetRing(ctx, cx, deckY - vz(s, 0.02), s * 0.22, 8, m.rim);
  frustum25(ctx, cx, deckY - vz(s, 0.14), s * 0.22, s * 0.13, vz(s, 0.12), m);
  // Observation band
  ring25(ctx, cx, deckY - vz(s, 0.16), s * 0.15, withAlpha(m.accent, 0.65));
  cyl25(ctx, cx, deckY - vz(s, 0.22), s * 0.1, vz(s, 0.1), m.topHi, m.side, m.sideDark);
  cyl25(ctx, cx, deckY - vz(s, 0.28), s * 0.13, vz(s, 0.04), m.top, m.accent, m.sideDark);
  ctx.fillStyle = withAlpha(m.topHi, 0.55);
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.03, deckY - vz(s, 0.3), s * 0.04, deckRy(s * 0.03), -0.4, 0, Math.PI * 2);
  ctx.fill();
}

/** Nest platform on three stub legs. */
function drawBaseAerie(ctx, cx, deckY, s, m) {
  for (const ang of [-0.9, 0.9, 3.14]) {
    const fx = cx + Math.cos(ang) * s * 0.18;
    const fy = deckY + Math.sin(ang) * s * 0.02;
    cyl25(ctx, fx, fy - vz(s, 0.02), s * 0.06, vz(s, 0.04), m.side, m.sideDark, m.rim);
  }
  ctx.fillStyle = m.sideDark;
  for (const ang of [-0.9, 0.9, 3.14]) {
    const fx = cx + Math.cos(ang) * s * 0.16;
    const x0 = cx + Math.cos(ang) * s * 0.05;
    ctx.beginPath();
    ctx.moveTo(x0 - 2, deckY - vz(s, 0.08));
    ctx.lineTo(fx - 2, deckY);
    ctx.lineTo(fx + 2, deckY);
    ctx.lineTo(x0 + 2, deckY - vz(s, 0.08));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withAlpha(m.rim, 0.4);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  cyl25(ctx, cx, deckY - vz(s, 0.1), s * 0.24, vz(s, 0.07), m.top, m.side, m.sideDark);
  ring25(ctx, cx, deckY - vz(s, 0.1), s * 0.2, withAlpha(m.accent, 0.45));
  ctx.fillStyle = m.sideDeep;
  ctx.beginPath();
  ctx.ellipse(cx, deckY - vz(s, 0.1), s * 0.14, deckRy(s * 0.14), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = m.topHi;
  ctx.beginPath();
  ctx.ellipse(cx, deckY - vz(s, 0.12), s * 0.11, deckRy(s * 0.11), 0, 0, Math.PI * 2);
  ctx.fill();
  rivetRing(ctx, cx, deckY - vz(s, 0.12), s * 0.08, 5, m.rim);
}

/** Keep with peaked roof. */
function drawBaseWarden(ctx, cx, deckY, s, m) {
  const w = s * 0.48;
  const d = s * 0.28;
  const h = vz(s, 0.11);
  box25(ctx, cx, deckY - vz(s, 0.1), w, d, h, m);
  // Window slits
  ctx.fillStyle = withAlpha(m.sideDeep, 0.85);
  for (const ox of [-w * 0.14, w * 0.14]) {
    roundRect(ctx, cx + ox - s * 0.018, deckY - vz(s, 0.08), s * 0.036, vz(s, 0.05), 1);
    ctx.fill();
  }
  const roofH = vz(s, 0.11);
  const topY = deckY - vz(s, 0.14);
  const hw = w * 0.4;
  ctx.fillStyle = m.sideDark;
  ctx.beginPath();
  ctx.moveTo(cx, topY - roofH);
  ctx.lineTo(cx + hw, topY);
  ctx.lineTo(cx + hw, topY + vz(s, 0.04));
  ctx.lineTo(cx, topY + vz(s, 0.04) - roofH * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = m.side;
  ctx.beginPath();
  ctx.moveTo(cx, topY - roofH);
  ctx.lineTo(cx - hw, topY);
  ctx.lineTo(cx - hw, topY + vz(s, 0.04));
  ctx.lineTo(cx, topY + vz(s, 0.04) - roofH * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = m.topHi;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(cx, topY - roofH);
  ctx.lineTo(cx, topY + vz(s, 0.02));
  ctx.stroke();
  ctx.fillStyle = withAlpha(m.accent, 0.7);
  ctx.beginPath();
  ctx.arc(cx, topY - roofH + 1, s * 0.02, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = m.sideDeep;
  roundRect(ctx, cx - s * 0.05, deckY - vz(s, 0.02), s * 0.1, vz(s, 0.07), 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(m.rim, 0.5);
  ctx.stroke();
}

/** Angular claw pedestal — diamond footprint extruded. */
function drawBaseTalon(ctx, cx, deckY, s, m) {
  cyl25(ctx, cx, deckY - vz(s, 0.02), s * 0.26, vz(s, 0.04), m.sideDark, m.sideDeep, m.rim);
  rivetRing(ctx, cx, deckY - vz(s, 0.02), s * 0.2, 6, m.rim);
  diamondPrism25(ctx, cx, deckY - vz(s, 0.12), s * 0.24, vz(s, 0.12), m);
  // Claw tip accents
  ctx.strokeStyle = withAlpha(m.accent, 0.55);
  ctx.lineWidth = 1.2;
  for (const a of [-0.7, 0.7, 2.4, -2.4]) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * s * 0.06, deckY - vz(s, 0.12) + Math.sin(a) * s * 0.04);
    ctx.lineTo(cx + Math.cos(a) * s * 0.2, deckY - vz(s, 0.12) + Math.sin(a) * s * 0.1);
    ctx.stroke();
  }
  diamondPrism25(ctx, cx, deckY - vz(s, 0.18), s * 0.13, vz(s, 0.06), {
    top: m.topHi,
    side: m.accent,
    sideDark: m.sideDark,
  });
}








function drawTurret(ctx, palette, barrel, payload, cx, cy, s, angle) {
  const metal = palette.barrelColor(barrel);
  const tip = palette.payloadColor(payload);
  // Engine ground basis: one source of truth for angle -> screen vectors.
  // LENGTH foreshortens (f), THICKNESS stays constant (normalized p),
  // muzzle reads end-on. Nothing in the turret hand-rolls projection.
  const { f, ax, ay, px, py, depth } = groundBasis(angle);

  ctx.save();
  ctx.translate(cx, cy);
  const hubR = s * 0.125;
  drawHub(ctx, metal, hubR, f);

  const cannon = (len, th, off, sub = 0) => {
    const b = groundBasis(angle + sub);
    drawCannon(ctx, metal, tip, len, th, payload, b.depth, b.ax, b.ay, b.px, b.py, off * b.px, off * b.py);
  };

  switch (barrel) {
    case "twin": {
      const len = s * 0.42;
      const th = s * 0.1;
      const gap = s * 0.11;
      cannon(len, th, gap);
      cannon(len, th, -gap);
      break;
    }
    case "scatter": {
      const len = s * 0.34;
      const th = s * 0.095;
      for (const a of [-0.34, 0, 0.34]) cannon(len, th, 0, a);
      break;
    }
    case "pulse": {
      const dishR = s * 0.22;
      // Dish bowl aimed along the aim vector; depth-squashed like a ground disc
      const ddx = ax * s * 0.12;
      const ddy = ay * s * 0.12;
      ctx.fillStyle = shade(metal, -0.22);
      ctx.beginPath();
      ctx.ellipse(ddx, ddy + s * 0.04, dishR, dishR * f, angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(metal, -0.05);
      ctx.beginPath();
      ctx.ellipse(ddx, ddy, dishR, dishR * f, angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(metal, 0.12);
      ctx.beginPath();
      ctx.ellipse(ddx, ddy - s * 0.02, dishR * 0.7, dishR * 0.7 * f, angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha(tip, 0.55);
      ctx.beginPath();
      ctx.ellipse(ddx, ddy, dishR * 0.4, dishR * 0.4 * f, angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(ax * s * 0.24, ay * s * 0.24);
      ctx.rotate(angle);
      drawPayloadGem(ctx, tip, payload, 0, 0, s * 0.08);
      ctx.restore();
      break;
    }
    case "rail": {
      const len = s * 0.58;
      const th = s * 0.1;
      // Housing block behind the pivot
      segQuad(ctx, ax, ay, px, py, 0, 0, 0, 0.24, s * 0.12, shade(metal, -0.25));
      segQuad(ctx, ax, ay, px, py, 0, 0, 0, 0.24, s * 0.12, shade(metal, -0.05), -s * 0.02);
      segQuad(ctx, ax, ay, px, py, 0, 0, 0.03, 0.2, s * 0.09, shade(metal, 0.12), -s * 0.04);
      cannon(len, th, 0);
      break;
    }
    case "launcher": {
      const len = s * 0.34;
      const th = s * 0.2;
      drawCannon(ctx, metal, tip, len, th, "kinetic", depth, ax, ay, px, py, 0, 0);
      // Nose cone
      const nx = ax * len;
      const ny = ay * len;
      ctx.fillStyle = shade(tip, -0.2);
      ctx.beginPath();
      ctx.ellipse(nx + ax * th * 0.4, ny + ay * th * 0.4 + s * 0.03, th * 0.55, th * 0.4 * f, angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tip;
      ctx.beginPath();
      ctx.ellipse(nx + ax * th * 0.4, ny + ay * th * 0.4, th * 0.5, th * 0.36 * f, angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(tip, 0.22);
      ctx.beginPath();
      ctx.ellipse(nx + ax * th * 0.3, ny + ay * th * 0.3 - th * 0.08, th * 0.18, th * 0.12 * f, angle, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "flak": {
      // Short multi-tube burst pod
      for (const dy of [-0.12, -0.04, 0.04, 0.12]) {
        cannon(s * 0.32, s * 0.06, s * dy);
      }
      segQuad(ctx, ax, ay, px, py, 0, 0, 0, 0.2, s * 0.1, shade(metal, -0.15));
      break;
    }
    case "single":
    default: {
      cannon(s * 0.46, s * 0.11, 0);
      break;
    }
  }

  drawHubCap(ctx, metal, hubR * 0.72, f);
  ctx.restore();
}

/** Quad along the aim vector between t0 and t1, half-width w, dy screen offset. */
function segQuad(ctx, ax, ay, px, py, ox, oy, t0, t1, w, fill, dy = 0) {
  const x0 = ox + ax * t0;
  const y0 = oy + ay * t0;
  const x1 = ox + ax * t1;
  const y1 = oy + ay * t1;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x0 + px * w, y0 + py * w + dy);
  ctx.lineTo(x0 - px * w, y0 - py * w + dy);
  ctx.lineTo(x1 - px * w, y1 - py * w + dy);
  ctx.lineTo(x1 + px * w, y1 + py * w + dy);
  ctx.closePath();
  ctx.fill();
}

function drawHub(ctx, metal, r, f) {
  // Ground disc: rx = r, ry = r * f (depth-squashed like deckRy)
  ctx.fillStyle = shade(metal, -0.3);
  ctx.beginPath();
  ctx.ellipse(0, r * 0.15, r, r * f, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(metal, -0.08);
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * f, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha("#fff8e0", 0.16);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(-r * 0.15, -r * 0.1, r * 0.55, r * 0.45 * f, -0.4, Math.PI * 1.1, Math.PI * 1.85);
  ctx.stroke();
}

function drawHubCap(ctx, metal, r, f) {
  ctx.fillStyle = shade(metal, 0.14);
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.05, r, r * f, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(shade(metal, -0.35), 0.7);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.05, r * 0.72, r * 0.72 * f, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = shade(metal, -0.22);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.35, r * 0.35 * f, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha("#fff8e0", 0.25);
  ctx.beginPath();
  ctx.ellipse(-r * 0.08, -r * 0.12, r * 0.12, r * 0.12 * f, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Barrel in SCREEN space: length foreshortened by the aim vector (depth factor
 * f), thickness constant along the normalized perpendicular, muzzle end-on.
 * ox/oy = lateral offset from the pivot along the perpendicular.
 */
function drawCannon(ctx, metal, tip, length, th, payload, depth, ax, ay, px, py, ox = 0, oy = 0) {
  const h = th;
  const rise = h * 0.35;
  const hw = h / 2;
  const dark = shade(metal, -0.22);
  const mid = metal;
  const light = shade(metal, 0.18);

  // Ground shadow streak — anchors the receding tube to the deck
  if (depth > 0.05) {
    ctx.fillStyle = `rgba(0,0,0,${(0.14 + depth * 0.1).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(
      ox + ax * length * 0.5,
      oy + ay * length * 0.5 + h * 1.05,
      length * 0.5,
      h * 0.32,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  // under-lip (tube underside, toward screen bottom), then body, then light
  segQuad(ctx, ax, ay, px, py, ox, oy, 0, 1, hw, dark, rise);
  segQuad(ctx, ax, ay, px, py, ox, oy, 0, 1, hw, mid, 0);
  segQuad(ctx, ax, ay, px, py, ox, oy, 0.06, 0.7, hw * 0.4, light, -h * 0.2);

  // Reinforcing rings — screen-aligned bands across the tube
  ctx.fillStyle = shade(metal, -0.35);
  for (const t of [0.28, 0.55]) {
    ctx.fillRect(
      ox + ax * length * t - h * 0.09,
      oy + ay * length * t - h * 0.42,
      h * 0.18,
      h * 0.72
    );
  }

  // Tip band + end-on muzzle cap + bore
  const band = Math.max(2.5, length * 0.16);
  segQuad(ctx, ax, ay, px, py, ox, oy, 1 - band / length, 1, hw * 0.98, shade(tip, -0.15), 0);
  const mx = ox + ax * length;
  const my = oy + ay * length;
  ctx.fillStyle = tip;
  ctx.beginPath();
  ctx.ellipse(mx, my, band * 0.5, band * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha("#0a0c10", 0.7);
  ctx.beginPath();
  ctx.ellipse(mx, my, band * 0.22, band * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  if (payload && payload !== "kinetic") {
    ctx.save();
    ctx.translate(mx + ax * h * 0.1, my + ay * h * 0.1);
    ctx.rotate(Math.atan2(ay, ax));
    drawPayloadGem(ctx, tip, payload, 0, 0, h * 0.5);
    ctx.restore();
  }
}

function drawPayloadGem(ctx, tip, payload, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = tip;
  ctx.strokeStyle = shade(tip, 0.25);
  ctx.lineWidth = 1;

  switch (payload) {
    case "pyro": {
      ctx.beginPath();
      ctx.moveTo(size * 0.55, 0);
      ctx.lineTo(-size * 0.45, -size * 0.55);
      ctx.lineTo(-size * 0.15, 0);
      ctx.lineTo(-size * 0.45, size * 0.55);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "shock": {
      ctx.strokeStyle = tip;
      ctx.lineWidth = Math.max(1.25, size * 0.35);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-size * 0.35, -size * 0.55);
      ctx.lineTo(size * 0.1, 0);
      ctx.lineTo(-size * 0.35, size * 0.55);
      ctx.stroke();
      break;
    }
    case "frost": {
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.65);
      ctx.lineTo(size * 0.5, 0);
      ctx.lineTo(0, size * 0.65);
      ctx.lineTo(-size * 0.5, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "poison": {
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(tip, 0.2);
      ctx.beginPath();
      ctx.arc(-size * 0.15, -size * 0.15, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "acid": {
      ctx.beginPath();
      ctx.moveTo(-size * 0.5, -size * 0.35);
      ctx.quadraticCurveTo(0, size * 0.85, size * 0.5, -size * 0.35);
      ctx.closePath();
      ctx.fill();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

