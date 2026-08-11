import { BoardGrid } from "./boardGrid.js";
import { Economy } from "./economy.js";
import { CombatSystem } from "./combat.js";
import { WaveManager } from "./waves.js";
import { defaultSlots, migratePartId, makeSlot } from "../data/parts.js";
import { ballastSlowFactor } from "../data/enemies.js";

export const TICK_HZ = 60;
export const TICK_DT = 1 / TICK_HZ;

export class SimWorld {
  constructor() {
    this.dt = TICK_DT;
    this.grid = new BoardGrid();
    this.economy = new Economy();
    this.combat = new CombatSystem(this);
    this.waves = new WaveManager(this);
    this.towers = [];
    this.walls = [];
    this.enemies = [];
    this.projectiles = [];
    this.roster = [];
    this.runLevelCap = 1;
    this.partUpgrades = {};
    this.globalMods = { damage: 1, range: 1, rof: 1 };
    this.tickIndex = 0;
    this.lives = 3;
    this.waveIndex = 0;
    this.running = false;
    this.modeEndless = true;
    this.campaignLevelId = 0;
    this.wavesToWin = 0;
    this.seed = 1;
    this.runSeed = 1;
    this.campaignWaves = null;
    this.actionLog = [];
    /** Wave index that already received Call Early Coin (prevents Continue double-dip). */
    this.earlyBonusWave = 0;
    /** `inWave` | `betweenWaves` — endless checkpoint semantics. */
    this.checkpointPhase = "betweenWaves";
    /** Meta forge/aether gains already merged from runWaveGains. */
    this.metaAppliedGains = { parts: 0, aether: 0 };
    this._nextId = 1;
    this._listeners = new Map();
  }

  on(kind, fn) {
    if (!this._listeners.has(kind)) this._listeners.set(kind, []);
    this._listeners.get(kind).push(fn);
  }

  emit(kind, payload = {}) {
    const list = this._listeners.get(kind) || [];
    const e = { kind, tick: this.tickIndex, ...payload };
    for (const fn of list) fn(e);
    const all = this._listeners.get("*") || [];
    for (const fn of all) fn(e);
  }

  allocId() {
    return this._nextId++;
  }

  setup(cols = 11, rows = 14, seed = 1, endless = true) {
    this.seed = seed;
    this.runSeed = seed >>> 0 || 1;
    this.modeEndless = endless;
    this.campaignLevelId = 0;
    this.wavesToWin = 0;
    this.campaignWaves = null;
    this.actionLog = [];
    this.grid.setup(cols, rows);
    this.economy = new Economy();
    this.economy.resetRunGains();
    this.combat = new CombatSystem(this);
    this.waves = new WaveManager(this);
    this.towers = [];
    this.walls = [];
    this.enemies = [];
    this.projectiles = [];
    this.tickIndex = 0;
    this.lives = 3;
    this.startLives = 3;
    this.sellRefundMult = 0.5;
    this.waveIndex = 0;
    this.running = false;
    this.earlyBonusWave = 0;
    this.checkpointPhase = "betweenWaves";
    this.metaAppliedGains = { parts: 0, aether: 0 };
    this._nextId = 1;
    this.roster = defaultSlots(3, 1);
    this.partUpgrades = {};
    this.globalMods = { damage: 1, range: 1, rof: 1 };
  }

  logAction(type, data = {}) {
    this.actionLog.push({ t: this.tickIndex, type, ...data });
  }

  setPartUpgrades(up) {
    this.partUpgrades = structuredClone(up || {});
  }

  setGlobalMods(mods = {}) {
    this.globalMods = {
      damage: mods.damage > 0 ? mods.damage : 1,
      range: mods.range > 0 ? mods.range : 1,
      rof: mods.rof > 0 ? mods.rof : 1,
    };
  }

  /** Seeded map debris — unsellable, free. */
  applyPreWalls(cells) {
    for (const c of cells || []) {
      if (!this.grid.isBuildable(c.x, c.y)) continue;
      this.grid.setBlocked(c.x, c.y, true);
      if (!this.grid.hasGroundPath()) {
        this.grid.setBlocked(c.x, c.y, false);
        continue;
      }
      this.walls.push({
        id: this.allocId(),
        cell: { x: c.x, y: c.y },
        paid: 0,
        preplaced: true,
      });
    }
    this.grid.recompute();
  }

  playerWallCount() {
    return this.walls.filter((w) => !w.preplaced).length;
  }

