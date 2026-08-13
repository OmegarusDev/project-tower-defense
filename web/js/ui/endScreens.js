/** Extracted from App — pure move, no gameplay changes. */
import { hasEndless, loadEndless } from "../saveStore.js";
import { CAMPAIGN_LEVELS, getCampaignLevel, isLevelUnlocked } from "../data/campaign.js";
import { endlessThemeBlurb } from "./metaUi.js";

export function showEndlessHub(app) {
  app.screen = "hub";
  // Corrupt/partial checkpoints parse to null — treat as no checkpoint rather
  // than crashing the hub on blob.wave below.
  const blob = hasEndless() ? loadEndless() : null;
  const canContinue = blob !== null;
  const best = app.meta.bestWave | 0;
  const themes = endlessThemeBlurb();
  app.ui.innerHTML = `
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
            <span><i>Æ</i>${app.meta.aether}</span>
            <span><i>Parts</i>${app.meta.forge}</span>
          </div>
        </div>
        <div class="hub-card plate">
          <h3>${canContinue ? "Checkpoint" : "Ready"}</h3>
          <p style="text-align:left;color:var(--text);margin:0">
            ${
              canContinue
                ? `Wave <strong>${blob.wave}</strong> · seed ${blob.runSeed >>> 0}`
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
  app.bindUi();
  
}

export function showVictory(app, opts = {}) {
  app.screen = "victory";
  const id = app.sim?.campaignLevelId | 0;
  const lv = getCampaignLevel(id);
  const gains = app.sim?.economy?.runWaveGains || { coin: 0, parts: 0, aether: 0 };
  const firstBonus = opts.firstClear ? 8 : 0;
  const next = CAMPAIGN_LEVELS.find((l) => l.id === id + 1);
  const nextOpen = next && isLevelUnlocked(next.id, app.meta.campaign?.cleared || []);
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
  app.ui.innerHTML = `
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
        <div class="end-totals">${vaultChipsHtml(app)}</div>
      </div>
      ${actions}
    </div>`;
  app.bindUi();
  
}

/** Vault chips — match in-run telemetry (gear / Æ); Gains keep full words. */
function vaultChipsHtml(app, bestWave = null) {
  const gear = `<svg class="tel-ico chip-ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.4.9h3.2l.25 1.45c.45.12.87.32 1.25.58l1.3-.7 1.6 1.6-.7 1.3c.26.38.46.8.58 1.25L15.1 6.4v3.2l-1.45.25a4.6 4.6 0 0 1-.58 1.25l.7 1.3-1.6 1.6-1.3-.7a4.6 4.6 0 0 1-1.25.58L9.6 15.1H6.4l-.25-1.45a4.6 4.6 0 0 1-1.25-.58l-1.3.7-1.6-1.6.7-1.3a4.6 4.6 0 0 1-.58-1.25L.9 9.6V6.4l1.45-.25c.12-.45.32-.87.58-1.25l-.7-1.3 1.6-1.6 1.3.7c.38-.26.8-.46 1.25-.58L6.4.9zm1.6 4.3a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z"/></svg>`;
  const best =
    bestWave == null
      ? ""
      : `<span class="chip wave" title="Best wave"><span class="k">Best</span><span class="chip-v">W${bestWave}</span></span>`;
  return `
    <span class="chip parts" title="Parts"><i class="chip-ico-wrap tel-gear">${gear}</i><span class="chip-v">${app.meta.forge}</span></span>
    <span class="chip aether" title="Aether"><i class="k">Æ</i><span class="chip-v">${app.meta.aether}</span></span>
    ${best}`;
  
}

/** Endless new personal best — double Parts/Aether earned this run (once, at death). */
export function applyEndlessBestBonus(app, prevBest) {
  if (!app.sim?.modeEndless) return null;
  const wave = app.sim.waveIndex | 0;
  if (wave <= (prevBest | 0)) return null;
  const g = app.sim.economy.runWaveGains;
  const bonusParts = g.parts | 0;
  const bonusAether = g.aether | 0;
  if (!bonusParts && !bonusAether) return { parts: 0, aether: 0, wave };
  app.sim.economy.forge += bonusParts;
  app.sim.economy.aether += bonusAether;
  g.parts = bonusParts * 2;
  g.aether = bonusAether * 2;
  return { parts: bonusParts, aether: bonusAether, wave };
  
}

export function showGameOver(app) {
  app.screen = "gameover";
  const endless = !!(app.sim && app.sim.modeEndless);
  const campaign = app.sim && !app.sim.modeEndless;
  const backAct = campaign ? "campaign" : "hub";
  const backLabel = campaign ? "Campaign Menu" : "Endless Menu";
  const lv = campaign ? getCampaignLevel(app.sim.campaignLevelId) : null;
  const wave = app.sim?.waveIndex ?? 0;
  const best = app.meta.bestWave | 0;
  const bonus = app._endBestBonus;
  const isBest = endless && !!bonus;
  const gains = app.sim?.economy?.runWaveGains || { coin: 0, parts: 0, aether: 0 };
  const gainLine = (n, label, kind = "") => {
    const muted = !(n > 0);
    const x2 = isBest && n > 0 && (kind === "parts" || kind === "aether");
    return `<span class="gain-pill ${kind}${muted ? " muted" : ""}${x2 ? " is-x2" : ""}">${
      n > 0 ? "+" : ""
    }${n}&nbsp;${label}${x2 ? `<span class="gain-x2">×2</span>` : ""}</span>`;
  };
  const seed = app.sim?.runSeed >>> 0;
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
  app.ui.innerHTML = `
    <div class="screen end-screen meta-enter${endless ? " end-endless" : ""}">
      <header class="end-hero">
        <h1 class="end-title">Fallen</h1>
        <p class="end-sub">${lv ? `${lv.name} · ` : ""}Wave</p>
        <div class="end-wave${isBest ? " is-best" : ""}">
          <span class="end-wave-num">${wave}</span>
          ${isBest ? `<span class="end-best-tag">New best</span>` : ""}
        </div>
        ${
          endless && best > 0 && !isBest
            ? `<p class="end-best-line">Best W${best}</p>`
            : ""
        }
        ${
          isBest && (bonus.parts || bonus.aether)
            ? `<p class="end-best-line end-bonus-line">Parts &amp; Aether ×2</p>`
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
        <div class="end-totals">${vaultChipsHtml(app, best)}</div>
      </div>
      ${actions}
    </div>`;
  app.bindUi();
  
}
