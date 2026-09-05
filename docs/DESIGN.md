> **Canonical — also copied to root `DESIGN.md` for tooling. Steps 1-4 done, Step 5 pending.**

# DESIGN — Identity, Copy, Dialogs, Forge UX + UI scour

Status: STEPS 1-4 IMPLEMENTED AND VERIFIED (copy+faction, dialogs, forge UX,
toasts+Esc). Step 5 (identity pass) is pending — break it into a million
steps when we regroup. Every change was gated; re-captures were deliberate.

---

## 0. The identity we are forging

One sentence: **brutal industrial — machinery, factories, lava, blacksmith,
natural materials with a sci-fi edge. Textural, sensory, heavy.** Everything
the player sees and reads should feel forged, not printed.

Guiding principles:

1. **Textural**: surfaces read as material (cinder, iron, ember, oil, riveted
   plate) — never flat fills. Noise/grain is allowed (already in tokens.css).
2. **Sensory copy**: words should evoke heat, weight, motion — but stay brief.
3. **Mysterious but never confusing**: lore terms may be unexplained
   (new players won't know what the Cinder is) — that's intentional — but a
   sentence must never need a glossary to parse.
4. **Never redundant, never clutter**: one phrase where two exist. If two
   strings say the same thing, delete one.
5. **Motion is material too**: the slide/fade `plate-enter` animations will be
   replaced with a **slam** — a quick, heavy settle (see §6.3). This is a
   later identity pass; the doc specs it so nothing is left to improvisation.

---

## 1. Faction rename: Slag Host → THE CINDER

### Decision
`Slag Host` is removed everywhere. The enemy faction is **the Cinder** — a
cinder is what a forge leaves behind: burnt, unresolved, still hot. As a
faction name it is nebulous, sensory, and on-theme (cinder blocks = the brutal
industrial material; cinders = the ember aftermath). The player's side is the
Forge; the enemy is its waste, given will.

### Terminology unification (existing inconsistency — fixed by this pass)

| Term | Role (kept) |
|---|---|
| **the Cinder** | the enemy faction (replaces Slag Host) |
| **the Vein** | the seam the Cinder rises from (already in the endless blurb — keep) |
| **the Claim** | the boss archetype + its unit (Claim Engine — keep; it is NOT a faction name) |
| **the Yard** | the defended ground (tagline — keep) |
| **Bastion** | the defender (keep) |

### Exact replacements

| File | Current | New |
|---|---|---|
| `ui/next/screens.js` (title credit) | `Bastion vs Slag Host` | `Bastion vs the Cinder` |
| `ui/next/screens.js` (campaign blurb) | `Seal each Yard before the Claim walks it.` | `Seal each Yard before the Cinder walks it.` |
| `data/enemies.js` (header, 2 comments) | `Slag Host archetypes` / `→ Slag Host kinds` | `the Cinder archetypes` / `→ the Cinder kinds` |
| `data/waveScripts.js` (comment) | `(Slag Host ids)` | `(Cinder ids)` |
| `view/next/enemyVisuals.js` (comment) | `the Slag Host silhouettes` | `the Cinder silhouettes` |
| `css/tokens.css` (comment) | `slag blooms` | `ember blooms` |

### Consequences
- The ui goldens (`out/ui/*.html`) contain the credit + blurb → **deliberate
  re-capture** (documented, reviewed diff).
- The screens corpus (`out/screens/*.html`) → re-captured.
- No sim/gameplay identifiers change (faction naming is cosmetic only; the
  enemy kind ids — `mite`, `claim`, etc. — are code identifiers, not copy).

---

## 2. Copy cleanup pass — the full audit

Principle applied per string: mysterious-but-clear, one idea, no stale info.

### Fixes (not just rewrites — correctness)

| Location | Current | Problem | New |
|---|---|---|---|
| Forge end-note | `Locked parts cost Parts (price rises with each purchase). Wave gifts are free. Unlock slots with Æ here or in Tech.` | **STALE**: wave-gift unlocks were removed; wordy | `Parts unlock pieces — prices climb with each buy. Slots open with Æ.` |
| Tech gift line | `Best wave N · earn Parts in runs, unlock parts at the Forge` | redundant (repeats the forge note's idea) | `Best wave N — Parts come from runs, pieces from the Forge.` |
| Settings tech note | `Ranks are permanent — pick Foundations and Arsenal upgrades with care.` | fine, but two clauses say the same | `Ranks are permanent. Choose with care.` |

### Rewrites (tone pass — mysterious, sensory, brief)

| Location | Current | New |
|---|---|---|
| Title tagline | `Shape the path. Hold the Yard.` | **keep** (already perfect) |
| Title credit | see §1 | `Bastion vs the Cinder` |
| Endless blurb | `How far can the Bastion hold the Vein?` | **keep** |
| Campaign blurb | see §1 | `Seal each Yard before the Cinder walks it.` |
| Hub "Ready" card | `No checkpoint. Start a run when your Forge is set.` | **keep** |
| Hub check card | `Wave N · seed X` | **keep** |
| Prep loadout empty | `Complete a triad in Forge.` | **keep** |
| Toast inventory | `Tap again to place · N Coin (+tax)` / `Compose a full triad in Forge first` / `Can't seal the path` / etc. | **keep** (functional, already brief) — audit for stale ones only |
| Game over | `Fallen` / `Wave` / `Leaks N · Kills N · Seed X` | **keep** |
| Victory | `Clear` / `First clear` | **keep** |
| Pause note | `Between waves — board saved. Continue keeps towers; Call starts wave N.` | **keep** |

### Rule for future copy (write into the checklist)
- One idea per sentence. Two sentences if truly needed; one is better.
- No stale mechanic references (audit against `data/` whenever a system changes).
- Lore terms appear without explanation exactly once per screen, max.

---

## 3. Native OS dialogs → game UI popups

### Decision
Replace all `confirm()` with an in-game modal — a **Cinder-sheet** (same visual
family as the pause sheet: plate, backdrop, brass action row). Promise-based so
call sites stay synchronous in shape.

### The modal spec (`ui/next/modal.js`)

```js
// API — one function, promise-based:
export function confirmSheet(container, { title, note, confirmLabel = "Confirm", danger = false })
  → Promise<boolean>
```
- Renders: backdrop (`data-act="modal-dismiss"`), plate card, title, note,
  `Confirm` (or `danger` variant) + `Cancel` buttons.
- Resolves `true`/`false` on click; Esc = false; backdrop click = false.
- Stack-safe: one at a time (a second call queues).
- Focus: confirm button on open; focus trap kept minimal (Esc + click only —
  no full trap in beta scope).

### Call sites to convert (the only three native dialogs)

| Site | Current text | Modal title / note | Resolution |
|---|---|---|---|
| `actions.js` `reset-meta` | `Reset all progress? This wipes your save and cannot be undone.` | Title: `Scuttle the Forge?` — Note: `All progress, parts and ranks are burned. This cannot be undone.` — danger | true → wipe + reload; false → nothing |
| `pauseSettings.js` `quitToMenu` | three variants (editor playtest / campaign abandon / endless return) | Title `Stand Down?` — notes per mode (see below) | true → the existing quit flow |
| `runLifecycle.js` `newRun` (hasEndless) | `Overwrite endless checkpoint?` | Title `New Claim?` — Note: `Your checkpoint — the board, the Coin, the wave — is overwritten.` | true → continue new run; false → abort |

Quit-to-menu notes per mode:
- editor playtest: `End the playtest and return to the Editor?`
- campaign: `Abandon this run? The Yard falls back to the Campaign.`
- endless: `Return to the Endless menu? Your checkpoint is saved.`

### Consequences
- The `page.on("dialog")` handlers in the smoke walk + manual walks become
  obsolete → update `smokeWalk.mjs` to click the modal buttons instead
  (the walk already needs a "quit" step that now clicks `modal-dismiss`+
  `Confirm`).
- `confirm()` disappears from the codebase entirely (grep gate in CI:
  forbid `confirm(`/`alert(`/`prompt(` in `web/js`).

---

## 4. Forge screen — slot cycling + stat bars + unlock panel

### Decision (replaces the top select buttons)

The `build-strip` of slot buttons on the Forge is **removed**. The preview
window becomes the slot navigator:

```
        ◀  [ PREVIEW WINDOW ]  ▶
           (tower render, rotating)
           [ stat bars: DMG / ROF / RNG ]
           Slot 2 · Sentry · Single · Kinetic · 14 Coin
```

- **Arrows at the sides of the preview window** (`data-act="forge-slot-prev"`
  / `"forge-slot-next"`). Clicking cycles the active slot index.
- **Empty slot**: preview shows the `incomplete` placeholder (existing) +
  three empty bars + `Slot N · empty`.
- **Next slot after the last unlocked is the UNLOCK panel**: a single slot
  that is not a real slot — `Unlock Slot N?` with the Aether cost (from
  `nextRosterSlotUnlock`) and a confirm action (`data-act="forge-unlock-slot"`,
  existing action). After unlocking, the cycle continues from there.
- **Loop-back**: next after the unlock panel (or after the last slot when all
  are unlocked) wraps to slot 1. **When all slots are unlocked there is no
  unlock panel at all** — the cycle wraps naturally.
- **Slot counter line** above the preview: `Slot 2 / 6` (or `Slot 2 / 6 · 2
  locked`) — keeps position context without the button row.
- The rest of the Forge (part grid, summary, dock) is unchanged.

### The stat bars

- Source: `buildAttackPlan(base, barrel, payload, level, {})` → normalize:
  - DMG = `plan.damage` (0–60 scale, clamp)
  - ROF = `1 / plan.fireInterval` (0–5 scale, clamp)
  - RNG = `plan.rangeCells` (0–8 scale, clamp)
- Bar rendering: filled portion + label + value. Empty slot → zeroed bars,
  grey. Bars are pure HTML (`ui/next/screens.js` — `forgeStatBars(plan)`),
  part of the forge render + `refreshForgeUi` patch.
- Damage-type tag + the existing `forgePlanSummary` line stay under the bars.

### Data / logic changes

- `rosterSlotButtonsHtml(state, "forge")` — no longer used by the forge
  screen. Keep the function for the game mode only (the in-run arsenal stays
  tiles — that is a different, correct context).
- New action handlers: `forge-slot-prev` / `forge-slot-next` in `actions.js`
  → compute next index: `(forgeSlot + delta) % totalSlots` where
  `totalSlots = slotCount + (slotCount < MAX ? 1 : 0)` (the +1 is the unlock
  panel). `forgeSlot === totalSlots` means "the unlock panel" — the renderer
  shows the unlock card and the actions route to `forge-unlock-slot`.
  Guard: unlock panel index is only reachable when `slotCount < MAX`.
- `forgeState` gains `maxSlots` (MAX_ROSTER_SLOTS) + the next-unlock quote.
- `refreshForgeUi` patches the preview wrap (bars + counter + arrows) instead
  of the strip.

### UX scour consequences for the same pattern elsewhere

- **Prep screen loadout**: same "select across the top" pattern
  (`prepSlotButtonsHtml`). Mirror the arrow-cycling here (smaller: no stat
  bars; just the slot chips become ◀ chip ▶). Keep minimal.
- **Game chrome arsenal**: KEEP the slot tiles (they carry per-slot previews
  and prices — the correct pattern for a live arsenal).

---

## 5. UI-wide UX scour — obvious tidies (no overhaul)

Priority-ordered, each with a decision:

1. **Toasts on meta screens** — `app.toast()` writes `#status`; meta screens
   without one (main/hub/campaign/settings/prep) get NO visible toast (only
   the click sound). Fix: a shared toast element on every meta screen
   (`<div class="status-toast" id="status">` already styled in the game
   chrome — reuse the class). Consequence: `uiParity` goldens re-captured.
2. **Esc closes things** — Esc dismisses: tech overlay, pause sheet, any
   open modal. (Chrome: `input.onKeyDown` gains the cases.)
3. **Undo affordance** — the undo button exists; also bind `Z` (already).
   No change.
4. **Call button during wave** — already correct (busy/hold states). No
   change.
5. **Settings pitch label** — live-updates already. No change.
6. **Editor save feedback** — `Level saved locally` toast works on the
   editor screen once (1) lands (editor has no #status today).
7. **Threat tags on prep/campaign** — keep; they are the faction vocabulary
   (labels unchanged by the rename).
8. **Duplicate `status` + `toast` fields on app** — the app keeps both
   (status = persistent line, toast = transient) but they must never render
   two competing messages on the same screen: after any toast, the status
   line clears on the next screen mount (already the behavior). No change.

---

## 6. The graphics + motion identity pass (later — this doc specs it)

### 6.1 Texture & material language (canvas + css)
- Existing: deck tiles (rivets, welds, hatch ticks), brass rivets, forge
  plates, ember motes. KEEP and strengthen.
- Add (cheap, procedural — no asset packs): subtle plate grain on large
  surfaces (the title backdrop, the forge preview well, modal cards) via a
  seeded noise overlay (hash21-based, like the deck tiles).
- Palette: keep the dark iron + brass + ember; deepen the lava accents
  (the portal already reads as a lava seam — extend to: hover/pending
  accents, unlock panels).

### 6.2 Sensory UI
- Buttons: heavier press (active transform + a 2px drop), brass flash on
  confirm actions.
- Sliders (settings/camera): brass thumb, iron track (already close — polish
  the thumb only).
- The pause sheet + modals share the Cinder-sheet plate family.

### 6.3 The SLAM (replacing fade/slide eventually)
- `plate-enter` (0.45s fade+rise) → **`slam-in`**: ~0.14s, translateY(+24px)
  → settle with an overshoot + 1px drop shadow pop; backdrop flashes
  `rgba(0,0,0,0.35)` once. Screens SLAM in; modals SLAM in harder (0.10s).
- Timing budget: entrance < 0.2s total (the current 0.45s fade reads as a
  loading delay — the slam must feel instant and heavy).
- Replaces `.meta-enter` and `.title-rise`; the gallery/probes unaffected
  (their goldens are canvas/DOM-content, not CSS animation).
- This lands with the identity pass, NOT the copy pass (goldens re-capture
  is DOM-content only — CSS animations don't affect the gates).

---

## 7. Implementation order (dependency-correct, gated at every step)

1. **Copy + faction rename** (§1, §2): mechanical string changes; re-capture
   `out/ui/*` + `out/screens/*`; review the diffs (only copy lines changed).
2. **Game dialogs** (§3): `ui/next/modal.js` + the three call sites; update
   `smokeWalk.mjs` (click modals, drop `page.on("dialog")`); add the CI
   grep-gate banning `confirm(/alert(/prompt(` in `web/js`.
3. **Forge UX rework** (§4): `forgeStatBars`, slot cycling actions, unlock
   panel, prep mirror; update `actionsParity` (new acts) + `uiParity`
   (forge goldens) + `chromeParity` (untouched) + `smokeWalk` (forge steps).
4. **Meta-screen toasts + Esc** (§5.1–5.2): small; ui goldens re-captured.
5. **Identity pass** (§6): textures, sensory buttons, the SLAM — a separate
   later phase, gated by the same corpus (CSS/canvas changes; re-capture
   only if DOM content changes — the SLAM does not).
6. **Graphics pass over the UI** (the user's follow-up) — planned on top of
   §6, after the copy + UX land.

### Verification checklist (every step)
- `node verify.mjs` (16 test files) — new tests: modal resolve/reject,
  forge cycling wrap (incl. all-unlocked), stat-bar normalization.
- All corpus gates re-run; every re-capture reviewed as a deliberate diff.
- `smokeWalk` updated per step; live manual walk: quit flows, reset-meta,
  overwrite-checkpoint, forge cycling, prep cycling, toast visibility.
- CI: the dialog-ban grep gate + the existing gates.
