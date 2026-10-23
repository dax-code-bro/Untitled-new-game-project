#!/usr/bin/env node
// Self-test of the sound delivery route (pc/sound-delivery.mjs, used by pc/pack-sound.mjs and the
// "sound" family of pc/build-caches.mjs), on a made-up package of three small files, so nothing real
// is touched:   node pc/selftest-sound.mjs   (or npm run selftest:sound)   [--keep]
//
// It checks that
//  1. the same files always give the same archive (bytes and SHA-256);
//  2. an archive installs: every file checked against its SHA-256 and put in place;
//  3. a damaged file inside an archive is NOT put in place (and reported);
//  4. names that try to leave the folder ("../", "/abs", "C:") and files not on the list are skipped;
//  5. a copied folder installs too (the files at their paths, or the folder itself);
//  6. a download from a web server is checked: the right file installs, a short or damaged one is
//     refused and leaves no half-written file behind.
// The fixture lives in output/selftest-sound/ (git-ignored; removed afterwards unless --keep).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { ROOT, writeTar, installPackage, packageState, download, sha256File } from './sound-delivery.mjs';

const KEEP = process.argv.includes('--keep');
const FIX = path.join(ROOT, 'output', 'selftest-sound');
const REL = path.relative(ROOT, FIX).split(path.sep).join('/');
let failures = 0;
const say = (s) => console.log(s);
const check = (ok, what) => { say(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures++; };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

/** A plain ustar header (for hand-made hostile archives). */
function header(name, size) {
  const h = Buffer.alloc(512, 0);
  h.write(name, 0, 100, 'utf8');
  h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write(size.toString(8).padStart(11, '0') + '\0', 124); h.write('00000000000\0', 136);
  h.fill(0x20, 148, 156); h.write('0', 156); h.write('ustar\0', 257); h.write('00', 263);
  let s = 0; for (const b of h) s += b;
  h.write(s.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}
const member = (name, data) => Buffer.concat([header(name, data.length), data, Buffer.alloc((512 - (data.length % 512)) % 512)]);

async function main() {
  const t0 = Date.now();
  fs.rmSync(FIX, { recursive: true, force: true });
  const src = path.join(FIX, 'src');
  fs.mkdirSync(path.join(src, 'scenes'), { recursive: true });
  const files = {
    'S01E01_mix.wav': crypto.randomBytes(70000),
    'scenes/1A.wav': crypto.randomBytes(1234),
    'S01E01.en.srt': Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nOne like Charcoal.\n'),
  };
  for (const [n, b] of Object.entries(files)) fs.writeFileSync(path.join(src, n), b);
  const list = Object.entries(files).map(([n, b]) => ({ path: n, sha256: sha(b), bytes: b.length }));
  const pkg = { id: 'selftest', dir: `${REL}/dest`, files: list };
  const dest = path.join(ROOT, pkg.dir);
  const entries = list.map((f) => ({ name: f.path, file: path.join(src, f.path) }));

  say('1. the archive is deterministic');
  const t1 = path.join(FIX, 'a.tar'), t2 = path.join(FIX, 'b.tar');
  writeTar(t1, entries);
  await new Promise((r) => setTimeout(r, 20));
  fs.utimesSync(path.join(src, 'scenes/1A.wav'), new Date(), new Date(Date.now() - 86400e3));   // a different file date must not matter
  writeTar(t2, entries);
  check(sha256File(t1) === sha256File(t2), `same files -> same archive (${sha256File(t1).slice(0, 12)}...)`);

  say('2. an archive installs, every file checked');
  let r = installPackage(pkg, t1);
  check(r.written === 3 && r.bad.length === 0, `3 files written, none bad (got ${r.written} / ${r.bad.length})`);
  check(packageState(pkg).ok, 'every file matches its SHA-256 in place');

  say('3. a damaged file inside the archive is not put in place');
  fs.rmSync(dest, { recursive: true, force: true });
  const dmg = fs.readFileSync(t1);
  dmg[512 + 100] ^= 0xff;                                  // inside the first member's data
  const tDmg = path.join(FIX, 'damaged.tar');
  fs.writeFileSync(tDmg, dmg);
  r = installPackage(pkg, tDmg);
  check(r.bad.length === 1 && !fs.existsSync(path.join(dest, list[0].path)), `damaged ${list[0].path} refused, not written (bad: ${r.bad.join(', ')})`);
  check(!fs.readdirSync(dest, { recursive: true }).some((f) => String(f).includes('.part')), 'no half-written file left behind');

  say('4. names that leave the folder, and files not on the list, are skipped');
  fs.rmSync(dest, { recursive: true, force: true });
  const outside = path.join(FIX, 'escaped.wav');
  const hostile = Buffer.concat([
    member('../escaped.wav', Buffer.from('x')), member('/tmp/dk-selftest-abs.wav', Buffer.from('x')),
    member('C:/dk-selftest.wav', Buffer.from('x')), member('scenes/../../escaped.wav', Buffer.from('x')),
    member('extra.wav', Buffer.from('not on the list')),
    member('S01E01.en.srt', files['S01E01.en.srt']), Buffer.alloc(1024, 0)]);
  const tHost = path.join(FIX, 'hostile.tar');
  fs.writeFileSync(tHost, hostile);
  const skipped = [];
  r = installPackage(pkg, tHost, (s) => skipped.push(s));
  check(!fs.existsSync(outside) && !fs.existsSync('/tmp/dk-selftest-abs.wav') && !fs.existsSync(path.join(dest, 'extra.wav')), 'nothing written outside the folder or off the list');
  check(skipped.length === 5 && r.written === 1, `5 entries skipped, the listed subtitle file installed (skipped ${skipped.length}, written ${r.written})`);

  say('5. a copied folder installs');
  fs.rmSync(dest, { recursive: true, force: true });
  r = installPackage(pkg, src);
  check(r.written === 3 && packageState(pkg).ok, 'from the folder: 3 files, all checked');

  say('6. downloads are checked');
  const good = fs.readFileSync(t1);
  const server = http.createServer((req, res) => {
    const body = req.url === '/good.tar' ? good : req.url === '/short.tar' ? good.subarray(0, good.length - 700) : req.url === '/bad.tar' ? dmg : null;
    if (!body) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'application/x-tar' }); res.end(body);
  });
  await new Promise((r2) => server.listen(0, '127.0.0.1', r2));
  const base = `http://127.0.0.1:${server.address().port}`;
  const want = { sha256: sha256File(t1), bytes: good.length };
  const got = path.join(FIX, 'dl', 'got.tar');
  try {
    await download(`${base}/good.tar`, got, want);
    check(sha256File(got) === want.sha256, 'the right archive downloads and matches');
    for (const bad of ['short', 'bad']) {
      fs.rmSync(got, { force: true });
      let err = null;
      try { await download(`${base}/${bad}.tar`, got, want); } catch (e) { err = e.message; }
      check(!!err && !fs.existsSync(got) && !fs.existsSync(`${got}.part`), `a ${bad === 'short' ? 'cut-off' : 'damaged'} download is refused and removed (${(err || 'no error').slice(0, 60)}...)`);
    }
  } finally { server.close(); }

  say(`\n${failures ? `${failures} check(s) FAILED` : 'all checks passed'} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (failures || KEEP) say(`(fixture kept in ${REL})`);
  else fs.rmSync(FIX, { recursive: true, force: true });
  return failures ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
