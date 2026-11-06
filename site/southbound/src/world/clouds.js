// Volumetric clouds.
//
// Cumulus clouds are ray-marched through a spherical shell 1.4–3.8 km up,
// lit by the sun (or moon) with a short shadow march, two-lobe phase function
// (silver linings) and an ambient sky term. The march runs into a small cube
// map that is refreshed one face per frame; the main view and the reflection
// map both sample that cube. So the expensive part runs at a fixed small
// resolution: 4K costs the same as 720p.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

// --- tileable 3D noise (Perlin-Worley + Worley octaves), built once ---------
function hash(x, y, z, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(s, 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const GRAD = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const wrap = (v, p) => ((v % p) + p) % p;
function perlin(x, y, z, P) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  let r = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
    const g = GRAD[(hash(wrap(xi + dx, P), wrap(yi + dy, P), wrap(zi + dz, P), 7) * 12) | 0];
    const d = g[0] * (xf - dx) + g[1] * (yf - dy) + g[2] * (zf - dz);
    r += d * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return r;
}
function worley(x, y, z, F, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let best = 9;
  for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j, cz = zi + k;
    const wx = wrap(cx, F), wy = wrap(cy, F), wz = wrap(cz, F);
    const px = cx + hash(wx, wy, wz, seed), py = cy + hash(wx, wy, wz, seed + 1), pz = cz + hash(wx, wy, wz, seed + 2);
    const d = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
    if (d < best) best = d;
  }
  return 1 - Math.min(1, Math.sqrt(best));
}

// Each channel is histogram-equalised to 0..1 so thresholds mean "this
// fraction of the sky": coverage 0.4 really gives ~40% cloud.
function equalise(src, n) {
  const order = new Uint32Array(n).map((_, i) => i).sort((a, b) => src[a] - src[b]);
  const out = new Uint8Array(n);
  for (let r = 0; r < n; r++) out[order[r]] = Math.round((r / (n - 1)) * 255);
  return out;
}

export function makeCloudNoise(N = 64) {
  const n = N * N * N;
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const remap = (v, l0, h0, l1, h1) => l1 + ((v - l0) * (h1 - l1)) / (h0 - l0);
  let o = 0;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++, o++) {
    const u = x / N, v = y / N, w = z / N;
    let p = 0, a = 1, f = 4, sum = 0;
    for (let oc = 0; oc < 4; oc++) { p += perlin(u * f, v * f, w * f, f) * a; sum += a; a *= 0.5; f *= 2; }
    p = p / sum * 0.9 + 0.5;
    const w4 = worley(u * 4, v * 4, w * 4, 4, 11), w8 = worley(u * 8, v * 8, w * 8, 8, 23);
    const w16 = worley(u * 16, v * 16, w * 16, 16, 37), w32 = worley(u * 32, v * 32, w * 32, 32, 51);
    const g = w4 * 0.625 + w8 * 0.25 + w16 * 0.125;
    ch[0][o] = remap(p, g - 1, 1, 0, 1);           // Perlin-Worley: billowy base shape
    ch[1][o] = g;                                    // Worley octaves for shape and erosion
    ch[2][o] = w8 * 0.625 + w16 * 0.25 + w32 * 0.125;
    ch[3][o] = w16 * 0.75 + w32 * 0.25;
  }
  const eq = ch.map((c) => equalise(c, n));
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) { data[i * 4] = eq[0][i]; data[i * 4 + 1] = eq[1][i]; data[i * 4 + 2] = eq[2][i]; data[i * 4 + 3] = eq[3][i]; }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGBAFormat;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

