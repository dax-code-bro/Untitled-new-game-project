// Architecture kit - Cling (village within Scrapper): the festival square and its fixed escape
// geography. Positions follow the shot list's cling_map (shotlist.json conventions.cling_map)
// as staged in the provisional style frame F5 (scenes/lookdev/style-f5-cling-square.js):
// seen from the king's steps (south edge, looking north) the stone arch is screen LEFT (west),
// the gate to the broad road screen RIGHT (east), the vendor stall left-centre with the alley
// behind it, the music space right-centre, the fountain with its central stone pillar in the
// middle, a separate stone support beside the steps (screen right). Sun behind the steps.
//
//   import { clingSquare, CLING } from '../lib/architecture/cling.js';
//   const set = await clingSquare(ctx, { lod: 'mid', focus: [x, z] });   // { group, houses, layout }
//   scene.add(set.group);
//
// Builders usable on their own: archway, gateway, fountain, stonePier, kingsSteps, alley.
import * as THREE from 'three';
import { Kit, frame, yawFrame, sub, makeRand, block, tube, xf, lathe, fbm3, grid } from './core.js';
import { masonryFace, masonryBox, courses, archRing, steps, LOD } from './masonry.js';
import { house } from './house.js';
import { door } from './openings.js';
import { member } from './timber.js';
import { gableRoof } from './roof.js';
import { archMaterials } from './materials.js';
import { stain, grimeBand } from './weathering.js';
import { barrel, crate, sack, handcart } from './dressing.js';

/** The fixed layout (metres; y up; north = -z; the steps at the south edge). */
export const CLING = {
  square: { x0: -20, x1: 20, z0: -18, z1: 24 },
  fountain: { x: 0, z: -2, r: 3.0, pillarH: 3.4 },
  steps: { x: 4, z: 18.0, w: 14, n: 7, rise: 0.24, tread: 1.0 },          // rising to the south
  // the stone support, screen right of the steps: a broad pier (2.6 m across its north face) whose
  // centre sits 0.4 m east of round 1's 12.9 so that it clears the steps' east cheek wall (x 11.6)
  support: { x: 13.3, z: 19.4 },
  arch: { x: -19.6, z: 16.5, yaw: Math.PI / 2, w: 3.6, h: 5.4 },           // west side, facing east into the square
  gate: { x: 20.4, z: 4.75, yaw: -Math.PI / 2, w: 4.4, pier: 1.5 },          // east side, the broad road beyond
  alley: { x: -8.6, z: -18, w: 2.6 },                                     // north row gap behind the vendor stall
  stall: { x: -8.5, z: 3 }, music: { x: 7, z: 1.5 },                      // (props: other builders)
  watchman: { x: -1.6, z: 11.8 },
};

/**
 * A freestanding stone archway (escape route 1): two piers, a voussoir arch through the full
 * depth (its soffit visible underneath), stones on both faces, a coping on top.
 * F: frame at the centre of the passage at ground level; the arch faces +z (and -z).
 */
export function archway(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 71);
  const W = o.width ?? 7.2, H = o.height ?? 7.0, T = o.depth ?? 1.2;
  const aw = o.w ?? 3.6, ah = o.h ?? 5.4;
  const lod = o.lod || 'mid';
  // the voussoirs run through the whole depth and stand proud of both faces
  const op = { x: W / 2 - aw / 2, y: 0, w: aw, h: ah, reveal: T / 2 + 0.01, archDepth: T + 0.032, jambW: 0.42 };
  // one bonded block of masonry: the voussoirs pass through the full depth (their soffit shows
  // under the arch), dressed jambs from both faces, quoins at the four corners
  masonryBox(kit, F, {
    w: W, d: T, h: H, T, style: 'squared', mat: 'stoneGrey', dressedMat: 'stoneDressed', mortar: 'mortar', lod, seed: rnd() * 999,
    courseMin: 0.24, courseMax: 0.36, plinth: 0.42, quoin: { long: 0.6, short: 0.38 },
    faces: { front: { openings: [{ ...op, head: 'arch' }] }, back: { openings: [{ ...op, head: 'archOpen' }] } },
  });
  // coping: weathered slabs with a shallow ridge, projecting, a drip
  const n = Math.ceil(W / 0.9);
  for (let i = 0; i < n; i++) {
    const x0 = -W / 2 - 0.08 + (W + 0.16) * i / n, x1 = -W / 2 - 0.08 + (W + 0.16) * (i + 1) / n - 0.01;
    block(kit.get('stoneDressed'), sub(F, [(x0 + x1) / 2, H + 0.12, 0]), x1 - x0, 0.24, T + 0.2, {
      r: 0.02, rs: 1, seg: [0.2, 0.12, 0.25], seed: rnd(), noise: 0.004, nf: 5, chip: 0.012,
      warp: (lx, ly, lz) => [lx, ly + (ly > 0 ? 0.07 * (1 - Math.abs(lz) / ((T + 0.2) / 2)) : 0), lz],
    });
  }
  return { W, H, T, opening: { w: aw, h: ah } };
}

/**
 * The gate to the broad road (escape route 2): a town gate, 4.4 m clear between two massive
 * squared-stone piers 5 m high, an oak head beam bearing on them under a little tiled roof, the
 * town wall (3.6 m, coped) running on to the houses either side; a pair of heavy ledged-and-braced
 * oak leaves (braces rising from the hinge side) on iron strap hinges and pintles, standing open
 * against the inside of the wall; a stop stone in the middle of a threshold of big flags worn into
 * two wheel ruts. F: centre of the opening at ground level, the road at -z, the square at +z.
 */
