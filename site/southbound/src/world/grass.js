// Ground cover: a continuous carpet of grass blades around the camera, with
// wildflower patches. Thousands of tufts are drawn in one instanced call and
// wrap around the camera, so the field never ends. Each blade samples
// the same scanned grass/dry-ground textures as the terrain under it, so
// the blades blend into the ground where they fade out. They are lit
// like the terrain (sun, shadows, sky light, fog) and also glow when the
// sun is behind them, sway in rolling gusts and part around the player.
import * as THREE from 'three';
import { CITY, TOWN } from './layout.js';
import { worldUniforms } from './terrain.js';
import { mulberry32 } from '../util.js';

// tufts in the field, field radius (m), blades per tuft
const PRESET = {
  Phone: { tufts: 7000, R: 19, blades: 8 },
  Low: { tufts: 10000, R: 23, blades: 8 },
  Medium: { tufts: 18000, R: 30, blades: 10 },
  High: { tufts: 28000, R: 39, blades: 12 },
  Ultra: { tufts: 50000, R: 52, blades: 12 },
};

export const coverUniforms = {
  uCam: { value: new THREE.Vector3() },
  uPush: { value: new THREE.Vector4(0, -999, 0, 0.9) }, // player/vehicle bending the grass
  uPush2: { value: new THREE.Vector4(0, -999, 0, 0) },
  uSunDirG: { value: new THREE.Vector3(0, 1, 0) },
  uSunColG: { value: new THREE.Color(1, 1, 1) },
  uWindK: { value: 1 },
  // mown yards: 1 within a lot's width of any building (set once the town is built)
  uLawn: { value: (() => { const t = new THREE.DataTexture(new Uint8Array(4), 1, 1); t.needsUpdate = true; return t; })() },
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
function tuftGeometry(blades, flower, rnd) {
  const pos = [], bl = [], idx = [];
  let v = 0;
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.32;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = flower ? 0.75 + rnd() * 0.25 : 0.55 + rnd() * 0.45;
    const w = flower ? 0.006 : 0.011 + rnd() * 0.01;
    const face = rnd() * Math.PI * 2, lean = flower ? 0.05 + rnd() * 0.1 : 0.15 + rnd() * 0.55;
    const segs = 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      if (s < segs) {
        pos.push(x, h, z, x, h, z);
        bl.push(-w, t, face, lean, w, t, face, lean);
      } else {
        pos.push(x, h, z);
        bl.push(0, 1, face, lean);
      }
    }
    for (let s = 0; s < segs - 1; s++) { const o = v + s * 2; idx.push(o, o + 1, o + 3, o, o + 3, o + 2); }
    idx.push(v + (segs - 1) * 2, v + (segs - 1) * 2 + 1, v + segs * 2);
    v += segs * 2 + 1;
  }
  return { pos, bl, idx, v };
}

// Flower head: two crossed quads at the top of the stem (aBlade.y = 2 marks head verts)
function addHead(g, rnd) {
  const s = 0.032 + rnd() * 0.022, y = 0.98; // 6-11 cm across, like real daisies and asters
  for (const ang of [0, Math.PI / 2]) {
    const c = Math.cos(ang) * s, sn = Math.sin(ang) * s;
    const o = g.v;
    for (const [u, w] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      // flat-ish head: tilt the quad so it faces mostly up
      g.pos.push(c * u, y + w * s * 0.35, sn * u + w * s * 0.9 * (ang === 0 ? 1 : 0));
      g.bl.push(u, 2 + (w + 1) * 0.5, ang, w);
    }
    g.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    g.v += 4;
  }
}

function makeMaterial(surf, flower) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: flower ? 0.7 : 0.82, metalness: 0, side: THREE.DoubleSide });
  const gC = surf?.grass?.color || null, dC = surf?.dry?.color || null;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms, coverUniforms, {
      uSize: { value: 0 }, uHN: { value: 0 },
      tGrassC: { value: gC }, tDryC: { value: dC },
      uTexS: { value: new THREE.Vector2(surf?.grass?.size || 2.4, surf?.dry?.size || 3) },
      uCityB: { value: new THREE.Vector4(CITY.x0 - 20, CITY.z0 - 20, CITY.x0 + CITY.nx * CITY.pitch + 20, CITY.z0 + CITY.nz * CITY.pitch + 20) },
    });
    mat.userData.shader = shader;
    shader.uniforms.uSize.value = mat.userData.size;
    shader.uniforms.uHN.value = mat.userData.hn;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aOff; attribute vec4 aBlade;
