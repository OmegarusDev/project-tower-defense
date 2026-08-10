import { buildAttackPlan, Pattern } from "../sim/attackPlan.js";
import { doctrineLabel } from "../data/parts.js";

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

assert(doctrineLabel("flying") === "Air → First", "label");

console.log("ALL attackPlan tests passed");
