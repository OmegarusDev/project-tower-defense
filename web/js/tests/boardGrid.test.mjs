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

{
  // Open corridor: two equal-length columns. Place a tower beside one lane.
  const g3 = new BoardGrid();
  g3.setup(5, 6);
  // Block center column so left (x=1) and right (x=3) are equal shortest from spawn (2,0)
  for (let y = 1; y < 5; y++) g3.setBlocked(2, y, true);
  g3.setBlocked(0, 1, true);
  g3.setBlocked(4, 1, true);
  g3.setTower(1, 2, true);
  g3.recompute();
  assert(g3.hasGroundPath(), "corridor open");
  assert(g3.towerProximity(1, 1) > 0 || g3.towerProximity(1, 3) > 0 || g3.towerProximity(0, 2) > 0, "prox field near tower");

  // From spawn, both x=1 and x=3 are often equal-distance; avoiders prefer lower towerProx.
  let avoidLeft = 0;
  let avoidRight = 0;
  for (let id = 1; id <= 80; id++) {
    const n = g3.pickNextGround(g3.spawn.x, g3.spawn.y, {
      id,
      tick: id * 3,
      avoidTowers: true,
    });
    if (n.x === 1) avoidLeft++;
    if (n.x === 3) avoidRight++;
  }
  // Soft avoid: when both are shortest, prefer the side away from the tower at (1,2).
  assert(avoidRight + avoidLeft > 40, "spawn forks into lanes");
  assert(avoidRight > avoidLeft, `avoiders prefer away from tower (L=${avoidLeft} R=${avoidRight})`);

  let ignoreLeft = 0;
  let ignoreRight = 0;
  for (let id = 1; id <= 80; id++) {
    const n = g3.pickNextGround(g3.spawn.x, g3.spawn.y, {
      id,
      tick: id * 3,
      avoidTowers: false,
    });
    if (n.x === 1) ignoreLeft++;
    if (n.x === 3) ignoreRight++;
  }
  // Without avoid, fair hash should use both sides (not stuck on one).
  assert(ignoreLeft > 10 && ignoreRight > 10, `ignoreTowerAvoid splits (L=${ignoreLeft} R=${ignoreRight})`);
}

{
  // Fair tie-split: wall under spawn forces equal left/right first steps.
  const g4 = new BoardGrid();
  g4.setup(5, 7);
  g4.setBlocked(g4.spawn.x, 1, true);
  g4.recompute();
  assert(g4.hasGroundPath(), "detour path open");
  const counts = new Map();
  for (let id = 0; id < 200; id++) {
    const n = g4.pickNextGround(g4.spawn.x, g4.spawn.y, {
      id,
      tick: id,
      avoidTowers: false,
    });
    const key = `${n.x},${n.y}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const vals = [...counts.values()].sort((a, b) => b - a);
  assert(vals.length >= 2, `multiple equal next cells used (${[...counts.keys()].join("|")})`);
  // Roughly balanced: top two within 3× of each other (hash fairness)
  assert(vals[0] < vals[1] * 3.5, `tie-split roughly balanced (${[...counts.entries()].map(([k, v]) => `${k}:${v}`).join(",")})`);
}

console.log("ALL boardGrid tests passed");
