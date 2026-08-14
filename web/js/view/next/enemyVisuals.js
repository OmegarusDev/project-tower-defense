/**
 * Enemy visuals — the Slag Host silhouettes as data, transcribed EXACTLY
 * from the oracle enemyPainter. yTop = s-factor above cy; alpha may be a
 * pure function of the frozen animation phase t.
 */

export const ENEMY_VISUALS = {
  mite: {
    anim: "none",
    parts: [
      ["cyl", { x: 0, yTop: 0.063, rx: 0.2, rise: 0.14, top: "top", side: "side", bottom: "sideDark" }],
      ["cyl", { x: 0, yTop: 0.14, rx: 0.11, rise: 0.07, top: "topHi", side: "side", bottom: "sideDark" }],
      ["ellipseStroke", { yTop: 0.035, rx: 0.18, ry: 0.08, color: "sideDark", alpha: 0.6, lw: 1 }],
      ["ellipseStroke", { yTop: 0.077, rx: 0.18, ry: 0.08, color: "sideDark", alpha: 0.6, lw: 1 }],
      ["brass", { yTop: 0.042, r: 0.16, n: 4 }],
    ],
  },
  courier: {
    anim: "lean",
    parts: [
      ["frustum", { x: 0, yTop: 0.22, rxBot: 0.07, rxTop: 0.24, rise: 0.2, top: "top", side: "side", dark: "sideDark" }],
      ["quadratic", { pts: [[0.08, -0.05], [0.28, 0], [0.22, 0.18]], whip: true, color: "side", alpha: 0.75, lw: 1.8 }],
      ["poly", { pts: [[-0.26, 0.02], [-0.06, -0.1], [-0.08, 0.1]], fill: "sideDark" }],
      ["plate", { x: 0, yTop: 0.28, w: 0.12, h: 0.05 }],
    ],
  },
  hauler: {
    anim: "none",
    parts: [
      ["fillRect", { x: -0.231, y: 0.033, w: 0.462, h: 0.077, color: "tread" }],
      ["box", { x: 0, yTop: 0.055, w: 0.42, d: 0.3024, h: 0.22, top: "top", side: "side", dark: "sideDark" }],
      ["box", { x: 0, yTop: 0.176, w: 0.231, d: 0.168, h: 0.0704, top: "top", side: "side", dark: "sideDark", topShade: 0.1 }],
      ["polyline", { pts: [[-0.0924, -0.022], [0.0336, 0.011], [0.105, -0.055]], color: "weld", alpha: 0.5, lw: 1 }],
      ["plate", { x: 0, yTop: 0.033, w: 0.14, h: 0.05 }],
    ],
    rivets: { r: 0.26, n: 3 },
  },
  duct: {
    anim: "bob",
    parts: [
      ["ellipseFill", { x: 0, yTop: -0.28, rx: 0.22, ry: 0.07, plainRy: true, color: "shadow", alpha: 0.2 }],
      ["frustum", { x: 0, yTop: 0.14, rxBot: 0.28, rxTop: 0.12, rise: 0.11, top: "top", side: "side", dark: "sideDark" }],
      ["ellipseStroke", { x: 0, yTop: 0.08, rx: 0.36, ry: 0.1, plainRy: true, color: "rim", alpha: 0.6, lw: 1.7 }],
      ["spokes", { yTop: 0.08, r0: 0.1, r1: 0.34, ry0: 0.035, ry1: 0.1, color: "spoke", alpha: 0.28, lw: 1, n: 4 }],
    ],
  },
  ward: {
    anim: "none",
    parts: [
      ["cyl", { x: 0, yTop: 0.16, rx: 0.22, rise: 0.15, top: "top", side: "side", bottom: "sideDark" }],
      ["box", { x: 0, yTop: 0.04, w: 0.4, d: 0.16, h: 0.1, top: "steelTop", side: "steelSide", dark: "steelDark" }],
      ["ellipseStroke", { x: 0, yTop: 0.2, rx: 0.28, ry: 0.28, color: "veil", alpha: 0.55, lw: 1.5 }],
      ["plate", { x: 0.08, yTop: 0.12, w: 0.1, h: 0.04 }],
    ],
    rivets: { r: 0.26, n: 3 },
  },
  cask: {
    anim: "none",
    parts: [
      ["box", { x: 0, yTop: -0.02, w: 0.34, d: 0.18, h: 0.1, top: "top", side: "side", dark: "sideDark" }],
      ["cyl", { x: -0.12, yTop: 0.14, rx: 0.13, rise: 0.14, top: "barrelA", side: "barrelASide", bottom: "barrelADark" }],
      ["cyl", { x: 0.12, yTop: 0.14, rx: 0.13, rise: 0.14, top: "barrelB", side: "barrelBSide", bottom: "barrelBDark" }],
      ["dashLine", { pts: [[0, -0.22], [0, 0.08]], color: "seam", alpha: 0.5, lw: 1 }],
    ],
  },
  phantom: {
    anim: "bob",
    parts: [
      ["ellipseFill", { x: 0, yTop: -0.22, rx: 0.14, ry: 0.04, plainRy: true, color: "shadow", alpha: 0.1 }],
      ["frustum", { x: 0, yTop: 0.18, rxBot: 0.05, rxTop: 0.2, rise: 0.16, top: "top", side: "side", dark: "sideDark", alpha: (t) => 0.7 + 0.12 * Math.sin(t * 4) }],
      ["quadratic", { pts: [[-0.08, 0.02], [-0.18, 0.16], [-0.02, 0.2]], color: "ember", alpha: 0.35, lw: 1.2 }],
      ["quadratic", { pts: [[0.08, 0.02], [0.18, 0.16], [0.02, 0.2]], color: "ember", alpha: 0.35, lw: 1.2 }],
    ],
  },
  kiln: {
    anim: "none",
    parts: [
      ["box", { x: 0, yTop: 0.08, w: 0.38, d: 0.28, h: 0.24, top: "top", side: "side", dark: "sideDark" }],
      ["cyl", { x: 0.1, yTop: 0.4, rx: 0.09, rise: 0.18, top: "sideDark", side: "side", bottom: "sideDark" }],
      ["ellipseFill", { x: -0.06, yTop: 0, rx: 0.1, ry: 0.07, color: "glow", alpha: (t) => 0.4 + 0.28 * (0.5 + 0.5 * Math.sin(t * 6)) }],
      ["arcFill", { x: 0.1, yTop: 0.52, r: 0.045, color: "glow2", alpha: (t) => (0.4 + 0.28 * (0.5 + 0.5 * Math.sin(t * 6))) * 0.4 }],
      ["lineGrate", { xs: [-0.08, 0, 0.08], y0: 0.02, y1: -0.1, color: "grate", alpha: 0.45, lw: 1 }],
    ],
    rivets: { r: 0.26, n: 3 },
  },
  siphon: {
    anim: "pulse",
    parts: [
      ["cyl", { x: 0, yTop: 0.04, rx: 0.22, rise: 0.12, top: "top", side: "side", bottom: "sideDark" }],
      ["cyl", { x: 0.12, yTop: 0.16, rx: 0.14, rise: 0.1, top: "top", side: "side", bottom: "sideDark" }],
      ["cyl", { x: -0.1, yTop: 0.24, rx: 0.1, rise: 0.08, top: "topHi", side: "side", bottom: "sideDark" }],
      ["ellipseStroke", { x: 0, yTop: -0.1, rx: 0.18, ry: 0.11, color: "pulse", alpha: (t) => 0.45 + 0.3 * (0.5 + 0.5 * Math.sin(t * 5)), lw: 1.6 }],
    ],
  },
  skulk: {
    anim: "none",
    parts: [
      ["frustum", { x: 0, yTop: 0.14, rxBot: 0.24, rxTop: 0.3, rise: 0.1, top: "top", side: "side", dark: "sideDark" }],
      ["ellipseFill", { x: 0, yTop: 0.34, rx: 0.09, ry: 0.06, color: "eye", alpha: 0.9 }],
      ["ellipseStroke", { x: 0, yTop: 0.34, rx: 0.13, ry: 0.09, color: "eyeRing", alpha: 0.55, lw: 1 }],
      ["quadratic", { pts: [[-0.13, -0.02], [-0.22, -0.12], [-0.05, -0.16]], color: "side", alpha: 0.6, lw: 1.2 }],
      ["quadratic", { pts: [[0.13, -0.02], [0.22, -0.12], [0.05, -0.16]], color: "side", alpha: 0.6, lw: 1.2 }],
      ["plate", { x: 0, yTop: 0.3, w: 0.1, h: 0.04 }],
    ],
  },
  claim: {
    anim: "claim",
    parts: [
      ["box", { x: 0, yTop: 0.056, w: 0.5, d: 0.34, h: 0.28, top: "top", side: "side", dark: "sideDark" }],
      ["box", { x: 0, yTop: 0.252, w: 0.36, d: 0.24, h: 0.1176, top: "top", side: "side", dark: "sideDark", topShade: 0.08 }],
      ["frustum", { x: -0.18, yTop: 0.392, rxBot: 0.045, rxTop: 0.08, rise: 0.14, top: "tip", side: "tipSide", dark: "tipDark" }],
      ["frustum", { x: 0, yTop: 0.392, rxBot: 0.045, rxTop: 0.08, rise: 0.14, top: "tip", side: "tipSide", dark: "tipDark" }],
      ["frustum", { x: 0.18, yTop: 0.392, rxBot: 0.045, rxTop: 0.08, rise: 0.14, top: "tip", side: "tipSide", dark: "tipDark" }],
      ["ellipseStroke", { x: 0, yTop: 0.042, rx: 0.2, ry: 0.09, color: "gold", alpha: (t) => 0.5 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.2)), lw: 2.2 }],
      ["plate", { x: 0, yTop: 0.098, w: 0.16, h: 0.055 }],
    ],
    rivets: { r: 0.26, n: 5 },
  },
};
