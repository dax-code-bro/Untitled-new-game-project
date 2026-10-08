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
import { Kit, frame, yawFrame, sub, makeRand, block, tube, xf, lathe } from './core.js';
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

/**
 * The fountain (the reference landmark): a round basin wall of curved dressed blocks with a
 * projecting coping, a step around it, water, and the central stone pillar - a square plinth,
 * a shaft of stacked drums, a moulded capital and a finial; iron spouts.
 * F: centre of the fountain at ground level.
 */
export function fountain(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 91);
  const R = o.r ?? 3.0, hW = o.h ?? 0.72, ph = o.pillarH ?? 3.4;
  const lod = LOD[o.lod || 'mid'];
  const ring = (r0, r1, y0, y1, n, mat, opts = {}) => {
    const rm = (r0 + r1) / 2, dr = r1 - r0;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + (opts.phase || 0), a1 = ((i + 1) / n) * Math.PI * 2 + (opts.phase || 0) - 0.006 / rm;
      const am = (a0 + a1) / 2, span = (a1 - a0) * rm;
      const Fb = sub(F, [0, (y0 + y1) / 2, 0]);
      block(kit.get(mat), Fb, span, y1 - y0 - 0.006, dr, {
        r: opts.r ?? 0.015, rs: lod.rs, seg: [Math.max(0.1, span / 6), Math.max(lod.seg, (y1 - y0) / 2), Math.max(0.08, dr / 3)], seed: rnd(), noise: 0.003, nf: 6, chip: 0.01, pillow: 0.002,
        warp: (lx, ly, lz) => { const th = am - lx / rm; const rr = rm + lz + (opts.lip && ly > 0 ? opts.lip * (lz / dr + 0.5) : 0); return [Math.cos(th) * rr, ly + (opts.dome ? opts.dome * (1 - (2 * lz / dr) ** 2) * (ly > 0 ? 1 : 0) : 0), Math.sin(th) * rr]; },
      });
    }
    // the bedding and the pointed joints between the segments: a mortar annulus a little inside the stones
    const e = 0.012;
    lathe(kit.get('mortar'), F, [[r1 - e, y0 + 0.004], [r1 - e, y1 - e], [r0 + e, y1 - e], [r0 + e, y0 + 0.004], [r1 - e, y0 + 0.004]], 96, { ao: 0.5 });
  };
  // a step round the basin (two courses of slabs), the basin wall (two courses), the coping
  ring(R + 0.05, R + 0.75, -0.05, 0.16, 18, 'stoneDressed', { phase: 0.1 });
  ring(R - 0.38, R, 0.16, 0.48, 16, 'stoneDressed', { phase: 0.0 });
  ring(R - 0.38, R, 0.48, hW - 0.1, 16, 'stoneDressed', { phase: 0.2 });
  ring(R - 0.48, R + 0.1, hW - 0.1, hW + 0.06, 14, 'stoneDressed', { phase: 0.35, dome: 0.03 });
  // basin floor and water
  block(kit.get('stoneDressed'), sub(F, [0, 0.1, 0]), (R - 0.38) * 2, 0.1, (R - 0.38) * 2, { r: 0.02, seg: [1, 0.1, 1], seed: rnd(), warp: (lx, ly, lz) => { const k = Math.max(Math.abs(lx), Math.abs(lz)) / Math.hypot(lx, lz) || 1; return [lx * k * 0.98, ly, lz * k * 0.98]; } });
  {
    const acc = kit.get('water');
    const n = 48, wy = hW - 0.2;
    const c = xf(F, 0, wy, 0);
    const ci = acc.v(c[0], c[1], c[2], 0, 0, 0, 1, 0, 0, 1, 0);
    const ids = [];
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; const p = xf(F, Math.cos(a) * (R - 0.37), wy, Math.sin(a) * (R - 0.37)); ids.push(acc.v(p[0], p[1], p[2], 0, 0, 0, 1, 0, 0, 1, 0)); }
    for (let i = 0; i < n; i++) acc.t(ci, ids[i + 1], ids[i]);
  }
  // the pillar: a square stepped plinth, a shaft of drums, a capital, a finial
  const sq = (s, y0, y1, mat = 'stoneDressed', taper = 0) => block(kit.get(mat), sub(F, [0, (y0 + y1) / 2, 0], [Math.cos(0.12), 0, Math.sin(0.12)], [0, 1, 0]), s, y1 - y0, s, { r: 0.02, rs: lod.rs, seg: [0.15, Math.max(lod.seg, (y1 - y0) / 2), 0.15], seed: rnd(), noise: 0.003, nf: 6, chip: 0.012, warp: taper ? (lx, ly, lz) => { const k = 1 - taper * (ly / (y1 - y0) + 0.5); return [lx * k, ly, lz * k]; } : undefined });
  sq(1.5, 0.08, 0.44); sq(1.15, 0.44, 0.8);
  const shaftR = 0.36;
  let y = 0.8;
  sq(0.92, y, y + 0.3, 'stoneDressed', 0.18); y += 0.3;
  const drums = Math.max(3, Math.round((ph - 1.6) / 0.42));
  for (let i = 0; i < drums; i++) {
    const hh = (ph - 1.6) / drums;
    block(kit.get('stoneDressed'), sub(F, [0, y + hh / 2, 0], [Math.cos(i), 0, Math.sin(i)], [0, 1, 0]), shaftR * 2, hh - 0.008, shaftR * 2, {
      r: 0.03, rs: lod.rs, seg: [0.08, Math.max(0.1, hh / 2), 0.08], seed: rnd(), noise: 0.003, nf: 6, chip: 0.01,
      // a square block dressed round (an octagonal arris left here and there)
      warp: (lx, ly, lz) => { const u = lx / shaftR, v = lz / shaftR; const m = Math.sqrt(Math.max(0, 1 - v * v / 2)), n2 = Math.sqrt(Math.max(0, 1 - u * u / 2)); return [lx * m * (1 - 0.02 * i), ly, lz * n2 * (1 - 0.02 * i)]; },
    });
    y += hh;
  }
  sq(0.86, y, y + 0.16); y += 0.16;
  sq(1.0, y, y + 0.22); y += 0.22;
  // finial: a tapering stone with a ball
  block(kit.get('stoneDressed'), sub(F, [0, y + 0.3, 0], [Math.cos(0.7), 0, Math.sin(0.7)], [0, 1, 0]), 0.5, 0.6, 0.5, { r: 0.03, seg: [0.1, 0.15, 0.1], seed: rnd(), noise: 0.002, warp: (lx, ly, lz) => { const k = 1 - 0.75 * (ly / 0.6 + 0.5); return [lx * k, ly, lz * k]; } });
  {
    const acc = kit.get('stoneDressed');
    const c = [0, y + 0.72, 0];
    block(acc, sub(F, c), 0.26, 0.26, 0.26, { r: 0.12, rs: 2, seg: [0.05, 0.05, 0.05], seed: rnd(), noise: 0.003, nf: 8 });
  }
  // spouts: four iron pipes from the shaft into the basin
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.12 + Math.PI / 4;
    const p0 = xf(F, Math.cos(a) * (shaftR - 0.05), 1.55, Math.sin(a) * (shaftR - 0.05)), p1 = xf(F, Math.cos(a) * (shaftR + 0.28), 1.52, Math.sin(a) * (shaftR + 0.28));
    tube(kit.get('iron'), [p0, p1], 0.025, { sides: 8, caps: true });
  }
  return { r: R, h: hW, pillarH: y + 0.85 };
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

