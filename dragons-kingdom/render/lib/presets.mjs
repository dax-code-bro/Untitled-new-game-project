// Render presets. "width/height" is the video that comes out; "renderWidth/
// renderHeight" is what the 3D renderer actually draws (smaller for
// final-fast, which upscales in-shader). Defaults chosen from measurements on
// a 4-core CPU-only box, see README "Measured speeds".
import os from 'node:os';
import { TIER_PRESETS, TIERS } from '../../runtime/lib/quality.js';

export const PRESETS = {
  draft: {
    width: 960, height: 540, aa: 'fxaa',
    quality: { shadowMapSize: 1024, detail: 0.5 },
    crf: 20, x264Preset: 'veryfast',
  },
  preview: {
    width: 1920, height: 1080, aa: 'fxaa',
    quality: { shadowMapSize: 2048, detail: 0.75 },
    crf: 18, x264Preset: 'fast',
  },
  final: {
    width: 3840, height: 2160, aa: 'fxaa',
    quality: { shadowMapSize: 4096, detail: 1 },
    crf: 16, x264Preset: 'fast',
  },
  'final-fast': {
    width: 3840, height: 2160, renderWidth: 2560, renderHeight: 1440, aa: 'fxaa', sharpness: 0.5,
    quality: { shadowMapSize: 4096, detail: 1 },
    crf: 16, x264Preset: 'fast',
  },
  // The final preset (native 3840x2160, every frame) at a higher quality TIER for a big GPU
  // (Daxtyn's RTX 4090): more work per pixel, the same picture content. runtime/lib/quality.js
  // lists every knob; render/gpu-check.mjs measures them and recommends one. Scenes see
  // ctx.preset === 'final' (and ctx.quality.tier). Opt-in only: nothing else changes.
  //   final-high   every GPU knob up (4096 cascades, full-res GTAO, 2x froxels, SSR, x16 aniso, ...), velocity motion blur
  //   final-ultra  final-high + 16 real sub-frames per frame (true motion blur / supersampling / penumbrae)
  //   final-max    final-high + 32 sub-frames, densest settings
  ...Object.fromEntries(Object.entries(TIER_PRESETS).map(([name, tier]) => [name, {
    width: 3840, height: 2160, aa: 'fxaa',
    quality: { shadowMapSize: 4096, detail: 1, tier },
    crf: 16, x264Preset: 'fast', tier, about: TIERS[tier].label,
  }])),
};

/** The quality tier a resolved preset renders at ('final' for the plain presets). */
export const presetTier = (p) => p?.quality?.tier ?? p?.tier ?? 'final';

export const AA_MODES = ['none', 'fxaa', 'fxaa-hq', 'msaa2', 'msaa4', 'msaa8'];

export function resolvePreset(name, { size } = {}) {
  const p = PRESETS[name];
  if (!p) throw new Error(`unknown preset "${name}" (choose: ${Object.keys(PRESETS).join(', ')})`);
  const r = { name, ...p, quality: { ...p.quality } };
  if (size) {
    const m = /^(\d+)x(\d+)$/.exec(size);
    if (!m) throw new Error(`--size must look like 1280x720`);
    r.width = +m[1]; r.height = +m[2];
    delete r.renderWidth; delete r.renderHeight;
  }
  r.renderWidth = r.renderWidth ?? r.width;
  r.renderHeight = r.renderHeight ?? r.height;
  if (r.width % 8 || r.height % 4) throw new Error(`size ${r.width}x${r.height}: width must be a multiple of 8, height a multiple of 4`);
  return r;
}

/** Worker count used when there is no bench result: leave one core for ffmpeg + node. */
export function defaultWorkers() {
  const cores = os.availableParallelism?.() ?? os.cpus().length;
  return Math.max(1, Math.min(3, cores - 1));
}

/**
 * RAM one worker needs at this preset (its browser + its x264 encoder),
 * measured at 4K (10 s test clip, 4 workers, 10.6 GB peak in total): ~2.6 GB
 * per worker (browser processes ~1.4 GB, x264 medium ~1.2 GB); scales roughly
 * with the pixel count.
 */
export function workerMemoryGB(p) {
  const px = Math.max(p.width * p.height, p.renderWidth * p.renderHeight) / (3840 * 2160);
  return 0.4 + 2.2 * px;
}

/** Most workers that fit in this machine's RAM (keeps ~15% + 1 GB for everything else). */
export function memoryWorkerCap(p) {
  const totalGB = os.totalmem() / 2 ** 30;
  return Math.max(1, Math.floor((totalGB * 0.85 - 1) / workerMemoryGB(p)));
}
