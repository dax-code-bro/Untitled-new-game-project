// The crowd (G14): people walking the city's pavements in the distance, so downtown looks busy the way a
// big city does, without costing the processor anything. The real people (entities/peds.js) are the
// ones near you; these are the far ones, from about 15 m out to where the haze takes over.
//
// Every walker is worked out on the graphics card: each one has a block, a lane on its pavement, a
// direction and a pace, and the vertex shader walks them round the block (turning at the corners),
// swings their legs and arms and picks their clothes. The game's code does nothing per walker, per
// frame: one draw call for the people and one for their soft shadows, a few numbers set per frame.
// Every few seconds (or 24 m moved) the walkers on the blocks round the camera who are out at that
// hour are packed to the front of the card's lists, so its work follows what can be seen.
// More of them downtown, fewer at night and in the rain; they fade in and out with a dither, never
// pop. Not drawn on Phone, indoors, or away from Port Calvera.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY } from './layout.js';

const PER_BLOCK = { Low: 34, Medium: 38, High: 44, Ultra: 50, Cinematic: 56 }; // (x up to 2.85 downtown)
const NEAR = [12, 18], FAR = [190, 240]; // fade in from 12 to 18 m, out from 190 to 240 m

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// one walker, standing at the origin facing +z, about 1.75 m tall. aPart: (swing: 0 none, 1/2 legs, 3/4 arms;
// colour: 0 top, 1 trousers, 2 skin, 3 hair, 4 shoes, 5 the bag; only for some: 0 everyone, 1 a skirt, 2 long hair, 3 a bag)
function walkerGeometry() {
  const parts = [];
  // (indexed, so the card shades each corner once: about 350 corners a walker)
  const add = (g, swing, col, only = 0) => {
    g.deleteAttribute('uv');
    if (!g.index) { g.deleteAttribute('normal'); g = mergeVertices(g); g.computeVertexNormals(); } // (the head and hair: rounded)
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = swing; a[i * 3 + 1] = col; a[i * 3 + 2] = only; }
    g.setAttribute('aPart', new THREE.BufferAttribute(a, 3));
    parts.push(g);
  };
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  // the body: a tapered torso (shoulders wider than the waist), hips in the trouser colour
  const torso = new THREE.CylinderGeometry(0.2, 0.16, 0.56, 6, 1).scale(1, 1, 0.58).rotateY(Math.PI / 6).translate(0, 1.18, 0);
  add(torso, 0, 0);
  add(box(0.32, 0.16, 0.2, 0, 0.9, 0), 0, 1);
  add(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 5).translate(0, 1.5, 0), 0, 2); // neck
  add(new THREE.IcosahedronGeometry(0.105, 0).scale(0.92, 1.12, 1).translate(0, 1.62, 0.01), 0, 2); // head
  add(new THREE.IcosahedronGeometry(0.112, 0).scale(0.96, 0.7, 1.02).translate(0, 1.67, -0.015), 0, 3); // hair
  for (const s of [-1, 1]) {
    const leg = s < 0 ? 1 : 2, arm = s < 0 ? 3 : 4;
    add(box(0.13, 0.82, 0.14, s * 0.085, 0.43, 0), leg, 1); // leg
    add(box(0.11, 0.07, 0.25, s * 0.085, 0.035, 0.04), leg, 4); // shoe
    add(box(0.095, 0.34, 0.1, s * 0.235, 1.26, 0), arm, 0); // sleeve
    add(box(0.075, 0.3, 0.08, s * 0.24, 0.94, 0.01), arm, 2); // forearm and hand
  }
  add(new THREE.CylinderGeometry(0.17, 0.25, 0.44, 8, 1, true).translate(0, 0.76, 0), 0, 1, 1); // a skirt
  add(box(0.21, 0.32, 0.07, 0, 1.53, -0.085), 0, 3, 2); // long hair down the back
  add(box(0.07, 0.24, 0.3, 0.27, 0.72, 0.0), 4, 5, 3); // a bag in the right hand (it swings with the arm)
  return mergeGeometries(parts);
}

