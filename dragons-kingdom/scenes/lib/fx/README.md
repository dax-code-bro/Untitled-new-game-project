# FX library (`scenes/lib/fx`)

Blood and gore, dust, debris and destruction, smoke, fire, water impacts, cloth, sparks and ash
for Dragon's Kingdom - built to sit inside the live-action-look renderer (three.js r180 in
headless Chromium, the cinematic stack in `render/`) and to be cued by the shot director.

Every effect is a **pure function of t**: particles follow closed-form paths from hashed launch
values; anything that needs simulation (cloth, debris contacts) is integrated once in `setup()`
from fixed inputs and then sampled. Any frame can be drawn alone, in any order, by any worker,
on any machine, and comes out the same.

```js
import { createFx } from '../lib/fx/index.js';

export async function setup(ctx) {
  // ... build the set, lights, cast ...
  const fx = await createFx(ctx, { ground: 0 /* or (x, z) => h */, wind: [1.2, 0, 0.4] });
  fx.dust.downwash({ at: [0, 0, 0], t0: 1.0, bursts: [0, 0.85, 1.7], radius: 30, color: 'loam' });
  fx.blood.spray({ at: () => jaw.getWorldPosition(v).toArray(), dir: [0, 0.3, -1], t0: 2.1 });
  fx.cloth.banner({ hoist: [[x, 4.8, z], [x + 1, 4.8, z]], size: [1, 2.6], t0: 1.15, gust: { t: 1, at: [-12, 3, -6], dir: [1, 0.1, 0.5], strength: 16 } });
}
export function update(t, ctx) {
  // pose everything, place the camera, THEN:
  fx.update(t);
  ctx.shadows.dynamic = fx.dynamic;      // moving shadow casters (debris, cloth, smoke twins)
}
```

`at` accepts `[x,y,z]`, a `Vector3`, a function of t, `{ object, offset }` (a point in an
object's local frame, read from its posed matrix) or a director point name.

## Quality tiers (`core/tier.js`)

| tier | where | particles | shadow grid | cloth grid | decal res |
|---|---|---|---|---|---|
| `draft` | CPU cloud box, 960x540 | 0.35x | 20^3 | 0.6x | 256 |
| `preview` | full-HD previews | 0.6x | 28^3 | 0.8x | 512 |
| `final` | 4K on the render PC (RTX 4090) | 1x | 40^3 | 1x | 1024 |
| `ultra` | hero shots | 2.5x | 56^3 | 1.25x | 2048 |

`resolveTier(ctx, o.tier)` takes `o.tier`, else `ctx.quality.fxTier` / `ctx.quality.tier` /
`ctx.meta.fxTier`; with none (or `'auto'`) it follows the render preset - on software GL
(SwiftShader) `draft` / `preview`, on a GPU `preview` for draft and preview renders and `final`
otherwise (`ultra` only when asked for). Tiers scale counts and
resolutions, never the look: per-particle density is renormalised so a cloud keeps its opacity.

## Modules and calls

**Blood (`blood.js`, decals in `core/decal.js`)** - F1
* `fx.blood.spray({ at, dir, t0, duration, amount, speed, spread, size, mist, target(s), hitPlane, maxStamps })`
  drops with log-normal sizes, drag, gravity; each drop's landing (ground, wall plane, meshes) is
  found at setup and stamped into decals at its landing time; fine mist.
* `fx.blood.drip({ at, t0, rate, ... })` forming drops, fall, splash, ground stamps.
* `fx.blood.pool({ at, radius, delay, tau, joints, target })` spreading pool (lobed). No joints unless
  given: `joints: { mesh: pavingMesh }` takes the set's OWN paving joints (its cobble / flag meshes
  rasterised from above; a joint is the low part of the local relief or the bed between stones -
  `res`, `reach`, `relief`, `bed`), or `{ fn(x, z) -> 0..1 }`, or `{ map: Texture }`; the old
  procedural `{ pattern: 'cobbles' | 'flags' }` only for a ground with no geometry of its own. On
  paving the blood lies thin on the stone tops and deep in the joints; give `target: [ground,
  pavingMesh]` so the film follows the stones.
