/**
 * Menu / meta screen HTML — extracted from App for a thinner orchestrator.
 * Each function mutates `app.ui` and returns after bind hooks are set by caller.
 */

import { CAMPAIGN_LEVELS, isLevelUnlocked, getCampaignLevel } from "../data/campaign.js";
import { WAVE_PACKS } from "../data/waveScripts.js";
import { VIEW25 } from "../view/view25.js";
import { LevelEditor, loadEditorLevels } from "./levelEditor.js";
import { buildAttackPlan } from "../sim/attackPlan.js";
import { PARTS, partLabel, doctrineLabel } from "../data/parts.js";
import { saveMeta } from "../saveStore.js";
import {
  threatTagsForLevel,
  rosterPeekHtml,
  prepSlotButtonsHtml,
  endlessThemeBlurb,
  paintLevelThumb,
} from "./metaUi.js";

export function renderMain(app) {
  app.screen = "main";
  app.ui.innerHTML = `
    <div class="screen title-screen meta-enter">
      <div class="frame-bolts" aria-hidden="true"></div>
      <header class="title-hero">
        <div class="title-crest" aria-hidden="true"><span></span><i></i><span></span></div>
        <p class="title-mark">Project</p>
        <h1 class="title-brand">
          <span class="title-brand-line">Tower</span>
          <span class="title-brand-line accent">Defense</span>
        </h1>
        <div class="title-rule" aria-hidden="true"></div>
        <p class="title-tag">Stamp the Yard. Shape the path. Hold the still.</p>
      </header>
      <nav class="title-actions plate-frame" aria-label="Main menu">
        <button class="btn title-cta" data-act="endless">Endless</button>
        <button class="btn" data-act="campaign">Campaign</button>
        <button class="btn" data-act="forge-from-main">Forge</button>
        <button class="btn" data-act="upgrade">Tech Tree</button>
        <button class="btn secondary" data-act="editor">Level Editor</button>
        <button class="btn secondary" data-act="settings">Settings</button>
      </nav>
      <footer class="title-foot">
        <div class="title-stats" aria-label="Progress">
          <span><i>Æ</i>${app.meta.aether}</span>
          <span><i>Parts</i>${app.meta.forge}</span>
          <span><i>Best</i>W${app.meta.bestWave}</span>
        </div>
        <p class="title-credit"><span class="credit-gem" aria-hidden="true"></span>Crown Bastion · Slag Host · zero asset packs<span class="credit-gem" aria-hidden="true"></span></p>
      </footer>
    </div>`;
}

export function renderSettings(app) {
  app.screen = "settings";
  const pitch = app.meta.settings?.cameraPitch ?? VIEW25.pitchDeg;
  const vol = Math.round((app.meta.settings?.sfxVolume ?? 0.35) * 100);
  app.ui.innerHTML = `
    <div class="screen scroll meta-screen meta-enter">
      <header class="meta-hero">
        <div class="meta-hero-row">
          <div>
            <p class="title-mark">Console</p>
            <h1>Settings</h1>
          </div>
          <button class="btn secondary tech-back" data-act="main">Back</button>
        </div>
      </header>
      <div class="settings-plate plate">
        <label class="set-row">
          <span>Colorblind palette</span>
          <input type="checkbox" id="cb" ${app.meta.settings?.colorblind ? "checked" : ""}/>
        </label>
        <label class="set-row">
          <span>Particles & juice</span>
          <input type="checkbox" id="particles" ${app.meta.settings?.particles !== false ? "checked" : ""}/>
        </label>
        <label class="set-row">
          <span>Pressure kick bed</span>
          <input type="checkbox" id="music" ${app.meta.settings?.music !== false ? "checked" : ""}/>
        </label>
        <div class="set-block">
          <div class="set-head">
            <h3>SFX volume</h3>
            <span id="sfxVolLabel">${vol}%</span>
          </div>
          <input id="sfxVol" type="range" min="0" max="100" step="1" value="${vol}" />
        </div>
        <div class="set-block">
          <div class="set-head">
            <h3>Camera angle</h3>
            <span id="pitchLabel">${Math.round(pitch)}°</span>
          </div>
          <p class="end-note">Steeper = more foreshortening.</p>
          <input id="pitch" type="range" min="8" max="58" step="1" value="${pitch}" />
        </div>
      </div>
    </div>`;
}

