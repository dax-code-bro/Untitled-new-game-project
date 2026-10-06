// Volumetric fog in camera-aligned froxels (cinematic stack): height fog,
// drifting 3D noise, mist banks (the prologue fog, the Slitherwing's mist
// bank), lit by the sun THROUGH ITS SHADOW MAP (real god rays through trees,
// castle crenellations, dragon wings, cliff edges) and through moving cloud
// shadows, plus the sky's ambient light. After Wronski 2014 / Hillaire 2015
// (Frostbite): inject per froxel, integrate front-to-back, look up per pixel.
//
// Grid: X x Y froxels across the screen, Z slices spaced exponentially from
// `near` to `range`, stored as a 2D atlas X x (Y * Z). Integration is a
// Hillis-Steele prefix scan over the slices (log2 Z passes) with the
// associative "in front of" operator (S1 + T1 * S2, T1 * T2). Everything is
// a pure function of t (the noise drifts with t * wind).
import * as THREE from 'three';
import { raw, COMMON } from './passes.js';

const MAX_BANKS = 8;

// 64^3 tileable 3D value-noise fbm (R8), seeded - the density noise
function makeNoise3D(seed = 7) {
  const N = 64, data = new Uint8Array(N * N * N);
  const hash = (x, y, z, o) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(o + seed, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const f = new Float32Array(N * N * N);
  let lo = Infinity, hi = -Infinity;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, amp = 0.5;
    for (let o = 0; o < 4; o++) {
      const P = 4 << o;
      const fx = (x / N) * P, fy = (y / N) * P, fz = (z / N) * P;
      const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
      const ux = fx - ix, uy = fy - iy, uz = fz - iz;
      const sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy), sz = uz * uz * (3 - 2 * uz);
      let v = 0;
      for (let k = 0; k < 8; k++) {
        const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
        const w = (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
        v += w * hash((ix + dx) % P, (iy + dy) % P, (iz + dz) % P, o);
      }
      s += amp * v; amp *= 0.5;
    }
    const i = x + N * (y + N * z);
    f[i] = s; lo = Math.min(lo, s); hi = Math.max(hi, s);
  }
  for (let i = 0; i < f.length; i++) data[i] = Math.round(((f[i] - lo) / (hi - lo)) * 255);
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RedFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

// 256^2 tileable 2D fbm (R8) - cloud shadows (shared with the material patch)
export function makeCloudTexture(seed = 3) {
  const N = 256, data = new Uint8Array(N * N);
  const hash = (x, y, o) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(o + seed, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const f = new Float32Array(N * N);
  let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, amp = 0.5;
    for (let o = 0; o < 6; o++) {
      const P = 4 << o, fx = (x / N) * P, fy = (y / N) * P, ix = Math.floor(fx), iy = Math.floor(fy);
      const ux = fx - ix, uy = fy - iy, sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
      const a = hash(ix % P, iy % P, o), b = hash((ix + 1) % P, iy % P, o), c = hash(ix % P, (iy + 1) % P, o), d = hash((ix + 1) % P, (iy + 1) % P, o);
      s += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy); amp *= 0.5;
    }
    f[y * N + x] = s; lo = Math.min(lo, s); hi = Math.max(hi, s);
  }
  for (let i = 0; i < f.length; i++) data[i] = Math.round(((f[i] - lo) / (hi - lo)) * 255);
  const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

function makeInjectMaterial(soft = false, noiseLod = false) {
  return raw(/* glsl */ `
${COMMON}
${THREE.ShaderChunk.packing}
precision highp sampler3D;
uniform vec3 uGrid;
uniform vec2 uRange;                 // near, far (m)
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uDensity, uFalloff, uFogBase, uNoiseScale, uNoiseAmount;
uniform vec3 uWind;
uniform vec3 uAlbedo;
uniform float uG;
uniform sampler3D tNoise;
uniform int uBankCount;
uniform vec4 uBankC[${MAX_BANKS}];   // centre xyz, density
uniform vec4 uBankR[${MAX_BANKS}];   // radii xyz, noise amount
uniform vec3 uSunDir;
uniform vec3 uSunColor;              // colour * intensity of the sun light
uniform sampler2D tShadowNear, tShadowFar;
uniform mat4 uShadowMatNear, uShadowMatFar;
uniform float uShadowOn, uShadowBias;
uniform vec2 uShadowSoftUV;
uniform float uFroxelAngle;
uniform sampler2D tCloud;
uniform vec4 uCloud;                 // coverage, softness, opacity, altitude
uniform vec4 uCloudXf;               // scale, offset x, offset z, enabled
uniform sampler2D tAmbient;          // 1x1 sky radiance (physical sky) ...
uniform vec3 uAmbient;               // ... or a fixed colour
uniform float uAmbientFromSky;
uniform float uIntensity;
out vec4 o;
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }
float shadowAt(sampler2D m, mat4 M, vec3 p) {
  vec4 sc = M * vec4(p, 1.0);
  vec3 s = sc.xyz / sc.w;
  if (s.x < 0.0 || s.y < 0.0 || s.x > 1.0 || s.y > 1.0 || s.z > 1.0) return -1.0;
#ifdef DK_VOL_SOFT
  // soft shadow lookup (volumetrics.shadowSoftness metres): a 16-tap disk in the light's
  // frame, so a thin caster's shadow column fades smoothly across froxels and slices
  float acc = 0.0;
  for (int i = 0; i < 16; i++) {
    float a = float(i) * 2.39996323, r = sqrt((float(i) + 0.5) / 16.0);
    vec2 o = vec2(cos(a), sin(a)) * r * uShadowSoftUV;
    float d = unpackRGBAToDepth(texture(m, s.xy + o));
    acc += s.z - uShadowBias <= d ? 1.0 : 0.0;
  }
  return acc / 16.0;
#else
  float d = unpackRGBAToDepth(texture(m, s.xy));
  return s.z - uShadowBias <= d ? 1.0 : 0.0;
#endif
}
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  int Y = int(uGrid.y);
  int slice = ip.y / Y;
  vec2 uv = (vec2(ip.x, ip.y - slice * Y) + 0.5) / uGrid.xy;
  vec4 w = uInvViewProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dir = normalize(w.xyz / w.w - uCamPos);
  float lr = log(uRange.y / uRange.x);
  float d0 = uRange.x * exp(lr * float(slice) / uGrid.z), d1 = uRange.x * exp(lr * float(slice + 1) / uGrid.z);
  float dist = 0.5 * (d0 + d1), thick = d1 - d0;
  vec3 p = uCamPos + dir * dist;
  // density: height fog modulated by drifting noise, plus mist banks
  vec3 np = p * uNoiseScale + uWind * uTime * uNoiseScale;
#ifdef DK_VOL_NOISE_LOD
  // noise filtered to the froxel's footprint (mip-mapped 3D noise): detail finer than a froxel
  // (thin slices far away are ~100 m deep) is averaged instead of aliasing into blocks
  float fpT = max(thick * 0.5, dist * uFroxelAngle) * uNoiseScale * 64.0;
  float lod = log2(max(fpT, 1.0));
  float n = textureLod(tNoise, np, lod).r * 0.7 + textureLod(tNoise, np * 2.93 + 0.31, lod + 1.55).r * 0.3;
#else
  float n = texture(tNoise, np).r * 0.7 + texture(tNoise, np * 2.93 + 0.31).r * 0.3;
#endif
  float sig = uDensity * exp(-uFalloff * clamp(p.y - uFogBase, -40.0, 400.0));
  sig *= max(0.0, 1.0 - uNoiseAmount + 2.0 * uNoiseAmount * n);
  for (int i = 0; i < ${MAX_BANKS}; i++) {
    if (i >= uBankCount) break;
    vec3 q = (p - uBankC[i].xyz) / uBankR[i].xyz;
    float r = length(q);
    if (r > 1.6) continue;
    // soft, noise-eroded edge: wisps where the noise is high, gaps where it is low
    float edge = clamp((1.0 - r) * 2.2 + (n - 0.5) * 2.0 * uBankR[i].w, 0.0, 1.0);
    sig += uBankC[i].w * edge * edge * mix(1.0, 0.4 + 1.2 * n, uBankR[i].w);
  }
  if (sig <= 1e-7) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  // light: the sun (shadow map + cloud shadows) and the sky
  float vis = 1.0;
  if (uShadowOn > 0.5) {
    float s = shadowAt(tShadowNear, uShadowMatNear, p);
    if (s < 0.0) s = shadowAt(tShadowFar, uShadowMatFar, p);
    vis = s < 0.0 ? 1.0 : s;
  }
  if (uCloudXf.w > 0.5 && uSunDir.y > 0.01) {
    vec2 cp = p.xz + uSunDir.xz / uSunDir.y * (uCloud.w - p.y);
    vec2 cuv = cp * uCloudXf.x + uCloudXf.yz;
    float cn = texture(tCloud, cuv).r * 0.7 + texture(tCloud, cuv * 3.1 + 0.37).r * 0.3;
    vis *= 1.0 - smoothstep(1.0 - uCloud.x - uCloud.y, 1.0 - uCloud.x + uCloud.y, cn) * uCloud.z;
  }
  vec3 amb = uAmbientFromSky > 0.5 ? texelFetch(tAmbient, ivec2(0), 0).rgb : uAmbient;
  vec3 Lin = uSunColor * hg(dot(dir, uSunDir), uG) * vis + amb;
  vec3 sigS = uAlbedo * sig;
  float T = exp(-sig * thick);
  vec3 S = sigS * Lin * (1.0 - T) / sig * uIntensity;
  o = vec4(S, T);
}`, {
    uGrid: { value: new THREE.Vector3(1, 1, 1) }, uRange: { value: new THREE.Vector2(0.5, 500) },
    uInvViewProj: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() }, uTime: { value: 0 },
    uDensity: { value: 0 }, uFalloff: { value: 0.05 }, uFogBase: { value: 0 }, uNoiseScale: { value: 0.03 }, uNoiseAmount: { value: 0.5 },
    uWind: { value: new THREE.Vector3() }, uAlbedo: { value: new THREE.Vector3(0.95, 0.95, 0.95) }, uG: { value: 0.6 },
    tNoise: { value: null },
    uBankCount: { value: 0 },
    uBankC: { value: Array.from({ length: MAX_BANKS }, () => new THREE.Vector4()) },
    uBankR: { value: Array.from({ length: MAX_BANKS }, () => new THREE.Vector4(1, 1, 1, 0)) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 1, 1) },
    tShadowNear: { value: null }, tShadowFar: { value: null }, uShadowMatNear: { value: new THREE.Matrix4() }, uShadowMatFar: { value: new THREE.Matrix4() },
    uShadowOn: { value: 0 }, uShadowBias: { value: 0.002 }, uShadowSoftUV: { value: new THREE.Vector2() }, uFroxelAngle: { value: 0.005 },
    tCloud: { value: null }, uCloud: { value: new THREE.Vector4(0.5, 0.2, 0.8, 1500) }, uCloudXf: { value: new THREE.Vector4(0.001, 0, 0, 0) },
    tAmbient: { value: null }, uAmbient: { value: new THREE.Vector3(0.3, 0.35, 0.42) }, uAmbientFromSky: { value: 0 },
    uIntensity: { value: 1 },
  }, { ...(soft ? { DK_VOL_SOFT: 1 } : {}), ...(noiseLod ? { DK_VOL_NOISE_LOD: 1 } : {}) });
}

