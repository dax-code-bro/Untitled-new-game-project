# Props library - progress (successor notes)

Owner paths: `scenes/lib/props/` and `scenes/lookdev/props-*.js`. Binaries (cache/) are git-ignored;
regenerate with the scripts in `offline/` (Blender's Python module, bpy 4.2:
`/tmp/claude-0/-home-user-Untitled-new-game-project/c24e42f5-3f85-5974-a286-53c4d569fb35/scratchpad/bpyenv/bin/python`).

## Done
- core.js: seeded rng/noise, frames, Builder/Kit (uv in metres + aPiece/aAO/aWear), bevelled box,
  tube, lathe, laid rope, catenary, sag lines, cache loader.
- materials.js: one shader patch for all props (photo scan as luminance/normal detail on own
  colours, per-piece tone, streaky macro along the grain, worn arrises, cavity AO, dirt, waterline
  wet band + weed), rope lay / throwing rings / stripes; clothMaterial(): light THROUGH the cloth
  (direct + sky from behind, doubled seams/hems/patches darker against the light, seams with
  stitching and per-bolt tone) and the shadow-lookup fix for thin double-sided sheets.
- cloth.js: baked-grid -> cloth mesh (Catmull-Rom upsampling, fold AO, hems), squareSail()
  (bolt rope, reef points), bunting() (catenary cord, pennants folded over it).
- offline/sail.py: Blender cloth bake of the square wool sail (robands, sheeted clews, wind) ->
  cache/sail_prologue_full.json (~25 s).
- boat.js: prologueBoat() - clinker hull (7 real lapped strakes a side, scarfs, clench nails and
  roves), keel + curved stem/stern posts, frames, risers, thwarts + knees, floorboards, gunwale,
  tholes, side rudder + tiller, mast, yard + parrel, baked sail, shrouds with lanyards, forestay,
  halyard, braces, tack, sheet, bowline; oars, kegs, chest, rope coils, hide-covered bundles.
- lookdev: props-dev.js (scratch), props-boat.js (hero: water level 3/4, backlit sail, crew).

- containers.js: coopered barrels/kegs/tubs/buckets (separate tapered staves, chime, heads, bung,
  iron or bound-withy hoops), nailed crates (slatted / closed / lid / broken), really woven baskets,
  trestle table, bench, stool, spoked wheel + handcart.
- goods.js: loaves (boule/batard/roll/plait), apples/pears, cabbages, onions, carrots/leeks/turnips,
  fish, cheese, eggs, thrown pottery (dipped glaze), cloth bolts, herb bunches, onion strings.
- festival.js: festivalKit(ctx) -> stall(F, kind) (7 kinds, baked awning + counter cloth), bunting
  (catenary + baked pennants), banner (baked), procedural grain sacks, rope coil, horn lantern,
  instruments, breakables (splintered beam/board, roof tiles + shards, splinters).
- offline/drapes.py: awnings (2 sizes), counter cloth, banners (still/breeze/gust), pennants (6).
- santa-maria.js: dutch_ship_medium + furled sails with gaskets, hull detail/waterline shader,
  stern lettering (Liberation Serif), mooring() lines/fenders/gangplank.
- lookdev: props-contact.js (17 groups), props-stall.js, props-santa-maria.js.

## Next
- Verdor props (bowls, folded cloth, lamps, straw bedding, egg + shell fragments, healer supplies,
  sling, platform accessories), bunting street hero, barrel/crate/basket crop hero, 4K finals,
  README, npm test.
