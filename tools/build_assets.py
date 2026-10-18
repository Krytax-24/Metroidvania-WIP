#!/usr/bin/env python3
"""
Asset pipeline for Ashen Ascent (web).

Reads the raw art packs straight from their .zip files and writes game-ready files:

  assets/sprites/<name>.png    one row per animation, frames trimmed to a shared cell
  assets/tiles/<biome>.png     16 px terrain pieces + scaled decor, packed in one sheet
  assets/bg/<biome>_<n>.png    parallax backgrounds
  assets/manifest.json         every animation (row, frame count, fps, loop), anchors, tile map

Usage (from the v2 folder):

  python tools/build_assets.py --assets "C:/Users/you/Downloads/Game Assets"

Needs Python 3.9+ and Pillow (pip install pillow). Nothing is written outside --out.
Add a new character or biome by adding an entry to SPRITES or BIOMES below.
"""
from __future__ import annotations

import argparse
import io
import json
import re
import sys
import zipfile
from pathlib import Path

from PIL import Image

ALPHA_MIN = 16  # pixels with alpha below this count as empty when trimming


# --------------------------------------------------------------------------- zip helpers


class Pack:
    """A zip archive with case-insensitive path lookup, read lazily."""

    def __init__(self, path: Path):
        self.zf = zipfile.ZipFile(path)
        self.names = [n for n in self.zf.namelist() if not n.endswith("/") and "__MACOSX" not in n]
        self.lower = {n.lower(): n for n in self.names}

    def img(self, name: str) -> Image.Image:
        real = self.lower.get(name.lower())
        if real is None:
            raise FileNotFoundError(f"{name} not found in archive")
        return Image.open(io.BytesIO(self.zf.read(real))).convert("RGBA")

    def find(self, pattern: str) -> list[str]:
        rx = re.compile(pattern, re.I)
        return sorted(n for n in self.names if rx.search(n))


def sheet_frames(im: Image.Image, count: int | None = None, fw: int | None = None) -> list[Image.Image]:
    """Split a horizontal strip into equal frames, by frame count or frame width."""
    if fw is None:
        assert count, "sheet_frames needs count or fw"
        fw = im.width // count
    n = im.width // fw
    if count:
        n = min(n, count)
    return [im.crop((i * fw, 0, (i + 1) * fw, im.height)) for i in range(n)]


def numbered(pack: Pack, folder: str, stem: str, first: int, last: int, digits: int = 2) -> list[Image.Image]:
    return [pack.img(f"{folder}/{stem}{i:0{digits}d}.png") for i in range(first, last + 1)]


# --------------------------------------------------------------------------- sprite packing


def bbox(im: Image.Image):
    a = im.getchannel("A").point(lambda v: 255 if v >= ALPHA_MIN else 0)
    return a.getbbox()


