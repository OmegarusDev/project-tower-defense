/** Boot-baked PCM via Web Audio — SFX + Music buses on one AudioContext. */

export class SynthBank {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.ready = false;
    this.sfxVolume = 0.35;
    this.musicVolume = 0.4;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this._onVisibility = () => {
      if (!this.ctx) return;
      if (document.hidden) {
        if (this.ctx.state === "running") this.ctx.suspend().catch(() => {});
      } else {
        if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", this._onVisibility);
  }

  setVolume(v) {
    this.sfxVolume = Math.max(0, Math.min(1, Number(v) || 0));
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
  }

  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(1, Number(v) || 0));
    if (this.musicGain) this.musicGain.gain.value = this.musicVolume;
  }

  async ensure() {
    if (this.ready) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1;
    this.masterGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.masterGain);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.masterGain);

    const rate = this.ctx.sampleRate;
    this.buffers.ui = this._tone(rate, 280, 0.05, "sine", 0.015);
    this.buffers.confirm = this._tone(rate, 520, 0.1, "triangle", 0.012);
    this.buffers.place = this._noise(rate, 0.1, 0.01);
    this.buffers.sell = this._tone(rate, 220, 0.1, "triangle", 0.01);
    this.buffers.shot = this._tone(rate, 400, 0.04, "triangle", 0.005);
    this.buffers.hit = this._noise(rate, 0.05, 0.004);
    this.buffers.explode = this._noise(rate, 0.18, 0.01);
    this.buffers.wave = this._tone(rate, 330, 0.14, "triangle", 0.015);
    this.buffers.portal = this._tone(rate, 180, 0.28, "sawtooth", 0.03);
    this.ready = true;
  }

  /** Resume context after a user gesture / tab focus. */
  async resume() {
    await this.ensure();
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  async play(name, rate = 1, vol = 1) {
    if (typeof document !== "undefined" && document.hidden) return;
    await this.ensure();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const buf = this.buffers[name];
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = false;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.sfxGain);
    src.start();
  }

  _tone(sampleRate, freq, seconds, type, attack = 0.008) {
    const n = Math.floor(sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, n, sampleRate);
    const data = buf.getChannelData(0);
    const attackN = Math.floor(sampleRate * attack);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const env = (1 - i / n) ** 2;
      const att = attackN > 0 ? Math.min(1, i / attackN) : 1;
      let s = 0;
      const phase = t * freq;
      if (type === "square") s = phase % 1 < 0.5 ? 1 : -1;
      else if (type === "triangle") s = 4 * Math.abs((phase % 1) - 0.5) - 1;
      else if (type === "sawtooth") s = 2 * (phase % 1) - 1;
      else s = Math.sin(phase * Math.PI * 2);
      data[i] = s * env * att * 0.5;
    }
    return buf;
  }

  _noise(sampleRate, seconds, attack = 0.008) {
    const n = Math.floor(sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, n, sampleRate);
    const data = buf.getChannelData(0);
    const attackN = Math.floor(sampleRate * attack);
    for (let i = 0; i < n; i++) {
      const env = (1 - i / n) ** 2;
      const att = attackN > 0 ? Math.min(1, i / attackN) : 1;
      data[i] = (Math.random() * 2 - 1) * env * att * 0.35;
    }
    return buf;
  }
}
