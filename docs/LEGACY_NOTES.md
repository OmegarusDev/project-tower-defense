# Legacy notes (pre-web Godot scaffold)

Godot was removed from this repo. The live product is `web/` only — vanilla HTML/CSS/ES modules, zero npm, zero engine.

These are the only ideas from the old scaffold still worth remembering. Everything else was already ported or superseded.

## Keep in mind for future web work

1. **BakeCache** — Old Godot view baked tower/enemy/wall textures keyed by `base|barrel|payload|level|colorblind`, invalidated on loadout/level change. Web still redraws composed towers every frame. When paint cost shows up (many towers), add an offscreen canvas / ImageBitmap cache with the same key shape.
2. **AttackPlan as single resolver** — Already the web rule (`web/js/sim/attackPlan.js`). Do not scatter pattern/AoE ifs across combat again.
3. **Distance-field pathing** — Already the web rule (`BoardGrid`). Ground + air BFS from exit; never seal spawn→exit on place.
4. **Sim clock vs view** — Fixed-step sim; view/audio consume state/events only. Still the intended split.
5. **Old part ids** — Scaffold used `watchtower` / `bunker` / `single` / `pellet` style ids. Web uses the Forgeworks triad names in `web/js/data/parts.js`. Save migration already accounts for renames; do not revive the old id set.

## Not worth porting

- `project.godot`, scenes, `.uid`, bus layouts, Godot headless tests
- Diverged `data/parts.json` (stale costs/names)
- Godot `ScoreEngine` kick-on-sim-clock (web music intentionally stubbed)
- Compose bottom-sheet during play (web uses Forge + Tech Tree screens instead)
