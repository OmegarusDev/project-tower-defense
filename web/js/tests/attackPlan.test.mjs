import { buildAttackPlan, Pattern } from "../sim/attackPlan.js";
import { doctrineLabel, PARTS } from "../data/parts.js";
import { getTechNode } from "../data/techTree.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const pulse = buildAttackPlan("bulwark", "pulse", "frost", 1);
assert(pulse.pattern === Pattern.PULSE, "pulse delivery");
assert(pulse.doctrine === "closest", "bulwark doctrine");

const launcher = buildAttackPlan("spire", "launcher", "pyro", 1);
assert(launcher.aoeRadius > 0, "launcher blast from barrel");
assert(launcher.damageType === "fire", "element from payload");
assert(launcher.doctrine === "strongest", "spire doctrine");

const aerie = buildAttackPlan("aerie", "single", "kinetic", 1);
assert(aerie.airCapable, "aerie grants air");
assert(aerie.doctrine === "flying", "aerie doctrine");

const shock = buildAttackPlan("warden", "twin", "shock", 1);
assert(shock.chainJumps === 1, "shock chain nerfed to 1");
assert(shock.doctrine === "last", "warden doctrine");

const scatter = buildAttackPlan("sentry", "scatter", "kinetic", 1);
assert(scatter.projectileCount === 3, "scatter shotgun count");
assert(scatter.spreadDeg >= 30, "scatter arc");
assert(scatter.homing === false, "scatter ballistic");
assert(scatter.damage < 10, "scatter damage mult");

const rail = buildAttackPlan("sentry", "rail", "kinetic", 1);
assert(rail.homing === false, "rail ballistic for pierce");
assert(rail.pierce >= 1, "rail pierce");
assert(rail.airCapable, "rail air");

assert(doctrineLabel("flying") === "Air → First", "label");

{
  const single = buildAttackPlan("sentry", "single", "kinetic", 1);
  const twin = buildAttackPlan("sentry", "twin", "kinetic", 1);
  const ratio = single.fireInterval / twin.fireInterval;
  assert(Math.abs(ratio - 1.75) < 1e-6, `twin ROF ≈ 1.75× single (got ${ratio})`);
  assert(PARTS.barrels.twin.rofMult === 1.75, "twin data rofMult 1.75");
  assert(twin.rangeCells < single.rangeCells, "twin reduced range vs single");
}

{
  const baseOnly = buildAttackPlan("bulwark", "single", "kinetic", 1);
  const withRail = buildAttackPlan("bulwark", "rail", "kinetic", 1);
  assert(withRail.rangeCells > baseOnly.rangeCells * 1.2, "long barrel offsets short base");
  const shortTwin = buildAttackPlan("spire", "twin", "kinetic", 1);
  const longSingle = buildAttackPlan("spire", "single", "kinetic", 1);
  assert(shortTwin.rangeCells < longSingle.rangeCells, "barrel rangeMult stacks on base");
}

{
  const plain = buildAttackPlan("sentry", "single", "kinetic", 1);
  const ranged = buildAttackPlan("sentry", "single", "kinetic", 1, {
    baseRange: 2,
    barrelRange: 1,
  });
  assert(ranged.rangeCells > plain.rangeCells * 1.1, "arsenal range ranks stack");
  const faster = buildAttackPlan("sentry", "single", "kinetic", 1, {
    baseRof: 2,
    barrelRof: 1,
  });
  assert(faster.fireInterval < plain.fireInterval * 0.9, "arsenal ROF ranks stack");
}

{
  const L1 = buildAttackPlan("sentry", "single", "kinetic", 1);
  const L3 = buildAttackPlan("sentry", "single", "kinetic", 3);
  assert(L3.damage > L1.damage * 1.07, "auto-level buffs damage");
  assert(L3.fireInterval < L1.fireInterval, "auto-level buffs ROF");
  assert(L3.rangeCells > L1.rangeCells, "auto-level buffs range");
  const branched = buildAttackPlan("sentry", "single", "kinetic", 3, {
    branch: { damage: 2, rof: 0, range: 0 },
  });
  assert(branched.damage > L3.damage * 1.09, "branch Damage stacks");
}

console.log("ALL attackPlan tests passed");
