# Creatures (Episode 1 dragons + rider placeholder)

Procedural, realistic dragon models for Dragon's Kingdom, built entirely in
code at scene setup (no downloaded creature assets), plus a human rider
placeholder made from the CC0 MakeHuman base mesh. **Every design here is
provisional** until Daxtyn sends approved references (see "Questions for
Daxtyn" below).

| creature | species / look | length (provisional) | wingbeat |
|---|---|---|---|
| `charcoal` | Bashion, melanistic black, immense, heavy | 35.8 m | 0.76 Hz |
| `leaf` | Nightwing, green, subadult (bigger head and eyes, shorter horns) | 8.0 m | 1.6 Hz + corrective unevenness |
| `starlight` | Nightwing, albino white, faceted crystal-like (NOT crystal, no glow) | 50.6 m | 0.64 Hz |
| `hatchling` | Bashion newborn, 24-karat-gold look, wet | 0.42 m | (does not fly) |
| `scout` | Slitherwing: long serpentine body, small head, narrow forward-set wings; LEFT wing detachable | 5.6 m | 2.6 Hz |

Lengths are the "on-screen area" reading from `episodes/s01e01/assets.json`
(`scale.readings`), snout to tail tip along the spine. Wingbeat tempo follows
the same file's rule of thumb (frequency ~ 1/sqrt(length)).

## Use

```js
import { createCreature, poses, loadHuman, createRider, createSaddle, mountRider } from './lib/creatures/index.js';

// setup(ctx)
const leaf = await createCreature('leaf', { quality: 'hero' });   // 'draft' | 'standard' | 'hero'
ctx.scene.add(leaf.root);
const human = await loadHuman();                                    // MakeHuman data (assets-lib)
const tack = createSaddle(leaf);                                    // saddle fitted to the back
mountRider(leaf, tack, createRider(human, { outfit: 'abby' }));     // rider follows every pose

// update(t, ctx) - everything is a pure function of t
leaf.setPose(poses.sit(leaf, { t, look: [0.3, 0.1] }));
leaf.root.position.set(x, 0, z);
```

Poses (`poses.js`, all pure functions of `t`):

* `stand` - wings folded, breathing, neck S-curve, idle head drift, automatic blinks
* `sit` - dog-like upright sit (haunches down, forelegs straight, chest up, neck carried
  forward in an S, tail curled round on the ground; the thigh lies along the flank with the
  knee forward beside the elbow, so the haunch reads as a folded leg - `hind: [thigh, knee,
  ankle, abduction]` overrides); the wings fold flat along the flanks
  (the fold is given in the world, so the pitched body never stands the wrist up like a
  raised arm)
* `lie` - resting on the belly (Charcoal in 1B/2C, the weak hatchling); `raise`/`headDown`
  set the neck carriage, `lidRelax` how far the lids rest over the eyes
* `flight` - flapping: downstroke 56% of the cycle, pronation on the downstroke,
  elbow/hand flexed on the upstroke, fingers spread on the downstroke, body lifted
  by each downstroke while the neck keeps the head steady, legs tucked,
  membrane camber (billow) from the stroke; `corr: 1` adds Leaf's uneven corrective beats
* `glide` - wings held with dihedral and small corrections; `bank` rolls the body,
  flexes the inner wing, the head counter-rolls, the tail steers
* `dive` - wings partly folded (Starlight's attack)
* `stand` / `lie` fold the wings the way a bird or a bat does: humerus back along the top of
  the back (the elbow just above the back line), forearm forward so the wrist sits beside the
  shoulder, fingers back along the flank; the membrane hangs in slack folds (drape.js).
  `foldVariant: 'high'` keeps the old gargoyle fold
* `flight` / `glide` tuck the legs: forelegs folded back against the chest, paws curled,
  hind legs trailing under the tail base with the thigh muscles flattened (bone scale) and
  the toes curled - no paws hanging down, no round haunches seen from behind
* common options: `look: [yaw, pitch]`, `eyes: [yaw, pitch]`, `jaw: 0..0.9`,
  `blink: false`, `lidClose`, `breathe` (breaths/s)

The scout's LEFT wing: `scout.detachWing(scene, worldMatrix)` moves the wing's
whole bone subtree (arm, fingers, membrane) out of the body so it can tumble
away; a wound mask appears on the left shoulder; `attachWing()` restores it.
`scenes/lookdev/creatures-shots.js` shows how to compute the tumble as a pure
function of `t` (pose at the tear time, then ballistic motion).

Lookdev scenes (`scenes/lookdev/`):

| scene | what |
|---|---|
| `creatures-hero.js` (= `creatures-turntable.js`) | every hero shot in sequence (shot list in `creatures-shots.js`): Charcoal 3/4 front in daylight with Remi, Charcoal's head, Charcoal flying side-on over the sea, Leaf sitting upright with Abby, Leaf flying with Abby (start of the downstroke, 90-degree shutter), Starlight gliding past a distant 27 m watchtower seen from the ground ~270 m away (a watchman points up; hedgerows and woods to the horizon), the hatchling macro on bedding, the scout banking over the sea, the scout (with its hooded rider) losing its LEFT wing |
| `creatures-turntable-<name>.js` | only one creature's shots (quicker builds) |
| `creatures-review.js` | every shot for 1 s at its representative moment - one build, `--fps 1` |
| `creatures-contact.js` | contact sheet: each creature on a turntable (4 views) under one neutral daylight sky, then a scale lineup with a person (t = 20; also `creatures-lineup.js`) |
| `creatures-dev.js` + `creatures-dev.json` | free views/poses for look development (`face` = yaw relative to the sun) |

The hero shots are lit by the photographed sky alone (kloofendal_48d_partly_cloudy with its
sun extracted; old_room's window light indoors for the hatchling), framed with a lens in mm
on Super 35, and finished with `finish.js` (8 sub-frames: supersampling + true motion blur,
print grade, grain). People come from `scenes/lib/humans` (cast builds) when its cache has
them, else the placeholder rider. Field shots get geometry grass laid out in log distance
from the lens. The air shots fly over the runtime's FFT ocean (`dk/ocean.js`, it follows the
camera) - the episode's flights and the pursuit are off the coast - instead of a tiled ground
plane. The Starlight shot borrows the set kit (`sets/buildings.js` tower, `sets/scatter.js`
clumps as hedgerows and woods 0.4-2.5 km out) only as scale references. Typical cost at native 4K on this machine: ~6-7 min per shot with the build
(Charcoal front: 6 min 44 s wall for one `--still`).

## How it is built (and why it looks the way it does)

1. **Skeleton + sculpt** (`anatomy.js`). One builder for all species, driven by
   preset proportions. The body is a signed-distance "sculpt": the spine is a
   chain of elliptical round cones following a cross-section profile (deep chest,
   tucked waist, tapering tail), plus muscle bellies (thigh, upper arm, flight
   muscles), bony landmarks (elbow, knee, hock, shoulder blades, hip bones),
   feet with toes. The head is lofted from side/top silhouettes and then
   sculpted: brow ridges, canthus ridges, cheek bones, jaw muscles, horn
   bosses, nostrils, eye sockets; the mouth is cut by a wedge whose apex is the
   jaw hinge, so the lips meet exactly when the jaw closes and the open mouth
   shows a palate, a floor and a tongue. Chains of one primitive type are
   hard-unioned before being blended (no blobby bulges). A little multi-octave
   noise is added to the distance field (no animal is a perfect blend of
   ellipsoids).
2. **Mesh** (`mesher.js`). Narrow-band surface nets on a *warped* grid: the head
   gets ~3x finer cells than the torso while the grid stays a single structured
   grid, so there are no cracks. Vertices are projected onto the iso-surface and
   use exact SDF normals.
3. **Skin** (`skin.js`). Skin weights come from the sculpt itself (every
   primitive belongs to a bone), smoothed over the mesh. Each vertex gets "chain
   coordinates" (along/around the spine, each leg, toe, wing arm, the skull and
   the jaw) with a constant number of scale columns around each chain - like a
   snake's fixed scale-row count - so the pattern wraps seamlessly and scales
   shrink where the body is thin. The wrap seam sits where it cannot read as a
   seam (under the belly plates, behind the limbs, under the toes). Where chains
   meet, and around the eyes, the skin turns into small granular scales, as on
   real lizards. Ambient occlusion is baked per vertex from the SDF.
4. **Materials** (`materials.js`, `glsl.js`) extend three.js' physically based
   materials (so sun shadows, HDRI lighting and the runtime's cinematic AO
   still apply):
   * **body scales are a 3D mosaic** (`glsl.js` `dkVor3`): cells seeded in rest space and
     sliced by the surface, so no two scales are alike and there are no seams or chain
     stretching; the metric is stretched along the body (scales a little longer than wide)
     and each scale tilts up toward its free edge (imbricate overlap). The profile uses a
     smooth second-nearest distance (no creases inside a scale): beads on the flanks (k=3),
     domed granules at the joints and round the eyes, flat plates with a rounded rim on the
     head. **Size hierarchy**: the size follows the chain's smoothed cross-section radius
     (big on the back and shoulders, small on the neck, snout, toes), the junction mask
     (granules where limbs meet the body, behind the limbs), and the eyes (fine granules);
     it grades in octaves where each coarse scale either stays whole or splits into four
     (decided per scale, so big and small scales meet along scale borders). On top: sparse
     keeled **tubercles** (osteoderms) on the upper flanks, neck and outer limbs (`dkTub3`),
     the big keeled **dorsal scutes** in rows along the spine and the **belly plates** (both
     in chain coordinates), joint wrinkles, and **micro relief** on every scale (pits,
     creases - `dkNoised` analytic gradient), faded out below a pixel. skin.js smooths the
     scale direction and size across chain junctions so the mosaic never tears there.
   * colour/roughness: every scale its own shade; rubbed, bleached keratin on the crowns
     (lighter and glossier); grooves rough, dark where occluded and dust-filled where open to
     the sky; dust held in the micro pits; dust and dried mud on the lower body and legs;
     damp patches; healed scars. On Charcoal that contrast (glossy crowns, matte dusty
     grooves) keeps the black hide readable in daylight.
   * Nightwings (Leaf, Starlight) and the hatchling have no plates on the chest (`plateZ`):
     the belly plates end behind the forelegs, the chest is scales (no breastplate read).
   * Starlight: albino white keratin, each scale a flat polished plate tilted its own way
     (`skin3.z` facets) - glints from the sky, never emission; only a thin, slightly rough
     polish coat (clearcoat 0.32 at roughness 0.24: the whole animal must not read as chrome);
     a faint warm flush in the grooves (thin skin), a warmer pale belly (not grey clay);
     white-grey membranes with soft vessels, translucency kept low.
   * scout wound (LEFT wing torn off): an open, dark, wet patch with a ragged rim and no scale
     relief inside; the wing tears off at the humerus (the flight-muscle mass stays on the
     back), so the torn wing ends in the arm, not in a ball joint. Kept small and dark: the
     screenplay wants the loss unambiguous without a close-up of the wound.
   * gold hatchling: reads as 24-karat gold through its tinted reflection - deep yellow gold
     (linear 1.0/0.64/0.16, not pale brass), metallic crowns (0.72) and less metallic soft
     grooves (0.4) at roughness ~0.55 (a broad sheen, no pin-point sparkle), very low scale
     relief (`amp` 0.035) and almost no micro relief (soft, not-yet-hardened scales, no
     embossed cells), a wet clearcoat film on the smooth geometric normal (broad wet
     highlights), streaks and drying patches, pale amniotic residue (non-metallic, slimy).
     The wet film is occluded by the runtime's screen-space AO (the runtime darkens diffuse and
     specular IBL but not the clearcoat; without this the film mirrored blue sky inside the
     crevice of the folded hind leg).
   * Charcoal and Leaf: dry, dusty hide (roughness ~0.6) with dust and dried
     mud on the lower body, so the black hide shows soft sheen instead of
     lacquer; teeth stained ivory.
   * scale size per individual: `CREATURES.<name>.scaleMul` (or
     `createCreature(name, { scaleMul })`) shrinks the scales relative to the
     body - giants read immense when their scales are fine (Charcoal 0.6,
     Starlight 0.55, Leaf 0.78); dorsal spikes vary in height, spacing, rake and lean,
     and about one in eight is broken or worn blunt.
   * wing membrane: leathery micro-texture (analytic noise creases in rest space, so the
     sheen breaks up), elastin striations in patches, mottling, darker thicker skin along the
     bones and at the hem, a satin (not mirror) sky reflection, vessels as a faint soft
     tracery (never drawn lines), and thin-membrane TRANSLUCENCY - sunlight and sky light
     arriving from behind pass through (shadowed by the body, attenuated by veins); lit, never
     emissive. Camber (billow) from the wing stroke, up to ~0.036 L between the fingers, and it
     SHADES: wing.js stores the rest-space gradient of the billow profile per vertex
     (`aBGrad`), the vertex shader skins it and tilts the normal by it (n' = n - grad h), so
     each panel lights as a curved sail instead of a flat sheet.
   * eyes: the iris is ray-traced through a refracting cornea (n = 1.376),
     vertical slit pupil, iris fibres, limbal ring, clearcoat wet reflection;
     eyelids are real geometry that blink and rest over the top of the eye.
   * horns/claws/spikes: keratin with growth ridges (in the geometry: horns are
     72 x 36 segments) plus fine growth lines and striations in the shader (bump
     from parametric derivatives, faded below pixel size), base-to-tip tone;
     teeth: enamel with gum-line staining.
5. **Rider + tack** (`rider.js`). MakeHuman CC0 base mesh with its default rig
   and weights (assets-lib/human/makehuman_base), posed by bone rotations
   (riding / standing), dressed by region. Remi: dark riding clothes, muted blue
   outer layer; Abby: muted sage-green outer layer (kept different from Leaf's
   olive); Queen Fall: dark fitted; the scout rider: hooded, unidentifiable, no
   markings. The saddle is fitted to the creature by sampling its distance
   field (seat follows the back, girth and breast straps follow the real body
   cross-section) and every strap vertex is skinned like the nearest body
   vertex, so the tack breathes and bends with the dragon. Giants (Charcoal,
   Starlight) get a "riding rig": a padded seat block strapped on with broad
   bands and a grab handle - nobody straddles a 4.5 m wide back. `mountRider()` also builds a
   leather-wrapped grab bar exactly where the seated rider's hands are, held by two straps
   from the pommel (a child of the rider, so it shows and hides with the rider).

## Limb layout (decided for the provisional designs) - QUESTION FOR DAXTYN

All three species are built **four legs + two wings** (a separate wing girdle
on the back, just behind and above the front shoulders, powered by a big
dorsal/pectoral flight-muscle mass). Reasons: the canon says Nightwings "can
sit upright like dogs" (that needs front legs), the screenplay speaks of
"limbs or wings", and Charcoal's takeoff "devastates the ground" (all four
feet push off). Wings are bat-like: humerus, forearm, wrist, a clawed thumb and
four long fingers carrying the membrane (propatagium in front of the arm,
chiropatagium between the fingers, plagiopatagium back to the flank and hip).
The layout lives in one place (`anatomy.js`), so switching a species to
wings-as-forelegs (wyvern) later is a contained change, but it must then stay
fixed for every shot ("no extra limbs", "no changing horns").

