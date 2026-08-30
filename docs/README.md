# Project Tower Defense — Docs

Design brief for the **web-native** game (no engine, no npm).

| File | Role |
|------|------|
| [GDD.md](GDD.md) | Human design bible — locked systems (THIS iteration, 12-level Act I) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Implemented pipelines (sim / paint / audio) |
| [DESIGN.md](DESIGN.md) | Identity, copy, dialogs, Forge UX — steps 1–4 done, step 5 (identity pass) pending (copy of root `DESIGN.md`) |
| [DEV.md](DEV.md) | Maintenance guide — verification, parity, save discipline |
| [MAINTENANCE_PLAN.md](MAINTENANCE_PLAN.md) | **Active checklist** — P1→P5 maintenance, this iteration (parity, allocs, UI collapse deferred) |
| [SIDEQUEL.md](SIDEQUEL.md) | Future vision — property-bag towers (ON HOLD, may become a different game) |
| [REWRITE_PLAN.md](REWRITE_PLAN.md) | Rewrite execution plan — ON HOLD (sidequel) |
| [CURSOR_PROMPT.md](CURSOR_PROMPT.md) | Superseded (kept as history) |
| [DESIGN_HISTORY.md](DESIGN_HISTORY.md) | How decisions were reconciled |
| [LEGACY_NOTES.md](LEGACY_NOTES.md) | Salvaged ideas from removed Godot scaffold |
| [archive/](archive/) | Historical snapshots (not spec) |

**This project:** `web/` is the entire product.

```bash
cd web && python3 -m http.server 8080
# open http://localhost:8080
```
