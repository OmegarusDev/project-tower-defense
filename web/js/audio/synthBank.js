/** Boot-baked PCM via Web Audio — no audio files. SFX only; no music. */

export class SynthBank {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.ready = false;
    this._onVisibility = () => {
      if (!this.ctx) return;
      if (document.hidden) {
        if (this.ctx.state === "running") this.ctx.suspend().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", this._onVisibility);
  }

  async ensure() {
    if (this.ready) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    const rate = this.ctx.sampleRate;
    this.buffers.ui = this._tone(rate, 880, 0.05, "square");
    this.buffers.confirm = this._tone(rate, 660, 0.07, "triangle");
    this.buffers.place = this._noise(rate, 0.08);
    this.buffers.sell = this._tone(rate, 220, 0.1, "sawtooth");
    this.buffers.shot = this._tone(rate, 520, 0.05, "square");
    this.buffers.hit = this._noise(rate, 0.04);
    this.buffers.explode = this._noise(rate, 0.16);
    this.buffers.wave = this._tone(rate, 330, 0.14, "triangle");
    this.ready = true;
  }

  async play(name, rate = 1) {
    if (document.hidden) return;
    await this.ensure();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const buf = this.buffers[name];
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = false;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = 0.35;
    src.connect(g).connect(this.ctx.destination);
    src.start();
  }

  _tone(sampleRate, freq, seconds, type) {
    const n = Math.floor(sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, n, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const env = (1 - i / n) ** 2;
      let s = 0;
      const phase = t * freq;
      if (type === "square") s = phase % 1 < 0.5 ? 1 : -1;
      else if (type === "triangle") s = 4 * Math.abs((phase % 1) - 0.5) - 1;
      else if (type === "sawtooth") s = 2 * (phase % 1) - 1;
      else s = Math.sin(phase * Math.PI * 2);
      data[i] = s * env * 0.6;
    }
    return buf;
  }

  _noise(sampleRate, seconds) {
    const n = Math.floor(sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, n, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const env = (1 - i / n) ** 2;
      data[i] = (Math.random() * 2 - 1) * env * 0.45;
    }
    return buf;
  }
}
