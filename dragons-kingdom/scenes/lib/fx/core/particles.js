// FX library - the particle renderer every particle effect draws through.
//
// One ParticleLayer = one draw call: an instanced quad per particle, filled each frame from the
// CPU (effects evaluate their analytic, pure-in-t particle functions and push() the results),
// sorted back to front for alpha blending, uploaded once.
//
// Every particle is a CAPSULE between its position at shutter-open and shutter-close (the
// effect evaluates both), radius r: a slow puff is a round puff, a fast droplet is a streak -
// true motion blur over the camera's shutter (the cinematic stack's velocity blur cannot see
// transparent sprites). Opacity is spread over the streak (energy conserving), and particles
// smaller than ~0.7 px grow to that size with their opacity reduced (no sparkle / aliasing).
//
// Shading modes:
//   'puff'  - a lit, scattering ball of smoke / dust / spray / steam: 3D noise erosion sampled in
//             WORLD space (the billows stay put when the camera moves), sun light through the
//             puff (self-shadow along the light, Henyey-Greenstein phase), the cloud's own shadow
//             from a deep-shadow grid (shadowgrid.js), sky + ground ambient with cloud occlusion,
//             point lights (fire, lamps), soft contact with the opaque scene (late pass).
//   'drop'  - a small liquid drop / streak: glossy, dark core, sun glint, refracted sky (blood,
//             water, ale). Alpha blended.
//   'glow'  - self-lit (fire tongues, sparks, embers): additive, colour from a temperature ramp
//             or the particle's colour * intensity.
//   'chip'  - a small solid fleck (grit, ash, sawdust, grass bits): opaque-looking, lit diffuse.
//
// Per-particle data (push): p0[3], p1[3] (shutter ends), r, rot, alpha, seed, age (0..1),
// colour [r,g,b] (albedo, or emission for 'glow'), extra (mode-specific: temperature, wetness).
import * as THREE from 'three';
import { LIGHT_GLSL } from './light.js';
import { LATE_GLSL, makeLateUniforms, makeLate } from './late.js';
import { NOISE_GLSL } from './noise.js';

const VERT = /* glsl */`
precision highp float;
attribute vec4 aA;     // p0.xyz, r
attribute vec4 aB;     // p1.xyz, rot
attribute vec4 aC;     // alpha, seed, age, sunT (deep shadow)
attribute vec4 aD;     // r, g, b, extra
attribute vec2 aE;     // ambient occlusion (sky visibility), unused
uniform vec2 uViewport;
uniform float uMinPx, uStretchMax, uConserve;
varying vec3 vQ;       // capsule coords: x along the streak (in r), y across (in r), halfLen (in r)
varying vec4 vC; varying vec4 vD; varying vec2 vE;
varying vec3 vCenterW; varying float vR; varying float vViewZ; varying float vAlphaK;
varying vec3 vAxW; varying vec3 vAyW; varying vec3 vToCamW;
void main() {
  vec3 p0 = aA.xyz, p1 = aB.xyz; float r = aA.w;
  vec4 v0 = viewMatrix * vec4(p0, 1.0), v1 = viewMatrix * vec4(p1, 1.0);
  vec4 vm = 0.5 * (v0 + v1);
  float z = max(-vm.z, 1e-3);
  // pixel size of the radius; tiny particles grow to uMinPx with their opacity scaled down
  float pxPerM = projectionMatrix[1][1] * 0.5 * uViewport.y / z;
  float rpx = r * pxPerM;
  float k = 1.0;
  if (rpx < uMinPx) { k = (rpx * rpx) / (uMinPx * uMinPx); r = uMinPx / pxPerM; }
  // the streak on screen (view-space xy), its half length
  vec2 d = (v1.xy / max(-v1.z, 1e-3) - v0.xy / max(-v0.z, 1e-3)) * z;    // projected to the mid depth
  float L = length(d);
  float halfL = min(0.5 * L, uStretchMax * r);
  vec2 ax = L > 1e-5 ? d / L : vec2(cos(aB.w), sin(aB.w));
  if (L <= 1e-5 || halfL < 0.02 * r) { ax = vec2(cos(aB.w), sin(aB.w)); halfL = 0.0; }
  vec2 ay = vec2(-ax.y, ax.x);
  // energy: the particle's opacity is spread over the swept area
  k *= 1.0 / (1.0 + uConserve * halfL / r * 1.2732);   // pi r^2 / (pi r^2 + 4 r halfL)
  float ex = (halfL / r + 1.0);
  vec2 off = ax * position.x * ex * r + ay * position.y * r;
  vec4 c = vm; c.xy += off;
  vQ = vec3(position.x * ex, position.y, halfL / r);
  vC = aC; vD = aD; vE = aE; vR = r; vViewZ = z; vAlphaK = k;
  // world-space axes of the quad and the direction to the camera (for world-space noise + lighting)
  mat3 vInv = transpose(mat3(viewMatrix));
  vAxW = vInv * vec3(ax, 0.0); vAyW = vInv * vec3(ay, 0.0); vToCamW = vInv * vec3(0.0, 0.0, 1.0);
  vCenterW = 0.5 * (p0 + p1);
  gl_Position = projectionMatrix * c;
}`;

