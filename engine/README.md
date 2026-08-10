# Legend Engine

A real-time 3D engine that runs in a browser tab. Rigid-body physics, Voronoi
destruction, particle fluids, PBR rendering with shadows and bloom, instanced
grass, skinned characters with expressive faces — all procedural, no asset
downloads, one `<script>` tag.

Built for [Legend](../legend.html) so that a generated game can be a single
self-contained HTML file and still look and behave like a real game.

```html
<script src="/engine/legend-engine.js"></script>
<script>
  const game = LE.create({ sky: 'sunset' });
  game.ground({ material: 'grass', size: 120, grass: true });
  game.box({ at: [0, 3, 0], size: 1, material: 'brick', breakable: true });
  game.orbit({ distance: 12, autoRotate: 0.2 });
  game.start();
</script>
```

That is a complete scene: lit, shadowed, physically simulated, breakable.

---

## What it actually does

| System | Implementation |
|---|---|
| **Physics** | Sequential-impulse solver, SAT narrowphase over convex hulls, 4-point manifolds, warm starting, split-impulse penetration recovery, island-based sleeping, joints, raycasts |
| **Destruction** | 3D Voronoi pre-fracture by half-space intersection, stress accumulation from contact impulses, multi-generation breakage, chunk budgeting |
| **Fluids** | Position Based Fluids — density constraint projection, artificial pressure, vorticity confinement, XSPH viscosity, two-way rigid coupling |
| **Water rendering** | Screen-space: sphere-splatted depth, bilateral smoothing, normal reconstruction, refraction, Beer-Lambert absorption, Fresnel, foam |
| **Rendering** | HDR forward PBR (GGX / Smith / Schlick), cascaded shadow maps with rotated-Poisson PCF, procedural sky used as both background and reflection probe, bloom, ACES tonemap, FXAA |
| **Materials** | 16 procedural surfaces synthesised at load — albedo, normal and ORM maps generated from simplex noise |
| **Animation** | GPU skinning via bone texture, keyframe clips with cross-fading, two-bone analytic IK |
| **Faces** | Procedural blendshapes for 5 emotions, 6 visemes, jaw and blink; text-driven lipsync; automatic blinking and gaze |
| **Vegetation** | Instanced grass, wind-bent in the vertex shader, noise-driven clumping |
| **Audio** | Procedurally synthesised impacts, shatters, splashes and tones — no audio files |

---

## Setup

```js
const game = LE.create({
  canvas: '#game',      // selector or element; omitted = full-screen canvas is created
  quality: 'high',      // 'low' | 'medium' | 'high' | 'ultra'; omitted = detected from device
  sky: 'sunset',        // see sky presets below
  gravity: -19.6,       // number (Y) or [x, y, z]
});
game.start();           // begins the requestAnimationFrame loop
```

Leave `quality` off. The engine reads device memory and core count and picks a
tier, because a phone and a desktop differ by more than 10x and one fixed
setting is wrong for most players.

## Objects

Every factory takes `at` (position) and returns an `Actor`.

```js
game.box({ at: [0, 2, 0], size: 1, material: 'wood' });
game.box({ at: [0, 2, 0], size: [4, 0.4, 2] });        // size can be per-axis
game.sphere({ at: [0, 5, 0], radius: 0.5, material: 'metal' });
game.cylinder({ at: [0, 1, 0], radius: 0.4, height: 2 });
game.capsule({ at: [0, 1, 0], radius: 0.35, height: 1.8 });
game.cone({ at: [0, 1, 0], radius: 0.5, height: 1.5 });
game.rock({ at: [0, 1, 0], radius: 0.8, seed: 3 });
game.convex([[0,0,0], [1,0,0], [0,1,0], [0,0,1]]);      // hull from points
```

Shared options:

| Option | Meaning |
|---|---|
| `material` | preset name, hex colour, CSS colour string, or an options object |
| `static: true` | never moves; the floor, walls, level geometry |
| `mass`, `density` | mass overrides density; default density is 1000 (concrete-ish) |
| `bounce` | restitution, 0–1 |
| `friction` | 0 = ice, 1 = rubber |
| `breakable` | `true`, or `{ pieces, threshold, pattern, maxGeneration }` |
| `velocity` | initial velocity |
| `rotation` | `[pitchDeg, yawDeg, rollDeg]` or a quaternion |
| `physics: false` | visual only, no rigid body |
| `trigger: true` | detects overlap without pushing |
| `lifetime` | seconds until it removes itself |

