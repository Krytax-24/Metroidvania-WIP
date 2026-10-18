// Training Yard rules. Watches the simulation's own events and checks each drill's goal.
// Nothing here changes combat numbers; the Yard's gentler rules (no clock, no death) live in sim.js.
import { Tile } from "../gen/index.js";
import { drillsFor } from "../data/practice.js";
import { ticks } from "../data/tunables.js";

const REGROW = new Set([Tile.CRYSTAL, Tile.CRACKED, Tile.BREAKABLE, Tile.SHORTCUT]);

export class Practice {
  /** @param {object} sim  @param {string} character  @param {object} done  drill ids already finished, from the profile */
  constructor(sim, character, done = {}) {
    this.sim = sim;
    this.drills = drillsFor(character).map((d) => ({ ...d, progress: 0, done: !!done[d.id] }));
    this.markers = new Map();
    for (const e of sim.world.tiles.entities) if (e.kind === "marker") this.markers.set(e.id, e);
    this.lightHits = [];
    this.finished = [];
    this.restore = [];
    const w = sim.world;
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (REGROW.has(w.fg[y * w.w + x])) this.restore.push({ x, y, t: w.fg[y * w.w + x] });
  }

  get doneCount() {
    return this.drills.filter((d) => d.done).length;
  }

  /** The first drill not finished, for the HUD reminder. */
  next() {
    return this.drills.find((d) => !d.done) ?? null;
  }

  /** Drills finished since the last call, so the app can toast and save them. */
  takeFinished() {
    const f = this.finished;
    this.finished = [];
    return f;
  }

  complete(d) {
    if (d.done) return;
    d.done = true;
    d.progress = d.goal.n ?? 1;
    this.finished.push(d);
    this.sim.emit({ type: "drillDone", id: d.id, name: d.name });
  }

  bump(d, by = 1) {
    if (d.done) return;
    d.progress += by;
    if (d.progress >= (d.goal.n ?? 1)) this.complete(d);
  }

  /** Called for every simulation event. */
  note(e) {
    const p = this.sim.player;
    for (const d of this.drills) {
      if (d.done) continue;
      const g = d.goal;
      if (g.type === "count") {
        const ev = g.event === "flaskHeal" ? e.type === "heal" && e.flask : e.type === g.event;
        if (!ev) continue;
        if (g.filter && !Object.entries(g.filter).every(([k, v]) => e[k] === v)) continue;
        this.bump(d);
      } else if (g.type === "far") {
        if (e.type !== "hit" || e.target !== "enemy") continue;
        const isSkill = e.kind === "skill" || e.kind === "bolt";
        if (g.source === "skill" ? !isSkill : e.kind !== "light" && e.kind !== "air") continue;
        if (Math.abs(e.x - p.cx) >= g.dist) this.bump(d);
      } else if (g.type === "evade") {
        if (e.type === "whiff" && e.tele === g.tele && Math.abs(e.x - p.cx) < 9 && p.state !== "dead") this.bump(d);
      }
    }
    if (e.type === "hit" && e.target === "enemy" && (e.kind === "light" || e.kind === "air")) {
      this.lightHits.push(this.sim.tick);
      if (this.lightHits.length > 8) this.lightHits.shift();
      for (const d of this.drills) {
        if (d.done || d.goal.type !== "chain") continue;
        const n = d.goal.n;
        if (this.lightHits.length < n) continue;
        const span = this.lightHits[this.lightHits.length - 1] - this.lightHits[this.lightHits.length - n];
        if (span <= ticks(d.goal.windowMs)) this.complete(d);
      }
    }
  }

  /** Per tick: reach goals, refills and regrowing seals. */
  update() {
    const s = this.sim;
    const p = s.player;
    for (const d of this.drills) {
      if (d.done || d.goal.type !== "reach") continue;
      const m = this.markers.get(d.goal.marker);
      if (!m || m.room !== s.currentRoom) continue;
      if (Math.abs(m.x + 0.5 - p.cx) < 1.4 && Math.abs(m.y + 1 - p.body.y) < 1.6 && p.state !== "dead") this.complete(d);
    }
    p.flasks = p.flaskMax;
    if (p.fervor < 100) p.fervor = Math.min(100, p.fervor + 0.35);
    if (p.resolve < 100) p.resolve = Math.min(100, p.resolve + 0.5);
    if (p.hp < p.maxHp && p.state !== "dead") p.hp = Math.min(p.maxHp, p.hp + 0.25);
    if (s.tick % 30 === 0) {
      for (const r of this.restore) {
        if (s.world.tile(r.x, r.y) === r.t) continue;
        if (Math.hypot(r.x - p.cx, r.y - p.cy) > 10) s.world.set(r.x, r.y, r.t);
      }
    }
  }
}
