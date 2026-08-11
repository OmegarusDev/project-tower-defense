/**
 * Composition axes (orthogonal):
 *   Base    = envelope + targeting doctrine (+ light innate)
 *   Barrel  = delivery geometry (how force leaves)
 *   Payload = element only (what contact does)
 *
 * `cost` = Coin place contribution
 * `forgeCost` = Forge parts to unlock (0 = starter / wave-gift)
 */

export const PARTS = {
  bases: {
    sentry: {
      range: 3.2,
      fireInterval: 1.15,
      doctrine: "first",
      levelBias: "balanced",
      cost: 12,
      forgeCost: 0,
      blurb: "Lane clearer — shoots first on the path",
    },
    bulwark: {
      range: 2.15,
      fireInterval: 0.55,
      doctrine: "closest",
      pointBlankMult: 1.2,
      pointBlankRange: 1.25,
      levelBias: "rof",
      cost: 18,
      forgeCost: 5,
      blurb: "Point defense — always the nearest threat",
    },
    spire: {
      range: 5.2,
      fireInterval: 1.45,
      doctrine: "strongest",
      levelBias: "range",
      cost: 26,
      forgeCost: 10,
      blurb: "Elite hunter — prioritizes highest HP",
    },
    aerie: {
      range: 3.4,
      fireInterval: 1.0,
      doctrine: "flying",
      airDamageMult: 1.25,
      levelBias: "balanced",
      cost: 22,
      forgeCost: 8,
      blurb: "Air wing — flying first, then path tip",
    },
    warden: {
      range: 3.5,
      fireInterval: 1.05,
      doctrine: "last",
      levelBias: "balanced",
      cost: 20,
      forgeCost: 6,
      blurb: "Exit guard — last on the path (leak watch)",
    },
    talon: {
      range: 3.0,
      fireInterval: 0.9,
      doctrine: "weakest",
      executeMult: 1.3,
      executeThreshold: 0.4,
      levelBias: "rof",
      cost: 20,
      forgeCost: 7,
      blurb: "Finisher — lowest HP, bonus vs wounded",
    },
  },
  barrels: {
    single: { pattern: "projectile", count: 1, speed: 9, cost: 5, forgeCost: 0, blurb: "One clean shot" },
    twin: {
      pattern: "projectile",
      count: 1,
      alternating: true,
      rofMult: 1.35,
      speed: 9,
      cost: 10,
      forgeCost: 5,
      blurb: "Alternating dual tubes",
    },
    scatter: {
      pattern: "projectile",
      count: 3,
      spreadDeg: 34,
      speed: 8,
      cost: 16,
      forgeCost: 9,
      damageMult: 0.8,
      homing: false,
      blurb: "Shotgun cone of pellets",
    },
    rail: {
      pattern: "projectile",
      count: 1,
      rangeMult: 1.35,
      pierce: 1,
      speed: 12,
      airCapable: true,
      homing: false,
      cost: 18,
      forgeCost: 6,
      blurb: "Long pierce; hits air",
    },
    pulse: {
      pattern: "pulse",
      pulseRadius: 1.85,
      rofMult: 0.85,
      cost: 20,
      forgeCost: 7,
      blurb: "Area ticks around the tower",
    },
    launcher: {
      pattern: "projectile",
      count: 1,
      speed: 6.5,
      aoeRadius: 1.25,
      aoeFalloff: true,
      cost: 22,
      forgeCost: 10,
      blurb: "Lobs a blast on impact",
    },
    flak: {
      pattern: "projectile",
      count: 4,
      spreadDeg: 42,
      speed: 9.5,
      airCapable: true,
      airDamageMult: 1.35,
      damageMult: 0.72,
      cost: 20,
      forgeCost: 8,
      blurb: "Burst flak — shreds air swarms",
    },
  },
  payloads: {
    kinetic: {
      damage: 10,
      damageType: "kinetic",
      speed: 10,
      cost: 2,
      forgeCost: 0,
      blurb: "Clean physical damage",
    },
    pyro: {
      damage: 8,
      damageType: "fire",
      status: { burn: { duration: 4, dps: 2, every: 0.5 } },
      speed: 9,
      cost: 12,
      forgeCost: 6,
      blurb: "Fire + burn DoT",
    },
    shock: {
      damage: 9,
      damageType: "shock",
      chainJumps: 1,
      chainFalloff: 0.6,
      chainRange: 2.4,
      chainUpgradeable: true,
      speed: 12,
      cost: 16,
      forgeCost: 9,
      blurb: "Yellow lightning — chains (tech-upgradeable)",
    },
    frost: {
      damage: 7,
      damageType: "frost",
      status: { slow: { duration: 2.5, amount: 0.4 } },
      speed: 8,
      cost: 9,
      forgeCost: 5,
      blurb: "Frost + slow",
    },
    poison: {
      damage: 5,
      damageType: "poison",
      status: {
        poison: { duration: 5, dps: 1.4, every: 0.5 },
        slow: { duration: 2.0, amount: 0.22 },
      },
      speed: 8,
      cost: 11,
      forgeCost: 7,
      blurb: "Purple toxin — mild DoT + light slow",
    },
    acid: {
      damage: 6,
      damageType: "acid",
      status: { shred: { amount: 2, duration: 4 } },
      speed: 9,
      cost: 12,
      forgeCost: 8,
      blurb: "Green acid — shreds armor for a few seconds",
    },
    breach: {
      damage: 11,
      damageType: "kinetic",
      armorPierce: 4,
      status: { shred: { amount: 1, duration: 2.5 } },
      speed: 11,
      cost: 15,
      forgeCost: 10,
      blurb: "AP kinetic — ignores 4 armor; light shred. Best vs Slab Haulers.",
    },
    emp: {
      damage: 5,
      damageType: "shock",
      emp: true,
      speed: 10,
      cost: 14,
      forgeCost: 11,
      blurb: "EMP burst — strips energy wards & shields. Weak vs bare plate.",
    },
  },
};