const FRAG_COMMON = /* glsl */`
precision highp float;
precision highp sampler3D;
uniform highp sampler3D uNoise;
uniform float uTime;
${LIGHT_GLSL}
${LATE_GLSL}
${NOISE_GLSL}
varying vec3 vQ; varying vec4 vC; varying vec4 vD; varying vec2 vE;
varying vec3 vCenterW; varying float vR; varying float vViewZ; varying float vAlphaK;
varying vec3 vAxW; varying vec3 vAyW; varying vec3 vToCamW;
uniform float uSoft, uOpacity, uDepthThr;
// depth-only twin: the cinematic resolve hazes / fogs every pixel at the depth it finds there. A
// transparent particle in front of a far background would get the far background's haze. The
// twin writes, under each particle, a depth between the background's and the particle's own
// (weighted by the particle's opacity), so dense smoke / flame is hazed at its own distance and
// thin edges blend smoothly into the background's haze. Over the sky (no haze applied there) it
// writes the particle depth where the particle is not negligible.
void fxWriteDepth(float a, float fz) {
  float sz = fxSceneZ();
  float z;
  if (sz > 1e8) { if (a < uDepthThr) discard; z = fz; }
  else { if (fz >= sz) discard; z = mix(sz, fz, smoothstep(0.0, 0.85, a)); }
  float n = dkLateNearFar.x, f = dkLateNearFar.y;
  float ndc = (f + n) / (f - n) - 2.0 * f * n / ((f - n) * max(z, n));
  gl_FragDepth = clamp(0.5 * ndc + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(0.0);
}
#ifdef FX_DEPTH_ONLY
#define FX_DEPTH_OUT(a, fz) { fxWriteDepth(a, fz); return; }
#else
#define FX_DEPTH_OUT(a, fz)
#endif
// nearest point on the capsule axis -> (dx, dy) in units of r
vec2 fxCapsule() { return vec2(max(abs(vQ.x) - vQ.z, 0.0) * sign(vQ.x), vQ.y); }
float fxSoftFade(float frontZ) {
  float sz = fxSceneZ();
  if (sz > 1e8) return 1.0;
  return clamp((sz - frontZ) / max(uSoft, 1e-3), 0.0, 1.0);
}
`;

