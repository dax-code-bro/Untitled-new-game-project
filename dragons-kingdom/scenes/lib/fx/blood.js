// FX library - blood, treated the way a film's make-up and practical-effects crew would:
//
//   fx.blood.spray({ at, dir, t0, speed, count, spread, size, duration, mist, hit })
//       a burst / jet of drops (a bite, a wing tearing free, a blow) - ballistic with drag toward
//       the moving air (a slipstream carries a fine spray back along a dragon's neck), drawn as
//       motion-blurred liquid streaks; the finest fraction as a red mist; drops that reach the
//       ground (or `hit` planes: walls) leave their stamps there at the moment they land.
//   fx.blood.drip({ at, t0, rate, duration, size })       drops forming and falling, a splash and
//       a growing spatter where they land
//   fx.blood.pool({ at, t0, radius, tau, joints, target }) a spreading pool (fingers along the
//       paving joints), drying from the edge
//   fx.blood.coat / splat / spatter / runs / smear / soak ({ target, at, dir, size, ... })
//       stains on skin, scales, cloth, stone and timber (see core/decal.js), wet -> tacky -> dry
//   fx.blood.water({ at, t0, radius, height })          a red cloud spreading in sea water
//   fx.blood.tint(conc)  colour of water with blood in it (bowls, buckets, runoff): { color, absorb }
//
// Colours are measured-blood values (linear): fresh blood reflects ~25-35% of deep red light and a
// few % of green/blue; films tint what is under them (core/decal.js 'absorb' pass); drying turns it
// brown-black and matte, edges first.
import * as THREE from 'three';
import { Effect } from './core/manager.js';
import { ParticleLayer } from './core/particles.js';
import { DecalEffect, MAX_STAMPS } from './core/decal.js';
import { hash01, arr3, clamp, smoothstep, ballistic, coneDir, norm3, dot3, len3, gauss } from './core/util.js';

export const BLOOD_COLOR = [0.115, 0.0065, 0.0065];     // fresh, optically thick (linear)

const G = [0, -9.81, 0];
// linear drag rate (1/s) for a drop of radius r (m) moving fast through air (quadratic drag at
// ~10-20 m/s, linearised): mist slows in a few cm, 2 mm drops fly on
const dragK = (r) => clamp(0.00042 / Math.max(r, 2e-5), 0.12, 40);

/** First time in (0, tMax] the path crosses the plane (point P, normal n toward the drop's side). */
function hitPlane(p0, v0, k, w, P, n, tMax) {
  const p = [0, 0, 0];
  const side = (tt) => { ballistic(p0, v0, G, k, w, tt, p); return (p[0] - P[0]) * n[0] + (p[1] - P[1]) * n[1] + (p[2] - P[2]) * n[2]; };
  if (side(0) <= 0) return Infinity;
  let a = 0, b = 0, dt = 0.01;
  for (let t = dt; t <= tMax; t += dt) { if (side(t) <= 0) { b = t; break; } a = t; dt = Math.min(0.1, dt * 1.2); }
  if (!b) return Infinity;
  for (let i = 0; i < 24; i++) { const m = 0.5 * (a + b); if (side(m) > 0) a = m; else b = m; }
  return 0.5 * (a + b);
}

// ------------------------------------------------------------------ spray --
export class BloodSpray extends Effect {
  constructor(fx, o = {}) {
    super(fx, { name: 'fx-blood-spray', ...o });
    const tier = fx.tier;
    this.n = Math.max(12, Math.round((o.count ?? 420) * tier.particles));
    this.nMist = o.mist === 0 ? 0 : Math.max(8, Math.round((o.mistCount ?? 90) * Math.sqrt(tier.particles)));
    this.dir = norm3(arr3(o.dir ?? [0, 1, 0]));
    this.speed = o.speed ?? 9;
    this.spread = o.spread ?? 0.45;
    this.size = o.size ?? 0.002;           // mean drop radius (m)
    this.duration = o.duration ?? 0.12;    // emission window (s)
    this.wind = arr3(o.wind ?? o.air ?? fx.wind);
    this.life = o.life ?? 3.0;
    this.col = o.color || BLOOD_COLOR;
    this.drops = this.layer(new ParticleLayer(fx, {
      max: this.n, mode: 'drop', name: 'fx-blood-drops', soft: 0.02, stretchMax: 600,
      shading: { albedo: [1, 1, 1], gloss: 160 },
    }));
    this.mist = this.nMist ? this.layer(new ParticleLayer(fx, {
      max: this.nMist, mode: 'puff', name: 'fx-blood-mist', soft: 0.05,
      shading: { albedo: [0.32, 0.03, 0.025], sigma: o.mistSigma ?? 6, g: 0.4, noiseScale: 1.4, noiseAmt: 1.2, evolve: 0.5, billow: 0.2, edge: 0.8, ambient: 1.0 },
    })) : null;
    this.prepare(o);
  }