export function gateway(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 81);
  const w = o.w ?? 4.4, ph = o.pierH ?? 4.6, pw = o.pierW ?? 1.5;
  const lod = o.lod || 'mid';
  const L = LOD[lod];
  const beamY = ph + 0.2;
  for (const sx of [-1, 1]) {
    const cx = sx * (w / 2 + pw / 2);
    masonryBox(kit, sub(F, [cx, 0, 0]), { w: pw, d: pw, h: ph, T: pw / 2, style: 'squared', mat: 'stoneGrey', dressedMat: 'stoneDressed', mortar: 'mortar', lod, seed: rnd() * 999, courseMin: 0.24, courseMax: 0.42, plinth: 0.45, quoin: { long: 0.62, short: 0.42 } });
    // a cap course over each pier
    block(kit.get('stoneDressed'), sub(F, [cx, ph + 0.1, 0]), pw + 0.14, 0.2, pw + 0.14, { r: 0.025, rs: 1, seg: [0.15, 0.1, 0.15], seed: rnd(), noise: 0.005, nf: 5, chip: 0.03, warp: (lx, ly, lz) => [lx, ly + (ly > 0 ? 0.06 * (1 - Math.max(Math.abs(lx), Math.abs(lz)) / ((pw + 0.14) / 2)) : 0), lz] });
    // pintles leaded into the pier's inner face (the leaves hang on them, square side)
    for (const y of [0.45, 1.95, 3.45]) {
      const p0 = xf(F, sx * (w / 2 + 0.06), y, 0.42), p1 = xf(F, sx * (w / 2 - 0.035), y, 0.42);
      tube(kit.get('iron'), [p0, p1], 0.022, { sides: 6, caps: true });
      tube(kit.get('iron'), [xf(F, sx * (w / 2 - 0.035), y - 0.05, 0.42), xf(F, sx * (w / 2 - 0.035), y + 0.06, 0.42)], 0.018, { sides: 6, caps: true });
      stain(kit, sub(F, [sx * (w / 2), 0, 0.42], [0, 0, sx], [0, 1, 0]), 0.0, y - 0.04, 0.12, rnd.range(0.4, 0.8), 'rust', { strength: 0.6, seed: rnd(), z: 0.015 });
    }
    // the town wall running on to the houses (rubble, coped), stone on both faces
    const wl = o.wall ?? 3.6, wh = 3.6, wt = 0.75;
    if (wl > 0) {
      const xa = sx > 0 ? w / 2 + pw : -w / 2 - pw - wl;
      masonryBox(kit, sub(F, [xa + wl / 2, 0, 0.0]), { w: wl, d: wt, h: wh, T: wt / 2, style: 'rubble', mat: 'stoneGrey', dressedMat: 'stoneDressed', mortar: 'mortar', lod, seed: rnd() * 999, courseMin: 0.18, courseMax: 0.32, noQuoins: true, faces: { left: { skip: sx > 0 }, right: { skip: sx < 0 } } });
      const nc = Math.max(1, Math.round(wl / 0.8));
      for (let k = 0; k < nc; k++) {
        const a = xa + (wl * k) / nc, b = xa + (wl * (k + 1)) / nc - 0.012;
        block(kit.get('stoneDressed'), sub(F, [(a + b) / 2 + rnd.sym(0.005), wh + 0.08, rnd.sym(0.01)], [1, 0, rnd.sym(0.01)], [0, 1, 0]), b - a, 0.16, wt + 0.14, { r: rnd.range(0.015, 0.03), rs: 1, seg: [0.2, 0.08, 0.2], seed: rnd(), noise: 0.004, nf: 5, chip: 0.03, warp: (lx, ly, lz) => [lx, ly + (ly > 0 ? 0.06 * (1 - Math.abs(lz) / ((wt + 0.14) / 2)) : 0), lz] });
      }
    }
  }
  // the head beam: a big oak beam lying across both pier caps, a plate on it, a little tiled roof
  // over the whole gate
  const BW = w + 2 * pw + 0.1;
  member(kit, sub(F, [0, beamY, 0], [1, 0, 0], [0, 1, 0]), [-BW / 2, 0.22], [BW / 2, 0.22], 0.44, 0.46, rnd, { mat: 'oakDark', bow: -0.015, proud: 0.23 });
  member(kit, sub(F, [0, beamY, 0], [1, 0, 0], [0, 1, 0]), [-BW / 2 + 0.1, 0.55], [BW / 2 - 0.1, 0.55], 0.22, 0.32, rnd, { mat: 'oak', bow: 0.0, proud: 0.16 });
  gableRoof(kit, frame(xf(F, 0, beamY + 0.66, 0), [F[3], F[4], F[5]], [0, 1, 0]), { L: BW - 0.2, S: 1.3, pitch: 0.95, eaves: 0.35, verge: 0.22, cover: 'clay', lod: lod === 'hero' ? 'mid' : lod, seed: rnd() * 999, sag: { ridge: 0.025, slope: 0.012, eaves: 0.01, eavesLine: 0.02 } });
  // the threshold: big flags across the gateway, worn into two wheel ruts, a stop stone between
  // the leaves
  {
    const tz0 = -0.75, tz1 = 0.75;
    let x = -w / 2 - 0.05;
    while (x < w / 2 + 0.05 - 0.05) {
      const fw = Math.min(w / 2 + 0.05 - x, rnd.range(0.55, 0.95));
      const xc = x + fw / 2;
      block(kit.get('stoneSett'), sub(F, [xc, -0.07 + rnd.sym(0.006), (tz0 + tz1) / 2 + rnd.sym(0.02)], [1, rnd.sym(0.008), 0], [0, 1, rnd.sym(0.008)]), fw - 0.014, 0.14, tz1 - tz0 - 0.02, {
        r: rnd.range(0.015, 0.03), rs: L.rs, seg: [0.08, 0.07, 0.12], seed: rnd(), noise: 0.004, nf: 5, chip: 0.03, skip: 8,
        // two ruts 1.4 m apart (the axle of a cart), polished hollows
        warp: (lx, ly, lz) => { const gx = xc + lx; const rut = Math.exp(-((gx - 0.7) ** 2) / 0.012) + Math.exp(-((gx + 0.7) ** 2) / 0.012); return [lx, ly - (ly > 0 ? 0.035 * rut : 0), lz]; },
      });
      x += fw;
    }
    lathe(kit.get('stoneDressed'), sub(F, [0, 0.0, 0.35]), [[0.0, 0.0], [0.17, 0.0], [0.17, 0.08], [0.15, 0.15], [0.1, 0.2], [0.0, 0.215]], 14, { seed: rnd(), wobble: 0.05 });
  }
  // the leaves: ledged, braced oak, standing open against the inside (square side) of the wall
  const lw = w / 2 - 0.03, lh = 3.75;
  for (const [sx, hinge] of [[-1, 'left'], [1, 'right']]) {
    const ang = o.open ?? 1.5;
    const s = Math.sin(ang), c = Math.cos(ang);
    const hx = sx * (w / 2 - 0.05);
    const X = hinge === 'left' ? [c, 0, s] : [-c, 0, s];
    // (the free end droops 1-2 degrees: the leaf has sagged on its hinges)
    const droop = rnd.range(0.012, 0.022);
    const Fl = sub(F, [hx, 0.08, 0.42], X, [0, 1, 0]);
    const Fd = sub(Fl, [0, 0, 0], [1, -droop, 0], [droop, 1, 0]);
    const rr = makeRand(rnd() * 999);
    // boards (widths as the trees gave them), a straight top under a capping rail
    let xb0 = 0;
    while (xb0 < lw - 0.04) {
      const bw = Math.min(lw - xb0, rr.range(0.17, 0.3));
      block(kit.get(rr() < 0.25 ? 'oakDark' : 'oak'), sub(Fd, [xb0 + bw / 2, lh / 2 - rr.range(0, 0.006), 0], [0, 1, 0], [-1, 0, 0]), lh - rr.range(0, 0.01), bw - 0.005, 0.06, { r: rr.range(0.004, 0.01), seg: [0.6, 0.2, 0.06], seed: rr(), noise: 0.002, nf: 4, chip: 0.012, axis: [1, 0, 0] });
      xb0 += bw;
    }
    // ledges on the square side; braces rising from the hinge side; strap hinges and nails on the road side
    for (const y of [0.3, lh / 2, lh - 0.3]) block(kit.get('oak'), sub(Fd, [lw / 2, y, -0.06]), lw - 0.06, 0.2, 0.06, { r: 0.01, seg: [0.4, 0.2, 0.06], seed: rr(), noise: 0.002, chip: 0.012, axis: [1, 0, 0] });
    member(kit, sub(Fd, [0, 0, -0.06]), [0.14, 0.42], [lw - 0.14, lh / 2 - 0.12], 0.17, 0.06, rr, { mat: 'oak', proud: 0.0, bow: 0.0 });
    member(kit, sub(Fd, [0, 0, -0.06]), [0.14, lh / 2 + 0.12], [lw - 0.14, lh - 0.42], 0.17, 0.06, rr, { mat: 'oak', proud: 0.0, bow: 0.0 });
    for (const y of [0.45, 1.95, 3.45].map((v) => v - 0.08)) {
      block(kit.get('iron'), sub(Fd, [lw * 0.38, y, 0.034]), lw * 0.76, 0.07, 0.009, { r: 0.002, seg: [0.2, 0.07, 0.009], seed: rr(), warp: (lx, ly, lz) => [lx, ly * (1 - 0.4 * (lx / (lw * 0.76) + 0.5)), lz] });
      for (let k = 0; k < 6; k++) tube(kit.get('iron'), [xf(Fd, 0.08 + k * lw * 0.12, y, 0.036), xf(Fd, 0.08 + k * lw * 0.12, y, 0.046)], 0.009, { sides: 5, caps: true });
    }
    for (const y of [0.3, lh / 2, lh - 0.3]) for (let k = 0; k < 9; k++) tube(kit.get('iron'), [xf(Fd, 0.1 + k * (lw - 0.2) / 8, y, 0.03), xf(Fd, 0.1 + k * (lw - 0.2) / 8, y, 0.04)], 0.008, { sides: 5, caps: true });
    // the bar slots and a ring latch on the free end
    { const ring = []; for (let k = 0; k <= 14; k++) { const a = (k / 14) * Math.PI * 2; ring.push(xf(Fd, lw - 0.25 + Math.sin(a) * 0.08, 1.25 + Math.cos(a) * 0.08, 0.05)); } tube(kit.get('iron'), ring, 0.01, { sides: 6 }); }
  }
  return { w, beamY };
}

/** A straight prism with `sides` flat faces (hard edges) about F's y axis: r0 at y0 .. r1 at y1. */
function prism(acc, F, sides, r0, r1, y0, y1, seed, o = {}) {
  const ph = o.phase ?? Math.PI / sides;
  const ap = (k) => ph + (k / sides) * Math.PI * 2;
  for (let k = 0; k < sides; k++) {
    const a0 = ap(k), a1 = ap(k + 1);
    const nv = Math.max(1, Math.ceil((y1 - y0) / (o.seg ?? 0.3)));
    // a face: its own vertices (hard edges), a little noise on the dressed face
    grid(acc, 2, nv, (u, v) => {
      const a = a0 + (a1 - a0) * u, y = y0 + (y1 - y0) * v, r = r0 + (r1 - r0) * v;
      const rr = r / Math.cos(a - (a0 + a1) / 2);
      const p = xf(F, Math.cos(a) * rr, y, Math.sin(a) * rr);
      return { p, uv: [u * 2 * r * Math.tan(Math.PI / sides), y], seed, ao: o.ao ?? 1 };
    }, [Math.cos(ap(k) + Math.PI / 2), 0, Math.sin(ap(k) + Math.PI / 2)], true);
  }
  if (o.cap !== false) {
    const c = xf(F, 0, y1, 0);
    const ci = acc.v(c[0], c[1], c[2], 0, 0, seed, 1, 0, 1, 0, 0);
    const ids = [];
    for (let k = 0; k <= sides; k++) { const a = ap(k); const rr = r1 / Math.cos(Math.PI / sides); const p = xf(F, Math.cos(a) * rr, y1, Math.sin(a) * rr); ids.push(acc.v(p[0], p[1], p[2], Math.cos(a) * rr, Math.sin(a) * rr, seed, 1, 0, 1, 0, 0)); }
    for (let k = 0; k < sides; k++) acc.t(ci, ids[k + 1], ids[k]);
  }
}

/**
 * The fountain (the reference landmark), a town conduit of the period: an octagonal basin of
 * dressed slabs between corner posts, a moulded coping tied across its joints with leaded iron
 * cramps, an octagonal step all round (solid to the basin's plinth), and in the water the central
 * stone pillar - a chamfered base, a monolithic octagonal shaft, a spout course with four carved
 * spout heads and lead pipes running water into the basin, a moulded capital and a weathered
 * pinnacle. F: centre of the fountain at ground level. Returns { r, h, pillarH, water, jets }.
 */
