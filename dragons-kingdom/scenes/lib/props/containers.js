// Props library - coopered and woven containers, boxes, furniture and carts, built from their real
// parts so they hold up at 1:1 in 4K: barrels and buckets of separate tapered oak staves (bilge,
// chime, croze, head boards, bung), iron or bound-withy hoops; crates of nailed boards with gaps;
// baskets actually woven (stakes and over-under weavers, a rolled border, handles); trestle
// tables, benches, stools; a two-wheeled handcart with spoked wheels and iron tyres.
//
// Every function adds into a core.js Kit (builders keyed by material name - see MATS) in a frame F
// whose origin is on the ground (y up), and takes a seeded rnd(). Build with kit.build(mats(M)).
import * as THREE from 'three';
import { box, tube, lathe, fp, fd, sub, frame, yawFrame, clamp, smooth, hash, fbm, laidRope, sagLine } from './core.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Material map for kits built here (M = await propMaterials(ctx)). */
export function containerMats(M) {
  return {
    stave: M.wood.stave, oak: M.wood.oak, silver: M.wood.silver, pale: M.wood.pale, dark: M.wood.dark,
    withy: M.wood.withy, tar: M.wood.tar, iron: M.iron, ironDark: M.ironDark, rope: M.rope, hessian: M.hessian,
    leather: M.leather, linen: M.linen, straw: M.straw, clay: M.clay, glaze: M.clayGlaze, clayDark: M.clayDark,
  };
}

// --------------------------------------------------------------- coopering --
/**
 * A barrel / cask / keg: staves round a bilged profile. F: frame on the ground (or lying: pass a
 * frame whose y axis is the barrel's axis and whose origin is the bottom head's centre).
 * o: { h (0.8), r (0.27 at the heads), bilge (1.18: belly radius / head radius), staves (20),
 *   hoops: 'iron' | 'withy', bung (true), open (false: no top head - a tub), piece }
 */
