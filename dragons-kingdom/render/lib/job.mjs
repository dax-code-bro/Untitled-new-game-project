// Chunked, resumable, parallel rendering of a whole timeline.
//
// Safety rules (each one exists because losing hours of 4K rendering hurts):
//  * One job folder = one job. A lock file stops a second run on the same
//    folder. If the folder holds chunks of a DIFFERENT job (other scene, other
//    clip range, other settings, edited scene files, other renderer) nothing is
//    deleted: the run stops and says what differs, unless --fresh is given.
//  * A chunk becomes chunk_NNNNN.mp4 only after it was fully decoded and
//    checked (exact frame count, no decoder errors) and flushed to disk. Its
//    size + SHA-1 go into job.json, so a resumed job trusts it only if the
//    bytes are unchanged (otherwise it is decoded and checked again).
//  * The final file is stitched to a temp name and checked before it gets
//    its real name; if a chunk turns out to be bad, it is re-rendered.
//  * A stall watchdog restarts a worker that has not delivered a frame for a
//    long time (endless loop in update(), frozen or crashed browser).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { startServer } from './server.mjs';
import { RenderWorker } from './worker.mjs';
import { ffmpegSink } from './sinks.mjs';
import { encoderArgs, verifyVideo, probeVideo, concatChunks, FrameCountError, audioProblem, fsyncFile, fsyncDir } from './ffmpeg.mjs';
import { runtimeConfig, newId } from './session.mjs';
import { Progress, fmtDuration } from './progress.mjs';
import { PROJECT_ROOT } from './tools.mjs';

export const JOB_FORMAT = 2;      // bump when job.json / chunk layout changes

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

const sha1File = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const rel = (f) => path.relative(PROJECT_ROOT, f).split(path.sep).join('/');   // relative: moving the project folder keeps jobs valid

// ------------------------------------------------------------------ lock ---
function pidAlive(pid) {
  try { process.kill(pid, 0); } catch (e) { return e.code === 'EPERM'; }
  try {   // a reused pid that is not a node process is not our renderer
    const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    return /node/.test(cmd);
  } catch { return true; }
}

/** Exclusive lock on a job folder. Returns release(). Stale locks (dead pid) are taken over. */
export function lockJob(dir) {
  const file = path.join(dir, 'job.lock');
  for (let i = 0; i < 3; i++) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, host: os.hostname(), started: new Date().toISOString() }) + '\n');
      fs.closeSync(fd);
      let released = false;
      const release = () => { if (!released) { released = true; try { fs.rmSync(file, { force: true }); } catch {} process.off('exit', release); } };
      process.on('exit', release);
      return release;
    } catch (e) { if (e.code !== 'EEXIST') throw e; }
    let info = null;
    try { info = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    if (info && info.host !== os.hostname()) {
      throw new Error(`${dir} is in use by a render on computer "${info.host}" (pid ${info.pid}, since ${info.started}).\n` +
        `  If that render is not running any more, delete ${file} and try again.`);
    }
    if (info && info.pid !== process.pid && pidAlive(info.pid)) {
      throw new Error(`this job is already being rendered by another process (pid ${info.pid}, started ${info.started}).\n` +
        `  Wait for it to finish, stop it (Ctrl+C in its window), or use --out to render into another folder.`);
    }
    fs.rmSync(file, { force: true });   // stale: the process that held it is gone
  }
  throw new Error(`could not lock ${dir}`);
}

// ----------------------------------------------------------- fingerprint ---
// fingerprint.files = { file: sha1 } of everything the browsers loaded during
// setup (runtime, scene modules, JSON, textures - the bytes really served, see
// server.mjs "Snapshots"); fingerprint.lazy = files this job loaded only later
// (e.g. a dynamic import() in update() for a later shot). lazy is carried over
// only while the SAME job is resumed: a --fresh start or a different job starts
// with an empty list, so files of an old, unrelated render never linger in it.
const hashOnDisk = (f) => { try { return sha1File(path.resolve(PROJECT_ROOT, f)); } catch { return 'missing'; } };
const relKeys = (abs) => Object.fromEntries(Object.entries(abs).map(([f, h]) => [rel(f), h]).sort(([a], [b]) => (a < b ? -1 : 1)));
const listFiles = (fs_) => `${fs_.slice(0, 6).join(', ')}${fs_.length > 6 ? `, +${fs_.length - 6} more` : ''}`;

