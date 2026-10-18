// Canvas 2D sprite renderer. Reads the simulation, never changes it.
// World units are tiles; one tile is 16 native pixels. The backing store runs at display resolution.
import { Tile } from "../gen/index.js";
import { CAMERA, ticks } from "../data/tunables.js";
import { ABILITY_COLORS, LOOT_COLORS } from "../data/palette.js";
import { boltRect, emberImpactRect, waveRect } from "../sim/hazards.js";
import { CHAR_ART, bossPose, bossSkin, enemyPose, enemySkin, playerPose } from "./anims.js";
import { NPCS } from "../data/story.js";

const W = CAMERA.viewW;
const H = CAMERA.viewH;
const T = CAMERA.tile;

const TELE_COLORS = { parryable: "#e8c45a", unparryable: "#e2433c", blight: "#a57ae0", grab: "#f2efe6" };

/** Which tile atlas and mood each biome uses. */
const BIOME_ART = {
  undercroft: { atlas: "crystal", void: "#090b12", shade: "rgba(6,6,18,0.42)" },
  midreach: { atlas: "sky", void: "#0d1020", shade: "rgba(8,8,22,0.36)" },
  summit: { atlas: "autumn", void: "#130e0c", shade: "rgba(14,7,5,0.38)" }
};

/**
 * Ambient light per biome, applied to every character sheet so they stand in the same light as the tiles.
 * `tint` is the room's colour, `mix` how strongly sprites pick it up, `outline` the dark edge that glues
 * flat-shaded sprites to the painted world. Art is graded at draw time and never recoloured on disk.
 */
const GRADES = {
  undercroft: { key: "u", tint: [110, 140, 235], mix: 0.5, sat: 0.8, bright: 0.9, outline: [9, 12, 26], rim: "rgba(120,170,255,0.55)" },
  midreach: { key: "m", tint: [160, 185, 225], mix: 0.38, sat: 0.82, bright: 0.96, outline: [26, 34, 52], rim: "rgba(210,225,255,0.5)" },
  summit: { key: "s", tint: [238, 168, 112], mix: 0.45, sat: 0.84, bright: 0.92, outline: [40, 22, 14], rim: "rgba(255,190,120,0.5)" }
};

const SOLIDISH = new Set([Tile.SOLID, Tile.GRIP, Tile.BREAKABLE, Tile.CRACKED, Tile.SEAL, Tile.SHORTCUT]);
const hash2 = (x, y) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;

const ULT_COLORS = { gino: "#ff8ad0", knight: "#8ec5ff", mage: "#b79cff" };
const LOOT_PIECE = { flask_shard: "col_life", weapon: "col_locked_silver_treasure_box", relic: "col_golden_key", bone_dust: "col_coin_03", ichor_cache: "col_mana" };

export class Renderer {
  constructor(host, assets) {
    this.assets = assets;
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.className = "view";
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.res = 1;
    this.cam = { x: 0, y: 0 };
    this.snap = true;
    this.trauma = 0;
    this.particles = [];
    this.nums = [];
    this.flash = null;
    this.ghosts = [];
    this.decor = null;
    this.decorMap = null;
    this.character = "gino";
    /** Turns an action id into the key, button or touch label the player sees. Set by the app. */
    this.labelFn = (a) => a;
    this.opts = { damageNumbers: true, shake: 1, debug: false, zoom: CAMERA.zoom, flashes: true };
    this.ox = 0;
    this.oy = 0;
    this.vw = W / this.opts.zoom;
    this.vh = H / this.opts.zoom;
  }

  setResolution(r) {
    const n = Math.max(1, Math.min(6, Math.round(r)));
    if (n === this.res) return;
    this.res = n;
    this.canvas.width = W * n;
    this.canvas.height = H * n;
    this.ctx.imageSmoothingEnabled = false;
  }

  setZoom(z) {
    this.opts.zoom = z;
  }

  resetCamera() {
    this.snap = true;
    this.particles = [];
    this.nums = [];
    this.ghosts = [];
  }

  /** Called for a new Tier or restart: forgets cached decor. */
  resetMap() {
    this.decor = null;
    this.decorMap = null;
    this.resetCamera();
  }

  // ------------------------------------------------------------------ events

  onEvent(e, sim) {
    switch (e.type) {
      case "shake":
        this.trauma = Math.min(1, this.trauma + e.amount);
        break;
      case "hit": {
        const color = e.target === "player" ? "#e2433c" : "#f2efe6";
        this.burst(e.x, e.y, e.heavy ? 14 : 8, color, e.heavy ? 9 : 6);
        if (this.opts.damageNumbers && e.damage > 0) this.nums.push({ x: e.x, y: e.y - 1.5, text: String(e.damage), life: 50, color: e.target === "player" ? "#ff8a80" : "#f2efe6" });
        break;
      }
      case "parry":
        this.burst(e.x, e.y, 20, "#e8c45a", 10);
        this.flash = { color: "rgba(232,196,90,0.25)", life: 8 };
        break;
      case "riposte":
        this.flash = { color: "rgba(242,239,230,0.2)", life: 10 };
        break;
      case "stagger":
        this.burst(e.x, e.y - 1, 10, "#e8c45a", 5);
        break;
      case "enemyDeath":
        this.burst(e.x, e.y, 22, "#7a1f27", 7);
        this.burst(e.x, e.y, 10, "#a57ae0", 4);
        break;
      case "break":
        this.burst(e.x + 0.5, e.y + 0.5, 4, "#9a8f80", 5);
        break;
      case "jump":
      case "land":
        if (sim) {
          const b = sim.player.body;
          this.dust(b.x + b.w / 2, b.y, e.type === "land" ? 6 : 4);
        }
        break;
      case "lastRite":
        this.flash = { color: "rgba(201,162,74,0.35)", life: 24 };
        break;
      case "playerDeath":
        this.flash = { color: "rgba(120,20,30,0.35)", life: 40 };
        break;
      case "bossDefeated":
        this.flash = { color: "rgba(242,239,230,0.4)", life: 30 };
        break;
      default:
        break;
    }
  }

