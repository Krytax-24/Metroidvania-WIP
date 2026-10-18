# Story, NPCs, quests and loot

## Premise

The Ninth Bell held the Cathedral-World together. When it fell silent, the Blight began to rise at nightfall. The Unshriven cannot die while their vow is unkept; each carries three candles and each death burns one. You are one of them.

## The three vows

| Lead | Vow |
|---|---|
| Gino | Stole the Ninth Bell's clapper to sell it. The silence is his doing. Vows to carry it home. |
| Knight | Kept watch on the bell tower the night it fell. Vows to keep that watch again. |
| Mage | Heard the bell's last note and could not hold it. Vows to hear the next one. |

The opening scene and the ending use the chosen lead's vow.

## Scenes (`CUTSCENES` in `js/data/story.js`)

Opening, Yard intro, three Tier arrivals (Maren, Aldric, a lost pilgrim speak), the ascent between Tiers, the ending at the Bell, and the defeat. Any key or tap advances, Escape or Skip ends a scene. The opening, the Yard intro and the Tier arrivals play once per browser; the ascent, the ending and the defeat play every time.

## People

| NPC | Where | Role |
|---|---|---|
| Oswin the Keeper | Every Sanctuary | Lore lines, rotating by Tier |
| Maren the Lamplighter | Tier I Sanctuary | Quest: Three Small Flames |
| Father Ulric | Tier I room | Quest: Last Rites |
| Old Marta | Tier I Sanctuary | Quest: The Silver Thimble |
| Sir Aldric the Penitent | Tier II room | Quest: Penance of Steel |
| Gel | Tier II room | Quest: Something Big, and a Bone Dust trade |
| Archivist Perrin | Tier II Sanctuary | Quest: The Cracked Tome |
| Lost pilgrims | Tier III rooms | Quest: The Lost Pilgrims (speak to three) |
| Tallow | Tier III Sanctuary | Quest: Hidden Stock |
| Coach Brann | The Yard | Drill board |

Each Tier offers two quests, chosen by the seed from that Tier's pool of two or three. NPCs with something to offer show a gold exclamation mark; a question mark means a quest is ready to hand in.

## Quest goals

Rest at Sanctuaries beyond the first, parry a number of attacks, find an item placed on the map, slay a number of enemies, slay an elite, speak to several wisps, or open a hidden passage.

## Rewards are always good

Every reward table (`REWARDS`) rolls from the seed, so the same seed gives the same gift. Weapon results are never below Rare, and Aldric's can be Epic. Fallbacks keep a gift from ever being dead weight: if all three relic slots are full the oldest is replaced, a weapon no better than yours becomes a temper or Bone Dust, and full candles or flasks become Ichor. Tables mix relics, weapons, Boons, flask shards, candles, Bone Dust and Ichor.
