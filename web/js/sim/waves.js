import { ENDLESS_GRID } from "../data/endlessGrid.js";
import { composeEndlessWave, resolveCampaignWave } from "../data/waveScripts.js";
import { enemyDef, resolveEnemyKind } from "../data/enemies.js";
import { mulberry32 } from "./rng.js";
import { INF } from "./boardGrid.js";

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
    this._portalRand = null;
    this._portalCycle = null;
    this._portalIdx = 0;
    this._portalTimer = 0;
    this._lastPortalX = -1;
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
    this._buildPortal(w);
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
      // Endless: the seam re-opens elsewhere after each dwell stretch
      if (this.world.modeEndless) {
        this._portalTimer -= this.world.dt;
        if (this._portalTimer <= 0) {
          this._portalTimer = this._dwellFor(this.world.waveIndex);
          this._portalIdx += 1;
          this._relocatePortal();
        }
      }
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
    const e = this.makeEnemy(kind, w, {
      speedMult: this._waveSpeedMult,
      pos: this._spawnPos(kind),
    });
    this.world.enemies.push(e);
    this.world.emit("enemy_spawned", { enemy: e });
  }

  /**
   * Spawn point for an enemy — the live portal cell, with a reachability guard.
   * If the portal's column is sealed (player walls), fall back to the first
   * reachable back-line cell (deterministic left-to-right scan), then the
   * canonical spawn. Air enemies use airDist (always reachable).
   */
  _spawnPos(kind) {
    const g = this.world.grid;
    const p = this.world.portal || { x: g.spawn.x, y: 0 };
    const dist = enemyDef(kind).flying ? g.airDist : g.groundDist;
    if (g.inBounds(p.x, p.y) && dist[g.idx(p.x, p.y)] < INF) {
      return { x: p.x + 0.5, y: p.y + 0.5 };
    }
    for (let x = 0; x < g.cols; x++) {
      if (dist[g.idx(x, 0)] < INF) return { x: x + 0.5, y: 0.5 };
    }
    return { x: g.spawn.x + 0.5, y: 0.5 };
  }

  /** Endless only: seeded back-line portal cycle + dwell schedule for a wave. */
  _buildPortal(w) {
    const world = this.world;
    if (!world.modeEndless) return;
    this._portalRand = mulberry32(((world.runSeed || 1) ^ (w * 0x9e3779b9) ^ 0x51ab3d) >>> 0);
    const cols = world.grid.cols;
    const cycle = [];
    for (let x = 0; x < cols; x++) cycle.push(x);
    for (let i = cycle.length - 1; i > 0; i--) {
      const j = (this._portalRand() * (i + 1)) | 0;
      const tmp = cycle[i];
      cycle[i] = cycle[j];
      cycle[j] = tmp;
    }
    this._portalCycle = cycle;
    this._portalIdx = 0;
    this._portalTimer = this._dwellFor(w);
    this._lastPortalX = -1;
    this._relocatePortal();
  }

  _relocatePortal() {
    const cycle = this._portalCycle || [];
    if (!cycle.length) return;
    let x = cycle[this._portalIdx % cycle.length];
    // Never sit on the same seam cell twice in a row (cycle wrap-around)
    if (x === this._lastPortalX) {
      this._portalIdx = (this._portalIdx + 1) % cycle.length;
      x = cycle[this._portalIdx % cycle.length];
    }
    this._lastPortalX = x;
    this.world.portal = { x, y: 0 };
    this.world.emit("portal_moved", { x, y: 0 });
  }

  /** Intensity curve: long dwells early, quicker re-opening as waves climb. */
  _dwellFor(w) {
    return Math.max(2.5, Math.min(8, 8 - 0.15 * (w - 1)));
  }

  /** Public factory — also used for nest-cask children. */
  makeEnemy(kind, wave, opts = {}) {
    const id = resolveEnemyKind(kind);
    const def = enemyDef(id);
    const w = Math.max(1, wave || 1);
    // HP curve: 5%/wave steady growth + late 2%/wave extra past 15 so late
    // endless outpaces meta investment. Endless only: a tighter opening
    // (waves 2-3 punch above the base) and a mid-game wall (waves 8-16) that
    // compensates the roaming-seam spread. Campaign keeps the classic curve.
    let scale =
      Math.pow(1.05, w - 1) *
      Math.pow(1.02, Math.max(0, w - 15)) *
      (opts.scale || 1);
    if (this.world.modeEndless) {
      scale *= Math.pow(1.08, Math.min(2, Math.max(0, w - 1)));
      scale *= Math.pow(1.025, Math.min(9, Math.max(0, w - 7)));
    }
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
      spawns: def.spawns || 0,
      spawnEvery: def.spawnEvery || 7,
      spawnKind: def.spawnKind || "mite",
      aura: def.aura ? { ...def.aura } : null,
      boss: !!def.boss,
      silhouette: def.silhouette || id,
      ignoreTowerAvoid: !!def.ignoreTowerAvoid,
      reachedExit: false,
      _hitFlash: 0,
      _regenAcc: 0,
      _empT: 0,
    };
    return e;
  }
}
