import { ENDLESS_GRID } from "./data/endlessGrid.js";
import { SimWorld, TICK_HZ } from "./sim/simWorld.js";
import { buildAttackPlan } from "./sim/attackPlan.js";
import {
  makeSlot,
  PARTS,
  forgeBuyCost,
  ownsPart,
  normalizeRoster,
  partLabel,
  doctrineLabel,
  applyWaveUnlocks,
  WAVE_UNLOCKS,
  MAX_ROSTER_SLOTS,
} from "./data/parts.js";
import {
  TECH_TREES,
  BASE_START_CASH,
  getTechNode,
  techRank,
  techRequiresMet,
  techPartOwned,
  techNextCost,
  formatTechCost,
  canAffordTech,
  spendTechCost,
  syncTechDerived,
} from "./data/techTree.js";
import { BoardView } from "./view/boardView.js";
import { ProcPalette } from "./view/palette.js";
import { TitleView } from "./view/titleView.js";
import { drawComposedTower } from "./view/towerPainter.js";
import { VIEW25, setPitch } from "./view/view25.js";
import { FxSystem } from "./view/fx.js";
import { SynthBank } from "./audio/synthBank.js";
import { ScoreEngine } from "./audio/scoreEngine.js";
import {
  loadMeta,
  saveMeta,
  hasEndless,
  saveEndless,
  loadEndless,
  clearEndless,
} from "./saveStore.js";
import { CAMPAIGN_LEVELS, getCampaignLevel, isLevelUnlocked } from "./data/campaign.js";
import {
  renderMain,
  renderSettings,
  wireSettings,
  renderCampaign,
  renderPrep,
  renderEditor,
  forgePlanSummary,
  paintCampaignThumbs,
  endlessThemeBlurb,
} from "./ui/menuScreens.js";
import { paintLevelThumb } from "./ui/metaUi.js";
import { loadEditorLevels } from "./ui/levelEditor.js";
import { exportReplayBlob, applyReplayAction } from "./ui/replay.js";

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
    this.editor = null;
    this.prepLevelId = 0;
    this.prepSlot = 0;
    this.playtestFromEditor = false;
    this.menuBackdrop = false;
    this._ghost = null;
    this._raf = 0;
    this._last = 0;

    this.synth.setVolume(this.meta.settings?.sfxVolume ?? 0.35);
    this.score.setEnabled(this.meta.settings?.music !== false);

    this.board.onTap = (cell) => this.onCellTap(cell);
    window.addEventListener("resize", () => this.board._fit(true));
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.screen === "game" && this.sim && !this.paused) {
        this.openPause();
      }
    });
  }

  /** Persist camera pitch from Settings or the in-game slider. */
  applyPitch(deg, { save = true } = {}) {
    const v = Math.max(8, Math.min(58, Number(deg) || 24));
    this.meta.settings = this.meta.settings || {};
    this.meta.settings.cameraPitch = Math.round(v);
    this.board.setPitchDeg(v);
    const live = this.ui?.querySelector("#pitchLive");
    if (live && +live.value !== Math.round(v)) live.value = String(Math.round(v));
    const label = this.ui?.querySelector("#pitchLiveVal");
    if (label) label.textContent = `${Math.round(v)}°`;
    if (save) {
      clearTimeout(this._pitchSaveT);
      this._pitchSaveT = setTimeout(() => saveMeta(this.meta), 200);
    }
  }

  persistMeta() {
    this.meta.roster = normalizeRoster(
      this.meta.roster,
      this.meta.slotCount,
      this.meta.levelCap
    );
    saveMeta(this.meta);
  }

  onKeyDown(e) {
    if (this.screen !== "game" || !this.sim) return;
    if (e.code === "Escape" || e.key === "Escape") {
      e.preventDefault();
      if (this.placeConfirm) {
        this.cancelPlaceConfirm();
        return;
      }
      if (this.paused) this.resumeGame();
      else this.openPause();
      return;
    }
    if (this.paused) return;
    if (e.code !== "Space" && e.key !== " ") return;
    e.preventDefault();
    if (e.repeat) return;
    this.unlockAudio().then(() => this.callEarly());
  }

  openPause() {
    if (this.screen !== "game" || !this.sim) return;
    this._endFastForward();
    this.paused = true;
    this.clearPlaceConfirm();
    this._renderPauseSheet();
  }

  resumeGame() {
    this.paused = false;
    this.ui.querySelector("#pauseSheet")?.remove();
  }

  _beginFastForward() {
    if (this.paused || this.screen !== "game" || !this.sim) return;
    if (this._ffHeld) return;
    this._ffHeld = true;
    this._speedBeforeFf = this.speed || 1;
    this.speed = 5;
    this.score.setSpeed(5);
    this.refreshHud();
  }

  _endFastForward() {
    if (!this._ffHeld) return;
    this._ffHeld = false;
    this.speed = this._speedBeforeFf || 1;
    this.score.setSpeed(this.speed);
    this.refreshHud();
  }

  /** Deploy on short tap; hold for 5× (replaces the old FF fab). */
  _bindCallButton(btn) {
    if (!btn) return;
    const HOLD_MS = 260;
    let armed = false;
    let t0 = 0;
    const start = (e) => {
      if (btn.disabled || this.paused) return;
      e.preventDefault();
      armed = true;
      t0 = performance.now();
      try {
        btn.setPointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      this._beginFastForward();
    };
    const end = () => {
      if (!armed) return;
      armed = false;
      const held = performance.now() - t0;
      this._endFastForward();
      if (held < HOLD_MS && !this.waveBusy() && !this.paused) {
        this.unlockAudio().then(() => this.callEarly());
      }
    };
    btn.addEventListener("pointerdown", start);
    btn.addEventListener("pointerup", end);
    btn.addEventListener("pointercancel", end);
    btn.addEventListener("lostpointercapture", end);
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    btn.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (btn.disabled || this.paused || this.waveBusy()) return;
      e.preventDefault();
      this.unlockAudio().then(() => this.callEarly());
    });
  }

  quitToMenu() {
    if (!this.sim) return;
    const fromEditor = !!this.playtestFromEditor;
    const campaign = !this.sim.modeEndless;
    const msg = fromEditor
      ? "End playtest and return to the Level Editor?"
      : campaign
        ? "Abandon this campaign run and return to the Campaign menu?"
        : "Return to the Endless menu? Your checkpoint is saved.";
    if (!confirm(msg)) return;
    this._endFastForward();
    this.paused = false;
    this.selectedTowerId = -1;
    this.selectedWallId = -1;
    this.sim = null;
    this.playtestFromEditor = false;
    if (fromEditor) this.showEditor();
    else if (campaign) this.showCampaign();
    else this.showEndlessHub();
  }

  _renderPauseSheet() {
    if (!this.sim || this.screen !== "game") return;
    this.ui.querySelector("#pauseSheet")?.remove();
    const endless = !!this.sim.modeEndless;
    const wave = this.sim.waveIndex | 0;
    const quitLabel = endless ? "Endless Menu" : "Campaign Menu";
    const sheet = document.createElement("div");
    sheet.id = "pauseSheet";
    sheet.className = "pause-sheet";
    sheet.innerHTML = `
      <button type="button" class="pause-backdrop" data-act="resume" aria-label="Resume"></button>
      <div class="pause-card" role="dialog" aria-modal="true" aria-labelledby="pauseTitle">
        <p class="pause-mark">Paused</p>
        <h2 id="pauseTitle">Wave ${wave}</h2>
        <p class="pause-note">${
          this.playtestFromEditor
            ? "Editor playtest"
            : endless
              ? "Checkpoint saved at wave start."
              : `Campaign level ${this.sim.campaignLevelId}`
        }</p>
        <p class="pause-hint">Hold Deploy for 5× · seed ${this.sim.runSeed >>> 0}</p>
        <button type="button" class="btn title-cta" data-act="resume">Resume</button>
        <button type="button" class="btn secondary" data-act="quit-run">${
          this.playtestFromEditor ? "Editor" : quitLabel
        }</button>
      </div>`;
    this.ui.appendChild(sheet);
    sheet.querySelectorAll("[data-act]").forEach((el) => {
      el.addEventListener("click", () => {
        const act = el.getAttribute("data-act");
        if (act === "resume") this.resumeGame();
        else if (act === "quit-run") this.quitToMenu();
      });
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
      "main",
      "hub",
      "campaign",
      "prep",
      "settings",
      "victory",
      "gameover",
      "forge",
      "upgrade",
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
      this.board.tool = this.tool;
      this.board.selectedTowerId = this.selectedTowerId;
      this._syncGhostPlan();
      this.board.draw(dt);
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
    const plan = buildAttackPlan(slot.base, slot.barrel, slot.payload, slot.level || 1, {
      chainRank: up[slot.payload]?.chain | 0,
      powerRank: up[slot.payload]?.power | 0,
      basePower: up[slot.base]?.power | 0,
      barrelPower: up[slot.barrel]?.power | 0,
      globalDamage: g.damage || 1,
      globalRange: g.range || 1,
      globalRof: g.rof || 1,
    });
    this.board.setGhostPlan(plan, cell);
  }

  async unlockAudio() {
    // SFX unlock lazily inside SynthBank.play — do not start music here.
  }

  showMain() {
    this.score.stop();
    renderMain(this);
    this.bindUi();
  }

  showForge(returnTo) {
    if (returnTo) this.forgeReturn = returnTo;
    if (!this.forgeReturn) this.forgeReturn = "main";
    this.screen = "forge";
    this.meta.roster = normalizeRoster(
      this.meta.roster,
      this.meta.slotCount,
      this.meta.levelCap
    );
    if (this.forgeSlot >= this.meta.roster.length) this.forgeSlot = 0;
    const slot = this.meta.roster[this.forgeSlot] || makeSlot();
    const owned = this.meta.owned;
    const backAct =
      this.forgeReturn === "hub"
        ? "hub"
        : this.forgeReturn === "campaign"
          ? "campaign"
          : this.forgeReturn === "prep"
            ? `prep:${this.prepLevelId || 1}`
            : "main";
    const partBtn = (kind, id) => {
      const have = ownsPart(owned, kind, id);
      const equipped = slot[kind] === id;
      const table = kind === "base" ? PARTS.bases : kind === "barrel" ? PARTS.barrels : PARTS.payloads;
      const tip = table[id]?.blurb || "";
      const extra =
        kind === "base" && table[id]?.doctrine
          ? ` · ${doctrineLabel(table[id].doctrine)}`
          : "";
      if (have) {
        const cls = `btn part-btn part-chip ${equipped ? "equipped" : ""}`.trim();
        return `<button class="${cls}" data-act="forge-part:${kind}:${id}" title="${tip}">${partLabel(id)}${extra}</button>`;
      }
      const cost = this._forgeCost(kind, id);
      const can = this.meta.forge >= cost;
      const cls = `btn part-btn part-chip locked ${can ? "" : "cant-afford"}`.trim();
      return `<button class="${cls}" data-act="buy:${kind}:${id}" title="${tip} — unlock for ${cost} Forge parts">${partLabel(id)}${extra}<br/><span style="opacity:0.75">${cost} Parts</span></button>`;
    };
    const slotBtns = this._rosterSlotButtons("forge");
    this.ui.innerHTML = `
      <div class="screen scroll meta-screen forge-screen meta-enter">
        <header class="meta-hero">
          <div class="meta-hero-row">
            <div>
              <h1>Forge</h1>
            </div>
            <button class="btn secondary tech-back" data-act="${backAct}">Back</button>
          </div>
          <div class="title-stats tech-stats">
            <span><i>Parts</i>${this.meta.forge}</span>
            <span><i>Æ</i>${this.meta.aether}</span>
            <span><i>Cap</i>L${this.meta.levelCap}</span>
          </div>
          <div class="status tech-status" id="status">${this.status}</div>
        </header>
        <div class="row build-strip">${slotBtns}</div>
        <div class="forge-preview-wrap">
          <canvas id="forgePreview" width="160" height="160" aria-label="Tower preview"></canvas>
          <div class="forge-summary">
            <h3>Slot ${this.forgeSlot + 1}</h3>
            <p id="forgeLoadout">${forgePlanSummary(slot)}</p>
            <button class="btn secondary part-chip" data-act="forge-clear" style="margin-top:8px">Clear slot</button>
          </div>
        </div>
        <div class="cols forge-part-grid">
          <div>
            <h4>Base</h4>
            ${Object.keys(PARTS.bases)
              .map((id) => partBtn("base", id))
              .join("")}
          </div>
          <div>
            <h4>Barrel</h4>
            ${Object.keys(PARTS.barrels)
              .map((id) => partBtn("barrel", id))
              .join("")}
          </div>
          <div>
            <h4>Payload</h4>
            ${Object.keys(PARTS.payloads)
              .map((id) => partBtn("payload", id))
              .join("")}
          </div>
        </div>
        <button class="btn warn" data-act="upgrade">Tech Tree</button>
        <p class="end-note">Locked parts cost Parts. Wave gifts are free. Tech Tree is permanent.</p>
      </div>`;
    this.bindUi();
    this.paintForgePreview();
  }

  _forgeCost(kind, id) {
    return forgeBuyCost(kind, id);
  }

  paintForgePreview() {
    const canvas = this.ui.querySelector("#forgePreview");
    if (!canvas || this.screen !== "forge") return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const css = 112;
    if (canvas.width !== Math.floor(css * dpr)) {
      canvas.width = Math.floor(css * dpr);
      canvas.height = Math.floor(css * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, css, css);
    ctx.fillStyle = "#1a1c18";
    ctx.fillRect(0, 0, css, css);
    const slot = this.meta.roster[this.forgeSlot];
    if (!slot?.complete) {
      ctx.fillStyle = "#9aa6b8";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("incomplete", css / 2, css / 2);
      return;
    }
    const t = {
      base: slot.base,
      barrel: slot.barrel,
      payload: slot.payload,
      aimAngle: this.forgeAim,
      levelPoints: 0,
    };
    const size = 72;
    const px = (css - size) / 2;
    const py = (css - size) / 2;
    // Match board pitch foreshortening on the preview
    ctx.save();
    ctx.translate(css / 2, css / 2);
    ctx.scale(1, VIEW25.yScale);
    ctx.translate(-css / 2, -css / 2);
    drawComposedTower(ctx, this.palette, t, px, py, size, false);
    ctx.restore();
  }

  showUpgrade(returnTo) {
    if (returnTo) {
      this.upgradeReturn = returnTo;
      this.techSelectedId = null;
    }
    if (!this.upgradeReturn) this.upgradeReturn = "forge";
    if (!this.techTreeTab) this.techTreeTab = "foundations";
    this.screen = "upgrade";
    let backAct = "forge";
    if (this.upgradeReturn === "main") backAct = "main";
    else if (this.upgradeReturn === "hub") backAct = "hub";
    else if (this.upgradeReturn === "campaign") backAct = "campaign";
    else if (this.upgradeReturn === "prep") backAct = `prep:${this.prepLevelId || 1}`;
    else if (this.upgradeReturn === "forge") backAct = "forge";
    const backLabel =
      backAct === "main" ? "Menu" : backAct === "forge" ? "Forge" : backAct.startsWith("prep:") ? "Prep" : "Back";
    const nextGift = WAVE_UNLOCKS.find((w) => w.bestWave > (this.meta.bestWave | 0));
    const cash = BASE_START_CASH + (this.meta.startCashBonus | 0);
    const giftLine = nextGift
      ? `W${this.meta.bestWave || 0} · next gift W${nextGift.bestWave}: ${nextGift.label}`
      : `W${this.meta.bestWave || 0} · all wave gifts earned`;
    const tabs = TECH_TREES.map((tree) => {
      const active = this.techTreeTab === tree.id ? "active" : "";
      return `<button type="button" class="ttree-tab ${active}" data-act="tech-tab:${tree.id}">${tree.name}</button>`;
    }).join("");
    const tree = TECH_TREES.find((t) => t.id === this.techTreeTab) || TECH_TREES[0];
    const overlay = this.techSelectedId ? this._techOverlayHtml(this.techSelectedId) : "";
    this.ui.innerHTML = `
      <div class="screen tech-screen meta-screen meta-enter">
        <header class="tech-hero">
          <div class="tech-hero-row">
            <div>
              <h1>Tech Tree</h1>
            </div>
            <button class="btn secondary tech-back" data-act="${backAct}">${backLabel}</button>
          </div>
          <div class="title-stats tech-stats" aria-label="Currencies">
            <span><i>Æ</i>${this.meta.aether}</span>
            <span><i>Parts</i>${this.meta.forge}</span>
            <span><i>Lvl Cap</i>L${this.meta.levelCap}</span>
            <span><i>Slots</i>${this.meta.slotCount}</span>
            <span><i>Lives</i>${this.meta.startLives || 5}</span>
            <span><i>Start</i>${cash}</span>
          </div>
          <div class="status tech-status" id="status">${this.status}</div>
          <div class="ttree-tabs" role="tablist">${tabs}</div>
        </header>
        <div class="tech-body">
          ${this._techTreeHtml(tree)}
          <p class="tech-gift">${giftLine}</p>
        </div>
        ${overlay}
      </div>`;
    this.bindUi();
  }

  /** Flat list of purchasable nodes under a group (preserves child nesting). */
  _techCollectBuyables(node, out = []) {
    if (!node) return out;
    if (node.kind === "group" || node.kind === "root") {
      for (const c of node.children || []) this._techCollectBuyables(c, out);
      return out;
    }
    out.push(node);
    for (const c of node.children || []) this._techCollectBuyables(c, out);
    return out;
  }

  _techGroupProgress(group) {
    const nodes = this._techCollectBuyables(group);
    let ranks = 0;
    let max = 0;
    for (const n of nodes) {
      const def = getTechNode(n.id) || n;
      ranks += techRank(this.meta, def.id);
      max += def.maxRank | 0;
    }
    return { ranks, max, count: nodes.length };
  }

  _techTreeHtml(tree) {
    if (!tree) return "";
    const currency = tree.id === "arsenal" ? "Parts" : "Aether";
    const branches = (tree.children || [])
      .filter((c) => c.kind === "group")
      .map((g) => this._techBranchHtml(g))
      .join("");
    return `<div class="ttree" data-tree="${tree.id}">
      <p class="ttree-blurb">${tree.blurb || `Spend ${currency} on permanent upgrades`}</p>
      <div class="ttree-branches">${branches}</div>
    </div>`;
  }

  _techBranchHtml(group) {
    const { ranks, max } = this._techGroupProgress(group);
    const kids = (group.children || []).map((c) => this._techNodeWrapHtml(c)).join("");
    return `<section class="ttree-branch">
      <header class="ttree-branch-head">
        <h2>${group.name}</h2>
        <span>${ranks}/${max}</span>
      </header>
      <div class="ttree-children ttree-children--root">${kids}</div>
    </section>`;
  }

  _techNodeWrapHtml(node) {
    if (!node || node.kind === "group" || node.kind === "root") return "";
    const def = getTechNode(node.id) || node;
    const childHtml = (node.children || []).map((c) => this._techNodeWrapHtml(c)).join("");
    const kids =
      childHtml.length > 0
        ? `<div class="ttree-children">${childHtml}</div>`
        : "";
    return `<div class="ttree-node-wrap">${this._techNodeBtnHtml(def)}${kids}</div>`;
  }

  _techNodeBtnHtml(def) {
    const rank = techRank(this.meta, def.id);
    const maxed = rank >= def.maxRank;
    const prereq = techRequiresMet(this.meta, def);
    const partOk = techPartOwned(this.meta, def, ownsPart);
    const cost = techNextCost(def, rank);
    const costLabel = formatTechCost(cost);
    const selected = this.techSelectedId === def.id ? " selected" : "";
    let state = "open";
    if (maxed) state = "maxed";
    else if (!prereq) state = "locked";
    else if (!partOk) state = "need-part";
    else if (!canAffordTech(this.meta, cost)) state = "cant";

    let meta = "";
    if (maxed) {
      meta = def.maxRank > 1 ? `${rank}/${def.maxRank}` : "Owned";
    } else if (!prereq) {
      meta = "Locked";
    } else if (!partOk && def.requiresPart) {
      const pc = this._forgeCost(def.requiresPart.kind, def.requiresPart.id);
      meta = pc > 0 ? `${pc} Parts` : "Unlock";
    } else if (costLabel) {
      meta = def.maxRank > 1 ? `${rank}/${def.maxRank} · ${costLabel}` : costLabel;
    } else {
      meta = def.maxRank > 1 ? `${rank}/${def.maxRank}` : "—";
    }

    return `<button type="button" class="ttree-node ${state}${selected}" data-act="tech-select:${def.id}">
      <span class="ttree-node-name">${def.name}</span>
      <span class="ttree-node-meta">${meta}</span>
    </button>`;
  }

  setTechTreeTab(tabId) {
    if (!TECH_TREES.some((t) => t.id === tabId)) return;
    this.techTreeTab = tabId;
    this.techSelectedId = null;
    this.synth.play("ui");
    this.showUpgrade();
  }

  selectTechNode(id) {
    const def = getTechNode(id);
    if (def?.treeId) this.techTreeTab = def.treeId;
    this.techSelectedId = id;
    this.synth.play("ui");
    this.showUpgrade();
  }

  closeTechOverlay() {
    this.techSelectedId = null;
    this.showUpgrade();
  }

  _techOverlayHtml(id) {
    const def = getTechNode(id);
    if (!def) return "";
    const rank = techRank(this.meta, def.id);
    const maxed = rank >= def.maxRank;
    const prereq = techRequiresMet(this.meta, def);
    const partOk = techPartOwned(this.meta, def, ownsPart);
    const cost = techNextCost(def, rank);
    const costLabel = formatTechCost(cost);
    const treeName =
      TECH_TREES.find((t) => t.id === def.treeId)?.name || def.treeId || "Tech";

    let reqBits = [];
    if (def.requires?.length) {
      for (const rid of def.requires) {
        const rnode = getTechNode(rid);
        const ok = techRank(this.meta, rid) >= 1;
        reqBits.push(
          `<span class="tech-req ${ok ? "ok" : "missing"}">${rnode?.name || rid}</span>`
        );
      }
    }
    if (def.requiresPart) {
      const kind = def.requiresPart.kind || "part";
      const ok = partOk;
      const partCost = this._forgeCost(def.requiresPart.kind, def.requiresPart.id);
      reqBits.push(
        `<span class="tech-req ${ok ? "ok" : "missing"}">${
          ok
            ? `Own ${partLabel(def.requiresPart.id)} (${kind})`
            : `Needs ${partLabel(def.requiresPart.id)} · ${partCost > 0 ? `${partCost} Parts` : "free"}`
        }</span>`
      );
    }

    let action;
    if (maxed) {
      action = `<button class="btn secondary" disabled>Maxed</button>`;
    } else if (!prereq) {
      action = `<button class="btn secondary" disabled>Requires prior tech</button>`;
    } else if (!partOk && def.requiresPart) {
      const { kind, id: partId } = def.requiresPart;
      const partCost = this._forgeCost(kind, partId);
      const canBuyPart = (this.meta.forge | 0) >= partCost;
      const partLabelTxt = partLabel(partId);
      const unlockLabel =
        partCost > 0 ? `Unlock ${partLabelTxt} · ${partCost} Parts` : `Unlock ${partLabelTxt} · Free`;
      action = canBuyPart
        ? `<button class="btn title-cta" data-act="tech-unlock-part:${kind}:${partId}">${unlockLabel}</button>
           <p class="tech-sheet-next">Then buy mastery${costLabel ? ` · ${costLabel}` : ""}</p>`
        : `<button class="btn cant-afford" disabled>Need ${partCost} Parts for ${partLabelTxt}</button>`;
    } else if (!canAffordTech(this.meta, cost)) {
      action = `<button class="btn cant-afford" disabled>Need ${costLabel}</button>`;
    } else {
      action = `<button class="btn title-cta" data-act="tech-buy:${def.id}">Buy · ${costLabel}</button>`;
    }

    const rankLine =
      def.maxRank > 1
        ? `Rank ${rank} / ${def.maxRank}${maxed ? " · complete" : cost ? ` · next ${costLabel}` : ""}`
        : maxed
          ? "Unlocked"
          : cost
            ? `Locked · ${costLabel}`
            : "Locked";

    return `<div class="tech-overlay">
      <button type="button" class="tech-backdrop" data-act="tech-close" aria-label="Dismiss"></button>
      <div class="tech-sheet" role="dialog" aria-modal="true" aria-labelledby="tech-sheet-title">
        <button type="button" class="tech-sheet-x" data-act="tech-close" aria-label="Close">×</button>
        <p class="tech-sheet-mark">${treeName}</p>
        <h2 id="tech-sheet-title">${def.name}</h2>
        <p class="tech-sheet-blurb">${def.blurb || ""}</p>
        <p class="tech-sheet-rank">${rankLine}</p>
        ${
          reqBits.length
            ? `<div class="tech-sheet-reqs"><span class="k">Requires</span>${reqBits.join("")}</div>`
            : ""
        }
        <div class="tech-sheet-actions">${action}</div>
      </div>
    </div>`;
  }

  showEndlessHub() {
    this.screen = "hub";
    const canContinue = hasEndless();
    const blob = canContinue ? loadEndless() : null;
    const best = this.meta.bestWave | 0;
    const themes = endlessThemeBlurb();
    this.ui.innerHTML = `
      <div class="screen scroll meta-screen hub-screen meta-enter">
        <header class="meta-hero">
          <div class="meta-hero-row">
            <div>
              <h1>Endless</h1>
            </div>
            <button class="btn secondary tech-back" data-act="main">Menu</button>
          </div>
          <p class="meta-blurb">How far can the Bastion hold the Vein?</p>
        </header>
        <div class="hub-console">
          <div class="hub-card plate">
            <h3>Best wave</h3>
            <div class="hub-wave">${best || "—"}</div>
            <p class="end-note" style="text-align:left;margin-top:6px">${themes}</p>
            <div class="hub-stat-row title-stats">
              <span><i>Æ</i>${this.meta.aether}</span>
              <span><i>Parts</i>${this.meta.forge}</span>
            </div>
          </div>
          <div class="hub-card plate">
            <h3>${canContinue ? "Checkpoint" : "Ready"}</h3>
            <p style="text-align:left;color:var(--text);margin:0">
              ${
                canContinue
                  ? `Wave <strong>${blob.wave}</strong> · seed ${blob.seed >>> 0}`
                  : "No checkpoint. Start a run when your Forge is set."
              }
            </p>
          </div>
          <div class="hub-actions">
            <button class="btn title-cta" data-act="newrun">New Run</button>
            <button class="btn hub-continue" data-act="continue" ${canContinue ? "" : "disabled"}>Continue</button>
            <button class="btn" data-act="forge-from-hub">Forge</button>
          </div>
        </div>
      </div>`;
    this.bindUi();
  }

  showCampaign() {
    this.sim = null;
    this.selectedTowerId = -1;
    this.selectedWallId = -1;
    renderCampaign(this);
    this.bindUi();
    paintCampaignThumbs(this);
  }

  showPrep(levelId) {
    if (!renderPrep(this, levelId)) return this.showCampaign();
    this.bindUi();
    const thumb = this.ui.querySelector("canvas.prep-thumb");
    const lv = getCampaignLevel(levelId);
    if (thumb && lv) paintLevelThumb(thumb, lv, this.palette);
  }

  showEditor() {
    renderEditor(this);
    this.bindUi();
    const syncFields = () => {
      const ed = this.editor;
      if (!ed) return;
      ed.name = this.ui.querySelector("#edName")?.value || ed.name;
      ed.wavesToWin = +(this.ui.querySelector("#edWaves")?.value || ed.wavesToWin);
      ed.waveScript = this.ui.querySelector("#edScript")?.value || ed.waveScript;
    };
    this.ui.querySelector("#edName")?.addEventListener("change", syncFields);
    this.ui.querySelector("#edWaves")?.addEventListener("change", syncFields);
    this.ui.querySelector("#edScript")?.addEventListener("change", syncFields);
  }

  showVictory(opts = {}) {
    this.screen = "victory";
    const id = this.sim?.campaignLevelId | 0;
    const lv = getCampaignLevel(id);
    const gains = this.sim?.economy?.runWaveGains || { coin: 0, parts: 0, aether: 0 };
    const firstBonus = opts.firstClear ? 8 : 0;
    const next = CAMPAIGN_LEVELS.find((l) => l.id === id + 1);
    const nextOpen = next && isLevelUnlocked(next.id, this.meta.campaign?.cleared || []);
    const actions = `
      <div class="end-actions">
        ${
          nextOpen
            ? `<button class="btn title-cta" data-act="prep:${next.id}">Next · ${next.name}</button>`
            : ""
        }
        ${id > 0 ? `<button class="btn" data-act="start-level:${id}">Retry</button>` : ""}
        <button class="btn" data-act="forge-from-campaign">Forge</button>
        <button class="btn secondary" data-act="campaign">Campaign Menu</button>
        <button class="btn secondary" data-act="main">Main Menu</button>
      </div>`;
    this.ui.innerHTML = `
      <div class="screen end-screen meta-enter">
        <header class="end-hero">
          <h1 class="end-title">Clear</h1>
          <p class="end-sub">${lv ? lv.name : "Level"}</p>
          ${opts.firstClear ? `<span class="end-best-tag">First clear</span>` : ""}
        </header>
        <div class="end-card">
          <h3>Gains</h3>
          <div class="end-gains">
            <span class="gain-pill parts">+${gains.parts} Parts</span>
            <span class="gain-pill aether">+${gains.aether + firstBonus} Aether${
              firstBonus ? " · first" : ""
            }</span>
          </div>
        </div>
        <div class="end-card end-card-totals">
          <h3>Totals</h3>
          <div class="end-totals">
            <span class="chip parts"><span class="k">Parts</span>${this.meta.forge}</span>
            <span class="chip aether"><span class="k">Aether</span>${this.meta.aether}</span>
          </div>
        </div>
        ${actions}
      </div>`;
    this.bindUi();
  }

  showSettings() {
    renderSettings(this);
    this.bindUi();
    wireSettings(this);
  }

  showGameOver() {
    this.screen = "gameover";
    const endless = !!(this.sim && this.sim.modeEndless);
    const campaign = this.sim && !this.sim.modeEndless;
    const backAct = campaign ? "campaign" : "hub";
    const backLabel = campaign ? "Campaign Menu" : "Endless Menu";
    const lv = campaign ? getCampaignLevel(this.sim.campaignLevelId) : null;
    const wave = this.sim?.waveIndex ?? 0;
    const best = this.meta.bestWave | 0;
    const isBest = endless && wave > 0 && wave >= best;
    const gains = this.sim?.economy?.runWaveGains || { coin: 0, parts: 0, aether: 0 };
    const gainLine = (n, label, kind = "") =>
      `<span class="gain-pill ${kind}${n > 0 ? "" : " muted"}">${n > 0 ? "+" : ""}${n} ${label}</span>`;
    const seed = this.sim?.runSeed >>> 0;
    const actions = endless
      ? `<div class="end-actions">
          <button class="btn title-cta" data-act="newrun">New Run</button>
          <button class="btn" data-act="ghost-replay">Ghost Replay</button>
          <button class="btn" data-act="forge-from-hub">Forge</button>
          <button class="btn secondary" data-act="${backAct}">${backLabel}</button>
          <button class="btn secondary" data-act="main">Main Menu</button>
        </div>
        <p class="end-note">Seed ${seed || "—"}</p>`
      : `<div class="end-actions">
          ${
            lv
              ? `<button class="btn title-cta" data-act="start-level:${lv.id}">Retry · ${lv.name}</button>`
              : ""
          }
          <button class="btn" data-act="forge-from-campaign">Forge</button>
          <button class="btn" data-act="${backAct}">${backLabel}</button>
          <button class="btn secondary" data-act="main">Main Menu</button>
        </div>`;
    this.ui.innerHTML = `
      <div class="screen end-screen meta-enter${endless ? " end-endless" : ""}">
        <header class="end-hero">
          <h1 class="end-title">Fallen</h1>
          <p class="end-sub">${lv ? `${lv.name} · ` : ""}Wave</p>
          <div class="end-wave${isBest ? " is-best" : ""}">
            <span class="end-wave-num">${wave}</span>
            ${isBest ? `<span class="end-best-tag">Best</span>` : ""}
          </div>
          ${
            endless && best > 0 && !isBest
              ? `<p class="end-best-line">Best ${best}</p>`
              : ""
          }
        </header>
        <div class="end-card">
          <h3>Gains</h3>
          <div class="end-gains">
            ${gainLine(gains.parts, "Parts", "parts")}
            ${gainLine(gains.aether, "Aether", "aether")}
          </div>
        </div>
        <div class="end-card end-card-totals">
          <h3>Vault</h3>
          <div class="end-totals">
            <span class="chip parts"><span class="k">Parts</span>${this.meta.forge}</span>
            <span class="chip aether"><span class="k">Aether</span>${this.meta.aether}</span>
            <span class="chip wave"><span class="k">Best</span>W${best}</span>
          </div>
        </div>
        ${actions}
      </div>`;
    this.bindUi();
  }

  bindUi() {
    this.ui.querySelectorAll("[data-act]").forEach((el) => {
      el.addEventListener("click", () => {
        const act = el.getAttribute("data-act");
        if (act === "endless" || act === "hub") this.showEndlessHub();
        else if (act === "main") this.showMain();
        else if (act === "campaign") this.showCampaign();
        else if (act?.startsWith("prep:")) this.showPrep(+act.slice(5));
        else if (act?.startsWith("prep-slot:")) {
          this.prepSlot = +act.slice(10) | 0;
          if (this.screen === "prep" && this.prepLevelId) this.showPrep(this.prepLevelId);
        }
        else if (act?.startsWith("start-level:")) this.startCampaignLevel(+act.slice(12));
        else if (act?.startsWith("campaign-level:")) this.showPrep(+act.slice(15));
        else if (act === "editor") this.showEditor();
        else if (act === "ed-apply-size") {
          const c = +(this.ui.querySelector("#edCols")?.value || 8);
          const r = +(this.ui.querySelector("#edRows")?.value || 8);
          this.editor?.resize(c, r);
          this.showEditor();
        } else if (act === "ed-random") {
          this.editor?.randomize(10);
          this.showEditor();
        } else if (act === "ed-save") {
          this.editor.name = this.ui.querySelector("#edName")?.value || "Custom";
          this.editor.wavesToWin = +(this.ui.querySelector("#edWaves")?.value || 5);
          this.editor.waveScript = this.ui.querySelector("#edScript")?.value || "mixed_mid";
          this.editor.saveNamed();
          this.toast("Level saved locally");
          this.showEditor();
        } else if (act === "ed-playtest") {
          this.editor.name = this.ui.querySelector("#edName")?.value || "Custom";
          this.editor.wavesToWin = +(this.ui.querySelector("#edWaves")?.value || 5);
          this.editor.waveScript = this.ui.querySelector("#edScript")?.value || "mixed_mid";
          this.playtestEditorLevel(this.editor.toLevelDef());
        } else if (act?.startsWith("ed-load:")) {
          const list = loadEditorLevels();
          const lv = list[+act.slice(8)];
          if (lv) this.playtestEditorLevel(lv);
        } else if (act?.startsWith("ed-cell:")) {
          const [, xs, ys] = act.split(":");
          if (!this.editor.toggle(+xs, +ys)) this.toast("Would seal the path");
          this.showEditor();
        } else if (act === "compose-toggle") this.toggleLiveCompose();
        else if (act === "compose-close") {
          this.liveCompose = false;
          this.renderGameChrome();
        } else if (act?.startsWith("compose-part:")) {
          const [, kind, id] = act.split(":");
          this.applyLiveComposePart(kind, id);
        } else if (act === "ghost-replay") this.startGhostReplay();
        else if (act === "forge") this.showForge(this.forgeReturn || "main");
        else if (act === "forge-from-hub") this.showForge("hub");
        else if (act === "forge-from-main") this.showForge("main");
        else if (act === "forge-from-campaign") this.showForge("campaign");
        else if (act === "forge-from-prep") this.showForge("prep");
        else if (act === "upgrade-from-prep") this.showUpgrade("prep");
        else if (act === "upgrade") {
          const from =
            this.screen === "main"
              ? "main"
              : this.screen === "forge"
                ? "forge"
                : this.screen === "prep"
                  ? "prep"
                  : this.screen === "hub"
                    ? "hub"
                    : this.screen === "campaign"
                      ? "campaign"
                      : this.forgeReturn || "forge";
          this.showUpgrade(from);
        } else if (act === "tech-close") this.closeTechOverlay();
        else if (act?.startsWith("tech-tab:")) this.setTechTreeTab(act.slice(9));
        else if (act?.startsWith("tech-select:")) this.selectTechNode(act.slice(12));
        else if (act?.startsWith("tech-unlock-part:")) {
          const [, kind, id] = act.split(":");
          this.unlockPartFromTech(kind, id);
        } else if (act?.startsWith("tech-buy:")) this.buyTechNode(act.slice(9));
        else if (act?.startsWith("tech:")) this.buyTechNode(act.slice(5));
        else if (act === "settings") this.showSettings();
        else if (act === "newrun") this.newRun();
        else if (act === "continue") this.continueRun();
        else if (act === "pause") this.openPause();
        else if (act === "resume") this.resumeGame();
        else if (act === "quit-run") this.quitToMenu();
        else if (act === "sell") this.sellSelected();
        else if (act === "tool:wall") {
          this.tool = "wall";
          this.clearPlaceConfirm();
          this.selectedTowerId = -1;
          this.selectedWallId = -1;
          this.renderGameChrome();
        } else if (act === "forge-clear") this.clearForgeSlot();
        else if (act?.startsWith("forge-slot:")) {
          const i = +act.slice(11);
          if (i < 0 || i >= (this.meta.slotCount | 0)) {
            this.toast(`Unlock Slot ${i + 1} in Tech Tree → Roster`);
            return;
          }
          this.forgeSlot = i;
          this.showForge();
        } else if (act?.startsWith("forge-part:")) {
          const [, kind, id] = act.split(":");
          this.applyForgePart(kind, id);
        } else if (act?.startsWith("buy:")) {
          const [, kind, id] = act.split(":");
          this.buyPart(kind, id);
        } else if (act?.startsWith("slot-locked:")) {
          const n = (+act.slice(12) | 0) + 1;
          this.toast(`Unlock Slot ${n} in Tech Tree → Roster`);
        } else if (act?.startsWith("slot:")) {
          const i = +act.slice(5);
          const unlocked = this.meta.slotCount | 0;
          if (!this.sim || i < 0 || i >= unlocked) {
            this.toast(`Unlock Slot ${i + 1} in Tech Tree → Roster`);
            return;
          }
          // Keep sim loadouts aligned with Forge before selecting/placing.
          if ((this.sim.roster?.length | 0) < unlocked) this._syncSimFromMeta(this.sim);
          this.slot = i;
          this.tool = "tower";
          this.clearPlaceConfirm();
          this.selectedTowerId = -1;
          this.selectedWallId = -1;
          this.renderGameChrome();
        }
      });
    });
  }

  /**
   * Apply permanent tech + Forge loadouts to a live sim.
   * `battleBase` only for fresh runs — continue keeps checkpoint Coin.
   */
  _applyRunTech(sim, { battleBase } = {}) {
    if (battleBase != null) {
      sim.economy.battle = (battleBase | 0) + (this.meta.startCashBonus | 0);
    }
    // Fresh run: seed vault currencies + refill lives from tech.
    this._syncSimFromMeta(sim, { seedVault: true, resetLives: true });
  }

  /**
   * Push Forge loadouts + derived combat/economy mods into the sim.
   * Does NOT touch Coin/lives unless explicitly asked — those belong to the run/checkpoint.
   */
  _syncSimFromMeta(sim, { seedVault = false, resetLives = false } = {}) {
    if (!sim) return;
    syncTechDerived(this.meta);
    this.meta.roster = normalizeRoster(
      this.meta.roster,
      this.meta.slotCount,
      this.meta.levelCap
    );
    sim.setStartLives(this.meta.startLives || 5, { resetCurrent: resetLives });
    if (seedVault) {
      sim.economy.injectMeta(this.meta.forge, this.meta.aether);
    }
    sim.economy.applyRunMods({
      wallCostMult: this.meta.wallCostMult ?? 1,
      towerCostMult: this.meta.towerCostMult ?? 1,
      waveCoinBonus: this.meta.waveCoinBonus | 0,
    });
    sim.setRoster(structuredClone(this.meta.roster));
    sim.runLevelCap = this.meta.levelCap | 0 || 2;
    for (const t of sim.towers || []) {
      t.levelCap = Math.max(t.levelCap | 0, sim.runLevelCap);
    }
    sim.setPartUpgrades(this.meta.partUpgrades);
    sim.setGlobalMods({
      damage: this.meta.globalDamageMult ?? 1,
      range: this.meta.globalRangeMult ?? 1,
      rof: this.meta.globalRofMult ?? 1,
    });
  }

  newRun(seed, { skipConfirm = false } = {}) {
    if (!skipConfirm && hasEndless()) {
      if (!confirm("Overwrite endless checkpoint?")) return;
    }
    clearEndless();
    const runSeed = (seed >>> 0) || ((Math.random() * 0xffffffff) | 1);
    this.sim = new SimWorld();
    this.sim.setup(ENDLESS_GRID.cols, ENDLESS_GRID.rows, runSeed, true);
    this.sim.runSeed = runSeed;
    this._applyRunTech(this.sim, { battleBase: BASE_START_CASH });
    this.fx.clear();
    this._ghost = null;
    this.wireSim();
    this.tool = "tower";
    this.slot = 0;
    this.selectedTowerId = -1;
    this.selectedWallId = -1;
    this.paused = false;
    this.speed = 1;
    this.accum = 0;
    this.placeConfirm = null;
    this.liveCompose = false;
    this.playtestFromEditor = false;
    this.board.resetPan();
    this.board.setAtmosphere?.("default");
    this.palette.setAtmosphere?.("default");
    this.board.handOffZoom?.(0.9);
    this.enterGame();
    this.toast(`Seed ${runSeed >>> 0}`);
  }

  continueRun() {
    const blob = loadEndless();
    if (!blob) return this.showEndlessHub();
    this.sim = new SimWorld();
    this.sim.loadCheckpoint(blob);
    // Checkpoint is written at wave *start* after waveIndex increments.
    // Roll back one so Call Wave starts that same wave again (mid-wave progress is lost).
    const savedWave = blob.wave | 0;
    if (savedWave > 0) this.sim.waveIndex = savedWave - 1;
    // Loadouts/caps/mods from meta; keep checkpoint Coin + lives.
    this._syncSimFromMeta(this.sim);
    this.fx.clear();
    this.wireSim();
    this.tool = "tower";
    this.slot = 0;
    this.selectedTowerId = -1;
    this.selectedWallId = -1;
    this.paused = false;
    this.speed = 1;
    this.accum = 0;
    this.placeConfirm = null;
    this.board.resetPan();
    this.enterGame();
    this.toast(`Checkpoint loaded — Call Wave ${savedWave || 1}`);
  }

  startCampaignLevel(levelId) {
    const lv = getCampaignLevel(levelId);
    if (!lv) return;
    if (!isLevelUnlocked(levelId, this.meta.campaign?.cleared || [])) {
      this.toast("Clear the previous level first");
      return;
    }
    this.playtestFromEditor = false;
    this._bootLevel(lv);
    const slot = Math.max(0, Math.min(this.prepSlot | 0, (this.meta.slotCount | 0) - 1));
    this.slot = slot;
    this.board.setAtmosphere?.(lv.atmosphere || `campaign_${lv.id}`);
    this.palette.setAtmosphere?.(lv.atmosphere || `campaign_${lv.id}`);
    this.toast(`${lv.name}: portal locked. Call Wave 1 when ready.`);
  }

  playtestEditorLevel(lv) {
    if (!lv) return;
    this.playtestFromEditor = true;
    this._bootLevel({ ...lv, id: 0 });
    this.toast(`Playtest · ${lv.name}`);
  }

  _bootLevel(lv) {
    this.sim = new SimWorld();
    this.sim.setup(lv.cols, lv.rows, lv.seed || 1, false);
    this.sim.runSeed = (lv.seed || 1) >>> 0;
    this.sim.campaignLevelId = lv.id || 0;
    this.sim.wavesToWin = lv.wavesToWin;
    // Prefer authored `waves`; migrate legacy editor `waveScripts` pack ids.
    this.sim.campaignWaves =
      lv.waves ||
      (Array.isArray(lv.waveScripts)
        ? lv.waveScripts.map((pack) => ({ pack, spawnGap: 0.4 }))
        : null);
    this._applyRunTech(this.sim, { battleBase: lv.coinGrant || BASE_START_CASH });
    this.sim.applyPreWalls(lv.preWalls || []);
    this.fx.clear();
    this._ghost = null;
    this.wireSim();
    this.tool = "tower";
    this.slot = 0;
    this.selectedTowerId = -1;
    this.selectedWallId = -1;
    this.paused = false;
    this.speed = 1;
    this.accum = 0;
    this.placeConfirm = null;
    this.liveCompose = false;
    this.board.resetPan();
    this.board.handOffZoom?.(0.85);
    this.enterGame();
  }

  wireSim() {
    this.sim.on("*", (e) => this.onSimEvent(e));
    this.board.setSim(this.sim);
  }

  enterGame() {
    this.screen = "game";
    if (this.sim && this.slot >= this.sim.roster.length) this.slot = 0;
    this.clearPlaceConfirm();
    this.score.setWave(this.sim?.waveIndex || 1);
    this.score.setSpeed(this.speed || 1);
    this.score.setEnabled(this.meta.settings?.music !== false);
    this.score.start();
    this.renderGameChrome();
    if (this.sim?.modeEndless) {
      this.toast("Build, then Deploy. Hold for 5×.");
    }
  }

  /** Always show S1–S6; locked slots stay visible until Roster tech unlocks them. */
  /** Live place quote for a roster index (game only). */
  _gameSlotQuote(i) {
    const s = this.sim?.roster?.[i];
    if (!s?.complete) {
      return {
        complete: false,
        btnLabel: `S${i + 1} · —`,
        costLabel: "—",
        tip: "incomplete — set in Forge",
        total: 0,
        surcharge: 0,
        base: 0,
        loadout: s || null,
      };
    }
    const q = this.sim.economy.quoteTowerPlace(s.placeCost, this.sim.towers.length);
    return {
      complete: true,
      btnLabel: `S${i + 1} · ${q.total}`,
      costLabel: `${q.total}`,
      tip: `${s.base}/${s.barrel}/${s.payload}${q.surcharge ? ` (+${q.surcharge} tax)` : ""}`,
      total: q.total,
      surcharge: q.surcharge,
      base: q.base,
      loadout: s,
    };
  }

  _rosterSlotButtons(mode) {
    const unlocked = Math.max(
      0,
      Math.min(MAX_ROSTER_SLOTS, this.meta.slotCount | 0)
    );
    const roster = mode === "game" ? this.sim?.roster || [] : this.meta.roster || [];
    const bits = [];
    for (let i = 0; i < MAX_ROSTER_SLOTS; i++) {
      if (i >= unlocked) {
        if (mode === "game") {
          bits.push(
            `<button type="button" class="slot-tile locked" data-act="slot-locked:${i}" title="Unlock Slot ${
              i + 1
            } in Tech Tree → Roster"><span class="slot-tile-idx">${i + 1}</span><span class="slot-tile-cost">lock</span></button>`
          );
        } else {
          bits.push(
            `<button type="button" class="btn slot-locked" data-act="slot-locked:${i}" title="Unlock Slot ${
              i + 1
            } in Tech Tree → Roster">S${i + 1}</button>`
          );
        }
        continue;
      }
      const s = roster[i] || makeSlot("", "", "", this.meta.levelCap);
      if (mode === "forge") {
        const active = i === this.forgeSlot ? "active" : "";
        const mark = s.complete ? s.placeCost : "—";
        bits.push(
          `<button type="button" class="btn ${active}" data-act="forge-slot:${i}">S${i + 1} · ${mark}</button>`
        );
      } else {
        const active = this.tool === "tower" && i === this.slot ? "active" : "";
        const q = this._gameSlotQuote(i);
        const empty = q.complete ? "" : " empty";
        bits.push(
          `<button type="button" class="slot-tile ${active}${empty}" data-act="slot:${i}" data-build-slot="${i}" title="${q.tip}"><span class="slot-tile-idx">${i + 1}</span><canvas class="slot-preview" data-slot-preview="${i}" width="72" height="72" aria-hidden="true"></canvas><span class="slot-tile-cost">${q.costLabel}</span></button>`
        );
      }
    }
    return bits.join("");
  }

  waveBusy() {
    if (!this.sim) return false;
    return !!(this.sim.waves.waveActive || this.sim.enemies.length);
  }

  renderGameChrome() {
    if (!this.sim) return;
    const buildBtns = this._rosterSlotButtons("game");
    const pitch = Math.round(this.meta.settings?.cameraPitch ?? VIEW25.pitchDeg);
    const endless = !!this.sim.modeEndless;
    const composeBtn = endless
      ? `<button type="button" class="chrome-fab compose-fab plate" data-act="compose-toggle" title="Live compose" aria-label="Live compose">
          <svg class="fab-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path class="fab-ico-body" d="M5 7.5h5.2l1.3-2.2h1l1.3 2.2H19v2.2h-1.6l-2.2 7.1H8.8L6.6 9.7H5V7.5z"/>
            <path class="fab-ico-accent" d="M9.2 11.2h5.6l-.7 2.4H9.9l-.7-2.4z"/>
            <circle class="fab-ico-rivet" cx="8.2" cy="8.6" r="0.7"/>
            <circle class="fab-ico-rivet" cx="15.8" cy="8.6" r="0.7"/>
          </svg>
        </button>`
      : "";
    const composeSheet = endless && this.liveCompose ? this._liveComposeHtml() : "";
    this.ui.innerHTML = `
      <div class="game-chrome">
        <header class="hud-bar">
          <div class="wave-badge plate" id="waveBadge">
            <span class="wave-badge-k">Wave</span>
            <span class="wave-badge-n" id="waveNum">0</span>
            <span class="wave-badge-sub hidden" id="waveSub"></span>
            <span class="theme-chip hidden" id="themeChip"></span>
          </div>
          <div class="telemetry plate" id="statChips"></div>
          <div class="hud-ops">
            <button type="button" class="hud-pause plate" data-act="pause" title="Pause" aria-label="Pause">
              <span></span><span></span>
            </button>
          </div>
        </header>
        <aside class="cam-rail plate" title="Camera pitch">
          <span class="cam-rail-label">Ang</span>
          <input id="pitchLive" class="cam-pitch" type="range" min="8" max="58" step="1" value="${pitch}" orient="vertical" aria-label="Camera angle" />
          <span class="cam-rail-val" id="pitchLiveVal">${pitch}°</span>
        </aside>
        ${composeBtn}
        ${composeSheet}
        <div class="status-toast ${this.status ? "" : "empty"}" id="status">${this.status}</div>
        <div class="tower-overlay hidden" id="towerOverlay">
          <div class="meta" id="towerMeta"></div>
          <div class="xp-line" id="towerXp"></div>
          <button class="btn danger" data-act="sell">Sell</button>
        </div>
        <footer class="dock">
          <div class="dock-head">
            <div class="dock-meta" id="slotline"></div>
          </div>
          <div class="arsenal">
            <div class="arsenal-slots">${buildBtns}</div>
            <button type="button" class="wall-tile ${this.tool === "wall" ? "active" : ""}" data-act="tool:wall" id="wallBtn" title="Place wall">
              <span class="wall-tile-k">Wall</span>
              <span class="wall-tile-cost" id="wallCost">—</span>
            </button>
          </div>
          <button type="button" class="call-btn" id="callBtn" title="Tap to deploy · hold for 5×" aria-label="Deploy wave, hold for fast forward">
            <span class="call-kicker">Deploy</span>
            <span class="call-label" id="callLabel">Wave 1</span>
            <span class="call-bolts" aria-hidden="true"></span>
          </button>
        </footer>
      </div>`;
    this.bindUi();
    this._bindCallButton(this.ui.querySelector("#callBtn"));
    this.ui.querySelector("#pitchLive")?.addEventListener("input", (e) => {
      this.applyPitch(+e.target.value);
    });
    this.refreshHud();
    this.paintSlotPreviews();
    if (this.paused) this._renderPauseSheet();
  }

  _liveComposeHtml() {
    const slot = this.meta.roster[this.slot] || makeSlot();
    const partBtn = (kind, id) => {
      const have = ownsPart(this.meta.owned, kind, id);
      if (!have) return "";
      const eq = slot[kind] === id ? " equipped" : "";
      return `<button class="btn part-btn part-chip${eq}" data-act="compose-part:${kind}:${id}">${partLabel(id)}</button>`;
    };
    return `
      <div class="compose-sheet plate" id="composeSheet">
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:4px">
          <h3>Live Compose · Slot ${this.slot + 1}</h3>
          <button class="btn secondary part-chip" data-act="compose-close">Close</button>
        </div>
        <p style="margin:0 0 6px;font-size:0.72rem;color:#9aacbe">${forgePlanSummary(slot)}</p>
        <div class="compose-cols">
          <div><h4 style="margin:0 0 4px;font-size:0.65rem">Base</h4>${Object.keys(PARTS.bases).map((id) => partBtn("base", id)).join("")}</div>
          <div><h4 style="margin:0 0 4px;font-size:0.65rem">Barrel</h4>${Object.keys(PARTS.barrels).map((id) => partBtn("barrel", id)).join("")}</div>
          <div><h4 style="margin:0 0 4px;font-size:0.65rem">Payload</h4>${Object.keys(PARTS.payloads).map((id) => partBtn("payload", id)).join("")}</div>
        </div>
      </div>`;
  }

  toggleLiveCompose() {
    if (!this.sim?.modeEndless) return;
    this.liveCompose = !this.liveCompose;
    this.renderGameChrome();
  }

  applyLiveComposePart(kind, id) {
    if (!this.sim?.modeEndless) return;
    if (!ownsPart(this.meta.owned, kind, id)) return;
    const s = this.meta.roster[this.slot] || makeSlot("", "", "", this.meta.levelCap);
    s[kind] = id;
    this.meta.roster[this.slot] = makeSlot(s.base, s.barrel, s.payload, this.meta.levelCap);
    this.persistMeta();
    this._syncSimFromMeta(this.sim);
    this.synth.play("ui");
    this.renderGameChrome();
  }

  startGhostReplay() {
    const blob = this._lastReplay;
    if (!blob?.actionLog?.length) {
      this.toast("No replay log from last run");
      return;
    }
    this.newRun(blob.runSeed, { skipConfirm: true });
    if (!this.sim) return;
    // Ghost owns the action log — clear live log so we don't double-record
    this.sim.actionLog = [];
    this._ghost = { log: blob.actionLog, i: 0, wait: 0.45 };
    this.toast("Ghost replay");
  }

  _tickGhost(dt) {
    const g = this._ghost;
    if (!g || !this.sim || this.paused) return;
    g.wait -= dt;
    if (g.wait > 0) return;
    if (g.i >= g.log.length) {
      this._ghost = null;
      this.toast("Ghost replay finished");
      return;
    }
    // Wait for waves to clear before next call
    const act = g.log[g.i];
    if (act.type === "call" && this.waveBusy()) return;
    applyReplayAction(this.sim, act);
    g.i += 1;
    g.wait = act.type === "call" ? 0.2 : 0.15;
    this.refreshHud();
  }

  /** Tiny rotating loadout previews inside arsenal slot tiles. */
  paintSlotPreviews() {
    if (this.screen !== "game" || !this.sim) return;
    const aim = this.slotPreviewAim || -Math.PI / 2;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const css = 40;
    for (let i = 0; i < MAX_ROSTER_SLOTS; i++) {
      const canvas = this.ui.querySelector(`[data-slot-preview="${i}"]`);
      if (!canvas) continue;
      const ctx = canvas.getContext("2d");
      if (canvas.width !== Math.floor(css * dpr)) {
        canvas.width = Math.floor(css * dpr);
        canvas.height = Math.floor(css * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, css, css);

      const slot = this.sim.roster?.[i];
      if (!slot?.complete) {
        ctx.fillStyle = "rgba(120,130,145,0.35)";
        ctx.beginPath();
        ctx.arc(css / 2, css / 2, 8, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      const t = {
        base: slot.base,
        barrel: slot.barrel,
        payload: slot.payload,
        aimAngle: aim + i * 0.35,
        level: 1,
      };
      const size = 34;
      const px = (css - size) / 2;
      const py = (css - size) / 2 + 1;
      ctx.save();
      ctx.translate(css / 2, css / 2);
      ctx.scale(1, VIEW25.yScale);
      ctx.translate(-css / 2, -css / 2);
      drawComposedTower(ctx, this.palette, t, px, py, size, false, { showBadge: false });
      ctx.restore();
    }
  }

  /**
   * Live HUD sync — currencies, build-strip prices, call button, tower card.
   * Structure comes from renderGameChrome; prices always refresh here.
   */
  refreshHud() {
    if (!this.sim || this.screen !== "game") return;
    const chips = this.ui.querySelector("#statChips");
    const st = this.ui.querySelector("#status");
    const callBtn = this.ui.querySelector("#callBtn");
    const callLabel = this.ui.querySelector("#callLabel");
    const callKicker = this.ui.querySelector(".call-kicker");
    const waveNum = this.ui.querySelector("#waveNum");
    const waveSub = this.ui.querySelector("#waveSub");
    if (!chips) return;

    const waveLabel = !this.sim.modeEndless && this.sim.wavesToWin
      ? `${this.sim.waveIndex}/${this.sim.wavesToWin}`
      : `${this.sim.waveIndex}`;
    if (waveNum) waveNum.textContent = waveLabel;
    if (waveSub) {
      if (!this.sim.modeEndless) {
        waveSub.textContent = `Lv ${this.sim.campaignLevelId}`;
        waveSub.classList.remove("hidden");
      } else {
        waveSub.textContent = "";
        waveSub.classList.add("hidden");
      }
    }
    this._refreshThemeChip(this.sim.waves?.lastTheme, this.sim.waves?.lastEvent);

    const gear = `<svg class="tel-ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.4.9h3.2l.25 1.45c.45.12.87.32 1.25.58l1.3-.7 1.6 1.6-.7 1.3c.26.38.46.8.58 1.25L15.1 6.4v3.2l-1.45.25a4.6 4.6 0 0 1-.58 1.25l.7 1.3-1.6 1.6-1.3-.7a4.6 4.6 0 0 1-1.25.58L9.6 15.1H6.4l-.25-1.45a4.6 4.6 0 0 1-1.25-.58l-1.3.7-1.6-1.6.7-1.3a4.6 4.6 0 0 1-.58-1.25L.9 9.6V6.4l1.45-.25c.12-.45.32-.87.58-1.25l-.7-1.3 1.6-1.6 1.3.7c.38-.26.8-.46 1.25-.58L6.4.9zm1.6 4.3a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z"/></svg>`;
    chips.innerHTML = `
      <span class="tel tel-lives" title="Lives"><i>HP</i>${this.sim.lives}</span>
      <span class="tel-sep"></span>
      <span class="tel tel-coin" title="Coin"><i class="tel-curr">₡</i>${this.sim.economy.battle}</span>
      <span class="tel-sep"></span>
      <span class="tel tel-parts" title="Parts"><i class="tel-gear">${gear}</i>${this.sim.economy.forge}</span>
      <span class="tel-sep"></span>
      <span class="tel tel-aether" title="Aether"><i>Æ</i>${this.sim.economy.aether}</span>`;
    if (st) {
      st.textContent = this.status;
      st.classList.toggle("empty", !this.status);
    }

    this._syncBuildDock();

    if (callBtn) {
      const busy = this.waveBusy();
      const done =
        !this.sim.modeEndless &&
        this.sim.wavesToWin > 0 &&
        this.sim.waveIndex >= this.sim.wavesToWin;
      // Stay clickable while busy so hold-to-5× works; only lock when level is done.
      callBtn.disabled = done;
      callBtn.classList.toggle("busy", busy && !this._ffHeld);
      callBtn.classList.toggle("hot", !!this._ffHeld);
      callBtn.title = done
        ? "Complete"
        : busy || this._ffHeld
          ? "Hold for 5×"
          : "Tap to deploy · hold for 5×";
      if (callKicker) {
        callKicker.textContent = this._ffHeld ? "5×" : done ? "Done" : busy ? "Hold" : "Deploy";
      }
      if (callLabel) {
        callLabel.textContent = this._ffHeld
          ? "Speed"
          : busy
            ? "Live"
            : done
              ? "Clear"
              : `Wave ${this.sim.waveIndex + 1}`;
      }
    }
    this.syncTowerOverlay();
  }

  _refreshThemeChip(theme, event) {
    const chip = this.ui?.querySelector("#themeChip");
    if (!chip) return;
    const label = event || (theme && theme !== "campaign" ? theme : "");
    if (!label) {
      chip.textContent = "";
      chip.classList.add("hidden");
      return;
    }
    chip.textContent = String(label).replace(/_/g, " ");
    chip.classList.remove("hidden");
  }

  /** Update slot/wall prices + dock meta from current economy state. */
  _syncBuildDock() {
    if (!this.sim) return;
    for (let i = 0; i < MAX_ROSTER_SLOTS; i++) {
      const btn = this.ui.querySelector(`[data-build-slot="${i}"]`);
      if (!btn) continue;
      const q = this._gameSlotQuote(i);
      const costEl = btn.querySelector(".slot-tile-cost");
      if (costEl) costEl.textContent = q.costLabel;
      btn.title = q.tip;
      btn.classList.toggle("active", this.tool === "tower" && i === this.slot);
      btn.classList.toggle("empty", !q.complete);
    }
    const wallCost = this.sim.economy.wallCost(this.sim.playerWallCount());
    const wallBtn = this.ui.querySelector("#wallBtn");
    const wallCostEl = this.ui.querySelector("#wallCost");
    if (wallCostEl) wallCostEl.textContent = `${wallCost}`;
    if (wallBtn) {
      wallBtn.classList.toggle("active", this.tool === "wall");
      wallBtn.title = `Wall · ${wallCost} Coin`;
    }

    const slotLine = this.ui.querySelector("#slotline");
    if (!slotLine) return;
    if (this.tool === "wall") {
      slotLine.innerHTML = `<span class="dock-meta-k">Wall</span><span class="dock-meta-v">${wallCost} Coin</span>`;
      return;
    }
    const q = this._gameSlotQuote(this.slot);
    if (!q.complete) {
      slotLine.innerHTML = `<span class="dock-meta-k">Slot ${this.slot + 1}</span><span class="dock-meta-v warn">Set loadout in Forge</span>`;
      return;
    }
    const s = q.loadout;
    const tax = q.surcharge ? ` · +${q.surcharge} tax` : "";
    slotLine.innerHTML = `<span class="dock-meta-k">${partLabel(s.base)} · ${partLabel(s.barrel)} · ${partLabel(s.payload)}</span><span class="dock-meta-v">${q.total} Coin${tax}</span>`;
  }

  syncTowerOverlay() {
    const overlay = this.ui.querySelector("#towerOverlay");
    const meta = this.ui.querySelector("#towerMeta");
    const xpEl = this.ui.querySelector("#towerXp");
    if (!overlay || !this.sim) return;

    const t = this.sim.towers.find((x) => x.id === this.selectedTowerId);
    const wall =
      this.selectedWallId >= 0
        ? this.sim.walls.find((w) => w.id === this.selectedWallId)
        : null;

    if (!t && !wall) {
      overlay.classList.add("hidden");
      return;
    }

    overlay.classList.remove("hidden");
    const cell = t ? t.cell : wall.cell;
    if (t) {
      const cap = t.levelCap || 1;
      const need = t.xpToPoint || 55;
      const atCap = (t.level || 1) >= cap;
      if (meta) {
        const doc = doctrineLabel(PARTS.bases[t.base]?.doctrine);
        meta.textContent = `${partLabel(t.base)} · ${doc} · L${t.level}/${cap}`;
      }
      if (xpEl) {
        xpEl.textContent = atCap
          ? "Max level"
          : `XP ${t.xp | 0}/${need} · auto levels`;
      }
    } else {
      const refund = (wall.paid * 0.5) | 0;
      if (meta) meta.textContent = "Wall";
      if (xpEl) xpEl.textContent = `Sell for ${refund} Coin`;
    }

    const c = this.board.cellScreenCenter(cell.x, cell.y);
    const pad = 8;
    const w = overlay.offsetWidth || 148;
    const h = overlay.offsetHeight || 96;
    const appW = this.ui.clientWidth || 360;
    const appH = this.ui.clientHeight || 640;
    let left = c.x;
    left = Math.max(pad + w / 2, Math.min(appW - pad - w / 2, left));
    let top = c.y - this.board.cell * 0.55;
    top = Math.max(pad + h, Math.min(appH - pad, top));
    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
  }

  toast(msg) {
    this.status = msg;
    const st = this.ui.querySelector("#status");
    if (st) st.textContent = msg;
    this.synth.play("ui", 1);
  }

  onCellTap(cell) {
    if (!this.sim) return;
    const tower = this.sim.towers.find((t) => t.cell.x === cell.x && t.cell.y === cell.y);
    if (tower) {
      this.clearPlaceConfirm();
      this.selectedTowerId = tower.id;
      this.selectedWallId = -1;
      this.renderGameChrome();
      return;
    }
    const wall = this.sim.walls.find(
      (w) => !w.preplaced && w.cell.x === cell.x && w.cell.y === cell.y
    );
    if (wall) {
      this.clearPlaceConfirm();
      this.selectedTowerId = -1;
      this.selectedWallId = wall.id;
      this.renderGameChrome();
      return;
    }
    this.selectedTowerId = -1;
    this.selectedWallId = -1;
    this.syncTowerOverlay();
    if (this.tool === "wall") {
      this.clearPlaceConfirm();
      this.handlePlace(this.sim.tryPlaceWall(cell.x, cell.y), "Wall");
      return;
    }
    // Second click on the same cell confirms; another cell re-aims the ghost.
    if (
      this.placeConfirm &&
      this.placeConfirm.x === cell.x &&
      this.placeConfirm.y === cell.y &&
      this.placeConfirm.slot === this.slot
    ) {
      this.confirmPlaceTower();
      return;
    }
    this.beginPlaceConfirm(cell.x, cell.y);
  }

  beginPlaceConfirm(x, y) {
    if (!this.sim) return;
    // Forge edits live in meta — keep the placing loadout current.
    if ((this.sim.roster?.length | 0) !== (this.meta.slotCount | 0)) {
      this._syncSimFromMeta(this.sim);
    } else {
      const metaSlot = this.meta.roster?.[this.slot];
      const simSlot = this.sim.roster?.[this.slot];
      if (
        metaSlot &&
        simSlot &&
        (metaSlot.base !== simSlot.base ||
          metaSlot.barrel !== simSlot.barrel ||
          metaSlot.payload !== simSlot.payload ||
          (metaSlot.levelCap | 0) !== (simSlot.levelCap | 0))
      ) {
        this._syncSimFromMeta(this.sim);
      }
    }
    const loadout = this.sim.roster[this.slot];
    if (!loadout?.complete) return this.toast("Compose a full triad in Forge first");
    if (!this.sim.grid.isBuildable(x, y)) return this.toast("Cell blocked");

    this.sim.grid.setBlocked(x, y, true);
    const pathOk = this.sim.grid.hasGroundPath();
    this.sim.grid.setBlocked(x, y, false);
    this.sim.grid.recompute();
    if (!pathOk) return this.toast("Can't seal the path");

    const quote = this.sim.economy.quoteTowerPlace(loadout.placeCost, this.sim.towers.length);
    if (this.sim.economy.battle < quote.total) return this.toast(`Need ${quote.total} Coin`);

    this.placeConfirm = {
      x,
      y,
      slot: this.slot,
      cost: quote.total,
      surcharge: quote.surcharge,
    };
    this.board.pendingPlace = {
      x,
      y,
      base: loadout.base,
      barrel: loadout.barrel,
      payload: loadout.payload,
    };
    const tax = quote.surcharge > 0 ? ` (+${quote.surcharge} tax)` : "";
    this.toast(`Tap again to place · ${quote.total} Coin${tax}`);
  }

  clearPlaceConfirm() {
    this.placeConfirm = null;
    if (this.board) this.board.pendingPlace = null;
  }

  cancelPlaceConfirm() {
    if (!this.placeConfirm) return;
    this.clearPlaceConfirm();
    this.status = "";
    const st = this.ui.querySelector("#status");
    if (st) st.textContent = "";
  }

  confirmPlaceTower() {
    const pc = this.placeConfirm;
    if (!pc || !this.sim) return;
    const res = this.sim.tryPlaceTower(pc.x, pc.y, pc.slot);
    this.clearPlaceConfirm();
    this.handlePlace(res, "Tower");
  }

  handlePlace(res, label) {
    if (res.ok) {
      this.synth.play("place");
      const extra =
        res.surcharge > 0 ? ` (+${res.surcharge} board tax)` : "";
      this.toast(`${label} placed${extra}`);
      // Prices / coins refresh via sim events → refreshHud
      return;
    }
    const map = {
      path_sealed: "Can't seal the path",
      need_battle: `Need ${res.need} Coin`,
      incomplete_triad: "Compose a full triad in Forge first",
      blocked: "Cell blocked",
    };
    this.toast(map[res.reason] || `${label} failed`);
  }

  syncMetaProgress() {
    this.meta.aether = this.sim.economy.aether;
    this.meta.forge = this.sim.economy.forge;
    // Endless progress only — campaign clears must not unlock endless wave gifts.
    if (this.sim.modeEndless) {
      this.meta.bestWave = Math.max(this.meta.bestWave | 0, this.sim.waveIndex);
    }
    const { owned, gained } = applyWaveUnlocks(this.meta.owned, this.meta.bestWave);
    this.meta.owned = owned;
    this.persistMeta();
    return gained;
  }

  onSimEvent(e) {
    switch (e.kind) {
      case "wave_checkpoint":
        if (this.sim.modeEndless) saveEndless(this.sim.checkpoint());
        break;
      case "wave_composition": {
        const theme = e.theme || "";
        const event = e.event || "";
        if (this.sim.modeEndless) {
          const atmo = event || theme;
          if (atmo && atmo !== "campaign") {
            this.board?.setAtmosphere?.(atmo);
            this.palette.setAtmosphere?.(atmo);
          }
          if (event) {
            this.toast(`Event · ${event.replace(/_/g, " ")}`);
          } else if (theme && theme !== "campaign") {
            this.toast(`Theme · ${theme}`);
          }
        }
        this._refreshThemeChip?.(theme, event);
        break;
      }
      case "enemy_killed":
        if (this.meta.settings?.particles !== false && e.enemy?.pos) {
          this.fx.death(
            e.enemy.pos.x,
            e.enemy.pos.y,
            e.enemy.kind || "soft",
            e.enemy.armorKind || "none"
          );
          this.board?.addStain?.(e.enemy.pos.x, e.enemy.pos.y, e.enemy.boss ? "fire" : "kinetic");
        }
        if (e.enemy?.boss) this.board?.punch?.(3.5);
        break;
      case "tower_placed":
      case "wall_placed":
      case "tower_sold":
      case "wall_sold":
        this.board?.invalidateStatic?.();
        this.refreshHud();
        break;
      case "grid_grew":
        this.toast(`Map expands · ${e.rows} rows deep`);
        this.board?.onGridGrew?.();
        this.refreshHud();
        break;
      case "tower_fired":
        this.synth.play("shot", 0.95 + Math.random() * 0.1);
        if (e.towerId != null) this.board?.noteRecoil?.(e.towerId);
        if (this.meta.settings?.particles !== false && e.x != null) {
          this.fx.muzzle(e.x, e.y, e.angle || 0, e.damageType || "kinetic");
        }
        break;
      case "hit":
        this.synth.play("hit", 0.9 + Math.random() * 0.15);
        if (this.meta.settings?.particles !== false && e.x != null) {
          this.fx.hit(e.x, e.y, e.type || "kinetic");
          this.fx.damageNumber(e.x, e.y, e.damage || 0, e.type || "kinetic");
          this.board?.addStain?.(e.x, e.y, e.type || "kinetic");
        }
        if ((e.damage || 0) >= 40) this.board?.punch?.(2.5);
        break;
      case "leak":
        this.board?.bastionFlinch?.();
        this.synth.play("explode", 0.85);
        this.refreshHud();
        break;
      case "chain_arc":
        if (this.meta.settings?.particles !== false) {
          this.fx.chain(e.x0, e.y0, e.x1, e.y1);
        }
        break;
      case "status_fx":
        if (this.meta.settings?.particles !== false) {
          this.fx.statusPuff(e.x, e.y, e.type);
        }
        break;
      case "wave_cleared":
        this.synth.play("confirm");
        this.score.setWave(this.sim.waveIndex);
        {
          const gained = this.syncMetaProgress();
          this.sim.running = false;
          const won =
            !this.sim.modeEndless &&
            this.sim.wavesToWin > 0 &&
            this.sim.waveIndex >= this.sim.wavesToWin;
          if (!won) {
            const bits = [`+${e.coin | 0} Coin`];
            if (e.parts) bits.push(`+${e.parts} Parts`);
            if (e.aether) bits.push(`+${e.aether} Aether`);
            const gift = gained.length ? ` · unlocked ${gained.join(", ")}` : "";
            this.toast(`Wave ${this.sim.waveIndex} cleared · ${bits.join(" · ")}${gift}`);
            this.refreshHud();
          }
        }
        break;
      case "victory":
        this.synth.play("confirm");
        this.onCampaignVictory();
        break;
      case "game_over":
        this.synth.play("explode");
        this.syncMetaProgress();
        this._lastReplay = exportReplayBlob(this.sim);
        if (this.sim.modeEndless) clearEndless();
        this.score.stop();
        this.showGameOver();
        break;
      case "tower_leveled":
        this.synth.play("confirm");
        if (e.x != null && this.meta.settings?.particles !== false) {
          this.fx.hit(e.x, e.y, "shock");
          this.fx.statusPuff(e.x, e.y, "shock");
        }
        this.toast(`${partLabel(e.tower?.base)} → L${e.level}`);
        this.syncTowerOverlay();
        break;
      default:
        break;
    }
  }

  onCampaignVictory() {
    const id = this.sim.campaignLevelId | 0;
    const cleared = new Set(this.meta.campaign?.cleared || []);
    const first = !cleared.has(id);
    if (id > 0) {
      cleared.add(id);
      this.meta.campaign = { cleared: [...cleared].sort((a, b) => a - b) };
    }
    this.meta.aether = this.sim.economy.aether;
    this.meta.forge = this.sim.economy.forge;
    if (first && id > 0) this.meta.aether += 8;
    this.persistMeta();
    this.score.stop();
    this.status = first && id > 0 ? "First clear · +8 Aether" : "Level cleared";
    this.showVictory({ firstClear: first && id > 0 });
  }

  callEarly() {
    if (!this.sim || this.paused) return;
    if (this.waveBusy()) {
      this.toast("Finish the current wave first");
      return;
    }
    if (
      !this.sim.modeEndless &&
      this.sim.wavesToWin > 0 &&
      this.sim.waveIndex >= this.sim.wavesToWin
    ) {
      this.toast("Level already complete");
      return;
    }
    this.clearPlaceConfirm();
    this.paused = false;
    const earlyBonus = 4 + Math.floor(this.sim.waveIndex * 0.5);
    this.sim.startWave({ earlyBonus });
    this.synth.play("wave");
    this.score.setWave(this.sim.waveIndex);
    this.toast(`Wave ${this.sim.waveIndex} · +${earlyBonus} Coin early`);
    this.renderGameChrome();
  }

  applyForgePart(kind, id) {
    if (!ownsPart(this.meta.owned, kind, id)) {
      this.buyPart(kind, id, true);
      return;
    }
    const s = this.meta.roster[this.forgeSlot] || makeSlot("", "", "", this.meta.levelCap);
    s[kind] = id;
    this.meta.roster[this.forgeSlot] = makeSlot(s.base, s.barrel, s.payload, this.meta.levelCap);
    this.persistMeta();
    if (this.sim) this._syncSimFromMeta(this.sim);
    this.synth.play("ui");
    this.status = `Slot ${this.forgeSlot + 1}: set ${kind}`;
    this.showForge();
  }

  clearForgeSlot() {
    this.meta.roster[this.forgeSlot] = makeSlot("", "", "", this.meta.levelCap);
    this.persistMeta();
    if (this.sim) this._syncSimFromMeta(this.sim);
    this.status = `Slot ${this.forgeSlot + 1} cleared`;
    this.showForge();
  }

  buyTechNode(id) {
    const node = getTechNode(id);
    if (!node) return;
    const rank = techRank(this.meta, id);
    if (rank >= node.maxRank) return this.toast("Already maxed");
    if (!techRequiresMet(this.meta, node)) return this.toast("Locked — buy prior tech first");
    if (!techPartOwned(this.meta, node, ownsPart)) {
      const p = node.requiresPart;
      return this.toast(
        p ? `Unlock ${partLabel(p.id)} first` : "Unlock the required part first"
      );
    }
    const cost = techNextCost(node, rank);
    if (!canAffordTech(this.meta, cost)) {
      const need = formatTechCost(cost);
      return this.toast(`Need ${need}`);
    }
    spendTechCost(this.meta, cost);
    this.meta.tech = this.meta.tech || {};
    this.meta.tech[id] = rank + 1;
    syncTechDerived(this.meta);
    this.meta.roster = normalizeRoster(
      this.meta.roster,
      this.meta.slotCount,
      this.meta.levelCap
    );
    this.persistMeta();
    if (this.sim && (this.screen === "game" || this.screen === "hub" || this.screen === "upgrade")) {
      // Mid-meta upgrades must raise caps/slots on a continued run too.
      this._syncSimFromMeta(this.sim);
    }
    this.synth.play("confirm");
    this.status = `${node.name} → ${rank + 1}/${node.maxRank}`;
    this.techSelectedId = id;
    this.showUpgrade();
  }

  /** Unlock with Forge parts; when from Forge UI, also equip onto the active slot. */
  buyPart(kind, id, equip = true) {
    if (ownsPart(this.meta.owned, kind, id)) {
      if (equip) this.applyForgePart(kind, id);
      else this.toast("Already owned");
      return;
    }
    const cost = this._forgeCost(kind, id);
    if (this.meta.forge < cost) {
      this.toast(`Need ${cost} Forge parts`);
      return;
    }
    this.meta.forge -= cost;
    const key = kind === "base" ? "bases" : kind === "barrel" ? "barrels" : "payloads";
    if (!this.meta.owned[key].includes(id)) this.meta.owned[key].push(id);
    if (equip) {
      const s = this.meta.roster[this.forgeSlot] || makeSlot("", "", "", this.meta.levelCap);
      s[kind] = id;
      this.meta.roster[this.forgeSlot] = makeSlot(s.base, s.barrel, s.payload, this.meta.levelCap);
    }
    this.persistMeta();
    this.synth.play("confirm");
    this.status = `Unlocked ${partLabel(id)}${equip ? " · equipped" : ""}`;
    this.showForge();
  }

  /** Unlock a Forge part from the tech overlay (no equip — stay on Tech Tree). */
  unlockPartFromTech(kind, id) {
    if (ownsPart(this.meta.owned, kind, id)) {
      this.status = `Already own ${partLabel(id)}`;
      this.showUpgrade();
      return;
    }
    const cost = this._forgeCost(kind, id);
    if ((this.meta.forge | 0) < cost) {
      return this.toast(`Need ${cost} Forge parts`);
    }
    this.meta.forge -= cost;
    const key = kind === "base" ? "bases" : kind === "barrel" ? "barrels" : "payloads";
    if (!this.meta.owned[key]) this.meta.owned[key] = [];
    if (!this.meta.owned[key].includes(id)) this.meta.owned[key].push(id);
    this.persistMeta();
    this.synth.play("confirm");
    this.status = `Unlocked ${partLabel(id)} · buy mastery next`;
    this.showUpgrade();
  }

  sellSelected() {
    if (!this.sim) return;
    if (this.selectedTowerId >= 0) {
      const res = this.sim.trySellTower(this.selectedTowerId);
      if (res.ok) {
        this.selectedTowerId = -1;
        this.synth.play("sell");
        this.toast(`Sold (+${res.refund} Coin)`);
      }
      return;
    }
    if (this.selectedWallId >= 0) {
      const res = this.sim.trySellWall(this.selectedWallId);
      if (res.ok) {
        this.selectedWallId = -1;
        this.synth.play("sell");
        this.toast(`Wall sold (+${res.refund} Coin)`);
      } else if (res.reason === "preplaced") {
        this.toast("Fixed walls can't be sold");
      }
      return;
    }
    this.toast("Tap a tower or wall first");
  }

}
