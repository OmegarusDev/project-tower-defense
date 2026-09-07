/**
 * Board scene renderers — barrel. Same exports as the former monolith;
 * boardView and probes keep `import * as S from "./boardScene.js"`.
 */
export { UNIT_SCALE, fillQuad, strokeQuad } from "./boardScene/geom.js";
export {
  drawBoardShadow,
  drawPlateLight,
  drawPlateRim,
  drawDepthFog,
  drawBracketAt,
  drawDeckTile,
  drawField,
  drawWall,
  drawBastion,
  drawStains,
} from "./boardScene/ground.js";
export {
  pathPoints,
  flowCellPaths,
  strokePts,
  strokePathLayers,
  drawPath,
  drawPortal,
  PortalAnimator,
} from "./boardScene/path.js";
export {
  drawEnemyFrame,
  drawProjectile,
  drawHover,
  drawPlanGhost,
  drawRangeRing,
  drawTowerFrame,
  drawPendingPlace,
} from "./boardScene/units.js";
export { drawAtmosphere } from "./boardScene/atmosphere.js";
