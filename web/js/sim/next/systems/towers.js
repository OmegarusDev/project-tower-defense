/**
 * Towers & walls — placement, sell, branch picks, stall guard, preWalls.
 * The tower object shape is save-format: loadCheckpoint rebuilds from it.
 */
import { XP_TO_POINT } from "../../../data/parts.js";
import { INF } from "../../boardGrid.js";
import { allocId, emit, logAction } from "../state.js";
import {
  quoteTowerPlace,
  spendBattle,
  wallCost,
} from "./economy.js";

export function stallsAt(state, cx, cy) {
  const g = state.grid;
  if (!g.inBounds(cx, cy)) return true;
  const cur = g.groundDist[g.idx(cx, cy)];
  if (cur >= INF) return true;
  const dirs = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ];
  for (const [dx, dy] of dirs) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (!g.inBounds(nx, ny)) continue;
    if (g.isBlocked(nx, ny)) continue;
    const nd = g.groundDist[g.idx(nx, ny)];
    if (nd < INF && nd < cur) return false;
  }
  return true;
}

export function tryPlaceWall(state, x, y) {
  if (!state.grid.isBuildable(x, y)) return { ok: false, reason: "blocked" };
  const cost = wallCost(state.economy, playerWallCount(state));
  if (state.economy.battle < cost) return { ok: false, reason: "need_battle", need: cost };
  state.grid.setBlocked(x, y, true);
  if (!state.grid.hasGroundPath()) {
    state.grid.setBlocked(x, y, false);
    state.grid.recompute();
    return { ok: false, reason: "path_sealed" };
  }
  // Never wall a live enemy into a stall (its cell OR its glide target
  // losing every reachable downhill step) — the wave would never end.
  const sealed = state.enemies.some(
    (e) =>
      !e.flying &&
      (stallsAt(state, e.cell.x, e.cell.y) ||
        (e._pick && stallsAt(state, e._pick.bx, e._pick.by)))
  );
  if (sealed) {
    state.grid.setBlocked(x, y, false);
    state.grid.recompute();
    return { ok: false, reason: "seals_enemy" };
  }
  spendBattle(state.economy, cost);
  const wall = { id: allocId(state), cell: { x, y }, paid: cost };
  state.walls.push(wall);
  state.grid.recompute();
  logAction(state, "place_wall", { x, y });
  emit(state, "wall_placed", { wall });
  return { ok: true, wall };
}

export function tryPlaceTower(state, x, y, slotIndex) {
  const loadout = state.roster[slotIndex];
  if (!loadout?.complete) return { ok: false, reason: "incomplete_triad" };
  if (!state.grid.isBuildable(x, y)) return { ok: false, reason: "blocked" };
  const quote = quoteTowerPlace(state.economy, loadout.placeCost, state.towers.length);
  const cost = quote.total;
  const surcharge = quote.surcharge;
  if (state.economy.battle < cost) return { ok: false, reason: "need_battle", need: cost };
  state.grid.setBlocked(x, y, true);
  if (!state.grid.hasGroundPath()) {
    state.grid.setBlocked(x, y, false);
    state.grid.recompute();
    return { ok: false, reason: "path_sealed" };
  }
  spendBattle(state.economy, cost);
  const tower = {
    id: allocId(state),
    cell: { x, y },
    slot: slotIndex,
    base: loadout.base,
    barrel: loadout.barrel,
    payload: loadout.payload,
    paid: cost,
    level: 1,
    xp: 0,
    xpToPoint: XP_TO_POINT,
    pendingPicks: 0,
    branch: { damage: 0, rof: 0, range: 0 },
    levelCap: Math.max(loadout.levelCap | 0, state.runLevelCap | 0, 1),
    cooldown: 0,
    targetId: -1,
    aimAngle: -Math.PI / 2,
  };
  state.towers.push(tower);
  state.towersById.set(tower.id, tower);
  state.grid.setTower(x, y, true);
  state.grid.recompute();
  logAction(state, "place_tower", { x, y, slot: slotIndex });
  emit(state, "tower_placed", { tower, surcharge });
  return { ok: true, tower, surcharge };
}

export function trySellTower(state, id) {
  const i = state.towers.findIndex((t) => t.id === id);
  if (i < 0) return { ok: false, reason: "missing" };
  const t = state.towers[i];
  const rate = state.sellRefundMult > 0 ? state.sellRefundMult : 0.5;
  const refund = (t.paid * rate) | 0;
  state.economy.battle += refund;
  state.grid.setBlocked(t.cell.x, t.cell.y, false);
  state.grid.setTower(t.cell.x, t.cell.y, false);
  state.towers.splice(i, 1);
  state.towersById.delete(t.id);
  state.grid.recompute();
  logAction(state, "sell_tower", { id });
  emit(state, "tower_sold", { id, refund });
  return { ok: true, refund };
}

export function trySellWall(state, id) {
  const i = state.walls.findIndex((w) => w.id === id);
  if (i < 0) return { ok: false, reason: "missing" };
  const w = state.walls[i];
  if (w.preplaced) return { ok: false, reason: "preplaced" };
  const rate = state.sellRefundMult > 0 ? state.sellRefundMult : 0.5;
  const refund = (w.paid * rate) | 0;
  state.economy.battle += refund;
  state.grid.setBlocked(w.cell.x, w.cell.y, false);
  state.walls.splice(i, 1);
  state.grid.recompute();
  logAction(state, "sell_wall", { id });
  emit(state, "wall_sold", { id, refund });
  return { ok: true, refund };
}

export function tryChooseLevelBranch(state, towerId, branch) {
  const t = state.towers.find((x) => x.id === towerId);
  if (!t) return { ok: false, reason: "missing" };
  if (branch !== "damage" && branch !== "rof" && branch !== "range") {
    return { ok: false, reason: "bad_branch" };
  }
  if ((t.pendingPicks | 0) <= 0) return { ok: false, reason: "no_picks" };
  t.pendingPicks = (t.pendingPicks | 0) - 1;
  if (!t.branch) t.branch = { damage: 0, rof: 0, range: 0 };
  t.branch[branch] = (t.branch[branch] | 0) + 1;
  invalidatePlans(state);
  logAction(state, "level_branch", {
    id: towerId,
    branch,
    ranks: { ...t.branch },
    pendingPicks: t.pendingPicks | 0,
  });
  emit(state, "level_branch", {
    tower: t,
    branch,
    ranks: { ...t.branch },
    pendingPicks: t.pendingPicks | 0,
    x: t.cell.x + 0.5,
    y: t.cell.y + 0.5,
  });
  return {
    ok: true,
    branch,
    pendingPicks: t.pendingPicks | 0,
    ranks: { ...t.branch },
  };
}

export function playerWallCount(state) {
  return state.walls.filter((w) => !w.preplaced).length;
}

/** Seeded map debris — unsellable, free. */
export function applyPreWalls(state, cells) {
  for (const c of cells || []) {
    if (!state.grid.isBuildable(c.x, c.y)) continue;
    state.grid.setBlocked(c.x, c.y, true);
    if (!state.grid.hasGroundPath()) {
      state.grid.setBlocked(c.x, c.y, false);
      continue;
    }
    state.walls.push({
      id: allocId(state),
      cell: { x: c.x, y: c.y },
      paid: 0,
      preplaced: true,
    });
  }
  state.grid.recompute();
}

function invalidatePlans(state) {
  state.plans.clear();
}
