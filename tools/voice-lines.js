#!/usr/bin/env node
/* Every spoken line in Bunker Nine, listed for recording.
 *
 * Reads the game and writes two files:
 *
 *   site/games/voice/lines.csv   one row per line: id, who, text
 *   site/games/voice/lines.json  the same, for a batch script to loop over
 *
 * The id is a hash of the speaker and the exact words, so it is stable
 * across runs and the game can work out at runtime which file belongs to a
 * line without carrying a lookup table that could drift out of step.
 *
 * Record or generate each line, save it as site/games/voice/<id>.mp3, and
 * the game plays it. Anything with no file falls back to the synthesised
 * voice, so a half-finished voice pack is a game with some lines acted and
 * the rest spoken, never a game with silent characters.
 *
 *   node tools/voice-lines.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'site/games/bunker-nine.js');
const OUT = path.join(ROOT, 'site/games/voice');

/* The same hash the game uses. Small, stable, and not trying to be
   cryptographic -- it only has to not collide across a few hundred lines. */
function lineId(who, text) {
  const s = who + '|' + String(text).trim();
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

const src = fs.readFileSync(SRC, 'utf8');
const rows = [];
const seen = new Set();
const add = (who, text) => {
  const t = text.replace(/\\'/g, "'").replace(/\\\\/g, '\\').trim();
  if (!t) return;
  const id = lineId(who, t);
  if (seen.has(id)) return;
  seen.add(id);
  rows.push({ id, who, text: t });
};

/* --- the ten playable characters --- */
const heroStart = src.indexOf('const HEROES = {');
const heroEnd = src.indexOf('const HERO_ORDER');
const heroSrc = src.slice(heroStart, heroEnd);
// Split into one chunk per character, each starting `  <id>: {`.
const heroChunks = heroSrc.split(/\n  (?=[a-z0-9]+: \{\n)/);
for (const chunk of heroChunks) {
  const m = chunk.match(/^\s*([a-z0-9]+): \{/);
  if (!m) continue;
  const who = m[1];
  const li = chunk.indexOf('lines: {');
  if (li < 0) continue;
  for (const q of chunk.slice(li).matchAll(/'((?:[^'\\]|\\.){6,})'/g)) add(who, q[1]);
}

/* --- the radio, Patch, the Stalker and Exit Four Two --- */
const linesStart = src.indexOf('const LINES = {');
const linesEnd = src.indexOf('const MAP = {');
for (const q of src.slice(linesStart, linesEnd)
  .matchAll(/\[\s*'(patch|radio|stalker|exit42)',\s*'((?:[^'\\]|\\.)+)'\s*\]/g)) {
  add(q[1], q[2]);
}

/* --- anything a character falls through to --- */
const commonStart = src.indexOf('const COMMON = {');
if (commonStart > 0) {
  const commonEnd = src.indexOf('\n};', commonStart);
  for (const q of src.slice(commonStart, commonEnd).matchAll(/'((?:[^'\\]|\\.){6,})'/g)) {
    add('common', q[1]);
  }
}

fs.mkdirSync(OUT, { recursive: true });
const csv = ['id,who,text']
  .concat(rows.map((r) => `${r.id},${r.who},"${r.text.replace(/"/g, '""')}"`))
  .join('\n');
fs.writeFileSync(path.join(OUT, 'lines.csv'), csv + '\n');
fs.writeFileSync(path.join(OUT, 'lines.json'), JSON.stringify(rows, null, 1) + '\n');

const byWho = {};
for (const r of rows) byWho[r.who] = (byWho[r.who] || 0) + 1;
const chars = rows.reduce((a, r) => a + r.text.length, 0);
console.log(`${rows.length} lines, ${chars} characters of speech`);
for (const [w, n] of Object.entries(byWho).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${w.padEnd(11)} ${String(n).padStart(4)}`);
}
console.log(`\nwritten to ${path.relative(ROOT, OUT)}/lines.csv and lines.json`);
console.log('record each as ' + path.relative(ROOT, OUT) + '/<id>.mp3');
