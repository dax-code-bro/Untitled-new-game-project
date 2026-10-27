// FX library - a ray-marched flame volume: burning cloth, a burning bundle on a stake, thatch, a
// rider's sleeve on fire in a 30 m/s slipstream.
//
// The flame is a field in its own frame (metres; y along the flame's axis = buoyancy + relative
// wind, base on the fuel at y = 0), marched per pixel through a box:
//   * gas rises with buoyant acceleration: a parcel reaches height y after
//     s(y) = (sqrt(v0^2 + 2 a y) - v0) / a seconds, so the turbulence is looked up at the parcel's
//     BIRTH time w = t - s(y): the structure rides up with the gas and is stretched out as the
//     gas speeds up (short billows at the base, long licking tongues higher up);
//   * the envelope narrows from the fuel to the tips (a tapered cone, not a box); above ~35 % of
//     the height the flame is intermittent: puffing (f ~ 1.5 / sqrt(D) Hz) pinches the gas into
//     tongues that detach and burn out;
//   * the flame surface is a high-contrast threshold of that field (a reaction sheet a few cm
//     thick: sharp licks with dark gaps between them), the soot temperature falls from ~1900 K
//     deep in the continuous flame to ~1050 K at the tips, emission and absorption are those of
//     soot (Kirchhoff: an optically thick core shows the blackbody radiance of core/blackbody.js,
//     clipped and blooming in the film finish; thin tips are dim red and see-through);
//   * the base just above the fuel is dim (no soot yet), the tips cool to dark red.
// Motion blur: every march step takes its own time inside the shutter (two frame transforms,
// hashed per step), so a fast-moving burning rider smears like everything else.
// Pure in t: the noise volume is fixed, every input is t or a hash.
//
// The SAME field runs in JS (FlameVolume.emission) on a coarse grid every frame: the light the
// flame throws on its surroundings is its radiance times its emitting volume (point light at the
// emission centroid, intensity = integral of emission), so it flickers exactly with the visible
// flame and is never brighter or darker than the flame that causes it.
import * as THREE from 'three';
import { LATE_GLSL, makeLateUniforms, makeLate } from './late.js';
import { BLACKBODY_GLSL, flameUniforms, flamePalette, flameRadiance } from './blackbody.js';

