// Engine phase 2 (engine/DESIGN.md section 1): shared pieces of the input parsers and the validator.
//   - the Episode 1 timing model and subtitle splitter, ported from episodes/s01e01/tools/extract_dialogue.py
//     (same numbers, so a line gets the same est_seconds and subtitle_cues as in Episode 1);
//   - text normalisation for line keys and line matching;
//   - who is who: CHARACTERS.md (adult or child), the humans CAST ids, the creatures, generic roles;
//   - the set registry (SETS) and the shot-size / camera-move vocabulary;
//   - a write guard: the engine never writes inside an episode's input/ folder.
// Pure Node, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, dirs } from '../../scenes/lib/director/episode-paths.js';
import { BUILDS, NAMED, isChildBuild } from '../../scenes/lib/humans/cast-list.js';

export { ROOT, dirs };
export const EM = '—';
export const FPS = 24;
export const TURN_GAP = 0.35;                       // cue pickup per line (tools/shotlist/build.py)
export const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

// ---- timing model (extract_dialogue.py) ------------------------------------------------------------------------
export const RATE_CONVERSATIONAL = 2.6, RATE_SLOW = 2.1;
const SLOW_NOTES = ['whispered', 'quietly', 'low', 'through pain'];
const PAUSE_PER_BREAK = 0.25, PAUSE_PER_BREAK_NARRATOR = 0.4, MIN_LINE_SECONDS = 0.6;
const CMD_DEFAULT = 0.8, CMD_QUIET = 1.0, CMD_CUT_OFF = 0.6;
const QUIET_COMMAND_SPEAKERS = ['QUEEN FALL'];
export const SUB_MAX_ROW = 42, SUB_READING_CPS = 17.0, SUB_MIN_SECONDS = 1.0;
export const CANONICAL_COMMANDS = { Attack: 'physical attack (never triggers flame)', Fire: 'breath weapon', Hold: 'halt', Skit: 'retreat', 'Free fire': 'emergency release from rider control' };
const WORD_RE = /[A-Za-z0-9]+(?:'[A-Za-z]+)*/g;
const round1 = (x) => Math.round((x + 1e-9) * 10) / 10;
export const wordCount = (t) => (t.match(WORD_RE) || []).length;
export const sentenceBreaks = (t) => (t.match(/[.?!](?=\s+\S)/g) || []).length;

export function estimateSeconds(speaker, text, notes, interrupted, commandKind) {
  const words = wordCount(text);
  const quiet = notes.some((n) => SLOW_NOTES.includes(n.toLowerCase()));
  if (commandKind && words === 1) {
    if (interrupted) return [CMD_CUT_OFF, 'command (cut off)'];
    if (quiet || QUIET_COMMAND_SPEAKERS.includes(speaker)) return [CMD_QUIET, 'command (low/quiet authority)'];
    return [CMD_DEFAULT, 'command'];
  }
  let rate, pause, rule;
  if (speaker === 'NARRATOR') [rate, pause, rule] = [RATE_SLOW, PAUSE_PER_BREAK_NARRATOR, 'narrator'];
  else if (quiet) [rate, pause, rule] = [RATE_SLOW, PAUSE_PER_BREAK, 'slow (' + notes.join(', ') + ')'];
  else [rate, pause, rule] = [RATE_CONVERSATIONAL, PAUSE_PER_BREAK, 'conversational'];
  const secs = Math.max(MIN_LINE_SECONDS, words / rate + pause * sentenceBreaks(text));
  return [round1(secs), rule];
}

// ---- subtitle splitter (extract_dialogue.py best_rows / pack / pack_words / subtitle_cues) -------------------
const GLUE_END = new Set('a an the to of in on at for with by from my your his her our their its and or but who that someone'.split(' '));
const OBJECT_START = new Set(['me', 'him', 'them', 'us']);
const SUBJECT_START = new Set(['i', 'we', 'they', 'he', 'she', 'it', 'you']);
const CLAUSE_START = new Set(['when', 'and', 'but', 'because', 'before', 'after', 'while', 'if', 'who', 'so']);
const first = (w) => w.toLowerCase().split("'")[0].replace(new RegExp(`^[,.?!${EM}]+|[,.?!${EM}]+$`, 'g'), '');

function bestRows(s) {
  if (s.length <= SUB_MAX_ROW) return [[s], true];
  let best = null;
  const multi = sentenceBreaks(s) > 0;
  for (let k = 0; k < s.length; k++) {
    if (s[k] !== ' ') continue;
    const a = s.slice(0, k), b = s.slice(k + 1);
    if (a.length > SUB_MAX_ROW || b.length > SUB_MAX_ROW) continue;
    let score = Math.max(a.length, b.length);
    const last = a[a.length - 1];
    const punct = ('.?!' + EM).includes(last) || ',;:'.includes(last);
    if (('.?!' + EM).includes(last)) score -= 10;
    else if (',;:'.includes(last)) score -= 5;
    if (GLUE_END.has(a.split(' ').pop().toLowerCase())) score += 5;
    const f = first(b.split(' ')[0]);
    if (OBJECT_START.has(f)) score += 5;
    else if (SUBJECT_START.has(f)) score -= 3;
    if (multi && !punct) score += 100;
    if (best === null || score < best[0]) best = [score, [a, b], punct];
  }
  return best ? [best[1], best[2]] : null;
}
const fits = (s) => bestRows(s) !== null;
const good = (s) => { const r = bestRows(s); return r !== null && (r[1] || sentenceBreaks(s) === 0); };

function pack(pieces, ok = good) {
  const cues = [];
  let cur = '';
  for (const p of pieces) {
    const cand = cur ? (cur + ' ' + p).trim() : p;
    if (ok(cand)) { cur = cand; continue; }
    if (cur) { cues.push(cur); cur = ''; }
    if (fits(p)) { cur = p; continue; }
    const clauses = p.split(/(?<=,)\s+/);
    const sub = clauses.length > 1 ? pack(clauses, fits) : packWords(p);
    cues.push(...sub.slice(0, -1));
    cur = sub[sub.length - 1];
  }
  if (cur) cues.push(cur);
  return cues;
}

function packWords(p) {
  if (fits(p)) return [p];
  const words = p.split(' ');
  let best = null;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
    if (!fits(a) || !fits(b)) continue;
    const score = Math.max(a.length, b.length) - (CLAUSE_START.has(first(words[k])) ? 10 : 0);
    if (best === null || score < best[0]) best = [score, [a, b]];
  }
  if (best) return best[1];
  const half = Math.floor(words.length / 2);
  return [...packWords(words.slice(0, half).join(' ')), ...packWords(words.slice(half).join(' '))];
}

