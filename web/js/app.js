import { SimWorld, TICK_HZ } from "./sim/simWorld.js?v=earlycoin1";
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
} from "./data/parts.js?v=earlycoin1";
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
import { ScoreEngine } from "./audio/scoreEngine.js?v=earlycoin1";
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
    this.composeOpen = false;
    this.paused = false;
    this.speed = 1;
    this.accum = 0;
    this.status = "";
    this.undo = [];
    this._raf = 0;
    this._last = 0;

    this.board.onTap = (cell) => this.onCellTap(cell);
    window.addEventListener("resize", () => this.board._fit());
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
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
    const slotBtns = this.meta.roster
      .map((s, i) => {
        const active = i === this.forgeSlot ? "active" : "";
        const mark = s.complete ? s.placeCost : "—";
        return `<button class="btn ${active}" data-act="forge-slot:${i}">S${i + 1} · ${mark}</button>`;
      })
      .join("");
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
    return forgeBuyCost(kind, id, this.meta.forgeCostMult ?? 1);
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
    if (returnTo) this.upgradeReturn = returnTo;
    if (!this.upgradeReturn) this.upgradeReturn = "forge";
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
    const forest = TECH_TREES.map((tree) => this._techTreeHtml(tree)).join("");
    const nextGift = WAVE_UNLOCKS.find((w) => w.bestWave > (this.meta.bestWave | 0));
    const cash = BASE_START_CASH + (this.meta.startCashBonus | 0);
    const giftLine = nextGift
      ? `W${this.meta.bestWave || 0} · next gift W${nextGift.bestWave}: ${nextGift.label}`
      : `W${this.meta.bestWave || 0} · all wave gifts earned`;
    this.ui.innerHTML = `
      <div class="screen scroll tech-screen">
        <div class="tech-top">
          <div class="screen-header">
            <h1>Tech Tree</h1>
            <button class="btn secondary tech-back" data-act="${backAct}">${backLabel}</button>
          </div>
          <p class="tech-bar">
            <span><b>Æ</b>${this.meta.aether}</span>
            <span><b>Parts</b>${this.meta.forge}</span>
            <span>L${this.meta.levelCap}</span>
            <span>S${this.meta.slotCount}</span>
            <span>♥${this.meta.startLives || 3}</span>
            <span>$${cash}</span>
            <span>+${this.meta.waveCoinBonus | 0} clear</span>
          </p>
          <div class="status tech-status" id="status">${this.status}</div>
        </div>
        <div class="tech-forest">${forest}</div>
        <footer class="tech-foot">
          <p class="tech-gift">${giftLine}</p>
          <button class="btn secondary tech-foot-btn" data-act="main">Main Menu</button>
        </footer>
      </div>`;
    this.bindUi();
  }

  _techTreeHtml(tree) {
    const kids = tree.children || [];
    const forkClass =
      tree.id === "arsenal" ? "tree-fork tree-fork--grid" : "tree-fork tree-fork--branches";
    return `<section class="tech-tree" data-tree="${tree.id}">
      <header class="tree-root-label">
        <h3>${tree.name}</h3>
        <p>${tree.blurb}</p>
      </header>
      <div class="${forkClass}">
        ${kids.map((c) => this._techLimbHtml(c)).join("")}
      </div>
    </section>`;
  }

  /** Flatten a linear child chain into an ordered node list. */
  _techChainList(node) {
    const list = [node];
    let cur = node;
    while (cur.children?.length === 1 && cur.children[0].kind !== "group") {
      cur = cur.children[0];
      list.push(cur);
    }
    // If a node fans out (shouldn't for our tree), stop at the fork.
    return list;
  }

  _techLimbHtml(node) {
    if (node.kind === "group" || node.kind === "root") {
      return `<div class="tree-limb tree-limb--branch">
        <div class="tree-hub">${node.name}</div>
        <div class="tree-fork tree-fork--siblings">
          ${(node.children || []).map((c) => this._techLimbHtml(c)).join("")}
        </div>
      </div>`;
    }
    const kids = node.children || [];
    if (!kids.length) {
      return `<div class="tree-limb tree-limb--leaf">${this._techCardHtml(node)}</div>`;
    }
    // Linear unlock path → one horizontal row (Cap III › IV › V)
    if (kids.length === 1) {
      const chain = this._techChainList(node);
      const cells = chain
        .map(
          (n, i) =>
            `${i > 0 ? `<span class="tree-chevron" aria-hidden="true">›</span>` : ""}
            <div class="tree-limb tree-limb--leaf">${this._techCardHtml(n)}</div>`
        )
        .join("");
      return `<div class="tree-limb tree-limb--chain">
        <div class="tree-fork tree-fork--chain">${cells}</div>
      </div>`;
    }
    // Fan-out (unused today, kept safe)
    return `<div class="tree-limb tree-limb--chain">
      ${this._techCardHtml(node)}
      <div class="tree-fork tree-fork--siblings">
        ${kids.map((c) => this._techLimbHtml(c)).join("")}
      </div>
    </div>`;
  }

  _techCardHtml(node) {
    const def = getTechNode(node.id) || node;
    const rank = techRank(this.meta, def.id);
    const maxed = rank >= def.maxRank;
    const prereq = techRequiresMet(this.meta, def);
    const partOk = techPartOwned(this.meta, def, ownsPart);
    const cost = techNextCost(def, rank);
    const costLabel = formatTechCost(cost);
    let state = "open";
    let action;
    if (maxed) {
      state = "maxed";
      action = `<span class="tree-action muted">Max</span>`;
    } else if (!partOk) {
      state = "locked";
      action = `<span class="tree-action muted">Part</span>`;
    } else if (!prereq) {
      state = "locked";
      action = `<span class="tree-action muted">Locked</span>`;
    } else if (!canAffordTech(this.meta, cost)) {
      state = "cant";
      action = `<button class="btn cant-afford tree-buy" data-act="tech:${def.id}" disabled>${costLabel}</button>`;
    } else {
      action = `<button class="btn tree-buy" data-act="tech:${def.id}">${costLabel}</button>`;
    }
    const rankLabel = def.maxRank > 1 ? `${rank}/${def.maxRank}` : rank ? "●" : "○";
    return `<div class="tree-card ${state}" title="${def.blurb}">
      <div class="tree-card-top">
        <strong>${def.name}</strong>
        <span class="tree-rank">${rankLabel}</span>
      </div>
      ${action}
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
        <button class="btn secondary" data-act="continue" ${canContinue ? "" : "disabled"}>Continue</button>
        <p>${canContinue ? `Resume wave ${blob.wave}` : "No checkpoint yet"}</p>
        <button class="btn" data-act="forge-from-hub">Forge</button>
        <button class="btn secondary" data-act="main">Back</button>
      </div>`;
    this.bindUi();
  }

  showCampaign() {
    this.screen = "campaign";
    this.sim = null;
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
          <p class="end-note">Pitch ${Math.round(pitch)}° — steeper = more trapezoid foreshortening</p>
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
      this.meta.settings = this.meta.settings || {};
      this.meta.settings.cameraPitch = v;
      setPitch(v);
      this.board.refreshCamera();
      const note = this.ui.querySelector(".end-note");
      if (note) note.textContent = `Pitch ${Math.round(v)}° — steeper = more trapezoid foreshortening`;
      saveMeta(this.meta);
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
        } else if (act?.startsWith("tech:")) this.buyTechNode(act.slice(5));
        else if (act === "settings") this.showSettings();
        else if (act === "newrun") this.newRun();
        else if (act === "continue") this.continueRun();
        else if (act === "call") this.callEarly();
        else if (act === "menu") {
          this.paused = true;
          if (this.sim && !this.sim.modeEndless) this.showCampaign();
          else this.showEndlessHub();
        } else if (act === "undo") this.undoLast();
        else if (act === "sell") this.sellSelected();
        else if (act === "tool:wall") {
          this.tool = "wall";
          this.selectedTowerId = -1;
          this.renderGameChrome();
        } else if (act === "forge-clear") this.clearForgeSlot();
        else if (act?.startsWith("forge-slot:")) {
          this.forgeSlot = +act.slice(11);
          this.showForge();
        } else if (act?.startsWith("forge-part:")) {
          const [, kind, id] = act.split(":");
          this.applyForgePart(kind, id);
        } else if (act?.startsWith("buy:")) {
          const [, kind, id] = act.split(":");
          this.buyPart(kind, id);
        } else if (act?.startsWith("slot:")) {
          this.slot = +act.slice(5);
          this.tool = "tower";
          this.selectedTowerId = -1;
          this.renderGameChrome();
        } else if (act?.startsWith("spd:")) {
          this.speed = +act.slice(4);
          this.score.setSpeed(this.speed);
          this.renderGameChrome();
        }
      });
    });
  }

  _applyRunTech(sim, { battleBase } = {}) {
    sim.setStartLives(this.meta.startLives || 3);
    sim.economy.injectMeta(this.meta.forge, this.meta.aether);
    sim.economy.applyRunMods({
      wallCostMult: this.meta.wallCostMult ?? 1,
      waveCoinBonus: this.meta.waveCoinBonus | 0,
    });
    if (battleBase != null) {
      sim.economy.battle = (battleBase | 0) + (this.meta.startCashBonus | 0);
    }
    this.meta.roster = normalizeRoster(
      this.meta.roster,
      this.meta.slotCount,
      this.meta.levelCap
    );
    sim.setRoster(structuredClone(this.meta.roster));
    sim.setPartUpgrades(this.meta.partUpgrades);
  }

  newRun() {
    if (hasEndless()) {
      if (!confirm("Overwrite endless checkpoint?")) return;
      clearEndless();
    }
    this.sim = new SimWorld();
    this.sim.setup(11, 14, 1, true);
    this._applyRunTech(this.sim, { battleBase: BASE_START_CASH });
    this.fx.clear();
    this.wireSim();
    this.tool = "tower";
    this.slot = 0;
    this.selectedTowerId = -1;
    this.composeOpen = false;
    this.paused = false;
    this.speed = 1;
    this.accum = 0;
    this.undo = [];
    this.enterGame();
  }

  continueRun() {
    const blob = loadEndless();
    if (!blob) return this.showEndlessHub();
    this.sim = new SimWorld();
    this.sim.loadCheckpoint(blob);
    this.sim.setPartUpgrades(this.meta.partUpgrades);
    this.sim.economy.applyRunMods({
      wallCostMult: this.meta.wallCostMult ?? 1,
      waveCoinBonus: this.meta.waveCoinBonus | 0,
    });
    this.fx.clear();
    this.wireSim();
    this.enterGame();
    this.toast(`Checkpoint loaded — Call Early for wave ${this.sim.waveIndex}`);
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
    this.composeOpen = false;
    this.paused = false;
    this.speed = 1;
    this.accum = 0;
    this.undo = [];
    this.enterGame();
    this.toast(`${lv.name}: clear ${lv.wavesToWin} waves. Pre-walls are fixed.`);
  }

  wireSim() {
    this.sim.on("*", (e) => this.onSimEvent(e));
    this.board.setSim(this.sim);
  }

  enterGame() {
    this.screen = "game";
    this.renderGameChrome();
    if (this.sim?.modeEndless) {
      this.toast("Place towers/walls, then Call Wave. Path cannot be sealed.");
    }
  }

  waveBusy() {
    if (!this.sim) return false;
    return !!(this.sim.waves.waveActive || this.sim.enemies.length);
  }

  renderGameChrome() {
    if (!this.sim) return;
    const wallCost = this.sim.economy.wallCost(this.sim.playerWallCount());
    const nextWave = this.sim.waveIndex + 1;
    const busy = this.waveBusy();
    const canCall =
      !busy &&
      (this.sim.modeEndless ||
        !this.sim.wavesToWin ||
        this.sim.waveIndex < this.sim.wavesToWin);
    const buildBtns = this.sim.roster
      .map((s, i) => {
        const active = this.tool === "tower" && i === this.slot ? "active" : "";
        const surcharge = s.complete
          ? this.sim.economy.placeSurcharge(s.placeCost, this.sim.towers.length)
          : 0;
        const total = s.complete ? s.placeCost + surcharge : 0;
        const label = s.complete ? `S${i + 1} · ${total}` : `S${i + 1} · —`;
        return `<button class="btn ${active}" data-act="slot:${i}" title="${
          s.complete
            ? `${s.base}/${s.barrel}/${s.payload}${surcharge ? ` (+${surcharge} tax)` : ""}`
            : "incomplete — set in Forge"
        }">${label}</button>`;
      })
      .join("");
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
            <button class="icon-btn" data-act="undo" title="Undo last place" aria-label="Undo">↩</button>
            <button class="icon-btn" data-act="menu" title="Menu" aria-label="Menu">☰</button>
          </div>
        </header>
        <div class="tower-overlay hidden" id="towerOverlay">
          <div class="meta" id="towerMeta"></div>
          <div class="xp-line" id="towerXp"></div>
          <button class="btn danger" data-act="sell">Sell</button>
        </div>
        <div class="dock">
          <div class="dock-meta" id="slotline"></div>
          <div class="row build-strip">
            ${buildBtns}
            <button class="btn ${this.tool === "wall" ? "active" : ""}" data-act="tool:wall">Wall · ${wallCost}</button>
          </div>
          <button class="btn call-btn" data-act="call" id="callBtn" ${canCall ? "" : "disabled"}>
            ${
              busy
                ? "Wave in progress"
                : !this.sim.modeEndless && this.sim.waveIndex >= this.sim.wavesToWin
                  ? "Level complete"
                  : `Call Wave ${nextWave}`
            }
          </button>
        </div>
      </div>`;
    this.bindUi();
    this.refreshHud();
  }

  refreshHud() {
    const chips = this.ui.querySelector("#statChips");
    const st = this.ui.querySelector("#status");
    const slotLine = this.ui.querySelector("#slotline");
    const callBtn = this.ui.querySelector("#callBtn");
    if (!chips || !this.sim) return;
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
    if (slotLine) {
      if (this.tool === "wall") {
        const cost = this.sim.economy.wallCost(this.sim.playerWallCount());
        slotLine.textContent = `Wall · ${cost} Coin`;
      } else {
        const slot = this.sim.roster[this.slot] || {};
        if (slot.complete) {
          const tax = this.sim.economy.placeSurcharge(slot.placeCost, this.sim.towers.length);
          const total = slot.placeCost + tax;
          slotLine.textContent = `Slot ${this.slot + 1}: ${partLabel(slot.base)} / ${partLabel(slot.barrel)} / ${partLabel(slot.payload)} · ${total} Coin${
            tax ? ` (incl. ${tax} tax)` : ""
          }`;
        } else {
          slotLine.textContent = `Slot ${this.slot + 1} incomplete — set loadout in Forge before the run`;
        }
      }
    }
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

  syncTowerOverlay() {
    const overlay = this.ui.querySelector("#towerOverlay");
    const meta = this.ui.querySelector("#towerMeta");
    const xpEl = this.ui.querySelector("#towerXp");
    if (!overlay || !this.sim) return;
    const t = this.sim.towers.find((x) => x.id === this.selectedTowerId);
    if (!t) {
      overlay.classList.add("hidden");
      return;
    }
    overlay.classList.remove("hidden");
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
    const c = this.board.cellScreenCenter(t.cell.x, t.cell.y);
    const pad = 8;
    const w = overlay.offsetWidth || 148;
    const appW = this.ui.clientWidth || 360;
    let left = c.x;
    left = Math.max(pad + w / 2, Math.min(appW - pad - w / 2, left));
    overlay.style.left = `${left}px`;
    overlay.style.top = `${c.y - this.board.cell * 0.55}px`;
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
      this.selectedTowerId = tower.id;
      this.syncTowerOverlay();
      return;
    }
    this.selectedTowerId = -1;
    this.syncTowerOverlay();
    if (this.tool === "wall") {
      this.handlePlace(this.sim.tryPlaceWall(cell.x, cell.y), "Wall");
    } else {
      this.handlePlace(this.sim.tryPlaceTower(cell.x, cell.y, this.slot), "Tower");
    }
  }

  handlePlace(res, label) {
    if (res.ok) {
      this.synth.play("place");
      const extra =
        res.surcharge > 0 ? ` (+${res.surcharge} board tax)` : "";
      this.toast(`${label} placed${extra}`);
      this.refreshHud();
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
    const prevBest = this.meta.bestWave | 0;
    this.meta.aether = this.sim.economy.aether;
    this.meta.forge = this.sim.economy.forge;
    this.meta.bestWave = Math.max(prevBest, this.sim.waveIndex);
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
        this.undo.push({ kind: "tower", id: e.tower.id });
        this.renderGameChrome();
        break;
      case "wall_placed":
        this.undo.push({ kind: "wall", id: e.wall.id });
        this.renderGameChrome();
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
    this.paused = false;
    this.composeOpen = false;
    this.sim.startWave();
    this.synth.play("wave");
    this.score.setWave(this.sim.waveIndex);
    this.toast(`Wave ${this.sim.waveIndex}`);
    this.refreshHud();
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
    this.synth.play("ui");
    this.status = `Slot ${this.forgeSlot + 1}: set ${kind}`;
    this.showForge();
  }

  clearForgeSlot() {
    this.meta.roster[this.forgeSlot] = makeSlot("", "", "", this.meta.levelCap);
    this.persistMeta();
    this.status = `Slot ${this.forgeSlot + 1} cleared`;
    this.showForge();
  }

  buyTechNode(id) {
    const node = getTechNode(id);
    if (!node) return;
    const rank = techRank(this.meta, id);
    if (rank >= node.maxRank) return this.toast("Already maxed");
    if (!techRequiresMet(this.meta, node)) return this.toast("Locked — buy prior tech first");
    if (!techPartOwned(this.meta, node, ownsPart)) return this.toast("Unlock the payload first");
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
    this.synth.play("confirm");
    this.status = `${node.name} → ${rank + 1}/${node.maxRank}`;
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

  undoLast() {
    const last = this.undo.pop();
    if (!last) return this.toast("Nothing to undo");
    if (last.kind === "tower") this.sim.trySellTower(last.id);
    else this.sim.trySellWall(last.id);
    this.synth.play("sell");
    this.toast("Undid last place");
  }

  sellSelected() {
    if (this.selectedTowerId < 0) return this.toast("Tap a tower first");
    const res = this.sim.trySellTower(this.selectedTowerId);
    if (res.ok) {
      this.selectedTowerId = -1;
      this.synth.play("sell");
      this.toast(`Sold (+${res.refund} Coin)`);
      this.syncTowerOverlay();
    }
  }

}
