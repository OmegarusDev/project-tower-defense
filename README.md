<p align="center">
  <a href="https://omegarusdev.github.io/project-tower-defense/">
    <img src="https://img.shields.io/badge/▶_PLAY_NOW-playable_in_browser-brightgreen?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Play Now" height="40" />
  </a>
</p>

<p align="center"><strong>No install.</strong> Works in the browser (desktop &amp; mobile).</p>

<p align="center"><sub>Offline shortcut: download <a href="PLAY.html"><code>PLAY.html</code></a> and open it locally — it launches the hosted game.</sub></p>

# Project Tower Defense

Compose towers from Base + Barrel + Payload. Shape the path. Hold the bastion.

Vanilla **HTML + CSS + ES modules** — no npm, no bundler, no frameworks, no asset packs.

**Play online:** [omegarusdev.github.io/project-tower-defense](https://omegarusdev.github.io/project-tower-defense/)

## Run locally

```bash
cd web
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080)

## Controls

| Action | How |
|--------|-----|
| Campaign | Main → **Campaign** |
| Forge | Compose + unlock parts |
| Tech Tree | Permanent Aether / Parts upgrades |
| Place tower / wall | Bottom dock → tap cell (**Coin**) |
| Call wave | **Call Wave** or **Space** |
| Speed | 1x / 2x / 3x |

More detail: [`PLAY.md`](PLAY.md) · [`web/README.md`](web/README.md)

## Design docs

- [`docs/GDD.md`](docs/GDD.md)
- [`docs/CURSOR_PROMPT.md`](docs/CURSOR_PROMPT.md)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
