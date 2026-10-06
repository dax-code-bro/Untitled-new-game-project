// Cinematic realism stack - full-screen passes (GLSL 3, RawShaderMaterial).
//
// Measured on SwiftShader at 3840x2160 (see README "Cinematic realism stack"):
// writing a half-float target costs ~2x more than a 32-bit float one
// (~160 vs ~77 ms for a plain 4K pass) and a filtered half-float tap ~2x a
// float one, so every HDR intermediate of this stack is RGBA32F. Passes are
// fused where it is free (FXAA lives in the motion-blur pass, DOF composite,
// bloom, grade, vignette, CA, distortion and grain are one final pass).
import * as THREE from 'three';

export const VERT = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export function raw(fragmentShader, uniforms, defines = {}, extra = {}) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: '#define DK_CINEMATIC 1\nprecision highp float;\nprecision highp int;\nprecision highp sampler3D;\n' + fragmentShader,
    uniforms,
    defines,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
    ...extra,
  });
}

// ------------------------------------------------------------------ shared --
export const COMMON = /* glsl */ `
const vec3 KL = vec3(0.2126, 0.7152, 0.0722);
// interleaved gradient noise (Jimenez 2014): static per pixel
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
// PCG hash (Jarzynski & Olano 2020): integer -> well mixed integer (bit-exact everywhere)
uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float u01(uint v) { return float(pcg(v) >> 8) * (1.0 / 16777216.0); }
vec3 srgbOETF(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 srgbEOTF(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
// non-linear depth buffer value [0,1] -> distance along the view axis (perspective camera)
float viewZ(float d, float n, float f) { float z = d * 2.0 - 1.0; return 2.0 * n * f / ((f + n) - z * (f - n)); }
`;

// ----------------------------------------------------------------- resolve --
// Scene colour + depth -> atmosphere (aerial perspective, volumetric fog) and,
// for motion blur, a per-pixel velocity + linear depth buffer (MRT).
// Velocity: objects that moved write their own (velocity pass, alpha = 1);
// every other pixel gets the camera motion from re-projecting its depth.
export function makeResolveMaterial({ mb, atmo, vol }) {
  return raw(/* glsl */ `
${COMMON}
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tDynVel;
uniform vec2 uSize;
uniform float uNear, uFar;
uniform mat4 uInvProj, uCamWorld, uPrevViewProj;
uniform float uVelScale;
uniform float uMaxVel;
#ifdef ATMO
uniform sampler2D tApLut;      // aerial perspective: atlas (W) x (H * slices): rgb in-scatter, a = transmittance
uniform vec3 uApGrid;          // width, height, slices
uniform float uApMaxDist;      // metres covered by the last slice
uniform float uApScale;
#endif
#ifdef VOL
uniform sampler2D tVol;        // integrated froxels: rgb in-scatter, a = transmittance
uniform vec3 uVolGrid;         // x, y, slices
uniform vec2 uVolRange;        // near, far (m)
uniform float uFogOnly;        // debug view 'fog': in-scattered light only
#endif
layout(location = 0) out vec4 oColor;
#ifdef MB
layout(location = 1) out vec4 oVelDepth;
#endif

// manual trilinear lookup in a (x) x (y * slices) atlas: slice s occupies rows [s*y, (s+1)*y)
vec4 atlas3D(sampler2D t, vec3 grid, vec2 uv, float slice) {
  slice = clamp(slice, 0.0, grid.z - 1.0);
  float s0 = floor(slice), f = slice - s0, s1 = min(s0 + 1.0, grid.z - 1.0);
  vec2 p = clamp(uv * grid.xy, vec2(0.5), grid.xy - 0.5);
  vec2 inv = 1.0 / vec2(grid.x, grid.y * grid.z);
  vec4 a = texture(t, vec2(p.x, p.y + s0 * grid.y) * inv);
  vec4 b = texture(t, vec2(p.x, p.y + s1 * grid.y) * inv);
  return mix(a, b, f);
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec3 c = texelFetch(tColor, ip, 0).rgb;
  float d = texelFetch(tDepth, ip, 0).r;
  vec2 uv = gl_FragCoord.xy / uSize;
  vec2 ndc = uv * 2.0 - 1.0;
  vec4 vp = uInvProj * vec4(ndc, d * 2.0 - 1.0, 1.0);
  vp /= vp.w;
  float vz = -vp.z;
  float dist = length(vp.xyz);
  bool sky = d >= 0.999999;
#ifdef ATMO
  // aerial perspective (haze) between the camera and the surface, from the
  // same atmosphere as the sky. Sky pixels already contain it (physical sky or photo).
  if (!sky) {
    float apDist = min(dist * uApScale, uApMaxDist);
    float sl = sqrt(apDist / uApMaxDist) * uApGrid.z - 0.5;   // slices are spaced quadratically (fine near the camera)
    vec4 ap = atlas3D(tApLut, uApGrid, uv, sl);
    float w = clamp((sl + 0.5) * 2.0, 0.0, 1.0);             // fade in from the camera
    c = c * mix(1.0, ap.a, w) + ap.rgb * w;
  }
#endif
#ifdef VOL
  if (uFogOnly > 0.5) c = vec3(0.0);
  {
    // integrated froxels: value k = the medium from the camera to the far edge of slice k
    float vd = sky ? uVolRange.y : clamp(dist, uVolRange.x * 0.5, uVolRange.y);
    float f = log(vd / uVolRange.x) / log(uVolRange.y / uVolRange.x) * uVolGrid.z;
    vec4 v = atlas3D(tVol, uVolGrid, uv, f - 1.0);
    float w = clamp(f, 0.0, 1.0);
    c = c * mix(1.0, v.a, w) + v.rgb * w;
  }
#endif
  oColor = vec4(max(c, vec3(0.0)), 1.0);
#ifdef MB
  vec4 dv = texelFetch(tDynVel, ip, 0);
  vec2 vel;
  if (dv.a > 0.5) vel = dv.xy;
  else {
    vec3 world = (uCamWorld * vec4(vp.xyz, 1.0)).xyz;
    vec4 pc = uPrevViewProj * vec4(world, 1.0);
    vec2 prevNdc = pc.xy / max(pc.w, 1e-6);
    vel = pc.w > 1e-6 ? (ndc - prevNdc) * 0.5 * uSize * uVelScale : vec2(0.0);
  }
  float l = length(vel);
  if (l > uMaxVel) vel *= uMaxVel / l;
  oVelDepth = vec4(vel, vz, 0.0);
#endif
}`, {
    tColor: { value: null }, tDepth: { value: null }, tDynVel: { value: null },
    uSize: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.1 }, uFar: { value: 1000 },
    uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uPrevViewProj: { value: new THREE.Matrix4() },
    uVelScale: { value: 1 }, uMaxVel: { value: 100 },
    tApLut: { value: null }, uApGrid: { value: new THREE.Vector3(1, 1, 1) }, uApMaxDist: { value: 32000 }, uApScale: { value: 1 },
    tVol: { value: null }, uVolGrid: { value: new THREE.Vector3(1, 1, 1) }, uVolRange: { value: new THREE.Vector2(0.5, 500) }, uFogOnly: { value: 0 },
  }, { ...(mb ? { MB: 1 } : {}), ...(atmo ? { ATMO: 1 } : {}), ...(vol ? { VOL: 1 } : {}) });
}