export function fountain(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 91);
  const R = o.r ?? 3.0, hW = o.h ?? 0.72, ph = o.pillarH ?? 3.4;
  const lod = LOD[o.lod || 'mid'];
  const S = 8, cs = Math.cos(Math.PI / S);
  const corner = (k, r) => { const a = (k / S) * Math.PI * 2; return [Math.cos(a) * r / cs, Math.sin(a) * r / cs]; };    // vertex k of the octagon with apothem r
  const wallT = 0.24, wy = hW - 0.2;
  const stoneB = (mat, Fb, sx, sy, sz, extra = {}) => block(kit.get(mat), Fb, sx, sy, sz, { r: 0.012, rs: lod.rs, seg: [Math.max(lod.seg, 0.15), Math.max(lod.seg, sy / 2), Math.max(0.08, sz / 3)], seed: rnd(), noise: 0.0025, nf: 6, chip: 0.008, pillow: 0.0015, uvMode: 'box', ...extra });
  // per side k (between vertices k and k+1): a frame at the side's middle, x along, z outward
  const sideF = (k, r, y) => {
    const a = ((k + 0.5) / S) * Math.PI * 2;
    return sub(F, [Math.cos(a) * r, y, Math.sin(a) * r], [Math.sin(a), 0, -Math.cos(a)], [0, 1, 0]);     // z outward
  };
  const sideLen = (r) => 2 * r * Math.tan(Math.PI / S);
  // the step round the basin: eight slabs from under the basin's plinth out to R + 0.8, each a
  // trapezoid (wider outside), worn where feet stand
  {
    const rIn = R - 0.12, rOut = R + 0.82, rm = (rIn + rOut) / 2;
    for (let k = 0; k < S; k++) {
      stoneB('stoneDressed', sideF(k, rm, 0.08), sideLen(rm) - 0.012, 0.16, rOut - rIn, {
        r: 0.02, chip: 0.012, skip: 8,
        warp: (lx, ly, lz) => { const rr = rm + lz; return [lx * (rr / rm), ly - (ly > 0 ? 0.012 * Math.exp(-((lz - 0.2) ** 2) / 0.05) : 0), lz]; },
      });
    }
  }
  // an octagon segment slab on side k: centred at apothem rm, depth dep (radially), widening outward
  // so neighbours meet on the mitre line; extra.warp runs after
  const octSlab = (mat, k, rm, y, L, h, dep, extra = {}) => {
    const w2 = extra.warp;
    stoneB(mat, sideF(k, rm, y), L, h, dep, { ...extra, warp: (lx, ly, lz) => { const q = [lx * ((rm + lz) / rm), ly, lz]; return w2 ? w2(q[0], q[1], q[2]) : q; } });
  };
  // plinth course, side slabs between corner posts, the coping with cramps
  const rW = R - wallT / 2;
  const slabTop = hW - 0.095;
  for (let k = 0; k < S; k++) {
    octSlab('stoneDressed', k, rW + 0.04, 0.24, sideLen(rW + 0.04) - 0.012, 0.16, wallT + 0.12, { r: 0.015 });
    const L = sideLen(rW) - 0.3;
    stoneB('stoneDressed', sideF(k, rW, 0.32 + (slabTop - 0.32) / 2), L + 0.02, slabTop - 0.32, wallT, { r: 0.01, pillow: 0.004 });
    // the damp, algae-stained band on the inner face at the water line
    stoneB('stoneWet', sideF(k, rW - wallT / 2 - 0.006, 0.32 + (wy + 0.12 - 0.32) / 2), L, wy + 0.12 - 0.32, 0.016, { r: 0.004, noise: 0.001, pillow: 0 });
    // corner post at vertex k
    const [cx, cz] = corner(k, rW);
    const a = (k / S) * Math.PI * 2;
    stoneB('stoneDressed', sub(F, [cx, 0.32 + (slabTop - 0.32) / 2, cz], [-Math.sin(a), 0, Math.cos(a)], [0, 1, 0]), 0.36, slabTop - 0.32, wallT + 0.06, { r: 0.02 });
    // coping slab (overhangs both faces, a rounded outer arris, a few bucket-worn dips)
    const Lc = sideLen(rW);
    const dip = rnd() < 0.6 ? rnd.sym(Lc * 0.3) : 99;
    octSlab('stoneDressed', k, rW + 0.03, hW - 0.03, Lc - 0.01, 0.13, wallT + 0.32, {
      r: 0.03, rs: 2, chip: 0.012,
      warp: (lx, ly, lz) => [lx, ly - (ly > 0 ? 0.012 * Math.exp(-((lx - dip) ** 2) / 0.04) * Math.exp(-(lz * lz) / 0.02) : 0), lz],
    });
    // weathering on the outer face: a damp grime line under the coping's drip, green streaks where
    // the overflow runs down, splash dirt along the plinth's foot
    {
      const Lw = sideLen(rW) - 0.34;
      const Fw = sideF(k, R + 0.004, 0);
      grimeBand(kit, Fw, -Lw / 2, Lw / 2, hW - 0.1, rnd.range(0.12, 0.22), rnd, { kind: 'dirt', strength: 0.45, z: 0.006 });
      for (let n = 0; n < 2; n++) if (rnd() < 0.7) stain(kit, Fw, rnd.sym(Lw * 0.4), hW - 0.1, rnd.range(0.12, 0.3), rnd.range(0.2, 0.3), 'algae', { strength: 0.55, seed: rnd(), z: 0.007 });
      const Fp = sideF(k, R + 0.104, 0), Lp = sideLen(R + 0.1);
      grimeBand(kit, Fp, -Lp / 2, Lp / 2, 0.32, 0.15, rnd, { kind: 'dirt', strength: 0.5, z: 0.005 });
    }
    // an iron cramp leaded flush into sockets across the joint at the corner; its rust runs down the
    // coping's outer face
    const [vx, vz] = corner(k, rW + 0.03);
    const t = [-Math.sin(a), 0, Math.cos(a)];
    const cTop = hW - 0.03 + 0.065;
    block(kit.get('lead'), sub(F, [vx, cTop - 0.004, vz], t, [0, 1, 0]), 0.26, 0.012, 0.06, { r: 0.006, seg: [0.1, 0.012, 0.06], seed: rnd(), noise: 0.002, nf: 20 });
    block(kit.get('iron'), sub(F, [vx, cTop - 0.003, vz], t, [0, 1, 0]), 0.2, 0.01, 0.028, { r: 0.003, seg: [0.08, 0.01, 0.03], seed: rnd(), noise: 0.001, nf: 30 });
    {
      const ao = [Math.cos(a), 0, Math.sin(a)];
      const Fo = sub(F, [vx + ao[0] * 0.14, 0, vz + ao[2] * 0.14], [-ao[2], 0, ao[0]], [0, 1, 0]);
      stain(kit, Fo, 0, cTop - 0.02, 0.1, rnd.range(0.35, 0.6), 'rust', { strength: 0.6, seed: rnd(), z: 0.008 });
    }
  }
  // basin floor
  block(kit.get('stoneDressed'), sub(F, [0, 0.27, 0]), (rW - wallT / 2) * 2, 0.1, (rW - wallT / 2) * 2, { r: 0.02, seg: [1, 0.1, 1], seed: rnd() });
  // ---- the pillar: all octagonal (a stepped base, the shaft, a spout drum, a capital, a pinnacle)
  const spoutY = hW + 0.75, jets = [];
  const ph8 = Math.PI / 8 + 0.12;
  const oct = (r0, r1, y0, y1, seg = 0.2, cap = true) => prism(kit.get('stoneDressed'), F, 8, r0, r1, y0, y1, rnd(), { phase: ph8, seg, cap });
  oct(0.62, 0.6, 0.32, wy + 0.1);
  oct(0.6, 0.48, wy + 0.1, wy + 0.2, 0.1);                  // weathered chamfer
  oct(0.48, 0.47, wy + 0.2, wy + 0.42);
  oct(0.47, 0.34, wy + 0.42, wy + 0.52, 0.1);
  oct(0.31, 0.3, wy + 0.52, spoutY - 0.24, 0.25, false);
  oct(0.3, 0.42, spoutY - 0.24, spoutY - 0.18, 0.06);       // the spout drum: a roll below, a roll above
  oct(0.42, 0.42, spoutY - 0.18, spoutY + 0.2, 0.12);
  oct(0.42, 0.3, spoutY + 0.2, spoutY + 0.26, 0.06);
  for (let i = 0; i < 4; i++) {
    const a = ph8 - Math.PI / 8 + Math.PI / 8 + (i / 4) * Math.PI * 2 + Math.PI / 8;
    const out = [Math.cos(a), 0, Math.sin(a)];
    const Fh = sub(F, [out[0] * 0.44, spoutY - 0.01, out[2] * 0.44], [out[2], 0, -out[0]], [0, 1, 0]);     // z outward
    void 0;
    // the head: a block that narrows to a muzzle (worn smooth), the mouth low
    block(kit.get('stoneDressed'), Fh, 0.24, 0.26, 0.26, { r: 0.05, rs: 2, seg: [0.05, 0.05, 0.05], seed: rnd(), noise: 0.006, nf: 9, chip: 0.006,
      warp: (lx, ly, lz) => { const f = (lz / 0.26 + 0.5); const k2 = 1 - 0.4 * f; return [lx * k2, ly * (1 - 0.3 * f) - 0.04 * f * f, lz]; } });
    const m0 = xf(Fh, 0, -0.07, 0.08), m1 = xf(Fh, 0, -0.08, 0.2);
    tube(kit.get('lead'), [m0, m1], 0.016, { sides: 8, caps: true });
    // the jet: a glassy strand falling from the pipe, swelling and breaking into drops before it
    // hits; a crown of splash and a patch of foam where it lands
    const v0 = 1.2, g = 9.81, pts = [];
    const yw0 = xf(F, 0, wy, 0)[1];
    for (let k = 0; k <= 40; k++) {
      const tt = k * 0.0125;
      const p = xf(Fh, 0, -0.08 - 0.5 * g * tt * tt, 0.2 + v0 * tt);
      if (p[1] < yw0) { pts.push([p[0], yw0 - 0.005, p[2]]); break; }
      pts.push(p);
    }
    const nBreak = Math.floor(pts.length * 0.62);
    tube(kit.get('jet'), pts.slice(0, nBreak + 1), (t) => 0.0085 + 0.004 * t + 0.0015 * Math.sin(t * 23 + i), { sides: 8 });
    // drops: elongated beads along the lower part of the fall, scattering a little
    for (let k = nBreak; k < pts.length - 1; k++) {
      for (let m = 0; m < 2; m++) {
        const f = m / 2, p = pts[k], q = pts[k + 1];
        const c = [p[0] + (q[0] - p[0]) * f + rnd.sym(0.012), p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f + rnd.sym(0.012)];
        const dl = rnd.range(0.012, 0.03);
        const T = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], tl = Math.hypot(...T);
        tube(kit.get('jet'), [[c[0] - T[0] / tl * dl, c[1] - T[1] / tl * dl, c[2] - T[2] / tl * dl], [c[0], c[1], c[2]], [c[0] + T[0] / tl * dl, c[1] + T[1] / tl * dl, c[2] + T[2] / tl * dl]], (t) => 0.006 * Math.sin(Math.PI * t) + 0.001, { sides: 5 });
      }
    }
    const hit = pts[pts.length - 1];
    // the splash crown: drops thrown up and out round the impact
    for (let k = 0; k < 14; k++) {
      const an = (k / 14) * Math.PI * 2 + rnd.sym(0.2), rr = rnd.range(0.03, 0.09), hh = rnd.range(0.02, 0.08);
      const c = [hit[0] + Math.cos(an) * rr, yw0 + hh, hit[2] + Math.sin(an) * rr];
      tube(kit.get('jet'), [[c[0] - Math.cos(an) * 0.008, c[1] - 0.012, c[2] - Math.sin(an) * 0.008], c, [c[0] + Math.cos(an) * 0.008, c[1] + 0.008, c[2] + Math.sin(an) * 0.008]], (t) => 0.0045 * Math.sin(Math.PI * t) + 0.0008, { sides: 5 });
    }
    grid(kit.get('foam'), 16, 3, (u, v) => { const an = u * Math.PI * 2, rr = v * 0.26 * (1 + 0.25 * Math.sin(an * 3 + i)); return { p: [hit[0] + Math.cos(an) * rr, yw0 + 0.004, hit[2] + Math.sin(an) * rr], uv: [an * 0.25 + i, rr * 1.6], seed: 0.5, ao: 0.55, ar: 0 }; }, [1, 0, 0], false);
    // limescale and algae run down the drum and the shaft below the spout
    {
      const Fd = sub(F, [out[0] * 0.43, 0, out[2] * 0.43], [out[2], 0, -out[0]], [0, 1, 0]);
      stain(kit, Fd, 0, spoutY - 0.2, 0.2, 0.18, 'lime', { strength: 0.7, seed: rnd(), z: 0.004 });
      const Fs2 = sub(F, [out[0] * 0.305, 0, out[2] * 0.305], [out[2], 0, -out[0]], [0, 1, 0]);
      stain(kit, Fs2, 0, spoutY - 0.24, 0.18, spoutY - 0.24 - wy - 0.5, 'algae', { strength: 0.65, seed: rnd(), z: 0.004 });
      stain(kit, Fs2, 0.02, spoutY - 0.24, 0.1, 0.45, 'lime', { strength: 0.5, seed: rnd(), z: 0.005 });
    }
    jets.push(hit);
  }
  oct(0.3, 0.29, spoutY + 0.26, ph - 0.62, 0.25, false);
  const yc = ph - 0.62;
  oct(0.29, 0.4, yc, yc + 0.14, 0.07);                      // the bell of the capital
  oct(0.44, 0.44, yc + 0.14, yc + 0.25, 0.1);               // abacus
  oct(0.2, 0.19, yc + 0.25, yc + 0.42, 0.1);
  oct(0.19, 0.015, yc + 0.42, ph, 0.08);                    // the pinnacle, its point worn round
  // water: a fine disc, uv.x = the distance to the nearest jet's impact (ripple rings)
  {
    const acc = kit.get('pool');
    const rin = rW - wallT / 2 + 0.01;
    const nr = 40, na = 96;
    const yw = xf(F, 0, wy, 0)[1];
    grid(acc, na, nr, (u, v) => {
      const a = u * Math.PI * 2, rr = v * rin / Math.cos(Math.PI / S * 0) ;
      // clip the disc to the octagonal inner face
      const ap = Math.cos(((a + Math.PI * 2) % (Math.PI / 4)) - Math.PI / 8);
      const r2 = Math.min(rr, rin * cs / Math.max(ap, 0.5));
      const p = xf(F, Math.cos(a) * r2, wy, Math.sin(a) * r2);
      let dmin = 9;
      for (const h of jets) dmin = Math.min(dmin, Math.hypot(p[0] - h[0], p[2] - h[2]));
      return { p: [p[0], yw, p[2]], uv: [dmin, a], seed: 0.5, ao: 1 };
    }, [1, 0, 0], false);
  }
  return { r: R, h: hW, pillarH: ph, water: wy, jets };
}

