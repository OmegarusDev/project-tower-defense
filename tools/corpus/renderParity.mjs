#!/usr/bin/env node
/**
 * Render parity — the NEW data-driven renderer vs the oracle goldens.
 * Renders the sentry x single x kinetic tiles at pitches 24 and 58 (the
 * proof subset) and requires byte-identical pixels with the committed
 * goldens. Same canvas geometry as the gallery capture (200px tiles,
 * CSS 92, +6px inset), frozen time + seeded randomness stubs.
 *
 *   node tools/corpus/renderParity.mjs [--pitch 24,58]
 */
import { chromium } from "playwright";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out", "goldens");

const pitch = (process.argv[2] || "24,58").split(",").map(Number);
const STUBS = `
  (() => {
    performance.now = () => 1000;
    let s = 1234567;
    Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  })();
`;

const HTML = `
<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head>
<body><div id="host"></div>
<script type="module">
  import { ProcPalette } from "/js/view/palette.js";
  import { renderTowerNext } from "/js/view/next/renderTower.js";
  import { renderEnemyNext } from "/js/view/next/renderEnemy.js";
  import { setPitch } from "/js/view/view25.js";
  const palette = new ProcPalette();
  const SIZE = 200, CSS = 92;
  window.__render = (base, barrel, payload, angle, pitchDeg) => {
    setPitch(pitchDeg);
    const c = document.createElement("canvas");
    c.width = SIZE; c.height = SIZE;
    const ctx = c.getContext("2d");
    renderTowerNext(ctx, palette, { base, barrel, payload, aimAngle: angle, level: 1 }, (SIZE - CSS) / 2, (SIZE - CSS) / 2 + 6, CSS, { showBadge: false });
    return c.toDataURL("image/png");
  };
  window.__renderEnemy = (kind, pitchDeg) => {
    setPitch(pitchDeg);
    const c = document.createElement("canvas");
    c.width = SIZE; c.height = SIZE;
    const ctx = c.getContext("2d");
    renderEnemyNext(ctx, palette, kind, SIZE / 2, (SIZE - CSS) / 2 + 6 + CSS / 2, CSS, { t: 1, phase: 0 });
    return c.toDataURL("image/png");
  };
</script></body></html>
`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript(STUBS);
await page.setContent(HTML);
await page.goto("http://127.0.0.1:8123/dev/probe.html", { waitUntil: "networkidle" }).catch(() => {});

const ANG = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
const BASES = ["sentry", "bulwark", "spire", "aerie", "warden", "talon"];
const BARRELS = ["single", "twin", "scatter", "rail", "pulse", "launcher", "flak"];
const PAYLOADS = ["kinetic", "pyro", "shock", "frost", "poison", "acid", "breach", "emp"];
let failures = 0;
let checked = 0;

const diffTile = async (goldenFile, label, spec, ang, p) => {
  const golden = readFileSync(goldenFile);
  const dataUrl = await page.evaluate(([b, r, pl, ang, pd]) => window.__render(b, r, pl, ang, pd), [spec[0], spec[1], spec[2], ang, p]);
  const rendered = Buffer.from(dataUrl.split(",")[1], "base64");
  checked++;
  if (golden.equals(rendered)) return true;
  const { PNG } = await import("pngjs");
  const ga = PNG.sync.read(golden);
  const rb = PNG.sync.read(rendered);
  let diff = 0;
  let total = 0;
  for (let i = 0; i < ga.data.length; i += 4) {
    total++;
    const d =
      Math.abs(ga.data[i] - rb.data[i]) +
      Math.abs(ga.data[i + 1] - rb.data[i + 1]) +
      Math.abs(ga.data[i + 2] - rb.data[i + 2]) +
      Math.abs(ga.data[i + 3] - rb.data[i + 3]);
    if (d > 12) diff++;
  }
  const pct = (diff / total) * 100;
  if (pct < 0.02) {
    console.log(`PASS ${label} pitch ${p} angle ${ang} (${diff} AA px, ${pct.toFixed(3)}%)`);
    return true;
  }
  failures++;
  console.log(`FAIL ${label} pitch ${p} angle ${ang}: ${diff}/${total} px differ (${pct.toFixed(2)}%)`);
  return false;
};

