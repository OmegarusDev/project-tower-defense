# BETA_PLAN — First full public beta release

**Purpose**: a self-contained execution plan for another session. Everything
decided here is final unless the user overrides. Do not re-derive decisions;
do not start the identity pass.

---

## Definition of done (the release bar)

1. All 10 gates green on the release commit (`verify` 17 tests, sim traces,
   ladder, fuzz, render 194, board, ui, chrome, actions, smoke walk).
2. The four user-reported items are resolved (music tempo, portal spawn rule,
   twin-barrel proportions, fresh-run balance).
3. Manual QA checklist passed at THREE device ratios (phone portrait 430×932,
   tablet landscape 1280×800, desktop 1920×1080) with zero console
   errors/warnings.
4. A visible build stamp on the title screen (e.g. `v0.9-beta`) + the
   feedback path documented (GitHub Issues; no telemetry — privacy).
5. Release tagged (`git tag beta-1`) + deployed Pages site verified loading
   the tag's code.

---

## Phase 0 — Fresh audit (first thing)

- Clean checkout → run every gate + the smoke walk once (the commands:
  `node verify.mjs`; `node tools/corpus/{simParity,ladderParity,simFuzz,
  renderParity,boardParity,uiParity,chromeParity,actionsParity,smokeWalk}.mjs`;
  serve `cd web && python3 -m http.server 8123` first).
- Full manual playthrough on each target ratio with the console open
  (errors AND warnings). Play: title → endless (place/sell/undo/wall →
  wave → pause → speed → quit-modal → continue) → campaign (prep → start →
  win a level → victory screen → die → game over → ghost replay) → forge
  (cycle slots, stat bars, unlock panel, buy/equip/clear) → tech (buy,
  overlay, tabs) → settings (every control, reload persistence) → editor
  (playtest → quit → back).
- Sweep `web/js` for stray `console.log`/debug output (grep; remove or
  gate behind a flag).

---

## Phase 1 — The four user-reported items (beta blockers)

### 1.1 Music tempo (user: "starts slightly too fast and gets faster too quickly")
- **Where**: `web/js/audio/scoreEngine.js` — the tempo + acceleration
  constants. Read them first; they are the only tuning surface.
- **Direction**: lower the initial tempo and flatten the ramp. Concrete
  target to verify BY EAR against the current build: initial tempo ≈ −15%
  of today, ramp slope ≈ −40% of today's (the session may adjust ±; the
  judgement is "settles, doesn't sprint").
- **Verify**: a short playtest note per preset; no gates cover audio.

### 1.2 Portal spawn rule (user: buildable seam; portal avoids occupied columns)
- **Decision (locked)**: the seam row (y=0) becomes buildable. The portal
  must not spawn in a column occupied by a tower or wall.
- **Behavior spec**:
  - Wave start chooses the portal column from the columns whose seam cell
    is NOT blocked/occupied. If all are occupied → fallback: the
    least-occupied column (tie → deterministic hash, same as today's
    picks); if every column is full → force the center column (never a
    softlock).
  - Enemy spawns follow the portal column (already reachability-fallback
    via `groundOptions`/`spawnPos`).
  - The flow preview updates automatically (it reads `groundOptions`).
- **Where**: `web/js/sim/next/systems/waves.js` (`buildPortal` /
  `relocatePortal`), the campaign `spawnCells` path unchanged.
- **Tests**: portal test additions (occupied-column avoidance, all-blocked
  fallback, determinism). **Corpus re-baseline**: sim traces + ladder
  baselines change — regenerate with `simTrace.mjs` + `ladderParity.mjs
  --capture`, REVIEW the diffs (only portal-related deltas).

### 1.3 Twin-barrel proportions + eyeball pass
- **Where**: `web/js/view/next/partVisuals.js` (the twin barrel geometry
  data). The user's note: proportions are off.
- **Do**: adjust the twin-barrel data (gap/width/length), then eyeball the
  whole part catalogue in `web/dev/gallery.html` (194 goldens re-capture
  ONLY if pixels change — deliberate).
- **Also**: a general silhouette pass over bases/barrels/payloads with the
  user's eyes as arbiter; log any tweaks with before/after notes.

### 1.4 Fresh-run balance (the kill-zone question)
- **Open decision for the user** (mark it clearly in the session kickoff):
  is dying on the first few waves acceptable for a fresh run, or should a
  fresh run reliably clear wave 3-5? The ladder preset `fresh` is the
  instrument: current baseline (after the pathing tiers) is in the
  committed ladder goldens.