export function barrel(kit, F, rnd, o = {}) {
  const H = o.h ?? 0.8, R0 = o.r ?? 0.27, bilge = o.bilge ?? 1.18, N = o.staves ?? Math.max(10, Math.round(2 * Math.PI * R0 / 0.085));
  const T = o.thick ?? 0.022, chime = o.chime ?? 0.025;
  const sb = kit.get('stave');
  const rAt = (y) => { const t = y / H; return R0 * (1 + (bilge - 1) * Math.sin(Math.PI * clamp(t, 0, 1))); };
  // per-stave width shares (staves are never all the same width)
  const w = []; let sum = 0;
  for (let k = 0; k < N; k++) { const v = 0.75 + 0.5 * rnd(); w.push(v); sum += v; }
  let a0 = rnd() * Math.PI * 2;
  const gap = 0.0011;                               // the joint between staves (m at the surface)
  const bungK = Math.floor(rnd() * N);
  const NY = 18;
  for (let k = 0; k < N; k++) {
    const da = (w[k] / sum) * Math.PI * 2;
    const aA = a0 + gap / R0, aB = a0 + da - gap / R0;
    const piece = (o.piece ?? 0) + k * 0.0371 + rnd() * 0.01;
    // a stave: outer face (curved across, bilged along), inner face, the two joint faces, the ends
    const NA = 4;
    const tilt = (rnd() - 0.5) * 0.004;            // staves sit a hair proud or sunk
    const faces = [];
    const P = (a, y, inset) => {
      const r = rAt(y) - inset + tilt * Math.sin(Math.PI * y / H);
      return fp(F, Math.cos(a) * r, y, Math.sin(a) * r);
    };
    const base = sb.count;
    // outer face grid (NA+1 across, NY+1 along)
    for (let j = 0; j <= NY; j++) {
      const y = -chime + (H + 2 * chime) * (j / NY);
      for (let i = 0; i <= NA; i++) {
        const a = aA + (aB - aA) * (i / NA);
        const edge = Math.min(i, NA - i) === 0 ? 1 : 0;
        const ao = 1 - 0.45 * edge;
        sb.v(P(a, y, edge * 0.0012), y, a * R0, piece, ao, edge ? 0.15 : 0.0);
      }
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NA; i++) {
      const p0 = base + j * (NA + 1) + i;
      sb.q(p0, p0 + NA + 1, p0 + NA + 2, p0 + 1);
    }
    // inner face (a tub's inside; in a closed cask it shows in the croze above the heads and
    // between the staves - without it the chime reads as loose teeth)
    {
      const b2 = sb.count;
      for (let j = 0; j <= NY; j++) {
        const y = -chime + (H + 2 * chime) * (j / NY);
        for (let i = 0; i <= NA; i++) { const a = aA + (aB - aA) * (i / NA); sb.v(P(a, y, T), y, a * R0 + 3, piece, 0.55, 0); }
      }
      for (let j = 0; j < NY; j++) for (let i = 0; i < NA; i++) { const p0 = b2 + j * (NA + 1) + i; sb.q(p0, p0 + 1, p0 + NA + 2, p0 + NA + 1); }
    }
    // end grain at both ends (the chime) - a narrow ring segment, bevelled inside
    for (const [y, s] of [[-chime, -1], [H + chime, 1]]) {
      const b3 = sb.count;
      for (let i = 0; i <= NA; i++) {
        const a = aA + (aB - aA) * (i / NA);
        sb.v(P(a, y, 0), 50 + a * R0, 0, piece, 0.75, 0.35);
        sb.v(P(a, y - s * 0.012, T), 50 + a * R0, T, piece, 0.6, 0.35);
      }
      for (let i = 0; i < NA; i++) { const p0 = b3 + i * 2; if (s > 0) sb.q(p0, p0 + 1, p0 + 3, p0 + 2); else sb.q(p0, p0 + 2, p0 + 3, p0 + 1); }
    }
    // joint faces (a little of the edge shows in the gaps)
    for (const [a, s] of [[aA, -1], [aB, 1]]) {
      const b4 = sb.count;
      for (let j = 0; j <= NY; j += 3) {
        const y = -chime + (H + 2 * chime) * (j / NY);
        sb.v(P(a, y, 0.0015), y, 0, piece, 0.12, 0);
        sb.v(P(a, y, T * 0.6), y, 0.01, piece, 0.05, 0);
      }
      const nj = Math.floor(NY / 3);
      for (let j = 0; j < nj; j++) { const p0 = b4 + j * 2; if (s > 0) sb.q(p0, p0 + 2, p0 + 3, p0 + 1); else sb.q(p0, p0 + 1, p0 + 3, p0 + 2); }
    }
    // the bung: a wooden plug in the widest stave at the belly, with a stain running down from it
    if (o.bung !== false && k === bungK && !o.open) {
      const am = (aA + aB) / 2, rr = rAt(H / 2);
      const c = fp(F, Math.cos(am) * (rr + 0.004), H / 2, Math.sin(am) * (rr + 0.004));
      const n = fd(F, Math.cos(am), 0, Math.sin(am));
      const Fb = frame(c, n, fd(F, 0, 1, 0));
      lathe(sb, { o: Fb.o, x: Fb.z, y: Fb.x, z: Fb.y }, [[0, -0.01], [0.021, -0.01], [0.022, 0.006], [0.018, 0.012], [0, 0.013]], { seg: 12, piece: piece + 0.3 });
    }
    a0 += da;
  }
  // heads: set in the croze 2 cm inside the chime - a disc of boards: one surface (the boards are
  // planed flush) with the joints between them as thin dark lines, the edge bevelled into the croze
  const heads = o.open ? [0.02] : [0.02, H - 0.02];
  const hb = kit.get(o.headMat || 'stave');
  for (const hy of heads) {
    const rr = rAt(hy) - T * 0.55;
    const top = hy > H / 2;
    lathe(hb, sub(F, [0, hy - (top ? 0 : 0.02), 0]), top ? [[rr, 0], [rr, 0.012], [rr * 0.96, 0.02], [0, 0.02]] : [[0, 0], [rr * 0.96, 0], [rr, 0.008], [rr, 0.02]], { seg: 36, piece: (o.piece ?? 0) + 0.5 + hy });
    const nb = 4 + Math.floor(rnd() * 2);
    for (let q = 1; q < nb; q++) {
      const z = -rr + (2 * rr * q) / nb + (rnd() - 0.5) * 0.01;
      const len = 2 * Math.sqrt(Math.max(0, rr * rr - z * z)) * 0.97;
      box(kit.get('tar'), sub(F, [0, hy + (top ? 0.0202 : -0.0002), z]), [len, 0.0006, 0.0022], { bevel: 0, seg: 0.2, piece: 0.9 });
    }
  }
  // hoops
  const hoopSet = o.hoops ?? 'iron';
  const groups = H > 0.5 ? [0.05, 0.22, 0.78, 0.95] : [0.08, 0.92];
  for (const f of groups) {
    const y = f * H;
    const r = rAt(y);
    if (hoopSet === 'iron') {
      // a flat band, slightly conical (driven on), a rivet where its ends overlap
      const hw = 0.032 + rnd() * 0.008;
      const base = kit.get('iron').count;
      const ib = kit.get('iron');
      const NS = 48;
      for (let i = 0; i <= NS; i++) {
        const a = (i / NS) * Math.PI * 2;
        for (const [dy, out] of [[-hw / 2, 0.0], [-hw / 2, 0.004], [hw / 2, 0.004], [hw / 2, 0.0]]) {
          const rr2 = rAt(y + dy) + out + 0.0005;
          ib.v(fp(F, Math.cos(a) * rr2, y + dy, Math.sin(a) * rr2), a * r, dy, 0.2 + f, 1, out > 0 && Math.abs(dy) > 0 ? 0.7 : 0.2);
        }
      }
      for (let i = 0; i < NS; i++) for (let e = 0; e < 3; e++) { const p0 = base + i * 4 + e; ib.q(p0, p0 + 1, p0 + 5, p0 + 4); }
    } else {
      // bound hoops: three split-withy hoops side by side, lashed with bark/withy at the overlap
      for (let q = 0; q < 3; q++) {
        const yy = y + (q - 1) * 0.013 * (f < 0.5 ? 1 : -1);
        const rr2 = rAt(yy) + 0.006;
        const pts = [];
        for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; pts.push(fp(F, Math.cos(a) * rr2, yy, Math.sin(a) * rr2)); }
        tube(kit.get('withy'), pts, 0.0065, { sides: 6, closed: true, seg: 0.03, piece: 0.3 + q * 0.1 + f });
      }
    }
  }
  return { rAt, H };
}

