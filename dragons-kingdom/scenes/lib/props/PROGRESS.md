# Props library - progress (successor notes)

Owner paths: `scenes/lib/props/` and `scenes/lookdev/props-*.js`. Binaries (cache/) are git-ignored;
regenerate with the scripts in `offline/` (Blender's Python module, bpy 4.2:
`/tmp/claude-0/-home-user-Untitled-new-game-project/c24e42f5-3f85-5974-a286-53c4d569fb35/scratchpad/bpyenv/bin/python`).
Every design is PROVISIONAL until Daxtyn approves it.

## Done
- core.js: seeded rng/noise, frames, Builder/Kit (uv in metres + aPiece/aAO/aWear), bevelled box,
  tube, lathe, laid rope, catenary, sag lines, cache loader.
- materials.js: one shader patch for all props (photo scan as luminance/normal detail on own
  colours, per-piece tone, streaky macro along the grain, worn arrises, cavity AO, dirt, waterline
  wet band + weed), rope lay / throwing rings / stripes; clothMaterial(): light THROUGH the cloth
  (direct + sky from behind, doubled seams/hems/patches darker against the light, seams with
  stitching and per-bolt tone) and the shadow-lookup fix for thin double-sided sheets.
- cloth.js: baked-grid -> cloth mesh, squareSail() (bolt rope, short reef ties), bunting fallback.
- boat.js: prologueBoat() - clinker hull (7 lapped strakes a side, scarfs, clench nails and roves),
  keel + curved stem/stern posts, frames, risers, thwarts + knees, floorboards, gunwale, tholes,
  side rudder + tiller, mast, yard + parrel, baked wool sail, shrouds with lanyards, forestay,
  halyard, braces, tack, sheet, bowline; oars, kegs, chest, rope coils, hide-covered bundles.
- containers.js: coopered barrels/kegs/tubs/buckets (separate staves with real gaps, chime end
  grain, heads as a disc with joint lines), crates, really woven baskets, trestle table, bench,
  stool, spoked wheel + handcart.
- goods.js: loaves, apples/pears, cabbages (wrapped head: leaf-margin ledges, raised pale midribs
  and veins; wavy outer leaves peeling away), onions, carrots, leeks (closed shaft, root tuft, three
  flat keeled blades), turnips (magenta crown, cream body, wiry taproot, cut stalk stubs), fish,
  cheese, eggs, thrown pottery, cloth bolts, herb bunches, onion strings.
- festival.js: stalls (7 kinds; front apron boards up under the counter top), bunting (catenary,
  triangle-mesh baked pennants, hem channel turned over the cord with no gap), banners, sacks
  ('full' with a ruffled tuft above the cord, 'slump' = opened with a rolled cuff and grain inside,
  'lying'; faces outward - they were inside-out before), rope coil, horn lantern, instruments
  (the lute now lies on its back, bowl down), breakables.
- offline/drapes.py: awnings, counter cloth, banners, pennants (now a triangle-row mesh: a grid
  squeezed to a point crumpled the tips like wet tissue).
- santa-maria.js: dutch_ship_medium; every sail furled (the source's flat painted lateen and
  spritsail strips are cut out of the rigging mesh and rolled like the others), hull detail,
  waterline, stern lettering, mooring().
- verdor.js: egg (4 states, Voronoi fracture), straw nest, bowls, folded cloth, oil lamps, healer
  box, ground gear.
- lookdev: props-contact (23 groups), props-boat, props-santa-maria (hero t<2 = stern quarter on
  the quay; t 2-4 broadside from the harbour; t>=4 the old waist view), props-stall (t<2 hero; t>=2
  goods close-up; t>=4 cabbages), props-bunting (t<2 hero; t>=2 50 mm detail), props-crop
  (flagstone yard), props-chamber (Verdor chamber corner), props-dev (scratch).

## Render notes
- A detail view switched on by time must be rendered well after its cut (e.g. --time 3 for a cut at
  t = 2): velocity motion blur uses the previous frame's camera.
- 4K final timings (SwiftShader, 4 cores): see the report / README table.

## Next
- 4K finals of the reworked heroes, 1:1 crops, contact sheet re-run, README image table, npm test.
