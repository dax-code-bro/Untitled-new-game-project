// FX library - smoke: plumes (chimneys, smouldering wreckage, burning cloth), trails from fast
// moving sources (the burning rider's smoke streaming in the slipstream, the last trace over the
// sea), and fine wisps (pipe smoke: a laminar ribbon that wavers, then breaks into curls).
//
//   fx.smoke.plume({ at, t0, t1, rate, kind: 'wood' | 'soot' | 'cloth' | 'chimney' | 'smoulder' | 'steam', size, rise, life })
//   fx.smoke.trail({ at: (t) => [x,y,z], t0, t1, kind: 'cloth', rate, drag })    (source moving: smoke left behind)
//   fx.smoke.wisp({ at, t0, t1, kind: 'pipe' | 'herb', rate })                   (thin ribbon)
//
// Every smoke particle is emitted at a fixed time te = t0 + (i + jitter) / rate; its state at t
// is closed-form in its age (initial velocity from the source's own motion, drag toward the wind,
// buoyant rise that fades as it cools, turbulent wander that grows with age), so any frame can
// be drawn alone. A plume is lit by the sun through its own deep-shadow grid and by fire lights.
import { Effect } from './core/manager.js';
import { ParticleLayer } from './core/particles.js';
import { ShadowGrid } from './core/shadowgrid.js';
import { hash01, arr3, clamp, smoothstep, ballistic, noise1, coneDir, norm3 } from './core/util.js';

// albedo (linear), single-scattering strength (ms), extinction scale, phase g, growth, rise
export const SMOKE_KINDS = {
  wood: { albedo: [0.46, 0.45, 0.44], ms: 0.55, sigma: 1.6, g: 0.55, grow: 0.9, rise: 1.6, life: 9, size: 0.25, billow: 0.55 },
  chimney: { albedo: [0.5, 0.5, 0.5], ms: 0.6, sigma: 1.2, g: 0.6, grow: 0.7, rise: 1.2, life: 12, size: 0.18, billow: 0.45 },
  smoulder: { albedo: [0.36, 0.355, 0.35], ms: 0.5, sigma: 0.55, g: 0.55, grow: 0.8, rise: 1.4, life: 7, size: 0.1, billow: 0.3 },
  soot: { albedo: [0.05, 0.045, 0.04], ms: 0.15, sigma: 3.0, g: 0.4, grow: 1.1, rise: 2.4, life: 7, size: 0.4, billow: 0.75 },
  // (a burning rider / sail / thatch; for something small - a burning sleeve on a man running - pass size ~0.07, density ~0.6)
  cloth: { albedo: [0.12, 0.11, 0.1], ms: 0.25, sigma: 2.4, g: 0.45, grow: 1.0, rise: 1.4, life: 6, size: 0.18, billow: 0.6 },
  steam: { albedo: [0.85, 0.86, 0.88], ms: 0.85, sigma: 1.5, g: 0.7, grow: 1.1, rise: 1.0, life: 3, size: 0.2, billow: 0.5 },
  // pipe smoke: fine particles - bluish when side-lit, pale grey exhaled
  pipe: { albedo: [0.62, 0.66, 0.74], ms: 0.7, sigma: 0.9, g: 0.65, grow: 0.25, rise: 0.35, life: 6, size: 0.004, billow: 0.0 },
  herb: { albedo: [0.7, 0.71, 0.72], ms: 0.75, sigma: 1.3, g: 0.6, grow: 0.4, rise: 0.25, life: 7, size: 0.008, billow: 0.15 },
};

/** Live particle indices of a continuous emitter at time t: [first, last]. */
export function liveRange(t, t0, t1, rate, life) {
  const a = Math.max(0, Math.ceil((t - life - t0) * rate - 1));
  const b = Math.floor((Math.min(t, t1) - t0) * rate);
  return [a, b];
}

