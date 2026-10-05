# Dragons Kingdom - 4K render engine

This folder turns **3D scenes written in code** into **real 4K video files**
(3840 x 2160, H.264 `.mp4`, 24 frames per second) - the kind you can upload to
YouTube or play on a 4K TV. It is the foundation for the Dragons Kingdom
series: characters, materials and the story come in later milestones, and they
will all be written against the same scene format described at the bottom.

## The short version (no programming knowledge needed)

* A **scene** is a small JavaScript file (`scenes/test-kingdom.js` is the
  example). It builds a world (castle, lake, forest, dragon...) and says where
  everything is at every moment in time.
* The **renderer** opens invisible web browsers, draws the scene one picture
  (frame) at a time and hands the pictures to **ffmpeg**, which packs them into
  a video file.
* This computer has **no graphics card**, so the "graphics card" is simulated
  on the normal processor (SwiftShader). That works and gives exactly the same
  pictures, it is just slow - a 4K picture takes a few seconds. All the tricks
  below exist to make it as fast as possible.
* Long episodes are cut into **10-second pieces (chunks)**. Every finished piece
  is saved immediately. If the computer crashes, the power goes out or you press
  `Ctrl+C`, run **the same command again** and it continues where it stopped.

### Try it

```bash
cd dragons-kingdom
npm install                 # once
npm test                    # checks that everything works (about 30 seconds)

npm run render:draft        # 10 s test clip, small size - about 1.5 minutes
npm run render:final        # the same clip in real 4K - about 10 minutes
npm run still               # one 4K picture (PNG) of the test scene
```

The video appears in `output/<name>/<name>.mp4`, e.g.
`output/test-kingdom-final/test-kingdom-final.mp4`.

Useful variations:

```bash
# 3 seconds only, starting at second 4
node render/render.mjs scenes/test-kingdom.js --preset final --start 4 --seconds 3

# twice as fast: new picture every 2nd frame ("animation on twos")
node render/render.mjs scenes/test-kingdom.js --preset final --twos

# 4K that is ~1.4x faster: drawn at 1440p and sharpened up to 4K
node render/render.mjs scenes/test-kingdom.js --preset final-fast

# with music, and also split into 4 part files
node render/render.mjs scenes/test-kingdom.js --preset final --audio music.mp3 --parts 4

# one picture at second 5
node render/render.mjs --still scenes/test-kingdom.js --time 5 --preset final --png castle.png
```

### Presets

| preset       | video size  | drawn at    | anti-aliasing | use it for                          |
|--------------|-------------|-------------|---------------|-------------------------------------|
| `draft`      | 960 x 540   | 960 x 540   | FXAA          | checking the animation quickly      |
| `preview`    | 1920 x 1080 | 1920 x 1080 | FXAA          | full-HD preview                     |
| `final`      | 3840 x 2160 | 3840 x 2160 | FXAA          | the real 4K episode                 |
| `final-fast` | 3840 x 2160 | 2560 x 1440 | FXAA + in-shader upscale/sharpen | 4K when time is short |

Frame rate is 24 fps (film standard) unless you pass `--fps`.

## How fast is it? (measured on this machine)

Machine: 4 CPU threads (Intel Xeon @ 2.1 GHz, cloud VM), **no GPU**, 15 GB RAM.
Scene: `scenes/test-kingdom.js` (castle, ~13 700 instanced trees, lake,
dragon, sun shadows 4096x4096). Measured with `node render/bench.mjs`, 3
browsers in parallel, x264 encoding included. Important honesty note: while
these numbers were taken, another (low-priority) job was running on the same
machine and used up to 1.5 CPU threads, so on an idle machine expect the same
or a bit better.

| preset / option            | drawn at  | frames per second (rendered) | frames per second (in the video) | minutes of rendering per minute of video | a 20-minute episode |
|----------------------------|-----------|------:|------:|------:|------:|
| `draft`                    | 960x540   | 3.06 (4 browsers) | 3.06 | 7.8  | ~2.6 hours |
| `preview`                  | 1920x1080 | 1.44  | 1.44  | 16.7 | ~5.6 hours |
| `final` (native 4K)        | 3840x2160 | 0.37-0.42 | 0.37-0.42 | 57-64 | ~19-21 hours |
| `final --twos`             | 3840x2160 | 0.42  | 0.85  | 28.4 | ~9.5 hours |
| `final-fast`               | 2560x1440 -> 4K | 0.56 | 0.56 | 42.9 | ~14.3 hours |
| `final-fast --twos`        | 2560x1440 -> 4K | 0.48 | 0.97 | 24.9 | ~8.3 hours |

