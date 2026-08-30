/**
 * App orchestrator — thin, explicit.
 * Interaction state lives in `this.interaction` (plain object, explicit — no proxy getters).
 * Dispatch is via `ui/next/actions.js` which calls screens/logic directly;
 * App owns navigation + tick + wiring. Legacy `app.*` delegates remain as
 * deprecated compat shims (one-liners forwarding to modules) so existing
 * callers keep working; new code should call `chrome.*(app)`, `place.*(app)`,
 * `app.interaction.tool` etc. directly.
 */

import { buildAttackPlan, planOptsFromParts } from "./sim/attackPlan.js";
import { TICK_HZ } from "./sim/next/sim.js";
import { BoardView } from "./view/next/boardView.js";
import { PortalAnimator } from "./view/next/boardScene.js";
import { ProcPalette } from "./view/palette.js";
import { TitleView } from "./view/titleView.js";
import { setPitch } from "./view/view25.js";
import { FxSystem } from "./view/fx.js";
import { SynthBank } from "./audio/synthBank.js";
import { ScoreEngine } from "./audio/scoreEngine.js";
import { loadMeta } from "./saveStore.js";
import { createInteraction } from "./app/interaction.js";

/** Screens that tick/draw the animated title backdrop (allocated once). */
const META_BACKDROP_SCREENS = new Set([
  "main", "hub", "campaign", "prep", "settings",
  "victory", "gameover", "forge", "upgrade",
]);

import { getCampaignLevel } from "./data/campaign.js";
import { wireSettings, paintCampaignThumbs } from "./ui/menuScreens.js";
import { LevelEditor, loadEditorLevels } from "./ui/levelEditor.js";
import { mountScreen } from "./ui/next/registry.js";
import { screenState, chromeState } from "./ui/next/stateOf.js";
import { syncTowerOverlay, syncWaveAndStatus } from "./ui/next/chrome.js";
import { paintLevelThumb } from "./ui/metaUi.js";
import { runAction } from "./ui/next/actions.js";
import * as forge from "./ui/forgeScreen.js";
import * as tech from "./ui/techScreen.js";
import * as ends from "./ui/endScreens.js";
import * as metaSync from "./app/metaSync.js";
import * as life from "./app/runLifecycle.js";
import * as bridge from "./app/simBridge.js";
import * as chrome from "./app/gameChrome.js";
import * as place from "./app/placeUndo.js";
import * as input from "./app/input.js";
import * as pause from "./app/pauseSettings.js";

