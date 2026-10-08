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

- Later in the session: Leaf `scaleMul` 0.78 (finer scales, less "cobbled breastplate");
  sit pose hind legs re-angled (thigh along the flank, knee beside the elbow: no ball haunch);
  vessels in the membranes fainter (no drawn lines); Starlight's polish coat thinner/rougher
  (no chrome); Charcoal's dust darker (no pale paws in flight); propatagium narrower;
  mountRider() builds a grab bar at the rider's hands; Leaf flight shot at mid-downstroke;
  scout-bank without the rider (an adult hides the whole small scout), rider kept in the
  wing-loss shot; Starlight shot = ground camera, 40 mm, her at ~270 m beside a 27 m tower at
  the same distance, hedgerows/woods 0.4-2.5 km (sets/scatter.js) - she reads 8 towers wide.

## Dev loop
`scratchpad/cr/rv2.sh <name> <shot ids|all> [preset] [cinematic]` renders chosen hero shots
through a temporary scene `scenes/lookdev/creatures-tmpreview.js` (delete it before commit).
`scratchpad/cr/dev.sh <cfg.json> <name> preview` renders free views via creatures-dev.json.

## Renders of this session (git-ignored, under dragons-kingdom/output/cr/)
- `hero4k/png/<shot>.png` (+ `_1920.jpg`, `crop_*.png`): all nine hero shots at 4K, final finish.
- `rv_f2/`: 4K re-render of the six shots changed after that (charcoal-flight, leaf-flight,
  starlight-below, hatchling-macro, scout-bank, scout-wingloss).
- `contact4k/contact_sheet.jpg` (3840 wide) + `png/fNN.png` (4K): the 21-frame contact sheet;
  the hatchling views f13-f16 were re-rendered after the wet-film fix (`contact4k_h/`).

## Next
- Daxtyn's approved references (limb layout, horns, colours) -> adjust the provisional designs
- hatchling: shorter snout with the nostrils/egg tooth moved along; sit-pose wing fold
- humans domain: a narrower/prone straddle for the scout rider; the watchman's head
- runtime: frame time during sub-frame updates; SSAO on the clearcoat (see the report)