  burst(x, y, n, color, speed) {
    for (let i = 0; i < n && this.particles.length < 400; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: 30, max: 30, color, size: Math.random() < 0.3 ? 3 : 2, grav: 20 });
    }
  }

  dust(x, y, n) {
    for (let i = 0; i < n && this.particles.length < 400; i++) {
      const dir = i % 2 ? 1 : -1;
      this.particles.push({ x: x + dir * 0.3, y: y - 0.1, vx: dir * (1 + Math.random() * 2), vy: -0.5 - Math.random(), life: 18, max: 18, color: "#cfc6b4", size: 2, grav: 2 });
    }
  }

  // ------------------------------------------------------------------ light

  /** A grade by biome name, for scenes that are not the world (cutscenes, portraits). */
  gradeByName(name) {
    return GRADES[name] ?? GRADES.undercroft;
  }

  /** The grade for the current Tier. */
  gradeFor(sim) {
    return GRADES[sim.map.tier.biome] ?? GRADES.undercroft;
  }

  /** World y of the first solid tile below (x, y), or null when nothing is within reach. */
  groundBelow(sim, x, y, reach = 10) {
    const w = sim.world;
    const tx = Math.floor(x);
    for (let ty = Math.floor(y); ty <= Math.floor(y) + reach; ty++) {
      if (ty < 0 || ty >= w.h || tx < 0 || tx >= w.w) return null;
      if (SOLIDISH.has(w.tile(tx, ty))) return ty;
    }
    return null;
  }

  /** Soft contact shadow on the floor under a character; shrinks and fades with height. */
  contactShadow(sim, sx, sy, wx, wy, radius) {
    const gy = this.groundBelow(sim, wx, wy);
    if (gy == null) return;
    const h = Math.max(0, gy - wy);
    const k = Math.max(0.25, 1 - h / 7);
    const x = sx(wx);
    const y = sy(gy) + 1;
    const rx = radius * k;
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, `rgba(0,0,8,${0.75 * k})`);
    g.addColorStop(1, "rgba(0,0,8,0)");
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.34);
    ctx.translate(-x, -y);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------------ decor

  /** Places scenery on floor tops once per Tier: deterministic from the seed. */
  buildDecor(sim) {
    const art = BIOME_ART[sim.map.tier.biome] ?? BIOME_ART.undercroft;
    const spec = this.assets.manifest.tiles[art.atlas];
    const names = spec.decor;
    const w = sim.world;
    const out = [];
    const keepOut = [...sim.sanctuaries, ...sim.pickups, ...sim.hooks, ...sim.levers].map((o) => ({ x: o.x, y: o.y }));
    const open = (x, y) => w.tile(x, y) === Tile.AIR;
    const floor = (x, y) => SOLIDISH.has(w.tile(x, y)) && w.tiles.roomOf[y * w.w + x] >= 0;
    for (let y = 1; y < w.h; y++) {
      for (let x = 1; x < w.w - 1; x++) {
        if (!floor(x, y) || !open(x, y - 1)) continue;
        const h = hash2(x + sim.seed.length * 31, y);
        if (h % 100 > 13) continue;
        const name = names[(h >>> 8) % names.length];
        const r = spec.rects[name];
        const wt = Math.max(1, Math.ceil(r[2] / T));
        const ht = Math.max(1, Math.ceil(r[3] / T));
        let ok = true;
        for (let i = 0; i < wt && ok; i++) {
          if (!floor(x + i, y) || !open(x + i, y - 1)) ok = false;
          for (let j = 1; j <= ht && ok; j++) if (!open(x + i, y - j)) ok = false;
        }
        if (!ok) continue;
        if (keepOut.some((k) => Math.abs(k.x - x) < 4 && Math.abs(k.y + 1 - y) < 4)) continue;
        out.push({ x: x + wt / 2, y, name, w: r[2], h: r[3] });
        x += wt;
      }
    }
    this.decor = out;
  }

  // ------------------------------------------------------------------ frame

  render(sim, time) {
    const ctx = this.ctx;
    const zoom = this.opts.zoom;
    const VW = W / zoom;
    const VH = H / zoom;
    this.vw = VW;
    this.vh = VH;
    if (!this.decor) this.buildDecor(sim);
    ctx.setTransform(this.res * zoom, 0, 0, this.res * zoom, 0, 0);
    const art = BIOME_ART[sim.map.tier.biome] ?? BIOME_ART.undercroft;
    const atlas = this.assets.tiles[art.atlas];
    const rects = this.assets.manifest.tiles[art.atlas].rects;
    const p = sim.player;
    const room = sim.room();
    const rr = sim.world.roomRect(room);

    // Camera: follows with look-ahead, clamped to the room.
    const vw = VW / T;
    const vh = VH / T;
    let tx = p.cx + p.facing * CAMERA.lookAhead - vw / 2;
    let ty = p.cy - vh / 2 - 1;
    tx = rr.w <= vw ? rr.x + rr.w / 2 - vw / 2 : Math.max(rr.x, Math.min(rr.x + rr.w - vw, tx));
    ty = rr.h <= vh ? rr.y + rr.h / 2 - vh / 2 : Math.max(rr.y, Math.min(rr.y + rr.h - vh, ty));
    if (this.snap) {
      this.cam.x = tx;
      this.cam.y = ty;
      this.snap = false;
    } else {
      this.cam.x += (tx - this.cam.x) * CAMERA.follow;
      this.cam.y += (ty - this.cam.y) * CAMERA.follow;
    }
    this.trauma = Math.max(0, this.trauma - 0.025);
    const shake = 6 * this.opts.shake * this.trauma * this.trauma;
    const ox = Math.round(this.cam.x * T + (Math.random() * 2 - 1) * shake);
    const oy = Math.round(this.cam.y * T + (Math.random() * 2 - 1) * shake);
    const sx = (x) => Math.round(x * T - ox);
    const sy = (y) => Math.round(y * T - oy);
    this.ox = ox;
    this.oy = oy;

    ctx.fillStyle = art.void;
    ctx.fillRect(0, 0, VW, VH);

    // Backdrop offsets are relative to the room so the parallax never runs off the image.
    const bg0 = this.assets.bg[`${art.atlas}_0`];
    const bg1 = this.assets.bg[`${art.atlas}_1`];
    const u = rr.w * T - VW > 1 ? Math.max(0, Math.min(1, (ox - rr.x * T) / (rr.w * T - VW))) : 0.5;
    const v = rr.h * T - VH > 1 ? Math.max(0, Math.min(1, (oy - rr.y * T) / (rr.h * T - VH))) : 0.5;
    const b0x = Math.round(u * Math.max(0, bg0.width - VW));
    const b0y = Math.round(v * Math.max(0, bg0.height - VH));
    const b1x = Math.round(u * Math.max(0, bg1.width - VW));
    const b1y = Math.round(v * Math.max(0, bg1.height - VH));

    const w = sim.world;
    const x0 = Math.floor(this.cam.x) - 1;
    const y0 = Math.floor(this.cam.y) - 1;
    const solid = (x, y) => {
      if (x < 0 || y < 0 || x >= w.w || y >= w.h) return true;
      if (w.tiles.roomOf[y * w.w + x] < 0) return true;
      return SOLIDISH.has(w.fg[y * w.w + x]);
    };

    // Pass 1: backdrop seen through every open in-room tile, drawn once under a clip so no tile seams show.
    const open = new Path2D();
    const marks = [];
    for (let y = y0; y <= y0 + vh + 2; y++) {
      let runStart = -1;
      for (let x = x0; x <= x0 + vw + 3; x++) {
        let isOpen = false;
        if (x >= 0 && y >= 0 && x < w.w && y < w.h && x <= x0 + vw + 2) {
          const i = y * w.w + x;
          if (w.tiles.roomOf[i] >= 0) {
            const t = w.fg[i];
            isOpen = t !== Tile.SOLID && t !== Tile.GRIP;
            if (isOpen && w.tiles.bg[i] > 1) marks.push([x, y, w.tiles.bg[i]]);
          }
        }
        if (isOpen && runStart < 0) runStart = x;
        else if (!isOpen && runStart >= 0) {
          open.rect(runStart * T - ox, y * T - oy, (x - runStart) * T, T);
          runStart = -1;
        }
      }
    }
    ctx.save();
    ctx.clip(open);
    ctx.drawImage(bg0, -b0x, -b0y);
    ctx.drawImage(bg1, -b1x, -b1y);
    ctx.fillStyle = art.shade;
    ctx.fillRect(0, 0, VW, VH);
    ctx.restore();
    for (const [x, y, b] of marks) {
      const px = x * T - ox;
      const py = y * T - oy;
      if (b === 2) {
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.fillRect(px + 3, py, 10, T);
      } else if (b === 3 || b === 5) {
        ctx.fillStyle = "rgba(255,244,214,0.07)";
        ctx.fillRect(px + 4, py, 8, T);
      } else if (b === 4) {
        ctx.fillStyle = "rgba(160,150,140,0.35)";
        ctx.fillRect(px + 7, py, 2, T);
      }
    }

    // Scenery on floors.
    const drect = this.assets.manifest.tiles[art.atlas].rects;
    for (const d of this.decor) {
      const x = sx(d.x);
      const y = sy(d.y);
      if (x < -60 || x > VW + 60 || y < -20 || y > VH + 140) continue;
      const r = drect[d.name];
      ctx.drawImage(atlas, r[0], r[1], r[2], r[3], Math.round(x - r[2] / 2), y - r[3], r[2], r[3]);
    }

    // Pass 2: foreground tiles.
    for (let y = y0; y <= y0 + vh + 2; y++) {
      for (let x = x0; x <= x0 + vw + 2; x++) {
        if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
        const i = y * w.w + x;
        if (w.tiles.roomOf[i] < 0) continue;
        this.drawTile(ctx, atlas, rects, w.fg[i], x * T - ox, y * T - oy, x, y, time, solid, w);
      }
    }

    // Blight overlay on consumed rooms.
    for (const r of sim.map.rooms) {
      if (!sim.roomConsumed(r)) continue;
      const R = sim.world.roomRect(r);
      const a = sx(R.x);
      const b = sy(R.y);
      if (a > VW || b > VH || a + R.w * T < 0 || b + R.h * T < 0) continue;
      ctx.fillStyle = "rgba(90,40,140,0.22)";
      ctx.fillRect(a, b, R.w * T, R.h * T);
      for (let i = 0; i < 6; i++) {
        const k = (time / 40 + i * 97) % 360;
        ctx.fillStyle = "rgba(190,150,240,0.35)";
        ctx.fillRect(a + ((i * 173 + time / 30) % (R.w * T)), b + R.h * T - (k % (R.h * T)), 2, 2);
      }
    }

    this.drawWorldObjects(sim, atlas, rects, sx, sy, time);
    this.drawMarkers(sim, sx, sy, time);
    this.drawNpcs(sim, sx, sy, time);
    this.drawHazards(sim, sx, sy, time);
    this.drawEnemies(sim, sx, sy, time);
    this.drawBoss(sim, sx, sy, time);
    this.drawPlayer(sim, sx, sy, time);
    this.drawSigns(sim, sx, sy);

    // Particles and numbers.
    for (const q of this.particles) {
      q.vy += q.grav / 60;
      q.x += q.vx / 60;
      q.y += q.vy / 60;
      q.life--;
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      ctx.fillStyle = q.color;
      ctx.fillRect(sx(q.x), sy(q.y), q.size, q.size);
    }
    ctx.globalAlpha = 1;
    this.particles = this.particles.filter((q) => q.life > 0);
    ctx.font = '700 9px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = "center";
    for (const n of this.nums) {
      n.life--;
      n.y -= 0.03;
      ctx.globalAlpha = Math.min(1, n.life / 20);
      ctx.fillStyle = "#0f0c0d";
      ctx.fillText(n.text, sx(n.x) + 1, sy(n.y) + 1);
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, sx(n.x), sy(n.y));
    }
    ctx.globalAlpha = 1;
    this.nums = this.nums.filter((n) => n.life > 0);

    // A light vignette keeps the eye on the action. No color grade: the art shows as drawn.
    const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.55, VW / 2, VH / 2, VW * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
    if (this.flash) {
      if (this.opts.flashes) {
        ctx.fillStyle = this.flash.color;
        ctx.fillRect(0, 0, VW, VH);
      }
      if (--this.flash.life <= 0) this.flash = null;
    }
    if (sim.mode === "dying") {
      ctx.fillStyle = "rgba(10,4,6,0.45)";
      ctx.fillRect(0, 0, VW, VH);
    }
  }

  /** Where the player is on screen, 0..1 of the canvas width. Used for mouse aiming. */
  playerScreenX(sim) {
    const p = sim.player;
    return (p.cx * T - this.ox) / this.vw;
  }

  // ------------------------------------------------------------------ tiles

  piece(ctx, atlas, rects, name, px, py, flip = false, h = T) {
    const r = rects[name];
    if (!r) return;
    if (!flip) ctx.drawImage(atlas, r[0], r[1], r[2], Math.min(h, r[3]), px, py, r[2], Math.min(h, r[3]));
    else {
      ctx.save();
      ctx.translate(px + r[2], py);
      ctx.scale(-1, 1);
      ctx.drawImage(atlas, r[0], r[1], r[2], Math.min(h, r[3]), 0, 0, r[2], Math.min(h, r[3]));
      ctx.restore();
    }
  }

  drawTile(ctx, atlas, rects, t, px, py, x, y, time, solid, w) {
    switch (t) {
      case Tile.AIR:
        return;
      case Tile.SOLID:
      case Tile.GRIP:
      case Tile.BREAKABLE:
      case Tile.CRACKED:
      case Tile.SEAL:
      case Tile.SHORTCUT: {
        const up = solid(x, y - 1);
        const left = solid(x - 1, y);
        const right = solid(x + 1, y);
        if (t === Tile.CRACKED) {
          this.piece(ctx, atlas, rects, "cracked", px, py);
          ctx.strokeStyle = "rgba(0,0,0,0.55)";
          ctx.beginPath();
          ctx.moveTo(px + 3, py);
          ctx.lineTo(px + 8, py + 8);
          ctx.lineTo(px + 5, py + T);
          ctx.stroke();
          return;
        }
        if (t === Tile.SEAL) {
          this.piece(ctx, atlas, rects, "seal", px, py);
          ctx.fillStyle = "rgba(232,196,90,0.55)";
          ctx.fillRect(px + 6, py + 2, 4, T - 4);
          return;
        }
        if (t === Tile.SHORTCUT) {
          this.piece(ctx, atlas, rects, "lever", px, py);
          return;
        }
        let name;
        let flip = false;
        const down = solid(x, y + 1);
        // Base fill first: the pack's ground pieces have rounded, transparent corners.
        if (down) this.piece(ctx, atlas, rects, "fill", px, py);
        if (!up) {
          if (!left && right) name = "tl";
          else if (!right && left) name = "tr";
          else if (down) name = "top_a";
          else name = ["top_b", "top_c", "top_d"][hash2(x, y) % 3];
          if (!left && !right) name = down ? "top_a" : "top_b";
        } else if (!left) name = "wall_l";
        else if (!right) {
          name = "wall_l";
          flip = true;
        } else if (!solid(x - 1, y - 1)) name = "fill_tl";
        else if (!solid(x + 1, y - 1)) name = "fill_tr";
        else name = "fill";
        this.piece(ctx, atlas, rects, name, px, py, flip);
        if (t === Tile.BREAKABLE) {
          ctx.fillStyle = "rgba(0,0,0,0.2)";
          ctx.fillRect(px + 5, py + 4, 1, 7);
          ctx.fillRect(px + 6, py + 8, 3, 1);
        }
        if (t === Tile.GRIP) {
          ctx.fillStyle = "#6fa04a";
          if (!left) ctx.fillRect(px, py, 2, T);
          if (!right) ctx.fillRect(px + T - 2, py, 2, T);
          ctx.fillStyle = "#8cc063";
          ctx.fillRect(px + ((x * 7) % 10), py + ((y * 5) % 12), 3, 2);
          ctx.fillRect(px + ((x * 3 + 5) % 12), py + ((y * 7 + 3) % 12), 2, 2);
        }
        if (!solid(x, y + 1)) {
          ctx.fillStyle = "rgba(0,0,0,0.28)";
          ctx.fillRect(px, py + T - 2, T, 2);
        }
        return;
      }
      case Tile.ONEWAY:
        this.piece(ctx, atlas, rects, "top_a", px, py, false, 6);
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(px, py + 6, T, 1);
        return;
      case Tile.SPIKES:
        this.piece(ctx, atlas, rects, "spike", px, py + 4);
        return;
      case Tile.LIQUID: {
        ctx.globalAlpha = 0.78;
        ctx.fillStyle = "#3f8aa8";
        ctx.fillRect(px, py, T, T);
        ctx.globalAlpha = 1;
        if (w.tile(x, y - 1) !== Tile.LIQUID) {
          ctx.fillStyle = "rgba(230,245,250,0.55)";
          ctx.fillRect(px, py + 1 + Math.round(Math.sin(time / 300 + x) * 1.5), T, 2);
        }
        return;
      }
      case Tile.BARS:
        ctx.fillStyle = "#8a8478";
        ctx.fillRect(px + 2, py, 3, T);
        ctx.fillRect(px + 10, py, 3, T);
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillRect(px + 2, py, 1, T);
        ctx.fillRect(px + 10, py, 1, T);
        return;
      case Tile.CRYSTAL: {
        const pulse = 0.75 + 0.15 * Math.sin(time / 400 + x + y);
        ctx.fillStyle = `rgba(146,212,227,${pulse})`;
        ctx.fillRect(px + 1, py, T - 2, T);
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.fillRect(px + 4, py + 3, 2, 6);
        ctx.fillStyle = "rgba(60,120,150,0.5)";
        ctx.fillRect(px + 1, py, 1, T);
        ctx.fillRect(px + T - 2, py, 1, T);
        return;
      }
      default:
    }
  }

  // ------------------------------------------------------------------ objects

  drawWorldObjects(sim, atlas, rects, sx, sy, time) {
    const ctx = this.ctx;
    const A = this.assets;
    const VW = this.vw;
    const VH = this.vh;
    for (const s of sim.sanctuaries) {
      const x = sx(s.x + 0.5);
      const y = sy(s.y + 1);
      if (x < -50 || x > VW + 50 || y < -70 || y > VH + 70) continue;
      const dark = sim.roomConsumed(sim.room(s.room));
      const lit = sim.lit.has(s.room);
      const ms = time;
      A.draw(ctx, "blacksmith", "idle", A.frameAt("blacksmith", "idle", ms), x + 40, y, { scale: 0.9, tint: dark ? "rgba(70,50,100,0.55)" : null, alpha: dark ? 0.7 : 1, grade: this.gradeFor(sim), fit: 0.9 });
      this.contactShadow(sim, sx, sy, s.x + 0.5 + 40 / T, s.y + 1, 14);
      if (!dark) {
        const f = Math.sin(time / 120);
        ctx.fillStyle = lit ? "#ffd470" : "#8a6a3a";
        ctx.beginPath();
        ctx.ellipse(x + 60, y - 18 + f * 0.3, lit ? 2.5 : 1.8, (lit ? 5 : 3) + f, 0, 0, Math.PI * 2);
        ctx.fill();
        if (lit) {
          const g = ctx.createRadialGradient(x + 60, y - 18, 2, x + 60, y - 18, 64);
          g.addColorStop(0, "rgba(255,200,100,0.22)");
          g.addColorStop(1, "rgba(255,200,100,0)");
          ctx.fillStyle = g;
          ctx.fillRect(x - 24, y - 90, 140, 120);
        }
      }
    }
    for (const k of sim.pickups) {
      if (k.taken) continue;
      const x = sx(k.x + 0.5);
      const y = sy(k.y + 1) - 10 + Math.sin(time / 300 + k.x) * 2;
      if (x < -30 || x > VW + 30 || y < -30 || y > VH + 30) continue;
      if (k.ability) {
        const col = ABILITY_COLORS[k.ability];
        const g = ctx.createRadialGradient(x, y, 1, x, y, 34);
        g.addColorStop(0, "rgba(255,240,200,0.55)");
        g.addColorStop(1, "rgba(255,240,200,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - 34, y - 34, 68, 68);
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 14);
        ctx.lineTo(x + 10, y);
        ctx.lineTo(x, y + 14);
        ctx.lineTo(x - 10, y);
        ctx.closePath();
        ctx.stroke();
        this.piece(ctx, atlas, rects, "col_star", Math.round(x - 9), Math.round(y - 9));
      } else if (k.questId) {
        const g = ctx.createRadialGradient(x, y, 1, x, y, 26);
        g.addColorStop(0, "rgba(232,196,90,0.55)");
        g.addColorStop(1, "rgba(232,196,90,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - 26, y - 26, 52, 52);
        A.drawIcon(ctx, k.icon, x, y, 18);
      } else if (k.loot) {
        const r = rects[LOOT_PIECE[k.loot]] ?? rects.col_coin_01;
        ctx.fillStyle = LOOT_COLORS[k.loot] + "44";
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(atlas, r[0], r[1], r[2], r[3], Math.round(x - r[2] / 2), Math.round(y - r[3] / 2), r[2], r[3]);
      }
    }
    for (const l of sim.levers) {
      const x = sx(l.x);
      const y = sy(l.y + 1);
      if (x < -20 || x > VW + 20 || y < -20 || y > VH + 40) continue;
      this.piece(ctx, atlas, rects, "barrel", x, y - T);
      ctx.fillStyle = l.used ? "#6a6a5a" : "#e8c45a";
      ctx.fillRect(x + 7, y - T - 4, 2, 6);
    }
    if (sim.dropped && sim.dropped.room === sim.currentRoom) {
      const x = sx(sim.dropped.x);
      const y = sy(sim.dropped.y) - 10 + Math.sin(time / 200) * 2;
      const g = ctx.createRadialGradient(x, y, 1, x, y, 26);
      g.addColorStop(0, "rgba(165,122,224,0.6)");
      g.addColorStop(1, "rgba(165,122,224,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 26, y - 26, 52, 52);
      const r = rects.col_mana ?? rects.col_crystal;
      if (r) ctx.drawImage(atlas, r[0], r[1], r[2], r[3], Math.round(x - r[2] / 2), Math.round(y - r[3] / 2), r[2], r[3]);
    }
    for (const h of sim.hooks) {
      ctx.strokeStyle = "#d9cfb8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx(h.x + 0.5), sy(h.y + 0.5), 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#8a8478";
      ctx.fillRect(sx(h.x + 0.5) - 1, sy(h.y + 0.5) - 12, 2, 6);
    }
  }

  box(r, sx, sy, color, fill = false) {
    const ctx = this.ctx;
    if (fill) {
      ctx.fillStyle = color;
      ctx.fillRect(sx(r.x), sy(r.y), r.w * T, r.h * T);
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(sx(r.x) + 0.5, sy(r.y) + 0.5, r.w * T - 1, r.h * T - 1);
    }
  }

  /** Slash drawn inside a hitbox: the visual never lies about the hitbox. */
  slash(r, facing, sx, sy, color, alpha) {
    const ctx = this.ctx;
    const x = sx(r.x);
    const y = sy(r.y);
    const w = r.w * T;
    const h = r.h * T;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    if (facing > 0) {
      ctx.moveTo(x, y + h);
      ctx.quadraticCurveTo(x + w * 1.05, y + h * 0.9, x + w * 0.85, y);
      ctx.quadraticCurveTo(x + w * 0.7, y + h * 0.6, x, y + h);
    } else {
      ctx.moveTo(x + w, y + h);
      ctx.quadraticCurveTo(x - w * 0.05, y + h * 0.9, x + w * 0.15, y);
      ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.6, x + w, y + h);
    }
    ctx.fill();
    ctx.globalAlpha = alpha * 0.55;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
  }

  /** A long thin bolt for the Mage and for Gino's thrown dagger. */
  beam(r, facing, sx, sy, color, alpha, k, headSprite = null) {
    const ctx = this.ctx;
    const x = sx(r.x);
    const y = sy(r.y);
    const w = r.w * T;
    const h = r.h * T;
    const head = facing > 0 ? x + w * k : x + w * (1 - k);
    const len = Math.max(10, w * 0.6);
    const x0 = facing > 0 ? Math.max(x, head - len) : head;
    const x1 = facing > 0 ? head : Math.min(x + w, head + len);
    const g = ctx.createLinearGradient(facing > 0 ? x0 : x1, 0, facing > 0 ? x1 : x0, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(1, color);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x0, y + h / 2 - Math.max(2, h * 0.22), x1 - x0, Math.max(4, h * 0.44));
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(head, y + h / 2, Math.max(3, h * 0.3), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (headSprite && this.assets.spec(headSprite)) {
      const A = this.assets;
      A.draw(ctx, headSprite, "fly", A.frameAt(headSprite, "fly", k * 400), head, y + h / 2 + 2, { flip: facing < 0, scale: 1.3, alpha });
    }
  }

  glyph(tele, x, y, size, time) {
    const ctx = this.ctx;
    const pulse = 1 + 0.15 * Math.sin(time / 60);
    const s = size * pulse;
    ctx.fillStyle = TELE_COLORS[tele];
    ctx.strokeStyle = "#0f0c0d";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (tele === "parryable") {
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s * 0.7, y);
      ctx.lineTo(x, y + s);
      ctx.lineTo(x - s * 0.7, y);
    } else if (tele === "unparryable") {
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s, y + s * 0.8);
      ctx.lineTo(x - s, y + s * 0.8);
    } else if (tele === "blight") {
      ctx.arc(x, y, s * 0.85, 0, Math.PI * 2);
    } else {
      ctx.rect(x - s * 0.75, y - s * 0.75, s * 1.5, s * 1.5);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  drawHazards(sim, sx, sy, time) {
    const ctx = this.ctx;
    const hz = sim.hazards;
    for (const a of hz.areas) {
      if (a.kind === "smoke") this.box(a.rect, sx, sy, "rgba(150,170,255,0.28)", true);
      else if (a.kind === "pool") this.box(a.rect, sx, sy, "rgba(165,122,224,0.55)", true);
      else if (a.arm > 0) {
        const pulse = 0.3 + 0.25 * Math.sin(time / 80);
        this.box(a.rect, sx, sy, `rgba(165,122,224,${pulse})`);
        ctx.fillStyle = "rgba(165,122,224,0.12)";
        ctx.fillRect(sx(a.rect.x), sy(a.rect.y), a.rect.w * T, a.rect.h * T);
      } else this.box(a.rect, sx, sy, "rgba(120,80,190,0.65)", true);
    }
    for (const e of hz.embers) {
      const pulse = 0.5 + 0.4 * Math.sin(time / 50);
      ctx.strokeStyle = `rgba(165,122,224,${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(sx(e.x), sy(e.ground), 12, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (e.mark < ticks(300)) {
        const r = emberImpactRect(e);
        const k = 1 - e.mark / ticks(300);
        ctx.fillStyle = "#c9a0ff";
        ctx.fillRect(sx(e.x) - 2, sy(r.y - 6 + 6 * k * 1.4), 4, 10);
      }
    }
    for (const wv of hz.waves) this.box(waveRect(wv), sx, sy, "rgba(226,67,60,0.8)", true);
    for (const b of hz.bolts) {
      const r = boltRect(b);
      ctx.fillStyle = b.owner === "player" ? "#f2efe6" : TELE_COLORS[b.tele];
      ctx.beginPath();
      ctx.arc(sx(b.x), sy(b.y), (r.w * T) / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ------------------------------------------------------------------ actors

  /**
   * One path for everything that fights the player: ordinary enemies, Yard posts and bosses. `cfg` carries the
   * differences: how the body is drawn, the glow, how loud the telegraph is and what hitbox shows.
   */
  drawFoe(sim, foe, sx, sy, time, cfg) {
    const ctx = this.ctx;
    const r = foe.rect();
    const x = sx(r.x);
    const y = sy(r.y);
    const w = r.w * T;
    const h = r.h * T;
    const lift = cfg.lift ?? 0;
    const fx = sx(foe.cx);
    const fy = sy(foe.body.y) - lift;
    this.contactShadow(sim, sx, sy, foe.cx, foe.body.y - lift / T, Math.max(cfg.shadowMin, w * cfg.shadowK));
    if (cfg.glow) {
      ctx.save();
      ctx.shadowColor = cfg.glow[0];
      ctx.shadowBlur = cfg.glow[1];
      cfg.body(fx, fy, false);
      ctx.restore();
    } else cfg.body(fx, fy, false);
    if (foe.flash > 0) cfg.body(fx, fy, true);
    const tele = foe.telegraph;
    if (tele) {
      ctx.strokeStyle = TELE_COLORS[tele];
      ctx.lineWidth = cfg.lineW;
      ctx.strokeRect(x - cfg.lineW / 2 - 0.5, y - cfg.lineW / 2 - 0.5, w + cfg.lineW + 1, h + cfg.lineW + 1);
      this.glyph(tele, x + w / 2, y - cfg.glyph[1], cfg.glyph[0], time);
    }
    const act = cfg.active(foe);
    if (act) this.slash(act.rect, foe.facing, sx, sy, TELE_COLORS[act.tele], cfg.slashAlpha);
    if (foe.staggered) {
      ctx.fillStyle = "#e8c45a";
      for (let i = 0; i < cfg.orbit; i++) {
        const a = time / 150 + (i * Math.PI * 2) / cfg.orbit;
        ctx.fillRect(x + w / 2 + Math.cos(a) * cfg.orbitR - 1, y - 6 + Math.sin(a) * 3, 2, 2);
      }
    }
    if (cfg.hpBar && foe.hp < foe.maxHp) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x - 2, y - 5, w + 4, 3);
      ctx.fillStyle = "#c0423f";
      ctx.fillRect(x - 2, y - 5, (w + 4) * Math.max(0, foe.hp / foe.maxHp), 3);
    }
    if (this.opts.debug) {
      this.box(r, sx, sy, "#4ae0c0");
      if (act) this.box(act.rect, sx, sy, "#ff4a4a");
    }
  }

  /** Sprite body for a foe: normal, or a flat white flash on top of it. */
  spriteBody(sim, skin, pose, flip) {
    const A = this.assets;
    const lit = { grade: this.gradeFor(sim), fit: skin.fit ?? 1 };
    return (fx, fy, flash) => {
      if (flash) A.draw(this.ctx, pose.sprite, pose.anim, pose.frame, fx, fy, { flip, scale: skin.scale, tint: "#ffffff", alpha: 0.85, ...lit });
      else A.draw(this.ctx, pose.sprite, pose.anim, pose.frame, fx, fy, { flip, scale: skin.scale, ...lit });
    };
  }

  drawEnemies(sim, sx, sy, time) {
    for (const e of sim.enemies) {
      if (e.def.drill) {
        this.drawFoe(sim, e, sx, sy, time, {
          body: (fx, fy, flash) => this.postBody(e, fx, fy, flash, time),
          shadowMin: 8, shadowK: 0.5, lineW: 2, glyph: [7, 12], slashAlpha: 0.7, orbit: 3, orbitR: 8, hpBar: false,
          active: (f) => (f.activeBox() && f.attack ? { rect: f.activeBox(), tele: f.attack.tele } : null)
        });
        continue;
      }
      const skin = enemySkin(e, sim.map.tier.biome);
      const pose = enemyPose(this.assets, e, skin, time);
      this.drawFoe(sim, e, sx, sy, time, {
        body: this.spriteBody(sim, skin, pose, e.facing !== skin.native),
        lift: skin.lift ?? 0,
        glow: e.blighted ? ["#a57ae0", 6] : null,
        shadowMin: 8, shadowK: 0.5, lineW: 2, glyph: [7, 12], slashAlpha: 0.7, orbit: 3, orbitR: 8, hpBar: true,
        active: (f) => (f.activeBox() && f.attack ? { rect: f.activeBox(), tele: f.attack.tele } : null)
      });
    }
  }

  drawBoss(sim, sx, sy, time) {
    const b = sim.boss;
    if (!b || !b.alive || b.room !== sim.currentRoom) return;
    const skin = bossSkin(b, sim.tier, sim.map.tier.biome);
    const pose = bossPose(this.assets, b, skin, time);
    this.drawFoe(sim, b, sx, sy, time, {
      body: this.spriteBody(sim, skin, pose, b.facing !== skin.native),
      glow: b.def.id === "warden" ? ["#e8c45a", 8] : null,
      shadowMin: 14, shadowK: 0.55, lineW: 3, glyph: [9, 16], slashAlpha: 0.65, orbit: 4, orbitR: 14, hpBar: false,
      active: (f) => f.activeBox()
    });
  }

  /** A wooden Yard post, tinted by the attack it teaches. Procedural: it is furniture, not a creature. */
  postBody(e, fx, fy, flash, time) {
    const ctx = this.ctx;
    const accent = { drill_gold: "#e8c45a", drill_red: "#e2433c", drill_grab: "#f2efe6", drill_ranged: "#e8c45a" }[e.def.id] ?? "#b79b6b";
    const lean = e.state === "stagger" ? Math.sin(time / 40) * 1.5 : e.flash > 0 ? Math.sign(e.knockVx || 1) * 1.5 : 0;
    ctx.save();
    ctx.translate(fx + lean, fy);
    ctx.fillStyle = flash ? "#ffffff" : "#4a3626";
    ctx.fillRect(-3, -36, 6, 36);
    ctx.fillStyle = flash ? "#ffffff" : "#6b4e35";
    ctx.fillRect(-9, -30, 18, 4);
    ctx.fillRect(-7, -22, 14, 3);
    ctx.fillStyle = flash ? "#ffffff" : "#8a6a48";
    ctx.fillRect(-4, -40, 8, 6);
    if (!flash) {
      ctx.fillStyle = accent;
      ctx.fillRect(-3, -36, 6, 2);
      ctx.fillRect(-9, -30, 18, 1);
      ctx.fillStyle = "#2c2118";
      ctx.fillRect(-8, 0, 16, 2);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ people and signs

  /** Short wrapped text in a dark box above a point. */
  bubble(text, cx, bottom, maxW = 150) {
    const ctx = this.ctx;
    ctx.font = "600 7px system-ui, sans-serif";
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (const wd of words) {
      const t = line ? `${line} ${wd}` : wd;
      if (ctx.measureText(t).width > maxW && line) {
        lines.push(line);
        line = wd;
      } else line = t;
    }
    if (line) lines.push(line);
    const w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width))) + 10;
    const h = lines.length * 9 + 6;
    const x = Math.round(cx - w / 2);
    const y = Math.round(bottom - h);
    ctx.fillStyle = "rgba(15,12,13,0.9)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(201,162,74,0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = "#e7dcc8";
    ctx.textAlign = "center";
    lines.forEach((l, i) => ctx.fillText(l, cx, y + 9 + i * 9));
  }

  drawNpcs(sim, sx, sy, time) {
    const ctx = this.ctx;
    const A = this.assets;
    const p = sim.player;
    const near = sim.story.npcNear(p, sim.currentRoom);
    for (const n of sim.story.npcs) {
      if (n.room !== sim.currentRoom) continue;
      const def = NPCS[n.id];
      const x = sx(n.x + 0.5);
      const bob = def.float ? Math.sin(time / 420 + n.x) * 2 : 0;
      const y = sy(n.y + 1) - (def.float ?? 0) + bob;
      if (x < -40 || x > this.vw + 40) continue;
      const face = Math.sign(p.cx - (n.x + 0.5)) || n.facing;
      const anim = A.pick(def.sprite, "idle") ?? "idle";
      this.contactShadow(sim, sx, sy, n.x + 0.5, n.y + 1, 9);
      A.draw(ctx, def.sprite, anim, A.frameAt(def.sprite, anim, time + n.x * 97), x, y, { flip: face !== def.native, scale: def.scale, grade: this.gradeFor(sim), fit: def.fit });
      const q = sim.story.stateFor(n);
      const top = y - (A.spec(def.sprite).anchor[1] ?? 40) * def.scale - 6;
      let mark = null;
      if (n.quest && q.status === "none") mark = "!";
      else if (n.quest && q.status === "ready") mark = "?";
      else if (n.quest && q.status === "active") mark = "…";
      if (mark) {
        ctx.font = "700 13px Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#0f0c0d";
        ctx.fillText(mark, x + 1, top + Math.sin(time / 200) * 2 + 1);
        ctx.fillStyle = mark === "…" ? "#a69a88" : "#e8c45a";
        ctx.fillText(mark, x, top + Math.sin(time / 200) * 2);
      }
      if (near === n) {
        ctx.font = "700 7px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#0f0c0d";
        ctx.fillText(def.name, x + 1, top - (mark ? 12 : 2) + 1);
        ctx.fillStyle = "#e7dcc8";
        ctx.fillText(def.name, x, top - (mark ? 12 : 2));
      }
    }
  }

  drawSigns(sim, sx, sy) {
    const ctx = this.ctx;
    const p = sim.player;
    let shown = null;
    for (const s of sim.signs) {
      if (s.room !== sim.currentRoom) continue;
      const x = sx(s.x + 0.5);
      const y = sy(s.y + 1);
      if (x < -20 || x > this.vw + 20) continue;
      ctx.fillStyle = "#3a2a1c";
      ctx.fillRect(x - 1, y - 12, 2, 12);
      ctx.fillStyle = "#6b4e35";
      ctx.fillRect(x - 7, y - 19, 14, 9);
      ctx.fillStyle = "#e7dcc8";
      ctx.fillRect(x - 5, y - 16, 10, 1);
      ctx.fillRect(x - 5, y - 13, 7, 1);
      if (Math.abs(s.x + 0.5 - p.cx) < 3.2 && Math.abs(s.y + 1 - p.body.y) < 3) shown = { s, x, y };
    }
    if (shown) this.bubble(shown.s.text, shown.x, shown.y - 24);
  }

  /** Glowing goal markers for the Yard drills that are about to be attempted. */
  drawMarkers(sim, sx, sy, time) {
    const pr = sim.practice;
    if (!pr) return;
    const ctx = this.ctx;
    const next = pr.next();
    for (const d of pr.drills) {
      if (d.done || d.goal.type !== "reach") continue;
      const m = pr.markers.get(d.goal.marker);
      if (!m || m.room !== sim.currentRoom) continue;
      const x = sx(m.x + 0.5);
      const y = sy(m.y + 1) - 8 + Math.sin(time / 260) * 2;
      if (x < -20 || x > this.vw + 20) continue;
      const hot = next === d;
      ctx.save();
      ctx.globalAlpha = hot ? 1 : 0.5;
      const g = ctx.createRadialGradient(x, y, 1, x, y, hot ? 26 : 16);
      g.addColorStop(0, "rgba(232,196,90,0.55)");
      g.addColorStop(1, "rgba(232,196,90,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 26, y - 26, 52, 52);
      ctx.strokeStyle = "#e8c45a";
      ctx.lineWidth = hot ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 8);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }

  drawPlayer(sim, sx, sy, time) {
    const ctx = this.ctx;
    const A = this.assets;
    const p = sim.player;
    const b = p.body;
    const art = CHAR_ART[sim.character];
    const pose = playerPose(A, sim.character, p, time);
    const fx = sx(b.x + b.w / 2);
    const fy = sy(b.y);
    const flip = p.facing !== art.native;
    const blink = p.invuln > 0 && p.state !== "riposte" && p.state !== "dead" && Math.floor(time / 60) % 2 === 0;

    // Afterimages during dodges and dashes.
    if (pose.ghost) {
      this.ghosts.push({ x: b.x + b.w / 2, y: b.y, pose, flip, life: 8 });
      if (this.ghosts.length > 12) this.ghosts.shift();
    }
    for (const g of this.ghosts) {
      g.life--;
      A.draw(ctx, g.pose.sprite, g.pose.anim, g.pose.frame, sx(g.x), sy(g.y), { flip: g.flip, scale: art.scale, alpha: Math.max(0, g.life / 8) * 0.4, tint: "#9ec6ff", grade: this.gradeFor(sim), fit: art.fit ?? 1, outline: art.outline ?? true });
    }
    this.ghosts = this.ghosts.filter((g) => g.life > 0);

    const lit = { grade: this.gradeFor(sim), fit: art.fit ?? 1, outline: art.outline ?? true };
    this.contactShadow(sim, sx, sy, b.x + b.w / 2, b.y, 11);
    A.draw(ctx, pose.sprite, pose.anim, pose.frame, fx, fy, { flip, scale: art.scale, alpha: blink ? 0.45 : 1, ...lit });

    if (p.state === "charge") {
      const k = Math.min(1, p.t / ticks(800));
      ctx.strokeStyle = `rgba(232,196,90,${0.3 + 0.6 * k})`;
      ctx.lineWidth = 1 + 2 * k;
      ctx.beginPath();
      ctx.ellipse(fx, fy, 8 + 10 * k, 2 + 2 * k, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.parryActive()) {
      ctx.strokeStyle = "#e8c45a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fx + p.facing * 6, fy - (b.h * T) / 2, 16, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.state === "flask") {
      ctx.fillStyle = "rgba(224,96,90,0.7)";
      ctx.fillRect(fx - 2, fy - b.h * T - 8, 4, 6);
    }
    if (p.hang) {
      ctx.strokeStyle = "#d9cfb8";
      ctx.beginPath();
      ctx.moveTo(fx, fy - b.h * T);
      ctx.lineTo(fx, fy - b.h * T - 16);
      ctx.stroke();
    }
    if (p.state === "plunge") {
      ctx.fillStyle = "rgba(208,143,76,0.6)";
      ctx.fillRect(fx - 8, fy - b.h * T - 10, 16, 10);
    }

    const a = p.attack;
    if (a) {
      const act = p.activeBox();
      const long = a.def.box.w >= 5 && a.def.box.h <= 2.4;
      if (act) {
        const act0 = ticks(a.def.startupMs);
        const k = Math.min(1, (a.t - act0 + 1) / Math.max(1, ticks(a.def.activeMs)));
        if (long) {
          const col = sim.character === "mage" ? "rgba(150,200,255,1)" : "rgba(236,236,250,1)";
          this.beam(act.rect, p.facing, sx, sy, col, 0.95, Math.max(0.15, k), sim.character === "gino" ? "gino_dagger" : null);
        } else if (a.kind === "ultimate") {
          // A burst ring that grows to fill the real hitbox.
          const col = ULT_COLORS[sim.character] ?? "#e8c45a";
          const r = act.rect;
          const kk = 0.35 + 0.65 * k;
          const bx = sx(r.x + r.w / 2);
          const by = sy(r.y + r.h / 2);
          const rx = (r.w * T * kk) / 2;
          const ry = (r.h * T * kk) / 2;
          ctx.save();
          const g = ctx.createRadialGradient(bx, by, 2, bx, by, Math.max(rx, ry));
          g.addColorStop(0, col + "00");
          g.addColorStop(0.75, col + "33");
          g.addColorStop(1, col + "aa");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(bx, by, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = col;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        } else {
          const color = a.kind === "skill" ? "#d0c8b8" : "#f2efe6";
          this.slash(act.rect, p.facing, sx, sy, color, 0.8);
        }
      } else if (a.kind !== "plunge" && a.t < ticks(a.def.startupMs)) {
        this.box(p.boxToWorld(a.def), sx, sy, "rgba(242,239,230,0.12)");
      }
    }
    if (this.opts.debug) {
      this.box(p.rect(), sx, sy, p.isInvulnerable() ? "#ffe14a" : "#4ae0c0");
      ctx.fillStyle = "#4ae0c0";
      ctx.font = "8px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`${p.state} t${p.t} vx${b.vx.toFixed(1)} vy${b.vy.toFixed(1)} room ${sim.currentRoom}`, 6, this.vh - 6);
    }
  }
}
