// Conversations, quest rewards, the journal and the Yard's drill board.
import { DIALOGUE, LORE, NPCS, PREMISE, QUESTS } from "../../data/story.js";
import { KITS, KIT_ORDER } from "../../data/kits.js";
import { fillText } from "../../data/practice.js";
import { btn, esc, itemRow, panel, TELEGRAPH_LEGEND } from "../kit.js";

const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Reveals `text` one character at a time. Returns a function that finishes it at once. */
function typeText(el, text, onDone) {
  if (reduceMotion()) {
    el.textContent = text;
    onDone();
    return () => {};
  }
  let i = 0;
  let timer = 0;
  const finish = () => {
    clearInterval(timer);
    el.textContent = text;
    onDone();
    onDone = () => {};
  };
  timer = setInterval(() => {
    i += 2;
    el.textContent = text.slice(0, i);
    if (i >= text.length) finish();
  }, 22);
  return finish;
}

export function dialogueScreen(app, uid) {
  const sim = app.sim;
  const npc = sim?.story.npc(uid);
  if (!npc) return;
  const def = NPCS[npc.id];
  const script = DIALOGUE[npc.dialogue ?? npc.id];
  if (!script) return;
  app.setScreen("dialogue");
  sim.talk(uid);
  const q = sim.story.stateFor(npc);
  app.audio.duckMusic(1, 0.6);

  const go = (nodeId) => {
    const node = script.nodes[nodeId];
    let lines = node.lines;
    if (node.lore) {
      const set = LORE[node.lore];
      lines = set[(sim.tier + npc.x + app.keeperCounter) % set.length];
    }
    let index = 0;
    app.ui.show({
      id: "dialogue",
      cls: "dialogue-bg",
      html: `<div class="dialogue" role="dialog" aria-label="Conversation with ${esc(def.name)}">
        <canvas class="dlg-portrait" width="96" height="96" aria-hidden="true"></canvas>
        <div class="dlg-body">
          <b class="dlg-name">${esc(def.name)} <small>${esc(def.title)}</small></b>
          <p class="dlg-text" aria-live="polite"></p>
          <div class="dlg-actions menu"></div>
        </div>
      </div>`,
      onBack: () => app.resume()
    });
    app.startPreviews([{ cv: app.ui.$(".dlg-portrait"), npc: npc.id }]);
    const textEl = app.ui.$(".dlg-text");
    const actions = app.ui.$(".dlg-actions");
    let finishTyping = () => {};
    let typing = false;

    const showChoices = () => {
      typing = false;
      const choices = node.choices ?? [{ text: "Farewell.", act: "close" }];
      actions.innerHTML = choices
        .map((c, i) => {
          const tradeBlocked = c.act === "trade" && !sim.story.canTrade();
          return btn({ cls: i === 0 ? "primary" : "", data: { i }, label: esc(c.text), disabled: tradeBlocked, sub: c.act === "trade" ? (tradeBlocked ? "Needs 2 Bone Dust" : "Costs 2 Bone Dust") : "", autofocus: i === 0 });
        })
        .join("");
      actions.querySelector("[autofocus]")?.focus();
      actions.querySelectorAll("button").forEach((b) => (b.onclick = () => choose(choices[Number(b.dataset.i)])));
    };
    const nextLine = () => {
      if (typing) {
        finishTyping();
        return;
      }
      if (index >= lines.length) return showChoices();
      typing = true;
      actions.innerHTML = btn({ id: "dlg-next", label: index < lines.length - 1 ? "Continue" : "Reply", cls: "primary", autofocus: true });
      actions.querySelector("button").onclick = nextLine;
      actions.querySelector("button").focus();
      const text = lines[index++];
      finishTyping = typeText(textEl, text, () => {
        typing = false;
      });
      app.sfx("talk");
    };
    textEl.onclick = nextLine;
    if (lines.length === 0) showChoices();
    else nextLine();
  };

  const choose = (c) => {
    switch (c.act) {
      case "accept":
        if (sim.story.accept(npc.quest)) app.sfx("questAccept");
        app.resume();
        break;
      case "turnin": {
        const r = sim.story.turnIn(npc.quest);
        if (r) rewardScreen(app, r, npc.id);
        else app.resume();
        break;
      }
      case "trade": {
        const r = sim.story.trade();
        if (r) rewardScreen(app, { ...r, quest: "A fair trade" }, npc.id);
        else {
          app.sfx("uiError");
          app.hud.toast("Gel wants 2 Bone Dust.");
          app.resume();
        }
        break;
      }
      case "board":
        app.openBoard(() => dialogueScreen(app, uid));
        break;
      case "leave":
        app.quitToTitle();
        break;
      default:
        if (c.next) go(c.next);
        else app.resume();
    }
  };

  go(script.start(q));
}

