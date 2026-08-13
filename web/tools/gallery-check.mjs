#!/usr/bin/env node
/**
 * Gallery self-check driver — asserts every tower part renders correctly.
 * Requires the gallery's built-in self-check (web/tools/gallery.html) and a
 * headless browser via playwright (dev-only dependency, not shipped).
 *
 *   node web/tools/gallery-check.mjs [url]
 *
 * Exits 0 on pass, 1 on any failing check, 2 if playwright is unavailable.
 */
const url = process.argv[2] || "http://127.0.0.1:8123/tools/gallery.html";
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "playwright not installed — run `npm i playwright` (dev-only) or open\n" +
      "web/tools/gallery.html in a browser and read the SELF-CHECK panel."
  );
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 2600 } });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errs.push("console: " + m.text());
});
await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
// wait for the async self-check (it re-renders at pitch 58 then back)
let result = null;
for (let i = 0; i < 40 && !result; i++) {
  await page.waitForTimeout(250);
  result = await page.evaluate(() => window.__galleryCheck || null);
}
if (!result) {
  console.error("self-check never completed");
  process.exit(1);
}
const panel = await page.evaluate(
  () => document.getElementById("selfcheck")?.innerText || ""
);
console.log(panel);
console.log("errors:", errs.length ? errs.join("\n") : "(none)");
await browser.close();
process.exit(result.pass && errs.length === 0 ? 0 : 1);
