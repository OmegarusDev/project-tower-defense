# Architecture — Project Tower Defense

Vanilla web prototype: layered sim, distance-field pathing, single AttackPlan resolver, procedural paint/audio. **Zero external engines, npm, or art/SFX packs.**

## Layout

```text
web/
  index.html
  css/           # tokens, shell, title, forge, tech, game-hud, meta, editor
  js/
    main.js app.js saveStore.js
    app/         # metaSync, runLifecycle, simBridge, gameChrome, placeUndo, input, pauseSettings
    ui/          # menuScreens, forge/tech/end screens, bindActions, editor, replay
    data/        # parts, techTree, campaign
    sim/         # BoardGrid, AttackPlan, combat, waves, economy, simWorld
    balance/     # headless Monte Carlo runner + greedy bot (no DOM)
    view/        # palette, board, tower paint, title, fx, camera
    audio/       # SynthBank SFX+Music buses; ScoreEngine generative ambient
    tests/       # node smoke tests
docs/            # GDD + prompts + legacy notes
PLAY.html        # thin launcher → GitHub Pages
.github/         # Pages deploy (uploads web/)
```

`app.js` is a thin orchestrator (ctor, start/tick, wireSim, bindUi); screen and run logic live under `js/app/*` and `js/ui/*` as `function foo(app, …)` modules.

## Pipelines

| Engine | Role |
|--------|------|
| `BoardGrid` | Exit BFS distance fields (ground + air); per-enemy next-step with soft tower-avoid + fair tie-split (air unchanged) |
| `AttackPlan` | `(base,barrel,payload,level,opts)` → pattern/damage; auto-level + branch ranks; base×barrel range/ROF mults stack with Arsenal ranks |
| `combat` | Targeting, projectiles (pierce / ballistic / homing coast), pulses, status, XP→auto-level + pending branch picks |
| `ProcPalette` | Colors + colorblind LUT (default off) |
| `SynthBank` | Bake SFX PCM at boot; Music/SFX buses on shared AudioContext |
| `ScoreEngine` | Generative ambient pads + kick; reacts to wave/density/phase/speed; pause ducks Music bus |
| `balance/` | Headless `runSim` + greedy bot + Monte Carlo CLI — no simBridge/DOM |

Endless checkpoints store `phase` (`inWave` | `betweenWaves`), `earlyBonusWave`, and `metaAppliedGains`. Meta Forge/Aether merge via run-gain deltas only; Continue re-seeds the sim vault from current meta.

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
`node js/balance/diagRun.mjs --preset fresh --seed 1` gives per-wave leak/kill detail.

Enemy HP: ×1.05/wave, accelerating ×1.02/wave extra past wave 15 so late endless
outpaces meta investment. Wave-gift unlocks were removed (2026-08-13) — all
parts are Forge purchases; legacy saves keep gifted parts (migrated as paid).

> Note: the aura system (`providesAura`, `_rebuildAuras`) is currently dead code —
> no base defines an aura. Keep the scaffolding until the combat refactor decides.

## Run

```bash
cd web && python3 -m http.server 8080
# open http://localhost:8080
```

## Tests

```bash
cd web
for f in js/tests/*.mjs; do node "$f"; done
```
