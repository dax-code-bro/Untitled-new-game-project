// Quality tiers (import from 'dk/quality.js' in scenes; the runtime and the Node tools use it too).
//
// The render presets decide the SIZE of a picture (draft 960x540 ... final 3840x2160). A quality
// TIER decides how much work goes into every pixel of it. The masters are rendered with the
// `final` preset on Daxtyn's PC (an NVIDIA RTX 4090), which can afford far more work per pixel
// than the CPU cloud machine the shots are made and reviewed on. The higher tiers turn every
// knob up where a GPU can afford it - and only there: they never change WHAT is in the picture
// (camera, lens, light, grade, grain, look), only how finely it is sampled. A tier is opt-in:
//
//   node render/render.mjs <scene> --preset final-ultra        (native 4K, ultra tier)
//   openSession({ ..., quality: { tier: 'ultra' } })            (any size: tests, previews)
//
// Tiers, cheapest first (the gpu-check picks the highest that keeps Episode 1 under ~3 days):
//
//   final   the master settings as reviewed on the cloud CPU (the default; nothing changes)
//   high    every GPU knob up, motion blur stays velocity-based (one scene pass per frame)
//   ultra   high + 16 real sub-frames per frame (true motion blur, 16x supersampling, sun
//           penumbrae) instead of the velocity motion blur
//   max     high + 32 sub-frames, the densest settings
//
// Everything stays a pure function of t (no temporal accumulation, no wall clock), so chunks,
// resumes and several browsers still give identical bytes at every tier.
//
// What scenes / libraries can read (ctx.quality, set before setup()):
//   ctx.quality.tier             'high' | 'ultra' | 'max' (undefined at final: use tierOf(ctx))
//   ctx.quality.fxTier           the FX library's tier (scenes/lib/fx/core/tier.js): 'ultra' above final
//   ctx.quality.density          { grass, vegetation, crowd, particles }: multipliers for instance
//                                counts (1 at final) - use density(ctx, 'grass') below
//   ctx.quality.textureScale     multiplier for procedurally generated texture sizes (1 at final)
//   ctx.quality.ocean            defaults dk/ocean.js uses (resolution, ssr, ssrSteps; a scene's own options win)
//   ctx.quality.anisotropy       anisotropic filtering applied to every mip-mapped texture after setup (0 = leave)

export const TIER_NAMES = ['final', 'high', 'ultra', 'max'];

// Render presets that are the native-4K final preset at a higher tier. The scene sees
// ctx.preset === 'final' (so hero creature builds etc. are chosen exactly as for final).
export const TIER_PRESETS = { 'final-high': 'high', 'final-ultra': 'ultra', 'final-max': 'max' };

const FINAL = {
  name: 'final',
  label: 'final - the master settings reviewed on the cloud CPU',
  subframes: 0,                 // 0: the scene's own motion blur (velocity, or its own accumulate count)
  motionBlurSamples: 20,        // velocity motion blur: taps per pixel at the longest blur
  cascadeMapSize: 2048,         // per cascade (scenes with shadows.cascades > 0)
  ao: { resolution: 0.5, slices: 3, steps: 6, contactSteps: 10 },
  dofSamples: 48,
  volumetrics: { scale: [1, 1, 1], softTaps: 16 },
  ibl: 'fast',
  anisotropy: 0,                // 0: textures keep what the scene set
  ocean: { resolution: 256, ssr: false, ssrSteps: 24, gpuFFT: false },
  ssr: { enabled: false, steps: 0, maxRoughness: 0, thickness: 0 },
  density: { grass: 1, vegetation: 1, crowd: 1, particles: 1 },
  textureScale: 1,
  fxTier: null,                 // the FX library chooses (final on a GPU)
};

