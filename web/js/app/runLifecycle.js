/** Extracted from App — pure move, no gameplay changes. */
import { ENDLESS_GRID } from "../data/endlessGrid.js";
import { Sim } from "../sim/sim.js";
import { confirmSheet } from "../ui/modal.js";
import { BASE_START_CASH } from "../data/techTree.js";
import {
  hasEndless,
  clearEndless,
  loadEndless,
} from "../saveStore.js";
import { getCampaignLevel, isLevelUnlocked, levelPortalCell } from "../data/campaign.js";
import * as ends from "../ui/endScreens.js";
import { applyRunTech, syncSimFromMeta } from "./metaSync.js";
import { clearUndoStack, clearPlaceConfirm } from "./placeUndo.js";
import { renderGameChrome } from "./gameChrome.js";

const ACT_TEMPO_OFFSET = {
  Outskirts: 0,
  Foundry: 6,
  "Deep Vein": 12,
};

export function newRun(app, seed, { skipConfirm = false } = {}) {
  if (!skipConfirm && hasEndless()) {
    confirmSheet(app.ui, {
      mark: "Vein",
      title: "New Claim?",
      note: "Your checkpoint — the board, the Coin, the wave — is overwritten.",
      confirmLabel: "New Run",
    }).then((yes) => {
      if (yes) startNewRun(app, seed);
    });
    return;
  }
  startNewRun(app, seed);
}

function startNewRun(app, seed) {
  clearEndless();
  const runSeed = (seed >>> 0) || ((Math.random() * 0xffffffff) | 1);
  app.sim = new Sim();
  app.sim.setup(ENDLESS_GRID.cols, ENDLESS_GRID.rows, runSeed, true);
  app.sim.state.runSeed = runSeed;
  applyRunTech(app, app.sim, { battleBase: BASE_START_CASH });
  app.fx.clear();
  app._ghost = null;
  clearUndoStack(app);
  app.wireSim();
  app.interaction.tool = "tower";
  app.interaction.slot = -1;
  app.interaction.selectedTowerId = -1;
  app.interaction.selectedWallId = -1;
  app.paused = false;
  app.speed = 1;
  app.accum = 0;
  app.interaction.placeConfirm = null;
  app.interaction.liveCompose = false;
  app.playtestFromEditor = false;
  app._ffHeld = false;
  app._speedBeforeFf = undefined;
  app.board.setAtmosphere?.("default");
  app.palette.setAtmosphere?.("default");
  enterGame(app);
  app.toast(`Seed ${runSeed >>> 0}`);
  
}

export function continueRun(app) {
  const blob = loadEndless();
  if (!blob) return ends.showEndlessHub(app);
  app.sim = new Sim();
  app.sim.loadCheckpoint(blob);
  const savedWave = blob.wave | 0;
  const phase = blob.phase === "betweenWaves" ? "betweenWaves" : "inWave";
  // inWave: Continue = start of last wave started (roll back so Call restarts it).
  // betweenWaves: keep post-clear board; Call starts the next wave.
  if (phase === "inWave" && savedWave > 0) {
    app.sim.state.waves.index = savedWave - 1;
  }
  // Meta currencies are vault truth — inject current meta, not stale checkpoint forge/aether.
  syncSimFromMeta(app, app.sim, { seedVault: true });
  // Align applied-gains cursor so syncMetaProgress won't re-credit runWaveGains.
  app.sim.state.metaAppliedGains = {
    parts: app.sim.state.economy.runWaveGains.parts | 0,
    aether: app.sim.state.economy.runWaveGains.aether | 0,
  };
  app.fx.clear();
  clearUndoStack(app);
  app.wireSim();
  app.interaction.tool = "tower";
  app.interaction.slot = 0;
  app.interaction.selectedTowerId = -1;
  app.interaction.selectedWallId = -1;
  app.paused = false;
  app.speed = 1;
  app.accum = 0;
  app.interaction.placeConfirm = null;
  app._ffHeld = false;
  app._speedBeforeFf = undefined;
  enterGame(app);
  if (phase === "betweenWaves") {
    app.toast(`Between waves — Call Wave ${(savedWave | 0) + 1}`);
  } else {
    app.toast(`Checkpoint loaded — Call Wave ${savedWave || 1}`);
  }
  
}

