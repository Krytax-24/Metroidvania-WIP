// The controls screen: a live reference that is also the rebinding screen. Click a slot, then press the new key or button.
import { ACTION_INFO, DEFAULT_PAD, PAD_ACTIONS, codeLabel, padLabel } from "../../app/keybinds.js";
import { KITS } from "../../data/kits.js";
import { btn, esc, panel, TELEGRAPH_LEGEND } from "../kit.js";

const TABS = [
  ["keyboard", "Keyboard and mouse"],
  ["gamepad", "Controller"],
  ["touch", "Touch"]
];

export function controlsScreen(app, back, tab = "keyboard", note = "") {
  app.enterMenu(app.screen === "play" || app.screen === "pause" ? "pause" : "title");
  const kit = app.sim ? KITS[app.sim.character] : KITS[app.draft.character];
  app.ui.show({
    id: "controls",
    cls: "center",
    html: panel({
      cls: "controls-panel",
      title: "Controls",
      sub: note || "Select a slot, then press the key or button you want. Escape cancels.",
      body: `
        <div class="tabs" role="tablist" data-hnav>${TABS.map(([id, label]) => `<button type="button" role="tab" class="tab ${id === tab ? "sel" : ""}" data-tab="${id}" aria-selected="${id === tab}">${label}</button>`).join("")}</div>
        ${tab === "keyboard" ? keyboardBody(app, kit) : tab === "gamepad" ? gamepadBody(app) : touchBody()}
        ${TELEGRAPH_LEGEND}
        <div class="menu row2">
          ${tab === "touch" ? "" : btn({ id: "reset", label: "Restore defaults" })}
          ${btn({ id: "back", label: "Back", cls: "primary", autofocus: true })}
        </div>`
    }),
    onBack: back
  });
  const $$ = (sel) => app.ui.$$(sel);
  $$(".tab").forEach((t) => (t.onclick = () => controlsScreen(app, back, t.dataset.tab)));
  app.ui.$("#back").onclick = back;
  const reset = app.ui.$("#reset");
  if (reset) {
    reset.onclick = () => {
      if (tab === "keyboard") app.binds.resetKeys();
      else app.binds.resetPad();
      app.sfx("uiBack");
      controlsScreen(app, back, tab, "Defaults restored.");
    };
  }

  $$(".slot").forEach((b) => {
    b.onclick = () => {
      const { action, slot } = b.dataset;
      b.textContent = "Press a key";
      b.classList.add("listening");
      app.input.capture("key", (code) => {
        if (code === null) return controlsScreen(app, back, "keyboard");
        const r = app.binds.setKey(action, Number(slot), code);
        app.sfx(r.ok ? "uiSelect" : "uiError");
        const msg = !r.ok ? (r.reason === "reserved" ? `${codeLabel(code)} is reserved by the game.` : "That slot is locked.") : r.displaced ? `${codeLabel(code)} moved here from ${r.displaced}.` : "Saved.";
        controlsScreen(app, back, "keyboard", msg);
      });
    };
  });
  $$(".slot-clear").forEach((b) => {
    b.onclick = () => {
      app.binds.clearKey(b.dataset.action, Number(b.dataset.slot));
      app.sfx("uiBack");
      controlsScreen(app, back, "keyboard", "Slot cleared.");
    };
  });
  $$(".pad-slot").forEach((b) => {
    b.onclick = () => {
      b.textContent = "Press a button";
      b.classList.add("listening");
      app.input.capture("pad", (btnIndex) => {
        if (btnIndex === null) return controlsScreen(app, back, "gamepad");
        const r = app.binds.setPad(b.dataset.action, btnIndex);
        app.sfx(r.ok ? "uiSelect" : "uiError");
        controlsScreen(app, back, "gamepad", r.displaced ? `${padLabel(btnIndex)} swapped with ${r.displaced}.` : "Saved.");
      });
    };
  });
}

function keyboardBody(app, kit) {
  const groups = [...new Set(ACTION_INFO.map((a) => a.group))];
  const extra = (id) => (kit && id === "skill" ? ` <small>${esc(kit.skill.name)}</small>` : kit && id === "ultimate" ? ` <small>${esc(kit.ultimate.name)}</small>` : "");
  return `<div class="bind-groups">${groups
    .map(
      (g) => `<div><h3 class="label">${g}</h3><table class="controls bind-table"><tbody>${ACTION_INFO.filter((a) => a.group === g)
        .map((a) => {
          const slots = app.binds.keys[a.id];
          return `<tr><th scope="row">${a.label}${extra(a.id)}</th>${[0, 1]
            .map((i) => {
              const locked = a.lockedFirst && i === 0;
              return `<td><button type="button" class="slot ${slots[i] ? "" : "empty"}" data-action="${a.id}" data-slot="${i}" ${locked ? "disabled" : ""} aria-label="${a.label}, slot ${i + 1}: ${codeLabel(slots[i])}">${codeLabel(slots[i])}</button>${slots[i] && !locked ? `<button type="button" class="slot-clear" data-action="${a.id}" data-slot="${i}" aria-label="Clear ${a.label} slot ${i + 1}">x</button>` : ""}</td>`;
            })
            .join("")}</tr>`;
        })
        .join("")}</tbody></table></div>`
    )
    .join("")}</div>
    <p class="sub small">Mouse (when enabled in Settings): left click attacks and turns you toward the cursor, right click is the heavy attack, middle click parries. Bindings follow the physical key position, so they work on AZERTY, QWERTZ and Dvorak layouts.</p>`;
}

function gamepadBody(app) {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected) : [];
  const info = pads.length ? `Connected: ${esc(pads[0].id.slice(0, 60))}` : "No controller detected. Press any button on it to wake it up.";
  return `<p class="sub small">${info}</p>
    <table class="controls bind-table"><tbody>
      <tr><th scope="row">Move</th><td colspan="2">Left stick or D-pad (fixed)</td></tr>
      ${PAD_ACTIONS.map((a) => {
        const label = ACTION_INFO.find((i) => i.id === a)?.label ?? a;
        return `<tr><th scope="row">${label}</th><td colspan="2"><button type="button" class="pad-slot slot ${app.binds.pad[a] === null ? "empty" : ""}" data-action="${a}" aria-label="${label}: ${padLabel(app.binds.pad[a])}">${padLabel(app.binds.pad[a])}</button>${DEFAULT_PAD[a] !== app.binds.pad[a] ? ` <small class="dim">default ${padLabel(DEFAULT_PAD[a])}</small>` : ""}</td></tr>`;
      }).join("")}
    </tbody></table>
    <p class="sub small">In menus: D-pad or stick moves, A selects, B goes back.</p>`;
}

function touchBody() {
  return `<table class="controls bind-table"><tbody>
    <tr><th scope="row">Move</th><td>Drag anywhere on the left side. The stick appears under your thumb.</td></tr>
    <tr><th scope="row">Actions</th><td>Hit, Jump, Dodge, Heavy, Parry, Skill, Ult, Flask and Use sit on the right.</td></tr>
    <tr><th scope="row">Menus</th><td>II pauses, Map opens the map, Log opens your journal.</td></tr>
  </tbody></table>
  <p class="sub small">Touch size and visibility are in Settings. Phones should be held in landscape.</p>`;
}
