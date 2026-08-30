# Maintenance Plan — This Iteration (checklist)

**Status:** Living checklist for **this** iteration only. `SIDEQUEL.md` + `REWRITE_PLAN.md` are on hold and out of scope.
**Source:** Audits 2026-08-28 (stringly-typed data, parity fragility, per-frame allocs, UI/App collapse, stain gradient).
**Verify after each phase:** `node verify.mjs` (parse + 17 tests). Full parity (`tools/corpus/*Parity.mjs`) only when noted — needs `python3 -m http.server 8123` + Playwright.
**Plain-English P4:** P4 is "delete the duplicate button code so there's only one place that handles clicks, and make `app.js` not the place everything reaches into." It's the biggest cleanup but also the riskiest (re-captures every UI test). Deferred — leave as checklist until you want it.

---

## Done already (do not redo)

- [x] Pan camera: `boardView.js:289` layoutKey excludes pan; board cached at `(0,0)` and drawn at `origin` — pan is translate, pitch still invalidates (smooth).
- [x] Homing `combat.js:209` → `enemiesById` via `state.enemiesById` (`state.js:84`, `waves.js:126`, `movement.js:14`).
- [x] Ward aura `combat.js:40` early-exit + squared-distance, wards collected once.
- [x] Sim facade `sim.js` — single source `_s` + `_fallback`, class accessors, single `waves`/`economy` proxies (not per `setup`).
- [x] P1/P5 as above.
- [x] Docs shelved: `SIDEQUEL.md` (future vision), `REWRITE_PLAN.md` on hold, `DESIGN.md` copied to `docs/DESIGN.md`, `archive/` populated.

---

## P1 — Data safety — DONE 2026-08-28

- [x] `Object.freeze` enums: `PARTS` + `ENEMY_KINDS` + `WAVE_PACKS`/`ENDLESS_THEMES` (`parts.js:244`, `enemies.js:183`, `waveScripts.js:33`) + sets for `doctrine/pattern/damageType/armorKind/ballast/pathing`.
- [x] `validateAtImport()` — `parts.js:247` checks doctrine/pattern/damageType; `enemies.js:184` checks armorKind/ballast/pathing/resist; `waveScripts.js:99` checks every pack/kind in `ENEMY_KINDS`; `campaign.js:6` checks packs/queues + duplicate ids + freeze `LEVEL_DEFS`.
- [x] `placeCost` now throws on unknown `base/barrel/payload` (`parts.js:312`); `ENEMY_KINDS`/`WAVE_PACKS` throw at import.

Verify: `verify.mjs` green (17 tests); `diagRun` stable.

## P2 — Parity robustness — DONE 2026-08-30

- [x] Add `tools/corpus/rebaseline.mjs` single entry (runs all `*Parity.mjs --capture` in order — was 5 separate flags).
- [x] Deduplicate goldens: checked `board/scene.png` (414K) vs `goldens/board_scene.png` (392K) — they differ, so no deletion (earlier audit claim was stale).
- [x] Pre-commit hook: `.git/hooks/pre-commit` runs `verify.mjs` only (fast). Full `simParity` stays CI (`parity.yml:36`).

Verify: `verify.mjs` green (17 tests); `rebaseline.mjs` executable; hook installed.

## P3 — Per-frame allocs — DONE 2026-08-30 (partial, safe subset)

- [x] Stain gradient cache — `boardScene.js:569` per-type `32×32` sprite + `drawImage` (was `createRadialGradient` per stain per frame, up to 80).
- [x] Projectile trail — reuse pooled `{x,y}` objects via `shift` reuse (`boardScene.js:1029`), no per-frame alloc.
- [x] Chain point reuse — `combat.js:396` `fromX/fromY` scalars + squared-distance early exit (`412`), no `{...pos}` spread.
- [ ] Tower tube — hoist `groundBasis`/`capEllipse` + `createLinearGradient` per tube (`renderTower.js:339`) — deferred (visual risk, low payoff vs above).
- [x] Atmosphere small — `boardView.js:570` reuse `shake` scratch object + hoisted `dmgForType` closure (was new `{x,y}` + closure every frame).

Verify: `verify.mjs` green (17 tests); `boardParity`/`renderParity` need rebaseline when tower gradients land (not yet). Manual `Shift+drag` pan, `⌘-scroll` zoom, `wheel` pitch still smooth (pan is cached board translate).

## P4 — UI/App collapse (2–3 days, biggest re-baseline — do last)

- [ ] Delete shims: `ui/forgeScreen.js`, `ui/techScreen.js`, `ui/endScreens.js`, `ui/menuScreens.js` (keep pure `ui/next/screens.js` + `ui/next/stateOf.js`).
- [ ] Kill `app.js:379-453` delegates — `ui/next/actions.js:24` `R` table becomes sole dispatcher with `{sim, meta, interaction, board}` context, calls `app/*Logic` directly. `registry.js:18` `mountScreen` is sole mounter.
- [ ] Remove `interaction.js` proxy — pass `interaction` explicitly; delete `app.js:115-134` getters.

Verify: `actionsParity` + `uiParity` + `chromeParity` + `qaWalk` all re-baselined deliberately; `verify.mjs` green.

## P5 — Docs tidy — DONE 2026-08-28

- [x] Campaign drift fixed: `GDD.md:64` + `CURSOR_PROMPT.md:42` + `DESIGN_HISTORY.md:24` + `AGENTS.md:41` → 12 levels; reconciled note corrected (aura live, not placeholder).
- [x] `docs/README.md` updated to list `MAINTENANCE_PLAN.md` (active checklist); `docs/MAINTENANCE_PLAN.md` is the execution checklist (this file).
- [x] `DESIGN.md` duplicate acknowledged — root `DESIGN.md` + `docs/DESIGN.md` are identical copies (intentional, both kept; `docs/README.md` notes copy). No `DEV_GUIDELINES.md` live — stays in `archive/`.

Verify: `verify.mjs` green; `git status` shows only this plan + P1 data changes.

---

## Not for this iteration

`SIDEQUEL.md` property-bag towers (single pellet L0, element-first + dual-class at 10, walls-removed/towers-block) — may become a different game.

## Execution order

P1 → P2 → P3 → P5 → P4. Each phase lands as one commit, gated. P4 last because it touches every parity gate.

---

*Checklist for execution — refer during build. Pair with `GDD.md` + `ARCHITECTURE.md` + `DEV.md`.*