/**
 * Human-readable list of what differs between two fingerprints.
 * Returns { changes: [...], onlyFiles: bool } - onlyFiles: every difference is
 * an edited file (undoing the edit would let the job resume).
 */
function describeChanges(prev, cur) {
  const out = [];
  if (prev.format !== cur.format) return { changes: ['made by an older version of the renderer'], onlyFiles: false };
  if (prev.scene !== cur.scene) out.push(`scene file (was ${prev.scene}, now ${cur.scene})`);
  for (const k of new Set([...Object.keys(prev.settings || {}), ...Object.keys(cur.settings)])) {
    const a = JSON.stringify(prev.settings?.[k]), b = JSON.stringify(cur.settings[k]);
    if (a !== b) out.push(`${k} (${a ?? '-'} -> ${b ?? '-'})`);
  }
  for (const k of new Set([...Object.keys(prev.renderer || {}), ...Object.keys(cur.renderer)])) {
    const a = JSON.stringify(prev.renderer?.[k]), b = JSON.stringify(cur.renderer[k]);
    if (a !== b) out.push(`renderer ${k} (${a ?? '-'} -> ${b ?? '-'})`);
  }
  const nonFile = out.length;
  const edited = [];
  // files loaded during setup: the same set with the same bytes
  for (const f of new Set([...Object.keys(prev.files || {}), ...Object.keys(cur.files)])) {
    if (prev.files?.[f] !== cur.files[f]) edited.push(f);
  }
  // files the previous run(s) loaded later than setup: still the same on disk?
  for (const [f, h] of Object.entries(prev.lazy || {})) {
    if (!(f in cur.files) && hashOnDisk(f) !== h) edited.push(f);
  }
  if (edited.length) out.push(`scene/runtime files edited: ${listFiles(edited)}`);
  return { changes: out, onlyFiles: nonFile === 0 && edited.length > 0, edited };
}

function writeJson(file, obj) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

/**
 * Run a render job.
 * opts: { scene, preset (resolved), fps, seconds?, start, workers, crf, x264Preset, twos, capture,
 *         bitDepth, dither, aa, audio, parts, gpu, out, chunkSeconds, fresh, readback, stallTimeout, log }
 */
