import { RULES } from "../data/rules.js";
import { addBattle, spendBattle } from "../sim/systems/economy.js";

/**
 * Undo logic — pure mutations over (state, stack). No app, no DOM.
 * Each op returns { ok, msg? }; the app adapter handles HUD / toasts.
 */
export function undoPlaceTower(state, entry) {
  const t = state.towers.find((x) => x.id === entry.id);
  if (!t) return { ok: false, msg: "Undo expired" };
  addBattle(state.economy, t.paid | 0);
  state.grid.setBlocked(t.cell.x, t.cell.y, false);
  state.grid.setTower(t.cell.x, t.cell.y, false);
  state.towers = state.towers.filter((x) => x.id !== t.id);
  state.towersById.delete(t.id);
  state.grid.recompute();
  return { ok: true, msg: "Undid tower place" };
}

export function undoPlaceWall(state, entry) {
  const w = state.walls.find((x) => x.id === entry.id);
  if (!w || w.preplaced) return { ok: false, msg: "Undo expired" };
  addBattle(state.economy, w.paid | 0);
  state.grid.setBlocked(w.cell.x, w.cell.y, false);
  state.walls = state.walls.filter((x) => x.id !== w.id);
  state.grid.recompute();
  return { ok: true, msg: "Undid wall place" };
}

export function undoRestoreTower(state, entry) {
  const t = entry.tower;
  if (!t) return { ok: false, msg: "Undo expired" };
  if (!state.grid.isBuildable(t.cell.x, t.cell.y)) {
    return { ok: false, msg: "Can't undo — cell blocked" };
  }
  if ((state.economy.battle | 0) < (entry.refund | 0)) {
    return { ok: false, msg: "Need Coin to undo sell" };
  }
  spendBattle(state.economy, entry.refund | 0);
  state.grid.setBlocked(t.cell.x, t.cell.y, true);
  state.grid.setTower(t.cell.x, t.cell.y, true);
  const copy = structuredClone(t);
  state.towers.push(copy);
  state.towersById.set(copy.id, copy);
  state.grid.recompute();
  return { ok: true, msg: "Undid tower sell" };
}

export function undoRestoreWall(state, entry) {
  const w = entry.wall;
  if (!w) return { ok: false, msg: "Undo expired" };
  if (!state.grid.isBuildable(w.cell.x, w.cell.y)) {
    return { ok: false, msg: "Can't undo — cell blocked" };
  }
  if ((state.economy.battle | 0) < (entry.refund | 0)) {
    return { ok: false, msg: "Need Coin to undo sell" };
  }
  spendBattle(state.economy, entry.refund | 0);
  state.grid.setBlocked(w.cell.x, w.cell.y, true);
  state.walls.push(structuredClone(w));
  state.grid.recompute();
  return { ok: true, msg: "Undid wall sell" };
}

/** Pop + apply one entry. Returns { ok, msg } (msg also for empty). */
export function undoStep(state, stack) {
  if (!stack.length) return { ok: false, msg: "Nothing to undo" };
  const entry = stack[stack.length - 1];
  let r;
  if (entry.type === "place_tower") r = undoPlaceTower(state, entry);
  else if (entry.type === "place_wall") r = undoPlaceWall(state, entry);
  else if (entry.type === "sell_tower") r = undoRestoreTower(state, entry);
  else if (entry.type === "sell_wall") r = undoRestoreWall(state, entry);
  else return { ok: false, msg: "Undo expired" };
  if (!r.ok) return r;
  stack.pop();
  return r;
}

export function pushUndoEntry(stack, entry) {
  stack.push(entry);
  if (stack.length > RULES.UNDO_STACK_CAP) stack.shift();
}
