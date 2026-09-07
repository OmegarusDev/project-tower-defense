/** Extracted from App — pure move, no gameplay changes. */
import { undoStep, pushUndoEntry } from "./undoLogic.js";
import { quoteTowerPlace } from "../sim/systems/economy.js";
import { refreshHud, renderGameChrome } from "./gameChrome.js";
import { chromeState } from "../ui/stateOf.js";
import { syncTowerOverlay } from "../ui/chrome.js";
import { syncSimFromMeta } from "./metaSync.js";

export function clearUndoStack(app) {
  app.interaction.undoStack = [];
  
}

export function pushUndo(app, entry) {
  pushUndoEntry(app.interaction.undoStack, entry);
  
}

export function undoLast(app) {
  if (!app.sim || app.paused) return;
  const r = undoStep(app.sim.state, app.interaction.undoStack);
  if (!r.ok) {
    app.toast(r.msg || "Nothing to undo");
    return;
  }
  app.interaction.selectedTowerId = -1;
  app.interaction.selectedWallId = -1;
  app.board?.invalidateStatic?.();
  app.toast(r.msg);
  refreshHud(app);
  
}

export function chooseLevelBranchSelected(app, branch) {
  if (!app.sim || app.interaction.selectedTowerId < 0) {
    app.toast("Select a tower first");
    return;
  }
  const res = app.sim.tryChooseLevelBranch(app.interaction.selectedTowerId, branch);
  if (!res.ok) {
    const map = {
      no_picks: "No branch picks",
      bad_branch: "Pick Damage, ROF, or Range",
      missing: "Tower gone",
    };
    app.toast(map[res.reason] || "Can't branch");
    return;
  }
  const label = branch === "damage" ? "Damage" : branch === "rof" ? "ROF" : "Range";
  app.synth.play("confirm");
  const left = res.pendingPicks | 0;
  app.toast(
    `${label} +${res.ranks[branch]} · ${left} pick${left === 1 ? "" : "s"} left`
  );
  syncTowerOverlay(app.ui, chromeState(app));
  
}

export function onCellTap(app, cell) {
  if (!app.sim) return;
  // If tower in hand, place it
  if (app.interaction._handSlot != null) {
    const loadout = app.sim.state.roster?.[app.interaction._handSlot];
    if (loadout?.complete && app.sim.state.grid.isBuildable(cell.x, cell.y)) {
      // Check path
      app.sim.state.grid.setBlocked(cell.x, cell.y, true);
      const pathOk = app.sim.state.grid.hasGroundPath();
      app.sim.state.grid.setBlocked(cell.x, cell.y, false);
      app.sim.state.grid.recompute();
      if (!pathOk) return app.toast("Can't seal the path");
      // Check cost
      const quote = quoteTowerPlace(app.sim.state.economy, loadout, app.sim.state.towers);
      if (app.sim.state.economy.battle < quote.total) return app.toast(`Need ${quote.total} Coin`);
      // Place it
      const res = app.sim.tryPlaceTower(cell.x, cell.y, app.interaction._handSlot);
      if (res.ok) {
        app.synth.play("place");
        const extra = res.surcharge > 0 ? ` (+${res.surcharge} part tax)` : "";
        app.toast(`Tower placed${extra}`);
        // Keep the owning slot selected — read the index BEFORE clearHand()
        // nulls _handSlot (assigning null here used to make the next
        // beginPlaceConfirm read roster[null] and toast "Compose a full
        // triad" spuriously).
        const keepSlot = app.interaction._handSlot;
        app.clearHand();
        app.interaction.slot = keepSlot;
        renderGameChrome(app);
      }
      return;
    }
    return;
  }
  const tower = app.sim.state.towers.find((t) => t.cell.x === cell.x && t.cell.y === cell.y);
  if (tower) {
    clearPlaceConfirm(app);
    app.clearHand();
    app.interaction.selectedTowerId = tower.id;
    app.interaction.selectedWallId = -1;
    renderGameChrome(app);
    return;
  }
  const wall = app.sim.state.walls.find(
    (w) => !w.preplaced && w.cell.x === cell.x && w.cell.y === cell.y
  );
  if (wall) {
    clearPlaceConfirm(app);
    app.clearHand();
    app.interaction.selectedTowerId = -1;
    app.interaction.selectedWallId = wall.id;
    renderGameChrome(app);
    return;
  }
  app.interaction.selectedTowerId = -1;
  app.interaction.selectedWallId = -1;
  syncTowerOverlay(app.ui, chromeState(app));
  if (app.interaction.tool === "wall") {
    clearPlaceConfirm(app);
    handlePlace(app, app.sim.tryPlaceWall(cell.x, cell.y), "Wall");
    return;
  }
  // Second click on the same cell confirms; another cell re-aims the ghost.
  if (
    app.interaction.placeConfirm &&
    app.interaction.placeConfirm.x === cell.x &&
    app.interaction.placeConfirm.y === cell.y &&
    app.interaction.placeConfirm.slot === app.interaction.slot
  ) {
    confirmPlaceTower(app);
    return;
  }
  beginPlaceConfirm(app, cell.x, cell.y);
  
}

