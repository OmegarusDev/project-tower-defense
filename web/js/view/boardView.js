import { buildAttackPlan } from "../sim/attackPlan.js";
import { drawComposedTower } from "./towerPainter.js";
import { VIEW25, deckRy, BoardCamera } from "./view25.js";
import { shade, withAlpha, hash21 } from "./drawUtil.js";

/** Draw towers/enemies a bit larger than the cell footprint. */
const UNIT_SCALE = 1.22;

export class BoardView {
  constructor(canvas, palette) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.palette = palette;
    this.sim = null;
    this.fx = null;
    this.cam = new BoardCamera();
    this.origin = { x: 16, y: 200 };
    this.cell = 40;
    this.hover = null;
    this.tool = "tower";
    this.selectedTowerId = -1;
    this.onTap = null;
    this._portalAcc = 0;

    canvas.addEventListener("pointerdown", (e) => this._pointer(e, true));
    canvas.addEventListener("pointermove", (e) => this._pointer(e, false));
  }

  setSim(sim) {
    this.sim = sim;
    this._fit();
  }

  /** Refresh derived camera after pitch changes. */
  refreshCamera() {
    this._fit();
  }

  _fit() {
    if (!this.sim) return;
    const g = this.sim.grid;
    const cssW = this.canvas.clientWidth || 360;
    const cssH = this.canvas.clientHeight || 640;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(cssW * dpr);
    this.canvas.height = Math.floor(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sy = VIEW25.yScale;
    this.cell = Math.max(
      26,
      Math.min(48, Math.min((cssW - 28) / g.cols, (cssH - 220) / (g.rows * sy)))
    );
    const boardW = this.cell * g.cols;
    const boardH = this.cell * g.rows * sy;
    const topPad = 108;
    const bottomPad = 148;
    const y = Math.max(topPad, Math.min(cssH - bottomPad - boardH, (cssH - boardH) / 2));
    this.origin = { x: (cssW - boardW) / 2, y };
    this.cam.configure(this.origin.x, this.origin.y, this.cell, g.cols, g.rows);
  }

  _cellAt(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return this.cam.cellAtScreen(clientX - rect.left, clientY - rect.top);
  }

  _pointer(e, down) {
    if (!this.sim) return;
    const c = this._cellAt(e.clientX, e.clientY);
    this.hover = c;
    if (down && this.sim.grid.inBounds(c.x, c.y) && this.onTap) this.onTap(c);
  }

  draw() {
    if (!this.sim) return;
    this._fit();
    const ctx = this.ctx;
    const g = this.sim.grid;
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    ctx.clearRect(0, 0, cssW, cssH);

    ctx.fillStyle = this.palette.void;
    ctx.fillRect(0, 0, cssW, cssH);

    this._drawBoardShadow();
    this._drawField(g);
    this._drawPath(g);
    this._drawBastion(g);
    this._drawPortal(g);
    this._emitPortalFx(g);

    for (const w of this.sim.walls) this._drawWall(w.cell.x, w.cell.y);
    const towers = [...this.sim.towers].sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x);
    for (const t of towers) this._drawTower(t);
    const enemies = [...this.sim.enemies].sort((a, b) => a.pos.y - b.pos.y);
    for (const e of enemies) this._drawEnemy(e);
    for (const p of this.sim.projectiles) this._drawProjectile(p);

    if (this.fx) {
      this.fx.drawProjected(ctx, this.cam, (type) => this.palette.dmg(type));
    }

    if (this.hover && g.inBounds(this.hover.x, this.hover.y) && this.selectedTowerId < 0) {
      this._drawHover(this.hover.x, this.hover.y, g.isBuildable(this.hover.x, this.hover.y));
    }

    this._drawAtmosphere(cssW, cssH);
  }

  cellScreenCenter(x, y) {
    const p = this.cam.projectCell(x, y);
    return { x: p.x, y: p.y };
  }

  _fillQuad(pts, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
  }

  _strokeQuad(pts, color, width = 1) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.stroke();
  }

  _drawBoardShadow() {
    const corners = this.cam.boardCorners();
    const shadow = corners.map((p) => ({ x: p.x + 3, y: p.y + 5 }));
    this._fillQuad(shadow, "rgba(0,0,0,0.35)");
  }

  _drawField(g) {
    const ctx = this.ctx;
    const p = this.palette;
    const plate = this.cam.boardCorners();
    this._fillQuad(plate, p.bg);

    this._drawBracketAt(plate[0], 1, 1);
    this._drawBracketAt(plate[1], -1, 1);
    this._drawBracketAt(plate[3], 1, -1);
    this._drawBracketAt(plate[2], -1, -1);

    for (let y = 0; y < g.rows; y++) {
      for (let x = 0; x < g.cols; x++) {
        if (g.isExit(x, y)) continue;
        this._drawDeckTile(x, y, g.isSpawn(x, y));
      }
    }
  }

  /** Future-industrial deck plate — uniform tone, structural detail. */
  _drawDeckTile(x, y, isSpawn) {
    const ctx = this.ctx;
    const p = this.palette;
    const q = this.cam.cellQuad(x, y);
    const n = hash21(x, y);
    // Minimal checker — just enough to read the grid
    const checker = (x + y) & 1;
    let base = checker ? p.tileA : p.tileB;
    if (isSpawn) base = shade("#1a2430", 0.02);
    this._fillQuad(q, shade(base, n * 0.012));

    // Inner panel inset (machined plate)
    const inner = this.cam.cellQuad(x, y, Math.max(2.5, this.cell * 0.08));
    this._strokeQuad(inner, withAlpha(p.tileSeam, 0.55), 1);

    // Cross-seam / weld line (subtle, not a face wash)
    const midH = this.cam.projectCell(x, y, 0.5, 0.22);
    const midH2 = this.cam.projectCell(x, y, 0.5, 0.78);
    ctx.strokeStyle = withAlpha(p.tileSeam, 0.28);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(midH.x, midH.y);
    ctx.lineTo(midH2.x, midH2.y);
    ctx.stroke();

    // Corner rivets
    const rivets = [
      [0.18, 0.18],
      [0.82, 0.18],
      [0.18, 0.82],
      [0.82, 0.82],
    ];
    for (const [u, v] of rivets) {
      const r = this.cam.projectCell(x, y, u, v);
      const rr = Math.max(1.1, 1.6 * r.s);
      ctx.fillStyle = withAlpha(p.tileMetal, 0.55);
      ctx.beginPath();
      ctx.arc(r.x, r.y, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha("#0a0c10", 0.35);
      ctx.beginPath();
      ctx.arc(r.x + 0.3, r.y + 0.3, rr * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rare scorch / oil stain (very sparse)
    if (n > 0.82) {
      const c = this.cam.projectCell(x, y, 0.45 + n * 0.05, 0.55);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 3.5 * c.s, 2 * c.s, 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (n < -0.88) {
      const c = this.cam.projectCell(x, y, 0.55, 0.4);
      ctx.fillStyle = withAlpha(p.accent, 0.06);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 2.5 * c.s, 1.4 * c.s, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Far-edge bevel
    ctx.strokeStyle = withAlpha("#c8d0d8", 0.08);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(q[0].x, q[0].y);
    ctx.lineTo(q[1].x, q[1].y);
    ctx.stroke();

    this._strokeQuad(q, withAlpha(p.tileEdge, 0.65), 1);
  }

  _drawBracketAt(p, sx, sy) {
    const ctx = this.ctx;
    const L = Math.max(10, this.cell * 0.28 * p.s);
    ctx.strokeStyle = withAlpha(this.palette.accent, 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + sy * L);
    ctx.lineTo(p.x, p.y);
    ctx.lineTo(p.x + sx * L, p.y);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  _pathPoints(g) {
    const pts = [this.cam.projectCell(g.spawn.x, g.spawn.y)];
    let cell = { x: g.spawn.x, y: g.spawn.y };
    for (let i = 0; i < 120; i++) {
      const next = g.nextGround(cell.x, cell.y);
      if (next.x === cell.x && next.y === cell.y) break;
      pts.push(this.cam.projectCell(next.x, next.y));
      if (g.isExit(next.x, next.y)) break;
      cell = next;
    }
    return pts;
  }

  _drawPath(g) {
    const ctx = this.ctx;
    const pts = this._pathPoints(g);
    if (pts.length < 2) return;

    const c = this.cell;
    const midS = pts[Math.floor(pts.length / 2)]?.s || 1;
    const w = Math.max(5, c * 0.38 * midS);
    const t = performance.now() * 0.001;
    const travel = -t * c * 1.15;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = "rgba(170, 205, 225, 0.07)";
    ctx.lineWidth = w;
    this._strokePts(pts);

    ctx.strokeStyle = "rgba(190, 220, 240, 0.1)";
    ctx.lineWidth = w * 0.55;
    this._strokePts(pts);

    ctx.strokeStyle = "rgba(210, 230, 245, 0.2)";
    ctx.lineWidth = w * 0.65;
    ctx.setLineDash([c * 0.32, c * 0.9]);
    ctx.lineDashOffset = travel;
    this._strokePts(pts);

    ctx.strokeStyle = "rgba(230, 242, 255, 0.14)";
    ctx.lineWidth = w * 0.32;
    ctx.setLineDash([c * 0.14, c * 1.08]);
    ctx.lineDashOffset = travel - c * 0.28;
    this._strokePts(pts);

    ctx.setLineDash([]);
    ctx.restore();
  }

  _strokePts(pts) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  _emitPortalFx(g) {
    if (!this.fx) return;
    this._portalAcc += 1;
    if (this._portalAcc % 8 !== 0) return;
    this.fx.portalMote(g.spawn.x + 0.5, g.spawn.y + 0.5);
  }

  /** Animated wormhole at spawn. */
  _drawPortal(g) {
    const ctx = this.ctx;
    const c = this.cam.projectCell(g.spawn.x, g.spawn.y);
    const t = performance.now() * 0.001;
    const rx = this.cell * 0.42 * c.s;
    const ry = deckRy(rx);
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);

    // Ground scorch / stone ring
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.ellipse(c.x + 1.5, c.y + 4, rx * 1.22, ry * 1.22, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = shade(this.palette.accent, -0.15);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx * 1.08, ry * 1.08, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = withAlpha("#ebe6d8", 0.2);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx * 1.18, ry * 1.18, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Outer halo
    const halo = ctx.createRadialGradient(c.x, c.y, rx * 0.2, c.x, c.y, rx * 1.35);
    halo.addColorStop(0, withAlpha("#6b3fa0", 0.15 + 0.1 * pulse));
    halo.addColorStop(0.55, withAlpha("#3d6a8a", 0.12));
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx * 1.35, ry * 1.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inner void
    const voidGrad = ctx.createRadialGradient(c.x, c.y - ry * 0.15, 0, c.x, c.y, rx);
    voidGrad.addColorStop(0, "rgba(12, 8, 28, 0.98)");
    voidGrad.addColorStop(0.35, "rgba(55, 28, 95, 0.88)");
    voidGrad.addColorStop(0.7, "rgba(40, 70, 90, 0.55)");
    voidGrad.addColorStop(1, "rgba(20, 30, 40, 0.15)");
    ctx.fillStyle = voidGrad;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx * 0.95, ry * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();

    // Spinning arcs + event horizon
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(1, VIEW25.deckRatio);
    for (let i = 0; i < 4; i++) {
      const a0 = t * (1.4 + i * 0.4) * (i % 2 ? -1 : 1) + i * 1.7;
      ctx.strokeStyle = withAlpha(i % 2 ? "#b08ad4" : "#7ec8a0", 0.62 - i * 0.08);
      ctx.lineWidth = 2.2 - i * 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, rx * (0.42 + i * 0.13), a0, a0 + 1.35 + i * 0.15);
      ctx.stroke();
    }
    ctx.strokeStyle = withAlpha("#e8d5ff", 0.35 + 0.2 * pulse);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, rx * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = withAlpha("#f2e8ff", 0.4 + 0.25 * pulse);
    ctx.beginPath();
    ctx.arc(0, 0, rx * (0.1 + 0.03 * pulse), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1;
  }

  /** Fancy defended home line — entire bottom row. */
  _drawBastion(g) {
    const ctx = this.ctx;
    const y = g.rows - 1;
    const t = performance.now() * 0.001;
    const accent = this.palette.accent;

    const left = this.cam.project(0, y * this.cell);
    const right = this.cam.project(g.cols * this.cell, y * this.cell);
    const leftB = this.cam.project(0, (y + 1) * this.cell);
    const rightB = this.cam.project(g.cols * this.cell, (y + 1) * this.cell);
    const body = [left, right, rightB, leftB];

    // Extruded face under the rampart
    const rise = Math.max(4, this.cell * 0.14);
    const face = [
      { x: leftB.x, y: leftB.y },
      { x: rightB.x, y: rightB.y },
      { x: rightB.x, y: rightB.y + rise },
      { x: leftB.x, y: leftB.y + rise },
    ];
    this._fillQuad(
      body.map((p) => ({ x: p.x + 2, y: p.y + 4 })),
      "rgba(0,0,0,0.4)"
    );
    this._fillQuad(face, "#2a2e28");
    this._fillQuad(body, "#3f463c");

    // Polished brass crown
    ctx.fillStyle = withAlpha(accent, 0.62);
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(right.x, right.y + (rightB.y - right.y) * 0.32);
    ctx.lineTo(left.x, left.y + (leftB.y - left.y) * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withAlpha("#fff4c8", 0.28);
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y + 1);
    ctx.lineTo(right.x, right.y + 1);
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
    for (let x = 0; x < g.cols; x++) {
      const q = this.cam.cellQuad(x, y, 2);
      this._strokeQuad(q, withAlpha("#1a140c", 0.4), 1);
      const top = this.cam.projectCell(x, y, 0.5, 0.1);
      const s = top.s;
      ctx.fillStyle = shade(accent, 0.12);
      ctx.beginPath();
      ctx.moveTo(top.x - 4 * s, top.y + 1);
      ctx.lineTo(top.x - 2.2 * s, top.y - 5 * s);
      ctx.lineTo(top.x + 2.2 * s, top.y - 5 * s);
      ctx.lineTo(top.x + 4 * s, top.y + 1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = withAlpha("#1a140c", 0.45);
      ctx.lineWidth = 1;
      ctx.stroke();

      const riv = this.cam.projectCell(x, y, 0.5, 0.72);
      ctx.fillStyle = shade(accent, -0.2);
      ctx.beginPath();
      ctx.arc(riv.x, riv.y, 1.6 * riv.s, 0, Math.PI * 2);
      ctx.fill();
    }

    // Banner label plate
    const label = this.cam.project(g.cols * this.cell * 0.5, (y + 0.58) * this.cell);
    const lw = Math.max(52, this.cell * 1.65 * label.s);
    const lh = Math.max(12, this.cell * 0.32 * label.s);
    ctx.fillStyle = "rgba(18,14,10,0.72)";
    ctx.fillRect(label.x - lw / 2, label.y - lh / 2, lw, lh);
    ctx.strokeStyle = withAlpha(accent, 0.65);
    ctx.lineWidth = 1.25;
    ctx.strokeRect(label.x - lw / 2, label.y - lh / 2, lw, lh);
    ctx.fillStyle = withAlpha("#ebe6d8", 0.9);
    ctx.font = `bold ${Math.max(9, this.cell * 0.2 * label.s)}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BASTION", label.x, label.y + 0.5);
    ctx.lineWidth = 1;
  }

  /** Industrial barricade — tall steel crate, copper hazard trim, rivets. */
  _drawWall(x, y) {
    const ctx = this.ctx;
    const p = this.palette;
    const wall = p.wall;
    const dark = p.wallDark || shade(wall, -0.35);
    const trim = p.wallTrim || p.accent;
    const q = this.cam.cellQuad(x, y, 1);
    const sAvg = (q[0].s + q[2].s) / 2;
    const rise = Math.max(5, this.cell * 0.22 * sAvg);

    // Ground contact shadow
    this._fillQuad(
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
    this._fillQuad(front, shade(dark, -0.08));

    // Side bevel (left edge drop)
    const side = [
      { x: q[0].x, y: q[0].y },
      { x: q[3].x, y: q[3].y },
      { x: q[3].x, y: q[3].y + rise },
      { x: q[0].x, y: q[0].y + rise * 0.55 },
    ];
    this._fillQuad(side, shade(dark, -0.18));

    // Top deck — bright plate so it pops off the floor
    this._fillQuad(q, shade(wall, 0.06));

    // Inner plate panel
    const inset = this.cam.cellQuad(x, y, Math.max(3, this.cell * 0.12));
    this._fillQuad(inset, shade(wall, -0.08));
    this._strokeQuad(inset, withAlpha("#0a0c10", 0.35), 1);

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
      const r = this.cam.projectCell(x, y, u, v);
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
    this._strokeQuad(q, shade(dark, -0.25), 1.5);

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

  _drawTower(t) {
    const ctx = this.ctx;
    const p = this.cam.projectCell(t.cell.x, t.cell.y);
    const s = this.cell * p.s * UNIT_SCALE;
    const px = p.x - s / 2;
    const py = p.y - s / 2;
    const selected = t.id === this.selectedTowerId;
    drawComposedTower(ctx, this.palette, t, px, py, s, selected);

    // XP bar above the tower (never across the base / cell edge)
    const cap = t.levelCap || 1;
    const need = t.xpToPoint || 55;
    const atCap = (t.level || 1) >= cap;
    const ratio = atCap ? 1 : Math.max(0, Math.min(1, (t.xp || 0) / need));
    const barW = s * 0.55;
    const barH = Math.max(3, s * 0.06);
    const bx = px + (s - barW) / 2;
    // Clear of the level badge (top-right) and well above the base pad
    const by = py + s * 0.28;
    ctx.fillStyle = "rgba(20,16,12,0.8)";
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    ctx.fillStyle = "rgba(60,55,45,0.9)";
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = atCap ? this.palette.accent : "#c9a227";
    ctx.fillRect(bx, by, barW * ratio, barH);

    if (selected) {
      const up = this.sim.partUpgrades || {};
      const rank = up[t.payload]?.chain | 0;
      const plan = buildAttackPlan(t.base, t.barrel, t.payload, t.level, { chainRank: rank });
      // Range as perspective ellipse (circle in board space → oval on screen)
      const r = plan.rangeCells * this.cell;
      const steps = 48;
      ctx.strokeStyle = withAlpha(this.palette.accent, 0.4);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const wx = (t.cell.x + 0.5) * this.cell + Math.cos(a) * r;
        const wy = (t.cell.y + 0.5) * this.cell + Math.sin(a) * r;
        const sp = this.cam.project(wx, wy);
        if (i === 0) ctx.moveTo(sp.x, sp.y);
        else ctx.lineTo(sp.x, sp.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    }
  }

  _drawEnemy(e) {
    const ctx = this.ctx;
    const p = this.cam.project(e.pos.x * this.cell, e.pos.y * this.cell);
    const s = this.cell * 0.8 * p.s * UNIT_SCALE;
    const cx = p.x;
    const cy = p.y;
    const col = this.palette.enemyColor(e.kind);

    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(cx + 1, cy + s * 0.2, s * 0.26, deckRy(s * 0.26), 0, 0, Math.PI * 2);
    ctx.fill();

    if (e.kind === "fast") this._enemyFast(cx, cy, s, col);
    else if (e.flying) this._enemyFly(cx, cy, s, col);
    else if (e.kind === "heavy" || e.kind === "boss") this._enemyHeavy(cx, cy, s, col, e.kind === "boss");
    else this._enemyBasic(cx, cy, s, col);

    let ring = null;
    if ((e.burnT || 0) > 0) ring = this.palette.dmg("fire");
    else if ((e.poisonT || 0) > 0) ring = this.palette.dmg("poison");
    else if ((e.shredT || 0) > 0) ring = this.palette.dmg("acid");
    else if ((e.slowT || 0) > 0) ring = this.palette.dmg("frost");
    if (ring) {
      ctx.strokeStyle = ring;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy - s * 0.04, s * 0.28, deckRy(s * 0.28), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    const ratio = Math.max(0, e.hp / e.maxHp);
    const barW = s * 0.72;
    ctx.fillStyle = "rgba(20,16,12,0.85)";
    ctx.fillRect(cx - barW / 2 - 1, cy - s * 0.44 - 1, barW + 2, 5);
    ctx.fillStyle = shade(this.palette.path, -0.35);
    ctx.fillRect(cx - barW / 2, cy - s * 0.44, barW, 3);
    ctx.fillStyle = ratio > 0.35 ? "#8fbf6a" : "#c45a4a";
    ctx.fillRect(cx - barW / 2, cy - s * 0.44, barW * ratio, 3);
  }

  _enemyBasic(cx, cy, s, col) {
    const ctx = this.ctx;
    const rx = s * 0.26;
    const ry = deckRy(rx);
    const rise = s * 0.14;
    ctx.fillStyle = shade(col, -0.25);
    ctx.beginPath();
    ctx.ellipse(cx, cy + rise * 0.4, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(col, -0.08);
    ctx.fillRect(cx - rx, cy - rise * 0.35, rx * 2, rise);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(cx, cy - rise * 0.35, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(20,14,10,0.45)";
    ctx.beginPath();
    ctx.ellipse(cx, cy - rise * 0.35, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  _enemyHeavy(cx, cy, s, col, boss) {
    const ctx = this.ctx;
    const rx = s * (boss ? 0.34 : 0.3);
    const ry = deckRy(rx);
    const rise = s * (boss ? 0.2 : 0.17);
    ctx.fillStyle = shade(col, -0.28);
    ctx.beginPath();
    ctx.ellipse(cx, cy + rise * 0.45, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(col, -0.1);
    ctx.fillRect(cx - rx, cy - rise * 0.3, rx * 2, rise);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(cx, cy - rise * 0.3, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _enemyFast(cx, cy, s, col) {
    const ctx = this.ctx;
    ctx.fillStyle = shade(col, -0.22);
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.26 + 2);
    ctx.lineTo(cx + s * 0.3, cy + s * 0.2 + 2);
    ctx.lineTo(cx - s * 0.3, cy + s * 0.2 + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.26);
    ctx.lineTo(cx + s * 0.3, cy + s * 0.2);
    ctx.lineTo(cx - s * 0.3, cy + s * 0.2);
    ctx.closePath();
    ctx.fill();
  }

  _enemyFly(cx, cy, s, col) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.26, s * 0.2, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(cx, cy - s * 0.1, s * 0.32, s * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawProjectile(p) {
    const ctx = this.ctx;
    const sp = this.cam.project(p.pos.x * this.cell, p.pos.y * this.cell);
    const col = this.palette.dmg(p.damageType);
    const r = 3.2 * sp.s;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(sp.x + 1, sp.y + 3, 4 * sp.s, 1.8 * sp.s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawHover(x, y, ok) {
    const q = this.cam.cellQuad(x, y, 2);
    this._fillQuad(q, ok ? "rgba(111,175,122,0.28)" : "rgba(196,90,74,0.28)");
    this._strokeQuad(q, ok ? withAlpha(this.palette.spawn, 0.7) : withAlpha(this.palette.exit, 0.7), 1.5);
  }

  _drawAtmosphere(cssW, cssH) {
    const ctx = this.ctx;
    const vg = ctx.createRadialGradient(cssW * 0.5, cssH * 0.42, cssH * 0.2, cssW * 0.5, cssH * 0.5, cssH * 0.78);
    vg.addColorStop(0, "transparent");
    vg.addColorStop(1, this.palette.fog);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, cssW, cssH);
  }
}
