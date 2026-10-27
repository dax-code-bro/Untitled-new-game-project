#!/usr/bin/env node
// Shot director - DAILIES: render many shots of a set from ONE browser setup (the set is built once,
// then every shot is a list of frames of the same page), each shot into its own video file, or one
// still per shot for a contact sheet. For the draft cut and for review; the masters are rendered
// shot by shot by render/episode.mjs (render.mjs --start <start_s> --seconds <frames/24>), which
// gives the same pictures for the same settings (update(t) is a pure function of the frame).
//
//   node scenes/lib/director/tools/render-shots.mjs                      every rendered shot of the cut (edl.json)
//   node scenes/lib/director/tools/render-shots.mjs --only 1A-04,1A-05   just these
//   node scenes/lib/director/tools/render-shots.mjs --sets SEA_COAST_DAWN --twos
//   node scenes/lib/director/tools/render-shots.mjs --stills 0.1,0.5,0.9 --sets BIRTHING_CHAMBER   review stills + contact sheet
//
// Options
//   --preset draft|preview|final  (default draft)      --cinematic velocity|preview|off|default|hero (default velocity:
//                                                        the masters' look; preview = no motion blur / AO, faster)
//   --twos            draw every other frame (an animatic; never for masters, SERIES.md s2)
//   --workers N       browsers per set (default 1; each builds the set once; 2 gain ~10% on 4 cores)
//   --work DIR        where shot files go (default output/director/<preset>; shots/<job>.mp4 + .json)
//   --redo-on shot|set|core   re-render a finished shot when its own spec changed (shot), also when the set
//                     builder / cast / defaults changed (set, default), also when the director core changed (core)
//   --force           re-render even if finished      --dry-run   list what would be rendered
//   --stills U,U      render stills at these fractions of each shot instead of videos (PNG + a contact sheet)
//   --timings FILE    measured seconds per frame go here (default episodes/s01e01/final/cut/timings.json; only
//                     written for video renders of the draft preset)
// Interrupt (Ctrl+C) and run again: finished shots are kept.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from '../../../../render/lib/server.mjs';
import { RenderWorker } from '../../../../render/lib/worker.mjs';
import { ffmpegSink, memorySink } from '../../../../render/lib/sinks.mjs';
import { encoderArgs, verifyVideo, writePng } from '../../../../render/lib/ffmpeg.mjs';
import { runtimeConfig, newId } from '../../../../render/lib/session.mjs';
import { resolvePreset } from '../../../../render/lib/presets.mjs';
import { checkFfmpeg, ffmpegPath } from '../../../../render/lib/tools.mjs';
import { SETS } from '../registry.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIRECTOR = path.resolve(HERE, '..');
const ROOT = path.resolve(HERE, '../../../..');
const FINAL = path.join(ROOT, 'episodes/s01e01/final');
const SCENES = path.join(FINAL, 'scenes');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
const FPS = 24;

// ------------------------------------------------------------------ args ---
const argv = process.argv.slice(2);
const opt = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const flag = (n) => argv.includes(n);
const PRESET = opt('--preset', 'draft');
const CINE = opt('--cinematic', 'velocity');
const TWOS = flag('--twos');
const WORKERS = Math.max(1, +opt('--workers', 1));
const FORCE = flag('--force'), DRY = flag('--dry-run');
const REDO = opt('--redo-on', 'set');
const STILLS = opt('--stills') ? opt('--stills').split(',').map(Number) : null;
const ONLY = opt('--only') ? new Set(opt('--only').split(',')) : null;
const SETS_F = opt('--sets') ? new Set(opt('--sets').split(',')) : null;
const WORK = path.resolve(opt('--work', path.join(ROOT, 'output/director', PRESET)));
const TIMINGS = path.resolve(opt('--timings', path.join(FINAL, 'cut/timings.json')));
if (!['shot', 'set', 'core'].includes(REDO)) throw new Error('--redo-on must be shot, set or core');

// ----------------------------------------------------------------- plan ---
const edl = readJson(path.join(FINAL, 'cut/edl.json'));
const tables = fs.readdirSync(SCENES).filter((f) => f.endsWith('.shots.json')).map((f) => readJson(path.join(SCENES, f)));
const inCut = edl ? new Set(edl.shots.filter((s) => s.kind === '3d').map((s) => s.job)) : null;
// handle frames the edit needs around a shot (dissolves); the shot table reserves `pre`/`post` frames
const need = new Map((edl?.shots || []).map((s) => [s.job, s.need || { pre: 0, post: 0 }]));

