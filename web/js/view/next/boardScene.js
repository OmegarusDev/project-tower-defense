/**
 * Board scene renderers — the pure drawing half of boardView, transcribed
 * EXACTLY from the oracle (same calls, same order, same constants). All
 * functions take (ctx, cam, palette, …) and read the shared camera. The
 * stateful half (input, camera glide, static-layer caching, stains/recoil
 * bookkeeping, fx, shake) stays in BoardView until the Phase 6 swap.
 */
import { renderTowerNext } from "./renderTower.js";
import { renderEnemyNext } from "./renderEnemy.js";
import { VIEW25, deckRy } from "../view25.js";
import { shade, withAlpha, hash21 } from "../drawUtil.js";

/** Draw towers/enemies a bit larger than the cell footprint. */
export const UNIT_SCALE = 1.22;

export function fillQuad(ctx, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

export function strokeQuad(ctx, pts, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
}

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

export function drawStains(ctx, cam, palette, stains, cell) {
  if (!stains.length) return;
  for (const s of stains) {
    const p = cam.project(s.x * cell, s.y * cell);
    const col = palette.dmg(s.type);
    const r = s.r * cell * p.s;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, withAlpha(col, s.a));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, deckRy(r), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Flow preview paths — starts at the live seam (portal cell), walks the
 * ground chain through the SAME option pool the live enemies pick from
 * (grid.groundOptions). Returns { trunk, branches }: the canonical trunk
 * plus every equally-optimal alternative branch, so the preview shows the
 * full option set the sim actually distributes over. Pure; the class keeps
 * its own revision cache.
 */
export function pathPoints(cam, grid, portalX, opts = {}) {
  const maxPaths = opts.maxPaths || 4;
  const maxSteps = 120;
  const avoid = opts.avoid || "none";
  const start = { x: portalX, y: 0 };
  const proj = (c) => cam.projectCell(c.x, c.y);
  const trunkCells = [];
  const drawn = new Set();
  let cell = { x: start.x, y: start.y };
  for (let i = 0; i < maxSteps; i++) {
    const key = `${cell.x},${cell.y}`;
    if (drawn.has(key)) break;
    drawn.add(key);
    trunkCells.push(cell);
    const next = grid.canonicalGround(cell.x, cell.y, { avoid });
    if (next.x === cell.x && next.y === cell.y) break;
    cell = next;
    if (grid.isExit(cell.x, cell.y)) {
      drawn.add(`${cell.x},${cell.y}`);
      trunkCells.push(cell);
      break;
    }
  }
  const trunk = trunkCells.map(proj);

  const branches = [];
  const forkQueue = trunkCells.slice(0);
  for (let fi = 0; fi < forkQueue.length && branches.length < maxPaths; fi++) {
    const fc = forkQueue[fi];
    const pool = grid.groundOptions(fc.x, fc.y, { avoid, flying: false });
    if (pool.length < 2) continue;
    const trunkChoice = grid.canonicalGround(fc.x, fc.y, { avoid });
    let added = 0;
    for (const opt of pool) {
      if (branches.length >= maxPaths) break;
      if (opt.x === trunkChoice.x && opt.y === trunkChoice.y) continue;
      if (added >= 1) break;
      const cells = [fc, opt];
      let cur = opt;
      let guard = 0;
      while (guard++ < maxSteps) {
        const key = `${cur.x},${cur.y}`;
        if (drawn.has(key)) break;
        drawn.add(key);
        const next = grid.canonicalGround(cur.x, cur.y, { avoid });
        if (next.x === cur.x && next.y === cur.y) break;
        cur = next;
        cells.push(cur);
        if (grid.isExit(cur.x, cur.y)) break;
      }
      if (cells.length > 1) {
        branches.push(cells.map(proj));
        added++;
      }
    }
  }
  return { trunk, branches };
}

export function strokePts(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function strokePathLayers(ctx, pts, { w, travel, pressure, warm, cell }) {
  const c = cell;
  ctx.strokeStyle = `rgba(120, 190, 220, ${0.06 + pressure * 0.08})`;
  ctx.lineWidth = w * 1.85;
  strokePts(ctx, pts);

  if (pressure > 0.15) {
    ctx.strokeStyle = `rgba(212, 120, 58, ${warm})`;
    ctx.lineWidth = w * 1.35;
    strokePts(ctx, pts);
  }

  ctx.strokeStyle = `rgba(170, 205, 225, ${0.08 + pressure * 0.1})`;
  ctx.lineWidth = w;
  strokePts(ctx, pts);

  ctx.strokeStyle = `rgba(190, 220, 240, ${0.12 + pressure * 0.12})`;
  ctx.lineWidth = w * 0.55;
  strokePts(ctx, pts);

  ctx.strokeStyle = `rgba(210, 230, 245, ${0.26 + pressure * 0.2})`;
  ctx.lineWidth = w * 0.65;
  ctx.setLineDash([c * 0.32, c * 0.9]);
  ctx.lineDashOffset = travel;
  strokePts(ctx, pts);

  ctx.strokeStyle = `rgba(240, 250, 255, ${0.2 + pressure * 0.25})`;
  ctx.lineWidth = w * 0.28;
  ctx.setLineDash([c * 0.12, c * 1.1]);
  ctx.lineDashOffset = travel - c * 0.28;
  strokePts(ctx, pts);
}

export function drawPath(ctx, cam, grid, portalX, cell, t, enemyCount) {
  void cam;
  const { trunk } = pathPoints(cam, grid, portalX, { maxPaths: 1 });
  if (trunk.length < 2) return;

  const pressure = Math.min(1, enemyCount / 14);
  const c = cell;
  const midS = trunk[Math.floor(trunk.length / 2)]?.s || 1;
  const w = Math.max(4, c * (0.28 + pressure * 0.08) * midS);
  const travel = -t * c * (1.15 + pressure * 0.8);
  const warm = 0.06 + pressure * 0.14;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  strokePathLayers(ctx, trunk, { w, travel, pressure, warm, cell: c });

  ctx.setLineDash([]);
  ctx.restore();
}

/** Animated wormhole at the live portal cell. */
export function drawPortal(ctx, cam, palette, portal, cell, t, animator = null) {
  if (!ctx || !cam || !palette || !portal || !cell) return;
  const c = cam.projectCell(portal.x, portal.y);
  const rx = cell * 0.42 * c.s;
  const ry = deckRy(rx);
  
  // Get animation state
  let stretch = 1.0;
  let alpha = 1.0;
  let bloomIntensity = 0;
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
  
  if (animator) {
    stretch = animator.stretch ?? 1.0;
    alpha = animator.alpha ?? 1.0;
    bloomIntensity = animator.bloomIntensity ?? 0;
  }
  
  // Clamp values
  stretch = Math.max(0.1, Math.min(5, stretch));
  alpha = Math.max(0, Math.min(1, alpha));
  bloomIntensity = Math.max(0, Math.min(1, bloomIntensity));

  // Apply alpha to all drawing - robust version without deprecated RegExp.$n
  const applyAlpha = (color, a) => {
    if (a <= 0) return "rgba(0,0,0,0)";
    if (color.startsWith('rgba')) {
      const m = color.match(/rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
      if (m) {
        return `rgba(${m[1]},${m[2]},${m[3]},${a * parseFloat(m[4])})`;
      }
      return "rgba(0,0,0,0)";
    }
    if (color.startsWith('#') || color.startsWith('rgb(')) {
      return withAlpha(color, a);
    }
    return withAlpha(color, a);
  };

  // Ground scorch / stone ring
  ctx.fillStyle = applyAlpha("rgba(0,0,0,0.4)", alpha);
  ctx.beginPath();
  ctx.ellipse(c.x + 1.5, c.y + 4, rx * 1.22 * stretch, ry * 1.22 * stretch, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = applyAlpha(shade(palette.accent, -0.15), alpha);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx * 1.08 * stretch, ry * 1.08 * stretch, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = applyAlpha(withAlpha("#ebe6d8", 0.2), alpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx * 1.18 * stretch, ry * 1.18 * stretch, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Outer halo with bloom
  const halo = ctx.createRadialGradient(c.x, c.y, rx * 0.2, c.x, c.y, rx * 1.55 * stretch);
  const baseHaloAlpha = 0.18 + 0.12 * pulse;
  const bloomBoost = bloomIntensity * 0.3;
  halo.addColorStop(0, withAlpha("#6b3fa0", (baseHaloAlpha + bloomBoost) * alpha));
  halo.addColorStop(0.45, withAlpha("#3d6a8a", 0.14 * alpha));
  halo.addColorStop(0.75, withAlpha("#7ec8a0", 0.05 * alpha));
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx * 1.55 * stretch, ry * 1.55 * stretch, 0, 0, Math.PI * 2);
  ctx.fill();

  // Breathing energy ring
  ctx.strokeStyle = applyAlpha(withAlpha("#c9a0e8", 0.22 + 0.18 * pulse), alpha);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx * (1.22 + 0.06 * pulse) * stretch, ry * (1.22 + 0.06 * pulse) * stretch, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Inner void
  const voidGrad = ctx.createRadialGradient(c.x, c.y - ry * 0.15 * stretch, 0, c.x, c.y, rx * stretch);
  voidGrad.addColorStop(0, applyAlpha("rgba(12, 8, 28, 0.98)", alpha));
  voidGrad.addColorStop(0.35, applyAlpha("rgba(55, 28, 95, 0.88)", alpha));
  voidGrad.addColorStop(0.7, applyAlpha("rgba(40, 70, 90, 0.55)", alpha));
  voidGrad.addColorStop(1, applyAlpha("rgba(20, 30, 40, 0.15)", alpha));
  ctx.fillStyle = voidGrad;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx * 0.95 * stretch, ry * 0.95 * stretch, 0, 0, Math.PI * 2);
  ctx.fill();

  // Spinning arcs + event horizon
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(stretch, VIEW25.deckRatio * stretch);
  for (let i = 0; i < 5; i++) {
    const a0 = t * (1.4 + i * 0.4) * (i % 2 ? -1 : 1) + i * 1.7;
    ctx.strokeStyle = applyAlpha(withAlpha(i % 2 ? "#b08ad4" : "#7ec8a0", 0.66 - i * 0.08), alpha);
    ctx.lineWidth = 2.2 - i * 0.28;
    ctx.beginPath();
    ctx.arc(0, 0, rx * (0.38 + i * 0.12), a0, a0 + 1.35 + i * 0.12);
    ctx.stroke();
  }
  ctx.strokeStyle = applyAlpha(withAlpha("#e8d5ff", 0.4 + 0.25 * pulse), alpha);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, rx * 0.28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = applyAlpha(withAlpha("#f2e8ff", 0.45 + 0.28 * pulse), alpha);
  ctx.beginPath();
  ctx.arc(0, 0, rx * (0.1 + 0.035 * pulse), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1;
}

/** Portal animation state machine for clump spawning. */
export class PortalAnimator {
  constructor() {
    this.phase = 'idle';        // idle | stretching_out | moving | stretching_in | spawning
    this.timer = 0;
    this.stretch = 1.0;         // 1.0 = normal, up to 2.5 = fully stretched
    this.alpha = 1.0;
    this.bloomIntensity = 0;
    this.targetPortal = { x: 0, y: 0 };
    this.lastPortal = { x: 0, y: 0 };
  }

  onClumpStart(portal) {
    this.lastPortal = { ...this.targetPortal };
    this.targetPortal = { ...portal };
    this.phase = 'stretching_in';
    this.timer = 0.25;
    this.alpha = 0;
    this.stretch = 2.5;
    this.bloomIntensity = 0.3;
  }

  onClumpEnd() {
    this.phase = 'stretching_out';
    this.timer = 0.3;
    this.bloomIntensity = 0.5;
  }

  onMove() {
    this.phase = 'moving';
    this.timer = 0;
  }

  update(dt) {
    if (this.timer <= 0 && this.phase !== 'idle') {
      if (this.phase === 'stretching_out') {
        // Stretch out complete - instant move
        this.phase = 'moving';
        this.timer = 0;
      } else if (this.phase === 'moving') {
        // Instant - start stretch in
        this.phase = 'stretching_in';
        this.timer = 0.25;
        this.alpha = 0;
        this.stretch = 2.5;
        this.bloomIntensity = 0.2;
      } else if (this.phase === 'stretching_in') {
        // Stretch in complete - start spawning
        this.phase = 'spawning';
        this.timer = 0;
      } else if (this.phase === 'spawning') {
        // Spawning phase - transition to idle until next clump
        this.phase = 'idle';
        this.timer = 0;
      }
    }
    this.timer = Math.max(0, this.timer - dt);

    // Interpolate visual properties based on phase
    const t = this.timer / (this.phase === 'stretching_out' ? 0.3 : 0.25);
    if (this.phase === 'stretching_out') {
      this.stretch = 1.0 + (2.5 - 1.0) * (1 - t);
      this.alpha = 1.0 - t;
      this.bloomIntensity = 0.5 * (1 - t);
    } else if (this.phase === 'stretching_in') {
      this.stretch = 2.5 - 1.5 * (1 - t);
      this.alpha = 1.0 - t;
      this.bloomIntensity = 0.2 * t;
    } else if (this.phase === 'moving') {
      this.stretch = 2.5;
      this.alpha = 0;
    } else if (this.phase === 'spawning') {
      this.stretch = Math.max(1.0, this.stretch - dt * 6);
      this.alpha = Math.min(1.0, this.alpha + dt * 4);
    } else {
      // idle
      this.stretch = 1.0;
      this.alpha = 1.0;
      this.bloomIntensity = 0;
    }
  }
}

export function drawEnemyFrame(ctx, cam, palette, e, cell, t) {
  const hitSquash = e._hitFlash > 0 ? 1 + e._hitFlash * 0.35 : 1;
  if (e._hitFlash > 0) e._hitFlash = Math.max(0, e._hitFlash - 0.04);
  const p = cam.project(e.pos.x * cell, e.pos.y * cell);
  const s = cell * 0.8 * p.s * UNIT_SCALE * hitSquash;
  const cx = p.x;
  const cy = p.y;

  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(cx + 1, cy + s * 0.22, s * 0.28, deckRy(s * 0.28), 0, 0, Math.PI * 2);
  ctx.fill();

  renderEnemyNext(ctx, palette, e.silhouette || e.kind, cx, cy, s, {
    t,
    phase: (e.id || 0) * 0.7,
    flying: !!e.flying,
    armorKind: e.armorKind,
    energyBlock: !!e.energyBlock,
  });

  if ((e.shieldHp || 0) > 0) {
    ctx.strokeStyle = withAlpha("#9ec8e8", 0.75);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy - s * 0.08, s * 0.34, deckRy(s * 0.34), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  let ring = null;
  if ((e.burnT || 0) > 0) ring = palette.dmg("fire");
  else if ((e.poisonT || 0) > 0) ring = palette.dmg("poison");
  else if ((e.shredT || 0) > 0) ring = palette.dmg("acid");
  else if ((e.slowT || 0) > 0) ring = palette.dmg("frost");
  else if ((e.regen || 0) > 0) ring = withAlpha("#c45a6a", 0.7);
  if (ring) {
    ctx.strokeStyle = ring;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy - s * 0.04, s * 0.3, deckRy(s * 0.3), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  const ratio = Math.max(0, e.hp / e.maxHp);
  const barW = s * 0.72;
  ctx.fillStyle = "rgba(20,16,12,0.85)";
  ctx.fillRect(cx - barW / 2 - 1, cy - s * 0.55 - 1, barW + 2, 5);
  ctx.fillStyle = shade(palette.path, -0.35);
  ctx.fillRect(cx - barW / 2, cy - s * 0.55, barW, 3);
  ctx.fillStyle = ratio > 0.35 ? "#8fbf6a" : "#c45a4a";
  ctx.fillRect(cx - barW / 2, cy - s * 0.55, barW * ratio, 3);
}

export function drawProjectile(ctx, cam, palette, p, cell) {
  const sp = cam.project(p.pos.x * cell, p.pos.y * cell);
  const type = p.damageType || "kinetic";
  const col = palette.dmg(type);
  const r = (type === "frost" ? 2.6 : type === "fire" ? 3.6 : 3.2) * sp.s;
  const trail = p._trail || (p._trail = []);
  trail.push({ x: p.pos.x, y: p.pos.y });
  const maxTrail = type === "fire" || type === "poison" ? 8 : 6;
  if (trail.length > maxTrail) trail.shift();
  for (let i = 0; i < trail.length - 1; i++) {
    const a = (i + 1) / trail.length;
    const t0 = cam.project(trail[i].x * cell, trail[i].y * cell);
    ctx.globalAlpha = a * (type === "acid" ? 0.35 : 0.45);
    ctx.fillStyle = col;
    if (type === "frost") {
      ctx.beginPath();
      ctx.moveTo(t0.x, t0.y - r * 0.5 * a);
      ctx.lineTo(t0.x + r * 0.4 * a, t0.y + r * 0.35 * a);
      ctx.lineTo(t0.x - r * 0.4 * a, t0.y + r * 0.35 * a);
      ctx.closePath();
      ctx.fill();
    } else if (type === "acid") {
      ctx.beginPath();
      ctx.ellipse(t0.x, t0.y, r * 0.45 * a, r * 0.7 * a, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(t0.x, t0.y, r * 0.55 * a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(sp.x + 1, sp.y + 3, 4 * sp.s, 1.8 * sp.s, 0, 0, Math.PI * 2);
  ctx.fill();
  const glow = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, r * 2.4);
  glow.addColorStop(0, withAlpha(col, type === "shock" ? 0.55 : 0.45));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sp.x, sp.y, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col;
  if (type === "kinetic") {
    // slug
    const ang = Math.atan2(p.vy || 0, p.vx || 1);
    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.35, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (type === "frost") {
    ctx.beginPath();
    ctx.moveTo(sp.x, sp.y - r * 1.2);
    ctx.lineTo(sp.x + r, sp.y + r * 0.7);
    ctx.lineTo(sp.x - r, sp.y + r * 0.7);
    ctx.closePath();
    ctx.fill();
  } else if (type === "acid") {
    ctx.beginPath();
    ctx.ellipse(sp.x, sp.y, r * 0.75, r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "shock") {
    ctx.beginPath();
    ctx.moveTo(sp.x - r, sp.y);
    ctx.lineTo(sp.x - r * 0.2, sp.y - r * 0.9);
    ctx.lineTo(sp.x + r * 0.35, sp.y - r * 0.15);
    ctx.lineTo(sp.x + r, sp.y);
    ctx.lineTo(sp.x + r * 0.2, sp.y + r * 0.9);
    ctx.lineTo(sp.x - r * 0.35, sp.y + r * 0.15);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = withAlpha("#ffffff", 0.45);
  ctx.beginPath();
  ctx.arc(sp.x - r * 0.25, sp.y - r * 0.25, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

export function drawHover(ctx, cam, palette, x, y, ok, cell) {
  const q = cam.cellQuad(x, y, 2);
  const col = ok ? palette.spawn : palette.exit;
  fillQuad(ctx, q, ok ? "rgba(111,175,122,0.22)" : "rgba(196,90,74,0.22)");
  strokeQuad(ctx, q, withAlpha(col, 0.55), 1.5);
  const inner = cam.cellQuad(x, y, Math.max(4, cell * 0.14));
  strokeQuad(ctx, inner, withAlpha(col, 0.28), 1);
  // Soft corner ticks
  ctx.strokeStyle = withAlpha(col, 0.7);
  ctx.lineWidth = 1.5;
  const L = Math.max(4, cell * 0.1);
  const ticks = [
    [q[0], 1, 1],
    [q[1], -1, 1],
    [q[2], -1, -1],
    [q[3], 1, -1],
  ];
  for (const [p, sx, sy] of ticks) {
    ctx.beginPath();
    ctx.moveTo(p.x + sx * L, p.y);
    ctx.lineTo(p.x, p.y);
    ctx.lineTo(p.x, p.y + sy * L);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
}

export function drawPlanGhost(ctx, cam, palette, plan, cell, cellSize) {
  if (!plan || !cell) return;
  const tint = palette.dmg(plan.damageType || "kinetic");
  const ox = cell.x + 0.5;
  const oy = cell.y + 0.5;
  const drawRing = (radiusCells, alpha, dash) => {
    const r = radiusCells * cellSize;
    const steps = 48;
    ctx.strokeStyle = withAlpha(tint, alpha);
    ctx.lineWidth = 1.6;
    ctx.setLineDash(dash);
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const sp = cam.project(ox * cellSize + Math.cos(a) * r, oy * cellSize + Math.sin(a) * r);
      if (i === 0) ctx.moveTo(sp.x, sp.y);
      else ctx.lineTo(sp.x, sp.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  };
  drawRing(plan.rangeCells || 2.5, 0.45, [5, 4]);
  if (plan.pulseRadius > 0) drawRing(plan.pulseRadius, 0.35, [2, 3]);
  if ((plan.chainJumps | 0) > 0) {
    const p0 = cam.project(ox * cellSize, oy * cellSize);
    for (let i = 0; i < Math.min(3, plan.chainJumps); i++) {
      const a = -0.4 + i * 0.55;
      const p1 = cam.project(
        (ox + Math.cos(a) * (plan.rangeCells * 0.7)) * cellSize,
        (oy + Math.sin(a) * (plan.rangeCells * 0.7)) * cellSize
      );
      ctx.strokeStyle = withAlpha(tint, 0.4);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }
  ctx.lineWidth = 1;
}

/** Range as perspective ellipse (circle in board space → oval on screen). */
export function drawRangeRing(ctx, cam, palette, cx, cy, rangeCells, cell, accent) {
  const r = rangeCells * cell;
  const steps = 48;
  ctx.strokeStyle = withAlpha(accent, 0.4);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const wx = cx * cell + Math.cos(a) * r;
    const wy = cy * cell + Math.sin(a) * r;
    const sp = cam.project(wx, wy);
    if (i === 0) ctx.moveTo(sp.x, sp.y);
    else ctx.lineTo(sp.x, sp.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
}

export function drawTowerFrame(ctx, cam, palette, t, px, py, s, opts) {
  const { selected, plan, cell } = opts;
  renderTowerNext(ctx, palette, t, px, py, s, { selected });

  // XP bar above the tower (never across the base / cell edge)
  const cap = t.levelCap || 1;
  const need = t.xpToPoint || 1;
  const atCap = (t.level || 1) >= cap;
  const ratio = atCap ? 1 : Math.max(0, Math.min(1, (t.xp || 0) / need));
  const barW = s * 0.55;
  const barH = Math.max(3, s * 0.06);
  const bx = px + (s - barW) / 2;
  // Sit above the pitch-linked turret hub (never across the base / cell edge)
  const by = py + s * (0.5 - VIEW25.rise) - Math.max(5, s * 0.12);
  ctx.fillStyle = "rgba(20,16,12,0.8)";
  ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
  ctx.fillStyle = "rgba(60,55,45,0.9)";
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = atCap ? palette.accent : "#c9a227";
  ctx.fillRect(bx, by, barW * ratio, barH);

  if (selected && plan) {
    drawRangeRing(ctx, cam, palette, t.cell.x + 0.5, t.cell.y + 0.5, plan.rangeCells, cell, palette.accent);
  }
}

/** Armed place — pulse the cell and ghost the loadout; second tap confirms. */
export function drawPendingPlace(ctx, cam, palette, pending, cell, t, cellSize) {
  const { x, y } = pending;
  const pulse = 0.5 + 0.5 * Math.sin(t * 7.2);
  const accent = palette.accent || "#e8c56a";

  const pad = cam.cellQuad(x, y, 2);
  fillQuad(ctx, pad, `rgba(232, 197, 106, ${0.16 + pulse * 0.14})`);
  strokeQuad(ctx, pad, withAlpha(accent, 0.55 + pulse * 0.4), 2.4);
  strokeQuad(ctx, cam.cellQuad(x, y, 5), withAlpha(accent, 0.18 + pulse * 0.22), 1.2);

  if (pending.base && pending.barrel && pending.payload) {
    const p = cam.projectCell(x, y);
    const s = cellSize * p.s * UNIT_SCALE;
    ctx.save();
    ctx.globalAlpha = 0.38 + pulse * 0.18;
    renderTowerNext(
      ctx,
      palette,
      {
        base: pending.base,
        barrel: pending.barrel,
        payload: pending.payload,
        level: 1,
        aimAngle: -Math.PI / 2,
      },
      p.x - s / 2,
      p.y - s / 2,
      s,
      { showBadge: false }
    );
    ctx.restore();
  }
}

export function drawAtmosphere(ctx, palette, cssW, cssH, t, motes, state) {
  const themePulse = state.themePulse;
  const bossVignette = state.bossVignette;
  const plate = state.plate;
  const atmo = palette.atmosphere || {};
  const fog = atmo.fog || palette.fog;
  const moteWarm = atmo.moteWarm || palette.accent;
  const moteCool = atmo.moteCool || "#9eb0c0";
  const bloomA = atmo.bloom ?? 0.35;

  const vg = ctx.createRadialGradient(
    cssW * 0.5,
    cssH * 0.38,
    cssH * 0.18,
    cssW * 0.5,
    cssH * 0.5,
    cssH * (0.74 + 0.08 * VIEW25.depthFog)
  );
  vg.addColorStop(0, "transparent");
  vg.addColorStop(1, fog);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, cssW, cssH);

  const bloom = ctx.createLinearGradient(0, 0, 0, cssH * 0.28);
  bloom.addColorStop(0, `rgba(4, 6, 8, ${bloomA + 0.25 * VIEW25.depthFog})`);
  bloom.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, cssW, cssH * 0.3);

  if (themePulse > 0) {
    ctx.fillStyle = withAlpha(atmo.pulse || moteWarm, themePulse * 0.12);
    ctx.fillRect(0, 0, cssW, cssH);
  }
  if (bossVignette > 0.05) {
    const bv = ctx.createRadialGradient(
      cssW * 0.5,
      cssH * 0.55,
      cssH * 0.2,
      cssW * 0.5,
      cssH * 0.55,
      cssH * 0.75
    );
    bv.addColorStop(0, "transparent");
    bv.addColorStop(1, `rgba(40, 8, 12, ${0.35 * bossVignette})`);
    ctx.fillStyle = bv;
    ctx.fillRect(0, 0, cssW, cssH);
  }

  if (plate) {
    const left = Math.min(plate[0].x, plate[3].x);
    const right = Math.max(plate[1].x, plate[2].x);
    const top = Math.min(plate[0].y, plate[1].y);
    const bot = Math.max(plate[2].y, plate[3].y);
    for (const m of motes) {
      m.v -= m.sp * 0.016;
      if (m.v < -0.05) {
        m.v = 1.05;
        m.u = Math.random();
      }
      const x = left + (right - left) * m.u + Math.sin(t * 0.7 + m.ph) * 6;
      const y = top + (bot - top) * m.v;
      const a = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(t * 2 + m.ph));
      ctx.fillStyle = m.warm ? withAlpha(moteWarm, a) : withAlpha(moteCool, a * 0.85);
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = "rgba(255,245,220,0.018)";
  for (let i = 0; i < 28; i++) {
    const x = ((i * 97 + t * 55) | 0) % cssW;
    const y = ((i * 53 + t * 23) | 0) % cssH;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
}