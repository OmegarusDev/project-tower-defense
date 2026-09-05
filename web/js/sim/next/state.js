/**
 * Pure sim core — plain state, no classes. Every system is a function over
 * this state; all RNG streams and transient fields live here explicitly.
 * Draw order across systems is the parity contract (simParity.mjs pins it
 * byte-exactly, not just "seeded the same").
 */
import { BoardGrid } from "../boardGrid.js";
import { mulberry32 } from "../rng.js";
import { BASE_START_CASH, BASE_START_LIVES } from "../../data/techTree.js";
import { makeEconomy } from "./systems/economy.js";

export function createState(opts = {}) {
  const grid = new BoardGrid();
  grid.setup(opts.cols || 11, opts.rows || 14);
  const runSeed = (opts.seed || 1) >>> 0;
  return {
    // identity / mode
    seed: runSeed,
    runSeed,
    modeEndless: opts.endless !== false,
    campaignLevelId: 0,
    wavesToWin: 0,
    campaignWaves: null,

    // timing
    dt: 1 / 60,
    tickIndex: 0,
    running: false,

    // board
    grid,
    portal: { x: grid.spawn.x, y: 0 },
    enemies: [],
    towers: [],
    walls: [],
    projectiles: [],
    roster: [],
    partUpgrades: {},
    globalMods: { damage: 1, range: 1, rof: 1 },
    runLevelCap: 1,
    earlyBonusWave: 0,
    // checkpointPhase intentionally undefined until set — checkpoint()
    // treats missing as "inWave".
    metaAppliedGains: { parts: 0, aether: 0 },
    _nextId: 1,

    // run budget
    lives: BASE_START_LIVES,
    startLives: BASE_START_LIVES,
    leakCount: 0,
    killCount: 0,
    sellRefundMult: 0.5,

    // economy (plain data — the facade exposes the method view)
    economy: makeEconomy(BASE_START_CASH),

    // action log (event-sourced runs — feeds ghost replays + traces)
    actionLog: [],

    // wave manager state (RNG streams live here — draw order is the contract)
    waves: {
      index: 0,
      active: false,
      queue: [],
      toSpawn: 0,
      spawnTimer: 0,
      spawnGap: 0.4,
      speedMult: 1,
      rand: null, // compose + jitter stream (per wave)
      portalRand: null, // portal cycle stream (per wave)
      portalCycle: [],
      portalIdx: 0,
      portalTimer: 0,
      lastPortalX: -1,
      theme: "",
      event: "",
    },

    // combat cache
    plans: new Map(),
    altToggle: new Map(),
    // using Map instead of find because homing needs O(1) lookup per projectile per tick
    // id -> tower / enemy (projectile hits resolve O(1); maintained by
    // tryPlaceTower / trySellTower / loadCheckpoint and enemy spawn/death)
    towersById: new Map(),
    enemiesById: new Map(),
    auraApplied: false,

    // event bus (kind listeners + "*" wildcard)
    _listeners: new Map(),
  };
}

export function on(state, type, fn) {
  if (!state._listeners.has(type)) state._listeners.set(type, []);
  state._listeners.get(type).push(fn);
}

export function emit(state, type, data = {}) {
  // Mirrors the Sim facade's emit exactly: kind listeners AND "*" listeners, both
  // receiving { kind, tick, ...payload }.
  const e = { kind: type, tick: state.tickIndex, ...data };
  const list = state._listeners.get(type);
  if (list) for (const fn of list) fn(e);
  const all = state._listeners.get("*");
  if (all) for (const fn of all) fn(e);
}

export function allocId(state) {
  return state._nextId++;
}

export function logAction(state, type, data = {}) {
  state.actionLog.push({ t: state.tickIndex, type, ...data });
}
