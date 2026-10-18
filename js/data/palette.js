const base = {
  spikes: "#cfc6b4",
  cracked: "#7a6450",
  bars: "#7d776e",
  crystal: "#9bd8e6",
  breakable: "#4c4440",
  shortcut: "#8a5a2c",
  seal: "#c9a24a"
};
const BIOMES = {
  undercroft: {
    void: "#07090a",
    edge: "#6d7a74",
    fg: { 1: "#3a4542", 2: "#51683f", 3: "#8c7a58", 4: base.spikes, 5: "#3f8a83", 6: base.cracked, 7: base.bars, 8: base.crystal, 9: "#3f4946", 10: base.shortcut, 11: base.seal },
    bg: { 1: "#141c1d", 2: "#192224", 3: "#1d2a2c", 4: "#2a3433", 5: "#1f2b2c" }
  },
  midreach: {
    void: "#0a0706",
    edge: "#86705a",
    fg: { 1: "#4a3a30", 2: "#5d6a3a", 3: "#a07c4a", 4: base.spikes, 5: "#c4672a", 6: base.cracked, 7: base.bars, 8: base.crystal, 9: "#4e3f35", 10: base.shortcut, 11: base.seal },
    bg: { 1: "#1d1512", 2: "#241a16", 3: "#3a2418", 4: "#3a2d26", 5: "#2a1e19" }
  },
  summit: {
    void: "#07070c",
    edge: "#7f7c99",
    fg: { 1: "#3d3c50", 2: "#5a6e48", 3: "#a39466", 4: base.spikes, 5: "#a58fd6", 6: base.cracked, 7: base.bars, 8: base.crystal, 9: "#444358", 10: base.shortcut, 11: base.seal },
    bg: { 1: "#14141e", 2: "#1a1a26", 3: "#262540", 4: "#2c2b3a", 5: "#1e1d2c" }
  }
};
const ABILITY_COLORS = {
  wraith_step: "#86a9dc",
  seraph_wing: "#ece4c6",
  penitent_grip: "#86ad5c",
  censer_fall: "#d08f4c",
  chain_of_saints: "#b9ab8c",
  bloodmist: "#cc5560",
  ember_ward: "#e59a3c",
  bell_toll: "#92d4e3"
};
const LOOT_COLORS = {
  flask_shard: "#e0605a",
  weapon: "#c9cdd6",
  relic: "#c9a24a",
  bone_dust: "#d9cfb8",
  ichor_cache: "#8d63c9"
};
const ROLE_NAMES = {
  entry: "Entry Sanctuary",
  gate: "Warden's Gate",
  warden: "Warden arena",
  herald: "Herald arena",
  ability: "Ability shrine",
  treasure: "Treasure room",
  secret: "Secret room",
  combat: "Combat room",
  platforming: "Climb",
  connector: "Crossroads",
  elite: "Elite guard",
  yard: "Training Yard",
  rampart: "The Rampart"
};
export {
  ABILITY_COLORS,
  BIOMES,
  LOOT_COLORS,
  ROLE_NAMES
};