const HIGH = {
  ...FINAL,
  name: 'high',
  label: 'high - every GPU knob up, velocity motion blur',
  motionBlurSamples: 48,
  cascadeMapSize: 4096,
  ao: { resolution: 1, slices: 4, steps: 10, contactSteps: 24 },
  dofSamples: 128,
  volumetrics: { scale: [2, 2, 1.5], softTaps: 32 },
  ibl: 'exact',
  anisotropy: 16,
  ocean: { resolution: 512, ssr: true, ssrSteps: 48, gpuFFT: true },
  ssr: { enabled: true, steps: 96, maxRoughness: 0.4, thickness: 0.35 },
  density: { grass: 1.5, vegetation: 1.3, crowd: 1.25, particles: 2.5 },
  textureScale: 2,
  fxTier: 'ultra',
};

export const TIERS = {
  final: FINAL,
  high: HIGH,
  ultra: { ...HIGH, name: 'ultra', label: 'ultra - high + 16 real sub-frames per frame', subframes: 16 },
  max: {
    ...HIGH, name: 'max', label: 'max - high + 32 sub-frames, densest settings', subframes: 32, motionBlurSamples: 64,
    ao: { resolution: 1, slices: 6, steps: 12, contactSteps: 24 }, dofSamples: 192,
    volumetrics: { scale: [2, 2, 2], softTaps: 32 },
    ssr: { enabled: true, steps: 128, maxRoughness: 0.45, thickness: 0.35 },
    density: { grass: 2, vegetation: 1.6, crowd: 1.5, particles: 2.5 },
  },
};

/**
 * What each knob does - one place for the README, the tools and the gpu-check report.
 * cost: what it multiplies on a GPU (the cost model in tierCost() below uses the same numbers).
 */
export const KNOB_DOCS = [
  ['subframes', 'Real sub-frames per frame (accumulate mode): update() and the whole scene + shadow pass run N times across the 180-degree shutter, each with a Halton sub-pixel jitter and the sun jittered inside its 0.53-degree disk, averaged in 32-bit float. True motion blur (wing tips blur along their arc, not a straight line), N-x supersampling (no stair-stepped rigging, no sparkling scale highlights) and real sun penumbrae. Replaces velocity motion blur + FXAA. Scenes that already render sub-frames keep the larger count. Chunk-warmup (simulation) scenes cannot (velocity motion blur with more taps instead).', 'scene pass x N, update() x N on the CPU'],
  ['motionBlurSamples', 'Velocity motion blur taps per pixel at the longest blur (high tier, and simulation scenes at ultra/max): smoother streaks, less noise in long blurs.', 'motion-blur pass ~x2.4'],
  ['cascadeMapSize', 'Sun shadow cascades (scenes with shadows.cascades) at 4096x4096 each instead of 2048: half the texel size, so thin casters (rigging, spears, grass, fingers) keep their shadows and edges stop stepping.', 'shadow pass ~x4 texels per cascade'],
  ['ao', 'GTAO + contact shadows at full resolution instead of half, with more slices / steps / contact-ray steps: no blocky occlusion in creases (scales, cloth folds, masonry joints) at 4K and contact shadows that reach thin objects.', 'GTAO pass ~x4 pixels x ~2.2 taps'],
  ['dofSamples', 'Depth-of-field gather taps at the largest blur: smoother bokeh discs and out-of-focus foregrounds without grain.', 'DOF gather ~x2.7 (only where something is out of focus)'],
  ['volumetrics', 'Froxel fog grid x2 across the screen (12-pixel froxels at 4K instead of 24) and x1.5 in depth (stored as a tiled atlas when it is taller than the GPU texture limit), 32-tap soft shadow lookups where the scene asked for soft shafts: sharper light shafts through trees, colonnades and wings, finer fog edges. (The mip-filtered noise switch stays the scene\'s choice: it turns distant mist wisps into flat haze.)', 'fog inject ~x6 froxels'],
  ['ibl', "Image-based lighting from three's exact PMREM lookups instead of the baked spherical harmonics + equirect (the CPU shortcut): glossy reflections exactly as three.js intends.", 'two env lookups per lit pixel'],
  ['anisotropy', 'Anisotropic texture filtering x16 on every mip-mapped texture: ground, roads, roofs and water stay sharp at grazing angles instead of blurring.', 'texture taps on grazing surfaces'],
  ['ocean', 'FFT ocean: 512x512 per cascade (finest ripples 11 cm instead of 21 cm) computed on the GPU each sub-frame, screen-space reflections of dragons, ships and cliffs in the water with 48 ray steps.', 'ocean late pass ~x2 (SSR), FFT passes'],
  ['ssr', 'Screen-space reflections on wet and glossy surfaces (puddles, wet cobbles and stone, polished metal, glazed windows, wet scales): the real scene is reflected instead of only the sky map, traced exactly through a min-depth pyramid (Hi-Z, 96 iterations: no stepping noise), blurred by roughness from a mip-mapped colour copy; fades at the screen edges and where the ray passes behind an object.', 'reflective objects drawn twice + Hi-Z build + trace'],
  ['density', 'Instance-count multipliers libraries read through density(ctx, kind): grass tufts, shrubs/vegetation, crowd extras, particles (smoke, dust, sparks, spray; the FX library renormalises opacity so a cloud keeps its density).', 'proportional to the instances'],
  ['textureScale', 'Size multiplier for procedurally generated textures (libraries read it): finer detail in close-ups.', 'texture memory x4'],
  ['fxTier', "The FX library's tier (scenes/lib/fx/core/tier.js): 'ultra' = 2.5x particles, finer smoke/fire grids, more ray-march steps, finer cloth and fracture, 48-step SSR in wet decals, 2048 decals.", 'FX passes ~x2-3'],
];

