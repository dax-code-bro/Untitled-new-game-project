# Set-building library (scenes/lib/sets) and the Episode 1 style frames

The style frames F1-F5 (`scenes/lookdev/style-f*.js`, `scenes/lookdev/finish.js`) and the small
library they share. **All designs are PROVISIONAL** until Daxtyn approves them.

Since round 3 (2026-10-08) the frames are built from the other domains' models wherever one
exists; this library only fills the gaps (terrain, grass, the trading ship, festival stalls and
food, straps, posing helpers for the cast):

| frame | creatures (`lib/creatures`) | people (`lib/humans` cast builds) | buildings (`lib/architecture`) | this library |
|---|---|---|---|---|
| F1 prologue | a shape in the mist (shadow only) | 3 crew: `crowd06`, `sailor1`, `crowd16` (tiny at 120 m) | - | `ship.js` knarr, `terrain.js`, `fx.js` |
| F2 riding grounds | Charcoal (hero), Leaf (hero), saddles | `remi`, `abby`, `keeper1` | `stable`, `keeperHouse`, `accessRig` | `terrain.js`, `grass.js`, `scatter.js`, `cast.js` IK, `props.js` straps |
| F3 flight | Charcoal, Leaf (hero) | `remi_ride`, `abby_ride` (riders) | - | `terrain.js`, `kitbash.js` rocks |
| F4 birthing chamber | gold hatchling (hero) | `alexandria` (arms by IK, hands by `relaxHand`) | `birthingChamber` + baked nest linen | the egg shell, folded linen, lamp |
| F5 Cling square | Starlight (hero) + `fall_ride` | `watchman`, `musician`, `musician2`, `vendor`, `parent`, `child`, crowd01-18 | `clingSquare` (CLING map) | `props.js` stalls + food, `town.js` bunting/banners, `scatter.js` hedges |

## Files

| file | what it gives you |
|---|---|
| `materials.js` | world-projected photo-texture materials (`worldMaterial`), 4-layer splat `terrainMaterial` |
| `terrain.js` | `heightfield` (graded grids), `gradedAxis`, seeded `makeNoise`, `smooth` |
| `grass.js` | geometry grass tufts with backlit translucency (`grassField`) |
| `scatter.js` | bushes, rocks, instanced scattering |
| `kitbash.js` | photo-scanned cliff/rock pieces (CC BY 4.0, credited in `assets-lib/CREDITS.md`) |
| `ship.js` | `knarr()`: a one-masted trading ship (clinker hull, square wool sail with tension creases from the clews, robands, leech shake, seams; rigging; side rudder) |
| `town.js` | `townKit` (older timber houses, stalls, fountain), `bunting`, `banner`, `clothMaterial`, `clothSheet` |
| `buildings.js` | older stone kit (walls, halls, towers, field walls) |
| `people.js` | older placeholder people (MakeHuman mannequins) - no longer used by the style frames |
| `fx.js` | `silhouetteCard` (the shape in the prologue mist) |
| `cast.js` | posing the humans library's cast builds in a frame: `limbIK(ch, 'arm'|'leg', 'L'|'R', target, pole)` (two-bone IK from the current pose), `lookAtPoint`, `rotateBone`, `relaxHand(ch, side, { fingers, palm, curl, spread })` (opens a clasped/gripping build hand, points it and turns the palm), `bonePos` |
| `props.js` | `strapRibbon` (flat leather strap along a curve), `foodMaterials` + `goods(kind)` (scored loaves, rolls, apples, onions, cabbages and turnips, cheeses, fish in wicker baskets / on boards), `marketStall` (oak trestle stall from the architecture kit's `block` + dressing, cloth awning, goods) |

Always call `ch.update(t)` (idle: resets to the drape pose) BEFORE `limbIK` / `relaxHand` /
`lookAtPoint` every frame, so a frame stays a pure function of t.

## Look-dev

* `scenes/lookdev/style-contact.js` - contact sheet of this library's models under a neutral
  photographed daylight sky: the ship (3/4 and broadside), a market stall, the food, vegetation and
  rocks, a strap (one shot per second; `--fps 1 --seconds 6` renders all).
* The five style frames are the in-context hero angles. F2-F4 have look-dev views frozen at the
  frame's moment, rendered in one job with `--preset draft --fps 1 --start 100 --seconds N`
  (F2: 100 frame, 101 Leaf+Abby, 102 Remi on the gangway, 103 rig, 104 Charcoal's side, 105 his
  head, 106-108 folded-wing drapes; F3: 100 frame, 101-104 other wingbeat phases; F4: 100 frame,
  101 overview, 102-104 other cameras, 105 close on the hands). Below `--preset final` they build
  the dragons at 'standard' quality (faster), at final at 'hero'.

## Renders

`bash episodes/s01e01/style-frames/make.sh` (all) or `make.sh F2 F5` (some): native 4K PNGs and
logs to `output/lookdev/style-frames/`, PROVISIONAL slates, 1920-wide previews into
`episodes/s01e01/style-frames/`. Measured times are in `PROGRESS.md`.