// ------------------------------------------------------------- tile passes --
// Velocity tile max: every tile pixel scans its K x K block (stride 2) of the
// velocity buffer and keeps the longest vector. Then a 3x3 neighbour max.
export function makeTileMaxMaterial() {
  return raw(/* glsl */ `
uniform sampler2D tVel;
uniform int uK;
uniform ivec2 uSize;
out vec4 o;
void main() {
  ivec2 t0 = ivec2(gl_FragCoord.xy) * uK;
  vec2 best = vec2(0.0); float bl = 0.0;
  for (int y = 0; y < 64; y += 2) {
    if (y >= uK) break;
    for (int x = 0; x < 64; x += 2) {
      if (x >= uK) break;
      ivec2 p = min(t0 + ivec2(x, y), uSize - 1);
      vec2 v = texelFetch(tVel, p, 0).xy;
      float l = dot(v, v);
      if (l > bl) { bl = l; best = v; }
    }
  }
  o = vec4(best, sqrt(bl), 0.0);
}`, { tVel: { value: null }, uK: { value: 20 }, uSize: { value: new THREE.Vector2(1, 1) } });
}
export function makeNeighborMaxMaterial() {
  return raw(/* glsl */ `
uniform sampler2D tTile;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy), mx = textureSize(tTile, 0) - 1;
  vec2 best = vec2(0.0); float bl = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec4 t = texelFetch(tTile, clamp(p + ivec2(x, y), ivec2(0), mx), 0);
    // a diagonal neighbour only matters if its velocity points toward this tile (McGuire 2012)
    if (x != 0 && y != 0 && dot(normalize(t.xy + 1e-6), -normalize(vec2(x, y))) < 0.5) continue;
    if (t.z > bl) { bl = t.z; best = t.xy; }
  }
  o = vec4(best, bl, 0.0);
}`, { tTile: { value: null } });
}

