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

## Images and timings (SwiftShader, 4 cores; output/ is git-ignored)
All under `output/props/final/` unless noted. "render" is the renderer's own frame time.

| image | scene / time | render | total |
|---|---|---|---|
| props-boat-4k.png (+ -1920.jpg, -crop-sail.png, -crop-hull.png) | props-boat 1 | 118.7 s | 137.0 s |
| props-santa-maria-4k.png (+ -1920.jpg, -crop-stern.png, -crop-furl.png) | props-santa-maria 1 | 169.5 s | 184.0 s |
| props-stall-4k.png (+ -1920.jpg, -crop-counter.png, -crop-awning.png) | props-stall 1 | 279.4 s | 295.9 s |
| props-stall-detail-4k.png (+ -1920.jpg, -crop.png) | props-stall 3 | 211.7 s | 224.1 s |
| props-bunting-4k.png (+ -1920.jpg, -crop-pennants.png) | props-bunting 1 | 347.7 s | 362.9 s |
| props-bunting-detail-4k.png (+ -1920.jpg, -crop.png) | props-bunting 3 | 239.7 s | 251.9 s |
| props-crop-4k.png (+ -1920.jpg, -1to1-barrels/-baskets/-sacks.png) | props-crop 1 | 163.0 s | 172.0 s |
| props-chamber-preview.png (1920x1080) | props-chamber 1 | 95.3 s | 103.9 s |
| output/props/contact-final/sheet.png (23 groups, 4x6 of 640x360; contact-final.mp4) | props-contact, preview, 1 fps | 23 frames in 79 s (4 workers) | 95 s |

Bakes: pennants 7 s (6 bakes); sails ~25 s each; awnings/banners/counter ~1 min.

## Next (successor)
- The Santa Maria's own spars, rigging and hull are the CC0 model's (1k texture); ratlines alias to
  dotted lines at a distance. A closer hero would need re-textured hull planking.
- Goods (cabbages, turnips) are vertex-coloured procedural shapes: convincing at stall distance,
  still a little smooth in a close-up.
- The egg (chamber): its dark shell shows blocky environment reflections under the old_room HDRI -
  the renderer's prefiltered environment is sampled without filtering on this machine (see the
  report's RUNTIME REQUEST); satin roughness keeps it down but does not remove it.
- npm test: 33/33 pass (last run at this checkpoint).
