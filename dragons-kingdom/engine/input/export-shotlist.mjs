#!/usr/bin/env node
// Engine phase 2: final/shotlist.json -> shotlist.txt (the owner's block format), the round-trip helper.
// Parsing the output back (shotlist-parse.mjs) gives the same id, scene, set, shot_size, lens, camera_move,
// in_frame (name, screen_pos, kind), action, dialogue ids/portions, sound, flags, tags, timing and frames.
//
//   node engine/input/export-shotlist.mjs --episode s01e01 [--scenes 1C,1D] [--sets CLING_SQUARE] [--ids] [--out file.txt]
//
// --ids writes each line's id (=L042) next to its first words; without it, lines are matched by speaker and words.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirs, rel, safeWrite, opts, LENS_BY_SIZE } from './common.mjs';
import { parseFrame, rhalf } from './shotlist-parse.mjs';

const esc = (v) => String(v ?? '').replace(/\n/g, ' ').replace(/(^|\s)#/g, '$1\\#');
const SIZE_ABBR = { 'extreme wide': 'EWS', wide: 'wide', medium: 'medium', close: 'close', insert: 'insert', POV: 'POV', 'card (black/text, no 3D)': 'CARD' };

/** One frame entry as text; the short form "Name POS" when it parses back the same, else "Name @ POS". */
export function frameEntry(f) {
  for (const form of [`${f.name} ${f.screen_pos}`.trim(), `${f.name} @ ${f.screen_pos}`.trim()]) {
    const [p] = parseFrame(form);
    if (p && p.name === f.name && p.screen_pos === f.screen_pos) return p.kind === f.kind ? form : form.replace(f.name, `${f.name} [${f.kind}]`);
  }
  return `${f.name} [${f.kind}] @ ${f.screen_pos}`;
}

export function exportShots(shots, { ids = false, dialogue = null, sets = null } = {}) {
  const W = [];
  const lines = new Map((dialogue?.lines || []).map((x) => [x.id, x]));
  W.push('# Dragon\'s Kingdom shot list (engine/input/export-shotlist.mjs). Format: engine/input/CHATGPT-SHOTLIST-PROMPT.md', '');
  for (const id of sets || [...new Set(shots.map((s) => s.set))]) W.push(`SET ${id}`);
  W.push('');
  for (const s of shots) {
    W.push(`SHOT ${s.id}`);
    const put = (k, v) => { if (v !== null && v !== undefined && v !== '') W.push(`${k}: ${esc(v)}`); };
    put('scene', s.scene);
    if (s.part) put('part', s.part);
    const autoOrigin = s.part ? (s.part.startsWith('R') ? 'rating_pass' : 'addition') : 'handoff';
    if (s.origin !== autoOrigin) put('origin', s.origin);
    put('set', s.set);
    put('size', SIZE_ABBR[s.shot_size] || s.shot_size);
    put('lens', s.lens === LENS_BY_SIZE[s.shot_size] ? null : (/^\d+(\.\d+)? mm$/.test(s.lens) ? s.lens.replace(' mm', '') : s.lens));
    put('move', s.camera_move);
    if (s.engine?.from) put('from', s.engine.from);
    put('frame', s.in_frame.map(frameEntry).join('; '));
    put('action', s.action);
    put('lines', s.dialogue.map((d) => {
      const x = lines.get(d.id);
      const words = x ? x.text.split(/\s+/).slice(0, 6).join(' ') : d.first_words;
      let e = `${d.speaker} "${words.replace(/"/g, '')}"${ids ? ` =${d.id}` : ''}`;
      if (d.portion != null && d.portion !== 1) e += ` x${d.portion}`;
      const inFrame = s.in_frame.some((f) => { const n = f.name.toLowerCase(), sp = d.speaker.toLowerCase(); return n.startsWith(sp) || n.includes(sp); });
      if (!d.speaker_on_screen && d.speaker !== 'NARRATOR' && inFrame) e += ' (off)';
      return e;
    }).join('; '));
    put('sound', s.sound);
    put('tod', s.time_of_day);
    put('light', s.lighting);
    if (s.continuity_flags?.length) put('flags', s.continuity_flags.join(', '));
    if (s.difficulty_tags?.length) put('tags', s.difficulty_tags.join(', '));
    if (s.timing) put('timing', `action ${s.timing.action_s}, breath ${s.timing.breath_s}`);
    if (s.est_seconds !== rhalf((s.timing?.dialogue_s || 0) + (s.timing?.action_s || 0) + (s.timing?.breath_s || 0))) put('seconds', s.est_seconds);
    if (s.frames_at_24fps !== Math.round(s.est_seconds * 24)) put('frames', s.frames_at_24fps);
    if (s.render && s.render !== (s.set === 'CARD_BLACK' ? 'black' : '3d')) put('render', s.render);
    if (s.difficulty !== (s.in_frame.length ? 2 : 1)) put('difficulty', s.difficulty);
    if (s.engine?.trans) put('trans', s.engine.trans);
    if (s.engine?.stage) put('stage', JSON.stringify(s.engine.stage));
    if (s.note) put('note', s.note);
    W.push('');
  }
  return W.join('\n');
}

async function main() {
  const o = opts(process.argv.slice(2), ['ids']);
  const ep = o.episode || 's01e01';
  const D = dirs(ep);
  const sl = JSON.parse(fs.readFileSync(D.shotlist, 'utf8'));
  const dialogue = fs.existsSync(D.dialogue) ? JSON.parse(fs.readFileSync(D.dialogue, 'utf8')) : null;
  const scenes = o.scenes ? o.scenes.split(',') : null, setsF = o.sets ? o.sets.split(',') : null;
  const shots = sl.shots.filter((s) => (!scenes || scenes.includes(s.scene)) && (!setsF || setsF.includes(s.set)));
  const text = exportShots(shots, { ids: !!o.ids, dialogue });
  if (o.out) { safeWrite(path.resolve(o.out), text); console.error(`export-shotlist: ${shots.length} shots -> ${rel(path.resolve(o.out))}`); }
  else process.stdout.write(text);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error('export-shotlist:', e.message); process.exit(2); });
