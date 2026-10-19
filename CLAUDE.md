## my_cpp_game — native C++ port (renderer, baker, maps, the zombies round)

`my_cpp_game/` is the native C++/OpenGL 4.5+ build: the renderer, the
procedural material baker and the geometry library are ported and verified
(parity tests, `test_render_stages`), and the six game maps are exported
from the running web game with `tools/export_scene.js` and rendered on it.
`--play` on Bunker Nine or Coastline is a playable zombies round
(`src/game/`): collision from the exported web physics world, the web
game's zombies and viewmodels recorded by `tools/export_kit.js`
(`kit.lekit`), and the web game's round/player/weapon numbers; `test_play`
plays it with a bot. Doors, perks, the box, wall buys, power-ups, special
zombies, multiplayer and the campaign are web-only; the web build remains
the complete game. `my_cpp_game/README.md` is the index: build,
verification, layout, the web winding bug the port found, and the Windows
release (`tools/package_windows.sh` -> `release/legend-native-windows.zip`).
Native departures from the web renderer are marked `NATIVE` in the source.
Verify natively under `Xvfb :99` (Mesa llvmpipe, GL 4.5) with `--gl-debug`.

## The campaign (web)

`site/games/campaign.html` plays story missions on the multiplayer engine;
missions are data in `site/games/campaign-missions.js` and
`site/games/CAMPAIGN.md` is the authoring guide. `engine/test/campaign.test.js`
plays a mission through every step type.

Mission 1, "Burning Sky" (`site/games/missions/m1-burning-sky.js`, script in
`m1-script.md`), is written as a screenplay: `scene` and `play` steps are
generators over the stage (`campaign-stage.js`) with the story's cast
(`campaign-cast.js`) on the Colombia map (`campaign-maps.js`). The older data
missions are marked `demo`. `engine/test/burningsky.test.js` plays it from the
helicopter to Mission Passed (and walks the command post's stairs).

## Model sweep

`engine/test/modelsweep.test.js` checks every placed object on all six maps
for floating, crooked, wrongly see-through and clipping objects, and names
the source line that made each one. Its baseline is zero; keep it there.
Multiplayer map furniture and cover go through the placement guard in
`mp-maps.js` (`kit()` -> `clear()`), which slides a piece out of any wall or
furniture already placed.

## Gun length fidelity

The parametric (table) guns are stretched along the bore to their real
overall length by `SERVICE_REAL_LENGTH` in `engine/src/97b-service.js`
(receiver, magazine and grips rigid; derived mount points move with it).
A new table gun gets its real length added there if it builds more than 8%
off. `engine/test/fidelity.test.js` holds every listed gun within 2%, and
`distinct.test.js` must still pass (no pair under 0.30).

## Gun controls

The small parts a hand works -- levers, buttons, pins, slotted screws,
serrations and stamped markings -- are built with `engine/src/96a-controls.js`
(`ctlPlate`, `ctlButton`, `ctlPin`, `ctlScrew`, `ctlSerrate`, `ctlStamp`), at
real size and with a chamfered edge so they read against the flat they sit
on. The three guns you hold have them (M1911, Thompson, Scattergun). Parts
that move are their own geometry: the mag catch (`magCatch`, pressed in the
reload by bunker-nine's magazine block) and the Scattergun's `toplever`
(swung by the break-open code and `poseAction`). A new moving part must be in
the gun's `partNames` and in bunker-nine's `singleParts` list, or it stays
visible when the gun is hidden. After changing a held gun, re-record the kit
(`tools/export_kit.js`) so the PC build gets it.

## First-person arms

The arms you see holding a gun are the MakeHuman body's own forearm, hand
and sleeve (`engine/src/98f-body-arms.js`), not the lofted tubes of the
viewmodel rig (98). The rig still does all the work -- grip solve, trigger
finger, thumb, wrist give, reload -- and its actors are posed every frame
but no longer drawn (`noDraw`); the body hand is
closed onto the rig's solved finger joints and skinned to those actors
through a palette read off them (`_bodyArmPalette`). `opts.stickArms` (or
`engine.stickArms`) brings the old tubes back. A new rig part that moves a
hand must be one of the actors the palette reads (sleeve, forearm, palm,
thumb, finger bones).

Before the rig solves it, a firing hand on any grip whose kind puts the index
on a trigger is fitted to it (`_fitFiringHand`): the trigger guard straight
under the trigger first, the middle knuckle tucked under it (or under the
frame), the knuckle row at the grip's front corner -- or further back, up to
14 mm behind the strap, until the index knuckle is 26 mm behind the trigger
blade, or the finger overshoots it; `fitHand: false` keeps an authored anchor
(the Obliterator). The blade is found by `_triggerBlade`: the guard opening's
centre can fall either side of the blade, so it is the first metal behind the
centre if that is thin, else the first thin metal ahead of it. The rig places the knuckles; `_wrapHand`
then closes every finger joint by joint onto the weapon's own surface
(`weaponSurface`) and writes the joints back into the hand records, so the
game's finger turns use them. A finger on an upright grip (pistol grip,
vertical foregrip, magazine housing) wraps round it -- its tip may not end
more than 30 mm ahead of its knuckle, and it may start the closing already
folded round the strap; a finger that touches nothing curls (`curlLoose`).
It keeps the trigger finger's solved pose with its pad on the blade (grip.test
needs it reaching forward), moves the firing thumb round to the far side of
the grip (not on a `thumb` single action), lays the support thumb along a
forend or a two-handed pistol's frame, and on a two-handed pistol closes the
support hand over the firing hand's fingers. `_bodyArm` turns the palm about
the knuckle row until it meets the gun (`rec.palmFlex`), so the wrist lands
behind the grip and the forearm runs back. A support hand on a `fore`,
`woodFore` or `tube` grip is built from the forend's measured section
(`_constructForeGrip`), both the wide-handguard hold and the slim fist, and
the one that rests on the gun is kept; its fingers stop just under the
forend's top edge, and every support hand's joints 11 mm under the sight line
(a fingertip's skin runs 7 mm past its joint). A thumb the solve left floating
or sunk in the gun (a single action's) is closed onto it. A melee `haft` is
not wrapped.

The drawn arms' geometry is readable (`geometryOf`, from `mesh.__cpuGeometry`),
and the hand tests measure the hand that is drawn, skinned on the CPU through
the same palette: grip.test's burial ratchet, sweep.test's skin-round and
finger-contact checks (the latter by point-to-triangle distance), and
sightblock.test's height over the sight line.

`weaponSurface` (98a) skips the `noDraw` rig and hidden parts (a parked
reload magazine), counts ray parity per connected piece, and calls a point
inside an open shell (a wooden grip's panels) when the gun walls it in on
five of six sides -- not on a model that sets `solidShells = false` (the
riot shield, whose handle gaps are walled in).

Multiplayer support hands go on the forend `weaponForend` (98f) measures, no
more than 40 cm out and pulled back onto it past a bipod or gas tube
(`handsFor`); guns the rule cannot place have a hold in `HOLDS` (mp-game: the
P90, MP7, MP 40, Grease Gun, C96, riot shield). The riot shield holds each
of its two handle bars across in a fist, both games, with the forearms
brought in (`spread`, zombies `armSpread`). Aimed, a weapon with a stock
comes in until its butt is behind the eye, and its own rigid parts are
clipped just short of its rear sight (`aimShape`/`aimClip`/`clipNearTree`,
engine 97l-aim.js; the renderer's CLIP_NEAR variant) so the stock under the
cheek leaves the picture and the arms are never cut -- both games, and the
native build from the kit's `aimClip`. After changing any of this, re-record
the kit.
