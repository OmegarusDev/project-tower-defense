/** Extracted from App — pure move, no gameplay changes. */
import { makeSlot, ownsPart, MAX_ROSTER_SLOTS } from "../data/parts.js";

import { renderTowerNext } from "../view/next/renderTower.js";
import { chromeState } from "../ui/next/stateOf.js";
import { chromeHtml, composeSheetHtml, syncHud } from "../ui/next/chrome.js";
import { rosterSlotButtonsHtml } from "../ui/next/screens.js";
import { applyBtnTextures } from "../ui/next/registry.js";

/** Live place quote for a roster index (game only). */
export function gameSlotQuote(app, i) {
  const s = app.sim?.roster?.[i];
  if (!s?.complete) {
    return {
      complete: false,
      btnLabel: `S${i + 1} · —`,
      costLabel: "—",
      tip: "incomplete — set in Forge",
      total: 0,
      surcharge: 0,
      base: 0,
      loadout: s || null,
    };
  }
  const q = app.sim.economy.quoteTowerPlace(s.placeCost, app.sim.towers.length);
  return {
    complete: true,
    btnLabel: `S${i + 1} · ${q.total}`,
    costLabel: `${q.total}`,
    tip: `${s.base}/${s.barrel}/${s.payload}${q.surcharge ? ` (+${q.surcharge} tax)` : ""}`,
    total: q.total,
    surcharge: q.surcharge,
    base: q.base,
    loadout: s,
  };
  
}

export function rosterSlotButtons(app, mode) {
  return rosterSlotButtonsHtml(chromeState(app), mode);
}

export function waveBusy(app) {
  if (!app.sim) return false;
  return !!(app.sim.waves.waveActive || app.sim.enemies.length);
  
}

export function renderGameChrome(app) {
  app._previewTick = 0;
  if (!app.sim) return;
  const existing = app.ui.firstElementChild;
  const onGame = !!(existing && existing.classList.contains("game-chrome"));
  if (!onGame && existing && existing.classList.contains("meta-enter")) {
    existing.classList.remove("meta-enter");
    existing.classList.add("meta-exit");
    const onEnd = () => {
      existing.removeEventListener("animationend", onEnd);
      _applyChrome(app, true);
    };
    existing.addEventListener("animationend", onEnd, { once: true });
    setTimeout(() => {
      if (app.ui.firstElementChild === existing) _applyChrome(app, true);
    }, 250);
    return;
  }
  _applyChrome(app, !onGame);
}

function _applyChrome(app, animate) {
  app.ui.innerHTML = chromeHtml(chromeState(app));
  if (!animate) app.ui.firstElementChild?.classList.remove("meta-enter");
  applyBtnTextures(app.ui);
  app.bindUi();
  app._bindCallButton(app.ui.querySelector("#callBtn"));
  app.ui.querySelector("#pitchLive")?.addEventListener("input", (e) => {
    app.applyPitch(+e.target.value);
  });
  refreshHud(app);
  paintSlotPreviews(app);
  if (app.paused) app._renderPauseSheet();
}

export function toggleLiveCompose(app) {
  if (!app.sim?.modeEndless) return;
  app.liveCompose = !app.liveCompose;
  renderGameChrome(app);
  
}
export function applyLiveComposePart(app, kind, id) {
  if (!app.sim?.modeEndless) return;
  if (!ownsPart(app.meta.owned, kind, id)) return;
  const s = app.meta.roster[app.slot] || makeSlot("", "", "", app.meta.levelCap);
  s[kind] = id;
  app.meta.roster[app.slot] = makeSlot(s.base, s.barrel, s.payload, app.meta.levelCap);
  app.persistMeta();
  app._syncSimFromMeta(app.sim);
  app.synth.play("ui", 1, 0.4);
  renderGameChrome(app);
  
}

/** Tiny rotating loadout previews inside arsenal slot tiles. */
export function paintSlotPreviews(app, force = false) {
  if (app.screen !== "game" || !app.sim) return;
  // The previews rotate on a slow flourish — repaint at ~10fps, not 60.
  // force (pitch drag) paints immediately for real-time feedback.
  if (!force && (app._previewTick = (app._previewTick | 0) + 1) % 6 !== 0) return;
  const aim = app.slotPreviewAim || -Math.PI / 2;
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

    const slot = app.sim.roster?.[i];
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
