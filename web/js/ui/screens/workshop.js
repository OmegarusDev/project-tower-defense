/**
 * Forge / tech / editor screen renderers — pure HTML of explicit state.
 */
import { WAVE_PACKS } from "../../data/waveScripts.js";
import { makeSlot, MAX_ROSTER_SLOTS } from "../../data/parts.js";
import { TECH_TREES, BASE_START_CASH, BASE_START_LIVES } from "../../data/techTree.js";
import { xClose } from "../xClose.js";
import {
  esc,
  forgePartGridHtml,
  forgePreviewCard,
  forgeUnlockCard,
  techTreeHtml,
  techOverlayHtml,
  techBackAct,
} from "./helpers.js";

export function renderForge(state) {
  const meta = state.meta;
  const maxSlots = state.maxSlots || MAX_ROSTER_SLOTS;
  const slotCount = meta.slotCount | 0;
  const canUnlock = slotCount < maxSlots;
  const total = slotCount + (canUnlock ? 1 : 0);
  const idx = state.forgeSlot ?? 0;
  const isPanel = canUnlock && idx === slotCount;
  const slot = isPanel ? null : meta.roster?.[idx] || makeSlot();
  const backAct =
    state.forgeReturn === "hub"
      ? "hub"
      : state.forgeReturn === "campaign"
        ? "campaign"
        : state.forgeReturn === "prep"
          ? `prep:${state.prepLevelId || 1}`
          : "main";
return `
    <div class="screen meta-shell meta-screen forge-screen meta-enter">
      <header class="meta-hero">
        <div class="meta-hero-row">
          <button class="btn secondary part-chip ${meta.dev?.active ? "active" : ""}" data-act="dev-toggle" aria-label="Dev Mode">Dev</button>
          <div>
            <h1>Forge</h1>
          </div>
          ${xClose(backAct)}
        </div>
        <div class="title-stats tech-stats">
          <span><i>Parts</i>${meta.forge}</span>
          <span><i>Æ</i>${meta.aether}</span>
          <span><i>Cap</i>L${meta.levelCap}</span>
          <span><i>Slots</i>${meta.slotCount}</span>
        </div>
        <div class="status-toast ${state.status ? "" : "empty"}" id="status">${state.status || ""}</div>
      </header>
      <div class="meta-scroll">
        ${isPanel
          ? forgeUnlockCard(state, total)
          : `
            <div class="forge-carousel" role="list" aria-label="Tower slots">
              <button type="button" class="forge-arrow prev" data-act="forge-slot-prev" aria-label="Previous slot">◀</button>
              <div class="forge-preview-wrap">
                ${forgePreviewCard(state, total)}
              </div>
              <button type="button" class="forge-arrow next" data-act="forge-slot-next" aria-label="Next slot">▶</button>
            </div>
          `}
        ${isPanel ? "" : `<div class="cols forge-part-grid">${forgePartGridHtml(state, slot)}</div>`}
        <p class="end-note">Parts unlock pieces — prices climb with each buy. Slots open with Æ.</p>
      </div>
      <footer class="meta-dock">
        <button class="btn" data-act="upgrade">Tech Tree</button>
      </footer>
    </div>`;
}

export function renderTech(state) {
  const meta = state.meta;
  const cash = BASE_START_CASH + (meta.startCashBonus | 0);
  const giftLine = `Best wave ${meta.bestWave || 0} — Parts come from runs, pieces from the Forge`;
  const tabs = TECH_TREES.map((tree) => {
    const active = state.techTreeTab === tree.id ? "active" : "";
    return `<button type="button" class="ttree-tab ${active}" data-act="tech-tab:${tree.id}">${tree.name}</button>`;
  }).join("");
  const tree = TECH_TREES.find((t) => t.id === state.techTreeTab) || TECH_TREES[0];
  const overlay = state.techSelectedId ? techOverlayHtml(state, state.techSelectedId) : "";
  return `
    <div class="screen tech-screen meta-shell meta-screen meta-enter">
      <header class="meta-hero tech-hero">
        <div class="tech-hero-row">
          <div>
            <h1>Tech Tree</h1>
          </div>
          ${xClose(techBackAct(state))}
        </div>
        <div class="title-stats tech-stats" aria-label="Currencies">
          <span><i>Æ</i>${meta.aether}</span>
          <span><i>Parts</i>${meta.forge}</span>
          <span><i>Lvl Cap</i>L${meta.levelCap}</span>
          <span><i>Slots</i>${meta.slotCount}</span>
          <span><i>HP</i>${meta.startLives || BASE_START_LIVES}</span>
          <span><i>Coin</i>${cash}</span>
        </div>
        <div class="status-toast ${state.status ? "" : "empty"}" id="status">${state.status || ""}</div>
        <div class="ttree-tabs" role="tablist">${tabs}</div>
      </header>
      <div class="tech-body" id="techBody">
        ${techTreeHtml(state, tree)}
        <p class="tech-gift">${giftLine}</p>
      </div>
      <footer class="meta-dock">
        <button class="btn" data-act="forge">Forge</button>
      </footer>
      ${overlay}
    </div>`;
}

export function renderEditor(state) {
  const ed = state.editor;
  const saved = state.editorLevels || [];
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
  return `
    <div class="screen scroll meta-screen meta-enter">
      <div class="status-toast ${state.status ? "" : "empty"}" id="status">${state.status || ""}</div>
      <header class="meta-hero">
        <div class="meta-hero-row">
          <div>
            <h1>Editor</h1>
          </div>
          ${xClose("main")}
        </div>
      </header>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <label>Cols <input id="edCols" type="number" min="6" max="12" value="${ed.cols}" style="width:3.5em"/></label>
        <label>Rows <input id="edRows" type="number" min="6" max="16" value="${ed.rows}" style="width:3.5em"/></label>
        <label>Waves <input id="edWaves" type="number" min="3" max="12" value="${ed.wavesToWin}" style="width:3.5em"/></label>
        <label>Start Coin <input id="edCoin" type="number" min="20" max="300" step="5" value="${ed.coinGrant}" style="width:4.5em"/></label>
        <label>Script <select id="edScript">${scripts}</select></label>
      </div>
      <input id="edName" type="text" value="${esc(ed.name)}" placeholder="Level name" style="width:100%;margin-bottom:8px"/>
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
          (lv, i) => `<div class="ed-slot" style="display:flex;align-items:center;gap:6px;margin-top:4px">
            <button class="btn secondary ed-slot-load" data-act="ed-load:${i}" style="flex:1">${esc(lv.name)} · ${lv.wavesToWin}w · ${lv.coinGrant}₡</button>
            <button class="btn danger ed-slot-del" data-act="ed-delete:${i}" title="Delete" aria-label="Delete level ${i + 1}">✕</button>
          </div>`
        )
        .join("")}
    </div>`;
}
