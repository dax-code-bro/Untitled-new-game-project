#!/usr/bin/env node
/* Which recordings actually exist.
 *
 * The game fetches this one small file at boot rather than probing for
 * every line: a missing recording then costs nothing at all, instead of a
 * failed request and a pause the first time each character speaks.
 *
 * Run it after adding or removing any mp3 in site/games/voice/.
 *
 *   node tools/voice-have.js
 */
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'site/games/voice');
fs.mkdirSync(DIR, { recursive: true });
const ids = fs.readdirSync(DIR)
  .filter((f) => /\.mp3$/i.test(f))
  .map((f) => f.replace(/\.mp3$/i, ''));
fs.writeFileSync(path.join(DIR, 'have.json'), JSON.stringify(ids) + '\n');
let total = 0;
try {
  total = JSON.parse(fs.readFileSync(path.join(DIR, 'lines.json'), 'utf8')).length;
} catch (e) { /* run voice-lines.js first for a count */ }
console.log(`${ids.length} recordings found${total ? ` of ${total} lines (${Math.round(100 * ids.length / total)}%)` : ''}`);
console.log('written to site/games/voice/have.json');
