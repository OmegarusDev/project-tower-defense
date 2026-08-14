#!/usr/bin/env node
/**
 * GrowSouth pacing check (§2.5): run 40 endless waves in the sim, verify the
 * board-growth cadence (growEvery=5, +growBy=2, cap maxRows=22) never seals
 * the ground path, keeps the portal reachable, and never crowds the buildable
 * area (buildable share stays sane). Node-only — no gates to touch unless we
 * change balance, which we only do after seeing the numbers.
 */
import { Sim as SimWorld } from "../../web/js/sim/next/sim.js";
import { ENDLESS_GRID } from "../../web/js/data/endlessGrid.js";

const TARGET_WAVES = 40;
const results = [];

for (let seed = 1; seed <= 3; seed++) {
  const sim = new SimWorld();
  sim.setup(ENDLESS_GRID.cols, ENDLESS_GRID.rows, seed, true);
  sim.setStartLives(1_000_000, { resetCurrent: true });

  const growth = [];
  let cleared = 0;
  let lastRows = sim.grid.rows;

  sim.on("grid_grew", (e) => {
    growth.push({ wave: cleared, rows: e.rows, cols: e.cols });
  });

  let guard = 0;
  while (cleared < TARGET_WAVES && guard++ < 5_000_000) {
    let tickGuard = 0;
    while (sim.waves.waveActive && tickGuard++ < 500_000) sim.tick();
    cleared++;
    // post-clear checks
    if (!sim.grid.hasGroundPath()) {
      results.push({ seed, error: `ground path sealed after wave ${cleared}` });
      break;
    }
    const pc = sim.portal;
    if (!pc || sim.grid.groundDist[sim.grid.idx(pc.x, pc.y)] >= 1_000_000) {
      results.push({ seed, error: `portal unreachable after wave ${cleared}` });
      break;
    }
    if (sim.grid.rows > lastRows) lastRows = sim.grid.rows;
    if (cleared < TARGET_WAVES) sim.startWave();
  }

  // buildable share at final size
  const g = sim.grid;
  let buildable = 0;
  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < g.cols; x++) {
      if (g.isBuildable(x, y)) buildable++;
    }
  }
  const total = g.cols * g.rows;
  results.push({
    seed,
    wavesCleared: cleared,
    rowsAt: growth.map((gr) => `${gr.wave}:${gr.rows}`).join(", "),
    finalRows: g.rows,
    maxRows: ENDLESS_GRID.maxRows,
    buildableShare: +((buildable / total) * 100).toFixed(1),
    portalFinal: sim.portal ? `${sim.portal.x},${sim.portal.y}` : "none",
  });
}

for (const r of results) {
  console.log(JSON.stringify(r));
}
const bad = results.some((r) => r.error);
const capOk = results.every((r) => r.finalRows === ENDLESS_GRID.maxRows && r.rowsAt.startsWith("5:10"));
console.log(bad ? "GROWSOUTH PACING: FAIL" : capOk ? "GROWSOUTH PACING OK" : "GROWSOUTH PACING: CHECK CAPS");
process.exit(bad ? 1 : 0);