import { ABILITY_IDS, ABILITIES_PER_TIER, BOSS_POOLS, TIERS } from "./config.js";
import { stream } from "./rng.js";
function planExpedition(seed) {
  const abilityRng = stream(seed, "abilities");
  let order = abilityRng.shuffle(ABILITY_IDS);
  const vertical = ["censer_fall", "penitent_grip"];
  if (vertical.includes(order[0]) && vertical.includes(order[1])) {
    [order[1], order[2]] = [order[2], order[1]];
  }
  order = order.slice(0, 5);
  const abilities = [];
  let i = 0;
  for (const n of ABILITIES_PER_TIER) {
    abilities.push(order.slice(i, i + n));
    i += n;
  }
  const bossRng = stream(seed, "bosses");
  const heralds = TIERS.map((t) => bossRng.shuffle(BOSS_POOLS.heralds[t.biome]).slice(0, t.heralds));
  const wardens = TIERS.slice(0, 2).map((t) => bossRng.pick(BOSS_POOLS.wardens[t.biome]));
  const finalGuardian = bossRng.pick(BOSS_POOLS.finalGuardians);
  return { seed, abilities, heralds, wardens, finalGuardian };
}
function tierAbilities(plan, tierIndex) {
  const prior = [];
  for (let t = 0; t < tierIndex - 1; t++) prior.push(...plan.abilities[t]);
  return { prior, found: plan.abilities[tierIndex - 1].slice() };
}
export {
  planExpedition,
  tierAbilities
};
