/** Extracted from App — pure move, no gameplay changes. */
import { makeSlot, ownsPart, MAX_ROSTER_SLOTS } from "../data/parts.js";

import { renderTowerNext } from "../view/renderTower.js";
import { persistMeta, syncSimFromMeta } from "./metaSync.js";
import { applyPitch } from "./pauseSettings.js";
import { bindCallButton } from "./fastForward.js";
import { waveBusy } from "./waveBusy.js";
import { chromeHtml, composeSheetHtml, syncHud, pauseSheetHtml } from "../ui/chrome.js";
import { chromeState, pauseState } from "../ui/stateOf.js";
import { rosterSlotButtonsHtml } from "../ui/screens.js";
import { applyBtnTextures, swapWithExitAnim } from "../ui/registry.js";

export { waveBusy };

export function rosterSlotButtons(app, mode) {
  return rosterSlotButtonsHtml(chromeState(app), mode);
}

export function renderGameChrome(app) {
  app._previewTick = 0;
  if (!app.sim) return;
  const existing = app.ui.firstElementChild;
  const onGame = !!(existing && existing.classList.contains("game-chrome"));
  if (!onGame && swapWithExitAnim(app.ui, () => _applyChrome(app, true))) return;
  _applyChrome(app, !onGame);
}

function _applyChrome(app, animate) {
  app.ui.innerHTML = chromeHtml(chromeState(app));
  if (!animate) app.ui.firstElementChild?.classList.remove("meta-enter");
  applyBtnTextures(app.ui);
  app.bindUi();
  bindCallButton(app, app.ui.querySelector("#callBtn"));
  app.ui.querySelector("#pitchLive")?.addEventListener("input", (e) => {
  applyPitch(app, +e.target.value);
    paintSlotPreviews(app, true);
  });
  refreshHud(app);
  paintSlotPreviews(app);
  if (app.paused) attachPauseSheet(app);
}

function attachPauseSheet(app) {
  if (!app.sim || app.screen !== "game") return;
  app.ui.querySelector("#pauseSheet")?.remove();
  const sheet = document.createElement("div");
  sheet.id = "pauseSheet";
  sheet.className = "pause-sheet";
  sheet.innerHTML = pauseSheetHtml(pauseState(app));
  app.ui.appendChild(sheet);
}

export function toggleLiveCompose(app) {
  if (!app.sim?.state?.modeEndless) return;
  app.interaction.liveCompose = !app.interaction.liveCompose;
  renderGameChrome(app);
  
}
export function applyLiveComposePart(app, kind, id) {
  if (!app.sim?.state?.modeEndless) return;
  if (!ownsPart(app.meta.owned, kind, id)) return;
  const s = app.meta.roster[app.interaction.slot] || makeSlot("", "", "", app.meta.levelCap);
  s[kind] = id;
  app.meta.roster[app.interaction.slot] = makeSlot(s.base, s.barrel, s.payload, app.meta.levelCap);
  persistMeta(app);
  syncSimFromMeta(app, app.sim);
  app.synth.play("ui", 1, 0.4);
  renderGameChrome(app);
  
}

/** Tiny rotating loadout previews inside arsenal slot tiles. */
export function paintSlotPreviews(app, force = false) {
  if (app.screen !== "game" || !app.sim) return;
  // The previews rotate on a slow flourish — repaint at ~10fps, not 60.
  // force (pitch drag) paints immediately for real-time feedback.
  if (!force && (app._previewTick = (app._previewTick | 0) + 1) % 6 !== 0) return;
  const aim = app.interaction.slotPreviewAim || -Math.PI / 2;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const css = 40;
  for (let i = 0; i < MAX_ROSTER_SLOTS; i++) {
    const canvas = app.ui.querySelector(`[data-slot-preview="${i}"]`);
    if (!canvas) continue;
    const ctx = canvas.getContext("2d");
    if (canvas.width !== Math.floor(css * dpr)) {
      canvas.width = Math.floor(css * dpr);
      canvas.height = Math.floor(css * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, css, css);

    const slot = app.sim.state.roster?.[i];
    if (!slot?.complete) {
      ctx.fillStyle = "rgba(120,130,145,0.35)";
      ctx.beginPath();
      ctx.arc(css / 2, css / 2, 8, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    const t = {
      base: slot.base,
      barrel: slot.barrel,
      payload: slot.payload,
      aimAngle: aim + i * 0.35,
      level: 1,
    };
    const size = 34;
    const px = (css - size) / 2;
    const py = (css - size) / 2 + 1;
    // No outer yScale — the painter owns ground-plane foreshortening
    // (foreshortenBarrel in the turret; vz()/deckRy on the base).
    renderTowerNext(ctx, app.palette, t, px, py, size, { showBadge: false });
  }
  
}

/**
   * Live HUD sync — currencies, build-strip prices, call button, tower card.
   * Structure comes from renderGameChrome; prices always refresh here.
   */
export function refreshHud(app) {
  if (!app.sim || app.screen !== "game") return;
  syncHud(app.ui, chromeState(app));
}