export function wireSettings(app) {
  const save = () => saveMeta(app.meta);
  app.ui.querySelector("#cb")?.addEventListener("change", (e) => {
    app.meta.settings = app.meta.settings || {};
    app.meta.settings.colorblind = e.target.checked;
    app.palette.setColorblind(e.target.checked);
    save();
  });
  app.ui.querySelector("#particles")?.addEventListener("change", (e) => {
    app.meta.settings = app.meta.settings || {};
    app.meta.settings.particles = e.target.checked;
    save();
  });
  app.ui.querySelector("#music")?.addEventListener("change", (e) => {
    app.meta.settings = app.meta.settings || {};
    app.meta.settings.music = e.target.checked;
    app.score.setEnabled(e.target.checked);
    save();
  });
  app.ui.querySelector("#sfxVol")?.addEventListener("input", (e) => {
    const v = (+e.target.value || 0) / 100;
    app.meta.settings = app.meta.settings || {};
    app.meta.settings.sfxVolume = v;
    app.synth.setVolume(v);
    const lab = app.ui.querySelector("#sfxVolLabel");
    if (lab) lab.textContent = `${e.target.value}%`;
    save();
  });
  app.ui.querySelector("#pitch")?.addEventListener("input", (e) => {
    const v = +e.target.value;
    app.applyPitch(v);
    const lab = app.ui.querySelector("#pitchLabel");
    if (lab) lab.textContent = `${Math.round(v)}°`;
  });
}

export function renderCampaign(app) {
  app.screen = "campaign";
  const cleared = app.meta.campaign?.cleared || [];
  const cards = CAMPAIGN_LEVELS.map((lv) => {
    const open = isLevelUnlocked(lv.id, cleared);
    const done = cleared.includes(lv.id);
    const tags = threatTagsForLevel(lv, 4)
      .map((t) => `<span class="threat-tag" data-kind="${t.id}">${t.label}</span>`)
      .join("");
    return `<button type="button" class="level-card plate ${done ? "cleared" : ""} ${
      open ? "" : "locked"
    }" data-act="prep:${lv.id}" ${open ? "" : "disabled"}>
      <canvas class="level-thumb" data-level="${lv.id}" width="72" height="72" aria-hidden="true"></canvas>
      <div class="level-card-body">
        <div class="level-card-top">
          <strong>${lv.id}. ${lv.name}</strong>
          ${done ? `<span class="level-cleared">Cleared</span>` : ""}
        </div>
        <p class="level-meta">${lv.wavesToWin} waves · ${lv.cols}×${lv.rows} · ${lv.preWalls.length} walls</p>
        <div class="threat-row">${tags}</div>
      </div>
    </button>`;
  }).join("");
  app.ui.innerHTML = `
    <div class="screen scroll meta-screen meta-enter">
      <header class="meta-hero">
        <div class="meta-hero-row">
          <div>
            <p class="title-mark">Operations</p>
            <h1>Campaign</h1>
          </div>
          <button class="btn secondary tech-back" data-act="main">Back</button>
        </div>
        <p class="meta-blurb">Vein Claim ops · prep the Yard before each seal</p>
        <div class="title-stats tech-stats">
          <span><i>Æ</i>${app.meta.aether}</span>
          <span><i>Parts</i>${app.meta.forge}</span>
          <span><i>Clear</i>${cleared.length}/${CAMPAIGN_LEVELS.length}</span>
        </div>
      </header>
      <div class="level-grid">${cards}</div>
      <button class="btn" data-act="forge-from-campaign">Forge</button>
    </div>`;
}

export function paintCampaignThumbs(app) {
  app.ui.querySelectorAll("canvas.level-thumb").forEach((c) => {
    const id = +c.getAttribute("data-level");
    const lv = getCampaignLevel(id);
    paintLevelThumb(c, lv, app.palette);
  });
}

export function renderPrep(app, levelId) {
  const lv = getCampaignLevel(levelId);
  if (!lv) return false;
  app.screen = "prep";
  app.prepLevelId = levelId;
  if (app.prepSlot == null) app.prepSlot = 0;
  const slot = app.meta.roster?.[app.prepSlot];
  let planLine = "Complete a triad in Forge.";
  if (slot?.complete) {
    const plan = buildAttackPlan(slot.base, slot.barrel, slot.payload, 1, {});
    planLine = `${partLabel(slot.base)} (${doctrineLabel(PARTS.bases[slot.base]?.doctrine)}) · ${
      plan.damageType
    } · range ${plan.rangeCells.toFixed(1)} · ${(1 / plan.fireInterval).toFixed(2)}/s`;
  }
  const tags = threatTagsForLevel(lv, 6)
    .map((t) => `<span class="threat-tag" data-kind="${t.id}">${t.label}</span>`)
    .join("");
  app.ui.innerHTML = `
    <div class="screen scroll meta-screen meta-enter">
      <header class="meta-hero">
        <div class="meta-hero-row">
          <div>
            <p class="title-mark">Briefing</p>
            <h1>${lv.name}</h1>
          </div>
          <button class="btn secondary tech-back" data-act="campaign">Back</button>
        </div>
        <p class="meta-blurb">${lv.blurb}</p>
      </header>
      <div class="prep-layout">
        <canvas class="prep-thumb level-thumb" data-level="${lv.id}" width="120" height="120" aria-hidden="true"></canvas>
        <div class="end-card prep-card plate">
          <h3>Mission</h3>
          <p>${lv.wavesToWin} waves · start ${lv.coinGrant} Coin · ${lv.preWalls.length} pre-walls</p>
          <div class="threat-row" style="margin-top:10px;justify-content:flex-start">${tags}</div>
        </div>
      </div>
      <div class="end-card prep-card plate">
        <h3>Loadout</h3>
        ${rosterPeekHtml(app.meta)}
        <p class="end-note" style="margin-top:8px;text-align:left">Active · ${planLine}</p>
        <p class="end-note" style="margin-top:4px;text-align:left">Tap a slot to highlight for deploy priority.</p>
        ${prepSlotButtonsHtml(app.meta, app.prepSlot)}
      </div>
      <button class="btn title-cta" data-act="start-level:${lv.id}">Start Level</button>
      <div class="row" style="gap:8px">
        <button class="btn" data-act="forge-from-prep">Forge</button>
        <button class="btn" data-act="upgrade-from-prep">Tech Tree</button>
      </div>
    </div>`;
  return true;
}

