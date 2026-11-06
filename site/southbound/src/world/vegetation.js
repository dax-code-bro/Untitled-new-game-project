// Vegetation: real trees and bushes generated with ez-tree (MIT) and baked
// offline (tools/southbound/bake-vegetation.mjs), drawn as full 3D models
// near the camera and as camera-facing impostor sprites in the distance.
// Ground cover: photo-textured grass clumps around the player and scanned rocks.
import { shadeLeaves, bakeCanopyAO, setBodyShadeQuality } from '../entities/bodyshade.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadTexture, withKTX2 } from '../assets/ktx2.js';
import { simplified, thinCards, lodReady } from '../core/lod.js';
import { cloudShadowUniforms, CLOUD_SHADOW_GLSL } from '../core/cloudshadow.js';
import { WORLD, CITY, coastZ } from './layout.js';
import { forestMask, plainsMask, bayouMask } from './heightmap.js';
import { worldUniforms } from './terrain.js';
import { mulberry32 } from '../util.js';
import { fogParams, FOG_GLSL } from './atmosphere.js';
import { createGroundCover } from './grass.js';

const BASE = 'assets/veg/';

// real-world heights (m) each baked variant is scaled to
const HEIGHT = {
  pine_a: [19, 27], pine_b: [18, 25], pine_c: [11, 17], oak_a: [13, 18], oak_b: [9, 13],
  ash_a: [12, 17], ash_b: [8, 12], bush_a: [1.4, 2.4], bush_c: [1.1, 2.0],
};
const TRUNK = { pine: 0.35, oak: 0.45, ash: 0.35, bush: 0 };