const FRAG_PUFF = FRAG_COMMON + /* glsl */`
uniform vec3 uAlbedo;
uniform float uSigma, uG, uNoiseScale, uNoiseAmt, uEvolve, uAmbient, uEmissive, uBillow, uEdge, uSunScale, uMS;
uniform vec3 uEmitCol;
void main() {
  vec2 q = fxCapsule();
  float d2 = dot(q, q);
  if (d2 >= 1.0) discard;
  float zs = sqrt(1.0 - d2);                 // sphere height toward the camera (in r)
  float age = vC.z, seed = vC.y;
  // world point on the puff (mid-depth) for noise: billows fixed in the world, slowly evolving
  vec3 pw = vCenterW + (vAxW * q.x + vAyW * q.y) * vR + vToCamW * zs * vR * 0.5;
  vec3 np = (pw - vCenterW) / vR * uNoiseScale + vec3(seed * 13.17, seed * 7.31, seed * 3.77) + vec3(0.0, -age * uEvolve, age * uEvolve * 0.37);
  vec4 n = texture(uNoise, np * 0.25);
  vec4 n2 = texture(uNoise, np * 0.61 + 0.37);
  float bill = mix(n.r, n.g, uBillow) * 0.8 + n2.b * 0.2;
  // erode the ball by the noise: denser core, ragged rim (fine erosion grows toward the rim)
  float dr = sqrt(d2);
  float dens = smoothstep(1.0, 1.0 - uEdge, dr + (bill - 0.5) * uNoiseAmt + (n2.r - 0.5) * 0.3 * uNoiseAmt * dr);
  dens *= 0.55 + 0.9 * bill;
  if (dens <= 0.002) discard;
  // relief: the noise's slope toward the sun (a billow facing the sun is lit, its back is not)
  vec3 npL = np + uSunDir * 0.18 * uNoiseScale;
  vec4 nL = texture(uNoise, npL * 0.25);
  vec4 n2L = texture(uNoise, npL * 0.61 + 0.37);
  float billL = mix(nL.r, nL.g, uBillow) * 0.8 + n2L.b * 0.2;
  float relief = clamp(0.5 + (bill - billL) * 3.5, 0.0, 1.0);
  float thick = 2.0 * zs * vR;                // metres of puff along the view ray
  float rho = uSigma * vC.x;                   // extinction (1/m) at full noise density
  float tau = rho * dens * thick;
  float alpha = (1.0 - exp(-tau)) * vAlphaK * uOpacity;
  // soft contact with the opaque scene, fade near the camera
  alpha *= fxSoftFade(vViewZ - zs * vR);
  alpha *= smoothstep(0.15, 0.6 + vR * 0.5, vViewZ - zs * vR);
  if (alpha <= 0.002) discard;
  FX_DEPTH_OUT(alpha, vViewZ - zs * vR)
  // ---- light
  vec3 nW = normalize(vAxW * q.x + vAyW * q.y + vToCamW * zs);   // sphere normal
  vec3 L = uSunDir;
  // self shadow: chord through the unit sphere from the mid-plane point toward the light
  vec3 pm = vAxW * q.x + vAyW * q.y;           // mid-plane point, unit sphere
  float b = dot(pm, L), c = dot(pm, pm) - 1.0;
  float chord = max(0.0, -b + sqrt(max(b * b - c, 0.0)));
  float selfT = exp(-rho * dens * chord * vR * 0.8);
  // multiple scattering keeps thick puffs from going black (a second, much softer lobe)
  float msT = exp(-rho * dens * chord * vR * 0.15);
  float cloudT = vC.w;
  float cosV = dot(-normalize(vToCamW), L);    // angle between the view ray and the light
  float lamS = clamp(dot(nW, L) * 0.5 + 0.5, 0.0, 1.0);
  float lam = 0.3 + 0.7 * mix(lamS, relief, 0.6);
  // multiple scattering (Wrenninge's octaves): each order of scattering sees the light through a
  // thinner effective medium (T^(0.5^i)) with a weaker, more isotropic phase - thick, bright
  // scatterers (dust, steam) stay luminous deep inside instead of going black like soot
  float Tl = cloudT * selfT;
  float msA = uMS;
  vec3 sun = vec3(0.0);
  float oa = 1.0, ob = 1.0, oc = 1.0;
  for (int o = 0; o < 3; o++) {
    float ph = mix(fxHG(cosV, uG * oc), fxHG(cosV, -0.25 * oc), 0.25) * 12.566;
    float Ti = pow(max(Tl, 1e-4), ob);
    sun += oa * Ti * mix(lam, ph * (0.6 + 0.8 * relief), 0.5);
    oa *= msA; ob *= 0.5; oc *= 0.5;
  }
  // (energy: the octaves share what single scattering would give - an optically thick cloud of
  // albedo a looks like a matte surface of about that albedo on its lit side, never brighter than
  // the lime-washed wall beside it; thin forward-lit fringes still glow through the phase term)
  sun *= 1.0 / (1.0 + 0.75 * (msA + msA * msA));
  sun *= uSunCol * uSunScale / 3.14159;
  float occ = vE.x;
  vec3 amb = mix(uGroundCol, uSkyCol, clamp(0.5 + 0.5 * nW.y, 0.0, 1.0)) * (0.35 + 0.65 * occ) * uAmbient * (0.8 + 0.4 * bill);
  vec3 pdir; vec3 pe = fxPointIrr(pw, pdir);
  vec3 pts = pe * (0.4 + 0.6 * clamp(dot(nW, normalize(pdir + 1e-5)) * 0.5 + 0.5, 0.0, 1.0)) / 3.14159;
  vec3 alb = uAlbedo * vD.rgb;
  // light that went deep into the cloud comes out more saturated (many bounces on coloured grains)
  alb = mix(alb, alb * alb * 1.8, (1.0 - selfT * cloudT) * 0.45);
  vec3 col = alb * (sun + amb + pts) + uEmitCol * uEmissive * vD.a * dens;
  gl_FragColor = vec4(col * alpha, alpha);
}`;

const FRAG_DROP = FRAG_COMMON + /* glsl */`
uniform vec3 uAlbedo; uniform float uGloss;
void main() {
  vec2 q = fxCapsule();
  float d2 = dot(q, q);
  if (d2 >= 1.0) discard;
  float zs = sqrt(1.0 - d2);
  float alpha = smoothstep(1.0, 0.55, sqrt(d2)) * vC.x * vAlphaK * uOpacity;
  alpha *= fxSoftFade(vViewZ - zs * vR);
  if (alpha <= 0.002) discard;
  FX_DEPTH_OUT(alpha, vViewZ - zs * vR)
  vec3 nW = normalize(vAxW * q.x + vAyW * q.y + vToCamW * zs);
  vec3 V = normalize(vToCamW);
  vec3 alb = uAlbedo * vD.rgb;
  // a liquid drop: absorbing body (dark, saturated), lit thinly; a sharp sun glint; sky reflection at the rim
  float diff = clamp(dot(nW, uSunDir), 0.0, 1.0);
  vec3 body = alb * (uSunCol * (0.25 + 0.75 * diff) * 0.25 + mix(uGroundCol, uSkyCol, 0.5 + 0.5 * nW.y) * 0.6) * vC.w;
  vec3 H = normalize(uSunDir + V);
  float spec = pow(clamp(dot(nW, H), 0.0, 1.0), uGloss) * (uGloss + 2.0) / 25.0;
  float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(nW, V), 0.0, 1.0), 5.0);
  vec3 refl = mix(uGroundCol, uSkyCol, clamp(reflect(-V, nW).y * 0.5 + 0.5, 0.0, 1.0)) * fres * 0.8;
  vec3 col = body + (uSunCol * spec * vC.w + refl) * vD.a;
  gl_FragColor = vec4(col * alpha, alpha);
}`;

