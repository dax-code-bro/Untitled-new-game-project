// Chunked, resumable, parallel rendering of a whole timeline.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { startServer } from './server.mjs';
import { RenderWorker } from './worker.mjs';
import { ffmpegSink } from './sinks.mjs';
import { encoderArgs, probeVideo, concatChunks } from './ffmpeg.mjs';
import { runtimeConfig, newId } from './session.mjs';
import { Progress, fmtDuration } from './progress.mjs';
import { PROJECT_ROOT } from './tools.mjs';

/**
 * Split [startFrame, startFrame + totalFrames) into chunks.
 * With twos, output frame o shows rendered frame o - (o % 2) (anchored to the
 * absolute timeline, so a partial render matches a full one).
 */
export function planChunks({ startFrame, totalFrames, chunkFrames, twos }) {
  const chunks = [];
  for (let s = 0; s < totalFrames; s += chunkFrames) {
    const first = startFrame + s;
    const count = Math.min(chunkFrames, totalFrames - s);
    const order = [];
    for (let o = first; o < first + count; o++) {
      const src = twos ? o - (o & 1) : o;
      const last = order[order.length - 1];
      if (last && last.frame === src) last.repeat++;
      else order.push({ frame: src, repeat: 1 });
    }
    chunks.push({ id: chunks.length, first, count, order, attempts: 0, name: `chunk_${String(chunks.length).padStart(5, '0')}` });
  }
  return chunks;
}

/** Split chunk list into K consecutive groups with roughly equal frame totals. */
export function splitParts(chunks, k) {
  const total = chunks.reduce((a, c) => a + c.count, 0);
  const parts = [];
  let cur = [], acc = 0;
  for (const c of chunks) {
    cur.push(c); acc += c.count;
    const target = (total * (parts.length + 1)) / k;
    if (parts.length < k - 1 && acc >= target - c.count / 2) { parts.push(cur); cur = []; }
  }
  if (cur.length) parts.push(cur);
  return parts;
}