- **Do**: tune the early budget/HP curve only after the user answers;
  re-baseline the ladder. No other balance changes in this phase.

---

## Phase 2 — UX completeness (from DESIGN §5 + the backlog)

### 2.1 Editor polish (backlog)
- Save slots (the editor already persists locally; add slot labels /
  delete) + a playtest difficulty knob (waves/cash presets). Keep minimal;
  gates: smoke walk's editor steps + a manual playtest.

### 2.2 Ghost replay UX (backlog)
- Replay speed toggle (1×/2×/4×) + a skip button on the game-over screen's
  replay. `replay.js` + `simBridge.startGhostReplay` are the touch points.
  No gate impact (replay is app-flow; smoke walk covers entry).

### 2.3 A11y (backlog)
- Menus: arrow-key navigation over the `[data-act]` buttons + a visible
  focus style (the buttons already have hover states; add `:focus-visible`).
- Reduced-motion is already handled (`prefers-reduced-motion`).
- Verify with a keyboard-only pass of the three main flows.

### 2.4 HUD micro-perf (backlog, optional)
- `statChips` innerHTML rebuilds every tick. MEASURE first
  (`performance.now` around `syncHud` at 60fps on desktop); only optimize
  (diff/replace changed chips) if it shows in the frame budget. No gate
  impact (DOM goldens compare content, not timing).

### 2.5 GrowSouth pacing check (backlog)
- Play 30+ endless waves; verify the board-growth cadence doesn't strand
  towers or crowd the buildable area. Adjust only with a ladder re-baseline.

---

## Phase 3 — Content + balance validation

- **Campaign**: all 12 levels verified beatable on a fresh meta (the
  ladder campaign runs are the data — check for any level with near-zero
  clear margin; tune that level's script only).
- **Endless pacing audit** (from PLAN.md): enemy windows (skulk 4+, kiln/
  siphon 6+, volt 10+, boss cadence) — confirm each kind's window feels
  intentional; the composition RNG is per-seed (determinism is the design).
- **Ladder presets** as the tuning instrument for any final numbers.

---

## Phase 4 — Release engineering

1. **Build stamp**: title screen footer `v0.9-beta · <commit short>` + the
   console breadcrumb. One constant (`web/js/data/build.js` or a string in
   `main.js`); the ui goldens re-capture (deliberate — the stamp is in the
   title DOM).
2. **Feedback path**: README + a `BETA.md` at the repo root ("what's in,
   what's known, report via Issues"). NO telemetry (decision: privacy).
3. **Known-issues doc** for the beta announcement: the honest list
   (balance is in-progress; identity pass is coming; a few cosmetic AA
   notes). Published in `BETA.md`.
4. **Release checklist** (run in order): gates → smoke → manual QA matrix →
   tag `beta-1` → push → verify the deployed Pages URL serves the tag's
   code (check a marker file/JS from the tag) → announce.

---

## Phase 5 — DEFERRED (do not start)

- **The identity pass** (DESIGN.md §6): textures, sensory buttons, the
  SLAM motion replacing fade/slide. The user will break it into a million
  steps in a dedicated session AFTER the beta is stable. Explicitly
  reserved — do not begin it here.
- **Aspect-ratio reactivity** (the 480px shell widening + landscape game
  layout): on the back burner by user decision. Do not implement.

---

## Handoff notes for the executing session

- **Git quirk**: `GITHUB_TOKEN` is stale in the environment — prefix every
  `git`/`gh` push with `unset GITHUB_TOKEN &&`.
- **Corpus workflow**: any deliberate change re-captures goldens/traces
  (`--capture` modes) and the diff is REVIEWED, never blind. Screens/
  board artifacts are non-gated capture output (churn expected).
- **Reference (retired)**: `OmegarusDev/project-tower-defense-oracle` + branches
  `oracle`/`oracle-current` + tag `replica-oracle` were retired on 2026-08-26; this
  repo no longer references any external prototype.
- **Docs hierarchy**: BETA_PLAN.md (this file) → DESIGN.md (identity/UX
  specs) → PLAN.md (architectural phases). Read DESIGN §1-5 before touching
  UI copy or UX.
- **The one open user decision**: fresh-run difficulty philosophy (1.4).
  Ask for it at kickoff; everything else is locked.
