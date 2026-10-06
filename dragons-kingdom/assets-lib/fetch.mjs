#!/usr/bin/env node
// Dragon's Kingdom asset library downloader (no dependencies, Node >= 20).
//
//   node assets-lib/fetch.mjs                 download / verify everything in manifest.json
//   node assets-lib/fetch.mjs --only hdri/    only ids containing "hdri/" (repeatable, comma list ok)
//   node assets-lib/fetch.mjs --set set.cling_village_square
//   node assets-lib/fetch.mjs --dry-run       show what would happen, download nothing
//   node assets-lib/fetch.mjs --verify        re-hash every file even if it looks unchanged
//   node assets-lib/fetch.mjs --lock          write sha256/bytes of newly resolved files into manifest.json
//   node assets-lib/fetch.mjs --discover      (needs api.polyhaven.com) check Poly Haven ids, suggest close matches
//   node assets-lib/fetch.mjs --credits       rewrite CREDITS.md from manifest.json
//   options: --dir DIR (library root, default: this folder), --jobs N (parallel downloads, default 4),
//            --strict (exit 1 when anything is missing, also "blocked" entries), --keep-archives
//
// Idempotent: a file that exists with the right sha256 is never downloaded again
// (size+mtime are cached in .fetch-state.json, so a re-run does not re-hash
// gigabytes). Resumable: downloads go to .cache/ as *.part and continue with an
// HTTP Range request after an interruption. Every file is verified against the
// sha256 in manifest.json (or the provider's md5 for entries that are not locked
// yet) before it is moved into place. Respects HTTPS_PROXY / NO_PROXY.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UA = 'dragons-kingdom-assets-lib/1.0 (+https://github.com/; CC0 asset fetcher)';

// ------------------------------------------------------------------ args --
function parseArgs(argv) {
  const o = { only: [], sets: [], kinds: [], dir: HERE, jobs: 4, dryRun: false, verify: false, lock: false,
    discover: false, credits: false, strict: false, keepArchives: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    switch (a) {
      case '--only': o.only.push(...v().split(',').filter(Boolean)); break;
      case '--set': o.sets.push(...v().split(',').filter(Boolean)); break;
      case '--kind': o.kinds.push(...v().split(',').filter(Boolean)); break;
      case '--dir': o.dir = path.resolve(v()); break;
      case '--jobs': o.jobs = Math.max(1, parseInt(v(), 10) || 4); break;
      case '--dry-run': o.dryRun = true; break;
      case '--verify': o.verify = true; break;
      case '--lock': o.lock = true; break;
      case '--discover': o.discover = true; break;
      case '--credits': o.credits = true; break;
      case '--strict': o.strict = true; break;
      case '--keep-archives': o.keepArchives = true; break;
      case '-h': case '--help': o.help = true; break;
      default: throw new Error(`unknown option ${a} (see --help)`);
    }
  }
  return o;
}

// ------------------------------------------------------------- network --
function noProxyMatch(host) {
  const list = (process.env.NO_PROXY || process.env.no_proxy || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  host = host.toLowerCase();
  return list.some((e) => {
    if (e === '*') return true;
    const d = e.replace(/^\*?\./, '');
    return host === d || host.endsWith('.' + d);
  });
}
function proxyFor(url) {
  const p = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!p || noProxyMatch(url.hostname)) return null;
  return new URL(p.includes('://') ? p : `http://${p}`);
}

class FetchError extends Error {
  constructor(msg, { status, blocked, notFound } = {}) { super(msg); this.status = status; this.blocked = !!blocked; this.notFound = !!notFound; }
}

