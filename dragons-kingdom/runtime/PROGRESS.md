# runtime/ - quality tiers for the RTX 4090 (track: gpu-tier / "ultra")

Owner of this file: the quality-tier track. Successor: read this first, then `runtime/lib/quality.js`
and the README section "Quality tiers for the render PC (RTX 4090)".

## Goal

Final 4K masters render on Daxtyn's PC (Windows 11, RTX 4090). The `final` preset was tuned for the
CPU cloud machine. The tiers turn every quality knob up where a GPU can afford it - opt-in, deterministic,
same picture content - and `render/gpu-check.mjs` measures final vs the tiers on his GPU and recommends
the tier that keeps Episode 1 under ~3 days.

## Map of the work

| file | what |
|---|---|
| `runtime/lib/quality.js` | tiers final / high / ultra8 / ultra / max, `TIER_PRESETS`, `qualityFor()` (ctx.quality), `applyTierToCinematic()` (only raises; `ctx.quality` may override parts), `froxelAtlas()`, `KNOB_DOCS`, cost model (`frameWork`, `tierCost`, `estimateFrameMs`, `RTX4090_ASSUMPTIONS`), `fillTierTimes`, `planEpisode`, scene helpers `density()`, `scaleCount()`, `tierOf()` |
| `render/lib/presets.mjs` | presets `final-high`, `final-ultra8`, `final-ultra`, `final-max` (3840x2160, `quality.tier`), `presetTier()` |
| `runtime/dk-runtime.js` | tier wiring (ctx.quality before setup, cinematic knobs after setup), `ctx.preset` = 'final' for tier presets, anisotropy pass, `dk.frameStats()` work counters, `info.quality` |
| `runtime/cinematic/ssr.js` | wet/glossy-surface reflections: second program variant of the same material in the late pass, Hi-Z traversal, delta vs env, clearcoat, debug view 'ssr' |
| `runtime/lib/ocean-gpu.js` | GPU FFT (spectrum, 2 log2 N butterfly passes, assemble; float32, phase split for hour-long t), readback for heightAt |
| `runtime/lib/ocean.js` | `gpuFFT` option + tier defaults (resolution, ssr, ssrSteps, gpuFFT); N > 256 keeps the 256 sea |
| `runtime/cinematic/ao.js` | `ao.resolution` 1 = full-res GTAO |
| `runtime/cinematic/volumetrics.js`, `passes.js` | tiled froxel atlas (one column = old layout, byte-identical), `softTaps` |
| `runtime/cinematic/index.js` | SSR wiring, `lateLights` (opt-in), accumulate-mode camera fix |
| `runtime/tools/tier-lookdev.js` | procedural scene exercising every knob |
| `runtime/tools/tier-check.mjs` | CLI: render a scene at tiers, compare structure, counters, 4090 estimate; exported helpers |
| `runtime/tools/tier-bench.mjs` | gpu-check's tier benchmark + plan + report lines |
| `render/gpu-check.mjs` | section "4. quality tiers" (pc-kit's file; this track's hook only), `--tiers`, `--tier-size`, `--budget-hours` |
| `test/tiers.test.mjs`, `test/fixtures/tier-scene.js` | (u0) maths, (u1) structure/NaN/shader errors, (u2) determinism of ultra, (u3) GPU vs CPU FFT |

## State (newest first)

### Session 1 (2026-10-27)

Checked (all on the cloud CPU, SwiftShader):
- `final` byte-identical to the pre-tier runtime (git worktree A/B): cinematic-lookdev (velocity + hero),
  test-kingdom, cinematic-scene and cinematic-sea-scene fixtures. Re-run after every runtime change:
  `ab.mjs`-style check = render the same frame with `git worktree add <dir> <old commit>` and compare bytes.
- every tier: same structure (96x54 thumbnail SSIM 0.89-0.92 on quay lookdev, coast, tier fixture), no
  NaN/Inf, no shader errors; deterministic (ultra frame identical after other frames / other browser).
- GPU FFT vs CPU FFT: heightAt within 0.17 mm, picture PSNR 58 dB, exact at t = 59 min; 512 keeps the sea.
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
- Structure is judged at 96x54: the detail a tier adds (ripples, sharper shadows) must not count.

Next (open):
- 4K numbers from the real GPU (gpu-check on Daxtyn's PC). Then tune the ladder (e.g. a cheaper rung
  between final and high if high does not fit 72 h).
- Libraries should read `density(ctx, kind)` (director's verdor-grounds grass `k`, sets/grass, nature
  plants, crowds) and mark wet materials `userData.dkSSR` (architecture puddles/wet cobbles, sets wet bands,
  creatures' wet hatchling, Starlight is auto by roughness if <= 0.4).
- 2K/4K PBR texture variants (assets-lib only has 1K ambientCG files) for `textureScale`.
- episode.mjs `--preset` passthrough (it hard-codes `--preset final`) + read `recommendedPreset`.
