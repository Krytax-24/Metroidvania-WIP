import { GEN } from "./config.js";
function edgeOpen(e, from, have, reached) {
  switch (e.kind) {
    case "open":
    case "secret":
      return true;
    case "gate":
      return !!e.ability && have.has(e.ability);
    case "shortcut":
      return from === e.oneWayFrom || reached.has(e.oneWayFrom);
    case "warden":
      return false;
  }
}
function reachableRooms(inp, have) {
  const reached = /* @__PURE__ */ new Set([inp.entryRoom]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of inp.edges) {
      for (const [from, to] of [[e.a, e.b], [e.b, e.a]]) {
        if (reached.has(from) && !reached.has(to) && edgeOpen(e, from, have, reached)) {
          reached.add(to);
          changed = true;
        }
      }
    }
  }
  return reached;
}
function progression(inp, withhold) {
  const have = new Set(inp.prior);
  for (; ; ) {
    const reached = reachableRooms(inp, have);
    let gained = false;
    for (const id of reached) {
      const a = inp.rooms[id].abilityPickup;
      if (a && a !== withhold && !have.has(a)) {
        have.add(a);
        gained = true;
      }
    }
    if (!gained) return { reached, have };
  }
}
function validateMacro(inp) {
  const empty = { routeSec: 0, requiredSec: 0, clockSec: inp.clockSec, route: [] };
  const { reached, have } = progression(inp);
  for (const a of inp.found) if (!have.has(a)) return { ok: false, reason: `ability ${a} unreachable`, pacing: empty };
  for (const r of inp.rooms) {
    if (r.id === inp.wardenRoom) continue;
    if (!reached.has(r.id)) return { ok: false, reason: `room ${r.id} unreachable`, pacing: empty };
  }
  for (let k = 0; k < inp.found.length; k++) {
    const { reached: partial } = progression(inp, inp.found[k]);
    for (const r of inp.rooms) {
      if (r.zone >= k + 1 && r.id !== inp.wardenRoom && partial.has(r.id)) {
        return { ok: false, reason: `lock leak: zone ${r.zone} open without ${inp.found[k]}`, pacing: empty };
      }
    }
  }
  const pacing = estimatePacing(inp);
  const P = GEN.pacing;
  if (pacing.routeSec > inp.clockSec * P.maxRouteFraction) return { ok: false, reason: "route too long", pacing };
  if (pacing.requiredSec > inp.clockSec * P.maxRequiredFraction) return { ok: false, reason: "required time too long", pacing };
  return { ok: true, pacing };
}
function roomCost(r, revisit) {
  const P = GEN.pacing;
  const extra = r.w * r.h - 1;
  return revisit ? P.revisitBaseSec + extra * P.revisitPerExtraCellSec : P.roomBaseSec + extra * P.perExtraCellSec;
}
function estimatePacing(inp) {
  const n = inp.rooms.length;
  const have = new Set(inp.prior);
  const visited = /* @__PURE__ */ new Set([inp.entryRoom]);
  const objectives = new Set(inp.heraldRooms);
  for (const r of inp.rooms) if (r.abilityPickup) objectives.add(r.id);
  let pos = inp.entryRoom;
  let total = 0;
  const route = [pos];
  const dijkstra = (start) => {
    const dist2 = new Array(n).fill(Infinity);
    const prev2 = new Array(n).fill(-1);
    dist2[start] = 0;
    const done = /* @__PURE__ */ new Set();
    for (; ; ) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done.has(i) && dist2[i] < Infinity && (u < 0 || dist2[i] < dist2[u])) u = i;
      if (u < 0) break;
      done.add(u);
      const relax = (v, cost) => {
        if (dist2[u] + cost < dist2[v]) {
          dist2[v] = dist2[u] + cost;
          prev2[v] = u;
        }
      };
      for (const e of inp.edges) {
        if (e.a !== u && e.b !== u) continue;
        const v = e.a === u ? e.b : e.a;
        if (edgeOpen(e, u, have, visited)) relax(v, roomCost(inp.rooms[v], visited.has(v)));
      }
      if (inp.rooms[u].sanctuary && visited.has(u)) {
        for (const s of inp.rooms) if (s.sanctuary && visited.has(s.id) && s.id !== u) relax(s.id, GEN.pacing.sanctuaryTravelSec);
      }
    }
    return { dist: dist2, prev: prev2 };
  };
  const walkTo = (target, dist2, prev2) => {
    const path = [];
    for (let v = target; v !== pos && v >= 0; v = prev2[v]) path.unshift(v);
    for (const v of path) {
      visited.add(v);
      route.push(v);
    }
    total += dist2[target];
    pos = target;
  };
  while (objectives.size > 0) {
    const { dist: dist2, prev: prev2 } = dijkstra(pos);
    let best = -1;
    for (const o of objectives) if (dist2[o] < Infinity && (best < 0 || dist2[o] < dist2[best])) best = o;
    if (best < 0) break;
    walkTo(best, dist2, prev2);
    objectives.delete(best);
    const a = inp.rooms[best].abilityPickup;
    if (a) have.add(a);
  }
  const { dist, prev } = dijkstra(pos);
  if (dist[inp.gateRoom] < Infinity) walkTo(inp.gateRoom, dist, prev);
  const requiredSec = total + inp.heraldRooms.length * GEN.pacing.heraldFightSec;
  return { routeSec: Math.round(total), requiredSec: Math.round(requiredSec), clockSec: inp.clockSec, route };
}
export {
  estimatePacing,
  progression,
  reachableRooms,
  validateMacro
};
