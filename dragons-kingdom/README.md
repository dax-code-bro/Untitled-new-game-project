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
npm test                    # checks that everything works (about 3 minutes)

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

# the "filmed by a camera crew" look (motion blur, depth of field, film grade, ...):
# scenes that ask for it get it automatically; --cinematic on adds it to any scene,
# --cinematic off removes it for fast checks (see "Cinematic realism stack")
node render/render.mjs --still scenes/cinematic-lookdev.js --time 4 --preset final --png coast.png
node render/render.mjs scenes/test-kingdom.js --preset final --cinematic on
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

| command | drawn at | browsers | total time for the 10 s clip | seconds per frame | frames per second (in the video) | minutes of rendering per minute of video | a 60-minute episode |
|---|---|---:|---:|---:|---:|---:|---:|
| `--preset draft`             | 960x540   | 4 | 1 min 07 s | 0.27 | 3.69 | 6.5  | ~6.5 hours |
| `--preset preview`           | 1920x1080 | 4 | 2 min 45 s | 0.68 | 1.48 | 16.2 | ~16 hours |
| **`--preset final`** (native 4K) | 3840x2160 | 2 | **8 min 02 s** | 2.0 | 0.50 | **47.7** | **~48 hours** |
| `--preset final --twos`      | 3840x2160 | 2 | 4 min 31 s | 1.1 | 0.90 | 26.6 | ~27 hours |
| `--preset final-fast`        | 2560x1440 -> 4K | 2 | 5 min 41 s | 1.4 | 0.72 | 33.5 | ~34 hours |
| `--preset final-fast --twos` | 2560x1440 -> 4K | 2 | 2 min 58 s | 0.73 | 1.38 | 17.4 | ~17 hours |

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

So a 50-60 minute episode in native 4K needs about 40-48 hours of rendering
on this machine with the standard pipeline (two days; it resumes after any
interruption, and episodes can be split into scenes rendered on several
machines); the cinematic stack adds to that (see "Cinematic realism stack"); on twos
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
  --shadow-filter F  tent9 (default) | bilinear4 | pcf-soft | pcss (contact-hardening, sun-sized penumbrae)
  --cinematic MODE   off | on | default | hero | preview | film | velocity  (cinematic realism stack, see below)
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
  last chunk of a 60-minute episode replays 86 400 updates). While it
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
| `dk/camera.js` | physical camera math (sensor, focal length <-> fov, circle of confusion, exposure) and deterministic camera shake (`handheld`, `vehicle`, `dragonback`, `wind`, `aerial`) |
| `dk/ocean.js` | FFT ocean (JONSWAP, 3 cascades, foam, shallow water + shore foam with the cinematic stack, `heightAt()`) |
| `dk/lut.js` | `.cube` LUT parser / loader / writer |

### Asset library (photo textures, HDRIs, scanned models)

`assets-lib/` holds free (CC0 / CC BY) real-world assets: HDRI skies, photo-scanned
PBR materials, scanned models and a human base mesh. Git keeps only the list and
the downloader; `node assets-lib/fetch.mjs` downloads and checks everything
(~0.7 GB). Scenes load them with `scenes/lib/assets.js` (`loadHDRI`, `loadPBR`,
`loadModel`); `scenes/asset-library-test.js` is a 4K check of all of them. See
[assets-lib/README.md](assets-lib/README.md) - including which free libraries are
blocked by this environment's network policy and how to unblock them.

Scene-specific builders live in `scenes/lib/` (`castle.js`, `dragon.js` -
the dragon is a placeholder made of primitives with flapping wings).

### Creatures (Episode 1 dragons and riders)

`scenes/lib/creatures/` builds the Episode 1 dragons procedurally at setup
(Charcoal, Leaf, Starlight, the gold hatchling, the Slitherwing scout with its
detachable LEFT wing): signed-distance sculpt -> crack-free adaptive mesh ->
skinned skeleton, procedural scales, translucent wing membranes, refracting
eyes, pure-function-of-t poses (breathing, sit, flight cycles, glide/bank, jaw,
head/eye look, blinks), plus a MakeHuman-based rider with a fitted saddle.
All designs are provisional; see [scenes/lib/creatures/README.md](scenes/lib/creatures/README.md)
(including the open limb-layout question). 4K lookdev:
`scenes/lookdev/creatures-turntable.js` (all shots) or the faster
`creatures-turntable-<name>.js` / `creatures-lineup.js`.