/** One GET; resolves with the IncomingMessage (redirects not followed here). */
function getOnce(url, headers) {
  const u = new URL(url);
  const opts = { method: 'GET', host: u.hostname, port: u.port || 443, path: u.pathname + u.search, headers: { 'user-agent': UA, ...headers }, servername: u.hostname };
  const proxy = proxyFor(u);
  if (!proxy) {
    return new Promise((resolve, reject) => {
      const req = https.request(opts, resolve);
      req.on('error', reject);
      req.setTimeout(60000, () => req.destroy(new Error(`timeout connecting to ${u.hostname}`)));
      req.end();
    });
  }
  return new Promise((resolve, reject) => {
    const target = `${u.hostname}:${u.port || 443}`;
    const auth = proxy.username ? { 'proxy-authorization': 'Basic ' + Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64') } : {};
    const creq = http.request({ host: proxy.hostname, port: proxy.port || 80, method: 'CONNECT', path: target, headers: { host: target, ...auth } });
    creq.setTimeout(60000, () => creq.destroy(new Error(`timeout connecting to proxy for ${u.hostname}`)));
    creq.on('error', reject);
    creq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new FetchError(`${u.hostname}: the network proxy refused the connection (HTTP ${res.statusCode}) - host not allowed by this environment's network policy`, { status: res.statusCode, blocked: res.statusCode === 403 || res.statusCode === 407 }));
        return;
      }
      const tlsSock = tls.connect({ socket, servername: u.hostname, ALPNProtocols: ['http/1.1'] });
      tlsSock.on('error', reject);
      const req = https.request({ ...opts, createConnection: () => tlsSock, agent: false }, resolve);
      req.on('error', reject);
      req.setTimeout(120000, () => req.destroy(new Error(`timeout talking to ${u.hostname}`)));
      req.end();
    });
    creq.end();
  });
}

/** GET with redirects; returns { res, url } for a 2xx response. */
async function get(url, headers = {}) {
  for (let hop = 0; hop < 8; hop++) {
    const res = await getOnce(url, headers);
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
      res.resume();
      url = new URL(res.headers.location, url).href;
      continue;
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return { res, url };
    res.resume();
    throw new FetchError(`HTTP ${res.statusCode} for ${url}`, { status: res.statusCode, notFound: res.statusCode === 404 });
  }
  throw new FetchError(`too many redirects for ${url}`);
}

async function getBuffer(url) {
  const { res } = await get(url);
  const parts = [];
  for await (const c of res) parts.push(c);
  return Buffer.concat(parts);
}
async function getJson(url) { return JSON.parse((await getBuffer(url)).toString('utf8')); }

// ---------------------------------------------------------------- files --
const sha256File = (file) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(file).on('error', reject).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex')));
});
const md5File = (file) => new Promise((resolve, reject) => {
  const h = crypto.createHash('md5');
  fs.createReadStream(file).on('error', reject).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex')));
});
const fmtMB = (n) => (n == null ? '?' : (n / 1e6).toFixed(n < 1e7 ? 2 : 1) + ' MB');

/**
 * Download url to `part` (resuming), then return its sha256. Expected size (if
 * known) lets a complete .part be recognised without a request.
 */
async function download(url, part, { expectBytes, label, log, stats }) {
  fs.mkdirSync(path.dirname(part), { recursive: true });
  let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
  if (expectBytes != null && have > expectBytes) { fs.rmSync(part); have = 0; }
  if (expectBytes == null || have < expectBytes) {
    const headers = have > 0 ? { range: `bytes=${have}-` } : {};
    const { res } = await get(url, headers);
    let append = have > 0 && res.statusCode === 206;
    if (have > 0 && !append) { log(`  ${label}: server ignored the resume request, starting over`); have = 0; }
    const len = Number(res.headers['content-length']) || 0;
    const total = res.headers['content-range'] ? Number(String(res.headers['content-range']).split('/')[1]) || null
      : len ? len + (append ? have : 0) : null;
    const out = fs.createWriteStream(part, { flags: append ? 'a' : 'w' });
    let got = have, lastLog = Date.now();
    await new Promise((resolve, reject) => {
      res.on('data', (c) => {
        got += c.length;
        if (Date.now() - lastLog > 15000 && total) { lastLog = Date.now(); log(`  ${label}: ${(100 * got / total).toFixed(0)}% of ${fmtMB(total)}`); }
      });
      res.on('error', reject);
      out.on('error', reject);
      out.on('finish', resolve);
      res.pipe(out);
    });
    if (stats) { stats.fetched = (stats.fetched || 0) + (got - have); if (have) stats.resumed = (stats.resumed || 0) + 1; }
    if (total && got !== total) throw new FetchError(`${label}: connection ended after ${got} of ${total} bytes (run again to resume)`);
  }
  return sha256File(part);
}

