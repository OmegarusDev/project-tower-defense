/**
 * Deterministic ghost replay — replays logged place/sell/call actions from a seed.
 * Sim must be freshly setup with the same runSeed before calling runGhost.
 */

export function exportReplayBlob(sim) {
  if (!sim) return null;
  return {
    runSeed: sim.state.runSeed || sim.state.seed,
    cols: sim.state.grid.cols,
    rows: sim.state.grid.rows,
    modeEndless: !!sim.state.modeEndless,
    campaignLevelId: sim.state.campaignLevelId | 0,
    wavesToWin: sim.state.wavesToWin | 0,
    actionLog: structuredClone(sim.state.actionLog || []),
    roster: structuredClone(sim.state.roster || []),
  };
}

/**
 * Apply a logged action to a live sim. Returns false if action cannot apply.
 */
export function applyReplayAction(sim, act) {
  if (!sim || !act) return false;
  if (act.type === "place_tower") {
    const r = sim.tryPlaceTower(act.x, act.y, act.slot | 0);
    return !!r?.ok;
  }
  if (act.type === "place_wall") {
    const r = sim.tryPlaceWall(act.x, act.y);
    return !!r?.ok;
  }
  if (act.type === "sell_tower") {
    const r = sim.trySellTower(act.id);
    return !!r?.ok;
  }
  if (act.type === "sell_wall") {
    const r = sim.trySellWall(act.id);
    return !!r?.ok;
  }
  if (act.type === "call") {
    sim.startWave({ earlyBonus: act.earlyBonus | 0 });
    return true;
  }
  return false;
}
