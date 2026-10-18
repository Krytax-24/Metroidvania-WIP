import { jumpVelocity } from "./physics.js";
import { Tile } from "./tiles.js";
const STAND = 0;
const CLING_L = 1;
const CLING_R = 2;
const HANG = 3;
class ReachGraph {
  constructor(fg, w, h, abilities, m, hooks = []) {
    this.fg = fg;
    this.w = w;
    this.h = h;
    this.m = m;
    this.hooks = hooks;
    this.grip = abilities.has("penitent_grip");
    this.dj = abilities.has("seraph_wing");
    this.dash = abilities.has("wraith_step");
    this.hookOn = abilities.has("chain_of_saints");
    this.plunge = abilities.has("censer_fall");
    this.mist = abilities.has("bloodmist");
    this.ward = abilities.has("ember_ward");
    this.bell = abilities.has("bell_toll");
    this.jumpV = jumpVelocity(m, m.jumpHeight);
    this.djV = jumpVelocity(m, m.doubleJumpHeight);
    this.plans = this.buildPlans();
  }
  adj = /* @__PURE__ */ new Map();
  grip;
  dj;
  dash;
  hookOn;
  plunge;
  mist;
  ward;
  bell;
  jumpV;
  djV;
  plans;
  // ------------------------------------------------------------- keys
  key(x, y, kind) {
    return y * this.w + x << 2 | kind;
  }
  decode(k) {
    const kind = k & 3;
    const i = k >> 2;
    return { x: i % this.w, y: Math.floor(i / this.w), kind };
  }
  // ------------------------------------------------------------- tiles
  tile(x, y) {
    if (y >= this.h) return Tile.AIR;
    if (x < 0 || y < 0 || x >= this.w) return Tile.SOLID;
    return this.fg[y * this.w + x];
  }
  blocks(t) {
    switch (t) {
      case Tile.SOLID:
      case Tile.GRIP:
      case Tile.SHORTCUT:
      case Tile.SEAL:
        return true;
      case Tile.CRACKED:
        return !this.plunge;
      case Tile.BARS:
        return !this.mist;
      case Tile.CRYSTAL:
        return !this.bell;
      default:
        return false;
    }
  }
  oneWay(t) {
    return t === Tile.ONEWAY || t === Tile.CRACKED && this.plunge;
  }
  hazard(t) {
    return t === Tile.SPIKES || t === Tile.LIQUID && !this.ward;
  }
  bodyOk(x, feet) {
    for (let r = feet - 2; r <= feet; r++) {
      if (r < 0 || x < 0 || x >= this.w || r >= this.h) return false;
      const t = this.fg[r * this.w + x];
      if (this.blocks(t) || this.hazard(t)) return false;
    }
    return true;
  }
  support(x, feet) {
    const t = this.tile(x, feet + 1);
    return this.blocks(t) || this.oneWay(t);
  }
  standable(x, feet) {
    return this.bodyOk(x, feet) && this.support(x, feet);
  }
  // ------------------------------------------------------------- search
  /** All nodes reachable from the start nodes. */
  reach(starts) {
    const seen = new Set(starts);
    const queue = starts.slice();
    for (let qi = 0; qi < queue.length; qi++) {
      for (const n of this.neighbors(queue[qi])) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    return seen;
  }
  neighbors(k) {
    let list = this.adj.get(k);
    if (list) return list;
    const out = /* @__PURE__ */ new Set();
    const { x, y, kind } = this.decode(k);
    if (kind === STAND) this.expandStand(x, y, out);
    else if (kind === HANG) this.expandHang(x, y, out);
    else this.expandCling(x, y, kind === CLING_L ? -1 : 1, out);
    out.delete(k);
    list = [...out];
    this.adj.set(k, list);
    return list;
  }
  leftOf(x) {
    return x + (1 - this.m.bodyW) / 2;
  }
  expandStand(x, y, out) {
    for (const d of [-1, 1]) {
      const nx = x + d;
      if (this.standable(nx, y)) out.add(this.key(nx, y, STAND));
      else if (this.standable(nx, y - 1) && this.bodyOk(x, y - 1)) out.add(this.key(nx, y - 1, STAND));
      else if (this.bodyOk(nx, y)) {
        this.simulate(this.leftOf(nx), y + 1.02, 0, { pre: 0, post: 0, sw: 0 }, out);
        this.simulate(this.leftOf(nx), y + 1.02, 0, { pre: d, post: d, sw: 0 }, out);
      }
    }
    if (this.oneWay(this.tile(x, y + 1))) {
      for (const d of [0, -1, 1]) this.simulate(this.leftOf(x), y + 1.08, 1, { pre: d, post: d, sw: 0 }, out);
    }
    for (const p of this.plans) this.simulate(this.leftOf(x), y + 1, -this.jumpV, p, out);
    this.hookFrom(x + 0.5, y + 1 - this.m.bodyH / 2, out);
  }
  expandHang(x, y, out) {
    for (const p of this.plans) this.simulate(this.leftOf(x), y + 1, -this.jumpV, p, out);
    for (const d of [0, -1, 1]) this.simulate(this.leftOf(x), y + 1, 0, { pre: d, post: d, sw: 0 }, out);
  }
  expandCling(x, y, side, out) {
    const wx = x + side;
    const gripCovers = (feet) => {
      for (let r = feet - 2; r <= feet; r++) if (this.tile(wx, r) === Tile.GRIP) return true;
      return false;
    };
    const kind = side < 0 ? CLING_L : CLING_R;
    if (this.bodyOk(x, y - 1) && gripCovers(y - 1)) out.add(this.key(x, y - 1, kind));
    if (this.bodyOk(x, y + 1) && gripCovers(y + 1)) out.add(this.key(x, y + 1, kind));
    if (this.support(x, y)) out.add(this.key(x, y, STAND));
    if (!this.blocks(this.tile(wx, y - 2))) {
      for (let f = y - 3; f <= y + 1; f++) {
        if (this.standable(wx, f)) {
          out.add(this.key(wx, f, STAND));
          break;
        }
      }
    }
    const away = -side;
    const wallPlans = [
      { pre: away, post: away, sw: 0 },
      { pre: away, post: 0, sw: 5 },
      { pre: away, post: side, sw: 7 }
    ];
    if (this.dj) wallPlans.push({ pre: away, post: away, sw: 0, actions: [{ type: "dj", dir: away }] });
    if (this.dash) wallPlans.push({ pre: away, post: away, sw: 0, actions: [{ type: "dash", dir: away, after: away }] });
    for (const p of wallPlans) this.simulate(this.leftOf(x), y + 1, -this.jumpV * 0.95, p, out);
    this.simulate(this.leftOf(x), y + 1.01, 0, { pre: 0, post: 0, sw: 0 }, out);
    this.simulate(this.leftOf(x), y + 1.01, 0, { pre: away, post: away, sw: 0 }, out);
  }
  hookFrom(cx, cy, out) {
    if (!this.hookOn) return;
    const r2 = this.m.hookRadius * this.m.hookRadius;
    for (const hk of this.hooks) {
      const hx = hk.x + 0.5;
      const hy = hk.y + 0.5;
      const dx = hx - cx;
      const dy = hy - cy;
      if (dx * dx + dy * dy > r2) continue;
      if (!this.lineClear(cx, cy, hx, hy)) continue;
      const feet = hk.y + 3;
      if (this.bodyOk(hk.x, feet)) out.add(this.key(hk.x, feet, HANG));
    }
  }
  lineClear(x0, y0, x1, y1) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.blocks(this.tile(Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t)))) return false;
    }
    return true;
  }
  // ------------------------------------------------------------- physics
  buildPlans() {
    const plans = [{ pre: 0, post: 0, sw: 0 }];
    for (const d of [-1, 1]) {
      plans.push(
        { pre: d, post: d, sw: 0 },
        { pre: 0, post: d, sw: 3 },
        { pre: 0, post: d, sw: 6 },
        { pre: d, post: 0, sw: 2 },
        { pre: d, post: 0, sw: 5 },
        { pre: d, post: 0, sw: 9 }
      );
      if (this.dj) {
        plans.push(
          { pre: d, post: d, sw: 0, actions: [{ type: "dj", dir: d }] },
          { pre: 0, post: 0, sw: 0, actions: [{ type: "dj", dir: d }] },
          { pre: d, post: d, sw: 0, actions: [{ type: "dj", dir: 0 }] }
        );
      }
      if (this.dash) {
        plans.push(
          { pre: d, post: d, sw: 0, actions: [{ type: "dash", dir: d, after: d }] },
          { pre: 0, post: 0, sw: 0, actions: [{ type: "dash", dir: d, after: 0 }] },
          { pre: d, post: d, sw: 0, dashTick: 2, dashDir: d }
        );
      }
      if (this.dj && this.dash) {
        plans.push(
          { pre: d, post: d, sw: 0, actions: [{ type: "dash", dir: d, after: d }, { type: "dj", dir: d }] },
          { pre: d, post: d, sw: 0, actions: [{ type: "dj", dir: d }, { type: "dash", dir: d, after: d }] }
        );
      }
    }
    if (this.dj) plans.push({ pre: 0, post: 0, sw: 0, actions: [{ type: "dj", dir: 0 }] });
    return plans;
  }
  rowsBlockH(x, feet) {
    const { bodyW, bodyH } = this.m;
    const c0 = Math.floor(x);
    const c1 = Math.floor(x + bodyW - 1e-6);
    const r0 = Math.floor(feet - bodyH);
    const r1 = Math.floor(feet - 1e-6);
    for (let c = c0; c <= c1; c++)
      for (let r = r0; r <= r1; r++) if (this.blocks(this.tile(c, r))) return c;
    return -1;
  }
  touchesHazard(x, feet) {
    const { bodyW, bodyH } = this.m;
    const c0 = Math.floor(x);
    const c1 = Math.floor(x + bodyW - 1e-6);
    const r0 = Math.floor(feet - bodyH);
    const r1 = Math.floor(feet - 1e-6);
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) if (this.hazard(this.tile(c, r))) return true;
    return false;
  }
  /**
   * Simulates one controlled airborne trajectory and adds the node it ends on.
   * x is the body's left edge, feet is the bottom edge, both in tiles.
   */
  simulate(x, feet, vy0, plan, out) {
    const m = this.m;
    const { dt, bodyW, bodyH } = m;
    let y = feet;
    let vy = vy0;
    let override = null;
    let dashT = 0;
    let dashDir = 0;
    let usedDj = false;
    let usedDash = false;
    let actionIdx = 0;
    const actions = plan.actions ?? [];
    const runAction = () => {
      const a = actions[actionIdx];
      if (!a) return;
      actionIdx++;
      if (a.type === "dj" && this.dj && !usedDj) {
        usedDj = true;
        vy = -this.djV;
        override = a.dir;
      } else if (a.type === "dash" && this.dash && !usedDash) {
        usedDash = true;
        dashT = m.dashTime;
        dashDir = a.dir;
        override = a.after ?? a.dir;
      }
    };
    for (let tick = 0; tick < m.maxTicks; tick++) {
      const dir = override ?? (tick < plan.sw ? plan.pre : plan.post);
      if (plan.dashTick === tick && this.dash && !usedDash) {
        usedDash = true;
        dashT = m.dashTime;
        dashDir = plan.dashDir ?? dir;
      }
      let vx;
      if (dashT > 0) {
        vx = dashDir * m.dashSpeed;
        vy = 0;
        dashT -= dt;
        if (dashT <= 0) runAction();
      } else {
        const before = vy;
        vy = Math.min(vy + m.gravity * dt, m.maxFall);
        if (before < 0 && vy >= 0) {
          this.hookFrom(x + bodyW / 2, y - bodyH / 2, out);
          runAction();
        }
        vx = dir * m.runSpeed;
      }
      if (vx !== 0) {
        let nx = x + vx * dt;
        const col = this.rowsBlockH(nx, y);
        if (col >= 0) {
          if (this.grip && this.wallIsGrip(col, y)) {
            const cx = Math.floor(x + bodyW / 2);
            const feetRow = Math.ceil(y) - 1;
            if (this.bodyOk(cx, feetRow)) out.add(this.key(cx, feetRow, vx > 0 ? CLING_R : CLING_L));
            return;
          }
          nx = vx > 0 ? col - bodyW - 1e-4 : col + 1 + 1e-4;
          if (this.rowsBlockH(nx, y) >= 0) nx = x;
          dashT = 0;
        }
        x = nx;
      }
      let ny = y + vy * dt;
      if (vy < 0) {
        const headRow = Math.floor(ny - bodyH);
        if (this.rowBlocks(headRow, x)) {
          ny = headRow + 1 + bodyH;
          vy = 0;
        }
      } else if (vy > 0) {
        const c0 = Math.floor(x);
        const c1 = Math.floor(x + bodyW - 1e-6);
        for (let r = Math.ceil(y - 1e-6); r <= Math.floor(ny); r++) {
          let land = false;
          for (let c = c0; c <= c1; c++) {
            const t = this.tile(c, r);
            if (this.blocks(t) || this.oneWay(t) && y <= r + 1e-6) land = true;
          }
          if (land) {
            this.addLanding(x, r - 1, out);
            return;
          }
        }
      }
      y = ny;
      if (x < 0 || x + bodyW > this.w || y - bodyH < 0 || y >= this.h) return;
      if (this.touchesHazard(x, y)) return;
    }
  }
  wallIsGrip(col, feet) {
    const r0 = Math.floor(feet - this.m.bodyH);
    const r1 = Math.floor(feet - 1e-6);
    for (let r = r0; r <= r1; r++) if (this.tile(col, r) === Tile.GRIP) return true;
    return false;
  }
  rowBlocks(row, x) {
    const c0 = Math.floor(x);
    const c1 = Math.floor(x + this.m.bodyW - 1e-6);
    for (let c = c0; c <= c1; c++) if (this.blocks(this.tile(c, row))) return true;
    return false;
  }
  addLanding(x, feetRow, out) {
    const center = Math.floor(x + this.m.bodyW / 2);
    for (const c of [center, Math.floor(x), Math.floor(x + this.m.bodyW - 1e-6)]) {
      if (this.standable(c, feetRow)) {
        out.add(this.key(c, feetRow, STAND));
        return;
      }
    }
  }
}
export {
  CLING_L,
  CLING_R,
  HANG,
  ReachGraph,
  STAND
};