// ------------------------------------------------------ motion blur + FXAA --
// Reconstruction filter after McGuire et al. 2012 ("A reconstruction filter
// for plausible motion blur") with the improvements of Jimenez 2014 (sampling
// along both the tile's dominant velocity and the pixel's own, jittered).
// Pixels whose neighbourhood does not move take the FXAA branch instead (the
// same fused FXAA as the standard pipeline), so this pass costs no more than
// FXAA alone on static parts of the picture.
export function makeMotionBlurMaterial({ mb, fxaa }) {
  return raw(/* glsl */ `
${COMMON}
uniform sampler2D tColor;      // HDR, LINEAR filtered
uniform sampler2D tVelDepth;   // vel.xy (px over the shutter interval), view z
uniform sampler2D tNeighbor;   // neighbour max velocity per tile
uniform int uK;
uniform vec2 uInvSize;
uniform int uMaxSamples;
uniform float uFrameSeed;
out vec4 oColor;
vec3 squash(vec3 c) { return c / (1.0 + dot(c, KL)); }
vec3 unsquash(vec3 r) { return r / max(1.0 - dot(r, KL), 1e-4); }
float pl(vec3 r) { return sqrt(dot(r, KL)); }
vec3 hdr(vec2 uv) { return max(texture(tColor, uv).rgb, vec3(0.0)); }
vec3 fxaaColor(ivec2 ip) {
  vec3 rM = squash(max(texelFetch(tColor, ip, 0).rgb, vec3(0.0)));
#ifdef FXAA
  ivec2 mx = textureSize(tColor, 0) - 1;
  float lM = pl(rM);
  float lNW = pl(squash(max(texelFetch(tColor, clamp(ip + ivec2(-1, -1), ivec2(0), mx), 0).rgb, vec3(0.0))));
  float lNE = pl(squash(max(texelFetch(tColor, clamp(ip + ivec2( 1, -1), ivec2(0), mx), 0).rgb, vec3(0.0))));
  float lSW = pl(squash(max(texelFetch(tColor, clamp(ip + ivec2(-1,  1), ivec2(0), mx), 0).rgb, vec3(0.0))));
  float lSE = pl(squash(max(texelFetch(tColor, clamp(ip + ivec2( 1,  1), ivec2(0), mx), 0).rgb, vec3(0.0))));
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin >= max(0.035, lMax * 0.11)) {
    vec2 uv = gl_FragCoord.xy * uInvSize;
    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
    float reduce = max((lNW + lNE + lSW + lSE) * (0.25 / 8.0), 1.0 / 128.0);
    float rcpMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
    dir = clamp(dir * rcpMin, vec2(-8.0), vec2(8.0)) * uInvSize;
    vec3 rA = 0.5 * (squash(hdr(uv + dir * (1.0 / 3.0 - 0.5))) + squash(hdr(uv + dir * (2.0 / 3.0 - 0.5))));
    vec3 rB = rA * 0.5 + 0.25 * (squash(hdr(uv - dir * 0.5)) + squash(hdr(uv + dir * 0.5)));
    float lB = pl(rB);
    rM = (lB < lMin || lB > lMax) ? rA : rB;
  }
#endif
  return unsquash(rM);
}
#ifdef MB
float cone(float dist, float len) { return clamp(1.0 - dist / max(len, 1e-4), 0.0, 1.0); }
float cylinder(float dist, float len) { return 1.0 - smoothstep(0.95 * len, 1.05 * len, dist); }
// soft depth compare: 1 when a is in front of b
float softFront(float za, float zb) { return clamp(1.0 - (za - zb) / max(0.02 * zb, 0.05), 0.0, 1.0); }
#endif
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
#ifdef MB
  vec3 vN = texelFetch(tNeighbor, ip / uK, 0).xyz;
  if (vN.z < 0.75) { oColor = vec4(fxaaColor(ip), 1.0); return; }
  vec4 cVD = texelFetch(tVelDepth, ip, 0);
  vec2 vC = cVD.xy; float lC = length(vC); float zC = cVD.z;
  vec3 cC = max(texelFetch(tColor, ip, 0).rgb, vec3(0.0));
  // half the shutter interval each way (velocity = displacement over the whole interval)
  float halfC = 0.5 * lC;
  float wC = 1.0 / max(halfC, 0.5);
  vec3 sum = cC * wC; float wsum = wC;
  int n = int(clamp(ceil(vN.z * 0.25), 6.0, float(uMaxSamples)));
  n += n & 1;                                  // even: pairs of opposite samples
  float j = ign(gl_FragCoord.xy + uFrameSeed * 5.588238) - 0.5;
  vec2 dirN = vN.xy, dirC = lC > 0.75 ? vC : vN.xy;
  vec2 texel = uInvSize;
  vec2 uv0 = gl_FragCoord.xy * texel;
  for (int i = 0; i < 64; i++) {
    if (i >= n) break;
    // alternate the dominant (tile) direction and the pixel's own direction
    vec2 dir = ((i & 2) == 0) ? dirN : dirC;
    float k = (float(i >> 1) + 0.5 + j) / float(n >> 1);   // 0..1
    float tt = ((i & 1) == 0 ? k : -k) * 0.5;               // -0.5..0.5 of the interval
    vec2 off = dir * tt;
    float dist = length(off);
    vec2 uvS = uv0 + off * texel;
    ivec2 pS = ivec2(uvS / texel);
    vec4 sVD = texelFetch(tVelDepth, clamp(pS, ivec2(0), textureSize(tVelDepth, 0) - 1), 0);
    float halfS = 0.5 * length(sVD.xy);
    float f = softFront(sVD.z, zC);   // sample in front of the centre
    float b = softFront(zC, sVD.z);   // centre in front of the sample
    float w = f * cone(dist, halfS) + b * cone(dist, halfC) + cylinder(dist, halfS) * cylinder(dist, halfC) * 2.0;
    vec3 cS = max(texelFetch(tColor, clamp(pS, ivec2(0), textureSize(tColor, 0) - 1), 0).rgb, vec3(0.0));
    sum += cS * w; wsum += w;
  }
  oColor = vec4(sum / wsum, 1.0);
#else
  oColor = vec4(fxaaColor(ip), 1.0);
#endif
}`, {
    tColor: { value: null }, tVelDepth: { value: null }, tNeighbor: { value: null },
    uK: { value: 20 }, uInvSize: { value: new THREE.Vector2(1, 1) }, uMaxSamples: { value: 20 }, uFrameSeed: { value: 0 },
  }, { ...(mb ? { MB: 1 } : {}), ...(fxaa ? { FXAA: 1 } : {}) });
}

