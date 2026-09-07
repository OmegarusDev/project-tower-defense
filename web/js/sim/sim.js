/**
 * Sim — command adapter over plain-data state.
 * All run data lives on `this.state`. Systems are functions over that object.
 * This class only constructs, ticks, and guards commands.
 */
import { createState, on, off, emit, logAction } from "./state.js";
import { BASE_START_LIVES } from "../data/techTree.js";
import { defaultSlots, makeSlot } from "../data/parts.js";
import { migratePartId } from "../saveStore.migrations.js";
import { startNextWave, tickWaves } from "./systems/waves.js";
import { tickCombat, invalidatePlans } from "./systems/combat.js";
import { tickEnemies } from "./systems/movement.js";
import { addBattle } from "./systems/economy.js";
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

export class Sim {
  constructor() {
    this.state = null;
    this.dt = 1 / 60;
    this.setup(11, 14, 1, true);
  }

  on(type, fn) {
    on(this.state, type, fn);
  }

  off(type, fn) {
    off(this.state, type, fn);
  }

  logAction(type, data = {}) {
    logAction(this.state, type, data);
  }

  setup(cols = 11, rows = 14, seed = 1, endless = true) {
    this.state = createState({ cols, rows, seed, endless });
  }

  startWave({ earlyBonus = 0 } = {}) {
    const s = this.state;
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
    const s = this.state;
    if (!s.running) return;
    s.tickIndex += 1;
    s.dt = this.dt;
    tickWaves(s);
    tickCombat(s);
    tickEnemies(s);
  }

  setStartLives(n, { resetCurrent = true } = {}) {
    const s = this.state;
    s.startLives = Math.max(1, n | 0 || BASE_START_LIVES);
    if (resetCurrent) s.lives = s.startLives;
  }

  setSellRefundMult(mult) {
    const m = Number(mult);
    this.state.sellRefundMult = Number.isFinite(m) && m > 0 ? Math.max(0.5, Math.min(0.9, m)) : 0.5;
  }

  setRoster(slots) {
    this.state.roster = slots;
  }

  setPartUpgrades(up) {
    this.state.partUpgrades = structuredClone(up || {});
    invalidatePlans(this.state);
  }

  setGlobalMods(mods = {}) {
    this.state.globalMods = {
      damage: mods.damage > 0 ? mods.damage : 1,
      range: mods.range > 0 ? mods.range : 1,
      rof: mods.rof > 0 ? mods.rof : 1,
    };
    invalidatePlans(this.state);
  }

  applyPreWalls(cells) {
    applyPreWalls(this.state, cells);
  }

  playerWallCount() {
    return playerWallCount(this.state);
  }

  tryPlaceTower(x, y, slotIndex) {
    return tryPlaceTower(this.state, x, y, slotIndex);
  }

  tryPlaceWall(x, y) {
    return tryPlaceWall(this.state, x, y);
  }

  trySellTower(id) {
    return trySellTower(this.state, id);
  }

  trySellWall(id) {
    return trySellWall(this.state, id);
  }

  tryChooseLevelBranch(towerId, branch) {
    return tryChooseLevelBranch(this.state, towerId, branch);
  }

  stallsAt(cx, cy) {
    return stallsAtFn(this.state, cx, cy);
  }

  checkpoint() {
    const s = this.state;
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
    const s = this.state;
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
        const cap = Math.max(1, t.levelCap | 0, s.runLevelCap | 0);
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
