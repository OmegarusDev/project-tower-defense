/**
 * Save hygiene: normalize/migrate/clamp round-trips (node-safe — no DOM).
 * Run: node js/tests/saveStore.test.mjs
 */
import { normalizeMeta, saveMeta, loadMeta, saveEndless, loadEndless } from "../saveStore.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Fresh/empty raw save → sane defaults + version stamped
{
  const m = normalizeMeta({});
  assert(m.version === 1, "version stamped");
  assert(m.aether === 0 && m.forge === 0, "currencies default to 0");
  assert(m.bestWave === 0, "bestWave defaults 0");
  assert(m.slotCount >= 3 && m.levelCap >= 1, "caps default sane");
  assert(m.settings.music !== false && m.settings.particles !== false, "settings defaults on");
  assert(Array.isArray(m.campaign.cleared), "campaign cleared is an array");
}

// Legacy save (no tech/owned/settings, odd field types) normalizes without crashing
{
  const legacy = {
    aether: "12",
    forge: "4",
    bestWave: 7,
    tech: null,
    owned: null,
    roster: "garbage",
    startLives: -5,
    slotCount: 99,
    levelCap: -1,
    wavePartsBonus: 50,
    settings: { sfxVolume: "loud" },
  };
  const m = normalizeMeta(legacy);
  assert(m.aether === 12 && m.forge === 4, "numeric strings coerced");
  assert(m.bestWave === 7, "bestWave carried");
  assert(m.startLives >= 3, "startLives clamped to floor");
  assert(m.slotCount <= 12, "slotCount clamped to max");
  assert(m.levelCap >= 1, "levelCap clamped to min");
  assert(m.wavePartsBonus <= 4, "parts bonus clamped");
  assert(Number.isFinite(m.settings.sfxVolume), "volume coerced to finite");
  assert(Array.isArray(m.roster), "garbage roster normalized");
}

// Legacy Forge backfill: owned non-starter parts count as paid purchases
{
  const m = normalizeMeta({
    owned: { bases: ["sentry"], barrels: ["single", "rail", "twin"], payloads: ["kinetic"] },
  });
  assert(m.forgeBuys >= 2, `owned parts backfill forgeBuys (got ${m.forgeBuys})`);
}

// Save/load round-trip through a localStorage shim
{
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const meta = normalizeMeta({ aether: 33, forge: 7, bestWave: 12, owned: { bases: ["sentry", "spire"], barrels: ["single"], payloads: ["kinetic"] } });
  saveMeta(meta);
  const loaded = loadMeta();
  assert(loaded.version === 1, "round trip keeps version");
  assert(loaded.aether === 33 && loaded.forge === 7, "round trip keeps currencies");
  assert(loaded.bestWave === 12, "round trip keeps bestWave");
  assert(loaded.owned.bases.includes("spire"), "round trip keeps owned parts");
}

// Endless checkpoint envelope: versioning, validation, corruption tolerance
{
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  saveEndless({ wave: 4, phase: "inWave", towers: [], walls: [], cols: 9, rows: 8 });
  const good = loadEndless();
  assert(good.v === 1, "checkpoint stamped with envelope version");
  assert(good.wave === 4 && good.phase === "inWave", "checkpoint fields round-trip");

  // Corrupted entries are dropped, not fatal
  store.set(
    "ptd_endless_v1",
    JSON.stringify({
      wave: 6,
      cols: 9,
      rows: 8,
      towers: [
        { id: 1, cell: { x: 2, y: 3 }, base: "sentry", barrel: "single", payload: "kinetic" },
        null,
        { id: 2 },
        { id: 3, cell: { x: "NaN", y: 1 } },
      ],
      walls: [{ id: 9, cell: { x: 1, y: 1 }, paid: 12 }, "junk"],
      roster: [null, { base: "sentry", barrel: "single", payload: "kinetic" }],
      blocked: new Array(72).fill(0),
    })
  );
  const fixed = loadEndless();
  assert(fixed.towers.length === 1, "corrupt tower entries dropped");
  assert(fixed.walls.length === 1, "corrupt wall entries dropped");
  assert(fixed.roster.length === 1, "null roster slots dropped");
  assert(fixed.blocked?.length === 72, "right-length blocked kept");
  assert(fixed.phase === "inWave", "missing phase defaults inWave");

  // Wrong-length blocked is dropped (loadCheckpoint requires exact match)
  store.set("ptd_endless_v1", JSON.stringify({ wave: 1, blocked: [0, 1] }));
  assert(loadEndless().blocked === undefined, "wrong-length blocked dropped");

  // Hopeless garbage → null (never throws)
  store.set("ptd_endless_v1", "{truncated");
  assert(loadEndless() === null, "unparseable blob returns null");
  store.set("ptd_endless_v1", "42");
  assert(loadEndless() === null, "non-object blob returns null");
}

// version < current triggers the (no-op) migration path
{
  const m = normalizeMeta({ version: 0, aether: 5 });
  assert(m.version === 1 && m.aether === 5, "old save migrates forward");
}

console.log("ALL saveStore tests passed");
