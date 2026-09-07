/**
 * Victory / game-over screen renderers — pure HTML of explicit state.
 */
import { CAMPAIGN_LEVELS, isLevelUnlocked, getCampaignLevel } from "../../data/campaign.js";
import { vaultChipsHtml } from "./helpers.js";
import { RULES } from "../../data/rules.js";

export function renderVictory(state) {
  const meta = state.meta;
  const sim = state.sim;
  const id = sim?.campaignLevelId | 0;
  const lv = getCampaignLevel(id);
  const gains = sim?.economy?.runWaveGains || { coin: 0, parts: 0, aether: 0 };
  const firstParts = state.firstClear ? RULES.FIRST_CLEAR_FORGE | 0 : 0;
  const firstAether = state.firstClear ? RULES.FIRST_CLEAR_AETHER | 0 : 0;
  const next = CAMPAIGN_LEVELS.find((l) => l.id === id + 1);
  const nextOpen = next && isLevelUnlocked(next.id, meta.campaign?.cleared || []);
  const actions = `
    <div class="end-actions">
      ${
        nextOpen
          ? `<button class="btn title-cta" data-act="prep:${next.id}">Next · ${next.name}</button>
        <p class="end-note next-job">${next.blurb}</p>`
          : ""
      }
      ${id > 0 ? `<button class="btn" data-act="start-level:${id}">Retry</button>` : ""}
      <button class="btn" data-act="forge-from-campaign">Forge</button>
      <button class="btn secondary" data-act="campaign">Campaign Menu</button>
      <button class="btn secondary" data-act="main">Main Menu</button>
    </div>`;
  return `
    <div class="screen end-screen meta-screen meta-enter">
      <div class="status-toast ${state.status ? "" : "empty"}" id="status">${state.status || ""}</div>
      <header class="end-hero">
        <h1 class="end-title">Clear</h1>
        <p class="end-sub">${lv ? lv.name : "Level"}</p>
        ${state.firstClear ? `<span class="end-best-tag">First clear</span>` : ""}
      </header>
      <div class="end-card">
        <h3>Gains</h3>
        <div class="end-gains">
          <span class="gain-pill parts">+${gains.parts} Parts</span>
          <span class="gain-pill aether">+${gains.aether} Aether</span>
          ${
            firstParts
              ? `<span class="gain-pill parts">+${firstParts} Parts · first</span>`
              : ""
          }
          ${
            firstAether
              ? `<span class="gain-pill aether">+${firstAether} Aether · first</span>`
              : ""
          }
        </div>
      </div>
      <div class="end-card end-card-totals">
        <h3>Totals</h3>
        <div class="end-totals">${vaultChipsHtml(meta)}</div>
      </div>
      ${actions}
    </div>`;
}

export function renderGameOver(state) {
  const meta = state.meta;
  const sim = state.sim;
  const endless = !!(sim && sim.modeEndless);
  const campaign = sim && !sim.modeEndless;
  const backAct = campaign ? "campaign" : "hub";
  const backLabel = campaign ? "Campaign Menu" : "Endless Menu";
  const lv = campaign ? getCampaignLevel(sim.campaignLevelId) : null;
  const wave = sim?.waves?.index ?? 0;
  const best = meta.bestWave | 0;
  const bonus = state.endBestBonus;
  const isBest = endless && !!bonus;
  const gains = sim?.economy?.runWaveGains || { coin: 0, parts: 0, aether: 0 };
  const gainLine = (n, label, kind = "") => {
    const muted = !(n > 0);
    const x2 = isBest && n > 0 && (kind === "parts" || kind === "aether");
    return `<span class="gain-pill ${kind}${muted ? " muted" : ""}${x2 ? " is-x2" : ""}">${
      n > 0 ? "+" : ""
    }${n}&nbsp;${label}${x2 ? `<span class="gain-x2">×2</span>` : ""}</span>`;
  };
  const seed = sim?.runSeed >>> 0;
  const actions = endless
    ? `<div class="end-actions">
        <button class="btn title-cta" data-act="newrun">New Run</button>
        <button class="btn" data-act="ghost-replay">Ghost Replay</button>
        <button class="btn" data-act="forge-from-hub">Forge</button>
        <button class="btn secondary" data-act="${backAct}">${backLabel}</button>
        <button class="btn secondary" data-act="main">Main Menu</button>
      </div>`
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
  return `
    <div class="screen end-screen meta-screen meta-enter${endless ? " end-endless" : ""}">
      <div class="status-toast ${state.status ? "" : "empty"}" id="status">${state.status || ""}</div>
      <header class="end-hero">
        <h1 class="end-title">Fallen</h1>
        <p class="end-sub">${lv ? lv.name : "Wave"}</p>
        ${lv?.blurb ? `<p class="end-job">${lv.blurb}</p>` : ""}
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
        <p class="end-note run-stats">Leaks ${sim?.leakCount || 0} · Kills ${
          sim?.killCount || 0
        } · Seed ${seed || "—"}</p>
      </div>
      <div class="end-card end-card-totals">
        <h3>Vault</h3>
        <div class="end-totals">${vaultChipsHtml(meta, best)}</div>
      </div>
      ${actions}
    </div>`;
}
