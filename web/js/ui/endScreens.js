/** Extracted from App — pure move, no gameplay changes. */
import { endsState } from "./next/stateOf.js";
import { endBestBonus } from "../app/endsLogic.js";
import { renderHub, renderVictory, renderGameOver } from "./next/screens.js";
import { applyBtnTextures, swapWithExitAnim } from "./next/registry.js";

function _swapScreen(app, html) {
  swapWithExitAnim(app.ui, () => _apply(app, html));
}

function _apply(app, html) {
  app.ui.innerHTML = html;
  applyBtnTextures(app.ui);
  app.bindUi();
}

export function showEndlessHub(app) {
  app.screen = "hub";
  app.score?.toMenu();
  _swapScreen(app, renderHub(endsState(app)));
}

export function showVictory(app, opts = {}) {
  app.screen = "victory";
  _swapScreen(app, renderVictory(endsState(app, opts)));
}

export function showGameOver(app) {
  app.screen = "gameover";
  _swapScreen(app, renderGameOver(endsState(app)));
}

export function applyEndlessBestBonus(app, prevBest) {
  return endBestBonus(app.sim, prevBest);
}