export const STARTER = { base: "sentry", barrel: "single", payload: "kinetic" };

export const STARTER_OWNED = {
  bases: ["sentry"],
  barrels: ["single"],
  payloads: ["kinetic"],
};

/** Free parts granted when bestWave reaches the threshold (meta progression). */
export const WAVE_UNLOCKS = [
  { bestWave: 2, barrels: ["twin"], label: "Twin barrel" },
  { bestWave: 4, payloads: ["frost"], label: "Frost payload" },
  { bestWave: 6, bases: ["bulwark"], label: "Bulwark base" },
  { bestWave: 8, barrels: ["rail"], label: "Rail barrel" },
  { bestWave: 10, bases: ["warden"], label: "Warden base" },
  { bestWave: 12, payloads: ["pyro"], label: "Pyro payload" },
  { bestWave: 14, bases: ["talon", "aerie"], label: "Talon & Aerie" },
  { bestWave: 16, payloads: ["poison"], label: "Poison payload" },
  { bestWave: 18, barrels: ["pulse"], label: "Pulse barrel" },
  { bestWave: 20, payloads: ["acid"], label: "Acid payload" },
  { bestWave: 22, barrels: ["flak"], label: "Flak barrel" },
  { bestWave: 24, payloads: ["breach"], label: "Breach payload" },
  { bestWave: 26, payloads: ["emp"], label: "EMP payload" },
];

/** Soft roster size — matches roster_slots tech (3→12). */
export const MIN_ROSTER_SLOTS = 3;
export const MAX_ROSTER_SLOTS = 12;

/**
 * Count owned paid Forge purchases (forgeCost>0), excluding starters and
 * wave-gift unlocks already granted by bestWave. Used to backfill forgeBuys.
 */
export function estimateForgeBuys(owned, bestWave = 0) {
  const o = normalizeOwned(owned);
  const gifted = applyWaveUnlocks(defaultOwned(), bestWave | 0).owned;
  const giftSet = new Set([
    ...gifted.bases.map((id) => `base:${id}`),
    ...gifted.barrels.map((id) => `barrel:${id}`),
    ...gifted.payloads.map((id) => `payload:${id}`),
  ]);
  let n = 0;
  const tally = (kind, key, table) => {
    for (const id of o[key] || []) {
      const row = table[id];
      if (!row || (row.forgeCost | 0) <= 0) continue;
      if (giftSet.has(`${kind}:${id}`)) continue;
      n += 1;
    }
  };
  tally("base", "bases", PARTS.bases);
  tally("barrel", "barrels", PARTS.barrels);
  tally("payload", "payloads", PARTS.payloads);
  return n;
}

/** Old save ids → current ids (dropped parts omitted). */
const PART_MIGRATE = {
  base: {
    watchtower: "sentry",
    bunker: "bulwark",
    sniper: "spire",
    trap: "bulwark",
    commander: "sentry",
    beacon: "sentry",
  },
  barrel: {
    long: "rail",
    radius: "pulse",
  },
  payload: {
    pellet: "kinetic",
    electric: "shock",
    explosive: "kinetic",
  },
};

export function migratePartId(kind, id) {
  if (!id) return id;
  const table = PART_MIGRATE[kind] || {};
  const next = table[id] || id;
  const live =
    kind === "base" ? PARTS.bases : kind === "barrel" ? PARTS.barrels : PARTS.payloads;
  return live[next] ? next : "";
}

export function placeCost(base, barrel, payload) {
  const b = PARTS.bases[base]?.cost ?? 0;
  const r = PARTS.barrels[barrel]?.cost ?? 0;
  const p = PARTS.payloads[payload]?.cost ?? 0;
  return b + r + p;
}

