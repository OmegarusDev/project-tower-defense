/** Shared canvas helpers for the Forgeworks look. */

export function shade(hex, amount) {
  if (!hex || hex[0] !== "#" || hex.length < 7) return hex;
  const n = parseInt(hex.slice(1, 7), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + Math.round(255 * amount)));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + Math.round(255 * amount)));
  const b = Math.max(0, Math.min(255, (n & 255) + Math.round(255 * amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function withAlpha(hex, a) {
  if (!hex || hex[0] !== "#" || hex.length < 7) return `rgba(0,0,0,${a})`;
  const n = parseInt(hex.slice(1, 7), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

export function matsFrom(col) {
  return {
    top: shade(col, 0.16),
    topHi: shade(col, 0.28),
    side: shade(col, -0.05),
    sideDark: shade(col, -0.22),
    sideDeep: shade(col, -0.36),
    rim: shade(col, -0.42),
    accent: shade(col, 0.06),
  };
}

/** Tiny deterministic noise in [-1, 1] for tile variation. */
export function hash21(x, y) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295 * 2 - 1;
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function facePoly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}
