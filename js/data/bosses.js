const sweepBox = { x: -0.6, y: -3.5, w: 4.6, h: 3.3 };
const HERALD = {
  id: "herald",
  hp: 1100,
  poise: 160,
  ichor: 1500,
  w: 1.6,
  h: 3.6,
  speed: 3.4,
  preferRange: 3,
  phases: [1, 0.5],
  phaseRecovery: [1, 0.8],
  attacks: [
    {
      id: "sweep",
      weight: 3,
      minRange: 0,
      maxRange: 3.6,
      cooldownMs: 1100,
      phases: [0, 1],
      steps: [
        { t: "face" },
        { t: "windup", ms: 550, tele: "parryable" },
        { t: "hit", ms: 140, box: sweepBox, damage: 18, knockback: 8, tele: "parryable" },
        { t: "recover", ms: 700 }
      ]
    },
    {
      id: "twin-sweep",
      weight: 3,
      minRange: 0,
      maxRange: 3.6,
      cooldownMs: 1800,
      phases: [1],
      steps: [
        { t: "face" },
        { t: "windup", ms: 500, tele: "parryable" },
        { t: "hit", ms: 120, box: sweepBox, damage: 16, knockback: 6, tele: "parryable" },
        { t: "face" },
        { t: "windup", ms: 380, tele: "parryable" },
        { t: "hit", ms: 120, box: sweepBox, damage: 16, knockback: 8, tele: "parryable" },
        { t: "recover", ms: 800 }
      ]
    },
    {
      id: "lunge",
      weight: 2,
      minRange: 4,
      maxRange: 16,
      cooldownMs: 2400,
      phases: [0, 1],
      steps: [
        { t: "face" },
        { t: "windup", ms: 700, tele: "unparryable" },
        { t: "dash", ms: 450, speed: 18, box: { x: 0, y: -3.1, w: 2, h: 3 }, damage: 22, knockback: 10, tele: "unparryable" },
        { t: "recover", ms: 900 }
      ]
    },
    {
      id: "ember-rain",
      weight: 2,
      minRange: 0,
      maxRange: 30,
      cooldownMs: 5200,
      phases: [0],
      steps: [
        { t: "windup", ms: 800, tele: "blight" },
        { t: "spawn", kind: "embers", count: 4, spread: 7, markMs: 700, impactDamage: 14, poolMs: 2500, poolDamage: 6 },
        { t: "recover", ms: 600 }
      ]
    },
    {
      id: "ember-storm",
      weight: 2,
      minRange: 0,
      maxRange: 30,
      cooldownMs: 5e3,
      phases: [1],
      steps: [
        { t: "windup", ms: 800, tele: "blight" },
        { t: "spawn", kind: "embers", count: 7, spread: 10, markMs: 700, impactDamage: 14, poolMs: 2500, poolDamage: 6 },
        { t: "recover", ms: 500 }
      ]
    }
  ]
};
const crozierBox = { x: -1, y: -4.6, w: 5.6, h: 4.6 };
const WARDEN = {
  id: "warden",
  hp: 2600,
  poise: 260,
  ichor: 4e3,
  w: 2.4,
  h: 4.6,
  speed: 2.4,
  preferRange: 3.5,
  phases: [1, 0.66, 0.33],
  phaseRecovery: [1, 0.9, 0.75],
  attacks: [
    {
      id: "crozier",
      weight: 3,
      minRange: 0,
      maxRange: 4.8,
      cooldownMs: 1300,
      phases: [0, 1, 2],
      steps: [
        { t: "face" },
        { t: "windup", ms: 650, tele: "parryable" },
        { t: "hit", ms: 160, box: crozierBox, damage: 22, knockback: 10, tele: "parryable" },
        { t: "recover", ms: 800 }
      ]
    },
    {
      id: "slam",
      weight: 2,
      minRange: 0,
      maxRange: 30,
      cooldownMs: 3200,
      phases: [0, 1, 2],
      steps: [
        { t: "face" },
        { t: "windup", ms: 900, tele: "unparryable" },
        { t: "leap", ms: 600, height: 6 },
        { t: "hit", ms: 100, box: { x: 0, y: -2, w: 6, h: 2.2, centered: true }, damage: 26, knockback: 12, tele: "unparryable", hitstopMs: 100 },
        { t: "spawn", kind: "shockwave", speed: 9, damage: 16, lifeMs: 2200 },
        { t: "recover", ms: 1e3 }
      ]
    },
    {
      id: "tide",
      weight: 1.5,
      minRange: 0,
      maxRange: 30,
      cooldownMs: 7e3,
      phases: [1, 2],
      steps: [
        { t: "windup", ms: 400, tele: "blight" },
        { t: "spawn", kind: "tide", armMs: 1e3, lifeMs: 3e3, damage: 10, height: 2.2 },
        { t: "recover", ms: 700 }
      ]
    },
    {
      id: "grasp",
      weight: 2,
      minRange: 0,
      maxRange: 2.6,
      cooldownMs: 3e3,
      phases: [1, 2],
      steps: [
        { t: "face" },
        { t: "windup", ms: 850, tele: "grab" },
        { t: "hit", ms: 160, box: { x: 0.2, y: -3.6, w: 2.4, h: 3.4 }, damage: 32, knockback: 12, tele: "grab", grabMs: 1e3, hitstopMs: 140 },
        { t: "recover", ms: 900 }
      ]
    },
    {
      id: "judgement",
      weight: 2.5,
      minRange: 0,
      maxRange: 4.8,
      cooldownMs: 4200,
      phases: [2],
      steps: [
        { t: "face" },
        { t: "windup", ms: 600, tele: "parryable" },
        { t: "hit", ms: 150, box: crozierBox, damage: 20, knockback: 8, tele: "parryable" },
        { t: "windup", ms: 700, tele: "unparryable" },
        { t: "leap", ms: 550, height: 5 },
        { t: "hit", ms: 100, box: { x: 0, y: -2, w: 6, h: 2.2, centered: true }, damage: 24, knockback: 12, tele: "unparryable", hitstopMs: 100 },
        { t: "spawn", kind: "shockwave", speed: 10, damage: 16, lifeMs: 2200 },
        { t: "recover", ms: 1200 }
      ]
    }
  ]
};
export {
  HERALD,
  WARDEN
};
