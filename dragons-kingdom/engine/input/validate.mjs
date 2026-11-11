#!/usr/bin/env node
// Engine phase 2 (engine/DESIGN.md section 1b): validate an episode's input -> final/validation.md; exit 1 on errors.
//
//   node engine/input/validate.mjs --episode s01e02 [--write] [--input <dir>] [--out <dir>] [--json]
//
// It parses input/screenplay.fountain and input/shotlist.txt in memory (never writing inside input/); --write also
// writes the parser outputs (dialogue.json, onscreen-text.json, lines.lock.json, shotlist.json, sets.plan.json).
// Errors (stop the run):
//   E_SET         a shot's set is neither in the registry (SETS) nor a SET block with a template
//   E_CHAR        a speaker or a character in frame the engine does not know (CHARACTERS.md, humans CAST, creatures, roles)
//   E_LINE_MISSED / E_LINE_TWICE / E_LINE_ORDER / E_LINE_UNKNOWN
//                 every screenplay line in exactly one shot (portions add up to 1), in screenplay order; every lines:
//                 entry matches a screenplay line
//   E_CHILD       a child (or possible minor) in frame in a rating-pass shot (R*) or a NO_CHILD_IN_FRAME shot
//   E_FRAMES      frames <= 0 (or not a whole number)
//   E_DUP_SHOT, E_SYNTAX, E_SCENE_NUMBER, E_NO_SCENE, E_EMPTY_LINE, E_STAGE_JSON
// Warnings: W_RUNTIME (outside 50-60 min; not for "test": true episodes), W_SIZE / W_MOVE (unknown vocabulary),
//   W_KEY (unknown key), W_SCENE, W_LINE_SCENE, W_RATING (check_final.py's child + vice lint), W_SET_BLOCK.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { episodeConfig } from '../../scenes/lib/director/episode-paths.js';
import { dirs, rel, json, safeWrite, opts, knownCharacter, isChildName, registrySets, SIZES, MOVE_WORDS } from './common.mjs';
import { buildFromFountain } from './fountain.mjs';
import { parseShotlist, shotlistJson } from './shotlist-parse.mjs';

