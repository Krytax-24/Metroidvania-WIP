import { GEN } from "./config.js";
import { bfsDistances, LayoutError } from "./layout.js";
function assignRoles(layout, spec, abilities, rng) {
  const { rooms, edges } = layout;
  const depth = bfsDistances(rooms.length, edges, layout.entryRoom);
  const gateDist = bfsDistances(rooms.length, edges, layout.gateRoom, (e) => e.kind === "warden");
  for (const r of rooms) {
    r.depth = depth[r.id];
    r.gateDist = r.id === layout.wardenRoom ? -1 : gateDist[r.id];
  }
  const degree = new Array(rooms.length).fill(0);
  for (const e of edges) {
    degree[e.a]++;
    degree[e.b]++;
  }
  const isFree = (r) => r.role === "combat" && !r.secret && !r.sanctuary;
  abilities.found.forEach((ability, i) => {
    const zone = i;
    const candidates = rooms.filter((r) => r.zone === zone && isFree(r));
    if (candidates.length === 0) throw new LayoutError(`no room for ability ${ability}`);
    const zoneEntryDepth = Math.min(...rooms.filter((r) => r.zone === zone).map((r) => r.depth));
    const pick = rng.weighted(candidates, (r) => {
      const deep = r.depth - zoneEntryDepth;
      return (1 + deep) * (degree[r.id] === 1 ? 3 : 1);
    });
    pick.role = "ability";
    pick.abilityPickup = ability;
  });
  placeSanctuaries(layout, rng);
  const lootList = [];
  const L = GEN.loot;
  for (let i = 0; i < L.flaskShards[spec.index - 1]; i++) lootList.push("flask_shard");
  for (let i = 0; i < L.weapons; i++) lootList.push("weapon");
  for (let i = 0; i < L.relics; i++) lootList.push("relic");
  for (let i = 0; i < L.boneDust; i++) lootList.push("bone_dust");
  for (let i = 0; i < L.ichorCaches; i++) lootList.push("ichor_cache");
  const order = rng.shuffle(lootList).sort((a, b) => rankLoot(b) - rankLoot(a));
  const secretRooms = rng.shuffle(rooms.filter((r) => r.secret));
  for (const r of secretRooms) {
    const item = order.shift();
    if (item) r.loot.push(item);
  }
  for (const item of order) {
    const candidates = rooms.filter(
      (r) => (r.role === "combat" || r.role === "treasure") && !r.sanctuary && r.loot.length === 0
    );
    if (candidates.length === 0) break;
    const target = rng.weighted(candidates, (r) => (degree[r.id] === 1 ? 4 : 1) * (1 + r.zone * 0.5));
    target.loot.push(item);
    if (degree[target.id] === 1) target.role = "treasure";
  }
  const eliteCount = 1 + Math.min(2, abilities.found.length);
  const eliteCandidates = rng.shuffle(rooms.filter((r) => r.role === "combat" && !r.sanctuary && r.w * r.h >= 2));
  eliteCandidates.sort((a, b) => b.zone - a.zone);
  for (const r of eliteCandidates.slice(0, eliteCount)) r.role = "elite";
  for (const r of rooms) {
    if (r.role !== "combat") continue;
    if (r.h > r.w) r.role = "platforming";
    else if (degree[r.id] >= 3 && r.w * r.h === 1) r.role = "connector";
    else if (r.w * r.h === 1 && rng.chance(0.35)) r.role = "platforming";
  }
  assignRings(layout);
}
function rankLoot(k) {
  return k === "flask_shard" ? 3 : k === "relic" ? 2 : k === "weapon" ? 1 : 0;
}
function placeSanctuaries(layout, rng) {
  const { rooms, edges } = layout;
  const zones = new Set(rooms.map((r) => r.zone));
  const canHost = (r) => !r.sanctuary && !r.secret && (r.role === "combat" || r.role === "connector" || r.role === "platforming");
  for (const z of zones) {
    if (rooms.some((r) => r.zone === z && r.sanctuary)) continue;
    const zoneRooms = rooms.filter((r) => r.zone === z && canHost(r));
    if (zoneRooms.length === 0) continue;
    let best = zoneRooms[0];
    let bestScore = Infinity;
    for (const r of zoneRooms) {
      const d = bfsDistances(rooms.length, edges, r.id);
      let s = 0;
      for (const o of rooms) if (o.zone === z) s += Math.min(d[o.id], 50);
      s += rng.next() * 0.5;
      if (s < bestScore) {
        bestScore = s;
        best = r;
      }
    }
    best.sanctuary = true;
  }
  const covered = () => {
    const dist2 = new Array(rooms.length).fill(9999);
    for (const s of rooms.filter((r) => r.sanctuary)) {
      const d = bfsDistances(rooms.length, edges, s.id, (e) => e.kind === "warden");
      for (let i = 0; i < rooms.length; i++) dist2[i] = Math.min(dist2[i], d[i]);
    }
    return dist2;
  };
  for (let guard = 0; guard < 12; guard++) {
    const dist2 = covered();
    const bad = rooms.filter((r) => {
      if (r.role === "warden") return false;
      if (r.role === "herald") return dist2[r.id] > GEN.heraldSanctuaryDist;
      if (r.secret) return false;
      return dist2[r.id] > GEN.sanctuaryMaxDist;
    });
    if (bad.length === 0) return;
    const hosts = rooms.filter(canHost);
    let bestHost = null;
    let bestGain = 0;
    for (const h of hosts) {
      const d = bfsDistances(rooms.length, edges, h.id, (e) => e.kind === "warden");
      let gain = 0;
      for (const b of bad) {
        const limit = b.role === "herald" ? GEN.heraldSanctuaryDist : GEN.sanctuaryMaxDist;
        if (d[b.id] <= limit) gain += b.role === "herald" ? 3 : 1;
      }
      gain += rng.next() * 0.1;
      if (gain > bestGain) {
        bestGain = gain;
        bestHost = h;
      }
    }
    if (!bestHost) break;
    bestHost.sanctuary = true;
  }
  const dist = covered();
  for (const r of rooms) {
    if (r.role === "herald" && dist[r.id] > GEN.heraldSanctuaryDist) throw new LayoutError("Herald too far from Sanctuary");
  }
}
function assignRings(layout) {
  const { rooms } = layout;
  const ordered = rooms.filter((r) => r.id !== layout.gateRoom && r.id !== layout.wardenRoom).sort((a, b) => b.gateDist - a.gateDist || a.id - b.id);
  const n = ordered.length;
  const [f1, f2, f3] = GEN.ringFractions;
  const c1 = Math.round(n * f1);
  const c2 = c1 + Math.round(n * f2);
  const c3 = c2 + Math.round(n * f3);
  ordered.forEach((r, i) => {
    r.ring = i < c1 ? 1 : i < c2 ? 2 : i < c3 ? 3 : 0;
  });
  const byDist = /* @__PURE__ */ new Map();
  for (const r of ordered) {
    const prev = byDist.get(r.gateDist);
    byDist.set(r.gateDist, prev === void 0 ? r.ring : prev === 0 || r.ring === 0 ? 0 : Math.max(prev, r.ring));
  }
  for (const r of ordered) r.ring = byDist.get(r.gateDist);
  for (const r of rooms) {
    if (r.role === "herald" && r.ring === 1) r.ring = 2;
    if (r.id === layout.gateRoom || r.id === layout.wardenRoom) r.ring = 0;
  }
}
export {
  assignRoles
};