Per 4K frame with one browser (from `--timing`): drawing the 3D scene
~1.4 s, tone mapping + anti-aliasing ~0.43 s, YUV packing ~0.09 s, readback
and sending ~0.1 s. A real end-to-end job (`--preset final --seconds 3`,
72 frames, 3 browsers, x264 `medium`) took 2 min 51 s including start-up,
encoding and stitching (0.43 rendered fps) and produced a 21.4 Mbit/s 4K file;
the 10-second `draft` clip took 73 s (3.35 fps, 4 browsers).

So a 20-minute episode in native 4K needs roughly a day of rendering on this
machine (it can run overnight - it resumes after any interruption); on twos
it is about half of that, with `final-fast` about 70%, and both together
about 40%. More CPU cores help (each browser keeps about 2 threads busy):
`npm run bench` measures your machine, and the renderer then automatically
uses the best number of browsers (`--workers auto`, the default). A machine
with a real graphics card (`--gpu`) should be much faster still - that could
not be measured here because this machine has no GPU.

## The tricks, and why they help

1. **GPU-side YUV packing (biggest pipeline trick).** Video files store
   pictures as YUV 4:2:0 (brightness at full size, colour at quarter size).
   Instead of reading back a full RGBA picture (4 bytes per pixel = 33 MB per 4K
   frame) and letting ffmpeg convert it, the last shader pass writes the YUV
   planes directly - BT.709 colours, TV range, rows already in top-to-bottom
   order - into a small texture whose bytes are *exactly* one ffmpeg
   `-pix_fmt yuv420p` frame. Only 1.5 bytes per pixel (12.4 MB per 4K frame) are
   read back, copied, sent and piped, and ffmpeg does no conversion at all.
   Chroma is the average of each 2x2 block (centre siting; the file is tagged
   `chroma_location=center`), fetched with one bilinear texture tap per sample.
   The test suite checks it against ffmpeg's own conversion: 56-60 dB PSNR,
   never more than 1 code value apart.
2. **Anti-banding dither.** Smooth skies get stair-stepped bands in 8-bit
   video. Right before rounding Y/U/V to whole numbers the shader adds a tiny,
   fixed "interleaved gradient noise" pattern (+-0.5 of a step). It is the same
   every frame, so it never flickers and compresses well. `--no-dither` turns
   it off.
3. **Async readback.** The picture is copied into a GPU buffer with a "fence";
   while it is being copied the browser already prepares the next frame.
   Measured: ~7.5% faster than a plain blocking read.
4. **Raw bytes over local HTTP with backpressure.** Each frame is POSTed as
   raw bytes (never base64) to a tiny built-in web server, which writes the
   frames into ffmpeg strictly in order and only answers when ffmpeg took the
   data. Up to 3 frames are in flight, so drawing frame N+1 overlaps sending and
   encoding frame N.
5. **Several browsers in parallel.** Each browser renders whole chunks from a
   shared queue. One simulated GPU uses only ~2 CPU threads, so 3 browsers fill
   the machine (measured: 1 browser 0.23 fps, 2 -> 0.33, 3 -> 0.37-0.42,
   4 -> 0.38 at 4K).
6. **Chunks + resume.** Every chunk is encoded to `chunks/chunk_NNNNN.mp4.part`
   and renamed only when complete and verified with ffprobe (exact frame count),
   so a crash never leaves a broken piece. At the end the chunks are glued
   together **without re-encoding** (ffmpeg concat, `-c copy`, `+faststart`).
   Each chunk starts with a keyframe (closed GOPs, keyframe every 2 s). If you
   change settings or the scene, old chunks are detected (fingerprint in
   `job.json`) and re-rendered automatically; `--fresh` forces a restart.
