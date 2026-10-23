#!/usr/bin/env node
// Render Episode 1 scene by scene, resumable, and assemble the finished episode.
//
//   npm run episode                    render whatever is ready, in the order of render-schedule.md
//   npm run episode -- --status        only show what is done / waiting / left (renders nothing)
//   npm run episode -- --dry-run       list what the next run would do
//
// The plan is episodes/s01e01/final/render-schedule.md (scene order) and
// render-jobs.json next to it (one job per shot, with the master settings:
// native 3840x2160, 24 fps, --preset final, --cinematic velocity (1E-03: film),
// 10-bit, CRF 12).
//
// THE RENDER GATE (render-ready.json next to render-jobs.json, render/lib/gate.mjs):
// the branch carries every track's work in progress, so a scene file existing does
// not make a shot ready for a master. A shot (and the end-credits card) is rendered
// only when the director has approved it with `node render/gate.mjs approve ...`,
// which locks the sha256 of its scene file, its shot entry and every code file the
// scene loads. Files changed after the approval: the shot WAITS (it would not show
// what was approved). Approval renewed with new files: a finished shot is rendered
// AGAIN and its scene re-joined. A scene is joined, and the episode assembled, only
// from shots rendered with their current approval. Black cards need no approval.
// (--ignore-gate renders unapproved shots, only together with --size: TEST, never a master.)
//
// For every scene, in order:
//
//  1. Every approved shot is rendered with render/render.mjs into
//     output/episode1/shots/<scene>/<shot>/<shot>.mp4 (chunked: stopping and
//     running the command again continues where it stopped; a shot that is
//     finished is not rendered again unless its approval changes). Black and text
//     cards are made with ffmpeg. A shot whose scene file does not exist yet, or
//     that is not approved yet, is SKIPPED with a message: the scene files and
//     the approvals are made in the cloud and arrive with `git pull`; the render
//     shortcut pulls and continues.
//  2. When all shots of a scene are finished, they are joined into
//     output/episode1/scenes/<scene>.mp4 (10-bit H.264 CRF 16, the scene's sound
//     if there is any, silence otherwise) + <scene>.en.srt, and the shots'
//     chunk folders are deleted (the shot files stay).
//  3. When every scene is finished: output/episode1/DragonsKingdom_S01E01_4K.mp4
//     (scene files joined without re-encoding, the sound, English subtitles you
//     can switch on/off) and DragonsKingdom_S01E01_1080p.mp4 (8-bit, plays on
//     phones and TVs), plus DragonsKingdom_S01E01.en.srt.
//
// Where a shot's scene file and start time come from (render/lib/shots.mjs, first match wins):
//   a. its render-jobs.json command, once that command has no "<...>" placeholder
//      and its scene file exists;
//   b. the set scene named in the command (episodes/s01e01/final/scenes/<set>.js)
//      plus its shot table <set>.shots.json with an entry for the shot:
//      {"shots": [{"job": "P-02", "start_s": 0, "frames": 144}, ...]}
//      (also accepted: "id"/"shot" for "job", "set_time_start_s"/"start" for "start_s",
//      or an object keyed by shot id);
//   c. a scene file for just this shot: episodes/s01e01/final/scenes/shots/<shot>.js (starts at 0).
// Sound: output/episode1/audio/ or episodes/s01e01/final/audio/ ->
//   scenes/<scene>.wav|flac|m4a|mp3 (per scene, starting at the scene's first frame) or
//   S01E01_mix.wav|... (the whole episode). Subtitles: S01E01.en.srt in the same folders
//   (timed to the mix); without it the timing is ESTIMATED from the shot list.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, num } from './lib/args.mjs';
import { PROJECT_ROOT, checkFfmpeg, ffmpegPath } from './lib/tools.mjs';
import { parseSchedule, loadJobs, parseCommand, DEFAULT_SCHEDULE } from './lib/schedule.mjs';
import { probeVideo, ffprobeJson, COLOR_TAGS, fpsRational, spawnFfmpeg } from './lib/ffmpeg.mjs';
import { lockJob } from './lib/job.mjs';
import { savedGpuProfile, gpuCheckCommand, renderCommand } from './lib/gpu.mjs';
import { estimateCues, readSrt, writeSrt, sliceCues } from './lib/subtitles.mjs';
import { fmtDuration } from './lib/progress.mjs';
import { resolveShot as resolveShotIn } from './lib/shots.mjs';
import { readGate, gateVerdict, GATE_NAME } from './lib/gate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RENDER_MJS = path.join(HERE, 'render.mjs');
const FPS = 24;
const TITLE = 'DragonsKingdom_S01E01';

const HELP = `
Render Episode 1 scene by scene (resumable) and assemble the episode.

  npm run episode [-- options]          (or: node render/episode.mjs [options])

  --status             show progress only, render nothing
  --dry-run            list what would be rendered / assembled
  --only S1,S2         only these scenes (e.g. 1A,1B); the episode is assembled when ALL are done
  --gpu | --cpu        renderer (default: the GPU that the GPU check found - Windows: pc\\GPU-Check.cmd,
                       elsewhere: npm run gpu-check; without one: stop)
  --workers N          browsers per shot (default: the job's own, 2; a shot that fails is retried with 1)
  --max-hours H        do not start a new shot after H hours (stop cleanly, resume later)
  --rerender-stale     render finished shots again if files they loaded changed since (git pull), as long
                       as the current files are the approved ones (a changed APPROVAL re-renders by itself)
  --ignore-gate        TEST renders only (needs --size): also render shots that are not approved in
                       ${GATE_NAME} (work in progress); never for masters
  --no-assemble        render shots only, do not join scenes / the episode
  --keep-chunks        keep the shots' chunk folders after their scene file is made
  --verify-full        decode scene files and the episode completely as a check (slow at 4K)
  --skip-cache-check   start even if pc/build-caches.mjs reports missing caches (pictures may differ!)
  --master-preset P    x264 preset for scene files / episode (default medium)
  --schedule FILE      render-schedule.md (default ${path.relative(PROJECT_ROOT, DEFAULT_SCHEDULE).split(path.sep).join('/')})
  --jobs FILE          render-jobs.json (default: next to the schedule)
  --out DIR            output folder (default output/episode1)
  --size WxH           TEST render at another size: labelled TEST, separate folder, never a master
`;

