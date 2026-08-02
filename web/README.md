# Project Tower Defense — Web Native

Vanilla **HTML + CSS + ES modules**. No npm, no bundler, no frameworks, no image/audio asset packs.

## Run

Because browsers block ES modules on `file://`, serve the folder:

```bash
cd web
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080)

Or from repo root:

```bash
python3 -m http.server 8080 --directory web
```

## Play

1. **Endless → New Run**
2. Pick a **slot** or **Wall**, tap empty cells to place
3. Tap a placed tower for Level Up / Target / Sell
4. **Call Early** or **Space** to start a wave
5. **Compose** to change slot loadouts (bottom sheet, forces 1x)
6. **Continue** resumes the last wave-start checkpoint

## Layout

```text
web/
  index.html
  css/style.css
  js/
    main.js app.js saveStore.js
    data/parts.js
    sim/          # BoardGrid, AttackPlan, combat, waves, economy
    view/         # palette + canvas board
    audio/        # Web Audio synth + score
```

## Next stages (same design as GDD)

Campaign Prep, Forge gating, Aether tech graph, richer enemies, level editor, PWA/mobile wrap.

Godot project files remain in the parent folder as reference only — this web app is the active prototype.
