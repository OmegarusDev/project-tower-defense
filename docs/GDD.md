# Project Tower Defense — Game Design Document

**Status:** Final brief (systems locked). Balance numbers live in data as placeholders until playtest.  
**Pair with:** [`CURSOR_PROMPT.md`](CURSOR_PROMPT.md) for implementation agents.  
**History:** [`DESIGN_HISTORY.md`](DESIGN_HISTORY.md)  
**Pygame prototype:** `../Tower Defense/` — read-only. Do not modify or delete.  
**Production:** this repo — vanilla web only (`web/`). No Godot, no npm, no asset packs.

---

# Part I — Product

## 1. Identity

| Field | Value |
|-------|--------|
| Title | Project Tower Defense |
| Pitch | Compose modular towers, reshape the path, survive hard escalating waves — short runs or long sessions |
| Session | ~2 minutes or long; same loop |
| Difficulty | Quite hard; tune in playtests |
| Language | English only |
| Network | Offline; local saves only |
| Monetization | Free to play fully; one IAP **Support the Dev** (implement last) |

## 2. Pillars

1. Composition — Base × Barrel × Payload (all three required)
2. Path shaping — towers and walls block; shortest ground path; never seal spawn→exit
3. Layered progression — Aether tech + Forge parts + Battle economy + in-run XP levels
4. Procedural presentation — code-generated maps, art, audio (no asset packs)
5. Expandable data — new parts/enemies/waves without architecture rewrites

## 3. Platform

- Portrait primary; adaptive phone / tablet / desktop
- Apple Silicon Mac = daily driver; ship Android then iOS
- Drag-place and tap-place, both with tap-confirm
- Auto-pause on app background
- Respect iOS silent switch
- Zero external PNG/WAV art packs; engine default font OK as chrome

---

# Part II — Modes

## 4. Endless

- Hub: **New Run** (confirm overwrite), **Continue**, best wave
- Infinite waves; checkpoint at **each wave start**; Continue = that checkpoint
- Compose overlay **during play**, does **not** pause
- Forge shop and Aether tech: **Main Menu only** (not mid-run)
- Game over: keep Aether + Forge; discard Battle + board
- Plain square grid; no pre-walls
- Grid grows every **20 waves**, full at **wave 100**, **south from top** (spawn fixed; exit moves down)
- Kick drum tempo rises each wave; no music gap between waves

## 5. Campaign

- 3 campaigns: **5 / 10 / 25** levels; unlock **linear** (clear prior campaign)
- Level = multiple waves; later waves/levels harder (more waves on later levels)
- Victory: clear required waves and/or boss (per level data)
- **Prep** between levels (no timer): compose, Forge, Aether → **Start Level**
- During level: roster **frozen**; no compose / Forge / tech
- May place/sell/walls, spend level-up points, targeting, speed, undo, Call Early
- Pre-wave placement allowed until first wave starts
- Maps: procedural from **predefined seed per level** + valid pre-walls
- Game over → Prep; meta kept; Battle for that level discarded; level not cleared

## 6. Level editor

Main Menu entry at launch: grid, spawn/exit, pre-walls, wave scripts or formula, playtest, local save.

---

# Part III — Economy

## 7. Currencies

| ID | Name | Earn | Spend | Persistence |
|----|------|------|-------|-------------|
| `aether` | Aether | Every **5th** wave cleared (scales with wave); campaign **level** first-clear bonus | Tech graph | Meta |
| `forge` | Forge parts | Every **3rd** wave cleared (scales with wave); campaign clear bonus TBD | Buy / upgrade parts | Meta |
| `battle` | Coin | Start grant; enemy drops; **every** wave-clear payout (scales with wave) | Place towers; walls | Per run / per campaign level |

**Start of run/level:** Battle grant only. Forge and Aether balances carry from meta (may be 0). No Forge/Aether start grant.

**Starter ownership (free, no Forge):** `watchtower`, `single`, `pellet`. Slot 1 pre-equipped with that triad. Other parts locked until purchased/unlocked.

**Place cost:** sum of part costs after discounts, paid in Battle.  
**Sell tower:** 50% of Battle paid for that tower (place cost only; level-up points not refunded).  
**Sell wall:** 50% of **that wall’s recorded purchase price** (not the current shop tier price).

---

# Part IV — Map & combat

## 8. Map

- Spawn top, exit bottom; no diagonals
- Towers + walls block **ground** path; illegal to seal ground path
- Ground pathfinding: shortest path; deterministic tie-break; repath on blocker change
- **Flying:** air layer; ignore walls/towers; shortest air route; only air-capable turrets hit them
- Wall cost rises with walls currently owned
- PINNED later: env tiles, special walls

## 9. Roster & towers

- Triad required; immutable after place; duplicate combos allowed
- Slots: 3 start → 12 max via Aether (~6 mid-game)
- Base fixed; turret rotates toward doctrine target; range ring on select + place preview
- **No per-tower targeting menu** — doctrine is the base

