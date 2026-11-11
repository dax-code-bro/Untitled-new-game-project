// Ground cover round the camera: the dense painted-blade grass of the meadows and plains
// (grasscards.js), the scattered pebbles, the push that parts it, and the masks for mown
// lawns (round every building and the city edge) and park paths.
import * as THREE from 'three';
import { CITY, TOWN } from './layout.js';
import { worldUniforms } from './terrain.js';
import { mulberry32 } from '../util.js';
import { createGrassCards } from './grasscards.js';


export const coverUniforms = {
  uCam: { value: new THREE.Vector3() },
  uPush: { value: new THREE.Vector4(0, -999, 0, 0.9) }, // player/vehicle bending the grass
  uPush2: { value: new THREE.Vector4(0, -999, 0, 0) },
  uSunDirG: { value: new THREE.Vector3(0, 1, 0) },
  uSunColG: { value: new THREE.Color(1, 1, 1) },
  uWindK: { value: 1 },
  // mown yards: 1 within a lot's width of any building (set once the town is built); shared
  // with the terrain so the ground under the 3D grass knows where it grows
  uLawn: worldUniforms.uLawn,
};
const LAWN_N = 512;
// park paths (cx, cz, half the lawn's width): no grass on them (the terrain map is too coarse)
coverUniforms.uParks = { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) };

// a low-res mask of the developed land: yards, lots and verges round every building get mown
function lawnTexture(buildings, half) {
  const N = LAWN_N, cell = (half * 2) / N, a = new Float32Array(N * N);
  const fill = (ax, az, bx, bz) => {
    const x0 = Math.max(0, Math.floor((ax + half) / cell)), x1 = Math.min(N - 1, Math.floor((bx + half) / cell));
    const z0 = Math.max(0, Math.floor((az + half) / cell)), z1 = Math.min(N - 1, Math.floor((bz + half) / cell));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) a[z * N + x] = 1;
  };
  for (const b of buildings) {
    const pad = b.h > 14 ? 26 : 16;
    fill(b.x - b.w / 2 - pad, b.z - b.d / 2 - pad, b.x + b.w / 2 + pad, b.z + b.d / 2 + pad);
  }
  // the verges and vacant lots round the edge of the city and the town are kept mown too
  for (const [G, m] of [[CITY, 45], [TOWN, 35]]) fill(G.x0 - m, G.z0 - m, G.x0 + G.nx * G.pitch + m, G.z0 + G.nz * G.pitch + m);
  // soften the edge into the meadow
  const o = new Uint8Array(N * N);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    let t = 0, n = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, zz = z + dz; if (xx >= 0 && zz >= 0 && xx < N && zz < N) { t += a[zz * N + xx]; n++; } }
    o[z * N + x] = Math.round((t / n) * 255);
  }
  const tex = new THREE.DataTexture(o, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return tex;
}

// One tuft: `blades` tapered, curved blades around a small root area.
export function createGroundCover(hm, quality, scene, surf, density = 1) {
  // density 0: no 3D blades or flowers (the photo-scanned ground on its own); the scattered
  // pebbles, the push and the lawn/park masks still work, so nothing else has to care
  // the grass itself: dense clumps of painted-blade cards in the wild parts (grasscards.js)
  const cards = density > 0 ? createGrassCards(hm, quality, scene, surf) : null;
  const grass = cards ? cards.group : null, flowers = null;
  return {
    grass, flowers, cardTex: cards?.tex || null,
    hideGrass() { cards?.setVisible(false); },
    update(cam, sunDir, sunCol, weather) {
      cards?.cull(cam);
      coverUniforms.uCam.value.copy(cam);
      worldUniforms.uGrassCam.value.copy(cam);
      coverUniforms.uSunDirG.value.copy(sunDir);
      coverUniforms.uSunColG.value.copy(sunCol);
      coverUniforms.uWindK.value = 0.8 + (weather?.rain || 0) * 0.8 + (weather?.dark || 0) * 0.5;
    },
    // stones and pebbles scattered over open ground around the camera
    addRocks(parts) {
      const n = { Phone: 260, Low: 380, Medium: 650, High: 1000, Ultra: 1600 }[quality.label] || 600;
      parts.forEach((pt, i) => scene.add(makeScatter(pt.geo, pt.mat, Math.round(n / parts.length), 60, 31 + i, hm.n, quality)));
    },
    push(i, x, y, z, r) { (i ? coverUniforms.uPush2 : coverUniforms.uPush).value.set(x, y, z, r); },
    // mow the yards round these buildings
    setLawns(buildings) { coverUniforms.uLawn.value = lawnTexture(buildings, worldUniforms.uWorldHalf.value); },
    setParks(parks) { parks.slice(0, 4).forEach((pk, i) => coverUniforms.uParks.value[i].set(pk.cx, pk.cz, pk.W / 2 - pk.ring, 0)); },
  };
}