/**
 * One field cobble set deep in the sand and earth: an oval of rounded stone whose worn, flattened
 * top shows 1-3 cm above the bed. F at its centre on the ground. q: quality (0 far .. 2 hero).
 */
function cobble(acc, F, rx, rz, h, seed, q = 1, top = 1) {
  const n = q >= 2 ? 9 : q >= 1 ? 8 : 6, base = acc.vcount;
  // rings: [radius factor, height, occlusion] - buried foot, the shoulder, the flattened top
  const rings = q >= 1 ? [[1.0, -0.035, 0.3], [0.96, h * 0.35, 0.7], [0.82, h * 0.8, 0.92], [0.45, h * (0.97 + 0.03 * top), 1.0]] : [[1.0, -0.03, 0.3], [0.85, h * 0.75, 0.9], [0.45, h, 1.0]];
  for (const [k, y, ao] of rings) for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wob = 1 + 0.1 * Math.sin(a * 2 + seed * 40) + 0.07 * Math.sin(a * 3 + seed * 17);
    const p = xf(F, Math.cos(a) * rx * k * wob, y, Math.sin(a) * rz * k * wob);
    acc.v(p[0], p[1], p[2], Math.cos(a) * rx * k, Math.sin(a) * rz * k, seed, ao * (0.88 + 0.12 * top), k < 0.6 ? 0 : 0.6, F[3], F[4], F[5]);
  }
  const tp = xf(F, 0, h, 0);
  const ti = acc.v(tp[0], tp[1], tp[2], 0, 0, seed, 0.88 + 0.12 * top, 0, F[3], F[4], F[5]);
  const nr = rings.length;
  for (let r = 0; r < nr - 1; r++) for (let i = 0; i < n; i++) {
    const a = base + r * n + i, b = base + r * n + (i + 1) % n, c = base + (r + 1) * n + (i + 1) % n, d = base + (r + 1) * n + i;
    acc.q(a, d, c, b);
  }
  for (let i = 0; i < n; i++) acc.t(ti, base + (nr - 1) * n + (i + 1) % n, base + (nr - 1) * n + i);
}

/**
 * Cobbled paving: field cobbles (6-11 cm across, 10-17 cm long) set on edge in rows, packed tight
 * (5-14 mm joints of sand and earth), sunk two thirds into the bed so only their worn, flattened
 * tops show; flatter and darker along the walking lines (doors, the fountain, the steps, the gate,
 * the arch), worn through to the earth in ragged patches, dished along a kennel that carries the
 * fountain's overflow out under the gate, with puddles in the hollows. Over x0..x1, z0..z1 (world),
 * skipping where skip(x, z) is true. o: { mat ('stoneSett'), seed, wear (0..1), kennel: [[x, z]...]
 * polyline, paths: [[[x, z], ...], ...], puddles (n), lodAt (fn(x, z) -> 0..2) }.
 */
