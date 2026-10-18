// Rebindable controls. Keyboard bindings are stored as KeyboardEvent.code so they follow the physical
// key on AZERTY, QWERTZ and Dvorak layouts. Gamepad bindings are standard-mapping button indices.

/** Gameplay actions the simulation understands, in the order the controls screen lists them. */
export const ACTION_INFO = [
  { id: "left", label: "Move left", group: "Movement" },
  { id: "right", label: "Move right", group: "Movement" },
  { id: "up", label: "Climb up, look up", group: "Movement" },
  { id: "down", label: "Crouch, drop through, plunge", group: "Movement" },
  { id: "jump", label: "Jump", group: "Movement" },
  { id: "dodge", label: "Dodge, air dash", group: "Combat" },
  { id: "attack", label: "Attack", group: "Combat" },
  { id: "heavy", label: "Heavy attack", group: "Combat" },
  { id: "parry", label: "Parry", group: "Combat" },
  { id: "skill", label: "Skill", group: "Combat" },
  { id: "ultimate", label: "Ultimate", group: "Combat" },
  { id: "flask", label: "Ember Flask", group: "World" },
  { id: "interact", label: "Interact", group: "World" },
  { id: "grapple", label: "Grapple", group: "World" },
  { id: "toll", label: "Bell Toll", group: "World" },
  { id: "pause", label: "Pause", group: "Menus", meta: true, lockedFirst: true },
  { id: "map", label: "Map", group: "Menus", meta: true },
  { id: "journal", label: "Journal", group: "Menus", meta: true },
  { id: "fullscreen", label: "Fullscreen", group: "Menus", meta: true }
];

const DEFAULT_KEYS = Object.freeze({
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  jump: ["Space", ""],
  dodge: ["KeyL", "ShiftLeft"],
  attack: ["KeyJ", "KeyZ"],
  heavy: ["KeyK", "KeyX"],
  parry: ["KeyI", "KeyC"],
  skill: ["KeyU", "KeyV"],
  ultimate: ["KeyO", "KeyB"],
  flask: ["KeyQ", ""],
  interact: ["KeyE", ""],
  grapple: ["KeyF", ""],
  toll: ["KeyG", ""],
  pause: ["Escape", "KeyP"],
  map: ["KeyM", "Tab"],
  journal: ["KeyN", ""],
  fullscreen: ["F10", ""]
});

/** Standard-mapping gamepad buttons. null means unbound. */
export const DEFAULT_PAD = Object.freeze({
  jump: 0,
  dodge: 1,
  attack: 2,
  heavy: 3,
  parry: 4,
  skill: 5,
  flask: 6,
  ultimate: 7,
  toll: 10,
  grapple: 11,
  interact: 12,
  pause: 9,
  map: 8
});

/** Pad actions the player may rebind (movement stays on the stick and D-pad). */
export const PAD_ACTIONS = ["jump", "dodge", "attack", "heavy", "parry", "skill", "ultimate", "flask", "interact", "grapple", "toll", "pause", "map"];

/** Keys that can never be bound: the game owns them. */
const RESERVED_CODES = new Set(["Escape", "F1", "F2", "F5", "F12", "MetaLeft", "MetaRight", "ContextMenu"]);

const PAD_NAMES = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "Back", "Start", "L3", "R3", "D-pad up", "D-pad down", "D-pad left", "D-pad right", "Home"];

const PRETTY = {
  Space: "Space", Escape: "Esc", Tab: "Tab", Enter: "Enter", Backspace: "Backspace", ShiftLeft: "Shift", ShiftRight: "Right Shift",
  ControlLeft: "Ctrl", ControlRight: "Right Ctrl", AltLeft: "Alt", AltRight: "Right Alt", ArrowLeft: "←", ArrowRight: "→",
  ArrowUp: "↑", ArrowDown: "↓", Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", CapsLock: "Caps", Delete: "Del", Insert: "Ins", PageUp: "PgUp", PageDown: "PgDn"
};

