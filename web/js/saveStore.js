import {
  defaultOwned,
  normalizeOwned,
  normalizeRoster,
  applyWaveUnlocks,
} from "./data/parts.js";
import { migrateTechRanks, syncTechDerived } from "./data/techTree.js";

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
  let owned = normalizeOwned(m.owned || defaultOwned());
  owned = applyWaveUnlocks(owned, bestWave).owned;

  const tech = migrateTechRanks(m);
  const draft = {
    aether: m.aether | 0,
    forge: m.forge | 0,
    bestWave,
    tech,
    owned,
    campaign: {
      cleared: Array.isArray(m.campaign?.cleared)
        ? [...new Set(m.campaign.cleared.map((n) => n | 0).filter((n) => n > 0))]
        : [],
    },
    settings: {
      colorblind: !!m.settings?.colorblind,
      particles: m.settings?.particles !== false,
      cameraPitch: clampPitch(m.settings?.cameraPitch),
    },
  };

  // Carry legacy fields into migrateTechRanks via `m`; sync writes derived.
  syncTechDerived(draft);

  draft.slotCount = Math.max(3, Math.min(12, draft.slotCount | 0 || 3));
  draft.levelCap = Math.max(2, Math.min(5, draft.levelCap | 0 || 2));
  draft.startLives = Math.max(3, Math.min(8, draft.startLives | 0 || 3));
  draft.startCashBonus = Math.max(0, draft.startCashBonus | 0);
  draft.forgeCostMult = clampMult(draft.forgeCostMult, 1);
  draft.wallCostMult = clampMult(draft.wallCostMult, 1);
  draft.waveCoinBonus = Math.max(0, draft.waveCoinBonus | 0);
  draft.partUpgrades = normalizePartUpgrades(draft.partUpgrades);
  draft.roster = normalizeRoster(m.roster, draft.slotCount, draft.levelCap);
  return draft;
}

function clampPitch(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 24;
  return Math.max(8, Math.min(58, n));
}

function clampMult(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(0.5, Math.min(1, n));
}

/** Payload mastery ranks, e.g. `{ shock: { chain: 2 }, pyro: { power: 1 } }`. */
export function normalizePartUpgrades(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, row] of Object.entries(raw)) {
    if (!row || typeof row !== "object") continue;
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
