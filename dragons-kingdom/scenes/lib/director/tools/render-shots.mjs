#!/usr/bin/env node
// Shot director - DAILIES: render many shots of a set from ONE browser setup (the set is built once,
// then every shot is a list of frames of the same page), each shot into its own video file, or one
// still per shot for a contact sheet. For the draft cut and for review; the masters are rendered
// shot by shot by render/episode.mjs (render.mjs --start <start_s> --seconds <frames/24>), which
// gives the same pictures for the same settings (update(t) is a pure function of the frame).
//
//   node scenes/lib/director/tools/render-shots.mjs --all                every rendered shot of the cuts (cut/edl*.json)
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
//   --adopt-v2        give up-to-date finished shots their documentation-free key (staging / deviation text
//                     edits then never re-render them); shots finished from session 7 on have it already
//   --reverse         take each set's shots from the last (a second queue meeting the first in the middle)
//   --stills U,U      render stills at these fractions of each shot instead of videos (PNG + a contact sheet)
//   --segment N       render + encode a shot in N-frame segments (default 48; 0 = one piece): a crash or a
//                     stop loses only the segment in flight, the next run resumes the shot
//   --timings FILE    measured seconds per frame go here (default episodes/s01e01/final/cut/timings.json; only
//                     written for video renders of the draft preset)
//   --all             no --only / --sets: render every stale shot of every cut (required: a bare run, --help,
//                     -h or any unknown flag / stray word prints this usage and renders NOTHING)
// Interrupt (Ctrl+C) and run again: finished shots are kept. Several processes may share one --work
// folder (e.g. two queues on the chamber): each shot is claimed with a <job>.lock (the pid) and a shot
// another process finished or is rendering is skipped.
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
const readText = (f) => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return ''; } };
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
const FPS = 24;

// ------------------------------------------------------------------ args ---
const argv = process.argv.slice(2);
// strict: a mistyped or unknown option must never start a render (session 9 lost 20 min of CPU to a
// `--help` that this tool did not know and so rendered every stale shot)
const VALUE_OPTS = ['--preset', '--cinematic', '--workers', '--work', '--redo-on', '--stills', '--only', '--sets', '--segment', '--timings'];
const FLAG_OPTS = ['--twos', '--force', '--dry-run', '--adopt-v2', '--reverse', '--all'];
function usage(code, why) {
  const head = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
  const end = head.findIndex((l) => !l.startsWith('//') && !l.startsWith('#!'));
  if (why) console.error(`render-shots: ${why}\n`);
  (code ? console.error : console.log)(head.slice(0, end).filter((l) => l.startsWith('//')).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(code);
}
{
  if (argv.includes('--help') || argv.includes('-h')) usage(0);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_OPTS.includes(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) usage(2, `${a} needs a value`);
      i++;
    } else if (!FLAG_OPTS.includes(a)) usage(2, `unknown argument "${a}" - nothing rendered`);
  }
  if (!argv.includes('--only') && !argv.includes('--sets') && !argv.includes('--all') && !argv.includes('--dry-run')) {
    usage(2, 'say what to render: --only <ids>, --sets <SET,...> or --all (every stale shot of the cuts) - nothing rendered');
  }
}
const opt = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const flag = (n) => argv.includes(n);
const PRESET = opt('--preset', 'draft');
const CINE = opt('--cinematic', 'velocity');
const TWOS = flag('--twos');
const WORKERS = Math.max(1, +opt('--workers', 1));
const FORCE = flag('--force'), DRY = flag('--dry-run');
const REDO = opt('--redo-on', 'set');
const REVERSE = flag('--reverse');
const STILLS = opt('--stills') ? opt('--stills').split(',').map(Number) : null;
const ONLY = opt('--only') ? new Set(opt('--only').split(',')) : null;
const SETS_F = opt('--sets') ? new Set(opt('--sets').split(',')) : null;
const WORK = path.resolve(opt('--work', path.join(ROOT, 'output/director', PRESET)));
const TIMINGS = path.resolve(opt('--timings', path.join(FINAL, 'cut/timings.json')));
// a shot is rendered and encoded in SEGMENTS of this many frames (0 = one piece): a renderer killed for
// memory (other renders on the machine) loses only the segment in flight, the retry / the next run
// resumes from <job>.segs.json (same keys) and the finished segments are joined without re-encoding
const SEGMENT = Math.max(0, +opt('--segment', 48));
if (!['shot', 'set', 'core'].includes(REDO)) throw new Error('--redo-on must be shot, set or core');

