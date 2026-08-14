/**
 * Game chrome — the HUD as pure renderers + transcribed sync mutations,
 * mirroring gameChrome.js / pauseSettings.js EXACTLY. chromeHtml + the
 * sync helpers take a plain state; the chrome parity gate compares the
 * full mounted+synced DOM byte-identically against the oracle.
 */
import {
  makeSlot,
  PARTS,
  ownsPart,
  partLabel,
  doctrineLabel,
  XP_TO_POINT,
  MAX_ROSTER_SLOTS,
} from "../../data/parts.js";
import { forgePlanSummary, rosterSlotButtonsHtml } from "./screens.js";
import { partIconHtml } from "../partIcons.js";

/** The chrome shell (renderGameChrome's template) — pure over state. */
export function chromeHtml(state) {
  const buildBtns = rosterSlotButtonsHtml(state, "game");
  const pitch = Math.round(state.meta.settings?.cameraPitch ?? state.pitchDeg ?? 24);
  const endless = !!state.sim.modeEndless;
  const composeBtn = endless
    ? `<button type="button" class="chrome-fab compose-fab plate" data-act="compose-toggle" title="Live compose" aria-label="Live compose">
        <svg class="fab-ico" viewBox="0 0 24 24" aria-hidden="true">
          <path class="fab-ico-body" d="M5 7.5h5.2l1.3-2.2h1l1.3 2.2H19v2.2h-1.6l-2.2 7.1H8.8L6.6 9.7H5V7.5z"/>
          <path class="fab-ico-accent" d="M9.2 11.2h5.6l-.7 2.4H9.9l-.7-2.4z"/>
          <circle class="fab-ico-rivet" cx="8.2" cy="8.6" r="0.7"/>
          <circle class="fab-ico-rivet" cx="15.8" cy="8.6" r="0.7"/>
        </svg>
      </button>`
    : "";
  const composeSheet = endless && state.liveCompose ? composeSheetHtml(state) : "";
  const ghostBar = state.ghost
    ? `<div class="ghost-bar plate" id="ghostBar" role="region" aria-label="Replay controls">
        <span class="ghost-label">Replay <span id="ghostCount">${state.ghost.i}/${state.ghost.total}</span></span>
        <div class="ghost-speeds" role="group" aria-label="Replay speed">
          <button type="button" class="btn secondary ${state.ghost.speed === 1 ? "equipped" : ""}" data-act="ghost-speed:1">1×</button>
          <button type="button" class="btn secondary ${state.ghost.speed === 2 ? "equipped" : ""}" data-act="ghost-speed:2">2×</button>
          <button type="button" class="btn secondary ${state.ghost.speed === 4 ? "equipped" : ""}" data-act="ghost-speed:4">4×</button>
        </div>
        <button type="button" class="btn secondary" data-act="ghost-skip">Skip</button>
      </div>`
    : "";
  return `
    <div class="game-chrome">
      ${ghostBar}
      <header class="hud-bar">
        <div class="wave-badge plate" id="waveBadge">
          <span class="wave-badge-k">Wave</span>
          <span class="wave-badge-n" id="waveNum">0</span>
          <span class="wave-badge-sub hidden" id="waveSub"></span>
          <span class="theme-chip hidden" id="themeChip"></span>
        </div>
        <div class="telemetry plate" id="statChips"></div>
        <div class="hud-ops">
          <button type="button" class="hud-pause plate" data-act="pause" title="Pause" aria-label="Pause">
            <span></span><span></span>
          </button>
        </div>
      </header>
      <aside class="left-tools" aria-label="Board tools">
        <div class="cam-rail plate" title="Camera pitch">
          <svg class="cam-glyph" viewBox="0 0 20 14" aria-hidden="true">
            <path d="M3.5 2.5h3L8 1h4l1.5 1.5h3A1.5 1.5 0 0 1 18 4v7.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 11.5V4a1.5 1.5 0 0 1 1.5-1.5z" fill="#c9a227" opacity="0.9"/>
            <circle cx="10" cy="8" r="3.2" fill="#1a2230" stroke="#8a7020" stroke-width="1"/>
            <circle cx="10" cy="8" r="1.5" fill="#e8e0d0" opacity="0.85"/>
          </svg>
          <input id="pitchLive" class="cam-pitch" type="range" min="8" max="58" step="1" value="${pitch}" orient="vertical" aria-label="Camera angle" />
        </div>
        ${composeBtn}
      </aside>
      ${composeSheet}
      <div class="status-toast ${state.status ? "" : "empty"}" id="status">${state.status}</div>
      <div class="tower-overlay hidden" id="towerOverlay">
        <div class="meta" id="towerMeta"></div>
        <div class="xp-line" id="towerXp"></div>
        <div class="tower-branch-row hidden" id="towerBranchRow" role="group" aria-label="Level branch">
          <button type="button" class="btn secondary branch-btn" data-act="level-branch:damage">Dmg</button>
          <button type="button" class="btn secondary branch-btn" data-act="level-branch:rof">ROF</button>
          <button type="button" class="btn secondary branch-btn" data-act="level-branch:range">Rng</button>
        </div>
        <div class="tower-overlay-acts">
          <button class="btn danger" data-act="sell">Sell</button>
        </div>
      </div>
      <footer class="dock">
        <div class="dock-head">
          <div class="dock-meta" id="slotline"></div>
          <button type="button" class="btn secondary undo-btn" data-act="undo" title="Undo (Z)" aria-label="Undo">Undo</button>
        </div>
        <div class="arsenal">
          <div class="arsenal-slots">${buildBtns}</div>
          <button type="button" class="wall-tile ${state.tool === "wall" ? "active" : ""}" data-act="tool:wall" id="wallBtn" title="Place wall">
            <span class="wall-tile-k">Wall</span>
            <span class="wall-tile-cost" id="wallCost">—</span>
          </button>
        </div>
        <button type="button" class="call-btn" id="callBtn" title="Tap to deploy · hold for 5×" aria-label="Deploy wave, hold for fast forward">
          <span class="call-kicker">Deploy</span>
          <span class="call-label" id="callLabel">Wave 1</span>
          <span class="call-bolts" aria-hidden="true"></span>
        </button>
      </footer>
    </div>`;
}

