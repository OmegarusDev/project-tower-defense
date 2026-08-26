# Developer & Maintenance Guide — Project Tower Defense

Vanilla web, **no build, no npm at runtime, zero asset packs**. All graphics and
audio are code-generated. `playwright` is the only dev dependency and is used by CI
parity tests only — it is never shipped.

## Constraints (sacred)

- No frameworks / bundlers / engines. Plain ES modules loaded by `index.html`.
- No image or audio asset files. Everything is drawn and synthesized in code.
- `playwright` is for CI parity tests only — not part of the product.

## Local verification

Unit + parse gates (no server needed):

```bash
node verify.mjs          # from repo root — runs all 17 test files
```

Full parity (needs a served copy of `web/`):

```bash
cd web && python3 -m http.server 8123 --bind 127.0.0.1 &
# then, from the repo root:
node tools/corpus/simParity.mjs       # byte-exact bot-ladder traces (blocking)
node tools/corpus/ladderParity.mjs    # metric parity
node tools/corpus/simFuzz.mjs         # random-action soak
node tools/corpus/renderParity.mjs    # tower + enemy goldens
node tools/corpus/boardParity.mjs
node tools/corpus/uiParity.mjs
node tools/corpus/chromeParity.mjs
node tools/corpus/actionsParity.mjs
node tools/corpus/smokeWalk.mjs       # app integration walk
node tools/corpus/qaWalk.mjs          # 3 device ratios, console-clean
```

`campaignLadder.mjs` is a **non-blocking** balance signal (currently 6/12 levels
fail versus the greedy bot — unblocked after a dedicated balance pass). Do not
promote it to a merge gate until that pass lands.

## Parity is the contract

Every change must keep `simParity` byte-exact (16 traces) and the browser parity
gates green. This safety net is what makes maintenance safe — do not weaken it.

## Invariants (see `docs/ARCHITECTURE.md` → "Invariants & maintenance")

- Save schema/versioning lives in `web/js/saveStore.js` (`META_V`, `ENDLESS_V=1`,
  plus the editor list in `levelEditor.js`). Never clobber a vault with a stale
  checkpoint.
- No `console.log` / `console.debug` / `debugger` in `web/js`. Two intentional
  `console.info` / `console.warn` calls are allowlisted (CI grep guard).
- `sim/next`, `ui/next`, `view/next` are the live code. A folder rename is deferred
  until a true blank-slate rebuild.

## Git hygiene

- Keep the `v0-pre-rebuild-baseline` tag and `baseline-archive` branch intact
  (historical snapshots).
- The external reference repo (`OmegarusDev/project-tower-defense-oracle`) and its
  preserved branches/tags (`oracle`, `oracle-current`, `replica-oracle`) are sacred
  — never modify or delete.
- Planning docs (`PORT_PLAN.md`, `PLAN.md`, `BETA_PLAN.md`) live under
  `docs/history/` and are historical; `AGENTS.md` + `docs/GDD.md` +
  `docs/ARCHITECTURE.md` are the canonical living docs.