### Axes (orthogonal)

| Axis | Owns |
|------|------|
| **Base** | Envelope (range/ROF band) + **targeting doctrine** + light innate |
| **Barrel** | Delivery geometry (how force leaves), including blast radius for Launcher |
| **Payload** | **Element only** (+ element status) |

Starter free parts: **Sentry + Single + Kinetic**.

### Bases

| Base | Doctrine | Role |
|------|----------|------|
| Sentry | First | Lane clearer (starter) |
| Bulwark | Closest | Point defense; short/fast; point-blank amp |
| Spire | Strongest | Elite / boss hunter; long/slow |
| Aerie | Flying → First | Air wing; can engage air layer |
| Warden | Last | Exit / leak watch |
| Talon | Weakest | Finisher; execute amp on wounded |

### Barrels

| Barrel | Delivery |
|--------|----------|
| Single | One projectile |
| Twin | Alternating dual |
| Scatter | Cone multi |
| Rail | Long pierce; air-capable |
| Pulse | Self-centered area ticks |
| Launcher | Lob; **blast on impact** (explosion is barrel, not payload) |

### Payloads (elements)

Kinetic, Pyro (burn), Shock (yellow chain — Forge-upgradeable), Frost (slow), Poison (purple mild DoT + light slow), Acid (green armor shred).  
Flat armor + % resist + immunities; DoT stacks; slow cap; 100% = freeze.  
AoE falloff from Launcher/Pulse; never damages towers. No DoT XP.

### In-run levels

- Cap starts at **1**, unlock to **5** via Aether
- Hits (projectile + pulse tick) fill XP bar → **1 level-up point** on that tower (carry XP remainder)
- Spend level-up point → +1 level (under cap)
- **No Battle purchase of levels** — Battle is place/walls only
- Level effect: general power-up **by tower type** (data curves per base/combo)
- Points at cap stay banked until meta raises cap

## 10. Upgrade orthogonality

Tags + channels + stack mode (`add`/`mult`/`max`/`override`). Mutex one base/barrel/payload. Documented synergies only. Flat levels + branch nodes; refundable. Validate max combos in tests.

## 11. Enemies & waves

| Type | Role (brief) |
|------|----------------|
| Basic | Standard ground fodder |
| Heavy | High HP, slow, higher leak damage |
| Fast | Low HP, high speed |
| Flying | Air path; ignores walls/towers |
| Shielded | Extra mitigation / shield HP (data) |
| Splitter | On death, spawns weaker children |
| Boss | High threat; campaign and endless |

Leak damage by type. Abilities data-driven. Formula waves default; editor scripts OK. No wave preview. Call Early (small Battle bonus); no skip. Difficulty tune in playtests.

---

# Part V — Meta & presentation

## 12. Meta

- Aether: full refundable tech graph (slots, caps, economy, lives path, discounts, perks, …)
- Forge: part buy/upgrade
- Prestige/endgame: out of scope for v1
- No tutorial — self-explanatory UI

## 13. Audio & visuals

Unique procedural aesthetic. Particles on by default (toggle off). Colorblind palette **off** by default (toggle on). Generative ambient + kick. SFX baked at boot. Buses: Music / SFX / UI.

## 14. Menus (exhaustive)

Boot → Main → Endless Hub | Campaign Select → Prep | Build/Forge | Tech | Level Editor | Settings  

InGame Endless (live compose) | InGame Campaign (frozen roster) | Pause | Tower selected | Game Over | Victory | Confirms  

HUD Endless: Lives, Battle, Forge/Aether readouts, Wave, Speed, Call Early, Compose, Undo, Wall, Pause, selection (spend point / sell / target / XP).  
HUD Campaign: same without compose/Forge/tech.  

Pause: Resume, Speed, Settings subset, Quit (confirm).  
Settings: volumes, particles, colorblind, reset, credits, IAP stub.  
Desktop hotkeys: `1`–`9`/`0` slots (slots 11–12 on HUD), `Space` Call Early, `Esc` pause, `U` spend level-up point, `X` sell, `W` wall, `B` compose (Endless).

---

# Part VI — Architecture

## 15. Layers

`app/` state, platform, saves, IAP stub · `sim/` pure 60 Hz sim · `view/` draw/HUD · `audio/` generative + baked · `data/` tables · `tests/` headless  

Commands in → events out. Durations in seconds → ticks. Spatial targeting. Repath on change. Versioned saves: meta, endless checkpoint, campaign. Never write run lives into meta blindly.

## 16. PINNED (post-v1)

Env tiles, special walls, prestige, achievements, generated font, deeper undo, more campaigns.

## 17. Balance placeholders

All numeric values (costs, HP, XP thresholds, grid sizes, wall curve, wave formulas, aura amounts, start Battle, start lives) are **data placeholders** until playtest — not design unknowns.

---

*End GDD. Agents: follow [`CURSOR_PROMPT.md`](CURSOR_PROMPT.md).*
