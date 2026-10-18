// Maps simulation states to sprite animations. Pure presentation: nothing here changes game state.
import { ticks } from "../data/tunables.js";

/** Art per playable character. `native` is the way the sheet faces (1 = right). */
export const CHAR_ART = {
  gino: { sprite: "gino", scale: 1.25, native: 1, fit: 1.25 },
  knight: { sprite: "knight", scale: 1.25, native: 1, fit: 0.5, outline: false },
  mage: { sprite: "mage", scale: 0.68, native: 1, fit: 1, fxSprite: "mage_fx" }
};

/** Enemy skins. Several enemy ids have two looks, picked by enemy id so a room stays varied but stable. */
const ENEMY_ART = {
  husk: [
    { sprite: "imp", scale: 1.5, native: -1, fit: 1.3, biomes: ["undercroft", "midreach"] },
    { sprite: "rg_skeleton", scale: 1.55, native: 1, fit: 0.9 },
    { sprite: "mushroom", scale: 1.15, native: 1, fit: 1.5, biomes: ["summit"] }
  ],
  lancer: [
    { sprite: "plague", scale: 1, native: 1, fit: 0.8, biomes: ["undercroft"] },
    { sprite: "knight_hollow", scale: 0.7, native: 1, fit: 0.5, biomes: ["midreach"] },
    { sprite: "knight_blight", scale: 0.7, native: 1, fit: 0.5, biomes: ["summit"] }
  ],
  acolyte: [
    { sprite: "bat", scale: 1.5, native: -1, lift: 6, fit: 1.6, biomes: ["undercroft"] },
    { sprite: "rg_cultist", scale: 1.3, native: 1, fit: 0.9, biomes: ["midreach", "summit"] }
  ],
  brute: [{ sprite: "worm", scale: 1, native: -1, fit: 1 }, { sprite: "chomper", scale: 1.2, native: 1, fit: 1.5 }]
};

const BOSS_ART = {
  herald: [
    { sprite: "fire_mage", scale: 1, native: -1, fit: 0.9 },
    { sprite: "lightning_mage", scale: 1, native: 1, fit: 0.9, biomes: ["undercroft", "midreach"] },
    { sprite: "plague", scale: 1.3, native: 1, fit: 0.8, biomes: ["summit"] },
    { sprite: "rg_reaper", scale: 2.1, native: 1, fit: 0.8, biomes: ["midreach", "summit"] }
  ],
  // One distinct warden per Tier so the three finales never look alike.
  warden: [
    { sprite: "plague", scale: 1.6, native: 1, fit: 0.7 },
    { sprite: "worm", scale: 1.7, native: -1, fit: 0.8 },
    { sprite: "lightning_mage", scale: 1.6, native: 1, fit: 0.7 }
  ]
};

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
export const bossSkin = (boss, tier = 1, biome = "undercroft") => {
  const all = BOSS_ART[boss.def.id] ?? BOSS_ART.herald;
  if (boss.def.id === "warden") return all[Math.max(0, Math.min(all.length - 1, tier - 1))];
  const list = all.filter((s) => !s.biomes || s.biomes.includes(biome));
  const pool = list.length ? list : all;
  return pool[hash(boss.name) % pool.length];
};
export const enemySkin = (enemy, biome = "undercroft") => {
  const all = ENEMY_ART[enemy.def.id] ?? ENEMY_ART.husk;
  const list = all.filter((s) => !s.biomes || s.biomes.includes(biome));
  const pool = list.length ? list : all;
  return pool[enemy.id % pool.length];
};

/**
 * Which sprite, animation and frame to show for the player. Returns { sprite, anim, frame, ghost }.
 * `ms` is a free-running clock for looping animations.
 */
