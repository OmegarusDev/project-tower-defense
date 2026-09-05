/**
 * Sim facade — the app/bot/harness entry point over plain-data state;
 * systems functions do the work, this class only adapts and guards.
 *
 * Single source of truth is `this._s`. All public fields (`lives`,
 * `waveIndex`, `running`, …) are accessors that proxy to `_s` with a
 * fallback before `setup()` / after a reset. The former `init` + double
 * defineProperties duplication is removed — there is one write path.
 */
import { createState, on, emit, logAction } from "./state.js";
import { BASE_START_LIVES } from "../../data/techTree.js";
import { defaultSlots, makeSlot } from "../../data/parts.js";
import { migratePartId } from "../../saveStore.migrations.js";
import { startNextWave, tickWaves } from "./systems/waves.js";
import { tickCombat, invalidatePlans } from "./systems/combat.js";
import { tickEnemies } from "./systems/movement.js";
import {
  quoteTowerPlace,
  placeSurcharge,
  towerCost,
  wallCost,
  spendBattle,
  addBattle,
  applyRunMods,
  injectMeta,
} from "./systems/economy.js";
import { stallsAt as stallsAtFn } from "./systems/towers.js";
import {
  tryPlaceTower,
  tryPlaceWall,
  trySellTower,
  trySellWall,
  tryChooseLevelBranch,
  playerWallCount,
  applyPreWalls,
} from "./systems/towers.js";

export const TICK_HZ = 60;
export const TICK_DT = 1 / TICK_HZ;

// using direct _s instead of fallback because Sim is always setup before use — one layer, no second guesses
export class Sim {
  constructor() {
    this._s = null;
    this.dt = 1 / 60;
    this.grid = null;
    this.runSeed = 1;
    this.modeEndless = true;
    // using eager setup instead of fallback because Sim should always be valid — one layer, no null checks
    this.setup(11, 14, 1, true);
    this.campaignWaves = null;
    this.wavesToWin = 0;
    this.campaignLevelId = 0;

    // Single proxy objects — created once, not per setup().
    // Arrow getters close over `self` so `this` inside the literal is not the literal.
    const self = this;
    // using direct _s instead of fallback because Sim is always setup before use
    this.waves = {
      get waveActive() { return self._s.waves.active; },
      set waveActive(v) { self._s.waves.active = v; },
      get toSpawn() { return self._s.waves.toSpawn; },
      set toSpawn(v) { self._s.waves.toSpawn = v; },
      get queue() { return self._s.waves.queue; },
      set queue(v) { self._s.waves.queue = v; },
      get lastTheme() { return self._s.waves.theme; },
      get speedMult() { return self._s.waves.speedMult; },
      get lastEvent() { return self._s.waves.event; },
    };
    this.economy = {
      get battle() { return self._s.economy.battle; },
      set battle(v) { self._s.economy.battle = v; },
      get forge() { return self._s.economy.forge; },
      set forge(v) { self._s.economy.forge = v; },
      get aether() { return self._s.economy.aether; },
      set aether(v) { self._s.economy.aether = v; },
      get runWaveGains() { return self._s.economy.runWaveGains; },
      get towerCostMult() { return self._s.economy.towerCostMult; },
      get wallCostMult() { return self._s.economy.wallCostMult; },
      quoteTowerPlace: (pc, tc) => quoteTowerPlace(self._s.economy, pc, tc),
      placeSurcharge: (b, c) => placeSurcharge(self._s.economy, b, c),
      towerCost: (b) => towerCost(self._s.economy, b),
      wallCost: (o) => wallCost(self._s.economy, o),
      spendBattle: (n) => spendBattle(self._s.economy, n),
      addBattle: (n) => addBattle(self._s.economy, n),
      applyRunMods: (m) => applyRunMods(self._s.economy, m),
      injectMeta: (f, a) => injectMeta(self._s.economy, f, a),
    };
  }

  // ---- proxied scalars (single source: _s, no fallback) ----

  get lives() { return this._s.lives; }
  set lives(v) { this._s.lives = v; }
  get startLives() { return this._s.startLives; }
  set startLives(v) { this._s.startLives = v; }
  get leakCount() { return this._s.leakCount; }
  set leakCount(v) { this._s.leakCount = v; }
  get killCount() { return this._s.killCount; }
  set killCount(v) { this._s.killCount = v; }
  get tickIndex() { return this._s.tickIndex; }
  set tickIndex(v) { this._s.tickIndex = v; }
  get waveIndex() { return this._s.waves.index; }
  set waveIndex(v) { this._s.waves.index = v; }
  get running() { return this._s.running; }
  set running(v) { this._s.running = v; }
  get runLevelCap() { return this._s.runLevelCap; }
  set runLevelCap(v) { this._s.runLevelCap = v; }
  get checkpointPhase() { return this._s.checkpointPhase; }
  set checkpointPhase(v) { this._s.checkpointPhase = v; }
  get earlyBonusWave() { return this._s.earlyBonusWave; }
  set earlyBonusWave(v) { this._s.earlyBonusWave = v; }
  get seed() { return this._s.seed; }
  set seed(v) { this._s.seed = v; }

