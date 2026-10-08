// Loader for characters built offline by scenes/lib/humans/offline/build.py.
//
// A character is two files in scenes/lib/humans/cache/: <id>.json (bones, meshes, materials)
// and <id>.bin (vertex data). Every mesh is stored in its DRAPE pose (the pose its garments
// were cloth-simulated in), which is also the skin bind pose here: the skeleton starts exactly
// in that pose and the runtime only adds small deltas (idle.js) - so the garments keep their
// simulated folds and nothing has to be re-solved at render time.
import * as THREE from 'three';
import { skinMaterial, eyeMaterial, cardMaterial, simpleTexturedMaterial } from './materials.js';
import { clothMaterial, hairStrandMaterial, propMaterial } from './cloth.js';

export const CACHE_URL = new URL('./cache/', import.meta.url).href;

const dataCache = new Map();
/** Fetch a character's data (cached per id). */
export function loadCharacterData(id) {
  if (!dataCache.has(id)) {
    dataCache.set(id, (async () => {
      const r = await fetch(CACHE_URL + id + '.json');
      if (!r.ok) throw new Error(`human "${id}" is not built (no ${id}.json in scenes/lib/humans/cache): run the build, see scenes/lib/humans/README.md`);
      const header = await r.json();
      const b = await fetch(CACHE_URL + id + '.bin');
      if (!b.ok) throw new Error(`human "${id}": ${id}.bin missing`);
      const bin = await b.arrayBuffer();
      return { header, bin };
    })());
  }
  return dataCache.get(id);
}

const TYPES = { f32: Float32Array, u16: Uint16Array, u32: Uint32Array, u8: Uint8Array, i16: Int16Array };
function view(bin, d) { return new TYPES[d.type](bin, d.offset, d.count); }

const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _m = new THREE.Matrix4();

/**
 * Build a THREE object tree for loaded data. opts: { shadows (true), lod } .
 * Returns { id, root, bones, bone(name), skeleton, meshes, mesh(name), header, drape: {q[], p[]} }.
 */
