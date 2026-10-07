# Humans (scenes/lib/humans)

Real people for Dragon's Kingdom, built from free assets only: the CC0 MakeHuman base mesh,
rig and skin weights, CC0 MakeHuman / MPFB2 targets (body, face, age from child to old,
asymmetry, expressions), CC0 eyes, eyebrows, eyelashes, teeth, tongue and skin textures, and
CC0 ambientCG fabric / leather / metal / wood scans (all listed with licence, source URL and
sha256 in `assets-lib/manifest.json`). **Every look is PROVISIONAL** until Daxtyn approves it.

## How it works

1. **Offline build** (`offline/`, Blender's Python module `bpy` 4.2 + numpy, deterministic):
   MakeHuman macro + detail targets -> joints -> a pose recipe (weight shift, relaxed arms,
   hands that grip props) -> skin (Catmull-Clark level 1 for close-up characters), eyes,
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
waist seam with irregular flutes; riding coats are split at the front.

## Build

```bash
PY=<bpy 4.2 python>      # e.g. the scratchpad bpyenv: .../bpyenv/bin/python
$PY -I scenes/lib/humans/offline/build.py --list            # every character id
$PY -I scenes/lib/humans/offline/build.py                   # build all (about 1.5-2 h on 4 cores)
$PY -I scenes/lib/humans/offline/build.py --only abby,remi  # some (also 'crowd*')
#  options: --lod mid (quick test of a hero), --nohair, --nosim, --suffix _dev (writes <id>_dev)
```

Times on this machine (4 vCPU): close-up characters 4-6 min each, mid characters 1.5-3 min.
Cache sizes: close-up 30-50 MB, mid 5-20 MB.

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
- `scenes/lookdev/humans-dev.js` - one character, fixed views (fast iteration).
