// Tiny local HTTP server (node:http only).
//  GET  /                       -> runtime page (import map: three, three/addons/, dk/)
//  GET  /runtime/...            -> dragons-kingdom/runtime/
//  GET  /three/...              -> node_modules/three/
//  GET  /fs/<absolute path>     -> scene files (restricted to allowed roots)
//  WS   /ws/<sink>              -> binary WebSocket: the page sends frames, we ack them
//
// Every file served from /, /runtime/ and /fs/ is remembered (servedFiles()):
// the job fingerprint hashes exactly the files the scene really loaded -
// modules, JSON, textures, models - so editing any of them is detected.
//
// Snapshots: the first time such a file is served its bytes are kept in
// memory (and hashed), and every later request - from any worker, also from
// a browser restarted hours later - gets exactly those bytes. Editing a scene
// file while a job runs therefore cannot mix two versions into one video: the
// job keeps rendering the version it started with (and the fingerprint is the
// hash of the bytes the browsers really got). diskChanges() lists files whose
// content on disk no longer matches what was served (for a warning).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { PROJECT_ROOT } from './tools.mjs';

const MIME = {
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream', '.bin': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.wasm': 'application/wasm',
  '.ktx2': 'image/ktx2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.txt': 'text/plain',
};

function threeRoot() {
  const req = createRequire(path.join(PROJECT_ROOT, 'package.json'));
  let dir;
  try { dir = path.dirname(req.resolve('three')); } catch {
    throw new Error('three.js is not installed: run "npm install" inside dragons-kingdom');
  }
  while (dir !== path.dirname(dir)) {
    const pj = path.join(dir, 'package.json');
    if (fs.existsSync(pj) && JSON.parse(fs.readFileSync(pj, 'utf8')).name === 'three') return dir;
    dir = path.dirname(dir);
  }
  throw new Error('could not locate the three package root');
}

function inside(root, p) {
  const rel = path.relative(root, p);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// ------------------------------------------------------------ WebSocket ----
// Just enough of RFC 6455 for one job: a browser sends (possibly fragmented)
// binary messages, we send short text messages. No extensions, no compression.
// Files above this size are not kept in memory (see "Snapshots" above).
const SNAPSHOT_MAX_BYTES = Number(process.env.DK_SNAPSHOT_MAX_MB || 512) * 1048576;

function hashStream(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    fs.createReadStream(file).on('error', reject).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex')));
  });
}

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 1 << 30;
const LE = os.endianness() === 'LE';

/** XOR-unmask buf in place (mask: 4 bytes). Word-wise when aligned. */
function unmask(buf, mask) {
  const n = buf.length;
  let i = 0;
  if (LE && n >= 16 && (buf.byteOffset & 3) === 0) {
    const words = n >>> 2;
    const u32 = new Uint32Array(buf.buffer, buf.byteOffset, words);
    const m = mask.readUInt32LE(0);
    for (let w = 0; w < words; w++) u32[w] ^= m;
    i = words << 2;
  }
  for (; i < n; i++) buf[i] ^= mask[i & 3];
}

