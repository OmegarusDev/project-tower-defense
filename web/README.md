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
5. Tap a placed tower for branch picks (Dmg/ROF/Rng) / Sell
6. **Call Wave** or **Space** to start a wave
7. **Continue** resumes the last endless wave-start checkpoint

## Layout

```text
web/
  index.html
  css/            # tokens → shell → title → forge → tech → game-hud → meta → editor
  js/
    main.js app.js saveStore.js
    app/          # run / chrome / input / ends / forge / tech / undo modules (take `app`)
    ui/           # menuScreens, forgeScreen, techScreen, endScreens, levelEditor, metaUi
    ui/next/      # actions (runAction), screens, registry, chrome, modal, stateOf
    data/         # parts, techTree, campaign, enemies, waveScripts, endlessGrid, rules
    sim/          # BoardGrid, AttackPlan, rng
    sim/next/     # state, sim (Sim facade), systems/*, combat/*
    balance/      # headless runSim + greedyBot + scenarios
    view/         # palette, drawUtil, prims25, fx, titleView, view25 (camera)
    view/next/    # boardScene, boardView, enemyVisuals, partVisuals, renderEnemy, renderTower
    audio/        # Web Audio SFX + generative ambient
    tests/        # node smoke tests (run via verify.mjs)
```

## Tests

```bash
for f in js/tests/*.mjs; do node "$f"; done
```

## Balance bot

```bash
node js/balance/monteCarlo.mjs --runs 5 --preset fresh
node js/balance/monteCarlo.mjs --runs 5 --preset midMeta --max-waves 8
```
