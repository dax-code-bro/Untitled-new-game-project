// Procedural spot-effect synthesis for the episode mix (sound/fx). Every sound is made here from seeded noise,
// impulse trains and decaying partials, in plain JavaScript: no recording, sample or download (manifest row
// "fx-procedural"). Deterministic: same id + seed + params = the same samples (mulberry32 PRNG, IEEE double maths).
//
//   import { SOUNDS, renderSound, SR } from './synth.mjs';
//   renderSound('step_stone', 7, { weight: 0.6 })  -> Float32Array (mono, 48 kHz, peak 1.0)
//
// Each recipe is (r, p) => Float32Array, r = seeded uniform [0,1), p = params from the spot sheet (fx/spots.json).
export const SR = 48000;

export function rng(seed) {
  let a = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = (s) => Math.max(1, Math.round(s * SR));
const buf = (s) => new Float32Array(N(s));
const lerp = (a, b, x) => a + (b - a) * x;
const rr = (r, a, b) => a + (b - a) * r();

// RBJ biquad, in place. type lp | hp | bp (0 dB peak)
function bq(x, type, f, q = 0.707) {
  f = Math.min(f, SR * 0.45);
  const w = 2 * Math.PI * f / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al, a1 = -2 * c / a0, a2 = (1 - al) / a0;
  b0 /= a0; b1 /= a0; b2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i], y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}
const chain = (x, ...fs) => { for (const [t, f, q] of fs) bq(x, t, f, q); return x; };
function white(s, r) { const x = buf(s); for (let i = 0; i < x.length; i++) x[i] = 2 * r() - 1; return x; }
function envelope(x, fn) { for (let i = 0; i < x.length; i++) x[i] *= fn(i / SR); return x; }
function mix(dst, src, at = 0, g = 1) {
  const o = Math.round(at * SR);
  for (let i = 0; i < src.length; i++) { const j = i + o; if (j >= 0 && j < dst.length) dst[j] += src[i] * g; }
  return dst;
}
// parallel resonators (bandpasses) summed: a "body"
function body(x, modes) {
  const out = new Float32Array(x.length);
  for (const [f, q, g] of modes) mix(out, bq(Float32Array.from(x), 'bp', f, q), 0, g);
  return out;
}
// sparse impulses: rate(t) per second, amp(t)
function impulses(s, r, rate, amp = () => 1) {
  const x = buf(s);
  for (let i = 0; i < x.length; i++) { const t = i / SR; if (r() < rate(t) / SR) x[i] = (r() < 0.5 ? -1 : 1) * amp(t) * (0.2 + 0.8 * r() * r()); }
  return x;
}
// stick-slip pulse train (creaks): rate(t) Hz, jittered period, amp(t)
function stickSlip(s, r, rate, amp = () => 1, jitter = 0.25) {
  const x = buf(s); let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR; ph += rate(t) / SR * (1 + jitter * (r() - 0.5));
    if (ph >= 1) { ph -= 1; x[i] = amp(t) * (0.6 + 0.4 * r()); }
  }
  return x;
}
// decaying partials (metal, ceramic)
function partials(s, freqs, tau, r) {
  const x = buf(s);
  for (const f0 of freqs) {
    const f = f0 * (1 + 0.02 * (r() - 0.5)), a = 0.4 + 0.6 * r(), ta = tau * (0.6 + 0.8 * r()), ph = r() * 6.283;
    for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] += a * Math.exp(-t / ta) * Math.sin(6.283185307 * f * t + ph); }
  }
  return x;
}
const decay = (tau, att = 0.001) => (t) => (t < att ? t / att : Math.exp(-(t - att) / tau));
// smooth random bumps (rustles, breaths' unevenness)
function bumps(r, dur, n, width) {
  const c = Array.from({ length: n }, () => [rr(r, 0.1, 0.9) * dur, 0.4 + 0.6 * r(), width * (0.6 + 0.8 * r())]);
  return (t) => Math.min(1.5, c.reduce((s, [m, a, w]) => s + a * Math.exp(-(((t - m) / w) ** 2)), 0));
}
const fadeEdges = (x, a = 0.004, b = 0.02) => envelope(x, (t) => Math.min(1, t / a, (x.length / SR - t) / b));

// ---------- primitives that recipes share ----------
function thump(s, f0, f1, tau, r) { // pitched low thump with a fast pitch drop
  const x = buf(s); let ph = 0;
  for (let i = 0; i < x.length; i++) { const t = i / SR, f = f1 + (f0 - f1) * Math.exp(-t / 0.02); ph += f / SR; x[i] = Math.sin(6.283185307 * ph) * Math.exp(-t / tau); }
  return mix(x, chain(envelope(white(s, r), decay(tau * 0.5)), ['lp', 400]), 0, 0.3);
}
function tick(r, f = 3500, q = 4, tau = 0.01) { // ceramic / shell tick
  const x = envelope(white(0.06, r), decay(0.0015, 0.0002));
  const y = body(x, [[f, q, 1], [f * 1.62, q * 1.3, 0.7], [f * 2.37, q, 0.4]]);
  return envelope(y, decay(tau * 3, 0.0003));
}
function clink(r, base = 2600, tau = 0.06) { // a chain link / buckle against metal
  const x = partials(0.25, [1, 1.73, 2.41, 3.12, 4.26].map((k) => base * k), tau, r);
  envelope(x, decay(tau, 0.0004));
  return mix(x, chain(envelope(white(0.02, r), decay(0.002)), ['hp', 3000]), 0, 0.6);
}
function breathNoise(r, dur, shape, lo, hi, q = 0.8) { // shaped band noise; shape(t/dur) 0..1
  const x = white(dur, r);
  const centre = Math.sqrt(lo * hi);
  chain(x, ['hp', lo], ['lp', hi], ['bp', centre, q]);
  const fl = bumps(r, dur, 6, dur / 8);
  return envelope(x, (t) => shape(t / dur) * (0.85 + 0.25 * fl(t)));
}