function makeScanMaterial() {
  return raw(/* glsl */ `
uniform sampler2D tSrc;
uniform int uOffset;     // slices
uniform int uY;
out vec4 o;
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec4 b = texelFetch(tSrc, ip, 0);
  int slice = ip.y / uY;
  if (slice >= uOffset) {
    vec4 a = texelFetch(tSrc, ip - ivec2(0, uOffset * uY), 0);   // the medium in front
    b = vec4(a.rgb + a.a * b.rgb, a.a * b.a);
  }
  o = b;
}`, { tSrc: { value: null }, uOffset: { value: 1 }, uY: { value: 1 } });
}

export class Volumetrics {
  constructor(host, cin) { this.h = host; this.cin = cin; this.c = cin.c.volumetrics; }

  init(cloudTex) {
    const [X, Y, Z] = this.c.resolution;
    this.grid = [X, Y, Z];
    const mk = () => new THREE.WebGLRenderTarget(X, Y * Z, { type: THREE.FloatType, depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
    this.rtA = mk(); this.rtB = mk();
    this.noise = makeNoise3D();
    if (this.c.noiseFilter) { this.noise.generateMipmaps = true; this.noise.minFilter = THREE.LinearMipmapLinearFilter; this.noise.needsUpdate = true; }
    this.cloudTex = cloudTex;
    this.pass = { inject: this.h.makePass(makeInjectMaterial((this.c.shadowSoftness || 0) > 0, !!this.c.noiseFilter)), scan: this.h.makePass(makeScanMaterial()) };
    return this;
  }

  /** After the main pass (the sun's shadow maps are current). */
  render(t, { sun, sunDir, cascades, atmosphere }) {
    const c = this.c, cam = this.h.camera, [X, Y, Z] = this.grid;
    const u = this.pass.inject.material.uniforms;
    u.uGrid.value.set(X, Y, Z);
    u.uRange.value.set(c.near, c.range);
    u.uFroxelAngle.value = (cam.isPerspectiveCamera ? THREE.MathUtils.degToRad(cam.fov) : 1) / Y;
    cam.updateMatrixWorld();
    u.uInvViewProj.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert();
    u.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
    u.uTime.value = t;
    u.uDensity.value = c.density; u.uFalloff.value = c.heightFalloff; u.uFogBase.value = c.fogBase;
    u.uNoiseScale.value = c.noiseScale; u.uNoiseAmount.value = c.noiseAmount;
    u.uWind.value.fromArray(c.wind); u.uAlbedo.value.fromArray(c.albedo); u.uG.value = c.anisotropy;
    u.tNoise.value = this.noise;
    const banks = (c.banks || []).slice(0, MAX_BANKS);
    u.uBankCount.value = banks.length;
    banks.forEach((b, i) => {
      const r = Array.isArray(b.radius) ? b.radius : [b.radius, b.radius, b.radius];
      u.uBankC.value[i].set(b.center[0], b.center[1], b.center[2], b.density ?? 0.02);
      u.uBankR.value[i].set(r[0], r[1], r[2], b.noise ?? 0.7);
    });
    u.uSunDir.value.copy(sunDir || new THREE.Vector3(0, 1, 0));
    if (sun) u.uSunColor.value.copy(sun.color).multiplyScalar(sun.intensity * (sun.visible ? 1 : 0)); else u.uSunColor.value.setRGB(0, 0, 0);
    // shadow maps: nearest cascade / the sun's own map, and the widest cascade as a fallback
    const lights = cascades?.length ? cascades : sun ? [sun] : [];
    const nearL = lights[0], farL = lights[lights.length - 1];
    const ok = (l) => l && l.castShadow && l.shadow?.map?.texture;
    u.uShadowOn.value = c.sunShadows && ok(nearL) ? 1 : 0;
    if (u.uShadowOn.value) {
      u.tShadowNear.value = nearL.shadow.map.texture; u.uShadowMatNear.value.copy(nearL.shadow.matrix);
      const sc = nearL.shadow.camera;
      if (c.shadowSoftness > 0 && sc.isOrthographicCamera) u.uShadowSoftUV.value.set(c.shadowSoftness / Math.max(1e-6, (sc.right - sc.left) / sc.zoom), c.shadowSoftness / Math.max(1e-6, (sc.top - sc.bottom) / sc.zoom));
      const f = ok(farL) ? farL : nearL;
      u.tShadowFar.value = f.shadow.map.texture; u.uShadowMatFar.value.copy(f.shadow.matrix);
    }
    const cs = c.cloudShadows;
    if (cs) {
      u.tCloud.value = this.cloudTex;
      u.uCloud.value.set(cs.coverage ?? 0.5, cs.softness ?? 0.2, cs.opacity ?? 0.85, cs.altitude ?? 1500);
      const sp = cs.speed || [8, 0];
      u.uCloudXf.value.set(cs.scale ?? 0.0012, (sp[0] * t) * (cs.scale ?? 0.0012), (sp[1] * t) * (cs.scale ?? 0.0012), 1);
    } else u.uCloudXf.value.w = 0;
    if (atmosphere) { u.tAmbient.value = atmosphere.ambRT.texture; u.uAmbientFromSky.value = 1; }
    else { u.uAmbientFromSky.value = 0; u.uAmbient.value.fromArray(c.ambient || this.ambientFromScene()); }
    u.uIntensity.value = c.intensity;
    this.h.drawPass(this.pass.inject, this.rtA);
    // prefix scan over the slices
    let src = this.rtA, dst = this.rtB;
    const su = this.pass.scan.material.uniforms;
    for (let off = 1; off < Z; off *= 2) {
      su.tSrc.value = src.texture; su.uOffset.value = off; su.uY.value = Y;
      this.h.drawPass(this.pass.scan, dst);
      [src, dst] = [dst, src];
    }
    this.result = src;
    return src;
  }

  ambientFromScene() {
    if (this._amb) return this._amb;
    let hemi = null;
    this.h.scene.traverse((o) => { if (!hemi && o.isHemisphereLight) hemi = o; });
    this._amb = hemi ? [hemi.color.r, hemi.color.g, hemi.color.b].map((v) => (v * hemi.intensity) / Math.PI) : [0.25, 0.3, 0.38];
    return this._amb;
  }

  bindResolve(u) {
    if (!this.result) return;
    u.tVol.value = this.result.texture;
    u.uVolGrid.value.set(...this.grid);
    u.uVolRange.value.set(this.c.near, this.c.range);
  }
}