/** The tier a render asked for: cfg.quality.tier, else the preset's (final-ultra ...), else 'final'. */
export function tierNameFor(cfg = {}) {
  const want = cfg.quality?.tier ?? TIER_PRESETS[cfg.preset] ?? 'final';
  const name = String(want).toLowerCase();
  if (!TIERS[name]) throw new Error(`quality tier "${want}" unknown (use ${TIER_NAMES.join(', ')})`);
  return name;
}

/** The preset name scenes see: a tier preset (final-ultra ...) looks like 'final'. */
export function scenePresetOf(preset) { return TIER_PRESETS[preset] ? 'final' : preset; }

/** A copy of a tier's knobs. */
export function tierKnobs(name) {
  const t = TIERS[name];
  if (!t) throw new Error(`quality tier "${name}" unknown (use ${TIER_NAMES.join(', ')})`);
  return JSON.parse(JSON.stringify(t));
}

/**
 * ctx.quality for a tier: the preset's quality plus what scenes/libraries read. The 'final'
 * tier adds only { tier: 'final' } - existing scenes see exactly what they saw before.
 */
export function qualityFor(base, name) {
  const t = TIERS[name];
  // final: untouched (no tier key either - the FX library treats a set tier as explicit and would
  // stop choosing its CPU-friendly tier at draft / preview)
  if (name === 'final') return { ...base };
  const q = { ...base, tier: name };
  q.fxTier = q.fxTier ?? t.fxTier;
  q.density = { ...t.density, ...(base.density || {}) };
  q.textureScale = base.textureScale ?? t.textureScale;
  q.anisotropy = base.anisotropy ?? t.anisotropy;
  q.ocean = { ...t.ocean, ...(base.ocean || {}) };
  q.ssr = { ...t.ssr, ...(base.ssr || {}) };
  return q;
}

/** The tier this render runs at ('final' when none was asked for). */
export function tierOf(ctx) { return ctx?.quality?.tier && TIERS[ctx.quality.tier] ? ctx.quality.tier : 'final'; }