7. **Animation on twos (`--twos`).** Only every other frame is drawn and shown
   twice; the video is still 24 fps. Half the render time. This is a classic
   hand-drawn-animation look (Spider-Verse, anime): motion becomes a bit
   choppier/stylised, camera moves feel less smooth. Great for drafts and for
   stylised shots, maybe not for fast camera pans.
8. **final-fast: render 1440p, upscale to 4K in the shader.** A from-scratch
   Catmull-Rom bicubic upscaler (5 bilinear taps), an anti-ringing clamp (no
   halos around the castle) and contrast-adaptive sharpening (CAS-style),
   followed by the normal YUV packing. 2.25x fewer pixels to light and shade.
9. **Anti-aliasing chosen by measurement** (1 browser, 4K frame, ms):

   | mode                         | scene | post-processing | total per frame |
   |------------------------------|------:|----------------:|----------------:|
   | none                         | 1450  | grade 170       | ~2380 |
   | **fxaa** (fused, default)    | 1410  | grade+AA 430    | ~2590 (+9%) |
   | fxaa-hq (three.js FXAA)      | (*)   | grade+AA 905    | ~+30%  |
   | msaa2 / msaa4                | 4100 / 4170 | 250       | ~5000 (+110%) |

   (*) measured on an earlier, heavier version of the scene; the extra cost of
   its post-processing (~900 ms vs ~430 ms) is what matters. The MSAA rows were
   measured once (not interleaved), so take them as "roughly double".

   MSAA more than doubles the cost on a CPU renderer, so the default is our own
   **fused grade+FXAA pass**: tone mapping and edge smoothing in one pass, with
   blending done in a compressed ("Reinhard") space so bright sky next to a dark
   tower does not get halos. `--aa none|fxaa|fxaa-hq|msaa2|msaa4` to override.
10. **Cheaper soft shadows.** three.js' soft shadows read the shadow map 17
    times per pixel (~350 ms per 4K frame). The runtime swaps in a 9-tap tent
    filter (looks the same at 4K, ~100-150 ms cheaper). `--shadow-filter` (or
    `meta.shadowFilter` in a scene) can be `tent9` (default), `bilinear4`
    (cheapest, ~250 ms cheaper, slightly crisper) or `pcf-soft` (three.js).
11. **Scene-side tricks** (in the test scene, reusable helpers in `runtime/lib`):
    trees are instanced *and split into 160 m tiles* so whole off-screen tiles are
    skipped (forest cost went from ~570 ms to ~190 ms per draft frame), two
    levels of detail for far trees, matte things use the cheaper Lambert
    material (~13% per 4K frame, visually identical), the sky is drawn *last* so
    only uncovered pixels pay for it, and cloud noise is baked into a small
    texture instead of being computed per pixel.
12. **x264 speed preset chosen by measurement.** At ~0.4 frames per second the
    encoder needs only a few percent of the CPU, so `bench` picks the slowest
    (best compression) x264 preset that costs <5% throughput. Quality is
    CRF 16 for 4K (visually transparent), 4K bitrate ~23 Mbit/s for the test.

Rejected after measuring: Blender Cycles (101 s per 4K frame, ~80x slower),
MSAA (see table), three.js' FXAA (2x the cost of ours).

## Command reference

```
node render/render.mjs <scene.js> [options]
  --preset draft|preview|final|final-fast   (default final)
  --seconds S        length (default: the scene's meta.duration minus --start)
  --start S          start time in seconds
  --fps N            frames per second (default 24)
  --workers N|auto   parallel browsers (auto = benchmark result, else 3)
  --crf N            x264 quality (default 16 at 4K, lower = better/bigger)
  --x264-preset P    ultrafast..veryslow (default: benchmark result or preset)
  --twos             animation on twos
  --capture yuv|rgba yuv = GPU packing (default); rgba = full RGBA readback, ffmpeg converts
  --no-dither        disable anti-banding dither
  --aa MODE          none | fxaa | fxaa-hq | msaa2 | msaa4 | msaa8
  --audio FILE       mux a soundtrack (AAC 256k), padded/cut to the video length
  --parts K          also write K part files (split on chunk boundaries)
  --gpu              use the real GPU (drops the SwiftShader flags)
  --out DIR          job folder (default output/<scene>-<preset>[-twos])
  --chunk-seconds S  chunk length (default 10 s; short clips use 8 chunks)
  --fresh            discard finished chunks
  --size WxH         custom output size (width multiple of 8, height multiple of 4)
  --sharpness X      final-fast sharpening 0..1 (default 0.5)
  --tone-mapping T   aces | agx | neutral (default: scene's meta.toneMapping)
  --shadow-filter F  tent9 (default) | bilinear4 | pcf-soft
  --exposure X       exposure multiplier
  --readback MODE    async (default) | sync
node render/render.mjs --still <scene.js> --time T [--preset final] --png out.png [--timing]
  --timing           print per-stage GPU timings for the still (for measuring)
node render/bench.mjs [--preset final] [--frames 6] [--workers 1,2,3,4] [--x264 veryfast,faster,fast,medium] [--twos] [--no-save]
```

