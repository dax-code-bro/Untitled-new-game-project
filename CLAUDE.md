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
