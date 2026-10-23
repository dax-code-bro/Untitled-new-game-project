// How sound files that are NOT in git reach the render PC (SERIES.md section 2: audio masters are
// never committed). Used by pc/pack-sound.mjs (packs on the computer that has the files) and by
// pc/build-caches.mjs, family "sound" (downloads or installs them on the render PC).
//
// The list of packages is episodes/s01e01/final/audio/delivery.json (in git, small):
//   { packages: [ { id, what, dir, files_from? | files?, archive: null | { file, bytes, sha256, url } } ] }
//  - dir:        where the files go, relative to dragons-kingdom/ (the same path on every computer)
//  - files_from: a JSON in git that lists every file with its sha256 (final-vo: vo/takes.json)
//  - files:      [{ path, bytes, sha256 }] written by pack-sound.mjs (the mix)
//  - archive:    the packed .tar (plain ustar, deterministic) and where it can be downloaded
// Every file is checked against its sha256 before it is put in place; a file that is not on the
// list is never written. Nothing here is specific to Windows: it is plain Node (no tar.exe needed).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DELIVERY_FILE = path.join(ROOT, 'episodes', 's01e01', 'final', 'audio', 'delivery.json');
export const AUDIO_EXT = ['.wav', '.flac', '.m4a', '.mp3', '.aac', '.ogg'];

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
export const readDelivery = () => readJson(DELIVERY_FILE);

export function sha256File(f) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(f, 'r');
  try {
    const buf = Buffer.allocUnsafe(1 << 20);
    for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0;) h.update(buf.subarray(0, n));
  } finally { fs.closeSync(fd); }
  return h.digest('hex');
}

/** Only plain relative paths inside the package folder (no "..", no drive letters, no absolute paths). */
export function safeRel(p) {
  const s = String(p).replace(/\\/g, '/');
  if (!s || s.startsWith('/') || /^[a-zA-Z]:/.test(s) || s.split('/').some((x) => x === '..' || x === '')) return null;
  return s;
}

/** The files a package must contain: [{ path (relative to pkg.dir), sha256, bytes? }]. */
export function expectedFiles(pkg) {
  if (pkg.files_from) {
    const src = readJson(path.join(ROOT, pkg.files_from));
    if (!src) throw new Error(`${pkg.id}: ${pkg.files_from} is missing or not JSON`);
    const rows = [...(src.takes || []), ...(src.nonverbal_placeholders || [])].filter((t) => t.file && t.sha256);
    return rows.map((t) => ({ path: safeRel(t.file), sha256: t.sha256 }));
  }
  return (pkg.files || []).map((f) => ({ path: safeRel(f.path), sha256: f.sha256, bytes: f.bytes }));
}

/** { ok, have, missing: [...], wrong: [...], total } for the package's files on this computer. */
export function packageState(pkg, { hash = true } = {}) {
  const exp = expectedFiles(pkg);
  const missing = [];
  const wrong = [];
  for (const e of exp) {
    const f = path.join(ROOT, pkg.dir, e.path);
    let st;
    try { st = fs.statSync(f); } catch { missing.push(e.path); continue; }
    if (e.bytes != null && st.size !== e.bytes) { wrong.push(e.path); continue; }
    if (hash && sha256File(f) !== e.sha256) wrong.push(e.path);
  }
  return { ok: exp.length > 0 && !missing.length && !wrong.length, total: exp.length, have: exp.length - missing.length - wrong.length, missing, wrong };
}

// ------------------------------------------------------------------- tar (ustar) ---
function octal(n, width) { return n.toString(8).padStart(width - 1, '0') + '\0'; }
function tarHeader(name, size) {
  const h = Buffer.alloc(512, 0);
  let prefix = '';
  let nm = name;
  if (Buffer.byteLength(nm) > 100) {                       // ustar: split a long path at a '/'
    const i = nm.lastIndexOf('/', nm.length - 1);
    prefix = nm.slice(0, i); nm = nm.slice(i + 1);
    if (Buffer.byteLength(nm) > 100 || Buffer.byteLength(prefix) > 155) throw new Error(`path too long for a tar entry: ${name}`);
  }
  h.write(nm, 0, 100, 'utf8');
  h.write(octal(0o644, 8), 100, 'ascii');                   // mode
  h.write(octal(0, 8), 108, 'ascii');                       // uid
  h.write(octal(0, 8), 116, 'ascii');                       // gid
  h.write(octal(size, 12), 124, 'ascii');                   // size
  h.write(octal(0, 12), 136, 'ascii');                      // mtime 0: the same files give the same archive
  h.fill(0x20, 148, 156);                                   // checksum field counts as spaces
  h.write('0', 156, 'ascii');                               // regular file
  h.write('ustar\0', 257, 'ascii'); h.write('00', 263, 'ascii');
  h.write(prefix, 345, 155, 'utf8');
  let sum = 0; for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
  return h;
}

/** Write a deterministic ustar archive of [{ name, file }] (names in the given order). */
export function writeTar(out, entries) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = `${out}.part`;
  const fd = fs.openSync(tmp, 'w');
  try {
    const buf = Buffer.allocUnsafe(1 << 20);
    for (const { name, file } of entries) {
      const size = fs.statSync(file).size;
      fs.writeSync(fd, tarHeader(name, size));
      const src = fs.openSync(file, 'r');
      try { for (let n; (n = fs.readSync(src, buf, 0, buf.length, null)) > 0;) fs.writeSync(fd, buf, 0, n); } finally { fs.closeSync(src); }
      const pad = (512 - (size % 512)) % 512;
      if (pad) fs.writeSync(fd, Buffer.alloc(pad, 0));
    }
    fs.writeSync(fd, Buffer.alloc(1024, 0));
  } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, out);
}

