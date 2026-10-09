# Creatures model-quality pass - progress notes (for a successor)

Owner paths: `scenes/lib/creatures/`, `scenes/lookdev/creatures-*.js` (+ creatures-dev.json).
README.md in this folder is the full description of how the models are built; this file is
only the state of the work.

## Fix round 1 (session 5, after the critic + Daxtyn's DRAGONS.md decisions) - DONE
- No species: anatomy.js `DESIGNS.charcoal/leaf/starlight/hatchling/scout`, each its own preset
  (Leaf compact: short neck/tail, round deep skull, own horns, L 9.0 m = 25% of Charcoal;
  Starlight: broad heavy chest, long neck/tail, broad flat skull, horn crown, broad-chord
  wings). `CREATURES.<name>.design`; `SPECIES` export renamed `DESIGNS`; titles/comments clean.
- Approved looks (DRAGONS.md): Charcoal black (albedo ~0.012), BLUE iris, GRAY membrane with
  BLACK STRIPES (membraneMaterial `uStripe`), orange-red fire; Leaf dark green, YELLOW iris,
  LIGHT GREEN membrane, purplish-blue fire (fire.js palettes).
- Skin: flat-topped keeled imbricate scale profile per look (`vor`), narrow grooves; irregular
  belly scutes (glsl.js dkPlates) with a per-plate ragged border; smooth finger skin; soft neck
  creases (Starlight: none); limb-root junctions use the 3D mosaic (no chain-row pole fan).
- Wings: span ~1.9 L Charcoal / ~1.8 L Leaf / ~1.9 L broad Starlight / ~1.6 L narrow scout;
  plagiopatagium onto the thigh (bone hl_#_0); fingertip tension wrinkles; fold: wrist low by
  the shoulder, hand back along the flank, fingers a closed fan, the outer 44% of every finger
  doubled back at the knuckle (no rods past the hips / out in front of the chest).
- Starlight reflective (clearcoat 0.7 @ 0.08, crowns ~0.16, facet tilt 1.0, albedo 0.6); shot:
  cool fill from below + haze 3.2; flapHz 0.42.
- Hatchling: gold F0 metallic (0.8/0.42), granular head tier, no lid shells (eye in a soft
  skin socket; lid shells read as gold caps), dark eye with gold flecks + slit pupil, wings on
  the back (root raised, own fold), sprawled weak `lie` pose, straw nest + opened egg (props
  library) + mucus strands (creatures-shots.js updateStrands), near-neutral key + cool fill.
- Charcoal head: irregular crocodilian lip (lipCover 0.3), bigger nostril, heavier brow, horn
  burrs; Remi at Charcoal's depth; tail curled out sideways.
- fire.js (new): sprite jet + smoke + light, pure in t; lookdev shots charcoal-fire, leaf-fire.
- tack.js (new): 1400s saddle (wool cloth, padded seat on a tree, welt, cantle/pommel, girth +
  iron buckle, breast strap, stirrups) and giants' rig (timber frame on felt, seat + backrest,
  wooden grab bar, broad bands with buckles, foot boards); straps ignore the legs.
- Scout wing loss: torn ragged membrane (`uTear`), snapped finger, roll toward the LEFT, drop,
  nose-down, wing flung clear of the body; darker stump.
- Contact sheet: 24 frames (turntables, lineup, 3 spread-wing glide views).
- npm test 33/33 pass (run during this round).

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

## Session 3 (resume after the usage-limit stop)
- 4K render of the state as committed: `output/cr/s3hero/` (png/, _1920.jpg, crops).
- Leaf/Starlight: smaller scales on the lower flanks/chest/throat (`scl2.y` 0.55) and on the
  limbs (`limbScaleMul` 0.72): the chest no longer reads as cobbled plates/breastplate.
- Membranes: skin folds along every bone, stronger elastin striations, roughness patches,
  subtler micro creases (they read as felt), per-creature sky reflection `memSpec`
  (Charcoal 0.24 + memRough 0.52, Leaf 0.42 + 0.46); Starlight translucency lowered (no
  "glow"), scout translucency less saturated.
