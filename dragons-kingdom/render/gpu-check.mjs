#!/usr/bin/env node
// GPU self-test for rendering Dragon's Kingdom on a PC with a graphics card.
//
//   node render/gpu-check.mjs                 find the GPU, render one 4K style frame, estimate the episode
//   node render/gpu-check.mjs --all-profiles  also list every other way Chromium could reach the GPU
//   node render/gpu-check.mjs --swiftshader   measure the CPU (SwiftShader) on purpose - no GPU needed
//
// What it does:
//  1. Prints the machine (OS, CPU, RAM, graphics cards the OS knows, Node,
//     Chromium, ffmpeg, free disk).
//  2. Tries the Chromium launch profiles for this OS (render/lib/gpu.mjs: ANGLE
//     on Direct3D 11 first on Windows, Metal on macOS, Vulkan/EGL on Linux)
//     and reads the WEBGL_debug_renderer_info string of each. The first one
//     that names a real GPU is saved in pc/.dk-gpu.json; `render.mjs --gpu` and
//     `npm run episode` use it. If every profile ends up in SwiftShader (or
//     another software renderer) it says so in a big banner and exits with 2.
//  3. Renders a native 3840x2160 frame of a style frame (F2 riding grounds,
//     the master settings: --preset final --cinematic velocity, 10-bit) - the
//     first frame includes shader compilation - then a few more frames to
//     measure the steady speed. Saves the first one as a PNG.
//  4. Compares the PICTURE with the same frame rendered on the cloud machine, on which every
//     shot was reviewed (pc/reference-image.json: a thumbnail and two 1:1 crops, render/lib/picture.mjs):
//     PSNR / SSIM, pure black and white pixels (NaN / infinity), and the NaN / Inf counts of every
//     float buffer in the page. Prints SAME PICTURE, SMALL DIFFERENCES or DIFFERENT in a banner and
//     writes output/gpu-check/gpu-check-picture-for-claude.jpg (the frame at 1280x720 + two 1:1 crops)
//     to drag into the chat.
//  5. Compares the speed with the same frame measured on the cloud machine's
//     CPU (pc/reference-cpu.json) and scales the per-scene hours of
//     episodes/s01e01/final/render-schedule.md by it: an ESTIMATE of how long
//     Episode 1 takes on this PC.
//  --heavy also renders the F5 Cling square style frame (the heaviest set, a third of the episode):
//  graphics memory and the Windows GPU time-out (TDR) on the biggest scene.
// Everything printed also goes to pc/logs/gpu-check-<date>.txt and
// output/gpu-check/gpu-check.json. Exit code: 0 GPU ok, 2 no GPU (software), 3 the GPU draws a
// DIFFERENT picture from the reference, 1 error.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs, num } from './lib/args.mjs';
import { resolvePreset } from './lib/presets.mjs';
import { PROJECT_ROOT, loadPlaywright, chromeExecutable, chromeFlags, ffmpegPath, checkFfmpeg } from './lib/tools.mjs';
import { gpuProfiles, isSoftwareRenderer, INTEGRATED_RE, pageProbe, writeGpuFile, softwareFallbackMessage, graphicsSettingsApps, GPU_FILE } from './lib/gpu.mjs';
import { openSession } from './lib/session.mjs';
import { writePng } from './lib/ffmpeg.mjs';
import { parseSchedule, loadJobs, DEFAULT_SCHEDULE } from './lib/schedule.mjs';
import { fmtDuration } from './lib/progress.mjs';
import { analyse, compare, toReference, LIMITS } from './lib/picture.mjs';

const REFERENCE_FILE = path.join(PROJECT_ROOT, 'pc', 'reference-cpu.json');
const REFERENCE_IMAGE_FILE = path.join(PROJECT_ROOT, 'pc', 'reference-image.json');
export const PICTURE_JPG = 'gpu-check-picture-for-claude.jpg';

