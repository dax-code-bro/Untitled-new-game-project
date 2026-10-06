// Cinematic realism stack - configuration.
//
// A scene opts in with  meta.cinematic = true | '<preset>' | { ...overrides }
// (and may change ctx.cinematic in setup(); numeric values may also change per
// frame in update(), e.g. ctx.cinematic.grade.exposure). Scenes without
// meta.cinematic render exactly as before (bit-identical).

export const CINEMATIC_DEFAULTS = {
  aa: 'fxaa',                       // 'fxaa' (fused into the motion-blur pass) | 'none'
  debug: null,                      // show an internal buffer: 'ao' | 'contact' | 'velocity' | 'coc' | 'depth' | 'dof' | 'bloom' | 'scene' | 'fog'
  ibl: 'fast',                      // 'fast': environment light from baked spherical harmonics + a mip-mapped equirect
                                    // (one tap instead of two PMREM lookups per pixel) | 'exact': three.js' PMREM lookups
  motionBlur: {
    mode: 'velocity',               // 'velocity' | 'accumulate' | 'off'
    maxBlur: 0.04,                  // longest blur, fraction of the image width (0.04 = 154 px at 4K)
    samples: 20,                    // velocity mode: max taps per pixel (fewer where motion is short)
    accumulateSamples: 8,           // accumulate mode: sub-frames per frame
    jitterAA: true,                 // accumulate: sub-pixel jitter per sub-frame (true supersampling)
    softShadows: true,              // accumulate: jitter the sun inside its 0.53 deg disk (true penumbrae)
  },
  dof: {
    enabled: true,                  // needs ctx.lens.focus or focusTarget; otherwise everything is sharp
    maxCoC: 0.02,                   // largest blur DIAMETER, fraction of image width (0.02 = 77 px at 4K)
    samples: 48,                    // gather taps at the largest blur (fewer where the blur is small)
    catsEye: 0.25,                  // optical vignetting: bokeh discs become cat's-eye shaped near the frame edge (0 = off)
  },
  ao: {
    enabled: true,                  // GTAO on the indirect (sky/ambient) light only - needs a depth pre-pass
    radius: 1.0,                    // metres
    intensity: 1.0,
    slices: 3, steps: 6,            // per half-res pixel: 3 directions x 2 sides x 6 steps
    maxRadiusPx: 0.035,             // fraction of width: limits the screen radius of close objects
    contactShadows: true,           // short screen-space shadow rays toward the sun (detail the shadow map misses)
    contactLength: 0.4,             // metres
    contactSteps: 10,
    contactMaxDistance: 80,         // metres from the camera (beyond, the shadow maps are fine)
    depthPrepassShare: false,       // let the main pass reuse the pre-pass depth (no overdraw) - only safe if no material displaces vertices in its shader
  },
  shadows: {
    cascades: 0,                    // 0: the scene's own sun shadow; N (1-4): cascaded maps fitted to the camera
    sun: null,                      // DirectionalLight (default: the first shadow-casting one)
    maxDistance: 400,               // metres covered by the cascades
    split: 0.75,                    // 0 = uniform, 1 = logarithmic splits
    mapSize: null,                  // per cascade (default: quality.shadowMapSize, at most 2048 with 2+ cascades)
    blend: 0.1,                     // fraction of each cascade blended into the next (no visible seams)
    pullback: 300,                  // metres behind each cascade that still cast into it (cliffs, a dragon above)
    bias: null, normalBias: 1.5,    // depth bias (default: the sun's own); normal bias in shadow texels
    pcss: false,                    // contact-hardening soft shadows: penumbra from the sun's real size
                                    // (meta.sunAngularDiameter, default 0.53 deg) - same as --shadow-filter pcss
  },
  atmosphere: {
    enabled: false,
    sky: 'physical',                // 'physical' (Rayleigh + Mie, sun disk, drawn as a dome) | 'scene' (keep the scene's background / HDRI)
    sunDirection: null,             // Vector3 toward the sun (default: from the sun light)
    sunIlluminance: null,           // light intensity of the sun outside the atmosphere (default: the sun light's intensity)
    sunLight: null,                 // DirectionalLight driven by the sky (default: the first shadow-casting one)
    driveSunLight: 'auto',          // colour/intensity of the sun light from the atmosphere ('auto': only with the physical sky)
    environment: true,              // physical sky -> scene.environment (PMREM) for reflections / IBL
    haze: 1.0,                      // aerosol (Mie) density multiplier (1 = clear day, 3-8 = hazy coast)
    rayleigh: 1.0,                  // air density multiplier
    mieG: 0.8,                      // forward scattering of aerosols
    altitude: 0,                    // ground height (m) of the world's y = 0
    aerialPerspective: true,        // haze on everything, matched to the sky
    apDistanceScale: 1.0,           // >1 makes the aerial perspective stronger (artistic)
  },
  volumetrics: {
    enabled: false,                 // froxel fog lit by the sun (shadow-mapped god rays) and the sky
    range: 600,                     // metres covered by the volume (beyond: aerial perspective only)
    near: 0.5,
    resolution: [160, 90, 64],      // froxels (x, y, depth slices; depth exponential)
    density: 0.0,                   // uniform fog extinction (1/m) at height fogBase
    heightFalloff: 0.08,            // 1/m: density * exp(-falloff * (y - fogBase))
    fogBase: 0,
    albedo: [0.95, 0.96, 0.97],     // single-scattering albedo of the mist droplets
    anisotropy: 0.6,                // Henyey-Greenstein g (forward scattering -> bright shafts toward the sun)
    noiseScale: 0.035,              // 1/m of the drifting density noise
    noiseAmount: 0.6,
    wind: [1.5, 0, 0.6],            // m/s: noise drift (pure function of t)
    banks: [],                      // mist banks: [{ center:[x,y,z], radius:[rx,ry,rz], density, noise? }]
    sunShadows: true,               // use the sun's shadow map (god rays through trees, castles, wings)
    noiseFilter: false,             // true: mip-mapped density noise, filtered to each froxel's size (no blocky aliasing in distant banks)
    shadowSoftness: 0,              // metres: > 0 = soft 16-tap shadow lookup in the fog (smooth shafts from thin casters; 0 = one tap)
    cloudShadows: null,             // { coverage: 0.5, scale: 0.0012, altitude: 1500, speed: [8, 0], softness: 0.25, surfaces: true }
    ambient: null,                  // ambient (sky) radiance for in-scattering; default: from the sky or [0.3,0.35,0.42]*sun
    intensity: 1.0,
  },
  bloom: {
    intensity: 0.012,               // lens veiling glare: share of light spread into a wide halo (1-3% for real cine lenses)
    halation: 0.0,                  // film halation: red-orange glow around strong highlights
    halationTint: [1.0, 0.32, 0.12],
    halationThreshold: 1.0,
  },
  grade: {
    toneMapping: 'agx',             // 'agx' | 'aces' | 'neutral' | 'linear'
    look: 'cinema',                 // agx looks: 'base' | 'cinema' | 'punchy' | 'golden' | 'print'
    exposure: 0,                    // stops, on top of ctx.lens / meta.exposure
    whiteBalance: 6500,             // K the camera is balanced for (lower = picture gets cooler)
    tint: 0,                        // + = magenta, - = green
    contrast: 1.0,                  // scene-referred contrast around 18% grey
    saturation: 1.0,
    cdl: null,                      // { slope:[r,g,b], offset:[...], power:[...], saturation } in log (ACEScct-like) space
    lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1],   // display-referred, after tone mapping
    lut: null,                      // URL / path of a .cube file, or a parsed LUT (dk/lut.js)
    lutSpace: 'display',            // 'display' | 'logc3' | 'acescct'
    lutIntensity: 1.0,
  },
  lensFx: {
    vignette: 0.5,                  // share of natural cos^4 vignetting (from the lens' field angle)
    chromaticAberration: 0.7,       // lateral CA in pixels at the image corner, at 4K (scaled with resolution)
    distortion: 0.0,                // radial distortion (+ barrel, - pincushion); image auto-cropped to fill the frame
  },
  grain: {
    amount: 1.0,                    // 1 = clean modern cinema sensor at ISO 800 (scales with ISO)
    size: 1.0,                      // grain size in 4K pixels
    chroma: 0.2,                    // colour noise relative to luma noise
  },
};

