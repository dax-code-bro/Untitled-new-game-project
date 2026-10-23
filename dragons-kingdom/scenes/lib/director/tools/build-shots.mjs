#!/usr/bin/env node
// Shot director - build the shot tables, the edit list and the audio cue sheets from the shot list,
// the voice takes and the authored shot specs.
//
//   node scenes/lib/director/tools/build-shots.mjs                 # every set that has a spec
//   node scenes/lib/director/tools/build-shots.mjs --scenes PROLOGUE,TITLE,1A --check
//
// Reads  episodes/s01e01/final/shotlist.json, render-jobs.json, vo/takes.json, vo/words.json and
//        episodes/s01e01/final/scenes/specs/<builder>.spec.js (one per set; plain data + optional
//        per-shot custom() functions, no three.js imports)
// Writes episodes/s01e01/final/scenes/<set-file>.shots.json   (what render/episode.mjs and the set
//        scene read: { job, start_s, frames, pre, post, dialogue: [placed lines], captions, ... })
//        episodes/s01e01/final/cut/edl.json + edl.md               (the edit of the scenes asked for)
//        episodes/s01e01/final/cut/audio-cues.json                 (every placed line, per scene)
// --check: rebuild in memory and exit 1 if a written file would change (CI / npm test).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { layoutSet, timecode, FPS } from '../timeline.js';
import { indexTakes, placeLines } from '../dialogue.js';
import { SETS, continuityFor } from '../registry.js';
import { estimateShot } from '../cost.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');                 // dragons-kingdom/
const FINAL = path.join(ROOT, 'episodes/s01e01/final');
const SCENES = path.join(FINAL, 'scenes');
const CUT = path.join(FINAL, 'cut');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const CHECK = args.includes('--check');
const SCENE_LIST = (opt('--scenes') || 'PROLOGUE,TITLE,1A').split(',');
const HANDLE = 12;                                                 // handle frames reserved on each side of every shot

const shotlist = readJson(path.join(FINAL, 'shotlist.json'));
const jobs = readJson(path.join(FINAL, 'render-jobs.json')).jobs;
const jobFrames = new Map(jobs.map((j) => [j.job, j.frames]));
const takes = indexTakes(readJson(path.join(FINAL, 'vo/takes.json')), readJson(path.join(FINAL, 'vo/words.json')));
const measured = fs.existsSync(path.join(CUT, 'timings.json')) ? readJson(path.join(CUT, 'timings.json')).shots || {} : {};
const gpuRatio = (() => { try { return readJson(path.join(ROOT, 'output/gpu-check/gpu-check.json'))?.estimate?.ratio || null; } catch { return null; } })();

// ---------------------------------------------------------------- specs ---
const specs = {};
for (const [setId, s] of Object.entries(SETS)) {
  if (!s.builder) continue;
  const f = path.join(SCENES, 'specs', `${s.builder}.spec.js`);
  if (!fs.existsSync(f)) continue;
  const m = await import(pathToFileURL(f).href + `?v=${fs.statSync(f).mtimeMs}`);
  specs[setId] = { file: f, spec: m.default };
}

const out = new Map();                                             // file -> content (string)
const warnings = [];
const merge = (d = {}, s = {}) => ({ ...d, ...s, cast: { ...(d.cast || {}), ...(s.cast || {}) } });

// --------------------------------------------------- the set shot tables ---
const tables = {};
for (const [setId, { spec }] of Object.entries(specs)) {
  const setShots = shotlist.shots.filter((s) => s.set === setId && spec.shots?.[s.id]);
  const laid = layoutSet(setShots.map((s) => ({ job: s.id, frames: jobFrames.get(s.id) ?? s.frames_at_24fps, pre: HANDLE, post: HANDLE })), { fps: FPS, gapS: 1 });
  const rows = laid.map((l, i) => {
    const s = setShots[i];
    const sp = merge(spec.defaults, spec.shots[s.id]);
    const secs = l.frames / FPS;
    const { placed, warnings: w } = placeLines(secs, sp.lines || [], takes, spec.splits || {}, { minTail: sp.minTail ?? 0.3 });
    for (const x of w) warnings.push(`${s.id}: ${x}`);
    // every line the shot list puts in this shot must be placed somewhere (here or in a shot it runs over)
    for (const d of s.dialogue || []) {
      const here = placed.some((p) => p.id === d.id);
      const elsewhere = shotlist.shots.some((o) => o.id !== s.id && (o.dialogue || []).some((x) => x.id === d.id) && specs[o.set]?.spec.shots?.[o.id]?.lines?.some((c) => String(c[0]).split('#')[0] === d.id));
      if (!here && !elsewhere) warnings.push(`${s.id}: shot-list line ${d.id} (${d.speaker}) is not placed in any shot`);
    }
    const captions = (sp.captions || []).map((c) => {
      let from = c.from ?? 0, to = c.to ?? null;
      if (c.word) {
        const p = placed.find((x) => x.ref === c.line || x.id === c.line);
        const w = p?.words.find((x) => x.w === c.word);
        if (!w) warnings.push(`${s.id}: caption ${c.text}: word "${c.word}" not found in ${c.line}`);
        else { from = Math.max(0, w.start_s - (c.lead ?? 0.08)); to = Math.min(secs - 0.05, from + (c.hold ?? 1.4)); }
      }
      return { text: c.text, style: c.style || 'location', from_s: +from.toFixed(3), to_s: +(to ?? secs).toFixed(3) };
    });
    return {
      job: s.id, seq: s.seq, scene: s.scene, set: setId, start_s: l.start_s, start_frame: l.start_frame, frames: l.frames, pre: l.pre, post: l.post,
      seconds: +secs.toFixed(4), trans: sp.trans || ['cut'], dialogue: placed, captions,
      fx: (sp.fx || []).map((f) => ({ kind: f.kind, from: f.from ?? null, to: f.to ?? null })),
      continuity: continuityFor(setId, s.scene, s.id),
      staging: sp.staging || null, deviation: sp.deviation || null,
    };
  });
  const file = path.join(SCENES, SETS[setId].file.replace(/\.js$/, '.shots.json'));
  const table = { set: setId, scene_file: rel(path.join(SCENES, SETS[setId].file)), spec: rel(specs[setId].file), fps: FPS, handles: HANDLE,
    generated_by: 'scenes/lib/director/tools/build-shots.mjs', note: 'start_s / frames are the render-jobs.json contract (episode.mjs); pre/post are handle frames the editor may render around each shot.', shots: rows };
  tables[setId] = table;
  out.set(file, JSON.stringify(table, null, 1) + '\n');
}

