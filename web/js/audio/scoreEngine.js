/** Ambient pad + kick on sim clock. */

export class ScoreEngine {
  constructor(synthBank) {
    this.synth = synthBank;
    this.wave = 1;
    this.speed = 1;
    this.running = false;
    this.accum = 0;
    this.beatPeriod = 0.5;
    this._padTimer = null;
  }

  async start() {
    await this.synth.ensure();
    this.running = true;
    this._updateTempo();
    this._hum();
  }

  setWave(w) {
    this.wave = Math.max(1, w);
    this._updateTempo();
  }

  setSpeed(s) {
    this.speed = Math.max(0.1, s);
  }

  tick(dt) {
    if (!this.running) return;
    this.accum += dt * this.speed;
    if (this.accum >= this.beatPeriod) {
      this.accum %= this.beatPeriod;
      this.synth.play("hit", 0.55); // soft kick stand-in
    }
  }

  _updateTempo() {
    const bpm = Math.min(168, 96 + (this.wave - 1) * 2.5);
    this.beatPeriod = 60 / bpm;
  }

  async _hum() {
    // Low continuous-ish pulse via repeating soft confirm
    if (!this.running) return;
    await this.synth.play("confirm", 0.35);
    this._padTimer = setTimeout(() => this._hum(), 2000);
  }

  stop() {
    this.running = false;
    if (this._padTimer) clearTimeout(this._padTimer);
  }
}
