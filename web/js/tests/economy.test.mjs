/**
 * Economy math: wave rewards, per-part copy tax, wall escalation, spend/refund.
 * Run: node js/tests/economy.test.mjs
 */
import {
  makeEconomy,
  applyWaveClear,
  placeSurcharge,
  quoteTowerPlace,
  towerCost,
  wallCost,
  spendBattle,
  addBattle,
  addForge,
  applyRunMods,
  countPartCopies,
  partCopySurcharge,
} from "../sim/systems/economy.js";
import { RULES } from "../data/rules.js";
import { forgeDropAmount } from "../data/enemies.js";
import { Sim } from "../sim/sim.js";
import { makeSlot } from "../data/parts.js";
import { makeEnemy } from "../sim/systems/waves.js";
import { tickEnemies } from "../sim/systems/movement.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const STARTER = { base: "sentry", barrel: "single", payload: "kinetic" };

// Wave-clear rewards (bonusCoin = 2nd arg, bonusParts = 3rd) — matches the documented wave-clear contract
{
  const r = (wave, bonusCoin, bonusParts) => {
    const eco = makeEconomy();
    eco.waveCoinBonus = bonusCoin | 0;
    eco.wavePartsBonus = bonusParts | 0;
    return applyWaveClear(eco, wave);
  };
  assert(r(1, 0, 0).coin === 10, "w1 coin 10");
  assert(r(5, 0, 0).coin === 14, "w5 coin 10+4");
  assert(r(3, 0, 0).parts === 4, "w3 parts 3+1");
  assert(r(2, 0, 0).parts === 0, "w2 no parts");
  assert(r(5, 0, 0).aether === 3, "w5 aether 2+1");
  assert(r(1, 0, 0).aether === 0, "w1 no aether");
  assert(r(3, 2, 1).parts === 5, "parts bonus stacks");
  assert(r(1, 3, 0).coin === 13, "coin bonus stacks");
}

// Per-part copy tax: first copy of each part is free; repeats pay 25%
{
  const e = makeEconomy();
  assert(RULES.PART_COPY_TAX === 0.25, "tax rate pinned");
  assert(placeSurcharge(e, STARTER, []) === 0, "first tower untaxed");
  const one = [{ base: "sentry", barrel: "single", payload: "kinetic" }];
  const tax1 = placeSurcharge(e, STARTER, one);
  assert(tax1 === 3 + 1 + 0, "2nd identical: sentry 3 + single 1 + kinetic 0");
  const q2 = quoteTowerPlace(e, STARTER, one);
  assert(q2.base === 19 && q2.surcharge === tax1 && q2.total === 23, "2nd identical quote 23");
  const two = [...one, ...one];
  assert(placeSurcharge(e, STARTER, two) === 6 + 2 + 1, "3rd identical: 6+2+1");
}

// Shared parts across different triads still tax
{
  const e = makeEconomy();
  const board = [{ base: "sentry", barrel: "rail", payload: "kinetic" }];
  const q = quoteTowerPlace(e, STARTER, board);
  assert(countPartCopies(board, "base", "sentry") === 1, "sentry already down");
  assert(q.surcharge === 3, "only sentry taxed on a mixed board");
  assert(q.total === 22, "starter 19 + sentry tax 3");
  const unique = quoteTowerPlace(e, { base: "aerie", barrel: "flak", payload: "emp" }, board);
  assert(unique.surcharge === 0, "fully different triad is untaxed");
}

// Bargainer (towerCostMult) applies to each part, then tax uses discounted part cost
{
  const e = makeEconomy();
  applyRunMods(e, { towerCostMult: 0.8 });
  assert(towerCost(e, 19) === 15, "Bargainer rounds 19*0.8");
  const q = quoteTowerPlace(e, STARTER, []);
  assert(q.base === 10 + 4 + 2, "per-part discount 12/5/2 → 10+4+2");
  assert(q.surcharge === 0, "empty board still untaxed");
  const taxed = quoteTowerPlace(e, STARTER, [STARTER]);
  assert(taxed.surcharge === partCopySurcharge(10, 1) + partCopySurcharge(4, 1) + partCopySurcharge(2, 1), "tax on discounted parts");
}

