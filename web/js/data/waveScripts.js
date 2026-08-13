/**
 * Campaign waves are authored fixed queues.
 * Endless uses composeEndlessWave() — seeded RNG packs with themes.
 */

import { ENEMY_COST, resolveEnemyKind } from "./enemies.js";

/** Named reusable packs for campaign authoring (Slag Host ids). */
export const WAVE_PACKS = {
  mite_line: ["mite", "mite", "mite", "mite", "mite", "mite", "mite"],
  couriers: ["courier", "courier", "courier", "mite", "courier", "courier", "courier"],
  haulers: ["hauler", "mite", "hauler", "mite", "hauler", "mite"],
  air_cut: ["duct", "duct", "phantom", "duct", "mite", "duct", "phantom"],
  ward_wall: ["ward", "hauler", "ward", "mite", "ward", "hauler"],
  cask_burst: ["cask", "courier", "cask", "mite", "cask", "courier"],
  heat: ["kiln", "kiln", "hauler", "mite", "kiln", "hauler"],
  siphon_pack: ["siphon", "mite", "siphon", "courier", "siphon", "mite"],
  mixed_mid: ["mite", "courier", "hauler", "duct", "ward", "mite", "courier", "mite"],
  finale_a: ["hauler", "ward", "cask", "duct", "kiln", "siphon", "claim"],
  finale_b: ["phantom", "phantom", "cask", "ward", "hauler", "kiln", "claim"],
  ceramite_line: ["hauler_ceramite", "hauler", "hauler_ceramite", "mite", "ward"],
  volt_wall: ["ward_volt", "hauler", "ward_volt", "duct", "ward"],
  // legacy pack ids → same content under old names for editor saves
  grub_line: null,
  runners: null,
  plates: null,
  aegis_wall: null,
  cluster_burst: null,
  leech_pack: null,
};

// Wire legacy pack aliases
WAVE_PACKS.grub_line = WAVE_PACKS.mite_line;
WAVE_PACKS.runners = WAVE_PACKS.couriers;
WAVE_PACKS.plates = WAVE_PACKS.haulers;
WAVE_PACKS.aegis_wall = WAVE_PACKS.ward_wall;
WAVE_PACKS.cluster_burst = WAVE_PACKS.cask_burst;
WAVE_PACKS.leech_pack = WAVE_PACKS.siphon_pack;

/**
 * Endless themes unlocked by wave.
 */
export const ENDLESS_THEMES = [
  { id: "mites", unlock: 1, w: 1.25, kinds: { mite: 0.72, courier: 0.28 } },
  { id: "rush", unlock: 2, w: 1, kinds: { courier: 0.55, mite: 0.25, phantom: 0.2 } },
  { id: "haulers", unlock: 3, w: 1, kinds: { hauler: 0.35, ward: 0.25, mite: 0.25, kiln: 0.15 } },
  { id: "ducts", unlock: 4, w: 1, kinds: { duct: 0.4, phantom: 0.3, mite: 0.2, courier: 0.1 } },
  { id: "breach", unlock: 5, w: 0.9, kinds: { cask: 0.3, courier: 0.25, mite: 0.25, siphon: 0.2 } },
  { id: "foundry", unlock: 7, w: 0.85, kinds: { kiln: 0.35, hauler: 0.25, ward: 0.2, mite: 0.2 } },
  {
    id: "ceramite",
    unlock: 10,
    w: 0.9,
    kinds: { hauler_ceramite: 0.35, hauler: 0.2, ward: 0.2, mite: 0.15, kiln: 0.1 },
  },
  {
    id: "volt",
    unlock: 12,
    w: 0.85,
    kinds: { ward_volt: 0.35, duct: 0.2, hauler: 0.2, mite: 0.15, phantom: 0.1 },
  },
  {
    id: "chaos",
    unlock: 9,
    w: 1.15,
    kinds: {
      mite: 0.16,
      courier: 0.12,
      hauler: 0.1,
      duct: 0.1,
      ward: 0.09,
      cask: 0.09,
      phantom: 0.08,
      kiln: 0.08,
      siphon: 0.08,
      hauler_ceramite: 0.05,
      ward_volt: 0.05,
    },
  },
];