export class App {
  constructor() {
    this.interaction = createInteraction();
    this.canvas = document.getElementById("game");
    this.ui = document.getElementById("ui");
    this.palette = new ProcPalette();
    this.synth = new SynthBank();
    this.score = new ScoreEngine(this.synth);
    this.board = new BoardView(this.canvas, this.palette);
    this.title = new TitleView(this.canvas, this.palette);
    this.fx = new FxSystem();
    this.board.fx = this.fx;
    this.portalAnimator = new PortalAnimator();
    this.meta = loadMeta();
    this.palette.setColorblind(!!this.meta.settings?.colorblind);
    setPitch(this.meta.settings?.cameraPitch ?? 24);
    this.sim = null;
    this.screen = "main";
    this.forgeSlot = 0;
    this.forgeReturn = "main";
    this.forgeAim = -Math.PI / 2;
    this.techSelectedId = null;
    this.techTreeTab = "foundations";
    this.paused = false;
    this.speed = 1;
    this.accum = 0;
    this.status = "";
    this.editor = null;
    this.prepLevelId = 0;
    this.prepSlot = 0;
    this.playtestFromEditor = false;
    this._ghost = null;
    this._ghostEndSim = null;
    this._raf = 0;
    this._last = 0;

    this.synth.setVolume(this.meta.settings?.sfxVolume ?? 0.35);
    this.synth.setMusicVolume(this.meta.settings?.musicVolume ?? 0.4);
    this.score.setEnabled(this.meta.settings?.music !== false);
    this.score.setMusicVolume(this.meta.settings?.musicVolume ?? 0.4);

    this.board.onTap = (cell) => place.onCellTap(this, cell);
    this.board.onPanStart = () => {
      if (this.interaction.placeConfirm) place.cancelPlaceConfirm(this);
      this.clearHand();
      this.board.hover = null;
      this._syncGhostPlan();
    };
    this.board.onPitchChange = (deg) => pause.applyPitch(this, deg);
    window.addEventListener("resize", () => this.board._fit(true));
    window.addEventListener("keydown", (e) => input.onKeyDown(this, e));
    window.addEventListener("keyup", (e) => input.onKeyUp(this, e));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (this.screen === "game" && this.sim && !this.paused) {
          pause.openPause(this);
        }
        this.score.stop();
      } else if (this.screen === "game" && this.sim && !this.paused) {
        this.unlockAudio();
      }
    });
    // Right-click anywhere clears hand
    document.addEventListener("contextmenu", (e) => {
      if (this.screen === "game" && this.interaction._handSlot != null) {
        e.preventDefault();
        this.clearHand();
      }
    });
  }

  start() {
    this.showSplash();
    this._last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this._last) / 1000);
      this._last = now;
      this.tick(dt);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _metaBackdropScreens() {
    return META_BACKDROP_SCREENS;
  }

  tick(dt) {
    this.score.tick(dt);
    if (this._metaBackdropScreens().has(this.screen) && this.screen !== "game" && this.screen !== "splash") {
      this.title.tick(dt);
      this.title.draw();
      if (this.screen === "forge") {
        this.forgeAim += dt * 0.7;
        forge.paintForgePreview(this);
      }
      return;
    }
    if (this.screen === "editor") return;
    if (this.screen === "game" && this.sim) {
      if (this._ghost) bridge.tickGhost(this, dt);
      if (!this.paused && this.sim.running) {
        this.accum += dt * this.speed;
        const step = 1 / TICK_HZ;
        let guard = 0;
        while (this.accum >= step && guard++ < 8) {
          this.accum -= step;
          this.sim.tick();
        }
      }
      if (!this.paused) this.fx.tick(dt * this.speed);
      this.score.setPhase(this.sim.checkpointPhase || "betweenWaves");
      this.board.tool = this.interaction.tool;
      this.board.selectedTowerId = this.interaction.selectedTowerId;
      this._syncGhostPlan();
      this._updateHandGhost();
      this._updateWallPreview();
      if (this.portalAnimator) {
        this.portalAnimator.update(dt);
      }
      this.board.portalAnimator = this.portalAnimator;
      this.board.draw(dt, this.portalAnimator);
      chrome.refreshHud(this);
      this.interaction.slotPreviewAim = (this.interaction.slotPreviewAim || 0) + dt * 0.55;
      chrome.paintSlotPreviews(this);
    }
  }

  _updateHandGhost() {
    if (this.interaction._handSlot != null && this.board && this.sim) {
      const loadout = this.sim.roster?.[this.interaction._handSlot];
      if (loadout?.complete) {
        const hover = this.board.hover;
        if (hover) {
          const p = this.board.cellScreenCenter(hover.x, hover.y);
          this.board.setHandGhost(loadout, p.x, p.y, hover);
          this.board.setHasHandTower(true);
          return;
        }
      }
    }
    this.board.setHandGhost(null);
    this.board.setHasHandTower(false);
  }

  _updateWallPreview() {
    if (this.interaction.tool === "wall" && this.board && this.sim) {
      const hover = this.board.hover;
      if (hover && this.sim.grid.inBounds(hover.x, hover.y) && this.sim.grid.isBuildable(hover.x, hover.y)) {
        const wallCost = this.sim.economy.wallCost(this.sim.playerWallCount());
        const canAfford = this.sim.economy.battle >= wallCost;
        this.board.setWallPreview(hover, wallCost, canAfford);
        return;
      }
    }
    this.board.setWallPreview(null);
  }

  _syncGhostPlan() {
    if (!this.sim) {
      this.board.setGhostPlan(null);
      return;
    }
    if (this.interaction._handSlot != null) {
      this.board.setGhostPlan(null);
      return;
    }
    if (this.interaction.selectedTowerId >= 0) {
      const t = this.sim.towers.find((x) => x.id === this.interaction.selectedTowerId);
      if (t) {
        const cell = t.cell;
        const slot = t;
        const up = this.sim.partUpgrades || {};
        const g = this.sim.globalMods || {};
        const plan = buildAttackPlan(
          slot.base,
          slot.barrel,
          slot.payload,
          slot.level || 1,
          planOptsFromParts(up, g, slot)
        );
        this.board.setGhostPlan(plan, cell);
        return;
      }
    }
    this.board.setGhostPlan(null);
  }

  clearHand() {
    if (this.interaction._handSlot != null) {
      this.interaction._handSlot = null;
      this.board.setHandGhost(null);
      chrome.renderGameChrome(this);
    }
  }

  async unlockAudio() {
    await this.synth.resume();
    if (this.meta.settings?.music === false) return;
    if (this.screen === "game") {
      await this.score.start();
    } else if (["main", "hub", "campaign", "prep", "settings", "forge", "upgrade", "editor"].includes(this.screen)) {
      this.score.toMenu();
      if (!this.score.running) await this.score.start();
    }
  }

  toast(msg) {
    this.status = msg;
    const st = this.ui.querySelector("#status");
    if (st) {
      st.textContent = msg;
      st.classList.remove("empty");
    }
    this.synth.play("ui", 1, 0.4);
  }

  wireSim() {
    this.sim.on("*", (e) => bridge.onSimEvent(this, e));
    this.board.setSim(this.sim);
    this.sim.on("portal_clump_start", (e) => this.portalAnimator.onClumpStart(e));
    this.sim.on("portal_clump_end", (e) => this.portalAnimator.onClumpEnd(e));
    this.sim.on("portal_move", (e) => this.portalAnimator.onMove(e));
    this.sim.on("portal_unstable", (e) => {
      this.portalAnimator.onUnstable(e);
      if (!this._ghost && Number.isInteger(e.toX)) {
        this.toast(`Seam unstable — migrating to column ${e.toX + 1}`);
      }
    });
  }

  bindUi() {
    if (this._uiClickBound) return;
    this._uiClickBound = true;
    this.ui.addEventListener("click", (ev) => {
      const el = ev.target.closest?.("[data-act]");
      if (!el || !this.ui.contains(el)) return;
      runAction(this, el.getAttribute("data-act"), ev);
    });
  }

  showSplash() {
    this.screen = "splash";
    mountScreen(this.ui, "splash", screenState(this));
    this.bindUi();
  }
  showMain() {
    this.score.toMenu();
    this.screen = "main";
    mountScreen(this.ui, "main", screenState(this));
    this.bindUi();
  }
  showCampaign() {
    this.sim = null;
    this.interaction.selectedTowerId = -1;
    this.interaction.selectedWallId = -1;
    this.screen = "campaign";
    this.score?.toMenu();
    mountScreen(this.ui, "campaign", screenState(this));
    this.bindUi();
    paintCampaignThumbs(this);
  }
  showPrep(levelId) {
    if (!getCampaignLevel(levelId)) return this.showCampaign();
    this.screen = "prep";
    this.prepLevelId = levelId;
    if (this.prepSlot == null) this.prepSlot = 0;
    mountScreen(this.ui, "prep", screenState(this));
    this.bindUi();
    const thumb = this.ui.querySelector("canvas.prep-thumb");
    const lv = getCampaignLevel(levelId);
    if (thumb && lv) paintLevelThumb(thumb, lv, this.palette);
  }
  showEditor() {
    if (!this.editor) this.editor = new LevelEditor();
    this.screen = "editor";
    this.score?.toMenu();
    mountScreen(this.ui, "editor", {
      ...screenState(this),
      editor: this.editor,
      editorLevels: loadEditorLevels(),
    });
    this.bindUi();
    const syncFields = () => {
      const ed = this.editor;
      if (!ed) return;
      ed.name = this.ui.querySelector("#edName")?.value || ed.name;
      ed.wavesToWin = +(this.ui.querySelector("#edWaves")?.value || ed.wavesToWin);
      ed.coinGrant = +(this.ui.querySelector("#edCoin")?.value || ed.coinGrant);
      ed.waveScript = this.ui.querySelector("#edScript")?.value || ed.waveScript;
    };
    this.ui.querySelector("#edName")?.addEventListener("change", syncFields);
    this.ui.querySelector("#edWaves")?.addEventListener("change", syncFields);
    this.ui.querySelector("#edCoin")?.addEventListener("change", syncFields);
    this.ui.querySelector("#edScript")?.addEventListener("change", syncFields);
  }
  showSettings() {
    this.screen = "settings";
    mountScreen(this.ui, "settings", screenState(this));
    this.bindUi();
    wireSettings(this);
  }

  backScreen() {
    const x = this.ui.querySelector(".x-close");
    if (x) runAction(this, x.getAttribute("data-act"));
  }

  // --- Compat delegates — deprecated, keep for existing callers ---
  // New code should call `chrome.*(this)`, `place.*(this)`, `forge.*(this)`, etc. directly.
  // These one-liners remain so `app.refreshHud()` etc. keep working during the transition.
  showEndlessHub() { return ends.showEndlessHub(this); }
  showVictory(o) { return ends.showVictory(this, o); }
  showGameOver() { return ends.showGameOver(this); }
  _applyEndlessBestBonus(p) { return ends.applyEndlessBestBonus(this, p); }
  showForge(r) { return forge.showForge(this, r); }
  _refreshForgeUi(o) { return forge.refreshForgeUi(this, o); }
  paintForgePreview() { return forge.paintForgePreview(this); }
  applyForgePart(k, id) { return forge.applyForgePart(this, k, id); }
  clearForgeSlot() { return forge.clearForgeSlot(this); }
  toggleDevMode() { return forge.toggleDevMode(this); }
  unlockForgeSlot(i) { return forge.unlockForgeSlot(this, i); }
  buyPart(k, id, e) { return forge.buyPart(this, k, id, e); }
  showUpgrade(r) { return tech.showUpgrade(this, r); }
  setTechTreeTab(id) { return tech.setTechTreeTab(this, id); }
  selectTechNode(id) { return tech.selectTechNode(this, id); }
  closeTechOverlay() { return tech.closeTechOverlay(this); }
  buyTechNode(id) { return tech.buyTechNode(this, id); }
  unlockPartFromTech(k, id) { return tech.unlockPartFromTech(this, k, id); }
  persistMeta() { return metaSync.persistMeta(this); }
  _applyRunTech(sim, o) { return metaSync.applyRunTech(this, sim, o); }
  _syncSimFromMeta(sim, o) { return metaSync.syncSimFromMeta(this, sim, o); }
  syncMetaProgress() { return metaSync.syncMetaProgress(this); }
  newRun(seed, o) { return life.newRun(this, seed, o); }
  continueRun() { return life.continueRun(this); }
  startCampaignLevel(id) { return life.startCampaignLevel(this, id); }
  playtestEditorLevel(lv) { return life.playtestEditorLevel(this, lv); }
  enterGame() { return life.enterGame(this); }
  onSimEvent(e) { return bridge.onSimEvent(this, e); }
  onCampaignVictory() { return bridge.onCampaignVictory(this); }
  callEarly() { return bridge.callEarly(this); }
  startGhostReplay() { return bridge.startGhostReplay(this); }
  ghostSetSpeed(n) { return bridge.ghostSetSpeed(this, n); }
  ghostSkip() { return bridge.ghostSkip(this); }
  _tickGhost(dt) { return bridge.tickGhost(this, dt); }
  waveBusy() { return chrome.waveBusy(this); }
  renderGameChrome() { return chrome.renderGameChrome(this); }
  toggleLiveCompose() { return chrome.toggleLiveCompose(this); }
  applyLiveComposePart(k, id) { return chrome.applyLiveComposePart(this, k, id); }
  paintSlotPreviews(force = false) { return chrome.paintSlotPreviews(this, force); }
  refreshHud() { return chrome.refreshHud(this); }
  _refreshThemeChip(t, e) { return syncWaveAndStatus(this.ui, chromeState(this)); }
  syncTowerOverlay() { return syncTowerOverlay(this.ui, chromeState(this)); }
  clearUndoStack() { return place.clearUndoStack(this); }
  pushUndo(e) { return place.pushUndo(this, e); }
  undoLast() { return place.undoLast(this); }
  spendLevelPointSelected() { return place.chooseLevelBranchSelected(this, "damage"); }
  chooseLevelBranchSelected(b) { return place.chooseLevelBranchSelected(this, b); }
  onCellTap(c) { return place.onCellTap(this, c); }
  beginPlaceConfirm(x, y) { return place.beginPlaceConfirm(this, x, y); }
  clearPlaceConfirm() { return place.clearPlaceConfirm(this); }
  cancelPlaceConfirm() { return place.cancelPlaceConfirm(this); }
  confirmPlaceTower() { return place.confirmPlaceTower(this); }
  handlePlace(r, l) { return place.handlePlace(this, r, l); }
  sellSelected() { return place.sellSelected(this); }
  onKeyDown(e) { return input.onKeyDown(this, e); }
  onKeyUp(e) { return input.onKeyUp(this, e); }
  setSpeed(n) { return input.setSpeed(this, n); }
  selectBuildSlot(i) { return input.selectBuildSlot(this, i); }
  _beginFastForward() { return input.beginFastForward(this); }
  _endFastForward() { return input.endFastForward(this); }
  _bindCallButton(btn) { return input.bindCallButton(this, btn); }
  applyPitch(d, o) { return pause.applyPitch(this, d, o); }
  openPause() { return pause.openPause(this); }
  resumeGame() { return pause.resumeGame(this); }
  quitToMenu() { return pause.quitToMenu(this); }
  _renderPauseSheet() { return pause.renderPauseSheet(this); }
}
