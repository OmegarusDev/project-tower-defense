/**
 * Generative ambient bed — layered retro pads + soft delay/shimmer + kick.
 * Routes through SynthBank Music bus (independent of SFX volume).
 */

const PAD_NOTES = [
  [110, 164.81, 220], // A2 · E3 · A3
  [130.81, 196, 261.63], // C3 · G3 · C4
  [98, 146.83, 196], // G2 · D3 · G3
  [82.41, 123.47, 164.81], // E2 · B2 · E3
];

export class ScoreEngine {
  constructor(synthBank) {
    this.synth = synthBank;
    this.wave = 1;
    this.speed = 1;
    this.running = false;
    this.density = 0;
    this.phase = "betweenWaves"; // inWave | betweenWaves
    this._paused = false;
    this._enabled = true;
    this._acc = 0;
    this._nextKick = 0;
    this._padNodes = [];
    this._lfo = null;
    this._filter = null;
    this._delay = null;
    this._fxGain = null;
    this._bedGain = null;
    this._duckGain = null;
    this._chord = 0;
    this._chordT = 0;
    this._built = false;
  }

  async start() {
    this.running = true;
    this._acc = 0;
    this._nextKick = 0;
    if (this.synth) await this.synth.ensure();
    await this.synth?.resume?.();
    this._ensureGraph();
    this._applyBedLevel(true);
    this._applyDuck(true);
  }

  stop() {
    this.running = false;
    this._teardownPads();
  }

  setWave(w) {
    this.wave = Math.max(1, w | 0);
    this._retunePads();
  }

  setSpeed(s) {
    this.speed = Math.max(0.1, s);
  }

  setDensity(n) {
    this.density = Math.max(0, n | 0);
    this._nudgeFilter();
  }

  setPhase(p) {
    this.phase = p === "inWave" ? "inWave" : "betweenWaves";
    this._applyBedLevel();
    this._nudgeFilter();
  }

  setPaused(on) {
    this._paused = !!on;
    this._applyDuck();
  }

  setEnabled(on) {
    this._enabled = !!on;
    this._applyBedLevel();
  }

  setMusicVolume(v) {
    this.synth?.setMusicVolume?.(v);
  }

  /** Kick interval from wave + crowding + phase. */
  _interval() {
    const base = Math.max(0.32, 0.918 - (this.wave - 1) * 0.0084);
    const crowd = Math.min(0.18, this.density * 0.01);
    const between = this.phase === "betweenWaves" ? 1.18 : 1;
    return Math.max(0.26, ((base - crowd) * between) / this.speed);
  }

  tick(dt) {
    if (!this.running || !this._enabled) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (!this.synth?.ctx || !this.synth.ready) return;

    this._chordT += dt;
    if (this._chordT > 14 / Math.max(0.5, this.speed)) {
      this._chordT = 0;
      this._chord = (this._chord + 1) % PAD_NOTES.length;
      this._retunePads();
    }

    // Soft LFO motion on filter
    if (this._filter && this._lfo) {
      // LFO already wired; density/phase nudge cutoff separately
    }

    this._acc += dt;
    const iv = this._interval();
    // Look-ahead scheduling against AudioContext clock
    const ctx = this.synth.ctx;
    const now = ctx.currentTime;
    while (this._nextKick <= now + 0.05) {
      if (this._nextKick < now - 0.02) this._nextKick = now;
      this._kick(this._nextKick);
      this._nextKick += iv;
    }
  }

  _ensureGraph() {
    const bank = this.synth;
    if (!bank?.ctx || !bank.ready || this._built) {
      if (this._built && this._padNodes.length === 0) this._spawnPads();
      return;
    }
    const ctx = bank.ctx;

    this._duckGain = ctx.createGain();
    this._duckGain.gain.value = 1;
    this._duckGain.connect(bank.musicGain);

    this._bedGain = ctx.createGain();
    this._bedGain.gain.value = 0.22;
    this._bedGain.connect(this._duckGain);

    this._filter = ctx.createBiquadFilter();
    this._filter.type = "lowpass";
    this._filter.frequency.value = 680;
    this._filter.Q.value = 0.7;
    this._filter.connect(this._bedGain);

    // Soft delay / shimmer send
    this._delay = ctx.createDelay(1.5);
    this._delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const shimmer = ctx.createBiquadFilter();
    shimmer.type = "highpass";
    shimmer.frequency.value = 420;
    this._fxGain = ctx.createGain();
    this._fxGain.gain.value = 0.18;
    this._filter.connect(this._delay);
    this._delay.connect(fb);
    fb.connect(this._delay);
    this._delay.connect(shimmer);
    shimmer.connect(this._fxGain);
    this._fxGain.connect(this._duckGain);

    // Slow cutoff motion
    this._lfo = ctx.createOscillator();
    this._lfo.type = "sine";
    this._lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    this._lfo.connect(lfoGain);
    lfoGain.connect(this._filter.frequency);
    this._lfo.start();

    this._built = true;
    this._spawnPads();
    this._nudgeFilter(true);
    this._applyBedLevel(true);
    this._applyDuck(true);
  }

