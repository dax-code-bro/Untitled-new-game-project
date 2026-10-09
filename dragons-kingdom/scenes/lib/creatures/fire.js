// Dragon fire: a jet of burning fuel from the mouth, as camera-facing flame sprites (additive,
// HDR so the film finish's bloom and halation pick them up) plus a trail of smoke (alpha),
// and a light that colours the head, the ground and anything near the jet.
//
//   import { createFire, FIRE_PALETTES } from './lib/creatures/fire.js';
//   const fire = createFire({ palette: 'standard', length: 26, seed: 3 });   // metres
//   scene.add(fire.group);
//   // update(t): pure in t - every particle's age and path come from hashes of its index and t
//   fire.update(t, { creature: charcoal, on: 1 });     // aims at the creature's open mouth
//   fire.update(t, { origin, dir, on });                // or explicit (THREE.Vector3)
//
// Palettes (DRAGONS.md): 'standard' - Charcoal's ordinary ORANGE-RED fire (a yellow-white core,
// orange body, red tongues at the edges, dark sooty smoke); 'leaf' - Leaf's unique PURPLISH-BLUE
// fire, a little hotter than normal (a blue-white core, blue body, violet fringe, less and
// paler smoke: hotter fire burns cleaner). Fire is only used on the "Fire" command; nothing on
// the dragons themselves glows.
import * as THREE from 'three';

export const FIRE_PALETTES = {
  standard: {
    core: [1.0, 0.78, 0.45], coreI: 3.2, body: [1.0, 0.34, 0.05], bodyI: 1.7, edge: [0.85, 0.11, 0.02], edgeI: 1.0,
    smoke: [0.035, 0.03, 0.027], smokeAmt: 1.0, light: [1.0, 0.5, 0.18], lightI: 1.0, temp: 1.0,
  },
  leaf: {
    core: [0.55, 0.55, 1.0], coreI: 1.3, body: [0.32, 0.16, 1.0], bodyI: 1.25, edge: [0.62, 0.08, 0.95], edgeI: 1.25,
    smoke: [0.07, 0.068, 0.08], smokeAmt: 0.45, light: [0.55, 0.5, 1.0], lightI: 1.15, temp: 1.12,
  },
};

const fract = (x) => x - Math.floor(x);
const hash = (n, k = 0) => fract(Math.sin(n * 127.1 + k * 311.7 + 0.37) * 43758.5453);

const VERT = /* glsl */`
attribute vec4 aP;      // age (0..1), seed, size (m), stretch
varying vec2 vUv; varying vec4 vP;
uniform vec3 uDir;
void main() {
  vUv = uv; vP = aP;
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  // stretch the sprite along the jet's direction on screen (flames are drawn out by the flow)
  vec3 dv = normalize(mat3(modelViewMatrix) * uDir);
  vec2 d2 = dv.xy; float l2 = length(d2);
  vec2 ax = l2 > 1e-3 ? d2 / l2 : vec2(1.0, 0.0);
  vec2 ay = vec2(-ax.y, ax.x);
  float st = 1.0 + aP.w * l2;
  vec2 off = ax * position.x * aP.z * st + ay * position.y * aP.z;
  c.xy += off;
  gl_Position = projectionMatrix * c;
}`;

const FRAG_FLAME = /* glsl */`
varying vec2 vUv; varying vec4 vP;
uniform vec3 uCore, uBody, uEdge; uniform float uT, uOn;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float age = vP.x, sd = vP.y;
  // ragged, flickering tongue: radial falloff broken up by two octaves of moving noise
  vec2 np = q * 1.7 + vec2(sd * 17.0, sd * 9.0 - uT * 3.0);
  float n = vn(np) * 0.65 + vn(np * 2.3 + 4.1) * 0.35;
  float r = length(q * vec2(1.0, 1.15));
  // billows: each sprite a ragged puff, so the stream breaks into rolling tongues
  float m = smoothstep(0.75, 0.15, r + (n - 0.5) * 1.2) * (0.5 + 0.9 * n);
  if (m <= 0.002) discard;
  // temperature: hottest near the mouth and in the middle of each tongue, cooling to the edges
  float heat = clamp((1.0 - age * 1.7) * (0.5 + 0.7 * (1.0 - r)) + (n - 0.5) * 0.35, 0.0, 1.0);
  vec3 col = heat > 0.55 ? mix(uBody, uCore, (heat - 0.55) / 0.45) : mix(uEdge, uBody, heat / 0.55);
  float fade = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.55, 1.0, age));
  gl_FragColor = vec4(col * m * fade * uOn * 0.55, 1.0);
}`;

