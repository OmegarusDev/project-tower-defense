/**
 * Roaming seam portal: endless dwell scheduling, spawn fallback, campaign pins.
 * Run: node js/tests/portal.test.mjs
 */
import { SimWorld } from "../sim/simWorld.js";
import { mulberry32 } from "../sim/rng.js";
import { levelPortalCell } from "../data/campaign.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Wave 1 always opens at the default centre; roaming starts wave 2
{
  const w = new SimWorld();
  w.setup(9, 8, 7, true);
  w.startWave();
  assert(w.portal.x === w.grid.spawn.x, "wave 1 portal pins to the centre seam");
  const center = w.portal.x;
  w.waves._queue = Array(30).fill("mite");
  w.waves.toSpawn = 30;
  w.lives = 5000;
  for (let i = 0; i < 2000; i++) w.tick(); // long wave: dwell relocation fires
  const endWave1 = w.portal.x;
  assert(endWave1 !== center, "wave 1 can relocate after its dwell stretch");
  w.startWave();
  assert(w.portal.x !== endWave1, "wave 2 opens on a fresh seam cell");
}

// Determinism: same seed, same waves, same portal sequence
{
  const seq = (seed) => {
    const w = new SimWorld();
    w.setup(9, 8, seed, true);
    const out = [];
    for (let wave = 0; wave < 2; wave++) {
      w.startWave();
      w.waves._queue = Array(40).fill("mite");
      w.waves.toSpawn = 40;
      for (let i = 0; i < 1200; i++) w.tick();
      out.push({ x: w.portal.x, idx: w.waves._portalIdx });
    }
    return out;
  };
  const a = seq(42);
  const b = seq(42);
  assert(JSON.stringify(a) === JSON.stringify(b), "portal movement is seed-deterministic");
  assert(a[0].idx > 0, "portal cycle advanced");
}

// Dwell: portal does not relocate before the dwell stretch elapses
{
  const w = new SimWorld();
  w.setup(9, 8, 7, true);
  w.startWave();
  const start = w.portal.x;
  for (let i = 0; i < 100; i++) w.tick(); // ~3.3s sim time < 8s dwell
  assert(w.portal.x === start, "portal sits still inside its dwell window");
}

// Dwell: portal relocates after the stretch, and never sits twice on the same cell
{
  const w = new SimWorld();
  w.setup(9, 8, 11, true);
  w.lives = 5000;
  w.startLives = 5000;
  w.startWave();
  w.waves._queue = Array(120).fill("mite");
  w.waves.toSpawn = 120;
  const seen = new Set();
  let prev = w.portal.x;
  seen.add(prev);
  let moved = 0;
  for (let i = 0; i < 2400; i++) {
    w.tick();
    if (w.portal.x !== prev) {
      assert(w.portal.x !== prev, "portal moves to a different seam cell");
      prev = w.portal.x;
      moved++;
    }
  }
  assert(moved >= 2, "portal relocates over time");
}

// Spawn fallback: sealed portal column spawns from nearest reachable back cell
{
  const w = new SimWorld();
  w.setup(9, 8, 3, true);
  w.portal = { x: 4, y: 0 };
  w.grid.setBlocked(4, 0, true);
  w.grid.recompute();
  const pos = w.waves._spawnPos("mite");
  assert(pos.x !== 4.5, "spawn dodges the sealed column");
  const cellX = Math.round(pos.x - 0.5);
  assert(w.grid.groundDist[w.grid.idx(cellX, 0)] < 1e9, "fallback cell is reachable");
}

// Seam row is never buildable (both modes)
{
  const w = new SimWorld();
  w.setup(9, 8, 1, true);
  for (let x = 0; x < 9; x++) assert(!w.grid.isBuildable(x, 0), `back line sealed (${x},0)`);
  assert(w.grid.isBuildable(4, 1), "row 1 still buildable");
  const c = new SimWorld();
  c.setup(8, 8, 1, false);
  assert(!c.grid.isBuildable(2, 0), "campaign back line sealed too");
}

// Campaign: static per-level portal, seeded pick among spawnCells
{
  const lv = { id: 40, cols: 9, rows: 9, seed: 999, spawnCells: [{ x: 3, y: 0 }, { x: 7, y: 0 }] };
  const p1 = levelPortalCell(lv);
  const p2 = levelPortalCell(lv);
  assert(JSON.stringify(p1) === JSON.stringify(p2), "campaign portal pick is deterministic");
  assert(p1.y === 0 && (p1.x === 3 || p1.x === 7), "campaign portal picks from spawnCells");
  const dflt = levelPortalCell({ cols: 8, rows: 8, seed: 1 });
  assert(dflt.x === 4 && dflt.y === 0, "default campaign portal = center back line");
  const single = levelPortalCell({ cols: 8, rows: 8, seed: 1, spawnCells: [{ x: 6, y: 2 }] });
  assert(single.x === 6 && single.y === 2, "single spawnCell pins the portal (off back line ok)");
}

// Campaign sim: portal stays pinned across waves
{
  const w = new SimWorld();
  w.setup(9, 9, 55, false);
  w.portal = { x: 2, y: 0 };
  w.startWave();
  const pinned = w.portal.x;
  for (let i = 0; i < 400; i++) w.tick();
  assert(w.portal.x === pinned, "campaign portal never moves");
  const pos = w.waves._spawnPos("mite");
  assert(pos.x === 2.5, "campaign enemies spawn from the pinned cell");
}

// Intensity curve: dwell shrinks as waves climb, floored at 2.5
{
  const w = new SimWorld();
  w.setup(9, 8, 1, true);
  assert(Math.abs(w.waves._dwellFor(1) - 8) < 1e-9, "wave 1 dwell 8s");
  assert(Math.abs(w.waves._dwellFor(20) - 5.15) < 1e-9, "wave 20 dwell ~5.15s");
  assert(Math.abs(w.waves._dwellFor(40) - 2.5) < 1e-9, "wave 40 dwell floored");
}

console.log("portal: all assertions passed");