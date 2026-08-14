/** Run: node js/tests/boardGrid.test.mjs */
import { BoardGrid, INF } from "../sim/boardGrid.js";
import { Sim } from "../sim/next/sim.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

{
  // Regression: a symmetric fork must not freeze enemies. The spawn cell
  // (4,0) has three equal-cost exits once (4,2)+(4,3) are walled; enemies
  // used to re-roll the tie every tick (tick-mixed hash) and jitter forever.
  const sim = new Sim();
  sim.setup(9, 8, 1, true);
  sim.grid.setBlocked(4, 2, true);
  sim.grid.setBlocked(4, 3, true);
  sim.grid.recompute();
  sim.lives = 5000;
  sim.waves.queue = Array(12).fill("mite");
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

  // TIERED PATHING: the tower at (1,2) sits beside the LEFT lane. A shortest
  // enemy ignores it entirely (pool of two, hash pick); an evade enemy takes
  // the right (far) lane every time.
  const eA = {};
  const eB = {};
  const mite1 = g3.pickNextGround(g3.spawn.x, g3.spawn.y, { entity: eA, avoid: "none" });
  const mite2 = g3.pickNextGround(g3.spawn.x, g3.spawn.y, { entity: eB, avoid: "none" });
  assert(
    (mite1.x === 1 || mite1.x === 3) && (mite2.x === 1 || mite2.x === 3),
    "shortest ignores towers (equal options stay open)"
  );
  const eC = {};
  const skulk1 = g3.pickNextGround(g3.spawn.x, g3.spawn.y, { entity: eC, avoid: "hard" });
  const eD = {};
  const skulk2 = g3.pickNextGround(g3.spawn.x, g3.spawn.y, { entity: eD, avoid: "hard" });
  assert(skulk1.x === 3 && skulk2.x === 3, `evade always takes the far lane (got ${skulk1.x},${skulk2.x})`);

  // Without the tower bias, live picks alternate strictly: enemy 1 -> lane A,
  // enemy 2 -> lane B, enemy 3 -> A.
  g3.setTower(1, 2, false);
  g3.recompute();
  const e1 = {};
  const n1 = g3.pickNextGround(g3.spawn.x, g3.spawn.y, { entity: e1, avoid: "soft" });
  const e2 = {};
  const n2 = g3.pickNextGround(g3.spawn.x, g3.spawn.y, { entity: e2, avoid: "soft" });
  const e3 = {};
  const n3 = g3.pickNextGround(g3.spawn.x, g3.spawn.y, { entity: e3, avoid: "soft" });
  assert(n1.x !== n2.x || n1.y !== n2.y, "consecutive enemies alternate lanes");
  assert(n3.x === n1.x && n3.y === n1.y, "third enemy cycles back to lane A");

  // Stability: the same enemy re-picking the same cell (mid-glide) keeps its branch.
  const again = g3.pickNextGround(g3.spawn.x, g3.spawn.y, { entity: e1, avoid: "soft" });
  const again2 = g3.pickNextGround(g3.spawn.x, g3.spawn.y, { entity: e1, avoid: "soft" });
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
      avoid: "none",
    });
    const key = `${n.x},${n.y}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const vals = [...counts.values()].sort((a, b) => b - a);
  assert(vals.length >= 2, `multiple equal next cells used (${[...counts.keys()].join("|")})`);
  // Strict round-robin: the two lanes split ~evenly
  assert(Math.abs(vals[0] - vals[1]) <= 1, `tie-split alternates evenly (${[...counts.entries()].map(([k, v]) => `${k}:${v}`).join(",")})`);
}

{
  // Softlock regression: walling the last exit of a pocket around a live
  // enemy must be rejected — a sealed enemy stalls forever and the wave
  // never ends. Walls that leave a downhill route stay legal.
  const sim = new Sim();
  sim.setup(9, 8, 5, true);
  sim.lives = 5000;
  sim.economy.battle = 5000;
  sim.waves.queue = Array(1).fill("mite");
  sim.waves.toSpawn = 1;
  sim.waves.spawnTimer = 0;
  sim.startWave({ earlyBonus: 0 });
  // startWave re-composes the queue — pin it to a single mite.
  sim.waves.queue = ["mite"];
  sim.waves.toSpawn = 1;
  for (let t = 0; t < 240; t++) sim.tick(); // mite walks to mid-board
  const e = sim.enemies[0];
  assert(e, "mite spawned");
  const cx = e.cell.x;
  const cy = e.cell.y;
  assert(cy >= 2 && cy <= 5, `mite mid-board (${cx},${cy})`);
  // Box the mite: above, left, right, then try closing the exit below.
  const box = [
    { x: cx, y: cy - 1 },
    { x: cx - 1, y: cy },
    { x: cx + 1, y: cy },
  ];
  for (const w of box) {
    const r = sim.tryPlaceWall(w.x, w.y);
    assert(r.ok, "box side wall places");
  }
  const mouth = { x: cx, y: cy + 1 };
  assert(sim.grid.isBuildable(mouth.x, mouth.y), "mouth open");
  const res = sim.tryPlaceWall(mouth.x, mouth.y);
  assert(res.reason === "seals_enemy", `closing the pocket rejected (got ${res.reason || res.ok})`);
  assert(!sim.walls.some((w) => w.cell.x === mouth.x && w.cell.y === mouth.y), "sealing wall not placed");
}

console.log("ALL boardGrid tests passed");

{
  // STRUCTURAL LINK: preview options === live pick pool, by construction.
  const g5 = new BoardGrid();
  g5.setup(5, 7);
  g5.setBlocked(g5.spawn.x, 1, true);
  g5.recompute();
  assert(g5.hasGroundPath(), "detour open");

  const opts = g5.groundOptions(g5.spawn.x, g5.spawn.y);
  assert(opts.length === 2, `fork exposes both options (got ${opts.length})`);

  // The canonical preview pick is one of the options; live picks (many
  // enemies, both avoid modes) can only ever return pool members.
  const canon = g5.canonicalGround(g5.spawn.x, g5.spawn.y);
  assert(opts.some((o) => o.x === canon.x && o.y === canon.y), "canonical pick is in the pool");
  for (let i = 0; i < 40; i++) {
    const p = g5.pickNextGround(g5.spawn.x, g5.spawn.y, { entity: {}, avoid: "soft" });
    assert(opts.some((o) => o.x === p.x && o.y === p.y), `live pick in pool (got ${p.x},${p.y})`);
  }

  // The preview (stub camera) returns the trunk + the alternative branch,
  // and both lanes reach the exit.
  const { pathPoints } = await import("../view/next/boardScene.js");
  const cam = { projectCell: (x, y) => ({ x, y, s: 1 }) };
  const { trunk, branches } = pathPoints(cam, g5, g5.spawn.x);
  const allPts = [...trunk, ...branches.flat()];
  const laneX = new Set(allPts.map((p) => Math.round(p.x)));
  assert(branches.length >= 1, `alternative branch drawn (got ${branches.length})`);
  const exitReached = allPts.some((p) => p.y === g5.rows - 1);
  assert(exitReached, "preview paths reach the exit row");
}

{
  // HARD AVOID: monotonic + exits — the evade walk never stalls and always
  // reaches the exit row, even with towers lining the mid-board.
  const g6 = new BoardGrid();
  g6.setup(9, 9);
  // wall a wiggly corridor so the shortest route is flanky anyway
  for (let y = 1; y < 8; y++) g6.setBlocked(4, y, true);
  g6.setBlocked(5, 3, true);
  g6.setBlocked(3, 6, true);
  // towers beside the corridor — evade must hug the far edge, never stall
  g6.setTower(1, 4, true);
  g6.setTower(1, 5, true);
  g6.setTower(7, 4, true);
  g6.setTower(7, 5, true);
  g6.recompute();
  assert(g6.hasGroundPath(), "corridor open");
  let cell = { ...g6.spawn };
  let steps = 0;
  let minDist = g6.groundDist[g6.idx(cell.x, cell.y)];
  while (!g6.isExit(cell.x, cell.y) && steps++ < 120) {
    const n = g6.pickNextGround(cell.x, cell.y, { entity: {}, avoid: "hard" });
    assert(!(n.x === cell.x && n.y === cell.y), "hard avoid never stalls");
    const nd = g6.groundDist[g6.idx(n.x, n.y)];
    assert(nd < minDist, "hard avoid strictly descends (never lengthens)");
    minDist = nd;
    cell = n;
  }
  assert(g6.isExit(cell.x, cell.y), "hard avoid reaches the exit row");
}

{
  // SKULK: def + endless unlock windows + composition gating.
  const { enemyDef, ENEMY_COST } = await import("../data/enemies.js");
  const { composeEndlessWave } = await import("../data/waveScripts.js");
  const def = enemyDef("skulk");
  assert(def.pathing === "evade", "skulk is an evader");
  assert(ENEMY_COST.skulk === 3.2, "skulk costs 3.2");
  // wave 3: never present; wave 4+: possible but ramp-gated; wave 10: common
  let s0 = 12345;
  const rng = () => {
    s0 = (s0 * 1664525 + 1013904223) >>> 0;
    return s0 / 4294967296;
  };
  let seen = { w3: 0, w4: 0, w10: 0 };
  for (let i = 0; i < 200; i++) {
    const q3 = composeEndlessWave(3, rng);
    const q4 = composeEndlessWave(4, rng);
    const q10 = composeEndlessWave(10, rng);
    if (q3.queue.includes("skulk")) seen.w3++;
    if (q4.queue.includes("skulk")) seen.w4++;
    if (q10.queue.includes("skulk")) seen.w10++;
  }
  assert(seen.w3 === 0, `skulk never before wave 4 (got ${seen.w3}/200)`);
  assert(seen.w4 > 0 && seen.w4 < 200, `skulk intermittent at wave 4 (got ${seen.w4}/200)`);
  assert(seen.w10 > seen.w4, `skulk ramps up by wave 10 (${seen.w10} vs ${seen.w4})`);
}
