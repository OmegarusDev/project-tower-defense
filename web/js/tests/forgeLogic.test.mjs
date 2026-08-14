/**
 * Forge logic — pure mutations over meta, no app/DOM.
 * Run: node js/tests/forgeLogic.test.mjs
 */
import {
  activeSlot,
  forgeApplyPart,
  forgeClearSlot,
  forgeUnlockSlot,
  forgeBuyPart,
} from "../app/forgeLogic.js";
import { makeSlot, normalizeRoster } from "../data/parts.js";
import { syncTechDerived } from "../data/techTree.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function freshMeta(over = {}) {
  const meta = {
    aether: 0,
    forge: 50,
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

// Equip an owned part completes a triad
{
  const meta = freshMeta();
  const r = forgeApplyPart(meta, 0, "barrel", "single");
  assert(r.ok && r.status.includes("set barrel"), "apply part ok");
  assert(meta.roster[0].barrel === "single", "barrel equipped");
  const r2 = forgeApplyPart(meta, 0, "payload", "kinetic");
  assert(meta.roster[0].complete === true, "triad completes");
  void r2;
}

// Clear slot empties the triad
{
  const meta = freshMeta();
  forgeApplyPart(meta, 0, "barrel", "single");
  forgeApplyPart(meta, 0, "payload", "kinetic");
  assert(meta.roster[0].complete, "complete before clear");
  const r = forgeClearSlot(meta, 0);
  assert(r.ok, "clear ok");
  assert(meta.roster[0].base === "" && !meta.roster[0].complete, "slot emptied");
}

// Unlock slot: order guard, affordability, tech credit
{
  const meta = freshMeta({ aether: 100 });
  const r = forgeUnlockSlot(meta, 5);
  assert(!r.ok && r.reason === "slot_order", "wrong-slot unlock rejected");
  const r2 = forgeUnlockSlot(meta, null);
  assert(r2.ok && r2.slotIndex === 3, `next slot unlock (got ${r2.slotIndex})`);
  assert(meta.slotCount === 4, "slotCount grows");
  assert((meta.aether | 0) < 100, "aether spent");
}

// Unlock slot: not affordable
{
  const meta = freshMeta({ aether: 0 });
  const r = forgeUnlockSlot(meta, null);
  assert(!r.ok && r.reason === "need", "need aether when broke");
}

// Unlock slot: everything already unlocked (roster tech maxed)
{
  const meta = freshMeta({ aether: 100, tech: { roster_slots: 9 } });
  const r = forgeUnlockSlot(meta, null);
  assert(!r.ok && r.reason === "all_unlocked", "all unlocked");
}

// Buy part: need / owned / equip paths
{
  const meta = freshMeta({ forge: 3 });
  const r1 = forgeBuyPart(meta, 0, "base", "bulwark", true);
  assert(!r1.ok && r1.reason === "need" && r1.need > 3, "need more forge");
  meta.forge = 500;
  const r2 = forgeBuyPart(meta, 0, "base", "bulwark", true);
  assert(r2.ok && meta.owned.bases.includes("bulwark"), "bought + owned");
  assert(meta.roster[0].base === "bulwark", "equipped onto slot");
  assert(meta.forgeBuys === 1, "forgeBuys counted");
  const r3 = forgeBuyPart(meta, 0, "base", "bulwark", false);
  assert(!r3.ok && r3.reason === "owned", "already owned");
  const r4 = forgeBuyPart(meta, 0, "barrel", "twin", false);
  assert(r4.ok && meta.roster[0].barrel !== "twin", "no equip when equip=false");
}

// activeSlot default + levelCap passthrough
{
  const meta = freshMeta();
  const s = activeSlot(meta, 1);
  assert(s.base === "" && s.levelCap === meta.levelCap, "default slot carries levelCap");
  void makeSlot;
}

console.log("ALL forgeLogic tests passed");
