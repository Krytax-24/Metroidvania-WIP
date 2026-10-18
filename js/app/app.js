// The application: owns every service, the screen state machine, the run lifecycle (start, continue, save,
// next Tier, game over) and the frame loop. Screens live in js/ui/screens and only talk to this object.
import { randomSeed } from "../gen/index.js";
import { KITS } from "../data/kits.js";
import { NPCS } from "../data/story.js";
import { Sim } from "../sim/sim.js";
import { emptyInput } from "../sim/types.js";
import { Assets } from "../game/assets.js";
import { Audio } from "../game/audio.js";
import { CHAR_ART } from "../game/anims.js";
import { Hud } from "../game/hud.js";
import { Input } from "../game/input.js";
import { Renderer } from "../game/renderer.js";
import { Cutscene } from "../ui/cutscene.js";
import { UI } from "../ui/ui.js";
import { boonScreen, mapScreen, pauseScreen } from "../ui/screens/play.js";
import { clearedScreen, overScreen } from "../ui/screens/outcome.js";
import { boardScreen, journalScreen } from "../ui/screens/talk.js";
import { controlsScreen } from "../ui/screens/controls.js";
import { settingsScreen } from "../ui/screens/settings.js";
import { creditsScreen, titleScreen } from "../ui/screens/title.js";
import { handleEvents } from "./events.js";
import { Keybinds } from "./keybinds.js";
import { PracticeLog, Profile, SaveSlot } from "./save.js";
import { Settings } from "./settings.js";
import { Store } from "./store.js";

const STEP = 1000 / 60;
const TIER_NAMES = ["I", "II", "III"];
/** Screens where the world keeps ticking with no input (the clock and the Blight do not wait for a menu). */
const IDLE_STEP = new Set(["sanctuary", "map", "boon"]);
/** Screens that own the whole display, so the world is not drawn behind them. */
const NO_WORLD = new Set(["title", "cutscene", "boot"]);

export class App {
  PROLOGUE_SEED = "ashen-prologue";

  constructor({ stage, overlay, rotateEl }) {
    this.stage = stage;
    this.rotateEl = rotateEl;
    this.store = new Store();
    this.settings = new Settings(this.store);
    this.binds = new Keybinds(this.store);
    this.saves = new SaveSlot(this.store);
    this.practiceLog = new PracticeLog(this.store);
    this.profile = new Profile(this.store);
    this.assets = new Assets();
    this.audio = new Audio();
    this.ui = new UI(overlay, { onFocusMove: () => this.sfx("ui") });
    this.screen = "boot";
    this.sim = null;
    this.run = { mode: "expedition", seed: this.PROLOGUE_SEED, character: "gino", startTier: 1, allAbilities: false };
    this.draft = {
      seed: this.store.get("seed") ?? randomSeed(),
      character: KITS[this.store.get("char")] ? this.store.get("char") : "gino",
      allAbilities: false,
      startTier: 1
    };
    this.menuBiome = Math.floor(Math.random() * 3);
    this.keeperCounter = 0;
    this.boonAt = 0;
    this.starting = false;
    this.tierStart = { carry: undefined, snapshot: null };
    this.previews = [];
    this.acc = 0;
    this.last = performance.now();
    this.mouseX = 0.5;
    this.musicTick = 0;
    this.intensity = 0.3;
  }

  // ------------------------------------------------------------------ boot

