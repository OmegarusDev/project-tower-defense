/** Extracted from App — pure move, no gameplay changes. */
import * as tech from "../ui/techScreen.js";
import { cancelPlaceConfirm, clearPlaceConfirm, sellSelected, chooseLevelBranchSelected, undoLast } from "./placeUndo.js";
import { resumeGame, openPause, renderPauseSheet } from "./pauseSettings.js";
import { refreshHud, toggleLiveCompose, renderGameChrome } from "./gameChrome.js";
import { waveBusy } from "./waveBusy.js";
import { callEarly } from "./simBridge.js";
import { beginFastForward, endFastForward } from "./fastForward.js";
import { syncSimFromMeta } from "./metaSync.js";

/** Arrow-key navigation over the visible [data-act] controls (menus + pause sheet). */
function arrowNav(app, e) {
  if (!e.key.startsWith("Arrow")) return false;
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  if (app.screen === "game" && !app.paused) return false;
  const btns = [...app.ui.querySelectorAll("[data-act]")].filter((b) => {
    if (b.disabled) return false;
    if (b.classList.contains("pause-backdrop")) return false;
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (btns.length < 2) return false;
  e.preventDefault();
  let idx = btns.indexOf(document.activeElement);
  const down = e.key === "ArrowDown" || e.key === "ArrowRight";
  if (idx < 0) idx = down ? -1 : btns.length;
  idx = (idx + (down ? 1 : -1) + btns.length) % btns.length;
  btns[idx].focus();
  return true;
}

export function onKeyDown(app, e) {
  if (arrowNav(app, e)) return;
  if (e.code === "Escape" || e.key === "Escape") {
    // Meta screens: Esc closes the tech overlay (modals handle their own Esc).
    if (app.screen === "upgrade" && app.techSelectedId) {
      e.preventDefault();
      tech.closeTechOverlay(app);
      return;
    }
    // Meta screens: Esc = same as the X/back button.
    if (app.screen !== "game" && app.screen !== "splash" && app.screen !== "main") {
      e.preventDefault();
      app.backScreen();
      return;
    }
  }
  if (app.screen !== "game" || !app.sim) return;
  if (e.code === "Escape" || e.key === "Escape") {
    e.preventDefault();
    if (app.interaction.placeConfirm) {
      cancelPlaceConfirm(app);
      return;
    }
    if (app.paused) resumeGame(app);
    else openPause(app);
    return;
  }
  if (app.paused) {
    // Speed keys work from pause sheet context too.
    if (e.key === "1" || e.key === "2" || e.key === "3") {
      if (!e.altKey && !e.metaKey && !e.ctrlKey) {
        // Digit keys also pick slots when unpaused; while paused set speed.
        e.preventDefault();
        setSpeed(app, +e.key);
      }
    }
    return;
  }

  const key = e.key;
  const code = e.code;

  if (code === "Space" || key === " ") {
    e.preventDefault();
    if (e.repeat) return;
    if (app.screen === "game" && waveBusy(app)) {
      beginFastForward(app);
      app._spaceFf = true;
    } else {
      app.unlockAudio().then(() => callEarly(app));
    }
    return;
  }

  // Slot hotkeys: 1–9 → slots 0–8, 0 → slot 9, -/= → 10–11
  if (!e.metaKey && !e.ctrlKey && !e.altKey) {
    let slotIdx = -1;
    if (key >= "1" && key <= "9") slotIdx = +key - 1;
    else if (key === "0") slotIdx = 9;
    else if (key === "-" || code === "Minus") slotIdx = 10;
    else if (key === "=" || code === "Equal") slotIdx = 11;
    if (slotIdx >= 0) {
      e.preventDefault();
      selectBuildSlot(app, slotIdx);
      return;
    }
    if (key === "w" || key === "W") {
      e.preventDefault();
      app.interaction.tool = "wall";
      clearPlaceConfirm(app);
      app.clearHand(); // Clear hand when switching to wall tool
      refreshHud(app);
      return;
    }
    if (key === "b" || key === "B") {
      e.preventDefault();
      toggleLiveCompose(app);
      return;
    }
    if (key === "x" || key === "X") {
      e.preventDefault();
      sellSelected(app);
      return;
    }
    if (key === "u" || key === "U") {
      e.preventDefault();
      // Default branch pick = Damage when a tower has pending picks.
      chooseLevelBranchSelected(app, "damage");
      return;
    }
    if (key === "z" || key === "Z") {
      e.preventDefault();
      undoLast(app);
      return;
    }
  }
  
}

export function setSpeed(app, n) {
  const s = Math.max(1, Math.min(3, n | 0 || 1));
  endFastForward(app);
  app.speed = s;
  app.score.setSpeed(s);
  refreshHud(app);
  if (app.paused) renderPauseSheet(app);
  
}

export function selectBuildSlot(app, i) {
  const unlocked = app.meta.slotCount | 0;
  if (!app.sim || i < 0 || i >= unlocked) {
    app.toast(`Unlock Slot ${i + 1} in Tech Tree → Roster`);
    return;
  }
  if ((app.sim.state.roster?.length | 0) < unlocked) syncSimFromMeta(app, app.sim);
  app.interaction.slot = i;
  app.interaction._handSlot = i; // Put tower in hand
  app.interaction.tool = "tower";
  clearPlaceConfirm(app);
  app.interaction.selectedTowerId = -1;
  app.interaction.selectedWallId = -1;
  renderGameChrome(app);
  
}

export function onKeyUp(app, e) {
  if ((e.code === "Space" || e.key === " ") && app._spaceFf) {
    app._spaceFf = false;
    endFastForward(app);
  }
}