/** A stave bucket with a rope or iron bail handle. o: { h 0.32, r 0.15, hoops 'iron'|'withy', handle 'rope'|'iron', water (bool) } */
export function bucket(kit, F, rnd, o = {}) {
  const h = o.h ?? 0.32, r = o.r ?? 0.14;
  // a bucket tapers (wider at the top): use the barrel with a negative bilge via a sheared frame
  const res = barrel(kit, F, rnd, { h, r, bilge: 1.0, staves: o.staves ?? 14, hoops: o.hoops ?? 'iron', bung: false, open: true, chime: 0.012, thick: 0.016, piece: o.piece });
  // two lug staves with holes for the bail, the bail itself
  const lugY = h + 0.04;
  const sb = kit.get('stave');
  for (const s of [-1, 1]) box(sb, sub(F, [s * (r + 0.004), lugY - 0.03, 0]), [0.018, 0.1, 0.05], { grain: 'y', bevel: 0.004, piece: 0.8 });
  const hm = o.handle ?? 'rope';
  const pts = [];
  const up = o.bailUp ?? 0.0;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, a = Math.PI * t;
    pts.push(fp(F, -Math.cos(a) * (r + 0.012), lugY + Math.sin(a) * (r * 0.9 + up) * (hm === 'rope' ? 0.55 : 1), Math.sin(a) * 0.04 * (hm === 'rope' ? 1 : 0)));
  }
  if (hm === 'rope') tube(kit.get('rope'), pts, 0.007, { sides: 6, seg: 0.015 });
  else tube(kit.get('iron'), pts, 0.005, { sides: 6, seg: 0.015 });
  return res;
}

