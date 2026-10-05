// Locating the external tools: Playwright, Chromium, ffmpeg, ffprobe.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const GLOBAL_PLAYWRIGHT_DIRS = [
  process.env.DK_PLAYWRIGHT,
  '/opt/node-tools/node_modules/playwright',
].filter(Boolean);

let _pw = null;
export async function loadPlaywright() {
  if (_pw) return _pw;
  const errors = [];
  try {
    _pw = await import('playwright');
    _pw = _pw.chromium ? _pw : _pw.default;
    if (_pw?.chromium) return _pw;
  } catch (e) { errors.push(`import('playwright'): ${e.message.split('\n')[0]}`); }
  for (const dir of GLOBAL_PLAYWRIGHT_DIRS) {
    try {
      const req = createRequire(path.join(dir, 'package.json'));
      const entry = req.resolve(dir);
      let mod = await import(pathToFileURL(entry).href);
      mod = mod.chromium ? mod : mod.default;
      if (mod?.chromium) { _pw = mod; return _pw; }
    } catch (e) { errors.push(`${dir}: ${e.message.split('\n')[0]}`); }
  }
  throw new Error('Could not load Playwright. Run "npm install" in dragons-kingdom (or set DK_PLAYWRIGHT=/path/to/node_modules/playwright).\n  ' + errors.join('\n  '));
}

export async function chromeExecutable() {
  if (process.env.DK_CHROME) {
    if (!existsSync(process.env.DK_CHROME)) throw new Error(`DK_CHROME=${process.env.DK_CHROME} does not exist`);
    return process.env.DK_CHROME;
  }
  const pw = await loadPlaywright();
  const exe = pw.chromium.executablePath();
  if (!exe || !existsSync(exe)) {
    throw new Error(`Chromium not found at "${exe}". Install it with "npx playwright install chromium" or set DK_CHROME=/path/to/chrome`);
  }
  return exe;
}

function which(bin) {
  const r = spawnSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function ffmpegPath() { return process.env.DK_FFMPEG || which('ffmpeg') || 'ffmpeg'; }
export function ffprobePath() { return process.env.DK_FFPROBE || which('ffprobe') || 'ffprobe'; }

export function checkFfmpeg() {
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('ffmpeg not found. Install ffmpeg (with libx264) or set DK_FFMPEG.');
  if (!/libx264/.test(r.stdout)) throw new Error('this ffmpeg has no libx264 encoder');
}

// Chromium flags. SwiftShader = Chrome's CPU implementation of OpenGL ES / WebGL2.
export const SWIFTSHADER_FLAGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
export const COMMON_FLAGS = [
  '--disable-gpu-watchdog',                 // a 4K CPU frame can take seconds; never kill the GPU process for it
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-dev-shm-usage',
  '--mute-audio',
  '--no-first-run',
];
export function chromeFlags({ gpu = false } = {}) {
  const extra = (process.env.DK_CHROME_ARGS || '').split(/\s+/).filter(Boolean);
  const gpuFlags = gpu ? ['--ignore-gpu-blocklist', '--enable-gpu'] : SWIFTSHADER_FLAGS;
  return [...COMMON_FLAGS, ...gpuFlags, ...extra];
}
