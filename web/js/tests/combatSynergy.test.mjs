/**
 * Combat refactor regression guards: cross-part synergies + enemy identity.
 * Run: node js/tests/combatSynergy.test.mjs
 */
import { Sim } from "../sim/sim.js";
import { buildAttackPlan } from "../sim/attackPlan.js";
import { enemyDef } from "../data/enemies.js";
import { makeEnemy } from "../sim/systems/waves.js";
import { tickEnemies } from "../sim/systems/movement.js";
import { tickCombat, tickStatus, applyHit, doChain, refreshEnemyAuras } from "../sim/systems/combat.js";
import { selectTarget } from "../sim/combat/targeting.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function freshWorld() {
  const w = new Sim();
  w.setup(9, 8, 7, true);
  return w;
}

// Burn x poison: flames cook the toxin — +50% poison tick while burning
{
  const w = freshWorld();
  const e = makeEnemy(w.state, "mite", 1);
  e.pos = { x: 4, y: 4 };
  w.state.enemies = [e];
  e.poisonT = 5;
  e.poisonDps = 2;
  e.poisonEvery = 0.5;
  e.poisonAcc = 0.49;
  e.burnT = 5;
  w.state.dt = 0.01;
  tickStatus(w.state);
  assert(Math.abs(e.hp - (e.maxHp - 3)) < 1e-9, "burning target takes +50% poison tick");
}

// Shred x fire: fully stripped plates lose their 0.55 heat block (direct hits)
{
  const w = freshWorld();
  const e = makeEnemy(w.state, "mite", 1);
  e.armorKind = "plate";
  e.armorFlat = 2;
  e.resist = {};
  w.state.enemies = [e];
  const fire = buildAttackPlan("sentry", "single", "pyro", 1, {});
  const hp0 = e.hp;
  applyHit(w.state, e, fire.damage, fire, null);
  const blocked = hp0 - e.hp;
  e.shred = 2;
  e._hitFlash = 0;
  const hp1 = e.hp;
  applyHit(w.state, e, fire.damage, fire, null);
  const stripped = hp1 - e.hp;
  assert(Math.abs(blocked - (8 * 0.55 - 2)) < 1e-9, "intact plate blocks fire");
  assert(Math.abs(stripped - 8) < 1e-9, "stripped plate takes full fire");
}

// Frost x shock: slowed enemies surge — shock deals +15% into them
{
  const w = freshWorld();
  const e = makeEnemy(w.state, "mite", 1);
  e.pos = { x: 4, y: 4 };
  w.state.enemies = [e];
  const shock = buildAttackPlan("sentry", "single", "shock", 1, {});
  const hp0 = e.hp;
  applyHit(w.state, e, shock.damage, shock, null);
  const plain = hp0 - e.hp;
  e.slowT = 5;
  e.slowAmount = 0.4;
  const hp1 = e.hp;
  applyHit(w.state, e, shock.damage, shock, null);
  const surged = hp1 - e.hp;
  assert(Math.abs(plain - 9) < 1e-9, "plain shock damage");
  assert(Math.abs(surged - 9 * 1.15) < 1e-9, "shock surges on slowed targets");
}

// Frost x shock: chains leap 40% further from a slowed source
{
  const w = freshWorld();
  const a = makeEnemy(w.state, "mite", 1);
  const b = makeEnemy(w.state, "mite", 1);
  a.pos = { x: 0, y: 0 };
  b.pos = { x: 2.9, y: 0 };
  w.state.enemies = [a, b];
  const shock = buildAttackPlan("sentry", "single", "shock", 1, {});
  doChain(w.state, a, shock.damage, shock, null, new Set([a.id]), shock.chainJumps);
  const miss = b.maxHp - b.hp;
  b.hp = b.maxHp;
  a.slowT = 5;
  a.slowAmount = 0.4;
  doChain(w.state, a, shock.damage, shock, null, new Set([a.id]), shock.chainJumps);
  const hit = b.maxHp - b.hp;
  assert(miss === 0, "chain cannot reach unslowed source at 2.9 (range 2.4)");
  assert(hit > 0, "chain reaches 2.9 from slowed source (2.4 x 1.4)");
}

// Ward shell aura: +1 armor flat to enemies inside its radius while alive
{
  const w = freshWorld();
  const ward = makeEnemy(w.state, "ward", 5);
  const close = makeEnemy(w.state, "mite", 1);
  const far = makeEnemy(w.state, "mite", 1);
  ward.pos = { x: 2, y: 2 };
  close.pos = { x: 2.4, y: 2.6 };
  far.pos = { x: 4.5, y: 2 };
  w.state.enemies = [ward, close, far];
  refreshEnemyAuras(w.state);
  assert(close.auraArmor === 1, "neighbor gains ward armor aura");
  assert(far.auraArmor === 0, "far enemy outside aura radius");
  const kinetic = buildAttackPlan("sentry", "single", "kinetic", 1, {});
  const hp0 = far.hp;
  applyHit(w.state, far, kinetic.damage, kinetic, null);
  const farLoss = hp0 - far.hp;
  const hp1 = close.hp;
  applyHit(w.state, close, kinetic.damage, kinetic, null);
  const closeLoss = hp1 - close.hp;
  assert(farLoss === 10, "no aura: full 10 kinetic");
  assert(closeLoss === 9, "aura: 1 armor absorbed");
}