/** Live compose sheet (liveComposeHtml) — pure over state. */
export function composeSheetHtml(state) {
  const slot = state.meta.roster[state.slot] || makeSlot();
  const partBtn = (kind, id) => {
    const have = ownsPart(state.meta.owned, kind, id);
    if (!have) return "";
    const eq = slot[kind] === id ? " equipped" : "";
    return `<button class="btn part-btn part-chip${eq}" data-act="compose-part:${kind}:${id}"><span class="part-btn-inner">${partIconHtml(kind, id, { size: 14 })}<span class="part-btn-label">${partLabel(id)}</span></span></button>`;
  };
  return `
    <div class="compose-sheet plate" id="composeSheet">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:4px">
        <h3>Live Compose · Slot ${state.slot + 1}</h3>
        <button class="btn secondary part-chip" data-act="compose-close">Close</button>
      </div>
      <p style="margin:0 0 6px;font-size:0.72rem;color:#9aacbe">${forgePlanSummary(slot)}</p>
      <div class="compose-cols">
        <div><h4 style="margin:0 0 4px;font-size:0.65rem">Base</h4>${Object.keys(PARTS.bases).map((id) => partBtn("base", id)).join("")}</div>
        <div><h4 style="margin:0 0 4px;font-size:0.65rem">Barrel</h4>${Object.keys(PARTS.barrels).map((id) => partBtn("barrel", id)).join("")}</div>
        <div><h4 style="margin:0 0 4px;font-size:0.65rem">Payload</h4>${Object.keys(PARTS.payloads).map((id) => partBtn("payload", id)).join("")}</div>
      </div>
    </div>`;
}

