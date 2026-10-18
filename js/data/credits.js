// Credits and licence notes shown on the Credits screen. Keep in step with CREDITS.md.
// House rule: the art packs below are used as supplied. Only render-time lighting is applied; nothing is recoloured on disk.

export const ART_CREDITS = [
  { used: "Gino, thrown dagger, imp, bat, chomper, plague doctor, worm", pack: "Sprites.zip (Gino and Enemy01 to Enemy05)", terms: "No licence file inside the pack. Check the page it came from." },
  { used: "Knight (playable); Sir Aldric, Hollow Knight, Blight Knight", pack: "FREE Knight 2D Pixel Art v1.2 (Knight 1 to 3 sheets)", terms: "Any game project, personal or commercial. Do not resell or redistribute as an asset. Credit appreciated." },
  { used: "Mage, fire mage, lightning mage", pack: "Free Wizard Sprite Sheets Pixel Art (CraftPix)", terms: "See https://craftpix.net/file-licenses/" },
  { used: "Terrain, backdrops, scenery, pickups", pack: "CraftPix free Crystal Caves, Sky Ruins and Autumn Forest tilesets", terms: "See https://craftpix.net/file-licenses/" },
  { used: "Oswin the Keeper", pack: "FREE Blacksmith 2D Pixel Art", terms: "Any game project. Do not resell or redistribute as an asset. Credit appreciated." },
  { used: "Mushroom", pack: "Forest Monsters FREE", terms: "No licence file inside. Check the download page." },
  { used: "Gel the slime, Coach Brann", pack: "GandalfHardcore Slime Enemy and Warrior", terms: "Games and projects allowed. No reselling, repackaging, AI training, game tools or NFTs." },
  { used: "Maren the Lamplighter", pack: "Lamplighter idle and walk sample from the Game Assets folder", terms: "No licence file inside. Check the download page." },
  { used: "Priest, scholar, shopkeeper, elder, skeleton, cultist, reaper and the other small figures; item icons", pack: "32rogues by Seth Boyles", terms: "Free for commercial and non-commercial games. No NFTs or blockchain. Not for generative AI or machine learning. No redistribution or resale. Credit appreciated." },
  { used: "Interface lettering reference", pack: "Penzillia sheet from the Game Assets folder", terms: "Reference only; not shipped." }
];

export const OTHER_CREDITS = [
  "Music and sound effects: original, synthesized live in your browser with the Web Audio API. No audio files.",
  "Code, story, quests and levels: Ashen Ascent, written for this project."
];

/** The twelve repositories reviewed. See INSPIRATION_LOG.md for what each one changed. */
export const INSPIRATION = [
  ["Metroidvania-System", "Room and cell grid thinking, typed borders, object IDs, map screen conventions"],
  ["TheSeeker", "Movement spec and chunk connector ideas"],
  ["SilkMelody", "Pogo and up-attack ideas, ledge grab, parry feel, boss room entry, screen shake"],
  ["meteorite", "Colored ability doors, save stations (the Sanctuary checkpoint save), simple state machines"],
  ["ManiaMap", "Door code idea, deferred"],
  ["RetroFutureGame", "Gamepad layout (the default button map and the rebinding screen build on it)"],
  ["ROTA", "Reviewed. No code borrowed; netcode ideas parked for co-op"],
  ["PixiesPixel", "Reviewed. No code borrowed"],
  ["opensoldat", "Reviewed. No code borrowed; netcode ideas parked for co-op"],
  ["phaservania", "Reviewed. No code borrowed"],
  ["Cyberpunk-Metroidvania", "Reviewed. No code borrowed"],
  ["KnightPlatformer", "Reviewed. No code borrowed"]
];
