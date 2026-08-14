/**
 * The next BoardView — the oracle class (state, input, camera glide,
 * static-layer caching) with every _draw* method routed through the pure
 * boardScene renderers (view/next/boardScene.js). Golden/parity-verified
 * against the oracle BoardView; this file replaces boardView.js at the swap.
 */
import { buildAttackPlan, planOptsFromParts } from "../../sim/attackPlan.js";
import { XP_TO_POINT } from "../../data/parts.js";
import * as S from "./boardScene.js";
import { VIEW25, setPitch, BoardCamera } from "../view25.js";

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
    // Camera glide targets — inputs write here, draw() damps toward them.
    this._zoomT = 1;
    this._panXT = 0;
    this._panYT = 0;
    this._direct = false;
    this._zoomAnchor = null;
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
        // Ctrl / ⌘ + wheel → zoom about the cursor (desktop twin of pinch)
        if (e.ctrlKey || e.metaKey) {
          const factor = Math.exp(-e.deltaY * 0.0018);
          this.zoomAbout(this._zoomT * factor, e.clientX, e.clientY);
          return;
        }
        this._panYT = Math.max(this.panMin, Math.min(this.panMax, this._panYT - e.deltaY * 0.45));
        this._panXT = Math.max(this.panMinX, Math.min(this.panMaxX, this._panXT - e.deltaX * 0.45));
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
    this._panXT = this.panX = 0;
    this._panYT = this.panY = 0;
    this._zoomT = this.zoom = 1;
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
    this._panXT = this.panX = 0;
    this._panYT = this.panY = 0;
    this._zoomT = this.zoom = 1;
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
    this._panYT = this.panY = 0;
    this._panXT = this.panX = 0;
    this._zoomT = this.zoom = 1;
    this._zoomAnchor = null;
    this._handOffT = 0;
    this.invalidateStatic();
    if (this.sim) this._fit();
  }

  setZoom(z) {
    this._zoomT = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  }

  /** Zoom keeping the board point under (cx, cy) fixed (cursor/touch anchor). */
  zoomAbout(z, cx, cy) {
    if (!this.sim) return;
    this._zoomT = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    const b = this.cam.unproject(cx, cy);
    this._zoomAnchor = { cx, cy, bx: b.x, by: b.y };
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
    this._panYT = this.panY;
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

    this._direct = true;
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
      const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this._pinch.zoom0 * scale));
      // Two-finger scroll pans while pinching
      this._panXT = this.panX = this._pinch.panX0 + (mid.x - this._pinch.mid0.x);
      this._panYT = this.panY = this._pinch.panY0 + (mid.y - this._pinch.mid0.y);
      // Zoom anchored at the touch midpoint
      if (this._pinch.mid0) {
        const b = this.cam.unproject(this._pinch.mid0.x, this._pinch.mid0.y);
        this._zoomT = z;
        this._fit(true);
        const p = this.cam.project(b.x, b.y);
        this._panXT = this.panX = this.panX + (this._pinch.mid0.x - p.x);
        this._panYT = this.panY = this.panY + (this._pinch.mid0.y - p.y);
      } else {
        this._zoomT = z;
      }
      this._fit(true);
      return;
    }

    this.hover = this._cellAt(e.clientX, e.clientY);
    const d = this._drag;
    if (!d || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y0;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.hypot(dx, dy) > 8) {
      d.moved = true;
      // A drag means "look around" — drop any tower currently in hand.
      if (this.onPanStart) this.onPanStart();
    }
    if (d.moved) {
      this._panYT = this.panY = Math.max(this.panMin, Math.min(this.panMax, d.panY0 + dy));
      this._panXT = this.panX = Math.max(this.panMinX, Math.min(this.panMaxX, d.panX0 + dx));
      this._fit(true);
    }
  }

  _onPointerUp(e) {
    if (!this.sim) return;
    this._pointers.delete(e.pointerId);
    if (this._pointers.size === 0) this._direct = false;
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

  /** Damped camera glide: inputs write targets; draw() eases toward them. */
  _stepCamera(dt) {
    if (!this.sim) return;
    if (this._direct) {
      this.panX = this._panXT;
      this.panY = this._panYT;
      this.zoom = this._zoomT;
      return;
    }
    const pk = 1 - Math.exp(-16 * dt);
    const zk = 1 - Math.exp(-9 * dt);
    this.panX += (this._panXT - this.panX) * pk;
    this.panY += (this._panYT - this.panY) * pk;
    this.zoom += (this._zoomT - this.zoom) * zk;
    // Keep the zoom anchor under the cursor while the glide settles
    const a = this._zoomAnchor;
    if (a && Math.abs(this._zoomT - this.zoom) > 0.0005) {
      const p = this.cam.project(a.bx, a.by);
      const dx = a.cx - p.x;
      const dy = a.cy - p.y;
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        this.panX += dx;
        this.panY += dy;
        this._panXT += dx;
        this._panYT += dy;
      }
    } else {
      this._zoomAnchor = null;
    }
  }

  draw(dt = 0.016) {
    if (!this.sim) return;
    this._stepCamera(dt);
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

  // ---- drawing (all routed through the pure boardScene renderers) ----

  _drawBoardShadow() {
    S.drawBoardShadow(this.ctx, this.cam, this.palette, this.cell);
  }

  _drawField(g) {
    S.drawField(this.ctx, this.cam, this.palette, g, this.cell);
  }

  _drawWall(x, y) {
    S.drawWall(this.ctx, this.cam, this.palette, x, y, this.cell);
  }

  _drawStains() {
    S.drawStains(this.ctx, this.cam, this.palette, this._stains, this.cell);
  }

  _drawBastion(g) {
    const t = performance.now() * 0.001;
    S.drawBastion(this.ctx, this.cam, this.palette, g, this.cell, t, this._bastionFlinch);
  }

  _pathPoints(g) {
    // Flow preview starts at the live seam — the portal's current cell.
    // Cached: the path only changes when the grid changes or the portal moves.
    const portalX = this.sim?.portal?.x ?? g.spawn.x;
    if (this._pathRev === g.revision && this._pathPortalX === portalX && this._pathPts) {
      return this._pathPts;
    }
    const start = { x: portalX, y: 0 };
    const pts = [this.cam.projectCell(start.x, start.y)];
    let cell = { x: start.x, y: start.y };
    for (let i = 0; i < 120; i++) {
      const next = g.nextGround(cell.x, cell.y);
      if (next.x === cell.x && next.y === cell.y) break;
      pts.push(this.cam.projectCell(next.x, next.y));
      if (g.isExit(next.x, next.y)) break;
      cell = next;
    }
    this._pathRev = g.revision;
    this._pathPortalX = portalX;
    this._pathPts = pts;
    return pts;
  }

  _drawPath(g) {
    const portalX = this.sim?.portal?.x ?? g.spawn.x;
    const t = performance.now() * 0.001;
    S.drawPath(this.ctx, this.cam, g, portalX, this.cell, t, this.sim?.enemies?.length || 0);
  }

  _drawPortal(g) {
    const p = this.sim?.portal || g.spawn;
    if (this._prevPortalX !== p.x) {
      // Seam re-opened: puff at the new cell (and mark the old one closing)
      this._prevPortalX = p.x;
      if (this.fx) {
        for (let i = 0; i < 6; i++) this.fx.portalMote(p.x + 0.5, p.y + 0.5);
      }
    }
    const t = performance.now() * 0.001;
    S.drawPortal(this.ctx, this.cam, this.palette, p, this.cell, t);
  }

  _emitPortalFx(g) {
    if (!this.fx) return;
    this._portalAcc += 1;
    if (this._portalAcc % 8 !== 0) return;
    const p = this.sim?.portal || g.spawn;
    this.fx.portalMote(p.x + 0.5, p.y + 0.5);
  }

  _drawTower(t) {
    const p = this.cam.projectCell(t.cell.x, t.cell.y);
    const s = this.cell * p.s * UNIT_SCALE;
    const recoil = this.recoil.get(t.id) || 0;
    const kick = recoil > 0 ? Math.cos(t.aimAngle || 0) * recoil * 10 * p.s : 0;
    const kickY = recoil > 0 ? Math.sin(t.aimAngle || 0) * recoil * 10 * p.s : 0;
    const px = p.x - s / 2 - kick;
    const py = p.y - s / 2 - kickY;
    const selected = t.id === this.selectedTowerId;
    let plan = null;
    if (selected) {
      const up = this.sim.partUpgrades || {};
      const g = this.sim.globalMods || {};
      plan = buildAttackPlan(
        t.base,
        t.barrel,
        t.payload,
        t.level,
        planOptsFromParts(up, g, t)
      );
    }
    S.drawTowerFrame(this.ctx, this.cam, this.palette, t, px, py, s, {
      selected,
      plan,
      cell: this.cell,
    });
  }

  _drawEnemy(e) {
    const t = performance.now() * 0.001;
    S.drawEnemyFrame(this.ctx, this.cam, this.palette, e, this.cell, t);
  }

  _drawProjectile(p) {
    S.drawProjectile(this.ctx, this.cam, this.palette, p, this.cell);
  }

  _drawHover(x, y, ok) {
    S.drawHover(this.ctx, this.cam, this.palette, x, y, ok, this.cell);
  }

  _drawPlanGhost(plan, cell) {
    S.drawPlanGhost(this.ctx, this.cam, this.palette, plan, cell, this.cell);
  }

  _drawPendingPlace(pending) {
    const t = performance.now() / 1000;
    S.drawPendingPlace(this.ctx, this.cam, this.palette, pending, this.cell, t, this.cell);
  }

  _drawAtmosphere(cssW, cssH) {
    const t = performance.now() * 0.001;
    if (this._themePulse > 0) this._themePulse = Math.max(0, this._themePulse - 0.035);
    const bossOnField = this.sim?.enemies?.some((e) => e.boss);
    this._bossVignette += ((bossOnField ? 1 : 0) - this._bossVignette) * 0.08;
    S.drawAtmosphere(this.ctx, this.palette, cssW, cssH, t, this._motes, {
      themePulse: this._themePulse,
      bossVignette: this._bossVignette,
      plate: this.cam.boardCorners(),
    });
  }

  cellScreenCenter(x, y) {
    const p = this.cam.projectCell(x, y);
    return { x: p.x, y: p.y };
  }
}
