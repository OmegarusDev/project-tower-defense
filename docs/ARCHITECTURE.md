# Architecture — Project Tower Defense

Implements the systems/refactor review: layered sim, distance-field pathing, single AttackPlan resolver, procedural paint/audio engines. **Zero external art/SFX packs.**

## Layout

```text
app/           # main, screen FSM
sim/
  grid/        # GridMap distance fields, MapGen
  combat/      # AttackPlan, CombatSystem, PartsFallback
  waves/
  economy/
  meta/
view/
  paint/       # ProcPalette, BakeCache, painters, FxPainter
  hud/         # BoardView
audio/
  synth/       # SynthBank (bake PCM at boot)
  score/       # ScoreEngine (ambient + sim-clock kick)
data/          # parts.json
tests/         # Godot + Python distance-field checks
docs/          # GDD + prompts
```

## Pipelines

| Engine | Role |
|--------|------|
| `GridMap` | Exit BFS distance fields (ground + air); enemies follow gradient |
| `AttackPlan` | `(base,barrel,payload,level)` → pattern/damage/aura — one resolver |
| `CombatSystem` | Buckets, aura influence map, projectiles/pulses/status/XP |
| `ProcPalette` | Colors + colorblind LUT (default off) |
| `BakeCache` | Bake tower/enemy/wall textures; dirty on loadout/level |
| `SynthBank` | Bake SFX PCM at boot; play by id |
| `ScoreEngine` | Generative pad + kick on **sim clock** |

## Run tests

```bash
# Distance-field mirror (no Godot required)
python3 tests/test_distance_field.py

# Full sim tests (requires Godot 4 on PATH)
godot --headless -s res://tests/test_sim.gd
```

## Vertical slice controls

- Main Menu → Endless → New Run
- Tap board: place starter tower (slot 0) or wall
- Call Early: start wave
- Compose: forces 1x while open (bottom-sheet rule)