// tar (ustar/GNU/pax, regular files only) and zip (store/deflate) readers
export function tarMember(buf, member) {
  let off = 0, longName = null;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const str = (a, b) => h.subarray(a, b).toString('utf8').replace(/\0.*$/s, '');
    let name = str(0, 100);
    const prefix = h.subarray(257, 263).toString('latin1').startsWith('ustar') ? str(345, 500) : '';
    if (prefix) name = prefix + '/' + name;
    const size = parseInt(str(124, 136).trim() || '0', 8);
    const type = String.fromCharCode(h[156] || 48);
    const data = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = data.toString('utf8').replace(/\0.*$/s, ''); continue; }
    if (type === 'x' || type === 'g') continue;
    if (longName) { name = longName; longName = null; }
    if ((type === '0' || type === '\0') && name.replace(/^\.\//, '') === member) return Buffer.from(data);
  }
  return null;
}
export function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file (no end-of-central-directory record)');
  const n = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('corrupt zip central directory');
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20), usize = buf.readUInt32LE(off + 24);
    const nl = buf.readUInt16LE(off + 28), xl = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32), lho = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + nl).toString('utf8');
    off += 46 + nl + xl + cl;
    out.push({ name, read() {
      const lnl = buf.readUInt16LE(lho + 26), lxl = buf.readUInt16LE(lho + 28);
      const d = buf.subarray(lho + 30 + lnl + lxl, lho + 30 + lnl + lxl + csize);
      const data = method === 0 ? Buffer.from(d) : method === 8 ? zlib.inflateRawSync(d) : null;
      if (!data) throw new Error(`zip entry ${name}: unsupported compression method ${method}`);
      if (data.length !== usize) throw new Error(`zip entry ${name}: size mismatch`);
      return data;
    } });
  }
  return out;
}

// ------------------------------------------------------------ resolvers --
// Entries with a "resolve" block (status "blocked" when the manifest was
// written) are turned into a concrete file list at fetch time, using the
// provider's own API. Poly Haven's API gives md5 + size for every file.
const PH_API = 'https://api.polyhaven.com';
export async function resolvePolyHaven(a, json = getJson) {
  const r = a.resolve;
  const files = await json(`${PH_API}/files/${encodeURIComponent(r.asset)}`);
  let info = null;
  try { info = await json(`${PH_API}/info/${encodeURIComponent(r.asset)}`); } catch { /* optional */ }
  const dir = a.id;
  const out = [], maps = {};
  const pick = (node, res, fmts) => { for (const f of fmts) if (node?.[res]?.[f]) return { f, e: node[res][f] }; return null; };
  if (r.type === 'hdris') {
    const p = pick(files.hdri, r.res, [r.format, 'hdr', 'exr']);
    if (!p) throw new FetchError(`Poly Haven ${r.asset}: no ${r.res} hdri`, { notFound: true });
    out.push({ path: `${dir}/${r.asset}_${r.res}.${p.f}`, url: p.e.url, md5: p.e.md5, bytes: p.e.size });
  } else if (r.type === 'textures') {
    for (const [role, key] of Object.entries(r.maps)) {
      const node = files[key] || (key === 'nor_gl' ? files['nor_gl'] : null);
      const p = pick(node, r.res, [r.format, 'png', 'jpg', 'exr']);
      if (!p) continue;                         // e.g. not every set has AO
      const name = path.basename(new URL(p.e.url).pathname);
      out.push({ path: `${dir}/${name}`, url: p.e.url, md5: p.e.md5, bytes: p.e.size });
      maps[role] = `${dir}/${name}`;
    }
    if (!maps.albedo) throw new FetchError(`Poly Haven ${r.asset}: no ${r.res} diffuse map`, { notFound: true });
  } else if (r.type === 'models') {
    const p = pick(files.gltf, r.res, ['gltf']);
    if (!p) throw new FetchError(`Poly Haven ${r.asset}: no ${r.res} glTF`, { notFound: true });
    const name = path.basename(new URL(p.e.url).pathname);
    out.push({ path: `${dir}/${name}`, url: p.e.url, md5: p.e.md5, bytes: p.e.size });
    for (const [rel, inc] of Object.entries(p.e.include || {})) {
      const clean = path.posix.normalize(rel);
      if (clean.startsWith('..') || path.posix.isAbsolute(clean)) throw new Error(`Poly Haven ${r.asset}: unsafe include path ${rel}`);
      out.push({ path: `${dir}/${clean}`, url: inc.url, md5: inc.md5, bytes: inc.size });
    }
    maps.entry = `${dir}/${name}`;
  }
  const params = { ...(a.params || {}) };
  if (r.type === 'textures') { params.maps = maps; params.normal_convention = 'gl'; }
  if (r.type === 'models') params.entry = maps.entry;
  if (info?.dimensions && r.type === 'textures') { params.tile_m = +(Math.max(...info.dimensions) / 1000).toFixed(3); params.tile_m_note = 'Poly Haven API dimensions'; }
  const author = info?.authors ? Object.keys(info.authors).join(', ') : null;
  return { files: out, params, author };
}

