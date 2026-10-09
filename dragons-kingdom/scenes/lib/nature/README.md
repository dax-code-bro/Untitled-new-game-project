# Nature - landscape models (Verdor coast, prologue island, land around Cling)

All designs PROVISIONAL. Owner paths: `scenes/lib/nature/` and `scenes/lookdev/nature-*.js`.
Everything is deterministic: offline bakes are seeded, runtime code uses seeded noise / `mulberry`
only inside `setup`, and `update(t)` is a pure function of `t`.

## Rebuild the caches (git-ignored, `scenes/lib/nature/cache/`, ~290 MB)

```
node scenes/lib/nature/offline/bake-verdor-land.mjs --drops 800000 --sp 60 --K 0.004  # ~50 s  -> cache/verdor/land.dkhm
node scenes/lib/nature/offline/bake-verdor-cliffs.mjs --workers 3                     # 3-6 min -> cache/verdor/tiles/L0..L3, cliffs.json
node scenes/lib/nature/offline/bake-island.mjs --drops 900000 --sp 70 --K 0.02        # ~50 s  -> cache/island/island.dkhm
node scenes/lib/nature/offline/bake-cling.mjs                                         # ~65 s  -> cache/cling/cling.dkhm
```

The land bake must run before the cliff bake (the cliff tiles sample the eroded land at the
clifftop). Options: `bake-verdor-cliffs.mjs --lods 0,1 --region x0,z0,x1,z1` rebuilds part of the
coast; `bake-verdor-land.mjs --preview out.ppm` also writes a shaded relief image of the land. A runtime loader throws a clear
"nature cache missing: ... run ..." error when a cache is absent.

## Geology (why it looks the way it does)

Verdor is ONE rock: pale, thick-bedded limestone (chalk-like, but hard enough to stand in vertical
walls, stacks and arches). The old look failed because the faces were a heightfield with a repeating
vertical texture and the stacks were a different, red-brown rock. Now:

- **Strata** (`verdor-world.js`): a bed table (thickness, hardness, colour) dipping gently
  inland; soft shaly partings weather back (pre-filtered recess LUT, so no aliasing at LOD 2-3),
  hard beds stand proud as ledges and overhangs.
- **Joints**: two near-vertical sets (~78 deg and ~-14 deg to the coast). The face is built from whole
  joint blocks that stand, lean or have fallen (rockfall scars at region scale, not per block), so
  the cliff line is a staircase of re-entrants and buttresses rather than a ruled wall. Weathering
  recesses only the exposed sides, internal joints overlap (no slots/grid grooves).
- **Sea erosion**: wave-cut notch at the high-water line, sea caves and geos driven along weak
  joints, the arch at z = -900, stacks and the OUTER ROCKS chain off the point (z ~ 700, where the
  scout falls) built as unions of jointed convex pieces, a wave-cut platform on a bedding plane with
  grikes, talus aprons and a shingle/sand beach in the bay at z ~ -1500.
- **Clifftop**: the land is eroded (stream power + droplets + thermal, `offline/erosion.mjs`) and
  meets the face through a slope-over-wall head, so the edge is irregular and rounded, not a
  straight ruled line.
- **Prologue island** (`island-world.js`): a different place (far ocean) - stepped basalt lava
  flows (red bole partings), plateau ringed by 45-195 m sea cliffs, a NW-SE ridge and a corrie;
  its high ground sits inside the cloud base in the dawn shot.

## Runtime API

