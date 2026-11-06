# Southbound engine architecture: where it is, where it should go

An answer to the "Principal Web3D Engine Architect" brief (WebGPU, GI/SSAO, PBR micro-abrasion,
LOD + KTX2 streaming, workers + SharedArrayBuffer, a `navigator.gpu` hardware check). Each part
says what the game does today, what's worth doing next, and how, with code that fits this codebase.

One correction first: the "17 FPS / 76 ms / NO GPU: SwiftShader" numbers in our screenshots come
from the cloud test machine, which has no graphics card. They say nothing about a real PC. Every
claim below that has a number was measured; nothing else is promised.

## Status at a glance

| Brief item | Status in the game | Where |
| --- | --- | --- |
| Hardware check (`navigator.gpu`) | **Done.** Software rendering and "browser on built-in graphics while a faster card idles" are both detected and explained on the menu and in the FPS readout | `src/settings.js` `detectGPU`, `probeGPU`; `src/ui/menu.js` |
| Dynamic GI | **Done in WebGL2.** Local light capture (cube of the surroundings, PMREM-filtered into reflections and ambient), ground-colour bounce, real street-lamp and headlight light pools, gunfire light | `src/core/gi.js` |
| SSAO | **Done in WebGL2** (N8AO, a GTAO-style pass) | `src/core/post.js` |
| PBR micro-abrasion | **Done in WebGL2**, material-agnostic: one edge/cavity bake for every mesh (in a Web Worker), one shader, wear per substrate from the substrate scanner | `src/core/abrasion.js`, `src/core/imperfect.js`, `src/core/substrate.js` |
| Worker offload | **Started:** the abrasion bake runs in a worker (98 ms worst case on the main thread before, 7 ms after). Physics/AI still on the main thread | `src/core/abrasion.js` |
| KTX2 textures + mesh LOD streaming | **Not done.** Recommended next (below) | — |
| WebGPU renderer | **Not done, and not recommended yet** (below) | — |

## 1. WebGPU: not yet, and why

The game is built on three.js's WebGL renderer and leans on it hard: 20 material builders in 12
files patch the stock shaders with `onBeforeCompile` (terrain, buildings, facades, roads, water,
grass cards, car paint, scatter rocks, bullet holes, sky and clouds), the imperfection/abrasion
code patches three's shared shader chunks for every material, and the post stack (pmndrs
`postprocessing`, N8AO) is WebGL-only. three's `WebGPURenderer` doesn't run
`onBeforeCompile` at all: every one of those materials would have to be rewritten as TSL node
materials before the first frame draws correctly. That's weeks of porting with nothing new on
screen, and it only pays off if the GPU or the CPU's draw submission is the bottleneck on the PCs
that matter. We don't know that yet: the FPS readout's third line (CPU-bound / GPU-bound, and which
card) is the first thing to read on a slow PC.

What WebGPU would actually buy: compute shaders (GPU culling, Hi-Z, GPU particles, real-time GI
probes), indirect draws, and cheaper draw submission. When those become the bottleneck, migrate
like this, one material at a time, with the WebGL2 backend as the fallback (it needs three's
`three.webgpu.js` build vendored next to `three.module.js`; the TSL below is a sketch of the port,
not shipped code):

```js
// src/core/renderer.js: one entry point, WebGPU where it exists, WebGL2 underneath otherwise
import * as THREE from 'three/webgpu';
export async function createRenderer(canvas, q) {
  const r = new THREE.WebGPURenderer({ canvas, antialias: q.aa === 'msaa', powerPreference: 'high-performance' });
  await r.init(); // falls back to its WebGL2 backend when navigator.gpu is missing or refuses
  // the game's own tone curve and grade move across as TSL output nodes
  return { r, backend: r.backend.isWebGPUBackend ? 'webgpu' : 'webgl2' };
}
```

The abrasion shader, as a TSL node instead of a GLSL chunk (same maths as `imperfect.js`):