// ------------------------------------------------------------------ plume / trail --
export class SmokePlume extends Effect {
  constructor(fx, o = {}) {
    super(fx, { name: `fx-smoke-${o.kind || 'wood'}`, ...o });
    const K = { ...SMOKE_KINDS[o.kind || 'wood'], ...(o.look || {}) };
    this.K = K;
    this.t1 = o.t1 ?? this.t0 + 60;
    this.rate = (o.rate ?? 12) * Math.sqrt(fx.tier.particles);
    this.life = o.life ?? K.life;
    this.size = o.size ?? K.size;
    this.rise = o.rise ?? K.rise;
    this.drag = o.drag ?? 1.2;                      // 1/s toward the wind (a fast source leaves a trail)
    this.inherit = o.inherit ?? 1;                  // share of the source's velocity a puff starts with
    this.wind = arr3(o.wind ?? fx.wind);
    this.density = o.density ?? 1;
    this.spread = o.spread ?? 0.15;                 // emission radius (m)
    this.dir = o.dir ? norm3(arr3(o.dir)) : null;
    this.speed = o.speed ?? 0;
    if (this.inherit) {
      // a moving source: emit often enough that neighbouring puffs overlap (spacing < 0.6 size)
      let vmax = 0;
      for (let k = 0; k <= 20; k++) {
        const t = this.t0 + (Math.min(this.t1, this.t0 + 30) - this.t0) * k / 20;
        const a = fx.at(o.at, t - 0.02), b = fx.at(o.at, t + 0.02);
        vmax = Math.max(vmax, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.04);
      }
      const r0 = this.rate;
      this.rate = Math.max(this.rate, Math.min(o.maxRate ?? 600, vmax / (this.size * 0.6)));
      // more puffs per metre: each one thinner, so the trail keeps the density it was asked for
      this.density *= Math.min(1, Math.max(0.12, 3 * r0 / this.rate));
    }
    this.max = Math.ceil(this.rate * this.life) + 4;
    this.puffs = this.layer(new ParticleLayer(fx, {
      max: this.max, mode: 'puff', name: this.object.name, soft: o.soft ?? Math.max(0.05, this.size * 2),
      shading: { albedo: K.albedo, ms: K.ms, sigma: K.sigma * (o.sigmaScale ?? 1), g: K.g, noiseScale: 1.4, noiseAmt: 1.0, evolve: 0.5, billow: K.billow, edge: 0.7, ambient: 1.0 },
    }));
    this.grid = o.selfShadow === false ? null : new ShadowGrid(Math.max(8, fx.tier.grid >> 1));
    this.vel = (te) => {
      const a = fx.at(this.o.at, te - 0.02), b = fx.at(this.o.at, te + 0.02);
      return [(b[0] - a[0]) / 0.04, (b[1] - a[1]) / 0.04, (b[2] - a[2]) / 0.04];
    };
  }
  /** Position of particle i (emitted te) at age a; returns [size, density] */
  state(i, te, a, out) {
    const fx = this.fx, K = this.K;
    const h = (k) => hash01(this.seed * 4093, i, k);
    const src = fx.at(this.o.at, te);
    const sv = this.inherit ? this.vel(te) : [0, 0, 0];
    // emission: a disc of `spread`, optional jet direction
    const ang = h(0) * 6.283, rr = Math.sqrt(h(1)) * this.spread;
    const p0 = [src[0] + Math.cos(ang) * rr, src[1] + 0.02 * h(2), src[2] + Math.sin(ang) * rr];
    const v0 = [sv[0] * this.inherit, sv[1] * this.inherit, sv[2] * this.inherit];
    if (this.dir) { const d = coneDir(this.dir, 0.25, h(3), h(4)); for (let k = 0; k < 3; k++) v0[k] += d[k] * this.speed * (0.6 + 0.6 * h(5)); }
    // drag toward the wind, then buoyancy: rise fast while hot, slowing as it mixes (~ 1 - e^-a/2)
    ballistic(p0, v0, [0, 0, 0], this.drag, this.wind, a, out);
    const buoy = this.rise * 2.2 * (1 - Math.exp(-a / 2.2)) * (0.7 + 0.6 * h(6));
    out[1] += buoy;
    // turbulent wander growing with age (eddies of the plume's own size)
    // a coherent part (puffs emitted together wander together: the column / trail meanders as
    // one body and breaks into lumps) and a per-puff part
    const tw = (0.15 + 0.35 * K.grow * a) * (0.5 + h(7));
    const tc = (0.2 + 0.5 * K.grow * a) * (this.o.meander ?? 1);
    out[0] += noise1(a * 0.45 + h(8) * 50, this.seed + 1) * tw * 0.5 + noise1(te * 0.9 + a * 0.3, this.seed + 21) * tc;
    out[1] += noise1(a * 0.4 + h(9) * 50, this.seed + 2) * tw * 0.3 + noise1(te * 0.8 + a * 0.25, this.seed + 22) * tc * 0.6;
    out[2] += noise1(a * 0.45 + h(10) * 50, this.seed + 3) * tw * 0.5 + noise1(te * 0.9 + a * 0.3, this.seed + 23) * tc;
    const gy = fx.ground(out[0], out[2]);
    const size = this.size * (0.7 + 0.6 * h(11)) * (1 + K.grow * 2.2 * Math.sqrt(a) + 0.15 * a);
    if (out[1] < gy + size * 0.4) out[1] = gy + size * 0.4;
    const life = this.life * (0.6 + 0.6 * h(12));
    const dens = this.density * smoothstep(0, 0.15, a) * (1 - smoothstep(life * 0.3, life, a)) / (1 + 1.4 * K.grow * a);
    return [size, dens, life];
  }
  draw(t) {
    if (t < this.t0) return;
    const fx = this.fx;
    const [ta, tb] = fx.shutter(t);
    const pa = [0, 0, 0], pb = [0, 0, 0];
    const [i0, i1] = liveRange(tb, this.t0, this.t1, this.rate, this.life * 1.2);
    const L = this.puffs;
    for (let i = i0; i <= i1; i++) {
      const te = this.t0 + (i + 0.8 * hash01(this.seed, i, 99)) / this.rate;
      if (te > tb || te > this.t1) continue;
      const ab = tb - te;
      if (ab > this.life * 1.2) continue;
      const aa = Math.max(0, ta - te);
      this.state(i, te, aa, pa);
      const [size, dens] = this.state(i, te, ab, pb);
      if (dens <= 0.004) continue;
      const h = hash01(this.seed, i, 3);
      const tint = 0.9 + 0.2 * h;
      L.push(pa, pb, size, h * 6.28, dens * (this.o.fade ? this.o.fade(t) : 1), (i % 997) / 997, Math.min(1, ab / this.life), [tint, tint, tint]);
    }
    if (this.grid && L.n) {
      this.grid.setSun(fx.light.uniforms.uSunDir.value.toArray());
      L.applyShadow(this.grid, (i) => L.uniforms.uSigma.value * L.sC[i * 4] * 0.6);
    }
  }
}

