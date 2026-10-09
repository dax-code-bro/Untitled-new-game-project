# Nature domain - progress (landscape models)

Owner paths: `scenes/lib/nature/` and `scenes/lookdev/nature-*.js`. All designs PROVISIONAL.
See README.md for the API, the bake commands, the geology and measurements.

## Done
- Bark textures: 4 ambientCG CC0 sets (Bark001/004/006/014, 1K) via the dgreenheck/ez-tree Git LFS
  mirror, recorded in `assets-lib/manifest.json` (sha256). Poly Haven / ambientCG / makehuman hosts
  re-tested 2026-10-09: still refused by the proxy.
- Verdor coast: one coherent limestone geology (strata, two joint sets with joints that end at bedding
  planes and step sideways between bed packages - no ruled vertical 'piano keys' -, standing/fallen
  joint blocks, overhangs, notch, caves, geos, arch, free-standing stacks and the OUTER ROCKS chain
  off the point, wave-cut platform, talus, beach), eroded land, irregular slope-over-wall clifftop,
  surface-nets tiles in 4 LODs, texture-array landscape shader (tidal/lichen zonation; turf with
  tussock-scale detail, triplanar on slopes; weathered grey rock wherever it is not a sheer wall).
- Rocks kit; land cover (heath/gorse/bracken/scrub colonies) shared by plants and ground shader;
  foliage clumps with ragged silhouettes and lumpy surfaces; grass from sets/grass.js.
- Procedural trees (hawthorn, sycamore, oak, ash, pine; card shrubs gorse, heather, bracken,
  blackthorn), dark young twigs, damped leaf sheen.
- Prologue island (basalt plateau, eroded, stacks, dawn mist; finer froxels, no stair-step cloud edge).
- Land around Cling: fields/strips/crops, hedgerows (card shrubs near the lens, clumps along the
  boundary further out), hedgerow trees, woods, road and lane.
- 4K finals of the hero angles and the contact sheet in `output/nature/final/` (not committed).

## Known weak spots
- gorse colonies at 80-150 m are still smooth-ish cushions (no card LOD at that range);
- far hedgerow trees use crown impostors that read as lollipops in an aerial at 1:1;
- Scots pine crown is sparse; the contact rock material reads a little marbled close up.