export function subtitleCues(text) {
  const chunks = good(text) ? [text] : pack(text.split(/(?<=[.?!])\s+/));
  return chunks.map((c) => bestRows(c)[0].join('\n'));
}
export const subtitleMinSeconds = (text) => Math.max(SUB_MIN_SECONDS, Math.ceil((text.length / SUB_READING_CPS) * 10 - 1e-9) / 10);

/** Split a bracket / parenthetical into { original, addressee, notes } (extract_dialogue.parse_bracket). */
export function parseBracket(raw) {
  let original = false, addressee = null;
  const notes = [];
  for (const part of (raw || '').split(/[;,]/)) {
    const p = part.trim();
    if (!p) continue;
    if (p === 'ORIGINAL') original = true;
    else if (p.startsWith('to ')) addressee = p.slice(3).trim();
    else notes.push(p);
  }
  return { original, addressee, notes };
}

export function firstSentences(text, n = 170) {
  text = text.trim();
  let out = '';
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    if (out && out.length + s.length > n) break;
    out = (out + ' ' + s).trim();
  }
  return out.length <= n + 60 ? out : out.slice(0, n).trimEnd() + '...';
}

// ---- normalisation ---------------------------------------------------------------------------------------------
/** Lower case, letters/digits/apostrophes only, single spaces: the key text of a line ("Is anyone left?" -> "is anyone left"). */
export const normText = (s) => String(s).normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'")
  .replace(/[^a-z0-9' ]+/g, ' ').replace(/'(?![a-z])|(?<![a-z])'/g, ' ').replace(/\s+/g, ' ').trim();
/** A speaker cue without extensions: "ABBY (V.O.)" -> "ABBY", "Guard 2" -> "GUARD 2". */
export const normSpeaker = (s) => String(s).replace(/\([^)]*\)/g, '').replace(/[\^@]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

// ---- vocabulary ------------------------------------------------------------------------------------------------
export const SIZE_WORDS = { EWS: 'extreme wide', WS: 'wide', MS: 'medium', CU: 'close', INS: 'insert', POV: 'POV', CARD: 'card (black/text, no 3D)' };
export const SIZES = Object.values(SIZE_WORDS);
export const LENS_BY_SIZE = { 'extreme wide': '24 mm', wide: '35 mm', medium: '50 mm', close: '85 mm', insert: '100 mm macro', POV: '35 mm (eyeline)', 'card (black/text, no 3D)': 'n/a' };
/** Shot size from the owner's word: Episode 1 words, the abbreviations, a few synonyms; null when unknown. */
export function normSize(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (SIZE_WORDS[up]) return SIZE_WORDS[up];
  const low = s.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
  const hit = SIZES.find((x) => x.toLowerCase() === low);
  if (hit) return hit;
  const syn = { 'extreme wide shot': 'extreme wide', 'wide shot': 'wide', 'long shot': 'wide', establishing: 'wide', 'medium shot': 'medium', 'mid shot': 'medium', 'close up': 'close', closeup: 'close', 'close shot': 'close', ecu: 'close', 'extreme close up': 'close', macro: 'insert', card: SIZE_WORDS.CARD, black: SIZE_WORDS.CARD };
  return syn[low] || null;
}
export const MOVE_WORDS = ['static', 'locked', 'pan', 'tilt', 'push', 'pull', 'dolly', 'track', 'tracking', 'follow', 'air-to-air', 'aerial', 'drone', 'handheld',
  'pov', 'ots', 'over-the-shoulder', 'two-shot', 'crane', 'boom', 'orbit', 'zoom', 'whip', 'high', 'low', 'top-down', 'long', 'slow', 'ground', 'camera'];
/** True when some word of the camera move is in the vocabulary (Episode 1 moves are free text: "static, low"). */
export function knownMove(v) {
  const words = String(v || '').toLowerCase().replace(/[,;()]/g, ' ').split(/\s+/).filter(Boolean);
  return words.some((w) => MOVE_WORDS.includes(w) || MOVE_WORDS.includes(w.replace(/s$/, '')));
}

// ---- regexes of tools/shotlist/final_build.py and tools/check_final.py -----------------------------------------
export const DRAGON_RE = /\b(charcoal|leaf|starlight|scout(?! rider)|hatchling|working dragon|small dragon|young dragon|dragons)\b/;
export const HUMAN_RE = /\b(alexandria|abby|remi|attendant|keeper|healer|messenger|vendor|musician|king|captain|guard|watchman|child|parent|villager|partner|old woman|neighbor|master|sailor|lookout|crew|instructor|riders?|servants?|man|woman|people|crowd|townspeople|farmer|adults|queen fall|rider)\b/;
export const CHILDISH_RE = /\b(child|children|abby|young riders?|young attendant|kids?|girls?|boys?|bab(?:y|ies)|infants?|toddlers?|youngsters?|princess)\b/;
export const VICE_RE = /\b(ale|wine|wineskins?|cider|beer|mead|brandy|rum|grog|gin|whiske?y|liquor|spirits|moonshine|flasks?|jugs?|tankards?|drunk\w*|tipsy|drinks?|drank|drinking|swig\w*|intoxicat\w*|hung ?over|hangover|booze\w*|tobacco|pipes?|pipe-?weed|weed|snuff|cigars?|cigarettes?|smok\w*|drugs?|poppy|hemp|opium|laudanum|suggestive|bawdy|innuendo|flirt\w*|lovers?|seduc\w*|kiss\w*|naked|nude|undress\w*|sex\w*|caress\w*|fondl\w*)\b/i;
export const PROTECTED_RE = /\b(Abby|princess|child|children|kids?|boys?|girls?|young riders?|young attendant|daughters?|sisters?|sons?|heirs?|youths?|pages?|squires?|apprentices?|Leaf's rider|little ones?|young ones?|youngsters?|lads?|lass(?:es|ie)?|teen\w*|bab(?:y|ies)|infants?|toddlers?|minors?)\b/i;
export const PROTECTED_SPEAKERS = new Set(['ABBY', 'CHILD', 'YOUNG ATTENDANT']);
export const STRONG_RE = /\b(fuck\w*|shit\w*|bastard\w*|bloody|damned)\b/i;

// ---- who is who ------------------------------------------------------------------------------------------------
let CAST_CACHE = null;
/** Characters the engine knows: the named people (CHARACTERS.md, adult or child), the humans builds, creatures and
 *  generic roles - all from scenes/lib/humans/cast-list.js (phase 3; phase 2 parsed CHARACTERS.md and humans/index.js
 *  as text). */
export function castInfo() {
  if (CAST_CACHE) return CAST_CACHE;
  const named = NAMED.map((n) => ({ name: n.name, aliases: [...n.aliases], child: n.child }));
  const builds = Object.keys(BUILDS);
  const roleOf = (id) => id.replace(/_(ride|injured|sling|hurt)/g, '').replace(/\d+$/, '').replace(/_/g, ' ').replace(/^scout$/, 'scout rider').replace(/^fall$/, 'queen fall');
  const roles = [...new Set(builds.map(roleOf))];
  const childBuilds = builds.filter(isChildBuild);
  const creatures = ['leaf', 'charcoal', 'starlight', 'scout', 'hatchling', 'working dragon', 'small dragon', 'young dragon', 'dragon', 'dragons'];
  const generic = ['narrator', 'man', 'woman', 'men', 'women', 'people', 'crowd', 'townspeople', 'villagers?', 'farmer', 'adults?', 'partner', 'old woman', 'old man', 'neighbou?r', 'master', "ship's master",
    'lookout', 'crew', 'instructor', 'riders?', 'servants?', 'keepers?', 'ground keepers?', 'guards?', 'sailors?', 'fishing crew', 'young riders?', 'young attendant', 'children', 'kids?', 'messenger', 'royal messenger', 'parent'];
  const words = [...new Set([...named.flatMap((n) => n.aliases), ...roles, ...creatures, ...generic].map((w) => w.toLowerCase()))].sort((a, b) => b.length - a.length);
  const KNOWN_RE = new RegExp(`\\b(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '?' ? c : '\\' + c))).join('|')})\\b`);
  CAST_CACHE = { named, builds, roles, childBuilds, creatures, KNOWN_RE, childNames: named.filter((n) => n.child).flatMap((n) => n.aliases.map((a) => a.toLowerCase())) };
  return CAST_CACHE;
}

/** Is `name` (a frame entry or a speaker) a character the engine can cast? */
export function knownCharacter(name) {
  const n = String(name).toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  return castInfo().KNOWN_RE.test(n) || HUMAN_RE.test(n) || DRAGON_RE.test(n);
}
/** Is `name` a child or a possible minor (CHARACTERS.md children, child builds, check_final's protected words)? */
export function isChildName(name) {
  const n = String(name).toLowerCase();
  if (CHILDISH_RE.test(n)) return true;
  return castInfo().childNames.some((c) => new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(n));
}

/** The kind of a frame entry when none is written: Episode 1's rule (dragon / person by name), then the cast,
 *  then: a lower-case word is a thing ("fountain"), anything else is a character (so an unknown name is caught). */
export function defaultKind(name) {
  const n = String(name).toLowerCase();
  if (DRAGON_RE.test(n)) return 'dragon';
  if (HUMAN_RE.test(n)) return 'person';
  if (knownCharacter(name)) return castInfo().creatures.some((c) => new RegExp(`\\b${c}\\b`).test(n)) ? 'dragon' : 'person';
  return /^[a-z]/.test(String(name).trim()) ? 'element' : 'person';
}

// ---- sets ------------------------------------------------------------------------------------------------------
export async function registrySets() {
  const { SETS } = await import('../../scenes/lib/director/registry.js');
  return SETS;
}
let EP1 = null;
/** Episode 1's shot list (for set descriptions, flag / tag definitions, render-cost medians); null if missing. */
export function ep1Shotlist() {
  if (EP1 === null) { try { EP1 = JSON.parse(fs.readFileSync(dirs('s01e01').shotlist, 'utf8')); } catch { EP1 = false; } }
  return EP1 || null;
}

// ---- files -----------------------------------------------------------------------------------------------------
/** Write a file, refusing anything inside an episode's input/ folder (the owner's; the engine never writes there). */
export function safeWrite(file, text) {
  const r = rel(path.resolve(file));
  if (/(^|\/)episodes\/[^/]+\/input(\/|$)/.test(r)) throw new Error(`refusing to write inside an input/ folder: ${r}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
export const json = (x) => JSON.stringify(x, null, 2) + '\n';
export const sha256 = async (s) => (await import('node:crypto')).createHash('sha256').update(s).digest('hex');

/** Minimal argv reader: --key value / --flag. */
export function opts(argv, flags = []) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const [k, v] = a.slice(2).split(/=(.*)/s);
    if (v !== undefined) o[k] = v;
    else if (flags.includes(k)) o[k] = true;
    else o[k] = argv[++i];
  }
  return o;
}