/** The king's steps with a terrace and a low parapet; F at the foot centre, rising toward -z. */
export function kingsSteps(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 111);
  const n = o.n ?? 7, w = o.w ?? 14, rise = o.rise ?? 0.24, tread = o.tread ?? 1.0;
  steps(kit, F, { n, w, rise, tread, lod: o.lod || 'mid', seed: rnd() * 999, mat: 'stoneDressed', wear: 0.03, landing: 0.0 });
  // cheek walls at both ends of the flight (squared stone) and the terrace front behind
  const H = n * rise;
  for (const sx of [-1, 1]) {
    const len = n * tread + 0.4;
    masonryFace(kit, sx > 0 ? sub(F, [w / 2 + 0.6, 0, 0.2], [0, 0, -1], [0, 1, 0]) : sub(F, [-w / 2 - 0.6, 0, -len + 0.2], [0, 0, 1], [0, 1, 0]), len, H + 0.5, { style: 'squared', mat: 'stoneGrey', dressedMat: 'stoneDressed', mortar: 'mortar', T: 0.6, lod: o.lod || 'mid', seed: rnd() * 999 });
    block(kit.get('stoneDressed'), sub(F, [sx * (w / 2 + 0.3), H + 0.58, -len / 2 + 0.2]), 0.66, 0.16, len + 0.05, { r: 0.02, seg: [0.2, 0.08, 0.3], seed: rnd(), noise: 0.003, chip: 0.01 });
  }
  // the terrace paving at the top (flags)
  const tz0 = -n * tread, depth = o.terrace ?? 5;
  for (let z = 0; z < depth; z += 0.62) for (let x = -w / 2; x < w / 2; x += 0.8) {
    const fw = Math.min(0.8, w / 2 - x) - 0.01, fd = Math.min(0.62, depth - z) - 0.01;
    block(kit.get('stoneDressed'), sub(F, [x + fw / 2 + rnd.sym(0.005), H - 0.05 + rnd.sym(0.004), tz0 - z - fd / 2]), fw, 0.1, fd, { r: 0.008, seg: [0.4, 0.1, 0.4], seed: rnd(), noise: 0.002, nf: 5, chip: 0.006, skip: 8 });
  }
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
