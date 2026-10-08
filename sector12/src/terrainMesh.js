// Streams the 42.6 km island as quadtree LOD chunks built by worker threads.
// Near the camera chunks are 256 m (4 m vertex spacing); far away they grow to 8+ km.
// Each chunk's vertices are local to the chunk, so float precision stays fine across the map.
import * as THREE from 'three';
import { WORLD, islandD } from './terrain.js';
import { buildChunk } from './chunkBuild.js';
import { terrainMaterial, waterMaterial, oceanGeometry, heightTexture } from './materials.js';

const ROOT = 65536;
const LEAF = 256;
const RES = 64;
const SPLIT = 1.25;

export class Terrain {
  constructor(scene, tex) {
    this.scene = scene;
    this.tex = tex;
    this.material = terrainMaterial(tex.terrain);
    this.heightTex = heightTexture();
    this.waterMat = waterMaterial(tex, this.heightTex, { ocean: false });
    this.nodes = new Map();
    this.queue = [];
    this.inflight = 0;
    this.visible = new Set();
    this.workers = [];
    this.time = 0;
    try {
      const n = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('./terrainWorker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => this.onResult(e.data);
        w.busy = false;
        this.workers.push(w);
      }
    } catch (e) {
      this.workers = []; // falls back to building on the main thread
    }
    this.buildOcean();
  }

  buildOcean() {
    this.ocean = new THREE.Mesh(oceanGeometry(), waterMaterial(this.tex, this.heightTex, { ocean: true }));
    this.ocean.position.y = WORLD.sea;
    this.ocean.renderOrder = 1;
    this.ocean.frustumCulled = false;
    this.ocean.receiveShadow = true;
    this.scene.add(this.ocean);
    // the water shader needs to know how deep the water is: a heightmap of the whole map, built off-thread
    if (this.workers[0]) this.workers[0].postMessage({ type: 'heightmap', px: 1024, span: WORLD.size });
  }

