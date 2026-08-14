/**
 * Pure sim facade — mirrors the oracle SimWorld's public surface so the bot,
 * the parity harness, and eventually the app drive it identically. The state
 * stays plain data; systems do the work; this object only adapts.
 */
import { createState, on, emit, logAction } from "./state.js";
import { BASE_START_LIVES } from "../../data/techTree.js";
import { defaultSlots, makeSlot, migratePartId } from "../../data/parts.js";
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

export class Sim {
  constructor() {
    const self = this;
    this._s = null;
    this.dt = 1 / 60;
    this.grid = null;
    this.enemies = [];
    this.towers = [];
    this.walls = [];
    this.projectiles = [];
    this.roster = [];
    this.economy = null;
    // NOTE: arrow getters — `this` inside an object-literal getter would be
    // the literal itself, not the Sim (a real bug: waveActive read false).
    this.waves = {
      get waveActive() { return self._s ? self._s.waves.active : false; },
      get toSpawn() { return self._s ? self._s.waves.toSpawn : 0; },
    };
    this.waveIndex = 0;
    this.running = false;
    this.modeEndless = true;
    this.runSeed = 1;
    this.leakCount = 0;
    this.killCount = 0;
    this.lives = 3;
    this.startLives = 3;
    this.tickIndex = 0;
    this.runLevelCap = 1;
    this.campaignWaves = null;
    this.wavesToWin = 0;
    this.campaignLevelId = 0;
    this.actionLog = [];
  }

  setup(cols = 11, rows = 14, seed = 1, endless = true) {
    const s = createState({ cols, rows, seed, endless });
    this._s = s;
    this.grid = s.grid;
    this.roster = s.roster;
    this.runSeed = s.runSeed;
    this.modeEndless = s.modeEndless;
    this.running = s.running;
    this.dt = s.dt;
    this.waveIndex = s.waves.index;
    this.leakCount = s.leakCount;
    this.killCount = s.killCount;
    this.lives = s.lives;
    this.startLives = s.startLives;
    this.tickIndex = s.tickIndex;
    this.actionLog = s.actionLog;
    this.economy = {
      get battle() { return s.economy.battle; },
      set battle(v) { s.economy.battle = v; },
      get forge() { return s.economy.forge; },
      set forge(v) { s.economy.forge = v; },
      get aether() { return s.economy.aether; },
      set aether(v) { s.economy.aether = v; },
      get runWaveGains() { return s.economy.runWaveGains; },
      get towerCostMult() { return s.economy.towerCostMult; },
      get wallCostMult() { return s.economy.wallCostMult; },
      quoteTowerPlace: (pc, tc) => quoteTowerPlace(s.economy, pc, tc),
      placeSurcharge: (b, c) => placeSurcharge(s.economy, b, c),
      towerCost: (b) => towerCost(s.economy, b),
      wallCost: (o) => wallCost(s.economy, o),
      spendBattle: (n) => spendBattle(s.economy, n),
      addBattle: (n) => addBattle(s.economy, n),
      applyRunMods: (m) => applyRunMods(s.economy, m),
      injectMeta: (f, a) => injectMeta(s.economy, f, a),
    };
  }

  get portal() {
    return this._s ? this._s.portal : null;
  }
  set portal(v) {
    if (this._s) this._s.portal = v;
  }
  get enemies() {
    return this._s ? this._s.enemies : [];
  }
  set enemies(v) {
    if (this._s) this._s.enemies = v;
  }
  get towers() {
    return this._s ? this._s.towers : [];
  }
  set towers(v) {
    if (this._s) this._s.towers = v;
  }
  get walls() {
    return this._s ? this._s.walls : [];
  }
  set walls(v) {
    if (this._s) this._s.walls = v;
  }
  get projectiles() {
    return this._s ? this._s.projectiles : [];
  }
  set projectiles(v) {
    if (this._s) this._s.projectiles = v;
  }
  get campaignWaves() {
    return this._s ? this._s.campaignWaves : null;
  }
  set campaignWaves(v) {
    if (this._s) this._s.campaignWaves = v;
  }
  get wavesToWin() {
    return this._s ? this._s.wavesToWin : 0;
  }
  set wavesToWin(v) {
    if (this._s) this._s.wavesToWin = v;
  }
  get campaignLevelId() {
    return this._s ? this._s.campaignLevelId : 0;
  }
  set campaignLevelId(v) {
    if (this._s) this._s.campaignLevelId = v;
  }

  on(type, fn) {
    on(this._s, type, fn);
  }

  logAction(type, data = {}) {
    logAction(this._s, type, data);
  }

  startWave({ earlyBonus = 0 } = {}) {
    const s = this._s;
    s.running = true;
    this.running = true;
    const nextWave = (s.waves.index | 0) + 1;
    let applied = 0;
    if (earlyBonus > 0 && s.earlyBonusWave !== nextWave) {
      s.earlyBonusWave = nextWave;
      addBattle(s.economy, earlyBonus);
      applied = earlyBonus;
    }
    startNextWave(s);
    logAction(s, "call", { wave: nextWave, earlyBonus: applied });
    emit(s, "wave_call", { wave: nextWave, earlyBonus: applied });
    this.waveIndex = s.waves.index;
    return { ok: true, wave: nextWave };
  }

  tick() {
    const s = this._s;
    if (!s.running) return;
    s.tickIndex += 1;
    this.tickIndex = s.tickIndex;
    tickWaves(s);
    tickCombat(s);
    tickEnemies(s);
    // NOTE: `running` is NOT re-synced here — handlers (wave_cleared,
    // game_over, victory) own it, exactly like the oracle. Re-syncing would
    // clobber their false.
    this.lives = s.lives;
    this.leakCount = s.leakCount;
    this.killCount = s.killCount;
    this.waveIndex = s.waves.index;
  }

  setStartLives(n, { resetCurrent = true } = {}) {
    const s = this._s;
    s.startLives = Math.max(1, n | 0 || BASE_START_LIVES);
    if (resetCurrent) s.lives = s.startLives;
    this.startLives = s.startLives;
    this.lives = s.lives;
  }

  setSellRefundMult(mult) {
    const m = Number(mult);
    this._s.sellRefundMult = Number.isFinite(m) && m > 0 ? Math.max(0.5, Math.min(0.9, m)) : 0.5;
  }

  setRoster(slots) {
    this._s.roster = slots;
    this.roster = slots;
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
    const r = tryPlaceTower(this._s, x, y, slotIndex);
    this.actionLog = this._s.actionLog;
    return r;
  }

  tryPlaceWall(x, y) {
    const r = tryPlaceWall(this._s, x, y);
    this.actionLog = this._s.actionLog;
    return r;
  }

  trySellTower(id) {
    const r = trySellTower(this._s, id);
    this.actionLog = this._s.actionLog;
    return r;
  }

  trySellWall(id) {
    const r = trySellWall(this._s, id);
    this.actionLog = this._s.actionLog;
    return r;
  }

  tryChooseLevelBranch(towerId, branch) {
    const r = tryChooseLevelBranch(this._s, towerId, branch);
    this.actionLog = this._s.actionLog;
    return r;
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
    this.running = false;
    this.waveIndex = s.waves.index;
    this.lives = s.lives;
    this.roster = s.roster;
    this.campaignWaves = s.campaignWaves;
    this.actionLog = s.actionLog;
  }
}
