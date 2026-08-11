/**
 * Balance scenario presets — fresh meta vs mid-game leveling curve.
 */

import { makeSlot } from "../data/parts.js";
import { BASE_START_CASH } from "../data/techTree.js";
import { makeGreedyBot } from "./greedyBot.js";

/** Fresh account: level cap 1 — auto-level never fires past L1. */
export function freshScenario(overrides = {}) {
  return {
    name: "fresh",
    seed: 1,
    runLevelCap: 1,
    startBattle: BASE_START_CASH,
    startLives: 3,
    maxWaves: 12,
    maxTicks: 60 * 60 * 6,
    roster: [makeSlot("sentry", "single", "kinetic", 1)],
    partUpgrades: {},
    globalMods: { damage: 1, range: 1, rof: 1 },
    bot: makeGreedyBot(),
    ...overrides,
  };
}

/**
 * Mid-meta: cap 3+ so multi-level + branch picks matter.
 * Slight global/arsenal bump mirrors early tech investment.
 */
export function midMetaScenario(overrides = {}) {
  return {
    name: "midMeta",
    seed: 1,
    runLevelCap: 4,
    startBattle: BASE_START_CASH + 40,
    startLives: 5,
    maxWaves: 18,
    maxTicks: 60 * 60 * 10,
    roster: [
      makeSlot("sentry", "single", "kinetic", 4),
      makeSlot("sentry", "twin", "kinetic", 4),
    ],
    partUpgrades: {
      sentry: { power: 1, range: 1 },
      single: { power: 1 },
      kinetic: { power: 1 },
    },
    globalMods: { damage: 1.08, range: 1.04, rof: 1.04 },
    bot: makeGreedyBot(),
    ...overrides,
  };
}

export function scenarioByName(name) {
  if (name === "midMeta" || name === "mid") return midMetaScenario();
  return freshScenario();
}
