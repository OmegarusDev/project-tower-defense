#!/usr/bin/env node
/**
 * Campaign ladder (§3): verify each of the 12 campaign levels is beatable with
 * the meta a player actually has when they reach it, driven by the greedy bot,
 * and report clear margin (lives at victory). Meta is modelled by tiering the
 * endless ladder presets over campaign progression — BETA_PLAN: "ladder presets
 * as the tuning instrument". Levels that clear with near-zero margin (or fail)
 * are the tuning signals; adjust that level's wave script only.
 *
 *   node tools/corpus/campaignLadder.mjs [--levels 1,2,3]
 */
import { Sim, TICK_DT } from "../../web/js/sim/next/sim.js";
import { CAMPAIGN_LEVELS, levelPortalCell } from "../../web/js/data/campaign.js";
import { normalizeRoster, PARTS } from "../../web/js/data/parts.js";
import { scenarioByName } from "../../web/js/balance/scenarios.js";

const MAX_TICKS = 60 * 60 * 10;

const args = process.argv.slice(2);
const levelFilter = (() => {
  const i = args.indexOf("--levels");
  if (i >= 0) return new Set(args[i + 1].split(",").map(Number));
  return null;
})();

// Tiered meta: the ladder preset a player plausibly owns at each campaign tier.
const TIERS = [
  { maxLevel: 2, preset: "fresh" },
  { maxLevel: 4, preset: "earlyAA" },
  { maxLevel: 8, preset: "parts2" },
  { maxLevel: 12, preset: "midMeta" },
];

function metaForLevel(levelId) {
  const tier = TIERS.find((t) => levelId <= t.maxLevel) || TIERS[TIERS.length - 1];
  const sc = scenarioByName(tier.preset);
  return {
    preset: tier.preset,
    roster: sc.roster,
    levelCap: sc.runLevelCap,
    partUpgrades: sc.partUpgrades,
    globalDamageMult: sc.globalMods.damage,
    globalRangeMult: sc.globalMods.range,
    globalRofMult: sc.globalMods.rof,
    startLives: 3,
  };
}

/**
 * Campaign placement driver — coverage-aware "reasonable player" proxy.
 * Between waves: claim Damage branch picks, then greedily place towers on the
 * cells covering the most path cells (weighted to mid-lane), then add walls
 * only when they actually lengthen the path.
 */
const DIRS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function claimPicks(sim) {
  for (const t of sim.towers) {
    while ((t.pendingPicks | 0) > 0) {
      const r = sim.tryChooseLevelBranch(t.id, "damage");
      if (!r.ok) break;
    }
  }
}

function pathCells(sim) {
  const g = sim.grid;
  const out = [];
  let x = g.spawn.x;
  let y = g.spawn.y;
  const seen = new Set();
  for (let i = 0; i < g.cols * g.rows; i++) {
    const key = `${x},${y}`;
    if (seen.has(key)) break;
    seen.add(key);
    out.push({ x, y });
    if (g.isExit(x, y)) break;
    const n = g.groundNext[g.idx(x, y)];
    if (!n || (n.x === x && n.y === y)) break;
    x = n.x;
    y = n.y;
  }
  return out;
}

function slotRange(sim, slotIdx) {
  const s = sim.roster[slotIdx];
  if (!s || !s.complete) return 2;
  const b = PARTS.bases[s.base];
  const br = PARTS.barrels[s.barrel];
  const pl = PARTS.payloads[s.payload];
  const mult =
    (b?.rangeMult || 1) * (br?.rangeMult || 1) * (pl?.rangeMult || 1);
  return Math.max(1.5, (b?.range || 2) * mult);
}

function candidateScore(sim, cand, path, range) {
  let covered = 0;
  for (const p of path) {
    const dx = p.x - cand.x;
    const dy = p.y - cand.y;
    if (dx * dx + dy * dy <= range * range) covered++;
  }
  if (covered === 0) return 0;
  const midDepth = Math.min(cand.y, sim.grid.rows - 1 - cand.y);
  return covered * 10 + midDepth;
}

