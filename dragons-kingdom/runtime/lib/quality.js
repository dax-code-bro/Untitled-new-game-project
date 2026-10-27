// Quality tiers (import from 'dk/quality.js' in scenes; the runtime and the Node tools use it too).
//
// The render presets decide the SIZE of a picture (draft 960x540 ... final 3840x2160). A quality
// TIER decides how much work goes into every pixel of it. The masters are rendered with the
// `final` preset on Daxtyn's PC (an NVIDIA RTX 4090), which can afford far more work per pixel
// than the CPU cloud machine the shots are made and reviewed on. The higher tiers turn every
// knob up where a GPU can afford it - and only there. They keep the camera, lens, light, grade and
// grain, and most knobs only sample the same picture more finely, but not all of them leave the look
// untouched: screen-space reflections show the scene in wet and glossy surfaces, density adds grass
// tufts and shrubs between the reviewed ones, the sub-frame tiers replace the velocity motion blur
// with real sub-frames (curved streaks, real sun penumbrae), finer froxels sharpen light shafts. Each
// is checked against final per knob (runtime/tools/tier-check.mjs --knobs all --crops ...: 192x108
// structure + 1:1 crops). A tier is opt-in:
//
//   node render/render.mjs <scene> --preset final-ultra        (native 4K, ultra tier)
//   openSession({ ..., quality: { tier: 'ultra' } })            (any size: tests, previews)
//
// Tiers, cheapest first (the gpu-check picks the highest that keeps Episode 1 under ~3 days):
//
//   final   the master settings as reviewed on the cloud CPU (the default; nothing changes)
//   high    every GPU knob up, motion blur stays velocity-based (one scene pass per frame)
//   ultra8  high + 8 real sub-frames per frame (as the style frames' film finish)
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
//   ctx.quality.density          { grass, vegetation, crowd }: instance-count multipliers (absent at
//                                final = 1) - density(ctx, 'grass') below. APPEND-ONLY contract: a
//                                library that reads them adds its extra instances AFTER the ones
//                                density 1 gives (own random stream, same order), so the reviewed
//                                instances never move and a tier only fills in between. Read by:
//                                grass - scenes/lib/sets/grass.js grassField({ density }) and
//                                scenes/lib/nature/plants.js scatterPlants (its grass and thrift
//                                tufts); vegetation - scatterPlants' shrubs; crowd - no crowd
//                                library reads it yet (a crowd that does must append extras behind
//                                the authored ones). Particles are the FX library's own tier (fxTier).
//   ctx.quality.ocean            defaults dk/ocean.js uses (resolution, ssr, ssrSteps, gpuFFT; a scene's own options win)
//   ctx.quality.anisotropy       anisotropic filtering applied to every mip-mapped texture after setup (0 = leave)

export const TIER_NAMES = ['final', 'high', 'ultra8', 'ultra', 'max'];

// Render presets that are the native-4K final preset at a higher tier. The scene sees
// ctx.preset === 'final' (so hero creature builds etc. are chosen exactly as for final).
export const TIER_PRESETS = { 'final-high': 'high', 'final-ultra8': 'ultra8', 'final-ultra': 'ultra', 'final-max': 'max' };

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
  density: { grass: 1, vegetation: 1, crowd: 1 },
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
  // x2 across the screen, the scene's own depth slices: finer depth slices move how much of a mist bank
  // lies in front of a surface (lookdev coast mist crop 39.7 dB at x1 x1 x1.5 vs 43.6 dB at x2 x2 x1)
  volumetrics: { scale: [2, 2, 1], softTaps: 32 },
  // ibl stays 'fast' (as final): three's exact PMREM lookups dimmed the sun glitter on F1's sea (style frame
  // F1, ibl knob alone: glitter crop 30 dB, the warm path on the water half gone) - a scene's own choice
  anisotropy: 16,
  // no screen-space reflections IN the sea at any tier (as at final): the fixed-step march hatches beside a
  // reflected object (a steel ball over the FFT sea, review 2026-10-27) and the Hi-Z variant
  // (cinematic.ssr.sea, experimental) returned sea-bed colours there - runtime/PROGRESS.md.
  // The same 256 x 256 sea as final, its FFTs on the GPU (every sub-frame, no CPU FFT per update()).
  // NOT 512: its finer ripples (11-21 cm) carry as much slope again as the 256 sea's waves, and that
  // changes the sheen of the whole sea (lookdev coast, ocean knob alone: structure SSIM 0.825, sea
  // crop 18 dB - with or without the new ripples drawn: the unresolved-slope roughness moves too).
  // A scene that wants them asks for createOcean({ resolution: 512 }) itself.
  ocean: { resolution: 256, ssr: false, ssrSteps: 48, gpuFFT: true },
  ssr: { enabled: true, steps: 96, maxRoughness: 0.4, thickness: 0.35 },
  density: { grass: 1.5, vegetation: 1.3, crowd: 1.25 },
  fxTier: 'ultra',
};

