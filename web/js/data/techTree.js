/**
 * Permanent tech trees — visual forest of parent→child nodes.
 * Source of truth is meta.tech[nodeId] = rank. Derived fields sync on normalize.
 *
 * Node kinds:
 *  - root / group: layout hubs (not purchasable)
 *  - (default): purchasable tech; children require the parent unless overridden
 */

export const TECH_TREES = [
  {
    kind: "root",
    id: "foundations",
    name: "Foundations",
    blurb: "Aether — roster, bastion, and economy",
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
            costs: [{ aether: 18 }, { aether: 32 }, { aether: 50 }],
          },
          {
            id: "cash",
            name: "War Chest",
            blurb: "+25 / +40 / +50 start Coin",
            maxRank: 3,
            costs: [{ aether: 15 }, { aether: 28 }, { aether: 48 }],
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
            blurb: "Parts −10% / −20%",
            maxRank: 2,
            costs: [{ aether: 22 }, { aether: 42 }],
          },
          {
            id: "wall_cut",
            name: "Mason",
            blurb: "Walls −10% / −20%",
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
    ],
  },
  {
    kind: "root",
    id: "arsenal",
    name: "Arsenal",
    blurb: "Forge — payload mastery (own the payload first)",
    children: [
      {
        id: "kinetic_edge",
        name: "Kinetic",
        blurb: "+12% dmg / rank",
        maxRank: 3,
        costs: [{ forge: 8 }, { forge: 12 }, { forge: 18 }],
        requiresPart: { kind: "payload", id: "kinetic" },
        payload: "kinetic",
        key: "power",
      },
      {
        id: "frost_chill",
        name: "Frost",
        blurb: "Deeper chill",
        maxRank: 3,
        costs: [{ forge: 10 }, { forge: 14 }, { forge: 20 }],
        requiresPart: { kind: "payload", id: "frost" },
        payload: "frost",
        key: "power",
      },
      {
        id: "pyro_burn",
        name: "Pyro",
        blurb: "Wilder burns",
        maxRank: 3,
        costs: [{ forge: 12 }, { forge: 16 }, { forge: 22 }],
        requiresPart: { kind: "payload", id: "pyro" },
        payload: "pyro",
        key: "power",
      },
      {
        id: "shock_chain",
        name: "Shock",
        blurb: "+1 jump / rank",
        maxRank: 3,
        costs: [{ forge: 14 }, { forge: 18 }, { forge: 24 }],
        requiresPart: { kind: "payload", id: "shock" },
        payload: "shock",
        key: "chain",
      },
      {
        id: "poison_toxin",
        name: "Poison",
        blurb: "Virulent brew",
        maxRank: 3,
        costs: [{ forge: 12 }, { forge: 16 }, { forge: 22 }],
        requiresPart: { kind: "payload", id: "poison" },
        payload: "poison",
        key: "power",
      },
      {
        id: "acid_corrode",
        name: "Acid",
        blurb: "Caustic shred",
        maxRank: 3,
        costs: [{ forge: 12 }, { forge: 16 }, { forge: 22 }],
        requiresPart: { kind: "payload", id: "acid" },
        payload: "acid",
        key: "power",
      },
    ],
  },
];

/** @deprecated alias — some callers may still import the old name */
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

/** Migrate legacy levelCap / slot / lives / shock chain into tech ranks. */
export function migrateTechRanks(rawMeta) {
  const tech = { ...(rawMeta?.tech && typeof rawMeta.tech === "object" ? rawMeta.tech : {}) };
  const bump = (id, rank) => {
    tech[id] = Math.max(tech[id] | 0, rank | 0);
  };

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

  const fcm = Number(rawMeta?.forgeCostMult);
  if (fcm > 0 && fcm <= 0.85) bump("forge_cut", 2);
  else if (fcm > 0 && fcm <= 0.95) bump("forge_cut", 1);

  const wcm = Number(rawMeta?.wallCostMult);
  if (wcm > 0 && wcm <= 0.85) bump("wall_cut", 2);
  else if (wcm > 0 && wcm <= 0.95) bump("wall_cut", 1);

  const wcb = rawMeta?.waveCoinBonus | 0;
  if (wcb >= 8) bump("wave_coin", 2);
  else if (wcb >= 3) bump("wave_coin", 1);

  const shockChain = rawMeta?.partUpgrades?.shock?.chain | 0;
  if (shockChain > 0) bump("shock_chain", Math.min(3, shockChain));

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

  const forgeCut = rank("forge_cut");
  const forgeCostMult = forgeCut >= 2 ? 0.8 : forgeCut >= 1 ? 0.9 : 1;

  const wallCut = rank("wall_cut");
  const wallCostMult = wallCut >= 2 ? 0.8 : wallCut >= 1 ? 0.9 : 1;

  const spoils = rank("wave_coin");
  const waveCoinBonus = (spoils >= 1 ? 3 : 0) + (spoils >= 2 ? 5 : 0);

  const partUpgrades = {};
  for (const node of allTechNodes()) {
    if (!node.payload || !node.key) continue;
    const r = rank(node.id);
    if (r <= 0) continue;
    partUpgrades[node.payload] = partUpgrades[node.payload] || {};
    partUpgrades[node.payload][node.key] = r;
  }

  meta.levelCap = levelCap;
  meta.slotCount = slotCount;
  meta.startLives = startLives;
  meta.startCashBonus = startCashBonus;
  meta.forgeCostMult = forgeCostMult;
  meta.wallCostMult = wallCostMult;
  meta.waveCoinBonus = waveCoinBonus;
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