  get portal() { return this._s.portal; }
  set portal(v) { this._s.portal = v; }
  get enemies() { return this._s.enemies; }
  set enemies(v) { this._s.enemies = v; }
  get towers() { return this._s.towers; }
  set towers(v) { this._s.towers = v; }
  get walls() { return this._s.walls; }
  set walls(v) { this._s.walls = v; }
  get projectiles() { return this._s.projectiles; }
  set projectiles(v) { this._s.projectiles = v; }
  get roster() { return this._s.roster; }
  set roster(v) { this._s.roster = v; }
  get actionLog() { return this._s.actionLog; }
  set actionLog(v) { this._s.actionLog = v; }

  get campaignWaves() { return this._s.campaignWaves; }
  set campaignWaves(v) { this._s.campaignWaves = v; }
  get wavesToWin() { return this._s.wavesToWin; }
  set wavesToWin(v) { this._s.wavesToWin = v; }
  get campaignLevelId() { return this._s.campaignLevelId; }
  set campaignLevelId(v) { this._s.campaignLevelId = v; }

  on(type, fn) {
    on(this._s, type, fn);
  }

  logAction(type, data = {}) {
    logAction(this._s, type, data);
  }

  setup(cols = 11, rows = 14, seed = 1, endless = true) {
    const s = createState({ cols, rows, seed, endless });
    this._s = s;
    this.grid = s.grid;
    this.runSeed = s.runSeed;
    this.modeEndless = s.modeEndless;
  }

  startWave({ earlyBonus = 0 } = {}) {
    const s = this._s;
    s.running = true;
    const nextWave = (s.waves.index | 0) + 1;
    let applied = 0;
    if (earlyBonus > 0 && s.earlyBonusWave !== nextWave) {
      s.earlyBonusWave = nextWave;
      addBattle(s.economy, earlyBonus);
      applied = earlyBonus;
    }
    startNextWave(s);
    s.checkpointPhase = "inWave";
    logAction(s, "call", { wave: nextWave, earlyBonus: applied });
    emit(s, "wave_started", { wave: nextWave, earlyBonus: applied });
    return { wave: s.waves.index, earlyBonus: applied };
  }

  tick() {
    const s = this._s;
    if (!s.running) return;
    s.tickIndex += 1;
    s.dt = this.dt;
    tickWaves(s);
    tickCombat(s);
    tickEnemies(s);
  }

  setStartLives(n, { resetCurrent = true } = {}) {
    const s = this._s;
    s.startLives = Math.max(1, n | 0 || BASE_START_LIVES);
    if (resetCurrent) s.lives = s.startLives;
  }

  setSellRefundMult(mult) {
    const m = Number(mult);
    this._s.sellRefundMult = Number.isFinite(m) && m > 0 ? Math.max(0.5, Math.min(0.9, m)) : 0.5;
  }

  setRoster(slots) {
    this._s.roster = slots;
  }

  setPartUpgrades(up) {
    this._s.partUpgrades = structuredClone(up || {});
    invalidatePlans(this._s);
  }

  setGlobalMods(mods = {}) {
    this._s.globalMods = {
      damage: mods.damage > 0 ? mods.damage : 1,
      range: mods.range > 0 ? mods.range : 1,
      rof: mods.rof > 0 ? mods.rof : 1,
    };
    invalidatePlans(this._s);
  }

  applyPreWalls(cells) {
    applyPreWalls(this._s, cells);
  }

  playerWallCount() {
    return playerWallCount(this._s);
  }

  tryPlaceTower(x, y, slotIndex) {
    return tryPlaceTower(this._s, x, y, slotIndex);
  }

  tryPlaceWall(x, y) {
    return tryPlaceWall(this._s, x, y);
  }

  trySellTower(id) {
    return trySellTower(this._s, id);
  }

  trySellWall(id) {
    return trySellWall(this._s, id);
  }

  tryChooseLevelBranch(towerId, branch) {
    return tryChooseLevelBranch(this._s, towerId, branch);
  }

  stallsAt(cx, cy) {
    return stallsAtFn(this._s, cx, cy);
  }

