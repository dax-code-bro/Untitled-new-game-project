#!/usr/bin/env node
// Engine phase 7 (engine/DESIGN.md 5.5, section 2 row 10): THE PC PACKAGE of an engine-made episode.
//   node engine/package.mjs --episode t00 [--check]          (make-episode runs it as `--final` / `--stage package`)
// Writes, from final/shotlist.json, the shot tables and the drafts:
//   final/render-jobs.json     one job per shot: a Node port of episodes/s01e01/tools/shotlist/final_render_schedule.py
//                              (seconds per 4K frame per set, chunks of at most ~25 min of one browser, --preset final,
//                              velocity blur, 10-bit CRF 12; the command names the shot-list set's scene + "<shot start, s>",
//                              which render/lib/shots.mjs resolves through the shot tables, shotSet tables included)
//   final/render-schedule.md   the per-scene delivery table render/episode.mjs and render/gpu-check.mjs read
//   final/render-ready.json    the GATE: `render/gate.mjs approve` for every REVIEWED and UNFLAGGED shot
//                                reviewed  = it has a fresh D1 still or D2 video draft (the owner looked at the draft cut)
//                                unflagged = no FLAG / E_ / W_ in final/stage-report.json, or the owner signed it off in
//                                            episodes/<ep>/review.json { "ok": { "<shot>": "<what was looked at>" } }
//   final/audio/<TAG>_mix.wav + <TAG>.en.srt + delivery.json   the sound delivery: the draft cut's mix (scenes/lib/sound/mix.mjs),
//                              used by the masters when its length matches the episode's (wav never in git: pc/pack-sound.mjs)
// Then on the PC:  pc\Render-Episode.cmd --episode <ep>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { dirs, episodeArg, episodeConfig, episodeCuts, ROOT } from '../scenes/lib/director/episode-paths.js';
import { SETS } from '../scenes/lib/director/registry.js';
import { draftState, readJson } from './lib/drafts.mjs';

const FPS = 24;
const TWO_BROWSER_GAIN = 1.10;           // MEASURED (README benchmark), as final_render_schedule.py
const CHUNK_FRAMES = [48, 24, 12, 6];
const CHUNK_BUDGET_S = 1500;
const SETUP_S = 100;
const MB_PER_FRAME_SHOT = [0.28, 0.56], MB_PER_FRAME_MASTER = [0.15, 0.30];
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const n0 = (v) => Math.round(v).toLocaleString('en-US');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const GEN = 'engine/package.mjs';

/** Seconds per native-4K frame of a shot: the shot list's (Episode 1 medians per set), else the set sheet's estimate. */
function spfOf(s) {
  const e = s.native_4k_s_per_frame;
  if (e?.expected) return { expected: e.expected, low: e.low ?? e.expected, high: e.high ?? e.expected, basis: e.basis || '' };
  const base = SETS[s.set]?.shotSet || s.set;
  const sh = readJson(path.join(ROOT, 'scenes/lib/director/sets/sheets', `${base}.json`));
  const x = sh?.cost?.native_4k_s_per_frame ?? 100;
  return { expected: x, low: Math.round(x * 0.8), high: Math.round(x * 1.33), basis: sh?.cost?.basis || 'ESTIMATE: no measure for this set (100 s per frame)' };
}

