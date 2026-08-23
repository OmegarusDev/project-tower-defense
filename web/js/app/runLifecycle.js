/** Extracted from App — pure move, no gameplay changes. */
import { ENDLESS_GRID } from "../data/endlessGrid.js";
import { Sim as SimWorld } from "../sim/next/sim.js"; // swapped: next facade (SimWorld alias kept for call-site parity)
import { confirmSheet } from "../ui/next/modal.js";
import { BASE_START_CASH } from "../data/techTree.js";
import {
  hasEndless,
  clearEndless,
  loadEndless,
} from "../saveStore.js";
import { getCampaignLevel, isLevelUnlocked, levelPortalCell } from "../data/campaign.js";

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
  app.sim = new SimWorld();
  app.sim.setup(ENDLESS_GRID.cols, ENDLESS_GRID.rows, runSeed, true);
  app.sim.runSeed = runSeed;
  app._applyRunTech(app.sim, { battleBase: BASE_START_CASH });
  app.fx.clear();
  app._ghost = null;
  app.clearUndoStack();
app.wireSim();
  app.tool = "tower";
  app.slot = -1;
  app.selectedTowerId = -1;
  app.selectedWallId = -1;
  app.paused = false;
  app.speed = 1;
  app.accum = 0;
  app.placeConfirm = null;
  app.liveCompose = false;
  app.playtestFromEditor = false;
  app._ffHeld = false;
  app._speedBeforeFf = undefined;
  app.board.setAtmosphere?.("default");
  app.palette.setAtmosphere?.("default");
  app.enterGame();
  app.toast(`Seed ${runSeed >>> 0}`);
  
}

export function continueRun(app) {
  const blob = loadEndless();
  if (!blob) return app.showEndlessHub();
  app.sim = new SimWorld();
  app.sim.loadCheckpoint(blob);
  const savedWave = blob.wave | 0;
  const phase = blob.phase === "betweenWaves" ? "betweenWaves" : "inWave";
  // inWave: Continue = start of last wave started (roll back so Call restarts it).
  // betweenWaves: keep post-clear board; Call starts the next wave.
  if (phase === "inWave" && savedWave > 0) {
    app.sim.waveIndex = savedWave - 1;
  }
  // Meta currencies are vault truth — inject current meta, not stale checkpoint forge/aether.
  app._syncSimFromMeta(app.sim, { seedVault: true });
  // Align applied-gains cursor so syncMetaProgress won't re-credit runWaveGains.
  app.sim.metaAppliedGains = {
    parts: app.sim.economy.runWaveGains.parts | 0,
    aether: app.sim.economy.runWaveGains.aether | 0,
  };
  app.fx.clear();
  app.clearUndoStack();
  app.wireSim();
  app.tool = "tower";
  app.slot = 0;
  app.selectedTowerId = -1;
  app.selectedWallId = -1;
  app.paused = false;
  app.speed = 1;
  app.accum = 0;
  app.placeConfirm = null;
  app._ffHeld = false;
  app._speedBeforeFf = undefined;
  app.enterGame();
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
  app.slot = slot;
  app.toast(`${lv.name}: portal locked. Call Wave 1 when ready.`);
  
}

export function playtestEditorLevel(app, lv) {
  if (!lv) return;
  app.playtestFromEditor = true;
  bootLevel(app, { ...lv, id: 0 });
  app.toast(`Playtest · ${lv.name}`);
  
}

function bootLevel(app, lv) {
  app.sim = new SimWorld();
  app.sim.setup(lv.cols, lv.rows, lv.seed || 1, false);
  app.sim.runSeed = (lv.seed || 1) >>> 0;
  app.sim.campaignLevelId = lv.id || 0;
  app.sim.wavesToWin = lv.wavesToWin;
  app.sim.campaignAct = lv.act || null;
  // Prefer authored `waves`; migrate legacy editor `waveScripts` pack ids.
  app.sim.campaignWaves =
    lv.waves ||
    (Array.isArray(lv.waveScripts)
      ? lv.waveScripts.map((pack) => ({ pack, spawnGap: 0.4 }))
      : null);
  app._applyRunTech(app.sim, { battleBase: lv.coinGrant || BASE_START_CASH });
  app.sim.applyPreWalls(lv.preWalls || []);
  // Campaign seam is static per level; later levels may spawn off the back line.
  const pc = levelPortalCell(lv);
  if (app.sim.grid.groundDist[app.sim.grid.idx(pc.x, pc.y)] >= 1_000_000) {
    // Picked cell walled by preWalls — fall back to nearest reachable seam cell
    for (let x = 0; x < app.sim.grid.cols; x++) {
      if (app.sim.grid.groundDist[app.sim.grid.idx(x, 0)] < 1_000_000) {
        pc.x = x;
        pc.y = 0;
        break;
      }
    }
  }
  app.sim.portal = pc;
  // Pass portal behavior to sim for clump spawning
  app.sim.campaignPortalBehavior = lv.portalBehavior || "static";
  app.fx.clear();
  app._ghost = null;
  app.clearUndoStack();
  app.wireSim();
  app.tool = "tower";
  app.slot = 0;
  app.selectedTowerId = -1;
  app.selectedWallId = -1;
  app.paused = false;
  app.speed = 1;
  app.accum = 0;
  app.placeConfirm = null;
  app.liveCompose = false;
  app._ffHeld = false;
  app._speedBeforeFf = undefined;
  app.enterGame();
  
}

export function enterGame(app) {
  app.screen = "game";
  if (app.sim && app.slot >= app.sim.roster.length) app.slot = 0;
  app.clearPlaceConfirm();
  app.clearHand();
  app.score.setWave(app.sim?.waveIndex || 1);
  const act = app.sim?.campaignAct;
  app.score.setWaveOffset(act ? (ACT_TEMPO_OFFSET[act] || 0) : 0);
  app.score.setSpeed(app.speed || 1);
  app.score.setPhase(app.sim?.checkpointPhase || "betweenWaves");
  app.score.setPaused(!!app.paused);
  app.score.setEnabled(app.meta.settings?.music !== false);
  app.score.setMusicVolume(app.meta.settings?.musicVolume ?? 0.4);
  app.score.start();
  app.unlockAudio();
  app.renderGameChrome();
  // Single fit + immediate paint — no hand-off zoom, no deferred second refit.
  app.board.prepareEntry?.();
  if (app.sim?.modeEndless) {
    app.toast("Build, then Deploy. Hold for 5×.");
  }
  
}
