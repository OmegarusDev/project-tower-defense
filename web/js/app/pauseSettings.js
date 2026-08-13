/** Extracted from App — pure move, no gameplay changes. */
import { saveMeta, saveEndless } from "../saveStore.js";

/** Persist camera pitch from Settings or the in-game slider. */
export function applyPitch(app, deg, { save = true } = {}) {
  const v = Math.max(8, Math.min(58, Number(deg) || 24));
  app.meta.settings = app.meta.settings || {};
  app.meta.settings.cameraPitch = Math.round(v);
  app.board.setPitchDeg(v);
  const live = app.ui?.querySelector("#pitchLive");
  if (live && +live.value !== Math.round(v)) live.value = String(Math.round(v));
  const label = app.ui?.querySelector("#pitchLiveVal");
  if (label) label.textContent = `${Math.round(v)}°`;
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
  const msg = fromEditor
    ? "End playtest and return to the Level Editor?"
    : campaign
      ? "Abandon this campaign run and return to the Campaign menu?"
      : "Return to the Endless menu? Your checkpoint is saved.";
  if (!confirm(msg)) return;
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
  sheet.innerHTML = `
    <button type="button" class="pause-backdrop" data-act="resume" aria-label="Resume"></button>
    <div class="pause-card" role="dialog" aria-modal="true" aria-labelledby="pauseTitle">
      <p class="pause-mark">Paused</p>
      <h2 id="pauseTitle">Wave ${wave}</h2>
      <p class="pause-note">${note}</p>
      <div class="pause-speeds" role="group" aria-label="Speed">
        <button type="button" class="btn secondary ${app.speed === 1 ? "equipped" : ""}" data-act="speed:1">1×</button>
        <button type="button" class="btn secondary ${app.speed === 2 ? "equipped" : ""}" data-act="speed:2">2×</button>
        <button type="button" class="btn secondary ${app.speed === 3 ? "equipped" : ""}" data-act="speed:3">3×</button>
      </div>
      <p class="pause-hint">Hold Deploy for 5× · seed ${app.sim.runSeed >>> 0}</p>
      <button type="button" class="btn title-cta" data-act="resume">Resume</button>
      <button type="button" class="btn secondary" data-act="quit-run">${
        app.playtestFromEditor ? "Editor" : quitLabel
      }</button>
    </div>`;
  // Delegated [data-act] handling in App.bindUi covers resume/speed/quit —
  // no direct listeners here (they double-fired the quit confirm dialog).
  app.ui.appendChild(sheet);
  
}
