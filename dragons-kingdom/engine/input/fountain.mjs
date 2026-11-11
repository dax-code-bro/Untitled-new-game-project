#!/usr/bin/env node
// Engine phase 2 (engine/DESIGN.md section 1a): episodes/<ep>/input/screenplay.fountain ->
//   final/dialogue.json, final/onscreen-text.json (the Episode 1 schemas, see episodes/s01e01/final/) and
//   final/lines.lock.json (stable line ids).
// It generalises episodes/s01e01/tools/extract_final_dialogue.py: same timing model, subtitle splitter and
// fields; the rating lint (a child and a drink/smoke/suggestive word together) is ported from check_final.py.
//
//   node engine/input/fountain.mjs --episode s01e02 [--input <dir>] [--out <dir>] [--check]
//
// The Fountain subset (input/SCREENPLAY-FORMAT.md):
//   Title: ... / Episode: ... / Rating: ...        title page (key: value lines, then a blank line)
//   EXT. CLING VILLAGE SQUARE — MORNING #2A#       scene heading (INT./EXT./EST./INT/EXT, or forced with a leading ".")
//                                                  with a unique #scene number#
//   ABBY                                           cue: an upper-case line after a blank line; (V.O.)/(O.S.)/(CONT'D) allowed
//   (quietly)                                      parenthetical -> delivery ("to X" -> addressee)
//   Is anyone left?                                the line (several lines join into one)
//   [[ONSCREEN: CLING — THE MORNING AFTER]]        on-screen text card; any other [[note]] and /* boneyard */ is ignored
// Line ids: L001... in order on the first run; the key normalised text + speaker + scene keeps an id when the
// screenplay is edited elsewhere; a new line gets the next unused number; an id is never reused.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EM, dirs, rel, json, safeWrite, sha256, opts, estimateSeconds, subtitleCues, subtitleMinSeconds, parseBracket,
  firstSentences, wordCount, normText, normSpeaker, CANONICAL_COMMANDS, STRONG_RE, VICE_RE, PROTECTED_RE, PROTECTED_SPEAKERS,
} from './common.mjs';

const SCENE_HEAD = /^(?:(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s])/i;
const GENERATED_BY = 'engine/input/fountain.mjs';

/** The line-lock key of a spoken line. `n` > 1 for a repeat of the same words by the same speaker in a scene. */
export const lineKey = (scene, speaker, text, n = 1) => `${scene}|${speaker}|${normText(text)}${n > 1 ? '#' + n : ''}`;

