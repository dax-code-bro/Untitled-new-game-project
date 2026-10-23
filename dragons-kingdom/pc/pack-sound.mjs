#!/usr/bin/env node
// Pack sound files that are not in git so the render PC can get them (pc/MANIFEST.md, "Sound").
// Runs on the computer that HAS the files (the cloud machine, or wherever the mix is made).
//
//   node pc/pack-sound.mjs final-vo                  pack the final voice takes (checks every sha256 first)
//   node pc/pack-sound.mjs mix                       pack the mix: every sound file in episodes/s01e01/final/audio
//                                                    (S01E01_mix.*, scenes/<scene>.*) plus S01E01.en.srt if present
//   options: --out DIR      where the .tar goes (default output/delivery; git-ignored)
//            --record       write the archive (and, for the mix, its file list) into
//                           episodes/s01e01/final/audio/delivery.json - commit that small file
//            --url URL      with --record: where the PC downloads the .tar from
//
// The .tar is deterministic (same files -> same bytes -> same sha256). How it gets to the PC:
//   1. upload the .tar somewhere free that gives a direct download link, e.g. a GitHub release of
//      this repository:  gh release create sound-s01e01 --prerelease --title "Episode 1 sound" <file.tar>
//      (or gh release upload sound-s01e01 <file.tar> when the release exists);
//   2. node pc/pack-sound.mjs <id> --record --url <the download link>, commit delivery.json, push;
//   3. on the PC the desktop shortcut (git pull + pc/build-caches.mjs) downloads it, checks the
//      archive's and every file's sha256 and unpacks it; render/episode.mjs then adds the sound.
// Without an upload: copy the .tar (or the folder) to the PC and run there
//   node pc/build-caches.mjs --only sound --from <file.tar or folder>
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, DELIVERY_FILE, AUDIO_EXT, readDelivery, expectedFiles, packageState, sha256File, writeTar, safeRel } from './sound-delivery.mjs';

const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

function listMixFiles(dir) {
  const out = [];
  const walk = (d, prefix) => {
    if (!fs.existsSync(d)) return;
    for (const n of fs.readdirSync(d).sort()) {
      const f = path.join(d, n);
      if (fs.statSync(f).isDirectory()) { if (n === 'scenes') walk(f, `${prefix}${n}/`); continue; }
      if (AUDIO_EXT.includes(path.extname(n).toLowerCase()) || n === 'S01E01.en.srt') out.push(`${prefix}${n}`);
    }
  };
  walk(dir, '');
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('-h') || argv.includes('--help')) {
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 25).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return argv.length ? 0 : 1;
  }
  const id = argv[0];
  const opt = { out: path.join(ROOT, 'output', 'delivery'), record: false, url: null };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--out') opt.out = path.resolve(argv[++i]);
    else if (argv[i] === '--record') opt.record = true;
    else if (argv[i] === '--url') opt.url = argv[++i];
    else throw new Error(`unknown option ${argv[i]}`);
  }
  if (opt.url && !opt.record) throw new Error('--url only makes sense with --record');
  const delivery = readDelivery();
  if (!delivery) throw new Error(`${rel(DELIVERY_FILE)} is missing`);
  const pkg = delivery.packages.find((p) => p.id === id);
  if (!pkg) throw new Error(`no package "${id}" in ${rel(DELIVERY_FILE)} (have: ${delivery.packages.map((p) => p.id).join(', ')})`);
  const dir = path.join(ROOT, pkg.dir);

  let files;
  if (pkg.files_from) {
    const st = packageState(pkg);
    if (!st.ok) throw new Error(`${id}: ${st.missing.length} file(s) missing and ${st.wrong.length} not matching ${pkg.files_from} (e.g. ${[...st.missing, ...st.wrong].slice(0, 3).join(', ')}) - rebuild them first`);
    files = expectedFiles(pkg).map((e) => ({ path: e.path, sha256: e.sha256, bytes: fs.statSync(path.join(dir, e.path)).size }));
  } else {
    const names = listMixFiles(dir);
    if (!names.length) throw new Error(`${id}: no sound files in ${rel(dir)} yet (expected S01E01_mix.wav or scenes/<scene>.wav ...)`);
    files = names.map((n) => ({ path: safeRel(n), sha256: sha256File(path.join(dir, n)), bytes: fs.statSync(path.join(dir, n)).size }));
  }
  const total = files.reduce((a, f) => a + f.bytes, 0);
  console.log(`${id}: ${files.length} file(s), ${(total / 2 ** 20).toFixed(1)} MB from ${rel(dir)}`);

  // name by content: the same files always give the same archive name and bytes
  const listHash = createHash('sha256').update(files.map((f) => `${f.sha256}  ${f.path}`).join('\n')).digest('hex');
  const out = path.join(opt.out, `dk-s01e01-${id}-${listHash.slice(0, 12)}.tar`);
  writeTar(out, files.map((f) => ({ name: f.path, file: path.join(dir, f.path) })));
  const archive = { file: path.basename(out), bytes: fs.statSync(out).size, sha256: sha256File(out), files: files.length, url: opt.url, packed_at: new Date().toISOString() };
  console.log(`wrote ${out}`);
  console.log(`  bytes  ${archive.bytes}`);
  console.log(`  sha256 ${archive.sha256}`);
  if (opt.record) {
    pkg.archive = archive;
    if (!pkg.files_from) pkg.files = files;
    fs.writeFileSync(DELIVERY_FILE, JSON.stringify(delivery, null, 1) + '\n');
    console.log(`recorded in ${rel(DELIVERY_FILE)}${opt.url ? ` (download: ${opt.url})` : ' (no download link: the PC installs it with --from)'} - commit that file`);
  } else {
    console.log('not recorded (add --record [--url URL] once the file is uploaded; see the top of this script)');
  }
  return 0;
}

try { process.exitCode = main(); } catch (e) { console.error(`error: ${e.message}`); process.exitCode = 1; }
