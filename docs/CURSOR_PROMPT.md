# Cursor Prompt — Project Tower Defense

**Final implementation brief.** Obey this file and [`GDD.md`](GDD.md). If they conflict, stop and ask.

You are building **Project Tower Defense** (web-native primary, Godot reference in-repo).

---

## Sacred rules

1. Do **not** modify or delete `../Tower Defense/` (Pygame prototype — reference only).
2. All game code stays in this repo.
3. Zero external art/SFX packs. Code-generated graphics; bake SFX at boot; generative music (ambient + kick; endless kick tempo per wave; no inter-wave silence).
4. Portrait-first, adaptive UI. Offline. Local saves. English only.
5. Develop on Apple Silicon; export Android then iOS.
6. Support-the-Dev IAP **last** (stub until then).
7. Fixed 60 Hz `sim/`; `view`/`audio` consume commands/events only.
8. Data-driven content; no god objects.
9. Use data placeholders for unset numbers; do not invent new systems.

---

## Layout

```text
Project Tower Defense/
  docs/
  app/ sim/ view/ audio/ data/ tests/
  project.godot
```

---

## Modes

**Endless:** infinite waves; live compose **without** pausing; wave-start checkpoint + Continue; grid grows south from top every 20 waves (full at 100); no pre-walls; Forge/Aether meta not mid-run.

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
- Bases: Sentry(first), Bulwark(closest), Spire(strongest), Aerie(air→first), Beacon(aura), Warden(last), Talon(weakest)
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
5. Headless tests: path, sell refund, XP→point→level, mode gates  
6. Procedural draw + stub kick + baked UI click  

Re-read `GDD.md` before inventing behavior.
