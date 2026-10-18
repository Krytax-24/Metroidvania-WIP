import { PLAYER } from "../gen/index.js";
import { COMBAT, DT, ticks } from "../data/tunables.js";
import { moveBody, STANDARD_BLOCKS, STANDARD_ONEWAY } from "./body.js";
const BOSS_ID = -1;
class Boss {
  constructor(def, name, title, room, arena, spawnX, spawnY, damageScale, hpScale, recoveryScale, hp) {
    this.def = def;
    this.name = name;
    this.title = title;
    this.room = room;
    this.arena = arena;
    this.spawnX = spawnX;
    this.spawnY = spawnY;
    this.damageScale = damageScale;
    this.recoveryScale = recoveryScale;
    this.maxHp = Math.round(def.hp * hpScale);
    this.hp = hp ?? this.maxHp;
    this.poise = def.poise;
    this.body = { x: spawnX + 0.5 - def.w / 2, y: spawnY + 1, w: def.w, h: def.h, vx: 0, vy: 0, grounded: false };
    this.rules = { blocks: STANDARD_BLOCKS, oneWay: STANDARD_ONEWAY, bounds: arena };
    this.phase = this.phaseFor(this.hp);
  }
  id = BOSS_ID;
  body;
  facing = -1;
  hp;
  maxHp;
  poise;
  phase = 0;
  state = "intro";
  t = 0;
  attack = null;
  stepIdx = 0;
  stepT = 0;
  stepHit = false;
  cooldowns = /* @__PURE__ */ new Map();
  flash = 0;
  decide = 30;
  telegraph = null;
  leap = null;
  rules;
  get cx() {
    return this.body.x + this.body.w / 2;
  }
  get cy() {
    return this.body.y - this.body.h / 2;
  }
  get alive() {
    return this.state !== "dead";
  }
  get staggered() {
    return this.state === "stagger";
  }
  rect() {
    return { x: this.body.x, y: this.body.y - this.body.h, w: this.body.w, h: this.body.h };
  }
  get step() {
    return this.attack ? this.attack.steps[this.stepIdx] ?? null : null;
  }
  phaseFor(hp) {
    let p = 0;
    this.def.phases.forEach((f, i) => {
      if (hp <= f * this.maxHp) p = i;
    });
    return p;
  }
  boxToWorld(b) {
    if (b.centered) return { x: this.cx - b.w / 2, y: this.body.y + b.y, w: b.w, h: b.h };
    const x = this.facing > 0 ? this.cx + b.x : this.cx - b.x - b.w;
    return { x, y: this.body.y + b.y, w: b.w, h: b.h };
  }
  /** Active hitbox this tick: rect plus the step that owns it. */
  activeBox() {
    const s = this.step;
    if (this.state !== "attack" || !s || this.stepHit) return null;
    if (s.t === "hit") return { rect: this.boxToWorld(s.box), damage: s.damage, knockback: s.knockback, tele: s.tele, grabMs: s.grabMs, hitstopMs: s.hitstopMs };
    if (s.t === "dash" && s.box && s.damage) return { rect: this.boxToWorld(s.box), damage: s.damage, knockback: s.knockback ?? 8, tele: s.tele ?? "unparryable" };
    return null;
  }
  takeHit(damage, poiseDamage) {
    const out = { staggered: false, phaseChanged: false, died: false };
    if (!this.alive || this.state === "intro") return out;
    this.hp = Math.max(0, this.hp - damage);
    this.flash = 6;
    if (this.hp <= 0) {
      this.state = "dead";
      this.telegraph = null;
      out.died = true;
      return out;
    }
    const p = this.phaseFor(this.hp);
    if (p > this.phase) {
      this.phase = p;
      out.phaseChanged = true;
    }
    if (this.state !== "stagger") {
      this.poise -= poiseDamage;
      if (this.poise <= 0) {
        this.enterStagger();
        out.staggered = true;
      }
    }
    return out;
  }
  /** A parried boss hit: big poise damage and the current hit ends. */
  parried(poiseDamage = COMBAT.bossParryPoise) {
    this.stepHit = true;
    if (this.state === "stagger") return false;
    this.poise -= poiseDamage;
    if (this.poise <= 0) {
      this.enterStagger();
      return true;
    }
    return false;
  }
  enterStagger() {
    this.state = "stagger";
    this.t = 0;
    this.attack = null;
    this.telegraph = null;
    this.leap = null;
  }
  /** Player died in the fight: heal 25% of lost HP, never above the current phase's threshold. */
  onPlayerDeath() {
    const cap = this.def.phases[this.phase] * this.maxHp;
    this.hp = Math.min(cap, this.hp + 0.25 * (this.maxHp - this.hp));
    this.body.x = this.spawnX + 0.5 - this.def.w / 2;
    this.body.y = this.spawnY + 1;
    this.state = "intro";
    this.t = 0;
    this.attack = null;
    this.telegraph = null;
    this.leap = null;
    this.poise = this.def.poise;
  }
  update(ctx) {
    if (!this.alive) return;
    const b = this.body;
    const p = ctx.player();
    this.t++;
    this.flash = Math.max(0, this.flash - 1);
    for (const [k, v] of this.cooldowns) this.cooldowns.set(k, v - 1);
    const dx = p.cx - this.cx;
    const dist = Math.abs(dx);
    switch (this.state) {
      case "intro":
        b.vx = 0;
        this.facing = Math.sign(dx) || this.facing;
        if (this.t > 90) {
          this.state = "idle";
          this.t = 0;
          this.decide = 30;
        }
        break;
      case "idle": {
        this.facing = Math.sign(dx) || this.facing;
        const want = dist > this.def.preferRange + 1 ? 1 : dist < this.def.preferRange - 1.5 ? -1 : 0;
        b.vx = want * this.facing * this.def.speed;
        if (want > 0 && dist < this.def.w / 2 + 1) b.vx = 0;
        this.decide--;
        if (this.decide <= 0 && p.alive) this.choose(ctx, dist);
        break;
      }
      case "attack":
        this.runStep(ctx, dx);
        break;
      case "stagger":
        b.vx = 0;
        if (this.t >= ticks(COMBAT.bossStaggerMs)) {
          this.state = "idle";
          this.t = 0;
          this.poise = this.def.poise;
          this.decide = 20;
        }
        break;
    }
    if (this.leap) return;
    b.vy = Math.min(b.vy + PLAYER.gravity * DT, PLAYER.maxFall);
    moveBody(ctx.world, b, this.rules);
  }
  choose(ctx, dist) {
    const options = this.def.attacks.filter(
      (a2) => a2.phases.includes(this.phase) && (this.cooldowns.get(a2.id) ?? 0) <= 0 && dist >= a2.minRange && dist <= a2.maxRange
    );
    if (options.length === 0) {
      this.decide = 10;
      return;
    }
    const a = ctx.rng.weighted(options, (o) => o.weight);
    this.attack = a;
    this.stepIdx = 0;
    this.stepT = 0;
    this.stepHit = false;
    this.state = "attack";
    this.cooldowns.set(a.id, ticks(a.cooldownMs));
    this.enterStep(ctx);
  }
  enterStep(ctx) {
    const s = this.step;
    this.stepT = 0;
    this.stepHit = false;
    this.telegraph = null;
    if (!s) {
      this.state = "idle";
      this.attack = null;
      this.decide = ctx.rng.int(18, 40);
      return;
    }
    const p = ctx.player();
    switch (s.t) {
      case "face":
        this.facing = Math.sign(p.cx - this.cx) || this.facing;
        this.next(ctx);
        return;
      case "windup":
        this.telegraph = s.tele;
        ctx.emit({ type: "telegraph", tele: s.tele, x: this.cx, y: this.body.y - this.body.h, boss: true });
        return;
      case "leap": {
        const toX = Math.max(this.arena.x + 1, Math.min(this.arena.x + this.arena.w - 1 - this.body.w, p.cx - this.body.w / 2));
        this.leap = { fromX: this.body.x, toX, y: this.body.y, dur: ticks(s.ms), height: s.height };
        return;
      }
      case "spawn":
        ctx.spawn(s, this);
        this.next(ctx);
        return;
      default:
        return;
    }
  }
  next(ctx) {
    this.stepIdx++;
    this.enterStep(ctx);
  }
  runStep(ctx, dx) {
    const s = this.step;
    const b = this.body;
    if (!s) return;
    this.stepT++;
    b.vx = 0;
    let dur = 0;
    switch (s.t) {
      case "windup":
        dur = ticks(s.ms);
        break;
      case "hit":
        dur = ticks(s.ms);
        break;
      case "dash":
        dur = ticks(s.ms);
        b.vx = this.facing * s.speed;
        break;
      case "leap": {
        const L = this.leap;
        const k = Math.min(1, this.stepT / L.dur);
        b.x = L.fromX + (L.toX - L.fromX) * k;
        b.y = L.y - 4 * L.height * k * (1 - k);
        b.vx = 0;
        b.vy = 0;
        dur = L.dur;
        if (this.stepT >= dur) {
          b.y = L.y;
          this.leap = null;
          ctx.emit({ type: "shake", amount: 0.45 });
        }
        break;
      }
      case "recover":
        dur = ticks(s.ms * this.def.phaseRecovery[this.phase] * this.recoveryScale);
        break;
      default:
        dur = 0;
    }
    void dx;
    if (this.stepT >= dur) this.next(ctx);
  }
}
export {
  BOSS_ID,
  Boss
};
