#!/usr/bin/env node
// Dragons Kingdom renderer CLI.
//
//   node render/render.mjs scenes/test-kingdom.js --preset final
//   node render/render.mjs --still scenes/test-kingdom.js --time 4 --preset final --png out.png
//
// Run with --help for every option.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { parseArgs, num } from './lib/args.mjs';
import { resolvePreset, defaultWorkers, memoryWorkerCap, workerMemoryGB, AA_MODES, PRESETS } from './lib/presets.mjs';
import { checkFfmpeg, PROJECT_ROOT } from './lib/tools.mjs';
import { runJob } from './lib/job.mjs';
import { openSession } from './lib/session.mjs';
import { writePng, maxCrf } from './lib/ffmpeg.mjs';
import { lookupTuning, tuningKey } from './lib/tuning.mjs';
import { fmtDuration } from './lib/progress.mjs';

const HELP = `
Dragons Kingdom renderer - turns a scene file into a video.

  node render/render.mjs <scene.js> [options]
  node render/render.mjs --still <scene.js> --time <seconds> [--preset final] --png <out.png>

Presets (--preset, default "final"):
  draft        960x540     quick look, fastest
  preview      1920x1080   full HD
  final        3840x2160   native 4K
  final-fast   3840x2160   rendered at 2560x1440, upscaled + sharpened to 4K in-shader
                           (~1.4x faster than final on this 4-core CPU: 2.25x fewer pixels to
                           draw, but upscaling, packing and encoding stay at 4K)

Options:
  --seconds S        how much to render (default: the scene's meta.duration minus --start)
  --start S          start time in seconds (default 0)
  --fps N            frames per second (default 24)
  --workers N|auto   parallel headless browsers (default auto = benchmark result or ${defaultWorkers()})
  --crf N            x264 quality, lower = better/bigger (default per preset, 16 for 4K;
                     1..51 at both bit depths; 0 = lossless, plays only in editors/VLC)
  --bit-depth 8|10   8 (default): plays everywhere. 10: H.264 High 10 - smooth skies stay
                     smooth after compression (about 2-3x less banding than 8-bit); for YouTube
                     uploads and editing. Many TVs, phones and browsers cannot play 10-bit H.264.
  --x264-preset P    x264 speed preset (ultrafast..veryslow, default per preset / benchmark)
  --twos             animate "on twos": render every other frame, hold it for 2 frames (~1.8x faster)
  --capture yuv|rgba yuv = pack YUV420 on the GPU (fast, default); rgba = read RGBA, ffmpeg converts
  --no-dither        turn off the anti-banding dither (default: on for 8-bit, off for 10-bit;
                     --dither turns it on for 10-bit)
  --aa MODE          anti-aliasing: ${AA_MODES.join(', ')} (default per preset)
  --audio FILE       add a soundtrack (encoded to AAC, padded/cut to the video length)
  --parts K          also write the episode as K roughly equal part files
  --gpu              use the real GPU instead of SwiftShader (machines with a graphics card)
  --out DIR          job folder (default output/<scene>-<preset>[-twos][-10bit][_<from>s-<to>s]);
                     rerun the same command to resume
  --chunk-seconds S  chunk length (default 10)
  --fresh            throw away finished chunks in the job folder and start over
  --stall-timeout S  restart a browser that delivers no frame for S seconds (default 180,
                     or 20x the usual time per frame if that is longer; 0 = never)
  --size WxH         custom output size (overrides the preset's size, renders natively)
  --sharpness X      final-fast sharpening 0..1 (default 0.5)
  --tone-mapping T   aces | agx | neutral (default: scene's meta.toneMapping or aces)
  --shadow-filter F  tent9 (default) | bilinear4 (fastest) | pcf-soft (three.js) |
                     pcss (contact-hardening: penumbra from the sun's real size, slower)
  --exposure X       exposure multiplier (default: scene's meta.exposure or 1)
  --readback MODE    async (default) | sync
  --no-shadow-cache  ignore the scene's ctx.shadows cache, redraw every shadow map every frame
                     (same pictures, slower - for checking)
  --cinematic MODE   cinematic realism stack: off (faster previews) | on (the scene's meta.cinematic,
                     or the defaults) | default | hero | preview | film | velocity (a preset; overrides the scene's)
  --timing           (with --still) print per-stage GPU timings
  --png FILE         (with --still) where to write the picture
  --time T           (with --still) which moment to render, in seconds
`;

