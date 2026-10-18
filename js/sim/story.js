// Side quests and the people who give them. Placement, progress and rewards are all decided here from the
// seed and the simulation's own events, so a saved game and a replayed seed always agree.
import { stream } from "../gen/index.js";
import { GEL_TRADE_COST, NPCS, QUESTS, QUESTS_PER_TIER, REWARDS, TIER_QUESTS } from "../data/story.js";

const EMPTY = () => ({ status: "none", progress: 0, held: false, heard: [], rests: [], from: -1 });

/** Rooms where an NPC may stand: ordinary rooms that hold at least one ordinary enemy spawn. */
function roomCenter(room) {
  return { x: room.x + room.w / 2, y: room.y + room.h / 2 };
}

export class Story {
  constructor(sim) {
    this.sim = sim;
    /** Everyone standing in this Tier: { uid, id, room, x, y, quest, facing }. y is the standing tile. */
    this.npcs = [];
    /** Quest state by quest id. */
    this.quests = {};
    /** Where each fetch quest's item lies: questId -> pickup index in sim.pickups. */
    this.items = {};
    this.gelTrades = 0;
    this.met = new Set();
    this.plan();
  }

  // ------------------------------------------------------------------ placement

  plan() {
    const sim = this.sim;
    if (sim.practiceMode) {
      for (const e of sim.world.tiles.entities) {
        if (e.kind === "npc") this.npcs.push({ uid: `${e.npc}`, id: e.npc, room: e.room, x: e.x, y: e.y, quest: null, facing: 1 });
      }
      return;
    }
    const rng = stream(sim.seed, "story", sim.tier);
    const map = sim.map;
    const banned = new Set([map.entryRoom, map.gateRoom, map.wardenRoom, ...map.heraldRooms]);
    const questIds = rng.shuffle([...TIER_QUESTS[sim.tier]]).slice(0, QUESTS_PER_TIER[sim.tier]);
    for (const id of questIds) this.quests[id] = EMPTY();

    const byRoom = new Map();
    for (const [sid, s] of sim.spawns) {
      if (s.elite || banned.has(s.room)) continue;
      if (!byRoom.has(s.room)) byRoom.set(s.room, []);
      byRoom.get(s.room).push({ sid, s });
    }
    const usedRooms = new Set();
    const takeSpawn = (preferFarFrom = null) => {
      const rooms = [...byRoom.keys()].filter((r) => !usedRooms.has(r)).sort((a, b) => a - b);
      if (rooms.length === 0) return null;
      let room;
      if (preferFarFrom !== null) {
        const c = roomCenter(map.rooms[preferFarFrom]);
        let best = -1;
        for (const r of rooms) {
          const d = Math.abs(roomCenter(map.rooms[r]).x - c.x) + Math.abs(roomCenter(map.rooms[r]).y - c.y);
          if (d > best || (d === best && rng.chance(0.5))) {
            best = d;
            room = r;
          }
        }
      } else room = rng.pick(rooms);
      usedRooms.add(room);
      const list = byRoom.get(room);
      return list[rng.int(0, list.length - 1)];
    };

    // Sanctuary slots first (never the room the player starts in), then ordinary rooms.
    const slots = rng.shuffle(sim.sanctuaries.filter((s) => s.room !== map.entryRoom).map((s) => s));
    let uidN = 0;
    const place = (npcId, questId, extra = {}) => {
      const def = NPCS[npcId];
      let spot = null;
      if (def.where === "sanctuary" && slots.length) {
        const s = slots.shift();
        spot = { room: s.room, x: s.x - 3, y: s.y };
      } else {
        const t = takeSpawn();
        if (t) {
          sim.spawns.delete(t.sid);
          spot = { room: t.s.room, x: t.s.x, y: t.s.y };
        }
      }
      if (!spot) return null;
      const npc = { uid: `${npcId}${uidN++}`, id: npcId, room: spot.room, x: spot.x, y: spot.y, quest: questId, facing: rng.chance(0.5) ? 1 : -1, ...extra };
      this.npcs.push(npc);
      return npc;
    };

    for (const qid of questIds) {
      const q = QUESTS[qid];
      const giver = place(q.npc, qid);
      if (!giver) {
        delete this.quests[qid];
        continue;
      }
      if (q.goal.type === "item") {
        const t = takeSpawn(giver.room);
        if (t) {
          const idx = sim.pickups.length;
          sim.pickups.push({ x: t.s.x, y: t.s.y, room: t.s.room, loot: null, questId: qid, icon: q.goal.icon, taken: false });
          this.items[qid] = idx;
        } else delete this.quests[qid];
      }
      if (q.goal.type === "talk") {
        for (let i = 0; i < q.goal.n - 1; i++) place("wisp", null, { dialogue: "wisp_extra" });
      }
    }
    // Drop quests whose giver or item could not be placed.
    for (const qid of Object.keys(this.quests)) if (!this.npcs.some((n) => n.quest === qid)) delete this.quests[qid];
  }

