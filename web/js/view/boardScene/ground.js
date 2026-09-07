/**
 * Deck, walls, bastion, stains — the static board plate.
 */
import { VIEW25, deckRy } from "../camera.js";
import { shade, withAlpha, hash21 } from "../drawUtil.js";
import { fillQuad, strokeQuad } from "./geom.js";

export function drawBoardShadow(ctx, cam, palette, cell) {
  const corners = cam.boardCorners();
  const soft = corners.map((p) => ({ x: p.x + 6, y: p.y + 10 }));
  fillQuad(ctx, soft, "rgba(0,0,0,0.22)");
  const shadow = corners.map((p) => ({ x: p.x + 3, y: p.y + 5 }));
  fillQuad(ctx, shadow, "rgba(0,0,0,0.4)");

  const tl = corners[0];
  const tr = corners[1];
  const br = corners[2];
  const bl = corners[3];
  const lip = Math.max(5, cell * 0.12 * (0.75 + 0.5 * VIEW25.depthFog));
  const sideDrop = lip * 0.72;

  fillQuad(
    ctx,
    [
      { x: bl.x, y: bl.y },
      { x: br.x, y: br.y },
      { x: br.x + 2, y: br.y + lip },
      { x: bl.x - 2, y: bl.y + lip },
    ],
    shade(palette.bg, -0.24)
  );
  fillQuad(
    ctx,
    [
      { x: tl.x, y: tl.y },
      { x: bl.x, y: bl.y },
      { x: bl.x - 3, y: bl.y + sideDrop },
      { x: tl.x - 2, y: tl.y + sideDrop * 0.45 },
    ],
    shade(palette.bg, -0.32)
  );
  fillQuad(
    ctx,
    [
      { x: tr.x, y: tr.y },
      { x: br.x, y: br.y },
      { x: br.x + 3, y: br.y + sideDrop },
      { x: tr.x + 2, y: tr.y + sideDrop * 0.45 },
    ],
    shade(palette.bg, -0.18)
  );

  ctx.strokeStyle = withAlpha("#000000", 0.35);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bl.x, bl.y);
  ctx.lineTo(br.x, br.y);
  ctx.stroke();
}

/** Warm key from the far-left, cool fill — sells the metal deck. */
export function drawPlateLight(ctx, cam, palette, cell) {
  const plate = cam.boardCorners();
  const topY = (plate[0].y + plate[1].y) * 0.5;
  const botY = (plate[2].y + plate[3].y) * 0.5;
  const leftX = Math.min(plate[0].x, plate[3].x);
  const rightX = Math.max(plate[1].x, plate[2].x);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(plate[0].x, plate[0].y);
  for (let i = 1; i < plate.length; i++) ctx.lineTo(plate[i].x, plate[i].y);
  ctx.closePath();
  ctx.clip();

  const key = ctx.createRadialGradient(
    leftX + (rightX - leftX) * 0.28,
    topY + (botY - topY) * 0.18,
    8,
    leftX + (rightX - leftX) * 0.35,
    topY + (botY - topY) * 0.35,
    (rightX - leftX) * 0.85
  );
  key.addColorStop(0, withAlpha("#d4a574", 0.07));
  key.addColorStop(0.45, withAlpha("#6a8a9a", 0.03));
  key.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = key;
  ctx.fillRect(leftX - 10, topY - 10, rightX - leftX + 20, botY - topY + 20);

  const cool = ctx.createLinearGradient(leftX, topY, rightX, botY);
  cool.addColorStop(0, "rgba(0,0,0,0)");
  cool.addColorStop(0.7, "rgba(0,0,0,0)");
  cool.addColorStop(1, "rgba(4, 10, 18, 0.14)");
  ctx.fillStyle = cool;
  ctx.fillRect(leftX - 10, topY - 10, rightX - leftX + 20, botY - topY + 20);
  ctx.restore();
  void palette;
  void cell;
}