  /** Update the run's life budget. Only refill current lives when `resetCurrent`. */
  setStartLives(n, { resetCurrent = true } = {}) {
    this.startLives = Math.max(1, n | 0 || 3);
    if (resetCurrent) this.lives = this.startLives;
  }

  setSellRefundMult(mult) {
    const m = Number(mult);
    this.sellRefundMult = Number.isFinite(m) && m > 0 ? Math.max(0.5, Math.min(0.9, m)) : 0.5;
  }

  setRoster(slots) {
    this.roster = slots;
  }

  tick() {
    if (!this.running) return;
    this.tickIndex += 1;
    this.waves.tick();
    this.combat.tick();
    this._tickEnemies();
  }

  startWave({ earlyBonus = 0 } = {}) {
    this.running = true;
    const nextWave = (this.waveIndex | 0) + 1;
    let applied = 0;
    // Skip if this wave already claimed early bonus (Continue → Call double-dip).
    if (earlyBonus > 0 && this.earlyBonusWave !== nextWave) {
      this.economy.addBattle(earlyBonus);
      this.earlyBonusWave = nextWave;
      applied = earlyBonus;
    }
    this.waves.startNextWave();
    this.checkpointPhase = "inWave";
    this.logAction("call", { wave: this.waveIndex, earlyBonus: applied });
    this.emit("wave_started", { wave: this.waveIndex, earlyBonus: applied });
    return { wave: this.waveIndex, earlyBonus: applied };
  }

  /** Spend one banked level-up point on a tower (GDD: XP → point → spend). */
  trySpendLevelPoint(towerId) {
    const t = this.towers.find((x) => x.id === towerId);
    if (!t) return { ok: false, reason: "missing" };
    const cap = Math.max(1, t.levelCap | 0, this.runLevelCap | 0);
    t.levelCap = cap;
    if ((t.levelPoints | 0) <= 0) return { ok: false, reason: "no_points" };
    if ((t.level | 0) >= cap) return { ok: false, reason: "at_cap" };
    t.levelPoints = (t.levelPoints | 0) - 1;
    t.level = (t.level | 0) + 1;
    this.combat.dirtyAuras();
    this.logAction("level_up", { id: towerId, level: t.level });
    this.emit("tower_leveled", {
      tower: t,
      level: t.level,
      x: t.cell.x + 0.5,
      y: t.cell.y + 0.5,
    });
    return { ok: true, level: t.level, points: t.levelPoints | 0 };
  }

  growSouth(n) {
    this.grid.growSouth(n);
    this.emit("grid_grew", { rows: this.grid.rows, cols: this.grid.cols });
  }

  tryPlaceWall(x, y) {
    if (!this.grid.isBuildable(x, y)) return { ok: false, reason: "blocked" };
    const cost = this.economy.wallCost(this.playerWallCount());
    if (this.economy.battle < cost) return { ok: false, reason: "need_battle", need: cost };
    this.grid.setBlocked(x, y, true);
    if (!this.grid.hasGroundPath()) {
      this.grid.setBlocked(x, y, false);
      this.grid.recompute();
      return { ok: false, reason: "path_sealed" };
    }
    this.economy.spendBattle(cost);
    const wall = { id: this.allocId(), cell: { x, y }, paid: cost };
    this.walls.push(wall);
    this.grid.recompute();
    this.logAction("place_wall", { x, y });
    this.emit("wall_placed", { wall });
    return { ok: true, wall };
  }

  tryPlaceTower(x, y, slotIndex) {
    const loadout = this.roster[slotIndex];
    if (!loadout?.complete) return { ok: false, reason: "incomplete_triad" };
    if (!this.grid.isBuildable(x, y)) return { ok: false, reason: "blocked" };
    const quote = this.economy.quoteTowerPlace(loadout.placeCost, this.towers.length);
    const cost = quote.total;
    const surcharge = quote.surcharge;
    if (this.economy.battle < cost) return { ok: false, reason: "need_battle", need: cost };
    this.grid.setBlocked(x, y, true);
    if (!this.grid.hasGroundPath()) {
      this.grid.setBlocked(x, y, false);
      this.grid.recompute();
      return { ok: false, reason: "path_sealed" };
    }
    this.economy.spendBattle(cost);
    const tower = {
      id: this.allocId(),
      cell: { x, y },
      slot: slotIndex,
      base: loadout.base,
      barrel: loadout.barrel,
      payload: loadout.payload,
      paid: cost,
      level: 1,
      xp: 0,
      xpToPoint: 55,
      levelPoints: 0,
      levelCap: Math.max(loadout.levelCap | 0, this.runLevelCap | 0, 1),
      cooldown: 0,
      targetId: -1,
      aimAngle: -Math.PI / 2,
    };
    this.towers.push(tower);
    this.grid.setTower(x, y, true);
    this.grid.recompute();
    this.combat.dirtyAuras();
    this.logAction("place_tower", { x, y, slot: slotIndex });
    this.emit("tower_placed", { tower, surcharge });
    return { ok: true, tower, surcharge };
  }