function sha1File(f) { return crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex'); }

/**
 * Hash of the scene file plus every local module it imports (recursively,
 * including 'dk/...' helpers) and the runtime itself: if any of it changes,
 * old chunks are not reused.
 */
export function sceneHash(file) {
  const h = crypto.createHash('sha1');
  const seen = new Set();
  const visit = (f) => {
    if (seen.has(f) || !fs.existsSync(f)) return;
    seen.add(f);
    const src = fs.readFileSync(f, 'utf8');
    h.update(path.relative(PROJECT_ROOT, f)).update(src);    // relative: moving the project folder keeps chunks valid
    for (const m of src.matchAll(/(?:import|from)\s*\(?\s*['"]((?:\.{1,2}|dk)\/[^'"]+)['"]/g)) {
      visit(m[1].startsWith('dk/') ? path.join(PROJECT_ROOT, 'runtime', 'lib', m[1].slice(3)) : path.resolve(path.dirname(f), m[1]));
    }
  };
  visit(path.resolve(file));
  for (const f of ['dk-runtime.js', 'post.js', 'page.html']) visit(path.join(PROJECT_ROOT, 'runtime', f));
  return h.digest('hex');
}

/**
 * Run a render job.
 * opts: { scene, preset (resolved), fps, seconds?, start, workers, crf, x264Preset, twos, capture,
 *         dither, aa, audio, parts, gpu, out, chunkSeconds, fresh, readback, log }
 */
export async function runJob(opts) {
  const log = opts.log || ((...a) => console.log(...a));
  const p = opts.preset;
  const sceneFile = path.resolve(opts.scene);
  const outDir = path.resolve(opts.out);
  const jobName = path.basename(outDir);
  const chunksDir = path.join(outDir, 'chunks');
  fs.mkdirSync(chunksDir, { recursive: true });
  const fps = opts.fps;

  const server = await startServer({ allowRoots: [path.dirname(sceneFile)] });
  const initCfg = runtimeConfig(p, opts);
  const workers = [];
  const sinks = new Set();
  let aborted = false;
  let progress = null;

  const cleanup = async () => {
    progress?.stop();
    for (const s of sinks) await s.abort().catch(() => {});
    await Promise.all(workers.map((w) => w.close()));
    await server.close();
    for (const f of fs.readdirSync(chunksDir)) if (f.endsWith('.part')) fs.rmSync(path.join(chunksDir, f), { force: true });
  };
  const onSignal = (sig) => {
    if (aborted) process.exit(130);
    aborted = true;
    process.stderr.write(`\n${sig}: stopping... finished chunks are kept; run the same command again to resume.\n`);
    cleanup().finally(() => process.exit(130));
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    // First worker tells us the scene's meta (duration) - needed to plan.
    const mkWorker = (id) => new RenderWorker({ id, server, sceneFile, init: initCfg, gpu: opts.gpu, log: (...a) => { progress?.clearLine(); console.error(...a); } });
    const w0 = mkWorker(1);
    workers.push(w0);
    const t0 = Date.now();
    const info = await w0.start();
    log(`renderer: ${info.glRenderer}`);
    log(`scene: "${info.meta.title}" (${info.meta.duration}s)  setup ${info.setupMs} ms`);

    const startFrame = Math.round((opts.start || 0) * fps);
    const seconds = opts.seconds ?? Math.max(0, info.meta.duration - (opts.start || 0));
    const totalFrames = Math.round(seconds * fps);
    if (totalFrames <= 0) throw new Error('nothing to render (duration 0)');
    // Chunk length: 10 s by default; short clips are cut into 8 chunks so that
    // several workers can share them. Depends only on the clip length (never on
    // the worker count), so a resumed job always gets the same chunk plan.
    const chunkSeconds = opts.chunkSeconds ?? (seconds >= 80 ? 10 : Math.max(1, seconds / 8));
    let chunkFrames = Math.max(2, Math.round(chunkSeconds * fps));
    if (opts.twos && chunkFrames % 2) chunkFrames++;
    const chunks = planChunks({ startFrame, totalFrames, chunkFrames, twos: opts.twos });

    // ---- fingerprint: reuse chunks only if they were made with the same settings
    const fingerprint = {
      runtime: info.runtime, scene: sceneHash(sceneFile),
      width: p.width, height: p.height, renderWidth: p.renderWidth, renderHeight: p.renderHeight,
      fps, startFrame, totalFrames, chunkFrames, twos: !!opts.twos, capture: opts.capture, dither: initCfg.dither,
      aa: initCfg.aa, sharpness: initCfg.sharpness, quality: initCfg.quality, toneMapping: initCfg.toneMapping ?? null,
      exposure: initCfg.exposure ?? null, crf: opts.crf, x264Preset: opts.x264Preset,
    };
    const jobFile = path.join(outDir, 'job.json');
    let prev = null;
    try { prev = JSON.parse(fs.readFileSync(jobFile, 'utf8')); } catch {}
    // Resuming: keep the encoder settings the job was started with unless the
    // user explicitly asked for others (e.g. a new benchmark picked another
    // x264 preset - that must not throw away hours of finished chunks).
    if (prev?.fingerprint && !opts.fresh) {
      for (const k of ['x264Preset', 'crf']) {
        if (!opts.explicit?.[k] && prev.fingerprint[k] !== undefined && prev.fingerprint[k] !== fingerprint[k]) {
          log(`resuming with the job's original ${k} = ${prev.fingerprint[k]}`);
          fingerprint[k] = prev.fingerprint[k];
          opts[k] = prev.fingerprint[k];
        }
      }
    }
    const fpHash = crypto.createHash('sha1').update(JSON.stringify(fingerprint)).digest('hex');
    if (opts.fresh || (prev && prev.fingerprintHash !== fpHash)) {
      if (prev && !opts.fresh) {
        const changed = Object.keys(fingerprint).filter((k) => JSON.stringify(fingerprint[k]) !== JSON.stringify(prev.fingerprint?.[k]));
        log(`settings changed since the last run (${changed.join(', ')}) -> old chunks discarded`);
      }
      for (const f of fs.readdirSync(chunksDir)) fs.rmSync(path.join(chunksDir, f), { force: true });
    }
    fs.writeFileSync(jobFile, JSON.stringify({ fingerprintHash: fpHash, fingerprint, sceneFile, created: prev?.created ?? new Date().toISOString() }, null, 2));

    // ---- which chunks are already done?
    for (const f of fs.readdirSync(chunksDir)) if (f.endsWith('.part')) fs.rmSync(path.join(chunksDir, f), { force: true });
    let reusedFrames = 0;
    const todo = [];
    for (const c of chunks) {
      const file = path.join(chunksDir, c.name + '.mp4');
      c.file = file;
      if (fs.existsSync(file)) {
        const v = probeVideo(file);
        if (v && v.frames === c.count && v.width === p.width && v.height === p.height) { c.done = true; reusedFrames += c.count; continue; }
        log(`${c.name}: invalid (${v ? `${v.frames}/${c.count} frames` : 'unreadable'}) -> re-render`);
        fs.rmSync(file, { force: true });
      }
      todo.push(c);
    }
    const uniqueTotal = chunks.reduce((a, c) => a + c.order.length, 0);
    log(`job ${jobName}: ${p.width}x${p.height}${p.renderWidth !== p.width ? ` (rendered at ${p.renderWidth}x${p.renderHeight})` : ''} @ ${fps} fps, ` +
      `${totalFrames} frames (${fmtDuration(totalFrames / fps)}), ${chunks.length} chunk(s) of ${chunkFrames}` +
      `${opts.twos ? ', on twos' : ''}, aa=${initCfg.aa}, x264 ${opts.x264Preset} crf ${opts.crf}`);
    if (reusedFrames) log(`resuming: ${chunks.length - todo.length} chunk(s) already finished (${reusedFrames} frames) are reused`);

    // ---- render
    const renderStart = Date.now();
    let renderedUnique = 0;
    if (todo.length) {
      const nWorkers = Math.max(1, Math.min(opts.workers, todo.length));
      for (let i = 2; i <= nWorkers; i++) workers.push(mkWorker(i));
      progress = new Progress({ totalFrames, doneFrames: reusedFrames, workers, fps, twos: opts.twos });
      const queue = [...todo];
      let fatal = null;

      const renderChunk = async (w, c) => {
        const part = path.join(chunksDir, c.name + '.mp4.part');
        const args = encoderArgs({ width: p.width, height: p.height, fps, input: opts.capture, crf: opts.crf, preset: opts.x264Preset, out: part, threads: opts.x264Threads });
        const sink = ffmpegSink(c.order, args, { label: `x264 ${c.name}` });
        sinks.add(sink);
        const sid = newId('c');
        const postBase = server.addSink(sid, sink);
        w.current = { chunk: c, done: 0, total: c.order.length, started: Date.now() };
        sink.onProgress = (s) => {
          w.current.done = s.rendered;
          renderedUnique++;
          progress.frameDone(w, s.outFrames - (w.current.out || 0));
          w.current.out = s.outFrames;
        };
        try {
          const stats = await w.render({ postBase, frames: c.order.map((o) => o.frame), capture: opts.capture, chunkStart: c.first, maxInFlight: opts.maxInFlight });
          if (stats.randomInUpdate) { progress.clearLine(); console.error(`WARNING: the scene called Math.random() ${stats.randomInUpdate}x inside update(); workers will not agree. Use ctx.hash()/ctx.makeRng().`); }
          await sink.finish();
        } catch (e) {
          await sink.abort();
          fs.rmSync(part, { force: true });
          progress.frameDone(w, -(w.current.out || 0));
          renderedUnique -= w.current.done;
          throw e;
        } finally {
          server.removeSink(sid);
          sinks.delete(sink);
          w.current = null;
        }
        const v = probeVideo(part);
        if (!v || v.frames !== c.count) { fs.rmSync(part, { force: true }); throw new Error(`${c.name}: encoded ${v?.frames} frames, expected ${c.count}`); }
        fs.renameSync(part, c.file);   // atomic: a chunk file exists only when it is complete
        c.done = true;
      };

      const loop = async (w) => {
        if (!w.info) {
          try { await w.start(); } catch (e) { progress.clearLine(); console.error(`[w${w.id}] failed to start: ${e.message}`); return; }
        }
        while (queue.length && !fatal && !aborted) {
          const c = queue.shift();
          try {
            await renderChunk(w, c);
          } catch (e) {
            if (aborted) return;
            c.attempts++;
            progress.clearLine();
            console.error(`[w${w.id}] ${c.name} failed (attempt ${c.attempts}): ${e.message.split('\n')[0]}`);
            if (c.attempts >= 3) { fatal = new Error(`${c.name} failed 3 times: ${e.message}`); return; }
            queue.unshift(c);
            try { await w.restart(); } catch (e2) { console.error(`[w${w.id}] restart failed: ${e2.message}`); return; }
          }
        }
      };
      await Promise.all(workers.map(loop));
      progress.stop();
      if (aborted) return null;
      if (fatal) throw fatal;
      const missing = chunks.filter((c) => !c.done);
      if (missing.length) throw new Error(`${missing.length} chunk(s) could not be rendered (all workers failed?)`);
    }
    await Promise.all(workers.map((w) => w.close()));
    const renderSec = (Date.now() - renderStart) / 1000;

    // ---- stitch
    const finalFile = path.join(outDir, `${jobName}.mp4`);
    await concatChunks({ files: chunks.map((c) => c.file), out: finalFile, audio: opts.audio, audioOffset: startFrame / fps, duration: totalFrames / fps, listDir: outDir });
    const v = probeVideo(finalFile);
    if (!v || v.frames !== totalFrames) throw new Error(`final file has ${v?.frames} frames, expected ${totalFrames}`);
    const outputs = [finalFile];
    if (opts.parts && opts.parts > 1) {
      const groups = splitParts(chunks, Math.min(opts.parts, chunks.length));
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        const f = path.join(outDir, `${jobName}_part${i + 1}of${groups.length}.mp4`);
        const frames = g.reduce((a, c) => a + c.count, 0);
        await concatChunks({ files: g.map((c) => c.file), out: f, audio: opts.audio, audioOffset: g[0].first / fps, duration: frames / fps, listDir: outDir });
        const pv = probeVideo(f);
        if (!pv || pv.frames !== frames) throw new Error(`${path.basename(f)} has ${pv?.frames} frames, expected ${frames}`);
        outputs.push(f);
      }
    }
    const total = (Date.now() - t0) / 1000;
    const result = {
      file: finalFile, outputs, frames: totalFrames, uniqueFrames: uniqueTotal, renderedFrames: renderedUnique,
      seconds: totalFrames / fps, renderSeconds: renderSec, totalSeconds: total, workers: workers.length,
      renderFps: renderedUnique / renderSec, outputFps: renderedUnique ? (totalFrames - reusedFrames) / renderSec : null,
      probe: v,
    };
    return result;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    if (!aborted) await cleanup();
  }
}
