// Cabbage palms (Sabal palmetto, G11): the native palm of the Gulf Coast, the tree that says
// "the coast" before you see the water. Built here from scratch (no model): a slightly leaning
// trunk covered in the criss-cross of old leaf bases ("boots"), and a round crown of fan-shaped,
// costapalmate fronds, the young ones standing up, the old ones drooping, a few dead brown ones
// hanging in a skirt underneath. The crown sways in the wind and lets the light through like the
// other trees' leaves (entities/bodyshade.js).
// Where they grow: on the dunes behind the Gulf beaches (in clumps), along the Coast Highway
// out of Port Calvera, in the city's parks and on its waterfront.
// Instanced (four shapes), only the ones within a few hundred metres are drawn.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { shadeLeaves } from '../entities/bodyshade.js';
import { worldUniforms } from './terrain.js';
import { coastZ, CITY } from './layout.js';
import { mulberry32 } from '../util.js';
import { nearInstances, NEAR_RANGE } from '../core/nearinst.js';

const SHAPES = [
  { h: 6.5, bend: 0.035, fronds: 16, seed: 11 },
  { h: 8.6, bend: 0.07, fronds: 18, seed: 23 },
  { h: 10.6, bend: 0.11, fronds: 20, seed: 37 },
  { h: 12.2, bend: 0.025, fronds: 18, seed: 51 },
];