function wsFrame(opcode, payload) {
  const len = payload.length;
  let h;
  if (len < 126) { h = Buffer.allocUnsafe(2); h[1] = len; }
  else if (len < 65536) { h = Buffer.allocUnsafe(4); h[1] = 126; h.writeUInt16BE(len, 2); }
  else { h = Buffer.allocUnsafe(10); h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
  h[0] = 0x80 | opcode;
  return Buffer.concat([h, payload]);
}

/** Incremental frame parser. onMessage(Buffer, isText) gets every complete binary/text message. */
class WsConnection {
  constructor(socket, { onMessage, onClose }) {
    this.socket = socket;
    this.onMessage = onMessage;
    this.queue = [];          // received, not yet consumed chunks
    this.queued = 0;
    this.frame = null;        // current frame being filled { fin, opcode, mask, buf, got }
    this.fragments = null;    // payloads of a fragmented message
    this.closed = false;
    socket.on('data', (d) => this.feed(d));
    socket.on('error', () => {});
    socket.on('close', () => { this.closed = true; onClose?.(); });
  }
  send(text) { if (!this.closed) this.socket.write(wsFrame(0x1, Buffer.from(text))); }
  close(code = 1000, reason = '') {
    if (this.closed) return;
    const p = Buffer.alloc(2 + Buffer.byteLength(reason));
    p.writeUInt16BE(code, 0); p.write(reason, 2);
    try { this.socket.end(wsFrame(0x8, p)); } catch {}
    this.closed = true;
  }
  destroy() { this.closed = true; this.socket.destroy(); }
  peek(n) {      // first n bytes (n <= 14: a frame header), copying only what is needed
    if (this.queue[0].length >= n) return this.queue[0];
    const parts = [];
    let have = 0;
    for (const c of this.queue) { parts.push(c); have += c.length; if (have >= n) break; }
    return Buffer.concat(parts, have).subarray(0, n);
  }
  skip(n) {
    this.queued -= n;
    while (n > 0) {
      const c = this.queue[0];
      if (c.length <= n) { this.queue.shift(); n -= c.length; } else { this.queue[0] = c.subarray(n); n = 0; }
    }
  }
  feed(chunk) {
    this.queue.push(chunk); this.queued += chunk.length;
    try { this.process(); } catch (e) { this.close(1002, String(e.message).slice(0, 100)); this.destroy(); }
  }
  process() {
    for (;;) {
      if (!this.frame) {
        if (this.queued < 2) return;
        let h = this.peek(2);
        const fin = (h[0] & 0x80) !== 0, opcode = h[0] & 0x0f, masked = (h[1] & 0x80) !== 0;
        let len = h[1] & 0x7f;
        const extra = len === 126 ? 2 : len === 127 ? 8 : 0;
        const hlen = 2 + extra + (masked ? 4 : 0);
        if (this.queued < hlen) return;
        h = this.peek(hlen);
        if (len === 126) len = h.readUInt16BE(2);
        else if (len === 127) len = Number(h.readBigUInt64BE(2));
        if (len > MAX_MESSAGE) throw new Error('message too large');
        const mask = masked ? Buffer.from(h.subarray(2 + extra, hlen)) : null;
        this.skip(hlen);
        this.frame = { fin, opcode, mask, buf: len >= 4096 ? Buffer.allocUnsafeSlow(len) : Buffer.alloc(len), got: 0 };
      }
      const f = this.frame;
      while (f.got < f.buf.length && this.queued) {
        const c = this.queue[0];
        const n = Math.min(c.length, f.buf.length - f.got);
        c.copy(f.buf, f.got, 0, n);
        f.got += n;
        this.skip(n);
      }
      if (f.got < f.buf.length) return;
      this.frame = null;
      if (f.mask) unmask(f.buf, f.mask);
      this.handleFrame(f);
    }
  }
  handleFrame(f) {
    switch (f.opcode) {
      case 0x0:   // continuation
        if (!this.fragments) throw new Error('unexpected continuation frame');
        this.fragments.push(f.buf);
        if (f.fin) { const m = Buffer.concat(this.fragments); this.fragments = null; this.onMessage(m, this.fragText); }
        return;
      case 0x1: case 0x2:
        if (f.fin) this.onMessage(f.buf, f.opcode === 0x1); else { this.fragments = [f.buf]; this.fragText = f.opcode === 0x1; }
        return;
      case 0x8:   // close: echo it
        this.close(f.buf.length >= 2 ? f.buf.readUInt16BE(0) : 1000);
        return;
      case 0x9:   // ping
        if (!this.closed) this.socket.write(wsFrame(0xA, f.buf));
        return;
      case 0xA: return;   // pong
      default: throw new Error(`bad opcode ${f.opcode}`);
    }
  }
}

export async function startServer({ allowRoots = [] } = {}) {
  const roots = {
    runtime: path.join(PROJECT_ROOT, 'runtime'),
    three: threeRoot(),
  };
  const fsRoots = [PROJECT_ROOT, ...allowRoots].map((r) => path.resolve(r));
  const sinks = new Map();
  const sockets = new Map();    // sink id -> Set<WsConnection>
  // absolute path -> Promise<{ buf (null for huge files), sha1, size, stat }>
  const snapshots = new Map();
  const conflicts = [];         // huge files that changed on disk after they were first served

  const headers = (file, size) => ({
    'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  const statKey = (st) => `${st.size}:${st.mtimeMs}:${st.ino}`;
  const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

  /** Snapshot of a tracked file: taken once, on first request. */
  function snapshotOf(file) {
    let p = snapshots.get(file);
    if (!p) {
      p = fs.promises.stat(file).then(async (st) => {
        if (!st.isFile()) return null;
        if (st.size > SNAPSHOT_MAX_BYTES) {        // too big to keep: hash it, re-check on every later request
          const h = await hashStream(file);
          return { buf: null, sha1: h, size: st.size, stat: statKey(st) };
        }
        const buf = await fs.promises.readFile(file);
        return { buf, sha1: sha1(buf), size: buf.length, stat: statKey(st) };
      }).catch(() => null);
      snapshots.set(file, p);
      p.then((s) => { if (!s) snapshots.delete(file); });   // missing now: may appear later
    }
    return p;
  }

  function sendFile(res, file, track = true) {
    if (!track) {
      fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, headers(file, st.size));
        fs.createReadStream(file).pipe(res);
      });
      return;
    }
    snapshotOf(file).then(async (snap) => {
      if (!snap) { res.writeHead(404); res.end('not found'); return; }
      if (snap.buf) { res.writeHead(200, headers(file, snap.size)); res.end(snap.buf); return; }
      // huge file: serve from disk only while it is still the same file
      const st = await fs.promises.stat(file).catch(() => null);
      const same = st && (statKey(st) === snap.stat || (await hashStream(file).catch(() => null)) === snap.sha1);
      if (!same) {
        if (!conflicts.includes(file)) conflicts.push(file);
        res.writeHead(409); res.end('file changed on disk while rendering'); return;
      }
      res.writeHead(200, headers(file, snap.size));
      fs.createReadStream(file).pipe(res);
    }, () => { res.writeHead(500); res.end('read error'); });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); req.resume(); return; }
    if (p === '/' || p === '/index.html') return sendFile(res, path.join(roots.runtime, 'page.html'));
    if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    for (const [prefix, root, track] of [['/runtime/', roots.runtime, true], ['/three/', roots.three, false]]) {
      if (p.startsWith(prefix)) {
        const f = path.resolve(root, '.' + p.slice(prefix.length - 1));
        if (!inside(root, f)) break;
        return sendFile(res, f, track);
      }
    }
    if (p.startsWith('/fs/')) {
      const f = path.resolve('/' + p.slice(4));
      if (fsRoots.some((r) => inside(r, f))) return sendFile(res, f);
      res.writeHead(403); res.end('outside allowed roots'); return;
    }
    res.writeHead(404); res.end('not found');
  });

  // Frame transport: ws://.../ws/<sink id>. Binary message = [uint32 LE frame][bytes].
