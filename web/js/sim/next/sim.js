/**
 * Pure sim facade — slice 1: waves/spawn/portal + movement/leaks. Exposes
 * the oracle's public surface for the parity harness (and later the app).
 * Combat/placement systems arrive in later slices; the interface grows
 * without changing existing behavior.
 */
import { createState, on, emit } from "./state.js";
import { startNextWave, tickWaves } from "./systems/waves.js";
import { tickEnemies } from "./systems/movement.js";

export class Sim {
  constructor() {
    this._s = null;
    this.dt = 1 / 60;
    this.grid = null;
    this.portal = null;
    this.enemies = [];
    this.towers = [];
    this.walls = [];
    this.economy = null;
    this.waveIndex = 0;
    this.running = false;
    this.modeEndless = true;
    this.runSeed = 1;
    this.leakCount = 0;
    this.killCount = 0;
    this.lives = 3;
    this.startLives = 3;
    this.tickIndex = 0;
  }

  setup(cols = 11, rows = 14, seed = 1, endless = true) {
    this._s = createState({ cols, rows, seed, endless });
    this.grid = this._s.grid;
    this.portal = this._s.portal;
    this.enemies = this._s.enemies;
    this.towers = this._s.towers;
    this.walls = this._s.walls;
    this.economy = this._s.economy;
    this.runSeed = this._s.runSeed;
    this.modeEndless = this._s.modeEndless;
    this.running = this._s.running;
    this.dt = this._s.dt;
    this.waveIndex = this._s.waves.index;
    this.leakCount = this._s.leakCount;
    this.killCount = this._s.killCount;
    this.lives = this._s.lives;
    this.startLives = this._s.startLives;
    this.tickIndex = this._s.tickIndex;
  }

  on(type, fn) {
    on(this._s, type, fn);
  }

  startWave({ earlyBonus = 0 } = {}) {
    const s = this._s;
    s.running = true;
    this.running = true;
    const nextWave = (s.waves.index | 0) + 1;
    let applied = 0;
    if (earlyBonus > 0 && s.earlyBonusWave !== nextWave) {
      s.earlyBonusWave = nextWave;
      s.economy.battle += earlyBonus;
      applied = earlyBonus;
    }
    startNextWave(s);
    s.running = this.running;
    this.waveIndex = s.waves.index;
    return { ok: true, wave: nextWave };
  }

  tick() {
    const s = this._s;
    if (!s.running) return;
    s.tickIndex += 1;
    this.tickIndex = s.tickIndex;
    tickWaves(s);
    tickEnemies(s);
    this.running = s.running;
    this.lives = s.lives;
    this.leakCount = s.leakCount;
    this.killCount = s.killCount;
    this.waveIndex = s.waves.index;
  }

  setStartLives(n, _opts) {
    const s = this._s;
    s.startLives = n;
    s.lives = n;
    this.startLives = n;
    this.lives = n;
  }
}
