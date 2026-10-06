// Style frame F4 - SCENE 1A, the birthing chamber (shot list 1A-12 / 1A-17).
//
// "The chamber is warm, practical, and carefully maintained. Lamps provide
// subdued light; daylight enters high above ... Soft prepared bedding
// surrounds the egg. Bowls of water and folded cloth ... The hatchling emerges
// awkwardly. It is wet, unsteady, and exhausted. Gold catches the warm light
// along its scales ... Its body does not emit light ... The hatchling tries to
// lift itself and slips against the broken shell. Alexandria supports it with
// a folded cloth."
//
// Cinematography: a tight close shot at nest height, 50 mm on Super 35 at
// T2, focus on the hatchling's eye. Key: a clay oil lamp low at frame left
// (warm, ~1900 K) rakes across the wet gold scales; a cool shaft of daylight
// from a high window crosses the dusty air behind (volumetric, shadowed by the
// window opening) and lands on the floor - the motivated two-colour light the
// screenplay describes. Alexandria's hands enter from screen RIGHT (her side
// of the nest in the shot list's chamber map) under a folded linen cloth; her
// face stays out of frame. The room falls off into darkness and bokeh.
//
//   node render/render.mjs --still scenes/lookdev/style-f4-birthing-chamber.js --time 2 --preset final --png out.png
import * as THREE from 'three';
import { loadPBR } from '../lib/assets.js';
import { worldMaterial } from '../lib/sets/materials.js';
import { person, placePerson, armIK } from '../lib/sets/people.js';
import { createCreature, poses, loadHuman, applyRiderPose } from '../lib/creatures/index.js';
import { filmFinish } from './finish.js';

const SUN = new THREE.Vector3(-0.162, 0.688, -0.708).normalize(); // daylight through the high window (back left), landing on the nest
const NEST = new THREE.Vector3(0, 0.62, 0);                        // top of the bedding

export const meta = {
  title: 'Style frame F4 - The birthing chamber',
  duration: 8,
  seed: 41,
  cinematic: filmFinish({
    volumetrics: {
      enabled: true, range: 14, near: 0.05, resolution: [192, 108, 64], noiseFilter: true,
      density: 0.03, heightFalloff: 0.0, fogBase: 0, anisotropy: 0.6, noiseScale: 0.9, noiseAmount: 0.5, wind: [0.03, 0.01, 0.0], shadowSoftness: 0.06,
      ambient: [0.0006, 0.0005, 0.0004], intensity: 1.0,
    },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.08, maxRadiusPx: 0.03, contactShadows: true, contactLength: 0.03, contactMaxDistance: 4 },
    dof: { samples: 96, maxCoC: 0.024 },
    grade: { exposure: 0.55, whiteBalance: 5000, contrast: 1.05, saturation: 1.0 },
    grain: { amount: 3.8 },
    lensFx: { vignette: 0.85 },
  }),
};

let S;

