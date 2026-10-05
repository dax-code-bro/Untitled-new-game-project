// Render presets. "width/height" is the video that comes out; "renderWidth/
// renderHeight" is what the 3D renderer actually draws (smaller for
// final-fast, which upscales in-shader). Defaults chosen from measurements on
// a 4-core CPU-only box, see README "Measured speeds".
import os from 'node:os';

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
};

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
