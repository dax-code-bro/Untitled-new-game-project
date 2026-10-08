// Architecture kit - masonry with construction logic.
//
// A wall face is laid course by course like a mason would: course heights are shared round
// the building (so the corners bond), dressed quoins alternate long and short at every corner,
// openings get dressed jambs that return into the reveal, a lintel or a voussoir arch over the
// head and a projecting sill with a drip below; the irregular gaps a course leaves against a
// sill, a lintel or an arch's extrados are packed with small stones (pinnings). Every stone is
// its own rounded, irregular block (pillowed face, chipped arrises, slight tilt and protrusion)
// set proud of a recessed lime-mortar core that has true reveals through the wall thickness.
//
//   const C = courses(rnd, 3.4, { min: 0.18, max: 0.34 });
//   masonryFace(kit, F, L, H, { courses: C, style: 'rubble', openings: [...], T: 0.6 });
//   masonryBox(kit, F, { w, d, h, T, style, faces: { front: { openings }, ... } });
//
// Face frame F (core.js frame): origin = bottom-left corner of the face ON the mortar surface,
// x along the face (0..L), y up, z out of the wall. Stones stand proud by 8-30 mm.
import * as THREE from 'three';
import { block, shapeFace, sub, makeRand, clamp, xf, tube } from './core.js';

/** Course heights (bottom up) filling H: [{ y, h }]. */
export function courses(rnd, H, { min = 0.18, max = 0.34, joint = 0.015, plinth = 0 } = {}) {
  const out = [];
  let y = 0;
  if (plinth) { out.push({ y: 0, h: plinth }); y = plinth + joint; }
  while (y < H - 0.05) {
    let h = rnd.range(min, max);
    const left = H - y;
    if (left - h - joint < min * 0.8) h = left > max ? (left - joint) / 2 : left;   // the last course(s) fit the remainder
    h = Math.min(h, left);
    out.push({ y, h });
    y += h + joint;
  }
  return out;
}

// stone styles: rounding, pillow, noise, chips, protrusion, tilt, length factors, depth
const STYLE = {
  ashlar: { r: [0.006, 0.012], pillow: [0.001, 0.003], noise: 0.0015, nf: 7, chip: 0.004, prot: [0.004, 0.012], tilt: 0.004, len: [1.4, 2.8], j: 0.008, dep: [0.18, 0.32], sizeJit: 0.004, split: 0 },
  squared: { r: [0.007, 0.015], pillow: [0.002, 0.006], noise: 0.006, nf: 4, chip: 0.014, prot: [0.006, 0.018], tilt: 0.012, len: [1.0, 2.6], j: 0.012, dep: [0.15, 0.3], sizeJit: 0.008, split: 0.12, outline: 0.03, shrink: 0.05 },
  rubble: { r: [0.004, 0.011], pillow: [0.006, 0.016], noise: 0.014, nf: 4.5, chip: 0.03, prot: [0.0, 0.024], tilt: 0.035, len: [0.7, 2.4], j: 0.012, dep: [0.14, 0.28], sizeJit: 0.01, split: 0.25, outline: 0.09, shrink: 0.1 },
  // rubble under generations of lime wash: the coats fill the joints nearly flush and soften every arris
  washed: { r: [0.01, 0.02], pillow: [0.002, 0.007], noise: 0.01, nf: 3.5, chip: 0.008, prot: [-0.004, 0.006], tilt: 0.015, len: [0.7, 2.4], j: 0.01, dep: [0.14, 0.28], sizeJit: 0.01, split: 0.25, outline: 0.08, shrink: 0.1 },
  dressed: { r: [0.008, 0.014], pillow: [0.001, 0.004], noise: 0.002, nf: 7, chip: 0.006, prot: [0.01, 0.018], tilt: 0.004, len: [1, 1], j: 0.01, dep: [0.2, 0.3], sizeJit: 0.003, split: 0 },
};
export const LOD = {
  hero: { seg: 0.07, rs: 2, noct: 1 },
  mid: { seg: 0.22, rs: 1, noiseMul: 0.7, noct: 1 },
  low: { seg: 9, rs: 1, flat: true },
  far: { seg: 9, rs: 1, flat: true, lenMul: 2.2, courseMul: 1.6, protMul: 0.25 },     // silhouettes far off: big flat blocks, fine joints
};

