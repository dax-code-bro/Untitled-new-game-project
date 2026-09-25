# MOOR3D — C++ / WebAssembly 3D engine

A real-time 3D renderer written from scratch in **C++17**, compiled to
**WebAssembly**, rendering through **WebGL2 (OpenGL ES 3.0)** with hand-written
GLSL. It is genuinely C++ — and it still opens as a link, because a native
binary cannot be a URL.

**Play:** https://untitled-new-game-project.vercel.app/moor/
**Source:** `engine/src/` · **Build:** `./engine/build.sh` · **Output:** `site/moor/`

---

## Why WebAssembly

The request was "entirely C++" *and* "give me the link". Those are in direct
tension: a native C++ binary is a download, not a URL. Compiling the same C++
to WebAssembly satisfies both — every line below is C++ or GLSL, and it runs at
a link with no install.

The engine is also plain enough C++ that swapping the platform layer for SDL2 +
desktop GL would produce a native build from the same sources. Nothing in
`mathx.h`, `models.h`, `anim.h` or `world.h` is web-specific.

---

## Layout

| File | Lines | What |
| ---- | ----- | ---- |
| `src/mathx.h`   | ~330 | vec2/3/4, quaternion (slerp), mat4, inverse, noise, PRNG |
| `src/gl.h`      | ~290 | shader/program objects, FBOs, shadow maps, instanced meshes, frustum |
| `src/shaders.h` | ~470 | every GLSL shader in the engine |
| `src/models.h`  | ~930 | procedural mesh builders — all geometry, zero asset files |
| `src/anim.h`    | ~590 | three rigs, keyframed clips, sampling, cross-fade blending |
| `src/world.h`   | ~560 | terrain, biomes, roads, city generation, spatial buckets |
| `src/main.cpp`  | ~1300 | renderer, frame graph, simulation, input, HUD |

Build output is a **~200 KB `.wasm`** plus a 60 KB JS loader.

---

## Rendering pipeline

Per frame:

```
3 shadow cascades  →  HDR forward pass  →  bloom  →  ACES + FXAA  →  screen
```

**Physically based shading**
- GGX / Trowbridge-Reitz normal distribution
- Smith height-correlated visibility
- Schlick fresnel, metallic/roughness workflow
- Hemisphere IBL approximation for ambient (sky above, bounce below)
- Up to 16 dynamic point lights — headlights and street lamps, windowed
  inverse-square falloff

**Cascaded shadow maps** — 2048 / 2048 / 1024, split at 90 m / 320 m / 1400 m,
16-tap Poisson PCF, cascades snapped to texel increments so shadows don't
shimmer as the camera moves.

**Atmospheric sky** — analytic Rayleigh + Mie single scattering with correct
phase functions, sun disc, warm horizon at low sun angles, and procedural stars
plus a moon at night. Driven by a real day/night cycle.

**Water** — four travelling wave trains summed in the vertex shader with
*analytic* derivatives, so the normal is exact rather than approximated.
Fresnel, sky reflection, and a tight specular lobe that produces a sun-glitter
path across the surface.

**Post** — RGBA16F HDR target, soft-knee bright pass, separable Gaussian bloom,
ACES filmic tonemapping, FXAA 3.11, vignette, ordered dither to kill banding,
sRGB encode.

**Performance** — GPU instancing, frustum culling, spatial bucketing, streamed
terrain chunks, and a quality ladder (low / high / 4K) that scales internal
render resolution independently of canvas size.

---

## Geometry — every model, no asset files

All meshes are generated in C++ at load (~30 ms total):

- **Character** — skinned humanoid on a 16-joint rig: pelvis, spine, chest,
  head, and full arm and leg chains
- **Animals** — our own 20-joint quadruped rig, with **8 species** built on it:
  deer, elk, wolf, bear, boar, fox, rabbit, bighorn. One rig, one builder, and
  a table of proportions — body girth, neck, snout, leg thickness, ear size,
  coat colours — plus antlers, curled horns and tusks. Leg segment lengths are
  read from the rig itself so mesh and bones can never drift apart.
- **Birds** — 4-joint rig with independent wings, flapping and gliding overhead
- **7 car chassis** — sedan, coupe, SUV, pickup, van, compact, sport, each with
  tapered hull, cabin, glass, bumpers, lights and mirrors; plus a police variant
- **Wheels** — tyre, rim and five spokes, drawn four times per car with
  independent steer, spin and suspension
- **Buildings** — towers with setbacks and glazing bands, houses with pitched
  roofs and windows, apartments with balconies, shops with awnings
- **Nature** — broadleaf and conifer trees, bushes, multi-lobe rocks
- **Street furniture** — lampposts with curved arms, traffic lights, benches,
  fire hydrants, litter bins, and bus shelters (~4,700 pieces placed along the
  city kerbs)

