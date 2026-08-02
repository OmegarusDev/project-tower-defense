# Project Tower Defense — Web Native

Vanilla **HTML + CSS + ES modules**. No npm, no bundler, no frameworks, no engines, no image/audio asset packs.

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

1. **Endless → New Run** (or **Campaign**)
2. **Forge** to compose Base + Barrel + Payload and unlock parts
3. **Tech Tree** for permanent Aether / Parts upgrades
4. Pick a **slot** or **Wall**, tap empty cells to place
5. Tap a placed tower for Level Up / Target / Sell
6. **Call Wave** or **Space** to start a wave
7. **Continue** resumes the last endless wave-start checkpoint

## Layout

```text
web/
  index.html
  css/style.css
  js/
    main.js app.js saveStore.js
    data/         # parts, techTree, campaign
    sim/          # BoardGrid, AttackPlan, combat, waves, economy
    view/         # palette, board, painters, title, fx
    audio/        # Web Audio synth + score stub
    tests/        # node smoke tests
```

## Tests

```bash
node js/tests/boardGrid.test.mjs
node js/tests/attackPlan.test.mjs
```
