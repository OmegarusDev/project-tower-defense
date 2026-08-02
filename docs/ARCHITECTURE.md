# Architecture — Project Tower Defense

Vanilla web prototype: layered sim, distance-field pathing, single AttackPlan resolver, procedural paint/audio. **Zero external engines, npm, or art/SFX packs.**

## Layout

```text
web/
  index.html
  css/style.css
  js/
    main.js app.js saveStore.js
    data/        # parts, techTree, campaign
    sim/         # BoardGrid, AttackPlan, combat, waves, economy, simWorld
    view/        # palette, board, tower paint, title, fx, camera
    audio/       # SynthBank SFX; ScoreEngine stub
    tests/       # node smoke tests
docs/            # GDD + prompts + legacy notes
PLAY.html        # thin launcher → GitHub Pages
.github/         # Pages deploy (uploads web/)
```

## Pipelines

| Engine | Role |
|--------|------|
| `BoardGrid` | Exit BFS distance fields (ground + air); enemies follow gradient |
| `AttackPlan` | `(base,barrel,payload,level)` → pattern/damage/aura — one resolver |
| `combat` | Targeting, auras, projectiles/pulses/status/XP |
| `ProcPalette` | Colors + colorblind LUT (default off) |
| `SynthBank` | Bake SFX PCM at boot; play by id |
| `ScoreEngine` | Stubbed — music off until a later ambient pass |

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
```
