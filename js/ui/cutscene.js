// Short story scenes: a painted backdrop, one or two figures, a line of text at a time. Any key, click or tap
// moves on; Escape or Skip ends the whole scene. Everything is data in CUTSCENES (data/story.js).
import { CUTSCENES, NPCS, VOWS } from "../data/story.js";
import { CHAR_ART } from "../game/anims.js";

const W = 640;
const H = 360;
const BIOME_OF_BG = { crystal: "undercroft", sky: "midreach", autumn: "summit" };
const SCALE = 2.7;
const CPS = 38; // characters revealed per second

export class Cutscene {
  constructor(app) {
    this.app = app;
    this.active = null;
  }

  get running() {
    return !!this.active;
  }

  /**
   * Plays a scene. `done` runs once when it ends or is skipped. Unknown ids finish at once.
   * @param {string} id  key of CUTSCENES
   * @param {string} lead  character id for the "lead" figure
   * @param {() => void} done
   */
  start(id, lead, done) {
    const def = CUTSCENES[id];
    if (!def) return done();
    const app = this.app;
    app.setScreen("cutscene");
    if (def.music) app.audio.setScene(def.music, { fade: 1.2 });
    app.ui.show({
      id: "cutscene",
      cls: "cutscene-bg",
      html: `<div class="cutscene" role="dialog" aria-label="Story scene">
        <div class="cs-frame"><canvas class="cs-canvas" width="${W}" height="${H}" aria-hidden="true"></canvas>
          <div class="cs-text"><b class="cs-speaker"></b><p class="cs-line" aria-live="polite"></p></div>
          <div class="cs-fade"></div>
        </div>
        <button type="button" class="btn cs-skip" id="cs-skip">Skip</button>
        <p class="cs-hint sub small">Press any key or tap to continue</p>
      </div>`,
      onBack: () => this.finish()
    });
    const root = app.ui.$(".cutscene");
    this.active = {
      def,
      lead,
      done,
      beat: 0,
      t0: performance.now(),
      cv: root.querySelector(".cs-canvas"),
      speaker: root.querySelector(".cs-speaker"),
      line: root.querySelector(".cs-line"),
      fade: root.querySelector(".cs-fade"),
      shown: "",
      flash: 0,
      beatFired: -1
    };
    const advance = (e) => {
      if (!this.active) return;
      if (e?.target?.id === "cs-skip") return;
      this.next();
    };
    root.addEventListener("pointerdown", advance);
    this.keyHandler = (e) => {
      if (!this.active || e.key === "Escape" || e.repeat) return;
      if (e.key === "Tab" || e.key.startsWith("F")) return;
      e.preventDefault();
      this.next();
    };
    window.addEventListener("keydown", this.keyHandler, true);
    app.ui.$("#cs-skip").onclick = () => this.finish();
    app.ui.$("#cs-skip").focus();
  }

  text(beat) {
    const lead = this.active.lead;
    return beat.lines
      .map((l) => (l === "@vow" ? VOWS[lead]?.vow ?? "" : l === "@end" ? VOWS[lead]?.end ?? "" : l))
      .join(" ");
  }

  /** Completes the line, or moves to the next beat when it is already complete. */
  next() {
    const a = this.active;
    if (!a) return;
    const beat = a.def.beats[a.beat];
    const full = this.text(beat);
    const elapsed = (performance.now() - a.t0) / 1000;
    if (elapsed * CPS < full.length) {
      a.t0 = performance.now() - (full.length / CPS) * 1000;
      return;
    }
    this.gotoBeat(a.beat + 1);
  }

  gotoBeat(n) {
    const a = this.active;
    if (n >= a.def.beats.length) return this.finish();
    a.beat = n;
    a.t0 = performance.now();
    a.shown = "";
  }

