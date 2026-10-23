// FX library - water: a body hitting the sea (the scout, 1F-25..1F-27), spray, foam, the churn
// round a floating, struggling body, a foam trail, and a dragon's downwash on water (X6-12,
// X8-09: the sea flattened into a pale ring, spray thrown out and climbing the rocks).
//
//   fx.water.splash({ at, t0, size, speed, dir, height })     crown sheet + drops + spray mist +
//                                                              Worthington jet + foam patch
//   fx.water.spray({ at, dir, t0, count, speed })              a burst of spray (waves on rock)
//   fx.water.foam({ at, t0, radius, height, life })            a foam patch that spreads and decays
//   fx.water.trail({ path: (t) => [x, y, z], t0, t1, width, height })   foam along a path
//   fx.water.churn({ at, t0, t1, height })                    small splashes + foam round a struggling body
//   fx.water.downwash({ at, t0, bursts, radius, height })     spray ring + pale flattened ring
//
// `height(x, z, t)` is the water surface (ocean.heightAt); default fx.ground. Drops end where
// they meet the surface; mist and foam ride on it. Surface patches are drawn after the ocean in
// the cinematic stack's late pass (they see it under them), lit by the FX light rig.
import * as THREE from 'three';
import { Effect } from './core/manager.js';
import { ParticleLayer } from './core/particles.js';
import { LIGHT_GLSL } from './core/light.js';
import { LATE_GLSL, makeLateUniforms } from './core/late.js';
import { hash01, arr3, clamp, smoothstep, ballistic, coneDir, norm3, noise1, len3 } from './core/util.js';

const G = [0, -9.81, 0];
const WATER_DROP = [0.55, 0.62, 0.66];     // a drop shows the sky / sea it refracts: pale grey-blue
const SPRAY = [0.86, 0.88, 0.9];           // spray mist / whitewater (many interfaces: white)

const heightFn = (fx, o) => o.height || ((x, z) => fx.ground(x, z));

