// FFT ocean on the GPU (dk/ocean.js uses it with { gpuFFT: true }; the quality tiers above final
// turn it on with 512 x 512 cascades). The same maths as the CPU path in ocean.js - the same
// spectrum h0(k), the same packing of eight real fields into four complex inverse FFTs, the same
// radix-2 decimation-in-time butterflies with a bit-reversed first stage - done in float32
// fragment passes instead of float64 JavaScript:
//
//   spectrum pass   h(k, t) from h0(k), conj(h0(-k)) and the dispersion; writes the four packed
//                   complex fields A..D into two RGBA32F targets (MRT)
//   log2(N) passes  along x, then log2(N) along y, each output texel = in[a] + w * in[b] for the
//                   2 complex values of each target (butterfly table: w, a, b per stage, from the CPU)
//   assemble pass   displacement (Dx, h, Dz, dDx/dz) and derivatives (dh/dx, dh/dz, dDx/dx, dDz/dz),
//                   mip-mapped like the CPU textures
//
// The phase w*t is kept exact over hour-long episodes: per texel the frequency f = w / 2 pi is split
// on the CPU (float64) into fract(64 f) and f, and the shader adds fract(fract(64 f) * floor(t / 64))
// and f * (t mod 64) - every term stays small enough for float32.
// heightAt() (buoyancy) reads back only the texels it needs, only when it is asked for: one tiny gather
// pass writes the 4 corner heights of every cascade around the asked point into a (4 x cascades) x 1
// target, and those 16 floats are read (not the whole 512 x 512 RGBA32F cascades, ~4 MB each, per
// sub-frame); the bilinear blend stays on the CPU in float64, exactly as for the CPU FFT.
// Everything is a pure function of t; the same GPU and driver give the same bytes every time.
import * as THREE from 'three';

