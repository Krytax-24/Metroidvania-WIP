// The in-game HUD: DOM layered over the canvas. Every write goes through a small cache so the page is only
// touched when a value actually changes (a still frame causes no DOM work at all).
import { ABILITIES, GEN } from "../gen/index.js";
import { PLAYER_TUNING as P } from "../data/tunables.js";
import { ROLE_NAMES, ABILITY_COLORS } from "../data/palette.js";
import { fillText } from "../data/practice.js";
import { PHASE_NAMES } from "../sim/sim.js";

const fmt = (sec) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const pct = (f) => `${Math.round(Math.max(0, Math.min(1, f)) * 1000) / 10}%`;

class Hud {
  el;
  chip = 1;
  bossChip = 1;
  cache = new Map();
  nodes = new Map();
  /** Turns an action id into the label of the device in use. Set by the app. */
  labelFn = (a) => a;

  constructor(host) {
    this.el = document.createElement("div");
    this.el.className = "hud";
    this.el.innerHTML = `
      <div class="hud-tl">
        <div class="bar hp"><i class="chip"></i><i class="fill"></i><span class="hp-text"></span></div>
        <div class="bar fervor"><i class="fill"></i></div>
        <div class="row">
          <span class="flasks" aria-label="Ember Flasks"></span>
          <span class="resolve" title="Resolve"><i></i></span>
          <span class="candles" aria-label="Candles"></span>
        </div>
      </div>
      <div class="hud-tr">
        <div class="clock"><b class="time"></b><span class="phase"></span></div>
        <div class="phasebar"><i></i><i></i><i></i><i></i></div>
        <div class="meta"><span class="seals"></span><span class="ichor"></span><span class="level"></span></div>
      </div>
      <div class="hud-bl"><span class="abilities"></span><span class="where"></span></div>
      <div class="quests" aria-label="Active quests"></div>
      <div class="drill" hidden><b class="drill-name"></b><span class="drill-text"></span><em class="drill-count"></em></div>
      <div class="boss" hidden>
        <div class="boss-name"><b></b><span></span></div>
        <div class="bar boss-bar"><i class="chip"></i><i class="fill"></i><span class="notches"></span></div>
        <div class="affixes"></div>
      </div>
      <div class="prompt" hidden></div>
      <div class="toasts" role="status" aria-live="polite" aria-atomic="false"></div>
      <div class="intro" hidden aria-hidden="true"><span></span><b></b></div>
    `;
    host.appendChild(this.el);
  }

  q(sel) {
    let n = this.nodes.get(sel);
    if (!n) {
      n = this.el.querySelector(sel);
      this.nodes.set(sel, n);
    }
    return n;
  }

  /** Runs `fn(node)` only when `value` differs from the last value stored under `key`. */
  put(key, sel, value, fn) {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    fn(this.q(sel), value);
  }

  text(sel, v) {
    this.put(`t:${sel}`, sel, v, (n, x) => (n.textContent = x));
  }

  html(sel, v) {
    this.put(`h:${sel}`, sel, v, (n, x) => (n.innerHTML = x));
  }

  width(sel, v) {
    this.put(`w:${sel}`, sel, v, (n, x) => (n.style.width = x));
  }

  hidden(sel, v) {
    this.put(`x:${sel}`, sel, v, (n, x) => (n.hidden = x));
  }

  toggle(sel, cls, on) {
    this.put(`c:${sel}.${cls}`, sel, on, (n, x) => n.classList.toggle(cls, x));
  }

  /** Forgets every cached value so the next update repaints everything (after a new run starts). */
  reset() {
    this.cache.clear();
    this.chip = 1;
    this.bossChip = 1;
  }