export const TIERS = {
  final: FINAL,
  high: HIGH,
  ultra8: { ...HIGH, name: 'ultra8', label: 'ultra8 - high + 8 real sub-frames per frame (the style frames\' film finish)', subframes: 8 },
  ultra: { ...HIGH, name: 'ultra', label: 'ultra - high + 16 real sub-frames per frame', subframes: 16 },
  max: {
    ...HIGH, name: 'max', label: 'max - high + 32 sub-frames, densest settings', subframes: 32, motionBlurSamples: 64,
    ao: { resolution: 1, slices: 6, steps: 12, contactSteps: 24 }, dofSamples: 192,
    ssr: { enabled: true, steps: 128, maxRoughness: 0.45, thickness: 0.35 },
    density: { grass: 2, vegetation: 1.6, crowd: 1.5 },
  },
};

/**
 * What each knob does - one place for the README, the tools and the gpu-check report.
 * cost: what it multiplies on a GPU (the cost model in tierCost() below uses the same numbers).
 */
export const KNOB_DOCS = [
  ['subframes', 'Real sub-frames per frame (accumulate mode): update() and the whole scene + shadow pass run N times across the 180-degree shutter, each with a Halton sub-pixel jitter and the sun jittered inside its 0.53-degree disk, averaged in 32-bit float. Each sub-frame also gets velocity motion blur over its own 1/N slice of the shutter (motion vectors from the previous sub-frame\'s pose), so fast motion is one continuous streak along its real arc instead of N separate copies; its haze and volumetric fog are resolved with its own depth, and GTAO + contact shadows are computed from its own pose. True curved motion blur (wing tips blur along their arc), N-x supersampling (no stair-stepped rigging, no sparkling scale highlights) and real sun penumbrae. Replaces the frame-level velocity motion blur + FXAA. Scenes that already render sub-frames keep the larger count. Chunk-warmup (simulation) scenes cannot (velocity motion blur with more taps instead). Depth of field still uses the centre sub-frame\'s depth.', 'scene + depth pre-pass + GTAO + resolve + blur x N, update() x (N + 2) on the CPU'],
  ['motionBlurSamples', 'Velocity motion blur taps per pixel at the longest blur (high tier, and simulation scenes at ultra/max): smoother streaks, less noise in long blurs. The velocity tiles also read every pixel instead of every second one (motionBlur.tileStride 1), so a moving object thinner than 2 px - a spear, rigging, a far wing finger - still gets its blur (at final it can slip between the samples and stay sharp).', 'motion-blur pass ~x2.4, tile pass x4 (small)'],
  ['cascadeMapSize', 'Sun shadow cascades (scenes with shadows.cascades) at 4096x4096 each instead of 2048: half the texel size, so thin casters (rigging, spears, grass, fingers) keep their shadows and edges stop stepping.', 'shadow pass ~x4 texels per cascade'],
  ['ao', 'GTAO + contact shadows at full resolution instead of half, with more slices / steps / contact-ray steps: no blocky occlusion in creases (scales, cloth folds, masonry joints) at 4K and contact shadows that reach thin objects.', 'GTAO pass ~x4 pixels x ~2.2 taps'],
  ['dofSamples', 'Depth-of-field gather taps at the largest blur: smoother bokeh discs and out-of-focus foregrounds without grain.', 'DOF gather ~x2.7 (only where something is out of focus)'],
  ['volumetrics', 'Froxel fog grid x2 across the screen (12-pixel froxels at 4K instead of 24; the same depth slices; stored as a tiled atlas when it is taller than the GPU texture limit), 32-tap soft shadow lookups where the scene asked for soft shafts: sharper light shafts through trees, colonnades and wings. The mist keeps its shape: its density (noise, banks, height fog) is still sampled at the scene\'s own froxel centres and interpolated, only the light is evaluated per finer froxel (sampling the noise on the finer grid reshaped every mist bank; finer depth slices moved how much of a bank lies in front of the cliffs). (The mip-filtered noise switch stays the scene\'s choice: it turns distant mist wisps into flat haze.)', 'fog inject x4 froxels x 8 density taps'],
  ['anisotropy', 'Anisotropic texture filtering x16 on every mip-mapped texture: ground, roads, roofs and water stay sharp at grazing angles instead of blurring.', 'texture taps on grazing surfaces'],
  ['ocean', 'FFT ocean computed on the GPU, every sub-frame (the same 256x256 sea as final, so the sub-frame tiers do not run N + 2 CPU FFTs per frame); heightAt() (buoyancy) reads back only the 4 texels around each asked point. Not 512: its finer ripples change the sheen of the whole sea (a scene can ask for createOcean({ resolution: 512 }) itself). No screen-space reflections in the water (as at final: not clean yet).', 'FFT passes (3 x 16 small passes per sub-frame)'],
  ['ssr', 'Screen-space reflections on wet and glossy surfaces (puddles, wet cobbles and stone, polished metal, glazed windows, wet scales): the real scene is reflected instead of only the sky map, traced exactly through a min-depth pyramid (Hi-Z, 96 iterations: no stepping noise), blurred by roughness from a mip-mapped colour copy; fades at the screen edges and where the ray passes behind an object.', 'reflective objects drawn twice + Hi-Z build + trace'],
  ['density', 'More grass tufts (x1.5; scenes/lib/sets/grass.js grassField and the nature library\'s scatterPlants) and shrubs (x1.3; scatterPlants), APPENDED after the ones final places: every reviewed tuft and shrub stays exactly where it was, the tier only fills in between (a denser lawn / heath - it changes what is in the picture, a little). Sets that call grassField without passing density (the director\'s verdor-grounds) are not affected yet. crowd: a contract only - no crowd library reads it yet.', 'proportional to the instances'],
  ['fxTier', "The FX library's tier (scenes/lib/fx/core/tier.js): 'ultra' = 2.5x particles, finer smoke/fire grids, more ray-march steps, finer cloth and fracture, 48-step SSR in wet decals, 2048 decals.", 'FX passes ~x2-3'],
];

