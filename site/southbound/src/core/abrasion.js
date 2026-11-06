// Material-agnostic abrasion: one wear generator for everything, whatever it's made of.
//
// Real wear follows the shape of a thing, not its material: corners and edges get knocked and
// rubbed, crevices and inside corners collect grime. What the wear *looks* like then depends on
// the substrate under the finish: painted steel chips to bright bare metal with rust in the
// cracks, bare steel polishes on its edges and holds dark oil in its joints, painted wood shows
// raw timber, plastic whitens where it's stressed, stone and concrete chip pale, leather polishes,
// fabric fades, rubber goes dusty grey, glass frosts.
//
// So the work is split the same way. Once per geometry, bakeEdges() finds its feature edges (where
// neighbouring faces meet at a real angle, convex or concave) and stores, per triangle corner, the
// exact distance to each of the triangle's edges that is one, in metres. The shader then knows for
// every pixel how far it is from the nearest outside edge and the nearest inside corner, crisp at
// any distance and without any texture. The substrate scanner (core/substrate.js) picks the wear
// family per mesh, and the shader in core/imperfect.js does the rest. The attribute's w carries the
// family and doubles as a sentinel: geometry without it reads w = 1 and gets no edge wear.
import * as THREE from 'three';
import { scanObject } from './substrate.js';

// The bake itself, on plain arrays so it can run in a worker (positions xyz, optional index whose
// triangles own their corners). Returns sbEdge, 4 floats per vertex. Self-contained on purpose:
// it's shipped to the worker as source text.
function edgeData(P, I, code) {
  const SHARP = 0.848, NONE = 1e5, CONCAVE = 1e4; // faces meeting at more than 32 degrees make an edge
  const nv = P.length / 3, T = (I ? I.length : nv) / 3;
  const vi = I ? (t, k) => I[t * 3 + k] : (t, k) => t * 3 + k;
  // weld corners that sit at the same spot (1 mm), so faces that touch know each other
  const weld = new Map(), wid = new Int32Array(nv);
  for (let i = 0; i < nv; i++) {
    const key = Math.round(P[i * 3] * 1000) + ',' + Math.round(P[i * 3 + 1] * 1000) + ',' + Math.round(P[i * 3 + 2] * 1000);
    let w = weld.get(key); if (w === undefined) { w = weld.size; weld.set(key, w); } wid[i] = w;
  }
  const fn = new Float32Array(T * 3), area2 = new Float32Array(T);
  for (let t = 0; t < T; t++) {
    const a = vi(t, 0) * 3, b = vi(t, 1) * 3, c = vi(t, 2) * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, L = Math.hypot(nx, ny, nz);
    area2[t] = L;
    if (L > 0) { fn[t * 3] = nx / L; fn[t * 3 + 1] = ny / L; fn[t * 3 + 2] = nz / L; }
  }
  // every edge (by its welded ends) and the triangles along it
  const edges = new Map(), N = weld.size + 1;
  const ek = (p, q) => (p < q ? p * N + q : q * N + p);
  for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) {
    const key = ek(wid[vi(t, (k + 1) % 3)], wid[vi(t, (k + 2) % 3)]);
    const l = edges.get(key); if (l) l.push(t * 3 + k); else edges.set(key, [t * 3 + k]);
  }
  const out = new Float32Array(nv * 4), w = (code + 1) / 100, off = [0, 0, 0], h = [0, 0, 0];
  for (let t = 0; t < T; t++) {
    for (let k = 0; k < 3; k++) {
      off[k] = NONE;
      const p = vi(t, (k + 1) % 3), q = vi(t, (k + 2) % 3);
      const len = Math.hypot(P[q * 3] - P[p * 3], P[q * 3 + 1] - P[p * 3 + 1], P[q * 3 + 2] - P[p * 3 + 2]);
      h[k] = len > 0 ? area2[t] / len : 0; // the corner's height over the opposite edge
      const list = edges.get(ek(wid[p], wid[q]));
      if (!list || list.length < 2) continue; // an open edge (a plane's border): leave it
      let smooth = false, convex = false, concave = false;
      for (const tk of list) {
        const t2 = (tk / 3) | 0, k2 = tk % 3;
        if (t2 === t) continue;
        const d = fn[t * 3] * fn[t2 * 3] + fn[t * 3 + 1] * fn[t2 * 3 + 1] + fn[t * 3 + 2] * fn[t2 * 3 + 2];
        if (d > SHARP) { smooth = true; break; }
        const o = vi(t2, k2) * 3; // the neighbour's far corner: below our face means a convex edge
        const s = (P[o] - P[p * 3]) * fn[t * 3] + (P[o + 1] - P[p * 3 + 1]) * fn[t * 3 + 1] + (P[o + 2] - P[p * 3 + 2]) * fn[t * 3 + 2];
        if (s <= 1e-5) convex = true; else concave = true;
      }
      if (!smooth) off[k] = convex ? 0 : concave ? CONCAVE : NONE;
    }
    for (let j = 0; j < 3; j++) {
      const o = vi(t, j) * 4;
      for (let k = 0; k < 3; k++) out[o + k] = off[k] + (j === k ? h[k] : 0);
      out[o + 3] = w;
    }
  }
  return out;
}

// the geometry the bake writes into: each triangle must own its three corners
function owning(src) {
  const idx = src.index, n = src.attributes.position.count;
  const own = !idx || (idx.count === n && new Set(idx.array).size === n);
  return own ? src : src.toNonIndexed();
}