  // ------------------------------------------------------------------ queries

  npc(uid) {
    return this.npcs.find((n) => n.uid === uid) ?? null;
  }

  /** The NPC the player could talk to right now, or null. */
  npcNear(p, room) {
    let best = null;
    let bd = 2.6;
    for (const n of this.npcs) {
      if (n.room !== room) continue;
      const d = Math.abs(n.x + 0.5 - p.cx);
      if (d < bd && Math.abs(n.y + 1 - p.body.y) < 2.5) {
        best = n;
        bd = d;
      }
    }
    return best;
  }

  state(questId) {
    const q = this.quests[questId];
    if (!q) return { status: "none", progress: 0, target: 0 };
    return { status: q.status, progress: q.progress, target: QUESTS[questId].goal.n };
  }

  /** Quest status for the NPC with this uid (their own quest), or an empty state. */
  stateFor(npc) {
    return npc.quest ? this.state(npc.quest) : { status: "none", progress: 0, target: 0 };
  }

  /** Entries for the Journal. */
  journal() {
    const out = [];
    for (const [id, q] of Object.entries(this.quests)) {
      if (q.status === "none" && !this.met.has(id)) continue;
      const def = QUESTS[id];
      out.push({ id, title: def.title, summary: def.summary, npc: NPCS[def.npc].name, status: q.status === "none" ? "offered" : q.status, progress: q.progress, target: def.goal.n });
    }
    return out;
  }

  finishedCount() {
    return Object.values(this.quests).filter((q) => q.status === "done").length;
  }

  activeCount() {
    return Object.values(this.quests).filter((q) => q.status === "active" || q.status === "ready").length;
  }

  // ------------------------------------------------------------------ progress

  meet(npc) {
    if (npc.quest) this.met.add(npc.quest);
  }

  accept(id) {
    const q = this.quests[id];
    if (!q || q.status !== "none") return false;
    const goal = QUESTS[id].goal;
    q.status = "active";
    q.from = this.sim.currentRoom;
    q.rests = [];
    if (goal.type === "item" && q.held) q.progress = goal.n;
    if (goal.type === "talk") {
      const giver = this.npcs.find((n) => n.quest === id);
      if (giver && !q.heard.includes(giver.uid)) q.heard.push(giver.uid);
      q.progress = q.heard.length;
    }
    this.check(id);
    this.sim.emit({ type: "toast", text: `Quest: ${QUESTS[id].title}`, tone: "boss" });
    this.sim.emit({ type: "quest", id, status: q.status });
    return true;
  }

  check(id) {
    const q = this.quests[id];
    const def = QUESTS[id];
    if (q.status === "active" && q.progress >= def.goal.n) {
      q.status = "ready";
      this.sim.emit({ type: "toast", text: `${def.title}: return to ${NPCS[def.npc].name}`, tone: "boss" });
      this.sim.emit({ type: "quest", id, status: "ready" });
    }
  }

