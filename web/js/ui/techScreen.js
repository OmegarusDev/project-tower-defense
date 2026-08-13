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
import { xClose } from "./xClose.js";
import { techCategoryIcon, techNodeIconHtml } from "./partIcons.js";

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
  const cash = BASE_START_CASH + (app.meta.startCashBonus | 0);
  const giftLine = `Best wave ${app.meta.bestWave || 0} · earn Parts in runs, unlock parts at the Forge`;
  const tabs = TECH_TREES.map((tree) => {
    const active = app.techTreeTab === tree.id ? "active" : "";
    return `<button type="button" class="ttree-tab ${active}" data-act="tech-tab:${tree.id}">${tree.name}</button>`;
  }).join("");
  const tree = TECH_TREES.find((t) => t.id === app.techTreeTab) || TECH_TREES[0];
  const overlay = app.techSelectedId ? techOverlayHtml(app, app.techSelectedId) : "";
  app.ui.innerHTML = `
    <div class="screen tech-screen meta-screen meta-enter">
      <header class="tech-hero">
        <div class="tech-hero-row">
          <div>
            <h1>Tech Tree</h1>
          </div>
          ${xClose(backAct)}
        </div>
        <div class="title-stats tech-stats" aria-label="Currencies">
          <span><i>Æ</i>${app.meta.aether}</span>
          <span><i>Parts</i>${app.meta.forge}</span>
          <span><i>Lvl Cap</i>L${app.meta.levelCap}</span>
          <span><i>Slots</i>${app.meta.slotCount}</span>
          <span><i>HP</i>${app.meta.startLives || BASE_START_LIVES}</span>
          <span><i>Coin</i>${cash}</span>
        </div>
        <div class="status tech-status" id="status">${app.status}</div>
        <div class="ttree-tabs" role="tablist">${tabs}</div>
      </header>
      <div class="tech-body" id="techBody">
        ${techTreeHtml(app, tree)}
        <p class="tech-gift">${giftLine}</p>
      </div>
      ${overlay}
    </div>`;
  app.bindUi();
}

/** Flat list of purchasable nodes under a group (preserves child nesting). */
function techCollectBuyables(app, node, out = []) {
  if (!node) return out;
  if (node.kind === "group" || node.kind === "root") {
    for (const c of node.children || []) techCollectBuyables(app, c, out);
    return out;
  }
  out.push(node);
  for (const c of node.children || []) techCollectBuyables(app, c, out);
  return out;
  
}

function techGroupProgress(app, group) {
  const nodes = techCollectBuyables(app, group);
  let ranks = 0;
  let max = 0;
  for (const n of nodes) {
    const def = getTechNode(n.id) || n;
    ranks += techRank(app.meta, def.id);
    max += def.maxRank | 0;
  }
  return { ranks, max, count: nodes.length };
  
}

function techTreeHtml(app, tree) {
  if (!tree) return "";
  const currency = tree.id === "arsenal" ? "Parts" : "Aether";
  const branches = (tree.children || [])
    .filter((c) => c.kind === "group")
    .map((g) => techBranchHtml(app, g))
    .join("");
  return `<div class="ttree" data-tree="${tree.id}">
    <p class="ttree-blurb">${tree.blurb || `Spend ${currency} on permanent upgrades`}</p>
    <div class="ttree-branches">${branches}</div>
  </div>`;
  
}

function techBranchHtml(app, group) {
  const { ranks, max } = techGroupProgress(app, group);
  const kids = (group.children || []).map((c) => techNodeWrapHtml(app, c, group.id)).join("");
  const ico = techCategoryIcon(group.id);
  return `<section class="ttree-branch">
    <header class="ttree-branch-head">
      <h2 class="ttree-branch-title">${ico}<span>${group.name}</span></h2>
      <span>${ranks}/${max}</span>
    </header>
    <div class="ttree-children ttree-children--root">${kids}</div>
  </section>`;
}

function techNodeWrapHtml(app, node, groupId = "") {
  if (!node || node.kind === "group" || node.kind === "root") return "";
  const def = getTechNode(node.id) || node;
  const childHtml = (node.children || []).map((c) => techNodeWrapHtml(app, c, groupId)).join("");
  const kids =
    childHtml.length > 0
      ? `<div class="ttree-children">${childHtml}</div>`
      : "";
  return `<div class="ttree-node-wrap">${techNodeBtnHtml(app, def, groupId)}${kids}</div>`;
}

function techNodeBtnHtml(app, def, groupId = "") {
  const rank = techRank(app.meta, def.id);
  const maxed = rank >= def.maxRank;
  const prereq = techRequiresMet(app.meta, def);
  const partOk = techPartOwned(app.meta, def, ownsPart);
  const cost = techNextCost(def, rank);
  const costLabel = formatTechCost(cost);
  const selected = app.techSelectedId === def.id ? " selected" : "";
  const arsenal = def.treeId === "arsenal";
  let state = "open";
  if (maxed) state = "maxed";
  else if (!prereq) state = "locked";
  else if (!partOk) state = "need-part";
  else if (!canAffordTech(app.meta, cost)) state = "cant";

  let meta = "";
  if (maxed) {
    meta = def.maxRank > 1 ? `${rank}/${def.maxRank}` : "Owned";
  } else if (!prereq) {
    meta = "Locked";
  } else if (!partOk && def.requiresPart) {
    const pc = forgeCost(app, def.requiresPart.kind, def.requiresPart.id);
    meta = pc > 0 ? `Unlock · ${pc} Parts` : "Unlock · Free";
  } else if (costLabel) {
    meta = def.maxRank > 1 ? `${rank}/${def.maxRank} · ${costLabel}` : costLabel;
  } else {
    meta = def.maxRank > 1 ? `${rank}/${def.maxRank}` : "—";
  }

  const kindHint = arsenal && def.partKind ? ` data-part-kind="${def.partKind}"` : "";
  const ico = techNodeIconHtml(def, groupId);
  return `<button type="button" class="ttree-node ${state}${selected}" data-act="tech-select:${def.id}"${kindHint}>
    <span class="ttree-node-main">${ico}<span class="ttree-node-name">${def.name}</span></span>
    <span class="ttree-node-meta">${meta}</span>
  </button>`;
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
    body.innerHTML = `${techTreeHtml(app, tree)}
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
