/**
 * Screen registry — the meta screens as pure render fns keyed by screen id.
 * mountScreen writes the rendered HTML into the container and returns the
 * screen id (the caller owns screen bookkeeping + bind hooks).
 */
import {
  renderMain,
  renderSettings,
  renderCampaign,
  renderPrep,
  renderHub,
  renderForge,
  renderTech,
  renderEditor,
} from "./screens.js";

export const SCREENS = {
  main: renderMain,
  settings: renderSettings,
  campaign: renderCampaign,
  prep: renderPrep,
  hub: renderHub,
  forge: renderForge,
  upgrade: renderTech,
  editor: renderEditor,
};

export function screenHtml(id, state) {
  const fn = SCREENS[id];
  if (!fn) return "";
  return fn(state);
}

export function mountScreen(container, id, state) {
  const html = screenHtml(id, state);
  container.innerHTML = html;
  return id;
}
