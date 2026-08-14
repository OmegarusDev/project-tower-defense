/**
 * Screen registry renderers — the meta screens as PURE functions of an
 * explicit state object, transcribed EXACTLY from the oracle modules
 * (menuScreens / endScreens / forgeScreen / techScreen). Each returns the
 * same innerHTML the oracle writes; the DOM parity gate (uiParity.mjs)
 * compares them byte-identically. Pure helpers (threatTagsForLevel,
 * rosterPeekHtml, prepSlotButtonsHtml, partIcons, xClose) are reused as-is
 * — they never touch app.
 */
import { CAMPAIGN_LEVELS, isLevelUnlocked, getCampaignLevel } from "../../data/campaign.js";
import { WAVE_PACKS } from "../../data/waveScripts.js";
import { VIEW25 } from "../../view/view25.js";
import { buildAttackPlan } from "../../sim/attackPlan.js";
import {
  makeSlot,
  PARTS,
  forgeBuyCost,
  ownsPart,
  partLabel,
  doctrineLabel,
} from "../../data/parts.js";
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
  nextRosterSlotUnlock,
} from "../../data/techTree.js";
import { MAX_ROSTER_SLOTS } from "../../data/parts.js";
import { threatTagsForLevel, rosterPeekHtml, prepSlotButtonsHtml, endlessThemeBlurb } from "../metaUi.js";
import { xClose } from "../xClose.js";
import { partIconHtml, techCategoryIcon, techNodeIconHtml } from "../partIcons.js";

/** Mirror of menuScreens.forgePlanSummary — pure (same formulas). */
export function forgePlanSummary(slot) {
  if (!slot?.complete) return "Base · Barrel · Payload";
  const plan = buildAttackPlan(slot.base, slot.barrel, slot.payload, 1, {});
  return `${partLabel(slot.base)} · ${doctrineLabel(PARTS.bases[slot.base]?.doctrine)}<br/>${partLabel(
    slot.barrel
  )} + ${partLabel(slot.payload)} · ${slot.placeCost} Coin<br/><span style="color:var(--muted)">${
    plan.damageType
  } · r${plan.rangeCells.toFixed(1)} · ${plan.damage.toFixed(0)} dmg${
    plan.chainJumps ? ` · chain ${plan.chainJumps}` : ""
  }${plan.pulseRadius ? ` · pulse ${plan.pulseRadius.toFixed(1)}` : ""}</span>`;
}

/** Mirror of gameChrome.rosterSlotButtons — pure over state. */
export function rosterSlotButtonsHtml(state, mode) {
  const meta = state.meta;
  const unlocked = Math.max(0, Math.min(MAX_ROSTER_SLOTS, meta.slotCount | 0));
  const roster = mode === "game" ? state.roster || [] : meta.roster || [];
  const nextSlot = mode === "forge" ? nextRosterSlotUnlock(meta) : null;
  const bits = [];
  for (let i = 0; i < MAX_ROSTER_SLOTS; i++) {
    if (i >= unlocked) {
      if (mode === "game") {
        bits.push(
          `<button type="button" class="slot-tile locked" data-act="slot-locked:${i}" title="Unlock Slot ${
            i + 1
          } in Tech Tree → Roster"><span class="slot-tile-idx">${i + 1}</span><span class="slot-tile-cost">lock</span></button>`
        );
      } else if (mode === "forge" && nextSlot && i === nextSlot.nextSlotIndex) {
        const costLabel = formatTechCost(nextSlot.cost);
        const can = canAffordTech(meta, nextSlot.cost);
        const cls = `btn slot-locked slot-unlock${can ? "" : " cant-afford"}`.trim();
        bits.push(
          `<button type="button" class="${cls}" data-act="forge-unlock-slot" title="Unlock Slot ${
            i + 1
          } for ${costLabel}">S${i + 1} · ${costLabel}</button>`
        );
      } else {
        bits.push(
          `<button type="button" class="btn slot-locked" data-act="slot-locked:${i}" title="Unlock earlier slots first">S${i + 1}</button>`
        );
      }
      continue;
    }
    const s = roster[i] || makeSlot("", "", "", meta.levelCap);
    if (mode === "forge") {
      const active = i === state.forgeSlot ? "active" : "";
      const mark = s.complete ? s.placeCost : "—";
      bits.push(
        `<button type="button" class="btn ${active}" data-act="forge-slot:${i}">S${i + 1} · ${mark}</button>`
      );
    } else {
      const active = state.tool === "tower" && i === state.slot ? "active" : "";
      const q = gameSlotQuote(state, i);
      const empty = q.complete ? "" : " empty";
      bits.push(
        `<button type="button" class="slot-tile ${active}${empty}" data-act="slot:${i}" data-build-slot="${i}" title="${q.tip}"><span class="slot-tile-idx">${i + 1}</span><canvas class="slot-preview" data-slot-preview="${i}" width="72" height="72" aria-hidden="true"></canvas><span class="slot-tile-cost">${q.costLabel}</span></button>`
      );
    }
  }
  return bits.join("");
}