export async function runJob(opts) {
  const log = opts.log || ((...a) => console.log(...a));
  const p = opts.preset;
  const sceneFile = path.resolve(opts.scene);
  const outDir = path.resolve(opts.out);
  const jobName = path.basename(outDir);
  const chunksDir = path.join(outDir, 'chunks');
  const fps = opts.fps;
  const bitDepth = opts.bitDepth ?? 8;
  const capture = opts.capture === 'rgba' ? 'rgba' : bitDepth === 10 ? 'yuv10' : 'yuv';

  // fail fast: a typo in --audio must not surface after hours of rendering
  if (opts.audio) {
    const prob = audioProblem(opts.audio);
    if (prob) throw new Error(`--audio ${opts.audio}: ${prob}`);
  }

  fs.mkdirSync(chunksDir, { recursive: true });
  const unlock = lockJob(outDir);

  let server;
  try { server = await startServer({ allowRoots: [path.dirname(sceneFile)] }); } catch (e) { unlock(); throw e; }
  const initCfg = runtimeConfig(p, opts);
  const workers = [];
  const sinks = new Set();
  let aborted = false;
  let progress = null;
  let watchdog = null;

  const cleanup = async () => {
    progress?.stop();
    clearInterval(watchdog);
    for (const s of sinks) await s.abort().catch(() => {});
    await Promise.all(workers.map((w) => w.close()));
    await server.close();
    try { for (const f of fs.readdirSync(chunksDir)) if (f.endsWith('.part')) fs.rmSync(path.join(chunksDir, f), { force: true }); } catch {}
    unlock();
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

    // ---- fingerprint: reuse chunks only if they were made the same way
    const jobFile = path.join(outDir, 'job.json');
    let prev = null;
    try { prev = JSON.parse(fs.readFileSync(jobFile, 'utf8')); } catch {}
    const prevFp = prev?.fingerprint && prev.format === JOB_FORMAT ? prev.fingerprint : null;
    const settings = {
      width: p.width, height: p.height, renderWidth: p.renderWidth, renderHeight: p.renderHeight,
      fps, startFrame, totalFrames, chunkFrames, twos: !!opts.twos, capture, bitDepth, dither: initCfg.dither,
      aa: initCfg.aa, sharpness: initCfg.sharpness, quality: initCfg.quality, toneMapping: initCfg.toneMapping ?? null,
      exposure: initCfg.exposure ?? null, crf: opts.crf, x264Preset: opts.x264Preset,
      ...(initCfg.cinematic !== undefined ? { cinematic: initCfg.cinematic } : {}),
    };
    // Resuming: keep the encoder settings the job was started with unless the
    // user explicitly asked for others (e.g. a new benchmark picked another
    // x264 preset - that must not stop hours of finished chunks being reused).
    if (prevFp && !opts.fresh) {
      for (const k of ['x264Preset', 'crf']) {
        if (!opts.explicit?.[k] && prevFp.settings?.[k] !== undefined && prevFp.settings[k] !== settings[k]) {
          log(`resuming with the job's original ${k} = ${prevFp.settings[k]}`);
          settings[k] = prevFp.settings[k];
          opts[k] = prevFp.settings[k];
        }
      }
    }
    const fingerprint = {
      format: JOB_FORMAT,
      scene: rel(sceneFile),
      settings,
      renderer: { gpu: !!opts.gpu, glRenderer: info.glRenderer, browser: info.browserVersion, three: info.three, runtime: info.runtime },
      // every file the browser loaded during setup: runtime, scene modules, JSON, textures...
      files: relKeys(await server.servedHashes()),
      lazy: {},
    };
    const finished = () => fs.readdirSync(chunksDir).filter((f) => /^chunk_\d+\.mp4$/.test(f));
    const finalFile = path.join(outDir, `${jobName}.mp4`);
    const diff = prev ? (prevFp ? describeChanges(prevFp, fingerprint) : { changes: ['made by an older version of the renderer'] }) : { changes: [] };
    const changes = diff.changes;
    let manifest = {};
    if (opts.fresh) {
      for (const f of fs.readdirSync(chunksDir)) fs.rmSync(path.join(chunksDir, f), { force: true });
      if (prev) log('--fresh: old chunks deleted');
    } else if (changes.length) {
      const n = finished().length;
      if (n || fs.existsSync(finalFile)) {
        const what = n ? `${n} finished chunk(s)${fs.existsSync(finalFile) ? ' and a finished video' : ''}` : 'a finished video';
        const err = new Error(`${path.relative(process.cwd(), outDir) || outDir} already holds ${what} of a DIFFERENT render - nothing was deleted.\n` +
          `  what differs: ${changes.join('; ')}\n` +
          (diff.onlyFiles ? `  - to continue that render, undo the edits to ${listFiles(diff.edited)} and run the same command again\n` : '') +
          `  - to keep that render, write this one somewhere else:   --out output/<new-name>\n` +
          `  - to throw that render away and start over here:        add --fresh`);
        err.code = 'JOB_MISMATCH';
        throw err;
      }
      for (const f of fs.readdirSync(chunksDir)) fs.rmSync(path.join(chunksDir, f), { force: true });   // nothing finished: nothing to lose
    } else {
      manifest = prev?.chunks || {};
      // the same job resumed: keep the files earlier runs loaded after setup
      for (const [f, h] of Object.entries(prevFp?.lazy || {})) if (!(f in fingerprint.files)) fingerprint.lazy[f] = h;
    }
    const job = { format: JOB_FORMAT, fingerprint, sceneFile: rel(sceneFile), created: (!opts.fresh && !changes.length && prev?.created) || new Date().toISOString(), chunks: manifest };
    const saveJob = () => writeJson(jobFile, job);
    saveJob();

    // ---- which chunks are already done?
    for (const f of fs.readdirSync(chunksDir)) if (f.endsWith('.part')) fs.rmSync(path.join(chunksDir, f), { force: true });
    let reusedFrames = 0;
    const todo = [];
    for (const c of chunks) {
      const file = path.join(chunksDir, c.name + '.mp4');
      c.file = file;
      if (fs.existsSync(file)) {
        const m = manifest[c.name];
        let why;
        if (m && m.frames === c.count && m.size === fs.statSync(file).size && m.sha1 === sha1File(file)) { c.done = true; reusedFrames += c.count; continue; }
        // unknown or changed bytes: decode it completely before trusting it
        const v = verifyVideo(file, { frames: c.count, width: p.width, height: p.height });
        if (v.ok) {
          manifest[c.name] = { frames: c.count, size: fs.statSync(file).size, sha1: sha1File(file) };
          c.done = true; reusedFrames += c.count; continue;
        }
        why = v.reason;
        log(`${c.name}: damaged (${why}) -> re-render`);
        fs.rmSync(file, { force: true });
        delete manifest[c.name];
      }
      todo.push(c);
    }
    for (const name of Object.keys(manifest)) if (!chunks.some((c) => c.name === name && c.done)) delete manifest[name];
    saveJob();
    const uniqueTotal = chunks.reduce((a, c) => a + c.order.length, 0);
    log(`job ${jobName}: ${p.width}x${p.height}${p.renderWidth !== p.width ? ` (rendered at ${p.renderWidth}x${p.renderHeight})` : ''} @ ${fps} fps, ` +
      `${totalFrames} frames (${fmtDuration(totalFrames / fps)}), ${chunks.length} chunk(s) of ${chunkFrames}` +
      `${opts.twos ? ', on twos' : ''}, aa=${initCfg.aa}, ${bitDepth}-bit, x264 ${opts.x264Preset} crf ${opts.crf}`);
    if (reusedFrames) log(`resuming: ${chunks.length - todo.length} chunk(s) already finished (${reusedFrames} frames) are reused`);

    // ---- render
    let renderMs = 0;          // time spent in render passes (not stitching)
    let renderedUnique = 0;
    const warned = new Set();
    const warnMisuse = (stats) => {
      const msgs = {
        randomInUpdate: 'the scene called Math.random() inside update()',
        rngInUpdate: 'the scene called ctx.rng() (or a generator made in setup) inside update()',
        clockInUpdate: 'the scene read the clock (Date.now/performance.now) inside update()',
      };
      for (const [k, msg] of Object.entries(msgs)) {
        if (stats[k] && !warned.has(k)) {
          warned.add(k);
          progress?.clearLine();
          console.error(`WARNING: ${msg} (${stats[k]}x in one chunk). Frames then depend on what was rendered before,\n` +
            `         so chunks/workers will not match. Use ctx.hash(frame, i) or ctx.makeRng(seed) created inside update().`);
        }
      }
    };

    // stall watchdog: typical time between two frames of one worker
    const intervals = [];
    const typicalInterval = () => {
      if (!intervals.length) return 0;
      const s = [...intervals].sort((a, b) => a - b);
      return s[s.length >> 1];
    };
    const stallLimitMs = (first) => {
      if (opts.stallTimeout === 0) return Infinity;
      const base = Math.max((opts.stallTimeout ?? 180) * 1000, 20 * typicalInterval());
      return first ? 2 * base : base;   // the first frame of a chunk also starts the encoder / simulation warm-up
    };

    // Files loaded after setup become part of the fingerprint (fingerprint.lazy).
    // One loaded now with other bytes than an earlier run of this job got means
    // it was edited in between: the chunks would not match - stop.
    // Files edited on disk while rendering are reported once: this job keeps
    // using the bytes it started with (server snapshots), so the video stays
    // consistent; the next run of the command notices the edit.
    const warnedEdits = new Set();
    const trackFiles = async () => {
      for (const [f, h] of Object.entries(relKeys(await server.servedHashes()))) {
        if (f in fingerprint.files) continue;
        if (fingerprint.lazy[f] !== undefined && fingerprint.lazy[f] !== h) {
          throw Object.assign(new Error(`${f} was loaded with different content than in an earlier run of this job (edited in between?).\n` +
            '  The finished chunks were made with the old version. Undo the edit and run the command again, or start over with --fresh.'), { fatal: true });
        }
        fingerprint.lazy[f] = h;
      }
      for (const abs of await server.diskChanges()) {
        const f = rel(abs);
        if (warnedEdits.has(f)) continue;
        warnedEdits.add(f);
        progress?.clearLine();
        console.error(`NOTE: ${f} was changed on disk while this job is rendering. The job keeps using the version it\n` +
          '      started with, so the whole video stays consistent. To render the new version, run the command\n' +
          '      again when this job is done: it will list the edit and you can start over with --fresh (or use --out).');
      }
    };

    const renderChunks = async (list) => {
      const passStart = Date.now();
      const nWorkers = Math.max(1, Math.min(opts.workers, list.length));
      for (let i = workers.length + 1; i <= nWorkers; i++) workers.push(mkWorker(i));
      const active = workers.slice(0, nWorkers);
      const doneFrames = chunks.filter((c) => c.done).reduce((a, c) => a + c.count, 0);
      progress = new Progress({ totalFrames, doneFrames, workers: active, fps, twos: opts.twos });
      const queue = [...list];
      let fatal = null;

      const renderChunk = async (w, c) => {
        const part = path.join(chunksDir, c.name + '.mp4.part');
        const args = encoderArgs({ width: p.width, height: p.height, fps, input: capture, bitDepth, crf: opts.crf, preset: opts.x264Preset, out: part, threads: opts.x264Threads });
        const sink = ffmpegSink(c.order, args, { label: `x264 ${c.name}` });
        sinks.add(sink);
        const sid = newId('c');
        const sinkUrl = server.addSink(sid, sink);
        const now = Date.now();
        w.current = { chunk: c, done: 0, total: c.order.length, started: now, lastFrameAt: now };
        sink.onProgress = (s) => {
          const t = Date.now();
          if (w.current.done) { intervals.push(t - w.current.lastFrameAt); if (intervals.length > 60) intervals.shift(); }
          w.current.lastFrameAt = t;
          w.current.done = s.rendered;
          renderedUnique++;
          progress.frameDone(w, s.outFrames - (w.current.out || 0));
          w.current.out = s.outFrames;
          w.current.warmup = null;
        };
        // chunk-warmup replay before the first frame: alive, not stuck
        sink.onHeartbeat = (m) => { if (w.current) { w.current.aliveAt = Date.now(); w.current.warmup = m; progress.alive(); } };
        try {
          // chunkStart = the first frame actually rendered: with --twos and an
          // odd chunk start that is the even frame just before c.first
          const stats = await w.render({ sinkUrl, frames: c.order.map((o) => o.frame), capture, chunkStart: c.order[0].frame, maxInFlight: opts.maxInFlight });
          warnMisuse(stats);
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
        // decode the whole chunk before trusting it
        const v = verifyVideo(part, { frames: c.count, width: p.width, height: p.height });
        if (!v.ok) { fs.rmSync(part, { force: true }); throw new Error(`${c.name}: encoded file failed the check: ${v.reason}`); }
        try { await trackFiles(); } catch (e) { fs.rmSync(part, { force: true }); throw e; }   // before the chunk counts as finished
        fsyncFile(part);
        fs.renameSync(part, c.file);   // atomic: a chunk file exists only when it is complete
        fsyncDir(chunksDir);
        c.done = true;
        manifest[c.name] = { frames: c.count, size: fs.statSync(c.file).size, sha1: sha1File(c.file) };
        saveJob();
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
            if (e.fatal) { fatal = e; return; }
            c.attempts++;
            progress.clearLine();
            console.error(`[w${w.id}] ${c.name} failed (attempt ${c.attempts}/3): ${e.message.split('\n')[0]}`);
            if (c.attempts >= 3) { fatal = new Error(`${c.name} failed 3 times: ${e.message}`); return; }
            queue.unshift(c);
            try { await w.restart(); } catch (e2) { console.error(`[w${w.id}] restart failed: ${e2.message}`); return; }
          }
        }
      };

      watchdog = setInterval(() => {
        const now = Date.now();
        for (const w of active) {
          const cur = w.current;
          if (!cur || w.dead) continue;
          const limit = stallLimitMs(cur.done === 0);
          const idle = now - Math.max(cur.lastFrameAt, cur.aliveAt || 0);
          if (idle > limit) {
            progress.clearLine();
            const why = `no frame finished for ${fmtDuration(idle / 1000)} (scene stuck in update()? frozen browser?)`;
            console.error(`[w${w.id}] ${cur.chunk.name}: ${why} - restarting this worker`);
            w.kill(why);
          }
        }
      }, 2000);
      watchdog.unref?.();
      try {
        await Promise.all(active.map(loop));
      } finally {
        clearInterval(watchdog);
        progress.stop();
        renderMs += Date.now() - passStart;
      }
      // browsers are not needed while stitching: free their memory now
      if (!aborted) await Promise.all(workers.map((w) => w.close()));
      if (aborted) return false;
      if (fatal) throw fatal;
      const missing = list.filter((c) => !c.done);
      if (missing.length) throw new Error(`${missing.length} chunk(s) could not be rendered (all workers failed?)`);
      return true;
    };

    if (todo.length && !(await renderChunks(todo))) return null;
    await Promise.all(workers.map((w) => w.close()));

    // ---- stitch (with one self-repair round if a chunk turns out to be bad)
    const stitch = () => concatChunks({ files: chunks.map((c) => c.file), out: finalFile, audio: opts.audio, audioOffset: startFrame / fps, duration: totalFrames / fps, listDir: outDir, expectFrames: totalFrames });
    try {
      await stitch();
    } catch (e) {
      if (!(e instanceof FrameCountError)) throw e;
      log(`stitching check failed (${e.message}) - checking every chunk...`);
      const bad = [];
      for (const c of chunks) {
        const v = verifyVideo(c.file, { frames: c.count, width: p.width, height: p.height });
        if (!v.ok) { log(`${c.name}: damaged (${v.reason}) -> re-render`); fs.rmSync(c.file, { force: true }); delete manifest[c.name]; c.done = false; c.attempts = 0; bad.push(c); }
      }
      saveJob();
      if (!bad.length) throw new Error(`${e.message}; all chunks look fine - please report this`);
      if (!(await renderChunks(bad))) return null;
      await stitch();
    }
    const renderSec = renderMs / 1000;
    const v = probeVideo(finalFile);
    const outputs = [finalFile];
    if (opts.parts && opts.parts > 1) {
      const groups = splitParts(chunks, Math.min(opts.parts, chunks.length));
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        const f = path.join(outDir, `${jobName}_part${i + 1}of${groups.length}.mp4`);
        const frames = g.reduce((a, c) => a + c.count, 0);
        await concatChunks({ files: g.map((c) => c.file), out: f, audio: opts.audio, audioOffset: g[0].first / fps, duration: frames / fps, listDir: outDir, expectFrames: frames });
        outputs.push(f);
      }
    }
    const total = (Date.now() - t0) / 1000;
    return {
      file: finalFile, outputs, frames: totalFrames, uniqueFrames: uniqueTotal, renderedFrames: renderedUnique,
      seconds: totalFrames / fps, renderSeconds: renderSec, totalSeconds: total, workers: workers.length,
      renderFps: renderedUnique / renderSec, outputFps: renderedUnique ? (totalFrames - reusedFrames) / renderSec : null,
      probe: v,
    };
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    if (!aborted) await cleanup();
  }
}
