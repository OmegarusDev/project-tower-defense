/**
 * Flow preview, portal, and seam animator.
 */
import { VIEW25, deckRy } from "../camera.js";
import { shade, withAlpha } from "../drawUtil.js";

/**
 * Flow preview paths — starts at the live seam (portal cell), walks the
 * ground chain through the SAME option pool the live enemies pick from
 * (grid.groundOptions). Returns { trunk, branches }: the canonical trunk
 * plus every equally-optimal alternative branch, so the preview shows the
 * full option set the sim actually distributes over.
 */
export function pathPoints(cam, grid, portalX, opts = {}) {
  const maxPaths = opts.maxPaths || 4;
  const proj = (c) => cam.projectCell(c.x, c.y);
  const { trunkCells, branchCells } = flowCellPaths(grid, portalX, opts);

  const trunk = trunkCells.map(proj);
  const branches = branchCells.slice(0, maxPaths).map((cells) => cells.map(proj));
  return { trunk, branches };
}

/**
 * Board-local walk of the canonical trunk (and one alternate branch per
 * fork), cached per grid by (revision, portalX). Cells are camera-independent;
 * callers project per frame so pan/zoom/pitch never see stale points. This
 * used to re-walk option pools with fresh string-keyed Sets every frame.
 * @returns {{ trunkCells: Array<{x,y}>, branchCells: Array<Array<{x,y}>> }}
 */
const _flowCache = new WeakMap();
export function flowCellPaths(grid, portalX, opts = {}) {
  const maxSteps = opts.maxSteps || 120;
  const avoid = opts.avoid || "none";
  const rev = grid.revision | 0;
  const hit = _flowCache.get(grid);
  if (hit && hit.rev === rev && hit.portalX === portalX && hit.avoid === avoid) {
    return hit.val;
  }
  const start = { x: portalX, y: 0 };
  const drawn = new Set();
  const trunkCells = [];
  let cell = start;
  for (let i = 0; i < maxSteps; i++) {
    const key = `${cell.x},${cell.y}`;
    if (drawn.has(key)) break;
    drawn.add(key);
    trunkCells.push(cell);
    const next = grid.canonicalGround(cell.x, cell.y, { avoid });
    if (next.x === cell.x && next.y === cell.y) break;
    cell = next;
    if (grid.isExit(cell.x, cell.y)) {
      drawn.add(`${cell.x},${cell.y}`);
      trunkCells.push(cell);
      break;
    }
  }

  // One alternate continuation per fork along the trunk (preview-only extra
  // branches beyond that are rarely readable; matches old maxPaths=1 use).
  const branchCells = [];
  for (let fi = 0; fi < trunkCells.length && branchCells.length < (opts.maxBranches || 3); fi++) {
    const fc = trunkCells[fi];
    const pool = grid.groundOptions(fc.x, fc.y, { avoid, flying: false });
    if (pool.length < 2) continue;
    const trunkChoice = grid.canonicalGround(fc.x, fc.y, { avoid });
    for (const opt of pool) {
      if (opt.x === trunkChoice.x && opt.y === trunkChoice.y) continue;
      const cells = [fc, opt];
      let cur = opt;
      let guard = 0;
      while (guard++ < maxSteps) {
        const key = `${cur.x},${cur.y}`;
        if (drawn.has(key)) break;
        drawn.add(key);
        const next = grid.canonicalGround(cur.x, cur.y, { avoid });
        if (next.x === cur.x && next.y === cur.y) break;
        cur = next;
        cells.push(cur);
        if (grid.isExit(cur.x, cur.y)) break;
      }
      if (cells.length > 1) {
        branchCells.push(cells);
        break; // one alternate per fork
      }
    }
  }

  const val = { trunkCells, branchCells };
  _flowCache.set(grid, { rev, portalX, avoid, val });
  return val;
}

