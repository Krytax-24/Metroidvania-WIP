// The overlay layer: one screen at a time, keyboard and controller focus movement, and a single Back path
// (Escape, the pad's B button, or a screen's own Back button all end up in `back()`).

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [data-focus]";

export class UI {
  /**
   * @param {HTMLElement} root  the overlay element
   * @param {{ onFocusMove?: () => void, onOpen?: (id: string|null) => void }} hooks
   */
  constructor(root, hooks = {}) {
    this.root = root;
    this.hooks = hooks;
    this.current = null;
    root.addEventListener("keydown", (e) => this.key(e));
  }

  /** The id of the open screen, or null when the overlay is hidden. */
  get id() {
    return this.current?.id ?? null;
  }

  /**
   * Replaces the overlay's content. `onBack` runs when the player presses Escape or B; leave it out for screens
   * that cannot be dismissed.
   */
  show({ id, html, cls = "center", onBack = null }) {
    this.root.className = `overlay ${cls}`;
    this.root.innerHTML = html;
    this.root.hidden = false;
    this.root.scrollTop = 0;
    this.current = { id, onBack };
    this.hooks.onOpen?.(id);
    const first = this.root.querySelector("[autofocus]") ?? this.root.querySelector(FOCUSABLE);
    first?.focus({ preventScroll: true });
    return this.root;
  }

  hide() {
    this.root.hidden = true;
    this.root.innerHTML = "";
    this.current = null;
    this.hooks.onOpen?.(null);
  }

  /** Runs the open screen's Back action. Returns true when there was one. */
  back() {
    const fn = this.current?.onBack;
    if (!fn) return false;
    fn();
    return true;
  }

  $(sel) {
    return this.root.querySelector(sel);
  }

  $$(sel) {
    return [...this.root.querySelectorAll(sel)];
  }

  focusables() {
    return this.$$(FOCUSABLE).filter((el) => !el.closest("[hidden]") && el.offsetParent !== null);
  }

  move(delta) {
    const items = this.focusables();
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    const next = items[(Math.max(0, i) + delta + items.length) % items.length];
    next.focus();
    next.scrollIntoView?.({ block: "nearest" });
    this.hooks.onFocusMove?.();
  }

  /** Left and right: step a slider, or move along a row of cards or tabs. */
  sideways(dir) {
    const cur = document.activeElement;
    if (cur instanceof HTMLInputElement && cur.type === "range") {
      const step = Number(cur.step) || 1;
      cur.value = String(Math.min(Number(cur.max), Math.max(Number(cur.min), Number(cur.value) + dir * step)));
      cur.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    const group = cur?.closest?.("[data-hnav]");
    if (group) {
      const items = [...group.querySelectorAll("button:not([disabled])")];
      const i = items.indexOf(cur);
      if (i >= 0) {
        items[(i + dir + items.length) % items.length].focus();
        this.hooks.onFocusMove?.();
        return true;
      }
    }
    return false;
  }

  key(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const cur = document.activeElement;
      if (cur instanceof HTMLInputElement && cur.type === "text") return;
      if (cur instanceof HTMLSelectElement) return;
      e.preventDefault();
      this.move(e.key === "ArrowDown" ? 1 : -1);
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !(document.activeElement instanceof HTMLInputElement && document.activeElement.type === "text")) {
      const cur = document.activeElement;
      if (cur instanceof HTMLInputElement && cur.type === "range") return;
      if (this.sideways(e.key === "ArrowRight" ? 1 : -1)) e.preventDefault();
    }
  }

  /** Controller navigation from Input.onMenu. */
  menu(k) {
    if (this.root.hidden) return;
    if (k === "up") this.move(-1);
    else if (k === "down") this.move(1);
    else if (k === "left") this.sideways(-1);
    else if (k === "right") this.sideways(1);
    else if (k === "ok") {
      const cur = document.activeElement;
      if (cur && this.root.contains(cur)) cur.click();
      else this.focusables()[0]?.click();
    } else if (k === "back") this.back();
  }
}