export function paving(kit, x0, x1, z0, z1, o = {}) {
  const rnd = makeRand(o.seed ?? 55);
  const acc = kit.get(o.mat || 'stoneSett');
  const skip = o.skip || (() => false);
  const wear = o.wear ?? 0.5;
  const segDist = (pl, x, z) => {
    let d = 99;
    for (let i = 0; i < pl.length - 1; i++) {
      const [ax, az] = pl[i], [bx, bz] = pl[i + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return d;
  };
  const ken = o.kennel || null;
  const kenDist = (x, z) => (ken ? segDist(ken, x, z) : 9);
  const paths = o.paths || [];
  const pathW = (x, z) => { let m = 0; for (const p of paths) m = Math.max(m, Math.exp(-((segDist(p, x, z) / 0.9) ** 2))); return m; };
  const lodAt = o.lodAt || (() => 1);
  let z = z0, n = 0;
  while (z < z1 - 0.06) {
    const rowD = rnd.range(0.1, 0.16);
    let x = x0 + rnd.range(0, 0.06);
    while (x < x1 - 0.06) {
      const big = rnd() < 0.12;
      const w = big ? rnd.range(0.12, 0.17) : rnd.range(0.06, 0.11);
      const d = Math.min(rowD * rnd.range(0.88, 1.05), w * rnd.range(1.1, 1.8));
      const cx = x + w / 2, cz = z + rowD / 2 + rnd.sym(0.012) + 0.03 * Math.sin(x * 0.9 + z * 0.3);
      x += w + rnd.range(0.005, 0.014);
      if (skip(cx, cz)) continue;
      const wn = fbm3(cx * 0.16 + 4.1, 0.3, cz * 0.16 - 2.2, 3);
      const edgeT = 0.66 - 0.35 * wear;
      if (wn > edgeT + 0.04 || (wn > edgeT - 0.06 && rnd() < (wn - edgeT + 0.06) / 0.1) || rnd() < 0.01) {         // worn through to the earth, ragged
        // (round 2: the patches are not bare decals - stones kicked loose lie in them, tilted, sitting
        // proud on the trodden earth)
        if (rnd() < 0.3) {
          const ly = rnd() * Math.PI * 2, up = [rnd.sym(0.35), 1, rnd.sym(0.35)];
          cobble(acc, frame([cx + rnd.sym(0.04), 0.004, cz + rnd.sym(0.04)], [Math.cos(ly), 0, -Math.sin(ly)], up), d / 2 * 0.9, w / 2 * 0.9, rnd.range(0.03, 0.05), rnd(), lodAt(cx, cz), 1);
          n++;
        }
        continue;
      }
      const kd = kenDist(cx, cz);
      const dish = kd < 0.45 ? 0.04 * Math.cos((kd / 0.45) * Math.PI / 2) : 0;
      const pw = pathW(cx, cz);
      // walking lines: tops worn flat (lower) and darkened; elsewhere they stand a little proud
      const h = (rnd.range(0.016, 0.032) * (big ? 1.15 : 1) - Math.max(0, wn) * 0.01) * (1 - 0.45 * pw);
      const yaw = Math.PI / 2 + rnd.sym(0.35) + 0.15 * Math.sin(cx * 0.5);
      const F = frame([cx, -dish + rnd.sym(0.004), cz], [Math.cos(yaw), rnd.sym(0.04), -Math.sin(yaw)], [rnd.sym(0.04), 1, rnd.sym(0.04)]);
      cobble(acc, F, d / 2, w / 2, h, rnd(), lodAt(cx, cz), 1 - 0.5 * pw);
      n++;
    }
    z += rowD;
  }
  // puddles: still, silty water in the hollows (worn patches, the kennel), each in a dish of wet mud
  const spots = [];
  if (ken) for (let i = 0; i < 3; i++) { const k = Math.floor(rnd() * (ken.length - 1)); const t = rnd(); spots.push([ken[k][0] + (ken[k + 1][0] - ken[k][0]) * t, ken[k][1] + (ken[k + 1][1] - ken[k][1]) * t, rnd.range(0.35, 0.7), -0.028]); }
  for (let i = 0; i < (o.puddles ?? 5); i++) {
    for (let g = 0; g < 40; g++) {
      const px = x0 + rnd() * (x1 - x0), pz = z0 + rnd() * (z1 - z0);
      if (skip(px, pz) || fbm3(px * 0.16 + 4.1, 0.3, pz * 0.16 - 2.2, 3) < 0.66 - 0.35 * wear) continue;
      spots.push([px, pz, rnd.range(0.4, 1.0), 0.002]);
      break;
    }
  }
  for (const [px, pz, r, y] of spots) puddle(kit, px, pz, r, y, rnd());
  return n;
}

/**
 * A puddle: silty standing water with a ragged outline (elongated along x, world, at height y), in a
 * shallow dish of wet, darkened mud that rises out of it; a few straws floating.
 */
export function puddle(kit, px, pz, r, y, sd, stretch = 1.4, o = {}) {
  const shape = (a) => (1 + 0.3 * Math.sin(a * 2 + sd * 9) + 0.15 * Math.sin(a * 5 + sd * 3)) * (1 - 0.35 * Math.abs(Math.sin(a + sd)));
  grid(kit.get('puddle'), 32, 5, (u, v) => {
    const a = u * Math.PI * 2, rr = v * r * shape(a);
    return { p: [px + Math.cos(a) * rr * stretch, y, pz + Math.sin(a) * rr], uv: [99, 0], seed: 0.5, ao: 1 };
  }, [1, 0, 0], false);
  // the wet rim: mud from under the water's edge rising to the surrounding ground, darker inside
  grid(kit.get('wetMud'), 32, 3, (u, v) => {
    const a = u * Math.PI * 2, k = 0.82 + 0.55 * v, rr = r * shape(a) * k;
    return { p: [px + Math.cos(a) * rr * stretch, y - 0.006 + 0.022 * v + 0.004 * Math.sin(a * 7 + sd * 5), pz + Math.sin(a) * rr], uv: [a * r, v], seed: sd, ao: 0.75 + 0.25 * v };
  }, [1, 0, 0], false);
  // floating straws
  if (o.straw !== false) {
    const acc = kit.get('straw');
    for (let i = 0; i < 6; i++) {
      const a = sd * 40 + i * 2.1, rr = r * 0.5 * ((i * 0.37 + sd) % 1), d = 0.05 + ((i * 0.53 + sd * 3) % 1) * 0.15;
      const cx = px + Math.cos(a) * rr * stretch, cz = pz + Math.sin(a) * rr, an = a * 1.7;
      tube(acc, [[cx - Math.cos(an) * d, y + 0.002, cz - Math.sin(an) * d], [cx + Math.cos(an) * d, y + 0.002, cz + Math.sin(an) * d]], 0.002, { sides: 3, seed: sd });
    }
  }
}

/**
 * The substantial stone support beside the king's steps (cover for the king, the captain and the
 * injured villager, 3C): a broad pier of rough-dressed squared stone, 2.6 m across its north face
 * (toward the square) and 1.5 m deep, 3.4 m high on a two-step plinth, a pitched weathering and
 * coping on top; a mounting block against its east end, a tethering ring with a rust streak and
 * a rope-worn arris below it. F at the pier's centre on the ground; its broad faces look north
 * (-z) and south (+z, toward the steps' top).
 */
export function stonePier(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 101);
  const w = o.w ?? 2.6, d = o.d ?? 1.5, h = o.h ?? 3.4;
  const lod = o.lod || 'mid';
  const L = LOD[lod];
  // the plinth: two steps of big dressed slabs, each projecting 18 cm, worn on their arrises
  for (const [k, y0, hh, out] of [[0, 0, 0.24, 0.36], [1, 0.24, 0.2, 0.18]]) {
    const W = w + 2 * out, D = d + 2 * out;
    // slabs round the ring: front and back runs, then the ends between them
    const runs = [[-W / 2, W / 2, D / 2 - 0.3, 0.6, 1], [-W / 2, W / 2, -D / 2 + 0.3, 0.6, 1], [-W / 2 + 0.3, -W / 2 + 0.3, 0, D - 1.2, 0], [W / 2 - 0.3, W / 2 - 0.3, 0, D - 1.2, 0]];
    for (const [a, b, zc, dd, alongX] of runs) {
      if (alongX) {
        let x = a;
        while (x < b - 0.05) {
          const len = Math.min(b - x, rnd.range(0.55, 1.1));
          block(kit.get('stoneDressed'), sub(F, [x + len / 2 + rnd.sym(0.004), y0 + hh / 2 + rnd.sym(0.004), zc + rnd.sym(0.006)], [1, rnd.sym(0.006), 0], [0, 1, 0]), len - 0.012, hh - 0.006, dd, { r: rnd.range(0.008, 0.025), rs: L.rs, seg: [0.2, 0.1, 0.2], seed: rnd(), noise: 0.003, nf: 5, chip: 0.03, pillow: 0.002, uvMode: 'box' });
          x += len;
        }
      } else {
        block(kit.get('stoneDressed'), sub(F, [a + rnd.sym(0.004), y0 + hh / 2, zc], [0, 0, 1], [0, 1, 0]), dd - 0.012, hh - 0.006, 0.6, { r: rnd.range(0.008, 0.025), rs: L.rs, seg: [0.2, 0.1, 0.2], seed: rnd(), noise: 0.003, nf: 5, chip: 0.03, pillow: 0.002, uvMode: 'box' });
      }
    }
    void k;
  }
  // the body: rough-dressed blocks of different heights and lengths, quoined at the corners
  const yb = 0.44;
  masonryBox(kit, sub(F, [0, yb, 0]), { w, d, h: h - yb, T: d / 2, style: 'squared', mat: 'stoneGrey', dressedMat: 'stoneDressed', mortar: 'mortar', lod, seed: rnd() * 999, courseMin: 0.22, courseMax: 0.4, quoin: { long: 0.62, short: 0.4 } });
  // the weathering: a pitched course shedding the rain both ways (ridge along the pier), then a
  // coping of big slabs with a drip on each side
  const nc = Math.max(2, Math.round((w + 0.16) / 0.9));
  for (let i = 0; i < nc; i++) {
    const x0 = -w / 2 - 0.08 + (w + 0.16) * i / nc, x1 = -w / 2 - 0.08 + (w + 0.16) * (i + 1) / nc - 0.012;
    block(kit.get('stoneDressed'), sub(F, [(x0 + x1) / 2 + rnd.sym(0.006), h + 0.11 + rnd.sym(0.004), rnd.sym(0.008)], [1, 0, rnd.sym(0.01)], [0, 1, 0]), x1 - x0, 0.22, d + 0.16, {
      r: rnd.range(0.015, 0.03), rs: 1, seg: [0.2, 0.11, 0.2], seed: rnd(), noise: 0.004, nf: 5, chip: 0.035,
      warp: (lx, ly, lz) => [lx, ly + (ly > 0 ? 0.13 * (1 - Math.abs(lz) / ((d + 0.16) / 2)) : 0), lz],
    });
  }
  // the mounting block against the east end: three solid steps of big stones
  for (let k = 0; k < 3; k++) {
    const sw = 0.95, sd = 1.05 - k * 0.32, sh = 0.21;
    block(kit.get('stoneDressed'), sub(F, [w / 2 + 0.36 + sd / 2 + rnd.sym(0.01), 0.44 + sh * (k + 0.5) - 0.005, rnd.sym(0.02)], [1, rnd.sym(0.008), rnd.sym(0.02)], [0, 1, 0]), sd, sh - 0.008, sw, {
      r: rnd.range(0.015, 0.03), rs: L.rs, seg: [0.15, 0.1, 0.15], seed: rnd(), noise: 0.003, nf: 6, chip: 0.03, uvMode: 'box',
      warp: (lx, ly, lz) => [lx, ly - (ly > 0 ? 0.012 * Math.exp(-(lz * lz) / 0.04) * Math.exp(-((lx) ** 2) / 0.05) : 0), lz],
    });
  }
  for (const k of [0, 1]) block(kit.get('stoneDressed'), sub(F, [w / 2 + 0.36 + 0.52, 0.22 * k + 0.11, 0]), 1.08 - 0.01, 0.21, 0.98, { r: 0.02, rs: 1, seg: [0.2, 0.1, 0.2], seed: rnd(), noise: 0.003, nf: 5, chip: 0.03 });
  // an iron tethering ring on the north face, a rust streak under it, the arris worn by the rope
  const Fn = sub(F, [w / 2 - 0.55, 0, -d / 2], [-1, 0, 0], [0, 1, 0]);
  const ringC = xf(Fn, 0, 1.3, 0.045);
  const ringPts = [];
  for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; ringPts.push(xf(Fn, Math.sin(a) * 0.075, 1.2 + Math.cos(a) * 0.075, 0.05 + 0.01 * Math.cos(a))); }
  tube(kit.get('iron'), ringPts, 0.011, { sides: 6 });
  tube(kit.get('iron'), [ringC, xf(Fn, 0, 1.3, -0.06)], 0.022, { sides: 6, caps: true });
  stain(kit, Fn, 0.0, 1.27, 0.16, rnd.range(0.7, 1.0), 'rust', { strength: 0.75, seed: rnd(), z: 0.018 });
  stain(kit, Fn, 0.0, 1.15, 0.5, 0.6, 'dirt', { strength: 0.35, seed: rnd(), z: 0.018 });
  return { w, d, h, cover: xf(F, 0, 0, d / 2 + 0.6) };
}

