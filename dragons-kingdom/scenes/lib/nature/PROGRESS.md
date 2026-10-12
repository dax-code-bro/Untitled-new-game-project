# Nature domain - progress (landscape models)

Owner paths: `scenes/lib/nature/` and `scenes/lookdev/nature-*.js`. All designs PROVISIONAL.
See README.md for the API, the bake commands, the geology and measurements.

## Fix round 1 (critic r1) - in progress
Done in code (2026-10-12, second fixer; the first was stopped by a usage limit):
- Cliff head: the per-block caps of the first fixer (a 'quarry' of bare capped blocks) are replaced by
  a bed-quantised STAIR under a smooth SOIL mantle (verdor-world.js column()/sdf()): treads are
  hard-bed tops, risers follow the head-slope contours and jog at the cross joints; outcrop nosings
  poke through the turf; sod overhang + soil band at the lip; limestone pavement patches inland.
  No more soil plane slicing joint blocks (the triangular shards).
- Dual contouring in mesher.js (`dc: true`, used by the cliff bake and the rock kit): sharp arrises
  instead of the ~1-cell 'pillow' round of surface nets; crease shading in materials.js (NK_CREASE).
- Tiles carry depth below the rock/soil top + a bare-rock flag (soil lip only under real soil).
- Outer rocks: two stacks + low skerries (first fixer) on a ragged reef mostly 0.4-1 m under water.
- Shader: multi-bounce AO for pale rock (no slate-dark shade), per-block bed tint for the rock kit,
  damp-only moss, zoneY for lookdev; first fixer's wet band / submerged rock / pools / streaks kept.
- Trees: photographed leaf sprays (texture/eztree_leaves, MIT, manifest) for hawthorn, oak, ash,
  sycamore, pine, blackthorn, heather, bracken; hawthorn = one flared trunk forking into 2-3 unequal
  stems, kinks, windward dieback, salt-pruned wedge; species presets (oak limbs, ash open, pine bole +
  dead lower limbs); crown gaps; root flare + buttresses; far LOD = 4-10 foliage masses on real limbs.
- Plants: gorse bloom, colony outliers, thrift only on <35 deg ground with blade tufts, paler heads,
  basal foliage on shrubs.
- Cling: earth hollow-way road (sunk 0.5-1.5 m, banks, ruts, grass crown, puddles, verges), geometric
  ridge and furrow (6-10 m, 0.4-0.8 m, reverse-S, headlands), photographic crop colours, plough
  slices/clods, field margins, gentler UV warp, taller gappy hedges, hedge proxy switch at 140 m.
- Island: sheer sea cliffs, boulder apron/reef at the foot (surf), stronger lava-flow terraces,
  feathered cloud cap, new shot t=4 "forest reaching a cliff" (oak/pine woodland on the lee shore).

## Next
- Full cliff rebake with DC (region z 100..900 baked; the rest is stale), then render all hero
  angles at preview, fix, then 4K finals with new names (output/nature/r1fix/final/).
- Contact sheet restage (rocks embedded in turf, no plinth), README update, npm test.
