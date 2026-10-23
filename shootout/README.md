# Shootout

A standalone 3D card-table shootout game. Plain HTML/CSS/JS with no build step; the only
library is three.js, vendored in `vendor/`. Nothing here is shared with the other projects in this repo.

**Run it:** open `shootout/index.html` in a browser (needs WebGL).

| File | What's in it |
|---|---|
| `index.html` | All screens: loading, main menu, mode select, table, settings, gunsmith, loadout |
| `engine.js` | 3D renderer, animation clock and tweens (three.js) |
| `models.js` | Every 3D model: revolver, outlaws, cards, table, chairs, shelves, desks, door, lamp, target |
| `fx.js` | Muzzle flash, gun smoke, sparks, splinters, blood |
| `stages.js` | 3D loading screen (bullet-time shot) and the menu background |
| `table.js` | The 3D card table: dealing, playing, peeking, aiming, firing, deaths, the room falling apart |
| `audio.js` | Generated music and sound effects; the music gets more intense each round |
| `bots.js` | Computer opponents: names, personalities and Easy/Normal/Hard difficulty |
| `cards.js` | Every card and what it does; hands are 3 cards |
| `items.js` | Items from the boxes: health potion, bandage, teammate, hammer, binoculars |
| `game.js` | Screens, turns, guns and shootouts |
| `vendor/three.min.js` | three.js r128 (MIT licence in `vendor/three-LICENSE`) |

## How a round works
Everyone at the table plays one card. Then comes a **shootout**: every living,
armed player, starting with you, shoots themself or someone else. Each player
has a 6-chamber revolver loaded with a random mix of live rounds and blanks
(reloaded with a new mix when it runs dry). Last one alive (or last team) wins.

**Lives and bleeding.** Everyone starts with one life: one red mark on the
table in front of them (and in the LIVES box). A live revolver round doesn't
kill you outright: you start **bleeding out**. If nobody bandages you by the
end of the next round, you lose a life; with no lives left you die. Getting
shot again while bleeding costs a life on the spot.

**Boxes.** From round 2, a box sometimes lands on the table and slides to a
random player. Opening it gives two random items. You can use items on your
turn before you play a card.

## Cards
| Card | Effect |
|---|---|
| Jack of Trades | 10% of hands get one. Play it and you (and your teammate) win instantly. |
| Bloody Mary | 20% of hands get one. Forces a shootout right away. |
| Gun | A shotgun for this round: 2 shells, both live, one hit kills anyone. |
| 1, 2, 3 | Secretly shows you if your next / 2nd / 3rd round is live or blank. |
| Grenade, Nuclear, Block, Reverse | Not written yet. |

## Items
| Item | Effect |
|---|---|
| Health Potion | +1 life (one more red mark). |
| Bandage | Stops you or anyone else from bleeding out. |
| Teammate | Ask a player to team up. If they say yes you share a couch and one hand of cards, and vote on every card (a tie goes to a coin flip). Needs at least one other player left to fight. |
| Hammer | Smash your own gun: nobody can shoot you this round, but you can't shoot either. New gun next round. |
| Binoculars | See any player's cards. |

## Controls
Tap a card to pick it, then tap it again, press **Play card**, or drag it up
onto the table. Tap the box (or **Open box**) to open it. Items are in the
bottom-left corner.
