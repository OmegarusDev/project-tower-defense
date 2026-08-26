#!/usr/bin/env node
/**
 * Actions dispatch regression — runAction's call traces vs committed
 * goldens over the full act vocabulary × 5 state variants (--capture to
 * refresh). The trace format is the SAME the reference-vs-next gate used.
 *
 *   node tools/corpus/actionsParity.mjs [--capture]
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out", "actions");
const CAPTURE = process.argv.includes("--capture");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://127.0.0.1:8123/dev/probe-actions.html", { waitUntil: "networkidle", timeout: 60000 });

let failures = 0;
for (const v of ["v1", "v2", "v3", "v4", "v5"]) {
  const r = await page.evaluate((name) => window.__runVariant(name), v);
  if (CAPTURE) {
    writeFileSync(join(OUT, `${v}.json`), r.trace);
    console.log(`CAPTURED ${v} (${r.count} calls)`);
    continue;
  }
  const golden = join(OUT, `${v}.json`);
  if (!existsSync(golden)) {
    failures++;
    console.log(`FAIL ${v}: no golden — re-run with --capture`);
    continue;
  }
  const snap = readFileSync(golden, "utf8");
  if (r.trace === snap) {
    console.log(`PASS ${v} (${r.count} calls)`);
  } else {
    failures++;
    let i = 0;
    while (i < Math.max(r.trace.length, snap.length) && r.trace[i] === snap[i]) i++;
    console.log(
      `FAIL ${v}: first diff at ${i}:\n  now: ${JSON.stringify(r.trace.slice(Math.max(0, i - 80), i + 100))}\n  gold: ${JSON.stringify(snap.slice(Math.max(0, i - 80), i + 100))}`
    );
  }
}
console.log(failures === 0 ? "ACTIONS PARITY OK" : `${failures} variant(s) diverge`);
await browser.close();
process.exit(CAPTURE || failures === 0 ? 0 : 1);
