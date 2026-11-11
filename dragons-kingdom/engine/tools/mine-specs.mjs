#!/usr/bin/env node
// Engine phase 1 - TEMPLATE MINING (engine/DESIGN.md section 3.2): measure every hand-written shot spec of an
// episode with the previs core (no browser, no render) and write the camera recipes the auto-stager's
// templates are tuned from: engine/stager/templates.mined.json.
//
//   node engine/tools/mine-specs.mjs [--episode s01e01] [--out engine/stager/templates.mined.json]
//
// Per shot (shotlist.json row + its spec + its shot-table row): the size class and camera_move of the shot
// list, the spec's rig / mm / fstop, and at t = 0.15 / 0.5 / 0.85 of the shot (previs-core measure()):
// the camera's height above the set's ground, the distance to the SUBJECT's head, the camera's bearing
// relative to the subject's facing (0 = in front of it, seeing the face; 90 = its right; 180 = behind),
// the compass side the camera looks from (framing.js `from`: 0 = from the north, 90 = from the east), the
// frame height in metres at the subject (how much of it the frame holds), and the subject's head on the
// screen (NDC x / y, -1..1, and its height as a fraction of the frame). Then BANDS (n, min, p10, median,
// p90, max) per size class and per template guess (the decision a first select.mjs would make).
//
// The subject: the first framing-solver subject (cam.frame), else the follow target, else the focus
// actor, else the shot list's first in-frame name that is in the cast, else the largest head in frame.
// The output is deterministic (no times or absolute paths): re-running it on unchanged specs changes nothing.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SETS } from '../../scenes/lib/director/registry.js';
import { dirs, episodeArg, ROOT } from '../../scenes/lib/director/episode-paths.js';
import { measure, shotSpec, shotEnv } from '../../scenes/lib/director/previs-core.js';

const { ep: EP, argv } = episodeArg(process.argv.slice(2));
const opt = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const D = dirs(EP);
const OUT = path.resolve(opt('--out', path.join(ROOT, 'engine/stager/templates.mined.json')));
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const AT = [0.15, 0.5, 0.85];
const r2 = (v) => (v == null || !Number.isFinite(v) ? null : +v.toFixed(2));
const deg = (r) => (r * 180) / Math.PI;
const wrap360 = (a) => ((a % 360) + 360) % 360;
const compass = (dx, dz) => wrap360(deg(Math.atan2(dx, -dz)));      // 0 = north (-z), 90 = east (+x)

const SIZE = { 'extreme wide': 'EWS', wide: 'WS', medium: 'MS', close: 'CU', insert: 'INSERT', POV: 'POV' };
const sizeClass = (s) => SIZE[s] || (String(s).startsWith('card') ? 'CARD' : String(s).toUpperCase());

const shotlist = readJson(D.shotlist);
const rowsById = new Map(shotlist.shots.map((s) => [s.id, s]));

/** the template the stager's decision table would pick first (DESIGN 3.2), from the row and the spec */
function templateGuess(row, s1, castKinds, inFrameHumans) {
  const size = sizeClass(row.shot_size), mv = String(row.camera_move || '').toLowerCase(), rig = s1.cam?.rig || '';
  const mm = typeof s1.cam?.mm === 'number' ? s1.cam.mm : null;
  const creature = castKinds.includes('creature');
  if (size === 'CARD') return 'card';
  if (size === 'POV' || /\bpov\b/.test(mv)) return 'pov';
  if (size === 'INSERT' || /insert|macro/.test(mv)) return 'insert';
  if (/air-to-air|dragonback/.test(mv) || (rig === 'follow' && creature && /aerial|flight|fly/.test(mv))) return 'air-to-air';
  if (creature && mm != null && mm >= 135) return 'camera-ship';
  if (/\bpan\b/.test(mv)) return 'travel-pan';
  if ((rig === 'drone' || /drone|aerial/.test(mv)) && !inFrameHumans) return 'drone-reveal';
  if (/\bots\b|over.the.shoulder|over-shoulder/.test(mv)) return 'ots';
  if (/two-shot|two shot/.test(mv)) return 'two-shot';
  if (inFrameHumans >= 4 && (size === 'WS' || size === 'MS')) return 'crowd-reaction';
  if (inFrameHumans === 2 && (row.dialogue || []).length) return 'two-shot';
  if (size === 'CU') return 'single-close';
  if (size === 'EWS' || size === 'WS') return 'establish-wide';
  if (size === 'MS') return 'medium-action';
  return 'other';
}

