# Architecture kit - progress log (for a successor)

## State (2026-10-08, fix round 1 in progress)

Session 1 built the kit (see README.md). Fix round 1 (critic report) - done so far:
- ROOT CAUSE of the triangle-shaped tone patches / fine cross-hatch on oak and stone: the
  per-piece seed (aInfo.x) is an interpolated varying, and `akH1` was the classic
  fract(sin(x) * 43758) hash whose ~1e5 gain turned the interpolation round-off into per-triangle
  noise. Fixed centrally: core.js writes seeds at 1/8192 bucket centres, the fragment snaps them
  (`akI` in materials.js replaces vInfo in every body), akH1 is now a low-gain fract hash.
  Verified on 4K-footprint close-ups (scenes/lookdev/architecture-dev.js, debug modes).
- materials.js debug modes: archMaterials(ctx, { debug: n }) (1 const albedo, 2 no bump, 3 both,
  4 albedo unlit, >= 10 per-material terms).
- Element-stable planar projection (akPlanarE: axes from the piece's aAxis), new lichen rosettes
  (akLichen: warped cells, own size, lobed, sparse, low contrast, colonies), tiles lichen in tile
  uv + per-tile value / replacement tiles + scan in tile coords, plaster runoff from the member
  above (timber.js infill writes it into aInfo.z), no blob stains, flush plaster (14 mm, 4 mm
  belly, quirk), dark lead + domed/tilted crown-glass quarries, calmer per-stone colour.
- King's steps rebuilt solid (stepped cheek walls with stone on every face, retaining walls,
  parapet, fill) - the old cheek walls had no inner face (seen from inside = black lattice).
- Fountain rebuilt as an octagonal conduit (slabs between corner posts, mitred coping with
  cramps, solid step ring, octagonal pillar with spout drum, four heads, lead pipes, falling jets,
  pool material with ripple rings at the jets' impact points).

Next: harbour steps (solid pier), Cling (deep alley with a bend, broad road through the gate,
second-row houses, arch as a gate passage + a 3C beam), access rig rebuild (period carpentry),
Leaf platform (wheels, right-hand rail), interiors (warm chamber, straw, treatment arm support +
door + window backdrop), palace (openings, no teeth, massing), then masonry packing, timber frame,
roofs, eaves, chimneys, grass mask, cobbles; native 4K renders of every model + crops.
