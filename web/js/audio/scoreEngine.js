/**
 * Generative ambient bed — layered retro pads + soft delay/shimmer + kick.
 * Routes through SynthBank Music bus (independent of SFX volume).
 *
 * Phases:
 *   "menu"        — calm ambient pad, no kick, dark filter
 *   "betweenWaves" — slightly brighter, kick at reduced rate
 *   "inWave"       — full intensity, fastest kick
 */

const PAD_NOTES = [
  [110, 164.81, 220], // A2 · E3 · A3 (Am)
  [130.81, 196, 261.63], // C3 · G3 · C4 (C)
  [98, 146.83, 196], // G2 · D3 · G3 (G)
  [82.41, 123.47, 164.81], // E2 · B2 · E3 (Em)
];

/* A minor pentatonic — the lead wanders this scale; it fits every chord above */
const LEAD_SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99];

export class ScoreEngine {
  constructor(synthBank) {
    this.synth = synthBank;
    this.wave = 1;
    this.waveOffset = 0;
    this.speed = 1;
    this.running = false;
    this.phase = "menu"; // menu | inWave | betweenWaves
    this._paused = false;
    this._enabled = true;
    this._acc = 0;
    this._nextKick = 0;
    this._nextLead = 0;
    this._leadIdx = 4;
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
    this._fadeTimer = null;
  }

  async start() {
    this._clearFadeTimer();
    if (this.synth) await this.synth.ensure();
    await this.synth?.resume?.();
    this._ensureGraph();
    if (!this.running) {
      // Fresh start: fade in from silence
      this.running = true;
      this._acc = 0;
      this._nextKick = 0;
      this._nextLead = 0;
      if (this._bedGain && this.synth?.ctx) {
        const t = this.synth.ctx.currentTime;
        this._bedGain.gain.setValueAtTime(0.0001, t);
        this._applyBedLevel(false);
      }
      this._applyDuck(true);
      this._nudgeFilter(true);
    } else {
      // Already running (e.g. menu→game): just update phase levels
      this._applyBedLevel();
      this._nudgeFilter();
    }
  }

  stop() {
    this.running = false;
    this._clearFadeTimer();
    this._teardownPads();
  }

  /** Smooth fade-out over `dur` seconds, then tear down. */
  fadeStop(dur = 1.2) {
    if (!this.running) return;
    if (!this._bedGain || !this.synth?.ctx) {
      this.stop();
      return;
    }
    this.running = false;
    const t = this.synth.ctx.currentTime;
    this._bedGain.gain.cancelScheduledValues(t);
    this._bedGain.gain.setValueAtTime(this._bedGain.gain.value, t);
    this._bedGain.gain.linearRampToValueAtTime(0.0001, t + dur);
    if (this._fxGain) {
      this._fxGain.gain.cancelScheduledValues(t);
      this._fxGain.gain.setValueAtTime(this._fxGain.gain.value, t);
      this._fxGain.gain.linearRampToValueAtTime(0.0001, t + dur);
    }
    this._clearFadeTimer();
    this._fadeTimer = setTimeout(() => {
      this._teardownPads();
      this._fadeTimer = null;
    }, dur * 1000 + 50);
  }

  /** Transition to menu phase (calm ambient, no kick). */
  toMenu() {
    this.phase = "menu";
    if (this.running) {
      this._applyBedLevel();
      this._nudgeFilter();
    }
  }

  setWave(w) {
    this.wave = Math.max(1, w | 0);
    this._retunePads();
  }

  setWaveOffset(offset) {
    this.waveOffset = Math.max(0, offset | 0);
  }

  setSpeed(s) {
    this.speed = Math.max(0.1, s);
  }

