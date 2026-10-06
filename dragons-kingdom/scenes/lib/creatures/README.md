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
* `sit` - dog-like upright sit (haunches down, forelegs straight, chest up, tail laid on the ground);
  the wings use a separate fold: wrists raised beside the shoulders, fingers and membrane
  hanging down along the flanks (a gargoyle's folded wings)
* `lie` - resting on the belly (Charcoal in 1B/2C, the weak hatchling); `raise`/`headDown`
  set the neck carriage, `lidRelax` how far the lids rest over the eyes
* `flight` - flapping: downstroke 56% of the cycle, pronation on the downstroke,
  elbow/hand flexed on the upstroke, fingers spread on the downstroke, body lifted
  by each downstroke while the neck keeps the head steady, legs tucked,
  membrane camber (billow) from the stroke; `corr: 1` adds Leaf's uneven corrective beats
* `glide` - wings held with dihedral and small corrections; `bank` rolls the body,
  flexes the inner wing, the head counter-rolls, the tail steers
* `dive` - wings partly folded (Starlight's attack)
* `sit` takes `foldVariant`: `'sit'` (default: wrist raised beside the neck base,
  gargoyle-like) or `'sitFlank'` (wing folded flat along the flank, wrist below the
  shoulder, fingers back toward the haunch - use it when the wrist must not read
  as a raised arm); `wingComp` / `wingAdduct` tilt and tuck the folded wing
* common options: `look: [yaw, pitch]`, `eyes: [yaw, pitch]`, `jaw: 0..0.9`,
  `blink: false`, `lidClose`, `breathe` (breaths/s)

The scout's LEFT wing: `scout.detachWing(scene, worldMatrix)` moves the wing's
whole bone subtree (arm, fingers, membrane) out of the body so it can tumble
away; a wound mask appears on the left shoulder; `attachWing()` restores it.
`scenes/lookdev/creatures-shots.js` shows how to compute the tumble as a pure
function of `t` (pose at the tear time, then ballistic motion).

Lookdev scenes: `scenes/lookdev/creatures-turntable.js` (all shots) and the
faster `creatures-turntable-<name>.js` / `creatures-lineup.js` wrappers.

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
   * overlapping (imbricate) scales with analytic normals, per-scale size, tint,
     roughness and wear; belly plates; enlarged dorsal row; joint wrinkles;
     crevice dirt, patchy dust on the lower body, salt crust in crevices; wet
     oral interior. When a scale becomes smaller than a pixel its relief turns
     into extra roughness instead of shimmering (stable at 4K at any distance).
   * polygonal head plates (crocodile-like tiles, smaller on the snout tip and
     around the eyes) and the granular skin at joints are Voronoi tiles laid in
     the creature's rest space (three projections blended on the rest normal,
     so they do not depend on the chain coordinates, which pinch at the snout
     tip). Their bump uses the analytic tile gradient, not a screen-space
     derivative (no blocky 2x2-pixel stepping), and the tile size is quantised
     to half-octave levels that cross-fade (scaling rest positions by a smoothly
     varying size would smear the tiles into contour-line streaks).
   * Starlight: planar per-scale facets with low roughness and a polished
     clearcoat = silver, crystal-like glints from the sky, without any
     emission; a soft grey belly; white-grey membranes (no pink).
   * gold hatchling: the gold is a saturated dielectric (a golden gecko or
     chrysalis) with only a little metalness on the scale crowns, fleshy amber
     skin between the scales (`crevCol`), and a wet clearcoat that varies per
     pixel (streaks, drier patches) - it should read born, not cast.
   * Charcoal and Leaf: dry, dusty hide (roughness ~0.6) with dust and dried
     mud on the lower body, so the black hide shows soft sheen instead of
     lacquer; teeth stained ivory.
   * scale size per individual: `CREATURES.<name>.scaleMul` (or
     `createCreature(name, { scaleMul })`) shrinks the scales relative to the
     body - giants read immense when their scales are fine (Charcoal 0.6,
     Starlight 0.55); dorsal spikes vary in height, spacing, rake and lean,
     and about one in eight is broken or worn blunt.
   * wing membrane: veins, stretch creases, thickness near bones and at the
     hem, and thin-membrane TRANSLUCENCY - sunlight and sky light arriving from
     behind pass through (shadowed by the body, attenuated by veins); lit, never
     emissive. Camber (billow) from the wing stroke.
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
   bands and a grab handle - nobody straddles a 4.5 m wide back.

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
* Leaf's chest scutes are large, smooth, dark-seamed plates; at 4K they can
  read a little like a breastplate (they are scales, but the look should be
  checked against "no decorative armor").
* Eyes in a shaded socket read mostly as the wet reflection of the sky (the
  iris shows in close-ups with light on it, e.g. Leaf's eye macro).
* The hatchling's belly plates are large and dark-seamed (more like an adult
  crocodile's than a newborn's), and its head is still on the long side for a
  newborn.
* The velocity motion blur poses the scene at the shutter-open time before
  `update()` has set the shot's lens, so a still uses the previous lens state
  for its shutter (the runtime default, 180 degrees, for a single still). The
  turntable shots therefore hold the turntable angle for the whole frame
  instead of relying on a short shutter.
