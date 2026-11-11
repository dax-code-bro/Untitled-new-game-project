// Engine phase 4 (engine/DESIGN.md 3.1): a shot-list row -> a staging INTENT (pure: no files, no three.js).
//   intentOf(row, { sheet, places, cast, verbs }) -> { id, set, size, mm, mmLocked, move, subjects, extras, acts,
//     lines, frames, seconds, flags, from, words, unstaged }
// subjects: what the row puts in frame ({ name, actor?, build?, kind: person|element|creature, pos, note, mark?, how? });
// extras: people the action names but the row does not frame (an insert's hands, a listener); acts: verbs from
// verbs.json with their place words resolved to sheet marks; anything else a person does goes to `unstaged`.
import { HUMAN_RE, DRAGON_RE } from '../input/common.mjs';

const SIZE = [[/extreme wide|\bews\b/i, 'EWS'], [/\bpov\b/i, 'POV'], [/insert|macro/i, 'INSERT'], [/close|\bcu\b/i, 'CU'], [/medium|\bms\b|\bmcu\b/i, 'MS'], [/wide|\bws\b|establish/i, 'WS']];
export const sizeClass = (s = '') => (SIZE.find(([re]) => re.test(s)) || [null, 'MS'])[1];
const LENS = { EWS: 24, WS: 35, MS: 50, CU: 85, INSERT: 100, POV: 35 };
export function moveOf(m = '') {
  const s = m.toLowerCase();
  const kind = /\bpov\b/.test(s) ? 'pov' : /\bpan\b|travel/.test(s) ? 'pan' : /\bpush\b|dolly in/.test(s) ? 'push' : /\btrack|follow|dolly\b/.test(s) ? 'track'
    : /two-shot|two shot/.test(s) ? 'two-shot' : /\bots\b|over.the.shoulder/.test(s) ? 'ots' : /air-to-air|aerial|drone/.test(s) ? 'air' : 'static';
  return { kind, low: /\blow\b/.test(s), through: /\bthrough\b/.test(s), across: /\bacross\b/.test(s), reverse: /\breverse\b/.test(s), raw: m };
}
/** 'L (at his stall)' -> { pos: 'L', note: 'at his stall' }; 'L-to-R', 'R-bg', 'all', 'S', 'top' */
export function posOf(sp = '') {
  const m = String(sp).match(/^\s*([^\s(]*)\s*(?:\((.*)\))?/);
  const raw = (m?.[1] || 'C').replace(/[,;]$/, '');
  const p = raw.toUpperCase();
  const side = /^L-TO-R|^R-TO-L/.test(p) ? 'move' : /^L-C/.test(p) ? 'LC' : /^R-C/.test(p) ? 'RC' : /^L/.test(p) ? 'L' : /^R/.test(p) ? 'R' : /^C/.test(p) ? 'C' : 'any';
  return { pos: raw || 'C', side, bg: /BG/.test(p), note: (m?.[2] || '').trim() };
}
const words = (s) => String(s || '').toLowerCase();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** every place word of a set: [word, mark] longest first (sheet marks + aliases, places.json aliases) */
export function placeWords(sheet, places = {}) {
  const out = [];
  for (const [n, m] of Object.entries(sheet?.marks || {})) { out.push([n.toLowerCase(), n]); for (const a of m.alias || []) out.push([a.toLowerCase(), n]); }
  for (const [w, n] of Object.entries(places.aliases || {})) out.push([w.toLowerCase(), n]);
  return out.sort((a, b) => b[0].length - a[0].length || (a[0] < b[0] ? -1 : 1));
}
export function findPlace(text, pw) {
  const s = words(text);
  let best = null;
  for (const [w, n] of pw) { const i = s.search(new RegExp(`\\b${esc(w)}\\b`)); if (i >= 0 && (!best || i < best[0])) best = [i, n]; }
  return best ? best[1] : null;
}
/** a place word's position [x, y, z] (sheet mark / object / places.json mark), or null (carried props: null) */
export function markPos(name, sheet, places = {}) {
  if (!name) return null;
  if (places.marks?.[name]) return places.marks[name];
  const m = sheet?.marks?.[name];
  if (m) return Array.isArray(m) ? m : m.at;
  const o = sheet?.objects?.[name];
  return o?.at || null;
}
const ROLEISH = /\b(villagers?|guards?|watchman|vendor|musician|parent|child|woman|man|people|crowd|riders?|sailors?|crew|lookouts?|farmers?)\b/i;
const CHILD_ROLE = /^(CHILD|ABBY|KIDS?|GIRL|BOY|CHILDREN)/;
const NUM = { two: 2, three: 3, four: 4, five: 5, pair: 2 };
export const actorKey = (role, n = 0) => role.toLowerCase().replace(/[^a-z0-9]+/g, '') + (n ? String(n) : '');

export function intentOf(row, ctx = {}) {
  const { sheet = null, places = {}, cast = null, verbs = { verbs: {} } } = ctx;
  const pw = placeWords(sheet, places);
  const size = sizeClass(row.shot_size);
  const move = moveOf(row.camera_move);
  const lensMm = parseFloat(row.lens);
  const castList = cast || [];
  const subjects = [], extras = [];
  const used = new Set();
  const castFor = (name) => {
    const n = words(name);
    const hit = castList.find((c) => !used.has(c) && (words(c.name) === n || n.includes(words(c.role)) || words(c.role).includes(n.split(/\W/)[0])));
    if (hit) used.add(hit);
    return hit;
  };
  for (const f of row.in_frame || []) {
    const { pos, side, bg, note } = posOf(f.screen_pos);
    const nm = f.name.replace(/\(.*?\)/g, '').trim();
    const inner = (f.name.match(/\((.*?)\)/) || [])[1] || '';
    const personish = f.kind === 'person' || (f.kind !== 'element' ? false : ROLEISH.test(nm) && !/\b(stall|door|leg|corner|hands?)\b/i.test(nm));
    if (f.kind === 'dragon' || DRAGON_RE.test(words(nm)) && f.kind !== 'element') { subjects.push({ name: nm, kind: 'creature', pos, side, bg, note, actor: actorKey(nm) }); continue; }
    if (personish) {
      const w0 = nm.split(/\s+/)[0];
      const plural = /^[a-z]+s$/i.test(w0) && !/(ss|man)$/i.test(w0);
      const n = plural ? (NUM[(inner.match(/\b(two|three|four|five|pair)\b/i) || [])[1]?.toLowerCase()] || (inner.match(/\d+/) ? +inner.match(/\d+/)[0] : 2)) : 1;
      for (let k = 0; k < n; k++) {
        const c = castFor(nm);
        // a generic cast role is keyed '1C|VILLAGERS#1': the role is the word ('VILLAGER'), the build comes from the lock
        const role = (c?.generic ? nm.split(/\s+/)[0] : (c?.role || nm)).replace(/'s.*$/, '').replace(/s$/i, '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
        const actor = actorKey(role, plural ? k + 1 : 0);
        const place = findPlace(note, pw) || findPlace(inner, pw);
        subjects.push({ name: nm, kind: 'person', role, actor, build: c?.build || null, pos, side, bg, note: note || inner, place, slot: k, hands: /\bhands?\b/i.test(nm) });
      }
      continue;
    }
    const place = findPlace(nm, pw) || findPlace(`${note} ${inner}`, pw);
    subjects.push({ name: nm, kind: 'element', pos, side, bg, note, place, at: markPos(place, sheet, places) });
  }
  // people the action names that the row does not frame (an insert's hands: "the musician's fingers")
  const action = row.action || '';
  for (const c of castList) {
    if (used.has(c) || c.generic || subjects.some((s) => s.kind === 'person' && s.role === c.role)) continue;
    extras.push({ name: c.name, kind: 'person', role: c.role, actor: actorKey(c.role), build: c.build, pos: 'off', side: 'any', extra: true });
  }
  for (const m of action.matchAll(/\b(?:the\s+)?([A-Z]{3,}|vendor|musician|watchman|guard|parent|child)\b/g)) {
    const role = m[1].toUpperCase().replace(/S$/, '');
    if (!ROLEISH.test(role) || role === 'PEOPLE' || subjects.some((s) => s.role === role || (s.role || '').startsWith(role)) || extras.some((e) => e.role === role)) continue;
    extras.push({ name: m[1], kind: 'person', role, actor: actorKey(role), build: null, pos: 'off', side: 'any', extra: true });
  }
  // RATING: no child in a restricted shot (R* / rating pass / NO_CHILD_IN_FRAME) - never added as an extra
  const restricted = /^R\d/.test(row.id) || row.origin === 'rating_pass' || (row.continuity_flags || []).includes('NO_CHILD_IN_FRAME');
  if (restricted) for (let i = extras.length - 1; i >= 0; i--) if (CHILD_ROLE.test(extras[i].role)) extras.splice(i, 1);
  // "He ties the cloth": nobody named -> the person of the scene's previous shot (ctx.lastPerson)
  if (!subjects.some((s) => s.kind === 'person') && !extras.length && ctx.lastPerson && /\b(he|she|his|her)\b/i.test(action)) extras.push({ ...ctx.lastPerson, pos: 'off', side: 'any', extra: true, place: null });
  const people = [...subjects, ...extras].filter((s) => s.kind === 'person');
  // ---- acts: per sentence, the person it is about (named, or he / she / they = the last named) and its verbs
  const V = Object.entries(verbs.verbs || {}).flatMap(([k, v]) => v.words.map((w) => [w, k, v])).sort((a, b) => b[0].length - a[0].length);
  const acts = [], unstaged = [];
  let last = people[0] || null;
  const sentences = action.split(/(?<=[.!?:;])\s+/).filter((s) => s.trim());
  sentences.forEach((sent, i) => {
    const s = words(sent);
    const named = people.filter((p) => new RegExp(`\\b${esc(words(p.role).replace(/\d+$/, ''))}s?\\b`).test(s));
    let who = named.length ? named : (/\b(he|she|his|her)\b/.test(s) && last ? [last] : /\bthey\b/.test(s) ? people.filter((p) => p.name === last?.name) : []);
    if (!who.length) return;
    // the clause's subject: the people named before its first verb ("the vendor calls across to the musician": the
    // vendor; "the vendor and the musician sit": both); the others are objects
    const firstVerb = Math.min(...V.map(([w]) => s.search(new RegExp(`\\b${esc(w)}\\b`))).filter((i) => i >= 0), s.length);
    if (named.length > 1) { const pre = named.filter((p) => s.search(new RegExp(`\\b${esc(words(p.role).replace(/\d+$/, ''))}s?\\b`)) < firstVerb); who = pre.length ? pre : [named[0]]; }
    if (named.length) last = who[0];
    // a plural subject ("two villagers") stands for all of them
    if (named.some((p) => p.slot != null) && /\b(villagers|two|they)\b/.test(s)) who = people.filter((p) => named.some((n) => n.name === p.name));
    const found = [];
    let rest = ` ${s} `;
    for (const [w, k, v] of V) {
      const re = new RegExp(`\\b${esc(w)}\\b`);
      if (!re.test(rest)) continue;
      rest = rest.replace(re, ' ');
      found.push({ k, v, w, idx: s.search(new RegExp(`\\b${esc(w)}\\b`)) });
    }
    found.sort((a, b) => a.idx - b.idx);
    if (!found.length) { unstaged.push({ who: who.map((p) => p.actor), text: sent.trim() }); return; }
    const frac = (i + 0.5) / sentences.length;
    found.forEach((f, k) => { f.k2 = k; });
    for (const f of found) {
      if (f.v.kind === 'still' || f.v.kind === 'camera') continue;
      const after = s.slice(f.idx);
      // a move's destination needs a preposition ("to his stall", "across the square"); "pushes his cart" is not one
      // ("from the door to the counter": the destination is after "to"; "from" alone only when nothing else is named - phase 7)
      const destRe = (w) => new RegExp(`\\b(?:${w})\\s+(?:the\\s+|his\\s+|her\\s+|their\\s+|a\\s+)?(.{0,40})`);
      const dest = f.v.kind === 'move' ? after.match(destRe('to|toward|towards|into|onto|across|back to|round|over')) || after.match(destRe('from')) : null;
      const place = f.v.kind === 'move' ? (dest ? findPlace(dest[1].split(/[,.;]| and /)[0], pw) : null) : findPlace(after, pw);
      const toPerson = people.find((p) => !who.includes(p) && new RegExp(`\\b${esc(words(p.role).replace(/\d+$/, ''))}\\b`).test(after));
      for (const p of who) acts.push({ who: p.actor, verb: f.k, act: f.v.act, kind: f.v.kind, word: f.w, ...(place ? { to: place } : {}), ...(toPerson ? { at: toPerson.actor } : {}), frac: Math.round(frac * 100) / 100, order: f.k2, ...(/\bacross\b/.test(after) ? { across: true } : {}), ...(f.v.enter ? { enter: true } : {}), ...(f.v.exit ? { exit: true } : {}) });
    }
  });
  const lines = (row.dialogue || []).map((d) => {
    const role = String(d.speaker).toUpperCase();
    const p = people.find((x) => x.role === role || x.role?.startsWith(role));
    return { id: d.id, speaker: role, actor: p?.actor || actorKey(role), spoken_s: d.spoken_s ?? d.line_seconds ?? 1.2, text: d.first_words || '', onScreen: d.speaker_on_screen !== false };
  });
  const frames = row.frames_at_24fps || Math.round((row.est_seconds || 4) * 24);
  return {
    id: row.id, scene: row.scene, set: row.set, size, mm: Number.isFinite(lensMm) ? lensMm : LENS[size], mmLocked: !!row.engine?.lensLocked || size === 'INSERT',
    move, subjects, extras, acts, lines, frames, seconds: frames / 24, flags: row.continuity_flags || [], from: row.engine?.from ?? null,
    stage: row.engine?.stage ?? null, trans: row.engine?.trans ?? null, render: row.render || '3d',
    words: `${row.action || ''} ${(row.in_frame || []).map((f) => `${f.name} ${f.screen_pos}`).join(' ')} ${row.camera_move || ''}`.toLowerCase(),
    unstaged, restricted,
  };
}
