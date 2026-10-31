// Ground cover: a continuous carpet of grass around the player, wherever grass actually belongs.
//
// Each 12 m tile is filled on a jittered half-metre grid (no bare gaps, no visible rows). What grows
// at each spot comes from the ground itself: the terrain's own material layers decide how much grass
// there is (thick on lawns and meadows, sparse on forest floors and tundra, lush and tall in the
// jungle, none on roads, paths, sand, snow, rock, mud or water) and anything built on the ground
// (pads, floors, walls, vehicles, tents) keeps it clear. Five kinds mix by slow noise fields: short
// lawn grass, tall seed-head grass, sun-dried grass, clover and weeds, and wildflowers; large patches
// drift between lush green and yellowed, short and tall. Farther out the carpet thins while each
// clump grows to keep the ground covered, then shrinks away smoothly at the edge (no popping).
import * as THREE from 'three';
import { heightAt, normalAt, regionAt, splatAt, POIS, roadDist, WORLD } from './terrain.js';
import { waterLevelAt } from './physics.js';
import { mulberry32, makeNoise, fbm } from './noise.js';
import { windHook, coverageHook } from './materials.js';
import { groundCovered } from './structures.js';

const TILE = 12;
const STEP = 0.5;              // grid spacing inside a tile (m)
const SLOTS = TILE / STEP;     // 24 x 24 candidate spots per tile
const NODE = 2;                // ground is sampled every 2 m and interpolated
const NN = TILE / NODE + 1;
const KINDS = ['lawn', 'tall', 'dry', 'weed', 'flower'];
const K = { lawn: 0, tall: 1, dry: 2, weed: 3, flower: 4 };
const NZ = makeNoise(4242);
const BLOOMS = [[1, 0.85, 0.2], [1, 1, 1], [0.75, 0.45, 1], [1, 0.35, 0.3], [0.45, 0.6, 1], [1, 0.6, 0.15]];

// ---------------------------------------------------------------- card textures
function card(n, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  draw(g, n, r);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const blade = (g, x, base, h, w, lean, c0, c1) => {
  const grad = g.createLinearGradient(0, base, 0, base - h);
  grad.addColorStop(0, c0); grad.addColorStop(1, c1);
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(x - w / 2, base); g.quadraticCurveTo(x + lean * 0.3, base - h * 0.55, x + lean, base - h);
  g.quadraticCurveTo(x + lean * 0.3 + 1, base - h * 0.5, x + w / 2, base); g.fill();
};
const lawnTex = () => card(256, (g, n, r) => {
  for (let k = 0; k < 90; k++) blade(g, 6 + r() * (n - 12), n, n * (0.35 + r() * 0.6), 2.5 + r() * 3.5, (r() - 0.5) * 50, '#24360f', r() < 0.5 ? '#7aa23a' : '#5e8a2c');
});
const tallTex = () => card(256, (g, n, r) => {
  for (let k = 0; k < 55; k++) blade(g, 8 + r() * (n - 16), n, n * (0.6 + r() * 0.4), 2 + r() * 3, (r() - 0.5) * 70, '#2a3a14', r() < 0.5 ? '#8aa848' : '#a8b860');
  // seed heads
  for (let k = 0; k < 14; k++) {
    const x = 20 + r() * (n - 40), y = n * (0.05 + r() * 0.25);
    g.strokeStyle = '#9a9a5a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y + 30); g.lineTo(x + (r() - 0.5) * 8, y); g.stroke();
    g.fillStyle = r() < 0.5 ? '#c8b878' : '#b0a868';
    for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(x + (r() - 0.5) * 5, y + i * 4, 2.2, 3.4, 0.3, 0, 7); g.fill(); }
  }
});
const dryTex = () => card(256, (g, n, r) => {
  for (let k = 0; k < 70; k++) blade(g, 6 + r() * (n - 12), n, n * (0.3 + r() * 0.6), 2 + r() * 3, (r() - 0.5) * 60, '#5a4a2a', r() < 0.5 ? '#c8b070' : '#a8924e');
});
const weedTex = () => card(128, (g, n, r) => {
  // clover / plantain leaves low to the ground, a few dandelion stalks
  for (let k = 0; k < 16; k++) {
    const x = 10 + r() * (n - 20), y = n * (0.55 + r() * 0.4);
    g.strokeStyle = '#3e6a22'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, n); g.lineTo(x, y); g.stroke();
    g.fillStyle = r() < 0.5 ? '#4f8a2a' : '#3f7424';
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i - 1) * 0.9; g.beginPath(); g.ellipse(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 5, 3.5, a, 0, 7); g.fill(); }
  }
  for (let k = 0; k < 3; k++) {
    const x = 20 + r() * (n - 40), y = n * (0.2 + r() * 0.2);
    g.strokeStyle = '#4c7a2a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, n); g.lineTo(x, y); g.stroke();
    g.fillStyle = '#f2d02a'; g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill();
  }
});
const flowerTex = () => card(128, (g, n, r) => {
  for (let k = 0; k < 9; k++) {
    const x = 10 + r() * (n - 20), top = n * (0.25 + r() * 0.4), lean = (r() - 0.5) * 18;
    g.strokeStyle = '#4c7a2a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, n); g.quadraticCurveTo(x + lean * 0.4, (n + top) / 2, x + lean, top); g.stroke();
    g.fillStyle = '#ffffff';
    const cx = x + lean, cy = top, pr = 3 + r() * 3;
    for (let p = 0; p < 6; p++) { const a = (p / 6) * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr, pr * 0.75, 0, 7); g.fill(); }
    g.fillStyle = '#e8c040'; g.beginPath(); g.arc(cx, cy, pr * 0.6, 0, 7); g.fill();
  }
});