/** Instance-count multiplier for a kind of thing ('grass' | 'vegetation' | 'crowd' | 'particles'); 1 at final. */
export function density(ctx, kind) {
  const k = Number(ctx?.quality?.density?.[kind]);
  return Number.isFinite(k) && k > 0 ? k : 1;
}
/** n scaled by the tier's density for `kind`, rounded (at least min). */
export function scaleCount(ctx, kind, n, min = 1) { return Math.max(min, Math.round(n * density(ctx, kind))); }

const maxOf = (a, b) => (a == null ? b : Math.max(a, b));

/**
 * Apply a tier to a resolved cinematic config (runtime/cinematic/config.js) - after the scene's
 * setup() (which may have changed ctx.cinematic) and before the stack is built. Sample counts
 * only go UP (a scene that asked for more keeps it). Returns a list of what changed (for the
 * job log / gpu-check). opts.warmup: the scene is a chunk-warmup simulation (no sub-frames).
 * The volumetric froxel grid is clamped so its atlas fits opts.maxTextureSize.
 */
export function applyTierToCinematic(c, name, opts = {}) {
  const t = TIERS[name];
  const changed = [];
  if (!c || name === 'final') return changed;
  const note = (k, from, to) => { if (JSON.stringify(from) !== JSON.stringify(to)) changed.push(`${k}: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`); };
  const mb = c.motionBlur;
  // sub-frames
  if (t.subframes > 0 && mb.mode !== 'off') {
    if (opts.warmup) changed.push('subframes: chunk-warmup scene - kept velocity motion blur');
    else {
      const from = mb.mode === 'accumulate' ? mb.accumulateSamples : mb.mode;
      const n = mb.mode === 'accumulate' ? Math.max(mb.accumulateSamples, t.subframes) : t.subframes;
      mb.mode = 'accumulate'; mb.accumulateSamples = Math.min(64, n); mb.jitterAA = true; mb.softShadows = mb.softShadows !== false;
      note('motionBlur', from, `accumulate x${mb.accumulateSamples}`);
    }
  }
  { const v = maxOf(mb.samples, t.motionBlurSamples); note('motionBlur.samples', mb.samples, v); mb.samples = Math.min(64, v); }
  // shadows
  if (c.shadows.cascades > 0) {
    const v = maxOf(c.shadows.mapSize, t.cascadeMapSize);
    note('shadows.mapSize', c.shadows.mapSize ?? 'default', v); c.shadows.mapSize = v;
  }
  // GTAO + contact shadows
  if (c.ao.enabled) {
    const a = c.ao, from = { resolution: a.resolution ?? 0.5, slices: a.slices, steps: a.steps, contactSteps: a.contactSteps };
    // (a scene asking for full resolution keeps it; the tier never lowers anything)
    a.resolution = Math.max(a.resolution ?? 0.5, t.ao.resolution);
    a.slices = Math.max(a.slices, t.ao.slices); a.steps = Math.max(a.steps, t.ao.steps);
    a.contactSteps = Math.min(24, Math.max(a.contactSteps, t.ao.contactSteps));
    note('ao', from, { resolution: a.resolution, slices: a.slices, steps: a.steps, contactSteps: a.contactSteps });
  }
  // depth of field
  if (c.dof.enabled) { const v = Math.min(256, maxOf(c.dof.samples, t.dofSamples)); note('dof.samples', c.dof.samples, v); c.dof.samples = v; }
  // volumetric fog
  if (c.volumetrics.enabled) {
    const v = c.volumetrics, from = [...v.resolution];
    const s = t.volumetrics.scale;
    let r = [Math.round(v.resolution[0] * s[0]), Math.round(v.resolution[1] * s[1]), Math.round(v.resolution[2] * s[2])];
    // the froxels live in a tiled 2D atlas: keep it inside the GPU's texture size and <= 6M froxels
    const maxTex = opts.maxTextureSize || 8192;
    while ((r[0] * r[1] * r[2] > 6e6 || !froxelAtlas(r, maxTex)) && r[2] > v.resolution[2]) r = [r[0], r[1], r[2] - 8];
    while ((r[0] * r[1] * r[2] > 6e6 || !froxelAtlas(r, maxTex)) && r[0] > v.resolution[0]) r = [Math.round(r[0] * 0.9), Math.round(r[1] * 0.9), r[2]];
    v.resolution = r;
    // (noiseFilter stays the scene's choice: filtering the density noise to the froxel footprint
    // averages distant mist-bank wisps into flat haze - a different look, measured on the lookdev coast)
    v.softTaps = Math.max(v.softTaps ?? 16, t.volumetrics.softTaps);
    note('volumetrics', { resolution: from }, { resolution: r, ...(v.shadowSoftness > 0 ? { softTaps: v.softTaps } : {}) });
  }
  if (t.ibl === 'exact' && c.ibl !== 'exact') { note('ibl', c.ibl, 'exact'); c.ibl = 'exact'; }
  // generic screen-space reflections on wet / glossy surfaces
  if (t.ssr.enabled) {
    const s = c.ssr || {}, from = { ...s };
    c.ssr = { ...s, enabled: true, steps: Math.max(s.steps || 0, t.ssr.steps), maxRoughness: Math.max(s.maxRoughness || 0, t.ssr.maxRoughness), thickness: s.thickness || t.ssr.thickness };
    note('ssr', from, c.ssr);
  }
  return changed;
}

