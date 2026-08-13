import { BoardGrid } from "../sim/boardGrid.js";
import { mulberry32 } from "../sim/rng.js";

/**
 * Place `count` walls with a seeded RNG; never seals spawn→exit.
 */
function generatePreWalls(cols, rows, seed, count) {
  const g = new BoardGrid();
  g.setup(cols, rows);
  const rand = mulberry32(seed >>> 0);
  const walls = [];
  let attempts = 0;
  while (walls.length < count && attempts < 800) {
    attempts++;
    const x = (rand() * cols) | 0;
    const y = (rand() * rows) | 0;
    if (y === 0 || y === rows - 1) continue;
    if (!g.isBuildable(x, y)) continue;
    if (walls.some((w) => w.x === x && w.y === y)) continue;
    g.setBlocked(x, y, true);
    if (!g.hasGroundPath()) {
      g.setBlocked(x, y, false);
      continue;
    }
    walls.push({ x, y });
  }
  return walls;
}

/**
 * Start Coin by decade of campaign progress:
 * levels 1–10 → 50, 11–20 → 75, 21–30 → 100, …
 */
export function campaignCoinGrant(levelId) {
  const id = Math.max(1, levelId | 0);
  return 50 + 25 * Math.floor((id - 1) / 10);
}

/**
 * Campaign ops against the Vein Claim.
 * Each wave may set speedMult (authored pace — not endless ramp).
 */
