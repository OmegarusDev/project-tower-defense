/**
 * BoardView — canvas host: sim binding, pointer/zoom/pitch input, camera
 * glide, static-layer caching, painter's-order draw over the pure
 * boardScene renderers (view/next/boardScene.js). Pixel gates:
 * renderParity.mjs + boardParity.mjs.
 */
import { buildAttackPlan, planOptsFromParts } from "../../sim/attackPlan.js";
import { XP_TO_POINT } from "../../data/parts.js";
import * as S from "./boardScene.js";
import { PortalAnimator } from "./boardScene.js";
import { VIEW25, setPitch, BoardCamera } from "../view25.js";
import { renderTowerNext } from "./renderTower.js";

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
    this._handGhost = null;
    this._hasHandTower = false;
    this._wallPreview = null;
    this.recoil = new Map();
    // Per-frame scratch buffers (painter's-order sorts) + cached DPR.
    this._scratchTowers = [];
    this._scratchEnemies = [];
    this._dprCache = null;
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
    this.portalAnimator = null;

    canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    canvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
    canvas.addEventListener("pointerup", (e) => this._onPointerUp(e));
    canvas.addEventListener("pointercancel", (e) => this._onPointerUp(e));
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (!this.sim) return;
        e.preventDefault();
        // ⌘ / Ctrl + wheel → zoom about grid center
        if (e.ctrlKey || e.metaKey) {
          const factor = Math.exp(-e.deltaY * 0.0018);
          this.zoomAtGridCenter(this._zoomT * factor);
          return;
        }
        // Shift + wheel → pan (horizontal + vertical)
        if (e.shiftKey) {
          this._panYT = Math.max(this.panMin, Math.min(this.panMax, this._panYT - e.deltaY * 0.45));
          this._panXT = Math.max(this.panMinX, Math.min(this.panMaxX, this._panXT - e.deltaX * 0.45));
          return;
        }
        // Plain wheel → camera pitch
        if (this.onPitchChange) {
          const cur = VIEW25.pitchDeg;
          this.onPitchChange(cur + e.deltaY * 0.09);
        }
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

  /** DPR cap — cached; the UA regex ran twice per frame before. */
  _resolveDpr() {
    if (this._dprCache == null) {
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      this._dprCache = Math.min(isMobile ? 1.5 : 2, window.devicePixelRatio || 1);
    }
    return this._dprCache;
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

  setHandGhost(loadout, screenX, screenY, cell) {
    if (loadout && screenX != null && screenY != null) {
      this._handGhost = { loadout, x: screenX, y: screenY, cell };
      this._hasHandTower = true;
    } else {
      this._handGhost = null;
      this._hasHandTower = false;
    }
  }

  setHasHandTower(has) {
    this._hasHandTower = has;
  }

  setWallPreview(cell, cost, canAfford) {
    if (cell && this.sim && this.sim.grid.inBounds(cell.x, cell.y)) {
      this._wallPreview = { x: cell.x, y: cell.y, cost, canAfford };
    } else {
      this._wallPreview = null;
    }
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

  /** Zoom keeping the grid center fixed. */
  zoomAtGridCenter(z) {
    if (!this.sim) return;
    this._zoomT = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    const g = this.sim.grid;
    const gridCenterX = (g.cols - 1) * 0.5;
    const gridCenterY = (g.rows - 1) * 0.5;
    const p = this.cam.project(gridCenterX, gridCenterY);
    this._zoomAnchor = { cx: p.x, cy: p.y, bx: gridCenterX, by: gridCenterY };
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
    const dpr = this._resolveDpr();
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

    // Layout key: pitch/cell/grid/walls determine the static field geometry.
    // Pan is intentionally EXCLUDED — panning becomes a draw-time translate of
    // the cached board, so gliding no longer re-projects every tile each frame.
    // Zoom is implicit via `cell` (baseCell * zoom) and sy (pitch).
    const layoutKey = [
      cssW | 0,
      cssH | 0,
      dpr.toFixed(2),
      this.cell.toFixed(2),
      g.cols,
      g.rows,
      VIEW25.pitchDeg | 0,
      this.sim.walls.length,
    ].join("|");
    const canvasW = Math.floor(cssW * dpr);
    const canvasH = Math.floor(cssH * dpr);
    const resized = this.canvas.width !== canvasW || this.canvas.height !== canvasH;
    const layoutChanged = layoutKey !== this._fitKey;
    this._fitKey = layoutKey;
    if (resized) {
      this.canvas.width = canvasW;
      this.canvas.height = canvasH;
      this.invalidateStatic();
    } else if (force || layoutChanged) {
      this.invalidateStatic();
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Cache layout for the static board layer (pan-independent).
    this._boardW = boardW;
    this._boardH = boardH;
    this._topPad = topPad;
    this._leftPad = leftPad;

    this.origin = { x: this.panX, y: topPad + this.panY };
    this.cam.configure(this.origin.x, this.origin.y, this.cell, g.cols, g.rows);
    return layoutChanged || resized;
  }

  _cellAt(canvasX, canvasY) {
    // Callers pass _toCanvas output (canvas-relative CSS px). Subtracting
    // rect here too double-converted and shifted every tap left by the
    // canvas's page offset (invisible at rect.left=0, broken when centered).
    return this.cam.cellAtScreen(canvasX, canvasY);
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
    // Anchor zoom at grid center (board coordinates)
    const g = this.sim.grid;
    const gridCenterX = (g.cols - 1) * 0.5;
    const gridCenterY = (g.rows - 1) * 0.5;
    const anchorBoard = { x: gridCenterX, y: gridCenterY };
    this._pinch = {
      dist0: dist,
      zoom0: this.zoom,
      mid0: mid,
      panX0: this.panX,
      panY0: this.panY,
      pitch0: VIEW25.pitchDeg,
      pitchLocked: false,
      anchorBoard,
    };
    this._drag = null;
  }

  /** Convert page coordinates to canvas-relative coordinates. */
  _toCanvas(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: x - rect.left, y: y - rect.top };
  }

  _onPointerDown(e) {
    if (!this.sim) return;
    const { x, y } = this._toCanvas(e.clientX, e.clientY);
    this._pointers.set(e.pointerId, { x, y });
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
      x0: x,
      y0: y,
      panX0: this.panX,
      panY0: this.panY,
      moved: false,
    };
    this.hover = this._cellAt(x, y);
  }

  _onPointerMove(e) {
    if (!this.sim) return;
    const { x, y } = this._toCanvas(e.clientX, e.clientY);
    if (this._pointers.has(e.pointerId)) {
      this._pointers.set(e.pointerId, { x, y });
    }

    if (this._pinch && this._pointers.size >= 2) {
      const mid = this._pointerMid();
      const dist = this._pointerDist();
      if (!mid || dist < 6) return;

      const scale = dist / this._pinch.dist0;
      const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this._pinch.zoom0 * scale));
      const midDx = mid.x - this._pinch.mid0.x;
      const midDy = mid.y - this._pinch.mid0.y;

      // Zoom anchored at stored board point — keeps that board point fixed under initial midpoint
      this._zoomT = z;
      this._fit(true);
      const p = this.cam.project(this._pinch.anchorBoard.x, this._pinch.anchorBoard.y);
      this._panXT = this._pinch.panX0 + (this._pinch.mid0.x - p.x);
      this._panYT = this._pinch.panY0 + (this._pinch.mid0.y - p.y);

      // Additional pan from midpoint movement (two-finger drag while pinching)
      this._panXT = Math.max(this.panMinX, Math.min(this.panMaxX, this._panXT + midDx));
      this._panYT = Math.max(this.panMin, Math.min(this.panMax, this._panYT + midDy));
      this.panX = this._panXT;
      this.panY = this._panYT;

      // Pitch only when zoom is stable (small distance change) — deadzone on scale
      const scaleDelta = Math.abs(scale - 1);
      if (scaleDelta < 0.03 && this.onPitchChange) {
        this.onPitchChange(this._pinch.pitch0 - midDy * 0.25);
      }

      this._fit(true);
      return;
    }

    this.hover = this._cellAt(x, y);
    const d = this._drag;
    if (!d || e.pointerId !== d.id) return;
    const dy = y - d.y0;
    const dx = x - d.x0;
    if (!d.moved && Math.hypot(dx, dy) > 6) {
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
    const { x, y } = this._toCanvas(e.clientX, e.clientY);
    const c = this._cellAt(x, y);
    // Click off-grid clears hand
    if (!this.sim.grid.inBounds(c.x, c.y)) {
      if (this._handSlot != null && this.onPanStart) this.onPanStart();
      return;
    }
    if (this.onTap) this.onTap(c);
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

  draw(dt = 0.016, portalAnimator = null) {
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
    const dpr = this._resolveDpr();
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

    this._ensureStaticLayer();
    if (this._staticLayer) {
      // Pan is a translate of the cached board — no re-projection.
      const bw = this._boardW || 0;
      const bh = this._boardH || 0;
      if (bw > 0 && bh > 0) {
        ctx.drawImage(
          this._staticLayer,
          0, 0, Math.floor(bw * dpr), Math.floor(bh * dpr),
          this.origin.x, this.origin.y, bw, bh
        );
      }
    } else {
      this._drawBoardShadow();
      this._drawField(g);
      for (const w of this.sim.walls) this._drawWall(w.cell.x, w.cell.y);
    }

    this._drawStains();
    this._drawBastion(g);
    this._drawPath(g, dt);
    this._drawPortal(g, this.portalAnimator);
    this._emitPortalFx(g);

    // Painter's-order sort without per-frame array allocation — scratch
    // buffers are reused; Array#sort runs in place on them.
    const towers = this._scratchTowers;
    towers.length = 0;
    for (const t of this.sim.towers) towers.push(t);
    towers.sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x);
    for (const t of towers) this._drawTower(t);
    const enemies = this._scratchEnemies;
    enemies.length = 0;
    for (const e of this.sim.enemies) enemies.push(e);
    enemies.sort((a, b) => a.pos.y - b.pos.y);
    for (const e of enemies) this._drawEnemy(e);
    for (const p of this.sim.projectiles) this._drawProjectile(p);

    if (this.fx) {
      this.fx.drawProjected(ctx, this.cam, (type) => this.palette.dmg(type));
    }

    if (this._ghostPlan) this._drawPlanGhost(this._ghostPlan.plan, this._ghostPlan.cell);
    if (this.pendingPlace && g.inBounds(this.pendingPlace.x, this.pendingPlace.y)) {
      this._drawPendingPlace(this.pendingPlace);
    } else if (this.hover && g.inBounds(this.hover.x, this.hover.y) && this.selectedTowerId < 0 && !this._hasHandTower) {
      this._drawHover(this.hover.x, this.hover.y, g.isBuildable(this.hover.x, this.hover.y));
    }
    if (this._handGhost) this._drawHandGhost(this._handGhost);
    if (this._wallPreview) this._drawWallPreview(this._wallPreview);

    ctx.restore();
    this._drawAtmosphere(cssW, cssH);
  }

  _ensureStaticLayer() {
    if (!this._staticDirty && this._staticLayer) return;
    if (!this._staticLayer) this._staticLayer = document.createElement("canvas");
    const layer = this._staticLayer;
    const bw = this._boardW || 0;
    const bh = this._boardH || 0;
    const dpr = this._resolveDpr();
    const w = Math.max(1, Math.floor(bw * dpr));
    const h = Math.max(1, Math.floor(bh * dpr));
    if (layer.width !== w || layer.height !== h) {
      layer.width = w;
      layer.height = h;
    }
    const lctx = layer.getContext("2d");
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, bw, bh);
    const prevCtx = this.ctx;
    const prevOrigin = this.origin;
    const prevCamOriginX = this.cam.originX;
    const prevCamOriginY = this.cam.originY;
    // Render the board at a neutral origin (0,0) — pan is applied at draw time.
    this.ctx = lctx;
    this.origin = { x: 0, y: 0 };
    this.cam.configure(0, 0, this.cell, this.sim.grid.cols, this.sim.grid.rows);
    const g = this.sim.grid;
    this._drawBoardShadow();
    this._drawField(g);
    for (const wall of this.sim.walls) this._drawWall(wall.cell.x, wall.cell.y);
    this.ctx = prevCtx;
    // Restore the live camera for everything else (stains/bastion/path/towers).
    this.origin = prevOrigin;
    this.cam.configure(prevCamOriginX, prevCamOriginY, this.cell, g.cols, g.rows);
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

  _drawPath(g, dt = 1 / 60) {
    const portalX = this.sim?.portal?.x ?? g.spawn.x;
    const t = performance.now() * 0.001;

    // Trunk hand-off: when the seam migrates (or walls reroute the flow),
    // keep the previous trunk on screen briefly, fading out while the new
    // one fades in — coverage moves read as a transition, not a teleport.
    const key = `${g.revision | 0}:${portalX}`;
    if (this._trunkKey !== key) {
      const prevPts = this._lastTrunkPts;
      if (prevPts && prevPts.length > 1) {
        this._ghostTrunk = { pts: prevPts, age: 0 };
      }
      this._trunkKey = key;
      this._lastTrunkPts = null;
    }
    if (this._ghostTrunk) {
      this._ghostTrunk.age += dt;
      const a = 1 - this._ghostTrunk.age / 0.9;
      if (a <= 0 || this._ghostTrunk.pts.length < 2) {
        this._ghostTrunk = null;
      } else {
        const c = this.cell;
        this.ctx.save();
        this.ctx.globalAlpha = Math.max(0, a) * 0.5;
        this.ctx.lineCap = "round";
        this.ctx.lineJoin = "round";
        S.strokePathLayers(this.ctx, this._ghostTrunk.pts, {
          w: Math.max(4, c * 0.28),
          travel: -t * c,
          pressure: 0,
          warm: 0,
          cell: c,
        });
        this.ctx.setLineDash([]);
        this.ctx.restore();
      }
    }

    // Current trunk: project cached cells, remember points for the next
    // hand-off before drawing (drawPath owns its own stroke styling).
    const { trunkCells } = S.flowCellPaths(g, portalX, { maxPaths: 1 });
    this._lastTrunkPts = trunkCells.map((c) => this.cam.projectCell(c.x, c.y));
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

  _drawHandGhost(ghost) {
    const { loadout, x, y, cell } = ghost;
    if (!loadout?.complete) return;
    const s = this.cell * UNIT_SCALE;
    const px = x - s / 2;
    const py = y - s / 2;
    // Create a mock tower object for rendering
    const mockTower = {
      base: loadout.base,
      barrel: loadout.barrel,
      payload: loadout.payload,
      level: loadout.level || 1,
      aimAngle: -Math.PI / 2,
      xp: 0,
      xpToPoint: 1,
      levelCap: loadout.levelCap || 1,
    };
    renderTowerNext(this.ctx, this.palette, mockTower, px, py, s, { selected: false });
    // Range ring — projected through camera from board space
    const up = this.sim?.partUpgrades || {};
    const g = this.sim?.globalMods || {};
    const plan = buildAttackPlan(
      loadout.base,
      loadout.barrel,
      loadout.payload,
      loadout.level || 1,
      planOptsFromParts(up, g, loadout)
    );
    if (plan && plan.rangeCells && cell) {
      const cx = cell.x + 0.5;
      const cy = cell.y + 0.5;
      const r = plan.rangeCells * this.cell;
      const steps = 48;
      this.ctx.strokeStyle = "rgba(232,197,106,0.35)";
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const wx = cx * this.cell + Math.cos(a) * r;
        const wy = cy * this.cell + Math.sin(a) * r;
        const sp = this.cam.project(wx, wy);
        if (i === 0) this.ctx.moveTo(sp.x, sp.y);
        else this.ctx.lineTo(sp.x, sp.y);
      }
      this.ctx.stroke();
      this.ctx.lineWidth = 1;
    }
  }

  _drawWallPreview(preview) {
    const { x, y, canAfford } = preview;
    const q = this.cam.cellQuad(x, y, 2);
    const col = canAfford ? this.palette.spawn : this.palette.exit;
    // Qualified: bare names here threw ReferenceError mid-frame, killing the
    // rAF loop (sim freeze) whenever the wall preview rendered.
    S.fillQuad(this.ctx, q, canAfford ? "rgba(111,175,122,0.35)" : "rgba(196,90,74,0.35)");
    S.strokeQuad(this.ctx, q, col, 2);
    // Cost label
    const cx = (q[0].x + q[2].x) / 2;
    const cy = (q[0].y + q[2].y) / 2;
    this.ctx.fillStyle = canAfford ? "#e8c56a" : "#e86a6a";
    this.ctx.font = `600 ${Math.max(10, this.cell * 0.18)}px "Chakra Petch", sans-serif`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(`${preview.cost}₡`, cx, cy - this.cell * 0.15);
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
