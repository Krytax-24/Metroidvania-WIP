import { DT, ticks } from "../data/tunables.js";
import { STANDARD_BLOCKS } from "./body.js";
const boltRect = (b) => ({ x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h });
const waveRect = (w) => ({ x: w.x - 0.5, y: w.y - 1.4, w: 1, h: 1.4 });
const emberImpactRect = (e) => ({ x: e.x - 0.8, y: e.ground - 3, w: 1.6, h: 3 });
class Hazards {
  bolts = [];
  areas = [];
  embers = [];
  waves = [];
  clear() {
    this.bolts = [];
    this.areas = [];
    this.embers = [];
    this.waves = [];
  }
  /** Advances motion and lifetimes; collision with actors is resolved by the simulation. */
  step(world, onEmberImpact) {
    for (const b of this.bolts) {
      b.x += b.vx * DT;
      b.life--;
      if (STANDARD_BLOCKS(world.tile(Math.floor(b.x), Math.floor(b.y)))) b.life = 0;
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
    for (const a of this.areas) {
      if (a.arm > 0) a.arm--;
      else a.life--;
      a.dotT = Math.max(0, a.dotT - 1);
    }
    this.areas = this.areas.filter((a) => a.life > 0);
    for (const e of this.embers) {
      e.mark--;
      if (e.mark === 0) {
        onEmberImpact(e);
        this.areas.push({ kind: "pool", rect: { x: e.x - 1.1, y: e.ground - 0.7, w: 2.2, h: 0.7 }, arm: 0, life: ticks(e.poolMs), damage: e.poolDamage, dotT: 0 });
      }
    }
    this.embers = this.embers.filter((e) => e.mark > 0);
    for (const w of this.waves) {
      const nx = w.x + w.dir * w.speed * DT;
      const ahead = Math.floor(nx + w.dir * 0.5);
      if (STANDARD_BLOCKS(world.tile(ahead, Math.floor(w.y - 0.5)))) w.life = 0;
      else if (!STANDARD_BLOCKS(world.tile(ahead, Math.round(w.y))) && world.tile(ahead, Math.round(w.y)) !== 3) w.life = 0;
      w.x = nx;
      w.life--;
    }
    this.waves = this.waves.filter((w) => w.life > 0);
  }
}
function groundUnder(world, x, fromY, maxY) {
  for (let y = Math.floor(fromY); y < maxY; y++) {
    const t = world.tile(Math.floor(x), y);
    if (STANDARD_BLOCKS(t)) return y;
  }
  return maxY;
}
export {
  Hazards,
  boltRect,
  emberImpactRect,
  groundUnder,
  waveRect
};
