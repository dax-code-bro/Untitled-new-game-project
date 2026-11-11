#!/usr/bin/env node
// Engine phase 2 (engine/DESIGN.md section 1b): episodes/<ep>/input/shotlist.txt -> final/shotlist.json in the
// EXACT Episode 1 schema (episodes/s01e01/final/shotlist.json: meta, sets, conventions, flag and tag definitions,
// shots, scene_totals, unit_totals, totals), and the SET blocks -> final/sets.plan.json (for the set generator).
//
//   node engine/input/shotlist-parse.mjs --episode s01e02 [--input <dir> | --file <shotlist.txt>]
//        [--dialogue <dialogue.json>] [--out <dir>]
//
// The format is in input/CHATGPT-SHOTLIST-PROMPT.md. In short: blocks that start with "SET <ID>" or "SHOT <id>",
// then "key: value" lines (an indented line continues the value; " # ..." is a comment, "\#" a literal #).
// lines: entries are matched to the screenplay (final/dialogue.json) by speaker and first words, in order.
// Timing when no seconds:/frames: is given = dialogue (est_seconds + 0.35 s per line) + action + breath, where
// action and breath default to the Episode 1 medians for the shot size (with / without dialogue).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dirs, rel, json, safeWrite, sha256, opts, FPS, TURN_GAP, normText, normSpeaker, normSize, knownMove, LENS_BY_SIZE,
  DRAGON_RE, HUMAN_RE, defaultKind, registrySets, ep1Shotlist,
} from './common.mjs';

const GENERATED_BY = 'engine/input/shotlist-parse.mjs';
export const SHOT_KEYS = ['scene', 'part', 'origin', 'set', 'size', 'lens', 'move', 'from', 'frame', 'action', 'lines', 'sound', 'seconds', 'frames', 'timing',
  'flags', 'tags', 'trans', 'stage', 'tod', 'light', 'render', 'difficulty', 'note'];
export const SET_KEYS = ['template', 'size', 'world', 'features', 'tod', 'about', 'dressing', 'from'];
// Episode 1 medians (episodes/s01e01/final/shotlist.json, 726 shots): action seconds without / with dialogue, breath with dialogue
const ACTION_S = { 'extreme wide': [5, 1], wide: [4, 2], medium: [2.5, 0.5], close: [2.5, 1], insert: [3, 1.5], POV: [3, 4], 'card (black/text, no 3D)': [3, 0] };
const BREATH_S = { POV: 1 };
export const rhalf = (x) => Math.floor(x * 2 + 0.5) / 2;
const POS_TOKEN = /^(?:far-)?(?:[LRCS]|bg|fg|top|bottom|all|L-C|R-C)(?:-[A-Za-z]+)*$/;