// Text message {"hb": n, "of": total} = heartbeat during a chunk-warmup replay.
  // The ack {"f": frame} is sent only once the sink accepted the frame (for an
  // encoder sink: once it is in ffmpeg's stdin) - the page keeps at most
  // maxInFlight frames un-acked, so that is end-to-end backpressure.
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    const m = /^\/ws\/([\w-]+)$/.exec(url.pathname);
    const key = req.headers['sec-websocket-key'];
    if (!m || !key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
    const sid = m[1];
    const sink = sinks.get(sid);
    if (!sink) { socket.end('HTTP/1.1 404 Not Found\r\n\r\n'); return; }
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.setNoDelay(true);
    const conn = new WsConnection(socket, {
      onMessage(msg, isText) {
        if (isText) {      // {"hb": done, "of": total}: the page is alive (long chunk-warmup replay)
          let m = null;
          try { m = JSON.parse(msg.toString('utf8')); } catch {}
          if (m && m.hb !== undefined) sinks.get(sid)?.onHeartbeat?.(m);
          return;
        }
        if (msg.length < 4) return;
        const frame = msg.readUInt32LE(0);
        const s = sinks.get(sid);
        if (!s) { conn.send(JSON.stringify({ f: frame, e: `no sink ${sid}` })); return; }
        Promise.resolve()
          .then(() => s.push(frame, msg.subarray(4)))
          .then(() => conn.send(JSON.stringify({ f: frame })))
          .catch((e) => conn.send(JSON.stringify({ f: frame, e: String(e?.message || e) })));
      },
      onClose() { sockets.get(sid)?.delete(conn); },
    });
    if (!sockets.has(sid)) sockets.set(sid, new Set());
    sockets.get(sid).add(conn);
    if (head && head.length) conn.feed(head);
  });
  server.keepAliveTimeout = 120000;
  server.requestTimeout = 0;
  server.headersTimeout = 0;

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  return {
    base,
    pageUrl: `${base}/`,
    fileUrl: (abs) => `${base}/fs${path.resolve(abs).split(path.sep).map(encodeURIComponent).join('/')}`,
    /** Register a frame sink; returns the WebSocket URL the page sends frames to. */
    addSink(id, sink) { sinks.set(id, sink); return `ws://127.0.0.1:${port}/ws/${id}`; },
    removeSink(id) {
      sinks.delete(id);
      for (const c of sockets.get(id) || []) c.destroy();   // a page still sending gets an error at once
      sockets.delete(id);
    },
    /** Absolute paths of every runtime / scene file served so far. */
    servedFiles: () => [...snapshots.keys()],
    /** { absolute path: sha1 } of the bytes actually served (every file served so far). */
    async servedHashes() {
      const out = {};
      for (const [f, p] of [...snapshots]) { const s = await p; if (s) out[f] = s.sha1; }
      return out;
    },
    /**
     * Served files whose content on disk differs now from what was served
     * (edited, replaced or deleted while rendering). Files whose size/mtime
     * did not change are not read again.
     */
    async diskChanges() {
      const out = [...conflicts];
      for (const [f, p] of [...snapshots]) {
        const s = await p;
        if (!s || out.includes(f)) continue;
        const st = await fs.promises.stat(f).catch(() => null);
        if (!st) { out.push(f); continue; }
        const k = statKey(st);
        if (k === s.stat) continue;
        const h = await hashStream(f).catch(() => null);
        if (h !== s.sha1) out.push(f); else s.stat = k;   // touched, same bytes
      }
      return out;
    },
    close: () => new Promise((r) => {
      for (const set of sockets.values()) for (const c of set) c.destroy();
      sockets.clear();
      server.closeAllConnections?.();
      server.close(() => r());
    }),
  };
}