const FRAG_GLOW = FRAG_COMMON + /* glsl */`
uniform float uGain;
uniform float uCore;      // 0: soft blob, 1: hard bright core
// blackbody-ish ramp for temperature (K/1000 in vD.a when vD.rgb == 0)
vec3 fxBlackbody(float T) {
  T = clamp(T, 0.5, 12.0);
  vec3 c;
  c.r = T < 6.6 ? 1.0 : clamp(1.29 * pow(T * 10.0 - 60.0, -0.1332), 0.0, 1.0);
  c.g = T < 6.6 ? clamp(0.39 * log(T * 10.0) - 0.632, 0.0, 1.0) : clamp(1.13 * pow(T * 10.0 - 60.0, -0.0755), 0.0, 1.0);
  c.b = T >= 6.6 ? 1.0 : (T < 1.9 ? 0.0 : clamp(0.543 * log(T * 10.0 - 10.0) - 1.196, 0.0, 1.0));
  // radiance grows steeply with temperature (Stefan-Boltzmann, tamed)
  float I = pow(T / 1.5, 4.0) * 0.12;
  return c * c * I;
}
void main() {
  vec2 q = fxCapsule();
  float d2 = dot(q, q);
  if (d2 >= 1.0) discard;
  float d = sqrt(d2);
  float m = mix(exp(-d2 * 3.5) * (1.0 - d2), smoothstep(1.0, 0.25, d), uCore);
  m *= vC.x * vAlphaK;
  m *= fxSoftFade(vViewZ);
  if (m <= 0.0005) discard;
  vec3 e = dot(vD.rgb, vec3(1.0)) > 0.0 ? vD.rgb : fxBlackbody(vD.a);
  gl_FragColor = vec4(e * m * uGain, 0.0);
}`;

const FRAG_CHIP = FRAG_COMMON + /* glsl */`
uniform vec3 uAlbedo;
void main() {
  vec2 q = fxCapsule();
  float d2 = dot(q, q);
  // an irregular fleck: noisy outline
  float ang = atan(q.y, q.x);
  float rim = 0.75 + 0.25 * sin(ang * 3.0 + vC.y * 40.0) * sin(ang * 5.0 + vC.y * 17.0);
  if (d2 >= rim * rim) discard;
  float alpha = vC.x * vAlphaK * uOpacity;
  alpha *= fxSoftFade(vViewZ);
  if (alpha <= 0.002) discard;
  FX_DEPTH_OUT(alpha, vViewZ)
  vec3 nW = normalize(vToCamW + (vAxW * q.x + vAyW * q.y) * 0.6);
  float diff = clamp(dot(nW, uSunDir), 0.0, 1.0) * 0.75 + 0.25;
  vec3 alb = uAlbedo * vD.rgb;
  vec3 col = alb * (uSunCol * diff * vC.w / 3.14159 + mix(uGroundCol, uSkyCol, 0.6) * (0.4 + 0.6 * vE.x));
  gl_FragColor = vec4(col * alpha, alpha);
}`;


