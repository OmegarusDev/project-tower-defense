/**
 * Screen renderers barrel — keep `./screens.js` stable for registry, chrome, probes.
 */
export {
  VERSION,
  VERSION_NAME,
  esc,
  forgePlanSummary,
  forgePlanSummaryCompact,
  rosterSlotButtonsHtml,
  forgePartGridHtml,
  techTreeHtml,
  forgeStatBars,
  forgePreviewCard,
  forgeUnlockCard,
} from "./screens/helpers.js";
export {
  renderSplash,
  renderMain,
  renderSettings,
  renderCampaign,
  renderPrep,
  renderHub,
} from "./screens/meta.js";
export { renderForge, renderTech, renderEditor } from "./screens/workshop.js";
export { renderVictory, renderGameOver } from "./screens/end.js";
