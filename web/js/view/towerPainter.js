/** Procedural tower = grounded Base + rotating turret (Barrel + Payload tip). */

import { VIEW25, aimToDrawAngle, deckRy } from "./view25.js";
import { shade, withAlpha, roundRect, facePoly, matsFrom } from "./drawUtil.js";

/** Relative sizes vs the cell sprite scale. */
const BASE_SCALE = 1.22;
const BARREL_SCALE = 0.8;

export function drawComposedTower(ctx, palette, t, px, py, s, selected) {
  const cx = px + s / 2;
  // Cell center = base pad / footprint. Turret hub lifts above by VIEW25.rise.
  const groundY = py + s / 2;
  const hubY = groundY - s * VIEW25.rise;
  const angle = aimToDrawAngle(t.aimAngle);
  const baseS = s * BASE_SCALE;
  const barrelS = s * BARREL_SCALE;

  drawGroundShadow(ctx, cx, groundY, baseS);
  drawBase(ctx, palette, t.base, cx, groundY, baseS);
  drawTurret(ctx, palette, t.barrel, t.payload, cx, hubY, barrelS, angle);

  // Level badge (always visible)
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
  ctx.font = `bold ${Math.max(8, s * 0.2)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${lvl}`, bx, by + 0.5);
  ctx.lineWidth = 1;

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
 */
