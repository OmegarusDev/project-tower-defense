import {
  PARTS,
  defaultOwned,
  normalizeOwned,
  normalizeRoster,
  estimateForgeBuys,
  MIN_ROSTER_SLOTS,
  MAX_ROSTER_SLOTS,
} from "./data/parts.js";
import {
  migrateTechRanks,
  syncTechDerived,
  IRON_GUARD_LIVES,
  MIN_LEVEL_CAP,
  MAX_LEVEL_CAP,
} from "./data/techTree.js";

const META_KEY = "ptd_meta_v1";
const ENDLESS_KEY = "ptd_endless_v1";

export function loadMeta() {
  let raw = null;
  try {
    raw = localStorage.getItem(META_KEY);
    if (raw) raw = JSON.parse(raw);
  } catch (_) {
    raw = null;
  }
  return normalizeMeta(raw || {});
}

export function normalizeMeta(m) {
  const bestWave = m.bestWave | 0;
  const owned = normalizeOwned(m.owned || defaultOwned());
  const draft = {
    aether: m.aether | 0,
    forge: m.forge | 0,
    bestWave,
    tech: migrateTechRanks(m),
    owned,
    campaign: {
      cleared: Array.isArray(m.campaign?.cleared)
        ? [...new Set(m.campaign.cleared.map((n) => n | 0).filter((n) => n > 0))]
        : [],
    },
    settings: {
      colorblind: !!m.settings?.colorblind,
      particles: m.settings?.particles !== false,
      music: m.settings?.music !== false,
      sfxVolume: clampVol(m.settings?.sfxVolume),
      musicVolume: clampVol(m.settings?.musicVolume ?? 0.4),
      cameraPitch: clampPitch(m.settings?.cameraPitch),
    },
  };
  // Carry legacy fields into migrateTechRanks via `m`; sync writes derived.
  syncTechDerived(draft);
  clampAndDerive(draft, m, owned);
  return draft;
}

/** Range clamps + legacy backfills (forgeBuys) — one pass, no game rules. */
function clampAndDerive(draft, m, owned) {
  draft.slotCount = Math.max(MIN_ROSTER_SLOTS, Math.min(MAX_ROSTER_SLOTS, draft.slotCount | 0 || MIN_ROSTER_SLOTS));
  draft.levelCap = Math.max(MIN_LEVEL_CAP, Math.min(MAX_LEVEL_CAP, draft.levelCap | 0 || MIN_LEVEL_CAP));
  draft.startLives = Math.max(
    IRON_GUARD_LIVES[0],
    Math.min(IRON_GUARD_LIVES[IRON_GUARD_LIVES.length - 1], draft.startLives | 0 || IRON_GUARD_LIVES[0])
  );
  draft.startCashBonus = Math.max(0, draft.startCashBonus | 0);
  let forgeBuys = Math.max(0, m.forgeBuys | 0);
  if (forgeBuys === 0) {
    forgeBuys = estimateForgeBuys(owned);
  }
  draft.forgeBuys = forgeBuys;
  draft.forgeCostMult = 1;
  draft.towerCostMult = clampMult(draft.towerCostMult, 1);
  draft.wallCostMult = clampMult(draft.wallCostMult, 1);
  draft.waveCoinBonus = Math.max(0, draft.waveCoinBonus | 0);
  draft.wavePartsBonus = Math.max(0, Math.min(4, draft.wavePartsBonus | 0));
  draft.sellRefundMult = clampRefund(draft.sellRefundMult);
  draft.globalDamageMult = clampBoost(draft.globalDamageMult, 1);
  draft.globalRangeMult = clampBoost(draft.globalRangeMult, 1);
  draft.globalRofMult = clampBoost(draft.globalRofMult, 1);
  draft.partUpgrades = normalizePartUpgrades(draft.partUpgrades);
  draft.roster = normalizeRoster(m.roster, draft.slotCount, draft.levelCap);
}

function clampPitch(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 24;
  return Math.max(8, Math.min(58, n));
}

function clampVol(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.35;
  return Math.max(0, Math.min(1, n));
}

function clampMult(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(0.5, Math.min(1, n));
}

function clampBoost(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(2, n));
}

function clampRefund(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0.5;
  return Math.max(0.5, Math.min(0.9, n));
}

/** Part mastery ranks by part id, e.g. `{ shock: { chain: 2 }, sentry: { power: 1 } }`. */
function normalizePartUpgrades(raw) {
  const live = { ...PARTS.bases, ...PARTS.barrels, ...PARTS.payloads };
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, row] of Object.entries(raw)) {
    if (!live[id] || !row || typeof row !== "object") continue;
    const entry = {};
    const chain = Math.max(0, Math.min(8, row.chain | 0));
    const power = Math.max(0, Math.min(8, row.power | 0));
    if (chain > 0) entry.chain = chain;
    if (power > 0) entry.power = power;
    if (Object.keys(entry).length) out[id] = entry;
  }
  return out;
}

export function saveMeta(meta) {
  localStorage.setItem(META_KEY, JSON.stringify(normalizeMeta(meta)));
}

export function hasEndless() {
  return !!localStorage.getItem(ENDLESS_KEY);
}

export function saveEndless(blob) {
  localStorage.setItem(ENDLESS_KEY, JSON.stringify(blob));
}

export function loadEndless() {
  try {
    return JSON.parse(localStorage.getItem(ENDLESS_KEY) || "null");
  } catch (_) {
    return null;
  }
}

export function clearEndless() {
  localStorage.removeItem(ENDLESS_KEY);
}
