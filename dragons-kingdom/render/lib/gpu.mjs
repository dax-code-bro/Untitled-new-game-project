// Real-GPU support for --gpu (Windows first, then macOS and Linux).
//
// Chromium can draw WebGL through several back ends (ANGLE on Direct3D 11,
// Metal, Vulkan, desktop OpenGL), and when none of them works it quietly falls
// back to SwiftShader - the CPU emulation this project uses on purpose on
// machines without a graphics card. A 4K episode on SwiftShader takes months,
// so with --gpu a fallback must never go unnoticed:
//
//  * gpuProfiles(platform): the launch configurations worth trying, best first
//    (headless mode + ANGLE back end + flags). `node render/gpu-check.mjs`
//    tries them in order, keeps the first one whose WebGL renderer string names
//    a real GPU and saves it in pc/.dk-gpu.json (per machine, git-ignored).
//  * activeGpuProfile(): the profile --gpu uses: DK_GPU_PROFILE=<name>, else
//    the one gpu-check saved for this machine, else the platform default.
//  * isSoftwareRenderer(): recognises SwiftShader, llvmpipe, Microsoft's Basic
//    Render Driver / WARP, Apple's software renderer, ... from the
//    WEBGL_debug_renderer_info string. worker.mjs checks it right after the
//    browser starts (before the scene is built) and stops the render with
//    softwareFallbackMessage() unless DK_ALLOW_SOFTWARE_GPU=1.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PROJECT_ROOT } from './tools.mjs';

export const GPU_FILE = process.env.DK_GPU_FILE || path.join(PROJECT_ROOT, 'pc', '.dk-gpu.json');   // per machine, git-ignored

/** WebGL renderer strings that mean "no graphics card is drawing". */
export const SOFTWARE_RE = /swiftshader|llvmpipe|softpipe|lavapipe|software rasterizer|basic render driver|microsoft basic|\bwarp\b|mesa offscreen|gdi generic|apple software renderer|subzero/i;
export const isSoftwareRenderer = (s) => !s || SOFTWARE_RE.test(String(s));

/** Integrated GPUs: fine, but a laptop with a second, faster GPU should use that one. */
export const INTEGRATED_RE = /intel\(r\) (uhd|hd|iris)|intel.*(uhd|iris|hd graphics)|amd radeon\(tm\) graphics|radeon vega \d+ graphics|apple m\d/i;

// Playwright adds --enable-features=CDPScreenshotNewSurface; a second
// --enable-features would replace it, so profiles that enable features repeat it.
const FEATURES = (...f) => `--enable-features=${['CDPScreenshotNewSurface', ...f].join(',')}`;
const BASE = ['--enable-gpu', '--ignore-gpu-blocklist'];

/**
 * Launch configurations to try, best first.
 *   headless: true  = Chromium's "new" headless mode (the full browser, no window)
 *   shell: true     = Playwright's chromium-headless-shell build (old headless)
 *   headless: false = a real (off-screen) window: last resort, some drivers only
 *                     give a hardware context to a visible browser
 */
export function gpuProfiles(platform = process.platform) {
  if (platform === 'win32') {
    const hp = ['--force_high_performance_gpu'];     // dual-GPU laptops: the discrete card
    return [
      { name: 'win-d3d11', headless: true, args: [...BASE, ...hp, '--use-angle=d3d11'] },
      { name: 'win-d3d11-shell', headless: true, shell: true, args: [...BASE, ...hp, '--use-angle=d3d11'] },
      { name: 'win-d3d11on12', headless: true, args: [...BASE, ...hp, '--use-angle=d3d11on12'] },
      { name: 'win-gl', headless: true, args: [...BASE, ...hp, '--use-angle=gl'] },
      { name: 'win-vulkan', headless: true, args: [...BASE, ...hp, '--use-angle=vulkan', FEATURES('Vulkan')] },
      { name: 'win-d3d11-window', headless: false, args: [...BASE, ...hp, '--use-angle=d3d11', '--window-position=-32000,-32000', '--window-size=640,360'] },
    ];
  }
  if (platform === 'darwin') {
    return [
      { name: 'mac-metal', headless: true, args: [...BASE, '--use-angle=metal'] },
      { name: 'mac-metal-shell', headless: true, shell: true, args: [...BASE, '--use-angle=metal'] },
      { name: 'mac-gl', headless: true, args: [...BASE, '--use-angle=gl'] },
      { name: 'mac-metal-window', headless: false, args: [...BASE, '--use-angle=metal', '--window-position=-32000,-32000', '--window-size=640,360'] },
    ];
  }
  return [
    { name: 'linux-vulkan', headless: true, args: [...BASE, '--use-angle=vulkan', FEATURES('Vulkan', 'VulkanFromANGLE', 'DefaultANGLEVulkan')] },
    { name: 'linux-egl', headless: true, args: [...BASE, '--use-gl=angle', '--use-angle=gl-egl'] },
    { name: 'linux-gl', headless: true, args: [...BASE, '--use-gl=angle', '--use-angle=gl'] },
    { name: 'linux-desktop-gl', headless: true, args: [...BASE, '--use-gl=egl'] },
    { name: 'linux-vulkan-window', headless: false, args: [...BASE, '--use-angle=vulkan', FEATURES('Vulkan', 'VulkanFromANGLE'), '--window-position=0,0', '--window-size=640,360'] },
  ];
}