### Ground

```js
game.ground({ material: 'grass', size: 200, grass: true });

// Rolling terrain from a height function:
const noise = new LE.Noise(7);
game.ground({
  size: 200, segments: 128, material: 'dirt',
  heightFn: (x, z) => noise.fbm(x * 0.02, 0, z * 0.02, 4) * 6,
  grass: { max: 40000, area: 80 },
});
```

Note: a displaced terrain collides as a flat plane at `groundLevel`. Place
`static` boxes for anything the player must actually stand on.

## Materials

Preset names: `concrete brick wood metal steel gold copper rust rock stone
grass dirt sand marble ice glass fabric skin plastic tile rubber neon lava`

```js
material: 'brick'
material: 0xff5533
material: 'crimson'
material: { preset: 'metal', color: 0x88ff88, roughness: 0.15 }
material: { color: 'black', emissive: 0x00ffcc, emissiveStrength: 6 }
```

Useful fields: `color`, `roughness`, `metalness`, `emissive`,
`emissiveStrength`, `opacity`, `texture` (generator name), `uvScale`,
`normalStrength`, `subsurface` (light bleeding through — foliage, skin, cloth),
`doubleSided`.

## Sky and lighting

```js
game.setSky('night');            // day sunset night overcast dawn hell space toxic
game.setTimeOfDay(18.5);         // moving sun, 0–24
game.setWind([1, 0, 0.3], 0.6);  // direction, strength — drives grass and smoke
game.light({ at: [0, 3, 0], color: 0xffaa44, intensity: 40, radius: 15 });
```

Up to 8 point lights. The sun, shadows, fog and post-processing all live on
`game.renderer`:

```js
game.renderer.post.bloom = 0.8;
game.renderer.post.exposure = 1.2;
game.renderer.fog.density = 0.02;
game.renderer.shadows.distance = 80;
```

## Destruction

```js
const wall = game.box({ at: [0, 1, 0], size: 2, material: 'brick',
  breakable: { pieces: 16, threshold: 500, pattern: 'radial' } });

game.explode([0, 1, 0], { radius: 8, strength: 30 });  // blast + break + effects
game.shatter(wall, { point: [0, 1, 0], force: 6 });    // break it directly
```

Breakable objects are pre-fractured at creation, so breaking is instant rather
than a hitch at the worst moment. `threshold` is the contact impulse needed to
register damage; raise it for things that should survive being leaned on.
Patterns: `uniform` (glass, rubble), `radial` (impacts), `slab` (masonry),
`splinter` (wood).

Debris is capped by `chunkBudget` (default 260) and expires after
`chunkLifetime` seconds, oldest first.

## Water

```js
game.water({ at: [0, 3, 0], size: [4, 3, 4] });                 // a body of water
game.water({ at: [0, 6, 0], size: [1, 1, 1], velocity: [0, -4, 0] });  // a pour
```

Water collides with every rigid body in the scene and pushes dynamic ones back,
so a crate dropped in a pool displaces and gets shoved. Particle count is
capped per quality tier. `game.fluid` exposes the raw simulation.

## Characters

```js
const hero = game.character({ at: [0, 1.1, 0], color: 'navy' });
game.follow(hero, { distance: 6, height: 2.4 });

game.onUpdate((dt) => {
  const i = game.input;
  hero.controller.move(i.axes.x, -i.axes.y, i.down('shift'));
  if (i.justPressed(' ')) hero.controller.jump();
});
```

You get a skinned humanoid with idle/walk/run/jump/wave clips, a controller
with coyote time and jump buffering, and an expressive head:

```js
hero.face.setEmotion('smile', 1);   // smile frown angry surprised sad neutral
hero.face.say('watch out behind you');
hero.face.lookAt([1, 0, 0]);
```

Blinking and gaze run on their own. `say()` drives visemes and the jaw from the
text at a natural reading pace.

## Camera

```js
game.follow(actor, { distance: 7, height: 2.6, lag: 7 });
game.orbit({ center: [0, 1, 0], distance: 12, autoRotate: 0.2 });
game.firstPerson(actor, { eyeHeight: 1.6 });
game.lookAt([10, 6, 10], [0, 0, 0]);
```

