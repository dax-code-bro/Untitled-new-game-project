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
  is checked and saved immediately. If the computer crashes, the power goes
  out or you press `Ctrl+C`, run **the same command again** and it continues
  where it stopped.
* Every render gets **its own folder** in `output/`. A short test of 3
  seconds goes into a different folder than the whole episode, so testing
  never destroys a half-finished episode. If a folder already holds a
  *different* render (you changed the scene or a setting), the renderer stops
  and tells you what changed instead of deleting anything - add `--fresh` to
  start that render over, or `--out` to put the new one somewhere else.

### Try it

```bash
cd dragons-kingdom
npm install                 # once
npm test                    # checks that everything works (about 2 minutes)

npm run render:draft        # 10 s test clip, small size - about 1 minute
npm run render:final        # the same clip in real 4K - about 8 minutes
npm run still               # one 4K picture (PNG) of the test scene -> output/still-4k.png
```

The video appears in `output/<name>/<name>.mp4`, e.g.
`output/test-kingdom-final/test-kingdom-final.mp4`.

Useful variations:

```bash
# 3 seconds only, starting at second 4 (goes to output/test-kingdom-final_4s-7s)
node render/render.mjs scenes/test-kingdom.js --preset final --start 4 --seconds 3

# ~1.8x faster: new picture every 2nd frame ("animation on twos")
node render/render.mjs scenes/test-kingdom.js --preset final --twos

# 4K that is ~1.4x faster: drawn at 1440p and sharpened up to 4K
node render/render.mjs scenes/test-kingdom.js --preset final-fast

# with music, and also split into 4 part files
node render/render.mjs scenes/test-kingdom.js --preset final --audio music.mp3 --parts 4

# 10-bit video: smooth skies stay smooth after compression (for YouTube / editing)
node render/render.mjs scenes/test-kingdom.js --preset final --bit-depth 10

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

### 8-bit or 10-bit?

The default `.mp4` is 8-bit H.264: it plays on every TV, phone and browser.
Very smooth, clean colour gradients (a cloudless sky) can show faint stripes
("banding") after compression. The renderer adds an invisible anti-banding
pattern, which works well on textured skies like the test scene, but on a
perfectly clean gradient the 8-bit compression removes about half of its
benefit in moving shots. `--bit-depth 10` writes H.264 "High 10": measured on
a clean 4K sky gradient that pans, it has about 2-3x less banding after
compression and a smaller file. Use it for YouTube uploads and for editing;
many TVs, phones and web browsers cannot play 10-bit H.264, so keep the 8-bit
default for files you want to play anywhere.

## How fast is it? (measured on this machine)

Machine: 4 CPU threads (Intel Xeon @ 2.1 GHz, cloud VM), **no GPU**, 15 GB RAM.
Scene: `scenes/test-kingdom.js` (castle, ~13 700 instanced trees, lake,
dragon, sun shadows 4096x4096). Every row is a real, complete render of the
10-second test clip (240 frames) with `--workers auto`, from typing the
command to the finished, checked `.mp4` (start-up, x264 encoding, chunk
checks and stitching included; nothing else running on the machine).

| command | drawn at | browsers | total time for the 10 s clip | seconds per frame | frames per second (in the video) | minutes of rendering per minute of video | a 20-minute episode |
|---|---|---:|---:|---:|---:|---:|---:|
| `--preset draft`             | 960x540   | 4 | 1 min 07 s | 0.27 | 3.69 | 6.5  | ~2.2 hours |
| `--preset preview`           | 1920x1080 | 4 | 2 min 45 s | 0.68 | 1.48 | 16.2 | ~5.4 hours |
| **`--preset final`** (native 4K) | 3840x2160 | 2 | **8 min 02 s** | 2.0 | 0.50 | **47.7** | **~16 hours** |
| `--preset final --twos`      | 3840x2160 | 2 | 4 min 31 s | 1.1 | 0.90 | 26.6 | ~9 hours |
| `--preset final-fast`        | 2560x1440 -> 4K | 2 | 5 min 41 s | 1.4 | 0.72 | 33.5 | ~11 hours |
| `--preset final-fast --twos` | 2560x1440 -> 4K | 2 | 2 min 58 s | 0.73 | 1.38 | 17.4 | ~6 hours |

("seconds per frame" = render time / frames in the video; with `--twos` only
every other frame is drawn.)

The native-4K proof render (`output/test-kingdom/test-kingdom.mp4`): 240
frames, 3840x2160, H.264 High, yuv420p, BT.709, 24 fps, 25.3 MB (21 Mbit/s);
all 4 CPU threads were busy 95% of the time (SwiftShader drawing ~88% of all
CPU time, x264 ~7.5%), peak memory 5.6 GB for everything.

One 4K frame in one browser (`--timing`, steady state, ms):

| stage | `final` | `final-fast` |
|---|---:|---:|
| 3D scene incl. shadows | ~1400 | ~800 (at 1440p) |
| tone mapping + FXAA | ~320 | ~140 (at 1440p) |
| upscale + sharpen to 4K | - | ~250 |
| YUV packing | ~100 | ~100 |
| readback + sending | ~70-100 | ~70 |
| **total** | **~1900** | **~1330** |

So a 20-minute episode in native 4K needs about 16 hours of rendering on this
machine (it can run overnight - it resumes after any interruption); on twos
a bit more than half of that, `final-fast` about 70%, and both together
about 36%. More CPU cores help: `npm run bench` measures your machine, and
the renderer then automatically uses the best number of browsers
(`--workers auto`, the default). A machine with a real graphics card
(`--gpu`) should be much faster still - that could not be measured here
because this machine has no GPU.

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
   never more than 1 code value apart. With `--bit-depth 10` the same pass
   writes `yuv420p10le` (two little-endian 16-bit samples per texel, 3 bytes
   per pixel) - still less than RGBA, still no conversion in ffmpeg.
2. **Anti-banding dither.** Smooth skies get stair-stepped bands in 8-bit
   video. Right before rounding Y/U/V to whole numbers the shader adds a tiny,
   fixed "interleaved gradient noise" pattern (+-0.5 of a step). It is the same
   every frame, so it never flickers. Honest limits (measured on a clean,
   panning 4K sky gradient, 16x16-block error in code values): raw frames
   0.17 -> 0.01 with the dither; after 8-bit x264 CRF 16 0.17 -> ~0.08 (about
   half survives); 10-bit x264 0.03-0.05. In 10-bit mode the dither is off by
   default (the rounding error is 4x smaller already; the noise only cost
   bits). `--no-dither` / `--dither` override.
3. **Async readback.** The picture is copied into a GPU buffer with a "fence";
   while it is being copied the browser already prepares the next frame.
   Measured: ~7.5% faster than a plain blocking read.
4. **Raw bytes over a local WebSocket, with backpressure.** Each frame goes to
   the built-in server as one binary WebSocket message (4-byte frame number +
   raw bytes, never base64). The server writes frames into ffmpeg strictly in
   order and acknowledges a frame only once ffmpeg took it; the browser keeps at
   most 3 frames un-acknowledged, so drawing frame N+1 overlaps sending and
   encoding frame N. Why not a plain HTTP upload (`fetch` POST, the first
   version)? Playwright watches the page's network traffic, and Chrome then
   base64-copies every uploaded body into a DevTools message that Playwright
   decodes and keeps (the last 100 uploads per page). Measured on a 72-frame 4K
   job with 3 browsers: the WebSocket version used 17 CPU-s in the page
   processes instead of 48, 8 CPU-s in node instead of 26, peaked at 7.2 GB
   instead of 9.5 GB of RAM (node: 0.36 GB instead of 1.2 GB) and was ~10%
   faster. Memory now stays flat on long jobs.
5. **Browsers in parallel.** Each browser renders whole chunks from a shared
   queue. SwiftShader already spreads one browser's drawing over all 4
   CPU threads, so extra browsers mainly fill the gaps while a browser reads
   back, sends or waits (`npm run bench`, 4K, frames/s: 1 browser 0.466,
   2 -> 0.511, 3 -> 0.522, 4 -> 0.526; `final-fast`: 1 -> 0.633, 2 -> 0.705,
   3 -> 0.723, 4 -> 0.722). Each 4K browser needs ~2.6 GB of RAM (its own
   x264 encoder included). `npm run bench` measures your machine;
   `--workers auto` (the default) uses the fewest browsers within 3% of the
   best (here: 2), but never more than fit into the machine's RAM. On a
   machine with more cores, more browsers help more.
6. **Chunks + resume + self-checks.** Every chunk is encoded to
   `chunks/chunk_NNNNN.mp4.part`, then *decoded completely* (exact frame count,
   no decoder errors - ~0.04 CPU-s per 4K frame), flushed to disk and only then
   renamed; its size and SHA-1 checksum go into `job.json`. A resumed job
   trusts a chunk only if its bytes are unchanged, otherwise it decodes it
   again and re-renders it if it is damaged. At the end the chunks are glued
   together **without re-encoding** (ffmpeg concat, `-c copy`, `+faststart`)
   into a temporary file that is checked before it gets its real name. Each
   chunk starts with a keyframe (closed GOPs, keyframe every 2 s).
7. **Animation on twos (`--twos`).** Only every other frame is drawn and shown
   twice; the video is still 24 fps. Nearly half the render time (measured
   1.8x faster at 4K - every frame is still encoded). This is a classic
   hand-drawn-animation look (Spider-Verse, anime): motion becomes a bit
   choppier/stylised, camera moves feel less smooth. Great for drafts and for
   stylised shots, maybe not for fast camera pans.
8. **final-fast: render 1440p, upscale to 4K in the shader.** A from-scratch
   Catmull-Rom bicubic upscaler (5 bilinear taps), an anti-ringing clamp and
   contrast-adaptive sharpening (CAS-style) with a ringing limiter (like AMD
   FSR's RCAS: the sharpened value never leaves the range of its neighbours),
   followed by the normal YUV packing. 2.25x fewer pixels to light and shade;
   overall ~1.4x faster, because packing and encoding still run at 4K. The
   1440p picture the upscaler reads is stored as 8 bit with its own tiny
   anti-banding dither instead of 16-bit "half float": the upscaler's 5 reads
   per 4K pixel got ~40% cheaper (~400 -> ~250 ms per frame, ~11% of a
   final-fast frame). Measured on clean 4K sky gradients, banding stays
   practically the same as with half float (16x16-block error 0.019 vs 0.013
   code values; 0.07 without that dither), with a little more invisible grain.
   With `--bit-depth 10` the half-float path is kept. Measured against native 4K on the test scene: 0.003% of
   the pixels lie more than 8 code values outside the native picture's local
   range (before the limiter: 0.7%, visible light rims around roofs and the
   flag pole), none more than 16; a hard edge stays a hard edge, without halos.
9. **Anti-aliasing chosen by measurement** (1 browser, 4K frame, ms):

   | mode                         | scene | post-processing | total per frame |
   |------------------------------|------:|----------------:|----------------:|
   | none                         | 1410  | grade 155       | ~1830 |
   | **fxaa** (fused, default)    | 1410  | grade+AA 320    | ~1990 (+9%) |
   | fxaa, earlier bilinear-tap version | 1400 | grade+AA 420 | ~2080 (+14%) |
   | fxaa-hq (three.js FXAA)      | (*)   | grade+AA 905    | ~+30%  |
   | msaa2 / msaa4                | (*) 4100 / 4170 | 250   | ~+110% |

   (measured with `--timing`, which itself adds a little per stage.)
   (*) measured on an earlier, heavier version of the scene; what matters is
   the extra cost of the post-processing (fxaa-hq) or of the scene pass
   (MSAA, measured once, so take it as "roughly double").

   MSAA more than doubles the cost on a CPU renderer, so the default is our own
   **fused grade+FXAA pass**: tone mapping and edge smoothing in one pass, with
   blending done in a compressed ("Reinhard") space so bright sky next to a dark
   tower does not get halos. Its edge detection reads the 4 diagonal
   neighbours as plain point samples: on SwiftShader a filtered half-float
   read costs much more than a point read, and that alone took the pass from
   ~420 to ~320 ms per 4K frame (~5% of the whole frame; it also smooths more
   of the jaggies). `--aa none|fxaa|fxaa-hq|msaa2|msaa4` to override.
10. **Cheaper soft shadows.** three.js' soft shadows read the shadow map 17
    times per pixel (~350 ms per 4K frame). The runtime swaps in a 9-tap tent
    filter (looks the same at 4K, ~100-150 ms cheaper). `--shadow-filter` (or
    `meta.shadowFilter` in a scene) can be `tent9` (default), `bilinear4`
    (cheapest, ~250 ms cheaper, slightly crisper) or `pcf-soft` (three.js).
11. **Shadow cache: the castle's shadows are drawn once, the dragon's every
    frame.** Redrawing the 4096x4096 sun shadow map means redrawing every tree
    and wall, every frame, although only the dragon and the banner move. A
    scene can say so (`ctx.shadows`, see below): the shadows of everything else
    are drawn once and kept; every frame the runtime puts back only the small
    patch of the map that the dragon touched last frame and will touch now,
    and draws the dragon and the banner on top. The result is bit-identical to
    redrawing everything (checked by `npm test` and on whole 4K jobs) and
    saves ~50-90 ms per frame (measured with the 4096x4096 map; ~2-4% of a
    4K frame - more in scenes with more static geometry). (Copying the *whole* map back each frame
    was tried first - on SwiftShader that copy costs more than it saves.)
12. **Scene-side tricks** (in the test scene, reusable helpers in `runtime/lib`):
    trees are instanced *and split into 160 m tiles* so whole off-screen tiles are
    skipped (forest cost went from ~570 ms to ~190 ms per draft frame), two
    levels of detail for far trees, matte things use the cheaper Lambert
    material (~13% per 4K frame, visually identical), the sky is drawn *last* so
    only uncovered pixels pay for it, and cloud noise is baked into a small
    texture instead of being computed per pixel.
13. **x264 speed preset chosen by measurement.** At ~0.5 frames per second the
    encoder needs only ~7% of the CPU, so `bench` picks the slowest (best
    compression) x264 preset that costs <5% throughput (here: `fast` for
    `final`, `veryfast` for `final-fast`). Quality is CRF 16 for 4K (visually
    transparent), 4K bitrate ~20 Mbit/s for the test. (The benchmark's short
    runs slightly favour the faster presets: x264 finishes its last ~10-30
    buffered frames after the browser is done, which a real 10-second chunk
    hides much better.)

Rejected after measuring: Blender Cycles (101 s per 4K frame, ~80x slower),
MSAA (see table), three.js' FXAA (~3x the cost of ours), copying the whole
shadow map back every frame (see 11), an 8-bit intermediate for native 4K
(would need a second dither for only ~2%).

Not done (yet): Playwright still mirrors every frame's WebSocket message into
its DevTools connection (base64), which costs roughly 0.1-0.2 CPU-seconds per
4K frame (~2-3%). Avoiding it would mean driving the page without
Playwright's page instrumentation - a bigger change, left for later.

## When something goes wrong

The renderer is built to run overnight without anyone watching:

* **A browser crashes or is killed** (for example by Linux when memory runs
  out): the chunk it was working on is thrown away, the browser is restarted
  and the chunk is rendered again. A chunk that fails 3 times stops the job
  with the reason.
* **A scene hangs** (an endless loop in `update()`) or a browser freezes: if a
  browser delivers no frame for 3 minutes (or 20x its usual time per frame,
  whichever is longer; `--stall-timeout`), it is restarted the same way. The
  progress line says `stalled` instead of showing a fake "ETA 0s".
* **A simulation scene replays a long warm-up** (`meta.mode = 'chunk-warmup'`,
  `warmupFrames: 'all'` late in an episode): the browser reports "still
  alive" every second while it replays, so the watchdog does not mistake it
  for a hang (the progress line shows `warm-up NN%`).
* **You edit a scene file while it renders:** every browser - also one that
  is restarted hours later - keeps getting the version the job started with
  (the built-in server keeps a copy of every file it served), so one video
  never mixes two versions. The renderer prints a NOTE; when you run the
  command again it lists the edit and you choose: undo the edit to continue,
  `--fresh` to start over, or `--out` for a new folder.
* **You start the same render twice** (two terminals): the second one stops at
  once with "this job is already being rendered by another process".
* **The folder holds a different render** (other scene, other part of the
  timeline, other settings, edited scene or asset files, other renderer such as
  `--gpu`, other Chromium/three.js version): nothing is deleted; the renderer
  lists what differs and suggests `--fresh` or `--out`.
* **A chunk file got damaged on disk:** found by its checksum, decoded, and
  re-rendered if needed. The final video is checked before it gets its name.
* **A typo in `--audio`** (or a file without sound) is reported before any
  rendering starts. `--crf` outside 0..51 (at both bit depths) is rejected
  right away; `--crf 0` (lossless) works but plays only in editors, ffmpeg and
  VLC.

## Command reference

```
node render/render.mjs <scene.js> [options]
  --preset draft|preview|final|final-fast   (default final)
  --seconds S        length (default: the scene's meta.duration minus --start)
  --start S          start time in seconds
  --fps N            frames per second (default 24)
  --workers N|auto   parallel browsers (auto = benchmark result, else 3)
  --crf N            x264 quality (default 16 at 4K, lower = better/bigger; 0..51; 0 = lossless)
  --bit-depth 8|10   8 (default, plays everywhere) | 10 (H.264 High 10, less banding)
  --x264-preset P    ultrafast..veryslow (default: benchmark result or preset)
  --twos             animation on twos
  --capture yuv|rgba yuv = GPU packing (default); rgba = full RGBA readback, ffmpeg converts
  --no-dither        disable anti-banding dither (default on for 8-bit, off for 10-bit)
  --aa MODE          none | fxaa | fxaa-hq | msaa2 | msaa4 | msaa8
  --audio FILE       mux a soundtrack (AAC 256k), padded/cut to the video length
  --parts K          also write K part files (split on chunk boundaries)
  --gpu              use the real GPU (drops the SwiftShader flags)
  --out DIR          job folder (default output/<scene>-<preset>[-WxH][-NNfps][-twos][-10bit][_<from>s-<to>s])
  --chunk-seconds S  chunk length (default 10 s; short clips use 8 chunks)
  --fresh            discard the job folder's finished chunks and start over
  --stall-timeout S  restart a browser that delivers no frame for S s (default 180; 0 = never)
  --size WxH         custom output size (width multiple of 8, height multiple of 4)
  --sharpness X      final-fast sharpening 0..1 (default 0.5)
  --tone-mapping T   aces | agx | neutral (default: scene's meta.toneMapping)
  --shadow-filter F  tent9 (default) | bilinear4 | pcf-soft
  --no-shadow-cache  ignore the scene's ctx.shadows cache (same pictures, slower; for checking)
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
frames 1234/28800 (4.3%) | 0.50 fps | 48.0 min render per min of video | ETA 15h20m | elapsed 41m || w1 c00042 87/240 4.0s/f | w2 ...
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
  //   rng()          seeded random numbers - for setup only
  //   makeRng(seed)  a new seeded generator (make it inside update() to use it there)
  //   hash(a, b, ...) stateless random in [0,1) from integers (use in update)
  //   post: { exposure, vignette, toneMapping }   (exposure/vignette may change per frame)
  //   shadows: { key, dynamic }   shadow cache, see below
  //   meta, frame, t
  // }
  // Load files with  await new THREE.TextureLoader().loadAsync(url)  (or
  // GLTFLoader().loadAsync, fetch...). The runtime also waits for loads you
  // forgot to await (three.js loaders, and fetch() including its body when it
  // is read with .json()/.text()/.arrayBuffer()/.blob(); a fetch whose body is
  // never read counts as done 1 s after its headers; body.getReader() streams
  // are not tracked) - but awaiting keeps setup errors readable.
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
* **Never use `Math.random()`, `Date.now()` or `performance.now()` in scenes,
  and do not call `ctx.rng()` (or a generator made in `setup`) inside
  `update`** - each call moves the generator on, so the result would depend on
  what was rendered before. Use `ctx.hash(frame, i)`, or
  `ctx.makeRng(seed)` created inside `update`. The runtime counts all of these
  inside `update` and prints a WARNING with the job. (Creating three.js
  objects in `update` is fine for the pictures - three only uses
  `Math.random` for their IDs, and that is not reported - but making helper
  objects once in `setup` is faster.)
* No `requestAnimationFrame`, no timers: the runtime calls you.
* **Moving vertices or instances is fine** (a waving flag, a flock as one
  `InstancedMesh`, skinned characters): three.js caches the bounding spheres
  it uses to skip off-screen objects, and the runtime refreshes them after
  every `update` whose data changed (`needsUpdate = true` on the attribute /
  `instanceMatrix`). If you set a bounding sphere yourself for an object whose
  vertices move, set it again in `update`. If a custom vertex shader moves an
  object far from its CPU-side vertices, give it `frustumCulled = false`.
* **Assets:** everything the scene loads must be loaded in `setup` (the
  runtime waits for all loads before the first frame). Files the scene loads -
  modules, JSON, textures, models - are fingerprinted: editing one is noticed
  on the next run. During a job every browser gets exactly the bytes served
  first (the server keeps a copy; files over 512 MB are re-checked instead and
  refused if they changed), so editing a file while rendering never mixes two
  versions into one video.
* Imports: `import * as THREE from 'three'`, `three/addons/...` (e.g.
  `three/addons/utils/BufferGeometryUtils.js`), shared helpers from `dk/...`,
  and relative files (`./lib/castle.js`). Files must live inside
  `dragons-kingdom/` or next to the scene file.
* Shadows: `renderer.shadowMap` is enabled by the runtime; set
  `light.castShadow`, `mesh.castShadow/receiveShadow`, and use
  `ctx.quality.shadowMapSize` for the map size (1024 draft ... 4096 final).
* **Shadow cache (optional, faster):** if the lights and most shadow casters
  stand still, set in `setup` (or per shot in `update`)

  ```js
  ctx.shadows.key = 'castle-day';                 // any value
  ctx.shadows.dynamic = [dragon.root, castle.flag]; // what moves AND casts shadows
  ```

  Shadow maps of everything not listed are drawn once per `key` value; the
  `dynamic` objects (with their children) are drawn every frame. Contract:
  while `key` stays the same, the lights and the non-dynamic casters must not
  change - change the key (e.g. per shot) when they do. `dynamic = []` means
  nothing that casts a shadow moves. Leave `key = null` (default) to redraw
  everything every frame. The runtime uses layer 31 internally to mark
  dynamic objects. `--no-shadow-cache` turns the cache off for a check.
* Simulation-style scenes (physics, particles that integrate over time) can
  opt in to `meta.mode = 'chunk-warmup'` and must then `export function
  reset(ctx)`. At the start of each chunk the runtime calls `reset`, then
  `update` for **every** frame from `chunkStart - meta.warmupFrames` in order.
  `meta.warmupFrames: 'all'` simulates from frame 0 every time (exactly
  continuous across chunks; fine as long as `update` itself is cheap - the
  last chunk of a 20-minute episode replays 28 800 updates). While it
  replays, the page tells the job once a second that it is alive, so the
  stall watchdog only fires if a single `update` call hangs.
  Here `ctx.rng` restarts at every `reset`, so a simulation may use it in
  `update`.

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
  └─ job.mjs: lock ─ plan chunks ─ fingerprint/resume ─ queue + stall watchdog ─ verify ─ concat/parts/audio
       ├─ server.mjs   node:http: serves runtime/, three/, scene files (and remembers which);
       │               WebSocket /ws/<sink>: binary frames in, JSON acks out
       ├─ worker.mjs   1 headless Chromium (Playwright) per worker, WebGL2 via SwiftShader;
       │               every call into the page is raced against crash/disconnect
       ├─ sinks.mjs    ordered writer: frames -> ffmpeg stdin, honours backpressure, holds for --twos
       └─ ffmpeg.mjs   libx264 chunk encoders (8/10-bit), decode verification, concat
runtime/dk-runtime.js (in the browser)
  update(t) -> refresh stale culling spheres
  scene -> HalfFloat render target (linear HDR)   [shadow pass: cached static + dynamic]
        -> grade (+FXAA)         tone mapping, vignette, sRGB
        -> [upscale + CAS]       final-fast only
        -> YUV420 pack + dither  RGBA8 target of (W/4) x (H*3/2)   (10-bit: (W/2) x (H*3/2))
        -> async readPixels -> WebSocket
```

* Playwright is loaded from the local `node_modules` (optional dependency
  pinned to 1.56.1) or `/opt/node-tools/node_modules/playwright`, or
  `DK_PLAYWRIGHT=/path`. Chromium comes from `chromium.executablePath()` or
  `DK_CHROME=/path/to/chrome`. Extra Chromium flags: `DK_CHROME_ARGS="..."`.
  ffmpeg/ffprobe from `PATH` or `DK_FFMPEG` / `DK_FFPROBE`.
* SwiftShader flags: `--use-angle=swiftshader --enable-unsafe-swiftshader
  --ignore-gpu-blocklist`; `--gpu` omits them (not testable here - no GPU; on a
  Linux GPU box you may need `DK_CHROME_ARGS="--use-angle=vulkan"` or
  `--use-gl=egl`). The renderer name is printed at the start of every job and
  is part of the job fingerprint.
* `job.json` in each job folder holds the fingerprint (settings, renderer,
  SHA-1 of every file the scene loaded) and the checksum of every finished
  chunk; `job.lock` exists while a render runs (a stale one from a crashed run
  is taken over automatically).
* The benchmark cache is `.dk-tuning.json` (git-ignored, per machine).
* Disk: a 4K chunk of 10 s is ~25 MB at CRF 16, a 20-minute episode
  ~3 GB (chunks + final file, so plan ~6-7 GB while rendering). Nothing is
  ever written as PNG frame sequences.
* Memory: the 10-second 4K clip with 2 browsers (the benchmark's choice here)
  peaked at 5.6 GB for everything (browser processes ~2.8 GB, the two x264
  encoders ~2.5 GB, node 0.3 GB); with 4 browsers ~10.6 GB. Memory stays flat
  on long jobs (node ~0.2-0.3 GB and each page ~0.3 GB from the first to the
  last chunk), so 16 GB is enough; `--workers auto` caps the browser count by
  the machine's RAM.
* Node.js 20 or newer (tested with 20, 21 and 22).

## Tests

`npm test` (about 2 minutes, everything at 320x180, temp files removed
afterwards; a test that fails can never leave a browser or server running):

* (a) the GPU YUV packer vs ffmpeg's own RGBA->yuv420p conversion of the same
  frame, native and upscaled path: >= 45 dB PSNR per plane required (measured
  56-60 dB, max difference 1 code value); dither changes values by at most 1;
  the 10-bit packer gives the same picture in exact `yuv420p10le` layout; the
  final-fast sharpener adds no halos at a hard edge.
* (b) determinism: the same frame is byte-identical after rendering other
  frames and in a different browser; chunk-warmup scenes are identical no
  matter where the chunk starts (also with `--twos` and an odd start frame);
  a flock / waving banner that flies in from off-screen, and a swarm whose
  `InstancedMesh.count` grows, are drawn the same whatever was rendered
  first; stateful randomness, `Math.random` and clock reads in `update` are
  reported (three.js' own UUIDs are not); the first frame waits for slow
  asset loads, including the body of a 30 MB `fetch()` nobody awaited; the
  shadow cache is bit-identical to redrawing every frame; a crashed browser
  page fails the render instead of hanging it.
* the frame WebSocket handles fragmented, masked messages and pings.
* (c) a job is hard-killed (SIGKILL) after 3 of 8 chunks, rerun: the finished
  chunks are reused untouched and the final file has exactly 96 frames; a
  damaged chunk is found and re-rendered; a different job aimed at the same
  folder is refused without deleting anything; a scene stuck in `update` is
  stopped by the watchdog with a clear error, while a long chunk-warmup
  replay is not; a second render of the same job is refused while the first
  runs; bad `--audio` / `--crf` fail at once; `--still` creates the PNG's
  folder; `--crf 0` is truly lossless at 8 and 10 bits; a scene edited while
  the job runs does not end up in the video (all 72 frames keep the old
  colour) and the rerun lists the edit; `--fresh` forgets the files of the
  job that was in the folder before; a frozen browser (SIGSTOP) is killed and
  restarted and the job finishes.
* (d) ffprobe of the final file: 320x180, 24/1 fps, 96 frames, yuv420p, BT.709
  primaries/transfer/matrix, TV range, duration 4.000 s; `--parts 2` frame
  counts add up; `--twos` output holds every picture for 2 frames;
  `--bit-depth 10` gives High 10 / yuv420p10le.
