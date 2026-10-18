import { GEN, Tile, stitchWorld } from "../gen/index.js";
class World {
  constructor(map) {
    this.map = map;
    this.tiles = stitchWorld(map);
    this.w = this.tiles.w;
    this.h = this.tiles.h;
    this.fg = this.tiles.fg.slice();
  }
  w;
  h;
  fg;
  tiles;
  tile(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return Tile.SOLID;
    return this.fg[y * this.w + x];
  }
  set(x, y, t) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.fg[y * this.w + x] = t;
  }
  roomAt(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return -1;
    return this.tiles.roomOf[iy * this.w + ix];
  }
  roomRect(room) {
    return { x: room.x * GEN.cellW, y: room.y * GEN.cellH, w: room.w * GEN.cellW, h: room.h * GEN.cellH };
  }
  /** Replaces every tile of one kind connected to (x, y). Returns the count. */
  flood(x, y, from, to, limit = 600) {
    const out = [];
    const stack = [[x, y]];
    while (stack.length && out.length < limit) {
      const [cx, cy] = stack.pop();
      if (this.tile(cx, cy) !== from) continue;
      this.set(cx, cy, to);
      out.push({ x: cx, y: cy });
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    return out;
  }
  lineClear(x0, y0, x1, y1, blocks) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (blocks(this.tile(Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t)))) return false;
    }
    return true;
  }
}
export {
  World
};
