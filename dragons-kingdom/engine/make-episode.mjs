#!/usr/bin/env node
// Engine phase 6: ONE COMMAND for an episode (engine/DESIGN.md 5).
//
//   node engine/make-episode.mjs --episode t00 [--stage parse|validate|cast|sets|stage|previs|vo|draft|cut|mix|package|all]
//        [--draft animatic|stills|video] [--scenes 0A,..] [--only 0A-02,..] [--restage] [--force] [--status] [--detach]
//
// Stages, in the order `all` runs them (vo before stage: build-shots times the lines from the real takes):
//   parse     input/ -> dialogue.json, onscreen-text.json, lines.lock.json, shotlist.json, sets.plan.json  (validate.mjs --write)
//   validate  the inputs -> validation.md; errors stop the run                                           (validate.mjs)
//   cast      shotlist.json -> cast.lock.json                                                            (casting.mjs)
//   sets      every set of the shot list has a registry entry, a builder and a sheet (phase 7 adds the generator)
//   vo        dialogue.json -> voices.json, vo/<line>.wav, vo/takes.json + words.json  (engine/vo/make_vo.py; Kokoro, else espeak-ng)
//   stage     the auto-stager -> specs/<builder>.auto|touch|spec.js + stage-report, then build-shots (shot tables, EDLs,
//             audio cues). Per-shot keys hash(row, sheet, cast lock entry, touch entry) say which shots changed; the stager
//             is deterministic, so unchanged shots keep byte-identical entries. A set being rendered (engine/queue/<SET>.lock)
//             gets <builder>.auto.next.js instead (swapped in by the queue). A newer stager re-stages only with --restage.
//   previs    D0 animatic frames (engine/previs/animatic.mjs), per shot: only shots whose key changed are redrawn
//   draft     --draft animatic: nothing to render (D0 is previs). stills (D1) / video (D2): the shots whose render key
//             changed are queued, one job per set, and the DETACHED queue (engine/queue.mjs) is started. With --detach the
//             command returns at once and the queue runs cut + mix itself when it is done; without it, it waits.
//   cut       the draft cut, best picture per shot D2 > D1 > D0 > slate, with the voice takes (make-cut.mjs)
//   mix       the shared mixer (scenes/lib/sound/mix.mjs): beds by set, spots from `sound:`, -16 LUFS; the mixed mp4 is
//             copied to final/cut/DragonsKingdom_<EP>_draft-cut_<cut>_mix.mp4
//   package   phase 7 (the PC package): reported as not built yet
// Stamps: episodes/<ep>/engine/state.json { stages: { <stage>: { inputsHash, outputsHash, at, ok, ms } }, shots: {...} }.
// A stage whose inputs and outputs are unchanged is skipped (--force runs it anyway). --status / every run writes
// episodes/<ep>/engine/REPORT.md (per scene: staged / flagged / approved, draft tier, renders done and left + ETA,
// warnings, the queue, the next command).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { dirs, episodeArg, episodeConfig, episodeCuts, ROOT } from '../scenes/lib/director/episode-paths.js';
import { SETS } from '../scenes/lib/director/registry.js';
import { sha1, fileHash, readJson, draftState, previsKeys, queuePaths, lockHolder } from './lib/drafts.mjs';
import { loadEpisodeSets } from './previs/animatic.mjs';
import { enqueue, startDetached, liveness, loadQueue, statusText } from './queue.mjs';

