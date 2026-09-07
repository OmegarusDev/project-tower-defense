/** Extracted from App — pure move, no gameplay changes. */
import { saveMeta, saveEndless } from "../saveStore.js";
import { RULES } from "../data/rules.js";
import { confirmSheet } from "../ui/modal.js";
import { pauseSheetHtml as renderPauseSheetHtml } from "../ui/chrome.js";
import { pauseState } from "../ui/stateOf.js";
import * as ends from "../ui/endScreens.js";
import { endFastForward } from "./fastForward.js";
import { clearUndoStack, clearPlaceConfirm } from "./placeUndo.js";

/** Persist camera pitch from Settings or the in-game slider. */
export function applyPitch(app, deg, { save = true } = {}) {
  const v = Math.max(RULES.PITCH_MIN, Math.min(RULES.PITCH_MAX, Number(deg) || RULES.PITCH_DEFAULT));
  app.meta.settings = app.meta.settings || {};
  app.meta.settings.cameraPitch = Math.round(v);
  app.board.setPitchDeg(v);
  const live = app.ui?.querySelector("#pitchLive");
  if (live && +live.value !== Math.round(v)) live.value = String(Math.round(v));
  const label = app.ui?.querySelector("#pitchLabel");
  if (label) label.textContent = `${Math.round(v)}°`;
  if (save) {
    clearTimeout(app._pitchSaveT);
    app._pitchSaveT = setTimeout(() => saveMeta(app.meta), 200);
  }
  
}

export function openPause(app) {
  if (app.screen !== "game" || !app.sim) return;
  endFastForward(app);
  app.paused = true;
  app.score.setPaused(true);
  clearPlaceConfirm(app);
  renderPauseSheet(app);
  
}

export function resumeGame(app) {
  app.paused = false;
  app.score.setPaused(false);
  app.unlockAudio();
  app.ui.querySelector("#pauseSheet")?.remove();
  
}

export function quitToMenu(app) {
  if (!app.sim) return;
  const fromEditor = !!app.playtestFromEditor;
  const campaign = !app.sim.state.modeEndless;
  const note = fromEditor
    ? "End the playtest and return to the Editor?"
    : campaign
      ? "Abandon this run? The Yard falls back to the Campaign."
      : "Return to the Endless menu? Your checkpoint is saved.";
  confirmSheet(app.ui, {
    mark: "Command",
    title: "Stand Down?",
    note,
    confirmLabel: "Stand Down",
  }).then((yes) => {
    if (!yes) return;
    finishQuit(app, fromEditor, campaign);
  });
}

/** The actual quit — runs only after the Cinder-sheet confirms. */
function finishQuit(app, fromEditor, campaign) {
  // Between waves: persist post-clear board so Continue keeps towers/Coin.
  // Mid-wave: leave the wave-start checkpoint (GDD Continue = start of last wave).
  if (app.sim.state.modeEndless && !fromEditor) {
    const s = app.sim.state;
    if (!(s.waves.active || s.enemies.length)) {
      app.sim.state.checkpointPhase = "betweenWaves";
      saveEndless(app.sim.checkpoint());
    }
  }
  endFastForward(app);
  app.paused = false;
  app.interaction.selectedTowerId = -1;
  app.interaction.selectedWallId = -1;
  clearUndoStack(app);
  app.score.fadeStop(1);
  app.sim = null;
  app.playtestFromEditor = false;
  if (fromEditor) app.showEditor();
  else if (campaign) app.showCampaign();
  else ends.showEndlessHub(app);
  
}

export function renderPauseSheet(app) {
  if (!app.sim || app.screen !== "game") return;
  app.ui.querySelector("#pauseSheet")?.remove();
  // Copy lives in chrome.pauseSheetHtml via pauseState(app) — no locals here.
  const sheet = document.createElement("div");
  sheet.id = "pauseSheet";
  sheet.className = "pause-sheet";
  sheet.innerHTML = renderPauseSheetHtml(pauseState(app));
  // Delegated [data-act] handling in App.bindUi covers resume/speed/quit —
  // no direct listeners here (they double-fired the quit confirm dialog).
  app.ui.appendChild(sheet);
  
}
