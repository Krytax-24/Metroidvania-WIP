// Story content: the premise, who stands where, what they ask for, what they give, and the short scenes.
// Plain data. The simulation reads QUESTS and REWARDS; the screens read NPCS, DIALOGUE and CUTSCENES.
// House style: sparse, penitent, under 20 words a line, no dashes.

export const PREMISE = {
  bell: "The Ninth Bell held the Cathedral-World together. When it fell silent, the Blight began to rise at nightfall.",
  unshriven: "The Unshriven cannot die while their vow is unkept. Each carries three candles. Each death burns one."
};

/** Per character: what they vowed. Used by the opening scene and the ending. */
export const VOWS = {
  gino: { who: "Gino", vow: "Gino stole the Ninth Bell's clapper to sell it. The silence is his doing. He vows to carry it home.", end: "Gino sets the clapper in its place. It is lighter than he remembers." },
  knight: { who: "The Knight", vow: "The Knight kept watch on the bell tower the night it fell. The Knight vows to keep that watch again.", end: "The Knight lowers the shield at last. The watch is over." },
  mage: { who: "The Mage", vow: "The Mage heard the bell's last note and could not hold it. The Mage vows to hear the next one.", end: "The Mage listens. The note is whole this time." }
};

/**
 * Everyone the player can meet. `sprite` is a key in assets/manifest.json, `native` is the way the sheet
 * faces (1 right, -1 left), `scale` and `fit` feed the same draw path as enemies, `where` says where the
 * simulation may place them: "sanctuary" (beside a lit altar), "room" (an ordinary room), "yard" (practice).
 */
export const NPCS = {
  keeper: { name: "Oswin", title: "Keeper of the Flame", sprite: "blacksmith", native: 1, scale: 0.9, fit: 0.9, where: "sanctuary" },
  maren: { name: "Maren", title: "the Lamplighter", sprite: "lamplighter", native: -1, scale: 0.8, fit: 0.9, where: "sanctuary" },
  ulric: { name: "Father Ulric", title: "Last Priest of the Undercroft", sprite: "rg_priest", native: 1, scale: 1.45, fit: 0.9, where: "room" },
  marta: { name: "Old Marta", title: "who lost a thimble", sprite: "rg_elder_f", native: 1, scale: 1.8, fit: 0.9, where: "sanctuary" },
  aldric: { name: "Sir Aldric", title: "the Penitent", sprite: "knight_penitent", native: 1, scale: 0.66, fit: 0.55, where: "room" },
  gel: { name: "Gel", title: "a hungry slime", sprite: "slime_green", native: 1, scale: 2, fit: 1, where: "room" },
  perrin: { name: "Archivist Perrin", title: "keeper of torn pages", sprite: "rg_scholar", native: 1, scale: 1.45, fit: 0.9, where: "sanctuary" },
  wisp: { name: "A lost pilgrim", title: "a wisp of the Unshriven", sprite: "wisp", native: 1, scale: 2, fit: 0.6, where: "room", float: 5 },
  tallow: { name: "Tallow", title: "peddler of what remains", sprite: "rg_shopkeep", native: 1, scale: 1.45, fit: 0.9, where: "sanctuary" },
  brann: { name: "Coach Brann", title: "Master of the Yard", sprite: "warrior", native: -1, scale: 1, fit: 0.9, where: "yard" }
};

/** Which quests can appear in which Tier. The simulation picks from these with the seed. */
export const TIER_QUESTS = { 1: ["maren_flames", "ulric_rites", "marta_thimble"], 2: ["aldric_penance", "gel_hunt", "perrin_tome"], 3: ["wisps_lost", "tallow_stock"] };
export const QUESTS_PER_TIER = { 1: 2, 2: 2, 3: 2 };

/**
 * goal.type: rest_new (rest at Sanctuaries other than the first), parry, kill, elite, item (find it on the map),
 * talk (speak to distinct wisps), secret (open a hidden passage).
 */
