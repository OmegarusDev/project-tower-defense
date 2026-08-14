#!/usr/bin/env node
/**
 * QA walk — the release bar's manual-QA checklist automated over the three
 * target device ratios. Drives the full app flow at each viewport and
 * asserts zero console errors AND warnings (the manual pass still eyeballs
 * visuals/feel; this covers the mechanical console-clean bar).
 *
 *   node tools/corpus/qaWalk.mjs   (serve web/ on :8123 first)
 */
import { chromium } from "playwright";

const VIEWPORTS = [
  { name: "phone", width: 430, height: 932 },
  { name: "tablet", width: 1280, height: 800 },
  { name: "desktop", width: 1920, height: 1080 },
];

const browser = await chromium.launch();
let failed = 0;

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

/** Wait (bounded) until fn() is truthy. */
async function waitFor(page, fn, ms = 12000, stepMs = 250) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(stepMs);
  }
  return false;
}

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const problems = [];
  page.on("pageerror", (e) => problems.push("PAGEERROR: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type().toUpperCase()}: ${m.text()}`);
  });
  let local = 0;
  const step = (name, ok) => {
    if (!ok) { local++; failed++; }
    console.log(`[${vp.name}] ${ok ? "PASS" : "FAIL"} ${name}`);
  };

  await page.goto("http://127.0.0.1:8123/", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1000);
  step("title screen", await page.evaluate(() => !!document.querySelector(".title-screen")));

  // endless: place/sell/undo/wall → wave → pause → speed → quit-confirm → hub → continue
  await page.click("text=Endless");
  await page.waitForTimeout(600);
  await page.click("text=New Run");
  await page.waitForTimeout(1500);
  step("game chrome", await page.evaluate(() => !!document.querySelector(".game-chrome")));

  const t1 = await clickEmptyCell(page, 0);
  const t2 = await clickEmptyCell(page, 1);
  await page.mouse.click(t1.x, t1.y);
  await page.waitForTimeout(300);
  await page.mouse.click(t1.x, t1.y);
  await page.waitForTimeout(500);
  step("tower placed", (await page.evaluate(() => window.__app.sim.towers.length)) === 1);
  await page.click("[data-act='tool:wall']");
  await page.mouse.click(t2.x, t2.y);
  await page.waitForTimeout(400);
  step("wall placed", (await page.evaluate(() => window.__app.sim.walls.length)) === 1);
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
  await page.click("[data-act='speed:2']");
  await page.waitForTimeout(250);
  step("speed toggle", await page.evaluate(() => window.__app.speed === 2));
  await page.click(".pause-card [data-act='resume']");
  await page.waitForTimeout(300);
  await page.click(".hud-pause");
  await page.waitForTimeout(400);
  await page.click("[data-act='quit-run']");
  await page.waitForTimeout(500);
  step("quit confirm sheet", await page.evaluate(() => !!document.querySelector(".confirm-sheet")));
  await page.click("[data-act='confirm-ok']");
  step("endless hub after quit", await waitFor(page, () => !!document.querySelector(".hub-screen")));
  step("continue available", await page.evaluate(() => !document.querySelector(".hub-continue")?.disabled));
  await page.click("[data-act='continue']");
  step("continue resumes run", await waitFor(page, () => !!document.querySelector(".game-chrome")));

  // more actions in the resumed run → a longer ghost log so the replay isn't instant
  for (const off of [2, 3]) {
    const p = await clickEmptyCell(page, off);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(250);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(400);
  }
  step("resumed placements", (await page.evaluate(() => window.__app.sim.towers.length)) >= 2);

  // forced game over (sim path): call the resumed wave, then leak a 1-life run
  await page.click(".call-btn");
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const sim = window.__app.sim;
    sim.setStartLives(1, { resetCurrent: true });
    sim.enemies.push({
      id: 999, pos: { x: 4.5, y: 7.4 }, cell: { x: 4, y: 6 },
      hp: 9999, maxHp: 9999, kind: "mite", silhouette: "mite", speed: 0.5, ballast: "mid", slowAmount: 0,
    });
  });
  const over = await waitFor(page, () => document.querySelector(".end-screen")?.innerText?.includes("FALLEN") ?? false, 15000);
  step("game over screen", over);
  step("ghost replay button", await page.evaluate(() => !!document.querySelector("[data-act='ghost-replay']")));
  const metaBefore = await page.evaluate(() => ({
    aether: window.__app.meta.aether,
    forge: window.__app.meta.forge,
    best: window.__app.meta.bestWave,
  }));
  const endWave = await page.evaluate(() => document.querySelector(".end-wave-num")?.textContent);
  await page.click("[data-act='ghost-replay']");
  step("ghost replay runs", await waitFor(page, () => !!document.querySelector(".game-chrome")));
  step("ghost bar controls", await waitFor(page, () => !!document.querySelector("#ghostBar [data-act='ghost-speed:4']")));
  step("ghost call label", await page.evaluate(() => {
    const cb = document.querySelector("#callBtn");
    return !!cb?.disabled && (document.querySelector("#callLabel")?.textContent || "").trim().length > 0;
  }));
  await page.click("[data-act='ghost-speed:4']");
  step("ghost speed 4x", await page.evaluate(() => window.__app?._ghost?.speed === 4));
  await page.click("[data-act='ghost-skip']");
  step("ghost skip returns to game over", await waitFor(page, () => !!document.querySelector(".end-screen")));
  step("end screen restored", await page.evaluate(
    (w) => document.querySelector(".end-wave-num")?.textContent === w,
    endWave
  ));
  const metaAfter = await page.evaluate(() => ({
    aether: window.__app.meta.aether,
    forge: window.__app.meta.forge,
    best: window.__app.meta.bestWave,
  }));
  step("ghost credits nothing", await page.evaluate(
    ([m0, m1]) => m0.aether === m1.aether && m0.forge === m1.forge && m0.best === m1.best,
    [metaBefore, metaAfter]
  ));
  await page.click("[data-act='ghost-replay']");
  step("ghost replay runs again", await waitFor(page, () => !!document.querySelector("#ghostBar")));
  await page.click(".hud-pause");
  await page.waitForTimeout(400);
  await page.click("[data-act='quit-run']");
  await page.waitForTimeout(400);
  await page.click("[data-act='confirm-ok']");
  step("back to hub after replay quit", await waitFor(page, () => !!document.querySelector(".hub-screen")));

  // campaign: prep → start → win
  await page.click(".x-close");
  await page.waitForTimeout(500);
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
  step("victory screen", await waitFor(page, () => document.querySelector(".end-screen")?.innerText?.includes("CLEAR") ?? false));
  await page.click(".end-actions [data-act='main']").catch(() => page.click("[data-act='main']"));
  await page.waitForTimeout(500);

  // forge
  await page.click("text=Forge");
  await page.waitForTimeout(700);
  step("forge screen", await page.evaluate(() => !!document.querySelector(".forge-screen")));
  step("forge stat bars", await page.evaluate(() => document.querySelectorAll(".stat-bar").length > 0));
  await page.click("[data-act='forge-slot-next']");
  await page.waitForTimeout(300);
  await page.click("[data-act='forge-slot-next']");
  await page.waitForTimeout(300);
  await page.click("[data-act='forge-slot-next']");
  await page.waitForTimeout(300);
  step("forge unlock panel", await page.evaluate(() => !!document.querySelector(".forge-unlock")));
  await page.click("[data-act='forge-slot-next']");
  await page.waitForTimeout(300);
  step("forge loops to slot 1", await page.evaluate(() => document.querySelector(".forge-summary h3")?.textContent?.startsWith("Slot 1") ?? false));
  await page.click(".x-close");
  await page.waitForTimeout(400);

  // tech
  await page.click("text=Tech Tree");
  await page.waitForTimeout(700);
  step("tech screen", await page.evaluate(() => !!document.querySelector(".tech-screen")));
  await page.click(".x-close");
  await page.waitForTimeout(400);

  // settings: toggle every control + reload persistence
  await page.click("text=Settings");
  await page.waitForTimeout(600);
  step("settings screen", await page.evaluate(() => !!document.querySelector(".settings-plate")));
  await page.click("#cb");
  await page.click("#particles");
  await page.click("#music");
  await page.click("#musicVol");
  await page.keyboard.press("ArrowLeft");
  await page.click("#sfxVol");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.click("text=Settings");
  await page.waitForTimeout(600);
  step("settings persist after reload", await page.evaluate(() => document.querySelector("#music")?.checked === false));

  // editor: playtest → quit → back
  await page.click(".x-close");
  await page.waitForTimeout(400);
  await page.click("text=Editor");
  await page.waitForTimeout(700);
  step("editor screen", await page.evaluate(() => !!document.querySelector(".ed-grid")));
  await page.click("[data-act='ed-playtest']");
  step("editor playtest runs", await waitFor(page, () => !!document.querySelector(".game-chrome")));
  await page.click(".hud-pause");
  await page.waitForTimeout(400);
  await page.click("[data-act='quit-run']");
  await page.waitForTimeout(400);
  await page.click("[data-act='confirm-ok']");
  step("back to editor", await waitFor(page, () => !!document.querySelector(".ed-grid")));
  await page.click(".x-close");
  await page.waitForTimeout(500);

  const clean = problems.length === 0;
  console.log(`[${vp.name}] ${clean ? "console clean" : "PROBLEMS: " + JSON.stringify(problems.slice(0, 8))}`);
  if (!clean) failed += problems.length;
  console.log(`[${vp.name}] ${local === 0 && clean ? "QA WALK OK" : (local + problems.length) + " issue(s)"}`);
  await page.close();
}

console.log(failed === 0 ? "ALL RATIOS QA WALK OK" : `${failed} issue(s) across ratios`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);