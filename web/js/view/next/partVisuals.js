/**
 * Part visuals — the data-driven render language. Every part declares its
 * look as primitives; renderTower.js instantiates them over the unified
 * two-factor basis. Adding a part = adding data, never painter code.
 *
 * Conventions (matching the oracle painter EXACTLY):
 *  - base positions: y = the vz factor above the deck line (deckY - vz(s, y))
 *  - x = fraction of the part scale s (× s), centered at cx
 *  - colors name material slots resolved from matsFrom(palette color):
 *    top / side / sideDark / sideDeep / rim / accent / topHi
 *  - barrels: tube { len, th, off, sub } — len/th/off in part-scale units,
 *    off along the unit perpendicular, sub in radians (scatter); extras are
 *    housing/dish/nose primitives
 */

export const BASE_VISUALS = {
  sentry: [
    ["cyl", { x: 0, y: -0.02, rx: 0.31, rise: 0.055, top: "sideDark", side: "sideDeep", bottom: "rim" }],
    ["cyl", { x: 0, y: 0.08, rx: 0.25, rise: 0.12, top: "top", side: "side", bottom: "sideDark", roundedBottom: true }],
    ["vents", { xs: [-0.16, 0.16], y0: 0.04, y1: 0.12, color: "sideDeep", w: 0.02 }],
    ["ring", { y: 0.1, rx: 0.22, color: "rim", alpha: 0.55 }],
    ["cyl", { x: 0, y: 0.14, rx: 0.16, rise: 0.06, top: "topHi", side: "accent", bottom: "sideDark" }],
    ["ellipseStroke", { y: 0.14, rx: 0.14, color: "topHi", alpha: 0.55 }],
    ["rivets", { y: 0.14, rx: 0.12, n: 6, color: "rim" }],
  ],
  bulwark: [
    ["box", { y: 0.12, w: 0.58, d: 0.3, h: 0.12, top: "top", side: "side", dark: "sideDark" }],
    ["stroke", { x0: -0.203, x1: 0.203, y: 0.02, color: "rim", alpha: 0.55, lw: 1.2 }],
    ["box", { y: 0.18, w: 0.4176, d: 0.216, h: 0.06, top: "topHi", side: "accent", dark: "sideDark" }],
    [
      "rivetDots",
      {
        y: 0.18,
        r: 0.024,
        pts: [
          [-0.1276, -0.036],
          [0.1276, -0.036],
          [-0.1276, 0.024],
          [0.1276, 0.024],
          [0, -0.006],
        ],
        color: "rim",
      },
    ],
  ],
  spire: [
    ["cyl", { x: 0, y: 0.02, rx: 0.29, rise: 0.045, top: "sideDark", side: "sideDeep", bottom: "rim" }],
    ["rivets", { y: 0.02, rx: 0.22, n: 8, color: "rim" }],
    ["frustum", { y: 0.14, rxBot: 0.22, rxTop: 0.13, rise: 0.12, top: "top", side: "side", dark: "sideDark" }],
    ["ring", { y: 0.16, rx: 0.15, color: "accent", alpha: 0.65 }],
    ["cyl", { x: 0, y: 0.22, rx: 0.1, rise: 0.1, top: "topHi", side: "side", bottom: "sideDark", roundedBottom: true }],
    ["cyl", { x: 0, y: 0.28, rx: 0.13, rise: 0.04, top: "top", side: "accent", bottom: "sideDark", roundedBottom: true }],
    ["ellipseFill", { x: -0.03, y: 0.3, rx: 0.04, ryFactor: 0.03, rot: -0.4, color: "topHi", alpha: 0.55 }],
  ],
  aerie: [
    ["legs", { angles: [-0.9, 0.9, 3.14], r: 0.18, dr: 0.02, rx: 0.06, rise: 0.04, top: "side", side: "sideDark", bottom: "rim" }],
    ["struts", { angles: [-0.9, 0.9, 3.14], r: 0.16, r0: 0.05, yTop: 0.08, color: "sideDark", rim: "rim", alpha: 0.4 }],
    ["cyl", { x: 0, y: 0.1, rx: 0.24, rise: 0.07, top: "top", side: "side", bottom: "sideDark", roundedBottom: true }],
    ["ring", { y: 0.1, rx: 0.2, color: "accent", alpha: 0.45 }],
    ["ellipseFill", { x: 0, y: 0.1, rx: 0.14, ryFactor: 0.14, color: "sideDeep" }],
    ["ellipseFill", { x: 0, y: 0.12, rx: 0.11, ryFactor: 0.11, color: "topHi" }],
    ["rivets", { y: 0.12, rx: 0.08, n: 5, color: "rim" }],
  ],
  warden: [
    ["box", { y: 0.1, w: 0.48, d: 0.28, h: 0.11, top: "top", side: "side", dark: "sideDark" }],
    ["roundRectFill", { x0: -0.0852, y: 0.08, w: 0.036, h: 0.05, r: 1, color: "sideDeep", alpha: 0.85 }],
    ["roundRectFill", { x0: 0.0492, y: 0.08, w: 0.036, h: 0.05, r: 1, color: "sideDeep", alpha: 0.85 }],
    ["roof", { y: 0.14, h: 0.11, hw: 0.192, lip: 0.04, fillRight: "sideDark", fillLeft: "side", ridge: "topHi", tip: "accent", tipAlpha: 0.7 }],
    ["roundRectFill", { x0: -0.05, y: 0.02, w: 0.1, h: 0.07, r: 2, color: "sideDeep", stroke: "rim", strokeAlpha: 0.5 }],
  ],
  talon: [
    ["cyl", { x: 0, y: 0.02, rx: 0.27, rise: 0.045, top: "sideDark", side: "sideDeep", bottom: "rim" }],
    ["rivets", { y: 0.02, rx: 0.2, n: 6, color: "rim" }],
    ["diamond", { y: 0.12, rx: 0.24, rise: 0.12, top: "top", side: "side", dark: "sideDark" }],
    ["claws", { y: 0.12, angles: [-0.7, 0.7, 2.4, -2.4], r0: 0.06, r1: 0.2, dy0: 0.04, dy1: 0.1, color: "accent", alpha: 0.55, lw: 1.2 }],
    ["diamond", { y: 0.18, rx: 0.13, rise: 0.06, top: "topHi", side: "accent", dark: "sideDark" }],
  ],
};

