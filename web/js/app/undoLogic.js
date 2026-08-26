import { RULES } from "../data/rules.js";

/**
 * Undo logic — PURE sim mutations over (sim, stack, entry). No app, no DOM,
 * no synth, no toasts. Each op returns { ok, msg? } and performs the sim
 * mutation; the app adapter handles board invalidation + HUD refresh + UI
 * feedback. The undo stack contract:
 *  - place_* entries pop off; expired entries (missing entity) fail.
 *  - sell_* entries fail (and are RE-PUSHED) when the cell is blocked or
 *    the refund isn't affordable.
 */
export function undoPlaceTower(sim, entry) {
  const t = sim.towers.find((x) => x.id === entry.id);
  if (!t) return { ok: false, msg: "Undo expired" };
  // Full refund of paid Coin (undo ≠ sell).
  sim.economy.addBattle(t.paid | 0);
  sim.grid.setBlocked(t.cell.x, t.cell.y, false);
  sim.grid.setTower(t.cell.x, t.cell.y, false);
  sim.towers = sim.towers.filter((x) => x.id !== t.id);
  sim.grid.recompute();
  return { ok: true, msg: "Undid tower place" };
}

export function undoPlaceWall(sim, entry) {
  const w = sim.walls.find((x) => x.id === entry.id);
  if (!w || w.preplaced) return { ok: false, msg: "Undo expired" };
  sim.economy.addBattle(w.paid | 0);
  sim.grid.setBlocked(w.cell.x, w.cell.y, false);
  sim.walls = sim.walls.filter((x) => x.id !== w.id);
  sim.grid.recompute();
  return { ok: true, msg: "Undid wall place" };
}

export function undoRestoreTower(sim, entry) {
  const t = entry.tower;
  if (!t) return { ok: false, msg: "Undo expired" };
  if (!sim.grid.isBuildable(t.cell.x, t.cell.y)) {
    return { ok: false, msg: "Can't undo — cell blocked" };
  }
  if ((sim.economy.battle | 0) < (entry.refund | 0)) {
    return { ok: false, msg: "Need Coin to undo sell" };
  }
  sim.economy.spendBattle(entry.refund | 0);
  sim.grid.setBlocked(t.cell.x, t.cell.y, true);
  sim.grid.setTower(t.cell.x, t.cell.y, true);
  sim.towers.push(structuredClone(t));
  sim.grid.recompute();
  return { ok: true, msg: "Undid tower sell" };
}

export function undoRestoreWall(sim, entry) {
  const w = entry.wall;
  if (!w) return { ok: false, msg: "Undo expired" };
  if (!sim.grid.isBuildable(w.cell.x, w.cell.y)) {
    return { ok: false, msg: "Can't undo — cell blocked" };
  }
  if ((sim.economy.battle | 0) < (entry.refund | 0)) {
    return { ok: false, msg: "Need Coin to undo sell" };
  }
  sim.economy.spendBattle(entry.refund | 0);
  sim.grid.setBlocked(w.cell.x, w.cell.y, true);
  sim.walls.push(structuredClone(w));
  sim.grid.recompute();
  return { ok: true, msg: "Undid wall sell" };
}

/** Pop + apply one entry. Returns { ok, msg } (msg also for empty). */
export function undoStep(sim, stack) {
  if (!stack.length) return { ok: false, msg: "Nothing to undo" };
  const entry = stack[stack.length - 1];
  let r;
  if (entry.type === "place_tower") r = undoPlaceTower(sim, entry);
  else if (entry.type === "place_wall") r = undoPlaceWall(sim, entry);
  else if (entry.type === "sell_tower") r = undoRestoreTower(sim, entry);
  else if (entry.type === "sell_wall") r = undoRestoreWall(sim, entry);
  else return { ok: false, msg: "Undo expired" };
  if (!r.ok) {
    // Failed restores keep their entry on the stack (retry later).
    return r;
  }
  stack.pop();
  return r;
}

export function pushUndoEntry(stack, entry) {
  stack.push(entry);
  if (stack.length > RULES.UNDO_STACK_CAP) stack.shift();
}
