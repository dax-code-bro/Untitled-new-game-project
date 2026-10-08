// Custom PBR materials: terrain splatting, water, wind-animated foliage, triplanar detail for structures.
// All are MeshStandardMaterial with shader hooks, so they keep three.js lighting, shadows, IBL and fog.
import * as THREE from 'three';
import { WORLD } from './terrain.js';

// shared animated uniforms (updated once per frame by the game)
export const SHARED = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(0.8, 0.35) },
  uWindStrength: { value: 1 },
  uWet: { value: 0 },
};

const hook = (m, key, fn) => { m.userData.cacheKey = key; (m.userData.hooks = m.userData.hooks || []).push(fn); return m; };

// ---------------------------------------------------------------- terrain
const TERRAIN_FN = /* glsl */`
uniform sampler2DArray tAlb; uniform sampler2DArray tNr; uniform float uWet;
varying vec4 vSplatA; varying vec4 vSplatB; varying vec3 vTWorld; varying vec3 vTNormal;
struct TerrainSample { vec3 alb; vec3 n; float rough; };
vec3 unpackN(vec4 t) { return t.xyz * 2.0 - 1.0; }
TerrainSample terrainSample() {
  vec3 N = normalize(vTNormal);
  float w[7];
  w[1] = vSplatA.x; w[2] = vSplatA.y; w[3] = vSplatA.z; w[4] = vSplatA.w; w[5] = vSplatB.x; w[6] = vSplatB.y;
  w[0] = max(0.0, 1.0 - (w[1] + w[2] + w[3] + w[4] + w[5] + w[6]));
  float dist = length(vTWorld - cameraPosition);
  float farK = smoothstep(20.0, 180.0, dist);
  vec2 uvA = vTWorld.xz * 0.28, uvB = vTWorld.xz * 0.033, uvC = vTWorld.xz * 0.0041;
  vec3 bw = pow(abs(N), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
  vec3 alb = vec3(0.0), nW = vec3(0.0); float rough = 0.0, tot = 0.0;
  for (int i = 0; i < 7; i++) {
    float wi = w[i];
    if (wi < 0.003) continue;
    float L = float(i);
    vec4 a; float r; vec3 n;
    if (i == 4) {
      float s = 0.15;
      vec4 aX = texture(tAlb, vec3(vTWorld.zy * s, L)), aY = texture(tAlb, vec3(vTWorld.xz * s, L)), aZ = texture(tAlb, vec3(vTWorld.xy * s, L));
      vec4 nX = texture(tNr, vec3(vTWorld.zy * s, L)), nY = texture(tNr, vec3(vTWorld.xz * s, L)), nZ = texture(tNr, vec3(vTWorld.xy * s, L));
      a = aX * bw.x + aY * bw.y + aZ * bw.z;
      vec3 tX = unpackN(nX), tY = unpackN(nY), tZ = unpackN(nZ);
      tX = vec3(tX.xy + N.zy, abs(tX.z) * N.x);
      tY = vec3(tY.xy + N.xz, abs(tY.z) * N.y);
      tZ = vec3(tZ.xy + N.xy, abs(tZ.z) * N.z);
      n = normalize(tX.zyx * bw.x + tY.xzy * bw.y + tZ.xyz * bw.z);
      r = nX.a * bw.x + nY.a * bw.y + nZ.a * bw.z;
    } else {
      vec4 a1 = texture(tAlb, vec3(uvA, L)), a2 = texture(tAlb, vec3(uvB, L)), a3 = texture(tAlb, vec3(uvC, L));
      vec4 n1 = texture(tNr, vec3(uvA, L)), n2 = texture(tNr, vec3(uvB, L));
      a = mix(a1, a2, 0.35 + farK * 0.45);
      a.rgb *= 0.78 + 0.44 * dot(a3.rgb, vec3(0.333)) / max(dot(a2.rgb, vec3(0.333)), 0.05) * 0.5; // macro variation
      vec4 nr = mix(n1, n2, 0.3 + farK * 0.5);
      vec3 t = unpackN(nr); t.xy *= 1.0 - farK * 0.5;
      vec3 tY = vec3(t.xy + N.xz, abs(t.z) * N.y);
      n = normalize(tY.xzy);
      r = nr.a;
    }
    alb += a.rgb * wi; nW += n * wi; rough += r * wi; tot += wi;
  }
  alb /= tot; nW = normalize(nW); rough /= tot;
  float wet = max(vSplatB.z, uWet * clamp(N.y, 0.0, 1.0));
  alb *= mix(1.0, 0.6, wet);
  rough = mix(rough, 0.16, wet);
  TerrainSample ts; ts.alb = alb; ts.n = nW; ts.rough = clamp(rough, 0.04, 1.0);
  return ts;
}`;

