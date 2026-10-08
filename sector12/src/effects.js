// Visual effects.
//  * Soft particles: two instanced billboard systems (alpha-blended smoke/dust/blood, additive
//    fire/sparks/flashes) simulated on the CPU with gravity, drag, growth, spin and velocity stretch.
//  * Decals: bullet holes per surface, blood splats and scorch marks, pooled instanced quads.
//  * Physical brass: casings and dropped magazines tumble, bounce off the ground and settle.
//  * Composite effects built from those: surface-aware impacts, muzzle blasts, explosions with a
//    fireball / shockwave / smoke column / debris / light, water splashes, blood sprays, foot dust.
import * as THREE from 'three';
import { heightAt, colorAt, normalAt } from './terrain.js';
import { waterLevelAt } from './physics.js';

const puffGeo = new THREE.SphereGeometry(1, 8, 6);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- textures
function canvasTex(n, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  draw(c.getContext('2d'), n);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const smokeTex = () => canvasTex(128, (g, n) => {
  for (let i = 0; i < 22; i++) {
    const x = n / 2 + (Math.random() - 0.5) * n * 0.35, y = n / 2 + (Math.random() - 0.5) * n * 0.35, r = n * (0.15 + Math.random() * 0.2);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
  }
});
const glowTex = () => canvasTex(64, (g, n) => {
  const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
});
// decal atlas: 0 bullet hole (hard), 1 bullet hole (wood), 2 blood splat, 3 scorch, 4 dirt hit
const decalTex = () => canvasTex(512, (g) => {
  const cell = (i, f) => { g.save(); g.translate((i % 4) * 128 + 64, Math.floor(i / 4) * 128 + 64); f(); g.restore(); };
  cell(0, () => {
    for (let k = 0; k < 14; k++) { g.strokeStyle = 'rgba(60,60,60,0.5)'; g.lineWidth = 1; const a = Math.random() * 6.3, r = 14 + Math.random() * 30; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.stroke(); }
    let gr = g.createRadialGradient(0, 0, 0, 0, 0, 34); gr.addColorStop(0, 'rgba(90,90,90,0.8)'); gr.addColorStop(1, 'rgba(90,90,90,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 34, 0, 7); g.fill();
    gr = g.createRadialGradient(0, 0, 0, 0, 0, 11); gr.addColorStop(0, 'rgba(5,5,5,1)'); gr.addColorStop(0.8, 'rgba(20,18,16,1)'); gr.addColorStop(1, 'rgba(20,18,16,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 11, 0, 7); g.fill();
  });
  cell(1, () => {
    g.fillStyle = 'rgba(200,160,110,0.55)'; for (let k = 0; k < 9; k++) { g.save(); g.rotate(Math.random() * 6.3); g.fillRect(0, -2, 18 + Math.random() * 20, 4); g.restore(); }
    g.fillStyle = 'rgba(10,8,6,1)'; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill();
  });
  cell(2, () => {
    g.fillStyle = 'rgba(80,4,4,0.9)';
    g.beginPath(); g.arc(0, 0, 26, 0, 7); g.fill();
    for (let k = 0; k < 16; k++) { const a = Math.random() * 6.3, r = 24 + Math.random() * 34, s = 2 + Math.random() * 7; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, s, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(40,0,0,0.6)'; g.beginPath(); g.arc(4, -3, 15, 0, 7); g.fill();
  });
  cell(3, () => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 62); gr.addColorStop(0, 'rgba(8,6,5,0.95)'); gr.addColorStop(0.55, 'rgba(20,16,12,0.7)'); gr.addColorStop(1, 'rgba(20,16,12,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 62, 0, 7); g.fill();
  });
  cell(4, () => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30); gr.addColorStop(0, 'rgba(30,22,14,0.85)'); gr.addColorStop(1, 'rgba(30,22,14,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 30, 0, 7); g.fill();
  });
});

// ---------------------------------------------------------------- billboard particle system
const PVERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 iPos; attribute vec4 iCol; attribute vec4 iMisc; // size, rot, stretch, unused
attribute vec3 iVel;
varying vec2 vUv; varying vec4 vCol;
void main() {
  vUv = uv; vCol = iCol;
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  vec2 c = position.xy * iMisc.x;
  float cr = cos(iMisc.y), sr = sin(iMisc.y);
  c = vec2(c.x * cr - c.y * sr, c.x * sr + c.y * cr);
  if (iMisc.z > 0.0) {
    // stretch along the on-screen velocity (sparks, droplets)
    vec2 vv = (viewMatrix * vec4(iVel, 0.0)).xy;
    float l = length(vv);
    if (l > 1e-4) { vec2 ax = vv / l; vec2 px = vec2(-ax.y, ax.x); c = ax * position.y * (iMisc.x + l * iMisc.z) + px * position.x * iMisc.x * 0.5; }
  }
  mv.xy += c;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const PFRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map; uniform vec3 uLight;
varying vec2 vUv; varying vec4 vCol;
void main() {
  #include <logdepthbuf_fragment>
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(vCol.rgb * t.rgb * uLight, t.a * vCol.a);
}`;

class Particles {
  constructor(scene, cap, tex, additive) {
    this.cap = cap;
    this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.attributes.position = q.attributes.position; g.attributes.uv = q.attributes.uv;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iMisc', this.aMisc); g.setAttribute('iVel', this.aVel);
    g.instanceCount = 0;
    this.uLight = { value: new THREE.Color(1, 1, 1) };
    const m = new THREE.ShaderMaterial({
      vertexShader: PVERT, fragmentShader: PFRAG, uniforms: { map: { value: tex }, uLight: this.uLight },
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 5;
    scene.add(this.mesh);
    this.geo = g;
    // particle state (struct of arrays)
    const F = (k) => new Float32Array(cap * k);
    this.p = F(3); this.v = F(3); this.c = F(3); this.life = F(1); this.max = F(1); this.s0 = F(1); this.s1 = F(1);
    this.a = F(1); this.rot = F(1); this.rv = F(1); this.drag = F(1); this.grav = F(1); this.str = F(1); this.fade = F(1);
  }

  // o: {pos, vel, color [r,g,b] 0..1, life, size, grow (end size), alpha, rot, spin, drag, gravity, stretch, fadeIn}
  emit(o) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.p[i * 3] = o.pos.x; this.p[i * 3 + 1] = o.pos.y; this.p[i * 3 + 2] = o.pos.z;
    const v = o.vel || V();
    this.v[i * 3] = v.x; this.v[i * 3 + 1] = v.y; this.v[i * 3 + 2] = v.z;
    const c = o.color || [1, 1, 1];
    this.c[i * 3] = c[0]; this.c[i * 3 + 1] = c[1]; this.c[i * 3 + 2] = c[2];
    this.life[i] = this.max[i] = o.life || 1;
    this.s0[i] = o.size || 0.2; this.s1[i] = o.grow ?? this.s0[i];
    this.a[i] = o.alpha ?? 1; this.rot[i] = o.rot ?? Math.random() * 6.28; this.rv[i] = o.spin ?? 0;
    this.drag[i] = o.drag ?? 0; this.grav[i] = o.gravity ?? 0; this.str[i] = o.stretch ?? 0; this.fade[i] = o.fadeIn ?? 0.1;
  }

  update(dt) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        n--;
        if (i !== n) this.copy(n, i);
        i--;
        continue;
      }
      const dr = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= dr; this.v[i * 3 + 1] = this.v[i * 3 + 1] * dr - this.grav[i] * dt; this.v[i * 3 + 2] *= dr;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.rot[i] += this.rv[i] * dt;
    }
    this.n = n;
    const P = this.aPos.array, C = this.aCol.array, Mi = this.aMisc.array, Ve = this.aVel.array;
    for (let i = 0; i < n; i++) {
      const t = 1 - this.life[i] / this.max[i];
      const fin = this.fade[i] > 0 ? Math.min(1, t / this.fade[i]) : 1;
      const alpha = this.a[i] * fin * (1 - t) * (1 - t * 0.3);
      P[i * 3] = this.p[i * 3]; P[i * 3 + 1] = this.p[i * 3 + 1]; P[i * 3 + 2] = this.p[i * 3 + 2];
      Ve[i * 3] = this.v[i * 3]; Ve[i * 3 + 1] = this.v[i * 3 + 1]; Ve[i * 3 + 2] = this.v[i * 3 + 2];
      C[i * 4] = this.c[i * 3]; C[i * 4 + 1] = this.c[i * 3 + 1]; C[i * 4 + 2] = this.c[i * 3 + 2]; C[i * 4 + 3] = alpha;
      Mi[i * 4] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t); Mi[i * 4 + 1] = this.rot[i]; Mi[i * 4 + 2] = this.str[i];
    }
    this.geo.instanceCount = n;
    if (n) { this.aPos.needsUpdate = this.aCol.needsUpdate = this.aMisc.needsUpdate = this.aVel.needsUpdate = true; }
  }

  copy(from, to) {
    for (const k of ['p', 'v', 'c']) for (let j = 0; j < 3; j++) this[k][to * 3 + j] = this[k][from * 3 + j];
    for (const k of ['life', 'max', 's0', 's1', 'a', 'rot', 'rv', 'drag', 'grav', 'str', 'fade']) this[k][to] = this[k][from];
  }
}

// ---------------------------------------------------------------- decals
class Decals {
  constructor(scene, tex, cap = 400) {
    this.cap = cap;
    this.i = 0;
    const g = new THREE.PlaneGeometry(1, 1);
    // per-instance atlas cell through a uv offset attribute
    this.cell = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    g.setAttribute('aCell', this.cell);
    const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.9 });
    const hook = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = (vMapUv + aCell) * 0.25;\n#endif');
    };
    // the graphics patcher chains userData.hooks (it replaces onBeforeCompile)
    m.userData.hooks = [hook];
    m.userData.cacheKey = 'decal-atlas';
    m.onBeforeCompile = hook;
    m.customProgramCacheKey = () => 'decal-atlas';
    this.mesh = new THREE.InstancedMesh(g, m, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }
  // cell: atlas index; n: surface normal
  add(pos, n, size, cell, rot = Math.random() * 6.28) {
    const i = this.i;
    this.i = (this.i + 1) % this.cap;
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), rot));
    const m = new THREE.Matrix4().compose(V().copy(pos).addScaledVector(n, 0.01), q, V(size, size, size));
    this.mesh.setMatrixAt(i, m);
    this.cell.setXY(i, cell % 4, 3 - Math.floor(cell / 4));
    this.cell.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.count = Math.min(this.cap, Math.max(this.mesh.count, i + 1));
  }
}

// ---------------------------------------------------------------- brass + debris
const CASING = { rifle: [0.0055, 0.045, 0xc09a3a], pistol: [0.0058, 0.022, 0xc09a3a], big: [0.011, 0.1, 0xc09a3a], shell: [0.0105, 0.065, 0x9a1e1a] };

export class Effects {
  constructor(scene, audio = null) {
    this.scene = scene;
    this.audio = audio;
    this.items = [];
    this.smoke = new Particles(scene, 3000, smokeTex(), false);
    this.glow = new Particles(scene, 2500, glowTex(), true);
    this.decals = new Decals(scene, decalTex(), 500);
    this.bodies = []; // casings / mags / chunks with simple rigid physics
    this.casingMesh = {};
    for (const [k, [r, l, col]] of Object.entries(CASING)) {
      const geo = new THREE.CylinderGeometry(r, r, l, 8);
      geo.rotateZ(Math.PI / 2);
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: col, metalness: k === 'shell' ? 0.1 : 1, roughness: 0.3 }), 120);
      m.count = 0; m.frustumCulled = false; m.castShadow = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      this.casingMesh[k] = { mesh: m, list: [], i: 0 };
    }
    this.lights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffa060, 0, 30, 1.6); scene.add(l); return { l, t: 0, max: 1, i: 0 }; });
    this.rings = [];
    this.camPos = V();
  }

  // ambient light for unlit particles (set by the game from the sky)
  setLight(c) { this.smoke.uLight.value.copy(c); }

  flashLight(pos, color, intensity, life, range = 30) {
    const L = this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    L.l.position.copy(pos); L.l.color.setHex(color); L.l.distance = range; L.i = intensity; L.t = L.max = life;
  }

  // ---------------------------------------------------------------- legacy helpers
  tracer(a, b, color = 0xffd27a, life = 0.07) {
    // a bright streak that travels from a to b
    const d = V().subVectors(b, a), len = d.length();
    if (len < 0.5) return;
    const speed = 700, dir = d.clone().divideScalar(len);
    const n = Math.min(40, Math.ceil(len / 25));
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * len;
      this.glow.emit({ pos: V().copy(a).addScaledVector(dir, t), vel: V().copy(dir).multiplyScalar(speed), color: [c.r * 1.5, c.g * 1.4, c.b], life: Math.min(life * 3, (len - t) / speed + 0.01), size: 0.05, stretch: 0.012, alpha: 0.9, fadeIn: 0 });
    }
  }

  puff(p, color, size = 0.12, life = 0.35, rise = 0, grow = 2.5, opacity = 0.9) {
    const c = new THREE.Color(color);
    this.smoke.emit({ pos: p, vel: V(0, rise, 0), color: [c.r, c.g, c.b], life, size: size * 2, grow: size * 2 * (1 + grow), alpha: opacity, drag: 1 });
  }

  blood(pos) {
    const h = heightAt(pos.x, pos.z);
    this.decals.add(V(pos.x + rnd(-0.3, 0.3), h, pos.z + rnd(-0.3, 0.3)), V(...normalAt(pos.x, pos.z, 1)), rnd(0.12, 0.3), 2);
  }

  // ---------------------------------------------------------------- composite effects
  // surface: 'terrain' | 'snow' | 'sand' | 'wood' | 'rock' | 'concrete' | 'metal' | 'water' | 'flesh' | 'armor'
  impact(pt, n, surface, dir, big = 1) {
    const refl = V().copy(dir).addScaledVector(n, -2 * dir.dot(n)).normalize();
    const out = V().copy(n).lerp(refl, 0.4).normalize();
    const emitDust = (col, count, size, speed, life = 1.2) => {
      for (let i = 0; i < count; i++) this.smoke.emit({ pos: pt, vel: V().copy(out).multiplyScalar(rnd(0.3, 1) * speed).add(V(rnd(-0.4, 0.4), rnd(0, 0.5), rnd(-0.4, 0.4))), color: col, life: rnd(life * 0.6, life), size: size * 0.5, grow: size * rnd(1.5, 2.5), alpha: 0.6, drag: 3, gravity: -0.15 });
    };
    const chunks = (col, count, speed, size = 0.025) => {
      for (let i = 0; i < count; i++) this.smoke.emit({ pos: pt, vel: V().copy(out).multiplyScalar(rnd(0.5, 1) * speed).add(V(rnd(-1, 1), rnd(0, 1.5), rnd(-1, 1))), color: col, life: rnd(0.4, 0.9), size, grow: size, alpha: 1, gravity: 9.8, drag: 0.5, spin: rnd(-10, 10), fadeIn: 0 });
    };
    const sparks = (count, speed) => {
      for (let i = 0; i < count; i++) this.glow.emit({ pos: pt, vel: V().copy(refl).multiplyScalar(rnd(0.3, 1) * speed).add(V(rnd(-2, 2), rnd(-1, 2), rnd(-2, 2))), color: [1.6, 1.0, 0.45], life: rnd(0.12, 0.35), size: 0.012, stretch: 0.02, gravity: 9.8, drag: 1.5, fadeIn: 0 });
    };
    big = Math.max(0.6, big);
    switch (surface) {
      case 'snow': emitDust([0.95, 0.97, 1], 6 * big, 0.25, 2.5, 1.6); chunks([0.95, 0.97, 1], 6, 3, 0.03); this.decals.add(pt, n, 0.08, 4); break;
      case 'sand': emitDust([0.82, 0.7, 0.5], 7 * big, 0.28, 2.2, 1.5); chunks([0.7, 0.6, 0.42], 8, 3); this.decals.add(pt, n, 0.08, 4); break;
      case 'terrain': {
        const c = colorAt(pt.x, pt.z, pt.y, n.y, [0, 0, 0]);
        emitDust([c[0] * 0.9 + 0.15, c[1] * 0.85 + 0.12, c[2] * 0.8 + 0.1], 6 * big, 0.22, 2, 1.3); chunks([c[0] * 0.6, c[1] * 0.55, c[2] * 0.5], 7, 3.5);
        this.decals.add(pt, n, 0.1, 4);
        break;
      }
      case 'wood': emitDust([0.55, 0.45, 0.32], 4, 0.15, 1.5, 0.9); chunks([0.75, 0.6, 0.4], 9, 4, 0.02); this.decals.add(pt, n, 0.09, 1); break;
      case 'rock': emitDust([0.6, 0.6, 0.58], 5, 0.18, 2, 1.1); chunks([0.5, 0.5, 0.48], 7, 5); sparks(3, 6); this.decals.add(pt, n, 0.08, 0); break;
      case 'metal': sparks(14 * big, 9); emitDust([0.4, 0.4, 0.42], 2, 0.1, 1, 0.6); this.glow.emit({ pos: pt, color: [1.4, 1.0, 0.6], life: 0.05, size: 0.2, fadeIn: 0 }); this.decals.add(pt, n, 0.06, 0); break;
      case 'water': this.splash(pt, 0.5 * big); break;
      case 'flesh': this.bloodHit(pt, dir, big); break;
      case 'armor': sparks(10, 7); emitDust([0.5, 0.5, 0.55], 3, 0.1, 1.5, 0.5); break;
      default: emitDust([0.62, 0.6, 0.56], 6 * big, 0.2, 2, 1.2); chunks([0.55, 0.54, 0.5], 8, 4.5); this.decals.add(pt, n, 0.08, 0);
    }
    if (this.audio && this.audio.impact) this.audio.impact(surface, pt.distanceTo(this.camPos));
  }

  bloodHit(pt, dir, big = 1) {
    // entry mist, exit spray along the bullet, droplets that fall and splat
    for (let i = 0; i < 6 * big; i++) this.smoke.emit({ pos: pt, vel: V().copy(dir).multiplyScalar(rnd(-0.6, 1.5)).add(V(rnd(-0.5, 0.5), rnd(-0.2, 0.6), rnd(-0.5, 0.5))), color: [0.45, 0.02, 0.02], life: rnd(0.3, 0.6), size: 0.06, grow: rnd(0.25, 0.4), alpha: 0.75, drag: 4 });
    for (let i = 0; i < 10 * big; i++) this.smoke.emit({ pos: pt, vel: V().copy(dir).multiplyScalar(rnd(1, 4)).add(V(rnd(-1, 1), rnd(0, 1.5), rnd(-1, 1))), color: [0.35, 0.01, 0.01], life: rnd(0.4, 0.8), size: 0.015, stretch: 0.02, gravity: 9.8, alpha: 1, fadeIn: 0 });
    const h = heightAt(pt.x, pt.z);
    if (pt.y - h < 2.5) {
      const g = V(pt.x + dir.x * rnd(0.3, 1.2), h, pt.z + dir.z * rnd(0.3, 1.2));
      this.decals.add(g, V(...normalAt(g.x, g.z, 1)), rnd(0.25, 0.55) * big, 2);
    }
  }

  splash(pt, s = 1) {
    for (let i = 0; i < 18 * s; i++) this.smoke.emit({ pos: pt, vel: V(rnd(-0.8, 0.8), rnd(2.5, 5.5) * s, rnd(-0.8, 0.8)), color: [0.85, 0.9, 0.95], life: rnd(0.5, 1), size: 0.05, grow: 0.18, alpha: 0.8, gravity: 9.8, drag: 0.6 });
    for (let i = 0; i < 6; i++) this.smoke.emit({ pos: pt, vel: V(rnd(-1, 1), 0.4, rnd(-1, 1)), color: [0.9, 0.93, 0.96], life: 1.2, size: 0.15, grow: 0.6 * s, alpha: 0.4, drag: 2 });
    this.ring(pt, 0.05, 1.4 * s, 1.2, 0xdfe8ee, 0.5);
  }

  ring(pt, r0, r1, life, color, opacity) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pt).add(V(0, 0.02, 0));
    m.scale.setScalar(r0);
    this.scene.add(m);
    this.rings.push({ m, r0, r1, life, max: life, op: opacity });
  }

  // third-person muzzle blast: flash, sparks, smoke
  muzzle(pos, dir, big = 1) {
    this.glow.emit({ pos, color: [1.6, 1.1, 0.5], life: 0.05, size: 0.25 * big, fadeIn: 0 });
    for (let i = 0; i < 3; i++) this.glow.emit({ pos: V().copy(pos).addScaledVector(dir, 0.08 * i), vel: V().copy(dir).multiplyScalar(30), color: [1.5, 0.9, 0.4], life: 0.04, size: 0.08 * big, stretch: 0.004, fadeIn: 0 });
    for (let i = 0; i < 3; i++) this.smoke.emit({ pos, vel: V().copy(dir).multiplyScalar(rnd(1, 3)).add(V(rnd(-0.3, 0.3), rnd(0, 0.4), rnd(-0.3, 0.3))), color: [0.75, 0.74, 0.72], life: rnd(0.6, 1.2), size: 0.06, grow: 0.35 * big, alpha: 0.35, drag: 3, gravity: -0.3 });
    this.flashLight(pos, 0xffa050, 3 * big, 0.05, 12);
  }

  explosion(pos, r) {
    // fireball
    for (let i = 0; i < 30; i++) this.glow.emit({ pos: V().copy(pos).add(V(rnd(-0.3, 0.3), rnd(0, 0.3), rnd(-0.3, 0.3)).multiplyScalar(r)), vel: V(rnd(-1, 1), rnd(0, 1.2), rnd(-1, 1)).multiplyScalar(r * 2.2), color: [1.6, rnd(0.6, 0.9), 0.25], life: rnd(0.25, 0.6), size: r * 0.3, grow: r * 0.9, drag: 4, fadeIn: 0 });
    // sparks + debris
    for (let i = 0; i < 40; i++) this.glow.emit({ pos, vel: V(rnd(-1, 1), rnd(0.2, 1.4), rnd(-1, 1)).normalize().multiplyScalar(rnd(8, 22)), color: [1.6, 1.0, 0.4], life: rnd(0.4, 1.1), size: 0.03, stretch: 0.03, gravity: 9.8, drag: 1, fadeIn: 0 });
    const c = colorAt(pos.x, pos.z, pos.y, 1, [0, 0, 0]);
    for (let i = 0; i < 25; i++) this.smoke.emit({ pos, vel: V(rnd(-1, 1), rnd(0.6, 1.6), rnd(-1, 1)).multiplyScalar(rnd(4, 11)), color: [c[0] * 0.5, c[1] * 0.45, c[2] * 0.4], life: rnd(0.8, 1.6), size: rnd(0.04, 0.09), gravity: 9.8, drag: 0.4, spin: rnd(-8, 8), fadeIn: 0 });
    // smoke column, rolling up
    for (let i = 0; i < 26; i++) this.smoke.emit({ pos: V().copy(pos).add(V(rnd(-0.5, 0.5) * r, rnd(0, 0.6) * r, rnd(-0.5, 0.5) * r)), vel: V(rnd(-0.6, 0.6), rnd(1, 3.5), rnd(-0.6, 0.6)), color: [0.22, 0.21, 0.2], life: rnd(3, 6), size: r * 0.4, grow: r * rnd(1.6, 2.6), alpha: 0.75, drag: 0.8, gravity: -0.4, spin: rnd(-0.4, 0.4), fadeIn: 0.15 });
    // ground dust ring + shockwave
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; this.smoke.emit({ pos: V(pos.x, heightAt(pos.x, pos.z) + 0.3, pos.z), vel: V(Math.cos(a), 0.1, Math.sin(a)).multiplyScalar(r * 3), color: [c[0] * 0.8 + 0.1, c[1] * 0.75 + 0.1, c[2] * 0.7 + 0.1], life: rnd(1.5, 2.5), size: r * 0.3, grow: r * 1.2, alpha: 0.5, drag: 2 }); }
    this.ring(V(pos.x, heightAt(pos.x, pos.z), pos.z), 0.2, r * 3, 0.35, 0xffe0b0, 0.5);
    const g = V(pos.x, heightAt(pos.x, pos.z), pos.z);
    if (pos.y - g.y < r) this.decals.add(g, V(...normalAt(g.x, g.z, 2)), r * 1.3, 3);
    this.flashLight(pos, 0xff9040, 60, 0.35, r * 12);
  }

  footDust(pos, color, k = 1) {
    for (let i = 0; i < 3 * k; i++) this.smoke.emit({ pos: V(pos.x + rnd(-0.1, 0.1), pos.y + 0.05, pos.z + rnd(-0.1, 0.1)), vel: V(rnd(-0.4, 0.4), rnd(0.1, 0.5), rnd(-0.4, 0.4)), color, life: rnd(0.6, 1.1), size: 0.08, grow: 0.35 * k, alpha: 0.4, drag: 2 });
  }

  // ---------------------------------------------------------------- physical brass and debris
  casing(pos, vel, kind = 'rifle') {
    const C = this.casingMesh[kind] || this.casingMesh.rifle;
    const b = { pos: pos.clone(), vel: vel.clone(), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(0, 6), rnd(0, 6), rnd(0, 6))), w: V(rnd(-30, 30), rnd(-30, 30), rnd(-30, 30)), r: CASING[kind] ? CASING[kind][0] : 0.006, life: 12, rest: false, bounces: 0, kind, slot: C.i };
    C.i = (C.i + 1) % C.mesh.instanceMatrix.count;
    C.list[b.slot] = b;
    C.mesh.count = Math.max(C.mesh.count, b.slot + 1);
    this.bodies.push(b);
  }

  // a dropped object (magazine etc.) that tumbles, bounces and settles
  debris(obj, pos, quat, scale = 1, vel = null) {
    obj.position.copy(pos);
    obj.quaternion.copy(quat);
    obj.scale.setScalar(scale);
    this.scene.add(obj);
    const b = { obj, pos: pos.clone(), vel: vel ? vel.clone() : V(rnd(-0.3, 0.3), -1, rnd(-0.3, 0.3)), q: quat.clone(), w: V(rnd(-4, 4), rnd(-2, 2), rnd(-4, 4)), r: 0.02 * scale, life: 60, rest: false, bounces: 0 };
    this.bodies.push(b);
  }

  updateBodies(dt) {
    const m4 = new THREE.Matrix4(), dq = new THREE.Quaternion(), one = V(1, 1, 1);
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      b.life -= dt;
      if (!b.rest) {
        b.vel.y -= 9.8 * dt;
        b.pos.addScaledVector(b.vel, dt);
        const wl = waterLevelAt(b.pos.x, b.pos.z);
        const g = heightAt(b.pos.x, b.pos.z) + b.r;
        if (wl !== null && b.pos.y < wl) { b.vel.multiplyScalar(0.9); b.w.multiplyScalar(0.9); if (b.pos.y < g) b.rest = true; }
        if (b.pos.y < g) {
          b.pos.y = g;
          const n = V(...normalAt(b.pos.x, b.pos.z, 0.5));
          const vn = b.vel.dot(n);
          if (vn < 0) b.vel.addScaledVector(n, -vn * 1.35);
          b.vel.multiplyScalar(0.55);
          b.w.multiplyScalar(0.6);
          b.bounces++;
          if (b.bounces <= 2 && this.audio && this.audio.casing && b.kind) this.audio.casing(b.kind, b.pos.distanceTo(this.camPos));
          if (b.vel.lengthSq() < 0.05 || b.bounces > 5) {
            b.rest = true;
            // settle lying on its side
            const e = new THREE.Euler().setFromQuaternion(b.q);
            b.q.setFromEuler(new THREE.Euler(0, e.y, b.kind ? 0 : e.z > 0 ? Math.PI / 2 : 0));
          }
        }
        const wl2 = b.w.length();
        if (wl2 > 0) { dq.setFromAxisAngle(V().copy(b.w).divideScalar(wl2), wl2 * dt); b.q.premultiply(dq); }
      }
      if (b.obj) { b.obj.position.copy(b.pos); b.obj.quaternion.copy(b.q); }
      else {
        const C = this.casingMesh[b.kind];
        if (C.list[b.slot] !== b) { this.bodies.splice(i, 1); continue; }
        m4.compose(b.pos, b.q, b.life < 1 ? V(1, 1, 1).multiplyScalar(Math.max(0.01, b.life)) : one);
        C.mesh.setMatrixAt(b.slot, m4);
        C.mesh.instanceMatrix.needsUpdate = true;
      }
      if (b.life <= 0) {
        if (b.obj) this.scene.remove(b.obj);
        else { const C = this.casingMesh[b.kind]; m4.makeScale(0, 0, 0); C.mesh.setMatrixAt(b.slot, m4); C.mesh.instanceMatrix.needsUpdate = true; C.list[b.slot] = null; }
        this.bodies.splice(i, 1);
      }
    }
  }

  update(dt, camPos = null) {
    if (camPos) this.camPos.copy(camPos);
    this.smoke.update(dt);
    this.glow.update(dt);
    this.updateBodies(dt);
    for (const L of this.lights) { if (L.t > 0) { L.t -= dt; L.l.intensity = L.i * Math.max(0, L.t / L.max); } else L.l.intensity = 0; }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * Math.sqrt(k));
      r.m.material.opacity = r.op * (1 - k);
      if (r.life <= 0) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const k = Math.max(0, it.life / it.max);
      it.obj.material.opacity = (it.op ?? 0.9) * k;
      if (it.grow && !it.flat) it.obj.scale.setScalar(it.size * (1 + (1 - k) * it.grow));
      if (it.rise) it.obj.position.y += it.rise * dt;
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        if (it.obj.geometry !== puffGeo) it.obj.geometry.dispose();
        it.obj.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }
}