export function startCampaignLevel(app, levelId) {
  const lv = getCampaignLevel(levelId);
  if (!lv) return;
  if (!isLevelUnlocked(levelId, app.meta.campaign?.cleared || [])) {
    app.toast("Clear the previous level first");
    return;
  }
  app.playtestFromEditor = false;
  // Atmosphere before boot so the first game paint isn't a second theme flash.
  app.board.setAtmosphere?.(lv.atmosphere || `campaign_${lv.id}`);
  app.palette.setAtmosphere?.(lv.atmosphere || `campaign_${lv.id}`);
  bootLevel(app, lv);
  const slot = Math.max(0, Math.min(app.prepSlot | 0, (app.meta.slotCount | 0) - 1));
  app.interaction.slot = slot;
  app.toast(`${lv.name}: portal locked. Call Wave 1 when ready.`);
  
}

export function playtestEditorLevel(app, lv) {
  if (!lv) return;
  app.playtestFromEditor = true;
  bootLevel(app, { ...lv, id: 0 });
  app.toast(`Playtest · ${lv.name}`);
  
}

function bootLevel(app, lv) {
  app.sim = new Sim();
  app.sim.setup(lv.cols, lv.rows, lv.seed || 1, false);
  app.sim.state.runSeed = (lv.seed || 1) >>> 0;
  app.sim.state.campaignLevelId = lv.id || 0;
  app.sim.state.wavesToWin = lv.wavesToWin;
  app.sim.state.campaignAct = lv.act || null;
  // Prefer authored `waves`; migrate legacy editor `waveScripts` pack ids.
  app.sim.state.campaignWaves =
    lv.waves ||
    (Array.isArray(lv.waveScripts)
      ? lv.waveScripts.map((pack) => ({ pack, spawnGap: 0.4 }))
      : null);
  applyRunTech(app, app.sim, { battleBase: lv.coinGrant || BASE_START_CASH });
  app.sim.applyPreWalls(lv.preWalls || []);
  // Campaign seam is static per level; later levels may spawn off the back line.
  const pc = levelPortalCell(lv);
  if (app.sim.state.grid.groundDist[app.sim.state.grid.idx(pc.x, pc.y)] >= 1_000_000) {
    // Picked cell walled by preWalls — fall back to nearest reachable seam cell
    for (let x = 0; x < app.sim.state.grid.cols; x++) {
      if (app.sim.state.grid.groundDist[app.sim.state.grid.idx(x, 0)] < 1_000_000) {
        pc.x = x;
        pc.y = 0;
        break;
      }
    }
  }
  app.sim.state.portal = pc;
  // Pass portal behavior to sim for clump spawning
  app.sim.state.campaignPortalBehavior = lv.portalBehavior || "static";
  app.fx.clear();
  app._ghost = null;
  clearUndoStack(app);
  app.wireSim();
  app.interaction.tool = "tower";
  app.interaction.slot = 0;
  app.interaction.selectedTowerId = -1;
  app.interaction.selectedWallId = -1;
  app.paused = false;
  app.speed = 1;
  app.accum = 0;
  app.interaction.placeConfirm = null;
  app.interaction.liveCompose = false;
  app._ffHeld = false;
  app._speedBeforeFf = undefined;
  enterGame(app);
  
}

export function enterGame(app) {
  app.screen = "game";
  if (app.sim && app.interaction.slot >= app.sim.state.roster.length) app.interaction.slot = 0;
  clearPlaceConfirm(app);
  app.clearHand();
  app.score.setWave(app.sim?.state?.waves.index || 1);
  const act = app.sim?.state?.campaignAct;
  app.score.setWaveOffset(act ? (ACT_TEMPO_OFFSET[act] || 0) : 0);
  app.score.setSpeed(app.speed || 1);
  app.score.setPhase(app.sim?.state?.checkpointPhase || "betweenWaves");
  app.score.setPaused(!!app.paused);
  app.score.setEnabled(app.meta.settings?.music !== false);
  app.score.setMusicVolume(app.meta.settings?.musicVolume ?? 0.4);
  app.score.start();
  app.unlockAudio();
  renderGameChrome(app);
  // Forge-themed molten metal atmosphere for in-game
  app.board.setAtmosphere?.("forge");
  app.palette.setAtmosphere?.("forge");
  // Single fit + immediate paint — no hand-off zoom, no deferred second refit.
  app.board.prepareEntry?.();
  if (app.sim?.state?.modeEndless) {
    app.toast("Build, then Deploy. Hold for 5×.");
  }
  
}
