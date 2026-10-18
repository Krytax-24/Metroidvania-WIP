var Tile = /* @__PURE__ */ ((Tile2) => {
  Tile2[Tile2["AIR"] = 0] = "AIR";
  Tile2[Tile2["SOLID"] = 1] = "SOLID";
  Tile2[Tile2["GRIP"] = 2] = "GRIP";
  Tile2[Tile2["ONEWAY"] = 3] = "ONEWAY";
  Tile2[Tile2["SPIKES"] = 4] = "SPIKES";
  Tile2[Tile2["LIQUID"] = 5] = "LIQUID";
  Tile2[Tile2["CRACKED"] = 6] = "CRACKED";
  Tile2[Tile2["BARS"] = 7] = "BARS";
  Tile2[Tile2["CRYSTAL"] = 8] = "CRYSTAL";
  Tile2[Tile2["BREAKABLE"] = 9] = "BREAKABLE";
  Tile2[Tile2["SHORTCUT"] = 10] = "SHORTCUT";
  Tile2[Tile2["SEAL"] = 11] = "SEAL";
  return Tile2;
})(Tile || {});
var Bg = /* @__PURE__ */ ((Bg2) => {
  Bg2[Bg2["NONE"] = 0] = "NONE";
  Bg2[Bg2["WALL"] = 1] = "WALL";
  Bg2[Bg2["PILLAR"] = 2] = "PILLAR";
  Bg2[Bg2["WINDOW"] = 3] = "WINDOW";
  Bg2[Bg2["CHAIN"] = 4] = "CHAIN";
  Bg2[Bg2["ARCH"] = 5] = "ARCH";
  return Bg2;
})(Bg || {});
const TILE_NAMES = {
  0: "air",
  1: "solid",
  2: "grip wall",
  3: "platform",
  4: "spikes",
  5: "liquid",
  6: "cracked floor",
  7: "grate",
  8: "crystal seal",
  9: "secret wall",
  10: "lever door",
  11: "Warden seal"
};
export {
  Bg,
  TILE_NAMES,
  Tile
};