// ----------------------------------------------------------------- plan ---
// every draft cut (cut/edl.json = PROLOGUE + TITLE + 1A, cut/edl-<part>.json for the further parts)
const edls = fs.readdirSync(path.join(FINAL, 'cut')).filter((f) => /^edl(-[^.]+)?\.json$/.test(f)).map((f) => readJson(path.join(FINAL, 'cut', f))).filter(Boolean);
const edl = edls.length ? { shots: edls.flatMap((e) => e.shots) } : null;
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

// fields that document a shot without changing its pictures: an edit to them must not re-render it
const DOC_FIELDS = ['staging', 'deviation', 'cutOk', 'notes', 'about'];
const docFree = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !DOC_FIELDS.includes(k)));

/** Everything that decides the pictures of one shot, as three keys (see --redo-on). `shot` keeps its first
 *  formula (it hashes the documentation text too; older sidecars and running queues compare it), `shotV2`
 *  leaves the documentation out - a sidecar that has it is compared by it (session 7). */
function keysFor(setId, spec, row) {
  const s = spec.shots?.[row.job] || {};
  const builderFile = path.join(DIRECTOR, 'sets', `${SETS[setId].builder}.js`);
  const sceneFile = path.join(SCENES, SETS[setId].file);
  return {
    shot: sha1(fnText({ row: { ...row, continuity: row.continuity }, s })),
    shotV2: sha1(fnText({ v: 2, row: docFree(row), s: docFree(s) })),
    set: sha1(fnText({ cast: spec.cast, homes: spec.homes, defaults: spec.defaults, b: fileHash(builderFile), sc: fileHash(sceneFile), common: fileHash(path.join(DIRECTOR, 'sets/common.js')) })),
    core: coreHash,
    look: { preset: PRESET, cinematic: CINE, twos: TWOS },
    handles: handlesFor(row),
  };
}
/** The keys of a shot from the files as they are NOW (the spec and the shot table re-read from disk). */
async function freshKeys(setId, job) {
  const tab = readJson(path.join(SCENES, SETS[setId].file.replace(/\.js$/, '.shots.json')));
  const row = tab?.shots?.find((r) => r.job === job);
  if (!row) return null;
  return keysFor(setId, await loadSpec(setId), row);
}
function handlesFor(row) {
  const n = need.get(row.job) || { pre: 0, post: 0 };
  return { pre: Math.min(n.pre || 0, row.pre || 0), post: Math.min(n.post || 0, row.post || 0) };
}
function stale(prev, k) {
  if (!prev) return 'new';
  if (JSON.stringify(prev.handles || { pre: 0, post: 0 }) !== JSON.stringify(k.handles)) return 'handles changed';
  if (JSON.stringify(prev.look) !== JSON.stringify(k.look)) return 'other settings';
  if (prev.shotV2 ? prev.shotV2 !== k.shotV2 : prev.shot !== k.shot) return 'shot spec changed';
  if (REDO !== 'shot' && prev.set !== k.set) return 'set changed';
  if (REDO === 'core' && prev.core !== k.core) return 'director core changed';
  return null;
}

const work = { shots: path.join(WORK, 'shots'), stills: path.join(WORK, 'stills') };
fs.mkdirSync(work.shots, { recursive: true });

// --adopt-v2: give every finished, UP-TO-DATE shot's sidecar its documentation-free key (shotV2), so a later
// edit of its staging / deviation text does not re-render it. Shots that are stale are left alone.
if (flag('--adopt-v2')) {
  let n = 0;
  for (const tab of tables) {
    if (SETS_F && !SETS_F.has(tab.set)) continue;
    const spec = await loadSpec(tab.set);
    for (const r of tab.shots) {
      if (ONLY && !ONLY.has(r.job)) continue;
      const side = path.join(work.shots, `${r.job}.json`), prev = fs.existsSync(path.join(work.shots, `${r.job}.mp4`)) ? readJson(side) : null;
      if (!prev || prev.shotV2) continue;
      const k = keysFor(tab.set, spec, r);
      if (prev.shot !== k.shot || prev.set !== k.set && REDO !== 'shot') { console.log(`  ${r.job}: stale - not adopted`); continue; }
      fs.writeFileSync(side, JSON.stringify({ ...prev, shotV2: k.shotV2 }, null, 1) + '\n'); n++;
    }
  }
  console.log(`adopt-v2: ${n} sidecar(s) given their documentation-free key`);
  process.exit(0);
}

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
  if (REVERSE) todo.reverse();
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

