// Lower-detail versions of the heavy models, made when they load.
//
// People are ~30k triangles each, the concept car over 200k, the guns on the shop racks 10-35k:
// fine up close, wasted when they're a few dozen pixels tall. When a model loads, meshoptimizer
// (MIT, vendor/meshoptimizer) simplifies each heavy mesh twice, to ~30% and ~8% of its triangles,
// keeping its silhouette and its UV/normal seams. The simpler versions are only new index buffers
// over the same vertices, so they cost almost no memory and skinned people keep their skeletons.
// A manager then swaps each mesh's geometry by how big it is on screen.
import * as THREE from 'three';
import { MeshoptSimplifier } from '../../vendor/meshoptimizer/meshopt_simplifier.module.js';

let ready = false;
export const lodReady = MeshoptSimplifier.ready.then(() => { ready = true; }).catch(() => {});

// [share of triangles kept, max error (fraction of the mesh's size), switch at distance / radius]
const LEVELS = [[0.3, 0.01, 11], [0.08, 0.035, 28]];
const MIN_TRIS = 2500;
const stats = { meshes: 0, before: 0, after: [0, 0], ms: 0 };
export const lodStats = stats;

function positions(geo) {
  const p = geo.attributes.position;
  if (!p.isInterleavedBufferAttribute && p.array instanceof Float32Array && p.itemSize === 3 && !p.normalized) return p.array;
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { out[i * 3] = p.getX(i); out[i * 3 + 1] = p.getY(i); out[i * 3 + 2] = p.getZ(i); }
  return out;
}

// The levels of one geometry (cached on it, shared by every clone): [full, mid, far] or null.
export function geometryLODs(geo) {
  if (geo.userData.lodSet !== undefined) return geo.userData.lodSet;
  geo.userData.lodSet = null;
  if (!ready || !geo.index || !geo.attributes.position || (geo.groups && geo.groups.length > 1)) return null;
  if (geo.morphAttributes && Object.keys(geo.morphAttributes).length) return null;
  const n = geo.index.count;
  if (n / 3 < MIN_TRIS) return null;
  const t0 = performance.now();
  const P = positions(geo), I = new Uint32Array(geo.index.array);
  const set = [geo];
  let prev = n;
  for (const [ratio, err] of LEVELS) {
    const target = Math.max(192, Math.floor((n * ratio) / 3) * 3);
    let out;
    try { [out] = MeshoptSimplifier.simplify(I, P, 3, target, err); } catch (e) { break; }
    if (out.length > prev * 0.7) break; // couldn't take enough away without changing the shape: stop here
    const g = new THREE.BufferGeometry();
    for (const k of Object.keys(geo.attributes)) g.setAttribute(k, geo.attributes[k]);
    const small = geo.attributes.position.count < 65536;
    g.setIndex(new THREE.BufferAttribute(small ? new Uint16Array(out) : out, 1));
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    if (!geo.boundingBox) geo.computeBoundingBox();
    g.boundingSphere = geo.boundingSphere; g.boundingBox = geo.boundingBox;
    g.name = (geo.name || 'mesh') + '-lod' + set.length;
    set.push(g); prev = out.length;
  }
  stats.ms += performance.now() - t0;
  if (set.length < 2) return null;
  for (const g of set) g.userData.lodSet = set;
  stats.meshes++; stats.before += n / 3;
  set.slice(1).forEach((g, i) => { stats.after[i] += g.index.count / 3; });
  return set;
}

// One simplified copy of a geometry (same vertices, new index), or null if it can't be simplified.
export function simplified(geo, ratio, err) {
  if (!ready || !geo.index) return null;
  const P = positions(geo), I = new Uint32Array(geo.index.array);
  let out;
  try { [out] = MeshoptSimplifier.simplify(I, P, 3, Math.max(192, Math.floor((I.length * ratio) / 3) * 3), err); } catch (e) { return null; }
  const g = new THREE.BufferGeometry();
  for (const k of Object.keys(geo.attributes)) g.setAttribute(k, geo.attributes[k]);
  g.setIndex(new THREE.BufferAttribute(geo.attributes.position.count < 65536 ? new Uint16Array(out) : out, 1));
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  g.boundingSphere = geo.boundingSphere;
  return g;
}

