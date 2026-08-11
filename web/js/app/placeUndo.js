/** Extracted from App — pure move, no gameplay changes. */

export function clearUndoStack(app) {
  app.undoStack = [];
  
}

export function pushUndo(app, entry) {
  app.undoStack.push(entry);
  if (app.undoStack.length > 24) app.undoStack.shift();
  
}

export function undoLast(app) {
  if (!app.sim || app.paused) return;
  const entry = app.undoStack.pop();
  if (!entry) {
    app.toast("Nothing to undo");
    return;
  }
  if (entry.type === "place_tower") {
    const t = app.sim.towers.find((x) => x.id === entry.id);
    if (!t) {
      app.toast("Undo expired");
      return;
    }
    // Full refund of paid Coin (undo ≠ sell).
    app.sim.economy.addBattle(t.paid | 0);
    app.sim.grid.setBlocked(t.cell.x, t.cell.y, false);
    app.sim.towers = app.sim.towers.filter((x) => x.id !== t.id);
    app.sim.grid.recompute();
    app.sim.combat.dirtyAuras();
    app.selectedTowerId = -1;
    app.board?.invalidateStatic?.();
    app.toast("Undid tower place");
    app.refreshHud();
    return;
  }
  if (entry.type === "place_wall") {
    const w = app.sim.walls.find((x) => x.id === entry.id);
    if (!w || w.preplaced) {
      app.toast("Undo expired");
      return;
    }
    app.sim.economy.addBattle(w.paid | 0);
    app.sim.grid.setBlocked(w.cell.x, w.cell.y, false);
    app.sim.walls = app.sim.walls.filter((x) => x.id !== w.id);
    app.sim.grid.recompute();
    app.selectedWallId = -1;
    app.board?.invalidateStatic?.();
    app.toast("Undid wall place");
    app.refreshHud();
    return;
  }
  if (entry.type === "sell_tower" && entry.tower) {
    const t = structuredClone(entry.tower);
    if (!app.sim.grid.isBuildable(t.cell.x, t.cell.y)) {
      app.toast("Can't undo — cell blocked");
      app.undoStack.push(entry);
      return;
    }
    if ((app.sim.economy.battle | 0) < (entry.refund | 0)) {
      app.toast("Need Coin to undo sell");
      app.undoStack.push(entry);
      return;
    }
    app.sim.economy.spendBattle(entry.refund | 0);
    app.sim.grid.setBlocked(t.cell.x, t.cell.y, true);
    app.sim.towers.push(t);
    app.sim.grid.recompute();
    app.sim.combat.dirtyAuras();
    app.board?.invalidateStatic?.();
    app.toast("Undid tower sell");
    app.refreshHud();
    return;
  }
  if (entry.type === "sell_wall" && entry.wall) {
    const w = structuredClone(entry.wall);
    if (!app.sim.grid.isBuildable(w.cell.x, w.cell.y)) {
      app.toast("Can't undo — cell blocked");
      app.undoStack.push(entry);
      return;
    }
    if ((app.sim.economy.battle | 0) < (entry.refund | 0)) {
      app.toast("Need Coin to undo sell");
      app.undoStack.push(entry);
      return;
    }
    app.sim.economy.spendBattle(entry.refund | 0);
    app.sim.grid.setBlocked(w.cell.x, w.cell.y, true);
    app.sim.walls.push(w);
    app.sim.grid.recompute();
    app.board?.invalidateStatic?.();
    app.toast("Undid wall sell");
    app.refreshHud();
  }
  
}

export function spendLevelPointSelected(app) {
  if (!app.sim || app.selectedTowerId < 0) {
    app.toast("Select a tower first");
    return;
  }
  const res = app.sim.trySpendLevelPoint(app.selectedTowerId);
  if (!res.ok) {
    const map = {
      no_points: "No level-up points",
      at_cap: "At level cap — raise Cap in Tech",
      missing: "Tower gone",
    };
    app.toast(map[res.reason] || "Can't level");
    return;
  }
  app.synth.play("confirm");
  app.toast(`Level ${res.level} · ${res.points} point${res.points === 1 ? "" : "s"} left`);
  app.syncTowerOverlay();
  
}