/** One stone in face coords: x0..x1, y0..y1 (face), depth dep, extra opts. */
function stone(kit, F, matName, x0, x1, y0, y1, dep, rnd, st, lod, extra = {}) {
  const w = x1 - x0, h = y1 - y0;
  if (w < 0.03 || h < 0.03) return;
  const prot = (extra.prot ?? rnd.range(st.prot[0], st.prot[1])) * (lod.protMul ?? 1);
  const cx = (x0 + x1) / 2 + rnd.sym(st.sizeJit * 0.3), cy = (y0 + y1) / 2 + rnd.sym(st.sizeJit * 0.3);
  const cz = prot - dep / 2;
  const tl = st.tilt;
  const ay = rnd.sym(tl), ax = rnd.sym(tl), az = rnd.sym(tl * 0.6);
  // small rotation of the stone about its centre (yaw/pitch/roll in the face frame)
  const ca = Math.cos(az), sa = Math.sin(az);
  const X = [ca, sa, 0], Y = [-sa, ca, 0];
  const Xr = [X[0], X[1], X[2] + ay], Yr = [Y[0], Y[1], Y[2] + ax];
  const Fs = sub(F, [cx, cy, cz], Xr, Yr);
  const sx = w - rnd.range(0, st.sizeJit), sy = h - rnd.range(0, st.sizeJit);
  const r = Math.min(rnd.range(st.r[0], st.r[1]) * (extra.rMul ?? 1), 0.4 * Math.min(sx, sy));
  const acc = kit.get(matName);
  let warp = extra.warp;
  if (!warp && st.outline) {
    // irregular outline: every corner pulled inward a little (trapezoids, wider joints at corners)
    const k = st.outline;
    const c = [0, 1, 2, 3].map(() => [rnd() * k * sx, rnd() * k * sy]);
    warp = (lx, ly, lz) => {
      const u = clamp(lx / sx + 0.5, 0, 1), v = clamp(ly / sy + 0.5, 0, 1);
      // corners: 0 (-,-) 1 (+,-) 2 (+,+) 3 (-,+); inward = toward the centre
      const ox = (1 - u) * (1 - v) * c[0][0] - u * (1 - v) * c[1][0] - u * v * c[2][0] + (1 - u) * v * c[3][0];
      const oy = (1 - u) * (1 - v) * c[0][1] + u * (1 - v) * c[1][1] - u * v * c[2][1] - (1 - u) * v * c[3][1];
      return [lx + ox, ly + oy, lz];
    };
  }
  if (lod.flat) {
    // far off the joints are hairlines: the stone nearly fills its cell
    const fx = lod.protMul ? sx + st.j * 0.6 : sx, fy = lod.protMul ? sy + st.j * 0.6 : sy;
    block(acc, Fs, fx, fy, dep, { r: 0, seg: 9, skip: 32, seed: rnd(), aoDepth: lod.protMul ? 0 : prot + 0.02, aoFloor: 0.35, uvMode: 'box' });
    return;
  }
  block(acc, Fs, sx, sy, dep, {
    r, rs: lod.rs, seg: [Math.max(lod.seg, w / 6), Math.max(lod.seg, h / 4), 9], skip: 32,
    seed: rnd(), noise: st.noise * (extra.noiseMul ?? 1) * (lod.noiseMul ?? 1), noct: lod.noct ?? 2, nf: st.nf, pillow: rnd.range(st.pillow[0], st.pillow[1]) * (extra.pillowMul ?? 1),
    chip: st.chip, aoDepth: prot + 0.025, aoFloor: 0.3, uvMode: 'box', warp, aoOpen: extra.aoOpen,
  });
}