/** Parts already purchased at the Forge (not starters, not wave gifts). */
export function forgePurchaseCount(meta) {
  return Math.max(0, meta?.forgeBuys | 0);
}

/**
 * Forge unlock price in Parts — never affected by Bargainer.
 * Escalates with prior Forge purchases (`meta.forgeBuys`).
 * Free parts (`forgeCost: 0`) stay free. Pass meta (or a buys count) as the 3rd arg.
 */
export function forgeBuyCost(kind, id, metaOrBuys = 0) {
  const table = kind === "base" ? PARTS.bases : kind === "barrel" ? PARTS.barrels : PARTS.payloads;
  const row = table[id];
  if (!row) return 0;
  const base = row.forgeCost != null ? row.forgeCost : row.cost ?? 0;
  if (base <= 0) return 0;
  const buys =
    metaOrBuys && typeof metaOrBuys === "object"
      ? forgePurchaseCount(metaOrBuys)
      : Math.max(0, metaOrBuys | 0);
  // First paid unlock ≈ base (5–6); each prior buy adds +4 Parts.
  return Math.max(0, Math.round(base + buys * 4));
}

export function makeSlot(base = "", barrel = "", payload = "", levelCap = 1) {
  base = migratePartId("base", base);
  barrel = migratePartId("barrel", barrel);
  payload = migratePartId("payload", payload);
  const complete = !!(base && barrel && payload);
  return {
    base,
    barrel,
    payload,
    complete,
    placeCost: complete ? placeCost(base, barrel, payload) : 0,
    levelCap,
  };
}

export function defaultSlots(count = 3, levelCap = 1) {
  const slots = [];
  for (let i = 0; i < count; i++) {
    slots.push(
      i === 0
        ? makeSlot(STARTER.base, STARTER.barrel, STARTER.payload, levelCap)
        : makeSlot("", "", "", levelCap)
    );
  }
  return slots;
}

export function defaultOwned() {
  return {
    bases: [...STARTER_OWNED.bases],
    barrels: [...STARTER_OWNED.barrels],
    payloads: [...STARTER_OWNED.payloads],
  };
}

export function ownsPart(owned, kind, id) {
  const key = kind === "base" ? "bases" : kind === "barrel" ? "barrels" : "payloads";
  return !!owned?.[key]?.includes(id);
}

export function normalizeRoster(roster, slotCount, levelCap) {
  const count = Math.max(
    MIN_ROSTER_SLOTS,
    Math.min(MAX_ROSTER_SLOTS, slotCount | 0 || MIN_ROSTER_SLOTS)
  );
  const cap = levelCap | 0 || 1;
  const src = Array.isArray(roster) ? roster : [];
  const out = [];
  for (let i = 0; i < count; i++) {
    const s = src[i];
    if (s) out.push(makeSlot(s.base || "", s.barrel || "", s.payload || "", cap));
    else if (i === 0) out.push(makeSlot(STARTER.base, STARTER.barrel, STARTER.payload, cap));
    else out.push(makeSlot("", "", "", cap));
  }
  return out;
}

export function normalizeOwned(owned) {
  const d = defaultOwned();
  if (!owned) return d;
  const migrateList = (kind, key) => {
    const set = new Set(d[key]);
    for (const raw of owned[key] || []) {
      const id = migratePartId(kind, raw);
      if (id) set.add(id);
    }
    return [...set];
  };
  return {
    bases: migrateList("base", "bases"),
    barrels: migrateList("barrel", "barrels"),
    payloads: migrateList("payload", "payloads"),
  };
}

/** Apply bestWave milestone unlocks. Returns newly granted part labels. */
export function applyWaveUnlocks(owned, bestWave) {
  const o = normalizeOwned(owned);
  const gained = [];
  for (const row of WAVE_UNLOCKS) {
    if ((bestWave | 0) < row.bestWave) continue;
    for (const id of row.bases || []) {
      if (!o.bases.includes(id)) {
        o.bases.push(id);
        gained.push(partLabel(id));
      }
    }
    for (const id of row.barrels || []) {
      if (!o.barrels.includes(id)) {
        o.barrels.push(id);
        gained.push(partLabel(id));
      }
    }
    for (const id of row.payloads || []) {
      if (!o.payloads.includes(id)) {
        o.payloads.push(id);
        gained.push(partLabel(id));
      }
    }
  }
  return { owned: o, gained };
}

export function partLabel(id) {
  if (!id) return "";
  return id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, " ");
}

export function doctrineLabel(doctrine) {
  switch (doctrine) {
    case "closest":
      return "Closest";
    case "strongest":
      return "Strongest";
    case "weakest":
      return "Weakest";
    case "last":
      return "Last";
    case "flying":
      return "Air → First";
    case "first":
    default:
      return "First";
  }
}

/** @deprecated Use TECH_BRANCHES from techTree.js — kept empty for old imports. */
export const AETHER_UPGRADES = [];
