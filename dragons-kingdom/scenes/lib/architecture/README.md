# Architecture kit (buildings, sets, interiors) - PROVISIONAL designs

Procedural buildings with real construction logic, for the Episode 1 sets of Verdor and Cling.
Everything is generated at `setup()` time from seeded parameters (deterministic, no assets to
download beyond the CC0 scans already in `assets-lib/`), merged into **one mesh per material per
set** (a whole square is ~20 draw calls), and shaded by procedural materials driven by
per-vertex construction data. Designs are provisional until Daxtyn approves them.

## What makes it read as built, not modelled

| element | construction logic |
|---|---|
| **masonry** (`masonry.js`) | laid course by course; course heights shared round a building so corners bond; dressed **quoins** alternate long/short at every corner; joints broken against the course below; every stone its own rounded, irregular block (pillowed face, chipped arrises, slight tilt, flush to ~25 mm proud of a recessed lime-mortar core, corners pulled in so the joints open and close like real rubble); rubble courses mix big stones, pairs and pinnings; a `washed` style for interiors (lime coats fill the joints nearly flush), a `pointed` style (squared stone pointed flush: lodges, cottages); under `lod: 'far'` the stones are flat blocks and the mortar core sits 3 cm back (no z-fighting at hundreds of metres) |
| **openings** | dressed jambs that return into the reveal, lintels with bearing, semicircular **voussoir arches** (keystone, full-depth soffit), projecting sills with a weathered fall; stones are cut/packed round sills, lintels and arch extrados; the mortar core has true reveals through the wall thickness |
| **timber framing** (`timber.js`) | sill/bressumer, corner and bay posts, studs, mid rails, head plate; straight tension braces that **interrupt** the studs they cross; window framing with its own posts and rails; every member hand-hewn (bow, kink, out-of-square, waney arris; adze scallops in the material); **oak pegs** where each tenon enters; jetty joist ends with end grain; corner brackets on stone corbels |
| **infill** | one lime-plaster surface behind the frame, recessed ~3 cm, shrinking back from the timbers (dark gap, baked occlusion) and bellying out a few mm mid-panel |
| **paving** (`cling.js`) | rounded field cobbles of mixed size (8-22 cm, low-poly domes) laid in wavering rows and bedded in the soil (earth joints), worn through to the earth in ragged patches, dished along a kennel that carries the fountain's overflow out under the gate, puddles in the hollows; lanes (`lane`) of setts with a dished gutter along any polyline |
| **roofs** (`roof.js`) | a boarded eaves soffit and fascia (no row of rafter-end teeth), a boarded deck, clay plain tiles double-lapped on a 100 mm gauge or stone slates in diminishing courses, each tile cambered and set +-3 deg off true (bigger tiles on back rows); ridge tiles bedded in mortar; bargeboards / stone coping and kneelers; the ridge dips 6-12 cm, the slopes hollow and undulate, the eaves droop |
| **chimneys** | squared stone stacks 1-1.4 m above the ridge, projecting cap, mortar flaunching round the flue, smoke-blackened top courses |
| **windows / doors** (`openings.js`) | oak frames set back in the reveal, mullions, **leaded diamond / square quarries** of uneven crown glass with a dim **room behind** (interior mapping: real parallax, no modelled room); ledged plank shutters on strap hinges folded flat, half open on a shutter dog, or closed; ledged oak doors with strap hinges, clench nails, ring handles, open onto a room or closed; worn thresholds |
| **houses** (`house.js`) | rubble ground storey (arched door, shop window) + 1-2 jettied framed storeys + front gable or eaves to the street; upper storeys **lean and twist** a little, roofs sag; variants: `allStone` (two stone storeys, stone gables with coping), a lime-washed ground storey (`stoneMat: 'stoneWashed'`), `passage` (a gate passage: through arches front and back, rubble passage walls, a joisted ceiling - the Cling stone arch), `beamKit` (the bressumer over the front built into its own kit: the 3C beam can fall) |
| **weathering** (materials) | (seeds are snapped per piece in the shader - see "Fixed in round 1") |
| **weathering, cont.** | per-stone colour, scan micro detail, bedding, iron stains, lichen rosettes, moss in sheltered joints and on ledges, **splash dirt / damp / green algae at the footing** (from each vertex's height above its footing), rain streaks; oak with growth rings, checks, silvered weather faces, dark undersides; plaster washes, repairs, hairline cracks, flaking to the daub, grime; tiles with lichen and moss in the laps; rusty iron |

## Fixed in round 1 (critic report) - worth knowing why

* **Triangle-shaped tone patches / fine cross-hatch** on every surface at 1:1: the per-piece seed
  `aInfo.x` is an interpolated varying, and the old `akH1` was `fract(sin(x) * 43758)`, whose
  ~1e5 gain turned the last-bit interpolation error into per-triangle noise. Seeds are now written
  at 1/8192 bucket centres (core.js `Acc.v`) and snapped in the fragment (`akI` replaces `vInfo`
  in every body); `akH1` is a low-gain fract hash. Planar projections take their axes from the
  piece (`akPlanarE`), never from the per-fragment normal.
* **Inside-out king's steps**: the old cheek walls had stone on one face only (seen from inside: a
  black lattice) and the terrace floated. The flight is now solid (fill under the steps), between
  stepped cheek walls with stone on every face (`masonryBox` sections), the terrace held by
  retaining walls with a parapet.
