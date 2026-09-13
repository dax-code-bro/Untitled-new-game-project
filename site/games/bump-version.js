#!/usr/bin/env node
/* Set the game's version in the two places it has to agree.
 *
 * The live-update check works by comparing a version BAKED INTO the
 * script against one FETCHED from version.json, because a browser will
 * cheerfully serve a months-old copy of a .js file and the only way to
 * ask "what is published" is to ask something that is not cached. That
 * only works while the two are in step, and keeping them in step by hand
 * is exactly the sort of thing that is right nine times and wrong on the
 * tenth -- at which point every player is told there is an update when
 * there is not, or is not told when there is.
 *
 * The comment in bunker-nine.js has pointed at this file for a while;
 * now the file is here.
 *
 *   node site/games/bump-version.js 0.8.0 "the name"
 *   node site/games/bump-version.js 0.8.0 "the name" --did "what it did"
 *   node site/games/bump-version.js --check
 *
 * --check prints both and exits non-zero if they disagree, which is what
 * a release step wants.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const GAME = path.join(ROOT, 'site/games/bunker-nine.js');
const MANIFEST = path.join(ROOT, 'site/games/version.json');
const BAKED = /const B9_BUILD = \{ version: '([^']*)', name: '([^']*)' \};/;

function read() {
  const src = fs.readFileSync(GAME, 'utf8');
  const m = src.match(BAKED);
  if (!m) throw new Error('cannot find B9_BUILD in ' + GAME);
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  return { src, baked: { version: m[1], name: m[2] }, man };
}

const args = process.argv.slice(2);

if (args[0] === '--check' || args.length === 0) {
  const { baked, man } = read();
  console.log(`  baked     ${baked.version}  ${baked.name}`);
  console.log(`  manifest  ${man.version}  ${man.name}`);
  const ok = baked.version === man.version && baked.name === man.name;
  console.log(ok ? '  in step' : '  OUT OF STEP');
  process.exit(ok ? 0 : 1);
}

const version = args[0];
const name = args[1];
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('  version must look like 1.2.3');
  process.exit(2);
}
if (!name) { console.error('  a name is required: it is what the update pop-up calls itself'); process.exit(2); }
const didAt = args.indexOf('--did');
const did = didAt >= 0 ? args[didAt + 1] : null;

const { src, man } = read();
fs.writeFileSync(GAME, src.replace(BAKED,
  `const B9_BUILD = { version: '${version}', name: '${name.replace(/'/g, "\\'")}' };`));

man.version = version;
man.name = name;
man.date = new Date().toISOString().slice(0, 10);
if (did) man.did = did;
fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 2) + '\n');

console.log(`  ${version}  ${name}`);
console.log('  bunker-nine.js and version.json both written');
if (!did) console.log('  (version.json still describes the previous update -- pass --did to change it)');
