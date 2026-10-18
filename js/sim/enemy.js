import { PLAYER } from "../gen/index.js";
import { ENEMIES } from "../data/enemies.js";
import { COMBAT, DT, ticks } from "../data/tunables.js";
import { floorAhead, moveBody, STANDARD_BLOCKS, STANDARD_ONEWAY } from "./body.js";
let nextEnemyId = 1;
class Enemy {
  constructor(spawnId, defId, spawnX, spawnY, room, bounds, blighted, damageScale, hpScale, facing) {
    this.spawnId = spawnId;
    this.spawnX = spawnX;
    this.spawnY = spawnY;
    this.room = room;
    this.bounds = bounds;
    this.blighted = blighted;
    this.damageScale = damageScale;
    this.def = ENEMIES[defId];
    this.body = { x: spawnX + 0.5 - this.def.w / 2, y: spawnY + 1, w: this.def.w, h: this.def.h, vx: 0, vy: 0, grounded: false };
    this.maxHp = Math.round(this.def.hp * hpScale);
    this.hp = this.maxHp;
    this.poise = this.def.poise;
    this.rules = { blocks: STANDARD_BLOCKS, oneWay: STANDARD_ONEWAY, bounds };
    this.facing = facing;
  }
  id = nextEnemyId++;
  def;
  body;
  facing = 1;
  hp = 0;
  poise;
  state = "patrol";
  t = 0;
  attack = null;
  hitThisAttack = false;
  cooldowns = /* @__PURE__ */ new Map();
  sinceDamage = 999;
  flash = 0;
  knockVx = 0;
  rules;
  maxHp;
  get cx() {
    return this.body.x + this.body.w / 2;
  }
  get cy() {
    return this.body.y - this.body.h / 2;
  }
  rect() {
    return { x: this.body.x, y: this.body.y - this.body.h, w: this.body.w, h: this.body.h };
  }
  get staggered() {
    return this.state === "stagger";
  }
  get alive() {
    return this.state !== "dead";
  }
  /** Telegraph currently shown, if winding up. */
  get telegraph() {
    return this.state === "windup" && this.attack ? this.attack.tele : null;
  }
  /** World hitbox of the current attack's active frames. */
  activeBox() {
    if (this.state !== "active" || !this.attack || this.attack.projectile) return null;
    const bx = this.attack.box;
    const x = this.facing > 0 ? this.cx + bx.x : this.cx - bx.x - bx.w;
    return { x, y: this.body.y + bx.y, w: bx.w, h: bx.h };
  }
  /** Returns true if this hit broke poise. */
  takeHit(damage, poiseDamage, dir, knockback) {
    if (!this.alive) return false;
    this.hp -= damage;
    if (this.def.immortal && this.hp <= 0) this.hp = this.maxHp;
    this.sinceDamage = 0;
    this.flash = 6;
    if (this.state !== "stagger") this.poise -= poiseDamage;
    if (this.hp <= 0) {
      this.state = "dead";
      return false;
    }
    this.knockVx = dir * knockback * (this.def.elite ? 0.4 : 1);
    if (this.poise <= 0 && this.state !== "stagger") {
      this.state = "stagger";
      this.t = 0;
      this.attack = null;
      return true;
    }
    return false;
  }
  /** After a riposte the enemy gets up: one riposte per stagger. */
  recoverFromRiposte() {
    if (!this.alive) return;
    this.state = "chase";
    this.t = 0;
    this.poise = this.def.poise;
    this.cooldowns.forEach((_v, k) => this.cooldowns.set(k, Math.max(this.cooldowns.get(k) ?? 0, ticks(600))));
  }
  /** Parried: an instant stagger. */
  parried() {
    if (!this.alive) return;
    this.poise = 0;
    this.state = "stagger";
    this.t = 0;
    this.attack = null;
  }
  update(ctx) {
    if (!this.alive) return;
    const b = this.body;
    const p = ctx.player();
    this.t++;
    this.sinceDamage++;
    this.flash = Math.max(0, this.flash - 1);
    for (const [k, v] of this.cooldowns) this.cooldowns.set(k, v - 1);
    if (this.sinceDamage > ticks(COMBAT.enemyPoiseRegenMs) && this.state !== "stagger") this.poise = this.def.poise;
    const dx = p.cx - this.cx;
    const dy = p.feet - b.y;
    const dist = Math.abs(dx);
    const sees = p.alive && dist < this.def.aggro && Math.abs(dy) < 6 && ctx.world.roomAt(p.cx, p.cy) === this.room;
    switch (this.state) {
      case "idle":
      case "patrol": {
        b.vx = this.facing * this.def.speed * 0.5;
        if (!floorAhead(ctx.world, b, this.facing, this.rules) && b.grounded) this.facing *= -1;
        if (sees) this.state = "chase";
        break;
      }
      case "chase": {
        if (!sees) {
          this.state = "patrol";
          break;
        }
        this.facing = Math.sign(dx) || this.facing;
        let want = this.facing;
        if (this.def.behavior === "ranged" && dist < (this.def.keepAway ?? 6)) want = -this.facing;
        if (this.def.behavior === "charger" && dist < 3) want = -this.facing;
        const speed = this.def.behavior === "ranged" && want !== this.facing ? this.def.speed * 0.8 : this.def.speed;
        b.vx = floorAhead(ctx.world, b, want, this.rules) ? want * speed : 0;
        if (dist < this.def.w / 2 + 0.7 && this.def.behavior === "melee") b.vx = 0;
        for (const a of this.def.attacks) {
          if ((this.cooldowns.get(a.id) ?? 0) > 0) continue;
          if (dist < a.minRange || dist > a.maxRange || Math.abs(dy) > a.maxDy) continue;
          if (a.projectile && !ctx.world.lineClear(this.cx, this.cy - 0.5, p.cx, p.cy, STANDARD_BLOCKS)) continue;
          this.attack = a;
          this.state = "windup";
          this.t = 0;
          this.hitThisAttack = false;
          this.cooldowns.set(a.id, ticks(a.cooldownMs + a.startupMs + a.activeMs + a.recoveryMs));
          ctx.emit({ type: "telegraph", tele: a.tele, x: this.cx, y: b.y - b.h });
          break;
        }
        break;
      }
      case "windup": {
        b.vx = 0;
        if (this.t >= ticks(this.attack.startupMs)) {
          this.state = "active";
          this.t = 0;
          const a = this.attack;
          if (a.projectile) ctx.spawnBolt(this.cx + this.facing * 0.6, this.cy - 0.4, this.facing, a, this.damageScale);
        }
        break;
      }
      case "active": {
        const a = this.attack;
        if (a.dashSpeed) {
          b.vx = floorAhead(ctx.world, b, this.facing, this.rules) ? this.facing * a.dashSpeed : 0;
        } else b.vx = this.facing * (a.step ?? 0);
        if (this.t >= ticks(a.activeMs)) {
          this.state = "recover";
          this.t = 0;
          if (!this.hitThisAttack) ctx.emit({ type: "whiff", tele: a.tele, x: this.cx });
        }
        break;
      }
      case "recover": {
        b.vx = 0;
        if (this.t >= ticks(this.attack.recoveryMs)) {
          this.state = "chase";
          this.t = 0;
          this.attack = null;
        }
        break;
      }
      case "stagger": {
        b.vx = 0;
        if (this.t >= ticks(COMBAT.enemyStaggerMs)) {
          this.state = "chase";
          this.t = 0;
          this.poise = this.def.poise;
        }
        break;
      }
    }
    if (Math.abs(this.knockVx) > 0.05) {
      b.vx += this.knockVx;
      this.knockVx *= Math.max(0, 1 - COMBAT.enemyKnockbackDecay * DT);
    } else this.knockVx = 0;
    b.vy = Math.min(b.vy + PLAYER.gravity * DT, PLAYER.maxFall);
    const res = moveBody(ctx.world, b, this.rules);
    if (res.wall && (this.state === "patrol" || this.state === "idle")) this.facing *= -1;
    if (b.y > this.bounds.y + this.bounds.h + 2) this.state = "dead";
  }
  /** Back to the spawn point, full health (used when the player leaves the room). */
  reset() {
    this.body.x = this.spawnX + 0.5 - this.def.w / 2;
    this.body.y = this.spawnY + 1;
    this.body.vx = this.body.vy = 0;
    this.hp = this.maxHp;
    this.poise = this.def.poise;
    this.state = "patrol";
    this.attack = null;
    this.t = 0;
  }
}
export {
  Enemy
};
