#!/usr/bin/env node
/**
 * Single-run diagnostic: per-wave leak/live/death report.
 *   node web/js/balance/diagRun.mjs --preset fresh --seed 1
 */
import { runSim } from "./runSim.js";
import { scenarioByName } from "./scenarios.js";
import { SimWorld } from "../sim/simWorld.js";

function parseArgs(argv) {
  const out = { preset: "fresh", seed: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--preset") out.preset = argv[++i] || "fresh";
    else if (a === "--seed") out.seed = +argv[++i] || 1;
  }
  return out;
}

const { preset, seed } = parseArgs(process.argv.slice(2));
const base = scenarioByName(preset);

// instrument via SimWorld subclass events — runSim already fires wave_cleared/leak/game_over
const simEvents = [];
const origRun = runSim;
// easier: replicate runSim with listeners
import { makeSlot } from "../data/parts.js";
import { ENDLESS_GRID } from "../data/endlessGrid.js";

const sim = new SimWorld();
sim.setup(ENDLESS_GRID.cols, ENDLESS_GRID.rows, seed, true);
sim.runSeed = seed;
sim.runLevelCap = base.runLevelCap;
sim.setStartLives(base.startLives, { resetCurrent: true });
sim.economy.battle = base.startBattle;
if (base.partUpgrades) sim.setPartUpgrades(base.partUpgrades);
if (base.globalMods) sim.setGlobalMods(base.globalMods);
const roster = base.roster.map((s) => makeSlot(s.base, s.barrel, s.payload, s.levelCap || base.runLevelCap));
sim.setRoster(roster);

let gameOver = false;
let perWave = new Map();
let cur = { wave: 1, leaks: 0, kills: 0, flyingLeaks: 0 };
const leakDetail = [];

sim.on("wave_cleared", () => {
  perWave.set(cur.wave, { ...cur, result: "cleared" });
  sim.running = false;
  cur = { wave: cur.wave + 1, leaks: 0, kills: 0, flyingLeaks: 0 };
});
sim.on("leak", (ev) => {
  cur.leaks += 1;
  const e = ev?.enemy;
  if (e?.flying) cur.flyingLeaks += 1;
  leakDetail.push(`  w${cur.wave} LEAK ${e?.kind}${e?.flying ? " (flyer)" : ""} lives->${ev?.lives}`);
});
sim.on("game_over", () => {
  gameOver = true;
  perWave.set(cur.wave, { ...cur, result: "GAME OVER" });
  sim.running = false;
});
sim.on("enemy_killed", () => {
  cur.kills += 1;
});

base.bot.act(sim, "betweenWaves");
sim.startWave({ earlyBonus: 0 });
let ticks = 0;
const maxTicks = base.maxTicks;
while (ticks < maxTicks && !gameOver) {
  if (sim.waveIndex >= base.maxWaves && !sim.waves.waveActive && sim.enemies.length === 0) break;
  if (!sim.running) {
    if (sim.waveIndex >= base.maxWaves) break;
    base.bot.act(sim, "betweenWaves");
    if (gameOver) break;
    sim.startWave({ earlyBonus: 0 });
    continue;
  }
  if ((ticks & 15) === 0) base.bot.act(sim, "inWave");
  sim.tick();
  ticks += 1;
}
if (!gameOver && !perWave.has(cur.wave)) perWave.set(cur.wave, { ...cur, result: "survived" });

console.log(`preset=${preset} seed=${seed} → ${gameOver ? "GAME OVER" : "survived"} at wave ${sim.waveIndex}`);
for (const [w, row] of [...perWave.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`w${w} ${row.result} leaks=${row.leaks}${row.flyingLeaks ? ` (${row.flyingLeaks} flyer)` : ""} kills=${row.kills} towers=${sim.towers.length} lives=${sim.lives}`);
}
for (const line of leakDetail.slice(0, 40)) console.log(line);