/**
 * Generative pressure bed — kick tempo rises with wave + enemy density.
 * Zero sample packs: synthesized kicks through SynthBank's AudioContext.
 */

export class ScoreEngine {
  constructor(synthBank) {
    this.synth = synthBank;
    this.wave = 1;
    this.speed = 1;
    this.running = false;
    this.density = 0;
    this._acc = 0;
    this._enabled = true;
  }

  async start() {
    this.running = true;
    this._acc = 0;
    if (this.synth) await this.synth.ensure();
  }

  stop() {
    this.running = false;
  }

  setWave(w) {
    this.wave = Math.max(1, w | 0);
  }

  setSpeed(s) {
    this.speed = Math.max(0.1, s);
  }

  setDensity(n) {
    this.density = Math.max(0, n | 0);
  }

  setEnabled(on) {
    this._enabled = !!on;
  }

  /** BPM-ish interval from wave + crowding. */
  _interval() {
    const base = Math.max(0.28, 0.72 - (this.wave - 1) * 0.018);
    const crowd = Math.min(0.22, this.density * 0.012);
    return Math.max(0.22, (base - crowd) / this.speed);
  }

  tick(dt) {
    if (!this.running || !this._enabled || document.hidden) return;
    this._acc += dt;
    const iv = this._interval();
    while (this._acc >= iv) {
      this._acc -= iv;
      this._kick();
    }
  }

  _kick() {
    const bank = this.synth;
    if (!bank?.ctx || !bank.ready) return;
    const ctx = bank.ctx;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const vol = (bank.sfxVolume ?? 0.35) * 0.45;
    osc.type = "sine";
    osc.frequency.setValueAtTime(118 + Math.min(40, this.wave), t0);
    osc.frequency.exponentialRampToValueAtTime(48, t0 + 0.12);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.16);
  }
}
