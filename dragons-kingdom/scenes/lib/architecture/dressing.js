// Architecture kit - set dressing that belongs to the buildings (the goods in a warehouse arch, the
// barrels on a quay, a crate by a door): coopered barrels, nailed crates, sacks, coiled hawsers,
// a hand cart. Built into a kit like everything else (one mesh per material).
//
//   barrel(kit, F, rnd, { h, r, onSide })   crate(kit, F, rnd, { w, d, h })   sack(kit, F, rnd)
//   coil(kit, F, rnd, { r, turns })          handcart(kit, F, rnd)
// F: the piece's footprint centre on the ground (y up).
import { block, sub, frame, tube, lathe, xf, grid } from './core.js';
import { member } from './timber.js';

/** A coopered barrel: staves (each its own tone, a little proud of the next), iron hoops. */
export function barrel(kit, F, rnd, o = {}) {
  const h = o.h ?? 0.82, r = o.r ?? 0.29;
  const Fb = o.onSide ? sub(F, [0, r * 1.02, 0], [0, 1, 0], [-1, 0, 0]) : F;
  const ns = 16;
  const bulge = (y) => r * (0.84 + 0.16 * Math.sin(Math.PI * (y / h)));
  for (let k = 0; k < ns; k++) {
    const a0 = (k / ns) * Math.PI * 2, a1 = ((k + 1) / ns) * Math.PI * 2 - 0.012;
    const out = rnd.range(0, 0.004);
    grid(kit.get(rnd() < 0.5 ? 'oak' : 'oakDark'), 2, 8, (u, v) => {
      const a = a0 + (a1 - a0) * u, y = v * h, rr = bulge(y) + out;
      return { p: xf(Fb, Math.cos(a) * rr, y, Math.sin(a) * rr), uv: [y, a * rr], seed: 0.1 + k * 0.05 + rnd() * 0.01, ao: 0.6 + 0.4 * Math.sin(Math.PI * v) };
    }, [0, 1, 0], true);
  }
  // heads (with the chime: set in a little)
  for (const y of [0.025, h - 0.025]) {
    const c = xf(Fb, 0, y, 0);
    const acc = kit.get('oakDark');
    const ci = acc.v(c[0], c[1], c[2], 0, 0, rnd(), 0.6, 0, 1, 0, 0);
    const ids = [];
    for (let k = 0; k <= 20; k++) { const a = (k / 20) * Math.PI * 2; const p = xf(Fb, Math.cos(a) * bulge(y) * 0.97, y, Math.sin(a) * bulge(y) * 0.97); ids.push(acc.v(p[0], p[1], p[2], Math.cos(a) * r, Math.sin(a) * r, rnd(), 0.7, 0, 1, 0, 0)); }
    for (let k = 0; k < 20; k++) { if (y > h / 2) acc.t(ci, ids[k + 1], ids[k]); else acc.t(ci, ids[k], ids[k + 1]); }
  }
  // hoops
  for (const f of [0.08, 0.22, 0.78, 0.92]) {
    const y = h * f, rr = bulge(y) + 0.006;
    const pts = [];
    for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2; pts.push(xf(Fb, Math.cos(a) * rr, y, Math.sin(a) * rr)); }
    tube(kit.get('iron'), pts, 0.006, { sides: 4 });
  }
}

