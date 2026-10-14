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
- Outer rocks: two stacks + low, rounded, ragged skerries (wrack-covered, awash) on reef ledges that
  fall away from the rock into a rubble slope (the flat-topped vertical-sided ledge read as a pale
  square of shallow water round every skerry).
- Head slope: crag stretches are coherent (bimodal mask); outside them the rock lies >= 0.6 m under
  the soil (no slivers/pinholes along the contours); risers wander continuously along the coast.
  The grid of dark dots on the turf was the shader's bare-earth 'scrape' (one high threshold on
  lattice value noise = a dot on every lattice point): now warped, rotated, two octaves.
- Shader: multi-bounce AO for pale rock (no slate-dark shade), per-block bed tint for the rock kit,
  damp-only moss, zoneY for lookdev; first fixer's wet band / submerged rock / pools / streaks kept.
- Trees: photographed leaf sprays (texture/eztree_leaves, MIT, manifest) for hawthorn, oak, ash,
  sycamore, pine, blackthorn, heather (bracken fronds drawn); hawthorn = one flared trunk forking into 2-3 unequal
  stems, kinks, windward dieback (salt-killed twigs broken back to short grey snags), salt-pruned wedge; species presets (oak limbs, ash open, pine bole +
  dead lower limbs); crown gaps; root flare + buttresses; far LOD = 4-10 foliage masses on real limbs.
- Plants: gorse bloom, colony outliers, thrift only on <35 deg ground with blade tufts, paler heads,
  basal foliage on shrubs.
- Cling: earth hollow-way road (sunk 0.5-1.5 m, banks, ruts, grass crown, puddles, verges), geometric
  ridge and furrow (6-10 m, 0.4-0.8 m, reverse-S, headlands), photographic crop colours, plough
  slices/clods, field margins, gentler UV warp, taller gappy hedges, hedge proxy switch at 140 m.
- Island: sheer sea cliffs, boulder apron/reef at the foot (surf), stronger lava-flow terraces,
  feathered cloud cap (8 volumetric banks: the runtime's limit).
- "A forest reaching a cliff" (prologue montage) is its own scene, nature-forest.js: sessile oak wood
  with ash and sycamore over the Verdor limestone (the island version was a steep wall with orchard
  rows), salt-shorn oak and thorn scrub out over the head to the lip, seen from a boat.
- Contact sheet: rock kit set in turf (no plinth), front row as talus, back row as clifftop.

## Next
- Full cliff rebake with DC (running), 4K finals with new names (output/nature/r1fix/final/),
  1920 review copies + 1:1 crops (output/nature/r1fix/review/), README timings, npm test.
