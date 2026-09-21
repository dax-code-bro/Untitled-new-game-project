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
| `97i-handling.js` | the noises a weapon makes when nobody is shooting it |

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
| `rocket` | a warhead on a motor tube | up from below and in FRONT, back into the muzzle |

`tube` and `rocket` are new. Thirteen pump and lever shotguns in
multiplayer were going to reload like a broken double — a gun hinging
open that does not hinge — and four launchers were posting a pistol
magazine into a tube that has no magazine well, because with no path of
their own they fell through to `mag` and `magWell` came back as the
weapon's own origin.

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

## 97i-handling.js — the sound

A gunshot is a report. Everything else a weapon does is a small
mechanical noise, and multiplayer had none of them: seventy-five weapons
reloading, swapping and being inspected in silence, while zombies next
door had a tuned set nothing else could reach.

```js
game.handling('magIn');                       // one noise
game.cueSounds(LE.RELOAD_SOUNDS[kind], was, now);   // a whole reload
game.cueSounds(LE.INSPECT_SOUNDS, was, now);
```

`cueSounds` takes the two fractions the frame spans and plays every mark
that falls between them — exactly once, whatever the frame rate. A
per-stage flag cannot do that: it needs one flag per sound and it fires
twice if the clock ever runs backwards.

Fourteen of the twenty-five were zombies'; the numbers went across
unchanged and its `makeSfx` delegates to them rather than keeping a
second copy. Eleven are new, and they are the mechanisms that were being
animated in silence in **both** games: the hinge on a break gun, the
gate on a tube gun, the crane and ejector rod on a revolver, the forend
on a pump, a rocket going down a tube, and the two quiet ones an inspect
makes.

## The clock

Anything a match owns — a reload, a swap — runs on **match time**
(`M.time`), which clamps its tick at 0.05 s so one long frame cannot
teleport anybody. Anything the view owns runs on the frame's dt, clamped
the same way. Mixing them is a real bug and was one: the inspect counted
raw dt, so on a machine rendering at nine frames a second a 2.05 s
inspect finished in 1.0 s of match time while the swap beside it still
took its measured half second — two animations on the same weapon at
different speeds.

## The hand

Four things about a hand now live in the engine, so the two games cannot
tell them differently.

**`game.giveHands(arms, o, extra)`** — where a hand sits. It translates
both hands in the weapon's own frame as the gun is driven back into
them, turns each palm on its wrist, and breathes. `o.kick`, `o.fire`,
`o.aim`, `o.t`, and `o.reach`.

`o.reach` is the one worth explaining. Every arm actor is parented to
the weapon, so when the ram's thrust moves the weapon root 0.62 m the
arm goes with it — shoulder end included — and finishes in mid-air two
feet in front of the player. A thrust is the one motion where an arm has
to change length, so the sleeve and the forearm stretch along the
weapon's axis, anchored at the wrist, by exactly the distance travelled.
Pass the projection of the thrust onto the weapon's own +X, not the raw
distance: an arm can only absorb the part of the motion that runs down
it, and on a pistol at the hip that is a small fraction of a forward
lunge.

**`game.openHand(arms, which, amount)`** — a hand letting go. 0 is the
grip the hand was built in, which every contact and sight measurement is
taken at, so it must cost nothing; 1 is a hand open enough to receive a
magazine. Half the turn at the knuckle, a third at the middle joint, a
fifth at the tip.

**A finger is three actors.** `arms.rBones[f]` is the chain and
`arms.rFingers[f]` is still the proximal bone, so anything that turned a
finger about its knuckle keeps working and brings the other two with it.
The bend must be spread across the three: the tube ends are bare at the
joints, and 0.6 rad at one knuckle shows 1.9 mm of daylight where 0.2
rad at each of three shows 0.2 mm.

**The palm is its own mesh**, hung under the forearm with the wrist as
the joint, and everything that hangs off a hand hangs off the palm. This
is what makes the first two possible: while the palm shared a buffer
with the forearm there was no way to turn one without turning the other,
and the hand could only ever be slid about as a casting.

### What a test of a hand has to do

Four instruments went wrong here before they went right, and all four
failures have the same shape — measuring in a frame where something else
was moving, or with a denominator that had changed.

* **Measure in the right frame.** A finger bend is 2 mm; the arm
  carrying it to a magazine well travels 320 mm, and the gun's own bob
  moves everything again. Stop the matrix chain at the palm for a
  finger, at the weapon for a hand.
* **Watch out for a moving denominator.** grip.test.js samples vertices.
  Cutting a finger into three buffers re-phases the ring samples and
  adds interior cap centres, so every percentage in its table moves on
  geometry whose bounding box is identical to the micron. Re-derive the
  baselines and say so; do not carry them over.
* **Pick an invariant the fault cannot satisfy.** "The tip travels
  further than the middle joint" is not it — that ratio is fixed by the
  radii and can go either way. The angle between one bone and the next
  is: a hook swings, and its own shape is constant.
* **Two poses, not one.** Every hand check in the project measured the
  built pose, and the built pose was always correct. "The hand never
  moves" was outside all of them.