// --------------------------------------------------------------- helpers ---
const relp = (f) => path.relative(PROJECT_ROOT, f).split(path.sep).join('/') || '.';
let LOG_FILE = null;
function say(...a) {
  const s = a.join(' ');
  console.log(s);
  if (LOG_FILE) { try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString().slice(0, 19).replace('T', ' ')}] ${s}\n`); } catch {} }
}
const hr = (c = '-') => c.repeat(78);
const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.tmp-${process.pid}`; fs.writeFileSync(t, JSON.stringify(o, null, 1) + '\n'); fs.renameSync(t, f); };
const statKey = (f) => { try { const s = fs.statSync(f); return `${s.size}:${Math.floor(s.mtimeMs)}`; } catch { return null; } };
const freeGB = (dir) => { try { const s = fs.statfsSync(dir); return (s.bavail * s.bsize) / 2 ** 30; } catch { return null; } };
const fmtH = (h) => (h >= 48 ? `${(h / 24).toFixed(1)} days` : fmtDuration(h * 3600));

function ffmpegMajor() {
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-version'], { encoding: 'utf8', windowsHide: true });
  const m = /ffmpeg version n?(\d+)/.exec(r.stdout || '');
  return m ? +m[1] : 7;    // git builds ("N-12345-g...") are new
}
let _fpsArgs = null;
/** Keep every frame exactly as it comes (no frame dropping / duplicating). */
const passthrough = () => (_fpsArgs ??= ffmpegMajor() >= 5 ? ['-fps_mode', 'passthrough'] : ['-vsync', 'passthrough']);

async function ffmpeg(args, label) {
  const ff = spawnFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-nostdin', ...args], { label });
  ff.proc.stdin.end();
  return ff.end();
}

/** ffmpeg filter-option value: a path in single quotes with ':' escaped (works for C:/ paths). */
const ffPath = (p) => `'${p.replace(/\\/g, '/').replace(/'/g, "'\\''").replace(/:/g, '\\:')}'`;

// x264 settings shared by cards and shots (render.mjs encoderArgs), so every shot file of a scene is alike.
const x264Args = ({ crf, preset, bitDepth }) => [
  '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-profile:v', bitDepth === 10 ? 'high10' : 'high',
  '-pix_fmt', bitDepth === 10 ? 'yuv420p10le' : 'yuv420p', '-g', String(FPS * 2), '-keyint_min', String(FPS / 2),
  '-x264-params', 'open-gop=0', ...COLOR_TAGS, '-chroma_sample_location', 'center',
];

// ------------------------------------------------------------------- plan ---
function loadPlan(o) {
  const sched = parseSchedule(o.schedule);
  const { jobs, file: jobsFile } = loadJobs(o.schedule, o.jobsFile);
  const byScene = new Map();
  for (const j of jobs) { if (!byScene.has(j.scene)) byScene.set(j.scene, []); byScene.get(j.scene).push(j); }
  const scenes = sched.scenes.map((s) => ({ ...s, jobs: byScene.get(s.key) || [] }));
  const known = new Set(scenes.map((s) => s.key));
  const orphans = [...byScene.keys()].filter((k) => !known.has(k));
  let f = 0;
  for (const s of scenes) { s.startFrame = f; s.frames = s.jobs.reduce((a, j) => a + j.frames, 0); f += s.frames; }
  return { sched, jobsFile, scenes, orphans, totalFrames: f };
}

/** Where shot `job` comes from (render/lib/shots.mjs). Returns { ready, kind, scene, startS, args, reason, via, entry } */
const resolveShot = (job) => resolveShotIn(job, PLAN_DIR);

// ------------------------------------------------------------ shot state ---
const shotDir = (o, scene, job) => path.join(o.out, 'shots', scene.key, job.job);
const shotFile = (o, scene, job) => path.join(shotDir(o, scene, job), `${job.job}.mp4`);
const doneFile = (o, scene, job) => path.join(shotDir(o, scene, job), 'DONE.json');

function shotDone(o, scene, job) {
  const d = readJson(doneFile(o, scene, job));
  if (!d || d.frames !== job.frames || d.width !== o.W || d.height !== o.H) return null;
  // the file was deleted or replaced (same size = the same file copied elsewhere and back: its time may differ)
  const now = statKey(shotFile(o, scene, job));
  if (!now || now.split(':')[0] !== String(d.stat).split(':')[0]) return null;
  return d;
}

// cached sha1 of files on disk (stale-shot check), keyed by size+mtime
let HASHES = null;
function hashOnDisk(o, rel) {
  HASHES ??= readJson(path.join(o.out, '.hash-cache.json')) || {};
  const f = path.resolve(PROJECT_ROOT, rel);
  const k = statKey(f);
  if (!k) return 'missing';
  if (HASHES[rel]?.k === k) return HASHES[rel].h;
  const h = sha1(fs.readFileSync(f));
  HASHES[rel] = { k, h };
  return h;
}
function saveHashes(o) { if (HASHES) try { writeJson(path.join(o.out, '.hash-cache.json'), HASHES); } catch {} }

/** Files a finished shot was rendered from that are different on disk now. */
function staleFiles(o, done) {
  return Object.entries(done.files || {}).filter(([f, h]) => hashOnDisk(o, f) !== h).map(([f]) => f);
}

// --------------------------------------------------------------- render ---
function runChild(args, env) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env, ...env }, cwd: PROJECT_ROOT, windowsHide: false });
    CHILD = p;
    p.on('error', (e) => { CHILD = null; resolve({ code: 1, error: e.message }); });
    p.on('exit', (code, signal) => { CHILD = null; resolve({ code, signal }); });
  });
}
let CHILD = null;
let STOPPING = false;

async function renderShot(o, scene, job, r, { workers, fresh }) {
  const dir = shotDir(o, scene, job);
  const a = r.args || {};
  const secs = job.frames / FPS;
  const args = [RENDER_MJS, r.scene,
    '--preset', 'final',
    '--start', String(r.startS), '--seconds', secs.toFixed(6),
    '--workers', String(workers),
    '--chunk-seconds', String(a['chunk-seconds'] ?? job.chunk_seconds ?? 1),
    '--bit-depth', String(a['bit-depth'] ?? 10), '--crf', String(a.crf ?? 12),
    '--x264-preset', o.x264Preset,
    '--out', dir];
  if (a.cinematic) args.push('--cinematic', a.cinematic);
  if (o.gpu) args.push('--gpu');
  if (o.size) args.push('--size', o.size);
  if (fresh) args.push('--fresh');
  const errFile = path.join(os.tmpdir(), `dk-episode-${process.pid}-${job.job.replace(/[^\w-]/g, '_')}.json`);
  fs.rmSync(errFile, { force: true });
  const t0 = Date.now();
  say(`  > node render/render.mjs ${relp(r.scene)} --start ${r.startS} --seconds ${secs.toFixed(3)}${a.cinematic ? ` --cinematic ${a.cinematic}` : ''} --workers ${workers}${o.gpu ? ' --gpu' : ''}${fresh ? ' --fresh' : ''} --out ${relp(dir)}`);
  const res = await runChild(args, { DK_ERROR_JSON: errFile });
  const err = readJson(errFile);
  fs.rmSync(errFile, { force: true });
  return { ...res, err, wallS: (Date.now() - t0) / 1000 };
}

