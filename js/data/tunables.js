const SIM_HZ = 60;
const DT = 1 / SIM_HZ;
const ticks = (ms) => Math.max(1, Math.round(ms * SIM_HZ / 1e3));
const PLAYER_TUNING = {
  baseHp: 100,
  hpPerLevel: 8,
  damagePerLevel: 0.06,
  maxLevel: 15,
  coyoteMs: 100,
  jumpBufferMs: 120,
  inputBufferMs: 150,
  jumpCut: 0.5,
  /** Ledge assist: climb onto a ledge whose top is at most this far above the feet while airborne. */
  ledgeGrabTiles: 0.9,
  climbSpeed: 5,
  dodge: { durationMs: 420, iframeMs: 260, speed: 11, cooldownMs: 160 },
  parry: { windowMs: 160, whiffRecoveryMs: 400, successInvulnMs: 300, fervor: 15, incenseMs: 4e3, incenseBonus: 0.2 },
  hurt: { stunMs: 300, invulnMs: 700, knockback: 7, knockUp: 6 },
  grabbedMs: 900,
  flask: { useMs: 800, healAtMs: 480, heal: 0.35, baseCharges: 2, maxCharges: 6 },
  fervor: { max: 100, perHit: 4 },
  resolve: { max: 100, perDamageDealt: 0.15, perDamageTaken: 0.6 },
  riposte: { rangeTiles: 2.6, durationMs: 650, baseDamage: 42, bossBaseDamage: 70, hitstopMs: 170 },
  heavyChargeMs: 800,
  lastRiteHp: 0.3,
  /** Spikes and harmful liquid: share of max HP, then back to the last safe ledge. */
  hazardDamage: 0.15,
  hazardInvulnMs: 700
};
const COMBAT = {
  /** Screen shake trauma added per event (0..1). */
  shake: { light: 0.12, heavy: 0.3, parry: 0.25, hurt: 0.35, riposte: 0.45, slam: 0.5, bossDeath: 0.8 },
  enemyPoiseRegenMs: 2e3,
  enemyStaggerMs: 1200,
  bossStaggerMs: 2e3,
  enemyKnockbackDecay: 10,
  /** Damage over time from pools, smoke and tide is applied every this many ms. */
  dotIntervalMs: 500,
  reflectedBoltDamage: 30,
  /** Poise damage a parry deals to a boss. */
  bossParryPoise: 45
};
const BLIGHT = {
  /** Share of max HP per second while standing in a consumed room. */
  burnPerSec: 0.03,
  /** Ordinary enemies spawned in consumed rooms. */
  blightedEnemyDamage: 1.3,
  /** Heralds fought in consumed rooms. */
  blightedBossDamage: 1.2,
  warnSec: 60,
  /** Ichor per remaining second when the Gate is opened early, times the Tier number. */
  vigilIchorPerSec: 5,
  /** Per missing Seal at Nightfall. */
  empowerHp: 0.15,
  empowerRecovery: 0.9
};
const ECONOMY = {
  /** Ichor to reach level n+1 from level n (index 0 is level 1 to 2). */
  levelCosts: [300, 450, 650, 900, 1200, 1550, 1950, 2400, 2900, 3450, 4050, 4700, 5400, 6150],
  startCandles: 3,
  ichorCache: 400
};
const CAMERA = {
  viewW: 640,
  viewH: 360,
  tile: 16,
  /**
   * Presentation only: how much closer the camera sits than one full 640x360 cell.
   * 1 shows a whole cell; 1.4 puts the lead character at about 180 px tall on a 1080p screen (HD 2D).
   */
  zoom: 1.4,
  follow: 0.16,
  lookAhead: 2.5
};
const TIER_SCALE = {
  hp: [1, 1.45, 1.9],
  damage: [1, 1.2, 1.4],
  ichor: [1, 1.8, 2.8]
};
export {
  BLIGHT,
  CAMERA,
  COMBAT,
  DT,
  ECONOMY,
  PLAYER_TUNING,
  SIM_HZ,
  TIER_SCALE,
  ticks
};
