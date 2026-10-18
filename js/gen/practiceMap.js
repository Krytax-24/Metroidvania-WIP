// The Training Yard: a hand-authored map in the same format the generator produces, so the simulation,
// renderer and HUD need no special cases for it. Two rooms side by side:
//
//   Courtyard (2 cells): altar, Coach Brann, a step to jump onto, and five drill posts.
//   Rampart  (3 cells): one obstacle per gate ability, each with a sign and a marker on the far side.
//
// Every obstacle uses the same numbers as the generator's own obstacles (gen/rooms.js buildObstacle), so
// each one can be crossed with exactly the ability it teaches. All eight abilities are granted in the Yard.
import { ABILITY_IDS, GEN } from "./config.js";
import { Bg, Tile } from "./tiles.js";

const CW = GEN.cellW;
const CH = GEN.cellH;
const FLOOR = CH - 3; // first floor row, same as every generated room

class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.fg = new Uint8Array(w * h);
    this.bg = new Uint8Array(w * h);
    this.entities = [];
  }

  set(x, y, t) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.fg[y * this.w + x] = t;
  }

  /** Inclusive rectangle. */
  rect(x0, y0, x1, y1, t) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t);
  }

  mark(x0, y0, x1, y1, b) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.bg[y * this.w + x] = b;
  }

  /** A closed room: solid border, open inside, solid floor. */
  shell() {
    this.rect(0, 0, this.w - 1, this.h - 1, Tile.SOLID);
    this.rect(1, 1, this.w - 2, FLOOR - 1, Tile.AIR);
  }

  /** Opens the side door (rows doorFloorRow-doorHeight .. doorFloorRow-1) on one wall. */
  door(side) {
    const x = side === "L" ? 0 : this.w - 1;
    this.rect(x, GEN.doorFloorRow - GEN.doorHeight, x, GEN.doorFloorRow - 1, Tile.AIR);
  }

  ent(e) {
    this.entities.push(e);
  }

  /** A hollow pit one tile deep with spikes at the bottom, as the generator digs for Wraith Step and Chain gaps. */
  pit(x0, x1) {
    this.rect(x0, FLOOR, x1, FLOOR, Tile.AIR);
    this.rect(x0, FLOOR + 1, x1, FLOOR + 1, Tile.SPIKES);
  }

  sign(x, text, ability = null) {
    this.ent({ kind: "sign", x, y: FLOOR - 1, text, ability });
  }

  marker(id, x, y = FLOOR - 1) {
    this.ent({ kind: "marker", id, x, y });
  }
}

function buildCourtyard() {
  const g = new Grid(2 * CW, CH);
  g.shell();
  g.door("R");
  // A few pillars and windows in the backdrop so the room is not a bare box.
  for (const x of [14, 28, 42, 56, 70]) g.mark(x, 3, x + 1, FLOOR - 1, Bg.PILLAR);
  for (const x of [21, 35, 49, 63]) g.mark(x, 5, x + 2, 9, Bg.WINDOW);
  // The perch for the jump drill.
  g.rect(13, FLOOR - 4, 18, FLOOR - 4, Tile.ONEWAY);
  g.ent({ kind: "sanctuary", x: 6, y: FLOOR - 1 });
  g.ent({ kind: "npc", npc: "brann", x: 11, y: FLOOR - 1 });
  g.sign(9, "The Yard. Nobody dies here.");
  g.marker("perch", 15, FLOOR - 5);
  g.marker("post", 77);
  // Drill posts, each one inert until the player stands close. Facing -1 means looking left, toward the altar.
  const post = (type, x, label) => {
    g.ent({ kind: "enemy", type, x, y: FLOOR - 1, facing: -1 });
    g.sign(x - 3, label);
  };
  post("dummy", 22, "Training post: strike it");
  post("drill_gold", 31, "Gold glint: parry");
  post("drill_red", 40, "Red flare: dodge");
  post("drill_grab", 49, "White flash: dodge a grab");
  post("drill_ranged", 60, "Gold bolt: parry it back");
  post("dummy", 74, "Far post: test your reach");
  return g;
}

