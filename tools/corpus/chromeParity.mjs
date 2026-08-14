#!/usr/bin/env node
/**
 * Chrome parity — ui/next/chrome.js vs the oracle gameChrome/pauseSettings,
 * from identical sim state, comparing the FULL mounted+synced DOM
 * byte-identically. Frozen time + seeded RNG, game CSS loaded (layout
 * values like the tower overlay position come from real computed sizes).
 *
 *   node tools/corpus/chromeParity.mjs
 */
import { chromium } from "playwright";

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
await page.goto("http://127.0.0.1:8123/probe-chrome.html", { waitUntil: "networkidle", timeout: 60000 });

const variants = ["plain", "busy", "paused", "compose"];
let failures = 0;
for (const v of variants) {
  const r = await page.evaluate((name) => window.__renderChrome(name), v);
  if (!r.match) {
    failures++;
    let i = 0;
    const a = r.oracle;
    const b = r.next;
    while (i < Math.max(a.length, b.length) && a[i] === b[i]) i++;
    console.log(
      `FAIL ${v}: lengths ${a.length} vs ${b.length} — first diff at ${i}:\n  oracle: ${JSON.stringify(a.slice(Math.max(0, i - 60), i + 100))}\n  next:   ${JSON.stringify(b.slice(Math.max(0, i - 60), i + 100))}`
    );
  } else {
    console.log(`PASS ${v} (${r.oracle.length}b)`);
  }
}
console.log(failures === 0 ? "CHROME PARITY OK" : `${failures} variant(s) diverge`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
