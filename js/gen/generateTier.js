import { GEN, TIERS } from "./config.js";
import { planExpedition, tierAbilities } from "./expedition.js";
import { LayoutBuilder, LayoutError } from "./layout.js";
import { assignRoles } from "./roles.js";
import { buildRoom, doorNode } from "./rooms.js";
import { stream } from "./rng.js";
import { Tile } from "./tiles.js";
import { validateMacro } from "./validate.js";
const OPPOSITE = { L: "R", R: "L", U: "D", D: "U" };
const STEP = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] };
const IN_ROOM_OBSTACLES = ["wraith_step", "chain_of_saints", "ember_ward", "seraph_wing", "penitent_grip"];
function zoneAbilities(prior, found, zone) {
  return /* @__PURE__ */ new Set([...prior, ...found.slice(0, zone)]);
}
function doorsFor(room, rooms, edges) {
  const out = [];
  for (const e of edges) {
    if (e.a !== room.id && e.b !== room.id) continue;
    const isA = e.a === room.id;
    const side = isA ? e.dir : OPPOSITE[e.dir];
    const [dx, dy] = STEP[e.dir];
    const gx = isA ? e.cx : e.cx + dx;
    const gy = isA ? e.cy : e.cy + dy;
    const lx = gx - room.x;
    const ly = gy - room.y;
    const info = { edge: e, side, lx, ly, node: doorNode(room, side, lx, ly) };
    if (e.kind === "gate" && e.ability) {
      if (!isA) {
        if (IN_ROOM_OBSTACLES.includes(e.ability)) info.obstacle = e.ability;
        if (e.ability === "bloodmist") info.barrier = Tile.BARS;
        if (e.ability === "bell_toll") info.barrier = Tile.CRYSTAL;
      } else if (e.ability === "censer_fall") {
        info.barrier = Tile.CRACKED;
      }
    }
    if (e.kind === "shortcut" && e.oneWayFrom === room.id) {
      info.barrier = Tile.SHORTCUT;
      info.lever = true;
    }
    if (e.kind === "secret" && isA) info.barrier = Tile.BREAKABLE;
    if (e.kind === "warden" && isA) info.barrier = Tile.SEAL;
    void rooms;
    out.push(info);
  }
  return out;
}
function generateTier(seed, tierIndex, opts = {}) {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const plan = planExpedition(seed);
  const spec = TIERS[tierIndex - 1];
  const abilities = tierAbilities(plan, tierIndex);
  const clockSec = Math.round(spec.clockSec * (opts.clockScale ?? 1));
  const failures = {};
  const fail = (reason) => {
    const key = reason.replace(/\d+/g, "#");
    failures[key] = (failures[key] ?? 0) + 1;
  };
  let roomRetries = 0;
  for (let attempt = 0; attempt < GEN.maxAttempts; attempt++) {
    const rng = stream(seed, `T${tierIndex}`, "layout", attempt);
    let layout;
    try {
      layout = new LayoutBuilder(spec, abilities, rng).build();
      assignRoles(layout, spec, abilities, stream(seed, `T${tierIndex}`, "roles", attempt));
    } catch (err) {
      if (err instanceof LayoutError) {
        fail(err.reason);
        continue;
      }
      throw err;
    }
    const macro = validateMacro({
      rooms: layout.rooms,
      edges: layout.edges,
      entryRoom: layout.entryRoom,
      gateRoom: layout.gateRoom,
      wardenRoom: layout.wardenRoom,
      heraldRooms: layout.heraldRooms,
      prior: abilities.prior,
      found: abilities.found,
      clockSec
    });
    if (!macro.ok) {
      fail(macro.reason ?? "macro");
      continue;
    }
    const heraldNames = plan.heralds[tierIndex - 1];
    const wardenName = tierIndex <= 2 ? plan.wardens[tierIndex - 1] : plan.finalGuardian;
    let roomsOk = true;
    let plainRooms = 0;
    if (!opts.macroOnly) {
      for (const room of layout.rooms) {
        const res = buildRoom(
          {
            room,
            doors: doorsFor(room, layout.rooms, layout.edges),
            abilities: zoneAbilities(abilities.prior, abilities.found, room.zone),
            prior: abilities.prior,
            biome: spec.biome,
            heraldName: room.heraldIndex !== void 0 ? heraldNames[room.heraldIndex] : void 0,
            wardenName
          },
          stream(seed, `T${tierIndex}`, "room", attempt, room.id)
        );
        if (!res.tiles) {
          fail(`room: ${res.failure}`);
          roomsOk = false;
          roomRetries++;
          break;
        }
        if (res.tiles.plain) plainRooms++;
        room.tiles = res.tiles;
      }
    }
    if (!roomsOk) continue;
    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const cells = layout.rooms.reduce((s, r) => s + (r.role === "warden" ? 0 : r.w * r.h), 0);
    const stats = {
      attempts: attempt + 1,
      roomRetries,
      plainRooms,
      ms: Math.round(t1 - t0),
      cells,
      loops: layout.edges.length - (layout.rooms.length - 1),
      secrets: layout.rooms.filter((r) => r.secret).length,
      sanctuaries: layout.rooms.filter((r) => r.sanctuary).length,
      failures
    };
    return {
      seed,
      tier: spec,
      abilities,
      rooms: layout.rooms,
      edges: layout.edges,
      entryRoom: layout.entryRoom,
      gateRoom: layout.gateRoom,
      wardenRoom: layout.wardenRoom,
      heraldRooms: layout.heraldRooms,
      grid: layout.grid,
      pacing: macro.pacing,
      heraldNames,
      wardenName,
      stats
    };
  }
  throw new Error(`Tier ${tierIndex} failed for seed "${seed}" after ${GEN.maxAttempts} attempts: ${JSON.stringify(failures)}`);
}
export {
  doorsFor,
  generateTier,
  zoneAbilities
};