* `masonryFace(..., { clipTop: (x) => y })` lays courses only under a line (a stair's soffit).

## Changed in round 2 (critic report 2) - worth knowing why

* **Masonry veneer look**: stones are now SET IN the mortar - each face flat to 0-12 mm proud
  (per style: `STYLE` in masonry.js), the rounded arrises dive below the mortar plane so the
  outlines are irregular and there is no rim highlight or drop shadow; per-stone arris radius.
  The 'stacked paper' slivers on stone sides were noise/chip displacement folding the rounding rows:
  `block()` now clamps every displacement near an arris to half the rounding radius (`fold: false`
  turns it off). Lime mortar uses a scanned sand grain (acg_ground05) with sparse grit and lime bloom.
* **Weathering decals** (`weathering.js`): `stain(kit, F, x, y, w, len, 'dirt'|'rust'|'lime'|'algae',
  { strength, z, seed })` - a transparent streak a few mm in front of a face (the kind is encoded in
  the seed's quarter); `grimeBand(kit, F, x0, x1, y, len, rnd, { kind, strength, z })` - overlapping
  stains under an overhang or along a wall foot. `masonryFace(..., { stains: true })` drops sill drips.
* **Openings**: `op.blocked` (a blocked-up opening: recessed rubble fill with its own mortar face),
  `op.niche` (a lamp niche with a back), `op.splay / sillSplay / headSplay` (an inward-splayed reveal,
  `op.back` the narrow rectangle at the outer face), `o.portals` (a dark room quad behind each window
  so far buildings are not see-through), `o.aoMul` (scale baked occlusion: passages, soffits).
* **Glass**: quarries tilted ~1 deg (no sky/ground checker from the interior mapping), per-quarry tint,
  grime at the leads; glazing type 4 = oiled linen on a lath lattice; houses are glazed by wealth
  (`house(..., { rich })`), the rest have shutters or cloth.
* **Roofs**: the gable principals sit 7 cm under the rafter line (they poked through as a grey verge
  strip), bargeboard + mortar bead at the verge, sag carried by the gable walls, per-roof tile batch,
  lead flashings round stacks, soot, clay pots (`chimney(..., { pot })`).
* **Timber**: structural members proud of studs and braces, studs tenon 3.5 cm into the rails (no
  gaps), varied sections and bows, flush faceted pegs (`oakPeg`), jetty bressumer sag, end checks.
* **Set dressing** (`dressing.js`): `barrel`, `crate`, `sack`, `coil`, `handcart`.
* **Canon**: stone support = broad pier 2.6 x 1.5 x 3.4 m on a two-step plinth (`CLING.support` moved
  to x 13.3 to clear the steps' cheek wall); town gate 4.4 m clear between 4.6 m squared piers, a beam
  with a tiled roof, braced leaves on pintles, rutted threshold, stop stone (`CLING.gate`); access rig
  without jib or mast - a drawbridge gangway (6 m) on two chains over sheaves to a deck windlass;
  harbour handrail removed (mooring rings); birthing chamber door framed, nest = plank bedding frame
  (no altar plinth); treatment room: Abby's arm chair with the padded LEFT arm rest, Remi's seat,
  Alexandria's stool, coast visible through a splayed window.
* **Interiors**: `NEST` / `nestBedY(x, z)` (the bedding frame and the straw bed's height, shared with
  the bpy bake `offline/nest_cloth.py` v2 - `bed: 2` in the cache), `strawClumps(acc, F, rnd, n, place,
  yAt, o)` (stalks 4-34 cm, 1.2-2.6 mm, three tone families), `armChair`.

## Files

| file | contents |
|---|---|
| `core.js` | seeded random / noise, frames, `Acc`/`Kit` accumulators (one mesh per material, deform whole buildings, merge sub-kits), primitives: `block` (rounded irregular box with noise, pillow, chips, adze, wane, warp, baked occlusion, grain axis), `grid`, `shapeFace`, `tube`, `strip`, `lathe` |
| `materials.js` | `archMaterials(ctx)` -> `{ stonePale, stoneGrey, stoneDressed, stoneWashed, stoneWet, stoneSoot, stoneFar, stoneFloor, stoneQuay, stoneSett, mortar, mortarPale, mortarWashed, oak, oakDark, oakPeg, oakSilver, bark, plaster, plasterInt, clay, slate, iron, lead, glass, portal, straw, strawBed, linen, leather, sacking, clayware, rope, soot, water, pool, puddle, sea, foam, jet, stain, mud, wetMud, earth, flame }` |
| `weathering.js` | `stain`, `grimeBand` (decals: dirt, rust, lime, algae) |
| `dressing.js` | `barrel`, `crate`, `sack`, `coil`, `handcart` |
| `masonry.js` | `courses`, `masonryFace`, `masonryBox`, `archRing`, `masonryGable`, `roundTower`, `conicalRoof`, `steps`, `LOD` |
| `timber.js` | `member`, `pegs`, `framedWall`, `jetty`, `gableFrame`, `infill` |
| `roof.js` | `gableRoof` (clay / slate, sag, damage), `chimney`, `pentice` |
| `openings.js` | `windowUnit`, `door`, `leafFrame`, `glassQuad`, `threshold` |
| `house.js` | `house` (the Cling townhouse) |
| `cling.js` | `CLING` (fixed layout), `clingSquare` (houses round the square + second rows behind every gap, the gate-passage arch with `set.beam` (the 3C beam's own mesh + its end points), a lane on through the arch, the bent alley with houses closing its vistas, houses along the broad road beyond the gate), `archway` (freestanding variant), `gateway` (silvered oak leaves with ledges, braces, straps, nails, latch, a droop; weathered pier caps; coped walls), `fountain` (octagonal conduit: slabs between corner posts, mitred coping with leaded iron cramps, solid step, octagonal pillar with a spout drum, four heads, lead pipes, falling jets, rippled pool), `stonePier`, `kingsSteps` (solid), `lane`, `alley`, `paving`, `wallFootPlacer` (weeds in corners and by doors, ~a quarter of the wall foot), `houseFootSegments` |
| `verdor.js` | `stable` (a dragon stable for Leaf-sized dragons: the 5.6 x 6.6 m door admits a subadult Nightwing; Charcoal is mounted outside from the rig), `keeperHouse`, `accessRig` (15th-century carpentry: silvered oak, scarfed posts with iron bands on sunk stone pads, girts, knee braces, pegs, lashings, boarded stairs with closed risers, newels and handrails, railed deck, a drawbridge gangway (6 m) hung on two chains over sheaves to a windlass on the deck (round 2: no jib, no mast), leather bolster; deck 10.6 m so the gangway lands at Charcoal's lying seat height ~9.5-9.9 m - measured by `scenes/lookdev/architecture-probe.js`), `leafPlatform` (spoked iron-tyred wheels, chocks, padded leather roll on the side that meets Leaf (+x), stair with handrails on BOTH sides: Abby's free right hand finds a rail facing out or facing in; returns `{ deck, stairFoot, leafSide }`), `palace` (round 2: sunk into its rise; a keep with window rows and a stair turret, a hall with tall windows and chimneys, a chapel with a bellcote, lean-to ranges, two battered round towers with string courses and bell-cast conical roofs, two square saddleback towers, crenellated curtain, gatehouse; dark rooms behind every window), `harbor` (quay with tide zones, a solid landing stair built against the face into the water - no handrail, mooring rings beside it -, stone bollards, oak fender piles, iron rings, waterline foam, goods on the quay (`o.dressing`), warehouses, a town behind (`o.town`), built ground (`o.hinterland`), its own rippled sea surface) |
| `interiors.js` | `birthingChamber` (washed rubble, 5.6 m to a joisted ceiling, the door framed in its reveal, lamp niches with soot fans and an oil stain, a bracket lamp, warm 1900-2200 K lamps, irregular worn flags, the nest: a plank bedding frame with corner posts and pegs round a domed straw bed (1500 clumps inside, spill outside), the cloth-simulated linen baked on that bed), `treatmentRoom` (plaster over rubble, losses with a plaster-coloured broken edge, irregular flags with a worn line from the door, shutters on strap hinges and pintles, the cloth-simulated table cloth, an inward-splayed window with stone sill slabs (the coast and the harbour below), Abby's arm chair with the padded arm rest at her LEFT - `anchors.seat`, `anchors.armSupport` -, Remi's seat and Alexandria's stool) (+ `flagFloor`, `beamCeiling`, `nest`, `oilLamp`, `bowl`, `jug`, `foldedCloths`, `bench`, `stool`) |
| `offline/*.py` | one-time Blender (bpy 4.2) cloth bakes into `cache/` (git-ignored): `nest_cloth.py` (the nest linen), `table_cloth.py` (the treatment-room table cloth) |
| `offline/planlabels.mjs` | `node offline/planlabels.mjs <render.log> <plan.png> <out.jpg>`: labels the Cling plan view from the marker positions the plan shot logs |

## Use

```js
import { Kit, frame, yawFrame } from '../lib/architecture/core.js';
import { archMaterials } from '../lib/architecture/materials.js';
import { stable, accessRig } from '../lib/architecture/verdor.js';
import { clingSquare, CLING } from '../lib/architecture/cling.js';

// in setup(ctx):
const M = await archMaterials(ctx);
const kit = new Kit(0);                                   // y of the footing (for splash / damp)
stable(kit, yawFrame([0, 0, -34], 0.9), { lod: 'mid' });
const rig = accessRig(kit, yawFrame([18, 0, -15], 0.25), { H: 7.2, gangwayDrop: 2 });
scene.add(kit.build(M, { name: 'verdor' }));              // one mesh per material

const set = await clingSquare(ctx, { focus: [[x, z]], heroR: 9, far: 40 });   // LOD by distance to focus points
scene.add(set.group);                                     // set.houses: frames, doors, windows, roofs
```

Interiors return their lamp lights: `const ch = birthingChamber(kit, frame([0,0,0])); ch.lights.forEach(l => scene.add(l));`
Image-based light is **not occluded by walls**: inside a room set `scene.environmentIntensity`
to ~0.05-0.1 and let the sun (shadowed) and the sky seen through the openings light it (see
`scenes/lookdev/architecture-interiors.js`).

**Origins**: `kit.build()` places its meshes at the set's centre (x/z snapped to 64 m; or pass
`{ origin: [x, 0, z] }`) and the materials run their procedural noise in object space, so a set
built hundreds of metres from the world origin keeps fine, stable detail. Build each distant set
(another room, the harbour, the palace) in its own `Kit`.

**Far sets on a long lens**: set the camera's near plane far out for the shot (the palace shot
uses 25 m), else the stones and the recessed mortar behind them z-fight.

**LOD**: `'hero'` (close-ups: more rounding/segments), `'mid'` (default), `'low'` (flat blocks,
party walls, backs), `'far'` (silhouettes: big flat blocks, hairline joints, `stoneFar`).
**Damage** (3C): `clingSquare(ctx, { damage: (x, y, z) => bool })` removes the roof tiles at
those world points (deterministic, rebuild in setup per state); the tiles keep their own seed.

**Cling layout** (`CLING`): follows `shotlist.json conventions.cling_map` as staged in style
frame F5 - from the king's steps (south edge, looking north): stone arch LEFT (west,
x -19.6 z 16.5), gate to the broad road RIGHT (east, x 20.4 z 4.75), vendor stall left-centre
(-8.5, 3) with the alley behind it in the north row (x -8.6), music space right-centre (7, 1.5),
fountain with its central pillar in the middle (0, -2), the separate stone support beside the
steps (13.3, 19.4; a 2.6 m broad pier). The gate is 4.4 m clear (`CLING.gate`). Sun behind the steps (south).

## Look-dev scenes

* `scenes/lookdev/architecture-cling.js` - row 3/4 at eye level, the arch, the square from the steps, the gate, a close detail, the steps, the fountain, the alley, and a plan view from above (north up) with coloured markers on the fixed escape geography - the shot logs `[arch-cling-plan] {name: [u, v]}` for labelling (one shot per second).
* `scenes/lookdev/architecture-verdor.js` - stable + access rig with Remi for scale, the rig, the keepers' lodge + Leaf's platform, the palace far off, the harbour steps.
* `scenes/lookdev/architecture-interiors.js` - birthing chamber (room, nest, door), treatment room (seats, window with the coast, door).
* `scenes/lookdev/architecture-contact.js` - every model 3/4 under the same daylight, one per second (turntable at 24 fps).
* `scenes/lookdev/architecture-dev.js` - quick single-piece checks; close-ups at the pixel footprint of a 4K frame; `archMaterials(ctx, { debug: n })` (1 constant albedo, 2 no bump, 3 both, 4 albedo unlit, >= 10 oak terms).
* `scenes/lookdev/architecture-probe.js` - measures Charcoal's seat height (rig deck check).

## Costs and limits

See `PROGRESS.md` for the measured triangle counts and render times and the open issues.
