import { BoardCamera, setPitch, VIEW25 } from "../view/view25.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function nearly(a, b, eps = 0.6) {
  return Math.abs(a - b) <= eps;
}

setPitch(24);
const cam = new BoardCamera();
cam.configure(20, 100, 36, 9, 12);

for (const [bx, by] of [
  [0, 0],
  [cam.W / 2, cam.H / 2],
  [cam.W - 1, cam.H - 1],
  [cam.cell * 2.5, cam.cell * 4.5],
]) {
  const p = cam.project(bx, by);
  const back = cam.unproject(p.x, p.y);
  assert(nearly(back.x, bx), `x roundtrip ${bx} → ${back.x}`);
  assert(nearly(back.y, by), `y roundtrip ${by} → ${back.y}`);
}

// Far rows must be shorter on screen than near rows (integrated depth)
const farH =
  cam.project(0, cam.cell).y - cam.project(0, 0).y;
const nearH =
  cam.project(0, cam.H).y - cam.project(0, cam.H - cam.cell).y;
assert(nearH > farH * 1.05, `near row (${nearH}) should exceed far row (${farH})`);

const flatPitch = VIEW25.pitchDeg;
setPitch(48);
const steepFar = VIEW25.farScale;
setPitch(12);
const flatFar = VIEW25.farScale;
assert(steepFar < flatFar, "steeper pitch should narrow the far edge more");

// Vertical exaggeration: high pitch (side-on) taller than low pitch (above)
setPitch(12);
const aboveExag = VIEW25.vExag;
const aboveRise = VIEW25.rise;
setPitch(48);
const flatExag = VIEW25.vExag;
const flatRise = VIEW25.rise;
assert(flatExag > aboveExag * 1.15, `vExag side-on (${flatExag}) should exceed above (${aboveExag})`);
assert(flatRise > aboveRise * 1.15, `rise side-on (${flatRise}) should exceed above (${aboveRise})`);
assert(VIEW25.vExag > 1, "side-on vExag should stretch taller than authored stack");
setPitch(flatPitch);

console.log("ALL boardCamera tests passed");
