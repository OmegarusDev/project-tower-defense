#!/usr/bin/env node
/**
 * Live smoke walk — the swapped app's full flow, asserting zero console
 * errors and the expected screens. Catches app-integration regressions the
 * unit gates can't (event wiring, state adapters, screen routing).
 *
 *   node tools/corpus/smokeWalk.mjs
 */
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("CONSOLE: " + m.text());
});
let failures = 0;
const step = (name, ok) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
};

/** Click the screen-center of an empty buildable cell (robust across ratios). */
async function clickEmptyCell(page, offset = 0) {
  return page.evaluate((off) => {
    const app = window.__app;
    const s = app.sim._s;
    const found = [];
    for (let y = 2; y < s.grid.rows; y++) {
      for (let x = 0; x < s.grid.cols; x++) {
        if (s.grid.isBuildable(x, y)) found.push([x, y]);
      }
    }
    if (!found.length) return null;
    const [cx, cy] = found[Math.min(off, found.length - 1)];
    const p = app.board.cellScreenCenter(cx, cy);
    const r = app.board.canvas.getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, offset);
}

await page.goto("http://127.0.0.1:8123/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1000);
step("title screen", await page.evaluate(() => !!document.querySelector(".splash-screen")));

// Boot now lands on a splash gate before the main menu.
await page.click("[data-act='splash-start']");
await page.waitForTimeout(800);

// endless run: place, select, sell, undo, wall, compose, pause, quit
await page.click("text=Endless");
await page.waitForTimeout(600);
await page.click("text=New Run");
await page.waitForTimeout(1500);
step("game chrome", await page.evaluate(() => !!document.querySelector(".game-chrome")));
// Fresh runs boot with no slot selected — pick dock slot 1 first.
await page.click("[data-act='slot:0']");
await page.waitForTimeout(300);
const t1 = await clickEmptyCell(page, 0);
await page.mouse.click(t1.x, t1.y);
await page.waitForTimeout(300);
await page.mouse.click(t1.x, t1.y);
await page.waitForTimeout(500);
step("tower placed", (await page.evaluate(() => window.__app.sim.towers.length)) === 1);
await page.mouse.click(t1.x, t1.y);
await page.waitForTimeout(400);
step("tower overlay", await page.evaluate(() => !document.getElementById("towerOverlay")?.classList.contains("hidden")));
await page.click("[data-act='sell']");
await page.waitForTimeout(400);
await page.click("[data-act='undo']");
await page.waitForTimeout(400);
step("sell + undo", (await page.evaluate(() => window.__app.sim.towers.length)) === 1);
await page.click(".compose-fab");
await page.waitForTimeout(400);
step("compose sheet", await page.evaluate(() => !!document.getElementById("composeSheet")));
await page.click("[data-act='compose-close']");
await page.waitForTimeout(300);
await page.click(".call-btn");
await page.waitForTimeout(2000);
step("wave running", await page.evaluate(() => document.querySelector("#waveNum")?.textContent !== "0"));
await page.click(".hud-pause");
await page.waitForTimeout(400);
step("pause sheet", await page.evaluate(() => !!document.getElementById("pauseSheet")));
await page.click(".pause-card [data-act='resume']");
await page.waitForTimeout(300);

// forced game over (sim path, no waiting on wave death).
// Spawn the sacrificial enemy on the LIVE trunk path — a hardcoded cell can
// end up walled off and never leak.
const leakAt = await page.evaluate(() => {
  const s = window.__app.sim._s;
  let x = s.grid.spawn.x, y = s.grid.spawn.y;
  let last = { x, y };
  for (let i = 0; i < 500; i++) {
    if (s.grid.isExit(x, y)) break;
    last = { x, y };
    const n = s.grid.groundNext[s.grid.idx(x, y)];
    if (!n || (n.x === x && n.y === y)) break;
    x = n.x; y = n.y;
  }
  return last;
});
await page.evaluate(({ x: cx, y: cy }) => {
  const sim = window.__app.sim;
  sim.setStartLives(1, { resetCurrent: true });
  sim.enemies.push({
    id: 999, pos: { x: cx + 0.5, y: cy + 0.5 }, cell: { x: cx, y: cy },
    hp: 9999, maxHp: 9999, kind: "mite", silhouette: "mite", speed: 0.5, ballast: "mid", slowAmount: 0,
  });
}, leakAt);
let over = false;
for (let i = 0; i < 20 && !over; i++) {
  await page.waitForTimeout(500);
  over = await page.evaluate(() => document.querySelector(".end-screen")?.innerText?.includes("FALLEN") ?? false);
}
step("game over screen", over);
await page.click("[data-act='main']");
await page.waitForTimeout(500);

// forced campaign victory
await page.click("text=Campaign");
await page.waitForTimeout(700);
await page.click("[data-act='prep:1']");
await page.waitForTimeout(700);
step("prep screen", await page.evaluate(() => !!document.querySelector(".prep-layout")));
await page.click("text=Start Level");
await page.waitForTimeout(1500);
await page.evaluate(() => {
  window.__app.sim._s.wavesToWin = 1;
});
await page.click(".call-btn");
await page.waitForTimeout(400);
await page.evaluate(() => {
  const s = window.__app.sim._s;
  s.waves.toSpawn = 0;
  s.enemies.length = 0;
});
await page.waitForTimeout(2000);
step("victory screen", await page.evaluate(() => document.querySelector(".end-screen")?.innerText?.includes("CLEAR") ?? false));

// meta screens
await page.click(".end-actions [data-act='main']").catch(() => page.click("[data-act='main']"));
await page.waitForTimeout(500);
await page.click("text=Forge");
await page.waitForTimeout(700);
step("forge screen", await page.evaluate(() => !!document.querySelector(".forge-screen")));
step("forge nav arrows", await page.evaluate(() => document.querySelectorAll(".forge-arrow").length === 2));
await page.click("[data-act='forge-slot-next']");
await page.waitForTimeout(400);
step("forge cycles slots", await page.evaluate(() => document.querySelector(".forge-slot-card.active h3")?.textContent?.startsWith("Slot 2") ?? false));
// cycle to the unlock panel (slotCount 3 fresh -> panel at index 3)
await page.click("[data-act='forge-slot-next']");
await page.click("[data-act='forge-slot-next']");
await page.waitForTimeout(400);
step("forge unlock panel", await page.evaluate(() => !!document.querySelector(".forge-unlock-content")));
await page.click("[data-act='forge-slot-next']");
await page.waitForTimeout(400);
step("forge loops back to slot 1", await page.evaluate(() => document.querySelector(".forge-slot-card.active h3")?.textContent?.startsWith("Slot 1") ?? false));
await page.click(".x-close");
await page.waitForTimeout(400);
await page.click("text=Tech Tree");
await page.waitForTimeout(700);
step("tech screen", await page.evaluate(() => !!document.querySelector(".tech-screen")));
await page.click(".x-close");
await page.waitForTimeout(400);
await page.click("text=Settings");
await page.waitForTimeout(600);
step("settings screen", await page.evaluate(() => !!document.querySelector(".settings-plate")));

console.log(errors.length ? `ERRORS: ${JSON.stringify(errors.slice(0, 5))}` : "errors: NONE");
console.log(failures === 0 && errors.length === 0 ? "SMOKE WALK OK" : `${failures + errors.length} issue(s)`);
await browser.close();
process.exit(failures === 0 && errors.length === 0 ? 0 : 1);
