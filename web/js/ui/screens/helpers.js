/**
 * Shared screen HTML helpers — pure functions of explicit state.
 */
import { buildAttackPlan } from "../../sim/attackPlan.js";
import {
  makeSlot,
  PARTS,
  forgeBuyCost,
  ownsPart,
  partLabel,
  doctrineLabel,
  MAX_ROSTER_SLOTS,
} from "../../data/parts.js";
import {
  TECH_TREES,
  getTechNode,
  techRank,
  techRequiresMet,
  techPartOwned,
  techNextCost,
  formatTechCost,
  canAffordTech,
  nextRosterSlotUnlock,
} from "../../data/techTree.js";
import { partIconHtml, techCategoryIcon, techNodeIconHtml } from "../partIcons.js";

export const VERSION = "0.5.0";
export const VERSION_NAME = "Tempered";

/**
 * Escape user-authored text for HTML interpolation (attribute-safe).
 * Editor level names persist to localStorage and re-render into innerHTML —
 * without this, a name like `<img src=x onerror=…>` executes on repaint.
 */
export function esc(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Loadout blurb for Forge / live compose — pure (same formulas). */
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

/** Compact single-line summary for forge carousel cards. */
export function forgePlanSummaryCompact(slot) {
  if (!slot?.complete) return "Base · Barrel · Payload";
  return `${partLabel(slot.base)} / ${partLabel(slot.barrel)} / ${partLabel(slot.payload)} · ${slot.placeCost} Coin`;
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
  const q = state.quotes?.[i] || { total: s.placeCost, surcharge: 0 };
  const surcharge = q.surcharge | 0;
  return {
    complete: true,
    costLabel: `${q.total}`,
    tip: `${s.base}/${s.barrel}/${s.payload}${surcharge ? ` (+${surcharge} part tax)` : ""}`,
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

export function forgePartGridHtml(state, slot) {
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

export function techTreeHtml(state, tree) {
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

export function techOverlayHtml(state, id) {
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
    action = `<button class="btn title-cta" disabled>Maxed · ${rank}/${def.maxRank}</button>`;
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
      ? `<button class="btn title-cta" data-act="tech-unlock-part:${kind}:${partId}">${unlockLabel}</button>`
      : `<button class="btn cant-afford" disabled>Need ${partCost} Parts for ${partLabelTxt}</button>`;
  } else if (!canAffordTech(meta, cost)) {
    action = `<button class="btn cant-afford" disabled>Need ${costLabel}</button>`;
  } else {
    const buyVerb = def.maxRank > 1 ? `Level Up · ${costLabel}` : `Unlock · ${costLabel}`;
    action = `<button class="btn title-cta" data-act="tech-buy:${def.id}">${buyVerb}</button>`;
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

  const nextRankHint = !maxed && def.maxRank > 1 && rank < def.maxRank
    ? `<p class="tech-sheet-next-rank">${def.blurb || ""}</p>`
    : "";

  return `<div class="tech-overlay">
    <button type="button" class="tech-backdrop" data-act="tech-close" aria-label="Dismiss"></button>
    <div class="tech-sheet" role="dialog" aria-modal="true" aria-labelledby="tech-sheet-title">
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
      <div class="tech-sheet-actions">
        ${action}
        <button type="button" class="btn secondary" data-act="tech-close">Back</button>
      </div>
    </div>
  </div>`;
}

/**
 * Forge stat bars — DMG / ROF / RNG normalized against fixed caps.
 * plan may be null (empty slot) → zeroed bars with — values.
 */
export function forgeStatBars(plan) {
  const bars = [
    { k: "DMG", v: plan ? plan.damage : 0, cap: 60, f: 0 },
    { k: "ROF", v: plan && plan.fireInterval ? 1 / plan.fireInterval : 0, cap: 5, f: 2 },
    { k: "RNG", v: plan ? plan.rangeCells : 0, cap: 8, f: 1 },
  ];
  return `<div class="stat-bars">${bars
    .map((b) => {
      const pct = Math.max(0, Math.min(1, b.v / b.cap)) * 100;
      const val = b.v > 0 ? (b.f === 0 ? Math.round(b.v) : b.v.toFixed(b.f)) : "—";
      return `<div class="stat-bar"><span class="stat-bar-k">${b.k}</span><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%"></div></div><span class="stat-bar-v">${val}</span></div>`;
    })
    .join("")}</div>`;
}

/** The preview card: canvas + slot line + compact stats + clear. */
function buildForgeSlotCard(state, idx, total) {
  const slot = state.meta.roster?.[idx] || makeSlot();
  const plan = slot?.complete
    ? buildAttackPlan(slot.base, slot.barrel, slot.payload, 1, {})
    : null;
  const active = idx === state.forgeSlot ? "active" : "";
  return `
    <div class="forge-slot-card ${active}" data-slot="${idx}" data-act="forge-slot:${idx}">
      <canvas class="forge-preview-flash" width="120" height="120" aria-label="Tower preview"></canvas>
      <div class="forge-summary">
        <h3>Slot ${idx + 1} / ${total}</h3>
        ${forgeStatBars(plan)}
        <p id="forgeLoadout" class="forge-loadout-compact">${forgePlanSummaryCompact(slot)}</p>
      </div>
    </div>`;
}

export function forgePreviewCard(state, total) {
  const slotCount = state.meta.slotCount | 0;
  const maxSlots = state.maxSlots || MAX_ROSTER_SLOTS;
  const canUnlock = slotCount < maxSlots;
  const cards = [];
  for (let i = 0; i < slotCount; i++) {
    cards.push(buildForgeSlotCard(state, i, total));
  }
  // Add unlock slot tile at the end if slots remain
  if (canUnlock) {
    const unlock = state.nextUnlock;
    cards.push(`
      <div class="forge-slot-card unlock-card" data-slot="${slotCount}" data-act="forge-unlock-slot">
        <div class="forge-unlock-content">
          <p class="forge-unlock-k">Slot ${slotCount + 1} / ${total}</p>
          <h3>Unlock Slot ${slotCount + 1}?</h3>
          <p class="forge-unlock-cost">${unlock ? formatTechCost(unlock.cost) : "—"}</p>
          <button class="btn title-cta" data-act="forge-unlock-slot" ${unlock ? "" : "disabled"}>Unlock</button>
        </div>
      </div>`);
  }
  return cards.join("");
}

/** The unlock card: shown at the end of the slot cycle while slots remain. */
export function forgeUnlockCard(state, total) {
  const slotCount = state.meta.slotCount | 0;
  const unlock = state.nextUnlock;
  return `
    <div class="forge-slot-card unlock-card forge-slot-${slotCount}" data-slot="${slotCount}" data-act="forge-unlock-slot">
      <div class="forge-unlock-content">
        <p class="forge-unlock-k">Slot ${slotCount + 1} / ${total}</p>
        <h3>Unlock Slot ${slotCount + 1}?</h3>
        <p class="forge-unlock-cost">${unlock ? formatTechCost(unlock.cost) : "—"}</p>
        <button class="btn title-cta" data-act="forge-unlock-slot" ${unlock ? "" : "disabled"}>Unlock</button>
      </div>
    </div>`;
}

export function techBackAct(state) {
  const r = state.upgradeReturn;
  if (r === "main") return "main";
  if (r === "hub") return "hub";
  if (r === "campaign") return "campaign";
  if (r === "prep") return `prep:${state.prepLevelId || 1}`;
  return "forge";
}

/** Vault chips — match in-run telemetry (gear / Æ); Gains keep full words. */
export function vaultChipsHtml(meta, bestWave = null) {
  const gear = `<svg class="tel-ico chip-ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.4.9h3.2l.25 1.45c.45.12.87.32 1.25.58l1.3-.7 1.6 1.6-.7 1.3c.26.38.46.8.58 1.25L15.1 6.4v3.2l-1.45.25a4.6 4.6 0 0 1-.58 1.25l.7 1.3-1.6 1.6-1.3-.7a4.6 4.6 0 0 1-1.25.58L9.6 15.1H6.4l-.25-1.45a4.6 4.6 0 0 1-1.25-.58l-1.3.7-1.6-1.6.7-1.3a4.6 4.6 0 0 1-.58-1.25L.9 9.6V6.4l1.45-.25c.12-.45.32-.87.58-1.25l-.7-1.3 1.6-1.6 1.3.7c.38-.26.8-.46 1.25-.58L6.4.9zm1.6 4.3a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z"/></svg>`;
  const best =
    bestWave == null
      ? ""
      : `<span class="chip wave" title="Best wave"><span class="k">Best</span><span class="chip-v">W${bestWave}</span></span>`;
  return `
    <span class="chip parts" title="Parts"><i class="chip-ico-wrap tel-gear">${gear}</i><span class="chip-v">${meta.forge}</span></span>
    <span class="chip aether" title="Aether"><i class="k">Æ</i><span class="chip-v">${meta.aether}</span></span>
    ${best}`;
}