// --- the cloud march, appended to the physical sky shader -------------------
const CLOUD_GLSL = /* glsl */ `
uniform sampler3D tCloudNoise;
uniform float uCloudTime, uCover, uSkyNight;
uniform vec3 uLightDir, uCloudSun, uCloudAmb, uGround;
uniform vec2 uWind, uCamOff;
#define EARTH_R 6360000.0
#define CL_BOT 1400.0
#define CL_TOP 3800.0
#define SIGMA 0.022
float clRemap(float v, float l0, float h0, float l1, float h1){ return l1 + (v - l0) * (h1 - l1) / (h0 - l0); }
float clHG(float c, float g){ float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5); }
float clFar(vec3 ro, vec3 rd, float r){ float b = dot(ro, rd); float c = dot(ro, ro) - r * r; float d = b * b - c; return d < 0.0 ? -1.0 : -b + sqrt(d); }
float clDensity(vec3 p, bool cheap){
  float hF = (length(p) - EARTH_R - CL_BOT) / (CL_TOP - CL_BOT);
  if (hF < 0.0 || hF > 1.0) return 0.0;
  // anchored to the world (uCamOff: where the viewer is), so they pass overhead as you travel and
  // their shadows on the ground (core/cloudshadow.js) are cast by these very clouds
  vec3 q = p + vec3(uCamOff.x, 0.0, uCamOff.y) + vec3(uWind.x, 0.0, uWind.y) * uCloudTime;
  // weather: where clouds can form at all (two scales, tiles every ~80 km)
  float W = texture(tCloudNoise, vec3(q.x * 0.000012, 0.31, q.z * 0.000012)).r * 0.65
          + texture(tCloudNoise, vec3(q.x * 0.00004, 0.67, q.z * 0.00004)).g * 0.35;
  float cov = smoothstep(1.0 - uCover - 0.1, 1.0 - uCover + 0.12, W);
  if (cov <= 0.0) return 0.0;
  // cumulus height profile: flat bases, towers that grow where coverage is high
  float prof = smoothstep(0.0, 0.06, hF) * (1.0 - smoothstep(0.25 + 0.6 * cov, 0.35 + 0.65 * cov, hF));
  vec4 nz = texture(tCloudNoise, q * 0.00013);
  float shape = nz.r * 0.6 + nz.g * 0.4;
  float th = 1.0 - cov * prof * 0.95;
  float d = smoothstep(th, th + 0.16, shape);
  if (d <= 0.0 || cheap) return d;
  // small-scale erosion: wispy bases, billowing tops
  vec4 e = texture(tCloudNoise, q * 0.0009 + vec3(0.0, uCloudTime * 0.0006, 0.0));
  float det = e.g * 0.5 + e.b * 0.3 + e.a * 0.2;
  det = mix(1.0 - det, det, clamp(hF * 3.0, 0.0, 1.0));
  return clamp(d - (1.0 - det) * 0.55 * (1.0 - d * 0.6), 0.0, 1.0);
}
vec4 clMarch(vec3 rd, vec3 bg){
  if (rd.y < 0.012 || uCover <= 0.0) return vec4(0.0, 0.0, 0.0, 1.0);
  vec3 ro = vec3(0.0, EARTH_R + 20.0, 0.0);
  float t0 = clFar(ro, rd, EARTH_R + CL_BOT);
  float t1 = min(clFar(ro, rd, EARTH_R + CL_TOP), t0 + 14000.0);
  if (t0 > 90000.0) return vec4(0.0, 0.0, 0.0, 1.0);
  // coarse steps through empty air, fine steps (1/3) inside clouds
  float big = (t1 - t0) / float(CL_STEPS), small = big / 4.0;
  vec3 jq = fract(rd * vec3(443.897, 441.423, 437.195) * 37.0); jq += dot(jq, jq.yzx + 19.19);
  float jit = fract((jq.x + jq.y) * jq.z);
  float t = t0 + big * jit;
  float c = dot(rd, uLightDir);
  float phase = min(mix(clHG(c, 0.72), clHG(c, -0.2), 0.4), 8.0);
  float T = 1.0; vec3 S = vec3(0.0);
  int fine = 0;
  for (int i = 0; i < CL_STEPS * 3; i++){
    if (T < 0.01 || t > t1) break;
    vec3 p = ro + rd * t;
    if (fine == 0){
      if (clDensity(p, true) > 0.0){ fine = 10; t = max(t0, t - big * 0.75); continue; }
      t += big; continue;
    }
    float dens = clDensity(p, false);
    if (dens > 0.002){
      fine = 10;
      float od = 0.0, ls = 60.0; vec3 lp = p;
      for (int j = 0; j < CL_LSTEPS; j++){ lp += uLightDir * ls; od += clDensity(lp, j > 1) * ls; ls *= 1.9; }
      // multiple-scattering approximation: a softer second octave keeps cores from going black
      float lt = max(exp(-od * SIGMA), exp(-od * SIGMA * 0.25) * 0.45);
      float powder = 1.0 - exp(-dens * 12.0);
      float hF = (length(p) - EARTH_R - CL_BOT) / (CL_TOP - CL_BOT);
      vec3 lum = uCloudSun * lt * phase * mix(0.55, 1.0, powder) + uCloudAmb * mix(0.55, 1.1, hF);
      float Ts = exp(-dens * SIGMA * small);
      S += T * lum * (1.0 - Ts);
      T *= Ts;
    } else fine--;
    t += small;
  }
  // aerial perspective: far clouds melt into the haze
  float fadeA = exp(-max(t0 - 3000.0, 0.0) / 30000.0) * smoothstep(0.012, 0.06, rd.y);
  S = mix(bg * (1.0 - T), S, fadeA);
  T = mix(1.0, T, fadeA);
  return vec4(S, T);
}
`;

