import { PARTS } from "../../data/parts.js";

/**
 * Targeting — fused range + doctrine scan. Iteration order (state.enemies)
 * and strict-`>` tie-breaking are the parity contract; do not reorder.
 */
export function selectTarget(state, t, plan) {
  const doctrine = plan.doctrine || PARTS.bases[t.base]?.doctrine || "first";
  const ox = t.cell.x + 0.5;
  const oy = t.cell.y + 0.5;
  // Weak air (Sentry chips flyers): dump into ground first so half-damage
  // air shots don't starve the lane. Dedicated AA (mult >= 1) competes normally.
  const weakAir = !!plan.airCapable && (plan.airDamageMult || 1) < 1;
  let best = null;
  let bestScore = -Infinity;
  let bestAir = null;
  let bestAirScore = -Infinity;
  let bestGround = null;
  let bestGroundScore = -Infinity;
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    if (e.flying && !plan.airCapable) continue;
    const dist = Math.hypot(e.pos.x - ox, e.pos.y - oy);
    if (dist > plan.rangeCells) continue;
    if (doctrine === "flying") {
      if (e.flying) {
        const s = -state.grid.airDist[state.grid.idx(e.cell.x, e.cell.y)];
        if (!bestAir || s > bestAirScore) {
          bestAir = e;
          bestAirScore = s;
        }
      }
      const s = e.flying
        ? -state.grid.airDist[state.grid.idx(e.cell.x, e.cell.y)]
        : -state.grid.groundDistance(e.cell.x, e.cell.y);
      if (!best || s > bestScore) {
        best = e;
        bestScore = s;
      }
    } else {
      let s = 0;
      switch (doctrine) {
        case "last":
          s = e.flying
            ? state.grid.airDist[state.grid.idx(e.cell.x, e.cell.y)]
            : state.grid.groundDistance(e.cell.x, e.cell.y);
          break;
        case "strongest":
          s = e.hp;
          break;
        case "weakest":
          s = -e.hp;
          break;
        case "closest":
          s = -dist;
          break;
        case "first":
        default:
          s = e.flying
            ? -state.grid.airDist[state.grid.idx(e.cell.x, e.cell.y)]
            : -state.grid.groundDistance(e.cell.x, e.cell.y);
      }
      if (weakAir) {
        if (e.flying) {
          if (!bestAir || s > bestAirScore) {
            bestAir = e;
            bestAirScore = s;
          }
        } else if (!bestGround || s > bestGroundScore) {
          bestGround = e;
          bestGroundScore = s;
        }
      } else if (!best || s > bestScore) {
        best = e;
        bestScore = s;
      }
    }
  }
  if (doctrine === "flying") return bestAir || best;
  if (weakAir) return bestGround || bestAir;
  return best;
}