// --------------------------------------------------------------------- DOF --
// Physical thin-lens circle of confusion: coc(z) = K * (1 - focus / z) pixels
// (DIAMETER at full resolution, negative in front of the focus plane).
const COC_GLSL = /* glsl */ `
uniform float uCocK;       // px: blur diameter of a point at infinity
uniform float uFocus;      // m
uniform float uMaxCoc;     // px (diameter)
float cocOf(float z) { return clamp(uCocK * (1.0 - uFocus / max(z, 1e-3)), -uMaxCoc, uMaxCoc); }
`;

// half resolution: colour (2x2 average) + signed CoC (of the nearest of the 4
// pixels when it is in front of the focus plane - keeps foreground edges)
export function makeDofPrefilterMaterial({ depthIsLinear }) {
  return raw(/* glsl */ `
${COMMON}
${COC_GLSL}
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform float uNear, uFar;
out vec4 o;
float zAt(ivec2 p) {
  float d = texelFetch(tDepth, p, 0).${depthIsLinear ? 'b' : 'r'};
  return ${depthIsLinear ? 'd' : 'viewZ(d, uNear, uFar)'};
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * 2, mx = textureSize(tColor, 0) - 1;
  ivec2 p1 = min(p + ivec2(1, 0), mx), p2 = min(p + ivec2(0, 1), mx), p3 = min(p + ivec2(1, 1), mx);
  vec3 c = texelFetch(tColor, p, 0).rgb + texelFetch(tColor, p1, 0).rgb + texelFetch(tColor, p2, 0).rgb + texelFetch(tColor, p3, 0).rgb;
  float z0 = zAt(p), z1 = zAt(p1), z2 = zAt(p2), z3 = zAt(p3);
  float zn = min(min(z0, z1), min(z2, z3));
  float cn = cocOf(zn);
  float ca = 0.25 * (cocOf(z0) + cocOf(z1) + cocOf(z2) + cocOf(z3));
  o = vec4(c * 0.25, cn < 0.0 ? cn : ca);
}`, {
    tColor: { value: null }, tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 1000 },
    uCocK: { value: 0 }, uFocus: { value: 10 }, uMaxCoc: { value: 40 },
  });
}

// tile max |CoC| (and most-negative = nearest blur) over 8x8 half-res pixels, then 3x3 dilate
export function makeCocTileMaterial() {
  return raw(/* glsl */ `
uniform sampler2D tHalf;
out vec4 o;
void main() {
  ivec2 t0 = ivec2(gl_FragCoord.xy) * 8, mx = textureSize(tHalf, 0) - 1;
  float mAbs = 0.0, mNear = 0.0;
  for (int y = 0; y < 8; y++) for (int x = 0; x < 8; x++) {
    float c = texelFetch(tHalf, min(t0 + ivec2(x, y), mx), 0).a;
    mAbs = max(mAbs, abs(c)); mNear = min(mNear, c);
  }
  o = vec4(mAbs, mNear, 0.0, 0.0);
}`, { tHalf: { value: null } });
}
export function makeCocDilateMaterial() {
  return raw(/* glsl */ `
uniform sampler2D tTile;
uniform int uR;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy), mx = textureSize(tTile, 0) - 1;
  float mAbs = 0.0, mNear = 0.0;
  for (int y = -3; y <= 3; y++) for (int x = -3; x <= 3; x++) {
    if (abs(x) > uR || abs(y) > uR) continue;
    vec2 t = texelFetch(tTile, clamp(p + ivec2(x, y), ivec2(0), mx), 0).xy;
    mAbs = max(mAbs, t.x); mNear = min(mNear, t.y);
  }
  o = vec4(mAbs, mNear, 0.0, 0.0);
}`, { tTile: { value: null }, uR: { value: 1 } });
}