/** Pause sheet (renderPauseSheet) — pure over state. */
export function pauseSheetHtml(state) {
  const sim = state.sim;
  const endless = !!sim.modeEndless;
  const wave = sim.waveIndex | 0;
  const quitLabel = endless ? "Endless Menu" : "Campaign Menu";
  const between = endless && !state.waveBusy();
  const note = state.playtestFromEditor
    ? "Editor playtest"
    : endless
      ? between
        ? `Between waves — board saved. Continue keeps towers; Call starts wave ${wave + 1}.`
        : `Mid-wave — Continue rolls back to the start of wave ${wave}.`
      : `Campaign level ${sim.campaignLevelId}`;
  return `
    <button type="button" class="pause-backdrop" data-act="resume" aria-label="Resume"></button>
    <div class="pause-card" role="dialog" aria-modal="true" aria-labelledby="pauseTitle">
      <p class="pause-mark">Paused</p>
      <h2 id="pauseTitle">Wave ${wave}</h2>
      <p class="pause-note">${note}</p>
      <div class="pause-speeds" role="group" aria-label="Speed">
        <button type="button" class="btn secondary ${state.speed === 1 ? "equipped" : ""}" data-act="speed:1">1×</button>
        <button type="button" class="btn secondary ${state.speed === 2 ? "equipped" : ""}" data-act="speed:2">2×</button>
        <button type="button" class="btn secondary ${state.speed === 3 ? "equipped" : ""}" data-act="speed:3">3×</button>
      </div>
      <p class="pause-hint">Hold Deploy for 5× · seed ${sim.runSeed >>> 0}</p>
      <button type="button" class="btn title-cta" data-act="resume">Resume</button>
      <button type="button" class="btn secondary" data-act="quit-run">${
        state.playtestFromEditor ? "Editor" : quitLabel
      }</button>
    </div>`;
}

/** Telemetry chips (refreshHud's statChips) — pure over state. */
export function statChipsHtml(state) {
  const sim = state.sim;
  const gear = `<svg class="tel-ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.4.9h3.2l.25 1.45c.45.12.87.32 1.25.58l1.3-.7 1.6 1.6-.7 1.3c.26.38.46.8.58 1.25L15.1 6.4v3.2l-1.45.25a4.6 4.6 0 0 1-.58 1.25l.7 1.3-1.6 1.6-1.3-.7a4.6 4.6 0 0 1-1.25.58L9.6 15.1H6.4l-.25-1.45a4.6 4.6 0 0 1-1.25-.58l-1.3.7-1.6-1.6.7-1.3a4.6 4.6 0 0 1-.58-1.25L.9 9.6V6.4l1.45-.25c.12-.45.32-.87.58-1.25l-.7-1.3 1.6-1.6 1.3.7c.38-.26.8-.46 1.25-.58L6.4.9zm1.6 4.3a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z"/></svg>`;
  return `
    <span class="tel tel-lives" title="HP"><i>HP</i>${sim.lives}</span>
    <span class="tel-sep"></span>
    <span class="tel tel-coin" title="Coin"><i class="tel-curr">₡</i>${sim.economy.battle}</span>
    <span class="tel-sep"></span>
    <span class="tel tel-parts" title="Parts"><i class="tel-gear">${gear}</i>${sim.economy.forge}</span>
    <span class="tel-sep"></span>
    <span class="tel tel-aether" title="Aether"><i>Æ</i>${sim.economy.aether}</span>`;
}

/** Dock slot-line meta (syncBuildDock) — pure over state. */
export function slotLineHtml(state) {
  const sim = state.sim;
  const wallCost = sim.economy.wallCost(sim.playerWallCount());
  if (state.tool === "wall") {
    return `<span class="dock-meta-k">Wall</span><span class="dock-meta-v">${wallCost} Coin</span>`;
  }
  const q = state.quote(state.slot);
  if (!q.complete) {
    return `<span class="dock-meta-k">Slot ${state.slot + 1}</span><span class="dock-meta-v warn">Set loadout in Forge</span>`;
  }
  const s = q.loadout;
  const tax = q.surcharge ? ` · +${q.surcharge} tax` : "";
  return `<span class="dock-meta-k">${partLabel(s.base)} · ${partLabel(s.barrel)} · ${partLabel(s.payload)}</span><span class="dock-meta-v">${q.total} Coin${tax}</span>`;
}