npm shortcuts: `npm test`, `npm run render:draft|render:preview|render:final|render:final-fast`,
`npm run still`, `npm run bench`, `npm run bench:final-fast`.

The progress line shows frames done / total, speed, "minutes of render per
minute of video", ETA and what every browser is doing:

```
frames 1234/28800 (4.3%) | 0.41 fps | 58.5 min render per min of video | ETA 18h43m | elapsed 50m || w1 c00042 87/240 7.6s/f | w2 ...
```

## Writing scenes (technical reference)

A scene is an ES module. The runtime owns the renderer, the camera object,
tone mapping, output colour space, shadow settings and the whole post chain;
the scene only builds objects and poses them.

```js
export const meta = {
  title: 'Shot 12 - the dragon lands',
  duration: 8,              // seconds (used when --seconds is not given)
  toneMapping: 'aces',      // optional: aces | agx | neutral | reinhard | linear
  exposure: 1.0,            // optional
  vignette: 0.15,           // optional, 0..1
  seed: 1,                  // optional, seeds ctx.rng
  shadowFilter: 'tent9',    // optional: tent9 | bilinear4 | pcf-soft
  mode: 'pure',             // or 'chunk-warmup' (see below)
};

export async function setup(ctx) {
  // build everything once. ctx = {
  //   THREE, renderer, scene, camera (PerspectiveCamera, aspect already set),
  //   width, height (output size), renderWidth, renderHeight (drawn size),
  //   fps, preset ('draft'|...), quality: { shadowMapSize, detail, shadowFilter },
  //   rng()          seeded random numbers for setup
  //   makeRng(seed)  another seeded generator
  //   hash(a, b, ...) stateless random in [0,1) from integers (use in update)
  //   post: { exposure, vignette, toneMapping }   (exposure/vignette may change per frame)
  //   meta, frame, t
  // }
}

export function update(t, ctx) {
  // t = frameIndex / fps. Position EVERYTHING for time t.
}
```

Rules (they make parallel and resumable rendering possible):

* **`update(t)` must be a pure function of `t`.** Rendering frame 5000 must not
  depend on having rendered frame 4999 first - different browsers render
  different chunks, in any order, and a resumed job starts in the middle.
  Compute positions from `t` (curves, `Math.sin(t)`, keyframe lookups...).
* **Never use `Math.random()`, `Date.now()` or `performance.now()` in scenes.**
  Use `ctx.rng()` in `setup` and `ctx.hash(frame, i)` / `ctx.makeRng(seed)`
  in `update`. (The runtime replaces `Math.random` with a fixed-seed version and
  warns if it is called during `update`.)
* No `requestAnimationFrame`, no timers: the runtime calls you.
* Imports: `import * as THREE from 'three'`, `three/addons/...` (e.g.
  `three/addons/utils/BufferGeometryUtils.js`), shared helpers from `dk/...`,
  and relative files (`./lib/castle.js`). Files must live inside
  `dragons-kingdom/` or next to the scene file.
* Shadows: `renderer.shadowMap` is enabled by the runtime; set
  `light.castShadow`, `mesh.castShadow/receiveShadow`, and use
  `ctx.quality.shadowMapSize` for the map size (1024 draft ... 4096 final).
