// Sculpted mouth shapes for the lip-sync: the CC0 MakeHuman expression unit targets for the mouth
// (mouth-compression, mouth-pursing, mouth-protusion, ...) as morph targets on a character's skin,
// from the optional sidecar cache/<id>.mouth.json + .bin written by tools/mouthmorphs.py (the
// cache itself stays as built). A character without a sidecar simply has none: everything here is a
// no-op then. face.js drives them by name, like the bone units: rig.apply({ 'mouth-pursing': 0.6 }).
//
//   import { loadMouthShapes, attachMouthShapes } from './mouthshapes.js';
//   const ms = await loadMouthShapes('alexandria');   // null when there is no sidecar
//   attachMouthShapes(ch, ms);                        // before the first render
import * as THREE from 'three';
import { CACHE_URL } from './loader.js';

const cache = new Map();
/** Fetch a character's mouth-shape sidecar (cached; null when it has none). */
export function loadMouthShapes(id) {
  if (!cache.has(id)) {
    cache.set(id, (async () => {
      const r = await fetch(CACHE_URL + id + '.mouth.json');
      if (!r.ok) return null;
      const meta = await r.json();
      const b = await fetch(CACHE_URL + id + '.mouth.bin');
      if (!b.ok) return null;
      const bin = await b.arrayBuffer();
      const idx = new Uint32Array(bin, meta.index.offset, meta.index.count);
      const deltas = new Float32Array(bin, meta.deltas.offset, meta.deltas.count);
      return { meta, idx, deltas };
    })().catch(() => null));
  }
  return cache.get(id);
}

/** Add the shapes to the character's skin mesh as relative morph targets (named by unit). */
export function attachMouthShapes(ch, ms) {
  if (!ms) return [];
  if (ms.meta.id !== ch.id) { console.warn(`[humans] ${ch.id}: mouth shapes are ${ms.meta.id}'s - not attached`); return []; }
  const mesh = ch.meshes.find((m) => m.name.endsWith(':' + ms.meta.mesh));
  if (!mesh) return [];
  const g = mesh.geometry;
  const n = g.attributes.position.count;
  // the sidecar must belong to this build of the cache (tools/mouthmorphs.py after a rebuild)
  const stale = (why) => { console.warn(`[humans] ${ch.id}: mouth shapes not attached - ${why} (re-run tools/mouthmorphs.py ${ch.id})`); return []; };
  if (n !== ms.meta.vertexCount) return stale(`made for ${ms.meta.vertexCount} vertices, the skin has ${n}`);
  const want = ms.meta.check?.positionSum;
  if (want === undefined) return stale('sidecar without a position check');
  let sum = 0;
  const P = g.attributes.position.array;
  for (let i = 0; i < P.length; i++) sum += Math.abs(P[i]);
  if (Math.abs(sum - want) > 1e-6 * want + 1e-3) return stale('the cache was rebuilt since');
  const K = ms.idx.length;
  const list = g.morphAttributes.position || [];
  const dict = mesh.morphTargetDictionary || {};
  const infl = mesh.morphTargetInfluences || [];
  const added = [];
  ms.meta.units.forEach((u, k) => {
    if (dict[u] !== undefined) return;
    const arr = new Float32Array(n * 3);
    const base = k * K * 3;
    for (let j = 0; j < K; j++) {
      const v = ms.idx[j] * 3;
      arr[v] = ms.deltas[base + j * 3]; arr[v + 1] = ms.deltas[base + j * 3 + 1]; arr[v + 2] = ms.deltas[base + j * 3 + 2];
    }
    const a = new THREE.BufferAttribute(arr, 3);
    a.name = u;
    dict[u] = list.length;
    list.push(a);
    infl.push(0);
    added.push(u);
  });
  g.morphAttributes.position = list;
  g.morphTargetsRelative = true;
  mesh.morphTargetDictionary = dict;
  mesh.morphTargetInfluences = infl;
  ch.mouthShapes = (ch.mouthShapes || []).concat(added);
  return added;
}