def pack_sprite(name: str, anims: dict[str, dict], out_dir: Path, feet_anim: str = "idle") -> dict:
    """anims: {anim: {frames: [Image], fps: int, loop: bool}}. Returns the manifest entry."""
    # Union bounding box across every frame keeps relative motion intact.
    ux0 = uy0 = 10**9
    ux1 = uy1 = -1
    fw0 = fh0 = 0
    for a in anims.values():
        for f in a["frames"]:
            fw0, fh0 = max(fw0, f.width), max(fh0, f.height)
            b = bbox(f)
            if b:
                ux0, uy0, ux1, uy1 = min(ux0, b[0]), min(uy0, b[1]), max(ux1, b[2]), max(uy1, b[3])
    pad = 1
    ux0, uy0 = max(0, ux0 - pad), max(0, uy0 - pad)
    ux1, uy1 = min(fw0, ux1 + pad), min(fh0, uy1 + pad)
    cw, ch = ux1 - ux0, uy1 - uy0

    # Feet anchor from the first frame of the reference animation: lowest opaque row,
    # horizontal centre of the lowest 6 opaque rows (so a weapon never shifts the anchor).
    ref = anims[feet_anim]["frames"][0]
    rb = bbox(ref)
    px = ref.load()
    xs = [x for y in range(max(rb[1], rb[3] - 6), rb[3]) for x in range(ref.width) if px[x, y][3] >= ALPHA_MIN]
    feet_x = (sum(xs) / len(xs)) if xs else (rb[0] + rb[2]) / 2
    anchor = [round(feet_x - ux0, 1), rb[3] - uy0]
    body = [rb[2] - rb[0], rb[3] - rb[1]]

    rows = len(anims)
    cols = max(len(a["frames"]) for a in anims.values())
    atlas = Image.new("RGBA", (cols * cw, rows * ch), (0, 0, 0, 0))
    meta = {}
    for r, (an, a) in enumerate(anims.items()):
        for c, f in enumerate(a["frames"]):
            canvas = Image.new("RGBA", (fw0, fh0), (0, 0, 0, 0))
            canvas.paste(f, (0, 0))
            atlas.paste(canvas.crop((ux0, uy0, ux1, uy1)), (c * cw, r * ch))
        meta[an] = {"row": r, "frames": len(a["frames"]), "fps": a.get("fps", 10), "loop": a.get("loop", True)}
    out_dir.mkdir(parents=True, exist_ok=True)
    atlas.save(out_dir / f"{name}.png", optimize=True)
    return {"image": f"sprites/{name}.png", "cell": [cw, ch], "anchor": anchor, "body": body, "anims": meta}


def A(frames, fps=10, loop=True):
    return {"frames": frames, "fps": fps, "loop": loop}


# --------------------------------------------------------------------------- sprite specs


def build_gino(p: Pack) -> dict:
    g = "Gino Character/PNG"
    ij = f"{g}/Idle, run, jump"
    return {
        "idle": A(numbered(p, ij, "idle", 1, 9), 9),
        "run": A(numbered(p, ij, "run", 1, 8), 14),
        "jump_start": A(numbered(p, ij, "jump_start", 1, 2), 14, False),
        "air": A(numbered(p, ij, "jump_mid", 1, 4), 8),
        "land": A([p.img(f"{ij}/jump_landing.png")], 10, False),
        "hit": A(numbered(p, f"{g}/Hit, death", "hit", 1, 3), 14, False),
        "death": A(numbered(p, f"{g}/Hit, death", "death", 1, 5), 8, False),
        "ledge": A([p.img(f"{g}/Ledge grab/ledge_grab.png")] + numbered(p, f"{g}/Ledge grab", "ledge_grab", 1, 3), 10),
        "slide": A(
            numbered(p, f"{g}/Slide", "slide_start", 1, 2) + [p.img(f"{g}/Slide/slide.png")] + numbered(p, f"{g}/Slide", "slide_end", 1, 2),
            16,
            False,
        ),
        "atk1": A(numbered(p, f"{g}/Attacks", "AttackA", 1, 7), 24, False),
        "atk2": A(numbered(p, f"{g}/Attacks", "AttackB", 1, 5), 22, False),
        "atk3": A(numbered(p, f"{g}/Attacks", "AttackC", 1, 7), 22, False),
        "heavy": A(numbered(p, f"{g}/Attacks", "AttackD", 1, 8), 20, False),
        "air_atk": A(numbered(p, f"{g}/Attack in jump", "attack_in_jump", 1, 7), 24, False),
        "throw": A(numbered(p, f"{g}/Throw attack", "throw_attack", 1, 7), 20, False),
    }


def build_gino_dagger(p: Pack) -> dict:
    d = "Gino Character/PNG/Throw attack"
    return {
        "fly": A([p.img(f"{d}/throw_dagger.png")], 1),
        "hit": A(numbered(p, d, "throw_dagger_hit", 1, 3), 14, False),
    }