export function drawPlateRim(ctx, cam, palette, cell) {
  const plate = cam.boardCorners();
  const accent = palette.accent;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.strokeStyle = withAlpha("#e8eef6", 0.14);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(plate[0].x, plate[0].y);
  for (let i = 1; i < plate.length; i++) ctx.lineTo(plate[i].x, plate[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.strokeStyle = withAlpha(accent, 0.22);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  void cell;
}

export function drawDepthFog(ctx, cam, palette, cell) {
  const fog = VIEW25.depthFog;
  if (fog < 0.05) return;
  const plate = cam.boardCorners();
  const topY = (plate[0].y + plate[1].y) * 0.5;
  const botY = (plate[2].y + plate[3].y) * 0.5;
  const midX = (plate[0].x + plate[1].x + plate[2].x + plate[3].x) * 0.25;
  const grad = ctx.createLinearGradient(midX, topY, midX, botY);
  grad.addColorStop(0, `rgba(6, 8, 10, ${0.55 * fog})`);
  grad.addColorStop(0.35, `rgba(8, 10, 12, ${0.22 * fog})`);
  grad.addColorStop(0.7, `rgba(8, 10, 12, ${0.04 * fog})`);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(plate[0].x, plate[0].y);
  for (let i = 1; i < plate.length; i++) ctx.lineTo(plate[i].x, plate[i].y);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = grad;
  ctx.fillRect(
    Math.min(plate[0].x, plate[3].x) - 8,
    topY - 4,
    Math.max(plate[1].x, plate[2].x) - Math.min(plate[0].x, plate[3].x) + 16,
    botY - topY + 8
  );
  ctx.restore();
  void palette;
  void cell;
}

export function drawBracketAt(ctx, cam, palette, p, sx, sy, cell) {
  const L = Math.max(10, cell * 0.28 * p.s);
  ctx.strokeStyle = withAlpha(palette.accent, 0.55);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y + sy * L);
  ctx.lineTo(p.x, p.y);
  ctx.lineTo(p.x + sx * L, p.y);
  ctx.stroke();
  ctx.lineWidth = 1;
  void cam;
}

/** Future-industrial deck plate — machined panels, welds, rivets. */
export function drawDeckTile(ctx, cam, palette, x, y, isSpawn, cell) {
  const p = palette;
  const q = cam.cellQuad(x, y);
  const n = hash21(x, y);
  const depthV = cam.projectCell(x, y).v;
  const checker = (x + y) & 1;
  let base = checker ? p.tileA : p.tileB;
  if (isSpawn) base = shade("#1a2430", 0.02);
  const depthShade = -VIEW25.depthFog * 0.1 * (1 - Math.max(0, Math.min(1, depthV)));
  fillQuad(ctx, q, shade(base, n * 0.012 + depthShade));

  // Soft left-face shade for plate thickness reading
  const leftShade = [
    q[0],
    cam.projectCell(x, y, 0.22, 0.08),
    cam.projectCell(x, y, 0.22, 0.92),
    q[3],
  ];
  fillQuad(ctx, leftShade, "rgba(0,0,0,0.1)");

  // Dual machined insets
  const outer = cam.cellQuad(x, y, Math.max(2, cell * 0.06));
  const inner = cam.cellQuad(x, y, Math.max(4, cell * 0.14));
  strokeQuad(ctx, outer, withAlpha(p.tileSeam, 0.5), 1);
  strokeQuad(ctx, inner, withAlpha(p.tileMetal, 0.22), 1);

  // Cross weld + lateral seam
  const midH = cam.projectCell(x, y, 0.5, 0.18);
  const midH2 = cam.projectCell(x, y, 0.5, 0.82);
  const midV = cam.projectCell(x, y, 0.18, 0.5);
  const midV2 = cam.projectCell(x, y, 0.82, 0.5);
  ctx.strokeStyle = withAlpha(p.tileSeam, 0.32);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(midH.x, midH.y);
  ctx.lineTo(midH2.x, midH2.y);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(p.tileSeam, 0.18);
  ctx.beginPath();
  ctx.moveTo(midV.x, midV.y);
  ctx.lineTo(midV2.x, midV2.y);
  ctx.stroke();

  // Hatch ticks on some plates
  if (((x * 3 + y * 5) & 3) === 0) {
    ctx.strokeStyle = withAlpha(p.tileMetal, 0.16);
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const a = cam.projectCell(x, y, 0.28 + i * 0.14, 0.32);
      const b = cam.projectCell(x, y, 0.34 + i * 0.14, 0.68);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  // Corner rivets + mid-edge studs
  const rivets = [
    [0.16, 0.16],
    [0.84, 0.16],
    [0.16, 0.84],
    [0.84, 0.84],
    [0.5, 0.14],
    [0.5, 0.86],
  ];
  for (const [u, v] of rivets) {
    const r = cam.projectCell(x, y, u, v);
    const rr = Math.max(1.05, 1.55 * r.s);
    ctx.fillStyle = withAlpha(p.tileMetal, 0.62);
    ctx.beginPath();
    ctx.arc(r.x, r.y, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha("#e8eef4", 0.18);
    ctx.beginPath();
    ctx.arc(r.x - rr * 0.25, r.y - rr * 0.25, rr * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha("#0a0c10", 0.4);
    ctx.beginPath();
    ctx.arc(r.x + 0.35, r.y + 0.35, rr * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rare scorch / oil / ember stain
  if (n > 0.8) {
    const c = cam.projectCell(x, y, 0.45 + n * 0.05, 0.55);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 3.8 * c.s, 2.2 * c.s, 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (n < -0.86) {
    const c = cam.projectCell(x, y, 0.55, 0.4);
    ctx.fillStyle = withAlpha(p.accent, 0.08);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 2.6 * c.s, 1.5 * c.s, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Far-edge bevel + near-edge thickness
  ctx.strokeStyle = withAlpha("#c8d0d8", 0.16 + 0.08 * depthV);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(q[0].x, q[0].y);
  ctx.lineTo(q[1].x, q[1].y);
  ctx.stroke();
  ctx.strokeStyle = withAlpha("#000000", 0.2);
  ctx.beginPath();
  ctx.moveTo(q[3].x, q[3].y);
  ctx.lineTo(q[2].x, q[2].y);
  ctx.stroke();

  if (n > 0.52 && n < 0.64) {
    const gl = cam.projectCell(x, y, 0.35 + n * 0.2, 0.12);
    ctx.fillStyle = withAlpha("#f0f4f8", 0.14);
    ctx.beginPath();
    ctx.ellipse(gl.x, gl.y, 3 * gl.s, 1 * gl.s, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  strokeQuad(ctx, q, withAlpha(p.tileEdge, 0.7), 1);
}

export function drawField(ctx, cam, palette, grid, cell) {
  const p = palette;
  const plate = cam.boardCorners();
  fillQuad(ctx, plate, p.bg);
  drawPlateLight(ctx, cam, palette, cell);

  drawBracketAt(ctx, cam, palette, plate[0], 1, 1, cell);
  drawBracketAt(ctx, cam, palette, plate[1], -1, 1, cell);
  drawBracketAt(ctx, cam, palette, plate[3], 1, -1, cell);
  drawBracketAt(ctx, cam, palette, plate[2], -1, -1, cell);

  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      if (grid.isExit(x, y)) continue;
      drawDeckTile(ctx, cam, palette, x, y, grid.isSpawn(x, y), cell);
    }
  }

  drawPlateRim(ctx, cam, palette, cell);
  drawDepthFog(ctx, cam, palette, cell);
}

/** Industrial barricade — tall steel crate, copper hazard trim, rivets. */
export function drawWall(ctx, cam, palette, x, y, cell) {
  const p = palette;
  const wall = p.wall;
  const dark = p.wallDark || shade(wall, -0.35);
  const trim = p.wallTrim || p.accent;
  const q = cam.cellQuad(x, y, 1);
  const sAvg = (q[0].s + q[2].s) / 2;
  const rise = Math.max(5, cell * 0.22 * sAvg * VIEW25.vExag);

  // Ground contact shadow
  fillQuad(
    ctx,
    q.map((pt) => ({ x: pt.x + 1.5, y: pt.y + rise * 0.35 })),
    "rgba(0,0,0,0.45)"
  );

  // Front extruded face
  const front = [
    { x: q[3].x, y: q[3].y },
    { x: q[2].x, y: q[2].y },
    { x: q[2].x, y: q[2].y + rise },
    { x: q[3].x, y: q[3].y + rise },
  ];
  fillQuad(ctx, front, shade(dark, -0.08));

  // Side bevel (left edge drop)
  const side = [
    { x: q[0].x, y: q[0].y },
    { x: q[3].x, y: q[3].y },
    { x: q[3].x, y: q[3].y + rise },
    { x: q[0].x, y: q[0].y + rise * 0.55 },
  ];
  fillQuad(ctx, side, shade(dark, -0.18));

  // Top deck — bright plate so it pops off the floor
  fillQuad(ctx, q, shade(wall, 0.06));

  // Inner plate panel
  const inset = cam.cellQuad(x, y, Math.max(3, cell * 0.12));
  fillQuad(ctx, inset, shade(wall, -0.08));
  strokeQuad(ctx, inset, withAlpha("#0a0c10", 0.35), 1);

  // Copper hazard band across the near edge of the top
  ctx.strokeStyle = withAlpha(trim, 0.9);
  ctx.lineWidth = Math.max(2, 2.4 * sAvg);
  ctx.beginPath();
  ctx.moveTo(q[3].x, q[3].y);
  ctx.lineTo(q[2].x, q[2].y);
  ctx.stroke();

  // Diagonal hazard ticks on front face
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(front[0].x, front[0].y);
  ctx.lineTo(front[1].x, front[1].y);
  ctx.lineTo(front[2].x, front[2].y);
  ctx.lineTo(front[3].x, front[3].y);
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = withAlpha(trim, 0.35);
  ctx.lineWidth = 1.5;
  const fx0 = Math.min(front[0].x, front[3].x) - 4;
  const fx1 = Math.max(front[1].x, front[2].x) + 4;
  const fy0 = Math.min(front[0].y, front[1].y);
  const fy1 = Math.max(front[2].y, front[3].y);
  for (let i = -2; i < 8; i++) {
    const x0 = fx0 + i * 7;
    ctx.beginPath();
    ctx.moveTo(x0, fy0);
    ctx.lineTo(x0 + (fy1 - fy0), fy1);
    ctx.stroke();
  }
  ctx.restore();

  // Rivets on top plate corners
  for (const [u, v] of [
    [0.2, 0.2],
    [0.8, 0.2],
    [0.2, 0.75],
    [0.8, 0.75],
  ]) {
    const r = cam.projectCell(x, y, u, v);
    const rr = Math.max(1.4, 2.1 * r.s);
    ctx.fillStyle = shade(wall, 0.22);
    ctx.beginPath();
    ctx.arc(r.x, r.y, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha("#0a0c10", 0.45);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Top far-edge highlight + hard outline
  ctx.strokeStyle = withAlpha("#e8eef4", 0.35);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(q[0].x, q[0].y);
  ctx.lineTo(q[1].x, q[1].y);
  ctx.stroke();
  strokeQuad(ctx, q, shade(dark, -0.25), 1.5);

  // Front outline
  ctx.strokeStyle = withAlpha("#0a0c10", 0.55);
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(front[0].x, front[0].y);
  ctx.lineTo(front[3].x, front[3].y);
  ctx.lineTo(front[2].x, front[2].y);
  ctx.lineTo(front[1].x, front[1].y);
  ctx.stroke();
  ctx.lineWidth = 1;
}

/** Fancy defended home line — entire bottom row. */
export function drawBastion(ctx, cam, palette, grid, cell, t, flinch) {
  const y = grid.rows - 1;
  const accent = palette.accent;

  const left = cam.project(0, y * cell);
  const right = cam.project(grid.cols * cell, y * cell);
  const leftB = cam.project(0, (y + 1) * cell);
  const rightB = cam.project(grid.cols * cell, (y + 1) * cell);
  const body = [left, right, rightB, leftB].map((p) => ({ x: p.x, y: p.y + flinch }));

  // Extruded face under the rampart
  const rise = Math.max(4, cell * 0.14 * VIEW25.vExag);
  const face = [
    { x: leftB.x, y: leftB.y },
    { x: rightB.x, y: rightB.y },
    { x: rightB.x, y: rightB.y + rise },
    { x: leftB.x, y: leftB.y + rise },
  ];
  fillQuad(
    ctx,
    body.map((p) => ({ x: p.x + 2, y: p.y + 4 })),
    "rgba(0,0,0,0.4)"
  );
  fillQuad(ctx, face, "#2a2e28");
  fillQuad(ctx, body, "#3f463c");

  // Soft warm underglow along the rampart
  const glowGrad = ctx.createLinearGradient(left.x, left.y - 8, left.x, leftB.y + rise + 6);
  glowGrad.addColorStop(0, withAlpha(accent, 0.1 + 0.05 * Math.sin(t * 2.1)));
  glowGrad.addColorStop(0.55, withAlpha("#ff6b6b", 0.05));
  glowGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y - 6);
  ctx.lineTo(right.x, right.y - 6);
  ctx.lineTo(rightB.x, rightB.y + rise + 4);
  ctx.lineTo(leftB.x, leftB.y + rise + 4);
  ctx.closePath();
  ctx.fill();

  // Polished brass crown
  ctx.fillStyle = withAlpha(accent, 0.62);
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(right.x, right.y + (rightB.y - right.y) * 0.32);
  ctx.lineTo(left.x, left.y + (leftB.y - left.y) * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = withAlpha("#fff4c8", 0.36);
  ctx.lineWidth = 1.35;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y + 1);
  ctx.lineTo(right.x, right.y + 1);
  ctx.stroke();
  ctx.strokeStyle = withAlpha("#fff8e0", 0.14);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y + (leftB.y - left.y) * 0.28);
  ctx.lineTo(right.x, right.y + (rightB.y - right.y) * 0.28);
  ctx.stroke();

  // Living ward glow
  const glow = 0.32 + 0.14 * Math.sin(t * 2.4);
  ctx.strokeStyle = withAlpha("#ff6b6b", glow);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y + 2);
  ctx.lineTo(right.x, right.y + 2);
  ctx.stroke();
  ctx.strokeStyle = withAlpha("#ffd0a0", glow * 0.55);
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y + 2);
  ctx.lineTo(right.x, right.y + 2);
  ctx.stroke();

  // Merlons + rivets per cell
  for (let x = 0; x < grid.cols; x++) {
    const q = cam.cellQuad(x, y, 2);
    strokeQuad(ctx, q, withAlpha("#1a140c", 0.4), 1);
    const top = cam.projectCell(x, y, 0.5, 0.1);
    const s = top.s;
    ctx.fillStyle = shade(accent, 0.12);
    ctx.beginPath();
    const merlonH = 5 * s * VIEW25.vExag;
    ctx.moveTo(top.x - 4 * s, top.y + 1);
    ctx.lineTo(top.x - 2.2 * s, top.y - merlonH);
    ctx.lineTo(top.x + 2.2 * s, top.y - merlonH);
    ctx.lineTo(top.x + 4 * s, top.y + 1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withAlpha("#1a140c", 0.45);
    ctx.lineWidth = 1;
    ctx.stroke();

    const riv = cam.projectCell(x, y, 0.5, 0.72);
    ctx.fillStyle = shade(accent, -0.2);
    ctx.beginPath();
    ctx.arc(riv.x, riv.y, 1.6 * riv.s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Banner label plate
  const label = cam.project(grid.cols * cell * 0.5, (y + 0.58) * cell);
  const lw = Math.max(52, cell * 1.65 * label.s);
  const lh = Math.max(12, cell * 0.32 * label.s);
  ctx.fillStyle = "rgba(18,14,10,0.72)";
  ctx.fillRect(label.x - lw / 2, label.y - lh / 2, lw, lh);
  ctx.strokeStyle = withAlpha(accent, 0.65);
  ctx.lineWidth = 1.25;
  ctx.strokeRect(label.x - lw / 2, label.y - lh / 2, lw, lh);
  ctx.fillStyle = withAlpha("#ebe6d8", 0.9);
  ctx.font = `700 ${Math.max(9, cell * 0.2 * label.s)}px "Chakra Petch", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("BASTION", label.x, label.y + 0.5);
  ctx.lineWidth = 1;
}

// Stain sprites: per-damage-type cached radial gradient (32×32), tinted via drawImage + alpha.
// Avoids createRadialGradient per stain per frame (capped 80, every draw).
const _stainCache = new Map();
function _stainSprite(col) {
  const key = col;
  if (_stainCache.has(key)) return _stainCache.get(key);
  const S = 32;
  const c = document.createElement("canvas");
  c.width = S; c.height = S;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
  grad.addColorStop(0, col);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  _stainCache.set(key, c);
  return c;
}

export function drawStains(ctx, cam, palette, stains, cell) {
  if (!stains.length) return;
  for (const s of stains) {
    const p = cam.project(s.x * cell, s.y * cell);
    const col = palette.dmg(s.type);
    const r = s.r * cell * p.s;
    const ry = deckRy(r);
    const sprite = _stainSprite(col);
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * s.a;
    // Sprite is 32×32 circle; stretch to ellipse r × ry.
    ctx.drawImage(sprite, p.x - r, p.y - ry, r * 2, ry * 2);
    ctx.globalAlpha = a;
  }
}
