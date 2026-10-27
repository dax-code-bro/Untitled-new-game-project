# runtime/ - quality tiers for the RTX 4090 (track: gpu-tier / "ultra")

Owner of this file: the quality-tier track. Successor: read this first, then `runtime/lib/quality.js`.

## Goal

Final 4K masters render on Daxtyn's PC (Windows 11, RTX 4090). The `final` preset was tuned for the
CPU cloud machine. The tiers turn every quality knob up where a GPU can afford it - opt-in, deterministic,
same picture content - and `render/gpu-check.mjs` measures final vs final-ultra on his GPU and recommends
the tier that keeps Episode 1 under ~3 days.

## State (newest first)

### Session 1 (2026-10-27)

Done and checked:
- `runtime/lib/quality.js`: tiers final / high / ultra / max, `TIER_PRESETS` (final-high, final-ultra,
  final-max), `qualityFor()` (ctx.quality: tier, fxTier, density, textureScale, anisotropy, ocean, ssr),
  `applyTierToCinematic()` (sample counts only go up), `froxelAtlas()`, `KNOB_DOCS`, a cost model
  (`frameWork()`, `tierCost()`), helpers `density(ctx, kind)`, `scaleCount()`, `tierOf()`.
- `render/lib/presets.mjs`: presets `final-high`, `final-ultra`, `final-max` (3840x2160, quality.tier).
  Scenes see `ctx.preset === 'final'` (hero creature builds etc. unchanged).
- `runtime/dk-runtime.js`: tier wiring (quality before setup, cinematic knobs after setup), anisotropic
  filtering after setup (`applyAnisotropy`), per-frame work counters (`dk.frameStats()`: passes, draw
  calls, triangles, full-screen pixels, update() calls + ms), `info.quality` (tier + every change made).
- `runtime/cinematic/ao.js`: `ao.resolution` 1 = full-resolution GTAO + contact shadows.
- `runtime/cinematic/volumetrics.js` + `passes.js`: froxel atlas tiled in columns when the grid is taller
  than the GPU texture limit (one column = the old layout, byte-identical); soft-shadow tap count.
- `runtime/cinematic/ssr.js` (new): screen-space reflections on wet/glossy surfaces - same material,
  second program variant (DK_SSR_PASS), drawn in the late pass, adds (scene hit - env radiance) x
  singleScattering x spec. occlusion (+ clearcoat). Hi-Z min-depth pyramid traversal (after FidelityFX
  SSSR's scheme): exact, no noise. Debug view `cinematic.debug = 'ssr'` colour-codes why rays end.
  Libraries mark wet materials with `material.userData.dkSSR = true`.
- `runtime/cinematic/index.js`: SSR wiring, `lateLights` (opt-in, see finding below).
- `runtime/tools/tier-lookdev.js`: a procedural scene that exercises every knob.
- A/B against the pre-tier runtime (git worktree): cinematic-lookdev (velocity and hero), test-kingdom,
  both cinematic test fixtures - final pictures BYTE-IDENTICAL.

Findings / decisions:
- `volumetrics.noiseFilter` is NOT turned on by the tiers: it averages distant mist-bank wisps into flat
  haze (a different look; seen on the lookdev coast).
- FOUND A BUG (not fixed in final, opt-in fix `cinematic.lateLights = true`): the ocean is drawn in the
  late pass with the camera on layer 30 only; three.js only gathers lights that pass the camera's layer
  test, so the cinematic ocean is compiled with 0 directional lights and no shadows - no GGX sun glitter,
  no sun on the foam (probe: the DKOcean program's cache key lists 0 dir lights in the late pass). All
  sea shots so far were reviewed this way, so the default is unchanged; the director decides.
- three uploads `ivec4[]` uniforms with uniform4iv as given: use a flat Int32Array, not Vector4s.

Next (planned):
- tests (test/tiers.test.mjs): structure vs final (thumb SSIM), NaN/black, determinism per tier.
- runtime/tools/tier-check.mjs: render a scene at every tier, compare, counters -> cost model.
- gpu-check: benchmark final vs final-ultra, recommend a tier for <= ~72 h.
- GPU FFT ocean (512, per sub-frame) - the CPU FFT at 512 x 16 sub-frames would cost ~2 s/frame.
- README section "Quality tiers for the RTX 4090".
