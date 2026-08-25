/**
 * Roaming seam portal: static w1-7, first shift w8+ with a long named
 * telegraph, rare shift budget, campaign pins.
 * Run: node js/tests/portal.test.mjs
 */
import { Sim } from "../sim/next/sim.js";
import { spawnPos, PORTAL_WARN_TIME } from "../sim/next/systems/waves.js";
import { levelPortalCell } from "../data/campaign.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function newWorld(cols = 9, rows = 8, seed = 7, endless = true) {
  const w = new Sim();
  w.setup(cols, rows, seed, endless);
  return w;
}

// Waves 1-5: portal stays at centre (no shift)
{
  const w = newWorld(9, 8, 7, true);
  const center = w.grid.spawn.x;
  for (let wave = 1; wave <= 5; wave++) {
    w.startWave();
    assert(w.portal.x === center, `wave ${wave} portal stays at centre`);
    w._s.waves.queue = Array(20).fill("mite");
    w._s.waves.toSpawn = 20;
    delete w._s.waves.clumpState;
    w.setStartLives(5000, { resetCurrent: true });
    for (let i = 0; i < 2000; i++) w.tick();
    assert(w.portal.x === center, `wave ${wave} portal still at centre after clear`);
  }
}

// Waves 6-7: no shift budget yet — portal must not move and never warn.
{
  const w = newWorld(9, 8, 7, true);
  const s = w._s;
  let unstable = 0;
  s._listeners.set("portal_unstable", [() => { unstable++; }]);
  for (let wave = 1; wave <= 7; wave++) {
    w.startWave();
    assert(!unstable, `no portal_unstable during wave ${wave} (budget starts w8)`);
    const before = w.portal.x;
    s.waves.queue = Array(60).fill("mite");
    s.waves.toSpawn = 60;
    delete s.waves.clumpState;
    w.setStartLives(5000, { resetCurrent: true });
    let moved = 0;
    let prev = w.portal.x;
    for (let t = 0; t < 20000 && s.waves.active; t++) {
      w.tick();
      if (w.portal.x !== prev) { prev = w.portal.x; moved++; }
    }
    assert(moved === 0 && w.portal.x === before, `wave ${wave} portal pinned (shifts start w8)`);
  }
}

// Wave 8: first mid-wave shift — warning names the target column, then the
// move lands after PORTAL_WARN_TIME (not instantly).
{
  const w = newWorld(9, 8, 7, true);
  const s = w._s;
  const events = [];
  s._listeners.set("portal_unstable", [(e) => events.push({ kind: "unstable", tick: e.tick, toX: e.toX })]);
  s._listeners.set("portal_moved", [(e) => events.push({ kind: "moved", tick: e.tick, x: e.x })]);
  // Fast-forward through waves 1-7 (static)
  for (let i = 0; i < 7; i++) {
    w.startWave();
    s.waves.queue = Array(8).fill("mite");
    s.waves.toSpawn = 8;
    delete s.waves.clumpState;
    w.setStartLives(5000, { resetCurrent: true });
    for (let t = 0; t < 2500; t++) w.tick();
  }
  w.startWave(); // wave 8 — budget = 1
  assert(!events.length, "no telegraph at wave start");
  s.waves.queue = Array(120).fill("mite");
  s.waves.toSpawn = 120;
  delete s.waves.clumpState;
  w.setStartLives(5000, { resetCurrent: true });
  let prev = w.portal.x;
  let moved = 0;
  for (let t = 0; t < 60000 && s.waves.active; t++) {
    w.tick();
    if (w.portal.x !== prev) { prev = w.portal.x; moved++; }
  }
  const u = events.find((e) => e.kind === "unstable");
  const m = events.find((e) => e.kind === "moved");
  assert(u && m, "wave 8 warns then moves");
  assert(Number.isInteger(u.toX) && u.toX >= 0 && u.toX < 9, `warning names target column (toX=${u.toX})`);
  assert(u.toX === m.x, "moved column matches warned column");
  const gapTicks = m.tick - u.tick;
  const expected = Math.round(PORTAL_WARN_TIME / (1 / 60));
  assert(Math.abs(gapTicks - expected) <= 1, `warning lasts ~2.5s (${gapTicks} ticks vs ${expected})`);
  assert(moved <= 1, `wave 8 respects shift budget (moved=${moved})`);
}

// Determinism: same seed → same portal sequence
{
  const seq = (seed) => {
    const w = newWorld(9, 8, seed, true);
    const out = [];
    for (let wave = 0; wave < 6; wave++) {
      w.startWave();
      w._s.waves.queue = Array(40).fill("mite");
      w._s.waves.toSpawn = 40;
      delete w._s.waves.clumpState;
      for (let i = 0; i < 1200; i++) w.tick();
      out.push({ x: w.portal.x, idx: w._s.waves.portalIdx });
    }
    return out;
  };
  const a = seq(42);
  const b = seq(42);
  assert(JSON.stringify(a) === JSON.stringify(b), "portal movement is seed-deterministic");
  // Waves 1-5: all at centre (portal doesn't shift)
  for (let i = 0; i < 5; i++) {
    assert(a[i].x === a[0].x, `wave ${i + 1} portal stays at same position as wave 1`);
  }
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

// Seam row is buildable except the spawn cell
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

// All seams blocked → least-occupied column fallback
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
    w.startWave(); // wave 1 (static)
    const out = [w.portal.x];
    s.waves.queue = Array(40).fill("mite");
    s.waves.toSpawn = 40;
    delete s.waves.clumpState;
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

console.log("portal: all assertions passed");