### Live-action style frames and the set-building library

`scenes/lookdev/style-f1-prologue.js` ... `style-f5-cling-square.js` are five
native-4K style frames for Episode 1 (prologue dawn sea, the Verdor riding
grounds, Charcoal and Leaf flying the coast, the birthing chamber, the Cling
square with Starlight), each lit and framed like a real camera setup (lens,
stop, focus, shutter, ISO and grade are in the file header). Render one with:

```
node render/render.mjs --still scenes/lookdev/style-f2-riding-grounds.js --time 2 --preset final --png output/lookdev/f2.png
```

`bash episodes/s01e01/style-frames/make.sh` renders all five into
`episodes/s01e01/style-frames/`, stamps each with a **PROVISIONAL** slate (no
design is approved yet) and writes 1920-wide JPEG previews (the 4K PNGs are
git-ignored; the previews and the script are kept).

All five share one photographic finish, `scenes/lookdev/finish.js`
(`filmFinish(overrides)`): 8 real sub-frames per frame across the 180-degree
shutter, each with a Halton sub-pixel jitter (8x supersampling: no
stair-stepped rigging, no roof moire, no sparkling scale highlights; true
motion blur and sun penumbrae), the `print` look (a print-film S-curve after
AgX: real blacks, highlights reaching white about four stops over grey),
luminance-dependent grain, mild red halation, natural vignetting and lateral
chromatic aberration only toward the corners. Continuity: F2 and F3 use the
same photographed sky and sun (Poly Haven `kloofendal_48d_partly_cloudy`, same
rotation, the photographer's horizon matte-painted out with `horizonFill`).

Measured on this machine (4-core CPU, SwiftShader, `final` preset 3840x2160),
the production `--still` command: "frame" = rendering the frame itself (the
first frame of a fresh browser, shader compilation included), "total" = the
whole command (browser start, scene build, asset loading, frame, PNG):

| frame | frame (s) | total (s) | what costs the time |
|---|---:|---:|---|
| F1 prologue (sea, fog, knarr, the shape's shadow) | 39 | 54 | FFT ocean x8, froxel fog with the sun's shadow map |
| F2 riding grounds (50 mm, Charcoal, Remi, Leaf, Abby) | 253 | 297 | 77k grass tufts in three layers, two hero creatures, 3 shadow cascades, x8 |
| F3 flight along the coast (60 mm air-to-air) | 146 | 178 | two creatures, kitbashed cliffs, ocean, haze, x8 |
| F4 birthing chamber (50 mm T2.8 macro) | 202 | 226 | 96-tap depth of field, lamp shadows, fog, 5,200 straw ribbons, x8 |
| F5 Cling square (24 mm from the king's steps) | 115 | 136 | ~65 people, houses, Starlight with rider, x8 |

The 8-sub-frame finish multiplies the scene pass by 8: it is meant for style
frames and hero shots. For running footage render the same scene with
`--cinematic velocity` (velocity motion blur + FXAA instead of sub-frames;
same grade, grain and lens): measured 13 s (F1) and 51 s (F2) per 4K
frame the same way (first frame of a browser). A 50-60 minute episode is
72,000-86,400 frames: at 13-51 s per frame that is roughly 11-51 days of
rendering on this one 4-core machine (with the 8-sub-frame finish on every
shot, 40-250 s per frame, it would be months), so an episode at this look has
to be split over many machines or rendered on real GPUs (`--gpu`, not
measurable here); `render.mjs` chunks, resumes and splits into parts (see
above).

What the frames use, beyond the set library below:

| piece | what it does |
|---|---|
| `scenes/lib/sets/ship.js` | `knarr()`: a procedural one-masted 11th-12th-century trading ship (clinker hull with real laps, curled stem and stern posts, square wool sail with seams and stains and a little transmitted light, standing and running rigging, side rudder, cargo under hides, optional crew) |
| `dk/ocean.js` | new options: `setWake(i, {...})` (foam collar round a hull, churned water astern, Kelvin arms), `surf` (a solid whitewater band where the sea meets rock, shore or hull), `reflectionTint` (warms sky reflections that reach the eye through sunlit mist) |
| `scenes/lib/assets.js` | `loadHDRI(..., { horizonFill: { above, below, blend } })`: matte-paints the photographer's horizon (trees, hills) out of an HDRI with a soft haze band; anisotropy 16 by default |
| `runtime/cinematic` | `grade.look: 'print'` |
| creatures | `scaleMul` (finer scales on giants), varied/broken dorsal spikes, dusty matte hides, dielectric wet gold for the hatchling, silver clearcoat and white-grey membranes for Starlight, `sit({ foldVariant: 'sitFlank' })` (see `scenes/lib/creatures/README.md`) |
| `buildings.js` / `town.js` | slate shader anti-aliased by its pixel footprint (no moire); glazed windows that reflect the sky and dim interior bounce cards behind open doors (no black voids); banners with hanging folds and a lifted hem; bunting that flutters |

They are built from `scenes/lib/sets/`, a small library for live-action sets:

| file | what it gives you |
|---|---|
| `materials.js` | world-projected photo-texture materials (`worldMaterial`: box/triplanar mapping, anti-tiling, macro variation, grime, moss) and a 4-layer splat `terrainMaterial` with cliff strata, streaks and wet bands |
| `terrain.js` | `heightfield` (graded grids: dense near the camera, coarse far away), `gradedAxis`, seeded `makeNoise` |
| `grass.js` | geometry grass tufts (no alpha cards) with backlit translucency |
| `scatter.js` | bushes, rocks and instanced scattering |
| `kitbash.js` | photo-scanned cliff/rock pieces (CC BY 4.0, credited in `assets-lib/CREDITS.md`) placed as instances |
| `buildings.js` | stone walls with real openings and arches, halls, towers, field walls, lichen slate |
| `town.js` | jettied timber-framed houses with lime plaster, market stalls, bunting, banners, a fountain |
| `people.js` | crowd/extras from the MakeHuman rider: period outfits, actions (stand, walk, point, look up, ...), per-person pose variation, two-bone arm IK |
| `fx.js` | `silhouetteCard`: a soft matte-painting card of any object (the shape in the prologue fog) |

People made with `people.js` pass `clothSmooth` to `createRider`: the clothed
parts of the body are smoothed (density-aware, so the base mesh's dense
clusters do not stand proud) and loosened so garments hang instead of showing
anatomy; `hair: 'veil'` gives a linen coif and veil. Riders created without
these options are unchanged.

## Cinematic realism stack (opt-in)

The standard pipeline above is a clean, fast "CG" picture. The **cinematic
stack** (`runtime/cinematic/`) adds what makes a picture read as filmed by a
camera crew: a physical camera (lens, aperture, shutter, ISO), motion blur,
depth of field, ground-truth ambient occlusion and contact shadows, sharp
cascaded or contact-hardening soft sun shadows, a physically based sky with
matching haze, volumetric fog with light shafts and mist banks, an FFT ocean,
and a film grade (AgX/ACES, looks, CDL, lift/gamma/gain, `.cube` LUTs,
bloom/halation, sensor grain, vignetting, chromatic aberration, distortion).

It is **opt-in per scene**. A scene without `meta.cinematic` renders exactly
as before: the old path was checked to be byte-identical (14 frame hashes of
test-kingdom, final-fast and 10-bit captures before/after) and all 24
original tests still pass. Everything in the stack is a pure function of the
frame (no temporal accumulation from earlier frames), so chunks, resumes and
several browsers still produce identical bytes (checked by `npm test`).

### Turning it on

```js
export const meta = {
  title: 'Shot 3C-12',
  cinematic: true,                     // the defaults (see runtime/cinematic/config.js)
  // or: cinematic: 'hero'             // a preset: default | hero | preview | film | velocity
  // or: cinematic: { preset: 'hero', dof: { samples: 64 }, atmosphere: { enabled: true, haze: 3 } }
};

export function update(t, ctx) {
  // ... place everything ...
  ctx.lens.focalLength = 40;          // mm  (field of view from the sensor width)
  ctx.lens.sensor = 'super35';        // 'super35' | 'fullframe' | 'alexa65' | width in mm
  ctx.lens.fstop = 2.8;               // depth of field
  ctx.lens.focusTarget = dragon.head; // focus puller follows it (or ctx.lens.focus = 12 metres)
  ctx.lens.shutterAngle = 180;        // motion blur length (180 deg = 1/48 s at 24 fps)
  ctx.lens.iso = 800;                 // exposure and sensor noise
}
```

From the command line `--cinematic off` renders any scene without the stack
(fast previews), `--cinematic on` turns it on for a scene that does not ask
for it, and `--cinematic hero|preview|film|default|velocity` applies a preset on
top of the scene's own settings (`velocity` switches a scene that renders
accumulated sub-frames back to velocity motion blur + FXAA: same look, about
an eighth of the scene cost). Numbers inside `ctx.cinematic` (for example
`ctx.cinematic.grade.exposure`, `.volumetrics.density`) may change per frame in
`update()`; switching features on/off is done in `meta` or in `setup()`.

`scenes/cinematic-lookdev.js` is a complete example (morning coast: sea,
headland, mist banks, a dragon crossing, a boat-mounted camera with a focus pull).

### What each part does

* **Physical camera** (`dk/camera.js`, `ctx.lens`). Focal length + sensor
  give the field of view (three's `filmGauge`), f-stop + focus distance give
  the thin-lens circle of confusion, the shutter angle sets the motion-blur
  length, ISO scales exposure *and* sensor noise. `nd: 'auto'` (default) keeps
  exposure constant when you change f-stop or shutter, like a crew adding ND
  filters; `nd: <stops>` makes them change exposure exactly like a real camera.
  `cameraShake(t, { kind })` / `applyShake(camera, t, opts)`: deterministic
  operator movement - `handheld` (sway, breathing, micro-jitter), `vehicle`
  (boat/horse/cart), `dragonback` (wing-beat bob + turbulence), `wind`
  (gusty buffeting on a cliff), `aerial` (slow drift). Pure functions of t.
* **Motion blur, velocity mode (default).** update() is a pure function of t,
  so the runtime poses the whole scene at shutter-open time (t - T/2), keeps
  every object's world matrix, bone matrices, instance matrices and animated
  vertex positions, then poses it at t. Moving objects (skinned characters,
  instanced flocks, waving cloth included) get their own screen-space motion
  vectors; everything else gets the camera's motion from the depth buffer.
  The reconstruction filter is McGuire et al. 2012 with Jimenez' 2014
  improvements (tile max / neighbour max, sampling along both the dominant and
  the pixel's own velocity, depth-aware weights, jitter). Pixels whose
  neighbourhood does not move take the FXAA path instead, so the pass costs
  about what FXAA alone costs where nothing moves. Chunk-warmup (simulation)
  scenes use the previous simulated frame instead (they always simulate at
  least one frame before a chunk, so frames stay identical across chunk starts).
* **Motion blur, accumulate mode** (`motionBlur.mode: 'accumulate'`, the
  `hero` preset). N real sub-frames across the shutter interval (update() at
  each sub-frame time), each with a sub-pixel camera jitter (true
  supersampling) and the sun jittered inside its 0.53 degree disk (true
  penumbrae), averaged in 32-bit float. The most correct picture, N times the
  scene cost. Very fast motion with N = 8 can still show faint stepping.
* **Depth of field.** Physical CoC per pixel; half-resolution scatter-as-gather
  bokeh (Gustafsson 2018: golden-angle spiral, background may not bleed over a
  sharper foreground, an out-of-focus foreground spreads over the background
  like a real lens), loop length from a dilated tile maximum (in-focus tiles
  cost nothing), cat's-eye bokeh toward the frame edges (optical vignetting),
  bilateral upsampling into the full-resolution picture. In-focus areas stay
  at full 4K sharpness.
* **GTAO + contact shadows.** A depth-only pre-pass, ground-truth ambient
  occlusion (Jimenez et al. 2016, XeGTAO formulation) and short screen-space
  shadow rays toward the sun, both at half resolution with an edge-aware
  denoise. Every built-in lit material is patched so that AO darkens **only
  the indirect (sky/ambient) light** (with Jimenez' multi-bounce fit and
  three's specular occlusion) and contact shadows darken **only the sun** -
  no grey "SSAO halo" in sunlight.
* **Sun shadows.** `shadows.cascades: 1-4` fits cascaded maps to the camera
  every frame (stable: bounding spheres + texel snapping, linear cross-fades),
  each 2048x2048 by default (finer near the camera than one 4096 map over the
  whole view, and 2.2 s cheaper per 4K frame than 3 x 4096 in test-kingdom;
  `shadows.mapSize` overrides it). `shadows.pcss: true` (or
  `--shadow-filter pcss`) gives contact-hardening shadows: blocker search, then
  a filter as wide as the penumbra the real sun disk casts (sharp at a dragon's
  feet, soft under its wing 10 m up). The shadow cache (`ctx.shadows`) now
  also notices lights that moved under the same key (cascades follow the camera).
* **Physical sky + aerial perspective** (`atmosphere.enabled`). Hillaire 2020:
  Rayleigh, Mie and ozone on a spherical planet, transmittance and
  multiple-scattering LUTs (once), sky-view and aerial-perspective LUTs (per
  frame). The sky dome has a limb-darkened sun disk; the sun light's colour
  comes from the same atmosphere (a low sun turns orange by itself); a
  PMREM environment (without the sun disk) lights reflections. `haze`
  scales aerosols (1 = clear, 3-8 = hazy coast). With `sky: 'scene'` the
  scene's own background (a photographed HDRI from `assets-lib`) stays the
  sky and only the haze comes from the model, lit by the HDRI's extracted sun.
* **Volumetric fog** (`volumetrics.enabled`). Camera-aligned froxels
  (default 160 x 90 x 64, exponential depth): height fog, drifting 3D noise,
  up to 8 mist banks (`banks: [{ center, radius, density, noise }]` - the
  prologue fog, the Slitherwing's mist bank), lit by the sun **through its
  shadow map** (light shafts through colonnades, trees, wings, cliff edges),
  through moving cloud shadows (`cloudShadows`, also darkening the ground) and
  by the sky's ambient light; integrated with a prefix scan, applied per pixel.
  Two opt-in quality switches (both off by default, so existing scenes are
  unchanged): `noiseFilter: true` samples a mip-mapped noise volume at the
  froxel's footprint (no blocky fog at 4K when `noiseScale` is small), and
  `shadowSoftness: <metres>` takes a 16-tap disk of the sun shadow map per
  froxel (soft shaft edges instead of stair-stepped ones).
* **Ocean** (`dk/ocean.js`). Tessendorf FFT ocean with a JONSWAP spectrum and
  Hasselmann spreading (+ swell), three cascades (1100 m / 177 m / 27 m, 256^2
  each, no visible tiling), choppy displacement, Jacobian whitecaps. Pure
  function of t (phases reduced in double precision: hour-long takes stay
  exact). Geometry: a camera-facing sector grid whose spacing follows the
  screen (band-limited displacement, no swimming). Shading: three's physical
  material (IOR 1.333 Fresnel, sky reflections, GGX sun glitter with
  shadows) patched with FFT normals, roughness from the slope variance a
  pixel cannot resolve (the glitter path widens with distance, Bruneton 2010),
  backlit-crest subsurface glow, foam, and - drawn in a late pass that sees the
  scene behind it - shallow water showing the ground with Beer-Lambert
  absorption, plus foam lines around rocks, hulls and shores. Optional
  screen-space reflections (`createOcean(ctx, { ssr: true })`): a dragon or a
  cliff above the water is reflected in it, broken up by the waves (things
  off-screen are not; long reflections over rough water fade out, and the
  reflection edges are slightly aliased).
  `ocean.heightAt(x, z)` for buoyancy (boats, the camera boat).
* **Film look.** Exposure, white balance (Kelvin + tint, Bradford), natural
  cos^4 vignetting from the lens' field angle, and **sensor grain** (photon
  shot noise + read noise in linear light, scaled by ISO, a new deterministic
  pattern every frame, resolution-aware: a 4K grain looks the same at 1080p)
  are applied in scene-linear light like a camera does. Then the whole colour
  pipeline - scene-referred contrast/saturation, ASC CDL (in ACEScct), the tone
  mapper (AgX with looks `base | cinema | punchy | golden`, ACES, Khronos
  neutral), lift/gamma/gain and an optional `.cube` LUT (display LUTs, or
  log-input LUTs in LogC3 / ACEScct that replace the tone mapper) - is baked
  into one 64^3 3D LUT behind a log2 shaper, the way OpenColorIO does it.
  Bloom is a wide, energy-conserving lens-glare halo (1.2% by default);
  halation (red-orange film glow around highlights) is off for the default
  digital-cinema look and on in the `film` preset. Lateral chromatic
  aberration (0.7 px at the 4K corners) and optional radial distortion act on
  the sampling positions. The defaults aim at a modern digital cinema camera,
  not a filter look.
* **Fast image-based lighting.** three samples its PMREM environment twice per
  pixel of every PBR material, which is expensive on a CPU. Once per
  environment change the stack bakes 9 spherical-harmonic irradiance
  coefficients and a mip-mapped equirect of the environment; the patched
  materials use those (one texture tap for glossy reflections). Measured
  against three's lookups: 0.4 code values mean difference (`npm test` e8).
  `ibl: 'exact'` keeps three's path.
* **Debug views** (`cinematic.debug`): `ao`, `contact`, `velocity`, `coc`,
  `depth`, `dof`, `bloom`, `scene`, `fog` replace the picture by that buffer.

### What it costs (measured at 4K on this machine)

One 3840x2160 frame in one browser, steady state, from the stage marks of
`--timing` (machine as in "How fast is it?": 4 CPU threads, no GPU). Each
number is the median of 3-5 frames. Another render job shared the machine
during these runs; frames it disturbed (every stage slower at once) were
left out. To see the stages of your own shot: `node render/render.mjs --still
<scene> --time <t> --preset final --timing [--cinematic <mode>]` (the first
frame of a browser also compiles shaders, so it is slower than these).

**test-kingdom** (frame 120: castle, 13 700 instanced trees, flying dragon,
lake, Lambert/Standard materials), each feature switched on alone over the
bare stack:

| configuration | ms per 4K frame | vs bare stack |
|---|---:|---:|
| standard pipeline (no `meta.cinematic`), for reference | 1672 | |
| cinematic stack with every feature off (float buffers, grade LUT, dither) | 1338 | 0 |
| + FXAA | 1511 | +173 |
| + velocity motion blur (FXAA included where nothing moves) | 2048 | +710 |
| + DOF (nothing is out of focus in this shot: composite only) | 1419 | +81 |
| + GTAO + contact shadows | 1917 | +579 |
| + 3 shadow cascades (2048 each, the default) | 1902 | +564 |
| + 3 shadow cascades at 4096 each | 4116 | +2778 |
| + PCSS soft shadows | 1770 | +432 |
| + bloom | 1476 | +138 |
| + grain | 1461 | +123 |
| + vignette + chromatic aberration | 1405 | +67 |
| **default stack** (`cinematic: true`: FXAA, velocity MB, DOF, GTAO, contact shadows, bloom, grain, vignette, CA) | **2948** | +1610 |
| accumulate x8 instead of all of that (8 real sub-frames) | 10141 | +8803 |
| **`hero` preset** (default stack + accumulate x8) | **~11 700** | |

(The bare stack is cheaper than the standard pipeline because its grade is
one 3D-LUT lookup instead of the tone-mapping maths, and SwiftShader writes
its 32-bit float target faster than the standard path's 16-bit one.)

**scenes/cinematic-lookdev.js** (frame 96: physical sky, haze, volumetric fog
with two mist banks and cloud shadows, FFT ocean, headland, dragon, 3
cascades, velocity MB, DOF pulled onto the dragon, GTAO, full grade) - where
the time goes:

| stage | ms |
|---|---:|
| `update()` on the CPU: FFT ocean 3 x 256^2, twice (shutter open + now) | 125 |
| sky LUTs (sky-view, aerial perspective, ambient) | 20-75 |
| depth pre-pass + GTAO + contact shadows (half resolution) | 267 |
| 3D scene incl. 3 shadow cascades | 804 |
| ocean (late pass: shading, shallow water, foam, glitter) | 1075 |
| volumetric fog (froxel inject + scan) | 107 |
| object velocities | 65 |
| resolve (aerial perspective + fog applied, velocity/depth buffer) | 264 |
| motion blur (tiles + reconstruction) | 506 |
| DOF (half-res prefilter + gather) | 137 |
| bloom | 32 |
| final (DOF composite, CA, exposure, vignette, grain, grade LUT, dither) | 376 |
| YUV packing | 59 |
| **total** (stages are medians, so they do not add up exactly) | **3986** |

The same frame with one thing changed:

| change | ms per 4K frame |
|---|---:|
| the full stack as the scene sets it | 3986 |
| without DOF | 3760 |
| without volumetric fog | 3731 |
| without GTAO + contact shadows | 3655 |
| without velocity motion blur (FXAA instead) | 3343 |
| without cascades (the scene's single 4096 sun map) | 3464 |
| 3 cascades at 4096 each | 4196 |
| without bloom, grain, vignette, CA | 3790 |
| `ibl: 'exact'` (three's PMREM lookups instead of the baked SH + equirect) | 4478 |
| + PCSS soft shadows | 4128 |
| `preview` preset (no MB, no AO, fewer DOF taps) | 3180 |
| standard pipeline (no sky model, no fog, no water late pass: not the same picture) | 1106 |

Ocean screen-space reflections (`ssr: true`) about double the ocean pass
(measured at 1080p: 0.8 s -> 1.8 s), which is why they are off by default.

**What that means for a 50-60 minute episode** (72 000 - 86 400 frames).
The standard pipeline needs about 40-48 hours per episode on this machine.
With the default stack on shots like test-kingdom (~3 s per frame) and the
full stack on shots like the lookdev coast (~4 s) it is about **60-100
hours** per episode - four days on this 4-thread VM, if every shot uses the
stack. Accumulate (`hero`) shots cost ~12 s per frame: five minutes of them
add ~23 hours. Ways to bring that down: `--cinematic preview` (or `off`)
while blocking and for review cuts; the default stack instead of `hero`
except where motion really needs it; `--parts` to split an episode over
several machines; a machine with more cores or a real GPU (`--gpu`, not
measurable here). The work is resumable, so a multi-day render can be
stopped and continued at any time.

### Honest limits

* **Cost.** This is a CPU renderer (SwiftShader). Every feature has a price
  per 4K frame (table above); the full stack roughly doubles to triples a
  frame compared with the standard pipeline, and accumulate mode multiplies
  the scene cost by the sub-frame count. Choose per shot: `preview` preset
  or `--cinematic off` for blocking, the default stack for most shots,
  `hero` for the few shots that need it.
* **It cannot invent detail that the assets do not have.** Lighting, lens and
  atmosphere make a picture read as photographed, but a dragon made of
  primitives still looks like primitives. Live-action realism needs real
  models, textures and HDRIs (see `assets-lib/` and the creature work).
* **No temporal accumulation** (every frame must be a pure function of t), so
  the noisy estimators (GTAO, contact shadows, PCSS, DOF, motion-blur jitter)
  use static per-pixel noise patterns and spatial filters. At 4K with grain
  this is not visible in the stills checked, but a very clean, slow shot may
  show a faint fixed dither in soft penumbrae or fog.
* **Velocity motion blur** assumes straight motion during the shutter (a fast
  wing tip blurs along its chord, not its arc), cannot see vertex animation
  done in a custom vertex shader (wind) or morph targets' previous pose, and
  transparent things take the motion of what is behind them. Use accumulate
  mode for shots where that matters.
* **DOF** is capped at `dof.maxCoC` (2% of the width, 77 px at 4K); a blurred
  foreground cannot reveal what is hidden behind it (screen-space).
* **Screen-space effects** (GTAO, contact shadows, ocean refraction / SSR /
  shore foam) only know what is on screen.
* **Volumetric fog** has 24-pixel froxels at 4K by default: shafts are soft,
  and mist banks are noise-eroded ellipsoids, not simulations. Fog beyond
  `volumetrics.range` and outside the sun's shadow maps is unshadowed.
* **Physical sky** has no clouds (use a photographed HDRI with `sky: 'scene'`,
  or the cloud shadows); its haze in HDRI mode comes from the model and may not
  match the photo's horizon colour exactly (`atmosphere.haze`, `apDistanceScale`).
* **Ocean**: no breaking waves, spray or object-water interaction in the
  geometry; the shore line is a depth-based foam line (`surf` makes its core
  solid whitewater) and ship wakes (`setWake`) are foam patterns on the
  surface, not displaced water - waves do not break on beaches or bows.
* The material patch covers three's built-in lit materials (Standard,
  Physical, Lambert, Phong, Toon); custom ShaderMaterials are left as they are.
  If any material fails to compile with the stack on, the frame fails with
  the compiler's message instead of silently rendering without that object.

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
runtime/cinematic/ (only for scenes with meta.cinematic)
  update(t - T/2) -> remember poses, update(t)          velocity.js
  sky / aerial-perspective LUTs, sun light              atmosphere.js
  cascades fitted to the camera, env bake (SH + equirect)  shadows.js, envbake.js
  depth pre-pass -> GTAO + contact shadows (half res)   ao.js
  scene (patched materials: AO on indirect light only, contact/cloud shadows on the sun,
         cascades, fast IBL) -> RGBA32F + depth texture  materials.js
  [late objects: ocean, with copies of colour + depth]
  froxel fog (shadow-mapped)                            volumetrics.js
  resolve: haze + fog + per-pixel velocity  ->  motion blur (+FXAA)  ->  DOF (half res)
  -> bloom pyramid -> final: exposure, WB, vignette, grain, baked colour LUT, CA, distortion
  -> the same YUV pack (8-bit target with dither, or float for 10 bit)    passes.js, colorlut.js
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
* Disk: a 4K chunk of 10 s is ~25 MB at CRF 16, a 60-minute episode
  ~9 GB (chunks + final file, so plan ~18-20 GB while rendering). Nothing is
  ever written as PNG frame sequences.
* Memory: the 10-second 4K clip with 2 browsers (the benchmark's choice here)
  peaked at 5.6 GB for everything (browser processes ~2.8 GB, the two x264
  encoders ~2.5 GB, node 0.3 GB); with 4 browsers ~10.6 GB. Memory stays flat
  on long jobs (node ~0.2-0.3 GB and each page ~0.3 GB from the first to the
  last chunk), so 16 GB is enough; `--workers auto` caps the browser count by
  the machine's RAM.
* Node.js 20 or newer (tested with 20, 21 and 22).

## Tests

`npm test` (about 3 minutes, everything at 320x180, temp files removed
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
* (e) cinematic stack (`test/cinematic.test.mjs`, fixtures `cinematic-*.js`):
  lens / shake / config / colour-pipeline math; a frame with the whole stack
  (FFT ocean, physical sky, volumetric fog, cascades, velocity motion blur on
  skinned, instanced and vertex-animated meshes, DOF, grain) is byte-identical
  after other frames and in another browser; every float buffer of the stack
  is free of NaN/Inf and pictures are neither black nor blown out (also in
  accumulate mode, with distortion/halation, with ACES + CDL), and every lit
  material kind (Standard, Lambert, Phong, Toon) compiles with the stack's
  patches (a shader that fails to compile fails the frame); grain changes
  every frame, is reproducible, vanishes when off and grows with ISO; an
  identity `.cube` LUT changes nothing and an inverting one (loaded from a file
  next to the scene) inverts; motion blur leaves a still picture untouched and
  blurs moving things, accumulate mode agrees between browsers; chunk-warmup
  scenes with motion blur do not depend on the chunk start; scenes without
  `meta.cinematic` get nothing; `--cinematic off|<preset>` works and bad values
  are refused; fast image-based lighting stays within 0.4 code values (mean) of
  three's PMREM lookups.
