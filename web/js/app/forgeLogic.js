/**
 * Forge logic — PURE mutations over (meta, …). No app, no DOM, no synth.
 * Every action returns { ok, reason?, status? } — the app adapter turns
 * that into persist/sync/UI side effects. The old app-coupled functions
 * in ui/forgeScreen.js now delegate here; this file is directly testable.
 */
import {
  makeSlot,
  forgeBuyCost,
  ownsPart,
  normalizeRoster,
  partLabel,
} from "../data/parts.js";
import {
  syncTechDerived,
  nextRosterSlotUnlock,
  formatTechCost,
  canAffordTech,
  spendTechCost,
} from "../data/techTree.js";

/** The active slot of a forge session (normalized, defaults to an empty triad). */
export function activeSlot(meta, forgeSlot) {
  return meta.roster[forgeSlot] || makeSlot("", "", "", meta.levelCap);
}

/** Equip an owned part onto the active slot. */
export function forgeApplyPart(meta, forgeSlot, kind, id) {
  const s = activeSlot(meta, forgeSlot);
  s[kind] = id;
  meta.roster[forgeSlot] = makeSlot(s.base, s.barrel, s.payload, meta.levelCap);
  return { ok: true, status: `Slot ${forgeSlot + 1}: set ${kind}` };
}

/** Empty the active slot. */
export function forgeClearSlot(meta, forgeSlot) {
  meta.roster[forgeSlot] = makeSlot("", "", "", meta.levelCap);
  return { ok: true, status: `Slot ${forgeSlot + 1} cleared` };
}

/**
 * Unlock the next roster slot with Aether (same tech path as Roster Slots).
 * wantIndex guards "unlock the next one only" when called from the Forge UI.
 */
export function forgeUnlockSlot(meta, wantIndex) {
  const next = nextRosterSlotUnlock(meta);
  if (!next) return { ok: false, reason: "all_unlocked" };
  if (wantIndex != null && wantIndex !== next.nextSlotIndex) {
    return { ok: false, reason: "slot_order", need: `Unlock Slot ${next.nextSlotCount} first` };
  }
  if (!canAffordTech(meta, next.cost)) {
    return { ok: false, reason: "need", need: formatTechCost(next.cost) };
  }
  spendTechCost(meta, next.cost);
  meta.tech = meta.tech || {};
  meta.tech[next.node.id] = next.rank + 1;
  syncTechDerived(meta);
  meta.roster = normalizeRoster(meta.roster, meta.slotCount, meta.levelCap);
  return { ok: true, slotIndex: next.nextSlotIndex, status: `Unlocked slot ${next.nextSlotCount}` };
}

/**
 * Buy a part with Forge currency; optionally equip it onto the active slot.
 */
export function forgeBuyPart(meta, forgeSlot, kind, id, equip = true) {
  if (ownsPart(meta.owned, kind, id)) return { ok: false, reason: "owned", equip };
  const cost = forgeBuyCost(kind, id, meta);
  if (meta.forge < cost) return { ok: false, reason: "need", need: cost };
  meta.forge -= cost;
  meta.forgeBuys = (meta.forgeBuys | 0) + 1;
  const key = kind === "base" ? "bases" : kind === "barrel" ? "barrels" : "payloads";
  if (!meta.owned[key].includes(id)) meta.owned[key].push(id);
  if (equip) {
    const s = activeSlot(meta, forgeSlot);
    s[kind] = id;
    meta.roster[forgeSlot] = makeSlot(s.base, s.barrel, s.payload, meta.levelCap);
  }
  return { ok: true, status: `Unlocked ${partLabel(id)}${equip ? " · equipped" : ""}` };
}
