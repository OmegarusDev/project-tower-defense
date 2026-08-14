/**
 * State adapters — the next renderers take a plain state; these adapters
 * extract it from the app runtime (the swap's bridge). The renderers never
 * see `app`.
 */
import { VIEW25 } from "../../view/view25.js";
import { MAX_ROSTER_SLOTS } from "../../data/parts.js";
import { nextRosterSlotUnlock } from "../../data/techTree.js";
import { waveBusy, gameSlotQuote } from "../../app/gameChrome.js";
import { hasEndless, loadEndless } from "../../saveStore.js";

/** Meta-screen state (registry mount). */
export function screenState(app) {
  return {
    meta: app.meta,
    status: app.status,
    sim: app.sim,
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
  };
}

/** End-screen state (victory / game over). */
export function endsState(app, opts = {}) {
  return {
    ...screenState(app),
    sim: app.sim,
    firstClear: !!opts.firstClear,
    endBestBonus: app._endBestBonus ?? null,
  };
}

/** Forge-screen state. */
export function forgeState(app) {
  return {
    ...screenState(app),
    forgeSlot: app.forgeSlot,
    forgeReturn: app.forgeReturn || "main",
    prepLevelId: app.prepLevelId,
    status: app.status,
    maxSlots: MAX_ROSTER_SLOTS,
    nextUnlock: nextRosterSlotUnlock(app.meta),
  };
}

/** Tech-screen state. */
export function techState(app) {
  return {
    ...screenState(app),
    upgradeReturn: app.upgradeReturn,
    techTreeTab: app.techTreeTab,
    techSelectedId: app.techSelectedId,
    status: app.status,
  };
}

/** Game-chrome state (HUD). */
export function chromeState(app) {
  const sim = app.sim;
  return {
    meta: app.meta,
    sim,
    roster: sim?.roster || [],
    quote: (i) => gameSlotQuote(app, i),
    tool: app.tool,
    slot: app.slot,
    forgeSlot: app.forgeSlot,
    status: app.status,
    ffHeld: !!app._ffHeld,
    speed: app.speed,
    paused: !!app.paused,
    liveCompose: !!app.liveCompose,
    ghost: app._ghost
      ? {
          log: app._ghost.log,
          i: app._ghost.i,
          total: app._ghost.log.length,
          speed: app._ghost.speed || 1,
        }
      : null,
    playtestFromEditor: !!app.playtestFromEditor,
    selectedTowerId: app.selectedTowerId ?? -1,
    selectedWallId: app.selectedWallId ?? -1,
    waveBusy: () => waveBusy(app),
    pitchDeg: VIEW25.pitchDeg,
    board: app.board
      ? {
          cell: app.board.cell,
          cellScreenCenter: (x, y) => app.board.cellScreenCenter(x, y),
        }
      : { cell: 40, cellScreenCenter: () => ({ x: 0, y: 0 }) },
    uiWidth: app.ui?.clientWidth || 360,
    uiHeight: app.ui?.clientHeight || 640,
  };
}

/** Pause-sheet state. */
export function pauseState(app) {
  return {
    sim: app.sim,
    speed: app.speed,
    playtestFromEditor: !!app.playtestFromEditor,
    waveBusy: () => waveBusy(app),
  };
}