const LEVEL_DEFS = [
  {
    id: 1,
    name: "Outskirts Seal",
    blurb: "Mites test the outer plates. Stamp a path.",
    cols: 8,
    rows: 8,
    seed: 1001,
    wallCount: 6,
    atmosphere: "campaign_1",
    waves: [
      { pack: "mite_line", spawnGap: 0.52, speedMult: 0.85 },
      { pack: "mite_line", spawnGap: 0.46, speedMult: 0.9 },
      {
        queue: ["mite", "mite", "courier", "mite", "courier", "mite", "mite"],
        spawnGap: 0.42,
        speedMult: 0.95,
      },
      {
        queue: ["mite", "courier", "courier", "mite", "courier", "mite", "courier", "mite"],
        spawnGap: 0.38,
        speedMult: 1,
      },
      {
        queue: ["mite", "hauler", "mite", "courier", "mite", "courier", "mite", "mite"],
        spawnGap: 0.4,
        speedMult: 1,
      },
    ],
  },
  {
    id: 2,
    name: "Courier Choke",
    blurb: "Couriers punish loose lanes. Pick off the haulers before the exit.",
    cols: 8,
    rows: 8,
    seed: 2048,
    wallCount: 8,
    atmosphere: "campaign_2",
    waves: [
      { pack: "couriers", spawnGap: 0.36, speedMult: 1.05 },
      {
        queue: ["courier", "mite", "courier", "hauler", "courier", "mite", "courier"],
        spawnGap: 0.34,
        speedMult: 1.05,
      },
      { pack: "ward_wall", spawnGap: 0.34, speedMult: 0.95 },
      {
        queue: ["courier", "hauler", "courier", "mite", "courier", "hauler", "mite"],
        spawnGap: 0.3,
        speedMult: 1.08,
      },
      { pack: "couriers", spawnGap: 0.28, speedMult: 1.1 },
      {
        queue: ["courier", "hauler", "courier", "mite", "hauler", "courier", "mite", "hauler"],
        spawnGap: 0.28,
        speedMult: 1.05,
      },
    ],
  },
  {
    id: 3,
    name: "Plate Gauntlet",
    blurb: "Wards and casks. Shred plate; mind the split.",
    cols: 8,
    rows: 8,
    seed: 3333,
    wallCount: 10,
    atmosphere: "campaign_3",
    waves: [
      { pack: "mixed_mid", spawnGap: 0.34, speedMult: 1 },
      { pack: "air_cut", spawnGap: 0.3, speedMult: 1.05 },
      { pack: "ward_wall", spawnGap: 0.36, speedMult: 0.92 },
      { pack: "cask_burst", spawnGap: 0.32, speedMult: 1 },
      { pack: "haulers", spawnGap: 0.38, speedMult: 0.9 },
      {
        queue: ["ward", "duct", "cask", "courier", "ward", "hauler", "mite"],
        spawnGap: 0.3,
        speedMult: 0.95,
      },
      { pack: "cask_burst", spawnGap: 0.28, speedMult: 1.02 },
    ],
  },
  {
    id: 4,
    name: "Rivet Yard",
    blurb: "Kilns shrug flame. Frost the rush; shred the slab.",
    cols: 9,
    rows: 9,
    seed: 4400,
    wallCount: 12,
    atmosphere: "campaign_4",
    waves: [
      { pack: "heat", spawnGap: 0.34, speedMult: 0.9 },
      { pack: "ward_wall", spawnGap: 0.32, speedMult: 0.92 },
      { pack: "siphon_pack", spawnGap: 0.32, speedMult: 0.95 },
      { pack: "cask_burst", spawnGap: 0.3, speedMult: 1 },
      { pack: "air_cut", spawnGap: 0.28, speedMult: 1.05 },
      {
        queue: ["kiln", "siphon", "ward", "hauler", "kiln", "cask", "mite"],
        spawnGap: 0.3,
        speedMult: 0.92,
      },
      { pack: "heat", spawnGap: 0.28, speedMult: 0.95 },
      { pack: "finale_a", spawnGap: 0.32, speedMult: 0.9 },
    ],
  },
  {
    id: 5,
    name: "Crown Breach",
    blurb: "Claim Engines walk the crown. Hold the still.",
    cols: 9,
    rows: 10,
    seed: 5555,
    wallCount: 14,
    atmosphere: "campaign_5",
    waves: [
      { pack: "ward_wall", spawnGap: 0.32, speedMult: 0.92 },
      { pack: "cask_burst", spawnGap: 0.28, speedMult: 1 },
      { pack: "air_cut", spawnGap: 0.26, speedMult: 1.05 },
      { pack: "finale_a", spawnGap: 0.3, speedMult: 0.9 },
      { pack: "siphon_pack", spawnGap: 0.28, speedMult: 0.95 },
      { pack: "heat", spawnGap: 0.28, speedMult: 0.92 },
      {
        queue: ["mite", "courier", "hauler", "duct", "ward", "cask", "phantom", "kiln", "siphon"],
        spawnGap: 0.26,
        speedMult: 1,
      },
      { pack: "finale_b", spawnGap: 0.26, speedMult: 0.88 },
    ],
  },
  {
    id: 6,
    name: "Sky Vein",
    blurb: "The Claim takes the ducts. Flak earns its keep.",
    cols: 9,
    rows: 10,
    seed: 6060,
    wallCount: 12,
    atmosphere: "campaign_6",
    waves: [
      { pack: "air_cut", spawnGap: 0.28, speedMult: 1.08 },
      {
        queue: ["duct", "duct", "phantom", "courier", "duct", "phantom", "duct"],
        spawnGap: 0.26,
        speedMult: 1.1,
      },
      { pack: "couriers", spawnGap: 0.3, speedMult: 1.12 },
      { pack: "ward_wall", spawnGap: 0.32, speedMult: 0.95 },
      { pack: "air_cut", spawnGap: 0.24, speedMult: 1.12 },
      {
        queue: ["phantom", "duct", "cask", "phantom", "duct", "hauler", "duct", "courier"],
        spawnGap: 0.24,
        speedMult: 1.08,
      },
      { pack: "cask_burst", spawnGap: 0.26, speedMult: 1.02 },
      {
        queue: ["duct", "phantom", "ward", "duct", "claim", "phantom", "duct", "duct"],
        spawnGap: 0.26,
        speedMult: 1,
      },
    ],
  },
  {
    id: 7,
    name: "Ash Causeway",
    blurb: "Ceramite fronts. Shock fails — Breach and pulse decide.",
    cols: 10,
    rows: 10,
    seed: 7070,
    wallCount: 15,
    atmosphere: "campaign_7",
    waves: [
      { pack: "heat", spawnGap: 0.32, speedMult: 0.9 },
      { pack: "siphon_pack", spawnGap: 0.3, speedMult: 0.95 },
      { pack: "haulers", spawnGap: 0.34, speedMult: 0.88 },
      { pack: "ceramite_line", spawnGap: 0.3, speedMult: 0.85 },
      { pack: "volt_wall", spawnGap: 0.3, speedMult: 0.9 },
      {
        queue: ["kiln", "siphon", "hauler_ceramite", "ward_volt", "kiln", "cask", "hauler"],
        spawnGap: 0.28,
        speedMult: 0.9,
      },
      { pack: "finale_a", spawnGap: 0.28, speedMult: 0.88 },
      {
        queue: ["kiln", "hauler_ceramite", "siphon", "claim", "hauler", "ward_volt", "kiln"],
        spawnGap: 0.26,
        speedMult: 0.85,
      },
    ],
  },
];

export const CAMPAIGN_LEVELS = LEVEL_DEFS.map((def) => ({
  ...def,
  coinGrant: campaignCoinGrant(def.id),
  wavesToWin: def.waves.length,
  preWalls: generatePreWalls(def.cols, def.rows, def.seed, def.wallCount),
}));

export function getCampaignLevel(id) {
  return CAMPAIGN_LEVELS.find((l) => l.id === id) || null;
}

/**
 * Static spawn seam for a campaign level. Defaults to the center back line.
 * Levels may author `spawnCells` (any tiles, including mid-board for 40+);
 * the portal pins one cell for the whole level (seeded pick when several).
 */
export function levelPortalCell(lv) {
  const cells = lv.spawnCells;
  if (cells && cells.length) {
    if (cells.length === 1) return { x: cells[0].x, y: cells[0].y };
    const rand = mulberry32((lv.seed || 1) >>> 0);
    const c = cells[(rand() * cells.length) | 0];
    return { x: c.x, y: c.y };
  }
  return { x: (lv.cols / 2) | 0, y: 0 };
}

/** Linear unlock: level N needs N-1 cleared. */
export function isLevelUnlocked(levelId, clearedIds) {
  const cleared = new Set(clearedIds || []);
  if (levelId <= 1) return true;
  return cleared.has(levelId - 1);
}
