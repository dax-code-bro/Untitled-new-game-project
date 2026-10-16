# Creatures (the Episode 1 dragons)

Procedural, realistic dragon models for Dragon's Kingdom, built entirely in code at scene setup
(no downloaded creature assets). **`DESIGN.md` in this folder is the design authority**: every
body below is built from its numbers (appendix A) and its notes on anatomy, mass, skin and
movement. Daxtyn gave the colours and a few facts; the bodies are designed here as real animals
would be built, and on 2026-10-14 he asked for exactly that, with **horns on every dragon** and
**two legs instead of four**.

**The body plan (every dragon): a wyvern built like a bat and a pterosaur.** Two hind legs
(semi-digitigrade, three toes forward and a gripping hallux, a heel pad); **the wings are the
front limbs**. (DESIGN rev. 3, Daxtyn 2026-10-16: *"make them low to the ground with their legs
more towards the center of their body"*) **The hip joints sit under the middle of the body** and
**every dragon stands, walks and rests LOW** like a big, heavy, ordinary animal: the trunk carried
low and nearly level, the knees bent in a deep crouch with the feet under the centre of mass, the
folded wings' wrist pads and thumb claws down under the shoulders as front supports (the elbows
stand up beside the withers like a cloak), the neck forward and low, the tail low behind
(`poses.stand`, DESIGN 1.5c). Leaf can sit like a dog, rump on the ground, wrists in front. No
extra limbs. Every dragon has its own fixed horn set.

| creature | canon look (Daxtyn / screenplay) | length | wingbeat | horns (fixed in every shot) |
|---|---|---|---|---|
| `charcoal` | completely black scales, BLUE eyes, GRAY membrane with BLACK STRIPES throughout, orange-red fire; immense, calm; devastating take-off | 36 m | 0.42 Hz | 10: heavy back-swept buffalo/mouflon pair (LEFT tip broken off), brow pair, 3 jaw knobs a side |
| `leaf` | 25% of Charcoal, DARK GREEN, YELLOW eyes, LIGHT GREEN membrane, purplish-blue fire; young; sits upright like a dog | 9 m | 0.8 Hz (+ corrective unevenness) | 4: short smooth pair + brow nubs |
| `starlight` | albino, reflective crystal-like white scales (never glowing, not crystal), about twice Charcoal's size, no fire in Ep. 1, dive-bombs | 72 m (2x Charcoal's length; open question in DESIGN 9) | 0.24 Hz | 8: long S-curved pair + a 3-pair crown |
| `hatchling` | looks like 24-karat gold, newborn, wet, weak, no glow | 1.0 m | (cannot fly) | 2 soft buds (+ egg tooth) |
| `scout` | small, extremely fast, loses its LEFT wing | 6.8 m | 1.1 Hz (sprint 1.4-1.6) | 2: long thin, laid flat back |

Lengths are snout to tail tip along the spine. Wingbeat tempo falls with size (dynamic
similarity), so the giants read heavy.

## Use

```js
import { createCreature, poses, createSaddle, mountRider, createFire, createDust } from './lib/creatures/index.js';
import * as H from './lib/humans/index.js';              // the riders (humans library adapter)

// setup(ctx)
const leaf = await createCreature('leaf', { quality: 'hero' });   // 'draft' | 'standard' | 'hero'
ctx.scene.add(leaf.root);
const tack = createSaddle(leaf);                                    // saddle fitted to the back
mountRider(leaf, tack, H.createRider(await H.loadHuman(), { outfit: 'abby' }));   // follows every pose

// update(t, ctx) - every pose is a pure function of t
leaf.setPose(poses.sit(leaf, { t, look: [0.3, 0.1] }));
```

Poses (`poses.js`; IK on the feet and wrist pads, so planted contacts stay planted):

