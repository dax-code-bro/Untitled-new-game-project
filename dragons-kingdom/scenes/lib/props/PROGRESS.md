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

## Next
- Santa Maria (dutch_ship_medium base, furled sails, hull detail), festival kit, Verdor props,
  bunting/banner/awning/sack bakes, contact sheet, 4K finals + crops, README.
