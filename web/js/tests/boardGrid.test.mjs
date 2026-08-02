/** Run: node js/tests/boardGrid.test.mjs */
import { BoardGrid, INF } from "../sim/boardGrid.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const g = new BoardGrid();
g.setup(7, 9);
assert(g.hasGroundPath(), "empty path");
let cell = { ...g.spawn };
for (let i = 0; i < 64; i++) {
  const n = g.nextGround(cell.x, cell.y);
  if (n.x === g.exit.x && n.y === g.exit.y) {
    cell = n;
    break;
  }
  assert(!(n.x === cell.x && n.y === cell.y), "stuck");
  cell = n;
}
assert(cell.x === g.exit.x && cell.y === g.exit.y, "reach exit");

const g2 = new BoardGrid();
g2.setup(5, 6);
for (let x = 0; x < g2.cols; x++) g2.setBlocked(x, 2, true);
g2.recompute();
assert(!g2.hasGroundPath(), "sealed ground");
assert(g2.airDist[g2.idx(g2.spawn.x, g2.spawn.y)] < INF, "air ok");

console.log("ALL boardGrid tests passed");
