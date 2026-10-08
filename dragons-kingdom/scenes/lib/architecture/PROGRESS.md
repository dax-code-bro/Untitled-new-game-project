# Architecture kit - progress log (for a successor)

## State (2026-10-08, session 1, end)

Done (code in scenes/lib/architecture/, see README.md for the API):
- core.js (accumulators, rounded irregular blocks, lathe/tube/grid primitives, hard-edged
  sharp blocks; `Kit.build` centres each set on a snapped local origin so the procedural noise
  runs in object space), materials.js (stone variants incl. lime-washed / wet / far / sooty /
  setts / floor flags, mortar incl. washed, oak with growth rings from the pith distance, plaster
  outdoor/indoor, clay tiles, stone slates, iron, leaded glass + portal interior mapping, flame,
  linen, straw stems + straw bed, clayware, rope, leather).
- masonry.js: courses, faces, boxes with quoins, arches (also through-arches 'archOpen'),
  sills, packing; styles ashlar / squared / rubble / washed / dressed; stone gables with
  coping + kneelers; round towers with corbel table + parapet; conical slate roofs; steps;
  LOD hero/mid/low/far.
- timber.js, roof.js, openings.js, house.js: framed storeys, jetties, gables, roofs with sag,
  chimneys, windows/shutters/doors, the Cling townhouse.
- cling.js: the square (CLING layout = shot list cling_map as staged in F5), house rows with an
  alley gap (closed by a house beyond), stone arch, gate, fountain, stone support, king's steps,
  cobbled paving (setts, worn patches), wall-foot weeds placer, roof damage hook.
- verdor.js: stable, keepers' lodge (+ woodshed), Charcoal's access rig, Leaf's platform,
  palace (far LOD), harbour (wet/dry quay courses, projecting steps, bollards, rings, fenders,
  warehouses with hoist beams).
- interiors.js: birthing chamber (lime-washed rubble, high arched opening for the sun shaft,
  oak door, beam ceiling, flags, nest: stone kerb + straw bed + loose stems + cloth-simulated
  linen, lamps, bench, bowls, jug, cloths, stool), treatment room (plastered walls, window with
  folded shutters, settle, stools, table, basin, jug, cloths, shelves); offline/nest_cloth.py
  bakes the nest linen with Blender cloth (cache/nest_cloth.json, git-ignored; procedural
  fallback when missing).
- Look-dev: scenes/lookdev/architecture-{cling,verdor,interiors,contact,dev}.js.

Regenerate the bake:  <bpy python> scenes/lib/architecture/offline/nest_cloth.py   (~1 min)

## Fixed this session (worth knowing why)
- Annular warps (fountain rings, nest kerb, round tower, corbels) mirrored the block -> inside-out
  stones; use `th = am - lx / r` (a proper rotation).
- Oak: the across-grain coordinate came from world position . per-triangle normal -> jagged
  lines / zebra moire on displaced members; now two directions fixed by the piece's grain axis
  (the pith distance only on the end grain). Rings are a smooth band (no sawtooth); all fine
  detail fades by a smooth per-vertex pixel footprint (fwidth() of a varying is per-triangle on
  a displaced mesh -> patchy anti-aliasing). Adze scallops are in the bump, not the geometry.
- Noise far from the world origin (rooms at x = -300, the harbour at 520) lost precision ->
  contour "wood grain" swirls on plaster, polka dots on floors; noise now in object space.
- Cascaded shadows without depth bias -> acne stripes on grazing members: lookdev scenes set
  `shadows: { bias: -0.0003, normalBias: 2.5 }`.
- Depth precision: a long-lens shot of a far set (the palace at ~400 m) needs a far-out camera
  near plane (25 m there), else the stones and the recessed mortar z-fight into dark streaks.
- Plaster losses (treatment room) are cut on a 6 cm grid with the edge vertices moved onto the
  contour of the loss field, plus the coat's broken edge - no stepped outlines.
- Lesson: never edit the live materials for an experiment while a render queue runs (two
  stills picked up an experimental shader; they were re-rendered).

## Measured (this box: 4-core CPU, SwiftShader)
- Build (setup) per model, triangles: house 0.29-0.32 M (0.5-0.9 s), house row of three 0.70 M,
  stable 0.59 M, keepers' lodge 0.21 M, access rig 0.05 M, Leaf's platform 7 k, harbour 1.0 M,
  palace (far LOD) 0.71 M, round tower 0.28 M, arch 72 k, gate 54 k, fountain 32 k, support
  19 k, king's steps 89 k. The whole Cling square (21 houses, LOD by distance, paving) 8.7-8.9 M
  triangles in ~20 draw calls.
- 4K final stills (8 accumulated sub-frames): 2.5-11 min each (interiors 2.5-6, Cling 8-11).

## Open issues / next
- Faint triangle-shaped tonal patches with a fine cross-hatch on large flat oak / stone faces in
  1:1 crops. Isolated to the albedo path (a constant albedo removes them); not the bump, GTAO,
  contact shadows or shadow bias. Not found yet - start by bisecting the remaining albedo terms
  (base tone x streak noise alone still shows it) on a COPY of the scene/material.
- Stones still read a little as separate blocks at mid distance (each stone has its own colour);
  more cross-joint weathering (soot, run-off, lichen colonies across several stones) would help.
- Plaster flakes / repairs are shader-only; a few real modelled losses (lath and daub showing)
  would sell close-ups.
- Interiors: image-based light is not occluded by walls (env intensity is turned down and point
  lights fake the bounce); a light-probe / IBL-occlusion feature in the runtime would make rooms
  physically right.
- Damage: only roof tiles can be removed (`damage` hook); fallen beams / broken walls not done.
- Square props (stalls, banners, carts), people and the ground outside the square are other
  domains'.

Final renders: written to the session scratchpad (not in git); paths in the agent report.
