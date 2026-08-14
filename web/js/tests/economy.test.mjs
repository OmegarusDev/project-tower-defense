/**
 * Economy math: wave rewards, surcharges, wall escalation, spend/refund.
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
  applyRunMods,
} from "../sim/next/systems/economy.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Wave-clear rewards (bonusCoin = 2nd arg, bonusParts = 3rd, like the oracle)
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

// Placement surcharge: first two towers free of tax
{
  const e = makeEconomy();
  assert(placeSurcharge(e, 19, 0) === 0, "tower 1 free");
  assert(placeSurcharge(e, 19, 1) === 0, "tower 2 free");
  assert(placeSurcharge(e, 19, 2) === Math.floor(19 * 0.08 * 1), "tower 3 taxed");
  const q = quoteTowerPlace(e, 19, 3);
  assert(q.total === 19 + Math.floor(19 * 0.08 * 2), "quote includes surcharge");
}

// Bargainer (towerCostMult) applies to place cost, not to unlocks
{
  const e = makeEconomy();
  applyRunMods(e, { towerCostMult: 0.8 });
  assert(towerCost(e, 19) === 15, "Bargainer rounds 19*0.8");
  assert(quoteTowerPlace(e, 19, 2).base === 15, "quote uses discounted base");
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
}

// Run mods defaults are identity
{
  const e = makeEconomy();
  applyRunMods(e, {});
  assert(e.wallCostMult === 1 && e.towerCostMult === 1, "defaults identity");
  assert(e.waveCoinBonus === 0 && e.wavePartsBonus === 0, "bonuses default 0");
}

console.log("ALL economy tests passed");
