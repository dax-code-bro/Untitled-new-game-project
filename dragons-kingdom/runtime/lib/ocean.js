// FFT ocean (import from 'dk/ocean.js').
//
//   const ocean = createOcean(ctx, { windSpeed: 9, windDirection: 30 });
//   scene.add(ocean.mesh);
//   // update(t):  ocean.update(t);        (a pure function of t)
//
// Waves: Tessendorf's FFT ocean with a JONSWAP spectrum and Hasselmann
// directional spreading (+ optional long swell), as in Horvath 2015
// "Empirical directional wave spectra for computer graphics". Three cascades
// (default 1100 m, 177 m and 27 m patches, 256^2 each) so the sea has no
// visible tiling from the horizon down to ripples at the camera. Choppy
// (horizontal) displacement, Jacobian whitecap foam. The spectrum evolves as
// h(k,t) = h0(k) e^{i w t} + conj(h0(-k)) e^{-i w t}: every frame depends only
// on t (the phase w t is reduced modulo 2 pi in double precision, so hour-long
// episodes stay exact).
//
// Shading: three's MeshPhysicalMaterial (IOR 1.333 -> 2% Fresnel at normal
// incidence, sky reflections from scene.environment, GGX sun glitter with
// shadows) patched with: normals from the FFT slopes, roughness from the
// slope variance the pixel cannot resolve (distant sea gets the broad glitter
// path, Bruneton 2010), deep-water colour, subsurface glow through backlit
// crests, foam. With the cinematic stack the ocean is drawn in a late pass
// that sees the scene behind it: shallow water shows the ground with
// Beer-Lambert absorption, and foam lines form where rocks / shores / hulls
// cut the surface.
import * as THREE from 'three';

const G = 9.81;
const TWO_PI = Math.PI * 2;

// ---------------------------------------------------------------- FFT ---
// In-place iterative radix-2 complex FFT on interleaved [re, im] arrays.
function makeFFT(N) {
  const bits = Math.log2(N);
  if (!Number.isInteger(bits)) throw new Error('ocean: resolution must be a power of two');
  const rev = new Uint32Array(N);
  for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
  const cosT = new Float64Array(N / 2), sinT = new Float64Array(N / 2);
  for (let i = 0; i < N / 2; i++) { cosT[i] = Math.cos((TWO_PI * i) / N); sinT[i] = Math.sin((TWO_PI * i) / N); }   // inverse: +i
  const tmp = new Float64Array(2 * N);
  // 1-D inverse FFT of N complex values at data[off + k*stride]
  function ifft1(data, off, stride) {
    for (let i = 0; i < N; i++) { const j = off + rev[i] * stride * 2; tmp[2 * i] = data[j]; tmp[2 * i + 1] = data[j + 1]; }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, step = N / size;
      for (let s = 0; s < N; s += size) {
        for (let k = 0; k < half; k++) {
          const c = cosT[k * step], sn = sinT[k * step];
          const a = 2 * (s + k), b = 2 * (s + k + half);
          const br = tmp[b] * c - tmp[b + 1] * sn, bi = tmp[b] * sn + tmp[b + 1] * c;
          tmp[b] = tmp[a] - br; tmp[b + 1] = tmp[a + 1] - bi;
          tmp[a] += br; tmp[a + 1] += bi;
        }
      }
    }
    for (let i = 0; i < N; i++) { const j = off + i * stride * 2; data[j] = tmp[2 * i]; data[j + 1] = tmp[2 * i + 1]; }
  }
  return function ifft2(data) {
    for (let r = 0; r < N; r++) ifft1(data, 2 * r * N, 1);    // rows
    for (let c = 0; c < N; c++) ifft1(data, 2 * c, N);         // columns
  };
}

