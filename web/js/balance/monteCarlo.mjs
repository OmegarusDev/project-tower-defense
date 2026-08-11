#!/usr/bin/env node
/**
 * Monte Carlo balance CLI (Node, no npm).
 *
 *   node web/js/balance/monteCarlo.mjs --runs 5 --preset fresh
 *   node web/js/balance/monteCarlo.mjs --runs 10 --preset midMeta --seed-base 100 --max-waves 8
 */

import { runSim } from "./runSim.js";
import { scenarioByName } from "./scenarios.js";

function parseArgs(argv) {
  const out = {
    runs: 5,
    seedBase: 1,
    maxWaves: 0,
    preset: "fresh",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--runs") out.runs = Math.max(1, +argv[++i] || 1);
    else if (a === "--seed-base") out.seedBase = (+argv[++i] || 1) | 0;
    else if (a === "--max-waves") out.maxWaves = Math.max(1, +argv[++i] || 1);
    else if (a === "--preset") out.preset = argv[++i] || "fresh";
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function summarize(results) {
  const n = results.length || 1;
  const avg = (key) => results.reduce((s, r) => s + (r[key] || 0), 0) / n;
  const go = results.filter((r) => r.gameOver).length;
  return {
    runs: results.length,
    avgWavesCleared: +avg("wavesCleared").toFixed(2),
    avgWaveIndex: +avg("waveIndex").toFixed(2),
    avgLives: +avg("lives").toFixed(2),
    avgTowers: +avg("towers").toFixed(2),
    avgPeakLevel: +avg("peakLevel").toFixed(2),
    avgBranchPicks: +avg("branchPicks").toFixed(2),
    gameOverRate: +(go / n).toFixed(2),
    timedOut: results.filter((r) => r.timedOut).length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node monteCarlo.mjs [--runs N] [--seed-base N] [--max-waves N] [--preset fresh|midMeta]`);
    process.exit(0);
  }

  const base = scenarioByName(args.preset);
  if (args.maxWaves > 0) base.maxWaves = args.maxWaves;

  const results = [];
  for (let i = 0; i < args.runs; i++) {
    const seed = (args.seedBase + i) >>> 0 || 1;
    const metrics = runSim({ ...base, seed });
    results.push(metrics);
    console.log(
      `#${i + 1} seed=${seed} waves=${metrics.wavesCleared} L${metrics.peakLevel} towers=${metrics.towers} lives=${metrics.lives}${metrics.gameOver ? " GO" : ""}${metrics.timedOut ? " TIMEOUT" : ""}`
    );
  }

  const summary = summarize(results);
  console.log("---");
  console.log(JSON.stringify({ preset: args.preset, ...summary }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
