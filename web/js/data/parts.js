/**
 * Composition axes (orthogonal):
 *   Base    = envelope + targeting doctrine (+ light innate)
 *   Barrel  = delivery geometry (how force leaves)
 *   Payload = element only (what contact does)
 *
 * Range/ROF stack in buildAttackPlan: base envelope × base mults × barrel mults × tech ranks.
 * `cost` = Coin place contribution
 * `forgeCost` = Forge parts to unlock (0 = starter / wave-gift)
 */

export const PARTS = {
  bases: {
    sentry: {
      range: 3.2,
      fireInterval: 1.15,
      rangeMult: 1,
      rofMult: 1,
      doctrine: "first",
      cost: 12,
      forgeCost: 0,
      blurb: "Lane clearer — shoots first on the path",
    },
    bulwark: {
      range: 2.15,
      fireInterval: 0.55,
      rangeMult: 1,
      rofMult: 1,
      doctrine: "closest",
      pointBlankMult: 1.2,
      pointBlankRange: 1.25,
      cost: 18,
      forgeCost: 5,
      blurb: "Point defense — short & fast; nearest threat",
    },
    spire: {
      range: 5.2,
      fireInterval: 1.55,
      rangeMult: 1,
      rofMult: 1,
      doctrine: "strongest",
      cost: 26,
      forgeCost: 10,
      blurb: "Elite hunter — long reach, slow cadence",
    },
    aerie: {
      range: 3.6,
      fireInterval: 1.05,
      rangeMult: 1,
      rofMult: 1,
      doctrine: "flying",
      airDamageMult: 1.25,
      cost: 22,
      forgeCost: 8,
      blurb: "Air wing — flying first, then path tip",
    },
    warden: {
      range: 3.8,
      fireInterval: 1.1,
      rangeMult: 1,
      rofMult: 1,
      doctrine: "last",
      cost: 20,
      forgeCost: 6,
      blurb: "Exit guard — last on the path (leak watch)",
    },
    talon: {
      range: 2.85,
      fireInterval: 0.82,
      rangeMult: 1,
      rofMult: 1,
      doctrine: "weakest",
      executeMult: 1.3,
      executeThreshold: 0.4,
      cost: 20,
      forgeCost: 7,
      blurb: "Finisher — lowest HP, bonus vs wounded",
    },
  },
  barrels: {
    single: {
      pattern: "projectile",
      count: 1,
      rangeMult: 1,
      rofMult: 1,
      speed: 9,
      cost: 5,
      forgeCost: 0,
      blurb: "One clean shot — baseline reach & cadence",
    },
    twin: {
      pattern: "projectile",
      count: 1,
      alternating: true,
      rangeMult: 0.82,
      rofMult: 1.75,
      speed: 9,
      cost: 10,
      forgeCost: 5,
      blurb: "Alternating dual — 1.75× ROF, shorter reach",
    },
    scatter: {
      pattern: "projectile",
      count: 3,
      spreadDeg: 34,
      rangeMult: 0.88,
      rofMult: 0.95,
      speed: 8,
      cost: 16,
      forgeCost: 9,
      damageMult: 0.8,
      homing: false,
      blurb: "Shotgun cone — wide arc, short bite",
    },
    rail: {
      pattern: "projectile",
      count: 1,
      rangeMult: 1.4,
      rofMult: 0.72,
      pierce: 1,
      speed: 12,
      airCapable: true,
      homing: false,
      cost: 12,
      forgeCost: 6,
      blurb: "Long pierce; hits air — slow cadence",
    },
    pulse: {
      pattern: "pulse",
      pulseRadius: 1.85,
      rangeMult: 1,
      rofMult: 0.85,
      cost: 20,
      forgeCost: 7,
      blurb: "Area ticks around the tower",
    },
    launcher: {
      pattern: "projectile",
      count: 1,
      rangeMult: 1.18,
      rofMult: 0.68,
      speed: 6.5,
      aoeRadius: 1.25,
      aoeFalloff: true,
      cost: 22,
      forgeCost: 10,
      blurb: "Lobs a blast on impact — slow & lobbed",
    },
    flak: {
      pattern: "projectile",
      count: 4,
      spreadDeg: 42,
      rangeMult: 0.92,
      rofMult: 1.08,
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
      blurb: "Fire + burn DoT — burning targets take +50% poison damage",
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
      blurb: "Yellow lightning — chains (tech-upgradeable); +15% dmg vs slowed",
    },
    frost: {
      damage: 7,
      damageType: "frost",
      status: { slow: { duration: 2.5, amount: 0.4 } },
      speed: 8,
      cost: 9,
      forgeCost: 5,
      blurb: "Frost + slow — slows make shock chains leap 40% further",
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
      blurb: "Green acid — shreds armor; stripped plates lose heat resistance",
    },
    breach: {
      damage: 11,
      damageType: "kinetic",
      armorPierce: 4,
      speed: 11,
      cost: 15,
      forgeCost: 10,
      blurb: "AP kinetic — ignores 4 armor. Best vs Slab Haulers.",
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

// ---- frozen enums + import-time validation (P1) ----

const DOCTRINES = new Set(["first", "closest", "strongest", "flying", "last", "weakest"]);
const PATTERNS = new Set(["projectile", "pulse"]);
const DAMAGE_TYPES = new Set(["kinetic", "fire", "shock", "frost", "poison", "acid"]);

(function validateParts() {
  for (const [id, b] of Object.entries(PARTS.bases)) {
    if (!DOCTRINES.has(b.doctrine)) throw new Error(`PARTS.bases[${id}].doctrine "${b.doctrine}" not in ${[...DOCTRINES]}`);
  }
  for (const [id, b] of Object.entries(PARTS.barrels)) {
    if (!PATTERNS.has(b.pattern)) throw new Error(`PARTS.barrels[${id}].pattern "${b.pattern}" not in ${[...PATTERNS]}`);
  }
  for (const [id, p] of Object.entries(PARTS.payloads)) {
    if (!DAMAGE_TYPES.has(p.damageType)) throw new Error(`PARTS.payloads[${id}].damageType "${p.damageType}" not in ${[...DAMAGE_TYPES]}`);
  }
})();

Object.freeze(PARTS.bases);
Object.freeze(PARTS.barrels);
Object.freeze(PARTS.payloads);
Object.freeze(PARTS);

const STARTER = { base: "sentry", barrel: "single", payload: "kinetic" };

const STARTER_OWNED = {
  bases: ["sentry"],
  barrels: ["single"],
  payloads: ["kinetic"],
};

/** Soft roster size — matches roster_slots tech (3→12). */
export const MIN_ROSTER_SLOTS = 3;
export const MAX_ROSTER_SLOTS = 12;

/** XP needed per tower level-up (set on towers at spawn; display fallbacks use this). */
export const XP_TO_POINT = 55;

/**
 * Count owned paid Forge purchases (forgeCost>0), excluding starters.
 * Used to backfill forgeBuys on legacy saves — a part owned at load time
 * counts as already purchased (old wave gifts migrate as paid, keeping the
 * Forge escalation pricing consistent with what the player actually holds).
 */
export function estimateForgeBuys(owned) {
  const o = normalizeOwned(owned);
  let n = 0;
  const tally = (key, table) => {
    for (const id of o[key] || []) {
      const row = table[id];
      if (!row || (row.forgeCost | 0) <= 0) continue;
      n += 1;
    }
  };
  tally("bases", PARTS.bases);
  tally("barrels", PARTS.barrels);
  tally("payloads", PARTS.payloads);
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
  // Empty strings allowed for incomplete slots (cost 0); non-empty must be valid.
  if (base && !PARTS.bases[base]) throw new Error(`placeCost: unknown base "${base}"`);
  if (barrel && !PARTS.barrels[barrel]) throw new Error(`placeCost: unknown barrel "${barrel}"`);
  if (payload && !PARTS.payloads[payload]) throw new Error(`placeCost: unknown payload "${payload}"`);
  const b = PARTS.bases[base]?.cost ?? 0;
  const r = PARTS.barrels[barrel]?.cost ?? 0;
  const p = PARTS.payloads[payload]?.cost ?? 0;
  return b + r + p;
}

/** Parts already purchased at the Forge (not starters, not wave gifts). */
function forgePurchaseCount(meta) {
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
    for (const raw of Array.isArray(owned[key]) ? owned[key] : []) {
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
