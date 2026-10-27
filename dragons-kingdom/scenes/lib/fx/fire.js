// FX library - fire: a dragon's breath jet and burning cloth / wood, with what real fire does to
// its surroundings - light (flickering point lights that light the creature, the ground, the
// smoke), embers, heat shimmer, soot smoke and scorched surfaces.
//
//   fx.fire.jet({ creature | origin, dir, t0, t1, palette: 'standard' | 'leaf', length, width })
//   fx.fire.burn({ at, t0, t1, size, intensity })          (burning cloth on a moving rider, debris)
//   fx.fire.embers({ at, t0, t1, rate })                   (sparks / embers from a burning thing)
//   fx.fire.shimmer({ at, size, t0, t1 })                  (heat haze alone)
//   fx.fire.scorch({ target, at, dir, size, t0 })          (soot / scorch decal)
//
// Look: volumetric flame tongues ('flame' particles: world-space noise erosion, colour from a local
// heat value through the canon palettes of scenes/lib/creatures/fire.js - Charcoal's orange-red,
// Leaf's purplish-blue), additive and HDR so the film finish's bloom picks them up; soot above the
// flame, lit from below by the fire's own lights. Everything is emitted at fixed times and is
// closed-form in its age (pure in t). The jet's direction and origin are sampled at each
// particle's EMISSION time, so a moving head sweeps the stream like a hose.
import * as THREE from 'three';
import { Effect } from './core/manager.js';
import { ParticleLayer } from './core/particles.js';
import { DecalEffect } from './core/decal.js';
import { FlameVolume } from './core/flamevol.js';
import { JetVolume, JET_MAX } from './core/jetvol.js';
import { flamePalette, flameRadiance } from './core/blackbody.js';
import { SmokePlume, liveRange } from './smoke.js';
import { hash01, arr3, clamp, smoothstep, ballistic, noise1, norm3, cross3, coneDir, len3 } from './core/util.js';
import { FIRE_PALETTES } from '../creatures/fire.js';

export { FIRE_PALETTES };
const sc3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

function paletteOf(p) {
  const P = typeof p === 'object' && p ? p : FIRE_PALETTES[p || 'standard'];
  return {
    core: sc3(P.core, P.coreI), body: sc3(P.body, P.bodyI), edge: sc3(P.edge, P.edgeI),
    light: P.light, lightI: P.lightI ?? 1, smoke: P.smoke, smokeAmt: P.smokeAmt ?? 1, temp: P.temp ?? 1, spread: P.spread ?? 1,
  };
}

/** Flickering intensity, pure in t (two incommensurate noises; ~6-14 Hz). */
const flicker = (t, seed) => 0.82 + 0.12 * noise1(t * 9.3, seed) * 2 + 0.06 * noise1(t * 23.7, seed + 7) * 2;