/**
 * Layout of the volumetric froxel atlas: slices stacked in `cols` columns of `rows` slices each,
 * so the texture is (X * cols) x (Y * rows). null if it cannot fit maxTex.
 */
export function froxelAtlas([X, Y, Z], maxTex = 8192) {
  for (let cols = 1; cols <= Z; cols++) {
    const rows = Math.ceil(Z / cols);
    if (X * cols <= maxTex && Y * rows <= maxTex) return { cols, rows, width: X * cols, height: Y * rows };
  }
  return null;
}

// ------------------------------------------------------------------------------- cost model ---
// A GPU cost estimate from what each pass does (pixels x taps, triangles x passes, shadow texels),
// for planning before anything is measured on the render PC: gpu-check then measures the real
// thing. Units are "tap-equivalents" (one filtered texture fetch + its share of arithmetic);
// tierCost() returns per-stage work for a frame description and the ratio to the final tier.
//
// frame = { width, height, sceneTriangles, shadowTriangles, cascades, cascadeMapSize?, shadowMapSize,
//           dofOn, fogOn, aoOn, oceanOn, oceanCoverage (0..1), ssrCoverage (0..1 of the picture
//           on reflective objects), mode ('velocity'|'accumulate'), sceneSubframes (the scene's own),
//           updateMs (CPU time of one update()), sceneShadeTaps (taps per scene pixel, ~24),
//           fogFroxels: [X, Y, Z], cpuUpdateShare }
const TRI_COST = 1 / 6;          // tap-equivalents per triangle per pass (vertex + raster setup)
export function frameWork(frame, name) {
  const t = TIERS[name];
  const px = frame.width * frame.height;
  const sceneN = t.subframes > 0 ? Math.max(t.subframes, frame.sceneSubframes || 1) : (frame.sceneSubframes || 1);
  const mbVelocity = sceneN <= 1;
  const shade = frame.sceneShadeTaps ?? 24;
  const casc = frame.cascades || 0;
  const cmap = casc > 0 ? (name === 'final' ? (frame.cascadeMapSize || 2048) : Math.max(frame.cascadeMapSize || 2048, t.cascadeMapSize)) : 0;
  const smap = frame.shadowMapSize || 4096;
  // shadow maps: texels cleared/filled + triangles per light pass
  const shadowTexels = casc > 0 ? casc * cmap * cmap : smap * smap;
  const shadowPass = shadowTexels * 0.25 + (frame.shadowTriangles ?? frame.sceneTriangles ?? 1e6) * Math.max(1, casc) * TRI_COST;
  // lit scene pass: shading + per-pixel shadow filter (9 taps) + cascade blend + IBL (exact: +2 taps)
  const ibl = t.ibl === 'exact' ? 2 : 1;
  const aniso = t.anisotropy > 1 ? 1.15 : 1;                 // grazing surfaces only
  const scenePass = px * (shade * aniso + 9 * (casc > 1 ? 1.2 : 1) + ibl) + (frame.sceneTriangles ?? 1e6) * TRI_COST;
  const ao = frame.aoOn ? (() => {
    const r = t.ao.resolution, aoPx = px * r * r;
    const prepass = px * 2 + (frame.sceneTriangles ?? 1e6) * TRI_COST;
    return prepass + aoPx * (t.ao.slices * 2 * t.ao.steps + t.ao.contactSteps * 0.5 + 16 + 4) * 0.6;
  })() : 0;
  const fog = frame.fogOn ? (() => {
    const g = frame.fogFroxels || [160, 90, 64], s = t.volumetrics.scale;
    const n = g[0] * s[0] * g[1] * s[1] * g[2] * s[2];
    return n * (20 + (frame.fogSoft ? t.volumetrics.softTaps : 1)) + n * Math.log2(g[2] * s[2]) * 2 + px * 4;
  })() : 0;
  const ocean = frame.oceanOn ? px * (frame.oceanCoverage ?? 0.4) * (40 + (t.ocean.ssr ? t.ocean.ssrSteps * 1.3 : 0))
    + (t.ocean.gpuFFT ? 3 * t.ocean.resolution ** 2 * (2 + 2 * Math.log2(t.ocean.resolution)) * 4 : 0) : 0;
  const ssr = t.ssr.enabled ? px * (frame.ssrCoverage ?? 0.08) * (shade + t.ssr.steps * 1.5 + 8) : 0;
  const perSub = shadowPass + scenePass + ocean * (sceneN > 1 ? 1 : 1) + ssr;
  const mb = mbVelocity ? px * (8 + t.motionBlurSamples * 0.35 * 2) : px * 2;   // velocity: ~35% of pixels move
  const dof = frame.dofOn ? px / 4 * (Math.min(t.dofSamples, 256) * 0.5 + 8) + px * 6 : 0;
  const post = px * 30;                                                          // resolve, bloom, final, pack
  const gpu = perSub * sceneN + ao + fog + mb + dof + post;
  const cpuMs = (frame.updateMs ?? 0) * (sceneN + (mbVelocity ? 1 : 0));        // velocity: shutter-open pose + now
  return { tier: name, subframes: sceneN, stages: { shadows: shadowPass * sceneN, scene: scenePass * sceneN, ocean: ocean * sceneN, ssr: ssr * sceneN, ao, fog, motionBlur: mb, dof, post }, gpu, cpuMs };
}

/**
 * Work of every tier for a frame description, relative to final. With throughput (tap-equivalents
 * per ms of the GPU, calibrated by a measured final frame: finalMs) it also gives milliseconds.
 */
export function tierCost(frame, { finalMs = null, cpuParallel = false } = {}) {
  const base = frameWork(frame, 'final');
  const out = {};
  for (const n of TIER_NAMES) {
    const w = frameWork(frame, n);
    const ratio = w.gpu / base.gpu;
    let ms = null;
    if (finalMs != null) {
      // the measured final frame = GPU work + CPU update time (not overlapped in one browser)
      const gpuMs0 = Math.max(1, finalMs - base.cpuMs);
      const gpuMs = gpuMs0 * ratio;
      ms = cpuParallel ? Math.max(gpuMs, w.cpuMs) : gpuMs + w.cpuMs;
    }
    out[n] = { ratio, subframes: w.subframes, stages: w.stages, cpuMs: w.cpuMs, ms };
  }
  return out;
}
