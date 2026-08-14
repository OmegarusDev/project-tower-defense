/** Extracted from App — pure move, no gameplay changes. */
import {
  ownsPart,
  normalizeRoster,
  partLabel,
} from "../data/parts.js";
import {
  TECH_TREES,
  BASE_START_CASH,
  BASE_START_LIVES,
  getTechNode,
  techRank,
  techRequiresMet,
  techPartOwned,
  techNextCost,
  formatTechCost,
  canAffordTech,
  spendTechCost,
  syncTechDerived,
} from "../data/techTree.js";
import { forgeCost } from "./forgeScreen.js";
import { renderTech, techTreeHtml } from "./next/screens.js";
import { techState } from "./next/stateOf.js";

export function showUpgrade(app, returnTo) {
  if (returnTo) {
    app.upgradeReturn = returnTo;
    app.techSelectedId = null;
  }
  if (!app.upgradeReturn) app.upgradeReturn = "forge";
  if (!app.techTreeTab) app.techTreeTab = "foundations";
  app.screen = "upgrade";
  let backAct = "forge";
  if (app.upgradeReturn === "main") backAct = "main";
  else if (app.upgradeReturn === "hub") backAct = "hub";
  else if (app.upgradeReturn === "campaign") backAct = "campaign";
  else if (app.upgradeReturn === "prep") backAct = `prep:${app.prepLevelId || 1}`;
  else if (app.upgradeReturn === "forge") backAct = "forge";
  app.ui.innerHTML = renderTech(techState(app));
}

export function setTechTreeTab(app, tabId) {
  if (!TECH_TREES.some((t) => t.id === tabId)) return;
  app.techTreeTab = tabId;
  app.techSelectedId = null;
  app.synth.play("ui");
  // Tabs swap ONLY the tree body — no full-screen refresh.
  if (app.screen !== "upgrade") {
    showUpgrade(app);
    return;
  }
  const body = app.ui.querySelector("#techBody");
  if (body) {
    const tree = TECH_TREES.find((t) => t.id === tabId) || TECH_TREES[0];
    const st = techState(app);
    body.innerHTML = `${techTreeHtml(st, tree)}
      <p class="tech-gift">Best wave ${app.meta.bestWave || 0} · earn Parts in runs, unlock parts at the Forge</p>`;
  }
  for (const tab of app.ui.querySelectorAll(".ttree-tab")) {
    tab.classList.toggle("active", tab.getAttribute("data-act") === `tech-tab:${tabId}`);
  }
  app.ui.querySelector(".tech-overlay")?.remove();
}

export function selectTechNode(app, id) {
  const def = getTechNode(id);
  if (def?.treeId) app.techTreeTab = def.treeId;
  app.techSelectedId = id;
  app.synth.play("ui");
  showUpgrade(app);
  
}

export function closeTechOverlay(app) {
  app.techSelectedId = null;
  showUpgrade(app);
  
}

