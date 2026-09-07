/**
 * Shared forgeworks meta-screen helpers — roster peeks, threat tags, level thumbs.
 */

import { buildAttackPlan } from "../sim/attackPlan.js";
import { PARTS, partLabel, doctrineLabel } from "../data/parts.js";
import { enemyDef } from "../data/enemies.js";
import { resolveCampaignWave } from "../data/waveScripts.js";
import { ENDLESS_THEMES } from "../data/waveScripts.js";

const THREAT_LABEL = {
  mite: "Mite",
  courier: "Rush",
  hauler: "Plate",
  hauler_ceramite: "Ceramite",
  duct: "Air",
  ward: "Ward",
  ward_volt: "Energy",
  cask: "Split",
  phantom: "Air",
  kiln: "Heat",
  siphon: "Regen",
  skulk: "Skulk",
  claim: "Claim",
  // legacy
  grub: "Mite",
  runner: "Rush",
  plate: "Plate",
  skiff: "Air",
  aegis: "Ward",
  cluster: "Split",
  wraith: "Air",
  furnace: "Heat",
  leech: "Regen",
  overlord: "Claim",
};

const FODDER = new Set(["mite", "courier", "grub", "runner"]);
/** Distinctive Cinder kinds — pin if present so fodder and common plate don't drown them. */
const DISTINCT = [
  "claim",
  "ward_volt",
  "hauler_ceramite",
  "duct",
  "phantom",
  "kiln",
  "cask",
  "siphon",
];

/** Unique threat tags from a campaign level's authored waves. */
export function threatTagsForLevel(lv, max = 5) {
  const counts = new Map();
  for (const def of lv.waves || []) {
    const { queue } = resolveCampaignWave(def, 1);
    for (const k of queue) counts.set(k, (counts.get(k) || 0) + 1);
  }
  const cap = Math.max(0, max | 0);
  const picked = [];
  const used = new Set();
  const push = (k) => {
    if (!k || used.has(k) || !counts.has(k) || picked.length >= cap) return;
    used.add(k);
    picked.push(k);
  };
  for (const k of DISTINCT) push(k);
  const rest = [...counts.keys()]
    .filter((k) => !used.has(k))
    .sort((a, b) => {
      const af = FODDER.has(a) ? 1 : 0;
      const bf = FODDER.has(b) ? 1 : 0;
      if (af !== bf) return af - bf;
      return counts.get(b) - counts.get(a) || a.localeCompare(b);
    });
  for (const k of rest) push(k);
  return picked.map((k) => ({ id: k, label: THREAT_LABEL[k] || enemyDef(k).label || k }));
}

/** Compact HTML for full roster peek (all unlocked slots). */
export function rosterPeekHtml(meta) {
  const n = meta.slotCount | 0 || 3;
  const roster = meta.roster || [];
  const chips = [];
  for (let i = 0; i < n; i++) {
    const slot = roster[i];
    if (!slot?.complete) {
      chips.push(`<span class="load-chip empty">S${i + 1} · empty</span>`);
      continue;
    }
    const plan = buildAttackPlan(slot.base, slot.barrel, slot.payload, 1, {});
    const doc = doctrineLabel(PARTS.bases[slot.base]?.doctrine);
    chips.push(
      `<span class="load-chip" title="${partLabel(slot.base)} / ${partLabel(slot.barrel)} / ${partLabel(
        slot.payload
      )}">S${i + 1} · ${doc} · ${plan.damageType}</span>`
    );
  }
  return `<div class="roster-peek" aria-label="Loadout">${chips.join("")}</div>`;
}

export function endlessThemeBlurb() {
  return ENDLESS_THEMES.map((t) => t.id).slice(0, 5).join(" → ") + "…";
}

/** Paint a tiny top-down path/wall thumb into a canvas. */
export function paintLevelThumb(canvas, lv, palette) {
  if (!canvas || !lv) return;
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 72;
  const h = canvas.clientHeight || 72;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const pad = 4;
  const cols = lv.cols | 0;
  const rows = lv.rows | 0;
  const cell = Math.min((w - pad * 2) / cols, (h - pad * 2) / rows);
  const ox = (w - cols * cell) / 2;
  const oy = (h - rows * cell) / 2;
  ctx.fillStyle = palette?.bg || "#14181e";
  ctx.fillRect(0, 0, w, h);
  const walls = new Set((lv.preWalls || []).map((p) => `${p.x},${p.y}`));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const key = `${x},${y}`;
      let col = (x + y) % 2 ? palette?.tileA || "#1c222a" : palette?.tileB || "#1a2028";
      if (y === 0) col = palette?.spawn || "#5aaf8a";
      else if (y === rows - 1) col = palette?.exit || "#c45a4a";
      else if (walls.has(key)) col = palette?.wall || "#9aa6b4";
      ctx.fillStyle = col;
      ctx.fillRect(ox + x * cell + 0.5, oy + y * cell + 0.5, cell - 1, cell - 1);
    }
  }
  ctx.strokeStyle = "rgba(201,162,39,0.35)";
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
}
