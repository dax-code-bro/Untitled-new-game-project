# Architecture kit - progress log (for a successor)

## State (2026-10-08, session 1)

Done (code in scenes/lib/architecture/):
- core.js: seeded rng / noise, Acc + Kit geometry accumulators (one mesh per material per
  building or set), rounded irregular `block()` primitive (stones, beams, tiles, boards) with
  noise / pillow / chips / adze / wane / warp / baked occlusion, frames, tubes, shape faces.
- materials.js: procedural stone (per-stone colour, scan micro detail, lichen, moss, splash,
  algae), mortar, weathered oak (grain along the beam, checks, end grain), lime plaster
  (washes, repairs, cracks, flaking, grime), clay tiles / stone slates, iron, leaded glass with
  interior mapping, open-doorway portal (interior mapping), plain surfaces.
- masonry.js: coursed walls (ashlar / squared / rubble) with shared courses, quoins, dressed
  jambs, lintels, voussoir arches, sills, packing stones, mortar core with reveals; steps.
- timber.js: hewn members (bow, adze, wane), pegs, framed walls (posts, studs, braces cutting
  studs, rails, window framing), jetty joists, framed gables, plaster infill surface.
- roof.js: gable roofs (rafter tails, deck, clay tiles / diminishing stone slates, ridge tiles
  in mortar, bargeboards, sag), chimney stacks with sooty tops, pentice.
- openings.js: windows (frames, mullions, leaded glazing, shutters open / half / closed),
  doors (ledged boards, strap hinges, nails, ring handle, open/closed, arched), threshold.
- house.js: Cling townhouse (stone ground storey + jettied timber storeys + gable + roof +
  chimney, lean / sag).

Next: Cling square set (arch, gate, alley, fountain, steps, stone support, layout), Verdor
stable + access rig + keeper house, palace silhouette, harbor (quay, steps, buildings),
interiors (birthing chamber, treatment room), lookdev scenes architecture-*.js, 4K renders.

Dev scene: scenes/lookdev/architecture-dev.js (three-house row, 4 camera angles by second).
