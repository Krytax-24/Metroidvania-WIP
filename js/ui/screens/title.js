// Title menu, the new-run setup screens and the credits.
import { ABILITIES, planExpedition, randomSeed } from "../../gen/index.js";
import { KITS, KIT_ORDER } from "../../data/kits.js";
import { ABILITY_COLORS } from "../../data/palette.js";
import { ART_CREDITS, INSPIRATION, OTHER_CREDITS } from "../../data/credits.js";
import { describeSave } from "../../app/save.js";
import { btn, esc, panel, toggle } from "../kit.js";

const TIER_NAMES = ["I", "II", "III"];
const BIOMES = ["crystal", "sky", "autumn"];

const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export function titleScreen(app) {
  app.enterMenu();
  const save = app.saves.read();
  const info = describeSave(save);
  const bg = BIOMES[app.menuBiome % BIOMES.length];
  const continueSub = info
    ? `${esc(KITS[info.character]?.name ?? info.character)}, Tier ${TIER_NAMES[info.tier - 1]}, level ${info.level}, ${info.minutes} min played${info.savedAt ? `, saved ${esc(when(info.savedAt))}` : ""}`
    : "";
  app.ui.show({
    id: "title",
    cls: `center title-bg bg-${bg}`,
    html: panel({
      cls: "title",
      body: `
        <div class="title-hero">
          <h1>Ashen Ascent</h1>
          <p class="sub">A gothic Metroidvania for the browser. Climb three Tiers, wake the Heralds, and ring the Ninth Bell before the Blight rises.</p>
        </div>
        <canvas class="title-art" width="360" height="110" aria-hidden="true"></canvas>
        <div class="menu main">
          ${save ? btn({ id: "continue", label: "Continue", cls: "primary", sub: continueSub, autofocus: true }) : ""}
          ${btn({ id: "new", label: "New Expedition", cls: save ? "" : "primary", autofocus: !save })}
          ${btn({ id: "yard", label: "Training Yard", sub: "Practise every move and every ability, safely" })}
          <div class="menu row2">
            ${btn({ id: "settings", label: "Settings" })}
            ${btn({ id: "controls", label: "Controls" })}
            ${btn({ id: "credits", label: "Credits" })}
            ${document.fullscreenEnabled ? btn({ id: "fs", label: "Fullscreen" }) : ""}
          </div>
          ${save ? btn({ id: "delete", label: "Delete saved game", cls: "quiet" }) : ""}
        </div>
        ${app.store.persistent ? "" : `<p class="sub small warn">This browser window cannot store data, so settings and saves last only until you close the tab.</p>`}
        <p class="sub small">Saves are written each time you rest at a Sanctuary and when a Tier is cleared.</p>`
    }),
    onBack: null
  });
  app.startPreviews([{ cv: app.ui.$(".title-art"), ids: KIT_ORDER }]);
  const $ = (id) => app.ui.$(`#${id}`);
  $("continue") && ($("continue").onclick = () => app.continueRun());
  $("new").onclick = () => setupScreen(app, "expedition");
  $("yard").onclick = () => setupScreen(app, "yard");
  $("settings").onclick = () => app.openSettings(() => titleScreen(app));
  $("controls").onclick = () => app.openControls(() => titleScreen(app));
  $("credits").onclick = () => creditsScreen(app);
  $("fs") && ($("fs").onclick = () => app.toggleFullscreen());
  const del = $("delete");
  if (del) {
    del.onclick = () => {
      if (del.dataset.armed !== "1") {
        del.dataset.armed = "1";
        del.textContent = "Press again to delete the save for good";
        del.classList.add("danger");
        return;
      }
      app.saves.delete();
      app.sfx("uiBack");
      titleScreen(app);
    };
  }
}