const ORDER = ['parse', 'validate', 'cast', 'sets', 'vo', 'stage', 'previs', 'draft', 'cut', 'mix', 'package'];
const { ep: EP, argv } = episodeArg(process.argv.slice(2), null);
const opt = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const flag = (n) => argv.includes(n);
if (!EP) { console.error('usage: node engine/make-episode.mjs --episode <id> [--stage ...|all] [--draft animatic|stills|video] [--status] (see the header)'); process.exit(2); }
if (EP === 's01e01' && !flag('--status')) { console.error('s01e01 is hand-made (Episode 1 specs, takes and mixes are frozen): make-episode runs on new episodes only'); process.exit(2); }
const D = dirs(EP);
const CFG = episodeConfig(EP) || {};
const TIER = opt('--draft', CFG.draftTier || 'animatic');
if (!['animatic', 'stills', 'video'].includes(TIER)) throw new Error('--draft animatic|stills|video');
if (TIER === 'video' && !opt('--scenes') && !opt('--only') && !CFG.test) throw new Error('--draft video needs --scenes or --only (about 4 CPU-hours per minute)');
const FORCE = flag('--force'), RESTAGE = flag('--restage'), DETACH = flag('--detach');
const SCENES = opt('--scenes') ? new Set(opt('--scenes').split(',')) : null;
const ONLY = opt('--only') ? new Set(opt('--only').split(',')) : null;
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const STATE_F = path.join(D.engine, 'state.json');
const state = readJson(STATE_F, { episode: EP, stages: {}, shots: {} });
const saveState = () => { fs.mkdirSync(D.engine, { recursive: true }); fs.writeFileSync(STATE_F, JSON.stringify(state, null, 1) + '\n'); };
const NODE = process.execPath;
const VENV_PY = path.join(ROOT, 'episodes/s01e01/final/tools/preview-venv/bin/python');
const cutName = () => (episodeCuts(EP)?.[0]?.scenes || []).join('-');
const cutMp4 = () => path.join(D.cut, `DragonsKingdom_${D.tag}_draft-cut_${cutName()}.mp4`);
const mixMp4 = () => path.join(D.cut, `DragonsKingdom_${D.tag}_draft-cut_${cutName()}_mix.mp4`);
const shotPick = (job, scene) => (!SCENES || SCENES.has(scene)) && (!ONLY || ONLY.has(job));

function sh(cmd, args, label) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0) { const e = new Error(`${label} failed (exit ${r.status}):\n${out.split('\n').slice(-25).join('\n')}`); e.out = out; throw e; }
  return out;
}
const hashFiles = (files) => sha1(files.map((f) => `${rel(f)}:${fileHash(f)}`).join('\n'));
const filesIn = (dir, re) => { try { return fs.readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => path.join(dir, f)); } catch { return []; } };
const codeOf = (...globs) => globs.flatMap((g) => (g.endsWith('/') ? filesIn(path.join(ROOT, g), /\.(m?js|json|py)$/) : [path.join(ROOT, g)]));
const shotlist = () => readJson(D.shotlist, { shots: [] });
const setsOfShots = () => [...new Set(shotlist().shots.filter((s) => s.render !== 'black').map((s) => s.set))];
const SHEET = (set) => [set, set.replace(/_\d+$/, '')].map((s) => path.join(ROOT, 'scenes/lib/director/sets/sheets', `${s}.json`)).find((f) => fs.existsSync(f));
const stagerVersion = async () => (await import('./stager/stage.mjs')).STAGER_VERSION;