// 'flame': a volumetric, self-lit tongue of burning gas - the same world-space noise erosion as
// 'puff' (billows fixed in the flow), emission from a local heat value mapped through a palette
// (core / body / edge, the canon fire colours) or a blackbody ramp; additive. vD.a = heat (0..1.4)
const FRAG_FLAME = FRAG_COMMON + /* glsl */`
uniform vec3 uCoreC, uBodyC, uEdgeC;
uniform float uGain, uNoiseScale, uNoiseAmt, uEvolve, uEdge, uSoot, uOcc, uSigma;
void main() {
  vec2 q = fxCapsule();
  float d2 = dot(q, q);
  if (d2 >= 1.0) discard;
  float zs = sqrt(1.0 - d2);
  float age = vC.z, seed = vC.y;
  // (thick mode: the noise runs along the whole streak, half smeared - a fully clamped
  // coordinate printed straight hatching along every fast tongue)
  float qx = uOcc > 0.0 ? mix(q.x, vQ.x, 0.5) : q.x;
  vec3 pw = vCenterW + (vAxW * qx + vAyW * q.y) * vR + vToCamW * zs * vR * 0.5;
  vec3 np = (pw - vCenterW) / vR * uNoiseScale + vec3(seed * 13.17, seed * 7.31, seed * 3.77) + vec3(0.0, -age * uEvolve, age * uEvolve * 0.37);
  vec4 n = texture(uNoise, np * 0.25);
  vec4 n2 = texture(uNoise, np * 0.71 + 0.37);
  float dr = sqrt(d2);
  // torn tongue: the ball eroded hard by the billow and wisp channels, finer rips toward the rim
  float shape = dr * 0.9 + (n.g - 0.5) * uNoiseAmt * 1.3 + (n2.r - 0.5) * 0.8 * uNoiseAmt * dr;
  float dens = smoothstep(1.0, 1.0 - uEdge, shape);
  // tears: dark gaps between licking tongues (the sum of many tongues must not fill in smooth)
  dens *= smoothstep(0.3, 0.7, n.r * 0.55 + n2.g * 0.65 + (1.0 - dr) * 0.25);
  if (dens <= 0.003) discard;
  // local heat: hotter in the middle of the tongue and where the noise is dense
  // billows (Worley cells) are hot in their middles, the creases between them cool to dark red
  float heat = vD.a * (0.55 + 0.6 * (1.0 - dr)) * (0.45 + 0.9 * n.g) * (0.85 + 0.3 * n.r) - (n2.b - 0.5) * 0.25;
  vec3 col = heat > 0.55 ? mix(uBodyC, uCoreC, clamp((heat - 0.55) / 0.45, 0.0, 1.0)) : mix(uEdgeC, uBodyC, clamp(heat / 0.55, 0.0, 1.0));
  col *= smoothstep(0.0, 0.25, heat);
  float thick = 2.0 * zs;
  float tau = dens * thick * vC.x * vAlphaK * fxSoftFade(vViewZ - zs * vR);
  FX_DEPTH_OUT(clamp(tau * 1.5, 0.0, 1.0), vViewZ - zs * vR)
  if (uOcc > 0.0) {
    // optically thick flame (a dragon's fuel-rich jet): emission + absorption. Each tongue covers
    // what is behind it by a = 1 - e^-(sigma tau) and shines with the local source colour, so
    // piled-up tongues converge to the flame's own radiance instead of adding up to a white
    // beam, and cool, sooty creases between billows read dark against the sky.
    float a = (1.0 - exp(-tau * uSigma)) * smoothstep(1.0, 0.55, dr);
    // contrast of a real flame: billow middles burn hot, the folds between them cool to deep
    // red and sooty brown; the hottest (youngest) gas near the mouth glares yellow-white
    float hb = heat * mix(0.45, 1.25, smoothstep(0.3, 0.75, n.g * 0.7 + n2.r * 0.5));
    vec3 c2 = hb > 0.55 ? mix(uBodyC, uCoreC, clamp((hb - 0.55) / 0.45, 0.0, 1.0)) : mix(uEdgeC * 0.6, uBodyC, clamp(hb / 0.55, 0.0, 1.0));
    c2 *= smoothstep(0.08, 0.4, hb) * (1.0 + 1.6 * max(0.0, hb - 1.0));
    float soot = (1.0 - smoothstep(0.05, 0.5, hb)) * uSoot;
    gl_FragColor = vec4(c2 * a * uGain, a * uOcc * (0.7 + 0.3 * soot));
    return;
  }
  gl_FragColor = vec4(col * tau * uGain, 0.0);
}`;

// 'shimmer': heat haze - the scene behind (late pass colour copy) refracted by rising, swirling
// noise; strongest low and in the middle of each patch. Needs the cinematic stack's late pass
// (without it the patch draws nothing).
const FRAG_SHIMMER = FRAG_COMMON + /* glsl */`
uniform float uShimmer, uTimeS;
void main() {
  if (dkLateOn < 0.5) discard;
  vec2 q = fxCapsule();
  float d2 = dot(q, q);
  if (d2 >= 1.0) discard;
  float zs = sqrt(1.0 - d2);
  vec3 pw = vCenterW + (vAxW * q.x + vAyW * q.y) * vR;
  float sz = fxSceneZ();
  if (sz < vViewZ - zs * vR) discard;                  // something solid in front of the haze
  vec3 np = pw * 1.7 + vec3(0.0, -uTimeS * 2.2, 0.0) + vC.y * 5.0;
  vec3 n = texture(uNoise, np * 0.25).rgb - 0.5;
  vec3 n2 = texture(uNoise, np * 0.9 + 0.31).rgb - 0.5;
  float w = (1.0 - d2) * (1.0 - d2) * vC.x;
  // refraction offset in pixels: grows with the depth of hot air behind it, falls with distance
  vec2 off = (n.xy * 0.7 + n2.xy * 0.5) * uShimmer * w * dkLateSize.y / max(vViewZ, 1.0);
  vec3 col = fxSceneColor(gl_FragCoord.xy + off);
  gl_FragColor = vec4(col * w, w);
}`;

