// Physically based sky + aerial perspective (cinematic stack).
//
// After S. Hillaire, "A Scalable and Production Ready Sky and Atmosphere
// Rendering Technique" (EGSR 2020) and its public reference implementation
// (MIT): Rayleigh + Mie + ozone in a spherical planet atmosphere, four LUTs:
//   transmittance  256x64   once per atmosphere setting
//   multi-scatter   32x32   once per atmosphere setting (all orders of scattering)
//   sky-view       192x108  per frame (sun / camera height)  -> the sky dome
//   aerial persp.  32^3     per frame (camera frustum)      -> haze on geometry
// The same atmosphere colours the sun light (transmittance toward the sun: a
// low sun turns orange by itself), lights the volumetric fog (ambient) and
// gives the scene a matching environment map for reflections.
// Distances inside the LUT shaders are kilometres; the scene is in metres.
import * as THREE from 'three';
import { raw, COMMON } from './passes.js';

const RG = 6360, RT = 6460;                       // km
const RAYLEIGH = [5.802e-3, 13.558e-3, 33.1e-3];  // scattering per km at sea level
const MIE_SCAT = 3.996e-3, MIE_EXT = 4.40e-3;     // per km
const OZONE = [0.650e-3, 1.881e-3, 0.085e-3];      // absorption per km at the peak (25 km)
const SUN_ANGULAR_RADIUS = 0.004675;               // rad (0.2678 deg)

export const ATMO_GLSL = /* glsl */ `
#define PI 3.14159265
uniform float uRayMul, uMieMul, uMieG;
uniform vec3 uGroundAlbedo;
const float Rg = ${RG.toFixed(1)}, Rt = ${RT.toFixed(1)};
const vec3 RAY_SCAT = vec3(${RAYLEIGH.join(', ')});
const float MIE_SCAT = ${MIE_SCAT}, MIE_EXT = ${MIE_EXT};
const vec3 OZONE_ABS = vec3(${OZONE.join(', ')});
struct Medium { vec3 scat; vec3 scatR; vec3 scatM; vec3 ext; };
Medium mediumAt(float r) {
  float h = max(r - Rg, 0.0);
  float dR = exp(-h / 8.0) * uRayMul, dM = exp(-h / 1.2) * uMieMul, dO = max(0.0, 1.0 - abs(h - 25.0) / 15.0);
  Medium m;
  m.scatR = RAY_SCAT * dR; m.scatM = vec3(MIE_SCAT * dM);
  m.scat = m.scatR + m.scatM;
  m.ext = m.scatR + vec3(MIE_EXT * dM) + OZONE_ABS * dO;
  return m;
}
// nearest intersection t >= 0 of a ray (origin relative to the planet centre) with a sphere, -1 if none
float raySphere(vec3 ro, vec3 rd, float R) {
  float b = dot(ro, rd), c = dot(ro, ro) - R * R, d = b * b - c;
  if (d < 0.0) return -1.0;
  float s = sqrt(d), t0 = -b - s, t1 = -b + s;
  if (t0 >= 0.0) return t0;
  if (t1 >= 0.0) return t1;
  return -1.0;
}
float rayleighPhase(float c) { return 3.0 / (16.0 * PI) * (1.0 + c * c); }
float miePhase(float c, float g) {   // Cornette-Shanks
  float g2 = g * g;
  return 3.0 / (8.0 * PI) * (1.0 - g2) * (1.0 + c * c) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}
float fromUnitToSubUvs(float u, float res) { return (u + 0.5 / res) * (res / (res + 1.0)); }
float fromSubUvsToUnit(float u, float res) { return (u - 0.5 / res) * (res / (res - 1.0)); }
vec2 transmittanceUv(float r, float mu) {
  float H = sqrt(max(0.0, Rt * Rt - Rg * Rg));
  float rho = sqrt(max(0.0, r * r - Rg * Rg));
  float disc = r * r * (mu * mu - 1.0) + Rt * Rt;
  float d = max(0.0, -r * mu + sqrt(max(disc, 0.0)));
  float dmin = Rt - r, dmax = rho + H;
  return vec2((d - dmin) / max(dmax - dmin, 1e-6), rho / H);
}
`;

