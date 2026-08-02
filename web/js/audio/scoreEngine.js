/** Score / music engine (disabled).
 *  Kept wired for a later ambient pass — all methods are silent no-ops. */

export class ScoreEngine {
  constructor(_synthBank) {
    this.wave = 1;
    this.speed = 1;
    this.running = false;
  }

  async start() {
    /* music off */
  }

  stop() {
    this.running = false;
  }

  setWave(w) {
    this.wave = Math.max(1, w);
  }

  setSpeed(s) {
    this.speed = Math.max(0.1, s);
  }

  tick(_dt) {
    /* music off */
  }
}
