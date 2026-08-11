/** data-act dispatch — extracted from App.bindUi (pure move). */

import { loadEditorLevels } from "./levelEditor.js";

export function handleUiAction(app, act, _ev) {
  if (act === "endless" || act === "hub") app.showEndlessHub();
  else if (act === "main") app.showMain();
  else if (act === "campaign") app.showCampaign();
  else if (act?.startsWith("prep:")) app.showPrep(+act.slice(5));
  else if (act?.startsWith("prep-slot:")) {
    app.prepSlot = +act.slice(10) | 0;
    if (app.screen === "prep" && app.prepLevelId) app.showPrep(app.prepLevelId);
  } else if (act?.startsWith("start-level:")) app.startCampaignLevel(+act.slice(12));
  else if (act?.startsWith("campaign-level:")) app.showPrep(+act.slice(15));
  else if (act === "editor") app.showEditor();
  else if (act === "ed-apply-size") {
    const c = +(app.ui.querySelector("#edCols")?.value || 8);
    const r = +(app.ui.querySelector("#edRows")?.value || 8);
    app.editor?.resize(c, r);
    app.showEditor();
  } else if (act === "ed-random") {
    app.editor?.randomize(10);
    app.showEditor();
  } else if (act === "ed-save") {
    app.editor.name = app.ui.querySelector("#edName")?.value || "Custom";
    app.editor.wavesToWin = +(app.ui.querySelector("#edWaves")?.value || 5);
    app.editor.waveScript = app.ui.querySelector("#edScript")?.value || "mixed_mid";
    app.editor.saveNamed();
    app.toast("Level saved locally");
    app.showEditor();
  } else if (act === "ed-playtest") {
    app.editor.name = app.ui.querySelector("#edName")?.value || "Custom";
    app.editor.wavesToWin = +(app.ui.querySelector("#edWaves")?.value || 5);
    app.editor.waveScript = app.ui.querySelector("#edScript")?.value || "mixed_mid";
    app.playtestEditorLevel(app.editor.toLevelDef());
  } else if (act?.startsWith("ed-load:")) {
    const list = loadEditorLevels();
    const lv = list[+act.slice(8)];
    if (lv) app.playtestEditorLevel(lv);
  } else if (act?.startsWith("ed-cell:")) {
    const [, xs, ys] = act.split(":");
    if (!app.editor.toggle(+xs, +ys)) app.toast("Would seal the path");
    app.showEditor();
  } else if (act === "compose-toggle") app.toggleLiveCompose();
  else if (act === "compose-close") {
    app.liveCompose = false;
    app.renderGameChrome();
  } else if (act?.startsWith("compose-part:")) {
    const [, kind, id] = act.split(":");
    app.applyLiveComposePart(kind, id);
  } else if (act === "ghost-replay") app.startGhostReplay();
  else if (act === "forge") app.showForge(app.forgeReturn || "main");
  else if (act === "forge-from-hub") app.showForge("hub");
  else if (act === "forge-from-main") app.showForge("main");
  else if (act === "forge-from-campaign") app.showForge("campaign");
  else if (act === "forge-from-prep") app.showForge("prep");
  else if (act === "upgrade-from-prep") app.showUpgrade("prep");
  else if (act === "upgrade") {
    const from =
      app.screen === "main"
        ? "main"
        : app.screen === "forge"
          ? "forge"
          : app.screen === "prep"
            ? "prep"
            : app.screen === "hub"
              ? "hub"
              : app.screen === "campaign"
                ? "campaign"
                : app.forgeReturn || "forge";
    app.showUpgrade(from);
  } else if (act === "tech-close") app.closeTechOverlay();
  else if (act?.startsWith("tech-tab:")) app.setTechTreeTab(act.slice(9));
  else if (act?.startsWith("tech-select:")) app.selectTechNode(act.slice(12));
  else if (act?.startsWith("tech-unlock-part:")) {
    const [, kind, id] = act.split(":");
    app.unlockPartFromTech(kind, id);
  } else if (act?.startsWith("tech-buy:")) app.buyTechNode(act.slice(9));
  else if (act?.startsWith("tech:")) app.buyTechNode(act.slice(5));
  else if (act === "settings") app.showSettings();
  else if (act === "newrun") app.newRun();
  else if (act === "continue") app.continueRun();
  else if (act === "pause") app.openPause();
  else if (act === "resume") app.resumeGame();
  else if (act === "quit-run") app.quitToMenu();
  else if (act === "sell") app.sellSelected();
  else if (act === "level-up") app.spendLevelPointSelected();
  else if (act === "undo") app.undoLast();
  else if (act === "tech-respec") app.respecTechTree();
  else if (act?.startsWith("speed:")) app.setSpeed(+act.slice(6));
  else if (act === "tool:wall") {
    app.tool = "wall";
    app.clearPlaceConfirm();
    app.selectedTowerId = -1;
    app.selectedWallId = -1;
    app.renderGameChrome();
  } else if (act === "forge-clear") app.clearForgeSlot();
  else if (act === "forge-unlock-slot") app.unlockForgeSlot();
  else if (act?.startsWith("forge-slot:")) {
    const i = +act.slice(11);
    if (i < 0 || i >= (app.meta.slotCount | 0)) {
      app.unlockForgeSlot();
      return;
    }
    app.forgeSlot = i;
    app.status = `Editing slot ${i + 1}`;
    app._refreshForgeUi();
  } else if (act?.startsWith("forge-part:")) {
    const [, kind, id] = act.split(":");
    app.applyForgePart(kind, id);
  } else if (act?.startsWith("buy:")) {
    const [, kind, id] = act.split(":");
    app.buyPart(kind, id);
  } else if (act?.startsWith("slot-locked:")) {
    const i = +act.slice(12) | 0;
    if (app.screen === "forge") {
      app.unlockForgeSlot(i);
      return;
    }
    const n = i + 1;
    app.toast(`Unlock Slot ${n} in Tech Tree → Roster`);
  } else if (act?.startsWith("slot:")) {
    const i = +act.slice(5);
    const unlocked = app.meta.slotCount | 0;
    if (!app.sim || i < 0 || i >= unlocked) {
      app.toast(`Unlock Slot ${i + 1} in Tech Tree → Roster`);
      return;
    }
    // Keep sim loadouts aligned with Forge before selecting/placing.
    if ((app.sim.roster?.length | 0) < unlocked) app._syncSimFromMeta(app.sim);
    app.slot = i;
    app.tool = "tower";
    app.clearPlaceConfirm();
    app.selectedTowerId = -1;
    app.selectedWallId = -1;
    app.renderGameChrome();
  }
}
