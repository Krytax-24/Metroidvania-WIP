import { PLAYER, Tile } from "../gen/index.js";
import { jumpVelocity } from "../gen/physics.js";
import { DT, PLAYER_TUNING as P, ticks } from "../data/tunables.js";
import { moveBody, overlapsTiles, STANDARD_ONEWAY } from "./body.js";
let attackSerial = 1;
const M = PLAYER;
const JUMP_V = jumpVelocity({ ...M, dt: DT }, M.jumpHeight);
const DJ_V = jumpVelocity({ ...M, dt: DT }, M.doubleJumpHeight);
class Player {
  constructor(ctx, kit) {
    this.ctx = ctx;
    this.kit = kit;
  }
  body = { x: 0, y: 0, w: M.bodyW, h: M.bodyH, vx: 0, vy: 0, grounded: true };
  facing = 1;
  state = "move";
  t = 0;
  hp = P.baseHp;
  maxHp = P.baseHp;
  hpBonus = 0;
  mods = { parryMs: 0, flaskHeal: 0 };
  fervor = 0;
  resolve = 0;
  flasks = P.flask.baseCharges;
  flaskMax = P.flask.baseCharges;
  level = 1;
  invuln = 0;
  iframes = 0;
  coyote = 0;
  jumpBuf = 0;
  djUsed = false;
  airDashUsed = false;
  dodgeCd = 0;
  dropT = 0;
  cling = 0;
  hang = null;
  pullT = 0;
  forceT = 0;
  forceDir = 0;
  attack = null;
  comboIndex = 0;
  incenseT = 0;
  parried = false;
  healed = false;
  knockVx = 0;
  ultInvuln = 0;
  wantsInteract = false;
  safe = { x: 0, y: 0 };
  buffer = {};
  flaskTicks = ticks(P.flask.useMs);
  // ---------------------------------------------------------------- queries
  get cx() {
    return this.body.x + this.body.w / 2;
  }
  get cy() {
    return this.body.y - this.body.h / 2;
  }
  rect() {
    return { x: this.body.x, y: this.body.y - this.body.h, w: this.body.w, h: this.body.h };
  }
  damageScale() {
    return (1 + P.damagePerLevel * (this.level - 1)) * (this.incenseT > 0 ? 1 + P.parry.incenseBonus : 1);
  }
  isInvulnerable() {
    return this.invuln > 0 || this.iframes > 0 || this.ultInvuln > 0 || this.state === "riposte" || this.state === "dead";
  }
  parryActive() {
    return this.state === "parry" && this.t < ticks(P.parry.windowMs + this.mods.parryMs) && !this.parried;
  }
  /** The current attack's hitbox in world tiles, only during active frames. */
  activeBox() {
    const a = this.attack;
    if (!a) return null;
    const s = ticks(a.def.startupMs);
    const act = ticks(a.def.activeMs);
    if (a.kind === "plunge") {
      if (this.state !== "attack" || a.t < 0 || a.t >= act) return null;
    } else if (a.t < s || a.t >= s + act) return null;
    return { rect: this.boxToWorld(a.def), run: a };
  }
  boxToWorld(def) {
    const b = def.box;
    if (b.centered) return { x: this.cx - b.w / 2, y: this.body.y + b.y, w: b.w, h: b.h };
    const x = this.facing > 0 ? this.cx + b.x : this.cx - b.x - b.w;
    return { x, y: this.body.y + b.y, w: b.w, h: b.h };
  }
  rules() {
    const mist = this.ctx.has("bloodmist") && (this.state === "dodge" || this.state === "airdash");
    return {
      blocks: (t) => t === Tile.SOLID || t === Tile.GRIP || t === Tile.SHORTCUT || t === Tile.SEAL || t === Tile.CRACKED || t === Tile.CRYSTAL || t === Tile.BREAKABLE || t === Tile.BARS && !mist,
      oneWay: STANDARD_ONEWAY,
      dropping: this.dropT > 0,
      passFloor: this.state === "plunge" ? (row, c0, c1) => this.breakCracked(row, c0, c1) : void 0
    };
  }
  /** Overlapping an iron grate (only possible mid mist-dodge). */
  insideBars() {
    const b = this.body;
    return overlapsTiles(this.ctx.world, b.x, b.y, b.w, b.h, (t) => t === Tile.BARS);
  }
  hazardHere() {
    const ward = this.ctx.has("ember_ward");
    return overlapsTiles(this.ctx.world, this.body.x, this.body.y, this.body.w, this.body.h, (t) => t === Tile.SPIKES || t === Tile.LIQUID && !ward);
  }
  // ---------------------------------------------------------------- lifecycle
  spawnAt(x, feetY) {
    this.body.x = x + (1 - this.body.w) / 2;
    this.body.y = feetY;
    this.body.vx = this.body.vy = 0;
    this.body.grounded = true;
    this.state = "move";
    this.t = 0;
    this.attack = null;
    this.cling = 0;
    this.hang = null;
    this.safe = { x: this.body.x, y: this.body.y };
  }
  setLevel(level) {
    const ratio = this.hp / this.maxHp;
    this.level = level;
    this.maxHp = P.baseHp + P.hpPerLevel * (level - 1) + this.hpBonus;
    this.hp = Math.max(1, Math.round(this.maxHp * ratio));
  }
  restoreAll() {
    this.hp = this.maxHp;
    this.flasks = this.flaskMax;
    this.fervor = P.fervor.max;
  }
  setState(s) {
    this.state = s;
    this.t = 0;
  }
  // ---------------------------------------------------------------- damage
  /**
   * Applies a hit from an enemy. Returns 'parried', 'ignored' or 'hit'.
   */
  takeHit(damage, tele, fromX, knockback, grabMs) {
    if (this.state === "dead") return "ignored";
    if (tele === "parryable" && this.parryActive()) {
      this.parried = true;
      this.fervor = Math.min(P.fervor.max, this.fervor + P.parry.fervor);
      this.incenseT = ticks(P.parry.incenseMs);
      this.invuln = ticks(P.parry.successInvulnMs);
      return "parried";
    }
    if (this.isInvulnerable()) return "ignored";
    this.applyDamage(damage);
    this.resolve = Math.min(P.resolve.max, this.resolve + damage * P.resolve.perDamageTaken);
    const dir = Math.sign(this.cx - fromX) || -this.facing;
    this.attack = null;
    this.cling = 0;
    this.hang = null;
    if (grabMs && this.hp > 0) {
      this.setState("grabbed");
      this.grabTicks = ticks(grabMs);
      this.knockVx = dir * knockback;
      this.body.vx = 0;
      this.body.vy = 0;
    } else {
      this.setState("hurt");
      this.knockVx = dir * Math.max(knockback, P.hurt.knockback * 0.6);
      this.body.vy = -P.hurt.knockUp * 0.5;
    }
    this.invuln = ticks(P.hurt.invulnMs);
    return "hit";
  }
  grabTicks = 0;
  /** Damage that ignores i-frames and does not stun (Blight Burn, pools). */
  applyDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }
  // ---------------------------------------------------------------- update
  update(input) {
    const ctx = this.ctx;
    const b = this.body;
    this.t++;
    for (const k of Object.keys(this.buffer)) {
      this.buffer[k] = (this.buffer[k] ?? 0) - 1;
      if ((this.buffer[k] ?? 0) <= 0) delete this.buffer[k];
    }
    const buf = ticks(P.inputBufferMs);
    for (const a of ["attack", "dodge", "parry", "skill", "ultimate", "flask", "grapple", "toll", "interact"]) {
      if (input.pressed[a]) this.buffer[a] = buf;
    }
    if (input.pressed.jump) this.jumpBuf = ticks(P.jumpBufferMs);
    else this.jumpBuf = Math.max(0, this.jumpBuf - 1);
    this.invuln = Math.max(0, this.invuln - 1);
    this.iframes = Math.max(0, this.iframes - 1);
    this.ultInvuln = Math.max(0, this.ultInvuln - 1);
    this.coyote = Math.max(0, this.coyote - 1);
    this.dodgeCd = Math.max(0, this.dodgeCd - 1);
    this.dropT = Math.max(0, this.dropT - 1);
    this.forceT = Math.max(0, this.forceT - 1);
    this.incenseT = Math.max(0, this.incenseT - 1);
    this.wantsInteract = false;
    const dir = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
    const wasGrounded = b.grounded;
    switch (this.state) {
      case "dead":
        return;
      case "grabbed":
        b.vx = 0;
        b.vy = 0;
        if (this.t >= this.grabTicks) {
          this.setState("hurt");
          this.body.vy = -P.hurt.knockUp;
        }
        return;
      case "hang":
        this.updateHang(input);
        return;
      case "cling":
        this.updateCling(input, dir);
        if (this.state === "cling") return;
        break;
      default:
        break;
    }
    if (this.state === "move") this.tryActions(input, dir);
    switch (this.state) {
      case "move": {
        const d = this.forceT > 0 ? this.forceDir : dir;
        b.vx = d * M.runSpeed;
        if (dir) this.facing = dir;
        this.jumpLogic(input);
        this.gravity();
        break;
      }
      case "attack":
        this.updateAttack(input, dir);
        break;
      case "charge": {
        b.vx = 0;
        if (dir) this.facing = dir;
        this.gravity();
        const full = ticks(P.heavyChargeMs);
        if (!input.held.heavy || this.t >= full) {
          const charge = Math.min(1, this.t / full);
          const h = this.kit.heavy;
          const def = {
            ...h,
            damage: h.damage + this.kit.heavyCharged.damage * charge,
            poise: h.poise + this.kit.heavyCharged.poise * charge,
            hitstopMs: h.hitstopMs + this.kit.heavyCharged.hitstopMs * charge
          };
          this.startAttack(def, "heavy", charge);
        }
        break;
      }
      case "dodge": {
        const dur = ticks(P.dodge.durationMs);
        const inBars = this.insideBars();
        b.vx = this.facing * P.dodge.speed * (this.t < dur * 0.75 || inBars ? 1 : 0.4);
        this.gravity();
        if (this.t >= dur && !inBars) {
          this.setState("move");
          this.dodgeCd = ticks(P.dodge.cooldownMs);
        }
        break;
      }
      case "airdash": {
        b.vx = this.facing * M.dashSpeed;
        b.vy = 0;
        if (this.t >= ticks(M.dashTime * 1e3) && !this.insideBars()) {
          this.setState("move");
          b.vx = this.facing * M.runSpeed;
        }
        break;
      }
      case "parry": {
        b.vx = 0;
        this.gravity();
        if (this.parried && this.t > 2) {
          this.parried = false;
          this.setState("move");
        } else if (this.t >= ticks(P.parry.windowMs + this.mods.parryMs) + ticks(P.parry.whiffRecoveryMs)) {
          this.setState("move");
        }
        break;
      }
      case "hurt": {
        b.vx = this.knockVx;
        this.knockVx *= 0.86;
        this.gravity();
        if (this.t >= ticks(P.hurt.stunMs)) this.setState("move");
        break;
      }
      case "flask": {
        b.vx = 0;
        this.gravity();
        if (!this.healed && this.t >= ticks(P.flask.healAtMs)) {
          this.healed = true;
          this.hp = Math.min(this.maxHp, this.hp + Math.round(this.maxHp * (P.flask.heal + this.mods.flaskHeal)));
          ctx.emit({ type: "heal", flask: true });
        }
        if (this.t >= this.flaskTicks) this.setState("move");
        break;
      }
      case "plunge": {
        b.vx = 0;
        b.vy = this.kit.plungeSpeed;
        break;
      }
      case "riposte": {
        b.vx = 0;
        this.gravity();
        if (this.t === ticks(220)) ctx.riposteImpact();
        if (this.t >= ticks(P.riposte.durationMs)) this.setState("move");
        break;
      }
      default:
        break;
    }
    const res = moveBody(ctx.world, b, this.rules());
    if (res.wall && !b.grounded && (this.state === "move" || this.state === "airdash")) {
      if (this.state === "airdash") this.setState("move");
      if (ctx.has("penitent_grip") && res.wall === dir && this.wallIsGrip(res.wallCol)) {
        this.setState("cling");
        this.cling = dir;
        b.vx = 0;
        b.vy = 0;
        this.djUsed = false;
        this.airDashUsed = false;
      } else if (res.wall === dir && b.vy >= -4) {
        this.ledgeAssist(res.wallCol, dir);
      }
    }
    if (res.landed) {
      this.djUsed = false;
      this.airDashUsed = false;
      ctx.emit({ type: "land" });
      if (this.state === "plunge") this.plungeImpact();
    }
    if (wasGrounded && !b.grounded && b.vy >= 0) this.coyote = ticks(P.coyoteMs);
    if (b.grounded && !this.hazardHere()) {
      if (!overlapsTiles(ctx.world, b.x - 1, b.y + 1, b.w + 2, b.h + 4, (t) => t === Tile.SPIKES || t === Tile.LIQUID)) {
        this.safe = { x: b.x, y: b.y };
      }
    }
  }
  gravity() {
    const b = this.body;
    b.vy = Math.min(b.vy + M.gravity * DT, M.maxFall);
  }
  jumpLogic(input) {
    const b = this.body;
    if (this.jumpBuf > 0) {
      const under = this.ctx.world.tile(Math.floor(this.cx), Math.round(b.y));
      if (input.held.down && b.grounded && under === Tile.ONEWAY) {
        this.dropT = ticks(250);
        b.y += 0.05;
        b.grounded = false;
        this.jumpBuf = 0;
      } else if (b.grounded || this.coyote > 0) {
        b.vy = -JUMP_V;
        b.grounded = false;
        this.coyote = 0;
        this.jumpBuf = 0;
        this.ctx.emit({ type: "jump" });
      } else if (this.ctx.has("seraph_wing") && !this.djUsed) {
        b.vy = -DJ_V;
        this.djUsed = true;
        this.jumpBuf = 0;
        this.ctx.emit({ type: "jump" });
      }
    }
    if (input.released.jump && b.vy < 0) b.vy *= P.jumpCut;
  }
  consume(a) {
    if ((this.buffer[a] ?? 0) > 0) {
      delete this.buffer[a];
      return true;
    }
    return false;
  }
  tryActions(input, dir) {
    const ctx = this.ctx;
    const b = this.body;
    if (dir) this.facing = dir;
    // Always drain the buffer, or one press would fire again a few ticks after a menu closes.
    const buffered = this.consume("interact");
    if (input.pressed.interact || buffered) this.wantsInteract = true;
    if (this.consume("toll") && ctx.has("bell_toll")) this.toll();
    if (this.consume("grapple") && ctx.has("chain_of_saints")) {
      if (this.grapple()) return;
    }
    if (this.consume("ultimate") && this.resolve >= P.resolve.max) {
      this.resolve = 0;
      this.ultInvuln = ticks(this.kit.ultimate.invulnMs);
      ctx.emit({ type: "ultimate" });
      this.startAttack(this.kit.ultimate.attack, "ultimate", 0);
      return;
    }
    if (this.consume("skill") && this.fervor >= this.kit.skill.cost) {
      this.fervor -= this.kit.skill.cost;
      ctx.emit({ type: "skill" });
      this.startAttack(this.kit.skill.attack, "skill", 0);
      return;
    }
    if (this.consume("parry")) {
      this.parried = false;
      this.setState("parry");
      return;
    }
    if (this.consume("dodge")) {
      if (b.grounded && this.dodgeCd === 0) {
        this.setState("dodge");
        this.iframes = ticks(P.dodge.iframeMs);
        ctx.emit({ type: "dodge" });
        return;
      }
      if (!b.grounded && ctx.has("wraith_step") && !this.airDashUsed) {
        this.airDashUsed = true;
        this.setState("airdash");
        ctx.emit({ type: "dodge" });
        return;
      }
    }
    if (this.consume("flask") && b.grounded && this.flasks > 0 && this.hp < this.maxHp) {
      this.flasks--;
      this.healed = false;
      this.setState("flask");
      return;
    }
    if (input.pressed.heavy) {
      if (b.grounded) {
        this.setState("charge");
        return;
      }
      this.startAttack(this.kit.air, "air", 0);
      return;
    }
    if (this.consume("attack")) {
      if (ctx.riposteTarget()) {
        this.setState("riposte");
        this.invuln = ticks(P.riposte.durationMs);
        ctx.emit({ type: "riposte", x: this.cx, y: this.cy });
        return;
      }
      if (!b.grounded && input.held.down && ctx.has("censer_fall")) {
        this.setState("plunge");
        this.attack = null;
        return;
      }
      if (!b.grounded) {
        this.startAttack(this.kit.air, "air", 0);
        return;
      }
      this.comboIndex = 0;
      this.startAttack(this.kit.light[0], "light", 0);
    }
  }
  startAttack(def, kind, charge) {
    this.attack = { def, t: 0, hit: /* @__PURE__ */ new Set(), kind, charge, serial: attackSerial++ };
    this.setState("attack");
    this.ctx.emit({ type: "swing", heavy: kind === "heavy" || kind === "skill" || kind === "ultimate" });
  }
  updateAttack(_input, dir) {
    const a = this.attack;
    const b = this.body;
    const def = a.def;
    const s = ticks(def.startupMs);
    const act = ticks(def.activeMs);
    const total = s + act + ticks(def.recoveryMs);
    if (a.t === s && a.kind === "skill") this.ctx.spawnSmoke(this.cx, b.y, this.facing);
    if (a.kind === "air") {
      b.vx = dir * M.runSpeed * 0.85;
      this.gravity();
      if (b.grounded && a.t >= s + act) a.t = total;
    } else {
      b.vx = a.t < s + act ? this.facing * (def.step ?? 0) : 0;
      this.gravity();
    }
    a.t++;
    if (a.kind === "light" && a.t >= s + act + ticks(def.chainAfterMs ?? 9999) && this.comboIndex < this.kit.light.length - 1) {
      if (this.consume("attack")) {
        this.comboIndex++;
        if (dir) this.facing = dir;
        this.startAttack(this.kit.light[this.comboIndex], "light", 0);
        return;
      }
    }
    if (a.t >= s + act && (a.kind === "light" || a.kind === "heavy" || a.kind === "air") && (this.buffer.dodge ?? 0) > 0 && b.grounded && this.dodgeCd === 0) {
      delete this.buffer.dodge;
      if (dir) this.facing = dir;
      this.attack = null;
      this.setState("dodge");
      this.iframes = ticks(P.dodge.iframeMs);
      this.ctx.emit({ type: "dodge" });
      return;
    }
    if (a.t >= total) {
      this.attack = null;
      this.setState("move");
    }
  }
  plungeImpact() {
    const def = this.kit.plunge;
    this.attack = { def, t: 0, hit: /* @__PURE__ */ new Set(), kind: "plunge", charge: 0, serial: attackSerial++ };
    this.state = "attack";
    this.t = 0;
    this.ctx.emit({ type: "shake", amount: def.shake ?? 0.3 });
  }
  /** Plunging onto cracked floor breaks it and keeps falling. */
  breakCracked(row, c0, c1) {
    const w = this.ctx.world;
    let cracked = false;
    for (let c = c0; c <= c1; c++) if (w.tile(c, row) === Tile.CRACKED) cracked = true;
    if (!cracked) return false;
    for (let c = c0; c <= c1; c++) {
      if (w.tile(c, row) === Tile.CRACKED) {
        for (const p of w.flood(c, row, Tile.CRACKED, Tile.AIR)) this.ctx.emit({ type: "break", x: p.x, y: p.y });
      }
    }
    this.ctx.emit({ type: "toast", text: "The floor gives way" });
    return true;
  }
  wallIsGrip(col) {
    const b = this.body;
    for (let r = Math.floor(b.y - b.h); r <= Math.floor(b.y - 1e-6); r++) if (this.ctx.world.tile(col, r) === Tile.GRIP) return true;
    return false;
  }
  /** Climbs onto a ledge whose top is just above the feet (base kit). */
  ledgeAssist(wallCol, dir) {
    const b = this.body;
    const w = this.ctx.world;
    const rules = this.rules();
    for (let top = Math.floor(b.y - 1e-6); top >= Math.floor(b.y - P.ledgeGrabTiles); top--) {
      if (!rules.blocks(w.tile(wallCol, top)) && !rules.oneWay(w.tile(wallCol, top))) continue;
      if (rules.blocks(w.tile(wallCol, top - 1))) return;
      const nx = dir > 0 ? wallCol + 0.02 : wallCol + 1 - b.w - 0.02;
      if (!overlapsTiles(w, nx, top, b.w, b.h, rules.blocks)) {
        b.x = nx;
        b.y = top;
        b.vy = 0;
        b.grounded = true;
      }
      return;
    }
  }
  updateCling(input, dir) {
    const b = this.body;
    const w = this.ctx.world;
    const wallCol = this.cling > 0 ? Math.floor(b.x + b.w + 0.01) : Math.floor(b.x - 0.01);
    b.vx = 0;
    b.vy = 0;
    if (!this.wallIsGrip(wallCol)) {
      this.mantle(wallCol);
      return;
    }
    if (this.jumpBuf > 0) {
      this.forceDir = -this.cling;
      this.forceT = ticks(140);
      this.facing = -this.cling;
      b.vy = -JUMP_V * 0.95;
      this.cling = 0;
      this.jumpBuf = 0;
      this.setState("move");
      return;
    }
    if (dir === -this.cling || this.consume("dodge")) {
      this.cling = 0;
      this.setState("move");
      return;
    }
    const climb = (input.held.up ? -1 : 0) + (input.held.down ? 1 : 0);
    if (!climb) return;
    const ny = b.y + climb * P.climbSpeed * DT;
    if (overlapsTiles(w, b.x, ny, b.w, b.h, this.rules().blocks)) {
      if (climb > 0) {
        this.cling = 0;
        this.setState("move");
      }
      return;
    }
    const prev = b.y;
    b.y = ny;
    if (climb < 0 && !this.wallIsGrip(wallCol)) {
      b.y = prev;
      this.mantle(wallCol);
    }
  }
  mantle(wallCol) {
    const b = this.body;
    const w = this.ctx.world;
    const side = this.cling;
    const rules = this.rules();
    const nx = side > 0 ? wallCol + 0.02 : wallCol + 1 - b.w - 0.02;
    for (let top = Math.floor(b.y) - 4; top <= Math.floor(b.y) + 1; top++) {
      if (!overlapsTiles(w, nx, top, b.w, b.h, rules.blocks) && rules.blocks(w.tile(Math.floor(nx + b.w / 2), top))) {
        b.x = nx;
        b.y = top;
        break;
      }
    }
    this.cling = 0;
    this.setState("move");
  }
  grapple() {
    const b = this.body;
    let best = null;
    let bd = M.hookRadius;
    for (const h of this.ctx.hooks) {
      const d = Math.hypot(h.x + 0.5 - this.cx, h.y + 0.5 - this.cy);
      if (d < bd && this.ctx.world.lineClear(this.cx, this.cy, h.x + 0.5, h.y + 0.5, this.rules().blocks)) {
        bd = d;
        best = h;
      }
    }
    if (!best) return false;
    this.hang = { x: best.x + (1 - b.w) / 2, y: best.y + 4 };
    this.pullT = ticks(160);
    this.cling = 0;
    this.setState("hang");
    return true;
  }
  updateHang(input) {
    const b = this.body;
    const h = this.hang;
    if (this.pullT > 0) {
      const k = 1 / this.pullT;
      b.x += (h.x - b.x) * k;
      b.y += (h.y - b.y) * k;
      this.pullT--;
    } else {
      b.x = h.x;
      b.y = h.y;
    }
    b.vx = b.vy = 0;
    this.djUsed = false;
    this.airDashUsed = false;
    if (this.jumpBuf > 0) {
      this.hang = null;
      b.vy = -JUMP_V;
      this.jumpBuf = 0;
      this.setState("move");
    } else if (input.held.down) {
      this.hang = null;
      this.setState("move");
    }
  }
  toll() {
    const w = this.ctx.world;
    let n = 0;
    for (let y = Math.floor(this.cy - 6); y <= this.cy + 6; y++) {
      for (let x = Math.floor(this.cx - 6); x <= this.cx + 6; x++) {
        if (w.tile(x, y) === Tile.CRYSTAL) {
          for (const p of w.flood(x, y, Tile.CRYSTAL, Tile.AIR)) {
            n++;
            this.ctx.emit({ type: "break", x: p.x, y: p.y });
          }
        }
      }
    }
    this.ctx.emit({ type: "toast", text: n ? "The crystal seal shatters" : "The toll rings out" });
  }
  die() {
    this.setState("dead");
    this.attack = null;
    this.body.vx = 0;
  }
}
export {
  Player
};
