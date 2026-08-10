import { ENDLESS_GRID } from "../data/endlessGrid.js";
import { composeEndlessWave, resolveCampaignWave } from "../data/waveScripts.js";
import { enemyDef, resolveEnemyKind } from "../data/enemies.js";
import { mulberry32 } from "./rng.js";

export class WaveManager {
  constructor(world) {
    this.world = world;
    this.spawnTimer = 0;
    this.toSpawn = 0;
    this.waveActive = false;
    this._queue = [];
    this._spawnGap = 0.4;
    this._waveSpeedMult = 1;
    this._rand = null;
    this.lastTheme = "";
    this.lastEvent = "";
  }

  startNextWave() {
    this.world.waveIndex += 1;
    const w = this.world.waveIndex;
    this._rand = mulberry32(((this.world.runSeed || 1) ^ (w * 0x9e3779b9)) >>> 0);
    const plan = this._planWave(w);
    this._queue = plan.queue.slice();
    this._spawnGap = plan.spawnGap;
    this._waveSpeedMult = plan.speedMult != null ? plan.speedMult : 1;
    this.lastTheme = plan.theme || "";
    this.lastEvent = plan.event || "";
    this.toSpawn = this._queue.length;
    this.spawnTimer = Math.min(0.2, this._spawnGap);
    this.waveActive = true;
    this.world.emit("wave_checkpoint", { wave: w });
    this.world.emit("wave_composition", {
      count: this.toSpawn,
      wave: w,
      theme: this.lastTheme,
      event: this.lastEvent,
    });
  }

  tick() {
    if (!this.waveActive) return;
    if (this.toSpawn > 0) {
      this.spawnTimer -= this.world.dt;
      if (this.spawnTimer <= 0) {
        this._spawnOne();
        this.toSpawn -= 1;
        const jitter =
          this.world.modeEndless && this._rand ? 0.85 + this._rand() * 0.35 : 1;
        this.spawnTimer = this._spawnGap * jitter;
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

  _planWave(w) {
    if (this.world.modeEndless) {
      return composeEndlessWave(w, this._rand);
    }
    const list = this.world.campaignWaves;
    const def = Array.isArray(list) ? list[w - 1] : null;
    const resolved = resolveCampaignWave(def, w);
    return { ...resolved, theme: "campaign" };
  }

  _spawnOne() {
    const w = this.world.waveIndex;
    const kind = this._queue.shift() || "mite";
    const e = this.makeEnemy(kind, w, { speedMult: this._waveSpeedMult });
    this.world.enemies.push(e);
    this.world.emit("enemy_spawned", { enemy: e });
  }

  /** Public factory — also used for nest-cask children. */
  makeEnemy(kind, wave, opts = {}) {
    const id = resolveEnemyKind(kind);
    const def = enemyDef(id);
    const w = Math.max(1, wave || 1);
    const scale = Math.pow(1.05, w - 1) * (opts.scale || 1);
    // Endless: mild speed ramp; heavies take less of it. Campaign: authored speedMult.
    let speedMult = opts.speedMult != null ? opts.speedMult : this._waveSpeedMult || 1;
    if (this.world.modeEndless) {
      const ramp = Math.min(0.45, (w - 1) * 0.015);
      const ballast = def.ballast || "mid";
      const share = ballast === "high" ? 0.45 : ballast === "low" ? 1.15 : 1;
      speedMult = 1 + ramp * share;
    }
    const spawn = opts.pos || {
      x: this.world.grid.spawn.x + 0.5,
      y: this.world.grid.spawn.y + 0.5,
    };
    const cell = opts.cell || { x: this.world.grid.spawn.x, y: this.world.grid.spawn.y };
    const e = {
      id: this.world.allocId(),
      kind: id,
      cell: { x: cell.x, y: cell.y },
      pos: { x: spawn.x, y: spawn.y },
      hp: def.hp * scale,
      maxHp: def.hp * scale,
      speed: def.speed * speedMult,
      flying: !!def.flying,
      leakDamage: def.leakDamage ?? 1,
      battleDrop: def.battleDrop ?? 2,
      armorFlat: def.armorFlat || 0,
      armorKind: def.armorKind || "none",
      energyBlock: !!def.energyBlock,
      ballast: def.ballast || "mid",
      resist: { ...(def.resist || {}) },
      immune: [...(def.immune || [])],
      shieldHp: (def.shieldHp || 0) * scale,
      splitsInto: def.splitsInto || 0,
      splitKind: def.splitKind || "mite",
      regen: def.regen || 0,
      boss: !!def.boss,
      silhouette: def.silhouette || id,
      reachedExit: false,
      _hitFlash: 0,
      _regenAcc: 0,
      _empT: 0,
    };
    return e;
  }
}