uniform vec3 uCam; uniform float uSize; uniform vec4 uPush; uniform vec4 uPush2; uniform float uTime; uniform float uWindK;
uniform sampler2D uHeightTex; uniform sampler2D uSplatTex; uniform sampler2D tGrassC; uniform sampler2D tDryC;
uniform float uWorldHalf; uniform float uHN; uniform vec4 uCityB; uniform vec2 uTexS; uniform sampler2D uLawn; uniform vec4 uParks[4];
varying vec3 vGCol; varying float vGT; varying vec3 vGW; varying float vHead; varying vec2 vHUv; varying float vHue; varying float vFar;
float gHash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float gNoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(gHash(i), gHash(i+vec2(1,0)), u.x), mix(gHash(i+vec2(0,1)), gHash(i+vec2(1,1)), u.x), u.y); }
vec2 gUV(vec2 xz){ return ((xz + uWorldHalf) / (2.0*uWorldHalf) * (uHN - 1.0) + 0.5) / uHN; }
vec3 gPos;`)
      .replace('#include <beginnormal_vertex>', `
vec2 wxz = uCam.xz + mod(aOff.xy - uCam.xz + uSize * 0.5, uSize) - uSize * 0.5;
vec2 huv = gUV(wxz);
float gy = texture(uHeightTex, huv).r;
vec4 sp = texture(uSplatTex, huv);
float e = 2.0 * uWorldHalf / (uHN - 1.0);
float slope = length(vec2(texture(uHeightTex, gUV(wxz + vec2(e, 0.0))).r - gy, texture(uHeightTex, gUV(wxz + vec2(0.0, e))).r - gy)) / e;
float inCity = step(uCityB.x, wxz.x) * step(wxz.x, uCityB.z) * step(uCityB.y, wxz.y) * step(wxz.y, uCityB.w);
inCity = max(inCity, smoothstep(0.2, 0.8, texture(uLawn, (wxz + uWorldHalf) / (2.0 * uWorldHalf)).r));
// where grass grows: not on roads/pavement, sand, steep rock; thinner on the forest floor
float dens = (1.0 - smoothstep(0.04, 0.35, sp.a)) * (1.0 - smoothstep(0.25, 0.6, sp.r)) * (1.0 - sp.g * 0.6) * (1.0 - smoothstep(0.5, 0.85, slope));
float d = length(wxz - uCam.xz);
float R = uSize * 0.5;
float lod = clamp(1.0 - (d - R * 0.3) / (R * 0.7), 0.0, 1.0);
float keepP = mix(0.3, 1.0, lod);
#ifdef SB_FLOWER
  float patchN = gNoise(wxz * 0.045 + 13.0) * 0.7 + gNoise(wxz * 0.21) * 0.3;
  dens *= smoothstep(0.44, 0.66, patchN) * (1.0 - inCity) * (1.0 - sp.g * 0.8); // no wildflowers in a mown lawn (they read as litter)
#endif
for (int k = 0; k < 4; k++) { vec4 P = uParks[k]; vec2 pd0 = abs(wxz - P.xy); if (P.z > 0.0 && max(pd0.x, pd0.y) < P.z && min(pd0.x, pd0.y) < 1.75) dens = 0.0; }
float keep = step(aOff.w, dens * keepP);
// height: tall golden grass on the dry plains, meadow elsewhere, mown lawns in the city
float hN = gNoise(wxz * 0.07) * 0.65 + gNoise(wxz * 0.31) * 0.35;
float hgt = mix(0.28, 0.6, hN) + sp.b * mix(0.25, 0.55, hN);
hgt = mix(hgt, 0.16 + hN * 0.08, inCity);
hgt *= mix(0.55, 1.0, smoothstep(0.0, 0.6, dens));
#ifdef SB_FLOWER
  hgt = mix(0.32, 0.6, hN) * (1.0 - inCity * 0.4);
