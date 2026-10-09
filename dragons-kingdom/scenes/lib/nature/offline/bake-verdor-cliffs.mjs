// Offline bake 2/2 for the Verdor coast: the 3D cliff band (cliffs, notches, ledges, caves, geos,
// the arch, stacks and the outer rocks, the wave-cut platform, talus, the beach), meshed from the
// world's SDF (verdor-world.js) in 32 m tiles at several levels of detail.
//
//   node scenes/lib/nature/offline/bake-verdor-cliffs.mjs [--workers 3] [--lods 0,1,2,3]
//        [--region x0,z0,x1,z1]   (only tiles touching this box; for tests)
//
// Needs cache/verdor/land.dkhm first (bake-verdor-land.mjs). Writes cache/verdor/tiles/L<lod>/<tx>_<tz>.dktl
// and cache/verdor/cliffs.json (the tile index the runtime reads). Everything is deterministic: the
// same code always produces the same bytes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createVerdorWorld, VERDOR } from '../verdor-world.js';
import { decodeHeightmap, heightSampler } from '../heightmap.js';
import { meshTile } from './mesher.mjs';
import { encodeTile } from '../tiles.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '..', 'cache', 'verdor');
export const LODS = [
  { h: 0.5, apron: 3, coarse: 4, ao: [0.5, 1.3, 3.2, 7.5] },
  { h: 1.0, apron: 2, coarse: 2, ao: [1.0, 2.5, 6, 12] },
  { h: 2.0, apron: 1, coarse: 1, ao: [2, 5, 12] },
  { h: 4.0, apron: 1, coarse: 1, ao: [4, 10, 20] },
];

function makeWorld() {
  const W = createVerdorWorld();
  const hm = decodeHeightmap(fs.readFileSync(path.join(CACHE, 'land.dkhm')).buffer.slice(0));
  W.installLand(heightSampler(hm));
  return W;
}