const FRAGS = { puff: FRAG_PUFF, drop: FRAG_DROP, glow: FRAG_GLOW, chip: FRAG_CHIP, flame: FRAG_FLAME, shimmer: FRAG_SHIMMER };

// shadow-map pass for puffs: the same density, turned into a stochastic (hashed) cut-out so a
// thick cloud casts a solid shadow and a thin one a partial one (the shadow filter smooths it)
const FRAG_PUFF_DEPTH = /* glsl */`
precision highp float;
precision highp sampler3D;
#include <packing>
uniform highp sampler3D uNoise;
uniform float uSigma, uNoiseScale, uNoiseAmt, uEvolve, uBillow, uEdge, uShadowK;
varying vec3 vQ; varying vec4 vC; varying vec4 vD; varying vec2 vE;
varying vec3 vCenterW; varying float vR; varying float vViewZ; varying float vAlphaK;
varying vec3 vAxW; varying vec3 vAyW; varying vec3 vToCamW;
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 q = vec2(max(abs(vQ.x) - vQ.z, 0.0) * sign(vQ.x), vQ.y);
  float d2 = dot(q, q);
  if (d2 >= 1.0) discard;
  float zs = sqrt(1.0 - d2);
  float age = vC.z, seed = vC.y;
  vec3 pw = vCenterW + (vAxW * q.x + vAyW * q.y) * vR;
  vec3 np = (pw - vCenterW) / vR * uNoiseScale + vec3(seed * 13.17, seed * 7.31, seed * 3.77) + vec3(0.0, -age * uEvolve, age * uEvolve * 0.37);
  vec4 n = texture(uNoise, np * 0.25);
  float bill = mix(n.r, n.g, uBillow);
  float dens = smoothstep(1.0, 1.0 - uEdge, sqrt(d2) + (bill - 0.5) * uNoiseAmt) * (0.55 + 0.9 * bill);
  float tau = uSigma * vC.x * dens * 2.0 * zs * vR;
  float a = (1.0 - exp(-tau)) * vAlphaK * uShadowK;
  if (a < h12(gl_FragCoord.xy + seed * 97.0)) discard;
  gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
}`;

/**
 * new ParticleLayer(fx, { max, mode, name, sort, late, shading: {...} })
 * shading (puff): albedo [r,g,b], sigma (1/m extinction per unit density), g (phase), noiseScale,
 *   noiseAmt, evolve, ambient, billow (0 wispy - 1 cauliflower), edge, emissive, emitCol, sunScale,
 *   ms (multiple-scattering strength ~ single-scattering albedo: 0.6-0.8 dust/steam, 0.2 soot)
 * shading (drop): albedo, gloss; (glow): gain, core; (chip): albedo
 */