function finishShot(o, scene, job, r, wallS, files = null) {
  const file = shotFile(o, scene, job);
  const v = probeVideo(file);
  if (!v || v.frames !== job.frames || v.width !== o.W || v.height !== o.H) {
    return `the render finished but ${relp(file)} has ${v ? `${v.frames} frames at ${v.width}x${v.height}` : 'no readable video'} (expected ${job.frames} at ${o.W}x${o.H})`;
  }
  const jj = readJson(path.join(shotDir(o, scene, job), 'job.json'));
  writeJson(doneFile(o, scene, job), {
    job: job.job, scene: scene.key, set: job.set, kind: r.kind, frames: job.frames, width: o.W, height: o.H, stat: statKey(file),
    source: r.scene ? relp(r.scene) : null, startS: r.startS ?? null, via: r.via ?? null, cinematic: r.args?.cinematic ?? null,
    renderer: jj?.fingerprint?.renderer ?? null, files: files ?? jj?.fingerprint?.files ?? {}, wallS: wallS ?? null,
    // the render gate: the approval this shot was rendered under (null: a black card, or an ungated TEST render)
    lockId: r.lockId ?? null, lock: r.lock ?? null, approvedBy: r.approvedBy ?? null,
    finishedAt: new Date().toISOString(),
  });
  return null;
}

// ------------------------------------------------------------ the gate ---
let GATE = { exists: false, approved: {}, libs: {} };

/** Why a finished scene must not be joined (gate): shots missing, not approved, or rendered under another approval. */
function gateProblems(o, scene) {
  if (!o.gated) return [];
  const out = [];
  for (const j of scene.jobs) {
    if (j.render === 'black') continue;
    const d = shotDone(o, scene, j);
    const a = GATE.approved[j.job];
    if (!d) out.push(`${j.job} is not rendered`);
    else if (!a) out.push(`${j.job} is not approved (${GATE_NAME})`);
    else if (d.lockId !== a.lockId) out.push(`${j.job} was rendered under another approval`);
  }
  return out;
}

/** The scene file exists and was joined from exactly the shot files there now. */
function sceneCurrent(o, scene) {
  const side = readJson(sceneFile(o, scene).replace(/\.mp4$/, '.json'));
  if (!side || !fs.existsSync(sceneFile(o, scene)) || statKey(sceneFile(o, scene)) !== side.stat) return false;
  const now = scene.jobs.map((j) => ({ job: j.job, stat: statKey(shotFile(o, scene, j)) }));
  return JSON.stringify(side.want?.inputs) === JSON.stringify(now);
}

/** Black card or (end credits) text card with the shots' encoder settings. */
async function makeCard(o, scene, job, r) {
  const dir = shotDir(o, scene, job);
  fs.mkdirSync(dir, { recursive: true });
  const out = shotFile(o, scene, job);
  const tmp = `${out}.part.mp4`;
  const d = job.frames / FPS;
  const vf = [];
  if (r.kind === 'text') {
    const font = findFont();
    const size = Math.round(56 * o.H / 2160);
    // every line centred, as end credits are (drawtext text_align, FFmpeg 6.1+); older FFmpeg: a centred block of left-aligned lines
    const across = drawtextCanAlign() ? `x=0:boxw=${o.W}:text_align=C` : 'x=(w-text_w)/2';
    vf.push(`drawtext=${font ? `fontfile=${ffPath(font)}:` : ''}textfile=${ffPath(r.textFile)}:expansion=none:fontcolor=white:fontsize=${size}:line_spacing=${Math.round(size * 0.6)}:${across}:y=h-(t/${d.toFixed(3)})*(h+text_h)`);
  }
  await ffmpeg(['-f', 'lavfi', '-i', `color=c=black:s=${o.W}x${o.H}:r=${FPS}`, '-frames:v', String(job.frames),
    ...(vf.length ? ['-vf', vf.join(',')] : []), ...x264Args({ crf: 12, preset: o.x264Preset, bitDepth: 10 }),
    '-r', fpsRational(FPS), '-f', 'mp4', tmp], `card ${job.job}`);
  fs.renameSync(tmp, out);
  // a text card remembers the text it was made from: when credits.txt changes, the card is made again (see the main loop)
  const files = r.textFile ? { [relp(r.textFile)]: hashOnDisk(o, relp(r.textFile)) } : {};
  return finishShot(o, scene, job, r, null, files);
}

let _canAlign = null;
/** Does this FFmpeg's drawtext know text_align (6.1 and newer)? */
function drawtextCanAlign() {
  if (_canAlign === null) {
    const r = spawnSync(ffmpegPath(), ['-hide_banner', '-h', 'filter=drawtext'], { encoding: 'utf8', windowsHide: true });
    _canAlign = /\btext_align\b/.test(r.stdout || '');
  }
  return _canAlign;
}

function findFont() {
  const c = process.platform === 'win32'
    ? ['C:/Windows/Fonts/georgia.ttf', 'C:/Windows/Fonts/times.ttf', 'C:/Windows/Fonts/arial.ttf']
    : process.platform === 'darwin'
      ? ['/System/Library/Fonts/Supplemental/Georgia.ttf', '/System/Library/Fonts/Supplemental/Times New Roman.ttf', '/Library/Fonts/Arial.ttf']
      : ['/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf', '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf', '/usr/share/fonts/TTF/DejaVuSerif.ttf'];
  return c.find((f) => fs.existsSync(f)) || null;
}

// ---------------------------------------------------------------- sound ---
const AUDIO_EXT = ['.wav', '.flac', '.m4a', '.mp3', '.aac', '.ogg'];
function audioDirs(o) { return [path.join(o.out, 'audio'), path.join(PLAN_DIR, 'audio')]; }
function findAudio(o, scene) {
  for (const dir of audioDirs(o)) {
    for (const n of [path.join('scenes', scene.key), scene.key]) {
      for (const e of AUDIO_EXT) { const f = path.join(dir, n + e); if (fs.existsSync(f)) return { file: f, offsetS: 0, kind: 'scene' }; }
    }
  }
  for (const dir of audioDirs(o)) {
    for (const n of [`${'S01E01'}_mix`, 'S01E01', 'episode_mix', 'episode-mix']) {
      for (const e of AUDIO_EXT) { const f = path.join(dir, n + e); if (fs.existsSync(f)) return { file: f, offsetS: scene.startFrame / FPS, kind: 'episode' }; }
    }
  }
  return null;
}