// ------------------------------------------------------ the edit (cut) ---
const cutShots = shotlist.shots.filter((s) => SCENE_LIST.includes(s.scene));
let rec = 0;
const edl = [];
for (const s of cutShots) {
  const frames = jobFrames.get(s.id) ?? s.frames_at_24fps;
  const row = tables[s.set]?.shots.find((r) => r.job === s.id) || null;
  const kind = s.render === 'black' ? 'black' : row ? '3d' : 'missing';
  if (kind === 'missing') warnings.push(`${s.id}: no spec yet (${s.set}) - the cut shows a slate`);
  const trans = row?.trans || (s.render === 'black' ? ['cut'] : ['cut']);
  edl.push({
    job: s.id, seq: s.seq, scene: s.scene, set: s.set, kind, frames, rec_in: rec, rec_out: rec + frames,
    tc_in: timecode(rec / FPS), tc_out: timecode((rec + frames) / FPS),
    trans, src: row ? { scene_file: tables[s.set].scene_file, start_s: row.start_s, start_frame: row.start_frame } : null,
    dialogue: (row?.dialogue || []).map((p) => ({ ...p, rec_s: +(rec / FPS + p.at_s).toFixed(3) })),
    captions: (row?.captions || []).map((c) => ({ ...c, rec_from_s: +(rec / FPS + c.from_s).toFixed(3), rec_to_s: +(rec / FPS + c.to_s).toFixed(3) })),
    cost: row ? estimateShot(s.set, frames, merge(specs[s.set].spec.defaults, specs[s.set].spec.shots[s.id]), { measured: measured[s.id], gpuRatio }) : null, staging: row?.staging || null, deviation: row?.deviation || null, action: s.action,
  });
  rec += frames;
}
// handle frames each rendered shot needs for its transitions (a dissolve of N frames is centred on the cut)
for (let i = 0; i < edl.length; i++) {
  const e = edl[i];
  e.need = { pre: 0, post: 0 };
  const [tt, n] = e.trans;
  if (tt === 'dissolve' && i > 0) { e.need.pre = Math.ceil(n / 2); edl[i - 1].need = edl[i - 1].need || { pre: 0, post: 0 }; edl[i - 1].need.post = Math.floor(n / 2); }
}
for (const e of edl) if (e.need.pre > HANDLE || e.need.post > HANDLE) warnings.push(`${e.job}: transition needs ${Math.max(e.need.pre, e.need.post)} handle frames, only ${HANDLE} reserved`);
const total = rec;
const cues = edl.flatMap((e) => e.dialogue.map((d) => ({ scene: e.scene, shot: e.job, ref: d.ref, id: d.id, part: d.part, role: d.role, file: d.file, file_in_s: d.file_in_s, file_out_s: d.file_out_s, rec_s: d.rec_s, shot_at_s: d.at_s, speech_rec_in_s: +(e.rec_in / FPS + d.speech_in_s).toFixed(3), speech_rec_out_s: +(e.rec_in / FPS + d.speech_out_s).toFixed(3), gain_db: d.gain_db, continues: d.continues })));
const edlJson = {
  title: `Dragon's Kingdom S01E01 - draft cut: ${SCENE_LIST.join(' + ')}`,
  status: 'DRAFT EDIT for the animatic / timing check (960x540 draft renders, computer voices, provisional designs). Not a master (SERIES.md section 2).',
  fps: FPS, frames: total, duration_s: +(total / FPS).toFixed(3), duration_tc: timecode(total / FPS),
  generated_by: 'scenes/lib/director/tools/build-shots.mjs', shots: edl,
};
out.set(path.join(CUT, 'edl.json'), JSON.stringify(edlJson, null, 1) + '\n');
out.set(path.join(CUT, 'audio-cues.json'), JSON.stringify({ about: 'Every voice take placed in the cut: rec_s = where the WAV\'s file_in_s plays on the cut timeline (seconds from the cut\'s first frame); speech_rec_in/out = the words. Per scene below.', fps: FPS, scenes: Object.fromEntries(SCENE_LIST.map((sc) => [sc, cues.filter((c) => c.scene === sc)])) }, null, 1) + '\n');

