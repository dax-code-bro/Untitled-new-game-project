// Instanced grass clumps around the player, streamed in 12 m tiles, swaying in the wind
// and shrinking smoothly at the edge of the grass radius (no popping).
import * as THREE from 'three';
import { heightAt, normalAt, regionAt, snowAt, POIS } from './terrain.js';
import { waterLevelAt } from './physics.js';
import { mulberry32 } from './noise.js';
import { windHook, coverageHook, SHARED } from './materials.js';

const TILE = 12;
const DENSITY = { s: 34, e: 40, hub: 30, n: 14, w: 3, beach: 2 };

function clumpGeometry() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(1.1, 0.8, 1, 2);
    g.translate(0, 0.4, 0);
    // bend the top forward a little
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const t = p.getY(k) / 0.8; p.setZ(k, t * t * 0.18); }
    g.rotateY((i / 3) * Math.PI);
    parts.push(g.toNonIndexed());
  }
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), nor = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) { pos.set(p.attributes.position.array, o * 3); uv.set(p.attributes.uv.array, o * 2); o += p.attributes.position.count; }
  for (let i = 0; i < n; i++) { nor[i * 3 + 1] = 1; } // up-facing normals: lit like the ground under it
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export class Grass {
  constructor(scene, T, quality) {
    this.scene = scene;
    this.R = 40 + 35 * quality.grass;
    this.enabled = quality.grass > 0;
    this.tiles = new Map();
    this.center = null;
    if (!this.enabled) return;
    this.uR = { value: this.R };
    const mk = (tex, key) => {
      const m = coverageHook(windHook(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }), { height: 0.8, sway: 0.16, flutter: 0.03, key }));
      m.userData.hooks.push((s) => {
        s.uniforms.uGrassR = this.uR;
        s.vertexShader = s.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uGrassR;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            #ifdef USE_INSTANCING
              { vec3 ipos = instanceMatrix[3].xyz; float gd = length(ipos.xz - cameraPosition.xz); transformed.y *= 1.0 - smoothstep(uGrassR * 0.65, uGrassR, gd); }
            #endif`);
      });
      m.userData.cacheKey += '-grass';
      return m;
    };
    this.cap = Math.round(60000 * Math.max(0.5, quality.grass));
    this.green = new THREE.InstancedMesh(clumpGeometry(), mk(T.grassBlades, 'grass'), this.cap);
    this.dry = new THREE.InstancedMesh(clumpGeometry(), mk(T.dryGrass, 'drygrass'), Math.round(this.cap / 4));
    for (const m of [this.green, this.dry]) {
      m.count = 0; m.frustumCulled = false; m.receiveShadow = true; m.castShadow = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.green.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
  }

  genTile(tx, tz) {
    const rng = mulberry32((tx * 92837111) ^ (tz * 689287499) ^ 0x6a55);
    const x0 = tx * TILE, z0 = tz * TILE;
    const reg = regionAt(x0 + TILE / 2, z0 + TILE / 2);
    const n = DENSITY[reg] || 0;
    const out = [];
    if (!n) return out;
    const nearPoi = POIS.some((p) => Math.hypot(x0 - p.x, z0 - p.z) < p.r * 0.85);
    for (let i = 0; i < n; i++) {
      const x = x0 + rng() * TILE, z = z0 + rng() * TILE;
      const h = heightAt(x, z);
      if (waterLevelAt(x, z, h) !== null || h < 1.5) continue;
      if (snowAt(x, z, h)) continue;
      if (nearPoi && rng() < 0.85) continue;
      if (normalAt(x, z, 1.5)[1] < 0.86) continue;
      const dry = reg === 'w' || reg === 'beach' || (reg === 'n' && rng() < 0.6);
      out.push({ x, y: h - 0.05, z, s: 0.7 + rng() * 0.8, r: rng() * Math.PI * 2, dry, hue: rng() });
    }
    return out;
  }

  update(pos) {
    if (!this.enabled) return;
    const tx = Math.floor(pos.x / TILE), tz = Math.floor(pos.z / TILE);
    const key = `${tx},${tz}`;
    if (key === this.center) return;
    this.center = key;
    const R = Math.ceil(this.R / TILE);
    const want = new Set();
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (Math.hypot(dx, dz) * TILE > this.R + TILE) continue;
      const k = `${tx + dx},${tz + dz}`;
      want.add(k);
      if (!this.tiles.has(k)) this.tiles.set(k, this.genTile(tx + dx, tz + dz));
    }
    for (const k of this.tiles.keys()) if (!want.has(k)) this.tiles.delete(k);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    let g = 0, d = 0;
    for (const list of this.tiles.values()) for (const it of list) {
      q.setFromAxisAngle(up, it.r); s.set(it.s, it.s * (0.8 + it.hue * 0.5), it.s); p.set(it.x, it.y, it.z);
      m4.compose(p, q, s);
      if (it.dry) { if (d < this.dry.instanceMatrix.count) this.dry.setMatrixAt(d++, m4); }
      else if (g < this.cap) {
        this.green.setMatrixAt(g, m4);
        c.setRGB(0.85 + it.hue * 0.3, 0.9 + it.hue * 0.2, 0.8 + it.hue * 0.15);
        this.green.setColorAt(g, c);
        g++;
      }
    }
    this.green.count = g; this.dry.count = d;
    this.green.instanceMatrix.needsUpdate = true; this.dry.instanceMatrix.needsUpdate = true;
    if (this.green.instanceColor) this.green.instanceColor.needsUpdate = true;
    void SHARED;
  }
}
