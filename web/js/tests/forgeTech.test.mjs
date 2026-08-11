/**
 * Forge pricing + Iron Guard / roster tech sync.
 * Run: node js/tests/forgeTech.test.mjs
 */
import { forgeBuyCost, PARTS } from "../data/parts.js";
import {
  migrateTechRanks,
  syncTechDerived,
  livesFromIronGuardRank,
  IRON_GUARD_LIVES,
  nextRosterSlotUnlock,
  getTechNode,
} from "../data/techTree.js";
import { normalizeMeta } from "../saveStore.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

{
  assert(PARTS.bases.sentry.fireInterval > 1.0, "sentry slower ROF");
  assert(PARTS.bases.bulwark.fireInterval < 0.65, "bulwark higher ROF");
  assert(PARTS.bases.bulwark.range < 2.4, "bulwark lower range");
}

{
  assert(forgeBuyCost("barrel", "twin", { forgeBuys: 0 }) === 5, "first twin unlock ~5");
  assert(forgeBuyCost("barrel", "twin", { forgeBuys: 1 }) === 9, "escalates +4");
  assert(forgeBuyCost("base", "sentry", { forgeBuys: 99 }) === 0, "starters stay free");
}

{
  assert(livesFromIronGuardRank(0) === 3, "base 3 lives");
  assert(IRON_GUARD_LIVES.join(",") === "3,5,7,10,15,20,25", "life ladder");
  const meta = { tech: {}, owned: { bases: ["sentry"], barrels: ["single"], payloads: ["kinetic"] } };
  syncTechDerived(meta);
  assert(meta.startLives === 3, "sync base lives 3");
  meta.tech.lives = 3;
  syncTechDerived(meta);
  assert(meta.startLives === 10, "rank 3 → 10 lives");
  meta.tech.lives = 6;
  syncTechDerived(meta);
  assert(meta.startLives === 25, "rank 6 → 25 lives");
}

{
  assert(getTechNode("level_cap")?.maxRank === 4, "level cap to L5");
  assert(getTechNode("roster_slots")?.maxRank === 9, "slots to 12");
  assert(!getTechNode("cap3"), "legacy cap3 removed");
  assert(!getTechNode("slot4"), "legacy slot4 removed");

  const meta = { tech: {}, aether: 100, forge: 0 };
  syncTechDerived(meta);
  assert(meta.levelCap === 1, "base level cap 1");
  const next = nextRosterSlotUnlock(meta);
  assert(next?.nextSlotCount === 4, "next unlock is 4th slot");
  assert(next?.cost?.aether === 28, "slot cost matches tech");
}

{
  const tech = migrateTechRanks({ tech: { cap3: 1, cap4: 1, slot4: 1 }, levelCap: 4, slotCount: 4, startLives: 5 });
  assert(tech.level_cap === 3, "migrates nested caps to rank 3 (L4)");
  assert(tech.roster_slots === 1, "migrates nested slots");
  assert(tech.lives === 1, "preserves 5 lives as Iron Guard rank 1");
}

{
  const n = normalizeMeta({ startLives: 3, tech: { lives: 6 } });
  assert(n.startLives === 25, "clamp allows 25");
  assert(n.startLives >= 3 && n.startLives <= 25, "lives clamp 3–25");
}

{
  assert(getTechNode("base_sentry_range")?.key === "range", "arsenal base range");
  assert(getTechNode("barrel_single_rof")?.key === "rof", "arsenal barrel ROF");
  assert(getTechNode("base_sentry_range")?.requiresPart?.id === "sentry", "range requires part");
}

console.log("ALL forgeTech tests passed");