// ------------------------------------------------------------------ crates --
/**
 * A nailed board crate. o: { w 0.6, d 0.42, h 0.38, slats (true: gaps between the side boards),
 * lid ('none' | 'on' | 'leaning'), mat 'silver'|'pale'|'oak', broken (0..1: missing / split boards) }
 * Returns { inside: frame at the inside floor, w, d, h }.
 */
export function crate(kit, F, rnd, o = {}) {
  const W = o.w ?? 0.6, D = o.d ?? 0.42, H = o.h ?? 0.38, T = o.t ?? 0.018;
  const mat = kit.get(o.mat ?? 'silver');
  const iron = kit.get('ironDark');
  const nb = o.slats === false ? Math.max(2, Math.round(H / 0.13)) : Math.max(2, Math.round(H / 0.1));
  const gapF = o.slats === false ? 0.004 : 0.24;
  const bw = H / nb;
  const nail = (p, n) => {
    const Fn = frame(p, n, Math.abs(n.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0));
    lathe(iron, { o: Fn.o, x: Fn.z, y: Fn.x, z: Fn.y }, [[0.0045, -0.001], [0.0045, 0.0008], [0.002, 0.0016], [0, 0.0018]], { seg: 6, piece: rnd() });
  };
  const brk = o.broken ?? 0;
  // the four sides: horizontal boards
  const sides = [
    { c: [0, 0, D / 2 - T / 2], size: [W, T], axis: 'x', n: [0, 0, 1] },
    { c: [0, 0, -D / 2 + T / 2], size: [W, T], axis: 'x', n: [0, 0, -1] },
    { c: [W / 2 - T / 2, 0, 0], size: [D - 2 * T, T], axis: 'z', n: [1, 0, 0] },
    { c: [-W / 2 + T / 2, 0, 0], size: [D - 2 * T, T], axis: 'z', n: [-1, 0, 0] },
  ];
  for (const sd of sides) {
    for (let q = 0; q < nb; q++) {
      if (brk && rnd() < brk * 0.35) continue;              // a board missing
      const y = T + bw * (q + 0.5);
      const hh = bw * (1 - gapF) * (0.92 + 0.08 * rnd());
      const piece = rnd();
      const len = sd.size[0] * (brk && rnd() < brk * 0.3 ? 0.4 + 0.4 * rnd() : 1);
      const sz = sd.axis === 'x' ? [len, hh, T] : [T, hh, len];
      box(mat, sub(F, [sd.c[0], y, sd.c[2]], (rnd() - 0.5) * 0.01), sz, { grain: sd.axis === 'x' ? 'x' : 'z', bevel: 0.003, piece, noise: 0.0015, nf: 6, seg: 0.12, wearEdge: 0.015 });
      // two nails at each end of the board into the corner posts
      for (const e of [-1, 1]) for (const dy of [-hh * 0.25, hh * 0.25]) {
        const off = sd.size[0] / 2 - 0.02;
        const pos = sd.axis === 'x' ? [e * off, y + dy, sd.c[2] + sd.n[2] * T * 0.5] : [sd.c[0] + sd.n[0] * T * 0.5, y + dy, e * off];
        nail(fp(F, ...pos), fd(F, ...sd.n));
      }
    }
  }
  // corner posts (inside the corners) and the bottom boards
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(mat, sub(F, [sx * (W / 2 - T - 0.016), H / 2, sz * (D / 2 - T - 0.016)]), [0.032, H - 0.01, 0.032], { grain: 'y', bevel: 0.003, piece: rnd(), ao: () => 0.6 });
  const nf = Math.max(2, Math.round(W / 0.12));
  for (let q = 0; q < nf; q++) {
    const x = -W / 2 + (W * (q + 0.5)) / nf;
    box(mat, sub(F, [x, T / 2, 0]), [W / nf - 0.006, T, D], { grain: 'z', bevel: 0.002, piece: rnd(), ao: () => 0.7 });
  }
  // a lid: on (nailed boards with two battens) or leaning against the crate
  if (o.lid === 'on' || o.lid === 'leaning') {
    const LF = o.lid === 'on' ? sub(F, [0, H + T / 2 + 0.001, 0]) : sub(F, [W / 2 + 0.06, D * 0.45, 0.0], Math.PI / 2, 0, -1.25);
    for (let q = 0; q < nf; q++) {
      const x = -W / 2 + (W * (q + 0.5)) / nf;
      box(mat, sub(LF, [x, 0, 0]), [W / nf - 0.006, T, D], { grain: 'z', bevel: 0.003, piece: rnd() });
      for (const z of [-D / 2 + 0.06, D / 2 - 0.06]) nail(fp(LF, x, T / 2, z), fd(LF, 0, 1, 0));
    }
    for (const z of [-D / 2 + 0.06, D / 2 - 0.06]) box(mat, sub(LF, [0, -T, z]), [W - 0.08, T, 0.06], { grain: 'x', bevel: 0.003, piece: rnd() });
  }
  return { inside: sub(F, [0, T, 0]), w: W - 2 * T, d: D - 2 * T, h: H - T };
}