// Gather (scatter-as-gather) bokeh at half resolution after D. Gustafsson,
// "Bokeh depth of field in a single pass" (2018): golden-angle spiral whose
// sample density is uniform over the disk; a sample contributes where ITS
// circle of confusion reaches the centre; samples behind the centre may not
// blur more than twice the centre's own CoC (no background bleeding onto a
// sharp foreground), samples in front are not limited (out-of-focus
// foreground spreads over the background, like a real lens). The loop radius
// is the dilated tile maximum, so in-focus regions cost nothing.
// Output alpha = effective blur diameter (full-res px) for the composite.
export function makeDofGatherMaterial() {
  return raw(/* glsl */ `
${COMMON}
uniform sampler2D tHalf;      // rgb, coc (full-res px, signed), LINEAR filtered
uniform sampler2D tTiles;     // dilated: max |coc|, min coc
uniform vec2 uHalfSize;
uniform float uSamples;       // taps at the largest radius
uniform float uMaxCoc;
uniform float uCatsEye;       // optical vignetting strength
uniform float uAspect;
out vec4 o;
const float GOLDEN = 2.39996323;
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec4 c0 = texelFetch(tHalf, ip, 0);
  vec2 tile = texelFetch(tTiles, ip / 8, 0).xy;
  float centerSize = abs(c0.a) * 0.5;              // radius in half-res px
  float maxR = tile.x * 0.5;                       // largest radius around (half-res px)
  if (maxR < 0.5) { o = vec4(c0.rgb, abs(c0.a)); return; }
  // RAD_SCALE chosen so that about uSamples taps cover the largest disk
  float radScale = max(0.5, maxR * maxR / (2.0 * uSamples));
  vec2 inv = 1.0 / uHalfSize;
  vec2 uv = gl_FragCoord.xy * inv;
  // cat's eye: near the frame edge the aperture is clipped by the lens barrel
  vec2 rc = (uv - 0.5) * vec2(uAspect, 1.0);
  float edge = length(rc) / length(vec2(uAspect, 1.0) * 0.5);
  vec2 ceDir = length(rc) > 1e-4 ? normalize(rc) : vec2(0.0);
  float ce = uCatsEye * edge * edge;
  vec3 col = c0.rgb; float tot = 1.0;
  float spread = abs(c0.a);
  float radius = radScale;
  float ang = ign(gl_FragCoord.xy) * 6.2831853;
  for (int i = 0; i < 256; i++) {
    if (radius >= maxR) break;
    vec2 dir = vec2(cos(ang), sin(ang));
    // optical vignetting: drop samples outside the second (offset) circle
    float clip = 1.0;
    if (ce > 0.0) clip = step(length(dir * radius / maxR + ceDir * ce), 1.0);
    vec4 s = texture(tHalf, uv + dir * radius * inv);
    float sSize = abs(s.a) * 0.5;
    if (s.a > c0.a) sSize = clamp(sSize, 0.0, centerSize * 2.0);   // sample behind the centre
    float m = smoothstep(radius - 0.5, radius + 0.5, sSize) * clip;
    col += mix(col / tot, s.rgb, m);
    tot += 1.0;
    if (s.a < c0.a && m > 0.0) spread = max(spread, abs(s.a) * m);  // foreground spreading over us
    radius += radScale / radius;
    ang += GOLDEN;
  }
  o = vec4(col / tot, spread);
}`, {
    tHalf: { value: null }, tTiles: { value: null }, uHalfSize: { value: new THREE.Vector2(1, 1) },
    uSamples: { value: 48 }, uMaxCoc: { value: 40 }, uCatsEye: { value: 0.25 }, uAspect: { value: 16 / 9 },
  });
}

// ------------------------------------------------------------------- bloom --
// Downsample: 4 bilinear taps = 4x4 box (COD/Jimenez "dual filter" family).
export function makeDownsampleMaterial() {
  return raw(/* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uSrcInv;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy * 2.0 * uSrcInv;    // = centre of the 2x2 source block
  vec3 c = texture(tSrc, uv + vec2(-1.0, -1.0) * uSrcInv).rgb + texture(tSrc, uv + vec2(1.0, -1.0) * uSrcInv).rgb
         + texture(tSrc, uv + vec2(-1.0, 1.0) * uSrcInv).rgb + texture(tSrc, uv + vec2(1.0, 1.0) * uSrcInv).rgb;
  o = vec4(c * 0.25, 1.0);
}`, { tSrc: { value: null }, uSrcInv: { value: new THREE.Vector2(1, 1) } });
}
// Upsample: 3x3 tent of the smaller level added to this level (weights sum to 1 overall)
export function makeUpsampleMaterial() {
  return raw(/* glsl */ `
uniform sampler2D tLow;    // smaller level (already accumulated)
uniform sampler2D tHigh;   // this level's downsample
uniform vec2 uLowInv;
uniform float uMix;        // share of the wider (lower) level
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(tHigh, 0));
  vec3 l = texture(tLow, uv).rgb * 4.0
    + (texture(tLow, uv + vec2(uLowInv.x, 0.0)).rgb + texture(tLow, uv - vec2(uLowInv.x, 0.0)).rgb
     + texture(tLow, uv + vec2(0.0, uLowInv.y)).rgb + texture(tLow, uv - vec2(0.0, uLowInv.y)).rgb) * 2.0
    + (texture(tLow, uv + uLowInv).rgb + texture(tLow, uv - uLowInv).rgb
     + texture(tLow, uv + vec2(uLowInv.x, -uLowInv.y)).rgb + texture(tLow, uv - vec2(uLowInv.x, -uLowInv.y)).rgb);
  l /= 16.0;
  vec3 h = texelFetch(tHigh, ivec2(gl_FragCoord.xy), 0).rgb;
  o = vec4(mix(h, l, uMix), 1.0);
}`, { tLow: { value: null }, tHigh: { value: null }, uLowInv: { value: new THREE.Vector2(1, 1) }, uMix: { value: 0.6 } });
}

