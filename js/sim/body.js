import { Tile } from "../gen/index.js";
import { DT } from "../data/tunables.js";
const centerX = (b) => b.x + b.w / 2;
function overlapsTiles(world, x, y, w, h, test) {
  const c0 = Math.floor(x);
  const c1 = Math.floor(x + w - 1e-6);
  const r0 = Math.floor(y - h);
  const r1 = Math.floor(y - 1e-6);
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) if (test(world.tile(c, r))) return true;
  return false;
}
function outside(b, x, w) {
  return !!b && (x < b.x || x + w > b.x + b.w);
}
function moveBody(world, b, rules) {
  const res = { wall: 0, wallCol: -1, landed: false, ceiling: false };
  if (b.vx !== 0) {
    let nx = b.x + b.vx * DT;
    const hitTiles = overlapsTiles(world, nx, b.y, b.w, b.h, rules.blocks);
    if (hitTiles || outside(rules.bounds, nx, b.w)) {
      if (hitTiles) {
        const col = b.vx > 0 ? Math.floor(nx + b.w - 1e-6) : Math.floor(nx);
        res.wallCol = col;
        nx = b.vx > 0 ? col - b.w - 1e-3 : col + 1 + 1e-3;
      } else if (rules.bounds) {
        nx = b.vx > 0 ? rules.bounds.x + rules.bounds.w - b.w - 1e-3 : rules.bounds.x + 1e-3;
      }
      if (overlapsTiles(world, nx, b.y, b.w, b.h, rules.blocks)) nx = b.x;
      res.wall = Math.sign(b.vx);
    }
    b.x = nx;
  }
  let ny = b.y + b.vy * DT;
  const c0 = Math.floor(b.x);
  const c1 = Math.floor(b.x + b.w - 1e-6);
  if (b.vy < 0) {
    const head = Math.floor(ny - b.h);
    for (let c = c0; c <= c1; c++) {
      if (rules.blocks(world.tile(c, head))) {
        ny = head + 1 + b.h;
        b.vy = 0;
        res.ceiling = true;
        break;
      }
    }
    b.grounded = false;
  } else {
    let landed = false;
    for (let r = Math.ceil(b.y - 1e-6); r <= Math.floor(ny) && !landed; r++) {
      let solid = false;
      for (let c = c0; c <= c1; c++) {
        const t = world.tile(c, r);
        if (rules.blocks(t) || !rules.dropping && rules.oneWay(t) && b.y <= r + 1e-6) solid = true;
      }
      if (solid) {
        if (rules.passFloor?.(r, c0, c1)) continue;
        ny = r;
        landed = true;
      }
    }
    if (landed) {
      if (!b.grounded) res.landed = true;
      b.grounded = true;
      b.vy = 0;
    } else {
      b.grounded = supported(world, b.x, ny, b.w, rules) && b.vy >= 0 && Math.abs(ny - Math.round(ny)) < 1e-3;
    }
  }
  b.y = ny;
  return res;
}
function supported(world, x, y, w, rules) {
  if (Math.abs(y - Math.round(y)) > 1e-3) return false;
  const r = Math.round(y);
  const c0 = Math.floor(x);
  const c1 = Math.floor(x + w - 1e-6);
  for (let c = c0; c <= c1; c++) {
    const t = world.tile(c, r);
    if (rules.blocks(t) || !rules.dropping && rules.oneWay(t)) return true;
  }
  return false;
}
function floorAhead(world, b, dir, rules) {
  const fx = dir > 0 ? Math.floor(b.x + b.w + 0.1) : Math.floor(b.x - 0.1);
  const r = Math.round(b.y);
  const t = world.tile(fx, r);
  return rules.blocks(t) || rules.oneWay(t);
}
const STANDARD_BLOCKS = (t) => t === Tile.SOLID || t === Tile.GRIP || t === Tile.SHORTCUT || t === Tile.SEAL || t === Tile.CRACKED || t === Tile.CRYSTAL || t === Tile.BREAKABLE || t === Tile.BARS;
const STANDARD_ONEWAY = (t) => t === Tile.ONEWAY;
export {
  STANDARD_BLOCKS,
  STANDARD_ONEWAY,
  centerX,
  floorAhead,
  moveBody,
  overlapsTiles,
  supported
};
