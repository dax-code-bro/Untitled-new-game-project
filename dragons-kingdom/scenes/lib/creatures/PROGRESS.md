# Creatures model-quality pass - progress notes (for a successor)

Owner paths: `scenes/lib/creatures/`, `scenes/lookdev/creatures-*.js` (+ creatures-dev.json).
README.md in this folder is the full description of how the models are built; this file is
only the state of the work.

## Done (committed)
- Charcoal (Bashion): anatomy rework (heavy musculature, head, horns, tail, dorsal ridge), 3D
  Voronoi scale mosaic with size hierarchy, tubercles, dorsal scutes, belly plates, wear,
  scars, dust, damp; teeth, eyes with lids; flight leg tuck; folded-wing drape.
- Nightwings (Leaf, Starlight) share one species/base anatomy (age allometry only); no chest
  plates (plateZ); Starlight facets (no glow), warm pale underside; membranes with soft vessels.
- Hatchling: newborn proportions, soft low-relief scales, wet clearcoat film, amniotic residue.
- Scout: serpentine Slitherwing, detachable LEFT wing (+ wound), tumble in creatures-shots.js.
- Tack: trunk-skinned saddle (Leaf/scout) and riding rig with grab handle (Charcoal/Starlight).
- Lookdev: creatures-shots.js (hero shot module), creatures-hero/review/contact/lineup/dev,
  creatures-turntable-<name>.js.

## This session (resume after the second interruption)
- Rendered the current state (preview review: output/cr/rv0, 4K review: output/cr/rvF0).
- Membrane camber now SHADES: wing.js computes the rest-space gradient of the billow profile
  (aBGrad) and the membrane vertex shader tilts the normal by it (n' = n - grad h); camber
  scale raised to 0.04 L. Before: panels displaced but lit as flat sheets (cardboard look).
- Hatchling gold: metallic crowns (0.72) / grooves (0.4), roughness ~0.42 (broad sheen), deeper
  24k yellow base colour; residue lowers metalness. Before: ochre/mustard paint look.
- Scout wound: no scale relief inside, dark wet, ragged rim (was a red scaled "raspberry").
- creatures-shots.js: air shots over the FFT ocean (dk/ocean.js) instead of the tiled ground;
  scout shots carry the hooded scout rider; the wing-loss camera tracks the body/wing midpoint
  without the roll; Starlight-below reframed (~300 m away, 150 m up, 32 mm) with a stone
  watchtower (sets/buildings.js kit) for scale.

## Dev loop
`scratchpad/cr/rv2.sh <name> <shot ids|all> [preset] [cinematic]` renders chosen hero shots
through a temporary scene `scenes/lookdev/creatures-tmpreview.js` (delete it before commit).
`scratchpad/cr/dev.sh <cfg.json> <name> preview` renders free views via creatures-dev.json.

## Next
- check the new renders, then final 4K hero shots + contact sheet, 1:1 crops, README, npm test