// ------------------------------------------------------------------ jet --
export class FireJet extends Effect {
  constructor(fx, o = {}) {
    super(fx, { name: 'fx-fire-jet', ...o });
    this.P = paletteOf(o.palette);
    this.L = o.length ?? 22;
    this.W = (o.width ?? this.L * 0.26) * this.P.spread;
    this.t1 = o.t1 ?? this.t0 + 1.5;
    this.life = (o.life ?? 0.62) / this.P.temp;
    this.rate = (o.rate ?? 700) * fx.tier.particles;
    this.gain = o.gain ?? 1;
    const maxF = Math.ceil(this.rate * this.life) + 8;
    // flame emission: absolute radiance from a soot temperature (core/blackbody.js) - Charcoal's
    // ordinary fire is a blackbody glow (orange body, yellow-white core that clips, dark red
    // tips and soot-black creases); Leaf's purplish-blue fire maps the same temperatures through
    // its own hue ramp. The packets' heat (1.3 at the mouth -> 0.15 at the end) -> T.
    this.FP = flamePalette(o.flamePalette ?? (o.palette === 'leaf' ? 'leaf' : 'standard'));
    // 'volume' (default): one ray-marched body of burning gas around the stream's centreline
    // (core/jetvol.js); 'particles': the older sprite jet (cheaper, layered look)
    this.mode = o.render ?? 'volume';
    if (this.mode === 'volume') {
      this.vol = new JetVolume(fx, { palette: this.FP, seed: this.seed, kappa: o.kappa, turb: o.turb, sharp: o.sharp, length: this.L, life: this.life, rref: 0.22 * this.W, noTwin: o.zzNoTwin, debugSeg: o.zzDebugSeg });
      this.object.add(this.vol.mesh, this.vol.twin);
    }
    this.flames = this.mode === 'volume' ? null : this.layer(new ParticleLayer(fx, {
      max: maxF, mode: 'flame', name: 'fx-fire-flames', soft: 0.3, conserve: false,
      // optically thick: each tongue shows the flame's own radiance and covers what is behind
      // it; `occlusion` < 1 lets some background through (thinner, cleaner fire: Leaf's)
      shading: {
        flamePalette: this.FP, gain: (o.radiance ?? 1) * this.gain, sigma: o.sigma ?? (1.0 + 0.8 * clamp(this.P.smokeAmt, 0, 1)),
        occlusion: o.occlusion ?? (0.45 + 0.45 * clamp(this.P.smokeAmt, 0, 1)), crease: o.crease ?? (0.16 + 0.3 * clamp(this.P.smokeAmt, 0, 1)), stretch: 0.45,
        heatK: o.heatK ?? 1, soot: 1, noiseScale: 2.2, noiseAmt: 1.2, evolve: 2.5, edge: o.edge ?? 0.16,
      },
    }));
    // soot: burning-out fuel along the second half of the stream rolls off its top as black smoke
    // that climbs fast (hot) and spreads - many small puffs, torn edges, never one smooth ball
    this.smokeRate = (o.smokeRate ?? 260) * Math.sqrt(fx.tier.particles);
    this.smokeLife = o.smokeLife ?? 3.2;
    this.smoke = o.smoke === false ? null : this.layer(new ParticleLayer(fx, {
      max: Math.ceil(this.smokeRate * (this.smokeLife + this.life)) + 8, mode: 'puff', name: 'fx-fire-smoke', soft: 0.6,
      shading: { albedo: this.P.smoke.map((c) => Math.max(c, 0.02) * 1.6), ms: 0.2, sigma: 2.0 * this.P.smokeAmt, g: 0.45, noiseScale: 1.6, noiseAmt: 1.45, evolve: 0.8, billow: 0.75, edge: 0.75 },
    }));
    // embers thrown from the stream
    this.emberRate = (o.emberRate ?? 90) * fx.tier.particles;
    this.emberLife = 2.2;
    this.embers = o.embers === false ? null : this.layer(new ParticleLayer(fx, {
      max: Math.ceil(this.emberRate * this.emberLife) + 8, mode: 'glow', name: 'fx-fire-embers', soft: 0.02, minPx: 0.8, shading: { gain: 1.0, core: 0.6 },
    }));
    // heat haze over the stream (late pass)
    this.haze = o.shimmer === false ? null : this.layer(new ParticleLayer(fx, {
      max: 48, mode: 'shimmer', name: 'fx-fire-shimmer', soft: 0.5, sort: false, shading: { shimmer: o.shimmerAmount ?? 0.004 },
    }));
    // lights: down the stream (ground, chest), mid, at the mouth (jaws, head)
    this.lights = [0.12, 0.45, 0.8].map((x, k) => {
      const l = new THREE.PointLight(new THREE.Color(...this.P.light), 0, this.L * (k === 0 ? 1.0 : 2.0), 2);
      l.castShadow = !!(o.lightShadows && k === 1 && fx.tier.castShadow);
      if (l.castShadow) { l.shadow.mapSize.set(512, 512); l.shadow.bias = -0.002; }
      l.userData.x = x;
      this.object.add(l);
      fx.light.addPoint(l);
      return l;
    });
    this.scorchDecal = null;
    if (o.scorch) this.makeScorch(o.scorch === true ? {} : o.scorch);
  }

  /** origin + unit direction at time te (creature mouth socket or explicit). */
  frame(te) {
    const o = this.o, fx = this.fx;
    if (o.creature) {
      const c = o.creature;
      if (o.pose) o.pose(te);                     // optional: pose the creature for the emission time
      c.root.updateMatrixWorld(true);
      const sock = c.anatomy.sockets.mouth;
      const jb = c.bones[c.boneIndex[sock.bone]];
      const P = new THREE.Vector3(...sock.pos).applyMatrix4(c.skeleton.boneInverses[c.boneIndex[sock.bone]]).applyMatrix4(jb.matrixWorld);
      const hb = c.bones[c.boneIndex.head];
      const ez = c.anatomy.head.frame.ez;
      const D = new THREE.Vector3(ez[0], ez[1], ez[2]).applyQuaternion(hb.getWorldQuaternion(new THREE.Quaternion())).normalize();
      P.addScaledVector(D, c.anatomy.head.H * 0.25);
      return { O: [P.x, P.y, P.z], D: [D.x, D.y, D.z] };
    }
    const O = fx.at(o.origin ?? o.at, te);
    const D = norm3(typeof o.dir === 'function' ? arr3(o.dir(te)) : arr3(o.dir ?? [0, 0, 1]));
    return { O, D };
  }
  on(t) { return smoothstep(this.t0 - 0.02, this.t0 + 0.06, t) * (1 - smoothstep(this.t1 - 0.08, this.t1 + 0.04, t)); }

