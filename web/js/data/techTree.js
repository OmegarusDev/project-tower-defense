/**
 * Permanent tech trees — Foundations (Aether) + Arsenal (Parts mastery).
 * Source of truth: meta.tech[nodeId] = rank. Derived fields sync on normalize.
 *
 * Node kinds:
 *  - root / group: layout hubs (not purchasable)
 *  - (default): purchasable; children require the parent unless overridden
 *
 * Part mastery nodes set partId + key → meta.partUpgrades[partId][key].
 */

import { PARTS, partLabel } from "./parts.js";

const AE_CHAIN = (a, b, c) => [{ aether: a }, { aether: b }, { aether: c }];
const FG_CHAIN = (a, b, c) => [{ forge: a }, { forge: b }, { forge: c }];

function masteryBlurb(kind, id) {
  if (kind === "payload") {
    if (id === "kinetic") return "+12% damage / rank";
    if (id === "shock") return "Stronger arcs / rank";
    if (id === "frost") return "Deeper chill / rank";
    if (id === "pyro") return "Wilder burns / rank";
    if (id === "poison") return "Virulent brew / rank";
    if (id === "acid") return "Caustic shred / rank";
    return "Payload mastery / rank";
  }
  if (kind === "base") return "+8% damage & +4% range / rank for this base";
  if (kind === "barrel") return "+7% damage & +4% fire rate / rank for this barrel";
  return "Mastery / rank";
}

/** One mastery node per forge part (payload ids keep legacy tech ids). */
function partMastery(kind, id, { legacyId, forgeCosts, children } = {}) {
  const costs = forgeCosts || FG_CHAIN(10, 14, 20);
  const node = {
    id: legacyId || `${kind}_${id}_m`,
    name: partLabel(id),
    blurb: masteryBlurb(kind, id),
    maxRank: 3,
    costs,
    requiresPart: { kind, id },
    partId: id,
    partKind: kind,
    key: "power",
  };
  if (children) node.children = children;
  return node;
}

function arsenalGroup(kind, title) {
  const table = kind === "base" ? PARTS.bases : kind === "barrel" ? PARTS.barrels : PARTS.payloads;
  const kids = Object.keys(table).map((id) => {
    if (kind === "payload") {
      const legacy = {
        kinetic: "kinetic_edge",
        frost: "frost_chill",
        pyro: "pyro_burn",
        shock: "shock_power",
        poison: "poison_toxin",
        acid: "acid_corrode",
      };
      const node = partMastery("payload", id, {
        legacyId: legacy[id],
        forgeCosts: FG_CHAIN(8, 12, 18),
      });
      if (id === "shock") {
        node.children = [
          {
            id: "shock_chain",
            name: "Chain Leap",
            blurb: "+1 lightning jump / rank",
            maxRank: 3,
            costs: FG_CHAIN(14, 18, 24),
            requiresPart: { kind: "payload", id: "shock" },
            partId: "shock",
            partKind: "payload",
            key: "chain",
          },
        ];
      }
      return node;
    }
    return partMastery(kind, id, {
      forgeCosts: kind === "base" ? FG_CHAIN(10, 15, 22) : FG_CHAIN(9, 13, 19),
    });
  });
  return { kind: "group", id: `g_${kind}s`, name: title, children: kids };
}

