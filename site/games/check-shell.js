#!/usr/bin/env node
/* A stray backtick inside one of the shell's template literals.
 *
 * CSS, CSS2 and the DOM blob in buildDom are template literals holding
 * hundreds of lines of CSS and HTML, and prose comments live inside
 * them. Writing a class name in backticks in one of those comments ENDS
 * THE STRING: the rest of the stylesheet is parsed as JavaScript, and
 * the whole front end silently fails to define itself.
 *
 * It is not caught by a syntax check, because what it produces --
 * a tagged template -- is valid JavaScript. It took the shell off the
 * air completely and the only thing that noticed was loading the page.
 *
 * So: count the backticks. Each of these blocks must have exactly two,
 * its own opener and closer, and nothing in between.
 *
 *   node site/games/check-shell.js
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'bunker-nine-shell.js');
const src = fs.readFileSync(file, 'utf8');
const lines = src.split('\n');

/* Each block runs from the line that opens it to the first line that is
   nothing but a closing backtick and a semicolon (or the closer of the
   DOM blob, which ends a returned string). */
const OPENERS = [
  { name: 'CSS', re: /^var CSS = `$/ },
  { name: 'CSS2', re: /^var CSS2 = `$/ },
  { name: 'buildDom markup', re: /^\s*root\.innerHTML = `$/ },
];

let bad = 0;
for (const { name, re } of OPENERS) {
  const start = lines.findIndex((l) => re.test(l));
  if (start < 0) { console.log('MISSING  could not find the ' + name + ' block'); bad++; continue; }
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^`;$/.test(lines[i]) || /^\s*<\/div>`;$/.test(lines[i])) { end = i; break; }
  }
  if (end < 0) { console.log('UNCLOSED ' + name + ' from line ' + (start + 1)); bad++; continue; }
  const inner = lines.slice(start + 1, end);
  const hits = [];
  inner.forEach((l, k) => { if (l.indexOf('`') >= 0) hits.push(start + 2 + k); });
  if (hits.length) {
    console.log('BACKTICK ' + name + ' (lines ' + (start + 1) + '-' + (end + 1) + ') has a backtick inside it, on line'
      + (hits.length > 1 ? 's ' : ' ') + hits.join(', '));
    hits.forEach((n) => console.log('           ' + n + ': ' + lines[n - 1].trim().slice(0, 90)));
    bad++;
  } else {
    console.log('ok       ' + name + ' (lines ' + (start + 1) + '-' + (end + 1) + '), ' + inner.length + ' lines, no stray backtick');
  }
}

/* And the thing the backtick bug actually broke: the shell has to define
   its entry point. Cheap to assert, and it is the symptom a reader will
   recognise. */
if (!/BUNKER_SHELL/.test(src)) { console.log('MISSING  the shell never mentions BUNKER_SHELL'); bad++; }

console.log(bad === 0 ? 'shell template literals clean' : bad + ' problem(s)');
process.exit(bad === 0 ? 0 : 1);
