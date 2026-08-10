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

/**
 * Campaign waves are fixed — each entry is a pack id, queue array, or { pack|queue, spawnGap }.
 */
const LEVEL_DEFS = [
  {
    id: 1,
    name: "Outskirts",
    blurb: "Grubs in the lane. Learn pathing and composition.",
    cols: 8,
    rows: 8,
    seed: 1001,
    wallCount: 6,
    wavesToWin: 5,
    coinGrant: 100,
    waves: [
      { pack: "grub_line", spawnGap: 0.5 },
      { pack: "grub_line", spawnGap: 0.42 },
      { queue: ["grub", "grub", "runner", "grub", "runner", "grub"], spawnGap: 0.4 },
      { queue: ["grub", "runner", "runner", "grub", "runner", "grub", "runner"], spawnGap: 0.36 },
      { queue: ["grub", "plate", "grub", "runner", "grub", "runner", "grub"], spawnGap: 0.38 },
    ],
  },
  {
    id: 2,
    name: "Choke Point",
    blurb: "Runners punish loose lanes. Skiffs arrive mid-fight.",
    cols: 8,
    rows: 8,
    seed: 2048,
    wallCount: 8,
    wavesToWin: 6,
    coinGrant: 110,
    waves: [
      { pack: "runners", spawnGap: 0.38 },
      { queue: ["runner", "grub", "runner", "plate", "runner", "grub"], spawnGap: 0.36 },
      { pack: "air_cut", spawnGap: 0.34 },
      { queue: ["runner", "skiff", "runner", "skiff", "grub", "runner"], spawnGap: 0.32 },
      { pack: "runners", spawnGap: 0.3 },
      { queue: ["skiff", "wraith", "runner", "plate", "skiff", "runner", "grub"], spawnGap: 0.3 },
    ],
  },
  {
    id: 3,
    name: "Gauntlet",
    blurb: "Aegis plates and clusters — acid and overkill matter.",
    cols: 8,
    rows: 8,
    seed: 3333,
    wallCount: 10,
    wavesToWin: 7,
    coinGrant: 120,
    waves: [
      { pack: "mixed_mid", spawnGap: 0.36 },
      { pack: "air_cut", spawnGap: 0.32 },
      { pack: "aegis_wall", spawnGap: 0.38 },
      { pack: "cluster_burst", spawnGap: 0.34 },
      { pack: "plates", spawnGap: 0.4 },
      { queue: ["aegis", "skiff", "cluster", "runner", "aegis", "plate"], spawnGap: 0.32 },
      { pack: "cluster_burst", spawnGap: 0.3 },
    ],
  },
  {
    id: 4,
    name: "Rivet Yard",
    blurb: "Furnaces shrug fire. Leeches knit wounds. Bring frost and shred.",
    cols: 9,
    rows: 9,
    seed: 4400,
    wallCount: 12,
    wavesToWin: 8,
    coinGrant: 130,
    waves: [
      { pack: "heat", spawnGap: 0.36 },
      { pack: "aegis_wall", spawnGap: 0.34 },
      { pack: "leech_pack", spawnGap: 0.34 },
      { pack: "cluster_burst", spawnGap: 0.32 },
      { pack: "air_cut", spawnGap: 0.3 },
      { queue: ["furnace", "leech", "aegis", "plate", "furnace", "cluster"], spawnGap: 0.32 },
      { pack: "heat", spawnGap: 0.3 },
      { pack: "finale_a", spawnGap: 0.34 },
    ],
  },
  {
    id: 5,
    name: "Crown Breach",
    blurb: "Hold the bastion. Overlords walk the crown.",
    cols: 9,
    rows: 10,
    seed: 5555,
    wallCount: 14,
    wavesToWin: 8,
    coinGrant: 140,
    waves: [
      { pack: "aegis_wall", spawnGap: 0.34 },
      { pack: "cluster_burst", spawnGap: 0.3 },
      { pack: "air_cut", spawnGap: 0.28 },
      { pack: "finale_a", spawnGap: 0.32 },
      { pack: "leech_pack", spawnGap: 0.3 },
      { pack: "heat", spawnGap: 0.3 },
      {
        queue: ["grub", "runner", "plate", "skiff", "aegis", "cluster", "wraith", "furnace", "leech"],
        spawnGap: 0.28,
      },
      { pack: "finale_b", spawnGap: 0.28 },
    ],
  },
  {
    id: 6,
    name: "Sky Vein",
    blurb: "Act II opens above the deck. Flak and Aerie earn their keep.",
    cols: 9,
    rows: 10,
    seed: 6060,
    wallCount: 12,
    coinGrant: 145,
    atmosphere: "campaign_6",
    waves: [
      { pack: "air_cut", spawnGap: 0.3 },
      { queue: ["skiff", "skiff", "wraith", "runner", "skiff", "wraith"], spawnGap: 0.28 },
      { pack: "runners", spawnGap: 0.32 },
      { pack: "aegis_wall", spawnGap: 0.34 },
      { pack: "air_cut", spawnGap: 0.26 },
      {
        queue: ["wraith", "skiff", "cluster", "wraith", "skiff", "plate", "skiff"],
        spawnGap: 0.26,
      },
      { pack: "cluster_burst", spawnGap: 0.28 },
      {
        queue: ["skiff", "wraith", "aegis", "skiff", "overlord", "wraith", "skiff"],
        spawnGap: 0.28,
      },
    ],
  },
  {
    id: 7,
    name: "Ash Causeway",
    blurb: "Foundry heat and regen. Breach payloads and frost change the math.",
    cols: 10,
    rows: 10,
    seed: 7070,
    wallCount: 15,
    coinGrant: 155,
    atmosphere: "campaign_7",
    waves: [
      { pack: "heat", spawnGap: 0.34 },
      { pack: "leech_pack", spawnGap: 0.32 },
      { pack: "plates", spawnGap: 0.36 },
      { pack: "foundry_mix", spawnGap: 0.3 },
      { pack: "aegis_wall", spawnGap: 0.32 },
      {
        queue: ["furnace", "leech", "plate", "furnace", "aegis", "leech", "cluster"],
        spawnGap: 0.3,
      },
      { pack: "finale_a", spawnGap: 0.3 },
      {
        queue: ["furnace", "furnace", "leech", "overlord", "plate", "aegis", "furnace"],
        spawnGap: 0.28,
      },
    ],
  },
];

export const CAMPAIGN_LEVELS = LEVEL_DEFS.map((def) => ({
  ...def,
  wavesToWin: def.waves.length,
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