/** Lead selection plus the options for a new Expedition (kind "expedition") or a Yard visit (kind "yard"). */
function setupScreen(app, kind) {
  app.enterMenu();
  const d = app.draft;
  const yard = kind === "yard";
  const plan = yard ? null : planExpedition(d.seed);
  app.ui.show({
    id: "setup",
    cls: `center title-bg bg-${BIOMES[app.menuBiome % BIOMES.length]}`,
    html: panel({
      cls: "title",
      title: yard ? "Training Yard" : "New Expedition",
      sub: yard ? "Pick the lead to practise with. Nobody dies in the Yard and there is no clock." : "Choose your lead. Three Tiers, a new map for every seed.",
      body: `
        <div class="chars" role="radiogroup" aria-label="Character" data-hnav>
          ${KIT_ORDER.map(
            (id) => `<button type="button" class="char ${id === d.character ? "sel" : ""}" data-id="${id}" role="radio" aria-checked="${id === d.character}">
              <canvas width="120" height="104" aria-hidden="true"></canvas>
              <b>${esc(KITS[id].name)}</b><em>${esc(KITS[id].title)}</em>
              <span>${esc(KITS[id].blurb)}</span>
              <small>Skill: ${esc(KITS[id].skill.name)}<br>Ultimate: ${esc(KITS[id].ultimate.name)}</small>
            </button>`
          ).join("")}
        </div>
        ${
          yard
            ? ""
            : `<label class="label" for="seed">Expedition seed</label>
        <div class="seed-row"><input id="seed" type="text" value="${esc(d.seed)}" spellcheck="false" autocomplete="off" maxlength="40" />${btn({ id: "roll", label: "New seed" })}</div>
        <div class="plan" id="plan">${planHtml(plan)}</div>
        <div class="opts">
          ${toggle({ id: "opt-all", label: "Start with all abilities (testing)", checked: d.allAbilities })}
          <label class="field select" for="opt-tier"><span class="field-label">Start at Tier</span><select id="opt-tier">${[1, 2, 3].map((t) => `<option value="${t}" ${t === d.startTier ? "selected" : ""}>${TIER_NAMES[t - 1]}</option>`).join("")}</select></label>
        </div>`
        }
        <div class="menu row2">
          ${btn({ id: "begin", label: yard ? "Enter the Yard" : "Begin Expedition", cls: "primary", autofocus: true })}
          ${yard ? "" : btn({ id: "prologue", label: "Play the Prologue" })}
          ${btn({ id: "back", label: "Back" })}
        </div>
        ${yard ? "" : `<p class="sub small">The Prologue is one fixed Tier, the same every time. An Expedition is three Tiers with a new map each run.</p>`}`
    }),
    onBack: () => titleScreen(app)
  });

  app.startPreviews([...app.ui.$$(".char")].map((el) => ({ cv: el.querySelector("canvas"), ids: [el.dataset.id], el })));
  app.ui.$$(".char").forEach((b) => {
    b.onclick = () => {
      d.character = b.dataset.id;
      app.store.set("char", d.character);
      app.ui.$$(".char").forEach((c) => {
        c.classList.toggle("sel", c === b);
        c.setAttribute("aria-checked", String(c === b));
      });
      app.audio.unlock();
      app.sfx("uiSelect");
    };
  });
  const $ = (id) => app.ui.$(`#${id}`);
  $("back").onclick = () => titleScreen(app);
  if (!yard) {
    const seedEl = $("seed");
    const refreshPlan = () => {
      d.seed = cleanSeed(seedEl.value) || d.seed;
      $("plan").innerHTML = planHtml(planExpedition(d.seed));
    };
    seedEl.onchange = refreshPlan;
    $("roll").onclick = () => {
      d.seed = randomSeed();
      seedEl.value = d.seed;
      refreshPlan();
      app.sfx("ui");
    };
    $("opt-all").onchange = (e) => (d.allAbilities = e.target.checked);
    $("opt-tier").onchange = (e) => (d.startTier = Number(e.target.value));
    $("prologue").onclick = () => app.startRun({ mode: "prologue", seed: app.PROLOGUE_SEED, character: d.character, tier: 1, allAbilities: false });
    $("begin").onclick = () => {
      d.seed = cleanSeed(seedEl.value) || randomSeed();
      app.store.set("seed", d.seed);
      app.startRun({ mode: "expedition", seed: d.seed, character: d.character, tier: d.startTier, allAbilities: d.allAbilities });
    };
  } else {
    $("begin").onclick = () => app.startRun({ mode: "practice", seed: "yard", character: d.character, tier: 1, allAbilities: true });
  }
}

const cleanSeed = (v) => v.trim().replace(/[^A-Za-z0-9_~-]/g, "-").slice(0, 40);

function planHtml(plan) {
  return (
    plan.abilities.map((t, i) => `<span><b>${TIER_NAMES[i]}</b> ${t.map((a) => `<i style="background:${ABILITY_COLORS[a]}"></i>${esc(ABILITIES[a].name)}`).join(" ")}</span>`).join("") +
    `<span class="boss-line">Final Guardian: ${esc(plan.finalGuardian)}</span>`
  );
}

export function creditsScreen(app) {
  app.enterMenu();
  app.ui.show({
    id: "credits",
    cls: "center",
    html: panel({
      cls: "credits",
      title: "Credits",
      sub: "Ashen Ascent is built on other people's generosity. Thank you to everyone below.",
      body: `
        <h3 class="label">Art</h3>
        <div class="credit-list">${ART_CREDITS.map((c) => `<div><b>${esc(c.pack)}</b><span>${esc(c.used)}</span><small>${esc(c.terms)}</small></div>`).join("")}</div>
        <h3 class="label">Sound, music and code</h3>
        <ul class="plain">${OTHER_CREDITS.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        <h3 class="label">Reference projects reviewed</h3>
        <div class="credit-list compact">${INSPIRATION.map(([n, t]) => `<div><b>${esc(n)}</b><span>${esc(t)}</span></div>`).join("")}</div>
        <p class="sub small">The full per-pack licence notes are in CREDITS.md and the design log is in INSPIRATION_LOG.md, both in the game folder.</p>
        <div class="menu">${btn({ id: "back", label: "Back", autofocus: true })}</div>`
    }),
    onBack: () => titleScreen(app)
  });
  app.ui.$("#back").onclick = () => titleScreen(app);
}
