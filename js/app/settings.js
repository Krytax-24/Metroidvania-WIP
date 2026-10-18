// Player settings: one JSON blob, schema-versioned, with a migration from the pre-settings keys.
const SETTINGS_VERSION = 2;

const DEFAULT_SETTINGS = Object.freeze({
  master: 0.7,
  music: 0.6,
  sfx: 0.8,
  shake: 1,
  damageNumbers: true,
  zoom: 1.4,
  touch: "auto", // "auto" | "on" | "off"
  touchScale: 1,
  rumble: true,
  mouse: true,
  flashes: true,
  hints: true
});

const RANGES = {
  master: [0, 1],
  music: [0, 1],
  sfx: [0, 1],
  shake: [0, 1],
  zoom: [1, 2],
  touchScale: [0.8, 1.4]
};

/** Clamps and coerces one value to what the setting allows; falls back to the default when it is nonsense. */
function cleanSetting(key, value) {
  const def = DEFAULT_SETTINGS[key];
  if (def === undefined) return undefined;
  if (typeof def === "boolean") return typeof value === "boolean" ? value : def;
  if (typeof def === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) return def;
    const [lo, hi] = RANGES[key] ?? [-Infinity, Infinity];
    return Math.min(hi, Math.max(lo, n));
  }
  if (key === "touch") return ["auto", "on", "off"].includes(value) ? value : def;
  return def;
}

export class Settings {
  constructor(store) {
    this.store = store;
    this.values = { ...DEFAULT_SETTINGS };
    this.listeners = new Set();
    this.load();
  }

  load() {
    const saved = this.store.getJson("settings", null);
    if (saved && typeof saved === "object") {
      for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in saved) this.values[k] = cleanSetting(k, saved[k]);
      return;
    }
    // Pre-settings keys from the first builds.
    const old = { vol: this.store.get("vol"), shake: this.store.get("shake"), zoom: this.store.get("zoom"), dmg: this.store.get("dmg") };
    if (old.vol !== null) this.values.master = cleanSetting("master", old.vol);
    if (old.shake !== null) this.values.shake = cleanSetting("shake", old.shake);
    if (old.zoom !== null) this.values.zoom = cleanSetting("zoom", old.zoom);
    if (old.dmg !== null) this.values.damageNumbers = old.dmg !== "0";
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    const v = cleanSetting(key, value);
    if (v === undefined || this.values[key] === v) return;
    this.values[key] = v;
    this.persist();
    for (const fn of this.listeners) fn(key, v, this.values);
  }

  reset() {
    this.values = { ...DEFAULT_SETTINGS };
    this.persist();
    for (const fn of this.listeners) fn("*", null, this.values);
  }

  persist() {
    this.store.setJson("settings", { v: SETTINGS_VERSION, ...this.values });
  }

  /** Calls fn(key, value, all) on every change. Returns an unsubscribe function. */
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