// Test frames, best first. A candidate whose scene cannot be built here (a
// cache or asset not made yet) is skipped with a note; the next one is used.
const CANDIDATES = [
  // crops: 1:1 places compared with the reference (top-left corner, 96x96, 4K pixels) and shown in the chat picture (640x360 around them)
  { id: 'f2-velocity', label: 'style frame F2, Verdor riding grounds (Charcoal, Leaf, Remi, Abby, keeper, 77k grass tufts)', scene: 'scenes/lookdev/style-f2-riding-grounds.js', time: 2, cinematic: 'velocity',
    crops: [{ name: 'charcoal-head', x: 1392, y: 1302 }, { name: 'remi-on-the-platform', x: 2082, y: 752 }] },
  // only with --heavy (or --candidate f5-cling): the heaviest set, for graphics memory and the GPU time-out
  { id: 'f5-cling', heavy: true, label: 'style frame F5, Cling square (the heaviest set: houses, crowd, Starlight; 821 s per frame on the cloud CPU with 8 sub-frames)', scene: 'scenes/lookdev/style-f5-cling-square.js', time: 2, cinematic: 'velocity',
    crops: [{ name: 'cling-centre', x: 1872, y: 1032 }, { name: 'cling-left', x: 960, y: 1300 }] },
  { id: 'lookdev-coast', label: 'cinematic lookdev coast (sky model, fog, FFT ocean, dragon; no caches needed)', scene: 'scenes/cinematic-lookdev.js', time: 4, cinematic: 'velocity' },
  { id: 'test-kingdom', label: 'test kingdom (castle, 13,700 trees, standard pipeline; no assets needed)', scene: 'scenes/test-kingdom.js', time: 5, cinematic: undefined },
];

const HELP = `
GPU self-test: finds the graphics card, renders a 4K style frame, estimates Episode 1.

  node render/gpu-check.mjs [options]

  --frames N          frames to render (default 3: the first includes shader compilation)
  --candidate ID      test frame: ${CANDIDATES.map((c) => c.id).join(' | ')} (default: the first that builds)
  --heavy             also render the F5 Cling square frame (the heaviest set: graphics memory, GPU time-out)
  --scene FILE --time T [--cinematic MODE]   any other scene instead
  --profile NAME      only try this launch profile (see --all-profiles)
  --all-profiles      try every launch profile and list them all
  --swiftshader       skip the GPU search, measure SwiftShader (the CPU) on purpose
  --write-reference   (with --swiftshader) store the speed in pc/reference-cpu.json
  --write-reference-image  (with --swiftshader) store the picture (thumbnail + 1:1 crops) in pc/reference-image.json
  --schedule FILE     render schedule (default ${path.relative(PROJECT_ROOT, DEFAULT_SCHEDULE)})
  --probe-only        stop after the GPU search (no rendering)
  --out DIR           where the PNG and gpu-check.json go (default output/gpu-check)
`;

// ------------------------------------------------------------------ log ---
const logLines = [];
const say = (...a) => { const s = a.join(' '); logLines.push(s); console.log(s); };
const sh = (cmd, args, opts = {}) => {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 20000, windowsHide: true, ...opts });
    return r.status === 0 ? (r.stdout || '').trim() : null;
  } catch { return null; }
};

/** Graphics cards as the operating system lists them (best effort; names and memory). */
function osGpus() {
  const out = [];
  const nv = sh('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader']);
  if (nv) for (const l of nv.split(/\r?\n/).filter(Boolean)) out.push(`NVIDIA: ${l.trim()} (nvidia-smi)`);
  if (process.platform === 'win32') {
    const ps = sh('powershell', ['-NoProfile', '-Command',
      'Get-CimInstance Win32_VideoController | ForEach-Object { "$($_.Name) | driver $($_.DriverVersion) | $([math]::Round($_.AdapterRAM/1GB,1)) GB (AdapterRAM, max 4 GB shown)" }']);
    if (ps) for (const l of ps.split(/\r?\n/).filter(Boolean)) out.push(l.trim());
  } else if (process.platform === 'darwin') {
    const sp = sh('system_profiler', ['SPDisplaysDataType']);
    if (sp) for (const l of sp.split('\n').filter((x) => /Chipset Model|VRAM|Metal/.test(x))) out.push(l.trim());
  } else {
    const lp = sh('sh', ['-c', 'lspci 2>/dev/null | grep -iE "vga|3d|display"']);
    if (lp) for (const l of lp.split('\n').filter(Boolean)) out.push(l.trim());
    const vk = sh('sh', ['-c', 'vulkaninfo --summary 2>/dev/null | grep -E "deviceName|driverName"']);
    if (vk) for (const l of vk.split('\n').filter(Boolean)) out.push(`vulkan: ${l.trim()}`);
  }
  return out;
}

