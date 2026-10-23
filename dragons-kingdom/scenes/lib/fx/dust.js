// FX library - dust: a big dragon's downwash on dry ground, impact clouds (falling roofs,
// debris hitting paving), the slow haze that hangs after both, and grit / grass bits.
//
//   fx.dust.downwash({ at, t0, bursts: [s], radius: 30, strength: 1, color, wind })
//   fx.dust.cloud({ at, t0, radius: 6, dir: [0,1,0], speed: 8, color, life: 10 })
//   fx.dust.haze({ box: [[x0,y0,z0],[x1,y1,z1]], t0, t1, density, color })   (settling haze)
//
// Physics the shapes follow (all closed-form in t, so any frame can be drawn alone):
//   * downwash: every downstroke drives a radial WALL JET out from under the wings; its front
//     slows (R(t) = R (1 - e^{-t/tau})) and rolls up into a ring vortex that lifts the dust into
//     a rolling wall a quarter of the reach high; behind the front a low carpet of dust; the
//     whole cloud drifts with the wind, diffuses (puffs grow ~ sqrt(t)), dilutes (density falls
//     with the puff volume) and settles;
//   * impact cloud: a puff of dust thrown along `dir`, decelerating with drag, rising as a
//     thermal-less cloud that spreads and settles;
//   * grit and grass bits: ballistic with drag, landing on the ground and staying.
import { Effect } from './core/manager.js';
import { ParticleLayer } from './core/particles.js';
import { ShadowGrid } from './core/shadowgrid.js';
import { hash01, arr3, clamp, smoothstep, noise1, ballistic, coneDir, norm3 } from './core/util.js';

export const DUST_COLORS = {
  loam: [0.44, 0.38, 0.3],        // dry field soil (the riding grounds)
  chalk: [0.66, 0.63, 0.57],      // limestone / lime plaster dust (Cling)
  sand: [0.6, 0.52, 0.4],
  road: [0.5, 0.45, 0.37],        // the broad road outside Cling
  ash: [0.36, 0.35, 0.34],
};

const tierScale = (fx) => {
  const p = fx.tier.particles;
  return { n: p, size: Math.pow(p, -0.2), dens: Math.pow(p, -0.4) };
};

// ------------------------------------------------------------------ downwash --
export class Downwash extends Effect {
  constructor(fx, o = {}) {
    super(fx, { name: 'fx-dust-downwash', ...o });
    const ts = tierScale(fx);
    this.ts = ts;
    this.R = o.radius ?? 30;
    this.color = o.color ? (typeof o.color === 'string' ? DUST_COLORS[o.color] : o.color) : DUST_COLORS.loam;
    this.bursts = (o.bursts && o.bursts.length ? o.bursts : [0]).map((b) => (typeof b === 'number' ? { t: b, s: 1 } : { t: b.t, s: b.s ?? 1 }));
    this.perBurst = Math.max(40, Math.round((o.puffs ?? 700) * ts.n));
    this.life = o.life ?? 9;
    this.strength = o.strength ?? 1;
    this.wind = arr3(o.wind ?? fx.wind);
    this.puffs = this.layer(new ParticleLayer(fx, {
      max: this.perBurst * this.bursts.length, mode: 'puff', name: 'fx-downwash-puffs', soft: 0.8 * this.R / 30,
      shading: { albedo: this.color, ms: 0.75, sigma: o.sigma ?? 0.5, g: 0.55, noiseScale: 1.7, noiseAmt: 1.0, evolve: 0.25, billow: 0.45, edge: 0.8, ambient: 1.0 },
    }));
    this.grid = new ShadowGrid(fx.tier.grid);
    // grit + grass bits thrown outward
    this.nGrit = Math.round((o.grit ?? 900) * ts.n) * this.bursts.length;
    this.grit = o.grit === 0 ? null : this.layer(new ParticleLayer(fx, {
      max: this.nGrit, mode: 'chip', name: 'fx-downwash-grit', soft: 0.05,
      shading: { albedo: [1, 1, 1] },
    }));
    this.gritCols = o.gritColors || [[0.09, 0.075, 0.05], [0.16, 0.2, 0.07], [0.22, 0.19, 0.12], [0.12, 0.15, 0.05]];
  }

