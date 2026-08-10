/**
 * Authored wave packs. `kinds` is a weighted list of enemy kind ids.
 * Campaign levels reference scripts by id; endless uses milestones + formula fallback.
 */

export const WAVE_SCRIPTS = {
  intro: {
    count: (w) => 6 + w,
    kinds: [
      { kind: "basic", w: 1 },
    ],
  },
  mixed_early: {
    count: (w) => Math.floor(8 * Math.pow(1.1, w - 1)),
    kinds: [
      { kind: "basic", w: 0.55 },
      { kind: "fast", w: 0.3 },
      { kind: "heavy", w: 0.15 },
    ],
  },
  air_probe: {
    count: (w) => Math.floor(9 * Math.pow(1.1, w - 1)),
    kinds: [
      { kind: "basic", w: 0.4 },
      { kind: "flying", w: 0.35 },
      { kind: "fast", w: 0.25 },
    ],
  },
  armor_wall: {
    count: (w) => Math.floor(8 * Math.pow(1.08, w - 1)),
    kinds: [
      { kind: "heavy", w: 0.35 },
      { kind: "shielded", w: 0.3 },
      { kind: "basic", w: 0.35 },
    ],
  },
  split_push: {
    count: (w) => Math.floor(7 * Math.pow(1.1, w - 1)),
    kinds: [
      { kind: "splitter", w: 0.35 },
      { kind: "fast", w: 0.3 },
      { kind: "basic", w: 0.35 },
    ],
  },
  boss_gate: {
    count: (w) => Math.floor(10 * Math.pow(1.08, w - 1)),
    kinds: [
      { kind: "basic", w: 0.35 },
      { kind: "heavy", w: 0.2 },
      { kind: "shielded", w: 0.15 },
      { kind: "flying", w: 0.15 },
      { kind: "boss", w: 0.05 },
      { kind: "splitter", w: 0.1 },
    ],
    guaranteeBoss: true,
  },
  endless_escalation: {
    count: (w) => Math.floor(8 * Math.pow(1.12, w - 1)),
    kinds: [
      { kind: "basic", w: 0.35 },
      { kind: "fast", w: 0.18 },
      { kind: "heavy", w: 0.15 },
      { kind: "flying", w: 0.12 },
      { kind: "shielded", w: 0.1 },
      { kind: "splitter", w: 0.08 },
      { kind: "boss", w: 0.02 },
    ],
  },
};

/** Pick a script id for endless wave index. */
export function endlessScriptId(wave) {
  if (wave >= 20 && wave % 10 === 0) return "boss_gate";
  if (wave >= 12 && wave % 5 === 0) return "split_push";
  if (wave >= 8 && wave % 4 === 0) return "armor_wall";
  if (wave >= 6 && wave % 3 === 0) return "air_probe";
  if (wave >= 4) return "endless_escalation";
  if (wave >= 2) return "mixed_early";
  return "intro";
}
