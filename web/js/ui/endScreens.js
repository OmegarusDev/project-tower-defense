/** Extracted from App — pure move, no gameplay changes. */
import { endsState } from "./next/stateOf.js";
import { endBestBonus } from "../app/endsLogic.js";
import { renderHub, renderVictory, renderGameOver } from "./next/screens.js";

export function showEndlessHub(app) {
  app.screen = "hub";
  // Corrupt/partial checkpoints parse to null — treat as no checkpoint rather
  // than crashing the hub on blob.wave below.
  app.ui.innerHTML = renderHub(endsState(app));
  app.bindUi();
  
}

export function showVictory(app, opts = {}) {
  app.screen = "victory";
  app.ui.innerHTML = renderVictory(endsState(app, opts));
  app.bindUi();
}

export function showGameOver(app) {
  app.screen = "gameover";
  app.ui.innerHTML = renderGameOver(endsState(app));
  app.bindUi();
}

export function applyEndlessBestBonus(app, prevBest) {
  return endBestBonus(app.sim, prevBest);
}
