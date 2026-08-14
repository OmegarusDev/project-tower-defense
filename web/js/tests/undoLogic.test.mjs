/**
 * Undo logic — pure sim mutations over (sim, stack), no app/DOM.
 * Run: node js/tests/undoLogic.test.mjs
 */
import { Sim } from "../sim/next/sim.js";
import { makeSlot } from "../data/parts.js";
import { undoStep, pushUndoEntry } from "../app/undoLogic.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function world() {
  const sim = new Sim();
  sim.setup(9, 8, 7, true);
  sim.setRoster([makeSlot("sentry", "single", "kinetic", 1)]);
  sim.economy.battle = 500;
  return sim;
}

function placeTower(sim) {
  for (let y = 2; y < sim.grid.rows - 2; y++) {
    for (let x = 2; x < sim.grid.cols - 2; x++) {
      if (sim.grid.isBuildable(x, y)) {
        const r = sim.tryPlaceTower(x, y, 0);
        if (r.ok) return r.tower;
      }
    }
  }
  throw new Error("no buildable cell");
}

// Undo a tower place: full refund + grid freed
{
  const sim = world();
  const t = placeTower(sim);
  const paid = t.paid;
  const stack = [];
  pushUndoEntry(stack, { type: "place_tower", id: t.id });
  const battle0 = sim.economy.battle;
  const r = undoStep(sim, stack);
  assert(r.ok, "undo tower ok");
  assert(sim.towers.length === 0, "tower removed");
  assert(sim.economy.battle === battle0 + paid, "full refund");
  assert(sim.grid.isBuildable(t.cell.x, t.cell.y), "cell freed");
  assert(stack.length === 0, "entry popped");
}

// Undo expired (tower gone already)
{
  const sim = world();
  const stack = [{ type: "place_tower", id: 9999 }];
  const r = undoStep(sim, stack);
  assert(!r.ok && r.msg === "Undo expired", "expired entry");
  assert(stack.length === 1, "expired entry stays (retry semantics)");
}

// Undo a tower sell: restore snapshot, refund spent, entry stays on failure
{
  const sim = world();
  const t = placeTower(sim);
  const snap = structuredClone(t);
  const sold = sim.trySellTower(t.id);
  assert(sold.ok, "sold");
  const stack = [];
  pushUndoEntry(stack, { type: "sell_tower", tower: snap, refund: sold.refund | 0 });
  // block the cell so the restore fails -> entry re-queued
  sim.grid.setBlocked(snap.cell.x, snap.cell.y, true);
  sim.grid.recompute();
  const r1 = undoStep(sim, stack);
  assert(!r1.ok, "blocked cell rejects restore");
  assert(stack.length === 1, "failed restore keeps entry");
  sim.grid.setBlocked(snap.cell.x, snap.cell.y, false);
  sim.grid.recompute();
  const battle0 = sim.economy.battle;
  const r2 = undoStep(sim, stack);
  assert(r2.ok, "restore succeeds after unblocking");
  assert(sim.towers.some((x) => x.id === snap.id), "tower back");
  assert(sim.economy.battle === battle0 - (sold.refund | 0), "refund repaid");
}

// Wall place undo + preplaced protection
{
  const sim = world();
  const r = sim.tryPlaceWall(2, 3);
  assert(r.ok, "wall placed");
  const stack = [];
  pushUndoEntry(stack, { type: "place_wall", id: r.wall.id });
  const r2 = undoStep(sim, stack);
  assert(r2.ok && sim.walls.length === 0, "wall undone");
}

// Nothing to undo
{
  const sim = world();
  const r = undoStep(sim, []);
  assert(!r.ok && r.msg === "Nothing to undo", "empty stack");
}

console.log("ALL undoLogic tests passed");