def build_knight(p: Pack) -> dict:
    s = "FREE_Knight 2D Pixel Art v1.2/Sprites"

    def strip(name, fps, loop=True):
        return A(sheet_frames(p.img(f"{s}/{name}.png"), fw=112), fps, loop)

    return {
        "idle": strip("IDLE", 10),
        "run": strip("RUN", 14),
        "walk": strip("WALK", 10),
        "jump_start": strip("JUMP-START", 14, False),
        "air": strip("JUMP-TRANSITION", 8),
        "fall": strip("JUMP-FALL", 8),
        "hit": strip("HURT", 16, False),
        "death": strip("DEATH", 10, False),
        "block": strip("BLOCK", 18, False),
        "atk1": strip("ATTACK 1", 20, False),
        "atk2": strip("ATTACK 2", 20, False),
        "atk3": strip("ATTACK 3", 20, False),
    }


def build_mage(p: Pack) -> dict:
    s = "Wanderer Magican"

    def strip(name, fps, loop=True, count=None):
        return A(sheet_frames(p.img(f"{s}/{name}.png"), fw=128, count=count), fps, loop)

    return {
        "idle": strip("Idle", 9),
        "walk": strip("Walk", 10),
        "run": strip("Run", 14),
        "air": strip("Jump", 10),
        "hit": strip("Hurt", 12, False),
        "death": strip("Dead", 8, False),
        "atk1": strip("Attack_1", 18, False),
        "atk2": strip("Attack_2", 18, False),
        "charge": strip("Charge_2", 10),
    }


def build_mage_fx(p: Pack) -> dict:
    s = "Wanderer Magican"
    return {
        "arrow": A(sheet_frames(p.img(f"{s}/Magic_arrow.png"), fw=128), 16),
        "sphere": A(sheet_frames(p.img(f"{s}/Magic_sphere.png"), fw=128), 24, False),
    }


def build_fire_mage(p: Pack) -> dict:
    s = "Fire vizard"

    def strip(name, fps, loop=True, fw=128):
        return A(sheet_frames(p.img(f"{s}/{name}.png"), fw=fw), fps, loop)

    return {
        "idle": strip("Idle", 8),
        "walk": strip("Walk", 8),
        "run": strip("Run", 12),
        "air": strip("Jump", 10),
        "hit": strip("Hurt", 12, False),
        "death": strip("Dead", 8, False),
        "atk1": strip("Attack_1", 12, False),
        "atk2": strip("Attack_2", 12, False),
        "charge": strip("Charge", 12, True, fw=64),
        "flame": strip("Flame_jet", 20, False),
    }


def build_lightning_mage(p: Pack) -> dict:
    s = "Lightning Mage"

    def strip(name, fps, loop=True, fw=128):
        return A(sheet_frames(p.img(f"{s}/{name}.png"), fw=fw), fps, loop)

    return {
        "idle": strip("Idle", 8),
        "walk": strip("Walk", 8),
        "run": strip("Run", 12),
        "air": strip("Jump", 10),
        "hit": strip("Hurt", 12, False),
        "death": strip("Dead", 8, False),
        "atk1": strip("Attack_1", 16, False),
        "atk2": strip("Attack_2", 12, False),
        "charge": strip("Light_charge", 16, True),
    }


def enemy_frames(p: Pack, folder: str, stem: str) -> list[Image.Image]:
    names = p.find(rf"{re.escape(folder)}/{re.escape(stem)}\d+\.png$")
    return [p.img(n) for n in names]


def build_enemy(p: Pack, folder: str, mapping: dict[str, tuple[str, int, bool]]) -> dict:
    out = {}
    for anim, (stem, fps, loop) in mapping.items():
        frames = enemy_frames(p, folder, stem)
        if not frames:
            raise FileNotFoundError(f"{folder}/{stem}*")
        out[anim] = A(frames, fps, loop)
    return out


