// End-of-Tier and end-of-run screens.
import { endingTone } from "../../data/story.js";
import { KITS } from "../../data/kits.js";
import { btn, esc, panel, statList } from "../kit.js";
import { TIER_NAMES } from "./play.js";

export function clearedScreen(app) {
  const s = app.sim;
  if (!s) return;
  app.setScreen("cleared");
  const mode = app.run.mode;
  const prologue = mode === "prologue";
  const last = s.tier >= 3;
  app.audio.setScene("victory", { fade: 1 });
  app.ui.show({
    id: "cleared",
    cls: "center",
    html: panel({
      title: prologue ? "Prologue complete" : last ? "Expedition complete" : `Tier ${TIER_NAMES[s.tier - 1]} cleared`,
      sub: `${esc(s.map.wardenName)} has fallen.${last && !prologue ? ` ${esc(endingTone(s.candles))}` : ""}`,
      body: `
        ${statList([
          ["Time in Tier", `${Math.floor(s.clockSec / 60)}m ${Math.floor(s.clockSec % 60)}s of ${Math.floor(s.clockSecTotal / 60)}m`],
          ["Seals", `${s.seals} of ${s.heraldCount}`],
          ["Deaths", s.deaths],
          ["Candles left", s.candles],
          ["Level", s.player.level],
          ["Ichor", s.ichor],
          ["Quests finished", s.story.finishedCount()],
          ["Enemies slain", s.kills]
        ])}
        <div class="menu">
          ${prologue ? btn({ id: "expedition", label: "Begin a full Expedition", cls: "primary", autofocus: true }) : last ? btn({ id: "ending", label: "Ring the Ninth Bell", cls: "primary", autofocus: true }) : btn({ id: "ascend", label: `Ascend to Tier ${TIER_NAMES[s.tier]}`, cls: "primary", autofocus: true })}
          ${btn({ id: "title", label: "Back to title" })}
        </div>
        <p class="sub small">${prologue ? "The Expedition is three Tiers on a new map every run." : last ? "" : "Your level, abilities, gear, Ichor, flasks and Candles carry over. The next Tier heals you fully, and your game is saved."}</p>`
    }),
    onBack: null
  });
  const $ = (id) => app.ui.$(`#${id}`);
  $("ascend") && ($("ascend").onclick = () => app.nextTier());
  $("ending") && ($("ending").onclick = () => app.playEnding());
  $("expedition") && ($("expedition").onclick = () => app.startRun({ mode: "expedition", seed: app.draft.seed, character: s.character, tier: 1, allAbilities: false }));
  $("title").onclick = () => app.quitToTitle();
}

export function overScreen(app) {
  const s = app.sim;
  if (!s) return;
  app.setScreen("over");
  app.ui.show({
    id: "over",
    cls: "center",
    html: panel({
      title: "The Blight takes you",
      sub: `Your last Candle burned out. Fell to ${esc(s.lastDeathCause || "the Ruin")}.`,
      body: `
        ${statList([
          ["Reached", esc(s.map.tier.name)],
          ["Seals", `${s.seals} of ${s.heraldCount}`],
          ["Enemies slain", s.kills],
          ["Level", s.player.level],
          ["Lead", esc(KITS[s.character].name)],
          ["Quests finished", s.story.finishedCount()]
        ])}
        <div class="menu">
          ${btn({ id: "again", label: "Try this seed again", cls: "primary", autofocus: true })}
          ${btn({ id: "title", label: "Back to title" })}
        </div>`
    }),
    onBack: null
  });
  app.ui.$("#again").onclick = () => app.startRun({ mode: app.run.mode, seed: app.run.seed, character: s.character, tier: 1, allAbilities: app.run.allAbilities });
  app.ui.$("#title").onclick = () => app.quitToTitle();
}
