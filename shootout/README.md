# Shootout

A standalone 3D card-table shootout game. Plain HTML/CSS/JS with no build step; the only
library is three.js, vendored in `vendor/`. Nothing here is shared with the other projects in this repo.

**Run it:** open `shootout/index.html` in a browser (needs WebGL).

| File | What's in it |
|---|---|
| `index.html` | All screens: loading, main menu, mode select, table, settings, gunsmith, loadout, scoreboard |
| `engine.js` | 3D renderer, animation clock and tweens (three.js) |
| `models.js` | Every 3D model: revolver, outlaws, cards, table, chairs, shelves, desks, door, lamp, target |
| `fx.js` | Muzzle flash, gun smoke, sparks, splinters, blood |
| `stages.js` | 3D loading screen (bullet-time shot), the menu background and the Loadout/Gunsmith turntable |
| `table.js` | The 3D card table: dealing, playing, peeking, aiming, firing, deaths, the room falling apart |
| `audio.js` | Generated music and sound effects; the music gets more intense each round |
| `net.js` | Online play: player IDs, the lobby, invites, parties and the host/guest game messages |
| `characters.js` | The 10 playable characters: their looks and bot personalities |
| `skins.js` | Gunsmith skins for the revolver and shotgun, and what unlocks each |
| `profile.js` | Your stats, unlocked skins and loadout, kept on this phone |
| `scores.js` | The shared scoreboard (claude.ai database) |
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
| Grenade | 8% of hands. Everyone else is hit (starts bleeding, or loses a life if already bleeding) and loses all their cards and items. The thrower keeps theirs but is caught in the blast too. |
| Nuclear | 3% of hands. A nuclear bomb comes through the ceiling: everyone else is wiped out and you (and your teammate) win. |
| Block | A steel shield stops the next hit you'd take this round (bullet, shotgun or grenade). |
| Reverse | The next live shot someone fires at you this round turns around and hits them. |

## Items
| Item | Effect |
|---|---|
| Health Potion | +1 life (one more red mark). |
| Bandage | Stops you or anyone else from bleeding out. |
| Teammate | Ask a player to team up. If they say yes you share a couch and one hand of cards, and vote on every card (a tie goes to a coin flip). Needs at least one other player left to fight. |
| Hammer | Smash your own gun: nobody can shoot you this round, but you can't shoot either. New gun next round. |
| Binoculars | See any player's cards. |

## Who plays
On **Play**, pick a table size (the green circles), then who's playing:

- **Me vs bots**: every other seat is a bot.
- **Same phone**: 2–4 people share one phone. A "pass the phone" screen hides
  the table before each person's turn so nobody sees the others' cards.
- **Friends**: online play. Everyone's player ID is in the top-right corner.
  Type a friend's ID and press **Invite**; when they accept they join your
  party. The host picks a table and the game starts on everyone's phone;
  empty seats get bots. If someone leaves mid-game a bot takes their seat.

Online play uses the claude.ai room, so it works when the game is opened from
its claude.ai link, and each friend has to be invited to that link from its
Share menu (they need to be signed in to claude.ai).

## Characters (Loadout)
Ten characters, each with their own 3D model: The Drifter, Sheriff Wade Holt,
Preacher Ezekiel Cain, El Coyote, "Lucky" Jack Marlowe, Silas "Grim" Vane,
Doc Ambrose Fell, Lillian Black the Widow, Rattlesnake Rose and Mortimer Grave.
Nobody at a table can be the same character: in a party, characters other
people picked show a red ✕. Same-phone players each pick one too, and bots play
the characters left over.

## Gunsmith
Skins change how your guns look, never how they shoot. Each unlocks with a goal:

| Revolver | To unlock | Shotgun | To unlock |
|---|---|---|---|
| Makeshift Six-Shooter | Play 3 games | Gold | 5 shotgun kills |
| Silver | Win 3 games | Blue Light | Stop 10 hits with a Block shield |
| Billy the Kid | 10 revolver kills | Hellfire | Throw 10 grenades |
| Gold | Win 15 games | Dark Knight | Win 3 games in a row |
| The Murderer's Device | 40 kills | Diamond | 25 shotgun kills |
| Angel | Heal 15 times | | |
| Hellfire | Win 5 Bloody Mary games | | |
| Dark Knight | Win 5 games in a row | | |
| Diamond | Win 50 games | | |

## Scoreboard
Everyone who has played: wins, losses, W/L, win % and the card they've been
dealt most. Your record lives on your phone and is posted to the board after
each game. Posting needs write access to the artifact (Contributor or Editor in
the Share menu); people who can only view still show up whenever someone who
can write is online with them. Same-phone games don't count.

## Controls
Tap a card to pick it, then tap it again, press **Play card**, or drag it up
onto the table. Tap the box (or **Open box**) to open it. Items are in the
bottom-left corner.
