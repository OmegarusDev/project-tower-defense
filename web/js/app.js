/**
 * Thin App orchestrator — class, ctor, start/tick, wireSim, bindUi;
 * screens / run / chrome live in js/app/* and js/ui/*.
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
import { getCampaignLevel } from "./data/campaign.js";
import { wireSettings, paintCampaignThumbs } from "./ui/menuScreens.js";
import { LevelEditor, loadEditorLevels } from "./ui/levelEditor.js";
import { mountScreen } from "./ui/next/registry.js";
import { screenState, chromeState } from "./ui/next/stateOf.js";
import { syncTowerOverlay, syncWaveAndStatus } from "./ui/next/chrome.js";
import { paintLevelThumb } from "./ui/metaUi.js";
import { handleUiAction } from "./ui/bindActions.js";
import * as ends from "./ui/endScreens.js";
import * as forge from "./ui/forgeScreen.js";
import * as tech from "./ui/techScreen.js";
import * as metaSync from "./app/metaSync.js";
import * as life from "./app/runLifecycle.js";
import * as bridge from "./app/simBridge.js";
import * as chrome from "./app/gameChrome.js";
import * as place from "./app/placeUndo.js";
import * as input from "./app/input.js";
import * as pause from "./app/pauseSettings.js";

export class App {
  constructor() {
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
    this.tool = "tower";
    this.slot = 0;
    this.forgeSlot = 0;
    this.forgeReturn = "main";
    this.forgeAim = -Math.PI / 2;
    this.selectedTowerId = -1;
    this.selectedWallId = -1;
    this.techSelectedId = null;
    this.techTreeTab = "foundations";
    this.paused = false;
    this.speed = 1;
    this.accum = 0;
    this.status = "";
    this.placeConfirm = null;
    this.liveCompose = false;
    this.undoStack = [];
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

    this.board.onTap = (cell) => this.onCellTap(cell);
    this.board.onPanStart = () => {
      if (this.placeConfirm) this.cancelPlaceConfirm();
      this.board.hover = null;
      this._syncGhostPlan();
    };
    window.addEventListener("resize", () => this.board._fit(true));
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.screen === "game" && this.sim && !this.paused) {
        this.openPause();
      }
    });
  }

  start() {
    this.showMain();
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
    return new Set([
      "main", "hub", "campaign", "prep", "settings",
      "victory", "gameover", "forge", "upgrade",
    ]);
  }

  tick(dt) {
    this.score.tick(dt);
    if (this._metaBackdropScreens().has(this.screen) && this.screen !== "game") {
      this.title.tick(dt);
      this.title.draw();
      if (this.screen === "forge") {
        this.forgeAim += dt * 0.7;
        this.paintForgePreview();
      }
      return;
    }
    if (this.screen === "editor") return;
    if (this.screen === "game" && this.sim) {
      if (this._ghost) this._tickGhost(dt);
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
      this.score.setDensity(this.sim.enemies.length);
      this.score.setPhase(this.sim.checkpointPhase || "betweenWaves");
      this.board.tool = this.tool;
      this.board.selectedTowerId = this.selectedTowerId;
      this._syncGhostPlan();
      // Update portal animator with dt
      if (this.portalAnimator) {
        this.portalAnimator.update(dt);
      }
      // Pass portal animator to board for portal animation
      this.board.portalAnimator = this.portalAnimator;
      this.board.draw(dt, this.portalAnimator);
      this.refreshHud();
      this.slotPreviewAim = (this.slotPreviewAim || 0) + dt * 0.55;
      this.paintSlotPreviews();
    }
  }

  _syncGhostPlan() {
    if (!this.sim) {
      this.board.setGhostPlan(null);
      return;
    }
    let cell = this.placeConfirm || this.board.hover;
    let slot = this.sim.roster?.[this.slot];
    if (this.selectedTowerId >= 0) {
      const t = this.sim.towers.find((x) => x.id === this.selectedTowerId);
      if (t) {
        cell = t.cell;
        slot = t;
      }
    }
    if (!cell || !slot?.base || !slot?.barrel || !slot?.payload) {
      this.board.setGhostPlan(null);
      return;
    }
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
  }

  async unlockAudio() {
    await this.synth.resume();
    if (this.screen === "game" && this.meta.settings?.music !== false) {
      await this.score.start();
    }
  }

  toast(msg) {
    this.status = msg;
    const st = this.ui.querySelector("#status");
    if (st) {
      st.textContent = msg;
      st.classList.remove("empty");
    }
    this.synth.play("ui", 1);
  }

  wireSim() {
    this.sim.on("*", (e) => this.onSimEvent(e));
    this.board.setSim(this.sim);
    // Hook up portal animator events
    this.sim.on("portal_clump_start", (e) => this.portalAnimator.onClumpStart(e));
    this.sim.on("portal_clump_end", (e) => this.portalAnimator.onClumpEnd(e));
    this.sim.on("portal_move", (e) => this.portalAnimator.onMove(e));
  }

  bindUi() {
    if (this._uiClickBound) return;
    this._uiClickBound = true;
    this.ui.addEventListener("click", (ev) => {
      const el = ev.target.closest?.("[data-act]");
      if (!el || !this.ui.contains(el)) return;
      handleUiAction(this, el.getAttribute("data-act"), ev);
    });
  }

  showMain() {
    this.score.stop();
    this.screen = "main";
    mountScreen(this.ui, "main", screenState(this));
    this.bindUi();
  }
  showCampaign() {
    this.sim = null;
    this.selectedTowerId = -1;
    this.selectedWallId = -1;
    this.screen = "campaign";
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

  // Delegates keep App method names for data-act / hotkeys / cross-module app.* calls
  showEndlessHub() { return ends.showEndlessHub(this); }
  showVictory(o) { return ends.showVictory(this, o); }
  showGameOver() { return ends.showGameOver(this); }
  _applyEndlessBestBonus(p) { return ends.applyEndlessBestBonus(this, p); }

  showForge(r) { return forge.showForge(this, r); }
  _refreshForgeUi(o) { return forge.refreshForgeUi(this, o); }
  paintForgePreview() { return forge.paintForgePreview(this); }
  applyForgePart(k, id) { return forge.applyForgePart(this, k, id); }
  clearForgeSlot() { return forge.clearForgeSlot(this); }
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