export const QUESTS = {
  maren_flames: {
    npc: "maren",
    tier: 1,
    title: "Three Small Flames",
    summary: "Rest at two Sanctuaries beyond the first so Maren's lamps are lit behind you.",
    goal: { type: "rest_new", n: 2 },
    reward: "maren_gift"
  },
  ulric_rites: {
    npc: "ulric",
    tier: 1,
    title: "Last Rites",
    summary: "Parry six attacks. Father Ulric says mercy begins with timing.",
    goal: { type: "parry", n: 6 },
    reward: "ulric_gift"
  },
  marta_thimble: {
    npc: "marta",
    tier: 1,
    title: "The Silver Thimble",
    summary: "Marta dropped her thimble somewhere far from the altar. Bring it back.",
    goal: { type: "item", n: 1, item: "Silver Thimble", icon: "gold band ring" },
    reward: "marta_gift"
  },
  aldric_penance: {
    npc: "aldric",
    tier: 2,
    title: "Penance of Steel",
    summary: "Slay eight of the Ruin's guardians. Sir Aldric counts each as a prayer.",
    goal: { type: "kill", n: 8 },
    reward: "aldric_gift"
  },
  gel_hunt: {
    npc: "gel",
    tier: 2,
    title: "Something Big",
    summary: "Gel is hungry for something large. Slay an elite guard.",
    goal: { type: "elite", n: 1 },
    reward: "gel_gift"
  },
  perrin_tome: {
    npc: "perrin",
    tier: 2,
    title: "The Cracked Tome",
    summary: "A tome fell far from the Sanctuary. Perrin cannot walk that far anymore.",
    goal: { type: "item", n: 1, item: "Cracked Tome", icon: "dark tome" },
    reward: "perrin_gift"
  },
  wisps_lost: {
    npc: "wisp",
    tier: 3,
    title: "The Lost Pilgrims",
    summary: "Three pilgrims wander the Summit. Speak with each so their stories are not lost.",
    goal: { type: "talk", n: 3 },
    reward: "wisp_gift"
  },
  tallow_stock: {
    npc: "tallow",
    tier: 3,
    title: "Hidden Stock",
    summary: "Tallow hid his best wares behind a false wall. Break through and find the passage.",
    goal: { type: "secret", n: 1 },
    reward: "tallow_gift"
  }
};

/**
 * Rewards. Every entry is a good outcome: weapons are never below the stated rarity, relics are real relics,
 * and a full relic bag turns into Bone Dust and Ichor instead of nothing. Which entry drops is a seeded roll,
 * so the same seed always hands the same gift, but the player cannot guess it.
 * kind: relic, weapon (min rarity id), boon (choose 1 of 3), ichor (multiples of the Tier cache), flask_shard, bone_dust, candle.
 */
export const REWARDS = {
  maren_gift: { wrap: "a lamp wrapped in cloth", picks: [{ w: 5, kind: "relic" }, { w: 3, kind: "weapon", min: "rare" }, { w: 2, kind: "flask_shard" }] },
  ulric_gift: { wrap: "a blessed bundle", picks: [{ w: 4, kind: "boon" }, { w: 4, kind: "weapon", min: "rare" }, { w: 2, kind: "candle" }] },
  marta_gift: { wrap: "a small tin", picks: [{ w: 4, kind: "flask_shard" }, { w: 4, kind: "relic" }, { w: 2, kind: "bone_dust", n: 3 }] },
  aldric_gift: { wrap: "a sword of the old order", picks: [{ w: 5, kind: "weapon", min: "epic" }, { w: 3, kind: "relic" }, { w: 2, kind: "boon" }] },
  gel_gift: { wrap: "something warm and slightly damp", picks: [{ w: 4, kind: "relic" }, { w: 3, kind: "bone_dust", n: 4 }, { w: 3, kind: "ichor", n: 2 }] },
  perrin_gift: { wrap: "a rescued page", picks: [{ w: 4, kind: "boon" }, { w: 4, kind: "relic" }, { w: 2, kind: "flask_shard" }] },
  wisp_gift: { wrap: "a light that was not there before", picks: [{ w: 4, kind: "boon" }, { w: 3, kind: "relic" }, { w: 2, kind: "weapon", min: "epic" }, { w: 1, kind: "candle" }] },
  tallow_gift: { wrap: "the best of the hidden stock", picks: [{ w: 4, kind: "weapon", min: "rare" }, { w: 3, kind: "relic" }, { w: 3, kind: "ichor", n: 2 }] },
  gel_trade: { wrap: "whatever Gel had been saving", picks: [{ w: 5, kind: "relic" }, { w: 3, kind: "weapon", min: "rare" }, { w: 2, kind: "flask_shard" }] }
};

/** Gel's barter: pay Bone Dust, get a surprise from the gel_trade table. */
export const GEL_TRADE_COST = 2;

