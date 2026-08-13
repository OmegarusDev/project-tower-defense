/**
 * Unified faux-3D camera — one pitch drives trapezoid taper + depth squash.
 * Board local: x right, y down toward exit (spawn = far / top).
 *
 * Width tapers with depth; row spacing uses the integrated width-scale so far
 * cells read shorter than near ones (same model as the title backdrop).
 */

export const VIEW25 = {
  /**
   * Camera tilt from top-down, degrees (slider 8–58).
   * Low ≈ above / top-down; high ≈ flat / side-on (foreshortened board).
   * (Older comment said "0 = flat" meaning untilted top-down — opposite of UI language.)
   */
  pitchDeg: 24,
  /** How strongly pitch narrows the far edge (0–1). */
  trap: 0.42,
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
   * Grows with pitch so side-on reads taller stacks.
   */
  rise: 0.24,
  /**
   * Vertical exaggeration for tower/wall extrusions (not cell projection).
   * <1 squat when above; >1 taller when flat/side-on. Deck ellipse ry stays on deckRatio.
   */
  vExag: 1.09,
  /** Soft depth fog strength (0–1), rises with pitch. */
  depthFog: 0.22,
};

export function setPitch(deg) {
  VIEW25.pitchDeg = Math.max(8, Math.min(58, deg));
  syncCamera();
}

function syncCamera() {
  const p = (VIEW25.pitchDeg * Math.PI) / 180;
  const cos = Math.cos(p);
  const sin = Math.sin(p);
  // Depth factor D — ONE curve for the entire ground plane (board depth,
  // footprints, ground-line lengths). Mild stylization (cos^1.5) so receding
  // barrels read without the board changing character at default pitch; the
  // exponent is the single readability knob.
  const D = Math.max(0.42, Math.pow(cos, 1.5));
  VIEW25.yScale = D;
  VIEW25.deckRatio = D;
  VIEW25.farScale = Math.max(0.35, 1 - sin * VIEW25.trap);
  VIEW25.nearScale = 1;
  // Vertical factor V — ONE curve for every vertical dimension (heights AND
  // tube thicknesses). Side-on (high pitch): taller sprites; above: squat.
  VIEW25.vExag = 0.72 + 0.92 * sin;
  VIEW25.rise = 0.13 + 0.28 * sin;
  VIEW25.boxSkew = 0.1 + 0.14 * sin;
  VIEW25.shadowSkew = 0.012 + 0.05 * sin;
  VIEW25.depthFog = 0.12 + 0.38 * sin;
}

syncCamera();

export function deckRy(rx) {
  return rx * VIEW25.deckRatio;
}

/**
 * THE ground-plane basis — the only place a board angle becomes screen
 * vectors. Every ground-oriented drawing derives from this, so the
 * projection can never drift. Under the two-factor camera (D = depth,
 * V = vertical), a horizontal tube's silhouette is the parallelogram
 * between its top/bottom generators: length L·len, thickness 2r·V.
 *  - ax, ay = AIM vector per unit ground length (depth component × D)
 *  - px, py = normalized PERPENDICULAR (unit — offset direction)
 *  - len    = on-screen length factor of a ground segment at this angle
 *  - depth  = away-facing cue (aiming up the board)
 *  - D, V   = the two camera factors (ground / vertical)
 */
export function groundBasis(angle) {
  const D = VIEW25.yScale;
  const ax = Math.cos(angle);
  const ay = Math.sin(angle) * D;
  const pl = Math.hypot(Math.sin(angle), D * Math.cos(angle)) || 1;
  return {
    D,
    V: VIEW25.vExag,
    ax,
    ay,
    px: -Math.sin(angle) / pl,
    py: (D * Math.cos(angle)) / pl,
    len: Math.hypot(ax, ay),
    depth: Math.max(0, Math.min(1, -Math.sin(angle))),
  };
}

/**
 * Exact on-screen ellipse of a circle of radius r lying ACROSS a ground tube
 * (the plane spanned by the perpendicular and the vertical). Used for barrel
 * end-caps — the projected circle's semi-axes are the singular values of
 * [[px, 0],[py·D, V]]; this is the same two-factor camera, one formula.
 */
export function capEllipse(basis, r) {
  const a = basis.px * basis.px;
  const c = basis.px * basis.py * basis.D;
  const b = basis.py * basis.py * basis.D * basis.D + basis.V * basis.V;
  const tr = a + b;
  const disc = Math.sqrt(Math.max(0, (a - b) * (a - b) + 4 * c * c));
  const l1 = (tr + disc) / 2;
  const l2 = Math.max(1e-6, (tr - disc) / 2);
  return {
    rx: r * Math.sqrt(l1),
    ry: r * Math.sqrt(l2),
    rot: 0.5 * Math.atan2(2 * c, a - b),
  };
}

export function aimToDrawAngle(aimAngle) {
  return Number.isFinite(aimAngle) ? aimAngle : -Math.PI / 2;
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

  /** ∫₀ᵗ widthScale(s) ds — used so equal board rows foreshorten on screen. */
  _depthIntegral(t) {
    const a = VIEW25.farScale;
    const b = VIEW25.nearScale - VIEW25.farScale;
    const u = Math.max(0, Math.min(1, t));
    return a * u + (b * u * u) / 2;
  }

  /** Board depth fraction v ∈ [0,1] → screen depth fraction along the board. */
  depthScreenT(v) {
    const denom = this._depthIntegral(1);
    return denom > 1e-6 ? this._depthIntegral(v) / denom : v;
  }

  /** Inverse of depthScreenT. */
  depthBoardV(screenT) {
    const t = Math.max(0, Math.min(1, screenT));
    const a = VIEW25.farScale;
    const b = VIEW25.nearScale - VIEW25.farScale;
    const I1 = this._depthIntegral(1);
    const target = t * I1;
    if (Math.abs(b) < 1e-8) return I1 > 1e-6 ? target / a : t;
    // a·v + (b/2)·v² = target
    const disc = a * a + 2 * b * target;
    if (disc < 0) return 0;
    return Math.max(0, Math.min(1, (-a + Math.sqrt(disc)) / b));
  }

  /** Board-local (bx, by) → screen {x,y,s} where s is sprite scale. */
  project(bx, by) {
    const W = this.W;
    const H = this.H;
    const v = H > 0 ? by / H : 0;
    const ws = this.widthScaleAt(v);
    const u = W > 0 ? bx / W - 0.5 : 0;
    const screenH = H * VIEW25.yScale;
    return {
      x: this.originX + W * 0.5 + u * W * ws,
      y: this.originY + this.depthScreenT(v) * screenH,
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
    const screenH = this.H * VIEW25.yScale;
    const screenT = screenH > 1e-6 ? (sy - this.originY) / screenH : 0;
    const v = this.depthBoardV(screenT);
    const by = v * this.H;
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
