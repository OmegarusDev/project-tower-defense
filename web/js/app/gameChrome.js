/** Extracted from App — pure move, no gameplay changes. */
import {
  makeSlot,
  PARTS,
  ownsPart,
  partLabel,
  doctrineLabel,
  MAX_ROSTER_SLOTS,
  XP_TO_POINT,
} from "../data/parts.js";
import {
  formatTechCost,
  canAffordTech,
  nextRosterSlotUnlock,
} from "../data/techTree.js";
import { VIEW25 } from "../view/view25.js";
import { renderTower } from "../view/towerPainter.js";
import { forgePlanSummary } from "../ui/menuScreens.js";
import { partIconHtml } from "../ui/partIcons.js";

/** Always show S1–S6; locked slots stay visible until Roster tech unlocks them. */
  /** Live place quote for a roster index (game only). */
function gameSlotQuote(app, i) {
  const s = app.sim?.roster?.[i];
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
  const q = app.sim.economy.quoteTowerPlace(s.placeCost, app.sim.towers.length);
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

export function rosterSlotButtons(app, mode) {
  const unlocked = Math.max(
    0,
    Math.min(MAX_ROSTER_SLOTS, app.meta.slotCount | 0)
  );
  const roster = mode === "game" ? app.sim?.roster || [] : app.meta.roster || [];
  const nextSlot = mode === "forge" ? nextRosterSlotUnlock(app.meta) : null;
  const bits = [];
  for (let i = 0; i < MAX_ROSTER_SLOTS; i++) {
    if (i >= unlocked) {
      if (mode === "game") {
        bits.push(
          `<button type="button" class="slot-tile locked" data-act="slot-locked:${i}" title="Unlock Slot ${
            i + 1
          } in Tech Tree → Roster"><span class="slot-tile-idx">${i + 1}</span><span class="slot-tile-cost">lock</span></button>`
        );
      } else if (mode === "forge" && nextSlot && i === nextSlot.nextSlotIndex) {
        const costLabel = formatTechCost(nextSlot.cost);
        const can = canAffordTech(app.meta, nextSlot.cost);
        const cls = `btn slot-locked slot-unlock${can ? "" : " cant-afford"}`.trim();
        bits.push(
          `<button type="button" class="${cls}" data-act="forge-unlock-slot" title="Unlock Slot ${
            i + 1
          } for ${costLabel}">S${i + 1} · ${costLabel}</button>`
        );
      } else {
        bits.push(
          `<button type="button" class="btn slot-locked" data-act="slot-locked:${i}" title="Unlock earlier slots first">S${i + 1}</button>`
        );
      }
      continue;
    }
    const s = roster[i] || makeSlot("", "", "", app.meta.levelCap);
    if (mode === "forge") {
      const active = i === app.forgeSlot ? "active" : "";
      const mark = s.complete ? s.placeCost : "—";
      bits.push(
        `<button type="button" class="btn ${active}" data-act="forge-slot:${i}">S${i + 1} · ${mark}</button>`
      );
    } else {
      const active = app.tool === "tower" && i === app.slot ? "active" : "";
      const q = gameSlotQuote(app, i);
      const empty = q.complete ? "" : " empty";
      bits.push(
        `<button type="button" class="slot-tile ${active}${empty}" data-act="slot:${i}" data-build-slot="${i}" title="${q.tip}"><span class="slot-tile-idx">${i + 1}</span><canvas class="slot-preview" data-slot-preview="${i}" width="72" height="72" aria-hidden="true"></canvas><span class="slot-tile-cost">${q.costLabel}</span></button>`
      );
    }
  }
  return bits.join("");
  
}

export function waveBusy(app) {
  if (!app.sim) return false;
  return !!(app.sim.waves.waveActive || app.sim.enemies.length);
  
}

export function renderGameChrome(app) {
  app._previewTick = 0;
  if (!app.sim) return;
  const buildBtns = rosterSlotButtons(app, "game");
  const pitch = Math.round(app.meta.settings?.cameraPitch ?? VIEW25.pitchDeg);
  const endless = !!app.sim.modeEndless;
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
  const composeSheet = endless && app.liveCompose ? liveComposeHtml(app) : "";
  app.ui.innerHTML = `
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
      <aside class="left-tools" aria-label="Board tools">
        <div class="cam-rail plate" title="Camera pitch">
          <svg class="cam-glyph" viewBox="0 0 20 14" aria-hidden="true">
            <path d="M3.5 2.5h3L8 1h4l1.5 1.5h3A1.5 1.5 0 0 1 18 4v7.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 11.5V4a1.5 1.5 0 0 1 1.5-1.5z" fill="#c9a227" opacity="0.9"/>
            <circle cx="10" cy="8" r="3.2" fill="#1a2230" stroke="#8a7020" stroke-width="1"/>
            <circle cx="10" cy="8" r="1.5" fill="#e8e0d0" opacity="0.85"/>
          </svg>
          <input id="pitchLive" class="cam-pitch" type="range" min="8" max="58" step="1" value="${pitch}" orient="vertical" aria-label="Camera angle" />
        </div>
        ${composeBtn}
      </aside>
      ${composeSheet}
      <div class="status-toast ${app.status ? "" : "empty"}" id="status">${app.status}</div>
      <div class="tower-overlay hidden" id="towerOverlay">
        <div class="meta" id="towerMeta"></div>
        <div class="xp-line" id="towerXp"></div>
        <div class="tower-branch-row hidden" id="towerBranchRow" role="group" aria-label="Level branch">
          <button type="button" class="btn secondary branch-btn" data-act="level-branch:damage">Dmg</button>
          <button type="button" class="btn secondary branch-btn" data-act="level-branch:rof">ROF</button>
          <button type="button" class="btn secondary branch-btn" data-act="level-branch:range">Rng</button>
        </div>
        <div class="tower-overlay-acts">
          <button class="btn danger" data-act="sell">Sell</button>
        </div>
      </div>
      <footer class="dock">
        <div class="dock-head">
          <div class="dock-meta" id="slotline"></div>
          <button type="button" class="btn secondary undo-btn" data-act="undo" title="Undo (Z)" aria-label="Undo">Undo</button>
        </div>
        <div class="arsenal">
          <div class="arsenal-slots">${buildBtns}</div>
          <button type="button" class="wall-tile ${app.tool === "wall" ? "active" : ""}" data-act="tool:wall" id="wallBtn" title="Place wall">
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
  app.bindUi();
  app._bindCallButton(app.ui.querySelector("#callBtn"));
  app.ui.querySelector("#pitchLive")?.addEventListener("input", (e) => {
    app.applyPitch(+e.target.value);
  });
  refreshHud(app);
  paintSlotPreviews(app);
  if (app.paused) app._renderPauseSheet();
  
}

function liveComposeHtml(app) {
  const slot = app.meta.roster[app.slot] || makeSlot();
  const partBtn = (kind, id) => {
    const have = ownsPart(app.meta.owned, kind, id);
    if (!have) return "";
    const eq = slot[kind] === id ? " equipped" : "";
    return `<button class="btn part-btn part-chip${eq}" data-act="compose-part:${kind}:${id}"><span class="part-btn-inner">${partIconHtml(kind, id, { size: 14 })}<span class="part-btn-label">${partLabel(id)}</span></span></button>`;
  };
  return `
    <div class="compose-sheet plate" id="composeSheet">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:4px">
        <h3>Live Compose · Slot ${app.slot + 1}</h3>
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

export function toggleLiveCompose(app) {
  if (!app.sim?.modeEndless) return;
  app.liveCompose = !app.liveCompose;
  renderGameChrome(app);
  
}

export function applyLiveComposePart(app, kind, id) {
  if (!app.sim?.modeEndless) return;
  if (!ownsPart(app.meta.owned, kind, id)) return;
  const s = app.meta.roster[app.slot] || makeSlot("", "", "", app.meta.levelCap);
  s[kind] = id;
  app.meta.roster[app.slot] = makeSlot(s.base, s.barrel, s.payload, app.meta.levelCap);
  app.persistMeta();
  app._syncSimFromMeta(app.sim);
  app.synth.play("ui");
  renderGameChrome(app);
  
}

/** Tiny rotating loadout previews inside arsenal slot tiles. */
export function paintSlotPreviews(app, force = false) {
  if (app.screen !== "game" || !app.sim) return;
  // The previews rotate on a slow flourish — repaint at ~10fps, not 60.
  // force (pitch drag) paints immediately for real-time feedback.
  if (!force && (app._previewTick = (app._previewTick | 0) + 1) % 6 !== 0) return;
  const aim = app.slotPreviewAim || -Math.PI / 2;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const css = 40;
  for (let i = 0; i < MAX_ROSTER_SLOTS; i++) {
    const canvas = app.ui.querySelector(`[data-slot-preview="${i}"]`);
    if (!canvas) continue;
    const ctx = canvas.getContext("2d");
    if (canvas.width !== Math.floor(css * dpr)) {
      canvas.width = Math.floor(css * dpr);
      canvas.height = Math.floor(css * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, css, css);

    const slot = app.sim.roster?.[i];
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
    // No outer yScale — the painter owns ground-plane foreshortening
    // (foreshortenBarrel in the turret; vz()/deckRy on the base).
    renderTower(ctx, app.palette, t, px, py, size, { showBadge: false });
  }
  
}

/**
   * Live HUD sync — currencies, build-strip prices, call button, tower card.
   * Structure comes from renderGameChrome; prices always refresh here.
   */
export function refreshHud(app) {
  if (!app.sim || app.screen !== "game") return;
  const chips = app.ui.querySelector("#statChips");
  const st = app.ui.querySelector("#status");
  const callBtn = app.ui.querySelector("#callBtn");
  const callLabel = app.ui.querySelector("#callLabel");
  const callKicker = app.ui.querySelector(".call-kicker");
  const waveNum = app.ui.querySelector("#waveNum");
  const waveSub = app.ui.querySelector("#waveSub");
  if (!chips) return;

  const waveLabel = !app.sim.modeEndless && app.sim.wavesToWin
    ? `${app.sim.waveIndex}/${app.sim.wavesToWin}`
    : `${app.sim.waveIndex}`;
  if (waveNum) waveNum.textContent = waveLabel;
  if (waveSub) {
    if (!app.sim.modeEndless) {
      waveSub.textContent = `Lv ${app.sim.campaignLevelId}`;
      waveSub.classList.remove("hidden");
    } else {
      waveSub.textContent = "";
      waveSub.classList.add("hidden");
    }
  }
  refreshThemeChip(app, app.sim.waves?.lastTheme, app.sim.waves?.lastEvent);

  const gear = `<svg class="tel-ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.4.9h3.2l.25 1.45c.45.12.87.32 1.25.58l1.3-.7 1.6 1.6-.7 1.3c.26.38.46.8.58 1.25L15.1 6.4v3.2l-1.45.25a4.6 4.6 0 0 1-.58 1.25l.7 1.3-1.6 1.6-1.3-.7a4.6 4.6 0 0 1-1.25.58L9.6 15.1H6.4l-.25-1.45a4.6 4.6 0 0 1-1.25-.58l-1.3.7-1.6-1.6.7-1.3a4.6 4.6 0 0 1-.58-1.25L.9 9.6V6.4l1.45-.25c.12-.45.32-.87.58-1.25l-.7-1.3 1.6-1.6 1.3.7c.38-.26.8-.46 1.25-.58L6.4.9zm1.6 4.3a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z"/></svg>`;
  chips.innerHTML = `
    <span class="tel tel-lives" title="HP"><i>HP</i>${app.sim.lives}</span>
    <span class="tel-sep"></span>
    <span class="tel tel-coin" title="Coin"><i class="tel-curr">₡</i>${app.sim.economy.battle}</span>
    <span class="tel-sep"></span>
    <span class="tel tel-parts" title="Parts"><i class="tel-gear">${gear}</i>${app.sim.economy.forge}</span>
    <span class="tel-sep"></span>
    <span class="tel tel-aether" title="Aether"><i>Æ</i>${app.sim.economy.aether}</span>`;
  if (st) {
    st.textContent = app.status;
    st.classList.toggle("empty", !app.status);
  }

  syncBuildDock(app);

  if (callBtn) {
    const busy = waveBusy(app);
    const done =
      !app.sim.modeEndless &&
      app.sim.wavesToWin > 0 &&
      app.sim.waveIndex >= app.sim.wavesToWin;
    // Stay clickable while busy so hold-to-5× works; only lock when level is done.
    callBtn.disabled = done;
    callBtn.classList.toggle("busy", busy && !app._ffHeld);
    callBtn.classList.toggle("hot", !!app._ffHeld);
    callBtn.title = done
      ? "Complete"
      : busy || app._ffHeld
        ? "Hold for 5×"
        : "Tap to deploy · hold for 5×";
    if (callKicker) {
      callKicker.textContent = app._ffHeld ? "5×" : done ? "Done" : busy ? "Hold" : "Deploy";
    }
    if (callLabel) {
      callLabel.textContent = app._ffHeld
        ? "Speed"
        : busy
          ? "Live"
          : done
            ? "Clear"
            : `Wave ${app.sim.waveIndex + 1}`;
    }
  }
  syncTowerOverlay(app);
  
}

export function refreshThemeChip(app, theme, event) {
  const chip = app.ui?.querySelector("#themeChip");
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
function syncBuildDock(app) {
  if (!app.sim) return;
  for (let i = 0; i < MAX_ROSTER_SLOTS; i++) {
    const btn = app.ui.querySelector(`[data-build-slot="${i}"]`);
    if (!btn) continue;
    const q = gameSlotQuote(app, i);
    const costEl = btn.querySelector(".slot-tile-cost");
    if (costEl) costEl.textContent = q.costLabel;
    btn.title = q.tip;
    btn.classList.toggle("active", app.tool === "tower" && i === app.slot);
    btn.classList.toggle("empty", !q.complete);
  }
  const wallCost = app.sim.economy.wallCost(app.sim.playerWallCount());
  const wallBtn = app.ui.querySelector("#wallBtn");
  const wallCostEl = app.ui.querySelector("#wallCost");
  if (wallCostEl) wallCostEl.textContent = `${wallCost}`;
  if (wallBtn) {
    wallBtn.classList.toggle("active", app.tool === "wall");
    wallBtn.title = `Wall · ${wallCost} Coin`;
  }

  const slotLine = app.ui.querySelector("#slotline");
  if (!slotLine) return;
  if (app.tool === "wall") {
    slotLine.innerHTML = `<span class="dock-meta-k">Wall</span><span class="dock-meta-v">${wallCost} Coin</span>`;
    return;
  }
  const q = gameSlotQuote(app, app.slot);
  if (!q.complete) {
    slotLine.innerHTML = `<span class="dock-meta-k">Slot ${app.slot + 1}</span><span class="dock-meta-v warn">Set loadout in Forge</span>`;
    return;
  }
  const s = q.loadout;
  const tax = q.surcharge ? ` · +${q.surcharge} tax` : "";
  slotLine.innerHTML = `<span class="dock-meta-k">${partLabel(s.base)} · ${partLabel(s.barrel)} · ${partLabel(s.payload)}</span><span class="dock-meta-v">${q.total} Coin${tax}</span>`;
  
}

export function syncTowerOverlay(app) {
  const overlay = app.ui.querySelector("#towerOverlay");
  const meta = app.ui.querySelector("#towerMeta");
  const xpEl = app.ui.querySelector("#towerXp");
  const branchRow = app.ui.querySelector("#towerBranchRow");
  if (!overlay || !app.sim) return;

  const t = app.sim.towers.find((x) => x.id === app.selectedTowerId);
  const wall =
    app.selectedWallId >= 0
      ? app.sim.walls.find((w) => w.id === app.selectedWallId)
      : null;

  if (!t && !wall) {
    overlay.classList.add("hidden");
    return;
  }

  overlay.classList.remove("hidden");
  const cell = t ? t.cell : wall.cell;
  const rate = app.sim.sellRefundMult > 0 ? app.sim.sellRefundMult : 0.5;
  if (t) {
    const cap = t.levelCap || 1;
    const need = t.xpToPoint || XP_TO_POINT;
    const picks = t.pendingPicks | 0;
    const atCap = (t.level || 1) >= cap;
    const refund = (t.paid * rate) | 0;
    if (meta) {
      const doc = doctrineLabel(PARTS.bases[t.base]?.doctrine);
      meta.textContent = `${partLabel(t.base)} · ${doc} · L${t.level}/${cap}`;
    }
    if (xpEl) {
      const pickLine =
        picks > 0 ? ` · ${picks} pick${picks === 1 ? "" : "s"}` : "";
      xpEl.textContent = atCap
        ? picks > 0
          ? `Max level · ${picks} pick${picks === 1 ? "" : "s"}`
          : "Max level"
        : `XP ${t.xp | 0}/${need}${pickLine}`;
    }
    if (branchRow) {
      branchRow.classList.toggle("hidden", picks <= 0);
      branchRow.querySelectorAll("button").forEach((btn) => {
        btn.disabled = picks <= 0;
      });
    }
    const sellBtn = overlay.querySelector('[data-act="sell"]');
    if (sellBtn) sellBtn.textContent = `Sell · ${refund}`;
  } else {
    const refund = (wall.paid * rate) | 0;
    if (meta) meta.textContent = "Wall";
    if (xpEl) xpEl.textContent = `Sell for ${refund} Coin`;
    if (branchRow) branchRow.classList.add("hidden");
    const sellBtn = overlay.querySelector('[data-act="sell"]');
    if (sellBtn) sellBtn.textContent = `Sell · ${refund}`;
  }

  const c = app.board.cellScreenCenter(cell.x, cell.y);
  const pad = 8;
  const w = overlay.offsetWidth || 148;
  const h = overlay.offsetHeight || 96;
  const appW = app.ui.clientWidth || 360;
  const appH = app.ui.clientHeight || 640;
  let left = c.x;
  left = Math.max(pad + w / 2, Math.min(appW - pad - w / 2, left));
  let top = c.y - app.board.cell * 0.55;
  top = Math.max(pad + h, Math.min(appH - pad, top));
  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
  
}