  /** Position of puff j of burst b at age a (s). Writes p, returns [size, density]. */
  puff(b, j, a, C, p) {
    const R = this.R, s = this.seed * 7919 + b * 131, k30 = R / 30;
    const h = (k) => hash01(s, j, k);
    const th = 2 * Math.PI * (j + h(0)) / this.perBurst + (h(1) - 0.5) * 0.08;
    // three kinds of puff: the rolling front (55%), the low carpet behind it (30%), and big thin
    // billows of the diffused cloud (15%)
    const kind = h(15) < 0.55 ? 0 : h(15) < 0.85 ? 1 : 2;
    const lam = kind === 0 ? 0.72 + 0.3 * Math.sqrt(h(2)) : kind === 1 ? 0.15 + 0.7 * Math.pow(h(2), 0.8) : 0.4 + 0.6 * h(2);
    const tau = 0.75 * (0.8 + 0.4 * h(3)) * Math.sqrt(k30);
    // the ring is not a perfect circle: its reach and roll height vary smoothly around it (lobes
    // where the wings pushed harder), so neighbouring puffs move together as one wall
    const lobe = noise1(th * 2.2 + b * 1.7, this.seed + 5) + 0.5 * noise1(th * 5.1 + b * 0.9, this.seed + 6);
    const Rf = R * (0.95 + 0.35 * lobe + 0.08 * h(4)) * (1 - Math.exp(-a / tau)) * Math.sqrt(this.bursts[b].s * this.strength);
    const r0 = R * 0.12 * (0.5 + h(5));
    let rr = r0 + Rf * lam;
    let y;
    if (kind === 0) {
      // ring vortex at the front: the roll's core rises, puffs orbit it (outward at the bottom,
      // up the front face, back over the top) more slowly as the jet decays
      const Hroll = R * 0.11 * (1 + 0.6 * lobe + 0.15 * (h(6) - 0.5)) * Math.sqrt(this.bursts[b].s);
      const coreR = Hroll * (0.15 + 0.45 * h(7));
      const coreY = Hroll * (0.5 + 0.5 * (1 - Math.exp(-a / 1.2))) + 0.02 * R * Math.pow(a, 0.8);
      const phi = -Math.PI / 2 + 2 * Math.PI * h(8) + 2.6 * (1 - Math.exp(-a / 1.4));
      y = coreY * Math.min(1, a / 0.35) + coreR * Math.sin(phi);
      rr += coreR * Math.cos(phi);
    } else if (kind === 1) {
      y = (0.2 + 1.3 * h(9) * h(9)) * k30 * (0.5 + 0.5 * Math.min(1, a / 1.2));
    } else {
      y = R * (0.03 + 0.1 * h(9)) * Math.min(1, a / 2.5);
    }
    // slow lift of the stirred air, then settling
    y += 0.18 * a * k30 * h(10) - 0.015 * Math.max(0, a - 4) ** 2 * h(11);
    // turbulence: smooth wander along the ring and in height
    const tw = 0.07 * R * Math.min(1, a / 0.8);
    const wx = noise1(a * 0.6 + j * 0.37, s + 1) * tw, wz = noise1(a * 0.6 + j * 0.53, s + 2) * tw, wy = noise1(a * 0.5 + j * 0.71, s + 3) * tw * 0.35;
    const cx = Math.cos(th), cz = Math.sin(th);
    p[0] = C[0] + cx * rr + wx + this.wind[0] * a;
    p[1] = C[1] + Math.max(0, y + wy) + this.wind[1] * a;
    p[2] = C[2] + cz * rr + wz + this.wind[2] * a;
    // size grows with turbulent diffusion
    const base = kind === 0 ? 1.0 + 1.6 * h(12) * h(12) : kind === 1 ? 0.6 + 1.1 * h(12) : 2.4 + 2.0 * h(12);
    const size = k30 * base * (0.35 + 0.65 * Math.sqrt(Math.min(4, a / 1.2))) * this.ts.size;
    // density: entrained in ~0.2 s, diluted as the puff grows, gone by the end of life
    const life = this.life * (0.6 + 0.6 * h(13)) * (kind === 2 ? 1.3 : 1);
    const dens = this.strength * this.bursts[b].s * smoothstep(0, 0.18 + 0.25 * h(14), a) * (1 - smoothstep(life * 0.4, life, a))
      / (1 + 0.45 * a) * (kind === 2 ? 0.18 : kind === 1 ? 0.8 : 1) * this.ts.dens;
    p[1] = Math.max(p[1], C[1] + size * 0.4);
    return [size, dens];
  }

