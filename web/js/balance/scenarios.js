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
 * Early AA: fresh account that made its first Forge purchase (rail, 6 Parts).
 * Measures how deep one counter-purchase buys — the first soft wall.
 */
export function earlyAAScenario(overrides = {}) {
  return {
    name: "earlyAA",
    seed: 1,
    runLevelCap: 1,
    startBattle: BASE_START_CASH,
    startLives: 3,
    maxWaves: 18,
    maxTicks: 60 * 60 * 8,
    roster: [makeSlot("sentry", "rail", "kinetic", 1)],
    partUpgrades: {},
    globalMods: { damage: 1, range: 1, rof: 1 },
    bot: makeGreedyBot(),
    ...overrides,
  };
}

/**
 * Parts 2: two to three Forge purchases (rail + twin + bulwark), cap 2.
 * The expected profile after 3-4 runs — model the mid-purchase escalation.
 */
export function parts2Scenario(overrides = {}) {
  return {
    name: "parts2",
    seed: 1,
    runLevelCap: 2,
    startBattle: BASE_START_CASH,
    startLives: 3,
    maxWaves: 20,
    maxTicks: 60 * 60 * 12,
    roster: [
      makeSlot("sentry", "rail", "kinetic", 2),
      makeSlot("bulwark", "twin", "kinetic", 2),
    ],
    partUpgrades: {},
    globalMods: { damage: 1, range: 1, rof: 1 },
    bot: makeGreedyBot(),
    ...overrides,
  };
}

/**
 * Mid-meta: cap 3+ so multi-level + branch picks matter.
 * Owns AA (rail) + ROF (twin) — the expected purchases after 2-3 runs.
 * Slight global/arsenal bump mirrors early tech investment.
 */
export function midMetaScenario(overrides = {}) {
  return {
    name: "midMeta",
    seed: 1,
    runLevelCap: 4,
    startBattle: BASE_START_CASH + 40,
    startLives: 5,
    maxWaves: 40,
    maxTicks: 60 * 60 * 14,
    roster: [
      makeSlot("sentry", "rail", "kinetic", 4),
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
  if (name === "earlyAA" || name === "aa") return earlyAAScenario();
  if (name === "parts2" || name === "p2") return parts2Scenario();
  return freshScenario();
}