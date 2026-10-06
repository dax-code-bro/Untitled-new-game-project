// Depth pre-pass + GTAO (ground-truth ambient occlusion) + screen-space
// contact shadows, at half resolution, then an edge-aware 4x4 denoise.
// The result is read by every lit material during the main pass
// (materials.js): AO darkens only the indirect light, contact shadows only
// the sun.
//
// GTAO after Jimenez et al. 2016 "Practical Real-Time Strategies for Accurate
// Indirect Occlusion", in the formulation of Intel's XeGTAO (MIT): per pixel
// a few screen-space slices, the two horizon angles found by marching the
// depth buffer, clamped to the normal's hemisphere and integrated
// analytically (cosine-weighted). No temporal accumulation (every frame is a
// pure function of t), so a static 4x4 interleaved noise pattern + a 4x4
// bilateral filter replace it.
import * as THREE from 'three';
import { raw, COMMON } from './passes.js';

// half-res linear view z (one full-res depth texel per half-res pixel): better
// cache locality and no per-tap linearisation in GTAO / contact shadows
function makeDepthDownMaterial() {
  return raw(/* glsl */ `
${COMMON}
uniform highp sampler2D tDepth;
uniform float uNear, uFar;
out vec4 o;
void main() {
  float d = texelFetch(tDepth, ivec2(gl_FragCoord.xy) * 2, 0).r;
  o = vec4(d >= 0.999999 ? 1e9 : viewZ(d, uNear, uFar), 0.0, 0.0, 1.0);
}`, { tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 1000 } });
}

