> **SIDEQUEL / FUTURE VISION — ON HOLD**
> This doc captures the property-bag tower vision discussed 2026-08-28 (single boring pellet at L0, upgrade parts add properties, emergence from the bag, element-first + dual-class at 10, towers block / walls removed, snake-lane solved by synergy-concentration). It **may become a different game / sidequel** — do not treat as the living spec for THIS iteration. The living spec is `GDD.md`.
> Source: consolidated from `REWRITE_PLAN.md` §2 + the future-vision `GDD.md` that was live for one commit. Kept for reference so the ideas aren't lost.

# Forgeworks TD — Game Design Document

**Title:** Forgeworks TD (rebrand from Project Tower Defense — USP: you forge your own towers).  
**Status:** Living spec for the major rewrite. See `REWRITE_PLAN.md` §2 for the tower-vision decisions locked in discussion.  
**Pair with:** `ARCHITECTURE.md` (code), `DEV_GUIDELINES.md` (process), `REWRITE_PLAN.md` (execution).  
**Production:** vanilla web only (`web/`). No Godot, no npm, no asset packs.  
**Supersedes:** prior GDD + `CURSOR_PROMPT.md` + `DESIGN_HISTORY.md` + `history/PLAN.md` threads (archived under `docs/archive/`).

---

## 1. Identity

| Field | Value |
|-------|--------|
| Title | **Forgeworks TD** |
| Tagline | Forge your towers — every roster is yours |
| Pitch | One boring pellet tower. Upgrade parts add properties. Properties combine — every wave has many viable answers. |
| Pillars | **Forge** (composition) · **Emergence** (property interaction) · **Maze as choice, not puzzle** · **Procedural presentation** |
| Faction | the Cinder (brutal-industrial, ember/forge) |
| Session | ~2 min or long; same loop |
| Difficulty | Quite hard; tune in playtest |
| Language | English only |
| Network | Offline; local saves only |
| Monetization | Free to play fully; one IAP **Support the Dev** (implement last) |

Platform: portrait primary, adaptive phone/tablet/desktop. Apple Silicon daily driver; ship Android then iOS. Drag-place + tap-place with confirm. Auto-pause on background. Respect iOS silent switch. Zero external art/SFX packs.

---

## 2. Modes

### Endless

- Hub: New Run (confirm overwrite), Continue, best wave.
- Infinite waves; dual checkpoints: **inWave** (wave start → Continue restarts that wave, mid-wave progress discarded) + **betweenWaves** (on clear + quit-between → keep post-clear board/towers/Coin).
- **In-run upgrading does not pause.**
- Forge/Aether meta: Main Menu only, never overwritten by stale checkpoint (delta-merge).
- Game over: keep Aether + Forge; discard Battle + board.
- Plain square grid; no pre-walls. Grows every 5 waves, up to 22 rows, south from top. Starts compact (9×8); drag/scroll when taller than screen.
- Base start: 3 HP / 50 Coin (Iron Guard tech raises HP 3→5→7→10→15→20→25; sim field stays `lives`).
- Kick tempo rises each wave; ScoreEngine generative ambient (no gap between waves).

### Campaign

- Current slice: Act I — 7 linear levels (clear prior to unlock next). PINNED future: 3 campaigns of 5/10/25 levels (40 total).
- Level = multiple waves; later waves/levels harder.
- Victory: clear required waves and/or boss (per level data).
- Prep between levels (no timer): Forge, Aether → Start Level. During level: no Forge/tech (frozen).
- May place/sell, spend branch picks, speed, undo, Call Early. Pre-wave placement until first wave.
- Maps: procedural from predefined seed + authored `spawnCells` / pre-walls.
- Game over → Prep; meta kept; Battle for that level discarded.

### Level editor

Main Menu entry at launch: grid, spawn/exit, pre-walls, wave scripts or formula, playtest, local save.

---

## 3. Economy

| ID | Name | Earn | Spend | Persist |
|----|------|------|-------|---------|
| `aether` | Aether | Every 5th wave cleared (scales); campaign level first-clear bonus | Tech graph | Meta |
| `forge` | Forge parts | Every 3rd wave cleared (scales); campaign clear bonus | Unlock upgrade-part *types* | Meta |
| `battle` | Coin | Start grant; enemy drops; every wave-clear payout (scales) | Place towers; in-run upgrades | Run / level |