* `fx.blood.coat | splat | spatter | stamps | runs | smear | soak ({ target, at, dir, size, t0, grow, dry })`
  film decals on skin, scales, cloth, stone - two passes (transmittance multiply + lit wet film
  with clearcoat and meniscus bump), wet -> dry (`dry: [t0, t1]`), skinned meshes follow the bones.
* wet films on the ground and walls (`pool`, `smear`, `stamps`, `splat`, `wet`) mirror their
  SURROUNDINGS: a screen-space reflection marched against the scene's depth in the late pass
  (house fronts, a beam lying in the pool, people), the sky map only where the ray leaves the
  frame (`ssr: false | steps`, `ssrStrength`; steps by tier 16 / 24 / 32 / 48). A liquid film has
  one interface: liquids carry `spec: 0` (no second mirror under the clearcoat).
* `fx.blood.water({ at, height(x,z,t), t0, radius })` blood clouding sea / bowl water; `fx.blood.tint(conc)`
  for tinted-water states (pink bowl, runoff).

**Gore (`gore.js`)** - F2, F3 (realistic, brief; nothing lingers)
* `fx.gore.wingRoot({ creature, side: 'L', t0, back, bleed, bleedAt, membrane })` the scout's torn wing
  root: crater of exposed muscle, hide flaps, broken bone ends, membrane strips that flap, blood
  coat running back over the flank, pulsing spray.
* `fx.gore.openFracture({ character, side: 'R', t0 })` bone through the torn, soaked hose below the knee
  (the wound bed is wrapped round the shin, its radius measured by rays across the leg, so it fills
  the ragged hole; bone under a patchy blood film, never clean).
* `fx.gore.scalp({ character, side, t0, streams })` split scalp, blood down one side of the face in
  separate streams that merge and part (coat decal `params.w` = streams 0..1, the sheet's sides
  wander as it runs down).
* Cloth holes measure bind-space units per world metre round their centre, so `radius` is metres on
  any garment.
