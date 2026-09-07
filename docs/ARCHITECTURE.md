# Architecture — Project Tower Defense

Vanilla web prototype: layered sim, distance-field pathing, single AttackPlan resolver, procedural paint/audio. **Zero external engines, npm, or art/SFX packs.**

## Layout

```text
web/
  index.html
  css/           # tokens, shell, title, forge, tech, game-hud, meta, editor
  js/
    main.js app.js saveStore.js
    app/         # metaSync, runLifecycle, simBridge, gameChrome, placeUndo, input, pauseSettings,
                 # endsLogic, forgeLogic, techLogic, undoLogic, fastForward
    ui/          # actions, screens.js barrel + screens/{helpers,meta,workshop,end},
                 # registry, chrome, modal, stateOf, menuScreens, forgeScreen,
                 # techScreen, endScreens, levelEditor, metaUi, partIcons, replay, xClose
    data/        # parts, techTree, campaign, enemies, waveScripts, endlessGrid, rules
    sim/         # boardGrid, attackPlan, rng, state, sim (command adapter over state),
                 # systems/{combat,economy,movement,towers,waves}, combat/{status,synergy,targeting,hits}
    balance/     # headless runSim + greedyBot + scenarios (no DOM)
    view/        # palette, drawUtil, primitives, fx, titleView, camera (Anvil Engine),
                 # boardScene.js barrel + boardScene/{geom,ground,path,units,atmosphere}, boardView,
                 # enemyVisuals, partVisuals, renderEnemy, renderTower
    audio/       # SynthBank SFX+Music buses; ScoreEngine generative ambient
    tests/       # node smoke tests (17 files, run via verify.mjs)
  docs/            # GDD + prompts + legacy notes
  PLAY.html        # thin launcher → GitHub Pages
  .github/         # Pages deploy (uploads web/)
```

`app.js` is a thin orchestrator (ctor, start/tick, wireSim, bindUi). Screen and run logic live under `js/app/*` and `js/ui/*` as `function foo(app, …)` modules — call them directly, not via `app.*` shims. Sim commands live on `Sim`; all run data lives on `sim.state` (plain object). HUD adapters in `stateOf.js` freeze a snapshot (`quotes[]`, boolean `waveBusy`, `overlayAnchor`) — renderers never close over `app`. Anvil Engine is the 2.5D camera + primitives + board view (`view/camera.js` + `primitives.js` + `boardView.js`/`boardScene.js`) — lightweight, no game deps; Forge is the in-game parts shop (`app/forgeLogic.js` + `data/parts.js`).

Events: `sim.on` / `sim.off` (and `state.js` `on`/`off`). `App.wireSim` is idempotent per instance; `_unwireSim` removes the stored handlers.

## Pipelines

| Engine | Role |
|--------|------|
| `BoardGrid` | Exit BFS distance fields (ground + air); per-enemy next-step with soft tower-avoid (air unchanged). Live fork ties alternate via a per-cell round-robin counter with the decision cached on the enemy (`_pick`), so mid-glide re-picks are stable — no tick-hash jitter, no fork freezing. Canonical viz path keeps DIR-order |
| `AttackPlan` | `(base,barrel,payload,level,opts)` → pattern/damage; auto-level + branch ranks; base×barrel range/ROF mults stack with Arsenal ranks |
| `combat` | Targeting, projectiles (pierce / ballistic / homing coast), pulses, status, XP→auto-level + pending branch picks |
| `waves` | Wave compose (endless themes / campaign packs), spawn pacing, **roaming seam portal** (rare telegraphed shifts between clumps, spawn-time reachability guard), enemy HP/speed scaling |
| `ProcPalette` | Colors + colorblind LUT (default off) |
| `SynthBank` | Bake SFX PCM at boot; Music/SFX buses on shared AudioContext |
| `ScoreEngine` | Generative ambient pads + kick; reacts to wave/density/phase/speed; pause ducks Music bus |
| `balance/` | Headless `runSim` + greedy bot + Monte Carlo CLI — no simBridge/DOM |

Endless checkpoints store `phase` (`inWave` | `betweenWaves`), `earlyBonusWave`, and `metaAppliedGains`. Meta Forge/Aether merge via run-gain deltas only; Continue re-seeds the sim vault from current meta.

### Seam portal (spawn origin)

`state.portal` is the live spawn cell. Endless: the waves system builds a seeded shuffle
cycle of back-line columns at wave 1 (`_portalRand`, own stream — independent of the
compose/jitter `_rand`). Shifts are clump-gated and deliberately rare — `shiftsForWave`
gives 0 before wave 8, 1 through wave 21, then +1 per 10 waves. Each shift is
telegraphed: `pickPortalX` precomputes the target column (no RNG draws — cycle order
only), `portal_unstable {toX}` fires with a 2.5s warning (HUD cue + portal agitation),
then the move applies (`portal_moved`, `_portalIdx` advances, never re-sits on the last
cell). Campaign: `levelPortalCell(lv)` pins one cell for the whole level — default
center back line, or authored `spawnCells` (any tiles; 40+ levels may spawn mid-board);
`bootLevel` guards against preWalls sealing the pick. Spawn-time guard in `spawnPos`:
if the scheduled cell is unreachable (player walls), fall back to the first reachable
back-line cell (deterministic scan), then canonical spawn. The seam row (y = 0) is
buildable except the spawn cell; occupied seam columns are dodged at pick time and a
fully-walled board forces the center.