  /** Emission point + source velocity at time te (the source may be moving: at as a function). */
  source(te) {
    const fx = this.fx;
    const p = fx.at(this.o.at, te);
    const a = fx.at(this.o.at, te - 0.01), b = fx.at(this.o.at, te + 0.01);
    return { p, v: [(b[0] - a[0]) / 0.02, (b[1] - a[1]) / 0.02, (b[2] - a[2]) / 0.02] };
  }

  /** Per drop: emission time, start, velocity, drag, radius; landing time on ground / hit planes. */
  prepare(o) {
    const fx = this.fx, n = this.n;
    this.D = [];
    const hits = [];
    const planes = (o.hit || []).map((h) => ({ P: arr3(h.point), n: norm3(arr3(h.normal)), target: h.target }));
    const useGround = o.ground !== false;
    const d = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const h = (k) => hash01(this.seed * 7919, i, k);
      // most of a burst leaves in the first third of the window
      const te = this.t0 + this.duration * Math.pow(h(0), 1.8);
      const S = this.source(te);
      coneDir(this.dir, this.spread * (0.3 + 0.7 * Math.sqrt(h(1))), h(2), h(3), d);
      // log-normal sizes: many small, a few big
      const r = this.size * Math.exp(gauss(this.seed, i, 11) * 0.65) * 0.8;
      const sp = this.speed * (0.35 + 0.9 * h(4)) * (r > this.size ? 0.85 : 1.1);
      const v0 = [S.v[0] + d[0] * sp, S.v[1] + d[1] * sp, S.v[2] + d[2] * sp];
      const k = dragK(r);
      const rec = { te, p0: S.p, v0, k, r, tLand: Infinity, landP: null, plane: -1 };
      // where it lands first: the ground or a hit plane
      if (useGround) {
        const gy = fx.ground(S.p[0], S.p[2]);
        const tg = hitPlane(S.p, v0, k, this.wind, [0, gy, 0], [0, 1, 0], this.life);
        if (tg < rec.tLand) { rec.tLand = tg; rec.plane = -1; }
      }
      planes.forEach((pl, j) => {
        const tp = hitPlane(S.p, v0, k, this.wind, pl.P, pl.n, this.life);
        if (tp < rec.tLand) { rec.tLand = tp; rec.plane = j; }
      });
      if (Number.isFinite(rec.tLand)) {
        const p = [0, 0, 0], v = [0, 0, 0];
        ballistic(S.p, v0, G, k, this.wind, rec.tLand, p, v);
        rec.landP = p; rec.landV = v;
        hits.push(rec);
      }
      this.D.push(rec);
    }
    // stamps decals where drops landed (one per receiving surface, biggest drops first)
    this.decals = [];
    if (o.stains !== false) {
      const groups = new Map();
      for (const r of hits) { if (!groups.has(r.plane)) groups.set(r.plane, []); groups.get(r.plane).push(r); }
      for (const [pi, list] of groups) {
        list.sort((a, b) => b.r - a.r);
        const use = list.slice(0, MAX_STAMPS);
        if (use.length < 2) continue;
        const nrm = pi < 0 ? [0, 1, 0] : planes[pi].n;
        let c = [0, 0, 0];
        for (const r of use) for (let k = 0; k < 3; k++) c[k] += r.landP[k] / use.length;
        let ext = 0;
        for (const r of use) ext = Math.max(ext, Math.hypot(r.landP[0] - c[0], r.landP[1] - c[1], r.landP[2] - c[2]) + r.r * 12);
        const size = Math.max(0.05, ext * 2.1);
        const pl = pi < 0 ? null : planes[pi];
        const tgt = pl ? (pl.target ?? null) : (o.groundTarget ?? null);
        const at = tgt || !pl ? c.map((v, k) => v + nrm[k] * 0.05) : c;
        const dec = new DecalEffect(fx, {
          kind: 'stamps', liquid: o.liquid || 'blood', target: tgt, plane: !!pl && !tgt,
          at, dir: nrm.map((v) => -v), up: Math.abs(nrm[1]) > 0.9 ? [0, 0, -1] : [0, 1, 0],
          size: [size, size, 0.4], t0: this.t0, seed: this.seed, dry: o.dry ?? 0,
          stamps: [], maxStamps: use.length, lift: 0.003, res: 8,
        });
        dec.setStamps(use.map((r) => {
          const q = dec.toLocal(r.landP);
          // travel direction along the surface and how stretched the stain is (grazing = long)
          const v = r.landV, vn = Math.abs(dot3(v, nrm)), vl = len3(v) || 1;
          const tx = dot3(v, dec.F.x), ty = dot3(v, dec.F.y);
          const graze = Math.sqrt(Math.max(0, 1 - (vn / vl) ** 2));
          return { x: q[0], y: q[1], r: r.r * (2.0 + 2.2 * Math.min(1, vl / 8)), t: r.te + r.tLand - this.t0, dir: [tx, ty], el: 0.15 + 2.5 * graze * graze, seed: hash01(r.te * 1000, r.r * 1e6) * 100 };
        }));
        fx.add(dec);
        this.decals.push(dec);
      }
    }
  }

  draw(t) {
    const fx = this.fx;
    if (t < this.t0) return;
    const [ta, tb] = fx.shutter(t);
    const pa = [0, 0, 0], pb = [0, 0, 0];
    const L = this.drops;
    for (let i = 0; i < this.n; i++) {
      const r = this.D[i];
      if (tb < r.te) continue;
      const aa = Math.max(0, ta - r.te), ab = Math.min(tb - r.te, r.tLand);
      if (aa >= r.tLand || aa > this.life) continue;
      ballistic(r.p0, r.v0, G, r.k, this.wind, aa, pa);
      ballistic(r.p0, r.v0, G, r.k, this.wind, Math.max(aa, ab), pb);
      // a drop just leaving is a ligament (stretched), then a sphere
      const h = hash01(this.seed, i, 77);
      const shade = 0.75 + 0.5 * h;
      L.push(pa, pb, r.r, h * 6.28, 1, h, Math.min(1, ab / this.life), [this.col[0] * shade, this.col[1] * shade, this.col[2] * shade], 1);
    }
    if (this.mist) this.drawMist(t, ta, tb);
  }

  drawMist(t, ta, tb) {
    const fx = this.fx, M = this.mist;
    const pa = [0, 0, 0], pb = [0, 0, 0], d = [0, 0, 0];
    for (let i = 0; i < this.nMist; i++) {
      const h = (k) => hash01(this.seed * 131, i, k);
      const te = this.t0 + this.duration * h(0);
      if (tb < te) continue;
      const S = this.source(te);
      coneDir(this.dir, this.spread * 1.3, h(1), h(2), d);
      const sp = this.speed * (0.4 + 0.8 * h(3));
      const v0 = [S.v[0] + d[0] * sp, S.v[1] + d[1] * sp, S.v[2] + d[2] * sp];
      const k = 6 + 6 * h(4);
      const a0 = Math.max(0, ta - te), a1 = Math.max(0, tb - te);
      const life = 0.6 + 0.9 * h(5);
      if (a0 > life) continue;
      ballistic(S.p, v0, [0, -0.3, 0], k, this.wind, a0, pa);
      ballistic(S.p, v0, [0, -0.3, 0], k, this.wind, a1, pb);
      const size = (0.03 + 0.05 * h(6)) * (0.4 + 1.6 * Math.sqrt(a1 / life)) * (this.o.mistScale ?? 1);
      const dens = smoothstep(0, 0.03, a1) * (1 - smoothstep(life * 0.2, life * 0.7, a1)) * (this.o.mistDensity ?? 0.3) / (1 + 12 * a1);
      if (dens <= 0.003) continue;
      M.push(pa, pb, size, h(7) * 6.28, dens, h(8), a1 / life, [1, 1, 1]);
    }
  }
}

