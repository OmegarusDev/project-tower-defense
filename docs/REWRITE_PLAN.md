# Rewrite Plan — Forgeworks TD (major final rewrite) — ON HOLD (SIDEQUEL)

> **ON HOLD — SIDEQUEL / FUTURE VISION**
> This plan is **shelved** for THIS iteration. It captures the property-bag tower vision from 2026-08-28 (see `SIDEQUEL.md`) and may become a **different game / sidequel**. Do not treat as the active plan for the current codebase. The active docs for this iteration are `GDD.md` + `ARCHITECTURE.md` + `DEV.md` + `AGENTS.md`.
> Status before shelving: consolidated `history/PLAN.md` + `history/BETA_PLAN.md` + discussion threads into one doc. The 4-doc set it envisioned was `GDD.md` + `ARCHITECTURE.md` + `DEV_GUIDELINES.md` (now `archive/DEV_GUIDELINES.md`) + this file.

**Title (proposed for sidequel):** **Forgeworks TD** — the forge is the USP (you forge your own towers). See §1. *Rebrand is deferred with the sidequel.*

**Vision anchor:** §2 → `SIDEQUEL.md`. **Execution branches:** §4 (neutral — deferred). **Phases:** §5. **Open decisions:** §6.

---

## 1. Rebrand

**From:** Project Tower Defense → **To:** **Forgeworks TD**

Rationale: `web/js/data/parts.js` already uses the "Forgeworks triad" naming internally (`LEGACY_NOTES.md:13`); the faction rename thread converged on **"the Cinder"** (`history/PLAN.md:214`); the USP is the forge system — you forge your own towers. `Forgeworks TD` ties code, lore, and USP.

Follow-through (deferred to the Identity pass, Phase E):
- Update `AGENTS.md` header, `GDD.md` identity table, `PLAY.html` title, `manifest` name if PWA.
- Keep the save-store stable — no save migration needed for a title change alone.
- Full visual identity (the Cinder faction, brutal-industrial textures, sensory buttons) stays in the final polish phase.

---

## 2. Game vision — the new tower system

### 2.1 Core principle

> **Emergence comes from the properties held by the parts a tower is composed of.**

A tower is a bag of **properties**. The combat sim resolves that bag through a small set of generic rules. New interactions appear automatically when you combine parts — no hand-authored "fire + beam = X" pairing.

The current `Base × Barrel × Payload` composition is the *inspiration*, not the target. It will be **replaced** (eventually) by a single-tower + upgrade-parts system (see §2.2). Modeled so the old system can serve as the reference prototype until the new sim is ready.

### 2.2 The new tower

- **L0 — the base tower:** a single, boring, standard **single-shot pellet** ("pew pew"). Every placed tower starts here.
- **Upgrade parts:** earned **in-run** (currency from kills → level-up → spend on *any* tower). Each part adds properties to that tower's bag and pushes it down a specialization. Upgrade parts are **data-declared** (no code per part); code implements each *property-kind* once.
- **Lifecycle:** upgrades **reset each run**. The meta currencies (**Forge/Aether**) unlock *which upgrade-part types exist at all* (so the meta is "what *can* I build," the run is "what *do* I build"). This replaces the current B×B×P roster/Forge unlock model.

### 2.3 What a "property" is

A property is a typed behavioral attribute in one of these buckets:

- **Delivery shape** — how force leaves the tower: `pellet` → `beam` (continuous line, can arc), `aura` (field around the tower = a zone), `chain/arc` (leaps between enemies), `cone/spread`, `radial 360`, `rail pierce`, `lob AoE`, etc. *Barrel was trying to be this; now it will be explicit.*
- **Element** — what the delivery does: `kinetic`, `pyro(burn/ignite)`, `shock(chain/disable)`, `frost(slow→freeze→shatter)`, `poison(DOT stack)`, `acid(armor-strip)`, `breach(pierce)`, `emp(strip shield)`.
- **On-hit / passive / zone** — `applies:ignite`, `leaves:burningGround(zone)`, `reactsTo:wet→steam`, `periodicTick`, `auraBuff`, etc.
- **Targeting doctrine** — `first / closest / strongest / air→first / last / weakest` — the old Base doctrines, now a *property* rather than a fixed base class.
- **Modifier** — `armorIgnore`, `slowOnHit`, `executeAmp`, `airCapable`, `sustainedContact`, etc.

A tower's *effective behavior* = the union of its bag, resolved generically. Example (the user's electric case, re-described):

- **Electric** (element = `shock(chain)`) + **pellet** (shape) = one bolt at a target.
- Electric + **beam** = a continuous line that can arc to nearby enemies.
- Electric + **aura** = a field that zaps anything inside it continuously.
- Electric + **chain** = a bolt that jumps between enemies.
- Electric + **360** = a ring hitting everything around the tower.

Same element, opposite roles — because the *shape* changed, not the stat.

### 2.4 Upgrade structure — hybrid with specialization paths