const TRANSMITTANCE_FS = /* glsl */ `
${ATMO_GLSL}
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(256.0, 64.0);
  float H = sqrt(Rt * Rt - Rg * Rg);
  float rho = H * uv.y;
  float r = sqrt(rho * rho + Rg * Rg);
  float dmin = Rt - r, dmax = rho + H;
  float d = dmin + uv.x * (dmax - dmin);
  float mu = d == 0.0 ? 1.0 : clamp((H * H - rho * rho - d * d) / (2.0 * r * d), -1.0, 1.0);
  vec3 ro = vec3(0.0, r, 0.0), rd = vec3(sqrt(max(0.0, 1.0 - mu * mu)), mu, 0.0);
  float tMax = raySphere(ro, rd, Rt);
  vec3 od = vec3(0.0);
  const int N = 40;
  float dt = tMax / float(N);
  for (int i = 0; i < N; i++) {
    vec3 p = ro + rd * (float(i) + 0.5) * dt;
    od += mediumAt(length(p)).ext * dt;
  }
  o = vec4(exp(-od), 1.0);
}`;

// shared integrator (Hillaire's IntegrateScatteredLuminance)
const INTEGRATE_GLSL = /* glsl */ `
uniform sampler2D tTrans;
uniform sampler2D tMulti;
vec3 transmittanceTo(float r, float mu) { return texture(tTrans, transmittanceUv(r, mu)).rgb; }
vec3 multiScat(float r, float muS) {
  vec2 uv = clamp(vec2(muS * 0.5 + 0.5, (r - Rg) / (Rt - Rg)), 0.0, 1.0);
  return texture(tMulti, vec2(fromUnitToSubUvs(uv.x, 32.0), fromUnitToSubUvs(uv.y, 32.0))).rgb;
}
// returns L (rgb) for unit sun illuminance and the throughput (rgb)
void integrate(vec3 ro, vec3 rd, vec3 sunDir, float tMaxLimit, int N, bool useMulti, bool ground, out vec3 L, out vec3 T, out vec3 msAs1) {
  L = vec3(0.0); T = vec3(1.0); msAs1 = vec3(0.0);
  float tB = raySphere(ro, rd, Rg), tT = raySphere(ro, rd, Rt);
  float tMax;
  if (length(ro) > Rt) { if (tT < 0.0) return; }
  bool hitGround = tB > 0.0;
  tMax = hitGround ? tB : tT;
  if (tMax < 0.0) return;
  tMax = min(tMax, tMaxLimit);
  float c = dot(rd, sunDir);
  float phR = rayleighPhase(c), phM = miePhase(c, uMieG);
  const float ISO = 1.0 / (4.0 * PI);
  float dt = tMax / float(N);
  for (int i = 0; i < 64; i++) {
    if (i >= N) break;
    float t = (float(i) + 0.3) * dt;
    vec3 p = ro + rd * t;
    float r = length(p);
    vec3 up = p / r;
    float muS = dot(sunDir, up);
    Medium m = mediumAt(r);
    vec3 sampleT = exp(-m.ext * dt);
    vec3 tSun = transmittanceTo(r, muS);
    // planet shadow on the sample
    float tEarth = raySphere(p + up * 0.01, sunDir, Rg);
    float earthShadow = tEarth >= 0.0 ? 0.0 : 1.0;
    vec3 phaseScat = useMulti ? (m.scatR * phR + m.scatM * phM) : m.scat * ISO;
    vec3 ms = useMulti ? multiScat(r, muS) * m.scat : vec3(0.0);
    vec3 S = earthShadow * tSun * phaseScat + ms;
    vec3 ext = max(m.ext, vec3(1e-7));
    vec3 Sint = (S - S * sampleT) / ext;
    vec3 MSint = (m.scat - m.scat * sampleT) / ext;
    L += T * Sint;
    msAs1 += T * MSint;
    T *= sampleT;
  }
  if (ground && hitGround && tMax >= tB - 1e-3) {
    vec3 p = ro + rd * tB;
    vec3 up = normalize(p);
    float muS = dot(sunDir, up);
    L += T * transmittanceTo(Rg, muS) * clamp(muS, 0.0, 1.0) * uGroundAlbedo / PI;
  }
}
`;

