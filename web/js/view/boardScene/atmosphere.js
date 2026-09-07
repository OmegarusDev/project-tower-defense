/**
 * Vignette, motes, theme pulse.
 */
import { VIEW25 } from "../camera.js";
import { withAlpha } from "../drawUtil.js";

export function drawAtmosphere(ctx, palette, cssW, cssH, t, motes, state) {
  const themePulse = state.themePulse;
  const bossVignette = state.bossVignette;
  const plate = state.plate;
  const atmo = palette.atmosphere || {};
  const fog = atmo.fog || palette.fog;
  const moteWarm = atmo.moteWarm || palette.accent;
  const moteCool = atmo.moteCool || "#9eb0c0";
  const bloomA = atmo.bloom ?? 0.35;
  const isForge = palette._atmosphereId === "forge";

  const vg = ctx.createRadialGradient(
    cssW * 0.5,
    cssH * 0.38,
    cssH * 0.18,
    cssW * 0.5,
    cssH * 0.5,
    cssH * (0.74 + 0.08 * VIEW25.depthFog)
  );
  vg.addColorStop(0, "transparent");
  vg.addColorStop(1, fog);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, cssW, cssH);

  const bloom = ctx.createLinearGradient(0, 0, 0, cssH * 0.28);
  bloom.addColorStop(0, `rgba(4, 6, 8, ${bloomA + 0.25 * VIEW25.depthFog})`);
  bloom.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, cssW, cssH * 0.3);

  // Forge background: molten glow around board edges + ember particles
  if (isForge && plate) {
    const left = Math.min(plate[0].x, plate[3].x);
    const right = Math.max(plate[1].x, plate[2].x);
    const top = Math.min(plate[0].y, plate[1].y);
    const bot = Math.max(plate[2].y, plate[3].y);
    const padX = (right - left) * 0.15;
    const padY = (bot - top) * 0.12;

    // Molten glow radiating from board edges
    const edgeGrad = ctx.createLinearGradient(left - padX, 0, right + padX, cssH);
    edgeGrad.addColorStop(0, "rgba(255, 107, 42, 0.08)");
    edgeGrad.addColorStop(0.25, "rgba(255, 107, 42, 0.03)");
    edgeGrad.addColorStop(0.5, "transparent");
    edgeGrad.addColorStop(0.75, "rgba(255, 107, 42, 0.03)");
    edgeGrad.addColorStop(1, "rgba(255, 107, 42, 0.08)");
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, 0, cssW, cssH);

    // Top/bottom molten seams
    const seamGrad = ctx.createLinearGradient(0, top - padY, 0, top + padY);
    seamGrad.addColorStop(0, "transparent");
    seamGrad.addColorStop(0.3, "rgba(255, 140, 60, 0.12)");
    seamGrad.addColorStop(0.7, "rgba(255, 100, 30, 0.06)");
    seamGrad.addColorStop(1, "transparent");
    ctx.fillStyle = seamGrad;
    ctx.fillRect(0, top - padY, cssW, padY * 2);

    const seamGrad2 = ctx.createLinearGradient(0, bot - padY, 0, bot + padY);
    seamGrad2.addColorStop(0, "transparent");
    seamGrad2.addColorStop(0.3, "rgba(255, 140, 60, 0.12)");
    seamGrad2.addColorStop(0.7, "rgba(255, 100, 30, 0.06)");
    seamGrad2.addColorStop(1, "transparent");
    ctx.fillStyle = seamGrad2;
    ctx.fillRect(0, bot - padY, cssW, padY * 2);

    // Subtle corner glows
    const cornerR = Math.min(cssW, cssH) * 0.18;
    for (const cx of [left, right]) {
      for (const cy of [top, bot]) {
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cornerR);
        cg.addColorStop(0, "rgba(255, 120, 50, 0.18)");
        cg.addColorStop(0.5, "rgba(255, 80, 30, 0.06)");
        cg.addColorStop(1, "transparent");
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(cx, cy, cornerR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  if (themePulse > 0) {
    ctx.fillStyle = withAlpha(atmo.pulse || moteWarm, themePulse * 0.12);
    ctx.fillRect(0, 0, cssW, cssH);
  }
  if (bossVignette > 0.05) {
    const bv = ctx.createRadialGradient(
      cssW * 0.5,
      cssH * 0.55,
      cssH * 0.2,
      cssW * 0.5,
      cssH * 0.55,
      cssH * 0.75
    );
    bv.addColorStop(0, "transparent");
    bv.addColorStop(1, `rgba(40, 8, 12, ${0.35 * bossVignette})`);
    ctx.fillStyle = bv;
    ctx.fillRect(0, 0, cssW, cssH);
  }

  if (plate) {
    const left = Math.min(plate[0].x, plate[3].x);
    const right = Math.max(plate[1].x, plate[2].x);
    const top = Math.min(plate[0].y, plate[1].y);
    const bot = Math.max(plate[2].y, plate[3].y);
    for (const m of motes) {
      m.v -= m.sp * 0.016;
      if (m.v < -0.05) {
        m.v = 1.05;
        m.u = Math.random();
      }
      const x = left + (right - left) * m.u + Math.sin(t * 0.7 + m.ph) * 6;
      const y = top + (bot - top) * m.v;
      const a = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(t * 2 + m.ph));
      ctx.fillStyle = m.warm ? withAlpha(moteWarm, a) : withAlpha(moteCool, a * 0.85);
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = "rgba(255,245,220,0.018)";
  for (let i = 0; i < 28; i++) {
    const x = ((i * 97 + t * 55) | 0) % cssW;
    const y = ((i * 53 + t * 23) | 0) % cssH;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
}