/** the shot's subject (an actor name of the spec's cast) and where the choice came from */
function subjectOf(spec, s1, row, m) {
  const cast = s1.cast || {};
  const actor = (v) => {
    if (typeof v !== 'string') return null;
    const n = v.split('.')[0];
    return cast[n] && spec.cast?.[n] && spec.cast[n].kind !== 'object' ? n : null;
  };
  const c = s1.cam || {};
  if (c.frame?.subjects?.length) { const n = actor(c.frame.subjects[0][0]); if (n) return [n, 'frame']; }
  if (c.follow?.target && actor(c.follow.target)) return [actor(c.follow.target), 'follow'];
  const fo = Array.isArray(c.focus) && c.focus.length && Array.isArray(c.focus[0]) ? c.focus[0][1] : c.focus;
  if (actor(fo)) return [actor(fo), 'focus'];
  for (const f of row.in_frame || []) {
    const key = String(f.name || '').toLowerCase().split(/[^a-z]/)[0];
    const n = Object.keys(cast).find((k) => spec.cast?.[k] && spec.cast[k].kind !== 'object' && (k.toLowerCase() === key || String(spec.cast[k].role || '').toLowerCase() === key || String(spec.cast[k].id || '').toLowerCase().startsWith(key)));
    if (key && n) return [n, 'shotlist'];
  }
  const big = (m?.actors || []).filter((a) => a.inFrame).sort((a, b) => b.sizePx - a.sizePx)[0];
  return big ? [big.name, 'largest'] : [null, 'none'];
}

function sample(spec, s1, row, tabRow, subject, t) {
  const env = shotEnv(spec, s1);
  const m = measure(spec, s1, t, { row: tabRow, env });
  if (m.skip) return { t: r2(t), skip: m.skip };
  const cam = m.cam, vfov = 2 * Math.atan((24.89 * 9 / 16) / 2 / cam.mm);
  const ground = env.ground(cam.pos.x, cam.pos.z);
  const out = { t: r2(t), mm: r2(cam.mm), fstop: r2(cam.fstop), cam_y: r2(cam.pos.y), cam_h: r2(cam.pos.y - ground),
    tilt: r2(deg(Math.atan2(cam.look.y - cam.pos.y, Math.hypot(cam.look.x - cam.pos.x, cam.look.z - cam.pos.z)))), solve_off: r2(cam.worst),
    // the aim point (`look`): what a subject-less shot (a landscape, an insert on a prop) is measured by
    look_dist: r2(cam.pos.distanceTo(cam.look)), look_frame_h_m: r2(2 * cam.pos.distanceTo(cam.look) * Math.tan(vfov / 2)) };
  const a = m.actors.find((x) => x.name === subject);
  if (!a) return { ...out, subject_visible: false };
  const st = env.state(subject, t);
  const head = a.head, dx = cam.pos.x - head.x, dz = cam.pos.z - head.z;
  const from = compass(dx, dz), facing = compass(Math.sin(st.yaw), Math.cos(st.yaw));
  return { ...out, subject_visible: true, dist: r2(a.dist), from: r2(from), bearing_rel: r2(wrap360(from - facing)),
    frame_h_m: r2(2 * a.dist * Math.tan(vfov / 2)), head_x: r2(a.x), head_y: r2(a.y), head_frac: +(a.sizePx / 540).toFixed(4),
    in_frame: a.inFrame, subject_h: r2(head.y - env.ground(head.x, head.z)) };
}

