#!/usr/bin/env node
/**
 * Chrome (HUD) regression — ui/next/chrome.js output vs committed goldens
 * (--capture to refresh). Frozen time + seeded RNG, game CSS loaded.
 *
 *   node tools/corpus/chromeParity.mjs [--capture]
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out", "chrome");
const CAPTURE = process.argv.includes("--capture");
mkdirSync(OUT, { recursive: true });

const STUBS = `
  (() => {
    performance.now = () => 1000;
    let s = 1234567;
    Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  })();
`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript(STUBS);
await page.goto("http://127.0.0.1:8123/dev/probe-chrome.html", { waitUntil: "networkidle", timeout: 60000 });

const variants = ["plain", "busy", "paused", "compose"];
let failures = 0;
for (const v of variants) {
  const r = await page.evaluate((name) => window.__renderChrome(name), v);
  if (CAPTURE) {
    writeFileSync(join(OUT, `${v}.html`), r.next);
    console.log(`CAPTURED ${v} (${r.next.length}b)`);
    continue;
  }
  const golden = join(OUT, `${v}.html`);
  if (!existsSync(golden)) {
    failures++;
    console.log(`FAIL ${v}: no golden — re-run with --capture`);
    continue;
  }
  const snap = readFileSync(golden, "utf8");
  if (r.next === snap) {
    console.log(`PASS ${v} (${r.next.length}b)`);
  } else {
    failures++;
    let i = 0;
    while (i < Math.max(r.next.length, snap.length) && r.next[i] === snap[i]) i++;
    console.log(
      `FAIL ${v}: first diff at ${i}:\n  now: ${JSON.stringify(r.next.slice(Math.max(0, i - 60), i + 100))}\n  gold: ${JSON.stringify(snap.slice(Math.max(0, i - 60), i + 100))}`
    );
  }
}
console.log(failures === 0 ? "CHROME PARITY OK" : `${failures} variant(s) diverge`);
await browser.close();
process.exit(CAPTURE || failures === 0 ? 0 : 1);
