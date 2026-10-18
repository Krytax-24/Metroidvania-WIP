// Gear: relics (found in the world), Boons (chosen after a Herald) and the equipped weapon.
// Everything here is a plain modifier so the simulation only ever reads one summed `mods` object.

/** Modifier keys: damage (multiplier), hp (flat max HP), parryMs, flaskHeal (added fraction), ichor (multiplier), fervor (multiplier), killHeal (fraction of max HP). */
export const NO_MODS = Object.freeze({ damage: 1, hp: 0, parryMs: 0, flaskHeal: 0, ichor: 1, fervor: 1, killHeal: 0 });

export const RELIC_SLOTS = 3;

export const RELICS = {
  ember_band: { name: "Ember Band", icon: "ruby ring", desc: "+10% damage", mods: { damage: 0.1 } },
  ashen_plate: { name: "Ashen Plate", icon: "chest plate", desc: "+18 max HP", mods: { hp: 18 } },
  bell_charm: { name: "Bell Charm", icon: "disc pendant", desc: "Parry window +40 ms", mods: { parryMs: 40 } },
  tallow_wick: { name: "Tallow Wick", icon: "red potion", desc: "Flasks heal 12% more", mods: { flaskHeal: 0.12 } },
  gleaner: { name: "Gleaner's Purse", icon: "coin purse", desc: "+30% Ichor", mods: { ichor: 0.3 } },
  fervor_wick: { name: "Kindling", icon: "orange potion", desc: "+40% Fervor from hits", mods: { fervor: 0.4 } },
  reaper_thread: { name: "Reaper's Thread", icon: "onyx ring", desc: "Heal 2% max HP on a kill", mods: { killHeal: 0.02 } }
};

export const BOONS = {
  whetted: { name: "Whetted Edge", icon: "short sword", desc: "+8% damage", mods: { damage: 0.08 } },
  thick_blood: { name: "Thick Blood", icon: "pink vial", desc: "+12 max HP", mods: { hp: 12 } },
  patient_hand: { name: "Patient Hand", icon: "kite shield", desc: "Parry window +30 ms", mods: { parryMs: 30 } },
  warm_draught: { name: "Warm Draught", icon: "green potion", desc: "Flasks heal 10% more", mods: { flaskHeal: 0.1 } },
  gravedigger: { name: "Gravedigger", icon: "small stacks of coins", desc: "+20% Ichor", mods: { ichor: 0.2 } },
  kindled: { name: "Kindled Heart", icon: "flame sword", desc: "+30% Fervor from hits", mods: { fervor: 0.3 } },
  sip_of_ruin: { name: "Sip of Ruin", icon: "black potion", desc: "Heal 1.5% max HP on a kill", mods: { killHeal: 0.015 } },
  bright_vigil: { name: "Bright Vigil", icon: "holy staff", desc: "+6% damage and +6 max HP", mods: { damage: 0.06, hp: 6 } }
};

export const WEAPON_NAMES = {
  gino: ["Rusted Dirk", "Fenwick Stiletto", "Thornfang"],
  knight: ["Pilgrim's Blade", "Oathkeeper", "The Ninth Edge"],
  mage: ["Ash Staff", "Glasswood Staff", "Starloom"]
};
/** 32rogues item names for the weapon art, by character and rarity (common, rare, epic). */
export const WEAPON_ICONS = {
  gino: ["dagger", "magic dagger", "sanguine dagger"],
  knight: ["long sword", "bastard sword", "great sword"],
  mage: ["crystal staff", "blue crystal staff", "golden staff"]
};
/** Icons for the other things a gift can be. */
export const REWARD_ICONS = { ichor: "coin purse", bone_dust: "small stacks of coins", flask_shard: "red potion", candle: "ankh", boon: "scroll", quest_item: "page" };

export const RARITIES = [
  { id: "common", label: "Common", damage: 0.06, weight: 60 },
  { id: "rare", label: "Rare", damage: 0.14, weight: 30 },
  { id: "epic", label: "Epic", damage: 0.24, weight: 10 }
];
export const TEMPER = { perLevel: 0.03, max: 5 };

/** Sums every source into one mods object. */
export function sumMods(relicIds, boonIds, weapon) {
  const m = { ...NO_MODS };
  const add = (mods) => {
    for (const [k, v] of Object.entries(mods)) m[k] += v;
  };
  for (const id of relicIds) if (RELICS[id]) add(RELICS[id].mods);
  for (const id of boonIds) if (BOONS[id]) add(BOONS[id].mods);
  if (weapon) m.damage += weapon.damage + weapon.temper * TEMPER.perLevel;
  return m;
}