function freeDiskGB(dir) {
  try { const s = fs.statfsSync(dir); return (s.bavail * s.bsize) / 2 ** 30; } catch { return null; }
}

async function systemReport() {
  const cpus = os.cpus();
  const pw = await loadPlaywright().catch(() => null);
  let pwVersion = null;
  try { pwVersion = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'node_modules', 'playwright', 'package.json'), 'utf8')).version; } catch {}
  const ff = sh(ffmpegPath(), ['-hide_banner', '-version']);
  const r = {
    os: `${os.type()} ${os.release()} ${os.version?.() || ''} (${process.platform}/${process.arch})`.replace(/\s+/g, ' ').trim(),
    host: os.hostname(),
    cpu: `${cpus[0]?.model?.trim() || 'unknown CPU'} x${cpus.length} threads`,
    ramGB: +(os.totalmem() / 2 ** 30).toFixed(1),
    node: process.version,
    playwright: pwVersion || (pw ? 'loaded' : 'MISSING'),
    ffmpeg: ff ? ff.split('\n')[0].replace(/\s+Copyright.*$/, '') : 'MISSING',
    freeDiskGB: freeDiskGB(PROJECT_ROOT),
    gpusOS: osGpus(),
  };
  return r;
}

// --------------------------------------------------------------- probing ---
async function probeProfile(profile) {
  const pw = await loadPlaywright();
  const t0 = Date.now();
  let browser = null;
  try {
    const executablePath = profile.shell ? (process.env.DK_CHROME_SHELL || undefined) : await chromeExecutable();
    browser = await pw.chromium.launch({
      executablePath, headless: profile.headless !== false, timeout: 60000,
      args: chromeFlags({ gpu: !profile.software, profile: profile.software ? null : profile }),
    });
    const page = await browser.newPage();
    await page.goto('about:blank');
    const p = await Promise.race([page.evaluate(pageProbe), new Promise((_, rej) => setTimeout(() => rej(new Error('probe timed out (60 s)')), 60000))]);
    return { ...p, browser: browser.version(), ok: p.webgl2 && !isSoftwareRenderer(p.renderer), ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e.message.split('\n')[0], ms: Date.now() - t0 };
  } finally {
    await browser?.close().catch(() => {});
  }
}