const MULTISCAT_FS = /* glsl */ `
${ATMO_GLSL}
${INTEGRATE_GLSL}
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / 32.0;
  uv = vec2(fromSubUvsToUnit(uv.x, 32.0), fromSubUvsToUnit(uv.y, 32.0));
  float muS = uv.x * 2.0 - 1.0;
  vec3 sunDir = vec3(sqrt(max(0.0, 1.0 - muS * muS)), muS, 0.0);
  float r = Rg + clamp(uv.y + 0.01, 0.0, 1.0) * (Rt - Rg - 0.01);
  vec3 ro = vec3(0.0, r, 0.0);
  vec3 Lsum = vec3(0.0), msSum = vec3(0.0);
  const int SQ = 8;
  for (int i = 0; i < SQ; i++) for (int j = 0; j < SQ; j++) {
    float a = (float(i) + 0.5) / float(SQ), b = (float(j) + 0.5) / float(SQ);
    float th = 2.0 * PI * a, ph = acos(1.0 - 2.0 * b);
    vec3 rd = vec3(cos(th) * sin(ph), cos(ph), sin(th) * sin(ph));
    vec3 L, T, ms;
    integrate(ro, rd, sunDir, 1e9, 20, false, true, L, T, ms);
    Lsum += L; msSum += ms;
  }
  Lsum /= float(SQ * SQ); msSum /= float(SQ * SQ);
  o = vec4(Lsum / (1.0 - min(msSum, vec3(0.99))), 1.0);
}`;

// sky-view LUT: lat-long around the camera, latitude packed toward the horizon
const SKYVIEW_FS = /* glsl */ `
${ATMO_GLSL}
${INTEGRATE_GLSL}
uniform float uCamR;
uniform float uSunMuS;           // sun zenith cosine at the camera
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(192.0, 108.0);
  uv = vec2(fromSubUvsToUnit(uv.x, 192.0), fromSubUvsToUnit(uv.y, 108.0));
  float r = uCamR;
  float vh = sqrt(max(0.0, r * r - Rg * Rg));
  float cosB = vh / r, beta = acos(cosB), zha = PI - beta;
  float mu;
  if (uv.y < 0.5) { float k = 2.0 * uv.y; k = 1.0 - k; k *= k; k = 1.0 - k; mu = cos(zha * k); }
  else { float k = uv.y * 2.0 - 1.0; k *= k; mu = cos(zha + beta * k); }
  float k = uv.x * uv.x;
  float lightViewCos = -(k * 2.0 - 1.0);
  float sinMu = sqrt(max(0.0, 1.0 - mu * mu));
  vec3 rd = vec3(sinMu * lightViewCos, mu, sinMu * sqrt(max(0.0, 1.0 - lightViewCos * lightViewCos)));
  vec3 sunDir = vec3(sqrt(max(0.0, 1.0 - uSunMuS * uSunMuS)), uSunMuS, 0.0);
  vec3 ro = vec3(0.0, r, 0.0);
  vec3 L, T, ms;
  integrate(ro, rd, sunDir, 1e9, 32, true, false, L, T, ms);
  o = vec4(L, 1.0);
}`;

// aerial perspective froxels: atlas 32 x (32 * 32); slice s at distance maxD * ((s + 0.5) / 32)^2
const AP_FS = /* glsl */ `
${ATMO_GLSL}
${INTEGRATE_GLSL}
uniform mat4 uInvViewProj;     // camera, world (metres) with the camera at the origin
uniform float uCamR;
uniform vec3 uSunDir;          // world, y up
uniform float uMaxDistKm;
uniform float uSunE;
out vec4 o;
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  int slice = ip.y / 32;
  vec2 uv = (vec2(ip.x, ip.y - slice * 32) + 0.5) / 32.0;
  vec4 w = uInvViewProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(w.xyz / w.w);
  float s = (float(slice) + 0.5) / 32.0;
  float t = uMaxDistKm * s * s;
  vec3 ro = vec3(0.0, uCamR, 0.0);
  vec3 L, T, ms;
  integrate(ro, rd, uSunDir, t, 12, true, false, L, T, ms);
  o = vec4(L * uSunE, dot(T, vec3(1.0 / 3.0)));
}`;