/** Excluded x-ranges of a course [ya, yb] by the reserved zones (rects / arch extrados). */
function blockedRanges(zones, ya, yb, j) {
  const out = [];
  for (const z of zones) {
    if (z.kind === 'arch') {
      // extrados circle (cx, cy, R) above the springing line; below it the jambs (a rect zone) hold
      if (yb < z.cy - 1e-3 || ya > z.cy + z.R + j) continue;
      const yy = Math.max(ya, z.cy);
      const dy = yy - z.cy;
      if (dy > z.R + j) continue;
      const hw = Math.sqrt(Math.max(0, (z.R + j) ** 2 - dy * dy));
      out.push([z.cx - hw, z.cx + hw, z]);
    } else {
      if (yb <= z.y0 - j || ya >= z.y1 + j) continue;
      out.push([z.x0 - j, z.x1 + j, z]);
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  // merge
  const m = [];
  for (const r of out) { if (m.length && r[0] <= m[m.length - 1][1]) { m[m.length - 1][1] = Math.max(m[m.length - 1][1], r[1]); m[m.length - 1][2].push(r[2]); } else m.push([r[0], r[1], [r[2]]]); }
  return m;
}

/** Top of the reserved zones under x within a course (for packing above an arch / below a sill). */
function zoneTopAt(zs, x) {
  let top = -1e9;
  for (const z of zs) {
    if (z.kind === 'arch') { const dx = x - z.cx; if (Math.abs(dx) <= z.R) top = Math.max(top, z.cy + Math.sqrt(z.R * z.R - dx * dx)); }
    else if (x >= z.x0 - 0.02 && x <= z.x1 + 0.02) top = Math.max(top, z.y1);
  }
  return top;
}
function zoneBottomAt(zs, x) {
  let bot = 1e9;
  for (const z of zs) {
    if (z.kind === 'arch') continue;
    if (x >= z.x0 - 0.02 && x <= z.x1 + 0.02) bot = Math.min(bot, z.y0);
  }
  return bot;
}

/**
 * Fill one course segment [xa, xb] x [y, y+h] with stones.
 * prevJoints: x positions of the joints of the course below (to break the joints).
 */
function fillSegment(kit, F, matName, xa, xb, y, h, rnd, st, lod, prevJoints, joints, dep) {
  let x = xa;
  const j = st.j;
  let guard = 0;
  while (x < xb - 0.04 && guard++ < 400) {
    let L = h * rnd.range(st.len[0], st.len[1]) * (lod.lenMul || 1);
    if (L < 0.12) L = 0.12 + rnd() * 0.08;
    // break joints: keep 7 cm away from a perpend below
    for (let k = 0; k < 3; k++) {
      const e = x + L;
      const near = prevJoints.find((p) => Math.abs(p - e) < 0.07);
      if (near === undefined) break;
      L += (e < near ? -1 : 1) * 0.09 + rnd.sym(0.02);
    }
    L = Math.max(L, Math.min(0.12, xb - x));
    if (xb - (x + L + j) < Math.max(0.1, h * 0.45)) L = xb - x;    // the last stone takes the remainder
    L = Math.min(L, xb - x);
    if (L < 0.03) break;
    const d = rnd.range(dep[0], dep[1]);
    if (st.split && rnd() < st.split && h > 0.16) {
      // two smaller stones in the course height (random rubble brought to courses)
      const f = rnd.range(0.35, 0.65);
      const L2 = Math.min(L, h * rnd.range(0.8, 1.8));
      stone(kit, F, matName, x, x + L2, y, y + h * f - j / 2, d, rnd, st, lod);
      stone(kit, F, matName, x + rnd.sym(0.03), x + L2 + rnd.sym(0.03), y + h * f + j / 2, y + h, d, rnd, st, lod);
      L = L2;
    } else {
      // a rubble stone does not always fill its course: pinnings above / below
      const shrink = (st.shrink || 0) * rnd() * h;
      const yo = shrink ? rnd.range(0, shrink) : 0;
      stone(kit, F, matName, x, x + L, y + yo, y + h - (shrink - yo), d, rnd, st, lod);
      if (shrink > 0.06 && rnd() < 0.7) {
        const py = yo > shrink / 2 ? y : y + h - (shrink - yo) + j * 0.6;
        const ph = yo > shrink / 2 ? yo - j * 0.6 : shrink - yo - j * 0.6;
        if (ph > 0.035) stone(kit, F, matName, x + L * rnd.range(0, 0.3), x + L * rnd.range(0.5, 1), py, py + ph, d * 0.6, rnd, st, lod, { rMul: 0.6, pillowMul: 0.5 });
      }
    }
    x += L + j;
    joints.push(x - j / 2);
  }
}

/**
 * A masonry face. opts:
 *  courses ([{y, h}]), style ('ashlar' | 'squared' | 'rubble'), mat (accumulator name for the
 *  walling), dressedMat (quoins, jambs, heads, sills), mortar (accumulator name; null = none),
 *  T (wall thickness), openings ([{ x, y, w, h, head: 'lintel' | 'arch' | 'none', sill: bool,
 *  reveal (m, depth of the jamb stones), jamb: true }]), quoinStart(c) / quoinEnd(c) (length
 *  reserved for the quoins at that end of course c), quoins ({ corner: 'end', a(c), b(c) } to
 *  build the corner blocks at the face's end), lod ('hero' | 'mid' | 'low'), seed, plinthOut,
 *  top (bool: lay a capping course of through-stones), back (bool: mortar back face)
 */
export function masonryFace(kit, F, L, H, o = {}) {
  const rnd = makeRand(o.seed ?? 1);
  const st = { ...STYLE[o.style || 'squared'], ...(o.styleOver || {}) };
  const ds = STYLE.dressed;
  const lod = LOD[o.lod || 'mid'];
  const mat = o.mat || 'stoneGrey', dmat = o.dressedMat || mat;
  const C = o.courses || courses(rnd, H, { min: 0.18 * (lod.courseMul || 1), max: 0.34 * (lod.courseMul || 1) });
  const T = o.T ?? 0.6;
  const j = st.j;
  const qs = o.quoinStart || (() => 0), qe = o.quoinEnd || (() => 0);
  const zones = [];
  const ops = o.openings || [];
  // ---- openings: jambs, heads, sills (dressed), and their reserved zones
  for (const op of ops) {
    const head = op.head || 'lintel';
    const rev = op.reveal ?? Math.min(T * 0.7, 0.35);
    const jw = op.jambW ?? 0.3;
    const x0 = op.x, x1 = op.x + op.w, y0 = op.y, y1 = op.y + op.h;
    const isArch = head === 'arch' || head === 'archOpen';
    const spring = isArch ? y1 - op.w / 2 : y1;
    // jambs: one dressed stone per course, long and short alternately (they return into the reveal)
    if (op.jamb !== false) {
      for (const [ci, c] of C.entries()) {
        const ya = Math.max(c.y, y0), yb = Math.min(c.y + c.h, spring);
        if (yb - ya < 0.05) continue;
        const lng = (ci % 2 === 0) ? jw : jw * 0.6;
        const rng2 = (ci % 2 === 0) ? jw * 0.6 : jw;
        stone(kit, F, dmat, x0 - lng - j * 0.5, x0, ya, yb - (yb < spring - 0.01 ? 0 : 0.004), rev, rnd, ds, lod, { prot: 0.012, aoOpen: 2 });
        stone(kit, F, dmat, x1, x1 + rng2 + j * 0.5, ya, yb - (yb < spring - 0.01 ? 0 : 0.004), rev, rnd, ds, lod, { prot: 0.012, aoOpen: 1 });
      }
      zones.push({ x0: x0 - jw - j, x1: x1 + jw + j, y0, y1: spring, kind: 'jamb' });
    } else zones.push({ x0, x1, y0, y1: spring, kind: 'void' });
    if (head === 'lintel') {
      const lh = op.lintelH ?? clamp(0.18 + op.w * 0.08, 0.2, 0.4);
      const bear = op.bearing ?? 0.18 + rnd() * 0.08;
      stone(kit, F, dmat, x0 - bear, x1 + bear, y1 + 0.005, y1 + lh, rev + 0.05, rnd, ds, lod, { prot: 0.016 });
      zones.push({ x0: x0 - bear, x1: x1 + bear, y0: y1, y1: y1 + lh + 0.01, kind: 'lintel' });
    } else if (isArch) {
      // 'archOpen': the voussoirs come from the other face (they run through the wall)
      const r = op.w / 2, vh = op.archH ?? clamp(0.22 + r * 0.12, 0.25, 0.5);
      const cx = (x0 + x1) / 2, cy = spring;
      if (head === 'arch') archRing(kit, F, dmat, cx, cy, r, vh, op.archDepth ?? rev, rnd, lod, { n: op.voussoirs, prot: 0.016 });
      zones.push({ kind: 'arch', cx, cy, R: r + vh });
    }
    if (op.sill) {
      const sh = 0.11, over = 0.07;
      const sx0 = x0 - over, sx1 = x1 + over;
      // weathered sill: sloped top, projecting with a drip groove
      stone(kit, F, dmat, sx0, sx1, y0 - sh, y0 - 0.004, rev + 0.06, rnd, ds, lod, {
        // the top weathers away from the wall: a fall of ~3 cm over the projecting nose
        prot: 0.055, warp: (lx, ly, lz) => [lx, ly - Math.max(0, lz - ((rev + 0.06) / 2 - 0.1)) * 0.3 * (ly > 0 ? 1 : 0), lz],
      });
      zones.push({ x0: sx0, x1: sx1, y0: y0 - sh - 0.005, y1: y0, kind: 'sill' });
    }
  }
  // ---- regular courses
  let prevJ = [];
  for (const [ci, c] of C.entries()) {
    const xa = qs(ci) > 0 ? qs(ci) + j : 0, xb = L - (qe(ci) > 0 ? qe(ci) + j : 0);
    const ya = c.y, yb = c.y + c.h;
    const bl = blockedRanges(zones, ya, yb, j);
    const segs = [];
    let x = xa;
    for (const [b0, b1] of bl) { if (b0 > x) segs.push([x, Math.min(b0, xb)]); x = Math.max(x, b1); }
    if (x < xb) segs.push([x, xb]);
    const joints = [];
    for (const [s0, s1] of segs) if (s1 - s0 > 0.05) fillSegment(kit, F, mat, s0, s1, ya, c.h, rnd, st, lod, prevJ, joints, o.depth || st.dep);
    // packing inside the blocked ranges: above an arch's extrados / a lintel, below a sill
    for (const [b0, b1, zs] of bl) {
      const s0 = Math.max(b0, xa), s1 = Math.min(b1, xb);
      if (s1 - s0 < 0.06) continue;
      let px = s0;
      while (px < s1 - 0.04) {
        const pw = Math.min(s1 - px, rnd.range(0.14, 0.32));
        let top = -1e9, bot = 1e9;
        for (let k = 0; k <= 4; k++) { const xx = px + pw * k / 4; top = Math.max(top, zoneTopAt(zs, xx)); bot = Math.min(bot, zoneBottomAt(zs, xx)); }
        // above the zone, inside this course
        if (yb - (top + j) > 0.045) stone(kit, F, mat, px, px + pw - j, Math.max(ya, top + j), yb, (o.depth || st.dep)[0], rnd, st, lod, { rMul: 0.7 });
        // below the zone (a sill sitting high in its course)
        if (bot < 1e8 && bot - j - ya > 0.045) stone(kit, F, mat, px, px + pw - j, ya, Math.min(yb, bot - j), (o.depth || st.dep)[0], rnd, st, lod, { rMul: 0.7 });
        px += pw;
      }
    }
    prevJ = joints;
  }
  // ---- quoins at the face's end corner (one block per course, alternately long on each face)
  if (o.quoins) {
    const q = o.quoins;
    for (const [ci, c] of C.entries()) {
      const a = q.a(ci), b = q.b(ci);
      if (a <= 0) continue;
      const prot = 0.014;
      // the corner block: x from L - a .. L + prot (face), z from -b .. prot (into the return face)
      const Fq = sub(F, [L - a / 2 + prot / 2, c.y + c.h / 2, -b / 2 + prot / 2]);
      const dep = b + prot;
      const r = rnd.range(ds.r[0], ds.r[1]) * 1.2;
      block(kit.get(dmat), Fq, a + prot - 0.006, c.h - 0.006, dep, lod.flat ? { r: 0, seg: 9, seed: rnd(), uvMode: 'box', skip: 0 } : {
        r, rs: lod.rs, seg: [Math.max(lod.seg, a / 5), Math.max(lod.seg, c.h / 3), Math.max(lod.seg, dep / 5)],
        seed: rnd(), noise: ds.noise, nf: ds.nf, pillow: rnd.range(0.001, 0.004), chip: 0.008, uvMode: 'box',
      });
    }
  }
  // ---- the mortar core (recessed), with true reveals through the wall
  if (o.mortar !== null) {
    const shape = new THREE.Shape();
    const x0 = o.coreX0 ?? 0, x1 = o.coreX1 ?? L;
    shape.moveTo(x0, 0); shape.lineTo(x1, 0); shape.lineTo(x1, H); shape.lineTo(x0, H); shape.lineTo(x0, 0);
    for (const op of ops) {
      const hole = new THREE.Path();
      const xa = op.x, xb = op.x + op.w, ya = op.y, yb = op.y + op.h;
      if ((op.head || 'lintel') === 'archOpen') {
        // the voussoirs come through from the other face: leave their whole ring open
        const r = op.w / 2, sp = yb - r, R = r + (op.archH ?? clamp(0.22 + r * 0.12, 0.25, 0.5)) + 0.01, cx = xa + r;
        hole.moveTo(xa, ya); hole.lineTo(xa, sp); hole.lineTo(cx - R, sp);
        for (let k = 1; k < 24; k++) { const an = Math.PI - (k / 24) * Math.PI; hole.lineTo(cx + Math.cos(an) * R, sp + Math.sin(an) * R); }
        hole.lineTo(cx + R, sp); hole.lineTo(xb, sp); hole.lineTo(xb, ya); hole.lineTo(xa, ya);
      } else if ((op.head || 'lintel').startsWith('arch')) {
        const r = op.w / 2, sp = yb - r;
        hole.moveTo(xa, ya); hole.lineTo(xa, sp);
        for (let k = 1; k <= 16; k++) { const an = Math.PI - (k / 16) * Math.PI; hole.lineTo(xa + r + Math.cos(an) * r, sp + Math.sin(an) * r); }
        hole.lineTo(xb, ya); hole.lineTo(xa, ya);
      } else { hole.moveTo(xa, ya); hole.lineTo(xa, yb); hole.lineTo(xb, yb); hole.lineTo(xb, ya); hole.lineTo(xa, ya); }
      shape.holes.push(hole);
    }
    const macc = kit.get(o.mortar || 'mortar');
    shapeFace(macc, F, shape, { seed: rnd() });
    if (o.back) shapeFace(kit.get(o.backMat || o.mortar || 'mortar'), sub(F, [0, 0, -T], [1, 0, 0], [0, 1, 0]), shape, { flip: true, seed: rnd() });
    // reveals (the sides / soffit of each opening through the full thickness)
    for (const op of ops) {
      const xa = op.x, xb = op.x + op.w, ya = op.y, yb = op.y + op.h;
      const strip = (p0, p1) => {  // a quad from face point p0 to p1, extruded along -z by T, facing into the opening
        const a = macc.vcount;
        const P = [[...p0, 0], [...p1, 0], [...p1, -T], [...p0, -T]].map((q) => xf(F, q[0], q[1], q[2]));
        for (const [k, q] of P.entries()) macc.v(q[0], q[1], q[2], k < 2 ? 0 : T, 0, 0.5, 0.5, 0, 1, 0, 0);
        macc.q(a, a + 1, a + 2, a + 3);
      };
      if ((op.head || 'lintel').startsWith('arch')) {
        const r = op.w / 2, sp = yb - r;
        strip([xa, sp], [xa, ya]); strip([xb, ya], [xb, sp]);
        for (let k = 0; k < 16; k++) {
          const a0 = Math.PI - (k / 16) * Math.PI, a1 = Math.PI - ((k + 1) / 16) * Math.PI;
          strip([xa + r + Math.cos(a0) * r, sp + Math.sin(a0) * r], [xa + r + Math.cos(a1) * r, sp + Math.sin(a1) * r]);
        }
      } else { strip([xa, yb], [xa, ya]); strip([xb, ya], [xb, yb]); strip([xa, yb], [xb, yb]); }
      if (ya > 0.01) strip([xb, ya], [xa, ya]);
    }
  }
  return { courses: C, zones };
}

/**
 * A voussoir ring (semicircular arch) in face coords: centre (cx, cy), intrados radius r, ring
 * height vh, depth dep (through the wall: its soffit shows under the arch). n voussoirs (odd).
 */
export function archRing(kit, F, matName, cx, cy, r, vh, dep, rnd, lod, o = {}) {
  const ds = STYLE.dressed;
  const rm = r + vh / 2;
  let n = o.n ?? Math.max(5, Math.round((Math.PI * rm) / (vh * 0.75)));
  if (n % 2 === 0) n += 1;
  const j = 0.008;
  const prot = o.prot ?? 0.014;
  const acc = kit.get(matName);
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * (1 - i / n), a1 = Math.PI * (1 - (i + 1) / n);
    const am = (a0 + a1) / 2;
    const span = (a0 - a1) * rm - j;
    const key = i === (n - 1) / 2;
    const vhh = vh * (key ? 1.12 : 1) + rnd.sym(0.01);
    const Fv = sub(F, [cx, cy, prot - dep / 2]);
    // block in (tangent, radial, depth) space, warped into the annular sector
    const warp = (lx, ly, lz) => {
      const th = am - lx / rm;
      const rho = rm + ly + (key ? (vhh - vh) / 2 : 0);
      return [Math.cos(th) * rho, Math.sin(th) * rho, lz];
    };
    block(acc, Fv, span, vhh, dep, lod.flat ? { r: 0, seg: 9, seed: rnd(), warp, uvMode: 'box' } : {
      r: rnd.range(ds.r[0], ds.r[1]), rs: lod.rs, seg: [Math.max(0.05, span / 4), Math.max(lod.seg, vhh / 3), Math.max(lod.seg, dep / 6)],
      seed: rnd(), noise: ds.noise, nf: ds.nf, pillow: 0.002, chip: 0.007, warp, uvMode: 'box', skip: 0,
    });
  }
}

/**
 * A rectangular masonry building shell (four faces bonding at quoined corners).
 * F: building frame (origin at the footprint centre on the ground, y up, front = +z).
 * o: w, d, h, T, style, mat, dressedMat, mortar, lod, seed, faces: { front, right, back, left }
 * each { openings, skip (bool) }, quoin: { long, short } (m), plinth (height of a footing course).
 */
export function masonryBox(kit, F, o) {
  const rnd = makeRand(o.seed ?? 3);
  const { w, d, h } = o;
  const T = o.T ?? 0.6;
  const cm = LOD[o.lod || 'mid'].courseMul || 1;
  const C = o.courses || courses(rnd, h, { min: (o.courseMin ?? (o.style === 'ashlar' ? 0.28 : 0.17)) * cm, max: (o.courseMax ?? (o.style === 'ashlar' ? 0.36 : 0.33)) * cm, plinth: o.plinth ?? 0 });
  const ql = o.quoin?.long ?? 0.55, qsh = o.quoin?.short ?? 0.32;
  const faces = [
    { k: 'front', o: [-w / 2, 0, d / 2], X: [1, 0, 0], L: w },
    { k: 'right', o: [w / 2, 0, d / 2], X: [0, 0, -1], L: d },
    { k: 'back', o: [w / 2, 0, -d / 2], X: [-1, 0, 0], L: w },
    { k: 'left', o: [-w / 2, 0, -d / 2], X: [0, 0, 1], L: d },
  ];
  // corner k sits at the END of face k and the START of face k+1
  const qa = (k, ci) => ((ci + k) % 2 === 0 ? ql : qsh);       // along face k
  const qb = (k, ci) => ((ci + k) % 2 === 0 ? qsh : ql);       // along face k+1
  const res = {};
  faces.forEach((f, k) => {
    const spec = (o.faces || {})[f.k] || {};
    if (spec.skip) return;
    const Ff = sub(F, f.o, f.X, [0, 1, 0]);
    const prev = (k + 3) % 4;
    res[f.k] = masonryFace(kit, Ff, f.L, h, {
      courses: C, style: o.style, mat: o.mat, dressedMat: o.dressedMat, mortar: o.mortar, T, lod: spec.lod || o.lod, seed: (o.seed ?? 3) * 31 + k,
      openings: spec.openings || [],
      quoinStart: (ci) => (o.noQuoins ? 0.0 : qb(prev, ci)),
      quoinEnd: (ci) => (o.noQuoins ? 0.0 : qa(k, ci)),
      quoins: o.noQuoins ? null : { a: (ci) => qa(k, ci), b: (ci) => qb(k, ci) },
      back: spec.back ?? o.back, backMat: o.backMat, depth: o.depth,
    });
  });
  // the wall top (under a timber sill beam / wall plate it is hidden; a bed of mortar)
  return { courses: C, T, faces: res };
}

/**
 * Steps: a flight of dressed step stones (each step 1-3 stones long), treads dished by wear in
 * the middle and the nosing rounded off, laid on a rubble core. Frame: origin at the foot of the
 * flight centre, x across, y up, z = the direction of ascent is -z (the flight rises away from +z).
 */
export function steps(kit, F, o) {
  const rnd = makeRand(o.seed ?? 5);
  const n = o.n ?? 5, W = o.w ?? 4, rise = o.rise ?? 0.17, tread = o.tread ?? 0.34;
  const lod = LOD[o.lod || 'mid'];
  const mat = o.mat || 'stoneDressed';
  const wear = o.wear ?? 0.025;
  for (let i = 0; i < n; i++) {
    const y0 = i * rise, z0 = -i * tread;
    // stones along the step
    let x = -W / 2;
    while (x < W / 2 - 0.05) {
      let L = rnd.range(0.7, 1.6);
      if (W / 2 - (x + L) < 0.4) L = W / 2 - x;
      const depth = tread + 0.1 + (o.landing && i === n - 1 ? o.landing : 0);
      const h = rise + 0.06;
      const xc = x + L / 2;
      const Fs = sub(F, [xc + rnd.sym(0.004), y0 + rise - h / 2 + rnd.sym(0.003), z0 - depth / 2 + 0.02 + rnd.sym(0.006)], [1, 0, rnd.sym(0.006)], [0, 1, 0]);
      const wx = (lx) => { const gx = xc + lx; return Math.exp(-Math.pow(gx / (W * 0.28), 2)); };
      block(kit.get(mat), Fs, L - 0.008, h, depth, lod.flat ? { r: 0, seg: 9, seed: rnd() } : {
        r: rnd.range(0.012, 0.025), rs: lod.rs, seg: [Math.max(lod.seg, 0.12), Math.max(lod.seg, h / 2), Math.max(lod.seg, 0.08)],
        seed: rnd(), noise: 0.003, nf: 6, pillow: 0.002, chip: 0.01, uvMode: 'box', skip: 0,
        // the worn path: treads dished in the middle, the nosing rounded away
        warp: (lx, ly, lz) => {
          const top = ly > h / 2 - 0.03 ? 1 : 0;
          const front = smooth01((lz - (depth / 2 - 0.2)) / 0.2);
          const dish = wear * wx(lx) * top * (0.35 + 0.65 * front) * (1 - Math.pow(Math.abs(lz) / (depth / 2), 6) * 0.5);
          const nose = wear * 1.2 * wx(lx) * front * smooth01((ly - (h / 2 - 0.08)) / 0.08);
          return [lx, ly - dish - nose * 0.4, lz - nose * 0.5];
        },
      });
      x += L + 0.006;
    }
  }
}
const smooth01 = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

/**
 * A stone gable (triangle x 0..L, y 0..rise in face coords, apex at L/2) laid in courses that
 * shorten up the slope; coping stones along both rakes and kneelers at the feet keep the cut
 * ends dry. o: style, mat, dressedMat, mortar, T, lod, seed, coping (bool), copingMat.
 */
export function masonryGable(kit, F, L, rise, o = {}) {
  const rnd = makeRand(o.seed ?? 17);
  const st = { ...STYLE[o.style || 'squared'] };
  const lod = LOD[o.lod || 'mid'];
  const mat = o.mat || 'stonePale', dmat = o.dressedMat || mat;
  const C = courses(rnd, rise - 0.15, { min: (o.courseMin ?? 0.2) * (lod.courseMul || 1), max: (o.courseMax ?? 0.34) * (lod.courseMul || 1) });
  const half = (y) => (L / 2) * (1 - y / rise);
  let prevJ = [];
  for (const c of C) {
    const hw = half(c.y + c.h) - 0.06;               // the course stops under the coping
    if (hw < 0.15) break;
    const joints = [];
    fillSegment(kit, F, mat, L / 2 - hw, L / 2 + hw, c.y, c.h, rnd, st, lod, prevJ, joints, o.depth || st.dep);
    prevJ = joints;
  }
  // mortar core triangle
  if (o.mortar !== null) {
    const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(L, 0), new THREE.Vector2(L / 2, rise)]);
    shapeFace(kit.get(o.mortar || 'mortar'), F, sh, { seed: rnd() });
  }
  if (o.coping !== false) {
    const cm = o.copingMat || dmat;
    const T = o.T ?? 0.6;
    const ang = Math.atan2(rise, L / 2);
    const slant = Math.hypot(rise, L / 2);
    const n = Math.max(2, Math.round(slant / 0.7));
    for (const side of [-1, 1]) {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const X = side < 0 ? [ca, sa, 0] : [-ca, sa, 0];
      const Y = side < 0 ? [-sa, ca, 0] : [sa, ca, 0];
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n - 0.012 / slant;
        const tm = (t0 + t1) / 2;
        const px = side < 0 ? (L / 2) * tm : L - (L / 2) * tm, py = rise * tm;
        const Fc = sub(F, [px + Y[0] * 0.06, py + Y[1] * 0.06, -T / 2 + 0.02], X, Y);
        block(kit.get(cm), Fc, (t1 - t0) * slant, 0.2, T + 0.16, { r: 0.015, rs: 1, seg: [0.25, 0.1, 0.2], seed: rnd(), noise: 0.003, nf: 5, chip: 0.012, warp: (lx, ly, lz) => [lx, ly + (ly > 0 ? 0.05 * (1 - Math.abs(lz) / ((T + 0.16) / 2)) : 0), lz] });
      }
      // kneeler at the foot of the rake
      const kx = side < 0 ? 0.2 : L - 0.2;
      block(kit.get(cm), sub(F, [kx, 0.18, -T / 2 + 0.02]), 0.5, 0.36, T + 0.16, { r: 0.015, rs: 1, seg: [0.15, 0.12, 0.2], seed: rnd(), noise: 0.003, nf: 5, chip: 0.012 });
    }
    // apex stone
    block(kit.get(cm), sub(F, [L / 2, rise + 0.12, -T / 2 + 0.02]), 0.45, 0.4, T + 0.16, { r: 0.02, rs: 1, seg: [0.15, 0.12, 0.2], seed: rnd(), noise: 0.003, nf: 5, chip: 0.012, warp: (lx, ly, lz) => { const k = 1 - 0.5 * (ly / 0.4 + 0.5); return [lx * k, ly, lz]; } });
  }
}