```js
import { attribute, Fn, float, vec3, min, smoothstep, fwidth, mix, positionWorld, mx_noise_float } from 'three/tsl';
export const edgeWear = Fn(([base, rough, metal]) => {
  const e = attribute('sbEdge', 'vec4');                       // baked by core/abrasion.js, unchanged
  const conv = (c) => c.lessThan(5000.0).select(c, float(1e9));
  const dv = min(conv(e.x), min(conv(e.y), conv(e.z)));        // metres to the nearest outside edge
  const nb = mx_noise_float(positionWorld.mul(18.0)).mul(0.5).add(0.5);
  const width = float(0.003).add(nb.mul(0.012));
  const k = float(1).sub(smoothstep(width.sub(fwidth(dv)), width.add(fwidth(dv)), dv));
  return { color: mix(base, vec3(0.6, 0.6, 0.58), k), roughness: mix(rough, 0.32, k), metalness: mix(metal, 1.0, k) };
});
// mat = new THREE.MeshStandardNodeMaterial(); const w = edgeWear(...); mat.colorNode = w.color; ...
```

## 2. Global illumination (shipped, WebGL2)

`src/core/gi.js`, Medium preset and up:

- **Local light capture.** Every 1.5-4 s (and straight away after moving 28 m) the big shapes
  round the camera (ground, buildings, roads, water, sky, trees; camera layer 3) are drawn into a
  32-128 px half-float cube, one face per frame, then PMREM-filtered into `scene.environment`.
  Car paint, glass and metal reflect the actual street; ambient light takes the colour of a brick
  canyon, a meadow, a sunlit plaza. Cost measured in the software renderer: a full six-face capture
  is about 0.75 of one frame, spread over six frames; the main render is unchanged.
- **Ground bounce.** The hemisphere light's ground colour follows the albedo underfoot (grass, dry
  grass, sand, forest litter, pavement, water), lit by the sun.
- **Real lights.** After dark the nearest street lamps become real point lights (2-8 by preset),
  the car you drive gets a pair of headlight spots, gunfire lights its surroundings. Pool sizes
  are fixed so no shader ever recompiles.

Next step if we go further in WebGL2: a coarse grid of irradiance probes (L1 spherical harmonics)
baked from the same cube captures as you move, so interiors of a street and under bridges get
their own bounce instead of one capture per camera position.

## 3. PBR micro-surface and abrasion (shipped, WebGL2)

- **Micro-surface** (`imperfect.js`): every stock PBR material gets world-space roughness
  variation, hairline scratches in the highlights, dust on up-facing faces and a faint
  orange-peel/cast normal up close. Far pixels pay for one noise lookup, not five.
- **Substrate scanner** (`substrate.js`): one table of substrates (steel, painted sheet metal,
  aluminium, cast iron, wood, painted wood, bark, glass, plastic, rubber, concrete, asphalt, brick,
  stone, ceramic, plaster, stucco, fabric, leather, food, flesh, foliage, and the ground's grass,
  dirt, sand, litter, water) and one `scan()` that reads any hit, object, material or ground
  point: tags first, then object/material/texture names, then the surface's own physics
  (metalness, transmission, sheen, clearcoat, roughness, colour), then the terrain's layers. It
  drives bullet penetration and holes, impact debris, footsteps, grip and wear. Press **N** in
  game to see what it reads.
- **Abrasion** (`abrasion.js` + the `WEAR` chunk): each mesh's feature edges are found once, in a
  worker (faces meeting at more than 32°, convex or concave), and stored as exact per-pixel
  distances to the nearest outside edge and inside corner. The shader chips painted metal to bare
  steel with rust in the joints, polishes bare metal edges, wears wood pale, rubs paint through to
  timber, stress-whitens plastic, chips stone pale, frosts glass, fades fabric, polishes leather,
  greys rubber. No textures, no UVs, crisp at any distance.

## 4. Streaming: KTX2 textures and mesh LOD (recommended next)

This is the change most likely to help a mid-range PC: the photo-scanned surfaces are JPG/PNG,
so every one is decoded on the main thread and lives on the GPU uncompressed (4 bytes a texel
plus mips). As KTX2 (Basis) they stay block-compressed on the GPU, 4-8x smaller, and upload
without a main-thread decode.

