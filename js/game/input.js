// Keyboard, mouse, gamepad and touch to InputFrame. Presses between simulation ticks are latched so no tap is lost.
// Keyboard bindings are physical key codes from the Keybinds object, so WASD follows the key position on any layout.
import { ACTIONS, emptyInput } from "../sim/types.js";

/** On-screen buttons, in the order they are built. `cls` places them with CSS. */
const TOUCH_BUTTONS = [
  { a: "attack", label: "Hit", cls: "t-attack" },
  { a: "jump", label: "Jump", cls: "t-jump" },
  { a: "dodge", label: "Dodge", cls: "t-dodge" },
  { a: "heavy", label: "Heavy", cls: "t-heavy" },
  { a: "parry", label: "Parry", cls: "t-parry" },
  { a: "skill", label: "Skill", cls: "t-skill" },
  { a: "ultimate", label: "Ult", cls: "t-ult" },
  { a: "flask", label: "Flask", cls: "t-flask" },
  { a: "interact", label: "Use", cls: "t-use" }
];

const GAMEPLAY = new Set(ACTIONS);
/** D-pad buttons are movement, never rebinding targets. */
const DPAD = new Set([12, 13, 14, 15]);
const MOUSE_ACTIONS = { 0: "attack", 1: "parry", 2: "heavy", 3: "dodge" };

export class Input {
  /**
   * @param {HTMLElement} touchHost  element the touch layer is added to
   * @param {{binds: import("../app/keybinds.js").Keybinds, settings: import("../app/settings.js").Settings}} deps
   */
  constructor(touchHost, { binds, settings }) {
    this.binds = binds;
    this.settings = settings;
    this.sources = { key: new Set(), pad: new Set(), touch: new Set(), mouse: new Set() };
    this.held = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.enabled = true;
    /** Called with a meta action id: pause, map, journal, fullscreen, debug, grant. */
    this.onMeta = () => {};
    /** Called with "up" | "down" | "left" | "right" | "ok" | "back" while a menu is open and a pad is used. */
    this.onMenu = () => {};
    /** Returns true while the game wants Tab for itself (play and map screens). */
    this.ownsTab = () => false;
    /** Returns -1, 0 or 1: which side of the player the mouse cursor is on. Set by the game. */
    this.aim = () => 0;
    this.lastDevice = "keyboard";
    this.padPrev = [];
    this.stickPrev = { x: 0, y: 0 };
    this.padId = "";
    this.touchRoot = null;
    this.touchVisible = false;
    this.onDevice = () => {};
    this.capturing = null;
    this.dev = /[?&]dev\b/.test(window.location.search);

    window.addEventListener("keydown", (e) => this.key(e, true));
    window.addEventListener("keyup", (e) => this.key(e, false));
    window.addEventListener("blur", () => this.releaseAll());
    window.addEventListener("contextmenu", (e) => {
      if (e.target instanceof HTMLCanvasElement || e.target.closest?.(".touch")) e.preventDefault();
    });
    if (touchHost) this.buildTouch(touchHost);
    this.bindMouse(touchHost);
    window.addEventListener("gamepadconnected", () => this.noteDevice("gamepad"));
    settings.onChange(() => this.applyTouchSetting());
    this.applyTouchSetting();
  }

  noteDevice(d) {
    if (this.lastDevice !== d) {
      this.lastDevice = d;
      this.onDevice(d);
    }
  }

  releaseAll() {
    for (const k of Object.keys(this.sources)) this.sources[k].clear();
    for (const a of this.held) this.released.add(a);
    this.held.clear();
    this.releaseTouchVisuals();
  }

  /** One source says an action is down or up; the action is held while any source holds it. */
  setSource(src, a, down) {
    const s = this.sources[src];
    if (down) s.add(a);
    else s.delete(a);
    const any = Object.values(this.sources).some((x) => x.has(a));
    const was = this.held.has(a);
    if (any && !was) {
      this.held.add(a);
      this.pressed.add(a);
    } else if (!any && was) {
      this.held.delete(a);
      this.released.add(a);
    }
  }

  // ---------------------------------------------------------------- rebinding
  /**
   * Waits for one key press or pad button and hands it to `done`. Escape cancels a key capture and Back/Start
   * cancels a pad capture, both reported as null.
   * @param {"key"|"pad"} kind
   * @param {(value: string|number|null) => void} done
   */
  capture(kind, done) {
    this.capturing = { kind, done };
    this.clear();
  }

  cancelCapture() {
    const c = this.capturing;
    this.capturing = null;
    c?.done(null);
  }