  /** World position of fuel packet i (emitted te) at age a (s); returns [r, heat, dens] */
  packet(i, te, a, F, out) {
    const h = (k) => hash01(this.seed * 6151, i, k);
    const L = this.L, W = this.W, f = a / this.life;
    const { O, D } = F;
    const s = norm3(Math.abs(D[1]) > 0.95 ? cross3([1, 0, 0], D) : cross3([0, 1, 0], D)), u = cross3(D, s);
    const x = L * (1 - Math.exp(-3.0 * f)) / (1 - Math.exp(-3.0)) * (0.9 + 0.2 * h(0));
    const ang = h(1) * 6.283, rad = Math.sqrt(h(2)) * W * 0.5 * (0.12 + 0.88 * f);
    // coherent turbulence: a slow field along the stream shared by packets emitted together
    const xf = x / L, tw = W * 0.42 * Math.min(1, f * 1.6);
    const tx = (noise1(xf * 3.1 - te * 2.4, this.seed + 1) + 0.6 * noise1(xf * 7.3 - te * 4.1, this.seed + 2)) * tw;
    const ty = (noise1(xf * 2.7 - te * 2.1, this.seed + 3) + 0.6 * noise1(xf * 6.9 - te * 3.7, this.seed + 4)) * tw;
    const rise = 0.14 * L * f * f;
    for (let k = 0; k < 3; k++) out[k] = O[k] + D[k] * x + s[k] * (Math.cos(ang) * rad + tx) + u[k] * (Math.sin(ang) * rad + ty);
    out[1] += rise;
    // (a narrow rod of burning fuel at the mouth, blooming within the first tenth of its life)
    let r = (0.012 * L + 0.013 * L * smoothstep(0, 0.12, f) + 0.34 * W * Math.pow(f, 1.15)) * (0.5 + 0.9 * h(3) * h(3));
    // surges: tongues bunch into billows with thinner necks between them
    r *= 0.6 + 0.8 * (0.5 + 0.5 * Math.sin(xf * 8.5 - te * 13.0 + this.seed));
    // the stream splashes along the ground where it hits it
    const gy = this.fx.ground(out[0], out[2]);
    if (out[1] - r * 0.45 < gy) {
      const pen = gy - (out[1] - r * 0.45);
      out[1] = gy + r * 0.45 + pen * 0.15;
      const hd = Math.hypot(D[0], D[2]) || 1;
      out[0] += D[0] / hd * pen * 0.8 + s[0] * pen * (h(4) - 0.5) * 1.6;
      out[2] += D[2] / hd * pen * 0.8 + s[2] * pen * (h(4) - 0.5) * 1.6;
      r *= 1 + pen / Math.max(r, 0.1) * 0.3;
    }
    // heat: a white-hot rod of burning fuel at the mouth, falling fast to an orange body and a
    // dark red, sooty end
    const heat = (1.38 - 1.22 * Math.pow(f, 0.55)) * (0.82 + 0.36 * h(5));
    const dens = smoothstep(0, 0.012, a) * (1 - smoothstep(0.55, 1.0, f));
    return [r, heat, dens];
  }

