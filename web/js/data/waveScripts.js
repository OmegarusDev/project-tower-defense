/**
 * Campaign waves are authored fixed queues.
 * Endless uses composeEndlessWave() — seeded RNG packs with themes.
 */

import { ENEMY_COST, resolveEnemyKind } from "./enemies.js";

/** Named reusable packs for campaign authoring. */
export const WAVE_PACKS = {
  grub_line: ["grub", "grub", "grub", "grub", "grub", "grub"],
  runners: ["runner", "runner", "runner", "grub", "runner", "runner"],
  plates: ["plate", "grub", "plate", "grub", "plate"],
  air_cut: ["skiff", "skiff", "wraith", "skiff", "grub", "skiff"],
  aegis_wall: ["aegis", "plate", "aegis", "grub", "aegis"],
  cluster_burst: ["cluster", "runner", "cluster", "grub", "cluster"],
  heat: ["furnace", "furnace", "plate", "grub", "furnace"],
  leech_pack: ["leech", "grub", "leech", "runner", "leech"],
  mixed_mid: ["grub", "runner", "plate", "skiff", "aegis", "grub", "runner"],
  finale_a: ["plate", "aegis", "cluster", "skiff", "furnace", "leech", "overlord"],
  finale_b: ["wraith", "wraith", "cluster", "aegis", "plate", "furnace", "overlord"],
};

/**
 * Endless themes unlocked by wave. Weights relative within unlocked set.
 * `kinds` = weighted spawn table for the theme.
 */
export const ENDLESS_THEMES = [
  { id: "fodder", unlock: 1, w: 1.2, kinds: { grub: 0.7, runner: 0.3 } },
  { id: "rush", unlock: 2, w: 1, kinds: { runner: 0.55, grub: 0.25, wraith: 0.2 } },
  { id: "armor", unlock: 3, w: 1, kinds: { plate: 0.35, aegis: 0.25, grub: 0.25, furnace: 0.15 } },
  { id: "sky", unlock: 4, w: 1, kinds: { skiff: 0.4, wraith: 0.3, grub: 0.2, runner: 0.1 } },
  { id: "breach", unlock: 5, w: 0.9, kinds: { cluster: 0.3, runner: 0.25, grub: 0.25, leech: 0.2 } },
  { id: "foundry", unlock: 7, w: 0.85, kinds: { furnace: 0.35, plate: 0.25, aegis: 0.2, grub: 0.2 } },
  { id: "chaos", unlock: 9, w: 1.1, kinds: {
    grub: 0.18, runner: 0.14, plate: 0.12, skiff: 0.12,
    aegis: 0.1, cluster: 0.1, wraith: 0.08, furnace: 0.08, leech: 0.08,
  } },
];

export function composeEndlessWave(wave, rand) {
  const w = Math.max(1, wave | 0);
  const budget = 7 + w * 1.35 + Math.floor(w / 3) * 0.8 + rand() * (2 + w * 0.15);
  const unlocked = ENDLESS_THEMES.filter((t) => w >= t.unlock);
  const theme = weightedPick(unlocked, rand);
  const queue = [];
  let spent = 0;
  let guard = 0;

  // Occasional boss punctuations (not every N — roll with rising chance)
  const bossChance = w >= 10 ? Math.min(0.55, 0.08 + (w - 10) * 0.02) : 0;
  const wantBoss = w >= 8 && (w % 10 === 0 || rand() < bossChance);

  while (spent < budget && guard++ < 80) {
    const kind = pickKind(theme.kinds, w, rand);
    const cost = ENEMY_COST[kind] || 1;
    if (spent + cost > budget + 1.5 && queue.length > 3) break;
    // Pack streak: sometimes dump 2–4 of same kind
    if (rand() < 0.22 && kind !== "overlord") {
      const n = 2 + ((rand() * 3) | 0);
      for (let i = 0; i < n && spent < budget + 2; i++) {
        queue.push(kind);
        spent += cost;
      }
    } else {
      queue.push(kind);
      spent += cost;
    }
  }

  if (wantBoss) {
    queue.push("overlord");
  }
  if (!queue.length) queue.push("grub", "grub", "grub");

  // Shuffle lightly so streaks aren't always front-loaded
  if (rand() < 0.55) fisherYates(queue, rand);

  const spawnGap = Math.max(0.18, 0.55 * Math.pow(0.965, w - 1) * (0.75 + rand() * 0.5));
  return { queue, spawnGap, theme: theme.id };
}

function pickKind(table, wave, rand) {
  const entries = Object.entries(table).map(([kind, weight]) => {
    let w = weight;
    // Late-wave bias toward tougher units
    if (wave >= 12 && (kind === "grub")) w *= 0.65;
    if (wave >= 8 && (kind === "overlord")) w *= 0;
    if (wave < 6 && (kind === "furnace" || kind === "leech")) w *= 0.35;
    return [kind, w];
  });
  return weightedPick(
    entries.map(([kind, w]) => ({ id: kind, w })),
    rand
  ).id;
}

function weightedPick(list, rand) {
  let total = 0;
  for (const item of list) total += item.w;
  let roll = rand() * total;
  for (const item of list) {
    roll -= item.w;
    if (roll <= 0) return item;
  }
  return list[list.length - 1];
}

function fisherYates(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
}

/** Expand a campaign wave def into { queue, spawnGap }. */
export function resolveCampaignWave(def, waveIndex) {
  if (!def) {
    return { queue: ["grub", "grub", "grub", "grub"], spawnGap: 0.45 };
  }
  if (Array.isArray(def)) {
    return { queue: def.map(resolveEnemyKind), spawnGap: 0.4 };
  }
  if (typeof def === "string" && WAVE_PACKS[def]) {
    return { queue: WAVE_PACKS[def].map(resolveEnemyKind), spawnGap: 0.4 };
  }
  const pack = def.pack && WAVE_PACKS[def.pack] ? WAVE_PACKS[def.pack] : null;
  const queue = (def.queue || pack || ["grub"]).map(resolveEnemyKind);
  return {
    queue,
    spawnGap: def.spawnGap != null ? def.spawnGap : 0.4,
  };
}

/** @deprecated kept for editor dropdown compatibility */
export const WAVE_SCRIPTS = Object.fromEntries(
  Object.keys(WAVE_PACKS).map((id) => [
    id,
    {
      count: () => WAVE_PACKS[id].length,
      kinds: WAVE_PACKS[id].reduce((acc, k) => {
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
    },
  ])
);
