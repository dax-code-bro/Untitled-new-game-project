#!/usr/bin/env node
// Benchmark: how many parallel browsers (workers) and which x264 speed preset
// give the most frames per second on THIS machine, for one render preset.
// The winner is cached in .dk-tuning.json and used by "--workers auto".
//
//   node render/bench.mjs                      # preset final, test scene
//   node render/bench.mjs --preset final-fast --frames 8 --workers 1,2,3,4
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { parseArgs, num } from './lib/args.mjs';
import { resolvePreset, AA_MODES } from './lib/presets.mjs';
import { PROJECT_ROOT, checkFfmpeg } from './lib/tools.mjs';
import { startServer } from './lib/server.mjs';
import { RenderWorker } from './lib/worker.mjs';
import { ffmpegSink } from './lib/sinks.mjs';
import { encoderArgs } from './lib/ffmpeg.mjs';
import { runtimeConfig, newId } from './lib/session.mjs';
import { writeTuning, tuningKey, TUNING_FILE } from './lib/tuning.mjs';

const a = parseArgs(process.argv.slice(2), { booleans: ['gpu', 'save', 'help', 'twos'] });
if (a.help) {
  console.log(`node render/bench.mjs [--preset final] [--scene scenes/test-kingdom.js] [--frames 6]
  [--workers 1,2,3,4] [--x264 veryfast,faster,fast,medium] [--aa fxaa] [--gpu] [--no-save]`);
  process.exit(0);
}
checkFfmpeg();
const presetName = a.preset || 'final';
const p = resolvePreset(presetName, { size: a.size });
const scene = path.resolve(a.scene || path.join(PROJECT_ROOT, 'scenes', 'test-kingdom.js'));
const framesPer = num(a.frames, 'frames', { min: 1, int: true }) ?? 6;
const workerList = (a.workers || '1,2,3,4').split(',').map((x) => num(x, 'workers', { min: 1, int: true }));
const x264List = (a.x264 || 'veryfast,faster,fast,medium').split(',');
const aa = a.aa ?? p.aa;
if (!AA_MODES.includes(aa)) throw new Error(`--aa must be one of ${AA_MODES}`);
const fps = num(a.fps, 'fps', { min: 1 }) ?? 24;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-bench-'));

const server = await startServer({ allowRoots: [path.dirname(scene)] });
const initCfg = runtimeConfig(p, { aa, fps, gpu: a.gpu });

async function trial(nWorkers, x264Preset) {
  const workers = Array.from({ length: nWorkers }, (_, i) => new RenderWorker({ id: i + 1, server, sceneFile: scene, init: initCfg, gpu: a.gpu }));
  try {
    await Promise.all(workers.map((w) => w.start()));
    // warm-up: first frame JIT-compiles every shader
    await Promise.all(workers.map(async (w, i) => {
      const sink = ffmpegSink([{ frame: i, repeat: 1 }], encoderArgs({ width: p.width, height: p.height, fps, preset: x264Preset, crf: p.crf, out: path.join(tmp, `warm${i}.mp4`) }));
      const sid = newId('b');
      const sinkUrl = server.addSink(sid, sink);
      await w.render({ sinkUrl, frames: [i] });
      await sink.finish();
      server.removeSink(sid);
    }));
    const t0 = Date.now();
    await Promise.all(workers.map(async (w, i) => {
      const frames = Array.from({ length: framesPer }, (_, k) => 24 + i * framesPer + k);   // different frames per worker
      const order = frames.map((f) => ({ frame: f, repeat: a.twos ? 2 : 1 }));
      const sink = ffmpegSink(order, encoderArgs({ width: p.width, height: p.height, fps, preset: x264Preset, crf: p.crf, out: path.join(tmp, `w${i}.mp4`) }));
      const sid = newId('b');
      const sinkUrl = server.addSink(sid, sink);
      await w.render({ sinkUrl, frames });
      await sink.finish();
      server.removeSink(sid);
    }));
    const sec = (Date.now() - t0) / 1000;
    return { workers: nWorkers, x264Preset, frames: nWorkers * framesPer, seconds: sec, fps: (nWorkers * framesPer) / sec };
  } finally {
    await Promise.all(workers.map((w) => w.close()));
  }
}

const hold = a.twos ? 2 : 1;   // --twos: every rendered frame fills 2 output frames
const line = (r) => `  workers ${r.workers}  x264 ${r.x264Preset.padEnd(9)} ${r.fps.toFixed(3)} rendered fps${a.twos ? ` = ${(r.fps * hold).toFixed(3)} output fps (twos)` : ''}  (${(r.seconds / (r.frames / r.workers)).toFixed(2)} s per frame per worker)  -> ${(fps / (r.fps * hold)).toFixed(1)} min render per min of video`;
console.log(`benchmark: ${presetName} ${p.width}x${p.height}${p.renderWidth !== p.width ? ` (rendered ${p.renderWidth}x${p.renderHeight})` : ''}, aa=${aa}, ${framesPer} frames per worker, ${os.cpus().length} CPU threads`);
const results = [];
try {
  const baseX264 = x264List.includes(p.x264Preset) ? p.x264Preset : x264List[0];
  for (const n of workerList) {
    const r = await trial(n, baseX264);
    results.push(r);
    console.log(line(r));
  }
  const top = Math.max(...results.map((r) => r.fps));
  const best = results.filter((r) => r.fps >= top * 0.97).sort((x, y) => x.workers - y.workers)[0];   // fewest workers within 3% of the top
  console.log(`best worker count: ${best.workers}`);
  const encResults = [best];
  for (const xp of x264List) {
    if (xp === baseX264) continue;
    const r = await trial(best.workers, xp);
    encResults.push(r);
    results.push(r);
    console.log(line(r));
  }
  const order = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'];
  const encTop = Math.max(...encResults.map((r) => r.fps));
  // the slowest (= best compression) x264 preset that costs at most 5% throughput
  const chosen = encResults.filter((r) => r.fps >= encTop * 0.95).sort((x, y) => order.indexOf(y.x264Preset) - order.indexOf(x.x264Preset))[0];
  console.log(`\nchosen: ${chosen.workers} workers, x264 ${chosen.x264Preset}: ${chosen.fps.toFixed(3)} rendered fps = ${(fps / (chosen.fps * hold)).toFixed(1)} min of render time per min of video`);
  if (a.save !== false && !a.twos) {
    writeTuning(tuningKey(p, aa, a.gpu), { workers: chosen.workers, x264Preset: chosen.x264Preset, fps: +chosen.fps.toFixed(4), framesPerWorker: framesPer, results });
    console.log(`saved to ${TUNING_FILE} (used by --workers auto for preset ${presetName}, aa ${aa})`);
  }
} finally {
  await server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(0);