/** Call button state (refreshHud's callBtn block) — pure over state. */
export function callButtonState(state) {
  const sim = state.sim;
  const busy = state.waveBusy();
  const done = !sim.modeEndless && sim.wavesToWin > 0 && sim.waveIndex >= sim.wavesToWin;
  const ff = !!state.ffHeld;
  if (state.ghost) {
    const next = state.ghost.log?.[state.ghost.i];
    const a = next?.type || "done";
    const label = a === "call" ? "Call" : a === "place" ? "Place" : a === "sell" ? "Sell" : "Done";
    return {
      disabled: true,
      clsBusy: false,
      clsHot: false,
      title: `Replay — next action: ${label}`,
      kicker: "Replay",
      label,
    };
  }
  return {
    disabled: done,
    clsBusy: busy && !ff,
    clsHot: !!ff,
    title: done
      ? "Complete"
      : busy || ff
        ? "Hold for 5×"
        : "Tap to deploy · hold for 5×",
    kicker: ff ? "5×" : done ? "Done" : busy ? "Hold" : "Deploy",
    label: ff ? "Speed" : busy ? "Live" : done ? "Clear" : `Wave ${sim.waveIndex + 1}`,
  };
}

/** Wave badge + theme chip + status toast (refreshHud head) — DOM sync. */
export function syncWaveAndStatus(container, state) {
  const sim = state.sim;
  const waveLabel = !sim.modeEndless && sim.wavesToWin
    ? `${sim.waveIndex}/${sim.wavesToWin}`
    : `${sim.waveIndex}`;
  const waveNum = container.querySelector("#waveNum");
  if (waveNum) waveNum.textContent = waveLabel;
  const waveSub = container.querySelector("#waveSub");
  if (waveSub) {
    if (!sim.modeEndless) {
      waveSub.textContent = `Lv ${sim.campaignLevelId}`;
      waveSub.classList.remove("hidden");
    } else {
      waveSub.textContent = "";
      waveSub.classList.add("hidden");
    }
  }
  const theme = sim.waves?.lastTheme;
  const event = sim.waves?.lastEvent;
  const chip = container.querySelector("#themeChip");
  if (chip) {
    const label = event || (theme && theme !== "campaign" ? theme : "");
    if (!label) {
      chip.textContent = "";
      chip.classList.add("hidden");
    } else {
      chip.textContent = String(label).replace(/_/g, " ");
      chip.classList.remove("hidden");
    }
  }
  const st = container.querySelector("#status");
  if (st) {
    st.textContent = state.status;
    st.classList.toggle("empty", !state.status);
  }
}

/** Slot tiles + wall cost + dock meta (syncBuildDock) — DOM sync. */
export function syncBuildDock(container, state) {
  const sim = state.sim;
  for (let i = 0; i < MAX_ROSTER_SLOTS; i++) {
    const btn = container.querySelector(`[data-build-slot="${i}"]`);
    if (!btn) continue;
    const q = state.quote(i);
    const costEl = btn.querySelector(".slot-tile-cost");
    if (costEl) costEl.textContent = q.costLabel;
    btn.title = q.tip;
    btn.classList.toggle("active", state.tool === "tower" && i === state.slot);
    btn.classList.toggle("empty", !q.complete);
  }
  const wallCost = sim.economy.wallCost(sim.playerWallCount());
  const wallCostEl = container.querySelector("#wallCost");
  if (wallCostEl) wallCostEl.textContent = `${wallCost}`;
  const wallBtn = container.querySelector("#wallBtn");
  if (wallBtn) {
    wallBtn.classList.toggle("active", state.tool === "wall");
    wallBtn.title = `Wall · ${wallCost} Coin`;
  }
  const slotLine = container.querySelector("#slotline");
  if (slotLine) slotLine.innerHTML = slotLineHtml(state);
}