export function readGpuFile() {
  try { return JSON.parse(fs.readFileSync(GPU_FILE, 'utf8')); } catch { return null; }
}

/** What gpu-check found on this machine (null if it never ran here or found no GPU). */
export function savedGpuProfile() {
  const g = readGpuFile();
  if (!g || !g.profile || g.host !== os.hostname() || g.platform !== process.platform) return null;
  return g;
}

export function writeGpuFile(entry) {
  const out = { ...entry, host: os.hostname(), platform: process.platform, measuredAt: new Date().toISOString() };
  fs.writeFileSync(GPU_FILE, JSON.stringify(out, null, 2) + '\n');
  return out;
}

/** The launch profile --gpu uses. */
export function activeGpuProfile() {
  const all = gpuProfiles();
  const want = process.env.DK_GPU_PROFILE;
  if (want) {
    const p = all.find((x) => x.name === want);
    if (!p) throw new Error(`DK_GPU_PROFILE=${want} is not a profile for ${process.platform} (choose: ${all.map((x) => x.name).join(', ')})`);
    return p;
  }
  const saved = savedGpuProfile();
  if (saved) {
    const p = all.find((x) => x.name === saved.profile.name);
    if (p) return p;
    return saved.profile;            // a profile from an older list: use it as saved
  }
  return all[0];
}

/** Big, impossible-to-miss explanation for a --gpu render that would run on the CPU. */
export function softwareFallbackMessage(renderer, { profile, check = false } = {}) {
  const line = '='.repeat(78);
  const os_ = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[process.platform] || process.platform;
  return [
    '', line,
    '  GPU NOT USED - Chromium fell back to SOFTWARE rendering (no graphics card).',
    line,
    `  WebGL renderer: ${renderer || '(no WebGL context at all)'}`,
    profile ? `  launch profile: ${profile.name} (${profile.args.join(' ')})` : null,
    check ? '  A 4K episode in software rendering takes months instead of days: do not\n  start the episode before this check finds the graphics card.'
      : '  A 4K episode in software rendering takes months instead of days, so this\n  render was STOPPED. Nothing was rendered and nothing was deleted.',
    '',
    '  What to do:',
    ...[
      ...(check ? [] : [`Run  node render/gpu-check.mjs  - it tries every way Chromium can reach\n      the graphics card on ${os_} and remembers the one that works.`]),
      ...(process.platform === 'win32'
        ? ['Update the graphics driver (NVIDIA app / AMD Adrenalin / Intel Driver &\n      Support Assistant), restart the PC, run gpu-check again.',
          'Laptop: plug in the charger; in Windows Settings > System > Display >\n      Graphics, set "node.exe" and "chrome.exe" to "High performance".']
        : process.platform === 'darwin'
          ? ['Update macOS (the Metal drivers come with it) and run gpu-check again.']
          : ['Install the GPU driver with Vulkan support (NVIDIA proprietary, or Mesa\n      radeonsi/anv), make sure "vulkaninfo" works, run gpu-check again.']),
      'Send the gpu-check output (pc/logs/gpu-check-*.txt) to the Claude session.',
    ].map((s, i) => `   ${i + 1}. ${s}`),
    '  To render on the CPU on purpose, leave out --gpu (or set DK_ALLOW_SOFTWARE_GPU=1).',
    line, '',
  ].filter((l) => l !== null).join('\n');
}

export class SoftwareGpuError extends Error {
  constructor(renderer, profile) {
    super(softwareFallbackMessage(renderer, { profile }));
    this.code = 'GPU_SOFTWARE_FALLBACK';
    this.renderer = renderer;
  }
}

/** In-page probe: the WebGL2 renderer string, without building a scene. Runs in the browser. */
export function pageProbe() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const gl = c.getContext('webgl2', { powerPreference: 'high-performance', antialias: false });
  if (!gl) return { webgl2: false };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const out = {
    webgl2: true,
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    version: gl.getParameter(gl.VERSION),
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    floatTargets: !!gl.getExtension('EXT_color_buffer_float'),
  };
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return out;
}