function gameSlotQuote(state, i) {
  const s = (state.roster || [])[i];
  if (!s?.complete) {
    return {
      complete: false,
      costLabel: "—",
      tip: "incomplete — set in Forge",
    };
  }
  const q = state.quote ? state.quote(i) : { total: s.placeCost, surcharge: 0 };
  const surcharge = q.surcharge | 0;
  return {
    complete: true,
    costLabel: `${q.total}`,
    tip: `${s.base}/${s.barrel}/${s.payload}${surcharge ? ` (+${surcharge} tax)` : ""}`,
  };
}

function forgePartBtnHtml(state, kind, id, slot) {
  const meta = state.meta;
  const have = ownsPart(meta.owned, kind, id);
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
  const cost = forgeBuyCost(kind, id, meta);
  const can = meta.forge >= cost;
  const cls = `btn part-btn part-chip locked ${can ? "" : "cant-afford"}`.trim();
  return `<button class="${cls}" data-act="buy:${kind}:${id}" title="${tip} — unlock for ${cost} Parts"><span class="part-btn-inner">${ico}<span class="part-btn-label">${partLabel(id)}${extra}<br/><span class="part-btn-cost">${cost} Parts</span></span></span></button>`;
}

function forgePartGridHtml(state, slot) {
  const col = (title, kind, ids) =>
    `<div><h4>${title}</h4>${ids.map((id) => forgePartBtnHtml(state, kind, id, slot)).join("")}</div>`;
  return `
    ${col("Base", "base", Object.keys(PARTS.bases))}
    ${col("Barrel", "barrel", Object.keys(PARTS.barrels))}
    ${col("Payload", "payload", Object.keys(PARTS.payloads))}`;
}

function techCollectBuyables(meta, node, out = []) {
  if (!node) return out;
  if (node.kind === "group" || node.kind === "root") {
    for (const c of node.children || []) techCollectBuyables(meta, c, out);
    return out;
  }
  out.push(node);
  for (const c of node.children || []) techCollectBuyables(meta, c, out);
  return out;
}

function techGroupProgress(meta, group) {
  const nodes = techCollectBuyables(meta, group);
  let ranks = 0;
  let max = 0;
  for (const n of nodes) {
    const def = getTechNode(n.id) || n;
    ranks += techRank(meta, def.id);
    max += def.maxRank | 0;
  }
  return { ranks, max, count: nodes.length };
}

function techTreeHtml(state, tree) {
  if (!tree) return "";
  const currency = tree.id === "arsenal" ? "Parts" : "Aether";
  const branches = (tree.children || [])
    .filter((c) => c.kind === "group")
    .map((g) => techBranchHtml(state, g))
    .join("");
  return `<div class="ttree" data-tree="${tree.id}">
    <p class="ttree-blurb">${tree.blurb || `Spend ${currency} on permanent upgrades`}</p>
    <div class="ttree-branches">${branches}</div>
  </div>`;
}

function techBranchHtml(state, group) {
  const { ranks, max } = techGroupProgress(state.meta, group);
  const kids = (group.children || []).map((c) => techNodeWrapHtml(state, c, group.id)).join("");
  const ico = techCategoryIcon(group.id);
  return `<section class="ttree-branch">
    <header class="ttree-branch-head">
      <h2 class="ttree-branch-title">${ico}<span>${group.name}</span></h2>
      <span>${ranks}/${max}</span>
    </header>
    <div class="ttree-children ttree-children--root">${kids}</div>
  </section>`;
}