  finish() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    window.removeEventListener("keydown", this.keyHandler, true);
    a.done();
  }

  /** Called every animation frame while the scene is on screen. */
  tick(now) {
    const a = this.active;
    if (!a) return;
    const app = this.app;
    const beat = a.def.beats[a.beat];
    const elapsed = (now - a.t0) / 1000;
    const full = this.text(beat);
    // Text.
    const n = Math.min(full.length, Math.floor(elapsed * CPS));
    const shown = full.slice(0, n);
    if (shown !== a.shown) {
      a.shown = shown;
      a.line.textContent = shown;
      a.speaker.textContent = beat.speaker ?? "";
    }
    if (a.beatFired !== a.beat) {
      a.beatFired = a.beat;
      if (beat.bell) {
        app.sfx("bell");
        a.flash = 1;
      }
    }
    if (elapsed > beat.hold + full.length / CPS) this.gotoBeat(a.beat + 1);
    if (!this.active) return;

    // Picture.
    const g = a.cv.getContext("2d");
    g.imageSmoothingEnabled = false;
    const bgKey = beat.bg;
    const bg = app.assets.bg[bgKey];
    const biome = BIOME_OF_BG[bgKey.split("_")[0]] ?? "undercroft";
    const grade = app.renderer.gradeByName(biome);
    g.fillStyle = "#050405";
    g.fillRect(0, 0, W, H);
    if (bg) {
      const k = Math.max(W / bg.width, H / bg.height) * 1.08;
      const pan = beat.climb ? (now / 8) % (bg.height * k) : 0;
      const ox = -((bg.width * k - W) / 2) + Math.sin(now / 4000) * 6;
      const oy = -((bg.height * k - H) / 2);
      if (beat.climb) {
        g.drawImage(bg, ox, oy + pan, bg.width * k, bg.height * k);
        g.drawImage(bg, ox, oy + pan - bg.height * k, bg.width * k, bg.height * k);
      } else g.drawImage(bg, ox, oy, bg.width * k, bg.height * k);
    }
    g.fillStyle = "rgba(6,5,10,0.45)";
    g.fillRect(0, 0, W, H);
    const cast = beat.procession ? ["maren", "marta", "gel", "aldric", "wisp"].map((who, i) => ({ who, x: ((elapsed / (beat.hold + 1.5)) * 1.5 - 0.1 - i * 0.14) % 1.4, anim: "walk", walking: true })) : beat.cast;
    const floor = H - 62;
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(0, floor, W, 3);
    for (const c of cast) {
      const isLead = c.who === "lead";
      const sprite = isLead ? CHAR_ART[a.lead].sprite : NPCS[c.who].sprite;
      const scale = (isLead ? CHAR_ART[a.lead].scale : NPCS[c.who].scale) * SCALE;
      const native = isLead ? CHAR_ART[a.lead].native : NPCS[c.who].native;
      const fit = isLead ? CHAR_ART[a.lead].fit ?? 1 : NPCS[c.who].fit ?? 1;
      const float = isLead ? 0 : NPCS[c.who].float ?? 0;
      const anim = app.assets.pick(sprite, c.anim, "idle") ?? "idle";
      const frame = app.assets.frameAt(sprite, anim, now + c.x * 300);
      const bob = float ? Math.sin(now / 420 + c.x * 7) * 4 : 0;
      const flip = (c.flip ?? false) !== (native === -1) ? true : false;
      const x = c.x * W;
      if (x < -80 || x > W + 80) continue;
      g.fillStyle = "rgba(0,0,0,0.4)";
      g.beginPath();
      g.ellipse(x, floor + 1, 34, 7, 0, 0, Math.PI * 2);
      g.fill();
      app.assets.draw(g, sprite, anim, frame, x, floor - float * SCALE + bob, { scale, flip: c.walking ? false : flip, grade, fit, outline: CHAR_ART[a.lead]?.outline !== false || !isLead });
    }
    if (a.flash > 0) {
      g.fillStyle = `rgba(255,244,214,${a.flash * 0.7})`;
      g.fillRect(0, 0, W, H);
      a.flash = Math.max(0, a.flash - 0.012);
    }
    // Vignette.
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.7);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
    // Fade to black on the last beat of a finale.
    if (beat.final) a.fade.style.opacity = String(Math.min(1, Math.max(0, (elapsed - beat.hold * 0.6) / (beat.hold * 0.5))));
    else if (a.fade.style.opacity !== "0") a.fade.style.opacity = "0";
  }
}