export function beginPlaceConfirm(app, x, y) {
  if (!app.sim) return;
  // Forge edits live in meta — keep the placing loadout current.
  if ((app.sim.state.roster?.length | 0) !== (app.meta.slotCount | 0)) {
    syncSimFromMeta(app, app.sim);
  } else {
    const metaSlot = app.meta.roster?.[app.interaction.slot];
    const simSlot = app.sim.state.roster?.[app.interaction.slot];
    if (
      metaSlot &&
      simSlot &&
      (metaSlot.base !== simSlot.base ||
        metaSlot.barrel !== simSlot.barrel ||
        metaSlot.payload !== simSlot.payload ||
        (metaSlot.levelCap | 0) !== (simSlot.levelCap | 0))
    ) {
      syncSimFromMeta(app, app.sim);
    }
  }
  const loadout = app.sim.state.roster[app.interaction.slot];
  if (!loadout?.complete) return app.toast("Compose a full triad in Forge first");
  if (!app.sim.state.grid.isBuildable(x, y)) return app.toast("Cell blocked");

  app.sim.state.grid.setBlocked(x, y, true);
  const pathOk = app.sim.state.grid.hasGroundPath();
  app.sim.state.grid.setBlocked(x, y, false);
  app.sim.state.grid.recompute();
  if (!pathOk) return app.toast("Can't seal the path");

  const quote = quoteTowerPlace(app.sim.state.economy, loadout, app.sim.state.towers);
  if (app.sim.state.economy.battle < quote.total) return app.toast(`Need ${quote.total} Coin`);

  app.interaction.placeConfirm = {
    x,
    y,
    slot: app.interaction.slot,
    cost: quote.total,
    surcharge: quote.surcharge,
  };
  app.board.pendingPlace = {
    x,
    y,
    base: loadout.base,
    barrel: loadout.barrel,
    payload: loadout.payload,
  };
  const tax = quote.surcharge > 0 ? ` (+${quote.surcharge} tax)` : "";
  app.toast(`Tap again to place · ${quote.total} Coin${tax}`);
  
}

export function clearPlaceConfirm(app) {
  app.interaction.placeConfirm = null;
  if (app.board) app.board.pendingPlace = null;
  
}

export function cancelPlaceConfirm(app) {
  if (!app.interaction.placeConfirm) return;
  clearPlaceConfirm(app);
  app.status = "";
  const st = app.ui.querySelector("#status");
  if (st) st.textContent = "";
  
}

export function confirmPlaceTower(app) {
  const pc = app.interaction.placeConfirm;
  if (!pc || !app.sim) return;
  const res = app.sim.tryPlaceTower(pc.x, pc.y, pc.slot);
  clearPlaceConfirm(app);
  handlePlace(app, res, "Tower");
  
}

export function handlePlace(app, res, label) {
  if (res.ok) {
    app.synth.play("place");
    const extra =
      res.surcharge > 0 ? ` (+${res.surcharge} part tax)` : "";
    app.toast(`${label} placed${extra}`);
    // Prices / coins refresh via sim events → refreshHud
    return;
  }
  const map = {
    path_sealed: "Can't seal the path",
    seals_enemy: "Can't wall enemies in",
    need_battle: `Need ${res.need} Coin`,
    incomplete_triad: "Compose a full triad in Forge first",
    blocked: "Cell blocked",
  };
  app.toast(map[res.reason] || `${label} failed`);
  
}

export function sellSelected(app) {
  if (!app.sim) return;
  if (app.interaction.selectedTowerId >= 0) {
    const snap = app.sim.state.towers.find((x) => x.id === app.interaction.selectedTowerId);
    const res = app.sim.trySellTower(app.interaction.selectedTowerId);
    if (res.ok) {
      if (snap) pushUndo(app, { type: "sell_tower", tower: structuredClone(snap), refund: res.refund | 0 });
      app.interaction.selectedTowerId = -1;
      app.synth.play("sell");
      app.toast(`Sold (+${res.refund} Coin)`);
    }
    return;
  }
  if (app.interaction.selectedWallId >= 0) {
    const snap = app.sim.state.walls.find((w) => w.id === app.interaction.selectedWallId);
    const res = app.sim.trySellWall(app.interaction.selectedWallId);
    if (res.ok) {
      if (snap) pushUndo(app, { type: "sell_wall", wall: structuredClone(snap), refund: res.refund | 0 });
      app.interaction.selectedWallId = -1;
      app.synth.play("sell");
      app.toast(`Wall sold (+${res.refund} Coin)`);
    } else if (res.reason === "preplaced") {
      app.toast("Fixed walls can't be sold");
    }
    return;
  }
  app.toast("Tap a tower or wall first");
  
}
