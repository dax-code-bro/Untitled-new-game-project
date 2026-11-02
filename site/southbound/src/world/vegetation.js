// Vegetation: real trees and bushes generated with ez-tree (MIT) and baked
// offline (tools/southbound/bake-vegetation.mjs), drawn as full 3D models
// near the camera and as camera-facing impostor sprites in the distance.
// Ground cover: photo-textured grass clumps around the player and scanned rocks.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WORLD, CITY, coastZ } from './layout.js';
import { forestMask, plainsMask, bayouMask } from './heightmap.js';
import { worldUniforms } from './terrain.js';
import { mulberry32 } from '../util.js';
import { fogParams, FOG_GLSL } from './atmosphere.js';

const BASE = 'assets/veg/';

// real-world heights (m) each baked variant is scaled to
const HEIGHT = {
  pine_a: [19, 27], pine_b: [18, 25], pine_c: [11, 17], oak_a: [13, 18], oak_b: [9, 13],
  ash_a: [12, 17], ash_b: [8, 12], bush_a: [1.4, 2.4], bush_c: [1.1, 2.0],
};
const TRUNK = { pine: 0.35, oak: 0.45, ash: 0.35, bush: 0 };

const QUALITY = {
  Phone: { near: 32, cap: 50, grass: 0, grassR: 0, rocks: 300 },
  Low: { near: 45, cap: 80, grass: 0, grassR: 0, rocks: 500 },
  Medium: { near: 60, cap: 150, grass: 6000, grassR: 26, rocks: 900 },
  High: { near: 85, cap: 280, grass: 16000, grassR: 38, rocks: 1500 },
  Ultra: { near: 120, cap: 520, grass: 32000, grassR: 52, rocks: 2400 },
};

// Quantized glTF keeps a dequantizing scale/offset on the node: bake it into the geometry.
function bakedGeometry(obj) {
  obj.updateWorldMatrix(true, false);
  const g = obj.geometry.clone();
  for (const k of Object.keys(g.attributes)) {
    const a = g.attributes[k];
    if (a.normalized || !(a.array instanceof Float32Array)) {
      const f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c);
      g.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize));
    }
  }
  g.applyMatrix4(obj.matrixWorld);
  g.computeBoundingSphere();
  return g;
}

export const grassUniforms = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uAmbient: { value: new THREE.Color(0.4, 0.45, 0.5) },
  uFogColor: { value: new THREE.Color() },
  uFogDensity: { value: 0.0002 },
};