// ------------------------------------------------------------------ stages ---
// inputs(): files (hashed) + extra values; outputs(): files that must exist (hashed after the run); run(): returns notes
const STAGES = {
  parse: {
    inputs: () => ({ files: [path.join(D.input, 'screenplay.fountain'), path.join(D.input, 'shotlist.txt'), ...codeOf('engine/input/')] }),
    outputs: () => ['dialogue.json', 'onscreen-text.json', 'lines.lock.json', 'shotlist.json', 'sets.plan.json'].map((f) => path.join(D.final, f)),
    run: () => { const o = sh(NODE, ['engine/input/validate.mjs', '--episode', EP, '--write'], 'parse'); return o.split('\n').filter((l) => /error|warning/i.test(l)).slice(0, 3); },
  },
  validate: {
    inputs: () => ({ files: [path.join(D.input, 'screenplay.fountain'), path.join(D.input, 'shotlist.txt'), ...codeOf('engine/input/')] }),
    outputs: () => [path.join(D.final, 'validation.md')],
    run: () => { sh(NODE, ['engine/input/validate.mjs', '--episode', EP], 'validate'); return [fs.readFileSync(path.join(D.final, 'validation.md'), 'utf8').split('\n').find((l) => /errors?/i.test(l)) || 'ok']; },
  },
  cast: {
    inputs: () => ({ files: [D.shotlist, ...codeOf('engine/cast/', 'scenes/lib/humans/cast-list.js')] }),
    outputs: () => [path.join(D.final, 'cast.lock.json')],
    run: () => [sh(NODE, ['engine/cast/casting.mjs', '--episode', EP], 'cast').trim().split('\n').pop()],
  },
  sets: {
    inputs: () => ({ files: [D.shotlist, path.join(D.final, 'sets.plan.json')], extra: setsOfShots().map((s) => `${s}:${!!SETS[s]}:${!!SHEET(s)}`) }),
    outputs: () => [],
    run: () => {
      const bad = setsOfShots().filter((s) => !SETS[s] || !SHEET(s));
      if (bad.length) throw new Error(`sets without a registry entry / sheet: ${bad.join(', ')} (the set generator is phase 7)`);
      return [`${setsOfShots().length} set(s) exist: ${setsOfShots().join(', ')}`];
    },
  },
  vo: {
    inputs: () => ({ files: [D.dialogue, D.shotlist, path.join(D.final, 'voices.json'), ...codeOf('engine/vo/make_vo.py', 'episodes/s01e01/preview/tools/make_vo.py')] }),
    outputs: () => [D.takes, D.words, ...(readJson(D.takes)?.takes || []).map((t) => path.join(D.final, t.file))],
    run: () => {
      const py = fs.existsSync(VENV_PY) ? VENV_PY : 'python3';
      const o = sh(py, ['-I', 'engine/vo/make_vo.py', '--episode', EP, ...(py === VENV_PY ? [] : ['--engine', 'espeak'])], 'vo');
      return [o.trim().split('\n').pop()];
    },
  },
  stage: {
    inputs: async () => {
      const rows = shotlist().shots.filter((s) => s.render !== 'black');
      const lock = readJson(path.join(D.final, 'cast.lock.json'), {});
      const touch = filesIn(D.specs, /\.touch\.js$/);
      const keys = {};
      for (const r of rows) keys[r.id] = sha1(JSON.stringify({ r, sheet: readJson(SHEET(r.set) || '')?.generated ?? null, cast: lock.shots?.[r.id] ?? null, touch: touch.map(fileHash) }));
      const pinned = state.stages.stage?.stager;
      const v = await stagerVersion();
      return { files: [D.takes, D.words, ...touch, ...codeOf('scenes/lib/director/tools/build-shots.mjs')], extra: [`stager:${RESTAGE || pinned == null ? v : pinned}`], shots: keys };
    },
    outputs: () => [...filesIn(D.specs, /\.(auto|spec)\.js$/), path.join(D.final, 'stage-report.json'), D.edl('edl')],
    run: async (inp) => {
      const notes = [];
      const v = await stagerVersion();
      const pinned = state.stages.stage?.stager;
      if (pinned != null && pinned !== v && !RESTAGE) notes.push(`stager v${v} is newer than the specs' v${pinned}: --restage to re-stage (re-renders every changed shot)`);
      const prevKeys = state.stages.stage?.shots || {};
      const changed = Object.keys(inp.shots).filter((k) => prevKeys[k] !== inp.shots[k]);
      // stage (the write.mjs main loop, with the .next redirect for locked sets)
      const { stageEpisode, reportText } = await import('./stager/write.mjs');
      const { STAGER_VERSION } = await import('./stager/stage.mjs');
      const rows = shotlist().shots.filter((s) => s.render !== 'black');
      const castLock = readJson(path.join(D.final, 'cast.lock.json'));
      const before = new Map();
      for (const f of filesIn(D.specs, /\.auto\.js$/)) before.set(f, fs.readFileSync(f, 'utf8'));
      const { files, reports } = stageEpisode(EP, rows, { scenesDir: D.scenes, castLock, faces: CFG.faces || 'avoid', title: CFG.title ? `${D.tag} - ${CFG.title}` : null });
      files.set(path.join(D.final, 'stage-report.json'), JSON.stringify({ episode: EP, stager: STAGER_VERSION, generated_by: 'engine/stager/write.mjs', shots: reports.map(({ checks, ...r }) => r) }, null, 1) + '\n');
      files.set(path.join(D.final, 'stage-report.md'), reportText(EP, reports));
      for (const [f, val] of files) {
        const once = typeof val === 'object', text = once ? val.text : val;
        const old = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
        if ((once && old != null) || old === text) continue;
        let out = f;
        if (f.endsWith('.auto.js')) {
          const set = Object.entries(SETS).find(([, r]) => r.builder === path.basename(f, '.auto.js'))?.[0];
          if (set && lockHolder(queuePaths(EP).lock(set))) { out = f.replace(/\.auto\.js$/, '.auto.next.js'); notes.push(`${set} is rendering: wrote ${path.basename(out)} (swapped in when its job ends)`); }
        }
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, text);
      }
      // which shot entries really changed
      const entries = (text) => { try { return JSON.parse(text.slice(text.indexOf('export default ') + 15).replace(/;\s*$/, '')).shots || {}; } catch { return {}; } };
      const diff = [];
      for (const [f, old] of before) { const a = entries(old), b = entries(fs.readFileSync(f, 'utf8')); for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diff.push(k); }
      sh(NODE, ['scenes/lib/director/tools/build-shots.mjs', '--episode', EP], 'build-shots');
      inp.stager = RESTAGE || pinned == null ? v : pinned;
      const flagged = reports.filter((r) => (r.flags || []).some((x) => /^(FLAG|E_|W_)/.test(x))).map((r) => r.id);
      notes.push(`${reports.length} shots staged; inputs changed: ${changed.length ? changed.join(' ') : 'none'}; spec entries changed: ${diff.length ? diff.join(' ') : 'none'}${flagged.length ? `; flagged ${flagged.join(' ')}` : ''}`);
      return notes;
    },
  },
  previs: {
    inputs: async () => { const k = await previsKeys(EP); return { files: codeOf('engine/previs/animatic.mjs'), shots: Object.fromEntries(k) }; },
    outputs: () => filesIn(D.previs, /\.png$/),
    run: async (inp) => {
      const prev = state.stages.previs?.shots || {};
      const todo = Object.keys(inp.shots).filter((j) => prev[j] !== inp.shots[j] || !fs.existsSync(path.join(D.previs, `${j}_0.png`)));
      if (!todo.length) return ['no shot changed'];
      const { makeAnimatic } = await import('./previs/animatic.mjs');
      await makeAnimatic(EP, { only: new Set(todo), log: () => {} });
      return [`drew ${todo.length} shot(s): ${todo.join(' ')}`];
    },
  },
  draft: {
    // up to date = every picked shot of the tier is fresh; the queue does the work
    inputs: async () => {
      if (TIER === 'animatic') return { extra: ['animatic'] };
      const st = await draftState(EP, TIER);
      return { extra: [TIER, ...[...st].map(([j, x]) => `${j}:${x.key}:${x.fresh}`)] };
    },
    outputs: () => [],
    upToDate: async () => {
      if (TIER === 'animatic') return true;
      const st = await draftState(EP, TIER);
      return [...st].every(([j, x]) => x.fresh || !shotPick(j, x.scene));
    },
    run: async () => {
      if (TIER === 'animatic') return ['D0: the previs frames are the pictures'];
      const st = await draftState(EP, TIER);
      const stale = [...st].filter(([j, x]) => !x.fresh && shotPick(j, x.scene));
      const bySet = new Map();
      for (const [j, x] of stale) { if (!bySet.has(x.set)) bySet.set(x.set, []); bySet.get(x.set).push(j); }
      const post = [NODE, path.join(ROOT, 'engine/make-episode.mjs'), '--episode', EP, '--stage', 'previs,cut,mix', '--draft', TIER];
      enqueue(EP, [...bySet].map(([set, shots]) => ({ set, tier: TIER, shots })), DETACH ? post : null);
      const r = startDetached(EP);
      const msg = `${stale.length} shot(s) queued (${[...bySet].map(([s, j]) => `${s}: ${j.join(' ')}`).join('; ')}); queue ${r.already ? 'already running' : 'started'} pid ${r.pid}`;
      if (DETACH) { DEFER.add('cut'); DEFER.add('mix'); return [msg, `detached: the queue runs cut + mix when done; poll: node engine/make-episode.mjs --episode ${EP} --status`]; }
      // foreground: wait for the queue (never inside an agent tool call: use --detach there)
      for (;;) { await new Promise((res) => setTimeout(res, 15e3)); if (!liveness(EP).alive && !loadQueue(EP).jobs.some((j) => j.status === 'pending' || j.status === 'running')) break; }
      return [msg, 'queue finished'];
    },
    noStamp: true,
  },
  cut: {
    inputs: async () => {
      const st = TIER === 'animatic' ? null : await draftState(EP, TIER);
      return { files: [D.edl('edl'), path.join(D.cut, 'audio-cues.json'), D.takes, ...filesIn(D.previs, /\.png$/), ...codeOf('episodes/s01e01/final/cut/make-cut.mjs')], extra: [TIER, ...(st ? [...st].map(([j, x]) => `${j}:${x.fresh ? x.key : '-'}`) : [])] };
    },
    outputs: () => [cutMp4()],
    run: () => { const o = sh(NODE, ['episodes/s01e01/final/cut/make-cut.mjs', '--episode', EP, ...(TIER === 'animatic' ? ['--stills', path.join(D.engine, 'no-stills')] : [])], 'make-cut'); return [o.trim().split('\n').pop().replace(ROOT + '/', '')]; },
  },
  mix: {
    inputs: () => ({ files: [cutMp4(), path.join(D.cut, 'audio-cues.json'), D.edl('edl'), D.shotlist, D.takes, ...codeOf('scenes/lib/sound/', 'episodes/s01e01/final/sound/fx/synth.mjs', 'episodes/s01e01/final/sound/fx/fx.mjs')] }),
    outputs: () => [mixMp4()],
    run: () => {
      const o = sh(NODE, ['scenes/lib/sound/mix.mjs', '--episode', EP], 'mix');
      const rep = readJson(path.join(D.audio, 'cuts', cutName(), 'mix-report.json'));
      if (!rep?.muxed) throw new Error('the mixer wrote no mp4');
      fs.copyFileSync(path.join(ROOT, rep.muxed.file), mixMp4());
      return [`${rel(mixMp4())}: I ${rep.result.I} LUFS, TP ${rep.result.TP} dBTP (${rep.result.anchored}${rep.result.pass ? ', PASS' : ', CHECK'})`, ...(rep.fx?.spot_sheet?.includes('no synth') ? [rep.fx.spot_sheet] : [])];
    },
  },
  package: { inputs: () => ({ extra: ['phase 7'] }), outputs: () => [], run: () => ['not built yet (engine phase 7: render-jobs.json, gate, PC package)'], noStamp: true },
};
const DEFER = new Set();

