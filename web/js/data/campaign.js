import { BoardGrid } from "../sim/boardGrid.js";

/** Deterministic PRNG (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Place `count` walls with a seeded RNG; never seals spawn→exit.
 * Avoids spawn/exit rows a bit so the path isn't trivial noise.
 */
export function generatePreWalls(cols, rows, seed, count) {
  const g = new BoardGrid();
  g.setup(cols, rows);
  const rand = rng(seed);
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
    blurb: "A small yard with scattered rubble.",
    cols: 8,
    rows: 8,
    seed: 1001,
    wallCount: 6,
    wavesToWin: 5,
    coinGrant: 100,
  },
  {
    id: 2,
    name: "Choke Point",
    blurb: "Tighter rubble — force the lane.",
    cols: 8,
    rows: 8,
    seed: 2048,
    wallCount: 8,
    wavesToWin: 6,
    coinGrant: 110,
  },
  {
    id: 3,
    name: "Gauntlet",
    blurb: "Dense cover. Survive the push.",
    cols: 8,
    rows: 8,
    seed: 3333,
    wallCount: 10,
    wavesToWin: 7,
    coinGrant: 120,
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