def build_mushroom(p: Pack) -> dict:
    s = "Forest_Monsters_FREE/Mushroom/Mushroom without VFX/Mushroom"

    def strip(n, fps, loop=True):
        return A(sheet_frames(p.img(f"{s}-{n}.png"), fw=80), fps, loop)

    return {"idle": strip("Idle", 8), "walk": strip("Run", 12), "attack": strip("Attack", 14, False), "hit": strip("Hit", 14, False), "death": strip("Die", 12, False), "stun": strip("Stun", 10)}


def build_blacksmith(p: Pack) -> dict:
    s = "FREE - Blacksmith 2D Pixel Art/Sprites/BLACKSMITH.png"
    return {"idle": A(sheet_frames(p.img(s), fw=96), 8)}


def build_slime(p: Pack, color: str) -> dict:
    im = p.img(f"GandalfHardcore Slime Enemy/Slime {color}.png")
    # 256x96 sheet: 8 columns x 3 rows of 32 px frames.
    cols, rows = 8, 3
    fw, fh = im.width // cols, im.height // rows
    frames = [[im.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh)) for c in range(cols)] for r in range(rows)]
    return {"idle": A(frames[0], 8), "move": A(frames[1], 10), "hit": A(frames[2], 12, False)}


# --------------------------------------------------------------------------- extra characters (round 3)


def bottom_align(frames: list[Image.Image], w: int, h: int, margin: int = 2) -> list[Image.Image]:
    """Put every frame on a w x h canvas with its lowest opaque row on the same line, centred horizontally by its bounding box."""
    out = []
    for f in frames:
        b = bbox(f)
        canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        if b:
            cx = (b[0] + b[2]) // 2
            canvas.paste(f.crop((0, 0, f.width, f.height)), (w // 2 - cx, h - margin - b[3]))
        out.append(canvas)
    return out


def build_knight_variant(p: Pack, k: int) -> dict:
    """Knight_1/2/3 from the 128 px sprite sheets. Used for the Penitent NPC (1), Hollow Knight (2) and Blight Knight (3)."""
    s = f"Spritesheet 128/Knight_{k}"

    def strip(name, fps, loop=True):
        return A(sheet_frames(p.img(f"{s}/{name}.png"), fw=128), fps, loop)

    return {
        "idle": strip("Idle", 7),
        "walk": strip("Walk", 10),
        "run": strip("Run", 14),
        "air": strip("Jump", 10),
        "hit": strip("Hurt", 12, False),
        "death": strip("Dead", 9, False),
        "block": strip("Defend", 12, False),
        "attack": strip("Attack 1", 14, False),
        "atk2": strip("Attack 2", 14, False),
        "atk3": strip("Attack 3", 14, False),
    }


def build_warrior(p: Pack) -> dict:
    """GandalfHardcore Warrior: 10 columns x 17 rows of 80 x 64 cells, only the used cells are filled."""
    im = p.img("GandalfHardcore Warrior.png")
    fw, fh = 80, 64

    def row(r, n):
        return [im.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh)) for c in range(n)]

    return {
        "idle": A(row(7, 5), 7),
        "walk": A(row(8, 8), 10),
        "attack": A(row(14, 6), 14, False),
        "hit": A(row(5, 4), 12, False),
        "death": A(row(13, 4), 8, False),
    }


def build_lamplighter(idle_png: Image.Image, walk_png: Image.Image) -> dict:
    idle = [idle_png.crop((i * 46, 0, (i + 1) * 46, 55)) for i in range(10)]
    walk = [walk_png.crop((c * 45, 0, (c + 1) * 45, 58)) for c in range(4)]
    return {"idle": A(bottom_align(idle, 48, 60), 7), "walk": A(bottom_align(walk, 48, 60), 8)}


def build_wisp(sheet: Image.Image) -> dict:
    """penzillia AnimationSheet: 8 columns x 6 rows of 24 px cells (white spirit figure)."""
    def cell(c, r):
        return sheet.crop((c * 24, r * 24, (c + 1) * 24, (r + 1) * 24))

    return {
        "idle": A([cell(2, 3), cell(3, 3), cell(4, 3), cell(3, 3)], 5),
        "walk": A([cell(c, 1) for c in range(8)], 11),
        "hit": A([cell(6, 4), cell(7, 4)], 6, False),
        "death": A([cell(6, 4), cell(7, 4)], 4, False),
    }