export async function validateEpisode(ep, o = {}) {
  const D = dirs(ep);
  const input = o.input ? path.resolve(o.input) : D.input;
  const out = o.out ? path.resolve(o.out) : D.final;
  const cfg = episodeConfig(ep) || {};
  const errors = [], warnings = [];
  const add = (x) => (x.code.startsWith('E_') ? errors : warnings).push(x);
  const spFile = path.join(input, 'screenplay.fountain'), slFile = path.join(input, 'shotlist.txt');
  const lockFile = path.join(out, 'lines.lock.json');
  let F = null, dialogue = null;
  if (fs.existsSync(spFile)) {
    const lock = fs.existsSync(lockFile) ? JSON.parse(fs.readFileSync(lockFile, 'utf8')) : null;
    F = await buildFromFountain(fs.readFileSync(spFile, 'utf8'), { ep, lock, source: rel(spFile) });
    dialogue = F.dialogue;
    for (const e of F.errors) add({ ...e, where: `screenplay line ${e.line}` });
    for (const w of F.lint) add({ ...w, where: `screenplay line ${w.line}` });
  } else if (fs.existsSync(path.join(out, 'dialogue.json'))) dialogue = JSON.parse(fs.readFileSync(path.join(out, 'dialogue.json'), 'utf8'));
  else add({ code: 'E_NO_SCREENPLAY', where: rel(input), msg: 'no screenplay.fountain (and no final/dialogue.json)' });
  if (!fs.existsSync(slFile)) { add({ code: 'E_NO_SHOTLIST', where: rel(input), msg: 'no shotlist.txt' }); return finish(); }
  const S = await parseShotlist(fs.readFileSync(slFile, 'utf8'), { ep, dialogue, source: rel(slFile), dialogueSource: rel(D.dialogue) });   // the episode's own path, also when --out moves the files
  const shots = S.shotlist.shots;
  for (const x of S.issues) add({ ...x, where: x.shot ? `${x.shot} (shotlist line ${x.line})` : `shotlist line ${x.line}` });
  const SETS = await registrySets();
  const plan = new Map(S.plan.map((p) => [p.id, p]));
  const lines = dialogue?.lines || [];
  const at = (s, key) => `${s.id} (shotlist line ${s._src.keyLines[key] || s._src.line})`;

  // shots: ids, sets, characters, children, frames, vocabulary, scenes
  const seen = new Set();
  const sceneIds = new Set((dialogue?.scenes || []).map((s) => s.id));
  for (const s of shots) {
    if (seen.has(s.id)) add({ code: 'E_DUP_SHOT', where: at(s), msg: `shot id ${s.id} is used twice` });
    seen.add(s.id);
    const p = plan.get(s.set);
    if (!s.set) add({ code: 'E_SET', where: at(s), msg: `${s.id} has no set:` });
    else if (!SETS[s.set] && !(p && (p.action === 'generate' || p.action === 'variant')))
      add({ code: 'E_SET', where: at(s, 'set'), msg: `unknown set ${s.set}: not in the registry, and no SET block with a template: describes it` });
    for (const f of s.in_frame) {
      if (f.kind !== 'element' && !knownCharacter(f.name))
        add({ code: 'E_CHAR', where: at(s, 'frame'), msg: `unknown character "${f.name}" in frame (a thing? write it in lower case or add [element])` });
    }
    const rating = /^R\d/.test(s.id) || /^R\d/.test(s.part || '') || s.origin === 'rating_pass';
    if (rating || s.continuity_flags.includes('NO_CHILD_IN_FRAME')) {
      for (const f of s.in_frame) if (isChildName(f.name))
        add({ code: 'E_CHILD', where: at(s, 'frame'), msg: `${f.name} (a child or possible minor) in frame in a ${rating ? 'rating-pass (R*)' : 'NO_CHILD_IN_FRAME'} shot (SERIES.md section 8)` });
    }
    if (!Number.isInteger(s.frames_at_24fps) || s.frames_at_24fps <= 0)
      add({ code: 'E_FRAMES', where: at(s, s._src.keyLines.frames ? 'frames' : 'seconds'), msg: `${s.id}: frames = ${s.frames_at_24fps} (must be a whole number > 0)` });
    if (!s._src.sizeKnown) add({ code: 'W_SIZE', where: at(s, 'size'), msg: `size "${s._src.sizeIn}" is not one of: ${SIZES.join(', ')} (or EWS/WS/MS/CU/INS)` });
    if (!s._src.moveKnown) add({ code: 'W_MOVE', where: at(s, 'move'), msg: `move "${s.camera_move}" has no known word (${MOVE_WORDS.slice(0, 14).join(', ')} ...)` });
    if (sceneIds.size && !sceneIds.has(s.scene)) add({ code: 'W_SCENE', where: at(s, 'scene'), msg: `scene ${s.scene} is not a #scene number# of the screenplay` });
  }
  for (const p of S.plan) {
    if (p.action === 'unknown') add({ code: 'W_SET_BLOCK', where: `shotlist line ${p.source_line}`, msg: `SET ${p.id}: not in the registry and no template: (a new set needs template:, size:, features:)` });
  }
  // speakers of the screenplay
  for (const sp of [...new Set(lines.map((x) => x.speaker))]) {
    if (sp !== 'NARRATOR' && !knownCharacter(sp)) {
      const x = lines.find((y) => y.speaker === sp);
      add({ code: 'E_CHAR', where: `screenplay line ${x.source_line}`, msg: `unknown speaker ${sp} (not in CHARACTERS.md, the humans cast or the generic roles)` });
    }
  }
  // line coverage and order
  const seqOf = new Map(lines.map((x) => [x.id, x.seq]));
  for (const x of lines) {
    const u = S.used.get(x.id) || 0;
    if (u === 0) add({ code: 'E_LINE_MISSED', where: `screenplay line ${x.source_line}`, msg: `${x.id} ${x.speaker} "${x.text.slice(0, 60)}" is in no shot` });
    else if (Math.abs(u - 1) > 1e-6) add({ code: 'E_LINE_TWICE', where: `screenplay line ${x.source_line}`, msg: `${x.id} ${x.speaker} "${x.text.slice(0, 60)}" is covered ${Math.round(u * 100) / 100} times (portions must add up to 1)` });
  }
  let maxSeq = 0, maxId = null;
  for (const s of shots) {
    for (const d of s.dialogue) {
      const q = seqOf.get(d.id);
      if (q < maxSeq) add({ code: 'E_LINE_ORDER', where: at(s, 'lines'), msg: `${d.id} ${d.speaker} "${d.first_words}" comes after ${maxId} in the shots but before it in the screenplay` });
      if (q > maxSeq) { maxSeq = q; maxId = d.id; }
      const x = lines.find((y) => y.id === d.id);
      if (x && x.scene !== s.scene) add({ code: 'W_LINE_SCENE', where: at(s, 'lines'), msg: `${d.id} plays in scene ${x.scene} of the screenplay but this shot is in ${s.scene}` });
    }
  }
  const mins = S.shotlist.totals.expected_min;
  if (!cfg.test && (mins < 50 || mins > 60)) add({ code: 'W_RUNTIME', where: 'episode', msg: `estimated runtime ${mins} min is outside 50-60 min` });

  if (o.write) {
    if (F) {
      safeWrite(path.join(out, 'dialogue.json'), json(F.dialogue));
      safeWrite(path.join(out, 'onscreen-text.json'), json(F.onscreen));
      safeWrite(lockFile, json(F.lock));
    }
    safeWrite(path.join(out, 'shotlist.json'), shotlistJson(S.shotlist));
    safeWrite(path.join(out, 'sets.plan.json'), json({ about: 'SET blocks of the shot list (engine/input/shotlist-parse.mjs) for the set generator (engine phase 7): reuse | variant | generate | unknown.', source: rel(slFile), sets: S.plan }));
  }
  return finish(S);

  function finish(S2 = null) {
    const T = S2?.shotlist.totals;
    const W = [`# ${D.tag}: input validation`, '', `Made by \`engine/input/validate.mjs\` from \`${rel(input)}/\`. Errors stop the engine; warnings do not.`, '',
      `**${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.**`, ''];
    if (T) W.push(`- Shots: ${T.shots}; spoken lines in shots: ${T.spoken_lines} of ${lines.length}; scenes: ${S2.shotlist.scene_totals.length}.`,
      `- Estimated runtime: ${T.expected_min} min (${T.low_min}-${T.high_min}), ${T.frames_total} frames at 24 fps${cfg.test ? ' (test episode: no 50-60 min check)' : ''}.`,
      `- Sets: ${S2.shotlist.sets.map((x) => `${x.id} (${x.shots})`).join(', ')}.`, '');
    const table = (title, xs) => {
      W.push(`## ${title}`, '');
      if (!xs.length) { W.push('None.', ''); return; }
      W.push('| Code | Where | What |', '|---|---|---|');
      for (const x of xs) W.push(`| ${x.code} | ${x.where || ''} | ${String(x.msg).replace(/\|/g, '\\|')} |`);
      W.push('');
    };
    table('Errors', errors);
    table('Warnings', warnings);
    const md = W.join('\n');
    if (!o.dryRun) safeWrite(path.join(out, 'validation.md'), md);
    return { ok: errors.length === 0, errors, warnings, md, totals: T || null };
  }
}

async function main() {
  const o = opts(process.argv.slice(2), ['write', 'json']);
  const ep = o.episode || 's01e01';
  if (ep === 's01e01' && !o.out && (o.write || !fs.existsSync(dirs(ep).input))) { console.error('validate: Episode 1 has no input/ folder; pass --input and --out'); process.exit(2); }
  const r = await validateEpisode(ep, { input: o.input, out: o.out, write: !!o.write });
  if (o.json) console.log(JSON.stringify({ ok: r.ok, errors: r.errors, warnings: r.warnings, totals: r.totals }, null, 2));
  else {
    for (const x of r.errors) console.error(`ERROR   ${x.code}  ${x.where || ''}: ${x.msg}`);
    for (const x of r.warnings) console.error(`warning ${x.code}  ${x.where || ''}: ${x.msg}`);
    console.log(`validate ${ep}: ${r.errors.length} errors, ${r.warnings.length} warnings -> ${rel(path.join(o.out ? path.resolve(o.out) : dirs(ep).final, 'validation.md'))}`);
  }
  process.exit(r.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error('validate:', e.message); process.exit(2); });
