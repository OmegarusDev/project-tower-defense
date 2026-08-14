#!/usr/bin/env node
/**
 * UI (meta screens) regression — the pure screen renderers vs committed
 * golden HTML (the corpus becomes the oracle post-swap; re-capture with
 * --capture when screens deliberately change). Frozen time + seeded RNG,
 * fresh meta.
 *
 *   node tools/corpus/uiParity.mjs [--capture]
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out", "ui");
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
await page.goto("http://127.0.0.1:8123/probe-ui.html", { waitUntil: "networkidle", timeout: 60000 });

const cases = [
  ["main", {}],
  ["hub", {}],
  ["campaign", {}],
  ["forge", {}],
  ["tech", {}],
  ["settings", {}],
  ["victory", { firstClear: true }],
  ["victory", {}],
  ["gameover", { endless: true, endBestBonus: { parts: 9, aether: 4 } }],
  ["gameover", {}],
];
const nodeId = await page.evaluate(() => window.__firstNodeId("foundations"));
if (nodeId) cases.push(["tech", { techSelectedId: nodeId, status: "test status" }]);

let failures = 0;
for (const [name, opts] of cases) {
  const key = `${name}_${JSON.stringify(opts).replace(/[^a-zA-Z0-9]/g, "_")}`.slice(0, 80);
  const r = await page.evaluate(([n, o]) => window.__renderScreen(n, o), [name, opts]);
  if (CAPTURE) {
    writeFileSync(join(OUT, `${key}.html`), r.next);
    console.log(`CAPTURED ${key} (${r.next.length}b)`);
    continue;
  }
  const golden = join(OUT, `${key}.html`);
  if (!existsSync(golden)) {
    failures++;
    console.log(`FAIL ${key}: no golden — re-run with --capture`);
    continue;
  }
  const snap = readFileSync(golden, "utf8");
  if (r.next === snap) {
    console.log(`PASS ${key} (${r.next.length}b)`);
  } else {
    failures++;
    let i = 0;
    while (i < Math.max(r.next.length, snap.length) && r.next[i] === snap[i]) i++;
    console.log(
      `FAIL ${key}: first diff at ${i}:\n  now: ${JSON.stringify(r.next.slice(Math.max(0, i - 40), i + 80))}\n  gold: ${JSON.stringify(snap.slice(Math.max(0, i - 40), i + 80))}`
    );
  }
}

console.log(failures === 0 ? "UI PARITY OK" : `${failures} screen(s) diverge`);
await browser.close();
process.exit(CAPTURE || failures === 0 ? 0 : 1);