export const CINEMATIC_PRESETS = {
  // default: velocity motion blur, DOF, GTAO, filmic grade, grain
  default: {},
  // hero shots: 8 true sub-frames (motion blur, anti-aliasing, soft shadows), more grain detail
  hero: { motionBlur: { mode: 'accumulate', accumulateSamples: 8 } },
  // fastest look development: no AO, no motion blur, half the DOF taps
  preview: { motionBlur: { mode: 'off' }, ao: { enabled: false }, dof: { samples: 24 } },
  // a filmic (not digital) look: halation, stronger grain, golden look
  film: { bloom: { halation: 0.25, intensity: 0.025 }, grain: { amount: 1.8, size: 1.4, chroma: 0.35 }, grade: { look: 'golden' } },
  // running footage from a hero-set scene: keep its look, but velocity motion blur + FXAA
  // instead of accumulated sub-frames (about the cost of one sub-frame instead of eight)
  velocity: { motionBlur: { mode: 'velocity' } },
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/** Deep merge (plain objects merge, everything else - arrays, class instances, null - replaces). */
export function deepMerge(base, over) {
  if (!isPlainObject(over)) return over === undefined ? base : over;
  const out = isPlainObject(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(over)) out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  return out;
}
function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (isPlainObject(v)) { const o = {}; for (const k in v) o[k] = clone(v[k]); return o; }
  return v;
}

