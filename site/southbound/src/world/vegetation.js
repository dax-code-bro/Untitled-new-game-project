// Instanced forests (pine, oak, cypress, palm, bushes) with wind, plus a
// GPU grass field that follows the camera.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, CITY, coastZ } from './layout.js';
import { forestMask, plainsMask, bayouMask } from './heightmap.js';
import { worldUniforms } from './terrain.js';
import { mulberry32 } from '../util.js';
import { fogParams, FOG_GLSL } from './atmosphere.js';

function part(geo, color, jitter = 0.08, rnd) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count, cols = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i += 3) {
    const j = 1 + (rnd() - 0.5) * jitter * 2;
    for (let k = 0; k < 3; k++) { cols[(i + k) * 3] = c.r * j; cols[(i + k) * 3 + 1] = c.g * j; cols[(i + k) * 3 + 2] = c.b * j; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

function treeGeometries() {
  const rnd = mulberry32(5);
  const bark = 0x4a3524;
  const pine = mergeGeometries([
    part(new THREE.CylinderGeometry(0.18, 0.32, 5, 6).translate(0, 2.5, 0), bark, 0.1, rnd),
    part(new THREE.ConeGeometry(2.6, 5.0, 8).translate(0, 4.8, 0), 0x1e3a1c, 0.2, rnd),
    part(new THREE.ConeGeometry(2.1, 4.4, 8).translate(0, 7.3, 0), 0x22421f, 0.2, rnd),
    part(new THREE.ConeGeometry(1.5, 3.8, 8).translate(0, 9.6, 0), 0x274a22, 0.2, rnd),
    part(new THREE.ConeGeometry(0.9, 2.8, 7).translate(0, 11.6, 0), 0x2b5025, 0.2, rnd),
  ]);
  const blob = (r, x, y, z, c) => part(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), c, 0.25, rnd);
  const oak = mergeGeometries([
    part(new THREE.CylinderGeometry(0.28, 0.45, 4.5, 7).translate(0, 2.25, 0), bark, 0.1, rnd),
    part(new THREE.CylinderGeometry(0.12, 0.2, 2.6, 5).rotateZ(0.7).translate(0.9, 4.6, 0), bark, 0.1, rnd),
    blob(2.6, 0, 6.2, 0, 0x3b5a23), blob(2.0, 1.8, 5.6, 0.6, 0x45652a), blob(1.9, -1.6, 5.8, -0.4, 0x36521f), blob(1.7, 0.2, 7.6, -0.9, 0x4b6c2d),
  ]);
  const cypress = mergeGeometries([
    part(new THREE.CylinderGeometry(0.3, 0.8, 3.0, 7).translate(0, 1.5, 0), 0x5a4a38, 0.1, rnd),
    part(new THREE.CylinderGeometry(0.15, 0.3, 6, 6).translate(0, 5.5, 0), 0x5a4a38, 0.1, rnd),
    blob(1.8, 0, 8.2, 0, 0x4a5a2a), blob(1.4, 1.2, 7.0, 0.4, 0x56653a), blob(1.3, -1.0, 9.2, -0.3, 0x3e4f24),
  ]);
  const palmParts = [];
  for (let i = 0; i < 5; i++) palmParts.push(part(new THREE.CylinderGeometry(0.2 - i * 0.015, 0.24 - i * 0.015, 1.9, 6).translate(i * 0.12, 0.95 + i * 1.8, 0), 0x7a6648, 0.1, rnd));
  for (let i = 0; i < 8; i++) {
    const f = new THREE.BoxGeometry(0.5, 0.06, 3.6).translate(0, 0, 1.8).rotateX(0.45 + rnd() * 0.3).rotateY((i / 8) * Math.PI * 2).translate(0.6, 9.2, 0);
    palmParts.push(part(f, 0x3f6a26, 0.25, rnd));
  }
  const palm = mergeGeometries(palmParts);
  const bush = mergeGeometries([blob(1.1, 0, 0.7, 0, 0x34501f), blob(0.8, 0.8, 0.5, 0.2, 0x3e5a24), blob(0.7, -0.6, 0.5, -0.4, 0x2f4a1c)]);
  return { pine, oak, cypress, palm, bush };
}

function windMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 ip = instanceMatrix[3].xyz;
  float ph = ip.x*0.05 + ip.z*0.07;
  float sway = pow(max(position.y, 0.0)/10.0, 1.6);
  float gust = 0.6 + 0.4*sin(uTime*0.35 + ip.x*0.004);
  transformed.x += sin(uTime*1.3 + ph)*0.22*sway*gust;
  transformed.z += cos(uTime*1.07 + ph*1.3)*0.16*sway*gust;
}`);
  };
  return mat;
}

export function createVegetation(hm, quality, scene, collision, cityBlocks) {
  const rnd = mulberry32(99);
  const geos = treeGeometries();
  const types = ['pine', 'oak', 'cypress', 'palm', 'bush'];
  const chunks = 8, csize = WORLD.size / chunks;
  const buckets = new Map(); // `${type}:${ci}:${cj}` -> matrices
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let placed = 0;

  const blocked = (x, z, r) => {
    let hit = false;
    collision.query(x, z, r, (it) => { if (it.t === 0 && x > it.minX - r && x < it.maxX + r && z > it.minZ - r && z < it.maxZ + r) hit = true; });
    return hit;
  };
  const place = (type, x, z, scale, trunkR) => {
    const y = hm.height(x, z);
    if (y < hm.waterLevel(x, z) + 0.4 && type !== 'cypress') return false;
    if (blocked(x, z, 2.5 * scale)) return false;
    const ci = Math.min(chunks - 1, Math.max(0, Math.floor((x + WORLD.half) / csize)));
    const cj = Math.min(chunks - 1, Math.max(0, Math.floor((z + WORLD.half) / csize)));
    const k = `${type}:${ci}:${cj}`;
    if (!buckets.has(k)) buckets.set(k, []);
    q.setFromAxisAngle(up, rnd() * Math.PI * 2);
    const sy = scale * (0.85 + rnd() * 0.35);
    m4.compose(p.set(x, y - 0.3, z), q, s.set(scale, sy, scale));
    buckets.get(k).push(m4.clone());
    if (trunkR > 0) collision.addCircle(x, z, trunkR * scale);
    placed++;
    return true;
  };

  const target = quality.treeCount;
  let tries = 0;
  while (placed < target && tries < target * 8) {
    tries++;
    const x = (rnd() * 2 - 1) * (WORLD.half - 10), z = (rnd() * 2 - 1) * (WORLD.half - 10);
    const sp = hm.splatAt(x, z, 3);
    if (sp > 0.15) continue;
    hm.normal(x, z, nrm);
    if (nrm.y < 0.8) continue;
    const y = hm.height(x, z);
    const f = forestMask(x, z), pl = plainsMask(x, z), b = bayouMask(x, z);
    const dCoast = coastZ(x) - z;
    let prob = 0.025 + f * 0.95 + b * 0.35 - pl * 0.02;
    if (y > 200) prob *= 0.3;
    if (rnd() > prob) continue;
    let type;
    if (b > 0.4) type = rnd() < 0.7 ? 'cypress' : 'bush';
    else if (dCoast < 160 && dCoast > 0) type = rnd() < 0.6 ? 'palm' : 'bush';
    else if (f > 0.5) type = rnd() < 0.82 ? 'pine' : rnd() < 0.5 ? 'oak' : 'bush';
    else type = rnd() < 0.45 ? 'oak' : rnd() < 0.5 ? 'bush' : 'pine';
    const scale = type === 'bush' ? 0.7 + rnd() * 0.8 : 0.75 + rnd() * 0.65;
    place(type, x, z, scale, type === 'bush' ? 0 : 0.4);
  }
  // Parks and boulevards in the city
  for (const bl of cityBlocks) {
    if (bl.type !== 'park') continue;
    for (let k = 0; k < 26; k++) place(rnd() < 0.5 ? 'oak' : 'palm', bl.cx + (rnd() - 0.5) * 66, bl.cz + (rnd() - 0.5) * 66, 0.8 + rnd() * 0.4, 0.4);
  }
  for (let i = 0; i <= CITY.nx; i++) {
    const x = CITY.x0 + i * CITY.pitch + CITY.street / 2 + 1.5;
    for (let z = CITY.z0 + 14; z < CITY.z0 + CITY.nz * CITY.pitch; z += 18) {
      if (((z - CITY.z0) % CITY.pitch) < 14 || ((z - CITY.z0) % CITY.pitch) > CITY.pitch - 14) continue;
      place('palm', x, z, 0.85, 0.3);
    }
  }

  const mat = windMaterial();
  const meshes = [];
  for (const [k, list] of buckets) {
    const [type, ci, cj] = k.split(':');
    const mesh = new THREE.InstancedMesh(geos[type], mat, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = quality.shadows >= 2 || type !== 'bush';
    mesh.receiveShadow = quality.shadows >= 3;
    mesh.computeBoundingSphere();
    mesh.userData.center = new THREE.Vector3(-WORLD.half + (+ci + 0.5) * csize, 0, -WORLD.half + (+cj + 0.5) * csize);
    scene.add(mesh);
    meshes.push(mesh);
  }

  const grass = quality.grass > 0 ? createGrass(quality, scene) : null;

  return {
    meshes, placed, grass,
    update(cam, drawDistance) {
      for (const m of meshes) {
        const c = m.userData.center;
        m.visible = Math.hypot(c.x - cam.x, c.z - cam.z) < drawDistance * 0.8 + 360;
      }
      if (grass) grass.update(cam);
    },
  };
}

export const grassUniforms = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uAmbient: { value: new THREE.Color(0.4, 0.45, 0.5) },
  uFogColor: { value: new THREE.Color() },
  uFogDensity: { value: 0.0002 },
};

function createGrass(quality, scene) {
  const count = quality.grass, size = quality.grassRadius * 2;
  // blade: 3 segments, tapering
  const pos = [], idx = [];
  const segs = 3;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, w = 0.042 * (1 - t * 0.8);
    pos.push(-w, t, 0, w, t, 0);
  }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const rnd = mulberry32(3);
  const off = new Float32Array(count * 2), rr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    off[i * 2] = rnd() * size; off[i * 2 + 1] = rnd() * size;
    rr[i * 3] = 0.22 + rnd() * 0.38; rr[i * 3 + 1] = rnd() * Math.PI * 2; rr[i * 3 + 2] = rnd();
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 2));
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rr, 3));
  geo.instanceCount = count;

  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...worldUniforms, ...grassUniforms, uCam: { value: new THREE.Vector3() }, uSize: { value: size }, sbFogA: { value: fogParams.a }, sbFogB: { value: fogParams.b } },
    vertexShader: /* glsl */`
      attribute vec2 aOffset; attribute vec3 aRand;
      uniform vec3 uCam; uniform float uSize; uniform float uTime; uniform float uWorldHalf;
      uniform sampler2D uHeightTex; uniform sampler2D uSplatTex;
      varying float vT; varying float vDry; varying float vFogDepth; varying float vShade; varying vec3 vGW;
      void main(){
        vec2 wxz = uCam.xz + mod(aOffset - uCam.xz + uSize*0.5, uSize) - uSize*0.5;
        vec2 uv = (wxz + uWorldHalf)/(2.0*uWorldHalf);
        float gh = texture2D(uHeightTex, uv).r;
        vec4 sp = texture2D(uSplatTex, uv);
        float dens = (1.0 - sp.a) * (1.0 - sp.r) * (1.0 - sp.g*0.7);
        float d = length(wxz - uCam.xz);
        float fade = 1.0 - smoothstep(uSize*0.32, uSize*0.5, d);
        float keep = step(aRand.z, dens) * fade;
        float h = aRand.x * keep * (0.7 + sp.b*0.6);
        float c = cos(aRand.y), s = sin(aRand.y);
        vec3 p = position;
        float wind = sin(uTime*1.8 + wxz.x*0.15 + wxz.y*0.1)*0.25 + sin(uTime*3.1 + wxz.x*0.6)*0.08;
        vec3 world = vec3(wxz.x + p.x*c, gh + p.y*h, wxz.y + p.x*s);
        world.x += wind * p.y*p.y * h;
        world.z += wind * 0.6 * p.y*p.y * h;
        vT = p.y; vDry = sp.b; vShade = 0.75 + 0.25*fract(aRand.z*91.0);
        vGW = world;
        vec4 mv = viewMatrix * vec4(world, 1.0);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uAmbient; uniform vec3 uFogColor; uniform float uFogDensity;
      varying float vT; varying float vDry; varying float vFogDepth; varying float vShade; varying vec3 vGW;
      uniform vec4 sbFogA; uniform vec4 sbFogB;
      ${FOG_GLSL}
      void main(){
        vec3 base = mix(vec3(0.05,0.09,0.025), vec3(0.20,0.27,0.08), vT);
        vec3 dry = mix(vec3(0.2,0.16,0.07), vec3(0.48,0.4,0.2), vT);
        vec3 col = mix(base, dry, vDry) * vShade;
        float sun = max(uSunDir.y, 0.0)*0.7 + 0.3;
        vec3 lit = col * (uAmbient + uSunColor * sun * (0.4 + 0.6*vT));
        gl_FragColor = vec4(sbApplyFog(lit, vGW, cameraPosition, uFogColor, uFogDensity, sbFogA, sbFogB), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, update(cam) { mat.uniforms.uCam.value.copy(cam); } };
}
