/**
 * Menu / meta screen LOGIC — the render fns now live in ui/next/screens.js
 * (pure, registry-driven); this module keeps the post-mount wiring:
 * settings listeners, campaign thumb painting, and the forge summary line
 * (re-exported from the next renderers).
 */

import { VIEW25 } from "../view/view25.js";
import { saveMeta } from "../saveStore.js";
import { paintLevelThumb } from "./metaUi.js";
import { getCampaignLevel } from "../data/campaign.js";
export { forgePlanSummary } from "./next/screens.js";

export function wireSettings(app) {
  const save = () => saveMeta(app.meta);
  app.ui.querySelector("#cb")?.addEventListener("change", (e) => {
    app.meta.settings = app.meta.settings || {};
    app.meta.settings.colorblind = e.target.checked;
    app.palette.setColorblind(e.target.checked);
    save();
  });
  app.ui.querySelector("#particles")?.addEventListener("change", (e) => {
    app.meta.settings = app.meta.settings || {};
    app.meta.settings.particles = e.target.checked;
    save();
  });
  app.ui.querySelector("#music")?.addEventListener("change", (e) => {
    app.meta.settings = app.meta.settings || {};
    app.meta.settings.music = e.target.checked;
    app.score.setEnabled(e.target.checked);
    save();
  });
  app.ui.querySelector("#musicVol")?.addEventListener("input", (e) => {
    const v = (+e.target.value || 0) / 100;
    app.meta.settings = app.meta.settings || {};
    app.meta.settings.musicVolume = v;
    app.score.setMusicVolume(v);
    const lab = app.ui.querySelector("#musicVolLabel");
    if (lab) lab.textContent = `${e.target.value}%`;
    save();
  });
  app.ui.querySelector("#sfxVol")?.addEventListener("input", (e) => {
    const v = (+e.target.value || 0) / 100;
    app.meta.settings = app.meta.settings || {};
    app.meta.settings.sfxVolume = v;
    app.synth.setVolume(v);
    const lab = app.ui.querySelector("#sfxVolLabel");
    if (lab) lab.textContent = `${e.target.value}%`;
    save();
  });
  app.ui.querySelector("#pitch")?.addEventListener("input", (e) => {
    const v = +e.target.value;
    app.applyPitch(v);
    const lab = app.ui.querySelector("#pitchLabel");
    if (lab) lab.textContent = `${Math.round(v)}°`;
  });
  void VIEW25;
}

export function paintCampaignThumbs(app) {
  app.ui.querySelectorAll("canvas.level-thumb").forEach((c) => {
    const id = +c.getAttribute("data-level");
    const lv = getCampaignLevel(id);
    paintLevelThumb(c, lv, app.palette);
  });
}
