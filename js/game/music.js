// Ashen Ascent: procedural music engine. Pure Web Audio, zero audio files, original material.
//
//   const m = new Music(ctx, gainNodeFromGame);
//   m.setScene("undercroft"); m.setIntensity(0.6); m.setBlight(2);
//
// Design notes
// - Every musical choice is a pure function of (scene seed, step index, slot), using a small
//   mulberry32 generator, so a scene always plays the same phrases and skipping steps is safe.
// - Notes are scheduled by a look-ahead scheduler: setInterval every 50 ms calls _pump(now + 0.25).
//   OfflineAudioContext users call _pump(untilTime) themselves.
// - Everything shares one noise buffer, one convolution reverb and one feedback delay.
//   Each voice disconnects itself when it ends; scenes free their nodes after they fade out.

const LAYERS = ["pad", "bass", "arp", "perc", "fx"];
const SCENES = ["menu", "story", "practice", "undercroft", "midreach", "summit", "boss", "victory", "defeat", "silence"];
const THR = { bass: [0.1, 0.4], arp: [0.35, 0.65], perc: [0.6, 0.9] };

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
const pick = (arr, r) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mix32(a) {
  a = Math.imul(a ^ (a >>> 16), 0x85ebca6b);
  a = Math.imul(a ^ (a >>> 13), 0xc2b2ae35);
  return (a ^ (a >>> 16)) >>> 0;
}
// Deterministic float in [0,1) for (seed, step k, slot i).
function rnd(seed, k, i = 0) {
  return mulberry32(mix32(seed ^ Math.imul(k + 1, 0x9e3779b1) ^ Math.imul(i + 7, 0x85ebca77)))();
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Partial tables: [ratio, amplitude, decay multiplier]
const BELL = [[1, 1, 1], [2.76, 0.5, 0.6], [5.4, 0.3, 0.4], [8.93, 0.18, 0.25]];
const GLASS = [[1, 1, 1], [2, 0.16, 0.7], [3, 0.06, 0.5]];
const CHURCH = [[0.5, 0.6, 1.0], [1, 1, 0.9], [1.19, 0.7, 0.7], [1.5, 0.5, 0.55], [2, 0.55, 0.5], [2.5, 0.3, 0.35], [3, 0.22, 0.3], [4.1, 0.12, 0.2]];
const ANVIL = [[1, 1, 1], [1.59, 0.8, 0.8], [2.14, 0.6, 0.6], [2.65, 0.5, 0.5], [3.7, 0.35, 0.3], [5.1, 0.25, 0.2]];

// Vowel formants (Hz) for the choir-like pads.
const VOW = { ah: [730, 1090, 2440], oh: [570, 840, 2410], oo: [300, 870, 2240], eh: [530, 1840, 2480] };

// ---------------------------------------------------------------------------------------------
// Scene definitions. Each: bpm, spb (steps per beat), gain (scene trim), root (Hz, for blight),
// fx (reverb/delay send per layer), init(m,S,t0) for continuous parts, step(m,S,k,t) for notes.
// ---------------------------------------------------------------------------------------------

const on = (S, n) => S.lv[n] > 0.02;
const pan = (S, k, i, w = 0.5) => (rnd(S.seed, k, i) * 2 - 1) * w;

// D Dorian / minor
const MENU_CH = [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 50, 52]];
const MENU_RT = [38, 34, 31, 33];
const MENU_BELL = [74, 76, 77, 79, 81, 83, 84, 86];

const STORY_CH = [[50, 53, 57, 64], [46, 50, 53, 57], [43, 46, 50, 57], [45, 50, 52, 57]];
const STORY_BELL = [74, 77, 79, 81, 84, 86, 89];

// C Lydian
const PRAC_CH = [[48, 55, 59, 64], [50, 57, 62, 66], [45, 52, 55, 60], [43, 50, 55, 59]];
const PRAC_RT = [36, 38, 33, 31];
const PRAC_ARP = [0, 1, 2, 3, 2, 1, 2, 3];

// E Phrygian
const UC_CH = [[40, 47, 52, 55], [41, 48, 53, 57], [40, 47, 52, 55], [38, 45, 50, 53]];
const UC_RT = [28, 29, 28, 26];
const UC_DRIP = [76, 77, 79, 83, 84, 88, 89];

// C Aeolian: i VI III VII
const MR_CH = [[48, 55, 63, 67], [44, 51, 60, 68], [51, 58, 63, 67], [46, 53, 62, 65]];
const MR_RT = [36, 32, 39, 34];
const MR_VOW = ["ah", "oh", "ah", "eh"];

// A minor, open voicings
const SM_CH = [[57, 64, 69, 72, 76], [53, 60, 65, 69, 72], [55, 62, 67, 71, 74], [52, 59, 64, 67, 71]];
const SM_SCALE = [69, 71, 72, 74, 76, 77, 79, 81, 83, 84, 86, 88];

// D minor boss
const BS_CH = [[50, 53, 57, 62], [50, 53, 57, 62], [46, 50, 53, 58], [45, 49, 52, 57]];
const BS_ST = [[62, 65, 69], [62, 65, 69], [58, 62, 65], [57, 61, 64]];
const BS_RT = [38, 38, 34, 33];
const BS_P0 = [0, 0, 12, 0, 0, 12, 0, 10];
const BS_P1 = [0, 0, 0, 12, 0, 7, 0, 8];

// Stinger event tables: [step, kind, data...]
const VICT_EV = [
  [0, "pad", [50, 57], 0.026, 2.4, 2.8, 3.0],
  [0, "bell", 62, 0.07], [1, "bell", 66, 0.075], [2, "bell", 69, 0.08], [3, "bell", 74, 0.085],
  [4, "bell", 78, 0.09], [5, "bell", 81, 0.095], [6, "bell", 86, 0.1],
  [8, "pad", [38, 45, 50, 54, 57, 62], 0.034, 0.3, 4.4, 3.0],
  [8, "bell", 74, 0.14], [8, "toll", 38, 0.2],
  [10, "bell", 90, 0.06], [11, "bell", 93, 0.05], [12, "bell", 86, 0.06],
];
const DEFT_EV = [
  [0, "toll", 38, 0.34], [0, "pad", [38, 45, 50, 53], 0.04, 0.8, 5.8, 2.6],
  [1, "pluck", 69, 0.12], [2, "pluck", 65, 0.11], [3, "pluck", 64, 0.1],
  [4, "pluck", 62, 0.11], [4, "toll", 38, 0.26],
];
function stinger(events) {
  return (m, S, k, t) => {
    for (const e of events) {
      if (e[0] !== k) continue;
      const kind = e[1];
      if (kind === "bell") m._bell(S, { t, f: mtof(e[2]), gain: e[3], decay: 3.4, a: 0.004, layer: "fx", parts: BELL, pri: 2, pan: pan(S, k, e[2], 0.5) });
      else if (kind === "toll") m._bell(S, { t, f: mtof(e[2]), gain: e[3], decay: 7, a: 0.01, layer: "fx", parts: CHURCH, pri: 2 });
      else if (kind === "pluck")
        m._tone(S, { t, layer: "fx", exp: true, a: 0.006, dur: 2.2, gain: e[3], lp: 2200, pri: 2, pan: pan(S, k, e[2], 0.3),
          oscs: [{ type: "triangle", f: mtof(e[2]) }, { type: "sine", f: mtof(e[2] + 12), g: 0.3 }] });
      else if (kind === "pad") {
        const notes = e[2];
        for (let i = 0; i < notes.length; i++)
          m._tone(S, { t: t + i * 0.08, layer: "pad", a: e[4], dur: e[5], r: e[6], gain: e[3], lp: S.name === "defeat" ? 800 : 2400,
            lpEnd: S.name === "defeat" ? 220 : 0, lpT: 6, pan: pan(S, k, i, 0.4),
            oscs: [{ type: "sawtooth", f: mtof(notes[i]), det: -6 }, { type: "triangle", f: mtof(notes[i]), det: 5 }] });
      }
    }
  };
}

