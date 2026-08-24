/**
 * Wave system — compose, spawn pacing, roaming portal. Mirrors the oracle's
 * operation order EXACTLY: same RNG stream setup per wave, same draw order
 * (compose → portal cycle), same jitter draws after each spawn, same dwell
 * curve. This is the determinism contract — do not reorder.
 */
import { ENDLESS_GRID } from "../../../data/endlessGrid.js";
import { composeEndlessWave, resolveCampaignWave } from "../../../data/waveScripts.js";
import { enemyDef, resolveEnemyKind } from "../../../data/enemies.js";
import { mulberry32 } from "../../rng.js";
import { INF } from "../../boardGrid.js";
import { allocId, emit } from "../state.js";
import { applyWaveClear } from "./economy.js";

/** Clump spawning constants. */
const CLUMP_GAP = 0.08;              // within-clump spawn interval
const INTER_CLUMP_DWELL_BASE = 2.5;  // base time between clumps
const STRETCH_OUT_TIME = 0.3;        // portal stretch-out duration
const STRETCH_IN_TIME = 0.25;        // portal stretch-in duration

export function startNextWave(state) {
  state.waves.index = (state.waves.index | 0) + 1;
  const w = state.waves.index;
  state.waves.rand = mulberry32(((state.runSeed || 1) ^ (w * 0x9e3779b9)) >>> 0);
  const plan = state.modeEndless
    ? composeEndlessWave(w, state.waves.rand)
    : (() => {
        const list = state.campaignWaves;
        const def = Array.isArray(list) ? list[w - 1] : null;
        return { ...resolveCampaignWave(def, w), theme: "campaign" };
      })();
  state.waves.queue = plan.queue.slice();
  state.waves.spawnGap = plan.spawnGap;
  state.waves.speedMult = plan.speedMult != null ? plan.speedMult : 1;
  state.waves.theme = plan.theme || "";
  state.waves.event = plan.event || "";
  // Clump parameters from wave plan (endless) or campaign portal behavior (campaign)
  if (state.modeEndless) {
    state.waves.clumps = plan.clumps || 1;
    state.waves.clumpGap = plan.clumpGap || CLUMP_GAP;
    state.waves.interClumpDwell = plan.interClumpDwell || INTER_CLUMP_DWELL_BASE;
  } else {
    // Campaign: use portal behavior from level data
    const behavior = state.campaignPortalBehavior || "static";
    if (behavior === "static") {
      state.waves.clumps = 1;
      state.waves.clumpGap = CLUMP_GAP;
      state.waves.interClumpDwell = 0;
    } else {
      const levelId = state.campaignLevelId || 0;
      let clumps = 2;
      if (levelId >= 9) clumps = 3;
      else if (levelId >= 5) clumps = 2;
      state.waves.clumps = clumps;
      state.waves.clumpGap = CLUMP_GAP;
      state.waves.interClumpDwell = INTER_CLUMP_DWELL_BASE;
    }
  }
  
  state.waves.toSpawn = state.waves.queue.length;
  state.waves.active = true;
  buildPortal(state, w);
  initClumpState(state.waves);
  emit(state, "wave_checkpoint", { wave: w });
  emit(state, "wave_composition", {
    count: state.waves.toSpawn,
    wave: w,
    theme: state.waves.theme,
    event: state.waves.event,
    clumps: state.waves.clumps,
  });
}

export function tickWaves(state) {
  const wv = state.waves;
  if (!wv.active) return;

  // Clump-based spawning (new system)
  if (!wv.clumpState) {
    initClumpState(wv);
  }
  tickClumpState(state, wv);

  // Wave completion: when all enemies are dead and all have spawned
  if (wv.toSpawn === 0 && state.enemies.length === 0) {
    wv.active = false;
    const wave = state.waves.index;
    const rewards = applyWaveClear(state.economy, wave);
    emit(state, "wave_cleared", { wave, ...rewards });
    
    if (
      !state.modeEndless &&
      state.wavesToWin > 0 &&
      wave >= state.wavesToWin
    ) {
      state.running = false;
      emit(state, "victory", { wave, levelId: state.campaignLevelId });
      return;
    }
    
    if (
      state.modeEndless &&
      wave > 0 &&
      wave % ENDLESS_GRID.growEvery === 0 &&
      state.grid.rows < ENDLESS_GRID.maxRows
    ) {
      growSouth(state, ENDLESS_GRID.growBy);
    }
  }
}