# 32rogues: 32 px cells; (column, row) from rogues.txt. Rows 1..5 then 7, 8 (row 6 is absent from the sheet).
ROGUE_NPCS = {
    "rg_priest": (1, 2),
    "rg_monk": (0, 2),
    "rg_scholar": (5, 5),
    "rg_shopkeep": (2, 6),
    "rg_elder_f": (3, 6),
    "rg_elder_m": (4, 6),
    "rg_templar": (4, 2),
    "rg_druid": (2, 4),
}
# monsters.png: (column, row)
ROGUE_MONSTERS = {
    "rg_skeleton": (0, 4),
    "rg_zombie": (4, 4),
    "rg_cultist": (3, 5),
    "rg_wraith": (2, 5),
    "rg_banshee": (0, 5),
    "rg_reaper": (1, 5),
}


def shifted(im: Image.Image, dx: int = 0, dy: int = 0) -> Image.Image:
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.paste(im, (dx, dy))
    return out


def flash(im: Image.Image, k: float) -> Image.Image:
    """Brighten toward white by k (0..1), keeping alpha."""
    r, g, b, a = im.split()
    lut = lambda v: int(v + (255 - v) * k)
    return Image.merge("RGBA", (r.point(lut), g.point(lut), b.point(lut), a))


def still_figure_anims(base: Image.Image, enemy: bool) -> dict:
    """Give a single 32 px figure a small set of procedural animations: breathe, shuffle, lunge, recoil, collapse."""
    idle = [base, shifted(base, 0, -1), base, shifted(base, 0, 0)]
    out = {"idle": A(idle, 3)}
    if enemy:
        walk = [shifted(base, 0, 0), shifted(base, 1, -1), shifted(base, 2, 0), shifted(base, 1, -1)]
        lunge = [shifted(base, -2, 0), shifted(base, -3, 0), shifted(base, 4, 0), shifted(base, 5, 0), shifted(base, 3, 0), shifted(base, 1, 0)]
        out["walk"] = A(walk, 6)
        out["attack"] = A(lunge, 12, False)
        out["hit"] = A([flash(shifted(base, -2, 0), 0.7), shifted(base, -1, 0)], 10, False)
        fall = [base.rotate(-a, resample=Image.NEAREST, center=(16, 31), expand=False) for a in (10, 30, 55, 80)]
        out["death"] = A(fall, 8, False)
    return out


def build_rogues(root: Path, out_dir: Path, manifest: dict) -> None:
    pack = Pack(root / "Rogues" / "32rogues-0.5.0.zip")
    chars = pack.img("32rogues/rogues.png")
    mons = pack.img("32rogues/monsters.png")
    icons = pack.img("32rogues/items.png")

    def cell(im, col, row):
        return im.crop((col * 32, row * 32, (col + 1) * 32, (row + 1) * 32))

    jobs = []
    for name, (c, r) in ROGUE_NPCS.items():
        jobs.append((name, still_figure_anims(cell(chars, c, r), False)))
    for name, (c, r) in ROGUE_MONSTERS.items():
        jobs.append((name, still_figure_anims(cell(mons, c, r), True)))
    for name, anims in jobs:
        entry = pack_sprite(name, anims, out_dir / "sprites", "idle")
        manifest["sprites"][name] = entry
        print(f"sprite {name:15s} cell {entry['cell']} anchor {entry['anchor']}")

    # Item icons: the whole sheet is kept as is (32 px cells), indexed by name from items.txt.
    names = {}
    txt = pack.zf.read(pack.lower["32rogues/items.txt"]).decode("utf-8", "ignore")
    for line in txt.splitlines():
        m = re.match(r"\s*(\d+)\.([a-z])\.\s*(.+?)\s*$", line)
        if m:
            row, col = int(m.group(1)) - 1, ord(m.group(2)) - 97
            if row < icons.height // 32 and col < icons.width // 32:
                names.setdefault(m.group(3).lower(), [col, row])
    (out_dir / "ui").mkdir(parents=True, exist_ok=True)
    icons.save(out_dir / "ui" / "items.png", optimize=True)
    manifest["icons"] = {"image": "ui/items.png", "cell": 32, "names": names}
    print(f"icons  {len(names)} named items")


