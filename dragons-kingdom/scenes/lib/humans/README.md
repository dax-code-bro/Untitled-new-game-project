# Humans (scenes/lib/humans)

Real people for Dragon's Kingdom, built from free assets only: the CC0 MakeHuman base mesh,
rig and skin weights, CC0 MakeHuman / MPFB2 targets (body, face, age from child to old,
asymmetry, expressions), CC0 eyes, eyebrows, eyelashes, teeth, tongue and skin textures, and
CC0 ambientCG fabric / leather / metal / wood scans (all listed with licence, source URL and
sha256 in `assets-lib/manifest.json`). **Every look is PROVISIONAL** until Daxtyn approves it.

## How it works

1. **Offline build** (`offline/`, Blender's Python module `bpy` 4.2 + numpy, deterministic):
   MakeHuman macro + detail targets -> joints -> a pose recipe (weight shift, relaxed arms,
   hands that grip props; run twice so the clavicles drop with hanging arms and lift with raised
   ones - the rig's level shoulders gave every coat square, padded shoulders) -> skin (Catmull-Clark level 1 for close-up characters), eyes,
   brows, lashes, teeth, tongue -> **garments simulated with Blender cloth** while the body moves
   from a neutral dress pose into the character's pose (layer by layer: shirt, coat, apron,
   hood, cloak, veil) -> strand hair (pulled back, braids, buns, crops, beards, strand
   eyebrows) -> props in the hands -> baked per-vertex AO and skin thickness -> `cache/<id>.json`
   + `cache/<id>.bin` (git-ignored).
2. **Runtime** (`index.js`, `loader.js`, `materials.js`, `cloth.js`, `idle.js`): rebuilds the
   skinned meshes in three.js with the human materials (skin with pores, fine lines, flush,
   lid margin and subsurface-style wrap lighting; wet-cornea eyes; Kajiya-Kay hair; woven
   cloth with dye, wear and dust) and adds idle motion as pure functions of `t` (breathing,
   balance sway, head drift, saccades, blinks).

Garment technique (offline/garments.py): shells are cut from the body (necklines incl. V,
cuffs, hems snapped to clean curves), loosened onto a *drape envelope* (cloth hangs from the
bust and shoulder blades instead of following every hollow; sleeves are tapering tubes), then
simulated. During the simulation the belt rows and cuffs are pulled in to the body (pinned
goals animated inward), so the wider cloth gathers above and below the belt and stacks along
the forearm - the folds come from physics, not from a texture. Skirts are extruded from the
waist seam with irregular flutes; riding coats are split at the front. Under-layers that are not
simulated (shirts) get deterministic neckline gathers; band collars are fitted to the neck's own
cross-section; the bust is rounded in the cloth collider (cloth over a body-shaped apex tents
into two points, and a period chemise / kirtle bodice supports the bust anyway).

Face skin (offline/humanbuild.albedo_gain): the MakeHuman photo textures carry the photo shoot's
light and make-up at 1-5 cm (pale under the eyes, a red lid crease, shading beside the nose). A
per-vertex RGB gain (`albg` = colour blurred over 4.5 cm / colour blurred over 8 mm, lips and
lash line excluded) evens it out, so the renderer's own light does the modelling; pores,
freckles and lip edges (finer than 8 mm) stay.

Post passes (offline/postfix.py, run by build.py after every build; each records itself in the
mesh's `postfix` list and never runs twice on a cache): `shoes` - boots and shoes are made on a
last (the foot shell's toes closed by a grey-closed radius map, toe room, flat sole, toe spring);
`puckers` - cloth puckers (the body mesh's poles at nipples / navel, sim crumples at armpits and
crossed arms) found by the second eigenvalue of the normals' scatter (a fold bends one way, a
pucker every way) and filled by a membrane that may not move cloth more than 2 mm inward, the
cloth over the nipples re-made as the quadric fitted around them; `pushout` - cloth outside the
body (Taubin-smoothed, all triangles incl. those hidden under clothes = cache field
`colliderIndex`, the bust left out: cloth bridges it) and outside the layer under it; `cull` -
cloth under an opaque outer layer is not drawn (degenerate triangles; 3 rings kept round the
outer garment's own openings); `renormal` - patches wound inward re-wound, welded normals;
`holefill` - small holes and near seams closed; `beltband` - the cloth the belt cinches: the
layers under the belt layer relaxed over the whole band, the belt layer itself below the belt
only (at most 2 cm, held near its open edges), then pushed out again - the sim's pin band
crushed it into crumples that folded over themselves (dark tears under the belt); `beltseat` -
the belt and buckle moved in/out per 5-degree sector so the belt sits 1.5 mm over the cinched
cloth (a gambeson poked through the belt, riders' belts floated); `reao` - cloth AO re-baked on
the final geometry; `props` - prop colour corrections; `hairline` - the scalp tint (skin aux.a)
carried ~9 mm past the strand coverage as a fading gradient (a hairline is a density gradient,
not an edge); `cullboots` - hose / trousers inside a boot shaft pulled 3 mm inside it and not
drawn under it (they poked through as pale streaks); `overbelt` - cloaks and hood capes pushed
out over the belt (the belt is added after the simulation and printed through the King's
mantle; it runs before `reao`, whose bake would keep the dark band); `cloakin` - mantle
triangles inside a sleeve not drawn. Hoods and coifs hide the head under them; hoods rest on the
crown. Garment key `bodice_pin` (opt-in): a fitted, laced bodice keeps its cut shape (Alexandria's
gown crumpled into horizontal ripples without it); non-simulated shirts get shading-only folds
(runtime `wrinkle`).

## Build

```bash
PY=<bpy 4.2 python>      # e.g. the scratchpad bpyenv: .../bpyenv/bin/python
$PY -I scenes/lib/humans/offline/build.py --list            # every character id
$PY -I scenes/lib/humans/offline/build.py                   # build all (about 1.5-2 h on 4 cores)
$PY -I scenes/lib/humans/offline/build.py --only abby,remi  # some (also 'crowd*')
#  options: --lod mid (quick test of a hero), --nohair, --nosim, --suffix _dev (writes <id>_dev)
# restartable, in YOUR order (build.py --only always goes in cast order), skipping ids whose
# cache is newer than a stamp file (touch it when the offline code changes):
PY=$PY scenes/lib/humans/offline/queue.sh <stamp> abby remi king crowd01 ...
#  post passes only, on built caches (idempotent): $PY -I scenes/lib/humans/offline/postfix.py all all
```

Times on this machine (4 vCPU, shared with other renders, 2026-10-09, incl. every post pass):
close-up characters 4-14 min each (abby_injured 841 s, abby_sling 608 s, fall 508 s, abby 427 s,
king 413 s, remi 251 s, alexandria 248 s), mid characters 1-4 min (guards 57 s, crowd 72-185 s);
all 48 in 53 min with three queues in parallel (08:22-09:15 UTC; `queue.sh` takes a per-id lock,
so several queues can run over the same list). Cache: 986 MB for the 48 (close-up 35-57 MB,
mid 4-24 MB).

## Use

```js
import { loadCharacter, placeCharacter, applyIdle, CAST, CROWD, joinHands, setDust } from '../lib/humans/index.js';
const abby = await loadCharacter('abby_sling');   // setup()
placeCharacter(abby, x, groundY, z, yaw);          // feet on the ground, facing yaw
scene.add(abby.root);
abby.update(t);                                     // update(t): idle motion (or applyIdle(abby, t, opts))
setDust(king, 0.8);                                 // 3C: dusty after the attack (runtime)
joinHands(parent, child);                           // child's right hand into the parent's left
```

Riders - drop-in for the placeholder in `scenes/lib/creatures/rider.js` (same calls, same seat
arithmetic: pelvis 0.1 m above the saddle's seat point):

```js
import { loadHuman, createRider } from '../lib/humans/index.js';
import { createSaddle, mountRider } from '../lib/creatures/index.js';
const human = await loadHuman();                    // preloads remi_ride, abby_ride, fall_ride, scout_ride (+ standing)
mountRider(leaf, createSaddle(leaf, {}), createRider(human, { outfit: 'abby' }));
// outfit: 'remi' | 'abby' | 'fall' | 'scout' | 'abby_injured' (or { name }); pose: 'stand' for the standing builds
// rider.update(t) adds breathing / blinks
```

Crowds - `loadCrowd()` + `person(crowd, outfit, action, { seed })` is a drop-in for
`sets/people.js person()` (returns a root lifted by the placeholder's hip height so
`placePerson()` keeps working); `CROWD` lists the 18 festival villagers.

## Cast (ids)

See `CAST` in `index.js` and `offline/characters.py` (PROVISIONAL looks; screenplay canon
noted per character): abby, abby_injured, abby_sling, abby_ride, abby_ride_injured, remi,
remi_ride, alexandria, fall, fall_ride, king, attendant, healer, messenger, keeper1, keeper2,
vendor, parent, child, musician, musician2, guard_captain, guard1-3, watchman, villager_hurt,
scout_ride, sailor1, sailor2, crowd01-crowd18.

## Look-dev

- `scenes/lookdev/humans-contact.js` - contact sheets / turntables of every character.
- `scenes/lookdev/humans-hero.js` - the hero angles (Remi + Abby, Abby close-up, Alexandria,
  King, crowd group, Abby sling / injured, Fall).
- `scenes/lookdev/humans-riders.js` - riders in the saddles at scale (uses the creature library).
- `scenes/lookdev/humans-dev.js` - one character, fixed views (fast iteration): full figure,
  face 3/4, profile, hands, back, eye macro, feet, hairline (`humans-dev.json` picks the id).

Every look-dev scene picks its shot from the FRAME time (`stage.js` `reviewTime`), so all shots
render in one run as a 1-fps sequence (frame k = shot k, posed at its middle) - the film
finish's sub-frames never straddle a cut:

```bash
node render/render.mjs scenes/lookdev/humans-hero.js --preset final --fps 1 --seconds 8 --workers 1 --out output/humans/hero
ffmpeg -i output/humans/hero/hero.mp4 hero_%d.png   # (or --still --time k.5 for one shot)
```