  draw(t) {
    const fx = this.fx;
    const [ta, tb] = fx.shutter(t);
    const pa = [0, 0, 0], pb = [0, 0, 0];
    // flames
    const [i0, i1] = liveRange(tb, this.t0, this.t1, this.rate, this.life);
    let cx = 0, cy = 0, cz = 0, cw = 0;
    const frames = new Map();
    const bins = [0, 1, 2].map(() => ({ I: [0, 0, 0], A: 0, p: [0, 0, 0], w: 0, r: 0 }));
    const frameAt = (te) => { const key = Math.round(te * 240); if (!frames.has(key)) frames.set(key, this.frame(key / 240)); return frames.get(key); };
    if (this.vol) this.drawVolume(t, frameAt, bins);
    for (let i = i0; i <= (this.flames ? i1 : -1); i++) {
      const te = this.t0 + (i + hash01(this.seed, i, 9)) / this.rate;
      if (te > tb || te > this.t1) continue;
      const ab = tb - te;
      if (ab > this.life) continue;
      const F = frameAt(te);
      this.packet(i, te, Math.max(0, ta - te), F, pa);
      const [r, heat, dens] = this.packet(i, te, ab, F, pb);
      if (dens < 0.01) continue;
      // a tongue is drawn out along the flow: the capsule spans it (plus the shutter streak)
      const e = r * (0.15 + 0.35 * hash01(i, 6));
      const fd = norm3([F.D[0], F.D[1] + 0.35 * ab / this.life, F.D[2]]);
      for (let k = 0; k < 3; k++) { pa[k] -= fd[k] * e; pb[k] += fd[k] * e; }
      this.flames.push(pa, pb, r, hash01(i, 5) * 6.28, dens, (i % 983) / 983, ab / this.life, [1, 1, 1], heat);
      const w = dens * Math.max(0, heat); cx += pb[0] * w; cy += pb[1] * w; cz += pb[2] * w; cw += w;
      // light: this tongue's radiance times its area, binned along the stream (mouth / mid / far)
      const T = this.FP.tTip + (this.FP.tCore - this.FP.tTip) * clamp(heat * 0.92 / 1.25, 0, 1);
      const rad = flameRadiance(T, this.FP), A = Math.PI * r * r * (1 + 1.27 * e / r) * clamp(dens, 0, 1);
      const bin = ab / this.life < 0.18 ? 0 : ab / this.life < 0.45 ? 1 : 2, B = bins[bin];
      const Y = 0.2126 * rad[0] + 0.7152 * rad[1] + 0.0722 * rad[2];
      B.I[0] += rad[0] * A; B.I[1] += rad[1] * A; B.I[2] += rad[2] * A; B.A += A;
      B.p[0] += pb[0] * Y * A; B.p[1] += pb[1] * Y * A; B.p[2] += pb[2] * Y * A; B.w += Y * A;
      B.r = Math.max(B.r, r);
    }
    // soot rising off the end of the flames
    if (this.smoke) {
      const [k0, k1] = liveRange(tb, this.t0, this.t1, this.smokeRate, this.smokeLife + this.life);
      for (let k = k0; k <= k1; k++) {
        const te = this.t0 + (k + hash01(this.seed, k, 19)) / this.smokeRate;
        if (te > tb || te > this.t1) continue;
        const h = (m) => hash01(this.seed * 313, k, m);
        const F = frameAt(te);
        const f0 = 0.45 + 0.5 * h(5);                          // where along the stream it rolls off
        const ab = tb - te - this.life * f0;
        if (ab < 0 || ab > this.smokeLife) continue;
        const start = [0, 0, 0];
        const [r0] = this.packet(k * 7 + 3, te, this.life * f0, F, start);
        start[1] += r0 * 0.55;                                 // off the top of the flame
        const sp = (a, out) => {
          ballistic(start, [F.D[0] * 3, 0, F.D[2] * 3], [0, 0, 0], 1.6, fx.wind, a, out);
          out[1] += 4.8 * (1 - Math.exp(-a / 1.1)) * (0.6 + 0.8 * h(0)) + 0.6 * a;
          out[0] += noise1(a * 0.9 + h(1) * 40, this.seed + 11) * (0.3 + a) * this.W * 0.35;
          out[2] += noise1(a * 0.9 + h(2) * 40, this.seed + 12) * (0.3 + a) * this.W * 0.35;
        };
        sp(Math.max(0, ta - te - this.life * f0), pa); sp(ab, pb);
        const size = r0 * (0.45 + 0.35 * h(3)) * (0.7 + 1.5 * Math.sqrt(ab));
        const dens = smoothstep(0, 0.15, ab) * (1 - smoothstep(this.smokeLife * 0.35, this.smokeLife, ab)) / (1 + 0.5 * ab) * 0.55;
        this.smoke.push(pa, pb, size, hash01(k, 8) * 6.28, dens, (k % 977) / 977, ab / this.smokeLife, [1, 1, 1]);
      }
    }
    // embers
    if (this.embers) {
      const [e0, e1] = liveRange(tb, this.t0, this.t1, this.emberRate, this.emberLife + this.life);
      for (let k = e0; k <= e1; k++) {
        const te = this.t0 + (k + hash01(this.seed, k, 29)) / this.emberRate;
        if (te > tb || te > this.t1) continue;
        const h = (m) => hash01(this.seed * 977, k, m);
        const f0 = 0.3 + 0.5 * h(0);
        const ab = tb - te - this.life * f0;
        if (ab < 0 || ab > this.emberLife * (0.5 + 0.5 * h(1))) continue;
        const F = frameAt(te);
        const st = [0, 0, 0];
        this.packet(k * 13 + 1, te, this.life * f0, F, st);
        const d = coneDir(F.D, 1.0, h(2), h(3));
        const v0 = [d[0] * 6 * h(4) + F.D[0] * 8, d[1] * 6 * h(4) + 1.5, d[2] * 6 * h(4) + F.D[2] * 8];
        const ep = (a, out) => { ballistic(st, v0, [0, 1.5 - 3.5 * h(5), 0], 1.4, fx.wind, a, out); out[0] += noise1(a * 2 + h(6) * 30, 7) * 0.4 * a; out[2] += noise1(a * 2 + h(7) * 30, 8) * 0.4 * a; };
        ep(Math.max(0, ta - te - this.life * f0), pa); ep(ab, pb);
        const T = (1.35 - 0.55 * ab / this.emberLife) * (0.9 + 0.2 * h(8)) * this.P.temp;
        const flick = 0.6 + 0.4 * Math.abs(noise1(ab * 12 + h(9) * 50, 3)) * 2;
        this.embers.push(pa, pb, 0.008 + 0.01 * h(10), 0, flick, h(11), 0, [0, 0, 0], T);
      }
    }
    // lights follow the stream; heat haze rides above it
    const on = this.on(t);
    // the jet's light: each bin's emission (radiance x area of its tongues), corrected for
    // overlap (piled tongues hide each other: the summed area cannot exceed the stream's own
    // silhouette there), at its emission centroid - so the light on the ground / the creature
    // follows the flame's real brightness and flicker
    const segL = [0.18, 0.27, 0.55];
    this.lights.forEach((l, k) => {
      const B = bins[k];
      if (!(B.w > 0) || on < 0.001) { l.intensity = 0; l.visible = false; return; }
      const sil = this.L * segL[k] * this.W * (k === 0 ? 0.35 : k === 1 ? 0.7 : 0.9) + Math.PI * B.r * B.r;
      const ov = this.vol ? 1 : Math.min(1, sil / Math.max(B.A, 1e-6));
      const I = B.I.map((x) => x * ov * (this.o.lightScale ?? 1));
      const Y = 0.2126 * I[0] + 0.7152 * I[1] + 0.0722 * I[2];
      const p = [B.p[0] / B.w, B.p[1] / B.w, B.p[2] / B.w];
      const gy = fx.ground(p[0], p[2]);
      l.position.set(p[0], Math.max(p[1], gy + 0.3 + B.r * 0.5), p[2]);
      l.color.setRGB(I[0] / Math.max(Y, 1e-6), I[1] / Math.max(Y, 1e-6), I[2] / Math.max(Y, 1e-6));
      l.intensity = Y;
      l.distance = this.L * 3;
      l.visible = Y > 1e-4;
      if (this.o.debug) console.warn(`[fx] jet light ${k} Y=${Y.toFixed(2)} A=${B.A.toFixed(2)} sil=${sil.toFixed(2)} at=${p.map((x) => x.toFixed(1)).join(',')}`);
    });
    const F = this.frame(t);
    if (this.haze && on > 0.01) {
      for (let k = 0; k < 24; k++) {
        const x = (k + 0.5) / 24;
        const p = [F.O[0] + F.D[0] * this.L * x * 1.1, F.O[1] + F.D[1] * this.L * x + this.W * (0.4 + 0.5 * hash01(k, 1)), F.O[2] + F.D[2] * this.L * x * 1.1];
        this.haze.push(p, p, this.W * (0.5 + 0.6 * x), 0, on * 0.9, hash01(k, 2), 0, [1, 1, 1]);
      }
      this.haze.setTime(t);
    }
    if (cw > 0) fx.focus = [cx / cw, cy / cw, cz / cw];
    else if (this.focusV) fx.focus = this.focusV;
  }

