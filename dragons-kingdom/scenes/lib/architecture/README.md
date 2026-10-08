# Architecture kit (buildings, sets, interiors) - PROVISIONAL designs

Procedural buildings with real construction logic, for the Episode 1 sets of Verdor and Cling.
Everything is generated at `setup()` time from seeded parameters (deterministic, no assets to
download beyond the CC0 scans already in `assets-lib/`), merged into **one mesh per material per
set** (a whole square is ~20 draw calls), and shaded by procedural materials driven by
per-vertex construction data. Designs are provisional until Daxtyn approves them.

## What makes it read as built, not modelled

| element | construction logic |
|---|---|
| **masonry** (`masonry.js`) | laid course by course; course heights shared round a building so corners bond; dressed **quoins** alternate long/short at every corner; joints broken against the course below; every stone its own rounded, irregular block (pillowed face, chipped arrises, slight tilt, flush to ~25 mm proud of a recessed lime-mortar core, corners pulled in so the joints open and close like real rubble); rubble courses mix big stones, pairs and pinnings; a `washed` style for interiors (lime coats fill the joints nearly flush) |
| **openings** | dressed jambs that return into the reveal, lintels with bearing, semicircular **voussoir arches** (keystone, full-depth soffit), projecting sills with a weathered fall; stones are cut/packed round sills, lintels and arch extrados; the mortar core has true reveals through the wall thickness |
| **timber framing** (`timber.js`) | sill/bressumer, corner and bay posts, studs, mid rails, head plate; straight tension braces that **interrupt** the studs they cross; window framing with its own posts and rails; every member hand-hewn (bow, kink, out-of-square, waney arris; adze scallops in the material); **oak pegs** where each tenon enters; jetty joist ends with end grain; corner brackets on stone corbels |
| **infill** | one lime-plaster surface behind the frame, recessed ~3 cm, shrinking back from the timbers (dark gap, baked occlusion) and bellying out a few mm mid-panel |
| **paving** (`cling.js`) | the square is laid with setts in rows (each a flat-topped block, tilted, proud or sunk a little), the joints and worn patches showing the earth below; clear of the fountain, the steps and the wall feet (weeds grow there) |
| **roofs** (`roof.js`) | rafter tails under the eaves, a boarded deck, clay plain tiles double-lapped on a 100 mm gauge or stone slates in diminishing courses, each tile a slightly cambered, slightly turned piece; ridge tiles bedded in mortar; bargeboards / stone coping and kneelers; the ridge sags, slopes hollow, eaves droop |
| **chimneys** | squared stone stacks through the roof, projecting cap, smoke-blackened top courses |
| **windows / doors** (`openings.js`) | oak frames set back in the reveal, mullions, **leaded diamond / square quarries** of uneven crown glass with a dim **room behind** (interior mapping: real parallax, no modelled room); ledged plank shutters on strap hinges folded flat, half open on a shutter dog, or closed; ledged oak doors with strap hinges, clench nails, ring handles, open onto a room or closed; worn thresholds |
| **houses** (`house.js`) | rubble ground storey (arched door, shop window) + 1-2 jettied framed storeys + front gable or eaves to the street; upper storeys **lean and twist** a little, roofs sag |
| **weathering** (materials) | per-stone colour, scan micro detail, bedding, iron stains, lichen rosettes, moss in sheltered joints and on ledges, **splash dirt / damp / green algae at the footing** (from each vertex's height above its footing), rain streaks; oak with growth rings, checks, silvered weather faces, dark undersides; plaster washes, repairs, hairline cracks, flaking to the daub, grime; tiles with lichen and moss in the laps; rusty iron |

## Files

| file | contents |
|---|---|
| `core.js` | seeded random / noise, frames, `Acc`/`Kit` accumulators (one mesh per material, deform whole buildings, merge sub-kits), primitives: `block` (rounded irregular box with noise, pillow, chips, adze, wane, warp, baked occlusion, grain axis), `grid`, `shapeFace`, `tube`, `strip`, `lathe` |
| `materials.js` | `archMaterials(ctx)` -> `{ stonePale, stoneGrey, stoneDressed, stoneWashed, stoneWet, stoneSoot, stoneFar, stoneFloor, mortar, mortarPale, mortarWashed, oak, oakDark, plaster, plasterInt, clay, slate, iron, lead, glass, portal, straw, strawBed, linen, leather, clayware, rope, soot, water, flame }` |
| `masonry.js` | `courses`, `masonryFace`, `masonryBox`, `archRing`, `masonryGable`, `roundTower`, `conicalRoof`, `steps`, `LOD` |
| `timber.js` | `member`, `pegs`, `framedWall`, `jetty`, `gableFrame`, `infill` |
| `roof.js` | `gableRoof` (clay / slate, sag, damage), `chimney`, `pentice` |
| `openings.js` | `windowUnit`, `door`, `leafFrame`, `glassQuad`, `threshold` |
| `house.js` | `house` (the Cling townhouse) |
| `cling.js` | `CLING` (fixed layout), `clingSquare`, `archway`, `gateway`, `fountain`, `stonePier`, `kingsSteps`, `alley`, `paving` (cobbled setts, worn patches), `wallFootPlacer`, `houseFootSegments` |
| `verdor.js` | `stable`, `keeperHouse`, `accessRig`, `leafPlatform`, `palace`, `harbor` |
| `interiors.js` | `birthingChamber`, `treatmentRoom` (+ `flagFloor`, `beamCeiling`, `nest`, `oilLamp`, `bowl`, `jug`, `foldedCloths`, `bench`, `stool`) |

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
steps (12.9, 19.4). Sun behind the steps (south).

## Look-dev scenes

* `scenes/lookdev/architecture-cling.js` - row 3/4 at eye level, the arch, the square from the steps, the gate, a close detail (one shot per second).
* `scenes/lookdev/architecture-verdor.js` - stable + access rig with Remi for scale, the rig, the keepers' lodge + Leaf's platform, the palace far off, the harbour steps.
* `scenes/lookdev/architecture-interiors.js` - birthing chamber (daylight shaft, lamps, nest), treatment room.
* `scenes/lookdev/architecture-contact.js` - every model 3/4 under the same daylight, one per second (turntable at 24 fps).
* `scenes/lookdev/architecture-dev.js` - quick single-piece checks.

## Costs and limits

See `PROGRESS.md` for the measured triangle counts and render times and the open issues.
