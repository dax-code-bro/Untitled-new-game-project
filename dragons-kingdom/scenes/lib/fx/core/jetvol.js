// FX library - a ray-marched dragon-fire jet: one continuous volume around the stream's
// centreline instead of hundreds of overlapping sprites (sprites piled up into a layered,
// torn-paper / airbrushed look; a real jet is one turbulent body of burning gas).
//
// Each frame the effect (fire.js FireJet) samples the stream's centreline as a polyline of up to
// 32 points: for gas of age a (s) emitted at te = t - a from the mouth's position / direction at
// te, its position, the tube radius, its heat. Per pixel the shader
//   * sphere-traces the empty space to the tube (distance to the polyline minus its radius),
//   * inside, marches in steps of a fraction of the local radius, finding the gas coordinates of
//     each sample: its age a (where along the stream), its cross-section position in units of
//     the radius, and its BIRTH time te = t - a. The turbulence is looked up in (cross-section,
//     birth time): structure rides along with the gas, is stretched into a streaky rod where the
//     jet is fast (at the mouth) and bunches into rolling billows where it slows down;
//   * soot temperature from the gas's heat (white-hot fuel at the mouth -> orange body -> dark
//     red, sooty end), hotter in billow middles and in the core, cool soot on the rims; emission
//     and absorption of soot (core/blackbody.js radiance: the core clips and blooms, the cool rims
//     are dark and cover the sky);
//   * every step takes its own moment inside the shutter (the gas streams along: motion blur).
// Pure in t: the polyline is a function of t, the noise is fixed.
import * as THREE from 'three';
import { LATE_GLSL, makeLateUniforms, makeLate } from './late.js';
import { BLACKBODY_GLSL, flameUniforms, flamePalette } from './blackbody.js';

export const JET_MAX = 32;