/**
 * A short fingerprint of the tier definitions (TIERS): gpu-check stores it with its measurements and
 * render/episode.mjs only follows a recommendation measured with the tiers as they are now.
 */
export function tierDefsHash() {
  const str = JSON.stringify(TIERS);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** The preset name of a tier ('final' | 'final-high' | ...). */
export const presetOfTier = (t) => (t === 'final' ? 'final' : Object.keys(TIER_PRESETS).find((k) => TIER_PRESETS[k] === t));

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
  // base.only = ['volumetrics', ...]: only these knobs (KNOB_DOCS names) take the tier's value, the
  // others keep final's - one knob at a time for A/B checks (runtime/tools/tier-check.mjs --knobs)
  const k = (knob) => (knobOn(base, knob) ? t : FINAL);
  q.fxTier = q.fxTier ?? k('fxTier').fxTier ?? undefined;
  if (q.fxTier === undefined) delete q.fxTier;
  q.density = { ...k('density').density, ...(base.density || {}) };
  q.anisotropy = base.anisotropy ?? k('anisotropy').anisotropy;
  q.ocean = { ...k('ocean').ocean, ...(base.ocean || {}) };
  q.ssr = { ...k('ssr').ssr, ...(base.ssr || {}) };
  return q;
}

/** Is a knob applied (quality.only lists the knobs of a one-knob A/B; without it every knob is)? */
export function knobOn(quality, knob) {
  const only = quality?.only;
  return !Array.isArray(only) || only.includes(knob);
}

