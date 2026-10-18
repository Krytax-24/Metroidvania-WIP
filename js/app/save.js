// The checkpoint save. One slot, versioned JSON. A checkpoint is written when the run starts a Tier,
// when the player rests at a Sanctuary and when a Tier is cleared. Continue rebuilds the same Tier from
// its seed and applies the snapshot on top, so the file stays small and can never describe an invalid map.
const SAVE_VERSION = 1;
const KEY = "save";

/** A short, human summary of a save for the Continue button. */
export function describeSave(save) {
  if (!save) return null;
  const carry = save.snapshot?.carry ?? save.carry ?? {};
  return { character: save.character, tier: save.tier, level: carry.level ?? 1, minutes: Math.floor((carry.timeSec ?? 0) / 60), seed: save.seed, savedAt: save.savedAt, mode: save.mode ?? "expedition" };
}

/** Checks that a parsed save has the shape the game needs. Returns the save, or null when it is unusable. */
function validateSave(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.v !== SAVE_VERSION) return null;
  if (typeof raw.seed !== "string" || !raw.seed) return null;
  if (!Number.isInteger(raw.tier) || raw.tier < 1 || raw.tier > 3) return null;
  if (typeof raw.character !== "string") return null;
  if (!raw.carry || typeof raw.carry !== "object") return null;
  if (raw.snapshot !== null && raw.snapshot !== undefined && typeof raw.snapshot !== "object") return null;
  return raw;
}

export class SaveSlot {
  constructor(store, clock = () => new Date().toISOString()) {
    this.store = store;
    this.clock = clock;
  }

  exists() {
    return this.read() !== null;
  }

  read() {
    return validateSave(this.store.getJson(KEY, null));
  }

  /** Writes a checkpoint. `run` is { seed, tier, character, carry, snapshot?, mode?, allAbilities? }. Returns true when it persisted. */
  write(run) {
    const data = {
      v: SAVE_VERSION,
      savedAt: this.clock(),
      seed: run.seed,
      tier: run.tier,
      character: run.character,
      carry: run.carry,
      snapshot: run.snapshot ?? null,
      mode: run.mode === "prologue" ? "prologue" : "expedition",
      allAbilities: !!run.allAbilities
    };
    return this.store.setJson(KEY, data);
  }

  delete() {
    this.store.remove(KEY);
  }
}

/** Practice progress is kept apart from the run save: it belongs to the player, not to a run. */
export class PracticeLog {
  constructor(store) {
    this.store = store;
  }

  all() {
    const v = this.store.getJson("practice", {});
    return v && typeof v === "object" ? v : {};
  }

  done(character) {
    return this.all()[character] ?? {};
  }

  mark(character, drillId) {
    const all = this.all();
    all[character] = { ...(all[character] ?? {}), [drillId]: true };
    this.store.setJson("practice", all);
  }

  reset(character) {
    const all = this.all();
    delete all[character];
    this.store.setJson("practice", all);
  }
}

/** Small cross-run record: seen cutscenes, best Tier reached, completions. */
export class Profile {
  constructor(store) {
    this.store = store;
  }

  data() {
    const v = this.store.getJson("profile", {});
    return v && typeof v === "object" ? v : {};
  }

  has(flag) {
    return !!this.data().flags?.[flag];
  }

  setFlag(flag) {
    const d = this.data();
    d.flags = { ...(d.flags ?? {}), [flag]: true };
    this.store.setJson("profile", d);
  }

  bump(stat, n = 1) {
    const d = this.data();
    d.stats = { ...(d.stats ?? {}), [stat]: (d.stats?.[stat] ?? 0) + n };
    this.store.setJson("profile", d);
  }

  best(stat, value) {
    const d = this.data();
    if ((d.stats?.[stat] ?? 0) >= value) return;
    d.stats = { ...(d.stats ?? {}), [stat]: value };
    this.store.setJson("profile", d);
  }

  stat(stat) {
    return this.data().stats?.[stat] ?? 0;
  }
}
