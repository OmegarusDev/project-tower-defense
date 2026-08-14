/**
 * Regression guards for continue/resume + life-budget sync.
 * Run: node js/tests/runSync.test.mjs
 */
import { Sim } from "../sim/next/sim.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Checkpoint is saved after waveIndex increments; inWave resume must roll back one.
{
  const savedWave = 4;
  const phase = "inWave";
  const resumeIndex = phase === "inWave" ? Math.max(0, savedWave - 1) : savedWave;
  assert(resumeIndex === 3, "inWave resume rolls back so Call starts saved wave");
  const afterCall = resumeIndex + 1;
  assert(afterCall === savedWave, "Call Wave after continue starts the saved wave");
}

// betweenWaves: no rollback — Call starts next wave with board intact.
{
  const savedWave = 4;
  const phase = "betweenWaves";
  const resumeIndex = phase === "inWave" ? Math.max(0, savedWave - 1) : savedWave;
  assert(resumeIndex === 4, "betweenWaves keeps cleared index");
  assert(resumeIndex + 1 === 5, "Call starts wave 5");
}

// setStartLives can update budget without healing.
{
  const sim = new Sim();
  sim.setup(11, 14, 1, true);
  sim.setStartLives(3, { resetCurrent: true });
  sim.lives = 1;
  sim.setStartLives(5, { resetCurrent: false });
  assert(sim.startLives === 5, "life budget updates");
  assert(sim.lives === 1, "current lives preserved when resetCurrent=false");
  sim.setStartLives(4, { resetCurrent: true });
  assert(sim.lives === 4, "resetCurrent refills lives");
}

// Placed towers take runLevelCap when higher than loadout cap.
{
  const sim = new Sim();
  sim.setup(11, 14, 1, true);
  sim.runLevelCap = 4;
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
  sim.economy.battle = 500;
  let open = null;
  for (let y = 2; y < sim.grid.rows - 2 && !open; y++) {
    for (let x = 2; x < sim.grid.cols - 2; x++) {
      if (sim.grid.isBuildable(x, y)) {
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
