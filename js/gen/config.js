const GEN = {
  cellW: 40,
  cellH: 22,
  /** Cell-local row of the floor tile under a side door. */
  doorFloorRow: 19,
  /** Side door opening height in tiles (rows doorFloorRow-4 .. doorFloorRow-1). */
  doorHeight: 4,
  /** Cell-local first column of a top or bottom door opening. */
  doorCol: 18,
  doorWidth: 4,
  maxAttempts: 40,
  roomTries: 6,
  /** Weighted room shapes [w, h, weight]. */
  shapes: [
    [1, 1, 44],
    [2, 1, 24],
    [1, 2, 12],
    [3, 1, 7],
    [2, 2, 7],
    [1, 3, 3]
  ],
  heraldArena: [2, 1],
  wardenArena: [3, 1],
  /** Extra loops added inside zones, as a fraction of room count. */
  loopFraction: 0.12,
  shortcutsPerZone: 1,
  secretsPerTier: [2, 3],
  /** Max room distance from any explorable room to a Sanctuary. */
  sanctuaryMaxDist: 4,
  /** Herald arenas must be at most this far from a Sanctuary. */
  heraldSanctuaryDist: 2,
  /** Blight ring fractions (farthest first). The rest is the core. */
  ringFractions: [0.3, 0.3, 0.25],
  /** Phase start as fraction of the Tier clock: Creep, Rot, Eclipse. */
  phaseStarts: [0.35, 0.6, 0.85],
  /** Pacing model, seconds. */
  pacing: {
    roomBaseSec: 14,
    perExtraCellSec: 8,
    /** Rooms already cleared are crossed faster. */
    revisitBaseSec: 6,
    revisitPerExtraCellSec: 4,
    sanctuaryTravelSec: 6,
    heraldFightSec: 90,
    maxRouteFraction: 0.45,
    maxRequiredFraction: 0.68
  },
  loot: {
    flaskShards: [2, 1, 1],
    weapons: 2,
    relics: 2,
    boneDust: 2,
    ichorCaches: 2
  },
  enemies: {
    combat: [3, 5],
    platforming: [1, 3],
    connector: [1, 2],
    elite: [2, 3],
    treasure: [0, 1],
    ability: [1, 2]
  }
};
const TIERS = [
  {
    index: 1,
    name: "Tier I: The Undercroft",
    biome: "undercroft",
    clockSec: 16 * 60,
    gridW: 14,
    gridH: 11,
    cellsMin: 32,
    cellsMax: 40,
    heralds: 2,
    zoneShare: [0.4, 0.3, 0.3]
  },
  {
    index: 2,
    name: "Tier II: The Midreach",
    biome: "midreach",
    clockSec: 16 * 60,
    gridW: 15,
    gridH: 12,
    cellsMin: 40,
    cellsMax: 48,
    heralds: 2,
    zoneShare: [0.4, 0.3, 0.3]
  },
  {
    index: 3,
    name: "Tier III: The Summit",
    biome: "summit",
    clockSec: 20 * 60,
    gridW: 17,
    gridH: 13,
    cellsMin: 48,
    cellsMax: 56,
    heralds: 3,
    zoneShare: [0.55, 0.45]
  }
];
const ABILITIES_PER_TIER = [2, 2, 1];
const ABILITIES = {
  wraith_step: { id: "wraith_step", name: "Wraith Step", verb: "Air dash", gateDirs: ["L", "R"], glyph: "WS" },
  seraph_wing: { id: "seraph_wing", name: "Seraph Wing", verb: "Double jump", gateDirs: ["L", "R", "U"], glyph: "SW" },
  penitent_grip: { id: "penitent_grip", name: "Penitent Grip", verb: "Wall cling", gateDirs: ["U"], glyph: "PG" },
  censer_fall: { id: "censer_fall", name: "Censer Fall", verb: "Plunge", gateDirs: ["D"], glyph: "CF" },
  chain_of_saints: { id: "chain_of_saints", name: "Chain of Saints", verb: "Grapple", gateDirs: ["L", "R"], glyph: "CS" },
  bloodmist: { id: "bloodmist", name: "Bloodmist", verb: "Mist dash", gateDirs: ["L", "R"], glyph: "BM" },
  ember_ward: { id: "ember_ward", name: "Ember Ward", verb: "Hazard ward", gateDirs: ["L", "R"], glyph: "EW" },
  bell_toll: { id: "bell_toll", name: "Bell Toll", verb: "Shatter seals", gateDirs: ["L", "R"], glyph: "BT" }
};
const ABILITY_IDS = Object.keys(ABILITIES);
const BOSS_POOLS = {
  heralds: {
    undercroft: ["The Drowned Choir", "Ossuary Mother", "The Lantern Widow", "Brother Silt", "The Weeping Reliquary"],
    midreach: ["The Gilded Penitent", "Forge-Abbess Varra", "The Hollow Procession", "The Thurible Beast", "Sister of Nails"],
    summit: ["The Veiled Seraph", "Choirmaster Vey", "The Last Bellringer", "The Ashen Pontiff", "Mother of Moths"]
  },
  wardens: {
    undercroft: ["The Flooded Abbot", "The Bone Cantor", "Mire Saint Odile"],
    midreach: ["The Crucible Knight", "The Glass Cardinal", "The Censer Colossus"]
  },
  finalGuardians: ["The Unborn Saint", "The Ninth Bell", "The Thorned Mother"]
};
export {
  ABILITIES,
  ABILITIES_PER_TIER,
  ABILITY_IDS,
  BOSS_POOLS,
  GEN,
  TIERS
};
