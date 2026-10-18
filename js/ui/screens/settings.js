// Settings: sound buses, camera and feel, controls shortcuts, touch layout. Every control applies at once and is saved.
import { btn, panel, select, slider, toggle } from "../kit.js";

const pct = (v) => `${Math.round(v * 100)}%`;
const mult = (v) => `${Number(v).toFixed(1)}x`;

export function settingsScreen(app, back) {
  const s = app.settings;
  app.enterMenu(app.screen === "play" || app.screen === "pause" ? "pause" : "title");
  app.ui.show({
    id: "settings",
    cls: "center",
    html: panel({
      cls: "settings",
      title: "Settings",
      sub: "Changes apply immediately and are kept in this browser.",
      body: `
        <section><h3 class="label">Sound</h3>
          ${slider({ id: "s-master", label: "Master volume", min: 0, max: 1, step: 0.05, value: s.get("master"), fmt: pct })}
          ${slider({ id: "s-music", label: "Music", min: 0, max: 1, step: 0.05, value: s.get("music"), fmt: pct })}
          ${slider({ id: "s-sfx", label: "Effects and menu sounds", min: 0, max: 1, step: 0.05, value: s.get("sfx"), fmt: pct })}
        </section>
        <section><h3 class="label">Picture and feel</h3>
          ${slider({ id: "s-zoom", label: "Camera zoom", min: 1, max: 2, step: 0.1, value: s.get("zoom"), fmt: mult })}
          ${slider({ id: "s-shake", label: "Screen shake", min: 0, max: 1, step: 0.25, value: s.get("shake"), fmt: pct })}
          ${toggle({ id: "s-dmg", label: "Damage numbers", checked: s.get("damageNumbers") })}
          ${toggle({ id: "s-flash", label: "Screen flashes", checked: s.get("flashes"), hint: "Turn off to remove full-screen colour flashes." })}
          ${toggle({ id: "s-hints", label: "Helpful hints", checked: s.get("hints"), hint: "Short tips as you play." })}
          ${document.fullscreenEnabled ? btn({ id: "s-fs", label: app.isFullscreen() ? "Leave fullscreen" : "Go fullscreen" }) : ""}
        </section>
        <section><h3 class="label">Input</h3>
          ${toggle({ id: "s-mouse", label: "Mouse attacks", checked: s.get("mouse"), hint: "Left click attacks, right click heavy, middle click parries." })}
          ${toggle({ id: "s-rumble", label: "Controller rumble and phone vibration", checked: s.get("rumble") })}
          ${select({ id: "s-touch", label: "Touch controls", value: s.get("touch"), options: [["auto", "Automatic"], ["on", "Always on"], ["off", "Off"]] })}
          ${slider({ id: "s-tscale", label: "Touch button size", min: 0.8, max: 1.4, step: 0.1, value: s.get("touchScale"), fmt: mult })}
          ${btn({ id: "s-controls", label: "Change key and button bindings" })}
        </section>
        <div class="menu row2">
          ${btn({ id: "s-reset", label: "Restore defaults" })}
          ${btn({ id: "s-back", label: "Back", cls: "primary", autofocus: true })}
        </div>`
    }),
    onBack: back
  });

  const $ = (id) => app.ui.$(`#${id}`);
  const bindRange = (id, key, fmt) => {
    const el = $(id);
    el.oninput = () => {
      s.set(key, Number(el.value));
      el.nextElementSibling.textContent = fmt(Number(el.value));
    };
    el.onchange = () => app.sfx("ui");
  };
  bindRange("s-master", "master", pct);
  bindRange("s-music", "music", pct);
  bindRange("s-sfx", "sfx", pct);
  bindRange("s-zoom", "zoom", mult);
  bindRange("s-shake", "shake", pct);
  bindRange("s-tscale", "touchScale", mult);
  const bindCheck = (id, key) => {
    $(id).onchange = (e) => {
      s.set(key, e.target.checked);
      app.sfx("ui");
    };
  };
  bindCheck("s-dmg", "damageNumbers");
  bindCheck("s-flash", "flashes");
  bindCheck("s-hints", "hints");
  bindCheck("s-mouse", "mouse");
  bindCheck("s-rumble", "rumble");
  $("s-touch").onchange = (e) => s.set("touch", e.target.value);
  $("s-fs") && ($("s-fs").onclick = () => app.toggleFullscreen().then(() => settingsScreen(app, back)));
  $("s-controls").onclick = () => app.openControls(() => settingsScreen(app, back));
  $("s-reset").onclick = () => {
    s.reset();
    app.sfx("uiBack");
    settingsScreen(app, back);
  };
  $("s-back").onclick = back;
}
