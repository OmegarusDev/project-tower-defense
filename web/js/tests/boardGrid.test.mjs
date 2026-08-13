/** Run: node js/tests/boardGrid.test.mjs */
import { BoardGrid, INF } from "../sim/boardGrid.js";
import { SimWorld } from "../sim/simWorld.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

{
  // Regression: a symmetric fork must not freeze enemies. The spawn cell
  // (4,0) has three equal-cost exits once (4,2)+(4,3) are walled; enemies
  // used to re-roll the tie every tick (tick-mixed hash) and jitter forever.
  const sim = new SimWorld();
  sim.setup(9, 8, 1, true);
  sim.grid.setBlocked(4, 2, true);
  sim.grid.setBlocked(4, 3, true);
  sim.grid.recompute();
  sim.lives = 5000;
  sim.waves._queue = Array(12).fill("mite");
  sim.waves.toSpawn = 12;
  sim.waves.spawnTimer = 0;
  sim.startWave({ earlyBonus: 0 });
  for (let t = 0; t < 600; t++) sim.tick();
  const stuck = sim.enemies.filter((e) => e.cell.y < 2).length;
  assert(stuck === 0, `no enemy frozen at the fork (got ${stuck})`);

  // Strict alternation at the fork: alive enemies should be split across the
  // two lanes (left x<4 vs right x>4), not all on one side.
  const left = sim.enemies.filter((e) => e.pos.x < 4).length;
  const right = sim.enemies.filter((e) => e.pos.x > 4).length;
  assert(left > 0 && right > 0, `fork splits traffic (L=${left} R=${right})`);
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

  // Tower-avoid: the tower at (1,2) makes the right lane (3,0) strictly cheaper,
  // so every pick must go there (pool of one).
  const eA = {};
  const eB = {};
  const away1 = g3.pickNextGround(g3.spawn.x, g3.spawn.y, { entity: eA, avoidTowers: true });
  const away2 = g3.pickNextGround(g3.spawn.x, g3.spawn.y, { entity: eB, avoidTowers: true });
  assert(away1.x === 3 && away2.x === 3, `avoiders prefer the lane away from the tower (got ${away1.x},${away2.x})`);

  // Without the tower bias, live picks alternate strictly: enemy 1 -> lane A,
  // enemy 2 -> lane B, enemy 3 -> A.
  g3.setTower(1, 2, false);
  g3.recompute();
  const e1 = {};
  const n1 = g3.pickNextGround(g3.spawn.x, g3.spawn.y, { entity: e1, avoidTowers: true });
  const e2 = {};
  const n2 = g3.pickNextGround(g3.spawn.x, g3.spawn.y, { entity: e2, avoidTowers: true });
  const e3 = {};
  const n3 = g3.pickNextGround(g3.spawn.x, g3.spawn.y, { entity: e3, avoidTowers: true });
  assert(n1.x !== n2.x || n1.y !== n2.y, "consecutive enemies alternate lanes");
  assert(n3.x === n1.x && n3.y === n1.y, "third enemy cycles back to lane A");

  // Stability: the same enemy re-picking the same cell (mid-glide) keeps its branch.
  const again = g3.pickNextGround(g3.spawn.x, g3.spawn.y, { entity: e1, avoidTowers: true });
  const again2 = g3.pickNextGround(g3.spawn.x, g3.spawn.y, { entity: e1, avoidTowers: true });
  assert(again.x === n1.x && again.y === n1.y, "re-pick is stable for the same enemy");
  assert(again2.x === n1.x && again2.y === n1.y, "re-pick stays stable across ticks");
}

{
  // Fair tie-split: wall under spawn forces equal left/right first steps.
  const g4 = new BoardGrid();
  g4.setup(5, 7);
  g4.setBlocked(g4.spawn.x, 1, true);
  g4.recompute();
  assert(g4.hasGroundPath(), "detour path open");
  const counts = new Map();
  for (let i = 0; i < 200; i++) {
    const n = g4.pickNextGround(g4.spawn.x, g4.spawn.y, {
      entity: {},
      avoidTowers: false,
    });
    const key = `${n.x},${n.y}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const vals = [...counts.values()].sort((a, b) => b - a);
  assert(vals.length >= 2, `multiple equal next cells used (${[...counts.keys()].join("|")})`);
  // Strict round-robin: the two lanes split ~evenly
  assert(Math.abs(vals[0] - vals[1]) <= 1, `tie-split alternates evenly (${[...counts.entries()].map(([k, v]) => `${k}:${v}`).join(",")})`);
}

console.log("ALL boardGrid tests passed");
