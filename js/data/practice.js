// Drills for the Training Yard. A drill is data: what to do, how often, and the line Coach Brann says.
// `text` may use {action} placeholders; the board replaces them with the player's current bindings.
//
// goal.type
//   reach   stand on a marker placed in the map
//   count   a simulation event happened n times (event, optional filters)
//   chain   n light hits on enemies within `windowMs` of each other
//   far     a hit landed on an enemy at least `dist` tiles away (optional `source`: "skill" | "light")
//   evade   an enemy attack of telegraph `tele` finished without hitting, n times

/** Drills every character shares. */
const COMMON_DRILLS = [
  { id: "run", group: "Basics", name: "Run to the far end", text: "Hold {right} and run to the glowing post by the door.", goal: { type: "reach", marker: "post" } },
  { id: "jump", group: "Basics", name: "Jump onto the perch", text: "Press {jump} to jump onto the platform. Hold it for height.", goal: { type: "reach", marker: "perch" } },
  { id: "chain", group: "Combat", name: "Land a three hit chain", text: "Tap {attack} three times on the training post.", goal: { type: "chain", n: 3, windowMs: 900 } },
  { id: "heavy", group: "Combat", name: "Land a heavy hit", text: "Hold {heavy} to charge, then release on the post.", goal: { type: "count", event: "hit", filter: { target: "enemy", heavy: true }, n: 1 } },
  { id: "dodge", group: "Combat", name: "Dodge three times", text: "Press {dodge} to roll. You are not hit while rolling.", goal: { type: "count", event: "dodge", n: 3 } },
  { id: "parry", group: "Combat", name: "Parry the gold sweep", text: "Gold glint means parry. Press {parry} just as the swing lands. Three times.", goal: { type: "count", event: "parry", n: 3 } },
  { id: "evade", group: "Combat", name: "Dodge the red lunge", text: "Red cannot be parried. Roll through it with {dodge}. Twice.", goal: { type: "evade", tele: "unparryable", n: 2 } },
  { id: "grab", group: "Combat", name: "Escape the white grab", text: "White flash is a grab. Only a dodge saves you. Once.", goal: { type: "evade", tele: "grab", n: 1 } },
  { id: "riposte", group: "Combat", name: "Parry, then riposte", text: "A parry staggers the enemy. Hit {attack} on the stagger for a riposte.", goal: { type: "count", event: "riposte", n: 1 } },
  { id: "skill", group: "Combat", name: "Use your Skill", text: "Hits fill the Fervor bar. At full, press {skill}. The Yard refills it for you.", goal: { type: "count", event: "skill", n: 1 } },
  { id: "ultimate", group: "Combat", name: "Unleash your Ultimate", text: "Press {ultimate} when Resolve is full. The Yard refills it for you.", goal: { type: "count", event: "ultimate", n: 1 } },
  { id: "flask", group: "World", name: "Drink an Ember Flask", text: "Press {flask} to heal. Flasks are free in the Yard.", goal: { type: "count", event: "flaskHeal", n: 1 } }
];

/** Extra drills for each lead, built around what they do best. */
const CHARACTER_DRILLS = {
  gino: [
    { id: "gino_dagger", group: "Gino", name: "Throw the dagger from afar", text: "Use the Skill on the far post from six tiles or more.", goal: { type: "far", dist: 6, source: "skill", n: 1 } },
    { id: "gino_fast", group: "Gino", name: "Chain faster than a blink", text: "Land the three hit chain inside half a second.", goal: { type: "chain", n: 3, windowMs: 520 } }
  ],
  knight: [
    { id: "knight_bash", group: "Knight", name: "Break a stance", text: "Shield Bash a post until its poise breaks and it staggers.", goal: { type: "count", event: "stagger", n: 1 } },
    { id: "knight_wall", group: "Knight", name: "Parry five times", text: "The Bulwark lives by the parry. Five clean ones.", goal: { type: "count", event: "parry", n: 5 } }
  ],
  mage: [
    { id: "mage_reach", group: "Mage", name: "Strike from a distance", text: "Hit the far post with a basic attack from five tiles or more.", goal: { type: "far", dist: 5, source: "light", n: 1 } },
    { id: "mage_cloud", group: "Mage", name: "Let the cloud burn", text: "Cast the Arcane Cloud on a post and let it tick twice.", goal: { type: "count", event: "smokeTick", n: 2 } }
  ]
};

