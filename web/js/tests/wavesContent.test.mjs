import { SimWorld } from "../sim/simWorld.js";
import { WAVE_PACKS, composeEndlessWave, resolveCampaignWave } from "../data/waveScripts.js";
import { ENEMY_KINDS, resolveEnemyKind } from "../data/enemies.js";
import { CAMPAIGN_LEVELS } from "../data/campaign.js";
import { mulberry32 } from "../sim/rng.js";
import { buildAttackPlan } from "../sim/attackPlan.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const packKinds = new Set();
for (const id of Object.keys(WAVE_PACKS)) {
  const pack = WAVE_PACKS[id];
  if (!Array.isArray(pack)) continue;
  for (const k of pack) packKinds.add(k);
}
assert(packKinds.has("ward"), "packs include ward");
assert(packKinds.has("cask"), "packs include cask");
assert(packKinds.has("claim"), "packs include claim");
assert(packKinds.has("hauler_ceramite"), "packs include ceramite");

assert(CAMPAIGN_LEVELS.length >= 7, "campaign has Act II levels");
assert(
  CAMPAIGN_LEVELS[4].waves?.length === CAMPAIGN_LEVELS[4].wavesToWin,
  "level 5 authored waves match wavesToWin"
);
assert(CAMPAIGN_LEVELS[6].id === 7, "level 7 Ash Causeway");

for (const lv of CAMPAIGN_LEVELS) {
  assert(lv.waves.length === lv.wavesToWin, `${lv.name} wave count`);
  for (const def of lv.waves) {
    const r = resolveCampaignWave(def, 1);
    assert(r.queue.length > 0, `${lv.name} wave has queue`);
    assert(r.speedMult > 0, `${lv.name} has speedMult`);
    for (const k of r.queue) assert(ENEMY_KINDS[k], `known kind ${k}`);
  }
}

const r1 = composeEndlessWave(1, mulberry32(1));
const r2 = composeEndlessWave(1, mulberry32(2));
assert(r1.queue.length > 0, "endless wave 1 queues");
assert(r1.theme, "endless has theme");
const same =
  r1.queue.join(",") === r2.queue.join(",") && r1.spawnGap === r2.spawnGap;
assert(!same || r1.queue.length >= 3, "endless RNG varies or still valid");

const late = composeEndlessWave(12, mulberry32(99));
assert(late.queue.length >= 5, "late endless has bulk");
assert(typeof late.theme === "string", "endless theme string");
let sawEventField = false;
for (let i = 0; i < 40; i++) {
  const p = composeEndlessWave(10, mulberry32(1000 + i));
  if ("event" in p) sawEventField = true;
  if (p.event) break;
}
assert(sawEventField, "endless plan exposes event field");

assert(resolveEnemyKind("boss") === "claim", "alias boss→claim");
assert(resolveEnemyKind("grub") === "mite", "alias grub→mite");
assert(resolveEnemyKind("fast") === "courier", "alias fast→courier");

const world = new SimWorld();
world.setup(9, 8, 42, true);
world.runSeed = 42;
const boss = world.waves.makeEnemy("claim", 10);
assert(boss.hp > 100, "claim is tanky");
assert(boss.boss === true, "claim flagged boss");
assert(boss.armorKind === "plate", "claim has plate armor");
assert(boss.ballast === "high", "claim high ballast");
const sh = world.waves.makeEnemy("ward", 5);
assert(sh.shieldHp > 0, "ward has shield");
const sp = world.waves.makeEnemy("cask", 5);
assert(sp.splitsInto === 2, "cask splits");
assert(sp.splitKind === "mite", "cask splits into mites");
const leech = world.waves.makeEnemy("siphon", 3);
assert(leech.regen > 0, "siphon regenerates");
assert(leech.armorKind === "none", "siphon is soft meat");
const ceram = world.waves.makeEnemy("hauler_ceramite", 12);
assert(ceram.armorKind === "insulated", "ceramite insulated");
const volt = world.waves.makeEnemy("ward_volt", 14);
assert(volt.energyBlock === true, "volt ward energy block");

const empPlan = buildAttackPlan("sentry", "single", "emp", 1, {});
assert(empPlan.emp === true, "EMP plan flag");

const before = world.economy.battle;
world.startWave({ earlyBonus: 5 });
assert(world.waves.toSpawn > 0, "wave queues spawns");
assert(world.economy.battle === before + 5, "early bonus applied");
assert(world.actionLog.some((a) => a.type === "call"), "call logged");

const camp = new SimWorld();
camp.setup(8, 8, 1001, false);
camp.campaignWaves = CAMPAIGN_LEVELS[0].waves;
camp.wavesToWin = CAMPAIGN_LEVELS[0].wavesToWin;
camp.startWave({});
assert(camp.waves.lastTheme === "campaign", "campaign theme tag");
assert(
  camp.waves.toSpawn === resolveCampaignWave(CAMPAIGN_LEVELS[0].waves[0], 1).queue.length,
  "campaign wave 1 size"
);
assert(Math.abs(camp.waves._waveSpeedMult - 0.85) < 0.001, "campaign wave 1 speedMult");

console.log("ALL wavesContent tests passed");
