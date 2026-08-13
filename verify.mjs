#!/usr/bin/env node
/**
 * Verification gate — run before every release.
 *   1. ESM parse-check every js/mjs file with node --check --input-type=module.
 *      (Plain `node --check` on .js silently accepts broken ESM — a stray
 *      brace once shipped and grey-screened the whole game in browsers.)
 *   2. Run every test file.
 * Usage: node verify.mjs   (from repo root; web/ is the app root)
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const WEB = join(process.cwd(), "web");
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|mjs)$/.test(e)) files.push(p);
  }
})(join(WEB, "js"));

let failed = 0;
console.log(`parse-checking ${files.length} modules…`);
for (const f of files) {
  // Pipe via stdin: --input-type=module only applies to string input, and
  // plain `node --check file.js` skips ESM files (the orphan-brace incident).
  const r = spawnSync(
    process.execPath,
    ["--check", "--input-type=module"],
    { stdio: "pipe", input: readFileSync(f) }
  );
  if (r.status !== 0) {
    failed++;
    console.log(`PARSE FAIL: ${relative(process.cwd(), f)}`);
    console.log(String(r.stderr).split("\n").slice(0, 4).join("\n"));
  }
}
if (failed) {
  console.error(`${failed} module(s) failed to parse — aborting.`);
  process.exit(1);
}
console.log("all modules parse OK");

const tests = readdirSync(join(WEB, "js", "tests"))
  .filter((f) => f.endsWith(".test.mjs"))
  .sort();
for (const t of tests) {
  const r = spawnSync(process.execPath, [join(WEB, "js", "tests", t)], {
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error(`TEST FAIL: ${t}`);
    process.exit(1);
  }
}
console.log(`${tests.length} test files passed.`);