const records = [];
const problems = [];
const seen = new Set();
for (const [setId, S] of Object.entries(SETS)) {
  if (!S.builder) continue;
  const f = path.join(D.specs, `${S.builder}.spec.js`);
  if (!fs.existsSync(f)) continue;
  const spec = (await import(pathToFileURL(f).href)).default;
  const tabFile = path.join(D.scenes, S.file.replace(/\.js$/, '.shots.json'));
  const table = fs.existsSync(tabFile) ? readJson(tabFile) : { shots: [] };
  const tabRows = new Map(table.shots.map((r) => [r.job, r]));
  for (const id of Object.keys(spec.shots || {})) {
    if (seen.has(id)) { problems.push(`${id}: in two specs (${setId})`); continue; }
    seen.add(id);
    const row = rowsById.get(id);
    if (!row) { problems.push(`${id}: in ${rel(f)} but not in the shot list`); continue; }
    const s1 = shotSpec(spec, id), c = s1.cam || {};
    const tabRow = tabRows.get(id) || { job: id, frames: row.frames_at_24fps, dialogue: [] };
    const dur = tabRow.frames / 24;
    const castKinds = [...new Set(Object.keys(s1.cast || {}).map((n) => spec.cast?.[n]?.kind).filter(Boolean))].sort();
    let mid = null;
    try { mid = measure(spec, s1, Math.min(dur - 1 / 24, 0.5 * dur), { row: tabRow }); } catch (e) { mid = { skip: `error: ${e.message}` }; }
    const [subject, subjectFrom] = subjectOf(spec, s1, row, mid);
    const samples = AT.map((u) => {
      const t = Math.min(dur - 1 / 24, u * dur);
      try { return sample(spec, s1, row, tabRow, subject, t); } catch (e) { return { t: r2(t), skip: `error: ${e.message}` }; }
    });
    const inFrameHumans = (mid?.actors || []).filter((a) => a.inFrame && a.kind === 'human').length;
    const m5 = samples[1];
    records.push({
      id, set: setId, spec: rel(f), scene: row.scene, size: row.shot_size, size_class: sizeClass(row.shot_size), shotlist_lens: row.lens ?? null,
      camera_move: row.camera_move ?? null, rig: c.rig ?? null, mm: typeof c.mm === 'number' ? c.mm : null, mm_keyed: Array.isArray(c.mm),
      fstop: typeof c.fstop === 'number' ? c.fstop : null, solver: !!c.frame, follow: !!c.follow, push: c.push ?? null, mount: c.mount ?? null,
      cast_kinds: castKinds, humans_in_frame: inFrameHumans, lines: (row.dialogue || []).length, frames: tabRow.frames,
      template: templateGuess(row, s1, castKinds, inFrameHumans), subject, subject_kind: subject ? spec.cast?.[subject]?.kind ?? null : null, subject_from: subjectFrom,
      measured: !m5.skip, ...(m5.skip ? { skip: m5.skip } : {}), at: samples,
    });
  }
}