// ------------------------------------------------------------------- final --
// DOF composite + bloom/halation + exposure + white balance + natural
// vignetting + sensor grain (all in scene-linear light, like a real camera),
// then the whole colour pipeline (scene grade, tone mapper + look, display
// grade, .cube LUT, sRGB encode) as ONE baked 3D LUT behind a log2 shaper
// (colorlut.js), then the 8-bit dither. Chromatic aberration and distortion
// act on the sampling positions.
export function makeFinalMaterial(o) {
  return raw(/* glsl */ `
${COMMON}
${COC_GLSL}
uniform sampler2D tSharp;      // full-res HDR (after motion blur / FXAA), LINEAR filtered
uniform sampler2D tDepth;      // depth texture or velDepth (b = view z)
uniform sampler2D tDof;        // half-res gather result (a = blur diameter)
uniform sampler2D tDofHalf;    // half-res prefilter (a = coc) for the bilateral upsample
uniform sampler2D tDofTiles;   // dilated CoC tiles (16x16 full-res px)
uniform float uDofOn;          // 0: no DOF this frame (never read last frame's buffers)
uniform sampler2D tBloom;
uniform sampler2D tBloomSmall;
uniform sampler2D tNoise;      // 1024^2 gaussian noise (RGBA8, 128 = 0, 40 = 1 sigma), REPEAT
uniform highp sampler3D tGrade;
uniform vec2 uSize;
uniform float uNear, uFar;
uniform float uExposure;
uniform mat3 uWB;
uniform float uBloom, uHalation, uHalationThreshold; uniform vec3 uHalationTint;
uniform float uVignette, uVigK;
uniform float uCA;             // px at the corner
uniform float uDistortion;
uniform float uGrain, uGrainCell, uGrainChroma;
uniform vec2 uGrainNoise;      // shot, read noise variance coefficients (already scaled by ISO)
uniform ivec3 uNoiseXf;        // per-frame offset x, y and flip/swap bits
uniform vec2 uShaper;          // min EV, 1 / (max EV - min EV)
uniform float uLutN;
uniform float uDither8;
out vec4 oColor;

float zAt(ivec2 p) {
${o.depthIsLinear ? '  return texelFetch(tDepth, p, 0).b;' : '  return viewZ(texelFetch(tDepth, p, 0).r, uNear, uFar);'}
}

// bilateral upsample of the half-res DOF result: the 4 nearest half-res
// texels, weighted by bilinear weight and by how similar their blur size
// (alpha = effective CoC) is to this pixel's own CoC - keeps sharp
// foreground edges from picking up the blurred background and vice versa
vec4 dofAt(vec2 uvFull, float coc) {
  vec2 hs = vec2(textureSize(tDof, 0));
  vec2 p = uvFull * hs - 0.5;
  vec2 f = fract(p); ivec2 b = ivec2(floor(p)); ivec2 mx = ivec2(hs) - 1;
  float ac = abs(coc);
  vec4 acc = vec4(0.0); float ws = 0.0;
  for (int i = 0; i < 4; i++) {
    ivec2 o = ivec2(i & 1, i >> 1);
    vec4 d = texelFetch(tDof, clamp(b + o, ivec2(0), mx), 0);
    float wb = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y);
    float w = wb / (1.0 + abs(d.a - ac) * 0.5) + 1e-5;
    acc += d * w; ws += w;
  }
  return acc / ws;
}

// sharp picture mixed with the bokeh where (and as much as) it is out of focus;
// returns the DOF blend factor in .a. Tiles with no blur nearby skip all DOF reads.
vec4 sceneAt(vec2 uv, ivec2 ip, bool exact) {
  vec3 c = exact ? texelFetch(tSharp, ip, 0).rgb : texture(tSharp, uv).rgb;
  float blend = 0.0;
#ifdef DOF
  vec2 tile = uDofOn > 0.5 ? texelFetch(tDofTiles, clamp(ip / 16, ivec2(0), textureSize(tDofTiles, 0) - 1), 0).xy : vec2(0.0);
  if (tile.x > 0.75) {
    float coc = cocOf(zAt(ip));
    vec4 d = dofAt(uv, coc);
    blend = smoothstep(0.75, 2.5, max(abs(coc), d.a));
    c = mix(c, d.rgb, blend);
  }
#endif
  return vec4(c, blend);
}

vec3 noiseAt(vec2 p) {
  // per-frame offset / mirror / transpose of one 1024^2 tile: a new grain pattern every frame
  if ((uNoiseXf.z & 4) != 0) p = p.yx;
  if ((uNoiseXf.z & 1) != 0) p.x = -p.x;
  if ((uNoiseXf.z & 2) != 0) p.y = -p.y;
  p += vec2(uNoiseXf.xy);
  vec3 n;
  if (uGrainCell <= 1.0) n = texelFetch(tNoise, ivec2(p) & 1023, 0).rgb;
  else n = texture(tNoise, p / 1024.0).rgb;
  return (n * 255.0 - 128.0) / 40.0;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec2 cen = uv - 0.5;
  float aspect = uSize.x / uSize.y;
  vec2 rc = cen * vec2(aspect, 1.0);
  float r2 = dot(rc, rc) / dot(vec2(aspect, 1.0) * 0.5, vec2(aspect, 1.0) * 0.5);   // 0 centre .. 1 corner
  bool exact = true;
#ifdef DISTORT
  // radial (Brown) distortion, normalised so the corners stay in the frame
  float k = uDistortion;
  uv = 0.5 + cen * (1.0 + k * r2) / (1.0 + k);
  ip = ivec2(uv * uSize); exact = false;
#endif
  vec4 cb = sceneAt(uv, ip, exact);
  vec3 c = cb.rgb;
#ifdef CA
  // lateral chromatic aberration: red magnified, blue reduced (radially). Only
  // the sharp part of the picture gets it (inside bokeh there are no edges).
  if (cb.a < 0.99) {
    vec2 caOff = cen * (uCA / (0.5 * length(uSize)));   // px at the corner -> uv
    vec3 s0 = exact ? texelFetch(tSharp, ip, 0).rgb : texture(tSharp, uv).rgb;
    float kS = 1.0 - cb.a;
    c.r += (texture(tSharp, uv + caOff).r - s0.r) * kS;
    c.b += (texture(tSharp, uv - caOff).b - s0.b) * kS;
  }
#endif
#ifdef BLOOM
  vec3 bl = texture(tBloom, uv).rgb;
  c = mix(c, bl, uBloom);
  if (uHalation > 0.0) {
    vec3 hs = texture(tBloomSmall, uv).rgb;
    float hl = max(dot(hs, KL) * uExposure - uHalationThreshold, 0.0);
    c += uHalationTint * hl * uHalation / max(uExposure, 1e-6);
  }
#endif
  // ---- camera: exposure, white balance, natural vignetting cos^4(field angle) = 1 / (1 + tan^2)^2
  c = uWB * (c * uExposure);
  float u2 = r2 * uVigK;
  c *= mix(1.0, 1.0 / ((1.0 + u2) * (1.0 + u2)), uVignette);
  c = max(c, vec3(0.0));
  // ---- sensor noise: photon shot noise + read noise, new every frame, deterministic
  if (uGrain > 0.0) {
    vec3 n = noiseAt(gl_FragCoord.xy / max(uGrainCell, 1.0));
    // bilinear interpolation lowers the variance by 4/9: renormalise; sub-pixel grain averages by area
    float norm = uGrainCell > 1.0 ? 1.5 : uGrainCell;
    float L = dot(c, KL);
    float sigma = sqrt(uGrainNoise.x * L + uGrainNoise.y) * uGrain * norm;
    c = max(c + (vec3(n.x) + uGrainChroma * vec3(n.y, -0.5 * (n.y + n.z), n.z)) * sigma, vec3(0.0));
  }
  // ---- colour pipeline: log2 shaper -> baked 3D LUT (display-encoded sRGB)
  vec3 sh = clamp((log2(max(c, vec3(1e-10))) - uShaper.x) * uShaper.y, 0.0, 1.0);
  vec3 e = texture(tGrade, sh * ((uLutN - 1.0) / uLutN) + 0.5 / uLutN).rgb;
  oColor = vec4(e + uDither8 * (ign(gl_FragCoord.xy + vec2(17.0, 29.0)) - 0.5) / 255.0, 1.0);
}`, {
    tSharp: { value: null }, tDepth: { value: null }, tDof: { value: null }, tDofHalf: { value: null }, tDofTiles: { value: null },
    tBloom: { value: null }, tBloomSmall: { value: null }, tNoise: { value: null }, tGrade: { value: null }, uDofOn: { value: 0 },
    uSize: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.1 }, uFar: { value: 1000 },
    uCocK: { value: 0 }, uFocus: { value: 10 }, uMaxCoc: { value: 40 },
    uExposure: { value: 1 }, uWB: { value: new THREE.Matrix3() },
    uBloom: { value: 0 }, uHalation: { value: 0 }, uHalationThreshold: { value: 1 }, uHalationTint: { value: new THREE.Vector3(1, 0.3, 0.1) },
    uVignette: { value: 0 }, uVigK: { value: 0.17 },
    uCA: { value: 0 }, uDistortion: { value: 0 },
    uGrain: { value: 0 }, uGrainCell: { value: 1 }, uGrainChroma: { value: 0.2 }, uGrainNoise: { value: new THREE.Vector2() },
    uNoiseXf: { value: new THREE.Vector3() }, uShaper: { value: new THREE.Vector2(-12.47393, 1 / 16.5) }, uLutN: { value: 64 },
    uDither8: { value: 0 },
  }, {
    ...(o.dof ? { DOF: 1 } : {}), ...(o.bloom ? { BLOOM: 1 } : {}), ...(o.ca ? { CA: 1 } : {}), ...(o.distortion ? { DISTORT: 1 } : {}),
  });
}