const fnText = (v) => JSON.stringify(v, (k, x) => (typeof x === 'function' ? `fn:${x.toString()}` : x));
const fileHash = (f) => { try { return sha1(fs.readFileSync(f)); } catch { return 'missing'; } };
const coreHash = sha1(fs.readdirSync(DIRECTOR).filter((f) => f.endsWith('.js')).sort().map((f) => fileHash(path.join(DIRECTOR, f))).join(','));

async function loadSpec(setId) {
  const f = path.join(SCENES, 'specs', `${SETS[setId].builder}.spec.js`);
  const m = await import(pathToFileURL(f).href + `?v=${fs.statSync(f).mtimeMs}`);
  return m.default;
}

/** Everything that decides the pictures of one shot, as three keys (see --redo-on). */
function keysFor(setId, spec, row) {
  const s = spec.shots?.[row.job] || {};
  const builderFile = path.join(DIRECTOR, 'sets', `${SETS[setId].builder}.js`);
  const sceneFile = path.join(SCENES, SETS[setId].file);
  return {
    shot: sha1(fnText({ row: { ...row, continuity: row.continuity }, s })),
    set: sha1(fnText({ cast: spec.cast, homes: spec.homes, defaults: spec.defaults, b: fileHash(builderFile), sc: fileHash(sceneFile), common: fileHash(path.join(DIRECTOR, 'sets/common.js')) })),
    core: coreHash,
    look: { preset: PRESET, cinematic: CINE, twos: TWOS },
    handles: handlesFor(row),
  };
}
function handlesFor(row) {
  const n = need.get(row.job) || { pre: 0, post: 0 };
  return { pre: Math.min(n.pre || 0, row.pre || 0), post: Math.min(n.post || 0, row.post || 0) };
}
function stale(prev, k) {
  if (!prev) return 'new';
  if (JSON.stringify(prev.handles || { pre: 0, post: 0 }) !== JSON.stringify(k.handles)) return 'handles changed';
  if (JSON.stringify(prev.look) !== JSON.stringify(k.look)) return 'other settings';
  if (prev.shot !== k.shot) return 'shot spec changed';
  if (REDO !== 'shot' && prev.set !== k.set) return 'set changed';
  if (REDO === 'core' && prev.core !== k.core) return 'director core changed';
  return null;
}

const work = { shots: path.join(WORK, 'shots'), stills: path.join(WORK, 'stills') };
fs.mkdirSync(work.shots, { recursive: true });

const plan = [];
for (const tab of tables) {
  if (SETS_F && !SETS_F.has(tab.set)) continue;
  const spec = await loadSpec(tab.set);
  const rows = tab.shots.filter((r) => (ONLY ? ONLY.has(r.job) : inCut ? inCut.has(r.job) : true));
  if (!rows.length) continue;
  const todo = [];
  for (const r of rows) {
    const k = keysFor(tab.set, spec, r);
    if (STILLS) { todo.push({ row: r, keys: k, why: 'stills' }); continue; }
    const side = path.join(work.shots, `${r.job}.json`), mp4 = path.join(work.shots, `${r.job}.mp4`);
    const prev = fs.existsSync(mp4) ? readJson(side) : null;
    const why = FORCE ? 'forced' : stale(prev, k);
    if (why) todo.push({ row: r, keys: k, why });
  }
  if (todo.length) plan.push({ set: tab.set, scene: path.join(ROOT, tab.scene_file), todo });
}

const p = resolvePreset(PRESET);
const nFrames = plan.reduce((a, s) => a + s.todo.reduce((b, x) => { const n = x.row.frames + x.keys.handles.pre + x.keys.handles.post; return b + (STILLS ? STILLS.length : TWOS ? Math.ceil(n / 2) : n); }, 0), 0);
console.log(`render-shots: ${plan.reduce((a, s) => a + s.todo.length, 0)} shot(s) in ${plan.length} set(s), ${nFrames} frames to draw, ${p.width}x${p.height} --cinematic ${CINE}${TWOS ? ' on twos' : ''} -> ${rel(WORK)}`);
for (const s of plan) console.log(`  ${s.set}: ${s.todo.map((x) => `${x.row.job}${x.why === 'new' || x.why === 'stills' ? '' : ` (${x.why})`}`).join(' ')}`);
if (DRY || !plan.length) process.exit(0);
checkFfmpeg();

