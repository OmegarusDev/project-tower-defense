# Play Project Tower Defense

**Active prototype = web native** (no Godot required).

## Run

```bash
cd web
python3 -m http.server 8080
```

Open **http://localhost:8080**

Details: [`web/README.md`](web/README.md)

## Controls

| Action | How |
|--------|-----|
| Campaign | Main → **Campaign** — 3× 8×8 levels with pre-walls; clear N waves to win |
| Forge | Main / Endless / Campaign → **Forge** — compose + unlock parts |
| Upgrades | Forge → **Upgrades** — spend **Aether** (slots, level cap, lives) |
| Place tower | Bottom slots, tap empty cell (**Coin**) |
| Place wall | Bottom Wall, tap empty cell (**Coin**) |
| Tower menu | Tap a placed tower → Level Up / Sell |
| Start wave | **Call Wave** (bottom) or **Space** |
| Wave clear | Coin bonus on clear (not on call) |
| Speed | 1x / 2x / 3x top-left |
| Undo / Menu | Top-right icons |
| Continue | Endless hub → Continue |

## Design docs

- [`docs/GDD.md`](docs/GDD.md)
- [`docs/CURSOR_PROMPT.md`](docs/CURSOR_PROMPT.md)

The Godot tree in this repo is leftover scaffolding; development continues in `web/`.
