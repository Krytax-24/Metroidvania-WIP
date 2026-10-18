const THURIFER = {
  name: "Nartaki",
  light: [
    { id: "light1", startupMs: 90, activeMs: 80, recoveryMs: 230, damage: 12, poise: 10, box: { x: 0.1, y: -2.7, w: 2.3, h: 2.4 }, knockback: 3, hitstopMs: 50, step: 2, chainAfterMs: 60, shake: 0.08 },
    { id: "light2", startupMs: 100, activeMs: 80, recoveryMs: 250, damage: 13, poise: 12, box: { x: 0.1, y: -2.7, w: 2.3, h: 2.4 }, knockback: 3, hitstopMs: 50, step: 2, chainAfterMs: 70, shake: 0.08 },
    { id: "light3", startupMs: 170, activeMs: 110, recoveryMs: 380, damage: 20, poise: 25, box: { x: 0.1, y: -3, w: 2.7, h: 2.8 }, knockback: 7, hitstopMs: 80, step: 4, shake: 0.16 }
  ],
  air: { id: "air", startupMs: 80, activeMs: 120, recoveryMs: 180, damage: 10, poise: 8, box: { x: -0.4, y: -3.1, w: 2.8, h: 3.2 }, knockback: 3, hitstopMs: 45, shake: 0.06 },
  heavy: { id: "heavy", startupMs: 160, activeMs: 120, recoveryMs: 420, damage: 26, poise: 30, box: { x: 0, y: -3.3, w: 3.1, h: 3.3 }, knockback: 9, hitstopMs: 90, step: 3, shake: 0.25 },
  /** Added at full charge. */
  heavyCharged: { damage: 24, poise: 30, hitstopMs: 40 },
  plunge: { id: "plunge", startupMs: 120, activeMs: 50, recoveryMs: 300, damage: 22, poise: 30, box: { x: 0, y: -1.6, w: 5, h: 1.8, centered: true }, knockback: 6, hitstopMs: 80, shake: 0.3 },
  plungeSpeed: 30,
  skill: {
    name: "Four-Hand Mudra",
    cost: 33,
    attack: { id: "skill", startupMs: 200, activeMs: 160, recoveryMs: 340, damage: 30, poise: 40, box: { x: -1, y: -3.8, w: 4.8, h: 4 }, knockback: 8, hitstopMs: 90, shake: 0.25 },
    smoke: { durationMs: 3e3, damage: 4, w: 4, h: 3, forward: 2 }
  },
  ultimate: {
    name: "Dance of Ruin",
    invulnMs: 1500,
    attack: { id: "ultimate", startupMs: 400, activeMs: 300, recoveryMs: 500, damage: 90, poise: 120, box: { x: 0, y: -7, w: 12, h: 9, centered: true }, knockback: 12, hitstopMs: 160, shake: 0.6 }
  }
};
export {
  THURIFER
};
