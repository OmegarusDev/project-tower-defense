/** Extracted from App — pure move, no gameplay changes. */
import { hasEndless, loadEndless } from "../saveStore.js";
import { endsState } from "./next/stateOf.js";
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
  if (!app.sim?.modeEndless) return null;
  const wave = app.sim.waveIndex | 0;
  if (wave <= (prevBest | 0)) return null;
  const g = app.sim.economy.runWaveGains;
  const bonusParts = g.parts | 0;
  const bonusAether = g.aether | 0;
  if (!bonusParts && !bonusAether) return { parts: 0, aether: 0, wave };
  app.sim.economy.forge += bonusParts;
  app.sim.economy.aether += bonusAether;
  g.parts = bonusParts * 2;
  g.aether = bonusAether * 2;
  return { parts: bonusParts, aether: bonusAether, wave };
  
}