export function terrainMaterial(arr) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  return hook(m, 'terrain', (s) => {
    s.uniforms.tAlb = { value: arr.alb };
    s.uniforms.tNr = { value: arr.nr };
    s.uniforms.uWet = SHARED.uWet;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splatA; attribute vec4 splatB; varying vec4 vSplatA; varying vec4 vSplatB; varying vec3 vTWorld; varying vec3 vTNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplatA = splatA; vSplatB = splatB; vTWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vTNormal = normalize(mat3(modelMatrix) * objectNormal);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + TERRAIN_FN)
      .replace('#include <color_fragment>', 'TerrainSample ts = terrainSample();\nvec3 tint = vColor / max(dot(vColor, vec3(0.3333)), 0.03);\ndiffuseColor.rgb = ts.alb * mix(vec3(1.0), tint, 0.16);')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = ts.rough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(ts.n, 0.0)).xyz);');
  });
}

// ---------------------------------------------------------------- water
// ocean: waves near the camera + shore foam from the heightmap; lakes: calm.
export function waterMaterial(T, heightTex, { ocean = true } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0x0a3550, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.92, envMapIntensity: 1.1 });
  m.userData.heightTex = heightTex;
  return hook(m, ocean ? 'ocean' : 'lake', (s) => {
    s.uniforms.uTime = SHARED.uTime;
    s.uniforms.tWN = { value: T.water.nr };
    s.uniforms.tHeight = heightTex;
    s.uniforms.uLevel = { value: ocean ? WORLD.sea : WORLD.lake };
    s.uniforms.uSpan = { value: WORLD.size };
    s.uniforms.uAmp = { value: ocean ? 1 : 0.06 };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uAmp; varying vec3 vWW; varying float vWave;
        // directional waves: (dir.x, dir.y, wavelength, amplitude)
        const vec4 WAVES[5] = vec4[5](vec4(1.0, 0.25, 70.0, 0.55), vec4(0.6, -0.8, 38.0, 0.32), vec4(-0.3, 1.0, 21.0, 0.18), vec4(0.9, 0.5, 11.0, 0.09), vec4(-0.7, -0.4, 6.5, 0.05));
        float waveAt(vec2 p, out vec2 grad) {
          float h = 0.0; grad = vec2(0.0);
          for (int i = 0; i < 5; i++) {
            vec2 d = normalize(WAVES[i].xy); float k = 6.2831 / WAVES[i].z; float c = sqrt(9.8 / k);
            float ph = k * dot(d, p) - k * c * uTime;
            h += WAVES[i].w * sin(ph);
            grad += WAVES[i].w * k * d * cos(ph);
          }
          return h;
        }`)
      .replace('#include <beginnormal_vertex>', `
        vec3 wpos0 = (modelMatrix * vec4(position, 1.0)).xyz;
        float wfade = uAmp * (1.0 - smoothstep(250.0, 2500.0, length(wpos0.xz - cameraPosition.xz)));
        vec2 wgrad; float wh = waveAt(wpos0.xz, wgrad) * wfade; wgrad *= wfade;
        vec3 objectNormal = normalize(vec3(-wgrad.x, 1.0, -wgrad.y));
        vWave = wh;
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += wh;\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform sampler2D tWN; uniform sampler2D tHeight; uniform float uLevel; uniform float uSpan;
        varying vec3 vWW; varying float vWave;
        float hDecode(vec2 uv) { vec4 t = texture2D(tHeight, uv); return (t.r * 255.0 * 256.0 + t.g * 255.0) / 65535.0 * 2700.0 - 60.0; }
        float terrainH(vec2 p) {
          vec2 res = vec2(textureSize(tHeight, 0));
          vec2 uv = (p + uSpan * 0.5) / uSpan * res - 0.5;
          vec2 f = fract(uv); vec2 i = floor(uv);
          float a = hDecode((i + vec2(0.5, 0.5)) / res), b = hDecode((i + vec2(1.5, 0.5)) / res);
          float c = hDecode((i + vec2(0.5, 1.5)) / res), d = hDecode((i + vec2(1.5, 1.5)) / res);
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }`)
      .replace('#include <color_fragment>', `
        float depth = uLevel - terrainH(vWW.xz);
        vec3 shallow = vec3(0.10, 0.42, 0.42), deep = vec3(0.012, 0.075, 0.13);
        diffuseColor.rgb = mix(shallow, deep, smoothstep(0.5, 22.0, depth));
        float fn = texture2D(tWN, vWW.xz * 0.05 + uTime * 0.02).r;
        float foam = smoothstep(1.8, 0.1, depth) * (0.55 + 0.45 * sin(uTime * 1.6 - depth * 3.5 + fn * 6.0));
        foam = max(foam, smoothstep(0.55, 0.85, vWave) * 0.6) * step(0.0, depth + 0.3);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 0.96), clamp(foam, 0.0, 1.0));
        diffuseColor.a = clamp(mix(0.45, 0.94, smoothstep(0.0, 5.0, depth)) + foam, 0.0, 1.0);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(roughness, 0.7, clamp(foam, 0.0, 1.0));')
      .replace('#include <normal_fragment_maps>', `
        vec2 r1 = texture2D(tWN, vWW.xz * 0.045 + vec2(uTime * 0.018, uTime * 0.011)).xy * 2.0 - 1.0;
        vec2 r2 = texture2D(tWN, vWW.xz * 0.11 - vec2(uTime * 0.025, -uTime * 0.017)).xy * 2.0 - 1.0;
        vec2 r3 = texture2D(tWN, vWW.xz * 0.0071 + vec2(uTime * 0.004, 0.0)).xy * 2.0 - 1.0;
        float rd = 1.0 - smoothstep(60.0, 900.0, length(vWW - cameraPosition));
        vec3 wn = normalize(vec3((r1.x + r2.x) * 0.22 * rd + r3.x * 0.15, 1.0, (r1.y + r2.y) * 0.22 * rd + r3.y * 0.15));
        normal = normalize(normal + (viewMatrix * vec4(wn - vec3(0.0, 1.0, 0.0), 0.0)).xyz);`);
  });
}

