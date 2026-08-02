import { withAlpha } from "./drawUtil.js";

/**
 * Living title-screen backdrop — bastion wall, ink path, portal ember.
 * Drawn on the game canvas behind a translucent menu overlay.
 */
export class TitleView {
  constructor(canvas, palette) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.palette = palette;
    this.t = 0;
    this.motes = Array.from({ length: 28 }, () => this._mote());
  }

  _mote() {
    return {
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.8,
      sp: 0.015 + Math.random() * 0.04,
      ph: Math.random() * Math.PI * 2,
      warm: Math.random() > 0.55,
    };
  }

  tick(dt) {
    this.t += dt;
    for (const m of this.motes) {
      m.y -= m.sp * dt;
      m.x += Math.sin(this.t * 0.7 + m.ph) * 0.02 * dt;
      if (m.y < -0.05) {
        m.y = 1.05;
        m.x = Math.random();
      }
    }
  }

  draw() {
    const canvas = this.canvas;
    const ctx = this.ctx;
    const cssW = canvas.clientWidth || 360;
    const cssH = canvas.clientHeight || 640;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const p = this.palette;
    const t = this.t;

    // Deep void + warm vertical falloff
    const sky = ctx.createLinearGradient(0, 0, 0, cssH);
    sky.addColorStop(0, "#0c100e");
    sky.addColorStop(0.45, "#151a14");
    sky.addColorStop(0.72, "#1c221c");
    sky.addColorStop(1, "#12140f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cssW, cssH);

    // Soft brass bloom (upper field)
    const bloom = ctx.createRadialGradient(
      cssW * 0.5,
      cssH * 0.28,
      10,
      cssW * 0.5,
      cssH * 0.22,
      cssW * 0.72
    );
    bloom.addColorStop(0, withAlpha(p.accent, 0.14 + 0.04 * Math.sin(t * 1.2)));
    bloom.addColorStop(0.45, withAlpha("#6faf7a", 0.05));
    bloom.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, cssW, cssH);

    this._drawTrapBoard(cssW, cssH, t);
    this._drawBastion(cssW, cssH, t);
    this._drawMotes(cssW, cssH);

    // Vignette
    const vig = ctx.createRadialGradient(
      cssW * 0.5,
      cssH * 0.45,
      cssH * 0.15,
      cssW * 0.5,
      cssH * 0.5,
      cssH * 0.78
    );
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(8,10,8,0.62)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, cssW, cssH);

    // Film grain (subtle)
    ctx.fillStyle = "rgba(255,245,220,0.015)";
    for (let i = 0; i < 40; i++) {
      const x = ((i * 97 + t * 40) | 0) % cssW;
      const y = ((i * 53 + t * 17) | 0) % cssH;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }

  /**
   * Board UV → screen. v=0 far (top), v=1 near (bottom).
   * Depth uses integrated width-scale so equal board rows foreshorten
   * (far cells shorter than near ones), matching the trapezoid taper.
   */
  _boardPoint(midX, top, bot, farW, nearW, u, v) {
    const dv = Math.max(0, Math.min(1, v));
    const dW = nearW - farW;
    // ∫₀ᵛ scale(t) dt / ∫₀¹ scale(t) dt  with scale(t) = farW + dW·t
    const integ = (t) => farW * t + (dW * t * t) / 2;
    const screenT = integ(1) > 1e-6 ? integ(dv) / integ(1) : dv;
    const y = top + (bot - top) * screenT;
    const half = (farW + dW * dv) / 2;
    return { x: midX - half + 2 * half * u, y, half, screenT };
  }

  _drawTrapBoard(W, H, t) {
    const ctx = this.ctx;
    const top = H * 0.18;
    const bot = H * 0.62;
    const midX = W * 0.5;
    const farW = W * 0.42;
    const nearW = W * 0.92;
    const at = (u, v) => this._boardPoint(midX, top, bot, farW, nearW, u, v);

    const tl = at(0, 0);
    const tr = at(1, 0);
    const br = at(1, 1);
    const bl = at(0, 1);

    // Plate shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.moveTo(tl.x + 4, tl.y + 6);
    ctx.lineTo(tr.x + 4, tr.y + 6);
    ctx.lineTo(br.x + 4, br.y + 6);
    ctx.lineTo(bl.x + 4, bl.y + 6);
    ctx.closePath();
    ctx.fill();

    const plate = ctx.createLinearGradient(0, top, 0, bot);
    plate.addColorStop(0, "#242a22");
    plate.addColorStop(1, "#1a1f18");
    ctx.fillStyle = plate;
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.fill();

    // Mortar grid — row lines at equal board depths (foreshortened on screen)
    ctx.strokeStyle = "rgba(55, 62, 50, 0.55)";
    ctx.lineWidth = 1;
    const rows = 8;
    const cols = 7;
    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      const left = at(0, v);
      const right = at(1, v);
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const far = at(u, 0);
      const near = at(u, 1);
      ctx.beginPath();
      ctx.moveTo(far.x, far.y);
      ctx.lineTo(near.x, near.y);
      ctx.stroke();
    }

    // Ghost path
    const path = [
      { u: 0.5, v: 0.08 },
      { u: 0.5, v: 0.28 },
      { u: 0.32, v: 0.42 },
      { u: 0.68, v: 0.58 },
      { u: 0.5, v: 0.78 },
      { u: 0.5, v: 0.96 },
    ].map(({ u, v }) => at(u, v));

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(190, 215, 230, 0.12)";
    ctx.lineWidth = 10;
    this._stroke(path);
    ctx.strokeStyle = "rgba(210, 230, 245, 0.22)";
    ctx.lineWidth = 3.5;
    ctx.setLineDash([8, 14]);
    ctx.lineDashOffset = -t * 28;
    this._stroke(path);
    ctx.setLineDash([]);
    ctx.restore();

    // Portal at far end
    const portal = path[0];
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    const pr = 14 + 2 * pulse;
    const voidG = ctx.createRadialGradient(portal.x, portal.y, 0, portal.x, portal.y, pr * 1.6);
    voidG.addColorStop(0, "rgba(20, 12, 40, 0.95)");
    voidG.addColorStop(0.45, "rgba(70, 40, 110, 0.55)");
    voidG.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = voidG;
    ctx.beginPath();
    ctx.ellipse(portal.x, portal.y, pr * 1.5, pr * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = withAlpha(this.palette.accent, 0.45 + 0.2 * pulse);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(portal.x, portal.y, pr, pr * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.translate(portal.x, portal.y);
    ctx.scale(1, 0.55);
    for (let i = 0; i < 3; i++) {
      const a0 = t * (1.5 + i * 0.3) + i;
      ctx.strokeStyle = withAlpha(i % 2 ? "#b08ad4" : "#7ec8a0", 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, pr * (0.45 + i * 0.15), a0, a0 + 1.4);
      ctx.stroke();
    }
    ctx.restore();

    // Brass corner brackets
    ctx.strokeStyle = withAlpha(this.palette.accent, 0.5);
    ctx.lineWidth = 2;
    const L = 14;
    for (const [pt, sx, sy] of [
      [tl, 1, 1],
      [tr, -1, 1],
      [bl, 1, -1],
      [br, -1, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y + sy * L);
      ctx.lineTo(pt.x, pt.y);
      ctx.lineTo(pt.x + sx * L, pt.y);
      ctx.stroke();
    }
  }

  _drawBastion(W, H, t) {
    const ctx = this.ctx;
    const y0 = H * 0.58;
    const y1 = H * 0.72;
    const x0 = W * 0.04;
    const x1 = W * 0.96;

    // Rampart body
    const body = ctx.createLinearGradient(0, y0, 0, y1);
    body.addColorStop(0, "#4a5244");
    body.addColorStop(0.35, "#3a4038");
    body.addColorStop(1, "#2a2e28");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y0);
    ctx.lineTo(x1 + 6, y1);
    ctx.lineTo(x0 - 6, y1);
    ctx.closePath();
    ctx.fill();

    // Brass crown
    ctx.fillStyle = withAlpha(this.palette.accent, 0.55);
    ctx.fillRect(x0, y0, x1 - x0, (y1 - y0) * 0.28);

    // Ward glow
    const glow = 0.3 + 0.15 * Math.sin(t * 2.2);
    ctx.strokeStyle = withAlpha("#ff6b6b", glow);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + 2);
    ctx.lineTo(x1, y0 + 2);
    ctx.stroke();

    // Merlons
    const n = 9;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const x = x0 + (x1 - x0) * u;
      ctx.fillStyle = withAlpha(this.palette.accent, 0.75);
      ctx.beginPath();
      ctx.moveTo(x - 7, y0 + 1);
      ctx.lineTo(x - 4, y0 - 10);
      ctx.lineTo(x + 4, y0 - 10);
      ctx.lineTo(x + 7, y0 + 1);
      ctx.closePath();
      ctx.fill();
    }

    // Face under wall
    ctx.fillStyle = "#222620";
    ctx.fillRect(x0 - 4, y1, x1 - x0 + 8, H * 0.06);
  }

  _drawMotes(W, H) {
    const ctx = this.ctx;
    for (const m of this.motes) {
      const x = m.x * W;
      const y = m.y * H;
      const a = 0.15 + 0.2 * (0.5 + 0.5 * Math.sin(this.t * 2 + m.ph));
      ctx.fillStyle = m.warm
        ? withAlpha(this.palette.accent, a)
        : withAlpha("#9ab0a0", a * 0.7);
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _stroke(pts) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
}