function episodeCues(o, plan) {
  for (const dir of audioDirs(o)) {
    const f = path.join(dir, 'S01E01.en.srt');
    if (fs.existsSync(f)) return { cues: readSrt(f), source: relp(f), estimated: false };
  }
  const shots = readJson(path.join(PLAN_DIR, 'shotlist.json'))?.shots || [];
  const lines = readJson(path.join(PLAN_DIR, 'dialogue.json'))?.lines || [];
  const jobs = plan.scenes.flatMap((s) => s.jobs);
  return { cues: estimateCues({ jobs, shots, lines, fps: FPS }), source: 'estimated from shotlist.json + dialogue.json', estimated: true };
}

// ------------------------------------------------------------- assembly ---
const sceneFile = (o, scene) => path.join(o.out, 'scenes', `${scene.key}${o.tag}.mp4`);

async function assembleScene(o, plan, scene, cues) {
  const problems = gateProblems(o, scene);
  if (problems.length) throw new Error(`not joined (render gate): ${problems.slice(0, 4).join('; ')}${problems.length > 4 ? `; +${problems.length - 4} more` : ''}`);
  const out = sceneFile(o, scene);
  const side = out.replace(/\.mp4$/, '.json');
  const inputs = scene.jobs.map((j) => ({ job: j.job, file: shotFile(o, scene, j), frames: j.frames, stat: statKey(shotFile(o, scene, j)) }));
  const audio = findAudio(o, scene);
  const want = {
    scene: scene.key, frames: scene.frames, width: o.W, height: o.H, master: { crf: o.masterCrf, preset: o.masterPreset },
    inputs: inputs.map(({ job, stat }) => ({ job, stat })),
    audio: audio ? { file: relp(audio.file), stat: statKey(audio.file), offsetS: audio.offsetS } : null,
  };
  const have = readJson(side);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const srt = out.replace(/\.mp4$/, '.en.srt');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const sceneCues = sliceCues(cues.cues, scene.startFrame / FPS, (scene.startFrame + scene.frames) / FPS);
  if (sceneCues.length) writeSrt(srt, sceneCues); else fs.rmSync(srt, { force: true });
  if (have && fs.existsSync(out) && statKey(out) === have.stat && same({ ...have.want }, want)) return 'up to date';
  const tmp = `${out}.part.mp4`;
  const listFile = path.join(o.out, 'scenes', `.concat-${scene.key.replace(/[^\w-]/g, '_')}.txt`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const dur = scene.frames / FPS;
  // video unchanged, only the sound is new: swap the sound, keep the picture
  const videoSame = have && fs.existsSync(out) && statKey(out) === have.stat && same(have.want.inputs, want.inputs) && same(have.want.master, want.master);
  const audioIn = audio ? ['-ss', audio.offsetS.toFixed(6), '-i', audio.file] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
  const audioOut = ['-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2', '-af', 'apad', '-t', dur.toFixed(6)];
  if (videoSame) {
    say(`  ${scene.key}: new sound (${audio ? relp(audio.file) : 'none'}) - replacing the sound track only`);
    await ffmpeg(['-i', out, ...audioIn, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', ...audioOut, '-movflags', '+faststart', '-f', 'mp4', tmp], `sound ${scene.key}`);
  } else {
    fs.writeFileSync(listFile, inputs.map((i) => `file '${i.file.replace(/'/g, "'\\''")}'\nduration ${(i.frames / FPS).toFixed(6)}\n`).join(''));
    say(`  ${scene.key}: joining ${inputs.length} shot(s), ${scene.frames} frames (${fmtDuration(dur)}), 10-bit CRF ${o.masterCrf}, ${audio ? `sound ${relp(audio.file)}${audio.offsetS ? ` from ${audio.offsetS.toFixed(2)} s` : ''}` : 'NO SOUND YET (silent track)'}`);
    try {
      await ffmpeg(['-f', 'concat', '-safe', '0', '-i', listFile, ...audioIn, '-map', '0:v:0', '-map', '1:a:0',
        ...passthrough(), ...x264Args({ crf: o.masterCrf, preset: o.masterPreset, bitDepth: 10 }), ...audioOut,
        '-metadata', `title=Dragon's Kingdom S01E01 - ${scene.key}${scene.title ? `: ${scene.title}` : ''}`,
        '-movflags', '+faststart', '-f', 'mp4', tmp], `scene ${scene.key}`);
    } finally { fs.rmSync(listFile, { force: true }); }
  }
  const v = probeVideo(tmp);
  if (!v || v.frames !== scene.frames) { fs.rmSync(tmp, { force: true }); throw new Error(`scene ${scene.key}: the joined file has ${v?.frames} frames, expected ${scene.frames} - nothing replaced`); }
  if (o.verifyFull) await verifyDecode(tmp, scene.frames);
  fs.rmSync(out, { force: true });
  fs.renameSync(tmp, out);
  writeJson(side, { want, stat: statKey(out), builtAt: new Date().toISOString(), cues: cues.estimated ? 'estimated' : cues.source });
  return 'built';
}

async function verifyDecode(file, frames) {
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-v', 'error', '-nostdin', '-i', file, '-map', '0:v:0', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 << 20, windowsHide: true });
  if (r.status !== 0 || (r.stderr || '').trim()) throw new Error(`${relp(file)}: decoder errors: ${(r.stderr || '').trim().split('\n')[0]}`);
  const j = ffprobeJson(file, ['-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames']);
  if (+j.streams?.[0]?.nb_read_frames !== frames) throw new Error(`${relp(file)}: ${j.streams?.[0]?.nb_read_frames} decodable frames, expected ${frames}`);
}

async function assembleEpisode(o, plan, cues) {
  const out4k = path.join(o.out, `${TITLE}${o.size ? '_TEST_' + o.size : '_4K'}.mp4`);
  const outSmall = path.join(o.out, `${TITLE}${o.size ? `_TEST_${o.phoneW}x${o.phoneH}` : '_1080p'}.mp4`);
  const srt = path.join(o.out, `${TITLE}.en.srt`);
  const side = path.join(o.out, 'episode.json');
  writeSrt(srt, cues.cues);
  const want = { scenes: plan.scenes.map((s) => ({ scene: s.key, stat: statKey(sceneFile(o, s)), audio: findAudio(o, s) ? relp(findAudio(o, s).file) : null })), srt: sha1(fs.readFileSync(srt)), phone: [o.phoneW, o.phoneH] };
  const have = readJson(side);
  if (have && JSON.stringify(have.want) === JSON.stringify(want) && statKey(out4k) === have.stat4k && statKey(outSmall) === have.statSmall) return 'up to date';
  const total = plan.totalFrames, dur = total / FPS;
  const list = path.join(o.out, '.concat-episode.txt');
  fs.writeFileSync(list, plan.scenes.map((s) => `file '${sceneFile(o, s).replace(/'/g, "'\\''")}'\nduration ${(s.frames / FPS).toFixed(6)}\n`).join(''));
  // sound: one continuous track, cut to every scene's exact length (no drift at the joins)
  const ain = [], filt = [];
  plan.scenes.forEach((s, i) => {
    const a = findAudio(o, s);
    const n = Math.round((s.frames / FPS) * 48000);
    if (a) ain.push('-ss', a.offsetS.toFixed(6), '-i', a.file);
    else ain.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
    filt.push(`[${i + 1}:a:0]aresample=48000,aformat=channel_layouts=stereo,atrim=end_sample=${n},apad=whole_len=${n}[a${i}]`);
  });
  filt.push(`${plan.scenes.map((_, i) => `[a${i}]`).join('')}concat=n=${plan.scenes.length}:v=0:a=1[aout]`);
  const subIdx = plan.scenes.length + 1;
  const hasSubs = cues.cues.length > 0;
  const subIn = hasSubs ? ['-i', srt] : [];
  const subOut = hasSubs ? ['-map', `${subIdx}:s:0`, '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng'] : [];
  const tmp = `${out4k}.part.mp4`;
  say(`  episode: joining ${plan.scenes.length} scene files (picture copied, not re-encoded), ${total} frames (${fmtDuration(dur)}), subtitles ${cues.estimated ? '(ESTIMATED timing)' : cues.source}`);
  try {
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, ...ain, ...subIn, '-filter_complex', filt.join(';'),
      '-map', '0:v:0', '-map', '[aout]', ...subOut, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k',
      '-metadata:s:a:0', 'language=eng', '-metadata', "title=Dragon's Kingdom - Season 1, Episode 1",
      '-t', dur.toFixed(6), '-movflags', '+faststart', '-f', 'mp4', tmp], 'episode');
  } finally { fs.rmSync(list, { force: true }); }
  const v = probeVideo(tmp);
  if (!v || v.frames !== total) { fs.rmSync(tmp, { force: true }); throw new Error(`episode: the joined file has ${v?.frames} frames, expected ${total} - nothing replaced`); }
  if (o.verifyFull) await verifyDecode(tmp, total);
  fs.rmSync(out4k, { force: true });
  fs.renameSync(tmp, out4k);
  say(`  wrote ${relp(out4k)} (${(fs.statSync(out4k).size / 2 ** 30).toFixed(2)} GB)`);
  // the copy for phones / TVs: 8-bit, ${o.phoneW}x${o.phoneH}
  const tmp2 = `${outSmall}.part.mp4`;
  say(`  episode: ${o.phoneW}x${o.phoneH} 8-bit copy for phones and TVs`);
  await ffmpeg(['-i', out4k, '-map', '0:v:0', '-map', '0:a:0', '-map', '0:s:0?', '-vf', `scale=${o.phoneW}:${o.phoneH}:flags=lanczos,format=yuv420p`,
    ...passthrough(), '-c:v', 'libx264', '-preset', o.masterPreset, '-crf', '19', '-profile:v', 'high', ...COLOR_TAGS,
    '-c:a', 'aac', '-b:a', '192k', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-movflags', '+faststart', '-f', 'mp4', tmp2], 'phone copy');
  const v2 = probeVideo(tmp2);
  if (!v2 || v2.frames !== total) { fs.rmSync(tmp2, { force: true }); throw new Error(`phone copy has ${v2?.frames} frames, expected ${total}`); }
  fs.rmSync(outSmall, { force: true });
  fs.renameSync(tmp2, outSmall);
  say(`  wrote ${relp(outSmall)} (${(fs.statSync(outSmall).size / 2 ** 30).toFixed(2)} GB)`);
  writeJson(side, { want, stat4k: statKey(out4k), statSmall: statKey(outSmall), builtAt: new Date().toISOString(), subtitles: cues.estimated ? 'estimated' : cues.source });
  return 'built';
}

// --------------------------------------------------------------- status ---
function speedModel(o, plan) {
  // measured on this PC: wall seconds per frame per set (setup + render + stitching)
  const per = {};
  for (const s of plan.scenes) for (const j of s.jobs) {
    const d = shotDone(o, s, j);
    if (d?.wallS && d.kind === '3d') { per[j.set] ??= { s: 0, f: 0 }; per[j.set].s += d.wallS; per[j.set].f += j.frames; }
  }
  const est = readJson(path.join(PROJECT_ROOT, 'output', 'gpu-check', 'gpu-check.json'))?.estimate;
  const ratio = o.gpu && est?.ratio ? est.ratio : 1;
  return (j) => (per[j.set]?.f ? per[j.set].s / per[j.set].f : (j.s_per_frame || 0) * ratio + (j.setup_s || 0) / Math.max(1, j.frames) * (o.gpu && est?.setupRatio ? est.setupRatio : 1));
}

function collectStatus(o, plan) {
  const spf = speedModel(o, plan);
  const rows = [];
  for (const s of plan.scenes) {
    const r = { scene: s.key, title: s.title, shots: s.jobs.length, done: 0, waiting: 0, unapproved: 0, changed: 0, outdated: 0, frames: s.frames, framesDone: 0, leftH: 0, stale: 0, file: null, sceneCurrent: false, reasons: [] };
    const why = (t) => { if (r.reasons.length < 3 && !r.reasons.includes(t)) r.reasons.push(t); };
    for (const j of s.jobs) {
      const d = shotDone(o, s, j);
      const appr = o.gated && j.render !== 'black' ? GATE.approved[j.job] : null;
      if (d && (!o.gated || j.render === 'black' || (appr && d.lockId === appr.lockId))) {
        r.done++; r.framesDone += j.frames; if (o.checkStale && d.kind === '3d' && staleFiles(o, d).length) r.stale++; continue;
      }
      if (d) { r.outdated++; why(`${j.job}: rendered under ${appr ? 'an older approval' : 'an approval that was withdrawn'} - not used`); }
      const res = resolveShot(j);
      if (!res.ready) { r.waiting++; why(res.reason); }
      else if (o.gated && j.render !== 'black') {
        const v = gateVerdict(GATE, j, res);
        if (!v.approved) { r.unapproved++; why(`not approved yet (${GATE_NAME})`); }
        else if (!v.current) { r.changed++; why(`${j.job}: files changed since it was approved: ${v.changed.join(', ')}`); }
      }
      r.leftH += (j.frames * spf(j)) / 3600;
    }
    const f = sceneFile(o, s);
    r.file = fs.existsSync(f) ? relp(f) : null;
    r.sceneCurrent = !!r.file && r.done === r.shots && sceneCurrent(o, s);
    rows.push(r);
  }
  return rows;
}

function printStatus(o, plan, rows) {
  const ep4k = path.join(o.out, `${TITLE}${o.size ? '_TEST_' + o.size : '_4K'}.mp4`);
  const lines = [];
  lines.push(hr('='), `Dragon's Kingdom S01E01 - render status ${new Date().toLocaleString()}`, `renderer: ${o.gpu ? `GPU (${savedGpuProfile()?.renderer || 'see gpu-check'})` : 'CPU (SwiftShader)'}   output: ${relp(o.out)}`);
  const nAppr = Object.keys(GATE.approved || {}).length;
  lines.push(o.gated ? `render gate: ${GATE.exists ? `${nAppr} shot(s) approved in ${GATE_NAME}` : `${GATE_NAME} does not exist yet - nothing but black cards is rendered`}${GATE.error ? ` - ${GATE.error}` : ''}`
    : 'render gate: IGNORED (--ignore-gate, TEST render)');
  lines.push(hr('='));
  lines.push(' #  scene            shots done  not approved  waiting  frames done        left (est.)  scene file');
  let td = 0, tf = 0, tl = 0, tw = 0, ts = 0, tu = 0, tc = 0, to = 0;
  rows.forEach((r, i) => {
    td += r.framesDone; tf += r.frames; tl += r.leftH; tw += r.waiting; ts += r.stale; tu += r.unapproved; tc += r.changed; to += r.outdated;
    const fileState = r.sceneCurrent ? 'DONE' : r.file ? (r.done === r.shots ? 'to be joined again' : 'OUT OF DATE (not used)') : r.done === r.shots && r.shots ? 'ready to join' : '';
    lines.push(`${String(i + 1).padStart(2)}  ${r.scene.padEnd(16)} ${`${r.done}/${r.shots}`.padStart(8)}  ${String(r.unapproved + r.changed).padStart(12)}  ${String(r.waiting).padStart(7)}  ${`${r.framesDone}/${r.frames}`.padStart(13)}  ${(r.leftH ? fmtH(r.leftH) : '-').padStart(11)}  ${fileState}${r.stale ? `  (${r.stale} stale)` : ''}`);
    for (const why of r.reasons) lines.push(`      waiting: ${why}`);
  });
  lines.push(hr(), `total: ${td}/${tf} frames (${tf ? ((100 * td) / tf).toFixed(1) : 0}%); about ${fmtH(tl)} of rendering left (ESTIMATE${o.gpu ? '' : ', CPU'})`);
  if (tu || tc) lines.push(`${tu + tc} shot(s) wait for the director's approval (${tu} not approved yet${tc ? `, ${tc} changed since their approval` : ''}): they are rendered after a later git pull brings it`);
  if (tw) lines.push(`${tw} shot(s) wait for their scene files (they arrive with git pull)`);
  if (to) lines.push(`${to} finished shot(s) were rendered under an approval that has changed: they are not used, and are rendered again once the new approval matches the files`);
  if (ts) lines.push(`${ts} finished shot(s) were rendered from files that have changed since (to render them again: ${renderCommand('--rerender-stale')})`);
  lines.push(fs.existsSync(ep4k) ? `EPISODE: ${relp(ep4k)}` : 'episode file: not yet (needs every scene)');
  const g = freeGB(o.out);
  if (g != null) lines.push(`free disk: ${g.toFixed(0)} GB`);
  const text = lines.join('\n');
  console.log(text);
  try { fs.mkdirSync(o.out, { recursive: true }); fs.writeFileSync(path.join(o.out, 'STATUS.txt'), text + '\n'); writeJson(path.join(o.out, 'status.json'), { at: new Date().toISOString(), gate: o.gated ? { file: GATE_NAME, exists: GATE.exists, approved: nAppr } : 'ignored', rows }); } catch {}
}

// ----------------------------------------------------------------- main ---
let PLAN_DIR = path.dirname(DEFAULT_SCHEDULE);

async function main() {
  const a = parseArgs(process.argv.slice(2), { booleans: ['help', 'status', 'dry-run', 'gpu', 'cpu', 'rerender-stale', 'no-assemble', 'assemble', 'keep-chunks', 'verify-full', 'skip-cache-check', 'stale', 'ignore-gate'] });
  if (a.help) { console.log(HELP); return 0; }
  const schedule = path.resolve(a.schedule || DEFAULT_SCHEDULE);
  PLAN_DIR = path.dirname(schedule);
  const o = {
    schedule, jobsFile: a.jobs ? path.resolve(a.jobs) : undefined,
    size: a.size || null, x264Preset: a.x264Preset || 'fast', masterPreset: a.masterPreset || 'medium',
    masterCrf: num(a.masterCrf, 'master-crf', { min: 0, max: 51 }) ?? 16, verifyFull: !!a.verifyFull,
  };
  if (o.size) {
    const m = /^(\d+)x(\d+)$/.exec(o.size);
    if (!m || +m[1] % 8 || +m[2] % 4) throw new Error('--size must look like 640x360 (width a multiple of 8, height of 4)');
    [o.W, o.H] = [+m[1], +m[2]];
  } else [o.W, o.H] = [3840, 2160];
  [o.phoneW, o.phoneH] = o.W >= 3840 ? [1920, 1080] : [Math.round(o.W / 4) * 2, Math.round(o.H / 4) * 2];
  o.tag = o.size ? `_TEST_${o.size}` : '';
  o.out = path.resolve(a.out || path.join(PROJECT_ROOT, 'output', o.size ? `episode1-test-${o.size}` : 'episode1'));
  fs.mkdirSync(o.out, { recursive: true });

  // renderer: the GPU gpu-check found, or the CPU when asked for
  const gpuSaved = savedGpuProfile();
  if (a.gpu && a.cpu) throw new Error('--gpu and --cpu together?');
  o.gpu = a.cpu ? false : a.gpu ? true : !!gpuSaved;
  const plan = loadPlan(o);
  o.checkStale = !!(a.status || a.stale || a.rerenderStale);
  // the render gate (render-ready.json): only approved shots go into masters
  if (a.ignoreGate && !o.size) throw new Error(`--ignore-gate is only for TEST renders (with --size, e.g. --size 960x540): masters render the shots approved in ${GATE_NAME} only`);
  o.gated = !a.ignoreGate;
  GATE = readGate(PLAN_DIR);

  if (a.status) { printStatus(o, plan, collectStatus(o, plan)); saveHashes(o); return 0; }

  LOG_FILE = path.join(PROJECT_ROOT, 'pc', 'logs', `episode${o.size ? '-test' : ''}.log`);
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  say(hr('='));
  say(`render/episode.mjs ${process.argv.slice(2).join(' ')}`.trim());
  if (!a.cpu && !a.gpu && !gpuSaved && !a.dryRun) {
    // what the last GPU check on this computer found (output/gpu-check/gpu-check.json), if it ran
    const last = readJson(path.join(PROJECT_ROOT, 'output', 'gpu-check', 'gpu-check.json'));
    const ranHere = last && last.system?.host === os.hostname();
    const cpuCmd = renderCommand('--cpu');
    if (ranHere && last.exitCode === 2) {
      say(`The GPU check ran on this computer (${last.date}) but found NO usable graphics card:`);
      say('  every way Chromium tried ended in software rendering (see the "GPU NOT USED" banner in pc/logs/gpu-check-*.txt).');
      say('  Fix the driver as that banner says, then run the GPU check again:');
    } else if (ranHere && last.exitCode) {
      say(`The GPU check on this computer stopped with an error (${last.date}): ${last.error || 'see pc/logs/gpu-check-*.txt'}`);
      say('  Run it again:');
    } else {
      say('No graphics card has been checked on this computer yet. Run the GPU check first');
      say('  (it finds the graphics card and estimates the render time):');
    }
    say(`    ${gpuCheckCommand()}`);
    say(`  or render with the processor only (very slow):  ${cpuCmd}`);
    return 2;
  }
  if (o.gpu && !gpuSaved && !process.env.DK_GPU_PROFILE) say('note: --gpu without a gpu-check result for this computer: using the default launch profile');
  say(`renderer: ${o.gpu ? `GPU - ${gpuSaved?.renderer || 'default profile'}` : 'CPU (SwiftShader)'};  output: ${relp(o.out)}${o.size ? `  (TEST size ${o.size}: not a master)` : ''}`);
  if (plan.orphans.length) say(`note: render-jobs.json has scenes that are not in the schedule: ${plan.orphans.join(', ')} (ignored)`);
  checkFfmpeg();

  if (!a.dryRun && !a.skipCacheCheck) {
    const missing = await cacheProblems();
    if (missing.length) {
      say('STOP: some git-ignored caches are missing or out of date, so pictures would not match the scenes as designed:');
      for (const m of missing) say(`  - ${m}`);
      say('  Fix: run the setup again (pc/setup-windows.ps1 or pc/setup.sh), or  node pc/build-caches.mjs');
      say('  (or add --skip-cache-check to render anyway)');
      return 1;
    }
  }

  const unlock = a.dryRun ? () => {} : lockJob(o.out);
  const onSig = () => {
    if (STOPPING) { say('second Ctrl+C: stopping now'); process.exit(130); }
    STOPPING = true;
    say('\nCtrl+C: stopping after the current step - finished work is kept; run the same command again to continue.');
  };
  process.on('SIGINT', onSig);
  process.on('SIGTERM', onSig);
  const t0 = Date.now();
  const maxMs = a.maxHours ? num(a.maxHours, 'max-hours', { min: 0 }) * 3600e3 : Infinity;
  const only = a.only ? new Set(String(a.only).split(',').map((s) => s.trim()).filter(Boolean)) : null;
  if (only) for (const k of only) if (!plan.scenes.some((s) => s.key === k)) throw new Error(`--only ${k}: no such scene (${plan.scenes.map((s) => s.key).join(', ')})`);
  const failed = [];
  let renderedShots = 0;
  try {
    const cues = episodeCues(o, plan);
    if (cues.estimated) say(`subtitles: ${cues.cues.length} cues, timing ESTIMATED from the shot list (a timed S01E01.en.srt from the sound mix replaces it)`);
    else say(`subtitles: ${cues.cues.length} cues from ${cues.source}`);
    for (const scene of plan.scenes) {
      if (STOPPING) break;
      if (only && !only.has(scene.key)) continue;
      say(hr());
      say(`scene ${scene.n} ${scene.key}${scene.title ? `: ${scene.title}` : ''} - ${scene.jobs.length} shot(s), ${scene.frames} frames (${fmtDuration(scene.frames / FPS)})`);
      let complete = true, waiting = 0, unapproved = 0, held = 0;
      for (const job of scene.jobs) {
        if (STOPPING) { complete = false; break; }
        const done = shotDone(o, scene, job);
        const gatedJob = o.gated && job.render !== 'black';
        const appr = gatedJob ? GATE.approved[job.job] : null;
        const drop = () => { if (!a.dryRun) { fs.rmSync(doneFile(o, scene, job), { force: true }); fs.rmSync(shotFile(o, scene, job), { force: true }); } };
        let r = null;
        if (done) {
          if (gatedJob && !(appr && done.lockId === appr.lockId)) {
            // finished, but not under the approval that holds now
            r = resolveShot(job);
            const v = r.ready ? gateVerdict(GATE, job, r) : null;
            if (v?.approved && v.current) {
              say(`  ${job.job}: approved again (with new files) since it was rendered -> rendering it again; its scene is joined again afterwards`);
              drop();
            } else {
              complete = false; held++;
              say(`  ${job.job.padEnd(8)} NOT USED - rendered under ${appr ? 'an older approval' : 'an approval that was withdrawn'}; ${!appr ? `it is not in ${GATE_NAME} any more` : !r.ready ? r.reason : `the files do not match the new approval yet (${v.changed.join(', ')})`}`);
              continue;
            }
          } else if (!o.gated && done.kind === 'text' && staleFiles(o, done).length) {
            // (ungated TEST render) cards cost seconds, so a changed credits text is made again without being asked
            say(`  ${job.job}: the card's text changed since it was made (${staleFiles(o, done).join(', ')}) -> making it again`);
            drop();
          } else if (a.rerenderStale && done.kind === '3d' && staleFiles(o, done).length) {
            const st = staleFiles(o, done);
            r = resolveShot(job);
            const v = gatedJob && r.ready ? gateVerdict(GATE, job, r) : null;
            if (gatedJob && !(v?.approved && v.current)) { say(`  ${job.job}: ${st.length} of its files changed since it was rendered, but the files now are not the approved ones - the approved render is kept`); continue; }
            say(`  ${job.job}: finished, but ${st.length} of its files changed since (${st.slice(0, 3).join(', ')}${st.length > 3 ? ', ...' : ''}) -> rendering again`);
            drop();
          } else continue;
        }
        r ??= resolveShot(job);
        if (!r.ready) { complete = false; waiting++; say(`  ${job.job.padEnd(8)} SKIPPED - ${r.reason}`); continue; }
        if (gatedJob) {
          const v = gateVerdict(GATE, job, r);
          if (!v.approved) { complete = false; unapproved++; say(`  ${job.job.padEnd(8)} SKIPPED - ${v.reason}`); continue; }
          if (!v.current) { complete = false; unapproved++; say(`  ${job.job.padEnd(8)} SKIPPED - approved, but changed since: ${v.changed.join(', ')} (waits until it is approved again)`); continue; }
          Object.assign(r, { lockId: v.lockId, lock: v.now.lock, approvedBy: v.entry.approvedBy ?? null });
        }
        if (Date.now() - t0 > maxMs) { say(`  --max-hours reached: not starting ${job.job}`); complete = false; STOPPING = true; break; }
        if (r.warn) say(`  ${job.job}: note: ${r.warn}`);
        const gb = freeGB(o.out);
        const needGB = (job.frames * (o.W * o.H) / (3840 * 2160) * 0.6 * 2) / 1024 + 2;
        if (gb != null && gb < needGB) { say(`STOP: only ${gb.toFixed(1)} GB free on the output drive, ${job.job} needs about ${needGB.toFixed(1)} GB. Free some space and run again.`); complete = false; STOPPING = true; break; }
        if (a.dryRun) { say(`  ${job.job.padEnd(8)} would render: ${r.kind === '3d' ? `${relp(r.scene)} from ${r.startS} s (${r.via})` : `${r.kind} card`}, ${job.frames} frames`); complete = false; continue; }
        if (r.kind !== '3d') {
          say(`  ${job.job.padEnd(8)} ${r.kind} card, ${job.frames} frames`);
          const err = await makeCard(o, scene, job, r);
          if (err) { failed.push(`${job.job}: ${err}`); complete = false; say(`  ${job.job}: FAILED - ${err}`); }
          continue;
        }
        say(`  ${job.job.padEnd(8)} ${job.frames} frames, set ${job.set} (${r.via})`);
        let workers = Number(a.workers ?? r.args?.workers ?? 2);
        let fresh = false, res = null, err = null;
        for (let attempt = 1; attempt <= 3 && !STOPPING; attempt++) {
          res = await renderShot(o, scene, job, r, { workers, fresh });
          if (res.code === 0) { err = finishShot(o, scene, job, r, res.wallS); break; }
          if (STOPPING || res.code === 130 || res.signal === 'SIGINT') { STOPPING = true; break; }
          const code = res.err?.code;
          if (code === 'GPU_SOFTWARE_FALLBACK') {
            if (LOG_FILE) try { fs.appendFileSync(LOG_FILE, res.err.message + '\n'); } catch {}   // (render.mjs already showed it)
            throw Object.assign(new Error('the graphics card is not being used - stopped (see the GPU NOT USED banner above)'), { exit: 2 });
          }
          if (code === 'JOB_MISMATCH' && !fresh) {
            say(`  ${job.job}: its unfinished chunks were made from older scene files or settings -> starting this shot over (--fresh)`);
            fresh = true; continue;
          }
          err = (res.err?.message || res.error || `render.mjs exited with ${res.code ?? res.signal}`).split('\n')[0];
          if (workers > 1) { say(`  ${job.job}: failed (${err}) - trying again with 1 browser`); workers = 1; continue; }
          if (attempt < 3) { say(`  ${job.job}: failed (${err}) - trying once more`); continue; }
        }
        if (STOPPING && !shotDone(o, scene, job)) { complete = false; break; }
        if (err || res?.code !== 0) { failed.push(`${job.job}: ${err || 'failed'}`); complete = false; say(`  ${job.job}: FAILED - ${err || 'failed'} (skipped; the rest continues)`); continue; }
        renderedShots++;
        say(`  ${job.job}: done in ${fmtDuration(res.wallS)} (${(res.wallS / job.frames).toFixed(1)} s per frame incl. setup)`);
        if (!a.keepChunks) fs.rmSync(path.join(shotDir(o, scene, job), 'chunks'), { recursive: true, force: true });
        printProgressLine(o, plan);
      }
      if (waiting) say(`  ${scene.key}: ${waiting} shot(s) are waiting for their scene files - they arrive with "git pull"; then ${renderCommand()}.`);
      if (unapproved) say(`  ${scene.key}: ${unapproved} shot(s) are waiting for the director's approval (${GATE_NAME}) - it also arrives with "git pull".`);
      if (held) say(`  ${scene.key}: ${held} finished shot(s) do not match their current approval: the scene is not joined until they do.`);
      if (!complete && !a.dryRun && fs.existsSync(sceneFile(o, scene)) && !sceneCurrent(o, scene)) say(`  ${scene.key}: the scene file from before (${relp(sceneFile(o, scene))}) is out of date and is not used.`);
      if (complete && !a.dryRun && !a.noAssemble && !STOPPING) {
        try { const r = await assembleScene(o, plan, scene, cues); say(`  scene file ${relp(sceneFile(o, scene))}: ${r}`); } catch (e) { failed.push(`scene ${scene.key}: ${e.message}`); say(`  scene ${scene.key}: FAILED to join - ${e.message}`); }
      }
    }
    // ---- the episode
    if (!a.dryRun && !a.noAssemble && !STOPPING && !only) {
      // every scene file joined from exactly the shots there now, each rendered under its current approval
      const ready = plan.scenes.every((s) => sceneCurrent(o, s) && !gateProblems(o, s).length);
      say(hr());
      if (ready) {
        const r = await assembleEpisode(o, plan, cues);
        say(`episode: ${r}`);
        const silent = plan.scenes.filter((s) => !findAudio(o, s)).map((s) => s.key);
        if (silent.length) say(`WARNING: these scenes have no sound yet: ${silent.join(', ')} - the episode is not finished until they do.`);
        if (cues.estimated) say('NOTE: subtitle timing is estimated (no timed S01E01.en.srt yet).');
      } else say('episode: not assembled yet - it needs every scene file (see the status below).');
    }
  } finally {
    process.off('SIGINT', onSig);
    process.off('SIGTERM', onSig);
    unlock();
    saveHashes(o);
  }
  say(hr());
  if (!a.dryRun) printStatus(o, plan, collectStatus(o, plan));
  say(`this run: ${renderedShots} shot(s) rendered in ${fmtDuration((Date.now() - t0) / 1000)}${failed.length ? `, ${failed.length} problem(s):` : ''}`);
  for (const f of failed) say(`  - ${f}`);
  if (STOPPING) { say('stopped - run the same command again to continue.'); return 130; }
  return failed.length ? 1 : 0;
}

function printProgressLine(o, plan) {
  let d = 0, t = 0;
  for (const s of plan.scenes) for (const j of s.jobs) { t += j.frames; if (shotDone(o, s, j)) d += j.frames; }
  say(`  episode progress: ${d}/${t} frames (${((100 * d) / t).toFixed(1)}%)`);
}

async function cacheProblems() {
  try {
    const m = await import('../pc/build-caches.mjs');
    return (await m.checkCaches()).filter((c) => !c.ok).map((c) => `${c.name}: ${c.problem}`);
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return [];
    return [`cache check failed: ${e.message}`];
  }
}

main().then((c) => process.exit(c), (e) => {
  say(`\nerror: ${e.message}`);
  if (process.env.DK_DEBUG) console.error(e.stack);
  process.exit(e.exit ?? 1);
});
