# Nature domain - progress (landscape models)

Owner paths: `scenes/lib/nature/` and `scenes/lookdev/nature-*.js`. All designs PROVISIONAL.

## Done
- Bark textures: 4 ambientCG CC0 sets (Bark001/004/006/014, 1K) via the dgreenheck/ez-tree Git LFS
  mirror, recorded in `assets-lib/manifest.json` (sha256), fetched with `node assets-lib/fetch.mjs --only pbr/acg_bark`.
  Poly Haven / ambientCG / makehuman hosts re-tested 2026-10-09: still refused (HTTP 403 from the proxy).
- `noise.js` (shared seeded noise), `heightmap.js` (DKHM heightmap codec + bicubic sampler), `tiles.js` (DKTL tile meshes).
- `verdor-world.js`: ONE geology for Verdor - pale bedded limestone. Strata table (beds with
  hardness, pre-filtered weathering recess), two joint sets, whole joint blocks that stand or fall,
  exposed-side weathering only (no slots on internal joints), wave-cut notch, slope-over-wall heads,
  rockfall scars + lean per block, chimneys on open joints, geos on weak joints, sea caves along
  joints, the arch at z = -900, stacks (unions of jointed convex pieces), the OUTER ROCKS chain off
  the point (z ~ 700), wave-cut platform on a bedding plane with grikes, talus aprons, beach (shingle
  berm + sand) in the southern bay (z ~ -1500), sea bed.
- `offline/erosion.mjs`: stream-power (FastScape-style implicit, priority-flood drainage) + droplet
  hydraulic + thermal erosion. `offline/bake-verdor-land.mjs` -> `cache/verdor/land.dkhm`.
- `offline/mesher.mjs`: narrow-band surface nets (coarse-to-fine), grid-projected vertices, SDF AO.
  `offline/bake-verdor-cliffs.mjs` -> `cache/verdor/tiles/L0..L3/*.dktl` + `cliffs.json`.
- Runtime: `texarray.js` (photo layers in texture arrays), `materials.js` (landscape shader: bedding,
  tidal/lichen zonation, streaks, seeps, guano, turf/soil/shingle/sand/scree), `coast.js`
  (`loadVerdorCoast`: tiles by LOD from the shot's camera list + heightfield land/sea bed).
- Lookdev: `scenes/lookdev/nature-coast.js` (5 hero angles by time 1..5).

## Next
- review renders, fix shape/material issues; full bake of all tiles
- rocks/boulders library (talus, platform blocks, beach), shrubs (gorse, heather, bracken, thrift),
  procedural trees (hawthorn, sycamore/ash, oak, pine) with bark + leaf cards, grass reuse
- prologue island (eroded heightfield, high ground in cloud), Cling farmland (fields, hedgerows, road)
- contact sheet scene, 4K finals + crops, README

## Rebuild the caches
```
node scenes/lib/nature/offline/bake-verdor-land.mjs --drops 800000 --sp 60 --K 0.004   # ~1 min
node scenes/lib/nature/offline/bake-verdor-cliffs.mjs --workers 3                      # all tiles, LOD 0-3
```