/**
 * A round tower of coursed stone: stones as curved blocks round the circumference, joints
 * broken course to course; a corbel table and parapet ring at the top. F at the base centre.
 * o: r (outer radius), h, lod, mat, dressedMat, seed, slits (number of slit windows per level),
 * corbel (bool), courseMin/Max. Returns { top } (y of the wall top).
 */
export function roundTower(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 19);
  const R = o.r ?? 4, H = o.h ?? 20;
  const lod = LOD[o.lod || 'low'];
  const mat = o.mat || 'stonePale', dmat = o.dressedMat || mat;
  const C = courses(rnd, H, { min: (o.courseMin ?? 0.3) * (lod.courseMul || 1), max: (o.courseMax ?? 0.45) * (lod.courseMul || 1) });
  const slits = [];
  for (let k = 0; k < (o.slits ?? 3); k++) slits.push({ a: rnd() * Math.PI * 2, y0: 3 + k * (H - 6) / Math.max(1, (o.slits ?? 3) - 1), h: 1.3, w: 0.32 });
  let phase = 0;
  for (const c of C) {
    const n = Math.max(8, Math.round((2 * Math.PI * R) / (rnd.range(0.6, 0.9) * (lod.lenMul || 1))));
    phase += Math.PI / n + rnd.sym(0.05);
    for (let i = 0; i < n; i++) {
      const a0 = phase + (i / n) * Math.PI * 2, a1 = phase + ((i + 1) / n) * Math.PI * 2 - 0.012 / R;
      const am = (a0 + a1) / 2, span = (a1 - a0) * R;
      // a slit window here?
      if (slits.some((s) => c.y + c.h > s.y0 && c.y < s.y0 + s.h && Math.abs(((am - s.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * R < s.w / 2 + span / 2)) continue;
      const dep = 0.3;
      const Fs = sub(F, [0, c.y + c.h / 2, 0]);
      const prot = rnd.range(0.004, 0.015) * (lod.protMul ?? 1);
      block(kit.get(mat), Fs, lod.protMul ? span + 0.01 : span, c.h - (lod.protMul ? 0.004 : 0.012), dep, lod.flat ? { r: 0, seg: [Math.max(0.3, span / 2), 9, 9], seed: rnd(), skip: 32, warp: (lx, ly, lz) => { const th = am - lx / R; const rr = R - dep / 2 + prot + lz; return [Math.cos(th) * rr, ly, Math.sin(th) * rr]; } } : {
        r: 0.012, rs: 1, seg: [Math.max(0.12, span / 4), Math.max(lod.seg, c.h / 2), 9], seed: rnd(), noise: 0.004, nf: 5, pillow: 0.004, chip: 0.01, skip: 32, aoDepth: prot + 0.02, aoFloor: 0.35,
        warp: (lx, ly, lz) => { const th = am - lx / R; const rr = R - dep / 2 + prot + lz; return [Math.cos(th) * rr, ly, Math.sin(th) * rr]; },
      });
    }
  }
  // the core (mortar cylinder) and dark slits
  {
    const acc = kit.get(o.mortar || 'mortar');
    const n = 48;
    const ring = (y) => { const ids = []; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; const p = xf(F, Math.cos(a) * (R - 0.012), y, Math.sin(a) * (R - 0.012)); ids.push(acc.v(p[0], p[1], p[2], 0, 0, 0.3, 0.6, 0, 0, 1, 0)); } return ids; };
    const r0 = ring(0), r1 = ring(H);
    for (let i = 0; i < n; i++) acc.q(r0[i], r0[i + 1], r1[i + 1], r1[i]);
    for (const s of slits) {
      const pa = kit.get('portal');
      const cx = Math.cos(s.a) * (R - 0.2), cz = Math.sin(s.a) * (R - 0.2);
      const X = [-Math.sin(s.a), 0, Math.cos(s.a)];
      const base = pa.vcount;
      for (const [x, y] of [[-s.w / 2, 0], [s.w / 2, 0], [s.w / 2, s.h], [-s.w / 2, s.h]]) { const p = xf(F, cx + X[0] * x, s.y0 + y, cz + X[2] * x); pa.v(p[0], p[1], p[2], x + s.w / 2, y, rnd(), 0, 0, s.w, s.h, 1.0); }
      // (wound so the portal faces outward)
      pa.q(base + 3, base + 2, base + 1, base);
    }
  }
  // corbel table + parapet ring
  let top = H;
  if (o.corbel !== false) {
    const n = Math.round((2 * Math.PI * R) / 0.6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const Fc = sub(F, [Math.cos(a) * (R + 0.12), H + 0.25, Math.sin(a) * (R + 0.12)], [-Math.sin(a), 0, Math.cos(a)], [0, 1, 0]);
      block(kit.get(dmat), Fc, 0.3, 0.5, 0.45, { r: 0.015, seg: [0.15, 0.25, 0.2], seed: rnd(), noise: 0.003, chip: 0.01, warp: (lx, ly, lz) => [lx, ly, lz * (0.55 + 0.45 * (ly / 0.5 + 0.5))] });
    }
    // the parapet ring above the corbels
    const Rp = R + 0.32;
    const n2 = Math.round((2 * Math.PI * Rp) / 0.8);
    for (const [y0, hh] of [[H + 0.5, 0.36], [H + 0.88, 0.36], [H + 1.26, 0.22]]) {
      const ph = rnd() * 3;
      for (let i = 0; i < n2; i++) {
        const a0 = ph + (i / n2) * Math.PI * 2, a1 = ph + ((i + 1) / n2) * Math.PI * 2 - 0.012 / Rp;
        const am = (a0 + a1) / 2, span = (a1 - a0) * Rp;
        block(kit.get(dmat), sub(F, [0, y0 + hh / 2, 0]), span, hh - 0.01, 0.45, { r: 0.012, seg: [Math.max(0.15, span / 3), 0.2, 0.2], seed: rnd(), noise: 0.003, chip: 0.01, warp: (lx, ly, lz) => { const th = am - lx / Rp; const rr = Rp - 0.2 + lz; return [Math.cos(th) * rr, ly, Math.sin(th) * rr]; } });
      }
    }
    top = H + 1.48;
  }
  return { top, R: o.corbel !== false ? R + 0.32 : R };
}

/** A conical roof of slates in courses round a cone (eaves overhang, a finial). F at the eaves centre. */
export function conicalRoof(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 23);
  const R = o.r ?? 4.5, Hc = o.h ?? 7, over = o.eaves ?? 0.35;
  const Re = R + over;
  const slant = Math.hypot(Re, Hc * (Re / R));
  const ang = Math.atan2(Hc, R);
  const mat = o.mat || 'slate';
  // the boarded cone underneath (a dark shell) - visible at the eaves
  {
    const acc = kit.get('oakDark');
    const n = 48;
    const ids0 = [], ids1 = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p0 = xf(F, Math.cos(a) * Re, -over * Math.tan(ang), Math.sin(a) * Re), p1 = xf(F, 0, Hc, 0);
      ids0.push(acc.v(p0[0], p0[1], p0[2], a * Re, 0, 0.4, 0.6, 0, 0, 1, 0)); ids1.push(acc.v(p1[0], p1[1] - 0.02, p1[2], a * Re, slant, 0.4, 0.6, 0, 0, 1, 0));
    }
    for (let i = 0; i < n; i++) acc.q(ids0[i], ids1[i], ids1[i + 1], ids0[i + 1]);
  }
  // slates: courses from the eaves up (s = distance down the slant from the apex)
  let s = slant + 0.05;
  const lift = 0.04;
  const sc = o.slateScale ?? 1;
  while (s > 0.35) {
    const len = (0.32 + 0.12 * (s / slant)) * sc, g = len * 0.42;
    const rr = (s / slant) * Re;
    const n = Math.max(6, Math.round((2 * Math.PI * rr) / ((0.22 + 0.08 * (s / slant)) * sc)));
    const ph = rnd() * 6;
    for (let i = 0; i < n; i++) {
      const a = ph + (i / n) * Math.PI * 2;
      const w = (2 * Math.PI * rr) / n - 0.006;
      // slate frame: x tangential, y out of the cone, z down the slant
      const down = [Math.cos(a) * Math.cos(ang), -Math.sin(ang), Math.sin(a) * Math.cos(ang)];
      const out = [Math.cos(a) * Math.sin(ang), Math.cos(ang), Math.sin(a) * Math.sin(ang)];
      const tan = [-Math.sin(a), 0, Math.cos(a)];
      const sm = s - len / 2;
      const c = [Math.cos(a) * (sm / slant) * Re + out[0] * lift, Hc - (sm / slant) * (Hc + over * Math.tan(ang)) + out[1] * lift, Math.sin(a) * (sm / slant) * Re + out[2] * lift];
      const Fs = sub(F, c, tan, out, down);
      const tilt = 0.04;
      block(kit.get(mat), sub(Fs, [0, 0, 0], [1, 0, 0], [0, Math.cos(tilt), -Math.sin(tilt)]), w * (0.94 + 0.04 * rnd()), 0.02, len, { r: 0, seg: [w, 1, len], seed: rnd(), noise: 0.002, skip: 8 | 32, aoFn: (lx, ly, lz) => 0.25 + 0.75 * Math.min(1, Math.max(0, (lz / len + 0.5 - 0.45) / 0.3)), uvFn: (lx, ly, lz) => [lx + w / 2, lz + len / 2] });
    }
    s -= g;
  }
  // finial
  tube(kit.get('lead'), [xf(F, 0, Hc - 0.3, 0), xf(F, 0, Hc + 1.2, 0)], (t) => 0.12 * (1 - t * 0.8), { sides: 8, caps: true });
}
