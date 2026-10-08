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
import { block, shapeFace, sub, makeRand, clamp, xf, tube, lathe, Kit } from './core.js';
import { stain } from './weathering.js';

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

// stone styles: rounding (m, per stone), pillow, noise, chips, protrusion of the face's flat
// (relative to the mortar bed, m), tilt, length factors, depth.
// Round 2: the stones are SET IN the mortar, not stuck on it - the flat of a face stands only
// 0-12 mm proud of the bed, so the rounded arrises dive under it and the visible outline of every
// stone is where its pillowed, uneven face comes out of the mortar (irregular, never a rounded
// rectangle with a drop shadow); the rounding radius varies stone to stone (worn / sharp arrises)
const STYLE = {
  ashlar: { r: [0.003, 0.014], pillow: [0.001, 0.004], noise: 0.002, nf: 7, chip: 0.008, prot: [0.001, 0.007], tilt: 0.004, len: [1.2, 3.0], j: 0.006, dep: [0.18, 0.32], sizeJit: 0.004, split: 0, outline: 0.006 },
  squared: { r: [0.005, 0.018], pillow: [0.002, 0.007], noise: 0.004, nf: 4, chip: 0.014, prot: [0.001, 0.009], tilt: 0.01, len: [0.8, 2.6], j: 0.009, dep: [0.15, 0.3], sizeJit: 0.008, split: 0.14, outline: 0.03, shrink: 0.05 },
  // random rubble brought to courses: round-edged field / quarry stones of every size bedded deep
  // in lime, 15-35 mm of mortar showing between them
  rubble: { r: [0.008, 0.022], pillow: [0.005, 0.013], noise: 0.006, nf: 5.5, chip: 0.03, prot: [0.0, 0.008], tilt: 0.02, len: [0.6, 2.4], j: 0.009, dep: [0.14, 0.28], sizeJit: 0.01, split: 0.28, outline: 0.06, shrink: 0.04 },
  // rubble under generations of lime wash: the coats soften every arris but the stones still show
  // as low lumps under the wash (no wallpaper)
  washed: { r: [0.018, 0.035], pillow: [0.006, 0.016], noise: 0.006, nf: 3.5, chip: 0.004, prot: [0.0, 0.008], tilt: 0.012, len: [0.7, 2.4], j: 0.014, dep: [0.14, 0.28], sizeJit: 0.008, split: 0.25, outline: 0.05, shrink: 0.03 },
  // squared stone pointed flush (a lodge, a cottage): tight joints, faces barely proud of the pointing
  pointed: { r: [0.008, 0.02], pillow: [0.002, 0.007], noise: 0.004, nf: 4, chip: 0.012, prot: [-0.004, 0.003], tilt: 0.008, len: [0.9, 2.6], j: 0.01, dep: [0.15, 0.3], sizeJit: 0.008, split: 0.14, outline: 0.03, shrink: 0.02 },
  dressed: { r: [0.004, 0.016], pillow: [0.001, 0.004], noise: 0.002, nf: 7, chip: 0.008, prot: [0.004, 0.012], tilt: 0.004, len: [1, 1], j: 0.008, dep: [0.2, 0.3], sizeJit: 0.003, split: 0, outline: 0.006 },
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
  // every stone its own arris: some sharp, some worn round (a skewed spread: most are mid)
  const rq = rnd();
  const r = Math.min((st.r[0] + (st.r[1] - st.r[0]) * (0.5 * rq + 0.5 * rq * rq)) * (extra.rMul ?? 1), 0.4 * Math.min(sx, sy), 0.45 * dep);
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
  // (baked occlusion: the stone darkens down its rounded arris toward the bed it is set in - dust
  // and damp collect in the joint; what is below the mortar is hidden anyway)
  block(acc, Fs, sx, sy, dep, {
    r, rs: lod.rs, seg: [Math.max(lod.seg, w / 6), Math.max(lod.seg, h / 4), 9], skip: 32,
    seed: rnd(), noise: st.noise * (extra.noiseMul ?? 1) * (lod.noiseMul ?? 1), noct: lod.noct ?? 2, nf: st.nf, pillow: rnd.range(st.pillow[0], st.pillow[1]) * (extra.pillowMul ?? 1),
    chip: st.chip, aoDepth: Math.max(0.006, prot + 0.7 * r), aoFloor: 0.45, uvMode: 'box', warp, aoOpen: extra.aoOpen, aoMul: st.aoMul,
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
  // (o.aoMul: the whole face is shaded from the sky - a passage wall, a deep reveal)
  const st = { ...STYLE[o.style || 'squared'], ...(o.styleOver || {}), aoMul: o.aoMul };
  const ds = { ...STYLE.dressed, aoMul: o.aoMul };
  const lod = LOD[o.lod || 'mid'];
  const mat = o.mat || 'stoneGrey', dmat = o.dressedMat || mat;
  const C = o.courses || courses(rnd, H, { min: 0.18 * (lod.courseMul || 1), max: 0.34 * (lod.courseMul || 1) });
  const T = o.T ?? 0.6;
  const j = st.j;
  const qs = o.quoinStart || (() => 0), qe = o.quoinEnd || (() => 0);
  const zones = [];
  // (op.splay / op.sillSplay / op.headSplay: an inner window splayed to spread the light - the
  // face opening is wider and taller than the window itself at the back of the wall)
  const ops = (o.openings || []).map((op) => (op.splay ? { ...op, x: op.x - op.splay, w: op.w + 2 * op.splay, y: op.y - (op.sillSplay ?? 0), h: op.h + (op.sillSplay ?? 0) + (op.headSplay ?? op.splay * 0.4), back: { x: op.x, w: op.w, y: op.y, h: op.h } } : op));
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
        stone(kit, F, dmat, x0 - lng - j * 0.5, x0, ya, yb - (yb < spring - 0.01 ? 0 : 0.004), rev, rnd, ds, lod, { prot: 0.009, aoOpen: 2 });
        stone(kit, F, dmat, x1, x1 + rng2 + j * 0.5, ya, yb - (yb < spring - 0.01 ? 0 : 0.004), rev, rnd, ds, lod, { prot: 0.009, aoOpen: 1 });
      }
      zones.push({ x0: x0 - jw - j, x1: x1 + jw + j, y0, y1: spring, kind: 'jamb' });
    } else zones.push({ x0, x1, y0, y1: spring, kind: 'void' });
    if (head === 'lintel') {
      const lh = op.lintelH ?? clamp(0.18 + op.w * 0.08, 0.2, 0.4);
      const bear = op.bearing ?? 0.18 + rnd() * 0.08;
      stone(kit, F, dmat, x0 - bear, x1 + bear, y1 + 0.005, y1 + lh, rev + 0.05, rnd, ds, lod, { prot: 0.011 });
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
      // the rain leaves the sill at its ends and along its drip: dirty streaks down the wall
      if (o.stains !== false && !lod.flat) {
        stain(kit, F, sx0 + 0.07, y0 - sh, 0.16, rnd.range(0.4, 1.0), 'dirt', { strength: 0.65, seed: rnd() });
        stain(kit, F, sx1 - 0.07, y0 - sh, 0.16, rnd.range(0.4, 1.0), 'dirt', { strength: 0.65, seed: rnd() });
        stain(kit, F, (sx0 + sx1) / 2, y0 - sh, (sx1 - sx0) * 0.85, rnd.range(0.25, 0.6), 'dirt', { strength: 0.4, seed: rnd() });
      }
    }
    // a blocked-up opening (a window walled up long ago): its dressed jambs and head stay, the hole
    // is filled with smaller, different rubble set back a few cm in its own mortar
    if (op.blocked) {
      const Fb = sub(F, [0, 0, -0.03]);
      const top = isArch ? spring + op.w / 2 * 0.98 : y1;
      const Cb = courses(rnd, top - y0 - 0.01, { min: 0.11, max: 0.2 });
      let pj = [];
      const bst = { ...STYLE.rubble, outline: 0.07 };
      for (const c of Cb) {
        const yy = y0 + 0.005 + c.y;
        // (under an arched head the courses narrow to the intrados)
        let xa = x0 + 0.012, xb = x1 - 0.012;
        if (isArch && yy + c.h > spring) { const r = op.w / 2, dy = Math.min(r, yy + c.h - spring); const hw = Math.sqrt(Math.max(0, r * r - dy * dy)) - 0.015; xa = (x0 + x1) / 2 - hw; xb = (x0 + x1) / 2 + hw; }
        if (xb - xa < 0.12) continue;
        const jn = [];
        fillSegment(kit, Fb, op.blockMat || mat, xa, xb, yy, c.h, rnd, bst, lod, pj, jn, [0.1, 0.18]);
        pj = jn;
      }
    }
  }
  // ---- regular courses
  let prevJ = [];
  for (const [ci, c] of C.entries()) {
    const xa = qs(ci) > 0 ? qs(ci) + j : 0, xb = L - (qe(ci) > 0 ? qe(ci) + j : 0);
    const ya = c.y, yb = c.y + c.h;
    const bl = blockedRanges(zones, ya, yb, j);
    let segs = [];
    let x = xa;
    for (const [b0, b1] of bl) { if (b0 > x) segs.push([x, Math.min(b0, xb)]); x = Math.max(x, b1); }
    if (x < xb) segs.push([x, xb]);
    if (o.clipTop) {
      // only where the clip line (a stair's soffit, a sloping ground) is above this course
      const ok = [];
      for (const [s0, s1] of segs) {
        let run0 = null;
        for (let xx = s0; xx <= s1 + 1e-6; xx += 0.02) {
          const inside = o.clipTop(Math.min(xx, s1)) >= yb - 1e-4;
          if (inside && run0 === null) run0 = xx;
          if ((!inside || xx + 0.02 > s1 + 1e-6) && run0 !== null) { const e = inside ? s1 : xx - 0.02; if (e - run0 > 0.08) ok.push([run0, e]); run0 = null; }
        }
      }
      segs = ok;
    }
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
      const prot = 0.01;
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
    shape.moveTo(x0, 0); shape.lineTo(x1, 0);
    if (o.clipTop) { for (let xx = x1; xx >= x0 - 1e-6; xx -= 0.02) shape.lineTo(xx, Math.min(H, o.clipTop(xx))); }
    else { shape.lineTo(x1, H); shape.lineTo(x0, H); }
    shape.lineTo(x0, 0);
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
    // (far off the flat stones stand only a few mm proud: the core goes back 3 cm, or the two
    // z-fight in triangle patches at a few hundred metres)
    shapeFace(macc, lod.flat ? sub(F, [0, 0, -0.03]) : F, shape, { seed: rnd(), ao: o.aoMul ?? 1 });
    let backShape = shape;
    if (ops.some((op) => op.back || op.niche)) {
      backShape = new THREE.Shape();
      backShape.moveTo(x0, 0); backShape.lineTo(x1, 0); backShape.lineTo(x1, H); backShape.lineTo(x0, H); backShape.lineTo(x0, 0);
      shape.holes.forEach((hl, k) => {
        const op = ops[k];
        if (op.niche) return;
        if (!op.back) { backShape.holes.push(hl); return; }
        const b = op.back, hh = new THREE.Path();
        hh.moveTo(b.x, b.y); hh.lineTo(b.x, b.y + b.h); hh.lineTo(b.x + b.w, b.y + b.h); hh.lineTo(b.x + b.w, b.y); hh.lineTo(b.x, b.y);
        backShape.holes.push(hh);
      });
    }
    if (o.back) shapeFace(kit.get(o.backMat || o.mortar || 'mortar'), sub(F, [0, 0, -T], [1, 0, 0], [0, 1, 0]), backShape, { flip: true, seed: rnd() });
    // reveals (the sides / soffit of each opening through the full thickness)
    for (const op of ops) {
      const xa = op.x, xb = op.x + op.w, ya = op.y, yb = op.y + op.h;
      // (a blocked opening: the reveal is only as deep as the fill is set back, closed by its own bed;
      // a niche: as deep as the niche)
      const DT = op.blocked ? 0.03 : op.niche ? op.niche : T;
      // a splayed opening: the face edge (p0, p1) runs back to the narrow window at the back
      const bk = op.back;
      const toBack = (p) => (bk ? [clamp(p[0], bk.x, bk.x + bk.w), clamp(p[1], bk.y, bk.y + bk.h)] : p);
      const strip = (p0, p1) => {  // a quad from face point p0 to p1, extruded along -z by DT, facing into the opening
        const a = macc.vcount;
        const b0 = toBack(p0), b1 = toBack(p1);
        const P = [[...p0, 0], [...p1, 0], [...b1, -DT], [...b0, -DT]].map((q) => xf(F, q[0], q[1], q[2]));
        for (const [k, q] of P.entries()) macc.v(q[0], q[1], q[2], k < 2 ? 0 : DT, 0, 0.5, 0.5, 0, 1, 0, 0);
        macc.q(a, a + 1, a + 2, a + 3);
      };
      if (op.blocked || op.niche) {
        const hb = new THREE.Shape();
        if ((op.head || 'lintel').startsWith('arch')) {
          const r = op.w / 2, sp = yb - r;
          hb.moveTo(xa, ya); hb.lineTo(xb, ya); hb.lineTo(xb, sp);
          for (let k = 1; k <= 16; k++) { const an = (k / 16) * Math.PI; hb.lineTo(xa + r + Math.cos(an) * r, sp + Math.sin(an) * r); }
          hb.lineTo(xa, ya);
        } else { hb.moveTo(xa, ya); hb.lineTo(xb, ya); hb.lineTo(xb, yb); hb.lineTo(xa, yb); hb.lineTo(xa, ya); }
        shapeFace(macc, sub(F, [0, 0, -DT]), hb, { seed: rnd() });
      }
      // (round 2: every strip runs the same way round the opening - the jambs did, the head, the arch
      // soffit and the sill ran the other way and faced into the wall: culled, the sky showed through
      // an arched doorway's soffit and a niche's head)
      if ((op.head || 'lintel').startsWith('arch')) {
        const r = op.w / 2, sp = yb - r;
        strip([xa, sp], [xa, ya]); strip([xb, ya], [xb, sp]);
        for (let k = 0; k < 16; k++) {
          const a0 = Math.PI - (k / 16) * Math.PI, a1 = Math.PI - ((k + 1) / 16) * Math.PI;
          strip([xa + r + Math.cos(a1) * r, sp + Math.sin(a1) * r], [xa + r + Math.cos(a0) * r, sp + Math.sin(a0) * r]);
        }
      } else { strip([xa, yb], [xa, ya]); strip([xb, ya], [xb, yb]); strip([xb, yb], [xa, yb]); }
      if (ya > 0.01) strip([xa, ya], [xb, ya]);
      // o.portals: a dim room behind every open window (far sets: a hole would show the sky)
      if (o.portals && !op.blocked && !op.niche && (op.head || 'lintel') !== 'archOpen' && op.y > 0.3) {
        const pa = kit.get('portal'), b0 = pa.vcount, zp = -Math.min(T, 1.2) + 0.03;
        const top = (op.head || 'lintel').startsWith('arch') ? yb : yb;
        for (const [x, y] of [[xa, ya], [xb, ya], [xb, top], [xa, top]]) { const q = xf(F, x, y, zp); pa.v(q[0], q[1], q[2], x - xa, y - ya, rnd(), 0, 0, op.w, op.h, 1.0); }
        pa.q(b0, b0 + 1, b0 + 2, b0 + 3);
      }
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
    const vhh = vh * (key ? 1.15 : 1) + rnd.sym(0.012);
    // every voussoir set by hand: its own face plane (a 2-5 mm step to its neighbours), a hair of
    // twist, a little settled out of the true curve
    const step = rnd.sym(0.0035), twist = rnd.sym(0.006), drop = rnd.sym(0.003);
    const Fv = sub(F, [cx, cy + drop, prot + step - dep / 2]);
    // block in (tangent, radial, depth) space, warped into the annular sector
    const warp = (lx, ly, lz) => {
      const th = am - lx / rm + twist * (ly / vhh);
      const rho = rm + ly + (key ? (vhh - vh) / 2 : 0);
      return [Math.cos(th) * rho, Math.sin(th) * rho, lz];
    };
    block(acc, Fv, span, vhh, dep, lod.flat ? { r: 0, seg: 9, seed: rnd(), warp, uvMode: 'box' } : {
      r: rnd.range(ds.r[0], ds.r[1]) * 1.3, rs: lod.rs, seg: [Math.max(0.05, span / 4), Math.max(lod.seg, vhh / 3), Math.max(lod.seg, dep / 6)],
      seed: rnd(), noise: ds.noise * 1.5, nf: ds.nf, pillow: rnd.range(0.001, 0.004), chip: 0.012, warp, uvMode: 'box', skip: 0,
      // the soffit (intrados) looks down into a shaded passage: it sees no bright ground, only the
      // dark floor of the passage - occluded deeper toward the middle of the wall
      aoFn: (lx, ly, lz) => (ly < -vhh / 2 + 0.004 ? 0.28 + 0.4 * Math.pow(Math.abs(lz) / (dep / 2), 2) : ly < -vhh / 2 + vhh * 0.3 ? 0.75 : 1),
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
      back: spec.back ?? o.back, backMat: o.backMat, depth: o.depth, portals: o.portals,
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
      // (round 2) every slab set by hand and settled since: +-12 mm in height, a fraction of a
      // degree of tilt, 4-9 mm joints; the walking line dished, the nosings worn round unevenly
      const tiltX = rnd.sym(0.008), tiltZ = rnd.sym(0.008);
      const Fs = sub(F, [xc + rnd.sym(0.006), y0 + rise - h / 2 + rnd.sym(0.012), z0 - depth / 2 + 0.02 + rnd.sym(0.01)], [1, tiltZ, rnd.sym(0.008)], [-tiltZ, 1, tiltX]);
      const wx = (lx) => { const gx = xc + lx; return Math.exp(-Math.pow((gx - (o.walkX ?? 0)) / (W * 0.24), 2)) + 0.5 * Math.exp(-Math.pow((gx - (o.walkX ?? 0) - W * 0.3) / (W * 0.15), 2)); };
      const nr = rnd.range(0.4, 1.6);
      block(kit.get(mat), Fs, L - rnd.range(0.004, 0.009), h, depth, lod.flat ? { r: 0, seg: 9, seed: rnd() } : {
        r: rnd.range(0.005, 0.016), rs: lod.rs, seg: [Math.max(lod.seg, 0.1), Math.max(lod.seg, h / 2), Math.max(lod.seg, 0.07)],
        seed: rnd(), noise: 0.004, nf: 6, pillow: 0.002, chip: 0.03, uvMode: 'box', skip: 0,
        // the worn path: treads dished in the middle, the nosing rounded away
        warp: (lx, ly, lz) => {
          const top = ly > h / 2 - 0.03 ? 1 : 0;
          const front = smooth01((lz - (depth / 2 - 0.2)) / 0.2);
          const dish = wear * wx(lx) * top * (0.35 + 0.65 * front) * (1 - Math.pow(Math.abs(lz) / (depth / 2), 6) * 0.5);
          const nose = wear * 1.2 * (0.3 + wx(lx)) * nr * (0.7 + 0.6 * Math.sin(lx * 7 + nr * 5) ** 2) * front * smooth01((ly - (h / 2 - 0.08)) / 0.08);
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
    shapeFace(kit.get(o.mortar || 'mortar'), lod.flat ? sub(F, [0, 0, -0.03]) : F, sh, { seed: rnd() });
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
  // (round 2) windows of other sizes at other levels: [{ a, y0, w, h }]
  for (const wv of o.windows || []) slits.push({ a: wv.a, y0: wv.y0, h: wv.h ?? 1.2, w: wv.w ?? 0.7 });
  // a battered base: the wall flares out batter (m) at the ground, dying into the plumb face at batterH
  const bat = o.batter ?? 0, batH = o.batterH ?? 3;
  const Rof = (y) => R + bat * Math.max(0, 1 - y / batH);
  // a slit is a dressed opening: the courses stop at its jambs (clean vertical edges), tall jamb
  // stones either side, a lintel over, a sill under, the dark loop behind - never a stepped hole
  const jw = 0.26;
  const zoneHalf = (s) => (s.w / 2 + jw) / R;               // half angle of slit + jambs
  let phase = 0;
  for (const c of C) {
    phase += 0.37 + rnd.sym(0.08);
    const n0 = Math.max(8, Math.round((2 * Math.PI * R) / (rnd.range(0.6, 0.9) * (lod.lenMul || 1))));
    // the gaps in this course (slits and their surrounds: lintel / sill courses are gaps too)
    const gaps = slits.filter((s) => c.y + c.h > s.y0 - 0.22 && c.y < s.y0 + s.h + 0.24).map((s) => [s.a - zoneHalf(s) - (c.y + c.h > s.y0 + s.h || c.y < s.y0 ? 0.12 / R : 0), s.a + zoneHalf(s) + (c.y + c.h > s.y0 + s.h || c.y < s.y0 ? 0.12 / R : 0)]);
    // arcs to fill: the whole ring, or the ring between the gaps
    const arcs = [];
    if (!gaps.length) arcs.push([phase, phase + Math.PI * 2]);
    else {
      gaps.sort((a, b) => a[0] - b[0]);
      for (let g = 0; g < gaps.length; g++) arcs.push([gaps[g][1], (g + 1 < gaps.length ? gaps[g + 1][0] : gaps[0][0] + Math.PI * 2)]);
    }
    for (const [aa, ab] of arcs) {
      const n = Math.max(1, Math.round(n0 * (ab - aa) / (Math.PI * 2)));
      for (let i = 0; i < n; i++) {
        const a0 = aa + ((ab - aa) * i) / n, a1 = aa + ((ab - aa) * (i + 1)) / n - 0.012 / R;
        const am = (a0 + a1) / 2, span = (a1 - a0) * R;
        const dep = 0.3;
        const Fs = sub(F, [0, c.y + c.h / 2, 0]);
        const prot = rnd.range(0.004, 0.015) * (lod.protMul ?? 1);
        const yc = c.y + c.h / 2;
        const tw = (lx, ly, lz) => { const th = am - lx / R; const rr = Rof(yc + ly) - dep / 2 + prot + lz; return [Math.cos(th) * rr, ly, Math.sin(th) * rr]; };
        block(kit.get(mat), Fs, lod.protMul ? span + 0.01 : span, c.h - (lod.protMul ? 0.004 : 0.012), dep, lod.flat ? { r: 0, seg: [Math.max(0.3, span / 2), 9, 9], seed: rnd(), skip: 32, warp: tw } : {
          r: rnd.range(0.006, 0.016), rs: 1, seg: [Math.max(0.12, span / 4), Math.max(lod.seg, c.h / 2), 9], seed: rnd(), noise: 0.004, nf: 5, pillow: 0.004, chip: 0.012, skip: 32, aoDepth: prot + 0.012, aoFloor: 0.45,
          warp: tw,
        });
      }
    }
  }
  // the dressed surrounds of the slits: jambs, lintel, sill (curved to the wall)
  const ringBlock = (am, span, y0, y1, dep, out = 0.01) => block(kit.get(dmat), sub(F, [0, (y0 + y1) / 2, 0]), span, y1 - y0, dep, { r: 0.01, rs: 1, seg: [Math.max(0.08, span / 3), 0.2, 9], seed: rnd(), noise: 0.002, chip: 0.01, skip: 32,
    warp: (lx, ly, lz) => { const th = am - lx / R; const rr = R - dep / 2 + out + lz; return [Math.cos(th) * rr, ly, Math.sin(th) * rr]; } });
  for (const s of slits) {
    const half = s.w / 2 / R, jj = jw / R;
    ringBlock(s.a - half - jj / 2, jw - 0.01, s.y0 - 0.02, s.y0 + s.h + 0.02, 0.45);
    ringBlock(s.a + half + jj / 2, jw - 0.01, s.y0 - 0.02, s.y0 + s.h + 0.02, 0.45);
    ringBlock(s.a, s.w + 2 * jw + 0.2, s.y0 + s.h + 0.02, s.y0 + s.h + 0.24, 0.45, 0.014);
    ringBlock(s.a, s.w + 2 * jw + 0.2, s.y0 - 0.22, s.y0 - 0.02, 0.5, 0.03);
  }
  // the core (mortar cylinder) and dark slits
  {
    const acc = kit.get(o.mortar || 'mortar');
    const n = 48;
    const ring = (y) => { const ids = []; const rr = Rof(y) - (lod.flat ? 0.03 : 0.012); for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; const p = xf(F, Math.cos(a) * rr, y, Math.sin(a) * rr); ids.push(acc.v(p[0], p[1], p[2], 0, 0, 0.3, 0.6, 0, 0, 1, 0)); } return ids; };
    const ys = bat ? [0, batH * 0.5, batH, H] : [0, H];
    const rs = ys.map(ring);
    for (let k = 0; k < rs.length - 1; k++) for (let i = 0; i < n; i++) acc.q(rs[k][i], rs[k][i + 1], rs[k + 1][i + 1], rs[k + 1][i]);
    for (const s of slits) {
      const pa = kit.get('portal');
      const cx = Math.cos(s.a) * (Rof(s.y0) - 0.2), cz = Math.sin(s.a) * (Rof(s.y0) - 0.2);
      const X = [-Math.sin(s.a), 0, Math.cos(s.a)];
      const base = pa.vcount;
      for (const [x, y] of [[-s.w / 2, 0], [s.w / 2, 0], [s.w / 2, s.h], [-s.w / 2, s.h]]) { const p = xf(F, cx + X[0] * x, s.y0 + y, cz + X[2] * x); pa.v(p[0], p[1], p[2], x + s.w / 2, y, rnd(), 0, 0, s.w, s.h, 1.0); }
      // (wound so the portal faces outward)
      pa.q(base + 3, base + 2, base + 1, base);
    }
  }
  // string courses: a dressed ring projecting 8 cm, its top weathered to shed the rain
  for (const ysc of o.strings || []) {
    const Rs = R + 0.08, n2 = Math.round((2 * Math.PI * Rs) / rnd.range(0.7, 0.95)), ph = rnd() * 3;
    for (let i = 0; i < n2; i++) {
      const a0 = ph + (i / n2) * Math.PI * 2, a1 = ph + ((i + 1) / n2) * Math.PI * 2 - 0.01 / Rs;
      const am = (a0 + a1) / 2, span = (a1 - a0) * Rs;
      block(kit.get(dmat), sub(F, [0, ysc + 0.12, 0]), span, 0.24, 0.4, { r: 0.012, seg: [Math.max(0.12, span / 3), 0.12, 0.2], seed: rnd(), noise: 0.003, chip: 0.015,
        warp: (lx, ly, lz) => { const th = am - lx / Rs; const rr = Rs - 0.2 + lz - (ly > 0 ? 0.0 : 0) ; const yy = ly + (ly > 0 ? -0.06 * (lz / 0.2 + 1) * 0.5 : 0); return [Math.cos(th) * rr, yy, Math.sin(th) * rr]; } });
    }
  }
  // corbel table + parapet ring
  let top = H;
  if (o.corbel !== false) {
    // two courses, each oversailing the one below (a corbelled band carrying the parapet)
    for (const [y0, hh, out] of [[H, 0.28, 0.14], [H + 0.28, 0.24, 0.28]]) {
      const Rc = R + out - 0.15;
      const n2 = Math.round((2 * Math.PI * Rc) / rnd.range(0.7, 0.95));
      const ph = rnd() * 3;
      for (let i = 0; i < n2; i++) {
        const a0 = ph + (i / n2) * Math.PI * 2, a1 = ph + ((i + 1) / n2) * Math.PI * 2 - 0.012 / Rc;
        const am = (a0 + a1) / 2, span = (a1 - a0) * Rc;
        block(kit.get(dmat), sub(F, [0, y0 + hh / 2, 0]), span, hh - 0.01, 0.5, { r: 0.015, seg: [Math.max(0.15, span / 3), 0.14, 0.2], seed: rnd(), noise: 0.003, chip: 0.012, warp: (lx, ly, lz) => { const th = am - lx / Rc; const rr = Rc - 0.25 + lz + (ly < 0 ? -0.05 * (-ly / (hh / 2)) * (lz / 0.25 + 1) : 0); return [Math.cos(th) * rr, ly, Math.sin(th) * rr]; } });
      }
    }
    // the parapet ring above the corbels
    const Rp = R + 0.32;
    const n2 = Math.round((2 * Math.PI * Rp) / 0.8);
    for (const [y0, hh] of [[H + 0.53, 0.36], [H + 0.9, 0.36], [H + 1.27, 0.22]]) {
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
export function conicalRoof(kit0, F, o = {}) {
  const rnd = makeRand(o.seed ?? 23);
  // (round 2) built in its own kit, then given a bell-cast: the lowest part of the cone kicks out
  // to a flatter pitch at the eaves (sprockets), the way a real conical roof sheds water off a wall
  const kit = new Kit(0);
  const R = o.r ?? 4.5, Hc = o.h ?? 7, over = o.eaves ?? 0.35;
  const Re = R + over;
  const slant = Math.hypot(Re, Hc * (Re / R));
  const ang = Math.atan2(Hc, R);
  const mat = o.mat || 'slate';
  // the boarded cone underneath (a dark shell) - visible at the eaves
  {
    // (round 2: in rings, so the bell-cast below bends it with the slates - one quad from the flared
    // eaves to the apex stood proud of the slates over the whole middle of the cone)
    const acc = kit.get('oakDark');
    const n = 48, NR = 24;
    const rings = [];
    for (let j = 0; j <= NR; j++) {
      const t = j / NR, ids = [];
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const p = xf(F, Math.cos(a) * Re * (1 - t), -over * Math.tan(ang) + (Hc + over * Math.tan(ang)) * t - 0.02, Math.sin(a) * Re * (1 - t));
        ids.push(acc.v(p[0], p[1], p[2], a * Re, slant * t, 0.4, 0.6, 0, 0, 1, 0));
      }
      rings.push(ids);
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < n; i++) acc.q(rings[j][i], rings[j + 1][i], rings[j + 1][i + 1], rings[j][i + 1]);
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
  // finial: a lead-capped post, a ball, an iron vane
  tube(kit.get('lead'), [xf(F, 0, Hc - 0.35, 0), xf(F, 0, Hc + 0.55, 0)], (t) => 0.13 * (1 - t * 0.7), { sides: 8, caps: true });
  lathe(kit.get('lead'), sub(F, [0, Hc + 0.55, 0]), [[0.0, 0.0], [0.08, 0.02], [0.14, 0.13], [0.12, 0.25], [0.05, 0.3], [0.0, 0.31]], 12, { seed: rnd() });
  tube(kit.get('iron'), [xf(F, 0, Hc + 0.8, 0), xf(F, 0, Hc + 1.9, 0)], 0.018, { sides: 6, caps: true });
  const va = rnd() * Math.PI * 2;
  block(kit.get('iron'), sub(F, [Math.cos(va) * 0.3, Hc + 1.65, Math.sin(va) * 0.3], [Math.cos(va), 0, Math.sin(va)], [0, 1, 0]), 0.55, 0.3, 0.008, { r: 0.004, seg: [0.2, 0.15, 0.008], seed: rnd(), warp: (lx, ly, lz) => [lx, ly * (1 - 0.6 * Math.max(0, lx / 0.55 + 0.5) ** 2), lz] });
  // the bell-cast (in F's local frame: the kit is built in world coords, so undo / redo F)
  const flare = o.flare ?? 0.14, y0 = -over * Math.tan(ang), yk = y0 + (Hc - y0) * 0.32;
  const inv = (p) => { const d = [p[0] - F[0], p[1] - F[1], p[2] - F[2]]; return [d[0] * F[3] + d[1] * F[4] + d[2] * F[5], d[0] * F[6] + d[1] * F[7] + d[2] * F[8], d[0] * F[9] + d[1] * F[10] + d[2] * F[11]]; };
  kit.deform((x, y, z) => {
    const l = inv([x, y, z]);
    const f = 1 - Math.min(1, Math.max(0, (l[1] - y0) / (yk - y0)));
    const k = 1 + flare * f * f;
    return xf(F, l[0] * k, l[1] - 0.25 * flare * f * f * Re * 0.3, l[2] * k);
  });
  kit0.merge(kit);
}
