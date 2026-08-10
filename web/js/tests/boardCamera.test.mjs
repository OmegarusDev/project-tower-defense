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
setPitch(flatPitch);

console.log("ALL boardCamera tests passed");