| pose | what |
|---|---|
| `stand` | (rev. 3) the LOW stance, the resting carriage: chest underside ~1/3 of the chest depth above the ground (`belly`), trunk ~level, feet under the middle of the body, wrist pads + thumbs down under the shoulders, elbows up beside the withers, the fingers in one bundle back along the flank, neck forward and low, tail low with its outer half on the ground; breathing, a slow weight shift, idle head drift, blinks. Per-dragon overrides in `design.stand.low` |
| `upright` | (rev. 3) retired: an alias of `stand` |
| `walk` | lateral-sequence low walk (foot, wrist, foot, wrist; duty ~0.7), speed from size; the scene moves the root by `speed * t` and the planted contacts stay put |
| `sit` | Leaf's dog-like sit: the rump behind the hips on the ground, chest ~30 deg up, wrists planted in front (`plantWrists: false` folds the wings off the ground), tail curled round |
| `crouch`, `lie` | the low stance sinking to the chest (mounting, the start of a launch); lying on the belly, legs folded under, `sprawl: 1` for the newborn |
| `rear` | up on the hind legs (`k` 0..1) - only for a moment (to look over something, to threaten) |
| `pushUp`, `struggle` | the newborn pushing up on its wrists and thumbs; the full weak struggle of 1A (trembles, lifts the chest a few cm, a wrist slips, rests) |
| `fire` | from the low stance: inhale, chest lifted a little on the planted wrists, neck stretched forward and low along the line of fire, jaw 25-30 deg; drive `createFire` with it |
| `flight` | flapping (tempo from size, `hz`, `phase`, `amp`, `corr` for Leaf's uneven beats, `bank`, `bodyPitch`); the neck keeps the head steady, legs trail with the toes curled |
| `glide` | wings held with dihedral at the arm and droop at the hand; `bank` rolls the body, the head counter-rolls |
| `dive` | Starlight's stoop: wings half folded into an "M", legs drawn in tight, feet clenched (`fold` 0..1) |
| `strike` | talons forward under the body, toes spread then closing, wings opened hard |
| `sprint` | the scout's short fast beats, neck pulled back |
| `mouthHold` | Charcoal turns his head round and takes Leaf's whole head in his jaws: open to 45 deg, close to a holding gape (`hold`, rad; the shot uses 0.5 with Leaf's snout 1.85 m inside the front teeth) (`turn`, `side`, `release`) |
| `sculpt` | the SCULPT bind configuration (debugging the body sculpt) |
| `launch` | heavy take-off: crouch, leg vault, unfold, the first downstroke, beats in ground effect (timing scales with size; `pose.launch` gives the phases) |
| `land` | (rev. 3) a low approach: a short ~25 deg flare, the feet touch down under the middle of the body, the wrist pads come down, the wings fold into the low stance |
| `blend`, `contactsOf` | slerp two poses; world contact points (footprints, dust) |

Common options: `look: [yaw, pitch]`, `eyes`, `jaw`, `blink: false`, `lidRelax`, `breathe`.

Effects: `createFire({ palette: 'standard' | 'leaf', length, width })` (camera-facing flame and
smoke sprites with embers, a light down the jet and one at the mouth that light the head, chest and
ground; `update(t, { creature, on, groundY })` keeps the puffs above the ground; pure in t; nothing
on a body glows), `createDust({ radius })`
(Charcoal's take-off: downwash dust rings per downstroke, thrown clods, wrist-pad craters and
claw furrows; see `stageTakeoff` in `scenes/lookdev/creatures-shots.js`).

The scout's LEFT wing: `scout.detachWing(scene, worldMatrix)` moves the whole wing subtree (arm,
fingers, membrane, membrane roots) off the body; `attachWing()` restores it. The tumble is
computed as a pure function of `t` in `creatures-shots.js` (`scoutWingLoss`).

## Lookdev scenes (`scenes/lookdev/`)