**Please confirm or correct:** Do Bashions, Nightwings and Slitherwings have
four legs plus wings, or are the wings their front legs? Also still open (from
assets.md): horn count and placement, eye colours (all provisional here:
Charcoal amber, Leaf yellow-green, Starlight pale pink-violet, hatchling amber,
scout pale yellow), the scout's colours and size relative to Leaf, whether a
Bashion hatches with visible wings, and which "size" reading to use.

## Cost (measured on this machine, 4 vCPU, no GPU)

Build in `setup()` (deterministic; Node and the browser give identical meshes),
measured in Node:

| creature | body mesh at `hero` | build time (hero) |
|---|---|---|
| Charcoal | 455k vertices / 905k triangles | 15.8 s |
| Leaf | 365k / 724k | 12.9 s |
| Starlight | 341k / 676k | 11.5 s |
| hatchling | 522k / 1.04M | 18.5 s |
| scout | 172k / 340k (+ separate left wing) | 6.1 s |

`standard` quality is about half the triangles and half the time; `draft`
about a sixth. Use `standard` (or `draft`) for creatures that are small in
frame; `hero` for close-ups.

Render: native 4K frames of the lookdev shots (hero meshes, cinematic stack
with GTAO, contact shadows, velocity motion blur, DOF and grain), one browser,
the runtime's `--timing` total per frame: Charcoal full-frame 10.8-11.7 s,
Charcoal head close-up 12.9 s, Charcoal flight 9.9 s, Leaf sitting with Abby
10.6-10.9 s, Leaf eye macro 15.4 s, Leaf flight 10.7 s, Starlight 7.2-7.7 s,
hatchling 12.5-13.5 s, scout 9.7-10.1 s, scale lineup 12.5 s. A still takes
20-60 s wall time including browser start and the hero build. The low
frequency skin noise is baked per vertex (`aNoise`, `aWarp`), which cut the
full-frame Charcoal frame from 20.5 s to about 12 s with no visible change.