/** Split on `sep` outside (), [] and "". */
export function splitTop(s, sep = ';') {
  const out = [];
  let depth = 0, q = false, cur = '';
  for (const ch of s) {
    if (ch === '"') q = !q;
    else if (!q && (ch === '(' || ch === '[')) depth++;
    else if (!q && (ch === ')' || ch === ']')) depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0 && !q) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Blocks of the text: [{ type: 'SET'|'SHOT', id, line, fields: {key: value}, keyLines: {key: n}, unknown: [] }]. */
export function readBlocks(text) {
  const blocks = [], errors = [];
  let cur = null, lastKey = null;
  text.replace(/\r\n?/g, '\n').split('\n').forEach((raw, k) => {
    const line = raw.replace(/(^|\s)#(?!#)(\s.*)?$/, (m, a) => (/\\$/.test(a) ? m : '')).replace(/\\#/g, '#');
    if (!line.trim()) { lastKey = null; return; }
    const head = line.match(/^(SET|SHOT)\s+(\S+)\s*$/);
    if (head) { cur = { type: head[1], id: head[2], line: k + 1, fields: {}, keyLines: {}, unknown: [] }; blocks.push(cur); lastKey = null; return; }
    if (/^\s/.test(raw) && cur && lastKey) { cur.fields[lastKey] += ' ' + line.trim(); return; }
    const kv = line.match(/^([A-Za-z_][A-Za-z_ -]*?)\s*:\s*(.*)$/);
    if (!kv || !cur) { errors.push({ code: 'E_SYNTAX', line: k + 1, msg: `not a "key: value" line or block header: "${line.trim().slice(0, 80)}"` }); return; }
    const key = kv[1].toLowerCase().replace(/[ -]/g, '_');
    lastKey = key;
    cur.fields[key] = kv[2].trim();
    cur.keyLines[key] = k + 1;
    if (!(cur.type === 'SET' ? SET_KEYS : SHOT_KEYS).includes(key)) cur.unknown.push(key);
  });
  return { blocks, errors };
}

/** frame: "Abby L (sling left); Vendor @ R (at his stall); fountain [element] C" -> in_frame entries. */
export function parseFrame(v) {
  return splitTop(v || '').map((e) => {
    let kind = null;
    e = e.replace(/\s*\[(person|dragon|element)\]\s*/i, (_, k) => { kind = k.toLowerCase(); return ' '; }).trim();
    let name, pos;
    const at = e.indexOf(' @');
    if (at >= 0 || e.endsWith('@')) { name = e.slice(0, at >= 0 ? at : e.length - 1).trim(); pos = e.slice((at >= 0 ? at : e.length - 1) + 2).trim(); }
    else {
      const toks = e.split(/\s+/);
      const k = toks.findIndex((t, n) => n > 0 && POS_TOKEN.test(t));
      if (k < 0) { name = e; pos = ''; } else { name = toks.slice(0, k).join(' '); pos = toks.slice(k).join(' '); }
    }
    return { name, screen_pos: pos, kind: kind || defaultKind(name) };
  });
}

/** lines: 'ABBY "Is anyone left?"; VENDOR "Enough." x0.5 (off); L007' -> [{speaker, words, id, portion, off}]. */
export function parseLines(v) {
  return splitTop(v || '').map((e) => {
    const r = { raw: e, speaker: null, words: null, id: null, portion: 1, off: false };
    e = e.replace(/\s*\(off\)\s*/i, () => { r.off = true; return ' '; }).replace(/\s+x\s*(\d*\.?\d+)\s*$/, (_, p) => { r.portion = +p; return ''; }).trim();
    e = e.replace(/\s*=\s*(L\d+)\s*$/, (_, id) => { r.id = id; return ''; }).trim();
    const q = e.match(/^(.*?)\s*"(.*)"\s*$/);
    if (q) { r.speaker = normSpeaker(q[1]); r.words = q[2]; } else if (/^L\d+$/.test(e)) r.id = e; else r.speaker = normSpeaker(e);
    return r;
  });
}

const speakerInFrame = (speaker, inframe) => {
  const sp = speaker.toLowerCase();
  return inframe.some((f) => { const n = f.name.toLowerCase(); return n.startsWith(sp) || n.includes(sp); });
};

/** Parse shotlist text against the screenplay's lines. Returns { shotlist, plan, issues }. */
export async function parseShotlist(text, { ep, dialogue, source = 'input/shotlist.txt', dialogueSource = null } = {}) {
  const SETS = await registrySets();
  const E1 = ep1Shotlist();
  const { blocks, errors } = readBlocks(text);
  const issues = [...errors];
  const lines = dialogue?.lines || [];
  const byId = new Map(lines.map((x) => [x.id, x]));
  const sceneInfo = new Map((dialogue?.scenes || []).map((s) => [s.id, s]));
  const used = new Map();                                   // line id -> portion used so far
  let cursor = 0;                                           // index in `lines` after the last match

  const match = (r, scene, shotId) => {
    if (r.id) return byId.get(r.id) || null;
    const w = normText(r.words || '');
    const said = (x) => x.speaker === r.speaker && (!w || normText(x.text).startsWith(w));
    const ok = (x) => said(x) && (used.get(x.id) || 0) + r.portion <= 1 + 1e-6;
    const order = [...lines.slice(cursor), ...lines.slice(0, cursor)];
    // an unused line of this scene, then any unused line, then (so the validator reports it twice) a used one
    return order.find((x) => ok(x) && x.scene === scene) || order.find(ok) || order.find((x) => said(x) && x.scene === scene) || order.find(said) || null;
  };

  const plan = [];
  for (const b of blocks.filter((x) => x.type === 'SET')) {
    const f = b.fields;
    const reuse = !!SETS[b.id];
    plan.push({ id: b.id, action: f.template ? (reuse ? 'variant' : 'generate') : reuse ? 'reuse' : 'unknown', template: f.template || null,
      size: f.size || null, world: f.world || null, features: f.features ? f.features.split(/\s*;\s*/).filter(Boolean) : [], tod: f.tod || null,
      dressing: f.dressing || null, about: f.about || null, source_line: b.line });
    for (const k of b.unknown) issues.push({ code: 'W_KEY', line: b.line, msg: `SET ${b.id}: unknown key "${k}"` });
  }

  // render-cost medians per set from Episode 1 (the 4K PC estimate; phase 7 re-measures)
  const spfBySet = {};
  for (const s of E1?.shots || []) if (s.render === '3d') (spfBySet[s.set] ||= []).push(s.native_4k_s_per_frame);
  const med = (xs) => { const a = xs.filter((x) => x != null).sort((p, q) => p - q); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };

  const shots = [];
  for (const b of blocks.filter((x) => x.type === 'SHOT')) {
    const f = b.fields;
    for (const k of b.unknown) issues.push({ code: 'W_KEY', line: b.line, shot: b.id, msg: `${b.id}: unknown key "${k}"` });
    const scene = f.scene || b.id.split('-')[0];
    const set = f.set || null;
    const sizeIn = f.size || '';
    const size = normSize(sizeIn) || sizeIn;
    const inFrame = parseFrame(f.frame);
    const dlg = [];
    let dlgS = 0;
    for (const r of parseLines(f.lines)) {
      const x = match(r, scene, b.id);
      if (!x) { issues.push({ code: 'E_LINE_UNKNOWN', line: b.keyLines.lines, shot: b.id, msg: `${b.id}: no screenplay line matches ${r.raw}` }); continue; }
      used.set(x.id, (used.get(x.id) || 0) + r.portion);
      cursor = lines.indexOf(x) + ((used.get(x.id) || 0) >= 1 - 1e-6 ? 1 : 0);
      const on = x.speaker !== 'NARRATOR' && !r.off && speakerInFrame(x.speaker, inFrame);
      const e = { id: x.id, speaker: x.speaker, first_words: x.text.split(/\s+/).slice(0, 6).join(' '), origin: x.origin,
        spoken_s: x.est_seconds, line_seconds: Math.round((x.est_seconds + TURN_GAP) * 100) / 100, speaker_on_screen: on };
      if (r.portion !== 1) e.portion = r.portion;
      if (x.performance_note) e.delivery = x.performance_note;
      if (x.pending) e.pending = x.pending;
      if (x.creator_approved) e.creator_approved = x.creator_approved;
      dlg.push(e);
      dlgS += (x.est_seconds + TURN_GAP) * r.portion;
    }
    const [a0, a1] = ACTION_S[size] || [3, 1];
    const tm = (f.timing || '').toLowerCase();
    const num = (re, d) => { const m = tm.match(re); return m ? +m[1] : d; };
    const a = num(/action\s*(-?\d*\.?\d+)/, dlg.length ? a1 : a0), bth = num(/breath\s*(-?\d*\.?\d+)/, dlg.length ? (BREATH_S[size] || 0) : 0);
    const est = f.seconds != null && f.seconds !== '' ? +f.seconds : rhalf(dlgS + a + bth);
    const frames = f.frames != null && f.frames !== '' ? +f.frames : Math.round(est * FPS);
    const flags = f.flags ? splitTop(f.flags, f.flags.includes(';') ? ';' : ',') : [];
    const tags = f.tags ? splitTop(f.tags, f.tags.includes(';') ? ';' : ',') : [];
    const lens = f.lens ? (/^\d+(\.\d+)?$/.test(f.lens) ? `${f.lens} mm` : f.lens) : (LENS_BY_SIZE[size] || 'n/a');
    const render = f.render || (set === 'CARD_BLACK' ? 'black' : '3d');
    const diff = f.difficulty ? +f.difficulty : inFrame.length ? 2 : 1;
    const part = f.part && f.part !== 'null' ? f.part : null;
    const spf = render === '3d' && spfBySet[set]
      ? { expected: med(spfBySet[set].map((x) => x.expected)), low: med(spfBySet[set].map((x) => x.low)), high: med(spfBySet[set].map((x) => x.high)), basis: `ESTIMATE: median of the Episode 1 shots on ${set}` }
      : { expected: render === '3d' ? null : 0, low: render === '3d' ? null : 0, high: render === '3d' ? null : 0, basis: render === '3d' ? 'not estimated yet (no Episode 1 shots on this set)' : 'no 3D render' };
    const sc = sceneInfo.get(scene);
    const cont = SETS[set]?.continuity?.[scene];
    const shot = {
      seq: shots.length + 1, id: b.id, scene, part, origin: f.origin || (part ? (part.startsWith('R') ? 'rating_pass' : 'addition') : 'handoff'),
      set, time_of_day: f.tod || sc?.time_of_day || null, lighting: f.light || cont?.tod || '',
      shot_size: size, lens, camera_move: f.move || 'static', in_frame: inFrame, action: f.action || '', dialogue: dlg, sound: f.sound || '',
      continuity_flags: flags, timing: { dialogue_s: Math.round(dlgS * 100) / 100, action_s: a, breath_s: bth },
      est_seconds: est, est_low_s: rhalf(0.9 * dlgS + 0.8 * a + 0.5 * bth), est_high_s: rhalf(1.15 * dlgS + 1.3 * a + 1.5 * bth), frames_at_24fps: frames,
      render, difficulty: diff, difficulty_tags: tags, hard: diff >= 4, native_4k_s_per_frame: spf, realism_strategy: null,
    };
    if (f.seconds && !f.timing) { const k = est / Math.max(0.01, dlgS + a + bth); shot.est_low_s = rhalf(shot.est_low_s * k); shot.est_high_s = rhalf(shot.est_high_s * k); }
    if (f.note) shot.note = f.note;
    const engine = {};
    if (f.from) engine.from = f.from;
    if (f.trans) engine.trans = f.trans;
    if (f.stage) { try { engine.stage = JSON.parse(f.stage); } catch { issues.push({ code: 'E_STAGE_JSON', line: b.keyLines.stage, shot: b.id, msg: `${b.id}: stage: is not valid JSON` }); } }
    if (Object.keys(engine).length) shot.engine = engine;
    shot._src = { line: b.line, keyLines: b.keyLines, sizeIn, moveKnown: knownMove(f.move || 'static'), sizeKnown: !!normSize(sizeIn) };
    shots.push(shot);
  }

  // ---- tables ----
  const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
  const sum = (xs, k) => xs.reduce((s, x) => s + x[k], 0);
  const sceneOrder = [...new Set(shots.map((s) => s.scene))];
  let start = 0;
  const scene_totals = sceneOrder.map((sc) => {
    const xs = shots.filter((s) => s.scene === sc);
    const row = { scene: sc, title: sceneInfo.get(sc)?.title ?? null, start_s: r1(start), shots: xs.length,
      spoken_lines: new Set(xs.flatMap((s) => s.dialogue.map((d) => d.id))).size, parts: [...new Set(xs.map((s) => s.part).filter(Boolean))],
      low_s: r1(sum(xs, 'est_low_s')), expected_s: r1(sum(xs, 'est_seconds')), high_s: r1(sum(xs, 'est_high_s')),
      frames_expected: Math.round(sum(xs, 'est_seconds') * FPS), hard_shots: xs.filter((s) => s.hard).length, sets: [...new Set(xs.map((s) => s.set))] };
    start += row.expected_s;
    return row;
  });
  const unit_totals = {};
  for (const s of shots) if (s.part) { const u = (unit_totals[s.part] ||= { shots: 0, expected_s: 0 }); u.shots++; u.expected_s = r1(u.expected_s + s.est_seconds); }
  const count = (xs) => xs.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});
  const T = { low: sum(shots, 'est_low_s'), exp: sum(shots, 'est_seconds'), high: sum(shots, 'est_high_s') };
  const totals = { shots: shots.length, spoken_lines: new Set(shots.flatMap((s) => s.dialogue.map((d) => d.id))).size,
    low_s: r1(T.low), expected_s: r1(T.exp), high_s: r1(T.high), low_min: r2(T.low / 60), expected_min: r2(T.exp / 60), high_min: r2(T.high / 60),
    frames_expected: Math.round(T.exp * FPS), frames_total: shots.reduce((s, x) => s + (Number.isFinite(x.frames_at_24fps) ? x.frames_at_24fps : 0), 0),
    hard_shots: shots.filter((s) => s.hard).length, shots_by_origin: count(shots.map((s) => s.origin)),
    shots_with_realism_strategy: 0, shots_per_tag: count(shots.flatMap((s) => s.difficulty_tags)), shots_per_flag: count(shots.flatMap((s) => s.continuity_flags)) };
  const planById = new Map(plan.map((p) => [p.id, p]));
  const e1Sets = new Map((E1?.sets || []).map((s) => [s.id, s.description]));
  const setIds = [...new Set(shots.map((s) => s.set).filter(Boolean))];
  const sets = setIds.map((id) => {
    const xs = shots.filter((s) => s.set === id), p = planById.get(id);
    const description = e1Sets.get(id) || e1Sets.get(SETS[id]?.shotSet) || p?.about || (p?.features?.length ? `${p.template || 'set'}: ${p.features.join('; ')}` : null) || SETS[id]?.from || '';
    return { id, description, shots: xs.length, expected_s: r1(sum(xs, 'est_seconds')), new_in_final: !!(p && p.action === 'generate') };
  });
  const defs = (k, used2) => Object.fromEntries(used2.map((f) => [f, E1?.[k]?.[f] ?? '(defined by this episode\'s shot list; no Episode 1 definition)']));
  const sha = await sha256(text);
  const shotlist = {
    meta: {
      title: `Dragon's Kingdom - ${dialogue?.episode || dirs(ep).tag} - shot list`, status: 'PLAN ONLY. Parsed from the owner\'s shot list by the episode engine. Durations are animatic estimates.',
      source, source_sha256: sha, dialogue: dialogueSource, generated_by: GENERATED_BY, fps: FPS,
      delivery: 'native 3840x2160, 24 fps, --preset final on every frame (SERIES.md section 2)',
      ids: 'Shot ids as written in the shot list (SHOT <id>).',
      estimate_model: `Episode 1 model: expected = dialogue + action + breath (rounded to 0.5 s) unless seconds:/frames: is given; dialogue = dialogue.json est_seconds + ${TURN_GAP} s cue gap per line; action/breath default to the Episode 1 medians per shot size; low = 0.9/0.8/0.5 x; high = 1.15/1.3/1.5 x.`,
      lens: 'Full-frame-equivalent focal length: as written, else by shot size (EWS 24, WS 35, MS 50, CU 85, INS 100 macro).',
      native_4k_s_per_frame: 'Median of the Episode 1 shots on the same set, where there are any.',
      dropped_shots: [], check_final_estimate_s: null,
    },
    sets, conventions: {}, continuity_flag_definitions: defs('continuity_flag_definitions', Object.keys(totals.shots_per_flag)),
    difficulty_tag_definitions: defs('difficulty_tag_definitions', Object.keys(totals.shots_per_tag)),
    shots, scene_totals, unit_totals, totals,
  };
  return { shotlist, plan, issues, used };
}