  async boot() {
    this.bootScreen("Loading art", 0);
    try {
      await this.assets.load("assets/", (p) => this.bootScreen("Loading art", p));
    } catch (err) {
      this.ui.show({
        id: "error",
        html: `<div class="panel"><h2>Could not load the art</h2><p class="sub">${String(err.message).replace(/</g, "&lt;")}</p><p class="sub small">Start the game with <code>python serve.py</code> from the game folder, then open the address it prints. Opening index.html directly will not work in most browsers.</p></div>`
      });
      return;
    }
    this.renderer = new Renderer(this.stage, this.assets);
    this.hud = new Hud(this.stage);
    this.hud.el.hidden = true;
    this.input = new Input(this.stage, { binds: this.binds, settings: this.settings });
    this.cutscene = new Cutscene(this);
    this.hud.labelFn = (a) => this.label(a);
    this.renderer.labelFn = (a) => this.label(a);
    this.wireInput();
    this.applySettings("*");
    this.settings.onChange((k) => this.applySettings(k));
    this.binds.onChange(() => this.hud.reset());
    new ResizeObserver(() => this.fit()).observe(this.stage);
    window.addEventListener("orientationchange", () => this.fit());
    this.fit();
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.screen === "play") pauseScreen(this);
    });
    const unlock = () => this.audio.unlock();
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("pointerdown", unlock, { once: true });
    titleScreen(this);
    requestAnimationFrame((t) => this.frame(t));
  }

  bootScreen(msg, progress = 0) {
    this.ui.show({ id: "boot", html: `<div class="panel loading"><h2>Ashen Ascent</h2><p class="sub">${msg}</p><div class="loadbar"><i style="width:${Math.round(progress * 100)}%"></i></div></div>` });
  }

  wireInput() {
    const inp = this.input;
    inp.ownsTab = () => this.screen === "play" || this.screen === "map";
    inp.onMenu = (k) => this.ui.menu(k);
    inp.onDevice = () => this.hud.reset();
    inp.aim = () => {
      if (!this.sim) return 0;
      const d = this.mouseX - this.renderer.playerScreenX(this.sim);
      return Math.abs(d) < 0.015 ? 0 : Math.sign(d);
    };
    this.stage.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const r = this.renderer.canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) / r.width;
    });
    inp.onMeta = (k) => {
      this.audio.unlock();
      const s = this.screen;
      if (k === "pause") {
        if (s === "play") pauseScreen(this);
        else this.ui.back();
      } else if (k === "map") {
        if (s === "play") mapScreen(this);
        else if (s === "map") this.resume();
      } else if (k === "journal") {
        if (s === "play") journalScreen(this, () => this.resume());
        else if (s === "journal") this.resume();
      } else if (k === "fullscreen") this.toggleFullscreen();
      else if (k === "debug") this.renderer.opts.debug = !this.renderer.opts.debug;
      else if (k === "grant" && this.sim) {
        this.sim.debugGrantAll?.();
        this.hud.toast("Debug: all abilities granted");
      }
    };
  }

  /** Pushes one setting (or all of them, with "*") into the parts that use it. */
  applySettings(key) {
    const s = this.settings;
    const all = key === "*";
    if (all || ["master", "music", "sfx"].includes(key)) this.audio.setVolumes({ master: s.get("master"), music: s.get("music"), sfx: s.get("sfx") });
    if (all || key === "zoom") this.renderer.setZoom(s.get("zoom"));
    if (all || key === "shake") this.renderer.opts.shake = s.get("shake");
    if (all || key === "damageNumbers") this.renderer.opts.damageNumbers = s.get("damageNumbers");
    if (all || key === "flashes") this.renderer.opts.flashes = s.get("flashes");
  }

  // ------------------------------------------------------------------ small services for screens

  sfx(name) {
    this.audio.play(name);
  }

  /** The label of an action for the device the player used last: "E", "Y", "Use". */
  label(action) {
    const d = this.input?.lastDevice;
    return this.binds.prompt(action, d === "gamepad" ? "gamepad" : d === "touch" ? "touch" : "keyboard");
  }

  isFullscreen() {
    return !!document.fullscreenElement;
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen();
        await window.screen.orientation?.lock?.("landscape").catch(() => {});
      }
    } catch {
      /* the browser refused (iframe, permissions): nothing to do */
    }
  }

  /** Called by menu screens that are not part of a run. Title kind clears the run; pause kind keeps it. */
  enterMenu(kind = "title") {
    this.screen = kind;
    this.input.enabled = false;
    this.input.clear();
    if (kind === "title") {
      this.sim = null;
      this.starting = false;
      this.hud.el.hidden = true;
      this.audio.setScene("menu", { fade: 1.5 });
      this.audio.resumeMusic();
    }
  }

  /** Sets the screen name; only "play" takes keyboard, mouse and pad actions. */
  setScreen(name) {
    this.screen = name;
    this.input.enabled = name === "play";
    this.input.clear();
  }

  resume() {
    this.ui.hide();
    this.setScreen("play");
    this.audio.resumeMusic();
    this.hud.reset();
  }

  openSettings(back) {
    settingsScreen(this, back);
  }

  openControls(back) {
    controlsScreen(this, back);
  }

  openJournal(back) {
    journalScreen(this, back);
  }

  openBoard(back) {
    boardScreen(this, back);
  }

  /** Draws small animated figures on menu canvases: lead cards, the title strip and conversation portraits. */
  startPreviews(list) {
    this.previews = list.filter((p) => p.cv);
  }

  // ------------------------------------------------------------------ runs

  /** Plays each [sceneId, flag] in turn (skipping scenes already seen), then calls `done`. */
  playScenes(scenes, lead, done) {
    const next = () => {
      const item = scenes.shift();
      if (!item) return done();
      const [id, flag] = item;
      if (flag && this.profile.has(flag)) return next();
      if (flag) this.profile.setFlag(flag);
      this.cutscene.start(id, lead, next);
    };
    next();
  }

  /**
   * Starts a new run. `mode` is "expedition", "prologue" or "practice". Ignored while a run is already being built,
   * so a double click cannot make two simulations.
   */
  startRun({ mode = "expedition", seed, character, tier = 1, allAbilities = false, skipScenes = false }) {
    if (this.starting) return;
    this.starting = true;
    seed ??= mode === "practice" ? "yard" : mode === "prologue" ? this.PROLOGUE_SEED : this.draft.seed;
    character ??= this.draft.character;
    this.run = { mode, seed, character, startTier: tier, allAbilities };
    this.draft.character = character;
    this.store.set("char", character);
    const scenes = [];
    if (!skipScenes) {
      if (mode === "practice") scenes.push(["yard_intro", "seen:yard"]);
      else {
        if (tier === 1) scenes.push(["opening", "seen:opening"]);
        scenes.push([`tier${tier}_arrive`, `seen:tier${tier}`]);
      }
    }
    this.playScenes(scenes, character, () => this.beginTier(tier, undefined, null));
  }

  continueRun() {
    if (this.starting) return;
    const save = this.saves.read();
    if (!save) return;
    this.starting = true;
    this.run = { mode: save.mode ?? "expedition", seed: save.seed, character: save.character, startTier: save.tier, allAbilities: !!save.allAbilities };
    this.beginTier(save.tier, save.carry, save.snapshot ?? null);
  }

  restartTier() {
    if (!this.sim || this.starting) return;
    this.starting = true;
    this.beginTier(this.sim.tier, this.tierStart.carry, this.tierStart.snapshot);
  }

  nextTier() {
    const s = this.sim;
    if (!s || this.starting) return;
    this.starting = true;
    const tier = s.tier + 1;
    const carry = s.carry();
    this.playScenes([["ascent", null], [`tier${tier}_arrive`, `seen:tier${tier}`]], this.run.character, () => this.beginTier(tier, carry, null));
  }

  /** Builds the simulation for one Tier and drops the player into it. `snapshot` restores a checkpoint. */
  beginTier(tier, carry, snapshot) {
    const r = this.run;
    this.setScreen("loading");
    this.ui.show({ id: "loading", html: `<div class="panel loading"><h2>${r.mode === "practice" ? "Opening the Yard" : `Raising Tier ${TIER_NAMES[tier - 1]}`}</h2><p class="sub">The Ruin rearranges itself&hellip;</p></div>` });
    setTimeout(() => {
      const opts = { seed: r.seed, tier, carry, allAbilities: r.allAbilities, character: r.character, practice: r.mode === "practice", practiceDone: r.mode === "practice" ? this.practiceLog.done(r.character) : undefined };
      this.sim = snapshot ? Sim.restore(opts, snapshot) : new Sim(opts);
      this.tierStart = { carry, snapshot };
      this.renderer.resetMap();
      this.hud.reset();
      this.hud.el.hidden = false;
      this.boonAt = 0;
      this.ui.hide();
      this.setScreen("play");
      this.starting = false;
      this.acc = 0;
      this.last = performance.now();
      this.updateMusic(true);
      if (r.mode === "practice") {
        this.hud.toast("The Training Yard", "boss");
        if (this.settings.get("hints")) this.hud.toast(`Press ${this.label("interact")} beside Coach Brann for the drill board.`);
      } else {
        this.hud.toast(this.sim.map.tier.name, "boss");
        if (!snapshot && this.settings.get("hints")) this.hud.toast("Leave the Sanctuary to start the Blight clock.");
        if (!snapshot) this.save();
      }
    }, 30);
  }

  /** Writes the checkpoint: the Tier's seed, what the player carries, and the world's state at this Sanctuary. */
  save() {
    const s = this.sim;
    if (!s || s.practiceMode) return false;
    const ok = this.saves.write({ seed: s.seed, tier: s.tier, character: s.character, carry: s.carry(), snapshot: s.snapshot(), mode: this.run.mode, allAbilities: this.run.allAbilities });
    if (ok) this.sfx("save");
    return ok;
  }

  onTierCleared() {
    const s = this.sim;
    this.profile.best("tier", s.tier);
    if (s.tier < 3 && this.run.mode !== "prologue") {
      // The next Tier is the saved position from here on, so Continue never lands in a finished Tier.
      this.saves.write({ seed: s.seed, tier: s.tier + 1, character: s.character, carry: s.carry(), snapshot: null, mode: this.run.mode, allAbilities: this.run.allAbilities });
    } else this.saves.delete();
    setTimeout(() => {
      if (this.sim === s && this.screen !== "title") clearedScreen(this);
    }, 1500);
  }

  playEnding() {
    this.profile.bump("completions");
    this.saves.delete();
    this.playScenes([["ending", null]], this.run.character, () => creditsScreen(this));
  }

  onExpeditionOver() {
    const s = this.sim;
    this.saves.delete();
    setTimeout(() => {
      if (this.sim !== s || this.screen === "title") return;
      this.playScenes([["defeat", null]], this.run.character, () => overScreen(this));
    }, 1200);
  }

  quitToTitle() {
    titleScreen(this);
  }

  // ------------------------------------------------------------------ music

  /** The scene for what is happening now: boss fight, Yard, or the Tier's biome. */
  updateMusic(force = false) {
    const s = this.sim;
    if (!s) return;
    const inBoss = !!s.boss && s.boss.alive && s.boss.room === s.currentRoom && !!s.arenaLock;
    const scene = s.practiceMode ? "practice" : inBoss ? "boss" : s.map.tier.biome;
    this.audio.setScene(scene, { fade: force ? 1 : 2.2 });
    if (!s.practiceMode) {
      const awake = s.enemies.filter((e) => e.alive && (e.state === "chase" || e.state === "windup" || e.state === "active")).length;
      const target = Math.min(1, 0.22 + awake * 0.2 + (inBoss ? 0.4 : 0));
      this.intensity += (target - this.intensity) * 0.5;
      this.audio.setIntensity(this.intensity);
      this.audio.setBlight(s.blightPhase);
    }
  }

  // ------------------------------------------------------------------ loop

  frame(now) {
    this.acc += Math.min(250, now - this.last);
    this.last = now;
    this.input.pollPad();
    const sim = this.sim;
    const s = this.screen;
    if (s === "cutscene") {
      this.cutscene.tick(now);
      this.acc = 0;
    } else if (sim && !NO_WORLD.has(s)) {
      const live = s === "play";
      const idle = IDLE_STEP.has(s);
      while (this.acc >= STEP) {
        this.acc -= STEP;
        if (live) sim.step(this.input.frame());
        else if (idle) sim.step(emptyInput());
        handleEvents(this);
        if (this.sim !== sim || this.screen !== s) break;
      }
      this.renderer.render(sim, now);
      this.hud.update(sim);
      this.checkBoon(now);
      if (live && ++this.musicTick % 30 === 0) this.updateMusic();
    } else this.acc = 0;
    if (this.previews.length) this.drawPreviews(now);
    requestAnimationFrame((t) => this.frame(t));
  }

  /** A pending Boon opens once the player is back in play, however long that takes (pausing cannot lose it). */
  checkBoon(now) {
    const sim = this.sim;
    if (!sim.boonOffer) {
      this.boonAt = 0;
      return;
    }
    if (this.screen !== "play" || sim.mode !== "play" || sim.player.state === "dead") return;
    if (!this.boonAt) this.boonAt = now + 1600;
    else if (now >= this.boonAt) {
      this.boonAt = 0;
      boonScreen(this);
    }
  }

  drawPreviews(now) {
    for (const p of this.previews) {
      if (!p.cv.isConnected) continue;
      const g = p.cv.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, p.cv.width, p.cv.height);
      if (p.npc) {
        const def = NPCS[p.npc];
        const spec = this.assets.spec(def.sprite);
        const anim = this.assets.pick(def.sprite, "idle") ?? "idle";
        const k = (p.cv.height * 1.15) / spec.cell[1];
        this.assets.draw(g, def.sprite, anim, this.assets.frameAt(def.sprite, anim, now), p.cv.width / 2, p.cv.height * 1.02 - (def.float ?? 0) * k, { scale: k, flip: def.native === -1 });
        continue;
      }
      const n = p.ids.length;
      p.ids.forEach((id, i) => {
        const art = CHAR_ART[id];
        const selected = !!p.el && p.el.classList.contains("sel");
        const anim = selected && Math.floor(now / 1800) % 2 === 1 ? this.assets.pick(art.sprite, "atk1", "idle") : this.assets.pick(art.sprite, "idle");
        const ms = selected && anim !== "idle" ? now % 1800 : now + i * 400;
        const frame = this.assets.frameAt(art.sprite, anim, ms);
        const k = (n === 1 ? 1.9 : 1.25) * art.scale;
        this.assets.draw(g, art.sprite, anim, frame, ((i + 0.5) * p.cv.width) / n, p.cv.height - 6, { scale: k });
      });
    }
  }

  fit() {
    const r = this.stage.getBoundingClientRect();
    const k = Math.min(r.width / 640, r.height / 360);
    const scale = k >= 1 ? Math.floor(k * 4) / 4 : k;
    const w = Math.floor(640 * scale);
    const h = Math.floor(360 * scale);
    this.renderer.canvas.style.width = `${w}px`;
    this.renderer.canvas.style.height = `${h}px`;
    this.hud.el.style.width = `${w}px`;
    this.hud.el.style.height = `${h}px`;
    this.hud.el.style.setProperty("--k", String(scale));
    this.renderer.setResolution(Math.min(4, Math.ceil(scale * (window.devicePixelRatio || 1))));
    const portrait = window.matchMedia("(orientation: portrait)").matches && window.matchMedia("(pointer: coarse)").matches && r.width < 700;
    this.rotateEl.classList.toggle("on", portrait);
    if (portrait && this.screen === "play") pauseScreen(this);
  }
}
