/** Extracted from App — pure move, no gameplay changes. */
import {
  saveEndless,
  clearEndless,
} from "../saveStore.js";
import { partLabel } from "../data/parts.js";
import { exportReplayBlob, applyReplayAction } from "../ui/replay.js";

export function onSimEvent(app, e) {
  switch (e.kind) {
    case "wave_checkpoint":
      app.clearUndoStack();
      if (app.sim.modeEndless) {
        app.sim.checkpointPhase = "inWave";
        saveEndless(app.sim.checkpoint());
      }
      break;
    case "wave_composition": {
      const theme = e.theme || "";
      const event = e.event || "";
      if (app.sim.modeEndless) {
        const atmo = event || theme;
        if (atmo && atmo !== "campaign") {
          app.board?.setAtmosphere?.(atmo);
          app.palette.setAtmosphere?.(atmo);
        }
        if (event) {
          app.toast(`Event · ${event.replace(/_/g, " ")}`);
        } else if (theme && theme !== "campaign") {
          app.toast(`Theme · ${theme}`);
        }
      }
      app._refreshThemeChip?.(theme, event);
      break;
    }
    case "enemy_killed":
      if (app.meta.settings?.particles !== false && e.enemy?.pos) {
        app.fx.death(
          e.enemy.pos.x,
          e.enemy.pos.y,
          e.enemy.kind || "soft",
          e.enemy.armorKind || "none"
        );
        app.board?.addStain?.(e.enemy.pos.x, e.enemy.pos.y, e.enemy.boss ? "fire" : "kinetic");
      }
      if (e.enemy?.boss) app.board?.punch?.(3.5);
      break;
    case "tower_placed":
      if (e.tower?.id != null) app.pushUndo({ type: "place_tower", id: e.tower.id });
      app.board?.invalidateStatic?.();
      app.refreshHud();
      break;
    case "wall_placed":
      if (e.wall?.id != null) app.pushUndo({ type: "place_wall", id: e.wall.id });
      app.board?.invalidateStatic?.();
      app.refreshHud();
      break;
    case "tower_sold":
    case "wall_sold":
      app.board?.invalidateStatic?.();
      app.refreshHud();
      break;
    case "grid_grew":
      app.toast(`Map expands · ${e.rows} rows deep`);
      app.board?.onGridGrew?.();
      app.refreshHud();
      break;
    case "tower_fired":
      app.synth.play("shot", 0.95 + Math.random() * 0.1);
      if (e.towerId != null) app.board?.noteRecoil?.(e.towerId);
      if (app.meta.settings?.particles !== false && e.x != null) {
        app.fx.muzzle(e.x, e.y, e.angle || 0, e.damageType || "kinetic");
      }
      break;
    case "hit":
      app.synth.play("hit", 0.9 + Math.random() * 0.15);
      if (app.meta.settings?.particles !== false && e.x != null) {
        app.fx.hit(e.x, e.y, e.type || "kinetic");
        app.fx.damageNumber(e.x, e.y, e.damage || 0, e.type || "kinetic");
        app.board?.addStain?.(e.x, e.y, e.type || "kinetic");
      }
      if ((e.damage || 0) >= 40) app.board?.punch?.(2.5);
      break;
    case "leak":
      app.board?.bastionFlinch?.();
      app.synth.play("explode", 0.85);
      app.refreshHud();
      break;
    case "chain_arc":
      if (app.meta.settings?.particles !== false) {
        app.fx.chain(e.x0, e.y0, e.x1, e.y1);
      }
      break;
    case "status_fx":
      if (app.meta.settings?.particles !== false) {
        app.fx.statusPuff(e.x, e.y, e.type);
      }
      break;
    case "wave_cleared":
      app.synth.play("confirm");
      app.score.setWave(app.sim.waveIndex);
      {
        const gained = app.syncMetaProgress();
        app.sim.running = false;
        app.sim.checkpointPhase = "betweenWaves";
        if (app.sim.modeEndless) saveEndless(app.sim.checkpoint());
        const won =
          !app.sim.modeEndless &&
          app.sim.wavesToWin > 0 &&
          app.sim.waveIndex >= app.sim.wavesToWin;
        if (!won) {
          const bits = [`+${e.coin | 0} Coin`];
          if (e.parts) bits.push(`+${e.parts} Parts`);
          if (e.aether) bits.push(`+${e.aether} Aether`);
          const gift = gained.length ? ` · unlocked ${gained.join(", ")}` : "";
          app.toast(`Wave ${app.sim.waveIndex} cleared · ${bits.join(" · ")}${gift}`);
          app.refreshHud();
        }
      }
      break;
    case "victory":
      app.synth.play("confirm");
      app.onCampaignVictory();
      break;
    case "game_over":
      app.synth.play("explode");
      {
        const prevBest = app.meta.bestWave | 0;
        app._endBestBonus = app._applyEndlessBestBonus(prevBest);
        app.syncMetaProgress();
      }
      app._lastReplay = exportReplayBlob(app.sim);
      if (app.sim.modeEndless) clearEndless();
      app.score.stop();
      app.showGameOver();
      break;
    case "tower_leveled":
      app.synth.play("confirm");
      if (e.x != null && app.meta.settings?.particles !== false) {
        app.fx.hit(e.x, e.y, "shock");
        app.fx.statusPuff(e.x, e.y, "shock");
      }
      app.toast(`${partLabel(e.tower?.base)} → L${e.level}`);
      app.syncTowerOverlay();
      break;
    case "level_point_gained":
      app.syncTowerOverlay();
      break;
    default:
      break;
  }
  
}

