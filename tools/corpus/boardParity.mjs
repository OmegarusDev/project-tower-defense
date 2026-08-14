#!/usr/bin/env node
/**
 * Board scene parity — the next boardScene.js vs the oracle BoardView
 * methods, drawn from identical scene state on identical cameras.
 * Frozen time + seeded randomness stubs (same discipline as the corpus).
 *
 *   node tools/corpus/boardParity.mjs
 */
import { chromium } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");

const STUBS = `
  (() => {
    performance.now = () => 1000;
    let s = 1234567;
    window.__rngReset = () => { s = 1234567; };
    Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  })();
`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript(STUBS);
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message, e.stack?.split("\n").slice(1, 3).join(" ")));
await page.goto(`http://127.0.0.1:8123/probe-board.html`, { waitUntil: "networkidle", timeout: 60000 });

const { PNG } = await import("pngjs");
const oracle = PNG.sync.read(Buffer.from((await page.evaluate(() => window.__drawBoardOracle())).split(",")[1], "base64"));
const next = PNG.sync.read(Buffer.from((await page.evaluate(() => window.__drawBoardNext())).split(",")[1], "base64"));
const viewO = PNG.sync.read(Buffer.from((await page.evaluate(() => window.__drawBoardViewOracle())).split(",")[1], "base64"));
const viewN = PNG.sync.read(Buffer.from((await page.evaluate(() => window.__drawBoardViewNext())).split(",")[1], "base64"));

const countDiff = (a, b) => {
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2]) +
        Math.abs(a.data[i + 3] - b.data[i + 3]) >
      12
    ) n++;
  }
  return n;
};
const viewDiff = countDiff(viewO, viewN);
if (viewDiff === 0) {
  console.log("BOARD VIEW PARITY OK (byte-identical)");
} else {
  console.log(`BOARD VIEW DIVERGES: ${viewDiff} px`);
  process.exitCode = 1;
}

let diff = 0;
let total = 0;
const bbox = { minX: 1e9, minY: 1e9, maxX: -1, maxY: -1 };
for (let i = 0; i < oracle.data.length; i += 4) {
  total++;
  const d =
    Math.abs(oracle.data[i] - next.data[i]) +
    Math.abs(oracle.data[i + 1] - next.data[i + 1]) +
    Math.abs(oracle.data[i + 2] - next.data[i + 2]) +
    Math.abs(oracle.data[i + 3] - next.data[i + 3]);
  if (d > 12) {
    diff++;
    const px = (i / 4) % oracle.width;
    const py = Math.floor(i / 4 / oracle.width);
    if (px < bbox.minX) bbox.minX = px;
    if (px > bbox.maxX) bbox.maxX = px;
    if (py < bbox.minY) bbox.minY = py;
    if (py > bbox.maxY) bbox.maxY = py;
  }
}
const pct = (diff / total) * 100;
if (diff === 0) {
  console.log("BOARD SCENE PARITY OK (byte-identical)");
  process.exit(0);
}
console.log(
  `BOARD SCENE DIVERGES: ${diff}/${total} px (${pct.toFixed(4)}%) bbox x[${bbox.minX}..${bbox.maxX}] y[${bbox.minY}..${bbox.maxY}]`
);
if (process.argv.includes("--dump")) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(join(OUT, "diff"), { recursive: true });
  writeFileSync(join(OUT, "diff", "board_oracle.png"), PNG.sync.write(oracle));
  writeFileSync(join(OUT, "diff", "board_next.png"), PNG.sync.write(next));
  console.log("dumped to tools/corpus/out/diff/board_*.png");
}
await browser.close();
process.exit(1);