Buildings and props are drawn **instanced**: one mesh, one draw call, thousands
of transforms.

---

## Animation — every animation

Real skeletal animation, not sprite swapping:

- 16-joint hierarchy; skinning matrix per joint = `animatedWorld × inverseBind`
- **Keyframed clips**: idle, walk, run, sprint, sit (driving), wave
- **Quadruped gaits** — idle, walk, trot, gallop, alert and graze. Each gait is
  authored once as a 4-sample limb cycle and then phase-shifted per leg, so the
  footfall sequence is genuinely correct: the walk is a 4-beat lateral sequence,
  the trot moves diagonal pairs together, the gallop is rotary with the hind
  legs leading. The spine flexes twice per stride and the head counter-nods to
  stay level.
- Animals pick their gait from real ground speed and spook into a gallop when
  you get close — further away if you're in a car. Grazers put their heads
  down; predators prowl instead.
- Clips are authored as joint rotation keys and sampled with **slerp**
- **Cross-fade blending** between clips, so there is no pop when you go from
  standing to walking to sprinting
- Clip playback speed scales with actual ground speed
- Root motion overlay: vertical bob, forward lean, side-to-side sway
- Vehicles animate too — wheel spin from real speed, steering angle, per-corner
  suspension from terrain slope, body roll under cornering and pitch under
  acceleration
- Foliage sways in the vertex shader, phase-offset per instance

---

## World

The same 100 sq mi as the 2D build, now with real elevation:

- **16 km × 16 km**, 512×512 heightmap, generated in **~280 ms**
- **30.00% water · 40.00% built · 30.00% wild** — exact, by percentile
  thresholding rather than tuned constants
- ~17,000 buildings, ~122,000 trees and rocks, 1,420 road segments
- Roads are carved into the terrain so tarmac never floats or sinks; urban
  cells are flattened so city blocks sit level
- Six districts, highways force-routed between them with bridges over water

---

## Bugs worth recording

Three real defects found by testing, each of which looked like something else:

1. **Animal legs floated in disconnected blobs.** The leg meshes used
   hardcoded segment lengths that didn't match the joint offsets in the rig, so
   each limb had gaps at the knee. Segment lengths are now derived from the rig
   itself.
2. **Every shadow lookup returned 0.** Depth textures are *not* linearly
   filterable in GLES3. Setting `GL_LINEAR` made the sampler incomplete, so
   every fetch returned zero — which reads as "fully shadowed". The entire
   world was lit by ambient only. `GL_NEAREST` (we do our own PCF) fixed it.
3. **Roads were invisible.** The ribbon triangles were wound backwards — the
   `(direction, perpendicular)` basis is left-handed where the terrain's
   `(+x, +z)` basis is right-handed — so every road face pointed down and was
   back-face culled.
4. **The FPS counter overstated framerate ~5×.** It accumulated the *clamped*
   simulation delta instead of real elapsed time, so it could never report
   below 10 fps. Movement looked broken as a result; movement was fine, there
   were simply very few frames.

---

## Controls

| Input | On foot | Driving |
| ----- | ------- | ------- |
| WASD / arrows | move | throttle + steer |
| Shift | sprint | — |
| mouse | look (click to capture) | look |
| F | enter nearest car | exit |
| Space | — | brake |
| O | time +3h | |
| R | toggle 4K internal resolution | |
| T | toggle FXAA | |

Touch devices get a virtual stick and CAR / RUN buttons that feed the same
input path.

---

## Building

```bash
git clone https://github.com/emscripten-core/emsdk
cd emsdk && ./emsdk install latest && ./emsdk activate latest && cd ..
./engine/build.sh            # release
./engine/build.sh debug      # assertions + GL debug
```

Output lands in `site/moor/`. It must be served over HTTP (not `file://`)
because WebAssembly streaming instantiation requires a real `application/wasm`
response.

---

## Honest limits

- **Performance is unverified on real GPUs.** This container has no GPU; all
  testing ran on a software rasteriser (SwiftShader) at ~2–4 fps, which says
  nothing about hardware. The frame is built for GPU — instanced, culled,
  ~200k triangles — but the number you get on your machine is the first real
  measurement.
- **"4K" means internal render scale**, not a guarantee. `R` or the 4K button
  renders at 2× CSS resolution; on a 4K display that is 3840×2160. It is not
  forced on a 1080p panel where it would only cost performance.
- The 3D build is a **renderer and world**, not yet the full sandbox. The
  gameplay systems (crime, org founding, property, fishing, wildlife tagging)
  currently live in the 2D build at `/city.html`.