  draw(t, cam) {
    const fx = this.fx;
    const C = fx.at(this.o.at, t);
    const [ta, tb] = fx.shutter(t);
    const pa = [0, 0, 0], pb = [0, 0, 0];
    const L = this.puffs;
    this.bursts.forEach((B, b) => {
      const tb0 = this.t0 + B.t;
      if (t < tb0) return;
      const a = t - tb0;
      if (a > this.life * 1.2) return;
      for (let j = 0; j < this.perBurst; j++) {
        const delay = hash01(this.seed, b, j, 99) * 0.12;
        const aa = Math.max(0, ta - tb0 - delay), ab = Math.max(0, tb - tb0 - delay);
        if (ab <= 0) continue;
        this.puff(b, j, aa, C, pa);
        const [size, dens] = this.puff(b, j, ab, C, pb);
        if (dens <= 0.002) continue;
        const h = hash01(this.seed, b, j, 50);
        const tint = 0.88 + 0.24 * h;
        L.push(pa, pb, size, h * 6.283, dens, (b * 977 + j) % 1000 / 1000, Math.min(1, ab / this.life), [tint, tint * (0.98 + 0.03 * h), tint * (0.97 + 0.05 * h)]);
      }
    });
    // cloud lighting
    this.grid.setSun(fx.light.uniforms.uSunDir.value.toArray());
    L.applyShadow(this.grid, (i) => L.uniforms.uSigma.value * L.sC[i * 4] * 0.55);
    if (this.grit) this.drawGrit(t, C, ta, tb);
  }

  drawGrit(t, C, ta, tb) {
    const R = this.R, g = [0, -9.81, 0], G = this.grit;
    const per = Math.floor(this.nGrit / this.bursts.length);
    const pa = [0, 0, 0], pb = [0, 0, 0], d = [0, 0, 0];
    this.bursts.forEach((B, b) => {
      const tb0 = this.t0 + B.t;
      if (tb < tb0) return;
      for (let j = 0; j < per; j++) {
        const s = this.seed * 31 + b * 7;
        const h = (k) => hash01(s, j, k, 3);
        const t0 = tb0 + h(0) * 0.25;
        if (tb <= t0) continue;
        const th = 2 * Math.PI * h(1);
        const r0 = R * 0.12 * Math.sqrt(h(2)) + R * 0.05;
        const sp = (6 + 16 * h(3)) * Math.sqrt(R / 30) * B.s ** 0.5;
        const v0 = [Math.cos(th) * sp, (1.5 + 6 * h(4)) * Math.sqrt(R / 30), Math.sin(th) * sp];
        const p0 = [C[0] + Math.cos(th) * r0, C[1] + 0.05, C[2] + Math.sin(th) * r0];
        const size = 0.004 + 0.02 * h(5) ** 2;
        const k = 2.5 / (size * 60);                 // light bits slow fast
        const fall = (tt, out) => {
          const a = Math.max(0, tt - t0);
          ballistic(p0, v0, g, k, this.wind, a, out);
          // landed: stays where it touched down (find the touchdown by clamping height)
          if (out[1] < C[1] + size) out[1] = C[1] + size * 0.5;
          return out;
        };
        fall(ta, pa); fall(tb, pb);
        const age = tb - t0;
        const col = this.gritCols[(h(6) * this.gritCols.length) | 0];
        const alpha = smoothstep(0, 0.05, age) * (1 - smoothstep(this.life * 0.7, this.life, age));
        G.push(pa, pb, size, h(7) * 6.283, alpha, h(8), Math.min(1, age / 4), col);
      }
    });
  }
}