export function renderJobs(ep) {
  const D = dirs(ep);
  const sl = readJson(D.shotlist);
  const jobs = sl.shots.map((s) => {
    const spf = s.render === '3d' ? spfOf(s) : { expected: 0, low: 0, high: 0, basis: 'no 3D render' };
    const frames = s.frames_at_24fps;
    const chunk = s.render === '3d' ? (CHUNK_FRAMES.find((c) => c * spf.expected <= CHUNK_BUDGET_S) ?? CHUNK_FRAMES.at(-1)) : null;
    const file = SETS[s.set]?.file;
    return {
      job: s.id, seq: s.seq, scene: s.scene, part: s.part ?? null, set: s.set, render: s.render, frames, seconds: s.est_seconds,
      s_per_frame: spf.expected, s_per_frame_range: [spf.low, spf.high], basis: spf.basis,
      chunk_frames: chunk, chunk_seconds: chunk ? chunk / FPS : null, chunks: chunk ? Math.ceil(frames / chunk) : 0,
      hours_1_browser: +(frames * spf.expected / 3600).toFixed(3), setup_s: s.render === '3d' ? SETUP_S : 0, sub_frames: null,
      command: s.render !== '3d' || !file ? null
        : `node render/render.mjs ${rel(path.join(D.scenes, file))} --preset final --cinematic velocity --start <shot start, s> --seconds ${(frames / FPS).toFixed(6)} --workers 2 --chunk-seconds ${(chunk / FPS).toFixed(4)} --bit-depth 10 --crf 12 --out output/${ep}/${s.scene}/${s.id}`,
    };
  });
  const scenes = [];
  let t = 0;
  for (const r of sl.scene_totals) {
    const js = jobs.filter((j) => j.scene === r.scene);
    const fr = js.reduce((a, j) => a + j.frames, 0), fr3d = js.filter((j) => j.render === '3d').reduce((a, j) => a + j.frames, 0);
    const h = js.reduce((a, j) => a + j.frames * j.s_per_frame, 0) / 3600;
    const lo = js.reduce((a, j) => a + j.frames * j.s_per_frame_range[0], 0) / 3600, hi = js.reduce((a, j) => a + j.frames * j.s_per_frame_range[1], 0) / 3600;
    const setup = js.reduce((a, j) => a + j.setup_s, 0) / 3600;
    const wall = h / TWO_BROWSER_GAIN + setup;
    scenes.push({ key: r.scene, title: r.title, start: t, len: fr / FPS, shots: js.length, jobs: js.filter((j) => j.render === '3d').length, frames: fr, fr3d, h, lo, hi, wall, spf: fr3d ? h * 3600 / fr3d : 0 });
    t += fr / FPS;
  }
  const T = { frames: scenes.reduce((a, s) => a + s.frames, 0), fr3d: scenes.reduce((a, s) => a + s.fr3d, 0), h: scenes.reduce((a, s) => a + s.h, 0), lo: scenes.reduce((a, s) => a + s.lo, 0), hi: scenes.reduce((a, s) => a + s.hi, 0), wall: scenes.reduce((a, s) => a + s.wall, 0) };
  const meta = {
    status: 'PLAN for the render PC. Seconds per frame are Episode 1 estimates per set (or the generated set\'s sheet estimate); the PC measures the real ones (STATUS.txt).',
    source: rel(D.shotlist), source_sha256: sha256(D.shotlist), generated_by: `${GEN} (a Node port of episodes/s01e01/tools/shotlist/final_render_schedule.py)`,
    rules: ['Native 3840x2160, --preset final on every frame. No final-fast, no --twos for masters.', 'One render.mjs job per shot; chunks of at most ~25 min of one browser.', 'Intermediates: 10-bit CRF 12.'],
    totals: { frames: T.frames, frames_3d: T.fr3d, hours_1_browser: +T.h.toFixed(1), hours_range: [+T.lo.toFixed(1), +T.hi.toFixed(1)], wall_hours_2_browsers: +T.wall.toFixed(1) },
  };
  const bySet = new Map();
  for (const j of jobs) { const b = bySet.get(j.set) || { shots: 0, frames: 0, h: 0, spf: j.s_per_frame, basis: j.basis }; b.shots++; b.frames += j.frames; b.h += j.frames * j.s_per_frame / 3600; bySet.set(j.set, b); }
  const cfg = episodeConfig(ep) || {};
  const md = [
    `# Dragon's Kingdom ${ep.toUpperCase()}: native 4K render schedule`, '',
    `> Made by \`${GEN}\` from \`final/shotlist.json\` (${cfg.title || ep}); the per-shot jobs are \`render-jobs.json\`, the approvals \`render-ready.json\` (\`render/gate.mjs\`). On the PC: \`pc\\Render-Episode.cmd --episode ${ep}\`.`, '',
    `- **${n0(T.frames)} frames** (${mmss(T.frames / FPS)}), ${n0(T.fr3d)} of them 3D; about **${T.h.toFixed(1)} h of rendering for one browser on the cloud machine's CPU** (range ${T.lo.toFixed(1)}-${T.hi.toFixed(1)} h). A graphics card (the render PC's) is tens of times faster: \`pc\\GPU-Check.cmd\` measures it, \`STATUS.txt\` tracks it.`, '',
    '## Per scene, in delivery order', '',
    '| # | Scene | Starts | Length | Shots / jobs | Frames | Mean s/frame | Render h (1 browser) | Range h | Wall h (2 browsers) | Days | Intermediates GB | Scene master GB |',
    '|---:|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---|---|',
    ...scenes.map((s, i) => `| ${i + 1} | ${s.key}: ${s.title || ''} | ${mmss(s.start)} | ${mmss(s.len)} | ${s.shots} / ${s.jobs} | ${n0(s.frames)} | ${Math.round(s.spf)} | ${s.h.toFixed(1)} | ${s.lo.toFixed(1)}-${s.hi.toFixed(1)} | ${s.wall.toFixed(1)} | ${(s.wall / 24).toFixed(1)} | ${(s.fr3d * MB_PER_FRAME_SHOT[0] / 1024).toFixed(1)}-${(s.fr3d * MB_PER_FRAME_SHOT[1] / 1024).toFixed(1)} | ${(s.frames * MB_PER_FRAME_MASTER[0] / 1024).toFixed(1)}-${(s.frames * MB_PER_FRAME_MASTER[1] / 1024).toFixed(1)} |`),
    `| | **Total** | | **${mmss(T.frames / FPS)}** | **${jobs.length} / ${jobs.filter((j) => j.render === '3d').length}** | **${n0(T.frames)}** | | **${T.h.toFixed(1)}** | ${T.lo.toFixed(1)}-${T.hi.toFixed(1)} | **${T.wall.toFixed(1)}** | **${(T.wall / 24).toFixed(1)}** | | |`, '',
    '## Seconds per 4K frame, by set', '',
    '| Set | Shots | Frames | s per 4K frame | Hours (1 browser) | Basis |', '|---|---:|---:|---:|---:|---|',
    ...[...bySet].map(([k, b]) => `| ${k} | ${b.shots} | ${n0(b.frames)} | ${b.spf} | ${b.h.toFixed(1)} | ${b.basis} |`), '',
  ].join('\n');
  return { jobsJson: JSON.stringify({ meta, jobs }, null, 1) + '\n', md, jobs };
}

