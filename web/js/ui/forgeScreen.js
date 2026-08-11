/** Extracted from App — pure move, no gameplay changes. */
import {
  makeSlot,
  PARTS,
  forgeBuyCost,
  ownsPart,
  normalizeRoster,
  partLabel,
  doctrineLabel,
} from "../data/parts.js";
import {
  syncTechDerived,
  nextRosterSlotUnlock,
  formatTechCost,
  canAffordTech,
  spendTechCost,
} from "../data/techTree.js";
import { VIEW25 } from "../view/view25.js";
import { drawComposedTower } from "../view/towerPainter.js";
import { forgePlanSummary } from "./menuScreens.js";
import { rosterSlotButtons } from "../app/gameChrome.js";
import { partIconHtml } from "./partIcons.js";

export function forgePartBtnHtml(app, kind, id, slot) {
  const have = ownsPart(app.meta.owned, kind, id);
  const equipped = slot[kind] === id;
  const table = kind === "base" ? PARTS.bases : kind === "barrel" ? PARTS.barrels : PARTS.payloads;
  const tip = table[id]?.blurb || "";
  const extra =
    kind === "base" && table[id]?.doctrine
      ? ` · ${doctrineLabel(table[id].doctrine)}`
      : "";
  const ico = partIconHtml(kind, id);
  if (have) {
    const cls = `btn part-btn part-chip ${equipped ? "equipped" : ""}`.trim();
    return `<button class="${cls}" data-act="forge-part:${kind}:${id}" title="${tip}"><span class="part-btn-inner">${ico}<span class="part-btn-label">${partLabel(id)}${extra}</span></span></button>`;
  }
  const cost = forgeCost(app, kind, id);
  const can = app.meta.forge >= cost;
  const cls = `btn part-btn part-chip locked ${can ? "" : "cant-afford"}`.trim();
  return `<button class="${cls}" data-act="buy:${kind}:${id}" title="${tip} — unlock for ${cost} Parts"><span class="part-btn-inner">${ico}<span class="part-btn-label">${partLabel(id)}${extra}<br/><span class="part-btn-cost">${cost} Parts</span></span></span></button>`;
}


export function forgePartGridHtml(app, slot) {
  const col = (title, kind, ids) =>
    `<div><h4>${title}</h4>${ids.map((id) => forgePartBtnHtml(app, kind, id, slot)).join("")}</div>`;
  return `
    ${col("Base", "base", Object.keys(PARTS.bases))}
    ${col("Barrel", "barrel", Object.keys(PARTS.barrels))}
    ${col("Payload", "payload", Object.keys(PARTS.payloads))}`;
  
}

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
  if (app.forgeSlot >= app.meta.roster.length) app.forgeSlot = 0;
  const slot = app.meta.roster[app.forgeSlot] || makeSlot();

  const status = root.querySelector("#status");
  if (status) {
    status.textContent = app.status || "";
    status.hidden = !app.status;
  }

  const stats = root.querySelector(".tech-stats");
  if (stats) {
    stats.innerHTML = `
          <span><i>Parts</i>${app.meta.forge}</span>
          <span><i>Æ</i>${app.meta.aether}</span>
          <span><i>Cap</i>L${app.meta.levelCap}</span>
          <span><i>Slots</i>${app.meta.slotCount}</span>`;
  }

  const strip = root.querySelector(".build-strip");
  if (strip) strip.innerHTML = rosterSlotButtons(app, "forge");

  const heading = root.querySelector(".forge-summary h3");
  if (heading) heading.textContent = `Slot ${app.forgeSlot + 1}`;
  const loadout = root.querySelector("#forgeLoadout");
  if (loadout) loadout.innerHTML = forgePlanSummary(slot);

  if (rebuildParts) {
    const grid = root.querySelector(".forge-part-grid");
    if (grid) grid.innerHTML = forgePartGridHtml(app, slot);
  } else {
    for (const btn of root.querySelectorAll("[data-act^='forge-part:']")) {
      const [, kind, id] = btn.getAttribute("data-act").split(":");
      btn.classList.toggle("equipped", slot[kind] === id);
    }
  }

  if (flashPreview) flashForgePreview(app);
  else paintForgePreview(app);
  
}