- Hatchling: snout shortened (`snoutMul` 0.76 in front of z 0.46; the jaw is now rotated
  rigidly in world space so the lips still meet; oral test undoes the mapping), fuller chin,
  thinner lips, thicker soft lids (lower lid reach 0.74), finer scales (`scaleMul` 0.72),
  softer grooves, wet film roughness 0.1 (no pin-point sparkle), smoother skin noise, residue
  a thin slime (not white flakes), amber claws.
- Charcoal: teeth spaced unevenly, darker stained enamel with a few dark old teeth; dorsal
  spikes rough weathered keratin; riding rig leather darker/rougher (no pale paper bag).
- Charcoal head close-up camera below the eye line (sky behind the head, not the flat field).
- Jaw tip: the chin plates and chain-row scales stop where the jaw turns granular (the rows
  converged at the tip and drew a swirl of stripes, seen in the 4K head close-up).
- README updated (scale grading, membranes, hatchling head, teeth, limits).
- After the 4K pass (`output/cr/s3final`, `output/cr/s3contact`): Charcoal's membrane darker
  (albedo 0.014) with a dimmer direct sheen (`memSpecD` 0.45; it read as a grey tarp), Leaf's
  membrane rougher (0.56, `memSpecD` 0.75: no satin streak), eyelid margins skin-toned, seat
  leather rougher/darker (grazing sky sheen made it pale), hatchling lids thin and inside the
  socket (thick shells stood off the domed head like coins: `lid.span` option), hatchling
  chin set back under the snout (`headShape.jawEnd` 0.84; the jaw tip poked out as a flap).
- Final 4K re-render of all hero shots + contact sheet: `output/cr/s4final` (png/<shot>.png,
  <shot>_1920.jpg, crop_*.png), `output/cr/s4contact` (png/fNN.png, contact_sheet.jpg,
  lineup_1920.jpg). 9 hero frames took 42 min (load ~10 from other agents), 21 contact frames
  13 min. npm test: 33/33 pass.
- `creatures-tmpreview.js` removed from git (rv2.sh writes it again when needed).

## Dev loop
`scratchpad/cr/rv2.sh <name> <shot ids|all> [preset] [cinematic]` renders chosen hero shots
through a temporary scene `scenes/lookdev/creatures-tmpreview.js` (delete it before commit).
`scratchpad/cr/dev.sh <cfg.json> <name> preview` renders free views via creatures-dev.json.

## Renders (git-ignored, under dragons-kingdom/output/cr/; older ones deleted for disk)
- `s4final/`: the nine hero shots at native 4K with the film finish - `png/<shot>.png`,
  `<shot>_1920.jpg`, `crop_*.png` (1:1 crops). This is the current state.
- `s4contact/`: the 21-frame contact sheet at 4K - `png/fNN.png`, `contact_sheet.jpg`
  (3840 wide), `contact_sheet_1920.jpg`, `lineup_1920.jpg` (frame 21, scale lineup).
- `s3hero/`: the 4K state at the start of session 3 (before this session's fixes), for comparison.
- `s3final/`: an intermediate 4K pass (1920 jpgs + crops only).

## Next (open)
- the hatchling's lids are still separate shells (a cap read at 4K); its closed mouth reads as
  a long dark crease - a sculpted lip fold that buries the line would help
- the groin fan of chain-row scales behind the thigh (small, in shadow in the hero shots)
- Charcoal's spread wing is the least detailed large surface in the flight shot
- Daxtyn's approved references (limb layout, horns, colours) -> adjust the provisional designs
- hatchling: shorter snout with the nostrils/egg tooth moved along; sit-pose wing fold
- humans domain: a narrower/prone straddle for the scout rider; the watchman's head
- runtime: frame time during sub-frame updates; SSAO on the clearcoat (see the report)
