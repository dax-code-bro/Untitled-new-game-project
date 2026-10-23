// FX library - gore, made the way a prosthetics department would: appliances glued onto the body
// (they ride on a bone of the skeleton), make-up decals, and costume damage. For a live-action
// drama rating (SERIES.md section 8): realistic, brief, never instructional.
//
//   fx.gore.wingRoot({ creature, side: 'L', t0, bleed: true })   the scout's torn LEFT wing root:
//        torn hide flaps curling out, exposed muscle, shattered bone ends, tattered membrane
//        strips flapping in the slipstream, blood streaming back over the flank and spraying off
//   fx.gore.openFracture({ character, side: 'R', t0 })            bone through the torn hose below
//        the knee, blood soaking the cloth (R17)
//   fx.gore.scalp({ character, side: 'R', t0 })                  a split scalp, blood sheeting down
//        one side of the face (R17)
//   fx.gore.burnedRider({ character, t0 })                       1F-14b: a sleeve burned away, the
//        forearm and the side of the neck blistered raw with blackened edges, scorched leather
//   fx.gore.hole({ mesh, at, radius, edge: 'char' | 'torn', t0, t1 })   costume burn-through / tear
//   fx.gore.burn / gash / char (decals: see core/decal.js)
//   fx.gore.appliance(bone, worldPos, worldDir)                  attach any mesh to a bone, posed now
import * as THREE from 'three';
import { Effect } from './core/manager.js';
import { DecalEffect } from './core/decal.js';
import { hash01, arr3, clamp, smoothstep, norm3, cross3, noise1 } from './core/util.js';

// ------------------------------------------------------------------ materials --
const TISSUE_GLSL = /* glsl */`
float gH(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float gN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gH(i), gH(i + vec3(1,0,0)), f.x), mix(gH(i + vec3(0,1,0)), gH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gH(i + vec3(0,0,1)), gH(i + vec3(1,0,1)), f.x), mix(gH(i + vec3(0,1,1)), gH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float gF(vec3 p) { return gN(p) * 0.5 + gN(p * 2.1 + 3.1) * 0.3 + gN(p * 4.3 + 7.7) * 0.2; }
`;
/**
 * kind: 'muscle' (fibrous, wet, deep red with darker clots and pale fascia), 'bone' (ivory,
 * blood in the cracks), 'hide' (two-sided flap: outside the creature's / person's skin colour,
 * inside raw dermis), 'membrane' (thin, translucent, blood along the torn edge)
 */