function texture(loader, url, srgb) {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Leaves/branch tips sway; trunks stay put (sway grows with height and distance from the trunk)
function addWind(mat, strength) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 ip = instanceMatrix[3].xyz;
  float ph = ip.x * 0.05 + ip.z * 0.07;
  float h = max(position.y, 0.0);
  float reach = length(position.xz);
  float sway = (h * 0.004 + reach * 0.01) * ${strength.toFixed(3)};
  float gust = 0.6 + 0.4 * sin(uTime * 0.31 + ip.x * 0.003);
  transformed.x += sin(uTime * 1.6 + ph + h * 0.05) * sway * gust;
  transformed.z += cos(uTime * 1.25 + ph * 1.3) * sway * 0.7 * gust;
  transformed.y += sin(uTime * 2.7 + ph + reach) * sway * 0.25;
}`);
  };
  mat.customProgramCacheKey = () => 'sbwind-' + strength;
}

export async function createVegetation(hm, quality, scene, collision, cityBlocks, progress = () => {}) {
  const Q = QUALITY[quality.label] || QUALITY.Medium;
  const gltf = new GLTFLoader();
  const tl = new THREE.TextureLoader();
  const manifest = await (await fetch(BASE + 'manifest.json')).json();

  // ---- shared materials (one per bark type / leaf type)
  const barkMats = {}, leafMats = {};
  const barkMat = (type, tint) => {
    const k = `${type}:${tint}`;
    if (!barkMats[k]) {
      barkMats[k] = new THREE.MeshStandardMaterial({
        map: texture(tl, `${BASE}bark_${type}_color.jpg`, true),
        normalMap: texture(tl, `${BASE}bark_${type}_normal.jpg`),
        roughnessMap: texture(tl, `${BASE}bark_${type}_roughness.jpg`),
        color: new THREE.Color(tint), roughness: 1, metalness: 0,
      });
      addWind(barkMats[k], 0.35);
    }
    return barkMats[k];
  };
  const leafMat = (type, tint) => {
    const k = `${type}:${tint}`;
    if (!leafMats[k]) {
      leafMats[k] = new THREE.MeshStandardMaterial({
        map: texture(tl, `${BASE}leaf_${type}.png`, true), color: new THREE.Color(tint),
        alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, metalness: 0,
      });
      addWind(leafMats[k], 1.0);
    }
    return leafMats[k];
  };

  // ---- load every variant
  const variants = [];
  let n = 0;
  await Promise.all(manifest.trees.map(async (t) => {
    const g = await gltf.loadAsync(`${BASE}${t.id}.glb`);
    const bark = g.scene.getObjectByName('bark'), leaves = g.scene.getObjectByName('leaves');
    const v = { ...t, bark: bakedGeometry(bark), leaves: bakedGeometry(leaves), barkType: t.bark, leafType: t.leaf };
    v.barkMat = barkMat(t.bark, t.barkTint ?? 0xffffff);
    v.leafMat = leafMat(t.leaf, t.leafTint ?? 0xffffff);
    v.imp = texture(tl, `${BASE}${t.id}_impostor.png`, true);
    v.imp.wrapS = v.imp.wrapT = THREE.ClampToEdgeWrapping;
    variants.push(v);
    progress(++n / manifest.trees.length);
  }));
  variants.sort((a, b) => a.id.localeCompare(b.id));
  const byId = Object.fromEntries(variants.map((v, i) => [v.id, i]));

  // ---- placement (same ecology as before: forests, plains clumps, bayou, coast, parks)
  const rnd = mulberry32(99);
  const inst = []; // {v, x, y, z, rot, k}
  const nrm = new THREE.Vector3();
  const blocked = (x, z, r) => {
    let hit = false;
    collision.query(x, z, r, (it) => { if (it.t === 0 && x > it.minX - r && x < it.maxX + r && z > it.minZ - r && z < it.maxZ + r) hit = true; });
    return hit;
  };
  const place = (id, x, z, trunk = true) => {
    const y = hm.height(x, z);
    if (y < hm.waterLevel(x, z) + 0.4) return false;
    if (blocked(x, z, id.startsWith('bush') ? 1 : 2.5)) return false;
    const v = variants[byId[id]];
    const [h0, h1] = HEIGHT[id];
    const k = (h0 + rnd() * (h1 - h0)) / v.height;
    inst.push({ v: byId[id], x, y: y - 0.15, z, rot: rnd() * Math.PI * 2, k });
    const fam = id.split('_')[0];
    if (trunk && TRUNK[fam]) collision.addCircle(x, z, TRUNK[fam]);
    return true;
  };
  const pick = (list) => list[(rnd() * list.length) | 0];
  const target = quality.treeCount;
  let tries = 0;
  while (inst.length < target && tries < target * 8) {
    tries++;
    const x = (rnd() * 2 - 1) * (WORLD.half - 10), z = (rnd() * 2 - 1) * (WORLD.half - 10);
    if (hm.splatAt(x, z, 3) > 0.15) continue;
    hm.normal(x, z, nrm);
    if (nrm.y < 0.8) continue;
    const y = hm.height(x, z);
    const f = forestMask(x, z), pl = plainsMask(x, z), b = bayouMask(x, z);
    const dCoast = coastZ(x) - z;
    let prob = 0.025 + f * 0.95 + b * 0.35 - pl * 0.02;
    if (y > 200) prob *= 0.3;
    if (rnd() > prob) continue;
    let id;
    if (b > 0.4) id = rnd() < 0.6 ? pick(['oak_b', 'ash_b']) : pick(['bush_a', 'bush_c']);
    else if (dCoast < 160 && dCoast > 0) id = rnd() < 0.7 ? pick(['bush_a', 'bush_c']) : 'oak_b';
    else if (f > 0.5) id = rnd() < 0.72 ? pick(['pine_a', 'pine_b', 'pine_c']) : rnd() < 0.5 ? pick(['ash_a', 'oak_a']) : pick(['bush_a', 'bush_c']);
    else id = rnd() < 0.45 ? pick(['oak_a', 'oak_b', 'ash_a', 'ash_b']) : rnd() < 0.6 ? pick(['bush_a', 'bush_c']) : pick(['pine_c', 'oak_b']);
    place(id, x, z);
  }
  for (const bl of cityBlocks) {
    if (bl.type !== 'park') continue;
    for (let k = 0; k < 22; k++) place(pick(['oak_a', 'oak_b', 'ash_a', 'ash_b']), bl.cx + (rnd() - 0.5) * 64, bl.cz + (rnd() - 0.5) * 64);
    for (let k = 0; k < 14; k++) place(pick(['bush_a', 'bush_c']), bl.cx + (rnd() - 0.5) * 66, bl.cz + (rnd() - 0.5) * 66, false);
  }
  for (let i = 0; i <= CITY.nx; i++) {
    const x = CITY.x0 + i * CITY.pitch + CITY.street / 2 + 1.5;
    for (let z = CITY.z0 + 14; z < CITY.z0 + CITY.nz * CITY.pitch; z += 18) {
      const m = (z - CITY.z0) % CITY.pitch;
      if (m < 14 || m > CITY.pitch - 14) continue;
      place('ash_b', x, z);
    }
  }

  // ---- spatial grid for picking the near set quickly
  const CELL = 48;
  const grid = new Map();
  inst.forEach((t, i) => {
    const key = `${Math.floor(t.x / CELL)},${Math.floor(t.z / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  });

  // ---- near: full 3D trees, refreshed a few times per second
  const nearBark = [], nearLeaves = [];
  for (const v of variants) {
    const cap = v.id.startsWith('bush') ? Q.cap * 2 : Q.cap;
    const b = new THREE.InstancedMesh(v.bark, v.barkMat, cap);
    const l = new THREE.InstancedMesh(v.leaves, v.leafMat, cap);
    for (const m of [b, l]) { m.count = 0; m.frustumCulled = false; m.castShadow = quality.shadows > 0; m.receiveShadow = true; scene.add(m); }
    nearBark.push(b); nearLeaves.push(l);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  // ---- far: camera-facing impostors (all instances; hidden inside the near radius in the shader)
  const impMeshes = variants.map((v, vi) => {
    const list = inst.filter((t) => t.v === vi);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const data = new Float32Array(list.length * 4);
    list.forEach((t, i) => data.set([t.x, t.y, t.z, t.k], i * 4));
    geo.setAttribute('aInst', new THREE.InstancedBufferAttribute(data, 4));
    geo.instanceCount = list.length;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...grassUniforms, tImp: { value: v.imp }, uNear: { value: Q.near },
        uSize: { value: new THREE.Vector3(v.half * 2, v.half * 4, v.top - v.half * 4) },
        sbFogA: { value: fogParams.a }, sbFogB: { value: fogParams.b },
      },
      vertexShader: /* glsl */`
        attribute vec4 aInst; uniform vec3 uSize; uniform float uNear;
        varying vec2 vUv; varying vec3 vW; varying float vFade;
        void main() {
          vec3 base = aInst.xyz; float k = aInst.w;
          vec3 toCam = cameraPosition - base; toCam.y = 0.0;
          float d = length(toCam);
          vFade = smoothstep(uNear * 0.9, uNear * 1.05, d);
          vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x));
          vec3 w = base + right * position.x * uSize.x * k + vec3(0.0, uSize.z * k + position.y * uSize.y * k, 0.0);
          vUv = uv; vW = w;
          gl_Position = vFade < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tImp; uniform vec3 uSunColor; uniform vec3 uAmbient; uniform vec3 uFogColor; uniform float uFogDensity; uniform vec3 uSunDir;
        uniform vec4 sbFogA; uniform vec4 sbFogB;
        varying vec2 vUv; varying vec3 vW; varying float vFade;
        ${FOG_GLSL}
        void main() {
          vec4 c = texture2D(tImp, vUv);
          // dithered fade into the 3D tree (no hard pop)
          float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          if (c.a < 0.5 || vFade < dither) discard;
          vec3 lit = c.rgb * (uAmbient * 1.6 + uSunColor * 1.4 * (0.45 + 0.55 * max(uSunDir.y, 0.0)));
          gl_FragColor = vec4(sbApplyFog(lit, vW, cameraPosition, uFogColor, uFogDensity, sbFogA, sbFogB), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  });

  // ---- rocks (scanned, from the ez-tree demo assets)
  const rockMeshes = [];
  try {
    const rocks = await Promise.all(['rock1', 'rock2', 'rock3'].map((r) => gltf.loadAsync(`${BASE}${r}.glb`)));
    const spots = [[], [], []];
    let t2 = 0;
    while (spots.flat().length < Q.rocks && t2++ < Q.rocks * 30) {
      const x = (rnd() * 2 - 1) * (WORLD.half - 20), z = (rnd() * 2 - 1) * (WORLD.half - 20);
      if (hm.splatAt(x, z, 3) > 0.1) continue;
      hm.normal(x, z, nrm);
      const slope = 1 - nrm.y, f = forestMask(x, z);
      const nearWater = hm.height(x, z) < hm.waterLevel(x, z) + 2.5 && hm.waterLevel(x, z) > 0.5;
      const prob = slope * 2.2 + f * 0.25 + (nearWater ? 0.4 : 0) + 0.01;
      if (rnd() > prob) continue;
      if (blocked(x, z, 2)) continue;
      const k = 0.3 + Math.pow(rnd(), 2.5) * (slope > 0.25 ? 2.6 : 1.2);
      spots[(rnd() * 3) | 0].push({ x, y: hm.height(x, z) - 0.25 * k, z, k, r: rnd() * 6.28, tilt: (rnd() - 0.5) * 0.4 });
      if (k > 0.8) collision.addCircle(x, z, k * 0.8);
    }
    rocks.forEach((g, i) => {
      const src = []; g.scene.traverse((o) => { if (o.isMesh) src.push(o); });
      // normalise each rock to ~1 m across so `k` is its size in metres
      const geos = src.map((o) => bakedGeometry(o));
      const rb = new THREE.Box3(); geos.forEach((g) => { g.computeBoundingBox(); rb.union(g.boundingBox); });
      const rs = 1 / Math.max(1e-3, rb.max.x - rb.min.x, rb.max.z - rb.min.z);
      geos.forEach((g) => g.scale(rs, rs, rs));
      for (const [gi, o] of src.entries()) {
        const im = new THREE.InstancedMesh(geos[gi], o.material, spots[i].length);
        const e = new THREE.Euler();
        spots[i].forEach((r, j) => {
          e.set(r.tilt, r.r, r.tilt * 0.5);
          m4.compose(p.set(r.x, r.y, r.z), q.setFromEuler(e), s.set(r.k, r.k, r.k));
          im.setMatrixAt(j, m4);
        });
        im.castShadow = quality.shadows >= 2; im.receiveShadow = true;
        im.computeBoundingSphere();
        im.userData.noReflect = true; scene.add(im); rockMeshes.push(im);
      }
    });
  } catch (e) { console.warn('rocks unavailable', e); }

  // ---- grass clumps (three crossed photo cards) around the camera
  const grass = Q.grass > 0 ? await createGrassField(gltf, Q, scene).catch((e) => { console.warn('grass unavailable', e); return null; }) : null;

  let refreshT = 0;
  const camPrev = new THREE.Vector3(1e9, 0, 0);
  function refreshNear(cam) {
    const counts = variants.map(() => 0);
    const r = Q.near, c0x = Math.floor((cam.x - r) / CELL), c1x = Math.floor((cam.x + r) / CELL);
    const c0z = Math.floor((cam.z - r) / CELL), c1z = Math.floor((cam.z + r) / CELL);
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
      const cell = grid.get(`${cx},${cz}`);
      if (!cell) continue;
      for (const i of cell) {
        const t = inst[i];
        const dx = t.x - cam.x, dz = t.z - cam.z;
        if (dx * dx + dz * dz > r * r * 1.1) continue;
        const n = counts[t.v];
        if (n >= nearBark[t.v].instanceMatrix.count) continue;
        q.setFromAxisAngle(up, t.rot);
        m4.compose(p.set(t.x, t.y, t.z), q, s.set(t.k, t.k, t.k));
        nearBark[t.v].setMatrixAt(n, m4);
        nearLeaves[t.v].setMatrixAt(n, m4);
        counts[t.v] = n + 1;
      }
    }
    variants.forEach((v, vi) => {
      for (const m of [nearBark[vi], nearLeaves[vi]]) { m.count = counts[vi]; m.instanceMatrix.needsUpdate = true; }
    });
  }

  return {
    placed: inst.length,
    update(cam, drawDistance) {
      refreshT -= 1 / 60;
      if (refreshT <= 0 || cam.distanceToSquared(camPrev) > 64) { refreshNear(cam); refreshT = 0.3; camPrev.copy(cam); }
      for (const m of rockMeshes) m.visible = true;
      for (const m of impMeshes) m.material.uniforms.uNear.value = Q.near;
      if (grass) grass.update(cam);
      void drawDistance;
    },
  };
}

async function createGrassField(gltf, Q, scene) {
  const g = await gltf.loadAsync(BASE + 'grass.glb');
  let src = null; g.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
  const size = Q.grassR * 2, count = Q.grass;
  const baked = bakedGeometry(src);
  baked.computeBoundingBox();
  const bb = baked.boundingBox, gh = Math.max(1e-3, bb.max.y - bb.min.y);
  baked.translate(0, -bb.min.y, 0);
  baked.scale(1 / gh, 1 / gh, 1 / gh); // unit height: instance scale = height in metres
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = baked.index;
  geo.setAttribute('position', baked.attributes.position);
  geo.setAttribute('uv', baked.attributes.uv);
  const rnd = mulberry32(3);
  const off = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) off.set([rnd() * size, rnd() * size, rnd() * 6.283, 0.4 + rnd() * 0.4], i * 4);
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  geo.instanceCount = count;
  const map = src.material.map;
  map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...worldUniforms, ...grassUniforms, tMap: { value: map }, uCam: { value: new THREE.Vector3() }, uSize: { value: size },
      sbFogA: { value: fogParams.a }, sbFogB: { value: fogParams.b } },
    vertexShader: /* glsl */`
      attribute vec4 aOff;
      uniform vec3 uCam; uniform float uSize; uniform float uTime; uniform float uWorldHalf;
      uniform sampler2D uHeightTex; uniform sampler2D uSplatTex;
      varying vec2 vUv; varying vec3 vW; varying float vDry; varying float vH; varying float vTint; varying float vForest;
      void main() {
        vec2 wxz = uCam.xz + mod(aOff.xy - uCam.xz + uSize * 0.5, uSize) - uSize * 0.5;
        vec2 wuv = (wxz + uWorldHalf) / (2.0 * uWorldHalf);
        float gh = texture2D(uHeightTex, wuv).r;
        vec4 sp = texture2D(uSplatTex, wuv);
        float dens = (1.0 - sp.a) * (1.0 - sp.r) * (1.0 - sp.g * 0.75);
        float keep = step(fract(aOff.z * 13.37), dens);
        float d = length(wxz - uCam.xz);
        float fade = 1.0 - smoothstep(uSize * 0.3, uSize * 0.5, d);
        float sc = aOff.w * keep * fade;
        float c = cos(aOff.z), s = sin(aOff.z);
        vec3 p = position * sc;
        vec3 w = vec3(wxz.x + p.x * c - p.z * s, gh - 0.05 + p.y, wxz.y + p.x * s + p.z * c);
        float bend = position.y * position.y * sc;
        w.x += (sin(uTime * 1.7 + wxz.x * 0.2 + wxz.y * 0.13) * 0.18 + sin(uTime * 3.3 + wxz.x) * 0.05) * bend;
        w.z += sin(uTime * 1.3 + wxz.y * 0.17) * 0.12 * bend;
        vUv = uv;
        vW = w; vDry = sp.b; vH = position.y; vTint = fract(aOff.z * 7.31); vForest = sp.g;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tMap; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uAmbient; uniform vec3 uFogColor; uniform float uFogDensity;
      uniform vec4 sbFogA; uniform vec4 sbFogB;
      varying vec2 vUv; varying vec3 vW; varying float vDry; varying float vH; varying float vTint; varying float vForest;
      ${FOG_GLSL}
      void main() {
        vec4 c = texture2D(tMap, vUv);
        if (c.a < 0.5) discard;
        // the clump texture is greyscale detail: tint it with natural grass colours
        float lum = dot(c.rgb, vec3(0.333)) * 1.7;
        vec3 green = mix(vec3(0.16, 0.27, 0.06), vec3(0.30, 0.38, 0.11), vTint);
        vec3 straw = mix(vec3(0.46, 0.39, 0.19), vec3(0.58, 0.50, 0.27), vTint);
        vec3 col = mix(green, straw, clamp(vDry * 1.1, 0.0, 1.0)) * lum;
        col *= 1.0 - vForest * 0.35;
        col *= 0.55 + 0.45 * clamp(vH * 1.2, 0.0, 1.0); // darker at the roots
        vec3 lit = col * (uAmbient * 1.4 + uSunColor * 1.5 * (0.4 + 0.6 * max(uSunDir.y, 0.0)));
        gl_FragColor = vec4(sbApplyFog(lit, vW, cameraPosition, uFogColor, uFogDensity, sbFogA, sbFogB), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.userData.noReflect = true;
  scene.add(mesh);
  return { update(cam) { mat.uniforms.uCam.value.copy(cam); } };
}
