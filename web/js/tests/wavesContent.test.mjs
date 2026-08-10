import { SimWorld } from "../sim/simWorld.js";
import { WAVE_SCRIPTS, endlessScriptId } from "../data/waveScripts.js";
import { CAMPAIGN_LEVELS } from "../data/campaign.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const kinds = new Set();
for (const id of Object.keys(WAVE_SCRIPTS)) {
  for (const k of WAVE_SCRIPTS[id].kinds) kinds.add(k.kind);
}
assert(kinds.has("shielded"), "scripts include shielded");
assert(kinds.has("splitter"), "scripts include splitter");
assert(kinds.has("boss"), "scripts include boss");
assert(endlessScriptId(20) === "boss_gate", "wave 20 boss gate");

assert(CAMPAIGN_LEVELS.length >= 5, "campaign has 5 levels");
assert(CAMPAIGN_LEVELS[4].waveScripts?.length === CAMPAIGN_LEVELS[4].wavesToWin, "level 5 scripts match waves");

const world = new SimWorld();
world.setup(9, 8, 42, true);
world.runSeed = 42;
const boss = world.waves.makeEnemy("boss", 10);
assert(boss.hp > 100, "boss is tanky");
const sh = world.waves.makeEnemy("shielded", 5);
assert(sh.shieldHp > 0, "shielded has shield");
const sp = world.waves.makeEnemy("splitter", 5);
assert(sp.splitsInto === 2, "splitter splits");

const before = world.economy.battle;
world.startWave({ earlyBonus: 5 });
assert(world.waves.toSpawn > 0, "wave queues spawns");
assert(world.economy.battle === before + 5, "early bonus applied");
assert(world.actionLog.some((a) => a.type === "call"), "call logged");

console.log("ALL wavesContent tests passed");