// ----------------------------------------------------------------- baskets --
/**
 * A woven willow basket, really woven: N stakes (upright rods) and weavers going in and out of
 * them (alternate rows offset), a rolled border, a woven base, optional handles.
 * o: { r (0.2 top), rb (0.15 base), h (0.22), kind 'round'|'oval' (oval: x scale), sx (1.0),
 *   handle: 'arch' | 'ears' | null, rows (h / 0.009), stakes (auto), tray (shallow) }
 * Returns { inside: frame at the inside bottom, rAt(y) }.
 */
export function basket(kit, F, rnd, o = {}) {
  const R1 = o.r ?? 0.2, R0 = o.rb ?? R1 * 0.75, H = o.h ?? 0.22, sx = o.sx ?? 1;
  const wb = kit.get('withy');
  const rAt = (y) => R0 + (R1 - R0) * Math.pow(clamp(y / H, 0, 1), 0.8);
  const rodR = o.rod ?? 0.0035;
  const N = (o.stakes ?? Math.round((2 * Math.PI * R1) / 0.032)) & ~1;   // even
  const rowH = o.rowH ?? rodR * 2.15;
  const rows = Math.floor((H - 0.012) / rowH);
  const XZ = (a, r) => [Math.cos(a) * r * sx, Math.sin(a) * r];
  // stakes
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2 + (rnd() - 0.5) * 0.02;
    const pts = [];
    for (let j = 0; j <= 6; j++) { const y = (H * j) / 6; const [x, z] = XZ(a, rAt(y)); pts.push(fp(F, x, y + 0.006, z)); }
    tube(wb, pts, rodR * 1.1, { sides: 5, seg: 0.04, piece: 0.2 + rnd() * 0.3 });
  }
  // weavers: each row goes in and out of the stakes; rows alternate (randed weave); a few rods
  // per row, joined where one ends and the next begins (the joins stick out a little)
  const SEG = N * 6;
  for (let j = 0; j < rows; j++) {
    const y = 0.012 + rowH * (j + 0.5);
    const r = rAt(y);
    const ph = (j % 2) * Math.PI;
    const piece = 0.4 + rnd() * 0.5;
    const pts = [];
    const start = rnd() * Math.PI * 2;
    for (let i = 0; i <= SEG; i++) {
      const a = start + (i / SEG) * Math.PI * 2;
      const io = Math.cos(a * N / 2 + ph + (start * N / 2)) * rodR * 1.6;     // in and out of the stakes
      const [x, z] = XZ(a, r + io + rodR * 0.2);
      pts.push(fp(F, x, y + Math.sin(a * 3 + j) * rodR * 0.25, z));
    }
    tube(wb, pts, rodR * (0.92 + 0.16 * rnd()), { sides: 5, segments: SEG, piece, wear: 0 });
  }
  // the border: stakes turned down and rolled into a thick plaited rim
  {
    const y = H + 0.004;
    for (let s = 0; s < 3; s++) {
      const pts = [];
      for (let i = 0; i <= N * 4; i++) {
        const a = (i / (N * 4)) * Math.PI * 2;
        const rr = rAt(H) + Math.cos(a * N / 2 + (s * 2 * Math.PI) / 3) * rodR * 1.3;
        const [x, z] = XZ(a, rr);
        pts.push(fp(F, x, y + Math.sin(a * N / 2 + (s * 2 * Math.PI) / 3) * rodR * 1.3, z));
      }
      tube(wb, pts, rodR * 1.35, { sides: 6, segments: N * 4, piece: 0.7 + s * 0.05 });
    }
  }
  // the base: rods laid across and a spiral weaver
  {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI;
      const [x, z] = XZ(a, R0 * 0.98);
      tube(wb, [fp(F, -x, 0.005, -z), fp(F, x, 0.005, z)], rodR * 1.1, { sides: 5, piece: 0.3 });
    }
    const pts = [];
    const turns = Math.floor(R0 / (rodR * 2.2));
    for (let i = 0; i <= turns * 40; i++) {
      const t = i / (turns * 40), a = t * turns * Math.PI * 2;
      const rr = 0.012 + (R0 - 0.012) * t;
      const [x, z] = XZ(a, rr);
      pts.push(fp(F, x, 0.006 + Math.cos(a * 6) * rodR * 0.6, z));
    }
    tube(wb, pts, rodR, { sides: 5, seg: 0.012, piece: 0.55 });
  }
  if (o.handle === 'arch') {
    // a bow handle of three twisted rods
    for (let s = 0; s < 3; s++) {
      const pts = [];
      for (let i = 0; i <= 30; i++) {
        const t = i / 30, a = Math.PI * t;
        const tw = (s / 3) * Math.PI * 2 + t * Math.PI * 6;
        pts.push(fp(F, -Math.cos(a) * rAt(H) * sx * 0.98 + Math.cos(tw) * rodR * 1.2, H + Math.sin(a) * (o.handleH ?? R1 * 1.1) + Math.sin(tw) * rodR * 1.2, Math.sin(tw) * rodR * 1.2));
      }
      tube(wb, pts, rodR * 1.25, { sides: 5, segments: 60, piece: 0.8 });
    }
  } else if (o.handle === 'ears') {
    for (const e of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 12; i++) { const a = Math.PI * (i / 12); pts.push(fp(F, e * (rAt(H) * sx + 0.004), H - 0.015 + Math.sin(a) * 0.05, -Math.cos(a) * 0.05)); }
      tube(wb, pts, rodR * 1.8, { sides: 6, seg: 0.01, piece: 0.85 });
    }
  }
  return { inside: sub(F, [0, 0.012, 0]), rAt, H, sx };
}