// ------------------------------------------------------------------ surface patch --
const PATCH_VERT = /* glsl */`
attribute vec2 aP;       // patch coords (disc / ring: metres from the centre; trail: across (m), age (s))
varying vec2 vP; varying vec3 vW; varying float vVZ;
void main() { vP = aP; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 v = viewMatrix * w; vVZ = -v.z; gl_Position = projectionMatrix * v; }`;
const PATCH_FRAG = /* glsl */`
precision highp float;
${LIGHT_GLSL}
${LATE_GLSL}
uniform float uKind, uAge, uR, uW, uSeed, uAmount, uLife, uCell;
uniform vec3 uFoamCol;
varying vec2 vP; varying vec3 vW; varying float vVZ;
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.07 + 1.3; a *= 0.5; } return s / 0.94; }
// bubbles: distance to the nearest cell centre (round foam cells with lacy borders)
float bubbles(vec2 p) {
  vec2 i = floor(p), f = fract(p); float d = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = h22(i + g); d = min(d, length(g + o - f)); }
  return d;
}
void main() {
  // on the water: no depth test against the wave surface (heightAt has no choppy correction),
  // only against the solid scene (late pass copy)
  if (fxSceneZ() < vVZ - 0.05) discard;
  float amt = 0.0;          // foam amount 0..1 at this point
  float tint = 0.0;         // pale roughened water (downwash ring), no foam
  vec2 wp = vW.xz;
  float n = fbm(wp / (uCell * 6.0) + uSeed);
  if (uKind < 0.5) {
    // foam disc: thick white at first, spreading, breaking into a lace of bubbles as it decays
    float r = length(vP) / max(uR, 1e-3);
    float decay = clamp(uAge / uLife, 0.0, 1.0);
    amt = smoothstep(1.0, 0.55, r + (n - 0.5) * 0.6) * (1.0 - decay * 0.85) * uAmount;
  } else if (uKind < 1.5) {
    // downwash ring: the band the wall jet is crossing now (roughened, pale), radial streaks
    float r = length(vP);
    float band = smoothstep(uR - uW, uR - uW * 0.3, r) * (1.0 - smoothstep(uR, uR + uW * 0.5, r));
    float inner = smoothstep(uR - uW * 3.0, uR - uW, r) * 0.45;
    float ang = atan(vP.y, vP.x);
    float streak = vn(vec2(ang * 40.0, r / (uW * 2.0)) + uSeed) * 0.6 + n * 0.6;
    tint = max(band, inner * (1.0 - band)) * streak * uAmount;
    amt = band * smoothstep(0.6, 0.95, streak) * 0.3 * uAmount;
  } else {
    // trail: vP.x across (m), vP.y age of the water here (s since the source passed)
    float a = vP.y;
    if (a < 0.0) discard;
    float w = uW * (0.5 + 0.5 * min(1.0, a / 3.0)) * (1.0 + 0.15 * a);
    float across = abs(vP.x) / max(w, 1e-3);
    amt = smoothstep(1.0, 0.4, across + (n - 0.5) * 0.7) * exp(-a / uLife) * uAmount;
  }
  // foam texture: marbled filaments (domain-warped noise ridges) over fine bubbles - sea foam
  // tears into streaks and lace, not into round spots
  vec2 q = wp / (uCell * 4.0) + uSeed;
  vec2 wq = vec2(fbm(q * 0.7 + 3.1), fbm(q * 0.7 + 7.7)) - 0.5;
  float mar = fbm(q + wq * 2.2);
  float ridge = 1.0 - clamp(abs(mar - 0.5) * 7.0, 0.0, 1.0);   // filaments where the warped field crosses 0.5
  float b2 = bubbles(wp / (uCell * 0.3) + uSeed * 1.7);
  float lace = clamp(smoothstep(0.2, 0.85, ridge) * 0.8 + smoothstep(0.55, 0.75, mar) * 0.25 + smoothstep(0.3, 0.6, b2) * 0.12, 0.0, 1.0);
  // fresh, thick foam covers almost everything; thinner foam survives only along the filaments
  float cover = smoothstep(0.5 - 0.38 * amt, 0.78 - 0.28 * amt, lace) * smoothstep(0.02, 0.25, amt);
  float a = max(cover, tint * 0.35);
  if (a <= 0.003) discard;
  // lit: foam is a rough white scatterer; sun (no shadow lookup here) + sky
  vec3 N = vec3(0.0, 1.0, 0.0);
  float sunL = max(dot(N, uSunDir), 0.0) * 0.7 + 0.3;      // foam is lumpy: faces turned to the sun
  vec3 light = uSunCol * sunL / 3.14159 + uSkyCol * 1.2;
  vec3 col = mix(uFoamCol * 0.92, uFoamCol, lace) * light * cover + vec3(0.75, 0.82, 0.88) * light * tint * 0.35 * (1.0 - cover);
  gl_FragColor = vec4(col, a);
}`;

