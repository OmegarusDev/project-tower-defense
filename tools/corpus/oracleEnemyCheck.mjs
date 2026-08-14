#!/usr/bin/env node
/** Diff the ORACLE drawEnemyBody against the committed golden for a kind. */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
const kind = process.argv[2] || "cask";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript(`
  (() => {
    performance.now = () => 1000;
    let s = 1234567;
    Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  })();
`);
await page.goto("http://127.0.0.1:8123/probe.html", { waitUntil: "networkidle" });

const { PNG } = await import("pngjs");
const KINDS = ["mite", "courier", "hauler", "hauler_ceramite", "duct", "ward", "ward_volt", "cask", "phantom", "kiln", "siphon", "claim"];
for (const p of [24, 58]) {
  for (const k of kind === "all" ? KINDS : [kind]) {
    const idx = 84 + KINDS.indexOf(k);
    const golden = PNG.sync.read(readFileSync(join(OUT, "goldens", `tile_p${p}_${String(idx).padStart(2, "0")}_${k}.png`)));
    const dataUrl = await page.evaluate(([kk, pd]) => window.__renderOracleEnemy(kk, pd), [k, p]);
    const r = PNG.sync.read(Buffer.from(dataUrl.split(",")[1], "base64"));
    let diff = 0;
    for (let i = 0; i < golden.data.length; i += 4) {
      const d = Math.abs(golden.data[i] - r.data[i]) + Math.abs(golden.data[i + 1] - r.data[i + 1]) + Math.abs(golden.data[i + 2] - r.data[i + 2]) + Math.abs(golden.data[i + 3] - r.data[i + 3]);
      if (d > 12) diff++;
    }
    console.log(`ORACLE-vs-golden ${k} pitch ${p}: ${diff} px`);
  }
}
await browser.close();
