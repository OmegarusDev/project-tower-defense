/**
 * Enemies, projectiles, hover, ghosts, towers, pending place.
 */
import { renderTowerNext } from "../renderTower.js";
import { renderEnemyNext } from "../renderEnemy.js";
import { deckRy, VIEW25 } from "../camera.js";
import { shade, withAlpha } from "../drawUtil.js";
import { UNIT_SCALE, fillQuad, strokeQuad } from "./geom.js";

export function drawEnemyFrame(ctx, cam, palette, e, cell, t) {
  const hitSquash = e._hitFlash > 0 ? 1 + e._hitFlash * 0.35 : 1;
  if (e._hitFlash > 0) e._hitFlash = Math.max(0, e._hitFlash - 0.04);
  const p = cam.project(e.pos.x * cell, e.pos.y * cell);
  const s = cell * 0.8 * p.s * UNIT_SCALE * hitSquash;
  const cx = p.x;
  const cy = p.y;

  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(cx + 1, cy + s * 0.22, s * 0.28, deckRy(s * 0.28), 0, 0, Math.PI * 2);
  ctx.fill();

  renderEnemyNext(ctx, palette, e.silhouette || e.kind, cx, cy, s, {
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
  if ((e.burnT || 0) > 0) ring = palette.dmg("fire");
  else if ((e.poisonT || 0) > 0) ring = palette.dmg("poison");
  else if ((e.shredT || 0) > 0) ring = palette.dmg("acid");
  else if ((e.slowT || 0) > 0) ring = palette.dmg("frost");
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
  ctx.fillStyle = shade(palette.path, -0.35);
  ctx.fillRect(cx - barW / 2, cy - s * 0.55, barW, 3);
  ctx.fillStyle = ratio > 0.35 ? "#8fbf6a" : "#c45a4a";
  ctx.fillRect(cx - barW / 2, cy - s * 0.55, barW * ratio, 3);
}

export function drawProjectile(ctx, cam, palette, p, cell) {
  const sp = cam.project(p.pos.x * cell, p.pos.y * cell);
  const type = p.damageType || "kinetic";
  const col = palette.dmg(type);
  const r = (type === "frost" ? 2.6 : type === "fire" ? 3.6 : 3.2) * sp.s;
  // Reuse point objects — no per-frame {x,y} alloc + no per-shift discard.
  const maxTrail = type === "fire" || type === "poison" ? 8 : 6;
  const trail = p._trail || (p._trail = []);
  let pt;
  if (trail.length >= maxTrail) pt = trail.shift();
  else { pt = p._trailPool && p._trailPool.pop(); if (!pt) pt = { x: 0, y: 0 }; }
  pt.x = p.pos.x; pt.y = p.pos.y;
  trail.push(pt);
  for (let i = 0; i < trail.length - 1; i++) {
    const a = (i + 1) / trail.length;
    const t0 = cam.project(trail[i].x * cell, trail[i].y * cell);
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

export function drawHover(ctx, cam, palette, x, y, ok, cell) {
  const q = cam.cellQuad(x, y, 2);
  const col = ok ? palette.spawn : palette.exit;
  fillQuad(ctx, q, ok ? "rgba(111,175,122,0.22)" : "rgba(196,90,74,0.22)");
  strokeQuad(ctx, q, withAlpha(col, 0.55), 1.5);
  const inner = cam.cellQuad(x, y, Math.max(4, cell * 0.14));
  strokeQuad(ctx, inner, withAlpha(col, 0.28), 1);
  // Soft corner ticks
  ctx.strokeStyle = withAlpha(col, 0.7);
  ctx.lineWidth = 1.5;
  const L = Math.max(4, cell * 0.1);
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

export function drawPlanGhost(ctx, cam, palette, plan, cell, cellSize) {
  if (!plan || !cell) return;
  const tint = palette.dmg(plan.damageType || "kinetic");
  const ox = cell.x + 0.5;
  const oy = cell.y + 0.5;
  const drawRing = (radiusCells, alpha, dash) => {
    const r = radiusCells * cellSize;
    const steps = 48;
    ctx.strokeStyle = withAlpha(tint, alpha);
    ctx.lineWidth = 1.6;
    ctx.setLineDash(dash);
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const sp = cam.project(ox * cellSize + Math.cos(a) * r, oy * cellSize + Math.sin(a) * r);
      if (i === 0) ctx.moveTo(sp.x, sp.y);
      else ctx.lineTo(sp.x, sp.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  };
  drawRing(plan.rangeCells || 2.5, 0.45, [5, 4]);
  if (plan.pulseRadius > 0) drawRing(plan.pulseRadius, 0.35, [2, 3]);
  if ((plan.chainJumps | 0) > 0) {
    const p0 = cam.project(ox * cellSize, oy * cellSize);
    for (let i = 0; i < Math.min(3, plan.chainJumps); i++) {
      const a = -0.4 + i * 0.55;
      const p1 = cam.project(
        (ox + Math.cos(a) * (plan.rangeCells * 0.7)) * cellSize,
        (oy + Math.sin(a) * (plan.rangeCells * 0.7)) * cellSize
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

/** Range as perspective ellipse (circle in board space → oval on screen). */
export function drawRangeRing(ctx, cam, palette, cx, cy, rangeCells, cell, accent) {
  const r = rangeCells * cell;
  const steps = 48;
  ctx.strokeStyle = withAlpha(accent, 0.35);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const wx = cx * cell + Math.cos(a) * r;
    const wy = cy * cell + Math.sin(a) * r;
    const sp = cam.project(wx, wy);
    if (i === 0) ctx.moveTo(sp.x, sp.y);
    else ctx.lineTo(sp.x, sp.y);
  }
  ctx.stroke();
  ctx.lineWidth = 1;
}

export function drawTowerFrame(ctx, cam, palette, t, px, py, s, opts) {
  const { selected, plan, cell } = opts;
  renderTowerNext(ctx, palette, t, px, py, s, { selected });

  // XP bar above the tower (never across the base / cell edge)
  const cap = t.levelCap || 1;
  const need = t.xpToPoint || 1;
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
  ctx.fillStyle = atCap ? palette.accent : "#c9a227";
  ctx.fillRect(bx, by, barW * ratio, barH);

  if (selected && plan) {
    drawRangeRing(ctx, cam, palette, t.cell.x + 0.5, t.cell.y + 0.5, plan.rangeCells, cell, palette.accent);
  }
}

/** Armed place — pulse the cell and ghost the loadout; second tap confirms. */
export function drawPendingPlace(ctx, cam, palette, pending, cell, t, cellSize) {
  const { x, y } = pending;
  const pulse = 0.5 + 0.5 * Math.sin(t * 7.2);
  const flash = 0.5 + 0.5 * Math.sin(t * 12);  /* fast flash overlay */
  const accent = palette.accent || "#e8c56a";

  /* Outer expanding ring — pulses outward */
  const ringPhase = (t * 1.8) % 1;
  const ringScale = 3 + ringPhase * 5;
  const ringAlpha = (1 - ringPhase) * 0.35;
  strokeQuad(ctx, cam.cellQuad(x, y, ringScale), withAlpha(accent, ringAlpha), 1.4);

  /* Main cell fill + stroke */
  const pad = cam.cellQuad(x, y, 2);
  fillQuad(ctx, pad, `rgba(232, 197, 106, ${0.18 + pulse * 0.18})`);
  strokeQuad(ctx, pad, withAlpha(accent, 0.6 + pulse * 0.4), 2.8);

  /* Corner flash highlights — sharp bright marks at corners */
  const cornerAlpha = flash * 0.55;
  const cq = cam.cellQuad(x, y, 1.5);
  const cx = (cq[0] + cq[2]) / 2, cy = (cq[1] + cq[5]) / 2;
  const cw = (cq[2] - cq[0]) / 2, ch = (cq[5] - cq[1]) / 2;
  ctx.save();
  ctx.strokeStyle = withAlpha("#fff8e0", cornerAlpha);
  ctx.lineWidth = 1.5;
  const cLen = cw * 0.28;
  /* top-left */
  ctx.beginPath();
  ctx.moveTo(cq[0] + 2, cq[1] + cLen);
  ctx.lineTo(cq[0] + 2, cq[1] + 2);
  ctx.lineTo(cq[0] + cLen, cq[1] + 2);
  ctx.stroke();
  /* top-right */
  ctx.beginPath();
  ctx.moveTo(cq[2] - cLen, cq[1] + 2);
  ctx.lineTo(cq[2] - 2, cq[1] + 2);
  ctx.lineTo(cq[2] - 2, cq[1] + cLen);
  ctx.stroke();
  /* bottom-left */
  ctx.beginPath();
  ctx.moveTo(cq[0] + 2, cq[5] - cLen);
  ctx.lineTo(cq[0] + 2, cq[5] - 2);
  ctx.lineTo(cq[0] + cLen, cq[5] - 2);
  ctx.stroke();
  /* bottom-right */
  ctx.beginPath();
  ctx.moveTo(cq[2] - cLen, cq[5] - 2);
  ctx.lineTo(cq[2] - 2, cq[5] - 2);
  ctx.lineTo(cq[2] - 2, cq[5] - cLen);
  ctx.stroke();
  ctx.restore();

  if (pending.base && pending.barrel && pending.payload) {
    const p = cam.projectCell(x, y);
    const s = cellSize * p.s * UNIT_SCALE;
    ctx.save();
    ctx.globalAlpha = 0.4 + pulse * 0.24;
    renderTowerNext(
      ctx,
      palette,
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
