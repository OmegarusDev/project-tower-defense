#!/usr/bin/env node
/**
 * Ladder + campaign + checkpoint regression — the aggregate gates against
 * committed goldens (captured from the oracle-verified next sim; refresh
 * with --capture when the game deliberately changes).
 *
 *  LADDER:    runSim (the real balance harness) across presets x seeds;
 *             full metrics objects must equal the golden.
 *  CAMPAIGN:  all 12 levels driven by the greedy bot; streams + state
 *             equal the golden.
 *  CHECKPOINT: mid-run checkpoint() -> loadCheckpoint() -> continue.
 *
 *   node tools/corpus/ladderParity.mjs [--presets fresh,earlyAA] [--seeds 1,42] [--capture]
 */
import { runSim } from "../../web/js/balance/runSim.js";
import { scenarioByName } from "../../web/js/balance/scenarios.js";
import { Sim } from "../../web/js/sim/next/sim.js";
import { CAMPAIGN_LEVELS, levelPortalCell } from "../../web/js/data/campaign.js";
import { makeSlot } from "../../web/js/data/parts.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out", "ladder.json");
const CAPTURE = process.argv.includes("--capture");

function parseArgs(argv) {
  const a = { presets: ["fresh", "earlyAA", "parts2", "midMeta"], seeds: [1, 2, 42, 123, 555, 99] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--presets") a.presets = argv[++i].split(",");
    if (argv[i] === "--seeds") a.seeds = argv[++i].split(",").map(Number);
  }
  return a;
}

const round = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const { presets, seeds } = parseArgs(process.argv.slice(2));
let failures = 0;
const fail = (msg) => {
  failures++;
  console.log("FAIL — " + msg);
};
const pass = (msg) => console.log("PASS — " + msg);

const results = {};

// ————— LADDER —————
results.ladder = {};
for (const preset of presets) {
  const base = scenarioByName(preset);
  for (const seed of seeds) {
    const a = runSim({
      ...base,
      seed,
      simFactory: () => new Sim(),
    });
    results.ladder[`${preset}@${seed}`] = a;
  }
}

// ————— CAMPAIGN —————
function runCampaign(Factory, lv) {
  const sim = new Factory();
  sim.setup(lv.cols, lv.rows, lv.seed, false);
  sim.runSeed = lv.seed >>> 0 || 1;
  sim.campaignLevelId = lv.id || 0;
  sim.wavesToWin = lv.wavesToWin;
  sim.campaignWaves = lv.waves || null;
  sim.economy.battle = lv.coinGrant || 55;
  sim.applyPreWalls(lv.preWalls || []);
  sim.portal = levelPortalCell(lv);
  sim.setRoster([makeSlot("sentry", "single", "kinetic", 1)]);
  const events = [];
  const rec = (t, type, ...rest) => events.push([t, type, ...rest]);
  const tk = () => sim.tickIndex;
  sim.on("enemy_spawned", (e) => rec(tk(), "spawn", e.enemy?.kind, round(e.enemy?.pos?.x), round(e.enemy?.pos?.y)));
  sim.on("leak", (e) => rec(tk(), "leak", e.enemy?.kind, e.lives));
  sim.on("enemy_killed", (e) => rec(tk(), "kill", e.enemy?.kind));
  sim.on("wave_cleared", (e) => rec(tk(), "clear", e.wave));
  sim.on("game_over", () => rec(tk(), "game_over"));
  sim.on("victory", (e) => rec(tk(), "victory", e.wave));
  sim.on("tower_placed", (e) => rec(tk(), "tplace", e.tower?.id, e.tower?.cell?.x, e.tower?.cell?.y, e.surcharge));
  sim.on("wall_placed", (e) => rec(tk(), "wplace", e.wall?.id, e.wall?.cell?.x, e.wall?.cell?.y));

  const bot = { act: (s, phase) => greedyAct(s, phase) };
  let gameOver = false;
  sim.on("game_over", () => (gameOver = true));
  sim.on("victory", () => (gameOver = true));
  bot.act(sim, "betweenWaves");
  sim.startWave({ earlyBonus: 0 });
  let ticks = 0;
  const maxTicks = 60 * 60 * 8;
  while (ticks < maxTicks && !gameOver) {
    if (sim.waveIndex >= lv.wavesToWin && !sim.waves.waveActive && sim.enemies.length === 0) break;
    if (!sim.running) {
      if (sim.waveIndex >= lv.wavesToWin) break;
      bot.act(sim, "betweenWaves");
      if (gameOver) break;
      sim.startWave({ earlyBonus: 0 });
      continue;
    }
    if ((ticks & 15) === 0) bot.act(sim, "inWave");
    sim.tick();
    ticks += 1;
  }
  return {
    events,
    ticks,
    state: JSON.stringify({
      waveIndex: sim.waveIndex,
      lives: sim.lives,
      battle: round(sim.economy?.battle),
      towers: sim.towers.map((t) => [t.id, t.cell.x, t.cell.y, t.level]),
      walls: sim.walls.map((w) => [w.id, w.cell.x, w.cell.y, w.preplaced ? 1 : 0]),
      enemies: sim.enemies.map((e) => [e.id, e.kind, round(e.pos.x), round(e.pos.y), round(e.hp)]),
      portal: sim.portal,
      log: sim.actionLog,
    }),
  };
}