// ---------- the recipes ----------
export const SOUNDS = {
  // footsteps. weight 0..1 (heel force), soft: softer sole
  step_stone(r, p) {
    const w = p.weight ?? 0.6, x = buf(0.35);
    const heel = chain(envelope(white(0.05, r), decay(0.006 + 0.004 * (p.soft ?? 0))), ['bp', rr(r, 1500, 2300), 1.0], ['hp', 250]);
    mix(x, heel, 0, 0.5 + 0.5 * w);
    mix(x, thump(0.12, rr(r, 140, 180), rr(r, 80, 100), 0.02, r), 0, 0.32 * w);
    mix(x, chain(envelope(white(0.06, r), decay(0.012)), ['bp', rr(r, 2600, 3600), 1.2]), rr(r, 0.05, 0.09), 0.35); // toe
    mix(x, chain(impulses(0.08, r, () => 900, decay(0.03)), ['hp', 3500]), 0.01, 0.25); // grit
    return bq(x, 'hp', 60);
  },
  step_straw(r, p) {
    const d = p.dur ?? 0.32, x = buf(d + 0.1);
    mix(x, chain(impulses(d, r, (t) => 1400 * Math.exp(-t / (d * 0.4)), (t) => Math.min(1, t / 0.01)), ['bp', rr(r, 3000, 4200), 0.7], ['hp', 1200]), 0, 1);
    mix(x, chain(envelope(white(d, r), decay(d * 0.3, 0.01)), ['bp', 2200, 0.6]), 0, 0.25);
    mix(x, thump(0.1, 110, 70, 0.03, r), 0, 0.25 * (p.weight ?? 0.5));
    return x;
  },
  step_wood(r, p) { // boots on timber stair: hollow body modes + click, optional creak
    const w = p.weight ?? 0.7, x = buf(0.6);
    const hit = envelope(white(0.12, r), decay(0.005));
    mix(x, body(hit, [[rr(r, 140, 170), 9, 1.4], [rr(r, 310, 360), 10, 1.0], [rr(r, 650, 760), 7, 0.6], [1500, 3, 0.3]]), 0, 0.8 * w);
    mix(x, chain(envelope(white(0.03, r), decay(0.003)), ['hp', 2000]), 0, 0.35);
    mix(x, thump(0.15, 120, 60, 0.04, r), 0, 0.4 * w);
    if ((p.creak ?? 0.5) > r()) { const c = stickSlip(0.25, r, (t) => lerp(35, 70, t / 0.25), (t) => Math.sin(Math.PI * t / 0.25)); mix(x, body(c, [[420, 6, 1], [930, 5, 0.6]]), 0.08, 0.5); }
    return x;
  },
  step_turf(r, p) {
    const x = buf(0.4);
    mix(x, thump(0.15, 100, 55, 0.035, r), 0, 0.7 * (p.weight ?? 0.6));
    mix(x, chain(envelope(white(0.2, r), decay(0.05, 0.008)), ['bp', rr(r, 2200, 3200), 0.6]), 0.01, 0.35);
    mix(x, chain(impulses(0.15, r, () => 500, decay(0.05)), ['hp', 2500]), 0.01, 0.3);
    return x;
  },
  knee_stone(r) { const x = SOUNDS.step_stone(r, { weight: 1, soft: 1 }); bq(x, 'lp', 2500); return mix(x, SOUNDS.cloth(r, { dur: 0.5 }), 0.02, 0.4); },
  // cloth / gown / linen. dur, heavy (lower band)
  cloth(r, p) {
    const d = p.dur ?? 0.8, hv = p.heavy ?? 0;
    const x = chain(white(d, r), ['hp', 400 - 200 * hv], ['lp', 7000 - 3500 * hv], ['bp', 2000 - 1000 * hv, 0.5]);
    const b = bumps(r, d, Math.max(2, Math.round(d * 5)), 0.08 + 0.1 * hv);
    envelope(x, (t) => b(t) * Math.min(1, t / 0.03, (d - t) / 0.08));
    mix(x, chain(impulses(d, r, (t) => 300 * b(t), () => 1), ['hp', 4000]), 0, 0.12);
    return x;
  },
  hide_rub(r, p) { const x = SOUNDS.cloth(r, { dur: p.dur ?? 1.0, heavy: 1 }); return bq(x, 'lp', 2500); },
  // metal
  chain_rattle(r, p) { // chains on the riding rig: n link hits over dur
    const d = p.dur ?? 0.45, n = p.links ?? 7, x = buf(d + 0.3), base = p.base ?? rr(r, 2100, 2800);
    for (let i = 0; i < n; i++) mix(x, clink(r, base * rr(r, 0.85, 1.2), rr(r, 0.04, 0.09)), d * Math.pow(r(), 0.8), rr(r, 0.3, 1));
    return mix(x, chain(white(d, r), ['bp', 5000, 1.5]).map((v, i) => v * Math.exp(-i / SR / (d * 0.5))), 0, 0.05);
  },
  buckle(r, p) {
    const x = buf(0.6);
    mix(x, clink(r, rr(r, 3200, 3900), 0.03), 0, 1);
    mix(x, clink(r, rr(r, 2800, 3400), 0.025), rr(r, 0.06, 0.12), 0.6);
    return mix(x, SOUNDS.leather(r, { dur: 0.3 }), 0.1, 0.6);
  },
  leather(r, p) { // creak: low-rate stick-slip through leather body modes
    const d = p.dur ?? 0.5, lo = p.lo ?? 25, hi = p.hi ?? 70;
    const c = stickSlip(d, r, (t) => lerp(lo, hi, Math.sin(Math.PI * t / d)), (t) => Math.sin(Math.PI * t / d) ** 0.7);
    return body(c, [[rr(r, 700, 900), 4, 1], [rr(r, 1500, 1900), 3.5, 0.6], [3200, 2, 0.25]]);
  },
  rope_creak(r, p) { return bq(SOUNDS.leather(r, { dur: p.dur ?? 0.9, lo: 12, hi: 40 }), 'lp', 2500); },
  // breath. size 0 (hatchling) .. 1 (Charcoal); kind exhale | inhale
  breath(r, p) {
    const sz = p.size ?? 0.5, d = p.dur ?? lerp(0.4, 3.6, sz), inh = p.kind === 'inhale';
    const shape = inh ? (u) => Math.sin(Math.PI / 2 * Math.min(1, u / 0.85)) * Math.min(1, (1 - u) / 0.15) : (u) => Math.min(1, u / 0.12) * Math.pow(1 - u, 1.4);
    const x = buf(d + 0.05);
    mix(x, breathNoise(r, d, shape, lerp(700, 120, sz), lerp(4500, 900, sz), 0.6), 0, 1); // airflow
    mix(x, breathNoise(r, d, shape, lerp(2000, 900, sz), lerp(7000, 3500, sz), 0.9), 0, 0.25); // hiss of nostrils
    if (sz > 0.6) { const rum = chain(white(d, r), ['lp', 70], ['lp', 70]); mix(x, envelope(rum, (t) => shape(t / d) * 6 * (sz - 0.6)), 0, 1); }
    return x;
  },
  hatchling_strain(r, p) { // faint effortful sound: breathy voiced push, formant-filtered (not cute, not monstrous)
    const d = p.dur ?? 0.45, x = buf(d + 0.05);
    const v = stickSlip(d, r, (t) => lerp(170, 140, t / d), (t) => Math.sin(Math.PI * t / d) ** 1.5, 0.15);
    mix(x, body(v, [[600, 4, 1], [1100, 5, 0.6], [2600, 4, 0.25]]), 0, 1);
    return mix(x, SOUNDS.breath(r, { size: 0.05, dur: d }), 0, 0.8);
  },
  weight_shift(r, p) { // a big body settling: deep thud, ground creak, turf crunch
    const sz = p.size ?? 1, d = p.dur ?? 1.2, x = buf(d + 0.4);
    mix(x, envelope(chain(white(d, r), ['lp', 110], ['lp', 90]), (t) => Math.min(1, t / 0.12) * Math.exp(-t / (d * 0.35))), 0, 4 * sz);
    const c = stickSlip(d * 0.8, r, (t) => lerp(10, 26, t / d), (t) => Math.sin(Math.PI * t / (d * 0.8)));
    mix(x, body(c, [[190, 4, 1], [420, 4, 0.5]]), 0.1, 0.5);
    mix(x, chain(impulses(d * 0.6, r, (t) => 700 * Math.exp(-t / 0.3), () => 1), ['bp', 1800, 0.7]), 0.05, 0.2);
    return x;
  },
  claws_turf(r, p) {
    const x = buf(0.6);
    for (let i = 0; i < (p.n ?? 3); i++) { mix(x, SOUNDS.step_turf(r, { weight: 0.4 }), i * rr(r, 0.1, 0.16), 0.6); mix(x, tick(r, rr(r, 2000, 2600), 3, 0.006), i * 0.13 + 0.01, 0.15); }
    return x;
  },
  snort(r, p) {
    const d = p.dur ?? 0.3, x = breathNoise(r, d, (u) => Math.min(1, u / 0.05) * Math.pow(1 - u, 2), 500, 3500, 0.7);
    return envelope(x, (t) => 0.6 + 0.4 * Math.sin(6.283 * 28 * t));
  },
  // the egg
  egg_scratch(r, p) { // a claw scraping the inside of the shell: strokes of dense grit through a hollow shell body
    const strokes = p.strokes ?? 3, x = buf(1.6);
    let t0 = 0;
    for (let k = 0; k < strokes; k++) {
      const d = rr(r, 0.18, 0.34);
      const g = impulses(d, r, (t) => lerp(900, 2600, Math.sin(Math.PI * t / d)), (t) => Math.sin(Math.PI * t / d));
      const s = body(g, [[rr(r, 2600, 3400), 2.5, 1], [rr(r, 4800, 5600), 3, 0.6], [rr(r, 850, 1000), 6, 0.8]]);
      mix(x, bq(s, 'lp', 5000), t0, rr(r, 0.6, 1)); t0 += d + rr(r, 0.06, 0.2);
    }
    return x;
  },
  shell_tick(r, p) { return tick(r, rr(r, 3200, 4200), 4, p.tau ?? 0.01); },
  shell_crack(r, p) { // a crack running: accelerating ticks + a fine crunch
    const d = p.dur ?? 0.5, x = buf(d + 0.1);
    let t = 0, gap = d / 4;
    while (t < d) { mix(x, tick(r, rr(r, 2800, 4600), 4, 0.006), t, rr(r, 0.4, 1)); t += gap * rr(r, 0.5, 1.2); gap *= 0.72; if (gap < 0.008) gap = 0.008; }
    return mix(x, chain(impulses(d, r, (u) => 2000 * u / d, () => 1), ['hp', 2500]), 0, 0.3);
  },
  shell_creak(r, p) { // shell flexing under pressure
    const d = p.dur ?? 1.0;
    const c = stickSlip(d, r, (t) => lerp(18, 55, (t / d) ** 1.5), (t) => Math.min(1, t / 0.1) * Math.min(1, (d - t) / 0.05), 0.35);
    const x = body(c, [[rr(r, 1100, 1400), 7, 1], [rr(r, 2300, 2700), 6, 0.6], [520, 5, 0.4]]);
    return mix(x, tick(r), d - 0.02, 0.7);
  },
  shell_break(r, p) { // a piece breaks away and fragments land on the bedding
    const x = buf(1.6);
    mix(x, SOUNDS.shell_crack(r, { dur: 0.25 }), 0, 1);
    mix(x, chain(envelope(white(0.15, r), decay(0.03)), ['bp', 1800, 0.8]), 0.25, 0.8);
    for (let i = 0; i < (p.fragments ?? 4); i++) mix(x, SOUNDS.fragment_click(r, {}), 0.35 + rr(r, 0, 0.7), rr(r, 0.3, 0.8));
    return x;
  },
  fragment_click(r) { const x = buf(0.4); mix(x, tick(r, rr(r, 2400, 3600), 3, 0.005), 0, 1); return mix(x, SOUNDS.step_straw(r, { dur: 0.15, weight: 0 }), 0.005, 0.25); },
  wet_scrape(r, p) { // wet membrane against shell: low squelch modulation + gritty scrape
    const d = p.dur ?? 0.8, x = chain(white(d, r), ['bp', 900, 1.2], ['lp', 3000]);
    const ph = rr(r, 0, 6), fm = rr(r, 14, 22);
    envelope(x, (t) => Math.sin(Math.PI * t / d) * (0.5 + 0.5 * Math.sin(6.283 * fm * t + ph + 3 * Math.sin(6.283 * 3 * t))) ** 2);
    return mix(x, SOUNDS.egg_scratch(r, { strokes: 1 }), d * 0.2, 0.4);
  },
  // air
  wind_grass(r, p) { // a gust through long grass (dur, from bright to dull)
    const d = p.dur ?? 4, x = chain(white(d, r), ['hp', 900], ['lp', 9000], ['bp', 3200, 0.4]);
    const b = bumps(r, d, Math.max(3, Math.round(d * 2)), d / 6);
    return envelope(x, (t) => Math.sin(Math.PI * t / d) * (0.5 + 0.5 * b(t)));
  },
  wingbeat(r, p) { // one huge downstroke: pressure whoomp + sub + membrane flap
    const d = p.dur ?? 1.4, x = buf(d + 0.2);
    mix(x, envelope(chain(white(d, r), ['lp', 160], ['lp', 160]), (t) => Math.min(1, (t / 0.3) ** 2) * Math.exp(-Math.max(0, t - 0.3) / 0.35)), 0, 5);
    mix(x, thump(0.8, 50, 28, 0.25, r), 0.22, 0.5);
    mix(x, SOUNDS.cloth(r, { dur: 0.5, heavy: 1 }), 0.12, 0.4);
    return x;
  },
  wingbeat_light(r, p) { // Leaf in flight: one quick stroke, a "fwup" (not wind): faint pre-swell, a fast push that peaks at
    // dur*up (the spot rows' `at` assume the peak there), a quick decay, and a membrane flutter on top.
    // (s7) measured vs the s6 version (sound/PROGRESS.md): rise 10-90 % 185 -> ~45 ms, width above -12 dB 350 -> ~150 ms,
    // energy no longer parked at 250-500 Hz where flight_wind lives (that version read as a gust, not a wing)
    const d = p.dur ?? 0.45, up = p.up ?? 0.35, pk = d * up, a = 0.045, len = pk + 0.45, x = buf(len);
    const push = chain(white(len, r), ['hp', 110], ['hp', 110], ['lp', 900], ['lp', 1300]);
    mix(x, envelope(push, (t) => (t < pk - a ? 0.1 * (t / (pk - a)) ** 2 : t < pk ? 0.1 + 0.9 * ((t - pk + a) / a) ** 1.5 : Math.exp(-(t - pk) / 0.07))), 0, 4);
    const fh = rr(r, 20, 27), fl = chain(white(len, r), ['hp', 1000], ['lp', 4200]);
    mix(x, envelope(fl, (t) => (t < pk - 0.035 ? 0 : Math.min(1, (t - pk + 0.035) / 0.03) * Math.exp(-Math.max(0, t - pk) / 0.06)) * Math.abs(Math.sin(Math.PI * fh * t)) ** 3), 0, 3.2);
    mix(x, thump(0.3, 150, 85, 0.045, r), pk - 0.025, 0.3);
    mix(x, bq(SOUNDS.cloth(r, { dur: 0.16 }), 'hp', 700), pk - 0.012, 0.45);
    return fadeEdges(x, 0.002, 0.06);
  },
  air_rush(r, p) { // flight air: a gust past the riders / camera (dur; `dark` 0..1 lowers it; `whistle` adds a thin tone)
    const d = p.dur ?? 3, dk = p.dark ?? 0.3, x = chain(white(d, r), ['hp', 60], ['lp', lerp(5000, 1200, dk)], ['bp', lerp(1100, 380, dk), 0.35]);
    const b = bumps(r, d, Math.max(3, Math.round(d * 1.5)), d / 5);
    envelope(x, (t) => Math.pow(Math.sin(Math.PI * t / d), 1.5) * (0.45 + 0.55 * b(t)));
    if (p.whistle) {
      const f0 = rr(r, 900, 1300), wv = buf(d); let ph = 0;
      for (let i = 0; i < wv.length; i++) { const t = i / SR; ph += f0 * (1 + 0.04 * Math.sin(6.283 * 0.6 * t)) / SR; wv[i] = Math.sin(6.283185307 * ph) * Math.pow(Math.sin(Math.PI * t / d), 3) * (0.5 + 0.5 * b(t)); }
      mix(x, wv, 0, 0.02 * p.whistle);
    }
    return x;
  },
  // harbour (s7, X4): all synthesised
  gull(r, p) { // a herring-gull-like yelp series "kyow kyow": 2:1 FM voice (nasal harmonics) with a rasp, two formants
    // (2.1 / 3.3 kHz), rise-then-fall pitch per call, the last call longer; n calls; `far` 0..1 dulls it
    const n = p.n ?? 2, far = p.far ?? 0.5, x = buf(n * 0.62 + 0.4);
    let t0 = 0;
    for (let k = 0; k < n; k++) {
      const d = rr(r, 0.22, 0.34) * (k === n - 1 ? 1.45 : 1), fp = rr(r, 720, 960) * (1 - 0.04 * k), y = buf(d);
      let ph = 0;
      for (let i = 0; i < y.length; i++) {
        const t = i / SR, u = t / d, f = fp * (u < 0.22 ? 0.7 + 0.3 * Math.sin(Math.PI / 2 * u / 0.22) : 1 - 0.32 * (u - 0.22) / 0.78);
        ph += f / SR;
        const m = Math.sin(6.283185307 * ph) * (2.4 - 0.9 * u);
        y[i] = Math.sin(6.283185307 * 2 * ph + m) * (1 + 0.4 * (2 * r() - 1)) * Math.min(1, t / 0.01) * Math.pow(1 - u, 0.5);
      }
      const z = buf(d); mix(z, bq(Float32Array.from(y), 'bp', 2100, 2.2), 0, 1); mix(z, bq(Float32Array.from(y), 'bp', 3300, 3), 0, 0.6); mix(z, y, 0, 0.2);
      mix(x, z, t0, 1 - 0.12 * k); t0 += d + rr(r, 0.06, 0.16);
    }
    return chain(x, ['hp', 450], ['lp', lerp(9000, 2600, far)]);
  },
  lark(r, p) { // (s9) a distant skylark-like song over the terraces: a run of quick pure chirps (2.6-5.6 kHz), each a fast
    // up/down FM sweep 30-90 ms with 8-30 ms gaps, in phrases; `dur` s of song, `far` 0..1 dulls / thins it
    const d = p.dur ?? 2.5, far = p.far ?? 0.6, x = buf(d + 0.2);
    let t0 = rr(r, 0, 0.05);
    while (t0 < d) {
      const nd = rr(r, 0.03, 0.09), f0 = rr(r, 2600, 5600), sw = rr(r, -0.35, 0.35), y = buf(nd);
      let ph = 0;
      for (let i = 0; i < y.length; i++) {
        const u = i / y.length, f = f0 * (1 + sw * Math.sin(Math.PI * u)) * (1 + 0.04 * Math.sin(2 * Math.PI * 70 * u * nd));
        ph += f / SR; y[i] = Math.sin(6.283185307 * ph) * Math.sin(Math.PI * u) ** 1.5;
      }
      const phrase = 0.55 + 0.45 * Math.sin(2 * Math.PI * t0 / rr(r, 0.9, 1.4));
      mix(x, y, t0, phrase * rr(r, 0.5, 1)); t0 += nd + rr(r, 0.008, 0.03) + (r() < 0.06 ? rr(r, 0.12, 0.25) : 0);
    }
    return chain(x, ['hp', 1800], ['lp', lerp(9000, 4500, far)]);
  },
  bleat(r, p) { // (s9) a goat/sheep "meh-eh-eh" off on the terraces: glottal pulse (sawtooth) at ~300-420 Hz with a 6-8 Hz
    // tremolo + vibrato, through "eh" formants (650 / 1700 / 2600 Hz), falling slightly; `far` 0..1 dulls it
    const d = p.dur ?? rr(r, 0.6, 0.85), far = p.far ?? 0.6, f0 = p.f0 ?? rr(r, 300, 420), tr = rr(r, 6, 8), y = buf(d);
    let ph = 0;
    for (let i = 0; i < y.length; i++) {
      const t = i / SR, u = t / d, w = Math.sin(2 * Math.PI * tr * t);
      ph += f0 * (1 - 0.12 * u) * (1 + 0.025 * w) / SR;
      y[i] = (2 * (ph % 1) - 1) * (0.65 + 0.35 * w) * Math.min(1, t / 0.04) * Math.pow(1 - u, 0.6) * (1 + 0.15 * (2 * r() - 1));
    }
    const x = buf(d + 0.1);
    mix(x, bq(Float32Array.from(y), 'bp', 650, 3), 0, 1); mix(x, bq(Float32Array.from(y), 'bp', 1700, 4), 0, 0.7); mix(x, bq(Float32Array.from(y), 'bp', 2600, 5), 0, 0.3);
    return chain(x, ['hp', 200], ['lp', lerp(6000, 2200, far)]);
  },
  boat_bell(r, p) { // a small bronze ship's bell struck n times `every` s apart: hum + inharmonic strike partials (beating), clapper tick
    const n = p.n ?? 2, ev = p.every ?? 0.42, f = p.f ?? 880, far = p.far ?? 0.5, x = buf((n - 1) * ev + 3.2);
    const P = [[0.5, 2.6, 0.45], [1, 1.6, 1], [1.19, 1.2, 0.6], [1.5, 0.9, 0.45], [2, 0.7, 0.5], [2.66, 0.45, 0.3], [3.18, 0.3, 0.22], [4.1, 0.18, 0.12]];
    for (let k = 0; k < n; k++) {
      const y = buf(3);
      for (const [q, tau, am] of P) {
        const fq = f * q * (1 + 0.003 * (r() - 0.5)), ph = r() * 6.283, bt = 0.6 + 1.5 * r();
        for (let i = 0; i < y.length; i++) { const t = i / SR; y[i] += am * Math.exp(-t / tau) * Math.sin(6.283185307 * fq * t + ph) * (1 + 0.08 * Math.sin(6.283185307 * bt * t)); }
      }
      mix(y, tick(r, 4200, 3, 0.004), 0, 0.6);
      mix(x, envelope(y, (t) => Math.min(1, t / 0.0015)), k * ev, k ? 0.8 : 1);
    }
    return bq(x, 'lp', lerp(10000, 3000, far));
  },
  fish_slap(r, p) { // wet fish dropped into a wicker basket: soft wet thud + splat + a few squelch clicks + wicker crunch; n over `dur`
    const n = p.n ?? 1, d = p.dur ?? 0, x = buf(d + 0.5);
    for (let k = 0; k < n; k++) {
      const t0 = n > 1 ? Math.min(d, d * k / (n - 1) + rr(r, -0.12, 0.12) * d / n) : 0, w = rr(r, 0.6, 1), y = buf(0.4);
      mix(y, thump(0.25, rr(r, 170, 220), rr(r, 80, 100), 0.03, r), 0, 0.45 * w);
      mix(y, chain(envelope(white(0.12, r), decay(0.018, 0.001)), ['bp', rr(r, 900, 1400), 0.9], ['hp', 400]), 0.002, 3.0 * w);
      for (let j = 0; j < 3; j++) mix(y, chain(envelope(white(0.02, r), decay(0.003, 0.0005)), ['bp', rr(r, 1800, 3200), 3]), 0.01 + j * rr(r, 0.012, 0.03), 0.4 * w);
      mix(y, SOUNDS.step_straw(r, { dur: 0.12, weight: 0 }), 0.01, 0.3);
      mix(x, y, Math.max(0, t0), 1);
    }
    return x;
  },
  rope_strain(r, p) { // a heavy wet hawser taking load: slow groaning stick-slip that tightens (rate rises), fibre crackle; `dur`
    const d = p.dur ?? 3, x = buf(d);
    const g = stickSlip(d, r, (t) => lerp(18, 55, Math.pow(t / d, 1.3)) * (1 + 0.25 * Math.sin(6.283 * 0.45 * t)), (t) => Math.min(1, t / 0.4, (d - t) / 0.3) * (0.6 + 0.4 * Math.sin(6.283 * 0.31 * t + 1)), 0.35);
    mix(x, body(g, [[rr(r, 140, 170), 5, 1], [rr(r, 330, 380), 5, 0.7], [rr(r, 720, 800), 4, 0.35]]), 0, 1);
    const fib = stickSlip(d, r, () => 140 + 60 * r(), (t) => 0.3 * Math.min(1, t / 0.4, (d - t) / 0.3) * Math.pow(t / d, 0.7), 0.9);
    return mix(x, bq(fib, 'bp', 2600, 2), 0, 0.5);
  },
  net_drip(r, p) { // water streaming off a hauled net into the sea: thin trickle + droplets (rising-chirp bubble blips); `dur`, `rate`/s
    const d = p.dur ?? 4, dens = p.rate ?? 14, x = buf(d + 0.2), edge = (t) => Math.min(1, t / 0.5, Math.max(0, d - t) / 0.5);
    mix(x, envelope(chain(white(d, r), ['hp', 1500], ['lp', 6000]), (t) => 0.12 * edge(t) * (0.7 + 0.3 * Math.sin(6.283 * 0.7 * t))), 0, 1);
    let t = 0;
    while ((t += -Math.log(1 - r()) / dens) < d) {
      const f0 = rr(r, 700, 1800), td = rr(r, 0.012, 0.03), y = buf(td * 4); let ph = 0;
      for (let i = 0; i < y.length; i++) { const s = i / SR; ph += f0 * (1 + s / td) / SR; y[i] = Math.sin(6.283185307 * ph) * Math.exp(-s / td); }
      mix(x, y, t, rr(r, 0.15, 0.6) * edge(t));
    }
    return x;
  },
  dragon_call(r, p) { // a creature call. size 1 = Leaf: quick, bright two-part "kree-ip" (rise, a tiny break, a higher falling
    // tail); size > 1 = a bigger animal (the quay dragon's answer): lower, longer, rougher, with chest rumble.
    // 2:1-free FM voice (index ~2.5: rich harmonics) through two formants + breath noise; `far` 0..1 dulls
    const sz = p.size ?? 1, d = (p.dur ?? 0.55) * sz, f0 = (p.f ?? 560) / sz, F1 = 1500 / Math.sqrt(sz), F2 = 3000 / Math.sqrt(sz);
    const x = buf(d + 0.1), v = buf(d), rough = sz > 1.2 ? 0.45 : 0.2; let ph = 0;
    for (let i = 0; i < v.length; i++) {
      const t = i / SR, u = t / d, two = u >= 0.62, sg = two ? (u - 0.62) / 0.38 : u / 0.62;
      const f = two ? f0 * (1.35 - 0.3 * sg) : f0 * (0.82 + 0.38 * Math.sin(Math.PI / 2 * sg));
      ph += f * (1 + 0.03 * Math.sin(6.283185307 * 11 * t)) / SR;
      const env = Math.min(1, t / 0.02) * (1 - 0.85 * Math.exp(-(((u - 0.62) / 0.03) ** 2))) * (two ? Math.pow(1 - sg, 0.7) : 0.75 + 0.25 * sg);
      v[i] = Math.sin(6.283185307 * ph + Math.sin(6.283185307 * ph) * (2.5 + 0.8 * Math.sin(Math.PI * u))) * env * (1 + rough * (2 * r() - 1));
    }
    mix(x, bq(Float32Array.from(v), 'bp', F1, 2), 0, 1); mix(x, bq(Float32Array.from(v), 'bp', F2, 2.5), 0, 0.6); mix(x, v, 0, 0.2);
    mix(x, envelope(chain(white(d, r), ['bp', F1 * 1.4, 1.2]), (t) => 0.25 * Math.sin(Math.PI * t / d)), 0, 1);
    if (sz > 1.2) mix(x, envelope(chain(white(d, r), ['lp', 300]), (t) => 0.5 * Math.sin(Math.PI * t / d)), 0, 1);
    return bq(x, 'lp', lerp(9000, 2500, p.far ?? 0));
  },
  walla(r, p) { // distant wordless crowd talk (a PLACEHOLDER for recorded walla): `voices` speakers, each phrases of syllables:
    // a glottal sawtooth (f0 95-140 / 170-235 Hz, falling over the phrase) through three vowel formants that change per
    // syllable, consonant noise ticks, pauses between phrases. Deep 3-6 Hz syllable modulation is what makes it read as
    // talk rather than hiss. `far` 0..1 dulls; `pause` [t0, t1, depth] dips everyone (people glance up and carry on)
    const d = p.dur ?? 5, nv = p.voices ?? 6, far = p.far ?? 0.5, x = buf(d);
    const V = [[730, 1090, 2440], [530, 1840, 2480], [300, 2200, 3000], [570, 840, 2410], [440, 1020, 2240], [660, 1720, 2410], [490, 1350, 2500]];
    for (let k = 0; k < nv; k++) {
      const hi = r() < 0.5, fb = hi ? rr(r, 170, 235) : rr(r, 95, 140), lvl = rr(r, 0.35, 1);
      let t = rr(r, 0, 1.2);
      while (t < d - 0.2) {
        const ns = 3 + Math.floor(r() * 9);
        for (let s = 0; s < ns && t < d - 0.2; s++) {
          const sd = rr(r, 0.12, 0.26), v = V[Math.floor(r() * V.length)], f = fb * (1.15 - 0.3 * s / ns) * rr(r, 0.95, 1.08), y = buf(sd);
          let ph = 0;
          for (let i = 0; i < y.length; i++) { ph += f / SR; if (ph >= 1) ph -= 1; y[i] = 2 * ph - 1; }
          bq(y, 'lp', 3500);
          const z = buf(sd);
          for (let j = 0; j < 3; j++) mix(z, bq(Float32Array.from(y), 'bp', v[j] * (hi ? 1.15 : 1), 5 + 2 * j), 0, [1, 0.6, 0.3][j]);
          envelope(z, (tt) => Math.pow(Math.sin(Math.PI * tt / sd), 1.5));
          if (r() < 0.55) mix(z, envelope(chain(white(0.05, r), ['bp', rr(r, 2500, 5500), 2]), decay(0.012, 0.002)), 0, 0.25);
          mix(x, z, t, lvl); t += sd + rr(r, 0, 0.05);
        }
        t += rr(r, 0.25, 1.4);
      }
    }
    if (p.pause) { const [a, b, dp] = p.pause; envelope(x, (t) => 1 - dp * Math.max(0, Math.min(1, (t - a) / 0.25, (b - t) / 0.4))); }
    return chain(x, ['hp', 120], ['lp', lerp(5000, 1800, far)]);
  },
  // doors and wood
  knock(r, p) { // a knuckle on a heavy wooden door; short: the second knock cut off
    const x = buf(0.5), hit = envelope(white(0.1, r), decay(0.003));
    mix(x, body(hit, [[rr(r, 180, 210), 8, 1.4], [rr(r, 430, 480), 8, 1], [950, 5, 0.5], [2100, 3, 0.25]]), 0, 1);
    if (p.short) envelope(x, (t) => (t < 0.035 ? 1 : Math.exp(-(t - 0.035) / 0.006)));
    return x;
  },
  latch(r) { // iron latch: lift click + bar drop clack
    const x = buf(0.5);
    mix(x, clink(r, 1800, 0.02), 0, 0.6);
    mix(x, partials(0.3, [1150, 2240, 3580], 0.05, r).map((v, i) => v * Math.exp(-i / SR / 0.04)), rr(r, 0.11, 0.16), 1);
    return mix(x, SOUNDS.knock(r, { short: true }), 0.12, 0.3);
  },
  door(r, p) { // heavy door: hinge creak, then the thud of it meeting the frame (close) or none (open)
    const d = p.creak ?? 0.7, x = buf(d + 0.6);
    const c = stickSlip(d, r, (t) => lerp(14, 32, Math.sin(Math.PI * t / d)), (t) => Math.sin(Math.PI * t / d));
    mix(x, body(c, [[rr(r, 280, 340), 6, 1], [rr(r, 650, 760), 6, 0.6], [1500, 4, 0.2]]), 0, 0.6);
    if (p.close !== false) { mix(x, thump(0.4, 90, 50, 0.08, r), d, 1); mix(x, SOUNDS.knock(r, {}), d, 0.4); }
    return x;
  },
  pipe_tap(r) { const x = buf(0.6); for (let i = 0; i < 3; i++) mix(x, body(envelope(white(0.05, r), decay(0.002)), [[rr(r, 1300, 1600), 6, 1], [2900, 5, 0.5]]), i * rr(r, 0.12, 0.17), 1 - 0.2 * i); return x; },
  runners(r, p) { // the stair drawn back on its wooden runners: grinding
    const d = p.dur ?? 3;
    const g = stickSlip(d, r, (t) => 30 + 15 * Math.sin(6.283 * 0.7 * t) + 10 * r(), (t) => Math.min(1, t / 0.3, (d - t) / 0.3), 0.6);
    const x = body(g, [[220, 3, 1], [480, 3, 0.7], [1100, 2, 0.4]]);
    return mix(x, envelope(chain(white(d, r), ['lp', 1500], ['hp', 120]), (t) => Math.min(1, t / 0.3, (d - t) / 0.3)), 0, 0.15);
  },
};

// render one sound, normalised to peak 1 (the spot sheet's gain_db is the peak level)
export function renderSound(id, seed, p = {}) {
  const f = SOUNDS[id];
  if (!f) throw new Error(`fx: no sound "${id}" (have ${Object.keys(SOUNDS).join(', ')})`);
  const x = fadeEdges(f(rng(seed), p));
  let pk = 0; for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i]));
  if (pk > 0) for (let i = 0; i < x.length; i++) x[i] /= pk;
  return x;
}
