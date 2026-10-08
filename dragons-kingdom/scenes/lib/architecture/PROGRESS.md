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
  lines / zebra moire on displaced members; now from the pith distance (uv). Rings are a smooth
  band (no sawtooth), all fine detail fades by its own screen-space frequency.
- Noise far from the world origin (rooms at x = -300, the harbour at 520) lost precision ->
  contour "wood grain" swirls on plaster, polka dots on floors; noise now in object space.
- Cascaded shadows without depth bias -> acne stripes on grazing members: lookdev scenes set
  `shadows: { bias: -0.0003, normalBias: 2.5 }`.

## Open issues / next
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
