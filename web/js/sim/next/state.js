/**
 * Pure sim core — plain state, no classes. Every system is a function over
 * this state; all RNG streams and transient fields live here explicitly, in
 * the exact draw order the oracle uses (parity is byte-exact, not just
 * "seeded the same").
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
    _nextId: 1,

    // run budget
    lives: BASE_START_LIVES,
    startLives: BASE_START_LIVES,
    leakCount: 0,
    killCount: 0,
    sellRefundMult: 0.5,

    // economy (plain data — the facade exposes the method view)
    economy: makeEconomy(BASE_START_CASH),

    // action log (event-sourced runs — the oracle's logAction)
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
    auraApplied: false,

    // event bus (thin, same semantics as the oracle)
    _listeners: new Map(),
  };
}

export function on(state, type, fn) {
  if (!state._listeners.has(type)) state._listeners.set(type, []);
  state._listeners.get(type).push(fn);
}

export function emit(state, type, data = {}) {
  const list = state._listeners.get(type);
  if (list) for (const fn of list) fn(data);
}

export function allocId(state) {
  return state._nextId++;
}

export function logAction(state, type, data = {}) {
  state.actionLog.push({ t: state.tickIndex, type, ...data });
}
