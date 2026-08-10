# Cursor Prompt — Project Tower Defense

**Final implementation brief.** Obey this file and [`GDD.md`](GDD.md). If they conflict, stop and ask.

You are building **Project Tower Defense** — vanilla web only (`web/`).

---

## Sacred rules

1. Do **not** modify or delete `../Tower Defense/` (Pygame prototype — reference only).
2. All game code lives under `web/`. No Godot, no npm, no bundler, no frameworks.
3. Zero external art/SFX packs. Code-generated graphics; bake SFX at boot. Music is stubbed until a later ambient pass.
4. Portrait-first, adaptive UI. Offline. Local saves. English only.
5. Develop on Apple Silicon; mobile via responsive web / later PWA wrap.
6. Support-the-Dev IAP **last** (stub until then).
7. Fixed-step `web/js/sim/`; `view`/`audio` consume state/events only.
8. Data-driven content; avoid growing `app.js` into a god object — split screens when needed.
9. Use data placeholders for unset numbers; do not invent new systems.

---

## Layout

```text
Project Tower Defense/
  web/           # entire product
  docs/
  PLAY.html      # Pages launcher
  .github/       # Pages deploy
```

---

## Modes

**Endless:** infinite waves; live compose **without** pausing; wave-start checkpoint + Continue; starts 9×8 and grows south every 5 waves (cap 22 rows); pan/scroll the board on phone; no pre-walls; Forge/Aether meta not mid-run.

**Campaign:** 5/10/25 levels across 3 campaigns (linear unlock); Prep = compose+Forge+Aether (untimed); in-level roster frozen (no compose/meta); predefined map seeds + valid pre-walls; victory per level data (waves and/or boss).

**Level editor:** on Main Menu at launch.

---

## Currencies

| ID | Earn | Spend | Persist |
|----|------|-------|---------|
| aether | Wave clear; level first-clear | Tech graph | Meta |
| forge | Wave clear; full-campaign bonus | Parts buy/upgrade | Meta |
| battle | Start grant; enemy drops; Call Early | Place; walls | Run / campaign-level |

Start grant = **Battle only**. Free starter parts: **sentry + single + kinetic** (slot 1 pre-filled).  
Sell tower/wall = 50% of **recorded** Battle paid for that instance.  
**No** Battle spending on tower levels.

---

## Towers & combat

- Base×Barrel×Payload; immutable after place; slots 3→12; level cap 1→5
- **Base** = envelope + targeting doctrine (+ light innate). No per-tower Target menu.
- **Barrel** = delivery (Single/Twin/Scatter/Rail/Pulse/Launcher). Explosion = Launcher.
- **Payload** = element only (Kinetic/Pyro/Shock/Frost/Poison/Acid)
- Bases: Sentry(first), Bulwark(closest), Spire(strongest), Aerie(air→first), Warden(last), Talon(weakest)
- XP bar → level-up **point** → spend for +1 level; buffs by tower type
- Damage types; armor flat+%+immunity; crits; DoT; slow cap; freeze at 100%
- AoE falloff; no FF on towers; chain/motion upgrade paths
- Flying: ignore walls/towers; Aerie or Rail (etc.) for air hits

---

## Map

Spawn top, exit bottom; no diagonals; ground shortest path; never seal; wall price scales with count; campaign seeds predefined.

---

## UX

Drag+tap place with confirm; undo; speed 1/2/3; Call Early; auto-pause on background; particles default on; colorblind default **off**; **no tutorial**. Menus per GDD §14.

---

## Enemies

basic, heavy, fast, flying, shielded, splitter, boss (+ data). Leak by type. Formula waves + editor scripts. Hard default.

---

## Vertical slice done when

1. Endless: place wall+tower → Call Early → ground enemy shortest-paths  
2. Wave checkpoint / Continue works  
3. Campaign Prep → frozen level → Victory/GO → Prep  
4. Currencies + starter triad behave per tables  
5. Node smoke tests under `web/js/tests/` stay green  
6. Procedural draw + baked UI/SFX clicks (music optional later)  

Re-read `GDD.md` before inventing behavior.