#endif
hgt *= keep * smoothstep(0.0, 0.22, lod);
float wsc = (1.0 / sqrt(keepP)) * (1.0 + 2.2 * smoothstep(4.0, R, d)); // far blades widen to keep the field solid
float c = cos(aOff.z), s = sin(aOff.z);
vec2 root = vec2(position.x * c - position.z * s, position.x * s + position.z * c) * mix(1.0, 1.4, 1.0 - lod);
float t = aBlade.y;
float head = step(1.5, t);
float tt = head > 0.5 ? 1.0 : t;
float face = aBlade.z + aOff.z;
vec2 fdir = vec2(cos(face), sin(face));
vec2 adir = vec2(-fdir.y, fdir.x);
// wind: rolling gusts sweep across the field, plus per-blade flutter
vec2 wdir = normalize(vec2(0.86, 0.5));
float wave = sin(dot(wxz, wdir) * 0.32 - uTime * 1.9) * 0.5 + 0.5;
float gust = gNoise(wxz * 0.02 - wdir * uTime * 0.35);
float flutter = sin(uTime * 4.7 + aOff.w * 40.0 + t * 2.0) * 0.06;
float windB = (wave * 0.35 + gust * 0.35 + flutter) * uWindK;
// things walking through it push the blades aside
vec2 pd = wxz + root - uPush.xz; float pl = length(pd);
float push = (1.0 - smoothstep(uPush.w * 0.3, uPush.w, pl)) * step(abs(uPush.y - gy), 2.5);
vec2 pd2 = wxz + root - uPush2.xz; float pl2 = length(pd2);
float push2 = (1.0 - smoothstep(uPush2.w * 0.4, uPush2.w, pl2)) * step(abs(uPush2.y - gy), 3.0);
vec2 bendDir = fdir * aBlade.w + wdir * windB + (pd / max(pl, 0.01)) * push * 2.5 + (pd2 / max(pl2, 0.01)) * push2 * 3.0;
float bend = min(aBlade.w * 0.7 + windB + push * 1.6 + push2 * 2.2, 1.5);
bendDir = normalize(bendDir + 1e-4);
float bl = position.y * hgt;
vec3 p = vec3(root.x, 0.0, root.y);
#ifdef SB_FLOWER
  if (head > 0.5) {
    p += vec3(position.x, 0.0, position.z) * mix(0.6, 1.25, hN) * step(0.001, hgt) * wsc;
    vHUv = vec2(aBlade.x * 0.5 + 0.5, aBlade.y - 2.0);
  } else {
    p += vec3(adir.x, 0.0, adir.y) * aBlade.x * (1.0 - 0.5 * t) * wsc;
    vHUv = vec2(0.0);
  }
#else
  p += vec3(adir.x, 0.0, adir.y) * aBlade.x * (1.0 - pow(t, 1.6)) * wsc;
  vHUv = vec2(0.0);
#endif
float k2 = tt * tt;
p.xz += bendDir * bl * bend * k2 * 0.55;
p.y += bl * (head > 0.5 ? (1.0 - 0.28 * bend) + (position.y - 0.98) : tt * (1.0 - 0.28 * bend * k2));
gPos = vec3(wxz.x, gy - 0.03, wxz.y) + p;
// normals: blade faces blended toward the sky, rounded across the blade
vec3 nB = normalize(vec3(fdir.x, 0.0, fdir.y) + vec3(adir.x, 0.0, adir.y) * sign(aBlade.x) * 0.35);
float farK = smoothstep(0.55, 0.0, lod);
vec3 objectNormal = normalize(mix(nB, vec3(0.0, 1.0, 0.0), head > 0.5 ? 0.85 : mix(0.55 + 0.25 * tt, 1.0, farK)));
vFar = farK;
// colour: the terrain's own grass/dry texture at this spot (matches the ground it grows from)
vec3 cg = textureLod(tGrassC, wxz / uTexS.x, 4.0).rgb;
vec3 cd = textureLod(tDryC, wxz / uTexS.y, 4.0).rgb;
float dryK = smoothstep(0.15, 0.85, sp.b + (gNoise(wxz * 0.11) - 0.5) * 0.4 + (fract(aOff.w * 31.7) - 0.5) * 0.5);
vGCol = mix(cg * vec3(0.88, 1.0, 1.04), cd * vec3(1.02, 1.0, 0.86), dryK) * (1.0 - sp.g * 0.25); // pulled away from yellow
vHue = aOff.w;
vGT = tt;
vHead = head;
vGW = gPos;
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(1.0, 0.0, 0.0);
#endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uSunDirG; uniform vec3 uSunColG;
varying vec3 vGCol; varying float vGT; varying vec3 vGW; varying float vHead; varying vec2 vHUv; varying float vHue; varying float vFar;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float var = mix(0.84 + 0.32 * fract(vHue * 7.13), 1.0, vFar);
  vec3 root = vGCol * mix(0.5, 1.0, vFar);
  vec3 tip = mix(vGCol * vec3(1.08, 1.2, 1.02) + vec3(0.0, 0.025, 0.006), vGCol, vFar);
  vec3 col = mix(root, tip, smoothstep(0.0, 1.0, vGT)) * var;
