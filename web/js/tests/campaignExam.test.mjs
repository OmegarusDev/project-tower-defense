/**
 * Campaign exam loop: first-clear lumps, loud job copy, honest threat tags.
 * Run: node js/tests/campaignExam.test.mjs
 */
import { RULES } from "../data/rules.js";
import { CAMPAIGN_LEVELS, getCampaignLevel } from "../data/campaign.js";
import { grantCampaignFirstClear } from "../app/endsLogic.js";
import { threatTagsForLevel } from "../ui/metaUi.js";
import { renderCampaign, renderPrep } from "../ui/screens/meta.js";
import { renderVictory, renderGameOver } from "../ui/screens/end.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function meta(over = {}) {
  return {
    aether: 10,
    forge: 4,
    bestWave: 0,
    slotCount: 3,
    roster: [],
    campaign: { cleared: [] },
    ...over,
  };
}

{
  assert(RULES.FIRST_CLEAR_AETHER === 12, "first-clear Æ is one Foundations rank");
  assert(RULES.FIRST_CLEAR_FORGE === 6, "first-clear Parts buys Twin/Rail");
}

{
  const m = meta();
  const bonus = grantCampaignFirstClear(m, { first: true, levelId: 6 });
  assert(bonus && bonus.aether === 12 && bonus.parts === 6, "first seal grants lumps");
  assert(m.aether === 22 && m.forge === 10, "vault credited");
  const again = grantCampaignFirstClear(m, { first: false, levelId: 6 });
  assert(again === null, "repeat seal pays no lump");
  assert(m.aether === 22 && m.forge === 10, "repeat leaves vault");
  assert(grantCampaignFirstClear(m, { first: true, levelId: 0 }) === null, "id 0 is not a Yard");
}

{
  const labels = (id, n = 4) => threatTagsForLevel(getCampaignLevel(id), n).map((t) => t.label);
  assert(labels(6).includes("Air"), "Sky Vein surfaces Air");
  assert(labels(8).includes("Energy"), "Volt Gate surfaces Energy");
  assert(labels(12).includes("Claim"), "Claim Engine surfaces Claim");
  const outskirts = labels(1, 4);
  assert(outskirts.length > 0, "Outskirts still has tags");
}

{
  const html = renderCampaign({ meta: meta(), status: "" });
  const sky = getCampaignLevel(6);
  assert(html.includes(sky.blurb), "campaign cards show the job blurb");
}

{
  const open = renderPrep({ meta: meta(), prepLevelId: 6, prepSlot: 0, status: "" });
  assert(open.includes("First seal"), "prep previews first-clear pay");
  assert(open.includes(`+${RULES.FIRST_CLEAR_AETHER} Æ`), "prep names Æ lump");
  assert(open.includes(`+${RULES.FIRST_CLEAR_FORGE} Parts`), "prep names Parts lump");
  const sealed = renderPrep({
    meta: meta({ campaign: { cleared: [6] } }),
    prepLevelId: 6,
    prepSlot: 0,
    status: "",
  });
  assert(!sealed.includes("First seal"), "sealed Yard omits the lump");
}

{
  const lv = getCampaignLevel(3);
  const next = CAMPAIGN_LEVELS.find((l) => l.id === 4);
  const html = renderVictory({
    meta: meta({ campaign: { cleared: [3] } }),
    sim: {
      campaignLevelId: 3,
      economy: { runWaveGains: { coin: 10, parts: 2, aether: 0 } },
    },
    firstClear: true,
    status: "",
  });
  assert(html.includes(`+${RULES.FIRST_CLEAR_FORGE} Parts · first`), "victory lists first Parts");
  assert(html.includes(`+${RULES.FIRST_CLEAR_AETHER} Aether · first`), "victory lists first Æ");
  assert(html.includes(lv.name), "victory names the Yard");
  assert(html.includes(next.blurb), "victory hands the next job");
}

{
  const lv = getCampaignLevel(6);
  const html = renderGameOver({
    meta: meta(),
    sim: {
      modeEndless: false,
      campaignLevelId: 6,
      waves: { index: 4 },
      leakCount: 3,
      killCount: 12,
      runSeed: 1,
      economy: { runWaveGains: { parts: 1, aether: 0 } },
    },
    status: "",
  });
  assert(html.includes(lv.name), "fallen names the Yard");
  assert(html.includes(lv.blurb), "fallen restates the job");
}

console.log("campaignExam: all assertions passed");
