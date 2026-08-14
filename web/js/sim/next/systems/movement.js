/**
 * Enemy movement system — ported verbatim from SimWorld._tickEnemies and
 * _advance: death/splits/kiln spawns in array order, regen, gliding, leaks,
 * game-over. The iteration order and float sequence are the parity contract.
 */
import { ballastSlowFactor } from "../../../data/enemies.js";
import { emit } from "../state.js";
import { makeEnemy } from "./waves.js";

export function tickEnemies(state) {
  const enemies = state.enemies;
  for (let i = 0; i < enemies.length; ) {
    const e = enemies[i];
    if (e.hp <= 0) {
      state.killCount = (state.killCount | 0) + 1;
      state.economy.battle += e.battleDrop || 1;
      if ((e.splitsInto | 0) > 0) {
        const childKind = e.splitKind || "mite";
        for (let s = 0; s < e.splitsInto; s++) {
          const child = makeEnemy(state, childKind, state.waves.index, {
            scale: 0.55,
            pos: {
              x: e.pos.x + (s === 0 ? -0.15 : 0.15),
              y: e.pos.y,
            },
            cell: { x: e.cell.x, y: e.cell.y },
          });
          child.battleDrop = 1;
          enemies.push(child);
        }
      }
      emit(state, "enemy_killed", { enemy: e, drop: e.battleDrop || 1 });
      enemies.splice(i, 1);
      continue;
    }
    // Leech regen
    if ((e.regen || 0) > 0 && e.hp < e.maxHp) {
      e._regenAcc = (e._regenAcc || 0) + state.dt;
      if (e._regenAcc >= 0.5) {
        e._regenAcc = 0;
        e.hp = Math.min(e.maxHp, e.hp + e.regen * 0.5);
      }
    }
    // Kiln spawner: periodically bakes a mite out of the trail behind it
    if ((e.spawns | 0) > 0 && (e.spawnedTotal | 0) < e.spawns) {
      e._spawnAcc = (e._spawnAcc || 0) + state.dt;
      if (e._spawnAcc >= (e.spawnEvery || 7)) {
        e._spawnAcc = 0;
        e.spawnedTotal = (e.spawnedTotal | 0) + 1;
        const child = makeEnemy(state, e.spawnKind || "mite", state.waves.index, {
          scale: 1,
          pos: { x: e.pos.x - 0.12, y: e.pos.y - 0.12 },
          cell: { x: e.cell.x, y: e.cell.y },
        });
        child.battleDrop = 1;
        enemies.push(child);
      }
    }
    advance(state, e);
    if (e.reachedExit) {
      state.leakCount = (state.leakCount | 0) + 1;
      state.lives = Math.max(0, state.lives - (e.leakDamage || 1));
      emit(state, "leak", { enemy: e, lives: state.lives });
      enemies.splice(i, 1);
      if (state.lives <= 0) {
        state.running = false;
        emit(state, "game_over", {});
      }
      continue;
    }
    i++;
  }
}

/** Ported verbatim from SimWorld._advance (float sequence is the contract). */
function advance(state, e) {
  const slowRaw = Math.min(1, e.slowAmount || 0);
  const slow = Math.min(1, slowRaw * ballastSlowFactor(e.ballast || "mid"));
  if (slow >= 1) return;
  let remaining = e.speed * (1 - slow) * state.dt;
  const g = state.grid;
  while (remaining > 0 && !e.reachedExit) {
    const cx = e.cell.x;
    const cy = e.cell.y;
    if (g.isExit(cx, cy)) {
      e.reachedExit = true;
      return;
    }
    const next = e.flying
      ? g.nextAir(cx, cy)
      : g.pickNextGround(cx, cy, {
          id: e.id,
          tick: state.tickIndex | 0,
          avoidTowers: !e.ignoreTowerAvoid,
          entity: e,
        });
    if (next.x === cx && next.y === cy) {
      if (g.isExit(cx, cy)) e.reachedExit = true;
      return;
    }
    const tx = next.x + 0.5;
    const ty = next.y + 0.5;
    const dx = tx - e.pos.x;
    const dy = ty - e.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 1e-6) {
      e.pos.x = tx;
      e.pos.y = ty;
      e.cell = { x: next.x, y: next.y };
      if (g.isExit(next.x, next.y)) {
        e.reachedExit = true;
        return;
      }
      continue;
    }
    if (remaining >= dist) {
      e.pos.x = tx;
      e.pos.y = ty;
      e.cell = { x: next.x, y: next.y };
      remaining -= dist;
      if (g.isExit(next.x, next.y)) {
        e.reachedExit = true;
        return;
      }
      continue;
    } else {
      e.pos.x += (dx / dist) * remaining;
      e.pos.y += (dy / dist) * remaining;
      remaining = 0;
    }
  }
}
