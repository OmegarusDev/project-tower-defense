/**
 * Menu / campaign / hub screen renderers — pure HTML of explicit state.
 */
import { CAMPAIGN_LEVELS, isLevelUnlocked, getCampaignLevel } from "../../data/campaign.js";
import { VIEW25 } from "../../view/camera.js";
import { buildAttackPlan } from "../../sim/attackPlan.js";
import { PARTS, partLabel, doctrineLabel } from "../../data/parts.js";
import { threatTagsForLevel, rosterPeekHtml, endlessThemeBlurb } from "../metaUi.js";
import { xClose } from "../xClose.js";
import { VERSION, VERSION_NAME } from "./helpers.js";
import { RULES } from "../../data/rules.js";

export function renderSplash() {
  return `
    <div class="screen splash-screen meta-enter">
      <div class="splash-top">
        <div class="splash-crest" aria-hidden="true"><span></span><i></i><span></span></div>
        <h1 class="splash-title">Tower Defense</h1>
        <div class="splash-rule"></div>
        <p class="splash-tag">Shape the path. Hold the Yard.</p>
      </div>
      <button class="btn splash-cta" data-act="splash-start">Tap to Begin</button>
      <p class="splash-foot">Bastion vs the Cinder · v${VERSION} ${VERSION_NAME}</p>
    </div>`;
}

export function renderMain(state) {
  const meta = state.meta;
  return `
    <div class="screen title-screen meta-enter">
      <div class="status-toast ${state.status ? "" : "empty"}" id="status">${state.status || ""}</div>
      <header class="title-hero">
        <div class="title-crest" aria-hidden="true"><span></span><i></i><span></span></div>
        <p class="title-mark">Project</p>
        <h1 class="title-brand">
          <span class="title-brand-line">Tower</span>
          <span class="title-brand-line accent">Defense</span>
        </h1>
        <div class="title-rule" aria-hidden="true"></div>
        <p class="title-tag">Shape the path. Hold the Yard.</p>
      </header>
      <nav class="title-actions plate-frame" aria-label="Main menu">
        <button class="btn title-cta" data-act="endless">Endless</button>
        <button class="btn" data-act="campaign">Campaign</button>
        <button class="btn" data-act="forge-from-main">Forge</button>
        <button class="btn" data-act="upgrade">Tech Tree</button>
        <button class="btn" data-act="editor">Editor</button>
        <button class="btn" data-act="settings">Settings</button>
      </nav>
      <footer class="title-foot">
        <div class="title-stats" aria-label="Progress">
          <span><i>Æ</i>${meta.aether}</span>
          <span><i>Parts</i>${meta.forge}</span>
          <span><i>Best</i>W${meta.bestWave}</span>
        </div>
        <p class="title-credit">Bastion vs the Cinder · v${VERSION} ${VERSION_NAME}</p>
      </footer>
    </div>`;
}

export function renderSettings(state) {
  const meta = state.meta;
  const pitch = meta.settings?.cameraPitch ?? VIEW25.pitchDeg;
  const vol = Math.round((meta.settings?.sfxVolume ?? 0.35) * 100);
  const musicVol = Math.round((meta.settings?.musicVolume ?? 0.4) * 100);
  return `
    <div class="screen scroll meta-screen meta-enter">
      <div class="status-toast ${state.status ? "" : "empty"}" id="status">${state.status || ""}</div>
      <header class="meta-hero">
        <div class="meta-hero-row">
          <div>
            <h1>Settings</h1>
          </div>
          ${xClose("main")}
        </div>
      </header>
      <div class="settings-plate plate">
        <label class="set-row">
          <span>Colorblind palette</span>
          <input type="checkbox" id="cb" ${meta.settings?.colorblind ? "checked" : ""}/>
        </label>
        <label class="set-row">
          <span>Particles</span>
          <input type="checkbox" id="particles" ${meta.settings?.particles !== false ? "checked" : ""}/>
        </label>
        <label class="set-row">
          <span>Ambience</span>
          <input type="checkbox" id="music" ${meta.settings?.music !== false ? "checked" : ""}/>
        </label>
        <div class="set-block">
          <div class="set-head">
            <h3>Music</h3>
            <span id="musicVolLabel">${musicVol}%</span>
          </div>
          <input id="musicVol" type="range" min="0" max="100" step="1" value="${musicVol}" />
        </div>
        <div class="set-block">
          <div class="set-head">
            <h3>SFX</h3>
            <span id="sfxVolLabel">${vol}%</span>
          </div>
          <input id="sfxVol" type="range" min="0" max="100" step="1" value="${vol}" />
        </div>
        <div class="set-block">
          <div class="set-head">
            <h3>Camera</h3>
            <span id="pitchLabel">${Math.round(pitch)}°</span>
          </div>
          <input id="pitch" type="range" min="8" max="58" step="1" value="${pitch}" />
        </div>
<div class="set-block">
            <h3>Tech</h3>
            <p class="end-note" style="margin:0">Ranks are permanent. Choose with care.</p>
          </div>
        <div class="set-block" style="border-top:1px solid rgba(200,130,60,0.25);padding-top:10px">
          <h3>Save Data</h3>
          <button class="btn danger" data-act="reset-meta" style="width:100%">Reset Save</button>
        </div>
      </div>
    </div>`;
}