* Simulation-style scenes (physics, particles that integrate over time) can
  opt in to `meta.mode = 'chunk-warmup'` and must then `export function
  reset(ctx)`. At the start of each chunk the runtime calls `reset`, then
  `update` for **every** frame from `chunkStart - meta.warmupFrames` in order.
  `meta.warmupFrames: 'all'` simulates from frame 0 every time (exactly
  continuous across chunks; fine as long as `update` itself is cheap).

Shared helpers (`runtime/lib`, imported as `dk/...`):

| module | what |
|---|---|
| `dk/noise.js` | seeded Perlin noise, fbm, ridged noise, smoothstep/mix |
| `dk/atmosphere.js` | sky dome (gradient, sun, clouds) + matching aerial-perspective fog patched into every material |
| `dk/textures.js` | procedural stone blocks, roof shingles, UV helpers |
| `dk/instancing.js` | tiled instancing (frustum-culled per tile), grid splitting, colour-merged geometry |

Scene-specific builders live in `scenes/lib/` (`castle.js`, `dragon.js` -
the dragon is a placeholder made of primitives with flapping wings).

## How it works inside

```
render/render.mjs (CLI)
  └─ job.mjs: plan chunks ─ fingerprint/resume ─ queue ─ progress ─ concat/parts/audio
       ├─ server.mjs   node:http: serves runtime/, three/, scene files; POST /frame/<sink>/<n>
       ├─ worker.mjs   1 headless Chromium (Playwright) per worker, WebGL2 via SwiftShader
       ├─ sinks.mjs    ordered writer: frames -> ffmpeg stdin, honours backpressure, holds for --twos
       └─ ffmpeg.mjs   libx264 chunk encoders, ffprobe validation, concat
runtime/dk-runtime.js (in the browser)
  scene -> HalfFloat render target (linear HDR)
        -> grade (+FXAA)         tone mapping, vignette, sRGB
        -> [upscale + CAS]       final-fast only
        -> YUV420 pack + dither  RGBA8 target of (W/4) x (H*3/2)
        -> async readPixels -> fetch POST
```

* Playwright is loaded from the local `node_modules` (optional dependency
  pinned to 1.56.1) or `/opt/node-tools/node_modules/playwright`, or
  `DK_PLAYWRIGHT=/path`. Chromium comes from `chromium.executablePath()` or
  `DK_CHROME=/path/to/chrome`. Extra Chromium flags: `DK_CHROME_ARGS="..."`.
  ffmpeg/ffprobe from `PATH` or `DK_FFMPEG` / `DK_FFPROBE`.
* SwiftShader flags: `--use-angle=swiftshader --enable-unsafe-swiftshader
  --ignore-gpu-blocklist`; `--gpu` omits them (not testable here - no GPU; on a
  Linux GPU box you may need `DK_CHROME_ARGS="--use-angle=vulkan"` or
  `--use-gl=egl`). The renderer name is printed at the start of every job.
* The benchmark cache is `.dk-tuning.json` (git-ignored, per machine).
* Disk: a 4K chunk of 10 s is ~25-30 MB at CRF 16, a 20-minute episode
  ~3.5 GB (chunks + final file, so plan ~7 GB while rendering). Nothing is
  ever written as PNG frame sequences.
* Memory: 3 workers at 4K peaked at ~8.4 GB RAM used on the whole machine
  (browsers + x264 encoders), so 16 GB is comfortable.

## Tests

`npm test` (about 30 s, everything at 320x180, temp files removed afterwards):

* (a) the GPU YUV packer vs ffmpeg's own RGBA->yuv420p conversion of the same
  frame, native and upscaled path: >= 45 dB PSNR per plane required (measured
  56-60 dB, max difference 1 code value); dither changes values by at most 1.
* (b) determinism: the same frame is byte-identical after rendering other
  frames and in a different browser; chunk-warmup scenes are identical no
  matter where the chunk starts.
* (c) a job is hard-killed (SIGKILL) after 3 of 8 chunks, rerun: the finished
  chunks are reused untouched and the final file has exactly 96 frames.
* (d) ffprobe of the final file: 320x180, 24/1 fps, 96 frames, yuv420p, BT.709
  primaries/transfer/matrix, TV range, duration 4.000 s; `--parts 2` frame
  counts add up; `--twos` output holds every picture for 2 frames.