/** 1024x1024 RGBA8 gaussian noise (128 = 0, 40 = one sigma), seeded - the sensor grain source. */
export function makeNoiseTexture(seed = 0x6EA1) {
  const N = 1024, data = new Uint8Array(N * N * 4);
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < N * N * 4; i += 2) {
    const u1 = Math.max(rnd(), 1e-9), u2 = rnd();
    const r = Math.sqrt(-2 * Math.log(u1));
    data[i] = Math.max(0, Math.min(255, Math.round(128 + 40 * r * Math.cos(6.283185307 * u2))));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(128 + 40 * r * Math.sin(6.283185307 * u2))));
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------- accumulate --
export function makeAccumulateMaterial() {
  return raw(/* glsl */ `
uniform sampler2D tSrc;
uniform float uWeight;
out vec4 o;
void main() { o = vec4(max(texelFetch(tSrc, ivec2(gl_FragCoord.xy), 0).rgb, vec3(0.0)) * uWeight, 1.0); }`,
  { tSrc: { value: null }, uWeight: { value: 1 } }, {}, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
}

// ------------------------------------------------------------ colour math --
/** CIE xy of a Planckian radiator (Kim et al. 2002 cubic fit, 1667-25000 K). */
export function planckianXY(T) {
  T = Math.min(Math.max(T, 1667), 25000);
  const t = 1e3 / T, t2 = t * t, t3 = t2 * t;
  const x = T <= 4000 ? -0.2661239 * t3 - 0.2343589 * t2 + 0.8776956 * t + 0.179910 : -3.0258469 * t3 + 2.1070379 * t2 + 0.2226347 * t + 0.240390;
  const x2 = x * x, x3 = x2 * x;
  const y = T <= 2222 ? -1.1063814 * x3 - 1.34811020 * x2 + 2.18555832 * x - 0.20219683
    : T <= 4000 ? -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867
      : 3.0817580 * x3 - 5.87338670 * x2 + 3.75112997 * x - 0.37001483;
  return [x, y];
}
/**
 * White-balance matrix (linear sRGB -> linear sRGB): the camera is balanced
 * for a light of temperature T (K) and tint; Bradford adaptation of that
 * white to D65. T = 6504 -> identity.
 */
export function whiteBalanceMatrix(T, tint = 0) {
  let [x, y] = T >= 6500 && T <= 6510 ? [0.3127, 0.3290] : planckianXY(T);
  // tint: move along the perpendicular of the locus in CIE 1960 uv (+ = magenta)
  if (tint) {
    let u = (4 * x) / (-2 * x + 12 * y + 3), v = (6 * y) / (-2 * x + 12 * y + 3);
    v -= tint * 0.01;
    x = (3 * u) / (2 * u - 8 * v + 4); y = (2 * v) / (2 * u - 8 * v + 4);
  }
  const XYZ = (xx, yy) => [xx / yy, 1, (1 - xx - yy) / yy];
  const B = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]];
  const Binv = [[0.9869929, -0.1470543, 0.1599627], [0.4323053, 0.5183603, 0.0492912], [-0.0085287, 0.0400428, 0.9684867]];
  const mul = (M, v) => M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
  const mm = (A, Bm) => A.map((r) => [0, 1, 2].map((j) => r[0] * Bm[0][j] + r[1] * Bm[1][j] + r[2] * Bm[2][j]));
  const src = mul(B, XYZ(x, y)), dst = mul(B, XYZ(0.3127, 0.3290));
  const D = [[dst[0] / src[0], 0, 0], [0, dst[1] / src[1], 0], [0, 0, dst[2] / src[2]]];
  const adapt = mm(Binv, mm(D, B));
  const RGB2XYZ = [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]];
  const XYZ2RGB = [[3.2404542, -1.5371385, -0.4985314], [-0.9692660, 1.8760108, 0.0415560], [0.0556434, -0.2040259, 1.0572252]];
  const M = mm(XYZ2RGB, mm(adapt, RGB2XYZ));
  // keep the luminance of mid grey (white balance should not change exposure)
  const g = M[1][0] + M[1][1] + M[1][2];
  return M.map((r) => r.map((v) => v / g));
}