// ----------------------------------------------------------- spectrum ---
function lanczosGamma(z) {
  const g = 7, p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * lanczosGamma(1 - z));
  z -= 1;
  let x = p[0];
  for (let i = 1; i < g + 2; i++) x += p[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(TWO_PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** JONSWAP S(omega) (m^2 s) + Hasselmann spreading D(omega, theta). */
function jonswap(o) {
  const U = o.windSpeed, F = o.fetch;
  const alpha = 0.076 * Math.pow((U * U) / (F * G), 0.22);
  const wp = 22 * Math.pow((G * G) / (U * F), 1 / 3);
  const gamma = o.peakEnhancement ?? 3.3;
  const S = (w) => {
    if (w <= 0) return 0;
    const sigma = w <= wp ? 0.07 : 0.09;
    const r = Math.exp(-((w - wp) ** 2) / (2 * sigma * sigma * wp * wp));
    return ((alpha * G * G) / w ** 5) * Math.exp(-1.25 * (wp / w) ** 4) * Math.pow(gamma, r);
  };
  const D = (w, theta) => {
    let s = w <= wp ? 6.97 * Math.pow(w / wp, 4.06) : 9.77 * Math.pow(w / wp, -2.33 - 1.45 * ((U * wp) / G - 1.17));
    s += 16 * Math.tanh(wp / w) * (o.swell ?? 0) ** 2;           // swell narrows the spreading
    s = Math.max(s, 0.01);
    const q = (Math.pow(2, 2 * s - 1) / Math.PI) * (lanczosGamma(s + 1) ** 2) / lanczosGamma(2 * s + 1);
    return q * Math.pow(Math.abs(Math.cos(theta / 2)), 2 * s);
  };
  return { S, D, wp };
}

export const OCEAN_DEFAULTS = {
  windSpeed: 8,            // m/s at 10 m height
  windDirection: 0,        // degrees: the direction the waves travel (0 = +x, 90 = +z)
  fetch: 120000,           // m of open water upwind
  swell: 0.2,              // 0..1: long, aligned swell
  choppiness: 1.0,         // horizontal displacement (pointed crests)
  amplitude: 1.0,          // scales wave heights
  cascades: [1100, 177, 27.3],
  resolution: 256,
  seed: 1,
  depth: 1e9,              // water depth (m): finite depth slows/shortens waves (dispersion)
  // look
  deepColor: [0.004, 0.016, 0.022],      // linear albedo of the water body (deep)
  scatterColor: [0.02, 0.11, 0.10],      // subsurface glow in backlit crests
  absorption: [0.45, 0.09, 0.065],       // per metre (clear coastal water): shallows turn turquoise
  turbidity: 0.06,                       // in-scattering per metre in shallow water
  foamColor: [0.82, 0.84, 0.85],
  foamAmount: 1.0,
  foamThreshold: 0.35,                   // Jacobian below which whitecaps form
  shoreFoam: 1.0,                        // foam lines where things cut the surface (needs the cinematic late pass)
  shoreFoamWidth: 1.2,                   // metres of water depth that foam
  surf: 0.0,                             // 0..1: solid whitewater core where the sea meets rock / shore / hull (breaking surf)
  roughness: 0.04,                       // capillary roughness on top of the unresolved slopes
  reflectionTint: [1, 1, 1],             // multiplies the reflected environment (e.g. warm it when the sky reflection
                                         // reaches the eye through sunlit mist that the environment map does not contain)
  refraction: 0.06,
  ssr: false,                            // screen-space reflections of the scene (dragons, cliffs) - needs the cinematic late pass; about doubles the ocean pass (measured 0.8 -> 1.8 s at 1080p); slightly aliased at the reflection edges
  ssrSteps: 24,
  segments: 256, innerRadius: 0.35, sectorAngle: 2.6, gridFocus: 30, outerRadius: 20000, maxRingGrowth: 0.06,
  castShadow: false,
};

/**
 * Build the ocean. Returns { mesh, material, update(t), heightAt(x, z), stats }.
 */
export function createOcean(ctx, opts = {}) {
  const o = { ...OCEAN_DEFAULTS, ...opts };
  const N = o.resolution;
  const ifft2 = makeFFT(N);
  const dirRad = (o.windDirection * Math.PI) / 180;
  const spec = jonswap(o);
  const cascades = o.cascades.map((L, ci) => {
    const rng = mulberry((o.seed * 7919 + ci * 104729) >>> 0);
    const gauss = () => { const u1 = Math.max(rng(), 1e-12), u2 = rng(); const r = Math.sqrt(-2 * Math.log(u1)); return [r * Math.cos(TWO_PI * u2), r * Math.sin(TWO_PI * u2)]; };
    const dk = TWO_PI / L;
    // wavenumber band of this cascade (no double counting between cascades)
    const kLo = ci === 0 ? 0 : (TWO_PI / o.cascades[ci]) * 6;
    const kHi = ci === o.cascades.length - 1 ? Infinity : (TWO_PI / o.cascades[ci + 1]) * 6;
    const h0 = new Float64Array(2 * N * N), omega = new Float64Array(N * N), kxA = new Float64Array(N * N), kzA = new Float64Array(N * N);
    let slopeVar = 0, heightVar = 0;
    const varByLevel = new Float64Array(Math.log2(N) + 1);   // slope variance resolved at each mip
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const idx = j * N + i;
      const n = i < N / 2 ? i : i - N, m = j < N / 2 ? j : j - N;
      const kx = n * dk, kz = m * dk, k = Math.hypot(kx, kz);
      kxA[idx] = kx; kzA[idx] = kz;
      const [gr, gi] = gauss();
      if (k < 1e-6 || k < kLo || k >= kHi || i === N / 2 || j === N / 2) continue;
      const th = o.depth < 1e8 ? Math.tanh(Math.min(k * o.depth, 20)) : 1;
      const w = Math.sqrt(G * k * th);
      omega[idx] = w;
      const dwdk = (G * (th + (o.depth < 1e8 ? k * o.depth * (1 - th * th) : 0))) / (2 * w);
      const theta = Math.atan2(kz, kx) - dirRad;
      const Sk = (spec.S(w) * spec.D(w, theta) * dwdk) / k;          // S(kx, kz)
      const amp = Math.sqrt(Math.max(Sk, 0) * dk * dk / 2) * o.amplitude;
      h0[2 * idx] = gr * amp; h0[2 * idx + 1] = gi * amp;
      const e = Sk * dk * dk * o.amplitude * o.amplitude;
      heightVar += e; slopeVar += k * k * e;
      // the mip level at which this wave is averaged away: wavelength < 2 texels of that level
      const lvl = Math.max(0, Math.min(varByLevel.length - 1, Math.floor(Math.log2((Math.PI * N) / (k * L)))));
      for (let q = 0; q <= lvl; q++) varByLevel[q] += k * k * e;
    }
    const disp = new Float32Array(N * N * 4), deriv = new Float32Array(N * N * 4);
    const mkTex = (data) => {
      const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.FloatType);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter; t.minFilter = o.mipFilter === "trilinear" ? THREE.LinearMipmapLinearFilter : THREE.LinearMipmapNearestFilter; t.generateMipmaps = true;
      t.needsUpdate = true;
      return t;
    };
    return {
      L, h0, omega, kxA, kzA, heightVar, slopeVar, varByLevel,
      buf: [new Float64Array(2 * N * N), new Float64Array(2 * N * N), new Float64Array(2 * N * N), new Float64Array(2 * N * N)],
      disp, deriv, dispTex: mkTex(disp), derivTex: mkTex(deriv),
    };
  });

  const lambda = o.choppiness;
  function evolve(c, t) {
    const [A, B, C, D] = c.buf;
    const { h0, omega, kxA, kzA } = c;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const idx = j * N + i;
      const w = omega[idx];
      if (w === 0) { for (const X of c.buf) { X[2 * idx] = 0; X[2 * idx + 1] = 0; } continue; }
      // conj(h0(-k))
      const ni = (N - i) % N, nj = (N - j) % N, nidx = nj * N + ni;
      const ph = (w * t) % TWO_PI, cs = Math.cos(ph), sn = Math.sin(ph);
      const ar = h0[2 * idx], ai = h0[2 * idx + 1], br = h0[2 * nidx], bi = -h0[2 * nidx + 1];
      // h = a e^{iwt} + b e^{-iwt}
      const hr = ar * cs - ai * sn + br * cs + bi * sn;
      const hi = ar * sn + ai * cs - br * sn + bi * cs;
      const kx = kxA[idx], kz = kzA[idx], k = Math.hypot(kx, kz);
      // spectra (multiplying by i: (r, i) -> (-i, r))
      const dxr = (kx / k) * hi, dxi = -(kx / k) * hr;       // Dx = -i kx/k h
      const dzr = (kz / k) * hi, dzi = -(kz / k) * hr;       // Dz = -i kz/k h
      const sxr = -kx * hi, sxi = kx * hr;                   // dh/dx = i kx h
      const szr = -kz * hi, szi = kz * hr;                   // dh/dz = i kz h
      const fxx = (kx * kx) / k, fzz = (kz * kz) / k, fxz = (kx * kz) / k;   // dDx/dx = kx^2/k h ...
      // pack two real fields per complex IFFT: X = F1 + i F2
      A[2 * idx] = dxr - hi; A[2 * idx + 1] = dxi + hr;                     // Dx + i h
      B[2 * idx] = dzr - sxi; B[2 * idx + 1] = dzi + sxr;                   // Dz + i dh/dx
      C[2 * idx] = szr - fxx * hi; C[2 * idx + 1] = szi + fxx * hr;         // dh/dz + i dDx/dx
      D[2 * idx] = fzz * hr - fxz * hi; D[2 * idx + 1] = fzz * hi + fxz * hr; // dDz/dz + i dDx/dz
    }
    for (const X of c.buf) ifft2(X);
    const disp = c.disp, deriv = c.deriv;
    for (let p = 0; p < N * N; p++) {
      // (-1)^(i+j) is not needed: k uses FFT ordering (no centring shift)
      disp[4 * p] = lambda * A[2 * p];        // Dx
      disp[4 * p + 1] = A[2 * p + 1];         // h
      disp[4 * p + 2] = lambda * B[2 * p];    // Dz
      disp[4 * p + 3] = lambda * D[2 * p + 1]; // dDx/dz
      deriv[4 * p] = B[2 * p + 1];            // dh/dx
      deriv[4 * p + 1] = C[2 * p];            // dh/dz
      deriv[4 * p + 2] = lambda * C[2 * p + 1]; // dDx/dx
      deriv[4 * p + 3] = lambda * D[2 * p];   // dDz/dz
    }
    c.dispTex.needsUpdate = true; c.derivTex.needsUpdate = true;
  }

  // -------------------------------------------------------- the surface --
  // Camera-centred radial grid: rings spaced exponentially (vertex spacing
  // grows with distance, ~1:1 aspect), displacement sampled from a mip that
  // matches the local vertex spacing (band-limited -> no swimming/aliasing).
  const M = o.segments;
  // The grid is a SECTOR facing the camera (its angular width follows the
  // field of view, set per frame) - no vertices are spent behind the camera.
  // Rings: square cells near the camera; farther out the radial step grows
  // faster than the lateral one (at grazing angles the radial direction is
  // foreshortened), capped at 6% per ring, out to ~20 km (~510 rings x 257).
  // Vertex attribute: (radius, radial spacing, u in [0,1] across the sector).
  const k0 = (o.sectorAngle ?? 2.6) / M;
  const R1 = o.gridFocus ?? 30;
  const radii = [];
  for (let r = o.innerRadius; r < (o.outerRadius ?? 20000); ) { radii.push(r); r *= 1 + Math.min(o.maxRingGrowth ?? 0.06, k0 * (1 + r / R1)); }
  const R = radii.length - 1;
  const W = M + 1;
  const pos = new Float32Array((R + 1) * W * 3 + 3), idx = [];
  for (let i = 0; i <= R; i++) {
    const sp = i < R ? radii[i + 1] - radii[i] : radii[i] - radii[i - 1];
    for (let s2 = 0; s2 <= M; s2++) pos.set([radii[i], sp, s2 / M], 3 * (i * W + s2));
  }
  for (let i = 0; i < R; i++) for (let s2 = 0; s2 < M; s2++) {
    const a0 = i * W + s2, b0 = i * W + s2 + 1, c0 = (i + 1) * W + s2, d0 = (i + 1) * W + s2 + 1;
    idx.push(a0, b0, c0, b0, d0, c0);    // counter-clockwise seen from above
  }
  const centre = (R + 1) * W;
  pos.set([0, o.innerRadius, 0.5], 3 * centre);
  for (let s2 = 0; s2 < M; s2++) idx.push(centre, s2 + 1, s2);
  const pos2 = pos;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
  geo.setIndex(idx);
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos2.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const outerRadius = radii[R];
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), outerRadius * 1.01);

  const uniforms = {
    dkOceanDisp: { value: cascades.map((c) => c.dispTex) },
    dkOceanDeriv: { value: cascades.map((c) => c.derivTex) },
    dkOceanL: { value: new THREE.Vector4(...[0, 1, 2, 3].map((i) => cascades[i]?.L ?? 1)) },
    dkOceanN: { value: N },
    dkOceanVar: { value: new THREE.Vector4() },          // per cascade: total slope variance
    dkOceanVarLvl: { value: new Float32Array(3 * 12) },  // per cascade, per mip: resolved slope variance
    dkDeep: { value: new THREE.Color(...o.deepColor) },
    dkScatter: { value: new THREE.Color(...o.scatterColor) },
    dkAbsorb: { value: new THREE.Vector3(...o.absorption) },
    dkTurbidity: { value: o.turbidity },
    dkFoamColor: { value: new THREE.Color(...o.foamColor) },
    dkFoamAmount: { value: o.foamAmount }, dkFoamThreshold: { value: o.foamThreshold },
    dkShoreFoam: { value: o.shoreFoam }, dkShoreWidth: { value: o.shoreFoamWidth }, dkSurf: { value: o.surf },
    // ship wakes (setWake): per wake xy = stern position (world x, z), zw = heading (unit, x/z);
    // P: x = hull length, y = half beam, z = strength (0 = off), w = wake length (m)
    dkWake: { value: [new THREE.Vector4(), new THREE.Vector4()] }, dkWakeP: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    dkRough: { value: o.roughness }, dkRefract: { value: o.refraction }, dkReflTint: { value: new THREE.Color(...o.reflectionTint) },
    dkOceanTime: { value: 0 },
    dkSector: { value: new THREE.Vector2(0, Math.PI) },   // centre azimuth, half width (rad)
    dkSunDirO: { value: new THREE.Vector3(0, 1, 0) }, dkSunColO: { value: new THREE.Color(0, 0, 0) },
    // late pass (set by the cinematic runtime when it draws the ocean after the scene)
    dkSceneDepth: { value: null }, dkSceneColor: { value: null }, dkLateOn: { value: 0 },
    // ambient (sky) irradiance for the water body: a 1x1 texture from the cinematic sky, or a colour
    dkAmbTex: { value: null }, dkAmbFromTex: { value: 0 }, dkAmbColor: { value: new THREE.Color(0.25, 0.3, 0.38) },
    dkLateSize: { value: new THREE.Vector2(1, 1) }, dkLateNearFar: { value: new THREE.Vector2(0.1, 1000) }, dkProj11: { value: 1 },
    dkProjM: { value: new THREE.Matrix4() }, dkSSR: { value: o.ssr ? 1 : 0 },
  };
  cascades.forEach((c, ci) => {
    uniforms.dkOceanVar.value.setComponent(ci, c.slopeVar);
    for (let l = 0; l < 12; l++) uniforms.dkOceanVarLvl.value[ci * 12 + l] = c.varByLevel[Math.min(l, c.varByLevel.length - 1)] ?? 0;
  });
  const NC = cascades.length;

  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(...o.deepColor), roughness: o.roughness, metalness: 0, ior: 1.333, envMapIntensity: 1,
  });
  material.name = 'DKOcean';
  material.userData.dkNoSSAO = true;    // screen-space AO / contact shadows come from the ground under the water: not for the surface
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.defines = { ...(shader.defines || {}), DK_OCEAN_NC: NC };
    const common = /* glsl */ `
uniform sampler2D dkOceanDisp[${NC}];
uniform sampler2D dkOceanDeriv[${NC}];
uniform vec4 dkOceanL;
uniform float dkOceanN;
uniform vec2 dkSector;
varying vec3 vDkOceanW;
varying float vDkOceanH;
`;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + common)
      .replace('#include <begin_vertex>', /* glsl */ `
// sector grid: position.x = radius, position.z = 0..1 across the sector
float dkAng = dkSector.x + (position.z - 0.5) * 2.0 * dkSector.y;
vec3 transformed = vec3(cos(dkAng) * position.x, 0.0, sin(dkAng) * position.x);
{
  vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
  // vertex spacing here: the larger of the radial step and the lateral one
  float spacing = max(max(position.y, position.x * 2.0 * dkSector.y / ${M}.0), 0.02);
  vec3 dsum = vec3(0.0);
  float hsum = 0.0;
  #pragma unroll_loop_start
  for (int i = 0; i < ${NC}; i++) {
    {
    float L = dkOceanL[ i ];
    float lod = max(0.0, log2(spacing * dkOceanN / L) + 0.5);
    vec4 d = textureLod(dkOceanDisp[ i ], wp.xz / L, lod);
    dsum += vec3(d.x, d.y, d.z);
    }
  }
  #pragma unroll_loop_end
  transformed += dsum;
  vDkOceanH = dsum.y;
  vDkOceanW = wp + dsum;
}
`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + common + /* glsl */ `
uniform vec4 dkOceanVar;
uniform float dkOceanVarLvl[${NC * 12}];
uniform vec3 dkDeep, dkScatter, dkAbsorb, dkFoamColor;
uniform float dkTurbidity, dkFoamAmount, dkFoamThreshold, dkShoreFoam, dkShoreWidth, dkRough, dkRefract, dkOceanTime, dkSurf;
uniform vec4 dkWake[2]; uniform vec4 dkWakeP[2];
uniform vec3 dkSunDirO, dkSunColO;
uniform highp sampler2D dkSceneDepth;
uniform sampler2D dkSceneColor;
uniform float dkLateOn;
uniform vec2 dkLateSize, dkLateNearFar;
uniform float dkProj11;               // projection[1][1] (the fragment stage has no projection matrix)
uniform mat4 dkProjM;
uniform float dkSSR;
uniform vec3 dkReflTint;
uniform sampler2D dkAmbTex;
uniform float dkAmbFromTex;
uniform vec3 dkAmbColor;
float dkOViewZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * dkLateNearFar.x * dkLateNearFar.y / ((dkLateNearFar.y + dkLateNearFar.x) - z * (dkLateNearFar.y - dkLateNearFar.x)); }
float dkOHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float dkONoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dkOHash(i), dkOHash(i + vec2(1, 0)), u.x), mix(dkOHash(i + vec2(0, 1)), dkOHash(i + vec2(1, 1)), u.x), u.y); }
`)
      .replace('#include <map_fragment>', /* glsl */ `
// ---- ocean: slopes, Jacobian (foam), unresolved slope variance (roughness)
vec2 dkSlope = vec2(0.0); float dkJxx = 1.0, dkJzz = 1.0, dkJxz = 0.0; float dkUnres = 0.0;
{
  vec2 wxz = vDkOceanW.xz;
  #pragma unroll_loop_start
  for (int i = 0; i < ${NC}; i++) {
    {
    float L = dkOceanL[ i ];
    vec2 uv = wxz / L;
    vec4 dv = texture2D(dkOceanDeriv[ i ], uv);
    dkSlope += dv.xy; dkJxx += dv.z; dkJzz += dv.w;
    // mip level the texture sampler used here -> slope variance it could not show
    vec2 du = dFdx(uv) * dkOceanN, dvv = dFdy(uv) * dkOceanN;
    float lvl = clamp(0.5 * log2(max(dot(du, du), dot(dvv, dvv))), 0.0, 11.0);
    int l0 = int(floor(lvl)); float lf = fract(lvl);
    float resolved = mix(dkOceanVarLvl[ UNROLLED_LOOP_INDEX * 12 + l0 ], dkOceanVarLvl[ UNROLLED_LOOP_INDEX * 12 + min(l0 + 1, 11) ], lf);
    dkUnres += max(dkOceanVar[ UNROLLED_LOOP_INDEX ] - resolved, 0.0);
    }
  }
  #pragma unroll_loop_end
}
vec3 dkNw = normalize(vec3(-dkSlope.x / max(dkJxx, 0.2), 1.0, -dkSlope.y / max(dkJzz, 0.2)));
float dkJ = dkJxx * dkJzz - dkJxz * dkJxz;
float dkFoam = clamp((dkFoamThreshold - dkJ) * 2.5, 0.0, 1.0) * dkFoamAmount;
// foam texture: streaky bubbles that drift with the water (only evaluated where foam can be)
float dkFn = 0.5;
float dkFoamPossible = dkFoam + (dkLateOn > 0.5 ? dkShoreFoam : 0.0) + dkWakeP[0].z + dkWakeP[1].z;
if (dkFoamPossible > 0.0) dkFn = dkONoise(vDkOceanW.xz * 1.7 + dkOceanTime * 0.05) * 0.6 + dkONoise(vDkOceanW.xz * 6.3) * 0.4;
dkFoam *= smoothstep(0.25, 0.75, dkFn + dkFoam * 0.4);
// ship wakes: a foam collar where the hull pushes the water aside (strongest at the bow),
// churned water astern that widens, breaks up and fades, and the two Kelvin arms (19.5 deg)
// running back from the bow
for (int k = 0; k < 2; k++) {
  if (dkWakeP[k].z <= 0.0) continue;
  vec2 hd = dkWake[k].zw;
  vec2 dw = vDkOceanW.xz - dkWake[k].xy;
  float behind = -dot(dw, hd);                       // metres astern of the stern
  float across = dot(dw, vec2(-hd.y, hd.x));
  float Lh = dkWakeP[k].x * 0.5, Bh = dkWakeP[k].y;
  float a = -behind + Lh;                            // along the hull from midships (+ = toward the bow)
  float e = length(vec2(a / Lh, across / Bh));
  float collar = (1.0 - smoothstep(1.0, 1.0 + (0.12 + 0.3 * smoothstep(0.0, Lh, a)) * (0.7 + 0.6 * dkFn), e)) * step(0.97, e) * (0.55 + 0.45 * smoothstep(-Lh, Lh, a));
  float fade = exp(-max(behind, 0.0) / max(dkWakeP[k].w, 1.0));
  float w = Bh * (0.55 + 0.03 * max(behind, 0.0));
  float sn = dkONoise(vec2(behind * 0.12, across * 0.9) + dkWake[k].xy * 0.013) * 0.55 + dkONoise(vec2(behind * 0.5, across * 2.7)) * 0.25 + dkFn * 0.2;
  float centre = step(0.0, behind) * (1.0 - smoothstep(0.3 * w, w, abs(across) + (sn - 0.5) * w * 0.8)) * fade;
  centre *= smoothstep(0.35, 0.65, sn + 0.35 * fade);
  float fromBow = behind + 2.0 * Lh;
  float armD = abs(abs(across) - fromBow * 0.354 - Bh * 0.4);
  float arm = step(0.0, fromBow) * (1.0 - smoothstep(0.0, 0.25 + fromBow * 0.025, armD)) * exp(-fromBow / max(dkWakeP[k].w * 0.3, 1.0));
  arm *= smoothstep(0.4, 0.7, sn + 0.2);
  dkFoam = max(dkFoam, max(max(centre * 0.85, arm * 0.4), collar) * dkWakeP[k].z);
}
// shallow water / shore foam (late pass: the scene behind the surface is known)
float dkThick = 1e6; vec3 dkBehind = vec3(0.0);
if (dkLateOn > 0.5) {
  vec2 suv = gl_FragCoord.xy / dkLateSize;
  float sz = dkOViewZ(texelFetch(dkSceneDepth, ivec2(gl_FragCoord.xy), 0).r);
  float wz = vViewPosition.z;                   // view depth of the water surface
  float viewLen = length(vViewPosition) / max(vViewPosition.z, 1e-4);
  dkThick = max(sz - wz, 0.0) * viewLen;
  // refraction: offset by the surface slope, fading in with the water depth
  vec2 off = dkNw.xz * dkRefract * min(dkThick, 2.0) / max(wz, 1.0) * 30.0;
  vec2 ruv = clamp(suv + off, vec2(0.001), vec2(0.999));
  float rz = dkOViewZ(texture2D(dkSceneDepth, ruv).r);
  if (rz < wz) ruv = suv;                       // do not refract things in front of the water
  dkBehind = texture2D(dkSceneColor, ruv).rgb;
  // distance from the surface point to what is behind it decides where the foam line is
  // (seen from above that is the water depth; at a grazing angle it is the distance to the
  // rock face, not the depth at which the ray meets it - which would foam 30 m of sea in
  // front of every rock); also look around (6 taps on a ring ~2 foam widths across) so
  // foam surrounds rocks and hulls
  float depthV = dkThick, ringMin = 1e6;
  if (dkShoreFoam > 0.0) {
    float rpx = 2.0 * dkShoreWidth * dkProj11 * 0.5 * dkLateSize.y / max(wz, 0.5);
    rpx = clamp(rpx, 2.0, 64.0);
    for (int k = 0; k < 6; k++) {
      float a = float(k) * 1.0471976 + dkFn * 3.0;
      vec2 q = clamp(gl_FragCoord.xy + vec2(cos(a), sin(a)) * rpx, vec2(0.5), dkLateSize - 0.5);
      float nz = dkOViewZ(texelFetch(dkSceneDepth, ivec2(q), 0).r);
      // something at about the water's own depth there = a rock / hull / shore cutting the surface nearby
      float dv = abs(nz - wz) * viewLen;
      depthV = min(depthV, dv + dkShoreWidth * 0.35);
      // the surf core only where something stands up through the surface (rock, cliff, hull):
      // its depth is at or in front of the water's own - not the sea bed seen through shallows
      if (nz < wz + 0.5 * dkShoreWidth + 0.5) ringMin = min(ringMin, abs(nz - wz));   // along the view axis: at grazing angles the slant distance would hide the surf
    }
  }
  float shore = 1.0 - smoothstep(0.0, dkShoreWidth, depthV);
  float lines = 0.5 + 0.5 * sin(depthV * 9.0 - dkOceanTime * 1.6 + dkFn * 4.0);
  dkFoam = max(dkFoam, shore * dkShoreFoam * smoothstep(0.45, 0.9, dkFn * 0.6 + lines * 0.6 * shore));
  // breaking surf: a solid whitewater band right where the water meets the obstacle
  float core = 1.0 - smoothstep(0.0, dkShoreWidth * 0.45, ringMin);
  dkFoam = max(dkFoam, core * dkSurf * (0.55 + 0.45 * smoothstep(0.2, 0.7, dkFn)));
}
dkFoam = clamp(dkFoam, 0.0, 1.0);
#include <map_fragment>
`)
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize((viewMatrix * vec4(dkNw, 0.0)).xyz);')
      .replace('#include <envmap_physical_pars_fragment>', '#include <envmap_physical_pars_fragment>\n' + /* glsl */ `
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
// sea reflections: a reflected ray that points below the horizon would meet the next wave,
// which reflects the sky again - mirror it up (dimmed) instead of showing the environment's ground
// screen-space reflection of the scene behind (colour/depth copies of the late pass):
// march the reflected ray in view space with growing steps, refine the first hit
vec4 dkSeaSSR( vec3 viewPos, vec3 rv ) {
  if ( dkLateOn < 0.5 || dkSSR < 0.5 || rv.z > 0.2 ) return vec4( 0.0 );
  float t = 0.4 + 0.004 * -viewPos.z, prevT = 0.0;
  for ( int i = 0; i < ${o.ssrSteps}; i ++ ) {
    vec3 p = viewPos + rv * t;
    vec4 c = dkProjM * vec4( p, 1.0 );
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    if ( c.w <= 0.0 || uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) break;
    float sz = dkOViewZ( texelFetch( dkSceneDepth, ivec2( uv * dkLateSize ), 0 ).r );
    float dz = -p.z - sz;
    if ( dz > 0.0 && dz < 0.6 + 0.025 * sz ) {
      // refine between the last miss and this hit
      float a = prevT, b = t;
      for ( int k = 0; k < 4; k ++ ) {
        float m = 0.5 * ( a + b );
        vec3 q = viewPos + rv * m;
        vec4 cq = dkProjM * vec4( q, 1.0 );
        vec2 uq = cq.xy / cq.w * 0.5 + 0.5;
        float zq = dkOViewZ( texelFetch( dkSceneDepth, ivec2( uq * dkLateSize ), 0 ).r );
        if ( -q.z > zq ) { b = m; uv = uq; } else a = m;
      }
      vec2 edge = smoothstep( vec2( 0.0 ), vec2( 0.08 ), uv ) * smoothstep( vec2( 0.0 ), vec2( 0.08 ), 1.0 - uv );
      // long rays over a rough sea are where single hit/miss decisions alias into speckle: fade them
      float reach = 1.0 - smoothstep( 8.0, 40.0, b );
      return vec4( texture2D( dkSceneColor, uv ).rgb, edge.x * edge.y * smoothstep( 0.2, -0.1, rv.z ) * reach );
    }
    prevT = t;
    t *= 1.32;
  }
  return vec4( 0.0 );
}
vec3 dkSeaIBLEnv( const in vec3 viewDir, const in vec3 normal, const in float roughness );
vec3 dkSeaIBL( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
  vec4 dkS = dkSeaSSR( -vViewPosition, reflect( - viewDir, normal ) );
  vec3 dkEnvR = dkSeaIBLEnv( viewDir, normal, roughness );
  return mix( dkEnvR, dkS.rgb, dkS.a * ( 1.0 - smoothstep( 0.15, 0.45, roughness ) ) );
}
vec3 dkSeaIBLEnv( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
  vec3 r = reflect( - viewDir, normal );
  r = normalize( mix( r, normal, roughness * roughness ) );
  r = inverseTransformDirection( r, viewMatrix );
  float below = clamp( - r.y * 4.0, 0.0, 1.0 );
  r.y = abs( r.y ) * mix( 1.0, 0.35, below ) + 0.01;
#ifdef DK_FASTIBL
  return dkEnvRadiance( envMapRotation * normalize( r ), roughness ) * envMapIntensity * mix( 1.0, 0.55, below ) * dkReflTint;
#else
  return textureCubeUV( envMap, envMapRotation * normalize( r ), roughness ).rgb * envMapIntensity * mix( 1.0, 0.55, below ) * dkReflTint;
#endif
}
#endif
`)
      .replace('#include <lights_fragment_maps>', THREE.ShaderChunk.lights_fragment_maps
        .replace('iblIrradiance += getIBLIrradiance( geometryNormal );', '// water body: the sky irradiance (spherical harmonics of the environment with the cinematic stack,\n\t\t// else one value per frame) - not an environment lookup per pixel\n\t#ifdef DK_FASTIBL\n\t\tiblIrradiance += dkSHIrr( envMapRotation * inverseTransformDirection( geometryNormal, viewMatrix ) ) * envMapIntensity;\n\t#else\n\t\tiblIrradiance += 3.14159265 * ( dkAmbFromTex > 0.5 ? texelFetch( dkAmbTex, ivec2( 0 ), 0 ).rgb : dkAmbColor );\n\t#endif')
        .replace('radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );', 'radiance += dkSeaIBL( geometryViewDir, geometryNormal, material.roughness );'))
      .replace('#include <roughnessmap_fragment>', /* glsl */ `
float roughnessFactor = sqrt(dkRough * dkRough + 2.0 * dkUnres);   // Beckmann slope variance -> GGX alpha (approx.)
roughnessFactor = mix(clamp(roughnessFactor, 0.02, 0.6), 0.75, dkFoam);
`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(dkDeep, dkFoamColor, dkFoam);')
      .replace('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;', /* glsl */ `
// water body: deep colour (three's diffuse with the deep albedo), shallow water shows the
// refracted ground through Beer-Lambert absorption + turbidity; everything below the
// surface is seen through (1 - Fresnel); backlit crests glow (subsurface)
float dkNV = saturate(dot(normal, normalize(vViewPosition)));
float dkF = 0.02 + 0.98 * pow(1.0 - dkNV, 5.0);
vec3 dkBody = totalDiffuse;
if (dkLateOn > 0.5 && dkThick < 1e5) {
  vec3 T = exp(-dkAbsorb * dkThick);
  float scat = 1.0 - exp(-dkTurbidity * dkThick);
  dkBody = mix(dkBehind * T, totalDiffuse, mix(scat, 1.0, dkFoam));
}
vec3 dkV = normalize(cameraPosition - vDkOceanW);
float dkSss = pow(saturate(dot(dkV, -normalize(dkSunDirO + dkNw * 0.6))), 4.0) * saturate(0.3 + vDkOceanH * 0.35);
dkBody += dkScatter * dkSunColO * dkSss * (1.0 - dkFoam) * 0.6;
vec3 outgoingLight = dkBody * mix(1.0 - dkF, 1.0, dkFoam) + totalSpecular + totalEmissiveRadiance;
`);
  };
  material.customProgramCacheKey = () => `dk-ocean-${NC}`;

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'dk-ocean';
  mesh.frustumCulled = false;
  mesh.castShadow = o.castShadow;
  mesh.receiveShadow = true;
  mesh.userData.dkLate = true;          // cinematic stack: drawn after the scene (sees what is behind it)
  mesh.userData.dkNoVelocity = true;    // the grid follows the camera; the water itself has camera-only motion
  mesh.userData.dkOcean = { uniforms };

  const camPos = new THREE.Vector3();
  function update(t) {
    // (always evolve, also for the motion-blur "shutter-open" pose: heightAt() must
    // answer for exactly this t, whatever was rendered before)
    for (const c of cascades) evolve(c, t);
    uniforms.dkOceanTime.value = t;
    mesh.userData.dkOceanTime = t;
  }
  // keep the grid centred under the camera (the waves stay put in the world)
  const fwd = new THREE.Vector3();
  mesh.onBeforeRender = (renderer, scene, camera) => {
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(fwd);
    // horizontal half field of view (+ margin for displaced geometry); the full disc when looking down
    const hfov = Math.atan(Math.tan(((camera.fov || 50) * Math.PI) / 360) * (camera.aspect || 1.78));
    const pitchDown = -fwd.y;                     // 1 = straight down
    const half = pitchDown > 0.55 || camPos.y > 150 ? Math.PI : Math.min(Math.PI, hfov + 0.5 + Math.max(0, pitchDown) * 1.5);
    uniforms.dkSector.value.set(Math.atan2(fwd.z, fwd.x), half);
    if (mesh.position.x !== camPos.x || mesh.position.z !== camPos.z) {
      mesh.position.set(camPos.x, mesh.position.y, camPos.z);
      mesh.updateMatrixWorld();
    }
    // ambient for the water body when no cinematic sky provides one: the average of an
    // equirect HDRI background's upper half (computed once per texture), else a hemisphere light
    if (!uniforms.dkAmbFromTex.value && mesh.userData.ambFrom !== (scene.background?.uuid ?? 'none')) {
      mesh.userData.ambFrom = scene.background?.uuid ?? 'none';
      const bg = scene.background, img = bg?.image;
      if (img?.data && img.width && img.height) {
        const half = bg.type === THREE.HalfFloatType, d = img.data, ch = Math.round(d.length / (img.width * img.height));
        const acc = [0, 0, 0]; let n = 0;
        for (let y = 0; y < img.height / 2; y += Math.max(1, Math.floor(img.height / 64))) {
          for (let x = 0; x < img.width; x += Math.max(1, Math.floor(img.width / 128))) {
            const i = (y * img.width + x) * ch;
            for (let k = 0; k < 3; k++) acc[k] += half ? THREE.DataUtils.fromHalfFloat(d[i + k]) : d[i + k];
            n++;
          }
        }
        const k = (scene.backgroundIntensity ?? 1) / Math.max(n, 1);
        uniforms.dkAmbColor.value.setRGB(Math.min(acc[0] * k, 50), Math.min(acc[1] * k, 50), Math.min(acc[2] * k, 50));
      } else {
        let hemi = null;
        scene.traverse((l) => { if (!hemi && l.isHemisphereLight) hemi = l; });
        if (hemi) uniforms.dkAmbColor.value.copy(hemi.color).multiplyScalar(hemi.intensity / Math.PI);
      }
    }
    // sun for the subsurface glow: the first shadow-casting directional light
    if (!mesh.userData.sun) scene.traverse((l) => { if (!mesh.userData.sun && l.isDirectionalLight && l.castShadow) mesh.userData.sun = l; });
    const sun = mesh.userData.sun;
    if (sun) {
      uniforms.dkSunDirO.value.setFromMatrixPosition(sun.matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(sun.target.matrixWorld)).normalize();
      uniforms.dkSunColO.value.copy(sun.color).multiplyScalar(sun.intensity);
    }
  };
  /** Water surface height (m) at world x, z for the current time (no horizontal displacement correction). */
  function heightAt(x, z) {
    let h = 0;
    for (const c of cascades) {
      const fx = (((x / c.L) % 1) + 1) % 1 * N, fz = (((z / c.L) % 1) + 1) % 1 * N;
      const i0 = Math.floor(fx) % N, j0 = Math.floor(fz) % N, i1 = (i0 + 1) % N, j1 = (j0 + 1) % N, u = fx - Math.floor(fx), v = fz - Math.floor(fz);
      const H = (i, j) => c.disp[4 * (j * N + i) + 1];
      h += (H(i0, j0) * (1 - u) + H(i1, j0) * u) * (1 - v) + (H(i0, j1) * (1 - u) + H(i1, j1) * u) * v;
    }
    return h + mesh.position.y;
  }
  const hs = 4 * Math.sqrt(cascades.reduce((a, c) => a + c.heightVar, 0));
  const stats = { significantWaveHeight: hs, peakPeriod: TWO_PI / spec.wp, outerRadius, vertices: pos2.length / 3, triangles: idx.length / 3, slopeRms: Math.sqrt(cascades.reduce((a, c) => a + c.slopeVar, 0)) };
  update(0);
  /** Ship wake i (0/1): { x, z } of the stern, heading [dx, dz], hull length, beam, strength 0..1 (0 = off), length (m) */
  function setWake(i, w) {
    const h = new THREE.Vector2(w.heading[0], w.heading[1]).normalize();
    uniforms.dkWake.value[i].set(w.x, w.z, h.x, h.y);
    uniforms.dkWakeP.value[i].set(w.hullLength ?? 15, (w.beam ?? 4) / 2, w.strength ?? 1, w.length ?? 120);
  }
  return { mesh, material, uniforms, update, heightAt, setWake, stats, options: o };
}
