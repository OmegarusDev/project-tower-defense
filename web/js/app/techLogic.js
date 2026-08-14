/**
 * Tech Tree logic — PURE mutations over (meta, …). No app, no DOM, no synth.
 * Same contract as forgeLogic: { ok, reason?, need?, status? }.
 */
import { ownsPart, normalizeRoster, partLabel } from "../data/parts.js";
import {
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
import { forgeBuyCost } from "../data/parts.js";

/** Buy one rank of a tech node. */
export function techBuyNode(meta, id) {
  const node = getTechNode(id);
  if (!node) return { ok: false, reason: "missing" };
  const rank = techRank(meta, id);
  if (rank >= node.maxRank) return { ok: false, reason: "maxed" };
  if (!techRequiresMet(meta, node)) return { ok: false, reason: "prereq" };
  if (!techPartOwned(meta, node, ownsPart)) {
    const p = node.requiresPart;
    return {
      ok: false,
      reason: "part",
      need: p ? partLabel(p.id) : "the required part",
    };
  }
  const cost = techNextCost(node, rank);
  if (!canAffordTech(meta, cost)) {
    return { ok: false, reason: "need", need: formatTechCost(cost) };
  }
  spendTechCost(meta, cost);
  meta.tech = meta.tech || {};
  meta.tech[id] = rank + 1;
  syncTechDerived(meta);
  meta.roster = normalizeRoster(meta.roster, meta.slotCount, meta.levelCap);
  return {
    ok: true,
    name: node.name,
    rank: rank + 1,
    maxRank: node.maxRank,
    status: `${node.name} → ${rank + 1}/${node.maxRank}`,
  };
}

/** Unlock a Forge part from the tech overlay (no equip — stay on Tech Tree). */
export function techUnlockPart(meta, kind, id) {
  if (ownsPart(meta.owned, kind, id)) {
    return { ok: false, reason: "owned", status: `Already own ${partLabel(id)}` };
  }
  const cost = forgeBuyCost(kind, id, meta);
  if ((meta.forge | 0) < cost) return { ok: false, reason: "need", need: cost };
  meta.forge -= cost;
  meta.forgeBuys = (meta.forgeBuys | 0) + 1;
  const key = kind === "base" ? "bases" : kind === "barrel" ? "barrels" : "payloads";
  if (!meta.owned[key]) meta.owned[key] = [];
  if (!meta.owned[key].includes(id)) meta.owned[key].push(id);
  return { ok: true, status: `Unlocked ${partLabel(id)} · buy mastery next` };
}