function growSouth(state, extra) {
  if (extra <= 0) return;
  state.grid.growSouth(extra);
  emit(state, "grid_grew", { rows: state.grid.rows, cols: state.grid.cols });
}

function spawnOne(state) {
  const w = state.waves.index;
  const kind = state.waves.queue.shift() || "mite";
  // Set current portal X on grid for this spawn
  if (state.portal) state.grid.setPortalX(state.portal.x);
  const e = makeEnemy(state, kind, w, {
    speedMult: state.waves.speedMult,
    pos: spawnPos(state, kind),
  });
  state.enemies.push(e);
  emit(state, "enemy_spawned", { enemy: e });
}

/** Spawn point — live portal cell with reachability fallback (oracle parity). */
export function spawnPos(state, kind) {
  const g = state.grid;
  const p = state.portal || { x: g.spawn.x, y: 0 };
  const portalX = state.portal ? state.portal.x : null;
  const dists = portalX != null ? g.getPortalDist(portalX) : { groundDist: g.groundDist, airDist: g.airDist };
  const dist = enemyDef(kind).flying ? dists.airDist : dists.groundDist;
  if (g.inBounds(p.x, p.y) && dist[g.idx(p.x, p.y)] < INF) {
    return { x: p.x + 0.5, y: p.y + 0.5 };
  }
  for (let x = 0; x < g.cols; x++) {
    if (dist[g.idx(x, 0)] < INF) return { x: x + 0.5, y: 0.5 };
  }
  return { x: g.spawn.x + 0.5, y: 0.5 };
}

/** Ported verbatim from WaveManager.makeEnemy (HP curve + endless speed ramp). */
export function makeEnemy(state, kind, wave, opts = {}) {
  const id = resolveEnemyKind(kind);
  const def = enemyDef(id);
  const w = Math.max(1, wave || 1);
  let scale =
    Math.pow(1.065, w - 1) *       // was 1.05
    Math.pow(1.03, Math.max(0, w - 15)) *  // was 1.02
    (opts.scale || 1);
  if (state.modeEndless) {
    scale *= Math.pow(1.1, Math.min(2, Math.max(0, w - 1)));   // was 1.08
    scale *= Math.pow(1.035, Math.min(9, Math.max(0, w - 7))); // was 1.025
  }
  let speedMult = opts.speedMult != null ? opts.speedMult : state.waves.speedMult || 1;
  if (state.modeEndless) {
    const ramp = Math.min(0.55, (w - 1) * 0.018);  // was 0.45 / 0.015
    const ballast = def.ballast || "mid";
    const share = ballast === "high" ? 0.45 : ballast === "low" ? 1.15 : 1;
    speedMult = 1 + ramp * share;
  }
  const spawn = opts.pos || {
    x: state.grid.spawn.x + 0.5,
    y: state.grid.spawn.y + 0.5,
  };
  const cell = opts.cell || { x: state.grid.spawn.x, y: state.grid.spawn.y };
  return {
    id: allocId(state),
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
    spawnPortalX: state.portal ? state.portal.x : null,
    spawnEvery: def.spawnEvery || 7,
    spawnKind: def.spawnKind || "mite",
    aura: def.aura ? { ...def.aura } : null,
    boss: !!def.boss,
    silhouette: def.silhouette || id,
    pathing: def.pathing || "shortest",
    reachedExit: false,
    _hitFlash: 0,
    _regenAcc: 0,
    _pick: null,
  };
}

/**
 * Endless only: seeded back-line portal cycle + dwell schedule. The seam row
 * is buildable, so the portal must never sit on an occupied seam cell. Wave
 * start picks the first open column from the seeded cycle; if every seam
 * cell is blocked it falls back to the least-occupied column (tie → cycle
 * order), and only forces the center when every column is fully walled.
 */
