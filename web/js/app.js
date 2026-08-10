import { ENDLESS_GRID } from "./data/endlessGrid.js";
import { SimWorld, TICK_HZ } from "./sim/simWorld.js";
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
import {
  CAMPAIGN_LEVELS,
  getCampaignLevel,
  isLevelUnlocked,
} from "./data/campaign.js";

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
    this._raf = 0;
    this._last = 0;

    this.board.onTap = (cell) => this.onCellTap(cell);
    window.addEventListener("resize", () => this.board._fit());
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
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
    if ((e.code === "Escape" || e.key === "Escape") && this.placeConfirm) {
      e.preventDefault();
      this.cancelPlaceConfirm();
      return;
    }
    if (e.code !== "Space" && e.key !== " ") return;
    e.preventDefault();
    if (e.repeat) return;
    this.unlockAudio().then(() => this.callEarly());
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

  tick(dt) {
    this.score.tick(dt);
    if (this.screen === "main") {
      this.title.tick(dt);
      this.title.draw();
      return;
    }
    if (this.screen === "forge") {
      this.forgeAim += dt * 0.7;
      this.paintForgePreview();
      return;
    }
    if (this.screen === "game" && this.sim) {
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
      this.board.tool = this.tool;
      this.board.selectedTowerId = this.selectedTowerId;
      this.board.draw();
      this.refreshHud();
    }
  }

  async unlockAudio() {
    // SFX unlock lazily inside SynthBank.play — do not start music here.
  }

  showMain() {
    this.screen = "main";
    this.ui.innerHTML = `
      <div class="screen title-screen">
        <header class="title-hero">
          <p class="title-mark">Project</p>
          <h1 class="title-brand">
            <span class="title-brand-line">Tower</span>
            <span class="title-brand-line accent">Defense</span>
          </h1>
          <p class="title-tag">Compose towers. Shape the path. Survive.</p>
        </header>
        <nav class="title-actions" aria-label="Main menu">
          <button class="btn title-cta" data-act="endless">Endless</button>
          <button class="btn" data-act="campaign">Campaign</button>
          <button class="btn" data-act="forge-from-main">Forge</button>
          <button class="btn" data-act="upgrade">Tech Tree</button>
          <button class="btn secondary" data-act="settings">Settings</button>
        </nav>
        <footer class="title-foot">
          <div class="title-stats" aria-label="Progress">
            <span><i>Æ</i>${this.meta.aether}</span>
            <span><i>Parts</i>${this.meta.forge}</span>
            <span><i>Best</i>W${this.meta.bestWave}</span>
          </div>
          <p class="title-credit">Vanilla web · zero asset packs</p>
        </footer>
      </div>`;
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
          : "main";
    const partBtn = (kind, id) => {
      const have = ownsPart(owned, kind, id);
      const equipped = slot[kind] === id;
      const table = kind === "base" ? PARTS.bases : kind === "barrel" ? PARTS.barrels : PARTS.payloads;
      const tip = table[id]?.blurb || "";
      const extra =
        kind === "base" && table[id]?.doctrine
          ? ` (${doctrineLabel(table[id].doctrine)})`
          : "";
      if (have) {
        const cls = `btn part-btn ${equipped ? "equipped" : ""}`.trim();
        return `<button class="${cls}" data-act="forge-part:${kind}:${id}" title="${tip}">${partLabel(id)}${extra}</button>`;
      }
      const cost = this._forgeCost(kind, id);
      const can = this.meta.forge >= cost;
      const cls = `btn part-btn locked ${can ? "" : "cant-afford"}`.trim();
      return `<button class="${cls}" data-act="buy:${kind}:${id}" title="${tip} — unlock for ${cost} Forge parts">${partLabel(id)}${extra} · ${cost}</button>`;
    };
    const slotBtns = this._rosterSlotButtons("forge");
    this.ui.innerHTML = `
      <div class="screen scroll">
        <div class="screen-header">
          <h1>Forge</h1>
          <button class="btn secondary" data-act="${backAct}" style="padding:10px 12px;font-size:0.85rem">Back</button>
        </div>
        <p class="currency-line">Forge parts ${this.meta.forge} · Aether ${this.meta.aether} · Cap L${this.meta.levelCap}</p>
        <div class="status" id="status">${this.status}</div>
        <div class="row build-strip">${slotBtns}</div>
        <div class="forge-preview-wrap">
          <canvas id="forgePreview" width="160" height="160" aria-label="Tower preview"></canvas>
          <div class="forge-summary">
            <h3>Slot ${this.forgeSlot + 1}</h3>
            <p id="forgeLoadout">${
              slot.complete
                ? `${partLabel(slot.base)} · ${doctrineLabel(PARTS.bases[slot.base]?.doctrine)}<br/>${partLabel(slot.barrel)} + ${partLabel(slot.payload)} · ${slot.placeCost} Coin`
                : "Base = brain · Barrel = delivery · Payload = element"
            }</p>
            <button class="btn secondary" data-act="forge-clear" style="margin-top:8px;padding:8px 10px;font-size:0.8rem">Clear slot</button>
          </div>
        </div>
        <div class="cols">
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
        <p style="font-size:0.8rem;color:var(--muted)">Tap a locked part to spend Forge parts. Some parts also unlock free at wave milestones. Permanent power lives in the Tech Tree.</p>
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
    const backAct =
      this.upgradeReturn === "main"
        ? "main"
        : this.upgradeReturn === "hub"
          ? "hub"
          : this.upgradeReturn === "campaign"
            ? "campaign"
            : "forge";
    const backLabel = backAct === "main" ? "Menu" : backAct === "forge" ? "Forge" : "Back";
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
      <div class="screen tech-screen">
        <header class="tech-hero">
          <div class="tech-hero-row">
            <div>
              <p class="title-mark">Permanent</p>
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
    this.ui.innerHTML = `
      <div class="screen">
        <h1>Endless</h1>
        <button class="btn" data-act="newrun">New Run</button>
        <button class="btn hub-continue" data-act="continue" ${canContinue ? "" : "disabled"}>Continue</button>
        <p>${canContinue ? `Resume wave ${blob.wave}` : "No checkpoint yet"}</p>
        <button class="btn" data-act="forge-from-hub">Forge</button>
        <button class="btn secondary" data-act="main">Main Menu</button>
      </div>`;
    this.bindUi();
  }

  showCampaign() {
    this.screen = "campaign";
    // Campaign list is hub-only — never keep a live run here.
    this.sim = null;
    this.selectedTowerId = -1;
    this.selectedWallId = -1;
    const cleared = this.meta.campaign?.cleared || [];
    const levelBtns = CAMPAIGN_LEVELS.map((lv) => {
      const open = isLevelUnlocked(lv.id, cleared);
      const done = cleared.includes(lv.id);
      const mark = done ? " · Cleared" : open ? ` · ${lv.wavesToWin} waves` : " · Locked";
      const cls = open ? "btn" : "btn secondary";
      const act = open ? `data-act="campaign-level:${lv.id}"` : "disabled";
      return `<button class="${cls}" ${act} title="${lv.blurb}">${lv.id}. ${lv.name}${mark}</button>`;
    }).join("");
    this.ui.innerHTML = `
      <div class="screen scroll">
        <div class="screen-header">
          <h1>Campaign</h1>
          <button class="btn secondary" data-act="main" style="padding:10px 12px;font-size:0.85rem">Back</button>
        </div>
        <p class="currency-line">8×8 maps · clear waves to win · linear unlock</p>
        <div class="status" id="status">${this.status}</div>
        ${levelBtns}
        <button class="btn secondary" disabled>4. Coming soon</button>
        <button class="btn" data-act="forge-from-campaign">Forge</button>
      </div>`;
    this.bindUi();
  }

  showVictory(opts = {}) {
    this.screen = "victory";
    const lv = getCampaignLevel(this.sim?.campaignLevelId);
    const gains = this.sim?.economy?.runWaveGains || { coin: 0, parts: 0, aether: 0 };
    const firstBonus = opts.firstClear ? 8 : 0;
    this.ui.innerHTML = `
      <div class="screen end-screen">
        <h1>Victory</h1>
        <p class="end-sub">${lv ? lv.name : "Level"} cleared</p>
        <div class="end-card">
          <h3>This run</h3>
          <div class="end-gains">
            <span class="gain-pill">+${gains.parts} Parts</span>
            <span class="gain-pill">+${gains.aether + firstBonus} Aether${
              firstBonus ? " (incl. first clear)" : ""
            }</span>
          </div>
        </div>
        <div class="end-card">
          <h3>Totals kept</h3>
          <div class="end-totals">
            <span class="chip parts"><span class="k">Parts</span>${this.meta.forge}</span>
            <span class="chip aether"><span class="k">Aether</span>${this.meta.aether}</span>
          </div>
        </div>
        <button class="btn" data-act="campaign">Campaign Menu</button>
      </div>`;
    this.bindUi();
  }

  showSettings() {
    this.screen = "settings";
    const pitch = this.meta.settings?.cameraPitch ?? VIEW25.pitchDeg;
    this.ui.innerHTML = `
      <div class="screen scroll">
        <div class="screen-header">
          <h1>Settings</h1>
          <button class="btn secondary" data-act="main" style="padding:10px 12px;font-size:0.85rem">Back</button>
        </div>
        <label class="btn secondary"><input type="checkbox" id="cb" ${
          this.meta.settings?.colorblind ? "checked" : ""
        }/> Colorblind palette</label>
        <div class="end-card" style="margin-top:8px">
          <h3>Camera angle</h3>
          <p class="end-note">Pitch ${Math.round(pitch)}° — steeper = more foreshortening. Also available as an in-game slider. Pinch (or ⌘/Ctrl+scroll) to zoom.</p>
          <input id="pitch" type="range" min="8" max="58" step="1" value="${pitch}" style="width:100%;margin-top:8px" />
        </div>
      </div>`;
    this.bindUi();
    this.ui.querySelector("#cb")?.addEventListener("change", (e) => {
      this.meta.settings = this.meta.settings || {};
      this.meta.settings.colorblind = e.target.checked;
      this.palette.setColorblind(e.target.checked);
      saveMeta(this.meta);
    });
    const pitchEl = this.ui.querySelector("#pitch");
    pitchEl?.addEventListener("input", (e) => {
      const v = +e.target.value;
      this.applyPitch(v);
      const note = this.ui.querySelector(".end-note");
      if (note) {
        note.textContent = `Pitch ${Math.round(v)}° — steeper = more foreshortening. Also available as an in-game slider. Pinch (or ⌘/Ctrl+scroll) to zoom.`;
      }
    });
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
    const actions = endless
      ? `<div class="end-actions">
          <button class="btn title-cta" data-act="newrun">New Run</button>
          <button class="btn" data-act="forge-from-hub">Forge</button>
          <button class="btn secondary" data-act="${backAct}">${backLabel}</button>
          <button class="btn secondary" data-act="main">Main Menu</button>
        </div>`
      : `<div class="end-actions">
          <button class="btn" data-act="${backAct}">${backLabel}</button>
          <button class="btn secondary" data-act="main">Main Menu</button>
        </div>`;
    this.ui.innerHTML = `
      <div class="screen end-screen${endless ? " end-endless" : ""}">
        <header class="end-hero">
          <p class="end-mark">${endless ? "Endless" : "Campaign"}</p>
          <h1 class="end-title">Run Over</h1>
          <p class="end-sub">${lv ? `${lv.name} · ` : ""}Reached wave</p>
          <div class="end-wave${isBest ? " is-best" : ""}">
            <span class="end-wave-num">${wave}</span>
            ${isBest ? `<span class="end-best-tag">Best</span>` : ""}
          </div>
          ${
            endless && best > 0 && !isBest
              ? `<p class="end-best-line">Personal best · wave ${best}</p>`
              : ""
          }
        </header>
        <div class="end-card">
          <h3>Salvaged this run</h3>
          <div class="end-gains">
            ${gainLine(gains.parts, "Parts", "parts")}
            ${gainLine(gains.aether, "Aether", "aether")}
          </div>
          <p class="end-note">Wave clears also paid <strong>+${gains.coin}</strong> Coin in-run</p>
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
        else if (act?.startsWith("campaign-level:")) this.startCampaignLevel(+act.slice(15));
        else if (act === "forge") this.showForge(this.forgeReturn || "main");
        else if (act === "forge-from-hub") this.showForge("hub");
        else if (act === "forge-from-main") this.showForge("main");
        else if (act === "forge-from-campaign") this.showForge("campaign");
        else if (act === "upgrade") {
          const from =
            this.screen === "main"
              ? "main"
              : this.screen === "forge"
                ? "forge"
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
        else if (act === "call") this.callEarly();
        else if (act === "menu") {
          this.paused = true;
          if (this.sim && !this.sim.modeEndless) {
            if (!confirm("Abandon this campaign run?")) {
              this.paused = false;
              return;
            }
            this.sim = null;
            this.selectedTowerId = -1;
            this.selectedWallId = -1;
            this.showCampaign();
          } else this.showEndlessHub();
        } else if (act === "sell") this.sellSelected();
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
        } else if (act?.startsWith("spd:")) {
          this.speed = +act.slice(4);
          this.score.setSpeed(this.speed);
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

  newRun() {
    if (hasEndless()) {
      if (!confirm("Overwrite endless checkpoint?")) return;
      clearEndless();
    }
    this.sim = new SimWorld();
    this.sim.setup(ENDLESS_GRID.cols, ENDLESS_GRID.rows, 1, true);
    this._applyRunTech(this.sim, { battleBase: BASE_START_CASH });
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
    this.sim = new SimWorld();
    this.sim.setup(lv.cols, lv.rows, lv.seed, false);
    this.sim.campaignLevelId = lv.id;
    this.sim.wavesToWin = lv.wavesToWin;
    this._applyRunTech(this.sim, { battleBase: lv.coinGrant });
    this.sim.applyPreWalls(lv.preWalls);
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
    this.toast(`${lv.name}: clear ${lv.wavesToWin} waves. Pre-walls are fixed.`);
  }

  wireSim() {
    this.sim.on("*", (e) => this.onSimEvent(e));
    this.board.setSim(this.sim);
  }

  enterGame() {
    this.screen = "game";
    if (this.sim && this.slot >= this.sim.roster.length) this.slot = 0;
    this.clearPlaceConfirm();
    this.renderGameChrome();
    if (this.sim?.modeEndless) {
      this.toast("Place towers/walls, then Call Wave. Drag to pan · pinch to zoom.");
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
        bits.push(
          `<button type="button" class="btn slot-locked" data-act="slot-locked:${i}" title="Unlock Slot ${
            i + 1
          } in Tech Tree → Roster">S${i + 1}</button>`
        );
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
        bits.push(
          `<button type="button" class="btn ${active}" data-act="slot:${i}" data-build-slot="${i}" title="${q.tip}">${q.btnLabel}</button>`
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
    this.ui.innerHTML = `
      <div class="game-chrome">
        <header class="hud-bar">
          <div class="speed-cluster" title="Game speed">
            <button class="icon-btn ${this.speed === 1 ? "active" : ""}" data-act="spd:1">1x</button>
            <button class="icon-btn ${this.speed === 2 ? "active" : ""}" data-act="spd:2">2x</button>
            <button class="icon-btn ${this.speed === 3 ? "active" : ""}" data-act="spd:3">3x</button>
          </div>
          <div class="hud-center">
            <div class="stat-chips" id="statChips"></div>
            <div class="status" id="status">${this.status}</div>
          </div>
          <div class="corner-actions">
            <button class="icon-btn" data-act="menu" title="Menu" aria-label="Menu">☰</button>
          </div>
        </header>
        <aside class="cam-rail" title="Camera pitch">
          <span class="cam-rail-label">Pitch</span>
          <input id="pitchLive" class="cam-pitch" type="range" min="8" max="58" step="1" value="${pitch}" />
          <span class="cam-rail-val" id="pitchLiveVal">${pitch}°</span>
        </aside>
        <div class="tower-overlay hidden" id="towerOverlay">
          <div class="meta" id="towerMeta"></div>
          <div class="xp-line" id="towerXp"></div>
          <button class="btn danger" data-act="sell">Sell</button>
        </div>
        <div class="dock">
          <div class="dock-meta" id="slotline"></div>
          <div class="build-strip">${buildBtns}</div>
          <div class="build-tools">
            <button class="btn ${this.tool === "wall" ? "active" : ""}" data-act="tool:wall" id="wallBtn">Wall</button>
          </div>
          <button class="btn call-btn" data-act="call" id="callBtn">Call Wave</button>
        </div>
      </div>`;
    this.bindUi();
    this.ui.querySelector("#pitchLive")?.addEventListener("input", (e) => {
      this.applyPitch(+e.target.value);
    });
    this.refreshHud();
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
    if (!chips) return;

    const waveLabel = !this.sim.modeEndless && this.sim.wavesToWin
      ? `${this.sim.waveIndex}/${this.sim.wavesToWin}`
      : `${this.sim.waveIndex}`;
    chips.innerHTML = `
      ${
        !this.sim.modeEndless
          ? `<span class="chip wave"><span class="k">Lvl</span>${this.sim.campaignLevelId}</span>`
          : ""
      }
      <span class="chip wave"><span class="k">Wave</span>${waveLabel}</span>
      <span class="chip lives"><span class="k">Lives</span>${this.sim.lives}</span>
      <span class="chip coin"><span class="k">COIN</span>${this.sim.economy.battle}</span>
      <span class="chip parts"><span class="k">Parts</span>${this.sim.economy.forge}</span>
      <span class="chip aether"><span class="k">Aether</span>${this.sim.economy.aether}</span>`;
    if (st) st.textContent = this.status;

    this._syncBuildDock();

    if (callBtn) {
      const busy = this.waveBusy();
      const done =
        !this.sim.modeEndless &&
        this.sim.wavesToWin > 0 &&
        this.sim.waveIndex >= this.sim.wavesToWin;
      callBtn.disabled = busy || done;
      callBtn.textContent = busy
        ? "Wave in progress"
        : done
          ? "Level complete"
          : `Call Wave ${this.sim.waveIndex + 1}`;
    }
    this.syncTowerOverlay();
  }

  /** Update slot/wall prices + dock meta from current economy state. */
  _syncBuildDock() {
    if (!this.sim) return;
    for (let i = 0; i < MAX_ROSTER_SLOTS; i++) {
      const btn = this.ui.querySelector(`[data-build-slot="${i}"]`);
      if (!btn) continue;
      const q = this._gameSlotQuote(i);
      btn.textContent = q.btnLabel;
      btn.title = q.tip;
    }
    const wallCost = this.sim.economy.wallCost(this.sim.playerWallCount());
    const wallBtn = this.ui.querySelector("#wallBtn");
    if (wallBtn) wallBtn.textContent = `Wall · ${wallCost}`;

    const slotLine = this.ui.querySelector("#slotline");
    if (!slotLine) return;
    if (this.tool === "wall") {
      slotLine.textContent = `Wall · ${wallCost} Coin`;
      return;
    }
    const q = this._gameSlotQuote(this.slot);
    if (!q.complete) {
      slotLine.textContent = `Slot ${this.slot + 1} incomplete — set loadout in Forge before the run`;
      return;
    }
    const s = q.loadout;
    slotLine.textContent = `Slot ${this.slot + 1}: ${partLabel(s.base)} / ${partLabel(s.barrel)} / ${partLabel(s.payload)} · ${q.total} Coin${
      q.surcharge ? ` (incl. ${q.surcharge} tax)` : ""
    }`;
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
      case "tower_placed":
      case "wall_placed":
      case "tower_sold":
      case "wall_sold":
        this.refreshHud();
        break;
      case "grid_grew":
        this.toast(`Map expands · ${e.rows} rows deep`);
        this.board?.onGridGrew?.();
        this.refreshHud();
        break;
      case "tower_fired":
        this.synth.play("shot", 0.95 + Math.random() * 0.1);
        break;
      case "hit":
        this.synth.play("hit", 0.9 + Math.random() * 0.15);
        if (this.meta.settings?.particles !== false && e.x != null) {
          this.fx.hit(e.x, e.y, e.type || "kinetic");
        }
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
        if (this.sim.modeEndless) clearEndless();
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
    cleared.add(id);
    this.meta.campaign = { cleared: [...cleared].sort((a, b) => a - b) };
    this.meta.aether = this.sim.economy.aether;
    this.meta.forge = this.sim.economy.forge;
    if (first) this.meta.aether += 8;
    this.persistMeta();
    this.status = first ? "First clear · +8 Aether" : "Level cleared";
    this.showVictory({ firstClear: first });
  }

  callEarly() {
    if (!this.sim) return;
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
    this.sim.startWave();
    this.synth.play("wave");
    this.score.setWave(this.sim.waveIndex);
    this.toast(`Wave ${this.sim.waveIndex}`);
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