async function resolveAmbientCG(a, ctx) {
  const r = a.resolve;
  const zipPart = path.join(ctx.cache, 'archives', `${r.asset}_${r.attribute}.zip`);
  const sha = await download(r.url, zipPart + '.part', { expectBytes: r.bytes, label: `${a.id} (zip)`, log: ctx.log, stats: ctx.stats });
  fs.renameSync(zipPart + '.part', zipPart);
  const zip = zipEntries(fs.readFileSync(zipPart));
  const out = [], maps = {};
  for (const [role, suffix] of Object.entries(r.maps)) {
    const e = zip.find((z) => new RegExp(`${suffix}\\.(jpg|png)$`, 'i').test(z.name) && !z.name.includes('/'));
    if (!e) continue;
    out.push({ path: `${a.id}/${e.name}`, url: r.url, archive: { format: 'zip', member: e.name, sha256: sha, bytes: r.bytes } });
    maps[role] = `${a.id}/${e.name}`;
  }
  if (!maps.albedo) throw new FetchError(`ambientCG ${r.asset}: zip has no colour map`);
  return { files: out, params: { ...(a.params || {}), maps, normal_convention: 'gl' }, zipPath: zipPart };
}

// ------------------------------------------------------------------ main --
async function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.help) { const lines = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1); console.log(lines.slice(0, lines.findIndex((l) => !l.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); return 0; }
  const manifestPath = path.join(HERE, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const root = opt.dir;
  const cache = path.join(root, '.cache');
  const statePath = path.join(root, '.fetch-state.json');
  let state = {};
  try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { /* first run */ }
  const log = (s) => console.log(s);

  if (opt.credits) { writeCredits(manifest, path.join(HERE, 'CREDITS.md')); log('wrote CREDITS.md'); return 0; }

  let selected = manifest.assets.filter((a) =>
    (!opt.only.length || opt.only.some((s) => a.id.includes(s))) &&
    (!opt.sets.length || opt.sets.some((s) => (a.sets || []).includes(s))) &&
    (!opt.kinds.length || opt.kinds.includes(a.kind)));
  if (!selected.length) { log('nothing selected'); return 1; }

  if (opt.discover) return discover(selected, log);

  const results = new Map();       // id -> { ok, blocked, error, files, bytes, downloaded }
  let locked = 0;
  const ctx = { cache, log };

  // one asset at a time per job slot; files of an asset in order
  const queue = [...selected];
  const worker = async () => {
    for (let a = queue.shift(); a; a = queue.shift()) {
      const r = { ok: false, blocked: false, error: null, files: 0, bytes: 0, fetched: 0, resumed: 0 };
      results.set(a.id, r);
      try {
        let files = a.files || [], params = a.params || {}, author = null, zipPath = null;
        if (!files.length && a.resolve) {
          if (opt.dryRun) { log(`dry  ${a.id}: would resolve via ${a.resolve.provider} (${a.status})`); r.ok = true; continue; }
          const res = a.resolve.provider === 'polyhaven' ? await resolvePolyHaven(a) : a.resolve.provider === 'ambientcg' ? await resolveAmbientCG(a, { ...ctx, stats: r }) : null;
          if (!res) throw new Error(`unknown provider ${a.resolve.provider}`);
          ({ files, params } = res); author = res.author; zipPath = res.zipPath;
        }
        const archives = new Map();     // archive url -> local path (downloaded once per run)
        for (const f of files) {
          const dest = path.join(root, f.path);
          if (!dest.startsWith(root + path.sep)) throw new Error(`unsafe path ${f.path}`);
          r.files++;
          // 1) already there and verified?
          if (fs.existsSync(dest)) {
            const st = fs.statSync(dest), key = `${st.size}:${Math.floor(st.mtimeMs)}`;
            let sha = !opt.verify && state[f.path]?.key === key ? state[f.path].sha256 : null;
            if (!sha) { sha = await sha256File(dest); state[f.path] = { key, sha256: sha }; }
            const md5ok = !f.sha256 && f.md5 ? (await md5File(dest)) === f.md5 : true;
            if ((f.sha256 ? sha === f.sha256 : md5ok) && (f.bytes == null || f.bytes === st.size)) {
              r.bytes += st.size;
              if (!f.sha256) { f.sha256 = sha; f.bytes = st.size; f._new = true; }
              continue;
            }
            log(`  ${f.path}: on disk but ${f.sha256 ? 'sha256 differs' : 'md5 differs'} - fetching again`);
          }
          if (opt.dryRun) { log(`dry  ${f.path}  <- ${f.url}${f.archive ? ` [${f.archive.member} in ${f.archive.format}]` : ''}  ${fmtMB(f.bytes)}`); continue; }
          // 2) fetch (directly, or via its archive)
          let data = null, tmp = null;
          if (f.archive) {
            let arch = archives.get(f.url) || zipPath;
            if (!arch || !fs.existsSync(arch)) {
              const name = crypto.createHash('sha1').update(f.url).digest('hex').slice(0, 16) + '_' + path.basename(new URL(f.url).pathname);
              arch = path.join(cache, 'archives', name);
              if (!fs.existsSync(arch)) {
                const asha = await download(f.url, arch + '.part', { expectBytes: f.archive.bytes ?? null, label: `${f.path} (archive)`, log, stats: r });
                if (f.archive.sha256 && asha !== f.archive.sha256) { fs.rmSync(arch + '.part'); throw new Error(`${f.path}: archive sha256 mismatch (expected ${f.archive.sha256.slice(0, 12)}, got ${asha.slice(0, 12)})`); }
                if (!f.archive.sha256) { f.archive.sha256 = asha; f.archive.bytes = fs.statSync(arch + '.part').size; f._new = true; }
                fs.renameSync(arch + '.part', arch);
              }
              archives.set(f.url, arch);
            }
            const buf = fs.readFileSync(arch);
            if (f.archive.format === 'tar.gz') data = tarMember(zlib.gunzipSync(buf), f.archive.member);
            else if (f.archive.format === 'zip') data = zipEntries(buf).find((z) => z.name === f.archive.member)?.read() ?? null;
            if (!data) throw new Error(`${f.path}: ${f.archive.member} not found in ${f.url}`);
            tmp = dest + '.tmp';
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(tmp, data);
          } else {
            const part = path.join(cache, 'parts', f.path.replace(/[\\/]/g, '__') + '.part');
            await download(f.url, part, { expectBytes: f.bytes ?? null, label: f.path, log, stats: r });
            tmp = part;
          }
          const sha = await sha256File(tmp), size = fs.statSync(tmp).size;
          if (f.sha256 && sha !== f.sha256) { fs.rmSync(tmp); throw new Error(`${f.path}: sha256 mismatch (expected ${f.sha256.slice(0, 12)}..., got ${sha.slice(0, 12)}...) - source changed or download damaged`); }
          if (!f.sha256 && f.md5 && (await md5File(tmp)) !== f.md5) { fs.rmSync(tmp); throw new Error(`${f.path}: md5 mismatch against the provider's API`); }
          if (!f.sha256) { f.sha256 = sha; f.bytes = size; f._new = true; }
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.renameSync(tmp, dest);
          const st = fs.statSync(dest);
          state[f.path] = { key: `${st.size}:${Math.floor(st.mtimeMs)}`, sha256: sha };
          r.bytes += size;
          log(`ok   ${f.path}  ${fmtMB(size)}`);
        }
        if (!opt.keepArchives) for (const arch of [...archives.values(), zipPath].filter(Boolean)) fs.rmSync(arch, { force: true });
        if (!opt.dryRun) {
          writeSidecar(root, a, files, params, author);
          if (opt.lock && files.some((f) => f._new)) {
            a.files = files.map(({ _new, ...f }) => f);
            if (a.resolve) { a.params = params; if (author) a.author = author; a.status = 'available'; }
            locked++;
          }
        }
        r.ok = true;
      } catch (e) {
        r.error = e.message; r.blocked = !!e.blocked;
        log(`${e.blocked ? 'BLOCKED' : e.notFound ? 'MISSING' : 'FAIL'} ${a.id}: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opt.jobs, queue.length) }, worker));

  if (!opt.dryRun) {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 1));
  }
  if (opt.lock && locked) {
    for (const a of manifest.assets) for (const f of a.files || []) delete f._new;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
    log(`locked ${locked} asset(s) in manifest.json`);
  } else if (!opt.lock && !opt.dryRun && [...selected].some((a) => (a.files || []).some((f) => f._new) || (a.resolve && results.get(a.id)?.ok && !a.files?.length))) {
    log('note: some files are not locked in manifest.json yet - run again with --lock to record their sha256');
  }

  // summary
  const all = [...results.entries()];
  const ok = all.filter(([, r]) => r.ok), blocked = all.filter(([, r]) => !r.ok && r.blocked), failed = all.filter(([, r]) => !r.ok && !r.blocked);
  const bytes = ok.reduce((s, [, r]) => s + r.bytes, 0), dl = all.reduce((s, [, r]) => s + r.fetched, 0), resumed = all.reduce((s, [, r]) => s + r.resumed, 0);
  log(`\n${ok.length} ok (${fmtMB(bytes)} on disk, ${fmtMB(dl)} downloaded this run${resumed ? `, ${resumed} download(s) resumed` : ''}), ${blocked.length} blocked by network policy, ${failed.length} failed`);
  const failedAvailable = failed.filter(([id]) => manifest.assets.find((a) => a.id === id)?.status === 'available');
  const blockedAvailable = blocked.filter(([id]) => manifest.assets.find((a) => a.id === id)?.status === 'available');
  if (blocked.length) {
    const hosts = new Set(blocked.map(([, r]) => (r.error.match(/^([\w.-]+):/) || [])[1]).filter(Boolean));
    log(`blocked hosts: ${[...hosts].join(', ')} - allow them in the environment's network settings, then run this again (see README.md)`);
  }
  if (failedAvailable.length || blockedAvailable.length) return 1;
  if (opt.strict && (failed.length || blocked.length)) return 1;
  return 0;
}

/** <root>/<asset id>/asset.json: what scenes/lib/assets.js reads (only the assets a scene uses). */
function writeSidecar(root, a, files, params, author) {
  const side = {
    id: a.id, kind: a.kind, title: a.title, license: a.license, author: author || a.author,
    source: a.origin?.url, params,
    files: files.map((f) => ({ path: f.path, sha256: f.sha256, bytes: f.bytes })),
  };
  const p = path.join(root, a.id, 'asset.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const text = JSON.stringify(side, null, 1) + '\n';
  if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== text) fs.writeFileSync(p, text);
}

async function discover(selected, log) {
  const ph = selected.filter((a) => a.resolve?.provider === 'polyhaven');
  if (!ph.length) { log('no Poly Haven entries selected'); return 0; }
  const cat = {};
  for (const t of ['hdris', 'textures', 'models']) cat[t] = await getJson(`${PH_API}/assets?t=${t}`);
  let missing = 0;
  for (const a of ph) {
    const ids = Object.keys(cat[a.resolve.type] || {});
    if (ids.includes(a.resolve.asset)) { log(`ok       ${a.id}: ${a.resolve.asset}`); continue; }
    missing++;
    const words = a.resolve.asset.toLowerCase().split(/[_\d]+/).filter((w) => w.length > 2);
    const near = ids.filter((i) => words.some((w) => i.toLowerCase().includes(w))).slice(0, 12);
    log(`MISSING  ${a.id}: "${a.resolve.asset}" is not a Poly Haven ${a.resolve.type} id; similar: ${near.join(', ') || '-'}`);
  }
  log(`${ph.length - missing} found, ${missing} to fix in manifest.json`);
  return missing ? 1 : 0;
}

function writeCredits(manifest, file) {
  const avail = manifest.assets.filter((a) => a.status === 'available');
  const by = {};
  for (const a of avail) (by[a.license] ||= []).push(a);
  let md = `# Asset credits\n\nGenerated by \`node assets-lib/fetch.mjs --credits\` from manifest.json (only assets with status "available").\n` +
    `CC0 assets need no credit, but crediting them is good practice. CC BY assets MUST be credited in the episode credits as written here.\n`;
  for (const lic of Object.keys(by).sort((x, y) => (x === 'CC0-1.0' ? 1 : 0) - (y === 'CC0-1.0' ? 1 : 0))) {
    md += `\n## ${lic}${lic.startsWith('CC-BY') ? ' (attribution required)' : ''}\n\n`;
    for (const a of by[lic].sort((x, y) => x.id.localeCompare(y.id))) {
      md += `- **${a.title}** - ${a.author}. Source: ${a.origin?.url}${a.via ? `; downloaded from ${a.via}` : ''}.${a.license_note && lic.startsWith('CC-BY') ? ` ${a.license_note}` : ''}\n`;
    }
  }
  fs.writeFileSync(file, md);
}

// run only when executed (importing the module for tests does not start a download)
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().then((code) => process.exit(code), (e) => { console.error('fetch.mjs:', e.message); process.exit(2); });
}
