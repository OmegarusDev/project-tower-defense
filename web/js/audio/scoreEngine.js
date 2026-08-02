/** Generative peaceful ambient chords — no beat, no SFX reuse.
 *  Music is off for now; flip ENABLED when bringing the score back. */
const ENABLED = false;

const A4 = 440;
const SEMI = 2 ** (1 / 12);

/** Quiet diatonic palette in A minor / C major family (MIDI-ish note numbers). */
const CHORDS = [
  [57, 60, 64], // Am
  [60, 64, 67], // C
  [53, 57, 60], // F
  [55, 59, 62], // G
  [52, 55, 59], // Em
  [50, 53, 57], // Dm
  [57, 60, 64, 67], // Am7
  [60, 64, 67, 71], // Cmaj7
  [53, 57, 60, 64], // Fmaj7
  [55, 59, 62, 67], // Gadd9-ish
];

function midiToHz(m) {
  return A4 * SEMI ** (m - 69);
}

export class ScoreEngine {
  constructor(synthBank) {
    this.synth = synthBank;
    this.wave = 1;
    this.speed = 1;
    this.running = false;
    this.accum = 0;
    this.chordPeriod = 8.5;
    this._chordIndex = 0;
    this._voices = [];
    this._master = null;
    this._filter = null;
    this._started = false;
  }

  async start() {
    if (!ENABLED) return;
    await this.synth.ensure();
    const ctx = this.synth.ctx;
    if (ctx.state === "suspended") await ctx.resume();

    if (!this._started) {
      this._master = ctx.createGain();
      this._master.gain.value = 0;
      this._filter = ctx.createBiquadFilter();
      this._filter.type = "lowpass";
      this._filter.frequency.value = 900;
      this._filter.Q.value = 0.4;
      this._filter.connect(this._master).connect(ctx.destination);
      this._started = true;
    }

    this.running = true;
    this.accum = this.chordPeriod; // first chord immediately
    this._fadeMaster(0.09, 2.5);
    this.tick(0);
  }

  setWave(w) {
    this.wave = Math.max(1, w);
    // Stay peaceful: only nudge how often chords drift.
    this.chordPeriod = Math.max(6.5, 9.2 - Math.min(this.wave, 12) * 0.12);
    if (this._filter) {
      const ctx = this.synth.ctx;
      const t = ctx.currentTime;
      const bright = 820 + Math.min(this.wave, 20) * 18;
      this._filter.frequency.cancelScheduledValues(t);
      this._filter.frequency.setTargetAtTime(bright, t, 1.8);
    }
  }

  setSpeed(_s) {
    // Ambient stays calm; game speed does not drive the pad.
    this.speed = 1;
  }

  tick(dt) {
    if (!this.running || !this._started) return;
    this.accum += dt;
    if (this.accum < this.chordPeriod) return;
    this.accum = 0;
    this._playNextChord();
  }

  stop() {
    this.running = false;
    this._fadeMaster(0, 1.2);
    this._releaseVoices(1.0);
  }

  _fadeMaster(target, seconds) {
    if (!this._master || !this.synth.ctx) return;
    const g = this._master.gain;
    const t = this.synth.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(target, t + Math.max(0.05, seconds));
  }

  _playNextChord() {
    const next = this._pickChord();
    this._chordIndex = next;
    const notes = CHORDS[next];
    this._releaseVoices(3.2);
    this._voices = notes.map((m, i) => this._spawnVoice(midiToHz(m), i, notes.length));
  }

  _pickChord() {
    // Soft generative walk: prefer neighbors, occasional skip, rare repeat.
    const n = CHORDS.length;
    const roll = Math.random();
    if (roll < 0.12) return this._chordIndex;
    if (roll < 0.55) return (this._chordIndex + 1) % n;
    if (roll < 0.8) return (this._chordIndex + n - 1) % n;
    if (roll < 0.92) return (this._chordIndex + 2) % n;
    return (Math.random() * n) | 0;
  }

  _spawnVoice(freq, index, count) {
    const ctx = this.synth.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const detune = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = index % 2 === 0 ? "sine" : "triangle";
    detune.type = "sine";
    osc.frequency.value = freq;
    detune.frequency.value = freq * (1 + (index % 2 === 0 ? 0.0035 : -0.0028));

    // Quiet per-voice level; spread slightly across the chord.
    const voiceGain = (0.045 / Math.sqrt(count)) * (1 - index * 0.04);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(voiceGain, t + 2.8 + index * 0.15);

    osc.connect(g);
    detune.connect(g);
    g.connect(this._filter);

    osc.start(t);
    detune.start(t);

    return { osc, detune, g };
  }

  _releaseVoices(seconds) {
    if (!this.synth.ctx) return;
    const t = this.synth.ctx.currentTime;
    const release = Math.max(0.2, seconds);
    for (const v of this._voices) {
      try {
        const cur = v.g.gain.value;
        v.g.gain.cancelScheduledValues(t);
        v.g.gain.setValueAtTime(cur, t);
        v.g.gain.linearRampToValueAtTime(0, t + release);
        v.osc.stop(t + release + 0.05);
        v.detune.stop(t + release + 0.05);
      } catch {
        /* already stopped */
      }
    }
    this._voices = [];
  }
}