* `fx.gore.burnedRider({ character, side, t0, burnTime, neck })` the sleeve burned through every
  garment layer the ray from outside meets (charred hole edges), the forearm under it shaded as a
  burn graded out from the middle (eschar, raw weeping dermis, slough, blisters, reddened skin).
  `neck: true` also burns through the hood / collar at the side of the neck (opt-in: under the scout
  rider's hood it does not read yet - see PROGRESS).
* building blocks: `hole` (garment holes: char / torn / wound edges), `burn`, `gash`, `char`, `appliance`.

**Dust (`dust.js`)** - F5
* `fx.dust.downwash({ at, t0, bursts: [s...], radius, strength, color })` wall jet + rolling ring vortex
  per downstroke (take-off / landing; colours `loam`, `chalk`, `sand`, `road`, `ash`).
* `fx.dust.cloud({ at, t0, radius, dir, speed, spread, color, life, grow, thin, fall })` impact /
  collapse cloud (`grow`: how fast the puffs swell, `thin`: dilution 1/s, `fall`: share of heavy
  dust falling with the debris).
* `fx.dust.haze({ box, t0, t1, density, color })` settling haze.
* `fx.dust.settle({ target, box | at + size, t0, tau, thickness, color })` what the air leaves:
  a dry matte layer of dust / lime / ash (`color: 'lime' | 'chalk' | 'ash' | DUST_COLORS name |
  [r,g,b]`) on whatever is under it - the ground (no target), set objects, characters and
  creatures (skinned: it rides with them) - heaviest on what faces up, a trace on walls, none
  underneath, thickening over `tau` s (decal kind `settle`, liquids `dust` / `lime` / `ash`). The
  roofline lays one over the square under its haze (`settleOn`: the meshes to dust).

**Debris and destruction (`debris.js`, `destruction.js`)** - F6, 1C take-off (async: `await`)
* **The set's own roofline coming down (3C-11)** - build the set with a capture of its damage
  region, then bring exactly those tiles down:
  ```js
  const cap = fx.debris.damageCapture((x, y, z) => inHole(x, y, z), { name: 'cling-3c' });
  const set = await clingSquare(ctx, { damage: cap.damage });   // house(): damage + { toWorld }
  await fx.debris.roofline({ capture: cap, set: set.group, t0: 1.2, impact: [x, y, z], dir: [0.5, -0.3, 0.8], speed: 9, walls });
  ```
  The architecture asks the capture about every tile it lays; the removed ones come back as FX
  tiles of the same size (clay plain tiles or stone slates, read from the course layout), in the
  roof's own clay / slate batch and at the height of the set's neighbouring tiles (read from its
  tile mesh) - HELD in place until the failure reaches them, so the shot can open on the intact
  roof. Near the impact (`blast`, m) tiles, battens, rafters, deck boards and splinters are
  blown along `dir`; beyond it the roof lets go in sheets (`sheet: [0.9, 0.7]` m) that slide down
  the slope (g (sin a - mu cos a), `mu`), lowest first, and tip off the eaves. Dust: a grey-brown
  strike cloud, curtains pouring off the eaves with the biggest sheets, lime dust where it lands,
  settling haze and the film it leaves (`dust: false | { color, strength, curtains, haze, settle }`,
  `settleOn`).
  The roof sheds as an avalanche, not a card wall: sheets hang on for a moment (`hang`, s, mean
  0.45), each lets go course by course from the eaves up (row delay + jitter), every slate drags
  with its own friction, tips about its own axis (+-30 deg off the course, some backwards) and
  falls broadside with a flutter glide of its own (high drag toward a sideways drift, `flutter`),
  landing flat with little bounce near the wall foot.
  `panels: { box, n, count, crumbs, speed }`: the timber-framed storey's lime-plaster panels under
  the eaves burst out (whole daub slabs with the wattle in their backs, plaster crumbs) and the
  wall keeps the brown daub where the skin came off (`spall` decals on the set's `...:plaster`
  meshes only, so timbers and windows stay). `beam: true | { at, side, length, release, w0, carry }`:
  the eaves beam broken at the impact and pinned at its far end swings down on the hinge, tears
  free and is thrown into the square (R15-02); the solver's pivot segment with `release`.
* `fx.debris.object({ object, t0, dir, speed, spin })` throws a whole prop (the guard's spear, the
  watchman's cup, a crate); standing on the ground it first TOPPLES over its far bottom edge
  (`topple`, `carry`), then tumbles; it is held where the set put it until t0.
* `fx.debris.sweep({ object, t0, dir, speed })` (3C-12, the vendor's stall): the prop is split
  into its loose parts (`fx.debris.split`: connected pieces of its merged meshes, grouped by
  overlapping bounds - a basket with its apples, a barrel with its hoops; a loaf merely resting on
  the counter is its own part); the frame topples and tumbles, everything loose is thrown with the
  gust, the lighter the further.
* `await fx.debris.collapse({ box, t0, dir, speed, pieces })` a generic roof / wall section.
* `await fx.debris.burst({ at | box, dir, spread, speed, t0, pieces: { tile: 20, plaster: 30, daub: 6 } })`.
* `await fx.debris.boards({ at, dir, t0, count, speed })` stage boards scything across the paving.
* `await fx.debris.turf({ at, radius, t0, bursts, speed })` torn sod (grass on top, roots under),
  clods, stones under a take-off.
* pieces: tile, tileShard, beam, rafter, batten, board, splinter, plaster, daub (lime face, clay
  daub and the hazel wattle in the broken back), stone, turf, clod; the props festival breakables
  when present. Closed-form flight with drag, bounces (restitution + Coulomb friction) off the
  ground and off wall faces (`walls: [{ p, n, width, height }]`), slide, settle on a stable face.
  **Piles**: pieces are solved in the order they come to rest, each against the ground plus the
  pieces already lying there (a sparse height grid), and tilt to lie on what is under them.
  **Shattering**: clay tiles break into 2-4 shards, plaster into crumbs, at hard impacts
  (`shatter: false`, `shatterAt`). Impact grit + dust (the dust of many impacts is shared, not
  stacked). Everything is solved once in setup; any frame is drawn alone.
* **After-state (3D, X27, X28)**: build the same calls with `t0` far in the past (e.g. -100): every
  piece lies where it came to rest in 3C (`effect.restPoses()`, `thrown.restPose()`). Through the
  director the set says which shots are after it (`set.fxAfter`, below).

**Smoke (`smoke.js`)** - F2, F4, F5
* `fx.smoke.plume({ at, t0, t1, kind, rate, size, wind })` kinds `wood`, `chimney`, `smoulder`, `soot`,
  `cloth`, `steam`; self-shadowed, multiple-scattering puffs.
* `fx.smoke.trail({ at: movingFn, t0, t1 })` streaming off something moving (burning sleeve).
* `fx.smoke.wisp({ at, t0, t1, kind: 'pipe' | 'herb' })` laminar ribbon breaking into curls (R2-R9).

**Fire (`fire.js`, `core/blackbody.js`, `core/flamevol.js`, `core/jetvol.js`)** - F2
* Emission in ABSOLUTE scene radiance from temperature: blackbody chroma (Planck x CIE fit -> linear
  sRGB) and luminance Y = Y0 (Y_P(T) / Y_P(1500 K))^0.5 (Y0 0.42-0.45): bodies grade saturated
  orange (Y 0.15-0.5), cores clip to yellow-white and bloom (Y > 5), tips dark red (< 0.05) -
  self-tested through the film finish. Leaf's fire maps the same field through a violet-blue ramp.
* `fx.fire.jet({ creature | origin, dir, t0, t1, palette: 'standard' | 'leaf', length, render })`
  dragon fire as a ray-marched VOLUME along the jet's centreline (bisector-slab parametrisation,
  flow noise advected with the gas, big billows, soot creases, per-step shutter time = motion
  blur; `render: 'particles'` for the old packets); embers, soot, heat shimmer, ground splash,
  scorch. Its lights sit at the emission centroids of three bins along the jet with intensity =
  radiance x area of the flame they stand for (the light and the visible flame cannot disagree).
* `fx.fire.burn({ at, size, height, t0, t1 })` a burning object as a buoyant flame volume (sheet
  factor from the wind; licks from noise advected on the buoyant time of flight; puffing at
  1.5 / sqrt(D)); light from its own field (`vol.emission`); `embers`, `shimmer`, `scorch`, `char`.

**Water (`water.js`)** - F1 sea stain, F8, C17
* `fx.water.splash({ at, t0, size, height })` crown, sheet, Worthington jet, mist, foam patch.
* `fx.water.spray`, `foam`, `trail`, `churn`, `downwash({ at, t0, bursts, radius })` (pale ring,
  spray sheet, mist on the FFT ocean; `height(x,z,t)` = the ocean's surface).

**Cloth (`cloth.js`)** - F9 banners, R18-03, R21
* `fx.cloth.banner({ hoist, size, t0, gust, wind, tear: { t, from, to, dur }, colliders, fabric, color, border })`
  released from its pole and thrown, or ripped along a ragged line (the grid really splits).
* `fx.cloth.drape({ body: { at, yaw }, size, t0 })` a cloth (banner) lying over a body;
  `bodyColliders()`; `fabricMaterial()` (photo weave, dye, woven border, grime on metre UVs).

**Sparks and ash (`sparks.js`)**
* `fx.sparks.burst({ at, dir, t0, count, speed, spread, temp })` streaks that cool and skip off stone.
* `fx.ash.fall({ box, t0, t1, rate })` flakes fluttering down and settling.

## Director cues (`director.js`)

`scenes/lib/director/fx.js` imports `registerDirectorFx` from `index.js`; 38 kinds are registered:

`blood-spray blood-drip blood-pool blood-decal blood-water dust-downwash dust-cloud dust-haze
debris-burst debris-collapse debris-boards debris-turf debris-roofline debris-object debris-sweep
smoke-plume smoke-trail smoke-wisp fire-jet
fire-burn embers heat-shimmer scorch water-splash water-spray water-foam water-trail water-churn
water-downwash gore-wing-root gore-fracture gore-scalp gore-burned-rider cloth-banner cloth-drape
sparks ash-fall dust-settle`

```js
fx: [
  { kind: 'dust-downwash', id: 'launch', from: 0.5, at: 'launch', params: { bursts: [0, 0.85, 1.7], radius: 30 } },
  { kind: 'blood-pool', id: 'body', from: 0, at: [3.6, 0, 38.6], params: { radius: 0.7, tau: 6 } },
  { kind: 'gore-wing-root', id: 'scout', from: 0, params: { actor: 'scout', side: 'L' } },
]
```

`debris-roofline` takes `params.capture` = the name given to `fx.debris.damageCapture(region, { name })`
when the set was built (and `params.set` = a set object to match the tiles to; default the set's
group); `debris-object` / `debris-sweep` take `params.object` = a set object name.

`params` are the library call's options verbatim; t0 = 0 at the cue's `from`. `at` is an array, a
set mark, a point of the set builder's own (`set.point(name, t)`: a moving set piece such as the
boat under way, followed in time), a set object, or an actor point (followed through the
director's pure blocking estimate). Debris needs fixed positions.

* **Bodies** (gore, `blood-decal` / `dust-settle` / `scorch` with `params.actor`): the director
  hands the cast to FX (`api.actor(name) -> { kind, c | ch, root }`). These effects are built once,
  at the first frame that needs them, on the actor's REST pose (bind pose, root at the origin,
  upright) - never on whatever pose that frame has, so every render chunk builds the same thing -
  and ride the skin / bones from then on. Their `at` / `dir` / `up` are in the actor's own frame
  (metres from its root, +z its facing) or an actor part (`'remi.head'`, `'scout.wing.L'`).
* `gore-wing-root`: the spray follows the creature's flight - the wound's offset in the creature's
  frame carried along its blocking frame (`env.actorFrame`, pure); `at` on the cue or
  `params.bleedAt` override it.
* **After-state continuity**: a destruction cue (`debris-*`, `blood-pool`, `scorch`, `dust-settle`)
  whose cue is not running shows the set as the set built it (the stall standing) - unless the
  set says the shot is after it: `set.fxAfter = true | ['stall', 'roof'] (cue ids or kinds) |
  fn(id, kind)`, set per shot by the set builder (`applyShot`, e.g. from the shot spec's `fxAfter`
  or the continuity table). Then the effect shows its settled end state. (REQUEST director: set it
  for 3D / X25-X28.)

The director's own `lamp-flicker`, `dust-motes` and `shadow-pass` stay as they are.
`scenes/lookdev/fx-director.js` renders cues through the director's `FxRunner` (and matches the
direct calls frame for frame).

Ready-to-paste cues for the shots that have FX (the director track owns the shot specs; the
current prologue / sea-coast specs P-02..P-16 put no dragon on screen):

```js
// P-03 the vessel under way: its wake (at: the set's moving boat point)
{ kind: 'water-trail', id: 'wake', from: 0, at: 'boat.stern', params: { width: 2.2 } },
// F1 the bite: spray thrown back along Charcoal's neck, the jaws coated (on his rest pose)
{ kind: 'blood-spray', id: 'bite', from: 1.2, at: 'charcoal.head', params: { dir: [0, 0.4, -1], amount: 1.4, duration: 0.8 } },
{ kind: 'blood-decal', id: 'jaws', from: 1.2, at: 'jaw', params: { actor: 'charcoal', kind: 'coat', dir: [0, -0.3, -1], size: [0.9, 0.7, 0.8], params: [0, 6, 0.9, 0.6] } },
// the scout's wing torn away in flight, the spray riding the flight path; blood in the sea below
{ kind: 'gore-wing-root', id: 'scout', from: 0.4, params: { actor: 'scout', side: 'L' } },
{ kind: 'water-splash', id: 'fall', from: 3.1, at: [x, 0, z], params: { size: 1.6 } },
{ kind: 'blood-water', id: 'stain', from: 3.4, at: [x, 0, z], params: { radius: 3 } },
// 3D / X27 the square after: dust on the dead and the debris
{ kind: 'dust-settle', id: 'dust', from: -100, params: { box: [[-6, 0, -2], [6, 2.5, 8]], color: 'lime', thickness: 0.2 } },
```

## How it fits the cinematic stack

* Particles are camera-facing capsules spanning the shutter interval (motion blur built in,
  energy-normalised so streaks do not brighten); they are skipped on the velocity pass's
  shutter-open pose. Rigid FX (debris, cloth, gore appliances) pose there too and get vectors.
* Each particle layer has a depth twin that writes an alpha-weighted depth so haze, aerial
  perspective and DOF see smoke and dust at their own distance, not the background's.
* The shared light rig reads the scene's sun / sky / ground and up to 4 point lights (fire light
  reaches smoke and dust); clouds self-shadow through a deep-shadow grid and take multiple-
  scattering octaves so thick dust is bright, not sooty - energy-normalised: the lit side of an
  optically thick cloud of albedo a looks like a matte surface of about that albedo (never
  brighter than the lime-washed wall beside it).
