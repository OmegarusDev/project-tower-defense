#!/usr/bin/env node
/**
 * Actions parity — ui/next/actions.js vs bindActions.handleUiAction.
 * Replays the full data-act vocabulary through a spy app on both sides
 * (5 initial-state variants) and requires identical call traces.
 *
 *   node tools/corpus/actionsParity.mjs
 */
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://127.0.0.1:8123/probe-actions.html", { waitUntil: "networkidle", timeout: 60000 });

let failures = 0;
for (const v of ["v1", "v2", "v3", "v4", "v5"]) {
  const r = await page.evaluate((name) => window.__runVariant(name), v);
  if (!r.match) {
    failures++;
    const a = r.oracle;
    const b = r.next;
    let i = 0;
    while (i < Math.max(a.length, b.length) && a[i] === b[i]) i++;
    console.log(
      `FAIL ${v}: ${r.oracleCount} oracle calls — first diff at ${i}:\n  oracle: ${JSON.stringify(a.slice(Math.max(0, i - 80), i + 100))}\n  next:   ${JSON.stringify(b.slice(Math.max(0, i - 80), i + 100))}`
    );
  } else {
    console.log(`PASS ${v} (${r.oracleCount} calls)`);
  }
}
console.log(failures === 0 ? "ACTIONS PARITY OK" : `${failures} variant(s) diverge`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