/** A nailed crate of rough boards with corner battens. */
export function crate(kit, F, rnd, o = {}) {
  const w = o.w ?? 0.7, d = o.d ?? 0.5, h = o.h ?? 0.5;
  const mat = rnd() < 0.6 ? 'oakSilver' : 'oak';
  for (const [sx, sz, L, ax] of [[0, d / 2, w, [1, 0, 0]], [0, -d / 2, w, [1, 0, 0]], [w / 2, 0, d, [0, 0, 1]], [-w / 2, 0, d, [0, 0, 1]]]) {
    const nb = Math.max(2, Math.round(h / 0.16));
    for (let i = 0; i < nb; i++) {
      const y = (h * (i + 0.5)) / nb;
      const Fb = sub(F, [sx * 1.0, y, sz * 1.0], ax, [0, 1, 0]);
      block(kit.get(mat), Fb, L + 0.02, h / nb - 0.012, 0.02, { r: 0.004, seg: [0.3, 0.1, 0.02], seed: rnd(), noise: 0.002, chip: 0.006, axis: [1, 0, 0] });
    }
  }
  // lid boards and corner battens
  for (let i = 0; i < 3; i++) block(kit.get(mat), sub(F, [0, h + 0.01, -d / 2 + d * (i + 0.5) / 3]), w + 0.03, 0.02, d / 3 - 0.01, { r: 0.004, seg: [0.3, 0.02, 0.15], seed: rnd(), noise: 0.002, axis: [1, 0, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(kit.get('oakDark'), sub(F, [sx * (w / 2 + 0.005), h / 2, sz * (d / 2 + 0.005)]), 0.04, h, 0.04, { r: 0.004, seg: [0.04, 0.2, 0.04], seed: rnd(), axis: [0, 1, 0] });
}

/** A filled sack (sacking), slumped. */
export function sack(kit, F, rnd, o = {}) {
  const h = o.h ?? 0.62, r = o.r ?? 0.24;
  const ph = rnd() * 6;
  lathe(kit.get('sacking'), F, [[0, 0], [r * 0.9, 0.0], [r * 1.12, 0.08], [r * 1.08, h * 0.45], [r * 0.95, h * 0.75], [r * 0.55, h * 0.92], [r * 0.25, h], [r * 0.2, h + 0.08], [r * 0.32, h + 0.14], [0, h + 0.15]], 16, { seed: rnd(), wobble: 0.08 + 0.04 * Math.sin(ph) });
}

/** A coil of hawser lying on the ground. */
export function coil(kit, F, rnd, o = {}) {
  const r0 = o.r ?? 0.3, turns = o.turns ?? 6, rad = o.rad ?? 0.022;
  const pts = [];
  const n = turns * 18;
  for (let i = 0; i <= n; i++) { const a = (i / 18) * Math.PI * 2; const rr = r0 * (0.55 + 0.45 * (i / n)) + 0.01 * Math.sin(i * 0.7); pts.push(xf(F, Math.cos(a) * rr, rad + 0.004 * Math.sin(i * 0.31) + rad * 1.6 * Math.max(0, Math.sin(i * 0.05)), Math.sin(a) * rr)); }
  tube(kit.get('rope'), pts, rad, { sides: 6 });
}

/** A two-wheeled hand cart, its shafts down on the ground. */
export function handcart(kit, F, rnd, o = {}) {
  const W = 0.95, L = 1.4, R = 0.42;
  const tilt = Math.atan2(R + 0.08, L + 0.8);
  const Fc = sub(F, [0, R + 0.06, 0], [1, 0, 0], [0, Math.cos(tilt), Math.sin(tilt)]);
  for (let i = 0; i < 5; i++) block(kit.get('oakSilver'), sub(Fc, [0, 0.02, -L / 2 + L * (i + 0.5) / 5]), W, 0.03, L / 5 - 0.01, { r: 0.004, seg: [0.3, 0.03, 0.2], seed: rnd(), noise: 0.002, axis: [1, 0, 0] });
  for (const sx of [-1, 1]) {
    member(kit, sub(Fc, [sx * (W / 2 + 0.04), 0, 0], [0, 0, 1], [0, 1, 0]), [-L / 2 - 1.1, -0.02], [L / 2, -0.02], 0.08, 0.07, rnd, { mat: 'oakDark', proud: 0.035, bow: 0.0 });
    for (const y of [0.18, 0.34]) block(kit.get('oakSilver'), sub(Fc, [sx * (W / 2 + 0.01), y, 0], [0, 0, 1], [0, 1, 0]), L, 0.1, 0.025, { r: 0.004, seg: [0.3, 0.1, 0.025], seed: rnd(), axis: [1, 0, 0] });
    // the wheel
    const xc = sx * (W / 2 + 0.16), zc = 0.15;
    const ring = [];
    for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2; ring.push(xf(F, xc, R + Math.sin(a) * (R - 0.03), zc + Math.cos(a) * (R - 0.03))); }
    tube(kit.get('oakDark'), ring, 0.035, { sides: 6, up: [1, 0, 0] });
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; tube(kit.get('oakSilver'), [xf(F, xc, R + Math.sin(a) * 0.07, zc + Math.cos(a) * 0.07), xf(F, xc, R + Math.sin(a) * (R - 0.06), zc + Math.cos(a) * (R - 0.06))], 0.014, { sides: 5 }); }
    lathe(kit.get('oakDark'), frame(xf(F, xc, R, zc), [0, 1, 0], [sx, 0, 0]), [[0, -0.1], [0.07, -0.1], [0.08, 0], [0.065, 0.1], [0, 0.1]], 10, { seed: rnd() });
  }
  tube(kit.get('iron'), [xf(F, -W / 2 - 0.25, R, 0.15), xf(F, W / 2 + 0.25, R, 0.15)], 0.025, { sides: 6, caps: true });
}