if (isMainThread) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const nW = +arg('--workers', Math.max(1, Math.min(3, os.cpus().length - 1)));
  const lods = arg('--lods', '0,1,2,3').split(',').map(Number);
  const region = arg('--region', null)?.split(',').map(Number);
  if (!fs.existsSync(path.join(CACHE, 'land.dkhm'))) { console.error('run bake-verdor-land.mjs first (cache/verdor/land.dkhm missing)'); process.exit(1); }
  const t0 = Date.now();
  const W = makeWorld();
  const T = VERDOR.bake.tile;
  // tiles: every 32 m square near the coast line, the platform or a stack
  const tiles = [];
  const [Z0, Z1] = VERDOR.bake.z;
  for (let tz = Math.floor(Z0 / T); tz < Math.ceil(Z1 / T); tz++) {
    const z0 = tz * T;
    let xmin = Infinity, xmax = -Infinity;
    for (let s = 0; s <= 8; s++) { const z = z0 + (s / 8) * T; const xc = W.xc(z); xmin = Math.min(xmin, xc - 140); xmax = Math.max(xmax, xc + 140 + W.platWidth(z)); }
    for (const st of W.stacks) if (st.z > z0 - st.r - 40 && st.z < z0 + T + st.r + 40) xmax = Math.max(xmax, st.x + st.r + 40);
    for (let tx = Math.floor(xmin / T); tx <= Math.floor(xmax / T); tx++) {
      const x0 = tx * T;
      if (region && (x0 + T < region[0] || x0 > region[2] || z0 + T < region[1] || z0 > region[3])) continue;
      let keep = false, ylo = Infinity, yhi = -Infinity;
      for (let a = 0; a <= 8; a++) for (let b = 0; b <= 8; b++) {
        const x = x0 + (a / 8) * T, z = z0 + (b / 8) * T;
        const c = W.column(x, z);
        const nearStack = c.stacks.length > 0;
        if ((c.F > -55 && c.F < W.platWidth(z) + 28) || nearStack) keep = true;
        ylo = Math.min(ylo, c.floor, c.plat);
        yhi = Math.max(yhi, c.top, ...c.stacks.map((s) => s.top + 2));
      }
      if (!keep) continue;
      tiles.push({ tx, tz, x0, z0, size: T, ylo: Math.floor(ylo - 3), yhi: Math.ceil(Math.max(yhi, 4) + 3) });
    }
  }
  console.log(`[cliffs] ${tiles.length} tiles, LODs ${lods.join(',')}, ${nW} workers (enumerated in ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  const tasks = [];
  for (const L of lods) for (const t of tiles) tasks.push({ ...t, lod: L });
  // big tiles first (better packing)
  tasks.sort((a, b) => a.lod - b.lod || (b.yhi - b.ylo) - (a.yhi - a.ylo));
  for (const L of lods) fs.mkdirSync(path.join(CACHE, 'tiles', `L${L}`), { recursive: true });
  const results = new Map();
  let next = 0, doneN = 0;
  const report = () => { const el = (Date.now() - t0) / 1000; process.stdout.write(`\r[cliffs] ${doneN}/${tasks.length} tiles  ${el.toFixed(0)} s  ETA ${(el / Math.max(1, doneN) * (tasks.length - doneN)).toFixed(0)} s   `); };
  await new Promise((resolve, reject) => {
    let alive = 0;
    for (let w = 0; w < nW; w++) {
      const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { id: w } });
      alive++;
      const feed = () => { if (next < tasks.length) wk.postMessage(tasks[next++]); else wk.postMessage(null); };
      wk.on('message', (m) => { results.set(`${m.lod}:${m.tx}:${m.tz}`, m); doneN++; report(); feed(); });
      wk.on('error', reject);
      wk.on('exit', () => { if (--alive === 0) resolve(); });
      feed();
    }
  });
  process.stdout.write('\n');
  // the index (merged with an existing one when only a region / some LODs were baked)
  const idxFile = path.join(CACHE, 'cliffs.json');
  let index = { version: 1, seed: W.seed, tile: T, lods: LODS.map((l) => ({ h: l.h, apron: l.apron })), tiles: [] };
  if (fs.existsSync(idxFile) && (region || lods.length < LODS.length)) index = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
  const byKey = new Map(index.tiles.map((t) => [`${t.tx}:${t.tz}`, t]));
  let tv = 0, ti = 0;
  for (const t of tiles) {
    const key = `${t.tx}:${t.tz}`;
    const e = byKey.get(key) || { tx: t.tx, tz: t.tz, x0: t.x0, z0: t.z0, size: T, ylo: t.ylo, yhi: t.yhi, lods: {} };
    e.ylo = t.ylo; e.yhi = t.yhi;
    for (const L of lods) { const r = results.get(`${L}:${t.tx}:${t.tz}`); if (r) { e.lods[L] = { file: r.file, nv: r.nv, ni: r.ni, bbox: r.bbox }; tv += r.nv; ti += r.ni / 3; } }
    byKey.set(key, e);
  }
  index.tiles = [...byKey.values()].sort((a, b) => a.tz - b.tz || a.tx - b.tx);
  index.bakedAt = new Date().toISOString();
  fs.writeFileSync(idxFile, JSON.stringify(index));
  let bytes = 0; for (const r of results.values()) bytes += r.bytes;
  console.log(`[cliffs] ${tv} vertices, ${ti} triangles, ${(bytes / 1e6).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${idxFile}`);
} else {
  const W = makeWorld();
  parentPort.on('message', (t) => {
    if (!t) { process.exit(0); }
    const L = LODS[t.lod];
    const m = meshTile(W, { x0: t.x0, z0: t.z0, size: t.size, h: L.h, apron: L.apron, coarse: L.coarse, ylo: t.ylo, yhi: t.yhi, aoDistances: L.ao });
    const rel = `tiles/L${t.lod}/${t.tx}_${t.tz}.dktl`;
    const bin = encodeTile({ x0: t.x0, z0: t.z0, size: t.size, lod: t.lod }, m);
    fs.writeFileSync(path.join(CACHE, rel), bin);
    const nv = m.positions.length / 3;
    let bb = [0, 0, 0, 0, 0, 0];
    if (nv) { bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (let v = 0; v < nv; v++) for (let c = 0; c < 3; c++) { const p = m.positions[v * 3 + c]; bb[c] = Math.min(bb[c], p); bb[c + 3] = Math.max(bb[c + 3], p); } }
    parentPort.postMessage({ lod: t.lod, tx: t.tx, tz: t.tz, file: rel, nv, ni: m.indices.length, bytes: bin.length, evals: m.evals, bbox: bb.map((v) => +v.toFixed(2)) });
  });
}
