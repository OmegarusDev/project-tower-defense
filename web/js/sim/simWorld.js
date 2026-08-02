import { BoardGrid } from "./boardGrid.js";
import { Economy } from "./economy.js";
import { CombatSystem } from "./combat.js";
import { WaveManager } from "./waves.js";
import { defaultSlots, migratePartId, makeSlot } from "../data/parts.js";

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
    this.partUpgrades = {};
    this.tickIndex = 0;
    this.lives = 3;
    this.waveIndex = 0;
    this.running = false;
    this.modeEndless = true;
    this.campaignLevelId = 0;
    this.wavesToWin = 0;
    this.seed = 1;
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
    this.modeEndless = endless;
    this.campaignLevelId = 0;
    this.wavesToWin = 0;
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
    this.waveIndex = 0;
    this.running = false;
    this._nextId = 1;
    this.roster = defaultSlots(3, 2);
    this.partUpgrades = {};
  }

  setPartUpgrades(up) {
    this.partUpgrades = structuredClone(up || {});
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

  setStartLives(n) {
    this.startLives = Math.max(1, n | 0 || 3);
    this.lives = this.startLives;
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

  startWave() {
    this.running = true;
    this.waves.startNextWave();
    this.emit("wave_started", { wave: this.waveIndex });
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
    this.emit("wall_placed", { wall });
    return { ok: true, wall };
  }

  tryPlaceTower(x, y, slotIndex) {
    const loadout = this.roster[slotIndex];
    if (!loadout?.complete) return { ok: false, reason: "incomplete_triad" };
    if (!this.grid.isBuildable(x, y)) return { ok: false, reason: "blocked" };
    const baseCost = loadout.placeCost;
    const surcharge = this.economy.placeSurcharge(baseCost, this.towers.length);
    const cost = baseCost + surcharge;
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
      levelCap: loadout.levelCap || 1,
      cooldown: 0,
      targetId: -1,
      aimAngle: -Math.PI / 2,
    };
    this.towers.push(tower);
    this.grid.recompute();
    this.combat.dirtyAuras();
    this.emit("tower_placed", { tower, surcharge });
    return { ok: true, tower, surcharge };
  }

  trySellTower(id) {
    const i = this.towers.findIndex((t) => t.id === id);
    if (i < 0) return { ok: false, reason: "missing" };
    const t = this.towers[i];
    const refund = (t.paid * 0.5) | 0;
    this.economy.addBattle(refund);
    this.grid.setBlocked(t.cell.x, t.cell.y, false);
    this.towers.splice(i, 1);
    this.grid.recompute();
    this.combat.dirtyAuras();
    this.emit("tower_sold", { id, refund });
    return { ok: true, refund };
  }

  trySellWall(id) {
    const i = this.walls.findIndex((w) => w.id === id);
    if (i < 0) return { ok: false, reason: "missing" };
    const w = this.walls[i];
    if (w.preplaced) return { ok: false, reason: "preplaced" };
    const refund = (w.paid * 0.5) | 0;
    this.economy.addBattle(refund);
    this.grid.setBlocked(w.cell.x, w.cell.y, false);
    this.walls.splice(i, 1);
    this.grid.recompute();
    this.emit("wall_sold", { id, refund });
    return { ok: true, refund };
  }

  spendLevelPoint(id) {
    const t = this.towers.find((x) => x.id === id);
    if (!t) return { ok: false, reason: "missing" };
    if ((t.levelPoints || 0) <= 0) return { ok: false, reason: "no_level_up_point" };
    if (t.level >= t.levelCap) return { ok: false, reason: "at_cap" };
    t.levelPoints -= 1;
    t.level += 1;
    this.combat.dirtyAuras();
    this.emit("tower_leveled", { tower: t });
    return { ok: true, tower: t };
  }

  checkpoint() {
    return {
      wave: this.waveIndex,
      lives: this.lives,
      battle: this.economy.battle,
      forge: this.economy.forge,
      aether: this.economy.aether,
      runWaveGains: structuredClone(this.economy.runWaveGains),
      towers: structuredClone(this.towers),
      walls: structuredClone(this.walls),
      roster: structuredClone(this.roster),
      seed: this.seed,
      cols: this.grid.cols,
      rows: this.grid.rows,
      blocked: this.grid.exportBlocked(),
    };
  }

  loadCheckpoint(blob) {
    this.setup(blob.cols || 11, blob.rows || 14, blob.seed || 1, true);
    this.economy.battle = blob.battle ?? 100;
    this.economy.forge = blob.forge ?? 0;
    this.economy.aether = blob.aether ?? 0;
    this.economy.runWaveGains = {
      coin: blob.runWaveGains?.coin | 0,
      parts: blob.runWaveGains?.parts | 0,
      aether: blob.runWaveGains?.aether | 0,
    };
    this.lives = blob.lives ?? 3;
    this.waveIndex = blob.wave ?? 0;
    this.roster = (blob.roster || defaultSlots()).map((s) =>
      makeSlot(s.base, s.barrel, s.payload, s.levelCap || 1)
    );
    if (blob.blocked?.length === this.grid.cols * this.grid.rows) {
      this.grid.blocked = Uint8Array.from(blob.blocked);
    }
    this.towers = blob.towers || [];
    this.walls = blob.walls || [];
    for (const t of this.towers) {
      t.base = migratePartId("base", t.base) || "sentry";
      t.barrel = migratePartId("barrel", t.barrel) || "single";
      t.payload = migratePartId("payload", t.payload) || "kinetic";
      if (!Number.isFinite(t.aimAngle)) t.aimAngle = -Math.PI / 2;
      this.grid.setBlocked(t.cell.x, t.cell.y, true);
    }
    for (const w of this.walls) this.grid.setBlocked(w.cell.x, w.cell.y, true);
    this.grid.recompute();
    this.combat.dirtyAuras();
    this.running = false;
    this.waves.waveActive = false;
    this.waves.toSpawn = 0;
    this.emit("checkpoint_loaded", { wave: this.waveIndex });
  }

  _tickEnemies() {
    for (let i = 0; i < this.enemies.length; ) {
      const e = this.enemies[i];
      if (e.hp <= 0) {
        this.economy.addBattle(e.battleDrop || 1);
        this.emit("enemy_killed", { enemy: e, drop: e.battleDrop || 1 });
        this.enemies.splice(i, 1);
        continue;
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
    const slow = Math.min(1, e.slowAmount || 0);
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
        : this.grid.nextGround(cx, cy);
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