| scene | what |
|---|---|
| `creatures-hero.js` (= `creatures-turntable.js`) | the 17 hero shots of `creatures-shots.js`: Charcoal in the low stance 3/4 front with Remi; Charcoal's head; Charcoal's low walk side on (feet + wrist pads); Charcoal resting (lying); Charcoal's take-off (dust dome, a power-law spray of clods and turf, craters); Charcoal and Leaf flying side by side with Remi and Abby in the saddles; the head-in-mouth hold seen square on to Charcoal's head (Leaf's whole head inside the jaws, Abby clear); Leaf sitting with Abby; Leaf landing (feet down, wrists coming down); Charcoal's fire; Leaf's fire; Starlight gliding seen from the ground (a watchman points, a 27 m tower for scale); Starlight's dive with Queen Fall riding; Queen Fall in the rig on Starlight (air to air); the hatchling macro on the straw nest; the scout banking with its crouched rider; the scout losing its LEFT wing seen from behind |
| `creatures-turntable-<name>.js` | only one dragon's shots (quicker builds) |
| `creatures-review.js` | every shot for 1 s (`--fps 1`) |
| `creatures-contact.js` | contact sheet (29 frames): each dragon on a turntable (4 views, t = 0-19; the low stance, the newborn lying), the scale lineup with a 1.8 m person (t = 20, also `creatures-lineup.js`), Charcoal, Leaf, Starlight and the scout gliding (t = 21-24), Charcoal's low walk on his feet and wrists (t = 25), Leaf sitting (t = 26), Charcoal lying (t = 27), Charcoal crouched for the take-off (t = 28) |
| `creatures-dev.js` + `creatures-dev.json` | free views/poses for look development |

Shots are lit by the photographed sky alone (Poly Haven kloofendal_48d_partly_cloudy, CC0, its
sun extracted into a shadow-casting light; old_room's window light for the hatchling), framed
with a lens in mm on Super 35 and finished with `finish.js` (8 sub-frames: supersampling + true
motion blur, print grade, grain). People and riders come from `scenes/lib/humans`.

## How it is built

1. **Anatomy** (`anatomy.js`, `kin.js`). One builder for every dragon, driven by its preset in
   `DESIGNS` (DESIGN.md appendix A in metres, plus build extras: muscle/fat factors, limb bulk
   for the giants, finger curl, head features, folds). There are **two bind configurations**:
   the REST pose is the glide planform (wings spread, legs trailing) - the membranes and finger
   tubes are built and bound there; the SCULPT pose stands on the legs (2-bone IK at the design
   hip height, feet a little wider than the hips so the inner toes never meet) with the wing-arms
   half folded - the body and every solid part are sculpted and bound there (`sculptLocal` maps
   rest to sculpt; both skeletons share the bones). Helper bones (`w_#_sh`, `hl_#_h`) follow half
   the humerus / femur so the shoulder and hip masses do not collapse. The body is a signed
   distance sculpt: the spine as elliptical cones following the design's cross-section tables,
   then muscles where a flying animal has them - the pectoralis from the keel to the humerus
   (the downstroke), the hump of upstroke muscles over the shoulder blades, triceps/biceps, the
   weight-bearing forearm column with its extensors and flexors, a broad callused wrist pad and
   the thumb, glutes, quadriceps, hamstrings, the caudofemoralis from the tail base to the thigh,
   the calf and Achilles tendon, a heel pad, the toes with digital pads and claws. Limb
   thickness follows the load: the 81 t Charcoal and 340 t Starlight stand on thick columns.
   The head is lofted from the design's width/depth table and sculpted: brow shelf, canthus
   ridge, cheek bone, jaw muscles, the gape running back to the quadrate hinge, labial scales,
   nostrils on a boss near the tip, the eye seated so a set angle of the eyeball shows, a
   tympanum; the lower jaw is built closed and rotated open, so the lips meet. Horns are spline
   paths (`parts.js` keratin) with growth ridges; each path starts a base radius inside the skull
   (rev. 2b), so no open sheath rim stands at the skin.
2. **Mesh** (`mesher.js`): narrow-band surface nets on a warped grid (finer at the head, feet and
   wrists), projected onto the iso-surface with exact SDF normals.
3. **Skin** (`skin.js`): weights from the sculpt (every primitive belongs to a bone), smoothed,
   then kept within their part (rev. 2: a body vertex never rides a humerus or femur directly -
   that weight goes to the half-following helper bone - and a limb vertex rides only its own limb
   and the bones it hangs from; mixed weights turned the shoulder skin inside out when the arm
   folded); then the seams between body and limb skin are feathered (rev. 2b: Jacobi relaxation
   of the weights in a band `seamFeather` = 0.03 L either side of the seam, the rest held fixed -
   a hard seam opened into a "curtain" of stretched triangles at the shoulder when gliding;
   tools/stretch.mjs counts edges stretched beyond 6x / 15x the median edge per pose);
   AO baked per part (the limbs do not darken the body: that occlusion belonged to the
   sculpt pose only);
   chain coordinates for the scale rows; the wrist pad is its own region (callus); AO baked from
   the SDF.
4. **Wings** (`wing.js`, `drape.js`): finger bones per design (2-4 long fingers + thumb), the
   chiropatagium between the fingers with a scalloped trailing edge, the plagiopatagium to the
   body (armpit, flank, hip, knee, down to the ankle on the adults), the propatagium from the
   neck base to the wrist; camber (billow) that shades; a position-based drape of the folded
   membrane per ground pose (stand, sit, lie, crouch).
5. **Materials** (`materials.js`, `glsl.js`): three.js physical materials extended in the
   shader - a 3D scale mosaic with a size hierarchy (big on the back, granules at the joints and
   round the eyes), keeled dorsal scutes, belly plates, tubercles, wear, dust and damp; the eye
   ray-traced through a refracting cornea; keratin with growth rings (per dragon roughness and
   ridge strength: Charcoal's horns rough and dull, Starlight's polished ivory); the membrane
   with veins, creases and thin-skin translucency (Charcoal: grey with black bands along every
   finger bone and through the panels; Leaf light green; Starlight ivory with a rose flush
   against the light; the scout dark).
6. **Tack + riders** (`tack.js`, `rider.js`): saddles fitted by sampling the body (seat over the
   withers, breast collar and girth), skinned like the nearest body vertex; giants get a riding
   rig; `mountRider` seats a humans-library rider with grab bar and stirrups.

## Cost

Measured on this machine (4 vCPU, no GPU, SwiftShader), 2026-10-15.

Build in `setup()` (deterministic; Node and the browser give identical meshes), Node, `draft`
(rev. 2b, with the seam feathering): Charcoal 8.0 s (69k body vertices), Leaf 7.2 s (67k),
Starlight 9.9 s (97k), scout 4.3 s (35k), hatchling 13.3 s (173k: the newborn's head is meshed
finest). Charcoal at `standard`: 216k vertices in 16.0 s; at `hero`: 431k in 31.8 s (rev. 1
numbers, measured while `npm test` ran on the same CPUs). The hero shots build at `hero`, the
contact sheet at `hero` too.

Render at native 4K (`--preset final`, the 8-sub-frame film finish), one browser, rev. 2b:
all 14 hero shots in one `creatures-review.js` job: 36 min 58 s of rendering (41 min 37 s wall
with the builds; a 47.0 MB H.264 job video), about 2.6 min per finished 4K frame; the 27-frame contact
sheet (`creatures-contact.js`, no sub-frames): 7 min 02 s (11 min 30 s wall, 98.4 MB). One 4K frame of the
take-off or the hatchling macro takes the longest (dust sprites, the densest mesh).

Commands (outputs are git-ignored):

```
node render/render.mjs scenes/lookdev/creatures-review.js  --preset final --fps 1 --workers 1 --out output/dragons-wyvern/fix1b/hero-job --stall-timeout 2400
node render/render.mjs scenes/lookdev/creatures-contact.js --preset final --fps 1 --workers 1 --out output/dragons-wyvern/fix1b/contact-job --stall-timeout 2400
```

## Known limits

* The designs are mine (DESIGN.md) except the canon facts above; nothing has been checked against
  approved references. Starlight's size (72 m = twice Charcoal's length, vs ~51 m if "twice his
  size" means area) is an open question; every number scales with the one length.
* Every planted pose (IK feet and wrist pads, the tail laid on the ground) assumes flat ground at
  the root's height; slopes and steps need targets from the set.
* The folded membrane is a one-time position-based drape per ground pose (drape.js), not a cloth
  simulation: it can crease sharply in places and does not react to wind.
* Linear blend skinning: the extreme bends (Leaf's sit at the hips, Charcoal's neck curled round
  for the head-in-mouth, the hatchling's sprawl) lose a little volume at the joint.
* Skin detail is shading on a ~0.1-0.9 M triangle mesh: silhouettes in close-ups (jaw line, toe
  tips) are smooth curves, not scale bumps.
* The hatchling's 24-karat look is a metallic gold reflection under a wet film; in places it can
  read as a gold casting rather than skin.
* Fire and take-off dust are sprite effects (camera-facing puffs, a point light, instanced clods),
  not fluid simulations; grass is not flattened by the downwash.
* The scout's rider straddles a saddle built for wider backs (knees wide on the slim scout).
* Leaf's head in Charcoal's mouth (head-in-mouth) is placed by `stageMouth` in the shot, not by a
  contact solver: other framings may need the snout offset retuned.
* Tack does not compress the hide; the riders' leg poses come from the humans library.
* Seen side-on, a folded wing shows its fingers as parallel ridges with the drape hanging between
  them (Charcoal's reads a little like a stack of awning poles; a cloth simulation of the fold
  would crumple it more naturally). Starlight's folded wing tips run back past the hip by design
  (albatross), so from behind they read as long blades.
* Stirrups are placed under each rider's feet after the straddle fit (rider.js `addStirrups`,
  rev. 2), so the leathers run from the saddle flap to wherever the foot ended up - not a fitted
  length; on a slim back they hang at a slant.
* (rev. 2) Under a fully folded arm a small dark crease can remain in the armpit; the far wing's
  wrist knob, folded high in front of the chest, can read as a small fist in a front view; the
  membrane's thigh root can show as a grey patch over the knee in the upright stance.
* (rev. 2) Starlight's flank scales seen from a few metres (the rider shot) read as large white
  cobbles, a stray scale plate can catch the light on its own, and the upper side of her membrane
  shows a jigsaw-like wrinkle pattern; her folded wing reads as a bundle of pale rods. In a glide
  the feathered shoulder seam stretches the scales there into long ovals (no torn "curtain" any
  more, but a visibly stretched band on Starlight). Membranes in flight show no visible
  veins or hem from a distance. The newborn's mouth still reads a little lip-like.
* (rev. 2) The fire jet is pale orange near the mouth (additive sprites over a bright sky) and
  turns into orange billows and black smoke further out; a little haze where the tongues start.