function makeGtaoMaterial(slices, steps) {
  return raw(/* glsl */ `
${COMMON}
#define SLICES ${slices}
#define STEPS ${steps}
#define PI 3.14159265
#define PI_HALF 1.5707963
uniform highp sampler2D tZ;       // half-res linear view z (1e9 = sky)
uniform vec2 uHalf;               // half-res size
uniform vec2 uTan;                // tan of the half field of view (x, y)
uniform mat4 uProj;
uniform float uRadius, uMaxRadiusPx, uPower;
uniform vec3 uSunView;            // direction toward the sun, view space
uniform float uContactLen, uContactOn, uContactMaxDist;
uniform int uContactSteps;
out vec4 o;
// view-space position of half-res pixel p (perspective camera, no matrix)
vec3 viewPosAt(vec2 p) {
  ivec2 ip = clamp(ivec2(p), ivec2(0), ivec2(uHalf) - 1);
  float z = texelFetch(tZ, ip, 0).r;
  vec2 ndc = (vec2(ip) + 0.5) / uHalf * 2.0 - 1.0;
  return vec3(ndc * uTan * z, -z);
}
float fastAcos(float x) {
  float r = -0.156583 * abs(x) + PI_HALF;
  r *= sqrt(1.0 - abs(x));
  return x >= 0.0 ? r : PI - r;
}
void main() {
  ivec2 hp = ivec2(gl_FragCoord.xy);
  vec2 fp = vec2(hp) + 0.5;
  float z0 = texelFetch(tZ, hp, 0).r;
  if (z0 > 1e8) { o = vec4(1.0, 1.0, z0, 1.0); return; }
  vec3 P = viewPosAt(fp);
  // normal from depth: on each axis the neighbour with the smaller depth step (no smearing across edges)
  vec3 pl = viewPosAt(fp + vec2(-1.0, 0.0)), pr = viewPosAt(fp + vec2(1.0, 0.0));
  vec3 pd = viewPosAt(fp + vec2(0.0, -1.0)), pu = viewPosAt(fp + vec2(0.0, 1.0));
  vec3 dx = abs(P.z - pl.z) < abs(pr.z - P.z) ? P - pl : pr - P;
  vec3 dy = abs(P.z - pd.z) < abs(pu.z - P.z) ? P - pd : pu - P;
  vec3 V = normalize(-P);
  vec3 N = normalize(cross(dx, dy));
  if (dot(N, V) < 0.0) N = -N;
  float z = -P.z;
  float pxPerM = uProj[1][1] * 0.5 * uHalf.y / z;     // half-res px per metre
  float rPx = min(uRadius * pxPerM, uMaxRadiusPx);
  // 4x4 interleaved noise (static per pixel): slice rotation and step offset
  float nA = fract(ign(vec2(hp)) + 0.0);
  float nS = fract(ign(vec2(hp) + vec2(5.0, 11.0)));
  float vis = 0.0;
  float effR = uRadius;
  float falloffRange = 0.615 * effR, falloffFrom = effR * (1.0 - 0.615);
  float fMul = -1.0 / falloffRange, fAdd = falloffFrom / falloffRange + 1.0;
  if (rPx < 1.5) vis = float(SLICES);
  else for (int s = 0; s < SLICES; s++) {
    float phi = (float(s) + nA) * (PI / float(SLICES));
    vec2 omega = vec2(cos(phi), sin(phi));
    vec3 dirV = vec3(omega, 0.0);
    vec3 ortho = dirV - dot(dirV, V) * V;
    vec3 axis = normalize(cross(ortho, V));
    vec3 projN = N - axis * dot(N, axis);
    float projLen = length(projN);
    float sgnN = sign(dot(ortho, projN));
    float cosN = clamp(dot(projN, V) / max(projLen, 1e-5), 0.0, 1.0);
    float n = sgnN * fastAcos(cosN);
    float low0 = cos(n + PI_HALF), low1 = cos(n - PI_HALF);
    float h0c = low0, h1c = low1;
    for (int k = 0; k < STEPS; k++) {
      float t = (float(k) + nS) / float(STEPS);
      t = t * t;
      vec2 off = round(omega * max(t * rPx, 1.0 + float(k)));
      vec3 s0 = viewPosAt(fp + off) - P;
      vec3 s1 = viewPosAt(fp - off) - P;
      float l0 = length(s0), l1 = length(s1);
      float c0 = dot(s0 / max(l0, 1e-5), V), c1 = dot(s1 / max(l1, 1e-5), V);
      c0 = mix(low0, c0, clamp(l0 * fMul + fAdd, 0.0, 1.0));
      c1 = mix(low1, c1, clamp(l1 * fMul + fAdd, 0.0, 1.0));
      h0c = max(h0c, c0); h1c = max(h1c, c1);
    }
    projLen = mix(projLen, 1.0, 0.05);
    float h0 = -fastAcos(h1c), h1 = fastAcos(h0c);
    h0 = n + clamp(h0 - n, -PI_HALF, PI_HALF);
    h1 = n + clamp(h1 - n, -PI_HALF, PI_HALF);
    float sn = sin(n);
    float ia0 = (cosN + 2.0 * h0 * sn - cos(2.0 * h0 - n)) * 0.25;
    float ia1 = (cosN + 2.0 * h1 * sn - cos(2.0 * h1 - n)) * 0.25;
    vis += projLen * (ia0 + ia1);
  }
  vis = clamp(vis / float(SLICES), 0.0, 1.0);
  vis = pow(vis, uPower);
  // contact shadow: short ray toward the sun through the depth buffer
  float contact = 1.0;
  if (uContactOn > 0.5 && z < uContactMaxDist && dot(N, uSunView) > 0.02) {
    float stepLen = uContactLen / float(uContactSteps);
    float jit = ign(vec2(hp) + vec2(3.0, 17.0));
    vec3 P0 = P + N * (0.004 * z);
    for (int k = 1; k <= 24; k++) {
      if (k > uContactSteps) break;
      vec3 Q = P0 + uSunView * stepLen * (float(k) - jit);
      vec2 sp = (Q.xy / (-Q.z * uTan) * 0.5 + 0.5) * uHalf;
      if (sp.x < 0.0 || sp.y < 0.0 || sp.x >= uHalf.x || sp.y >= uHalf.y || Q.z > -0.01) break;
      float sz = texelFetch(tZ, ivec2(sp), 0).r;
      float dz = -Q.z - sz;              // > 0: the ray point is behind what the camera sees there
      if (dz > 0.002 * z + 0.01 && dz < 0.25 + 0.02 * z) { contact = 0.0; break; }
    }
    contact = mix(contact, 1.0, smoothstep(uContactMaxDist * 0.7, uContactMaxDist, z));
  }
  o = vec4(vis, contact, z, 1.0);
}`, {
    tZ: { value: null }, uHalf: { value: new THREE.Vector2(1, 1) }, uTan: { value: new THREE.Vector2(1, 1) },
    uProj: { value: new THREE.Matrix4() },
    uRadius: { value: 1 }, uMaxRadiusPx: { value: 100 }, uPower: { value: 1 },
    uSunView: { value: new THREE.Vector3(0, 1, 0) }, uContactLen: { value: 0.4 }, uContactOn: { value: 0 }, uContactMaxDist: { value: 80 },
    uContactSteps: { value: 10 },
  });
}

// 4x4 bilateral (depth-weighted) - matches the 4x4 period of the noise
function makeDenoiseMaterial() {
  return raw(/* glsl */ `
uniform sampler2D tAO;      // r ao, g contact, b view z
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy), mx = textureSize(tAO, 0) - 1;
  vec4 c = texelFetch(tAO, p, 0);
  float zc = c.b, tol = 0.03 * zc + 0.05;
  vec2 acc = vec2(0.0); float ws = 0.0;
  for (int y = -1; y <= 2; y++) for (int x = -1; x <= 2; x++) {
    vec4 s = texelFetch(tAO, clamp(p + ivec2(x, y), ivec2(0), mx), 0);
    float w = max(0.0, 1.0 - abs(s.b - zc) / tol);
    acc += s.rg * w; ws += w;
  }
  o = vec4(acc / max(ws, 1e-4), 0.0, 1.0);
}`, { tAO: { value: null } });
}

const eligible = (o) => (o.isMesh || o.isSkinnedMesh) && o.visible && o.geometry?.attributes?.position;
const materialOk = (m) => m && m.visible !== false && !m.transparent && m.depthWrite !== false && m.colorWrite !== false && !m.isShaderMaterial && !m.isRawShaderMaterial;