  /** The stream's centreline: gas of age a (emitted at te = t - a from the mouth then). */
  centre(t, a, frameAt) {
    const te = t - a, F = frameAt(te), { O, D } = F;
    const L = this.L, W = this.W, f = a / this.life;
    const s = norm3(Math.abs(D[1]) > 0.95 ? cross3([1, 0, 0], D) : cross3([0, 1, 0], D)), u = cross3(D, s);
    const x = L * (1 - Math.exp(-3.0 * f)) / (1 - Math.exp(-3.0));
    const xf = x / L, tw = W * 0.42 * Math.min(1, f * 1.6);
    const tx = (noise1(xf * 3.1 - te * 2.4, this.seed + 1) + 0.6 * noise1(xf * 7.3 - te * 4.1, this.seed + 2)) * tw;
    const ty = (noise1(xf * 2.7 - te * 2.1, this.seed + 3) + 0.6 * noise1(xf * 6.9 - te * 3.7, this.seed + 4)) * tw;
    const p = [0, 0, 0];
    for (let k = 0; k < 3; k++) p[k] = O[k] + D[k] * x + s[k] * tx + u[k] * ty;
    p[1] += 0.14 * L * f * f;
    // tube radius: the spread of the stream plus the size of its billows (a narrow rod of
    // burning fuel at the mouth)
    let R = 0.7 * W * 0.5 * (0.08 + 0.92 * Math.pow(f, 1.3)) + 0.8 * (0.012 * L + 0.013 * L * smoothstep(0, 0.12, f) + 0.34 * W * Math.pow(f, 1.15));
    const gy = this.fx.ground(p[0], p[2]);
    if (p[1] - R * 0.4 < gy) {
      // the stream splashes along the ground: pushed up onto it, spread wider
      const pen = gy - (p[1] - R * 0.4);
      p[1] = gy + R * 0.4 + pen * 0.1;
      const hd = Math.hypot(D[0], D[2]) || 1;
      p[0] += D[0] / hd * pen * 0.6; p[2] += D[2] / hd * pen * 0.6;
      R *= 1 + 0.35 * pen / Math.max(R, 0.1);
    }
    // soot temperature along the stream (as a fraction of core - tip, x 1.25): white-hot fuel at
    // the mouth (~2250 K), orange within a fifth of the length (~1500 K), dark red and sooty by
    // the end (~1100 K); billow middles run a few hundred K above this, rims below
    const heat = 1.25 * (0.45 * Math.exp(-f / 0.07) + 0.55 * Math.pow(1 - f, 1.6));
    return { p, R, a, f, heat };
  }