// Leaf cards can't be simplified (every edge of a card is a border), so a far canopy keeps a share
// of its cards, each grown so the canopy covers the same area.
export function thinCards(geo, keep = 0.4, seed = 1) {
  if (!geo.index) return null;
  const idx = geo.index.array, n = geo.attributes.position.count, par = new Int32Array(n);
  for (let i = 0; i < n; i++) par[i] = i;
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let t = 0; t < idx.length; t += 3) { const a = find(idx[t]); par[find(idx[t + 1])] = a; par[find(idx[t + 2])] = a; }
  const h = (x) => { x = (x ^ seed) * 2654435761; x ^= x >>> 15; return ((x >>> 0) % 10000) / 10000; };
  const P = geo.attributes.position, pos = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) { pos[i * 3] = P.getX(i); pos[i * 3 + 1] = P.getY(i); pos[i * 3 + 2] = P.getZ(i); }
  const cen = new Map(), out = [];
  for (let i = 0; i < n; i++) { const r = find(i); const c = cen.get(r) || [0, 0, 0, 0]; c[0] += pos[i * 3]; c[1] += pos[i * 3 + 1]; c[2] += pos[i * 3 + 2]; c[3]++; cen.set(r, c); }
  for (let t = 0; t < idx.length; t += 3) if (h(find(idx[t])) < keep) out.push(idx[t], idx[t + 1], idx[t + 2]);
  const f = 1 / Math.sqrt(keep);
  for (let i = 0; i < n; i++) {
    const c = cen.get(find(i));
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = c[k] / c[3] + (pos[i * 3 + k] - c[k] / c[3]) * f;
  }
  const g = new THREE.BufferGeometry();
  for (const k of Object.keys(geo.attributes)) g.setAttribute(k, geo.attributes[k]);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(out);
  g.computeBoundingSphere();
  return g;
}

// make the levels for every heavy mesh in a freshly loaded model
export function prepareLODs(root) {
  if (!ready || !root) return;
  root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.geometry) geometryLODs(o.geometry); });
}

// Swaps each mesh to the level that suits its size on screen (found by sweeping the scene now and
// then, so clones made anywhere are picked up).
export function createLODManager(scene, quality) {
  const tracked = [];
  const bias = { Phone: 0.6, Low: 0.75, Medium: 0.9, High: 1, Ultra: 1.3, Cinematic: 1.8 }[quality.label] || 1; // better presets keep detail further out
  let sweepT = 0, t = 0;
  const s = new THREE.Sphere(), cam = new THREE.Vector3();
  return {
    update(dt, camera) {
      if ((sweepT -= dt) <= 0) {
        sweepT = 1.5; tracked.length = 0;
        scene.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.userData.lodSet) tracked.push(o); });
      }
      if ((t -= dt) > 0) return;
      t = 0.2;
      cam.setFromMatrixPosition(camera.matrixWorld);
      const zoom = (camera.zoom || 1) * (50 / (camera.fov || 50)); // a scope's narrow view counts as closer
      for (const o of tracked) {
        const set = o.geometry.userData.lodSet;
        if (!set) continue;
        s.copy(set[0].boundingSphere).applyMatrix4(o.matrixWorld);
        const k = (s.center.distanceTo(cam) / Math.max(s.radius, 0.05)) / (bias * zoom);
        let L = 0;
        for (let i = 0; i < LEVELS.length; i++) if (k > LEVELS[i][2]) L = i + 1;
        L = Math.min(L, set.length - 1);
        if (o.geometry !== set[L]) o.geometry = set[L];
      }
    },
    get tracked() { return tracked.length; },
  };
}