# --------------------------------------------------------------------------- tiles


def fit(im: Image.Image, w: int, h: int) -> Image.Image:
    return im.resize((w, h), Image.LANCZOS)


def scaled(im: Image.Image, k: float) -> Image.Image:
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)


BIOMES = {
    # id: pack file stem, filename prefix inside the zip, decor list [(piece, scale)], background layers
    "crystal": {
        "zip": "craftpix-net-376431-free-crystal-caves-2d-platformer-tileset.zip",
        "prefix": "Crystal_Caves_Forest_2D_Platformer_Tileset",
        "decor": [
            ("Candlestick", 0.2), ("Crystal 01", 0.2), ("Crystal 02", 0.2), ("Crystal 03", 0.2), ("Crystal pile 01", 0.18),
            ("Crystal pile 02", 0.18), ("Crystal spike", 0.2), ("Fire", 0.22), ("Pillar", 0.2), ("Rock 01", 0.16), ("Rock 02", 0.16),
            ("Rock 03", 0.16), ("Rock 04", 0.16), ("Rune stone", 0.2), ("Signpost 01", 0.18), ("Signpost 04", 0.18), ("Stand", 0.2),
            ("Tree", 0.2), ("Stone 01", 0.18), ("Stone 02", 0.18), ("Table", 0.18),
        ],
    },
    "sky": {
        "zip": "craftpix-net-499014-free-sky-ruins-2d-platformer-tileset.zip",
        "prefix": "Sky_Ruins_2D_Platformer_Tileset",
        "decor": [
            ("Abandoned columns", 0.2), ("Big stone", 0.2), ("Column", 0.2), ("Fence 01", 0.2), ("Fence 02", 0.2), ("Grass", 0.2),
            ("Magic stone 01", 0.2), ("Magic stone 02", 0.2), ("Old brick wall", 0.2), ("Old stone", 0.18), ("Pad", 0.18),
            ("Part wall", 0.2), ("Portal", 0.22), ("Rock 01", 0.16), ("Rock 02", 0.16), ("Rock 03", 0.16), ("Signpost 01", 0.18),
            ("Signpost 04", 0.18), ("Stone 01", 0.18), ("Stone 02", 0.18), ("Tree", 0.2),
        ],
    },
    "autumn": {
        "zip": "craftpix-net-763418-free-autumn-forest-2d-platformer-tileset.zip",
        "prefix": "Autumn_Forest_2D_Platformer_Tileset",
        "decor": [],  # filled from the pack's Environment folder (names differ), see build_biome
    },
}

GROUND_PIECES = {
    # tile-map name: source piece (all downscaled to one 16 px tile)
    "top_a": "Ground 02", "top_b": "Ground 10", "top_c": "Ground 11", "top_d": "Ground 12",
    "tl": "Ground 04", "tr": "Ground 08",
    "fill": "Ground 06", "fill_tl": "Ground 05", "fill_tr": "Ground 07",
    "wall_l": "Ground 09",
    "cracked": "Stone", "breakable": "Brick 01", "seal": "Brick 02", "lever": "Wooden Box", "barrel": "Wooden Barrel", "bonus": "Bonus",
}