// ------------------------------------------------------------------ drip --
/** Drops forming at a point and falling (a wound, a jaw, fingertips); stains where they land. */
export class BloodDrip extends Effect {
  constructor(fx, o = {}) {
    super(fx, { name: 'fx-blood-drip', ...o });
    this.rate = o.rate ?? 3;                 // drops per second
    this.duration = o.duration ?? 6;
    this.size = o.size ?? 0.0022;            // a falling blood drop ~4-5 mm across
    this.nDrops = Math.min(400, Math.ceil(this.rate * this.duration));
    this.wind = arr3(o.wind ?? fx.wind);
    this.layerD = this.layer(new ParticleLayer(fx, { max: this.nDrops + 16, mode: 'drop', name: 'fx-blood-drip', soft: 0.01, shading: { albedo: [1, 1, 1], gloss: 200 } }));
    this.splash = this.layer(new ParticleLayer(fx, { max: this.nDrops * 6 + 16, mode: 'drop', name: 'fx-blood-drip-splash', soft: 0.01, shading: { albedo: [1, 1, 1], gloss: 160 } }));
    // landing stains on the ground
    const D = [];
    for (let i = 0; i < this.nDrops; i++) {
      const h = (k) => hash01(this.seed * 313, i, k);
      const te = this.t0 + (i + 0.6 * h(0)) / this.rate;
      const p0 = fx.at(o.at, te);
      const gy = fx.ground(p0[0], p0[2]);
      const r = this.size * (0.75 + 0.5 * h(1));
      const tl = hitPlane(p0, [0, 0, 0], dragK(r) * 0.3, this.wind, [0, gy, 0], [0, 1, 0], 10);
      const lp = [0, 0, 0], lv = [0, 0, 0];
      if (Number.isFinite(tl)) ballistic(p0, [0, 0, 0], G, dragK(r) * 0.3, this.wind, tl, lp, lv);
      D.push({ te, p0, r, tl, lp, lv });
    }
    this.D = D;
    const landed = D.filter((d) => Number.isFinite(d.tl));
    this.stain = null;
    if (landed.length && o.stains !== false) {
      const c = landed[0].lp;
      let ext = 0.08;
      for (const d of landed) ext = Math.max(ext, Math.hypot(d.lp[0] - c[0], d.lp[2] - c[2]) + 0.05);
      const dec = new DecalEffect(fx, { kind: 'stamps', liquid: o.liquid || 'blood', target: o.groundTarget ?? null, at: [c[0], c[1] + 0.05, c[2]], dir: [0, -1, 0], up: [0, 0, -1], size: [ext * 2, ext * 2, 0.3], t0: this.t0, seed: this.seed, dry: o.dry ?? 0, stamps: [], maxStamps: Math.min(MAX_STAMPS, landed.length), res: 6 });
      dec.setStamps(landed.slice(0, MAX_STAMPS).map((d, i) => {
        const q = dec.toLocal(d.lp);
        const h = hash01(this.seed, i, 5);
        // a vertical drop from height H: a round stain, scalloped rim, crown satellites when high
        return { x: q[0], y: q[1], r: d.r * (2.4 + 0.8 * Math.min(1, -d.lv[1] / 6)), t: d.te + d.tl - this.t0, dir: [Math.cos(h * 6.28), Math.sin(h * 6.28)], el: 0.1 + 0.2 * h, seed: h * 100 };
      }));
      fx.add(dec);
      this.stain = dec;
    }
  }
  draw(t) {
    const fx = this.fx;
    const [ta, tb] = fx.shutter(t);
    const pa = [0, 0, 0], pb = [0, 0, 0];
    const col = this.o.color || BLOOD_COLOR;
    for (let i = 0; i < this.nDrops; i++) {
      const d = this.D[i];
      // forming: the drop swells at the source for ~1/rate before it lets go
      const form = 0.8 / this.rate;
      if (tb < d.te - form) continue;
      if (tb < d.te) {
        const g = clamp((tb - (d.te - form)) / form);
        const p = fx.at(this.o.at, tb);
        const rr = d.r * (0.4 + 0.6 * g);
        p[1] -= rr * 0.8;
        this.layerD.push(p, p, rr, 0, 1, 0.5, 0, col, 1);
        continue;
      }
      const aa = Math.max(0, ta - d.te), ab = tb - d.te;
      if (aa < d.tl) {
        ballistic(d.p0, [0, 0, 0], G, dragK(d.r) * 0.3, this.wind, aa, pa);
        ballistic(d.p0, [0, 0, 0], G, dragK(d.r) * 0.3, this.wind, Math.min(ab, d.tl), pb);
        this.layerD.push(pa, pb, d.r, 0, 1, 0.3, 0, col, 1);
      }
      // splash: a few droplets thrown from the impact for ~0.15 s
      const as = ab - d.tl;
      if (Number.isFinite(d.tl) && as > 0 && as < 0.25) {
        const vImp = Math.abs(d.lv[1]);
        const ns = vImp > 2.5 ? 6 : 2;
        for (let k = 0; k < ns; k++) {
          const h = (m) => hash01(this.seed * 17, i * 8 + k, m);
          const ang = 6.283 * h(0), sp = vImp * (0.12 + 0.18 * h(1));
          const v0 = [Math.cos(ang) * sp, sp * (0.6 + 0.6 * h(2)), Math.sin(ang) * sp];
          const s0 = Math.max(0, ta - d.te - d.tl), s1 = as;
          ballistic(d.lp, v0, G, 2, null, s0, pa); ballistic(d.lp, v0, G, 2, null, s1, pb);
          const gy = d.lp[1];
          if (pb[1] < gy) continue;
          this.splash.push(pa, pb, d.r * (0.15 + 0.2 * h(3)), 0, 1, h(4), 0, col, 1);
        }
      }
    }
  }
}