function techNodeWrapHtml(state, node, groupId = "") {
  if (!node || node.kind === "group" || node.kind === "root") return "";
  const def = getTechNode(node.id) || node;
  const childHtml = (node.children || []).map((c) => techNodeWrapHtml(state, c, groupId)).join("");
  const kids =
    childHtml.length > 0
      ? `<div class="ttree-children">${childHtml}</div>`
      : "";
  return `<div class="ttree-node-wrap">${techNodeBtnHtml(state, def, groupId)}${kids}</div>`;
}

function techNodeBtnHtml(state, def, groupId = "") {
  const meta = state.meta;
  const rank = techRank(meta, def.id);
  const maxed = rank >= def.maxRank;
  const prereq = techRequiresMet(meta, def);
  const partOk = techPartOwned(meta, def, ownsPart);
  const cost = techNextCost(def, rank);
  const costLabel = formatTechCost(cost);
  const selected = state.techSelectedId === def.id ? " selected" : "";
  const arsenal = def.treeId === "arsenal";
  let state2 = "open";
  if (maxed) state2 = "maxed";
  else if (!prereq) state2 = "locked";
  else if (!partOk) state2 = "need-part";
  else if (!canAffordTech(meta, cost)) state2 = "cant";

  let meta2 = "";
  if (maxed) {
    meta2 = def.maxRank > 1 ? `${rank}/${def.maxRank}` : "Owned";
  } else if (!prereq) {
    meta2 = "Locked";
  } else if (!partOk && def.requiresPart) {
    const pc = forgeBuyCost(def.requiresPart.kind, def.requiresPart.id, meta);
    meta2 = pc > 0 ? `Unlock · ${pc} Parts` : "Unlock · Free";
  } else if (costLabel) {
    meta2 = def.maxRank > 1 ? `${rank}/${def.maxRank} · ${costLabel}` : costLabel;
  } else {
    meta2 = def.maxRank > 1 ? `${rank}/${def.maxRank}` : "—";
  }

  const kindHint = arsenal && def.partKind ? ` data-part-kind="${def.partKind}"` : "";
  const ico = techNodeIconHtml(def, groupId);
  return `<button type="button" class="ttree-node ${state2}${selected}" data-act="tech-select:${def.id}"${kindHint}>
    <span class="ttree-node-main">${ico}<span class="ttree-node-name">${def.name}</span></span>
    <span class="ttree-node-meta">${meta2}</span>
  </button>`;
}