  trySellTower(id) {
    const i = this.towers.findIndex((t) => t.id === id);
    if (i < 0) return { ok: false, reason: "missing" };
    const t = this.towers[i];
    const rate = this.sellRefundMult > 0 ? this.sellRefundMult : 0.5;
    const refund = (t.paid * rate) | 0;
    this.economy.addBattle(refund);
    this.grid.setBlocked(t.cell.x, t.cell.y, false);
    this.grid.setTower(t.cell.x, t.cell.y, false);
    this.towers.splice(i, 1);
    this.grid.recompute();
    this.combat.dirtyAuras();
    this.logAction("sell_tower", { id });
    this.emit("tower_sold", { id, refund });
    return { ok: true, refund };
  }

  trySellWall(id) {
    const i = this.walls.findIndex((w) => w.id === id);
    if (i < 0) return { ok: false, reason: "missing" };
    const w = this.walls[i];
    if (w.preplaced) return { ok: false, reason: "preplaced" };
    const rate = this.sellRefundMult > 0 ? this.sellRefundMult : 0.5;
    const refund = (w.paid * rate) | 0;
    this.economy.addBattle(refund);
    this.grid.setBlocked(w.cell.x, w.cell.y, false);
    this.walls.splice(i, 1);
    this.grid.recompute();
    this.logAction("sell_wall", { id });
    this.emit("wall_sold", { id, refund });
    return { ok: true, refund };
  }

  checkpoint() {
    return {
      wave: this.waveIndex,
      phase: this.checkpointPhase || "inWave",
      earlyBonusWave: this.earlyBonusWave | 0,
      lives: this.lives,
      battle: this.economy.battle,
      forge: this.economy.forge,
      aether: this.economy.aether,
      runWaveGains: structuredClone(this.economy.runWaveGains),
      metaAppliedGains: structuredClone(this.metaAppliedGains || { parts: 0, aether: 0 }),
      towers: structuredClone(this.towers),
      walls: structuredClone(this.walls),
      roster: structuredClone(this.roster),
      seed: this.seed,
      runSeed: this.runSeed,
      actionLog: structuredClone(this.actionLog || []),
      cols: this.grid.cols,
      rows: this.grid.rows,
      blocked: this.grid.exportBlocked(),
    };
  }

  loadCheckpoint(blob) {
    this.setup(blob.cols || 11, blob.rows || 14, blob.runSeed || blob.seed || 1, true);
    this.runSeed = (blob.runSeed || blob.seed || 1) >>> 0;
    this.actionLog = Array.isArray(blob.actionLog) ? structuredClone(blob.actionLog) : [];
    this.economy.battle = blob.battle ?? 100;
    this.economy.forge = blob.forge ?? 0;
    this.economy.aether = blob.aether ?? 0;
    this.economy.runWaveGains = {
      coin: blob.runWaveGains?.coin | 0,
      parts: blob.runWaveGains?.parts | 0,
      aether: blob.runWaveGains?.aether | 0,
    };
    // Old checkpoints: treat all run gains as already merged so Continue won't re-apply.
    const applied = blob.metaAppliedGains;
    this.metaAppliedGains = {
      parts: applied ? applied.parts | 0 : this.economy.runWaveGains.parts | 0,
      aether: applied ? applied.aether | 0 : this.economy.runWaveGains.aether | 0,
    };
    this.lives = blob.lives ?? 3;
    this.waveIndex = blob.wave ?? 0;
    this.checkpointPhase = blob.phase === "betweenWaves" ? "betweenWaves" : "inWave";
    this.earlyBonusWave = blob.earlyBonusWave | 0;
    // Legacy: earlyBonusClaimed boolean meant the saved in-wave already got the bonus.
    if (blob.earlyBonusClaimed && !this.earlyBonusWave && this.waveIndex > 0) {
      this.earlyBonusWave = this.waveIndex;
    }
    this.roster = (blob.roster || defaultSlots()).map((s) =>
      makeSlot(s.base, s.barrel, s.payload, s.levelCap || 1)
    );
    if (blob.blocked?.length === this.grid.cols * this.grid.rows) {
      this.grid.blocked = Uint8Array.from(blob.blocked);
    }
    this.towers = blob.towers || [];
    this.walls = blob.walls || [];
    if (this.grid.towerMask?.length === this.grid.cols * this.grid.rows) {
      this.grid.towerMask.fill(0);
    }
    for (const t of this.towers) {
      t.base = migratePartId("base", t.base) || "sentry";
      t.barrel = migratePartId("barrel", t.barrel) || "single";
      t.payload = migratePartId("payload", t.payload) || "kinetic";
      if (!Number.isFinite(t.aimAngle)) t.aimAngle = -Math.PI / 2;
      t.levelPoints = t.levelPoints | 0;
      this.grid.setBlocked(t.cell.x, t.cell.y, true);
      this.grid.setTower(t.cell.x, t.cell.y, true);
    }
    for (const w of this.walls) this.grid.setBlocked(w.cell.x, w.cell.y, true);
    this.grid.recompute();
    this.combat.dirtyAuras();
    this.running = false;
    this.waves.waveActive = false;
    this.waves.toSpawn = 0;
    this.emit("checkpoint_loaded", { wave: this.waveIndex, phase: this.checkpointPhase });
  }

