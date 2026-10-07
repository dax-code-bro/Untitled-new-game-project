// Loads scanned glTF assets listed in assets/assets.json (written by pipeline/process_scan.py).
// The world asks for assets by "slot" (rock, tree, car, ...). If a slot has no scans,
// the world falls back to its placeholder block geometry, so the game always runs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class AssetLib {
  constructor() {
    this.assets = [];
    this.bySlot = {};
  }

  async load(url = 'assets/assets.json', onProgress) {
    let manifest;
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return this;
      manifest = await res.json();
    } catch (e) {
      return this; // no manifest: placeholder art only
    }
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    const loader = new GLTFLoader();
    const list = manifest.assets || [];
    let done = 0;
    await Promise.all(list.map(async (def) => {
      try {
        const gltf = await loader.loadAsync(base + def.file);
        this.add(def, gltf.scene);
      } catch (e) {
        console.warn(`[assets] failed to load ${def.id}:`, e);
      }
      if (onProgress) onProgress(++done, list.length, def.id);
    }));
    return this;
  }

  add(def, root) {
    const levels = [];
    for (const l of def.lods || []) {
      const node = root.getObjectByName(l.node);
      if (node) levels.push({ obj: node, distance: l.distance });
    }
    if (!levels.length) levels.push({ obj: root, distance: 0 });
    for (const l of levels) {
      l.obj.position.set(0, 0, 0);
      l.obj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
      });
    }
    const box = new THREE.Box3().setFromObject(levels[0].obj);
    const size = def.size || box.getSize(new THREE.Vector3()).toArray();
    const asset = { def, levels, size };
    this.assets.push(asset);
    (this.bySlot[def.slot] = this.bySlot[def.slot] || []).push(asset);
  }

  has(slot) { return !!(this.bySlot[slot] && this.bySlot[slot].length); }
  forSlot(slot) { return this.bySlot[slot] || []; }

  // A placed copy. Geometry and materials are shared between copies.
  instance(asset, scale = 1, yaw = 0) {
    const lod = new THREE.LOD();
    for (const l of asset.levels) lod.addLevel(l.obj.clone(), l.distance * Math.max(1, scale));
    lod.scale.setScalar(scale);
    lod.rotation.y = yaw;
    return lod;
  }
}