// the noise field, made once and shared with the cloud shadows
let noiseTex = null;
export function cloudNoise(quality) { return noiseTex || (noiseTex = makeCloudNoise(quality.key === 'phone' ? 48 : 64)); }

export function createCloudSky(renderer, quality) {
  const size = { phone: 192, low: 224, medium: 320, high: 448, ultra: 640 }[quality.key] || 256;
  const steps = { phone: 16, low: 20, medium: 28, high: 40, ultra: 52 }[quality.key] || 32;
  const lsteps = quality.key === 'phone' || quality.key === 'low' ? 3 : 5;

  const scene = new THREE.Scene();
  const sky = new Sky();
  sky.scale.setScalar(1000);
  const u = sky.material.uniforms;
  u.turbidity.value = 2.4;
  u.rayleigh.value = 2.4;
  u.mieCoefficient.value = 0.003;
  u.mieDirectionalG.value = 0.82;
  Object.assign(u, {
    tCloudNoise: { value: cloudNoise(quality) }, uCamOff: { value: new THREE.Vector2() },
    uCloudTime: { value: 0 }, uCover: { value: 0.52 }, uSkyNight: { value: 0 },
    uLightDir: { value: new THREE.Vector3(0, 1, 0) }, uCloudSun: { value: new THREE.Color(3, 3, 3) },
    uCloudAmb: { value: new THREE.Color(0.4, 0.45, 0.55) }, uGround: { value: new THREE.Color(0.05, 0.05, 0.04) },
    uWind: { value: new THREE.Vector2(9, 3.5) },
  });
  sky.material.defines = { CL_STEPS: steps, CL_LSTEPS: lsteps };
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace('void main() {', CLOUD_GLSL + '\nvoid main() {')
    // the sun disc is drawn by the dome at full resolution, not baked into the cube
    .replace('L0 += ( vSunE * 19000.0 * Fex ) * sundisk;', '')
    .replace('gl_FragColor = vec4( retColor, 1.0 );', `
      vec3 nightCol = mix(vec3(0.004,0.007,0.02), vec3(0.02,0.035,0.07), pow(1.0 - max(direction.y, 0.0), 3.0));
      float sl = dot(retColor, vec3(0.2126, 0.7152, 0.0722));
      retColor = max(mix(vec3(sl), retColor, 1.3), 0.0) * mix(0.62, 0.85, pow(1.0 - max(direction.y, 0.0), 4.0));
      retColor = mix(retColor, nightCol, uSkyNight);
      vec4 cl = clMarch(direction, retColor);
      retColor = retColor * cl.a + cl.rgb;
      retColor = mix(retColor, uGround, smoothstep(0.0, 0.06, -direction.y));
      gl_FragColor = vec4(retColor, direction.y < 0.0 ? 1.0 : cl.a);`);
  scene.add(sky);

  const target = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const cubeCam = new THREE.CubeCamera(1, 5000, target);
  scene.add(cubeCam);
  cubeCam.updateMatrixWorld(true);
  let face = 0, primed = false;
  const pendingOff = new THREE.Vector2();

  return {
    texture: target.texture, uniforms: u,
    // where the viewer is: taken up at the start of each round of six faces, so no two faces of
    // the cube ever show the clouds from different places (a seam); a big jump redraws them all
    setViewer(x, z) {
      pendingOff.set(x, z);
      if (primed && pendingOff.distanceTo(u.uCamOff.value) > 300) { u.uCamOff.value.copy(pendingOff); cubeCam.update(renderer, scene); face = 0; }
    },
    // render one face (or all six the first time)
    update() {
      if (face === 0) u.uCamOff.value.copy(pendingOff);
      if (!primed) { cubeCam.update(renderer, scene); primed = true; return; }
      const prevTarget = renderer.getRenderTarget(), prevXr = renderer.xr.enabled;
      renderer.xr.enabled = false;
      if (cubeCam.coordinateSystem !== renderer.coordinates) { /* keep in sync with renderer */ }
      renderer.setRenderTarget(target, face);
      renderer.render(scene, cubeCam.children[face]);
      renderer.setRenderTarget(prevTarget);
      renderer.xr.enabled = prevXr;
      face = (face + 1) % 6;
    },
    refreshAll() { cubeCam.update(renderer, scene); },
  };
}