/** Parse Fountain text into { title, scenes[], spoken[], cards[], errors[], lint[] } (no ids yet). */
export function parseFountain(src) {
  const errors = [], lint = [];
  // drop the boneyard, keeping line numbers
  src = src.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''));
  const L = src.split('\n');
  const title = {};
  let i = 0;
  while (i < L.length && !L[i].trim()) i++;
  if (i < L.length && /^[A-Za-z][A-Za-z ]*:\s*\S/.test(L[i]) && !SCENE_HEAD.test(L[i])) {
    for (; i < L.length && L[i].trim(); i++) {
      const m = L[i].match(/^([A-Za-z][A-Za-z ]*):\s*(.*)$/);
      if (m) title[m[1].trim().toLowerCase()] = m[2].trim();
    }
  }
  const scenes = [], spoken = [], cards = [];
  let scene = null, lastPara = '', cardN = 0;
  const blank = (k) => k < 0 || k >= L.length || !L[k].trim();
  const cardsIn = (text, k) => text.replace(/\[\[([\s\S]*?)\]\]/g, (_, body) => {
    const m = body.match(/^\s*ONSCREEN\s*:\s*([\s\S]+?)\s*$/i);
    if (m) cards.push({ text: m[1].replace(/\s+/g, ' '), scene: scene?.id ?? null, source_line: k + 1, after: spoken.length });
    return '';
  });
  for (; i < L.length; i++) {
    const raw = cardsIn(L[i], i);
    const t = raw.trim();
    if (!t) continue;
    if (/^(#|=(?!=)|>.*<$|===)/.test(t) || /^[A-Z ]+TO:$/.test(t) || (t.startsWith('>') && !t.endsWith('<'))) continue; // sections, synopses, transitions
    const forced = t.startsWith('.') && !t.startsWith('..');
    if ((SCENE_HEAD.test(t) || forced) && blank(i - 1)) {
      const head = forced ? t.slice(1) : t;
      const m = head.match(/^(.*?)\s*#([^#]+)#\s*$/);
      const slug = (m ? m[1] : head).trim();
      const id = m ? m[2].trim() : null;
      if (!id) errors.push({ code: 'E_SCENE_NUMBER', line: i + 1, msg: `scene heading without a #number#: "${slug}"` });
      else if (scenes.some((s) => s.id === id)) errors.push({ code: 'E_SCENE_NUMBER', line: i + 1, msg: `scene number #${id}# is used twice` });
      const parts = slug.replace(/^(INT\.?\/EXT|I\/E|INT|EXT|EST)[.\s]\s*/i, '').split(new RegExp(`\\s+(?:${EM}|--|-)\\s+`));
      scene = { id: id || `?${scenes.length + 1}`, title: parts[0].trim(), slugline: slug, time_of_day: parts.length > 1 ? parts[parts.length - 1].trim() : null, source_line: i + 1 };
      scenes.push(scene);
      lastPara = '';
      continue;
    }
    // a cue: upper case (no lower-case letters outside the extension), after a blank line, with text below it
    const cueBody = t.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\^$/, '').trim();
    const isCue = blank(i - 1) && !blank(i + 1) && (t.startsWith('@') || (/[A-Z]/.test(cueBody) && !/[a-z]/.test(cueBody) && !/[.!?:]$/.test(cueBody)));
    if (isCue) {
      const speaker = normSpeaker(t.replace(/^@/, ''));
      const ext = (t.match(/\(([^)]*)\)/g) || []).map((x) => x.slice(1, -1).trim()).filter((x) => !/^CONT'?D$/i.test(x));
      const parens = [], words = [];
      let j = i + 1, textLine = null;
      for (; j < L.length && L[j].trim(); j++) {
        const u = cardsIn(L[j], j).trim();
        if (!u) continue;
        if (/^\(.*\)$/.test(u)) parens.push(u.slice(1, -1).trim());
        else { words.push(u); textLine ??= j + 1; }
      }
      if (!scene) errors.push({ code: 'E_NO_SCENE', line: i + 1, msg: `dialogue before the first scene heading (${speaker})` });
      if (!words.length) errors.push({ code: 'E_EMPTY_LINE', line: i + 1, msg: `cue ${speaker} without a line` });
      else spoken.push({ scene: scene?.id ?? null, speaker, ext, parens, text: words.join(' ').replace(/\s+/g, ' '), cue_line: i + 1, source_line: textLine, context: lastPara });
      i = j - 1;
      continue;
    }
    // action paragraph (several lines)
    const para = [t];
    while (i + 1 < L.length && L[i + 1].trim()) { const u = cardsIn(L[++i], i).trim(); if (u) para.push(u); }
    lastPara = para.join(' ');
    // rating lint on stage directions (check_final.py rule 6, sentence level)
    for (const s of lastPara.split(/(?<=[.!?])\s+/)) {
      if (PROTECTED_RE.test(s) && VICE_RE.test(s)) lint.push({ code: 'W_RATING', line: i + 1, msg: `a drink/smoke/drug/suggestive word in the same sentence as a child or possible minor: "${s.slice(0, 120)}"` });
    }
  }
  for (const x of spoken) {
    if (PROTECTED_SPEAKERS.has(x.speaker) && VICE_RE.test(x.text)) lint.push({ code: 'W_RATING', line: x.source_line, msg: `${x.speaker} (a child or possible minor) says a drink/smoke/drug/suggestive word: "${x.text}"` });
    if (PROTECTED_RE.test(x.parens.join(' ')) && VICE_RE.test(x.text)) lint.push({ code: 'W_RATING', line: x.source_line, msg: `${x.speaker} offers a drink/smoke/drug/suggestive word to a child or possible minor: "${x.text}"` });
  }
  return { title, scenes, spoken, cards, errors, lint };
}

/** Give ids from the lock (and extend it): returns { ids[], lock }. */
export function assignIds(spoken, lockIn) {
  const lock = { about: '', key: '', next: 1, lines: {}, ...(lockIn || {}) };
  lock.lines = { ...(lockIn?.lines || {}) };
  const used = new Set(Object.values(lock.lines));
  let next = Math.max(lock.next || 1, ...[...used].map((id) => +String(id).replace(/\D/g, '') + 1).filter(Number.isFinite), 1);
  const seen = new Map(), ids = [];
  for (const x of spoken) {
    const base = lineKey(x.scene, x.speaker, x.text);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const key = lineKey(x.scene, x.speaker, x.text, n);
    let id = lock.lines[key];
    if (!id) { id = `L${String(next++).padStart(3, '0')}`; lock.lines[key] = id; }
    ids.push(id);
  }
  lock.next = next;
  return { ids, lock };
}

/** Build the three outputs from the screenplay text. `lock` is the current lines.lock.json (or null). */
export async function buildFromFountain(src, { ep, lock = null, source = 'input/screenplay.fountain' } = {}) {
  const P = parseFountain(src);
  const { ids, lock: newLock } = assignIds(P.spoken, lock);
  const tag = (P.title.episode || dirs(ep).tag).toUpperCase();
  const sha = await sha256(src);
  const out = [];
  P.spoken.forEach((x, k) => {
    const bracket = x.parens.length ? x.parens.join('; ') : null;
    const { original, addressee, notes } = parseBracket(bracket);
    const interrupted = x.text.endsWith(EM) || x.text.endsWith('--');
    const word = x.text.replace(/[^A-Za-z ]/g, '').trim();
    const cmdWord = Object.keys(CANONICAL_COMMANDS).find((c) => c.toLowerCase() === word.toLowerCase());
    const command = cmdWord ? { type: 'canonical', word: cmdWord, meaning: CANONICAL_COMMANDS[cmdWord] } : null;
    const [est, rule] = estimateSeconds(x.speaker, x.text, notes, interrupted, command ? 'canonical' : null);
    const perf = notes.length ? notes.join(', ') : null;
    const context = firstSentences(x.context) || 'No stage direction before the line.';
    const item = {
      id: ids[k], seq: k + 1, scene: x.scene, part: null, origin: 'original', addition: null, rating_pass: null,
      changed_by: null, was_text: null, creator_approved: null, was_original: false, pending: null, pending_alternative: null,
      speaker: x.speaker, addressee: addressee || null, addressee_source: addressee ? 'bracket' : null,
      text: x.text, original, delivery: perf ? `${perf} ${EM} ${context}` : context,
      context_source: 'auto: the stage direction just before the line', performance_note: perf, bracket_raw: bracket,
      rating_content: STRONG_RE.test(x.text) ? ['strong language'] : [],
      is_command: !!command, command, interrupted, continues: null,
      words: wordCount(x.text), est_seconds: est, timing_rule: rule,
      subtitle_cues: subtitleCues(x.text), subtitle_min_seconds: subtitleMinSeconds(x.text),
      beat_after: null, source_line: x.source_line,
    };
    if (x.ext.length) item.cue_extension = x.ext.join(', ');
    if (x.text.startsWith(EM)) item.continues = [...out].reverse().find((c) => c.speaker === x.speaker && c.interrupted)?.id ?? null;
    out.push(item);
  });
  const tot = (xs) => ({ lines: xs.length, words: xs.reduce((a, x) => a + x.words, 0), est_seconds: Math.round(xs.reduce((a, x) => a + x.est_seconds, 0) * 10) / 10 });
  const bySpeaker = {};
  for (const x of out) (bySpeaker[x.speaker] ||= []).push(x);
  const scenes = P.scenes.map((s) => {
    const xs = out.filter((x) => x.scene === s.id);
    return { id: s.id, title: s.title, slugline: s.slugline, source_line: s.source_line, time_of_day: s.time_of_day, ...tot(xs), first_line: xs[0]?.id ?? null, last_line: xs.at(-1)?.id ?? null, parts: [] };
  });
  const total = Math.round(out.reduce((a, x) => a + x.est_seconds, 0) * 10) / 10;
  const dialogue = {
    episode: tag, series: "Dragon's Kingdom",
    status: 'Planning data extracted from the owner\'s screenplay by the episode engine. No voices recorded, nothing rendered.',
    source: source, source_sha256: sha, generated_by: GENERATED_BY,
    title: P.title.title || null, rating: P.title.rating || null,
    rules: [
      'Only text under a character cue is spoken. Action, [[notes]], parentheticals and scene headings are never spoken or subtitled.',
      "'text' holds only the spoken words; the parenthetical is the performance note (a 'to X' part names the addressee).",
      'Ids come from final/lines.lock.json (key: scene + speaker + normalised text): an edit elsewhere never renumbers a line.',
      'Dragons have no human dialogue.',
      "An em dash at the end of 'text' means the line is cut off (interrupted=true); a leading em dash picks it up ('continues').",
    ],
    fields: {
      id: 'L001... from final/lines.lock.json', seq: 'running order, 1..N', scene: 'the #scene number# of the heading the line plays in',
      origin: "'original' (the owner's screenplay)", delivery: 'parenthetical (if any) and the stage direction before the line (context_source)',
      'est_seconds / timing_rule': 'Episode 1 timing model (episodes/s01e01/tools/extract_dialogue.py)', 'subtitle_cues / subtitle_min_seconds': 'Episode 1 subtitle model',
      source_line: '1-based line of the spoken text in the screenplay', cue_extension: "the cue's (V.O.) / (O.S.) when present",
    },
    timing_model: { summary: 'Same model as Episode 1: words / 2.6 per s conversational; / 2.1 for narrator and whispered, quiet, low or in-pain lines; +0.25 s (narrator 0.4 s) per internal sentence break; one-word commands 0.6-1.0 s; floor 0.6 s; rounded to 0.1 s.' },
    totals: {
      spoken_lines: out.length, est_spoken_seconds: total, est_spoken_minutes: Math.round((total / 60) * 100) / 100,
      by_origin: { original: tot(out), addition: tot([]), rating_pass: tot([]) },
      original_marker_lines: out.filter((x) => x.original).length, creator_approved_lines: 0, pending_wording_lines: 0, changed_lines: 0,
      command_lines: out.filter((x) => x.is_command).length, canonical_command_lines: out.filter((x) => x.command?.type === 'canonical').length,
      interrupted_lines: out.filter((x) => x.interrupted).length, strong_language_lines: out.filter((x) => x.rating_content.includes('strong language')).length,
      subtitle_cues: out.reduce((a, x) => a + x.subtitle_cues.length, 0), speakers: Object.keys(bySpeaker).length,
      by_speaker: Object.fromEntries(Object.entries(bySpeaker).map(([s, xs]) => [s, { ...tot(xs), origins: ['original'], scenes: [...new Set(xs.map((x) => x.scene))] }])),
      by_unit: {},
    },
    scenes, lines: out,
  };
  const cards = P.cards.map((c, k) => {
    const before = out[c.after] ?? null, after = out[c.after - 1] ?? null;
    return {
      id: `T${String(k + 1).padStart(2, '0')}`, kind: 'caption', text: c.text, optional: false, scene: c.scene,
      after_dialogue_line: after?.id ?? null, before_dialogue_line: before?.id ?? null,
      placement: 'Where the screenplay puts it.', suggested_hold_seconds: Math.max(2, Math.ceil((c.text.length / 17) * 10) / 10 + 1),
      screenplay_says: `[[ONSCREEN: ${c.text}]]`, note: null, source_line: c.source_line,
    };
  });
  const onscreen = {
    episode: tag, status: 'Planning data. Nothing has been designed or rendered yet.', source, source_sha256: sha, generated_by: GENERATED_BY,
    about: 'Text that appears in the picture itself (captions, lettering, credits), separate from dialogue subtitles. Cards are listed in running order.',
    suggested_hold_seconds_note: 'Suggestions for the animatic only; adjust in the edit.',
    never_on_screen: ['Parentheticals such as (quietly)', 'Scene headings and #scene numbers#', '[[notes]] other than ONSCREEN', 'Action lines'],
    cards,
  };
  newLock.about = 'Stable line ids for this episode (engine/input/fountain.mjs). Key: scene|SPEAKER|normalised text (#n for a repeat). Never edit an id; a removed line keeps its id reserved.';
  newLock.key = 'scene|SPEAKER|normalised text';
  return { dialogue, onscreen, lock: newLock, errors: P.errors, lint: P.lint, parsed: P };
}

export function inputDirs(ep, o = {}) {
  const D = dirs(ep);
  const input = o.input ? path.resolve(o.input) : D.input;
  const out = o.out ? path.resolve(o.out) : D.final;
  return { D, input, out, screenplay: path.join(input, 'screenplay.fountain'), lockFile: path.join(out, 'lines.lock.json') };
}

async function main() {
  const o = opts(process.argv.slice(2), ['check']);
  const ep = o.episode || 's01e01';
  const P = inputDirs(ep, o);
  if (!fs.existsSync(P.screenplay)) { console.error(`fountain: no ${rel(P.screenplay)}`); process.exit(2); }
  const src = fs.readFileSync(P.screenplay, 'utf8');
  const lock = fs.existsSync(P.lockFile) ? JSON.parse(fs.readFileSync(P.lockFile, 'utf8')) : null;
  const r = await buildFromFountain(src, { ep, lock, source: rel(P.screenplay) });
  for (const e of r.errors) console.error(`fountain: ERROR line ${e.line}: ${e.msg}`);
  for (const w of r.lint) console.error(`fountain: warning line ${w.line}: ${w.msg}`);
  if (r.errors.length) process.exit(1);
  const files = [[path.join(P.out, 'dialogue.json'), json(r.dialogue)], [path.join(P.out, 'onscreen-text.json'), json(r.onscreen)], [P.lockFile, json(r.lock)]];
  if (o.check) {
    const stale = files.filter(([f, t]) => !fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== t);
    for (const [f] of stale) console.error(`fountain: out of date: ${rel(f)}`);
    process.exit(stale.length ? 1 : 0);
  }
  for (const [f, t] of files) safeWrite(f, t);
  console.log(`fountain: ${r.dialogue.lines.length} lines in ${r.dialogue.scenes.length} scenes, ${r.onscreen.cards.length} cards -> ${rel(P.out)}/{dialogue,onscreen-text,lines.lock}.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error('fountain:', e.message); process.exit(2); });