  /** Called by the simulation for gameplay events. */
  note(type, data = {}) {
    for (const [id, q] of Object.entries(this.quests)) {
      const goal = QUESTS[id].goal;
      if (goal.type === "talk" && type === "talk" && data.uid) {
        if (!q.heard.includes(data.uid)) q.heard.push(data.uid);
        if (q.status === "active") {
          q.progress = q.heard.length;
          this.check(id);
        }
        continue;
      }
      if (goal.type === "item" && type === "item" && data.id === id) {
        q.held = true;
        if (q.status === "active") {
          q.progress = goal.n;
          this.check(id);
        }
        continue;
      }
      if (q.status !== "active") continue;
      const match =
        (goal.type === "parry" && type === "parry") ||
        (goal.type === "kill" && type === "kill") ||
        (goal.type === "elite" && type === "kill" && data.elite) ||
        (goal.type === "secret" && type === "secret");
      if (match) {
        q.progress = Math.min(goal.n, q.progress + 1);
        this.check(id);
      } else if (goal.type === "rest_new" && type === "rest" && data.room !== q.from && !q.rests.includes(data.room)) {
        q.rests.push(data.room);
        q.progress = q.rests.length;
        this.check(id);
      }
    }
  }

  // ------------------------------------------------------------------ rewards

  turnIn(id) {
    const q = this.quests[id];
    if (!q || q.status !== "ready") return null;
    q.status = "done";
    const reward = this.grant(QUESTS[id].reward, `quest:${id}`);
    this.sim.emit({ type: "quest", id, status: "done" });
    return { ...reward, quest: QUESTS[id].title };
  }

  canTrade() {
    return this.sim.boneDust >= GEL_TRADE_COST && this.gelTrades < 2;
  }

  /** Gel's barter. Returns the reward or null when the player cannot pay. */
  trade() {
    if (!this.canTrade()) return null;
    this.sim.boneDust -= GEL_TRADE_COST;
    this.gelTrades++;
    return this.grant("gel_trade", `trade:${this.gelTrades}`);
  }

  /**
   * Rolls and applies one reward. Seeded by the seed, Tier and `label`, so the same seed hands the same gift
   * however the run got there. Every table entry is a good outcome; see REWARDS in data/story.js.
   */
  grant(rewardId, label) {
    const sim = this.sim;
    const table = REWARDS[rewardId];
    const rng = stream(sim.seed, `reward:${label}`, sim.tier);
    let pick = rng.weighted(table.picks, (p) => p.w);
    // A full bag or a full candle row never wastes the gift: fall through to the next best thing.
    if (pick.kind === "candle" && sim.candles >= 3) pick = { kind: "boon" };
    if (pick.kind === "boon" && Object.keys(sim.gear.boons).length >= 8) pick = { kind: "relic" };
    let res;
    switch (pick.kind) {
      case "relic":
        res = sim.giveRelicReward(rng);
        break;
      case "weapon":
        res = sim.giveWeaponReward(rng, pick.min ?? "rare");
        break;
      case "boon":
        res = sim.giveBoonReward(rng);
        break;
      case "ichor":
        res = sim.giveIchorReward(pick.n ?? 2);
        break;
      case "flask_shard":
        res = sim.giveFlaskReward();
        break;
      case "bone_dust":
        res = sim.giveBoneDustReward(pick.n ?? 3);
        break;
      case "candle":
        res = sim.giveCandleReward();
        break;
      default:
        res = sim.giveIchorReward(2);
    }
    return { wrap: table.wrap, ...res };
  }

  // ------------------------------------------------------------------ save

  snapshot() {
    return { quests: JSON.parse(JSON.stringify(this.quests)), met: [...this.met], gelTrades: this.gelTrades };
  }

  restore(s) {
    if (!s) return;
    for (const [id, q] of Object.entries(s.quests ?? {})) if (this.quests[id]) this.quests[id] = { ...EMPTY(), ...q };
    this.met = new Set(s.met ?? []);
    this.gelTrades = s.gelTrades ?? 0;
  }
}