- **First upgrade ≃ choose an element.** This is the specialization branch — the primary identity of that tower.
- **Subsequent upgrades** add delivery shapes, modifiers, passives/zones, doctrines. Most towers will be *element-first, shape-second*.
- **Tags + synergy bonuses:** parts carry tags; certain tag combos grant explicit bonuses (guides players without hard-locking paths). The tags are how the data layer hints at "good combos" while preserving free-mix emergence.
- **Dual-class at L10:** at a high level a tower can take a *second* element/property branch → late-game emergent combos (fire + shock, frost + poison, etc.). The capstone of "uniquely yours."
- **Target size:** small, tunable property catalog + a handful of generic resolver rules → combinatorial explosion of behaviors from few parts. That's the "thick, dynamic" feel.

### 2.5 Maze & the snake-lane problem

**Current state:** towers + walls block ground path; shortest-path BFS; wall price scales; roaming seam portal. Intended as maze play. The user is "stuck with the flaw of there being one obvious solution (snake lane)."

**Clarification — "blocking towers" / "blocking cost":** Two conflated terms in the current code:
- **Blocking** = a cell is `blocked` (`BoardGrid.blocked`) so ground pathing routes around it. Towers (`towerMask=true`) and player walls (`WALL_BASE_COST` + `WALL_STEP` per wall owned, see `systems/economy.js`) both set `blocked`. Flying enemies ignore it (`BoardGrid` air layer).
- **Wall cost = "blocking cost"** — `wallCost = WALL_BASE + WALL_STEP * ownedWalls` — the coin price that rises with each wall. This is *not* a separate "blocking cost" stat; it's a wall-price curve.

In the *new* system (walls removed): **towers themselves occupy a cell and set `blocked`**. Every placed tower is both a shooter and a maze tile.

**Why snake dominates:** Every maze tile is also productive (a shooter), so the longest possible snake is strictly optimal — more exposure *and* more guns, zero downside. The portal shuffle adds dynamism but, as observed, is a nuisance rather than a meta-breaker.

**Stance in this plan:** The user said *"I'd like to break away from the maze if possible, but I think we might have to live with it."* So the rewrite breaks away *as far as possible* without ripping out maze entirely:

- **Design fix — composition becomes the primary puzzle, not geometry.** Property *synergies* (freeze→shatter, oil→ignite, mark→detonate) only trigger in a **concentrated kill-zone**, so a tight synergy pocket *out-performs* a long snake of identical towers. Optimal maze becomes **composition-dependent** → no single best lane. This is an emergent fix, not a maze-design fix.
- **Structural guardrail (so maze isn't free):** a placed tower that also blocks has a *reduced* combat profile versus an open-field tower (or: a cheap non-shooting **barricade** upgrade-part bribes the exchange — path length costs firepower again). This is captured as a task in §5.
- **Flyers ignore blocks** (already built) → maze irrelevant vs air waves, forcing open-lane + anti-air answers.
- **Roaming portal** kept for dynamism (rare, telegraphed), but *not* relied upon as the anti-snake lever.

---

## 3. Documentation overhaul — the 4-doc set

Replaces `CURSOR_PROMPT.md`, `history/PLAN.md`/`BETA_PLAN.md`, `DESIGN_HISTORY.md`, `LEGACY_NOTES.md` as living docs (kept under `docs/archive/` for reference, not spec). `AGENTS.md` points at the new set.

| Doc | Role | Replaces / folds in |
|-----|------|---------------------|
| `docs/GDD.md` | **Living spec.** Opens with the new tower vision (§2 above) + rebrand identity. Modes, economies, map, combat via properties, upgrade paths, enemies, meta, audio/visual, menus. | `GDD.md` + `CURSOR_PROMPT.md` |
| `docs/ARCHITECTURE.md` | **Technical reference.** For the *chosen* rewrite path: sim/event/view/ui boundaries, retained-mode board, `enemiesById`, facade-vs-state resolution, parity contract, save/migration. | `ARCHITECTURE.md` |
| `docs/DEV_GUIDELINES.md` | **Future-dev rules.** No `console.log`/assets/build, parity gates, data-driven content, migration discipline. **How to add a property / upgrade part** (declare properties + implement kind + add test + re-baseline). | New (distills `DEV.md` + CI rules) |
| `docs/REWRITE_PLAN.md` | **This file.** Execution plan, neutral branches, phases. | `history/PLAN.md`, `history/BETA_PLAN.md` |

Rule going forward: **GDD is the only gameplay authority**; ARCHITECTURE is the only code authority; DEV_GUIDELINES is the only process authority. `AGENTS.md` is the single agent entry point.

---

## 4. Rewrite branches (neutral — decision deferred)

The current codebase (`web/`) is the **reference prototype** for any future greenfield rebuild (`AGENTS.md` sacred rule #1). Its `sim/next` + `balance/` headless harness is solid and parity-gated — this is the reliable foundation under every branch.

### Branch A — Greenfield new repo

Rebuild from scratch in a fresh repo; current `web/` is only a reference. Clean architecture from day one: single UI dispatch, retained-mode board + camera transform, `enemiesById`, resolved `Sim` facade duplication, property-bag combat from the first commit.

*Pros:* no legacy `ui/` shim carryover, best long-term shape. *Cons:* re-port *all* shipped content (parts/towers/waves/campaign/tech/economy/save), re-validate parity, longest time-to-playable; risk of regressing shipped feel.

### Branch B — In-place (reuse pure sim core)

Keep `sim/next` + `balance/` as-is; replace `view/` (retained-mode board) + collapse `ui/`/`ui/next` shims into a single dispatch + resolve `Sim` facade/state duplication + evolve combat to the property model. Ship iteratively on the current repo.

*Pros:* lowest risk, fastest playable, preserves the tested sim + ladder. *Cons:* inherits some structure; still a large in-place refactor.

### Branch C — Hybrid

B's sim evolution + a *clean* greenfield `view/` + `ui/` layer written on top of the existing pure sim (no `ui/` shim carryover). The structural sweet spot between A and B.

*Choosing among them:* The plan presents them neutrally per the user's instruction. The recommended way to decide is to complete **P0–P1** (vision + property vocabulary) — the cheapest work — then estimate **P2–P4** under each branch against appetite for time-to-playable vs long-term cleanliness. Do not decide before P0.

---

## 5. Phases (common core — branch-independent)

All phases assume `verify.mjs` + parity gates stay green after any deliberate change (deliberate re-baseline is the documented workflow — see `DEV_GUIDELINES.md`/`ARCHITECTURE.md` invariants).

**P0 — Lock vision in docs.**
- Define the property vocabulary + tags + synergy rules; freeze the L0 boring pellet + element-first + dual-class-at-10 contract. Draw the example electric case and one cross-tower synergy (oil→ignite, freeze→shatter) as canonical examples in GDD.
- Decide the name is locked as **Forgeworks TD** (this plan's §1).

**P1 — Sim combat evolution (the deepest work).**
- Property resolver: deliver shapes (pellet/beam/aura/chain/360/rail/lob), elements, on-hit/passive/zone, doctrine, modifier.
- Interactions as generic rules over properties (not per-pair hand code). Retain `AttackPlan` as the single resolver.
- **Critical perf fix (highest-value):** homing target lookup via `enemiesById`/`targetRef` instead of per-tick `enemies.find` (`sim/next/systems/combat.js:209` — O(projectiles×enemies)/tick).
- **Aura pass fix:** bound the O(n²) ward scan (`combat.js:40-70`).
- Keep `balance/` + greedy bot exercising the new properties.

**P2 — Retained-mode board + camera.**
- Render the board once to a board-local offscreen layer; apply pan/zoom as a `ctx` transform instead of re-projecting every tile each frame (`boardView.js:273-284`, `boardScene.drawField` — ~240 tiles × ~30 point objects/frame during camera glide).
- Cache stain gradients per type; single-projection path; ghost/selected-plan memoization.

**P3 — Single-tower + upgrade system.**
- Remove `Base×Barrel×Payload` roster/compose + walls-as-separate (`Wall/Place`).
- One placeable tower; upgrade parts add properties (first ≃ element; L10 dual-class).
- Towers occupy `blocked`; introduce the "blocking cost" guardrail (reduced profile while blocking *or* a cheap non-shooting barricade part — decision in P3 design task).
- Metalayer: Forge/Aether unlocks which *types* exist; run upgrades reset.

**P4 — UI consolidation.**
- Collapse `ui/` legacy shims + `ui/next/` into a single `render(screen, state) → DOM` + one `runAction` dispatcher; remove the ~70 `App` delegate methods that make `App` the implicit global context.

**P5 — Docs (the 4-doc set).**
- Render `GDD.md` + `ARCHITECTURE.md` + `DEV_GUIDELINES.md` from this plan + the decisions in P0.

**P6 — Parity re-validation.**
- Re-baseline the `balance/` ladder (fresh/earlyAA/parts2/midMeta) deliberately and review — same ceremony as the prior pathing refactor.

**Backlog (deferred, not lost):** Identity/polish pass (the Cinder faction, brutal-industrial textures, SLAM motion), PWA wrap, campaign slate beyond Act I.

---

## 6. Open decisions (deferred — tie before P0 closes)

- **Rebrand follow-through:** `PLAY.html` title, `manifest.json` name, on-screen chrome — trivial renames, done in the Identity pass.
- **Guardrail choice in P3:** reduced firepower while blocking *vs* barricade-part *vs* both — picked during P3 design, not earlier. The full "blocking towers / blocking cost" clarification is in §2.5.
- **Property catalog size + tag set + dual-class cost/UX:** defined in P0 against playtest, not spec'd upfront beyond "small catalog, few generic rules → many behaviors."

---

*End rewrite plan. Successor to: `docs/history/PLAN.md`, `docs/history/BETA_PLAN.md`, §3 planning threads. Pair with: `docs/GDD.md`, `docs/ARCHITECTURE.md`, `docs/DEV_GUIDELINES.md`.*