export class ParticleLayer {
  constructor(fx, o = {}) {
    this.fx = fx;
    this.mode = o.mode || 'puff';
    this.max = Math.max(1, o.max | 0);
    this.sort = o.sort ?? (this.mode !== 'glow' && this.mode !== 'flame');
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(this.max * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aA = mk(4); this.aB = mk(4); this.aC = mk(4); this.aD = mk(4); this.aE = mk(2);
    for (const [k, a] of Object.entries({ aA: this.aA, aB: this.aB, aC: this.aC, aD: this.aD, aE: this.aE })) quad.setAttribute(k, a);
    quad.instanceCount = 0;
    // bounds follow the particles (shadow-cache patches, culling refreshes)
    this.bounds = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    quad.computeBoundingBox = () => { quad.boundingBox = this.bounds.clone(); };
    quad.computeBoundingSphere = () => { quad.boundingSphere = this.bounds.getBoundingSphere(new THREE.Sphere()); };
    quad.computeBoundingBox(); quad.computeBoundingSphere();
    // staging (unsorted) arrays
    this.sA = new Float32Array(this.max * 4); this.sB = new Float32Array(this.max * 4);
    this.sC = new Float32Array(this.max * 4); this.sD = new Float32Array(this.max * 4); this.sE = new Float32Array(this.max * 2);
    this.depth = new Float32Array(this.max); this.order = new Uint32Array(this.max);
    this.n = 0;
    const s = o.shading || {};
    const late = makeLateUniforms();
    const v3 = (a, d) => new THREE.Vector3(...(a || d));
    const uniforms = {
      ...fx.light.uniforms, ...late,
      uNoise: { value: fx.noise }, uTime: { value: 0 },
      uViewport: { value: new THREE.Vector2(fx.ctx.renderWidth || fx.ctx.width || 1920, fx.ctx.renderHeight || fx.ctx.height || 1080) },
      uMinPx: { value: o.minPx ?? 0.7 }, uStretchMax: { value: o.stretchMax ?? 400 }, uConserve: { value: o.conserve === false ? 0 : 1 },
      uSoft: { value: o.soft ?? 0.6 }, uOpacity: { value: s.opacity ?? 1 }, uDepthThr: { value: 0.5 },
      uAlbedo: { value: v3(s.albedo, [0.5, 0.47, 0.42]) },
      uSigma: { value: s.sigma ?? 2.0 }, uG: { value: s.g ?? 0.45 },
      uNoiseScale: { value: s.noiseScale ?? 1.0 }, uNoiseAmt: { value: s.noiseAmt ?? 0.9 }, uEvolve: { value: s.evolve ?? 0.6 },
      uAmbient: { value: s.ambient ?? 1.0 }, uBillow: { value: s.billow ?? 0.6 }, uEdge: { value: s.edge ?? 0.6 },
      uEmissive: { value: s.emissive ?? 0 }, uMS: { value: s.ms ?? 0.5 }, uEmitCol: { value: v3(s.emitCol, [1, 0.4, 0.1]) }, uSunScale: { value: s.sunScale ?? 1 },
      uGloss: { value: s.gloss ?? 120 }, uGain: { value: s.gain ?? 1 }, uCore: { value: s.core ?? 0 },
      uCoreC: { value: v3(s.coreC, [1.0, 0.5, 0.09]) }, uBodyC: { value: v3(s.bodyC, [1.0, 0.27, 0.025]) }, uEdgeC: { value: v3(s.edgeC, [0.75, 0.07, 0.01]) },
      uSoot: { value: s.soot ?? 0 }, uShimmer: { value: s.shimmer ?? 1 }, uTimeS: { value: 0 }, uOcc: { value: s.occlusion ?? 0 },
    };
    this.uniforms = uniforms;
    const blend = o.blending || (this.mode === 'glow' || (this.mode === 'flame' && !(s.occlusion > 0)) ? 'additive' : 'premult');
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAGS[this.mode], uniforms,
      transparent: true, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: blend === 'additive' ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: blend === 'additive' ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
    });
    mat.extensions = {};
    this.material = mat;
    this.mesh = new THREE.Mesh(quad, mat);
    this.mesh.name = o.name || `fx-${this.mode}`;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.mesh.renderOrder = o.renderOrder ?? ({ glow: 12, flame: 11, shimmer: 8 }[this.mode] ?? 10);
    if (o.late !== false) makeLate(this.mesh, uniforms);
    else this.mesh.userData.dkNoVelocity = true;
    this.geometry = quad;
    this.shadowGrid = null;
    // depth twin (drawn right after the colour pass): dense pixels write the particle's depth, so the
    // cinematic resolve hazes / fogs them at their own distance (not at the far background's) and
    // depth of field / later FX see them. o.depthWrite: alpha threshold, false = none.
    const thrDef = { puff: 0.1, drop: 0.3, chip: 0.3, flame: 0.1 }[this.mode];   // (sky threshold)
    const thr = o.depthWrite === false ? null : (o.depthWrite ?? thrDef ?? null);
    if (thr != null) {
      const du = { ...uniforms, uDepthThr: { value: thr } };
      const dmat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAGS[this.mode], uniforms: du, defines: { FX_DEPTH_ONLY: 1 },
        transparent: true, depthWrite: true, depthTest: true, colorWrite: false, side: THREE.DoubleSide,
      });
      const twin = new THREE.Mesh(quad, dmat);
      twin.name = `${this.mesh.name}-depth`;
      twin.frustumCulled = false; twin.castShadow = false; twin.receiveShadow = false;
      twin.renderOrder = 1000 + this.mesh.renderOrder;      // after every colour layer (never hides another FX)
      if (o.late !== false) makeLate(twin, du); else twin.userData.dkNoVelocity = true;
      this.depthTwin = twin;
    }
    // clouds cast (stochastic) shadows on the ground, people and the volumetric fog
    const cast = o.castShadow ?? (this.mode === 'puff' && fx.tier.castShadow);
    if (cast && this.mode === 'puff') {
      const du = { ...uniforms, uMinPx: { value: 0 }, uShadowK: { value: o.shadowStrength ?? 1 } };
      this.depthMaterial = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG_PUFF_DEPTH, uniforms: du, side: THREE.DoubleSide });
      this.mesh.customDepthMaterial = this.depthMaterial;
      this.mesh.castShadow = true;
      if (o.late !== false) {
        // a late object lives on the late layer and would be skipped by the shadow pass: a twin
        // on the default layer draws only into the shadow map
        const none = new THREE.ShaderMaterial({
          vertexShader: 'void main() { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }',     // clipped: no fragments in the camera pass
          fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }', colorWrite: false, depthWrite: false,
        });
        const twin = new THREE.Mesh(quad, none);
        twin.customDepthMaterial = this.depthMaterial;
        twin.castShadow = true; twin.frustumCulled = false; twin.renderOrder = -100;
        twin.userData.dkNoVelocity = true;
        twin.name = `${this.mesh.name}-shadow`;
        this.shadowTwin = twin;
        this.mesh.castShadow = false;
      }
    }
  }

  begin() { this.n = 0; }

  /** Add one particle (see header). Returns false when full. */
  push(p0, p1, r, rot, alpha, seed, age, col, extra = 0, sunT = 1, occ = 1) {
    if (this.n >= this.max || !(alpha > 0) || !(r > 0)) return false;
    const i = this.n++;
    const A = this.sA, B = this.sB, C = this.sC, D = this.sD, E = this.sE;
    A[i * 4] = p0[0]; A[i * 4 + 1] = p0[1]; A[i * 4 + 2] = p0[2]; A[i * 4 + 3] = r;
    B[i * 4] = p1[0]; B[i * 4 + 1] = p1[1]; B[i * 4 + 2] = p1[2]; B[i * 4 + 3] = rot;
    C[i * 4] = alpha; C[i * 4 + 1] = seed; C[i * 4 + 2] = age; C[i * 4 + 3] = sunT;
    D[i * 4] = col ? col[0] : 1; D[i * 4 + 1] = col ? col[1] : 1; D[i * 4 + 2] = col ? col[2] : 1; D[i * 4 + 3] = extra;
    E[i * 2] = occ; E[i * 2 + 1] = 0;
    return true;
  }

  /** Light the particles with a deep-shadow grid (puffs). grid: ShadowGrid. */
  applyShadow(grid, density) {
    if (!grid || !this.n) return;
    grid.build(this.sA, this.sC, this.n, density);
    grid.lookup(this.sA, this.sC, this.sE, this.n);
  }

  /** Sort (back to front) and upload. Call after all push()es of the frame. */
  end(camera) {
    const n = this.n;
    const geo = this.geometry;
    geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (this.shadowTwin) this.shadowTwin.visible = n > 0;
    if (this.depthTwin) this.depthTwin.visible = n > 0;
    if (!n) return;
    {
      const A = this.sA, B = this.sB;
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < n; i++) {
        const r = A[i * 4 + 3] * 1.2;
        for (const S of [A, B]) {
          const x = S[i * 4], y = S[i * 4 + 1], z = S[i * 4 + 2];
          if (x - r < x0) x0 = x - r; if (y - r < y0) y0 = y - r; if (z - r < z0) z0 = z - r;
          if (x + r > x1) x1 = x + r; if (y + r > y1) y1 = y + r; if (z + r > z1) z1 = z + r;
        }
      }
      this.bounds.min.set(x0, y0, z0); this.bounds.max.set(x1, y1, z1);
      geo.computeBoundingBox(); geo.computeBoundingSphere();
    }
    let ord = null;
    if (this.sort && camera) {
      camera.updateMatrixWorld();
      const e = camera.matrixWorldInverse.elements;
      const dz0 = e[2], dz1 = e[6], dz2 = e[10], dz3 = e[14];
      const A = this.sA, B = this.sB;
      for (let i = 0; i < n; i++) {
        const x = 0.5 * (A[i * 4] + B[i * 4]), y = 0.5 * (A[i * 4 + 1] + B[i * 4 + 1]), z = 0.5 * (A[i * 4 + 2] + B[i * 4 + 2]);
        this.depth[i] = dz0 * x + dz1 * y + dz2 * z + dz3;     // view z (negative in front)
        this.order[i] = i;
      }
      ord = this.order.subarray(0, n);
      const dep = this.depth;
      ord.sort((a, b) => dep[a] - dep[b]);                     // most negative (farthest) first
    }
    const cp = (src, dst, w) => {
      if (!ord) { dst.array.set(src.subarray(0, n * w)); }
      else { const a = dst.array; for (let j = 0; j < n; j++) { const i = ord[j]; for (let k = 0; k < w; k++) a[j * w + k] = src[i * w + k]; } }
      dst.clearUpdateRanges(); dst.addUpdateRange(0, n * w); dst.needsUpdate = true;
    };
    cp(this.sA, this.aA, 4); cp(this.sB, this.aB, 4); cp(this.sC, this.aC, 4); cp(this.sD, this.aD, 4); cp(this.sE, this.aE, 2);
  }

  setTime(t) { this.uniforms.uTime.value = t; this.uniforms.uTimeS.value = t; }
  dispose() { this.geometry.dispose(); this.material.dispose(); this.depthTwin?.material.dispose(); }
}