- Start of run/level: **Battle grant only**. Aether/Forge carry from meta (may be 0).
- **In-run tower upgrading** spends Battle on *any* tower (shared pool, individual choice). Upgrades **reset each run**.
- Meta Forge/Aether unlocks which upgrade-part *types* exist at all (so meta = "what *can* I build," run = "what *do* I build").
- Sell tower = Salvager **50%/60%/75%** of that instance's recorded Battle paid (levels/branch picks not refunded). No Battle-to-level purchase — Battle is place + upgrade only (until new level design).
- Call Early: small Battle bonus, claimed once per wave (checkpointed).

---

## 4. Map

- Spawn top, exit bottom; no diagonals.
- **Towers block ground path** (walls-as-separate removed in the rewrite — see `REWRITE_PLAN.md` §2.5). `BoardGrid.blocked` + `towerMask`. Never seal spawn→exit.
- Ground pathfinding: shortest path to exit; soft tower-avoid for most enemies; fair tie-split; never seal.
- Flying: air layer; ignores blocks; shortest air route; only air-capable properties hit them.
- HP shown as **HP** (sim field `lives`); start Battle as **Coin**.
- **Blocking cost** = wall-price curve in the current code (`wallCost = WALL_BASE + WALL_STEP * ownedWalls`). In the new system towers *are* walls, so this becomes a **guardrail choice** in P3: reduced combat profile while blocking *or* a cheap non-shooting barricade upgrade-part (path length costs firepower again — see `REWRITE_PLAN.md` §2.5).
- Roaming seam portal: endless seeded shuffle of back-line columns, rare + telegraphed (2.5 s `portal_unstable` → `portal_moved`). Kept for dynamism, not relied upon as anti-snake. Campaign pins one cell per level (`spawnCells`, may be mid-board from 40+).

**Snake-lane stance:** composition is the primary puzzle, not geometry. Property *synergies* (freeze→shatter, oil→ignite, mark→detonate) reward a **concentrated kill-zone**, so a tight synergy pocket out-performs a long snake of flat towers — optimal maze becomes composition-dependent, with no single best lane. See `REWRITE_PLAN.md` §2.5.

---

## 5. Towers — the new system

> **"Emergence comes from the properties held by the parts a tower is composed of."**

### L0

One placeable tower. At **L0** it is a boring, standard **single-shot pellet** ("pew pew") with zero added properties.

### Upgrade parts (the forge)

- Earned **in-run**: kills → currency → level-up → spend on *any* tower.
- Each part adds **properties** to that tower's bag and pushes it down a specialization.
- Parts are **data-declared** (no code per part); code implements each *property-kind* once.

### What a property is

| Bucket | Examples |
|--------|----------|
| **Delivery shape** | `pellet` → `beam` (continuous, can arc), `aura` (field = zone), `chain/arc` (leaps), `cone/spread`, `radial 360`, `rail pierce`, `lob AoE` |
| **Element** | `kinetic`, `pyro(burn/ignite)`, `shock(chain/disable)`, `frost(slow→freeze→shatter)`, `poison(DOT stack)`, `acid(armor-strip)`, `breach(pierce)`, `emp(strip shield)` |
| **On-hit / passive / zone** | `applies:ignite`, `leaves:burningGround(zone)`, `reactsTo:wet→steam`, `periodicTick`, `auraBuff` |
| **Targeting doctrine** | `first / closest / strongest / air→first / last / weakest` (old Base doctrines, now properties) |
| **Modifier** | `armorIgnore`, `slowOnHit`, `executeAmp`, `airCapable`, `sustainedContact` |

A tower's effective behavior = the **union of its bag**, resolved by a small set of generic rules. Same element, opposite roles when the *shape* changes:

- Electric (`shock`) + **pellet** = one bolt.
- Electric + **beam** = a continuous line that can arc to nearby enemies.
- Electric + **aura** = a field that zaps anything inside it continuously.
- Electric + **chain** = a bolt that jumps between enemies.
- Electric + **360** = a ring hitting everything around the tower.

### Upgrade structure — hybrid

- **First upgrade ≃ choose an element** — the primary specialization branch.
- Subsequent upgrades add delivery shapes, modifiers, passives/zones, doctrines. Most towers are *element-first, shape-second*.
- **Tags + synergy bonuses:** parts carry tags; certain tag combos grant explicit bonuses (guides the player without hard-locking).
- **Dual-class at L10:** at high level a tower can take a *second* element/property branch → late-game emergent combos (fire + shock, frost + poison, …). Capstone of "uniquely yours."
- **Target size:** small, tunable property catalog + a handful of generic resolver rules → combinatorial explosion of behaviors from few parts.

