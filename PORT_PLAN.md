# Behavioral-Parity Port — Master Plan & Takeover Document

**Mission:** replace the game with a 1:1 cleaner clone — identical look, feel, and behavior
("seriously exact"), built on the ideal architecture (pure sim core, registries,
data-driven visuals, screen registry), smaller and more robust. Never true 3D — the
faux-3D illusion IS the product (two-factor camera).

**Status:** Phase 0 ✓ · Phase 1 ✓ (sim core) · Phase 2a/2b ✓ (status + synergy registries) ·
2c deferred to swap (see below) · Phase 3 in progress (render) · 4–6 pending.

---

## The contract (acceptance criteria — non-negotiable)

1. **Behavioral identity** — ladder reproduces exactly (fresh 3.25 / earlyAA 13.5 /
   parts2 16 / midMeta 28.67 on identical seeds); sim traces byte-identical across
   seeds × presets × levels; ghost replay stays deterministic.
2. **Visual identity** — golden pixel buffers within tolerance (every part × angle ×
   pitch, board scenes, slot previews, all screens).
3. **Interaction identity** — DOM corpus + every flow unchanged; saves normalize identically.
4. **Zero value changes** — no balance numbers, part stats, palette colors, content.
   Architecture only.
5. **Smaller** — beat the baseline: **470,777 bytes** (web/js, measured at Phase 0).
6. **More robust** — fuzz (random seeds never crash/stall), all tests, parse gate, parity suite.
7. **Discipline** — mechanical ports, draw-order preservation, NO opportunistic fixes
   (log them; apply deliberately post-parity).

## Oracle protection

- Tag `replica-oracle` + branch `oracle` (force-push blocked, deletions blocked, PR review
  required, admins enforced) — the frozen reference.
- The live GitHub Pages game deploys `web/` only; the port lives in `web/js/sim/next/` and
  `web/js/view/next/` (additive, unreachable from the app) until Phase 6 flips the entry point.
- `git diff replica-oracle main -- web/` must show ONLY additions under `sim/next`, `view/next`
  and tooling until the swap.

## The new sim architecture (`web/js/sim/next/`)

- `state.js` — plain state factory (`createState`), RNG streams, transient fields, event bus
  (`on`/`emit`), `logAction`, `allocId`. All systems are functions over this state.
