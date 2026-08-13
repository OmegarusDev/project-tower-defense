/**
 * Economy math: wave rewards, surcharges, wall escalation, spend/refund.
 * Run: node js/tests/economy.test.mjs
 */
import { Economy, waveClearRewards } from "../sim/economy.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Wave-clear rewards
{
  assert(waveClearRewards(1, 0, 0).coin === 10, "w1 coin 10");
  assert(waveClearRewards(5, 0, 0).coin === 14, "w5 coin 10+4");
  assert(waveClearRewards(3, 0, 0).parts === 4, "w3 parts 3+1");
  assert(waveClearRewards(2, 0, 0).parts === 0, "w2 no parts");
  assert(waveClearRewards(5, 0, 0).aether === 3, "w5 aether 2+1");
  assert(waveClearRewards(1, 0, 0).aether === 0, "w1 no aether");
  assert(waveClearRewards(3, 2, 1).parts === 5, "parts bonus stacks");
  assert(waveClearRewards(1, 3, 0).coin === 13, "coin bonus stacks");
}

// Placement surcharge: first two towers free of tax
{
  const e = new Economy();
  assert(e.placeSurcharge(19, 0) === 0, "tower 1 free");
  assert(e.placeSurcharge(19, 1) === 0, "tower 2 free");
  assert(e.placeSurcharge(19, 2) === Math.floor(19 * 0.08 * 1), "tower 3 taxed");
  const q = e.quoteTowerPlace(19, 3);
  assert(q.total === 19 + Math.floor(19 * 0.08 * 2), "quote includes surcharge");
}

// Bargainer (towerCostMult) applies to place cost, not to unlocks
{
  const e = new Economy();
  e.applyRunMods({ towerCostMult: 0.8 });
  assert(e.towerCost(19) === 15, "Bargainer rounds 19*0.8");
  assert(e.quoteTowerPlace(19, 2).base === 15, "quote uses discounted base");
}

// Wall cost escalates with owned walls; Mason discount applies
{
  const e = new Economy();
  assert(e.wallCost(0) === 12, "wall base 12");
  assert(e.wallCost(1) === 17, "wall step 5");
  e.applyRunMods({ wallCostMult: 0.7 });
  assert(e.wallCost(0) === 8, "Mason 12*0.7 rounds");
}

// Spend/add/refund mechanics
{
  const e = new Economy();
  e.battle = 50;
  assert(e.spendBattle(30) === true && e.battle === 20, "spend works");
  assert(e.spendBattle(30) === false && e.battle === 20, "spend blocked when short");
  e.addBattle(10);
  assert(e.battle === 30, "add works");
  const t = e.towerCost(19);
  assert(t >= 1, "tower cost never 0");
}

// Run mods defaults are identity
{
  const e = new Economy();
  e.applyRunMods({});
  assert(e.wallCostMult === 1 && e.towerCostMult === 1, "defaults identity");
  assert(e.waveCoinBonus === 0 && e.wavePartsBonus === 0, "bonuses default 0");
}

console.log("ALL economy tests passed");