// Wall cost escalates with owned walls; Mason discount applies
{
  const e = makeEconomy();
  assert(wallCost(e, 0) === 12, "wall base 12");
  assert(wallCost(e, 1) === 17, "wall step 5");
  applyRunMods(e, { wallCostMult: 0.7 });
  assert(wallCost(e, 0) === 8, "Mason 12*0.7 rounds");
}

// Spend/add/refund mechanics
{
  const e = makeEconomy();
  e.battle = 50;
  assert(spendBattle(e, 30) === true && e.battle === 20, "spend works");
  assert(spendBattle(e, 30) === false && e.battle === 20, "spend blocked when short");
  addBattle(e, 10);
  assert(e.battle === 30, "add works");
  const t = towerCost(e, 19);
  assert(t >= 1, "tower cost never 0");
  assert(addForge(e, 2) === 2 && e.forge === 2 && e.runWaveGains.parts === 2, "addForge credits vault + run gains");
}

// Run mods defaults are identity
{
  const e = makeEconomy();
  applyRunMods(e, {});
  assert(e.wallCostMult === 1 && e.towerCostMult === 1, "defaults identity");
  assert(e.waveCoinBonus === 0 && e.wavePartsBonus === 0, "bonuses default 0");
}

// Forge kill drops: guaranteed lump vs chance (seeded)
{
  assert(forgeDropAmount({ id: 1, forgeParts: 3, forgeChance: 0 }, 1) === 3, "claim lump");
  assert(forgeDropAmount({ id: 1, forgeParts: 0, forgeChance: 0 }, 1) === 0, "no drop");
  assert(forgeDropAmount({ id: 9, forgeParts: 0, forgeChance: 1 }, 42) === 1, "chance 1 always drops");
  const a = forgeDropAmount({ id: 7, forgeParts: 0, forgeChance: 0.15 }, 1);
  const b = forgeDropAmount({ id: 7, forgeParts: 0, forgeChance: 0.15 }, 1);
  assert(a === b, "drop roll is deterministic");
}

// Live place: second identical starter pays part tax
{
  const sim = new Sim();
  sim.setup(9, 8, 1, true);
  sim.setRoster([makeSlot("sentry", "single", "kinetic", 1)]);
  sim.state.economy.battle = 200;
  const cells = [];
  for (let y = 2; y < sim.state.grid.rows - 2 && cells.length < 2; y++) {
    for (let x = 2; x < sim.state.grid.cols - 2 && cells.length < 2; x++) {
      if (sim.state.grid.isBuildable(x, y)) cells.push({ x, y });
    }
  }
  const a = sim.tryPlaceTower(cells[0].x, cells[0].y, 0);
  const b = sim.tryPlaceTower(cells[1].x, cells[1].y, 0);
  assert(a.ok && a.surcharge === 0, "first place untaxed");
  assert(b.ok && b.surcharge === 4, "second identical pays 4 part tax");
  assert(a.tower.paid === 19 && b.tower.paid === 23, "paid records include tax");
}

// Kill a Claim credits 3 Parts into the run vault
{
  const sim = new Sim();
  sim.setup(9, 8, 1, true);
  const e = makeEnemy(sim.state, "claim", 1);
  e.hp = 0;
  sim.state.enemies = [e];
  sim.state.enemiesById.set(e.id, e);
  const before = sim.state.economy.forge;
  tickEnemies(sim.state);
  assert(sim.state.economy.forge === before + 3, "claim kill +3 Parts");
  assert(sim.state.economy.runWaveGains.parts === 3, "kill Parts land in run gains");
}

console.log("ALL economy tests passed");
