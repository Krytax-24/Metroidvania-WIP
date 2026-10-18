# Ashen Ascent v2 (browser build)

A gothic Metroidvania expedition game. Plain HTML, CSS and JavaScript (ES modules, Canvas 2D), no build step and no libraries.
Python is used only for the local dev server and the art pipeline.

## Run it

```
python serve.py
```

Then open http://localhost:8000/. The script also prints a Wi-Fi address, so a phone on the same network can play it.
Opening `index.html` by double click will not work: browsers block ES modules and `fetch` on `file://`.

## Play online

When the repository is published with GitHub Pages the game is at `https://<username>.github.io/<repository>/`. Saves, settings and key bindings live in the browser's local storage for that address, so they stay on the device you play on.

### Publish it yourself

1. Rename the folder `_github` to `.github` (a dot folder cannot be created by some tools, so it ships with an underscore), then push this folder as the root of a repository whose default branch is `main`.
2. On GitHub open **Settings, Pages**, and under **Build and deployment** choose **GitHub Actions** as the source.
3. Push to `main` (or run the workflow by hand from the **Actions** tab). `.github/workflows/pages.yml` runs `npm test`, then publishes `index.html`, `css/`, `js/` and `assets/`.
4. The address appears at the end of the workflow run and under Settings, Pages.

Free accounts can use Pages only from public repositories. Because `assets/` contains third-party art, read `CREDITS.md` before making the repository public.

## Play

From the title: **Continue** (when a save exists), **New Expedition** (three Tiers, a new map for every seed), **Training Yard** (a safe practice area), plus Settings, Controls, Credits and Fullscreen.

Pick Gino, Knight or Mage. Each has its own kit, its own drills in the Yard, and its own opening and ending lines.

### Default controls (every one can be rebound)

| | Keyboard and mouse | Controller | Touch |
|---|---|---|---|
| Move | A D or arrows | Left stick, D-pad | Drag on the left half |
| Jump | Space | A | Jump |
| Attack | J, Z or left click | X | Hit |
| Heavy (hold to charge) | K, X or right click | Y | Heavy |
| Dodge, air dash | L or Shift | B | Dodge |
| Parry | I, C or middle click | LB | Parry |
| Skill | U or V | RB | Skill |
| Ultimate | O or B | RT | Ult |
| Ember Flask | Q | LT | Flask |
| Interact, talk | E | D-pad up | Use |
| Grapple, Bell Toll | F, G | Stick clicks | (with the matching ability) |
| Pause | Esc or P | Start | II |
| Map | M or Tab | Back | Map |
| Journal | N | (menu) | Log |
| Fullscreen | F10 | | Settings |

Open **Controls** from the title or the pause menu to rebind keys and controller buttons. Bindings follow the physical key position, so WASD works on AZERTY, QWERTZ and Dvorak. Binding a key that is already used swaps the two actions. Mouse clicks turn the character toward the cursor.

Telegraph colours: gold means parry it, red means dodge it, violet means leave the area, white is a grab and only a dodge saves you.

### The Training Yard

Brann's Yard has a courtyard with five drill posts (training, gold sweep, red lunge, white grab, bolt) and the Rampart, one obstacle for each of the eight gate abilities. Talk to Coach Brann (E) for the drill board: 22 or more drills, common ones for everyone plus two for each lead. Progress is kept per character. Nobody dies in the Yard, flasks and Fervor refill for free, and there is no clock.

### Story, quests and loot

You are one of the Unshriven, who cannot die while a vow is unkept and carry three candles that each death burns. The Ninth Bell has fallen silent and the Blight rises at nightfall. Short scenes play at the start of a run, on each ascent, and at the ending. Each Tier has two side quests from NPCs placed by the seed, and every one pays a reward chosen from a weighted table that is always useful: a relic, a weapon of at least Rare quality, a Boon, flask shards, Bone Dust or Ichor. Full details are in `STORY.md`.

### Saving

One save slot. It is written when a Tier begins, every time you rest at a Sanctuary, and when a Tier is cleared. It holds your gear, quests, opened gates, defeated bosses and your position in the Tier. Continue on the title restores it. The save is deleted when you run out of candles and when you finish the game, so a lost run starts fresh. Settings and key bindings are stored separately and are never deleted by that.

## How it is built

- `js/gen/` seeded map generator with a reachability validator (lock and key, three Tiers) and the hand-built Yard map. No DOM.
- `js/sim/` the game rules at a fixed 60 Hz. No DOM, deterministic. `Sim` is the only thing that changes game state. `story.js` and `practice.js` hold the quest and drill rules.
- `js/data/` every gameplay number and every line of text: kits, gear, enemies, bosses, story, drills, credits.
- `js/game/` presentation only: renderer, animation mapping, input (keyboard, mouse, gamepad, touch), HUD, synthesized audio and music.
- `js/app/` the application layer: `app.js` (screen state machine and game loop), `events.js` (simulation events to sound, toasts and screens), `store.js`, `settings.js`, `keybinds.js`, `save.js`.
- `js/ui/` shared HTML builders (`kit.js`), the overlay manager (`ui.js`), the map drawing, the cutscene player and one file per group of screens in `screens/`.
- `js/main.js` boot only.
- `tools/` `build_assets.py` packs the art. Node checks: `headless_smoke.mjs` (random input for all kits and Tiers), `gear_check.mjs`, `music_check.mjs`, `story_check.mjs` (every quest, reward table, save round trip and determinism) and `yard_check.mjs` (a bot that completes every Yard drill for every lead).

All three characters share one body size and one movement model, so the map validator's guarantees hold for every lead.

## Gear

Relics found in the world fill three slots (more become Bone Dust). Weapons roll Common, Rare or Epic and the stronger one is equipped; spare Bone Dust tempers it at a Sanctuary. Defeating a Herald offers three Boons to pick from. Everything carries to the next Tier.

## Lighting

Characters, monsters, bosses and NPCs are graded at draw time to the light of the current biome (muted, tinted, dark outline, floor shadow). The art on disk is never recoloured; the Knight gets the lightest touch because it already matches. The grades live in `GRADES` in `js/game/renderer.js`, per-sprite strength in `js/game/anims.js`.

## Audio

There are no audio files. Effects and the music (menu, story, Yard, one theme per Tier, boss, victory, defeat) are synthesized live with the Web Audio API. Master, music and effects volumes are separate in Settings.

## Rebuild the art

```
pip install pillow
python tools/build_assets.py --assets "C:/Users/you/Downloads/Game Assets"
```

## Checks

```
node tools/headless_smoke.mjs
node tools/gear_check.mjs
node tools/music_check.mjs
node tools/story_check.mjs
node tools/yard_check.mjs
```

## Add a character

1. Add a builder and a `jobs` entry in `tools/build_assets.py`, rebuild the art.
2. Add a kit in `js/data/kits.js`, an entry in `CHAR_ART` in `js/game/anims.js`, a vow in `VOWS` in `js/data/story.js`, and two drills in `js/data/practice.js`.

## Debug keys and console

Add `?dev` to the address to enable F1 (hitboxes) and F2 (grant all abilities). In the browser console, `__ctl.start({character:'mage', seed:'abc', tier:2, allAbilities:true})` starts a run directly; add `mode:'practice'` for the Yard.

## Licenses

Several art packs forbid redistribution as a standalone asset, and 32rogues is not free for AI or machine learning use. Read `CREDITS.md` before sharing or publishing the game.