/** A mesh that lies on the water and is re-draped every frame (disc, ring or trail ribbon). */
class SurfacePatch extends Effect {
  constructor(fx, o = {}) {
    super(fx, { name: `fx-water-${o.kind || 'foam'}`, ...o });
    this.height = heightFn(fx, o);
    this.kind = o.kind || 'foam';
    const res = o.res ?? 40;
    if (this.kind === 'trail') {
      // ribbon along the path: rows at fixed path times
      const n = o.samples ?? 160;
      this.ts = []; for (let i = 0; i <= n; i++) this.ts.push(o.t0 + (o.t1 - o.t0) * i / n);
      this.pts = this.ts.map((t) => fx.at(o.path, t));
      const P = new Float32Array((n + 1) * 2 * 3), A = new Float32Array((n + 1) * 2 * 2), I = [];
      for (let i = 0; i < n; i++) { const a = i * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setAttribute('aP', new THREE.BufferAttribute(A, 2));
      geo.setIndex(I);
      this.geo = geo;
    } else {
      const geo = new THREE.PlaneGeometry(2, 2, res, res);
      geo.rotateX(-Math.PI / 2);
      geo.setAttribute('aP', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      this.base = geo.attributes.position.array.slice();
      this.geo = geo;
    }
    const late = makeLateUniforms();
    const onLate = !!fx.ctx.cinematic && o.late !== false;
    const u = {
      ...fx.light.uniforms, ...late,
      uKind: { value: { foam: 0, ring: 1, trail: 2 }[this.kind] }, uAge: { value: 0 }, uR: { value: 1 }, uW: { value: o.width ?? 1 },
      uSeed: { value: (o.seed ?? 1) * 1.37 }, uAmount: { value: o.amount ?? 1 }, uLife: { value: o.life ?? 20 }, uCell: { value: o.cell ?? 0.35 },
      uFoamCol: { value: new THREE.Vector3(...(o.color || [0.9, 0.92, 0.93])) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: PATCH_VERT, fragmentShader: PATCH_FRAG, uniforms: u, transparent: true, depthWrite: false, depthTest: !onLate,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide,
    });
    this.u = u;
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = o.renderOrder ?? 20;
    this.mesh.userData.dkNoVelocity = true;
    if (o.late !== false) { this.mesh.userData.dkLate = true; mat.userData.dkLateUniforms = late; }
    this.object.add(this.mesh);
  }
  radius(a) {
    const o = this.o;
    if (this.kind === 'ring') return o.radiusFn ? o.radiusFn(a) : (o.radius ?? 20) * (1 - Math.exp(-a / (o.tau ?? 0.8)));
    return (o.radius ?? 3) * (0.35 + 0.65 * (1 - Math.exp(-a / (o.spread ?? 1.5)))) * (1 + 0.02 * a);
  }
  update(t) {
    const a = t - this.t0;
    const life = this.o.life ?? 20;
    const vis = this.enabled && a >= 0 && (this.kind === 'trail' ? a < (this.o.t1 - this.o.t0) + life * 3 : a < life * (this.kind === 'ring' ? 1 : 1.2));
    this.mesh.visible = vis;
    if (!vis) return;
    const fx = this.fx, lift = this.o.lift ?? 0.03;
    const pos = this.geo.attributes.position.array, ap = this.geo.attributes.aP.array;
    if (this.kind === 'trail') {
      const W = (this.o.width ?? 2) * 2.2;
      for (let i = 0; i < this.pts.length; i++) {
        const p = this.pts[i], q = this.pts[Math.min(this.pts.length - 1, i + 1)], r = this.pts[Math.max(0, i - 1)];
        let dx = q[0] - r[0], dz = q[2] - r[2]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const age = t - this.ts[i];
        for (let s = 0; s < 2; s++) {
          const side = s ? 1 : -1;
          const x = p[0] - dz * side * W, z = p[2] + dx * side * W;
          const k = (i * 2 + s) * 3;
          pos[k] = x; pos[k + 1] = this.height(x, z, t) + lift; pos[k + 2] = z;
          ap[(i * 2 + s) * 2] = side * W; ap[(i * 2 + s) * 2 + 1] = age;
        }
      }
      this.u.uW.value = this.o.width ?? 2;
    } else {
      const c = fx.at(this.o.at, this.kind === 'ring' ? t : this.t0);
      const R = this.kind === 'ring' ? this.radius(a) + (this.o.width ?? 2) * 2 : this.radius(a) * 1.25;
      const b = this.base;
      for (let i = 0; i < pos.length; i += 3) {
        const lx = b[i] * R, lz = b[i + 2] * R;
        pos[i] = c[0] + lx; pos[i + 2] = c[2] + lz;
        pos[i + 1] = this.height(pos[i], pos[i + 2], t) + lift;
        ap[(i / 3) * 2] = lx; ap[(i / 3) * 2 + 1] = lz;
      }
      this.u.uR.value = this.kind === 'ring' ? this.radius(a) : this.radius(a);
      this.u.uAmount.value = (this.o.amount ?? 1) * (this.kind === 'ring' ? (1 - smoothstep(life * 0.5, life, a)) * smoothstep(0, 0.2, a) : smoothstep(0, 0.15, a));
    }
    this.u.uAge.value = a;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aP.needsUpdate = true;
    this.geo.computeBoundingSphere();
  }
}

// ------------------------------------------------------------------ spray / splash --
/**
 * Water particles: drops (glossy streaks) + mist (white scattering puffs). Every particle has a
 * launch (te, p0, v0, drag) and dies where its path meets the surface. Built by the presets.
 */
class WaterBurst extends Effect {
  constructor(fx, o, gen) {
    super(fx, { name: o.name || 'fx-water-burst', ...o });
    this.height = heightFn(fx, o);
    this.wind = arr3(o.wind ?? fx.wind);
    const { drops, mist, clumps } = gen(this);
    this.D = drops; this.M = mist;
    this.drops = this.layer(new ParticleLayer(fx, { max: Math.max(1, drops.length), mode: 'drop', name: 'fx-water-drops', soft: 0.05, stretchMax: 300, shading: { albedo: [1, 1, 1], gloss: 200 } }));
    this.C = clumps || [];
    this.clumps = this.C.length ? this.layer(new ParticleLayer(fx, {
      max: this.C.length, mode: 'puff', name: 'fx-water-sheet', soft: 0.15, conserve: false, stretchMax: 6,
      shading: { albedo: SPRAY, ms: 0.85, sigma: 5, g: 0.6, noiseScale: 2.0, noiseAmt: 1.3, evolve: 1.5, billow: 0.1, edge: 0.75, ambient: 1.0 },
    })) : null;
    this.mist = this.layer(new ParticleLayer(fx, {
      max: Math.max(1, mist.length), mode: 'puff', name: 'fx-water-mist', soft: 0.6,
      shading: { albedo: SPRAY, ms: 0.85, sigma: o.mistSigma ?? 2.0, g: 0.7, noiseScale: 1.3, noiseAmt: 1.3, evolve: 0.5, billow: 0.12, edge: 0.85, ambient: 1.0 },
    }));
  }
  draw(t) {
    const fx = this.fx;
    const [ta, tb] = fx.shutter(t);
    const pa = [0, 0, 0], pb = [0, 0, 0];
    for (const d of this.D) {
      if (tb < d.te) continue;
      const a0 = Math.max(0, ta - d.te), a1 = tb - d.te;
      if (a1 > d.life) continue;
      ballistic(d.p0, d.v0, G, d.k, this.wind, a0, pa);
      ballistic(d.p0, d.v0, G, d.k, this.wind, a1, pb);
      if (a1 > 0.05 && pb[1] < this.height(pb[0], pb[2], t)) continue;
      this.drops.push(pa, pb, d.r, 0, d.alpha ?? 1, d.s, 0, WATER_DROP, 1);
    }
    if (this.clumps) for (const c of this.C) {
      if (tb < c.te) continue;
      const a0 = Math.max(0, ta - c.te), a1 = tb - c.te;
      if (a1 > c.life) continue;
      // a torn sheet / ligament: drawn out along its path (from 0.06 s back to now)
      ballistic(c.p0, c.v0, G, c.k, this.wind, Math.max(0, a1 - 0.06), pa);
      ballistic(c.p0, c.v0, G, c.k, this.wind, a1, pb);
      if (a1 > 0.05 && pb[1] < this.height(pb[0], pb[2], t) - c.r * 0.3) continue;
      // the sheet thins and tears as it rises and falls: smaller, more transparent with age
      const f = a1 / c.life;
      const size = c.r * (1 + 0.5 * f) * (1 - 0.5 * smoothstep(0.4, 1, f));
      const dens = c.dens * smoothstep(0, 0.02, a1) * Math.pow(1 - f, 2);
      if (dens < 0.004) continue;
      this.clumps.push(pa, pb, size, c.s * 6.28, dens, c.s, f, [1, 1, 1]);
    }
    for (const m of this.M) {
      if (tb < m.te) continue;
      const a1 = tb - m.te;
      if (a1 > m.life) continue;
      const a0 = Math.max(0, ta - m.te);
      const at = (a, out) => {
        ballistic(m.p0, m.v0, [0, -0.6, 0], m.k, this.wind, a, out);
        out[0] += noise1(a * 0.7 + m.s * 30, 3) * 0.3 * a; out[2] += noise1(a * 0.7 + m.s * 40, 4) * 0.3 * a;
      };
      at(a0, pa); at(a1, pb);
      const size = m.r * (0.5 + 1.5 * Math.sqrt(a1 / m.life) + 0.3 * a1);
      const hy = this.height(pb[0], pb[2], t) + size * 0.45;
      if (pb[1] < hy) { pb[1] = hy; if (pa[1] < hy) pa[1] = hy; }
      const dens = m.dens * smoothstep(0, 0.08, a1) * (1 - smoothstep(m.life * 0.35, m.life, a1)) / (1 + 0.8 * a1);
      if (dens < 0.004) continue;
      this.mist.push(pa, pb, size, m.s * 6.28, dens, m.s, a1 / m.life, [1, 1, 1]);
    }
  }
}

/** The scout hitting the sea: crown sheet, drops, mist, the jet, foam. */
function splashGen(fx, o) {
  return (self) => {
    const S = o.size ?? 4, U = o.speed ?? 25, seed = o.seed ?? 1;
    const t0 = o.t0 ?? 0;
    const P = fx.at(o.at, t0);
    P[1] = self.height(P[0], P[2], t0);
    const D = norm3(arr3(o.dir ?? [0, -1, 0]));
    const fwd = norm3([D[0], 0, D[2]]), horiz = Math.hypot(D[0], D[2]);
    const drops = [], mist = [];
    const nC = Math.round((o.drops ?? 1400) * fx.tier.particles);
    for (let i = 0; i < nC; i++) {
      const h = (k) => hash01(seed * 7121, i, k);
      const th = h(0) * 6.283;
      const rad = [Math.cos(th), 0, Math.sin(th)];
      const along = rad[0] * fwd[0] + rad[2] * fwd[2];
      const bias = 1 + 1.2 * horiz * Math.max(0, along);                 // oblique impact: more forward
      const r0 = S * (0.3 + 0.25 * h(1));
      const te = t0 + 0.02 + 0.25 * h(2) * h(2);
      // crown: steep outward + up; the later, the slower (the sheet thins and drops break away)
      const up = U * (0.25 + 0.4 * h(3)) * (1 - 0.6 * (te - t0) / 0.27);
      const out = U * (0.08 + 0.22 * h(4)) * bias;
      const r = 0.004 + 0.022 * Math.pow(h(5), 2.5) * Math.sqrt(S / 4);
      drops.push({ te, p0: [P[0] + rad[0] * r0, P[1], P[2] + rad[2] * r0], v0: [rad[0] * out + fwd[0] * U * 0.15 * horiz, up, rad[2] * out + fwd[2] * U * 0.15 * horiz], k: 0.15 + 0.004 / r, r, s: h(6), life: 6 });
    }
    // crown sheet: whitewater clumps riding the same crown velocities (the sheet you see)
    const clumps = [];
    const nS = Math.round((o.sheet ?? 1600) * Math.sqrt(fx.tier.particles));
    for (let i = 0; i < nS; i++) {
      const h = (k) => hash01(seed * 4441, i, k);
      const th = h(0) * 6.283, rad = [Math.cos(th), 0, Math.sin(th)];
      const along = rad[0] * fwd[0] + rad[2] * fwd[2];
      const bias = 1 + 1.2 * horiz * Math.max(0, along);
      const te = t0 + 0.01 + 0.3 * h(1) * h(1);
      const lag = (te - t0) / 0.31;
      const up = U * (0.2 + 0.45 * h(2)) * (1 - 0.55 * lag);
      const out = U * (0.06 + 0.2 * h(3)) * bias;
      const r0 = S * (0.3 + 0.2 * h(4));
      clumps.push({ te, p0: [P[0] + rad[0] * r0, P[1] + 0.1, P[2] + rad[2] * r0], v0: [rad[0] * out + fwd[0] * U * 0.12 * horiz, up, rad[2] * out + fwd[2] * U * 0.12 * horiz], k: 0.6 + 0.8 * h(5), r: S * (0.015 + 0.03 * h(6)), dens: 0.5, s: h(7), life: 1.2 + 1.6 * h(8) });
    }
    // Worthington jet: a column from the collapsing cavity
    const nJ = Math.round(260 * fx.tier.particles);
    for (let i = 0; i < nJ; i++) {
      const h = (k) => hash01(seed * 3301, i, k);
      const te = t0 + 0.35 + 0.35 * h(0);
      const d = coneDir([0, 1, 0], 0.18, h(1), h(2));
      const sp = Math.sqrt(2 * 9.81 * S * (1.2 + 1.2 * h(3)));
      const r = 0.006 + 0.03 * Math.pow(h(4), 2);
      drops.push({ te, p0: [P[0] + (h(5) - 0.5) * S * 0.2, P[1], P[2] + (h(6) - 0.5) * S * 0.2], v0: [d[0] * sp, d[1] * sp, d[2] * sp], k: 0.1 + 0.003 / r, r, s: h(7), life: 6 });
    }
    // mist: the sheet's fine spray, thrown out with the crown and hanging after it
    const nM = Math.round((o.mist ?? 240) * Math.sqrt(fx.tier.particles));
    for (let i = 0; i < nM; i++) {
      const h = (k) => hash01(seed * 919, i, k);
      const th = h(0) * 6.283, rad = [Math.cos(th), 0, Math.sin(th)];
      const along = rad[0] * fwd[0] + rad[2] * fwd[2];
      const te = t0 + 0.03 + 0.4 * h(1);
      const sp = U * (0.1 + 0.3 * h(2)) * (1 + horiz * Math.max(0, along));
      const r0 = S * (0.3 + 0.5 * h(3));
      mist.push({ te, p0: [P[0] + rad[0] * r0, P[1] + S * 0.1, P[2] + rad[2] * r0], v0: [rad[0] * sp * 0.6, sp * (0.4 + 0.8 * h(4)), rad[2] * sp * 0.6], k: 2.5 + 2 * h(5), r: S * (0.12 + 0.18 * h(6)), dens: 0.28, s: h(7), life: 3 + 4 * h(8) });
    }
    return { drops, mist, clumps };
  };
}

function sprayGen(fx, o) {
  return (self) => {
    const seed = o.seed ?? 1, t0 = o.t0 ?? 0;
    const dir = norm3(arr3(o.dir ?? [0, 1, 0]));
    const drops = [], mist = [];
    const n = Math.round((o.count ?? 300) * fx.tier.particles);
    const dur = o.duration ?? 0.2;
    for (let i = 0; i < n; i++) {
      const h = (k) => hash01(seed * 5501, i, k);
      const te = t0 + dur * h(0);
      const P = fx.at(o.at, te);
      const d = coneDir(dir, o.spread ?? 0.5, h(1), h(2));
      const sp = (o.speed ?? 8) * (0.4 + 0.8 * h(3));
      const r = 0.002 + 0.012 * Math.pow(h(4), 2.5);
      drops.push({ te, p0: [P[0] + (h(5) - 0.5) * (o.radius ?? 0.5), P[1], P[2] + (h(6) - 0.5) * (o.radius ?? 0.5)], v0: [d[0] * sp, d[1] * sp, d[2] * sp], k: 0.2 + 0.004 / r, r, s: h(7), life: 4 });
    }
    const nm = Math.round((o.mistCount ?? 60) * Math.sqrt(fx.tier.particles));
    for (let i = 0; i < nm; i++) {
      const h = (k) => hash01(seed * 6607, i, k);
      const te = t0 + dur * h(0);
      const P = fx.at(o.at, te);
      const d = coneDir(dir, (o.spread ?? 0.5) * 1.2, h(1), h(2));
      const sp = (o.speed ?? 8) * (0.2 + 0.6 * h(3));
      mist.push({ te, p0: P.slice(), v0: [d[0] * sp, d[1] * sp, d[2] * sp], k: 2 + 2 * h(4), r: (o.mistSize ?? 0.4) * (0.6 + 0.8 * h(5)), dens: o.mistDensity ?? 0.7, s: h(6), life: 2 + 2.5 * h(7) });
    }
    return { drops, mist };
  };
}

/** Small splashes round a struggling floating body (te on a fixed schedule). */
function churnGen(fx, o) {
  return (self) => {
    const seed = o.seed ?? 1, t0 = o.t0 ?? 0, t1 = o.t1 ?? t0 + 10;
    const rate = (o.rate ?? 4);
    const drops = [], mist = [];
    const nEv = Math.ceil((t1 - t0) * rate);
    for (let e = 0; e < nEv; e++) {
      const he = (k) => hash01(seed * 2203, e, k);
      const te0 = t0 + (e + he(0)) / rate;
      const P = fx.at(o.at, te0);
      const ang = he(1) * 6.283, rr = (o.radius ?? 2) * Math.sqrt(he(2));
      const c = [P[0] + Math.cos(ang) * rr, self.height(P[0], P[2], te0), P[2] + Math.sin(ang) * rr];
      const power = (o.strength ?? 1) * (0.4 + 0.8 * he(3));
      const nd = Math.round(30 * power * fx.tier.particles) + 2;
      for (let i = 0; i < nd; i++) {
        const h = (k) => hash01(seed * 31 + e, i, k);
        const d = coneDir([0, 1, 0], 0.7, h(0), h(1));
        const sp = 2.5 * power * (0.4 + 0.8 * h(2));
        const r = 0.003 + 0.01 * Math.pow(h(3), 2);
        drops.push({ te: te0 + 0.05 * h(4), p0: c, v0: [d[0] * sp, d[1] * sp, d[2] * sp], k: 0.3, r, s: h(5), life: 2 });
      }
      mist.push({ te: te0, p0: c, v0: [0, 1.2 * power, 0], k: 3, r: 0.35 * power, dens: 0.25, s: he(4), life: 1.8 });
    }
    return { drops, mist };
  };
}

/** Downwash on water: spray thrown radially out low over the surface by each downstroke. */
function downwashGen(fx, o) {
  return (self) => {
    const seed = o.seed ?? 1, R = o.radius ?? 25;
    const drops = [], mist = [];
    const bursts = o.bursts || [0];
    bursts.forEach((bt, b) => {
      const t0 = (o.t0 ?? 0) + bt;
      const C = fx.at(o.at, t0);
      const nm = Math.round((o.mist ?? 220) * Math.sqrt(fx.tier.particles));
      for (let i = 0; i < nm; i++) {
        const h = (k) => hash01(seed * 401 + b, i, k);
        const th = h(0) * 6.283, rad = [Math.cos(th), 0, Math.sin(th)];
        const r0 = R * (0.15 + 0.35 * h(1));
        const te = t0 + 0.6 * h(2) * (r0 / R);
        const p0 = [C[0] + rad[0] * r0, self.height(C[0] + rad[0] * r0, C[2] + rad[2] * r0, te) + 0.3, C[2] + rad[2] * r0];
        const sp = 9 * Math.sqrt(R / 25) * (0.5 + 0.8 * h(3));
        mist.push({ te, p0, v0: [rad[0] * sp, 0.8 + 2.0 * h(4), rad[2] * sp], k: 0.9 + 0.8 * h(5), r: R * (0.05 + 0.07 * h(6)), dens: 0.05, s: h(7), life: 2.5 + 3 * h(8) });
      }
      const nd = Math.round((o.drops ?? 500) * fx.tier.particles);
      for (let i = 0; i < nd; i++) {
        const h = (k) => hash01(seed * 503 + b, i, k);
        const th = h(0) * 6.283, rad = [Math.cos(th), 0, Math.sin(th)];
        const r0 = R * (0.2 + 0.5 * h(1));
        const te = t0 + 0.8 * h(2) * (r0 / R);
        const p0 = [C[0] + rad[0] * r0, self.height(C[0] + rad[0] * r0, C[2] + rad[2] * r0, te), C[2] + rad[2] * r0];
        const sp = 6 * (0.5 + 0.8 * h(3));
        const r = 0.002 + 0.008 * Math.pow(h(4), 2);
        drops.push({ te, p0, v0: [rad[0] * sp, 1 + 3 * h(5), rad[2] * sp], k: 0.5 + 0.004 / r, r, s: h(6), life: 3 });
      }
    });
    return { drops, mist };
  };
}

export function waterApi(fx) {
  const burst = (o, gen) => fx.add(new WaterBurst(fx, o, gen));
  const patch = (o) => fx.add(new SurfacePatch(fx, o));
  return {
    splash: (o = {}) => {
      const S = o.size ?? 4;
      const b = burst({ name: 'fx-water-splash', ...o }, splashGen(fx, o));
      if (o.foam !== false) patch({ kind: 'foam', at: o.at, t0: (o.t0 ?? 0) + 0.05, radius: S * 2.6, spread: 1.2, life: o.foamLife ?? 25, height: o.height, seed: (o.seed ?? 1) + 3, cell: 0.25 * Math.sqrt(S / 4) });
      return b;
    },
    spray: (o = {}) => burst({ name: 'fx-water-spray', ...o }, sprayGen(fx, o)),
    foam: (o = {}) => patch({ kind: 'foam', ...o }),
    trail: (o = {}) => patch({ kind: 'trail', ...o }),
    churn: (o = {}) => {
      const b = burst({ name: 'fx-water-churn', ...o }, churnGen(fx, o));
      if (o.foam !== false) patch({ kind: 'foam', at: o.at, t0: o.t0 ?? 0, radius: (o.radius ?? 2) * 1.6, spread: 0.5, life: (o.t1 ?? 10) - (o.t0 ?? 0) + 10, height: o.height, amount: 0.7, seed: (o.seed ?? 1) + 5, cell: 0.2 });
      return b;
    },
    downwash: (o = {}) => {
      const b = burst({ name: 'fx-water-downwash', mistSigma: 0.45, ...o }, downwashGen(fx, o));
      for (const [k, bt] of (o.bursts || [0]).entries()) patch({ kind: 'ring', at: o.at, t0: (o.t0 ?? 0) + bt, radius: o.radius ?? 25, width: (o.radius ?? 25) * 0.12, tau: 0.9, life: o.ringLife ?? 4, height: o.height, seed: (o.seed ?? 1) + k, amount: o.amount ?? 1, res: 64, cell: 0.4 });
      return b;
    },
  };
}