export const LOOKS = {
  base: { slope: [1, 1, 1], power: [1, 1, 1], sat: 1 },
  cinema: { slope: [1, 1, 1], power: [1.25, 1.25, 1.25], sat: 1.2 },
  punchy: { slope: [1, 1, 1], power: [1.35, 1.35, 1.35], sat: 1.4 },
  golden: { slope: [1.0, 0.94, 0.8], power: [1.1, 1.1, 1.1], sat: 1.12 },
  // print-film S-curve: deeper blacks, mid grey a little lower, highlight shoulder
  // reaching full white about 4 stops over grey (AgX base never quite does)
  print: { slope: [1.08, 1.08, 1.08], power: [1.4, 1.4, 1.4], sat: 1.08 },
};

// ------------------------------------------------------------------- debug --
// cinematic.debug = 'ao' | 'contact' | 'velocity' | 'coc' | 'depth' | 'dof' | 'bloom' | 'scene'
// shows one internal buffer instead of the picture (for checking a feature)
export const DEBUG_VIEWS = ['ao', 'contact', 'velocity', 'coc', 'depth', 'dof', 'bloom', 'scene', 'fog'];
export function makeDebugMaterial() {
  return raw(/* glsl */ `
${COMMON}
uniform sampler2D tA;
uniform int uMode;
uniform vec2 uSize;
uniform float uScale;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec4 a = texture(tA, uv);
  vec3 c;
  if (uMode == 0) c = vec3(a.r);                                            // ao
  else if (uMode == 1) c = vec3(a.g);                                       // contact
  else if (uMode == 2) c = vec3(0.5 + a.xy * uScale, 0.5 + 0.5 * clamp(length(a.xy) * uScale, 0.0, 1.0)); // velocity
  else if (uMode == 3) c = a.a < 0.0 ? vec3(-a.a * uScale, 0.0, 0.0) : vec3(0.0, 0.0, a.a * uScale);    // coc: red near, blue far
  else if (uMode == 4) c = vec3(fract(log2(max(a.b, 1e-3))));              // depth: one band per doubling
  else c = srgbOETF(a.rgb / (1.0 + a.rgb));                                 // dof / bloom / scene (Reinhard)
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`, { tA: { value: null }, uMode: { value: 0 }, uSize: { value: new THREE.Vector2(1, 1) }, uScale: { value: 1 } });
}
