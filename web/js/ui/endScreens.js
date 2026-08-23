/** Extracted from App — pure move, no gameplay changes. */
import { endsState } from "./next/stateOf.js";
import { endBestBonus } from "../app/endsLogic.js";
import { renderHub, renderVictory, renderGameOver } from "./next/screens.js";
import { applyBtnTextures } from "./next/registry.js";

function _swapScreen(app, html) {
  const existing = app.ui.firstElementChild;
  if (existing && existing.classList.contains("meta-enter")) {
    existing.classList.remove("meta-enter");
    existing.classList.add("meta-exit");
    const onEnd = () => {
      existing.removeEventListener("animationend", onEnd);
      _apply(app, html);
    };
    existing.addEventListener("animationend", onEnd, { once: true });
    setTimeout(() => {
      if (app.ui.firstElementChild === existing) _apply(app, html);
    }, 250);
    return;
  }
  _apply(app, html);
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