#ifdef SB_FLOWER
  if (vHead > 0.5) {
    vec2 q = vHUv * 2.0 - 1.0;
    float r = length(q), a = atan(q.y, q.x);
    float petals = 0.55 + 0.45 * cos(a * 5.0 + vHue * 6.0);
    if (r > 0.35 + 0.6 * petals) discard;
    float k = fract(vHue * 13.7);
    vec3 pc = k < 0.3 ? vec3(0.95, 0.78, 0.12) : k < 0.5 ? vec3(0.92, 0.92, 0.88) : k < 0.68 ? vec3(0.52, 0.32, 0.78) : k < 0.84 ? vec3(0.85, 0.22, 0.16) : vec3(0.95, 0.5, 0.12);
    col = mix(pc * 0.75, pc, smoothstep(0.2, 0.8, r));
    col = mix(vec3(0.35, 0.22, 0.05), col, smoothstep(0.16, 0.26, r));
  } else col = vGCol * vec3(0.55, 0.75, 0.45) * mix(0.5, 1.0, vGT);
#endif
  diffuseColor.rgb = col;
}`)
      .replace('#include <normal_fragment_begin>', `float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
vec3 normal = normalize(vNormal);
vec3 nonPerturbedNormal = normal;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // light shining through thin blades when the sun is behind them
  vec3 vd = normalize(vGW - cameraPosition);
  float back = pow(max(dot(vd, uSunDirG), 0.0), 3.0);
  totalEmissiveRadiance += diffuseColor.rgb * uSunColG * (0.06 + back * 0.5) * vGT * (1.0 - vHead * 0.6) * (1.0 - vFar);
}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= mix(mix(0.5, 1.0, vGT), 1.0, vFar);`);
  };
  mat.customProgramCacheKey = () => 'sbcover-' + (flower ? 'f' : 'g');
  if (flower) mat.defines = { SB_FLOWER: '' };
  return mat;
}

function makeField(surf, hn, count, R, blades, flower, seed, quality) {
  const rnd = mulberry32(seed);
  const t = tuftGeometry(blades, flower, rnd);
  if (flower) addHead(t, rnd);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(t.pos, 3));
  geo.setAttribute('aBlade', new THREE.Float32BufferAttribute(t.bl, 4));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(t.pos.length), 3));
  geo.setIndex(t.idx);
  // jittered grid: even coverage with no bare gaps or clumps
  const size = R * 2, G = Math.ceil(Math.sqrt(count)), cell = size / G;
  const off = new Float32Array(G * G * 4);
  let i = 0;
  for (let gz = 0; gz < G; gz++) for (let gx = 0; gx < G; gx++, i++) {
    off.set([(gx + 0.15 + rnd() * 0.7) * cell, (gz + 0.15 + rnd() * 0.7) * cell, rnd() * Math.PI * 2, rnd()], i * 4);
  }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  geo.instanceCount = G * G;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = makeMaterial(surf, flower);
  mat.userData.size = size; mat.userData.hn = hn;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = quality.shadows > 0;
  mesh.castShadow = false;
  mesh.userData.noReflect = true;
  mesh.userData.noHit = true;
  mesh.renderOrder = -1;
  return mesh;
}

export function createGroundCover(hm, quality, scene, surf, density = 1) {
  const P = PRESET[quality.label] || PRESET.Medium;
  // density 0: no 3D blades or flowers (the photo-scanned ground on its own); the scattered
  // pebbles, the push and the lawn/park masks still work, so nothing else has to care
  let grass = null, flowers = null;
  if (density > 0) {
    const tufts = Math.round(P.tufts * density);
    grass = makeField(surf, hm.n, tufts, P.R, P.blades, false, 7, quality);
    flowers = makeField(surf, hm.n, Math.round(tufts / 7), P.R * 0.85, 3, true, 11, quality);
    scene.add(grass, flowers);
  }
  return {
    grass, flowers,
    update(cam, sunDir, sunCol, weather) {
      coverUniforms.uCam.value.copy(cam);
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
