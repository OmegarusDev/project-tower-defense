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
    view/        # palette, board, tower paint, title, fx, camera
    audio/       # SynthBank SFX; ScoreEngine stub
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
| `AttackPlan` | `(base,barrel,payload,level,opts)` → pattern/damage/aura; base×barrel range/ROF mults stack with Arsenal ranks |
| `combat` | Targeting, auras, projectiles (pierce / ballistic / homing coast), pulses, status, XP→level points |
| `ProcPalette` | Colors + colorblind LUT (default off) |
| `SynthBank` | Bake SFX PCM at boot; play by id |
| `ScoreEngine` | Stubbed — music off until a later ambient pass |

Endless checkpoints store `phase` (`inWave` | `betweenWaves`), `earlyBonusWave`, and `metaAppliedGains`. Meta Forge/Aether merge via run-gain deltas only; Continue re-seeds the sim vault from current meta.

## Run

```bash
cd web && python3 -m http.server 8080
# open http://localhost:8080
```

## Tests

```bash
cd web
node js/tests/boardGrid.test.mjs
node js/tests/attackPlan.test.mjs
node js/tests/auditFixes.test.mjs
# or: for f in js/tests/*.mjs; do node "$f"; done
```