// clothes and people: muted city colours with the odd bright one
const TOPS = [0x1d2633, 0x222222, 0xe8e6df, 0x8a8f96, 0x2f4a6b, 0x6b2a2a, 0x3d4a34, 0xb8a888, 0x4a3b5c, 0xc9b9a6, 0x2b5d7a, 0xd6c23a, 0xc0492f, 0x6e7f8c, 0x9a3b55, 0xf0f0ec];
const BOTTOMS = [0x2a3446, 0x1c1c1e, 0x3b4a66, 0x55504a, 0x8a7a5e, 0x2e2e33, 0x6b6157, 0x41536e];
const SKIN = [0xf1c8a6, 0xe0ac86, 0xc68a62, 0xa66e47, 0x8a5636, 0x603a24, 0x4a2c1c];
const HAIR = [0x1a1410, 0x2b1d14, 0x4a3221, 0x6e4c2c, 0xa8865a, 0x8a8a86, 0x141414];

export function createCrowd({ scene, quality, worldUniforms, cityBlocks = [] }) {
  const K = PER_BLOCK[quality.label];
  if (!K || !cityBlocks.length) return { update() {}, count: 0, mesh: null };
  const r = rng(4417), blockHalf = (CITY.pitch - CITY.street) / 2;
  const blk = [], walk = [], top = [], bot = [], skin = [], blocks = [];
  const col = (hex) => new THREE.Color(hex);
  for (const b of cityBlocks) {
    const dt = Math.max(0, 1 - b.d / 600); // downtown: a walker every few metres; the edge of the city: a few a block
    const n = Math.round(K * (0.25 + 2.6 * dt * dt) * (b.type === 'park' ? 0.6 : b.type === 'parking' ? 0.45 : 1));
    blocks.push({ x: b.cx, z: b.cz, a: blk.length / 4, n });
    for (let k = 0; k < n; k++) {
      const inset = 1.55 + r() * 1.2, h = blockHalf - inset;
      // about half are women (most with long hair, some in skirts), a few carry a bag
      const woman = r() < 0.5, style = (woman && r() < 0.45 ? 1 : 0) + (woman && r() < 0.8 ? 2 : 0) + (r() < 0.22 ? 4 : 0);
      blk.push(b.cx, b.cz, h, (r() < 0.5 ? 1 : -1) * (1 + style));
      // (the last number: who stays in when the streets thin out; in order within a block, so the ones
      // out at a given hour are the first few)
      walk.push(1.15 + r() * 0.5, r() * h * 8, 0.92 + r() * 0.16, (k + r()) / n);
      const t = col(TOPS[(r() * TOPS.length) | 0]).multiplyScalar(0.85 + r() * 0.3), bo = col(BOTTOMS[(r() * BOTTOMS.length) | 0]).multiplyScalar(0.85 + r() * 0.3);
      const s = col(SKIN[(r() * SKIN.length) | 0]), hr = col(HAIR[(r() * HAIR.length) | 0]);
      top.push(t.r, t.g, t.b); bot.push(bo.r, bo.g, bo.b);
      skin.push(s.r, s.g, s.b, (hr.r + hr.g + hr.b) / 3); // (the fourth: how light the hair is)
    }
  }
  const count = blk.length / 4;
  if (!count) return { update() {}, count: 0, mesh: null };

  // everyone, and what the card is given: only the walkers on the blocks round the camera who are out at
  // this hour (packed to the front every so often), so its work follows what can be seen
  const ALL = { aBlk: [new Float32Array(blk), 4], aWalk: [new Float32Array(walk), 4], aTop: [new Float32Array(top), 3], aBot: [new Float32Array(bot), 3], aSkin: [new Float32Array(skin), 4] };
  const inst = {};
  for (const [k, [a, n]] of Object.entries(ALL)) { inst[k] = new THREE.InstancedBufferAttribute(new Float32Array(a.length), n); inst[k].setUsage(THREE.DynamicDrawUsage); }
  const U = {
    uTime: worldUniforms.uTime, uDens: { value: 1 }, uFade: { value: new THREE.Vector4(NEAR[0], NEAR[1], FAR[0], FAR[1]) },
    uY: { value: CITY.height + 0.22 }, uShade: { value: 0.32 }, uCam: { value: new THREE.Vector3() },
  };

  // where a walker is and which way they face: the same in both shaders
  const WALK_GLSL = /* glsl */ `
attribute vec4 aBlk; attribute vec4 aWalk;
uniform float uTime; uniform float uDens; uniform vec4 uFade; uniform float uY; uniform vec3 uCam;
varying float vCrowdF;
vec3 cwPos; float cwHead; float cwStep;
void crowdWalk() {
  float h = aBlk.z, P = h * 8.0;
  float d = mod(uTime * aWalk.x + aWalk.y, P);
  float s = aBlk.w > 0.0 ? d : P - d; // (the sign: which way round; the size: who they are)
  float side = floor(s / (2.0 * h));
  float u = s - side * 2.0 * h - h;
  vec2 q = vec2(u, -h);
  for (int i = 0; i < 4; i++) { if (float(i) < side) q = vec2(-q.y, q.x); }
  cwPos = vec3(aBlk.x + q.x, uY, aBlk.y + q.y);
  // facing along the pavement; round the corner over the last and first metre of a side
  cwHead = 1.5707963 - side * 1.5707963 - 0.7853982 * smoothstep(h - 0.9, h, u) + 0.7853982 * (1.0 - smoothstep(-h, -h + 0.9, u));
  if (aBlk.w < 0.0) cwHead += 3.1415927;
  cwStep = d / 0.75 * 3.1415927;
  float dist = distance(uCam.xz, cwPos.xz); // (the game camera: the same in a reflection pass)
  vCrowdF = smoothstep(uFade.x, uFade.y, dist) * (1.0 - smoothstep(uFade.z, uFade.w, dist)) * step(aWalk.w, uDens);
}
vec3 cwYaw(vec3 p) { float c = cos(cwHead), sn = sin(cwHead); return vec3(p.x * c + p.z * sn, p.y, -p.x * sn + p.z * c); }
`;
  const DITHER = 'if (vCrowdF < fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;';

  // ---- the walkers
  const g0 = walkerGeometry();
  const geo = new THREE.InstancedBufferGeometry();
  for (const k of ['position', 'normal', 'aPart']) geo.setAttribute(k, g0.attributes[k]);
  geo.setIndex(g0.index);
  for (const [k, a] of Object.entries(inst)) geo.setAttribute(k, a);
  geo.instanceCount = 0;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
${WALK_GLSL}
attribute vec3 aPart; attribute vec3 aTop; attribute vec3 aBot; attribute vec4 aSkin;
varying vec3 vCrowdC;
mat2 cwRot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float cwSwing() {
  float sw = sin(cwStep) * 0.42;
  return aPart.x < 0.5 ? 0.0 : aPart.x < 1.5 ? sw : aPart.x < 2.5 ? -sw : aPart.x < 3.5 ? -sw * 0.75 : sw * 0.75;
}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
crowdWalk();
{ float a = cwSwing(); objectNormal.yz = cwRot(a) * objectNormal.yz; objectNormal = cwYaw(objectNormal); }`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position) * aWalk.z;
{
  float a = cwSwing(), pv = aPart.x > 2.5 ? 1.42 : 0.88;
  if (aPart.x > 0.5) { vec2 yz = transformed.yz - vec2(pv * aWalk.z, 0.0); transformed.yz = cwRot(a) * yz + vec2(pv * aWalk.z, 0.0); }
  transformed.y += abs(cos(cwStep)) * 0.025;
  transformed = cwYaw(transformed) + cwPos;
  float st = abs(aBlk.w) - 1.0, skirt = mod(st, 2.0), longHair = mod(floor(st / 2.0), 2.0), bag = floor(st / 4.0);
  float has = aPart.z < 0.5 ? 1.0 : aPart.z < 1.5 ? skirt : aPart.z < 2.5 ? longHair : bag;
  if (vCrowdF < 0.002 || has < 0.5) transformed = vec3(cwPos.x, -400.0, cwPos.z); // hidden: every corner on one point, nothing drawn
  float c = aPart.y;
  vec3 hair = mix(vec3(0.05, 0.04, 0.03), vec3(0.62, 0.5, 0.36), aSkin.w * 1.6);
  vCrowdC = c < 0.5 ? aTop : c < 1.5 ? (skirt > 0.5 && aPart.x > 0.5 ? aSkin.rgb * 0.92 : aBot) : c < 2.5 ? aSkin.rgb : c < 3.5 ? hair : c < 4.5 ? vec3(0.05) : aBot * 0.5 + vec3(0.08, 0.05, 0.03);
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCrowdF; varying vec3 vCrowdC;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${DITHER}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vCrowdC;');
  };
  mat.customProgramCacheKey = () => 'sb-crowd';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.userData.noHit = true; mesh.raycast = () => {};
  mesh.name = 'crowd';

  // ---- their shadows: a soft dark patch under each, stretched a little along the way they walk
  const sg0 = new THREE.PlaneGeometry(0.9, 1.05).rotateX(-Math.PI / 2);
  const sgeo = new THREE.InstancedBufferGeometry();
  for (const k of ['position', 'uv']) sgeo.setAttribute(k, sg0.attributes[k]);
  sgeo.setIndex(sg0.index);
  for (const k of ['aBlk', 'aWalk']) sgeo.setAttribute(k, inst[k]);
  sgeo.instanceCount = 0;
  const smat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  smat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${WALK_GLSL}\nvarying vec2 vCwUv;`)
      .replace('#include <begin_vertex>', `crowdWalk(); vCwUv = uv;
vec3 transformed = cwYaw(vec3(position)) + cwPos + vec3(0.0, 0.025, 0.0);
if (vCrowdF < 0.002) transformed = vec3(cwPos.x, -400.0, cwPos.z);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCrowdF; varying vec2 vCwUv; uniform float uShade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n{ float r = length((vCwUv - 0.5) * vec2(1.0, 0.86)) * 2.0; diffuseColor.a *= (1.0 - smoothstep(0.25, 1.0, r)) * uShade * vCrowdF; }');
  };
  smat.customProgramCacheKey = () => 'sb-crowd-shadow';
  const shadows = new THREE.Mesh(sgeo, smat);
  shadows.frustumCulled = false; shadows.userData.noHit = true; shadows.raycast = () => {}; shadows.renderOrder = 1;
  scene.add(mesh, shadows);

  const x0 = CITY.x0 - 260, x1 = CITY.x0 + CITY.nx * CITY.pitch + 260, z0 = CITY.z0 - 260, z1 = CITY.z0 + CITY.nz * CITY.pitch + 260;
  const packAt = new THREE.Vector3(1e9, 0, 1e9), REACH = FAR[1] + blockHalf * 1.42 + 30, look = new THREE.Vector3();
  let packDens = -1, packWhen = 0, packYaw = 0, drawn = 0;
  // (G14 part 4) only the walkers who can be seen: in the fade-in range, and inside the view (widened by
  // 35 degrees each side, for turning the camera between packs, four times a second)
  const pack = (camera, dens) => {
    const p = camera.position, t = worldUniforms.uTime.value;
    camera.getWorldDirection(look); const fl = Math.hypot(look.x, look.z) || 1, fx = look.x / fl, fz = look.z / fl;
    const half = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * (camera.aspect || 1.8)) + 0.61, cosH = Math.cos(Math.min(Math.PI, half));
    let m = 0;
    for (const b of blocks) {
      if (Math.hypot(b.x - p.x, b.z - p.z) > REACH) continue;
      for (let i = b.a; i < b.a + b.n; i++) {
        if (ALL.aWalk[0][i * 4 + 3] > dens + 0.06) break; // (in order: the rest are indoors)
        // (where(i), without making an object: it runs for a couple of thousand walkers)
        const h = blk[i * 4 + 2], P = h * 8, d0 = (((t * walk[i * 4] + walk[i * 4 + 1]) % P) + P) % P, s = blk[i * 4 + 3] > 0 ? d0 : P - d0;
        const side = Math.floor(s / (2 * h)), u = s - side * 2 * h - h;
        const qx = side === 0 ? u : side === 1 ? h : side === 2 ? -u : -h, qz = side === 0 ? -h : side === 1 ? u : side === 2 ? h : -u;
        const dx = blk[i * 4] + qx - p.x, dz = blk[i * 4 + 1] + qz - p.z, d = Math.hypot(dx, dz);
        if (d < NEAR[0] - 6 || d > FAR[1] + 6 || (d > 14 && (dx * fx + dz * fz) / d < cosH)) continue;
        for (const k in ALL) { const [a, n] = ALL[k]; for (let j = 0; j < n; j++) inst[k].array[m * n + j] = a[i * n + j]; }
        m++;
      }
    }
    for (const k in inst) { const a = inst[k]; a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, m) * a.itemSize); a.needsUpdate = true; }
    geo.instanceCount = sgeo.instanceCount = drawn = m;
    packAt.copy(p); packDens = dens; packWhen = performance.now(); packYaw = Math.atan2(fx, fz);
  };
  const api = {
    mesh, shadows, count, uniforms: U, drawn: () => drawn,
    where(i, t = worldUniforms.uTime.value) {
      const h = blk[i * 4 + 2], P = h * 8, d = (((t * walk[i * 4] + walk[i * 4 + 1]) % P) + P) % P, s = blk[i * 4 + 3] > 0 ? d : P - d; // (sign: which way)
      const side = Math.floor(s / (2 * h)), u = s - side * 2 * h - h;
      let qx = u, qz = -h; for (let k = 0; k < side; k++) [qx, qz] = [-qz, qx];
      return { x: blk[i * 4] + qx, y: U.uY.value, z: blk[i * 4 + 1] + qz, side };
    },
    // hour: 0..24; night 0..1; wet: rain 0..1; indoors: the camera is in an interior
    update(camera, hour, night, rain, indoors) {
      const p = camera.position; U.uCam.value.copy(p);
      const on = !indoors && p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1 && p.y < CITY.height + 400;
      mesh.visible = shadows.visible = on;
      if (!on) return;
      // a busy day, a thinner evening, nearly nobody in the small hours; the rain sends most indoors
      const hr = ((hour % 24) + 24) % 24;
      const day = hr < 5 ? 0.08 : hr < 7.5 ? 0.08 + (hr - 5) / 2.5 * 0.92 : hr < 18.5 ? 1 : hr < 23 ? 1 - (hr - 18.5) / 4.5 * 0.8 : 0.2 - (hr - 23) * 0.12;
      U.uDens.value = Math.max(0, day) * (1 - Math.min(1, rain) * 0.6);
      U.uShade.value = 0.34 * (1 - night * 0.6);
      camera.getWorldDirection(look); const yaw = Math.atan2(look.x, look.z), turn = Math.abs(((yaw - packYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (Math.hypot(p.x - packAt.x, p.z - packAt.z) > 8 || turn > 0.4 || Math.abs(U.uDens.value - packDens) > 0.04 || performance.now() - packWhen > 250) pack(camera, U.uDens.value);
    },
  };
  return api;
}
