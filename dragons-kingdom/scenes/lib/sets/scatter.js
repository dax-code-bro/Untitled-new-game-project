// Scattered vegetation and rocks for sets (instanced; deterministic).
//
//   const bushes = scatter(ctx, { geometry: bushGeometry(), material: bushMaterial(),
//     count: 4000, place: (rng) => [x, y, z, scale] | null });
//
// Real coastal land seen from a few hundred metres is not a flat texture:
// gorse, heather and bramble clumps throw small shadows and break the
// silhouette of every ridge. These helpers make clumps from noise-displaced
// icospheres (no textures needed at that distance) and boulders from
// noise-displaced, flattened icospheres with the world-space rock material.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLSL_NOISE } from './materials.js';

function hash3(x, y, z) { let h = Math.imul(Math.floor(x * 73.1) | 0, 374761393) ^ Math.imul(Math.floor(y * 51.7) | 0, 668265263) ^ Math.imul(Math.floor(z * 91.3) | 0, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const s = (t) => t * t * (3 - 2 * t), u = s(fx), v = s(fy), w = s(fz);
  let r = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    r += (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w) * hash3(ix + dx, iy + dy, iz + dz);
  }
  return r;
}

/** A lumpy clump (bush / tussock), unit size, base at y = 0. */
export function bushGeometry(detail = 3, seed = 1, flat = 0.75) {
  let g = new THREE.IcosahedronGeometry(0.5, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = vnoise(x * 3 + seed, y * 3, z * 3) * 0.6 + vnoise(x * 9, y * 9 + seed, z * 9) * 0.3 + vnoise(x * 22, y * 22, z * 22 + seed) * 0.15;
    const k = 0.55 + n * 0.9;
    p.setXYZ(i, x * k, Math.max(-0.05, y * k * flat + 0.32), z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A boulder, unit size, sitting on y = 0 (slightly sunk). */
export function rockGeometry(detail = 4, seed = 1, flat = 0.6) {
  let g = new THREE.IcosahedronGeometry(0.5, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let n = vnoise(x * 2 + seed, y * 2, z * 2) * 0.7 + vnoise(x * 6, y * 6 + seed, z * 6) * 0.25 + vnoise(x * 15, y * 15, z * 15 + seed) * 0.08;
    // a few flat fracture planes
    const k = 0.62 + n * 0.75;
    let X = x * k, Y = y * k * flat, Z = z * k;
    const cut = 0.33 + 0.1 * hash3(seed, 1, 2);
    if (X > cut) X = cut + (X - cut) * 0.25;
    if (Z < -cut) Z = -cut + (Z + cut) * 0.3;
    p.setXYZ(i, X, Y + 0.18, Z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Foliage material: dark, rough, with per-instance colour (instanceColor),
 * world-space noise shading (leaf clumps) and a wrap term for light passing
 * through the leaves' edges.
 */
export function foliageMaterial(opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...(opts.color || [0.05, 0.075, 0.03])), roughness: 0.92, metalness: 0 });
  const U = { dkLeafScale: { value: opts.leafScale ?? 6.0 }, dkFlower: { value: new THREE.Vector4(...(opts.flower || [0, 0, 0, 0])) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{ vec4 w = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  w = instanceMatrix * w;
#endif
  vFW = (modelMatrix * w).xyz; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vFW; uniform float dkLeafScale; uniform vec4 dkFlower;
${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float n1 = dkVN3(vFW * dkLeafScale), n2 = dkVN3(vFW * dkLeafScale * 3.1 + 7.0);
  float leaf = n1 * 0.6 + n2 * 0.4;
  diffuseColor.rgb *= 0.55 + 0.9 * leaf;
  // sparse blossom (gorse yellow / heather purple) on the sunny tops
  float fl = smoothstep(0.78, 0.9, dkVN3(vFW * dkLeafScale * 2.0 + 3.0)) * dkFlower.w;
  diffuseColor.rgb = mix(diffuseColor.rgb, dkFlower.rgb, fl);
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float e = 0.05;
  float h0 = dkVN3(vFW * dkLeafScale * 2.0);
  vec3 dpx = dFdx(vFW), dpy = dFdy(vFW);
  float hx = dFdx(h0), hy = dFdy(h0);
  vec3 g = (cross(dpy, normal) * hx + cross(normal, dpx) * hy) * 0.0;
  normal = normalize(normal + 0.35 * vec3(dkVN3(vFW * dkLeafScale * 4.0) - 0.5, 0.0, dkVN3(vFW * dkLeafScale * 4.0 + 5.0) - 0.5));
}`);
  };
  mat.customProgramCacheKey = () => 'dk-foliage';
  return mat;
}

/**
 * Instanced scatter. place(rng, i) -> null | { p: [x,y,z], s: scale (number or [sx,sy,sz]), r: yaw, tilt?: [x,z], c?: [r,g,b] }.
 * Returns the InstancedMesh (count = accepted placements).
 */
export function scatter(geometry, material, count, place, seed = 1) {
  let a = seed >>> 0;
  const rng = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const mats = [], cols = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
  for (let i = 0; i < count * 6 && mats.length < count; i++) {
    const r = place(rng, i);
    if (!r) continue;
    e.set(r.tilt ? r.tilt[0] : 0, r.r ?? rng() * Math.PI * 2, r.tilt ? r.tilt[1] : 0, 'YXZ');
    q.setFromEuler(e);
    const s = Array.isArray(r.s) ? r.s : [r.s, r.s, r.s];
    m.compose(pv.set(...r.p), q, sc.set(...s));
    mats.push(m.clone());
    cols.push(r.c || [1, 1, 1]);
  }
  const mesh = new THREE.InstancedMesh(geometry, material, mats.length);
  mats.forEach((mm, i) => mesh.setMatrixAt(i, mm));
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cols.flat()), 3);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}