// three crossed cards, bent forward a little at the top; normals point up so the clump is lit like the ground
function clumpGeometry(w, h, cards = 3) {
  const parts = [];
  for (let i = 0; i < cards; i++) {
    const g = new THREE.PlaneGeometry(w, h, 1, 2);
    g.translate(0, h / 2, 0);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const t = p.getY(k) / h; p.setZ(k, t * t * h * 0.22); }
    g.rotateY((i / cards) * Math.PI + 0.3);
    parts.push(g.toNonIndexed());
  }
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), nor = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) { pos.set(p.attributes.position.array, o * 3); uv.set(p.attributes.uv.array, o * 2); o += p.attributes.position.count; }
  for (let i = 0; i < n; i++) nor[i * 3 + 1] = 1;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Grass {
  constructor(scene, T, quality) {
    this.scene = scene;
    this.R = this.baseR = 40 + 35 * quality.grass;
    this.enabled = quality.grass > 0;
    this.dens = Math.min(1, 0.45 + quality.grass * 0.55); // fewer, bigger clumps on light presets
    this.tiles = new Map();
    this.queue = [];
    this.center = null;
    this.dirty = false;
    this.rebuildT = 0;
    if (!this.enabled) return;
    this.uR = { value: this.R };
    const mk = (tex, key, h) => {
      const m = coverageHook(windHook(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.88 }), { height: h, sway: 0.16, flutter: 0.03, key }));
      m.userData.hooks.push((s) => {
        s.uniforms.uGrassR = this.uR;
        s.vertexShader = s.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uGrassR;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            #ifdef USE_INSTANCING
              { vec3 ipos = instanceMatrix[3].xyz; float gd = length(ipos.xz - cameraPosition.xz); transformed *= 1.0 - smoothstep(uGrassR * 0.72, uGrassR, gd); }
            #endif`);
      });
      m.userData.cacheKey += '-grass';
      return m;
    };
    const area = Math.PI * this.R * this.R * (1 / (STEP * STEP)) * 0.55 * this.dens;
    const spec = {
      lawn: [lawnTex(), 0.95, 0.5, 0.75],
      tall: [tallTex(), 0.85, 1.05, 0.4],
      dry: [dryTex(), 0.95, 0.6, 0.55],
      weed: [weedTex(), 0.55, 0.3, 0.18],
      flower: [flowerTex(), 0.8, 0.55, 0.22],
    };
    this.meshes = KINDS.map((k) => {
      const [tex, w, h, share] = spec[k];
      const cap = Math.max(256, Math.round(area * share));
      const m = new THREE.InstancedMesh(clumpGeometry(w, h, k === 'weed' ? 2 : 3), mk(tex, 'g-' + k, h), cap);
      m.count = 0; m.frustumCulled = false; m.receiveShadow = true; m.castShadow = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      m.cap = cap;
      return m;
    });
    this.splat = new Float32Array(8);
  }

  // ---------------------------------------------------------------- what grows here
  // ground node: [height, cover 0..1, dryness 0..1, tallness 0..1, lushness 0..1, weediness, meadow]
  node(x, z) {
    const h = heightAt(x, z);
    const out = [h, 0, 0, 0, 0, 0, 0];
    if (h < WORLD.sea + 0.6 || waterLevelAt(x, z, h) !== null) return out;
    const ny = normalAt(x, z, 1.5)[1];
    const S = splatAt(x, z, h, ny, this.splat); // forest, jungle, sand, rock, snow, dirt, wet
    const grassL = Math.max(0, 1 - (S[0] + S[1] + S[2] + S[3] + S[4] + S[5]));
    const reg = regionAt(x, z, h);
    let cover = grassL + S[0] * 0.3 + S[1] * 0.85;
    if (reg === 'n') cover = Math.min(cover, 0.55 + S[5] * 0.4) * (1 - S[4]);   // tundra tussocks, nothing on snow
    if (reg === 'w') cover *= 0.15;                                            // scrub in the desert
    if (reg === 'beach') cover *= 0.25;                                        // dune grass
    cover *= 1 - S[6];                                                         // no grass in mud / shallows
    cover *= smooth(0.72, 0.84, ny);                                           // none on steep rock
    cover *= smooth(2.2, 4.5, roadDist(x, z));                                 // roads and their verges
    // slow fields that make patches
    const f1 = fbm(NZ, x / 90, z / 90, 3), f2 = fbm(NZ, x / 47 + 100, z / 47, 2), f3 = fbm(NZ, x / 23 - 50, z / 23 + 30, 2);
    out[1] = Math.min(1, cover * 1.15);
    out[2] = reg === 'w' || reg === 'beach' ? 1 : reg === 'n' ? 0.75 : smooth(0.2, 0.65, f1) * 0.42;
    out[3] = reg === 'e' ? 0.65 + f2 * 0.3 : smooth(-0.1, 0.5, f2) * 0.8 + S[0] * 0.2;
    out[4] = smooth(-0.5, 0.4, -f1);
    out[5] = smooth(0.2, 0.55, f3);
    out[6] = Math.sin(x / 37 + Math.sin(z / 53)) * Math.sin(z / 29 + Math.sin(x / 61));
    return out;
  }

  genTile(tx, tz) {
    const x0 = tx * TILE, z0 = tz * TILE;
    const rng = mulberry32((tx * 92837111) ^ (tz * 689287499) ^ 0x6a55);
    const N = [];
    let any = false;
    for (let j = 0; j < NN; j++) for (let i = 0; i < NN; i++) { const n = this.node(x0 + i * NODE, z0 + j * NODE); N.push(n); if (n[1] > 0.02) any = true; }
    if (!any) return { n: 0 };
    const nearBuilt = POIS.some((p) => Math.hypot(x0 + TILE / 2 - p.x, z0 + TILE / 2 - p.z) < p.r + 40);
    const data = new Float32Array(SLOTS * SLOTS * 11);
    let n = 0;
    const lerpN = (fx, fz, k) => {
      const i = Math.min(NN - 2, Math.floor(fx)), j = Math.min(NN - 2, Math.floor(fz)), u = fx - i, v = fz - j;
      const a = N[j * NN + i][k], b = N[j * NN + i + 1][k], c = N[(j + 1) * NN + i][k], d = N[(j + 1) * NN + i + 1][k];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    for (let sj = 0; sj < SLOTS; sj++) for (let si = 0; si < SLOTS; si++) {
      const lx = (si + 0.15 + rng() * 0.7) * STEP, lz = (sj + 0.15 + rng() * 0.7) * STEP;
      const fx = lx / NODE, fz = lz / NODE;
      const cover = lerpN(fx, fz, 1);
      const keepHere = rng();
      if (keepHere > cover * this.dens) continue;
      const x = x0 + lx, z = z0 + lz;
      if (nearBuilt && groundCovered(x, z)) continue;
      const y = lerpN(fx, fz, 0) - 0.04;
      const dry = lerpN(fx, fz, 2), tall = lerpN(fx, fz, 3), lush = lerpN(fx, fz, 4), weed = lerpN(fx, fz, 5), meadow = lerpN(fx, fz, 6);
      // which plant
      const r = rng();
      let kind;
      if (r < dry * 0.85) kind = K.dry;
      else if (meadow > 0.35 && lush > 0.3 && rng() < 0.3) kind = K.flower;
      else if (rng() < weed * 0.35) kind = K.weed;
      else if (rng() < tall * 0.75) kind = K.tall;
      else kind = K.lawn;
      const a = rng() * Math.PI * 2;
      const sw = 0.75 + rng() * 0.5;
      const sh = sw * (0.75 + rng() * 0.5) * (kind === K.lawn ? 0.8 + tall * 0.6 : 1);
      // colour: lush green to sun-yellowed, a little per-clump noise
      let cr, cg, cb;
      if (kind === K.flower) { const b = BLOOMS[Math.floor(rng() * BLOOMS.length)]; [cr, cg, cb] = b; }
      else {
        const k2 = 0.88 + rng() * 0.24;
        cr = (0.78 + (1 - lush) * 0.38) * k2; cg = (0.98 - (1 - lush) * 0.05) * k2; cb = (0.72 - (1 - lush) * 0.2) * k2;
        if (kind === K.dry) { cr = 0.95 * k2; cg = 0.9 * k2; cb = 0.8 * k2; }
      }
      const o = n * 11;
      data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = Math.cos(a); data[o + 4] = Math.sin(a);
      data[o + 5] = sw; data[o + 6] = sh; data[o + 7] = cr; data[o + 8] = cg; data[o + 9] = cb;
      data[o + 10] = kind + rng() * 0.999; // kind in the integer part, LOD rank in the fraction
      n++;
    }
    return { n, data };
  }

  update(pos, dt = 0.016) {
    if (!this.enabled) return;
    const tx = Math.floor(pos.x / TILE), tz = Math.floor(pos.z / TILE);
    const key = `${tx},${tz}`;
    if (key !== this.center) {
      this.center = key;
      const R = Math.ceil(this.R / TILE) + 1;
      const want = new Set();
      const add = [];
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dz) * TILE;
        if (d > this.R + TILE) continue;
        const k = `${tx + dx},${tz + dz}`;
        want.add(k);
        if (!this.tiles.has(k)) add.push({ k, tx: tx + dx, tz: tz + dz, d });
      }
      for (const k of this.tiles.keys()) if (!want.has(k)) this.tiles.delete(k);
      add.sort((a, b) => a.d - b.d);
      this.queue = add;
      this.dirty = true;
    }
    // build new tiles a few milliseconds at a time (all of them when the game is loading)
    const t0 = performance.now(), budget = dt === 0 ? 1e9 : 4;
    while (this.queue.length && performance.now() - t0 < budget) {
      const q = this.queue.shift();
      if (!this.tiles.has(q.k)) { this.tiles.set(q.k, this.genTile(q.tx, q.tz)); this.dirty = true; }
    }
    this.rebuildT -= dt;
    if (this.dirty && (this.rebuildT <= 0 || !this.queue.length)) { this.rebuild(pos); this.rebuildT = 0.3; }
  }

  rebuild(pos) {
    this.dirty = false;
    const cnt = [0, 0, 0, 0, 0];
    const M = this.meshes.map((m) => m.instanceMatrix.array), C = this.meshes.map((m) => m.instanceColor.array);
    const near = 16, R = this.R;
    for (const t of this.tiles.values()) {
      if (!t.n) continue;
      const d = t.data;
      // tile distance decides how sparse (and how big) its clumps are
      const tdx = d[0] - pos.x, tdz = d[2] - pos.z;
      const td = Math.max(0, Math.hypot(tdx, tdz) - TILE * 0.7);
      for (let i = 0; i < t.n; i++) {
        const o = i * 11;
        const x = d[o], z = d[o + 2];
        const dist = td < near ? Math.hypot(x - pos.x, z - pos.z) : td;
        if (dist > R) continue;
        const keep = dist < near ? 1 : Math.max(0.22, 1 - ((dist - near) / (R - near)) * 0.8);
        const v = d[o + 10], kind = Math.floor(v), rank = v - kind;
        if (rank > keep) continue;
        const mesh = this.meshes[kind];
        const c = cnt[kind];
        if (c >= mesh.cap) continue;
        const grow = 1 / Math.sqrt(keep);
        const sw = d[o + 5] * grow, sh = d[o + 6] * (1 + (grow - 1) * 0.4);
        const cs = d[o + 3], sn = d[o + 4];
        const e = M[kind], b = c * 16;
        e[b] = cs * sw; e[b + 1] = 0; e[b + 2] = -sn * sw; e[b + 3] = 0;
        e[b + 4] = 0; e[b + 5] = sh; e[b + 6] = 0; e[b + 7] = 0;
        e[b + 8] = sn * sw; e[b + 9] = 0; e[b + 10] = cs * sw; e[b + 11] = 0;
        e[b + 12] = x; e[b + 13] = d[o + 1]; e[b + 14] = z; e[b + 15] = 1;
        const col = C[kind], cb = c * 3;
        col[cb] = d[o + 7]; col[cb + 1] = d[o + 8]; col[cb + 2] = d[o + 9];
        cnt[kind] = c + 1;
      }
    }
    this.meshes.forEach((m, k) => { m.count = cnt[k]; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; });
    this.total = cnt.reduce((a, b) => a + b, 0);
  }

  setViewDistance(vd) {
    if (!this.enabled) return;
    this.R = this.baseR * Math.min(1.35, Math.max(0.55, vd / 1600));
    this.uR.value = this.R;
    this.center = null;
  }

  // compatibility with older callers
  get green() { return this.meshes ? { count: this.total || 0 } : null; }
  get flowers() { return this.meshes ? this.meshes[K.flower] : null; }
}