Offline, per texture (KTX-Software's `toktx`):

```sh
# colour: ETC1S is smallest; normals and roughness/height want UASTC (higher quality, linear)
toktx --t2 --encode etc1s --clevel 4 --qlevel 192 --genmipmap  albedo.ktx2  albedo.jpg
toktx --t2 --encode uastc --uastc_quality 2 --zcmp 18 --assign_oetf linear --genmipmap  normal.ktx2  normal.png
```

At load (`src/assets/textures.js`), with the transcoder that ships in `vendor/three/addons/libs/basis/`:

```js
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
const ktx2 = new KTX2Loader().setTranscoderPath('vendor/three/addons/libs/basis/').detectSupport(renderer);
export const loadTex = (url, srgb) => ktx2.loadAsync(url.replace(/\.(jpe?g|png)$/, '.ktx2'))
  .then((t) => { t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t; })
  .catch(() => new THREE.TextureLoader().loadAsync(url)); // old files still work
```

Meshes: run the glTF models through `gltfpack -cc -tc` (meshopt geometry + KTX2 textures) and
decode with `MeshoptDecoder`. For LOD, `gltfpack -si 0.5` / `-si 0.2` gives two simplified copies
per model; switch with `THREE.LOD` on distance. Occlusion in WebGL2: one occlusion query per city
block's bounding box (`ANY_SAMPLES_PASSED_CONSERVATIVE`, results read a frame late), skipping
whole blocks hidden behind towers. A true Hi-Z pyramid needs compute, so it waits for WebGPU.

## 5. Workers and SharedArrayBuffer

`SharedArrayBuffer` needs the page cross-origin isolated. On Vercel (`vercel.json`):

```json
{ "headers": [{ "source": "/southbound/(.*)", "headers": [
  { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
  { "key": "Cross-Origin-Embedder-Policy", "value": "credentialless" } ] }] }
```

(`credentialless`, not `require-corp`, so Google Fonts and other cross-origin files still load.)

The pattern for traffic and pedestrians: the worker owns the simulation and writes poses into a
shared buffer; the main thread only copies poses into instance matrices. A sequence counter
(seqlock) keeps the main thread from reading a half-written frame:

```js
// shared layout: [seq, count, then per agent: x, y, z, heading, speed, flags]
const STRIDE = 6, MAX = 2048;
const sab = new SharedArrayBuffer(8 + MAX * STRIDE * 4);
const hdr = new Int32Array(sab, 0, 2), pose = new Float32Array(sab, 8, MAX * STRIDE);
worker.postMessage({ sab, graph: roadGraphArrays });              // once

// worker, every tick: odd seq while writing, even when done
Atomics.add(hdr, 0, 1); writePoses(pose); hdr[1] = n; Atomics.add(hdr, 0, 1);

// main thread, every frame
function readPoses(apply) {
  for (let tries = 0; tries < 3; tries++) {
    const s0 = Atomics.load(hdr, 0); if (s0 & 1) continue;
    const n = hdr[1]; apply(pose, n);
    if (Atomics.load(hdr, 0) === s0) return true;                 // nothing moved under us
  }
  return false;                                                   // keep last frame's poses
}
```

Collision queries the player needs immediately (ground height, ledges, bullets) stay on the main
thread: the static collision grid can be copied to the worker once, so both sides read the same
world without messaging.

Worth doing only once the readout says CPU-bound on real machines; on a GPU-bound PC it changes
nothing.

## 6. Hardware check (shipped)

`detectGPU()` reads the WebGL renderer string (SwiftShader, llvmpipe, "Basic Render" = no
hardware acceleration) and picks a preset. `probeGPU()` asks WebGPU for the high-performance
adapter; if WebGL is on built-in Intel/AMD graphics while WebGPU reports an NVIDIA/AMD card, the
menu and the in-game readout tell you how to put the browser on the faster card (Windows Settings ›
System › Display › Graphics › High performance). Software rendering gets the "turn on hardware
acceleration" steps.

## Order of work, if we keep going

1. Read the FPS readout on the slow PC (CPU- or GPU-bound, which card). It decides 2-4.
2. KTX2 + meshopt for every texture and model (load time, GPU memory, upload hitches).
3. Mesh LOD for the heaviest models; block occlusion queries downtown.
4. Traffic and pedestrian AI into a worker with the shared pose buffer.
5. WebGPU, material by material in TSL, when compute (GPU culling, probe GI) is the next win.