/** Lines the Sanctuary keeper and wandering wisps say, by Tier. Story told in fragments. */
export const LORE = {
  keeper: [
    ["The flame remembers every pilgrim who rested here.", "It also remembers the ones who did not rise."],
    ["The Ninth Bell had a voice like warm iron.", "I would give three candles to hear it once more."],
    ["Do not pity the Blight. It was grief before it was ruin.", "Pity the ones it carries."],
    ["Rest. Rise. Repeat. That is the whole of the faith, pilgrim."]
  ],
  wisp: [
    ["I rang the bell at dawn for forty years.", "I was ringing when it stopped. I think I am still ringing."],
    ["There was a choir here. We sang until the notes ran out.", "Then we sang the silence."],
    ["Someone took the clapper. I forgive them.", "I only want it back."]
  ]
};

/** The keeper line shown at the Sanctuary, by Tier (index) and a rotating counter. */
export function keeperLine(tier, n) {
  const set = LORE.keeper;
  return set[(tier + n) % set.length];
}

/**
 * Dialogue. Each NPC has `start(q)` returning a node id, where q is { status, progress, target } for their quest
 * ("none", "active", "ready", "done"), and `nodes`. A node has `lines` and optional `choices`.
 * Choice `act`: accept, turnin, trade, close. A choice with no `act` goes to `next`.
 */
const closeChoice = { text: "Farewell.", act: "close" };
const quiet = (lines) => ({ lines, choices: [closeChoice] });

