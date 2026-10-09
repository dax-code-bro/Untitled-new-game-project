# Creatures (Episode 1 dragons + rider placeholder)

Procedural, realistic dragon models for Dragon's Kingdom, built entirely in
code at scene setup (no downloaded creature assets), plus a human rider
placeholder made from the CC0 MakeHuman base mesh. **Every design here is
provisional** until Daxtyn sends approved references (see "Questions for
Daxtyn" below).

Daxtyn scrapped the species (Bashion / Nightwing / Slitherwing) on 2026-10-09
(`DRAGONS.md`, the authoritative design file): **every dragon is its own design** with its own
preset in `anatomy.js` `DESIGNS` - its own proportions, skull, horn set, limbs and wings. Leaf
and Starlight no longer share a body.

| creature | design (approved = from DRAGONS.md) | length | wingbeat |
|---|---|---|---|
| `charcoal` | **approved:** completely black scales, BLUE eyes, GRAY wing membrane with BLACK STRIPES throughout, standard orange-red fire. Provisional: immense, heavy, calm; horns, head, tail | 35.8 m (provisional) | 0.62 Hz |
| `leaf` | **approved:** about 25% of Charcoal's size, DARK GREEN scales, YELLOW eyes, LIGHT GREEN membrane, purplish-blue fire (hotter). Provisional: compact not-fully-grown build (short neck and tail, round deep skull, big eyes), own horns, the dog-like upright sit (an open question now that species are gone) | 9.0 m (25% of Charcoal) | 1.4 Hz + corrective unevenness |
| `starlight` | from the screenplay: albino, reflective crystal-like white scales (NOT crystal, no glow). Provisional: broad heavy chest, long neck and tail, broad flat skull, a crown of horns, broad-chord wings | 50.6 m - **OPEN QUESTION**: the screenplay says "about twice Charcoal's size"; 50.6 m is 1.41x his length (~2.8x his mass). If Daxtyn means twice the length she is ~72 m | 0.42 Hz |
| `hatchling` | from the screenplay: looks like 24-karat gold, newborn, wet and weak, no glow. Provisional: newborn proportions, tiny damp wings | 0.42 m | (does not fly) |
| `scout` | from the screenplay: small, extremely fast, loses its LEFT wing. Provisional: long serpentine body, small head, narrow swift wings; LEFT wing detachable | 5.6 m | 2.6 Hz |

Lengths are snout to tail tip along the spine. Wingbeat tempo ~ 1/sqrt(length), slowed for
Starlight so the giant reads heavy.

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

Fire (`fire.js`, pure in `t`; only on the "Fire" command):

```js
import { createFire } from './lib/creatures/index.js';
const fire = createFire({ palette: 'standard', length: 26, width: 7 });   // 'standard' (Charcoal) | 'leaf'
scene.add(fire.group);
fire.update(t, { creature: charcoal, on: 1, start: tFire });   // aims at the open mouth
```

The jet is camera-facing flame sprites (additive, HDR, stretched along the flow, ragged and
flickering from two octaves of moving noise; hottest at the mouth: core -> body -> edge colour as
it cools), a trail of smoke sprites and a flickering point light a third of the way down the jet.
Palettes: `standard` - yellow-white core, orange body, red tongues, dark sooty smoke;
`leaf` - blue-white core, blue body, violet fringe, ~12% shorter flame life (hotter), less and
paler smoke. Nothing on a dragon's body glows.

Poses (`poses.js`, all pure functions of `t`):

* `stand` - wings folded, breathing, neck S-curve, idle head drift, automatic blinks
* `sit` - dog-like upright sit (haunches down, forelegs straight, chest up, neck carried
  forward in an S, tail curled round on the ground; the thigh lies along the flank with the
  knee forward beside the elbow, so the haunch reads as a folded leg - `hind: [thigh, knee,
  ankle, abduction]` overrides); the wings fold flat along the flanks
  (the fold is given in the world, so the pitched body never stands the wrist up like a
  raised arm)
* `lie` - resting on the belly (Charcoal in 1B/2C, the weak hatchling); `raise`/`headDown`
  set the neck carriage, `lidRelax` how far the lids rest over the eyes; `sprawl: 1` lays the
  legs out splayed to the sides (the newborn is too weak to tuck them under)
* `flight` - flapping: downstroke 56% of the cycle, pronation on the downstroke,
  elbow/hand flexed on the upstroke, fingers spread on the downstroke, body lifted
  by each downstroke while the neck keeps the head steady, legs tucked,
  membrane camber (billow) from the stroke; `corr: 1` adds Leaf's uneven corrective beats
* `glide` - wings held with dihedral and small corrections; `bank` rolls the body,
  flexes the inner wing, the head counter-rolls, the tail steers
* `dive` - wings partly folded (Starlight's attack)
* `stand` / `lie` / `sit` fold the wings the way a bat does: humerus back along the top of the
  flank, forearm forward and down so the wrist sits LOW beside the shoulder, the hand back along
  the flank, and every finger folded at its knuckle (56% of its length) so the outer part doubles
  back along the inner part (`CREATURES.<name>.fingerFold`, default [2.85, 0.2] rad): the folded
  hand is about as long as the forearm, no finger rods reach past the hips or stick out in front
  of the chest; the membrane hangs in slack folds (drape.js). `foldVariant: 'high'` keeps the old
  gargoyle fold
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

1. **Skeleton + sculpt** (`anatomy.js`). One builder for every dragon, driven by
   each dragon's own design preset (`DESIGNS`). The body is a signed-distance "sculpt": the spine is a
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
   * scale profile per look (`vor`: dome exponent, keel, groove width, tilt): the body scales are
     FLAT-TOPPED, imbricate plates with a keel down the middle (dome exponent 5-8, not 3), so the
     sky reflects in broad bands across many scales instead of one highlight per bead (domed
     beads read as ceramic or cobblestone and turned black Charcoal blue-grey); granular beads
     only at the joints and round the eyes.
   * belly scutes (`glsl.js` dkPlates) are not graph paper: rows of uneven length, seams that bow
     back toward the sides, per-row column widths and stagger, plates narrowing toward the
     flanks, scratches; the border with the flank scales is decided per plate (ragged along
     plate edges, no ruled line).
   * wing fingers have smooth thin skin with soft transverse creases (no body-scale tier: scaled
     fingers read as rope or scaly tubes).
   * Leaf, Starlight and the hatchling have no plates on the chest (`plateZ`):
     the belly plates end behind the forelegs, the chest is scales (no breastplate read).
     On Leaf and Starlight the scales also get smaller down the flanks, over the chest and the
     throat (`scl2.y` 0.55: from about 40% of the way round from the dorsal midline) and on
     the limbs (`CREATURES.<name>.limbScaleMul` 0.72, which sets the limb chains' scale
     unit, so the junction smoothing still grades body into limb) - as on a monitor's chest;
     the big cushions on the chest and upper arm read as plate armour.
   * Starlight: REFLECTIVE albino white keratin (albedo ~0.6 with faint warm/cool variation),
     each scale a flat, hard plate tilted its own way (`skin3.z` 1.0 facet tilt, flat-topped
     profile) under a polish coat (clearcoat 0.7 at roughness 0.08) on a satin base (roughness
     ~0.16): the sun breaks into many small glints and the sky into a mosaic of reflections -
     never emission; crevices only a little darker than the scales (no plaster-cast AO); pale
     grey-white membranes with a silver sheen, vessels only as soft tracery, little light
     through them (no glow). Her lookdev shot adds a cool fill from below (the bright sky dome
     and the haze round a flyer light its underside) and heavier aerial haze.
   * scout wound (LEFT wing torn off): an open, dark, wet patch with a ragged rim and no scale
     relief inside; the wing tears off at the humerus (the flight-muscle mass stays on the
     back), so the torn wing ends in the arm, not in a ball joint. Kept small and dark: the
     screenplay wants the loss unambiguous without a close-up of the wound.
   * gold hatchling: reads as 24-karat gold through its METALLIC reflection - gold's own F0
     (linear ~1.0/0.77/0.34; the earlier orange albedo read as brass, bronze or copper),
     metallic crowns (0.8) and less metallic soft grooves (0.42) at roughness ~0.34, a
     near-neutral key and a cool fill in its shot (warm light alone turns gold copper), a fine
     granular scale tier on the head (`headRelief`: no smooth blob), a dark wet eye with gold
     flecks in the iris and a slit pupil (`fleck`, `pupil`), fine lid granules (`lid.gran`) (a broad sheen, no pin-point sparkle; the wet film does
     not sharpen the base much), very low scale relief (`amp` 0.03), fine scales
     (`scaleMul` 0.72), soft pale-gold grooves instead of dark seams, almost no micro relief
     (soft, not-yet-hardened scales, no embossed cells), a wet clearcoat film on the smooth
     geometric normal at roughness 0.1 (`wetRough`: broad wet highlights - a mirror film broke
     the window's reflection into sparkle on the soft lumpy skin), streaks and drying
     patches, a thin translucent amniotic slime in patches (soft sheen, not white flakes),
     amber newborn claws and egg tooth (not white). Newborn head: the snout is shortened
     (`headShape.snoutMul` 0.76 in front of `snoutZ0` 0.46 - every snout feature, nostrils,
     lips, egg tooth, moves with it; the lower jaw is built closed and rotated rigidly about
     the hinge in world space, so the lips still meet), a full rounded chin set back under the
     overhanging snout (`headShape.jawEnd` 0.84: a newborn's overbite), thin lips, thin lids
     that sit inside the socket (`lid` rIn/rOut 1.03/1.09, `span`, `reachL`: thick lid shells
     stood off the domed head like coins).
     The wet film is occluded by the runtime's screen-space AO (the runtime darkens diffuse and
     specular IBL but not the clearcoat; without this the film mirrored blue sky inside the
     crevice of the folded hind leg).
   * Charcoal and Leaf: dry, dusty hide (roughness ~0.6) with dust and dried
     mud on the lower body, so the black hide shows soft sheen instead of
     lacquer; teeth stained ivory (Charcoal's darker and yellower, a few old dark ones),
     spaced unevenly along the jaw (shed and replaced one by one - never a comb), varied in
     size, curve and lean, a few missing, broken or half-grown, set in gums; dorsal spikes are
     rough weathered keratin (no polished saw teeth).
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
     each panel lights as a curved sail instead of a flat sheet. The skin gathers in a few
     soft folds along every bone (fading a hand's breadth from it), the sheen breaks into
     glossier and drier patches, and the micro creases are kept subtle (stronger, the
     membrane read as felt). How much sky each membrane reflects is per creature (`memSpec`:
     Charcoal's melanistic membranes 0.24 at roughness 0.52, so they are as dark as his hide,
     not a grey sheet; Leaf 0.42 at 0.56) and how much direct sun sheen (`memSpecD`: Charcoal
     0.45 - in full sun a black membrane at roughness ~0.5 read as a pale grey tarp - Leaf
     0.75); Charcoal's membrane albedo is 0.014 (pigmented through).
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

Every dragon is built **four legs + two wings** (a separate wing girdle
on the back, just behind and above the front shoulders, powered by a big
dorsal/pectoral flight-muscle mass). Reasons: Leaf "can sit upright like a dog"
in the screenplay (that needs front legs; now an open question in DRAGONS.md), the screenplay speaks of
"limbs or wings", and Charcoal's takeoff "devastates the ground" (all four
feet push off). Wings are bat-like: humerus, forearm, wrist, a clawed thumb and
four long fingers carrying the membrane (5 digits, as in a bat: propatagium in front of the
arm, chiropatagium between the fingers with a scalloped trailing edge, plagiopatagium back along
the flank and down onto the THIGH, skinned to the thigh bone, with a concave free edge). Spans:
Charcoal ~1.9x his length (wingtip 0.91 L out from the root), Leaf ~1.8x, Starlight ~1.9x with a
broad chord, the scout ~1.6x with a narrow swift's planform. Charcoal's membrane is grey with
black stripes (`stripe`: noise-warped bands concentric about the shoulder, swelling, pinching
and breaking like an animal's pattern; the pigment also blocks the light through the skin).
The layout lives in one place (`anatomy.js`), so switching a dragon to
wings-as-forelegs (wyvern) later is a contained change, but it must then stay
fixed for every shot ("no extra limbs", "no changing horns").

**Please confirm or correct:** do the dragons have four legs plus wings, or are the wings their
front legs? Also still open: horn count and placement for every dragon, Starlight's and the
hatchling's and the scout's eye colours (provisional: Starlight pale pink-violet, hatchling dark
bronze with gold flecks, scout pale yellow), the scout's colours and size, whether the hatchling
has visible wings, Starlight's size (51 m = 1.41x Charcoal's length vs "about twice his
size"), how the stripes run on Charcoal's wings, and whether Leaf still sits upright like a dog.
Approved and built (DRAGONS.md): Charcoal black / blue eyes / grey membrane with black stripes /
orange-red fire; Leaf 25% of Charcoal / dark green / yellow eyes / light green membrane /
purplish-blue fire.

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

* Designs are provisional except what DRAGONS.md approves (Charcoal's and Leaf's colours,
  membranes, eyes and fire; Leaf's size), and were judged only against my own sense of real
  animals (no approved references, no reference photos available here).
* Skin detail is procedural shading on a ~0.5-1 M triangle mesh: silhouettes
  of close-ups (the jaw line, toe tips) show smooth curves, not scale bumps.
* Folded wings are skinned bones + a one-time position-based drape of the membrane (drape.js),
  not a full cloth simulation with self-collision: the doubled-back outer half of the hand
  lies on the inner half, and the membrane between them can crease sharply.
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
* Fire (fire.js) is a sprite effect (additive flame puffs + alpha smoke + a point light), not
  a fluid simulation; it does not cast shadows or ignite anything, and with the runtime's
  velocity motion blur the sprites carry no velocity (the film finish's sub-frames blur them).
* Leaf's chest is small scales now (smaller than on his back); check the overall scale size
  against "no decorative armor" with Daxtyn's references.
* Eyes in a shaded socket read mostly as the wet reflection of the sky (the
  iris shows in close-ups with light on it, e.g. Leaf's eye macro).
* The hatchling's 24-karat look is a metallic gold reflection under a wet film; a metallic,
  finely granular surface can still read as a gold casting in places. Its eyelids are separate
  shells with a rolled margin (not fused skin), and the closed mouth shows as a dark crease.
* Where a chain's scale rows converge (the jaw tip, the limb roots) the chain pattern would fan
  out; the jaw tip is granular and the limb roots (junction mask) use the 3D mosaic.
* The membrane is a single surface: its edge has no geometric thickness (the hem is darker
  and thicker in shading only); stripes and vessels are shading, not geometry.
* Tack (tack.js) is procedural geometry skinned to the trunk; straps do not press into the hide
  (no skin compression under them), and the riders' leg poses come from the humans library.
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