function lathe(THREE, prof, seg = 48) {
  return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

/** A soft folded cloth: a thick pad with rounded, drooping edges (folded linen). */
function foldedCloth(w, d, t, sag) {
  const g = new THREE.BoxGeometry(w, t, d, 24, 2, 18);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ex = Math.abs(x) / (w / 2), ez = Math.abs(z) / (d / 2);
    const droop = sag * (Math.pow(ex, 3) * 0.8 + Math.pow(ez, 4) * 0.3);
    const round = (1 - Math.max(ex, ez) ** 6) * 0.3 + 0.7;
    // round the corners off (a folded cloth has soft, rolled corners)
    const corner = Math.max(0, ex + ez - 1.45);
    p.setX(i, x * (1 - 0.35 * corner)); p.setZ(i, z * (1 - 0.35 * corner));
    const wav = 0.003 * Math.sin(x * 40 + z * 13) + 0.0025 * Math.sin(z * 55) + 0.004 * Math.sin(x * 17 - z * 29 + 1.3) * (0.5 + ez);
    p.setY(i, y * round - droop + wav);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A cloth cradling the hatchling's far side: a curved, folded linen sheet in its own frame
 * (x along the body, y up, z away from camera), double layer, soft creases. phi from -0.9 to 1.5 rad.
 */
function cradleCloth(len, r) {
  const NU = 40, NV = 36;
  const g = new THREE.PlaneGeometry(1, 1, NU, NV);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5;
    const phi = -1.05 + v * 2.6;
    const x = (u - 0.5) * len * (1 + 0.15 * v);
    const rr = r * (1 + 0.25 * v * v) + 0.004 * Math.sin(u * 23 + v * 5) + 0.003 * Math.sin(v * 31 - u * 7);
    // the free top edge folds back over itself a little
    const fold = v > 0.85 ? (v - 0.85) * 0.25 : 0;
    p.setXYZ(i, x, Math.sin(phi) * rr - fold, Math.cos(phi) * rr + fold * 0.5);
  }
  g.computeVertexNormals();
  return g;
}

/** A straw: a flattened, slightly split stalk bent along its length (unit length along x). */
function strawRibbon(seed) {
  let a = seed >>> 0; const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
  const bend = (r() - 0.5) * 0.5, kink = r() < 0.4 ? 0.25 + r() * 0.5 : -1, kinkA = (r() - 0.5) * 0.9, twist = (r() - 0.5) * 2.5;
  const split = r() < 0.35;
  const w = 0.004 + r() * 0.0025, NS = 14;
  const pos = [], idx = [], col = [];
  const strands = split ? [[-0.5, -0.05], [0.05, 0.5]] : [[-0.5, 0.5]];
  for (const [w0, w1] of strands) {
    const base = pos.length / 3;
    for (let i = 0; i <= NS; i++) {
      const u = i / NS, x = u - 0.5;
      let y = bend * x * x, z = 0;
      if (kink > 0 && u > kink) { const d = u - kink; y += Math.sin(kinkA) * d; }
      const tw = twist * u;
      for (const v of [w0, w1]) {
        const ww = v * w * (split && u > 0.55 ? 1.3 : 1);
        pos.push(x, y + Math.sin(tw) * ww * 0.6, z + Math.cos(tw) * ww);
        const c = 0.85 + 0.3 * Math.sin(u * 7 + seed);
        col.push(c, c, c);
      }
    }
    for (let i = 0; i < NS; i++) { const q = base + i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/**
 * A folded linen cloth: one strip folded back on itself in `layers` layers (an S-fold seen
 * from the side), with rounded folds, a slight sag and creases, a hem darker along the free
 * edges (vertex colour). Size w (across) x d (folded depth), cloth thickness t.
 */
function foldedLinen(w, d, layers = 3, t = 0.0035) {
  const gap = t * 1.8, R = gap / 2;
  const seg = [];                                         // the strip's centre line in x (depth) / y (up)
  for (let L = 0; L < layers; L++) {
    const dir = L % 2 === 0 ? 1 : -1, y = L * gap;
    const x0 = dir > 0 ? -d / 2 : d / 2;
    for (let i = 0; i <= 24; i++) seg.push([x0 + dir * d * i / 24, y]);
    if (L < layers - 1) for (let i = 1; i < 10; i++) { const a = -Math.PI / 2 + Math.PI * i / 10; seg.push([dir * (d / 2 + R * Math.cos(a)), y + R + R * Math.sin(a)]); }
  }
  const NZ = 28, pos = [], idx = [], col = [];
  let acc = 0;
  const arc = seg.map((p, i) => (i ? (acc += Math.hypot(p[0] - seg[i - 1][0], p[1] - seg[i - 1][1])) : 0));
  const total = acc;
  seg.forEach(([x, y], i) => {
    for (let k = 0; k <= NZ; k++) {
      const z = (k / NZ - 0.5) * w;
      const crease = 0.0012 * Math.sin(arc[i] * 90 + z * 40) * Math.sin(z * 25 + 1.3) + 0.0008 * Math.sin(arc[i] * 230 - z * 70);
      const sag = -0.004 * Math.pow(Math.abs(2 * z / w), 3) * (1 - y / (layers * gap + 1e-6));
      pos.push(x + 0.002 * Math.sin(z * 60 + arc[i] * 20), y + crease + sag, z);
      const edge = Math.min(Math.abs(Math.abs(z) - w / 2), arc[i], total - arc[i]);
      const hem = edge < 0.006 ? 0.72 : 1;
      col.push(hem, hem, hem * 0.97);
    }
  });
  for (let i = 0; i < seg.length - 1; i++) for (let k = 0; k < NZ; k++) {
    const a = i * (NZ + 1) + k, b = a + 1, c = a + NZ + 1, e = c + 1;
    idx.push(a, c, b, b, c, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const uv = []; seg.forEach((_, i) => { for (let k = 0; k <= NZ; k++) uv.push(arc[i] / 0.15, k / NZ * w / 0.15); });
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** The egg: an ellipsoid shell; the broken-open end is cut in the shader (smooth, irregular crack line). */
function eggShell(rx, ry, rz) {
  const g = new THREE.SphereGeometry(1, 128, 96);
  g.rotateX(Math.PI / 2);                    // poles on +-z (the egg's long axis)
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // a real egg is blunter at one end
    const k = z > 0 ? 1.0 : 1.0 - 0.1 * z * z;
    p.setXYZ(i, x * rx * k, y * ry * k, z * rz);
  }
  g.computeVertexNormals();
  return g;
}

export async function setup(ctx) {
  const { scene, camera, renderer } = ctx;

  // interior image-based light (a real stone cellar, CC0), low: the lamps and the window do the work
  // reflections: gold is a mirror of its surroundings, so the environment must BE this room - a
  // small environment scene (warm lamp-lit stone walls, the lamp flames, the cool high window,
  // the pale linen below) is rendered into a PMREM once
  {
    const es = new THREE.Scene();
    const wallE = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.045, 0.026, 0.014), side: THREE.BackSide });
    es.add(new THREE.Mesh(new THREE.BoxGeometry(7, 5.2, 7), wallE).translateY(1.9));
    const add = (geo, col, x, y, z) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(...col), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0.6, 0); es.add(m); };
    add(new THREE.PlaneGeometry(1.6, 1.0), [0.55, 0.32, 0.16], -2.2, 1.0, 0.8);      // the lamplit wall at left
    add(new THREE.SphereGeometry(0.05, 12, 8), [40, 18, 5], -0.95, 0.52, 0.62);        // key lamp flame
    add(new THREE.SphereGeometry(0.04, 12, 8), [25, 11, 3], 1.6, 0.52, -1.5);
    add(new THREE.PlaneGeometry(0.7, 1.3), [1.4, 1.6, 1.9], -0.8, 4.0, -3.4);          // the high window
    add(new THREE.PlaneGeometry(1.2, 1.2), [0.22, 0.17, 0.11], 0, -0.1, 0);            // linen and straw below
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(es, 0, 0.05, 30).texture;
    pm.dispose();
    scene.environmentIntensity = 0.45;
  }
  scene.background = new THREE.Color(0, 0, 0);

  // daylight through the high window: a sun whose shadow map covers the room (the walls and the
  // window opening make the shaft)
  const sun = new THREE.DirectionalLight(new THREE.Color(0.92, 0.95, 1.0), 1.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.near = 1; sc.far = 40;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
  sun.target.position.set(0.5, 0, -1.0);
  sun.position.copy(sun.target.position).addScaledVector(SUN, 20);
  scene.add(sun, sun.target);

  // ---- the room: stone walls, flagged floor, a high window in the back wall
  const stone = await worldMaterial(ctx, 'pbr/ph_sandstone_blocks_04', { mode: 'box', scale: 0.55, tint: [0.62, 0.56, 0.48], saturation: 0.6, macro: 0.6, normalScale: 1.6, grime: { height: 0.8, strength: 0.4, streaks: 0.4, base: 0 } });
  const floorMat = await worldMaterial(ctx, 'pbr/ph_floor_pebbles_01', { mode: 'top', scale: 0.7, tint: [0.55, 0.5, 0.45], macro: 0.5 });
  const W = 7, D = 7, HR = 5.2;
  const box = (w, h, d, x, y, z, m = stone) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); o.castShadow = o.receiveShadow = true; scene.add(o); return o; };
  box(W, 0.2, D, 0, -0.2, 0, floorMat);
  // back wall (z = -D/2) with the window opening at x = -0.8, y 3.4..4.7
  const wz = -D / 2, wt = 0.6, wx = -0.8, ww = 0.7, wy0 = 3.4, wy1 = 4.7;
  box(W / 2 + wx - ww / 2 + 0, HR, wt, -W / 2 + (W / 2 + wx - ww / 2) / 2, 0, wz);
  box(W / 2 - wx - ww / 2, HR, wt, wx + ww / 2 + (W / 2 - wx - ww / 2) / 2, 0, wz);
  box(ww, wy0, wt, wx, 0, wz); box(ww, HR - wy1, wt, wx, wy1, wz);
  box(wt, HR, D, -W / 2, 0, 0); box(wt, HR, D, W / 2, 0, 0);       // side walls
  box(W, HR, wt, 0, 0, D / 2);                                       // front wall (behind camera)
  box(W, 0.4, D, 0, HR, 0);                                          // ceiling
  // a low ledge along the left wall for the lamp, and the plinth for the nest
  box(0.5, 1.05, 2.2, -W / 2 + 0.55, 0, 0.2);
  box(1.5, 0.42, 1.5, 0, 0, 0);

  // ---- the nest: a shallow wicker basket on the plinth, straw, linen bedding
  const wicker = await loadPBR('pbr/khr_wicker', ctx, { repeat: [10, 2] });
  wicker.color = new THREE.Color(0.7, 0.62, 0.48);
  const basket = new THREE.Mesh(lathe(THREE, [[0.0, 0.0], [0.5, 0.0], [0.6, 0.06], [0.64, 0.17], [0.66, 0.2], [0.62, 0.2], [0.58, 0.08], [0.0, 0.06]], 64), wicker);
  basket.position.set(0, 0.42, 0); basket.castShadow = basket.receiveShadow = true; scene.add(basket);
  // straw: flattened, split and bent stalks (several shapes) heaped in the basket
  const strawMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.62, 0.48, 0.22), roughness: 0.5, side: THREE.DoubleSide, vertexColors: true });
  const NS = 5200, NV = 6;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
  let a = 77; const rng = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
  const lists = Array.from({ length: NV }, () => []);
  for (let i = 0; i < NS; i++) {
    const r = Math.sqrt(rng()) * 0.62, th = rng() * Math.PI * 2;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const y = 0.47 + 0.07 * (1 - (r / 0.66) ** 2) + rng() * 0.04 + (r > 0.4 ? (r - 0.4) * 0.45 : 0) + (r > 0.42 ? rng() * 0.05 : 0);
    // clumped: stalks in a heap lie roughly together
    e.set((rng() - 0.5) * 0.35, Math.floor(rng() * 5) * 0.6 + (rng() - 0.5) * 0.5 + th * 0.3, (rng() - 0.5) * 0.35, 'YXZ');
    q.setFromEuler(e);
    const L = 0.05 + rng() * 0.13;
    m4.compose(v.set(x, y, z), q, s3.set(L, L * (0.7 + rng() * 0.6), 1));
    const c = 0.55 + rng() * 0.65;
    lists[i % NV].push([m4.clone(), [c, c * (0.88 + rng() * 0.15), c * (0.72 + rng() * 0.25)]]);
  }
  lists.forEach((list, k) => {
    const straw = new THREE.InstancedMesh(strawRibbon(101 + k * 37), strawMat, list.length);
    const cols = new Float32Array(list.length * 3);
    list.forEach(([m, c], i) => { straw.setMatrixAt(i, m); cols.set(c, i * 3); });
    straw.instanceColor = new THREE.InstancedBufferAttribute(cols, 3);
    straw.castShadow = straw.receiveShadow = true;
    scene.add(straw);
  });
  // the linen bedding under the egg (a draped, creased sheet)
  const linen = await loadPBR('pbr/acg_fabric36', ctx, { repeat: [6, 6], color: new THREE.Color(0.86, 0.82, 0.74), sheen: { color: 0xffffff, roughness: 0.5 } });
  linen.side = THREE.DoubleSide;
  const sheetG = new THREE.PlaneGeometry(0.95, 0.85, 80, 70);
  sheetG.rotateX(-Math.PI / 2);
  { const p = sheetG.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const r = Math.hypot(x, z); p.setY(i, 0.012 * Math.sin(x * 23 + Math.sin(z * 9) * 2) + 0.008 * Math.sin(z * 31 + x * 7) - 0.07 * Math.max(0, r - 0.28) ** 1.2 * 3 + 0.01 * Math.sin(r * 40)); } }
  sheetG.computeVertexNormals();
  const sheet = new THREE.Mesh(sheetG, linen);
  sheet.position.set(0.02, 0.585, 0.02); sheet.castShadow = sheet.receiveShadow = true; scene.add(sheet);

  // ---- the egg (dark, as in the title shot) broken open, shell fragments on the linen
  const rx0 = 0.1, ry0 = 0.1, rz0 = 0.14;
  const shellMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.035, 0.03, 0.026), roughness: 0.68, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.6, side: THREE.DoubleSide });
  shellMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vEP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvEP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vEP;
