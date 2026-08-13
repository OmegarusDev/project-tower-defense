import { buildAttackPlan, planOptsFromParts } from "../sim/attackPlan.js";
import { XP_TO_POINT } from "../data/parts.js";
import { renderTower } from "./towerPainter.js";
import { drawEnemyBody } from "./enemyPainter.js";
import { VIEW25, setPitch, deckRy, BoardCamera } from "./view25.js";
import { shade, withAlpha, hash21 } from "./drawUtil.js";

/** Draw towers/enemies a bit larger than the cell footprint. */
const UNIT_SCALE = 1.22;
const ZOOM_MIN = 0.72;
const ZOOM_MAX = 1.85;

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
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.panMinX = 0;
    this.panMaxX = 0;
    this.panMin = 0;
    this.panMax = 0;
    this.hover = null;
    this.pendingPlace = null;
    this.tool = "tower";
    this.selectedTowerId = -1;
    this.onTap = null;
    this._portalAcc = 0;
    this._prevPortalX = -1;
    this._drag = null;
    this._pointers = new Map();
    this._pinch = null;
    this._staticDirty = true;
    this._staticLayer = null;
    this._fitKey = "";
    this._shakeT = 0;
    this._shakeMag = 0;
    this._bastionFlinch = 0;
    this._stains = [];
    this._ghostPlan = null;
    this.recoil = new Map();
    this.atmosphereId = "default";
    this._handOffT = 0;
    this._themePulse = 0;
    this._bossVignette = 0;
    this._motes = Array.from({ length: 18 }, () => ({
      u: Math.random(),
      v: Math.random(),
      r: 0.5 + Math.random() * 1.4,
      sp: 0.012 + Math.random() * 0.03,
      ph: Math.random() * Math.PI * 2,
      warm: Math.random() > 0.4,
    }));

    canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    canvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
    canvas.addEventListener("pointerup", (e) => this._onPointerUp(e));
    canvas.addEventListener("pointercancel", (e) => this._onPointerUp(e));
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (!this.sim) return;
        e.preventDefault();
        // Ctrl / ⌘ + wheel → zoom (desktop twin of pinch)
        if (e.ctrlKey || e.metaKey) {
          const factor = Math.exp(-e.deltaY * 0.0018);
          this.setZoom(this.zoom * factor);
          return;
        }
        this.panY = Math.max(this.panMin, Math.min(this.panMax, this.panY - e.deltaY * 0.45));
        this.panX = Math.max(this.panMinX, Math.min(this.panMaxX, this.panX - e.deltaX * 0.45));
        this._fit(true);
      },
      { passive: false }
    );
  }

  setAtmosphere(id) {
    this.atmosphereId = id || "default";
    this._themePulse = 0;
    this.palette?.setAtmosphere?.(this.atmosphereId);
    this._staticDirty = true;
  }

  setSim(sim) {
    this.sim = sim;
    this._stains.length = 0;
    this.recoil.clear();
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1;
    this._handOffT = 0;
    this._themePulse = 0;
    this.invalidateStatic();
    // Do not _fit here — resizing the canvas clears the buffer and flashes grey
    // while the menu is still on screen. enterGame → prepareEntry fits once.
  }

  /**
   * One-shot camera settle after HUD chrome mounts, then paint immediately
   * so the cleared buffer never shows through for a frame.
   */
  prepareEntry() {
    if (!this.sim) return;
    this._handOffT = 0;
    this._themePulse = 0;
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1;
    void this.canvas.offsetHeight;
    this._fitKey = "";
    this._fit(true);
    this.draw(0);
  }

  invalidateStatic() {
    this._staticDirty = true;
  }

  addStain(x, y, type = "kinetic") {
    if (this._stains.length > 80) this._stains.shift();
    this._stains.push({
      x: x + (Math.random() - 0.5) * 0.2,
      y: y + (Math.random() - 0.5) * 0.2,
      type,
      a: 0.35 + Math.random() * 0.25,
      r: 0.18 + Math.random() * 0.16,
    });
  }

  punch(mag = 3) {
    this._shakeT = 0.18;
    this._shakeMag = Math.max(this._shakeMag, mag);
  }

  bastionFlinch() {
    this._bastionFlinch = 0.35;
    this.punch(4.5);
  }

  setGhostPlan(plan, cell) {
    this._ghostPlan = plan && cell ? { plan, cell } : null;
  }

  noteRecoil(towerId) {
    this.recoil.set(towerId, 0.12);
  }

  resetPan() {
    this.panY = 0;
    this.panX = 0;
    this.zoom = 1;
    this._handOffT = 0;
    this.invalidateStatic();
    if (this.sim) this._fit();
  }

  setZoom(z) {
    this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    this._fit(true);
  }

  setPitchDeg(deg) {
    setPitch(deg);
    this._fit(true);
  }

  /** After the map grows south, ease pan so the new ground stays reachable. */
  onGridGrew() {
    this.invalidateStatic();
    this._fit(true);
    this.panY = Math.max(this.panMin, Math.min(this.panMax, this.panY - this.cell * 1.5));
    this._fit(true);
  }

  /** Refresh derived camera after pitch changes. */
  refreshCamera() {
    this._fit(true);
  }

  _fit(force = false) {
    if (!this.sim) return;
    const g = this.sim.grid;
    const cssW = this.canvas.clientWidth || 360;
    const cssH = this.canvas.clientHeight || 640;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const key = [
      cssW | 0,
      cssH | 0,
      dpr.toFixed(2),
      this.zoom.toFixed(3),
      this.panX.toFixed(2),
      this.panY.toFixed(2),
      g.cols,
      g.rows,
      VIEW25.pitchDeg | 0,
      this.sim.walls.length,
    ].join("|");
    if (!force && key === this._fitKey && this.canvas.width === Math.floor(cssW * dpr)) {
      return false;
    }
    const nextW = Math.floor(cssW * dpr);
    const nextH = Math.floor(cssH * dpr);
    const resized = this.canvas.width !== nextW || this.canvas.height !== nextH;
    const keyChanged = key !== this._fitKey;
    this._fitKey = key;
    // Reassigning canvas.width always clears the bitmap (even to the same size).
    if (resized) {
      this.canvas.width = nextW;
      this.canvas.height = nextH;
      this.invalidateStatic();
    } else if (force || keyChanged) {
      this.invalidateStatic();
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sy = VIEW25.yScale;
    const topPad = 72;
    const bottomPad = 162;
    const viewH = Math.max(120, cssH - topPad - bottomPad);
    const leftPad = 52;
    const rightPad = 16;

    const baseCell = Math.max(28, Math.min(46, (cssW - leftPad - rightPad) / g.cols));
    this.cell = baseCell * this.zoom;
    const boardW = this.cell * g.cols;
    const boardH = this.cell * g.rows * sy;

    if (boardW <= cssW - leftPad - rightPad) {
      this.panMinX = this.panMaxX = leftPad + (cssW - leftPad - rightPad - boardW) / 2;
      this.panX = this.panMinX;
    } else {
      this.panMaxX = leftPad;
      this.panMinX = cssW - boardW - rightPad;
      this.panX = Math.max(this.panMinX, Math.min(this.panMaxX, this.panX));
    }

    if (boardH <= viewH) {
      this.panMin = this.panMax = (viewH - boardH) / 2;
      this.panY = this.panMin;
    } else {
      this.panMax = 0;
      this.panMin = viewH - boardH;
      this.panY = Math.max(this.panMin, Math.min(this.panMax, this.panY));
    }

    this.origin = { x: this.panX, y: topPad + this.panY };
    this.cam.configure(this.origin.x, this.origin.y, this.cell, g.cols, g.rows);
    return true;
  }

  _cellAt(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return this.cam.cellAtScreen(clientX - rect.left, clientY - rect.top);
  }

  _pointerMid() {
    let x = 0;
    let y = 0;
    let n = 0;
    for (const p of this._pointers.values()) {
      x += p.x;
      y += p.y;
      n += 1;
    }
    return n ? { x: x / n, y: y / n } : null;
  }

  _pointerDist() {
    const pts = [...this._pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  _beginPinch() {
    const mid = this._pointerMid();
    const dist = this._pointerDist();
    if (!mid || dist < 8) return;
    this._pinch = {
      dist0: dist,
      zoom0: this.zoom,
      mid0: mid,
      panX0: this.panX,
      panY0: this.panY,
    };
    this._drag = null;
  }

  _onPointerDown(e) {
    if (!this.sim) return;
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }

    if (this._pointers.size >= 2) {
      this._beginPinch();
      return;
    }

    this._drag = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      panX0: this.panX,
      panY0: this.panY,
      moved: false,
    };
    this.hover = this._cellAt(e.clientX, e.clientY);
  }

  _onPointerMove(e) {
    if (!this.sim) return;
    if (this._pointers.has(e.pointerId)) {
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (this._pinch && this._pointers.size >= 2) {
      const mid = this._pointerMid();
      const dist = this._pointerDist();
      if (!mid || dist < 8) return;
      const scale = dist / this._pinch.dist0;
      this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this._pinch.zoom0 * scale));
      // Two-finger scroll pans while pinching
      this.panX = this._pinch.panX0 + (mid.x - this._pinch.mid0.x);
      this.panY = this._pinch.panY0 + (mid.y - this._pinch.mid0.y);
      this._fit(true);
      return;
    }

    this.hover = this._cellAt(e.clientX, e.clientY);
    const d = this._drag;
    if (!d || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y0;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.hypot(dx, dy) > 8) d.moved = true;
    if (d.moved) {
      this.panY = Math.max(this.panMin, Math.min(this.panMax, d.panY0 + dy));
      this.panX = Math.max(this.panMinX, Math.min(this.panMaxX, d.panX0 + dx));
      this._fit(true);
    }
  }

  _onPointerUp(e) {
    if (!this.sim) return;
    this._pointers.delete(e.pointerId);
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }

    if (this._pinch) {
      if (this._pointers.size >= 2) {
        this._beginPinch();
        return;
      }
      this._pinch = null;
      this._drag = null;
      return;
    }

    const d = this._drag;
    if (!d || e.pointerId !== d.id) return;
    this._drag = null;
    if (d.moved) return;
    const c = this._cellAt(e.clientX, e.clientY);
    if (this.sim.grid.inBounds(c.x, c.y) && this.onTap) this.onTap(c);
  }

  draw(dt = 0.016) {
    if (!this.sim) return;
    this._fit(false);
    if (this._shakeT > 0) {
      this._shakeT = Math.max(0, this._shakeT - dt);
      if (this._shakeT <= 0) this._shakeMag = 0;
    }
    if (this._bastionFlinch > 0) this._bastionFlinch = Math.max(0, this._bastionFlinch - dt);
    for (const [id, t] of this.recoil) {
      const n = t - dt;
      if (n <= 0) this.recoil.delete(id);
      else this.recoil.set(id, n);
    }

    const ctx = this.ctx;
    const g = this.sim.grid;
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    ctx.fillStyle = this.palette.void;
    ctx.fillRect(0, 0, cssW, cssH);

    const shake =
      this._shakeT > 0
        ? {
            x: (Math.random() - 0.5) * this._shakeMag * (this._shakeT / 0.18),
            y: (Math.random() - 0.5) * this._shakeMag * (this._shakeT / 0.18),
          }
        : { x: 0, y: 0 };
    ctx.save();
    ctx.translate(shake.x, shake.y);

    this._ensureStaticLayer(cssW, cssH, dpr);
    if (this._staticLayer) {
      ctx.drawImage(this._staticLayer, 0, 0, cssW, cssH);
    } else {
    this._drawBoardShadow();
      this._drawField(g);
      for (const w of this.sim.walls) this._drawWall(w.cell.x, w.cell.y);
    }

    this._drawStains();
    this._drawBastion(g);
    this._drawPath(g);
    this._drawPortal(g);
    this._emitPortalFx(g);

    const towers = [...this.sim.towers].sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x);
    for (const t of towers) this._drawTower(t);
    const enemies = [...this.sim.enemies].sort((a, b) => a.pos.y - b.pos.y);
    for (const e of enemies) this._drawEnemy(e);
    for (const p of this.sim.projectiles) this._drawProjectile(p);

    if (this.fx) {
      this.fx.drawProjected(ctx, this.cam, (type) => this.palette.dmg(type));
    }

    if (this._ghostPlan) this._drawPlanGhost(this._ghostPlan.plan, this._ghostPlan.cell);
    if (this.pendingPlace && g.inBounds(this.pendingPlace.x, this.pendingPlace.y)) {
      this._drawPendingPlace(this.pendingPlace);
    } else if (this.hover && g.inBounds(this.hover.x, this.hover.y) && this.selectedTowerId < 0) {
      this._drawHover(this.hover.x, this.hover.y, g.isBuildable(this.hover.x, this.hover.y));
    }

    ctx.restore();
    this._drawAtmosphere(cssW, cssH);
  }

  _ensureStaticLayer(cssW, cssH, dpr) {
    if (!this._staticDirty && this._staticLayer) return;
    if (!this._staticLayer) this._staticLayer = document.createElement("canvas");
    const layer = this._staticLayer;
    const w = Math.floor(cssW * dpr);
    const h = Math.floor(cssH * dpr);
    if (layer.width !== w || layer.height !== h) {
      layer.width = w;
      layer.height = h;
    }
    const lctx = layer.getContext("2d");
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, cssW, cssH);
    const prev = this.ctx;
    this.ctx = lctx;
    const g = this.sim.grid;
    this._drawBoardShadow();
    this._drawField(g);
    for (const wall of this.sim.walls) this._drawWall(wall.cell.x, wall.cell.y);
    this.ctx = prev;
    this._staticDirty = false;
  }

  _drawStains() {
    if (!this._stains.length) return;
    const ctx = this.ctx;
    for (const s of this._stains) {
      const p = this.cam.project(s.x * this.cell, s.y * this.cell);
      const col = this.palette.dmg(s.type);
      const r = s.r * this.cell * p.s;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, withAlpha(col, s.a));
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, deckRy(r), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawPlanGhost(plan, cell) {
    if (!plan || !cell) return;
    const ctx = this.ctx;
    const tint = this.palette.dmg(plan.damageType || "kinetic");
    const ox = cell.x + 0.5;
    const oy = cell.y + 0.5;
    const drawRing = (radiusCells, alpha, dash) => {
      const r = radiusCells * this.cell;
      const steps = 48;
      ctx.strokeStyle = withAlpha(tint, alpha);
      ctx.lineWidth = 1.6;
      ctx.setLineDash(dash);
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const sp = this.cam.project(ox * this.cell + Math.cos(a) * r, oy * this.cell + Math.sin(a) * r);
        if (i === 0) ctx.moveTo(sp.x, sp.y);
        else ctx.lineTo(sp.x, sp.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    drawRing(plan.rangeCells || 2.5, 0.45, [5, 4]);
    if (plan.pulseRadius > 0) drawRing(plan.pulseRadius, 0.35, [2, 3]);
    if ((plan.chainJumps | 0) > 0) {
      const p0 = this.cam.project(ox * this.cell, oy * this.cell);
      for (let i = 0; i < Math.min(3, plan.chainJumps); i++) {
        const a = -0.4 + i * 0.55;
        const p1 = this.cam.project(
          (ox + Math.cos(a) * (plan.rangeCells * 0.7)) * this.cell,
          (oy + Math.sin(a) * (plan.rangeCells * 0.7)) * this.cell
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
    const soft = corners.map((p) => ({ x: p.x + 6, y: p.y + 10 }));
    this._fillQuad(soft, "rgba(0,0,0,0.22)");
    const shadow = corners.map((p) => ({ x: p.x + 3, y: p.y + 5 }));
    this._fillQuad(shadow, "rgba(0,0,0,0.4)");

    const tl = corners[0];
    const tr = corners[1];
    const br = corners[2];
    const bl = corners[3];
    const lip = Math.max(5, this.cell * 0.12 * (0.75 + 0.5 * VIEW25.depthFog));
    const sideDrop = lip * 0.72;

    this._fillQuad(
      [
        { x: bl.x, y: bl.y },
        { x: br.x, y: br.y },
        { x: br.x + 2, y: br.y + lip },
        { x: bl.x - 2, y: bl.y + lip },
      ],
      shade(this.palette.bg, -0.24)
    );
    this._fillQuad(
      [
        { x: tl.x, y: tl.y },
        { x: bl.x, y: bl.y },
        { x: bl.x - 3, y: bl.y + sideDrop },
        { x: tl.x - 2, y: tl.y + sideDrop * 0.45 },
      ],
      shade(this.palette.bg, -0.32)
    );
    this._fillQuad(
      [
        { x: tr.x, y: tr.y },
        { x: br.x, y: br.y },
        { x: br.x + 3, y: br.y + sideDrop },
        { x: tr.x + 2, y: tr.y + sideDrop * 0.45 },
      ],
      shade(this.palette.bg, -0.18)
    );

    this.ctx.strokeStyle = withAlpha("#000000", 0.35);
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(bl.x, bl.y);
    this.ctx.lineTo(br.x, br.y);
    this.ctx.stroke();
  }

  _drawField(g) {
    const p = this.palette;
    const plate = this.cam.boardCorners();
    this._fillQuad(plate, p.bg);
    this._drawPlateLight(plate);

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

    this._drawPlateRim(plate);
    this._drawDepthFog(plate);
  }

  /** Warm key from the far-left, cool fill — sells the metal deck. */
  _drawPlateLight(plate) {
    const ctx = this.ctx;
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
  }

  _drawPlateRim(plate) {
    const ctx = this.ctx;
    const accent = this.palette.accent;
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
  }

  _drawDepthFog(plate) {
    const ctx = this.ctx;
    const fog = VIEW25.depthFog;
    if (fog < 0.05) return;
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
  }

  /** Future-industrial deck plate — machined panels, welds, rivets. */
  _drawDeckTile(x, y, isSpawn) {
    const ctx = this.ctx;
    const p = this.palette;
    const q = this.cam.cellQuad(x, y);
    const n = hash21(x, y);
    const depthV = this.cam.projectCell(x, y).v;
    const checker = (x + y) & 1;
    let base = checker ? p.tileA : p.tileB;
    if (isSpawn) base = shade("#1a2430", 0.02);
    const depthShade = -VIEW25.depthFog * 0.1 * (1 - Math.max(0, Math.min(1, depthV)));
    this._fillQuad(q, shade(base, n * 0.012 + depthShade));

    // Soft left-face shade for plate thickness reading
    const leftShade = [
      q[0],
      this.cam.projectCell(x, y, 0.22, 0.08),
      this.cam.projectCell(x, y, 0.22, 0.92),
      q[3],
    ];
    this._fillQuad(leftShade, "rgba(0,0,0,0.1)");

    // Dual machined insets
    const outer = this.cam.cellQuad(x, y, Math.max(2, this.cell * 0.06));
    const inner = this.cam.cellQuad(x, y, Math.max(4, this.cell * 0.14));
    this._strokeQuad(outer, withAlpha(p.tileSeam, 0.5), 1);
    this._strokeQuad(inner, withAlpha(p.tileMetal, 0.22), 1);

    // Cross weld + lateral seam
    const midH = this.cam.projectCell(x, y, 0.5, 0.18);
    const midH2 = this.cam.projectCell(x, y, 0.5, 0.82);
    const midV = this.cam.projectCell(x, y, 0.18, 0.5);
    const midV2 = this.cam.projectCell(x, y, 0.82, 0.5);
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
        const a = this.cam.projectCell(x, y, 0.28 + i * 0.14, 0.32);
        const b = this.cam.projectCell(x, y, 0.34 + i * 0.14, 0.68);
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
      const r = this.cam.projectCell(x, y, u, v);
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
      const c = this.cam.projectCell(x, y, 0.45 + n * 0.05, 0.55);
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 3.8 * c.s, 2.2 * c.s, 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (n < -0.86) {
      const c = this.cam.projectCell(x, y, 0.55, 0.4);
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
      const gl = this.cam.projectCell(x, y, 0.35 + n * 0.2, 0.12);
      ctx.fillStyle = withAlpha("#f0f4f8", 0.14);
      ctx.beginPath();
      ctx.ellipse(gl.x, gl.y, 3 * gl.s, 1 * gl.s, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    this._strokeQuad(q, withAlpha(p.tileEdge, 0.7), 1);
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
    // Flow preview starts at the live seam — the portal's current cell.
    const start = this.sim?.portal || { x: g.spawn.x, y: 0 };
    const pts = [this.cam.projectCell(start.x, start.y)];
    let cell = { x: start.x, y: start.y };
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

    const pressure = Math.min(1, (this.sim?.enemies?.length || 0) / 14);
    const c = this.cell;
    const midS = pts[Math.floor(pts.length / 2)]?.s || 1;
    const w = Math.max(5, c * (0.38 + pressure * 0.12) * midS);
    const t = performance.now() * 0.001;
    const travel = -t * c * (1.15 + pressure * 0.8);
    const warm = 0.06 + pressure * 0.14;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = `rgba(120, 190, 220, ${0.06 + pressure * 0.08})`;
    ctx.lineWidth = w * 1.85;
    this._strokePts(pts);

    if (pressure > 0.15) {
      ctx.strokeStyle = `rgba(212, 120, 58, ${warm})`;
      ctx.lineWidth = w * 1.35;
      this._strokePts(pts);
    }

    ctx.strokeStyle = `rgba(170, 205, 225, ${0.08 + pressure * 0.1})`;
    ctx.lineWidth = w;
    this._strokePts(pts);

    ctx.strokeStyle = `rgba(190, 220, 240, ${0.12 + pressure * 0.12})`;
    ctx.lineWidth = w * 0.55;
    this._strokePts(pts);

    ctx.strokeStyle = `rgba(210, 230, 245, ${0.26 + pressure * 0.2})`;
    ctx.lineWidth = w * 0.65;
    ctx.setLineDash([c * 0.32, c * 0.9]);
    ctx.lineDashOffset = travel;
    this._strokePts(pts);

    ctx.strokeStyle = `rgba(240, 250, 255, ${0.2 + pressure * 0.25})`;
    ctx.lineWidth = w * 0.28;
    ctx.setLineDash([c * 0.12, c * 1.1]);
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
    const p = this.sim?.portal || g.spawn;
    this.fx.portalMote(p.x + 0.5, p.y + 0.5);
  }

  /** Animated wormhole at the live portal cell. */
  _drawPortal(g) {
    const ctx = this.ctx;
    const p = this.sim?.portal || g.spawn;
    if (this._prevPortalX !== p.x) {
      // Seam re-opened: puff at the new cell (and mark the old one closing)
      this._prevPortalX = p.x;
      if (this.fx) {
        for (let i = 0; i < 6; i++) this.fx.portalMote(p.x + 0.5, p.y + 0.5);
      }
    }
    const c = this.cam.projectCell(p.x, p.y);
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
    const halo = ctx.createRadialGradient(c.x, c.y, rx * 0.2, c.x, c.y, rx * 1.55);
    halo.addColorStop(0, withAlpha("#6b3fa0", 0.18 + 0.12 * pulse));
    halo.addColorStop(0.45, withAlpha("#3d6a8a", 0.14));
    halo.addColorStop(0.75, withAlpha("#7ec8a0", 0.05));
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx * 1.55, ry * 1.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // Breathing energy ring
    ctx.strokeStyle = withAlpha("#c9a0e8", 0.22 + 0.18 * pulse);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx * (1.22 + 0.06 * pulse), ry * (1.22 + 0.06 * pulse), 0, 0, Math.PI * 2);
    ctx.stroke();

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
    for (let i = 0; i < 5; i++) {
      const a0 = t * (1.4 + i * 0.4) * (i % 2 ? -1 : 1) + i * 1.7;
      ctx.strokeStyle = withAlpha(i % 2 ? "#b08ad4" : "#7ec8a0", 0.66 - i * 0.08);
      ctx.lineWidth = 2.2 - i * 0.28;
      ctx.beginPath();
      ctx.arc(0, 0, rx * (0.38 + i * 0.12), a0, a0 + 1.35 + i * 0.12);
      ctx.stroke();
    }
    ctx.strokeStyle = withAlpha("#e8d5ff", 0.4 + 0.25 * pulse);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, rx * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = withAlpha("#f2e8ff", 0.45 + 0.28 * pulse);
    ctx.beginPath();
    ctx.arc(0, 0, rx * (0.1 + 0.035 * pulse), 0, Math.PI * 2);
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
    const flinch = this._bastionFlinch > 0 ? Math.sin(this._bastionFlinch * 40) * 2.5 : 0;

    const left = this.cam.project(0, y * this.cell);
    const right = this.cam.project(g.cols * this.cell, y * this.cell);
    const leftB = this.cam.project(0, (y + 1) * this.cell);
    const rightB = this.cam.project(g.cols * this.cell, (y + 1) * this.cell);
    const body = [left, right, rightB, leftB].map((p) => ({ x: p.x, y: p.y + flinch }));

    // Extruded face under the rampart
    const rise = Math.max(4, this.cell * 0.14 * VIEW25.vExag);
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
    for (let x = 0; x < g.cols; x++) {
      const q = this.cam.cellQuad(x, y, 2);
      this._strokeQuad(q, withAlpha("#1a140c", 0.4), 1);
      const top = this.cam.projectCell(x, y, 0.5, 0.1);
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
    ctx.font = `700 ${Math.max(9, this.cell * 0.2 * label.s)}px "Chakra Petch", sans-serif`;
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
    const rise = Math.max(5, this.cell * 0.22 * sAvg * VIEW25.vExag);

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
    const recoil = this.recoil.get(t.id) || 0;
    const kick = recoil > 0 ? Math.cos(t.aimAngle || 0) * recoil * 10 * p.s : 0;
    const kickY = recoil > 0 ? Math.sin(t.aimAngle || 0) * recoil * 10 * p.s : 0;
    const px = p.x - s / 2 - kick;
    const py = p.y - s / 2 - kickY;
    const selected = t.id === this.selectedTowerId;
    renderTower(ctx, this.palette, t, px, py, s, { selected });

    // XP bar above the tower (never across the base / cell edge)
    const cap = t.levelCap || 1;
    const need = t.xpToPoint || XP_TO_POINT;
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
    ctx.fillStyle = atCap ? this.palette.accent : "#c9a227";
    ctx.fillRect(bx, by, barW * ratio, barH);

    if (selected) {
      const up = this.sim.partUpgrades || {};
      const g = this.sim.globalMods || {};
      const plan = buildAttackPlan(
        t.base,
        t.barrel,
        t.payload,
        t.level,
        planOptsFromParts(up, g, t)
      );
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
    const hitSquash = e._hitFlash > 0 ? 1 + e._hitFlash * 0.35 : 1;
    if (e._hitFlash > 0) e._hitFlash = Math.max(0, e._hitFlash - 0.04);
    const p = this.cam.project(e.pos.x * this.cell, e.pos.y * this.cell);
    const s = this.cell * 0.8 * p.s * UNIT_SCALE * hitSquash;
    const cx = p.x;
    const cy = p.y;

    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(cx + 1, cy + s * 0.22, s * 0.28, deckRy(s * 0.28), 0, 0, Math.PI * 2);
    ctx.fill();

    const t = performance.now() * 0.001;
    drawEnemyBody(ctx, this.palette, e.silhouette || e.kind, cx, cy, s, {
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
    if ((e.burnT || 0) > 0) ring = this.palette.dmg("fire");
    else if ((e.poisonT || 0) > 0) ring = this.palette.dmg("poison");
    else if ((e.shredT || 0) > 0) ring = this.palette.dmg("acid");
    else if ((e.slowT || 0) > 0) ring = this.palette.dmg("frost");
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
    ctx.fillStyle = shade(this.palette.path, -0.35);
    ctx.fillRect(cx - barW / 2, cy - s * 0.55, barW, 3);
    ctx.fillStyle = ratio > 0.35 ? "#8fbf6a" : "#c45a4a";
    ctx.fillRect(cx - barW / 2, cy - s * 0.55, barW * ratio, 3);
  }

  _drawProjectile(p) {
    const ctx = this.ctx;
    const sp = this.cam.project(p.pos.x * this.cell, p.pos.y * this.cell);
    const type = p.damageType || "kinetic";
    const col = this.palette.dmg(type);
    const r = (type === "frost" ? 2.6 : type === "fire" ? 3.6 : 3.2) * sp.s;
    const trail = p._trail || (p._trail = []);
    trail.push({ x: p.pos.x, y: p.pos.y });
    const maxTrail = type === "fire" || type === "poison" ? 8 : 6;
    if (trail.length > maxTrail) trail.shift();
    for (let i = 0; i < trail.length - 1; i++) {
      const a = (i + 1) / trail.length;
      const t0 = this.cam.project(trail[i].x * this.cell, trail[i].y * this.cell);
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

  _drawHover(x, y, ok) {
    const q = this.cam.cellQuad(x, y, 2);
    const col = ok ? this.palette.spawn : this.palette.exit;
    this._fillQuad(q, ok ? "rgba(111,175,122,0.22)" : "rgba(196,90,74,0.22)");
    this._strokeQuad(q, withAlpha(col, 0.55), 1.5);
    const inner = this.cam.cellQuad(x, y, Math.max(4, this.cell * 0.14));
    this._strokeQuad(inner, withAlpha(col, 0.28), 1);
    // Soft corner ticks
    const ctx = this.ctx;
    ctx.strokeStyle = withAlpha(col, 0.7);
    ctx.lineWidth = 1.5;
    const L = Math.max(4, this.cell * 0.1);
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

  /** Armed place — pulse the cell and ghost the loadout; second tap confirms. */
  _drawPendingPlace(pending) {
    const { x, y } = pending;
    const t = performance.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 7.2);
    const accent = this.palette.accent || "#e8c56a";

    const pad = this.cam.cellQuad(x, y, 2);
    this._fillQuad(pad, `rgba(232, 197, 106, ${0.16 + pulse * 0.14})`);
    this._strokeQuad(pad, withAlpha(accent, 0.55 + pulse * 0.4), 2.4);
    this._strokeQuad(this.cam.cellQuad(x, y, 5), withAlpha(accent, 0.18 + pulse * 0.22), 1.2);

    if (pending.base && pending.barrel && pending.payload) {
      const ctx = this.ctx;
      const p = this.cam.projectCell(x, y);
      const s = this.cell * p.s * UNIT_SCALE;
      ctx.save();
      ctx.globalAlpha = 0.38 + pulse * 0.18;
      renderTower(
        ctx,
        this.palette,
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

  _drawAtmosphere(cssW, cssH) {
    const ctx = this.ctx;
    const t = performance.now() * 0.001;
    const atmo = this.palette.atmosphere || {};
    const fog = atmo.fog || this.palette.fog;
    const moteWarm = atmo.moteWarm || this.palette.accent;
    const moteCool = atmo.moteCool || "#9eb0c0";
    const bloomA = atmo.bloom ?? 0.35;

    if (this._themePulse > 0) this._themePulse = Math.max(0, this._themePulse - 0.035);
    const bossOnField = this.sim?.enemies?.some((e) => e.boss);
    this._bossVignette += ((bossOnField ? 1 : 0) - this._bossVignette) * 0.08;

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

    if (this._themePulse > 0) {
      ctx.fillStyle = withAlpha(atmo.pulse || moteWarm, this._themePulse * 0.12);
      ctx.fillRect(0, 0, cssW, cssH);
    }
    if (this._bossVignette > 0.05) {
      const bv = ctx.createRadialGradient(
        cssW * 0.5,
        cssH * 0.55,
        cssH * 0.2,
        cssW * 0.5,
        cssH * 0.55,
        cssH * 0.75
      );
      bv.addColorStop(0, "transparent");
      bv.addColorStop(1, `rgba(40, 8, 12, ${0.35 * this._bossVignette})`);
      ctx.fillStyle = bv;
      ctx.fillRect(0, 0, cssW, cssH);
    }

    const plate = this.sim ? this.cam.boardCorners() : null;
    if (plate) {
      const left = Math.min(plate[0].x, plate[3].x);
      const right = Math.max(plate[1].x, plate[2].x);
      const top = Math.min(plate[0].y, plate[1].y);
      const bot = Math.max(plate[2].y, plate[3].y);
      for (const m of this._motes) {
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
}
