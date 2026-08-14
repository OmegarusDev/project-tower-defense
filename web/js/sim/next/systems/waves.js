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
  state.waves.toSpawn = state.waves.queue.length;
  state.waves.spawnTimer = Math.min(0.2, state.waves.spawnGap);
  state.waves.active = true;
  buildPortal(state, w);
  emit(state, "wave_checkpoint", { wave: w });
  emit(state, "wave_composition", {
    count: state.waves.toSpawn,
    wave: w,
    theme: state.waves.theme,
    event: state.waves.event,
  });
}

export function tickWaves(state) {
  const wv = state.waves;
  if (!wv.active) return;
  if (wv.toSpawn > 0) {
    // Endless: the seam re-opens elsewhere after each dwell stretch
    if (state.modeEndless) {
      wv.portalTimer -= state.dt;
      if (wv.portalTimer <= 0) {
        wv.portalTimer = dwellFor(state, wv.index);
        wv.portalIdx += 1;
        relocatePortal(state);
      }
    }
    wv.spawnTimer -= state.dt;
    if (wv.spawnTimer <= 0) {
      spawnOne(state);
      wv.toSpawn -= 1;
      const jitter = state.modeEndless && wv.rand ? 0.85 + wv.rand() * 0.35 : 1;
      wv.spawnTimer = wv.spawnGap * jitter;
    }
  } else if (state.enemies.length === 0) {
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
  const dist = enemyDef(kind).flying ? g.airDist : g.groundDist;
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
    Math.pow(1.05, w - 1) *
    Math.pow(1.02, Math.max(0, w - 15)) *
    (opts.scale || 1);
  if (state.modeEndless) {
    scale *= Math.pow(1.08, Math.min(2, Math.max(0, w - 1)));
    scale *= Math.pow(1.025, Math.min(9, Math.max(0, w - 7)));
  }
  let speedMult = opts.speedMult != null ? opts.speedMult : state.waves.speedMult || 1;
  if (state.modeEndless) {
    const ramp = Math.min(0.45, (w - 1) * 0.015);
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

/** Endless only: seeded back-line portal cycle + dwell schedule (oracle order). */
function buildPortal(state, w) {
  if (!state.modeEndless) return;
  state.waves.portalRand = mulberry32(
    ((state.runSeed || 1) ^ (w * 0x9e3779b9) ^ 0x51ab3d) >>> 0
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
  state.waves.portalTimer = dwellFor(state, w);
  state.waves.lastPortalX = state.portal ? state.portal.x : -1;
  if (w <= 1) {
    state.portal = { x: state.grid.spawn.x, y: 0 };
  } else {
    relocatePortal(state);
  }
}

function relocatePortal(state) {
  const cycle = state.waves.portalCycle || [];
  if (!cycle.length) return;
  let x = cycle[state.waves.portalIdx % cycle.length];
  if (x === state.waves.lastPortalX) {
    state.waves.portalIdx = (state.waves.portalIdx + 1) % cycle.length;
    x = cycle[state.waves.portalIdx % cycle.length];
  }
  state.waves.lastPortalX = x;
  state.portal = { x, y: 0 };
  emit(state, "portal_moved", { x, y: 0 });
}

export function dwellFor(state, w) {
  return Math.max(2.5, Math.min(8, 8 - 0.15 * (w - 1)));
}