async function inputsHash(name) {
  const i = await STAGES[name].inputs();
  return { i, hash: sha1(JSON.stringify({ f: (i.files || []).map((f) => `${rel(f)}:${fileHash(f)}`), x: i.extra || [], s: i.shots || {} })) };
}

async function runStage(name) {
  const S = STAGES[name], t0 = Date.now();
  if (DEFER.has(name)) { console.log(`  ${name.padEnd(8)} deferred: the detached queue runs it when the renders are done`); return true; }
  if (['cut', 'mix'].includes(name) && TIER !== 'animatic' && !FORCE) {
    const q = loadQueue(EP);
    if (q.jobs.some((j) => j.status === 'pending' || j.status === 'running' || j.status === 'waiting-memory') && liveness(EP).alive && process.env.DK_QUEUE_POST !== '1' && !isPost()) { console.log(`  ${name.padEnd(8)} waiting: renders in the queue (it runs cut + mix when done)`); return true; }
  }
  const { i, hash } = await inputsHash(name);
  const prev = state.stages[name];
  const outs = S.outputs();
  const outHash = hashFiles(outs);
  const fresh = S.upToDate ? await S.upToDate() : (prev?.ok && prev.inputsHash === hash && prev.outputsHash === outHash && outs.every((f) => fs.existsSync(f)));
  if (fresh && !FORCE) { console.log(`  ${name.padEnd(8)} up to date`); return true; }
  try {
    const notes = await S.run(i);
    if (!S.noStamp) {
      const again = name === 'parse' || name === 'vo' || name === 'stage' ? (await inputsHash(name)).hash : hash;    // these write some of their own inputs
      state.stages[name] = { inputsHash: again, outputsHash: hashFiles(S.outputs()), at: new Date().toISOString(), ok: true, ms: Date.now() - t0, ...(i.shots ? { shots: i.shots } : {}), ...(i.stager != null ? { stager: i.stager } : {}) };
    }
    saveState();
    console.log(`  ${name.padEnd(8)} done in ${((Date.now() - t0) / 1000).toFixed(1)} s${notes?.length ? '\n' + notes.filter(Boolean).map((n) => `           ${n}`).join('\n') : ''}`);
    return true;
  } catch (e) {
    state.stages[name] = { ...(prev || {}), ok: false, at: new Date().toISOString(), error: String(e.message).slice(0, 400) };
    saveState();
    console.error(`  ${name.padEnd(8)} FAILED: ${e.message}`);
    return false;
  }
}
const isPost = () => argv.includes('previs,cut,mix') || argv.includes('cut,mix');

