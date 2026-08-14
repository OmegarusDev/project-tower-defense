/**
 * Tech Tree logic — pure mutations over meta, no app/DOM.
 * Run: node js/tests/techLogic.test.mjs
 */
import { techBuyNode, techUnlockPart } from "../app/techLogic.js";
import { normalizeRoster } from "../data/parts.js";
import { syncTechDerived, getTechNode } from "../data/techTree.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function freshMeta(over = {}) {
  const meta = {
    aether: 500,
    forge: 500,
    forgeBuys: 0,
    slotCount: 3,
    levelCap: 1,
    owned: {
      bases: ["sentry"],
      barrels: ["single"],
      payloads: ["kinetic"],
    },
    roster: normalizeRoster([], 3, 1),
    tech: {},
    campaign: { cleared: [] },
  };
  syncTechDerived(meta);
  return { ...meta, ...over, owned: { ...meta.owned, ...(over.owned || {}) } };
}

// Buy: missing node
{
  const r = techBuyNode(freshMeta(), "nope");
  assert(!r.ok && r.reason === "missing", "missing node rejected");
}

// Buy: maxed
{
  const meta = freshMeta({ tech: { level_cap: 4 } });
  const r = techBuyNode(meta, "level_cap");
  assert(!r.ok && r.reason === "maxed", "maxed rejected");
}

// Buy: prereq not met (find a node whose requires are all unowned)
{
  const meta = freshMeta();
  const trees = await import("../data/techTree.js").then((m) => m.TECH_TREES);
  let gated = null;
  const walk = (n) => {
    if (!n || gated) return;
    if (n.kind !== "group" && n.kind !== "root" && (n.requires || []).length) { gated = n; return; }
    for (const c of n.children || []) walk(c);
  };
  for (const t of trees) walk(t);
  if (gated) {
    const r = techBuyNode(meta, gated.id);
    assert(!r.ok && r.reason === "prereq", `prereq gate (${gated.id})`);
  }
}

// Buy: a root node succeeds, credits tech + normalizes roster
{
  const meta = freshMeta();
  // find the first purchasable node (no requires)
  const walk = (n) => {
    if (!n) return null;
    if (n.kind !== "group" && n.kind !== "root" && !(n.requires || []).length) return n.id;
    for (const c of n.children || []) {
      const r = walk(c);
      if (r) return r;
    }
    return null;
  };
  const root = walk(getTechNode("roster_slots"));
  const r = techBuyNode(meta, root);
  assert(r.ok, `root node buys (${root})`);
  assert(meta.tech[root] === 1, "tech credited");
  assert((meta.aether | 0) < 500, "aether spent");
}

// Buy: part-gated node without the part
{
  const meta = freshMeta();
  // find a node that requiresPart
  let gated = null;
  const walk = (n) => {
    if (!n) return;
    if (n.requiresPart) { gated = n; return; }
    for (const c of n.children || []) walk(c);
  };
  const trees = await import("../data/techTree.js").then((m) => m.TECH_TREES);
  for (const t of trees) walk(t);
  if (gated) {
    const r = techBuyNode(meta, gated.id);
    assert(!r.ok && r.reason === "part", `part gate (${gated.id})`);
  }
}

// Buy: not affordable
{
  const meta = freshMeta({ aether: 1 });
  const r = techBuyNode(meta, "roster_slots");
  assert(!r.ok && r.reason === "need", "need aether");
}

// Unlock part: owned / need / success
{
  const meta = freshMeta();
  const r1 = techUnlockPart(meta, "base", "sentry");
  assert(!r1.ok && r1.reason === "owned", "owned rejected");
  const poor = freshMeta({ forge: 1 });
  const r2 = techUnlockPart(poor, "base", "bulwark");
  assert(!r2.ok && r2.reason === "need", "need forge");
  const r3 = techUnlockPart(meta, "base", "bulwark");
  assert(r3.ok && meta.owned.bases.includes("bulwark"), "bought");
  assert(meta.forgeBuys === 1, "forgeBuys counted");
}

console.log("ALL techLogic tests passed");