  _spawnPads() {
    this._teardownPads(false);
    const ctx = this.synth?.ctx;
    if (!ctx || !this._filter) return;
    const freqs = PAD_NOTES[this._chord] || PAD_NOTES[0];
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "triangle" : i === 1 ? "sawtooth" : "sine";
      osc.frequency.value = freqs[i];
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.22 : i === 1 ? 0.09 : 0.14;
      // Detune upper voices slightly for width
      if (i > 0) osc.detune.value = i === 1 ? -7 : 5;
      osc.connect(g);
      g.connect(this._filter);
      osc.start();
      this._padNodes.push({ osc, g });
    }
  }

  _teardownPads(full = true) {
    for (const n of this._padNodes) {
      try {
        n.osc.stop();
        n.osc.disconnect();
        n.g.disconnect();
      } catch (_) {
        /* already stopped */
      }
    }
    this._padNodes = [];
    if (full && this._built) {
      try {
        this._lfo?.stop();
      } catch (_) {
        /* */
      }
      try {
        this._filter?.disconnect();
        this._delay?.disconnect();
        this._fxGain?.disconnect();
        this._bedGain?.disconnect();
        this._duckGain?.disconnect();
      } catch (_) {
        /* */
      }
      this._lfo = null;
      this._filter = null;
      this._delay = null;
      this._fxGain = null;
      this._bedGain = null;
      this._duckGain = null;
      this._built = false;
    }
  }

  _retunePads() {
    const freqs = PAD_NOTES[this._chord] || PAD_NOTES[0];
    const ctx = this.synth?.ctx;
    if (!ctx || this._padNodes.length === 0) {
      if (this._built) this._spawnPads();
      return;
    }
    const t = ctx.currentTime;
    for (let i = 0; i < this._padNodes.length; i++) {
      const f = freqs[i] || freqs[0];
      try {
        this._padNodes[i].osc.frequency.setTargetAtTime(f, t, 1.8);
      } catch (_) {
        /* */
      }
    }
  }

  _nudgeFilter(immediate = false) {
    if (!this._filter || !this.synth?.ctx) return;
    const waveLift = Math.min(220, (this.wave - 1) * 12);
    const dens = Math.min(160, this.density * 6);
    const between = this.phase === "betweenWaves" ? -80 : 40;
    const target = 520 + waveLift + dens + between;
    const t = this.synth.ctx.currentTime;
    if (immediate) this._filter.frequency.setValueAtTime(target, t);
    else this._filter.frequency.setTargetAtTime(target, t, 1.2);
  }

  _applyBedLevel(immediate = false) {
    if (!this._bedGain || !this.synth?.ctx) return;
    const on = this.running && this._enabled;
    const between = this.phase === "betweenWaves" ? 0.86 : 1;
    const target = on ? 0.22 * between : 0.0001;
    const t = this.synth.ctx.currentTime;
    if (immediate) this._bedGain.gain.setValueAtTime(target, t);
    else this._bedGain.gain.setTargetAtTime(target, t, 0.35);
    if (this._fxGain) {
      const fx = on ? 0.16 * between : 0.0001;
      if (immediate) this._fxGain.gain.setValueAtTime(fx, t);
      else this._fxGain.gain.setTargetAtTime(fx, t, 0.4);
    }
  }

  _applyDuck(immediate = false) {
    if (!this._duckGain || !this.synth?.ctx) return;
    const target = this._paused ? 0.12 : 1;
    const t = this.synth.ctx.currentTime;
    if (immediate) this._duckGain.gain.setValueAtTime(target, t);
    else this._duckGain.gain.setTargetAtTime(target, t, 0.18);
  }

  _kick(when) {
    const bank = this.synth;
    if (!bank?.ctx || !bank.ready || !this._duckGain) return;
    if (!this._enabled || this._paused) return;
    const ctx = bank.ctx;
    const t0 = when ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const vol = 0.28;
    osc.type = "sine";
    const f0 = 108 + Math.min(36, this.wave * 0.8);
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(42, t0 + 0.14);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
    osc.connect(g).connect(this._duckGain);
    osc.start(t0);
    osc.stop(t0 + 0.18);
  }
}