  // ---------------------------------------------------------------- keyboard
  key(e, down) {
    if (this.capturing?.kind === "key") {
      if (!down) return;
      e.preventDefault();
      e.stopPropagation();
      const c = this.capturing;
      this.capturing = null;
      c.done(e.code === "Escape" ? null : e.code);
      return;
    }
    const typing = e.target instanceof HTMLInputElement && e.target.type === "text";
    if (typing && e.code !== "Escape") return;
    const act = this.binds.actionForCode(e.code);
    if (down && !e.repeat) {
      if (this.dev && e.code === "F1") return this.onMeta("debug");
      if (this.dev && e.code === "F2") return this.onMeta("grant");
      if (act === "pause" || act === "map" || act === "journal" || act === "fullscreen") {
        if (e.code === "Tab" && !this.enabled && !this.ownsTab()) return;
        e.preventDefault();
        return this.onMeta(act);
      }
    }
    if (!act || !GAMEPLAY.has(act)) return;
    if (!this.enabled) return;
    e.preventDefault();
    if (down) this.noteDevice("keyboard");
    if (e.repeat) return;
    this.setSource("key", act, down);
  }

  // ---------------------------------------------------------------- mouse
  bindMouse(host) {
    const target = host ?? window;
    target.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || !this.enabled || !this.settings.get("mouse")) return;
      if (e.target.closest?.(".hud button, .touch")) return;
      this.noteDevice("keyboard");
      const a = MOUSE_ACTIONS[e.button];
      if (!a) return;
      e.preventDefault();
      this.setSource("mouse", a, true);
    });
    window.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "mouse") return;
      for (const a of Object.values(MOUSE_ACTIONS)) if (this.sources.mouse.has(a)) this.setSource("mouse", a, false);
    });
  }

  // ---------------------------------------------------------------- touch
  buildTouch(host) {
    const root = document.createElement("div");
    root.className = "touch";
    root.hidden = true;
    root.innerHTML = `
      <div class="t-stick-zone"><div class="t-stick-base"><div class="t-stick-knob"></div></div></div>
      ${TOUCH_BUTTONS.map((b) => `<button type="button" class="t-btn ${b.cls}" data-a="${b.a}" aria-label="${b.label}"><span>${b.label}</span></button>`).join("")}
      <button type="button" class="t-meta t-pause" data-meta="pause" aria-label="Pause">II</button>
      <button type="button" class="t-meta t-map" data-meta="map" aria-label="Map">Map</button>
      <button type="button" class="t-meta t-journal" data-meta="journal" aria-label="Journal">Log</button>`;
    host.appendChild(root);
    this.touchRoot = root;

    window.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType === "touch" && this.settings.get("touch") === "auto") this.showTouch(true);
      },
      { passive: true }
    );

    const btnPtr = new Map();
    root.querySelectorAll(".t-btn").forEach((el) => {
      const a = el.dataset.a;
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic or ended pointer */
        }
        btnPtr.set(e.pointerId, a);
        el.classList.add("down");
        this.noteDevice("touch");
        if (this.enabled) this.setSource("touch", a, true);
        if (this.settings.get("rumble")) navigator.vibrate?.(8);
      });
      const up = (e) => {
        if (btnPtr.get(e.pointerId) !== a) return;
        btnPtr.delete(e.pointerId);
        el.classList.remove("down");
        this.setSource("touch", a, false);
      };
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("lostpointercapture", up);
    });
    root.querySelectorAll(".t-meta").forEach((el) => {
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.onMeta(el.dataset.meta);
      });
    });

    // Floating stick: appears where the thumb lands in the left zone.
    const zone = root.querySelector(".t-stick-zone");
    const base = root.querySelector(".t-stick-base");
    const knob = root.querySelector(".t-stick-knob");
    let sid = null;
    let cx = 0;
    let cy = 0;
    const R = 46;
    const apply = (dx, dy) => {
      const d = Math.hypot(dx, dy);
      const k = d > R ? R / d : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      const nx = (dx * k) / R;
      const ny = (dy * k) / R;
      this.setSource("touch", "left", nx < -0.3);
      this.setSource("touch", "right", nx > 0.3);
      this.setSource("touch", "up", ny < -0.6);
      this.setSource("touch", "down", ny > 0.6);
    };
    const end = () => {
      sid = null;
      base.classList.remove("on");
      knob.style.transform = "";
      for (const a of ["left", "right", "up", "down"]) this.setSource("touch", a, false);
    };
    zone.addEventListener("pointerdown", (e) => {
      if (sid !== null) return;
      e.preventDefault();
      sid = e.pointerId;
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic or ended pointer */
      }
      const r = zone.getBoundingClientRect();
      cx = e.clientX;
      cy = e.clientY;
      base.style.left = `${cx - r.left}px`;
      base.style.top = `${cy - r.top}px`;
      base.classList.add("on");
      this.noteDevice("touch");
      apply(0, 0);
    });
    zone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== sid) return;
      apply(e.clientX - cx, e.clientY - cy);
    });
    zone.addEventListener("pointerup", (e) => e.pointerId === sid && end());
    zone.addEventListener("pointercancel", (e) => e.pointerId === sid && end());
    zone.addEventListener("lostpointercapture", (e) => e.pointerId === sid && end());
    this.releaseTouchVisuals = () => {
      end();
      root.querySelectorAll(".t-btn.down").forEach((b) => b.classList.remove("down"));
    };
  }

  releaseTouchVisuals() {}

  /** Applies the Touch controls setting (auto shows them once a finger touches, or on coarse-pointer devices). */
  applyTouchSetting() {
    const mode = this.settings.get("touch");
    const coarse = window.matchMedia ? window.matchMedia("(pointer: coarse)").matches : false;
    this.showTouch(mode === "on" || (mode === "auto" && coarse));
    this.touchRoot?.style.setProperty("--touch-scale", String(this.settings.get("touchScale")));
  }

  showTouch(v) {
    if (!this.touchRoot) return;
    this.touchVisible = v;
    this.touchRoot.hidden = !v;
    document.body.classList.toggle("has-touch", v);
  }

  // ---------------------------------------------------------------- gamepad
  /** Reads the first connected gamepad (standard mapping). */
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && Array.from(pads).find((p) => p && p.connected);
    if (!pad) {
      if (this.sources.pad.size) for (const a of [...this.sources.pad]) this.setSource("pad", a, false);
      return;
    }
    this.padId = pad.id;
    const b = pad.buttons.map((x) => x.pressed);
    const edge = (i) => b[i] && !this.padPrev[i];
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const any = b.some(Boolean) || Math.abs(ax) > 0.5 || Math.abs(ay) > 0.5;
    if (any) this.noteDevice("gamepad");

    if (this.capturing?.kind === "pad") {
      for (let i = 0; i < b.length; i++) {
        if (!edge(i) || DPAD.has(i)) continue;
        const c = this.capturing;
        this.capturing = null;
        c.done(i === 9 ? null : i);
        break;
      }
      this.padPrev = b;
      return;
    }

    const want = {
      up: b[12] || ay < -0.6,
      down: b[13] || ay > 0.6,
      left: b[14] || ax < -0.4,
      right: b[15] || ax > 0.4
    };
    for (const [btn, action] of this.binds.byButton) if (GAMEPLAY.has(action)) want[action] = want[action] || !!b[btn];

    if (this.enabled) {
      for (const a of ACTIONS) this.setSource("pad", a, !!want[a]);
    } else {
      for (const a of [...this.sources.pad]) this.setSource("pad", a, false);
      const sx = Math.abs(ax) > 0.6 ? Math.sign(ax) : 0;
      const sy = Math.abs(ay) > 0.6 ? Math.sign(ay) : 0;
      if (edge(12) || (sy < 0 && this.stickPrev.y >= 0)) this.onMenu("up");
      if (edge(13) || (sy > 0 && this.stickPrev.y <= 0)) this.onMenu("down");
      if (edge(14) || (sx < 0 && this.stickPrev.x >= 0)) this.onMenu("left");
      if (edge(15) || (sx > 0 && this.stickPrev.x <= 0)) this.onMenu("right");
      if (edge(0)) this.onMenu("ok");
      if (edge(1)) this.onMenu("back");
    }
    this.stickPrev = { x: Math.abs(ax) > 0.6 ? Math.sign(ax) : 0, y: Math.abs(ay) > 0.6 ? Math.sign(ay) : 0 };
    for (const meta of ["pause", "map"]) {
      const btn = this.binds.pad[meta];
      if (btn !== null && btn !== undefined && edge(btn)) this.onMeta(meta);
    }
    this.padPrev = b;
  }

  /** Short controller rumble where supported. */
  rumble(ms = 120, strong = 0.6) {
    if (!this.settings.get("rumble")) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && Array.from(pads).find((p) => p && p.connected);
    const act = pad?.vibrationActuator;
    if (act?.playEffect) act.playEffect("dual-rumble", { duration: ms, strongMagnitude: strong, weakMagnitude: strong * 0.5 }).catch(() => {});
  }

  /** Phone vibration for the same moments, when the player allows it. */
  buzz(ms) {
    if (this.settings.get("rumble")) navigator.vibrate?.(ms);
  }

  // ---------------------------------------------------------------- frame
  /** Takes the input for one simulation tick. */
  frame() {
    const f = emptyInput();
    if (!this.enabled) return f;
    for (const a of ACTIONS) {
      f.held[a] = this.held.has(a);
      f.pressed[a] = this.pressed.has(a);
      f.released[a] = this.released.has(a);
    }
    // Mouse aiming: a click turns the character toward the cursor for that tick.
    if ((f.pressed.attack || f.pressed.heavy) && this.sources.mouse.size && !f.held.left && !f.held.right) {
      const d = this.aim();
      if (d < 0) f.held.left = true;
      else if (d > 0) f.held.right = true;
    }
    this.pressed.clear();
    this.released.clear();
    return f;
  }

  clear() {
    this.pressed.clear();
    this.released.clear();
    for (const k of Object.keys(this.sources)) this.sources[k].clear();
    this.held.clear();
    this.releaseTouchVisuals();
  }
}