/** meta.cinematic (true / preset name / object, optionally with .preset) -> full config, or null if off. */
export function resolveCinematic(spec) {
  if (spec === undefined || spec === null || spec === false) return null;
  let preset = 'default', over = {};
  if (spec === true) { /* defaults */ } else if (typeof spec === 'string') preset = spec;
  else if (isPlainObject(spec)) { over = spec; preset = spec.preset || 'default'; }
  else throw new Error(`meta.cinematic must be true, a preset name (${Object.keys(CINEMATIC_PRESETS).join(', ')}) or an object`);
  if (!CINEMATIC_PRESETS[preset]) throw new Error(`unknown cinematic preset "${preset}" (${Object.keys(CINEMATIC_PRESETS).join(', ')})`);
  const cfg = deepMerge(deepMerge(clone(CINEMATIC_DEFAULTS), clone(CINEMATIC_PRESETS[preset])), over);
  delete cfg.preset;
  cfg.preset = preset;
  return cfg;
}

const oneOf = (v, list, name) => { if (!list.includes(v)) throw new Error(`cinematic.${name} = "${v}" (use ${list.join(', ')})`); };
/** Check values that would otherwise fail deep inside a shader. */
export function validateCinematic(c) {
  oneOf(c.aa, ['fxaa', 'none'], 'aa');
  oneOf(c.motionBlur.mode, ['velocity', 'accumulate', 'off'], 'motionBlur.mode');
  oneOf(c.grade.toneMapping, ['agx', 'aces', 'neutral', 'linear'], 'grade.toneMapping');
  oneOf(c.grade.look, ['base', 'cinema', 'punchy', 'golden', 'print'], 'grade.look');
  oneOf(c.grade.lutSpace, ['display', 'logc3', 'acescct'], 'grade.lutSpace');
  oneOf(c.atmosphere.sky, ['physical', 'scene'], 'atmosphere.sky');
  const n = c.motionBlur.accumulateSamples;
  if (!(Number.isInteger(n) && n >= 1 && n <= 64)) throw new Error('cinematic.motionBlur.accumulateSamples must be 1..64');
  if (!(c.shadows.cascades >= 0 && c.shadows.cascades <= 4)) throw new Error('cinematic.shadows.cascades must be 0..4');
  const r = c.volumetrics.resolution;
  if (!(Array.isArray(r) && r.length === 3 && r.every((x) => Number.isInteger(x) && x >= 4))) throw new Error('cinematic.volumetrics.resolution must be [x, y, slices]');
  if (r[1] * r[2] > 8192) throw new Error('cinematic.volumetrics.resolution: y * slices must be <= 8192 (texture limit)');
  return c;
}

/**
 * The runtime's entry point: the scene's meta.cinematic plus an optional
 * command-line override (--cinematic off | on | <preset>). A preset given on
 * the command line is applied on top of the scene's own settings.
 */
export function cinematicFor(metaSpec, cli) {
  if (cli === false || cli === 'off') return null;
  if (cli === undefined || cli === null) return resolveCinematic(metaSpec);
  if (cli === 'on' || cli === true) return resolveCinematic(metaSpec || true);
  if (isPlainObject(cli)) {
    // programmatic override (tests, tools): { preset?, ...settings } on top of the scene's
    let base = resolveCinematic(metaSpec || true);
    if (cli.preset) base = deepMerge(base, clone(CINEMATIC_PRESETS[cli.preset] || {}));
    const o = { ...cli }; delete o.preset;
    return deepMerge(base, clone(o));
  }
  if (!CINEMATIC_PRESETS[cli]) throw new Error(`--cinematic ${cli}: unknown preset (${Object.keys(CINEMATIC_PRESETS).join(', ')})`);
  const base = resolveCinematic(metaSpec || true);
  const out = deepMerge(base, clone(CINEMATIC_PRESETS[cli]));
  out.preset = cli;
  return out;
}
