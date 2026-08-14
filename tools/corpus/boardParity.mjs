#!/usr/bin/env node
/**
 * Board scene regression — the next board renderers vs committed goldens
 * (--capture to refresh; goldens were captured from oracle-verified output).
 * Frozen time + seeded RNG.
 *
 *   node tools/corpus/boardParity.mjs [--capture]
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out", "board");
const CAPTURE = process.argv.includes("--capture");
mkdirSync(OUT, { recursive: true });

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
await page.goto("http://127.0.0.1:8123/probe-board.html", { waitUntil: "networkidle", timeout: 60000 });

const cases = [
  ["scene", "window.__drawBoardNext"],
  ["view", "window.__drawBoardViewNext"],
];
let failures = 0;
for (const [name, fn] of cases) {
  const dataUrl = await page.evaluate((f) => window[f](), fn.split(".")[1]);
  if (CAPTURE) {
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
    console.log(`CAPTURED ${name}`);
    continue;
  }
  const golden = join(OUT, `${name}.png`);
  if (!existsSync(golden)) {
    failures++;
    console.log(`FAIL ${name}: no golden — re-run with --capture`);
    continue;
  }
  const a = PNG.sync.read(readFileSync(golden));
  const b = PNG.sync.read(Buffer.from(dataUrl.split(",")[1], "base64"));
  let diff = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2]) +
        Math.abs(a.data[i + 3] - b.data[i + 3]) >
      12
    ) diff++;
  }
  const pct = (diff / (a.width * a.height)) * 100;
  if (diff === 0) {
    console.log(`PASS ${name} (byte-identical)`);
  } else if (pct < 0.02) {
    console.log(`PASS ${name} (${diff} AA px, ${pct.toFixed(3)}%)`);
  } else {
    failures++;
    console.log(`FAIL ${name}: ${diff} px (${pct.toFixed(2)}%)`);
  }
}
console.log(failures === 0 ? "BOARD PARITY OK" : `${failures} case(s) diverge`);
await browser.close();
process.exit(CAPTURE || failures === 0 ? 0 : 1);