// ---------------------------------------------------------------- bands ---
const FIELDS = ['mm', 'fstop', 'cam_h', 'tilt', 'look_dist', 'look_frame_h_m', 'dist', 'frame_h_m', 'head_frac', 'head_x', 'head_y', 'bearing_side'];
const q = (xs, p) => { const i = (xs.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return r2(xs[lo] + (xs[hi] - xs[lo]) * (i - lo)); };
function band(xs) {
  const v = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return { n: v.length, min: r2(v[0]), p10: q(v, 0.1), median: q(v, 0.5), p90: q(v, 0.9), max: r2(v[v.length - 1]) };
}
const SECTORS = ['front', 'front-right', 'right', 'back-right', 'back', 'back-left', 'left', 'front-left'];
function group(rs) {
  const mids = rs.filter((r) => r.measured).map((r) => ({ ...r.at[1], mm: r.at[1].mm ?? r.mm, bearing_side: r.at[1].bearing_rel == null ? null : 180 - Math.abs(180 - r.at[1].bearing_rel) }));
  const bands = Object.fromEntries(FIELDS.map((k) => [k, band(mids.map((m) => m[k]))]).filter(([, b]) => b));
  const sectors = {};
  for (const m of mids) if (m.bearing_rel != null) { const s = SECTORS[Math.round(m.bearing_rel / 45) % 8]; sectors[s] = (sectors[s] || 0) + 1; }
  const count = (k) => Object.fromEntries(Object.entries(rs.reduce((a, r) => { const v = String(r[k]); a[v] = (a[v] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
  return { shots: rs.length, measured: mids.length, with_subject: mids.filter((m) => m.subject_visible).length, rigs: count('rig'), bands, bearing_sectors: sectors, examples: rs.slice(0, 8).map((r) => r.id) };
}
const by = (k) => {
  const g = {};
  for (const r of records) (g[r[k]] ||= []).push(r);
  return Object.fromEntries(Object.keys(g).sort().map((x) => [x, group(g[x])]));
};
const bySizeTemplate = {};
for (const r of records) (bySizeTemplate[`${r.size_class}/${r.template}`] ||= []).push(r);

const measured = records.filter((r) => r.measured).length;
const doc = {
  about: 'Camera recipes measured from the hand-written shot specs (engine phase 1, engine/DESIGN.md section 3.2). Mid-shot (t = 0.5) values feed the bands; `at` holds t = 0.15 / 0.5 / 0.85. Distances in metres (Super 35 sensor, 24.89 mm wide, 16:9). bearing_rel: the camera seen from the subject, relative to its facing (0 front, 90 its right, 180 behind); bearing_side: the same folded to 0..180 (side-agnostic). from: the compass side the camera looks from (framing.js `from`). frame_h_m: metres of frame height at the subject; look_dist / look_frame_h_m: the same at the aim point (`look`), for shots without a subject. head_frac: the subject head (0.24 m) as a fraction of the frame height. head_x / head_y: NDC (-1..1, +y up).',
  generated_by: 'engine/tools/mine-specs.mjs', episode: EP, sizes: SIZE,
  coverage: { shots_in_specs: records.length, measured, with_subject: records.filter((r) => r.measured && r.at[1].subject_visible).length, not_measured: records.filter((r) => !r.measured).map((r) => `${r.id}: ${r.skip}`) },
  problems,
  by_size: by('size_class'),
  by_template: by('template'),
  by_size_template: Object.fromEntries(Object.keys(bySizeTemplate).sort().map((k) => [k, group(bySizeTemplate[k])])),
  shots: records.sort((a, b) => (rowsById.get(a.id).seq - rowsById.get(b.id).seq)),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
console.log(`mined ${records.length} shot specs of ${EP}: ${measured} measured, ${doc.coverage.with_subject} with a subject on the camera -> ${rel(OUT)}`);
if (problems.length) console.log(problems.map((p) => `  problem: ${p}`).join('\n'));
{
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\n${pad('size/template', 30)} ${pad('n', 4)} ${pad('mm (p10-med-p90)', 18)} ${pad('dist m', 16)} ${pad('frame h m', 16)} ${pad('cam h m', 16)} side deg`);
  for (const [k, g] of Object.entries(doc.by_size_template)) {
    const b = g.bands || {}, f = (x) => (x ? `${x.p10}-${x.median}-${x.p90}` : '-');
    console.log(`${pad(k, 30)} ${pad(g.measured, 4)} ${pad(f(b.mm), 18)} ${pad(f(b.dist), 16)} ${pad(f(b.frame_h_m), 16)} ${pad(f(b.cam_h), 16)} ${f(b.bearing_side)}`);
  }
}