  /** Volume mode: the centreline polyline for this frame + its light bins. */
  drawVolume(t, frameAt, bins) {
    const aLo = Math.max(0, t - this.t1), aHi = Math.min(this.life, t - this.t0);
    if (aHi - aLo < 0.004) { this.vol.set([], t, 0, 0); this.focusV = null; return; }
    // samples evenly spaced ALONG the stream (it is fast at the mouth, slow at the end)
    const n = JET_MAX, e3 = 1 - Math.exp(-3);
    const xa = (a) => (1 - Math.exp(-3 * a / this.life)) / e3;
    const x0 = xa(aLo), x1 = xa(aHi);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const xn = x0 + (x1 - x0) * i / (n - 1);
      const a = Math.min(aHi, Math.max(aLo, -Math.log(1 - xn * e3) * this.life / 3));
      pts.push(this.centre(t, a, frameAt));
    }
    const [ta, tb] = this.fx.shutter(t);
    this.vol.set(pts, t, this.o.zzNoBlur ? 0 : tb - ta, 1);
    // light: each stretch of the stream shows its radiance over its silhouette (2 R x length);
    // what is seen of it is its outer gas (cooler than its core, sooty rims late in the stream)
    let cx = 0, cy = 0, cz = 0, cw = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const A = pts[i], B = pts[i + 1];
      const len = Math.hypot(B.p[0] - A.p[0], B.p[1] - A.p[1], B.p[2] - A.p[2]);
      const R = 0.5 * (A.R + B.R), f = 0.5 * (A.f + B.f), heat = 0.5 * (A.heat + B.heat);
      const Tb = this.FP.tTip + (this.FP.tCore - this.FP.tTip) * clamp(heat / 1.25, 0, 1);
      const T = Tb - 110 - 160 * smoothstep(0.25, 0.65, f);
      const rad = flameRadiance(T, this.FP);
      const area = 2 * R * len * 0.8 * (1 - smoothstep(0.78, 1.0, f));
      const bin = f < 0.18 ? 0 : f < 0.45 ? 1 : 2, Bn = bins[bin];
      const Y = 0.2126 * rad[0] + 0.7152 * rad[1] + 0.0722 * rad[2];
      const m = [(A.p[0] + B.p[0]) / 2, (A.p[1] + B.p[1]) / 2, (A.p[2] + B.p[2]) / 2];
      for (let k = 0; k < 3; k++) { Bn.I[k] += rad[k] * area; Bn.p[k] += m[k] * Y * area; }
      Bn.A += area; Bn.w += Y * area; Bn.r = Math.max(Bn.r, R);
      cx += m[0] * Y * area; cy += m[1] * Y * area; cz += m[2] * Y * area; cw += Y * area;
    }
    this.focusV = cw > 0 ? [cx / cw, cy / cw, cz / cw] : null;
  }

  /** A scorch where the stream meets the ground (computed at the middle of the burn). */
  makeScorch(o) {
    const fx = this.fx;
    const tm = 0.5 * (this.t0 + this.t1);
    const F = this.frame(tm);
    let hit = null;
    for (let x = 0; x <= this.L * 1.2; x += 0.25) {
      const p = [F.O[0] + F.D[0] * x, F.O[1] + F.D[1] * x, F.O[2] + F.D[2] * x];
      if (p[1] <= fx.ground(p[0], p[2])) { hit = p; break; }
    }
    if (!hit) return;
    const sz = o.size ?? this.W * 1.6;
    const hd = Math.hypot(F.D[0], F.D[2]) || 1;
    this.scorchDecal = fx.add(new DecalEffect(fx, {
      kind: 'scorch', target: o.target ?? null, at: [hit[0] + F.D[0] / hd * sz * 0.2, hit[1] + 0.1, hit[2] + F.D[2] / hd * sz * 0.2], dir: [0, -1, 0],
      up: [F.D[0] / hd, 0, F.D[2] / hd], size: [sz, sz * 1.5, 1], t0: this.t0 + 0.2, seed: this.seed,
      opacity: 1, amount: o.amount ?? 0.85,
    }));
    // fade in with the burn
    const t0 = this.t0 + 0.1, t1 = this.t1;
    this.scorchDecal.uniforms.uOpacity.value = 0;
    const dec = this.scorchDecal, up = dec.update.bind(dec);
    dec.update = (t) => { up(t); dec.uniforms.uOpacity.value = smoothstep(t0, t1, t); };
  }
  dispose() { super.dispose(); this.vol?.dispose(); }
}

// ------------------------------------------------------------------ burning cloth / object --
/**
 * A burning object: a ray-marched flame volume (core/flamevol.js) standing on a patch of fuel,
 * with its light, a smoke plume / trail and embers. The flame's axis is buoyancy plus the RELATIVE
 * wind: on a still stake it stands up and leans with the breeze; on a rider in a 30 m/s slipstream
 * it is laid back into a long sheet streaming off the body (wider across the burning patch,
 * thin through it, faster gas, faster puffing), and the smoke streams behind.
 * o: { at (point / function / {object, offset}), t0, t1, size (m, patch radius), height (m),
 *      intensity (0..1 or fn), palette, normal (patch normal, for a sheet's orientation),
 *      lightScale, kappa, turb, sharp, steps, smoke: false, smokeRate, smokeLife }
 */
