// Quality presets, GPU detection and saved settings.

export const PRESETS = {
  // Phone: everything tuned to hold a smooth 60 FPS on a mid-range phone.
  phone: {
    label: 'Phone', maxPixelRatio: 1.0, minScale: 0.6, targetFps: 60,
    terrainSegs: 256, treeCount: 7000, grass: 0, drawDistance: 900,
    shadows: 1, shadowMap: 1024, shadowRange: 50,
    bloom: false, ao: false, aa: 'msaa', traffic: 22, physicalPaint: false,
    anisotropy: 2, envEvery: 30, grassRadius: 0, reflections: 0,
  },
  low: {
    label: 'Low', maxPixelRatio: 1.0, minScale: 0.6, targetFps: 60,
    terrainSegs: 384, treeCount: 10000, grass: 0, drawDistance: 1100,
    shadows: 1, shadowMap: 1024, shadowRange: 70,
    bloom: false, ao: false, aa: 'msaa', traffic: 28, physicalPaint: false,
    anisotropy: 4, envEvery: 20, grassRadius: 0, reflections: 0,
  },
  medium: {
    label: 'Medium', maxPixelRatio: 1.25, minScale: 0.65, targetFps: 60,
    terrainSegs: 512, treeCount: 18000, grass: 0, drawDistance: 1600,
    shadows: 2, shadowMap: 2048, shadowRange: 100,
    bloom: true, ao: false, aa: 'smaa', traffic: 46, physicalPaint: true,
    anisotropy: 8, envEvery: 12, grassRadius: 32, reflections: 0.3,
  },
  high: {
    label: 'High', maxPixelRatio: 2, minScale: 0.7, targetFps: 90,
    terrainSegs: 768, treeCount: 32000, grass: 0, drawDistance: 2400,
    shadows: 3, shadowMap: 4096, shadowRange: 140,
    bloom: true, ao: false, aa: 'smaa', traffic: 72, physicalPaint: true,
    anisotropy: 16, envEvery: 8, grassRadius: 45, reflections: 0.45,
  },
  ultra: {
    label: 'Ultra', maxPixelRatio: 3, minScale: 0.75, targetFps: 90,
    terrainSegs: 1024, treeCount: 55000, grass: 0, drawDistance: 3600,
    shadows: 3, shadowMap: 4096, shadowRange: 200,
    bloom: true, ao: true, aa: 'smaa', traffic: 105, physicalPaint: true,
    anisotropy: 16, envEvery: 5, grassRadius: 60, reflections: 0.6,
  },
  // Cinematic: for the very top cards (RTX 4090 / 5090 class). Supersampled, 8K shadow map,
  // full-resolution ambient occlusion, the longest draw distance and the densest world.
  cinematic: {
    label: 'Cinematic', maxPixelRatio: 3, minScale: 0.85, targetFps: 60, cine: true,
    terrainSegs: 1280, treeCount: 75000, grass: 0, drawDistance: 4800,
    shadows: 3, shadowMap: 8192, shadowRange: 240,
    bloom: true, ao: true, aa: 'smaa', traffic: 120, physicalPaint: true,
    anisotropy: 16, envEvery: 3, grassRadius: 85, reflections: 0.75,
  },
};
// running as the desktop app (southbound-desktop): no browser limits to plan around
export const DESKTOP = typeof window !== 'undefined' && !!window.SB_DESKTOP;

// GPU families a PC player can pick from on the start screen.
export const GPU_CHOICES = [
  { id: 'auto', label: 'Auto-detect (recommended)', preset: null },
  { id: 'rtx-top', label: 'NVIDIA RTX 5090 / 5080 / 4090 / 4080 · AMD RX 9070 / 7900', preset: 'cinematic' },
  { id: 'rtx-high', label: 'NVIDIA RTX 5070 / 4070 / 3080 / 3090 · AMD RX 7800 / 6900', preset: 'ultra' },
  { id: 'rtx-mid', label: 'NVIDIA RTX 4060 / 3060 / 3070 · AMD RX 7600 / 6600–6800 · Intel Arc', preset: 'high' },
  { id: 'rtx-old', label: 'NVIDIA RTX 2060–2080 · GTX 1660 · AMD RX 5600 / 5700', preset: 'high' },
  { id: 'gtx', label: 'NVIDIA GTX 1050–1080 · AMD RX 470–590', preset: 'medium' },
  { id: 'apple', label: 'Apple M1 / M2 / M3 / M4 (Pro / Max = High)', preset: 'medium' },
  { id: 'igpu', label: 'Intel Iris Xe / UHD · AMD Radeon integrated', preset: 'low' },
  { id: 'unknown', label: 'Older or not sure', preset: 'low' },
];