float eh(vec3 p){p=fract(p*0.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
float eh1(float x){return fract(sin(x*127.1)*43758.5453);}
float evn(float x){float i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);return mix(eh1(i),eh1(i+1.0),f);}
float dkShellD;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{ vec3 u = vEP / vec3(${rx0.toFixed(4)}, ${ry0.toFixed(4)}, ${rz0.toFixed(4)});
  float a = (atan(u.y, u.x) / 6.2831853 + 0.5) * 9.0;
  // an irregular fracture: a few big lobes, angular facets, and deep notches where cracks ran
  float jag = 0.6 + 0.36 * (evn(a * 0.55 + 2.0) - 0.5) + 0.18 * (evn(a * 1.9 + 11.0) - 0.5);
  float facet = fract(a * 1.3 + evn(a * 0.7) * 1.7);
  jag += 0.07 * (abs(facet - 0.5) * 2.0 - 0.5) + 0.03 * (evn(a * 9.0 + 3.0) - 0.5);
  float nq = fract(a * 0.29 + 0.17);
  jag -= 0.2 * max(0.0, 1.0 - abs(nq - 0.5) * 16.0) * evn(a * 0.29 + 5.0);
  dkShellD = (1.0 - u.z) - jag;
  if (dkShellD < 0.0) discard; }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ // fine pitted, leathery shell surface
  vec3 q = vEP * 90.0; vec3 i = floor(q); vec3 f = smoothstep(0.0, 1.0, fract(q));
  float h = mix(mix(mix(eh(i), eh(i + vec3(1,0,0)), f.x), mix(eh(i + vec3(0,1,0)), eh(i + vec3(1,1,0)), f.x), f.y),
                mix(mix(eh(i + vec3(0,0,1)), eh(i + vec3(1,0,1)), f.x), mix(eh(i + vec3(0,1,1)), eh(i + vec3(1,1,1)), f.x), f.y), f.z);
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float hx = dFdx(h), hy = dFdy(h);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  normal = normalize(abs(det) * normal - sign(det) * (hx * r1 + hy * r2) * 0.0015); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ float sp = step(0.93, eh(floor(vEP * 260.0))) * 0.6 + 0.4 * eh(floor(vEP * 60.0));
  diffuseColor.rgb *= 0.8 + 0.5 * sp;
  // the broken edge: a pale band of the shell's cross-section (~2 mm) shows along the fracture
  float rim = 1.0 - smoothstep(0.012, 0.024, dkShellD);
  if (!gl_FrontFacing) {
    // inside: the pale inner membrane, wrinkled, a little torn back from the edge, darker deep in
    float wr = eh(floor(vEP * 140.0)) * 0.25 + 0.75;
    vec3 mem = vec3(0.5, 0.45, 0.35) * wr;
    float deep = smoothstep(0.0, 0.9, dkShellD);
    diffuseColor.rgb = mix(mem, mem * 0.55, deep);
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.56, 0.44), rim); }`);
  };
  shellMat.customProgramCacheKey = () => 'dk-eggshell';
  const egg = new THREE.Mesh(eggShell(rx0, ry0, rz0), shellMat);
  egg.castShadow = egg.receiveShadow = true;
  scene.add(egg);
  const frags = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.SphereGeometry(0.13, 10, 8, rng() * 6, 0.35 + rng() * 0.4, 0.8 + rng() * 0.6, 0.3 + rng() * 0.35);
    const f = new THREE.Mesh(g, shellMat);
    f.castShadow = f.receiveShadow = true; scene.add(f); frags.push(f);
  }

  // ---- the hatchling (provisional design: 24-karat-gold look, wet, no glow)
  const hatch = await createCreature('hatchling', { quality: 'hero' });
  scene.add(hatch.root);
  // wet from the egg: a full clear film, varied per pixel (streaks, drying patches) by the skin shader

  // ---- bowls of water and a clay oil lamp
  const clay = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.32, 0.17, 0.09), roughness: 0.75 });
  const water = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.02, 0.02, 0.018), roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 });
  const bowl = (x, z, r) => {
    const b = new THREE.Mesh(lathe(THREE, [[0, 0], [r * 0.6, 0], [r, r * 0.45], [r * 1.02, r * 0.5], [r * 0.95, r * 0.5], [r * 0.6, r * 0.12], [0, r * 0.1]]), clay);
    b.position.set(x, 0.42, z); b.castShadow = b.receiveShadow = true; scene.add(b);
    const w = new THREE.Mesh(new THREE.CircleGeometry(r * 0.9, 40), water); w.rotation.x = -Math.PI / 2; w.position.set(x, 0.42 + r * 0.38, z); scene.add(w);
  };
  bowl(-0.55, 0.5, 0.11); bowl(0.62, -0.45, 0.13);
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 4.2, 1.2) });
  const lamp = (x, y, z, intensity, shadow) => {
    const body = new THREE.Mesh(lathe(THREE, [[0, 0], [0.05, 0], [0.075, 0.03], [0.06, 0.05], [0.015, 0.06], [0.0, 0.06]], 32), clay);
    body.scale.set(1, 1, 1.4); body.position.set(x, y, z); body.castShadow = true; scene.add(body);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 10), flameMat); fl.scale.set(1, 2.6, 1); fl.position.set(x, y + 0.085, z + 0.07); scene.add(fl);
    const L = new THREE.PointLight(new THREE.Color(1.0, 0.52, 0.2), intensity, 0, 2);
    L.position.set(x, y + 0.09, z + 0.07);
    if (shadow) { L.castShadow = true; L.shadow.mapSize.set(1024, 1024); L.shadow.bias = -0.004; L.shadow.normalBias = 0.01; L.shadow.camera.near = 0.03; L.shadow.camera.far = 12; L.shadow.radius = 4; }
    scene.add(L);
    return L;
  };
  lamp(-0.95, 0.42, 0.55, 1.6, true);            // key: on the plinth at frame left, low and close
  lamp(0.45, 0.42, -0.62, 0.5, false);              // a second lamp on the plinth behind the nest (bokeh)
  lamp(-1.0, 1.05, -2.9, 0.7, false);

  // ---- Alexandria's hands under a folded linen cloth (her side of the nest: screen right)
  const human = await loadHuman();
  const alex = person(human, { name: 'alexandria', jacket: [0.09, 0.025, 0.035], trousers: [0.06, 0.02, 0.025], boots: [0.02, 0.015, 0.012], gloves: [0.5, 0.33, 0.25], hair: [0.03, 0.02, 0.015], skin: [0.5, 0.33, 0.25], belt: [0.08, 0.06, 0.02], hairMode: 'bun', skirt: -0.78 }, 'stand');
  scene.add(alex.root);
  const clothMat = await loadPBR('pbr/acg_fabric36', ctx, { repeat: [2.5, 2.5], color: new THREE.Color(0.9, 0.86, 0.78), sheen: { color: 0xffffff, roughness: 0.45 } });
  clothMat.vertexColors = true; clothMat.side = THREE.DoubleSide;
  const cloth = new THREE.Mesh(foldedLinen(0.17, 0.12, 3, 0.0035), clothMat);
  cloth.castShadow = cloth.receiveShadow = true;
  scene.add(cloth);


  // birth fluid: a few glistening strands from the shell lip to the hatchling
  const strandMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.55, 0.42, 0.22), roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.55, depthWrite: false });
  const strands = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.BufferGeometry(), strandMat); m.frustumCulled = false; scene.add(m); return m; });
  // the linen under the egg is wet where the hatchling lies (darker, glossier patches)
  const linenU = { uWetP: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] } };
  linen.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, linenU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLW;').replace('#include <project_vertex>', '#include <project_vertex>\nvLW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vLW; uniform vec4 uWetP[3]; float dkWetL;
float wlH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wlN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(wlH(i), wlH(i+vec2(1,0)), f.x), mix(wlH(i+vec2(0,1)), wlH(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ dkWetL = 0.0;
  for (int i = 0; i < 3; i++) { float r = uWetP[i].w; if (r <= 0.0) continue;
    float d = length(vLW.xz - uWetP[i].xz) + (wlN(vLW.xz * 90.0) - 0.5) * r * 0.6;
    dkWetL = max(dkWetL, 1.0 - smoothstep(r * 0.6, r, d)); }
  diffuseColor.rgb *= mix(1.0, 0.55, dkWetL); }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.25, dkWetL);');
  };
  linen.customProgramCacheKey = () => 'dk-wet-linen';

  camera.near = 0.02; camera.far = 60;
  S = { hatch, egg, frags, alex, cloth, sun, strands, linenU };
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// fixed screen geometry: the camera looks along VIEW (toward the back wall with the window); the
// hatchling's head points screen-left and a little toward camera; Alexandria kneels at screen right
const VIEW = new THREE.Vector3(-0.3, 0, -1).normalize();
const CAM_R = new THREE.Vector3(-VIEW.z, 0, VIEW.x);                 // screen right (horizontal)
const FWD = CAM_R.clone().multiplyScalar(-0.82).addScaledVector(VIEW, -0.57).normalize();

export function update(t, ctx) {
  const { hatch, egg, frags, alex, cloth, strands, linenU } = S;
  // the hatchling: half out of the shell, exhausted - head down on the cloth, eyes half closed,
  // one foreleg slipped forward, breathing hard
  const p = poses.lie(hatch, { t, raise: -0.22, headDown: 0.5, look: [-0.25, -0.05], lidRelax: 0.8, breathe: 0.55 });
  if (p.bones['fl_L_0']) { p.bones['fl_L_0'][0] += 0.55; p.bones['fl_L_0'][2] += 0.25; }
  if (p.bones['fl_L_1']) p.bones['fl_L_1'][0] -= 0.9;
  p.groundBones = [];
  hatch.setPose(p);
  const yaw = Math.atan2(FWD.x, FWD.z);
  hatch.root.position.set(0.0, NEST.y - 0.04, 0.02);
  hatch.root.rotation.set(0, yaw, 0.06);
  hatch.root.updateMatrixWorld(true);
  const fwd = FWD;
  const sideA = new THREE.Vector3(fwd.z, 0, -fwd.x);
  const far = sideA.dot(VIEW) > 0 ? sideA : sideA.clone().negate();   // the hatchling's side away from camera
  // the shell lies on its side around the hindquarters, its broken end toward the head
  const hip = new THREE.Vector3().setFromMatrixPosition(hatch.bones[hatch.boneIndex.lumbar].matrixWorld);
  egg.position.copy(hip).addScaledVector(fwd, -0.06).setY(NEST.y + 0.09);
  egg.lookAt(egg.position.clone().add(fwd).add(new THREE.Vector3(0, 0.25, 0)));
  egg.rotateZ(0.9);
  frags.forEach((f, i) => {
    const ang = yaw + 2.2 + i * 0.6, r = 0.17 + (i % 3) * 0.05;
    f.position.set(egg.position.x + Math.sin(ang) * r, NEST.y + 0.005, egg.position.z + Math.cos(ang) * r);
    f.rotation.set(1.2 + i, i * 2.1, 0.4 * i);
  });
  // the folded cloth slipped under its chest and forelegs; Alexandria's hand under the far end lifts it
  const chest = new THREE.Vector3().setFromMatrixPosition(hatch.bones[hatch.boneIndex.thorax].matrixWorld);
  const axisP = chest.clone().setY(NEST.y + 0.002).addScaledVector(far, 0.06).addScaledVector(fwd, -0.02);
  cloth.position.copy(axisP);
  cloth.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd, new THREE.Vector3(0, 1, 0), far));
  cloth.rotateX(-0.16);
  if (cloth.localToWorld(new THREE.Vector3(0, 0, 0.1)).y < cloth.position.y) cloth.rotateX(0.32);   // the far edge rides up over her fingers
  // Alexandria kneels behind the nest at screen right, leaning in
  applyRiderPose(alex, { bones: {
    spine05: [0.25, 0, 0], spine04: [0.3, 0, 0], spine03: [0.35, 0, 0], spine02: [0.2, 0, 0], neck01: [0.2, 0, 0], head: [0.3, 0, 0],
    'upperleg01.L': [-1.5, 0, 0.1], 'upperleg01.R': [-1.5, 0, -0.1], 'lowerleg01.L': [2.4, 0, 0], 'lowerleg01.R': [2.4, 0, 0],
  } });
  const shoulderGoal = axisP.clone().addScaledVector(CAM_R, 0.28).addScaledVector(VIEW, 0.36).add(new THREE.Vector3(0, 0.27, 0));
  const toward = axisP.clone().sub(shoulderGoal).setY(0).normalize();
  placePerson(alex, 0, 0, 0, Math.atan2(toward.x, toward.z));
  const sh = new THREE.Vector3().setFromMatrixPosition(alex.bones[alex.index['upperarm01.L']].matrixWorld)
    .add(new THREE.Vector3().setFromMatrixPosition(alex.bones[alex.index['upperarm01.R']].matrixWorld)).multiplyScalar(0.5);
  alex.root.position.add(shoulderGoal.clone().sub(sh));
  alex.root.updateMatrixWorld(true);
  // her right hand (the one nearer the camera) slides under the cloth; the left rests on the bedding behind
  {
    const tgtR = axisP.clone().addScaledVector(far, 0.1).add(new THREE.Vector3(0, -0.002, 0)).addScaledVector(fwd, -0.01);
    armIK(alex, 'R', tgtR, tgtR.clone().addScaledVector(toward, -0.3).addScaledVector(CAM_R, 0.2).add(new THREE.Vector3(0, -0.2, 0)), { wristPitch: 0.1 });
    const tgtL = axisP.clone().addScaledVector(far, 0.2).addScaledVector(fwd, -0.12).add(new THREE.Vector3(0, 0.0, 0));
    armIK(alex, 'L', tgtL, tgtL.clone().addScaledVector(toward, -0.3).add(new THREE.Vector3(0, -0.2, 0)), { wristPitch: 0.2 });
  }

  // birth-fluid strands from the shell lip to the hatchling's hip and tail, sagging
  {
    egg.updateMatrixWorld(true);
    const tgts = ['lumbar', 'tail_0', 'tail_1'].map((n) => hatch.boneIndex[n] !== undefined ? new THREE.Vector3().setFromMatrixPosition(hatch.bones[hatch.boneIndex[n]].matrixWorld) : hip);
    strands.forEach((m, i) => {
      const th = 0.6 + i * 1.7;
      const a = egg.localToWorld(new THREE.Vector3(Math.cos(th) * 0.092, Math.sin(th) * 0.092, 0.14 * 0.36));
      const b = tgts[i].clone().add(new THREE.Vector3(0, 0.012 - 0.004 * i, 0));
      const mid = a.clone().lerp(b, 0.5); mid.y -= 0.025 + 0.01 * i;
      m.geometry.dispose();
      m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, a.clone().lerp(mid, 0.5).add(new THREE.Vector3(0, -0.006, 0)), mid, b]), 24, 0.0012 - 0.0003 * i, 5, false);
    });
  }
  // wet patches on the linen: under the shell mouth, under the chest, where the head lies
  {
    const headP = new THREE.Vector3().setFromMatrixPosition(hatch.bones[hatch.boneIndex.head].matrixWorld);
    linenU.uWetP.value[0].set(egg.position.x, 0, egg.position.z, 0.11);
    linenU.uWetP.value[1].set(chest.x, 0, chest.z, 0.07);
    linenU.uWetP.value[2].set(headP.x, 0, headP.z, 0.05);
  }

  // camera: just above the bedding, close on the hatchling's face, looking along VIEW
  const cam = ctx.camera;
  const head = new THREE.Vector3().setFromMatrixPosition(hatch.bones[hatch.boneIndex.head].matrixWorld);
  const aim = head.clone().addScaledVector(fwd, -0.12).add(new THREE.Vector3(0, -0.01, 0));
  cam.position.copy(aim).addScaledVector(VIEW, -0.92).add(new THREE.Vector3(0, 0.2, 0));
  cam.lookAt(aim);
  cam.updateMatrixWorld(true);
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = 50;
  ctx.lens.fstop = 2.8;
  ctx.lens.focusTarget = hatch.bones[hatch.boneIndex.eye_L] || hatch.bones[hatch.boneIndex.head];
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 1600;
}