  toast(text, tone = "info") {
    const box = this.q(".toasts");
    const t = document.createElement("div");
    t.className = `toast tone-${tone}`;
    t.textContent = text;
    box.appendChild(t);
    while (box.children.length > 3) box.firstElementChild?.remove();
    setTimeout(() => t.classList.add("out"), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  bossIntro(name, title) {
    const el = this.q(".intro");
    el.querySelector("span").textContent = title;
    el.querySelector("b").textContent = name;
    el.hidden = false;
    el.classList.remove("out");
    setTimeout(() => el.classList.add("out"), 1800);
    setTimeout(() => (el.hidden = true), 2400);
  }

  update(sim) {
    const p = sim.player;
    const practice = sim.practiceMode;
    const hpF = Math.max(0, p.hp / p.maxHp);
    this.chip = Math.max(hpF, this.chip - 6e-3);
    if (this.chip < hpF) this.chip = hpF;
    this.width(".hp .fill", pct(hpF));
    this.width(".hp .chip", pct(this.chip));
    this.put("hp-w", ".hp", `${Math.min(100, 60 + (p.maxHp - P.baseHp) * 0.25)}%`, (n, x) => n.style.setProperty("--w", x));
    this.text(".hp-text", `${Math.ceil(p.hp)} / ${p.maxHp}`);
    this.toggle(".hp", "low", hpF < 0.3);
    this.width(".fervor .fill", pct(p.fervor / P.fervor.max));
    this.toggle(".fervor", "ready", p.fervor >= sim.kit.skill.cost);
    this.html(".flasks", Array.from({ length: p.flaskMax }, (_, i) => `<i class="${i < p.flasks ? "on" : ""}"></i>`).join(""));
    this.put("res", ".resolve i", pct(p.resolve / P.resolve.max), (n, x) => (n.style.height = x));
    this.toggle(".resolve", "ready", p.resolve >= P.resolve.max);
    const rite = sim.boss && sim.boss.alive && sim.boss.room === sim.currentRoom;
    this.html(
      ".candles",
      Array.from({ length: 3 }, (_, i) => `<i class="${i < sim.candles ? "on" : ""}"></i>`).join("") + (rite ? `<i class="rite ${sim.lastRite ? "on" : ""}" title="Last Rite"></i>` : "")
    );

    // Top right: clock for expeditions, a plain label for the Yard.
    this.hidden(".clock", practice);
    this.hidden(".phasebar", practice);
    if (!practice) {
      const remaining = sim.clockSecTotal - sim.clockSec;
      this.text(".time", sim.clockStarted ? fmt(remaining) : fmt(sim.clockSecTotal));
      const paused = sim.currentRoom === sim.map.wardenRoom;
      this.text(".phase", paused ? "Clock paused" : PHASE_NAMES[sim.blightPhase]);
      const nextStart = sim.blightPhase < 3 ? GEN.phaseStarts[sim.blightPhase] * sim.clockSecTotal : sim.clockSecTotal;
      this.toggle(".clock", "warn", sim.blightPhase < 4 && sim.clockSec >= nextStart - 60 && sim.clockStarted);
      this.toggle(".clock", "blight", sim.blightPhase > 0);
      for (let i = 0; i < 4; i++) this.put(`pb${i}`, `.phasebar i:nth-child(${i + 1})`, sim.blightPhase > i, (n, x) => n.classList.toggle("on", x));
      this.text(".seals", `Seals ${sim.seals}/${sim.heraldCount}`);
    } else this.text(".seals", sim.practice ? `Drills ${sim.practice.doneCount}/${sim.practice.drills.length}` : "");
    this.text(".ichor", practice ? "" : `Ichor ${sim.ichor}`);
    this.text(".level", practice ? "" : `Lv ${p.level}`);

    const owned = [...sim.map.abilities.prior, ...sim.map.abilities.found];
    this.html(".abilities", owned.map((a) => `<i class="${sim.abilities.has(a) ? "on" : ""}" style="--c:${ABILITY_COLORS[a]}" title="${ABILITIES[a].name}"></i>`).join(""));
    const room = sim.room();
    const consumed = sim.roomConsumed(room);
    this.text(".where", `${ROLE_NAMES[room.role] ?? room.role}${room.sanctuary && room.role !== "entry" ? " · Sanctuary" : ""}${consumed ? " · Blighted" : ""}`);
    this.toggle(".where", "blight", consumed);

    // Quest tracker.
    const quests = practice ? [] : sim.story.journal().filter((j) => j.status === "active" || j.status === "ready");
    this.html(
      ".quests",
      quests.map((j) => `<div class="${j.status}"><b>${j.title}</b><span>${j.status === "ready" ? `Return to ${j.npc}` : `${Math.min(j.progress, j.target)}/${j.target}`}</span></div>`).join("")
    );

    // Drill reminder.
    const next = practice && sim.practice ? sim.practice.next() : null;
    this.hidden(".drill", !next);
    if (next) {
      this.text(".drill-name", next.name);
      this.text(".drill-text", fillText(next.text, this.labelFn));
      this.text(".drill-count", next.goal.n > 1 ? `${next.progress}/${next.goal.n}` : "");
    }

    // Boss bar.
    const b = sim.boss;
    const showBoss = !!b && b.alive && b.room === sim.currentRoom && (b.state !== "intro" || b.t > 0) && sim.world.roomAt(p.cx, p.cy) === b.room;
    this.hidden(".boss", !showBoss);
    if (showBoss && b) {
      const f = b.hp / b.maxHp;
      this.bossChip = Math.max(f, this.bossChip - 4e-3);
      if (this.bossChip < f) this.bossChip = f;
      this.text(".boss-name b", b.name);
      this.text(".boss-name span", b.title);
      this.width(".boss-bar .fill", pct(f));
      this.width(".boss-bar .chip", pct(this.bossChip));
      this.html(".notches", b.def.phases.slice(1).map((t) => `<i style="left:${t * 100}%"></i>`).join(""));
      const aff = [];
      if (b.damageScale > 1.01 && b.def.id === "herald" && sim.roomConsumed(sim.room(b.room))) aff.push("Blighted");
      if (b.def.id === "warden" && sim.empower > 0) aff.push(`Seal Empowerment x${sim.empower}`);
      this.html(".affixes", aff.map((a) => `<span>${a}</span>`).join(""));
    } else this.bossChip = 1;

    // Interaction prompt, using whatever key, button or touch label the player has bound.
    const hint = sim.mode === "play" ? sim.interactHint() : null;
    this.hidden(".prompt", !hint);
    if (hint) {
      let extra = "";
      if (hint === "Warden's Gate") extra = sim.seals >= sim.heraldCount ? ` · open now for +${sim.gateBonus()} Ichor` : ` · ${sim.seals}/${sim.heraldCount} Seals`;
      this.html(".prompt", `<kbd>${this.labelFn("interact")}</kbd> ${hint}${extra}`);
    }
  }
}
export { Hud };
