const ACTIONS = ["left", "right", "up", "down", "jump", "attack", "heavy", "dodge", "parry", "skill", "ultimate", "flask", "interact", "grapple", "toll"];
function emptyInput() {
  const z = () => Object.fromEntries(ACTIONS.map((a) => [a, false]));
  return { held: z(), pressed: z(), released: z() };
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export {
  ACTIONS,
  emptyInput,
  overlap
};