  setPhase(p) {
    if (p === "inWave") this.phase = "inWave";
    else if (p === "betweenWaves") this.phase = "betweenWaves";
    else this.phase = "menu";
    // Chord tied to wave state: chord 0 = calm (menu/between), chord 1 = active (inWave)
    const want = this.phase === "inWave" ? 1 : 0;
    if (this._chord !== want) {
      this._chord = want;
      this._chordT = 0;
      this._retunePads();
    }
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

  /** Kick interval — steady 4/4 at 120 BPM = 0.5s per beat; kick on every beat (four-on-the-floor). */
  _interval() {
    const bpm = 120;
    const beat = 60 / bpm; // 0.5s
    // During betweenWaves, half-time feel (kick on 1 and 3)
    const mult = this.phase === "betweenWaves" ? 2 : 1;
    return beat * mult / this.speed;
  }

  tick(dt) {
    if (!this.running || !this._enabled) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (!this.synth?.ctx || !this.synth.ready) return;

    this._chordT += dt;
    // During waves, cycle through chords for variety (every ~18s)
    // Between waves / menu, stay on chord 0
    if (this.phase === "inWave") {
      const chordSpeed = 18;
      if (this._chordT > chordSpeed / Math.max(0.5, this.speed)) {
        this._chordT = 0;
        // Rotate 1 → 2 → 3 → 1 (C, G, Em) during waves
        this._chord = (this._chord % 3) + 1;
        this._retunePads();
      }
    } else {
      this._chordT = 0;
      if (this._chord !== 0) {
        this._chord = 0;
        this._retunePads();
      }
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
    // Sparse generative lead
    while (this._nextLead <= now + 0.05) {
      if (this._nextLead < now - 0.02) this._nextLead = now;
      this._lead(this._nextLead);
      this._nextLead += this._leadInterval();
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
    this._bedGain.gain.value = 0.28;
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
    const voices = [
      { f: freqs[0] / 2, type: "sine", gain: 0.2, detune: 0 }, // sub-bass root
      { f: freqs[0], type: "triangle", gain: 0.2, detune: 0 },
      { f: freqs[1], type: "sawtooth", gain: 0.08, detune: -7 },
      { f: freqs[2], type: "sine", gain: 0.13, detune: 5 },
    ];
    for (const v of voices) {
      const osc = ctx.createOscillator();
      osc.type = v.type;
      osc.frequency.value = v.f;
      osc.detune.value = v.detune;
      const g = ctx.createGain();
      g.gain.value = v.gain;
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
    const targets = [freqs[0] / 2, freqs[0], freqs[1], freqs[2]];
    const t = ctx.currentTime;
    for (let i = 0; i < this._padNodes.length; i++) {
      const f = targets[i] || freqs[0];
      try {
        this._padNodes[i].osc.frequency.setTargetAtTime(f, t, 1.8);
      } catch (_) {
        /* */
      }
    }
  }

  _nudgeFilter(immediate = false) {
    if (!this._filter || !this.synth?.ctx) return;
    const effectiveWave = this.wave + this.waveOffset;
    const waveLift = Math.min(220, (effectiveWave - 1) * 12);
    let between;
    if (this.phase === "menu") between = -120;
    else if (this.phase === "betweenWaves") between = -80;
    else between = 40;
    const target = 520 + waveLift + between;
    const t = this.synth.ctx.currentTime;
    if (immediate) this._filter.frequency.setValueAtTime(target, t);
    else this._filter.frequency.setTargetAtTime(target, t, 1.2);
  }

  _applyBedLevel(immediate = false) {
    if (!this._bedGain || !this.synth?.ctx) return;
    const on = this.running && this._enabled;
    let mult;
    if (this.phase === "menu") mult = 0.65;
    else if (this.phase === "betweenWaves") mult = 0.86;
    else mult = 1;
    const target = on ? 0.28 * mult : 0.0001;
    const t = this.synth.ctx.currentTime;
    if (immediate) this._bedGain.gain.setValueAtTime(target, t);
    else this._bedGain.gain.setTargetAtTime(target, t, 0.35);
    if (this._fxGain) {
      const fx = on ? 0.20 * mult : 0.0001;
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
    if (this.phase === "menu") return; // no kick in menu
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

  _clearFadeTimer() {
    if (this._fadeTimer != null) {
      clearTimeout(this._fadeTimer);
      this._fadeTimer = null;
    }
  }

  /** Interval between lead notes — sparse; denser during waves, none in menu. */
  _leadInterval() {
    const base = this.phase === "inWave" ? 2.0 : 3.6;
    return base + Math.random() * 2.2;
  }

  /** Random-walk on the pentatonic scale — prefer small steps, occasional leap. */
  _pickLeadNote() {
    const n = LEAD_SCALE.length;
    const r = Math.random();
    let step;
    if (r < 0.5) step = Math.random() < 0.5 ? 1 : -1;
    else if (r < 0.8) step = Math.random() < 0.5 ? 2 : -2;
    else step = Math.random() < 0.5 ? 3 : -3;
    this._leadIdx = Math.max(0, Math.min(n - 1, this._leadIdx + step));
    return LEAD_SCALE[this._leadIdx];
  }

  _lead(when) {
    const ctx = this.synth?.ctx;
    if (!ctx || !this._filter) return;
    if (!this._enabled || this._paused) return;
    if (this.phase === "menu") return;
    const t0 = when ?? ctx.currentTime;
    const freq = this._pickLeadNote();
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.13, t0 + 0.28);
    g.gain.setValueAtTime(0.13, t0 + 1.4);
    g.gain.linearRampToValueAtTime(0.0001, t0 + 3.2);
    osc.connect(g).connect(this._filter);
    osc.start(t0);
    osc.stop(t0 + 3.4);
  }
}