  onHeightmap(m) {
    const t = new THREE.DataTexture(m.px, m.w, m.w, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    this.heightTex.value = t;
  }

  key(x0, z0, size) { return `${size}|${x0}|${z0}`; }

  // Recursively pick the leaves to draw for this camera position.
  select(cam, x0, z0, size, out) {
    // skip open ocean: the ocean plane covers it
    const cx = x0 + size / 2, cz = z0 + size / 2;
    const near = Math.hypot(Math.max(0, Math.abs(cx) - size / 2), Math.max(0, Math.abs(cz) - size / 2));
    if (near > WORLD.islandR * 1.18) return;
    const dx = Math.max(0, Math.abs(cam.x - cx) - size / 2);
    const dz = Math.max(0, Math.abs(cam.z - cz) - size / 2);
    const d = Math.hypot(dx, dz, Math.max(0, cam.y - 60) * 0.7);
    if (size > LEAF && d < size * SPLIT) {
      const h = size / 2;
      this.select(cam, x0, z0, h, out);
      this.select(cam, x0 + h, z0, h, out);
      this.select(cam, x0, z0 + h, h, out);
      this.select(cam, x0 + h, z0 + h, h, out);
    } else out.push({ x0, z0, size, d });
  }

  request(x0, z0, size, priority) {
    const k = this.key(x0, z0, size);
    let n = this.nodes.get(k);
    if (!n) {
      n = { key: k, x0, z0, size, state: 'queued', mesh: null, water: null, used: this.time, priority };
      this.nodes.set(k, n);
      this.queue.push(n);
    } else if (n.state === 'queued') n.priority = Math.min(n.priority, priority);
    n.used = this.time;
    return n;
  }

  // Ancestor that's ready, used while a finer chunk is still building.
  readyAncestor(x0, z0, size) {
    let s = size * 2;
    while (s <= ROOT) {
      const ax = Math.floor((x0 + ROOT / 2) / s) * s - ROOT / 2;
      const az = Math.floor((z0 + ROOT / 2) / s) * s - ROOT / 2;
      const n = this.nodes.get(this.key(ax, az, s));
      if (n && n.state === 'ready') return n;
      s *= 2;
    }
    return null;
  }

  update(dt, cam) {
    this.time += dt;
    this.ocean.position.x = Math.round(cam.x / 2) * 2;
    this.ocean.position.z = Math.round(cam.z / 2) * 2;

    const leaves = [];
    this.select(cam, -ROOT / 2, -ROOT / 2, ROOT, leaves);
    const show = new Set();
    for (const l of leaves) {
      const n = this.request(l.x0, l.z0, l.size, l.d / l.size + Math.log2(l.size / LEAF) * 0.01);
      if (n.state === 'ready') { show.add(n); continue; }
      // keep coarse coverage while the fine chunk builds
      for (let s = l.size * 2; s <= ROOT; s *= 2) {
        const ax = Math.floor((l.x0 + ROOT / 2) / s) * s - ROOT / 2, az = Math.floor((l.z0 + ROOT / 2) / s) * s - ROOT / 2;
        const near = Math.hypot(Math.max(0, Math.abs(ax + s / 2) - s / 2), Math.max(0, Math.abs(az + s / 2) - s / 2));
        if (near > WORLD.islandR * 1.18) break;
        const a = this.request(ax, az, s, -1);
        if (a.state === 'ready') { show.add(a); break; }
      }
    }
    for (const n of this.visible) if (!show.has(n)) this.setVisible(n, false);
    for (const n of show) this.setVisible(n, true);
    this.visible = show;
    this.pump();
    // free chunks unused for a while
    this.gcT = (this.gcT || 0) - dt;
    if (this.gcT <= 0) {
      this.gcT = 5;
      for (const [k, n] of this.nodes) {
        if (n.state === 'ready' && !show.has(n) && this.time - n.used > 20 && n.size < ROOT / 4) this.dispose(n, k);
        if (n.state === 'queued' && this.time - n.used > 5) { this.nodes.delete(k); n.state = 'dropped'; }
      }
      this.queue = this.queue.filter((n) => n.state === 'queued');
    }
  }

  setVisible(n, v) {
    if (n.mesh) n.mesh.visible = v;
    if (n.water) n.water.visible = v;
  }

  pump() {
    if (!this.queue.length) return;
    this.queue.sort((a, b) => a.priority - b.priority);
    if (!this.workers.length) {
      // main-thread fallback: a couple of chunks per frame
      for (let i = 0; i < 2 && this.queue.length; i++) {
        const n = this.queue.shift();
        if (n.state !== 'queued') { i--; continue; }
        n.state = 'building';
        this.onResult({ type: 'chunk', key: n.key, ...buildChunk(n.x0, n.z0, n.size, RES) });
      }
      return;
    }
    for (const w of this.workers) {
      if (w.busy) continue;
      let n;
      while ((n = this.queue.shift()) && n.state !== 'queued');
      if (!n) break;
      n.state = 'building';
      w.busy = true;
      w.current = n.key;
      w.postMessage({ type: 'chunk', key: n.key, x0: n.x0, z0: n.z0, size: n.size, res: RES });
    }
  }

  onResult(r) {
    if (r.type === 'heightmap') { this.onHeightmap(r); return; }
    for (const w of this.workers) if (w.current === r.key) { w.busy = false; w.current = null; }
    const n = this.nodes.get(r.key);
    if (!n || n.state !== 'building') return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(r.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(r.nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(r.col, 3));
    g.setAttribute('splatA', new THREE.BufferAttribute(r.sa, 4, true));
    g.setAttribute('splatB', new THREE.BufferAttribute(r.sb, 4, true));
    g.setIndex(new THREE.BufferAttribute(r.idx, 1));
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, r.minH - n.size * 0.03, 0), new THREE.Vector3(n.size, r.maxH, n.size));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(g, this.material);
    mesh.position.set(n.x0, 0, n.z0);
    mesh.receiveShadow = true;
    mesh.castShadow = n.size <= LEAF * 2;
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.scene.add(mesh);
    n.mesh = mesh;
    if (r.water) {
      const wg = new THREE.PlaneGeometry(n.size, n.size);
      wg.rotateX(-Math.PI / 2);
      const wm = new THREE.Mesh(wg, this.waterMat);
      wm.position.set(n.x0 + n.size / 2, WORLD.lake, n.z0 + n.size / 2);
      wm.visible = false;
      wm.renderOrder = 1;
      this.scene.add(wm);
      n.water = wm;
    }
    n.state = 'ready';
  }

  dispose(n, k) {
    if (n.mesh) { this.scene.remove(n.mesh); n.mesh.geometry.dispose(); }
    if (n.water) { this.scene.remove(n.water); n.water.geometry.dispose(); }
    this.nodes.delete(k);
    n.state = 'disposed';
  }

  // Resolves once every chunk needed for this camera position is built (used on the loading screen).
  async warmup(cam, onProgress) {
    for (let i = 0; i < 600; i++) {
      this.update(0.016, cam);
      let want = 0, ready = 0;
      const leaves = [];
      this.select(cam, -ROOT / 2, -ROOT / 2, ROOT, leaves);
      for (const l of leaves) { want++; const n = this.nodes.get(this.key(l.x0, l.z0, l.size)); if (n && n.state === 'ready') ready++; }
      if (onProgress) onProgress(ready, want);
      if (ready === want) return;
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  get chunkCount() { return this.visible.size; }

  destroy() {
    for (const [k, n] of this.nodes) this.dispose(n, k);
    for (const w of this.workers) w.terminate();
    this.scene.remove(this.ocean);
  }
}