// Concentric ring mesh: dense near the camera, coarse to the horizon (follows the camera).
export function oceanGeometry() {
  const segs = 160, radii = [0];
  let r = 2;
  while (r < 120000) { radii.push(r); r = r < 60 ? r + 2 : r * 1.07; }
  const pos = [], idx = [];
  for (let i = 0; i < radii.length; i++) for (let j = 0; j < segs; j++) {
    const a = (j / segs) * Math.PI * 2;
    pos.push(Math.cos(a) * radii[i], 0, Math.sin(a) * radii[i]);
  }
  for (let i = 0; i < radii.length - 1; i++) for (let j = 0; j < segs; j++) {
    const a = i * segs + j, b = i * segs + ((j + 1) % segs), c = (i + 1) * segs + j, d = (i + 1) * segs + ((j + 1) % segs);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 130000);
  return g;
}

// ---------------------------------------------------------------- wind (foliage, grass, tree trunks)
// height: model height used to scale sway; flutter: leaf flutter amount
export function windHook(m, { height = 10, sway = 0.6, flutter = 0.08, key = 'wind' } = {}) {
  return hook(m, key, (s) => {
    s.uniforms.uTime = SHARED.uTime;
    s.uniforms.uWind = SHARED.uWind;
    s.uniforms.uWindStrength = SHARED.uWindStrength;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uWind; uniform float uWindStrength;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float ph = ip.x * 0.13 + ip.z * 0.17;
          float hk = clamp(position.y / ${height.toFixed(1)}, 0.0, 1.5); hk *= hk;
          float gust = 0.6 + 0.4 * sin(uTime * 0.35 + ip.x * 0.01 + ip.z * 0.013);
          float sw = (sin(uTime * 1.3 + ph) * 0.7 + sin(uTime * 2.7 + ph * 1.7) * 0.3) * ${sway.toFixed(3)} * hk * gust * uWindStrength;
          transformed.xz += uWind * sw;
          transformed += normal * sin(uTime * 7.0 + dot(position, vec3(3.1, 1.7, 2.3)) + ph) * ${flutter.toFixed(3)} * hk * uWindStrength;
        }`);
  });
}

// ---------------------------------------------------------------- triplanar detail for vertex-colored structures
export function detailMaterial(T, { metal = false } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: metal ? 0.45 : 0.85, metalness: metal ? 0.6 : 0 });
  return hook(m, metal ? 'detail-metal' : 'detail', (s) => {
    s.uniforms.tDA = { value: T.concrete.map };
    s.uniforms.tDN = { value: T.concrete.nr };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDW; varying vec3 vDN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDW = (modelMatrix * vec4(transformed, 1.0)).xyz; vDN = normalize(mat3(modelMatrix) * objectNormal);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tDA; uniform sampler2D tDN; varying vec3 vDW; varying vec3 vDN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 dbw = pow(abs(vDN), vec3(4.0)); dbw /= dbw.x + dbw.y + dbw.z;
        float sc = 0.5;
        vec3 dA = texture2D(tDA, vDW.zy * sc).rgb * dbw.x + texture2D(tDA, vDW.xz * sc).rgb * dbw.y + texture2D(tDA, vDW.xy * sc).rgb * dbw.z;
        float dl = dot(dA, vec3(0.333));
        diffuseColor.rgb *= 0.55 + dl * 1.1;`)
      .replace('#include <normal_fragment_maps>', `
        vec3 nX = texture2D(tDN, vDW.zy * sc).xyz * 2.0 - 1.0, nY = texture2D(tDN, vDW.xz * sc).xyz * 2.0 - 1.0, nZ = texture2D(tDN, vDW.xy * sc).xyz * 2.0 - 1.0;
        vec3 N0 = normalize(vDN);
        nX = vec3(nX.xy + N0.zy, abs(nX.z) * N0.x); nY = vec3(nY.xy + N0.xz, abs(nY.z) * N0.y); nZ = vec3(nZ.xy + N0.xy, abs(nZ.z) * N0.z);
        vec3 dn = normalize(nX.zyx * dbw.x + nY.xzy * dbw.y + nZ.xyz * dbw.z);
        normal = normalize((viewMatrix * vec4(dn, 0.0)).xyz);`);
  });
}

// Height texture holder: filled asynchronously by the terrain worker.
export function heightTexture() {
  const data = new Uint8Array(4 * 4).fill(0);
  const t = new THREE.DataTexture(data, 2, 2, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return { value: t };
}

// ---------------------------------------------------------------- alpha-tested foliage that keeps its coverage when mipmapped
// (without this, leaf cards thin out to bare sticks in the distance)
export function coverageHook(m, size = 512) {
  m.userData.hooks.push((s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <alphatest_fragment>', `
      #ifdef USE_MAP
        { vec2 dd = fwidth(vMapUv) * ${size.toFixed(1)}; diffuseColor.a *= 1.0 + max(0.0, log2(max(dd.x, dd.y))) * 0.33; }
      #endif
      #include <alphatest_fragment>`);
  });
  m.userData.cacheKey += '-cov';
  return m;
}
