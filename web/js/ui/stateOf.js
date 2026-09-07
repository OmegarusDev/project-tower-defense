/**
 * State adapters — renderers take a plain snapshot; they never see `app`.
 * Closures are resolved here (quotes, overlay anchor, waveBusy flag).
 */
import { VIEW25 } from "../view/camera.js";
import { MAX_ROSTER_SLOTS } from "../data/parts.js";
import { nextRosterSlotUnlock } from "../data/techTree.js";
import { quoteTowerPlace } from "../sim/systems/economy.js";
import { hasEndless, loadEndless } from "../saveStore.js";

const EMPTY_QUOTE = Object.freeze({
  complete: false,
  btnLabel: "—",
  costLabel: "—",
  tip: "incomplete — set in Forge",
  total: 0,
  surcharge: 0,
  base: 0,
  loadout: null,
});

function slotQuote(run, i) {
  const s = run?.roster?.[i];
  if (!s?.complete) {
    return {
      complete: false,
      btnLabel: `S${i + 1} · —`,
      costLabel: "—",
      tip: "incomplete — set in Forge",
      total: 0,
      surcharge: 0,
      base: 0,
      loadout: s || null,
    };
  }
  const q = quoteTowerPlace(run.economy, s, run.towers);
  return {
    complete: true,
    btnLabel: `S${i + 1} · ${q.total}`,
    costLabel: `${q.total}`,
    tip: `${s.base}/${s.barrel}/${s.payload}${q.surcharge ? ` (+${q.surcharge} part tax)` : ""}`,
    total: q.total,
    surcharge: q.surcharge,
    base: q.base,
    loadout: s,
  };
}

function quotesFor(run) {
  const out = [];
  for (let i = 0; i < MAX_ROSTER_SLOTS; i++) out.push(slotQuote(run, i));
  return out;
}

function overlayAnchorOf(app, run) {
  if (!run || !app.board) return null;
  const tid = app.interaction.selectedTowerId;
  const wid = app.interaction.selectedWallId;
  const t = tid >= 0 ? run.towers.find((x) => x.id === tid) : null;
  const wall = wid >= 0 ? run.walls.find((w) => w.id === wid) : null;
  const cell = t?.cell || wall?.cell;
  if (!cell) return null;
  return app.board.cellScreenCenter(cell.x, cell.y);
}

/** Meta-screen state (registry mount). */
export function screenState(app) {
  return Object.freeze({
    meta: app.meta,
    status: app.status,
    sim: app.sim?.state ?? null,
    forgeSlot: app.forgeSlot,
    forgeReturn: app.forgeReturn || "main",
    prepLevelId: app.prepLevelId,
    prepSlot: app.prepSlot,
    upgradeReturn: app.upgradeReturn,
    techTreeTab: app.techTreeTab,
    techSelectedId: app.techSelectedId,
    checkpoint: hasEndless() ? loadEndless() : null,
    firstClear: false,
    endBestBonus: null,
  });
}

/** End-screen state (victory / game over). */
export function endsState(app, opts = {}) {
  return Object.freeze({
    ...screenState(app),
    sim: app.sim?.state ?? null,
    firstClear: !!opts.firstClear,
    endBestBonus: app._endBestBonus ?? null,
  });
}

/** Forge-screen state. */
export function forgeState(app) {
  return Object.freeze({
    ...screenState(app),
    forgeSlot: app.forgeSlot,
    forgeReturn: app.forgeReturn || "main",
    prepLevelId: app.prepLevelId,
    status: app.status,
    maxSlots: MAX_ROSTER_SLOTS,
    nextUnlock: nextRosterSlotUnlock(app.meta),
  });
}

/** Tech-screen state. */
export function techState(app) {
  return Object.freeze({
    ...screenState(app),
    upgradeReturn: app.upgradeReturn,
    techTreeTab: app.techTreeTab,
    techSelectedId: app.techSelectedId,
    status: app.status,
  });
}

/** Game-chrome state (HUD). */
export function chromeState(app) {
  const run = app.sim?.state ?? null;
  const busy = !!(run && (run.waves.active || run.enemies.length));
  return Object.freeze({
    meta: app.meta,
    sim: run,
    roster: run?.roster || [],
    quotes: quotesFor(run),
    emptyQuote: EMPTY_QUOTE,
    tool: app.interaction.tool,
    slot: app.interaction.slot,
    forgeSlot: app.forgeSlot,
    status: app.status,
    ffHeld: !!app._ffHeld,
    speed: app.speed,
    paused: !!app.paused,
    liveCompose: !!app.interaction.liveCompose,
    ghost: app._ghost
      ? Object.freeze({
          log: app._ghost.log,
          i: app._ghost.i,
          total: app._ghost.log.length,
          speed: app._ghost.speed || 1,
        })
      : null,
    playtestFromEditor: !!app.playtestFromEditor,
    selectedTowerId: app.interaction.selectedTowerId ?? -1,
    selectedWallId: app.interaction.selectedWallId ?? -1,
    waveBusy: busy,
    pitchDeg: VIEW25.pitchDeg,
    overlayAnchor: overlayAnchorOf(app, run),
    cellSize: app.board?.cell || 40,
    uiWidth: app.ui?.clientWidth || 360,
    uiHeight: app.ui?.clientHeight || 640,
  });
}

/** Pause-sheet state. */
export function pauseState(app) {
  const run = app.sim?.state ?? null;
  return Object.freeze({
    sim: run,
    meta: app.meta,
    speed: app.speed,
    playtestFromEditor: !!app.playtestFromEditor,
    waveBusy: !!(run && (run.waves.active || run.enemies.length)),
  });
}
