# Shootout

A standalone card-table shootout game. Plain HTML/CSS/JS with no build step and no
dependencies. Nothing here is shared with the other projects in this repo.

**Run it:** open `shootout/index.html` in a browser.

| File | What's in it |
|---|---|
| `index.html` | All screens: loading, main menu, mode select, table, settings, gunsmith, loadout |
| `loading.js` | Loading screen: the revolver fires and the bullet hits the target |
| `room.js` | The gray room, which gets more wrecked and bloody each round |
| `audio.js` | Generated music and sound effects; the music gets more intense each round |
| `cards.js` | Every card and what it does (effects still to be written) |
| `game.js` | Screen flow, dealing 10 cards, playing cards, rounds |

## How a round works
Everyone at the table plays one card. Then comes a **shootout**: every living
player, starting with you, shoots themself or someone else. Each player has a
6-chamber revolver loaded with a random mix of live rounds and blanks
(reloaded with a new mix when it runs dry). Live round = that player is dead.
Last one alive wins; if you're shot, you lose.

## Cards
| Card | Effect |
|---|---|
| Jack of Trades | 10% of hands get one. Play it and you win instantly. |
| Bloody Mary | 20% of hands get one. Forces a shootout right away. |
| Gun, Grenade, Nuclear, Block, Reverse, 1, 2, 3 | Not written yet. |