export const TECH_TREES = [
  {
    kind: "root",
    id: "foundations",
    name: "Foundations",
    blurb: "Aether — roster, bastion, economy, and universal doctrine",
    children: [
      {
        kind: "group",
        id: "g_roster",
        name: "Roster",
        children: [
          {
            id: "cap3",
            name: "Cap III",
            blurb: "Towers reach level 3",
            maxRank: 1,
            costs: [{ aether: 20 }],
            children: [
              {
                id: "cap4",
                name: "Cap IV",
                blurb: "Towers reach level 4",
                maxRank: 1,
                costs: [{ aether: 40 }],
                children: [
                  {
                    id: "cap5",
                    name: "Cap V",
                    blurb: "Maximum tower growth",
                    maxRank: 1,
                    costs: [{ aether: 70 }],
                  },
                ],
              },
            ],
          },
          {
            id: "slot4",
            name: "4th Slot",
            blurb: "One more loadout",
            maxRank: 1,
            costs: [{ aether: 28 }],
            children: [
              {
                id: "slot5",
                name: "5th Slot",
                blurb: "Expand the roster",
                maxRank: 1,
                costs: [{ aether: 50 }],
                children: [
                  {
                    id: "slot6",
                    name: "6th Slot",
                    blurb: "Full field of comps",
                    maxRank: 1,
                    costs: [{ aether: 85 }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        kind: "group",
        id: "g_bastion",
        name: "Bastion",
        children: [
          {
            id: "lives",
            name: "Iron Guard",
            blurb: "+1 life / rank (from 3)",
            maxRank: 3,
            costs: AE_CHAIN(18, 32, 50),
          },
          {
            id: "cash",
            name: "War Chest",
            blurb: "+25 / +40 / +50 start Coin",
            maxRank: 3,
            costs: AE_CHAIN(15, 28, 48),
          },
        ],
      },
      {
        kind: "group",
        id: "g_economy",
        name: "Economy",
        children: [
          {
            id: "forge_cut",
            name: "Bargainer",
            blurb: "Tower place Coin −10% / −20% (not Forge unlocks)",
            maxRank: 2,
            costs: [{ aether: 22 }, { aether: 42 }],
          },
          {
            id: "wall_cut",
            name: "Mason",
            blurb: "Walls −10% / −20% Coin",
            maxRank: 2,
            costs: [{ aether: 16 }, { aether: 34 }],
          },
          {
            id: "wave_coin",
            name: "Spoils",
            blurb: "Clear +3 / +5 Coin",
            maxRank: 2,
            costs: [{ aether: 20 }, { aether: 38 }],
          },
        ],
      },
      {
        kind: "group",
        id: "g_doctrine",
        name: "Doctrine",
        children: [
          {
            id: "global_damage",
            name: "Sharpened Shot",
            blurb: "All towers +8% damage / rank",
            maxRank: 3,
            costs: AE_CHAIN(24, 40, 60),
          },
          {
            id: "global_range",
            name: "Long Sight",
            blurb: "All towers +6% range / rank",
            maxRank: 3,
            costs: AE_CHAIN(22, 38, 56),
          },
          {
            id: "global_rof",
            name: "Quick Hands",
            blurb: "All towers +6% fire rate / rank",
            maxRank: 3,
            costs: AE_CHAIN(22, 38, 56),
          },
        ],
      },
    ],
  },
  {
    kind: "root",
    id: "arsenal",
    name: "Arsenal",
    blurb: "Parts — mastery for every Forge piece you own",
    children: [
      arsenalGroup("base", "Bases"),
      arsenalGroup("barrel", "Barrels"),
      arsenalGroup("payload", "Payloads"),
    ],
  },
];

/** @deprecated alias */
export const TECH_BRANCHES = TECH_TREES;

const NODE_BY_ID = new Map();

function isHub(node) {
  return node?.kind === "root" || node?.kind === "group";
}

function walkTree(node, parentBuyableId, treeId, acc = []) {
  if (!node) return acc;
  if (isHub(node)) {
    for (const child of node.children || []) walkTree(child, parentBuyableId, treeId || node.id, acc);
    return acc;
  }
  const requires =
    Array.isArray(node.requires) && node.requires.length
      ? node.requires
      : parentBuyableId
        ? [parentBuyableId]
        : [];
  const flat = {
    ...node,
    requires,
    treeId: treeId || "foundations",
    children: undefined,
  };
  NODE_BY_ID.set(node.id, flat);
  acc.push(flat);
  for (const child of node.children || []) walkTree(child, node.id, treeId, acc);
  return acc;
}

for (const tree of TECH_TREES) walkTree(tree, null, tree.id);

export function getTechNode(id) {
  return NODE_BY_ID.get(id) || null;
}

export function allTechNodes() {
  return [...NODE_BY_ID.values()];
}

/** Migrate legacy fields / old tech ids into ranks. */
export function migrateTechRanks(rawMeta) {
  const tech = { ...(rawMeta?.tech && typeof rawMeta.tech === "object" ? rawMeta.tech : {}) };
  const bump = (id, rank) => {
    tech[id] = Math.max(tech[id] | 0, rank | 0);
  };

  // Old shock mastery id → power node
  if ((tech.shock_chain | 0) > 0 && !(tech.shock_power | 0)) {
    /* chain stays; power may be separate */
  }
  if ((tech.shock_edge | 0) > 0) bump("shock_power", tech.shock_edge | 0);

  const cap = rawMeta?.levelCap | 0;
  if (cap >= 3) bump("cap3", 1);
  if (cap >= 4) bump("cap4", 1);
  if (cap >= 5) bump("cap5", 1);

  const slots = rawMeta?.slotCount | 0;
  if (slots >= 4) bump("slot4", 1);
  if (slots >= 5) bump("slot5", 1);
  if (slots >= 6) bump("slot6", 1);

  const lives = rawMeta?.startLives | 0;
  if (lives > 3) bump("lives", Math.min(3, lives - 3));

  if ((rawMeta?.startCashBonus | 0) >= 25) bump("cash", 1);
  if ((rawMeta?.startCashBonus | 0) >= 65) bump("cash", 2);
  if ((rawMeta?.startCashBonus | 0) >= 115) bump("cash", 3);

  // Legacy forgeCostMult from old Bargainer → tower Coin discount ranks
  const fcm = Number(rawMeta?.forgeCostMult);
  if (fcm > 0 && fcm <= 0.85) bump("forge_cut", 2);
  else if (fcm > 0 && fcm <= 0.95) bump("forge_cut", 1);
  const tcm = Number(rawMeta?.towerCostMult);
  if (tcm > 0 && tcm <= 0.85) bump("forge_cut", 2);
  else if (tcm > 0 && tcm <= 0.95) bump("forge_cut", 1);

  const wcm = Number(rawMeta?.wallCostMult);
  if (wcm > 0 && wcm <= 0.85) bump("wall_cut", 2);
  else if (wcm > 0 && wcm <= 0.95) bump("wall_cut", 1);

  const wcb = rawMeta?.waveCoinBonus | 0;
  if (wcb >= 8) bump("wave_coin", 2);
  else if (wcb >= 3) bump("wave_coin", 1);

  const gD = Number(rawMeta?.globalDamageMult);
  if (gD >= 1.24) bump("global_damage", 3);
  else if (gD >= 1.16) bump("global_damage", 2);
  else if (gD >= 1.08) bump("global_damage", 1);

  const gR = Number(rawMeta?.globalRangeMult);
  if (gR >= 1.18) bump("global_range", 3);
  else if (gR >= 1.12) bump("global_range", 2);
  else if (gR >= 1.06) bump("global_range", 1);

  const gF = Number(rawMeta?.globalRofMult);
  if (gF >= 1.18) bump("global_rof", 3);
  else if (gF >= 1.12) bump("global_rof", 2);
  else if (gF >= 1.06) bump("global_rof", 1);

  const shockChain = rawMeta?.partUpgrades?.shock?.chain | 0;
  if (shockChain > 0) bump("shock_chain", Math.min(3, shockChain));

  // Old kinetic-style payload power rows
  for (const [pid, row] of Object.entries(rawMeta?.partUpgrades || {})) {
    if (!row || typeof row !== "object") continue;
    const power = row.power | 0;
    if (power <= 0) continue;
    const legacyMap = {
      kinetic: "kinetic_edge",
      frost: "frost_chill",
      pyro: "pyro_burn",
      poison: "poison_toxin",
      acid: "acid_corrode",
      shock: "shock_power",
    };
    const nid = legacyMap[pid] || `payload_${pid}_m`;
    if (NODE_BY_ID.has(nid)) bump(nid, Math.min(3, power));
    else if (NODE_BY_ID.has(`base_${pid}_m`)) bump(`base_${pid}_m`, Math.min(3, power));
    else if (NODE_BY_ID.has(`barrel_${pid}_m`)) bump(`barrel_${pid}_m`, Math.min(3, power));
  }

  for (const node of allTechNodes()) {
    const r = tech[node.id] | 0;
    if (r <= 0) {
      delete tech[node.id];
      continue;
    }
    tech[node.id] = Math.min(node.maxRank, r);
  }
  return tech;
}

/** Recompute derived meta fields from tech ranks. */
export function syncTechDerived(meta) {
  const tech = meta.tech || {};
  const rank = (id) => tech[id] | 0;

  let levelCap = 2;
  if (rank("cap5")) levelCap = 5;
  else if (rank("cap4")) levelCap = 4;
  else if (rank("cap3")) levelCap = 3;

  let slotCount = 3;
  if (rank("slot6")) slotCount = 6;
  else if (rank("slot5")) slotCount = 5;
  else if (rank("slot4")) slotCount = 4;

  const startLives = 3 + rank("lives");
  const cashRanks = rank("cash");
  const startCashBonus = (cashRanks >= 1 ? 25 : 0) + (cashRanks >= 2 ? 40 : 0) + (cashRanks >= 3 ? 50 : 0);

  // Bargainer: in-run tower Coin only — never Forge unlock prices
  const bargain = rank("forge_cut");
  const towerCostMult = bargain >= 2 ? 0.8 : bargain >= 1 ? 0.9 : 1;

  const wallCut = rank("wall_cut");
  const wallCostMult = wallCut >= 2 ? 0.8 : wallCut >= 1 ? 0.9 : 1;

  const spoils = rank("wave_coin");
  const waveCoinBonus = (spoils >= 1 ? 3 : 0) + (spoils >= 2 ? 5 : 0);

  const globalDamageMult = 1 + 0.08 * rank("global_damage");
  const globalRangeMult = 1 + 0.06 * rank("global_range");
  const globalRofMult = 1 + 0.06 * rank("global_rof");

  const partUpgrades = {};
  for (const node of allTechNodes()) {
    const partId = node.partId || node.payload;
    if (!partId || !node.key) continue;
    const r = rank(node.id);
    if (r <= 0) continue;
    partUpgrades[partId] = partUpgrades[partId] || {};
    const prev = partUpgrades[partId][node.key] | 0;
    partUpgrades[partId][node.key] = Math.max(prev, r);
  }

  meta.levelCap = levelCap;
  meta.slotCount = slotCount;
  meta.startLives = startLives;
  meta.startCashBonus = startCashBonus;
  meta.forgeCostMult = 1; // Forge unlocks never discounted
  meta.towerCostMult = towerCostMult;
  meta.wallCostMult = wallCostMult;
  meta.waveCoinBonus = waveCoinBonus;
  meta.globalDamageMult = globalDamageMult;
  meta.globalRangeMult = globalRangeMult;
  meta.globalRofMult = globalRofMult;
  meta.partUpgrades = partUpgrades;
  return meta;
}

export function techRank(meta, id) {
  return meta?.tech?.[id] | 0;
}

export function techRequiresMet(meta, node) {
  for (const req of node.requires || []) {
    if (techRank(meta, req) < 1) return false;
  }
  return true;
}

export function techPartOwned(meta, node, ownsPartFn) {
  if (!node.requiresPart) return true;
  return ownsPartFn(meta.owned, node.requiresPart.kind, node.requiresPart.id);
}

export function techNextCost(node, currentRank) {
  if (currentRank >= node.maxRank) return null;
  return node.costs[currentRank] || null;
}

export function formatTechCost(cost) {
  if (!cost) return "";
  const bits = [];
  if (cost.aether) bits.push(`${cost.aether} Æ`);
  if (cost.forge) bits.push(`${cost.forge} Parts`);
  return bits.join(" · ");
}

export function canAffordTech(meta, cost) {
  if (!cost) return false;
  if ((cost.aether | 0) > (meta.aether | 0)) return false;
  if ((cost.forge | 0) > (meta.forge | 0)) return false;
  return true;
}

export function spendTechCost(meta, cost) {
  meta.aether = (meta.aether | 0) - (cost.aether | 0);
  meta.forge = (meta.forge | 0) - (cost.forge | 0);
}

/** Default endless / campaign base Coin before War Chest bonus. */
export const BASE_START_CASH = 115;
