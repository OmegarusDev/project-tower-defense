/**
 * Part visuals — the data-driven render language. Every part declares its
 * look as a list of primitives; renderTower.js instantiates them over the
 * unified two-factor basis. Adding a part = adding data, never painter code.
 *
 * Coordinates are part-relative (× the part's scale); colors name material
 * slots (top/side/sideDark/sideDeep/rim/accent/topHi) resolved from the
 * palette's part color via matsFrom.
 *
 * PROOF SUBSET: sentry base, single barrel, kinetic payload — golden-verified
 * byte-identical to the oracle painter. The rest ports the same way.
 */

// y = the vz factor (positive = up from the deck line), matching the
// painter's deckY - vz(s, k) convention exactly.
export const BASE_VISUALS = {
  sentry: [
    ["cyl", { x: 0, y: -0.02, rx: 0.3, rise: 0.05, top: "sideDark", side: "sideDeep", bottom: "rim" }],
    ["cyl", { x: 0, y: 0.08, rx: 0.25, rise: 0.12, top: "top", side: "side", bottom: "sideDark" }],
    ["vents", { xs: [-0.16, 0.16], y0: 0.04, y1: 0.12, color: "sideDeep", w: 0.02 }],
    ["ring", { y: 0.1, rx: 0.22, color: "rim", alpha: 0.55 }],
    ["cyl", { x: 0, y: 0.14, rx: 0.16, rise: 0.06, top: "topHi", side: "accent", bottom: "sideDark" }],
    ["ellipseStroke", { y: 0.14, rx: 0.14, color: "topHi", alpha: 0.55 }],
    ["rivets", { y: 0.14, rx: 0.12, n: 6, color: "rim" }],
  ],
};

export const BARREL_VISUALS = {
  single: [
    ["tube", { len: 0.46, th: 0.11 }],
  ],
};

/** Payload tip visuals — drawn at the muzzle, oriented along the aim. */
export const PAYLOAD_VISUALS = {
  kinetic: null,
};