/**
 * The king's steps: a flight of dressed steps between stepped cheek walls (stone on both faces,
 * each section capped), up to a paved terrace held by retaining walls on its sides and back with a
 * low parapet - a solid stone structure seen from every side. F at the foot centre, rising toward -z.
 */
export function kingsSteps(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 111);
  const n = o.n ?? 7, w = o.w ?? 14, rise = o.rise ?? 0.24, tread = o.tread ?? 1.0;
  const lod = o.lod || 'mid';
  const H = n * rise, depth = o.terrace ?? 5, run = n * tread;
  const cw = 0.6, para = 0.55;                                   // cheek / retaining wall thickness, parapet above the terrace
  steps(kit, F, { n, w, rise, tread, lod, seed: rnd() * 999, mat: 'stoneDressed', wear: 0.022, landing: 0.0, walkX: -0.8 });
  // dirt, moss and weeds' bed in the joints at the back of each tread; dark streaks down the risers
  for (let i = 0; i < n; i++) grimeBand(kit, sub(F, [-w / 2, 0, -i * tread + 0.02], [1, 0, 0], [0, 1, 0]), 0.1, w - 0.1, (i + 1) * rise - 0.01, rise * 0.85, rnd, { strength: 0.3, z: 0.006 });
  // the flight is solid: a rubble core under every step (it shows nowhere, but closes the flight)
  for (let i = 1; i < n; i++) block(kit.get('mortar'), sub(F, [0, i * rise / 2 - 0.03, -i * tread - tread / 2 + 0.06]), w - 0.02, i * rise - 0.06, tread, { r: 0, seg: 99, seed: rnd(), skip: 4 });
  // a wall section with stone on every face (quoined ends) along local x 0..L of frame Fw, h high
  const wall = (Fw, L, h) => {
    masonryBox(kit, sub(Fw, [L / 2, 0, 0]), { w: L, d: cw, h, T: cw / 2, style: 'squared', mat: 'stoneGrey', dressedMat: 'stoneDressed', mortar: 'mortar', lod, seed: rnd() * 999, courseMin: 0.22, courseMax: 0.36, quoin: { long: 0.5, short: 0.3 } });
    // coping: slabs projecting both sides, a weathered ridge
    const nc = Math.max(1, Math.round(L / 0.85));
    for (let k = 0; k < nc; k++) {
      const a = (L * k) / nc - (k === 0 ? 0.05 : 0), b = (L * (k + 1)) / nc - 0.012 + (k === nc - 1 ? 0.05 : 0);
      block(kit.get('stoneDressed'), sub(Fw, [(a + b) / 2, h + 0.08, 0]), b - a, 0.16, cw + 0.12, { r: 0.02, rs: 1, seg: [0.2, 0.08, 0.2], seed: rnd(), noise: 0.003, nf: 5, chip: 0.012, warp: (lx, ly, lz) => [lx, ly + (ly > 0 ? 0.04 * (1 - Math.abs(lz) / ((cw + 0.12) / 2)) : 0), lz] });
    }
  };
  // stepped cheek walls: one section per two steps, each 0.5 m above the treads it flanks, then
  // along the terrace (retaining it) with the parapet
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 + cw / 2);
    // wall frame: x runs up the flight (toward -z), its face toward +x on both sides (stone on both faces)
    const Fw = sub(F, [x, 0, 0.3], [0, 0, -1], [0, 1, 0]);
    for (let i = 0; i < n; i += 2) {
      const a = i === 0 ? 0 : i * tread + 0.3, b = Math.min(n, i + 2) * tread + 0.3;
      const top = Math.min(n, i + 2) * rise + 0.5;
      wall(sub(Fw, [a, 0, 0]), b - a, top);
    }
    wall(sub(Fw, [run + 0.3, 0, 0]), depth, H + para);
  }
  // the back retaining wall with its parapet
  wall(sub(F, [-w / 2 - cw, 0, -run - depth - cw / 2]), w + 2 * cw, H + para);
  // the terrace paving (flags), over a solid fill
  const tz0 = -run;
  block(kit.get('mortar'), sub(F, [0, H / 2 - 0.06, tz0 - depth / 2]), w, H - 0.12, depth, { r: 0, seg: 99, seed: rnd(), skip: 4 });
  // the terrace: flags of mixed sizes in rows of mixed depth (not a grid), settled a little, a
  // drain running to a spout through the back wall's foot
  for (let z = 0; z < depth - 0.05;) {
    const rd = Math.min(depth - z, rnd.range(0.45, 0.85));
    for (let x = -w / 2; x < w / 2 - 0.05;) {
      const fw = Math.min(w / 2 - x, rnd.range(0.5, 1.15));
      const fd = rd - rnd.range(0.005, 0.01);
      if (Math.abs(x + fw / 2 - 2.5) < 0.12) { x += 0.24; continue; }
      block(kit.get('stoneDressed'), sub(F, [x + fw / 2 + rnd.sym(0.005), H - 0.05 + rnd.sym(0.008), tz0 - z - rd / 2], [1, rnd.sym(0.006), 0], [0, 1, rnd.sym(0.006)]), fw - rnd.range(0.005, 0.01), 0.1, fd, { r: rnd.range(0.006, 0.014), seg: [0.3, 0.1, 0.3], seed: rnd(), noise: 0.003, nf: 5, chip: 0.02, skip: 8 });
      x += fw;
    }
    z += rd;
  }
  // the drain: a channel of dished stones across the terrace
  for (let z = 0.1; z < depth - 0.1; z += 0.5) block(kit.get('stoneSett'), sub(F, [2.5, H - 0.07, tz0 - z - 0.25]), 0.22, 0.1, 0.48, { r: 0.012, seg: [0.06, 0.05, 0.12], seed: rnd(), noise: 0.003, chip: 0.02, skip: 8, warp: (lx, ly, lz) => [lx, ly - (ly > 0 ? 0.025 * Math.cos(Math.min(1, Math.abs(lx) / 0.11) * Math.PI / 2) : 0), lz] });
  return { top: H, terrace: [tz0, tz0 - depth] };
}

/**
 * A lane of setts with a central gutter along a polyline pts [[x, z], ...] (world, ground level):
 * setts in rows across the lane, a dished kennel down the middle, worn patches of earth.
 */
export function lane(kit, pts, o = {}) {
  const rnd = makeRand(o.seed ?? 121);
  const w = o.w ?? 2.6;
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
    const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
    // frame: x across the lane, z back along it (the lane runs toward -z)
    const F = frame([ax, 0, az], [-dz, 0, dx], [0, 1, 0], [-dx, 0, -dz]);
    for (let z = 0; z < L + (k < pts.length - 2 ? w * 0.4 : 0); z += 0.16) {
      let x = -w / 2;
      while (x < w / 2) {
        const sw = rnd.range(0.11, 0.21);
        const xa = x, xb = Math.min(w / 2, x + sw);
        x += sw;
        const xm = (xa + xb) / 2;
        const ch = 0.035 * Math.exp(-(xm * xm) / 0.06);                    // the kennel, dished
        const worn = fbm3((ax + dx * z) * 0.5, 0.2, (az + dz * z) * 0.5 + xm, 2);
        if (worn > 0.45 && Math.abs(xm) > 0.4) continue;                     // earth showing at the sides
        block(kit.get('stoneSett'), sub(F, [xm, -0.045 - ch + rnd.sym(0.006), -z - 0.075], [1, rnd.sym(0.04), 0], [rnd.sym(0.04), 1, 0]), xb - xa - 0.014, 0.1, 0.145, { r: 0.022, seg: [0.2, 0.1, 0.2], seed: rnd(), noise: 0.004, nf: 8, pillow: 0.01, skip: 8 });
      }
    }
  }
}
/** The alley floor (kept for callers): a straight lane from F's origin toward -z. */
export function alley(kit, F, o = {}) {
  const L = o.length ?? 14;
  const a = xf(F, 0, 0, 0), b = xf(F, 0, 0, -L);
  lane(kit, [[a[0], a[2]], [b[0], b[2]]], o);
}