function buildRampart() {
  const g = new Grid(3 * CW, CH);
  g.shell();
  g.door("L");
  for (const x of [14, 30, 46, 62, 78, 94, 110]) g.mark(x, 3, x + 1, FLOOR - 1, Bg.PILLAR);
  g.sign(3, "The Rampart: one obstacle for each gate ability.");

  // 1. Wraith Step: a 10 tile pit. Air dash across.
  g.pit(8, 17);
  g.sign(6, "Wraith Step: dash in the air", "wraith_step");
  g.marker("wraith_step", 20);

  // 2. Chain of Saints: a 12 tile pit with a ring over the middle. Grapple the ring.
  g.pit(24, 35);
  g.ent({ kind: "hook", x: 30, y: FLOOR - 6 });
  g.sign(22, "Chain of Saints: grapple the ring", "chain_of_saints");
  g.marker("chain_of_saints", 38);

  // 3. Ember Ward: a trough of harmful liquid under a low roof. Wade through.
  g.rect(41, 1, 49, FLOOR - 4, Tile.SOLID);
  g.rect(41, FLOOR - 3, 49, FLOOR - 1, Tile.LIQUID);
  g.sign(39, "Ember Ward: wade through the liquid", "ember_ward");
  g.marker("ember_ward", 52);

  // 4. Seraph Wing: a wall six tiles high. Double jump.
  g.rect(55, FLOOR - 6, 58, FLOOR - 1, Tile.SOLID);
  g.sign(53, "Seraph Wing: jump twice", "seraph_wing");
  g.marker("seraph_wing", 61);

  // 5. Bloodmist: an iron grate in a solid wall. Dodge through it.
  g.rect(64, 1, 64, FLOOR - 5, Tile.SOLID);
  g.rect(64, FLOOR - 4, 64, FLOOR - 1, Tile.BARS);
  g.sign(62, "Bloodmist: dodge through the grate", "bloodmist");
  g.marker("bloodmist", 67);

  // 6. Bell Toll: a crystal seal in a solid wall. Toll the bell. It regrows when you leave.
  g.rect(70, 1, 70, FLOOR - 5, Tile.SOLID);
  g.rect(70, FLOOR - 4, 70, FLOOR - 1, Tile.CRYSTAL);
  g.sign(68, "Bell Toll: ring it near the crystal", "bell_toll");
  g.marker("bell_toll", 72);

  // 7. Censer Fall: climb a tower, then plunge through its cracked roof into the chamber below.
  g.rect(74, FLOOR - 3, 76, FLOOR - 3, Tile.ONEWAY);
  g.rect(77, FLOOR - 6, 79, FLOOR - 6, Tile.ONEWAY);
  g.rect(80, FLOOR - 7, 90, FLOOR - 1, Tile.SOLID);
  g.rect(83, FLOOR - 7, 87, FLOOR - 7, Tile.CRACKED);
  g.rect(83, FLOOR - 6, 87, FLOOR - 1, Tile.AIR);
  g.rect(88, FLOOR - 4, 90, FLOOR - 1, Tile.AIR);
  g.sign(73, "Censer Fall: climb up, then press down in the air", "censer_fall");
  g.marker("censer_fall", 85);

  // 8. Penitent Grip: a four wide shaft with grip walls, then a ledge. Cling and wall jump.
  g.rect(94, FLOOR - 11, 95, FLOOR - 1, Tile.GRIP);
  g.rect(100, FLOOR - 11, 101, FLOOR - 1, Tile.GRIP);
  g.rect(102, FLOOR - 11, 114, FLOOR - 1, Tile.SOLID);
  g.sign(92, "Penitent Grip: cling to the green walls", "penitent_grip");
  g.marker("penitent_grip", 108, FLOOR - 12);
  g.sign(117, "That is every gate. Return when you wish.");
  return g;
}

/**
 * Builds the Yard map. `sanctuary` rooms light and respawn as usual. Returns the same object shape as generateTier.
 */
export function buildPracticeMap() {
  const a = buildCourtyard();
  const b = buildRampart();
  const room = (id, x, w, role, g, sanctuary) => ({
    id,
    x,
    y: 0,
    w,
    h: 1,
    zone: 0,
    ring: 0,
    gateDist: 0,
    role,
    sanctuary,
    tiles: { w: g.w, h: g.h, fg: g.fg, bg: g.bg, entities: g.entities, plain: true }
  });
  return {
    seed: "practice",
    practice: true,
    tier: { index: 0, name: "The Training Yard", biome: "midreach", clockSec: 0, gridW: 5, gridH: 1, heralds: 0 },
    abilities: { prior: [...ABILITY_IDS], found: [] },
    rooms: [room(0, 0, 2, "yard", a, true), room(1, 2, 3, "rampart", b, false)],
    edges: [{ a: 0, b: 1, dir: "R", cx: 1, cy: 0, kind: "normal" }],
    entryRoom: 0,
    gateRoom: -1,
    wardenRoom: -1,
    heraldRooms: [],
    grid: null,
    pacing: { clockSec: 0 },
    heraldNames: [],
    wardenName: "",
    stats: {}
  };
}