// the baked copy of a geometry, right now (tests, and browsers without workers)
export function bakeEdges(src, code) {
  const g = owning(src);
  g.setAttribute('sbEdge', new THREE.BufferAttribute(edgeData(g.attributes.position.array, g.index ? g.index.array : null, code), 4));
  return g;
}

// one worker does the baking off the main thread, so a big mesh never costs a frame
let worker = null, jobN = 0;
const jobs = new Map();
function bakeAsync(g, code, done) {
  if (worker === null) {
    try {
      const src = `const edgeData = ${edgeData.toString()};\nonmessage = (e) => { const d = e.data; const out = edgeData(d.pos, d.idx, d.code); postMessage({ id: d.id, out }, [out.buffer]); };`;
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      worker.onmessage = (e) => { const j = jobs.get(e.data.id); jobs.delete(e.data.id); if (j) j(e.data.out); };
      worker.onerror = () => { worker = false; for (const [, j] of jobs) j(null); jobs.clear(); };
    } catch (e) { worker = false; }
  }
  const P = g.attributes.position.array, I = g.index ? g.index.array : null;
  if (!worker) { done(edgeData(P, I, code)); return; }
  const id = ++jobN, pos = new Float32Array(P), idx = I ? I.slice() : null; // copies: the originals stay with the GPU
  jobs.set(id, (out) => done(out || edgeData(P, I, code)));
  worker.postMessage({ id, pos, idx, code }, idx ? [pos.buffer, idx.buffer] : [pos.buffer]);
}

const MAX_TRIS = 12000; // bigger merged meshes (whole blocks of street detail) are left as they are
const triCount = (g) => (g.index ? g.index.count : g.attributes.position?.count || 0) / 3;
const isStd = (m) => m && m.isMeshStandardMaterial && !(m.alphaTest > 0) && !m.wireframe;

// Bakes the meshes round the camera a few at a time, so nothing hitches.
export function createAbrasion(scene, quality) {
  const on = !(quality.label === 'Phone' || quality.label === 'Low');
  const seen = new WeakSet(), baked = new Map(), queue = [];
  let sweepT = 0;
  const _p = new THREE.Vector3();
  const stats = { meshes: 0, geometries: 0, skipped: 0, ms: 0, maxMs: 0 };

  function wearCode(o) {
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!isStd(m)) return -1;
    if (m.userData.sbWearCode !== undefined) return m.userData.sbWearCode;
    const s = scanObject(o).sub;
    return s.wear === 11 ? -1 : s.wear; // food, plants, ground and flesh don't chip
  }
  function eligible(o) {
    if (!o.isMesh || o.isSkinnedMesh || o.userData.noWear || !o.geometry?.attributes?.position) return false;
    if (Array.isArray(o.material)) return false;
    if (o.geometry.attributes.sbEdge) return true;
    return triCount(o.geometry) <= MAX_TRIS && isStd(o.material);
  }
  const pending = new Map(); // geometry key -> meshes waiting for it
  function finish(o, g) {
    if (o.geometry !== g) o.geometry = g;
    const m = o.material;
    if (!m.defines || !('SB_WEAR' in m.defines)) { m.defines = { ...(m.defines || {}), SB_WEAR: '' }; m.needsUpdate = true; }
    stats.meshes++;
  }
  function apply(o) {
    const code = wearCode(o);
    if (code < 0) { stats.skipped++; return; }
    const src = o.geometry;
    if (src.attributes.sbEdge) { finish(o, src); return; }
    const key = src.uuid + ':' + code;
    const ready = baked.get(key);
    if (ready) { finish(o, ready); return; }
    const wait = pending.get(key);
    if (wait) { wait.push(o); return; }
    const g = owning(src);
    // a static mesh that bullets hit keeps its fast hit-test tree; rebuilding one costs, so only small ones
    if (src.boundsTree && g !== src && triCount(src) > 3000) { stats.skipped++; return; }
    pending.set(key, [o]);
    bakeAsync(g, code, (out) => {
      g.setAttribute('sbEdge', new THREE.BufferAttribute(out, 4));
      if (src.boundsTree && g !== src && g.computeBoundsTree) { try { g.computeBoundsTree(); } catch (e) { /* plain raycast */ } }
      baked.set(key, g); stats.geometries++;
      for (const m of pending.get(key) || []) finish(m, g);
      pending.delete(key);
    });
  }
  return {
    active: on, stats,
    // wear these straight away (guns, props, interiors: things seen up close)
    prepare(root) {
      if (!on || !root) return;
      root.traverse((o) => { if (!seen.has(o) && eligible(o)) { seen.add(o); apply(o); } });
    },
    update(dt, cam) {
      if (!on) return;
      if ((sweepT -= dt) <= 0) {
        sweepT = 2.5;
        // what's near enough to see wear on, nearest first
        const found = [];
        scene.traverseVisible((o) => {
          if (seen.has(o) || !o.isMesh) return;
          if (o.isInstancedMesh) { if (eligible(o)) found.push([0, o]); seen.add(o); return; }
          _p.setFromMatrixPosition(o.matrixWorld);
          const r = o.geometry?.boundingSphere?.radius ?? 1;
          const d = _p.distanceTo(cam) - r;
          if (d > 45) return;
          seen.add(o);
          if (eligible(o)) found.push([d, o]);
        });
        found.sort((x, y) => x[0] - y[0]);
        for (const [, o] of found) queue.push(o);
      }
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < 2.5) { const t1 = performance.now(); apply(queue.shift()); stats.maxMs = Math.max(stats.maxMs, performance.now() - t1); }
      stats.ms += performance.now() - t0;
    },
  };
}