export const DIALOGUE = {
  keeper: {
    start: () => "lore",
    nodes: { lore: { lines: [], lore: "keeper", choices: [closeChoice] } }
  },
  maren: {
    start: (q) => (q.status === "none" ? "offer" : q.status === "active" ? "active" : q.status === "ready" ? "ready" : "done"),
    nodes: {
      offer: {
        lines: ["Mind the dark, traveler. I light what I can.", "Two more flames, past the first, and the way back will not be so black."],
        choices: [{ text: "I will light them.", act: "accept" }, { text: "Not now.", act: "close" }]
      },
      active: quiet(["Two flames, past the first. They are easy to miss.", "Look for altars. Rest at them."]),
      ready: {
        lines: ["I can see them from here. Two small flames.", "Take this. It was a gift once."],
        choices: [{ text: "Thank you, Maren.", act: "turnin" }]
      },
      done: quiet(["The lamps burn behind you now.", "Walk toward the light, then past it."])
    }
  },
  ulric: {
    start: (q) => (q.status === "none" ? "offer" : q.status === "active" ? "active" : q.status === "ready" ? "ready" : "done"),
    nodes: {
      offer: {
        lines: ["The dead here were never shriven. I tried.", "Show me you can turn a blow aside. Six times. That is mercy, of a kind."],
        choices: [{ text: "Six parries. I understand.", act: "accept" }, { text: "Another time.", act: "close" }]
      },
      active: quiet(["Gold glints are the ones to meet with a blade.", "Meet them. Do not flee."]),
      ready: {
        lines: ["Six times you answered a blow with grace.", "Accept this. May it make the seventh easier."],
        choices: [{ text: "Bless me, Father.", act: "turnin" }]
      },
      done: quiet(["Go gently. Or go quickly. Both can be prayers."])
    }
  },
  marta: {
    start: (q) => (q.status === "none" ? "offer" : q.status === "active" ? "active" : q.status === "ready" ? "ready" : "done"),
    nodes: {
      offer: {
        lines: ["Oh, you have good legs. I lost my silver thimble.", "Somewhere far from here. It was my mother's."],
        choices: [{ text: "I will find it.", act: "accept" }, { text: "Sorry, no.", act: "close" }]
      },
      active: quiet(["A little silver thimble. Far from the altar, I think.", "It shines when the light is kind."]),
      ready: {
        lines: ["My thimble! Look how it shines.", "I have little. This tin was saved for someone kind."],
        choices: [{ text: "Keep it safe, Marta.", act: "turnin" }]
      },
      done: quiet(["I am sewing the Blight a funeral shroud.", "It will take a while."])
    }
  },
  aldric: {
    start: (q) => (q.status === "none" ? "offer" : q.status === "active" ? "active" : q.status === "ready" ? "ready" : "done"),
    nodes: {
      offer: {
        lines: ["I broke my vow once. I count my penance in fallen foes.", "Slay eight of the Ruin's guardians. Carry my count for me."],
        choices: [{ text: "Eight. Consider it counted.", act: "accept" }, { text: "I fight for myself.", act: "close" }]
      },
      active: quiet(["Eight guardians. I keep the tally in my head.", "The prayers add up, friend."]),
      ready: {
        lines: ["Eight. My count is complete, and so is yours.", "Take my old order's steel. It deserves a hand that moves."],
        choices: [{ text: "I will carry it well.", act: "turnin" }]
      },
      done: quiet(["I will stand here a while longer.", "Standing is its own penance."])
    }
  },
  gel: {
    start: (q) => (q.status === "none" ? "offer" : q.status === "active" ? "active" : q.status === "ready" ? "ready" : "done"),
    nodes: {
      offer: {
        lines: ["Blorp. Hello. Hungry. Something big, please.", "Big and armoured. Not you. I checked."],
        choices: [
          { text: "I will find something big.", act: "accept" },
          { text: "Trade? I have Bone Dust.", act: "trade" },
          { text: "Maybe later.", act: "close" }
        ]
      },
      active: {
        lines: ["Big thing. Armoured thing. Elite thing.", "Gel waits. Gel is good at waiting."],
        choices: [{ text: "Trade Bone Dust instead.", act: "trade" }, closeChoice]
      },
      ready: {
        lines: ["Ohhh. You smell of big thing. Thank you thank you.", "Here. Gel found this inside the last one."],
        choices: [{ text: "Er, thank you, Gel.", act: "turnin" }]
      },
      done: {
        lines: ["Gel is full. Gel is happy.", "Bone Dust still makes Gel happy."],
        choices: [{ text: "Trade Bone Dust.", act: "trade" }, closeChoice]
      }
    }
  },
  perrin: {
    start: (q) => (q.status === "none" ? "offer" : q.status === "active" ? "active" : q.status === "ready" ? "ready" : "done"),
    nodes: {
      offer: {
        lines: ["A tome fell from my satchel, far from here.", "It holds the last true account of the bell. Please, find it."],
        choices: [{ text: "I will bring it back.", act: "accept" }, { text: "I cannot.", act: "close" }]
      },
      active: quiet(["A cracked tome, dark cover. Far from the altar.", "Do be careful with the spine."]),
      ready: {
        lines: ["The spine is cracked, but every page is here.", "I wrote one page just for you. Take it."],
        choices: [{ text: "Thank you, Archivist.", act: "turnin" }]
      },
      done: quiet(["I am rewriting the ending. It improves each time."])
    }
  },
  wisp: {
    start: (q) => (q.status === "none" ? "offer" : q.status === "active" ? "active" : q.status === "ready" ? "ready" : "done"),
    nodes: {
      offer: {
        lines: ["We were pilgrims once. Three of us still drift here.", "Hear each of us out, and our stories will not be lost."],
        choices: [{ text: "I will listen to all three.", act: "accept" }, { text: "Not now.", act: "close" }]
      },
      active: quiet(["Two more of us drift nearby. Be patient."]),
      ready: {
        lines: ["You heard us all. Nothing is lost now.", "Take our last light. We will not need it."],
        choices: [{ text: "Rest easy, pilgrims.", act: "turnin" }]
      },
      done: quiet(["We are quieter now. Thank you."])
    }
  },
  wisp_extra: {
    start: () => "lore",
    nodes: { lore: { lines: [], lore: "wisp", choices: [{ text: "I hear you.", act: "close" }] } }
  },
  tallow: {
    start: (q) => (q.status === "none" ? "offer" : q.status === "active" ? "active" : q.status === "ready" ? "ready" : "done"),
    nodes: {
      offer: {
        lines: ["Psst. The good stock is behind that wall. I bricked it in myself.", "Break it open and I will share."],
        choices: [{ text: "I will find the passage.", act: "accept" }, { text: "Not interested.", act: "close" }]
      },
      active: quiet(["A false wall, somewhere near. Strike the cracked stone.", "It sounds hollow when you hit it."]),
      ready: {
        lines: ["You found it! Oh, my beautiful stock.", "As promised. The best of it."],
        choices: [{ text: "Pleasure doing business.", act: "turnin" }]
      },
      done: quiet(["Tallow's shop is open to the dead and the dying.", "Today, mostly the dying."])
    }
  },
  brann: {
    start: () => "board",
    nodes: {
      board: {
        lines: ["Welcome to the Yard. Nobody dies here. That is the point.", "Finish the drills on the board. Take your time."],
        choices: [{ text: "Show me the drill board.", act: "board" }, { text: "Leave the Yard.", act: "leave" }, closeChoice]
      }
    }
  }
};