// ------------------------------------------------------------------ impact cloud --
/** A dust cloud thrown from a point (debris impact, a roof coming down, a body hitting paving). */
export class DustCloud extends Effect {
  constructor(fx, o = {}) {
    super(fx, { name: 'fx-dust-cloud', ...o });
    const ts = tierScale(fx);
    this.ts = ts;
    this.R = o.radius ?? 5;
    this.n = Math.max(24, Math.round((o.puffs ?? 260) * ts.n));
    this.life = o.life ?? 12;
    // grow: how fast the puffs swell (diffusion); thin: how fast the cloud dilutes (1/s)
    this.grow = o.grow ?? 1.4;
    this.thin = o.thin ?? 0.6;
    this.fall = o.fall ?? 0;
    this.dir = norm3(arr3(o.dir ?? [0, 1, 0]));
    this.spread = o.spread ?? 1.2;
    this.speed = o.speed ?? 7;
    this.strength = o.strength ?? 1;
    this.wind = arr3(o.wind ?? fx.wind);
    this.color = o.color ? (typeof o.color === 'string' ? DUST_COLORS[o.color] : o.color) : DUST_COLORS.chalk;
    this.puffs = this.layer(new ParticleLayer(fx, {
      max: this.n, mode: 'puff', name: 'fx-dust-cloud', soft: 0.4 * this.R / 5,
      shading: { albedo: this.color, ms: 0.75, sigma: o.sigma ?? 1.8, g: 0.5, noiseScale: 1.5, noiseAmt: 1.0, evolve: 0.3, billow: 0.8, edge: 0.75 },
    }));
    this.grid = new ShadowGrid(fx.tier.grid);
    this.groundY = o.groundY;
  }

  draw(t, cam) {
    const fx = this.fx;
    if (t < this.t0) return;
    const C = fx.at(this.o.at, this.t0);           // where it started
    const gy = this.groundY ?? fx.ground(C[0], C[2]);
    const [ta, tb] = fx.shutter(t);
    const pa = [0, 0, 0], pb = [0, 0, 0], d = [0, 0, 0];
    const L = this.puffs, R = this.R;
    for (let j = 0; j < this.n; j++) {
      const h = (k) => hash01(this.seed * 613, j, k);
      const tj = this.t0 + h(0) * (this.o.spreadTime ?? 0.35);
      if (tb <= tj) continue;
      coneDir(this.dir, this.spread, h(1), h(2), d);
      const v = this.speed * (0.25 + 0.9 * h(3)) * this.strength ** 0.5;
      const k = 1.6 + 1.5 * h(4);                     // dust is all drag
      const pos = (tt, out) => {
        const a = Math.max(0, tt - tj);
        const tr = (1 - Math.exp(-k * a)) / k;
        for (let i = 0; i < 3; i++) out[i] = C[i] + d[i] * (v * tr + R * 0.25 * h(5)) + this.wind[i] * a;
        // the cloud billows up a little, then sinks as it thins; a share of it (o.fall: the heavy
        // dust pouring off a broken roof with the debris) falls at its settling speed
        out[1] += R * 0.12 * Math.sqrt(a) * h(6) - 0.01 * a * a * h(7);
        if (h(13) < this.fall) { const vf = 0.8 + 1.6 * h(14), kf = 1.5; out[1] -= vf * (a - (1 - Math.exp(-kf * a)) / kf) + 0.35 * vf * a; }
        const tw = R * 0.1 * Math.min(1, a / 1.2);
        out[0] += noise1(a * 0.4 + j * 0.41, this.seed + 1) * tw;
        out[2] += noise1(a * 0.4 + j * 0.67, this.seed + 2) * tw;
        return a;
      };
      pos(ta, pa);
      const a = pos(tb, pb);
      const size = (R / 5) * (0.35 + 0.9 * h(8)) * (0.35 + this.grow * Math.sqrt(a / 1.5)) * this.ts.size;
      pa[1] = Math.max(pa[1], gy + size * 0.3); pb[1] = Math.max(pb[1], gy + size * 0.3);
      const life = this.life * (0.5 + 0.7 * h(9));
      const dens = this.strength * smoothstep(0, 0.12, a) * (1 - smoothstep(life * 0.4, life, a)) / (1 + this.thin * a) * this.ts.dens;
      if (dens <= 0.002) continue;
      const tint = 0.9 + 0.2 * h(10);
      L.push(pa, pb, size, h(11) * 6.283, dens, h(12), Math.min(1, a / this.life), [tint, tint, tint * 0.98]);
    }
    this.grid.setSun(fx.light.uniforms.uSunDir.value.toArray());
    L.applyShadow(this.grid, (i) => L.uniforms.uSigma.value * L.sC[i * 4] * 0.55);
  }
}

