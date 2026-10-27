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

## Costume, pose and face kit (fix round 1, 2026-10-09)

Garment / spec keys (offline/characters.py, offline/garments.py, offline/build.py):
- `trousers` (G_trousers): simulated wool trousers / braies. The legs are cut as tubes that hang
  from the seat and thigh (`leg_tubes`), the fork is bridged by a gusset (`bridge_crotch`: the
  crotch lowered + relaxed, kept outside both legs), and `tuck` (boot height) tapers them into the
  boot shaft 3 cm above its rim; `bottom` ends them above the ankle (rolled sailors' trousers).
  A shell of the leg read as sheer tights.
- `overlap` (coats, doublets): the front edges of a split skirt lap over each other when
  standing (riders' variants set 0: they part astride).
- `doublet` (G_doublet): fitted riding doublet, standing collar, short split skirts, `buttons` n
  (a row of domed buttons ray-cast onto the front). `gloves` (G_gloves): leather gauntlets, a
  thin shell skinned with the body's own weights. `wrap` (G_wrap): a scarf round the lower face
  and neck; hood `deep`: the face opening carried forward (the scout is unrecognisable).
- `cape` with `closed` (G_capelet / G_shawl): shoulder capes and shawls; fabric `fur` (procedural
  guard hairs in cloth.js, no fur scan in the library).
- Belt kit (`belt_style` on the belted garment): `leather` (D-buckle with a prong, keeper, the
  tongue through it hanging in a curve), `girdle` (gilt rosettes, long pendant end), `cord`
  (knotted, frayed ends), `sash` (cloth band and tails); `belt_color`, `belt_width`, `buckle`
  (iron | brass | gold), `tongue` (m), `pouch` (purse at the right hip). Accessories `chain`
  (gold chain of office) and `circlet` with `fit` (fitted to the head's cross-section).
- `expression`: CC0 MakeHuman expression units, `{unit: weight}` or `{unit: (weight, 'L'|'R')}`
  for one side of the face (an asymmetric mouth corner); squints, smiles, laughs, pain.
- Hair keys: `part` (centre parting width), `part_x` + flow `side` (side-parted crop), `loose`
  (strands lifting off a tied groom), `clump` (tips gather into clumps), `salt` (fraction of grey
  strands), braid `hang` 'L'|'R' (over a shoulder), style `coronet` (braided crown); beards
  `clump`, `moustache_len`, density falling off at the cheek line. Vellus hairs are flagged and
  shaded dark without highlight (they read as frost along the hairline).
- Poses (offline/recipes.py): `belt_hand` (stand), `clasp` (right hand laid over the left, contact
  solved), `hands_behind`, `spear` (shaft moved into the closed hand, `lean`, `spear_h`),
  `spear_lean`, `spear_shoulder`, `eat` (bread roll at the lips, or `at: 'chest'`), recorder and
  lute holds, `point_up` (index along the forearm, thumb tucked), injured arm cradled by the
  other hand, riders' heels down.
- Skin zones (attribute `aux3`: T-zone, hand, knuckles, fingertips): the oil film only on the
  T-zone, redder knuckles and fingertips, softer cavity AO on the hands; the lid margin is wet.
- `offline/qa.py <ids>`: integrity report run after every build (hand props within 2 cm of the
  grip centre, brow / lash fragments off the skin). Brow / lash cards are trimmed at build time
  (`card_qa`).
- `scenes/lookdev/humans-review.js` (+ `.json` ids): a quick side-by-side review of a few builds
  (front, 3/4, back, medium and face close-up of each) for iteration.

## Fix round 1, second pass (2026-10-12)

Post passes added (offline/postfix.py; all run by build.py after every build, idempotent, and can be
run on existing caches: `postfix.py <pass> <ids>`):
- `matpatch` - material values that changed after a build, patched into the JSON: `beardFull` (the
  skin under a grown beard takes the beard colour - short strands over orange skin read as a speckled
  pad) and linen brought to linear luminance ~0.31 (aprons / coifs / kerchiefs clipped to paper white).
- `legdrape` - trouser legs hang from the thigh (radius carried down the leg per azimuth, at most
  2.2 cm out, clear of coat skirts) + runtime fold shading: riding trousers, not tights. Garment key
  `legdrape: False` keeps fitted breeches (Queen Fall).
- `boottop` - a boot shaft's top 5 cm sits over the leg cloth with a slight flare (a scalloped pale
  band of trouser hem showed above every boot). Boots only.
- `toebox` - riders' boots relaxed into one toe box (they followed the toes: read as bare feet);
  `hidefeet` - the skin foot is never drawn inside footwear.
- `shirtarms` - a shirt's sleeves under long outer sleeves are not drawn (they poked through at
  the elbow as grey patches); `braidfill` - braid ribbons 2.3x wider, tip fade only at the tuft.
- `eyesplit` - eye attributes with every vertex given to the nearer eyeball (the x = 0 split gave
  half an eyeball to the other eye when the head was turned: a white, iris-less eye); fixed in
  humanbuild.eye_attrs for new builds too.
Build / runtime changes: head-cloth openings relaxed along the loop (no 1 cm staircase at the hood's
face edge; 4 rings of skin kept visible under hoods / coifs); kerchiefs without the stiff tail panel;
beards longer at the chin, every strand its own length; salt strands grey, not white; vellus
hairline hairs not drawn (frost band); skin specular 0.62 / sheen 0.05; the periorbital skin takes
the surrounding skin's chroma and luminance (mip-blurred photo) - no pale concealer band; leather
warmer, finer grain, dust only low on the foot; gambeson quilting filtered (no staircase moire);
`clasp` = one hand holding the other wrist; `injured_arm` = the right hand wraps the hurt forearm
from above; spearmen carry no sword; caruncles survive a laughing squint.

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

Fix round 1 (2026-10-12, 4-7 builds in parallel on the shared 4 vCPU, so slower per build):
abby 862 s, abby_injured 1106-1214 s, alexandria 595-785 s, king 491-727 s, fall 579 s, remi 496 s,
abby_sling 477-567 s, riders 431-475 s, child 1588 s, crowd / work cast 81-865 s (median ~300 s);
all 48 ids + the re-builds in ~2 h 10 min wall clock. Cache after the round: 1.1 GB (git-ignored).
4K finals (output/humans/r1/, 1 worker): hero 8 stills 27 min (~200 s each), contact sheets 7 in
20 min, riders 3 in 7 min 51 s. Previews (1920x1080): hero 8 in 8.5 min, contact 7 in 10.5 min.

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

## Performance: lip-sync, face, body motion, crowds (2026-10-24)

Everything is scheduled up front (setup) and evaluated as a pure function of t, so any frame renders
the same in any worker / chunk / order (`selftest-perf.mjs` checks it).

```js
import { loadPerformanceData, createPerformer } from '../lib/humans/perform.js';
const data = await loadPerformanceData();                        // lip-sync + delivery data, face units
const abby = createPerformer(await loadCharacter('abby'), data); // body + face of one character
abby.place(0, 0, Math.PI);                                       // stand here (x, z, yaw) before walks
abby.walkPath([[0, 0], [1, 2], [1, 5]], 0.5, { speed: 1.3, endYaw: 0 });   // planted feet; > ~2.2 m/s runs
abby.performLine('L014', 6.2);                                   // the take's WAV time 0 plays at t = 6.2
abby.mood({ pain: 0.4 });  abby.lookAt({ ch: remi.ch }, 7.0);    // emotion layer; head + eyes on Remi's face
abby.gesture('cradle', 0, { side: 'L', dur: 99 });               // the injured LEFT arm held in
abby.posture('kneel', 9.0, { hold: 2 });  abby.react('wince', 3.4);
// update(t):  remi.update(t); abby.update(t)   (a character touched by another is updated first)
```

| module | what |
|---|---|
| `perform.js` | `createPerformer(ch, data, opts)`: `place`, `performLine(id, t0, { emo, amp, beats })`, `walkPath`, `runPath`, `follow(fn, t0, t1)`, `trajectory(tr)`, `gesture`, `posture`, `stagger`, `fall`, `lookAt`, `glance`, `mood`, `react`, `carry(child, t0, t1)`, `rootAt`, `update(t)`; `directorFace(data)` (a `registerHumanAction('face', ...)` hook: lip-sync from the shot's placed lines); `trajectoryFromBlocking(fn, t0, t1)`; `ROLE_OF` (cast id -> dialogue role) |
| `visemes.js` | phones -> 9 articulators (jaw, lip closure, rounding, spread, f/v tuck, th, tongue tip, upper lip, press), Cohen-Massaro dominance coarticulation (a phone that needs an articulator dominates it briefly and strongly; one that does not lets its neighbours decide; anticipation reaches ~1.7x further than carry-over), a contact floor so p/b/m always close and f/v always tuck, rest in pauses > 80 ms, jaw scaled by the take's loudness, 40 ms visual lead -> MakeHuman face units |
| `expressions.js` | 11 emotion layers as FACS-style unit mixes (calm worry pain fear anger grief amusement surprise tender contempt determined), blendable, softly limited; `emotionFromDelivery(note, preset)` (whole-word rules, negations dropped) |
| `faceperf.js` | face performer: line emotion envelopes, brow raise / knit and head nods on stressed syllables (loudness accents), blinks (spontaneous; at phrase starts and pauses; on gaze shifts; more under fear), eye-target look-at with vergence, fixation saccades (eye-eye-mouth on a face), gaze aversion at line starts, lids that follow the eyes; `LINE_OVERRIDES` (hand-set key lines: L011 ...), `SCENE_MOOD` |
| `motion.js` | body: trajectories (path + speed profile, fn(t), baked), gait phase table with PLANTED feet (plant = the root at 41 % of stance, 32 % running), heel strike / heel off rolling on heel and ball, Hermite swing with clearance and the running heel kick, pelvis lowered by the planted legs' reach (the walk's bob comes out of it), pelvis rotation / list / sway, spine counter-rotation and lean, arm swing (90 degrees bent when running), standing weight shift, gestures (`point wave reach support cradle handsToFace protectHead flail carry explain`), postures (`crouch kneel cower hunch`), `stagger` (quick recovery steps), `fall` (buckle, topple, hands to the ground, lie), head look with the chest helping on big turns, `carryChild(adult, child)` |
| `crowd.js` | `createCrowd({ agents, exits, obstacles, walls, alarm, cower })`: social-force bake at 30 Hz in setup (seeded): MILL (wander near home, stop and face neighbours), FLEE along exit polylines (reaction wave from the threat, startle + gasp, glances back, some shield their heads), COWER (by a wall away from the threat, or frozen where they stand); no overlaps (position correction) |
| `face.js` | the MakeHuman face pose units rig (+ derived `JawOpen`, `<Side>LidsDown/Up/TurnLeft/TurnRight`) |
| `rig.js` | IK / hand-shape toolkit (two-bone IK with pole + soft reach, hand shapes, orientHand) |

Data: `data/lipsync-s01e01.json` = `offline/lipsync_align.py` (pocketsphinx 5.1.1 forced alignment of
every Episode 1 take: 384 aligned, 1 dictionary fallback, 4 non-verbal placeholders with loudness
only; `--meta-only` refreshes the delivery notes in seconds). Python with pocketsphinx: the scratchpad
`preview-venv` (`pip install pocketsphinx==5.1.1 soundfile scipy numpy`).

Proof scenes (`scenes/lookdev/humans-anim-*.js`): `alexandria` (L011 close-up), `dialogue` (Remi and
Abby, L014-L016), `cradle` (Abby's injured left arm, Remi supporting her elbow, L091), `crowd` (the
Cling square crowd flees), `walk` (walk / run / kneel / stagger + fall), `dev` (face units, visemes and
emotions one per second).

Self-test: `node scenes/lib/humans/selftest-perf.mjs` (lip closures on all 340 p/b/m, rounding,
delivery-rule traps, planted feet walking and running, order independence, falls, crowd determinism and
spacing, the director face hook). Body tests need the character caches.

Limits (honest): faces are MakeHuman bone units (no sculpted visemes / wrinkle maps), so expressions are
subtle at a distance and corrective shapes are missing (a wide AA stretches the lip corners); garments are
skinned (a long gown walks with its legs; runs and kneels in skirts stretch); falls are procedural, not
physical; the crowd avoids people, walls and round obstacles but has no navigation mesh (exits are hand-
given polylines).
