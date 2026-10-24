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
| `guns.js` | Every Loadout gun model (revolvers, automatics and the Gun-card guns) |
| `skins.js` | Gunsmith skins for the revolver and shotgun, and what unlocks each |
| `profile.js` | Your stats, unlocked skins and Loadout guns, kept on this phone |
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
Every card has a rarity. Most cards fill each of your 3 hand slots by chance;
the rarest are rolled once per hand instead.

| Card | Rarity | Odds | Effect |
|---|---|---|---|
| 1 | Common | 28% per card dealt (about 57% of hands) | Secretly shows you if your next round is live or blank. |
| Lucky | Uncommon | 17% per card (about 38% of hands) | Your chance of being dealt a Nuclear jumps to 20%; each Lucky you play stacks another 20% (40%, then the 60% cap). Resets when a Nuclear comes. |
| Block | Uncommon | 16% per card (about 36% of hands) | A steel shield stops the next hit you'd take this round (bullet, big gun, grenade or dynamite). |
| Reverse | Uncommon | 13% per card (about 30% of hands) | The next live shot someone fires at you this round turns around and hits them. |
| Pickpocket | Uncommon | 10% per card (about 24% of hands) | Steal a random card from another player's hand; only you see what you got. |
| Bloody Mary | Uncommon | 20% of hands | Forces a shootout right away. |
| Swap | Rare | 7% per card (about 17% of hands) | Play it on someone and you swap everything: seats, cards, guns, lives, items, wounds, teammates, even dynamite. |
| Gun | Rare | 5% per card (about 13% of hands) | Your big gun for this round: 2 shots, both live, one hit kills anyone. |
| Dynamite | Rare | 4% per card (about 10% of hands) | Slide a lit bundle to another player. It blows at the end of next round and kills whoever sits there, unless a Block shield stops it. |
| Grenade | Epic | 8% of hands | Everyone else is hit (starts bleeding, or loses a life if already bleeding) and loses all their cards and items. The thrower keeps theirs but is caught in the blast too. |
| Nuclear | Legendary | 3% of hands (more with Lucky) | A nuclear bomb comes through the ceiling: everyone else is wiped out and you (and your teammate) win. |

## Items
| Item | Effect |
|---|---|
| Health Potion | +1 life (one more red mark). |
| Bandage | Stops you or anyone else from bleeding out. |
| Teammate | Ask a player to team up. If they say yes you share a couch and one hand of cards, and vote on every card (a tie goes to a coin flip). Needs at least one other player left to fight. |
| Hammer | Smash your own gun: nobody can shoot you this round, but you can't shoot either. New gun next round. |
| Binoculars | See any player's cards. |

## Who plays
On **Play**, pick a table size (the green circles), then who's playing.
**Free-for-all** (the gold circle) seats anywhere from 3 to 10 at one table:
set the number with the + and − under the circles. Empty seats get bots,
everyone sits down both long sides of the table, and with 10 seats all ten
characters are in play.

- **Me vs bots**: every other seat is a bot.
- **Same phone**: 2–4 people share one phone (up to 10 in a free-for-all). A "pass the phone" screen hides
  the table before each person's turn so nobody sees the others' cards.
- **Friends**: online play. Everyone's player ID is in the top-right corner.
  Type a friend's ID and press **Invite**; when they accept they join your
  party. The host picks a table and the game starts on everyone's phone;
  empty seats get bots. If someone leaves mid-game a bot takes their seat.

Online play uses the claude.ai room, so it works when the game is opened from
its claude.ai link, and each friend has to be invited to that link from its
Share menu (they need to be signed in to claude.ai).

## Characters
Ten characters, each with their own 3D model: The Drifter, Sheriff Wade Holt,
Preacher Ezekiel Cain, El Coyote, "Lucky" Jack Marlowe, Silas "Grim" Vane,
Doc Ambrose Fell, Lillian Black the Widow, Rattlesnake Rose and Mortimer Grave.
You pick one as each match loads. Nobody at a table can be the same character:
online everyone picks at once and a character someone grabs gets a red ✕ on the
other screens. Same-phone players pick one after another; bots play the
characters left over. If you don't pick within 30 seconds, one is picked for you.

## Loadout
Pick the guns you carry. Looks only: every gun in a slot works the same.

- **Revolver** (your gun every shootout): Colt Single Action Army, 1851 Navy
  Revolver, Schofield Revolver, M1911, Mauser C96, Semi-Automatic Pistol (Luger style).
  With an automatic, a 1/2/3 card drops the magazine to show the round.
- **Gun card** (2 live shots, one hit kills): Double-Barrel Coach Gun, Colt
  Python, S&W Model 500, .50 BMG Rifle, Blunderbuss.

Gunsmith skins work on every gun in their slot.

## Gunsmith
Skins change how your guns look, never how they shoot. Each unlocks with a goal:

| Revolver slot | To unlock | Gun-card slot | To unlock |
|---|---|---|---|
| Makeshift Six-Shooter | Play 3 games | Gold | 5 big-gun kills |
| Silver | Win 3 games | Blue Light | Stop 10 hits with a Block shield |
| Billy the Kid | 10 revolver kills | Hellfire | Throw 10 grenades |
| Gold | Win 15 games | Dark Knight | Win 3 games in a row |
| The Murderer's Device | 40 kills | Diamond | 25 big-gun kills |
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