// ------------------------------------------------------------------ wisp --
/**
 * A thin smoke filament: particles emitted at a high rate from a point (the pipe bowl, a
 * smouldering wick) ride a laminar column whose sideways meander is a travelling wave shared by
 * neighbours (so the beads join into one ribbon), until the column goes turbulent at `breakup`
 * (s) and the ribbon tears into curls that spread and fade.
 */
export class SmokeWisp extends Effect {
  constructor(fx, o = {}) {
    super(fx, { name: `fx-wisp-${o.kind || 'pipe'}`, ...o });
    const K = { ...SMOKE_KINDS[o.kind || 'pipe'], ...(o.look || {}) };
    this.K = K;
    this.t1 = o.t1 ?? this.t0 + 30;
    this.rate = (o.rate ?? 90) * Math.max(0.5, fx.tier.particles);
    this.life = o.life ?? K.life;
    this.rise = o.rise ?? 0.18;                    // m/s laminar rise
    this.breakup = o.breakup ?? 1.4;               // s until the column goes turbulent
    this.wind = arr3(o.wind ?? fx.wind).map((v) => v * (o.windScale ?? 0.25));
    this.max = Math.ceil(this.rate * this.life) + 4;
    this.puffs = this.layer(new ParticleLayer(fx, {
      max: this.max, mode: 'puff', name: this.object.name, soft: 0.02, minPx: o.minPx ?? 0.9,
      shading: { albedo: K.albedo, ms: K.ms, sigma: K.sigma, g: K.g, noiseScale: 0.9, noiseAmt: 0.6, evolve: 0.3, billow: 0.0, edge: 0.95, ambient: 1.0 },
    }));
    this.density = o.density ?? 1;
  }
  draw(t) {
    if (t < this.t0) return;
    const fx = this.fx;
    const [ta, tb] = fx.shutter(t);
    const [i0, i1] = liveRange(tb, this.t0, this.t1, this.rate, this.life);
    const L = this.puffs, K = this.K;
    const pa = [0, 0, 0], pb = [0, 0, 0];
    const pos = (te, a, i, out) => {
      const src = fx.at(this.o.at, te);
      const turb = smoothstep(this.breakup * 0.6, this.breakup * 1.6, a);
      // laminar: shared travelling waves (depend smoothly on te and a)
      const w1 = Math.sin(a * 2.1 - te * 1.3 + this.seed) * 0.02 * (0.3 + a);
      const w2 = Math.sin(a * 3.7 - te * 2.1 + this.seed * 2.3) * 0.014 * (0.3 + a);
      // turbulent: curls whose size grows with age, decorrelated between neighbours as it breaks up
      const ph = i * 0.013;
      const cx = noise1(a * 1.3 + te * 0.7 + ph * turb * 8, this.seed + 5) * 0.12 * turb * (0.4 + a * 0.5);
      const cz = noise1(a * 1.2 - te * 0.6 + ph * turb * 8, this.seed + 6) * 0.12 * turb * (0.4 + a * 0.5);
      const cy = noise1(a * 0.9 + te * 0.5 + ph * turb * 8, this.seed + 7) * 0.05 * turb;
      const up = this.rise * a * (1 - 0.35 * turb) + 0.02 * a * a;
      // the air drift takes the column once it has slowed (linear in age, not accelerating)
      out[0] = src[0] + w1 + cx + this.wind[0] * a * smoothstep(0.0, 1.5, a);
      out[1] = src[1] + up + cy;
      out[2] = src[2] + w2 + cz + this.wind[2] * a * smoothstep(0.0, 1.5, a);
      return turb;
    };
    for (let i = i0; i <= i1; i++) {
      const te = this.t0 + i / this.rate;
      if (te > tb || te > this.t1) continue;
      const ab = tb - te;
      if (ab > this.life) continue;
      const aa = Math.max(0, ta - te);
      pos(te, aa, i, pa);
      const turb = pos(te, ab, i, pb);
      const size = K.size * (1 + ab * K.grow * 2.5 + turb * 2.0 * ab);
      const dens = 0.6 * this.density * smoothstep(0, 0.1, ab) * (1 - smoothstep(this.life * 0.35, this.life, ab)) / (1 + turb * ab * 3.0);
      if (dens <= 0.004) continue;
      L.push(pa, pb, size, hash01(i, 3) * 6.28, dens * (this.o.fade ? this.o.fade(t) : 1), (i % 991) / 991, ab / this.life, [1, 1, 1]);
    }
  }
}

export function smokeApi(fx) {
  return {
    plume: (o) => fx.add(new SmokePlume(fx, { inherit: 0, ...o })),
    trail: (o) => fx.add(new SmokePlume(fx, { kind: 'cloth', inherit: 1, drag: 3.5, rate: 40, selfShadow: false, ...o })),
    wisp: (o) => fx.add(new SmokeWisp(fx, o)),
    KINDS: SMOKE_KINDS,
  };
}
