import { ENDLESS_GRID } from "../data/endlessGrid.js";
import { WAVE_SCRIPTS, endlessScriptId } from "../data/waveScripts.js";
import { mulberry32 } from "./rng.js";

export class WaveManager {
  constructor(world) {
    this.world = world;
    this.spawnTimer = 0;
    this.toSpawn = 0;
    this.waveActive = false;
    this._queue = [];
    this._rand = null;
  }

  _rng() {
    if (!this._rand) {
      const seed = (this.world.runSeed || 1) ^ ((this.world.waveIndex || 1) * 0x9e3779b9);
      this._rand = mulberry32(seed >>> 0);
    }
    return this._rand;
  }

  startNextWave() {
    this.world.waveIndex += 1;
    const w = this.world.waveIndex;
    this._rand = mulberry32(((this.world.runSeed || 1) ^ (w * 0x9e3779b9)) >>> 0);
    this._queue = this._buildQueue(w);
    this.toSpawn = this._queue.length;
    this.spawnTimer = 0.15;
    this.waveActive = true;
    this.world.emit("wave_checkpoint", { wave: w });
    this.world.emit("wave_composition", { count: this.toSpawn, wave: w });
  }

  tick() {
    if (!this.waveActive) return;
    if (this.toSpawn > 0) {
      this.spawnTimer -= this.world.dt;
      if (this.spawnTimer <= 0) {
        this._spawnOne();
        this.toSpawn -= 1;
        this.spawnTimer = Math.max(0.25, 1.0 * Math.pow(0.97, this.world.waveIndex - 1));
      }
    } else if (this.world.enemies.length === 0) {
      this.waveActive = false;
      const wave = this.world.waveIndex;
      const rewards = this.world.economy.applyWaveClear(wave);
      this.world.emit("wave_cleared", { wave, ...rewards });
      if (
        !this.world.modeEndless &&
        this.world.wavesToWin > 0 &&
        wave >= this.world.wavesToWin
      ) {
        this.world.running = false;
        this.world.emit("victory", { wave, levelId: this.world.campaignLevelId });
        return;
      }
      if (
        this.world.modeEndless &&
        wave > 0 &&
        wave % ENDLESS_GRID.growEvery === 0 &&
        this.world.grid.rows < ENDLESS_GRID.maxRows
      ) {
        this.world.growSouth(ENDLESS_GRID.growBy);
      }
    }
  }

  _scriptForWave(w) {
    const id = this.world.waveScriptId || (this.world.modeEndless ? endlessScriptId(w) : null);
    if (id && WAVE_SCRIPTS[id]) return WAVE_SCRIPTS[id];
    const scripts = this.world.campaignWaveScripts;
    if (Array.isArray(scripts) && scripts[w - 1] && WAVE_SCRIPTS[scripts[w - 1]]) {
      return WAVE_SCRIPTS[scripts[w - 1]];
    }
    return WAVE_SCRIPTS[endlessScriptId(w)] || WAVE_SCRIPTS.mixed_early;
  }

  _buildQueue(w) {
    const script = this._scriptForWave(w);
    const count = Math.max(1, (script.count(w) | 0));
    const queue = [];
    for (let i = 0; i < count; i++) queue.push(this._pickKind(script));
    if (script.guaranteeBoss && !queue.includes("boss")) {
      queue[queue.length - 1] = "boss";
    }
    return queue;
  }

  _pickKind(script) {
    const rand = this._rng();
    const kinds = script.kinds || [{ kind: "basic", w: 1 }];
    let total = 0;
    for (const k of kinds) total += k.w;
    let roll = rand() * total;
    for (const k of kinds) {
      roll -= k.w;
      if (roll <= 0) return k.kind;
    }
    return kinds[kinds.length - 1].kind;
  }

  _spawnOne() {
    const w = this.world.waveIndex;
    const kind = this._queue.shift() || "basic";
    const e = this.makeEnemy(kind, w);
    this.world.enemies.push(e);
    this.world.emit("enemy_spawned", { enemy: e });
  }

  /** Public factory — also used for splitter children. */
  makeEnemy(kind, wave, opts = {}) {
    const scale = Math.pow(1.05, (wave || 1) - 1) * (opts.scale || 1);
    const spawn = opts.pos || {
      x: this.world.grid.spawn.x + 0.5,
      y: this.world.grid.spawn.y + 0.5,
    };
    const cell = opts.cell || { x: this.world.grid.spawn.x, y: this.world.grid.spawn.y };
    const e = {
      id: this.world.allocId(),
      kind,
      cell: { x: cell.x, y: cell.y },
      pos: { x: spawn.x, y: spawn.y },
      hp: 28 * scale,
      maxHp: 28 * scale,
      speed: 0.85,
      flying: false,
      leakDamage: 1,
      battleDrop: 2,
      armorFlat: 0,
      resist: {},
      immune: [],
      shieldHp: 0,
      splitsInto: 0,
      reachedExit: false,
      _hitFlash: 0,
    };
    if (kind === "heavy") {
      e.hp = e.maxHp = 70 * scale;
      e.speed = 0.45;
      e.leakDamage = 2;
      e.battleDrop = 3;
      e.armorFlat = 2;
    } else if (kind === "fast") {
      e.hp = e.maxHp = 16 * scale;
      e.speed = 1.45;
      e.battleDrop = 2;
    } else if (kind === "flying") {
      e.flying = true;
      e.hp = e.maxHp = 20 * scale;
      e.speed = 1.0;
      e.battleDrop = 2;
    } else if (kind === "shielded") {
      e.hp = e.maxHp = 36 * scale;
      e.speed = 0.7;
      e.shieldHp = 22 * scale;
      e.armorFlat = 1;
      e.resist = { kinetic: 0.25 };
      e.battleDrop = 3;
      e.leakDamage = 2;
    } else if (kind === "splitter") {
      e.hp = e.maxHp = 40 * scale;
      e.speed = 0.75;
      e.splitsInto = 2;
      e.battleDrop = 3;
      e.leakDamage = 2;
    } else if (kind === "boss") {
      e.hp = e.maxHp = 220 * scale;
      e.speed = 0.38;
      e.leakDamage = 4;
      e.battleDrop = 12;
      e.armorFlat = 4;
      e.resist = { fire: 0.2, poison: 0.2 };
      e.immune = [];
    }
    return e;
  }
}
