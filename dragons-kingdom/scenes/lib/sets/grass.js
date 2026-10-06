// Instanced grass tufts for the foreground of field sets.
//
//   scene.add(grassField(ctx, { count: 20000, place: (rng) => [x, y, z] | null, height: [0.12, 0.35] }));
//
// Each tuft is a handful of tapered, curved blades (real geometry, no alpha
// cards: alpha-tested cards alias badly on a CPU rasteriser and cost more).
// Blades are lit like thin leaves: the normal is bent toward the sky (soft,
// lawn-like shading instead of flickering per-blade facets) and sunlight that
// passes through a blade toward the camera gives the bright rim real
// backlit grass has (shadowed by the sun's shadow map like any other light).
import * as THREE from 'three';
import { GLSL_NOISE } from './materials.js';

function tuftGeometry(blades = 7, seed = 1) {
  let a = seed >>> 0;
  const rnd = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
  const pos = [], nrm = [], tip = [], idx = [];
  const SEG = 3;
  for (let b = 0; b < blades; b++) {
    const ang = rnd() * Math.PI * 2, lean = 0.15 + rnd() * 0.45, h = 0.55 + rnd() * 0.45, w = 0.012 + rnd() * 0.01;
    const ox = (rnd() - 0.5) * 0.12, oz = (rnd() - 0.5) * 0.12;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const sx = -dz, sz = dx;                        // blade width direction
    const base = pos.length / 3;
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      const bend = lean * t * t;
      const y = h * t * (1 - 0.25 * lean * t);
      const cx = ox + dx * bend * h, cz = oz + dz * bend * h;
      const ww = w * (1 - t * 0.92);
      for (const side of [-1, 1]) {
        pos.push(cx + sx * ww * side, y, cz + sz * ww * side);
        nrm.push(dx * 0.35, 1, dz * 0.35);
        tip.push(t);
      }
    }
    for (let s = 0; s < SEG; s++) {
      const i0 = base + s * 2;
      idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
  g.setIndex(idx);
  g.normalizeNormals?.();
  return g;
}

export function grassMaterial(opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...(opts.color || [0.11, 0.15, 0.045])), roughness: 0.95, metalness: 0, side: THREE.DoubleSide, envMapIntensity: opts.envMapIntensity ?? 0.35 });
  const U = { dkTrans: { value: new THREE.Color(...(opts.translucency || [0.35, 0.45, 0.08])) }, dkDry: { value: new THREE.Color(...(opts.dry || [0.3, 0.26, 0.12])) }, dkDryAmt: { value: opts.dryAmount ?? 0.35 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aTip; varying float vTip; varying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTip = aTip;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{ vec4 w = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  w = instanceMatrix * w;
#endif
  vGW = (modelMatrix * w).xyz; }`);
    let fs = sh.fragmentShader.replace('#include <common>', `#include <common>
varying float vTip; varying vec3 vGW; uniform vec3 dkTrans; uniform vec3 dkDry; uniform float dkDryAmt;
${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float patchN = dkVN2(vGW.xz * 0.35) * 0.6 + dkVN2(vGW.xz * 1.7) * 0.4;
  vec3 c = mix(diffuseColor.rgb, dkDry, smoothstep(0.45, 0.85, patchN) * dkDryAmt + vTip * vTip * 0.35 * dkDryAmt);
  diffuseColor.rgb = c * (0.45 + 0.75 * vTip);        // darker toward the base (self-shadowing in the sward)
}`);
    // backlit blades: sunlight transmitted toward the camera (same shadowed light loop as three's)
    const chunk = THREE.ShaderChunk.lights_fragment_begin;
    const a0 = chunk.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
    const b0 = a0 >= 0 ? chunk.indexOf('#endif', chunk.indexOf('#pragma unroll_loop_end', a0)) : -1;
    if (a0 >= 0 && b0 > a0) {
      let block = chunk.slice(a0, b0 + '#endif'.length);
      block = block.replace(/RE_Direct\(\s*directLight[^;]*;/, 'reflectedLight.directDiffuse += directLight.color * dkTrans * diffuseColor.rgb * 2.5 * pow(saturate(dot(-geometryViewDir, directLight.direction)), 3.0) * (0.3 + vTip) * RECIPROCAL_PI;');
      fs = fs.replace('#include <lights_fragment_begin>', '#include <lights_fragment_begin>\n{\n' + block + '\n}\n');
    }
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'dk-grass';
  return mat;
}

/**
 * opts: count, place(rng, i) -> [x, y, z] | null, height [min, max] (m), width scale, seed,
 * tufts (number of distinct tuft shapes, default 4), material.
 * Returns a Group of InstancedMeshes.
 */
export function grassField(opts) {
  const group = new THREE.Group();
  group.name = 'grass';
  const mat = opts.material || grassMaterial(opts);
  const shapes = opts.tufts ?? 4;
  let a = (opts.seed ?? 1) >>> 0;
  const rng = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
  const lists = Array.from({ length: shapes }, () => []);
  const [h0, h1] = opts.height || [0.12, 0.35];
  for (let i = 0, n = 0; i < opts.count * 4 && n < opts.count; i++) {
    const p = opts.place(rng, i);
    if (!p) continue;
    const h = h0 + (h1 - h0) * Math.pow(rng(), 1.5);
    const w = (opts.width ?? 1) * (0.8 + rng() * 0.6);
    lists[n % shapes].push([p, h, w, rng() * Math.PI * 2, 0.85 + rng() * 0.3]);
    n++;
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  lists.forEach((list, k) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(tuftGeometry(opts.blades ?? 7, 11 + k * 7), mat, list.length);
    const col = new Float32Array(list.length * 3);
    list.forEach(([p, h, w, r, c], i) => {
      q.setFromAxisAngle(up, r);
      m.compose(v.set(p[0], p[1], p[2]), q, s.set(w, h, w));
      mesh.setMatrixAt(i, m);
      col[i * 3] = c; col[i * 3 + 1] = c * (0.95 + 0.1 * ((i * 7919) % 13) / 13); col[i * 3 + 2] = c;
    });
    mesh.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  });
  return group;
}