/** One drill per gate ability, on the Rampart. All eight abilities are granted in the Yard. */
const ABILITY_DRILLS = [
  { id: "wraith_step", group: "Rampart", name: "Wraith Step", text: "Jump, then press {dodge} in the air to dash over the pit.", goal: { type: "reach", marker: "wraith_step" } },
  { id: "chain_of_saints", group: "Rampart", name: "Chain of Saints", text: "Press {grapple} near the ring to swing across.", goal: { type: "reach", marker: "chain_of_saints" } },
  { id: "ember_ward", group: "Rampart", name: "Ember Ward", text: "The ward lets you wade through the harmful liquid.", goal: { type: "reach", marker: "ember_ward" } },
  { id: "seraph_wing", group: "Rampart", name: "Seraph Wing", text: "Jump, then press {jump} again in the air to clear the wall.", goal: { type: "reach", marker: "seraph_wing" } },
  { id: "bloodmist", group: "Rampart", name: "Bloodmist", text: "Press {dodge} into the grate. Mist passes through iron.", goal: { type: "reach", marker: "bloodmist" } },
  { id: "bell_toll", group: "Rampart", name: "Bell Toll", text: "Stand near the crystal and press {toll}. It regrows when you leave.", goal: { type: "reach", marker: "bell_toll" } },
  { id: "censer_fall", group: "Rampart", name: "Censer Fall", text: "Climb the tower, jump, then hold {down} and attack to plunge through the roof.", goal: { type: "reach", marker: "censer_fall" } },
  { id: "penitent_grip", group: "Rampart", name: "Penitent Grip", text: "Cling to the green walls and jump between them to climb the shaft.", goal: { type: "reach", marker: "penitent_grip" } }
];

export const drillsFor = (character) => [...COMMON_DRILLS, ...(CHARACTER_DRILLS[character] ?? []), ...ABILITY_DRILLS];

/** Replaces {action} with the bound key name; `label(action)` comes from the keybinds. */
export function fillText(text, label) {
  return text.replace(/\{(\w+)\}/g, (_, a) => `[${label(a)}]`);
}

/** Drill post definitions the simulation adds to the enemy table. */
export const DRILL_ENEMIES = {
  dummy: {
    id: "dummy", name: "Training Post", hp: 400, poise: 40, ichor: 0, speed: 0, aggro: 0, w: 1, h: 2.6, behavior: "melee", immortal: true, drill: true, attacks: []
  },
  drill_gold: {
    id: "drill_gold", name: "Gold Sweep Post", hp: 400, poise: 60, ichor: 0, speed: 0, aggro: 6, w: 1, h: 2.6, behavior: "melee", immortal: true, drill: true,
    attacks: [{ id: "sweep", tele: "parryable", startupMs: 650, activeMs: 120, recoveryMs: 700, damage: 8, poise: 0, box: { x: 0.2, y: -2.5, w: 2.4, h: 2.3 }, knockback: 4, hitstopMs: 40, minRange: 0, maxRange: 2.8, maxDy: 2, cooldownMs: 900, step: 0 }]
  },
  drill_red: {
    id: "drill_red", name: "Red Lunge Post", hp: 400, poise: 60, ichor: 0, speed: 0, aggro: 7, w: 1, h: 2.6, behavior: "melee", immortal: true, drill: true,
    attacks: [{ id: "lunge", tele: "unparryable", startupMs: 750, activeMs: 160, recoveryMs: 800, damage: 10, poise: 0, box: { x: 0.2, y: -2.4, w: 3.4, h: 2.1 }, knockback: 5, hitstopMs: 50, minRange: 0, maxRange: 3.6, maxDy: 2, cooldownMs: 1100, step: 0 }]
  },
  drill_grab: {
    id: "drill_grab", name: "White Grab Post", hp: 400, poise: 60, ichor: 0, speed: 0, aggro: 6, w: 1, h: 2.6, behavior: "melee", immortal: true, drill: true,
    attacks: [{ id: "grab", tele: "grab", startupMs: 900, activeMs: 150, recoveryMs: 900, damage: 10, poise: 0, box: { x: 0.2, y: -2.4, w: 2.2, h: 2.2 }, knockback: 4, hitstopMs: 60, minRange: 0, maxRange: 2.4, maxDy: 2, cooldownMs: 1400, grabMs: 500 }]
  },
  drill_ranged: {
    id: "drill_ranged", name: "Bolt Post", hp: 400, poise: 60, ichor: 0, speed: 0, aggro: 14, w: 1, h: 2.6, behavior: "melee", immortal: true, drill: true,
    attacks: [{ id: "bolt", tele: "parryable", startupMs: 700, activeMs: 50, recoveryMs: 600, damage: 0, poise: 0, box: { x: 0, y: 0, w: 0, h: 0 }, knockback: 3, hitstopMs: 40, minRange: 2, maxRange: 13, maxDy: 4, cooldownMs: 1500, projectile: { speed: 7, damage: 7, w: 0.7, h: 0.7, tele: "parryable" } }]
  }
};