/** Tower/wall card sync (syncTowerOverlay) — DOM sync incl. positioning. */
export function syncTowerOverlay(container, state) {
  const overlay = container.querySelector("#towerOverlay");
  const meta = container.querySelector("#towerMeta");
  const xpEl = container.querySelector("#towerXp");
  const branchRow = container.querySelector("#towerBranchRow");
  const sim = state.sim;
  if (!overlay || !sim) return;

  const t = sim.towers.find((x) => x.id === state.selectedTowerId);
  const wall =
    state.selectedWallId >= 0 ? sim.walls.find((w) => w.id === state.selectedWallId) : null;

  if (!t && !wall) {
    overlay.classList.add("hidden");
    return;
  }

  overlay.classList.remove("hidden");
  const cell = t ? t.cell : wall.cell;
  const rate = sim.sellRefundMult > 0 ? sim.sellRefundMult : 0.5;
  if (t) {
    const cap = t.levelCap || 1;
    const need = t.xpToPoint || XP_TO_POINT;
    const picks = t.pendingPicks | 0;
    const atCap = (t.level || 1) >= cap;
    const refund = (t.paid * rate) | 0;
    if (meta) {
      const doc = doctrineLabel(PARTS.bases[t.base]?.doctrine);
      meta.textContent = `${partLabel(t.base)} · ${doc} · L${t.level}/${cap}`;
    }
    if (xpEl) {
      const pickLine = picks > 0 ? ` · ${picks} pick${picks === 1 ? "" : "s"}` : "";
      xpEl.textContent = atCap
        ? picks > 0
          ? `Max level · ${picks} pick${picks === 1 ? "" : "s"}`
          : "Max level"
        : `XP ${t.xp | 0}/${need}${pickLine}`;
    }
    if (branchRow) {
      branchRow.classList.toggle("hidden", picks <= 0);
      branchRow.querySelectorAll("button").forEach((btn) => {
        btn.disabled = picks <= 0;
      });
    }
    const sellBtn = overlay.querySelector('[data-act="sell"]');
    if (sellBtn) sellBtn.textContent = `Sell · ${refund}`;
  } else {
    const refund = (wall.paid * rate) | 0;
    if (meta) meta.textContent = "Wall";
    if (xpEl) xpEl.textContent = `Sell for ${refund} Coin`;
    if (branchRow) branchRow.classList.add("hidden");
    const sellBtn = overlay.querySelector('[data-act="sell"]');
    if (sellBtn) sellBtn.textContent = `Sell · ${refund}`;
  }

  const c = state.board.cellScreenCenter(cell.x, cell.y);
  const pad = 8;
  const w = overlay.offsetWidth || 148;
  const h = overlay.offsetHeight || 96;
  const appW = state.uiWidth;
  const appH = state.uiHeight;
  let left = c.x;
  left = Math.max(pad + w / 2, Math.min(appW - pad - w / 2, left));
  let top = c.y - state.board.cell * 0.55;
  top = Math.max(pad + h, Math.min(appH - pad, top));
  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
}

/** Ghost replay counter + speed sync (syncHud) — DOM sync over the mounted chrome. */
export function syncGhostBar(container, state) {
  const count = container.querySelector("#ghostCount");
  if (count && state.ghost) count.textContent = `${state.ghost.i}/${state.ghost.total}`;
  const bar = container.querySelector("#ghostBar");
  if (bar) bar.classList.toggle("hidden", !state.ghost);
}

/** Full HUD sync (mirror of refreshHud) — DOM sync over the mounted chrome. */
export function syncHud(container, state) {
  const chips = container.querySelector("#statChips");
  if (!chips) return;
  chips.innerHTML = statChipsHtml(state);
  syncWaveAndStatus(container, state);
  syncBuildDock(container, state);
  syncGhostBar(container, state);
  const callBtn = container.querySelector("#callBtn");
  if (callBtn) {
    const cs = callButtonState(state);
    callBtn.disabled = cs.disabled;
    callBtn.classList.toggle("busy", cs.clsBusy);
    callBtn.classList.toggle("hot", cs.clsHot);
    callBtn.title = cs.title;
    const kicker = container.querySelector(".call-kicker");
    if (kicker) kicker.textContent = cs.kicker;
    const callLabel = container.querySelector("#callLabel");
    if (callLabel) callLabel.textContent = cs.label;
  }
  syncTowerOverlay(container, state);
}
