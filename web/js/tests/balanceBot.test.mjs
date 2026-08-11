/**
 * Smoke: short greedy bot run clears at least one wave headless.
 * Run: node js/tests/balanceBot.test.mjs
 */
import { runSim } from "../balance/runSim.js";
import { freshScenario, midMetaScenario } from "../balance/scenarios.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

{
  const m = runSim(
    freshScenario({
      seed: 42,
      maxWaves: 3,
      maxTicks: 60 * 60 * 2,
    })
  );
  assert(m.towers >= 1, `bot placed a tower (got ${m.towers})`);
  assert(m.wavesCleared >= 1, `cleared ≥1 wave (got ${m.wavesCleared})`);
  assert(m.peakLevel === 1, "fresh cap 1 stays L1");
}

{
  const m = runSim(
    midMetaScenario({
      seed: 7,
      maxWaves: 4,
      maxTicks: 60 * 60 * 3,
    })
  );
  assert(m.towers >= 1, "midMeta placed towers");
  assert(m.wavesCleared >= 1, `midMeta cleared ≥1 wave (got ${m.wavesCleared})`);
}

console.log("ALL balanceBot tests passed");
