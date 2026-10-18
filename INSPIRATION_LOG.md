# Inspiration log

The twelve repositories you shared, what each one contributed, and what was only read. The repository links themselves were not kept in the project notes, so this log is based on the names recorded in `claude/V2_REBUILD.md` and on what the code reflects today. Nothing was copied from any of them; where a repository is listed as a source of an idea, the code here is written fresh in this project's own structure.

| Repository | What it gave this game | Where it shows up |
|---|---|---|
| Metroidvania-System | Room and cell grid thinking, typed room borders, stable object IDs, map screen conventions | `js/gen/layout.js`, `js/gen/types.js`, the map screen in `js/ui/mapdraw.js` |
| TheSeeker | A written movement spec, and the idea of connecting chunks through typed connectors | `PLAYER` in `js/gen/physics.js`, door and connector logic in `js/gen/rooms.js` |
| SilkMelody | Parry feel, pogo and up-attack ideas, boss room entry, screen shake | Parry window and riposte in `js/sim/player.js`, boss intro in `js/sim/boss.js`, trauma shake in `js/game/renderer.js` |
| meteorite | Coloured ability doors, save stations, simple state machines | Gate colours in `js/data/palette.js`, Sanctuary checkpoint save in `js/app/save.js`, state machines in `js/sim/` |
| ManiaMap | A door code idea for map generation | Deferred; not used |
| RetroFutureGame | Gamepad layout | `DEFAULT_PAD` in `js/app/keybinds.js` and the Controller tab of the Controls screen |
| ROTA | Reviewed only; netcode ideas parked for co-op | Nothing in the code |
| PixiesPixel | Reviewed only | Nothing in the code |
| opensoldat | Reviewed only; netcode ideas parked for co-op | Nothing in the code |
| phaservania | Reviewed only | Nothing in the code |
| Cyberpunk-Metroidvania | Reviewed only | Nothing in the code |
| KnightPlatformer | Reviewed only | Nothing in the code |

## What changed in this round because of them

1. Saves follow the meteorite model: a checkpoint at the save station (our Sanctuary), not a free save anywhere. The same rule keeps the simulation deterministic, because a checkpoint never has to capture a fight in progress.
2. The controller defaults follow the RetroFutureGame layout, and the new rebinding screen keeps that map as the "restore defaults" target.
3. The Training Yard borrows the Metroidvania-System idea of authored, typed rooms: it is a hand-built map in the same format the generator produces, so the renderer, simulation and reachability checker treat it like any other Tier.
4. The Rampart's eight obstacles (one per gate ability) are checked with the same `ReachGraph` the generator uses to guarantee a map can be finished. `tools/yard_check.mjs` runs that check.

## Honest limits

Six of the twelve repositories were reviewed and gave nothing the game needed. If you re-send the links, this log can be expanded with exact files and commits for the six that did contribute.
