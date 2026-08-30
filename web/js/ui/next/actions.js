/**
 * Action registry — the data-act dispatch as a flat table. Order matters:
 * exact matches (`is`) are checked before prefixed families (`has`), so e.g.
 * `prep-slot:` must precede any `prep` family it would otherwise shadow.
 * Params ride the act string as colon-separated args; handlers parse via
 * tail()/args() — no hardcoded offsets. The parity gate (actionsParity.mjs)
 * replays the full act vocabulary through a spy app and pins call traces.
 */
import { loadEditorLevels } from "../levelEditor.js";
import { MAX_ROSTER_SLOTS } from "../../data/parts.js";
import { META_KEY, ENDLESS_KEY } from "../../saveStore.js";
import { confirmSheet, holdConfirmSheet } from "./modal.js";
import * as ends from "../endScreens.js";
import * as forge from "../forgeScreen.js";
import * as tech from "../techScreen.js";

/** Remainder of an act after its prefix: tail("slot:3", "slot:") → "3". */
function tail(act, prefix) {
  return act.slice(prefix.length);
}

/** Colon-separated args after a prefix: args("buy:barrel:rail", "buy:") → ["barrel","rail"]. */
function args(act, prefix) {
  return tail(act, prefix).split(":");
}

const R = [
  // ---- splash ----
  {
    is: "splash-start",
    run: (app) => {
      app.showMain();
      app.unlockAudio();
    },
  },

  // ---- screen nav (exact) — P4a: call screens directly, not via app delegates (one less hop)
  { is: "endless", run: (app) => ends.showEndlessHub(app) },
  { is: "hub", run: (app) => ends.showEndlessHub(app) },
  { is: "main", run: (app) => app.showMain() },
  { is: "campaign", run: (app) => app.showCampaign() },
  { is: "settings", run: (app) => app.showSettings() },
  { is: "editor", run: (app) => app.showEditor() },

  // ---- prep ----
  { has: "prep:", run: (app, act) => app.showPrep(+tail(act, "prep:")) },
  {
    has: "prep-slot:",
    run: (app, act) => {
      app.prepSlot = +tail(act, "prep-slot:") | 0;
      if (app.screen === "prep" && app.prepLevelId) app.showPrep(app.prepLevelId);
    },
  },
  { is: "prep-slot-prev", run: (app) => shiftPrepSlot(app, -1) },
  { is: "prep-slot-next", run: (app) => shiftPrepSlot(app, 1) },
  { has: "start-level:", run: (app, act) => app.startCampaignLevel(+tail(act, "start-level:")) },

  // ---- meta reset ----
  {
    is: "reset-meta",
    run: (app) => {
      holdConfirmSheet(app.ui, {
        mark: "Forgeworks",
        title: "Reset Save?",
        note: "All progress, parts and ranks will be erased. Hold the button to confirm.",
        confirmLabel: "Hold to Reset",
        holdMs: 2000,
      }).then((yes) => {
        if (!yes) return;
        try {
          localStorage.removeItem(META_KEY);
          localStorage.removeItem(ENDLESS_KEY);
        } catch (_) {}
        location.reload();
      });
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
      app.editor.coinGrant = +(app.ui.querySelector("#edCoin")?.value || 50);
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
      app.editor.coinGrant = +(app.ui.querySelector("#edCoin")?.value || 50);
      app.editor.waveScript = app.ui.querySelector("#edScript")?.value || "mixed_mid";
      app.playtestEditorLevel(app.editor.toLevelDef());
    },
  },
  {
    has: "ed-delete:",
    run: (app, act) => {
      const i = +tail(act, "ed-delete:") | 0;
      app.editor?.deleteLevel(i);
      app.toast("Saved level removed");
      app.showEditor();
    },
  },
  {
    has: "ed-load:",
    run: (app, act) => {
      const list = loadEditorLevels();
      const lv = list[+tail(act, "ed-load:")];
      if (lv) app.playtestEditorLevel(lv);
    },
  },
  {
    has: "ed-cell:",
    run: (app, act) => {
      const [xs, ys] = args(act, "ed-cell:");
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
      const [kind, id] = args(act, "compose-part:");
      app.applyLiveComposePart(kind, id);
    },
  },

  // ---- run/end ----
  { is: "ghost-replay", run: (app) => app.startGhostReplay() },
  {
    has: "ghost-speed:",
    run: (app, act) => app.ghostSetSpeed(+tail(act, "ghost-speed:")),
  },
  { is: "ghost-skip", run: (app) => app.ghostSkip() },
  { is: "newrun", run: (app) => app.newRun() },
  { is: "continue", run: (app) => app.continueRun() },

  // ---- forge nav ----
  { is: "forge", run: (app) => forge.showForge(app, app.forgeReturn || "main") },
  { is: "forge-from-hub", run: (app) => forge.showForge(app, "hub") },
  { is: "forge-from-main", run: (app) => forge.showForge(app, "main") },
  { is: "forge-from-campaign", run: (app) => forge.showForge(app, "campaign") },
  { is: "forge-from-prep", run: (app) => forge.showForge(app, "prep") },
  { is: "upgrade-from-prep", run: (app) => tech.showUpgrade(app, "prep") },
  { is: "upgrade-from-hub", run: (app) => tech.showUpgrade(app, "hub") },
  { is: "upgrade-from-campaign", run: (app) => tech.showUpgrade(app, "campaign") },
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
      tech.showUpgrade(app, from);
    },
  },

  // ---- tech ----
  { is: "tech-close", run: (app) => tech.closeTechOverlay(app) },
  { has: "tech-tab:", run: (app, act) => tech.setTechTreeTab(app, tail(act, "tech-tab:")) },
  { has: "tech-select:", run: (app, act) => tech.selectTechNode(app, tail(act, "tech-select:")) },
  {
    has: "tech-unlock-part:",
    run: (app, act) => {
      const [kind, id] = args(act, "tech-unlock-part:");
      tech.unlockPartFromTech(app, kind, id);
    },
  },
  { has: "tech-buy:", run: (app, act) => tech.buyTechNode(app, tail(act, "tech-buy:")) },

  // ---- game controls ----
  { is: "pause", run: (app) => app.openPause() },
  { is: "resume", run: (app) => app.resumeGame() },
  { is: "quit-run", run: (app) => app.quitToMenu() },
  { is: "sell", run: (app) => app.sellSelected() },
  { has: "level-branch:", run: (app, act) => app.chooseLevelBranchSelected(tail(act, "level-branch:")) },
  { is: "undo", run: (app) => app.undoLast() },
  { has: "speed:", run: (app, act) => app.setSpeed(+tail(act, "speed:")) },
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
  { is: "forge-clear", run: (app) => forge.clearForgeSlot(app) },
  { is: "dev-toggle", run: (app) => forge.toggleDevMode(app) },
  { is: "forge-unlock-slot", run: (app) => forge.unlockForgeSlot(app) },
  {
    has: "forge-slot:",
    run: (app, act) => {
      const i = +tail(act, "forge-slot:");
      app.forgeSlot = i;
      app.status = `Editing slot ${i + 1}`;
      forge.refreshForgeUi(app);
    },
  },
  { is: "forge-slot-prev", run: (app) => shiftForgeSlot(app, -1) },
  { is: "forge-slot-next", run: (app) => shiftForgeSlot(app, 1) },
  {
    has: "forge-part:",
    run: (app, act) => {
      const [kind, id] = args(act, "forge-part:");
      forge.applyForgePart(app, kind, id);
    },
  },
  {
    has: "buy:",
    run: (app, act) => {
      const [kind, id] = args(act, "buy:");
      forge.buyPart(app, kind, id);
    },
  },
  {
    has: "slot-locked:",
    run: (app, act) => {
      const i = +tail(act, "slot-locked:") | 0;
      if (app.screen === "forge") {
        forge.unlockForgeSlot(app, i);
        return;
      }
      const n = i + 1;
      app.toast(`Unlock Slot ${n} in Tech Tree → Roster`);
    },
  },
  {
    has: "slot:",
    run: (app, act) => {
      const i = +tail(act, "slot:");
      const unlocked = app.meta.slotCount | 0;
      if (!app.sim || i < 0 || i >= unlocked) {
        app.toast(`Unlock Slot ${i + 1} in Tech Tree → Roster`);
        return;
      }
      // Keep sim loadouts aligned with Forge before selecting/placing.
      if ((app.sim.roster?.length | 0) < unlocked) app._syncSimFromMeta(app.sim);
      app.slot = i;
      app._handSlot = i; // Put this tower in hand
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

/** Cycle the prep loadout slot (loops within unlocked slots). */
function shiftPrepSlot(app, delta) {
  const n = Math.max(1, app.meta.slotCount | 0 || 3);
  app.prepSlot = ((app.prepSlot | 0) + delta + n) % n;
  if (app.screen === "prep" && app.prepLevelId) app.showPrep(app.prepLevelId);
}

/** Cycle the forge slot — the last position is the unlock panel (loops). */
function shiftForgeSlot(app, delta) {
  const slotCount = app.meta.slotCount | 0;
  const total = slotCount + (slotCount < MAX_ROSTER_SLOTS ? 1 : 0);
  app.forgeSlot = ((app.forgeSlot | 0) + delta + total) % total;
  app.status =
    app.forgeSlot === slotCount
      ? `Slot ${slotCount + 1} — locked`
      : `Editing slot ${app.forgeSlot + 1}`;
  forge.refreshForgeUi(app);
  // Scroll carousel to active card
  requestAnimationFrame(() => {
    const wrap = app.ui.querySelector(".forge-preview-wrap");
    const activeCard = wrap?.querySelector(".forge-slot-card.active");
    if (wrap && activeCard) {
      activeCard.scrollIntoView({ behavior: "smooth", inline: "center" });
    }
  });
}
