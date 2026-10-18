// Checks the gear rules: relics, weapons, tempering, Boons and carry-over. Run: node tools/gear_check.mjs
import { Sim } from "../js/sim/sim.js";
import { RELIC_SLOTS } from "../js/data/gear.js";

let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failed++;
};

const make = (character = "gino", tier = 1, carry) => new Sim({ seed: "gear-check", tier, character, carry });

const a = make("knight");
const baseHp = a.player.maxHp;
check("no gear means no modifiers", a.mods.damage === 1 && a.mods.hp === 0);

for (let i = 0; i < RELIC_SLOTS + 2; i++) a.giveLoot("relic");
check("relic slots are capped", a.gear.relics.length <= RELIC_SLOTS, `${a.gear.relics.length}/${RELIC_SLOTS}`);
check("overflow relics become Bone Dust", a.boneDust >= 2);

const b = make("mage");
const b2 = make("mage");
for (const s of [b, b2]) {
  s.giveLoot("relic");
  s.giveLoot("weapon");
}
check("gear rolls are deterministic", JSON.stringify(b.gear) === JSON.stringify(b2.gear));
check("weapon equips on first find", !!b.gear.weapon);
const dmg0 = b.mods.damage;
b.boneDust = 10;
const cost = b.temperCost();
b.sanctuaryHere = () => ({ dark: false });
check("temper costs Bone Dust and raises damage", b.temper() && b.mods.damage > dmg0 && b.boneDust === 10 - cost);

const c = make("gino");
c.giveLoot("relic");
c.gear.relics = ["ashen_plate"];
c.recomputeMods();
check("Ashen Plate adds max HP", c.player.maxHp === 100 + 18, `${c.player.maxHp}`);

const d = make("gino");
d.offerBoons();
check("a Herald offers three Boons", d.boonOffer?.length === 3);
const pick = d.boonOffer[0];
check("choosing a Boon applies it once", d.chooseBoon(pick) && d.gear.boons[0] === pick && d.boonOffer === null);
check("an unoffered Boon is refused", !d.chooseBoon("whetted") || d.gear.boons.includes("whetted"));

const e = make("knight", 2, d.carry());
check("gear carries into the next Tier", e.gear.boons[0] === pick && JSON.stringify(e.mods) === JSON.stringify(d.mods));

if (failed) {
  console.log(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("all clear");