export function onCampaignVictory(app) {
  const id = app.sim.campaignLevelId | 0;
  const cleared = new Set(app.meta.campaign?.cleared || []);
  const first = !cleared.has(id);
  if (id > 0) {
    cleared.add(id);
    app.meta.campaign = { cleared: [...cleared].sort((a, b) => a - b) };
  }
  app.syncMetaProgress();
  if (first && id > 0) {
    app.meta.aether = (app.meta.aether | 0) + 8;
    app.sim.economy.injectMeta(app.meta.forge, app.meta.aether);
  }
  app.persistMeta();
  app.score.stop();
  app.status = first && id > 0 ? "First clear · +8 Aether" : "Level cleared";
  app.showVictory({ firstClear: first && id > 0 });
  
}

export function callEarly(app) {
  if (!app.sim || app.paused) return;
  if (app.waveBusy()) {
    app.toast("Finish the current wave first");
    return;
  }
  if (
    !app.sim.modeEndless &&
    app.sim.wavesToWin > 0 &&
    app.sim.waveIndex >= app.sim.wavesToWin
  ) {
    app.toast("Level already complete");
    return;
  }
  app.clearPlaceConfirm();
  app.paused = false;
  const earlyBonus = 4 + Math.floor(app.sim.waveIndex * 0.5);
  const res = app.sim.startWave({ earlyBonus });
  app.synth.play("wave");
  app.score.setWave(app.sim.waveIndex);
  const got = res?.earlyBonus | 0;
  app.toast(
    got > 0
      ? `Wave ${app.sim.waveIndex} · +${got} Coin early`
      : `Wave ${app.sim.waveIndex}`
  );
  app.renderGameChrome();
  
}

export function startGhostReplay(app) {
  const blob = app._lastReplay;
  if (!blob?.actionLog?.length) {
    app.toast("No replay log from last run");
    return;
  }
  app.newRun(blob.runSeed, { skipConfirm: true });
  if (!app.sim) return;
  // Ghost owns the action log — clear live log so we don't double-record
  app.sim.actionLog = [];
  app._ghost = { log: blob.actionLog, i: 0, wait: 0.45 };
  app.toast("Ghost replay");
  
}

export function tickGhost(app, dt) {
  const g = app._ghost;
  if (!g || !app.sim || app.paused) return;
  g.wait -= dt;
  if (g.wait > 0) return;
  if (g.i >= g.log.length) {
    app._ghost = null;
    app.toast("Ghost replay finished");
    return;
  }
  // Wait for waves to clear before next call
  const act = g.log[g.i];
  if (act.type === "call" && app.waveBusy()) return;
  applyReplayAction(app.sim, act);
  g.i += 1;
  g.wait = act.type === "call" ? 0.2 : 0.15;
  app.refreshHud();
  
}