// ambient (average sky radiance over the upper hemisphere, for the volumetric fog), 1x1
const AMBIENT_FS = /* glsl */ `
${COMMON}
uniform sampler2D tSky;
uniform float uSunE;
out vec4 o;
void main() {
  vec3 s = vec3(0.0);
  for (int y = 0; y < 8; y++) for (int x = 0; x < 16; x++) s += texture(tSky, vec2((float(x) + 0.5) / 16.0, (float(y) + 0.5) / 16.0)).rgb;
  o = vec4(s / 128.0 * uSunE, 1.0);
}`;

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FS = /* glsl */ `
${ATMO_GLSL}
uniform sampler2D tSkyView;
uniform sampler2D tTrans;
uniform float uCamR;
uniform vec3 uSunDir;
uniform float uSunE;
uniform float uSunDisk;        // 0 for the environment map (the sun is a light there)
uniform float uSunCos;
varying vec3 vDir;
vec2 skyViewUv(vec3 d, float r) {
  float vh = sqrt(max(0.0, r * r - Rg * Rg));
  float cosB = vh / r, beta = acos(cosB), zha = PI - beta;
  float mu = d.y;
  vec3 ro = vec3(0.0, r, 0.0);
  bool ground = raySphere(ro, d, Rg) >= 0.0;
  float vy;
  if (!ground) { float k = acos(clamp(mu, -1.0, 1.0)) / zha; k = 1.0 - k; k = sqrt(max(k, 0.0)); k = 1.0 - k; vy = k * 0.5; }
  else { float k = (acos(clamp(mu, -1.0, 1.0)) - zha) / beta; k = sqrt(max(k, 0.0)); vy = k * 0.5 + 0.5; }
  vec2 dh = d.xz, sh = uSunDir.xz;
  float lvc = (length(dh) > 1e-5 && length(sh) > 1e-5) ? dot(normalize(dh), normalize(sh)) : 1.0;
  float vx = sqrt(clamp(-lvc * 0.5 + 0.5, 0.0, 1.0));
  return vec2(fromUnitToSubUvs(vx, 192.0), fromUnitToSubUvs(vy, 108.0));
}
void main() {
  vec3 d = normalize(vDir);
  vec3 col;
  if (uSunDisk < 0.5 && d.y < 0.0) {
    // environment map below the horizon: what a sea / ground reflects there is mostly the
    // sky near the horizon, dimmed (instead of the planet's near-black surface in the LUT)
    vec3 m = normalize(vec3(d.x, max(-d.y * 0.25, 0.002), d.z));
    col = texture(tSkyView, skyViewUv(m, uCamR)).rgb * uSunE * mix(1.0, 0.3, smoothstep(0.0, 0.3, -d.y));
  } else col = texture(tSkyView, skyViewUv(d, uCamR)).rgb * uSunE;
  if (uSunDisk > 0.5) {
    float c = dot(d, uSunDir);
    if (c > uSunCos) {
      vec3 ro = vec3(0.0, uCamR, 0.0);
      if (raySphere(ro, d, Rg) < 0.0) {
        // limb darkening (Neckel & Labs style polynomial, mu = cos of the angle on the solar disk)
        float x = clamp((1.0 - c) / (1.0 - uSunCos), 0.0, 1.0);
        float m = sqrt(max(0.0, 1.0 - x));
        vec3 limb = 1.0 - vec3(0.397, 0.503, 0.652) * (1.0 - pow(vec3(m), vec3(0.6, 0.65, 0.7)));
        float solid = 2.0 * PI * (1.0 - uSunCos);
        col += uSunE / solid * texture(tTrans, transmittanceUv(uCamR, d.y)).rgb * limb;
      }
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;

// ------------------------------------------------------------------ JS side
// transmittance along a ray (for the sun light colour), same model as the shaders
function mediumExt(rKm, rayMul, mieMul) {
  const h = Math.max(rKm - RG, 0);
  const dR = Math.exp(-h / 8) * rayMul, dM = Math.exp(-h / 1.2) * mieMul, dO = Math.max(0, 1 - Math.abs(h - 25) / 15);
  return [0, 1, 2].map((i) => RAYLEIGH[i] * dR + MIE_EXT * dM + OZONE[i] * dO);
}
export function sunTransmittance(rKm, mu, rayMul = 1, mieMul = 1) {
  const ro = [0, rKm, 0], rd = [Math.sqrt(Math.max(0, 1 - mu * mu)), mu, 0];
  const b = ro[1] * rd[1], c = rKm * rKm - RG * RG;
  if (mu < 0 && b * b - c >= 0 && -b - Math.sqrt(b * b - c) > 0) return [0, 0, 0];   // below the horizon
  const cT = rKm * rKm - RT * RT, tMax = -b + Math.sqrt(Math.max(0, b * b - cT));
  const N = 64, dt = tMax / N, od = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) * dt;
    const x = rd[0] * t, y = ro[1] + rd[1] * t;
    const e = mediumExt(Math.hypot(x, y), rayMul, mieMul);
    for (let k = 0; k < 3; k++) od[k] += e[k] * dt;
  }
  return od.map((v) => Math.exp(-v));
}

export class Atmosphere {
  constructor(host, cin) {
    this.h = host; this.cin = cin;
    this.c = cin.c.atmosphere;
  }

  init() {
    const mk = (w, h, o = {}) => new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: o.nearest ? THREE.NearestFilter : THREE.LinearFilter, magFilter: o.nearest ? THREE.NearestFilter : THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
    this.transRT = mk(256, 64);
    this.multiRT = mk(32, 32);
    this.skyRT = mk(192, 108);
    this.apRT = mk(32, 32 * 32);
    this.ambRT = mk(1, 1, { nearest: true });
    this.common = {
      uRayMul: { value: 1 }, uMieMul: { value: 1 }, uMieG: { value: 0.8 }, uGroundAlbedo: { value: new THREE.Vector3(0.3, 0.3, 0.3) },
      tTrans: { value: this.transRT.texture }, tMulti: { value: this.multiRT.texture },
    };
    const pass = (fs, extra = {}) => this.h.makePass(raw(fs, { ...this.common, ...extra }));
    this.pass = {
      trans: pass(TRANSMITTANCE_FS),
      multi: pass(MULTISCAT_FS, { tMulti: { value: null } }),   // (must not sample its own target)
      sky: pass(SKYVIEW_FS, { uCamR: { value: RG + 0.001 }, uSunMuS: { value: 0.5 } }),
      ap: pass(AP_FS, { uInvViewProj: { value: new THREE.Matrix4() }, uCamR: { value: RG }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMaxDistKm: { value: 32 }, uSunE: { value: 1 } }),
      amb: this.h.makePass(raw(AMBIENT_FS, { tSky: { value: this.skyRT.texture }, uSunE: { value: 1 } })),
    };
    // the sky dome (drawn in the main pass, behind everything, like the scene's own geometry)
    if (this.c.sky === 'physical') {
      this.skyMat = new THREE.ShaderMaterial({
        name: 'DKPhysicalSky', vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { ...this.common, tSkyView: { value: this.skyRT.texture }, uCamR: { value: RG }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunE: { value: 1 }, uSunDisk: { value: 1 }, uSunCos: { value: Math.cos(SUN_ANGULAR_RADIUS) } },
      });
      this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), this.skyMat);
      this.dome.name = 'dk-physical-sky';
      this.dome.frustumCulled = false;
      this.dome.renderOrder = 100000;
      this.dome.onBeforeRender = (r, s, cam) => {
        const f = cam.far * 0.9;
        this.dome.position.copy(cam.position); this.dome.scale.setScalar(f); this.dome.updateMatrixWorld();
      };
      this.h.scene.add(this.dome);
    }
    this.sun = this.c.sunLight || this.cin.sun;
    this.lutKey = null;
    this.envKey = null;
    return this;
  }

  sunDir() {
    const d = this.c.sunDirection;
    if (d) return (Array.isArray(d) ? new THREE.Vector3().fromArray(d) : new THREE.Vector3().copy(d)).normalize();
    return this.cin.sunDirection() || new THREE.Vector3(0.3, 0.5, -0.8).normalize();
  }
  sunIlluminance() {
    if (this.c.sunIlluminance != null) return this.c.sunIlluminance;
    if (this.c.sky === 'scene' && this.sun) return this.sun.intensity;   // the photo's sun (already through its atmosphere)
    if (this.baseSunE == null) this.baseSunE = this.sun ? this.sun.intensity : 3;
    return this.baseSunE;
  }

  /** Per frame, before the main pass: sun light from the atmosphere, LUTs, sky dome, environment. */
  update() {
    const c = this.c, cam = this.h.camera;
    const u = this.common;
    u.uRayMul.value = c.rayleigh; u.uMieMul.value = c.haze; u.uMieG.value = c.mieG;
    const key = `${c.rayleigh}|${c.haze}|${c.mieG}`;
    if (key !== this.lutKey) {
      this.h.drawPass(this.pass.trans, this.transRT);
      this.h.drawPass(this.pass.multi, this.multiRT);
      this.lutKey = key;
    }
    const sd = this.sunDir();
    const E = this.sunIlluminance();
    // place the sun light along the sky's sun direction, coloured by the atmosphere
    const drive = c.driveSunLight === 'auto' ? c.sky === 'physical' : !!c.driveSunLight;
    if (this.sun && drive) {
      if (c.sunDirection) {
        const tgt = this.sun.target.position;
        this.sun.position.copy(tgt).addScaledVector(sd, 1000);
        this.sun.updateMatrixWorld();
      }
      const groundR = RG + Math.max(0, c.altitude) / 1000;
      const T = sunTransmittance(groundR, sd.y, c.rayleigh, c.haze);
      const m = Math.max(T[0], T[1], T[2], 1e-6);
      this.sun.color.setRGB(T[0] / m, T[1] / m, T[2] / m);
      this.sun.intensity = E * m;
    }
    const camAltKm = (c.altitude + cam.position.y) / 1000;
    const camR = RG + Math.max(camAltKm, 0.001);
    // sky-view LUT: frame of reference = the sun's azimuth (the LUT is symmetric about it)
    const sv = this.pass.sky.material.uniforms;
    sv.uCamR.value = camR; sv.uSunMuS.value = sd.y;
    this.h.drawPass(this.pass.sky, this.skyRT);
    const am = this.pass.amb.material.uniforms; am.uSunE.value = E;
    this.h.drawPass(this.pass.amb, this.ambRT);
    // aerial perspective LUT for this camera (rotation only: the camera sits at the origin)
    if (c.aerialPerspective) {
      const ap = this.pass.ap.material.uniforms;
      const view = cam.matrixWorldInverse.clone().setPosition(0, 0, 0);
      ap.uInvViewProj.value.multiplyMatrices(cam.projectionMatrix, view).invert();
      ap.uCamR.value = camR; ap.uSunDir.value.copy(sd); ap.uMaxDistKm.value = 32; ap.uSunE.value = E;
      this.h.drawPass(this.pass.ap, this.apRT);
    }
    if (this.skyMat) {
      const s = this.skyMat.uniforms;
      s.uCamR.value = camR; s.uSunDir.value.copy(sd); s.uSunE.value = E;
    }
    if (this.skyMat && c.environment) this.updateEnvironment(sd, camR, E);
    this.sd = sd; this.E = E; this.camR = camR;
  }

  /** Environment map (PMREM) of the sky without the sun disk - only when the sky changed. */
  updateEnvironment(sd, camR, E) {
    const key = `${sd.x.toFixed(5)},${sd.y.toFixed(5)},${sd.z.toFixed(5)}|${camR.toFixed(4)}|${E}|${this.lutKey}`;
    if (key === this.envKey) return;
    const { renderer, scene } = this.h;
    if (!this.envScene) {
      this.envScene = new THREE.Scene();
      // same shader, own uniform objects (the sun disk is off: the sun is a light there)
      const su = this.skyMat.uniforms, uu = {};
      for (const k of Object.keys(su)) uu[k] = { value: su[k].value && su[k].value.clone && !su[k].value.isTexture ? su[k].value.clone() : su[k].value };
      this.envMat = new THREE.ShaderMaterial({ name: 'DKPhysicalSkyEnv', vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uu });
      const m = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), this.envMat);
      this.envScene.add(m);
      this.pmrem = new THREE.PMREMGenerator(renderer);
    }
    const eu = this.envMat.uniforms;
    for (const k of ['uRayMul', 'uMieMul', 'uMieG']) eu[k].value = this.common[k].value;
    eu.uCamR.value = camR; eu.uSunDir.value.copy(sd); eu.uSunE.value = E; eu.uSunDisk.value = 0;
    const prevTarget = renderer.getRenderTarget();
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
    renderer.setRenderTarget(prevTarget);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    if (!scene.environment || scene.environment === this.lastEnv) { scene.environment = rt.texture; this.lastEnv = rt.texture; }
    this.envKey = key;
  }

  bindResolve(u) {
    if (!this.c.aerialPerspective) return;
    u.tApLut.value = this.apRT.texture;
    u.uApGrid.value.set(32, 32, 32);
    u.uApMaxDist.value = 32000;
    u.uApScale.value = this.c.apDistanceScale;
  }
}