const QUALITY = {
  Phone: { near: 32, cap: 50, rocks: 700 },
  Low: { near: 45, cap: 80, rocks: 1000 },
  Medium: { near: 60, cap: 150, rocks: 1800 },
  High: { near: 85, cap: 280, rocks: 2800 },
  Ultra: { near: 120, cap: 520, rocks: 4200 },
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

// textures are preloaded (GPU-compressed KTX2 where there's a copy, else the JPEG/PNG)
const TEX = new Map();
function texture(_loader, url, srgb) {
  const t = TEX.get(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
async function preloadTextures(manifest) {
  const want = new Map();
  for (const t of manifest.trees) {
    for (const k of ['color', 'normal', 'roughness']) want.set(`${BASE}bark_${t.bark}_${k}.jpg`, k === 'color');
    want.set(`${BASE}leaf_${t.leaf}.png`, true);
    want.set(`${BASE}${t.id}_impostor.png`, true);
  }
  await Promise.all([...want].map(([url, srgb]) => loadTexture(url.replace(/\.(jpg|png)$/, ''), url.match(/\.(jpg|png)$/)[0], srgb)
    .then((t) => TEX.set(url, t)).catch(() => TEX.set(url, new THREE.Texture()))));
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

export async function createVegetation(hm, quality, scene, collision, cityBlocks, progress = () => {}, surf = null, coverDensity = 1) {
  const Q = QUALITY[quality.label] || QUALITY.Medium;
  setBodyShadeQuality(quality); // (leaf lighting is off on Phone)
  const gltf = withKTX2(new GLTFLoader());
  const tl = new THREE.TextureLoader();
  await lodReady; // meshoptimizer, for the lighter mid-distance trees
  const manifest = await (await fetch(BASE + 'manifest.json')).json();
  await preloadTextures(manifest);

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
    bakeCanopyAO(v.leaves); // before the lighter mid-distance cards copy its attributes
    v.barkMat = barkMat(t.bark, t.barkTint ?? 0xffffff);
    v.leafMat = leafMat(t.leaf, t.leafTint ?? 0xffffff);
    shadeLeaves(v.leafMat); // light through the leaves (entities/bodyshade.js)
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
  const blocked = (x, z, r, pit = false) => {
    let hit = false;
    collision.query(x, z, r + 8, (it) => {
      if (hit) return;
      // walls: a trunk stands clear of porches, steps and awnings too (they reach ~2.6 m out)
      const rr = it.t === 0 && it.y1 - it.y0 > 3 && !pit ? Math.max(r, 3.1) : r;
      if (it.t === 0 && x > it.minX - rr && x < it.maxX + rr && z > it.minZ - rr && z < it.maxZ + rr) hit = true;
      else if (it.t === 3) {
        // keep roads (and the verge a trunk would stand in) clear
        const dx = it.bx - it.ax, dz = it.bz - it.az, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - it.ax) * dx + (z - it.az) * dz) / L2));
        if (Math.hypot(it.ax + dx * t - x, it.az + dz * t - z) < it.hw + (pit ? 0.5 : Math.min(r, 2.5) + 0.6)) hit = true;
      }
    });
    return hit;
  };
  // pit: a street tree in a pavement pit by the kerb (allowed right up to the road)
  const place = (id, x, z, trunk = true, pit = false) => {
    const y = hm.height(x, z);
    if (y < hm.waterLevel(x, z) + 0.4) return false;
    if (blocked(x, z, pit ? 1.2 : id.startsWith('bush') ? 1 : 2.5, pit)) return false;
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
    // on the lawns, not on the two paths across the park or its benches
    const offPath = (x, z) => Math.abs(x - bl.cx) > 4.5 && Math.abs(z - bl.cz) > 4.5;
    for (let k = 0; k < 22; k++) { const id = pick(['oak_a', 'oak_b', 'ash_a', 'ash_b']), x = bl.cx + (rnd() - 0.5) * 64, z = bl.cz + (rnd() - 0.5) * 64; if (offPath(x, z)) place(id, x, z); }
    for (let k = 0; k < 14; k++) { const id = pick(['bush_a', 'bush_c']), x = bl.cx + (rnd() - 0.5) * 66, z = bl.cz + (rnd() - 0.5) * 66; if (offPath(x, z)) place(id, x, z, false); }
  }
  for (let i = 0; i <= CITY.nx; i++) {
    // tree pits at the kerb edge (0.8 m in), clear of the lamp posts and of where people walk (1.7 m in)
    const x = CITY.x0 + i * CITY.pitch + CITY.street / 2 + 0.8;
    for (let z = CITY.z0 + 14; z < CITY.z0 + CITY.nz * CITY.pitch; z += 18) {
      const m = (z - CITY.z0) % CITY.pitch;
      if (m < 14 || m > CITY.pitch - 14) continue;
      let lamp = false;
      collision.query(x, z, 3, (it) => { if (it.t === 1 && it.r <= 0.3 && Math.hypot(it.x - x, it.z - z) < 2.4) lamp = true; });
      if (!lamp) place('ash_b', x, z, true, true);
    }
  }

  // ---- the edge of town: no hard line between the last block and the woods.
  // Yard trees and hedges right at the edge, thickening into stands of trees and
  // then real woods a few hundred metres out (denser in the forest direction).
  {
    const bx0 = CITY.x0 - 30, bx1 = CITY.x0 + CITY.nx * CITY.pitch + 30, bz0 = CITY.z0 - 30, bz1 = CITY.z0 + CITY.nz * CITY.pitch + 30;
    const edgeD = (x, z) => { const dx = Math.max(bx0 - x, 0, x - bx1), dz = Math.max(bz0 - z, 0, z - bz1); return Math.hypot(dx, dz); };
    const want = Math.round(target * 0.12);
    let added = 0, bt = 0;
    while (added < want && bt++ < want * 30) {
      const x = bx0 - 420 + rnd() * (bx1 - bx0 + 840), z = bz0 - 420 + rnd() * (bz1 - bz0 + 840);
      const d = edgeD(x, z);
      if (d < 8 || d > 420) continue;
      if (hm.splatAt(x, z, 3) > 0.12) continue; // not on roads
      if (rnd() > 0.12 + Math.min(1, d / 380) * 0.75) continue; // sparse at the edge, dense further out
      const f = forestMask(x, z);
      if (d < 70) {
        // yards: a shade tree or a hedge row
        if (rnd() < 0.45) { if (place(pick(['oak_a', 'oak_b', 'ash_a']), x, z)) added++; }
        else { const ang = rnd() * Math.PI; for (let k = 0; k < 5; k++) if (place('bush_c', x + Math.cos(ang) * k * 1.6, z + Math.sin(ang) * k * 1.6, false)) added++; }
      } else {
        // stands of trees that join up further out
        const n = 2 + ((rnd() * (d / 60)) | 0);
        for (let k = 0; k < n; k++) {
          const id = f > 0.3 || rnd() < 0.3 ? pick(['pine_a', 'pine_b', 'oak_b', 'ash_b']) : pick(['oak_a', 'oak_b', 'ash_a', 'ash_b', 'bush_a']);
          if (place(id, x + (rnd() - 0.5) * 14, z + (rnd() - 0.5) * 14, !id.startsWith('bush'))) added++;
        }
      }
    }
  }

  // ---- open country: bush clusters, lone trees and scrub across the plains and meadows
  {
    const want = Math.round(target * 0.35);
    let added = 0, bt = 0;
    while (added < want && bt++ < want * 12) {
      const x = (rnd() * 2 - 1) * (WORLD.half - 20), z = (rnd() * 2 - 1) * (WORLD.half - 20);
      if (hm.splatAt(x, z, 3) > 0.12) continue;
      hm.normal(x, z, nrm);
      if (nrm.y < 0.85) continue;
      const f = forestMask(x, z), pl = plainsMask(x, z);
      if (f > 0.6 || x > CITY.x0 - 60 && x < CITY.x0 + CITY.nx * CITY.pitch + 60 && z > CITY.z0 - 60 && z < CITY.z0 + CITY.nz * CITY.pitch + 60) continue;
      if (rnd() > 0.2 + pl * 0.65) continue;
      if (rnd() < 0.06) { if (place(pick(['oak_a', 'oak_b', 'ash_b']), x, z)) added++; continue; }
      const n = 1 + ((rnd() * 4) | 0);
      for (let k = 0; k < n; k++) if (place(pick(['bush_a', 'bush_c']), x + (rnd() - 0.5) * 7, z + (rnd() - 0.5) * 7, false)) added++;
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

  // ---- near: full 3D trees, refreshed a few times per second. Close up the full tree; further out
  // (still inside the 3D radius) a lighter one: trunk and branches simplified to ~25%, 40% of the
  // leaf cards each grown to cover the same area. A forest on High drew ~18M triangles a frame.
  const nearBark = [], nearLeaves = [], midBark = [], midLeaves = [];
  const NEAR_FULL = Q.near * 0.38;
  for (const v of variants) {
    const cap = v.id.startsWith('bush') ? Q.cap * 4 : Q.cap;
    const barkMid = simplified(v.bark, 0.25, 0.02) || v.bark, leavesMid = thinCards(v.leaves, 0.4, v.id.length * 7919) || v.leaves;
    const b = new THREE.InstancedMesh(v.bark, v.barkMat, cap), bm = new THREE.InstancedMesh(barkMid, v.barkMat, cap);
    const l = new THREE.InstancedMesh(v.leaves, v.leafMat, cap), lm = new THREE.InstancedMesh(leavesMid, v.leafMat, cap);
    for (const m of [b, l, bm, lm]) { m.count = 0; m.frustumCulled = false; m.castShadow = quality.shadows > 0; m.receiveShadow = true; scene.add(m); }
    for (const m of [b, bm]) { m.userData.hitStatic = true; m.userData.surf = 'tree'; } // trunks and branches stop bullets, leaves don't
    for (const m of [l, lm]) m.userData.noHit = true;
    nearBark.push(b); nearLeaves.push(l); midBark.push(bm); midLeaves.push(lm);
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
    geo.userData.list = list;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...grassUniforms, tImp: { value: v.imp }, uNear: { value: Q.near },
        uSize: { value: new THREE.Vector3(v.half * 2, v.half * 4, v.top - v.half * 4) },
        sbFogA: { value: fogParams.a }, sbFogB: { value: fogParams.b },
        ...cloudShadowUniforms,
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
        ${CLOUD_SHADOW_GLSL}
        void main() {
          vec4 c = texture2D(tImp, vUv);
          // dithered fade into the 3D tree (no hard pop)
          float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          if (c.a < 0.5 || vFade < dither) discard;
          float cs = sbCloudShade(vW);
          vec3 lit = c.rgb * (uAmbient * 1.6 + uSunColor * 1.4 * (0.45 + 0.55 * max(uSunDir.y, 0.0)) * cs);
          // a far tree against the sun: light comes through the crown
          float back = pow(max(dot(normalize(vW - cameraPosition), uSunDir), 0.0), 5.0);
          lit += c.rgb * uSunColor * back * cs * vec3(0.85, 1.0, 0.4) * 0.9;
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
  const rockMeshes = [], scatterParts = [];
  const ROCK_CAP = { Phone: 120, Low: 180, Medium: 260, High: 360, Ultra: 520 }[quality.label] || 260;
  const ROCK_R = { Phone: 110, Low: 140, Medium: 180, High: 230, Ultra: 300 }[quality.label] || 180;
  const rockCam = new THREE.Vector3(1e9, 0, 0);
  // fill each rock mesh with the rocks near the camera (big ones further out than pebbles)
  function refreshRocks(cam) {
    for (const im of rockMeshes) {
      let n = 0;
      for (const r of im.userData.spots) {
        const d = Math.hypot(r.x - cam.x, r.z - cam.z), reach = ROCK_R * Math.min(1, 0.45 + r.k * 0.5);
        if (d > reach || n >= im.instanceMatrix.count) continue;
        im.setMatrixAt(n++, r.m);
      }
      im.count = n; im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }
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
      const open = plainsMask(x, z);
      const prob = slope * 2.2 + f * 0.25 + (nearWater ? 0.4 : 0) + 0.04 + open * 0.12;
      if (rnd() > prob) continue;
      if (blocked(x, z, 2)) continue;
      const k = (slope > 0.12 ? 0.3 : 0.18) + Math.pow(rnd(), 2.5) * (slope > 0.25 ? 2.6 : slope > 0.12 ? 1.2 : 0.9);
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
      // the scanned rocks are ~1,500 triangles each: only the ones round the camera are drawn
      // (all ~2,800 of them, map-wide and in every shadow pass, were most of the frame's triangles)
      const e = new THREE.Euler();
      spots[i].forEach((r) => { e.set(r.tilt, r.r, r.tilt * 0.5); r.m = new THREE.Matrix4().compose(new THREE.Vector3(r.x, r.y, r.z), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(r.k, r.k, r.k)); });
      for (const [gi, o] of src.entries()) {
        const im = new THREE.InstancedMesh(geos[gi], o.material, Math.max(1, Math.min(spots[i].length, ROCK_CAP)));
        im.count = 0; im.frustumCulled = false;
        im.userData.spots = spots[i];
        im.castShadow = quality.shadows >= 2; im.receiveShadow = true;
        im.userData.noReflect = true; im.userData.hitStatic = true; im.userData.surf = 'stone'; scene.add(im); rockMeshes.push(im);
      }
      // pebbles scattered round the player: a low-poly stone, not the full scan
      if (i === 0) for (let v = 0; v < 3; v++) {
        const pg = new THREE.IcosahedronGeometry(0.5, 1);
        const P = pg.attributes.position, pr = mulberry32(77 + v);
        const bump = new Map();
        for (let k = 0; k < P.count; k++) {
          const key = `${P.getX(k).toFixed(3)},${P.getY(k).toFixed(3)},${P.getZ(k).toFixed(3)}`;
          if (!bump.has(key)) bump.set(key, 0.78 + pr() * 0.35);
          const f = bump.get(key); P.setXYZ(k, P.getX(k) * f, P.getY(k) * f * 0.62, P.getZ(k) * f);
        }
        pg.computeVertexNormals();
        scatterParts.push({ geo: pg, mat: src[0].material });
      }
    });
  } catch (e) { console.warn('rocks unavailable', e); }

  // ---- continuous grass carpet + wildflowers around the camera
  const cover = createGroundCover(hm, quality, scene, surf, coverDensity);
  if (cover.addRocks && scatterParts.length) cover.addRocks(scatterParts);

  let refreshT = 0;
  const camPrev = new THREE.Vector3(1e9, 0, 0);
  function refreshNear(cam) {
    const counts = variants.map(() => 0), mids = variants.map(() => 0);
    const r = Q.near, c0x = Math.floor((cam.x - r) / CELL), c1x = Math.floor((cam.x + r) / CELL);
    const c0z = Math.floor((cam.z - r) / CELL), c1z = Math.floor((cam.z + r) / CELL);
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
      const cell = grid.get(`${cx},${cz}`);
      if (!cell) continue;
      for (const i of cell) {
        const t = inst[i];
        if (!t.k) continue; // cleared for a lot built later
        const dx = t.x - cam.x, dz = t.z - cam.z, d2 = dx * dx + dz * dz;
        if (d2 > r * r * 1.1) continue;
        const far = d2 > NEAR_FULL * NEAR_FULL;
        const n = far ? mids[t.v] : counts[t.v];
        if (n >= nearBark[t.v].instanceMatrix.count) continue;
        q.setFromAxisAngle(up, t.rot);
        m4.compose(p.set(t.x, t.y, t.z), q, s.set(t.k, t.k, t.k));
        (far ? midBark : nearBark)[t.v].setMatrixAt(n, m4);
        (far ? midLeaves : nearLeaves)[t.v].setMatrixAt(n, m4);
        if (far) mids[t.v] = n + 1; else counts[t.v] = n + 1;
      }
    }
    variants.forEach((v, vi) => {
      for (const m of [nearBark[vi], nearLeaves[vi]]) { m.count = counts[vi]; m.instanceMatrix.needsUpdate = true; }
      for (const m of [midBark[vi], midLeaves[vi]]) { m.count = mids[vi]; m.instanceMatrix.needsUpdate = true; }
    });
  }

  return {
    placed: inst.length,
    cover,
    // the trees for the local light capture (core/gi.js): the near 3D set and the far impostors
    giMeshes: () => [...nearBark, ...nearLeaves, ...midBark, ...midLeaves, ...impMeshes],
    // every tree and bush: [variant id, x, y, z, rotation, scale] (exported to the Unity project)
    list: () => inst.filter((t) => t.k).map((t) => [variants[t.v].id, t.x, t.y, t.z, t.rot, t.k]),
    // take out every tree and bush on a lot (a shop or workshop put up after the woods grew), trunks and all
    clearRect(x0, z0, x1, z1) {
      let n = 0;
      for (const t of inst) if (t.k && t.x > x0 && t.x < x1 && t.z > z0 && t.z < z1) { t.k = 0; n++; }
      if (!n) return 0;
      for (const m of impMeshes) {
        const a = m.geometry.attributes.aInst, list = m.geometry.userData.list;
        list.forEach((t, i) => { if (!t.k) a.array[i * 4 + 3] = 0; });
        a.needsUpdate = true;
      }
      collision.query((x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) / 2 + 2, (it) => { if (it.t === 1 && it.x > x0 && it.x < x1 && it.z > z0 && it.z < z1) it.r = 0; });
      camPrev.set(1e9, 0, 1e9);
      return n;
    },
    update(cam, drawDistance) {
      refreshT -= 1 / 60;
      if (refreshT <= 0 || cam.distanceToSquared(camPrev) > 64) { refreshNear(cam); refreshT = 0.3; camPrev.copy(cam); }
      if (cam.distanceToSquared(rockCam) > 225) { refreshRocks(cam); rockCam.copy(cam); }
      for (const m of impMeshes) m.material.uniforms.uNear.value = Q.near;
      void drawDistance;
    },
  };
}