### Retained from the old system (until replaced)

The current `Base × Barrel × Payload` composition (`Sentry/Bulwark/Spire/Aerie/Warden/Talon` × `Single/Twin/Scatter/Rail/Pulse/Launcher/Flak` × *8 payloads*, slots 3→12, level cap 1→5, XP→auto-level + branch picks `Damage/ROF/Range`) is the **reference prototype** for the new property-bag. Do not author new B×B×P content during the rewrite — invest in the property catalog.

For the new system the **roster** concept is gone (one tower type); the **meta roster** becomes "which upgrade-part types are unlocked." In-run levels/branch picks map onto the upgrade-part picks.

---

## 6. Combat

- Flat armor + % resist + immunities; DoT stacks; slow cap; 100% = freeze.
- AoE falloff (Launcher/Pulse successor shapes); never damages towers. No DoT XP.
- Homing target lost: lob shapes detonate at last pos; others coast briefly.
- Chain/motion upgrade paths become *property* interactions (e.g. `shock(chain)` + `sustainedContact(beam)` = chaining wall) resolved generically.
- Flying: ignore blocks; only `airCapable` properties hit them.

---

## 7. Enemies & waves

| Type | Role |
|------|------|
| Basic | Ground fodder |
| Heavy | High HP, slow, higher leak damage |
| Fast | Low HP, high speed |
| Flying | Air path; ignores blocks |
| Shielded | Extra mitigation / shield HP |
| Splitter | On death spawns children |
| Spawner | Periodic spawns (Kiln → mites) |
| Aura Carrier | Buffs nearby enemies while alive (Ward → +armor) |
| Boss | High threat; campaign + endless |

Leak damage by type. Abilities data-driven. Formula waves default; editor scripts OK. No wave preview. Call Early (small bonus); no skip. Difficulty hard by default.

---

## 8. Meta & presentation

- Aether: tech graph (slots/unlocks/caps/economy/lives/discounts/perks). Ranks permanent (no respec).
- Forge: unlocks upgrade-part *types* (new model) — escalating cost via `forgeBuys`. Old Forge "part buy/upgrade" maps onto this.
- Prestige/endgame: out of scope for v1. No tutorial.
- Audio/visual: procedural aesthetic. Particles on by default (toggle). Colorblind palette off by default (toggle). Generative ambient + kick. SFX baked at boot. Buses: Music/SFX/UI.

---

## 9. Menus

Boot → Main → Endless Hub | Campaign Select → Prep | Build/Forge | Tech | Level Editor | Settings

InGame Endless (in-run upgrades) | InGame Campaign (frozen meta) | Pause | Tower selected | Game Over | Victory | Confirms

HUD Endless: HP, Coin, Forge/Aether, Wave, Call Early (hold for 5×), Undo, Pause, selection (upgrade pick / sell / XP). HUD Campaign: same without Forge/tech.

Pause: Resume, Speed 1/2/3, Quit (confirm). Distinguishes mid-wave vs between-wave checkpoint.
Settings: volumes, particles, colorblind, camera pitch, IAP stub.
Hotkeys: `1`–`9`/`0` slots 1–10, `-`/`=` 11–12, `Space` Call Early, `Esc` pause, `U` pending branch→Damage, `X` sell, `W` wall (legacy — becomes barricade/tower-block in new system), `B` compose (legacy — becomes upgrade).

---

## 10. Architecture (summary — detail in `ARCHITECTURE.md`)

`app/` state/platform/saves/IAP stub · `sim/` pure 60 Hz sim · `view/` draw/HUD · `audio/` generative + baked · `data/` tables · `tests/` headless. Commands in → events out. Durations in seconds → ticks. Spatial targeting. Repath on change. Versioned saves (meta, endless checkpoint, campaign). Never write run lives into meta blindly.

## 11. Balance placeholders

All numeric values (costs, HP, XP thresholds, grid sizes, wall curve, wave formulas, aura amounts, start Battle/lives) are **data placeholders** until playtest.

---

*End GDD. Pair with `REWRITE_PLAN.md`, `ARCHITECTURE.md`, `DEV_GUIDELINES.md`. Prior history archived.*