import { greedyAct } from "../../web/js/balance/greedyBot.js";

results.campaign = {};
for (const lv of CAMPAIGN_LEVELS) {
  const a = runCampaign(Sim, lv);
  results.campaign[`L${lv.id}`] = { events: a.events, ticks: a.ticks, state: a.state };
}

// ————— CHECKPOINT round trip —————
function checkpointRun(Factory, preset, seed) {
  const base = scenarioByName(preset);
  const s1 = new Factory();
  s1.setup(9, 8, seed, true);
  s1.runSeed = seed;
  s1.runLevelCap = base.runLevelCap;
  s1.setStartLives(base.startLives, { resetCurrent: true });
  s1.economy.battle = base.startBattle;
  s1.setRoster(base.roster.map((x) => makeSlot(x.base, x.barrel, x.payload, x.levelCap || base.runLevelCap)));
  const bot = { act: (s, phase) => greedyAct(s, phase) };
  let ticks = 0;
  let dead = false;
  s1.on("game_over", () => (dead = true));
  bot.act(s1, "betweenWaves");
  s1.startWave({ earlyBonus: 0 });
  while (ticks < 3000 && !dead) {
    if (!s1.running) {
      bot.act(s1, "betweenWaves");
      s1.startWave({ earlyBonus: 0 });
      continue;
    }
    if ((ticks & 15) === 0) bot.act(s1, "inWave");
    s1.tick();
    ticks += 1;
    if (s1.tickIndex > 1200) break;
  }
  const blob = s1.checkpoint();
  if (dead) return JSON.stringify({ blob, dead: true });

  const s2 = new Factory();
  s2.loadCheckpoint(blob);
  const out = [];
  const tk2 = () => s2.tickIndex;
  s2.on("leak", (e) => out.push([tk2(), "leak", e.enemy?.kind, e.lives]));
  s2.on("enemy_killed", (e) => out.push([tk2(), "kill", e.enemy?.kind]));
  s2.on("wave_cleared", (e) => out.push([tk2(), "clear", e.wave]));
  s2.on("game_over", () => out.push([tk2(), "game_over"]));
  s2.on("tower_placed", (e) => out.push([tk2(), "tplace", e.tower?.id, e.tower?.cell?.x, e.tower?.cell?.y]));
  bot.act(s2, "betweenWaves");
  s2.startWave({ earlyBonus: 0 });
  let t2 = 0;
  while (t2 < 30000 && s2.running) {
    if ((t2 & 15) === 0) bot.act(s2, "inWave");
    s2.tick();
    t2 += 1;
  }
  return JSON.stringify({
    blob,
    out,
    state: {
      waveIndex: s2.waveIndex,
      lives: s2.lives,
      battle: round(s2.economy?.battle),
      towers: s2.towers.map((t) => [t.id, t.cell.x, t.cell.y, t.level]),
      enemies: s2.enemies.map((e) => [e.id, e.kind, round(e.pos.x), round(e.pos.y), round(e.hp)]),
      log: s2.actionLog,
    },
  });
}

results.checkpoint = {};
for (const preset of ["fresh", "earlyAA"]) {
  for (const seed of [1, 42]) {
    results.checkpoint[`${preset}@${seed}`] = checkpointRun(Sim, preset, seed);
  }
}

if (CAPTURE) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(results));
  console.log(`captured ladder goldens (${Object.keys(results.ladder).length} ladder, ${Object.keys(results.campaign).length} campaign, ${Object.keys(results.checkpoint).length} checkpoint)`);
} else if (!existsSync(OUT)) {
  console.log("FAIL — no golden (re-run with --capture)");
  process.exit(1);
} else {
  const golden = JSON.parse(readFileSync(OUT, "utf8"));
  const cmp = (key, name) => {
    if (JSON.stringify(results[key]) !== JSON.stringify(golden[key])) {
      fail(name);
    } else {
      pass(name);
    }
  };
  cmp("ladder", "ladder (all presets x seeds)");
  cmp("campaign", "campaign (12 levels)");
  cmp("checkpoint", "checkpoint round-trips");
  console.log(failures === 0 ? "ALL PARITY OK" : `${failures} divergence(s)`);
  process.exit(failures === 0 ? 0 : 1);
}
