// Screens shown during a run: pause, Sanctuary, map and the Boon choice.
import { BOONS } from "../../data/gear.js";
import { KITS } from "../../data/kits.js";
import { keeperLine } from "../../data/story.js";
import { drawMap } from "../mapdraw.js";
import { btn, esc, gearSummary, itemRow, panel } from "../kit.js";

const TIER_NAMES = ["I", "II", "III"];

export function pauseScreen(app) {
  const sim = app.sim;
  if (!sim) return;
  app.setScreen("pause");
  const yard = sim.practiceMode;
  const open = sim.story.journal().filter((j) => j.status === "active" || j.status === "ready").length;
  app.audio.pauseMusic();
  app.ui.show({
    id: "pause",
    cls: "center",
    html: panel({
      title: "Paused",
      sub: `${esc(KITS[sim.character].name)}${yard ? " in the Training Yard" : `, seed ${esc(sim.seed)}, ${esc(sim.map.tier.name)}`}`,
      body: `
        <div class="menu">
          ${btn({ id: "resume", label: "Resume", cls: "primary", autofocus: true })}
          ${yard ? btn({ id: "board", label: "Drill board", sub: `${sim.practice.doneCount} of ${sim.practice.drills.length} done` }) : btn({ id: "journal", label: "Journal", sub: open ? `${open} open quest${open === 1 ? "" : "s"}` : "Story and quests" })}
          <div class="menu row2">${btn({ id: "settings", label: "Settings" })}${btn({ id: "controls", label: "Controls" })}</div>
          ${yard ? "" : btn({ id: "restart", label: "Restart this Tier", sub: "Back to the state you entered it in" })}
          ${btn({ id: "quit", label: yard ? "Leave the Yard" : "Quit to title", sub: yard ? "" : "Progress since your last Sanctuary rest is not kept" })}
        </div>
        ${yard ? "" : gearSummary(app.assets, sim)}`
    }),
    onBack: () => app.resume()
  });
  const $ = (id) => app.ui.$(`#${id}`);
  $("resume").onclick = () => app.resume();
  $("board") && ($("board").onclick = () => app.openBoard(() => pauseScreen(app)));
  $("journal") && ($("journal").onclick = () => app.openJournal(() => pauseScreen(app)));
  $("settings").onclick = () => app.openSettings(() => pauseScreen(app));
  $("controls").onclick = () => app.openControls(() => pauseScreen(app));
  $("restart") && ($("restart").onclick = () => app.restartTier());
  $("quit").onclick = () => app.quitToTitle();
}

export function sanctuaryScreen(app) {
  const sim = app.sim;
  const s = sim?.sanctuaryHere();
  if (!s) return;
  app.setScreen("sanctuary");
  const cost = sim.levelCost();
  const temperCost = sim.temperCost();
  const travel = sim.travelTargets().filter((t) => t.room !== s.room);
  const name = (room) => {
    if (room === sim.map.entryRoom) return "Entry Sanctuary";
    if (room === sim.map.gateRoom) return "Gate Sanctuary";
    return `Sanctuary, zone ${sim.room(room).zone}`;
  };
  const [l1, l2] = keeperLine(sim.tier, app.keeperCounter);
  app.ui.show({
    id: "sanctuary",
    cls: "center",
    html: panel({
      cls: "sanct",
      title: name(s.room),
      sub: s.dark ? "The Blight has put out this flame. You can only travel from here." : "Resting heals you, refills your flasks and Fervor, sets your respawn here and saves the game. Enemies in this zone return.",
      body: `
        <blockquote class="keeper"><b>Oswin</b> ${esc(l1)}${l2 ? ` ${esc(l2)}` : ""}</blockquote>
        <div class="menu">
          ${btn({ id: "rest", label: "Rest", cls: "primary", disabled: s.dark, autofocus: !s.dark })}
          ${btn({ id: "level", label: `Level up to ${sim.player.level + 1}`, sub: `${cost ?? "max"} Ichor`, disabled: s.dark || cost === null || sim.ichor < cost })}
          ${btn({ id: "temper", label: temperCost === null ? (sim.gear.weapon ? "Weapon fully tempered" : "Temper weapon (find a weapon first)") : `Temper ${esc(sim.gear.weapon.name)}`, sub: temperCost === null ? "" : `${temperCost} Bone Dust`, disabled: s.dark || temperCost === null || sim.boneDust < temperCost })}
          ${travel.map((t) => btn({ label: `Travel: ${name(t.room)}${t.dark ? " (dark)" : ""}`, data: { travel: t.room } })).join("")}
          ${btn({ id: "leave", label: "Leave", autofocus: s.dark })}
        </div>
        <p class="sub small">Ichor ${sim.ichor}, level ${sim.player.level}. The clock keeps running while you rest.</p>
        ${gearSummary(app.assets, sim)}`
    }),
    onBack: () => app.resume()
  });
  const $ = (id) => app.ui.$(`#${id}`);
  $("rest").onclick = () => {
    if (sim.rest()) {
      app.keeperCounter++;
      app.sfx("heal");
      app.hud.toast("Rested. Respawn set and game saved.");
    }
    sanctuaryScreen(app);
  };
  $("level").onclick = () => {
    if (sim.levelUp()) app.sfx("levelUp");
    sanctuaryScreen(app);
  };
  $("temper").onclick = () => {
    if (sim.temper()) {
      app.sfx("levelUp");
      app.hud.toast("Weapon tempered");
    }
    sanctuaryScreen(app);
  };
  app.ui.$$("[data-travel]").forEach((b) => {
    b.onclick = () => {
      sim.travel(Number(b.dataset.travel));
      app.renderer.resetCamera();
      app.resume();
    };
  });
  $("leave").onclick = () => app.resume();
}

export function mapScreen(app) {
  const sim = app.sim;
  if (!sim) return;
  app.setScreen("map");
  app.ui.show({
    id: "map",
    cls: "center",
    html: panel({
      cls: "map",
      title: sim.practiceMode ? "The Training Yard" : sim.map.tier.name,
      body: `<canvas id="mapc" width="900" height="560" role="img" aria-label="Map of the explored rooms"></canvas>
        <p class="sub small">Gold: Sanctuaries. Diamonds: gates, coloured when you own the ability. Violet rooms: Blight. Violet square: your dropped Ichor. Blue dot: someone to talk to.</p>
        ${btn({ id: "close", label: "Close", autofocus: true })}`
    }),
    onBack: () => app.resume()
  });
  app.ui.$("#close").onclick = () => app.resume();
  drawMap(app.ui.$("#mapc"), sim);
}

export function boonScreen(app) {
  const sim = app.sim;
  if (!sim || !sim.boonOffer) return;
  app.setScreen("boon");
  app.ui.show({
    id: "boon",
    cls: "center",
    html: panel({
      title: "Choose a Boon",
      sub: "The fallen Herald leaves a gift. Take one; it lasts the whole Expedition.",
      body: `<div class="menu">${sim.boonOffer
        .map((id, i) => btn({ cls: `boon ${i === 0 ? "primary" : ""}`, data: { boon: id }, autofocus: i === 0, label: itemRow(app.assets, { icon: BOONS[id].icon, title: BOONS[id].name, desc: BOONS[id].desc }, 32) }))
        .join("")}</div>`
    }),
    onBack: null
  });
  app.ui.$$("[data-boon]").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.boon;
      if (sim.chooseBoon(id)) {
        app.sfx("levelUp");
        app.hud.toast(`Boon: ${BOONS[id].name}`, "boss");
      }
      app.resume();
    };
  });
}

export { TIER_NAMES };