// ------------------------------------------------------------------ settling haze --
/**
 * Fine dust hanging in the air after the attack: a box filled with slow, large, thin puffs that
 * sink and thin out between t0 and t1 (plus motes catching the light near the camera).
 */
export class DustHaze extends Effect {
  constructor(fx, o = {}) {
    super(fx, { name: 'fx-dust-haze', ...o });
    const ts = tierScale(fx);
    this.ts = ts;
    this.box = o.box || [[-10, 0, -10], [10, 6, 10]];
    this.n = Math.max(16, Math.round((o.puffs ?? 220) * ts.n));
    this.t1 = o.t1 ?? this.t0 + 60;
    this.density = o.density ?? 0.25;
    this.wind = arr3(o.wind ?? fx.wind ?? [0.3, 0, 0.1]);
    this.color = o.color ? (typeof o.color === 'string' ? DUST_COLORS[o.color] : o.color) : DUST_COLORS.chalk;
    this.puffs = this.layer(new ParticleLayer(fx, {
      max: this.n, mode: 'puff', name: 'fx-dust-haze', soft: 1.5,
      shading: { albedo: this.color, ms: 0.75, sigma: 1.0, g: 0.6, noiseScale: 1.2, noiseAmt: 1.1, evolve: 0.1, billow: 0.3, edge: 0.9 },
    }));
    this.grid = new ShadowGrid(Math.max(8, fx.tier.grid >> 1));
  }
  draw(t) {
    if (t < this.t0 - 0.5 || t > this.t1 + 0.5) return;
    const fx = this.fx, [ta, tb] = fx.shutter(t);
    const b = this.box, L = this.puffs;
    const span = [b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]];
    const vol = Math.max(1, span[0] * span[2]);
    const sizeBase = Math.sqrt(vol / this.n) * 1.1;
    const pa = [0, 0, 0], pb = [0, 0, 0];
    const u = clamp((t - this.t0) / Math.max(0.1, this.t1 - this.t0));
    for (let j = 0; j < this.n; j++) {
      const h = (k) => hash01(this.seed * 211, j, k);
      const at = (tt, out) => {
        const a = tt - this.t0;
        for (let i = 0; i < 3; i++) {
          let w = (h(i) * span[i] + this.wind[i] * a + noise1(a * 0.07 + j * 0.3 + i, this.seed + i) * sizeBase);
          if (i !== 1) w = ((w % span[i]) + span[i]) % span[i];
          out[i] = b[0][i] + w;
        }
        // sinking: heavier fractions settle first (Stokes), the top of the haze comes down
        out[1] = b[0][1] + Math.max(0, h(1) * span[1] * (1 - 0.6 * u) - 0.02 * a * h(4));
      };
      at(ta, pa); at(tb, pb);
      const size = sizeBase * (0.7 + 0.8 * h(5)) * this.ts.size;
      pb[1] = Math.max(pb[1], b[0][1] + size * 0.3); pa[1] = Math.max(pa[1], b[0][1] + size * 0.3);
      const dens = this.density * (1 - u * 0.85) * smoothstep(this.t0 - 0.5, this.t0 + 0.5, t) * (1 - smoothstep(this.t1 - 2, this.t1, t)) * (0.5 + h(6)) * this.ts.dens;
      if (dens <= 0.001) continue;
      L.push(pa, pb, size, h(7) * 6.283, dens, h(8), u, [1, 1, 1]);
    }
    this.grid.setSun(fx.light.uniforms.uSunDir.value.toArray());
    L.applyShadow(this.grid, (i) => L.uniforms.uSigma.value * L.sC[i * 4] * 0.5);
  }
}

export function dustApi(fx) {
  return {
    downwash: (o) => fx.add(new Downwash(fx, o)),
    cloud: (o) => fx.add(new DustCloud(fx, o)),
    haze: (o) => fx.add(new DustHaze(fx, o)),
    COLORS: DUST_COLORS,
  };
}
