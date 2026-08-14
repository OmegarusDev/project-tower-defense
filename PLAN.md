# PLAN — Enemy pathing tiers, endless pacing, boot polish + the backlog

Status: plan only. Nothing below is implemented yet.

---

## 1. Enemy pathing redesign (the big one)

### Current state (verified against the code)

- Every ground enemy picks via `pickNextGround` → `_pickAmong` → `groundOptions`
  (blocking + soft tower-prox filter). `groundOptions` is already the single
  source of truth shared with the flow preview.
- `movement.js` maps `avoidTowers: !e.ignoreTowerAvoid` — a half-built version
  of exactly what we want: `hauler`, `hauler_ceramite`, `kiln`, `claim` already
  set `ignoreTowerAvoid: true` (they ignore towers); everyone else currently
  does the soft avoid (including basic mites/couriers).
- The soft avoid only ever chooses among **strictly equal-length** options —
  it can never lengthen a path, so nothing stalls today.

### The tier model — one explicit attribute: `pathing`

Add `pathing` to enemy defs (`enemies.js`), three values:

| pathing | meaning | who gets it |
|---|---|---|
| `"shortest"` (default) | pure shortest path — never thinks about towers (`avoid: "none"`) | **basic tiers** (mite, courier, cask, duct, phantom, ward, siphon) + **tanks** (hauler, hauler_ceramite) + **boss** (claim) + kiln |
| `"evade"` | tower-aware: walks to the far edge and down the side, out of line of fire — but exit pursuit stays primary, monotonic, never stalls (`avoid: "hard"`) | the **new skulk** (below) + **ward_volt** (the existing advanced enemy — fits its energy-specialist flavor, appears 10+) |
| (future) | any new mode = one def line + one table row | — |

This REPLACES the mixed current state (mites/couriers/wards currently soft-avoid
— a deliberate behavior change: the "tower thinking" becomes a specialist
ability, not a default). `ignoreTowerAvoid` is superseded by `pathing` and
removed.

### Implementation — extend `groundOptions` with an avoid mode

`groundOptions(x, y, { avoid: "none" | "soft" | "hard" })`:

- `"none"` — no towerProx filter (pure shortest).
- `"soft"` — today's behavior (min-prox among equal options).
- `"hard"` — among the strictly-downhill options, prefer **maximum tower
  distance**; tie-break toward the **far edge** (max |x − center|). Because
  every candidate strictly decreases `groundDist`, the path provably
  progresses — the "far edge + down the side" route emerges naturally from
  the per-step preference, and the **never-stall guarantee is the same
  invariant as today** (dist −1 per step ⇒ ≤ rows+cols steps, no loops).

`pickNextGround` reads the enemy's `pathing` via ONE lookup:

```js
// movement.js — the ONLY place pathing → behavior maps
const PATHING = {
  shortest: { avoid: "none" },
  evade:    { avoid: "hard" },
};
// pick: g.pickNextGround(x, y, { ..., avoid: PATHING[e.pathing || "shortest"].avoid })
```

