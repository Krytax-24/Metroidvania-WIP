import { ABILITIES, GEN, generateTier, stream, Tile, doorsFor } from "../gen/index.js";
import { HERALD, WARDEN } from "../data/bosses.js";
import { ENEMIES, SPAWN_WEIGHTS } from "../data/enemies.js";
import { overlapsTiles, STANDARD_BLOCKS } from "./body.js";
import { KITS } from "../data/kits.js";
import { BOONS, NO_MODS, RARITIES, RELICS, RELIC_SLOTS, REWARD_ICONS, TEMPER, WEAPON_ICONS, WEAPON_NAMES, sumMods } from "../data/gear.js";
import { BLIGHT, COMBAT, DT, ECONOMY, PLAYER_TUNING as P, TIER_SCALE, ticks } from "../data/tunables.js";
import { Boss, BOSS_ID } from "./boss.js";
import { Enemy } from "./enemy.js";
import { boltRect, emberImpactRect, groundUnder, Hazards, waveRect } from "./hazards.js";
import { Player } from "./player.js";
import { emptyInput, overlap } from "./types.js";
import { World } from "./world.js";
import { NPCS, QUESTS } from "../data/story.js";
import { Practice } from "./practice.js";
import { Story } from "./story.js";
import { buildPracticeMap } from "../gen/practiceMap.js";
const PHASE_NAMES = ["Vigil", "Creep", "Rot", "Eclipse", "Nightfall"];
class Sim {
  seed;
  tier;
  map;
  world;
  player;
  rng;
  hazards = new Hazards();
  events = [];
  tick = 0;
  hitstop = 0;
  mode = "play";
  modeT = 0;
  enemies = [];
  boss = null;
  spawns = /* @__PURE__ */ new Map();
  bossRecords = /* @__PURE__ */ new Map();
  pickups = [];
  hooks;
  sanctuaries = [];
  levers = [];
  sealDoor = null;
  arenaLock = null;
  pendingPressed = {};
  pendingReleased = {};
  // Run state.
  ichor = 0;
  candles = ECONOMY.startCandles;
  lastRite = true;
  dropped = null;
  boneDust = 0;
  relics = 0;
  weapons = 0;
  /** Equipped gear: relic ids, Boon ids, the weapon. Summed into `mods` for the rules to read. */
  gear = { relics: [], boons: [], weapon: null };
  mods = { ...NO_MODS };
  gearRolls = 0;
  /** Three Boon ids waiting for the player to choose one, or null. */
  boonOffer = null;
  seals = 0;
  heraldCount;
  abilities = /* @__PURE__ */ new Set();
  lit = /* @__PURE__ */ new Set();
  respawnRoom;
  visited = /* @__PURE__ */ new Set();
  currentRoom;
  clockSec = 0;
  clockStarted = false;
  blightPhase = 0;
  warned = -1;
  gateOpen = false;
  nightfall = false;
  empower = 0;
  deaths = 0;
  kills = 0;
  timeSec = 0;
  lastDeathCause = "";
  /** True in the Training Yard: no clock, no Blight, no death. */
  practiceMode = false;
  practice = null;
  story = null;
  /** Signposts the renderer draws, from map entities. */
  signs = [];
  constructor(opts) {
    this.practiceMode = !!opts.practice;
    this.seed = opts.seed;
    this.tier = opts.tier;
    this.map = opts.map ?? (this.practiceMode ? buildPracticeMap() : generateTier(opts.seed, opts.tier));
    this.world = new World(this.map);
    this.rng = stream(opts.seed, "sim", opts.tier);
    this.heraldCount = this.map.heraldRooms.length;
    for (const a of this.map.abilities.prior) this.abilities.add(a);
    if (opts.allAbilities) for (const a of this.map.abilities.found) this.abilities.add(a);
    const ents = this.world.tiles.entities;
    this.hooks = ents.filter((e) => e.kind === "hook").map((e) => ({ x: e.x, y: e.y }));
    this.character = KITS[opts.character] ? opts.character : "gino";
    this.kit = KITS[this.character];
    const self = this;
    this.player = new Player({
      world: this.world,
      has: (a) => self.abilities.has(a),
      emit: (e) => self.emit(e),
      hooks: this.hooks,
      riposteTarget: () => self.riposteTarget(),
      riposteImpact: () => self.riposteImpact(),
      spawnSmoke: (x, y, facing) => self.spawnSmoke(x, y, facing)
    }, this.kit);
    const perRoom = /* @__PURE__ */ new Map();
    for (const e of ents) {
      const n = perRoom.get(e.room) ?? 0;
      perRoom.set(e.room, n + 1);
      const room = this.map.rooms[e.room];
      if (e.kind === "sign") this.signs.push({ x: e.x, y: e.y, room: e.room, text: e.text, ability: e.ability });
      else if (e.kind === "sanctuary") this.sanctuaries.push({ room: e.room, x: e.x, y: e.y, dark: false, lit: false });
      else if (e.kind === "ability" || e.kind === "loot") this.pickups.push({ x: e.x, y: e.y, room: e.room, ability: e.ability, loot: e.loot, taken: false });
      else if (e.kind === "lever") this.levers.push({ x: e.x, y: e.y, room: e.room, used: false });
      else if (e.kind === "seal_door") this.sealDoor = { x: e.x, y: e.y };
      else if (e.kind === "enemy" || e.kind === "elite") {
        const id = `${e.room}:${n}`;
        const r = stream(opts.seed, "spawn", opts.tier, id);
        const type = e.type ?? (e.kind === "elite" ? "brute" : r.weighted(SPAWN_WEIGHTS, (w) => w[1])[0]);
        this.spawns.set(id, { dead: false, elite: e.kind === "elite", zone: room.zone, room: e.room, x: e.x, y: e.y, type, facing: e.facing ?? (r.chance(0.5) ? 1 : -1) });
      }
    }
    for (const id of this.map.heraldRooms) this.bossRecords.set(id, { defeated: false });
    if (!this.practiceMode) this.bossRecords.set(this.map.wardenRoom, { defeated: false });
    const c = opts.carry;
    if (c) {
      this.ichor = c.ichor;
      this.candles = c.candles;
      this.boneDust = c.boneDust;
      this.relics = c.relics;
      this.weapons = c.weapons;
      if (c.gear) this.gear = { relics: [...c.gear.relics], boons: [...c.gear.boons], weapon: c.gear.weapon ? { ...c.gear.weapon } : null };
      this.deaths = c.deaths;
      this.kills = c.kills;
      this.timeSec = c.timeSec;
      for (const a of c.abilities) this.abilities.add(a);
      this.player.flaskMax = c.flaskMax;
      this.player.setLevel(c.level);
    }
    this.recomputeMods();
    this.player.restoreAll();
    this.player.fervor = 0;
    this.story = new Story(this);
    if (this.practiceMode) this.practice = new Practice(this, this.character, opts.practiceDone ?? {});
    const entry = this.sanctuaries.find((s) => s.room === this.map.entryRoom);
    this.player.spawnAt(entry.x, entry.y + 1);
    this.respawnRoom = this.map.entryRoom;
    this.lit.add(this.map.entryRoom);
    entry.lit = true;
    this.currentRoom = this.map.entryRoom;
    this.visited.add(this.currentRoom);
    this.enterRoom(this.currentRoom);
  }
  emit(e) {
    this.events.push(e);
    if (this.practice) this.practice.note(e);
  }
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
  carry() {
    return {
      level: this.player.level,
      ichor: this.ichor,
      candles: this.candles,
      flaskMax: this.player.flaskMax,
      boneDust: this.boneDust,
      relics: this.relics,
      weapons: this.weapons,
      gear: { relics: [...this.gear.relics], boons: [...this.gear.boons], weapon: this.gear.weapon ? { ...this.gear.weapon } : null },
      abilities: [...this.abilities],
      deaths: this.deaths,
      kills: this.kills,
      timeSec: this.timeSec
    };
  }
  // ------------------------------------------------------------------ queries
  room(id = this.currentRoom) {
    return this.map.rooms[id];
  }
  get clockSecTotal() {
    return this.map.pacing.clockSec;
  }
  roomConsumed(room) {
    if (room.id === this.map.gateRoom || room.id === this.map.wardenRoom) return false;
    if (this.blightPhase >= 4) return true;
    return room.ring >= 1 && room.ring <= this.blightPhase;
  }
  inWardenFight() {
    return this.currentRoom === this.map.wardenRoom && !!this.boss && this.boss.alive;
  }
  levelCost() {
    return ECONOMY.levelCosts[this.player.level - 1] ?? null;
  }
  /** The Sanctuary the player is standing at, if any. */
  sanctuaryHere() {
    for (const s of this.sanctuaries) {
      if (s.room === this.currentRoom && Math.abs(s.x + 0.5 - this.player.cx) < 2.5 && Math.abs(s.y + 1 - this.player.body.y) < 2.5) {
        return { ...s, dark: this.roomConsumed(this.room(s.room)), lit: this.lit.has(s.room) };
      }
    }
    return null;
  }
  /** What the interact key would do right now (for prompts). */
  interactHint() {
    const p = this.player;
    const npc = this.story.npcNear(p, this.currentRoom);
    const sanct = this.sanctuaryHere();
    if (npc && (!sanct || Math.abs(npc.x + 0.5 - p.cx) < Math.abs(sanct.x + 0.5 - p.cx))) return `Talk to ${NPCS[npc.id].name}`;
    if (sanct) return "Sanctuary";
    for (const l of this.levers) if (!l.used && l.room === this.currentRoom && Math.abs(l.x + 0.5 - p.cx) < 2.5 && Math.abs(l.y + 1 - p.body.y) < 3) return "Pull lever";
    if (this.sealDoor && !this.gateOpen && this.currentRoom === this.map.gateRoom && Math.abs(this.sealDoor.x + 0.5 - p.cx) < 3) return "Warden's Gate";
    return null;
  }
  // ------------------------------------------------------------------ tick
  step(input) {
    if (this.hitstop > 0) {
      for (const k of Object.keys(input.pressed)) if (input.pressed[k]) this.pendingPressed[k] = true;
      for (const k of Object.keys(input.released)) if (input.released[k]) this.pendingReleased[k] = true;
      this.hitstop--;
      return;
    }
    for (const k of Object.keys(this.pendingPressed)) input.pressed[k] = true;
    for (const k of Object.keys(this.pendingReleased)) if (!input.held[k]) input.released[k] = true;
    this.pendingPressed = {};
    this.pendingReleased = {};
    if (this.mode === "dying") {
      this.modeT--;
      if (this.modeT <= 0) this.respawn();
      return;
    }
    if (this.mode !== "play") return;
    this.tick++;
    this.timeSec += DT;
    const p = this.player;
    p.update(input);
    if (this.practice) this.practice.update();
    this.unstick();
    if (p.wantsInteract) this.interact();
    this.trackRoom();
    this.collectPickups();
    this.updateEnemies();
    this.updateBoss();
    this.separate();
    this.resolvePlayerAttacks();
    this.updateHazards();
    this.breakSecretWalls();
    if (p.hazardHere() && p.state !== "dead") {
      if (!this.practiceMode) p.applyDamage(Math.round(p.maxHp * P.hazardDamage));
      p.body.x = p.safe.x;
      p.body.y = p.safe.y;
      p.body.vx = p.body.vy = 0;
      p.invuln = ticks(P.hazardInvulnMs);
      this.emit({ type: "hazard" });
      this.emit({ type: "shake", amount: 0.3 });
      this.lastDeathCause = "a hazard";
    }
    this.updateBlight();
    if (p.hp <= 0 && p.state !== "dead") this.onPlayerZero();
  }
  stuckTicks = 0;
  /** Safety net: a player overlapping solid tiles for a few ticks returns to the last safe ledge. */
  unstick() {
    const p = this.player;
    if (p.state === "dead" || p.state === "dodge" || p.state === "airdash" || p.state === "hang") {
      this.stuckTicks = 0;
      return;
    }
    const b = p.body;
    if (overlapsTiles(this.world, b.x, b.y, b.w, b.h, p.rules().blocks)) this.stuckTicks++;
    else this.stuckTicks = 0;
    if (this.stuckTicks > 3) {
      b.x = p.safe.x;
      b.y = p.safe.y;
      b.vx = b.vy = 0;
      this.stuckTicks = 0;
    }
  }
  /** Convenience for tests and tools: one tick with no input. */
  idle(n = 1) {
    for (let i = 0; i < n; i++) this.step(emptyInput());
  }
  // ------------------------------------------------------------------ rooms
  trackRoom() {
    const p = this.player;
    const r = this.world.roomAt(p.cx, p.cy);
    if (r >= 0 && r !== this.currentRoom) {
      const prev = this.currentRoom;
      this.currentRoom = r;
      this.visited.add(r);
      if (!this.practiceMode && !this.clockStarted && prev === this.map.entryRoom) {
        this.clockStarted = true;
        this.emit({ type: "toast", text: "The Blight stirs. The clock has started.", tone: "blight" });
      }
      this.enterRoom(r);
      this.emit({ type: "room", room: r });
    }
    if (this.boss && this.boss.alive && !this.arenaLock && this.boss.room === this.currentRoom) {
      const a = this.world.roomRect(this.room());
      const inside = p.body.x > a.x + 3 && p.body.x + p.body.w < a.x + a.w - 3 && p.body.y < a.y + a.h - 2 && p.body.y - p.body.h > a.y + 2;
      if (inside) this.lockArena(this.boss.room);
    }
  }
  enterRoom(roomId) {
    const room = this.room(roomId);
    this.enemies = [];
    this.hazards.clear();
    const consumed = this.roomConsumed(room);
    const tierI = this.tier - 1;
    for (const [id, s] of this.spawns) {
      if (s.room !== roomId || s.dead) continue;
      if (!this.practiceMode && !this.fits(s.type, s.x, s.y)) s.type = this.fits("husk", s.x, s.y) ? "husk" : "acolyte";
      const dmg = TIER_SCALE.damage[tierI] * (consumed ? BLIGHT.blightedEnemyDamage : 1) * (this.practiceMode ? 0.25 : 1);
      this.enemies.push(new Enemy(id, s.type, s.x, s.y, roomId, this.world.roomRect(room), consumed, dmg, TIER_SCALE.hp[tierI], s.facing));
    }
    if (this.boss && this.boss.room !== roomId) {
      const rec2 = this.bossRecords.get(this.boss.room);
      if (rec2 && this.boss.alive) rec2.hp = this.boss.hp;
      this.boss = null;
    }
    const rec = this.bossRecords.get(roomId);
    if (rec && !rec.defeated && !this.boss) {
      const isWarden = roomId === this.map.wardenRoom;
      if (!isWarden || this.gateOpen) this.spawnBoss(roomId, isWarden, rec);
    }
  }
  fits(type, x, y) {
    const d = ENEMIES[type];
    return !overlapsTiles(this.world, x + 0.5 - d.w / 2, y + 1, d.w, d.h, STANDARD_BLOCKS);
  }
  spawnBoss(roomId, warden, rec) {
    const room = this.room(roomId);
    const ent = this.world.tiles.entities.find((e) => e.room === roomId && (e.kind === "herald" || e.kind === "warden"));
    const rect = this.world.roomRect(room);
    const x = ent ? ent.x : rect.x + rect.w / 2;
    const y = ent ? ent.y : rect.y + rect.h - 4;
    const tierI = this.tier - 1;
    const def = warden ? WARDEN : HERALD;
    const blighted = !warden && this.roomConsumed(room);
    const empower = warden ? this.empower : 0;
    const hpScale = TIER_SCALE.hp[tierI] * (1 + BLIGHT.empowerHp * empower);
    const dmg = TIER_SCALE.damage[tierI] * (blighted ? BLIGHT.blightedBossDamage : 1);
    const name = warden ? this.map.wardenName : this.map.heraldNames[room.heraldIndex ?? 0] ?? "Herald";
    const title = warden ? this.tier === 3 ? "Final Guardian" : `Warden of Tier ${["I", "II", "III"][tierI]}` : "Herald";
    this.boss = new Boss(def, name, title, roomId, rect, x, y, dmg, hpScale, Math.pow(BLIGHT.empowerRecovery, empower), rec.hp);
  }
  doorTiles(room) {
    const out = [];
    const ox = room.x * GEN.cellW;
    const oy = room.y * GEN.cellH;
    const W = room.w * GEN.cellW;
    const H = room.h * GEN.cellH;
    for (const d of doorsFor(room, this.map.rooms, this.map.edges)) {
      if (d.side === "L" || d.side === "R") {
        const fr = d.ly * GEN.cellH + GEN.doorFloorRow;
        const bx = d.side === "L" ? 0 : W - 1;
        for (let y = fr - GEN.doorHeight; y < fr; y++) out.push({ x: ox + bx, y: oy + y });
      } else {
        const c0 = d.lx * GEN.cellW + GEN.doorCol;
        const y = d.side === "U" ? 0 : H - 1;
        for (let x = c0; x < c0 + GEN.doorWidth; x++) out.push({ x: ox + x, y: oy + y });
      }
    }
    return out;
  }
  lockArena(roomId) {
    const tiles = this.doorTiles(this.room(roomId)).map((p) => ({ ...p, t: this.world.tile(p.x, p.y) }));
    const pr = this.player.rect();
    if (tiles.some((t) => overlap({ x: t.x, y: t.y, w: 1, h: 1 }, pr))) return;
    for (const p of tiles) this.world.set(p.x, p.y, Tile.SEAL);
    this.arenaLock = { room: roomId, tiles };
    this.lastRite = true;
    const b = this.boss;
    b.state = "intro";
    b.t = 0;
    this.emit({ type: "bossIntro", name: b.name, title: b.title });
  }
  unlockArena() {
    if (!this.arenaLock) return;
    for (const p of this.arenaLock.tiles) this.world.set(p.x, p.y, p.t);
    this.arenaLock = null;
  }
  // ------------------------------------------------------------------ interaction
  interact() {
    const p = this.player;
    const s = this.sanctuaryHere();
    const npc = this.story.npcNear(p, this.currentRoom);
    if (npc && (!s || Math.abs(npc.x + 0.5 - p.cx) < Math.abs(s.x + 0.5 - p.cx))) {
      this.emit({ type: "talk", uid: npc.uid, npc: npc.id });
      return;
    }
    if (s) {
      this.emit({ type: "sanctuary", room: s.room });
      return;
    }
    for (const l of this.levers) {
      if (l.used || l.room !== this.currentRoom) continue;
      if (Math.abs(l.x + 0.5 - p.cx) < 2.5 && Math.abs(l.y + 1 - p.body.y) < 3) {
        l.used = true;
        const r = this.world.roomRect(this.room());
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (this.world.tile(x, y) === Tile.SHORTCUT) this.world.set(x, y, Tile.AIR);
        this.emit({ type: "toast", text: "Shortcut opened" });
        return;
      }
    }
    if (this.sealDoor && !this.gateOpen && this.currentRoom === this.map.gateRoom && Math.abs(this.sealDoor.x + 0.5 - p.cx) < 3) {
      if (this.seals >= this.heraldCount) this.openGate(false);
      else this.emit({ type: "toast", text: `The Gate needs ${this.heraldCount - this.seals} more Seal${this.heraldCount - this.seals > 1 ? "s" : ""}, or Nightfall.` });
    }
  }
  /** Vigil Ichor offered for opening the Gate now. */
  gateBonus() {
    return Math.round(Math.max(0, this.clockSecTotal - this.clockSec) * BLIGHT.vigilIchorPerSec * this.tier);
  }
  openGate(nightfall) {
    this.gateOpen = true;
    const r = this.world.roomRect(this.room(this.map.gateRoom));
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (this.world.tile(x, y) === Tile.SEAL) this.world.set(x, y, Tile.AIR);
    let bonus = 0;
    if (nightfall) {
      this.nightfall = true;
      this.empower = Math.max(0, this.heraldCount - this.seals);
    } else {
      bonus = this.gateBonus();
      this.ichor += bonus;
    }
    this.emit({ type: "gateOpened", bonus, nightfall });
  }
  rest() {
    const s = this.sanctuaryHere();
    if (!s || s.dark) return false;
    this.lit.add(s.room);
    this.respawnRoom = s.room;
    this.player.restoreAll();
    this.respawnZone(this.room(s.room).zone);
    this.emit({ type: "heal" });
    this.story.note("rest", { room: s.room });
    this.emit({ type: "checkpoint" });
    return true;
  }
  levelUp() {
    const s = this.sanctuaryHere();
    const cost = this.levelCost();
    if (!s || s.dark || cost === null || this.ichor < cost || this.player.level >= P.maxLevel) return false;
    this.ichor -= cost;
    this.player.setLevel(this.player.level + 1);
    this.player.hp = this.player.maxHp;
    this.emit({ type: "levelUp", level: this.player.level });
    return true;
  }
  travelTargets() {
    return this.sanctuaries.filter((s) => this.lit.has(s.room)).map((s) => ({ ...s, dark: this.roomConsumed(this.room(s.room)), lit: true }));
  }
  travel(roomId) {
    if (!this.sanctuaryHere() || !this.lit.has(roomId)) return false;
    const s = this.sanctuaries.find((x) => x.room === roomId);
    if (!s) return false;
    this.player.spawnAt(s.x, s.y + 1);
    this.currentRoom = roomId;
    this.visited.add(roomId);
    this.enterRoom(roomId);
    this.emit({ type: "room", room: roomId });
    return true;
  }
  respawnZone(zone) {
    for (const s of this.spawns.values()) if (s.zone === zone && !s.elite) s.dead = false;
    this.enterRoom(this.currentRoom);
  }
  collectPickups() {
    const p = this.player;
    for (const k of this.pickups) {
      if (k.taken || k.room !== this.currentRoom) continue;
      if (Math.abs(k.x + 0.5 - p.cx) > 1.3 || Math.abs(k.y + 1 - p.body.y) > 2.2) continue;
      k.taken = true;
      if (k.ability) {
        this.abilities.add(k.ability);
        this.emit({ type: "ability", ability: k.ability });
        this.emit({ type: "toast", text: `${ABILITIES[k.ability].name}: ${ABILITIES[k.ability].verb.toLowerCase()}` });
      } else if (k.questId) {
        this.story.note("item", { id: k.questId });
        this.emit({ type: "loot", loot: "quest_item" });
        this.emit({ type: "toast", text: `Found: ${QUESTS[k.questId].goal.item}`, tone: "boss" });
      } else if (k.loot) {
        this.giveLoot(k.loot);
      }
    }
    if (this.dropped && this.dropped.room === this.currentRoom && Math.abs(this.dropped.x - p.cx) < 1.5 && Math.abs(this.dropped.y - p.body.y) < 2.5) {
      this.ichor += this.dropped.amount;
      this.emit({ type: "toast", text: `Recovered ${this.dropped.amount} Ichor` });
      this.dropped = null;
    }
  }
  giveLoot(l) {
    const p = this.player;
    const names = { flask_shard: "Flask Shard", weapon: "Weapon", relic: "Relic", bone_dust: "Bone Dust", ichor_cache: "Ichor cache" };
    if (l === "flask_shard" && p.flaskMax < P.flask.maxCharges) {
      p.flaskMax++;
      p.flasks++;
    }
    if (l === "bone_dust") this.boneDust++;
    if (l === "relic") this.relics++;
    if (l === "weapon") this.weapons++;
    let extra = "";
    if (l === "ichor_cache") {
      const n = Math.round(ECONOMY.ichorCache * this.tier * this.mods.ichor);
      this.ichor += n;
      extra = ` (+${n})`;
    }
    if (l === "relic") extra = this.rollRelic();
    if (l === "weapon") extra = this.rollWeapon();
    this.emit({ type: "loot", loot: l });
    this.emit({ type: "toast", text: `Found: ${names[l]}${extra}` });
  }
  // ------------------------------------------------------------------ gear
  gearRng(label) {
    return stream(this.seed, label, this.tier, this.gearRolls++);
  }
  /** Re-sums gear into `mods` and applies the max HP bonus. */
  recomputeMods() {
    this.mods = sumMods(this.gear.relics, this.gear.boons, this.gear.weapon);
    this.player.hpBonus = this.mods.hp;
    this.player.mods = this.mods;
    this.player.setLevel(this.player.level);
  }
  /** Finds a relic. A full set of slots turns the find into Bone Dust. Returns a toast suffix. */
  rollRelic(rng = this.gearRng("relic")) {
    const free = Object.keys(RELICS).filter((id) => !this.gear.relics.includes(id));
    if (this.gear.relics.length >= RELIC_SLOTS || free.length === 0) {
      this.boneDust += 2;
      return " (slots full, +2 Bone Dust)";
    }
    const id = rng.pick(free);
    this.gear.relics.push(id);
    this.recomputeMods();
    this.emit({ type: "gear", kind: "relic", id });
    return `: ${RELICS[id].name}, ${RELICS[id].desc}`;
  }
  /** Finds a weapon. It is equipped when stronger than the current one, otherwise it breaks down into Bone Dust. */
  rollWeapon(r = this.gearRng("weapon")) {
    const bonus = (this.tier - 1) * 8;
    const rar = r.weighted(RARITIES, (x) => (x.id === "common" ? Math.max(20, x.weight - bonus * 2) : x.weight + bonus / (x.id === "rare" ? 1 : 2)));
    const names = WEAPON_NAMES[this.character];
    const idx = RARITIES.indexOf(rar);
    const w = { name: names[idx], rarity: rar.id, label: rar.label, damage: rar.damage, temper: 0 };
    const cur = this.gear.weapon;
    if (cur && cur.damage >= w.damage) {
      this.boneDust += 1 + idx;
      return ` (${w.name} is no better, +${1 + idx} Bone Dust)`;
    }
    this.gear.weapon = { ...w, temper: cur ? Math.min(cur.temper, TEMPER.max) : 0 };
    this.recomputeMods();
    this.emit({ type: "gear", kind: "weapon", id: w.name });
    return `: ${w.name} (${w.label}), +${Math.round((w.damage + this.gear.weapon.temper * TEMPER.perLevel) * 100)}% damage`;
  }
  /** Sanctuary service: spend Bone Dust to temper the weapon. */
  temperCost() {
    const w = this.gear.weapon;
    return w && w.temper < TEMPER.max ? w.temper + 1 : null;
  }
  temper() {
    const s = this.sanctuaryHere();
    const cost = this.temperCost();
    if (!s || s.dark || cost === null || this.boneDust < cost) return false;
    this.boneDust -= cost;
    this.gear.weapon.temper++;
    this.recomputeMods();
    this.emit({ type: "gear", kind: "temper", id: this.gear.weapon.name });
    return true;
  }
  /** Offers three Boons the player does not own yet. */
  offerBoons(rng = this.gearRng("boon")) {
    const free = Object.keys(BOONS).filter((id) => !this.gear.boons.includes(id));
    if (free.length === 0) return;
    this.boonOffer = rng.shuffle(free).slice(0, 3);
    this.emit({ type: "boonOffer", ids: [...this.boonOffer] });
  }
  chooseBoon(id) {
    if (!this.boonOffer || !this.boonOffer.includes(id)) return false;
    this.gear.boons.push(id);
    this.boonOffer = null;
    this.recomputeMods();
    this.emit({ type: "gear", kind: "boon", id });
    return true;
  }
  // ------------------------------------------------------------------ gifts
  // Used by quest rewards (see Story.grant). Each returns { kind, title, desc, icon } for the reward modal.
  /** A relic the player does not own. With every slot full, the best free relic replaces the weakest-looking one. */
  giveRelicReward(rng) {
    const free = Object.keys(RELICS).filter((id) => !this.gear.relics.includes(id));
    if (free.length === 0) return this.giveBoonReward(rng);
    const id = rng.pick(free);
    let note = RELICS[id].desc;
    if (this.gear.relics.length >= RELIC_SLOTS) {
      const out = this.gear.relics.shift();
      note = `${RELICS[id].desc}. It takes the place of ${RELICS[out].name}`;
    }
    this.gear.relics.push(id);
    this.relics++;
    this.recomputeMods();
    this.emit({ type: "gear", kind: "relic", id });
    return { kind: "relic", title: RELICS[id].name, desc: note, icon: RELICS[id].icon };
  }
  /** A weapon of at least `minRarity`. If it is no better than the one in hand, the gift tempers that weapon instead. */
  giveWeaponReward(rng, minRarity = "rare") {
    const bonus = (this.tier - 1) * 8;
    const minIdx = Math.max(0, RARITIES.findIndex((x) => x.id === minRarity));
    const pool = RARITIES.filter((_, i) => i >= minIdx);
    const rar = rng.weighted(pool, (x) => (x.id === "common" ? x.weight : x.weight + bonus / (x.id === "rare" ? 1 : 2)));
    const idx = RARITIES.indexOf(rar);
    const name = WEAPON_NAMES[this.character][idx];
    const icon = WEAPON_ICONS[this.character][idx];
    const cur = this.gear.weapon;
    if (cur && cur.damage >= rar.damage) {
      if (cur.temper < TEMPER.max) {
        cur.temper++;
        this.recomputeMods();
        this.emit({ type: "gear", kind: "temper", id: cur.name });
        return { kind: "temper", title: `${cur.name} tempered`, desc: `The smith's gift is a finer edge: +${Math.round(TEMPER.perLevel * 100)}% damage`, icon };
      }
      this.boneDust += 4;
      return { kind: "bone_dust", title: "Bone Dust", desc: "Four measures, for tempering", icon: REWARD_ICONS.bone_dust };
    }
    this.gear.weapon = { name, rarity: rar.id, label: rar.label, damage: rar.damage, temper: cur ? Math.min(cur.temper, TEMPER.max) : 0 };
    this.weapons++;
    this.recomputeMods();
    this.emit({ type: "gear", kind: "weapon", id: name });
    return { kind: "weapon", title: name, desc: `${rar.label} weapon, +${Math.round((rar.damage + this.gear.weapon.temper * TEMPER.perLevel) * 100)}% damage`, icon };
  }
  /** Picks a Boon outright (no choice screen: a gift is a gift). */
  giveBoonReward(rng) {
    const free = Object.keys(BOONS).filter((id) => !this.gear.boons.includes(id));
    if (free.length === 0) return this.giveIchorReward(3);
    const id = rng.pick(free);
    this.gear.boons.push(id);
    this.recomputeMods();
    this.emit({ type: "gear", kind: "boon", id });
    return { kind: "boon", title: BOONS[id].name, desc: BOONS[id].desc, icon: BOONS[id].icon };
  }
  giveIchorReward(n = 2) {
    const amount = Math.round(ECONOMY.ichorCache * this.tier * this.mods.ichor * n * 0.6);
    this.ichor += amount;
    return { kind: "ichor", title: `${amount} Ichor`, desc: "Spend it at a Sanctuary to level up", icon: REWARD_ICONS.ichor };
  }
  giveFlaskReward() {
    const p = this.player;
    if (p.flaskMax >= P.flask.maxCharges) return this.giveIchorReward(3);
    p.flaskMax++;
    p.flasks++;
    return { kind: "flask_shard", title: "Flask Shard", desc: "One more flask charge, for good", icon: REWARD_ICONS.flask_shard };
  }
  giveBoneDustReward(n = 3) {
    this.boneDust += n;
    return { kind: "bone_dust", title: `${n} Bone Dust`, desc: "Temper your weapon at a Sanctuary", icon: REWARD_ICONS.bone_dust };
  }
  giveCandleReward() {
    if (this.candles >= 3) return this.giveIchorReward(3);
    this.candles++;
    return { kind: "candle", title: "A Candle", desc: "One more chance when the dark takes you", icon: REWARD_ICONS.candle };
  }
  /** Called when a dialogue with `uid` opens. Marks the person as met and counts a Wisp for the Wisp quest. */
  talk(uid) {
    const npc = this.story.npc(uid);
    if (!npc) return false;
    this.story.meet(npc);
    this.story.note("talk", { uid });
    return true;
  }
  // ------------------------------------------------------------------ save
  /**
   * Everything a checkpoint needs beyond `carry()`. Taken at a Sanctuary, so no fight, arena lock or flight is in
   * progress. All plain JSON.
   */
  snapshot() {
    const diff = [];
    const base = this.world.tiles.fg;
    for (let i = 0; i < this.world.fg.length; i++) if (this.world.fg[i] !== base[i]) diff.push(i, this.world.fg[i]);
    return {
      v: 1,
      carry: this.carry(),
      gearRolls: this.gearRolls,
      ichorState: { dropped: this.dropped ? { ...this.dropped } : null },
      clock: { sec: this.clockSec, started: this.clockStarted, phase: this.blightPhase, warned: this.warned },
      gate: { open: this.gateOpen, nightfall: this.nightfall, empower: this.empower, seals: this.seals, lastRite: this.lastRite },
      lit: [...this.lit],
      respawnRoom: this.respawnRoom,
      visited: [...this.visited],
      taken: this.pickups.map((k, i) => (k.taken ? i : -1)).filter((i) => i >= 0),
      levers: this.levers.map((l, i) => (l.used ? i : -1)).filter((i) => i >= 0),
      bosses: [...this.bossRecords.entries()].map(([room, r]) => [room, { defeated: !!r.defeated, hp: r.hp ?? null }]),
      dead: [...this.spawns.entries()].filter(([, s]) => s.dead).map(([id]) => id),
      tiles: diff,
      boonOffer: this.boonOffer ? [...this.boonOffer] : null,
      story: this.story.snapshot()
    };
  }
  /** Builds a Sim and puts it back to a checkpoint. `opts` is the usual constructor options (seed, tier, character). */
  static restore(opts, snap) {
    const sim = new Sim({ ...opts, carry: snap.carry });
    sim.gearRolls = snap.gearRolls ?? 0;
    sim.dropped = snap.ichorState?.dropped ?? null;
    sim.clockSec = snap.clock.sec;
    sim.clockStarted = snap.clock.started;
    sim.blightPhase = snap.clock.phase;
    sim.warned = snap.clock.warned;
    sim.gateOpen = snap.gate.open;
    sim.nightfall = snap.gate.nightfall;
    sim.empower = snap.gate.empower;
    sim.seals = snap.gate.seals;
    sim.lastRite = snap.gate.lastRite;
    sim.lit = new Set(snap.lit);
    sim.visited = new Set(snap.visited);
    for (const i of snap.taken) if (sim.pickups[i]) sim.pickups[i].taken = true;
    for (const i of snap.levers) if (sim.levers[i]) sim.levers[i].used = true;
    for (const [room, r] of snap.bosses) {
      const rec = sim.bossRecords.get(room);
      if (rec) {
        rec.defeated = r.defeated;
        if (r.hp !== null) rec.hp = r.hp;
      }
    }
    for (const id of snap.dead) {
      const sp = sim.spawns.get(id);
      if (sp) sp.dead = true;
    }
    for (let i = 0; i < snap.tiles.length; i += 2) sim.world.fg[snap.tiles[i]] = snap.tiles[i + 1];
    sim.story.restore(snap.story);
    sim.boonOffer = snap.boonOffer ? [...snap.boonOffer] : null;
    sim.recomputeMods();
    sim.respawnRoom = snap.respawnRoom;
    const at = sim.sanctuaries.find((x) => x.room === snap.respawnRoom) ?? sim.sanctuaries[0];
    sim.player.spawnAt(at.x, at.y + 1);
    sim.player.restoreAll();
    sim.player.fervor = 0;
    sim.currentRoom = at.room;
    sim.visited.add(at.room);
    sim.lit.add(at.room);
    sim.enterRoom(at.room);
    sim.events = [];
    return sim;
  }
  // ------------------------------------------------------------------ combat
  enemyCtx() {
    const p = this.player;
    return {
      world: this.world,
      emit: (e) => this.emit(e),
      player: () => ({ cx: p.cx, cy: p.cy, feet: p.body.y, alive: p.state !== "dead" }),
      spawnBolt: (x, y, dir, a, scale) => {
        const pr = a.projectile;
        this.hazards.bolts.push({ x, y, vx: dir * pr.speed, w: pr.w, h: pr.h, damage: pr.damage * scale, tele: pr.tele, owner: "enemy", life: ticks(4e3), hit: /* @__PURE__ */ new Set() });
      },
      spawn: (s, boss) => this.bossSpawn(s, boss),
      rng: this.rng
    };
  }
  updateEnemies() {
    const ctx = this.enemyCtx();
    const p = this.player;
    for (const e of this.enemies) {
      e.update(ctx);
      if (!e.alive) continue;
      const box = e.activeBox();
      if (box && !e.hitThisAttack && overlap(box, p.rect())) {
        const a = e.attack;
        const res = p.takeHit(a.damage * e.damageScale, a.tele, e.cx, a.knockback, a.grabMs);
        if (res === "parried") {
          e.hitThisAttack = true;
          e.parried();
          this.onParry(e.cx, e.cy);
        } else if (res === "hit") {
          e.hitThisAttack = true;
          this.onPlayerHit(a.damage * e.damageScale, e.def.name, a.hitstopMs);
        }
      }
    }
    for (const e of this.enemies) if (!e.alive) this.onEnemyDeath(e);
    this.enemies = this.enemies.filter((e) => e.alive);
  }
  updateBoss() {
    const b = this.boss;
    if (!b || !b.alive || this.currentRoom !== b.room) return;
    if (!this.arenaLock && b.state === "intro") return;
    b.update(this.enemyCtx());
    const box = b.activeBox();
    const p = this.player;
    if (box && overlap(box.rect, p.rect())) {
      const res = p.takeHit(box.damage * b.damageScale, box.tele, b.cx, box.knockback, box.grabMs);
      if (res === "parried") {
        if (b.parried()) this.emit({ type: "stagger", x: b.cx, y: b.cy });
        this.onParry(b.cx, b.cy);
      } else if (res === "hit") {
        b.stepHit = true;
        this.onPlayerHit(box.damage * b.damageScale, b.name, box.hitstopMs ?? 90);
      }
    }
  }
  /** Bodies do not stack: an overlapping boss slowly pushes the player aside (dodges pass through). */
  separate() {
    const p = this.player;
    if (p.state === "dodge" || p.state === "airdash" || p.state === "riposte" || p.state === "dead" || p.state === "hang" || p.state === "cling") return;
    const others = [];
    const b = this.boss;
    if (b && b.alive && b.room === this.currentRoom) others.push({ rect: b.rect(), cx: b.cx, facing: b.facing, push: 0.18 });
    for (const e of this.enemies) if (e.alive) others.push({ rect: e.rect(), cx: e.cx, facing: e.facing, push: 0.08 });
    for (const o of others) {
      if (!overlap(o.rect, p.rect())) continue;
      const dir = Math.sign(p.cx - o.cx) || -o.facing;
      const nx = p.body.x + dir * o.push;
      if (!overlapsTiles(this.world, nx, p.body.y, p.body.w, p.body.h, p.rules().blocks)) p.body.x = nx;
    }
  }
  onParry(x, y) {
    this.story.note("parry");
    this.hitstop = Math.max(this.hitstop, ticks(140));
    this.emit({ type: "parry", x, y });
    this.emit({ type: "shake", amount: COMBAT.shake.parry });
  }
  onPlayerHit(damage, source, hitstopMs) {
    const p = this.player;
    this.hitstop = Math.max(this.hitstop, ticks(Math.min(120, hitstopMs)));
    this.emit({ type: "hit", x: p.cx, y: p.cy, target: "player", damage: Math.round(damage) });
    this.emit({ type: "shake", amount: COMBAT.shake.hurt });
    this.lastDeathCause = source;
  }
  resolvePlayerAttacks() {
    const p = this.player;
    const act = p.activeBox();
    if (!act) return;
    const { rect, run } = act;
    const def = run.def;
    const dmg = def.damage * p.damageScale() * this.mods.damage;
    for (const e of this.enemies) {
      if (!e.alive || run.hit.has(e.id) || !overlap(rect, e.rect())) continue;
      run.hit.add(e.id);
      const broke = e.takeHit(dmg, def.poise, p.facing, def.knockback);
      this.onPlayerDealt(dmg, e.cx, e.cy, "enemy", def.hitstopMs, def.shake ?? 0.1, run.kind !== "light" && run.kind !== "air", run.kind);
      if (broke) this.emit({ type: "stagger", x: e.cx, y: e.cy });
    }
    const b = this.boss;
    if (b && b.alive && b.room === this.currentRoom && !run.hit.has(BOSS_ID) && overlap(rect, b.rect())) {
      run.hit.add(BOSS_ID);
      this.damageBoss(dmg, def.poise, def.hitstopMs, def.shake ?? 0.1, run.kind !== "light" && run.kind !== "air");
    }
  }
  onPlayerDealt(dmg, x, y, target, hitstopMs, shake, heavy, kind = "light") {
    const p = this.player;
    p.fervor = Math.min(P.fervor.max, p.fervor + P.fervor.perHit * this.mods.fervor);
    p.resolve = Math.min(P.resolve.max, p.resolve + dmg * P.resolve.perDamageDealt);
    this.hitstop = Math.max(this.hitstop, ticks(hitstopMs));
    this.emit({ type: "hit", x, y, target, damage: Math.round(dmg), heavy, kind });
    this.emit({ type: "shake", amount: shake });
  }
  damageBoss(dmg, poise, hitstopMs, shake, heavy) {
    const b = this.boss;
    const res = b.takeHit(dmg, poise);
    this.onPlayerDealt(dmg, b.cx, b.cy, "boss", hitstopMs, shake, heavy);
    if (res.staggered) this.emit({ type: "stagger", x: b.cx, y: b.cy });
    if (res.phaseChanged) this.emit({ type: "bossPhase", phase: b.phase });
    if (res.died) this.onBossDeath(b);
  }
  onEnemyDeath(e) {
    const rec = this.spawns.get(e.spawnId);
    if (rec) rec.dead = true;
    const ichor = Math.round(e.def.ichor * TIER_SCALE.ichor[this.tier - 1] * this.mods.ichor);
    this.ichor += ichor;
    this.kills++;
    this.story.note("kill", { elite: !!e.def.elite });
    if (this.mods.killHeal > 0 && this.player.state !== "dead") this.player.hp = Math.min(this.player.maxHp, this.player.hp + Math.round(this.player.maxHp * this.mods.killHeal));
    this.emit({ type: "enemyDeath", x: e.cx, y: e.cy, ichor });
  }
  onBossDeath(b) {
    const rec = this.bossRecords.get(b.room);
    rec.defeated = true;
    this.unlockArena();
    this.hazards.clear();
    const warden = b.room === this.map.wardenRoom;
    this.ichor += Math.round(b.def.ichor * TIER_SCALE.ichor[this.tier - 1] * this.mods.ichor);
    this.kills++;
    this.emit({ type: "bossDefeated", name: b.name, warden });
    this.emit({ type: "shake", amount: COMBAT.shake.bossDeath });
    this.hitstop = Math.max(this.hitstop, ticks(300));
    if (warden) {
      this.mode = "cleared";
      this.emit({ type: "tierCleared" });
    } else {
      this.seals++;
      this.offerBoons();
      this.emit({ type: "toast", text: `Seal claimed (${this.seals} of ${this.heraldCount})`, tone: "boss" });
    }
  }
  riposteTarget() {
    const p = this.player;
    const reach = P.riposte.rangeTiles;
    const inFront = (x, y) => {
      const dx = (x - p.cx) * p.facing;
      return dx > -0.6 && dx < reach + 1 && Math.abs(y - p.cy) < 2.5;
    };
    for (const e of this.enemies) if (e.staggered && inFront(e.cx, e.cy)) return { x: e.cx, y: e.cy };
    const b = this.boss;
    if (b && b.staggered && b.room === this.currentRoom && inFront(b.cx + b.body.w / 2 * -p.facing, b.cy)) return { x: b.cx, y: b.cy };
    return null;
  }
  riposteImpact() {
    const p = this.player;
    const scale = p.damageScale();
    const target = this.riposteTarget();
    if (!target) return;
    const e = this.enemies.find((x) => x.staggered && Math.abs(x.cx - target.x) < 0.01);
    if (e) {
      const dmg = P.riposte.baseDamage * scale;
      e.takeHit(dmg, 0, p.facing, 6);
      e.recoverFromRiposte();
      this.onPlayerDealt(dmg, e.cx, e.cy, "enemy", P.riposte.hitstopMs, COMBAT.shake.riposte, true);
      return;
    }
    if (this.boss && this.boss.staggered) {
      const b = this.boss;
      b.state = "idle";
      b.t = 0;
      b.poise = b.def.poise;
      b.decide = 40;
      this.damageBoss(P.riposte.bossBaseDamage * scale, 0, P.riposte.hitstopMs, COMBAT.shake.riposte, true);
    }
  }
  spawnSmoke(x, y, facing) {
    const s = this.kit.skill.smoke;
    if (!s) return;
    const sx = facing > 0 ? x + s.forward - s.w / 2 : x - s.forward - s.w / 2;
    this.hazards.areas.push({ kind: "smoke", rect: { x: sx, y: y - s.h, w: s.w, h: s.h }, arm: 0, life: ticks(s.durationMs), damage: s.damage, dotT: 0 });
  }
  bossSpawn(s, boss) {
    const a = boss.arena;
    const scale = boss.damageScale;
    const p = this.player;
    if (s.kind === "embers") {
      for (let i = 0; i < s.count; i++) {
        const x = Math.max(a.x + 1.5, Math.min(a.x + a.w - 1.5, p.cx + (i === 0 ? 0 : this.rng.float(-s.spread, s.spread))));
        const ground = groundUnder(this.world, x, a.y + 2, a.y + a.h);
        this.hazards.embers.push({ x, ground, mark: ticks(s.markMs) + i * 4, impactDamage: s.impactDamage * scale, poolMs: s.poolMs, poolDamage: s.poolDamage * scale });
      }
    } else if (s.kind === "shockwave") {
      for (const dir of [-1, 1]) this.hazards.waves.push({ x: boss.cx + dir * (boss.body.w / 2 + 0.5), y: boss.body.y, dir, speed: s.speed, damage: s.damage * scale, life: ticks(s.lifeMs), hit: false });
      this.emit({ type: "shake", amount: COMBAT.shake.slam });
    } else if (s.kind === "tide") {
      const mid = a.x + a.w / 2;
      const left = p.cx < mid;
      const floor = boss.body.y;
      this.hazards.areas.push({
        kind: "tide",
        rect: { x: left ? a.x + 1 : mid, y: floor - s.height, w: a.w / 2 - 1, h: s.height },
        arm: ticks(s.armMs),
        life: ticks(s.lifeMs),
        damage: s.damage * scale,
        dotT: 0
      });
    }
  }
  updateHazards() {
    const h = this.hazards;
    const p = this.player;
    h.step(this.world, (e) => {
      if (overlap(emberImpactRect(e), p.rect())) {
        const res = p.takeHit(e.impactDamage, "blight", e.x, 6);
        if (res === "hit") this.onPlayerHit(e.impactDamage, "falling embers", 60);
      }
    });
    const dotTicks = ticks(COMBAT.dotIntervalMs);
    for (const b of h.bolts) {
      if (b.owner === "enemy" && overlap(boltRect(b), p.rect())) {
        const res = p.takeHit(b.damage, b.tele, b.x - b.vx, 5);
        if (res === "parried") {
          b.owner = "player";
          b.vx = -b.vx * 1.3;
          b.damage = COMBAT.reflectedBoltDamage * p.damageScale();
          b.life = ticks(3e3);
          this.onParry(b.x, b.y);
        } else if (res === "hit") {
          b.life = 0;
          this.onPlayerHit(b.damage, "a bolt", 50);
        }
      } else if (b.owner === "player") {
        for (const e of this.enemies) {
          if (e.alive && !b.hit.has(e.id) && overlap(boltRect(b), e.rect())) {
            b.hit.add(e.id);
            b.life = 0;
            e.takeHit(b.damage, 30, Math.sign(b.vx), 6);
            this.onPlayerDealt(b.damage, e.cx, e.cy, "enemy", 60, 0.15, true, "bolt");
          }
        }
        if (this.boss && this.boss.alive && overlap(boltRect(b), this.boss.rect())) {
          b.life = 0;
          this.damageBoss(b.damage, 30, 60, 0.15, true);
        }
      }
    }
    h.bolts = h.bolts.filter((b) => b.life > 0);
    for (const a of h.areas) {
      if (a.arm > 0 || a.dotT > 0) continue;
      if (a.kind === "smoke") {
        let any = false;
        for (const e of this.enemies) {
          if (e.alive && overlap(a.rect, e.rect())) {
            e.takeHit(a.damage * p.damageScale(), 2, 0, 0);
            any = true;
          }
        }
        if (this.boss && this.boss.alive && overlap(a.rect, this.boss.rect())) {
          const res = this.boss.takeHit(a.damage * p.damageScale(), 2);
          if (res.phaseChanged) this.emit({ type: "bossPhase", phase: this.boss.phase });
          if (res.staggered) this.emit({ type: "stagger", x: this.boss.cx, y: this.boss.cy });
          if (res.died) this.onBossDeath(this.boss);
          any = true;
        }
        if (any) {
          a.dotT = dotTicks;
          this.emit({ type: "smokeTick" });
        }
      } else if (overlap(a.rect, p.rect()) && p.state !== "dead") {
        p.applyDamage(a.damage);
        a.dotT = dotTicks;
        this.lastDeathCause = a.kind === "tide" ? "the tide" : "Blight pools";
        this.emit({ type: "hit", x: p.cx, y: p.cy, target: "player", damage: Math.round(a.damage) });
      }
    }
    for (const w of h.waves) {
      if (!w.hit && overlap(waveRect(w), p.rect())) {
        const res = p.takeHit(w.damage, "unparryable", w.x - w.dir, 8);
        if (res === "hit") {
          w.hit = true;
          this.onPlayerHit(w.damage, "a shockwave", 70);
        }
      }
    }
  }
  breakSecretWalls() {
    const act = this.player.activeBox();
    if (!act) return;
    const r = act.rect;
    for (let y = Math.floor(r.y); y < r.y + r.h; y++) {
      for (let x = Math.floor(r.x); x < r.x + r.w; x++) {
        if (this.world.tile(x, y) === Tile.BREAKABLE) {
          for (const p of this.world.flood(x, y, Tile.BREAKABLE, Tile.AIR)) this.emit({ type: "break", x: p.x, y: p.y });
          this.emit({ type: "toast", text: "A hidden passage" });
          this.emit({ type: "secretFound" });
          this.story.note("secret");
        }
      }
    }
  }
  // ------------------------------------------------------------------ Blight
  updateBlight() {
    if (this.practiceMode) return;
    if (!this.clockStarted || this.inWardenFight() || this.currentRoom === this.map.wardenRoom) return;
    this.clockSec = Math.min(this.clockSecTotal, this.clockSec + DT);
    const f = this.clockSec / this.clockSecTotal;
    let phase = 0;
    for (const s of GEN.phaseStarts) if (f >= s) phase++;
    if (f >= 1) phase = 4;
    if (phase > this.blightPhase) {
      this.blightPhase = phase;
      this.emit({ type: "blightPhase", phase, name: PHASE_NAMES[phase] });
      if (phase === 4) {
        this.emit({ type: "toast", text: "Nightfall. The Gate tears open.", tone: "blight" });
        if (!this.gateOpen) this.openGate(true);
      } else {
        this.emit({ type: "toast", text: `${PHASE_NAMES[phase]}: the Blight takes the outer rooms`, tone: "blight" });
      }
    }
    const nextStart = phase < 3 ? GEN.phaseStarts[phase] * this.clockSecTotal : this.clockSecTotal;
    if (phase < 4 && this.warned < phase && this.clockSec >= nextStart - BLIGHT.warnSec) {
      this.warned = phase;
      this.emit({ type: "blightWarning", seconds: BLIGHT.warnSec });
      this.emit({ type: "toast", text: `The Blight spreads in ${BLIGHT.warnSec} seconds`, tone: "blight" });
    }
    const p = this.player;
    if (this.roomConsumed(this.room()) && p.state !== "dead") {
      p.applyDamage(BLIGHT.burnPerSec * p.maxHp * DT);
      this.lastDeathCause = "the Blight";
    }
  }
  // ------------------------------------------------------------------ death
  onPlayerZero() {
    const p = this.player;
    if (this.practiceMode) {
      p.hp = p.maxHp;
      p.invuln = ticks(900);
      this.emit({ type: "toast", text: "Nobody dies in the Yard" });
      return;
    }
    if (this.boss && this.boss.alive && this.arenaLock && this.lastRite) {
      this.lastRite = false;
      p.hp = Math.round(p.maxHp * P.lastRiteHp);
      p.invuln = ticks(1e3);
      this.emit({ type: "lastRite" });
      this.emit({ type: "toast", text: "Last Rite: you rise once more", tone: "boss" });
      return;
    }
    p.die();
    this.deaths++;
    this.emit({ type: "playerDeath", cause: this.lastDeathCause || "unknown" });
    if (this.ichor > 0) {
      this.dropped = { x: p.safe.x + p.body.w / 2, y: p.safe.y, amount: this.ichor, room: this.world.roomAt(p.safe.x + 0.4, p.safe.y - 1) };
    } else if (this.dropped) {
      this.dropped = null;
    }
    this.ichor = 0;
    if (this.boss && this.boss.alive && this.arenaLock) {
      this.boss.onPlayerDeath();
      const rec = this.bossRecords.get(this.boss.room);
      if (rec) rec.hp = this.boss.hp;
    }
    this.unlockArena();
    this.hazards.clear();
    if (this.candles <= 0) {
      this.mode = "over";
      this.emit({ type: "expeditionOver" });
      return;
    }
    this.candles--;
    this.mode = "dying";
    this.modeT = 110;
  }
  respawn() {
    let s = this.sanctuaries.find((x) => x.room === this.respawnRoom);
    if (!s || this.roomConsumed(this.room(s.room))) {
      const clean = this.sanctuaries.filter((x) => !this.roomConsumed(this.room(x.room)));
      clean.sort((a, b) => this.room(a.room).gateDist - this.room(b.room).gateDist);
      s = clean[0] ?? this.sanctuaries[0];
      this.lit.add(s.room);
      this.respawnRoom = s.room;
    }
    const p = this.player;
    p.spawnAt(s.x, s.y + 1);
    p.restoreAll();
    p.fervor = 0;
    p.invuln = ticks(1200);
    this.currentRoom = s.room;
    this.visited.add(s.room);
    this.respawnZone(this.room(s.room).zone);
    this.mode = "play";
    this.emit({ type: "respawn" });
    this.emit({ type: "room", room: s.room });
  }
  /** Debug helpers (F2 in the game). */
  debugGrantAll() {
    for (const a of this.map.abilities.found) this.abilities.add(a);
  }
}
export {
  PHASE_NAMES,
  Sim
};