// --- the dome that draws the cube in the main view, plus sun, moon, stars ----
export function createSkyDome(cubeTexture) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tSky: { value: cubeTexture },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunDisc: { value: new THREE.Color(0, 0, 0) },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) }, uMoon: { value: 0 }, uStars: { value: 0 }, uFlash: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){ vDir = (modelMatrix * vec4(position, 0.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0); gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: /* glsl */ `
      uniform samplerCube tSky; uniform vec3 uSunDir, uSunDisc, uMoonDir; uniform float uMoon, uStars, uFlash;
      varying vec3 vDir;
      float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        vec4 s = textureCube(tSky, d);
        vec3 c = s.rgb;
        float vis = d.y > 0.0 ? s.a : 0.0;
        float cs = dot(d, uSunDir);
        c += uSunDisc * smoothstep(0.99993, 0.99997, cs) * vis;
        // moon: lit disc with soft halo
        float cm = dot(d, uMoonDir);
        c += vec3(0.75, 0.8, 0.95) * (smoothstep(0.99975, 0.99982, cm) * 1.2 + pow(max(cm, 0.0), 900.0) * 0.06) * uMoon * vis;
        // stars
        if (uStars > 0.0 && d.y > 0.0){
          vec3 sp = d * 420.0; vec3 cell = floor(sp);
          float h = h31(cell);
          if (h > 0.985){
            vec3 ctr = cell + 0.5 + (vec3(h31(cell + 3.1), h31(cell + 7.7), h31(cell + 1.3)) - 0.5) * 0.7;
            float r = length(sp - ctr);
            float tw = (h - 0.985) / 0.015;
            c += vec3(0.85, 0.9, 1.0) * smoothstep(0.16, 0.0, r) * tw * tw * 3.0 * uStars * vis * smoothstep(0.0, 0.2, d.y);
          }
        }
        c += vec3(0.55, 0.6, 0.8) * uFlash * (1.0 - s.a * 0.7) * smoothstep(-0.05, 0.3, d.y);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  dome.scale.setScalar(15000);
  dome.frustumCulled = false;
  dome.renderOrder = 1000; // after opaque geometry, so early-z skips covered pixels
  return dome;
}
