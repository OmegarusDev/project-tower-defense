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
- Infinite waves; dual checkpoint phases:
  - **inWave** (at each wave start): Continue mid-wave → start of that wave (board/Coin as of wave start; mid-wave progress discarded — by design)
  - **betweenWaves** (on wave clear + quit-to-menu between waves): Continue keeps post-clear towers/walls/Coin; Call starts the next wave
- Compose overlay **during play**, does **not** pause
- Forge shop and Aether tech: **Main Menu only** (not mid-run); meta Forge/Aether never overwritten by a stale run vault
- Game over: keep Aether + Forge; discard Battle + board
- Plain square grid; no pre-walls
- Grid grows every **5 waves**, up to **22 rows**, **south from top** (spawn fixed; exit moves down)
- Starts compact (**9×8**); drag / scroll the board when the field is taller than the screen
- Base start: **3 HP / 75 Coin** (Iron Guard tech raises HP 3→5→7→10→15→20→25; sim field remains `lives`)
- Kick drum tempo rises each wave; no music gap between waves

## 5. Campaign

- **Current slice (shipped):** Act I — **7 linear levels** (clear prior to unlock next)
- **PINNED / future:** 3 campaigns of **5 / 10 / 25** levels (40 total) — do not invent the full slate yet
- Level = multiple waves; later waves/levels harder (more waves on later levels)
- Victory: clear required waves and/or boss (per level data)
- **Prep** between levels (no timer): compose, Forge, Aether → **Start Level**
- During level: roster **frozen**; no compose / Forge / tech
- May place/sell/walls, spend level-up points, speed, undo, Call Early
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

**Starter ownership (free, no Forge):** `sentry`, `single`, `kinetic`. Slot 1 pre-equipped with that triad. Other parts locked until purchased/unlocked (Forge) or gifted by endless best-wave milestones.

**Place cost:** sum of part costs after discounts, paid in Battle. Optional board-density surcharge after the first towers.  
**Sell tower/wall:** Salvager tech sets refund **50% / 60% / 75%** of **that instance’s recorded Battle paid** (level-up points not refunded).

---

# Part IV — Map & combat

## 8. Map

- Spawn top, exit bottom; no diagonals
- Towers + walls block **ground** path; illegal to seal ground path
- Ground pathfinding: shortest path to exit; soft tower-avoid for most enemies; fair hash tie-split among equal steps; never seal spawn→exit
- **Flying:** air layer; ignore walls/towers; shortest air route; only air-capable turrets hit them
- Player-facing HP (internal field remains `lives`); start Battle shown as **Coin** in meta UI
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
| Twin | Alternating dual; **1.75× ROF**, reduced range vs Single |
| Scatter | Cone multi |
| Rail | Long pierce (ballistic); air-capable |
| Pulse | Self-centered area ticks |
| Launcher | Lob; **blast on impact** (explosion is barrel, not payload) |
| Flak | Shotgun cone; air-capable |

Base × barrel **range/ROF multipliers stack** in AttackPlan. Arsenal mastery unlocks per-part **Range** and **ROF** ranks for every base/barrel.

### Payloads (elements)

Kinetic, Pyro (burn), Shock (yellow chain — Forge-upgradeable), Frost (slow), Poison (purple mild DoT + light slow), Acid (green armor shred), Breach (armor pierce), EMP (strip energy block / shields).  
Flat armor + % resist + immunities; DoT stacks; slow cap; 100% = freeze.  
AoE falloff from Launcher/Pulse; never damages towers. No DoT XP.  
If launcher target dies in flight: detonate AoE at last position; other homing shots coast on last velocity.

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

- Aether: full refundable tech graph (slots, caps, economy, lives path, discounts, perks, …) — **Respec tree** refunds all Foundations + Arsenal ranks
- Forge: part buy/upgrade (escalating Parts price via `forgeBuys`)
- Prestige/endgame: out of scope for v1
- No tutorial — self-explanatory UI

## 13. Audio & visuals

Unique procedural aesthetic. Particles on by default (toggle off). Colorblind palette **off** by default (toggle on). Generative ambient + kick. SFX baked at boot. Buses: Music / SFX / UI.

## 14. Menus (exhaustive)

Boot → Main → Endless Hub | Campaign Select → Prep | Build/Forge | Tech | Level Editor | Settings  

InGame Endless (live compose) | InGame Campaign (frozen roster) | Pause | Tower selected | Game Over | Victory | Confirms  

HUD Endless: HP, Coin, Forge/Aether readouts, Wave, Call Early (hold for 5×), Compose, Undo, Wall, Pause, selection (spend point / sell / XP).  
HUD Campaign: same without compose/Forge/tech.  

Pause: Resume, Speed 1/2/3, Quit (confirm). Pause copy distinguishes mid-wave vs between-wave checkpoint.  
Settings: volumes, particles, colorblind, camera pitch, tech respec, IAP stub.  
Desktop hotkeys: `1`–`9`/`0` slots 1–10, `-`/`=` slots 11–12, `Space` Call Early, `Esc` pause, `U` spend level-up point, `X` sell, `W` wall, `B` compose (Endless), `Z` undo.

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