/** A lock file per shot being rendered (<job>.lock = pid): false when a live process holds it. */
function claim(job) {
  const f = path.join(work.shots, `${job}.lock`);
  for (let k = 0; k < 2; k++) {
    try { fs.writeFileSync(f, String(process.pid), { flag: 'wx' }); held.add(job); return true; } catch { /* exists */ }
    let pid = 0; try { pid = +fs.readFileSync(f, 'utf8'); } catch { /* vanished */ }
    if (pid === process.pid) { held.add(job); return true; }
    if (pid) { try { process.kill(pid, 0); return false; } catch { /* a dead process's lock */ } }
    fs.rmSync(f, { force: true });
  }
  return false;
}
function release(job) { if (held.delete(job)) fs.rmSync(path.join(work.shots, `${job}.lock`), { force: true }); }
const held = new Set();
process.on('exit', () => { for (const j of held) try { fs.rmSync(path.join(work.shots, `${j}.lock`), { force: true }); } catch { /* gone */ } });

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
  const t0 = Date.now();
  let tFirst = null, nRendered = 0, nResumed = 0;
  const outFrames = (list) => list.reduce((n, o) => n + o.repeat, 0);
  // one encoded piece: the frames of `list` -> file (verified, then renamed into place). Always encoded
  // as <job>.mp4.part.mp4 (the in-flight name every tool knows: lock checks, cleanups, other queues)
  const encodePiece = async (list, file) => {
    const pp = part;
    const args = encoderArgs({ width: p.width, height: p.height, fps: FPS, input: 'yuv', bitDepth: 8, crf: p.crf, preset: p.x264Preset, out: pp });
    const sink = ffmpegSink(list, args, { label: `x264 ${r.job}` });
    const sid = newId('c');
    const url = server.addSink(sid, sink);
    sink.onProgress = (st) => { if (st.rendered === 1 && tFirst === null) tFirst = Date.now(); if ((nRendered + st.rendered) % 24 === 0) process.stdout.write(`\r  [w${w.id}] ${r.job} ${nResumed + nRendered + st.rendered}/${order.length}   `); };
    try {
      await w.render({ sinkUrl: url, frames: list.map((o) => o.frame), capture: 'yuv', chunkStart: list[0].frame });
      await sink.finish();
    } catch (e) { await sink.abort().catch(() => {}); fs.rmSync(pp, { force: true }); throw e; } finally { server.removeSink(sid); }
    const v = verifyVideo(pp, { frames: outFrames(list), width: p.width, height: p.height });
    if (!v.ok) { fs.rmSync(pp, { force: true }); throw new Error(`${r.job}: encoded file failed the check: ${v.reason}`); }
    fs.renameSync(pp, file);
    nRendered += list.length;
  };
  if (!SEGMENT || order.length <= SEGMENT * 1.5) {
    await encodePiece(order, mp4);
  } else {
    // segments: <job>.s000.mp4 ... + <job>.segs.json (what they were rendered for); resume the ones done
    const segs = [];
    for (let i = 0; i < order.length; i += SEGMENT) segs.push(order.slice(i, Math.min(order.length, i + SEGMENT)));
    if (order.length - (segs.length - 1) * SEGMENT < SEGMENT / 2 && segs.length > 1) { const last = segs.pop(); segs[segs.length - 1] = segs[segs.length - 1].concat(last); }
    const segFile = (k) => path.join(work.shots, `${r.job}.s${String(k).padStart(3, '0')}.mp4`);
    const manFile = path.join(work.shots, `${r.job}.segs.json`);
    const { shotV2: _v2, ...legacyKeys } = item.keys;   // manifests of older runs have no shotV2
    const want = { keys: legacyKeys, frames: segs.map((x) => [x[0].frame, x.length]) };
    const man = readJson(manFile);
    const same = man && JSON.stringify({ keys: man.keys, frames: man.frames }) === JSON.stringify(want);
    const stale = fs.readdirSync(work.shots).filter((f) => f.startsWith(`${r.job}.s`) && /\.s\d{3}\.mp4/.test(f));
    if (!same) for (const f of stale) fs.rmSync(path.join(work.shots, f), { force: true });
    const done = new Set(same ? (man.done || []) : []);
    for (const k of [...done]) {
      const v = fs.existsSync(segFile(k)) ? verifyVideo(segFile(k), { frames: outFrames(segs[k]), width: p.width, height: p.height }) : { ok: false };
      if (!v.ok) done.delete(k);
    }
    nResumed = [...done].reduce((n, k) => n + segs[k].length, 0);
    if (done.size) console.log(`\n  [w${w.id}] ${r.job}: resuming - ${done.size}/${segs.length} segments (${nResumed} frames) already rendered`);
    const save = () => fs.writeFileSync(manFile, JSON.stringify({ ...want, segment: SEGMENT, done: [...done].sort((x, y) => x - y) }) + '\n');
    save();
    for (let k = 0; k < segs.length; k++) {
      if (done.has(k)) continue;
      await encodePiece(segs[k], segFile(k));
      done.add(k); save();
    }
    // join without re-encoding (every segment starts on a key frame)
    const list = path.join(work.shots, `${r.job}.segs.txt`);
    fs.writeFileSync(list, segs.map((x, k) => `file '${segFile(k).replace(/'/g, "'\\''")}'`).join('\n') + '\n');
    const j = spawnSync(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', part], { encoding: 'utf8' });
    fs.rmSync(list, { force: true });
    if (j.status !== 0) { fs.rmSync(part, { force: true }); throw new Error(`${r.job}: joining the segments failed: ${(j.stderr || '').trim().split('\n')[0]}`); }
    const v = verifyVideo(part, { frames: N, width: p.width, height: p.height });
    if (!v.ok) { fs.rmSync(part, { force: true }); throw new Error(`${r.job}: the joined segments failed the check: ${v.reason}`); }
    fs.renameSync(part, mp4);
  }
  for (const f of fs.readdirSync(work.shots)) if (f.startsWith(`${r.job}.`) && (/\.s\d{3}\.mp4$/.test(f) || f === `${r.job}.segs.json`)) fs.rmSync(path.join(work.shots, f), { force: true });
  const ms = Date.now() - t0;
  // steady state: from the first frame to the last (the first frame of a page also compiles shaders)
  const spf = nRendered > 1 && tFirst ? (Date.now() - tFirst) / 1000 / (nRendered - 1) : ms / 1000 / Math.max(1, nRendered);
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
          // several render-shots processes may share one work folder (two queues on one set): skip a
          // shot another process finished meanwhile, or is rendering now (its lock names a live pid)
          if (!STILLS && !FORCE && !stale(readJson(path.join(work.shots, `${item.row.job}.json`)), item.keys) && fs.existsSync(path.join(work.shots, `${item.row.job}.mp4`))) { console.log(`  [w${i}] ${item.row.job}: finished by another process, skipped`); continue; }
          // an older process (no locks) shows its work by the growing .part.mp4; a part file whose lock
          // names a dead process (a killed or crashed run) is stale: removed (its segments are kept)
          const part = path.join(work.shots, `${item.row.job}.mp4.part.mp4`);
          if (!STILLS && fs.existsSync(part)) {
            const lp = +(readText(path.join(work.shots, `${item.row.job}.lock`)) || 0);
            let live = false; if (lp) { try { process.kill(lp, 0); live = true; } catch { /* dead */ } }
            if (lp && !live) { fs.rmSync(part, { force: true }); console.log(`  [w${i}] ${item.row.job}: removed the part file of a dead run (pid ${lp})`); }
          }
          if (!STILLS && fs.existsSync(part) && Date.now() - fs.statSync(part).mtimeMs < 30 * 60e3) { console.log(`  [w${i}] ${item.row.job}: being encoded by another process, skipped`); continue; }
          // the browser holds the spec and the set builder as they were when it built the set: a shot whose
          // spec (or set) changed on disk since then would render the OLD staging under the new keys - skip
          // it, a fresh run renders it (session 7: 1A-30 restaged while two queues held the old spec)
          if (!STILLS) {
            const fresh = await freshKeys(s.set, item.row.job).catch(() => null);
            if (fresh && (fresh.shotV2 !== item.keys.shotV2 || fresh.set !== item.keys.set)) { console.log(`  [w${i}] ${item.row.job}: its ${fresh.shotV2 !== item.keys.shotV2 ? 'shot spec' : 'set'} changed on disk since this browser loaded the set - skipped (a fresh run renders it)`); continue; }
          }
          const lock = STILLS ? null : claim(item.row.job);
          if (lock === false) { console.log(`  [w${i}] ${item.row.job}: being rendered by another process, skipped`); continue; }
          try { await renderShot(w, s.set, item); tries = 0; } catch (e) {
            console.error(`\n  [w${i}] ${item.row.job} FAILED: ${e.message.split('\n')[0]}`);
            if (w.dead && tries++ < 3) {
              // a renderer killed for memory (other renders on the machine) often dies again while the
              // set rebuilds: wait for the memory to come back, then retry (1, 2, 4 min)
              release(item.row.job); queue.unshift(item);
              for (let k = 0; ; k++) {
                const wait = 60 * 2 ** Math.min(k, 2);
                console.error(`  [w${i}] restarting the browser in ${wait} s`);
                await new Promise((r) => setTimeout(r, wait * 1000));
                try { await w.restart(); break; } catch (e2) { if (k >= 3 || stopping) throw e2; console.error(`  [w${i}] restart failed: ${e2.message.split('\n')[0]}`); }
              }
            } else failed++;
          } finally { release(item.row.job); }
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