  _tickEnemies() {
    for (let i = 0; i < this.enemies.length; ) {
      const e = this.enemies[i];
      if (e.hp <= 0) {
        this.economy.addBattle(e.battleDrop || 1);
        if ((e.splitsInto | 0) > 0) {
          const childKind = e.splitKind || "mite";
          for (let s = 0; s < e.splitsInto; s++) {
            const child = this.waves.makeEnemy(childKind, this.waveIndex, {
              scale: 0.55,
              pos: {
                x: e.pos.x + (s === 0 ? -0.15 : 0.15),
                y: e.pos.y,
              },
              cell: { x: e.cell.x, y: e.cell.y },
            });
            child.battleDrop = 1;
            this.enemies.push(child);
          }
        }
        this.emit("enemy_killed", { enemy: e, drop: e.battleDrop || 1 });
        this.enemies.splice(i, 1);
        continue;
      }
      // Leech regen
      if ((e.regen || 0) > 0 && e.hp < e.maxHp) {
        e._regenAcc = (e._regenAcc || 0) + this.dt;
        if (e._regenAcc >= 0.5) {
          e._regenAcc = 0;
          e.hp = Math.min(e.maxHp, e.hp + e.regen * 0.5);
        }
      }
      this._advance(e);
      if (e.reachedExit) {
        this.lives -= e.leakDamage || 1;
        this.emit("leak", { enemy: e, lives: this.lives });
        this.enemies.splice(i, 1);
        if (this.lives <= 0) {
          this.running = false;
          this.emit("game_over", {});
        }
        continue;
      }
      i++;
    }
  }

  _advance(e) {
    const slowRaw = Math.min(1, e.slowAmount || 0);
    const slow = Math.min(1, slowRaw * ballastSlowFactor(e.ballast || "mid"));
    if (slow >= 1) return;
    // speed is cells/sec; glide along successive cell centers on the path
    let remaining = e.speed * (1 - slow) * this.dt;
    while (remaining > 0 && !e.reachedExit) {
      const cx = e.cell.x;
      const cy = e.cell.y;
      if (this.grid.isExit(cx, cy)) {
        e.reachedExit = true;
        return;
      }
      const next = e.flying
        ? this.grid.nextAir(cx, cy)
        : this.grid.pickNextGround(cx, cy, {
            id: e.id,
            tick: this.tickIndex | 0,
            avoidTowers: !e.ignoreTowerAvoid,
          });
      if (next.x === cx && next.y === cy) {
        if (this.grid.isExit(cx, cy)) e.reachedExit = true;
        return;
      }
      const tx = next.x + 0.5;
      const ty = next.y + 0.5;
      const dx = tx - e.pos.x;
      const dy = ty - e.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 1e-6) {
        e.pos.x = tx;
        e.pos.y = ty;
        e.cell = { x: next.x, y: next.y };
        if (this.grid.isExit(next.x, next.y)) {
          e.reachedExit = true;
          return;
        }
        continue;
      }
      if (remaining >= dist) {
        e.pos.x = tx;
        e.pos.y = ty;
        e.cell = { x: next.x, y: next.y };
        remaining -= dist;
        if (this.grid.isExit(next.x, next.y)) {
          e.reachedExit = true;
          return;
        }
      } else {
        e.pos.x += (dx / dist) * remaining;
        e.pos.y += (dy / dist) * remaining;
        remaining = 0;
      }
    }
  }
}
