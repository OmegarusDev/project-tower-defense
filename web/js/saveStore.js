import {
  PARTS,
  defaultOwned,
  normalizeOwned,
  normalizeRoster,
  estimateForgeBuys,
  MIN_ROSTER_SLOTS,
  MAX_ROSTER_SLOTS,
} from "./data/parts.js";
import { RULES } from "./data/rules.js";
import {
  syncTechDerived,
  IRON_GUARD_LIVES,
  MIN_LEVEL_CAP,
  MAX_LEVEL_CAP,
} from "./data/techTree.js";
import { migrateTechRanks } from "./saveStore.migrations.js";

// Single import surface for all save migrations (bodies live in their data modules).
export { migratePartId, migrateTechRanks } from "./saveStore.migrations.js";

export const META_KEY = "ptd_meta_v1";
export const ENDLESS_KEY = "ptd_endless_v1";
export const EDITOR_KEY = "ptd_editor_levels_v1";

/** Schema versions — bump + add a branch in the matching normalize* when a shape changes. */
export const META_VERSION = 1;
export const ENDLESS_VERSION = 1;
export const EDITOR_VERSION = 1;

/**
 * Persisted save shapes — the contract. Each has a localStorage key, a version,
 * and a normalizer that validates + forward-migrates. Migrations live in
 * saveStore.migrations.js; this table is the index.
 */
