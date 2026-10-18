const PLAYER = {
  gravity: 60,
  jumpHeight: 4.6,
  runSpeed: 8.5,
  maxFall: 20,
  doubleJumpHeight: 3.6,
  dashSpeed: 28,
  dashTime: 0.26,
  hookRadius: 10,
  bodyW: 0.8,
  bodyH: 2.8,
  dt: 1 / 60,
  maxTicks: 600
};
const CONSERVATIVE = {
  ...PLAYER,
  jumpHeight: 4.35,
  runSpeed: 8,
  doubleJumpHeight: 3.35,
  dashTime: 0.25,
  hookRadius: 9.5,
  dt: 1 / 30,
  maxTicks: 100
};
const GENEROUS = {
  ...PLAYER,
  jumpHeight: 5.2,
  runSpeed: 9.5,
  doubleJumpHeight: 4.2,
  dashTime: 0.3,
  hookRadius: 11,
  bodyW: 0.7,
  bodyH: 2.6,
  dt: 1 / 30,
  maxTicks: 100
};
const jumpVelocity = (m, height) => {
  const a = m.gravity * m.dt / 2;
  return a + Math.sqrt(a * a + 2 * m.gravity * height);
};
export {
  CONSERVATIVE,
  GENEROUS,
  PLAYER,
  jumpVelocity
};
