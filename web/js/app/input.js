/** Extracted from App — pure move, no gameplay changes. */

export function onKeyDown(app, e) {
  if (app.screen !== "game" || !app.sim) return;
  if (e.code === "Escape" || e.key === "Escape") {
    e.preventDefault();
    if (app.placeConfirm) {
      app.cancelPlaceConfirm();
      return;
    }
    if (app.paused) app.resumeGame();
    else app.openPause();
    return;
  }
  if (app.paused) {
    // Speed keys work from pause sheet context too.
    if (e.key === "1" || e.key === "2" || e.key === "3") {
      if (!e.altKey && !e.metaKey && !e.ctrlKey) {
        // Digit keys also pick slots when unpaused; while paused set speed.
        e.preventDefault();
        app.setSpeed(+e.key);
      }
    }
    return;
  }

  const key = e.key;
  const code = e.code;

  if (code === "Space" || key === " ") {
    e.preventDefault();
    if (e.repeat) return;
    app.unlockAudio().then(() => app.callEarly());
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
      app.selectBuildSlot(slotIdx);
      return;
    }
    if (key === "w" || key === "W") {
      e.preventDefault();
      app.tool = "wall";
      app.clearPlaceConfirm();
      app.refreshHud();
      return;
    }
    if (key === "b" || key === "B") {
      e.preventDefault();
      app.toggleLiveCompose();
      return;
    }
    if (key === "x" || key === "X") {
      e.preventDefault();
      app.sellSelected();
      return;
    }
    if (key === "u" || key === "U") {
      e.preventDefault();
      // Default branch pick = Damage when a tower has pending picks.
      app.chooseLevelBranchSelected("damage");
      return;
    }
    if (key === "z" || key === "Z") {
      e.preventDefault();
      app.undoLast();
      return;
    }
  }
  
}

export function setSpeed(app, n) {
  const s = Math.max(1, Math.min(3, n | 0 || 1));
  endFastForward(app);
  app.speed = s;
  app.score.setSpeed(s);
  app.refreshHud();
  if (app.paused) app._renderPauseSheet();
  
}

export function selectBuildSlot(app, i) {
  const unlocked = app.meta.slotCount | 0;
  if (!app.sim || i < 0 || i >= unlocked) {
    app.toast(`Unlock Slot ${i + 1} in Tech Tree → Roster`);
    return;
  }
  if ((app.sim.roster?.length | 0) < unlocked) app._syncSimFromMeta(app.sim);
  app.slot = i;
  app.tool = "tower";
  app.clearPlaceConfirm();
  app.selectedTowerId = -1;
  app.selectedWallId = -1;
  app.renderGameChrome();
  
}

export function beginFastForward(app) {
  if (app.paused || app.screen !== "game" || !app.sim) return;
  if (app._ffHeld) return;
  app._ffHeld = true;
  app._speedBeforeFf = app.speed || 1;
  app.speed = 5;
  app.score.setSpeed(5);
  app.refreshHud();
  
}

export function endFastForward(app) {
  if (!app._ffHeld) return;
  app._ffHeld = false;
  app.speed = app._speedBeforeFf || 1;
  app.score.setSpeed(app.speed);
  app.refreshHud();
  
}

/** Deploy on short tap; hold for 5× (replaces the old FF fab). */
export function bindCallButton(app, btn) {
  if (!btn) return;
  const HOLD_MS = 260;
  let armed = false;
  let t0 = 0;
  const start = (e) => {
    if (btn.disabled || app.paused) return;
    e.preventDefault();
    armed = true;
    t0 = performance.now();
    try {
      btn.setPointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
    beginFastForward(app);
  };
  const end = () => {
    if (!armed) return;
    armed = false;
    const held = performance.now() - t0;
    endFastForward(app);
    if (held < HOLD_MS && !app.waveBusy() && !app.paused) {
      app.unlockAudio().then(() => app.callEarly());
    }
  };
  btn.addEventListener("pointerdown", start);
  btn.addEventListener("pointerup", end);
  btn.addEventListener("pointercancel", end);
  btn.addEventListener("lostpointercapture", end);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  btn.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (btn.disabled || app.paused || app.waveBusy()) return;
    e.preventDefault();
    app.unlockAudio().then(() => app.callEarly());
  });
  
}