Enemy pathing is portal-independent by construction: `BoardGrid._bfs` seeds from the
exit only, so distance fields are spawn-agnostic. The former per-portalX BFS map cache
was removed after proving every entry byte-identical to the shared field.

### In-run leveling

XP fill under `levelCap` auto-levels the tower (+uniform Dmg/ROF/Range) and banks a **branch pick**. Overlay (or `U` = Damage) spends picks via `tryChooseLevelBranch`. At cap the XP bar freezes — no endless point bank.

### Headless balance

```bash
cd web
node js/balance/monteCarlo.mjs --runs 12 --preset fresh
node js/balance/monteCarlo.mjs --runs 12 --preset earlyAA
node js/balance/monteCarlo.mjs --runs 12 --preset parts2
node js/balance/monteCarlo.mjs --runs 4 --preset midMeta --max-waves 45
```

Presets ladder the Forge progression (all bots are greedy — real players do better):
`fresh` (starters only, cap 1) → `earlyAA` (+rail) → `parts2` (+rail/twin/bulwark, cap 2) → `midMeta` (cap 4 + tech).
Measured on the shipped endless map (`ENDLESS_GRID`, 9×8).
Difficulty rebalance (2026-08-13): start Coin 75→50 (leaner opening, fewer enemies)
packs trimmed ~20% (fewer enemies, tighter margins), endless HP gets a tighter
opening (×1.08^min(2,w−1)) and a mid-game wall (×1.025^min(9,w−7)) that
compensates the roaming-seam spread; rail place cost 18→12 so the first Forge
purchase still pairs up at the tighter economy. 12-run medians after:
fresh 4.9w/GO 1.0 (brutal, no-meta treadmill), earlyAA 12.7/.92, parts2 14.4/.92,
midMeta 28.7/1.0 — meta buys ~6× depth. Fresh is intentionally very hard;
War Chest / Iron Guard / Bargainer / level caps are the ball-rolling curve.
After the fork-path fix (2026-08-13, tick-hash jitter removed): fresh 3.25/1.0
(the 2-tower opening is kill-zone bound — a mite escapes the starter pair each
wave; HP-insensitive), earlyAA 13.5/.92, parts2 16/.92, midMeta 28.67/1.0 —
smooth alternating flow spreads traffic, easing the mid-game slightly.
`node js/balance/diagRun.mjs --preset fresh --seed 1` gives per-wave leak/kill detail.

Enemy HP (endless): ×1.05/wave steady growth, ×1.02/wave extra past wave 15 so late
endless outpaces meta investment; plus the endless-only opening + mid-game terms
above. Campaign keeps the classic curve (authored queues). Wave-gift unlocks were
removed (2026-08-13) — all parts are Forge purchases; legacy saves keep gifted
parts (migrated as paid).

> Note (2026-08-13): the combat refactor landed. Cross-status synergies are live
> in `CombatSystem`: burn×poison (+50% poison tick while burning), shred×fire
> (fully stripped plates lose their 0.55 heat block on hits + burn ticks),
> frost×shock (+15% shock into slowed targets; chains leap 1.4× from a slowed
> source). Enemy identity: kilns spawn up to 4 wave-scaled mites (7s cadence);
> ward shells project +1 armor flat to enemies within 1.6 cells while alive
> (`_refreshEnemyAuras`, O(n²) — fine at current pack sizes).

## Run

```bash
cd web && python3 -m http.server 8080
# open http://localhost:8080
```

## Tests

```bash
node verify.mjs   # from repo root: parse-check, resolve relative imports, run js/tests/*.test.mjs
```

## Invariants & maintenance

These are enforced by CI (`.github/workflows/parity.yml`) and must not regress:

- **Parity contract**: `simParity` (byte-exact bot-ladder traces) and all browser
  parity gates are required merge gates. `campaignLadder` is intentionally
  non-blocking (balance signal). See `docs/DEV.md`.
- **Save schema/version**: all persistence shapes + forward-migration live in
  `web/js/saveStore.js` — `normalizeMeta`/`saveMeta` (`META_V`),
  `normalizeEndless`/`saveEndless`/`loadEndless` (`ENDLESS_V=1`), and the editor list
  in `levelEditor.js`. Migration helpers `migratePartId` (`data/parts.js`) and
  `migrateTechRanks` (`data/techTree.js`) are called from the save path. Never
  clobber a vault with a stale checkpoint.
- **No stray debug logging**: `console.log` / `console.debug` / `debugger` are
  forbidden in `web/js` (CI grep guard). Two intentional calls are allowlisted:
  `main.js:8` (`console.info` boot banner) and `saveStore.js:179` (`console.warn`
  on quota failure).
- **Zero assets / no build**: no frameworks, npm at runtime, or art/SFX packs.
  `playwright` is dev-only (CI parity).
- **Live code layout**: `sim/`, `ui/`, `view/` are flat — `next/` collapsed and `view25`/`prims25` renamed to `camera`/`primitives` (Anvil Engine) in the 1.0 deepclean.
- **Docs accuracy**: CI greps `docs/` for references to removed modules (the old
  action-binding shim and the former Sim-world wrapper); keep references accurate.
  Historical plans live in `docs/history/`.
