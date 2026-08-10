/**
 * Menu / meta screen HTML — extracted from App for a thinner orchestrator.
 * Each function mutates `app.ui` and returns after bind hooks are set by caller.
 */

import { CAMPAIGN_LEVELS, isLevelUnlocked, getCampaignLevel } from "../data/campaign.js";
import { WAVE_SCRIPTS } from "../data/waveScripts.js";
import { VIEW25 } from "../view/view25.js";
import { LevelEditor, loadEditorLevels } from "./levelEditor.js";
import { buildAttackPlan } from "../sim/attackPlan.js";
import { PARTS, partLabel, doctrineLabel } from "../data/parts.js";
import { saveMeta } from "../saveStore.js";

export function renderMain(app) {
  app.screen = "main";
  app.ui.innerHTML = `
    <div class="screen title-screen">
      <header class="title-hero">
        <p class="title-mark">Project</p>
        <h1 class="title-brand">
          <span class="title-brand-line">Tower</span>
          <span class="title-brand-line accent">Defense</span>
        </h1>
        <p class="title-tag">Compose towers. Shape the path. Survive.</p>
      </header>
      <nav class="title-actions" aria-label="Main menu">
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
        <p class="title-credit">Vanilla web · zero asset packs</p>
      </footer>
    </div>`;
}

export function renderSettings(app) {
  app.screen = "settings";
  const pitch = app.meta.settings?.cameraPitch ?? VIEW25.pitchDeg;
  const vol = Math.round((app.meta.settings?.sfxVolume ?? 0.35) * 100);
  app.ui.innerHTML = `
    <div class="screen scroll">
      <div class="screen-header">
        <h1>Settings</h1>
        <button class="btn secondary" data-act="main" style="padding:10px 12px;font-size:0.85rem">Back</button>
      </div>
      <label class="btn secondary"><input type="checkbox" id="cb" ${
        app.meta.settings?.colorblind ? "checked" : ""
      }/> Colorblind palette</label>
      <label class="btn secondary"><input type="checkbox" id="particles" ${
        app.meta.settings?.particles !== false ? "checked" : ""
      }/> Particles & juice</label>
      <label class="btn secondary"><input type="checkbox" id="music" ${
        app.meta.settings?.music !== false ? "checked" : ""
      }/> Pressure kick bed</label>
      <div class="end-card" style="margin-top:8px">
        <h3>SFX volume · ${vol}%</h3>
        <input id="sfxVol" type="range" min="0" max="100" step="1" value="${vol}" style="width:100%;margin-top:8px" />
      </div>
      <div class="end-card" style="margin-top:8px">
        <h3>Camera angle</h3>
        <p class="end-note">Pitch ${Math.round(pitch)}° — steeper = more foreshortening.</p>
        <input id="pitch" type="range" min="8" max="58" step="1" value="${pitch}" style="width:100%;margin-top:8px" />
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
    const h = app.ui.querySelector(".end-card h3");
    if (h && h.textContent.startsWith("SFX")) h.textContent = `SFX volume · ${e.target.value}%`;
    save();
  });
  app.ui.querySelector("#pitch")?.addEventListener("input", (e) => {
    const v = +e.target.value;
    app.applyPitch(v);
    const note = app.ui.querySelector(".end-note");
    if (note) note.textContent = `Pitch ${Math.round(v)}° — steeper = more foreshortening.`;
  });
}

export function renderCampaign(app) {
  app.screen = "campaign";
  const cleared = app.meta.campaign?.cleared || [];
  const cards = CAMPAIGN_LEVELS.map((lv) => {
    const open = isLevelUnlocked(lv.id, cleared);
    const done = cleared.includes(lv.id);
    return `<button class="btn ${done ? "equipped" : ""} ${open ? "" : "cant-afford"}" data-act="prep:${lv.id}" ${
      open ? "" : "disabled"
    } title="${lv.blurb}">
      <strong>${lv.id}. ${lv.name}</strong>
      <span style="display:block;font-size:0.75rem;opacity:0.8">${lv.wavesToWin} waves · ${lv.cols}×${lv.rows}${
        done ? " · cleared" : ""
      }</span>
    </button>`;
  }).join("");
  app.ui.innerHTML = `
    <div class="screen scroll">
      <div class="screen-header">
        <h1>Campaign</h1>
        <button class="btn secondary" data-act="main" style="padding:10px 12px;font-size:0.85rem">Back</button>
      </div>
      <p class="currency-line">First campaign · 5 levels · Prep before each fight</p>
      <div class="cols" style="grid-template-columns:1fr">${cards}</div>
      <button class="btn" data-act="forge-from-campaign" style="margin-top:10px">Forge</button>
    </div>`;
}

export function renderPrep(app, levelId) {
  const lv = getCampaignLevel(levelId);
  if (!lv) return false;
  app.screen = "prep";
  app.prepLevelId = levelId;
  const slot = app.meta.roster?.[0];
  let planLine = "Complete a triad in Forge.";
  if (slot?.complete) {
    const plan = buildAttackPlan(slot.base, slot.barrel, slot.payload, 1, {});
    planLine = `${partLabel(slot.base)} (${doctrineLabel(PARTS.bases[slot.base]?.doctrine)}) · ${
      plan.damageType
    } · range ${plan.rangeCells.toFixed(1)} · ${(1 / plan.fireInterval).toFixed(2)}/s`;
  }
  app.ui.innerHTML = `
    <div class="screen scroll">
      <div class="screen-header">
        <h1>Prep · ${lv.name}</h1>
        <button class="btn secondary" data-act="campaign" style="padding:10px 12px;font-size:0.85rem">Back</button>
      </div>
      <p class="end-note">${lv.blurb}</p>
      <div class="end-card">
        <h3>Briefing</h3>
        <p>${lv.wavesToWin} waves · start ${lv.coinGrant} Coin · ${lv.preWalls.length} pre-walls</p>
        <p style="margin-top:6px;font-size:0.8rem;color:var(--muted)">Loadout preview: ${planLine}</p>
      </div>
      <button class="btn title-cta" data-act="start-level:${lv.id}">Start Level</button>
      <button class="btn" data-act="forge-from-campaign">Forge</button>
      <button class="btn" data-act="upgrade">Tech Tree</button>
    </div>`;
  return true;
}

export function renderEditor(app) {
  if (!app.editor) app.editor = new LevelEditor();
  const ed = app.editor;
  app.screen = "editor";
  const saved = loadEditorLevels();
  const scripts = Object.keys(WAVE_SCRIPTS)
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
    <div class="screen scroll">
      <div class="screen-header">
        <h1>Level Editor</h1>
        <button class="btn secondary" data-act="main" style="padding:10px 12px;font-size:0.85rem">Back</button>
      </div>
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
