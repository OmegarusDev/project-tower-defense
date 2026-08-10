import { BoardGrid } from "../sim/boardGrid.js";
import { mulberry32 } from "../sim/rng.js";

/**
 * Place `count` walls with a seeded RNG; never seals spawn→exit.
 */
export function generatePreWalls(cols, rows, seed, count) {
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

const LEVEL_DEFS = [
  {
    id: 1,
    name: "Outskirts",
    blurb: "Learn the lane — basic pressure only.",
    cols: 8,
    rows: 8,
    seed: 1001,
    wallCount: 6,
    wavesToWin: 5,
    coinGrant: 100,
    waveScripts: ["intro", "intro", "mixed_early", "mixed_early", "mixed_early"],
  },
  {
    id: 2,
    name: "Choke Point",
    blurb: "Force the lane. Fast units punish loose paths.",
    cols: 8,
    rows: 8,
    seed: 2048,
    wallCount: 8,
    wavesToWin: 6,
    coinGrant: 110,
    waveScripts: ["mixed_early", "mixed_early", "mixed_early", "air_probe", "mixed_early", "air_probe"],
  },
  {
    id: 3,
    name: "Gauntlet",
    blurb: "Dense cover. Armor and air arrive together.",
    cols: 8,
    rows: 8,
    seed: 3333,
    wallCount: 10,
    wavesToWin: 7,
    coinGrant: 120,
    waveScripts: [
      "mixed_early",
      "air_probe",
      "armor_wall",
      "mixed_early",
      "armor_wall",
      "air_probe",
      "split_push",
    ],
  },
  {
    id: 4,
    name: "Rivet Yard",
    blurb: "Shielded hulls — bring acid shred or overkill.",
    cols: 9,
    rows: 9,
    seed: 4400,
    wallCount: 12,
    wavesToWin: 8,
    coinGrant: 130,
    waveScripts: [
      "mixed_early",
      "armor_wall",
      "split_push",
      "armor_wall",
      "air_probe",
      "split_push",
      "armor_wall",
      "boss_gate",
    ],
  },
  {
    id: 5,
    name: "Crown Breach",
    blurb: "First campaign finale — hold the bastion.",
    cols: 9,
    rows: 10,
    seed: 5555,
    wallCount: 14,
    wavesToWin: 8,
    coinGrant: 140,
    waveScripts: [
      "armor_wall",
      "split_push",
      "air_probe",
      "boss_gate",
      "split_push",
      "armor_wall",
      "endless_escalation",
      "boss_gate",
    ],
  },
];

export const CAMPAIGN_LEVELS = LEVEL_DEFS.map((def) => ({
  ...def,
  preWalls: generatePreWalls(def.cols, def.rows, def.seed, def.wallCount),
}));

export function getCampaignLevel(id) {
  return CAMPAIGN_LEVELS.find((l) => l.id === id) || null;
}

/** Linear unlock: level N needs N-1 cleared. */
export function isLevelUnlocked(levelId, clearedIds) {
  const cleared = new Set(clearedIds || []);
  if (levelId <= 1) return true;
  return cleared.has(levelId - 1);
}
