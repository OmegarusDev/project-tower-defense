/**
 * Dev Mode: snapshot persistence, owned-shape correctness, forgeBuys
 * continuity, and toggle/restore semantics (headless — no DOM).
 * Run: node js/tests/devMode.test.mjs
 */
import { normalizeMeta } from "../saveStore.js";
import { PARTS, ownsPart } from "../data/parts.js";
import { toggleDevMode } from "../ui/forgeScreen.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const ALL_COUNT =
  Object.keys(PARTS.bases).length +
  Object.keys(PARTS.barrels).length +
  Object.keys(PARTS.payloads).length;

/** Minimal app stub — screen "hub" skips refreshForgeUi (no DOM needed). */
function stubApp(meta) {
  const app = {
    meta,
    screen: "hub",
    synth: { play() {} },
    toast() {},
    persistMeta() {
      // Mirror the real path: normalize-on-write, then simulate reload.
      app.reloaded = normalizeMeta(app.meta);
    },
  };
  return app;
}

// Toggle on → correct all-parts shape; snapshot holds real progress.
{
  const meta = normalizeMeta({
    forge: 12,
    owned: { bases: ["sentry"], barrels: ["single"], payloads: ["kinetic"] },
  });
  const app = stubApp(meta);
  toggleDevMode(app);

  assert(meta.dev?.active === true, "dev.active set");
  assert(ownsPart(meta.owned, "base", "spire"), "all bases unlocked");
  assert(ownsPart(meta.owned, "barrel", "flak"), "all barrels unlocked");
  assert(ownsPart(meta.owned, "payload", "emp"), "all payloads unlocked");
  assert(
    meta.owned.bases.length + meta.owned.barrels.length + meta.owned.payloads.length === ALL_COUNT,
    `owned is shape-correct all-parts (${ALL_COUNT} expected)`
  );
  assert(Array.isArray(meta.owned.bases), "owned.bases is an array of ids (not [{kind,id}] junk)");
  assert(
    meta.dev.savedOwned.bases.includes("sentry") &&
      meta.dev.savedOwned.barrels.includes("single"),
    "snapshot preserved real owned"
  );
  assert(meta.dev.savedForge === 12, "snapshot preserved real Forge balance");

  // Persistence: snapshot survives save/reload (the old bug — underscore
  // fields were stripped by the whitelist).
  const reloaded = normalizeMeta(meta);
  assert(reloaded.dev?.active === true, "dev.active survives reload");
  assert(reloaded.dev.savedOwned?.barrels.includes("single"), "snapshot survives reload");
  assert(reloaded.dev.savedForge === 12, "savedForge survives reload");
}

// Toggle off → exact restore.
{
  const meta = normalizeMeta({
    forge: 12,
    owned: { bases: ["sentry"], barrels: ["single"], payloads: ["kinetic"] },
  });
  const app = stubApp(meta);
  toggleDevMode(app); // on
  meta.forge = 0; // dev-mode spending must not survive
  toggleDevMode(app); // off

  assert(meta.dev.active === false && !meta.dev.savedOwned, "snapshot cleared after restore");
  assert(
    meta.owned.bases.join(",") === "sentry" &&
      meta.owned.barrels.join(",") === "single" &&
      meta.owned.payloads.join(",") === "kinetic",
    "owned restored exactly"
  );
  assert(meta.forge === 12, "forge restored to snapshot balance");
}

// forgeBuys continuity: escalation tracks REAL purchases while dev-unlocked.
{
  const meta = normalizeMeta({
    forge: 5,
    forgeBuys: 2, // player really bought two parts
    owned: { bases: ["sentry", "bulwark"], barrels: ["single"], payloads: ["kinetic"] },
  });
  const before = meta.forgeBuys;
  const app = stubApp(meta);
  toggleDevMode(app);
  const during = normalizeMeta(meta);
  assert(during.forgeBuys === before, `forgeBuys not inflated by dev unlock (${during.forgeBuys} vs ${before})`);

  // Zero-purchase account: backfill counts the SNAPSHOT's paid parts, not all parts.
  const fresh = normalizeMeta({
    owned: { bases: ["sentry"], barrels: ["single"], payloads: ["kinetic"] },
  });
  const app2 = stubApp(fresh);
  toggleDevMode(app2);
  const during2 = normalizeMeta(fresh);
  assert(during2.forgeBuys === 0, `fresh account stays at 0 buys under dev (got ${during2.forgeBuys})`);
}

// Corrupt snapshot: active=true with no baseline → flag dropped (never restores to nothing).
{
  const m = normalizeMeta({ dev: { active: true, savedOwned: null, savedForge: null } });
  assert(m.dev.active === false, "active-without-baseline drops the flag");

  const garbage = normalizeMeta({ dev: { active: true, savedOwned: { bases: "junk", barrels: 7 }, savedForge: "x" } });
  assert(garbage.dev.active === false, "garbage baseline drops the flag");
  assert(!garbage.dev.savedOwned || Array.isArray(garbage.dev.savedOwned.bases), "no malformed owned leaks through");
}

console.log("ALL devMode tests passed");
