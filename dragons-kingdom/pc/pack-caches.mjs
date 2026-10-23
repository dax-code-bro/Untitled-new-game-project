#!/usr/bin/env node
// Pack the cloud machine's caches (human characters, landscape bakes, cloth bakes) so the render PC uses
// EXACTLY the geometry every shot was reviewed with, instead of rebuilding it (pc/MANIFEST.md, "Cache
// packages"). The same route as the sound (pc/sound-delivery.mjs): a deterministic tar, the sha256 of the
// archive and of every file in it, recorded in pc/cache-delivery.json (in git, small).
//
//   node pc/pack-caches.mjs humans|nature|architecture|props|all   pack (writes output/delivery/*.tar)
//   options: --record          write the package into pc/cache-delivery.json (commit that file)
//            --url FAMILY=URL  with --record: where the PC downloads that family's tar (repeatable)
//            --out DIR         where the tars go (default output/delivery; git-ignored)
//            --keep            keep the tar after recording (default: delete it - packing is deterministic,
//                              the same files give the same bytes, so it can be made again for an upload)
//
// On the PC, pc/build-caches.mjs installs a recorded package instead of rebuilding that family:
// downloaded from its url (once published), or from a copied tar:
//   node pc/build-caches.mjs --only humans --from <dk-cache-humans-....tar>
// Every file is checked against its sha256 before it is put in place. The rebuild stays as the fallback
// (no package recorded / not published, or --rebuild).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ROOT, sha256File, writeTar } from './sound-delivery.mjs';
import { CACHE_DIRS, familyCodeHash } from './build-caches.mjs';

export const CACHE_DELIVERY_FILE = path.join(ROOT, 'pc', 'cache-delivery.json');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const SKIP = /(^|\/)(\.dk-build\.json|\.dk-package\.json)$|\.part|\.tmp|~$/;

export function listCacheFiles(dir) {
  const out = [];
  const walk = (d, prefix) => {
    if (!fs.existsSync(d)) return;
    for (const n of fs.readdirSync(d).sort()) {
      const f = path.join(d, n);
      const r = `${prefix}${n}`;
      if (fs.statSync(f).isDirectory()) walk(f, `${r}/`);
      else if (!SKIP.test(r)) out.push(r);
    }
  };
  walk(dir, '');
  return out;
}

/** When the newest and oldest files of a cache were written (its provenance, as far as the disk tells). */
function dates(dir, files) {
  const t = files.map((f) => fs.statSync(path.join(dir, f)).mtime.toISOString()).sort();
  return t.length ? { oldest: t[0], newest: t[t.length - 1] } : null;
}

/** JSON with one line per listed file (thousands of them: small diffs, readable). */
export function stringify(d) {
  return JSON.stringify(d, null, 1).replace(/\{\n\s*"path": ("[^"]*"),\n\s*"bytes": (\d+),\n\s*"sha256": ("[0-9a-f]{64}")\n\s*\}/g, '{ "path": $1, "bytes": $2, "sha256": $3 }') + '\n';
}

export function readCacheDelivery() {
  try { return JSON.parse(fs.readFileSync(CACHE_DELIVERY_FILE, 'utf8')); } catch { return { about: ABOUT, packages: [] }; }
}
const ABOUT = 'The cloud machine\'s caches as sha256-pinned packages (pc/pack-caches.mjs). pc/build-caches.mjs installs a package with an archive url (or --from a copied tar) instead of rebuilding that family, so the render PC uses exactly the geometry the shots were reviewed with. code_hash = the identity of the code that makes the family at packing time (pc/build-caches.mjs familyCodeHash).';

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('-h') || argv.includes('--help')) {
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 22).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return argv.length ? 0 : 1;
  }
  const opt = { out: path.join(ROOT, 'output', 'delivery'), record: false, urls: {}, keep: false };
  const fams = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opt.out = path.resolve(argv[++i]);
    else if (a === '--record') opt.record = true;
    else if (a === '--keep') opt.keep = true;
    else if (a === '--url') { const [k, ...v] = argv[++i].split('='); opt.urls[k] = v.join('='); }
    else if (a === 'all') fams.push(...Object.keys(CACHE_DIRS));
    else if (CACHE_DIRS[a]) fams.push(a);
    else throw new Error(`unknown family or option ${a} (families: ${Object.keys(CACHE_DIRS).join(', ')}, all)`);
  }
  const delivery = readCacheDelivery();
  for (const fam of [...new Set(fams)]) {
    const dir = CACHE_DIRS[fam];
    const names = listCacheFiles(dir);
    if (!names.length) throw new Error(`${fam}: ${rel(dir)} is empty - build it first (node pc/build-caches.mjs --only ${fam})`);
    const t0 = Date.now();
    const files = names.map((n) => ({ path: n, bytes: fs.statSync(path.join(dir, n)).size, sha256: sha256File(path.join(dir, n)) }));
    const total = files.reduce((s, f) => s + f.bytes, 0);
    const listHash = createHash('sha256').update(files.map((f) => `${f.sha256}  ${f.path}`).join('\n')).digest('hex');
    const out = path.join(opt.out, `dk-cache-${fam}-${listHash.slice(0, 12)}.tar`);
    writeTar(out, files.map((f) => ({ name: f.path, file: path.join(dir, f.path) })));
    const archive = { file: path.basename(out), bytes: fs.statSync(out).size, sha256: sha256File(out), files: files.length, url: opt.urls[fam] || null, packed_at: new Date().toISOString() };
    console.log(`${fam}: ${files.length} file(s), ${(total / 2 ** 20).toFixed(1)} MB from ${rel(dir)} -> ${path.basename(out)}`);
    console.log(`  archive ${archive.bytes} bytes, sha256 ${archive.sha256} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    const stamp = fs.existsSync(path.join(dir, '.dk-build.json'));
    const pkg = {
      id: fam, family: fam, dir: rel(dir), code_hash: familyCodeHash(fam),
      provenance: { files_written: dates(dir, names), build_stamp: stamp ? 'present (.dk-build.json)' : 'none: made before build stamps existed, so the code version that made them is not recorded' },
      archive, files,
    };
    if (opt.record) {
      const i = delivery.packages.findIndex((p) => p.id === fam);
      if (i >= 0) delivery.packages[i] = pkg; else delivery.packages.push(pkg);
    }
    if (!opt.keep) { fs.rmSync(out, { force: true }); console.log('  (tar deleted again: the same files always pack to the same bytes; pack again with --keep to upload it)'); }
  }
  if (opt.record) {
    delivery.about = ABOUT;
    delivery.packages.sort((a, b) => (a.id < b.id ? -1 : 1));
    fs.writeFileSync(CACHE_DELIVERY_FILE, stringify(delivery));
    console.log(`recorded in ${rel(CACHE_DELIVERY_FILE)} - commit that file`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exitCode = main(); } catch (e) { console.error(`error: ${e.message}`); process.exitCode = 1; }
}