/** Which shots the gate may approve: [{ job, ok, why }] */
export async function reviewState(ep) {
  const D = dirs(ep);
  const sl = readJson(D.shotlist).shots.filter((s) => s.render === '3d');
  const rep = new Map((readJson(path.join(D.final, 'stage-report.json'))?.shots || []).map((r) => [r.id, r]));
  const review = readJson(path.join(D.episode, 'review.json'), {})?.ok || {};
  const st = { stills: await draftState(ep, 'stills'), video: await draftState(ep, 'video') };
  return sl.map((s) => {
    const fresh = st.video.get(s.id)?.fresh ? 'D2' : st.stills.get(s.id)?.fresh ? 'D1' : null;
    const flags = (rep.get(s.id)?.flags || []).filter((f) => /^(FLAG|E_|W_)/.test(f));
    if (!rep.has(s.id)) return { job: s.id, ok: false, why: 'not staged' };
    if (!fresh) return { job: s.id, ok: false, why: 'no up-to-date D1 / D2 draft to review (make-episode --draft stills)' };
    if (flags.length && !review[s.id]) return { job: s.id, ok: false, why: `flagged (${flags.join('; ')}): touch it up, or sign it off in episodes/${ep}/review.json` };
    return { job: s.id, ok: true, why: `${fresh} draft reviewed${flags.length ? `; flag signed off: ${review[s.id]}` : ''}` };
  });
}