// --------------------------------------------------------------- render ---
const timings = readJson(TIMINGS, { about: 'MEASURED seconds per frame of draft renders on the machine named below (scenes/lib/director/tools/render-shots.mjs; steady state: setup excluded). cost.js uses these instead of the model. Other jobs sharing the CPU make them slower: see load.', shots: {}, sets: {} });
// several render-shots processes may share the file (one per set group): merge this process's own
// entries into what is on disk at save time instead of overwriting the others'
const written = { shots: new Set(), sets: new Set() };
const saveTimings = () => {
  if (STILLS || PRESET !== 'draft') return;
  fs.mkdirSync(path.dirname(TIMINGS), { recursive: true });
  const cur = readJson(TIMINGS, null) || { ...timings, shots: {}, sets: {} };
  for (const k of written.shots) cur.shots[k] = timings.shots[k];
  for (const k of written.sets) cur.sets[k] = timings.sets[k];
  const tmp = `${TIMINGS}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cur, null, 1) + '\n');
  fs.renameSync(tmp, TIMINGS);
};
const machine = `${os.cpus().length} vCPU ${os.cpus()[0]?.model?.trim() || ''}, SwiftShader`.trim();
const server = await startServer({ allowRoots: [SCENES] });
let stopping = false;
const workers = new Set();
process.on('SIGINT', async () => { if (stopping) process.exit(130); stopping = true; console.error('\nstopping: finished shots are kept'); for (const w of workers) await w.close().catch(() => {}); await server.close().catch(() => {}); process.exit(130); });

const initCfg = runtimeConfig(p, { fps: FPS, cinematic: CINE === 'scene' ? undefined : CINE, bitDepth: 8, dither: true });
const fmt = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : `${s.toFixed(0)} s`);
const t0all = Date.now();
let framesDone = 0;

// review flags: the stage's per-shot warnings ("[director] 1A-22: framing: ...", the speaking-face
// audit) are kept with the shot (its .json sidecar `notes`), listed at the end of the run and carried
// into the cut report by make-cut.mjs - a warning that only scrolled past in a log was missed once
const notes = new Map();
function noteFrom(args) {
  const m = /\[director\] ([A-Z0-9]+-[0-9A-Z]+): (.+)$/.exec(args.map(String).join(' ').trim());
  if (!m) return;
  if (!notes.has(m[1])) notes.set(m[1], new Set());
  notes.get(m[1]).add(m[2].trim());
}

async function renderShot(w, set, item) {
  const r = item.row;
  if (STILLS) {
    const frames = [...new Set(STILLS.map((u) => r.start_frame + Math.min(r.frames - 1, Math.max(0, Math.round(u * (r.frames - 1))))))];
    const sink = memorySink(frames.map((f) => ({ frame: f, repeat: 1 })));
    const sid = newId('m');
    const url = server.addSink(sid, sink);
    try { await w.render({ sinkUrl: url, frames, capture: 'rgba', chunkStart: frames[0] }); await sink.finish(); } finally { server.removeSink(sid); }
    for (const f of frames) {
      const out = path.join(work.stills, `${r.job}_${String(f - r.start_frame).padStart(3, '0')}.png`);
      await writePng(sink.frames.get(f), { width: p.width, height: p.height, out });
    }
    framesDone += frames.length;
    return;
  }
  // the shot's frames plus the handle frames the edit needs (rendered by the same setup: the shot table
  // reserves them, update() gives them the shot's own blocking before / after its first / last frame)
  const { pre, post } = item.keys.handles;
  const N = pre + r.frames + post, f0 = r.start_frame - pre;
  const order = [];
  for (let i = 0; i < N; i += TWOS ? 2 : 1) order.push({ frame: f0 + i, repeat: TWOS ? Math.min(2, N - i) : 1 });
  const mp4 = path.join(work.shots, `${r.job}.mp4`), part = `${mp4}.part.mp4`;
  const args = encoderArgs({ width: p.width, height: p.height, fps: FPS, input: 'yuv', bitDepth: 8, crf: p.crf, preset: p.x264Preset, out: part });
  const sink = ffmpegSink(order, args, { label: `x264 ${r.job}` });
  const sid = newId('c');
  const url = server.addSink(sid, sink);
  const t0 = Date.now();
  let tFirst = null;
  sink.onProgress = (s) => { if (s.rendered === 1) tFirst = Date.now(); if (s.rendered % 24 === 0) process.stdout.write(`\r  [w${w.id}] ${r.job} ${s.rendered}/${order.length}   `); };
  try {
    await w.render({ sinkUrl: url, frames: order.map((o) => o.frame), capture: 'yuv', chunkStart: order[0].frame });
    await sink.finish();
  } catch (e) { await sink.abort().catch(() => {}); fs.rmSync(part, { force: true }); throw e; } finally { server.removeSink(sid); }
  const v = verifyVideo(part, { frames: N, width: p.width, height: p.height });
  if (!v.ok) { fs.rmSync(part, { force: true }); throw new Error(`${r.job}: encoded file failed the check: ${v.reason}`); }
  fs.renameSync(part, mp4);
  const ms = Date.now() - t0;
  // steady state: from the first frame to the last (the first frame of a page also compiles shaders)
  const spf = order.length > 1 && tFirst ? (Date.now() - tFirst) / 1000 / (order.length - 1) : ms / 1000 / order.length;
  fs.writeFileSync(path.join(work.shots, `${r.job}.json`), JSON.stringify({ job: r.job, set, frames: r.frames, pre, post, drawn: order.length, ...item.keys, s_per_frame: +spf.toFixed(3), wall_s: +(ms / 1000).toFixed(1), at: new Date().toISOString(), notes: [...(notes.get(r.job) || [])] }, null, 1) + '\n');
  written.shots.add(r.job);
  timings.shots[r.job] = { draft_s_per_frame: +spf.toFixed(3), frames_drawn: order.length, cinematic: CINE, twos: TWOS, load: +os.loadavg()[0].toFixed(2), machine, measured_at: new Date().toISOString().slice(0, 16) };
  saveTimings();
  framesDone += order.length;
  const el = (Date.now() - t0all) / 1000;
  process.stdout.write(`\r  [w${w.id}] ${r.job}: ${order.length} frames in ${fmt(ms / 1000)} (${spf.toFixed(2)} s/f) | ${framesDone}/${nFrames} frames, ${fmt(el)} elapsed, ETA ${fmt((el / framesDone) * (nFrames - framesDone))}\n`);
}

let failed = 0;
for (const s of plan) {
  const queue = [...s.todo];
  const n = Math.min(WORKERS, queue.length);
  console.log(`\n${s.set}: ${queue.length} shot(s), ${n} browser(s), ${rel(s.scene)}`);
  const loops = [];
  for (let i = 1; i <= n; i++) {
    loops.push((async () => {
      const w = new RenderWorker({ id: i, server, sceneFile: s.scene, init: initCfg, log: (...a) => { console.error('\n', ...a); noteFrom(a); } });
      workers.add(w);
      const ts = Date.now();
      let tries = 0;
      try {
        await w.start();
        written.sets.add(s.set);
        timings.sets[s.set] = { setup_s: +((Date.now() - ts) / 1000).toFixed(1), machine, measured_at: new Date().toISOString().slice(0, 16) };
        console.log(`  [w${i}] set built in ${fmt((Date.now() - ts) / 1000)} (${w.info.glRenderer})`);
        while (queue.length && !stopping) {
          const item = queue.shift();
          try { await renderShot(w, s.set, item); tries = 0; } catch (e) {
            console.error(`\n  [w${i}] ${item.row.job} FAILED: ${e.message.split('\n')[0]}`);
            if (w.dead && tries++ < 2) { queue.unshift(item); console.error(`  [w${i}] restarting the browser`); await w.restart(); } else failed++;
          }
        }
      } catch (e) { console.error(`\n  [w${i}] ${s.set}: ${e.message}`); failed += queue.length; queue.length = 0; } finally { await w.close(); workers.delete(w); }
    })());
  }
  await Promise.all(loops);
  saveTimings();
  if (STILLS) {
    // a contact sheet per set: every still of every shot, labelled
    const files = s.todo.flatMap((x) => fs.readdirSync(work.stills).filter((f) => f.startsWith(`${x.row.job}_`) && f.endsWith('.png')).sort().map((f) => ({ f: path.join(work.stills, f), label: f.replace(/\.png$/, '') })));
    if (files.length) {
      const font = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf'].find((f) => fs.existsSync(f));
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-cs-'));
      const W = 384, H = 216;
      files.forEach((x, i) => spawnSync(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-i', x.f, '-vf', `scale=${W}:${H},drawtext=${font ? `fontfile='${font}':` : ''}text='${x.label}':x=4:y=4:fontsize=15:fontcolor=yellow:box=1:boxcolor=black@0.6`, path.join(tmp, `f${String(i).padStart(3, '0')}.png`)]));
      const cols = Math.min(STILLS.length > 1 ? STILLS.length * Math.max(1, Math.floor(6 / STILLS.length)) : 5, files.length);
      const out = path.join(work.stills, `contact-${s.set}.png`);
      spawnSync(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(tmp, 'f%03d.png'), '-vf', `tile=${cols}x${Math.ceil(files.length / cols)}:padding=3:color=0x202020`, '-frames:v', '1', out]);
      fs.rmSync(tmp, { recursive: true, force: true });
      console.log(`  contact sheet: ${out}`);
    }
  }
}
await server.close();
if (notes.size) {
  console.log('\nreview flags (also in each shot\'s .json `notes`):');
  for (const [job, set] of notes) for (const n of set) console.log(`  ${job}: ${n}`);
}
console.log(`\ndone in ${fmt((Date.now() - t0all) / 1000)}: ${framesDone} frames${failed ? `, ${failed} shot(s) FAILED` : ''}`);
process.exit(failed ? 1 : 0);
