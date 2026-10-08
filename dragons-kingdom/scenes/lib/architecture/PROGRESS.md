# Architecture kit - progress log (for a successor)

## State (2026-10-08, session 1)

Done (code in scenes/lib/architecture/, see README.md for the API):
- core.js (accumulators, rounded irregular blocks, lathe/tube/grid primitives, hard-edged
  sharp blocks), materials.js (stone variants incl. lime-washed / wet / far / sooty, mortar, oak
  with growth rings from the pith distance, plaster outdoor/indoor, clay tiles, stone slates,
  iron, leaded glass + portal interior mapping, flame, linen, straw, clayware, rope, leather).
- masonry.js: courses, faces, boxes with quoins, arches (also through-arches 'archOpen'),
  sills, packing; stone gables with coping + kneelers; round towers with corbel table +
  parapet; conical slate roofs; steps; LOD hero/mid/low/far.
- timber.js, roof.js, openings.js, house.js: framed storeys, jetties, gables, roofs with sag,
  chimneys, windows/shutters/doors, the Cling townhouse.
- cling.js: the square (CLING layout = shot list cling_map as staged in F5), house rows with an
  alley gap (closed by a house beyond), stone arch, gate, fountain, stone support, king's steps,
  wall-foot weeds placer, roof damage hook.
- verdor.js: stable, keepers' lodge (+ woodshed), Charcoal's access rig, Leaf's platform,
  palace (far LOD), harbour (wet/dry quay courses, projecting steps, bollards, rings, fenders,
  warehouses with hoist beams).
- interiors.js: birthing chamber (lime-washed stone, high arched opening for the sun shaft,
  oak door, beam ceiling, flags, nest with straw + linen, lamps, bench, bowls, jug, cloths,
  stool), treatment room (plastered walls, window with folded shutters, settle, stools, table,
  basin, jug, cloths, shelves); offline/nest_cloth.py bakes the nest linen with Blender cloth
  (cache/nest_cloth.json, git-ignored; procedural fallback when missing).
- Look-dev: scenes/lookdev/architecture-{cling,verdor,interiors,contact,dev}.js.

Regenerate the bake:  <bpy python> scenes/lib/architecture/offline/nest_cloth.py   (~1 min)

Final renders: written to the session scratchpad (not in git); paths in the agent report.
Next ideas: see "Open issues" in the report / README limits.