* Decals and water patches render in the late pass where they need the scene's depth / colour.

## Lookdev scenes

`scenes/lookdev/fx-blood.js`, `fx-gore.js`, `fx-dust.js`, `fx-destruction.js`, `fx-cling.js`,
`fx-smoke.js`, `fx-fire.js`, `fx-water.js`, `fx-cloth.js`, `fx-director.js`, `fx-scales.js` - each a few views of
a few seconds with scale references (grey ball albedo 0.4, 1.8 m post). `fx-cling.js`: two Cling
townhouses from the architecture library (clay and stone-slate roofs, both built with holes
through `damageCapture`), the vendor's stall from the props library swept apart, stage boards,
the after-state 100 s later, the pool along the paving joints and the smear down the front.
`fx-scales.js`: Charcoal after the bite (F1) - the jaws and chin coated and running, the spray
thrown back along his neck and the spatter it leaves on the scales, then the same 10 min later
(dried dark and matte); decals ride on the creature's skinned hide.

```
node render/render.mjs --still scenes/lookdev/fx-cloth.js --time 1.7 --preset draft --png out.png
node render/render.mjs scenes/lookdev/fx-fire.js --preset preview --seconds 6
node scenes/lib/fx/tools/selftest.mjs        # determinism + physics checks (no browser)
```

