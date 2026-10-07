# Creatures model-quality pass - progress notes (for a successor)

Owner paths: `scenes/lib/creatures/`, `scenes/lookdev/creatures-*.js` (+ creatures-dev.json).

## Done (this pass)
- Bashion (Charcoal) proportions: deeper heavier head (crown/brow, tapered reptile snout,
  visible nostrils), horns that read in silhouette (crown pair swept back over the neck,
  shorter pair behind the eyes, jaw spurs), thicker neck, body raised, longer heavier legs,
  more upright hind metatarsus, no dotted fold pits on the chest (axilla/stifle grooves off).
- Poses: standing neck carriage lower (no giraffe neck), folded wing sits high on the back
  (elbow above the back line, fingers back along the flank), flight leg tuck (forepaws folded
  back against the chest, hind legs trailing with flattened thigh muscles, toes curled).
- Skin shader: body scales are now a 3D rest-space anisotropic Voronoi mosaic
  (glsl.js `dkVor3`, smooth-F2 bead/plate profile, imbricate tilt toward the free edge,
  per-coarse-scale octave subdivision for size grading), sparse keeled tubercles (`dkTub3`),
  micro relief/pits on each scale, crevice dust fill, rubbed crowns; chain-coordinate layers
  kept only for dorsal scute rows and belly plates. skin.js smooths the scale tangent and the
  scale size across chain junctions, and takes the size from the smoothed chain radius.
- creatures-dev.js: `face` (yaw relative to the sun azimuth) per creature / per view.
- creatures-review.js: every hero shot for 1 s (fast review renders with --fps 1).

## Dev loop
`scratchpad/cr/dev.sh <cfg.json> <name> preview` copies the cfg to creatures-dev.json, renders
all views with --fps 1 and tiles them to output/cr/dev_<name>/sheet.jpg (frames in f/).
Lookdev HDRI sun (kloofendal, rotationY -1.2): azimuth -14.6 deg, elevation 48 deg.
`face: -95` lights the creature's LEFT side.

## Next
- eyes (lids, wet rim, catchlight, no glow), teeth/gums check, head labial scales
- wing membrane shading (dark, wrinkles, thickness, veins not lines) + fold drape check
- Leaf/Starlight (same Nightwing base), hatchling newborn, scout
- lookdev contact sheet + hero shots, 4K renders + crops, README