const VERT = /* glsl */`
varying vec3 vWorld;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const FRAG = /* glsl */`
precision highp float;
precision highp sampler3D;
${LATE_GLSL}
${BLACKBODY_GLSL}
uniform highp sampler3D uNoise;
uniform vec4 uC[${JET_MAX}];      // centreline xyz, tube radius
uniform vec4 uA[${JET_MAX}];      // gas age a (s), f = a / life, heat, unused
uniform int uN;
uniform vec3 uBMin, uBMax;
uniform float uDebug;
uniform float uT, uShutter, uKappa, uOn, uSteps, uSeed, uTurb, uSharp, uTeK, uStepK, uDepthThr, uL, uLife, uP, uRref;
// distance travelled along the stream by gas of age a (a < 0: extrapolated at the mouth speed)
float fxXAlong(float a) { float k = 3.0 / uLife; return a >= 0.0 ? uL * (1.0 - exp(-k * a)) / 0.950213 : uL * k * a / 0.950213; }
varying vec3 vWorld;
float fxIgn(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
// distance from p to segment k, parameter s along it
vec2 seg(int k, vec3 p) {
  vec3 a = uC[k].xyz, b = uC[k + 1].xyz, ab = b - a;
  float s = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return vec2(length(p - (a + ab * s)), s);
}
float segR(int k, float s) { return mix(uC[k].w, uC[k + 1].w, s); }
vec3 fxTan(int i) { return normalize(uC[min(i + 1, uN - 1)].xyz - uC[max(i - 1, 0)].xyz + vec3(1e-6)); }
// signed distance of p past vertex i's plane (normal: the vertex tangent)
float fxPlane(int i, vec3 p) { return dot(p - uC[i].xyz, fxTan(i)); }
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
void main() {
  if (uN < 2) discard;
  vec3 ro = cameraPosition, rd = normalize(vWorld - cameraPosition);
  vec3 inv = 1.0 / mix(vec3(1e-7), rd, step(vec3(1e-7), abs(rd)));
  vec3 ta = (uBMin - ro) * inv, tb = (uBMax - ro) * inv;
  vec3 tmn = min(ta, tb), tmx = max(ta, tb);
  float t0 = max(max(max(tmn.x, tmn.y), tmn.z), 0.0), t1 = min(min(tmx.x, tmx.y), tmx.z);
  if (t1 <= t0) discard;
  vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  float cz = max(dot(rd, fwd), 1e-4);
  t1 = min(t1, fxSceneZ() / cz);
  if (t1 <= t0) discard;
  float j = fxIgn(gl_FragCoord.xy + 37.0 * fract(uT * 3.7));
  // which slab of the polyline a point is in: the slabs are bounded by planes through each
  // vertex normal to its (averaged) tangent, so the along-parameter, the centre point and the
  // cross-section frame are continuous everywhere (nearest-SEGMENT projection jumps on the
  // inside of every bend: seams in the turbulence). Entry: nearest vertex, then hill-climbing.
  vec3 p = ro + rd * t0;
  int k = 0; float best = 1e9;
  for (int i = 0; i < ${JET_MAX}; i++) {
    if (i >= uN) break;
    float dd = length(p - uC[i].xyz) - uC[i].w;
    if (dd < best) { best = dd; k = i; }
  }
  k = clamp(k, 0, uN - 2);
  vec3 L = vec3(0.0);
  float Tr = 1.0, zFront = -1.0;
  float t = t0;
  bool inside = false;
  float sk = 0.0;
  vec3 c = vec3(0.0), v = vec3(0.0);
  float R = 1.0;
  for (int it = 0; it < 240; it++) {
    if (t > t1 || Tr < 0.01) break;
    p = ro + rd * t;
    for (int h = 0; h < 10; h++) {
      if (k > 0 && fxPlane(k, p) < 0.0) { k -= 1; continue; }
      if (k < uN - 2 && fxPlane(k + 1, p) >= 0.0) { k += 1; continue; }
      break;
    }
    float d0 = fxPlane(k, p), d1 = fxPlane(k + 1, p);
    sk = d0 / max(d0 - d1, 1e-6);
    float sc0 = clamp(sk, 0.0, 1.0);
    c = mix(uC[k].xyz, uC[k + 1].xyz, sc0);
    v = p - c;
    R = mix(uC[k].w, uC[k + 1].w, sc0);
    float dist = length(v);
    float Rn = max(R, max(uC[max(k - 1, 0)].w, uC[min(k + 2, uN - 1)].w));
    if (dist > 1.45 * R) {
      // outside the tube: skip the empty space (the tube is never fatter than its neighbours)
      t += max(dist - 1.4 * Rn, 0.03 * R) + 1e-3;
      inside = false;
      continue;
    }
    float dt = R * uStepK;
    if (!inside) {
      inside = true; t += dt * j; p = ro + rd * t;
      float e0 = fxPlane(k, p), e1p = fxPlane(k + 1, p);
      sk = e0 / max(e0 - e1p, 1e-6);
      c = mix(uC[k].xyz, uC[k + 1].xyz, clamp(sk, 0.0, 1.0)); v = p - c;
    }
    float sc = clamp(sk, 0.0, 1.0);
    // ---- gas coordinates (frame from the interpolated vertex tangents: continuous round bends)
    vec3 Tg = normalize(mix(fxTan(k), fxTan(k + 1), sc));
    vec3 e1 = normalize(cross(Tg, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0)), e2 = cross(e1, Tg);
    vec4 g = mix(uA[k], uA[k + 1], sc);
    float a = g.x, f = g.y, heat = g.z;
    float u = fract(j * 7.31 + float(it) * 0.6180339);
    // (eddies and the outer mixing layer travel at ~half the centreline speed: the shutter
    // streak of the turbulence is that, not the full jet speed)
    float tnow = uT + (u - 0.5) * uShutter * 0.2;
    float te = tnow - a;                                     // birth time of the gas here
    float X = dot(v, e1) / R, Y = dot(v, e2) / R, rho = length(v) / R;
    // flow noise: two layers, each advected with the gas for one period uP then re-seeded,
    // cross-faded (triangle weights, variance-preserving): the turbulence moves along the
    // stream at the local gas speed (fast rod at the mouth, slow billows at the end) without
    // being stretched without bound; features ~ the local radius across, ~uRref along
    float ph = tnow / uP;
    float tau0 = fract(ph), tau1 = fract(ph + 0.5);
    float c0 = floor(ph), c1 = floor(ph + 0.5);
    float w0 = 1.0 - abs(2.0 * tau0 - 1.0), w1 = 1.0 - abs(2.0 * tau1 - 1.0);
    float wn = inversesqrt(max(w0 * w0 + w1 * w1, 1e-4));
    float sA0 = fxXAlong(a - tau0 * uP) / uRref, sA1 = fxXAlong(a - tau1 * uP) / uRref;
    float ang = a * 2.3 + uSeed;
    vec2 xy = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * vec2(X, Y) * 0.8;
    vec3 sd0 = vec3(fract(c0 * 0.1373) * 9.1, fract(c0 * 0.2717) * 7.3, fract(c0 * 0.0919) * 5.7) + uSeed * 0.131;
    vec3 sd1 = vec3(fract(c1 * 0.1373 + 0.5) * 9.1, fract(c1 * 0.2717 + 0.5) * 7.3, fract(c1 * 0.0919 + 0.5) * 5.7) + uSeed * 0.131;
    vec3 nq0 = vec3(xy.x, sA0 * 0.55, xy.y) + sd0, nq1 = vec3(xy.x, sA1 * 0.55, xy.y) + sd1;
    vec4 z1 = ((texture(uNoise, nq0) - 0.48) * w0 + (texture(uNoise, nq1) - 0.48) * w1) * wn / 0.155;
    vec4 z2 = ((texture(uNoise, nq0 * 2.17 + 0.41) - 0.48) * w0 + (texture(uNoise, nq1 * 2.17 + 0.41) - 0.48) * w1) * wn / 0.155;
    // big rolling billows (a few per stream width) carry the finer turbulence on their surfaces
    vec4 zB = ((texture(uNoise, nq0 * 0.37 + 0.13) - 0.48) * w0 + (texture(uNoise, nq1 * 0.37 + 0.13) - 0.48) * w1) * wn / 0.155;
    float turb = 0.5 * zB.g + 0.42 * z1.g + 0.26 * z2.r + 0.18 * z2.a;
    float A = uTurb * (0.3 + 0.35 * smoothstep(0.0, 0.5, f));
    float surge = 0.14 * sin(te * 13.0 + uSeed * 3.1 + z1.b * 0.5);
    float F = (1.0 - rho) + turb * A + surge * smoothstep(0.05, 0.3, f);
    float dens = smoothstep(0.0, uSharp, F) * smoothstep(-0.005, 0.02, a) * (1.0 - smoothstep(0.78, 1.0, f));
    if (dens > 0.002) {
      // soot temperature: the gas's heat; hotter in billow middles and the core, cooler rims;
      // older gas leaves cool soot on its rims (dark creases, black edges at the end)
      float Tb = mix(uTTip, uTCore, clamp(heat / 1.25, 0.0, 1.0));
      float inner = smoothstep(0.0, 0.45, F);
      float T = Tb + (inner - 0.55) * 300.0 + 140.0 * zB.r + 120.0 * z1.r + 70.0 * z2.b;
      T -= 330.0 * (1.0 - smoothstep(0.0, 0.22, F)) * smoothstep(0.25, 0.65, f);
      float kap = uKappa / max(R, 0.2) * dens * (1.0 + 0.6 * (1.0 - smoothstep(1050.0, 1300.0, T)));
      float al = 1.0 - exp(-kap * dt * uOn);
      L += Tr * al * (uDebug > 0.5 ? vec3(fract(float(k) * 0.37), fract(float(k) * 0.61), sc) : fxFlameRad(max(T, 700.0)));
      Tr *= 1.0 - al;
      if (zFront < 0.0 && Tr < 0.6) zFront = t * cz;
    }
    t += dt;
  }
#ifdef FX_DEPTH_ONLY
  fxWriteDepth(1.0 - Tr, zFront > 0.0 ? zFront : t0 * cz);
#else
  float alpha = 1.0 - Tr;
  if (alpha <= 0.0005) discard;
  gl_FragColor = vec4(L, alpha);
#endif
}`;

/**
 * new JetVolume(fx, { palette, seed, kappa, turb, sharp, stepK })
 * set(pts, t, shutter, on): pts = [{ p: [x,y,z], R, a, f, heat }] along the stream (mouth first).
 */
export class JetVolume {
  constructor(fx, o = {}) {
    this.fx = fx;
    this.o = o;
    this.P = o.palette?.kind ? o.palette : flamePalette(o.palette ?? 'standard');
    const late = makeLateUniforms();
    this.uniforms = {
      ...late, ...flameUniforms(this.P, THREE),
      uNoise: { value: fx.noise },
      uC: { value: Array.from({ length: JET_MAX }, () => new THREE.Vector4()) },
      uA: { value: Array.from({ length: JET_MAX }, () => new THREE.Vector4()) },
      uN: { value: 0 }, uBMin: { value: new THREE.Vector3() }, uBMax: { value: new THREE.Vector3() },
      uT: { value: 0 }, uShutter: { value: 1 / 48 }, uKappa: { value: o.kappa ?? 3.2 }, uOn: { value: 1 },
      uSteps: { value: 0 }, uSeed: { value: (o.seed ?? 1) % 89 }, uTurb: { value: o.turb ?? 1.0 },
      uSharp: { value: o.sharp ?? 0.05 }, uTeK: { value: o.teK ?? 9.0 },
      uL: { value: o.length ?? 20 }, uLife: { value: o.life ?? 0.62 }, uP: { value: o.period ?? 0.14 }, uRref: { value: o.rref ?? 1.2 },
      uDebug: { value: o.debugSeg ? 1 : 0 }, uStepK: { value: o.stepK ?? (fx.tier.gpu ? 0.05 : 0.09) }, uDepthThr: { value: 0.3 },
    };
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false, depthTest: false, side: THREE.BackSide, toneMapped: false, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = o.name || 'fx-jet-volume';
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false; this.mesh.renderOrder = 11;
    makeLate(this.mesh, this.uniforms);
    const du = { ...this.uniforms, uDepthThr: { value: 0.3 } };
    const dmat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: du, defines: { FX_DEPTH_ONLY: 1 },
      // (depth test ON so the written gl_FragDepth lands - WebGL writes no depth with the test off;
      // the fragment depth is the flame's own, never behind the scene there, so it passes)
      transparent: true, depthWrite: true, depthTest: true, colorWrite: false, side: THREE.BackSide,
    });
    this.twin = new THREE.Mesh(geo, dmat);
    this.twin.name = `${this.mesh.name}-depth`;
    this.twin.frustumCulled = false; this.twin.matrixAutoUpdate = false; this.twin.renderOrder = 1011;
    makeLate(this.twin, du);
  }

  set(pts, t, shutter, on = 1) {
    const u = this.uniforms;
    const n = Math.min(JET_MAX, pts.length);
    u.uN.value = n >= 2 && on > 0.002 ? n : 0;
    this.mesh.visible = this.twin.visible = u.uN.value > 0;
    if (this.o.noTwin) this.twin.visible = false;
    if (!u.uN.value) return;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
      const q = pts[i];
      u.uC.value[i].set(q.p[0], q.p[1], q.p[2], q.R);
      u.uA.value[i].set(q.a, q.f, q.heat, 0);
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q.p[k] - q.R * 1.5); mx[k] = Math.max(mx[k], q.p[k] + q.R * 1.5); }
    }
    u.uBMin.value.set(...mn); u.uBMax.value.set(...mx);
    u.uT.value = t; u.uShutter.value = shutter; u.uOn.value = on;
    const m = new THREE.Matrix4().compose(new THREE.Vector3((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2), new THREE.Quaternion(), new THREE.Vector3(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]));
    this.mesh.matrix.copy(m); this.mesh.matrixWorld.copy(m);
    this.twin.matrix.copy(m); this.twin.matrixWorld.copy(m);
  }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.twin.material.dispose(); }
}