function tissueMaterial(kind, o = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: kind === 'bone' ? 0.45 : 0.55, metalness: 0,
    clearcoat: kind === 'bone' ? 0.2 : 0.18, clearcoatRoughness: kind === 'bone' ? 0.35 : 0.3,
    side: kind === 'hide' || kind === 'membrane' ? THREE.DoubleSide : THREE.FrontSide,
    sheen: kind === 'muscle' ? 0.3 : 0, sheenColor: new THREE.Color(0.35, 0.05, 0.04), sheenRoughness: 0.5,
  });
  const U = { uOut: { value: new THREE.Vector3(...(o.outside || [0.05, 0.045, 0.04])) }, uScale: { value: o.scale ?? 1 }, uBlood: { value: o.blood ?? 0.45 }, uMarrow: { value: o.marrow ?? 0 }, uLen: { value: o.length ?? 1 }, uC: { value: new THREE.Vector3(...(o.center || [0, 0, 0])) }, uRad: { value: o.radius ?? 0.1 } };
  m.userData.tissue = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vGP; uniform vec3 uOut, uC; uniform float uScale, uBlood, uMarrow, uLen, uRad;\n${TISSUE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec3 gp = vGP / max(uScale, 1e-4);
float gr = 0.5;
${kind === 'muscle' ? `
  // muscle: fibres along local z, glistening; clotted dark patches, pale fascia streaks
  float fib = gN(vec3(gp.x * 60.0, gp.y * 60.0, gp.z * 6.0));
  float clot = smoothstep(0.55, 0.75, gF(gp * 9.0 + 4.0));
  float fas = smoothstep(0.72, 0.85, gN(vec3(gp.x * 14.0, gp.y * 14.0, gp.z * 2.0) + 9.0));
  float fib2 = gN(vec3(gp.x * 160.0, gp.y * 160.0, gp.z * 12.0));
  vec3 c = mix(vec3(0.12, 0.012, 0.01), vec3(0.26, 0.03, 0.022), fib * 0.7 + fib2 * 0.3);
  c = mix(c, vec3(0.03, 0.002, 0.002), clot * 0.9);
  c = mix(c, vec3(0.42, 0.3, 0.25), fas * 0.45);
  diffuseColor.rgb = c; gr = 0.25 + 0.3 * clot;` : kind === 'bone' ? `
  // bone: ivory, porous where it broke, blood in the pores and cracks near the base
  float por = gF(gp * 40.0);
  float zz = vGP.z / max(uScale, 1e-4);
  float base = smoothstep(0.4 + 0.3 * uBlood, 0.0, zz);
  // blood smeared up the shaft in streaks along it (it came out through the wound)
  float streak = smoothstep(0.3, 0.6, gN(vec3(gp.x * 90.0, gp.y * 90.0, gp.z * 5.0) + 2.0)) * smoothstep(1.1 * uBlood, 0.0, zz);
  vec3 c = mix(vec3(0.42, 0.36, 0.27), vec3(0.3, 0.24, 0.17), por);
  // the broken end: spongy, red marrow-filled bone where it split
  c = mix(c, mix(vec3(0.3, 0.06, 0.04), vec3(0.45, 0.32, 0.24), por), smoothstep(0.75, 0.95, zz / max(uLen, 1e-3)) * uMarrow);
  c = mix(c, vec3(0.1, 0.01, 0.008), clamp(base * (0.7 + 0.6 * por) + 0.25 * smoothstep(0.6, 0.8, por) + streak * 0.85, 0.0, 1.0));
  diffuseColor.rgb = c; gr = 0.5 - 0.3 * max(base, streak);` : kind === 'hide' ? `
  // a torn flap: the creature's / person's skin outside, raw pink-red dermis and blood inside
  float bl = gF(gp * 12.0);
  vec3 inner = mix(vec3(0.26, 0.07, 0.055), vec3(0.08, 0.006, 0.005), smoothstep(0.3, 0.6, bl));
  diffuseColor.rgb = gl_FrontFacing ? uOut * (0.85 + 0.3 * bl) : inner; gr = gl_FrontFacing ? 0.55 : 0.3;` : kind === 'wound' ? `
  // an open wound in skin: torn flesh in the middle, the skin around it under a blood film that
  // thins toward the rim, where the skin shows through in patches (uScale = the bed's radius)
  float rr = length(vGP.xy) / max(uScale, 1e-4);
  float n1 = gF(vec3(vGP.xy / uScale * 3.0, 1.0)), n2 = gF(vec3(vGP.xy / uScale * 11.0, 4.0));
  float fib = gN(vec3(vGP.x / uScale * 40.0, vGP.y / uScale * 8.0, 2.0));
  vec3 flesh = mix(vec3(0.07, 0.007, 0.005), vec3(0.18, 0.025, 0.018), fib);
  flesh = mix(flesh, vec3(0.025, 0.002, 0.002), smoothstep(0.5, 0.72, n2));
  float film = 1.0 - smoothstep(0.95, 1.2, rr + (n1 - 0.5) * 0.5) * smoothstep(0.35, 0.65, n2);
  vec3 skin = uOut * (0.9 + 0.2 * n2);
  vec3 c = mix(skin, mix(vec3(0.04, 0.003, 0.002), vec3(0.1, 0.009, 0.007), n2), film);
  c = mix(c, flesh, 1.0 - smoothstep(0.3, 0.55, rr + (n1 - 0.5) * 0.3));
  diffuseColor.rgb = c; gr = mix(0.62, 0.2, film);` : kind === 'burnskin' ? `
  // a burned forearm minutes after: zones out from where it burned longest (uC, radius uRad, in
  // the patch's own bind-space metres): full thickness - leathery, blackened and waxy grey-white;
  // deep partial - raw, weeping red with sloughed skin hanging at its edges; superficial - tight
  // pale blisters; then reddened skin
  float n1 = gF(vGP * 30.0 + 1.0), n2 = gF(vGP * 90.0 + 5.0), n3 = gF(vGP * 220.0 + 9.0);
  float zr = length(vGP - uC) / max(uRad, 1e-4) + (n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.15;
  vec3 skin = uOut * vec3(0.95, 0.62, 0.55) * (0.85 + 0.3 * n3);
  vec3 rawC = mix(vec3(0.085, 0.011, 0.008), vec3(0.19, 0.03, 0.022), n3);
  vec3 blisC = mix(vec3(0.34, 0.26, 0.19), vec3(0.42, 0.33, 0.24), n3);
  vec3 sloC = vec3(0.3, 0.27, 0.23) * (0.8 + 0.3 * n3);
  vec3 fullC = mix(vec3(0.03, 0.022, 0.016), vec3(0.3, 0.27, 0.23), smoothstep(0.45, 0.75, n2));
  float full = 1.0 - smoothstep(0.25, 0.42, zr);
  float raw = smoothstep(0.25, 0.4, zr) * (1.0 - smoothstep(0.62, 0.78, zr));
  float slo = smoothstep(0.55, 0.65, zr) * (1.0 - smoothstep(0.7, 0.8, zr)) * smoothstep(0.4, 0.6, n2);
  float blis = smoothstep(0.68, 0.78, zr) * (1.0 - smoothstep(0.9, 1.05, zr)) * smoothstep(0.35, 0.55, n2);
  vec3 c = skin;
  c = mix(c, blisC, blis);
  c = mix(c, rawC, raw);
  c = mix(c, sloC, slo);
  c = mix(c, fullC, full);
  diffuseColor.rgb = c; gr = mix(mix(mix(0.55, 0.32, blis), 0.16, raw), 0.7, full);` : `
  // torn membrane: thin, grey-brown, darker veins, blood soaking in from the torn edge (low z)
  float vein = smoothstep(0.78, 0.9, gN(vec3(gp.x * 8.0, gp.y * 30.0, gp.z * 8.0)));
  float edge = smoothstep(0.25, 0.0, vGP.z / max(uScale, 1e-4));
  vec3 c = mix(uOut, uOut * 0.55, vein);
  c = mix(c, vec3(0.16, 0.012, 0.01), clamp(edge + 0.25 * gF(gp * 20.0) * edge, 0.0, 1.0));
  diffuseColor.rgb = c; gr = 0.4;`}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gr;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= clamp((0.62 - gr) * 3.0, 0.0, 1.0);\n#endif');
  };
  m.customProgramCacheKey = () => `fx-gore-${kind}`;
  return m;
}

// ------------------------------------------------------------------ geometry --
/** A splintered bone end: a tapering tube along +z with a jagged broken tip. */
function boneShardGeometry(seed, length, radius) {
  const g = new THREE.CylinderGeometry(radius * 0.85, radius, length, 14, 8, false);
  g.rotateX(Math.PI / 2); g.translate(0, 0, length / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(y, x);
    // the top ring: splintered - long spikes and a slanted break
    if (z > length * 0.85) {
      // an oblique (spiral) break: the end is a slanted, splintered face, a few long spikes
      const spike = Math.pow(hash01(seed, Math.round(a * 7), 1), 4) * length * 0.45;
      const slant = Math.cos(a + seed) * radius * 1.4;
      // (kept above the ring below it: a tip folded back under itself printed a dark crease)
      p.setZ(i, Math.max(length * (0.58 + 0.16 * hash01(seed, Math.round(a * 7), 4)), z - length * 0.2 + slant + spike));
      p.setX(i, x * (0.6 + 0.4 * hash01(seed, Math.round(a * 7), 2))); p.setY(i, y * (0.6 + 0.4 * hash01(seed, Math.round(a * 7), 3)));
    }
    const n = noise1(a * 3 + z * 20, seed) * radius * 0.12;
    p.setX(i, p.getX(i) + Math.cos(a) * n); p.setY(i, p.getY(i) + Math.sin(a) * n);
  }
  g.computeVertexNormals();
  return g;
}
/**
 * Exposed tissue: a torn CRATER over a disc of radius R (local +z out of the body): recessed in
 * the middle (where the limb was), lumpy and shredded, the rim raised where the hide tore.
 */
