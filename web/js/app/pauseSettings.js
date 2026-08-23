/** Extracted from App — pure move, no gameplay changes. */
import { saveMeta, saveEndless } from "../saveStore.js";
import { confirmSheet } from "../ui/next/modal.js";
import { pauseSheetHtml as renderPauseSheetHtml } from "../ui/next/chrome.js";
import { pauseState } from "../ui/next/stateOf.js";

/** Persist camera pitch from Settings or the in-game slider. */
export function applyPitch(app, deg, { save = true } = {}) {
  const v = Math.max(8, Math.min(58, Number(deg) || 24));
  app.meta.settings = app.meta.settings || {};
  app.meta.settings.cameraPitch = Math.round(v);
  app.board.setPitchDeg(v);
  const live = app.ui?.querySelector("#pitchLive");
  if (live && +live.value !== Math.round(v)) live.value = String(Math.round(v));
  const label = app.ui?.querySelector("#pitchLabel");
  if (label) label.textContent = `${Math.round(v)}°`;
  if (app.paintSlotPreviews) app.paintSlotPreviews(true);
  if (save) {
    clearTimeout(app._pitchSaveT);
    app._pitchSaveT = setTimeout(() => saveMeta(app.meta), 200);
  }
  
}

export function openPause(app) {
  if (app.screen !== "game" || !app.sim) return;
  app._endFastForward();
  app.paused = true;
  app.score.setPaused(true);
  app.clearPlaceConfirm();
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
  const campaign = !app.sim.modeEndless;
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
  if (app.sim.modeEndless && !fromEditor) {
    if (!app.waveBusy()) {
      app.sim.checkpointPhase = "betweenWaves";
      saveEndless(app.sim.checkpoint());
    }
  }
  app._endFastForward();
  app.paused = false;
  app.selectedTowerId = -1;
  app.selectedWallId = -1;
  app.clearUndoStack();
  app.score.fadeStop(1);
  app.sim = null;
  app.playtestFromEditor = false;
  if (fromEditor) app.showEditor();
  else if (campaign) app.showCampaign();
  else app.showEndlessHub();
  
}

export function renderPauseSheet(app) {
  if (!app.sim || app.screen !== "game") return;
  app.ui.querySelector("#pauseSheet")?.remove();
  const endless = !!app.sim.modeEndless;
  const wave = app.sim.waveIndex | 0;
  const quitLabel = endless ? "Endless Menu" : "Campaign Menu";
  const between = endless && !app.waveBusy();
  const note = app.playtestFromEditor
    ? "Editor playtest"
    : endless
      ? between
        ? `Between waves — board saved. Continue keeps towers; Call starts wave ${wave + 1}.`
        : `Mid-wave — Continue rolls back to the start of wave ${wave}.`
      : `Campaign level ${app.sim.campaignLevelId}`;
  const sheet = document.createElement("div");
  sheet.id = "pauseSheet";
  sheet.className = "pause-sheet";
  sheet.innerHTML = renderPauseSheetHtml(pauseState(app));
  // Delegated [data-act] handling in App.bindUi covers resume/speed/quit —
  // no direct listeners here (they double-fired the quit confirm dialog).
  app.ui.appendChild(sheet);
  
}