export function playerPose(assets, charId, p, ms) {
  const art = CHAR_ART[charId];
  const S = art.sprite;
  const pick = (...n) => assets.pick(S, ...n);
  const loop = (anim) => ({ sprite: S, anim, frame: assets.frameAt(S, anim, ms) });
  const prog = (anim, k, sprite = S) => ({ sprite, anim, frame: assets.frameAtProgress(sprite, anim, k) });
  const b = p.body;
  const total = (def, tail = 0.5) => ticks(def.startupMs) + ticks(def.activeMs) + ticks(def.recoveryMs) * tail;

  switch (p.state) {
    case "dead":
      return prog(pick("death", "hit"), Math.min(1, p.t / 60));
    case "hurt":
    case "grabbed":
      return prog(pick("hit", "idle"), Math.min(1, p.t / ticks(300)));
    case "dodge": {
      const slide = pick("slide");
      if (slide) return { ...prog(slide, p.t / ticks(420)), ghost: true };
      return { ...loop(pick("run", "walk", "idle")), ghost: true };
    }
    case "airdash":
      return { ...loop(pick("slide", "air", "run")), ghost: true };
    case "parry": {
      const blk = pick("block");
      if (blk) return prog(blk, Math.min(1, p.t / ticks(250)));
      return prog(pick("land", "idle"), 0);
    }
    case "flask":
      return loop(pick("idle"));
    case "charge": {
      const k = Math.min(1, p.t / ticks(800));
      const ch = pick("charge");
      if (ch) return loop(ch);
      const hv = pick("heavy", "atk3", "atk2");
      return prog(hv, k * 0.35);
    }
    case "riposte":
      return prog(pick("atk3", "heavy", "atk2", "atk1"), Math.min(1, p.t / ticks(450)));
    case "plunge": {
      const a = pick("air_atk", "fall", "air");
      return prog(a, 0.55);
    }
    case "cling":
    case "hang": {
      const l = pick("ledge");
      return l ? loop(l) : prog(pick("air", "idle"), 0);
    }
    case "attack": {
      const a = p.attack;
      if (!a) return loop(pick("idle"));
      const k = Math.min(1, a.t / total(a.def));
      let anim;
      let sprite = S;
      switch (a.kind) {
        case "light":
          anim = pick(`atk${Math.min(3, p.comboIndex + 1)}`, "atk1");
          break;
        case "air":
          anim = pick("air_atk", "atk2", "atk1");
          break;
        case "heavy":
          anim = pick("heavy", "atk3", "atk2", "atk1");
          break;
        case "skill":
          if (art.fxSprite && assets.pick(art.fxSprite, "arrow")) {
            sprite = art.fxSprite;
            anim = "arrow";
          } else anim = pick("throw", "atk3", "atk2", "atk1");
          break;
        case "ultimate":
          if (art.fxSprite && assets.pick(art.fxSprite, "sphere")) {
            sprite = art.fxSprite;
            anim = "sphere";
          } else anim = pick("heavy", "atk3", "atk2", "atk1");
          break;
        default:
          anim = pick("atk1", "idle");
      }
      return prog(anim, k, sprite);
    }
    default: {
      if (b.grounded) {
        if (Math.abs(b.vx) > 0.6) return loop(pick("run", "walk", "idle"));
        return loop(pick("idle"));
      }
      if (b.vy < -5) return prog(pick("jump_start", "air"), Math.min(1, (b.vy + 12) / -7 + 0.2));
      if (b.vy > 3) return loop(pick("fall", "air"));
      return loop(pick("air", "fall", "idle"));
    }
  }
}

/** Enemy pose from its state machine. */
export function enemyPose(assets, enemy, skin, ms) {
  const S = skin.sprite;
  const pick = (...n) => assets.pick(S, ...n);
  const loop = (anim) => ({ sprite: S, anim, frame: assets.frameAt(S, anim, ms + enemy.id * 137) });
  const prog = (anim, k) => ({ sprite: S, anim, frame: assets.frameAtProgress(S, anim, k) });
  const a = enemy.attack;
  switch (enemy.state) {
    case "windup":
      return prog(pick("attack"), 0.45 * Math.min(1, enemy.t / ticks(a.startupMs)));
    case "active":
      return prog(pick("attack"), 0.45 + 0.3 * Math.min(1, enemy.t / ticks(a.activeMs)));
    case "recover":
      return prog(pick("attack"), 0.75 + 0.25 * Math.min(1, enemy.t / ticks(a.recoveryMs)));
    case "stagger":
      return { sprite: S, anim: pick("hit", "stun"), frame: assets.frameAt(S, pick("hit", "stun"), enemy.t * 16.7) };
    case "dead":
      return prog(pick("death", "hit"), 1);
    case "chase":
    case "patrol":
      return Math.abs(enemy.body.vx) > 0.3 ? loop(pick("walk", "move", "idle")) : loop(pick("idle"));
    default:
      return loop(pick("idle"));
  }
}

/** Boss pose from its step script. */
export function bossPose(assets, boss, skin, ms) {
  const S = skin.sprite;
  const pick = (...n) => assets.pick(S, ...n);
  const loop = (anim) => ({ sprite: S, anim, frame: assets.frameAt(S, anim, ms) });
  const prog = (anim, k) => ({ sprite: S, anim, frame: assets.frameAtProgress(S, anim, k) });
  if (boss.state === "stagger") return loop(pick("hit", "idle"));
  if (boss.state === "dead") return prog(pick("death", "hit"), 1);
  if (boss.leap) return loop(pick("air", "attack", "idle"));
  if (boss.state === "attack") {
    const s = boss.step;
    if (s) {
      const ms = s.ms ?? 300;
      const k = Math.min(1, boss.stepT / ticks(ms));
      if (s.t === "windup") return boss.def.id === "warden" ? prog(pick("attack", "atk1", "atk2"), 0.4 * k) : loop(pick("charge", "atk2", "idle"));
      if (s.t === "hit" || s.t === "dash") return prog(pick("attack", "atk1", "flame"), 0.4 + 0.6 * k);
      if (s.t === "recover") return loop(pick("idle"));
    }
    return loop(pick("atk1", "attack", "idle"));
  }
  return Math.abs(boss.body.vx) > 0.4 ? loop(pick("walk", "run", "idle")) : loop(pick("idle"));
}