export const BARREL_VISUALS = {
  single: { tubes: [{ len: 0.46, th: 0.11 }], extras: [] },
  twin: { 
    tubes: [
      { len: 0.43, th: 0.095, off: 0.0575 }, 
      { len: 0.43, th: 0.095, off: -0.0575 }
    ], 
    extras: [
      ["housing", { t0: 0, t1: 0.22, w: 0.14, shade: -0.2, dy: 0 }],
    ]
  },
  scatter: {
    tubes: [{ len: 0.34, th: 0.095, sub: -0.34 }, { len: 0.34, th: 0.095 }, { len: 0.34, th: 0.095, sub: 0.34 }],
    extras: [],
  },
  rail: {
    tubes: [{ len: 0.58, th: 0.1 }],
    extras: [
      ["housing", { t0: 0, t1: 0.24, w: 0.12, shade: -0.25, dy: 0 }],
      ["housing", { t0: 0, t1: 0.24, w: 0.12, shade: -0.05, dy: -0.02 }],
      ["housing", { t0: 0.03, t1: 0.2, w: 0.09, shade: 0.12, dy: -0.04 }],
    ],
  },
  pulse: {
    tubes: [],
    extras: [
      ["dish", { d: 0.12, r: 0.22, tip: true }],
      ["gem", { d: 0.24, size: 0.08 }],
    ],
  },
  launcher: {
    tubes: [{ len: 0.34, th: 0.2, noGem: true }],
    extras: [["nose", { len: 0.34, th: 0.2 }]],
  },
  flak: {
    tubes: [
      { len: 0.32, th: 0.06, off: -0.12 },
      { len: 0.32, th: 0.06, off: -0.04 },
      { len: 0.32, th: 0.06, off: 0.04 },
      { len: 0.32, th: 0.06, off: 0.12 },
    ],
    extras: [["housing", { t0: 0, t1: 0.2, w: 0.1, shade: -0.15, dy: 0 }]],
  },
};

/** Payload tip visuals — drawn at the muzzle in the rotated aim frame. */
export const PAYLOAD_VISUALS = {
  kinetic: null,
  pyro: [["poly", { pts: [[0.55, 0], [-0.45, -0.55], [-0.15, 0], [-0.45, 0.55]], fill: "tip" }]],
  shock: [["polyline", { pts: [[-0.35, -0.55], [0.1, 0], [-0.35, 0.55]], lw: 0.35 }]],
  frost: [["poly", { pts: [[0, -0.65], [0.5, 0], [0, 0.65], [-0.5, 0]], fill: "tip" }]],
  poison: [
    ["circle", { x: 0, y: 0, r: 0.5, fill: "tip" }],
    ["circle", { x: -0.15, y: -0.15, r: 0.22, fill: "hi" }],
  ],
  acid: [["quadratic", { pts: [[-0.5, -0.35], [0, 0.85], [0.5, -0.35]], fill: "tip" }]],
  breach: null,
  emp: null,
};
