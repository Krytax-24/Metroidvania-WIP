import { Music } from "./music.js";

/** Sound names played through the UI bus instead of the effects bus. */
const UI_SOUNDS = new Set(["ui", "uiBack", "uiSelect", "uiError", "save", "talk", "questAccept", "questDone", "reward", "drill"]);

class Audio {
  ctx = null;
  master = null;
  buses = null;
  music = null;
  volumes = { master: 0.7, music: 0.6, sfx: 0.8 };
  last = /* @__PURE__ */ new Map();
  /** The bus new tones are routed to while a sound is being built. */
  route = null;
  pendingScene = null;
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.buses = {};
      for (const name of ["music", "sfx", "ui"]) {
        const g = this.ctx.createGain();
        g.connect(this.master);
        this.buses[name] = g;
      }
      this.route = this.buses.sfx;
      this.applyVolumes();
      this.music = new Music(this.ctx, this.buses.music);
      if (this.pendingScene) this.setScene(this.pendingScene.name, this.pendingScene.opts);
    } catch {
      this.ctx = null;
    }
  }
  /** Sets any of master, music and sfx (0 to 1). The UI bus follows the effects slider. */
  setVolumes(v) {
    Object.assign(this.volumes, v);
    this.applyVolumes();
  }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.02);
    this.buses.music.gain.setTargetAtTime(this.volumes.music, t, 0.02);
    this.buses.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.02);
    this.buses.ui.gain.setTargetAtTime(Math.min(1, this.volumes.sfx * 1.1), t, 0.02);
  }
  // ---- music
  setScene(name, opts) {
    this.pendingScene = { name, opts };
    this.music?.setScene(name, opts);
  }
  setIntensity(x) {
    this.music?.setIntensity(x);
  }
  setBlight(phase) {
    this.music?.setBlight(phase);
  }
  duckMusic(seconds, amount) {
    this.music?.duck(seconds, amount);
  }
  pauseMusic() {
    this.music?.pause();
  }
  resumeMusic() {
    this.music?.resume();
  }
  ok(key, gapMs = 30) {
    if (!this.ctx || !this.master) return false;
    const now = performance.now();
    if ((this.last.get(key) ?? 0) + gapMs > now) return false;
    this.last.set(key, now);
    return true;
  }
  tone(freq, dur, type, gain, slide = 0, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq * (1 + (Math.random() - 0.5) * 0.06), t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 8e-3);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    o.connect(g).connect(this.route);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  noise(dur, gain, freq, q = 1, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.route);
    src.start(t);
  }
  telegraph(tele, boss = false) {
    if (!this.ok(`tele-${tele}`, 60)) return;
    this.route = this.buses.sfx;
    const k = boss ? 1.3 : 1;
    switch (tele) {
      case "parryable":
        this.tone(1320, 0.12, "triangle", 0.25 * k);
        this.tone(1980, 0.08, "sine", 0.12 * k, 0, 0.03);
        break;
      case "unparryable":
        this.tone(70, 0.28, "sine", 0.55 * k, 0.6);
        this.noise(0.18, 0.4 * k, 120, 0.8);
        break;
      case "blight":
        this.noise(0.5, 0.3 * k, 2400, 0.6);
        this.tone(220, 0.5, "sawtooth", 0.05 * k, 0.7);
        break;
      case "grab":
        this.tone(520, 0.1, "square", 0.12 * k);
        this.tone(390, 0.16, "square", 0.12 * k, 0, 0.1);
        break;
    }
  }
  play(name) {
    if (!this.ok(name, name === "hit" ? 25 : 40)) return;
    this.route = UI_SOUNDS.has(name) ? this.buses.ui : this.buses.sfx;
    switch (name) {
      case "swing":
        this.noise(0.09, 0.18, 1800, 1.2);
        break;
      case "heavySwing":
        this.noise(0.16, 0.25, 900, 1);
        break;
      case "hit":
        this.noise(0.07, 0.45, 2600, 1.5);
        this.tone(160, 0.08, "square", 0.12, 0.5);
        break;
      case "heavyHit":
        this.noise(0.12, 0.6, 1400, 1);
        this.tone(90, 0.16, "square", 0.2, 0.5);
        break;
      case "hurt":
        this.tone(200, 0.2, "sawtooth", 0.2, 0.4);
        this.noise(0.12, 0.35, 700, 1);
        break;
      case "parry":
        this.tone(1760, 0.35, "triangle", 0.35, 1.02);
        this.tone(2640, 0.25, "sine", 0.18);
        break;
      case "riposte":
        this.tone(880, 0.3, "triangle", 0.3, 0.5);
        this.noise(0.2, 0.5, 1200, 1);
        break;
      case "dodge":
        this.noise(0.14, 0.15, 600, 0.8);
        break;
      case "jump":
        this.tone(330, 0.07, "sine", 0.06, 1.6);
        break;
      case "land":
        this.noise(0.05, 0.12, 300, 1);
        break;
      case "enemyDeath":
        this.tone(300, 0.4, "sawtooth", 0.12, 0.3);
        break;
      case "bossDeath":
        this.tone(110, 1.6, "sawtooth", 0.25, 0.4);
        this.tone(660, 1.2, "triangle", 0.15, 1, 0.3);
        break;
      case "heal":
        this.tone(523, 0.25, "sine", 0.15);
        this.tone(784, 0.35, "sine", 0.12, 1, 0.08);
        break;
      case "pickup":
        this.tone(988, 0.12, "triangle", 0.15);
        this.tone(1318, 0.18, "triangle", 0.12, 1, 0.07);
        break;
      case "ability":
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.4, "triangle", 0.15, 1, i * 0.09));
        break;
      case "bell":
        this.tone(196, 2.2, "sine", 0.3, 0.98);
        this.tone(392, 1.6, "sine", 0.1, 0.98);
        break;
      case "levelUp":
        [392, 523, 659].forEach((f, i) => this.tone(f, 0.3, "triangle", 0.15, 1, i * 0.07));
        break;
      case "break":
        this.noise(0.25, 0.4, 500, 0.7);
        break;
      case "death":
        this.tone(147, 1.4, "sawtooth", 0.2, 0.5);
        break;
      case "skill":
        this.noise(0.3, 0.3, 700, 0.6);
        this.tone(440, 0.3, "triangle", 0.15, 0.6);
        break;
      case "ultimate":
        this.tone(110, 1, "sawtooth", 0.25, 2);
        this.noise(0.8, 0.3, 900, 0.5);
        break;
      case "stagger":
        this.tone(660, 0.18, "square", 0.12, 0.7);
        break;
      case "ui":
        this.tone(740, 0.05, "triangle", 0.08);
        break;
      case "uiBack":
        this.tone(520, 0.06, "triangle", 0.08, 0.8);
        break;
      case "uiSelect":
        this.tone(880, 0.07, "triangle", 0.1);
        this.tone(1320, 0.09, "triangle", 0.07, 1, 0.05);
        break;
      case "uiError":
        this.tone(160, 0.14, "square", 0.08, 0.8);
        break;
      case "save":
        this.tone(660, 0.12, "sine", 0.09);
        this.tone(990, 0.2, "sine", 0.07, 1, 0.09);
        break;
      case "talk":
        this.tone(300 + Math.random() * 120, 0.05, "square", 0.04);
        break;
      case "questAccept":
        [330, 440, 554].forEach((f, i) => this.tone(f, 0.22, "triangle", 0.1, 1, i * 0.08));
        break;
      case "questDone":
        [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.3, "triangle", 0.12, 1, i * 0.09));
        break;
      case "reward":
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.5, "triangle", 0.12, 1, i * 0.1));
        this.noise(0.6, 0.06, 5200, 2, 0.2);
        break;
      case "drill":
        this.tone(880, 0.1, "triangle", 0.1);
        this.tone(1175, 0.18, "triangle", 0.1, 1, 0.08);
        break;
      case "whiff":
        this.noise(0.1, 0.08, 1500, 1.2);
        break;
      case "secret":
        [392, 466, 587].forEach((f, i) => this.tone(f, 0.35, "sine", 0.1, 1, i * 0.1));
        break;
    }
  }
}
export {
  Audio
};