export function renderCampaign(state) {
  const meta = state.meta;
  const cleared = meta.campaign?.cleared || [];
  const cardHtml = (lv) => {
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
        <p class="level-blurb">${lv.blurb}</p>
        <div class="threat-row">${tags}</div>
      </div>
    </button>`;
  };
  // Group cards under act headers (Outskirts / Foundry / Deep Vein)
  const ACT_ORDER = ["Outskirts", "Foundry", "Deep Vein"];
  const acts = ACT_ORDER.map((act) => {
    const lvs = CAMPAIGN_LEVELS.filter((lv) => (lv.act || "Outskirts") === act);
    if (!lvs.length) return "";
    return `<h2 class="campaign-act">${act}</h2><div class="level-grid">${lvs.map(cardHtml).join("")}</div>`;
  }).join("");
  return `
    <div class="screen scroll meta-screen meta-enter">
      <div class="status-toast ${state.status ? "" : "empty"}" id="status">${state.status || ""}</div>
      <header class="meta-hero">
        <div class="meta-hero-row">
          <div>
            <h1>Campaign</h1>
          </div>
          ${xClose("main")}
        </div>
        <p class="meta-blurb">Seal each Yard before the Cinder walks it.</p>
        <div class="title-stats tech-stats">
          <span><i>Æ</i>${meta.aether}</span>
          <span><i>Parts</i>${meta.forge}</span>
          <span><i>Clear</i>${cleared.length}/${CAMPAIGN_LEVELS.length}</span>
        </div>
      </header>
      ${acts}
      <div class="screen-foot">
        <button class="btn" data-act="forge-from-campaign">Forge</button>
        <button class="btn" data-act="upgrade-from-campaign">Tech Tree</button>
      </div>
    </div>`;
}

export function renderPrep(state) {
  const lv = getCampaignLevel(state.prepLevelId);
  if (!lv) return "";
  const meta = state.meta;
  const slot = meta.roster?.[state.prepSlot || 0];
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
  const sealed = (meta.campaign?.cleared || []).includes(lv.id);
  const sealLine = sealed
    ? ""
    : `<p class="prep-seal">First seal · +${RULES.FIRST_CLEAR_AETHER} Æ · +${RULES.FIRST_CLEAR_FORGE} Parts</p>`;
  return `
    <div class="screen scroll meta-screen meta-enter">
      <div class="status-toast ${state.status ? "" : "empty"}" id="status">${state.status || ""}</div>
      <header class="meta-hero">
        <div class="meta-hero-row">
          <div>
            <h1>${lv.name}</h1>
          </div>
          ${xClose("campaign")}
        </div>
        <p class="meta-blurb">${lv.blurb}</p>
      </header>
      <div class="prep-layout">
        <canvas class="prep-thumb level-thumb" data-level="${lv.id}" width="120" height="120" aria-hidden="true"></canvas>
        <div class="end-card prep-card plate">
          <h3>Mission</h3>
          <p>${lv.wavesToWin} waves · ${lv.coinGrant} Coin · ${lv.preWalls.length} walls</p>
          ${sealLine}
          <div class="threat-row" style="margin-top:10px;justify-content:flex-start">${tags}</div>
        </div>
      </div>
      <div class="end-card prep-card plate">
        <h3>Loadout</h3>
        ${rosterPeekHtml(meta)}
        <p class="end-note" style="margin-top:8px;text-align:left">${planLine}</p>
        <div class="prep-slots row">
          <button type="button" class="btn part-chip" data-act="prep-slot-prev" aria-label="Previous slot">◀</button>
          <button type="button" class="btn part-chip equipped">Slot ${(state.prepSlot || 0) + 1}</button>
          <button type="button" class="btn part-chip" data-act="prep-slot-next" aria-label="Next slot">▶</button>
        </div>
      </div>
      <div class="screen-foot">
        <button class="btn title-cta" data-act="start-level:${lv.id}">Start Level</button>
        <button class="btn" data-act="forge-from-prep">Forge</button>
        <button class="btn" data-act="upgrade-from-prep">Tech Tree</button>
      </div>
    </div>`;
}

export function renderHub(state) {
  const meta = state.meta;
  const blob = state.checkpoint;
  const canContinue = blob !== null;
  const best = meta.bestWave | 0;
  const themes = endlessThemeBlurb();
  return `
    <div class="screen scroll meta-screen hub-screen meta-enter">
      <div class="status-toast ${state.status ? "" : "empty"}" id="status">${state.status || ""}</div>
      <header class="meta-hero">
        <div class="meta-hero-row">
          <div>
            <h1>Endless</h1>
          </div>
          ${xClose("main")}
        </div>
        <p class="meta-blurb">How far can the Bastion hold the Vein?</p>
      </header>
      <div class="hub-console">
        <div class="hub-card plate">
          <h3>Best wave</h3>
          <div class="hub-wave">${best || "—"}</div>
          <p class="end-note" style="text-align:left;margin-top:6px">${themes}</p>
          <div class="hub-stat-row title-stats">
            <span><i>Æ</i>${meta.aether}</span>
            <span><i>Parts</i>${meta.forge}</span>
          </div>
        </div>
        <div class="hub-card plate">
          <h3>${canContinue ? "Checkpoint" : "Ready"}</h3>
          <p style="text-align:left;color:var(--text);margin:0">
            ${
              canContinue
                ? `Wave <strong>${blob.wave}</strong> · seed ${blob.runSeed >>> 0}`
                : "No checkpoint. Start a run when your Forge is set."
            }
          </p>
        </div>
        <div class="screen-foot">
          <button class="btn title-cta" data-act="newrun">New Run</button>
          <button class="btn hub-continue" data-act="continue" ${canContinue ? "" : "disabled"}>Continue</button>
          <button class="btn" data-act="forge-from-hub">Forge</button>
          <button class="btn" data-act="upgrade-from-hub">Tech Tree</button>
        </div>
      </div>
    </div>`;
}
