/**
 * Roaming seam portal: endless dwell scheduling, spawn fallback, campaign pins.
 * Run: node js/tests/portal.test.mjs
 */
import { Sim } from "../sim/next/sim.js";
import { dwellFor, spawnPos } from "../sim/next/systems/waves.js";
import { levelPortalCell } from "../data/campaign.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function newWorld(cols = 9, rows = 8, seed = 7, endless = true) {
  const w = new Sim();
  w.setup(cols, rows, seed, endless);
  return w;
}

// Wave 1 always opens at the default centre; roaming starts wave 2
{
  const w = newWorld(9, 8, 7, true);
  w.startWave();
  assert(w.portal.x === w.grid.spawn.x, "wave 1 portal pins to the centre seam");
  const center = w.portal.x;
  const s = w._s;
  s.waves.queue = Array(30).fill("mite");
  s.waves.toSpawn = 30;
  w.setStartLives(5000, { resetCurrent: true });
  for (let i = 0; i < 2000; i++) w.tick(); // long wave: dwell relocation fires
  const endWave1 = w.portal.x;
  assert(endWave1 !== center, "wave 1 can relocate after its dwell stretch");
  w.startWave();
  assert(w.portal.x !== endWave1, "wave 2 opens on a fresh seam cell");
}

// Determinism: same seed, same waves, same portal sequence
{
  const seq = (seed) => {
    const w = newWorld(9, 8, seed, true);
    const out = [];
    for (let wave = 0; wave < 2; wave++) {
      w.startWave();
      w._s.waves.queue = Array(40).fill("mite");
      w._s.waves.toSpawn = 40;
      for (let i = 0; i < 1200; i++) w.tick();
      out.push({ x: w.portal.x, idx: w._s.waves.portalIdx });
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
  const w = newWorld(9, 8, 7, true);
  w.startWave();
  const start = w.portal.x;
  for (let i = 0; i < 100; i++) w.tick(); // ~3.3s sim time < 8s dwell
  assert(w.portal.x === start, "portal sits still inside its dwell window");
}

// Dwell: portal relocates after the stretch, and never sits twice on the same cell
{
  const w = newWorld(9, 8, 11, true);
  w.setStartLives(5000, { resetCurrent: true });
  w.startWave();
  w._s.waves.queue = Array(120).fill("mite");
  w._s.waves.toSpawn = 120;
  let prev = w.portal.x;
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
  const w = newWorld(9, 8, 3, true);
  w.portal = { x: 4, y: 0 };
  w._s.grid.setBlocked(4, 0, true);
  w._s.grid.recompute();
  const pos = spawnPos(w._s, "mite");
  assert(pos.x !== 4.5, "spawn dodges the sealed column");
  const cellX = Math.round(pos.x - 0.5);
  assert(w._s.grid.groundDist[w._s.grid.idx(cellX, 0)] < 1e9, "fallback cell is reachable");
}

// Seam row is buildable except the spawn cell (portal now dodges builds)
{
  const w = newWorld(9, 8, 1, true);
  for (let x = 0; x < 9; x++) {
    const expected = x !== w.grid.spawn.x;
    assert(w.grid.isBuildable(x, 0) === expected, `seam (${x},0) buildable=${expected}`);
  }
  assert(w.grid.isBuildable(4, 1), "row 1 still buildable");
  const c = newWorld(8, 8, 1, false);
  assert(c.grid.isBuildable(2, 0), "campaign back line buildable too");
}

// Portal avoids occupied seam columns at wave start
{
  const w = newWorld(9, 8, 7, true);
  const s = w._s;
  for (let x = 0; x < 9; x++) {
    if (x === 2) continue;
    s.grid.setBlocked(x, 0, true);
  }
  s.grid.recompute();
  w.startWave();
  assert(w.portal.x === 2, "wave-1 portal dodges occupied seam columns");
}

// Relocation never lands on an occupied seam column
{
  const w = newWorld(9, 8, 5, true);
  w.setStartLives(5000, { resetCurrent: true });
  w.startWave();
  const s = w._s;
  s.waves.queue = Array(300).fill("mite");
  s.waves.toSpawn = 300;
  for (let x = 0; x < 3; x++) s.grid.setBlocked(x, 0, true);
  s.grid.recompute();
  let bad = 0;
  for (let i = 0; i < 6000; i++) {
    w.tick();
    if (w.portal.x < 3) bad++;
  }
  assert(bad === 0, "portal never lands on an occupied seam column");
}

// All seams blocked → least-occupied column fallback (avoids the heavy column)
{
  const w = newWorld(9, 8, 9, true);
  const s = w._s;
  for (let x = 0; x < 9; x++) s.grid.setBlocked(x, 0, true);
  s.grid.setBlocked(4, 3, true);
  s.grid.recompute();
  w.startWave();
  assert(w.portal.x !== 4, "least-occupied fallback avoids the heavier column");
}

// Every column fully walled → force the center column (never a softlock)
{
  const w = newWorld(9, 8, 11, true);
  const s = w._s;
  for (let x = 0; x < 9; x++) {
    for (let y = 0; y < 8; y++) s.grid.setBlocked(x, y, true);
  }
  s.grid.recompute();
  w.startWave();
  assert(w.portal.x === w.grid.spawn.x, "fully-walled board forces the center column");
}

// Occupied-column avoidance is seed-deterministic
{
  const seq = (seed) => {
    const w = newWorld(9, 8, seed, true);
    const s = w._s;
    for (let x = 0; x < 9; x++) {
      if (x % 2 === 0) s.grid.setBlocked(x, 0, true);
    }
    s.grid.recompute();
    w.startWave();
    const out = [w.portal.x];
    s.waves.queue = Array(40).fill("mite");
    s.waves.toSpawn = 40;
    for (let i = 0; i < 1200; i++) w.tick();
    out.push(w.portal.x);
    return out;
  };
  const a = seq(42);
  const b = seq(42);
  assert(JSON.stringify(a) === JSON.stringify(b), "portal avoidance is seed-deterministic");
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
  const w = newWorld(9, 9, 55, false);
  w.portal = { x: 2, y: 0 };
  w.startWave();
  const pinned = w.portal.x;
  for (let i = 0; i < 400; i++) w.tick();
  assert(w.portal.x === pinned, "campaign portal never moves");
  const pos = spawnPos(w._s, "mite");
  assert(pos.x === 2.5, "campaign enemies spawn from the pinned cell");
}

// Intensity curve: dwell shrinks as waves climb, floored at 2.5
{
  const w = newWorld(9, 8, 1, true);
  assert(Math.abs(dwellFor(w._s, 1) - 8) < 1e-9, "wave 1 dwell 8s");
  assert(Math.abs(dwellFor(w._s, 20) - 5.15) < 1e-9, "wave 20 dwell ~5.15s");
  assert(Math.abs(dwellFor(w._s, 40) - 2.5) < 1e-9, "wave 40 dwell floored");
}

console.log("portal: all assertions passed");