function tissueDomeGeometry(seed, R, h) {
  const nr = 24, na = 48;
  const P = [], I = [];
  for (let i = 0; i <= nr; i++) for (let j = 0; j < na; j++) {
    const r = (i / nr) * R, a = (j / na) * Math.PI * 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r, u = r / R;
    const n = noise1(x * 9 / R + seed, seed) * 0.5 + noise1(y * 11 / R + 3 + seed, seed + 1) * 0.4 + noise1((x + y) * 27 / R, seed + 2) * 0.35 + noise1((x - y) * 61 / R + 5, seed + 3) * 0.2;
    // bowl: deepest in the middle, a torn lip near the rim, shredded lumps everywhere
    const z = -h * (1 - u * u) * 0.9 + h * 0.5 * Math.exp(-((u - 0.85) ** 2) / 0.01) + n * h * 0.55 * (0.4 + u);
    P.push(x * (1 + 0.08 * n), y * (1 + 0.08 * n), z);
  }
  for (let i = 0; i < nr; i++) for (let j = 0; j < na; j++) {
    const a = i * na + j, b = i * na + (j + 1) % na, c = (i + 1) * na + j, d = (i + 1) * na + (j + 1) % na;
    I.push(a, d, b, a, c, d);          // (counter-clockwise seen from +z: the bed faces out of the body)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}
/** Shreds: thin torn strands of muscle / tendon hanging out of a wound (local +z out). */
function shredGeometry(seed, R, n = 9) {
  const parts = [];
  for (let k = 0; k < n; k++) {
    const a = hash01(seed, k, 1) * Math.PI * 2, r0 = R * (0.2 + 0.6 * hash01(seed, k, 2));
    const len = R * (0.25 + 0.7 * hash01(seed, k, 3)), rad = R * (0.025 + 0.05 * hash01(seed, k, 4));
    const pts = [];
    for (let m = 0; m <= 6; m++) {
      const s = m / 6;
      pts.push(new THREE.Vector3(Math.cos(a) * (r0 + s * len * 0.4) + noise1(s * 3 + k, seed) * rad * 3, Math.sin(a) * (r0 + s * len * 0.4) - s * s * len * 0.6, -0.1 * R + s * len * 0.5));
    }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, rad, 5, false);
    const pa = g.attributes.position;
    // taper to a torn point
    for (let i = 0; i < pa.count; i++) {
      const ring = Math.floor(i / 6) / 10;
      const c = pts[Math.min(6, Math.round(ring * 6))];
      pa.setXYZ(i, c.x + (pa.getX(i) - c.x) * (1 - 0.7 * ring), c.y + (pa.getY(i) - c.y) * (1 - 0.7 * ring), c.z + (pa.getZ(i) - c.z) * (1 - 0.7 * ring));
    }
    parts.push(g);
  }
  const merged = mergeGeos(parts);
  merged.computeVertexNormals();
  return merged;
}
function mergeGeos(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const P = new Float32Array(nv * 3), I = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    P.set(g.attributes.position.array, ov * 3);
    const idx = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()];
    for (let i = 0; i < idx.length; i++) I[oi + i] = idx[i] + ov;
    ov += g.attributes.position.count; oi += idx.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setIndex(new THREE.BufferAttribute(I, 1));
  return out;
}
/** A ring of torn flaps round radius R curling outward (local +z out). */
function flapRingGeometry(seed, R, n = 16) {
  const P = [], I = [];
  for (let f = 0; f < n; f++) {
    // irregular: some flaps missing, widths and lengths vary a lot, angles jittered
    if (hash01(seed, f, 9) < 0.3) continue;
    const a0 = ((f + (hash01(seed, f, 8) - 0.5) * 0.6) / n) * Math.PI * 2, wA = (Math.PI * 2 / n) * (0.5 + 1.1 * hash01(seed, f, 1));
    const len = R * (0.08 + 0.45 * Math.pow(hash01(seed, f, 2), 1.8));
    const curl = 0.3 + 1.6 * hash01(seed, f, 3);
    const segU = 3, segV = 4, base = P.length / 3;
    for (let v = 0; v <= segV; v++) for (let u = 0; u <= segU; u++) {
      const a = a0 + (u / segU - 0.5) * wA;
      const s = v / segV;
      const rag = s === 1 ? (hash01(seed, f * 10 + u, 4) - 0.5) * len * 0.5 : 0;
      const L = (len + rag) * s;
      // the flap peels back: from the rim outward and curling away from the wound (toward -z)
      const ang = curl * s;
      const r = R * (1.0 + 0.05 * hash01(seed, f, 5)) + Math.sin(ang) * L / Math.max(ang, 1e-3) * (ang > 1e-3 ? 1 : 0) + (ang <= 1e-3 ? L : 0);
      const z = R * 0.08 - (1 - Math.cos(ang)) * L / Math.max(ang, 1e-3) * 0.9;
      P.push(Math.cos(a) * r, Math.sin(a) * r, z);
    }
    for (let v = 0; v < segV; v++) for (let u = 0; u < segU; u++) {
      const a = base + v * (segU + 1) + u;
      I.push(a, a + 1, a + segU + 2, a, a + segU + 2, a + segU + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ attach helpers --
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();
/**
 * Put `obj` on `bone` so that, in the CURRENT pose, its local +z points along worldDir from
 * worldPos (it then follows the bone in every later pose).
 */
export function attachToBone(bone, obj, worldPos, worldDir, worldUp = [0, 1, 0]) {
  bone.updateWorldMatrix(true, false);
  const z = new THREE.Vector3(...arr3(worldDir)).normalize();
  let up = new THREE.Vector3(...arr3(worldUp));
  if (Math.abs(up.dot(z)) > 0.95) up = new THREE.Vector3(1, 0, 0);
  const x = new THREE.Vector3().crossVectors(up, z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
  const W = new THREE.Matrix4().makeBasis(x, y, z).setPosition(new THREE.Vector3(...arr3(worldPos)));
  const L = new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(W);
  L.decompose(obj.position, obj.quaternion, obj.scale);
  bone.add(obj);
  obj.updateMatrixWorld(true);
  return obj;
}
/**
 * A patch shaped like a garment from the inside: the (skinned) garment's triangles within
 * `radius` of a world point, pulled in along their normals by `inset` (mesh units) and bound to
 * the same skeleton - the limb under a burned-away / torn sleeve, where the build removed the
 * body's skin (it deletes skin that garments cover).
 */
export function shellPatch(mesh, centerW, radius, inset, material) {
  const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, idx = g.index;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  mesh.updateWorldMatrix(true, false);
  if (mesh.isSkinnedMesh) mesh.skeleton.update();
  const c = new THREE.Vector3(...arr3(centerW)), v = new THREE.Vector3();
  const near = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    if (mesh.isSkinnedMesh) mesh.getVertexPosition(i, v); else v.fromBufferAttribute(pos, i);
    v.applyMatrix4(mesh.matrixWorld);
    near[i] = v.distanceTo(c) < radius ? 1 : 0;
  }
  const map = new Map(), P = [], N = [], SI = [], SW = [], I = [];
  const nt = (idx ? idx.count : pos.count) / 3;
  const vid = (k) => {
    if (map.has(k)) return map.get(k);
    const j = P.length / 3;
    const nx = nor ? nor.getX(k) : 0, ny = nor ? nor.getY(k) : 0, nz = nor ? nor.getZ(k) : 0;
    P.push(pos.getX(k) - nx * inset, pos.getY(k) - ny * inset, pos.getZ(k) - nz * inset);
    N.push(nx, ny, nz);
    if (si) { SI.push(si.getX(k), si.getY(k), si.getZ(k), si.getW(k)); SW.push(sw.getX(k), sw.getY(k), sw.getZ(k), sw.getW(k)); }
    map.set(k, j);
    return j;
  };
  for (let t = 0; t < nt; t++) {
    const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, d = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    if (!(near[a] && near[b] && near[d])) continue;
    I.push(vid(a), vid(b), vid(d));
  }
  if (!I.length) return null;
  // bind-space point nearest the world centre (for materials that grade out from it)
  let best = -1, bd = Infinity;
  for (let i = 0; i < pos.count; i++) {
    if (!near[i]) continue;
    if (mesh.isSkinnedMesh) mesh.getVertexPosition(i, v); else v.fromBufferAttribute(pos, i);
    v.applyMatrix4(mesh.matrixWorld);
    const dd = v.distanceTo(c);
    if (dd < bd) { bd = dd; best = i; }
  }
  const centreBind = best >= 0 ? [pos.getX(best), pos.getY(best), pos.getZ(best)] : [0, 0, 0];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  if (si) { geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4)); }
  geo.setIndex(I);
  let m;
  if (mesh.isSkinnedMesh && si) { m = new THREE.SkinnedMesh(geo, material); m.bind(mesh.skeleton, mesh.bindMatrix); m.bindMode = mesh.bindMode; }
  else m = new THREE.Mesh(geo, material);
  m.position.copy(mesh.position); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale);
  m.castShadow = m.receiveShadow = true; m.frustumCulled = false;
  m.name = `${mesh.name}:fx-patch`;
  m.userData.centreBind = centreBind;
  const U = material.userData?.tissue;
  if (U?.uC) U.uC.value.set(...centreBind);
  mesh.parent.add(m);
  return m;
}
/** Nearest posed surface point of a (skinned) mesh along a ray (null if missed). */
export function surfaceHit(mesh, origin, dir) {
  const rc = new THREE.Raycaster(new THREE.Vector3(...arr3(origin)), new THREE.Vector3(...arr3(dir)).normalize(), 0, 50);
  mesh.updateWorldMatrix(true, false);
  if (mesh.isSkinnedMesh) mesh.skeleton.update();
  const hit = rc.intersectObject(mesh, false)[0];
  if (!hit) return null;
  return { point: hit.point.toArray(), normal: hit.face ? hit.face.normal.clone().transformDirection(mesh.matrixWorld).toArray() : arr3(dir).map((v) => -v), distance: hit.distance };
}

// ------------------------------------------------------------------ cloth holes --
const MAX_HOLES = 4;
/**
 * Burn-through or tear in a garment (material patch on that mesh; up to 4 per material):
 * fragments inside the hole are discarded, a charred / frayed band rings it; the radius grows
 * from 0 at t0 to `radius` at t1 (call hole.update(t)). centre given in WORLD space at the current
 * pose; it is converted to the mesh's bind space (nearest vertex), so the hole rides on the cloth.
 */
export class ClothHole {
  constructor(mesh, o = {}) {
    this.mesh = mesh; this.o = o;
    const mat = mesh.material;
    if (!mat.userData.fxHoles) installHoles(mat);
    const H = mat.userData.fxHoles;
    this.slot = H.count++;
    if (this.slot >= MAX_HOLES) throw new Error('fx gore: more than 4 holes on one material');
    // nearest vertex (posed) -> its bind-space position
    const c = new THREE.Vector3(...arr3(o.at));
    const pos = mesh.geometry.attributes.position, v = new THREE.Vector3();
    mesh.updateWorldMatrix(true, false);
    if (mesh.isSkinnedMesh) mesh.skeleton.update();
    let best = Infinity, bi = 0;
    for (let i = 0; i < pos.count; i++) {
      if (mesh.isSkinnedMesh) mesh.getVertexPosition(i, v); else v.fromBufferAttribute(pos, i);
      v.applyMatrix4(mesh.matrixWorld);
      const d = v.distanceToSquared(c);
      if (d < best) { best = d; bi = i; }
    }
    v.fromBufferAttribute(pos, bi);
    H.u.uHoleC.value[this.slot].set(v.x, v.y, v.z, 0);
    H.u.uHoleP.value[this.slot].set({ char: 0, torn: 1, wound: 2 }[o.edge || 'char'] ?? 0, o.band ?? (o.radius ?? 0.06) * 0.6, (o.seed ?? 1) * 1.7, 0);
    this.update(o.t0 ?? 0);
  }
  update(t) {
    const o = this.o, H = this.mesh.material.userData.fxHoles;
    const t0 = o.t0 ?? 0, t1 = o.t1 ?? t0 + 0.6;
    const r = (o.radius ?? 0.06) * smoothstep(t0, t1, t) * (t >= t0 ? 1 : 0);
    H.u.uHoleC.value[this.slot].w = r;
    // the char band spreads ahead of the hole; it is there (scorch) even before it opens
    H.u.uHoleP.value[this.slot].w = smoothstep(t0 - 0.3, t0 + 0.2, t);
  }
}
function installHoles(mat) {
  const u = {
    uHoleC: { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector4(0, 0, 0, 0)) },      // bind-space centre, radius
    uHoleP: { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector4(0, 0.04, 0, 0)) },   // kind (0 char, 1 torn), band, seed, on
  };
  mat.userData.fxHoles = { u, count: 0 };
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFxHP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFxHP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vFxHP;
uniform vec4 uHoleC[${MAX_HOLES}]; uniform vec4 uHoleP[${MAX_HOLES}];
float fxhH(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float fxhN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fxhH(i), fxhH(i + vec3(1,0,0)), f.x), mix(fxhH(i + vec3(0,1,0)), fxhH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fxhH(i + vec3(0,0,1)), fxhH(i + vec3(1,0,1)), f.x), mix(fxhH(i + vec3(0,1,1)), fxhH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fxHoleBand = 0.0; float fxHoleKind = 0.0;
void fxHoles() {
  for (int i = 0; i < ${MAX_HOLES}; i++) {
    vec4 c = uHoleC[i], q = uHoleP[i];
    if (q.w <= 0.0) continue;
    float d = length(vFxHP - c.xyz);
    float n = fxhN(vFxHP * 60.0 + q.z) * 0.6 + fxhN(vFxHP * 180.0 + q.z) * 0.4;
    float rr = c.w * (0.75 + 0.5 * n);
    if (c.w > 0.0 && d < rr) discard;
    float b = (1.0 - smoothstep(rr, rr + q.y * (0.6 + 0.8 * n), d)) * q.w;
    if (b > fxHoleBand) { fxHoleBand = b; fxHoleKind = q.x; }
  }
}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfxHoles();')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
// charred: black, crisp; torn: frayed, a little darker (dirt, shadow in the fibres); wound: blood-soaked
if (fxHoleKind < 0.5) gl_FragColor.rgb *= 1.0 - 0.96 * fxHoleBand;
else if (fxHoleKind < 1.5) gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.75, fxHoleBand * 0.6);
else gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(0.9, 0.12, 0.1) + vec3(0.012, 0.0, 0.0), fxHoleBand * 0.85);`);
  };
  mat.customProgramCacheKey = function () { return (prevKey ? prevKey() : '') + '|fx-holes'; };
  mat.needsUpdate = true;
}

// ------------------------------------------------------------------ appliance effect --
/** A group of gore meshes on a bone, plus time-driven parts (flapping strips). */
class Appliance extends Effect {
  constructor(fx, o = {}) {
    super(fx, { name: o.name || 'fx-gore-appliance', ...o });
    this.velocityPose = true;
    this.root = new THREE.Group();
    this.root.name = this.object.name;
    this.strips = [];
    this.holes = [];
  }
  update(t) {
    const vis = t >= this.t0 && this.enabled;
    this.root.visible = vis;
    for (const h of this.holes) h.update(t);
    if (!vis) return;
    for (const S of this.strips) {
      const p = S.geo.attributes.position, b = S.base;
      for (let i = 0; i < p.count; i++) {
        const z = b[i * 3 + 2], k = Math.max(0, z) / S.len;     // 0 at the root .. 1 at the tip
        const w = Math.sin(t * S.f + k * 5.0 + S.ph) * k * k * S.amp + noise1(t * 7 + k * 3, S.ph) * k * S.amp * 0.6;
        p.setX(i, b[i * 3] + w * 0.6);
        p.setY(i, b[i * 3 + 1] + w);
      }
      p.needsUpdate = true;
      S.geo.computeVertexNormals();
    }
  }
}

// ------------------------------------------------------------------ presets --
function wingRoot(fx, o) {
  const c = o.creature, side = o.side || 'L';
  const A = new Appliance(fx, { name: 'fx-gore-wingroot', ...o });
  const rootName = c.detachable?.rootBone?.name || `w_${side}_0`;
  const rp = c.restPos[rootName], tp = c.restPos.thorax;
  const thorax = c.bones[c.boneIndex.thorax];
  const R = (o.radius ?? (c.anatomy.dims?.rA?.[0] ?? 0.25) * 1.15);
  // outward: from the spine toward the shoulder (rest pose), a little up
  const outRest = norm3([rp[0] - tp[0], (rp[1] - tp[1]) * 0.3, rp[2] - tp[2]]);
  // the appliance in the thorax's frame (bones carry identity rest rotations)
  const z = new THREE.Vector3(...outRest);
  const up = Math.abs(z.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(up, z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
  const holder = new THREE.Group();
  holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  holder.position.set(rp[0] - tp[0], rp[1] - tp[1], rp[2] - tp[2]);
  thorax.add(holder);
  A.root = holder;
  // sit the appliance ON the hide: cast from outside back toward the wing root (current pose)
  const body0 = c.meshes[0];
  holder.updateWorldMatrix(true, false);
  const wr = holder.getWorldPosition(new THREE.Vector3());
  const wz = new THREE.Vector3(0, 0, 1).applyQuaternion(holder.getWorldQuaternion(new THREE.Quaternion()));
  const hit = surfaceHit(body0, wr.clone().addScaledVector(wz, R * 4).toArray(), wz.clone().negate().toArray());
  if (hit) {
    // on the hide, facing out along the surface normal (oriented to the body, not the rest axes)
    let n = new THREE.Vector3(...hit.normal);
    if (n.dot(wz) < 0) n.negate();
    const p = new THREE.Vector3(...hit.point).addScaledVector(n, R * 0.04);
    thorax.remove(holder);
    attachToBone(thorax, holder, p.toArray(), n.toArray(), [0, 1, 0]);
  }
  holder.updateWorldMatrix(true, false);
  // optionally open the hide under the wound (o.cut: the body's interior shows: only for very
  // close shots where the crater rim does not cover the stump)
  if (o.cut === true && body0) A.holes.push(new ClothHole(body0, { at: holder.getWorldPosition(new THREE.Vector3()).toArray(), radius: R * 0.8, edge: 'wound', band: R * 0.35, t0: (o.t0 ?? 0) - 0.01, t1: o.t0 ?? 0, seed: o.seed ?? 3 }));
  const seed = o.seed ?? 3;
  const hideCol = o.hide || [0.06, 0.055, 0.05];
  const mus = new THREE.Mesh(tissueDomeGeometry(seed, R * 0.95, R * 0.3), tissueMaterial('muscle', { scale: R / 0.25 }));
  const shreds = new THREE.Mesh(shredGeometry(seed + 1, R * 0.9, 10), tissueMaterial('muscle', { scale: R / 0.25 }));
  const flaps = new THREE.Mesh(flapRingGeometry(seed, R * 0.95, 18), tissueMaterial('hide', { outside: hideCol, scale: R / 0.25 }));
  flaps.scale.set(1, 1, 0.6);
  holder.add(mus, shreds, flaps);
  // shattered humerus head and a coracoid splinter
  const bones = [[0.18, 0.12, [0.25, 0.1]], [0.12, 0.08, [-0.35, -0.2]], [0.08, 0.05, [0.05, -0.45]]];
  bones.forEach(([len, rad, off], k) => {
    const b = new THREE.Mesh(boneShardGeometry(seed + k * 7, R * (2.2 * len / 0.18) * 0.55, R * rad), tissueMaterial('bone', { scale: R / 0.25 }));
    b.position.set(off[0] * R, off[1] * R, R * 0.05);
    b.rotation.set((hash01(seed, k, 1) - 0.5) * 0.9, (hash01(seed, k, 2) - 0.5) * 0.9, 0);
    holder.add(b);
  });
  // tattered membrane strips hanging from the rim
  const nS = o.strips ?? 4;
  for (let k = 0; k < nS; k++) {
    const len = R * (1.2 + 1.8 * hash01(seed, k, 11)), wd = R * (0.15 + 0.2 * hash01(seed, k, 12));
    const g = new THREE.PlaneGeometry(wd, len, 2, 10);
    g.translate(0, 0, 0); g.rotateX(Math.PI / 2); g.translate(0, 0, len / 2);
    // ragged sides
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (0.6 + 0.6 * hash01(seed, k, i)) * (1 - 0.6 * (p.getZ(i) / len)));
    const strip = new THREE.Mesh(g, tissueMaterial('membrane', { outside: o.membrane || [0.11, 0.095, 0.085], scale: R / 0.25 }));
    const a = (k / nS) * Math.PI * 1.2 - 0.6 + (hash01(seed, k, 13) - 0.5) * 0.4;
    strip.position.set(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95, 0);
    // they stream back along the body (local -y ~ toward the tail when flying): lean them out
    strip.rotation.set(0.9 + 0.5 * hash01(seed, k, 14), 0, a);
    holder.add(strip);
    A.strips.push({ geo: g, base: g.attributes.position.array.slice(), len, f: 18 + 10 * hash01(seed, k, 15), ph: k * 1.7, amp: R * 0.35 });
  }
  for (const m of holder.children) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
  fx.add(A);
  // blood: coat round the wound on the hide, runs streaming back, spray off the stump
  const body = c.meshes[0];
  holder.updateWorldMatrix(true, true);
  const wp = new THREE.Vector3(), wq = new THREE.Quaternion();
  holder.getWorldPosition(wp); holder.getWorldQuaternion(wq);
  const zW = new THREE.Vector3(0, 0, 1).applyQuaternion(wq);
  const tailW = o.back ? new THREE.Vector3(...arr3(o.back)) : new THREE.Vector3(0, -1, 0);
  const at = wp.clone().addScaledVector(zW, R * 0.2);
  if (o.decals !== false && body) {
    fx.add(new DecalEffect(fx, { kind: 'coat', liquid: 'bloodDark', target: body, at: at.toArray(), dir: zW.clone().negate().toArray(), size: [R * 4, R * 4, R * 3], t0: A.t0, seed, grow: [0, 0.6], down: tailW.toArray(), params: [0, 6, 0.9, 0], maxAngle: 88 }));
  }
  if (o.bleed !== false) {
    // the spray needs the wound's position as a pure function of t (the creature's flight path):
    // o.bleedAt(t) -> [x, y, z]; without it the wound is taken where it is now (a still creature)
    const still = holder.localToWorld(new THREE.Vector3(0, 0, R * 0.3)).toArray();
    fx.blood.spray({
      at: o.bleedAt || still, dir: o.bleedDir || zW.toArray(), t0: A.t0, duration: o.bleedTime ?? 3, count: o.bleedCount ?? 900,
      speed: 3, spread: 0.7, size: 0.002, mistCount: 40, stains: false, ground: o.ground ?? true,
    });
  }
  return A;
}

/** A shard of bone through the skin + torn cloth on a limb bone (R17's open fracture). */
function openFracture(fx, o) {
  const ch = o.character, side = o.side || 'R';
  const A = new Appliance(fx, { name: 'fx-gore-fracture', ...o });
  const bone = ch.bone(o.bone || `lowerleg01.${side}`);
  const child = ch.bone(o.boneEnd || `lowerleg02.${side}`) || bone;
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  bone.getWorldPosition(a); child.getWorldPosition(b);
  const mid = a.clone().lerp(b, o.along ?? 0.55);
  // the shin's front: toward the character's facing (root +z), across the limb
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(ch.root.getWorldQuaternion(new THREE.Quaternion()));
  const axis = b.clone().sub(a).normalize();
  const out = fwd.clone().addScaledVector(axis, -fwd.dot(axis)).normalize();
  const body = ch.meshes.find((m) => /body$/.test(m.name) || m.name === 'body' || /:body/.test(m.name)) || ch.meshes[0];
  // the outermost surface along the ray: the hose / trousers if he wears them (the body under a
  // garment is often masked out), else the skin; the wound bed sits just under it
  const cloth = ch.meshes.filter((m) => /hose|trousers/.test(m.name));
  const o3 = mid.clone().addScaledVector(out, 0.3).toArray(), d3 = out.clone().negate().toArray();
  const hits = [body, ...cloth].map((m) => surfaceHit(m, o3, d3)).filter(Boolean).sort((p, q) => p.distance - q.distance);
  const hit = hits[0] || null;
  const sp = hit ? new THREE.Vector3(...hit.point).addScaledVector(out, cloth.length ? -0.012 : 0) : mid.clone().addScaledVector(out, 0.04);
  const holder = new THREE.Group();
  attachToBone(bone, holder, sp.toArray(), out.toArray(), axis.toArray());
  A.root = holder;
  const seed = o.seed ?? 5;
  // the broken tibia: an oblique, splintered end pushed out through the skin, angled down the shin
  const shard = new THREE.Mesh(boneShardGeometry(seed, 0.05, 0.012), tissueMaterial('bone', { scale: 0.05, blood: 0.8, marrow: 1, length: 1 }));
  shard.rotation.set(-0.9, 0.2, 0); shard.position.set(0, 0.006, -0.012);
  const holeR = o.tear ?? 0.05;
  // the bed under the torn hose: torn flesh around the bone, bloodied skin out to the rim
  const bed = new THREE.Mesh(tissueDomeGeometry(seed, holeR * 1.1, holeR * 0.2), tissueMaterial('wound', { scale: holeR * 1.1, outside: o.skin || [0.36, 0.24, 0.18] }));
  bed.scale.set(0.9, 1.2, 1); bed.position.z = -0.004;
  const shreds = new THREE.Mesh(shredGeometry(seed + 2, 0.022, 5), tissueMaterial('muscle', { scale: 0.1 }));
  holder.add(bed, shreds, shard);
  for (const m of holder.children) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
  // torn hose / trouser over it, soaked
  for (const m of cloth) A.holes.push(new ClothHole(m, { at: sp.toArray(), radius: o.tear ?? 0.05, edge: 'wound', band: (o.tear ?? 0.05) * 0.9, t0: A.t0 - 0.01, t1: A.t0, seed }));
  if (o.decals !== false) {
    for (const m of cloth) fx.add(new DecalEffect(fx, { kind: 'soak', liquid: 'bloodDark', target: m, at: sp.toArray(), dir: out.clone().negate().toArray(), up: axis.toArray(), size: [0.24, 0.34, 0.25], t0: A.t0, grow: [0, o.soakTau ?? 6], src: [0, -0.05], amount: 0.95, seed: seed + 1 }));
    fx.add(new DecalEffect(fx, { kind: 'coat', liquid: 'bloodDark', target: body, at: sp.toArray(), dir: out.clone().negate().toArray(), up: axis.toArray(), size: [0.12, 0.16, 0.15], t0: A.t0, seed: seed + 2, params: [0, 4, 0.8, 0], grow: [0, 6] }));
  }
  fx.add(A);
  return A;
}

/** A split scalp with blood sheeting down one side of the face into the collar (R17). */
function scalp(fx, o) {
  const ch = o.character, side = o.side || 'R';
  const head = ch.bone('head');
  const hp = new THREE.Vector3(); head.getWorldPosition(hp);
  const q = ch.root.getWorldQuaternion(new THREE.Quaternion());
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q), right = new THREE.Vector3(side === 'R' ? -1 : 1, 0, 0).applyQuaternion(q);
  const up = new THREE.Vector3(0, 1, 0);
  const body = ch.meshes.find((m) => /body/.test(m.name)) || ch.meshes[0];
  const hair = ch.meshes.filter((m) => /hair|brow/.test(m.name));
  const t0 = o.t0 ?? 0, seed = o.seed ?? 4;
  const onSkin = (p, d) => { const h = surfaceHit(body, p.clone().addScaledVector(d, -0.2).toArray(), d.toArray()); return h ? h.point : p.toArray(); };
  // the split: at the hairline above the outer end of the brow, the scalp opened along it
  const aim = hp.clone().addScaledVector(fwd, 0.075).addScaledVector(right, 0.05).addScaledVector(up, 0.105);
  const dirIn = fwd.clone().multiplyScalar(-0.75).addScaledVector(right, -0.35).addScaledVector(up, -0.55).normalize();
  const out = [];
  out.push(fx.add(new DecalEffect(fx, { kind: 'gash', liquid: 'bloodDark', target: [body, ...hair], at: onSkin(aim, dirIn), dir: dirIn.toArray(), up: right.toArray(), size: [0.075, 0.06, 0.12], t0, seed, params: [0, 4, 0.6, 0], maxAngle: 89 })));
  // scalp wounds bleed in sheets: down the side of the forehead and the temple, past the outer
  // corner of the eye, over the cheekbone to the jaw (projected from the front-side of the face)
  const dirF = fwd.clone().multiplyScalar(-0.8).addScaledVector(right, -0.6).normalize();
  const sheetC = hp.clone().addScaledVector(fwd, 0.07).addScaledVector(right, 0.065).addScaledVector(up, 0.02);
  out.push(fx.add(new DecalEffect(fx, { kind: 'coat', liquid: 'bloodDark', target: [body, ...hair], at: onSkin(sheetC, dirF), dir: dirF.toArray(), up: [0, 1, 0], size: [0.13, 0.27, 0.3], t0: t0 + 0.2, grow: [0, 5], seed: seed + 1, params: [0, 6, 0.55, 0], amount: o.amount ?? 0.6, maxAngle: 88 })));
  // a stream straight down from the split over the temple
  out.push(fx.add(new DecalEffect(fx, { kind: 'run', liquid: 'bloodDark', target: [body, ...hair], at: onSkin(aim.clone().addScaledVector(up, -0.06), dirF), dir: dirF.toArray(), up: [0, 1, 0], size: [0.07, 0.22, 0.3], t0: t0 + 0.1, grow: [0, 4], seed: seed + 5, params: [0, 4, 0, 0], amount: 0.8, maxAngle: 88 })));
  // rivulets off the jaw down the neck into the collar
  const jawC = hp.clone().addScaledVector(fwd, 0.05).addScaledVector(right, 0.06).addScaledVector(up, -0.1);
  out.push(fx.add(new DecalEffect(fx, { kind: 'run', liquid: 'bloodDark', target: [body, ...ch.meshes.filter((m) => /shirt|tunic|coat|collar/.test(m.name))], at: onSkin(jawC, dirF), dir: dirF.toArray(), up: [0, 1, 0], size: [0.1, 0.3, 0.3], t0: t0 + 0.4, grow: [0, 7], seed: seed + 2, params: [0, 6, 0, 0], amount: 0.7, maxAngle: 88 })));
  // hair over the wound matted dark with it
  out.push(fx.add(new DecalEffect(fx, { kind: 'soak', liquid: 'bloodDark', target: hair.length ? hair : [body], at: aim.toArray(), dir: dirIn.toArray(), size: [0.09, 0.09, 0.15], t0, seed: seed + 3, amount: 0.8, maxAngle: 89 })));
  return out;
}

/** 1F-14b: the rider after the flames - burns on the forearm and the neck, sleeve burned away. */
function burnedRider(fx, o) {
  const ch = o.character, side = o.side || 'R';
  const body = ch.meshes.find((m) => /body/.test(m.name)) || ch.meshes[0];
  const out = [];
  const w = new THREE.Vector3(), e = new THREE.Vector3();
  ch.bone(`lowerarm02.${side}`).getWorldPosition(w); ch.bone(`lowerarm01.${side}`).getWorldPosition(e);
  const mid = w.clone().lerp(e, 0.5);
  const up = new THREE.Vector3(0, 1, 0);
  const axis = w.clone().sub(e).normalize();
  const outv = up.clone().addScaledVector(axis, -up.dot(axis)).normalize();
  // the sleeve burns away over the forearm (coat + shirt), charred edges
  // every garment layer over the forearm burns through (coat, shirt, wraps, gloves...)
  const ANAT = /body|eyes|brows|lashes|teeth|tongue|caruncle|hair|reins|buckle|belt/;
  const pr = 0.3, o3 = mid.clone().addScaledVector(outv, pr).toArray(), d3 = outv.clone().negate().toArray();
  const layers = ch.meshes.filter((mm) => !ANAT.test(mm.name.split(':').pop()) && surfaceHit(mm, o3, d3));
  for (const m of layers) {
    out.push(new ClothHole(m, { at: mid.toArray(), radius: o.sleeve ?? 0.09, edge: 'char', band: o.charBand ?? 0.05, t0: o.t0 ?? 0, t1: (o.t0 ?? 0) + (o.burnTime ?? 1.2), seed: 3 }));
  }
  // the forearm under the burned-away sleeve: the innermost sleeve's own shape pulled in a few mm
  // (the build deletes the skin that garments cover), burned
  // the innermost layer is the one the ray from outside meets last
  const inner = layers.map((m) => [m, surfaceHit(m, o3, d3).distance]).sort((a, b) => b[1] - a[1])[0]?.[0];
  const arm = inner ? shellPatch(inner, mid.toArray(), (o.sleeve ?? 0.09) * 1.5, o.inset ?? 0.006, tissueMaterial('burnskin', { outside: o.skin || [0.36, 0.25, 0.19], radius: (o.sleeve ?? 0.09) * 1.1 })) : null;
  const holder = new THREE.Group();
  if (arm) holder.userData.patch = arm;
  out.push(fx.add(new DecalEffect(fx, { kind: 'burn', target: body, at: mid.clone().addScaledVector(outv, 0.05).toArray(), dir: outv.clone().negate().toArray(), up: axis.toArray(), size: [0.12, 0.2, 0.2], t0: (o.t0 ?? 0) + 0.3, amount: 0.95, seed: 9, maxAngle: 89 })));
  // the side of the neck
  const nk = new THREE.Vector3(); ch.bone('neck02').getWorldPosition(nk);
  const q = ch.root.getWorldQuaternion(new THREE.Quaternion());
  const sideV = new THREE.Vector3(side === 'R' ? -1 : 1, 0, 0).applyQuaternion(q);
  out.push(fx.add(new DecalEffect(fx, { kind: 'burn', target: body, at: nk.clone().addScaledVector(sideV, 0.06).toArray(), dir: sideV.clone().negate().toArray(), size: [0.1, 0.12, 0.15], t0: (o.t0 ?? 0) + 0.3, amount: 0.85, seed: 11, maxAngle: 89 })));
  // holes need update(t): wrap them into an effect
  const holes = out.filter((x) => x instanceof ClothHole);
  const E = new Appliance(fx, { name: 'fx-gore-burnedrider', t0: o.t0 ?? 0 });
  E.holes = holes;
  if (arm) { E.root = arm; E.casters.push(arm); }
  fx.add(E);
  return E;
}

export function goreApi(fx) {
  return {
    wingRoot: (o) => wingRoot(fx, o),
    openFracture: (o) => openFracture(fx, o),
    scalp: (o) => scalp(fx, o),
    burnedRider: (o) => burnedRider(fx, o),
    hole: (o) => { const h = new ClothHole(o.mesh, o); const E = new Appliance(fx, { t0: o.t0 ?? 0 }); E.holes = [h]; fx.add(E); return E; },
    burn: (o) => fx.add(new DecalEffect(fx, { kind: 'burn', ...o })),
    gash: (o) => fx.add(new DecalEffect(fx, { kind: 'gash', liquid: 'bloodDark', ...o })),
    char: (o) => fx.add(new DecalEffect(fx, { kind: 'char', ...o })),
    appliance: (bone, mesh, worldPos, worldDir, up) => attachToBone(bone, mesh, worldPos, worldDir, up),
    tissueMaterial, boneShardGeometry,
  };
}
