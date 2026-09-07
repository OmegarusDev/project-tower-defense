/**
 * App orchestrator — thin, explicit.
 * using explicit app.interaction.* instead of proxy getters (app.tool) because direct field is searchable and obvious
 * Dispatch via `ui/actions.js` calls screens/logic directly; App owns navigation + tick + wiring.
 * Screen/run logic lives in `app/*` and `ui/*`; App owns navigation, tick, and sim wiring.
 */

import { buildAttackPlan, planOptsFromParts } from "./sim/attackPlan.js";
import { TICK_HZ } from "./sim/sim.js";
import { wallCost } from "./sim/systems/economy.js";
import { BoardView } from "./view/boardView.js";
import { PortalAnimator } from "./view/boardScene.js";
import { ProcPalette } from "./view/palette.js";
import { TitleView } from "./view/titleView.js";
import { setPitch } from "./view/camera.js";
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
import { mountScreen } from "./ui/registry.js";
import { screenState } from "./ui/stateOf.js";
import { paintLevelThumb } from "./ui/metaUi.js";
import { runAction } from "./ui/actions.js";
import * as forge from "./ui/forgeScreen.js";
import * as bridge from "./app/simBridge.js";
import * as chrome from "./app/gameChrome.js";
import { setCallEarly } from "./app/fastForward.js";
import * as place from "./app/placeUndo.js";
import * as input from "./app/input.js";
import * as pause from "./app/pauseSettings.js";

setCallEarly(bridge.callEarly);

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
      if (!this.paused && this.sim.state.running) {
        this.accum += dt * this.speed;
        const step = 1 / TICK_HZ;
        let guard = 0;
        while (this.accum >= step && guard++ < 8) {
          this.accum -= step;
          this.sim.tick();
        }
      }
      if (!this.paused) this.fx.tick(dt * this.speed);
      this.score.setPhase(this.sim.state.checkpointPhase || "betweenWaves");
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
      const loadout = this.sim.state.roster?.[this.interaction._handSlot];
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
      if (hover && this.sim.state.grid.inBounds(hover.x, hover.y) && this.sim.state.grid.isBuildable(hover.x, hover.y)) {
        const cost = wallCost(this.sim.state.economy, this.sim.playerWallCount());
        const canAfford = this.sim.state.economy.battle >= cost;
        this.board.setWallPreview(hover, cost, canAfford);
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
      const t = this.sim.state.towers.find((x) => x.id === this.interaction.selectedTowerId);
      if (t) {
        const cell = t.cell;
        const slot = t;
        const up = this.sim.state.partUpgrades || {};
        const g = this.sim.state.globalMods || {};
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

  _unwireSim(sim) {
    if (!sim) return;
    sim.off("*", this._onSimStar);
    sim.off("portal_clump_start", this._onPortalClumpStart);
    sim.off("portal_clump_end", this._onPortalClumpEnd);
    sim.off("portal_move", this._onPortalMove);
    sim.off("portal_unstable", this._onPortalUnstable);
    this._simWired = null;
  }

  wireSim() {
    if (!this.sim) return;
    if (this._simWired === this.sim) return;
    if (this._simWired) this._unwireSim(this._simWired);
    this._onSimStar = (e) => bridge.onSimEvent(this, e);
    this._onPortalClumpStart = (e) => this.portalAnimator.onClumpStart(e);
    this._onPortalClumpEnd = (e) => this.portalAnimator.onClumpEnd(e);
    this._onPortalMove = (e) => this.portalAnimator.onMove(e);
    this._onPortalUnstable = (e) => {
      this.portalAnimator.onUnstable(e);
      if (!this._ghost && Number.isInteger(e.toX)) {
        this.toast(`Seam unstable — migrating to column ${e.toX + 1}`);
      }
    };
    this.sim.on("*", this._onSimStar);
    this.sim.on("portal_clump_start", this._onPortalClumpStart);
    this.sim.on("portal_clump_end", this._onPortalClumpEnd);
    this.sim.on("portal_move", this._onPortalMove);
    this.sim.on("portal_unstable", this._onPortalUnstable);
    this.board.setSim(this.sim);
    this._simWired = this.sim;
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
    this.score?.toMenu?.();
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
    this.score?.toMenu?.();
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
}