function buildPortal(state, w) {
  if (!state.modeEndless) return;
  // Initialize portal cycle only on wave 1; persist across waves for clump movement
  if (w <= 1) {
    state.waves.portalRand = mulberry32(
      ((state.runSeed || 1) ^ 0x51ab3d) >>> 0
    );
    const cols = state.grid.cols;
    const cycle = [];
    for (let x = 0; x < cols; x++) cycle.push(x);
    for (let i = cycle.length - 1; i > 0; i--) {
      const j = (state.waves.portalRand() * (i + 1)) | 0;
      const tmp = cycle[i];
      cycle[i] = cycle[j];
      cycle[j] = tmp;
    }
    state.waves.portalCycle = cycle;
    state.waves.portalIdx = 0;
    state.waves.lastPortalX = -1;
  }
  state.waves.lastPortalX = state.portal ? state.portal.x : -1;
  if (w <= 1) {
    const centerX = state.grid.spawn.x;
    state.portal = { x: centerX, y: 0 };
    if (state.grid.isBlocked(centerX, 0)) {
      const { x } = pickPortalX(state, state.waves.portalCycle, 0, state.waves.lastPortalX);
      state.portal = { x, y: 0 };
    }
  } else if (w <= 5) {
    // Waves 1-5: portal stays at its current position (center from w=1)
  } else {
    // Wave 6+: pick starting column from cycle (no warning — clump system handles mid-wave shifts)
    const { x } = pickPortalX(state, state.waves.portalCycle, 0, state.waves.lastPortalX);
    state.waves.portalIdx = 0; // reset cycle index for this wave's clump shifts
    state.waves.lastPortalX = x;
    state.portal = { x, y: 0 };
  }
}

/**
 * Deterministic seam-column choice: prefer open seam cells in seeded cycle
 * order (skipping the previous column when an alternative exists), then the
 * least-occupied column, then the center. Returns { x, k } where k is the
 * cycle offset from startIdx, so the caller can advance its cycle pointer.
 */
function pickPortalX(state, cycle, startIdx, lastX) {
  const g = state.grid;
  const n = cycle.length;
  const open = [];
  for (let x = 0; x < g.cols; x++) {
    if (!g.isBlocked(x, 0)) open.push(x);
  }
  if (open.length) {
    const alt = open.filter((x) => x !== lastX);
    const pool = alt.length ? alt : open;
    for (let k = 0; k < n; k++) {
      const x = cycle[(startIdx + k) % n];
      if (pool.indexOf(x) !== -1) return { x, k };
    }
  }
  const occ = [];
  for (let x = 0; x < g.cols; x++) {
    let c = 0;
    for (let y = 0; y < g.rows; y++) if (g.isBlocked(x, y)) c++;
    occ.push(c);
  }
  const allFull = occ.every((c) => c === g.rows);
  if (allFull) return { x: g.spawn.x, k: 0 };
  const min = Math.min.apply(null, occ);
  const least = [];
  for (let x = 0; x < g.cols; x++) if (occ[x] === min) least.push(x);
  for (let k = 0; k < n; k++) {
    const x = cycle[(startIdx + k) % n];
    if (least.indexOf(x) !== -1) return { x, k };
  }
  return { x: g.spawn.x, k: 0 };
}

function relocatePortal(state) {
  const cycle = state.waves.portalCycle || [];
  if (!cycle.length) return;
  const startIdx = state.waves.portalIdx % cycle.length;
  const { x, k } = pickPortalX(state, cycle, startIdx, state.waves.lastPortalX);
  state.waves.portalIdx = (startIdx + k) % cycle.length;
  state.waves.lastPortalX = x;
  state.portal = { x, y: 0 };
  state.grid.setPortalX(x);
  emit(state, "portal_moved", { x, y: 0 });
}

export function dwellFor(state, w) {
  return Math.max(2.5, Math.min(8, 8 - 0.15 * (w - 1)));
}

/**
 * Clump-based spawning state machine.
 * Waves are divided into clumps - small bursts of enemies with pauses between.
 * Portal stretches out, moves to new column, stretches in, then spawns next clump.
 */

function initClumpState(wv) {
  const totalEnemies = wv.queue.length;
  if (totalEnemies === 0) return;

  const numClumps = Math.min(wv.clumps || 1, totalEnemies);

  // Stars-and-bars: pick (numClumps - 1) split points from [1..totalEnemies-1]
  const clumpSizes = randomPartition(totalEnemies, numClumps, wv.rand);

  // Compute per-wave base gap for within-clump spawning (jittered at spawn time)
  const w = wv.index || 1;
  const baseGap = Math.max(0.15, 0.5 - w * 0.018);

  wv.clumpState = {
    phase: 'spawning',
    clumpIdx: 0,
    totalClumps: numClumps,
    clumpSizes: clumpSizes,
    enemiesInClump: 0,
    timer: 0,
    targetX: null,
    baseGap: baseGap,
    portalShiftsUsed: 0,
    shiftsBudget: shiftsForWave(w),
  };

  wv.toSpawn = totalEnemies;
}