// ------------------------------------------------------------------ report ---
async function report() {
  const L = [`# ${D.tag} - engine report`, '', `${CFG.title || ''}  `, `Written by \`engine/make-episode.mjs\` ${new Date().toISOString().slice(0, 16)}Z. Draft tier asked: **${TIER}**.`, ''];
  const sl = shotlist().shots;
  const sr = new Map((readJson(path.join(D.final, 'stage-report.json'))?.shots || []).map((r) => [r.id, r]));
  const tiers = {};
  for (const t of ['video', 'stills']) tiers[t] = fs.existsSync(path.join(D.scenes)) ? await draftState(EP, t).catch(() => new Map()) : new Map();
  const tierOf = (j) => (tiers.video.get(j)?.fresh ? 'D2' : tiers.video.get(j)?.have ? 'D2 (stale)' : tiers.stills.get(j)?.fresh ? 'D1' : tiers.stills.get(j)?.have ? 'D1 (stale)' : fs.existsSync(path.join(D.previs, `${j}_0.png`)) ? 'D0' : 'slate');
  const q = loadQueue(EP);
  const done = q.jobs.filter((j) => j.wall_s && j.rendered?.length);
  const perShot = done.length ? done.reduce((a, j) => a + j.wall_s, 0) / done.reduce((a, j) => a + j.rendered.length, 0) : 90;
  const want = TIER === 'video' ? tiers.video : TIER === 'stills' ? tiers.stills : null;
  L.push('| scene | shots | staged | flagged | approved | tier reached | renders done / left | ETA |', '|---|---:|---:|---:|---:|---|---|---|');
  for (const sc of [...new Set(sl.map((s) => s.scene))]) {
    const rows = sl.filter((s) => s.scene === sc && s.render !== 'black');
    const staged = rows.filter((r) => sr.has(r.id));
    const flagged = staged.filter((r) => (sr.get(r.id).flags || []).some((x) => /^(FLAG|E_|W_)/.test(x)));
    const tr = rows.map((r) => tierOf(r.id));
    const counts = Object.entries(tr.reduce((o, t) => ((o[t] = (o[t] || 0) + 1), o), {})).map(([t, n]) => `${t} ${n}`).join(', ');
    const left = want ? rows.filter((r) => !want.get(r.id)?.fresh).length : 0;
    L.push(`| ${sc} | ${rows.length} | ${staged.length} | ${flagged.length} | 0 (gate: phase 7) | ${counts} | ${want ? `${rows.length - left} / ${left}` : '-'} | ${left ? `~${Math.ceil((left * perShot + 60) / 60)} min` : '-'} |`);
  }
  L.push('', '## Stages', '', '| stage | state | at | took |', '|---|---|---|---:|');
  for (const n of ORDER) { const s = state.stages[n]; L.push(`| ${n} | ${s ? (s.ok ? 'ok' : `FAILED: ${(s.error || '').split('\n')[0].slice(0, 80)}`) : '-'} | ${s?.at?.slice(0, 16) || ''} | ${s?.ms != null ? `${(s.ms / 1000).toFixed(1)} s` : ''} |`); }
  const warn = [];
  const val = fs.existsSync(path.join(D.final, 'validation.md')) ? fs.readFileSync(path.join(D.final, 'validation.md'), 'utf8') : '';
  const wm = val.match(/(\d+) warnings?/); if (wm && +wm[1]) warn.push(`validation: ${wm[0]}`);
  for (const r of sr.values()) { const f = (r.flags || []).filter((x) => /^(FLAG|E_|W_)/.test(x)); if (f.length) warn.push(`${r.id}: ${f.join('; ')}`); if (r.unstaged?.length) warn.push(`${r.id} unstaged: ${r.unstaged.join('; ')}`); }
  const tk = readJson(D.takes); if (tk?.engine === 'espeak-ng') warn.push(`voice: espeak-ng FALLBACK (${tk.fallback_reason || 'asked'})`);
  const mr = readJson(path.join(D.audio, 'cuts', cutName(), 'mix-report.json'));
  if (mr) { if (!mr.result.pass) warn.push(`mix: CHECK (I ${mr.result.I}, TP ${mr.result.TP})`); if (mr.fx?.spot_sheet?.includes('no synth')) warn.push(`sound: ${mr.fx.spot_sheet}`); }
  for (const j of q.jobs.filter((x) => x.failed?.length || x.stale?.length)) warn.push(`queue ${j.id}: ${j.failed?.length ? `failed ${j.failed.join(' ')}` : ''} ${j.stale?.length ? `stale ${j.stale.join(' ')}` : ''}`.trim());
  L.push('', '## Warnings', '', ...(warn.length ? warn.map((w) => `- ${w}`) : ['- none']));
  L.push('', '## Queue', '', '```', statusText(EP), '```');
  if (mr) L.push('', '## Output', '', `- cut: \`${rel(cutMp4())}\`${fs.existsSync(mixMp4()) ? `\n- mixed: \`${rel(mixMp4())}\` (I ${mr.result.I} LUFS, TP ${mr.result.TP} dBTP)` : ''}`);
  const live = liveness(EP).alive;
  const next = live ? `node engine/make-episode.mjs --episode ${EP} --status   (renders running)` : want && [...want].some(([, x]) => !x.fresh) ? `node engine/make-episode.mjs --episode ${EP} --stage all --draft ${TIER} --detach` : `look at the cut, touch up flagged shots in final/scenes/specs/<set>.touch.js, then node engine/make-episode.mjs --episode ${EP} --stage all --draft ${TIER === 'animatic' ? 'stills' : TIER} --detach`;
  L.push('', '## Next', '', '```', next, '```', '');
  fs.mkdirSync(D.engine, { recursive: true });
  fs.writeFileSync(path.join(D.engine, 'REPORT.md'), L.join('\n'));
  return L.join('\n');
}

// -------------------------------------------------------------------- main ---
const t0 = Date.now();
if (flag('--status')) { console.log(await report()); process.exit(0); }
const asked = (opt('--stage', 'all')).split(',');
const list = asked.includes('all') ? ORDER : ORDER.filter((s) => asked.includes(s));
if (!list.length) throw new Error(`--stage: one of ${ORDER.join('|')}|all`);
console.log(`make-episode ${EP}: ${list.join(' -> ')} (draft ${TIER}${DETACH ? ', detached' : ''})`);
let ok = true;
for (const s of list) { if (!(await runStage(s))) { ok = false; break; } }
await report();
console.log(`${ok ? 'done' : 'STOPPED'} in ${((Date.now() - t0) / 1000).toFixed(1)} s - report: ${rel(path.join(D.engine, 'REPORT.md'))}`);
process.exit(ok ? 0 : 1);