/** shotlist.json text without the parser's private _src fields. */
export const shotlistJson = (sl) => json({ ...sl, shots: sl.shots.map(({ _src, ...s }) => s) });

export function shotlistPaths(ep, o = {}) {
  const D = dirs(ep);
  const input = o.input ? path.resolve(o.input) : D.input;
  const out = o.out ? path.resolve(o.out) : D.final;
  return { D, input, out, file: o.file ? path.resolve(o.file) : path.join(input, 'shotlist.txt'), dialogue: o.dialogue ? path.resolve(o.dialogue) : path.join(out, 'dialogue.json') };
}

async function main() {
  const o = opts(process.argv.slice(2));
  const ep = o.episode || 's01e01';
  const P = shotlistPaths(ep, o);
  if (!fs.existsSync(P.file)) { console.error(`shotlist-parse: no ${rel(P.file)}`); process.exit(2); }
  if (!fs.existsSync(P.dialogue)) { console.error(`shotlist-parse: no ${rel(P.dialogue)} (run engine/input/fountain.mjs --episode ${ep} first)`); process.exit(2); }
  if (ep === 's01e01' && !o.out) { console.error('shotlist-parse: refusing to overwrite Episode 1\'s hand-built shotlist.json; pass --out <dir>'); process.exit(2); }
  const dialogue = JSON.parse(fs.readFileSync(P.dialogue, 'utf8'));
  const r = await parseShotlist(fs.readFileSync(P.file, 'utf8'), { ep, dialogue, source: rel(P.file), dialogueSource: rel(P.dialogue) });
  const errs = r.issues.filter((x) => x.code.startsWith('E_'));
  for (const x of r.issues) console.error(`shotlist-parse: ${x.code.startsWith('E_') ? 'ERROR' : 'warning'}${x.line ? ' line ' + x.line : ''}: ${x.msg}`);
  safeWrite(path.join(P.out, 'shotlist.json'), shotlistJson(r.shotlist));
  safeWrite(path.join(P.out, 'sets.plan.json'), json({ about: 'SET blocks of the shot list (engine/input/shotlist-parse.mjs) for the set generator (engine phase 7): reuse | variant | generate | unknown.', source: rel(P.file), sets: r.plan }));
  console.log(`shotlist-parse: ${r.shotlist.shots.length} shots, ${r.shotlist.totals.expected_min} min, ${r.plan.length} SET blocks -> ${rel(P.out)}/{shotlist,sets.plan}.json${errs.length ? ` (${errs.length} errors: run validate.mjs)` : ''}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error('shotlist-parse:', e.message); process.exit(2); });