Measured this session (all nine hero shots in one `creatures-review.js` job at `--preset
final` with the 8-sub-frame film finish, while other agents rendered on the same 4 vCPU:
load average 10-17): 9 frames in 44 min 19 s including a ~4 min build, i.e. about 4-5 min
per finished 4K frame under that load; the 21-frame contact sheet (`creatures-contact.js`,
no sub-frames) took 11 min 55 s. Review renders at `--fps 1` map the sub-frame offset to a
24 fps shutter, so the motion blur in them is what a 24 fps camera would record.

## Known limits (honest list)

* Designs are provisional and were judged only against my own sense of real
  animals (no approved references, no reference photos available here).
* Skin detail is procedural shading on a ~0.5-1 M triangle mesh: silhouettes
  of close-ups (the jaw line, toe tips) show smooth curves, not scale bumps.
* Folded wings are a rigid-skinned bunch of membrane, not a cloth simulation:
  they read as folded sails, not as soft crumpled skin.
* Linear blend skinning: extreme bends (the dog-sit hips, the tail laid on the
  ground) lose a little volume at the joint.
* The rider is an untextured MakeHuman body with region-coloured clothes:
  fine for wide/medium shots, not for close-ups (faces, hair and hands need the
  separate character work).
* The ground in the lookdev scene is a 2 m photo tile with anti-tiling; it is a
  neutral stage, not a set.