Cost on the CPU cloud box (SwiftShader, 4 vCPU): draft stills 4-17 s per frame of render
(18-45 s with page load and setup); preview 1920x1080 stills 14-37 s. Cloth pre-simulation
~0.5-3 s per banner in setup. On the RTX 4090 the GPU work is a small fraction of these.

## Limits / not built here

* Particles are evaluated and sorted on the CPU each frame (closed-form motion, packed-key native
  sort): 140k particles fill + sort in ~83 ms per frame on the 4-vCPU cloud box (14k: ~20 ms), a
  small part of a 4K frame on the RTX PC; `ctx.quality.fxParticles` scales the counts on a GPU (the
  `ultra` tier is 2.5x). A vertex-shader evaluation of the ballistic layers (launch data uploaded
  once, `t` as a uniform) is the next step if counts need to go past ~50x.
* Debris tiles / shards are plain meshes (the architecture tile material takes its normal from
  modelMatrix: REQUEST architecture - normal from `instanceMatrix` under USE_INSTANCING; then the
  debris draws one InstancedMesh per kind / variant).

* Transparent FX drawn in the late pass get the runtime's haze for the depth found per pixel;
  the depth twins fix most of it, but the cleanest fix is an aerial-perspective lookup for late
  transparent objects in the runtime (requested from gpu-tier/runtime).
* Cloth has no self-collision (fine for brief shots); one tear line per cloth.
* Not in this library: F7 mist white-out (atmosphere fog banks), F10 sun glare (film finish),
  F9 sail drop and the ale / cup pours (props bakes).
