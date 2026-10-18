// Boot only: builds the three layers the app draws into, hands them to App, and exposes a tiny hook for automated checks.
import { App } from "./app/app.js";

const root = document.getElementById("app");
root.innerHTML = `
  <div class="stage" id="stage"></div>
  <div class="overlay" id="overlay" hidden></div>
  <div class="rotate" id="rotate"><div><b>Rotate your device</b><span>Ashen Ascent plays in landscape.</span></div></div>
`;

const app = new App({
  stage: document.getElementById("stage"),
  overlay: document.getElementById("overlay"),
  rotateEl: document.getElementById("rotate")
});
app.boot();

// Used by tools/ and the Playwright checks; nothing in the game reads these.
window.__game = () => app.sim;
window.__app = app;
window.__ctl = {
  get renderer() { return app.renderer; },
  get input() { return app.input; },
  get screen() { return app.screen; },
  start: (o = {}) => app.startRun({ ...o, skipScenes: true })
};