/** The tier this render runs at ('final' when none was asked for). */
export function tierOf(ctx) { return ctx?.quality?.tier && TIERS[ctx.quality.tier] ? ctx.quality.tier : 'final'; }

/** Instance-count multiplier for a kind of thing ('grass' | 'vegetation' | 'crowd'); 1 at final. Append-only (see the header). */
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
  // opts.quality (ctx.quality) may override parts of the tier: { ssr: { enabled: false }, subframes: 8,
  // subframeBlur: false, subframeAO: false, ... } (tests and A/B comparisons)
  const q = opts.quality || {};
  const T0 = TIERS[name];
  const changed = [];
  if (!c || name === 'final' || !T0) return changed;
  // a knob outside quality.only keeps final's value (one-knob A/B)
  const pick = (knob, field = knob) => (knobOn(q, knob) ? T0[field] : FINAL[field]);
  const t = {
    ...T0,
    subframes: q.subframes ?? pick('subframes'), motionBlurSamples: pick('motionBlurSamples'), cascadeMapSize: pick('cascadeMapSize'),
    ao: pick('ao'), dofSamples: pick('dofSamples'), ibl: pick('ibl'),
    volumetrics: { ...pick('volumetrics'), ...(q.volumetrics || {}) },
    ssr: { ...pick('ssr'), ...(q.ssr || {}) },
  };
  const note = (k, from, to) => { if (JSON.stringify(from) !== JSON.stringify(to)) changed.push(`${k}: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`); };
  const mb = c.motionBlur;
  // sub-frames
  if (t.subframes > 0 && mb.mode !== 'off') {
    if (opts.warmup) changed.push('subframes: chunk-warmup scene - kept velocity motion blur');
    else {
      const from = mb.mode === 'accumulate' ? mb.accumulateSamples : mb.mode;
      const n = mb.mode === 'accumulate' ? Math.max(mb.accumulateSamples, t.subframes) : t.subframes;
      mb.mode = 'accumulate'; mb.accumulateSamples = Math.min(64, n); mb.jitterAA = true; mb.softShadows = mb.softShadows !== false;
      // hybrid: velocity blur inside every sub-frame (its 1/N slice of the shutter) so fast motion is one continuous
      // streak, not N copies; haze / fog resolved and GTAO + contact shadows computed per sub-frame (its own pose)
      mb.subframeBlur = q.subframeBlur ?? true; mb.subframeAO = q.subframeAO ?? true;
      note('motionBlur', from, `accumulate x${mb.accumulateSamples}${mb.subframeBlur ? ' + per-sub-frame blur + fog' : ''}${mb.subframeAO ? ' + per-sub-frame AO' : ''}`);
    }
  }
  if (knobOn(q, 'motionBlurSamples')) { const v = maxOf(mb.samples, t.motionBlurSamples); note('motionBlur.samples', mb.samples, v); mb.samples = Math.min(64, v); }
  if (knobOn(q, 'motionBlurSamples') && mb.mode !== 'off' && (mb.tileStride ?? 2) > 1) { note('motionBlur.tileStride', mb.tileStride ?? 2, 1); mb.tileStride = 1; }
  // shadows
  if (c.shadows.cascades > 0 && knobOn(q, 'cascadeMapSize')) {
    const v = maxOf(c.shadows.mapSize, t.cascadeMapSize);
    note('shadows.mapSize', c.shadows.mapSize ?? 'default', v); c.shadows.mapSize = v;
  }
  // GTAO + contact shadows
  if (c.ao.enabled && knobOn(q, 'ao')) {
    const a = c.ao, from = { resolution: a.resolution ?? 0.5, slices: a.slices, steps: a.steps, contactSteps: a.contactSteps };
    // (a scene asking for full resolution keeps it; the tier never lowers anything)
    a.resolution = Math.max(a.resolution ?? 0.5, t.ao.resolution);
    a.slices = Math.max(a.slices, t.ao.slices); a.steps = Math.max(a.steps, t.ao.steps);
    a.contactSteps = Math.min(24, Math.max(a.contactSteps, t.ao.contactSteps));
    note('ao', from, { resolution: a.resolution, slices: a.slices, steps: a.steps, contactSteps: a.contactSteps });
  }
  // depth of field
  if (c.dof.enabled && knobOn(q, 'dofSamples')) { const v = Math.min(256, maxOf(c.dof.samples, t.dofSamples)); note('dof.samples', c.dof.samples, v); c.dof.samples = v; }
  // volumetric fog
  if (c.volumetrics.enabled && knobOn(q, 'volumetrics')) {
    const v = c.volumetrics, from = [...v.resolution];
    const s = t.volumetrics.scale;
    let r = [Math.round(v.resolution[0] * s[0]), Math.round(v.resolution[1] * s[1]), Math.round(v.resolution[2] * s[2])];
    // the froxels live in a tiled 2D atlas: keep it inside the GPU's texture size and <= 6M froxels
    const maxTex = opts.maxTextureSize || 8192;
    while ((r[0] * r[1] * r[2] > 6e6 || !froxelAtlas(r, maxTex)) && r[2] > v.resolution[2]) r = [r[0], r[1], r[2] - 8];
    while ((r[0] * r[1] * r[2] > 6e6 || !froxelAtlas(r, maxTex)) && r[0] > v.resolution[0]) r = [Math.round(r[0] * 0.9), Math.round(r[1] * 0.9), r[2]];
    v.resolution = r;
    // the mist keeps its shape: the density (noise, banks, height fog) is still sampled at the
    // scene's own froxel centres and interpolated (volumetrics.js DK_VOL_DENS_GRID); only the light
    // (sun shadow map, cloud shadows, soft taps) is evaluated on the finer grid. Sampling the noise
    // at the finer froxels themselves reshaped every mist bank (lookdev coast, mist crop 35 dB at
    // x2 x2 x1.5 and at x1 x1 x1.5 alike), and filtering it to the froxel footprint (noiseFilter,
    // the scene's choice) averages the wisps into flat haze.
    if (r[0] !== from[0] || r[1] !== from[1] || r[2] !== from[2]) v.densityGrid = from;
    v.softTaps = Math.max(v.softTaps ?? 16, t.volumetrics.softTaps);
    note('volumetrics', { resolution: from }, { resolution: r, ...(v.shadowSoftness > 0 ? { softTaps: v.softTaps } : {}) });
  }
  if (t.ibl === 'exact' && c.ibl !== 'exact') { note('ibl', c.ibl, 'exact'); c.ibl = 'exact'; }
  // generic screen-space reflections on wet / glossy surfaces
  if (t.ssr.enabled && name !== 'final') {
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
    // a refined grid samples the density at the 8 surrounding froxels of the scene's own grid (~6 units each)
    const densTaps = s[0] !== 1 || s[1] !== 1 || s[2] !== 1 ? 8 : 1;
    return n * (20 + 6 * (densTaps - 1) + (frame.fogSoft ? t.volumetrics.softTaps : 1)) + n * Math.log2(g[2] * s[2]) * 2 + px * 4;
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

// Assumptions for an RTX 4090 behind Chrome's WebGL2 (ANGLE / Direct3D 11) - PLANNING FIGURES, not
// measurements: render/gpu-check.mjs measures the real card. 82.6 TFLOPS fp32 and ~1,290 GTexel/s
// at ~25% efficiency through WebGL give ~3e8 tap-equivalents per ms; three.js + Chrome + ANGLE spend
// ~15 us of CPU per draw call; a desktop CPU next to a 4090 runs JavaScript ~2x faster than one
// vCPU of the cloud machine (update() times measured here are scaled by 0.5).
export const RTX4090_ASSUMPTIONS = { tapsPerMs: 3e8, callUs: 15, cpuScale: 0.5, readbackMs: 6 };

/**
 * Estimated milliseconds of one frame at a tier: frame = frameFromStats() of THAT tier's measured
 * counters (draw calls, update() time) scaled to the target size. The GPU and the CPU (draw-call
 * submission + update()) overlap, so a frame takes about the longer of the two plus the readback.
 */
export function estimateFrameMs(frame, name, a = RTX4090_ASSUMPTIONS) {
  const w = frameWork(frame, name);
  const gpuMs = w.gpu / a.tapsPerMs;
  const submitMs = (frame.drawCalls || 0) * a.callUs / 1000;
  const updateMs = w.cpuMs * a.cpuScale;
  return { gpuMs, submitMs, updateMs, ms: Math.max(gpuMs, submitMs + updateMs) + a.readbackMs, subframes: w.subframes };
}

/**
 * Seconds per frame of the tiers that were not measured, from the ones that were: the sub-frame
 * tiers differ only in the number of scene passes, so s(N) = s(high) + (N - 1) * perSub with perSub
 * from a measured sub-frame tier. Returns a copy with { tier: s } filled in and { extrapolated: [...] }.
 */
export function fillTierTimes(tierS) {
  const out = { ...tierS }, extrapolated = [];
  const subTiers = TIER_NAMES.filter((n) => TIERS[n].subframes > 0);
  const known = subTiers.find((n) => out[n] > 0);
  if (out.high > 0 && known) {
    const perSub = Math.max(0, (out[known] - out.high) / (TIERS[known].subframes - 1));
    for (const n of subTiers) if (!(out[n] > 0)) { out[n] = +(out.high + (TIERS[n].subframes - 1) * perSub).toFixed(3); extrapolated.push(n); }
  }
  return { times: out, extrapolated };
}

/**
 * Plan the episode at every tier and recommend one. segments: parts of the episode that scale with
 * one measured test frame each - [{ name, cpuH (render hours of that part on the cloud CPU, from
 * render-schedule.md), refS (the cloud CPU's s/frame for the test frame), tierS: { final: s, high: s,
 * ultra: s, max: s } measured on THIS GPU for the same test frame (missing tiers are skipped) }].
 * setupH: scene setup on the CPU (once per shot, the same at every tier), encodeH: scene files +
 * the final episode, budgetH: the limit (~3 days), parallel: speed-up of the browsers running at once.
 * Returns { tiers: { name: { renderH, totalH, days, fits } }, recommended, reason }.
 */
export function planEpisode(segments, { setupH = 0, encodeH = 4, budgetH = 72, parallel = 1 } = {}) {
  const tiers = {};
  for (const name of TIER_NAMES) {
    if (!segments.every((s) => s.tierS?.[name] > 0 && s.refS > 0)) continue;
    const renderH = segments.reduce((acc, s) => acc + s.cpuH * (s.tierS[name] / s.refS), 0) / Math.max(1, parallel);
    const totalH = renderH + setupH + encodeH;
    tiers[name] = { renderH: +renderH.toFixed(1), totalH: +totalH.toFixed(1), days: +(totalH / 24).toFixed(2), fits: totalH <= budgetH };
  }
  const fitting = TIER_NAMES.filter((n) => tiers[n]?.fits);
  const recommended = fitting.length ? fitting[fitting.length - 1] : (tiers.final ? 'final' : null);
  const reason = !recommended ? 'no tier was measured'
    : fitting.length ? `the highest tier that keeps Episode 1 within ${budgetH} h (${(budgetH / 24).toFixed(1)} days): ${tiers[recommended].totalH} h`
      : `no tier fits ${budgetH} h - even final needs ${tiers.final.totalH} h; render at final (more machines or more time)`;
  return { tiers, recommended, preset: recommended ? (recommended === 'final' ? 'final' : Object.keys(TIER_PRESETS).find((k) => TIER_PRESETS[k] === recommended)) : null, reason, budgetH };
}
