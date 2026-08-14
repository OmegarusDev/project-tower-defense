/**
 * Pure sim facade — mirrors the oracle SimWorld's public surface so the bot,
 * the parity harness, and eventually the app drive it identically. The state
 * stays plain data; systems do the work; this object only adapts.
 */
import { createState, on, emit, logAction } from "./state.js";
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
    this._s = null;
    this.dt = 1 / 60;
    this.grid = null;
    this.portal = null;
    this.enemies = [];
    this.towers = [];
    this.walls = [];
    this.projectiles = [];
    this.roster = [];
    this.economy = null;
    this.waves = { get waveActive() { return this._s ? this._s.waves.active : false; }, get toSpawn() { return this._s ? this._s.waves.toSpawn : 0; } };
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
    this.actionLog = [];
  }

  setup(cols = 11, rows = 14, seed = 1, endless = true) {
    const s = createState({ cols, rows, seed, endless });
    this._s = s;
    this.grid = s.grid;
    this.portal = s.portal;
    this.enemies = s.enemies;
    this.towers = s.towers;
    this.walls = s.walls;
    this.projectiles = s.projectiles;
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
    this.running = s.running;
    this.lives = s.lives;
    this.leakCount = s.leakCount;
    this.killCount = s.killCount;
    this.waveIndex = s.waves.index;
  }

  setStartLives(n, { resetCurrent = true } = {}) {
    const s = this._s;
    s.startLives = Math.max(1, n | 0 || 3);
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
}