/**
 * The whole square: houses round all four sides (varied widths, depths, storeys, roof
 * directions and coverings, never quite in line), the steps, the support, the arch, the gate,
 * the alley, the fountain. opts: lod ('mid'), focus [[x, z], ...] (houses near these get
 * 'hero'), far (beyond this distance from every focus point: 'low'), damage (fn(x, y, z) ->
 * bool: roof tiles removed, world coords), seed.
 * Returns { group, houses: [{ ...info, frame }], layout: CLING, tris }.
 */
export async function clingSquare(ctx, opts = {}) {
  // (opts.layoutOnly: lay everything out without materials or meshes - for checks in node)
  const M = opts.layoutOnly ? null : await archMaterials(ctx, opts.materials || {});
  const rnd = makeRand(opts.seed ?? 5);
  const focus = opts.focus || [];
  const lodAt = (x, z) => {
    if (!focus.length) return opts.lod || 'mid';
    const d = Math.min(...focus.map(([fx, fz]) => Math.hypot(x - fx, z - fz)));
    return d < (opts.heroR ?? 12) ? 'hero' : d < (opts.far ?? 45) ? 'mid' : 'low';
  };
  const kits = { north: new Kit(0), west: new Kit(0), east: new Kit(0), south: new Kit(0), centre: new Kit(0) };
  const houses = [];
  let hs = 1;
  const S = CLING.square;
  // a row of houses from (x0, z0) along dir (unit), facing `out` (the square side), with gaps
  const row = (key, x0, z0, dir, len, yaw, gaps = [], lodOver = null) => {
    let off = 0;
    let first = true;
    while (off < len - 3) {
      const gap = gaps.find((g) => off >= g[0] - 0.01 && off < g[1]);
      if (gap) { off = gap[1]; first = true; continue; }
      const nextGap = gaps.find((g) => g[0] > off);
      let w = rnd.range(5.0, 7.6);
      const room = (nextGap ? nextGap[0] : len) - off;
      if (room - w < 4.2) w = room;
      if (w < 3.5) { off += w; continue; }
      const d = rnd.range(7.5, 10);
      const set = rnd.sym(0.6);                       // the frontage line is never straight
      const cx = x0 + dir[0] * (off + w / 2), cz = z0 + dir[1] * (off + w / 2);
      const nx = Math.sin(yaw), nz = Math.cos(yaw);
      const px = cx - nx * (d / 2 - set), pz = cz - nz * (d / 2 - set);
      const atEnd = nextGap ? (nextGap[0] - (off + w) < 0.5) : (len - (off + w) < 0.5);
      const seed = hs++;
      const tall = rnd() < 0.4;
      const hF = yawFrame([px, 0, pz], yaw + rnd.sym(0.025));
      // the house's own left/right (looking at its front) against the row direction
      const along = Math.cos(yaw) * dir[0] - Math.sin(yaw) * dir[1] > 0;
      // now and then an all-stone house, or a lime-washed stone ground storey
      const kind = rnd();
      const variant = kind < 0.1 ? { allStone: true } : kind < 0.22 ? { stoneMat: 'stoneWashed', style: 'washed' } : {};
      const info = house(kits[key], hF, {
        ...variant,
        hs: ((h) => (variant.allStone ? undefined : h))(rnd.range(2.8, 3.7)), ht: rnd.range(2.5, 3.05),
        w: w - 0.04, d, storeys: tall ? 2 : 1, roof: rnd() < 0.62 ? 'front' : 'side', seed: seed * 13 + (opts.seed ?? 5),
        lod: lodOver || lodAt(cx, cz), party: along ? { left: !first, right: !atEnd } : { left: !atEnd, right: !first },
        damage: opts.damage ? (p) => opts.damage(...xf(hF, p[0], p[1], p[2])) : undefined,
      });
      houses.push({ ...info, frame: hF, center: [cx, cz], yaw, side: key, back: !!lodOver });
      off += w;
      first = false;
    }
  };
  // north row (faces south, +z): an alley gap behind the vendor stall
  const al = CLING.alley;
  row('north', S.x0 - 3, S.z0, [1, 0], (S.x1 + 3) - (S.x0 - 3), 0, [[al.x - al.w / 2 - (S.x0 - 3), al.x + al.w / 2 - (S.x0 - 3)]]);
  // west side (faces east, +x): the arch between two houses
  const ar = CLING.arch;
  row('west', S.x0, S.z1 + 1, [0, -1], S.z1 + 1 - S.z0, Math.PI / 2, [[(S.z1 + 1) - (ar.z + 3.7), (S.z1 + 1) - (ar.z - 3.7)]]);
  // east side (faces west, -x): the gate gap
  const gt = CLING.gate;
  const gHalf = gt.w / 2 + gt.pier + 3.6;
  row('east', S.x1, S.z0 + 2.5, [0, 1], S.z1 + 1 - S.z0 - 2.5, -Math.PI / 2, [[gt.z - gHalf - S.z0 - 2.5, gt.z + gHalf - S.z0 - 2.5]]);
  // south side either side of the steps (faces north, -z)
  const st = CLING.steps;
  row('south', S.x0 - 3, S.z1 + 2.5, [1, 0], (st.x - st.w / 2 - 1.2) - (S.x0 - 3), Math.PI);
  row('south', st.x + st.w / 2 + 3.5, S.z1 + 2.5, [1, 0], (S.x1 + 3) - (st.x + st.w / 2 + 3.5), Math.PI);
  // the stone arch (escape route 1): a gate passage through a house of the west row - a rubble
  // storey with the through arch, a jettied timber room over it, roofed with its neighbours; the
  // bressumer over the arch on the square side is its own mesh (set.beam: the 3C beam can fall)
  kits.beam = new Kit(0);
  {
    const d = 7.6;
    const hF = yawFrame([S.x0 - d / 2 + 0.3, 0, ar.z], ar.yaw);
    const info = house(kits.west, hF, { w: 7.36, d, storeys: 1, roof: 'side', passage: { w: ar.w, h: ar.h }, chimney: false, seed: 71, lod: lodAt(ar.x, ar.z), party: { left: true, right: true }, beamKit: kits.beam, cover: 'clay' });
    houses.push({ ...info, frame: hF, center: [ar.x, ar.z], yaw: ar.yaw, side: 'west', passage: true });
    var beamInfo = info.beam;
    // the lane beyond the arch (the escape route runs on, west, then bends south)
    lane(kits.west, [[S.x0 + 0.2, ar.z], [S.x0 - 14, ar.z + 0.3], [S.x0 - 23, ar.z - 6.5]], { w: ar.w - 0.1, seed: 131 });
    // houses beyond close every view west through the arch (the lane turns north between them)
    for (const [hx, hz, hw, sd, n] of [[S.x0 - 26, ar.z + 2.6, 7.0, 1301, 1], [S.x0 - 14, ar.z + 6.0, 5.9, 1302, 2]]) {
      const cF = yawFrame([hx, 0, hz], Math.PI / 2 - 0.06);
      const ci = house(kits.west, cF, { w: hw, d: 8.0, storeys: n, roof: 'side', seed: sd, lod: 'low', party: { left: false, right: false } });
      houses.push({ ...ci, frame: cF, center: [hx, hz], yaw: Math.PI / 2, side: 'west', back: true });
    }
  }
  gateway(kits.east, yawFrame([gt.x, 0, gt.z], gt.yaw), { w: gt.w, lod: lodAt(gt.x, gt.z), seed: 81, wall: 3.6 });
  fountain(kits.centre, frame([CLING.fountain.x, 0, CLING.fountain.z]), { r: CLING.fountain.r, pillarH: CLING.fountain.pillarH, lod: lodAt(CLING.fountain.x, CLING.fountain.z) });
  stonePier(kits.south, frame([CLING.support.x, 0, CLING.support.z]), { lod: lodAt(CLING.support.x, CLING.support.z) });
  kingsSteps(kits.south, yawFrame([st.x, 0, st.z], Math.PI), { n: st.n, w: st.w, rise: st.rise, tread: st.tread, lod: lodAt(st.x, st.z) });
  // the alley (the vendor's crate is stored here): a lane north between the houses, bending east
  // after ~10 m; a house closes the view up it from the square, more houses line its far leg
  const alleyPts = [[al.x, S.z0 + 0.6], [al.x, S.z0 - 9.6], [al.x + 2.2, S.z0 - 13.5], [al.x + 7.5, S.z0 - 18.5]];
  lane(kits.north, alleyPts, { w: al.w, seed: 121 });
  const lone = (key, x, z, yaw, w, d, seed, extra = {}) => {
    const hF = yawFrame([x, 0, z], yaw);
    const info = house(kits[key], hF, { w, d, storeys: extra.storeys ?? 1, roof: extra.roof ?? (rnd() < 0.5 ? 'side' : 'front'), seed, lod: extra.lod ?? lodAt(x, z), party: extra.party ?? { left: false, right: false }, ...extra });
    houses.push({ ...info, frame: hF, center: [x, z], yaw, side: key, back: !!extra.back });
  };
  lone('north', al.x - 3.6, S.z0 - 10.9 - 4.2, 0, 6.6, 8.4, 977, { roof: 'side' });                    // closes the vista up the alley
  lone('north', al.x + 7.6, S.z0 - 14.2, -Math.PI / 2 + 0.75, 6.0, 7.6, 978, { lod: 'low' });           // along the far leg
  lone('north', al.x + 9.4, S.z0 - 24.0, -0.35, 7.0, 8.0, 979, { lod: 'low' });                          // closing the far leg
  lone('north', al.x + 0.4, S.z0 - 25.6, 0.12, 6.4, 8.0, 980, { lod: 'low', roof: 'front' });             // behind the bend (no sky through the alley)
  // second rows behind the square's houses (roofs over the first row, fronts in every gap): no
  // vista out of the square ends in an empty field
  const backRow = (key, x0, z0, dir, len, yaw, gaps = []) => row(key, x0, z0, dir, len, yaw, gaps, 'low');
  backRow('north', S.x0 - 9, S.z0 - 12.5, [1, 0], al.x - 7.5 - (S.x0 - 9), 0);
  backRow('north', al.x + 13, S.z0 - 12.5, [1, 0], S.x1 + 9 - (al.x + 13), 0);
  backRow('west', S.x0 - 12.5, S.z1 + 6, [0, -1], (S.z1 + 6) - (ar.z + 9), Math.PI / 2);
  backRow('west', S.x0 - 12.5, ar.z - 4.5, [0, -1], (ar.z - 4.5) - (S.z0 - 8), Math.PI / 2);
  backRow('east', S.x1 + 12.5, S.z0 - 8, [0, 1], (gt.z - 7) - (S.z0 - 8), -Math.PI / 2);
  backRow('east', S.x1 + 12.5, gt.z + 7, [0, 1], (S.z1 + 6) - (gt.z + 7), -Math.PI / 2);
  backRow('south', S.x0 - 9, S.z1 + 14.5, [1, 0], (S.x1 + 9) - (S.x0 - 9), Math.PI);
  // the broad road beyond the gate: houses on both sides for the first stretch, then open country
  if (opts.road !== false) {
    row('east', S.x1 + 23.5, gt.z - 4.6, [1, 0], 32, 0, [[12, 17]], 'low');
    row('east', S.x1 + 24.5, gt.z + 4.6, [1, 0], 28, Math.PI, [], 'low');
    // puddles standing in the wheel ruts of the road
    for (let k = 0; k < 7; k++) puddle(kits.east, gt.x + 4 + k * 5.5 + rnd.sym(1.5), gt.z + (k % 2 ? 0.8 : -0.8) + rnd.sym(0.2), rnd.range(0.25, 0.6), 0.035, rnd(), 2.4);
  }
  // set dressing by a few doors (clear of the escape routes, the stall and the music space): barrels,
  // crates, sacks, a hand cart - the life of the square
  if (opts.dressing !== false) {
    const dr = makeRand((opts.seed ?? 5) + 303);
    const keep = [[CLING.arch.x, CLING.arch.z, 6], [CLING.gate.x, CLING.gate.z, 7], [CLING.alley.x, CLING.alley.z, 4], [CLING.stall.x, CLING.stall.z, 4], [CLING.music.x, CLING.music.z, 4], [CLING.steps.x, CLING.steps.z, 9], [CLING.support.x, CLING.support.z, 4]];
    let placed = 0;
    for (const h of houses) {
      if (placed >= 7 || h.back || !h.doors || !h.doors.length || dr() < 0.55) continue;
      const d0 = h.doors[0];
      const side = dr() < 0.5 ? -1 : 1;
      const lx = d0.x + side * (d0.w / 2 + 0.75), lz = d0.z + 0.55;
      const p = xf(h.frame, lx, 0, lz);
      if (keep.some(([kx, kz, r]) => Math.hypot(p[0] - kx, p[2] - kz) < r)) continue;
      if (p[0] < S.x0 - 1 || p[0] > S.x1 + 1 || p[2] < S.z0 - 1 || p[2] > S.z1 + 3) continue;
      const Fd = sub(h.frame, [lx, 0, lz], [1, 0, 0], [0, 1, 0]);
      const k = placed % 4;
      const kit = kits[h.side] || kits.centre;
      if (k === 0) { barrel(kit, Fd, dr); barrel(kit, sub(Fd, [side * 0.62, 0, 0.05]), dr); }
      else if (k === 1) { crate(kit, Fd, dr, { w: 0.7, d: 0.5, h: 0.5 }); crate(kit, sub(Fd, [0.03, 0.52, 0.02]), dr, { w: 0.55, d: 0.45, h: 0.42 }); sack(kit, sub(Fd, [side * 0.65, 0, 0.1]), dr); }
      else if (k === 2) { handcart(kit, sub(Fd, [side * 0.4, 0, 0.6], [0, 0, side], [0, 1, 0]), dr); }
      else { barrel(kit, Fd, dr, { onSide: true }); sack(kit, sub(Fd, [side * 0.7, 0, 0.0]), dr); sack(kit, sub(Fd, [side * 1.05, 0, 0.12]), dr); }
      placed++;
    }
  }
  // the square's paving (its own kit: one mesh), clear of the fountain, the steps and the wall feet
  if (opts.paving !== false) {
    kits.paving = new Kit(0);
    const fx = CLING.fountain.x, fz = CLING.fountain.z, fr = CLING.fountain.r + 0.85;
    // the walking lines worn into the cobbles: steps, arch, gate and alley to the fountain, and out
    // of every door
    const paths = [[[st.x, st.z - 0.5], [1.5, 5], [fx, fz + fr]], [[ar.x + 1.2, ar.z - 0.2], [-8, 8], [fx - fr, fz + 1]], [[gt.x - 0.9, gt.z], [8, 2], [fx + fr, fz]], [[al.x, S.z0 + 0.5], [-4, -8], [fx - 1.5, fz - fr]]];
    for (const h of houses) {
      if (h.back || !h.doors) continue;
      for (const d of h.doors) { const a = xf(h.frame, d.x, 0, d.z + 0.3), b = xf(h.frame, d.x, 0, d.z + 3.2); paths.push([[a[0], a[2]], [b[0], b[2]]]); }
    }
    const pdist = (x, z) => (focus.length ? Math.min(...focus.map(([qx, qz]) => Math.hypot(x - qx, z - qz))) : 15);
    paving(kits.paving, S.x0 + 0.45, S.x1 - 0.45, S.z0 + 0.45, st.z - 0.1, {
      seed: (opts.seed ?? 5) + 55, wear: opts.wear ?? 0.5,
      skip: (x, z) => Math.hypot(x - fx, z - fz) < fr,
      // the fountain's overflow runs in a kennel across the square and out under the gate
      kennel: [[fx + fr * 0.95, fz + 0.6], [7, 2.5], [14, 4.0], [gt.x - 0.3, gt.z]],
      paths, lodAt: (x, z) => { const d = pdist(x, z); return d < 12 ? 2 : d < 26 ? 1 : 0; },
    });
    // damp and dirt along the foot of every house front: a dark band on the earth and the cobbles
    for (const [ax, az, bx, bz, nx, nz] of houseFootSegments(houses)) {
      // (frame: x along the wall, y into the wall - the stain runs 'down' y, out across the ground -
      // z up; a wall whose x x inward points down is walked from its other end)
      const L = Math.hypot(bx - ax, bz - az);
      let X = [(bx - ax) / L, 0, (bz - az) / L], o0 = [ax, 0, az];
      const Y = [-nx, 0, -nz];
      if (X[2] * Y[0] - X[0] * Y[2] < 0) { X = [-X[0], 0, -X[2]]; o0 = [bx, 0, bz]; }
      const Fg = frame(o0, X, Y);
      grimeBand(kits.paving, Fg, 0.05, L - 0.05, 0.0, 0.55, rnd, { strength: 0.55, z: 0.014 });
    }
  }
  if (opts.layoutOnly) return { houses, layout: CLING, kits };
  const group = new THREE.Group();
  group.name = 'cling-square';
  let tris = 0;
  for (const [k, kt] of Object.entries(kits)) { const g = kt.build(M, { name: `cling-${k}` }); g.name = `cling-${k}`; tris += g.userData.tris; group.add(g); }
  const beamMesh = group.children.find((g) => g.name === 'cling-beam') || null;
  return { group, houses, layout: CLING, tris, materials: M, beam: { group: beamMesh, ...(beamInfo || {}) } };
}
void door; void archRing;