/** A short, readable name for a KeyboardEvent.code. */
export function codeLabel(code) {
  if (!code) return "Unbound";
  if (PRETTY[code]) return PRETTY[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
  return code;
}

export function padLabel(i) {
  if (i === null || i === undefined) return "Unbound";
  return PAD_NAMES[i] ?? `Button ${i}`;
}

const clone = (o) => JSON.parse(JSON.stringify(o));

export class Keybinds {
  constructor(store) {
    this.store = store;
    this.keys = clone(DEFAULT_KEYS);
    this.pad = clone(DEFAULT_PAD);
    this.listeners = new Set();
    this.rebuild();
    this.load();
  }

  load() {
    const saved = this.store.getJson("binds", null);
    if (!saved || typeof saved !== "object") return;
    for (const a of ACTION_INFO) {
      const k = saved.keys?.[a.id];
      if (Array.isArray(k)) {
        const slots = [typeof k[0] === "string" ? k[0] : "", typeof k[1] === "string" ? k[1] : ""];
        this.keys[a.id] = slots.map((c) => (RESERVED_CODES.has(c) && !(a.id === "pause" && c === "Escape") ? "" : c));
      }
    }
    if (saved.pad && typeof saved.pad === "object") {
      for (const a of PAD_ACTIONS) {
        const v = saved.pad[a];
        if (v === null || (Number.isInteger(v) && v >= 0 && v < 32)) this.pad[a] = v;
      }
    }
    this.keys.pause[0] = "Escape";
    this.dedupe();
    this.rebuild();
  }

  /** Drops duplicate codes (first owner wins) so a hand-edited or old save can not double-bind a key. */
  dedupe() {
    const seen = new Set();
    for (const a of ACTION_INFO) {
      this.keys[a.id] = this.keys[a.id].map((c) => {
        if (!c) return "";
        if (seen.has(c)) return "";
        seen.add(c);
        return c;
      });
    }
    const padSeen = new Set();
    for (const a of PAD_ACTIONS) {
      const b = this.pad[a];
      if (b === null || b === undefined) continue;
      if (padSeen.has(b)) this.pad[a] = null;
      else padSeen.add(b);
    }
  }

  persist() {
    this.store.setJson("binds", { v: 1, keys: this.keys, pad: this.pad });
    this.rebuild();
    for (const fn of this.listeners) fn();
  }

  rebuild() {
    this.byCode = new Map();
    for (const a of ACTION_INFO) for (const c of this.keys[a.id]) if (c) this.byCode.set(c, a.id);
    this.byButton = new Map();
    for (const a of PAD_ACTIONS) if (this.pad[a] !== null && this.pad[a] !== undefined) this.byButton.set(this.pad[a], a);
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  actionForCode(code) {
    return this.byCode.get(code) ?? null;
  }

  /**
   * Binds a key code to one slot of an action. If another action owns the code it loses it (swap
   * semantics: that action receives this slot's previous key when it had no other key).
   * Returns { ok, displaced } where displaced is the label of the action that lost the key, or null.
   */
  setKey(action, slot, code) {
    if (RESERVED_CODES.has(code) && !(action === "pause" && code === "Escape")) return { ok: false, displaced: null, reason: "reserved" };
    const info = ACTION_INFO.find((a) => a.id === action);
    if (!info || slot < 0 || slot > 1) return { ok: false, displaced: null, reason: "unknown" };
    if (info.lockedFirst && slot === 0) return { ok: false, displaced: null, reason: "locked" };
    let displaced = null;
    const previous = this.keys[action][slot];
    for (const a of ACTION_INFO) {
      const i = this.keys[a.id].indexOf(code);
      if (i < 0 || (a.id === action && i === slot)) continue;
      if (a.lockedFirst && i === 0) return { ok: false, displaced: null, reason: "locked" };
      this.keys[a.id][i] = a.id === action ? "" : previous && !this.keys[a.id].includes(previous) ? previous : "";
      if (a.id !== action) displaced = a.label;
    }
    this.keys[action][slot] = code;
    this.persist();
    return { ok: true, displaced };
  }

  clearKey(action, slot) {
    const info = ACTION_INFO.find((a) => a.id === action);
    if (!info || (info.lockedFirst && slot === 0)) return false;
    this.keys[action][slot] = "";
    this.persist();
    return true;
  }

  setPad(action, button) {
    if (!PAD_ACTIONS.includes(action)) return { ok: false, displaced: null };
    let displaced = null;
    const previous = this.pad[action] ?? null;
    for (const a of PAD_ACTIONS) {
      if (a !== action && this.pad[a] === button) {
        this.pad[a] = previous;
        displaced = ACTION_INFO.find((i) => i.id === a)?.label ?? a;
      }
    }
    this.pad[action] = button;
    this.persist();
    return { ok: true, displaced };
  }

  resetKeys() {
    this.keys = clone(DEFAULT_KEYS);
    this.persist();
  }

  resetPad() {
    this.pad = clone(DEFAULT_PAD);
    this.persist();
  }

  /** Readable names for an action on a device: "keyboard" | "gamepad" | "touch". */
  labels(action, device = "keyboard") {
    if (device === "gamepad") {
      const b = this.pad[action];
      return b === null || b === undefined ? [] : [padLabel(b)];
    }
    if (device === "touch") return [TOUCH_NAMES[action] ?? action];
    return this.keys[action].filter(Boolean).map(codeLabel);
  }

  /** The best single label for prompts such as "E to rest". */
  prompt(action, device = "keyboard") {
    return this.labels(action, device)[0] ?? "?";
  }
}

const TOUCH_NAMES = { interact: "Use", attack: "Hit", heavy: "Heavy", jump: "Jump", dodge: "Dodge", parry: "Parry", skill: "Skill", ultimate: "Ult", flask: "Flask", pause: "II", map: "Map" };
