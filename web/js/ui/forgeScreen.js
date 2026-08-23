/** Extracted from App — pure move, no gameplay changes. */
import { makeSlot, forgeBuyCost, ownsPart, normalizeRoster, MAX_ROSTER_SLOTS } from "../data/parts.js";
import {
  forgeApplyPart,
  forgeClearSlot,
  forgeUnlockSlot,
  forgeBuyPart,
} from "../app/forgeLogic.js";
import { renderTowerNext } from "../view/next/renderTower.js";
import { forgePartGridHtml, forgePreviewCard, forgeUnlockCard } from "./next/screens.js";
import { renderForge } from "./next/screens.js";
import { forgeState } from "./next/stateOf.js";
import { applyBtnTextures } from "./next/registry.js";

/** Patch the open Forge screen without wiping scroll / replaying enter anim. */
export function refreshForgeUi(app, { rebuildParts = false, flashPreview = true } = {}) {
  const root = app.ui.querySelector(".forge-screen");
  if (app.screen !== "forge" || !root) {
    showForge(app);
    return;
  }
  root.classList.remove("meta-enter");
  app.meta.roster = normalizeRoster(
    app.meta.roster,
    app.meta.slotCount,
    app.meta.levelCap
  );
  const slot = app.meta.roster[app.forgeSlot] || makeSlot();

  const status = root.querySelector("#status");
  if (status) {
    status.textContent = app.status || "";
    status.classList.toggle("empty", !app.status);
  }

  const stats = root.querySelector(".tech-stats");
  if (stats) {
    stats.innerHTML = `
          <span><i>Parts</i>${app.meta.forge}</span>
          <span><i>Æ</i>${app.meta.aether}</span>
          <span><i>Cap</i>L${app.meta.levelCap}</span>
          <span><i>Slots</i>${app.meta.slotCount}</span>`;
  }

  const slotCount = app.meta.slotCount | 0;
  const total = slotCount + (slotCount < MAX_ROSTER_SLOTS ? 1 : 0);
  if ((app.forgeSlot | 0) >= total) app.forgeSlot = 0;
  const isPanel = app.forgeSlot === slotCount && slotCount < MAX_ROSTER_SLOTS;
  const st = forgeState(app);

  const wrap = root.querySelector(".forge-preview-wrap");
  if (wrap) {
    wrap.innerHTML = isPanel ? forgeUnlockCard(st, total) : forgePreviewCard(st, total);
  }
  const grid = root.querySelector(".forge-part-grid");
  if (grid) {
    grid.hidden = isPanel;
    if (rebuildParts && !isPanel) grid.innerHTML = forgePartGridHtml(st, slot);
    else if (!isPanel) {
      for (const btn of grid.querySelectorAll("[data-act^='forge-part:']")) {
        const [, kind, id] = btn.getAttribute("data-act").split(":");
        btn.classList.toggle("equipped", slot[kind] === id);
      }
    }
  }

  if (flashPreview) flashForgePreview(app);
  else paintForgePreview(app);
  
}

function flashForgePreview(app) {
  const canvas = app.ui.querySelector("#forgePreview");
  if (!canvas || app.screen !== "forge") return;
  canvas.classList.remove("forge-preview-flash");
  void canvas.offsetWidth;
  canvas.classList.add("forge-preview-flash");
  paintForgePreview(app);
  
}

export function showForge(app, returnTo) {
  if (returnTo) app.forgeReturn = returnTo;
  if (!app.forgeReturn) app.forgeReturn = "main";
  app.screen = "forge";
  app.meta.roster = normalizeRoster(
    app.meta.roster,
    app.meta.slotCount,
    app.meta.levelCap
  );
  const slotCount = app.meta.slotCount | 0;
  const total = slotCount + (slotCount < MAX_ROSTER_SLOTS ? 1 : 0);
  if ((app.forgeSlot | 0) >= total) app.forgeSlot = 0;
  const html = renderForge(forgeState(app));
  const existing = app.ui.firstElementChild;
  if (existing && existing.classList.contains("meta-enter")) {
    existing.classList.remove("meta-enter");
    existing.classList.add("meta-exit");
    const onEnd = () => {
      existing.removeEventListener("animationend", onEnd);
      _applyForge(app, html);
    };
    existing.addEventListener("animationend", onEnd, { once: true });
    setTimeout(() => {
      if (app.ui.firstElementChild === existing) _applyForge(app, html);
    }, 250);
    return;
  }
  _applyForge(app, html);
}

