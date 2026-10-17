# Creatures model-quality pass - progress notes (for a successor)

Owner paths: `scenes/lib/creatures/`, `scenes/lookdev/creatures-*.js` (+ creatures-dev.json).
README.md in this folder is the full description of how the models are built; this file is
only the state of the work.

## FIX ROUND 1 of the low stance (rev. 3b, 2026-10-17, after the critics) - IN PROGRESS
Dev loop (scratch): scratchpad/ep1p1/creatures-fr1/tools/ (copies of the creatures-low tools + arm.mjs: wing-arm joint
positions per pose; dev.sh, rv.sh <name> <ids|all> [preset], contact.sh, clear.mjs, build.mjs).
Done (code, committed):
- poses.js `plantBack`: the wing-arm folds BACK - upper arm back along the chest, elbow on the upper flank BELOW the
  back line, forearm sloping forward-down to the wrist pad ahead of the shoulder (LP.hum [out, up, back], reach,
  wristIn; per-dragon `stand.low.hum`). Used by the low stance (stand/walk/crouch/fire/land/launch), `sit`, `lie` and
  the newborn's sprawl. foldHand `levelK`: knuckles level, fingers stacked side by side (no deck-chair slats);
  `inwardJ` per-phalanx lean (a Z-fold was tried - too hidden, the wing vanished). Walk: the humerus swings with
  the wrist's step (pole only; the wrist lands exactly), wrists step in a forward-shifted range with a shorter
  stance (duty 0.55) so the elbow never rises above the back; Leaf's step 0.85 Hz.
- materials.js: Charcoal's membrane lighter neutral grey, canon black stripes ALONG the finger bones (stripeW),
  no between-bone bands (memX.w); membrane pleats when folded (memX.z); crease-network maze off for Starlight
  (memX.x 0) + low mottle; Leaf's membrane one value, less transmission; Starlight plates smoother, more facet
  tilt, clearcoat 0.8 + iridescence 0.3 (nacre), no dark outlines; Charcoal roughness spread; Leaf countershading;
  scout belly scutes; newborn wetter + more relief; the scout's wound torn flesh + blood running out.
- anatomy.js: scout tail 2.7 m (L 5.9), thicker, small thick vane; Charcoal horns a crescent with heavy taper and
  deeper saw-tooth rings (parts.js ringAmp); a real tongue; newborn horn buds longer.
- fire.js: domain-warped torn tongues, coherent turbulence field, surges (pulse-modulated sizes), cauliflower
  smoke; Leaf's light weaker. dust.js: subdivided lumpy turf clods (vertex colour), taller billowing dust wall.
- tack.js: the giants' rig without backrest board / grab-bar posts: leather skirt, cantle roll, pommel roll + loop.
- creatures-shots.js: + charcoal-level (level camera), leaf-abby = LOW crouch, + leaf-sit-alt (dog-sit, labelled
  the ALTERNATIVE for the open question), leaf-fire -> leaf-fire-lookdev (not Episode 1), head-in-mouth camera
  higher (Remi whole) and Leaf's wings folded, scout-wingloss closer/later/faster separation, takeoff 0.5 s later +
  downwash flattening of the grass (flattenGrass, pure in t). 20 hero shots.
- DESIGN.md rev. 3b (status bullet, 1.5, 1.5c + measured table).
Measured (stand, t=0, m): elbow Charcoal 5.30 (back 6.05; rev. 3: 7.85), Leaf 1.17 (1.35), Starlight 8.51 (9.16),
scout 0.77 (0.91). Walk: Charcoal's elbow 2.6-6.0 over the cycle.
NEXT: final 4K hero (output/dragons-low/fix1/hero, names *-fix1) + contact, crops, style frames at draft, npm test.

## LOW STANCE round (rev. 3, 2026-10-16, Daxtyn: "make them low to the ground with their legs more towards the center of their body") - DONE
Dev loop (scratch): scratchpad/ep1p1/creatures-low/tools/ (dev.sh <cfg.json> <name> = creatures-dev.js views -> r/dev_<name>/sheet.jpg;
build.mjs, clear.mjs (belly clearance / joint heights per pose), contacts.mjs, membox.mjs (membrane bounds), armdbg.mjs).
Done so far (code):
- anatomy.js: hip joint moved forward to trunk station `stand.hipS` (default 0.68, was 1.0 = the tail base): the legs hang
  under the middle of the body; the pelvis bone pivots there; belly mass, ilium crests, stifle fold and the membrane's flank
  point follow. Arm bones rebalanced again (humerus ~0.55 of the forearm, span unchanged: Charcoal 4.5 / 8.1 m) so the folded
  wing can stand elbow-high beside the withers with the wrist down under the shoulder at a LOW shoulder height. Starlight's
  legs -15% (4.9 / 5.9 / 3.2), Leaf's -8%.