const DEFS = {
  // ---------------------------------------------------------------- menu
  menu: {
    bpm: 54, spb: 2, gain: 1, root: mtof(38),
    fx: { pad: [0.5, 0], bass: [0.15, 0], arp: [0.7, 0.3], perc: [0.5, 0], fx: [0.9, 0.3] },
    init(m, S) {
      const lp = m._f(S, "lowpass", 520, 1.1);
      const dg = m._g(S, 0.045);
      lp.connect(dg);
      dg.connect(S.padIn);
      [["sawtooth", 38, -9], ["sawtooth", 38, 8], ["square", 50, -5], ["sawtooth", 45, 6], ["square", 50, 7], ["sawtooth", 57, -7]].forEach(
        ([ty, n, det]) => m._cont(S, ty, mtof(n), det, lp)
      );
      m._lfo(S, 0.043, 240, lp.frequency);
      m._lfo(S, 0.071, 0.011, dg.gain);
    },
    step(m, S, k, t) {
      const sd = S.sd, R = (i) => rnd(S.seed, k, i);
      const ci = Math.floor(k / 16) % 4, ch = MENU_CH[ci];
      if (k % 16 === 0)
        for (let i = 0; i < ch.length; i++)
          m._tone(S, { dest: S.padIn, t: t + i * 0.15, a: 2.6, dur: 16 * sd - 1.5, r: 3.5, gain: 0.03, lp: 900, pan: pan(S, k, i, 0.4),
            oscs: [{ type: "sawtooth", f: mtof(ch[i]), det: -7 }, { type: "square", f: mtof(ch[i]), det: 6, g: 0.5 }] });
      if (k % 2 === 0 && R(1) < 0.3) {
        const n = pick(MENU_BELL, R(2)) + (R(3) < 0.3 ? 12 : 0);
        m._bell(S, { t, f: mtof(n), gain: 0.06, decay: 4.2, a: 0.004, layer: "fx", parts: BELL, pan: pan(S, k, 4, 0.7) });
      }
      if (on(S, "bass") && k % 2 === 0) {
        const f = mtof(MENU_RT[ci]);
        m._tone(S, { layer: "bass", t, exp: true, a: 0.03, dur: k % 8 === 0 ? 1.7 : 1.1, gain: k % 8 === 0 ? 0.2 : 0.12,
          oscs: [{ type: "sine", f }, { type: "triangle", f: f * 2, g: 0.2 }] });
      }
      if (on(S, "arp") && R(5) < 0.5) {
        const n = ch[Math.floor(R(6) * ch.length)] + 24;
        m._tone(S, { layer: "arp", t, exp: true, a: 0.004, dur: 1.3, gain: 0.05, lp: 3000, pan: pan(S, k, 7, 0.6),
          oscs: [{ type: "triangle", f: mtof(n) }, { type: "sine", f: mtof(n + 12), g: 0.25 }] });
      }
      if (on(S, "perc") && (k % 16 === 0 || (k % 16 === 8 && R(8) < 0.7)))
        m._drum(S, { t, f0: 85, f1: 44, len: 1.3, gain: k % 16 === 0 ? 0.22 : 0.12, layer: "perc", click: 0.3 });
    },
  },

  // ---------------------------------------------------------------- story (under dialogue)
  story: {
    bpm: 48, spb: 1, gain: 0.5, root: mtof(38),
    fx: { pad: [0.6, 0], bass: [0, 0], arp: [0, 0], perc: [0, 0], fx: [0.9, 0.25] },
    init(m, S) {
      S.padIn.gain.value = 0.62;
      m._lfo(S, 0.1, 0.38, S.padIn.gain);
    },
    step(m, S, k, t) {
      const sd = S.sd, R = (i) => rnd(S.seed, k, i);
      if (k % 8 === 0) {
        const ch = STORY_CH[Math.floor(k / 8) % 4];
        for (let i = 0; i < ch.length; i++)
          m._tone(S, { dest: S.padIn, t: t + i * 0.3, a: 4, dur: 8 * sd - 1, r: 5, gain: 0.03, lp: 1200, pan: pan(S, k, i, 0.4),
            oscs: [{ type: "triangle", f: mtof(ch[i]), det: -5 }, { type: "sine", f: mtof(ch[i]), det: 5 }] });
      }
      if (R(1) < 0.3 && !(rnd(S.seed, k - 1, 1) < 0.3)) {
        const n = pick(STORY_BELL, R(2));
        m._bell(S, { t: t + R(3) * 0.4, f: mtof(n), gain: 0.05, decay: 4.5, a: 0.18, layer: "fx", parts: GLASS, pan: pan(S, k, 4, 0.7) });
      }
    },
  },

  // ---------------------------------------------------------------- practice
  practice: {
    bpm: 84, spb: 2, gain: 1, root: mtof(36),
    thr: { perc: [0.5, 0.75] },
    fx: { pad: [0.45, 0], bass: [0.1, 0], arp: [0.35, 0.3], perc: [0.15, 0], fx: [0.6, 0.2] },
    init() {},
    step(m, S, k, t) {
      const sd = S.sd, R = (i) => rnd(S.seed, k, i);
      const bar = Math.floor(k / 8), ci = bar % 4, ch = PRAC_CH[ci], ks = k % 8;
      if (ks === 0)
        for (let i = 0; i < ch.length; i++)
          m._tone(S, { dest: S.padIn, t, a: 0.7, dur: 7 * sd, r: 1.4, gain: 0.03, lp: 1800, pan: pan(S, k, i, 0.5),
            oscs: [{ type: "triangle", f: mtof(ch[i]), det: -6 }, { type: "triangle", f: mtof(ch[i]), det: 6 }, { type: "sine", f: mtof(ch[i] + 12), g: 0.3 }] });
      if (on(S, "arp") && R(1) > 0.12) {
        const n = ch[PRAC_ARP[ks]] + 12 + (ks === 7 && R(2) < 0.4 ? 12 : 0);
        m._tone(S, { layer: "arp", t, exp: true, a: 0.004, dur: 0.5, gain: 0.1, lp: 3200, lpEnd: 1200, lpT: 0.4, pan: pan(S, k, 3, 0.5),
          oscs: [{ type: "triangle", f: mtof(n) }, { type: "sine", f: mtof(n + 12), g: 0.2 }] });
      }
      if (on(S, "bass") && (ks === 0 || ks === 4 || (ks === 6 && R(4) < 0.4))) {
        const f = mtof(PRAC_RT[ci] + (ks === 6 ? 7 : 0));
        m._tone(S, { layer: "bass", t, exp: true, a: 0.01, dur: 0.7, gain: ks === 0 ? 0.2 : 0.14,
          oscs: [{ type: "sine", f }, { type: "triangle", f, g: 0.4 }] });
      }
      if (on(S, "perc")) {
        const acc = ks % 2 === 1;
        m._noise(S, { t, dur: 0.06, a: 0.002, gain: acc ? 0.05 : 0.025, f: 6500, q: 0.9, layer: "perc", pan: pan(S, k, 5, 0.4) });
        if (ks === 0) m._noise(S, { t, dur: 0.28, a: 0.02, gain: 0.035, ft: "highpass", f: 3500, q: 0.7, layer: "perc" });
      }
    },
  },

  // ---------------------------------------------------------------- undercroft
  undercroft: {
    bpm: 58, spb: 2, gain: 1, root: mtof(40),
    fx: { pad: [0.5, 0], bass: [0.1, 0], arp: [0.6, 0.55], perc: [0.35, 0], fx: [0.7, 0.95] },
    init() {},
    step(m, S, k, t) {
      const sd = S.sd, R = (i) => rnd(S.seed, k, i);
      const ci = Math.floor(k / 16) % 4, ch = UC_CH[ci], ks = k % 16;
      if (ks === 0)
        for (let i = 0; i < ch.length; i++)
          m._tone(S, { dest: S.padIn, t: t + i * 0.2, a: 3, dur: 16 * sd - 2, r: 3.5, gain: 0.032, lp: 560, lpEnd: 900, lpT: 8, pan: pan(S, k, i, 0.5),
            oscs: [{ type: "sawtooth", f: mtof(ch[i]), det: -8 }, { type: "sawtooth", f: mtof(ch[i]), det: 8 }, { type: "sine", f: mtof(ch[i] + 12), g: 0.6 }] });
      if (R(1) < 0.3) {
        const n = pick(UC_DRIP, R(2));
        const f = mtof(n);
        m._tone(S, { layer: "fx", t: t + R(3) * 0.3, exp: true, a: 0.002, dur: 0.32, gain: 0.07, pri: 2, pan: pan(S, k, 4, 0.8),
          oscs: [{ type: "sine", f: f * 0.95, to: f * 1.04, gl: 0.05 }] });
      }
      if (on(S, "bass") && (k % 4 === 0)) {
        const f = mtof(UC_RT[ci]);
        m._tone(S, { layer: "bass", t, exp: true, a: 0.04, dur: 1.5, gain: 0.26,
          oscs: [{ type: "sine", f }, { type: "triangle", f: f * 2, g: 0.18 }] });
      }
      if (on(S, "arp") && k % 2 === 0 && R(5) < 0.6) {
        const n = ch[Math.floor(R(6) * ch.length)] + 24;
        m._tone(S, { layer: "arp", t, exp: true, a: 0.003, dur: 0.8, gain: 0.05, lp: 2600, pan: pan(S, k, 7, 0.7),
          oscs: [{ type: "triangle", f: mtof(n) }] });
      }
      if (on(S, "perc")) {
        const ks8 = k % 8;
        if (ks8 === 0) m._drum(S, { t, f0: 105, f1: 42, len: 0.7, gain: 0.3, layer: "perc", click: 0.4, pri: 2 });
        else if (ks8 === 5 && R(8) < 0.55) m._drum(S, { t, f0: 90, f1: 48, len: 0.5, gain: 0.14, layer: "perc", click: 0.2 });
        else if (ks === 12) m._drum(S, { t, f0: 120, f1: 55, len: 0.45, gain: 0.12, layer: "perc", click: 0.2 });
      }
    },
  },

  // ---------------------------------------------------------------- midreach
  midreach: {
    bpm: 66, spb: 2, gain: 1, root: mtof(36),
    fx: { pad: [0.5, 0], bass: [0.1, 0], arp: [0.4, 0.2], perc: [0.5, 0], fx: [0.7, 0.1] },
    init(m, S) {
      m._choir(S);
    },
    step(m, S, k, t) {
      const sd = S.sd, R = (i) => rnd(S.seed, k, i);
      const bar = Math.floor(k / 8), ci = bar % 4, ch = MR_CH[ci], ks = k % 8;
      if (ks === 0) {
        m._vowel(S, VOW[MR_VOW[ci]], t);
        for (let i = 0; i < ch.length; i++)
          m._tone(S, { dest: S.choirIn, t: t + i * 0.05, a: 0.9, dur: 7 * sd - 0.3, r: 1.4, gain: 0.5,
            oscs: [{ type: "sawtooth", f: mtof(ch[i]), det: -9 }, { type: "sawtooth", f: mtof(ch[i]), det: 8 }] });
        m._tone(S, { dest: S.padIn, t, a: 1.2, dur: 7 * sd, r: 1.5, gain: 0.03, lp: 420,
          oscs: [{ type: "sawtooth", f: mtof(MR_RT[ci]) }, { type: "sawtooth", f: mtof(MR_RT[ci]), det: 9 }] });
      }
      if (k % 32 === 0)
        m._bell(S, { t, f: mtof(48), gain: 0.2, decay: 7.5, a: 0.006, layer: "fx", parts: CHURCH, pri: 2 });
      if (on(S, "bass") && k % 2 === 0) {
        const f = mtof(MR_RT[ci]);
        m._tone(S, { layer: "bass", t, exp: true, a: 0.012, dur: 0.55, gain: ks === 0 ? 0.22 : 0.15, lp: 700,
          oscs: [{ type: "sine", f }, { type: "sawtooth", f, g: 0.3 }] });
      }
      if (on(S, "arp") && R(1) < 0.6) {
        const idx = [0, 1, 2, 3, 2, 1, 3, 2][ks];
        const n = ch[idx] + 12;
        m._tone(S, { layer: "arp", t, exp: true, a: 0.004, dur: 0.55, gain: 0.07, lp: 2600, lpEnd: 1000, lpT: 0.5, pan: pan(S, k, 2, 0.6),
          oscs: [{ type: "triangle", f: mtof(n) }, { type: "square", f: mtof(n), g: 0.12 }] });
      }
      if (on(S, "perc")) {
        if (ks === 0) m._drum(S, { t, f0: 95, f1: 46, len: 0.8, gain: 0.2, layer: "perc", click: 0.25 });
        if (ks === 3 || ks === 7) m._bell(S, { t, f: 520 + (ks === 7 ? 40 : 0), gain: 0.07, decay: 0.7, a: 0.002, layer: "perc", parts: ANVIL, pan: pan(S, k, 3, 0.5) });
        else if ((ks === 1 || ks === 5) && R(4) < 0.35) m._bell(S, { t, f: 780, gain: 0.03, decay: 0.45, a: 0.002, layer: "perc", parts: ANVIL });
        if (ks === 3 || ks === 7) m._noise(S, { t, dur: 0.09, a: 0.002, gain: 0.05, ft: "highpass", f: 3000, q: 0.7, layer: "perc" });
      }
    },
  },

  // ---------------------------------------------------------------- summit
  summit: {
    bpm: 50, spb: 1, gain: 1, root: mtof(33),
    fx: { pad: [1.0, 0], bass: [0.4, 0], arp: [0.9, 0.5], perc: [0.9, 0], fx: [1.0, 0.3] },
    init(m, S) {
      S.padIn.gain.value = 0.8;
      m._lfo(S, 0.21, 0.2, S.padIn.gain);
      for (const [pn, off, ff, lf] of [[-0.7, 0.15, 520, 0.061], [0.7, 0.6, 790, 0.083]]) {
        const src = m._noiseCont(S, off);
        const bp = m._f(S, "bandpass", ff, 1.6);
        const wg = m._g(S, 0.55);
        const pp = S.ctx.createStereoPanner ? S.ctx.createStereoPanner() : m._g(S, 1);
        if (pp.pan) pp.pan.value = pn;
        S.nodes.push(pp);
        const wl = m._g(S, 0.07);
        src.connect(bp); bp.connect(wg); wg.connect(pp); pp.connect(wl); wl.connect(S.layers.pad);
        m._lfo(S, lf, ff * 0.55, bp.frequency);
        m._lfo(S, lf * 1.3, 0.4, wg.gain);
      }
    },
    step(m, S, k, t) {
      const sd = S.sd, R = (i) => rnd(S.seed, k, i);
      const ci = Math.floor(k / 8) % 4, ch = SM_CH[ci];
      if (k % 8 === 0)
        for (let i = 0; i < ch.length; i++) {
          const f = mtof(ch[i] + 12);
          m._tone(S, { dest: S.padIn, t: t + i * 0.4, a: 3.2, dur: 8 * sd - 1.5, r: 4.2, gain: 0.016, pan: pan(S, k, i, 0.9),
            oscs: [{ type: "triangle", f, det: -8 }, { type: "triangle", f, det: 8 }, { type: "triangle", f: f * 2, det: -5, g: 0.4 }, { type: "triangle", f: f * 2, det: 6, g: 0.4 }] });
        }
      if (on(S, "bass") && k % 4 === 0) {
        const f = mtof(33 + (ci === 1 ? -4 : ci === 2 ? -2 : ci === 3 ? -5 : 0));
        m._tone(S, { layer: "bass", t, a: 2, dur: 1.5, r: 3, gain: 0.14, oscs: [{ type: "sine", f }, { type: "sine", f: f * 2, g: 0.15 }] });
      }
      if (on(S, "arp") && k % 4 === 2 && R(1) < 0.75) {
        let idx = Math.floor(R(2) * 5) + 7;
        for (let j = 0; j < 3; j++) {
          const n = SM_SCALE[Math.max(0, idx - j)];
          m._tone(S, { layer: "arp", t: t + j * sd * 0.9, exp: true, a: 0.01, dur: 2.6, gain: 0.05, lp: 4000, pan: pan(S, k, 3 + j, 0.8),
            oscs: [{ type: "sine", f: mtof(n) }, { type: "triangle", f: mtof(n + 12), g: 0.15 }] });
        }
      }
      if (on(S, "perc")) {
        m._drum(S, { t, f0: 62, f1: 38, len: 0.28, gain: 0.13, layer: "perc", click: 0.1 });
        m._drum(S, { t: t + 0.3, f0: 56, f1: 36, len: 0.24, gain: 0.08, layer: "perc", click: 0.06 });
      }
    },
  },

  // ---------------------------------------------------------------- boss
  boss: {
    bpm: 120, spb: 2, gain: 1, root: mtof(38), full: true,
    fx: { pad: [0.3, 0], bass: [0.04, 0], arp: [0.35, 0.12], perc: [0.2, 0], fx: [0.4, 0.1] },
    init(m, S) {
      m._choir(S);
    },
    step(m, S, k, t) {
      const R = (i) => rnd(S.seed, k, i);
      const bar = Math.floor(k / 8), ci = bar % 4, ks = k % 8, rb = (i) => rnd(S.seed, bar, 50 + i);
      if (ks === 0) {
        m._vowel(S, VOW[ci === 2 ? "oh" : ci === 3 ? "eh" : "ah"], t);
        const ch = BS_CH[ci];
        for (let i = 0; i < ch.length; i++)
          m._tone(S, { dest: S.choirIn, t, a: 0.25, dur: 7 * S.sd, r: 0.6, gain: 0.55,
            oscs: [{ type: "sawtooth", f: mtof(ch[i]), det: -10 }, { type: "sawtooth", f: mtof(ch[i]), det: 9 }] });
        for (let i = 0; i < 3; i++) {
          const n = BS_ST[ci][i];
          m._tone(S, { layer: "arp", t, exp: true, a: 0.02, dur: 0.55, gain: 0.05, lp: 450, lpEnd: 3200, lpT: 0.09, q: 1.2, pri: 2,
            oscs: [{ type: "sawtooth", f: mtof(n), det: -6 }, { type: "sawtooth", f: mtof(n), det: 6 }] });
        }
      }
      if (ks === 6 && rb(1) < 0.5) {
        for (let i = 0; i < 3; i++) {
          const n = BS_ST[ci][i];
          m._tone(S, { layer: "arp", t, exp: true, a: 0.02, dur: 0.3, gain: 0.035, lp: 500, lpEnd: 2600, lpT: 0.07, q: 1.2,
            oscs: [{ type: "sawtooth", f: mtof(n), det: -6 }, { type: "sawtooth", f: mtof(n), det: 6 }] });
        }
      }
      const off = (rb(2) < 0.5 ? BS_P0 : BS_P1)[ks];
      if (off !== null) {
        const n = BS_RT[ci] + off;
        m._tone(S, { layer: "bass", t, exp: true, a: 0.004, dur: 0.22, gain: ks % 4 === 0 ? 0.24 : 0.17, lp: 1700, lpEnd: 260, lpT: 0.2, q: 8,
          oscs: [{ type: "sawtooth", f: mtof(n) }, { type: "square", f: mtof(n - 12), g: 0.8 }] });
      }
      if (ks === 0) m._drum(S, { t, f0: 120, f1: 50, len: 0.5, gain: 0.34, layer: "perc", click: 0.4, pri: 2 });
      if (ks === 4) {
        m._drum(S, { t, f0: 170, f1: 85, len: 0.3, gain: 0.2, layer: "perc", click: 0.2, pri: 2 });
        m._noise(S, { t, dur: 0.17, a: 0.002, gain: 0.1, f: 1900, q: 0.8, layer: "perc" });
      }
      if (ks === 3 && R(3) < 0.6) m._drum(S, { t, f0: 140, f1: 70, len: 0.3, gain: 0.2, layer: "perc", click: 0.2 });
      if (ks === 6 && R(4) < 0.5) m._drum(S, { t, f0: 190, f1: 95, len: 0.25, gain: 0.17, layer: "perc", click: 0.2 });
      if (ks === 7 && R(5) < 0.4) m._drum(S, { t, f0: 230, f1: 110, len: 0.22, gain: 0.15, layer: "perc", click: 0.2 });
    },
  },

  // ---------------------------------------------------------------- stingers
  victory: { bpm: 88, spb: 2, gain: 1, root: mtof(38), full: true, len: 9, tail: 2.4,
    fx: { pad: [0.7, 0], bass: [0, 0], arp: [0, 0], perc: [0, 0], fx: [0.9, 0.2] }, init() {}, step: stinger(VICT_EV) },
  defeat: { bpm: 46, spb: 1, gain: 1, root: mtof(38), full: true, len: 9, tail: 2.6,
    fx: { pad: [0.8, 0], bass: [0, 0], arp: [0, 0], perc: [0, 0], fx: [0.9, 0.15] }, init() {}, step: stinger(DEFT_EV) },
};

