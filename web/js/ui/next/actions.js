/**
 * Action registry — the data-act dispatch as a table, transcribed branch
 * for branch from bindActions.handleUiAction. Order matters (exact matches
 * first, mirrors the oracle's if/else chain). The parity gate
 * (actionsParity.mjs) replays the full act vocabulary through a spy app on
 * both sides and requires identical call traces.
 */
import { loadEditorLevels } from "../levelEditor.js";

const R = [
  // ---- screen nav (exact) ----
  { is: "endless", run: (app) => app.showEndlessHub() },
  { is: "hub", run: (app) => app.showEndlessHub() },
  { is: "main", run: (app) => app.showMain() },
  { is: "campaign", run: (app) => app.showCampaign() },
  { is: "settings", run: (app) => app.showSettings() },
  { is: "editor", run: (app) => app.showEditor() },

  // ---- prep ----
  { has: "prep:", run: (app, act) => app.showPrep(+act.slice(5)) },
  {
    has: "prep-slot:",
    run: (app, act) => {
      app.prepSlot = +act.slice(10) | 0;
      if (app.screen === "prep" && app.prepLevelId) app.showPrep(app.prepLevelId);
    },
  },
  { has: "start-level:", run: (app, act) => app.startCampaignLevel(+act.slice(12)) },

  // ---- meta reset ----
  {
    is: "reset-meta",
    run: (app) => {
      if (confirm("Reset all progress? This wipes your save and cannot be undone.")) {
        try {
          localStorage.removeItem("ptd_meta_v1");
          localStorage.removeItem("ptd_endless_v1");
        } catch (_) {}
        location.reload();
      }
    },
  },

  // ---- editor ----
  {
    is: "ed-apply-size",
    run: (app) => {
      const c = +(app.ui.querySelector("#edCols")?.value || 8);
      const r = +(app.ui.querySelector("#edRows")?.value || 8);
      app.editor?.resize(c, r);
      app.showEditor();
    },
  },
  {
    is: "ed-random",
    run: (app) => {
      app.editor?.randomize(10);
      app.showEditor();
    },
  },
  {
    is: "ed-save",
    run: (app) => {
      app.editor.name = app.ui.querySelector("#edName")?.value || "Custom";
      app.editor.wavesToWin = +(app.ui.querySelector("#edWaves")?.value || 5);
      app.editor.waveScript = app.ui.querySelector("#edScript")?.value || "mixed_mid";
      app.editor.saveNamed();
      app.toast("Level saved locally");
      app.showEditor();
    },
  },
  {
    is: "ed-playtest",
    run: (app) => {
      app.editor.name = app.ui.querySelector("#edName")?.value || "Custom";
      app.editor.wavesToWin = +(app.ui.querySelector("#edWaves")?.value || 5);
      app.editor.waveScript = app.ui.querySelector("#edScript")?.value || "mixed_mid";
      app.playtestEditorLevel(app.editor.toLevelDef());
    },
  },
  {
    has: "ed-load:",
    run: (app, act) => {
      const list = loadEditorLevels();
      const lv = list[+act.slice(8)];
      if (lv) app.playtestEditorLevel(lv);
    },
  },
  {
    has: "ed-cell:",
    run: (app, act) => {
      const [, xs, ys] = act.split(":");
      if (!app.editor.toggle(+xs, +ys)) app.toast("Would seal the path");
      app.showEditor();
    },
  },

  // ---- live compose ----
  { is: "compose-toggle", run: (app) => app.toggleLiveCompose() },
  {
    is: "compose-close",
    run: (app) => {
      app.liveCompose = false;
      app.renderGameChrome();
    },
  },
  {
    has: "compose-part:",
    run: (app, act) => {
      const [, kind, id] = act.split(":");
      app.applyLiveComposePart(kind, id);
    },
  },

  // ---- run/end ----
  { is: "ghost-replay", run: (app) => app.startGhostReplay() },
  { is: "newrun", run: (app) => app.newRun() },
  { is: "continue", run: (app) => app.continueRun() },

  // ---- forge nav ----
  { is: "forge", run: (app) => app.showForge(app.forgeReturn || "main") },
  { is: "forge-from-hub", run: (app) => app.showForge("hub") },
  { is: "forge-from-main", run: (app) => app.showForge("main") },
  { is: "forge-from-campaign", run: (app) => app.showForge("campaign") },
  { is: "forge-from-prep", run: (app) => app.showForge("prep") },
  { is: "upgrade-from-prep", run: (app) => app.showUpgrade("prep") },
  {
    is: "upgrade",
    run: (app) => {
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
    },
  },

  // ---- tech ----
  { is: "tech-close", run: (app) => app.closeTechOverlay() },
  { has: "tech-tab:", run: (app, act) => app.setTechTreeTab(act.slice(9)) },
  { has: "tech-select:", run: (app, act) => app.selectTechNode(act.slice(12)) },
  {
    has: "tech-unlock-part:",
    run: (app, act) => {
      const [, kind, id] = act.split(":");
      app.unlockPartFromTech(kind, id);
    },
  },
  { has: "tech-buy:", run: (app, act) => app.buyTechNode(act.slice(9)) },

  // ---- game controls ----
  { is: "pause", run: (app) => app.openPause() },
  { is: "resume", run: (app) => app.resumeGame() },
  { is: "quit-run", run: (app) => app.quitToMenu() },
  { is: "sell", run: (app) => app.sellSelected() },
  { has: "level-branch:", run: (app, act) => app.chooseLevelBranchSelected(act.slice("level-branch:".length)) },
  { is: "undo", run: (app) => app.undoLast() },
  { has: "speed:", run: (app, act) => app.setSpeed(+act.slice(6)) },
  {
    is: "tool:wall",
    run: (app) => {
      app.tool = "wall";
      app.clearPlaceConfirm();
      app.selectedTowerId = -1;
      app.selectedWallId = -1;
      app.renderGameChrome();
    },
  },

  // ---- forge ops ----
  { is: "forge-clear", run: (app) => app.clearForgeSlot() },
  { is: "forge-unlock-slot", run: (app) => app.unlockForgeSlot() },
  {
    has: "forge-slot:",
    run: (app, act) => {
      const i = +act.slice(11);
      if (i < 0 || i >= (app.meta.slotCount | 0)) {
        app.unlockForgeSlot();
        return;
      }
      app.forgeSlot = i;
      app.status = `Editing slot ${i + 1}`;
      app._refreshForgeUi();
    },
  },
  {
    has: "forge-part:",
    run: (app, act) => {
      const [, kind, id] = act.split(":");
      app.applyForgePart(kind, id);
    },
  },
  {
    has: "buy:",
    run: (app, act) => {
      const [, kind, id] = act.split(":");
      app.buyPart(kind, id);
    },
  },
  {
    has: "slot-locked:",
    run: (app, act) => {
      const i = +act.slice(12) | 0;
      if (app.screen === "forge") {
        app.unlockForgeSlot(i);
        return;
      }
      const n = i + 1;
      app.toast(`Unlock Slot ${n} in Tech Tree → Roster`);
    },
  },
  {
    has: "slot:",
    run: (app, act) => {
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
    },
  },
];

export function runAction(app, act) {
  for (const e of R) {
    if (e.is !== undefined ? act === e.is : act.startsWith(e.has)) {
      e.run(app, act);
      return true;
    }
  }
  return false;
}

/** Ordered list of registry entries (for parity corpus introspection). */
export function registrySize() {
  return R.length;
}
