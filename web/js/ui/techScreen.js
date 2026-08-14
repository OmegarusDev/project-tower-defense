/** Extracted from App — pure move, no gameplay changes. */
import { TECH_TREES, getTechNode } from "../data/techTree.js";
import { techBuyNode, techUnlockPart } from "../app/techLogic.js";
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

export function buyTechNode(app, id) {
  const r = techBuyNode(app.meta, id);
  if (!r.ok) {
    const msg =
      r.reason === "maxed"
        ? "Already maxed"
        : r.reason === "prereq"
          ? "Locked — buy prior tech first"
          : r.reason === "part"
            ? `Unlock ${r.need} first`
            : r.reason === "need"
              ? `Need ${r.need}`
              : "Unknown tech";
    return app.toast(msg);
  }
  app.persistMeta();
  if (app.sim && (app.screen === "game" || app.screen === "hub" || app.screen === "upgrade")) {
    // Mid-meta upgrades must raise caps/slots on a continued run too.
    app._syncSimFromMeta(app.sim);
  }
  app.synth.play("confirm");
  app.status = r.status;
  app.techSelectedId = id;
  showUpgrade(app);
  
}

/** Unlock a Forge part from the tech overlay (no equip — stay on Tech Tree). */
export function unlockPartFromTech(app, kind, id) {
  const r = techUnlockPart(app.meta, kind, id);
  if (!r.ok) {
    if (r.reason === "owned") {
      app.status = r.status;
      showUpgrade(app);
      return;
    }
    return app.toast(`Need ${r.need} Forge parts`);
  }
  app.persistMeta();
  app.synth.play("confirm");
  app.status = r.status;
  showUpgrade(app);
  
}
