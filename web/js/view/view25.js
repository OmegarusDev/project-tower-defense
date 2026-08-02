/**
 * Unified faux-3D camera — one pitch drives trapezoid taper + depth squash.
 * Board local: x right, y down toward exit (spawn = far / top).
 */

export const VIEW25 = {
  /** Camera tilt from top-down, degrees. 0 = flat, ~50 = steep. Slider-ready. */
  pitchDeg: 24,
  /** How strongly pitch narrows the far edge (0–1). */
  trap: 0.4,
  /** Derived — refreshed by setPitch / syncCamera. */
  yScale: 0.79,
  farScale: 0.62,
  nearScale: 1,
  deckRatio: 0.79,
  shadowSkew: 0.02,
  boxSkew: 0.14,
  /**
   * Turret mount lift above cell center (× sprite size).
   * Base pad stays on the cell; barrel hub sits this far above it.
   */
  rise: 0.22,
};

export function setPitch(deg) {
  VIEW25.pitchDeg = Math.max(8, Math.min(58, deg));
  syncCamera();
}

export function syncCamera() {
  const p = (VIEW25.pitchDeg * Math.PI) / 180;
  const cos = Math.cos(p);
  const sin = Math.sin(p);
  VIEW25.yScale = Math.max(0.42, cos);
  VIEW25.deckRatio = Math.max(0.42, cos);
  VIEW25.farScale = Math.max(0.35, 1 - sin * VIEW25.trap);
  VIEW25.nearScale = 1;
  // More pitch → deck ellipses read taller; keep the hub a bit higher
  VIEW25.rise = 0.18 + 0.12 * sin;
}

syncCamera();

export function deckRy(rx) {
  return rx * VIEW25.deckRatio;
}

export function aimToDrawAngle(aimAngle) {
  return Number.isFinite(aimAngle) ? aimAngle : -Math.PI / 2;
}

export function boardScreenHeight(rows, cell) {
  return rows * cell * VIEW25.yScale;
}

/**
 * Perspective projector for a board of size (cols, rows) and cell size.
 * Call configure() after fit; then project / unproject / cellAt.
 */
export class BoardCamera {
  constructor() {
    this.originX = 0;
    this.originY = 0;
    this.cell = 40;
    this.cols = 11;
    this.rows = 14;
    this.W = 440;
    this.H = 560;
  }

  configure(originX, originY, cell, cols, rows) {
    this.originX = originX;
    this.originY = originY;
    this.cell = cell;
    this.cols = cols;
    this.rows = rows;
    this.W = cols * cell;
    this.H = rows * cell;
  }

  widthScaleAt(v) {
    const t = Math.max(0, Math.min(1, v));
    return VIEW25.farScale + (VIEW25.nearScale - VIEW25.farScale) * t;
  }

  /** Board-local (bx, by) → screen {x,y,s} where s is sprite scale. */
  project(bx, by) {
    const W = this.W;
    const H = this.H;
    const v = H > 0 ? by / H : 0;
    const ws = this.widthScaleAt(v);
    const u = W > 0 ? bx / W - 0.5 : 0;
    return {
      x: this.originX + W * 0.5 + u * W * ws,
      y: this.originY + by * VIEW25.yScale,
      s: ws,
      v,
    };
  }

  projectCell(cx, cy, ox = 0.5, oy = 0.5) {
    return this.project((cx + ox) * this.cell, (cy + oy) * this.cell);
  }

  /** Four corners of a cell as screen points (TL, TR, BR, BL). */
  cellQuad(cx, cy, inset = 0) {
    const c = this.cell;
    const x0 = cx * c + inset;
    const y0 = cy * c + inset;
    const x1 = (cx + 1) * c - inset;
    const y1 = (cy + 1) * c - inset;
    return [this.project(x0, y0), this.project(x1, y0), this.project(x1, y1), this.project(x0, y1)];
  }

  boardCorners() {
    const W = this.W;
    const H = this.H;
    return [this.project(0, 0), this.project(W, 0), this.project(W, H), this.project(0, H)];
  }

  /** Screen → board-local. */
  unproject(sx, sy) {
    const by = (sy - this.originY) / VIEW25.yScale;
    const v = this.H > 0 ? by / this.H : 0;
    const ws = this.widthScaleAt(v);
    const u = ws > 1e-6 ? (sx - (this.originX + this.W * 0.5)) / (this.W * ws) : 0;
    const bx = (u + 0.5) * this.W;
    return { x: bx, y: by };
  }

  cellAtScreen(sx, sy) {
    const p = this.unproject(sx, sy);
    return {
      x: Math.floor(p.x / this.cell),
      y: Math.floor(p.y / this.cell),
    };
  }

  screenHeight() {
    return this.H * VIEW25.yScale;
  }
}