const BOOLEANS = ['still', 'twos', 'dither', 'gpu', 'fresh', 'help', 'timing', 'verbose', 'shadow-cache'];

async function main() {
  const a = parseArgs(process.argv.slice(2), { booleans: BOOLEANS, aliases: { '-h': '--help' } });
  if (a.help || !a._.length) { console.log(HELP); return a.help ? 0 : 1; }
  const scene = path.resolve(a._[0]);
  if (!fs.existsSync(scene)) throw new Error(`scene file not found: ${scene}`);
  const presetName = a.preset || 'final';
  const p = resolvePreset(presetName, { size: a.size });
  const fps = num(a.fps, 'fps', { min: 1 }) ?? 24;
  if (a.aa && !AA_MODES.includes(a.aa)) throw new Error(`--aa must be one of ${AA_MODES.join(', ')}`);
  const capture = a.capture || 'yuv';
  if (!['yuv', 'rgba'].includes(capture)) throw new Error('--capture must be yuv or rgba');
  checkFfmpeg();
  const bitDepth = num(a.bitDepth, 'bit-depth', { int: true }) ?? 8;
  if (bitDepth !== 8 && bitDepth !== 10) throw new Error('--bit-depth must be 8 or 10');

  const common = {
    // dither: on for 8-bit; off for 10-bit, where the rounding error is already
    // 4x smaller and the noise only costs bits (measured: smoother AND smaller)
    scene, preset: p, fps, aa: a.aa, dither: a.dither ?? bitDepth === 8, gpu: !!a.gpu, bitDepth,
    sharpness: num(a.sharpness, 'sharpness', { min: 0 }), toneMapping: a.toneMapping, exposure: num(a.exposure, 'exposure', { min: 0 }),
    readback: a.readback, timing: a.timing, verbose: a.verbose, shadowCache: a.shadowCache ?? true,
    quality: a.shadowFilter ? { shadowFilter: a.shadowFilter } : undefined,
    ...(a.cinematic !== undefined ? { cinematic: a.cinematic } : {}),
  };
  if (a.cinematic !== undefined && !['off', 'on', 'default', 'hero', 'preview', 'film', 'velocity'].includes(a.cinematic)) throw new Error('--cinematic must be off, on, default, hero, preview, film or velocity');
  if (a.shadowFilter && !['tent9', 'bilinear4', 'pcf-soft', 'pcss'].includes(a.shadowFilter)) throw new Error('--shadow-filter must be tent9, bilinear4, pcf-soft or pcss');

  if (a.still) {
    const time = num(a.time, 'time', { min: 0 }) ?? 0;
    const png = path.resolve(a.png || `${path.basename(scene, '.js')}-${presetName}-t${time}.png`);
    const t0 = Date.now();
    const s = await openSession({ ...common, resolved: p });
    try {
      console.log(`renderer: ${s.info.glRenderer}`);
      const frame = Math.round(time * fps);
      const { frames, stats } = await s.render([frame], 'rgba');
      await writePng(frames.get(frame), { width: p.width, height: p.height, out: png });
      console.log(`wrote ${png} (${p.width}x${p.height}, frame ${frame}, ${stats.ms} ms render, ${((Date.now() - t0) / 1000).toFixed(1)} s total)`);
      if (stats.breakdown) console.log('timing (ms):', stats.breakdown);
    } finally { await s.close(); }
    return 0;
  }

  // workers / encoder settings
  const aa = a.aa ?? p.aa;
  let tuned = null;
  let workers;
  if (!a.workers || a.workers === 'auto') {
    tuned = lookupTuning(tuningKey(p, aa, a.gpu));
    workers = tuned?.workers ?? defaultWorkers();
    const cap = memoryWorkerCap(p);
    if (workers > cap) {
      console.log(`workers auto: ${workers} would need ~${(workers * workerMemoryGB(p)).toFixed(0)} GB of RAM, this machine has ${(os.totalmem() / 2 ** 30).toFixed(0)} GB -> using ${cap}`);
      workers = cap;
    }
  } else {
    workers = num(a.workers, 'workers', { min: 1, int: true });
    if (workers > memoryWorkerCap(p)) console.log(`note: ${workers} workers at this size need ~${(workers * workerMemoryGB(p)).toFixed(0)} GB of RAM; this machine has ${(os.totalmem() / 2 ** 30).toFixed(0)} GB`);
  }
  const x264Preset = a.x264Preset || tuned?.x264Preset || p.x264Preset;
  const crf = num(a.crf, 'crf', { min: 0, max: maxCrf(bitDepth) }) ?? p.crf;   // 0 = lossless (encoded as -qp 0)
  if (crf === 0) console.log('note: --crf 0 = lossless. Huge files that play in editors, ffmpeg and VLC, but not on most TVs, phones or web players.');
  const start = num(a.start, 'start', { min: 0 }) ?? 0;
  const seconds = num(a.seconds, 'seconds', { min: 0 });
  const out = a.out ? path.resolve(a.out) : path.join(PROJECT_ROOT, 'output', defaultJobName({ scene, presetName, a, start, seconds, fps, bitDepth }));
  if (tuned) console.log(`workers auto -> ${workers} (from benchmark ${tuned.measuredAt?.slice(0, 10)}), x264 ${x264Preset}`);

  const r = await runJob({
    ...common, workers, x264Preset, crf, capture, bitDepth, twos: !!a.twos, out,
    seconds, start, stallTimeout: num(a.stallTimeout, 'stall-timeout', { min: 0 }),
    audio: a.audio ? path.resolve(a.audio) : null, parts: num(a.parts, 'parts', { min: 1, int: true }),
    chunkSeconds: num(a.chunkSeconds, 'chunk-seconds', { min: 0.1 }), fresh: !!a.fresh,
    maxInFlight: num(a.maxInFlight, 'max-in-flight', { min: 1, int: true }), x264Threads: num(a.x264Threads, 'x264-threads', { min: 1, int: true }),
    explicit: { x264Preset: !!a.x264Preset, crf: a.crf !== undefined },
  });
  if (!r) return 130;
  const v = r.probe;
  console.log(`\ndone: ${r.file}`);
  for (const o of r.outputs.slice(1)) console.log(`part: ${o}`);
  console.log(`video: ${v.width}x${v.height} ${v.codec_name} ${v.pix_fmt} ${v.r_frame_rate} fps, ${v.frames} frames (${fmtDuration(r.seconds)}), ` +
    `${(v.format.size / 1048576).toFixed(1)} MB, color ${v.color_space}/${v.color_transfer}/${v.color_primaries} ${v.color_range}`);
  if (r.renderedFrames) {
    const outFps = (r.frames * (r.renderedFrames / r.uniqueFrames)) / r.renderSeconds;
    console.log(`render: ${r.renderedFrames} frames rendered in ${fmtDuration(r.renderSeconds)} with ${r.workers} worker(s) = ` +
      `${r.renderFps.toFixed(2)} rendered fps, ${outFps.toFixed(2)} output fps -> ${(fps / outFps).toFixed(1)} min of render time per min of video`);
  } else console.log('render: nothing to render (all chunks were reused)');
  return 0;
}

/**
 * Default job folder. Everything that makes a render a DIFFERENT video is in
 * the name, so a quick 3-second preview never lands in (and is never confused
 * with) the folder of the full episode:
 *   test-kingdom-final, test-kingdom-final-twos, test-kingdom-final_4s-7s, ...
 */
function defaultJobName({ scene, presetName, a, start, seconds, fps, bitDepth }) {
  const n = (x) => String(+x.toFixed(3));
  let name = `${path.basename(scene).replace(/\.m?js$/, '')}-${presetName}`;
  if (a.size) name += `-${a.size}`;
  if (fps !== 24) name += `-${n(fps)}fps`;
  if (a.twos) name += '-twos';
  if (bitDepth === 10) name += '-10bit';
  if (start || seconds !== undefined) name += `_${n(start)}s-${seconds !== undefined ? `${n(start + seconds)}s` : 'end'}`;
  return name;
}

main().then((code) => process.exit(code), (e) => {
  console.error(`\nerror: ${e.message}`);
  if (process.env.DK_DEBUG) console.error(e.stack);
  process.exit(1);
});