function placeTowers(sim, maxPlaces = 6) {
  const slotIdx = sim.roster.findIndex((s) => s && s.complete);
  if (slotIdx < 0) return 0;
  const path = pathCells(sim);
  const pathSet = new Set(path.map((c) => `${c.x},${c.y}`));
  const range = slotRange(sim, slotIdx);
  const candidates = [];
  for (let y = 0; y < sim.grid.rows; y++) {
    for (let x = 0; x < sim.grid.cols; x++) {
      const key = `${x},${y}`;
      if (pathSet.has(key)) continue;
      if (!sim.grid.isBuildable(x, y)) continue;
      if (sim.towers.some((t) => t.cell.x === x && t.cell.y === y)) continue;
      const score = candidateScore(sim, { x, y }, path, range);
      if (score > 0) candidates.push({ x, y, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  let placed = 0;
  for (const c of candidates) {
    if (placed >= maxPlaces) break;
    const quote = sim.economy.quoteTowerPlace(
      sim.roster[slotIdx].placeCost,
      sim.towers.length
    );
    if (sim.economy.battle < quote.total) break;
    const res = sim.tryPlaceTower(c.x, c.y, slotIdx);
    if (res.ok) placed++;
  }
  return placed;
}

function placeWalls(sim, budget = 3) {
  if (sim.towers.length < 1) return 0;
  const path = pathCells(sim);
  const pathSet = new Set(path.map((c) => `${c.x},${c.y}`));
  const slotIdx = sim.roster.findIndex((s) => s && s.complete);
  const towerCost =
    slotIdx >= 0
      ? sim.economy.quoteTowerPlace(sim.roster[slotIdx].placeCost, sim.towers.length).total
      : Infinity;
  let placed = 0;
  for (const c of path) {
    if (placed >= budget) break;
    for (const [dx, dy] of DIRS4) {
      if (placed >= budget) break;
      const x = c.x + dx;
      const y = c.y + dy;
      if (pathSet.has(`${x},${y}`)) continue;
      if (!sim.grid.isBuildable(x, y)) continue;
      const cost = sim.economy.wallCost(sim.playerWallCount());
      // Spend leftover coin on walls only when it can't buy a tower instead.
      if (sim.economy.battle < cost) return placed;
      if (sim.economy.battle >= towerCost) return placed;
      const before = pathCells(sim).length;
      const res = sim.tryPlaceWall(x, y);
      if (!res.ok) continue;
      const after = pathCells(sim).length;
      if (after <= before) {
        sim.trySellWall(res.wall.id);
        continue;
      }
      placed++;
    }
  }
  return placed;
}

export function campaignAct(sim, phase) {
  claimPicks(sim);
  if (phase !== "betweenWaves") return;
  placeTowers(sim, 6);
  placeWalls(sim, 4);
  placeTowers(sim, 3);
  claimPicks(sim);
}

function runLevel(lv, meta) {
  const sim = new Sim();
  sim.setup(lv.cols, lv.rows, lv.seed || 1, false);
  sim.runSeed = (lv.seed || 1) >>> 0;
  sim.campaignLevelId = lv.id;
  sim.wavesToWin = lv.wavesToWin;
  sim.campaignWaves = lv.waves;
  sim.economy.battle = lv.coinGrant + (meta.startCashBonus | 0);
  sim.setRoster(normalizeRoster(meta.roster || [], meta.slotCount | 0 || 3, meta.levelCap | 0 || 1));
  sim.runLevelCap = meta.levelCap | 0 || 1;
  sim.setStartLives(meta.startLives | 0 || 3, { resetCurrent: true });
  if (meta.partUpgrades && Object.keys(meta.partUpgrades).length) sim.setPartUpgrades(meta.partUpgrades);
  sim.setGlobalMods({
    damage: meta.globalDamageMult ?? 1,
    range: meta.globalRangeMult ?? 1,
    rof: meta.globalRofMult ?? 1,
  });
  sim.applyPreWalls(lv.preWalls || []);
  const pc = levelPortalCell(lv);
  if (sim.grid.groundDist[sim.grid.idx(pc.x, pc.y)] >= 1_000_000) {
    for (let x = 0; x < sim.grid.cols; x++) {
      if (sim.grid.groundDist[sim.grid.idx(x, 0)] < 1_000_000) {
        pc.x = x;
        pc.y = 0;
        break;
      }
    }
  }
  sim.portal = pc;

  const bot = { act: campaignAct };
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
  });
  sim.on("leak", () => {
    leaks += 1;
  });
  sim.on("enemy_killed", () => {
    kills += 1;
  });

  const act = (phase) => {
    if (bot?.act) bot.act(sim, phase);
  };

  act("betweenWaves");
  sim.startWave({ earlyBonus: 0 });

  let ticks = 0;
  while (ticks < MAX_TICKS && !gameOver && !victory) {
    if (sim.waveIndex >= lv.wavesToWin && !sim.waves.waveActive && sim.enemies.length === 0) break;
    if (!sim.running) {
      if (sim.waveIndex >= lv.wavesToWin) break;
      act("betweenWaves");
      if (gameOver) break;
      sim.startWave({ earlyBonus: 0 });
      continue;
    }
    if ((ticks & 15) === 0) act("inWave");
    sim.tick();
    ticks += 1;
  }

  const peakLevel = sim.towers.reduce((m, t) => Math.max(m, t.level | 0), 1);
  return {
    level: lv.id,
    name: lv.name,
    wavesToWin: lv.wavesToWin,
    wavesCleared,
    victory,
    lives: sim.lives | 0,
    leaks,
    kills,
    towers: sim.towers.length,
    walls: sim.walls.filter((w) => !w.preplaced).length,
    battle: sim.economy.battle | 0,
    ticks,
    simSeconds: Math.round(ticks * TICK_DT),
    gameOver,
    peakLevel,
    preset: meta.preset,
  };
}

const IS_MAIN = process.argv[1] === new URL(import.meta.url).pathname;

if (IS_MAIN) {
  const out = [];
  for (const lv of CAMPAIGN_LEVELS) {
    if (levelFilter && !levelFilter.has(lv.id)) continue;
    out.push(runLevel(lv, metaForLevel(lv.id)));
  }

  for (const r of out) {
    const margin = r.victory ? r.lives : 0;
    const flag = r.victory && margin <= 1 ? " <-- NEAR-ZERO MARGIN" : r.victory ? "" : " <-- NOT CLEARED";
    console.log(
      `L${String(r.level).padStart(2)} ${r.name.padEnd(14)} ${String(r.wavesCleared).padStart(2)}/${r.wavesToWin} ` +
        `victory=${r.victory} lives=${r.lives} leaks=${r.leaks} towers=${r.towers} walls=${r.walls} ` +
        `preset=${r.preset} ${r.simSeconds}s${flag}`
    );
  }

  const cleared = out.filter((r) => r.victory);
  const tight = out.filter((r) => r.victory && r.lives <= 1);
  const failed = out.filter((r) => !r.victory);
  console.log(
    `\n${cleared.length}/${out.length} cleared | tight=${tight.length} | failed=${failed.length}`
  );
  process.exit(failed.length ? 1 : 0);
}