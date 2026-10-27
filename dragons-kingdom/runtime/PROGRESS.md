# runtime/ - quality tiers for the RTX 4090 (track: gpu-tier / "ultra")

Owner of this file: the quality-tier track. Successor: read this first, then `runtime/lib/quality.js`
and the README section "Quality tiers for the render PC (RTX 4090)".

## Goal

Final 4K masters render on Daxtyn's PC (Windows 11, RTX 4090). The `final` preset was tuned for the
CPU cloud machine. The tiers turn every quality knob up where a GPU can afford it - opt-in, deterministic,
finer sampling of the reviewed picture (the knobs that change the look are listed in the README) - and `render/gpu-check.mjs` measures final vs the tiers on his GPU and recommends
the tier that keeps Episode 1 under ~3 days.

## Map of the work

| file | what |
|---|---|
| `runtime/lib/quality.js` | tiers final / high / ultra8 / ultra / max, `TIER_PRESETS`, `qualityFor()` (ctx.quality), `applyTierToCinematic()` (only raises; `ctx.quality` may override parts), `froxelAtlas()`, `KNOB_DOCS`, cost model (`frameWork`, `tierCost`, `estimateFrameMs`, `RTX4090_ASSUMPTIONS`), `fillTierTimes`, `planEpisode`, scene helpers `density()`, `scaleCount()`, `tierOf()` |
| `render/lib/presets.mjs` | presets `final-high`, `final-ultra8`, `final-ultra`, `final-max` (3840x2160, `quality.tier`), `presetTier()` |
| `runtime/dk-runtime.js` | tier wiring (ctx.quality before setup, cinematic knobs after setup), `ctx.preset` = 'final' for tier presets, anisotropy pass, `dk.frameStats()` work counters, `info.quality` |
| `runtime/cinematic/ssr.js` | wet/glossy-surface reflections: second program variant of the same material in the late pass, Hi-Z traversal, delta vs env, clearcoat, debug view 'ssr' |
| `runtime/lib/ocean-gpu.js` | GPU FFT (spectrum, 2 log2 N butterfly passes, assemble; float32, phase split for hour-long t), readback for heightAt |
| `runtime/lib/ocean.js` | `gpuFFT` option + tier defaults (resolution, ssr, ssrSteps, gpuFFT); heightAt() reads 4 texels per cascade on the GPU; experimental Hi-Z sea reflections (`useHiZ`, `cinematic.ssr.sea`) |
| `runtime/cinematic/ao.js` | `ao.resolution` 1 = full-res GTAO |
| `runtime/cinematic/volumetrics.js`, `passes.js` | tiled froxel atlas (one column = old layout, byte-identical), `softTaps`, `densityGrid` (DK_VOL_DENS_GRID: density on the scene's grid, light on the finer one), tile-max stride |
| `runtime/cinematic/index.js` | SSR wiring (after the late pass), `lateLights` (opt-in), accumulate-mode camera fix, hybrid sub-frames (`renderHybrid`: per-sub-frame velocity blur over its 1/N slice, haze/fog resolve, GTAO) |
| `runtime/tools/tier-lookdev.js` | procedural scene exercising every knob |
| `runtime/tools/tier-check.mjs` | CLI: render a scene at tiers, compare structure, counters, 4090 estimate; exported helpers |
| `runtime/tools/tier-bench.mjs` | gpu-check's tier benchmark + plan + report lines |
| `render/gpu-check.mjs` | section "4. quality tiers" (pc-kit's file; this track's hook only), `--tiers`, `--tier-size`, `--budget-hours` |
| `test/tiers.test.mjs`, `test/fixtures/tier-scene.js`, `fast-motion.js`, `glossy-sea.js` | (u0) maths, (u0b) episode follows only a measured recommendation, (u0c) density append-only, (u1) structure/NaN/shader errors, (u2) determinism of ultra, (u3) GPU vs CPU FFT, (u4) fast motion: hybrid streak + per-sub-frame AO, (u5) glossy over water |
| outside runtime/ (reviewer's requests) | `render/episode.mjs` + `render.mjs` `--tier`, `render/gpu-check.mjs` measure-before-recommend, `pc/Render-Episode.cmd` + `pc/RENDER_ON_YOUR_PC.md` tier lines, `scenes/lib/sets/grass.js` + `scenes/lib/nature/plants.js` append-only density, `scenes/lib/architecture/materials.js` dkSSR marks |

## State (newest first)

### Session 2 (2026-10-27, review fixes)

Fixed (each verified on the cloud CPU, pictures looked at at 1:1):
- Tiers reach the masters: `render/episode.mjs --tier` / `--preset final-*`; by default it follows
  gpu-check.json only when that tier was measured (not extrapolated) at 3840x2160 on this card, every
  picture check passed and the tier definitions are unchanged (`tierDefsHash`), else `final`; banner,
  status, DONE.json `tier`; `render.mjs --tier`; resumes never mix tiers (the job fingerprint has the tier).
- Sub-frame banding: hybrid accumulation (velocity blur inside each sub-frame over its 1/N slice x2 tent
  overlap, vectors from the previous sub-frame's pose). Fast-motion fixture (u4): banding metric
  1.72 -> 0.88, coverage unchanged; per-sub-frame GTAO: the crate's contact strip 2.84 -> 1.03.
- SSR after the late pass (the sea is in depth/colour: u5, a steel ball over the sea reflects water, not
  the sand under it). Sea SSR OFF at every tier: the fixed-step march hatches; the Hi-Z sea variant
  (`cinematic.ssr.sea: true`, experimental) returned sea-bed colours where it should hit the ball and I
  could not find why (float64 CPU replicas of the trace found no hit for flat water either) - next step
  if anyone picks it up: trace one pixel on the glossy-sea fixture with `cinematic.debug = 'ssr'`
  and compare the Hi-Z level walk with seasim.mjs-style replicas.
- SSR fallback (no lights_fragment_end) discards instead of drawing the surface a second time.
- Structure gate back to 192x108 (SSIM >= 0.85, PSNR >= 25 dB) + 1:1 crop PSNRs; one-knob A/B
  (`tier-check --knobs all --crops ...`, `quality.only`). On the lookdev coast it found two knobs that
  changed the look: the 512 ocean (SSIM 0.825 alone; the earlier gpu-check failure
  gpu-check-2026-10-27-08-57-03: high/ultra 0.81 at 192x108) and the froxel grid (mist crop 35 dB).
  Fixes: the ocean tier is the same 256 sea on the GPU (57 dB; 512 stays a scene's choice); the froxel
  grid samples the density on the scene's own grid and only the light on the finer one, x2 across the
  screen and the same depth slices (finer slices moved how much of a mist bank lies in front of the
  cliffs: mist crop 39.7 dB at x1 x1 x1.5 vs 43.6 dB at x2 x2 x1).
- ibl stays 'fast' at every tier: the exact PMREM lookups alone dimmed the warm sun path on F1's sea
  (ibl knob alone: structure 0.992 / 37.6 dB, glitter crop 30 dB - all of the high tier's difference there).
- density wired, append-only (u0c): grassField `density` (extra tufts after the reviewed ones, same random
  stream), scatterPlants grass + thrift tufts + shrubs (own stream, shifted grid). crowd: contract only.
- dkSSR marks: architecture puddle, pool, quay stone + joints (tide band), harbour stone, setts.
- textureScale removed (no library read it, no 2K textures shipped); density.particles removed (the FX
  library's own tier does particles).
- heightAt() on the GPU reads 4 texels per cascade; planner recommends only measured tiers, heavy F5
  check at the recommended tier only; `--tiers all`; tier-check uses the pinned ffmpeg; RUNTIME_VERSION 1.2.0.

Final stays byte-identical (session-2 runtime + library edits vs the session-1 worktree ce50161, same
frame, same size): cinematic-lookdev f96 velocity 480x272 and hero 320x180, test-kingdom f30,
cinematic-scene / cinematic-sea-scene fixtures, architecture-cling f84 (with the dkSSR marks). nature-tree
f24 differs by 64 bytes (max 3 code values) - but it differs between two runs of the SAME code too (84
bytes, max 2): that scene is not byte-reproducible across browser sessions (pre-existing; the nature /
runtime owner should look; chunked renders of it may not match at chunk joins by a code value or two).

npm test (end of session 2): 49 tests, 48 pass, 0 fail, 1 skipped (PowerShell). Tier fixture (u1, 320x180,
every knob incl. the mirror puddle): high SSIM 0.927 / 28.8 dB, ultra 0.875 / 26.0 dB (gate 0.85 / 25 -
the puddle's reflection and the 16-sub-frame supersampling are most of it); u4 banding 1.721 -> 0.877, crate
strip 2.836 -> 1.032; u5 rim (12,34,57) -> (21,75,77), water hatching 3.035 -> 3.051.

A/B for the director (480x272, final vs high; images listed in the session report):
- lookdev coast: high 0.9991 / 49.6 dB (mist 43.8, rocks 42.5, sea 43.5 dB); ultra 0.991 / 38.7 dB (sea and
  rock edges motion-blurred and supersampled by the 16 sub-frames).
- F1 prologue (dawn sea): high 0.9997 / 57.5 dB, sun-path crop 55.7 dB (after keeping the fast IBL).
- F3 flight (dragons over the shallows): high 0.9996 / 54.9 dB, sea crop 48 dB.
- per knob on the coast at the ultra knob tier: subframes 0.991, volumetrics 0.9993, ocean 0.9999, the rest
  >= 0.9999; per knob on F1: only ibl mattered (now off).

Observed, not changed (final is the reviewed look):
- The Cling set (scenes/lookdev/architecture-cling.js) has NaN values in the scene buffer AT FINAL (138 at the
  gate shot t=3.5, across the upper half of the frame; 45 at the fountain, 39 at the Verdor harbour) - not the
  tiers' doing (same count with SSR on and with no SSR object at all). Architecture track to look at;
  `dk.debugCinematic()` now reports a `nanBox` per buffer. tier-check now judges only the NaN a tier ADDS.
- SSR on the Cling fountain basin (pool marked dkSSR): the water reflects the pillar base, the rim and the
  houses instead of the sky map - structure 0.938 / 25 dB: the largest look change of any tier knob, in the
  A/B images for the director (keep or drop `pool` from the marks in architecture/materials.js).
- final's velocity blur barely blurs a thin fast bar / a 30 m/s crate in the fast-motion fixture
  although the velocity buffer has the vectors (debug view): thin objects can slip between the tile
  samples at final (`motionBlur.tileStride` 2; the tiers use 1).
- Depth of field at the sub-frame tiers uses the centre sub-frame's depth.

Next (open):
- 4K numbers from the real GPU (gpu-check on Daxtyn's PC).
- Director: pass `density: density(ctx, 'grass')` (or ctx.quality.density.grass) to the grassField calls in
  `scenes/lib/director/sets/verdor-grounds.js` if the riding-ground grass should thicken at the tiers.
- Sea SSR (see above). Ocean sun glitter in the late pass (`lateLights`, session 1).

### Session 1 (2026-10-27)

Checked (all on the cloud CPU, SwiftShader):
- `final` byte-identical to the pre-tier runtime (git worktree A/B): cinematic-lookdev (velocity + hero),
  test-kingdom, cinematic-scene and cinematic-sea-scene fixtures. Re-run after every runtime change:
  `ab.mjs`-style check = render the same frame with `git worktree add <dir> <old commit>` and compare bytes.
- every tier: same structure (96x54 thumbnail SSIM 0.89-0.92 on quay lookdev, coast, tier fixture), no
  NaN/Inf, no shader errors; deterministic (ultra frame identical after other frames / other browser).
- GPU FFT vs CPU FFT: heightAt within 0.17 mm, picture PSNR 58 dB, exact at t = 59 min; 512 keeps the sea.
- style frame F4 (birthing chamber, film finish x8) at 480x272: high SSIM 0.990 / 39.3 dB, ultra (x16)
  0.990 / 39.0 dB vs final, same picture (2x crops of the hatchling and Alexandria's hands: smoother cloth
  edges, nothing else). Its `update()` is ~270 ms per call on the cloud CPU, so on the PC the CPU side,
  not the GPU, sets the price of sub-frames (estimate ~1.1 s final -> ~2.1 s ultra per 4K frame).
- npm test: 45 tests, 44 pass, 1 skipped (PowerShell, as before).
- gpu-check `--swiftshader --candidate lookdev-coast --tiers high,ultra --tier-size 480x272` runs end to end
  (bench, picture check per tier, plan table, RECOMMENDED banner, gpu-check.json `tiers` + `recommendedPreset`).

Bugs found and fixed:
- Accumulate (sub-frame) mode was not order-independent: the aerial-perspective LUT used the camera's
  world matrix before this frame's update, i.e. the previous frame's last sub-frame (or the setup pose in
  a browser's first frame) - max 2-8 code values in the haze. Affected `hero`, the style frames' film
  finish, shot 1E-03 (film). Fixed for accumulate mode only (velocity mode byte-identical).
- three uploads `ivec4[]` uniforms with uniform4iv as given: use a flat Int32Array, not Vector4s.

Found, NOT fixed in final (opt-in fix `cinematic.lateLights = true`, director to decide):
- The ocean is drawn in the late pass with the camera on layer 30 only; three gathers only lights that
  pass the camera's layer test, so the cinematic ocean is compiled with 0 directional lights and no
  shadows: no GGX sun glitter, no sun on foam (probe: DKOcean program cache key, late pass). Sea shots so
  far were reviewed that way.

Decisions:
- `volumetrics.noiseFilter` stays the scene's choice (it turns distant mist wisps into flat haze).
- Tier presets are the final preset at a higher tier (native 4K, every frame); SERIES.md section 2 still
  says "--preset final" for masters - that wording is pc-kit's / Daxtyn's (REQUEST in the report).
- (session 1) Structure was judged at 96x54 - too loose: back to 192x108 + crops in session 2.

Next (open):
- 4K numbers from the real GPU (gpu-check on Daxtyn's PC). Then tune the ladder (e.g. a cheaper rung
  between final and high if high does not fit 72 h).
- (done in session 2: density in sets/grass + nature plants, dkSSR in architecture, episode.mjs --tier;
  textureScale dropped.)