// the human-readable edit list
const md = [];
md.push(`# Dragon's Kingdom S01E01 - draft cut: ${SCENE_LIST.join(' + ')}`, '');
md.push(`> ${edlJson.status}`, '');
md.push(`Generated by \`scenes/lib/director/tools/build-shots.mjs\` from \`shotlist.json\`, \`vo/takes.json\` + \`words.json\` and the shot specs in \`episodes/s01e01/final/scenes/specs/\`. Machine-readable: \`edl.json\`, \`audio-cues.json\`.`, '');
md.push(`**Length: ${edlJson.duration_tc} (${edlJson.duration_s.toFixed(2)} s, ${total} frames at 24 fps)**, ${edl.length} shots (${edl.filter((e) => e.kind === '3d').length} rendered, ${edl.filter((e) => e.kind === 'black').length} black, ${edl.filter((e) => e.kind === 'missing').length} not authored).`, '');
const est = edl.reduce((a, e) => { if (e.cost) { a.d += e.cost.draft_minutes; a.k += e.cost.k4_cpu_hours; if (e.cost.k4_gpu_hours != null) a.g += e.cost.k4_gpu_hours; } return a; }, { d: 0, k: 0, g: 0 });
md.push(`Render cost (ESTIMATES unless a shot says MEASURED; see the cost column): draft ~${est.d.toFixed(0)} min of one browser on this 4-vCPU machine; native 4K ~${est.k.toFixed(1)} h CPU${gpuRatio ? `, ~${est.g.toFixed(1)} h on the GPU gpu-check measured` : ' (no GPU measurement yet: run the gpu-check on the render PC)'}.`, '');
md.push('| # | shot | scene | set | in | out | frames | trans | lines (rec time of the words) | staging | draft s/f | 4K CPU s/f |', '|---:|---|---|---|---|---|---:|---|---|---|---:|---:|');
edl.forEach((e, i) => {
  const lines = e.dialogue.map((d) => `${d.ref} ${d.role} @${(e.rec_in / FPS + d.speech_in_s).toFixed(2)}`).join('; ');
  md.push(`| ${i + 1} | ${e.job} | ${e.scene} | ${e.set} | ${e.tc_in} | ${e.tc_out} | ${e.frames} | ${e.trans.join(' ')} | ${lines} | ${(e.staging || (e.kind === 'black' ? 'black card' : e.kind === 'missing' ? 'NOT AUTHORED' : '')).replace(/\|/g, '/')} | ${e.cost ? e.cost.draft_s_per_frame : ''} | ${e.cost ? e.cost.k4_cpu_s_per_frame : ''} |`);
});
const dev = edl.filter((e) => e.deviation);
if (dev.length) { md.push('', '## Where the staging departs from the shot list (and why)', ''); for (const e of dev) md.push(`- **${e.job}**: ${e.deviation}`); }
if (warnings.length) { md.push('', '## Warnings', ''); for (const w of warnings) md.push(`- ${w}`); }
out.set(path.join(CUT, 'edl.md'), md.join('\n') + '\n');

// ---------------------------------------------------------------- write ---
// --check ignores the render-cost figures: they follow cut/timings.json, which every draft render
// updates (MEASURED s/frame), so they are not a sign of a stale table
const COSTY = /cost|estimate|minutes|per_frame|hours/i;
const stripCost = (v) => (Array.isArray(v) ? v.map(stripCost) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !COSTY.test(k)).map(([k, x]) => [k, stripCost(x)])) : v);
const norm = (f, s) => {
  if (s == null) return s;
  if (f.endsWith('.json')) { try { return JSON.stringify(stripCost(JSON.parse(s))); } catch { return s; } }
  if (f.endsWith('edl.md')) return s.split('\n').filter((l) => !/^Render cost/.test(l)).map((l) => (/^\| \d+ \|/.test(l) ? l.replace(/(\|[^|]*){2}\|$/, '|') : l)).join('\n');
  return s;
};
let changed = 0;
for (const [f, s] of out) {
  const old = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  if (old === s) continue;
  if (CHECK && norm(f, old) === norm(f, s)) continue;
  changed++;
  if (CHECK) { console.log(`out of date: ${rel(f)}`); continue; }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, s);
  console.log(`wrote ${rel(f)}`);
}
for (const w of warnings) console.log(`warning: ${w}`);
console.log(`cut ${SCENE_LIST.join('+')}: ${edl.length} shots, ${total} frames = ${timecode(total / FPS)} (${(total / FPS).toFixed(2)} s); sets with specs: ${Object.keys(specs).join(', ') || 'none'}`);
if (CHECK && changed) process.exit(1);