export const ENDLESS_EVENTS = [
  {
    id: "sky_breach",
    unlock: 5,
    chance: 0.14,
    kinds: { duct: 0.45, phantom: 0.35, courier: 0.1, mite: 0.1 },
  },
  {
    id: "foundry_night",
    unlock: 7,
    chance: 0.12,
    kinds: { kiln: 0.4, hauler: 0.3, ward: 0.15, mite: 0.15 },
  },
  {
    id: "ceramite_front",
    unlock: 11,
    chance: 0.12,
    kinds: { hauler_ceramite: 0.45, ward: 0.25, mite: 0.15, kiln: 0.15 },
  },
];

export function composeEndlessWave(wave, rand) {
  const w = Math.max(1, wave | 0);
  // Slightly denser packs than before
  let budget = 8.5 + w * 1.45 + Math.floor(w / 3) * 0.9 + rand() * (2.2 + w * 0.16);
  const unlocked = ENDLESS_THEMES.filter((t) => w >= t.unlock);
  const theme = weightedPick(unlocked, rand);
  let event = "";
  let kinds = theme.kinds;

  if (w >= 5 && rand() < 0.18) {
    const events = ENDLESS_EVENTS.filter((ev) => w >= ev.unlock && rand() < ev.chance + 0.08);
    if (events.length) {
      const ev = events[(rand() * events.length) | 0];
      event = ev.id;
      kinds = ev.kinds;
      budget *= 1.1;
    }
  }

  const queue = [];
  let spent = 0;
  let guard = 0;

  const bossChance = w >= 10 ? Math.min(0.55, 0.08 + (w - 10) * 0.02) : 0;
  const wantBoss = w >= 8 && (w % 10 === 0 || rand() < bossChance);

  while (spent < budget && guard++ < 90) {
    const kind = pickKind(kinds, w, rand);
    const cost = ENEMY_COST[kind] || 1;
    if (spent + cost > budget + 1.5 && queue.length > 3) break;
    if (rand() < 0.24 && kind !== "claim") {
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

  if (wantBoss) queue.push("claim");
  if (!queue.length) queue.push("mite", "mite", "mite", "mite");

  if (rand() < 0.55) fisherYates(queue, rand);

  const spawnGap = Math.max(0.16, 0.52 * Math.pow(0.965, w - 1) * (0.75 + rand() * 0.5));
  return { queue, spawnGap, theme: theme.id, event };
}

function pickKind(table, wave, rand) {
  const entries = Object.entries(table).map(([kind, weight]) => {
    let w = weight;
    if (wave >= 12 && kind === "mite") w *= 0.65;
    if (wave >= 8 && kind === "claim") w *= 0;
    if (wave < 6 && (kind === "kiln" || kind === "siphon")) w *= 0.35;
    if (wave < 10 && (kind === "hauler_ceramite" || kind === "ward_volt")) w *= 0.2;
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

/** Expand a campaign wave def into { queue, spawnGap, speedMult }. */
export function resolveCampaignWave(def, waveIndex) {
  if (!def) {
    return { queue: ["mite", "mite", "mite", "mite", "mite"], spawnGap: 0.48, speedMult: 0.9 };
  }
  if (Array.isArray(def)) {
    return { queue: def.map(resolveEnemyKind), spawnGap: 0.4, speedMult: 1 };
  }
  if (typeof def === "string" && WAVE_PACKS[def]) {
    return { queue: WAVE_PACKS[def].map(resolveEnemyKind), spawnGap: 0.4, speedMult: 1 };
  }
  const pack = def.pack && WAVE_PACKS[def.pack] ? WAVE_PACKS[def.pack] : null;
  const queue = (def.queue || pack || ["mite"]).map(resolveEnemyKind);
  return {
    queue,
    spawnGap: def.spawnGap != null ? def.spawnGap : 0.4,
    speedMult: def.speedMult != null ? def.speedMult : 1,
  };
}