def build_biome(root: Path, bid: str, spec: dict, out: Path) -> dict:
    pack = Pack(root / "Medievial" / spec["zip"])
    pre = spec["prefix"]

    def plat(n):
        return pack.img(f"PNG/Platfromer/{pre}_Platformer - {n}.png")

    def env(n):
        return pack.img(f"PNG/Environment/{pre}_Environment - {n}.png")

    pieces: list[tuple[str, Image.Image]] = []
    for key, src in GROUND_PIECES.items():
        pieces.append((key, fit(plat(src), 16, 16)))
    spike = plat("Spike")
    pieces.append(("spike", fit(spike, 16, 12)))
    pieces.append(("ladder", fit(plat("Ladder"), 16, 16)))

    decor = list(spec["decor"])
    if not decor:
        names = [Path(n).stem.split(" - ", 1)[1] for n in pack.find(r"PNG/Environment/.*\.png$")]
        keep = [n for n in names if re.search(r"Tree|Stump|Log|Rock|Stone|Signpost 01|Signpost 04|Bush|Mushroom|Fence|Grass|Lantern|Pillar|Fire|Candle", n, re.I)]
        decor = [(n, 0.18 if "Tree" not in n else 0.2) for n in keep[:24]]
    decor_imgs: list[tuple[str, Image.Image]] = []
    for name, k in decor:
        try:
            decor_imgs.append((name, scaled(env(name), k)))
        except FileNotFoundError:
            print(f"  note: {bid} has no Environment piece '{name}', skipped")

    # Collectables share one naming scheme across packs.
    col_names = ["Coin 01", "Coin 02", "Coin 03", "Coin 04", "Coin 05", "Coin 06", "Crystal", "Life", "Mana", "Star", "Golden Key", "Silver Key",
                 "Locked Golden Treasure Box", "Locked Silver Treasure Box"]
    cols: list[tuple[str, Image.Image]] = []
    for n in col_names:
        try:
            im = pack.img(f"PNG/Collectable Object/{pre}_Collectable Object - {n}.png")
            cols.append(("col_" + n.lower().replace(" ", "_"), scaled(im, 0.14)))
        except FileNotFoundError:
            pass

    # Portal (Sky Ruins) doubles as the Warden's Gate when present.
    extra: list[tuple[str, Image.Image]] = []

    # Shelf-pack everything into one sheet.
    items = [(n, im) for n, im in pieces + decor_imgs + cols + extra]
    sheet_w = 512
    x = y = row_h = 0
    placed = {}
    for n, im in sorted(items, key=lambda t: -t[1].height):
        if x + im.width + 1 > sheet_w:
            x, y, row_h = 0, y + row_h + 1, 0
        placed[n] = (x, y, im)
        x += im.width + 1
        row_h = max(row_h, im.height)
    sheet_h = y + row_h + 1
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))
    rects = {}
    for n, (px, py, im) in placed.items():
        sheet.paste(im, (px, py))
        rects[n] = [px, py, im.width, im.height]
    (out / "tiles").mkdir(parents=True, exist_ok=True)
    sheet.save(out / "tiles" / f"{bid}.png", optimize=True)

    # Backgrounds: layer 00 is the full backdrop, layer 01 a foreground silhouette strip.
    (out / "bg").mkdir(parents=True, exist_ok=True)
    bgs = []
    for i in (0, 1):
        im = pack.img(f"PNG/Background/{pre}_Background - Layer 0{i}.png")
        im = im.resize((800, 450), Image.LANCZOS)
        if i == 0:
            im = im.convert("RGB")
        im.save(out / "bg" / f"{bid}_{i}.png", optimize=True)
        bgs.append(f"bg/{bid}_{i}.png")
    return {"image": f"tiles/{bid}.png", "rects": rects, "bg": bgs, "decor": [n for n, _ in decor_imgs]}