// Kiln spawner: bakes mites out of the trail every spawnEvery seconds, capped
{
  const w = freshWorld();
  const kiln = makeEnemy(w.state, "kiln", 1);
  kiln.pos = { x: 3, y: 3 };
  kiln.cell = { x: 3, y: 3 };
  kiln.speed = 0;
  w.state.enemies = [kiln];
  w.state.dt = 1;
  for (let i = 0; i < 8; i++) tickEnemies(w.state);
  assert(kiln.spawnedTotal === 1, "kiln spawns once after 7s");
  assert(w.state.enemies.length === 2, "spawned mite joins the board");
  for (let i = 0; i < 22; i++) tickEnemies(w.state);
  assert(kiln.spawnedTotal === 4, "kiln spawns are capped at 4");
  const child = w.state.enemies.find((x) => x !== kiln);
  assert(child && child.battleDrop === 1, "spawned mites drop 1 battle");
}

// Def data: kiln carries spawn fields, ward carries aura fields
{
  assert(enemyDef("kiln").spawns === 4, "kiln def spawns 4");
  assert(enemyDef("kiln").spawnKind === "mite", "kiln spawns mites");
  assert(enemyDef("ward").aura.armor === 1, "ward def carries armor aura");
  assert(enemyDef("ward").aura.radius === 1.6, "ward aura radius");
}

// Sentry chips air at half damage and prefers ground while anything walks the lane
{
  const w = freshWorld();
  const plan = buildAttackPlan("sentry", "single", "kinetic", 1);
  const tower = { cell: { x: 4, y: 6 }, base: "sentry" };
  const mite = makeEnemy(w.state, "mite", 1);
  const duct = makeEnemy(w.state, "duct", 1);
  mite.hp = mite.maxHp = 100;
  duct.hp = duct.maxHp = 100;
  mite.pos = { x: 4.5, y: 4.5 };
  mite.cell = { x: 4, y: 4 };
  duct.pos = { x: 4.5, y: 3.5 };
  duct.cell = { x: 4, y: 3 };
  w.state.enemies = [duct, mite];
  applyHit(w.state, mite, plan.damage, plan, tower);
  applyHit(w.state, duct, plan.damage, plan, tower);
  assert(Math.abs(100 - mite.hp - 10) < 1e-9, "sentry full kinetic vs ground");
  assert(Math.abs(100 - duct.hp - 5) < 1e-9, "sentry half kinetic vs air");
  const pick = selectTarget(w.state, tower, plan);
  assert(pick === mite, "sentry prefers ground over weak air");
  w.state.enemies = [duct];
  assert(selectTarget(w.state, tower, plan) === duct, "sentry shoots air when lane is empty");
  const rail = buildAttackPlan("sentry", "rail", "kinetic", 1);
  assert(rail.airDamageMult === 1, "rail plan is full air");
}

// Twin: one pellet per shot from alternating muzzles (left then right)
{
  const w = freshWorld();
  w.state.dt = 1 / 60;
  const t = {
    id: 9001,
    cell: { x: 4, y: 4 },
    base: "sentry",
    barrel: "twin",
    payload: "kinetic",
    level: 1,
    cooldown: 0,
    targetId: -1,
    aimAngle: 0,
    branch: { damage: 0, rof: 0, range: 0 },
  };
  w.state.towers = [t];
  w.state.towersById.set(t.id, t);
  const e = makeEnemy(w.state, "mite", 1);
  e.pos = { x: 4.5, y: 6.5 };
  e.cell = { x: 4, y: 6 };
  e.hp = e.maxHp = 10000;
  w.state.enemies = [e];
  w.state.enemiesById.set(e.id, e);
  tickCombat(w.state);
  assert(w.state.projectiles.length === 1, "twin fires one pellet");
  const x0 = w.state.projectiles[0].pos.x;
  t.cooldown = 0;
  tickCombat(w.state);
  assert(w.state.projectiles.length === 2, "second twin shot");
  const x1 = w.state.projectiles[1].pos.x;
  const cx = 4.5;
  assert((x0 - cx) * (x1 - cx) < 0, "consecutive twin shots opposite muzzles");
  assert(Math.abs(x0 - cx) > 0.05 && Math.abs(x1 - cx) > 0.05, "muzzles sit off cell center");
}

console.log("combatSynergy: all assertions passed");