/**
 * Weeds and grass along the foot of walls (where feet and cart wheels do not reach): placement
 * for sets/grass.js grassField. segments: [[x0, z0, x1, z1, outX, outZ], ...] (wall foot lines and
 * their outward normals). Returns place(rng) -> [x, y, z] | null.
 */
export function wallFootPlacer(segments, { depth = 0.35, groundY = 0 } = {}) {
  const lens = segments.map((s) => Math.hypot(s[2] - s[0], s[3] - s[1]));
  const total = lens.reduce((a, b) => a + b, 0);
  return (rng) => {
    let r = rng() * total, k = 0;
    while (k < lens.length - 1 && r > lens[k]) { r -= lens[k]; k++; }
    const s = segments[k];
    let f = r / Math.max(lens[k], 1e-6);
    // weeds where feet and wheels do not reach: tufts in the corners and by the door jambs, a few
    // in the joints elsewhere (about a quarter of the wall foot), never a continuous border
    const toCorner = Math.min(f, 1 - f) * lens[k];
    if (toCorner > 0.8) {
      const patch = fbm3(s[0] * 0.3 + f * lens[k] * 0.9, k * 1.7, s[1] * 0.3, 2);
      if (patch < 0.25 || rng() < 0.6) return null;
    } else if (rng() < 0.25) f = f < 0.5 ? Math.pow(rng(), 2) * 0.6 / lens[k] : 1 - Math.pow(rng(), 2) * 0.6 / lens[k];
    const d = Math.pow(rng(), 2.6) * depth;
    return [s[0] + (s[2] - s[0]) * f + s[4] * (d + 0.03), groundY, s[1] + (s[3] - s[1]) * f + s[5] * (d + 0.03)];
  };
}

/** Wall-foot segments of the square's houses (fronts and exposed sides), world coords. */
export function houseFootSegments(houses) {
  const out = [];
  for (const h of houses) {
    if (h.back) continue;
    const F = h.frame;
    const P = (x, z) => xf(F, x, 0, z);
    const n = [F[9], F[11]];
    const a = P(-h.w / 2, h.d / 2), b = P(h.w / 2, h.d / 2);
    out.push([a[0], a[2], b[0], b[2], n[0], n[1]]);
  }
  return out;
}
