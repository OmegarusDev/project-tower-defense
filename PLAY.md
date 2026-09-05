# Play Project Tower Defense

Vanilla web — no engine, no npm, no install.

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
| Campaign | Main → **Campaign** — Act I (12 linear levels) |
| Forge | Main / Endless / Campaign → **Forge** — compose + unlock parts |
| Tech Tree | Forge → **Tech Tree** — Aether / Parts (slots, level cap, lives, …); Respec refunds ranks |
| Place tower | Bottom slots (`1`–`9`/`0`/`-`/`=`), tap empty cell (**Coin**) |
| Place wall | Bottom Wall or `W`, tap empty cell (**Coin**) |
| Tower menu | Tap tower → Level Up (`U`) / Sell (`X`) |
| Undo | HUD **Undo** or `Z` (since wave start) |
| Start wave | **Deploy** or **Space** (Call Early Coin once per wave) |
| Speed | Pause → 1× / 2× / 3×; hold Deploy for 5× |
| Pause | `Esc` or pause button |
| Compose | `B` (Endless live compose) |
| Continue | Endless hub → Continue (mid-wave → wave start; between waves → keep board) |

## Design docs

- [`docs/GDD.md`](docs/GDD.md)
- [`docs/CURSOR_PROMPT.md`](docs/CURSOR_PROMPT.md)