export function renderEditor(app) {
  if (!app.editor) app.editor = new LevelEditor();
  const ed = app.editor;
  app.screen = "editor";
  const saved = loadEditorLevels();
  const scripts = Object.keys(WAVE_PACKS)
    .map((id) => `<option value="${id}" ${ed.waveScript === id ? "selected" : ""}>${id}</option>`)
    .join("");
  const cells = [];
  for (let y = 0; y < ed.rows; y++) {
    for (let x = 0; x < ed.cols; x++) {
      const wall = ed.walls.some((w) => w.x === x && w.y === y);
      const spawn = x === ed.grid.spawn.x && y === ed.grid.spawn.y;
      const exit = x === ed.grid.exit.x && y === ed.grid.exit.y;
      let cls = "ed-cell";
      if (wall) cls += " wall";
      if (spawn) cls += " spawn";
      if (exit) cls += " exit";
      cells.push(`<button type="button" class="${cls}" data-act="ed-cell:${x}:${y}"></button>`);
    }
  }
  app.ui.innerHTML = `
    <div class="screen scroll meta-screen meta-enter">
      <header class="meta-hero">
        <div class="meta-hero-row">
          <div>
            <p class="title-mark">Yard</p>
            <h1>Level Editor</h1>
          </div>
          <button class="btn secondary tech-back" data-act="main">Back</button>
        </div>
      </header>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <label>Cols <input id="edCols" type="number" min="6" max="12" value="${ed.cols}" style="width:3.5em"/></label>
        <label>Rows <input id="edRows" type="number" min="6" max="16" value="${ed.rows}" style="width:3.5em"/></label>
        <label>Waves <input id="edWaves" type="number" min="3" max="12" value="${ed.wavesToWin}" style="width:3.5em"/></label>
        <label>Script <select id="edScript">${scripts}</select></label>
      </div>
      <input id="edName" type="text" value="${ed.name}" placeholder="Level name" style="width:100%;margin-bottom:8px"/>
      <div class="ed-grid" style="grid-template-columns:repeat(${ed.cols},minmax(0,1fr))">${cells.join("")}</div>
      <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn" data-act="ed-apply-size">Apply size</button>
        <button class="btn" data-act="ed-random">Random walls</button>
        <button class="btn" data-act="ed-save">Save local</button>
        <button class="btn title-cta" data-act="ed-playtest">Playtest</button>
      </div>
      <p class="end-note" style="margin-top:8px">${saved.length} saved custom level(s)</p>
      ${saved
        .slice(0, 6)
        .map(
          (lv, i) =>
            `<button class="btn secondary" data-act="ed-load:${i}" style="margin-top:4px">${lv.name}</button>`
        )
        .join("")}
    </div>`;
}

export function forgePlanSummary(slot) {
  if (!slot?.complete) return "Base = brain · Barrel = delivery · Payload = element";
  const plan = buildAttackPlan(slot.base, slot.barrel, slot.payload, 1, {});
  return `${partLabel(slot.base)} · ${doctrineLabel(PARTS.bases[slot.base]?.doctrine)}<br/>${partLabel(
    slot.barrel
  )} + ${partLabel(slot.payload)} · ${slot.placeCost} Coin<br/><span style="color:#9aacbe">${
    plan.damageType
  } · r${plan.rangeCells.toFixed(1)} · dmg ${plan.damage.toFixed(0)}${
    plan.chainJumps ? ` · chain ${plan.chainJumps}` : ""
  }${plan.pulseRadius ? ` · pulse ${plan.pulseRadius.toFixed(1)}` : ""}</span>`;
}

export { endlessThemeBlurb };