function drawBase(ctx, palette, base, cx, groundY, s) {
  const col = palette.baseColor(base);
  const mats = matsFrom(col);
  // Deck pad sits on the cell center; body stacks upward from there
  const deckY = groundY - s * 0.02;

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

/** Round keep — wide drum + collar ring. */
function drawBaseSentry(ctx, cx, deckY, s, m) {
  // Compact foot — stays on the pad, does not hang into the near cell edge
  cyl25(ctx, cx, deckY + s * 0.02, s * 0.3, s * 0.05, m.sideDark, m.sideDeep, m.rim);
  cyl25(ctx, cx, deckY - s * 0.08, s * 0.25, s * 0.12, m.top, m.side, m.sideDark);
  cyl25(ctx, cx, deckY - s * 0.14, s * 0.16, s * 0.06, m.topHi, m.accent, m.sideDark);
  ctx.strokeStyle = withAlpha(m.topHi, 0.5);
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.ellipse(cx, deckY - s * 0.14, s * 0.14, deckRy(s * 0.14), 0, 0, Math.PI * 2);
  ctx.stroke();
}

/** Armored bunker — chunky iso box with bevelled top. */
function drawBaseBulwark(ctx, cx, deckY, s, m) {
  const w = s * 0.58;
  const d = s * 0.3;
  const h = s * 0.12;
  // Body sits on the pad and rises (topY chosen so front lip stays near deckY)
  box25(ctx, cx, deckY - s * 0.12, w, d, h, m);
  box25(ctx, cx, deckY - s * 0.18, w * 0.72, d * 0.72, s * 0.06, {
    top: m.topHi,
    side: m.accent,
    sideDark: m.sideDark,
  });
  ctx.fillStyle = m.rim;
  for (const [ox, oy] of [
    [-w * 0.2, -d * 0.1],
    [w * 0.2, -d * 0.1],
    [-w * 0.2, d * 0.06],
    [w * 0.2, d * 0.06],
  ]) {
    ctx.beginPath();
    ctx.arc(cx + ox, deckY - s * 0.18 + oy, s * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Tall tapered stack — sniper pedestal. */
function drawBaseSpire(ctx, cx, deckY, s, m) {
  cyl25(ctx, cx, deckY - s * 0.02, s * 0.28, s * 0.04, m.sideDark, m.sideDeep, m.rim);
  frustum25(ctx, cx, deckY - s * 0.14, s * 0.22, s * 0.13, s * 0.12, m);
  cyl25(ctx, cx, deckY - s * 0.22, s * 0.1, s * 0.1, m.topHi, m.side, m.sideDark);
  cyl25(ctx, cx, deckY - s * 0.28, s * 0.13, s * 0.04, m.top, m.accent, m.sideDark);
}

/** Nest platform on three stub legs. */
function drawBaseAerie(ctx, cx, deckY, s, m) {
  // Short tripod — feet on the pad, not past the near cell edge
  for (const ang of [-0.9, 0.9, 3.14]) {
    const fx = cx + Math.cos(ang) * s * 0.18;
    const fy = deckY + Math.sin(ang) * s * 0.02;
    cyl25(ctx, fx, fy - s * 0.02, s * 0.06, s * 0.04, m.side, m.sideDark, m.rim);
  }
  ctx.fillStyle = m.sideDark;
  for (const ang of [-0.9, 0.9, 3.14]) {
    const fx = cx + Math.cos(ang) * s * 0.16;
    const x0 = cx + Math.cos(ang) * s * 0.05;
    ctx.beginPath();
    ctx.moveTo(x0 - 2, deckY - s * 0.08);
    ctx.lineTo(fx - 2, deckY);
    ctx.lineTo(fx + 2, deckY);
    ctx.lineTo(x0 + 2, deckY - s * 0.08);
    ctx.closePath();
    ctx.fill();
  }
  cyl25(ctx, cx, deckY - s * 0.1, s * 0.24, s * 0.07, m.top, m.side, m.sideDark);
  ctx.fillStyle = m.sideDeep;
  ctx.beginPath();
  ctx.ellipse(cx, deckY - s * 0.1, s * 0.14, deckRy(s * 0.14), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = m.topHi;
  ctx.beginPath();
  ctx.ellipse(cx, deckY - s * 0.12, s * 0.11, deckRy(s * 0.11), 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Keep with peaked roof. */
function drawBaseWarden(ctx, cx, deckY, s, m) {
  const w = s * 0.48;
  const d = s * 0.28;
  const h = s * 0.11;
  box25(ctx, cx, deckY - s * 0.1, w, d, h, m);
  const roofH = s * 0.11;
  const topY = deckY - s * 0.14;
  const hw = w * 0.4;
  ctx.fillStyle = m.sideDark;
  ctx.beginPath();
  ctx.moveTo(cx, topY - roofH);
  ctx.lineTo(cx + hw, topY);
  ctx.lineTo(cx + hw, topY + s * 0.04);
  ctx.lineTo(cx, topY + s * 0.04 - roofH * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = m.side;
  ctx.beginPath();
  ctx.moveTo(cx, topY - roofH);
  ctx.lineTo(cx - hw, topY);
  ctx.lineTo(cx - hw, topY + s * 0.04);
  ctx.lineTo(cx, topY + s * 0.04 - roofH * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = m.topHi;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(cx, topY - roofH);
  ctx.lineTo(cx, topY + s * 0.02);
  ctx.stroke();
  ctx.fillStyle = m.sideDeep;
  roundRect(ctx, cx - s * 0.05, deckY - s * 0.02, s * 0.1, s * 0.07, 2);
  ctx.fill();
}

/** Angular claw pedestal — diamond footprint extruded. */
function drawBaseTalon(ctx, cx, deckY, s, m) {
  cyl25(ctx, cx, deckY - s * 0.02, s * 0.26, s * 0.04, m.sideDark, m.sideDeep, m.rim);
  diamondPrism25(ctx, cx, deckY - s * 0.12, s * 0.24, s * 0.12, m);
  diamondPrism25(ctx, cx, deckY - s * 0.18, s * 0.13, s * 0.06, {
    top: m.topHi,
    side: m.accent,
    sideDark: m.sideDark,
  });
}

// --- 2.5D primitives (light from upper-left) ---

function cyl25(ctx, cx, topY, rx, rise, topCol, sideCol, bottomCol) {
  const ry = deckRy(rx);
  ctx.fillStyle = sideCol;
  ctx.fillRect(cx - rx, topY, rx * 2, Math.max(1, rise));
  ctx.beginPath();
  ctx.ellipse(cx, topY + rise, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = bottomCol || shade(sideCol, -0.15);
  ctx.beginPath();
  ctx.ellipse(cx, topY + rise, rx, ry, 0, 0.15, Math.PI - 0.15);
  ctx.fill();
  ctx.fillStyle = topCol;
  ctx.beginPath();
  ctx.ellipse(cx, topY, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha("#fff8e0", 0.18);
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.12, topY - ry * 0.08, rx * 0.72, ry * 0.55, -0.35, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
}

function box25(ctx, cx, topY, w, d, h, m) {
  const hw = w / 2;
  const hd = d / 2;
  // foreshortened top corners (pitch-linked iso skew)
  const skew = d * VIEW25.boxSkew;
  const tl = { x: cx - hw + skew * 0.2, y: topY - hd * 0.35 };
  const tr = { x: cx + hw + skew * 0.2, y: topY - hd * 0.35 };
  const br = { x: cx + hw - skew * 0.15, y: topY + hd * 0.55 };
  const bl = { x: cx - hw - skew * 0.15, y: topY + hd * 0.55 };

  // right face
  ctx.fillStyle = m.sideDark;
  ctx.beginPath();
  ctx.moveTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(br.x, br.y + h);
  ctx.lineTo(tr.x, tr.y + h);
  ctx.closePath();
  ctx.fill();
  // front face
  ctx.fillStyle = m.side;
  ctx.beginPath();
  ctx.moveTo(bl.x, bl.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(br.x, br.y + h);
  ctx.lineTo(bl.x, bl.y + h);
  ctx.closePath();
  ctx.fill();
  // top face
  ctx.fillStyle = m.top;
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.fill();
  // top edge light
  ctx.strokeStyle = withAlpha("#ffffff", 0.16);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.stroke();
}

function frustum25(ctx, cx, topY, rxBot, rxTop, rise, m) {
  const ryBot = deckRy(rxBot);
  const ryTop = deckRy(rxTop);
  ctx.fillStyle = m.side;
  ctx.beginPath();
  ctx.moveTo(cx - rxTop, topY);
  ctx.lineTo(cx - rxBot, topY + rise);
  ctx.lineTo(cx + rxBot, topY + rise);
  ctx.lineTo(cx + rxTop, topY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = m.sideDark;
  ctx.beginPath();
  ctx.ellipse(cx, topY + rise, rxBot, ryBot, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = m.top;
  ctx.beginPath();
  ctx.ellipse(cx, topY, rxTop, ryTop, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha("#fff8e0", 0.14);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx - rxTop * 0.1, topY - ryTop * 0.08, rxTop * 0.65, ryTop * 0.5, -0.3, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
}

function diamondPrism25(ctx, cx, topY, rx, rise, m) {
  const ry = deckRy(rx);
  const top = [
    { x: cx, y: topY - ry },
    { x: cx + rx, y: topY },
    { x: cx, y: topY + ry },
    { x: cx - rx, y: topY },
  ];
  const bot = top.map((p) => ({ x: p.x, y: p.y + rise }));
  ctx.fillStyle = m.sideDark;
  facePoly(ctx, [top[1], top[2], bot[2], bot[1]]);
  ctx.fillStyle = m.side;
  facePoly(ctx, [top[2], top[3], bot[3], bot[2]]);
  ctx.fillStyle = m.top;
  facePoly(ctx, top);
  ctx.strokeStyle = withAlpha("#fff8e0", 0.14);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(top[3].x, top[3].y);
  ctx.lineTo(top[0].x, top[0].y);
  ctx.lineTo(top[1].x, top[1].y);
  ctx.stroke();
}

function drawTurret(ctx, palette, barrel, payload, cx, cy, s, angle) {
  const metal = palette.barrelColor(barrel);
  const tip = palette.payloadColor(payload);
  ctx.save();
  ctx.translate(cx, cy);
  // Yaw only — board (or forge preview) already applies VIEW25.yScale
  ctx.rotate(angle);

  const hubR = s * 0.125;
  drawHub(ctx, metal, hubR);

  switch (barrel) {
    case "twin": {
      const len = s * 0.42;
      const th = s * 0.1;
      const gap = s * 0.11;
      drawCannon(ctx, metal, tip, hubR * 0.55, -gap, len, th, payload);
      drawCannon(ctx, metal, tip, hubR * 0.55, gap, len, th, payload);
      break;
    }
    case "scatter": {
      const len = s * 0.34;
      const th = s * 0.095;
      for (const a of [-0.34, 0, 0.34]) {
        ctx.save();
        ctx.rotate(a);
        drawCannon(ctx, metal, tip, hubR * 0.5, 0, len, th, payload);
        ctx.restore();
      }
      break;
    }
    case "pulse": {
      const dishR = s * 0.22;
      ctx.fillStyle = shade(metal, -0.22);
      ctx.beginPath();
      ctx.ellipse(s * 0.12, s * 0.04, dishR, dishR * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(metal, -0.05);
      ctx.beginPath();
      ctx.ellipse(s * 0.12, 0, dishR, dishR * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(metal, 0.12);
      ctx.beginPath();
      ctx.ellipse(s * 0.1, -s * 0.02, dishR * 0.7, dishR * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha(tip, 0.55);
      ctx.beginPath();
      ctx.ellipse(s * 0.14, 0, dishR * 0.4, dishR * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      drawPayloadGem(ctx, tip, payload, s * 0.24, 0, s * 0.08);
      break;
    }
    case "rail": {
      const len = s * 0.58;
      const th = s * 0.1;
      ctx.fillStyle = shade(metal, -0.25);
      roundRect(ctx, -s * 0.06, -s * 0.12 + 2, s * 0.22, s * 0.24, 3);
      ctx.fill();
      ctx.fillStyle = shade(metal, -0.05);
      roundRect(ctx, -s * 0.06, -s * 0.12, s * 0.22, s * 0.24, 3);
      ctx.fill();
      ctx.fillStyle = shade(metal, 0.12);
      roundRect(ctx, -s * 0.04, -s * 0.09, s * 0.18, s * 0.1, 2);
      ctx.fill();
      drawCannon(ctx, metal, tip, s * 0.12, 0, len, th, payload);
      break;
    }
    case "launcher": {
      const len = s * 0.34;
      const th = s * 0.2;
      drawCannon(ctx, metal, tip, hubR * 0.4, 0, len, th, "kinetic");
      const noseX = hubR * 0.4 + len;
      ctx.fillStyle = shade(tip, -0.2);
      ctx.beginPath();
      ctx.ellipse(noseX, s * 0.03, th * 0.55, th * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tip;
      ctx.beginPath();
      ctx.ellipse(noseX, 0, th * 0.5, th * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(tip, 0.22);
      ctx.beginPath();
      ctx.ellipse(noseX - th * 0.08, -th * 0.08, th * 0.18, th * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "single":
    default: {
      drawCannon(ctx, metal, tip, hubR * 0.55, 0, s * 0.46, s * 0.11, payload);
      break;
    }
  }

  drawHubCap(ctx, metal, hubR * 0.72);
  ctx.restore();
}

function drawHub(ctx, metal, r) {
  // Drawn inside foreshortened space → reads as deck-aligned disc
  ctx.fillStyle = shade(metal, -0.3);
  ctx.beginPath();
  ctx.ellipse(0, r * 0.15, r, r * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(metal, -0.08);
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawHubCap(ctx, metal, r) {
  ctx.fillStyle = shade(metal, 0.14);
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.05, r, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(metal, -0.22);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.35, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Axis-aligned cannon along +X. y is lateral offset from pivot axis. */
function drawCannon(ctx, metal, tip, x0, y, length, thickness, payload) {
  const h = thickness;
  const rise = h * 0.35;
  const dark = shade(metal, -0.22);
  const mid = metal;
  const light = shade(metal, 0.18);

  // underside / side face (fake extrusion toward "floor")
  ctx.fillStyle = dark;
  roundRect(ctx, x0, y - h / 2 + rise, length, h, h * 0.4);
  ctx.fill();
  // top face
  ctx.fillStyle = mid;
  roundRect(ctx, x0, y - h / 2, length, h * 0.78, h * 0.35);
  ctx.fill();
  // highlight
  ctx.fillStyle = light;
  roundRect(ctx, x0 + length * 0.08, y - h * 0.42, length * 0.65, h * 0.28, h * 0.18);
  ctx.fill();

  const band = Math.max(2.5, length * 0.16);
  ctx.fillStyle = shade(tip, -0.15);
  ctx.fillRect(x0 + length - band, y - h / 2 + rise * 0.3, band, h * 0.85);
  ctx.fillStyle = tip;
  ctx.fillRect(x0 + length - band * 0.7, y - h * 0.38, band * 0.7, h * 0.55);

  if (payload && payload !== "kinetic") {
    drawPayloadGem(ctx, tip, payload, x0 + length + h * 0.1, y - h * 0.05, h * 0.5);
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

