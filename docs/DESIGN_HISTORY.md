# Design history — Project Tower Defense

Conversation reconciliations (later answer wins). Kept out of the final GDD for clarity.

| Earlier | Final |
|---------|--------|
| Path of least resistance (weighted) | Shortest path only |
| Endless “levels” / save per level | Infinite waves; **inWave** checkpoint at wave start + **betweenWaves** on clear |
| Continue ambiguous | Mid-wave → start of last wave; between waves → keep post-clear board |
| Coins + Aether only | Aether + Forge + Battle |
| Builder mid-run all modes | Endless live compose; Campaign Prep-only meta |
| Tutorial | None |
| Lives maybe | Meta Iron Guard path — base **3** (not 5) |
| Level cap start | **1** (was briefly 2 in code) → 5 via tech |
| Roster slots | 3→12 via tech (was soft-capped at 6) |
| Sell place-cost only | Salvager 50%/60%/75% of recorded Battle paid |
| Income vague | Battle: start+drops; Forge: wave+campaign; Aether: wave+first-clear |
| Meta vault sync | Absolute assign from sim → **delta-merge** run gains only |
| Call Early | Claimed once per wave (checkpointed) |
| Grid growth | South from top |
| XP auto-level | XP fills → auto-level (+branch pick); overlay Damage/ROF/Range |
| Battle buys levels | Removed — Battle is place/walls only |
| Campaign map RNG | Predefined seed per level |
| Campaign scope | Shipped **12 Act I levels** (was 7 — expanded, see `data/campaign.js`); 5/10/25×3 PINNED |
| Flying | Air layer; ignore walls/towers |
| Start grant | Battle only; free parts sentry/single/kinetic |
| Commander / Trap | Commander aura+fire; Trap pulse primary |
| Colorblind | Toggle; default off |
| Particles | Toggle; default on |
| Tech refund | Full Foundations+Arsenal respec |
| Rail pierce | Ballistic + pierce hits (was unused while homing) |

Open for playtest (not design blockers): numeric balance, prestige, content volume beyond starter triad and enemy briefs.

## 2026-08 audit reconciliation

Code treated as intentional product for lives ladder (3→25), place surcharge, flak/breach/emp parts, and Act I campaign slice. GDD/CURSOR/ARCHITECTURE/PLAY updated to match. Critical Continue/meta/early-bonus/pierce bugs and High level-points / slots12 / undo / hotkeys / respec / sell UI / homing-death fixed in `web/`.
