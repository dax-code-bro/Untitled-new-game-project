// FX library - sparks and ash.
//
//   fx.sparks.burst({ at, dir, t0, count, speed, spread })   hot metal / stone sparks: bright streaks
//        that cool from yellow-white to red and die, skipping off the ground (a spear skidding on
//        paving, steel on stone, embers knocked from a burning beam)
//   fx.ash.fall({ box: [[x0,y0,z0],[x1,y1,z1]], t0, t1, rate, color })   ash and soot flakes drifting
//        down and fluttering after the fire / the attack, settling on the ground
// Pure in t: every particle's path is closed-form from its fixed launch.
import { Effect } from './core/manager.js';
import { ParticleLayer } from './core/particles.js';
import { hash01, arr3, smoothstep, ballistic, coneDir, norm3, noise1, clamp } from './core/util.js';
import { liveRange } from './smoke.js';

const G = [0, -9.81, 0];

export class Sparks extends Effect {
  constructor(fx, o = {}) {
    super(fx, { name: 'fx-sparks', ...o });
    this.n = Math.max(6, Math.round((o.count ?? 80) * fx.tier.particles));
    this.layerS = this.layer(new ParticleLayer(fx, { max: this.n * 2, mode: 'glow', name: 'fx-sparks', soft: 0.01, minPx: 0.9, stretchMax: 200, conserve: false, shading: { gain: o.gain ?? 10, core: 0.85 } }));
    this.dir = norm3(arr3(o.dir ?? [0, 1, 0]));
    this.D = [];
    for (let i = 0; i < this.n; i++) {
      const h = (k) => hash01(this.seed * 2909, i, k);
      const te = this.t0 + (o.duration ?? 0.05) * h(0);
      const p0 = fx.at(o.at, te);
      const d = coneDir(this.dir, o.spread ?? 0.7, h(1), h(2));
      const sp = (o.speed ?? 7) * (0.3 + 0.9 * h(3));
      const v0 = [d[0] * sp, d[1] * sp, d[2] * sp];
      const life = (o.life ?? 0.8) * (0.3 + 0.9 * h(4));
      // first ground contact: a spark skips once (keeps 40% of its speed, sideways scatter)
      const gy = fx.ground(p0[0], p0[2]);
      let th = Infinity;
      const p = [0, 0, 0];
      for (let tt = 0.01; tt < life; tt += 0.01) { ballistic(p0, v0, G, 0.6, null, tt, p); if (p[1] <= gy) { th = tt; break; } }
      this.D.push({ te, p0, v0, life, th, h4: h(5), T0: (o.temp ?? 2.1) * (0.9 + 0.25 * h(6)) });
    }
  }
  draw(t) {
    const [ta, tb] = this.fx.shutter(t);
    const pa = [0, 0, 0], pb = [0, 0, 0], v = [0, 0, 0];
    const pos = (d, a, out) => {
      if (a <= d.th) return ballistic(d.p0, d.v0, G, 0.6, null, a, out);
      ballistic(d.p0, d.v0, G, 0.6, null, d.th, out, v);
      const p1 = out.slice();
      const ang = (d.h4 - 0.5) * 1.6, c = Math.cos(ang), s = Math.sin(ang);
      const v1 = [(v[0] * c - v[2] * s) * 0.4, Math.abs(v[1]) * 0.25, (v[0] * s + v[2] * c) * 0.4];
      return ballistic(p1, v1, G, 1.2, null, a - d.th, out);
    };
    for (const d of this.D) {
      const a1 = tb - d.te;
      if (a1 < 0 || a1 > d.life) continue;
      const a0 = Math.max(0, ta - d.te);
      pos(d, a0, pa); pos(d, a1, pb);
      const gy = this.fx.ground(pb[0], pb[2]);
      if (pb[1] < gy) pb[1] = gy + 0.003;
      if (pa[1] < gy) pa[1] = gy + 0.003;
      const f = a1 / d.life;
      // cooling: yellow-white -> orange -> dull red, then out
      const T = d.T0 * (1 - 0.55 * f);
      this.layerS.push(pa, pb, this.o.size ?? 0.003, 0, 1 - smoothstep(0.75, 1, f), d.h4, f, [0, 0, 0], T);
    }
  }
}

export class AshFall extends Effect {
  constructor(fx, o = {}) {
    super(fx, { name: 'fx-ash', ...o });
    this.t1 = o.t1 ?? this.t0 + 30;
    this.rate = (o.rate ?? 60) * fx.tier.particles;
    this.life = o.life ?? 12;
    this.box = o.box || [[-5, 3, -5], [5, 8, 5]];
    this.col = o.color || [0.2, 0.19, 0.18];
    this.layerA = this.layer(new ParticleLayer(fx, { max: Math.ceil(this.rate * this.life) + 8, mode: 'chip', name: 'fx-ash', soft: 0.02, minPx: 0.7, shading: { albedo: [1, 1, 1] } }));
    this.wind = arr3(o.wind ?? fx.wind);
  }
  draw(t) {
    const fx = this.fx, b = this.box;
    const [ta, tb] = fx.shutter(t);
    const [i0, i1] = liveRange(tb, this.t0, this.t1, this.rate, this.life);
    const pa = [0, 0, 0], pb = [0, 0, 0];
    for (let i = i0; i <= i1; i++) {
      const te = this.t0 + (i + hash01(this.seed, i, 1)) / this.rate;
      if (te > tb || te > this.t1) continue;
      const h = (k) => hash01(this.seed * 1733, i, k);
      const p0 = [0, 1, 2].map((k) => b[0][k] + (b[1][k] - b[0][k]) * h(k + 2));
      const fall = 0.25 + 0.5 * h(6);                                  // flakes fall slowly (drag)
      const at = (a, out) => {
        out[0] = p0[0] + this.wind[0] * a + noise1(a * 0.9 + h(7) * 40, 3) * 0.35;
        out[1] = p0[1] - fall * a + noise1(a * 1.7 + h(8) * 40, 4) * 0.08;
        out[2] = p0[2] + this.wind[2] * a + noise1(a * 0.9 + h(9) * 40, 5) * 0.35;
        const gy = fx.ground(out[0], out[2]) + 0.004;
        if (out[1] < gy) out[1] = gy;
        return out;
      };
      const a1 = tb - te; if (a1 > this.life) continue;
      at(Math.max(0, ta - te), pa); at(a1, pb);
      const fade = smoothstep(0, 0.5, a1) * (1 - smoothstep(this.life * 0.8, this.life, a1));
      const tint = 0.6 + 0.8 * h(10);
      this.layerA.push(pa, pb, 0.002 + 0.005 * h(11), h(12) * 6.28, fade, h(13), 0, [this.col[0] * tint, this.col[1] * tint, this.col[2] * tint]);
    }
  }
}

export function sparksApi(fx) { return { burst: (o) => fx.add(new Sparks(fx, o)) }; }
export function ashApi(fx) { return { fall: (o) => fx.add(new AshFall(fx, o)) }; }
