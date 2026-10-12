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
  meets the face through a slope-over-wall head (a vertical wall, then a head slope 0-27 m high).
  The ROCK under the head is a staircase whose treads are the tops of thick hard beds and whose
  risers follow the slope contours, jogging at the cross joints; a smooth SOIL mantle lies on it
  (`column()` / `sdf()` in verdor-world.js). Outcrop nosings poke through the turf as short ledges,
  the lip has a 0.15-0.5 m sod overhang over a 0.3-1 m soil band, and limestone pavement patches
  break the turf inland. Nothing slices the vertical joint blocks diagonally any more.
- **Meshing**: dual contouring (`meshTile(..., { dc: true })`): every sign-change edge carries the
  exact SDF normal and the cell vertex solves the QEF, so joint faces, bed tops and arrises meet at
  sharp edges (surface nets rounded every arris over ~1 cell: the 'stacked mattress' look). Cells
  where the planes do not meet cleanly (noisy fractured faces, features smaller than a cell) keep
  the surface-nets vertex; shading normals stay smooth and the landscape shader switches to the
  triangle's own plane at creases (`NK_CREASE`).
- **Prologue island** (`island-world.js`): a different place (far ocean, unnamed; NOT Verdor, whose
  rock is pale limestone) - stepped basalt lava flows (red bole partings) eroded into flat benches
  and steep scarps, a plateau ringed by sheer 45-195 m sea cliffs standing on a boulder apron and
  reef (what the surf breaks on), a NW-SE ridge and a corrie; its high ground sits inside a layered
  cloud cap in the dawn shot. Oak and pine woodland on the lee benches reaches the cliff edge (the
  montage's "forest reaching a cliff").
- **Land around Cling** (`cling-world.js`, `farmland.js`): the broad road and the lane are earth
  HOLLOW WAYS worn 0.5-1.5 m into the land between hedge banks (cart ruts, a grass crown, puddles,
  verges) - no pale gravel strip; furlongs carry geometric ridge and furrow (6-10 m strips, 0.4-0.8 m,
  straight or reverse-S, headlands where the plough turned); closes are hedged with 2-4 m hedges that
  have gaps and irregular tops; crops take photographic values (no cream fields); every field has a
  rough margin.

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
| 4K final still (8 subframes, film finish), alone on the machine | coast 305-320 s, tree 380 s (85 mm detail 615 s), island 146 s, contact 90-120 s, Cling 170-300 s |
| the same, sharing the 4 cores with another domain's render | roughly 1.6-2x (coast 250-845 s, tree detail 1175 s) |

## Lookdev

| scene | t | shot |
|---|---|---|
| `nature-contact.js` | 1 / 2 / 3 / 4 / 5 | trees row / shrubs + grass / rock kit set in turf (front row weathered as talus, back row as clifftop) / hawthorn close / turntable (neutral kloofendal daylight) |
| `nature-dev.js` | 1..7 | fast geometry check of the coast (no plants, rocks, trees): the nature-coast cameras + the tree shot's background |
| `nature-coast.js` | 1 | Verdor coast side-on from the inland side, 86 m up, toward the point |
| | 2 | cliff foot: wave-cut platform and surf |
| | 3 | the outer rocks from above |
| | 4 / 5 | arch headland and the bay / the face from a boat |
| `nature-tree.js` | 1 / 2 | clifftop hawthorn 32 mm / 85 mm detail |
| `nature-island.js` | 1 / 2 / 3 | prologue island at dawn in mist (P-03 framing) / closer / P-12 |
| `nature-forest.js` | 1 / 2 | "a forest reaching a cliff" (prologue montage): oak wood with ash, sycamore and salt-shorn thorn scrub over the Verdor limestone, from a boat 420 m out / closer along the edge, 50 mm |
| `nature-cling.js` | 1 / 2 / 3 / 4 | from the king's steps / aerial over the closes / on the road / meadow + hedgerow oak |

Shots switch a quarter second before each whole second, so `--time N` (whose motion-blur subframes
straddle N) always shows shot N alone.

Textures: ambientCG / Poly Haven CC0 sets already in `assets-lib/manifest.json`, plus four ambientCG
bark sets (`pbr/acg_bark001/004/006/014`, CC0) added for the trees, and photographed leaf sprays
(`texture/eztree_leaves`: oak, ash, aspen, spruce cut-outs from EZ-Tree, MIT licence) that
`photoLeafAtlas()` builds into per-species 2x2 atlases (hawthorn and blackthorn: small-leaved fanned
sprays; sycamore: the aspen spray recoloured green; heather: the spruce shoots tiny and olive).
Gorse, thrift and bracken cards (pinnate fronds, a third of them last year's dead brown) are drawn
on a canvas.

Trees (`trees.js`): hawthorn grows ONE flared, buttressed trunk that forks at 0.5-1.2 m into 2-3
unequal stems (pipe model), with kinked zig-zag twigs, surface roots, a leaf cluster at every tip,
dead silver twigs on the windward side and a salt-pruned wedge crown when exposed; oak has a short
bole and 3-5 heavy near-horizontal limbs, ash an open upswept crown, sycamore an upswept dome, Scots
pine a tall bare bole with dead drooping lower limbs and a flat crown. Crowns have sky gaps (3D
noise culls leaf clusters). The far LOD is 4-10 foliage masses clustered from the real leaf
positions on the tree's own trunk and main limbs (no lollipops).
