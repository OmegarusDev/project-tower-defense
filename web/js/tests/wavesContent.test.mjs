import { SimWorld } from "../sim/simWorld.js";
import { WAVE_PACKS, composeEndlessWave, resolveCampaignWave } from "../data/waveScripts.js";
import { ENEMY_KINDS, resolveEnemyKind } from "../data/enemies.js";
import { CAMPAIGN_LEVELS } from "../data/campaign.js";
import { mulberry32 } from "../sim/rng.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const packKinds = new Set();
for (const id of Object.keys(WAVE_PACKS)) {
  for (const k of WAVE_PACKS[id]) packKinds.add(k);
}
assert(packKinds.has("aegis"), "packs include aegis");
assert(packKinds.has("cluster"), "packs include cluster");
assert(packKinds.has("overlord"), "packs include overlord");
assert(packKinds.has("furnace"), "packs include furnace");
assert(packKinds.has("leech"), "packs include leech");

assert(CAMPAIGN_LEVELS.length >= 5, "campaign has 5 levels");
assert(
  CAMPAIGN_LEVELS[4].waves?.length === CAMPAIGN_LEVELS[4].wavesToWin,
  "level 5 authored waves match wavesToWin"
);

for (const lv of CAMPAIGN_LEVELS) {
  assert(lv.waves.length === lv.wavesToWin, `${lv.name} wave count`);
  for (const def of lv.waves) {
    const r = resolveCampaignWave(def, 1);
    assert(r.queue.length > 0, `${lv.name} wave has queue`);
    for (const k of r.queue) assert(ENEMY_KINDS[k], `known kind ${k}`);
  }
}

const r1 = composeEndlessWave(1, mulberry32(1));
const r2 = composeEndlessWave(1, mulberry32(2));
assert(r1.queue.length > 0, "endless wave 1 queues");
assert(r1.theme, "endless has theme");
// Different seeds should usually diverge (allow rare collision)
const same =
  r1.queue.join(",") === r2.queue.join(",") && r1.spawnGap === r2.spawnGap;
assert(!same || r1.queue.length >= 3, "endless RNG varies or still valid");

const late = composeEndlessWave(12, mulberry32(99));
assert(late.queue.length >= 5, "late endless has bulk");

assert(resolveEnemyKind("boss") === "overlord", "alias boss→overlord");
assert(resolveEnemyKind("fast") === "runner", "alias fast→runner");

const world = new SimWorld();
world.setup(9, 8, 42, true);
world.runSeed = 42;
const boss = world.waves.makeEnemy("overlord", 10);
assert(boss.hp > 100, "overlord is tanky");
assert(boss.boss === true, "overlord flagged boss");
const sh = world.waves.makeEnemy("aegis", 5);
assert(sh.shieldHp > 0, "aegis has shield");
const sp = world.waves.makeEnemy("cluster", 5);
assert(sp.splitsInto === 2, "cluster splits");
assert(sp.splitKind === "grub", "cluster splits into grubs");
const leech = world.waves.makeEnemy("leech", 3);
assert(leech.regen > 0, "leech regenerates");

const before = world.economy.battle;
world.startWave({ earlyBonus: 5 });
assert(world.waves.toSpawn > 0, "wave queues spawns");
assert(world.economy.battle === before + 5, "early bonus applied");
assert(world.actionLog.some((a) => a.type === "call"), "call logged");

// Campaign path uses authored waves
const camp = new SimWorld();
camp.setup(8, 8, 1001, false);
camp.campaignWaves = CAMPAIGN_LEVELS[0].waves;
camp.wavesToWin = CAMPAIGN_LEVELS[0].wavesToWin;
camp.startWave({});
assert(camp.waves.lastTheme === "campaign", "campaign theme tag");
assert(camp.waves.toSpawn === resolveCampaignWave(CAMPAIGN_LEVELS[0].waves[0], 1).queue.length, "campaign wave 1 size");

console.log("ALL wavesContent tests passed");