const VERT = /* glsl */`
varying vec3 vWorld;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

// the field (shared by colour and depth variants)
const FIELD_GLSL = /* glsl */`
uniform highp sampler3D uNoise;
uniform vec2 uR;            // base radii (m): across, through
uniform float uH, uV0, uAcc, uPuffF, uTurb, uNoiseK, uSharp, uSeed, uBend, uLift;
// returns (density 0..1, temperature K)
vec2 fxFlameField(vec3 p, float tnow) {
  float H = uH;
  float yn = p.y / H;
  if (yn < -0.16 || yn > 1.25) return vec2(0.0);
  float yc = max(p.y, 0.0);
  float s = (sqrt(uV0 * uV0 + 2.0 * uAcc * yc) - uV0) / uAcc;     // time of flight to this height
  float w = tnow - s;                                            // the gas here was born at w
  // envelope: wide on the fuel, necking to the tips; the tip bends with the wind (uBend)
  float ynn = clamp(yn, 0.0, 1.0);
  float env = pow(max(1.0 - pow(ynn, 1.5), 0.0), 0.55) * (1.0 + 0.18 * sin(3.1 * ynn)) + 0.08;
  vec2 c = vec2(p.x - uBend * H * yn * yn, p.z);
  vec2 qn = c / (uR * env);
  float rho = length(qn);
  // turbulence in the gas's own coordinates (lateral in units of the base radius, vertical in
  // birth time): structure rides up and stretches
  // (uNoiseK = 1 / (4 lambda): the coarsest octave has ~4 cells per noise tile, lambda ~ D / 2)
  float fine = 1.0 + 0.6 * ynn;                                   // finer licks higher up
  vec3 nq = vec3(c.x * fine, -w * uV0, c.y * fine) * uNoiseK + vec3(uSeed * 0.137, uSeed * 0.291, uSeed * 0.071);
  vec4 n1 = texture(uNoise, nq);
  vec4 n2 = texture(uNoise, nq * 2.31 + vec3(0.37, 0.11, 0.73));
  // (each noise channel has mean ~0.48, sd ~0.155: standardise, so the gains below are in sd)
  vec4 z1 = (n1 - 0.48) / 0.155, z2 = (n2 - 0.48) / 0.155;
  // (billowy Worley cells for the tongues - rounded lobes - value noise for the rips between)
  float turb = 0.6 * z1.g + 0.3 * z2.r + 0.12 * z2.a;
  float A = uTurb * (0.15 + 1.1 * ynn);                          // calm at the fuel, torn into tongues above
  // puffing: the intermittent region pinches into tongues that detach and burn out
  float puff = 0.5 + 0.5 * sin(6.2832 * uPuffF * w + uSeed * 1.7 + z1.b * 0.6);
  float foot = max(0.0, 0.04 - yn) / 0.12;                        // rounded underside wrapping the fuel
  float F = (1.0 - rho) + turb * A
          - smoothstep(0.3, 1.0, yn) * (0.15 + 0.85 * puff) * 0.7
          - smoothstep(0.7, 1.2, yn) * 0.7 - foot * foot * 1.5;
  float dens = smoothstep(0.0, uSharp, F);
  // soot temperature: the continuous flame low down is hottest (its middle clips to yellow-white),
  // the gas cools as it rises (orange tongues, dark red tips); each tongue a little hotter in its
  // middle than at its edge; streaks of hotter / cooler gas
  float Tb = mix(uTCore, uTTip, pow(smoothstep(0.0, 0.95, ynn), 0.65));
  float hT = smoothstep(0.0, 0.3, F);
  float T = uTTip + (Tb - uTTip) * (0.55 + 0.45 * hT) + 110.0 * z2.r + 60.0 * z1.a;
  // cooler gas carries less glowing soot: thin, see-through tips; just above the fuel the gas has
  // no soot yet (dim)
  dens *= (0.3 + 0.7 * smoothstep(1100.0, 1700.0, T)) * mix(0.2, 1.0, smoothstep(0.0, uLift, yn));
  return vec2(dens, T);
}`;

const FRAG = /* glsl */`
precision highp float;
precision highp sampler3D;
${LATE_GLSL}
${BLACKBODY_GLSL}
${FIELD_GLSL}
uniform mat4 uMeshInv;           // world -> box local (unit box -1..1)
uniform mat4 uW2L0, uW2L1;       // world -> flame frame at shutter open / close
uniform float uT0, uT1;          // shutter open / close times (s)
uniform float uKappa, uOn, uSteps, uAlphaK, uDepthThr;
varying vec3 vWorld;
float fxIgn(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
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
  vec3 ro = cameraPosition, rd = normalize(vWorld - cameraPosition);
  // the box in its own unit frame
  vec3 lo = (uMeshInv * vec4(ro, 1.0)).xyz, ld = (uMeshInv * vec4(rd, 0.0)).xyz;
  vec3 inv = 1.0 / mix(vec3(1e-7), ld, step(vec3(1e-7), abs(ld)));
  vec3 ta = (-1.0 - lo) * inv, tb = (1.0 - lo) * inv;
  vec3 tmn = min(ta, tb), tmx = max(ta, tb);
  float t0 = max(max(max(tmn.x, tmn.y), tmn.z), 0.0), t1 = min(min(tmx.x, tmx.y), tmx.z);
  if (t1 <= t0) discard;
  // stop at the opaque scene (the stake, the rider's body)
  vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  float cz = max(dot(rd, fwd), 1e-4);
  float sz = fxSceneZ();
  t1 = min(t1, sz / cz);
  if (t1 <= t0) discard;
  float n = uSteps;
  float dt = (t1 - t0) / n;
  float j = fxIgn(gl_FragCoord.xy + 37.0 * fract(uT0 * 3.7));
  vec3 L = vec3(0.0);
  float Tr = 1.0, zFront = -1.0;
  for (int i = 0; i < 128; i++) {
    if (float(i) >= n || Tr < 0.01) break;
    float tt = t0 + (float(i) + j) * dt;
    vec3 pw = ro + rd * tt;
    float u = fract(j * 7.31 + float(i) * 0.6180339);          // this step's moment inside the shutter
    vec3 p = mix((uW2L0 * vec4(pw, 1.0)).xyz, (uW2L1 * vec4(pw, 1.0)).xyz, u);
    vec2 f = fxFlameField(p, mix(uT0, uT1, u));
    if (f.x <= 0.002) continue;
    float a = 1.0 - exp(-uKappa * f.x * uOn * dt);
    L += Tr * a * fxFlameRad(f.y);
    Tr *= 1.0 - a;
    if (zFront < 0.0 && Tr < 0.7) zFront = tt * cz;
  }
  float alpha = (1.0 - Tr) * uAlphaK;
#ifdef FX_DEPTH_ONLY
  fxWriteDepth(1.0 - Tr, zFront > 0.0 ? zFront : t0 * cz);
#else
  if (alpha <= 0.0005 && dot(L, vec3(1.0)) <= 1e-5) discard;
  gl_FragColor = vec4(L, alpha);
#endif
}`;

// ------------------------------------------------------------------ JS twin of the field --
function noiseSampler(tex) {
  const d = tex.image.data, N = tex.image.width;
  const wrap = (i) => ((i % N) + N) % N;
  return (x, y, z, ch) => {
    const fx = x * N - 0.5, fy = y * N - 0.5, fz = z * N - 0.5;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    const ux = fx - ix, uy = fy - iy, uz = fz - iz;
    let r = 0;
    for (let k = 0; k < 8; k++) {
      const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
      const w = (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
      r += w * d[(wrap(ix + dx) + N * (wrap(iy + dy) + N * wrap(iz + dz))) * 4 + ch];
    }
    return r / 255;
  };
}
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * new FlameVolume(fx, { R: [rx, rz], H, v0, acc, puffF, turb, noiseK, sharp, kappa, lift, bend,
 *   palette, seed, steps, name })
 * pose(m0, m1, ta, tb, on): flame frame (THREE.Matrix4 local -> world, y = axis) at shutter
 *   open / close, the shutter times, and a 0..1 intensity.
 */
export class FlameVolume {
  constructor(fx, o = {}) {
    this.fx = fx;
    this.o = o;
    this.P = flamePalette(o.palette ?? 'burn');
    this.R = o.R ?? [0.3, 0.3];
    this.H = o.H ?? 1.2;
    const D = 2 * Math.max(this.R[0], this.R[1]);
    this.v0 = o.v0 ?? 1.5;
    this.acc = o.acc ?? 3.0;                         // buoyant acceleration of hot gas, ~g (rho_a / rho_g - 1)
    this.puffF = o.puffF ?? 1.5 / Math.sqrt(Math.max(D, 0.05));   // pool-fire puffing (Cetegen & Ahmed)
    this.kappa = o.kappa ?? 22;                      // 1/m: soot absorption = emission coefficient
    const steps = o.steps ?? Math.round(Math.max(64, 1.5 * (fx.tier.steps ?? 32)));
    const late = makeLateUniforms();
    this.uniforms = {
      ...late, ...flameUniforms(this.P, THREE),
      uNoise: { value: fx.noise },
      uR: { value: new THREE.Vector2(this.R[0], this.R[1]) }, uH: { value: this.H },
      uV0: { value: this.v0 }, uAcc: { value: this.acc }, uPuffF: { value: this.puffF },
      uTurb: { value: o.turb ?? 1.0 }, uNoiseK: { value: o.noiseK ?? 1.0 / (2 * Math.max(0.1, D)) },
      uSharp: { value: o.sharp ?? 0.03 }, uSeed: { value: (o.seed ?? 1) % 97 }, uBend: { value: o.bend ?? 0 }, uLift: { value: o.lift ?? 0.08 },
      uMeshInv: { value: new THREE.Matrix4() }, uW2L0: { value: new THREE.Matrix4() }, uW2L1: { value: new THREE.Matrix4() },
      uT0: { value: 0 }, uT1: { value: 0 }, uKappa: { value: this.kappa }, uOn: { value: 1 }, uSteps: { value: steps },
      uAlphaK: { value: o.alphaK ?? 1 }, uDepthThr: { value: 0.3 },
    };
    const geo = new THREE.BoxGeometry(2, 2, 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false, depthTest: false, side: THREE.BackSide, toneMapped: false, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = o.name || 'fx-flame-volume';
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 11;
    makeLate(this.mesh, this.uniforms);
    // depth twin: haze / DOF see the flame at its own distance
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
    this.noiseAt = noiseSampler(fx.noise);
    this.m0 = new THREE.Matrix4(); this.m1 = new THREE.Matrix4();
    this.visible = false;
  }

  /** Place the flame for this frame. m0 / m1: flame frame -> world at shutter open / close. */
  pose(m0, m1, ta, tb, on = 1) {
    const u = this.uniforms;
    this.m0.copy(m0); this.m1.copy(m1);
    u.uW2L0.value.copy(m0).invert(); u.uW2L1.value.copy(m1).invert();
    u.uT0.value = ta; u.uT1.value = tb; u.uOn.value = on;
    // the box: flame bounds (x +-R*1.5 + bend, y -0.05 .. 1.25 H) in the mid frame, padded by the motion
    const Rx = this.R[0] * 1.6 + Math.abs(this.o.bend ?? 0) * this.H * 1.6, Rz = this.R[1] * 1.6, H = this.H * 1.45;
    const mid = new THREE.Matrix4();
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m0.decompose(p0, q, s); m1.decompose(p1, new THREE.Quaternion(), new THREE.Vector3());
    const move = p1.clone().sub(p0);
    const box = new THREE.Matrix4().compose(new THREE.Vector3(Math.abs(this.o.bend ?? 0) * this.H * 0.5 * Math.sign(this.o.bend ?? 0), H / 2 - 0.17 * this.H, 0), new THREE.Quaternion(), new THREE.Vector3(Rx, H / 2, Rz));
    mid.compose(p0.clone().addScaledVector(move, 0.5), q, s).multiply(box);
    // pad: scale the unit box so it covers the shutter motion (in the flame frame)
    const ml = move.clone().applyQuaternion(q.clone().invert());
    const pad = new THREE.Matrix4().makeScale(1 + Math.abs(ml.x) / (2 * Rx), 1 + Math.abs(ml.y) / H, 1 + Math.abs(ml.z) / (2 * Rz));
    mid.multiply(pad);
    this.mesh.matrix.copy(mid); this.twin.matrix.copy(mid);
    this.mesh.matrixWorld.copy(mid); this.twin.matrixWorld.copy(mid);
    u.uMeshInv.value.copy(mid).invert();
    this.visible = on > 0.002;
    this.mesh.visible = this.twin.visible = this.visible;
  }

  /** JS twin of fxFlameField: [density, T] at flame-frame point p (m) and time t. */
  field(px, py, pz, t) {
    const u = this.uniforms, H = this.H, R = this.R;
    const yn = py / H;
    if (yn < -0.16 || yn > 1.25) return [0, 0];
    const yc = Math.max(py, 0);
    const s = (Math.sqrt(this.v0 * this.v0 + 2 * this.acc * yc) - this.v0) / this.acc;
    const w = t - s;
    const ynn = Math.min(1, Math.max(0, yn));
    const env = Math.pow(Math.max(1 - Math.pow(ynn, 1.5), 0), 0.55) * (1 + 0.18 * Math.sin(3.1 * ynn)) + 0.08;
    const cx = px - u.uBend.value * H * yn * yn, cz = pz;
    const rho = Math.hypot(cx / (R[0] * env), cz / (R[1] * env));
    const k = u.uNoiseK.value, sd = u.uSeed.value, fine = 1 + 0.6 * ynn;
    const nx = cx * fine * k + sd * 0.137, ny = -w * this.v0 * k + sd * 0.291, nz = cz * fine * k + sd * 0.071;
    const N = this.noiseAt;
    const z1g = (N(nx, ny, nz, 1) - 0.48) / 0.155, z1b = (N(nx, ny, nz, 2) - 0.48) / 0.155, z1a = (N(nx, ny, nz, 3) - 0.48) / 0.155;
    const mx = nx * 2.31 + 0.37, my = ny * 2.31 + 0.11, mz = nz * 2.31 + 0.73;
    const z2r = (N(mx, my, mz, 0) - 0.48) / 0.155, z2g = (N(mx, my, mz, 1) - 0.48) / 0.155, z2a = (N(mx, my, mz, 3) - 0.48) / 0.155;
    const turb = 0.6 * z1g + 0.3 * z2r + 0.12 * z2a;
    const A = u.uTurb.value * (0.15 + 1.1 * ynn);
    const puff = 0.5 + 0.5 * Math.sin(6.2832 * this.puffF * w + sd * 1.7 + z1b * 0.6);
    const foot = Math.max(0, 0.04 - yn) / 0.12;
    const F = (1 - rho) + turb * A - ss(0.3, 1.0, yn) * (0.15 + 0.85 * puff) * 0.7 - ss(0.7, 1.2, yn) * 0.7 - foot * foot * 1.5;
    let dens = ss(0, u.uSharp.value, F);
    const Tb = this.P.tCore + (this.P.tTip - this.P.tCore) * Math.pow(ss(0, 0.95, ynn), 0.65);
    const hT = ss(0, 0.3, F);
    const T = this.P.tTip + (Tb - this.P.tTip) * (0.55 + 0.45 * hT) + 110 * z2r + 60 * z1a;
    dens *= (0.3 + 0.7 * ss(1100, 1700, T)) * (0.2 + 0.8 * ss(0, u.uLift.value, yn));
    return [dens, T];
  }

  /**
   * Radiant intensity of the flame (scene units: a PointLight's intensity) and where it comes
   * from: the flame is looked at from two sides (its frame's z and x) through a grid of rays,
   * each marched like the shader (emission + soot absorption), and I = sum over the rays of the
   * radiance they leave with times their area - what a surface beside the flame sees (an
   * optically thick flame shows only its outer layer; a volume integral would count the hidden
   * core too). Returns { I: [r,g,b], at: [x,y,z] (world) }.
   */
  emission(t, m = this.m1) {
    const R = Math.max(this.R[0], this.R[1]) * 1.25, H0 = -0.12 * this.H, H1 = this.H * 1.2;
    const bend = this.o.bend ?? 0;
    const nu = 8, nv = 12, ns = 14;
    const du = 2 * R / nu, dv = (H1 - H0) / nv, ds = 2 * R / ns;
    const I = [0, 0, 0];
    let cx = 0, cy = 0, cz = 0, cw = 0;
    for (let side = 0; side < 2; side++) {
      for (let iv = 0; iv < nv; iv++) for (let iu = 0; iu < nu; iu++) {
        const y = H0 + (iv + 0.5) * dv, u = -R + (iu + 0.5) * du;
        const off = bend * this.H * Math.pow(Math.max(y, 0) / this.H, 2);
        const L = [0, 0, 0];
        let Tr = 1, sx = 0, sw = 0;
        for (let is = 0; is < ns && Tr > 0.02; is++) {
          const sd = -R + (is + 0.5) * ds;
          const px = side === 0 ? u + off : sd + off, pz = side === 0 ? sd : u;
          const [d, T] = this.field(px, y, pz, t);
          if (d < 0.002) continue;
          const a = 1 - Math.exp(-this.kappa * d * ds);
          const B = flameRadiance(T, this.P);
          const w = Tr * a;
          L[0] += w * B[0]; L[1] += w * B[1]; L[2] += w * B[2];
          sx += sd * w; sw += w;
          Tr *= 1 - a;
        }
        const Y = 0.2126 * L[0] + 0.7152 * L[1] + 0.0722 * L[2];
        for (let k = 0; k < 3; k++) I[k] += L[k] * du * dv * 0.5;
        if (Y > 0) {
          const zs = sw > 0 ? sx / sw : 0;
          const px = side === 0 ? u + off : zs + off, pz = side === 0 ? zs : u;
          cx += px * Y; cy += y * Y; cz += pz * Y; cw += Y;
        }
      }
    }
    const p = cw > 0 ? new THREE.Vector3(cx / cw, cy / cw, cz / cw) : new THREE.Vector3(0, this.H * 0.4, 0);
    p.applyMatrix4(m);
    return { I, at: [p.x, p.y, p.z] };
  }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.twin.material.dispose(); }
}
