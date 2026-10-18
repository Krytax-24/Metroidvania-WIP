import { DRILL_ENEMIES } from "./practice.js";
const ENEMIES = {
  husk: {
    id: "husk",
    name: "Drowned Husk",
    hp: 45,
    poise: 24,
    ichor: 60,
    speed: 2.6,
    aggro: 9,
    w: 0.9,
    h: 2.6,
    behavior: "melee",
    attacks: [
      { id: "cleave", tele: "parryable", startupMs: 520, activeMs: 120, recoveryMs: 650, damage: 14, poise: 0, box: { x: 0.2, y: -2.5, w: 2.1, h: 2.3 }, knockback: 6, hitstopMs: 60, minRange: 0, maxRange: 2.2, maxDy: 2, cooldownMs: 900, step: 1.5 }
    ]
  },
  lancer: {
    id: "lancer",
    name: "Ossuary Lancer",
    hp: 60,
    poise: 40,
    ichor: 90,
    speed: 2,
    aggro: 12,
    w: 1,
    h: 2.8,
    behavior: "charger",
    attacks: [
      { id: "charge", tele: "unparryable", startupMs: 700, activeMs: 700, recoveryMs: 900, damage: 18, poise: 0, box: { x: 0, y: -2.3, w: 1.6, h: 1.8 }, knockback: 9, hitstopMs: 70, minRange: 2, maxRange: 10, maxDy: 1.5, cooldownMs: 1600, dashSpeed: 13 }
    ]
  },
  acolyte: {
    id: "acolyte",
    name: "Candle Acolyte",
    hp: 32,
    poise: 15,
    ichor: 70,
    speed: 2.4,
    aggro: 13,
    w: 0.8,
    h: 2.4,
    behavior: "ranged",
    keepAway: 6,
    attacks: [
      { id: "bolt", tele: "parryable", startupMs: 620, activeMs: 50, recoveryMs: 600, damage: 0, poise: 0, box: { x: 0, y: 0, w: 0, h: 0 }, knockback: 5, hitstopMs: 50, minRange: 0, maxRange: 11, maxDy: 6, cooldownMs: 1400, projectile: { speed: 8.5, damage: 12, w: 0.7, h: 0.7, tele: "parryable" } }
    ]
  },
  brute: {
    id: "brute",
    name: "Penitent Brute",
    hp: 160,
    poise: 70,
    ichor: 320,
    speed: 2,
    aggro: 10,
    w: 1.4,
    h: 3.4,
    behavior: "melee",
    elite: true,
    attacks: [
      { id: "smash", tele: "parryable", startupMs: 650, activeMs: 140, recoveryMs: 800, damage: 22, poise: 0, box: { x: 0.2, y: -3.2, w: 2.7, h: 3.1 }, knockback: 9, hitstopMs: 90, minRange: 0, maxRange: 2.6, maxDy: 2.5, cooldownMs: 1200, step: 2 },
      { id: "grasp", tele: "grab", startupMs: 850, activeMs: 150, recoveryMs: 900, damage: 26, poise: 0, box: { x: 0.2, y: -3, w: 1.8, h: 2.8 }, knockback: 10, hitstopMs: 120, minRange: 0, maxRange: 1.9, maxDy: 2, cooldownMs: 2600, grabMs: 900 }
    ]
  }
};
/** The Training Yard's posts live in the same table so the simulation treats them like any enemy. */
Object.assign(ENEMIES, DRILL_ENEMIES);
const SPAWN_WEIGHTS = [
  ["husk", 5],
  ["lancer", 2.5],
  ["acolyte", 2.5]
];
export {
  ENEMIES,
  SPAWN_WEIGHTS
};
