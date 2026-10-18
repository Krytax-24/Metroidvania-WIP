import { GEN } from "./config.js";
import { Bg, Tile } from "./tiles.js";
function stitchWorld(map) {
  const W = map.tier.gridW * GEN.cellW;
  const H = map.tier.gridH * GEN.cellH;
  const fg = new Uint8Array(W * H).fill(Tile.SOLID);
  const bg = new Uint8Array(W * H).fill(Bg.NONE);
  const roomOf = new Int32Array(W * H).fill(-1);
  const entities = [];
  for (const room of map.rooms) {
    const t = room.tiles;
    if (!t) continue;
    const ox = room.x * GEN.cellW;
    const oy = room.y * GEN.cellH;
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        const i = (oy + y) * W + ox + x;
        fg[i] = t.fg[y * t.w + x];
        bg[i] = t.bg[y * t.w + x];
        roomOf[i] = room.id;
      }
    }
    for (const e of t.entities) entities.push({ ...e, x: e.x + ox, y: e.y + oy, room: room.id });
  }
  return { w: W, h: H, fg, bg, roomOf, entities };
}
export {
  stitchWorld
};
