// Dragons Kingdom - post-processing chain (runs inside the headless browser).
//
// Every pass here is a single full-screen triangle drawn into a render target.
// The chain is:
//
//   scene (linear HDR, HalfFloat, optional MSAA)
//     -> grade      : exposure + tone mapping (ACES/AgX/Neutral) + vignette + sRGB encode
//                     (aa=fxaa: fused grade+FXAA pass; aa=fxaa-hq: grade, then three's FXAA)
//     -> upscale    : optional (final-fast), Catmull-Rom bicubic + anti-ringing + CAS sharpen
//     -> pack       : YUV 4:2:0 packer, 8 or 10 bit (or RGBA packer), with optional dither
//
// All intermediate images stay in HalfFloat so nothing is quantised to 8 bit
// before the very last step, where the dither lives - except the graded image
// of final-fast with 8-bit output, which is written as 8 bit WITH its own
// +-0.5 code dither (much cheaper for the upscaler to read, see dk-runtime.js).
// 10-bit output keeps half-float everywhere.

import * as THREE from 'three';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// One triangle that covers the whole viewport (cheaper than a 2-triangle quad:
// no diagonal seam that gets shaded twice).
export function makeFullscreenGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  return g;
}

const VERT = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

function raw(fragmentShader, uniforms, defines = {}) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader,
    uniforms,
    defines,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
}

const TONEMAP_FN = {
  aces: 'ACESFilmicToneMapping',
  agx: 'AgXToneMapping',
  neutral: 'NeutralToneMapping',
  reinhard: 'ReinhardToneMapping',
  linear: 'LinearToneMapping',
};
export const TONE_MAPPINGS = Object.keys(TONEMAP_FN);

