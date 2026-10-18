// Character kits. Every number lives here; the sim reads the active kit through Player.kit.
// The body, jump and run numbers stay shared (PLAYER in gen/physics.js) so the map validator holds for everyone.
import { THURIFER } from "./moves.js";

const clone = (o) => JSON.parse(JSON.stringify(o));
const box = (x, y, w, h, extra = {}) => ({ x, y, w, h, ...extra });

// Gino: quick dagger duelist. Short reach, fast chains, a thrown dagger as the skill.
const GINO = clone(THURIFER);
Object.assign(GINO, {
  id: "gino",
  name: "Gino",
  title: "The Quick Blade",
  blurb: "Fast three-hit chains, short reach, a thrown dagger.",
});
GINO.light = [
  { id: "light1", startupMs: 70, activeMs: 70, recoveryMs: 190, damage: 10, poise: 8, box: box(0.1, -2.6, 2.0, 2.2), knockback: 2.5, hitstopMs: 40, step: 2.5, chainAfterMs: 50, shake: 0.06 },
  { id: "light2", startupMs: 70, activeMs: 70, recoveryMs: 200, damage: 11, poise: 9, box: box(0.1, -2.6, 2.0, 2.2), knockback: 2.5, hitstopMs: 40, step: 2.5, chainAfterMs: 55, shake: 0.06 },
  { id: "light3", startupMs: 130, activeMs: 100, recoveryMs: 320, damage: 18, poise: 22, box: box(0.1, -2.9, 2.5, 2.6), knockback: 6, hitstopMs: 70, step: 4, shake: 0.14 },
];
GINO.air = { ...GINO.air, startupMs: 60, damage: 9 };
GINO.heavy = { ...GINO.heavy, startupMs: 140, recoveryMs: 380, damage: 24, box: box(0, -3.1, 2.9, 3.1) };
GINO.skill = {
  name: "Thrown Dagger",
  cost: 28,
  attack: { id: "skill", startupMs: 150, activeMs: 140, recoveryMs: 300, damage: 26, poise: 30, box: box(0.5, -2.9, 8.5, 1.0), knockback: 6, hitstopMs: 70, shake: 0.18 },
  smoke: null,
};
GINO.ultimate = {
  name: "Rain of Steel",
  invulnMs: 1500,
  attack: { id: "ultimate", startupMs: 360, activeMs: 300, recoveryMs: 480, damage: 84, poise: 110, box: box(0, -6.5, 11, 8, { centered: true }), knockback: 11, hitstopMs: 150, shake: 0.55 },
};

// Knight: slow, heavy, wide arcs. Strongest light chain, longest recovery.
const KNIGHT = clone(THURIFER);
Object.assign(KNIGHT, {
  id: "knight",
  name: "Knight",
  title: "The Bulwark",
  blurb: "Heavy wide swings, strong poise damage, a shield bash skill.",
});
KNIGHT.light = [
  { id: "light1", startupMs: 110, activeMs: 90, recoveryMs: 260, damage: 14, poise: 14, box: box(0.1, -2.8, 2.6, 2.6), knockback: 3.5, hitstopMs: 55, step: 1.5, chainAfterMs: 70, shake: 0.1 },
  { id: "light2", startupMs: 120, activeMs: 90, recoveryMs: 280, damage: 15, poise: 15, box: box(0.1, -2.8, 2.6, 2.6), knockback: 3.5, hitstopMs: 55, step: 1.5, chainAfterMs: 75, shake: 0.1 },
  { id: "light3", startupMs: 200, activeMs: 120, recoveryMs: 420, damage: 24, poise: 32, box: box(0.1, -3.1, 3.1, 3.0), knockback: 8, hitstopMs: 90, step: 3, shake: 0.2 },
];
KNIGHT.air = { ...KNIGHT.air, damage: 12, box: box(-0.4, -3.2, 3.0, 3.3) };
KNIGHT.heavy = { ...KNIGHT.heavy, startupMs: 190, recoveryMs: 460, damage: 30, poise: 40, box: box(0, -3.4, 3.5, 3.4) };
KNIGHT.skill = {
  name: "Shield Bash",
  cost: 33,
  attack: { id: "skill", startupMs: 190, activeMs: 150, recoveryMs: 340, damage: 28, poise: 55, box: box(-0.5, -3.6, 4.2, 3.8), knockback: 9, hitstopMs: 100, shake: 0.28 },
  smoke: null,
};
KNIGHT.ultimate = {
  name: "Oathbreaker",
  invulnMs: 1500,
  attack: { id: "ultimate", startupMs: 420, activeMs: 300, recoveryMs: 520, damage: 96, poise: 130, box: box(0, -7, 12, 9, { centered: true }), knockback: 12, hitstopMs: 170, shake: 0.65 },
};

// Mage: long thin beams. Low damage per hit, the best reach, a slowing cloud skill.
const MAGE = clone(THURIFER);
Object.assign(MAGE, {
  id: "mage",
  name: "Mage",
  title: "The Far Hand",
  blurb: "Long reach bolts, light poise damage, a lingering arcane cloud.",
});
MAGE.light = [
  { id: "light1", startupMs: 130, activeMs: 80, recoveryMs: 240, damage: 9, poise: 6, box: box(0.4, -2.3, 5.5, 0.9), knockback: 2, hitstopMs: 35, step: 0, chainAfterMs: 70, shake: 0.05 },
  { id: "light2", startupMs: 130, activeMs: 80, recoveryMs: 250, damage: 10, poise: 7, box: box(0.4, -2.3, 5.5, 0.9), knockback: 2, hitstopMs: 35, step: 0, chainAfterMs: 75, shake: 0.05 },
  { id: "light3", startupMs: 200, activeMs: 120, recoveryMs: 360, damage: 17, poise: 20, box: box(0.4, -2.6, 6.5, 1.6), knockback: 6, hitstopMs: 70, step: 0, shake: 0.14 },
];
MAGE.air = { ...MAGE.air, damage: 9, box: box(-0.2, -2.9, 5.2, 1.4) };
MAGE.heavy = { ...MAGE.heavy, startupMs: 180, recoveryMs: 440, damage: 24, poise: 26, box: box(0, -3.0, 8.0, 2.2), step: 0 };
MAGE.skill = {
  name: "Arcane Cloud",
  cost: 30,
  attack: { id: "skill", startupMs: 200, activeMs: 140, recoveryMs: 320, damage: 20, poise: 25, box: box(0.5, -3.0, 7.0, 1.8), knockback: 5, hitstopMs: 70, shake: 0.2 },
  smoke: { durationMs: 3500, damage: 5, w: 5, h: 3, forward: 4 },
};
MAGE.ultimate = {
  name: "Starfall",
  invulnMs: 1500,
  attack: { id: "ultimate", startupMs: 420, activeMs: 320, recoveryMs: 500, damage: 90, poise: 120, box: box(0, -8, 16, 10, { centered: true }), knockback: 12, hitstopMs: 160, shake: 0.6 },
};

const KITS = { gino: GINO, knight: KNIGHT, mage: MAGE };
const KIT_ORDER = ["gino", "knight", "mage"];
export { KITS, KIT_ORDER };
