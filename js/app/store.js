// Safe key-value storage. localStorage can be missing, full or blocked (private windows, embedded
// previews), so every call is wrapped and an in-memory map keeps the session working either way.
const PREFIX = "aa.";

export class Store {
  /** @param {Storage|null} backend  Defaults to window.localStorage when reachable. */
  constructor(backend) {
    this.mem = new Map();
    this.backend = backend === undefined ? Store.detect() : backend;
  }

  static detect() {
    try {
      const probe = "__aa_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch {
      return null;
    }
  }

  /** True when values survive a reload. */
  get persistent() {
    return !!this.backend;
  }

  get(key, fallback = null) {
    try {
      const v = this.backend ? this.backend.getItem(PREFIX + key) : this.mem.get(key);
      return v === undefined || v === null ? fallback : v;
    } catch {
      return this.mem.has(key) ? this.mem.get(key) : fallback;
    }
  }

  set(key, value) {
    const text = String(value);
    this.mem.set(key, text);
    try {
      if (this.backend) this.backend.setItem(PREFIX + key, text);
      return true;
    } catch {
      return false;
    }
  }

  remove(key) {
    this.mem.delete(key);
    try {
      this.backend?.removeItem(PREFIX + key);
    } catch {
      /* storage unavailable */
    }
  }

  getJson(key, fallback = null) {
    const raw = this.get(key, null);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  setJson(key, value) {
    return this.set(key, JSON.stringify(value));
  }
}