function techOverlayHtml(state, id) {
  const def = getTechNode(id);
  if (!def) return "";
  const meta = state.meta;
  const rank = techRank(meta, def.id);
  const maxed = rank >= def.maxRank;
  const prereq = techRequiresMet(meta, def);
  const partOk = techPartOwned(meta, def, ownsPart);
  const cost = techNextCost(def, rank);
  const costLabel = formatTechCost(cost);
  const treeName = TECH_TREES.find((t) => t.id === def.treeId)?.name || def.treeId || "Tech";

  let reqBits = [];
  if (def.requires?.length) {
    for (const rid of def.requires) {
      const rnode = getTechNode(rid);
      const ok = techRank(meta, rid) >= 1;
      reqBits.push(
        `<span class="tech-req ${ok ? "ok" : "missing"}">${rnode?.name || rid}</span>`
      );
    }
  }
  if (def.requiresPart) {
    const kind = def.requiresPart.kind || "part";
    const ok = partOk;
    const partCost = forgeBuyCost(def.requiresPart.kind, def.requiresPart.id, meta);
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
    const partCost = forgeBuyCost(kind, partId, meta);
    const canBuyPart = (meta.forge | 0) >= partCost;
    const partLabelTxt = partLabel(partId);
    const unlockLabel =
      partCost > 0 ? `Unlock ${partLabelTxt} · ${partCost} Parts` : `Unlock ${partLabelTxt} · Free`;
    action = canBuyPart
      ? `<button class="btn title-cta" data-act="tech-unlock-part:${kind}:${partId}">${unlockLabel}</button>
         <p class="tech-sheet-next">Then buy mastery${costLabel ? ` · ${costLabel}` : ""}</p>`
      : `<button class="btn cant-afford" disabled>Need ${partCost} Parts for ${partLabelTxt}</button>
         <p class="tech-sheet-next">Earn Parts from waves, then unlock this piece</p>`;
  } else if (!canAffordTech(meta, cost)) {
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

// ---- Screen renderers -----------------------------------------------------

export function renderMain(state) {
  const meta = state.meta;
  return `
    <div class="screen title-screen meta-enter">
      <div class="frame-bolts" aria-hidden="true"></div>
      <header class="title-hero">
        <div class="title-crest" aria-hidden="true"><span></span><i></i><span></span></div>
        <p class="title-mark">Project</p>
        <h1 class="title-brand">
          <span class="title-brand-line">Tower</span>
          <span class="title-brand-line accent">Defense</span>
        </h1>
        <div class="title-rule" aria-hidden="true"></div>
        <p class="title-tag">Shape the path. Hold the Yard.</p>
      </header>
      <nav class="title-actions plate-frame" aria-label="Main menu">
        <button class="btn title-cta" data-act="endless">Endless</button>
        <button class="btn" data-act="campaign">Campaign</button>
        <button class="btn" data-act="forge-from-main">Forge</button>
        <button class="btn" data-act="upgrade">Tech Tree</button>
        <button class="btn secondary" data-act="editor">Editor</button>
        <button class="btn secondary" data-act="settings">Settings</button>
      </nav>
      <footer class="title-foot">
        <div class="title-stats" aria-label="Progress">
          <span><i>Æ</i>${meta.aether}</span>
          <span><i>Parts</i>${meta.forge}</span>
          <span><i>Best</i>W${meta.bestWave}</span>
        </div>
        <p class="title-credit">Bastion vs Slag Host</p>
      </footer>
    </div>`;
}

export function renderSettings(state) {
  const meta = state.meta;
  const pitch = meta.settings?.cameraPitch ?? VIEW25.pitchDeg;
  const vol = Math.round((meta.settings?.sfxVolume ?? 0.35) * 100);
  const musicVol = Math.round((meta.settings?.musicVolume ?? 0.4) * 100);
  return `
    <div class="screen scroll meta-screen meta-enter">
      <header class="meta-hero">
        <div class="meta-hero-row">
          <div>
            <h1>Settings</h1>
          </div>
          ${xClose("main")}
        </div>
      </header>
      <div class="settings-plate plate">
        <label class="set-row">
          <span>Colorblind palette</span>
          <input type="checkbox" id="cb" ${meta.settings?.colorblind ? "checked" : ""}/>
        </label>
        <label class="set-row">
          <span>Particles</span>
          <input type="checkbox" id="particles" ${meta.settings?.particles !== false ? "checked" : ""}/>
        </label>
        <label class="set-row">
          <span>Ambience</span>
          <input type="checkbox" id="music" ${meta.settings?.music !== false ? "checked" : ""}/>
        </label>
        <div class="set-block">
          <div class="set-head">
            <h3>Music</h3>
            <span id="musicVolLabel">${musicVol}%</span>
          </div>
          <input id="musicVol" type="range" min="0" max="100" step="1" value="${musicVol}" />
        </div>
        <div class="set-block">
          <div class="set-head">
            <h3>SFX</h3>
            <span id="sfxVolLabel">${vol}%</span>
          </div>
          <input id="sfxVol" type="range" min="0" max="100" step="1" value="${vol}" />
        </div>
        <div class="set-block">
          <div class="set-head">
            <h3>Camera</h3>
            <span id="pitchLabel">${Math.round(pitch)}°</span>
          </div>
          <input id="pitch" type="range" min="8" max="58" step="1" value="${pitch}" />
        </div>
<div class="set-block">
            <h3>Tech</h3>
            <p class="end-note" style="margin:0">Ranks are permanent — pick Foundations and Arsenal upgrades with care.</p>
          </div>
        <div class="set-block" style="border-top:1px solid rgba(200,130,60,0.25);padding-top:10px">
          <h3>Testing</h3>
          <button class="btn danger" data-act="reset-meta" style="width:100%">Reset Meta (wipe save)</button>
        </div>
      </div>
    </div>`;
}

export function renderCampaign(state) {
  const meta = state.meta;
  const cleared = meta.campaign?.cleared || [];
  const cardHtml = (lv) => {
    const open = isLevelUnlocked(lv.id, cleared);
    const done = cleared.includes(lv.id);
    const tags = threatTagsForLevel(lv, 4)
      .map((t) => `<span class="threat-tag" data-kind="${t.id}">${t.label}</span>`)
      .join("");
    return `<button type="button" class="level-card plate ${done ? "cleared" : ""} ${
      open ? "" : "locked"
    }" data-act="prep:${lv.id}" ${open ? "" : "disabled"}>
      <canvas class="level-thumb" data-level="${lv.id}" width="72" height="72" aria-hidden="true"></canvas>
      <div class="level-card-body">
        <div class="level-card-top">
          <strong>${lv.id}. ${lv.name}</strong>
          ${done ? `<span class="level-cleared">Cleared</span>` : ""}
        </div>
        <p class="level-meta">${lv.wavesToWin} waves · ${lv.cols}×${lv.rows} · ${lv.preWalls.length} walls</p>
        <div class="threat-row">${tags}</div>
      </div>
    </button>`;
  };
  // Group cards under act headers (Outskirts / Foundry / Deep Vein)
  const ACT_ORDER = ["Outskirts", "Foundry", "Deep Vein"];
  const acts = ACT_ORDER.map((act) => {
    const lvs = CAMPAIGN_LEVELS.filter((lv) => (lv.act || "Outskirts") === act);
    if (!lvs.length) return "";
    return `<h2 class="campaign-act">${act}</h2><div class="level-grid">${lvs.map(cardHtml).join("")}</div>`;
  }).join("");
  return `
    <div class="screen scroll meta-screen meta-enter">
      <header class="meta-hero">
        <div class="meta-hero-row">
          <div>
            <h1>Campaign</h1>
          </div>
          ${xClose("main")}
        </div>
        <p class="meta-blurb">Seal each Yard before the Claim walks it.</p>
        <div class="title-stats tech-stats">
          <span><i>Æ</i>${meta.aether}</span>
          <span><i>Parts</i>${meta.forge}</span>
          <span><i>Clear</i>${cleared.length}/${CAMPAIGN_LEVELS.length}</span>
        </div>
      </header>
      ${acts}
      <div class="screen-foot">
        <button class="btn" data-act="forge-from-campaign">Forge</button>
      </div>
    </div>`;
}

export function renderPrep(state) {
  const lv = getCampaignLevel(state.prepLevelId);
  if (!lv) return "";
  const meta = state.meta;
  const slot = meta.roster?.[state.prepSlot || 0];
  let planLine = "Complete a triad in Forge.";
  if (slot?.complete) {
    const plan = buildAttackPlan(slot.base, slot.barrel, slot.payload, 1, {});
    planLine = `${partLabel(slot.base)} (${doctrineLabel(PARTS.bases[slot.base]?.doctrine)}) · ${
      plan.damageType
    } · range ${plan.rangeCells.toFixed(1)} · ${(1 / plan.fireInterval).toFixed(2)}/s`;
  }
  const tags = threatTagsForLevel(lv, 6)
    .map((t) => `<span class="threat-tag" data-kind="${t.id}">${t.label}</span>`)
    .join("");
  return `
    <div class="screen scroll meta-screen meta-enter">
      <header class="meta-hero">
        <div class="meta-hero-row">
          <div>
            <h1>${lv.name}</h1>
          </div>
          ${xClose("campaign")}
        </div>
        <p class="meta-blurb">${lv.blurb}</p>
      </header>
      <div class="prep-layout">
        <canvas class="prep-thumb level-thumb" data-level="${lv.id}" width="120" height="120" aria-hidden="true"></canvas>
        <div class="end-card prep-card plate">
          <h3>Mission</h3>
          <p>${lv.wavesToWin} waves · ${lv.coinGrant} Coin · ${lv.preWalls.length} walls</p>
          <div class="threat-row" style="margin-top:10px;justify-content:flex-start">${tags}</div>
        </div>
      </div>
      <div class="end-card prep-card plate">
        <h3>Loadout</h3>
        ${rosterPeekHtml(meta)}
        <p class="end-note" style="margin-top:8px;text-align:left">${planLine}</p>
        ${prepSlotButtonsHtml(meta, state.prepSlot || 0)}
      </div>
      <div class="screen-foot">
        <button class="btn title-cta" data-act="start-level:${lv.id}">Start Level</button>
        <button class="btn" data-act="forge-from-prep">Forge</button>
        <button class="btn" data-act="upgrade-from-prep">Tech Tree</button>
      </div>
    </div>`;
}

export function renderHub(state) {
  const meta = state.meta;
  const blob = state.checkpoint;
  const canContinue = blob !== null;
  const best = meta.bestWave | 0;
  const themes = endlessThemeBlurb();
  return `
    <div class="screen scroll meta-screen hub-screen meta-enter">
      <header class="meta-hero">
        <div class="meta-hero-row">
          <div>
            <h1>Endless</h1>
          </div>
          ${xClose("main")}
        </div>
        <p class="meta-blurb">How far can the Bastion hold the Vein?</p>
      </header>
      <div class="hub-console">
        <div class="hub-card plate">
          <h3>Best wave</h3>
          <div class="hub-wave">${best || "—"}</div>
          <p class="end-note" style="text-align:left;margin-top:6px">${themes}</p>
          <div class="hub-stat-row title-stats">
            <span><i>Æ</i>${meta.aether}</span>
            <span><i>Parts</i>${meta.forge}</span>
          </div>
        </div>
        <div class="hub-card plate">
          <h3>${canContinue ? "Checkpoint" : "Ready"}</h3>
          <p style="text-align:left;color:var(--text);margin:0">
            ${
              canContinue
                ? `Wave <strong>${blob.wave}</strong> · seed ${blob.runSeed >>> 0}`
                : "No checkpoint. Start a run when your Forge is set."
            }
          </p>
        </div>
        <div class="screen-foot">
          <button class="btn title-cta" data-act="newrun">New Run</button>
          <button class="btn hub-continue" data-act="continue" ${canContinue ? "" : "disabled"}>Continue</button>
          <button class="btn" data-act="forge-from-hub">Forge</button>
        </div>
      </div>
    </div>`;
}

export function renderForge(state) {
  const meta = state.meta;
  const slot = meta.roster?.[state.forgeSlot || 0] || makeSlot();
  const backAct =
    state.forgeReturn === "hub"
      ? "hub"
      : state.forgeReturn === "campaign"
        ? "campaign"
        : state.forgeReturn === "prep"
          ? `prep:${state.prepLevelId || 1}`
          : "main";
  const slotBtns = rosterSlotButtonsHtml(state, "forge");
  return `
    <div class="screen meta-shell meta-screen forge-screen meta-enter">
      <header class="meta-hero">
        <div class="meta-hero-row">
          <div>
            <h1>Forge</h1>
          </div>
          ${xClose(backAct)}
        </div>
        <div class="title-stats tech-stats">
          <span><i>Parts</i>${meta.forge}</span>
          <span><i>Æ</i>${meta.aether}</span>
          <span><i>Cap</i>L${meta.levelCap}</span>
          <span><i>Slots</i>${meta.slotCount}</span>
        </div>
        <div class="status tech-status forge-status" id="status"${state.status ? "" : " hidden"}>${state.status || ""}</div>
      </header>
      <div class="meta-scroll">
        <div class="row build-strip">${slotBtns}</div>
        <div class="forge-preview-wrap">
          <canvas id="forgePreview" class="forge-preview-flash" width="160" height="160" aria-label="Tower preview"></canvas>
          <div class="forge-summary">
            <h3>Slot ${(state.forgeSlot || 0) + 1}</h3>
            <p id="forgeLoadout">${forgePlanSummary(slot)}</p>
            <button class="btn secondary part-chip" data-act="forge-clear" style="margin-top:8px">Clear slot</button>
          </div>
        </div>
        <div class="cols forge-part-grid">${forgePartGridHtml(state, slot)}</div>
        <p class="end-note">Locked parts cost Parts (price rises with each purchase). Wave gifts are free. Unlock slots with Æ here or in Tech.</p>
      </div>
      <footer class="meta-dock">
        <button class="btn warn" data-act="upgrade">Tech Tree</button>
      </footer>
    </div>`;
}

export function renderTech(state) {
  const meta = state.meta;
  const cash = BASE_START_CASH + (meta.startCashBonus | 0);
  const giftLine = `Best wave ${meta.bestWave || 0} · earn Parts in runs, unlock parts at the Forge`;
  const tabs = TECH_TREES.map((tree) => {
    const active = state.techTreeTab === tree.id ? "active" : "";
    return `<button type="button" class="ttree-tab ${active}" data-act="tech-tab:${tree.id}">${tree.name}</button>`;
  }).join("");
  const tree = TECH_TREES.find((t) => t.id === state.techTreeTab) || TECH_TREES[0];
  const overlay = state.techSelectedId ? techOverlayHtml(state, state.techSelectedId) : "";
  return `
    <div class="screen tech-screen meta-screen meta-enter">
      <header class="tech-hero">
        <div class="tech-hero-row">
          <div>
            <h1>Tech Tree</h1>
          </div>
          ${xClose(techBackAct(state))}
        </div>
        <div class="title-stats tech-stats" aria-label="Currencies">
          <span><i>Æ</i>${meta.aether}</span>
          <span><i>Parts</i>${meta.forge}</span>
          <span><i>Lvl Cap</i>L${meta.levelCap}</span>
          <span><i>Slots</i>${meta.slotCount}</span>
          <span><i>HP</i>${meta.startLives || BASE_START_LIVES}</span>
          <span><i>Coin</i>${cash}</span>
        </div>
        <div class="status tech-status" id="status">${state.status}</div>
        <div class="ttree-tabs" role="tablist">${tabs}</div>
      </header>
      <div class="tech-body" id="techBody">
        ${techTreeHtml(state, tree)}
        <p class="tech-gift">${giftLine}</p>
      </div>
      ${overlay}
    </div>`;
}

function techBackAct(state) {
  const r = state.upgradeReturn;
  if (r === "main") return "main";
  if (r === "hub") return "hub";
  if (r === "campaign") return "campaign";
  if (r === "prep") return `prep:${state.prepLevelId || 1}`;
  return "forge";
}

export function renderEditor(state) {
  const ed = state.editor;
  const saved = state.editorLevels || [];
  const scripts = Object.keys(WAVE_PACKS)
    .map((id) => `<option value="${id}" ${ed.waveScript === id ? "selected" : ""}>${id}</option>`)
    .join("");
  const cells = [];
  for (let y = 0; y < ed.rows; y++) {
    for (let x = 0; x < ed.cols; x++) {
      const wall = ed.walls.some((w) => w.x === x && w.y === y);
      const spawn = x === ed.grid.spawn.x && y === ed.grid.spawn.y;
      const exit = x === ed.grid.exit.x && y === ed.grid.exit.y;
      let cls = "ed-cell";
      if (wall) cls += " wall";
      if (spawn) cls += " spawn";
      if (exit) cls += " exit";
      cells.push(`<button type="button" class="${cls}" data-act="ed-cell:${x}:${y}"></button>`);
    }
  }
  return `
    <div class="screen scroll meta-screen meta-enter">
      <header class="meta-hero">
        <div class="meta-hero-row">
          <div>
            <h1>Editor</h1>
          </div>
          ${xClose("main")}
        </div>
      </header>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <label>Cols <input id="edCols" type="number" min="6" max="12" value="${ed.cols}" style="width:3.5em"/></label>
        <label>Rows <input id="edRows" type="number" min="6" max="16" value="${ed.rows}" style="width:3.5em"/></label>
        <label>Waves <input id="edWaves" type="number" min="3" max="12" value="${ed.wavesToWin}" style="width:3.5em"/></label>
        <label>Script <select id="edScript">${scripts}</select></label>
      </div>
      <input id="edName" type="text" value="${ed.name}" placeholder="Level name" style="width:100%;margin-bottom:8px"/>
      <div class="ed-grid" style="grid-template-columns:repeat(${ed.cols},minmax(0,1fr))">${cells.join("")}</div>
      <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn" data-act="ed-apply-size">Apply size</button>
        <button class="btn" data-act="ed-random">Random walls</button>
        <button class="btn" data-act="ed-save">Save local</button>
        <button class="btn title-cta" data-act="ed-playtest">Playtest</button>
      </div>
      <p class="end-note" style="margin-top:8px">${saved.length} saved custom level(s)</p>
      ${saved
        .slice(0, 6)
        .map(
          (lv, i) =>
            `<button class="btn secondary" data-act="ed-load:${i}" style="margin-top:4px">${lv.name}</button>`
        )
        .join("")}
    </div>`;
}