export class FireBurn extends Effect {
  constructor(fx, o = {}) {
    super(fx, { name: 'fx-fire-burn', ...o });
    this.P = paletteOf(o.palette);
    this.t1 = o.t1 ?? this.t0 + 3;
    this.size = o.size ?? 0.25;
    this.H = o.height ?? this.size * 4.2;
    this.vel = (te) => { const a = fx.at(o.at, te - 0.01), b = fx.at(o.at, te + 0.01); return [(b[0] - a[0]) / 0.02, (b[1] - a[1]) / 0.02, (b[2] - a[2]) / 0.02]; };
    // peak relative wind over the burn decides the sheet's proportions (fixed for the effect)
    let wmax = 0;
    for (let k = 0; k <= 16; k++) {
      const t = this.t0 + (Math.min(this.t1, this.t0 + 30) - this.t0) * k / 16, v = this.vel(t);
      wmax = Math.max(wmax, Math.hypot(fx.wind[0] - v[0], fx.wind[1] - v[1], fx.wind[2] - v[2]));
    }
    this.ub = o.buoyancy ?? 2.2 * Math.sqrt(9.81 * this.H);   // buoyant rise velocity scale (m/s)
    const sheet = clamp(wmax / 12, 0, 1);                     // 0 still air .. 1 slipstream
    this.sheet = sheet;
    const fpal = o.flamePalette ?? (o.palette === 'leaf' ? 'leaf' : 'burn');
    this.vol = new FlameVolume(fx, {
      name: 'fx-burn-flame', palette: fpal, seed: this.seed,
      R: [this.size * (1 + 0.2 * sheet), this.size * (1 - 0.55 * sheet)], H: this.H * (1 + 0.35 * sheet),
      v0: (o.v0 ?? 1.5) + 0.45 * wmax * sheet, acc: 3 + 30 * sheet,
      puffF: o.puffF ?? (1.5 / Math.sqrt(2 * this.size) + 0.12 * wmax * sheet / (2 * this.size)),
      kappa: o.kappa, turb: o.turb ?? 1.0, sharp: o.sharp, lift: o.lift ?? (0.08 - 0.05 * sheet), bend: o.bend ?? 0,
      steps: o.steps,
    });
    this.object.add(this.vol.mesh, this.vol.twin);
    this.light = new THREE.PointLight(new THREE.Color(...this.P.light), 0, 6, 2);
    this.object.add(this.light);
    fx.light.addPoint(this.light);
    this.smoke = o.smoke === false ? null : fx.add(new SmokePlume(fx, {
      kind: o.smokeKind || 'cloth', at: (t) => this.tipAt(t), t0: this.t0, t1: o.smokeT1 ?? this.t1 + (o.smolder ?? 1.5), inherit: 1, drag: o.smokeDrag ?? 3, rate: o.smokeRate ?? 45,
      size: this.size * 0.55, life: o.smokeLife ?? 4, selfShadow: false, seed: this.seed + 1, spread: this.size * 0.5,
      fade: (t) => 1 - 0.6 * smoothstep(this.t1, this.t1 + (o.smolder ?? 1.5), t),
    }));
    this.m0 = new THREE.Matrix4(); this.m1 = new THREE.Matrix4();
  }
  intensity(t) {
    const i = typeof this.o.intensity === 'function' ? this.o.intensity(t) : (this.o.intensity ?? 1);
    return i * smoothstep(this.t0, this.t0 + 0.15, t) * (1 - smoothstep(this.t1 - 0.3, this.t1, t));
  }
  /** The flame frame at time t: origin on the fuel, y = buoyancy + relative wind, x across the sheet. */
  frameAt(t, m) {
    const fx = this.fx, o = this.o;
    const p = fx.at(o.at, t), v = this.vel(t);
    const w = [fx.wind[0] - v[0], fx.wind[1] - v[1], fx.wind[2] - v[2]];
    const ax = norm3([w[0] * 0.55, this.ub + w[1] * 0.55, w[2] * 0.55]);
    // across: perpendicular to the axis and to the patch normal (or to the flow's side)
    let n = o.normal ? norm3(arr3(typeof o.normal === 'function' ? o.normal(t) : o.normal)) : null;
    let xa = n ? cross3(ax, n) : cross3(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
    if (len3(xa) < 1e-3) xa = cross3(ax, [0, 0, 1]);
    xa = norm3(xa);
    const za = cross3(xa, ax);
    m.makeBasis(new THREE.Vector3(...xa), new THREE.Vector3(...ax), new THREE.Vector3(...za));
    m.setPosition(p[0], p[1] - this.size * 0.35 * (1 - this.sheet), p[2]);
    return m;
  }
  /** Where the flame tips are (the smoke starts there). */
  tipAt(t) {
    const m = this.frameAt(t, new THREE.Matrix4());
    const v = new THREE.Vector3(0, this.vol.H * 0.85, 0).applyMatrix4(m);
    return [v.x, v.y, v.z];
  }
  draw(t) {
    const [ta, tb] = this.fx.shutter(t);
    const on = this.intensity(t);
    this.frameAt(ta, this.m0); this.frameAt(tb, this.m1);
    this.vol.pose(this.m0, this.m1, ta, tb, on);
    // the flame's light on its surroundings: its emission integrated over its volume
    if (on > 0.002) {
      const e = this.vol.emission(t, this.m1);
      const I = e.I.map((x) => x * on * (this.o.lightScale ?? 1));
      const Y = 0.2126 * I[0] + 0.7152 * I[1] + 0.0722 * I[2];
      this.light.position.set(...e.at);
      this.light.color.setRGB(I[0] / Math.max(Y, 1e-6), I[1] / Math.max(Y, 1e-6), I[2] / Math.max(Y, 1e-6));
      this.light.intensity = Y;
      this.light.distance = Math.max(6, this.H * 8);
      this.lumens = Y;
      if (this.o.debug) console.warn(`[fx] burn t=${t.toFixed(2)} I=${I.map((x) => x.toFixed(3)).join(',')} Y=${Y.toFixed(3)} at=${e.at.map((x) => x.toFixed(2)).join(',')}`);
    } else this.light.intensity = 0;
    this.light.visible = this.light.intensity > 1e-4;
  }
  dispose() { super.dispose(); this.vol.dispose(); }
}

/** Embers / sparks rising from a point (a burning stall, a fire's base). */
export class Embers extends Effect {
  constructor(fx, o = {}) {
    super(fx, { name: 'fx-embers', ...o });
    this.t1 = o.t1 ?? this.t0 + 10;
    this.rate = (o.rate ?? 25) * fx.tier.particles;
    this.life = o.life ?? 3;
    this.layerE = this.layer(new ParticleLayer(fx, { max: Math.ceil(this.rate * this.life) + 8, mode: 'glow', name: 'fx-embers', soft: 0.02, minPx: 0.8, shading: { gain: 1.0, core: 0.6 } }));
  }
  draw(t) {
    const fx = this.fx;
    const [ta, tb] = fx.shutter(t);
    const pa = [0, 0, 0], pb = [0, 0, 0];
    const [i0, i1] = liveRange(tb, this.t0, this.t1, this.rate, this.life);
    for (let i = i0; i <= i1; i++) {
      const te = this.t0 + (i + hash01(this.seed, i, 3)) / this.rate;
      if (te > tb || te > this.t1) continue;
      const h = (k) => hash01(this.seed * 433, i, k);
      const life = this.life * (0.4 + 0.6 * h(0));
      const ab = tb - te;
      if (ab > life) continue;
      const src = fx.at(this.o.at, te), R = this.o.radius ?? 0.3;
      const p0 = [src[0] + (h(1) - 0.5) * R * 2, src[1] + h(2) * R * 0.5, src[2] + (h(3) - 0.5) * R * 2];
      const v0 = [(h(4) - 0.5) * 1.5, 1.5 + 3 * h(5), (h(6) - 0.5) * 1.5];
      const ep = (a, out) => { ballistic(p0, v0, [0, 0.8 - 1.8 * h(7), 0], 0.9, fx.wind, a, out); out[0] += noise1(a * 1.7 + h(8) * 30, 4) * 0.6 * a; out[2] += noise1(a * 1.7 + h(9) * 30, 5) * 0.6 * a; };
      ep(Math.max(0, ta - te), pa); ep(ab, pb);
      const T = (1.3 - 0.6 * ab / life) * (0.9 + 0.2 * h(10));
      this.layerE.push(pa, pb, 0.006 + 0.01 * h(11), 0, 0.6 + 0.4 * Math.abs(noise1(ab * 10 + h(12) * 20, 6)) * 2, h(13), 0, [0, 0, 0], T);
    }
  }
}

/** Heat haze alone (over a fire bed, a scorched beam, hot stone). */
export class Shimmer extends Effect {
  constructor(fx, o = {}) {
    super(fx, { name: 'fx-shimmer', ...o });
    this.t1 = o.t1 ?? this.t0 + 30;
    this.layerS = this.layer(new ParticleLayer(fx, { max: 32, mode: 'shimmer', name: 'fx-shimmer', soft: 0.5, sort: false, shading: { shimmer: o.amount ?? 0.003 } }));
  }
  draw(t) {
    if (t < this.t0 || t > this.t1) return;
    const c = this.fx.at(this.o.at, t), s = this.o.size ?? 1.5;
    const on = smoothstep(this.t0, this.t0 + 0.5, t) * (1 - smoothstep(this.t1 - 0.5, this.t1, t));
    for (let k = 0; k < 12; k++) {
      const p = [c[0] + (hash01(k, 1) - 0.5) * s, c[1] + s * (0.3 + 1.2 * hash01(k, 2)), c[2] + (hash01(k, 3) - 0.5) * s];
      this.layerS.push(p, p, s * (0.4 + 0.4 * hash01(k, 4)), 0, on, hash01(k, 5), 0, [1, 1, 1]);
    }
    this.layerS.setTime(t);
  }
}

export function fireApi(fx) {
  return {
    jet: (o) => fx.add(new FireJet(fx, o)),
    burn: (o) => fx.add(new FireBurn(fx, o)),
    embers: (o) => fx.add(new Embers(fx, o)),
    shimmer: (o) => fx.add(new Shimmer(fx, o)),
    scorch: (o = {}) => fx.add(new DecalEffect(fx, { kind: 'scorch', dir: [0, -1, 0], size: [1.5, 1.5, 0.8], ...o })),
    char: (o = {}) => fx.add(new DecalEffect(fx, { kind: 'char', size: [0.5, 0.5, 0.4], ...o })),
    PALETTES: FIRE_PALETTES,
  };
}