/** Stars-and-bars random partition: N enemies into K clumps, each >= 1. */
function randomPartition(total, k, rand) {
  if (k <= 1) return [total];
  if (k >= total) return Array(total).fill(1);

  // Pick (k-1) unique split points from [1..total-1]
  const points = [];
  const available = total - 1;
  // Fisher-Yates partial shuffle to pick k-1 unique positions
  const pool = [];
  for (let i = 1; i < total; i++) pool.push(i);
  for (let i = 0; i < k - 1; i++) {
    const j = i + ((rand() * (pool.length - i)) | 0);
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    points.push(pool[i]);
  }
  points.sort((a, b) => a - b);

  // Convert split points to sizes
  const sizes = [];
  let prev = 0;
  for (const p of points) {
    sizes.push(p - prev);
    prev = p;
  }
  sizes.push(total - prev);
  return sizes;
}

/** How many times the portal may shift during a given wave. */
function shiftsForWave(w) {
  if (w < 6)  return 0;
  if (w < 10) return 1;
  return 2 + Math.floor((w - 10) / 10);
}

function tickClumpState(state, wv) {
  const cs = wv.clumpState;
  if (!cs) return;
  
  cs.timer -= state.dt;
  
  switch (cs.phase) {
    case 'spawning': {
      if (wv.toSpawn > 0 && cs.timer <= 0) {
        spawnOne(state);
        wv.toSpawn -= 1;
        cs.enemiesInClump++;

        const currentClumpSize = cs.clumpSizes[cs.clumpIdx] || 1;
        
        if (cs.enemiesInClump >= currentClumpSize || wv.toSpawn === 0) {
          cs.phase = 'stretching_out';
          cs.timer = STRETCH_OUT_TIME;
          emit(state, "portal_clump_end", { clumpIdx: cs.clumpIdx });
        } else {
          // Jittered gap: ±30% of base gap for organic feel
          const jitter = cs.baseGap * (0.6 * (wv.rand ? wv.rand() : Math.random()) - 0.3);
          cs.timer = cs.baseGap + jitter;
        }
      }
      break;
    }
    
    case 'stretching_out': {
      if (cs.timer <= 0) {
        const isLastClump = cs.clumpIdx >= cs.totalClumps - 1 || wv.toSpawn === 0;
        if (!isLastClump) {
          if (state.modeEndless && cs.portalShiftsUsed < cs.shiftsBudget) {
            // Warning before portal shifts
            emit(state, "portal_unstable", { clumpIdx: cs.clumpIdx });
            cs.timer = 1.0; // 1 second warning
            cs.phase = 'portal_shifting';
          } else {
            cs.phase = 'moving';
            cs.timer = 0;
          }
        } else {
          cs.phase = 'idle';
        }
      }
      break;
    }
    
    case 'portal_shifting': {
      if (cs.timer <= 0) {
        if (cs.portalShiftsUsed < cs.shiftsBudget) {
          relocatePortal(state);
          cs.portalShiftsUsed++;
        }
        cs.phase = 'moving';
        cs.timer = 0;
        emit(state, "portal_move", { clumpIdx: cs.clumpIdx, x: state.portal.x });
      }
      break;
    }
    
    case 'moving': {
      cs.phase = 'stretching_in';
      cs.timer = STRETCH_IN_TIME;
      cs.clumpIdx++;
      cs.enemiesInClump = 0;
      emit(state, "portal_clump_start", { clumpIdx: cs.clumpIdx });
      break;
    }
    
    case 'stretching_in': {
      if (cs.timer <= 0) {
        if (cs.clumpIdx >= cs.totalClumps || wv.toSpawn === 0) {
          cs.phase = 'idle';
        } else {
          cs.phase = 'dwell';
          cs.timer = wv.interClumpDwell || INTER_CLUMP_DWELL_BASE;
        }
      }
      break;
    }

    case 'dwell': {
      if (cs.timer <= 0) {
        cs.phase = 'spawning';
        cs.timer = CLUMP_GAP;
      }
      break;
    }
    
    case 'idle':
    default:
      break;
  }
}