function _applyForge(app, html) {
  app.ui.innerHTML = html;
  applyBtnTextures(app.ui);
  app.bindUi();
  paintForgePreview(app);
  requestAnimationFrame(() => {
    app.ui.querySelector(".forge-screen")?.classList.remove("meta-enter");
  });
}

export function forgeCost(app, kind, id) {
  return forgeBuyCost(kind, id, app.meta);
  
}

export function paintForgePreview(app) {
  const canvas = app.ui.querySelector("#forgePreview");
  if (!canvas || app.screen !== "forge") return;
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const css = 112;
  if (canvas.width !== Math.floor(css * dpr)) {
    canvas.width = Math.floor(css * dpr);
    canvas.height = Math.floor(css * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, css, css);
  ctx.fillStyle = "#1a1c18";
  ctx.fillRect(0, 0, css, css);
  const slot = app.meta.roster[app.forgeSlot];
  if (!slot?.complete) {
    ctx.fillStyle = "#9aa6b8";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("incomplete", css / 2, css / 2);
    return;
  }
  const t = {
    base: slot.base,
    barrel: slot.barrel,
    payload: slot.payload,
    aimAngle: app.forgeAim,
    level: 1,
    pendingPicks: 0,
    branch: { damage: 0, rof: 0, range: 0 },
  };
  const size = 72;
  const px = (css - size) / 2;
  const py = (css - size) / 2;
  // The painter owns ground-plane foreshortening (foreshortenBarrel in the
  // turret) — no pre-scale here, or barrels would double-squash.
  renderTowerNext(ctx, app.palette, t, px, py, size, {});
  
}

export function applyForgePart(app, kind, id) {
  if (!ownsPart(app.meta.owned, kind, id)) {
    app.buyPart(kind, id, true);
    return;
  }
  const r = forgeApplyPart(app.meta, app.forgeSlot, kind, id);
  app.persistMeta();
  if (app.sim) app._syncSimFromMeta(app.sim);
  app.synth.play("ui", 1, 0.4);
  app.status = r.status;
  refreshForgeUi(app);
  
}

export function clearForgeSlot(app) {
  const r = forgeClearSlot(app.meta, app.forgeSlot);
  app.persistMeta();
  if (app.sim) app._syncSimFromMeta(app.sim);
  app.status = r.status;
  refreshForgeUi(app);
  
}

/** Unlock next roster slot with Aether (same tech path as Roster Slots). */
export function unlockForgeSlot(app, wantIndex) {
  const r = forgeUnlockSlot(app.meta, wantIndex);
  if (!r.ok) {
    app.toast(r.need || "All roster slots unlocked");
    return;
  }
  app.forgeSlot = r.slotIndex;
  app.persistMeta();
  if (app.sim) app._syncSimFromMeta(app.sim);
  app.synth.play("confirm");
  app.status = r.status;
  refreshForgeUi(app, { rebuildParts: true });
  
}

/** Unlock with Forge parts; when from Forge UI, also equip onto the active slot. */
export function buyPart(app, kind, id, equip = true) {
  const r = forgeBuyPart(app.meta, app.forgeSlot, kind, id, equip);
  if (!r.ok) {
    if (r.reason === "owned") {
      if (equip) app.applyForgePart(kind, id);
      else app.toast("Already owned");
    } else {
      app.toast(`Need ${r.need} Forge parts`);
    }
    return;
  }
  app.persistMeta();
  if (app.sim) app._syncSimFromMeta(app.sim);
  app.synth.play("confirm");
  app.status = r.status;
  refreshForgeUi(app, { rebuildParts: true });
  
}