function soundDelivery(ep, jobs) {
  const D = dirs(ep), TAG = ep.toUpperCase();
  const cut = (episodeCuts(ep)?.[0]?.scenes || []).join('-');
  const dir = path.join(D.audio, 'cuts', cut);
  const wav = path.join(dir, 'mix.wav');
  const notes = [];
  const pk = { about: `Sound files of ${ep} that are not in git (SERIES.md section 2) and how they reach the render PC (pc/sound-delivery.mjs, pc/pack-sound.mjs, pc/build-caches.mjs family 'sound'). Written by ${GEN}.`, packages: [] };
  if (fs.existsSync(D.takes)) pk.packages.push({ id: `${ep}-vo`, what: `${ep} voice takes (engine/vo/make_vo.py)`, dir: rel(D.final), files_from: rel(D.takes), needed_for: 'mixing the sound. Not needed to render pictures.', archive: null });
  const mix = { id: `${ep}-mix`, what: `${ep} sound mix: ${TAG}_mix.wav (the whole episode) + ${TAG}.en.srt timed to it (scenes/lib/sound/mix.mjs of the draft cut ${cut})`, dir: rel(D.audio), files: [], needed_for: 'the sound of the scene files and of the episode (render/episode.mjs adds it without rendering pictures again)', archive: null };
  const rep = readJson(path.join(dir, 'mix-report.json'));
  const total = jobs.reduce((a, j) => a + j.frames, 0);
  if (fs.existsSync(wav)) {
    // the mix belongs to the draft cut's timeline: it serves the masters only when the lengths agree (cuts only, no handles)
    const edlFrames = readJson(D.edl('edl'))?.frames ?? readJson(D.edl('edl'))?.total_frames ?? null;
    if (edlFrames != null && edlFrames !== total) notes.push(`sound: the draft cut is ${edlFrames} frames, the episode ${total}: the mix is NOT delivered (re-mix after the cut matches)`);
    else {
      fs.copyFileSync(wav, path.join(D.audio, `${TAG}_mix.wav`));
      const srt = fs.readdirSync(dir).find((f) => f.endsWith('.en.srt'));
      if (srt) fs.copyFileSync(path.join(dir, srt), path.join(D.audio, `${TAG}.en.srt`));
      const f = path.join(D.audio, `${TAG}_mix.wav`);
      mix.files.push({ path: `${TAG}_mix.wav`, bytes: fs.statSync(f).size, sha256: sha256(f) });
      notes.push(`sound: ${rel(f)} (${rep?.result ? `I ${rep.result.I} LUFS, TP ${rep.result.TP} dBTP` : 'mix'})${srt ? ` + ${TAG}.en.srt` : ''}; pack + publish it for the PC: node pc/pack-sound.mjs --episode ${ep}`);
    }
  } else notes.push(`sound: no mix of the draft cut yet (make-episode --stage mix): the masters get silence until it is delivered`);
  pk.packages.push(mix);
  return { json: JSON.stringify(pk, null, 1) + '\n', notes };
}

export async function makePackage(ep, { check = false, log = console.log } = {}) {
  const D = dirs(ep);
  if (ep === 's01e01') throw new Error('s01e01 has its own plan (episodes/s01e01/tools/shotlist/final_render_schedule.py)');
  const { jobsJson, md, jobs } = renderJobs(ep);
  const out = [];
  const write = (f, text) => { const old = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; if (old === text) return; out.push(rel(f)); if (!check) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); } };
  write(D.renderJobs, jobsJson);
  write(path.join(D.final, 'render-schedule.md'), md);
  if (check) return { changed: out };
  // the gate: approve every reviewed + unflagged shot (with the files as they are now)
  const rs = await reviewState(ep);
  const ok = rs.filter((r) => r.ok).map((r) => r.job);
  const notes = [];
  if (ok.length) {
    const r = spawnSync(process.execPath, ['render/gate.mjs', 'approve', ok.join(','), '--episode', ep, '--by', 'engine (make-episode --final)', '--note', 'reviewed D1/D2 draft; no open flag, or signed off in review.json'], { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`gate approve failed:\n${r.stdout}${r.stderr}`);
  }
  notes.push(`gate: ${ok.length} of ${rs.length} shot(s) approved${rs.some((r) => !r.ok) ? `; waiting: ${rs.filter((r) => !r.ok).map((r) => `${r.job} (${r.why})`).join('; ')}` : ''}`);
  const sd = soundDelivery(ep, jobs);
  write(path.join(D.audio, 'delivery.json'), sd.json);
  notes.push(...sd.notes);
  notes.push(`on the PC: pc\\Render-Episode.cmd --episode ${ep}   (status here: node render/episode.mjs --episode ${ep} --status)`);
  for (const f of out) log(`wrote ${f}`);
  for (const n of notes) log(n);
  return { changed: out, notes, review: rs };
}

async function main() {
  const { ep, argv } = episodeArg(process.argv.slice(2), null);
  if (!ep) throw new Error('--episode <id> is required');
  const r = await makePackage(ep, { check: argv.includes('--check') });
  if (argv.includes('--check') && r.changed.length) { console.log(`out of date: ${r.changed.join(', ')}`); process.exit(1); }
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(e.message || e); process.exit(1); });