function readFull(fd, buf, len, pos) {
  let got = 0;
  while (got < len) { const n = fs.readSync(fd, buf, got, len - got, pos + got); if (!n) break; got += n; }
  return got;
}
const cstr = (b) => { const i = b.indexOf(0); return b.subarray(0, i < 0 ? b.length : i).toString('utf8'); };
function tarSize(b) {
  if (b[0] & 0x80) { let n = 0; for (let i = 1; i < b.length; i++) n = n * 256 + b[i]; return n; }   // GNU base-256
  return parseInt(cstr(b).trim() || '0', 8);
}

/**
 * Read a tar archive member by member: onFile(name, size, readChunk) where readChunk(buf) -> bytes
 * read (0 at the end). Understands ustar, GNU long names and pax path records; skips non-files.
 */
export function readTar(archive, onFile) {
  const fd = fs.openSync(archive, 'r');
  try {
    const hdr = Buffer.alloc(512);
    let pos = 0;
    let longName = null;
    for (;;) {
      if (readFull(fd, hdr, 512, pos) < 512) throw new Error('the archive ends early (download incomplete?)');
      pos += 512;
      if (hdr.every((b) => b === 0)) return;
      const size = tarSize(hdr.subarray(124, 136));
      const type = String.fromCharCode(hdr[156] || 48);
      const prefix = hdr.subarray(257, 262).toString() === 'ustar' ? cstr(hdr.subarray(345, 500)) : '';
      let name = longName ?? (prefix ? `${prefix}/${cstr(hdr.subarray(0, 100))}` : cstr(hdr.subarray(0, 100)));
      longName = null;
      const dataPos = pos;
      pos += Math.ceil(size / 512) * 512;
      if (type === 'L' || type === 'x') {                         // GNU long name / pax header for the next entry
        const meta = Buffer.alloc(size);
        readFull(fd, meta, size, dataPos);
        if (type === 'L') longName = cstr(meta);
        else { const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(meta.toString('utf8')); if (m) longName = m[1]; }
        continue;
      }
      if (type !== '0' && type !== '\0' && type !== '7') continue;   // folders, links, ...: ignored
      name = name.replace(/^\.\//, '');
      let left = size;
      let at = dataPos;
      onFile(name, size, (buf) => {
        if (left <= 0) return 0;
        const n = fs.readSync(fd, buf, 0, Math.min(buf.length, left), at);
        if (!n) throw new Error('the archive ends early (download incomplete?)');
        left -= n; at += n;
        return n;
      });
    }
  } finally { fs.closeSync(fd); }
}

/** Put one file in place: written next to its target, checked against sha256, then renamed. */
function placeFile(dest, sha256, writeTo) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part-dk`;
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(tmp, 'w');
  try { writeTo((chunk) => { h.update(chunk); fs.writeSync(fd, chunk); }); } finally { fs.closeSync(fd); }
  const got = h.digest('hex');
  if (got !== sha256) { fs.rmSync(tmp, { force: true }); return false; }
  fs.renameSync(tmp, dest);
  return true;
}

/** Install a package from a .tar (packed by pack-sound.mjs) or from a folder that holds its files. */
export function installPackage(pkg, source, say = () => {}) {
  const exp = new Map(expectedFiles(pkg).map((e) => [e.path, e]));
  const destDir = path.join(ROOT, pkg.dir);
  let written = 0;
  const bad = [];
  const buf = Buffer.allocUnsafe(1 << 20);
  if (fs.statSync(source).isDirectory()) {
    for (const e of exp.values()) {
      // the folder may hold the files at their relative paths (vo/L001.wav), or be a sub-folder
      // such as the copied vo folder itself (L001.wav, nonverbal/...): try every tail of the path
      const parts = e.path.split('/');
      const src = parts.map((_, k) => path.join(source, ...parts.slice(k))).find((f) => fs.existsSync(f));
      if (!src) continue;
      const ok = placeFile(path.join(destDir, e.path), e.sha256, (write) => {
        const fd = fs.openSync(src, 'r');
        try { for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0;) write(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
      });
      if (ok) written++; else bad.push(e.path);
    }
  } else {
    readTar(source, (name, size, readChunk) => {
      const rel = safeRel(name);
      const e = rel && exp.get(rel);
      if (!e) { say(`      skipped ${name} (not on the package's list)`); return; }
      const ok = placeFile(path.join(destDir, rel), e.sha256, (write) => { for (let n; (n = readChunk(buf)) > 0;) write(buf.subarray(0, n)); });
      if (ok) written++; else bad.push(rel);
    });
  }
  return { written, bad };
}

/** Download url to file (streamed), checking its size and sha256. */
export async function download(url, file, { sha256, bytes, say = () => {} } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
  const tmp = `${file}.part`;
  const fd = fs.openSync(tmp, 'w');
  const h = crypto.createHash('sha256');
  let got = 0;
  let next = 0;
  try {
    for await (const chunk of res.body) {
      const b = Buffer.from(chunk);
      h.update(b); fs.writeSync(fd, b); got += b.length;
      if (bytes && got >= next) { say(`      ${Math.floor((100 * got) / bytes)}% of ${(bytes / 2 ** 20).toFixed(0)} MB`); next += Math.max(bytes / 10, 1); }
    }
  } finally { fs.closeSync(fd); }
  const sum = h.digest('hex');
  if ((bytes && got !== bytes) || (sha256 && sum !== sha256)) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`${path.basename(file)}: got ${got} bytes, sha256 ${sum.slice(0, 12)}... - expected ${bytes} bytes, ${String(sha256).slice(0, 12)}... (download damaged; run again)`);
  }
  fs.renameSync(tmp, file);
}