Follow and orbit support drag-to-rotate and wheel-to-zoom, and the follow
camera pulls in rather than clipping through walls.

## Input

Read keys only. Legend's on-screen joystick and A/B buttons and any gamepad are
delivered as standard keyboard events, so a keyboard-only game works on phones
and controllers for free.

```js
const i = game.input;
i.axes.x, i.axes.y      // -1..1, merged from WASD, arrows and sticks
i.down('a')
i.justPressed(' ')      // Space = primary / A button
i.justPressed('x')      // X = secondary / B button
i.pointer.x, i.pointer.down, i.pointer.justDown
i.anyPressed            // anything at all this frame — use for "tap to start"
```

## Effects and audio

```js
game.particles.sparks([0, 1, 0], { count: 30, speed: 8 });
game.particles.dust([0, 0, 0], { count: 20 });
game.particles.smoke([0, 1, 0]);
game.particles.fire([0, 0, 0]);
game.particles.explosion([0, 1, 0], { scale: 2 });

game.audio.impact(0.8);
game.audio.shatter(1);
game.audio.splash(0.6);
game.audio.tone(880, 0.1);
```

Impacts and shatters fire automatically from collisions. Audio starts on the
first user gesture, as browsers require.

## Queries

```js
const hit = game.raycast([0, 5, 0], [0, -1, 0], 100);
// -> { body, actor, point, normal, distance }

const hit2 = game.raycastScreen(event.clientX, event.clientY);
if (hit2 && hit2.actor) game.shatter(hit2.actor, { point: hit2.point });
```

## Actors

```js
actor.position                  // live Vec3
actor.setPosition([0, 5, 0]);
actor.setRotation([0, 45, 0]);  // degrees
actor.setTint('red');
actor.push([1, 0, 0], 12);      // direction, resulting speed — mass-independent
actor.setVelocity([0, 8, 0]);
actor.visible = false;
actor.destroy();
```

`push` takes a speed rather than an impulse on purpose: raw impulses are
meaningless once density changes an object's mass.

## Loop

```js
game.onUpdate((dt, game) => { /* before physics */ });
game.onLateUpdate((dt, game) => { /* after physics, before render */ });
game.timeScale = 0.3;   // slow motion
game.paused = true;
game.stop();
```

`game.stats` carries `fps`, `draws`, `actors`, `bodies`, `particles`.

---

## Building

Sources live in `engine/src/*.js` as plain scripts (no import/export) and are
concatenated into one IIFE. This keeps the engine a single `<script>` tag with
no bundler, no import map and no CORS story — which is the whole point, since
every Legend game is one self-contained file.

```bash
npm run build:engine       # -> site/engine/legend-engine.js
npm run watch:engine
npm run test               # solver, fracture and fluid — headless, no GPU, no deps
npm run test:engine        # 8 scenes in real WebGL2 + screenshots
npm run test:integration   # a game in a sandboxed iframe over HTTP (the AIGB path)
npm run test:all
```

The browser tests need Playwright (`npm i --no-save playwright`); the solver
tests need nothing at all, which is deliberate — the parts most likely to
break silently are the ones you can check anywhere.

Open `site/engine/demo.html` from any static server to see it running.

Files are concatenated in filename order, so the numeric prefixes are load
order. Add new modules with a prefix that places them after their dependencies.

## Honest limits

Worth knowing before you hit them:

- **Not Unreal or Unity.** Those are decades of work by large teams. This is a
  browser engine with a real feature set, built to make one-file games look and
  feel good — not a general-purpose production toolchain.
- **Convex collision only.** Concave shapes must be built from multiple convex
  pieces. There is no triangle-mesh collider.
- **Terrain collides as a plane.** Displaced ground is visual; use static
  boxes for surfaces the player stands on.
- **Water is a particle sim**, so it is a few thousand particles, not an ocean.
  It is for pools, pours, splashes and floods.
- **One shadow-casting directional light** plus 8 point lights, and point
  lights do not cast shadows.
- **No global illumination.** Ambient light comes from an analytic sky, so
  there is no colour bleeding between surfaces.
- **Non-uniform scale on curved meshes** shifts normals slightly. Boxes are
  exact; spheres prefer uniform scale.
