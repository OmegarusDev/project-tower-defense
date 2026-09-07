/**
 * Hold-to-fast-forward + Deploy button binding.
 * Kept off gameChrome/input so those modules don't import each other.
 */
import { chromeState } from "../ui/stateOf.js";
import { syncHud } from "../ui/chrome.js";
import { waveBusy } from "./waveBusy.js";

let callEarlyFn = null;

/** Wired from app.js so this module never imports simBridge (cycle). */
export function setCallEarly(fn) {
  callEarlyFn = fn;
}

function touchHud(app) {
  if (!app.sim || app.screen !== "game") return;
  syncHud(app.ui, chromeState(app));
}

export function beginFastForward(app) {
  if (app.paused || app.screen !== "game" || !app.sim) return;
  if (app._ffHeld) return;
  app._ffHeld = true;
  app._speedBeforeFf = app.speed || 1;
  const ffSpeed = app.meta?.ffSpeed || 2;
  app.speed = ffSpeed;
  app.score.setSpeed(ffSpeed);
  touchHud(app);
}

export function endFastForward(app) {
  if (!app._ffHeld) return;
  app._ffHeld = false;
  app.speed = app._speedBeforeFf || 1;
  app.score.setSpeed(app.speed);
  touchHud(app);
}

/** Deploy on short tap; hold for 5×. */
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
    if (held < HOLD_MS && !waveBusy(app) && !app.paused) {
      app.unlockAudio().then(() => callEarlyFn?.(app));
    }
  };
  btn.addEventListener("pointerdown", start);
  btn.addEventListener("pointerup", end);
  btn.addEventListener("pointercancel", end);
  btn.addEventListener("lostpointercapture", end);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  btn.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (btn.disabled || app.paused || waveBusy(app)) return;
    e.preventDefault();
    app.unlockAudio().then(() => callEarlyFn?.(app));
  });
}