// the trunk: a tapered tube that leans a little (the bend grows towards the top)
function trunkGeo(H, bend) {
  const R = 14, S = 9, pos = [], nrm = [], uv = [], idx = [];
  for (let j = 0; j <= R; j++) {
    const t = j / R, y = t * H, cx = bend * H * t * t;
    const r = 0.2 - 0.05 * t + 0.09 * Math.max(0, 1 - t * 9); // a flared foot
    for (let i = 0; i <= S; i++) {
      const a = (i / S) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      pos.push(cx + c * r, y, s * r); nrm.push(c, 0.08, s); uv.push(i / S, y);
    }
  }
  for (let j = 0; j < R; j++) for (let i = 0; i < S; i++) {
    const a = j * (S + 1) + i, b = a + S + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// the crown: fronds radiating from the top of the trunk (or, for a saw palmetto clump, from the
// ground: opts.clump)
function crownGeo(H, bend, n, seed, lite = false, opts = {}) {
  const rnd = mulberry32(seed);
  const top = new THREE.Vector3(bend * H, H, 0);
  const P = [], C = [], A = [], I = [];
  const col = new THREE.Color();
  const quad = (a, b, c, d, ca, cb, ao) => { // a-b at the base, d-c at the tip
    const o = P.length / 3;
    for (const v of [a, b, c, d]) P.push(v.x, v.y, v.z);
    for (const cc of [ca, ca, cb, cb]) C.push(cc.r, cc.g, cc.b);
    A.push(ao, ao, ao, ao);
    I.push(o, o + 1, o + 2, o, o + 2, o + 3);
  };
  const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
  const frond = (az, el, len, dead) => {
    const f = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
    let side = new THREE.Vector3().crossVectors(f, UP); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize();
    const nrm = new THREE.Vector3().crossVectors(side, f).normalize();
    // the petiole (leaf stalk): a thin strip from the crown out to the blade, sagging a little
    const base = top.clone().addScaledVector(f, 0.15), tip = top.clone().addScaledVector(f, len * 0.55).addScaledVector(DOWN, len * 0.06);
    const sc = dead ? col.setHex(0x6e5636).clone() : col.setHex(0x6d7a3a).clone();
    quad(base.clone().addScaledVector(side, 0.035), base.clone().addScaledVector(side, -0.035), tip.clone().addScaledVector(side, -0.02), tip.clone().addScaledVector(side, 0.02), sc, sc, dead ? 0.5 : 0.75);
    // the blade: a fan of folded leaflets from the stalk's tip, the outer ones drooping hardest
    const K = lite ? 9 : 13, spread = 1.35, L = len * (0.75 + rnd() * 0.15);
    const g0 = dead ? col.setHex(0x8a6c45).clone() : col.setHSL(0.23 + rnd() * 0.04, 0.42 + rnd() * 0.12, 0.27 + rnd() * 0.06).clone();
    const g1 = dead ? col.setHex(0x6b5234).clone() : g0.clone().multiplyScalar(0.72).lerp(new THREE.Color(0x8b8a3a), 0.15);
    for (let k = 0; k < K; k++) {
      const a = (k / (K - 1) - 0.5) * spread * 2 * (0.9 + rnd() * 0.15);
      const dir = f.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a)).addScaledVector(nrm, 0.12).normalize();
      const across = new THREE.Vector3().crossVectors(dir, nrm).normalize();
      const ll = L * (0.78 + 0.22 * Math.cos(a)) * (0.9 + rnd() * 0.2);
      const droop = (dead ? 0.9 : 0.25 + Math.abs(a) * 0.35 + Math.max(0, -el) * 0.5) * ll;
      const SEG = lite ? 3 : 4;
      let prevL = null, prevR = null, prevC = null;
      for (let s = 0; s <= SEG; s++) {
        const t = s / SEG, w = 0.05 * (1 - t * 0.85) * (s === 0 ? 0.5 : 1);
        const p = tip.clone().addScaledVector(dir, ll * t).addScaledVector(DOWN, droop * t * t);
        // folded along its midrib (a shallow V), which catches the light like the real thing
        const pl = p.clone().addScaledVector(across, w).addScaledVector(nrm, -w * 0.5), pr = p.clone().addScaledVector(across, -w).addScaledVector(nrm, -w * 0.5);
        const cc = g0.clone().lerp(g1, t);
        if (prevL) quad(prevL, prevR, pr, pl, prevC, cc, dead ? 0.55 : 0.6 + 0.4 * t);
        prevL = pl; prevR = pr; prevC = cc;
      }
    }
  };
  if (opts.clump) {
    // saw palmetto: stiff fans on short stalks straight out of the ground, mostly standing up and
    // out, a few old ones browning at the bottom
    for (let i = 0; i < n; i++) {
      const az = rnd() * Math.PI * 2, el = 0.35 + rnd() * 0.85;
      top.set((rnd() - 0.5) * 0.5, 0.05, (rnd() - 0.5) * 0.5);
      frond(az, el, 0.75 + rnd() * 0.45, i % 7 === 6);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2 + rnd() * 0.3;
      const layer = i % 3; // young (up), mature (out), old (drooping)
      const el = layer === 0 ? 0.75 + rnd() * 0.35 : layer === 1 ? 0.15 + rnd() * 0.3 : -0.35 - rnd() * 0.35;
      frond(az, el, 1.7 + rnd() * 0.5, false);
    }
    // a skirt of dead fronds hanging against the trunk
    for (let i = 0; i < 5; i++) frond(rnd() * Math.PI * 2, -1.15 - rnd() * 0.25, 1.4, true);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aSbAO', new THREE.Float32BufferAttribute(A, 1));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

export function createPalms(scene, { hm, collision, quality: q, cityBlocks = [], graph = null }) {
  const rnd = mulberry32(3131);
  const spots = []; // [x, z, shape, scale, rot]
  const clear = (x, z, r) => {
    let hit = false;
    collision.query(x, z, r + 6, (it) => {
      if (hit) return;
      if (it.t === 0 && x > it.minX - r && x < it.maxX + r && z > it.minZ - r && z < it.maxZ + r) hit = true;
      else if (it.t === 1 && it.r > 0 && Math.hypot(it.x - x, it.z - z) < it.r + r) hit = true;
      else if (it.t === 3) {
        const dx = it.bx - it.ax, dz = it.bz - it.az, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - it.ax) * dx + (z - it.az) * dz) / L2));
        if (Math.hypot(it.ax + dx * t - x, it.az + dz * t - z) < it.hw + r + 0.8) hit = true;
      }
    });
    return !hit;
  };
  const add = (x, z) => {
    const y = hm.height(x, z);
    if (y < hm.waterLevel(x, z) + 0.6) return false;
    if (hm.splatAt && hm.splatAt(x, z, 3) > 0.2) return false; // not on pavement
    if (!clear(x, z, 1.2)) return false;
    spots.push([x, y, z, (rnd() * SHAPES.length) | 0, 0.8 + rnd() * 0.45, rnd() * Math.PI * 2]);
    collision.addCircle(x, z, 0.24);
    return true;
  };
  // 1. the dunes behind the Gulf beaches, in clumps
  for (let x = -1980; x < 1980; x += 26 + rnd() * 30) {
    if (rnd() < 0.35) continue;
    const back = 48 + rnd() * 70, cz = coastZ(x) - back;
    const n = 1 + ((rnd() * 4) | 0);
    for (let k = 0; k < n; k++) add(x + (rnd() - 0.5) * 9, cz + (rnd() - 0.5) * 9);
  }
  // 2. along the Coast Highway out of Port Calvera (both sides, the first stretch)
  if (graph) {
    const e = graph.edges.find((ed) => ed.kind === 'highway' && (ed.a === 'c0_5' || ed.b === 'c0_5'));
    if (e) {
      let acc = 0, next = 14;
      for (let i = 1; i < e.pts.length && acc < 1300; i++) {
        const [ax, az] = e.pts[i - 1], [bx, bz] = e.pts[i], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
        const tx = (bx - ax) / L, tz = (bz - az) / L;
        while (next < acc + L) {
          const s = next - acc; next += 24 + rnd() * 8;
          for (const sd of [-1, 1]) { const off = e.width / 2 + 3.2; add(ax + tx * s - tz * off * sd, az + tz * s + tx * off * sd); }
        }
        acc += L;
      }
    }
  }
  // 3. Port Calvera's parks and the blocks along the waterfront
  for (const bl of cityBlocks) {
    if (bl.type === 'park') for (let k = 0; k < 7; k++) add(bl.cx + (rnd() - 0.5) * 62, bl.cz + (rnd() - 0.5) * 62);
  }
  for (let x = CITY.x0 + 8; x < CITY.x0 + CITY.nx * CITY.pitch; x += 18 + rnd() * 10) {
    const z = Math.min(coastZ(x) - 14, CITY.z0 + CITY.nz * CITY.pitch + 30 + rnd() * 20);
    add(x, z);
  }
  if (!spots.length) return { count: 0, update() {} };

  // ---- materials
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8c8070, roughness: 0.95 });
  trunkMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPU;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPU = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vPU;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          // the criss-cross of old leaf bases ("boots") on the upper trunk; the lower trunk
          // weathers smooth and grey with fine rings
          float ht = vPU.y;
          vec2 q = vec2(vPU.x * 7.0, ht * 2.3);
          float boots = abs(fract(q.x + q.y) - 0.5) + abs(fract(q.x - q.y) - 0.5);
          float upper = smoothstep(2.0, 4.5, ht);
          float groove = smoothstep(0.35, 0.12, boots) * upper;
          float rings = 0.5 + 0.5 * sin(ht * 26.0);
          diffuseColor.rgb *= mix(vec3(0.92, 0.9, 0.88) * (0.9 + 0.1 * rings), vec3(0.95, 0.85, 0.7), upper) * (1.0 - groove * 0.55);
        }`);
  };
  trunkMat.customProgramCacheKey = () => 'sbpalmtrunk';
  const crownMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.62 });
  crownMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = worldUniforms.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          // the crown sways in the sea breeze, the frond tips most
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
          ip = instanceMatrix[3].xyz;
          #endif
          float ph = dot(ip.xz, vec2(0.13, 0.07));
          float k = clamp(length(position.xz) / 2.2, 0.0, 1.0);
          transformed.x += (sin(uTime * 1.1 + ph) * 0.06 + sin(uTime * 2.7 + ph * 3.0 + position.y) * 0.03) * k;
          transformed.z += sin(uTime * 0.9 + ph * 1.7) * 0.05 * k;
          transformed.y += sin(uTime * 2.3 + ph + position.x * 2.0) * 0.03 * k * k;
        }`);
  };
  crownMat.customProgramCacheKey = () => 'sbpalmcrown';
  shadeLeaves(crownMat); // light through the leaves, a shade per tree

  const range = (NEAR_RANGE[q.label] || 140) * 2.6;
  const meshes = [];
  const m = new THREE.Matrix4(), qq = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3();
  SHAPES.forEach((S, si) => {
    const list = spots.filter((p) => p[3] === si).map(([x, y, z, , sc, r]) => new THREE.Matrix4().compose(v.set(x, y - 0.15, z), qq.setFromAxisAngle(UP, r), s.set(sc, sc, sc)));
    if (!list.length) return;
    const trunk = new THREE.InstancedMesh(trunkGeo(S.h, S.bend), trunkMat, list.length);
    const crown = new THREE.InstancedMesh(crownGeo(S.h, S.bend, S.fronds, S.seed, q.label === 'Phone' || q.label === 'Low'), crownMat, list.length); // (fewer leaflets on Low and Phone)
    for (const im of [trunk, crown]) {
      im.castShadow = q.shadows > 0; im.receiveShadow = true; im.userData.noReflect = true;
      nearInstances(im, list, range).update(v.set(0, 0, 0), true);
      scene.add(im); meshes.push(im);
    }
  });
  void m;
  // ---- saw palmetto clumps (G12): the low fan palms of Gulf Coast pinewoods, dunes and ditches
  const clumps = [];
  const crnd = mulberry32(9191);
  const tries = q.label === 'Phone' ? 6000 : 14000;
  for (let k = 0; k < tries; k++) {
    const x = (crnd() * 2 - 1) * 1980, z = (crnd() * 2 - 1) * 1980;
    const dC = coastZ(x) - z;
    const y = hm.height(x, z);
    if (y < hm.waterLevel(x, z) + 0.4 || hm.splatAt(x, z, 3) > 0.1) continue;
    // where they grow: the pine woods' understory (sandy, forest floor), the dunes behind the beach,
    // the low wet bayou ground; thinly anywhere else in the open
    const forest = hm.splatAt(x, z, 1), sand = hm.splatAt(x, z, 0);
    const p = dC > 40 && dC < 200 ? 0.6 : forest > 0.4 ? 0.35 : sand > 0.3 ? 0.25 : 0.04;
    if (crnd() > p) continue;
    if (Math.abs(x - CITY.x0 - CITY.nx * CITY.pitch / 2) < CITY.nx * CITY.pitch / 2 + 30 && Math.abs(z - CITY.z0 - CITY.nz * CITY.pitch / 2) < CITY.nz * CITY.pitch / 2 + 30) continue;
    if (!clear(x, z, 0.9)) continue;
    const n = 1 + ((crnd() * 3) | 0);
    for (let i = 0; i < n; i++) { const px = x + (crnd() - 0.5) * 2.5, pz = z + (crnd() - 0.5) * 2.5; clumps.push([px, hm.height(px, pz), pz, (crnd() * 3) | 0, 0.7 + crnd() * 0.6, crnd() * 6.28]); }
  }
  if (clumps.length) {
    for (let vi = 0; vi < 3; vi++) {
      const list = clumps.filter((c) => c[3] === vi).map(([x, y, z, , sc, r]) => new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.05, z), new THREE.Quaternion().setFromAxisAngle(UP, r), new THREE.Vector3(sc, sc, sc)));
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(crownGeo(0, 0, 12 + vi * 3, 700 + vi * 13, q.label === 'Phone' || q.label === 'Low', { clump: true }), crownMat, list.length);
      im.castShadow = q.shadows > 0; im.receiveShadow = true; im.userData.noReflect = true; im.userData.noHit = true;
      nearInstances(im, list, (NEAR_RANGE[q.label] || 140) * 1.5).update(v.set(0, 0, 0), true);
      scene.add(im); meshes.push(im);
    }
  }
  return { count: spots.length, palmettos: clumps.length, meshes, list: () => spots.map(([x, y, z, sh, sc]) => ['palm' + sh, x, y, z, sc]) };
}
