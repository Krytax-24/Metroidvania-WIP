import { ABILITIES, GEN } from "./config.js";
class LayoutError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}
const OPPOSITE = { L: "R", R: "L", U: "D", D: "U" };
class LayoutBuilder {
  constructor(spec, abilities, rng) {
    this.spec = spec;
    this.abilities = abilities;
    this.rng = rng;
    this.grid = new Int32Array(spec.gridW * spec.gridH).fill(-1);
  }
  rooms = [];
  edges = [];
  grid;
  blocked = /* @__PURE__ */ new Map();
  /** Rooms that must not receive extra doors (arenas, gate room). */
  special = /* @__PURE__ */ new Set();
  entryRoom = -1;
  gateRoom = -1;
  wardenRoom = -1;
  heraldRooms = [];
  build() {
    const { spec, abilities, rng } = this;
    const zoneCount = abilities.found.length + 1;
    const total = rng.int(spec.cellsMin, spec.cellsMax);
    const reserved = 1 + spec.heralds * GEN.heraldArena[0] * GEN.heraldArena[1];
    const explorable = total - reserved;
    const budgets = spec.zoneShare.map((s) => Math.max(3, Math.round(s * explorable)));
    if (budgets.length !== zoneCount) throw new LayoutError("zone share mismatch");
    const ex = rng.int(2, spec.gridW - 3);
    const ey = rng.int(2, spec.gridH - 3);
    const entry = this.addRoom(ex, ey, 1, 1, 0, "entry");
    entry.sanctuary = true;
    this.entryRoom = entry.id;
    this.growZone(0, budgets[0]);
    for (let z = 1; z < zoneCount; z++) {
      this.attachZone(z);
      this.growZone(z, budgets[z]);
      if (z === 1) this.placeGate();
    }
    this.placeHeralds();
    this.addLoops();
    this.addShortcuts(zoneCount);
    this.addSecrets();
    return {
      rooms: this.rooms,
      edges: this.edges,
      grid: this.grid,
      entryRoom: this.entryRoom,
      gateRoom: this.gateRoom,
      wardenRoom: this.wardenRoom,
      heraldRooms: this.heraldRooms,
      blocked: this.blocked
    };
  }
  // ---------------------------------------------------------------- grid
  inBounds(x, y, w, h) {
    return x >= 0 && y >= 0 && x + w <= this.spec.gridW && y + h <= this.spec.gridH;
  }
  free(x, y, w, h) {
    if (!this.inBounds(x, y, w, h)) return false;
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) if (this.grid[j * this.spec.gridW + i] !== -1) return false;
    return true;
  }
  addRoom(x, y, w, h, zone, role) {
    const room = {
      id: this.rooms.length,
      x,
      y,
      w,
      h,
      zone,
      role,
      sanctuary: false,
      secret: false,
      depth: 0,
      gateDist: 0,
      ring: 0,
      loot: []
    };
    this.rooms.push(room);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.grid[j * this.spec.gridW + i] = room.id;
    return room;
  }
  addEdge(a, b, cx, cy, dir, kind, ability) {
    const e = { id: this.edges.length, a: a.id, b: b.id, cx, cy, dir, kind };
    if (ability) e.ability = ability;
    this.edges.push(e);
    return e;
  }
  block(roomId, side) {
    let s = this.blocked.get(roomId);
    if (!s) this.blocked.set(roomId, s = /* @__PURE__ */ new Set());
    s.add(side);
  }
  isBlocked(roomId, side) {
    return this.blocked.get(roomId)?.has(side) ?? false;
  }
  zoneCells(z) {
    let n = 0;
    for (const r of this.rooms) if (r.zone === z && !this.special.has(r.id) && !r.secret) n += r.w * r.h;
    return n;
  }
  doorCount(roomId) {
    let n = 0;
    for (const e of this.edges) if (e.a === roomId || e.b === roomId) n++;
    return n;
  }
  /**
   * All placements of a w x h room on side `dir` of `parent`, with the door cell.
   * `doorRow` filters side doors: 'childBottom' forces the door onto the child's bottom row.
   */
  placements(parent, dir, w, h, doorRow) {
    const out = [];
    if (dir === "L" || dir === "R") {
      const x = dir === "R" ? parent.x + parent.w : parent.x - w;
      for (let y = parent.y - h + 1; y <= parent.y + parent.h - 1; y++) {
        if (!this.free(x, y, w, h)) continue;
        const lo = Math.max(y, parent.y);
        const hi = Math.min(y + h, parent.y + parent.h) - 1;
        const rows = [];
        for (let cy2 = lo; cy2 <= hi; cy2++) {
          if (doorRow === "childBottom" && cy2 !== y + h - 1) continue;
          rows.push(cy2);
        }
        if (rows.length === 0) continue;
        const cy = this.preferBottom(rows, parent, y + h - 1);
        out.push({ x, y, w, h, cx: dir === "R" ? parent.x + parent.w - 1 : parent.x, cy, dir });
      }
    } else {
      const y = dir === "D" ? parent.y + parent.h : parent.y - h;
      for (let x = parent.x - w + 1; x <= parent.x + parent.w - 1; x++) {
        if (!this.free(x, y, w, h)) continue;
        const lo = Math.max(x, parent.x);
        const hi = Math.min(x + w, parent.x + parent.w) - 1;
        const cx = this.rng.int(lo, hi);
        out.push({ x, y, w, h, cx, cy: dir === "D" ? parent.y + parent.h - 1 : parent.y, dir });
      }
    }
    return out;
  }
  /** Side doors prefer bottom rows (cheaper to traverse, fewer stairs). */
  preferBottom(rows, parent, childBottom) {
    const parentBottom = parent.y + parent.h - 1;
    return this.rng.weighted(rows, (r) => 1 + (r === parentBottom ? 3 : 0) + (r === childBottom ? 3 : 0));
  }
  pickShape(maxCells) {
    const options = GEN.shapes.filter(([w2, h2]) => w2 * h2 <= Math.max(1, maxCells));
    const [w, h] = this.rng.weighted(options, (s) => s[2]);
    return [w, h];
  }
  // ---------------------------------------------------------------- zones
  growZone(z, budget) {
    const { rng } = this;
    let guard = 0;
    while (this.zoneCells(z) < budget && guard++ < 600) {
      const candidates = this.rooms.filter(
        (r) => r.zone === z && !this.special.has(r.id) && !r.secret
      );
      if (candidates.length === 0) throw new LayoutError("zone has no rooms");
      const parent = rng.weighted(candidates, (r) => {
        const d = this.doorCount(r.id);
        const recency = r.id / this.rooms.length;
        return (d <= 1 ? 2.5 : d === 2 ? 1.6 : 0.6) + recency;
      });
      const remaining = budget - this.zoneCells(z);
      const [w, h] = this.pickShape(remaining + 1);
      const dir = rng.weighted(["L", "R", "U", "D"], (d) => d === "L" || d === "R" ? 3 : 1.4);
      if (this.isBlocked(parent.id, dir)) continue;
      const opts = this.placements(parent, dir, w, h);
      if (opts.length === 0) continue;
      const p = rng.pick(opts);
      const child = this.addRoom(p.x, p.y, p.w, p.h, z, "combat");
      this.addEdge(parent, child, p.cx, p.cy, p.dir, "open");
    }
    if (this.zoneCells(z) < Math.ceil(budget * 0.75)) throw new LayoutError(`zone ${z} too small`);
  }
  /** Opens zone z through a gate of ability found[z-1]. */
  attachZone(z) {
    const { rng, abilities } = this;
    const ability = abilities.found[z - 1];
    const def = ABILITIES[ability];
    const gateDist = this.gateRoom >= 0 ? this.distancesFrom(this.gateRoom) : null;
    const parents = this.rooms.filter(
      (r) => r.zone < z && !this.special.has(r.id) && !r.secret && r.id !== this.entryRoom
    );
    const options = [];
    for (const parent of parents) {
      for (const dir of def.gateDirs) {
        if (this.isBlocked(parent.id, dir)) continue;
        for (const [w, h] of [[1, 1], [2, 1], [1, 2]]) {
          const side = dir === "L" || dir === "R";
          for (const p of this.placements(parent, dir, w, h, side ? "childBottom" : void 0)) {
            let score = 1;
            if (gateDist) score += 6 / (1 + (gateDist[parent.id] ?? 20));
            else score += Math.min(parent.depth, 6) * 0.4;
            if (parent.zone === z - 1) score += 0.5;
            options.push({ ...p, parent, score });
          }
        }
      }
    }
    if (options.length === 0) throw new LayoutError(`no gate placement for zone ${z} (${ability})`);
    this.updateDepths();
    const o = rng.weighted(options, (op) => op.score * op.score);
    const child = this.addRoom(o.x, o.y, o.w, o.h, z, "combat");
    this.addEdge(o.parent, child, o.cx, o.cy, o.dir, "gate", ability);
    this.block(child.id, OPPOSITE[o.dir]);
    if (o.dir === "D") this.block(o.parent.id, "D");
    const sideObstacle = ["wraith_step", "chain_of_saints", "ember_ward", "seraph_wing"].includes(ability);
    if ((o.dir === "L" || o.dir === "R") && sideObstacle && child.w === 1) {
      this.block(child.id, "U");
      this.block(child.id, "D");
    }
  }
  placeGate() {
    const { rng } = this;
    this.updateDepths();
    const zone1 = this.rooms.filter((r) => r.zone === 1 && !this.special.has(r.id));
    const options = [];
    const [aw, ah] = GEN.wardenArena;
    for (const parent of zone1) {
      for (const dir of ["L", "R", "U", "D"]) {
        if (this.isBlocked(parent.id, dir)) continue;
        for (const g of this.placements(parent, dir, 1, 1, dir === "L" || dir === "R" ? "childBottom" : void 0)) {
          for (const wdir of ["L", "R"]) {
            if (OPPOSITE[wdir] === dir) continue;
            const wx = wdir === "R" ? g.x + 1 : g.x - aw;
            const wy = g.y - ah + 1;
            if (!this.free(wx, wy, aw, ah)) continue;
            if (wx <= g.x && g.x < wx + aw && wy <= g.y && g.y < wy + ah) continue;
            options.push({ parent, g, wardenX: wx, wardenY: wy, wdir });
          }
        }
      }
    }
    if (options.length === 0) throw new LayoutError("no Warden gate placement");
    const minDepth = Math.min(...options.map((o2) => o2.parent.depth));
    const o = rng.weighted(options, (op) => 1 / (1 + op.parent.depth - minDepth));
    const gate = this.addRoom(o.g.x, o.g.y, 1, 1, 1, "gate");
    gate.sanctuary = true;
    this.addEdge(o.parent, gate, o.g.cx, o.g.cy, o.g.dir, "open");
    const warden = this.addRoom(o.wardenX, o.wardenY, aw, ah, 1, "warden");
    this.addEdge(gate, warden, gate.x, gate.y, o.wdir, "warden");
    this.special.add(gate.id);
    this.special.add(warden.id);
    this.gateRoom = gate.id;
    this.wardenRoom = warden.id;
  }
  placeHeralds() {
    const { rng, spec, abilities } = this;
    const zoneCount = abilities.found.length + 1;
    const zones = [];
    for (let i = 0; zones.length < spec.heralds; i++) {
      const z = zoneCount - 1 - i % zoneCount;
      zones.push(z);
    }
    const [aw, ah] = GEN.heraldArena;
    for (let k = 0; k < zones.length; k++) {
      const z = zones[k];
      const dist = this.distancesFrom(this.gateRoom);
      const parents = this.rooms.filter((r) => r.zone === z && !this.special.has(r.id) && !r.secret);
      const ds = parents.map((p) => dist[p.id]).sort((a, b) => a - b);
      const lo = ds[Math.floor(ds.length * 0.25)] ?? 0;
      const hi = ds[Math.floor(ds.length * 0.7)] ?? 99;
      const options = [];
      for (const parent of parents) {
        for (const dir of ["L", "R", "U", "D"]) {
          if (this.isBlocked(parent.id, dir)) continue;
          const side = dir === "L" || dir === "R";
          for (const p of this.placements(parent, dir, aw, ah, side ? "childBottom" : void 0)) options.push({ ...p, parent });
        }
      }
      if (options.length === 0) throw new LayoutError(`no Herald arena placement in zone ${z}`);
      const o = rng.weighted(options, (op) => {
        const d = dist[op.parent.id];
        return d >= lo && d <= hi ? 4 : 1;
      });
      const arena = this.addRoom(o.x, o.y, aw, ah, z, "herald");
      arena.heraldIndex = k;
      this.addEdge(o.parent, arena, o.cx, o.cy, o.dir, "open");
      this.special.add(arena.id);
      this.heraldRooms.push(arena.id);
    }
  }
  /** Adjacent room pairs and the shared cell edges between them. */
  adjacentPairs(filter) {
    const out = [];
    const W = this.spec.gridW;
    const H = this.spec.gridH;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ida = this.grid[y * W + x];
        if (ida < 0) continue;
        const a = this.rooms[ida];
        for (const [dx, dy, dir] of [[1, 0, "R"], [0, 1, "D"]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= W || ny >= H) continue;
          const idb = this.grid[ny * W + nx];
          if (idb < 0 || idb === ida) continue;
          const b = this.rooms[idb];
          if (!filter(a, b)) continue;
          out.push({ a, b, cx: x, cy: y, dir });
        }
      }
    }
    return out;
  }
  connected(a, b) {
    return this.edges.some((e) => e.a === a && e.b === b || e.a === b && e.b === a);
  }
  addLoops() {
    const { rng } = this;
    const target = Math.round(this.rooms.length * GEN.loopFraction);
    const pairs = rng.shuffle(
      this.adjacentPairs(
        (a, b) => a.zone === b.zone && !this.special.has(a.id) && !this.special.has(b.id) && !a.secret && !b.secret
      )
    );
    let added = 0;
    const used = /* @__PURE__ */ new Set();
    for (const p of pairs) {
      if (added >= target) break;
      const key = `${Math.min(p.a.id, p.b.id)}-${Math.max(p.a.id, p.b.id)}`;
      if (used.has(key) || this.connected(p.a.id, p.b.id)) continue;
      if (this.isBlocked(p.a.id, p.dir) || this.isBlocked(p.b.id, OPPOSITE[p.dir])) continue;
      if (p.dir === "R" && p.cy !== p.a.y + p.a.h - 1 && p.cy !== p.b.y + p.b.h - 1) continue;
      used.add(key);
      this.addEdge(p.a, p.b, p.cx, p.cy, p.dir, "open");
      added++;
    }
  }
  addShortcuts(zoneCount) {
    const { rng } = this;
    for (let z = 1; z < zoneCount; z++) {
      const pairs = rng.shuffle(
        this.adjacentPairs((a, b) => {
          const hi = a.zone === z ? a : b.zone === z ? b : null;
          const lo = hi === a ? b : a;
          if (!hi || lo.zone >= z) return false;
          return !this.special.has(a.id) && !this.special.has(b.id) && !a.secret && !b.secret;
        })
      ).filter((p) => p.dir === "R" && (p.cy === p.a.y + p.a.h - 1 || p.cy === p.b.y + p.b.h - 1));
      let added = 0;
      for (const p of pairs) {
        if (added >= GEN.shortcutsPerZone) break;
        if (this.connected(p.a.id, p.b.id)) continue;
        if (this.isBlocked(p.a.id, p.dir) || this.isBlocked(p.b.id, OPPOSITE[p.dir])) continue;
        const e = this.addEdge(p.a, p.b, p.cx, p.cy, p.dir, "shortcut");
        e.oneWayFrom = p.a.zone === z ? p.a.id : p.b.id;
        added++;
      }
    }
  }
  addSecrets() {
    const { rng, abilities } = this;
    const count = rng.int(GEN.secretsPerTier[0], GEN.secretsPerTier[1]);
    const sideAbilities = abilities.prior.filter((a) => ABILITIES[a].gateDirs.includes("L"));
    let made = 0;
    for (let tries = 0; made < count && tries < 80; tries++) {
      const parent = rng.pick(this.rooms.filter((r) => !this.special.has(r.id) && !r.secret));
      const dir = rng.pick(["L", "R"]);
      if (this.isBlocked(parent.id, dir)) continue;
      const opts = this.placements(parent, dir, 1, 1, "childBottom");
      if (opts.length === 0) continue;
      const p = rng.pick(opts);
      const room = this.addRoom(p.x, p.y, 1, 1, parent.zone, "secret");
      room.secret = true;
      if (sideAbilities.length > 0 && rng.chance(0.5)) {
        const ability = rng.pick(sideAbilities);
        this.addEdge(parent, room, p.cx, p.cy, p.dir, "gate", ability);
        this.block(room.id, OPPOSITE[p.dir]);
      } else {
        this.addEdge(parent, room, p.cx, p.cy, p.dir, "secret");
      }
      made++;
    }
  }
  // ---------------------------------------------------------------- graph helpers
  neighbors(id) {
    const out = [];
    for (const e of this.edges) {
      if (e.a === id) out.push(e.b);
      else if (e.b === id) out.push(e.a);
    }
    return out;
  }
  distancesFrom(start) {
    return bfsDistances(this.rooms.length, this.edges, start);
  }
  updateDepths() {
    const d = this.distancesFrom(this.entryRoom);
    for (const r of this.rooms) r.depth = d[r.id];
  }
}
function bfsDistances(count, edges, start, skip) {
  const adj = Array.from({ length: count }, () => []);
  for (const e of edges) {
    if (skip?.(e)) continue;
    adj[e.a].push(e.b);
    adj[e.b].push(e.a);
  }
  const dist = new Array(count).fill(9999);
  dist[start] = 0;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi];
    for (const v of adj[u]) {
      if (dist[v] > dist[u] + 1) {
        dist[v] = dist[u] + 1;
        queue.push(v);
      }
    }
  }
  return dist;
}
export {
  LayoutBuilder,
  LayoutError,
  bfsDistances
};