* Render cost of full-frame hero creatures at 4K (~10-15 s/frame) is high; for
  an episode, most creature shots should use `standard` meshes and the
  turntable's settings are lookdev settings, not production settings.
* Folded wings: the standing fold keeps the wrist beside the shoulder and the
  fingers along the flank, the sitting fold raises the wrists beside the
  shoulders (gargoyle-like). From the front a raised wrist with its finger
  bundle can read like a lifted arm, from some angles a standing wrist and
  thumb stick out in front of the chest, and the folded membrane reads as
  stiff panels.
* Leaf's chest is scales, not plates, and his scales are finer than before
  (`scaleMul` 0.78); seen straight on, the domed chest scales are still the biggest on his
  body (check against "no decorative armor" with Daxtyn's references).
* Eyes in a shaded socket read mostly as the wet reflection of the sky (the
  iris shows in close-ups with light on it, e.g. Leaf's eye macro).
* The hatchling's head is still on the long side for a newborn (shortening the snout
  loft alone left the nostrils and egg tooth as a knob past the tip - needs the snout
  features moved with it). Out of focus, the metallic body can still sparkle a little in
  the bokeh.
* Charcoal's propatagium (the membrane in front of the arm) is a straight-edged panel
  from the shoulder to the wrist; in the downstroke it sits in the shadow of the shoulder
  and reads as a dark rectangle beside the arm.
* Riders come from the humans library: the scout's hooded rider straddles a saddle made for
  wider backs, so on the slim scout the knees stand out wide (the bank shot is therefore
  shown without the rider); Abby's grab bar is placed at her hands in the rest pose (idle
  motion can move the hands off it by a few cm).
* The rest-pose AO bake cannot see crevices a pose creates (a thigh folded against the
  belly); the wet film is masked on undersides for that reason, the base layer still relies
  on the runtime's screen-space AO.
* The Starlight shot's countryside (bush clumps as hedgerows, a plain ground) is a stand-in
  for a real set; it only provides scale.
* The velocity motion blur poses the scene at the shutter-open time before
  `update()` has set the shot's lens, so a still uses the previous lens state
  for its shutter (the runtime default, 180 degrees, for a single still). The
  turntable shots therefore hold the turntable angle for the whole frame
  instead of relying on a short shutter.