- `systems/waves.js` — compose/spawn/portal dwell (oracle's exact draw order).
- `systems/movement.js` — enemy loop, gliding, splits, kiln spawns, leaks, game-over.
- `systems/combat.js` — targeting, projectiles, chains, XP, plan cache.
- `systems/towers.js` — placement, walls, sell, branch, stall guard, preWalls.
- `systems/economy.js` — the Economy as functions.
- `combat/status.js` — status registry (data instances of dot/timed shapes).
- `combat/synergy.js` — synergy registry (burnPoison, shredFire, frostShock).
- `sim.js` — the facade mirroring SimWorld's public surface (parity harness + future app).

**Determinism discipline:** identical formulas, identical iteration order, identical RNG
draw sequences. Do not "improve the math while in there." `running` is owned by handlers —
`Sim.tick()` must never re-sync it.

## Verification gates (run before any commit)

```bash
node verify.mjs                              # parse gate + all 12 test files
node tools/corpus/simParity.mjs              # oracle vs new sim, greedy bot, full games
node tools/corpus/ladderParity.mjs           # runSim ladder + 12 campaign levels + checkpoints
node tools/corpus/capture.mjs                # (re)capture goldens/DOM — frozen time + seeded Math.random
node tools/corpus/renderParity.mjs           # Phase 3: new renderer vs goldens
cd web && python3 -m http.server 8123        # serve for playwright tools (CORPUS_URL)
```
Green = byte-identical events/state/logs (sim), metrics identical (ladder), pixels within
tolerance (render). The live game must remain the oracle throughout.

## Known traps (found the hard way — do not reintroduce)

1. Object-literal getters bind `this` to the literal — `this.waves = { get waveActive() { return this._s… } }`
   read false forever. Use arrow/`self` capture or class getters.
2. `Sim.tick()` re-syncing `running` from state clobbers handler `running=false` (wave-cleared).
3. Parity harness loops must include the `wave_cleared → running=false` hand-off, or both sims
   stall identically past wave 1 and "PARITY OK" is a lie.
4. JSON key ORDER is compared — logAction payload order matters (`{ wave, earlyBonus }`).
5. `checkpointPhase` is undefined until set (oracle default) — checkpoint() maps missing → "inWave".
6. `setStartLives` uses `BASE_START_LIVES`, never a hardcoded 3.
7. Facade surfaces (towers/enemies/portal/campaignWaves…) must be live getters/setters — a
   stale ref after `loadCheckpoint` silently reads the wrong array.

## Remaining phases

- **Phase 2c (deferred to swap):** plan-resolver step table. Deliberately deferred — a
  `mods`-array would duplicate the existing declarative part fields (more bytes, not fewer).
  The resolver collapse happens when the old `attackPlan.js` dies for real.
- **Phase 3 (render port, done):** `view/next/` with parts declaring visual
  primitives (cyl/box/frustum/ring/tube/cap/gem), generic instantiator over the two-factor
  basis (`groundBasis`/`capEllipse`/`prims25` reused). Golden-gated tile by tile
  (168 tower tiles) and enemy by enemy (24 tiles). Board scene ported as pure
  renderers in `view/next/boardScene.js` (shadow/field/deck tiles/brackets/walls/
  bastion/path/portal/stains/tower frames/enemy frames/projectiles/ghost/pending/
  hover/atmosphere) — byte-identical vs the oracle BoardView methods on shared
  cameras (`tools/corpus/boardParity.mjs`). Badge + selection ring added to
  renderTower (untested by the tile goldens — showBadge:false there).
- **Phase 4 (in progress):** UI registry — `ui/next/screens.js` meta screens as
  pure render fns over explicit state (main/settings/campaign/prep/hub/forge/tech/
  editor + forgePlanSummary + rosterSlotButtonsHtml) + `ui/next/registry.js`
  (SCREENS + mountScreen), gated by `tools/corpus/uiParity.mjs` (7 cases,
  byte-identical). Game chrome done: `ui/next/chrome.js` (chromeHtml +
  composeSheetHtml + pauseSheetHtml + statChipsHtml + slotLineHtml +
  callButtonState + syncHud/syncBuildDock/syncTowerOverlay incl. positioning),
  gated by `tools/corpus/chromeParity.mjs` (4 variants: plain/busy/paused/
  compose, byte-identical). Action dispatch done: `ui/next/actions.js`
  (data-act → handler table, exact order), gated by
  `tools/corpus/actionsParity.mjs` (60-act vocabulary × 5 state variants,
  spy call traces identical). The app.js class-shell decomposition lands in
  Phase 6 (the oracle runtime stays untouched until the swap).
- **Phase 5 (done):** CI — `.github/workflows/parity.yml` runs verify + every
  parity gate (sim/ladder/fuzz/render/board/ui/chrome/actions/oracle-enemies)
  on push+PR. Sim fuzz: `tools/corpus/simFuzz.mjs` — seeded random-action
  streams over both sims with per-action result + event + state-hash checks;
  it caught two real facade bugs (startWave return/event identity, `running`
  mirror after game over) — both fixed.
- **Phase 6 (done):** swap completed — main now launches the NEW implementation
  (next Sim facade, next BoardView, screen/chrome/action registries).
- **Oracle-free (done):** nothing imports the oracle anymore — the live game,
  the unit tests, the balance tooling and every gate run on the next
  implementation. The oracle is COMPLETELY OUT of the game's codebase: the
  original implementation lives in the museum repository
  `OmegarusDev/project-tower-defense-oracle` (browseable, never runs), and the
  pre-swap snapshots are preserved in this repo's git refs — branch `oracle`
  (original snapshot), branch `oracle-current` + tag `replica-oracle`
  (pre-swap main, all gates green). Gates are now corpus/golden-based: simParity (committed
  traces), ladderParity (committed baselines), simFuzz (robustness +
  determinism), boardParity (committed goldens), ui/chrome/actions (committed
  goldens), renderParity (committed goldens), smokeWalk (live app). The sim
  facade gained write-through mirrors (lives/waveIndex/running/runLevelCap/
  checkpointPhase/earlyBonusWave/seed + waves.toSpawn/waveActive/queue/
  lastTheme/lastEvent/speedMult) so app/test writes behave exactly like the
  oracle's single-field world.

## Post-parity list (deliberate improvements, applied after the swap certifies)

- Twin-barrel proportions polish.
- Any aesthetic tweaks found during eyeballing (user's eyes are the final arbiter).
- Music tempo: the score starts slightly too fast and accelerates too quickly —
  slow the initial tempo and the ramp (tune in scoreEngine).
- Portal spawn rule (from the user): the seam row should be BUILDABLE; the portal
  must not spawn in a column occupied by a tower or wall — it picks an unblocked
  column (optionally the player can force it to a spot). Needs a fallback rule
  for the all-blocked case (never a softlock) — design decision to make at
  implementation time.

## Dev tooling

- `package.json` (dev-only): playwright. Game itself stays zero-dep. `node_modules` is gitignored.
- Gallery: `web/tools/gallery.html` (live) — part tour + 13-check self-check + goldens source.
- Corpus fixtures live in `tools/corpus/out/` (committed — they are the gate).