// --------------------------------------------------------------- furniture --
/** A trestle table: boards on two trestles. o: { w 1.8, d 0.7, h 0.76, mat } Returns the top frame. */
export function trestleTable(kit, F, rnd, o = {}) {
  const W = o.w ?? 1.8, D = o.d ?? 0.7, Hh = o.h ?? 0.76, mat = kit.get(o.mat ?? 'oak');
  const nb = Math.max(2, Math.round(D / 0.24));
  for (let q = 0; q < nb; q++) {
    const z = -D / 2 + (D * (q + 0.5)) / nb + (rnd() - 0.5) * 0.006;
    box(mat, sub(F, [(rnd() - 0.5) * 0.02, Hh - 0.017 + (rnd() - 0.5) * 0.003, z], (rnd() - 0.5) * 0.008), [W, 0.034, D / nb - 0.005], { grain: 'x', bevel: 0.004, piece: rnd(), noise: 0.002, nf: 2, seg: 0.2, wearEdge: 0.02 });
  }
  for (const x of [-W / 2 + 0.28, W / 2 - 0.28]) {
    // trestle: a top bar and two splayed legs each side
    box(mat, sub(F, [x, Hh - 0.06, 0]), [0.07, 0.07, D * 0.9], { grain: 'z', bevel: 0.006, piece: rnd(), ao: () => 0.7 });
    for (const s of [-1, 1]) {
      const top = fp(F, x, Hh - 0.08, s * D * 0.3), foot = fp(F, x + (rnd() - 0.5) * 0.02, 0, s * D * 0.42);
      box(mat, axisFrame2(top, foot), [top.distanceTo(foot), 0.055, 0.055], { grain: 'x', bevel: 0.006, piece: rnd() });
    }
    box(mat, sub(F, [x, 0.22, 0]), [0.045, 0.06, D * 0.78], { grain: 'z', bevel: 0.005, piece: rnd() });
  }
  return sub(F, [0, Hh, 0]);
}
function axisFrame2(a, b) {
  const X = b.clone().sub(a).normalize();
  let U = Math.abs(X.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
  const Z = new THREE.Vector3().crossVectors(X, U).normalize();
  const Y = new THREE.Vector3().crossVectors(Z, X);
  return { o: a.clone().add(b).multiplyScalar(0.5), x: X, y: Y, z: Z };
}

/** A plank bench with splayed legs. o: { w 1.5, h 0.45, d 0.26 } */
export function bench(kit, F, rnd, o = {}) {
  const W = o.w ?? 1.5, Hh = o.h ?? 0.45, D = o.d ?? 0.26, mat = kit.get(o.mat ?? 'oak');
  box(mat, sub(F, [0, Hh - 0.025, 0]), [W, 0.05, D], { grain: 'x', bevel: 0.007, piece: rnd(), noise: 0.002, nf: 2, seg: 0.2, wearEdge: 0.025 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const top = fp(F, sx * (W / 2 - 0.16), Hh - 0.04, sz * D * 0.22), foot = fp(F, sx * (W / 2 - 0.08), 0, sz * D * 0.42);
    tube(mat, [top, foot], (t) => 0.024 - 0.004 * t, { sides: 7, caps: true, piece: rnd() });
  }
}

/** A three-legged stool (round or square seat). */
export function stool(kit, F, rnd, o = {}) {
  const Hh = o.h ?? 0.42, R = o.r ?? 0.16, mat = kit.get(o.mat ?? 'oak');
  lathe(mat, sub(F, [0, Hh - 0.035, 0]), [[0, 0], [R * 0.97, 0], [R, 0.006], [R, 0.03], [R * 0.97, 0.036], [0, 0.036]], { seg: 24, piece: rnd(), rFn: (r, y, a) => r * (1 + 0.02 * Math.sin(a * 3 + 1)) });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.3;
    tube(mat, [fp(F, Math.cos(a) * R * 0.5, Hh - 0.03, Math.sin(a) * R * 0.5), fp(F, Math.cos(a) * R * 1.05, 0, Math.sin(a) * R * 1.05)], (t) => 0.02 - 0.003 * t, { sides: 7, caps: true, piece: rnd() });
  }
}

// ------------------------------------------------------------------- carts --
/** A spoked cart wheel in frame F (axis = F's z), radius R. */
export function wheel(kit, F, rnd, o = {}) {
  const R = o.r ?? 0.55, NS = o.spokes ?? 10, mat = kit.get(o.mat ?? 'oak');
  const tw = o.tyreW ?? 0.07;
  // felloes: 5 curved segments with joints, an iron tyre over them
  const nf = Math.max(4, Math.round(NS / 2));
  for (let k = 0; k < nf; k++) {
    const a0 = (k / nf) * Math.PI * 2 + 0.01, a1 = ((k + 1) / nf) * Math.PI * 2 - 0.01;
    const piece = rnd();
    const prof = [];
    for (let i = 0; i <= 8; i++) {
      const a = a0 + (a1 - a0) * (i / 8);
      prof.push(a);
    }
    const fb = mat;
    const base = fb.count;
    const ring = [[R - 0.075, -tw / 2], [R - 0.005, -tw / 2], [R - 0.005, tw / 2], [R - 0.075, tw / 2]];
    for (const a of prof) for (const [r, z] of ring) fb.v(fp(F, Math.cos(a) * r, Math.sin(a) * r, z), a * R, r + z, piece, 0.9, 0.3);
    for (let i = 0; i < prof.length - 1; i++) for (let e = 0; e < 4; e++) {
      const p0 = base + i * 4 + e, p1 = base + i * 4 + ((e + 1) % 4);
      fb.q(p0, p0 + 4, p1 + 4, p1);
    }
  }
  const ib = kit.get('iron');
  const base = ib.count;
  const NT = 72;
  for (let i = 0; i <= NT; i++) {
    const a = (i / NT) * Math.PI * 2;
    for (const [r, z] of [[R - 0.006, -tw / 2 - 0.002], [R + 0.008, -tw / 2], [R + 0.008, tw / 2], [R - 0.006, tw / 2 + 0.002]]) ib.v(fp(F, Math.cos(a) * r, Math.sin(a) * r, z), a * R, z, 0.3, 1, Math.abs(r - R) > 0.006 ? 0.8 : 0.2);
  }
  for (let i = 0; i < NT; i++) for (let e = 0; e < 3; e++) { const p0 = base + i * 4 + e; ib.q(p0, p0 + 4, p0 + 5, p0 + 1); }
  // hub (nave) and spokes
  lathe(mat, { o: fp(F, 0, 0, -0.16), x: F.x, y: F.z, z: fd(F, 0, -1, 0) }, [[0.03, 0], [0.07, 0.0], [0.085, 0.06], [0.095, 0.16], [0.085, 0.26], [0.07, 0.32], [0.03, 0.32]], { seg: 20, piece: rnd() });
  for (let k = 0; k < NS; k++) {
    const a = (k / NS) * Math.PI * 2;
    const p0 = fp(F, Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0.0), p1 = fp(F, Math.cos(a) * (R - 0.07), Math.sin(a) * (R - 0.07), 0.0);
    tube(mat, [p0, p1], (t) => 0.024 - 0.008 * t, { sides: 7, piece: rnd() });
  }
}

/** A two-wheeled handcart: bed of boards, low sides, shafts, axle, two spoked wheels. Returns the bed frame. */
export function handcart(kit, F, rnd, o = {}) {
  const L = o.l ?? 1.5, W = o.w ?? 0.95, R = o.r ?? 0.48, mat = 'oak';
  const bedY = R + 0.08;
  const tilt = o.tilt ?? -0.12;           // shafts resting on the ground tilt the bed forward
  const BF = sub(F, [0, bedY, 0], 0, 0, 0);
  const B = { o: BF.o, x: BF.x.clone().applyAxisAngle(BF.z, tilt), y: BF.y.clone().applyAxisAngle(BF.z, tilt), z: BF.z };
  const m = kit.get(mat);
  const nb = Math.round(W / 0.19);
  for (let q = 0; q < nb; q++) box(m, sub(B, [0, 0, -W / 2 + (W * (q + 0.5)) / nb]), [L, 0.03, W / nb - 0.005], { grain: 'x', bevel: 0.004, piece: rnd(), seg: 0.2 });
  for (const s of [-1, 1]) {
    // side boards on stakes, the shafts running under the bed and out in front
    box(m, sub(B, [0, 0.16, s * (W / 2 + 0.01)]), [L, 0.17, 0.025], { grain: 'x', bevel: 0.004, piece: rnd(), seg: 0.2 });
    for (const x of [-L / 2 + 0.06, 0, L / 2 - 0.06]) box(m, sub(B, [x, 0.1, s * (W / 2 + 0.035)]), [0.045, 0.3, 0.035], { grain: 'y', bevel: 0.005, piece: rnd() });
    box(m, sub(B, [0.6, -0.045, s * (W / 2 - 0.1)]), [L + 1.3, 0.07, 0.065], { grain: 'x', bevel: 0.008, piece: rnd(), seg: 0.25 });
  }
  for (const s of [-1, 1]) box(m, sub(B, [s * (L / 2 - 0.02), 0.11, 0]), [0.025, 0.17, W], { grain: 'z', bevel: 0.004, piece: rnd() });
  // axle and wheels
  box(m, sub(F, [-0.1, R, 0]), [0.09, 0.09, W + 0.3], { grain: 'z', bevel: 0.01, piece: rnd(), ao: () => 0.6 });
  for (const s of [-1, 1]) wheel(kit, { o: fp(F, -0.1, R, s * (W / 2 + 0.2)), x: F.x.clone().multiplyScalar(s), y: F.y.clone(), z: F.z.clone().multiplyScalar(s) }, rnd, { r: R, spokes: o.spokes ?? 10 });
  return { bed: sub(B, [0, 0.016, 0]), L, W };
}