- poses.js: `stand` = the LOW stance (chest underside at `belly` x chest depth, default 0.34; trunk ~level; feet under the
  middle; wrist pads + thumbs down under the shoulders; neck forward and low; tail low, outer half on the ground);
  per-design `stand.low` overrides. `upright` = alias of `stand` (retired). `crouch`, `fire`, `sit` (rump on the ground,
  wrists planted in front) rewritten; thumbs aimed forward along the ground (`aimThumb`).
- drape.js: inverse skinning by damped least squares (near-singular blends threw the membrane hundreds of metres in the walk).
- creature.js: the 'upright' drape variant dropped.
- Also: `walk` stance contacts move back at exactly the walking speed (the feet skated at speed/duty
  before); `land` rewritten as a low approach (short ~25 deg flare, feet under the middle, wrists down,
  wings fold) - no rearing; `sit` lower (chest ~30 deg); stance asymmetry + slow weight shift (stiff
  poses); Starlight scales smaller/flatter with light crevice AO (cobbles); newborn skull flatter,
  limbs slimmer, smaller yolk belly (toy look).
- Shots (creatures-shots.js): 17 = the 14 before + charcoal-walk, charcoal-rest, leaf-landing; the
  contact sheet has 29 frames (turntables in the low stance, + Leaf sit, Charcoal lying, crouch).
