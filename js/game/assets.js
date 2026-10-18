// Asset loading and sprite drawing helpers. Atlases come from tools/build_assets.py (assets/manifest.json).
const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`Could not load ${url}`));
    im.src = url;
  });

export class Assets {
  constructor() {
    this.manifest = null;
    this.sprites = {};
    this.tiles = {};
    this.bg = {};
    this.iconSheet = null;
    this.tintCache = new Map();
    this.gradeCache = new Map();
  }

  /** Loads everything. `onProgress(0..1)` is optional. */
  async load(base = "assets/", onProgress = () => {}) {
    const res = await fetch(`${base}manifest.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error("assets/manifest.json is missing. Run: python tools/build_assets.py");
    this.manifest = await res.json();
    const jobs = [];
    for (const [name, spec] of Object.entries(this.manifest.sprites)) jobs.push(loadImage(base + spec.image).then((im) => (this.sprites[name] = im)));
    for (const [name, spec] of Object.entries(this.manifest.tiles)) {
      jobs.push(loadImage(base + spec.image).then((im) => (this.tiles[name] = im)));
      spec.bg.forEach((b, i) => jobs.push(loadImage(base + b).then((im) => (this.bg[`${name}_${i}`] = im))));
    }
    const icons = this.manifest.icons;
    if (icons) jobs.push(loadImage(base + icons.image).then((im) => (this.iconSheet = im)));
    let done = 0;
    for (const j of jobs) j.then(() => onProgress(++done / jobs.length));
    await Promise.all(jobs);
  }

  /** Pixel position of a named item icon on the shared icon sheet, or null for an unknown name. */
  iconCell(name) {
    const at = this.manifest.icons?.names?.[name];
    if (!at) return null;
    const c = this.manifest.icons.cell;
    return { sx: at[0] * c, sy: at[1] * c, size: c };
  }

  /** Draws an item icon centred on (x, y), `size` pixels wide. */
  drawIcon(ctx, name, x, y, size = 32) {
    const cell = this.iconSheet && this.iconCell(name);
    if (!cell) return;
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.iconSheet, cell.sx, cell.sy, cell.size, cell.size, Math.round(x - size / 2), Math.round(y - size / 2), size, size);
    ctx.imageSmoothingEnabled = prev;
  }

  /** CSS for a DOM element that shows one icon: `style="..."` on a square span of `px` pixels. */
  iconStyle(name, px = 32) {
    const cell = this.iconCell(name);
    if (!cell || !this.iconSheet) return `width:${px}px;height:${px}px`;
    const k = px / cell.size;
    return `width:${px}px;height:${px}px;background-image:url(assets/${this.manifest.icons.image});background-size:${this.iconSheet.width * k}px ${this.iconSheet.height * k}px;background-position:-${cell.sx * k}px -${cell.sy * k}px`;
  }

  spec(name) {
    return this.manifest.sprites[name];
  }

  /** First animation name that exists on the sprite, else null. */
  pick(sprite, ...names) {
    const a = this.manifest.sprites[sprite]?.anims;
    for (const n of names) if (a && a[n]) return n;
    return null;
  }

  /**
   * A lit copy of a sprite sheet so characters share the light of the room they stand in.
   * `grade` is { tint: [r,g,b], mix, sat, bright, outline, fit } (see GRADES in renderer.js).
   * Non-destructive: the source sheet is untouched, the result is cached per sprite and biome.
   * Outlines are drawn per cell so neighbouring frames never bleed into each other.
   */
  graded(name, grade, fit = 1, outline = true) {
    const key = `${name}|${grade.key}|${fit}|${outline ? 1 : 0}`;
    let c = this.gradeCache.get(key);
    if (c) return c;
    const src = this.sprites[name];
    const spec = this.manifest.sprites[name];
    const [cw, ch] = spec.cell;
    c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(src, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    const W = c.width;
    const H = c.height;
    const sat = 1 - (1 - grade.sat) * fit;
    const bright = 1 - (1 - grade.bright) * fit;
    const mix = grade.mix * fit;
    const [tr, tg, tb] = grade.tint;
    const solid = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const o = i * 4;
      const a = d[o + 3];
      if (a > 0) solid[i] = a > 100 ? 1 : 0;
      if (!a) continue;
      let r = d[o];
      let gg = d[o + 1];
      let b = d[o + 2];
      const l = 0.299 * r + 0.587 * gg + 0.114 * b;
      r = (l + (r - l) * sat) * bright;
      gg = (l + (gg - l) * sat) * bright;
      b = (l + (b - l) * sat) * bright;
      // Multiply toward the ambient colour so shadows pick up the room's light, highlights stay readable.
      r = r * (1 - mix) + ((r * tr) / 255) * mix * 1.15;
      gg = gg * (1 - mix) + ((gg * tg) / 255) * mix * 1.15;
      b = b * (1 - mix) + ((b * tb) / 255) * mix * 1.15;
      d[o] = r > 255 ? 255 : r;
      d[o + 1] = gg > 255 ? 255 : gg;
      d[o + 2] = b > 255 ? 255 : b;
    }
    if (outline) {
      const [or, og, ob] = grade.outline;
      for (let cy = 0; cy < H; cy += ch) {
        for (let cx = 0; cx < W; cx += cw) {
          const x1 = Math.min(W, cx + cw);
          const y1 = Math.min(H, cy + ch);
          for (let y = cy; y < y1; y++) {
            for (let x = cx; x < x1; x++) {
              const i = y * W + x;
              if (d[i * 4 + 3] > 20) continue;
              let n = false;
              if (x > cx && solid[i - 1]) n = true;
              else if (x < x1 - 1 && solid[i + 1]) n = true;
              else if (y > cy && solid[i - W]) n = true;
              else if (y < y1 - 1 && solid[i + W]) n = true;
              if (n) {
                const o = i * 4;
                d[o] = or;
                d[o + 1] = og;
                d[o + 2] = ob;
                d[o + 3] = 235;
              }
            }
          }
        }
      }
    }
    g.putImageData(img, 0, 0);
    this.gradeCache.set(key, c);
    return c;
  }

  /** A copy of the (optionally graded) sprite sheet with every opaque pixel painted one color (hit flash, Blight tint). */
  tinted(name, color, base = null, baseKey = "") {
    const key = `${name}|${baseKey}|${color}`;
    let c = this.tintCache.get(key);
    if (c) return c;
    const src = base ?? this.sprites[name];
    c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext("2d");
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    this.tintCache.set(key, c);
    return c;
  }

  /** Frame index for a looping or one-shot animation at `ms` since it began. */
  frameAt(sprite, anim, ms) {
    const a = this.manifest.sprites[sprite].anims[anim];
    const f = Math.floor((ms / 1000) * a.fps);
    return a.loop ? f % a.frames : Math.min(a.frames - 1, f);
  }

  /** Frame index from a 0..1 progress through the animation. */
  frameAtProgress(sprite, anim, k) {
    const a = this.manifest.sprites[sprite].anims[anim];
    return Math.max(0, Math.min(a.frames - 1, Math.floor(k * a.frames)));
  }

  /**
   * Draws one frame with its anchor on (x, y), which is the feet position in the destination space.
   * `flip` mirrors around the anchor. `tint` is an optional color key for a flat-colored copy.
   */
  draw(ctx, sprite, anim, frame, x, y, { flip = false, scale = 1, alpha = 1, tint = null, grade = null, fit = 1, outline = true } = {}) {
    const s = this.manifest.sprites[sprite];
    const a = s.anims[anim];
    if (!a) return;
    const [cw, ch] = s.cell;
    const lit = grade ? this.graded(sprite, grade, fit, outline) : null;
    const img = tint ? this.tinted(sprite, tint, lit, grade ? `${grade.key}|${fit}|${outline ? 1 : 0}` : "") : lit ?? this.sprites[sprite];
    const f = Math.max(0, Math.min(a.frames - 1, frame | 0));
    const ax = s.anchor[0];
    const ay = s.anchor[1];
    const prev = ctx.globalAlpha;
    if (alpha !== 1) ctx.globalAlpha = prev * alpha;
    if (!flip) {
      ctx.drawImage(img, f * cw, a.row * ch, cw, ch, Math.round(x - ax * scale), Math.round(y - ay * scale), cw * scale, ch * scale);
    } else {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(-1, 1);
      ctx.drawImage(img, f * cw, a.row * ch, cw, ch, -ax * scale, -ay * scale, cw * scale, ch * scale);
      ctx.restore();
    }
    if (alpha !== 1) ctx.globalAlpha = prev;
  }
}