export const SAVE_SHAPES = {
  meta: { key: META_KEY, version: META_VERSION, normalize: normalizeMeta },
  endless: { key: ENDLESS_KEY, version: ENDLESS_VERSION, normalize: normalizeEndless },
  editor: { key: EDITOR_KEY, version: EDITOR_VERSION, normalize: normalizeEditorLevel },
};

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
  // Future migrations slot in here (old saves have version 0).
  if ((m.version | 0) < META_VERSION) {
    // v0 → v1: no structural changes yet — defaults handle everything.
  }
  const bestWave = m.bestWave | 0;
  const owned = normalizeOwned(m.owned || defaultOwned());
  const draft = {
    version: META_VERSION,
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
    // Dev Mode snapshot (whitelisted so it survives save/reload). If active
    // but the baseline is missing, drop the flag — restore must never run
    // against nothing and wipe real progress.
    dev: normalizeDev(m.dev),
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
    // Dev Mode unlocks every part — price escalation must keep tracking the
    // REAL purchase count, so backfill from the snapshot, not the dev-owned set.
    const effOwned = draft.dev?.active && draft.dev.savedOwned ? draft.dev.savedOwned : owned;
    forgeBuys = estimateForgeBuys(effOwned);
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
  if (!Number.isFinite(n)) return RULES.PITCH_DEFAULT;
  return Math.max(RULES.PITCH_MIN, Math.min(RULES.PITCH_MAX, n));
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

/** Dev Mode snapshot — validated, shape-corrected; null baseline drops the flag. */
function normalizeDev(raw) {
  const off = { active: false, savedOwned: null, savedForge: null };
  if (!raw || typeof raw !== "object") return off;
  // Only trust writer-shaped baselines (all three id arrays). Anything else
  // would coerce to starter-defaults on restore and silently eat progress.
  const so = raw.savedOwned;
  const looksValid =
    so && typeof so === "object" &&
    Array.isArray(so.bases) && Array.isArray(so.barrels) && Array.isArray(so.payloads);
  const savedForge = Number.isFinite(raw.savedForge) ? Math.max(0, raw.savedForge | 0) : null;
  return {
    // Boolean-coerced: looksValid can be null when the baseline is absent,
    // and `true && null === null` would leak a non-boolean into saves.
    active: !!(raw.active && looksValid),
    savedOwned: looksValid ? normalizeOwned(so) : null,
    savedForge,
  };
}

/** Part mastery ranks by part id, e.g. `{ shock: { chain: 2 }, sentry: { power: 1 } }`. */function normalizePartUpgrades(raw) {
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
  setItemGuarded(META_KEY, JSON.stringify(normalizeMeta(meta)));
}

/** localStorage.setItem that never throws mid-gameplay (quota/private mode). */
function setItemGuarded(key, json) {
  try {
    localStorage.setItem(key, json);
    return true;
  } catch (err) {
    console.warn(`[saves] write failed for ${key}:`, err?.name || err);
    return false;
  }
}

export function hasEndless() {
  return !!localStorage.getItem(ENDLESS_KEY);
}

export function saveEndless(blob) {
  // Versioned envelope — future schema changes migrate off `v`.
  const stamped = { ...blob, v: ENDLESS_VERSION };
  if (setItemGuarded(ENDLESS_KEY, JSON.stringify(stamped))) return;
  // Quota fallback: retry without the replay log (post-continue ghost
  // replay degrades) rather than losing the whole checkpoint.
  setItemGuarded(ENDLESS_KEY, JSON.stringify({ ...stamped, actionLog: [] }));
}

export function loadEndless() {
  try {
    return normalizeEndless(JSON.parse(localStorage.getItem(ENDLESS_KEY) || "null"));
  } catch (_) {
    return null;
  }
}

/**
 * Boundary validation for checkpoints. sim.loadCheckpoint trusts shapes and
 * dereferences cell coords — a truncated/corrupted blob used to throw there,
 * leaving a half-built sim behind the hub screen. Bad ENTRIES are dropped;
 * only hopeless blobs return null.
 */
function normalizeEndless(raw) {
  if (!raw || typeof raw !== "object") return null;
  const int = (v, lo, hi, dflt) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
  };
  const cellOk = (c) =>
    c && typeof c === "object" &&
    Number.isFinite(c.x) && Number.isFinite(c.y) &&
    c.x >= 0 && c.y >= 0;

  const towers = Array.isArray(raw.towers)
    ? raw.towers.filter(
        (t) => t && typeof t === "object" && cellOk(t.cell) && typeof t.base === "string"
      )
    : [];
  const walls = Array.isArray(raw.walls)
    ? raw.walls.filter((w) => w && typeof w === "object" && cellOk(w.cell))
    : [];
  // Roster entries go through makeSlot on load — null/garbage would crash it.
  const roster = Array.isArray(raw.roster)
    ? raw.roster.filter((s) => s && typeof s === "object")
    : undefined;

  const cols = int(raw.cols, 5, 40, 11);
  const rows = int(raw.rows, 5, 40, 14);
  return {
    ...(typeof raw === "object" ? raw : {}),
    v: typeof raw.v === "number" ? raw.v : 0,
    wave: int(raw.wave, 0, 1e9, 0),
    phase: raw.phase === "betweenWaves" ? "betweenWaves" : "inWave",
    earlyBonusWave: int(raw.earlyBonusWave, 0, 1e9, 0),
    lives: int(raw.lives, 0, 1e6, 3),
    battle: int(raw.battle, 0, 1e9, 100),
    forge: int(raw.forge, 0, 1e9, 0),
    aether: int(raw.aether, 0, 1e9, 0),
    seed: int(raw.seed, 0, 0xffffffff, 1) >>> 0,
    runSeed: int(raw.runSeed ?? raw.seed, 0, 0xffffffff, 1) >>> 0,
    cols,
    rows,
    towers,
    walls,
    roster,
    blocked: Array.isArray(raw.blocked) && raw.blocked.length === cols * rows
      ? raw.blocked
      : undefined,
    actionLog: Array.isArray(raw.actionLog) ? raw.actionLog : [],
  };
}

export function clearEndless() {
  try {
    localStorage.removeItem(ENDLESS_KEY);
  } catch (_) {}
}

// --- Editor level persistence (owned here so saveStore is the single source of truth) ---

export function loadEditorLevels() {
  try {
    const raw = JSON.parse(localStorage.getItem(EDITOR_KEY) || "[]");
    const list = Array.isArray(raw) ? raw : [];
    return list.map(normalizeEditorLevel).filter(Boolean);
  } catch (_) {
    return [];
  }
}

export function saveEditorLevels(list) {
  const safe = Array.isArray(list) ? list : [];
  return setItemGuarded(EDITOR_KEY, JSON.stringify(safe.slice(0, 24).map(stripEditorLevel)));
}

function normalizeEditorLevel(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.name !== "string" || !raw.name) return null;
  return raw;
}

function stripEditorLevel(def) {
  return { ...def, v: EDITOR_VERSION };
}

/** Single dispatch point for the blob-shaped saves (meta + endless). */
export function migrateSave(raw, kind) {
  if (kind === "meta") return normalizeMeta(raw || {});
  if (kind === "endless") return normalizeEndless(raw);
  return null;
}
