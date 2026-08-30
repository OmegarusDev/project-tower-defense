#!/usr/bin/env node
/**
 * One-command rebaseline — runs every corpus capture in order.
 * Use when you deliberately changed gameplay/rendering and need new goldens.
 *
 *   1. Start a server:  cd web && python3 -m http.server 8123 --bind 127.0.0.1 &
 *   2. Run:             node tools/corpus/rebaseline.mjs
 *   3. Review diff:     git diff --stat && git diff tools/corpus/out
 *   4. Commit:          git add tools/corpus/out && git commit
 *
 * Individual captures still work:
 *   node tools/corpus/simParity.mjs --capture
 *   node tools/corpus/boardParity.mjs --capture
 *   etc.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function run(cmd, args) {
  console.log(`\n=== ${cmd} ${args.join(" ")} ===`);
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`FAILED: ${cmd} ${args.join(" ")}`);
    process.exit(r.status || 1);
  }
}

function hasServer() {
  try {
    const r = spawnSync("curl", ["-sf", "http://127.0.0.1:8123/index.html"], { stdio: "pipe" });
    return r.status === 0;
  } catch { return false; }
}

if (!hasServer()) {
  console.error("No server at http://127.0.0.1:8123 — run: cd web && python3 -m http.server 8123 --bind 127.0.0.1 &");
  process.exit(1);
}

// Order matters: sim traces first (no browser), then browser goldens.
run("node", ["tools/corpus/simTrace.mjs"]); // always overwrites out/sim-traces.json

run("node", ["tools/corpus/boardParity.mjs", "--capture"]);
run("node", ["tools/corpus/renderParity.mjs", "--capture"]);
run("node", ["tools/corpus/uiParity.mjs", "--capture"]);
run("node", ["tools/corpus/chromeParity.mjs", "--capture"]);
run("node", ["tools/corpus/actionsParity.mjs", "--capture"]);
run("node", ["tools/corpus/capture.mjs"]); // screens + gallery (pngjs)

console.log("\nAll captures done. Review: git diff --stat && git diff tools/corpus/out");