// ------------------------------------------------------------- measuring ---
async function measure(c, { gpu, profile, frames, outDir }) {
  const p = resolvePreset('final');
  const t0 = Date.now();
  const s = await openSession({
    scene: path.resolve(PROJECT_ROOT, c.scene), resolved: p, fps: 24, gpu, gpuProfile: profile,
    bitDepth: 10, dither: false, ...(c.cinematic ? { cinematic: c.cinematic } : {}),
    log: (...a) => say('   ', ...a),
  });
  const openMs = Date.now() - t0;
  try {
    const f0 = Math.round(c.time * 24);
    const res = [];
    let picture = null;
    for (let k = 0; k < frames; k++) {
      const frame = f0 + k;
      const a = Date.now();
      const { frames: got, stats } = await s.render([frame], k === 0 ? 'rgba' : 'yuv10');
      const ms = Date.now() - a;
      res.push({ frame, ms, pageMs: stats.ms });
      say(`   frame ${frame} (${k === 0 ? 'first: includes shader compilation' : 'steady'}): ${(ms / 1000).toFixed(2)} s`);
      if (k === 0) {
        const png = path.join(outDir, `gpu-check-${c.id}.png`);
        const rgba = got.get(frame);
        await writePng(rgba, { width: p.width, height: p.height, out: png });
        say(`   wrote ${path.relative(PROJECT_ROOT, png)} (${p.width}x${p.height})`);
        // the picture: compared with the frame the cloud rendered (and every shot was reviewed on)
        const buffers = await s.worker.page.evaluate(() => window.dk.debugCinematic?.() ?? null).catch((e) => ({ error: e.message }));
        picture = { analysis: analyse(rgba, p.width, p.height, c.crops || []), buffers: buffers?.error ? null : buffers, png };
        if (buffers?.error) say(`   (could not read the float buffers: ${buffers.error.split('\n')[0]})`);
      }
    }
    const steady = res.length > 1 ? res.slice(1).map((r) => r.ms).sort((a, b) => a - b)[(res.length - 1) >> 1] : res[0].ms;
    return { candidate: c.id, scene: c.scene, time: c.time, cinematic: c.cinematic ?? null, renderer: s.info.glRenderer,
      setupS: +(s.info.setupMs / 1000).toFixed(1), openS: +(openMs / 1000).toFixed(1), firstS: +(res[0].ms / 1000).toFixed(2),
      steadyS: +(steady / 1000).toFixed(2), frames: res, picture };
  } finally { await s.close(); }
}

// --------------------------------------------------------------- picture ---
function readImageReference() { try { return JSON.parse(fs.readFileSync(REFERENCE_IMAGE_FILE, 'utf8')); } catch { return null; } }

/** One JPG to drag into the chat: the frame at 1280x720 on top, two 640x360 1:1 crops below (1280x1080). */
function chatPicture(png, crops, out) {
  const W = 3840, H = 2160;
  const box = (c) => [Math.max(0, Math.min(W - 640, c.x + 48 - 320)), Math.max(0, Math.min(H - 360, c.y + 48 - 180))];
  const [a, b] = [crops[0] || { x: 1600, y: 900 }, crops[1] || crops[0] || { x: 1600, y: 900 }].map(box);
  const f = `[0:v]split=3[s0][s1][s2];[s0]scale=1280:720:flags=area[top];[s1]crop=640:360:${a[0]}:${a[1]}[c1];[s2]crop=640:360:${b[0]}:${b[1]}[c2];[c1][c2]hstack=inputs=2[bot];[top][bot]vstack=inputs=2,format=yuvj420p[o]`;
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-i', png, '-filter_complex', f, '-map', '[o]', '-frames:v', '1', '-q:v', '3', out], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? out : null;
}