const FRAG_SMOKE = /* glsl */`
varying vec2 vUv; varying vec4 vP;
uniform vec3 uSmoke; uniform float uT, uOn, uAmt;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float age = vP.x, sd = vP.y;
  vec2 np = q * 1.3 + vec2(sd * 13.0, sd * 5.0 - uT * 0.8);
  float n = vn(np) * 0.6 + vn(np * 2.1 + 7.3) * 0.4;
  float m = smoothstep(1.0, 0.1, length(q) + (n - 0.5) * 0.8);
  float a = m * smoothstep(0.0, 0.25, age) * (1.0 - smoothstep(0.5, 1.0, age)) * 0.65 * uAmt * uOn;
  if (a <= 0.003) discard;
  gl_FragColor = vec4(uSmoke * (0.8 + 0.4 * n), a);
}`;

/**
 * createFire({ palette, length (m), width (m at the end), rate, seed, flames, smoke })
 * The jet: fuel leaves the mouth at speed, spreads in a cone, slows and rises as it burns;
 * flames live ~0.6 s, smoke ~2 s.
 */
export function createFire(opts = {}) {
  const P = typeof opts.palette === 'object' ? opts.palette : FIRE_PALETTES[opts.palette || 'standard'];
  const len = opts.length ?? 20, width = opts.width ?? len * 0.28;
  const NF = opts.flames ?? 420, NS = opts.smoke ?? 140;
  const seed = opts.seed ?? 1;
  const group = new THREE.Group();
  group.name = 'dragon-fire';
  const quad = new THREE.PlaneGeometry(2, 2);
  const mkInst = (n, frag, extra, blending) => {
    const g = quad.clone();
    const aP = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    g.setAttribute('aP', aP);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: frag, transparent: true, depthWrite: false, blending,
      uniforms: { uDir: { value: new THREE.Vector3(0, 0, 1) }, uT: { value: 0 }, uOn: { value: 1 }, ...extra },
    });
    const m = new THREE.InstancedMesh(g, mat, n);
    m.frustumCulled = false;
    m.castShadow = false; m.receiveShadow = false;
    m.renderOrder = 5;
    return { m, aP };
  };
  const col = (c, i) => new THREE.Vector3(c[0] * i, c[1] * i, c[2] * i);
  const F = mkInst(NF, FRAG_FLAME, { uCore: { value: col(P.core, P.coreI) }, uBody: { value: col(P.body, P.bodyI) }, uEdge: { value: col(P.edge, P.edgeI) } }, THREE.AdditiveBlending);
  const Sm = mkInst(NS, FRAG_SMOKE, { uSmoke: { value: new THREE.Vector3(...P.smoke) }, uAmt: { value: P.smokeAmt } }, THREE.NormalBlending);
  Sm.m.renderOrder = 4;
  group.add(Sm.m, F.m);
  const light = new THREE.PointLight(new THREE.Color(...P.light), 0, len * 2.2, 2);
  light.castShadow = false;
  group.add(light);

  const dummy = new THREE.Object3D();
  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();
  const lifeF = 0.62 / P.temp, lifeS = 2.1;
  const speed = len / (lifeF * 0.72);

  /** Path of a particle of age a (seconds) emitted from o along d (unit), lateral basis s/u. */
  function place(inst, k, i, a, life, o, d, s, u, kind, t) {
    const h1 = hash(i + seed * 101, 1), h2 = hash(i + seed * 101, 2), h3 = hash(i + seed * 101, 3);
    const f = a / life;
    // distance along the jet: fast at first, slowing (drag), the smoke drifts on after the flame
    const x = kind === 0 ? len * (1 - Math.exp(-3.0 * f)) / (1 - Math.exp(-3.0)) * (0.92 + 0.16 * h3)
      : len * (0.6 + 0.7 * f) * (0.85 + 0.3 * h3);
    // cone spread grows with distance; each particle has its own angle; turbulence wobbles it
    const ang = h1 * Math.PI * 2, rad = Math.sqrt(h2) * (width * 0.5) * (kind === 0 ? 0.12 + 0.88 * f : 1.6);
    const wob = (Math.sin(t * 7.0 + i * 1.7) * 0.5 + Math.sin(t * 11.3 + i * 0.7) * 0.3) * width * 0.08 * f;
    const lat = rad + wob;
    const rise = (kind === 0 ? 0.12 : 0.5) * len * f * f;      // hot gas rises as it slows
    _w.copy(o).addScaledVector(d, x).addScaledVector(s, Math.cos(ang) * lat).addScaledVector(u, Math.sin(ang) * lat);
    _w.y += rise;
    dummy.position.copy(_w);
    dummy.updateMatrix();
    inst.m.setMatrixAt(k, dummy.matrix);
    const size = kind === 0 ? (0.022 * len + 0.42 * width * Math.pow(f, 1.2)) * (0.7 + 0.6 * h3) : (0.1 * len + 0.55 * width * f) * (0.7 + 0.6 * h3);
    inst.aP.setXYZW(k, f, h1, size, kind === 0 ? 1.8 * (1 - f) : 0.2);
  }

  const api = {
    group, light, palette: P,
    /** Pure in t. o: { creature, on (0..1), origin, dir } */
    update(t, o = {}) {
      const on = Math.max(0, Math.min(1, o.on ?? 1));
      group.visible = on > 0.001;
      if (!group.visible) { light.intensity = 0; return; }
      if (o.creature) {
        const c = o.creature;
        c.root.updateMatrixWorld(true);
        const hb = c.bones[c.boneIndex.head];
        const sock = c.anatomy.sockets.mouth;
        const jb = c.bones[c.boneIndex[sock.bone]];
        _o.set(...sock.pos).applyMatrix4(c.skeleton.boneInverses[c.boneIndex[sock.bone]]).applyMatrix4(jb.matrixWorld);
        const ez = c.anatomy.head.frame.ez;
        const q = hb.getWorldQuaternion(new THREE.Quaternion());
        _d.set(ez[0], ez[1], ez[2]).applyQuaternion(q).normalize();
        // the jet leaves from just in front of the teeth
        _o.addScaledVector(_d, c.anatomy.head.H * 0.45);
      } else {
        _o.copy(o.origin); _d.copy(o.dir).normalize();
      }
      _s.set(0, 1, 0).cross(_d);
      if (_s.lengthSq() < 1e-6) _s.set(1, 0, 0);
      _s.normalize();
      _u.crossVectors(_d, _s).normalize();
      for (const inst of [F, Sm]) { inst.m.material.uniforms.uDir.value.copy(_d); inst.m.material.uniforms.uT.value = t; inst.m.material.uniforms.uOn.value = on; }
      const start = o.start ?? -1e9;                      // no particle older than the jet itself
      for (let k = 0; k < NF; k++) {
        const ph = hash(k + seed * 31, 7);
        const a = fract(t / lifeF + ph) * lifeF;
        const alive = t - a >= start ? 1 : 0;
        place(F, k, k, a, lifeF, _o, _d, _s, _u, 0, t);
        if (!alive) F.aP.setX(k, 1.0);
      }
      for (let k = 0; k < NS; k++) {
        const ph = hash(k + seed * 57, 9);
        const a = fract(t / lifeS + ph) * lifeS;
        place(Sm, k, k + 5000, a, lifeS, _o, _d, _s, _u, 1, t);
        if (t - a < start) Sm.aP.setX(k, 1.0);
      }
      F.m.instanceMatrix.needsUpdate = true; Sm.m.instanceMatrix.needsUpdate = true;
      F.aP.needsUpdate = true; Sm.aP.needsUpdate = true;
      // the light sits a third of the way down the jet, flickering
      light.position.copy(_o).addScaledVector(_d, len * 0.3);
      const flick = 0.85 + 0.1 * Math.sin(t * 23.0) + 0.05 * Math.sin(t * 37.0 + 1.3);
      light.intensity = P.lightI * on * flick * len * len * 0.08;
      light.distance = len * 2.2;
    },
  };
  return api;
}
