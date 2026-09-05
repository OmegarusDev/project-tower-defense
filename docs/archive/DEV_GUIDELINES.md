> **ARCHIVED — SIDEQUEL VISION** — on hold, may become a different game. Living process doc is `docs/DEV.md`; this file describes the property-bag sidequel, not this iteration.

# Developer Guidelines — Forgeworks TD (archived)

---

## 1. Sacred rules (non-negotiable)

1. This repository (`web/`) is the single source of truth — no external prototype or reference repo.
2. All game code lives under `web/`. No Godot, no npm/bundler/frameworks.
3. Zero external art/SFX packs. Code-generated graphics; bake SFX at boot.
4. Portrait-first, adaptive UI. Offline. Local saves. English only.
5. Develop on Apple Silicon; mobile via responsive web / later PWA wrap.
6. Support-the-Dev IAP **last** (stub until then).
7. Fixed-step `web/js/sim/`; `view`/`audio` consume state/events only.
8. Data-driven content; avoid growing `app.js` into a god object — split screens.
9. Use data placeholders for unset numbers; do not invent new systems.
10. **No `console.log` / `console.debug` / `debugger` in `web/js`** (CI grep). Allowlisted only: `main.js:8` (`console.info`) and `saveStore.js:179` (`console.warn`).
11. **Zero assets / no build** — `playwright` is dev-only (CI parity).

---

## 2. Verification

Unit + parse gates (no server):

```bash
node verify.mjs          # repo root — runs all 17 test files
```

Full parity (needs a served `web/`):

```bash
cd web && python3 -m http.server 8123 --bind 127.0.0.1 &
node tools/corpus/simParity.mjs       # byte-exact bot-ladder traces (blocking)
node tools/corpus/ladderParity.mjs
node tools/corpus/simFuzz.mjs
node tools/corpus/renderParity.mjs
node tools/corpus/boardParity.mjs
node tools/corpus/uiParity.mjs
node tools/corpus/chromeParity.mjs
node tools/corpus/actionsParity.mjs
node tools/corpus/smokeWalk.mjs
node tools/corpus/qaWalk.mjs
```

- `simParity` + browser parity gates are **required merge gates**. `campaignLadder` is intentionally **non-blocking** (balance signal).
- Every change must keep parity green. **Deliberate re-baseline is the documented workflow** for any intentional change: capture new traces/baselines/goldens, review the diff, land — do not weaken the gates.

---

## 3. How to add a property / upgrade part (the new tower system)

This is the primary extension point in the rewrite (`GDD.md` §5, `REWRITE_PLAN.md` §2). Parts are **data-declared**; code implements each *property-kind* once.

**To add a new upgrade part:**

1. **Declare it in data** (`web/js/data/parts.js` successor — until the rewrite lands, use `parts.js` as the catalog). Add an entry with: `id`, display `name`, `cost`, `tags`, **`properties: [...]`** (typed bag: delivery shape, element, on-hit/passive/zone, doctrine, modifier). Cost/numbers are data placeholders until playtest.
2. **Ensure the property-kind exists in the resolver** (`sim/attackPlan.js` → property resolver). If the part introduces a genuinely new *kind* (e.g. a new shape `beam`), implement that kind once in the resolver + its interaction rules (generic, not per-pair).
3. **Tags:** give the part its tags (e.g. `fire`, `zone`, `sustain`). Tag-combo synergy bonuses are derived, not per-part.
4. **Tests:** add or extend a `web/js/tests/*.test.mjs` case covering the new property/upgrade (pool membership, resolver output, parity membership, save round-trip).
5. **Save migration if needed:** if the catalog introduces a field the save-store doesn't know, add a forward-migration in `web/js/saveStore.js` (`migratePartId`-style) + `saveStore.migrations.js` and bump/test `META_V` or the endless normalizer. Never clobber a vault.
6. **Balance harness:** exercise it via `web/js/balance/` (at least one `fresh`-preset Monte Carlo run; re-baseline deliberately).

**To add a new property-kind (e.g. a new delivery shape):**

- Implement the *kind* in the resolver as a generic combinator (shape × element, zone × doctrine, etc.) — **not** a hand-authored pair table. Existing parts of that kind automatically compose with all elements.
- Add at least one smoke/parity test that pins the kind's expected behavior.

---

## 4. Save & migration discipline

- All persistence shapes + forward-migration live in `web/js/saveStore.js` — `normalizeMeta`/`saveMeta` (`META_V`), `normalizeEndless`/`saveEndless`/`loadEndless` (`ENDLESS_V=1`), editor list in `levelEditor.js`.
- Migration helpers `migratePartId` (`data/parts.js`) and `migrateTechRanks` (`data/techTree.js`) are called from the save path.
- **Never clobber a vault with a stale checkpoint.** Meta Forge/Aether merge is delta-only (`metaAppliedGains` / run gains). Continue re-seeds from current meta.
- The new property catalog gets the same treatment: legacy saves keep gifted parts (migrated as paid) — by precedent, new fields forward-migrate.

---

## 5. Git hygiene

- Keep the `v0-pre-rebuild-baseline` tag and `baseline-archive` branch intact (historical snapshots).
- Repository is self-contained; legacy prototype branches/tags are retired (`AGENTS.md` #1).
- Planning docs that are historical live under `docs/archive/`; living docs are only `GDD.md`, `ARCHITECTURE.md`, `DEV_GUIDELINES.md`, `REWRITE_PLAN.md` + `AGENTS.md`.
- Docs accuracy is CI-enforced — keep references to removed modules accurate.

---

## 6. Local run

```bash
cd web && python3 -m http.server 8080
# open http://localhost:8080
```

---

*End guidelines. Every agent must read `GDD.md` before inventing behavior.*