export function strokePts(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

export function strokePathLayers(ctx, pts, { w, travel, pressure, warm, cell }) {
  const c = cell;
  ctx.strokeStyle = `rgba(120, 190, 220, ${0.06 + pressure * 0.08})`;
  ctx.lineWidth = w * 1.85;
  strokePts(ctx, pts);

  if (pressure > 0.15) {
    ctx.strokeStyle = `rgba(212, 120, 58, ${warm})`;
    ctx.lineWidth = w * 1.35;
    strokePts(ctx, pts);
  }

  ctx.strokeStyle = `rgba(170, 205, 225, ${0.08 + pressure * 0.1})`;
  ctx.lineWidth = w;
  strokePts(ctx, pts);

  ctx.strokeStyle = `rgba(190, 220, 240, ${0.12 + pressure * 0.12})`;
  ctx.lineWidth = w * 0.55;
  strokePts(ctx, pts);

  ctx.strokeStyle = `rgba(210, 230, 245, ${0.26 + pressure * 0.2})`;
  ctx.lineWidth = w * 0.65;
  ctx.setLineDash([c * 0.32, c * 0.9]);
  ctx.lineDashOffset = travel;
  strokePts(ctx, pts);

  ctx.strokeStyle = `rgba(240, 250, 255, ${0.2 + pressure * 0.25})`;
  ctx.lineWidth = w * 0.28;
  ctx.setLineDash([c * 0.12, c * 1.1]);
  ctx.lineDashOffset = travel - c * 0.28;
  strokePts(ctx, pts);
}

export function drawPath(ctx, cam, grid, portalX, cell, t, enemyCount) {
  // Cached board-local cells; projection is per-frame (camera-correct).
  const { trunkCells } = flowCellPaths(grid, portalX, { maxPaths: 1 });
  const trunk = trunkCells.map((c) => cam.projectCell(c.x, c.y));
  if (trunk.length < 2) return;

  const pressure = Math.min(1, enemyCount / 14);
  const c = cell;
  const midS = trunk[Math.floor(trunk.length / 2)]?.s || 1;
  const w = Math.max(4, c * (0.28 + pressure * 0.08) * midS);
  const travel = -t * c * (1.15 + pressure * 0.8);
  const warm = 0.06 + pressure * 0.14;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  strokePathLayers(ctx, trunk, { w, travel, pressure, warm, cell: c });

  ctx.setLineDash([]);
  ctx.restore();
}

/** Animated wormhole at the live portal cell. */
export function drawPortal(ctx, cam, palette, portal, cell, t, animator = null) {
  if (!ctx || !cam || !palette || !portal || !cell) return;
  const c = cam.projectCell(portal.x, portal.y);
  const rx = cell * 0.42 * c.s;
  const ry = deckRy(rx);
  
  // Get animation state
  let stretch = 1.0;
  let alpha = 1.0;
  let bloomIntensity = 0;
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
  
  if (animator) {
    stretch = animator.stretch ?? 1.0;
    alpha = animator.alpha ?? 1.0;
    bloomIntensity = animator.bloomIntensity ?? 0;
  }
  
  // Clamp values
  stretch = Math.max(0.1, Math.min(5, stretch));
  alpha = Math.max(0, Math.min(1, alpha));
  bloomIntensity = Math.max(0, Math.min(1, bloomIntensity));

  // Apply alpha to all drawing - robust version without deprecated RegExp.$n
  const applyAlpha = (color, a) => {
    if (a <= 0) return "rgba(0,0,0,0)";
    if (color.startsWith('rgba')) {
      const m = color.match(/rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
      if (m) {
        return `rgba(${m[1]},${m[2]},${m[3]},${a * parseFloat(m[4])})`;
      }
      return "rgba(0,0,0,0)";
    }
    if (color.startsWith('#') || color.startsWith('rgb(')) {
      return withAlpha(color, a);
    }
    return withAlpha(color, a);
  };

  // Ground scorch / stone ring
  ctx.fillStyle = applyAlpha("rgba(0,0,0,0.4)", alpha);
  ctx.beginPath();
  ctx.ellipse(c.x + 1.5, c.y + 4, rx * 1.22 * stretch, ry * 1.22 * stretch, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = applyAlpha(shade(palette.accent, -0.15), alpha);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx * 1.08 * stretch, ry * 1.08 * stretch, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = applyAlpha(withAlpha("#ebe6d8", 0.2), alpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx * 1.18 * stretch, ry * 1.18 * stretch, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Outer halo with bloom
  const halo = ctx.createRadialGradient(c.x, c.y, rx * 0.2, c.x, c.y, rx * 1.55 * stretch);
  const baseHaloAlpha = 0.18 + 0.12 * pulse;
  const bloomBoost = bloomIntensity * 0.3;
  halo.addColorStop(0, withAlpha("#6b3fa0", (baseHaloAlpha + bloomBoost) * alpha));
  halo.addColorStop(0.45, withAlpha("#3d6a8a", 0.14 * alpha));
  halo.addColorStop(0.75, withAlpha("#7ec8a0", 0.05 * alpha));
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx * 1.55 * stretch, ry * 1.55 * stretch, 0, 0, Math.PI * 2);
  ctx.fill();

  // Breathing energy ring
  ctx.strokeStyle = applyAlpha(withAlpha("#c9a0e8", 0.22 + 0.18 * pulse), alpha);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx * (1.22 + 0.06 * pulse) * stretch, ry * (1.22 + 0.06 * pulse) * stretch, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Inner void
  const voidGrad = ctx.createRadialGradient(c.x, c.y - ry * 0.15 * stretch, 0, c.x, c.y, rx * stretch);
  voidGrad.addColorStop(0, applyAlpha("rgba(12, 8, 28, 0.98)", alpha));
  voidGrad.addColorStop(0.35, applyAlpha("rgba(55, 28, 95, 0.88)", alpha));
  voidGrad.addColorStop(0.7, applyAlpha("rgba(40, 70, 90, 0.55)", alpha));
  voidGrad.addColorStop(1, applyAlpha("rgba(20, 30, 40, 0.15)", alpha));
  ctx.fillStyle = voidGrad;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx * 0.95 * stretch, ry * 0.95 * stretch, 0, 0, Math.PI * 2);
  ctx.fill();

  // Spinning arcs + event horizon
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(stretch, VIEW25.deckRatio * stretch);
  for (let i = 0; i < 5; i++) {
    const a0 = t * (1.4 + i * 0.4) * (i % 2 ? -1 : 1) + i * 1.7;
    ctx.strokeStyle = applyAlpha(withAlpha(i % 2 ? "#b08ad4" : "#7ec8a0", 0.66 - i * 0.08), alpha);
    ctx.lineWidth = 2.2 - i * 0.28;
    ctx.beginPath();
    ctx.arc(0, 0, rx * (0.38 + i * 0.12), a0, a0 + 1.35 + i * 0.12);
    ctx.stroke();
  }
  ctx.strokeStyle = applyAlpha(withAlpha("#e8d5ff", 0.4 + 0.25 * pulse), alpha);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, rx * 0.28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = applyAlpha(withAlpha("#f2e8ff", 0.45 + 0.28 * pulse), alpha);
  ctx.beginPath();
  ctx.arc(0, 0, rx * (0.1 + 0.035 * pulse), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1;
}

/** Portal animation state machine for clump spawning. */
export class PortalAnimator {
  constructor() {
    this.phase = 'idle';        // idle | stretching_out | moving | stretching_in | spawning
    this.timer = 0;
    this.stretch = 1.0;         // 1.0 = normal, up to 2.5 = fully stretched
    this.alpha = 1.0;
    this.bloomIntensity = 0;
    this.targetPortal = { x: 0, y: 0 };
    this.lastPortal = { x: 0, y: 0 };
  }

  onClumpStart(portal) {
    this.lastPortal = { ...this.targetPortal };
    this.targetPortal = { ...portal };
    this.phase = 'stretching_in';
    this.timer = 0.25;
    this.alpha = 0;
    this.stretch = 2.5;
    this.bloomIntensity = 0.3;
  }

  onClumpEnd() {
    this.phase = 'stretching_out';
    this.timer = 0.3;
    this.bloomIntensity = 0.5;
  }

  onMove() {
    this.phase = 'moving';
    this.timer = 0;
  }

  /** Telegraph: seam about to migrate to e.x — agitate until the move. */
  onUnstable(e) {
    this.phase = 'warning';
    this.timer = 2.5; // keep in step with sim PORTAL_WARN_TIME
    this.bloomIntensity = 0.25;
    this.stretch = 1.0;
    if (e && Number.isInteger(e.x)) this.targetPortal = { x: e.x, y: 0 };
  }

  update(dt) {
    if (this.timer <= 0 && this.phase !== 'idle') {
      if (this.phase === 'warning') {
        // Warning expired with no explicit move event yet — settle calmly.
        this.phase = 'idle';
        this.timer = 0;
      } else if (this.phase === 'stretching_out') {
        // Stretch out complete - instant move
        this.phase = 'moving';
        this.timer = 0;
      } else if (this.phase === 'moving') {
        // Instant - start stretch in
        this.phase = 'stretching_in';
        this.timer = 0.25;
        this.alpha = 0;
        this.stretch = 2.5;
        this.bloomIntensity = 0.2;
      } else if (this.phase === 'stretching_in') {
        // Stretch in complete - start spawning
        this.phase = 'spawning';
        this.timer = 0;
      } else if (this.phase === 'spawning') {
        // Spawning phase - transition to idle until next clump
        this.phase = 'idle';
        this.timer = 0;
      }
    }
    this.timer = Math.max(0, this.timer - dt);

    // Interpolate visual properties based on phase
    const warnDenom = 2.5; // sim PORTAL_WARN_TIME (view keeps no sim imports)
    const t = this.timer / (this.phase === 'stretching_out' ? 0.3 : this.phase === 'warning' ? warnDenom : 0.25);
    if (this.phase === 'warning') {
      // Anxious pulse — bloom breathes, ring leans toward the target column.
      const urgency = 1 - t;
      this.bloomIntensity = 0.2 + 0.18 * Math.abs(Math.sin(this.timer * 7));
      this.stretch = 1.0 + 0.35 * urgency;
      this.alpha = 1.0;
    } else if (this.phase === 'stretching_out') {
      this.stretch = 1.0 + (2.5 - 1.0) * (1 - t);
      this.alpha = 1.0 - t;
      this.bloomIntensity = 0.5 * (1 - t);
    } else if (this.phase === 'stretching_in') {
      this.stretch = 2.5 - 1.5 * (1 - t);
      this.alpha = 1.0 - t;
      this.bloomIntensity = 0.2 * t;
    } else if (this.phase === 'moving') {
      this.stretch = 2.5;
      this.alpha = 0;
    } else if (this.phase === 'spawning') {
      this.stretch = Math.max(1.0, this.stretch - dt * 6);
      this.alpha = Math.min(1.0, this.alpha + dt * 4);
    } else {
      // idle
      this.stretch = 1.0;
      this.alpha = 1.0;
      this.bloomIntensity = 0;
    }
  }
}
