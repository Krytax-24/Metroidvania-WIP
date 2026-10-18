import { GEN } from "./config.js";
import { CONSERVATIVE, GENEROUS } from "./physics.js";
import { ReachGraph, STAND } from "./reach.js";
import { valueNoise1D } from "./rng.js";
import { Bg, Tile } from "./tiles.js";
const roomDebug = { onFail: null };
const CW = GEN.cellW;
const CH = GEN.cellH;
function doorNode(room, side, lx, ly) {
  const W = room.w * CW;
  const H = room.h * CH;
  switch (side) {
    case "L":
      return { x: 1, y: ly * CH + GEN.doorFloorRow - 1 };
    case "R":
      return { x: W - 2, y: ly * CH + GEN.doorFloorRow - 1 };
    case "U":
      return { x: lx * CW + GEN.doorCol + 1, y: 2 };
    case "D":
      return { x: lx * CW + GEN.doorCol + 1, y: H - 2 };
  }
}
class Canvas {
  constructor(W, H) {
    this.W = W;
    this.H = H;
    this.fg = new Uint8Array(W * H).fill(Tile.SOLID);
    this.bg = new Uint8Array(W * H);
    this.mark = new Uint8Array(W * H);
  }
  fg;
  bg;
  /** 1 = soft (decor that structures may clear), 2 = clearance (keep passable), 3 = structure, 4 = reserved (keep empty). */
  mark;
  in(x, y) {
    return x >= 0 && y >= 0 && x < this.W && y < this.H;
  }
  get(x, y) {
    return this.in(x, y) ? this.fg[y * this.W + x] : Tile.SOLID;
  }
  set(x, y, t) {
    if (this.in(x, y)) this.fg[y * this.W + x] = t;
  }
  markAt(x, y) {
    return this.in(x, y) ? this.mark[y * this.W + x] : 4;
  }
  setMark(x, y, m) {
    if (this.in(x, y)) this.mark[y * this.W + x] = Math.max(this.mark[y * this.W + x], m);
  }
  rect(x0, y0, x1, y1, t, mark = 0) {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (x <= 0 || y <= 0 || x >= this.W - 1 || y >= this.H - 1) continue;
        this.set(x, y, t);
        if (mark) this.setMark(x, y, mark);
      }
  }
  reserve(x0, y0, x1, y1) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.setMark(x, y, 4);
  }
}
function buildRoom(input, rng) {
  let lastFailure = "unknown";
  for (let attempt = 0; attempt < GEN.roomTries; attempt++) {
    const decorate = attempt < GEN.roomTries - 2;
    const variant = attempt;
    const r = buildOnce(input, rng.fork(`room${attempt}`), decorate, variant);
    if (r.tiles) {
      r.tiles.plain = !decorate;
      return r;
    }
    lastFailure = r.failure ?? lastFailure;
  }
  return { tiles: null, failure: lastFailure, hooks: [] };
}
function buildOnce(input, rng, decorate, variant) {
  const { room, doors } = input;
  const W = room.w * CW;
  const H = room.h * CH;
  const c = new Canvas(W, H);
  const F = H - 3;
  const arena = room.role === "herald" || room.role === "warden" || room.role === "gate";
  const hooks = [];
  const entities = [];
  c.rect(1, 1, W - 2, H - 2, Tile.AIR);
  const flat = new Uint8Array(W);
  const flatten = (x0, x1) => {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) flat[x] = 1;
  };
  for (const d of doors) {
    if ((d.side === "L" || d.side === "R") && d.ly === room.h - 1) {
      if (d.side === "L") flatten(0, 7);
      else flatten(W - 8, W - 1);
    }
    if (d.side === "D") flatten(d.lx * CW + GEN.doorCol - 4, d.lx * CW + GEN.doorCol + GEN.doorWidth + 3);
    if (d.obstacle) {
      if (d.side === "L") flatten(0, 30);
      if (d.side === "R") flatten(W - 31, W - 1);
    }
  }
  if (room.sanctuary) flatten(Math.floor(W / 2) - 4, Math.floor(W / 2) + 4);
  const floorBump = new Array(W).fill(0);
  const ceilBump = new Array(W).fill(0);
  if (decorate && !arena) {
    const fn = valueNoise1D(rng, W, rng.int(5, 9));
    const cn = valueNoise1D(rng, W, rng.int(3, 6));
    for (let x = 1; x < W - 1; x++) {
      floorBump[x] = flat[x] ? 0 : Math.round(fn[x] * 2.4);
      ceilBump[x] = Math.round(cn[x] * 3.2);
    }
    for (let x = 2; x < W - 1; x++) {
      if (floorBump[x] - floorBump[x - 1] > 1) floorBump[x] = floorBump[x - 1] + 1;
      if (floorBump[x - 1] - floorBump[x] > 1) floorBump[x] = floorBump[x - 1] - 1;
    }
  }
  for (let x = 1; x < W - 1; x++) {
    for (let y = F; y <= H - 2; y++) c.set(x, y, Tile.SOLID);
    for (let y = F - floorBump[x]; y < F; y++) {
      c.set(x, y, Tile.SOLID);
      c.setMark(x, y, 1);
    }
    for (let y = 1; y <= ceilBump[x]; y++) {
      c.set(x, y, Tile.SOLID);
      c.setMark(x, y, 1);
    }
  }
  const floorTopAt = (x) => F - floorBump[x];
  const stairTargets = [];
  for (const d of doors) {
    if (d.side === "L" || d.side === "R") {
      const base = d.ly * CH;
      const fr = base + GEN.doorFloorRow;
      const bx = d.side === "L" ? 0 : W - 1;
      const inward = d.side === "L" ? 1 : -1;
      for (let y = fr - GEN.doorHeight; y < fr; y++) c.set(bx, y, Tile.AIR);
      c.set(bx, fr, Tile.SOLID);
      for (let k = 1; k <= 5; k++) {
        const x = bx + inward * k;
        for (let y = fr - GEN.doorHeight - 1; y < fr; y++) {
          c.set(x, y, Tile.AIR);
        }
        c.set(x, fr, Tile.SOLID);
        c.setMark(x, fr, 3);
        if (d.ly < room.h - 1) {
          c.set(x, fr + 1, Tile.SOLID);
          c.setMark(x, fr + 1, 3);
        }
        for (let y = fr - GEN.doorHeight; y < fr; y++) c.setMark(x, y, 4);
      }
      if (d.ly < room.h - 1) {
        clearSoft(c, Math.min(bx, bx + inward * 9), fr - 9, Math.max(bx, bx + inward * 9), fr - 1);
        stairTargets.push({ x: bx + inward * 5, y: fr - 1, vertical: false });
      }
    } else if (d.side === "U") {
      const c0 = d.lx * CW + GEN.doorCol;
      for (let x = c0; x < c0 + GEN.doorWidth; x++) c.set(x, 0, Tile.AIR);
      for (let x = c0 - 1; x <= c0 + GEN.doorWidth; x++) {
        for (let y = 1; y <= 2; y++) {
          c.set(x, y, Tile.AIR);
          c.setMark(x, y, 4);
        }
        c.set(x, 3, Tile.ONEWAY);
        c.setMark(x, 3, 3);
      }
      clearSoft(c, c0 - 5, 1, c0 + GEN.doorWidth + 4, 5);
      stairTargets.push({ x: c0 + 1, y: 2, vertical: true });
    } else {
      const c0 = d.lx * CW + GEN.doorCol;
      for (let x = c0; x < c0 + GEN.doorWidth; x++) {
        for (let y = F - 1; y <= H - 2; y++) c.set(x, y, Tile.AIR);
        c.set(x, H - 1, Tile.ONEWAY);
      }
      c.reserve(c0 - 1, F - 5, c0 + GEN.doorWidth, H - 2);
    }
  }
  const priorSet = new Set(input.prior);
  for (const d of doors) {
    if (!d.obstacle) continue;
    const fail = buildObstacle(c, d, doors, room, F, variant, priorSet, input.abilities, hooks, entities);
    if (fail) return { tiles: null, failure: fail, hooks };
  }
  if (room.role === "herald" || room.role === "warden") {
    const ledgeY = F - 5;
    for (const x0 of [6, W - 12]) {
      for (let x = x0; x < x0 + 6; x++) {
        c.set(x, ledgeY, Tile.ONEWAY);
        c.setMark(x, ledgeY, 3);
      }
    }
  }
  stairTargets.sort((a, b) => b.y - a.y);
  for (const t of stairTargets) {
    if (!buildStairs(c, t, rng)) return dbg(c, hooks, "stairs blocked", [t.y * W + t.x << 2]);
  }
  if (decorate && !arena) decorateRoom(c, rng, F, floorTopAt, room);
  paintBackground(c, rng, room, input.biome);
  for (const d of doors) {
    if (d.barrier === void 0) continue;
    if (d.side === "L" || d.side === "R") {
      const fr = d.ly * CH + GEN.doorFloorRow;
      const bx = d.side === "L" ? 0 : W - 1;
      for (let y = fr - GEN.doorHeight; y < fr; y++) c.set(bx, y, d.barrier);
    } else {
      const c0 = d.lx * CW + GEN.doorCol;
      const y = d.side === "U" ? 0 : H - 1;
      for (let x = c0; x < c0 + GEN.doorWidth; x++) c.set(x, y, d.barrier);
    }
  }
  const conservative = new ReachGraph(c.fg, W, H, input.abilities, CONSERVATIVE, hooks);
  const doorKeys = [];
  for (const d of doors) {
    if (!conservative.standable(d.node.x, d.node.y)) return dbg(c, hooks, `door ${d.side} not standable`);
    doorKeys.push(conservative.key(d.node.x, d.node.y, STAND));
  }
  if (doorKeys.length === 0) return dbg(c, hooks, "room has no doors");
  const reach0 = conservative.reach([doorKeys[0]]);
  placeEntities(c, rng, input, conservative, reach0, entities, F);
  const poi = [];
  const poiNames = [];
  for (const e of entities) {
    if (e.kind === "hook" || e.kind === "enemy" || e.kind === "elite") continue;
    poi.push(conservative.key(e.x, e.y, STAND));
    poiNames.push(e.kind);
  }
  for (let i = 0; i < doors.length; i++) {
    const r = i === 0 ? reach0 : conservative.reach([doorKeys[i]]);
    for (let j = 0; j < doors.length; j++) {
      if (!r.has(doorKeys[j])) return dbg(c, hooks, `door ${doors[i].side} cannot reach door ${doors[j].side}`, [...r]);
    }
    for (let j = 0; j < poi.length; j++) {
      if (!r.has(poi[j])) return dbg(c, hooks, `door cannot reach ${poiNames[j]}`);
    }
  }
  for (let j = 0; j < poi.length; j++) {
    if (!conservative.reach([poi[j]]).has(doorKeys[0])) return dbg(c, hooks, `${poiNames[j]} is a trap`);
  }
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i];
    if (!d.obstacle) continue;
    const without = new Set(input.abilities);
    without.delete(d.obstacle);
    const generous = new ReachGraph(c.fg, W, H, without, GENEROUS, hooks);
    const leak = generous.reach([generous.key(d.node.x, d.node.y, STAND)]);
    for (let j = 0; j < doors.length; j++) {
      if (j !== i && leak.has(generous.key(doors[j].node.x, doors[j].node.y, STAND)))
        return dbg(c, hooks, `lock leak ${d.obstacle}`);
    }
    for (let j = 0; j < poi.length; j++) {
      if (leak.has(poi[j])) return dbg(c, hooks, `lock leak ${d.obstacle} (${poiNames[j]})`, [...leak, poi[j]]);
    }
  }
  return {
    tiles: { w: W, h: H, fg: c.fg, bg: c.bg, entities, plain: !decorate },
    hooks
  };
}
function dbg(c, hooks, failure, marks = []) {
  roomDebug.onFail?.(c.fg, c.W, c.H, failure, marks);
  return { tiles: null, failure, hooks };
}
function buildObstacle(c, d, doors, room, F, variant, prior, abilities, hooks, entities) {
  const W = c.W;
  const H = c.H;
  const side = d.side;
  const ability = d.obstacle;
  const col = (k) => side === "L" ? k : W - 1 - k;
  const span = (k0, k1) => {
    const a = col(k0);
    const b = col(k1);
    return [Math.min(a, b), Math.max(a, b)];
  };
  const others = [...abilities].filter((a) => a !== ability);
  const hasDj = others.includes("seraph_wing") || prior.has("seraph_wing");
  const hasDash = others.includes("wraith_step") || prior.has("wraith_step");
  const vary = [0, 1, -1, 2, -2, 3][variant] ?? 0;
  const clashes = (x0, x1) => doors.some((o) => {
    if (o.side !== "U" && o.side !== "D") return false;
    const c0 = o.lx * CW + GEN.doorCol;
    return c0 - 2 <= x1 && c0 + GEN.doorWidth + 1 >= x0;
  });
  if (side === "L" || side === "R") {
    if (d.ly !== room.h - 1) return "side gate not on bottom row";
    if (ability === "wraith_step" || ability === "chain_of_saints") {
      let P;
      if (ability === "wraith_step") P = (hasDj ? 15 : 10) + vary;
      else P = (hasDj && hasDash ? 22 : hasDj || hasDash ? 17 : 12) + vary;
      if (3 + P + 4 > W - 2) return "room too narrow for pit";
      const [x0, x1] = span(3, 2 + P);
      if (clashes(x0 - 1, x1 + 1)) return "obstacle overlaps door";
      for (let x = x0; x <= x1; x++) {
        c.set(x, F, Tile.AIR);
        c.set(x, F + 1, Tile.SPIKES);
      }
      const [r0, r1] = span(1, 3 + P);
      c.reserve(r0, 1, r1, F + 1);
      if (ability === "chain_of_saints") {
        const ringY = F - 6 + variant % 2;
        const count = P > 15 ? 2 : 1;
        for (let i = 1; i <= count; i++) {
          const k = 2 + Math.round(P * i / (count + 1));
          const hk = { x: col(k), y: ringY };
          hooks.push(hk);
          entities.push({ kind: "hook", x: hk.x, y: hk.y });
          for (let y = ringY - 1; y <= ringY + 4; y++) c.set(hk.x, y, Tile.AIR);
        }
      }
      return null;
    }
    if (ability === "ember_ward") {
      const T = 9 + Math.abs(vary);
      const [x0, x1] = span(3, 2 + T);
      if (clashes(x0, x1)) return "obstacle overlaps door";
      for (let x = x0; x <= x1; x++) {
        for (let y = 1; y <= F - 4; y++) c.set(x, y, Tile.SOLID);
        for (let y = F - 3; y <= F - 1; y++) c.set(x, y, Tile.LIQUID);
      }
      const [r0, r1] = span(1, 3 + T);
      c.reserve(r0, 1, r1, F);
      return null;
    }
    if (ability === "seraph_wing") {
      const ph = 6 + variant % 2;
      const [x0, x1] = span(3, 6);
      if (clashes(x0, x1)) return "obstacle overlaps door";
      for (let x = x0; x <= x1; x++) for (let y = F - ph; y < F; y++) c.set(x, y, Tile.SOLID);
      const [r0, r1] = span(1, 7);
      c.reserve(r0, 1, r1, F);
      return null;
    }
    return `no side obstacle for ${ability}`;
  }
  if (side === "D") {
    const c0 = d.lx * CW + GEN.doorCol;
    const gripWall = ability === "penitent_grip";
    if (ability !== "penitent_grip" && ability !== "seraph_wing") return `no vertical obstacle for ${ability}`;
    const hgt = gripWall ? 12 + variant % 2 : 7 - variant % 2;
    const top = H - 2 - hgt + 1;
    if (top < 4) return "room too short for shaft";
    const wall = gripWall ? Tile.GRIP : Tile.SOLID;
    for (let y = top; y <= H - 2; y++) {
      for (const x of [c0 - 2, c0 - 1, c0 + GEN.doorWidth, c0 + GEN.doorWidth + 1]) c.set(x, y, wall);
      for (let x = c0; x < c0 + GEN.doorWidth; x++) c.set(x, y, Tile.AIR);
    }
    c.reserve(c0 - 3, Math.max(1, top - 4), c0 + GEN.doorWidth + 2, H - 2);
    return null;
  }
  return `unsupported gate side ${side}`;
}
function buildStairs(c, target, rng) {
  let cx = target.x;
  let cy = target.y;
  let dir = cx < c.W / 2 ? 1 : -1;
  for (let guard = 0; guard < 40; guard++) {
    if (supported(c, cx, cy)) return true;
    let placed = false;
    const ladder = target.vertical && guard < 2;
    const tries = ladder ? [[dir, rng.int(0, 1)], [-dir, 1], [dir, 2], [-dir, 2], [dir, 3], [-dir, 3]] : [
      [dir, rng.int(3, 4)],
      [-dir, rng.int(3, 4)],
      [dir, 2],
      [-dir, 2],
      [dir, 5],
      [-dir, 5],
      [0, 0]
    ];
    for (const [dd, off] of tries) {
      const nx = Math.max(3, Math.min(c.W - 4, cx + dd * off));
      const ny = cy + 3;
      if (ny + 1 >= c.H - 1) break;
      if (tryPlatform(c, nx, ny + 1, rng.int(4, 6))) {
        cx = nx;
        cy = ny;
        dir = dd === 0 ? -dir : -dd;
        placed = true;
        break;
      }
    }
    if (!placed) return false;
  }
  return false;
}
function supported(c, x, y) {
  const surface = (t) => t === Tile.SOLID || t === Tile.ONEWAY || t === Tile.GRIP;
  for (let dx = -4; dx <= 4; dx++) {
    const cx = x + dx;
    if (cx < 1 || cx > c.W - 2) continue;
    for (let f = y + 1; f <= y + 3; f++) {
      if (f + 1 >= c.H) break;
      if (!surface(c.get(cx, f + 1))) continue;
      let clear = true;
      for (let r = f - 2; r <= f; r++) {
        const t = c.get(cx, r);
        if (t === Tile.SOLID || t === Tile.GRIP) clear = false;
      }
      if (clear) return true;
    }
  }
  return false;
}
function tryPlatform(c, centerX, row, len) {
  const x0 = centerX - Math.floor(len / 2);
  const x1 = x0 + len - 1;
  if (x0 < 2 || x1 > c.W - 3 || row < 4 || row > c.H - 3) return false;
  for (let x = x0; x <= x1; x++) {
    const m = c.markAt(x, row);
    const t = c.get(x, row);
    if (m >= 3 || t !== Tile.AIR && m !== 1) return false;
    for (const dy of [-2, -1, 1, 2]) if (c.get(x, row + dy) === Tile.ONEWAY) return false;
    for (let y = row - 3; y < row; y++) {
      const mb = c.markAt(x, y);
      const tb = c.get(x, y);
      if (mb === 4) return false;
      if (tb !== Tile.AIR && tb !== Tile.ONEWAY && mb !== 1) return false;
    }
  }
  for (let x = x0; x <= x1; x++) {
    for (let y = row - 3; y < row; y++) {
      if (c.get(x, y) === Tile.SOLID) c.set(x, y, Tile.AIR);
      c.setMark(x, y, 2);
    }
    c.set(x, row, Tile.ONEWAY);
    c.setMark(x, row, 3);
  }
  clearSoft(c, x0 - 2, Math.max(1, row - 10), x1 + 2, row - 5);
  return true;
}
function clearSoft(c, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if (c.markAt(x, y) === 1 && c.get(x, y) === Tile.SOLID) c.set(x, y, Tile.AIR);
}
function decorateRoom(c, rng, F, floorTopAt, room) {
  const W = c.W;
  const area = room.w * room.h;
  const blocks = rng.int(area, area * 3);
  for (let i = 0; i < blocks; i++) {
    const len = rng.int(2, 5);
    const x0 = rng.int(3, W - 4 - len);
    const y = rng.int(5, F - 5);
    let ok = true;
    for (let x = x0 - 1; x <= x0 + len; x++)
      for (let yy = y - 4; yy <= y + 3; yy++) {
        if (c.markAt(x, yy) >= 2 || c.get(x, yy) !== Tile.AIR && c.markAt(x, yy) !== 1) ok = false;
      }
    if (!ok) continue;
    for (let x = x0; x < x0 + len; x++) {
      c.set(x, y, Tile.SOLID);
      c.setMark(x, y, 1);
    }
  }
  if (room.role === "combat" || room.role === "platforming" || room.role === "elite") {
    const strips = rng.int(0, Math.min(3, room.w + 1));
    for (let i = 0; i < strips; i++) {
      const len = rng.int(2, 3);
      const x0 = rng.int(8, W - 9 - len);
      let ok = true;
      const top = floorTopAt(x0);
      for (let x = x0 - 2; x < x0 + len + 2; x++) {
        if (floorTopAt(x) !== top) ok = false;
        for (let y = top - 5; y < top; y++) if (c.markAt(x, y) >= 2 || c.get(x, y) !== Tile.AIR) ok = false;
      }
      if (!ok) continue;
      for (let x = x0; x < x0 + len; x++) c.set(x, top - 1, Tile.SPIKES);
    }
  }
}
function paintBackground(c, rng, room, biome) {
  const W = c.W;
  const H = c.H;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (c.get(x, y) !== Tile.SOLID && c.get(x, y) !== Tile.GRIP) c.bg[y * W + x] = Bg.WALL;
  const spacing = biome === "undercroft" ? 9 : biome === "midreach" ? 11 : 13;
  for (let x = rng.int(4, spacing); x < W - 3; x += spacing + rng.int(-1, 2)) {
    for (let y = 1; y < H - 1; y++) {
      for (const px of [x, x + 1]) if (c.bg[y * W + px] === Bg.WALL) c.bg[y * W + px] = Bg.PILLAR;
    }
  }
  const windows = rng.int(room.w, room.w * 2);
  for (let i = 0; i < windows; i++) {
    const x0 = rng.int(3, W - 7);
    const y0 = rng.int(3, Math.max(4, H - 14));
    const kind = biome === "undercroft" ? Bg.ARCH : Bg.WINDOW;
    for (let y = y0; y < y0 + 7; y++)
      for (let x = x0; x < x0 + 3; x++) if (c.bg[y * W + x] === Bg.WALL) c.bg[y * W + x] = kind;
  }
  const chains = rng.int(0, room.w * 2);
  for (let i = 0; i < chains; i++) {
    const x = rng.int(2, W - 3);
    const len = rng.int(3, 8);
    for (let y = 1; y < 1 + len; y++) if (c.bg[y * W + x] === Bg.WALL || c.bg[y * W + x] === Bg.PILLAR) c.bg[y * W + x] = Bg.CHAIN;
  }
}
function placeEntities(c, rng, input, g, reach, out, F) {
  const { room, doors } = input;
  const W = c.W;
  const stands = [];
  for (const k of reach) {
    const n = g.decode(k);
    if (n.kind === STAND && c.markAt(n.x, n.y) < 4) stands.push({ x: n.x, y: n.y });
  }
  const nearDoor = (p, r) => doors.some((d) => Math.abs(d.node.x - p.x) + Math.abs(d.node.y - p.y) <= r);
  const taken = [];
  const free = (p, r) => !taken.some((t) => Math.abs(t.x - p.x) + Math.abs(t.y - p.y) <= r);
  const floorish = stands.filter((p) => p.y >= F - 4);
  const centerSpot = () => {
    const pool2 = floorish.length ? floorish : stands;
    let best = pool2[0];
    for (const p of pool2) if (Math.abs(p.x - W / 2) + (F - 1 - p.y) < Math.abs(best.x - W / 2) + (F - 1 - best.y)) best = p;
    return best;
  };
  if (room.role === "herald" && stands.length) {
    const p = centerSpot();
    out.push({ kind: "herald", x: p.x, y: p.y, name: input.heraldName });
    taken.push(p);
  }
  if (room.role === "warden" && stands.length) {
    const p = centerSpot();
    out.push({ kind: "warden", x: p.x, y: p.y, name: input.wardenName });
    taken.push(p);
  }
  if (room.sanctuary && stands.length) {
    const p = centerSpot();
    out.push({ kind: "sanctuary", x: p.x, y: p.y });
    taken.push(p);
  }
  const highSpot = () => {
    const pool2 = stands.filter((p) => !nearDoor(p, 5) && free(p, 4));
    if (pool2.length === 0) return stands.find((p) => free(p, 2)) ?? stands[0];
    pool2.sort((a, b) => a.y - b.y);
    return rng.pick(pool2.slice(0, Math.max(1, Math.ceil(pool2.length * 0.25))));
  };
  if (room.abilityPickup && stands.length) {
    const p = highSpot();
    out.push({ kind: "ability", x: p.x, y: p.y, ability: room.abilityPickup });
    taken.push(p);
  }
  for (const loot of room.loot) {
    if (!stands.length) break;
    const p = highSpot();
    out.push({ kind: "loot", x: p.x, y: p.y, loot });
    taken.push(p);
  }
  for (const d of doors) {
    if (d.lever) {
      const inward = d.side === "L" ? 2 : -2;
      const p = { x: d.node.x + inward, y: d.node.y };
      if (g.standable(p.x, p.y)) {
        out.push({ kind: "lever", x: p.x, y: p.y });
        taken.push(p);
      }
    }
    if (d.edge.kind === "warden" && room.role === "gate") {
      out.push({ kind: "seal_door", x: d.node.x, y: d.node.y });
    }
  }
  if (room.sanctuary || room.secret || room.role === "gate" || room.role === "warden" || room.role === "herald" || room.role === "entry") return;
  const range = GEN.enemies[room.role] ?? [1, 2];
  const count = rng.int(range[0], range[1]) + (room.w * room.h > 2 ? 1 : 0);
  const pool = rng.shuffle(stands.filter((p) => !nearDoor(p, 7)));
  let placed = 0;
  for (const p of pool) {
    if (placed >= count) break;
    if (!free(p, 5)) continue;
    const elite = room.role === "elite" && placed === 0;
    out.push({ kind: elite ? "elite" : "enemy", x: p.x, y: p.y });
    taken.push(p);
    placed++;
  }
}
export {
  buildRoom,
  doorNode,
  roomDebug
};