| module | main exports |
|---|---|
| `coast.js` | `verdorWorld()` (world + baked land installed), `loadVerdorCoast(ctx, { views, radius, lodDist, material })` -> `{ group, world, material, surfaceAt(x,z), inBand, stats }` |
| `verdor-world.js` | `VERDOR` (seed, extents, tide, point/bay/arch positions), `createVerdorWorld()` -> SDF `sdf(x,y,z)`, `xc(z)` (coast line), `coastF`, `landHeight`, `platLevel`, `stacks`, `caves`... |
| `materials.js` | `landscapeMaterial(ctx, { world, profile: 'basalt', rockOnly, lichen, streaks, guano })` (texture-array landscape shader, `userData.setCover(cover)`) |
| `rocks.js` | `rockKit()`, `scatterCoastRocks(ctx, coast, { views, density })` (talus, platform blocks, beach cobbles, clifftop outcrops, sea bed) |
| `plants.js` | `landCover({...})` (heath/gorse/bracken/scrub map shared with the ground shader), `scatterPlants(ctx, { cover, views, height, slope, region, edge, grass })`, `WIND` |
| `trees.js` | `SPECIES` (hawthorn, sycamore, oak, ash, pine + card shrubs gorse, heather, bracken, blackthorn), `generateTree`, `treeKit(ctx, species, { variants, exposure, scale, seed })` -> `instance(lod, variant)`, `scatterTrees(placements, { views })` (LOD 0-2 + crown impostor LOD 3) |
| `island.js` | `loadPrologueIsland(ctx, { views, stacks, castShadow })` |
| `farmland.js` | `loadClingLand(ctx, { views, hedges, woods, grass })` -> `{ group, heightAt(x,z) }` (CLING frame: square at the origin, north = -z) |
| `heightmap.js`, `tiles.js`, `mesher.js`, `noise.js`, `texarray.js` | codecs (DKHM heightmaps, DKTL tiles), surface-nets mesher, seeded noise, texture arrays |

Frames: Verdor uses the coast frame of the F2/F3 style frames (sea at +x, land at -x, flight-line
travel +z, the inland camera on -x sees the right sides). The wind blows from the sea (+x) inland:
trees, gorse and grass lean toward -x.

## Measurements (this container: 4-core CPU, SwiftShader)

| step | time / size |
|---|---|
| land bake (800k droplets + 60 stream-power steps, 3600 x 4800 m at 4 m) | ~50 s |
| cliff bake, 3 workers, LOD 0-3 | 271 s, 2652 tiles, 8.6 M vertices / 16.8 M triangles, 272 MB |
| island bake / Cling bake | ~50 s / ~65 s |
| SDF evaluation | ~1-1.6 us |
| coast scene, shot 1 | 663 tiles (L0 153, L1 248, L2 234, L3 28), 4.4 M triangles + 0.34 M heightfield; ~4.1 k rocks; ~100 k plant clumps |
| 4K final still (8 subframes, film finish) | coast 305-320 s, tree 380 s (85 mm detail 615 s), island 146 s |

## Lookdev

| scene | t | shot |
|---|---|---|
| `nature-contact.js` | 1 / 2 / 3 / 4 / 5 | trees row / shrubs + grass / rock kit / hawthorn close / turntable (neutral kloofendal daylight) |
| `nature-coast.js` | 1 | Verdor coast side-on from the inland side, 86 m up, toward the point |
| | 2 | cliff foot: wave-cut platform and surf |
| | 3 | the outer rocks from above |
| | 4 / 5 | arch headland and the bay / the face from a boat |
| `nature-tree.js` | 1 / 2 | clifftop hawthorn 32 mm / 85 mm detail |
| `nature-island.js` | 1 / 2 / 3 | prologue island at dawn in mist (P-03 framing) / closer / P-12 |
| `nature-cling.js` | 1 / 2 / 3 / 4 | from the king's steps / aerial over the closes / on the road / meadow + hedgerow oak |

Shots switch a quarter second before each whole second, so `--time N` (whose motion-blur subframes
straddle N) always shows shot N alone.

Textures: ambientCG / Poly Haven CC0 sets already in `assets-lib/manifest.json`, plus four ambientCG
bark sets (`pbr/acg_bark001/004/006/014`, CC0) added for the trees. Leaf, gorse, heather and bracken
cards are drawn procedurally on a canvas (no downloads).
