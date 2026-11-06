// Loader for the open-source model library in assets/open/ (Khronos glTF
// sample assets + Quaternius CC0 packs). Models load on first use and are cached.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { prepareLODs } from '../core/lod.js';
import { withKTX2, ktx2Ready } from './ktx2.js';

const loader = withKTX2(new GLTFLoader()); // the concept car and the guns carry GPU-compressed (KTX2) textures
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map(), ready = new Map();

export function loadOpen(rel) {
  if (!cache.has(rel)) {
    cache.set(rel, ktx2Ready.then(() => loader.loadAsync('assets/open/' + rel)).then((g) => {
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      prepareLODs(g.scene); // simpler versions of the heavy meshes, for when they're far away
      ready.set(rel, g);
      return g;
    }).catch((e) => { console.warn('open model failed', rel, e.message); return null; }));
  }
  return cache.get(rel);
}
export const loaded = (rel) => ready.get(rel) || null;
export const preload = (list) => Promise.all(list.map(loadOpen));

// A copy of a loaded model, scaled so its largest (or chosen) dimension equals `size` metres
// and sitting on y = 0. Skinned models are cloned with their skeletons.
const _b = new THREE.Box3(), _s = new THREE.Vector3();
export function instance(g, size, axis = 'max') {
  const o = SkeletonUtils.clone(g.scene);
  o.updateMatrixWorld(true);
  // precise bounds: for rigged models this applies the skeleton, so armature scales are counted
  _b.setFromObject(o, true);
  _b.getSize(_s);
  const cur = axis === 'max' ? Math.max(_s.x, _s.y, _s.z) : _s[axis];
  const k = cur > 0 ? size / cur : 1;
  o.scale.multiplyScalar(k);
  o.updateMatrixWorld(true);
  _b.setFromObject(o, true);
  const c = _b.getCenter(new THREE.Vector3());
  const wrap = new THREE.Group();
  o.position.x -= c.x; o.position.z -= c.z; o.position.y -= _b.min.y;
  wrap.add(o);
  wrap.userData.size = _b.getSize(new THREE.Vector3());
  return wrap;
}

export const Q = (pack, name) => `quaternius/${pack}/${name}.glb`;
export const K = (name) => `khronos/${name}.glb`;