function pictureReport(m, outDir, { writeReference }) {
  const pic = m.picture;
  if (!pic) return null;
  const c = CANDIDATES.find((x) => x.id === m.candidate) || {};
  const jpg = chatPicture(pic.png, c.crops || [], path.join(outDir, m.candidate === CANDIDATES[0].id ? PICTURE_JPG : `gpu-check-picture-${m.candidate}-for-claude.jpg`));
  const nanBufs = Object.entries(pic.buffers || {}).filter(([k, v]) => k !== 'shaderErrors' && v && (v.nan || v.inf));
  say(`   float buffers: ${pic.buffers ? (nanBufs.length ? nanBufs.map(([k, v]) => `${k} ${v.nan} NaN / ${v.inf} Inf`).join(', ') : `${Object.keys(pic.buffers).length - 1} checked, no NaN or Inf`) : 'not readable'}${pic.buffers?.shaderErrors ? `, ${pic.buffers.shaderErrors} shader errors` : ''}`);
  if (writeReference) {
    const ref = readImageReference() || { about: 'The GPU check test frames as the cloud machine (SwiftShader) renders them: thumbnail + 1:1 crops (deflate + base64 RGB), pure black/white shares. render/gpu-check.mjs compares a PC\'s frame with these (render/lib/picture.mjs).', candidates: {} };
    ref.candidates[m.candidate] = { scene: m.scene, time: m.time, cinematic: m.cinematic, preset: 'final', bitDepth: 10, renderer: m.renderer, measuredAt: new Date().toISOString(), ...toReference(pic.analysis) };
    fs.writeFileSync(REFERENCE_IMAGE_FILE, JSON.stringify(ref, null, 1) + '\n');
    say(`   wrote the picture reference in ${path.relative(PROJECT_ROOT, REFERENCE_IMAGE_FILE)}`);
  }
  const ref = readImageReference()?.candidates?.[m.candidate];
  const out = { jpg: jpg ? path.relative(PROJECT_ROOT, jpg) : null };
  if (!ref) {
    say(`   no reference picture for "${m.candidate}" in pc/reference-image.json - the picture is not compared`);
    return { ...out, verdict: 'NOT COMPARED' };
  }
  const cmp = compare(pic.analysis, ref, pic.buffers);
  Object.assign(out, cmp, { referenceDate: ref.measuredAt });
  const line = '#'.repeat(78);
  say('');
  say(line);
  say(`#  PICTURE CHECK (${m.candidate}): ${cmp.verdict}`);
  say(`#  compared with the frame the cloud rendered on ${String(ref.measuredAt).slice(0, 10)} (every shot is reviewed there):`);
  say(`#    whole picture (${ref.thumb.w}x${ref.thumb.h}): PSNR ${cmp.thumbPsnr} dB (limit ${LIMITS.thumbPsnr}), SSIM ${cmp.thumbSsim} (limit ${LIMITS.thumbSsim})`);
  for (const k of cmp.crops) say(`#    1:1 crop ${k.name}: PSNR ${k.psnr} dB (limit ${LIMITS.cropPsnr})`);
  say(`#    pure black ${(100 * cmp.black.now).toFixed(3)}% (reference ${(100 * cmp.black.ref).toFixed(3)}%), pure white ${(100 * cmp.white.now).toFixed(3)}% (reference ${(100 * cmp.white.ref).toFixed(3)}%)`);
  for (const r of cmp.reasons) say(`#    - ${r}`);
  if (cmp.verdict !== 'SAME PICTURE') {
    say('#  The graphics card does not draw this frame exactly like the cloud computer. Before rendering');
    say('#  the episode, drag this picture into the chat with Claude so someone can look at it:');
  } else say('#  Please still drag this picture into the chat with Claude, so someone can look at it:');
  say(`#    ${out.jpg || '(the picture could not be written)'}`);
  say(line);
  return out;
}

// ------------------------------------------------------------- estimate ---
function readReference() { try { return JSON.parse(fs.readFileSync(REFERENCE_FILE, 'utf8')); } catch { return null; } }

function estimate(m, scheduleFile) {
  const ref = readReference()?.measurements?.[m.candidate];
  if (!ref) return { note: `no CPU reference for "${m.candidate}" in pc/reference-cpu.json - no estimate` };
  const ratio = m.steadyS / ref.steadyS;
  // scene setup is JavaScript on the CPU (geometry, crowds); only a frame with a real setup (F2: ~150 s) measures it
  const setupRatio = ref.setupS >= 10 && m.setupS > 0 ? m.setupS / ref.setupS : 1;
  let sched;
  try { sched = parseSchedule(scheduleFile); } catch (e) { return { ratio, note: `could not read the render schedule: ${e.message}` }; }
  let jobs = [];
  try { jobs = loadJobs(scheduleFile).jobs; } catch {}
  const rows = sched.scenes.map((s) => {
    const setupH = jobs.filter((j) => j.scene === s.key && j.render === '3d').reduce((a, j) => a + (j.setup_s || 0), 0) * setupRatio / 3600;
    const h = (s.renderH || 0) * ratio + setupH;
    return { scene: s.key, title: s.title, frames: s.frames, cpuH: s.renderH, hours: h, low: (s.rangeH?.[0] ?? s.renderH ?? 0) * ratio + setupH, high: (s.rangeH?.[1] ?? s.renderH ?? 0) * ratio + setupH };
  });
  const tot = rows.reduce((a, r) => ({ hours: a.hours + r.hours, low: a.low + r.low, high: a.high + r.high, cpuH: a.cpuH + (r.cpuH || 0) }), { hours: 0, low: 0, high: 0, cpuH: 0 });
  return { ratio, setupRatio, speedup: 1 / ratio, reference: ref, rows, total: tot };
}

