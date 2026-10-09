# Props (scenes/lib/props)

Ships, festival dressing and household props for Dragon's Kingdom, built from their real parts
so they hold up in native 4K close-ups: lapped planks with clench nails, coopered staves with
hoops, nailed boards, actually woven baskets, cloth shaped by Blender cloth simulation, light
coming *through* sails, bunting and awnings. Free material only (CC0 scans already in
`assets-lib/`, the CC0 Poly Haven ship model, Blender's own simulation). **Every design is
PROVISIONAL** until Daxtyn approves it.

## What is in it

| file | what |
|---|---|
| `core.js` | seeded random/noise, frames, `Builder`/`Kit` (geometry with uv in metres + `aPiece`/`aAO`/`aWear`), bevelled `box`, `tube`, `lathe`, `laidRope` (3 real strands), `catenary`, `sagLine`, `loadCache` |
| `materials.js` | `surface()`: one shader patch for all props - a CC0 scan used only as luminance/normal *detail* on the material's own colours, per-piece tone and texture offset, streaks along the grain, worn arrises, cavity AO, dirt toward the ground, a world-space waterline (wet band, weed), rope lay, throwing rings, woven stripes, a coarse plain weave for hessian (`weave: { period, depth, contrast }`: wandering threads with slubs, faded out before it aliases). `clothMaterial()`: the same plus light through the cloth (see below). `propMaterials(ctx)`: the shared palette (tarred hull, oak, silvered, pale, dark, stave, spar, withy; iron; rope; linen, wool, hessian; straw; clay, glaze; leather; wax) |
| `cloth.js` | baked cloth grid -> mesh (Catmull-Rom upsampling, fold AO, hems), `squareSail()` (bolt rope, reef points), an analytic bunting fallback |
| `boat.js` | `prologueBoat()`: the prologue vessel (below) |
| `santa-maria.js` | `santaMaria()`, `mooring()`: the Santa Maria (below) |
| `containers.js` | `barrel` (cask / keg / open tub), `bucket`, `crate` (slatted, closed, lidded, broken), `basket` (round / oval, arch or ear handles), `trestleTable`, `bench`, `stool`, `wheel`, `handcart` |
| `goods.js` | loaves (boule, batard, roll, plait), apples, pears, cabbages (a wrapped head with leaf-margin ledges, raised pale midribs and veins; wavy outer leaves peeling away), onions, carrots, leeks (closed shaft, root tuft, three flat keeled blades), turnips (magenta crown, cream body, wiry taproot, cut stalk stubs), fish, cheese, eggs, thrown pottery (jug, pitcher, pot, bowl, cup; dipped glaze), cloth bolts, herb bunches, onion strings; `fruitHeap()` stacks any of them in a container |
| `festival.js` | `festivalKit(ctx)`: dressed market stalls (`bread`, `fruit`, `veg`, `fish`, `pottery`, `cloth`, `dairy`) with baked awnings and counter cloths, `bunting(a, b)` (baked pennants on a true catenary, the top edge turned over the cord as a stitched channel), `banner(F, 'still'|'breeze'|'gust')`, grain sacks (`full`: tied, the gathered mouth bunched above the cord; `slump`: opened, the mouth rolled down into a cuff, grain heaped inside; `lying`), rope coils, horn lanterns, instruments (tabor, pipe, lute, frame drum, fiddle), breakables (splintered beam and board, whole and broken roof tiles, splinters) |
| `verdor.js` | `verdorKit(ctx)`: the egg (`closed`, `cracked`, `opened`, `broken` - shell with thickness, pale inner membrane, Voronoi fracture network), straw nest bedding (instanced round jointed stalks round a linen pad), `bowl` (with water), `foldedCloth`, `oilLamp`, `healerBox` (flasks, bandage rolls, unguent pots, mortar and pestle, splint, folded sling), `groundGear` (mounting steps, ladder, saddle stand with blanket) |
| `offline/sail.py`, `offline/drapes.py` | the Blender cloth bakes (below) |

## The prologue vessel (`boat.js`)

A small, unremarkable double-ended clinker boat (~9.6 m, 2.7 m beam), not the Santa Maria:
seven real strakes a side, each plank lapped over the one below (outer face, inner face, the
visible worn lower edge), scarfed lengths, iron clench nails outside and roves inside; a keel
running into curved stem and stern posts (pointed both ends); frames, risers, thwarts with
knees, loose floorboards, gunwale, tholes; a side rudder with its tiller; mast, yard and
parrel; the square wool sail **from a cloth simulation** (robands at the head, sheeted clews,
wind) with tablings, cloth seams with stitching, reinforcement patches, two rows of reef
points and a bolt rope; shrouds set up with lanyards, forestay, halyard, braces, tack, sheet
and a bowline with its bridle; oars, water kegs, a chest, rope coils, cargo under a hide.
`prologueBoat(ctx, { brace, sail: 'prologue_full' | 'prologue_eased' | 'furled' })`. The hull
material goes wet and weedy below world y = 0 (the sea).

## The Santa Maria (`santa-maria.js`)

The CC0 Poly Haven `dutch_ship_medium` (in the library, unmodified) dressed as the story's ship
for the harbour: its set sails (with a printed emblem) are hidden and every sail is **furled**
on its yard (a roll of canvas cinched at irregularly spaced gaskets, bulging unevenly between
them, found automatically from the source sails' head lines; the source's own flat painted
lateen and spritsail strips are cut out of the rigging mesh and rolled the same way); the hull's 1k texture gets plank-scale wood detail projected along
the strakes, weathering streaks, a wet band and weed at the waterline; restrained painted
lettering "SANTA MARIA" on the stern (Liberation Serif, SIL OFL, installed on this machine);
`mooring()` adds mooring lines with real sag, rope fenders and a gangplank.

## Light through cloth

Thin sheets use `clothMaterial()`: sun and sky light arriving on the far side is transmitted
(diffusely, plus a forward lobe toward the light), tinted by the dye, and blocked twice where
the cloth is doubled (hems, seams, patches, reef bands) - backlit sails and bunting show their
seams and hems dark against the light, as real ones do. Three.js normally makes a
double-sided sheet shadow its own unlit face (the shadow lookup is pushed along the normal,
through the sheet); the cloth material pushes it toward the light instead (`shadowmap_vertex`
patch), so the far side's light is what the near side transmits. No runtime change was needed.

## Offline bakes (Blender cloth)

Run once (minutes on this machine) with Blender's Python module (bpy 4.2):

```bash
PY=<bpy python>          # here: /tmp/claude-0/.../scratchpad/bpyenv/bin/python
$PY scenes/lib/props/offline/sail.py      # cache/sail_prologue_full.json, sail_prologue_eased.json (~25 s each)
$PY scenes/lib/props/offline/drapes.py    # awnings (2 stall sizes), counter cloth, banners x3, pennants x6 (~1 min)
$PY scenes/lib/props/offline/drapes.py --only pennant   # just the pennants (7 s): a triangle-row mesh, not a
                                                        # grid squeezed to a point (that crumples the tips)
```

Outputs go to `scenes/lib/props/cache/` (git-ignored). The runtime falls back to analytic
shapes when a bake is missing (except the boat's sail, which needs its bake).

## Look-development scenes

| scene | what | 4K images (output/props/final/) |
|---|---|---|
| `scenes/lookdev/props-contact.js` | contact sheet: 23 groups, one per second, 3/4 view, neutral daylight (CC0 `kloofendal_48d_partly_cloudy`); 24 fps = turntable | `output/props/contact-final/sheet.png` |
| `scenes/lookdev/props-boat.js` | the prologue vessel at water level, 3/4 from ahead, sail backlit, two crew (humans library) | `props-boat-4k.png`, `-crop-sail.png`, `-crop-hull.png` |
| `scenes/lookdev/props-santa-maria.js` | the Santa Maria moored at the architecture library's quay, from the quay off her stern quarter; `--time 3` broadside from the harbour, `--time 5` the waist from the quay | `props-santa-maria-4k.png`, `-crop-stern.png`, `-crop-furl.png` |
| `scenes/lookdev/props-stall.js` | a dressed greengrocer's stall at eye level (awning, hanging onions and herbs, goods in baskets); `--time 3` the goods close, `--time 5` the cabbages | `props-stall-4k.png`, `-crop-counter.png`, `props-stall-detail-4k.png` |
| `scenes/lookdev/props-bunting.js` | bunting across a Cling street (architecture houses), backlit against the sky; `--time 3` a 50 mm detail of the nearest string | `props-bunting-4k.png`, `-crop-pennants.png`, `props-bunting-detail-4k.png` |
| `scenes/lookdev/props-crop.js` | barrels, crates, baskets, sacks in a flagstone yard - framed for 1:1 crops | `props-crop-4k.png`, `-1to1-barrels.png`, `-1to1-baskets.png`, `-1to1-sacks.png` |
| `scenes/lookdev/props-chamber.js` | a corner of a Verdor birthing chamber (egg in its straw nest, bench with bowls, cloths, lamps) | `props-chamber-preview.png` |
| `scenes/lookdev/props-dev.js` | scratch (`DEV = 'boat'` or `'sacks'` close material check) | - |

A view switched on by time is a hard cut: render it well after the cut (`--time 3` for a cut at
t = 2), because velocity motion blur uses the previous frame's camera.

```bash
node render/render.mjs --still scenes/lookdev/props-boat.js --time 1 --preset final --png out.png
node render/render.mjs scenes/lookdev/props-contact.js --preset preview --fps 1 --cinematic velocity
```

Timings and image paths: see `PROGRESS.md`.