- DESIGN.md: rev. 3 status bullet, section 1.5c (the low stance), 1.1/1.6 updated, appendix A bones.
Results (all looked at at 1920 and as 1:1 4K crops; output/ is git-ignored):
- Hero: output/dragons-low/hero/{4k/*.png, 1920/*.jpg, crops/*.png, hero-sheet-low.jpg}, file names end in -low,
  17 shots (creatures-review.js, the SHOTS of creatures-shots.js), render 52m04s (~3.1 min/frame, SwiftShader, final preset), job video 58.6 MB.
- Contact: output/dragons-low/contact/{4k, 1920, crops, contact-sheet-low-3200.jpg, -1920.jpg}, 29 frames, 7m35s.
- Measured low stance (m, stand at t=0): Charcoal hip 4.15 / knee 3.31 / chest underside 1.59 (0.35 of chest depth) /
  back 6.08 / folded elbow 7.85 / head 6.79 (rev. 2 upright: hip 7.0, chest underside ~4.3, trunk +30 deg);
  Leaf 1.06 / 0.97 / 0.42 (0.44) / 1.37 / 2.17 / 1.62; Starlight 6.57 / 6.50 / 3.09 (0.51) / 9.18 / 14.90 / 11.16;
  scout 0.59 / 0.67 / 0.25 (0.37) / 0.92 / 1.31 / 1.12. Hip at trunk station 0.68 (shoulder -> tail base).
- Every scene importing the library renders at draft: style-f1 66s, f2 231s, f3 119s, f4 174s, f5 444s,
  humans-riders 72s, architecture-probe 14s. F2 (Abby at Leaf's breast strap) needed no re-staging.
  npm test 33/33 (207 s).
OPEN (seen in the 1:1 crops, not fixed this round):
- Starlight: plates still read as a polished pebble mosaic in close-ups (starlight-rider); soft large blotches on the
  top of the membrane; the folded elbow "cloak" stands ~5 m above her back.
- Charcoal's chest scales read as paving slabs at 1:1; folded membrane shows angular grey panels near the hip in walk.
- Newborn: a flat drape sheet of folded membrane on the flank under the arm (contact 13 crop); still a bit plump at
  full-body scale.
- leaf-landing: heavy motion blur on the wings at the flare hides the fold.
- Transitions are kinematic (stand <-> walk <-> launch are pose blends), ground is assumed flat (no foot IK on slopes).

## Fix round 1 after the critics (2026-10-15, DESIGN "rev. 2") - state
Done (committed; renders under output/dragons-wyvern/fix1/, git-ignored, file names end in -fix1):
- TWO LEGS: new resting stance `poses.upright` (trunk raised 30-34 deg, feet ahead of the hips,
  tail level then laid on the ground, wings folded off the ground by `foldUp`); Leaf's `sit` keeps
  the wings folded (`plantWrists: true` for the old dog-forelegs version); `fire` stands on two legs.
  `stand` (wing-walk) stays the base of walk / crouch / launch / land. Contact sheet + charcoal-front
  + charcoal-head use `upright`. New drape variant 'upright' (creature.js).
- Arm bones rebalanced (humerus ~0.75 of the forearm, span unchanged) so the fold is compact;
  forearms taper to a narrower wrist. DESIGN 0 / 1.1 / 1.5b and appendix A updated.
- Armpit "hole" (Starlight): skin weights kept within their part (skin.js 2b), AO baked per part,
  minimal-twist arm IK (`armIK(..., minTwist)`), double-sided skin, relief faded where skinning
  compresses the skin (materials.js dkComp), an axillary web in the sculpt. A small dark crease can
  remain under a fully folded arm. Diagnostics: tools/flip.mjs (inverted triangles per pose),
  tools/stretch.mjs (stretched edges per pose), creatures-dev.json `debugBones` / `debugAttr` /
  `hideMembranes` / `hideParts`, pose `sculpt`.
- rev. 2b (after the first -fix1 4K pass): the hard body/limb weight seam left by 2b opened into a
  metres-tall "curtain" of stretched triangles at the shoulders and hips whenever the arm swung far
  from the sculpt (glide, dive, sit; worst on Starlight). skin.js 2c feathers the seams (Jacobi
  relaxation in a band 0.03 L either side). stretch.mjs, Starlight draft: edges > 15x the median
  edge glide 836 -> 2, sit 671 -> 0; Charcoal glide -> 0; flipped triangles in `upright` fell too
  (Starlight 499 -> 386, all in the elbow/wrist folds). Horn paths start inside the skull (no open
  sheath rim at the skin). Fire: young tongues get 0.8x gain (1.3x further out) and a more
  saturated core - the near-mouth jet is pale orange, no longer cream-white, and still starts at
  the lips. starlight-rider camera further off. Final renders (all looked at, 1920 + 1:1 4K
  crops): output/dragons-wyvern/fix1b/hero/{4k,1920,crops}/*-fix1b.* (14 shots via
  creatures-review.js, 36m58s render) and fix1b/contact/{4k,1920,crops} + contact-sheet-fix1b-*.jpg
  (27 frames, 7m02s). The -fix1 hero set in fix1/ still shows the curtain - compare
  starlight-rider and pair-flight. npm test 33/33 after the code changes.
- Materials: Charcoal blacker (rougher, little crown polish), neutral grey membrane with softer
  wavy stripes, steel-blue iris with flecks; Leaf darker green, duller membrane, olive-brown horns;
  Starlight broad flat plates (scaleMul 0.5, hairline joints, little micro relief); newborn yellow
  gold (more pigment, less metal, gold belly); transverse ventral scutes (glsl.js dkPlates);
  folded-membrane wrinkle is band-limited noise (no sine moire).
- Heads/horns: Charcoal's horns swing out clear of the neck, no burr collars, broken tip = rough
  fracture; bigger croc teeth, thin gums, slit nostrils; Leaf no jaw lobe; scout horns laid back;
  Starlight horn bases 0.28-0.4 m; newborn short snout, big eye, overbite, no lip ridge.
- Effects/staging: fire palettes (orange-red; violet-blue under the tone curve's shoulder), embers,
  two fire lights, puffs kept above the ground; take-off clods on a power law + skidding, dust dome,
  bigger craters/furrows, earlier frame (vault); head-in-mouth seen square on to Charcoal's head with
  Leaf's whole head inside (hold 0.5 rad, snout 1.85 m in), Leaf's wings half folded; Queen Fall
  rides Starlight (dive + new shot `starlight-rider`); scout rider crouched (lean 1.0); stirrups
  under the riders' feet (rider.js addStirrups; the saddle's own pair hides while mounted); scout
  wing loss: the propatagium root tears away with the wing (`w_L_mp`), camera from behind, 60-deg
  shutter; scout tail vane without surface noise.
- Contact sheet: 27 frames (adds Charcoal walking on feet + wrists, Leaf standing on two legs).
- NEXT (not done): the newborn's mouth still reads a little lip-like; Starlight's folded wing is a
  bundle of pale rods with flat folded membrane; membranes in flight still lack visible veins and a
  hem; flattened grass under the take-off; style frames (not owned) still use `stand`/`sit` and now
  get the new sit fold and arm proportions - their compositions were not rechecked at 4K.

## Wyvern rework (2026-10-14/15, Daxtyn: TWO legs, wings = front limbs, horns; DESIGN.md)
State (all committed; latest renders listed in README / the report):
- DONE anatomy.js: `DESIGNS` = DESIGN appendix A in metres (+ build extras: `body` muscle/fat,
  `bulk` limb mass, `fold.curl`, `headX`, `folds`, `crest`, `stand` incl. `tailSag`). REST pose =
  glide planform (membranes + finger tubes bound there); SCULPT pose = standing legs (2-bone IK,
  feet at `dims.footX` = max(1.06 hipX, 0.62 toeL) so the inner toes never meet) + half-folded
  wing-arms (body and solids bound there); `sculptLocal` maps rest -> sculpt. Helper bones
  w_#_sh / hl_#_h. Head lofted from the design table; horns as spline paths.
- DONE kin.js, creature.js (two skeletons share the bones), wing.js, pose.js (helpers, grounding),
  drape.js (stand/sit/lie/crouch drapes), dust.js (take-off dust, clods, scars).
- DONE poses.js (IK): rest, stand (tail hangs in an arc, end on the ground: `tailSag`), walk,
  rear, sit, crouch, lie (+sprawl), pushUp, struggle, fire, flight, glide, dive (legs drawn in,
  feet clenched), strike, sprint, mouthHold, launch, land, blend, contactsOf. Flight/glide: legs
  drawn together under the tail, toes clenched (negative x flexes toes toward the sole).
- DONE rev. 1 after the first full renders (DESIGN 0 lists it): deeper/broader Charcoal skull,
  neck narrower behind the jaws, thicker horn bases, thicker legs on Charcoal and Starlight,
  blunter newborn snout (no hanging lobes: soft heads skip the retroarticular process, masseter
  scaled), shallow nostrils (deep subtractions showed the sky through), eyes seated with more
  eyeball showing (`eyeExpose` 62 adults), dull rough horn keratin per dragon (`hornR`),
  Starlight's membrane ivory with a rose flush against the light.
- DONE rider.js `fitStraddle`: abducts the humans-library rider's thighs until knee/shin/boot
  clear the trunk SDF (+0.1 m), then brings the shin back along the flank; re-applied after every
  rider.update(). (Stirrups still hang where the tack put them.)
- DONE lookdev: creatures-shots.js 13 shots (pair flight is now an air-to-air chase camera),
  creatures-contact.js (5 turntables, lineup with a level camera, 4 glide views = 25 frames).
- Checked: every scene that uses the library (style-f1..f5, humans-riders, architecture-probe)
  renders without errors at draft (stills in scratch). F4's framing now has the bigger newborn
  head filling the left of frame (composition is the style frame's, not changed here).
- Dev loop (scratch, not committed): dragons2/tools/dev.sh <cfg.json> <name> (creatures-dev.js
  views), rv.sh <name> <ids|all> [preset] (shots through a temp scene, deleted after),
  contact.sh <name> (contact sheet), build.mjs (Node build + every pose), headdepth/headprof.mjs
  (SDF head measurements), toes.mjs, bar.mjs.
- DONE final native 4K renders (2026-10-15 ~03:10 UTC, git-ignored): output/dragons-wyvern/hero/4k/<shot>.png
  (13 shots), hero/1920/*.jpg downscales, hero/crops/*.png (1:1 crops), hero/hero-sheet.jpg;
  contact/4k/NN-<name>.png (25 frames), contact/contact-sheet-4k.jpg, contact/crops/*.png. Also after
  the final review: islands dropped in mesher.js (a stray lobe under the newborn's jaw), newborn
  without masseter bulge / lip ridge, keratin tubes capped with a dome at blunt ends (the broken left
  horn read as an open tube), lower horn burrs, Charcoal's horns and membrane a little darker.
- npm test 33/33 pass (180 s, after the last code change).
- NEXT (ideas, not started): stirrups that follow the fitted rider foot; Leaf's sit haunch
  visibility; a real contact solver for the head-in-mouth; uneven-ground IK targets.

## (before the wyvern rework)
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
  doubled back at the knuckle (the long rods past the tail root and the wrist in front of the
  chest are gone; the folded fingers still stick out a little behind the thigh as smooth tubes
  with blunt ends - see Next).
- Starlight reflective (clearcoat 0.7 @ 0.08, crowns ~0.16, facet tilt 1.0, albedo 0.6); shot:
  cool fill from below + haze 3.2; flapHz 0.42.
- Hatchling: gold F0 metallic (0.8/0.42), granular head tier, no lid shells (eye in a soft
  skin socket; lid shells read as gold caps), dark eye with gold flecks + slit pupil, wings on
  the back (root raised, own fold), sprawled weak `lie` pose, straw nest + opened egg (props
  library) + mucus strands (creatures-shots.js updateStrands), near-neutral key + cool fill;
  macro camera low at the side (3/4 profile: snout, jaw, eye) - the high front view had
  foreshortened the head into a dome.
- Charcoal head: irregular crocodilian lip (lipCover 0.3), bigger nostril, heavier brow, horn
  burrs; Remi at Charcoal's depth; tail curled out sideways.
- fire.js (new): sprite jet + smoke + light, pure in t; lookdev shots charcoal-fire, leaf-fire.
  The jet leaves from between the front teeth with a short fade-in (the first 4K pass showed
  the fire starting in the air a head-length in front of the mouth).
- tack.js (new): 1400s saddle (wool cloth, padded seat on a tree, welt, cantle/pommel, girth +
  iron buckle, breast strap, stirrups) and giants' rig (timber frame on felt, seat + backrest,
  wooden grab bar, broad bands with buckles, foot boards); straps ignore the legs.
- Scout wing loss: torn ragged membrane (`uTear`), snapped finger, roll toward the LEFT, drop,
  nose-down, wing flung clear of the body; darker stump.
- Contact sheet: 24 frames (turntables, lineup, 3 spread-wing glide views).
- npm test 33/33 pass (299 s wall, run after the last code change of this round).

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
- `s5final/`: the eleven hero shots of fix round 1 at native 4K with the film finish -
  `png/<shot>.png`, `<shot>_1920.jpg`, `crop_*.png` (1:1 crops). This is the current state.
  Shots: charcoal-front, charcoal-head, charcoal-flight, leaf-abby, leaf-flight,
  starlight-below, charcoal-fire, leaf-fire, hatchling-macro, scout-bank, scout-wingloss.
  (All from the current code: the three Charcoal shots were re-rendered in a 6-shot pass, the
  two fire shots after the fire-origin fix and the hatchling after its camera change.)
- `s5contact/`: the 24-frame contact sheet at 4K under the neutral daylight HDRI -
  `png/fNN.png`, `contact_sheet.jpg` (3840 wide), `contact_sheet_1920.jpg`, `lineup_1920.jpg`
  (frame 21, scale lineup), `glide_f22/23/24_1920.jpg` (Charcoal / Leaf / Starlight spread).
- `s4final/`, `s4contact/`: the state before fix round 1, for comparison.

## Next (open)
- folded wing seen from the side: the doubled-back fingers still read as parallel smooth tubes
  with bare knuckle ends, and the pleated membrane between them can moire at 4K
- Charcoal's neck scales still read a little like pavers (flat crowns, even grout)
- Leaf's head is cute rather than fierce in close-up (round skull + big eye); a harder brow /
  cheek would help if Daxtyn wants her older-looking
- Starlight: approved look not yet given; she reads silvery / porcelain at close range.
  Her size (50.6 m, bigger than Charcoal) is an open question in DRAGONS.md
- hatchling: still partly reads as a gold casting at macro distance; the wing arm shows as a
  small rod on the back; the closed mouth is a long crease (a sculpted lip fold would help)
- tack: straps sit on the hide without compressing it; no stitching normal detail
- humans domain: a narrower/prone straddle for the scout rider; the watchman's head
- runtime: 8-subframe ghosting on fast wing beats; SSAO on clearcoat; fire sprites carry no
  velocity for motion blur (see the report)
