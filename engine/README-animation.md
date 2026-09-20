# The four shared animation modules

Everything in here was written inside `site/games/bunker-nine.js`, and
that is the whole reason multiplayer did not have it. Seventy-five
weapons fired with a dead receiver, reloaded by telepathy, swapped
between one frame and the next, and could not be looked at — not because
the parts were missing but because the code that drives them was three
hundred lines inside another game's file where nothing could reach it.

Each module is game-agnostic: none of them knows what a player is, what
a match is, or which of the two games is asking. They are handed a
weapon actor and a fraction, and they hand back where things go.

| module | what it owns |
|---|---|
| `97e-action.js` | the mechanism — bolt, slide, cylinder, hammer, cover, belt, forend, lever, hinged barrels |
| `97f-reload.js` | the load in the support hand — magazine, clip, cell, belt, pair of shells, loose rounds, tube shells |
| `97g-inspect.js` | the inspect, as a curve |
| `97h-spent.js` | what the gun throws away — brass out of the port, the magazine out of the well |

## 97f-reload.js — the reload

Seven kinds, and the kind decides the whole path:

| kind | what travels | where it goes |
|---|---|---|
| `mag` | a box magazine | up the well nose-first, tipped and straightening |
| `clip` | a stripper clip | into the guide on top, **pressed down**, then flicked clear |
| `cell` | a battery cell | into the housing the weapon says it lives in |
| `belt` | twelve links | across the gun into the feed tray, laid flat |
| `break` | two shells together | into the chamber mouths, and they **stay** |
| `revolver` | loose rounds, one at a time | round the cylinder face, and they **stay** |
| `tube` | shells, one at a time | up the loading gate, and they **vanish into the tube** |

`tube` is the one that is new. Thirteen pump and lever shotguns in
multiplayer were going to reload like a broken double — a gun hinging
open that does not hinge.

```js
const reach = LE.reloadReach(u, kind);         // where the empty hand goes
if (reach.t >= 0) {
  const prop = game.reloadProp(cache, id, gun, kind, { ammo, clip, mag });
  const at = game.poseReload({ prop, kind, t: reach.t, root: gun,
    camera: game.camera, bore, magWell, breechAt, crane, cellRest,
    clipRest, sightAt, mag, fitted });
  // at.x/y/z is the load; at.hold is where the fingers close on it.
}
```

The hand is placed **from** the load, never beside it. Two paths that
merely run near each other is what makes a magazine travel alongside a
hand rather than in it, and that fault has been fixed twice.

`reloadOnscreen` is the last word on where a fetch comes from. Every
per-kind path has its say first; this only swings the reach up — keeping
its length — if the start of it would project below the bottom of the
frame. A constant cannot do this job: each viewmodel sits at its own
depth, so the same local y lands somewhere different on the glass for
every weapon.

## 97g-inspect.js — the inspect

A curve, not a clip, because a viewmodel is one actor held at an offset
from the eye. Five beats over `INSPECT_TIME`:

```
0.00-0.18  up and in, out of the carry toward the face
0.18-0.42  rolled to show the ejection side, action cracked open
0.42-0.58  held; the action closes
0.58-0.80  rolled the other way, tipped down, magazine looked at, tapped
0.80-1.00  back to the carry
```

`inspectPose(u, w)` returns `{in, up, side, yaw, pitch, roll, bolt, tap}`.
`w` is the whole of the cancel: setting the clock to zero teleports the
weapon back between two frames — 1.18 radians in a sixtieth of a second
on the roll channel — so the caller runs `w` from 1 to 0 over
`INSPECT_CANCEL` while the clock keeps going underneath.

`engine/test/inspect.test.js` measures all of it without a browser.

## 97h-spent.js — brass and magazines

```js
game.ejectCase(gun, { drop, gold, keep: list, cap: 20 });
game.dropMagazine(gun, { ammo, fitted, keep: list, cap: 20 });
```

A revolver has no port, which is the point of it: `drop` takes the cases
off the ejector rod at the magazine well instead, falling at your feet
rather than flying. Which weapons throw when is `WEAPON_ACTIONS[k].eject`
— `shot`, `cycle`, `reload`, `open` or `never` — and a hand-worked gun
throwing on the shot instead of the stroke is nineteen weapons behaving
like self-loaders.

The litter list belongs to the caller. A game with a corpse budget and a
game with a round timer want different caps.
