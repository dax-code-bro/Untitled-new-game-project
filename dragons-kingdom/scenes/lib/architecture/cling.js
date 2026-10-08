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
import { archMaterials } from './materials.js';

/** The fixed layout (metres; y up; north = -z; the steps at the south edge). */
export const CLING = {
  square: { x0: -20, x1: 20, z0: -18, z1: 24 },
  fountain: { x: 0, z: -2, r: 3.0, pillarH: 3.4 },
  steps: { x: 4, z: 18.0, w: 14, n: 7, rise: 0.24, tread: 1.0 },          // rising to the south
  support: { x: 12.9, z: 19.4 },                                          // stone support, screen right of the steps
  arch: { x: -19.6, z: 16.5, yaw: Math.PI / 2, w: 3.6, h: 5.4 },           // west side, facing east into the square
  gate: { x: 20.4, z: 4.75, yaw: -Math.PI / 2, w: 5.2 },                   // east side, the broad road beyond
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
 * The gate to the broad road (escape route 2): two massive dressed piers with caps, low walls
 * returning to the neighbouring houses, a pair of ledged-and-braced oak gate leaves standing
 * open against the inside of the piers. F: centre of the opening at ground level, the road at -z.
 */
export function gateway(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 81);
  const w = o.w ?? 5.2, ph = o.pierH ?? 3.8, pw = o.pierW ?? 1.25;
  const lod = o.lod || 'mid';
  for (const sx of [-1, 1]) {
    const cx = sx * (w / 2 + pw / 2);
    masonryBox(kit, sub(F, [cx, 0, 0]), { w: pw, d: pw, h: ph, T: pw / 2, style: 'ashlar', mat: 'stoneDressed', dressedMat: 'stoneDressed', mortar: 'mortar', lod, seed: rnd() * 999, courseMin: 0.3, courseMax: 0.42, plinth: 0.4, quoin: { long: 0.6, short: 0.5 } });
    // a cap: a moulded slab and a pyramidal top stone
    block(kit.get('stoneDressed'), sub(F, [cx, ph + 0.1, 0]), pw + 0.18, 0.2, pw + 0.18, { r: 0.02, rs: 1, seg: [0.2, 0.1, 0.2], seed: rnd(), noise: 0.003, nf: 6, chip: 0.012 });
    block(kit.get('stoneDressed'), sub(F, [cx, ph + 0.42, 0]), pw * 0.9, 0.44, pw * 0.9, { r: 0.02, rs: 1, seg: [0.15, 0.1, 0.15], seed: rnd(), noise: 0.003, nf: 6, chip: 0.012, warp: (lx, ly, lz) => { const f = (ly + 0.22) / 0.44; const k = 1 - 0.85 * f; return [lx * k, ly, lz * k]; } });
    // iron hinge pins (gudgeons) on the inner face
    for (const y of [0.5, 2.3]) tube(kit.get('iron'), [xf(F, sx * (w / 2 + 0.02), y, 0.35), xf(F, sx * (w / 2 - 0.05), y, 0.35)], 0.02, { sides: 6, caps: true });
    // walls returning to the houses on either side
    const wl = o.wall ?? 2.0;
    if (wl > 0) masonryFace(kit, sx > 0 ? sub(F, [w / 2 + pw, 0, 0.35]) : sub(F, [-w / 2 - pw - wl, 0, 0.35]), wl, 2.4, { style: 'rubble', mat: 'stoneGrey', dressedMat: 'stoneDressed', mortar: 'mortar', T: 0.7, lod, seed: rnd() * 999, back: true });
  }
  // the gate leaves: ledged, braced oak, opened inward (toward the square, +z) against the piers
  for (const [sx, hinge] of [[-1, 'left'], [1, 'right']]) {
    const lw = w / 2 - 0.05;
    const ang = o.open ?? 1.35;
    const s = Math.sin(ang), c = Math.cos(ang);
    const hx = sx * (w / 2 - 0.02);
    const X = hinge === 'left' ? [c, 0, s] : [-c, 0, s];
    const Fl = sub(F, [hx, 0.08, 0.35], X, [0, 1, 0]);
    const rr = makeRand(rnd() * 999);
    const nb = Math.round(lw / 0.18);
    for (let i = 0; i < nb; i++) {
      const xa = lw * i / nb, xb = lw * (i + 1) / nb - 0.004;
      const hh = 3.0 - 0.0;
      block(kit.get('oakDark'), sub(Fl, [(xa + xb) / 2, hh / 2, 0], [0, 1, 0], [-1, 0, 0]), hh, xb - xa, 0.055, { r: 0.004, seg: [0.6, 0.2, 0.06], seed: rr(), noise: 0.002, nf: 4, chip: 0.005 });
    }
    // ledges and a diagonal brace (on the inner face), strap hinges
    for (const y of [0.35, 1.5, 2.65]) block(kit.get('oakDark'), sub(Fl, [lw / 2, y, -0.05]), lw - 0.06, 0.16, 0.05, { r: 0.006, seg: [0.4, 0.16, 0.05], seed: rr(), noise: 0.002, axis: [1, 0, 0] });
    member(kit, sub(Fl, [0, 0, -0.05]), [0.12, 0.45], [lw - 0.12, 1.42], 0.14, 0.05, rr, { mat: 'oakDark', proud: 0.0 });
    member(kit, sub(Fl, [0, 0, -0.05]), [0.12, 1.6], [lw - 0.12, 2.55], 0.14, 0.05, rr, { mat: 'oakDark', proud: 0.0 });
    for (const y of [0.42, 2.58]) block(kit.get('iron'), sub(Fl, [lw * 0.38, y, 0.034]), lw * 0.75, 0.06, 0.008, { r: 0.002, seg: [0.2, 0.06, 0.008], seed: rr() });
  }
  return { w };
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
    stoneB('stoneWet', sideF(k, rW - wallT / 2 - 0.006, 0.32 + (wy + 0.05 - 0.32) / 2), L, wy + 0.05 - 0.32, 0.016, { r: 0.004, noise: 0.001, pillow: 0 });
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
    // an iron cramp leaded across the joint at the corner
    const [vx, vz] = corner(k, rW + 0.03);
    const t = [-Math.sin(a), 0, Math.cos(a)];
    block(kit.get('iron'), sub(F, [vx, hW + 0.035, vz], t, [0, 1, 0]), 0.2, 0.01, 0.03, { r: 0.003, seg: [0.08, 0.01, 0.03], seed: rnd() });
    block(kit.get('lead'), sub(F, [vx, hW + 0.032, vz], t, [0, 1, 0]), 0.24, 0.006, 0.05, { r: 0.004, seg: [0.1, 0.006, 0.05], seed: rnd() });
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
    // the head: a block that narrows to a muzzle (worn smooth), the mouth low
    block(kit.get('stoneDressed'), Fh, 0.24, 0.26, 0.26, { r: 0.05, rs: 2, seg: [0.05, 0.05, 0.05], seed: rnd(), noise: 0.006, nf: 9, chip: 0.006,
      warp: (lx, ly, lz) => { const f = (lz / 0.26 + 0.5); const k2 = 1 - 0.4 * f; return [lx * k2, ly * (1 - 0.3 * f) - 0.04 * f * f, lz]; } });
    const m0 = xf(Fh, 0, -0.07, 0.08), m1 = xf(Fh, 0, -0.08, 0.2);
    tube(kit.get('lead'), [m0, m1], 0.016, { sides: 8, caps: true });
    // the jet: a falling arc from the pipe into the basin
    const v0 = 1.2, g = 9.81, pts = [];
    const yw0 = xf(F, 0, wy, 0)[1];
    for (let k = 0; k <= 20; k++) {
      const tt = k * 0.025;
      const p = xf(Fh, 0, -0.08 - 0.5 * g * tt * tt, 0.2 + v0 * tt);
      if (p[1] < yw0) { pts.push([p[0], yw0 - 0.005, p[2]]); break; }
      pts.push(p);
    }
    tube(kit.get('jet'), pts, (t) => 0.01 + 0.006 * t, { sides: 7 });
    jets.push(pts[pts.length - 1]);
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
 * Cobbled paving (setts laid in rows, joints filled with earth): over x0..x1, z0..z1 (world),
 * skipping where skip(x, z) is true; worn through to the earth in patches and along the house
 * walls. Each sett a flat-topped block, a little tilted and proud or sunk - under a low sun the
 * square reads as stone, not as a texture. o: { mat ('stoneSett'), seed, wear (0..1) }.
 */
export function paving(kit, x0, x1, z0, z1, o = {}) {
  const rnd = makeRand(o.seed ?? 55);
  const acc = kit.get(o.mat || 'stoneSett');
  const skip = o.skip || (() => false);
  const wear = o.wear ?? 0.5;
  let z = z0, n = 0;
  while (z < z1 - 0.08) {
    const d = rnd.range(0.11, 0.16);
    let x = x0 + rnd.range(0, 0.12);
    // rows wander a little (the setts were laid by eye)
    const zr = z + 0.02 * Math.sin(z * 0.7) ;
    while (x < x1 - 0.08) {
      const w = rnd.range(0.12, 0.24);
      const cx = x + w / 2, cz = zr + d / 2;
      x += w;
      if (skip(cx, cz)) continue;
      // worn patches (earth showing), single lost setts
      const wn = fbm3(cx * 0.16 + 4.1, 0.3, cz * 0.16 - 2.2, 3);
      if (wn > 0.62 - 0.35 * wear || rnd() < 0.015) continue;
      const g = rnd.range(0.012, 0.024);
      const top = 0.025 + rnd.sym(0.008) - Math.max(0, wn) * 0.02;
      const h = 0.09;
      const tx = rnd.sym(0.035), tz = rnd.sym(0.035), yaw = rnd.sym(0.05);
      const F = sub(frame([0, 0, 0]), [cx, top - h / 2, cz], [Math.cos(yaw), tx, -Math.sin(yaw)], [-tx, 1, tz]);
      block(acc, F, w - g, h, d - g * 0.8, { r: 0, seg: [9, 9, 9], skip: 8, seed: rnd(), uvMode: 'box' });
      n++;
    }
    z += d;
  }
  return n;
}

/** The substantial stone support beside the king's steps: a battered square pier with a cap. */
export function stonePier(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 101);
  const w = o.w ?? 1.7, h = o.h ?? 4.3;
  masonryBox(kit, F, { w, d: w, h, T: w / 2, style: 'ashlar', mat: 'stoneDressed', dressedMat: 'stoneDressed', mortar: 'mortar', lod: o.lod || 'mid', seed: rnd() * 999, courseMin: 0.3, courseMax: 0.44, plinth: 0.5, quoin: { long: 0.8, short: 0.6 } });
  block(kit.get('stoneDressed'), sub(F, [0, h + 0.12, 0]), w + 0.2, 0.24, w + 0.2, { r: 0.025, rs: 1, seg: [0.2, 0.12, 0.2], seed: rnd(), noise: 0.004, nf: 6, chip: 0.014, warp: (lx, ly, lz) => [lx, ly + (ly > 0 ? 0.08 * (1 - Math.max(Math.abs(lx), Math.abs(lz)) / ((w + 0.2) / 2)) : 0), lz] });
  // an iron ring and a worn patch where generations have leaned on it
  const p = xf(F, 0, 1.25, w / 2 + 0.03);
  const ringPts = [];
  for (let k = 0; k <= 14; k++) { const a = (k / 14) * Math.PI * 2; ringPts.push(xf(F, Math.sin(a) * 0.07, 1.12 + Math.cos(a) * 0.07, w / 2 + 0.035)); }
  tube(kit.get('iron'), ringPts, 0.01, { sides: 6 });
  tube(kit.get('iron'), [p, xf(F, 0, 1.25, w / 2 - 0.05)], 0.02, { sides: 6, caps: true });
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
  steps(kit, F, { n, w, rise, tread, lod, seed: rnd() * 999, mat: 'stoneDressed', wear: 0.03, landing: 0.0 });
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
  for (let z = 0; z < depth; z += 0.62) for (let x = -w / 2; x < w / 2; x += 0.8) {
    const fw = Math.min(0.8, w / 2 - x) - 0.01, fd = Math.min(0.62, depth - z) - 0.01;
    block(kit.get('stoneDressed'), sub(F, [x + fw / 2 + rnd.sym(0.005), H - 0.05 + rnd.sym(0.004), tz0 - z - fd / 2]), fw, 0.1, fd, { r: 0.008, seg: [0.4, 0.1, 0.4], seed: rnd(), noise: 0.002, nf: 5, chip: 0.006, skip: 8 });
  }
  return { top: H, terrace: [tz0, tz0 - depth] };
}