// ------------------------------------------------------------------ water stain --
/**
 * Blood spreading in water (the sea round the scout's torn shoulder, a bucket): a patch that
 * follows the water surface (`height(x, z, t)`, e.g. ocean.heightAt), drawn after the water with a
 * multiply (absorption) + a faint red scatter, clouded by billowing noise and spreading over time.
 */
const WATER_VERT = /* glsl */`
varying vec2 vL; varying vec3 vW;
void main() { vL = position.xz; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const WATER_FRAG = /* glsl */`
precision highp float;
uniform float uR, uAge, uSeed, uDens, uLateTint;
uniform vec3 uSig, uScat;
varying vec2 vL; varying vec3 vW;
float h(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
void main() {
  float r = length(vL) / max(uR, 1e-3);
  if (r > 1.0) discard;
  vec2 q = vL / max(uR, 1e-3) * 3.0 + uSeed;
  // swirling clouds: domain-warped fbm drifting slowly
  vec2 wq = vec2(fbm(q + uAge * 0.03), fbm(q + 5.2 - uAge * 0.025)) - 0.5;
  float c = fbm(q * 1.3 + wq * 2.5);
  float body = smoothstep(1.0, 0.35, r + (c - 0.5) * 0.7);
  float dens = uDens * body * (0.35 + 1.1 * smoothstep(0.35, 0.75, c));
  if (dens <= 0.002) discard;
  vec3 T = exp(-uSig * dens);
  // multiply pass carries the absorption; the red the cloud scatters back is added by the
  // second (additive) mesh: written here as a premultiplied term through the same blend via uLateTint
  gl_FragColor = vec4(uLateTint > 0.5 ? uScat * (1.0 - T.g) : T, 1.0);
}`;

export class BloodInWater extends Effect {
  constructor(fx, o = {}) {
    super(fx, { name: 'fx-blood-water', ...o });
    this.R = o.radius ?? 3;
    this.tau = o.tau ?? 6;
    this.height = o.height || ((x, z) => fx.ground(x, z));
    const res = o.res ?? 24;
    const geo = new THREE.PlaneGeometry(2, 2, res, res);
    geo.rotateX(-Math.PI / 2);
    this.base = geo.attributes.position.array.slice();
    const mk = (tint) => new THREE.ShaderMaterial({
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
      uniforms: {
        uR: { value: 1 }, uAge: { value: 0 }, uSeed: { value: (o.seed ?? 1) * 3.7 }, uDens: { value: o.density ?? 1.2 },
        uSig: { value: new THREE.Vector3(...(o.sigma || [0.25, 2.2, 2.4])) }, uScat: { value: new THREE.Vector3(...(o.scatter || [0.035, 0.002, 0.002])) },
        uLateTint: { value: tint ? 1 : 0 },
      },
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: tint ? THREE.OneFactor : THREE.ZeroFactor, blendDst: tint ? THREE.OneFactor : THREE.SrcColorFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    this.meshes = [mk(false), mk(true)].map((m, i) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.frustumCulled = false; mesh.renderOrder = 30 + i;
      mesh.userData.dkNoVelocity = true;
      // over the ocean: drawn in the late pass after it
      if (o.late !== false) mesh.userData.dkLate = true;
      m.userData.dkLateUniforms = null;
      this.object.add(mesh);
      return mesh;
    });
    this.geo = geo;
  }
  update(t) {
    const a = t - this.t0;
    const vis = a >= 0 && this.enabled;
    for (const m of this.meshes) m.visible = vis;
    if (!vis) return;
    const fx = this.fx;
    const c = fx.at(this.o.at, t);
    const R = this.R * (0.25 + 0.75 * (1 - Math.exp(-a / this.tau)));
    const pos = this.geo.attributes.position.array, b = this.base;
    for (let i = 0; i < pos.length; i += 3) {
      const x = c[0] + b[i] * R, z = c[2] + b[i + 2] * R;
      pos[i] = b[i] * R; pos[i + 2] = b[i + 2] * R;
      pos[i + 1] = this.height(x, z, t) + (this.o.lift ?? 0.02) - c[1];
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeBoundingSphere();
    this.object.position.set(c[0], c[1], c[2]);
    for (const m of this.meshes) {
      const u = m.material.uniforms;
      u.uR.value = R; u.uAge.value = a;
      u.uDens.value = (this.o.density ?? 1.2) * (1 - smoothstep(this.o.fade?.[0] ?? 1e9, this.o.fade?.[1] ?? 1e9, a)) * Math.min(1, a / 0.4);
    }
  }
}

/** Colour of water carrying blood: conc 0 clear .. 1 red (bowls, buckets, runoff, pink water). */
export function bloodTint(conc) {
  const c = clamp(conc);
  // per-metre absorption of diluted blood (a 5 cm bowl at conc 0.1 is pink, at 1 opaque red)
  const absorb = [0.4 + 25 * c, 0.1 + 900 * c, 0.1 + 1000 * c];
  const color = absorb.map((k) => Math.exp(-k * 0.02));
  return { color, absorb, attenuationColor: absorb.map((k) => Math.exp(-k * 0.05)), attenuationDistance: 0.05 };
}

// ------------------------------------------------------------------ api --
export function bloodApi(fx) {
  const decal = (kind, defaults = {}) => (o = {}) => fx.add(new DecalEffect(fx, { liquid: 'blood', ...defaults, ...o, kind }));
  return {
    spray: (o) => fx.add(new BloodSpray(fx, o)),
    drip: (o) => fx.add(new BloodDrip(fx, o)),
    pool: (o = {}) => fx.add(new DecalEffect(fx, {
      liquid: 'bloodDark', dir: [0, -1, 0], up: [0, 0, -1], size: [(o.radius ?? 0.8) * 2, (o.radius ?? 0.8) * 2, 0.6], grow: [o.delay ?? 0, o.tau ?? 25], ...o,
      at: o.at, kind: 'pool',
    })),
    coat: decal('coat'),
    splat: decal('splat'),
    spatter: decal('spatter'),
    stamps: decal('stamps'),
    runs: decal('run'),
    smear: decal('smear'),
    soak: decal('soak', { liquid: 'bloodDark' }),
    decal: (o) => fx.add(new DecalEffect(fx, { liquid: 'blood', ...o })),
    water: (o) => fx.add(new BloodInWater(fx, o)),
    tint: bloodTint,
    COLOR: BLOOD_COLOR,
  };
}