The flow preview keeps rendering the default (`shortest`) flow — it is the
majority path; the avoider is deliberately off-preview (it's the surprise).
The structural link holds: both sides still read `groundOptions` (with the
same `"none"` mode for the preview).

### The new enemy: "skulk" (name TBD)

- **Spawn**: Endless wave 4+, intermittent — a `pickKind` weight ramp like
  kiln/siphon (e.g., ×0.35 under wave 6, full weight 8+), never in wave
  compositions before 4.
- **Stats (targets, to be tuned in the pacing pass)**: mid-tier — cost ~8,
  hp ~ tier-6, speed ~0.55, ballast mid, small leak, no armor, no special
  resist. Must feel like "the tower-dodger": slower than courier, tougher
  than mite, annoying rather than lethal.
- **Silhouette**: a low crawling sensor — small flat body, an eye-gem,
  dim warm trail (reuses enemyVisuals — data only).
- **Campaign**: added to a few later levels' scripts (only where it fits).

### Consistency & extensibility

- `enemies.js`: `pathing` documented per def; the attribute table in
  `movement.js` is the only behavior mapping.
- New enemy type = def line + silhouette data. New attribute = def field +
  one consumer. No special-casing anywhere else.
- `groundOptions` remains the one source of truth for both sim and preview.

### Endless pacing audit (do with the new enemy)

- **Wave gating already exists** (`pickKind` weight ramps: mite decays at 12+,
  kiln/siphon ramp at 6+, ceramite/ward_volt at 10+, claim removed 8+,
  bossChance 10+). Add skulk's ramp; verify every kind's window is
  intentional (toughness/speed/hp per wave).
- **RNG vs determinism**: composition randomness comes from the per-run
  seeded RNG — same seed = same waves (ghost replays + parity depend on it).
  "Unpredictability" stays within the seed. Document this in the plan.
- **Verify with the ladder**: re-run `simFuzz` + `ladderParity` + a few
  eyeball runs at the ladder presets; the ladder baselines are committed
  goldens — the pacing change requires a deliberate re-baseline (capture +
  review), which is the documented workflow.
- Check: does the skulk's route change wave-clear times at the fresh/earlyAA
  presets? (Shouldn't — it's wave-4+ and cheap.)

---

## 2. UI boot polish — the grey flash

### Root cause (confirmed in the code)

1. `<canvas id="game">` has no CSS background — it's transparent until the
   first paint, showing the page background (grey).
2. `TitleView.draw()` paints only on the first RAF tick (~16ms after boot).
3. The menu mounts with `.meta-enter` → `plate-enter 0.45s ease-out both` —
   the DOM starts at opacity 0, so for ~0.45s the player sees only the bare
   (mostly-flat) title sky: "plain grey texture, then the menu appears".

### Fixes (small, low-risk)

1. **Synchronous first paint**: in `App.start()`, after `showMain()`, call
   `title.tick(0); title.draw();` once — the full backdrop is painted before
   the first frame. (The game screen already does the equivalent via
   `prepareEntry()`.)
2. **Canvas CSS background**: give `#game` a background matching the title
   void (`#0c100e`) so even a pre-paint frame is never grey.
3. **Keep the animation** (it's lovely) — with the backdrop painted first,
   the 0.45s fade reads as intentional. Optionally shave to 0.3s; test both.
4. **Bonus perf**: cache the title's static layers (sky/void/panel) to a
   backing canvas, redrawn only on resize — the per-frame cost drops to the
   motes + ember (tiny). Same trick the board already uses.
5. Also verify the same flash doesn't exist on other meta screens (they mount
   over the already-painted backdrop — should be unaffected; confirm).

---

## 3. The backlog — everything discussed that has fallen by the wayside

(In priority order. Items 1–3 are the user's own notes; 4+ are knowns.)

1. **Music tempo** — the score starts slightly too fast and accelerates too
   quickly. Slow the initial tempo + the ramp (`scoreEngine`). Small, safe.
2. **Portal spawn rule** — the seam row becomes buildable; the portal must
   not spawn in a column occupied by a tower/wall; it picks an unblocked
   column. All-blocked fallback needed (design: least-occupied column or
   forced center — never a softlock). Touches the sim + the preview + tests;
   the parity corpus traces will change → deliberate re-baseline.
3. **Twin-barrel proportions** polish (+ any eyeball tweaks; the user's eyes
   are the arbiter).
4. **The facade write-through mirrors** — DONE during the oracle-free pass;
   keep the regression tests that caught them.
5. **Ghost replay UX** — works; consider a speed toggle / skip button.
6. **The app-logic modules** (forge/tech/end/undo/input) remain app-coupled
   old-style — optional future cleanup, lower priority (they work, gated).
7. **Golden-regression ceremony** — the corpus gates need a documented
   "deliberate change" workflow (re-capture + review), because wrong-but-
   stable passes silently.
8. **The "fresh" ladder target** — the kill-zone question stayed open;
   revisit after the pacing pass.
9. **Endless growSouth pacing** — verify the board-growth cadence against the
   new mid-game wall.
10. **Editor polish** — save slots, playtest difficulty knobs.
11. **Keyboard/a11y** — the menus are [data-act] buttons; add arrow-key nav
    where cheap.
12. **HUD micro-perf** — `statChips.innerHTML` rebuilds every tick; can
    diff/update only changed chips (optional; measure first).

---

## 4. Sequencing

- **Phase A — pathing tiers** (this session's next work):
  1. `groundOptions` avoid modes (`none`/`soft`/`hard`) + `canonicalGround`
     passing `"none"` (preview unchanged).
  2. `pathing` attribute on all enemy defs; remove `ignoreTowerAvoid`;
     `PATHING` table in movement.
  3. The **skulk**: def + silhouette data + wave-4 unlock + ramp.
  4. Tests: pool membership per mode, hard-avoid monotonicity (never stalls,
     reaches exit), preview unchanged for `"none"`.
  5. Re-run all gates; re-baseline ladder (deliberate capture + review).
- **Phase B — UI boot fix** (synchronous first paint + canvas bg + optional
  static-layer cache).
- **Phase C — backlog**: music tempo → portal rule → twin barrels → the rest.

## Verification for everything

- Sim traces / ladder baselines: **deliberate re-baseline + review** (the
  pacing + new enemy change the corpus — that is expected and documented).
- New unit tests for pathing modes + skulk def.
- `simFuzz` (robustness + determinism) must stay green — the skulk's RNG is
  seeded per run like everything else.
- Live walk (smoke + manual eyeball at wave 4+) with screenshots.
