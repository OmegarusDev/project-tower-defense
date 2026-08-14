# The Oracle — preserved reference implementation (design document only)

This directory is the ORIGINAL implementation of the game's sim core and
renderers, preserved verbatim from before the port. It is:

- **Not imported by anything.** The live game, the tests, the balance
  tooling and every parity gate run on the ported implementation
  (`web/js/sim/next/`, `web/js/view/next/`, `web/js/ui/next/`).
- **Not served.** It lives outside `web/`, so GitHub Pages never ships it.
- **Safe to delete.** `rm -rf oracle/` removes it completely; the corpus
  (committed goldens, traces, ladder baselines) stands in as the behavioral
  oracle for the regression gates.

## Why it's here

The port (Phases 1–6) was executed as a behavioral-parity rewrite: the new
implementation is byte-identical in behavior and pixels to this code
(verified by 12 committed gates). The oracle is kept per project decision
— it is the authoritative design reference: the formulas, the constants,
the drawing calls, the event semantics. When in doubt about what the game
"should" do, read these files; then make the change in `web/js/` and let
the gates verify.

## Contents

- `sim/` — `simWorld.js` (the original class), `combat.js`, `waves.js`,
  `economy.js` (the original sim systems; `boardGrid.js`/`rng.js` were
  shared infrastructure and remain in `web/js/sim/`).
- `view/` — `boardView.js` (the original board renderer/controller),
  `towerPainter.js`, `enemyPainter.js` (the original painters; the visual
  data now lives in `web/js/view/next/partVisuals.js` +
  `enemyVisuals.js`).

## Also preserved (git)

- Branch `oracle` — the original oracle snapshot.
- Branch `oracle-current` + tag `replica-oracle` — pre-swap main (oracle +
  full port artifacts, all gates green).

## Deliberate improvements (post-parity list)

See `PORT_PLAN.md` → "Post-parity list" for changes queued to apply on the
new implementation (music tempo, buildable seam row with an occupied-cell
portal rule, twin-barrel proportions).