/** The alley floor: a lane of setts with a central gutter channel, F at its mouth, running to -z. */
export function alley(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 121);
  const w = o.w ?? 2.6, L = o.length ?? 14;
  for (let z = 0; z < L; z += 0.16) {
    let x = -w / 2;
    while (x < w / 2) {
      const sw = rnd.range(0.12, 0.2);
      const xa = x, xb = Math.min(w / 2, x + sw);
      const ch = Math.abs((xa + xb) / 2) < 0.18 ? 0.03 : 0;     // the gutter in the middle
      block(kit.get('stoneGrey'), sub(F, [(xa + xb) / 2, -0.04 - ch + rnd.sym(0.006), -z - 0.075]), xb - xa - 0.012, 0.1, 0.15, { r: 0.02, seg: [0.2, 0.1, 0.2], seed: rnd(), noise: 0.004, nf: 8, pillow: 0.008, skip: 8 });
      x += sw;
    }
  }
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
  const M = await archMaterials(ctx, opts.materials || {});
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
  const row = (key, x0, z0, dir, len, yaw, gaps = []) => {
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
      const set = rnd.sym(0.35);                      // the frontage line is never straight
      const cx = x0 + dir[0] * (off + w / 2), cz = z0 + dir[1] * (off + w / 2);
      const nx = Math.sin(yaw), nz = Math.cos(yaw);
      const px = cx - nx * (d / 2 - set), pz = cz - nz * (d / 2 - set);
      const atEnd = nextGap ? (nextGap[0] - (off + w) < 0.5) : (len - (off + w) < 0.5);
      const seed = hs++;
      const tall = rnd() < 0.4;
      const hF = yawFrame([px, 0, pz], yaw + rnd.sym(0.025));
      // the house's own left/right (looking at its front) against the row direction
      const along = Math.cos(yaw) * dir[0] - Math.sin(yaw) * dir[1] > 0;
      const info = house(kits[key], hF, {
        w: w - 0.04, d, storeys: tall ? 2 : 1, roof: rnd() < 0.62 ? 'front' : 'side', seed: seed * 13 + (opts.seed ?? 5),
        lod: lodAt(cx, cz), party: along ? { left: !first, right: !atEnd } : { left: !atEnd, right: !first },
        damage: opts.damage ? (p) => opts.damage(...xf(hF, p[0], p[1], p[2])) : undefined,
      });
      houses.push({ ...info, frame: hF, center: [cx, cz], yaw, side: key });
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
  const gHalf = gt.w / 2 + 1.25 + 3.6;
  row('east', S.x1, S.z0, [0, 1], S.z1 + 1 - S.z0, -Math.PI / 2, [[gt.z - gHalf - S.z0, gt.z + gHalf - S.z0]]);
  // south side either side of the steps (faces north, -z)
  const st = CLING.steps;
  row('south', S.x0 - 3, S.z1 + 2.5, [1, 0], (st.x - st.w / 2 - 1.2) - (S.x0 - 3), Math.PI);
  row('south', st.x + st.w / 2 + 3.5, S.z1 + 2.5, [1, 0], (S.x1 + 3) - (st.x + st.w / 2 + 3.5), Math.PI);
  // landmarks
  archway(kits.west, yawFrame([ar.x, 0, ar.z], ar.yaw), { w: ar.w, h: ar.h, lod: lodAt(ar.x, ar.z), seed: 71 });
  gateway(kits.east, yawFrame([gt.x, 0, gt.z], gt.yaw), { w: gt.w, lod: lodAt(gt.x, gt.z), seed: 81, wall: 3.6 });
  fountain(kits.centre, frame([CLING.fountain.x, 0, CLING.fountain.z]), { r: CLING.fountain.r, pillarH: CLING.fountain.pillarH, lod: lodAt(CLING.fountain.x, CLING.fountain.z) });
  stonePier(kits.south, frame([CLING.support.x, 0, CLING.support.z]), { lod: lodAt(CLING.support.x, CLING.support.z) });
  kingsSteps(kits.south, yawFrame([st.x, 0, st.z], Math.PI), { n: st.n, w: st.w, rise: st.rise, tread: st.tread, lod: lodAt(st.x, st.z) });
  alley(kits.north, frame([al.x, 0, S.z0 + 0.6]), { w: al.w, length: 16 });
  // the alley turns: a house closes its far end (seen through the gap from the square)
  {
    const hF = yawFrame([al.x + 1.5, 0, S.z0 - 15 - 4.5], 0.04);
    const info = house(kits.north, hF, { w: 7.0, d: 8.5, storeys: 1, roof: 'side', seed: 977, lod: lodAt(al.x, S.z0 - 15), party: { left: false, right: false } });
    houses.push({ ...info, frame: hF, center: [al.x, S.z0 - 15], yaw: 0, side: 'north' });
  }
  // the square's paving (its own kit: one mesh), clear of the fountain, the steps and the wall feet
  if (opts.paving !== false) {
    kits.paving = new Kit(0);
    const fx = CLING.fountain.x, fz = CLING.fountain.z, fr = CLING.fountain.r + 0.85;
    paving(kits.paving, S.x0 + 0.45, S.x1 - 0.45, S.z0 + 0.45, st.z - 0.1, {
      seed: (opts.seed ?? 5) + 55, wear: opts.wear ?? 0.5,
      skip: (x, z) => Math.hypot(x - fx, z - fz) < fr,
    });
  }
  const group = new THREE.Group();
  group.name = 'cling-square';
  let tris = 0;
  for (const [k, kt] of Object.entries(kits)) { const g = kt.build(M, { name: `cling-${k}` }); tris += g.userData.tris; group.add(g); }
  return { group, houses, layout: CLING, tris, materials: M };
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
    const f = r / Math.max(lens[k], 1e-6);
    // patchy: whole stretches are clean
    const patch = Math.sin(f * lens[k] * 0.9 + k * 3.1) + Math.sin(f * lens[k] * 2.3 + k);
    if (patch < 0.2 && rng() < 0.85) return null;
    const d = Math.pow(rng(), 2.2) * depth;
    return [s[0] + (s[2] - s[0]) * f + s[4] * (d + 0.03), groundY, s[1] + (s[3] - s[1]) * f + s[5] * (d + 0.03)];
  };
}

/** Wall-foot segments of the square's houses (fronts and exposed sides), world coords. */
export function houseFootSegments(houses) {
  const out = [];
  for (const h of houses) {
    const F = h.frame;
    const P = (x, z) => xf(F, x, 0, z);
    const n = [F[9], F[11]];
    const a = P(-h.w / 2, h.d / 2), b = P(h.w / 2, h.d / 2);
    out.push([a[0], a[2], b[0], b[2], n[0], n[1]]);
  }
  return out;
}