function rewardScreen(app, reward, npcId) {
  app.setScreen("reward");
  app.sfx("reward");
  app.audio.duckMusic(1.6, 0.4);
  const giver = NPCS[npcId]?.name ?? "Someone";
  app.ui.show({
    id: "reward",
    cls: "center",
    html: panel({
      cls: "reward",
      title: esc(reward.quest ?? "A gift"),
      sub: `${esc(giver)} hands you ${esc(reward.wrap ?? "a gift")}.`,
      body: `
        <div class="reward-card">${itemRow(app.assets, { icon: reward.icon, title: reward.title, desc: reward.desc }, 64)}</div>
        <div class="menu">${btn({ id: "take", label: "Take it", cls: "primary", autofocus: true })}</div>`
    }),
    onBack: null
  });
  app.ui.$("#take").onclick = () => {
    app.sfx("pickup");
    app.resume();
  };
}

const STATUS_TEXT = { offered: "Offered", active: "In progress", ready: "Ready to hand in", done: "Finished" };

export function journalScreen(app, back) {
  const sim = app.sim;
  if (!sim) return;
  app.setScreen(app.screen === "pause" ? "pause" : "journal");
  const quests = sim.story.journal();
  app.ui.show({
    id: "journal",
    cls: "center",
    html: panel({
      cls: "journal",
      title: "Journal",
      sub: "What the Ruin has told you so far.",
      body: `
        <section><h3 class="label">Quests</h3>
          ${quests.length === 0 ? `<p class="dim">Nobody has asked anything of you yet. Look for people near Sanctuaries, marked with a gold !</p>` : quests.map((j) => `<div class="quest ${j.status}"><b>${esc(j.title)}</b><span class="tag">${STATUS_TEXT[j.status]}</span><p>${esc(j.summary)}</p><small>${esc(j.npc)}${j.status === "active" || j.status === "ready" ? `, ${Math.min(j.progress, j.target)} of ${j.target}` : ""}</small></div>`).join("")}
        </section>
        <section><h3 class="label">The Ruin</h3><p>${esc(PREMISE.bell)}</p><p>${esc(PREMISE.unshriven)}</p></section>
        <div class="menu">${btn({ id: "close", label: "Close", cls: "primary", autofocus: true })}</div>`
    }),
    onBack: back ?? (() => app.resume())
  });
  app.ui.$("#close").onclick = back ?? (() => app.resume());
}

export function boardScreen(app, back) {
  const sim = app.sim;
  if (!sim?.practice) return;
  const pr = sim.practice;
  app.setScreen(app.screen === "pause" ? "pause" : "board");
  const groups = [...new Set(pr.drills.map((d) => d.group))];
  app.ui.show({
    id: "board",
    cls: "center",
    html: panel({
      cls: "board",
      title: "Drill board",
      sub: `${pr.doneCount} of ${pr.drills.length} drills finished with ${esc(KITS[sim.character].name)}. Progress is kept for each lead.`,
      body: `
        ${groups.map((g) => `<section><h3 class="label">${esc(g)}</h3>${pr.drills.filter((d) => d.group === g).map((d) => `<div class="drill-row ${d.done ? "done" : ""}"><span class="check" aria-hidden="true">${d.done ? "✓" : ""}</span><div><b>${esc(d.name)}</b><span>${esc(fillText(d.text, (a) => app.label(a)))}</span></div><em>${d.goal.n > 1 && !d.done ? `${d.progress}/${d.goal.n}` : d.done ? "Done" : ""}</em></div>`).join("")}</section>`).join("")}
        ${TELEGRAPH_LEGEND}
        <h3 class="label">Switch lead</h3>
        <div class="menu row2">${KIT_ORDER.map((id) => btn({ cls: id === sim.character ? "primary" : "", data: { lead: id }, label: esc(KITS[id].name), disabled: id === sim.character })).join("")}</div>
        <div class="menu row2">${btn({ id: "reset", label: "Reset this lead's progress" })}${btn({ id: "close", label: "Close", cls: "primary", autofocus: true })}</div>`
    }),
    onBack: back
  });
  app.ui.$("#close").onclick = back;
  app.ui.$("#reset").onclick = () => {
    app.practiceLog.reset(sim.character);
    for (const d of pr.drills) {
      d.done = false;
      d.progress = 0;
    }
    app.sfx("uiBack");
    boardScreen(app, back);
  };
  app.ui.$$("[data-lead]").forEach((b) => {
    b.onclick = () => app.startRun({ mode: "practice", seed: "yard", character: b.dataset.lead, tier: 1, allAbilities: true });
  });
}

export { QUESTS };