export class AmbientOcclusion {
  constructor(host, cin) {
    this.h = host; this.cin = cin;
    this.depthMats = new WeakMap();
  }

  init(RW, RH) {
    const c = this.cin.c.ao;
    this.RW = RW; this.RH = RH;
    this.preRT = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false, generateMipmaps: false });
    this.preRT.depthTexture = new THREE.DepthTexture(RW, RH, THREE.FloatType);
    const HW = Math.ceil(RW / 2), HH = Math.ceil(RH / 2);
    const mk = (type, linear) => new THREE.WebGLRenderTarget(HW, HH, { type, depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: linear ? THREE.LinearFilter : THREE.NearestFilter, magFilter: linear ? THREE.LinearFilter : THREE.NearestFilter });
    this.zRT = new THREE.WebGLRenderTarget(HW, HH, { type: THREE.FloatType, format: THREE.RedFormat, depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.aoRT = mk(THREE.FloatType, false);
    this.outRT = mk(THREE.UnsignedByteType, true);
    this.pass = {
      zdown: this.h.makePass(makeDepthDownMaterial()),
      gtao: this.h.makePass(makeGtaoMaterial(Math.max(1, c.slices | 0), Math.max(1, c.steps | 0))),
      denoise: this.h.makePass(makeDenoiseMaterial()),
    };
    return this.outRT.texture;
  }

  depthMaterialFor(m) {
    let d = this.depthMats.get(m);
    if (!d) {
      d = new THREE.MeshDepthMaterial({
        depthPacking: THREE.BasicDepthPacking, side: m.side,
        map: m.alphaTest > 0 ? m.map : null, alphaMap: m.alphaTest > 0 ? m.alphaMap : null, alphaTest: m.alphaTest,
        displacementMap: m.displacementMap || null, displacementScale: m.displacementScale ?? 1, displacementBias: m.displacementBias ?? 0,
      });
      d.colorWrite = false;
      if (this.cin.c.ao.depthPrepassShare) { d.polygonOffset = true; d.polygonOffsetFactor = 1; d.polygonOffsetUnits = 1; }
      this.depthMats.set(m, d);
    }
    d.side = m.side;
    return d;
  }

  /** Depth-only pass of every opaque mesh with a built-in material. */
  prepass() {
    const { renderer, scene, camera } = this.h;
    const swapped = [], hidden = [];
    scene.traverse((o) => {
      if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite) || !o.visible) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!eligible(o) || !mats.every(materialOk)) { hidden.push(o); o.visible = false; return; }
      swapped.push([o, o.material]);
      o.material = Array.isArray(o.material) ? o.material.map((m) => this.depthMaterialFor(m)) : this.depthMaterialFor(o.material);
    });
    const bg = scene.background, ov = scene.overrideMaterial, auto = renderer.shadowMap.autoUpdate, ac = renderer.autoClear;
    scene.background = null; scene.overrideMaterial = null; renderer.shadowMap.autoUpdate = false; renderer.autoClear = true;
    try { renderer.setRenderTarget(this.preRT); renderer.render(scene, camera); }
    finally {
      scene.background = bg; scene.overrideMaterial = ov; renderer.shadowMap.autoUpdate = auto; renderer.autoClear = ac;
      for (const [o, m] of swapped) o.material = m;
      for (const o of hidden) o.visible = true;
    }
  }

  /** GTAO + contact shadows + denoise. sunWorld: direction toward the sun (or null). */
  compute(sunWorld) {
    const { camera } = this.h, c = this.cin.c.ao;
    const zu = this.pass.zdown.material.uniforms;
    zu.tDepth.value = this.preRT.depthTexture; zu.uNear.value = camera.near; zu.uFar.value = camera.far;
    this.h.drawPass(this.pass.zdown, this.zRT);
    const u = this.pass.gtao.material.uniforms;
    u.tZ.value = this.zRT.texture; u.uHalf.value.set(this.zRT.width, this.zRT.height);
    const e = camera.projectionMatrix.elements;
    u.uTan.value.set(1 / e[0], 1 / e[5]);
    u.uProj.value.copy(camera.projectionMatrix);
    u.uRadius.value = c.radius; u.uMaxRadiusPx.value = c.maxRadiusPx * this.RW * 0.5; u.uPower.value = c.intensity;
    const contact = c.contactShadows && sunWorld;
    u.uContactOn.value = contact ? 1 : 0;
    if (contact) {
      u.uSunView.value.copy(sunWorld).transformDirection(camera.matrixWorldInverse);
      u.uContactLen.value = c.contactLength; u.uContactSteps.value = Math.min(24, c.contactSteps | 0);
      u.uContactMaxDist.value = c.contactMaxDistance ?? 80;
    }
    this.h.drawPass(this.pass.gtao, this.aoRT);
    this.pass.denoise.material.uniforms.tAO.value = this.aoRT.texture;
    this.h.drawPass(this.pass.denoise, this.outRT);
  }
}