function techOverlayHtml(app, id) {
  const def = getTechNode(id);
  if (!def) return "";
  const rank = techRank(app.meta, def.id);
  const maxed = rank >= def.maxRank;
  const prereq = techRequiresMet(app.meta, def);
  const partOk = techPartOwned(app.meta, def, ownsPart);
  const cost = techNextCost(def, rank);
  const costLabel = formatTechCost(cost);
  const treeName =
    TECH_TREES.find((t) => t.id === def.treeId)?.name || def.treeId || "Tech";

  let reqBits = [];
  if (def.requires?.length) {
    for (const rid of def.requires) {
      const rnode = getTechNode(rid);
      const ok = techRank(app.meta, rid) >= 1;
      reqBits.push(
        `<span class="tech-req ${ok ? "ok" : "missing"}">${rnode?.name || rid}</span>`
      );
    }
  }
  if (def.requiresPart) {
    const kind = def.requiresPart.kind || "part";
    const ok = partOk;
    const partCost = forgeCost(app, def.requiresPart.kind, def.requiresPart.id);
    reqBits.push(
      `<span class="tech-req ${ok ? "ok" : "missing"}">${
        ok
          ? `Own ${partLabel(def.requiresPart.id)} (${kind})`
          : `Needs ${partLabel(def.requiresPart.id)} · ${partCost > 0 ? `${partCost} Parts` : "free"}`
      }</span>`
    );
  }

  let action;
  if (maxed) {
    action = `<button class="btn secondary" disabled>Maxed · ${rank}/${def.maxRank}</button>`;
  } else if (!prereq) {
    action = `<button class="btn secondary" disabled>Requires prior tech</button>`;
  } else if (!partOk && def.requiresPart) {
    const { kind, id: partId } = def.requiresPart;
    const partCost = forgeCost(app, kind, partId);
    const canBuyPart = (app.meta.forge | 0) >= partCost;
    const partLabelTxt = partLabel(partId);
    const unlockLabel =
      partCost > 0 ? `Unlock ${partLabelTxt} · ${partCost} Parts` : `Unlock ${partLabelTxt} · Free`;
    action = canBuyPart
      ? `<button class="btn title-cta" data-act="tech-unlock-part:${kind}:${partId}">${unlockLabel}</button>
         <p class="tech-sheet-next">Then buy mastery${costLabel ? ` · ${costLabel}` : ""}</p>`
      : `<button class="btn cant-afford" disabled>Need ${partCost} Parts for ${partLabelTxt}</button>
         <p class="tech-sheet-next">Earn Parts from waves, then unlock this piece</p>`;
  } else if (!canAffordTech(app.meta, cost)) {
    action = `<button class="btn cant-afford" disabled>Need ${costLabel}</button>`;
  } else {
    const buyVerb = def.maxRank > 1 ? `Buy rank ${rank + 1}` : "Unlock";
    action = `<button class="btn title-cta" data-act="tech-buy:${def.id}">${buyVerb} · ${costLabel}</button>`;
  }

  const rankLine =
    def.maxRank > 1
      ? `Rank ${rank} / ${def.maxRank}${maxed ? " · complete" : cost ? ` · next ${costLabel}` : ""}`
      : maxed
        ? "Unlocked"
        : cost
          ? `Locked · ${costLabel}`
          : "Locked";

  const currencyHint =
    def.treeId === "arsenal"
      ? `<p class="tech-sheet-currency">Spends Parts · own the piece first</p>`
      : "";

  return `<div class="tech-overlay">
    <button type="button" class="tech-backdrop" data-act="tech-close" aria-label="Dismiss"></button>
    <div class="tech-sheet" role="dialog" aria-modal="true" aria-labelledby="tech-sheet-title">
      <button type="button" class="tech-sheet-x" data-act="tech-close" aria-label="Close">×</button>
      <p class="tech-sheet-mark">${treeName}</p>
      <h2 id="tech-sheet-title">${def.name}</h2>
      <p class="tech-sheet-blurb">${def.blurb || ""}</p>
      <p class="tech-sheet-rank">${rankLine}</p>
      ${currencyHint}
      ${
        reqBits.length
          ? `<div class="tech-sheet-reqs"><span class="k">Requires</span>${reqBits.join("")}</div>`
          : ""
      }
      <div class="tech-sheet-actions">${action}</div>
    </div>
  </div>`;
  
}

export function buyTechNode(app, id) {
  const node = getTechNode(id);
  if (!node) return;
  const rank = techRank(app.meta, id);
  if (rank >= node.maxRank) return app.toast("Already maxed");
  if (!techRequiresMet(app.meta, node)) return app.toast("Locked — buy prior tech first");
  if (!techPartOwned(app.meta, node, ownsPart)) {
    const p = node.requiresPart;
    return app.toast(
      p ? `Unlock ${partLabel(p.id)} first` : "Unlock the required part first"
    );
  }
  const cost = techNextCost(node, rank);
  if (!canAffordTech(app.meta, cost)) {
    const need = formatTechCost(cost);
    return app.toast(`Need ${need}`);
  }
  spendTechCost(app.meta, cost);
  app.meta.tech = app.meta.tech || {};
  app.meta.tech[id] = rank + 1;
  syncTechDerived(app.meta);
  app.meta.roster = normalizeRoster(
    app.meta.roster,
    app.meta.slotCount,
    app.meta.levelCap
  );
  app.persistMeta();
  if (app.sim && (app.screen === "game" || app.screen === "hub" || app.screen === "upgrade")) {
    // Mid-meta upgrades must raise caps/slots on a continued run too.
    app._syncSimFromMeta(app.sim);
  }
  app.synth.play("confirm");
  app.status = `${node.name} → ${rank + 1}/${node.maxRank}`;
  app.techSelectedId = id;
  showUpgrade(app);
  
}

/** Unlock a Forge part from the tech overlay (no equip — stay on Tech Tree). */
export function unlockPartFromTech(app, kind, id) {
  if (ownsPart(app.meta.owned, kind, id)) {
    app.status = `Already own ${partLabel(id)}`;
    showUpgrade(app);
    return;
  }
  const cost = forgeCost(app, kind, id);
  if ((app.meta.forge | 0) < cost) {
    return app.toast(`Need ${cost} Forge parts`);
  }
  app.meta.forge -= cost;
  app.meta.forgeBuys = (app.meta.forgeBuys | 0) + 1;
  const key = kind === "base" ? "bases" : kind === "barrel" ? "barrels" : "payloads";
  if (!app.meta.owned[key]) app.meta.owned[key] = [];
  if (!app.meta.owned[key].includes(id)) app.meta.owned[key].push(id);
  app.persistMeta();
  app.synth.play("confirm");
  app.status = `Unlocked ${partLabel(id)} · buy mastery next`;
  showUpgrade(app);
  
}
