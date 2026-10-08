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
import { block, shapeFace, sub, makeRand, clamp, xf } from './core.js';

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
  rubble: { r: [0.009, 0.02], pillow: [0.003, 0.01], noise: 0.012, nf: 3.5, chip: 0.022, prot: [0.006, 0.022], tilt: 0.025, len: [0.7, 2.2], j: 0.016, dep: [0.14, 0.28], sizeJit: 0.012, split: 0.25, outline: 0.06, shrink: 0.12 },
  dressed: { r: [0.008, 0.014], pillow: [0.001, 0.004], noise: 0.002, nf: 7, chip: 0.006, prot: [0.01, 0.018], tilt: 0.004, len: [1, 1], j: 0.01, dep: [0.2, 0.3], sizeJit: 0.003, split: 0 },
};
export const LOD = {
  hero: { seg: 0.12, rs: 2 },
  mid: { seg: 0.22, rs: 1 },
  low: { seg: 9, rs: 1, flat: true },
};

/** One stone in face coords: x0..x1, y0..y1 (face), depth dep, extra opts. */
function stone(kit, F, matName, x0, x1, y0, y1, dep, rnd, st, lod, extra = {}) {
  const w = x1 - x0, h = y1 - y0;
  if (w < 0.03 || h < 0.03) return;
  const prot = extra.prot ?? rnd.range(st.prot[0], st.prot[1]);
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
    block(acc, Fs, sx, sy, dep, { r: 0, seg: 9, skip: 32, seed: rnd(), aoDepth: prot + 0.02, aoFloor: 0.35, uvMode: 'box' });
    return;
  }
  block(acc, Fs, sx, sy, dep, {
    r, rs: lod.rs, seg: [Math.max(lod.seg, w / 6), Math.max(lod.seg, h / 4), 9], skip: 32,
    seed: rnd(), noise: st.noise * (extra.noiseMul ?? 1), nf: st.nf, pillow: rnd.range(st.pillow[0], st.pillow[1]) * (extra.pillowMul ?? 1),
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
    let L = h * rnd.range(st.len[0], st.len[1]);
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
  const C = o.courses || courses(rnd, H, {});
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
      if ((op.head || 'lintel').startsWith('arch')) {
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
  const C = o.courses || courses(rnd, h, { min: o.courseMin ?? (o.style === 'ashlar' ? 0.28 : 0.17), max: o.courseMax ?? (o.style === 'ashlar' ? 0.36 : 0.33), plinth: o.plinth ?? 0 });
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
