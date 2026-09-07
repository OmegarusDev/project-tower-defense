/**
 * Greedy endless bot — builds between waves; claims branch picks anytime.
 * Damage-first for pending picks. No mid-wave walls/towers.
 */

import { quoteTowerPlace, wallCost } from "../sim/systems/economy.js";

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Claim all pending branch picks (Damage first). */
export function claimBranchPicks(sim) {
  for (const t of sim.state.towers) {
    while ((t.pendingPicks | 0) > 0) {
      const r = sim.tryChooseLevelBranch(t.id, "damage");
      if (!r.ok) break;
    }
  }
}

function pathCells(grid) {
  const out = [];
  let x = grid.spawn.x;
  let y = grid.spawn.y;
  const seen = new Set();
  const limit = grid.cols * grid.rows;
  for (let i = 0; i < limit; i++) {
    const key = `${x},${y}`;
    if (seen.has(key)) break;
    seen.add(key);
    out.push({ x, y });
    if (grid.isExit(x, y)) break;
    const n = grid.groundNext[grid.idx(x, y)];
    if (!n || (n.x === x && n.y === y)) break;
    x = n.x;
    y = n.y;
  }
  return out;
}

function firstCompleteSlot(sim) {
  return sim.state.roster.findIndex((s) => s?.complete);
}

/** Place towers on cells orthogonal to the ground path (coverage first). */
function tryPlaceTowers(sim, maxPlaces = 5) {
  const slot = firstCompleteSlot(sim);
  if (slot < 0) return 0;
  const path = pathCells(sim.state.grid);
  const pathSet = new Set(path.map((c) => `${c.x},${c.y}`));
  const candidates = [];
  const seen = new Set();
  for (const c of path) {
    for (const [dx, dy] of DIRS) {
      const x = c.x + dx;
      const y = c.y + dy;
      const key = `${x},${y}`;
      if (seen.has(key) || pathSet.has(key)) continue;
      seen.add(key);
      if (!sim.state.grid.isBuildable(x, y)) continue;
      // Prefer mid-path (not spawn/exit fringe)
      const depth = Math.min(c.y, sim.state.grid.rows - 1 - c.y);
      candidates.push({ x, y, score: depth + (y > 1 ? 2 : 0) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  let placed = 0;
  for (const c of candidates) {
    if (placed >= maxPlaces) break;
    const quote = quoteTowerPlace(sim.state.economy, sim.state.roster[slot], sim.state.towers);
    // Keep a tiny reserve for a wall if none yet
    if (sim.state.economy.battle < quote.total) break;
    const res = sim.tryPlaceTower(c.x, c.y, slot);
    if (res.ok) placed += 1;
  }
  return placed;
}

/** Optional maze walls after towers — only while Coin stays comfortable. */
function tryPlaceWalls(sim, budget = 3) {
  if (sim.state.towers.length < 2) return 0;
  const path = pathCells(sim.state.grid);
  const pathSet = new Set(path.map((c) => `${c.x},${c.y}`));
  const slot = firstCompleteSlot(sim);
  const towerReserve =
    slot >= 0
      ? quoteTowerPlace(sim.state.economy, sim.state.roster[slot], sim.state.towers).total
      : 25;
  let placed = 0;
  for (const c of path) {
    if (placed >= budget) break;
    for (const [dx, dy] of DIRS) {
      if (placed >= budget) break;
      const x = c.x + dx;
      const y = c.y + dy;
      if (pathSet.has(`${x},${y}`)) continue;
      if (!sim.state.grid.isBuildable(x, y)) continue;
      const cost = wallCost(sim.state.economy, sim.playerWallCount());
      if (sim.state.economy.battle < cost + towerReserve) return placed;
      const before = pathCells(sim.state.grid).length;
      const res = sim.tryPlaceWall(x, y);
      if (!res.ok) continue;
      const after = pathCells(sim.state.grid).length;
      // Keep walls that lengthen the maze; undo ones that don't help.
      if (after <= before) {
        sim.trySellWall(res.wall.id);
        continue;
      }
      placed += 1;
    }
  }
  return placed;
}

/**
 * @param {import('../sim/sim.js').Sim} sim
 * @param {'betweenWaves'|'inWave'} phase
 */
export function greedyAct(sim, phase) {
  claimBranchPicks(sim);
  if (phase !== "betweenWaves") return;
  tryPlaceTowers(sim, 4);
  tryPlaceWalls(sim, 3);
  tryPlaceTowers(sim, 2);
  claimBranchPicks(sim);
}

export function makeGreedyBot() {
  return { act: greedyAct };
}
