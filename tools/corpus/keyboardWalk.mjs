#!/usr/bin/env node
/**
 * Keyboard-only pass — drives the three main flows (endless / campaign /
 * editor) with keyboard alone (Arrow keys + Enter + Space), asserting
 * arrow-nav cycles the visible [data-act] controls and actions fire, plus
 * a :focus-visible style is present on the focused control. §2.3.
 *
 *   node tools/corpus/keyboardWalk.mjs   (serve web/ on :8123 first)
 */
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(`${m.type()}: ${m.text()}`); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));

let failed = 0;
const step = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failed++;
};
const waitFor = async (fn, ms = 12000, stepMs = 200) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(stepMs);
  }
  return false;
};
const focusAct = () => page.evaluate(() => document.activeElement?.getAttribute?.("data-act") || "");
const focusVisible = () => page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return false;
  const cs = getComputedStyle(el);
  return cs.outlineStyle !== "none" && cs.outlineWidth !== "0px";
});
const matchesFocus = (v) => page.evaluate((target) => {
  const el = document.activeElement;
  if (!el || !el.getAttribute) return false;
  const a = el.getAttribute("data-act");
  if (!a) return false;
  const t = el.textContent?.trim() || "";
  return a === target || a.startsWith(target) || t.toLowerCase().includes(target.toLowerCase());
}, v);

/** Press `key` up to `max` times until the active element matches; asserts it. */
async function pressUntil(label, key, target, max = 16) {
  let ok = false;
  for (let i = 0; i < max && !ok; i++) {
    if (await matchesFocus(target)) { ok = true; break; }
    await page.keyboard.press(key);
    await page.waitForTimeout(120);
  }
  ok = ok || (await matchesFocus(target));
  step(label, ok);
  return ok;
}

await page.goto("http://127.0.0.1:8123/", { waitUntil: "networkidle" });
await page.evaluate(() => { try { localStorage.removeItem("ptd_meta_v1"); localStorage.removeItem("ptd_endless_v1"); } catch (_) {} });
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(800);

// ── Flow 1: Endless ──
step("title focusable acts", await page.evaluate(() =>
  [...document.querySelectorAll("[data-act]")].filter((b) => b.getBoundingClientRect().width > 0).length >= 4
));
await page.keyboard.press("ArrowRight");
const t1 = await focusAct();
await page.keyboard.press("ArrowRight");
step("arrows move focus on title", (await focusAct()) !== t1);
step("focus-visible style present", await focusVisible());
await pressUntil("endless via keyboard", "ArrowRight", "endless");
await page.keyboard.press("Enter");
step("endless hub reached", await waitFor(() => document.querySelector(".hub-screen")));
await pressUntil("hub main-menu button", "ArrowDown", "main");
await page.keyboard.press("Enter");
step("back to title", await waitFor(() => !!document.querySelector(".title-screen")));

// ── Flow 2: Campaign ──
await pressUntil("campaign via keyboard", "ArrowRight", "campaign");
await page.keyboard.press("Enter");
step("campaign reached", await waitFor(() => !!document.querySelector(".level-grid")));
await pressUntil("level-1 via keyboard", "ArrowDown", "prep:", 24);
await page.keyboard.press("Enter");
step("prep reached", await waitFor(() => !!document.querySelector(".prep-layout")));
await pressUntil("start-level via keyboard", "ArrowDown", "start-level:", 24);
await page.keyboard.press("Enter");
step("campaign run started", await waitFor(() => !!document.querySelector(".game-chrome"), 15000));
// exit the campaign run: pause → quit-run → confirm
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
await pressUntil("pause quit-run", "ArrowDown", "quit-run", 24);
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
await pressUntil("confirm ok", "ArrowDown", "confirm-ok", 24);
await page.keyboard.press("Enter");
step("game exited", await waitFor(() => !document.querySelector(".game-chrome")));

// ── Flow 3: Editor ──
await pressUntil("back to title for editor", "ArrowDown", "main", 24);
await page.keyboard.press("Enter");
await waitFor(() => !!document.querySelector(".title-screen"));
await pressUntil("editor via keyboard", "ArrowRight", "editor");
await page.keyboard.press("Enter");
step("editor reached", await waitFor(() => !!document.querySelector("#edCols")));
await page.keyboard.press("ArrowRight");
step("editor focus-visible", await focusVisible());
await pressUntil("editor playtest button", "ArrowDown", "ed-playtest", 90);
await page.keyboard.press("Enter");
step("editor playtest runs", await waitFor(() => !!document.querySelector(".game-chrome"), 15000));

console.log(failed ? `${failed} FAILURE(S)` : "KEYBOARD WALK OK");
console.log(errs.length ? errs : "console clean");
await browser.close();
process.exit(failed ? 1 : 0);