export function detectGPU() {
  let name = 'Unknown GPU';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }
  } catch (e) { /* ignore */ }
  const n = String(name).toLowerCase();
  const mobile = /iphone|ipad|android|mobile/i.test(navigator.userAgent) || /adreno|mali|powervr|apple gpu/.test(n);
  let preset = 'low';
  if (/swiftshader|llvmpipe|software|basic render/.test(n)) preset = 'low';
  else if (mobile) preset = 'phone';
  else if (/rtx\s*(5090|5080|4090|4080)|rx\s*(9070|79\d\d)/.test(n)) preset = 'cinematic';
  else if (/rtx\s*(50|40)[6-9]0|rtx\s*30[89]0|rx\s*(9070|79\d\d|78\d\d|69\d\d)/.test(n)) preset = 'ultra';
  else if (/rtx|rx\s*(7\d\d\d|6[6-8]\d\d)|arc\s*a7|radeon pro/.test(n)) preset = 'high';
  else if (/apple m\d (pro|max|ultra)/.test(n)) preset = 'high';
  else if (/gtx|rx\s*[45]\d\d|apple m\d|radeon rx/.test(n)) preset = 'medium';
  // the browser is drawing in software (hardware acceleration off, or the GPU is blocklisted):
  // nothing in the game's settings can get past a few frames a second like that
  const software = /swiftshader|llvmpipe|software|basic render|softpipe/.test(n);
  return { name, preset, mobile, software };
}

export const SOFTWARE_HINT = 'Your browser is drawing the game without your graphics card, so it can only manage a few frames a second. ' +
  'Turn hardware acceleration on: Chrome / Edge: Settings › System › "Use graphics acceleration when available", then Relaunch. ' +
  'Firefox: Settings › General › Performance › "Use hardware acceleration when available", then restart. ' +
  'On a laptop, also set the browser to "High performance" in Windows Settings › Display › Graphics.';

const KEY = 'southbound.settings.v1';

export const DEFAULTS = {
  platform: null,           // 'phone' | 'pc'
  gpuChoice: 'auto',
  preset: 'high',
  resolution: 'native',     // native | 2160 | 1440 | 1080 | 720
  dynamicRes: true,
  targetFps: 60,
  fov: 70,
  sensitivity: 1.0,
  invertY: false,
  units: 'mph',
  masterVolume: 0.8,
  sfxVolume: 0.9,
  ambienceVolume: 0.7,
  showFps: true,
  hudScale: 1.0,
  // Content filters (for the planned mature content)
  gore: true,
  strongLanguage: true,
  subtitles: true,
  // Per-feature overrides, null = use preset
  bloom: null, ao: null, shadows: null, grass: null, aa: null, motionTrails: null,
  trafficDensity: 1.0,
  treeDensity: 1.0,
  drawDistance: 1.0,
  timeScale: 1.0,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) { /* storage unavailable */ }
  return { ...DEFAULTS };
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}

// Final quality values = preset + user overrides.
export function resolveQuality(s) {
  const p = { ...PRESETS[s.preset] || PRESETS.high, key: PRESETS[s.preset] ? s.preset : 'high' };
  if (s.bloom !== null) p.bloom = s.bloom;
  if (s.ao !== null) p.ao = s.ao;
  if (s.shadows !== null) p.shadows = s.shadows;
  if (s.aa !== null) p.aa = s.aa;
  p.treeCount = Math.round(p.treeCount * s.treeDensity);
  p.traffic = Math.round(p.traffic * s.trafficDensity);
  p.drawDistance *= s.drawDistance;
  p.targetFps = s.targetFps || p.targetFps;
  return p;
}