function makeScatter(src, srcMat, count, R, seed, hn, quality) {
  const rnd = mulberry32(seed);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = src.index;
  for (const k of ['position', 'normal', 'uv']) if (src.attributes[k]) geo.setAttribute(k, src.attributes[k]);
  const size = R * 2;
  const off = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) off.set([rnd() * size, rnd() * size, rnd() * Math.PI * 2, rnd()], i * 4);
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  geo.instanceCount = count;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = srcMat.clone();
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms, { uCam: coverUniforms.uCam, uLawn: coverUniforms.uLawn, uSize: { value: size }, uHN: { value: hn },
      uCityB: { value: new THREE.Vector4(CITY.x0 - 20, CITY.z0 - 20, CITY.x0 + CITY.nx * CITY.pitch + 20, CITY.z0 + CITY.nz * CITY.pitch + 20) } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aOff;
uniform vec3 uCam; uniform float uSize; uniform sampler2D uHeightTex; uniform sampler2D uSplatTex; uniform float uWorldHalf; uniform float uHN; uniform vec4 uCityB; uniform sampler2D uLawn;
vec2 rUV(vec2 xz){ return ((xz + uWorldHalf) / (2.0*uWorldHalf) * (uHN - 1.0) + 0.5) / uHN; }
mat3 rRot; float rK; vec3 rBase;`)
      .replace('#include <beginnormal_vertex>', `
vec2 wxz = uCam.xz + mod(aOff.xy - uCam.xz + uSize * 0.5, uSize) - uSize * 0.5;
vec2 huv = rUV(wxz);
float gy = texture(uHeightTex, huv).r;
vec4 sp = texture(uSplatTex, huv);
float e = 2.0 * uWorldHalf / (uHN - 1.0);
float slope = length(vec2(texture(uHeightTex, rUV(wxz + vec2(e, 0.0))).r - gy, texture(uHeightTex, rUV(wxz + vec2(0.0, e))).r - gy)) / e;
float inCity = step(uCityB.x, wxz.x) * step(wxz.x, uCityB.z) * step(uCityB.y, wxz.y) * step(wxz.y, uCityB.w);
inCity = max(inCity, smoothstep(0.2, 0.8, texture(uLawn, (wxz + uWorldHalf) / (2.0 * uWorldHalf)).r));
float dens = (1.0 - smoothstep(0.03, 0.2, sp.a)) * (1.0 - inCity) * (0.35 + sp.b * 0.4 + sp.g * 0.25 + smoothstep(0.15, 0.5, slope) * 0.6 - sp.r * 0.2);
float d = length(wxz - uCam.xz);
float keep = step(aOff.w, dens) * smoothstep(uSize * 0.5, uSize * 0.38, d);
rK = mix(0.1, 0.75, pow(fract(aOff.w * 17.31), 3.0)) * keep;
float c = cos(aOff.z), s = sin(aOff.z), tx = (fract(aOff.w * 5.7) - 0.5) * 0.5;
rRot = mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c) * mat3(1.0, 0.0, 0.0, 0.0, cos(tx), sin(tx), 0.0, -sin(tx), cos(tx));
rBase = vec3(wxz.x, gy - rK * 0.3, wxz.y);
vec3 objectNormal = rRot * normal;
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
#endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed = rRot * (position * vec3(rK, rK * 0.7, rK)) + rBase;');
  };
  mat.customProgramCacheKey = () => 'sbscatter';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = quality.shadows > 0;
  mesh.userData.noReflect = true;
  mesh.userData.noHit = true;
  return mesh;
}
