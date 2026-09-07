/**
 * Regression guards for continue/resume + life-budget sync.
 * Run: node js/tests/runSync.test.mjs
 */
import { Sim } from "../sim/sim.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// inWave continue contract, driven through the real Sim API:
// checkpoint saved after waveIndex increments; Continue rolls back one so
// Call restarts the saved wave (runLifecycle.continueRun mirrors this).
{
  const sim = new Sim();
  sim.setup(11, 14, 5, true);
  for (let i = 0; i < 4; i++) sim.startWave();
  assert(sim.state.waves.index === 4, "four waves started");
  const blob = sim.checkpoint();
  assert(blob.wave === 4 && blob.phase === "inWave", "checkpoint stores wave + inWave phase");

  const resumed = new Sim();
  resumed.loadCheckpoint(blob);
  const savedWave = blob.wave | 0;
  if (blob.phase !== "betweenWaves" && savedWave > 0) resumed.state.waves.index = savedWave - 1;
  assert(resumed.state.waves.index === 3, "inWave resume rolls back so Call starts saved wave");
  resumed.startWave();
  assert(resumed.state.waves.index === 4, "Call Wave after continue starts the saved wave");
}

// betweenWaves continue contract: no rollback — Call starts next wave.
{
  const sim = new Sim();
  sim.setup(11, 14, 5, true);
  sim.startWave();
  sim.state.checkpointPhase = "betweenWaves"; // as wave_cleared hands off
  const blob = sim.checkpoint();
  assert(blob.phase === "betweenWaves", "checkpoint stores betweenWaves phase");

  const resumed = new Sim();
  resumed.loadCheckpoint(blob);
  const savedWave = blob.wave | 0;
  if (blob.phase !== "betweenWaves" && savedWave > 0) resumed.state.waves.index = savedWave - 1;
  assert(resumed.state.waves.index === 1, "betweenWaves keeps cleared index");
  resumed.startWave();
  assert(resumed.state.waves.index === 2, "Call starts wave 2 with board intact");
}

// setStartLives can update budget without healing.
{
  const sim = new Sim();
  sim.setup(11, 14, 1, true);
  sim.setStartLives(3, { resetCurrent: true });
  sim.state.lives = 1;
  sim.setStartLives(5, { resetCurrent: false });
  assert(sim.state.startLives === 5, "life budget updates");
  assert(sim.state.lives === 1, "current lives preserved when resetCurrent=false");
  sim.setStartLives(4, { resetCurrent: true });
  assert(sim.state.lives === 4, "resetCurrent refills lives");
}

// Placed towers take runLevelCap when higher than loadout cap.
{
  const sim = new Sim();
  sim.setup(11, 14, 1, true);
  sim.state.runLevelCap = 4;
  sim.setRoster([
    {
      base: "sentry",
      barrel: "single",
      payload: "kinetic",
      complete: true,
      placeCost: 20,
      levelCap: 2,
    },
  ]);
  sim.state.economy.battle = 500;
  let open = null;
  for (let y = 2; y < sim.state.grid.rows - 2 && !open; y++) {
    for (let x = 2; x < sim.state.grid.cols - 2; x++) {
      if (sim.state.grid.isBuildable(x, y)) {
        open = { x, y };
        break;
      }
    }
  }
  assert(open, "found buildable cell");
  const res = sim.tryPlaceTower(open.x, open.y, 0);
  assert(res.ok, `place ok (${res.reason || "ok"})`);
  assert(res.tower.levelCap === 4, `tower uses runLevelCap (got ${res.tower.levelCap})`);
}

console.log("ALL runSync tests passed");