/** Short scenes. Each beat is a card: background, who stands where, one to three lines. "lead" is the chosen character. */
export const CUTSCENES = {
  opening: {
    music: "story",
    beats: [
      { bg: "crystal_0", cast: [], lines: [PREMISE.bell], hold: 4.4 },
      { bg: "crystal_0", cast: [], lines: [PREMISE.unshriven], hold: 4.4 },
      { bg: "sky_0", cast: [{ who: "lead", x: 0.5, anim: "idle" }], lines: ["@vow"], hold: 5 },
      { bg: "sky_0", cast: [{ who: "lead", x: 0.5, anim: "idle" }], lines: ["Three candles. One ascent. The Bell waits at the Summit."], hold: 4 }
    ]
  },
  yard_intro: {
    music: "story",
    beats: [
      { bg: "sky_0", cast: [{ who: "lead", x: 0.3, anim: "idle" }, { who: "brann", x: 0.7, anim: "idle", flip: true }], speaker: "Coach Brann", lines: ["Another pilgrim. Good. The Ruin eats the untrained."], hold: 4 },
      { bg: "sky_0", cast: [{ who: "lead", x: 0.3, anim: "idle" }, { who: "brann", x: 0.7, anim: "idle", flip: true }], speaker: "Coach Brann", lines: ["Hit things here until your hands know what to do. Then go climb."], hold: 4 }
    ]
  },
  tier1_arrive: {
    music: "story",
    beats: [
      { bg: "crystal_0", cast: [{ who: "lead", x: 0.35, anim: "idle" }, { who: "maren", x: 0.62, anim: "idle", flip: true }], speaker: "Maren", lines: ["The Undercroft. Flooded, cold, kind to nobody."], hold: 3.6 },
      { bg: "crystal_0", cast: [{ who: "lead", x: 0.35, anim: "idle" }, { who: "maren", x: 0.62, anim: "walk", flip: true }], speaker: "Maren", lines: ["Leave the altar and the Blight clock starts. Do not dawdle."], hold: 3.6 }
    ]
  },
  tier2_arrive: {
    music: "story",
    beats: [
      { bg: "sky_0", cast: [{ who: "lead", x: 0.35, anim: "idle" }, { who: "aldric", x: 0.65, anim: "idle", flip: true }], speaker: "Sir Aldric", lines: ["The Midreach. Cathedral stone, foundry fire. I have walked it for years."], hold: 4 },
      { bg: "sky_0", cast: [{ who: "lead", x: 0.35, anim: "idle" }, { who: "aldric", x: 0.65, anim: "idle", flip: true }], speaker: "Sir Aldric", lines: ["Mind the Hollow Knights. They keep the old posts and not the old vows."], hold: 4 }
    ]
  },
  tier3_arrive: {
    music: "story",
    beats: [
      { bg: "autumn_0", cast: [{ who: "lead", x: 0.4, anim: "idle" }, { who: "wisp", x: 0.7, anim: "idle" }], speaker: "A lost pilgrim", lines: ["The Summit. Higher than prayer goes. Lower than silence."], hold: 4 },
      { bg: "autumn_0", cast: [{ who: "lead", x: 0.4, anim: "idle" }, { who: "wisp", x: 0.7, anim: "idle" }], speaker: "A lost pilgrim", lines: ["The Bell is above us. So is whatever guards it."], hold: 4 }
    ]
  },
  ascent: {
    music: "story",
    beats: [{ bg: "sky_0", cast: [{ who: "lead", x: 0.5, anim: "run" }], lines: ["Up. Always up."], hold: 2.6, climb: true }]
  },
  ending: {
    music: "victory",
    beats: [
      { bg: "autumn_0", cast: [{ who: "lead", x: 0.5, anim: "idle" }], lines: ["The Guardian falls. The Bell hangs silent above you."], hold: 4.4 },
      { bg: "autumn_0", cast: [{ who: "lead", x: 0.5, anim: "idle" }], lines: ["@end"], hold: 5 },
      { bg: "sky_0", cast: [{ who: "lead", x: 0.5, anim: "idle" }], lines: ["One note. Then another. The Ninth Bell rings over the Ruin, and the Blight lets go."], hold: 5.6, bell: true },
      { bg: "sky_0", cast: [], procession: true, lines: ["Maren lights a lamp. Marta threads a needle. Somewhere, a slime is full."], hold: 5.6 },
      { bg: "sky_0", cast: [], lines: ["The Unshriven rest. For now."], hold: 4.4, final: true }
    ]
  },
  defeat: {
    music: "defeat",
    beats: [{ bg: "crystal_0", cast: [], lines: ["The last candle gutters. The Blight is patient."], hold: 4 }]
  }
};

/** Names of the three ending tones by candles left. */
export function endingTone(candles) {
  if (candles >= 3) return "Not a single candle burned.";
  if (candles === 2) return "One candle burned for the Bell.";
  if (candles === 1) return "Two candles burned. The Bell asked a lot.";
  return "The last candle held, barely.";
}
