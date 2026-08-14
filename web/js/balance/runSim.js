/**
 * Headless sim driver — pure tick loop, no DOM / simBridge.
 * Chains waves until game over, victory, maxWaves, or maxTicks.
 */

import { SimWorld, TICK_DT } from "../sim/simWorld.js";
import { makeSlot } from "../data/parts.js";
import { BASE_START_CASH } from "../data/techTree.js";
import { ENDLESS_GRID } from "../data/endlessGrid.js";

/**
 * @param {object} opts
 * @param {number} [opts.seed]
 * @param {object[]} [opts.roster] — loadout slots
 * @param {object} [opts.partUpgrades]
 * @param {object} [opts.globalMods]
 * @param {number} [opts.runLevelCap]
 * @param {number} [opts.startBattle]
 * @param {number} [opts.startLives]
 * @param {number} [opts.maxWaves]
 * @param {number} [opts.maxTicks]
 * @param {{ act:(sim:SimWorld, phase:'betweenWaves'|'inWave')=>void }} [opts.bot]
 * @returns {object} metrics
 */
export function runSim(opts = {}) {
  const seed = (opts.seed | 0) || 1;
  const maxWaves = Math.max(1, opts.maxWaves | 0 || 20);
  const maxTicks = Math.max(60, opts.maxTicks | 0 || 60 * 60 * 8); // ~8 min @ 60Hz
  const runLevelCap = Math.max(1, opts.runLevelCap | 0 || 1);

  const sim = opts.simFactory ? opts.simFactory() : new SimWorld();
  // Match the shipped endless map — the balance bot must measure the real game.
  sim.setup(ENDLESS_GRID.cols, ENDLESS_GRID.rows, seed, true);
  sim.runSeed = seed >>> 0 || 1;
  sim.runLevelCap = runLevelCap;
  sim.setStartLives(opts.startLives | 0 || 3, { resetCurrent: true });
  sim.economy.battle = opts.startBattle != null ? opts.startBattle | 0 : BASE_START_CASH;
  if (opts.partUpgrades) sim.setPartUpgrades(opts.partUpgrades);
  if (opts.globalMods) sim.setGlobalMods(opts.globalMods);

  const roster =
    opts.roster?.length > 0
      ? opts.roster.map((s) =>
          makeSlot(s.base, s.barrel, s.payload, s.levelCap || runLevelCap)
        )
      : [makeSlot("sentry", "single", "kinetic", runLevelCap)];
  sim.setRoster(roster);

  let gameOver = false;
  let victory = false;
  let wavesCleared = 0;
  let leaks = 0;
  let kills = 0;

  sim.on("game_over", () => {
    gameOver = true;
    sim.running = false;
  });
  sim.on("victory", () => {
    victory = true;
    sim.running = false;
  });
  sim.on("wave_cleared", () => {
    wavesCleared += 1;
    sim.running = false;
    sim.checkpointPhase = "betweenWaves";
  });
  sim.on("leak", () => {
    leaks += 1;
  });
  sim.on("enemy_killed", () => {
    kills += 1;
  });

  const bot = opts.bot;
  const act = (phase) => {
    if (bot?.act) bot.act(sim, phase);
  };

  // Opening build + first Call
  act("betweenWaves");
  sim.startWave({ earlyBonus: 0 });

  let ticks = 0;
  while (ticks < maxTicks && !gameOver && !victory) {
    if (sim.waveIndex >= maxWaves && !sim.waves.waveActive && sim.enemies.length === 0) {
      break;
    }

    if (!sim.running) {
      // Between waves — build then Call next (unless hit wave cap)
      if (sim.waveIndex >= maxWaves) break;
      act("betweenWaves");
      if (gameOver) break;
      sim.startWave({ earlyBonus: 0 });
      continue;
    }

    // Mid-wave: branch picks only
    if ((ticks & 15) === 0) act("inWave");

    sim.tick();
    ticks += 1;
  }

  const peakLevel = sim.towers.reduce((m, t) => Math.max(m, t.level | 0), 1);
  const branchPicks = sim.towers.reduce((n, t) => n + ((t.branch?.damage | 0) + (t.branch?.rof | 0) + (t.branch?.range | 0)), 0);

  return {
    seed,
    wavesCleared,
    waveIndex: sim.waveIndex | 0,
    lives: sim.lives | 0,
    battle: sim.economy.battle | 0,
    towers: sim.towers.length,
    walls: sim.walls.filter((w) => !w.preplaced).length,
    ticks,
    simSeconds: ticks * TICK_DT,
    gameOver,
    victory,
    leaks,
    kills,
    peakLevel,
    branchPicks,
    reachedMaxWaves: wavesCleared >= maxWaves || sim.waveIndex >= maxWaves,
    timedOut: ticks >= maxTicks && !gameOver && !victory,
  };
}