// ---------------------------------------------------------------------------------------------

export class Music {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = out || null;
    this.lastError = null;
    this._dead = false;
    this._disposed = false;
    this._paused = false;
    this._name = "silence";
    this._cur = null;
    this._dying = [];
    this._intensity = 0.5;
    this._blight = 0;
    this._b = null;
    this._bKill = 0;
    this._timer = null;
    this._vox = [];
    this._cap = 24;
    this._offline = typeof OfflineAudioContext !== "undefined" && ctx instanceof OfflineAudioContext;
    try {
      this._build();
    } catch (e) {
      this._fail(e);
      this._dead = true;
    }
  }

  // ------------------------------------------------------------------ public API
  get scene() {
    try {
      this._reap();
    } catch (e) {
      this._fail(e);
    }
    return this._name;
  }

  setScene(name, opts = {}) {
    this._safe(() => {
      if (!SCENES.includes(name)) throw new Error("Music: unknown scene " + name);
      const c = this.ctx, now = c.currentTime;
      this._reap();
      if (!opts.restart && name === this._name && (name === "silence" || this._cur)) return;
      const fade = clamp(opts.fade ?? 2.5, 0.02, 30);
      if (this._cur) {
        this._retire(this._cur, fade, now);
        this._cur = null;
      }
      this._name = name;
      if (name !== "silence") {
        const S = this._newScene(name, DEFS[name], now + 0.06, fade);
        this._cur = S;
        this._ensureTimer();
      }
      this._applyBlight();
      this._retuneBlight();
      if (!this._paused) this._pump(now + 0.25);
    });
  }

  setIntensity(x) {
    this._safe(() => {
      this._intensity = clamp(Number(x) || 0, 0, 1);
      if (this._cur) this._applyIntensity(this._cur, false);
    });
  }

  setBlight(phase) {
    this._safe(() => {
      this._blight = clamp(Math.round(Number(phase) || 0), 0, 4);
      this._applyBlight();
      this._ensureTimer();
    });
  }

  duck(seconds = 0.6, amount = 0.35) {
    this._safe(() => {
      const g = this.duckG.gain, now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(clamp(amount, 0.01, 1), now, 0.06);
      g.setTargetAtTime(1, now + Math.max(0.05, seconds), 0.25);
    });
  }

  pause() {
    this._safe(() => {
      if (this._paused) return;
      this._paused = true;
      this.pauseG.gain.setTargetAtTime(0, this.ctx.currentTime, 0.07);
    });
  }

  resume() {
    this._safe(() => {
      if (!this._paused) return;
      this._paused = false;
      const now = this.ctx.currentTime;
      this.pauseG.gain.setTargetAtTime(1, now, 0.08);
      this._ensureTimer();
      this._pump(now + 0.25);
    });
  }

  stop(fade = 1.0) {
    this._safe(() => {
      fade = clamp(fade, 0.02, 30);
      const now = this.ctx.currentTime;
      if (this._cur) {
        this._retire(this._cur, fade, now);
        this._cur = null;
      }
      this._name = "silence";
      if (this._b) {
        this._b.gate.gain.setTargetAtTime(0, now, fade / 5);
        this._bKill = now + fade * 1.4 + 0.5;
      }
      this._ensureTimer();
    });
  }

  dispose() {
    this._safe(() => {
      this._disposed = true;
      this._stopTimer();
      for (const S of [this._cur, ...this._dying]) if (S) this._free(S);
      this._cur = null;
      this._dying = [];
      if (this._b) this._freeBlight();
      this._name = "silence";
      for (const n of [this.mix, this.duckG, this.pauseG, this.comp, this.trim, this.revIn, this.conv, this.revWet, this.dlIn, this.dly, this.dlLP, this.dlFb, this.dlWet, this.dlRv])
        try { n.disconnect(); } catch (e) { /* already disconnected */ }
    });
  }

  // Schedules everything the current scene wants up to untilTime (seconds of ctx time).
  _pump(untilTime) {
    this._safe(() => {
      if (this._paused || this._disposed || this._dead) return;
      const S = this._cur;
      if (!S) return;
      const now = this.ctx.currentTime;
      if (S.nextT < now) {
        const skip = Math.ceil((now + 0.02 - S.nextT) / S.sd);
        S.step += skip;
        S.nextT = S.t0 + S.step * S.sd;
      }
      let guard = 0;
      while (S.nextT < untilTime && guard++ < 5000) {
        if (S.def.len && S.nextT >= S.t0 + S.def.len - S.def.tail) break;
        S.def.step(this, S, S.step, S.nextT);
        S.step++;
        S.nextT = S.t0 + S.step * S.sd;
      }
    });
  }

  // Diagnostics for tests: how much is alive right now.
  _debugCounts() {
    const all = [this._cur, ...this._dying].filter(Boolean);
    let srcs = 0;
    for (const S of all) srcs += S.srcs.size;
    return { scenes: all.length, dying: this._dying.length, srcs, blight: this._b ? this._b.srcs.length : 0, timer: !!this._timer };
  }

  // ------------------------------------------------------------------ plumbing
  _fail(e) {
    this.lastError = e;
    try { console.warn("[Music]", e && e.message ? e.message : e); } catch (x) { /* ignore */ }
  }

  _safe(fn) {
    if (this._dead || this._disposed) return;
    try {
      fn();
    } catch (e) {
      this._fail(e);
    }
  }

  _build() {
    const c = this.ctx, sr = c.sampleRate;
    this.mix = c.createGain();
    this.duckG = c.createGain();
    this.pauseG = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.trim = c.createGain();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.25;
    this.trim.gain.value = 0.42;
    this.mix.connect(this.duckG);
    this.duckG.connect(this.pauseG);
    this.pauseG.connect(this.comp);
    this.comp.connect(this.trim);
    if (this.out) this.trim.connect(this.out);

    // one shared noise buffer (2 s of white noise, deterministic)
    const nb = c.createBuffer(1, Math.floor(sr * 2), sr);
    const nd = nb.getChannelData(0), nr = mulberry32(0x5eed1e55);
    for (let i = 0; i < nd.length; i++) nd[i] = nr() * 2 - 1;
    this.noiseBuf = nb;

    // one shared reverb: 2.2 s decaying, progressively darker noise
    const len = Math.floor(sr * 2.2);
    const ir = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch), r = mulberry32(0xc0ffee + ch * 7919);
      let y = 0;
      const pre = Math.floor(sr * 0.012);
      for (let i = 0; i < len; i++) {
        const x = r() * 2 - 1, p = i / len;
        y += (x - y) * (0.6 - 0.5 * p);
        d[i] = i < pre ? 0 : y * Math.exp((-i / sr) * 3.1) * (1 - Math.exp(-(i - pre) / (sr * 0.02)));
      }
    }
    this.revIn = c.createGain();
    this.conv = c.createConvolver();
    this.conv.buffer = ir;
    this.revWet = c.createGain();
    this.revWet.gain.value = 0.9;
    this.revIn.connect(this.conv);
    this.conv.connect(this.revWet);
    this.revWet.connect(this.mix);

    // one shared feedback delay
    this.dlIn = c.createGain();
    this.dly = c.createDelay(2);
    this.dly.delayTime.value = 0.46;
    this.dlLP = c.createBiquadFilter();
    this.dlLP.type = "lowpass";
    this.dlLP.frequency.value = 2600;
    this.dlFb = c.createGain();
    this.dlFb.gain.value = 0.52;
    this.dlWet = c.createGain();
    this.dlWet.gain.value = 0.7;
    this.dlRv = c.createGain();
    this.dlRv.gain.value = 0.3;
    this.dlIn.connect(this.dly);
    this.dly.connect(this.dlLP);
    this.dlLP.connect(this.dlFb);
    this.dlFb.connect(this.dly);
    this.dlLP.connect(this.dlWet);
    this.dlWet.connect(this.mix);
    this.dlLP.connect(this.dlRv);
    this.dlRv.connect(this.revIn);
  }

  _g(S, v) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    (S.nodes || S.b.nodes).push(g);
    return g;
  }

  _f(S, type, f, q = 0.7) {
    const n = this.ctx.createBiquadFilter();
    n.type = type;
    n.frequency.value = f;
    n.Q.value = q;
    S.nodes.push(n);
    return n;
  }

  _newScene(name, def, t0, fade) {
    const c = this.ctx;
    const S = {
      name, def, ctx: c, t0, nextT: t0, step: 0, sd: 60 / def.bpm / def.spb, seed: hashStr(name) ^ 0x9e3779b9,
      nodes: [], srcs: new Set(), cont: [], layers: {}, lv: {}, killAt: 0,
    };
    S.bus = c.createGain(); S.rvBus = c.createGain(); S.dlBus = c.createGain();
    S.bus.gain.value = 0; S.rvBus.gain.value = 0; S.dlBus.gain.value = 0;
    S.bus.connect(this.mix); S.rvBus.connect(this.revIn); S.dlBus.connect(this.dlIn);
    S.nodes.push(S.bus, S.rvBus, S.dlBus);
    S.faders = [S.bus, S.rvBus, S.dlBus];
    for (const L of LAYERS) {
      const lg = c.createGain();
      S.lv[L] = this._lv(S, L);
      lg.gain.value = S.lv[L];
      lg.connect(S.bus);
      const [rv, dl] = def.fx[L] || [0, 0];
      if (rv > 0) { const r = c.createGain(); r.gain.value = rv; lg.connect(r); r.connect(S.rvBus); S.nodes.push(r); }
      if (dl > 0) { const d = c.createGain(); d.gain.value = dl; lg.connect(d); d.connect(S.dlBus); S.nodes.push(d); }
      S.layers[L] = lg;
      S.nodes.push(lg);
    }
    S.padIn = c.createGain();
    S.padIn.connect(S.layers.pad);
    S.nodes.push(S.padIn);
    def.init(this, S, t0);
    const now = c.currentTime, tc = fade / 5;
    for (const g of S.faders) g.gain.setTargetAtTime(def.gain, now, tc);
    if (def.len) {
      // stingers schedule their own fall back to silence
      const fo = t0 + def.len - def.tail;
      for (const g of S.faders) g.gain.setTargetAtTime(0, fo, def.tail / 5);
      S.killAt = t0 + def.len + 3;
    }
    return S;
  }

  _lv(S, name) {
    if (name === "pad" || name === "fx" || S.def.full) return 1;
    const th = (S.def.thr && S.def.thr[name]) || THR[name];
    return smooth(th[0], th[1], this._intensity);
  }

  _applyIntensity(S) {
    const now = this.ctx.currentTime;
    for (const L of LAYERS) {
      S.lv[L] = this._lv(S, L);
      S.layers[L].gain.setTargetAtTime(S.lv[L], now, 0.5);
    }
  }

  _retire(S, fade, at) {
    const tc = Math.max(0.01, fade / 5);
    for (const g of S.faders) g.gain.setTargetAtTime(0, at, tc);
    S.killAt = at + fade * 1.5 + 0.3;
    for (const s of S.cont) try { s.stop(S.killAt); } catch (e) { /* already stopped */ }
    this._dying.push(S);
  }

  _free(S) {
    for (const s of S.srcs) try { s.stop(); } catch (e) { /* not started or already stopped */ }
    S.srcs.clear();
    for (const n of S.nodes) try { n.disconnect(); } catch (e) { /* ignore */ }
  }

  _reap() {
    if (this._disposed || this._dead) return;
    const now = this.ctx.currentTime;
    // stinger reached its end: fall back to silence
    const S = this._cur;
    if (S && S.def.len && now >= S.t0 + S.def.len) {
      this._dying.push(S);
      this._cur = null;
      this._name = "silence";
      this._applyBlight();
    }
    if (this._dying.length) {
      const keep = [];
      for (const d of this._dying) {
        if (d.killAt <= now) this._free(d);
        else keep.push(d);
      }
      this._dying = keep;
    }
    if (this._b && this._bKill && now >= this._bKill) this._freeBlight();
    if (this._timer && !this._cur && !this._dying.length && !this._b) this._stopTimer();
  }

  _ensureTimer() {
    if (this._offline || this._timer || this._disposed || this._dead) return;
    this._timer = setInterval(() => this._tick(), 50);
  }

  _stopTimer() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  _tick() {
    this._safe(() => {
      this._reap();
      if (this._paused || !this._cur) return;
      const hidden = typeof document !== "undefined" && document.hidden;
      this._pump(this.ctx.currentTime + (hidden ? 1.5 : 0.25));
    });
  }

  // ------------------------------------------------------------------ sound building blocks
  _slot(t, end, pri) {
    if (this._vox.length > 96) {
      const th = Math.max(this.ctx.currentTime - 0.5, t - 30);
      this._vox = this._vox.filter((x) => x.e > th);
    }
    let n = 0;
    for (const x of this._vox) if (x.s <= t && x.e > t) n++;
    if (n >= this._cap + (pri >= 2 ? 6 : 0)) return false;
    this._vox.push({ s: t, e: end });
    return true;
  }

  // When every source has ended, disconnect the whole voice.
  _wire(S, srcs, nodes) {
    let left = srcs.length;
    for (const s of srcs) {
      S.srcs.add(s);
      s.onended = () => {
        S.srcs.delete(s);
        if (--left === 0) for (const n of nodes) try { n.disconnect(); } catch (e) { /* ignore */ }
      };
    }
  }

  // Generic oscillator voice. o: t, dur, a, r, gain, exp, oscs[{type,f,det,g,to,gl}], lp, lpEnd, lpT, q, pan, layer|dest
  _tone(S, o) {
    const c = this.ctx, t = o.t, a = o.a ?? 0.01;
    const end = o.exp ? t + a + o.dur + 0.05 : t + o.dur + (o.r ?? 0.3) + 0.03;
    if (!this._slot(t, end, o.pri || 1)) return;
    const dest = o.dest || S.layers[o.layer || "pad"];
    const nodes = [], srcs = [];
    const env = c.createGain();
    nodes.push(env);
    const eg = env.gain, peak = Math.max(o.gain, 0.0002);
    if (o.exp) {
      eg.setValueAtTime(0.0001, t);
      eg.linearRampToValueAtTime(peak, t + a);
      eg.exponentialRampToValueAtTime(0.0001, t + a + o.dur);
    } else {
      eg.setValueAtTime(0, t);
      eg.linearRampToValueAtTime(peak, t + a);
      eg.setValueAtTime(peak, t + Math.max(a, o.dur));
      eg.linearRampToValueAtTime(0, end - 0.03);
    }
    let inp = env;
    if (o.lp) {
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.Q.value = o.q ?? 0.7;
      f.frequency.setValueAtTime(o.lp, t);
      if (o.lpEnd) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.lpEnd), t + (o.lpT ?? o.dur));
      f.connect(env);
      nodes.push(f);
      inp = f;
    }
    let tail = env;
    if (o.pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = clamp(o.pan, -1, 1);
      env.connect(p);
      nodes.push(p);
      tail = p;
    }
    tail.connect(dest);
    for (const s of o.oscs) {
      const os = c.createOscillator();
      os.type = s.type || "sine";
      os.frequency.setValueAtTime(s.f, t);
      if (s.to) os.frequency.exponentialRampToValueAtTime(s.to, t + (s.gl || 0.1));
      if (s.det) os.detune.value = s.det;
      if (s.g !== undefined && s.g !== 1) {
        const og = c.createGain();
        og.gain.value = s.g;
        os.connect(og);
        og.connect(inp);
        nodes.push(og);
      } else os.connect(inp);
      os.start(t);
      os.stop(end);
      srcs.push(os);
      nodes.push(os);
    }
    this._wire(S, srcs, nodes);
  }

  // Inharmonic additive bell. o: t, f, gain, decay, a, layer, parts, pan
  _bell(S, o) {
    const c = this.ctx, t = o.t, a = o.a ?? 0.004, parts = o.parts || BELL;
    let maxMul = 0;
    for (const p of parts) maxMul = Math.max(maxMul, p[2]);
    const end = t + a + o.decay * maxMul + 0.06;
    if (!this._slot(t, end, o.pri || 1)) return;
    const out = c.createGain();
    const nodes = [out], srcs = [];
    let tail = out;
    if (o.pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = clamp(o.pan, -1, 1);
      out.connect(p);
      nodes.push(p);
      tail = p;
    }
    tail.connect(S.layers[o.layer || "fx"]);
    for (const p of parts) {
      const f = o.f * p[0];
      if (f > 12000) continue;
      const os = c.createOscillator();
      os.type = "sine";
      os.frequency.value = f;
      const pg = c.createGain();
      const stopAt = t + a + o.decay * p[2] + 0.05;
      pg.gain.setValueAtTime(0.0001, t);
      pg.gain.linearRampToValueAtTime(Math.max(0.0002, p[1] * o.gain), t + a);
      pg.gain.exponentialRampToValueAtTime(0.0001, stopAt - 0.04);
      os.connect(pg);
      pg.connect(out);
      os.start(t);
      os.stop(stopAt);
      srcs.push(os);
      nodes.push(os, pg);
    }
    this._wire(S, srcs, nodes);
  }

  // Filtered noise burst. o: t, dur, a, gain, ft, f, fEnd, q, layer, pan
  _noise(S, o) {
    const c = this.ctx, t = o.t, a = o.a ?? 0.003;
    const end = t + a + o.dur + 0.04;
    if (!this._slot(t, end, o.pri || 1)) return;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = o.ft || "bandpass";
    f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(o.f, t);
    if (o.fEnd) f.frequency.exponentialRampToValueAtTime(o.fEnd, t + o.dur);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(Math.max(0.0002, o.gain), t + a);
    env.gain.exponentialRampToValueAtTime(0.0001, t + a + o.dur);
    const nodes = [src, f, env];
    src.connect(f);
    f.connect(env);
    let tail = env;
    if (o.pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = clamp(o.pan, -1, 1);
      env.connect(p);
      nodes.push(p);
      tail = p;
    }
    tail.connect(S.layers[o.layer || "perc"]);
    src.start(t, rnd(S.seed, Math.round(t * 1000), 3) * 1.5);
    src.stop(end);
    this._wire(S, [src], nodes);
  }

  // Sine drum with a pitch drop and a short noise click.
  _drum(S, o) {
    this._tone(S, { layer: o.layer || "perc", t: o.t, exp: true, a: 0.003, dur: o.len, gain: o.gain, pri: o.pri || 1,
      oscs: [{ type: "sine", f: o.f0, to: o.f1, gl: o.drop || 0.09 }] });
    if (o.click) this._noise(S, { t: o.t, dur: 0.05, a: 0.001, gain: o.gain * o.click, ft: "lowpass", f: 1800, q: 0.5, layer: o.layer || "perc" });
  }

  // Continuous sources owned by a scene (stopped when the scene is retired).
  _cont(S, type, f, det, dest) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = det || 0;
    o.connect(dest);
    o.start(S.t0);
    S.cont.push(o);
    this._wire(S, [o], []);
    return o;
  }

  _noiseCont(S, off) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.start(S.t0, off * 1.5);
    S.cont.push(src);
    this._wire(S, [src], []);
    return src;
  }

  _lfo(S, f, depth, param) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.value = f;
    g.gain.value = depth;
    o.connect(g);
    g.connect(param);
    o.start(S.t0);
    S.cont.push(o);
    S.nodes.push(g);
    this._wire(S, [o], []);
  }

  // Choir-like formant bank: saw voices into choirIn come out through three band-pass formants.
  _choir(S) {
    S.choirIn = this._g(S, 1);
    const sum = this._g(S, 1.0);
    sum.connect(S.padIn);
    S.form = VOW.ah.map((f, i) => {
      const b = this._f(S, "bandpass", f, [9, 11, 12][i]);
      const g = this._g(S, [1, 0.6, 0.35][i]);
      S.choirIn.connect(b);
      b.connect(g);
      g.connect(sum);
      return b;
    });
  }

  _vowel(S, v, t) {
    if (S.form) S.form.forEach((b, i) => b.frequency.setTargetAtTime(v[i], t, 0.5));
  }

  // ------------------------------------------------------------------ blight layer
  _root() {
    return this._cur ? this._cur.def.root : 73.42;
  }

  _buildBlight() {
    const c = this.ctx, root = this._root();
    const b = { nodes: [], srcs: [], osc: [] };
    this._b = b;
    const S = { b, nodes: b.nodes };
    b.gate = this._g(S, 0);
    b.gate.connect(this.mix);
    const rvT = this._g(S, 0.4);
    b.gate.connect(rvT);
    rvT.connect(this.revIn);
    const reg = (o) => { b.srcs.push(o); o.onended = () => { const i = b.srcs.indexOf(o); if (i >= 0) b.srcs.splice(i, 1); }; };
    const osc = (type, ratio, det, dest) => {
      const o = c.createOscillator();
      o.type = type; o.frequency.value = root * ratio; o.detune.value = det || 0;
      o.connect(dest); o.start(); reg(o);
      b.osc.push([o, ratio]);
      return o;
    };
    const lfo = (f, depth, param) => {
      const o = c.createOscillator(), g = this._g(S, depth);
      o.frequency.value = f; o.connect(g); g.connect(param); o.start(); reg(o);
    };
    // detuned drone
    b.dLP = c.createBiquadFilter(); b.dLP.type = "lowpass"; b.dLP.frequency.value = 330; b.dLP.Q.value = 0.9; b.nodes.push(b.dLP);
    b.dG = this._g(S, 0);
    b.dLP.connect(b.dG); b.dG.connect(b.gate);
    osc("sawtooth", 1, 0, b.dLP); osc("sawtooth", 1, 27, b.dLP); osc("square", 0.5, -14, b.dLP); osc("sawtooth", 1.5, 41, b.dLP);
    lfo(0.037, 130, b.dLP.frequency);
    // tritone tension tone (with slow tremolo)
    b.tG = this._g(S, 0);
    const tTrem = this._g(S, 0.6);
    b.tG.connect(tTrem); tTrem.connect(b.gate);
    osc("triangle", 4 * Math.SQRT2, 0, b.tG);
    osc("sine", 8 * Math.SQRT2, 6, b.tG);
    lfo(0.23, 0.4, tTrem.gain);
    // minor second tension pair
    b.mG = this._g(S, 0);
    b.mG.connect(b.gate);
    osc("sine", 4, 0, b.mG);
    osc("sine", 4 * Math.pow(2, 1 / 12), 0, b.mG);
    // filtered noise swell
    const ns = c.createBufferSource();
    ns.buffer = this.noiseBuf; ns.loop = true; ns.start(0, 0.37); reg(ns);
    const nbp = c.createBiquadFilter(); nbp.type = "bandpass"; nbp.frequency.value = 850; nbp.Q.value = 0.7;
    b.nG = this._g(S, 0);
    const nSw = this._g(S, 0.5);
    ns.connect(nbp); nbp.connect(b.nG); b.nG.connect(nSw); nSw.connect(b.gate);
    b.nodes.push(nbp);
    lfo(0.085, 0.5, nSw.gain);
    lfo(0.05, 400, nbp.frequency);
  }

  _applyBlight() {
    const p = this._blight, now = this.ctx.currentTime;
    const open = !!(this._cur && !this._cur.def.len);
    if (!this._b) {
      if (p > 0 && open) this._buildBlight();
      else return;
    }
    const b = this._b;
    const drone = [0, 0.5, 0.7, 0.9, 1][p], tri = [0, 0, 0.7, 0.85, 1][p], nz = [0, 0, 0, 0.8, 1][p], mi = [0, 0, 0, 0, 1][p];
    b.dG.gain.setTargetAtTime(drone * 0.06, now, 0.8);
    b.tG.gain.setTargetAtTime(tri * 0.02, now, 0.8);
    b.mG.gain.setTargetAtTime(mi * 0.018, now, 0.8);
    b.nG.gain.setTargetAtTime(nz * 0.07, now, 0.8);
    b.gate.gain.setTargetAtTime(open && p > 0 ? 1 : 0, now, 0.8);
    this._bKill = p === 0 || !open ? now + 6 : 0;
  }

  _retuneBlight() {
    const b = this._b;
    if (!b || !this._cur) return;
    const root = this._cur.def.root, now = this.ctx.currentTime;
    for (const [o, ratio] of b.osc) o.frequency.setTargetAtTime(root * ratio, now, 1.5);
  }

  _freeBlight() {
    const b = this._b;
    if (!b) return;
    for (const o of b.srcs.slice()) try { o.stop(); } catch (e) { /* ignore */ }
    for (const n of b.nodes) try { n.disconnect(); } catch (e) { /* ignore */ }
    b.srcs.length = 0;
    this._b = null;
    this._bKill = 0;
  }
}