const VERT = `in vec3 position;\nvoid main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const HEAD = `precision highp float;\nprecision highp int;\n`;

function raw(fs, uniforms) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: HEAD + fs, uniforms,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
}

const SPECTRUM = `
uniform highp sampler2D tH0;   // h0(k).re, h0(k).im, conj(h0(-k)).re, conj(h0(-k)).im
uniform highp sampler2D tK;    // kx, kz, fract(64 f), f   (f = omega / 2 pi; 0 = no wave)
uniform float uTA, uTB;        // floor(t / 64), t - 64 floor(t / 64)
layout(location = 0) out vec4 oA;
layout(location = 1) out vec4 oB;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 K = texelFetch(tK, p, 0);
  if (K.w == 0.0) { oA = vec4(0.0); oB = vec4(0.0); return; }
  vec4 h0 = texelFetch(tH0, p, 0);
  float cyc = fract(fract(K.z * uTA) + K.w * uTB);
  float ph = 6.283185307179586 * cyc, cs = cos(ph), sn = sin(ph);
  float hr = h0.x * cs - h0.y * sn + h0.z * cs + h0.w * sn;
  float hi = h0.x * sn + h0.y * cs - h0.z * sn + h0.w * cs;
  float kx = K.x, kz = K.y, k = length(K.xy);
  float dxr = (kx / k) * hi, dxi = -(kx / k) * hr;
  float dzr = (kz / k) * hi, dzi = -(kz / k) * hr;
  float sxr = -kx * hi, sxi = kx * hr;
  float szr = -kz * hi, szi = kz * hr;
  float fxx = (kx * kx) / k, fzz = (kz * kz) / k, fxz = (kx * kz) / k;
  oA = vec4(dxr - hi, dxi + hr, dzr - sxi, dzi + sxr);
  oB = vec4(szr - fxx * hi, szi + fxx * hr, fzz * hr - fxz * hi, fzz * hi + fxz * hr);
}`;

const BUTTERFLY = `
uniform highp sampler2D tA, tB;
uniform highp sampler2D tBf;   // per stage (x) and index (y): w.re, w.im, a, b
uniform int uStage, uHoriz;
layout(location = 0) out vec4 oA;
layout(location = 1) out vec4 oB;
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int i = uHoriz == 1 ? p.x : p.y;
  vec4 bf = texelFetch(tBf, ivec2(uStage, i), 0);
  ivec2 pa = uHoriz == 1 ? ivec2(int(bf.z), p.y) : ivec2(p.x, int(bf.z));
  ivec2 pb = uHoriz == 1 ? ivec2(int(bf.w), p.y) : ivec2(p.x, int(bf.w));
  vec4 a0 = texelFetch(tA, pa, 0), a1 = texelFetch(tA, pb, 0);
  vec4 b0 = texelFetch(tB, pa, 0), b1 = texelFetch(tB, pb, 0);
  vec2 w = bf.xy;
  oA = vec4(a0.xy + cmul(w, a1.xy), a0.zw + cmul(w, a1.zw));
  oB = vec4(b0.xy + cmul(w, b1.xy), b0.zw + cmul(w, b1.zw));
}`;

const ASSEMBLE = `
uniform highp sampler2D tA, tB;
uniform float uLambda;
layout(location = 0) out vec4 oDisp;
layout(location = 1) out vec4 oDeriv;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 A = texelFetch(tA, p, 0), B = texelFetch(tB, p, 0);
  // A = (Dx + i h, Dz + i dh/dx), B = (dh/dz + i dDx/dx, dDz/dz + i dDx/dz)
  oDisp = vec4(uLambda * A.x, A.y, uLambda * A.z, uLambda * B.w);
  oDeriv = vec4(A.w, B.x, uLambda * B.y, uLambda * B.z);
}`;

// gather: output texel p = cascade p / 4, corner p % 4 (i0 j0, i1 j0, i0 j1, i1 j1): its height (.y)
const GATHER = `
uniform highp sampler2D tD0, tD1, tD2, tD3;
uniform ivec4 uI[4];           // per cascade: i0, j0, i1, j1
out vec4 o;
void main() {
  int p = int(gl_FragCoord.x);
  int c = p / 4, k = p - 4 * c;
  ivec4 q = uI[c];
  ivec2 at = k == 0 ? q.xy : k == 1 ? q.zy : k == 2 ? q.xw : q.zw;
  float h = c == 0 ? texelFetch(tD0, at, 0).y : c == 1 ? texelFetch(tD1, at, 0).y : c == 2 ? texelFetch(tD2, at, 0).y : texelFetch(tD3, at, 0).y;
  o = vec4(h, 0.0, 0.0, 1.0);
}`;

/** Butterfly table of the inverse radix-2 FFT (the CPU path's exact order): RGBA32F, log2(N) x N. */
function butterflyTexture(N) {
  const bits = Math.log2(N);
  const rev = new Uint32Array(N);
  for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
  const data = new Float32Array(bits * N * 4);
  for (let s = 0; s < bits; s++) {
    const size = 2 << s, half = size >> 1, step = N / size;
    for (let i = 0; i < N; i++) {
      const k = i % size;
      let a, b, wr, wi;
      if (k < half) { a = i; b = i + half; const ang = (2 * Math.PI * k * step) / N; wr = Math.cos(ang); wi = Math.sin(ang); }
      else { a = i - half; b = i; const ang = (2 * Math.PI * (k - half) * step) / N; wr = -Math.cos(ang); wi = -Math.sin(ang); }
      if (s === 0) { a = rev[a]; b = rev[b]; }
      data.set([wr, wi, a, b], 4 * (i * bits + s));
    }
  }
  const t = new THREE.DataTexture(data, bits, N, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

/**
 * GPU FFT for the ocean's cascades. cascades: [{ L, h0, omega, kxA, kzA }] from ocean.js (float64
 * arrays). Returns { textures: [{ disp, deriv }], compute(t), heights(ci) }.
 */
export function createGpuFFT(renderer, N, cascades, { lambda = 1, mipFilter = 'nearest' } = {}) {
  const rt = (o = {}) => new THREE.WebGLRenderTarget(N, N, {
    count: 2, type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, ...o,
  });
  const ping = rt(), pong = rt();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  quad.frustumCulled = false;
  quad.userData.dkFullscreen = true;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  const mats = {
    spec: raw(SPECTRUM, { tH0: { value: null }, tK: { value: null }, uTA: { value: 0 }, uTB: { value: 0 } }),
    bf: raw(BUTTERFLY, { tA: { value: null }, tB: { value: null }, tBf: { value: butterflyTexture(N) }, uStage: { value: 0 }, uHoriz: { value: 1 } }),
    asm: raw(ASSEMBLE, { tA: { value: null }, tB: { value: null }, uLambda: { value: lambda } }),
    gather: raw(GATHER, { tD0: { value: null }, tD1: { value: null }, tD2: { value: null }, tD3: { value: null }, uI: { value: new Int32Array(16) } }),
  };
  if (cascades.length > 4) throw new Error('ocean-gpu: at most 4 cascades');
  const gatherRT = new THREE.WebGLRenderTarget(4 * cascades.length, 1, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
  const gatherBuf = new Float32Array(4 * 4 * cascades.length);
  const bits = Math.log2(N);
  const outs = cascades.map((c) => {
    const h0 = new Float32Array(N * N * 4), k = new Float32Array(N * N * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const idx = j * N + i, nidx = ((N - j) % N) * N + ((N - i) % N);
      h0[4 * idx] = c.h0[2 * idx]; h0[4 * idx + 1] = c.h0[2 * idx + 1];
      h0[4 * idx + 2] = c.h0[2 * nidx]; h0[4 * idx + 3] = -c.h0[2 * nidx + 1];
      const f = c.omega[idx] / (2 * Math.PI), f64 = f * 64;
      k[4 * idx] = c.kxA[idx]; k[4 * idx + 1] = c.kzA[idx]; k[4 * idx + 2] = f64 - Math.floor(f64); k[4 * idx + 3] = f;
    }
    const tex = (d) => { const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat, THREE.FloatType); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; };
    const out = rt({ generateMipmaps: true, magFilter: THREE.LinearFilter, minFilter: mipFilter === 'trilinear' ? THREE.LinearMipmapLinearFilter : THREE.LinearMipmapNearestFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
    for (const t of out.textures) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.magFilter = THREE.LinearFilter; t.minFilter = out.texture.minFilter; }
    return { h0Tex: tex(h0), kTex: tex(k), out, t: null, heightsT: null, heights: null };
  });

  const draw = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quad, cam); };

  /** Evolve every cascade to time t (skipped when it is already there). */
  function compute(t) {
    const prevTarget = renderer.getRenderTarget(), prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    try {
      const m = Math.floor(t / 64), tb = t - 64 * m;
      for (const c of outs) {
        if (c.t === t) continue;
        const su = mats.spec.uniforms;
        su.tH0.value = c.h0Tex; su.tK.value = c.kTex; su.uTA.value = m; su.uTB.value = tb;
        draw(mats.spec, ping);
        let src = ping, dst = pong;
        const bu = mats.bf.uniforms;
        for (const horiz of [1, 0]) {
          for (let s = 0; s < bits; s++) {
            bu.tA.value = src.textures[0]; bu.tB.value = src.textures[1]; bu.uStage.value = s; bu.uHoriz.value = horiz;
            draw(mats.bf, dst);
            [src, dst] = [dst, src];
          }
        }
        const au = mats.asm.uniforms;
        au.tA.value = src.textures[0]; au.tB.value = src.textures[1];
        draw(mats.asm, c.out);            // three regenerates the mips of both textures
        c.t = t;
      }
    } finally { renderer.setRenderTarget(prevTarget); renderer.autoClear = prevAuto; }
  }

  /** The displacement texture of cascade ci read back (Float32Array N*N*4; .y = height), for buoyancy. */
  function displacement(ci) {
    const c = outs[ci];
    if (c.heights && c.heightsT === c.t) return c.heights;
    c.heights = c.heights || new Float32Array(N * N * 4);
    renderer.readRenderTargetPixels(c.out, 0, 0, N, N, c.heights, undefined, 0);
    c.heightsT = c.t;
    return c.heights;
  }

  /**
   * The heights of the 4 texels around a point in every cascade: idx = [[i0, j0, i1, j1] per cascade].
   * Returns a Float32Array of 4 * cascades heights (corner order i0j0, i1j0, i0j1, i1j1).
   */
  function corners(idx) {
    const u = mats.gather.uniforms;
    idx.forEach((q, ci) => { u.uI.value.set(q, 4 * ci); u[`tD${ci}`].value = outs[ci].out.textures[0]; });
    const prevTarget = renderer.getRenderTarget();
    try { draw(mats.gather, gatherRT); } finally { renderer.setRenderTarget(prevTarget); }
    renderer.readRenderTargetPixels(gatherRT, 0, 0, 4 * outs.length, 1, gatherBuf);
    const h = new Float32Array(4 * outs.length);
    for (let i = 0; i < h.length; i++) h[i] = gatherBuf[4 * i];
    return h;
  }

  return {
    textures: outs.map((c) => ({ disp: c.out.textures[0], deriv: c.out.textures[1] })),
    compute, displacement, corners,
    passesPerUpdate: cascades.length * (2 + 2 * bits),
    dispose() { ping.dispose(); pong.dispose(); gatherRT.dispose(); outs.forEach((c) => { c.out.dispose(); c.h0Tex.dispose(); c.kTex.dispose(); }); Object.values(mats).forEach((m) => m.dispose()); },
  };
}
