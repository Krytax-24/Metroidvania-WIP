// Turns simulation events into sound, HUD messages, rumble and screens. The simulation never calls this; the
// app drains its event list every tick and hands each event here.
import { dialogueScreen } from "../ui/screens/talk.js";
import { sanctuaryScreen } from "../ui/screens/play.js";

const SOUND_FOR = {
  riposte: "riposte",
  stagger: "stagger",
  dodge: "dodge",
  jump: "jump",
  land: "land",
  enemyDeath: "enemyDeath",
  skill: "skill",
  ultimate: "ultimate",
  ability: "ability",
  loot: "pickup",
  break: "break",
  gear: "pickup",
  lastRite: "levelUp",
  hazard: "hurt",
  secretFound: "secret"
};

export function handleEvents(app) {
  const sim = app.sim;
  if (!sim) return;
  for (const e of sim.drainEvents()) {
    app.renderer.onEvent(e, sim);
    const sound = SOUND_FOR[e.type];
    if (sound) app.sfx(sound);
    switch (e.type) {
      case "telegraph":
        app.audio.telegraph(e.tele, e.boss);
        break;
      case "swing":
        app.sfx(e.heavy ? "heavySwing" : "swing");
        break;
      case "hit":
        app.sfx(e.target === "player" ? "hurt" : e.heavy ? "heavyHit" : "hit");
        if (e.target === "player") {
          app.input.rumble(160, 0.8);
          app.input.buzz(40);
        } else if (e.heavy) app.input.rumble(70, 0.4);
        break;
      case "parry":
        app.sfx("parry");
        app.input.rumble(90, 0.5);
        break;
      case "heal":
        app.sfx("heal");
        break;
      case "toast":
        app.hud.toast(e.text, e.tone);
        break;
      case "bossIntro":
        app.hud.bossIntro(e.name, e.title);
        app.sfx("bell");
        break;
      case "bossPhase":
        app.hud.toast("The foe grows desperate", "boss");
        break;
      case "bossDefeated":
        app.sfx("bossDeath");
        app.hud.bossIntro(e.name, e.warden ? "Warden defeated" : "Herald defeated");
        break;
      case "blightPhase":
      case "blightWarning":
        app.sfx("bell");
        break;
      case "gateOpened":
        app.sfx("bell");
        app.hud.toast(e.nightfall ? "The Gate is open. Missing Seals empower the Warden." : `The Gate opens. +${e.bonus} Vigil Ichor.`, "boss");
        break;
      case "playerDeath":
        // Anything open over the world closes; a pending Boon waits until the player is back in play.
        if (["sanctuary", "map", "boon"].includes(app.screen)) app.resume();
        app.sfx("death");
        app.hud.toast(`You fell to ${e.cause}. ${sim.candles} Candle${sim.candles === 1 ? "" : "s"} left.`, "boss");
        app.input.rumble(300, 1);
        break;
      case "respawn":
        app.renderer.resetCamera();
        break;
      case "levelUp":
        app.hud.toast(`Level ${e.level}`);
        break;
      case "sanctuary":
        app.sfx("ui");
        sanctuaryScreen(app);
        break;
      case "talk":
        dialogueScreen(app, e.uid);
        break;
      case "quest":
        if (e.status === "done") app.sfx("questDone");
        break;
      case "drillDone":
        app.practiceLog.mark(sim.character, e.id);
        app.sfx("drill");
        app.hud.toast(`Drill done: ${e.name}`, "boss");
        break;
      case "checkpoint":
        app.save();
        break;
      case "tierCleared":
        app.onTierCleared();
        break;
      case "boonOffer":
        app.boonAt = performance.now() + 1600;
        break;
      case "expeditionOver":
        app.onExpeditionOver();
        break;
      default:
        break;
    }
  }
}