# --------------------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--assets", required=True, help='Folder containing the zips, e.g. "C:/Users/you/Downloads/Game Assets"')
    ap.add_argument("--out", default="assets", help="Output folder (default: assets)")
    args = ap.parse_args()
    root, out = Path(args.assets), Path(args.out)
    if not root.is_dir():
        print(f"Assets folder not found: {root}", file=sys.stderr)
        return 1
    spr = out / "sprites"
    manifest: dict = {"version": 1, "sprites": {}, "tiles": {}}

    sprites_zip = Pack(root / "Sprites.zip")
    knight_zip = Pack(root / "FREE_Knight 2D Pixel Art v1.2.zip")
    wiz_zip = Pack(root / "free-wizard-sprite-sheets-pixel-art.zip")
    mush_zip = Pack(root / "Monsters" / "Forest_Monsters_FREE.zip")
    smith_zip = Pack(root / "FREE - Blacksmith 2D Pixel Art.zip")
    slime_zip = Pack(root / "Character Asset" / "GandalfHardcore Slime Enemy.zip")
    knights_zip = Pack(root / "knight-character-sprites-pixel-art.zip")
    warrior_zip = Pack(root / "Character Asset" / "GandalfHardcore FREE Warrior.zip")
    sample_zip = Pack(root / "sample(idle&walk).zip")
    wisp_sheet = Image.open(root / "penzillia" / "AnimationSheet.png").convert("RGBA")

    jobs = [
        ("gino", build_gino(sprites_zip), "idle"),
        ("gino_dagger", build_gino_dagger(sprites_zip), "fly"),
        ("knight", build_knight(knight_zip), "idle"),
        ("mage", build_mage(wiz_zip), "idle"),
        ("mage_fx", build_mage_fx(wiz_zip), "arrow"),
        ("fire_mage", build_fire_mage(wiz_zip), "idle"),
        ("lightning_mage", build_lightning_mage(wiz_zip), "idle"),
        ("imp", build_enemy(sprites_zip, "Enemy02", {"idle": ("idle", 9, True), "walk": ("walk", 10, True), "attack": ("attack", 14, False), "hit": ("hit", 14, False)}), "idle"),
        ("bat", build_enemy(sprites_zip, "Enemy01", {"idle": ("fly", 12, True), "attack": ("attack", 14, False), "hit": ("hit", 14, False)}), "idle"),
        ("chomper", build_enemy(sprites_zip, "Enemy03", {"idle": ("idle", 9, True), "attack": ("attack_right", 14, False), "hit": ("hit", 14, False)}), "idle"),
        ("plague", build_enemy(sprites_zip, "Enemy04", {"idle": ("idle", 9, True), "walk": ("walk", 10, True), "attack": ("attack", 14, False), "hit": ("hit", 14, False)}), "idle"),
        ("worm", build_enemy(sprites_zip, "Enemy05", {"idle": ("idle", 9, True), "walk": ("walk", 10, True), "attack": ("attack", 14, False), "hit": ("hit", 14, False)}), "idle"),
        ("mushroom", build_mushroom(mush_zip), "idle"),
        ("blacksmith", build_blacksmith(smith_zip), "idle"),
        ("slime_green", build_slime(slime_zip, "green"), "idle"),
        ("knight_penitent", build_knight_variant(knights_zip, 1), "idle"),
        ("knight_hollow", build_knight_variant(knights_zip, 2), "idle"),
        ("knight_blight", build_knight_variant(knights_zip, 3), "idle"),
        ("warrior", build_warrior(warrior_zip), "idle"),
        ("lamplighter", build_lamplighter(sample_zip.img("idle/sprite sheets/idle.png"), sample_zip.img("walk/sprite sheets/walk.png")), "idle"),
        ("wisp", build_wisp(wisp_sheet), "idle"),
    ]
    for name, anims, ref in jobs:
        entry = pack_sprite(name, anims, spr, ref)
        manifest["sprites"][name] = entry
        print(f"sprite {name:15s} cell {entry['cell']} anchor {entry['anchor']} body {entry['body']} anims {len(entry['anims'])}")

    build_rogues(root, out, manifest)

    for bid, spec in BIOMES.items():
        manifest["tiles"][bid] = build_biome(root, bid, spec, out)
        print(f"biome  {bid:15s} {len(manifest['tiles'][bid]['rects'])} pieces")

    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))
    total = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    print(f"done: {total / 1024:.0f} KB in {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