export function onCellTap(app, cell) {
  if (!app.sim) return;
  const tower = app.sim.towers.find((t) => t.cell.x === cell.x && t.cell.y === cell.y);
  if (tower) {
    app.clearPlaceConfirm();
    app.selectedTowerId = tower.id;
    app.selectedWallId = -1;
    app.renderGameChrome();
    return;
  }
  const wall = app.sim.walls.find(
    (w) => !w.preplaced && w.cell.x === cell.x && w.cell.y === cell.y
  );
  if (wall) {
    app.clearPlaceConfirm();
    app.selectedTowerId = -1;
    app.selectedWallId = wall.id;
    app.renderGameChrome();
    return;
  }
  app.selectedTowerId = -1;
  app.selectedWallId = -1;
  app.syncTowerOverlay();
  if (app.tool === "wall") {
    app.clearPlaceConfirm();
    app.handlePlace(app.sim.tryPlaceWall(cell.x, cell.y), "Wall");
    return;
  }
  // Second click on the same cell confirms; another cell re-aims the ghost.
  if (
    app.placeConfirm &&
    app.placeConfirm.x === cell.x &&
    app.placeConfirm.y === cell.y &&
    app.placeConfirm.slot === app.slot
  ) {
    app.confirmPlaceTower();
    return;
  }
  app.beginPlaceConfirm(cell.x, cell.y);
  
}

export function beginPlaceConfirm(app, x, y) {
  if (!app.sim) return;
  // Forge edits live in meta — keep the placing loadout current.
  if ((app.sim.roster?.length | 0) !== (app.meta.slotCount | 0)) {
    app._syncSimFromMeta(app.sim);
  } else {
    const metaSlot = app.meta.roster?.[app.slot];
    const simSlot = app.sim.roster?.[app.slot];
    if (
      metaSlot &&
      simSlot &&
      (metaSlot.base !== simSlot.base ||
        metaSlot.barrel !== simSlot.barrel ||
        metaSlot.payload !== simSlot.payload ||
        (metaSlot.levelCap | 0) !== (simSlot.levelCap | 0))
    ) {
      app._syncSimFromMeta(app.sim);
    }
  }
  const loadout = app.sim.roster[app.slot];
  if (!loadout?.complete) return app.toast("Compose a full triad in Forge first");
  if (!app.sim.grid.isBuildable(x, y)) return app.toast("Cell blocked");

  app.sim.grid.setBlocked(x, y, true);
  const pathOk = app.sim.grid.hasGroundPath();
  app.sim.grid.setBlocked(x, y, false);
  app.sim.grid.recompute();
  if (!pathOk) return app.toast("Can't seal the path");

  const quote = app.sim.economy.quoteTowerPlace(loadout.placeCost, app.sim.towers.length);
  if (app.sim.economy.battle < quote.total) return app.toast(`Need ${quote.total} Coin`);

  app.placeConfirm = {
    x,
    y,
    slot: app.slot,
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
  app.placeConfirm = null;
  if (app.board) app.board.pendingPlace = null;
  
}

export function cancelPlaceConfirm(app) {
  if (!app.placeConfirm) return;
  app.clearPlaceConfirm();
  app.status = "";
  const st = app.ui.querySelector("#status");
  if (st) st.textContent = "";
  
}

export function confirmPlaceTower(app) {
  const pc = app.placeConfirm;
  if (!pc || !app.sim) return;
  const res = app.sim.tryPlaceTower(pc.x, pc.y, pc.slot);
  app.clearPlaceConfirm();
  app.handlePlace(res, "Tower");
  
}

export function handlePlace(app, res, label) {
  if (res.ok) {
    app.synth.play("place");
    const extra =
      res.surcharge > 0 ? ` (+${res.surcharge} board tax)` : "";
    app.toast(`${label} placed${extra}`);
    // Prices / coins refresh via sim events → refreshHud
    return;
  }
  const map = {
    path_sealed: "Can't seal the path",
    need_battle: `Need ${res.need} Coin`,
    incomplete_triad: "Compose a full triad in Forge first",
    blocked: "Cell blocked",
  };
  app.toast(map[res.reason] || `${label} failed`);
  
}

export function sellSelected(app) {
  if (!app.sim) return;
  if (app.selectedTowerId >= 0) {
    const snap = app.sim.towers.find((x) => x.id === app.selectedTowerId);
    const res = app.sim.trySellTower(app.selectedTowerId);
    if (res.ok) {
      if (snap) app.pushUndo({ type: "sell_tower", tower: structuredClone(snap), refund: res.refund | 0 });
      app.selectedTowerId = -1;
      app.synth.play("sell");
      app.toast(`Sold (+${res.refund} Coin)`);
    }
    return;
  }
  if (app.selectedWallId >= 0) {
    const snap = app.sim.walls.find((w) => w.id === app.selectedWallId);
    const res = app.sim.trySellWall(app.selectedWallId);
    if (res.ok) {
      if (snap) app.pushUndo({ type: "sell_wall", wall: structuredClone(snap), refund: res.refund | 0 });
      app.selectedWallId = -1;
      app.synth.play("sell");
      app.toast(`Wall sold (+${res.refund} Coin)`);
    } else if (res.reason === "preplaced") {
      app.toast("Fixed walls can't be sold");
    }
    return;
  }
  app.toast("Tap a tower or wall first");
  
}