export function buildCharacter(data, opts = {}) {
  const { header, bin } = data;
  const root = new THREE.Group();
  root.name = `human:${header.id}`;
  // ---- skeleton at the drape pose
  const bones = header.bones.map((b) => { const o = new THREE.Bone(); o.name = b.name; return o; });
  const worldQ = header.bones.map((b) => new THREE.Quaternion(b.q[1], b.q[2], b.q[3], b.q[0]));
  const worldP = header.bones.map((b) => new THREE.Vector3(...b.p));
  header.bones.forEach((b, i) => {
    const o = bones[i];
    if (b.parent >= 0) {
      const pq = worldQ[b.parent].clone().invert();
      o.quaternion.copy(pq).multiply(worldQ[i]);
      o.position.copy(worldP[i]).sub(worldP[b.parent]).applyQuaternion(pq);
      bones[b.parent].add(o);
    } else {
      o.quaternion.copy(worldQ[i]);
      o.position.copy(worldP[i]);
      root.add(o);
    }
  });
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const index = Object.fromEntries(header.bones.map((b, i) => [b.name, i]));
  const drape = { q: bones.map((b) => b.quaternion.clone()), p: bones.map((b) => b.position.clone()) };

  // ---- meshes
  const meshes = [];
  for (const m of header.meshes) {
    const g = new THREE.BufferGeometry();
    for (const [name, d] of Object.entries(m.attrs)) {
      const arr = view(bin, d);
      g.setAttribute(name, new THREE.BufferAttribute(arr, d.itemSize, !!d.normalized));
    }
    g.setIndex(new THREE.BufferAttribute(view(bin, m.index), 1));
    const mnames = Object.keys(m.morphs || {});
    if (mnames.length) {
      g.morphAttributes.position = mnames.map((n) => { const a = new THREE.BufferAttribute(view(bin, m.morphs[n]), 3); a.name = n; return a; });
      g.morphTargetsRelative = true;
    }
    // attributes every material expects
    const n = g.attributes.position.count;
    if (!g.attributes.ao) g.setAttribute('ao', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    else if (m.name === 'caruncle') {
      // the baked AO in the inner corner of the eye is ~0 (rays hit the lids): a black dot
      const ao = g.attributes.ao.array.slice();
      for (let i = 0; i < n; i++) ao[i] = Math.max(ao[i], 0.65);
      g.setAttribute('ao', new THREE.BufferAttribute(ao, 1));
    }
    if (m.kind === 'skin') {
      if (!g.attributes.thick) g.setAttribute('thick', new THREE.BufferAttribute(new Float32Array(n).fill(0.3), 1));
      if (!g.attributes.aux) g.setAttribute('aux', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
      if (!g.attributes.aux2) g.setAttribute('aux2', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
      if (!g.attributes.albg) g.setAttribute('albg', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    }
    if (m.kind === 'lash' || m.kind === 'brow' || m.kind === 'haircard') {
      // lw = 1 on the lower lash row (below the eye centre, drape pose = bind pose)
      const lw = new Float32Array(n);
      if (m.kind === 'lash') {
        const eyes = ['eye.L', 'eye.R'].filter((b) => index[b] !== undefined).map((b) => bones[index[b]].getWorldPosition(new THREE.Vector3()));
        const pos = g.attributes.position;
        for (let i = 0; i < n; i++) {
          const x = pos.getX(i), y = pos.getY(i);
          let best = null, bd = 1e9;
          for (const e of eyes) { const d = Math.abs(e.x - x); if (d < bd) { bd = d; best = e; } }
          if (best) lw[i] = Math.min(1, Math.max(0, (best.y - 0.001 - y) / 0.002));
        }
      }
      g.setAttribute('lw', new THREE.BufferAttribute(lw, 1));
    }
    g.computeBoundingSphere();
    const mat = materialFor(m, header, opts);
    let mesh;
    if (g.attributes.skinIndex) {
      mesh = new THREE.SkinnedMesh(g, mat);
      root.add(mesh);
      mesh.bind(skeleton, new THREE.Matrix4());
    } else {
      mesh = new THREE.Mesh(g, mat);
      // static parts ride on a bone if the build says so
      if (m.bone && index[m.bone] !== undefined) {
        const b = bones[index[m.bone]];
        b.updateMatrixWorld(true);
        _m.copy(b.matrixWorld).invert();
        mesh.applyMatrix4(_m);
        b.add(mesh);
      } else root.add(mesh);
    }
    if (mnames.length) {
      mesh.morphTargetDictionary = Object.fromEntries(mnames.map((nm, i) => [nm, i]));
      mesh.morphTargetInfluences = mnames.map(() => 0);
    }
    mesh.name = `${root.name}:${m.name}`;
    // lashes and brows are too fine for a shadow map: at a grazing sun they print long dark
    // streaks across the cheek; their contact shading comes from the baked AO
    mesh.castShadow = opts.shadows !== false && m.material?.castShadow !== false && m.kind !== 'lash' && m.kind !== 'brow';
    mesh.receiveShadow = true;
    // the bind pose IS the drape pose (idle motion only adds small deltas), so the bounding
    // spheres are valid for culling; opts.cull === false turns it off
    mesh.frustumCulled = opts.cull !== false;
    mesh.userData.kind = m.kind;
    meshes.push(mesh);
  }
  const ch = {
    id: header.id, header, root, bones, index, skeleton, meshes, drape,
    bone: (name) => bones[index[name]],
    mesh: (name) => meshes.find((x) => x.name.endsWith(':' + name)),
    meta: header.meta || {},
  };
  return ch;
}

function materialFor(m, header, opts) {
  const mt = m.material || {};
  switch (m.kind) {
    case 'skin': return skinMaterial({ ...mt, seed: hashStr(header.id) % 997 });
    case 'eye': return eyeMaterial(mt);
    case 'brow': case 'lash': case 'haircard': return cardMaterial({ ...mt, colorMap: m.kind === 'haircard' });
    case 'hair': return hairStrandMaterial(mt);
    case 'teeth': case 'tongue': return simpleTexturedMaterial(mt);
    case 'cloth': return clothMaterial(mt);
    default: return propMaterial(mt);
  }
}

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