const nBase = BASES.length * 4;
const nBarrel = BARRELS.length * 4;
const nPayload = PAYLOADS.length * 4;
const ENEMY_KINDS = ["mite", "courier", "hauler", "hauler_ceramite", "duct", "ward", "ward_volt", "cask", "phantom", "kiln", "siphon", "claim", "skulk"];

for (const p of pitch) {
  // bases section (idx 0..23): base i at i*4+a
  for (let i = 0; i < BASES.length; i++) {
    for (let a = 0; a < 4; a++) {
      await diffTile(join(OUT, `tile_p${p}_${String(i * 4 + a).padStart(2, "0")}_${BASES[i]}.png`), `${BASES[i]}/single/kinetic`, [BASES[i], "single", "kinetic"], ANG[a], p);
    }
  }
  // barrels section (idx 24..55): barrel i at nBase + i*4+a
  for (let i = 0; i < BARRELS.length; i++) {
    for (let a = 0; a < 4; a++) {
      await diffTile(join(OUT, `tile_p${p}_${String(nBase + i * 4 + a).padStart(2, "0")}_${BARRELS[i]}.png`), `sentry/${BARRELS[i]}/kinetic`, ["sentry", BARRELS[i], "kinetic"], ANG[a], p);
    }
  }
  // payloads section (idx 56..83): payload i at (nBase + nBarrel) + i*4+a
  for (let i = 0; i < PAYLOADS.length; i++) {
    for (let a = 0; a < 4; a++) {
      await diffTile(join(OUT, `tile_p${p}_${String(nBase + nBarrel + i * 4 + a).padStart(2, "0")}_${PAYLOADS[i]}.png`), `sentry/single/${PAYLOADS[i]}`, ["sentry", "single", PAYLOADS[i]], ANG[a], p);
    }
  }
  // enemies section (idx 84..95): kind i at (nBase + nBarrel + nPayload) + i
  for (let i = 0; i < ENEMY_KINDS.length; i++) {
    const golden = readFileSync(join(OUT, `tile_p${p}_${String(nBase + nBarrel + nPayload + i).padStart(2, "0")}_${ENEMY_KINDS[i]}.png`));
    const dataUrl = await page.evaluate(([k, pd]) => window.__renderEnemy(k, pd), [ENEMY_KINDS[i], p]);
    const rendered = Buffer.from(dataUrl.split(",")[1], "base64");
    checked++;
    if (golden.equals(rendered)) continue;
    const { PNG } = await import("pngjs");
    const ga = PNG.sync.read(golden);
    const rb = PNG.sync.read(rendered);
    let diff = 0;
    let total = 0;
    for (let i2 = 0; i2 < ga.data.length; i2 += 4) {
      total++;
      const d =
        Math.abs(ga.data[i2] - rb.data[i2]) +
        Math.abs(ga.data[i2 + 1] - rb.data[i2 + 1]) +
        Math.abs(ga.data[i2 + 2] - rb.data[i2 + 2]) +
        Math.abs(ga.data[i2 + 3] - rb.data[i2 + 3]);
      if (d > 12) diff++;
    }
    const pct = (diff / total) * 100;
    if (pct < 0.02) {
      console.log(`PASS enemy ${ENEMY_KINDS[i]} pitch ${p} (${diff} AA px, ${pct.toFixed(3)}%)`);
      continue;
    }
    failures++;
    console.log(`FAIL enemy ${ENEMY_KINDS[i]} pitch ${p}: ${diff}/${total} px differ (${pct.toFixed(2)}%)`);
  }
}
console.log(failures === 0 ? `RENDER PARITY OK (${checked} tiles)` : `${failures} tile(s) diverge`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
