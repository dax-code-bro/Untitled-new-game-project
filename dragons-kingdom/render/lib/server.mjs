// Tiny local HTTP server (node:http only).
//  GET  /                       -> runtime page (import map: three, three/addons/, dk/)
//  GET  /runtime/...            -> dragons-kingdom/runtime/
//  GET  /three/...              -> node_modules/three/
//  GET  /fs/<absolute path>     -> scene files (restricted to allowed roots)
//  POST /frame/<session>/<n>    -> raw frame bytes for a registered sink
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
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

export async function startServer({ allowRoots = [] } = {}) {
  const roots = {
    runtime: path.join(PROJECT_ROOT, 'runtime'),
    three: threeRoot(),
  };
  const fsRoots = [PROJECT_ROOT, ...allowRoots].map((r) => path.resolve(r));
  const sinks = new Map();

  function sendFile(res, file) {
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'content-length': st.size,
        'cache-control': 'no-store',
      });
      fs.createReadStream(file).pipe(res);
    });
  }

  function handleFrame(req, res, sid, n) {
    const sink = sinks.get(sid);
    if (!sink) { res.writeHead(404); res.end(`no sink ${sid}`); req.resume(); return; }
    const parts = [];
    let size = 0;
    req.on('data', (c) => { parts.push(c); size += c.length; });
    req.on('error', () => {});
    req.on('end', () => {
      const buf = parts.length === 1 ? parts[0] : Buffer.concat(parts, size);
      Promise.resolve()
        .then(() => sink.push(n, buf))
        .then(() => { res.writeHead(204); res.end(); })
        .catch((e) => { res.writeHead(500); res.end(String(e?.message || e)); });
    });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    if (req.method === 'POST') {
      const m = /^\/frame\/([\w-]+)\/(\d+)$/.exec(p);
      if (m) return handleFrame(req, res, m[1], +m[2]);
      res.writeHead(404); res.end(); req.resume(); return;
    }
    if (p === '/' || p === '/index.html') return sendFile(res, path.join(roots.runtime, 'page.html'));
    if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    for (const [prefix, root] of [['/runtime/', roots.runtime], ['/three/', roots.three]]) {
      if (p.startsWith(prefix)) {
        const f = path.resolve(root, '.' + p.slice(prefix.length - 1));
        if (!inside(root, f)) break;
        return sendFile(res, f);
      }
    }
    if (p.startsWith('/fs/')) {
      const f = path.resolve('/' + p.slice(4));
      if (fsRoots.some((r) => inside(r, f))) return sendFile(res, f);
      res.writeHead(403); res.end('outside allowed roots'); return;
    }
    res.writeHead(404); res.end('not found');
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
    addSink(id, sink) { sinks.set(id, sink); return `${base}/frame/${id}`; },
    removeSink(id) { sinks.delete(id); },
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}
