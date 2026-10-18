function hash128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ h1 >>> 18, 597399067);
  h2 = Math.imul(h4 ^ h2 >>> 22, 2869860233);
  h3 = Math.imul(h1 ^ h3 >>> 17, 951274213);
  h4 = Math.imul(h2 ^ h4 >>> 19, 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
class Rng {
  a;
  b;
  c;
  d;
  constructor(seed) {
    [this.a, this.b, this.c, this.d] = hash128(seed);
    for (let i = 0; i < 12; i++) this.next();
  }
  /** Returns a float in [0, 1). */
  next() {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = this.a + this.b | 0;
    this.a = this.b ^ this.b >>> 9;
    this.b = this.c + (this.c << 3) | 0;
    this.c = this.c << 21 | this.c >>> 11;
    this.d = this.d + 1 | 0;
    t = t + this.d | 0;
    this.c = this.c + t | 0;
    return (t >>> 0) / 4294967296;
  }
  /** Integer in [min, max], both inclusive. */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  float(min, max) {
    return min + this.next() * (max - min);
  }
  chance(p) {
    return this.next() < p;
  }
  pick(items) {
    if (items.length === 0) throw new Error("Rng.pick on empty list");
    return items[Math.floor(this.next() * items.length)];
  }
  /** Picks by weight. Weights of 0 are never picked. */
  weighted(items, weight) {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }
  /** Fisher-Yates shuffle, returns a new array. */
  shuffle(items) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  /** A child stream derived from this one, independent of later draws. */
  fork(label) {
    return new Rng(`${label}:${this.int(0, 2147483647)}`);
  }
}
function stream(seed, ...parts) {
  return new Rng([seed, ...parts].join("/"));
}
function randomSeed() {
  const words = ["ASH", "BELL", "BONE", "CANDLE", "CHOIR", "CRYPT", "EMBER", "GRAIL", "HYMN", "ICHOR", "MARTYR", "NAVE", "PYRE", "RELIC", "SHROUD", "THORN", "VEIL", "VIGIL", "WAX", "WRAITH"];
  const w = () => words[Math.floor(Math.random() * words.length)];
  return `${w()}-${Math.floor(1e3 + Math.random() * 9e3)}-${w()}`;
}
function valueNoise1D(rng, length, period) {
  const knots = [];
  const count = Math.ceil(length / period) + 2;
  for (let i = 0; i < count; i++) knots.push(rng.next());
  const out = [];
  for (let x = 0; x < length; x++) {
    const p = x / period;
    const i = Math.floor(p);
    const f = p - i;
    const s = f * f * (3 - 2 * f);
    out.push(knots[i] * (1 - s) + knots[i + 1] * s);
  }
  return out;
}
export {
  Rng,
  hash128,
  randomSeed,
  stream,
  valueNoise1D
};
