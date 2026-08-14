#!/usr/bin/env node
/**
 * Render + DOM corpus capture (oracle). Uses headless chromium with FROZEN
 * performance.now (cosmetic animations pin to one phase) and a SEEDED
 * Math.random (motes/stains reproducible) so the same conditions can be
 * reproduced exactly against the ported build.
 *
 * Captures:
 *  - gallery tiles: every part canvas at pitch 24 and 58 (PNG data URLs)
 *  - board scene: an endless run, seeded, at a fixed frame
 *  - screens: hub / campaign / forge / tech / settings / prep — innerHTML
 *    (DOM corpus) + screenshots
 *
 *   node tools/corpus/capture.mjs [--scenes gallery,board,screens]
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
mkdirSync(join(OUT, "goldens"), { recursive: true });
mkdirSync(join(OUT, "screens"), { recursive: true });

const BASE = process.env.CORPUS_URL || "http://127.0.0.1:8123/";

const SCENES = (process.argv[2] || "all")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const want = (s) => SCENES.includes("all") || SCENES.includes(s);

// Deterministic stubs: frozen animation time + seeded randomness.
const STUBS = `
  (() => {
    const origNow = performance.now.bind(performance);
    performance.now = () => 1000;
    let s = 1234567;
    Math.random = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  })();
`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});
page.on("dialog", (d) => d.accept().catch(() => {}));
await page.addInitScript(STUBS);

const clickT = async (txt) => {
  const ok = await page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => x.textContent.includes(t) && x.offsetParent !== null
    );
    if (!b) return false;
    b.click();
    return true;
  }, txt);
  if (!ok) throw new Error("no button: " + txt);
};

const savePNG = async (name, canvasSel) => {
  const dataUrl = await page.evaluate((sel) => {
    const c = document.querySelector(sel);
    return c ? c.toDataURL("image/png") : null;
  }, canvasSel);
  if (!dataUrl) return false;
  writeFileSync(join(OUT, "goldens", name + ".png"), Buffer.from(dataUrl.split(",")[1], "base64"));
  return true;
};

const saveHTML = (name, html) =>
  writeFileSync(join(OUT, "screens", name + ".html"), html);

await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1200);

if (want("gallery")) {
  await page.goto(BASE + "tools/gallery.html", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(800);
  for (const pitch of [24, 58]) {
    await page.evaluate((v) => {
      const el = document.getElementById("pitch");
      el.value = String(v);
      el.dispatchEvent(new Event("input"));
    }, pitch);
    await page.waitForTimeout(300);
    const tiles = await page.evaluate(() => {
      const cvs = [...document.querySelectorAll("canvas")];
      const names = [...document.querySelectorAll("figcaption")].map((f) =>
        f.textContent.trim().replace(/[^a-zA-Z0-9]/g, "_")
      );
      return cvs.map((c, i) => ({ i, name: `${names[i] || i}`, data: c.toDataURL("image/png") }));
    });
    for (const t of tiles) {
      writeFileSync(
        join(OUT, "goldens", `tile_p${pitch}_${String(t.i).padStart(2, "0")}_${t.name}.png`),
        Buffer.from(t.data.split(",")[1], "base64")
      );
    }
    console.log(`gallery @${pitch}: ${tiles.length} tiles`);
  }
}

if (want("board")) {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    try {
      localStorage.removeItem("ptd_meta_v1");
      localStorage.removeItem("ptd_endless_v1");
    } catch (_) {}
  });
  await clickT("Endless");
  await page.waitForTimeout(500);
  await clickT("New Run");
  await page.waitForTimeout(1500);
  // Place one tower at a deterministic cell, deploy, and let wave 1 run.
  await page.mouse.click(640, 460);
  await page.waitForTimeout(300);
  await page.mouse.click(640, 460);
  await page.waitForTimeout(400);
  await page.locator(".call-btn").click();
  await page.waitForTimeout(500);
  // Fixed number of frames for a stable sim moment
  await page.evaluate(
    () =>
      new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))
      )
  );
  const shot = await page.screenshot();
  writeFileSync(join(OUT, "goldens", "board_scene.png"), shot);
  // Slot previews
  const previews = await page.evaluate(() =>
    [...document.querySelectorAll("[data-slot-preview]")].map((c) => c.toDataURL("image/png"))
  );
  previews.forEach((d, i) =>
    writeFileSync(join(OUT, "goldens", `slot_${i}.png`), Buffer.from(d.split(",")[1], "base64"))
  );
  console.log(`board scene + ${previews.length} slot previews`);
}

if (want("screens")) {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1200);
  const snap = async (name) => {
    const html = await page.evaluate(() => document.querySelector(".screen")?.outerHTML || "");
    saveHTML(name, html);
    const shot = await page.screenshot();
    writeFileSync(join(OUT, "screens", name + ".png"), shot);
    console.log(`screen ${name}: ${html.length}b`);
  };
  await snap("title");
  await clickT("Endless");
  await page.waitForTimeout(500);
  await snap("hub");
  await page.evaluate(() => {
    document.querySelector(".x-close")?.click();
  });
  await page.waitForTimeout(400);
  await clickT("Campaign");
  await page.waitForTimeout(500);
  await snap("campaign");
  await page.evaluate(() => {
    document.querySelector(".x-close")?.click();
  });
  await page.waitForTimeout(400);
  await clickT("Forge");
  await page.waitForTimeout(500);
  await snap("forge");
  await page.evaluate(() => {
    document.querySelector(".x-close")?.click();
  });
  await page.waitForTimeout(400);
  await clickT("Tech Tree");
  await page.waitForTimeout(500);
  await snap("tech");
  await page.evaluate(() => {
    document.querySelector(".x-close")?.click();
  });
  await page.waitForTimeout(400);
  await clickT("Settings");
  await page.waitForTimeout(500);
  await snap("settings");
}

console.log("errors:", errors.length ? errors.join("\n") : "(none)");
await browser.close();