// ------------------------------------------------------------------ main ---
async function main() {
  const a = parseArgs(process.argv.slice(2), { booleans: ['help', 'all-profiles', 'swiftshader', 'write-reference', 'write-reference-image', 'probe-only', 'heavy'] });
  if (a.help) { console.log(HELP); return 0; }
  const frames = num(a.frames, 'frames', { min: 1, int: true }) ?? 3;
  const outDir = path.resolve(a.out || path.join(PROJECT_ROOT, 'output', 'gpu-check'));
  const scheduleFile = path.resolve(a.schedule || DEFAULT_SCHEDULE);
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const logDir = path.join(PROJECT_ROOT, 'pc', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `gpu-check-${stamp}.txt`);
  const result = { version: 1, date: new Date().toISOString() };
  let code = 0;
  try {
    say(`Dragon's Kingdom GPU check - ${new Date().toString()}`);
    checkFfmpeg();
    const sys = await systemReport();
    result.system = sys;
    say('\n== This computer');
    say(`   OS:        ${sys.os}`);
    say(`   CPU:       ${sys.cpu}, RAM ${sys.ramGB} GB`);
    for (const g of sys.gpusOS.length ? sys.gpusOS : ['(the OS did not list any graphics card)']) say(`   GPU (OS):  ${g}`);
    say(`   Node ${sys.node}, Playwright ${sys.playwright}, ${sys.ffmpeg}`);
    if (sys.freeDiskGB != null) say(`   free disk: ${sys.freeDiskGB.toFixed(0)} GB (the episode needs about 100 GB while rendering: shots, scene files and the finished episode; pc/MANIFEST.md)`);

    // ---- 1. find the GPU
    let chosen = null;
    if (a.swiftshader) {
      say('\n== GPU search skipped (--swiftshader): measuring the CPU on purpose');
    } else {
      say('\n== Looking for the graphics card (Chromium launch profiles)');
      let list = gpuProfiles();
      if (a.profile) {
        list = list.filter((p) => p.name === a.profile);
        if (!list.length) throw new Error(`--profile ${a.profile}: not a profile for ${process.platform} (${gpuProfiles().map((p) => p.name).join(', ')})`);
      }
      result.probes = [];
      for (const prof of list) {
        const r = await probeProfile(prof);
        result.probes.push({ profile: prof.name, ...r });
        const what = r.error ? `failed to start: ${r.error}` : !r.webgl2 ? 'no WebGL2 at all' : `${r.ok ? 'GPU' : 'SOFTWARE'}  ${r.renderer}`;
        say(`   ${r.ok ? 'OK  ' : 'no  '} ${prof.name.padEnd(18)} ${what}`);
        if (r.ok && !chosen) { chosen = { profile: prof, probe: r }; if (!a.allProfiles) break; }
      }
      if (!chosen) {
        const last = result.probes.find((p) => p.renderer) || {};
        say(softwareFallbackMessage(last.renderer || null, { check: true }));
        say('Every launch profile above ended in software rendering (or none started).');
        result.gpu = null;
        code = 2;
        return code;
      }
      say(`\n   -> using "${chosen.profile.name}": ${chosen.probe.renderer}`);
      if (INTEGRATED_RE.test(chosen.probe.renderer) && sys.gpusOS.length > 1) {
        say('   NOTE: this looks like the INTEGRATED graphics. If the PC also has a separate (faster) card, add these');
        say('         programs in Windows Settings > System > Display > Graphics ("Browse"), set each to "High performance"');
        say('         and run this again (the Chromium is Playwright\'s own copy, not Google Chrome):');
        for (const f of graphicsSettingsApps()) say(`           ${f}`);
      }
      const saved = writeGpuFile({ profile: chosen.profile, renderer: chosen.probe.renderer, vendor: chosen.probe.vendor, browser: chosen.probe.browser });
      result.gpu = saved;
      say(`   saved in ${path.relative(PROJECT_ROOT, GPU_FILE)} - render.mjs --gpu and npm run episode use it`);
    }
    if (a.probeOnly) return 0;

    // ---- 2. render a 4K frame
    say(`\n== Rendering native 3840x2160 (--preset final, 10-bit${a.swiftshader ? ', SwiftShader = CPU' : ', GPU'})`);
    let cands = CANDIDATES.filter((c) => !c.heavy);
    if (a.scene) cands = [{ id: path.basename(a.scene, '.js'), label: a.scene, scene: a.scene, time: num(a.time, 'time', { min: 0 }) ?? 0, cinematic: a.cinematic }];
    else if (a.candidate) cands = a.candidate === 'all' ? CANDIDATES : CANDIDATES.filter((c) => c.id === a.candidate);
    if (!cands.length) throw new Error(`--candidate ${a.candidate}: choose ${CANDIDATES.map((c) => c.id).join(', ')} or all`);
    const measurements = [];
    const heavy = a.heavy && !a.candidate && !a.scene ? CANDIDATES.filter((c) => c.heavy) : [];
    let found = false;
    for (const c of [...cands, ...heavy]) {
      if (found && !c.heavy && a.candidate !== 'all' && !a.writeReference && !a.writeReferenceImage) continue;
      say(` - ${c.label}`);
      say(`   scene ${c.scene} at t=${c.time} s${c.cinematic ? `, --cinematic ${c.cinematic}` : ''}`);
      try {
        const m = await measure(c, { gpu: !a.swiftshader, profile: chosen?.profile, frames: c.heavy ? Math.min(frames, 2) : frames, outDir });
        say(`   renderer: ${m.renderer}`);
        say(`   scene setup ${m.setupS} s (browser + scene build ${m.openS} s), first frame ${m.firstS} s, steady ${m.steadyS} s per frame`);
        m.picture = pictureReport(m, outDir, { writeReference: !!a.writeReferenceImage });
        measurements.push(m);
        if (!c.heavy) found = true;
      } catch (e) {
        if (e.code === 'GPU_SOFTWARE_FALLBACK') throw e;
        if (c.heavy) {
          say(`   the heavy frame FAILED: ${e.message.split('\n')[0]}`);
          say('   (if it says the context or device was lost, the graphics card ran out of memory or hit the Windows GPU time-out)');
          result.heavyError = e.message.split('\n')[0];
          continue;
        }
        say(`   could not build this test frame here: ${e.message.split('\n')[0]}`);
        say('   (a cache or asset is probably not made yet - trying the next test frame)');
      }
    }
    result.measurements = measurements;
    if (!measurements.length) throw new Error('none of the test frames could be rendered (see above)');

    // ---- 3. reference / estimate
    if (a.writeReference) {
      if (!a.swiftshader) throw new Error('--write-reference is only for --swiftshader measurements (the CPU reference)');
      const ref = readReference() || { about: 'CPU (SwiftShader) speed of the gpu-check test frames on the cloud render machine; gpu-check divides a PC\'s speed by these to scale render-schedule.md.', measurements: {} };
      for (const m of measurements) {
        ref.measurements[m.candidate] = { scene: m.scene, time: m.time, cinematic: m.cinematic, preset: 'final', bitDepth: 10,
          steadyS: m.steadyS, firstS: m.firstS, setupS: m.setupS, renderer: m.renderer, machine: `${sys.cpu}, ${sys.ramGB} GB, ${sys.os}`, measuredAt: result.date,
          frames: m.frames.map((f) => +(f.ms / 1000).toFixed(2)) };
      }
      fs.writeFileSync(REFERENCE_FILE, JSON.stringify(ref, null, 1) + '\n');
      say(`\n   wrote ${path.relative(PROJECT_ROOT, REFERENCE_FILE)}`);
    }
    const m = measurements.find((x) => !CANDIDATES.find((c) => c.id === x.candidate)?.heavy) || measurements[0];
    result.picture = m.picture;
    const est = estimate(m, scheduleFile);
    result.estimate = est;
    say('\n== Episode 1 estimate (from ' + path.relative(PROJECT_ROOT, scheduleFile) + ')');
    if (est.rows) {
      say(`   this ${a.swiftshader ? 'CPU' : 'GPU'}: ${m.steadyS} s per 4K frame; the cloud CPU took ${est.reference.steadyS} s for the same frame -> ${est.speedup >= 1 ? `${est.speedup.toFixed(1)}x faster` : `${(1 / est.speedup).toFixed(1)}x slower`}`);
      say(`   scene setup: ${m.setupS} s here vs ${est.reference.setupS} s on the cloud CPU (one setup per shot, 723 shots)`);
      say('');
      say('   scene            frames   cloud CPU h   THIS PC h (range)');
      for (const r of est.rows) say(`   ${r.scene.padEnd(15)} ${String(r.frames ?? '').padStart(7)}   ${String(r.cpuH ?? '').padStart(10)}   ${r.hours.toFixed(1).padStart(8)}  (${r.low.toFixed(1)}-${r.high.toFixed(1)})`);
      const T = est.total;
      say(`   ${'TOTAL'.padEnd(15)} ${''.padStart(7)}   ${String(Math.round(T.cpuH)).padStart(10)}   ${T.hours.toFixed(1).padStart(8)}  (${T.low.toFixed(0)}-${T.high.toFixed(0)})`);
      say(`\n   => about ${fmtDuration(T.hours * 3600)} of rendering (${(T.hours / 24).toFixed(1)} days non-stop) for one browser,`);
      say('      plus ~3-6 h of encoding the scene files and the final episode.');
      if (m.candidate !== CANDIDATES[0].id) {
        say(`   NOTE: measured on the fallback frame "${m.candidate}" (the F2 style frame could not be built here yet).`);
        say('         F2 (people, dragons, grass) is much closer to the real sets: run this again after the caches are built.');
      }
      say('   ESTIMATE ONLY: one test frame scaled to every set (the cloud figures are themselves estimates');
      say('   for sets that are not built yet). Two browsers at once (the default) are usually a bit faster.');
    } else say(`   ${est.note}`);
    if (a.swiftshader && !a.writeReference) code = 0;
    const different = measurements.filter((x) => x.picture?.verdict === 'DIFFERENT');
    if (different.length && !a.swiftshader) {
      say(`\nPICTURE DIFFERENT (${different.map((x) => x.candidate).join(', ')}): the episode renderer will not start masters until someone`);
      say('has looked at the picture (drag it into the chat with Claude; see the PICTURE CHECK banner above).');
      code = 3;
    }
    if (result.heavyError) { say(`\nTHE HEAVY FRAME (F5) FAILED: ${result.heavyError}`); if (!code) code = 3; }
    if (measurements.some((x) => x.picture?.jpg)) say(`\nPicture for the chat: ${measurements.find((x) => x.picture?.jpg).picture.jpg}`);
    return code;
  } catch (e) {
    say(`\nerror: ${e.message}`);
    if (process.env.DK_DEBUG) console.error(e.stack);
    result.error = e.message;
    code = e.code === 'GPU_SOFTWARE_FALLBACK' ? 2 : 1;
    return code;
  } finally {
    result.exitCode = code;
    fs.writeFileSync(path.join(outDir, 'gpu-check.json'), JSON.stringify(result, null, 1) + '\n');
    say(`\nlog: ${path.relative(PROJECT_ROOT, logFile)}  (send this file back)`);
    fs.writeFileSync(logFile, logLines.join('\n') + '\n');
  }
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
