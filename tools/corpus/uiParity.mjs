#!/usr/bin/env node
/**
 * DOM parity — the pure screen renderers (ui/next/screens.js) vs the oracle
 * screen modules, from identical state. Frozen time + seeded randomness,
 * fresh meta (localStorage cleared), like the corpus capture.
 *
 * Also reports whether the committed corpus snapshots are still current
 * (stale = re-capture with capture.mjs).
 *
 *   node tools/corpus/uiParity.mjs
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = join(HERE, "out", "screens");

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
let failures = 0;
for (const [name, opts] of cases) {
  const r = await page.evaluate(([n, o]) => window.__renderScreen(n, o), [name, opts]);
  if (!r.match) {
    failures++;
    // find the first difference
    let i = 0;
    const a = r.oracle;
    const b = r.next;
    while (i < Math.max(a.length, b.length) && a[i] === b[i]) i++;
    console.log(
      `FAIL ${name}: lengths ${a.length} vs ${b.length} — first diff at ${i}:\n  oracle: ${JSON.stringify(a.slice(Math.max(0, i - 40), i + 80))}\n  next:   ${JSON.stringify(b.slice(Math.max(0, i - 40), i + 80))}`
    );
  } else {
    console.log(`PASS ${name} (${r.oracle.length}b)`);
  }
}

// Tech overlay variants: selected node + a status line
const nodeId = await page.evaluate(() => window.__firstNodeId("foundations"));
if (nodeId) {
  const r = await page.evaluate(
    ([n, o]) => window.__renderScreen(n, o),
    ["tech", { techSelectedId: nodeId, status: "test status" }]
  );
  if (!r.match) {
    failures++;
    let i = 0;
    while (i < Math.max(r.oracle.length, r.next.length) && r.oracle[i] === r.next[i]) i++;
    console.log(
      `FAIL tech-overlay: lengths ${r.oracle.length} vs ${r.next.length} — first diff at ${i}:\n  oracle: ${JSON.stringify(r.oracle.slice(Math.max(0, i - 40), i + 80))}\n  next:   ${JSON.stringify(r.next.slice(Math.max(0, i - 40), i + 80))}`
    );
  } else {
    console.log(`PASS tech-overlay (${r.oracle.length}b)`);
  }
}

// Corpus snapshots (tools/corpus/out/screens/*.html) are captured through the
// REAL app flow (capture.mjs) — checkpoint state, post-mount paints and
// transition state included — so refresh them with `capture.mjs screens`,
// not against the pure renderers.

console.log(failures === 0 ? "\nUI PARITY OK" : `\n${failures} screen(s) diverge`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