  checkpoint() {
    const s = this._s;
    return {
      wave: s.waves.index,
      phase: s.checkpointPhase || "inWave",
      earlyBonusWave: s.earlyBonusWave | 0,
      lives: s.lives,
      battle: s.economy.battle,
      forge: s.economy.forge,
      aether: s.economy.aether,
      runWaveGains: structuredClone(s.economy.runWaveGains),
      metaAppliedGains: structuredClone(s.metaAppliedGains || { parts: 0, aether: 0 }),
      towers: structuredClone(s.towers),
      walls: structuredClone(s.walls),
      roster: structuredClone(s.roster),
      seed: s.seed,
      runSeed: s.runSeed,
      actionLog: structuredClone(s.actionLog || []),
      cols: s.grid.cols,
      rows: s.grid.rows,
      blocked: s.grid.exportBlocked(),
    };
  }

  loadCheckpoint(blob) {
    this.setup(blob.cols || 11, blob.rows || 14, blob.runSeed || blob.seed || 1, true);
    const s = this._s;
    s.runSeed = (blob.runSeed || blob.seed || 1) >>> 0;
    s.actionLog = Array.isArray(blob.actionLog) ? structuredClone(blob.actionLog) : [];
    s.economy.battle = blob.battle ?? 100;
    s.economy.forge = blob.forge ?? 0;
    s.economy.aether = blob.aether ?? 0;
    s.economy.runWaveGains = {
      coin: blob.runWaveGains?.coin | 0,
      parts: blob.runWaveGains?.parts | 0,
      aether: blob.runWaveGains?.aether | 0,
    };
    const applied = blob.metaAppliedGains;
    s.metaAppliedGains = {
      parts: applied ? applied.parts | 0 : s.economy.runWaveGains.parts | 0,
      aether: applied ? applied.aether | 0 : s.economy.runWaveGains.aether | 0,
    };
    s.lives = blob.lives ?? 3;
    s.waves.index = blob.wave ?? 0;
    s.checkpointPhase = blob.phase === "betweenWaves" ? "betweenWaves" : "inWave";
    s.earlyBonusWave = blob.earlyBonusWave | 0;
    if (blob.earlyBonusClaimed && !s.earlyBonusWave && s.waves.index > 0) {
      s.earlyBonusWave = s.waves.index;
    }
    s.roster = (blob.roster || defaultSlots()).map((x) =>
      makeSlot(x.base, x.barrel, x.payload, x.levelCap || 1)
    );
    if (blob.blocked?.length === s.grid.cols * s.grid.rows) {
      s.grid.blocked = Uint8Array.from(blob.blocked);
    }
    s.towers = blob.towers || [];
    s.walls = blob.walls || [];
    s.towersById = new Map(s.towers.map((tw) => [tw.id, tw]));
    s.enemiesById = new Map();
    // Rebuild enemiesById from s.enemies if checkpoint ever stores live enemies (future-proof).
    for (const e of s.enemies) s.enemiesById.set(e.id, e);
    if (s.grid.towerMask?.length === s.grid.cols * s.grid.rows) {
      s.grid.towerMask.fill(0);
    }
    for (const t of s.towers) {
      t.base = migratePartId("base", t.base) || "sentry";
      t.barrel = migratePartId("barrel", t.barrel) || "single";
      t.payload = migratePartId("payload", t.payload) || "kinetic";
      if (!Number.isFinite(t.aimAngle)) t.aimAngle = -Math.PI / 2;
      if (!t.branch) t.branch = { damage: 0, rof: 0, range: 0 };
      t.branch.damage = t.branch.damage | 0;
      t.branch.rof = t.branch.rof | 0;
      t.branch.range = t.branch.range | 0;
      t.pendingPicks = t.pendingPicks | 0;
      let pts = t.levelPoints | 0;
      if (pts > 0) {
        const cap = Math.max(1, t.levelCap | 0, this.runLevelCap | 0);
        while (pts > 0 && (t.level | 0) < cap) {
          pts -= 1;
          t.level = (t.level | 0) + 1;
          t.pendingPicks = (t.pendingPicks | 0) + 1;
        }
        t.levelPoints = 0;
      }
      s.grid.setBlocked(t.cell.x, t.cell.y, true);
      s.grid.setTower(t.cell.x, t.cell.y, true);
    }
    for (const w of s.walls) s.grid.setBlocked(w.cell.x, w.cell.y, true);
    s.grid.recompute();
    s.running = false;
    s.waves.active = false;
    s.waves.toSpawn = 0;
    emit(s, "checkpoint_loaded", { wave: s.waves.index, phase: s.checkpointPhase });
  }
}