// ---------------------------------------------------------------- grade ----
export function makeGradeMaterial(toneMapping = 'aces') {
  const fn = TONEMAP_FN[toneMapping];
  if (!fn) throw new Error(`unknown toneMapping "${toneMapping}" (use ${TONE_MAPPINGS.join(', ')})`);
  // three's own tone-mapping chunk, so results match three.js exactly.
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  return raw(/* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D tSrc;
uniform vec2 uInvSize;
uniform float uVignette;
uniform float uDither8;
${chunk}
out vec4 outColor;
// uDither8 = 1 when the target is 8 bit (final-fast): +-0.5 code dither before
// the hardware rounds to 8 bit (pattern offset from the packer's, see below)
float ign8(vec2 p) { return fract(52.9829189 * fract(dot(p + vec2(17.0, 29.0), vec2(0.06711056, 0.00583715)))); }
vec3 q8(vec3 s) { return s + uDither8 * (ign8(gl_FragCoord.xy) - 0.5) / 255.0; }
vec3 srgbOETF(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main() {
  vec3 c = texelFetch(tSrc, ivec2(gl_FragCoord.xy), 0).rgb;
  c = ${fn}(max(c, vec3(0.0)));
  if (uVignette > 0.0) {
    vec2 d = gl_FragCoord.xy * uInvSize - 0.5;
    d.x *= uInvSize.y / uInvSize.x * 0.5625; // aspect-corrected, normalised to 16:9
    float v = 1.0 - uVignette * smoothstep(0.15, 0.75, dot(d, d) * 2.2);
    c *= v;
  }
  outColor = vec4(q8(srgbOETF(c)), 1.0);
}`, {
    tSrc: { value: null },
    uInvSize: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0 },
    uDither8: { value: 0 },
    toneMappingExposure: { value: 1 },
  });
}

// ------------------------------------------------- grade + fxaa (fused) ---
// Default anti-aliasing. One pass instead of two: reads the linear HDR scene,
// finds edges and blends along them, then tone-maps only the final colour.
//  * edge detection: the centre texel + its 4 diagonal neighbours, all as
//    point samples (texelFetch). An earlier version took 4 bilinear taps at
//    +-0.5 texel (2x2 averages, like FXAA "console"); on SwiftShader a filtered
//    half-float tap costs much more than a point read: measured at 4K the
//    point version takes ~318 ms instead of ~420 ms per frame (~5% of a whole
//    4K frame) and finds more of the jaggies (1.65% vs 0.59% of the pixels
//    get smoothed; texture detail looks the same)
//  * blending happens in "Reinhard space" c/(1+luma(c)) and is converted back
//    before tone mapping, so very bright sky next to a dark tower does not
//    smear bright halos (the usual problem when averaging HDR values)
//  * only edge pixels pay for 4 extra taps along the edge direction
// Measured at 3840x2160 on SwiftShader (1 worker): grade alone ~155 ms,
// grade + three's FXAA ~900 ms, this fused pass ~318 ms per frame.
export function makeGradeFxaaMaterial(toneMapping = 'aces') {
  const fn = TONEMAP_FN[toneMapping];
  if (!fn) throw new Error(`unknown toneMapping "${toneMapping}" (use ${TONE_MAPPINGS.join(', ')})`);
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  return raw(/* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D tSrc;     // linear HDR scene, LINEAR filtered
uniform vec2 uInvSize;
uniform float uVignette;
uniform float uDither8;
${chunk}
out vec4 outColor;
// uDither8 = 1 when the target is 8 bit (final-fast): +-0.5 code dither before
// the hardware rounds to 8 bit (pattern offset from the packer's, see below)
float ign8(vec2 p) { return fract(52.9829189 * fract(dot(p + vec2(17.0, 29.0), vec2(0.06711056, 0.00583715)))); }
vec3 q8(vec3 s) { return s + uDither8 * (ign8(gl_FragCoord.xy) - 0.5) / 255.0; }
const vec3 KL = vec3(0.2126, 0.7152, 0.0722);
vec3 srgbOETF(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 squash(vec3 c) { return c / (1.0 + dot(c, KL)); }               // HDR -> [0,1) "Reinhard space"
vec3 unsquash(vec3 r) { return r / max(1.0 - dot(r, KL), 1e-4); }
float pl(vec3 r) { return sqrt(dot(r, KL)); }                          // perceptual-ish luma of a squashed colour
vec3 hdr(vec2 uv) { return max(texture(tSrc, uv).rgb, vec3(0.0)); }
void main() {
  vec2 uv = gl_FragCoord.xy * uInvSize;
  vec3 rM = squash(max(texelFetch(tSrc, ivec2(gl_FragCoord.xy), 0).rgb, vec3(0.0)));
  float lM = pl(rM);
  // the 4 diagonal neighbours as point samples (texelFetch: no filtering work)
  ivec2 ip = ivec2(gl_FragCoord.xy), mx = textureSize(tSrc, 0) - 1;
  float lNW = pl(squash(max(texelFetch(tSrc, clamp(ip + ivec2(-1, -1), ivec2(0), mx), 0).rgb, vec3(0.0))));
  float lNE = pl(squash(max(texelFetch(tSrc, clamp(ip + ivec2( 1, -1), ivec2(0), mx), 0).rgb, vec3(0.0))));
  float lSW = pl(squash(max(texelFetch(tSrc, clamp(ip + ivec2(-1,  1), ivec2(0), mx), 0).rgb, vec3(0.0))));
  float lSE = pl(squash(max(texelFetch(tSrc, clamp(ip + ivec2( 1,  1), ivec2(0), mx), 0).rgb, vec3(0.0))));
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec3 r = rM;
  if (lMax - lMin >= max(0.035, lMax * 0.11)) {
    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
    float reduce = max((lNW + lNE + lSW + lSE) * (0.25 / 8.0), 1.0 / 128.0);
    float rcpMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
    dir = clamp(dir * rcpMin, vec2(-8.0), vec2(8.0)) * uInvSize;
    vec3 rA = 0.5 * (squash(hdr(uv + dir * (1.0 / 3.0 - 0.5))) + squash(hdr(uv + dir * (2.0 / 3.0 - 0.5))));
    vec3 rB = rA * 0.5 + 0.25 * (squash(hdr(uv - dir * 0.5)) + squash(hdr(uv + dir * 0.5)));
    float lB = pl(rB);
    r = (lB < lMin || lB > lMax) ? rA : rB;
  }
  vec3 c = ${fn}(unsquash(r));
  if (uVignette > 0.0) {
    vec2 d = gl_FragCoord.xy * uInvSize - 0.5;
    d.x *= uInvSize.y / uInvSize.x * 0.5625;
    c *= 1.0 - uVignette * smoothstep(0.15, 0.75, dot(d, d) * 2.2);
  }
  outColor = vec4(q8(srgbOETF(c)), 1.0);
}`, {
    tSrc: { value: null },
    uInvSize: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0 },
    uDither8: { value: 0 },
    toneMappingExposure: { value: 1 },
  });
}

// ----------------------------------------------------------------- fxaa ----
// three's FXAA (Lottes/Flick algorithm). Runs on the sRGB-encoded image.
export function makeFxaaMaterial() {
  const m = new THREE.ShaderMaterial({
    name: 'DKFXAA',
    uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms),
    vertexShader: FXAAShader.vertexShader,
    fragmentShader: FXAAShader.fragmentShader,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
  return m;
}

// -------------------------------------------------------------- upscale ----
// Written from scratch for Dragons Kingdom.
//  1. Catmull-Rom bicubic reconstruction. The separable cubic weights are
//     folded so the two middle texels on each axis share one bilinear fetch,
//     and the four corner taps (tiny weights) are dropped: 5 bilinear taps
//     instead of 16 texel reads. (A 9-tap exact version measured 908 ms per
//     4K frame on SwiftShader, this one a fraction of that.)
//  2. Anti-ringing: clamp to the min/max of those taps (Catmull-Rom itself
//     has small negative lobes that would otherwise ring at hard edges).
//  3. Contrast-adaptive sharpening (CAS-style): a cross-shaped unsharp kernel
//     whose strength is scaled down where the local neighbourhood is already
//     high-contrast (prevents over-sharpening / clipping) and up in soft areas.
//     It reuses the cross taps, which sit about one *source* texel apart - where
//     the detail lost by the upscale lives.
//  4. Ringing limiter (like FSR1's RCAS lobe limit): the sharpened value is
//     clamped back into the min/max of the same taps. An unsharp kernel always
//     over/undershoots at a hard edge; without this limiter a 0.3 -> 0.7 step
//     got rims of -18 / +17 code values (light outlines around roofs and the
//     flag pole against the sky). With it, sharpening only steepens edges.
export function makeUpscaleMaterial() {
  return raw(/* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D tSrc;      // sRGB-encoded, LINEAR filtered, clamp-to-edge
uniform vec2 uSrcSize;       // source size in pixels
uniform vec2 uDstSize;       // destination size in pixels
uniform float uSharpness;    // 0..1
out vec4 outColor;

vec3 tap(vec2 p) { return texture(tSrc, p / uSrcSize).rgb; }   // p in source pixel units

void main() {
  vec2 p = gl_FragCoord.xy * (uSrcSize / uDstSize);   // output pixel centre in source pixel units
  vec2 t1 = floor(p - 0.5) + 0.5;                      // centre of the texel left/below p
  vec2 f = p - t1, f2 = f * f, f3 = f2 * f;
  // Catmull-Rom (B=0, C=0.5) weights for the 4 texels along each axis
  vec2 w0 = -0.5 * f3 + f2 - 0.5 * f;
  vec2 w1 =  1.5 * f3 - 2.5 * f2 + 1.0;
  vec2 w2 = -1.5 * f3 + 2.0 * f2 + 0.5 * f;
  vec2 w3 =  0.5 * f3 - 0.5 * f2;
  vec2 w12 = w1 + w2;
  vec2 t12 = t1 + w2 / w12;     // one bilinear fetch covers the two middle texels
  vec2 t0 = t1 - 1.0, t3 = t1 + 2.0;
  // 5-tap cross: the 4 corner taps of the full 9-tap filter carry tiny
  // (w0*w0-sized) weights and are dropped; the rest is renormalised.
  vec3 cC = tap(t12);
  vec3 cS = tap(vec2(t12.x, t0.y));
  vec3 cN = tap(vec2(t12.x, t3.y));
  vec3 cW = tap(vec2(t0.x, t12.y));
  vec3 cE = tap(vec2(t3.x, t12.y));
  float wC = w12.x * w12.y, wS = w12.x * w0.y, wN = w12.x * w3.y, wW = w0.x * w12.y, wE = w3.x * w12.y;
  vec3 c = (cC * wC + cS * wS + cN * wN + cW * wW + cE * wE) / (wC + wS + wN + wW + wE);
  // anti-ringing: stay inside the local range
  vec3 mn = min(cC, min(min(cS, cN), min(cW, cE)));
  vec3 mx = max(cC, max(max(cS, cN), max(cW, cE)));
  c = clamp(c, mn, mx);
  // contrast-adaptive sharpening (CAS-style) using the same cross taps, which
  // sit about one source texel away: amount shrinks where contrast is already high
  if (uSharpness > 0.0) {
    vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1.0 / 1024.0)), 0.0, 1.0));
    float peak = -1.0 / mix(8.0, 5.0, clamp(uSharpness, 0.0, 1.0));
    vec3 w = amp * peak;
    c = (c + (cS + cN + cW + cE) * w) / (1.0 + 4.0 * w);
    c = clamp(c, mn, mx);   // ringing limiter: never leave the local range
  }
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`, {
    tSrc: { value: null },
    uSrcSize: { value: new THREE.Vector2(1, 1) },
    uDstSize: { value: new THREE.Vector2(1, 1) },
    uSharpness: { value: 0.5 },
  });
}

// ------------------------------------------------------------- dithering ---
// Interleaved gradient noise (Jimenez 2014): a cheap, deterministic, nearly
// blue-noise ordered pattern in [0,1). The same pattern every frame (static
// grain compresses well and never flickers).
const DITHER_GLSL = /* glsl */ `
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
// round v (in code values) to an integer code with +-0.5*amp code dither
float quant(float v, vec2 p, float lo, float hi) {
  float d = uDither * (ign(p) - 0.5);
  return clamp(floor(v + 0.5 + d), lo, hi);
}
`;

// ---------------------------------------------------------- YUV packer ----
// Output target: RGBA8. When read with gl.readPixels the bytes are exactly one
// ffmpeg raw frame, Y plane then U then V, top row first:
//
//   bits = 8  -> "-pix_fmt yuv420p",     target (W/4) x (H*3/2), 4 samples per texel
//   bits = 10 -> "-pix_fmt yuv420p10le", target (W/2) x (H*3/2), 2 samples per texel,
//                each sample a little-endian 16-bit word (low byte, high byte)
//
//   Y plane  : W x H         -> output rows [0, H)
//   U plane  : W/2 x H/2     -> output rows [H, H + H/4)       (2 chroma rows per output row)
//   V plane  : W/2 x H/2     -> output rows [H + H/4, 3H/2)
// readPixels returns the bottom GL row first, so output row r (counted from
// GL row 0) is the r-th row of the raw frame, and image row "top" is fetched
// from source GL row H-1-top: the flip happens here, nothing is flipped later.
// Colour: BT.709 matrix, limited ("TV") range: Y 16..235, Cb/Cr 16..240
// (x4 for 10 bit: Y 64..940, Cb/Cr 64..960).
// Chroma: plain average of each 2x2 block => centre siting (tagged as such),
// fetched with a single bilinear tap on the block's centre.
export function makePackYuvMaterial(bits = 8) {
  if (bits !== 8 && bits !== 10) throw new Error(`YUV packer: bits must be 8 or 10, not ${bits}`);
  const S = bits === 10 ? 2 : 4;           // samples per output texel
  return raw(/* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D tSrc;   // W x H, sRGB-encoded (R'G'B'), not yet quantised, LINEAR filtered
uniform ivec2 uSize;      // W, H
uniform float uDither;    // 1.0 => +-0.5 code value, 0.0 => plain rounding
out vec4 outColor;
${DITHER_GLSL}
const vec3 KY = vec3(0.2126, 0.7152, 0.0722);
const float SCALE = ${bits === 10 ? '4.0' : '1.0'};   // 10-bit codes are 8-bit codes x 4

vec3 px(int x, int top) { return texelFetch(tSrc, ivec2(x, uSize.y - 1 - top), 0).rgb; }

float lumaCode(int x, int top) {
  float y = dot(px(x, top), KY);
  return quant(SCALE * (16.0 + 219.0 * y), vec2(x, top) + 0.5, SCALE * 16.0, SCALE * 235.0);
}
float chromaCode(int cx, int cy, bool isV) {
  // one bilinear tap exactly on the shared corner of the 2x2 block = the
  // average of the 4 pixels (weights 0.25 each), 1 fetch instead of 4
  vec2 corner = vec2(float(cx * 2 + 1), float(uSize.y - 1 - cy * 2));   // GL coords of the block's centre
  vec3 c = texture(tSrc, corner / vec2(uSize)).rgb;
  float yy = dot(c, KY);
  float v = isV ? 128.0 + 224.0 * (c.r - yy) / 1.5748
                : 128.0 + 224.0 * (c.b - yy) / 1.8556;
  vec2 off = isV ? vec2(13.0, 71.0) : vec2(37.0, 11.0);   // decorrelate U/V/Y patterns
  return quant(SCALE * v, vec2(cx, cy) + 0.5 + off, SCALE * 16.0, SCALE * 240.0);
}
${bits === 10 ? `
// 10-bit code -> (low byte, high byte) of a little-endian 16-bit word
vec2 le16(float v) { float hi = floor(v / 256.0); return vec2(v - hi * 256.0, hi); }
vec4 pack2(float a, float b) { return vec4(le16(a), le16(b)); }` : ''}

void main() {
  int ox = int(gl_FragCoord.x);
  int oy = int(gl_FragCoord.y);
  int W = uSize.x, H = uSize.y;
  vec4 o;
  if (oy < H) {
    int x = ox * ${S};
    ${bits === 10
      ? 'o = pack2(lumaCode(x, oy), lumaCode(x + 1, oy));'
      : 'o = vec4(lumaCode(x, oy), lumaCode(x + 1, oy), lumaCode(x + 2, oy), lumaCode(x + 3, oy));'}
  } else {
    int r = oy - H;
    bool isV = r >= H / 4;
    if (isV) r -= H / 4;
    int halfRow = W / ${2 * S};             // output texels per chroma row
    bool second = ox >= halfRow;
    int cy = 2 * r + (second ? 1 : 0);
    int cx = (second ? ox - halfRow : ox) * ${S};
    ${bits === 10
      ? 'o = pack2(chromaCode(cx, cy, isV), chromaCode(cx + 1, cy, isV));'
      : `o = vec4(chromaCode(cx, cy, isV), chromaCode(cx + 1, cy, isV),
             chromaCode(cx + 2, cy, isV), chromaCode(cx + 3, cy, isV));`}
  }
  outColor = o / 255.0;
}`, {
    tSrc: { value: null },
    uSize: { value: new THREE.Vector2(1, 1) },
    uDither: { value: 1 },
  });
}

// --------------------------------------------------------- RGBA packer ----
// Full RGBA8 (W x H) top row first (flipped in-shader), same dither. Used by
// "--capture rgba", PNG stills and the verification tests.
export function makePackRgbaMaterial() {
  return raw(/* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D tSrc;
uniform ivec2 uSize;
uniform float uDither;
out vec4 outColor;
${DITHER_GLSL}
void main() {
  int x = int(gl_FragCoord.x);
  int top = int(gl_FragCoord.y);
  vec3 c = texelFetch(tSrc, ivec2(x, uSize.y - 1 - top), 0).rgb * 255.0;
  vec2 p = vec2(x, top) + 0.5;
  outColor = vec4(quant(c.r, p, 0.0, 255.0), quant(c.g, p, 0.0, 255.0), quant(c.b, p, 0.0, 255.0), 255.0) / 255.0;
}`, {
    tSrc: { value: null },
    uSize: { value: new THREE.Vector2(1, 1) },
    uDither: { value: 1 },
  });
}
