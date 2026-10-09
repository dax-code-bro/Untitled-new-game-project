# Nature domain - progress (landscape models)

Owner paths: `scenes/lib/nature/` and `scenes/lookdev/nature-*.js`. All designs PROVISIONAL.
See README.md for the API, the bake commands and the geology.

## Done
- Bark textures: 4 ambientCG CC0 sets (Bark001/004/006/014, 1K) via the dgreenheck/ez-tree Git LFS
  mirror, recorded in `assets-lib/manifest.json` (sha256). Poly Haven / ambientCG / makehuman hosts
  re-tested 2026-10-09: still refused by the proxy.
- Verdor coast: one coherent limestone geology (strata, two joint sets, standing/fallen joint blocks,
  overhangs, notch, caves, geos, arch, stacks, OUTER ROCKS off the point, wave-cut platform, talus,
  beach), eroded land (stream power + droplets + thermal), irregular slope-over-wall clifftop edge,
  surface-nets tiles in 4 LODs, texture-array landscape shader with tidal/lichen zonation.
- Rocks kit (blocks, slabs, cobbles, outcrops) scattered by zone; land cover (heath/gorse/bracken/
  scrub colonies) shared by the plants and the ground shader; grass from sets/grass.js.
- Procedural trees: hawthorn, sycamore, oak, ash, pine (+ card shrubs gorse, heather, bracken,
  blackthorn), wind-shaped, bark PBR + moss, translucent leaf cards, LOD 0-2 + crown impostors.
- Prologue island: basalt lava-flow plateau with sea cliffs, eroded, stacks; dawn mist lookdev.
- Land around Cling: eroded rolling farmland, Voronoi closes and strip furlongs (ridge and furrow),
  crops, hedgerows with oaks/ashes, woods, the broad road and a lane (hollow ways).
- Lookdev scenes: nature-contact, nature-coast, nature-tree, nature-island, nature-cling.

## Next
- 4K finals of the hero angles + contact sheet, 1:1 crops, npm test, report.
- Known weak spots: near hedges are clumps (no card hedge LOD 0 yet), the face seen square-on from
  the sea is still somewhat regular, leaves a little saturated.