export function flashForgePreview(app) {
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
  if (app.forgeSlot >= app.meta.roster.length) app.forgeSlot = 0;
  const slot = app.meta.roster[app.forgeSlot] || makeSlot();
  const backAct =
    app.forgeReturn === "hub"
      ? "hub"
      : app.forgeReturn === "campaign"
        ? "campaign"
        : app.forgeReturn === "prep"
          ? `prep:${app.prepLevelId || 1}`
          : "main";
  const slotBtns = rosterSlotButtons(app, "forge");
  app.ui.innerHTML = `
    <div class="screen meta-shell meta-screen forge-screen meta-enter">
      <header class="meta-hero">
        <div class="meta-hero-row">
          <div>
            <h1>Forge</h1>
          </div>
          <button class="btn secondary tech-back" data-act="${backAct}">Back</button>
        </div>
        <div class="title-stats tech-stats">
          <span><i>Parts</i>${app.meta.forge}</span>
          <span><i>Æ</i>${app.meta.aether}</span>
          <span><i>Cap</i>L${app.meta.levelCap}</span>
          <span><i>Slots</i>${app.meta.slotCount}</span>
        </div>
        <div class="status tech-status forge-status" id="status"${app.status ? "" : " hidden"}>${app.status || ""}</div>
      </header>
      <div class="meta-scroll">
        <div class="row build-strip">${slotBtns}</div>
        <div class="forge-preview-wrap">
          <canvas id="forgePreview" class="forge-preview-flash" width="160" height="160" aria-label="Tower preview"></canvas>
          <div class="forge-summary">
            <h3>Slot ${app.forgeSlot + 1}</h3>
            <p id="forgeLoadout">${forgePlanSummary(slot)}</p>
            <button class="btn secondary part-chip" data-act="forge-clear" style="margin-top:8px">Clear slot</button>
          </div>
        </div>
        <div class="cols forge-part-grid">${forgePartGridHtml(app, slot)}</div>
        <p class="end-note">Locked parts cost Parts (price rises with each purchase). Wave gifts are free. Unlock slots with Æ here or in Tech.</p>
      </div>
      <footer class="meta-dock">
        <button class="btn warn" data-act="upgrade">Tech Tree</button>
      </footer>
    </div>`;
  app.bindUi();
  paintForgePreview(app);
  // Drop enter anim so later DOM patches never replay a full-screen fade.
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
  // Match board pitch foreshortening on the preview
  ctx.save();
  ctx.translate(css / 2, css / 2);
  ctx.scale(1, VIEW25.yScale);
  ctx.translate(-css / 2, -css / 2);
  drawComposedTower(ctx, app.palette, t, px, py, size, false);
  ctx.restore();
  
}

export function applyForgePart(app, kind, id) {
  if (!ownsPart(app.meta.owned, kind, id)) {
    app.buyPart(kind, id, true);
    return;
  }
  const s = app.meta.roster[app.forgeSlot] || makeSlot("", "", "", app.meta.levelCap);
  s[kind] = id;
  app.meta.roster[app.forgeSlot] = makeSlot(s.base, s.barrel, s.payload, app.meta.levelCap);
  app.persistMeta();
  if (app.sim) app._syncSimFromMeta(app.sim);
  app.synth.play("ui");
  app.status = `Slot ${app.forgeSlot + 1}: set ${kind}`;
  refreshForgeUi(app);
  
}

export function clearForgeSlot(app) {
  app.meta.roster[app.forgeSlot] = makeSlot("", "", "", app.meta.levelCap);
  app.persistMeta();
  if (app.sim) app._syncSimFromMeta(app.sim);
  app.status = `Slot ${app.forgeSlot + 1} cleared`;
  refreshForgeUi(app);
  
}

/** Unlock next roster slot with Aether (same tech path as Roster Slots). */
export function unlockForgeSlot(app, wantIndex) {
  const next = nextRosterSlotUnlock(app.meta);
  if (!next) {
    app.toast("All roster slots unlocked");
    return;
  }
  if (wantIndex != null && wantIndex !== next.nextSlotIndex) {
    app.toast(`Unlock Slot ${next.nextSlotCount} first`);
    return;
  }
  if (!canAffordTech(app.meta, next.cost)) {
    return app.toast(`Need ${formatTechCost(next.cost)}`);
  }
  spendTechCost(app.meta, next.cost);
  app.meta.tech = app.meta.tech || {};
  app.meta.tech[next.node.id] = next.rank + 1;
  syncTechDerived(app.meta);
  app.meta.roster = normalizeRoster(
    app.meta.roster,
    app.meta.slotCount,
    app.meta.levelCap
  );
  app.forgeSlot = next.nextSlotIndex;
  app.persistMeta();
  if (app.sim) app._syncSimFromMeta(app.sim);
  app.synth.play("confirm");
  app.status = `Unlocked slot ${next.nextSlotCount}`;
  refreshForgeUi(app, { rebuildParts: true });
  
}

/** Unlock with Forge parts; when from Forge UI, also equip onto the active slot. */
export function buyPart(app, kind, id, equip = true) {
  if (ownsPart(app.meta.owned, kind, id)) {
    if (equip) app.applyForgePart(kind, id);
    else app.toast("Already owned");
    return;
  }
  const cost = forgeCost(app, kind, id);
  if (app.meta.forge < cost) {
    app.toast(`Need ${cost} Forge parts`);
    return;
  }
  app.meta.forge -= cost;
  app.meta.forgeBuys = (app.meta.forgeBuys | 0) + 1;
  const key = kind === "base" ? "bases" : kind === "barrel" ? "barrels" : "payloads";
  if (!app.meta.owned[key].includes(id)) app.meta.owned[key].push(id);
  if (equip) {
    const s = app.meta.roster[app.forgeSlot] || makeSlot("", "", "", app.meta.levelCap);
    s[kind] = id;
    app.meta.roster[app.forgeSlot] = makeSlot(s.base, s.barrel, s.payload, app.meta.levelCap);
  }
  app.persistMeta();
  if (app.sim) app._syncSimFromMeta(app.sim);
  app.synth.play("confirm");
  app.status = `Unlocked ${partLabel(id)}${equip ? " · equipped" : ""}`;
  refreshForgeUi(app, { rebuildParts: true });
  
}
