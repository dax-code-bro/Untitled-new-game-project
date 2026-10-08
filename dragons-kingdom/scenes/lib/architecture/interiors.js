// Architecture kit - Verdor interiors (PROVISIONAL designs).
//
//   birthingChamber(ctx | kit, F, o)  warm, practical stone chamber: pale ashlar walls, a high
//                                     unglazed opening (the daylight shaft), a heavy oak door,
//                                     a timber ceiling on big beams, flagstone floor, the
//                                     prepared nest (a low dressed-stone curb full of straw and
//                                     linen bedding), oil lamps in iron brackets and on the bench,
//                                     bowls of water, folded cloth, a low stool
//   treatmentRoom(kit, F, o)          a daylit working room: lime-plastered walls over stone, a
//                                     deep window opening (shutters folded back) toward the coast,
//                                     a doorway to the corridor, a settle (seat), stools, a table
//                                     with a basin of water and a jug, clean cloth, shelves
//
// Both return { lights: [THREE.PointLight...], anchors: { name: [x, y, z] (world) } } - the
// scene adds the lights (unshadowed point lights: each shadowed point light costs six renders).
// Frame F: the room's floor centre; walls at x = +-w/2, z = +-d/2.
import * as THREE from 'three';
import { Kit, frame, sub, makeRand, block, tube, lathe, xf, grid, curve, sagLine, fbm3 } from './core.js';
import { masonryFace, courses } from './masonry.js';
import { member } from './timber.js';
import { door } from './openings.js';
import { stain } from './weathering.js';

/**
 * Offline bakes (offline/*.py, Blender): scenes/lib/architecture/cache/<name>.json, git-ignored.
 * Resolves to null (with a warning) when the bake has not been run - builders fall back to
 * their procedural shapes.
 */
export async function loadArchCache(name) {
  try {
    const r = await fetch(new URL(`./cache/${name}.json`, import.meta.url).href);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    console.warn(`architecture: no ${name} bake (run scenes/lib/architecture/offline/${name}.py with Blender's python) - procedural fallback`);
    return null;
  }
}

/** Inward-facing walls: [{ key, o, X, L }] for a w x d room (frames: normal into the room). */
function roomWalls(w, d) {
  return [
    { key: 'north', o: [-w / 2, 0, -d / 2], X: [1, 0, 0], L: w },
    { key: 'east', o: [w / 2, 0, -d / 2], X: [0, 0, 1], L: d },
    { key: 'south', o: [w / 2, 0, d / 2], X: [-1, 0, 0], L: w },
    { key: 'west', o: [-w / 2, 0, d / 2], X: [0, 0, -1], L: d },
  ];
}

/** A floor of flagstones (irregular sizes, slightly uneven, worn). */
export function flagFloor(kit, F, w, d, rnd, o = {}) {
  const mat = o.mat || 'stoneFloor';
  // the walking line (door -> work place): flags there are dished and polished
  const path = o.path || null;
  const pathD = (x, z) => {
    if (!path) return 9;
    const [ax, az, bx, bz] = path, dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    return Math.hypot(x - ax - dx * t, z - az - dz * t);
  };
  let z = -d / 2;
  while (z < d / 2 - 0.05) {
    const rowD = Math.min(rnd.range(0.38, 0.85), d / 2 - z);
    let x = -w / 2 + rnd.range(-0.2, 0);
    while (x < w / 2 - 0.05) {
      const fw = Math.min(rnd.range(0.35, 1.1), w / 2 - x);
      const g = rnd.range(0.006, 0.022);
      // flags of different depths in the row (a stone laid in two halves, a narrow one)
      const split = rnd() < 0.25 && rowD > 0.6;
      const parts = split ? [[0, rowD * 0.45], [rowD * 0.45, rowD]] : [[0, rowD]];
      for (const [z0, z1] of parts) {
        const cx = x + fw / 2, cz = z + (z0 + z1) / 2;
        const pd = pathD(cx, cz);
        const wear = path ? 0.012 * Math.exp(-(pd * pd) / 0.35) : 0;
        block(kit.get(mat), sub(F, [cx + rnd.sym(0.006), -0.05 + rnd.sym(0.006), cz + rnd.sym(0.006)], [1, rnd.sym(0.008), 0], [0, 1, rnd.sym(0.008)]), Math.max(0.05, Math.min(fw, w / 2 - x) - g), 0.1, z1 - z0 - g, {
          r: 0.006, rs: 1, seg: [0.12, 0.1, 0.12], seed: rnd(), noise: 0.003, nf: 4, chip: 0.014, pillow: 0.0015, skip: 8,
          warp: wear ? (lx, ly, lz) => [lx, ly - (ly > 0 ? wear * (1 - Math.min(1, (lx * lx) / (fw * fw / 4))) : 0), lz] : undefined,
        });
      }
      x += fw;
    }
    z += rowD;
  }
  // the bed of earth and dust between the flags
  block(kit.get(o.mortar || 'mortar'), sub(F, [0, -0.07, 0]), w, 0.05, d, { r: 0, seg: [w, 0.05, d], seed: rnd() });
}

/** A timber ceiling: big beams across the short span, joists, boards above. y = soffit height. */
export function beamCeiling(kit, F, w, d, y, rnd, o = {}) {
  const across = w < d;               // beams span the short direction
  const span = across ? w : d, len = across ? d : w;
  const nb = Math.max(2, Math.round(len / (o.beamSpacing ?? 1.6)));
  for (let i = 0; i < nb; i++) {
    const t = -len / 2 + len * (i + 0.5) / nb;
    const a = across ? [-span / 2 - 0.2, y - 0.18, t] : [t, y - 0.18, -span / 2 - 0.2];
    const b = across ? [span / 2 + 0.2, y - 0.18, t] : [t, y - 0.18, span / 2 + 0.2];
    const X = across ? [1, 0, 0] : [0, 0, 1];
    const Fb = sub(F, [(a[0] + b[0]) / 2, y - 0.17, (a[2] + b[2]) / 2], X, [0, 1, 0]);
    member(kit, sub(Fb, [0, 0, 0], [1, 0, 0], [0, 0, -1]), [-span / 2 - 0.2, 0], [span / 2 + 0.2, 0], 0.3, 0.34, rnd, { mat: 'oakDark', bow: -0.03, proud: 0.17 });
  }
  // joists across the beams and the boards
  const nj = Math.round(span / 0.45);
  for (let j = 0; j <= nj; j++) {
    const s = -span / 2 + span * j / nj;
    const Fj = across ? sub(F, [s, y + 0.06, 0], [0, 0, 1], [0, 1, 0]) : sub(F, [0, y + 0.06, s], [1, 0, 0], [0, 1, 0]);
    block(kit.get('oakDark'), Fj, len + 0.3, 0.12, 0.1, { r: 0.006, seg: [0.6, 0.12, 0.1], seed: rnd(), noise: 0.002, nf: 3 });
  }
  block(kit.get('oakDark'), sub(F, [0, y + 0.135, 0]), w + 0.4, 0.03, d + 0.4, { r: 0.002, seg: [w, 0.03, d], seed: rnd(), skip: 0 });
}

/** A clay oil lamp (saucer with a pinched spout) with its flame; returns the flame position (local). */
export function oilLamp(kit, F, rnd, o = {}) {
  lathe(kit.get('clayware'), F, [[0.0, 0.0], [0.05, 0.002], [0.065, 0.015], [0.07, 0.03], [0.055, 0.042], [0.03, 0.045], [0.0, 0.046]], 20, { seed: rnd(), wobble: 0.03 });
  // spout
  block(kit.get('clayware'), sub(F, [0.075, 0.035, 0]), 0.06, 0.018, 0.03, { r: 0.008, rs: 1, seg: [0.02, 0.01, 0.01], seed: rnd() });
  // the flame: a small teardrop, unlit, bright
  const fp = [0.1, 0.06, 0];
  const f = sub(F, fp);
  lathe(kit.get('flame'), f, [[0.0, -0.004], [0.006, 0.0], [0.007, 0.008], [0.004, 0.02], [0.0, 0.032]], 10, { seed: rnd() });
  return fp;
}

/** A shallow clay bowl with water in it. */
export function bowl(kit, F, rnd, o = {}) {
  const r = o.r ?? 0.16, h = o.h ?? 0.08;
  lathe(kit.get('clayware'), F, [[0, 0.002], [r * 0.55, 0.0], [r * 0.85, h * 0.35], [r, h], [r * 0.93, h * 1.02], [r * 0.82, h * 0.4], [r * 0.5, h * 0.12], [0, h * 0.1]], 28, { seed: rnd(), wobble: 0.015 });
  if (o.water !== false) {
    const wy = h * (o.fill ?? 0.72);
    const wr = r * 0.82 + (r * 0.93 - r * 0.82) * 0.6;
    const acc = kit.get('water');
    const c = xf(F, 0, wy, 0);
    const ci = acc.v(c[0], c[1], c[2], 0, 0, 0, 1, 0, 0, 1, 0);
    const ids = [];
    for (let i = 0; i <= 28; i++) { const a = (i / 28) * Math.PI * 2; const p = xf(F, Math.cos(a) * wr, wy, Math.sin(a) * wr); ids.push(acc.v(p[0], p[1], p[2], 0, 0, 0, 1, 0, 0, 1, 0)); }
    for (let i = 0; i < 28; i++) acc.t(ci, ids[i + 1], ids[i]);
  }
}

/** A jug. */
export function jug(kit, F, rnd) {
  lathe(kit.get('clayware'), F, [[0, 0], [0.06, 0], [0.085, 0.05], [0.09, 0.12], [0.07, 0.2], [0.04, 0.24], [0.045, 0.27], [0.05, 0.28], [0.042, 0.282], [0.035, 0.24]], 24, { seed: rnd(), wobble: 0.02 });
  const pts = curve([[0.075, 0.22, 0], [0.13, 0.2, 0], [0.12, 0.1, 0], [0.085, 0.07, 0]], 12).map((p) => xf(F, ...p));
  tube(kit.get('clayware'), pts, 0.012, { sides: 6 });
}

/**
 * A stack of folded linen cloths: each folded in layers (the loose edges show as thin stacked
 * leaves on three sides, a rounded fold along the fourth), the top layer creased and slightly
 * domed by the folds under it; each cloth turned and offset a little on the one below.
 */
export function foldedCloths(kit, F, rnd, n = 3, o = {}) {
  let y = 0;
  for (let i = 0; i < n; i++) {
    const nl = 3 + Math.floor(rnd() * 3), lt = 0.0045;
    const w = (o.w ?? 0.36) + rnd.sym(0.03), d = (o.d ?? 0.26) + rnd.sym(0.02);
    const yaw = rnd.sym(0.1);
    const Fc = sub(F, [rnd.sym(0.015), y, rnd.sym(0.015)], [Math.cos(yaw), 0, Math.sin(yaw)], [0, 1, 0]);
    const ph = rnd() * 6;
    for (let k = 0; k < nl; k++) {
      const top = k === nl - 1;
      const ox = rnd.sym(0.006), oz = rnd.sym(0.004), sx = w - k * 0.002 + rnd.sym(0.004);
      block(kit.get('linen'), sub(Fc, [ox, (k + 0.5) * lt, oz]), sx, lt * 0.9, d - 0.012, {
        r: lt * 0.4, rs: 1, seg: top ? [0.03, lt, 0.03] : [0.08, lt, 0.08], seed: rnd(), noise: top ? 0.0012 : 0.0006, nf: 25,
        warp: top ? (lx, ly, lz) => [lx, ly + 0.003 * (1 - (2 * lx / sx) ** 2) + 0.0018 * Math.sin(lx * 31 + ph) * Math.sin(lz * 17 + ph) + 0.0012 * Math.pow(1 - Math.abs(Math.sin(lx * 9 + lz * 14 + ph)), 6), lz] : undefined,
      });
    }
    // the fold along the +z edge: a rounded roll the height of the stack
    const sh = nl * lt;
    const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(xf(Fc, -w / 2 + 0.006 + (w - 0.012) * t, sh / 2, d / 2 - 0.012 + 0.0015 * Math.sin(t * 9 + ph))); }
    tube(kit.get('linen'), pts, sh / 2 + 0.0008, { sides: 10, seed: rnd() });
    y += sh + 0.001;
  }
}

/** A joined oak armchair (F at the seat's centre on the floor, the sitter facing +x): legs and arm
 * posts, rails, a boarded back, a straw-stuffed cushion; o.pad 'left' | 'right' builds that arm up
 * with a folded cloth pad (an arm support). */
export function armChair(kit, F, rnd, o = {}) {
  const sw = 0.56, sd = 0.5, sh = 0.45, ah = 0.66, bh = 1.05;
  const leg = (x, z, y1, wd = 0.055) => block(kit.get('oakDark'), sub(F, [x, y1 / 2, z]), wd, y1, wd, { r: 0.006, rs: 1, seg: [wd, 0.2, wd], seed: rnd(), noise: 0.001, chip: 0.006, axis: [0, 1, 0] });
  // back legs run up into the back, front legs up into the arms
  for (const sz of [-1, 1]) { leg(-sd / 2 + 0.03, sz * (sw / 2 - 0.03), bh, 0.06); leg(sd / 2 - 0.03, sz * (sw / 2 - 0.03), ah, 0.055); }
  // seat rails and the boarded seat
  for (const [x, z, L, X] of [[0, sw / 2 - 0.03, sd, [1, 0, 0]], [0, -sw / 2 + 0.03, sd, [1, 0, 0]], [sd / 2 - 0.03, 0, sw, [0, 0, 1]], [-sd / 2 + 0.03, 0, sw, [0, 0, 1]]]) block(kit.get('oakDark'), sub(F, [x, sh - 0.05, z], X, [0, 1, 0]), L - 0.03, 0.07, 0.03, { r: 0.004, seg: [0.2, 0.07, 0.03], seed: rnd(), axis: [1, 0, 0] });
  block(kit.get('oak'), sub(F, [0, sh, 0]), sd + 0.03, 0.03, sw + 0.02, { r: 0.006, seg: [0.2, 0.03, 0.2], seed: rnd(), noise: 0.001, axis: [0, 0, 1] });
  // stretchers low down
  for (const sz of [-1, 1]) block(kit.get('oakDark'), sub(F, [0, 0.12, sz * (sw / 2 - 0.03)]), sd - 0.06, 0.04, 0.025, { r: 0.004, seg: [0.2, 0.04, 0.025], seed: rnd(), axis: [1, 0, 0] });
  // the arms: shaped boards from the back to the front posts
  for (const sz of [-1, 1]) block(kit.get('oak'), sub(F, [0.02, ah + 0.012, sz * (sw / 2 - 0.03)]), sd + 0.06, 0.03, 0.075, { r: 0.012, rs: 1, seg: [0.1, 0.03, 0.04], seed: rnd(), noise: 0.001, axis: [1, 0, 0] });
  // the boarded back between the back legs, a top rail
  for (let k = 0; k < 4; k++) block(kit.get('oak'), sub(F, [-sd / 2 + 0.03, sh + 0.03 + (bh - sh - 0.1) / 2, -sw / 2 + 0.06 + (sw - 0.12) * (k + 0.5) / 4], [0, 1, 0], [-1, 0, 0]), bh - sh - 0.1, (sw - 0.12) / 4 - 0.006, 0.022, { r: 0.004, seg: [0.2, 0.06, 0.022], seed: rnd(), noise: 0.001, axis: [1, 0, 0] });
  block(kit.get('oakDark'), sub(F, [-sd / 2 + 0.03, bh - 0.03, 0], [0, 0, 1], [0, 1, 0]), sw, 0.07, 0.06, { r: 0.008, seg: [0.2, 0.07, 0.06], seed: rnd(), axis: [1, 0, 0] });
  // a cushion: leather over straw, sagging in the middle
  block(kit.get('leather'), sub(F, [0.02, sh + 0.045, 0]), sd - 0.02, 0.06, sw - 0.08, { r: 0.025, rs: 2, seg: [0.06, 0.03, 0.06], seed: rnd(), noise: 0.002, nf: 12, warp: (lx, ly, lz) => [lx, ly - (ly > 0 ? 0.015 * (1 - (2 * lx / sd) ** 2) * (1 - (2 * lz / sw) ** 2) : 0), lz] });
  // the arm support: a folded pad on the arm, built up, a cloth over it
  if (o.pad) {
    const sz = o.pad === 'left' ? -1 : 1;
    foldedCloths(kit, sub(F, [0.03, ah + 0.027, sz * (sw / 2 - 0.03)], [1, 0, 0], [0, 1, 0]), rnd, 3, { w: 0.42, d: 0.16 });
  }
}

/** A plank bench / table: top boards on trestle legs. */
export function bench(kit, F, rnd, o = {}) {
  const L = o.L ?? 1.8, D = o.d ?? 0.38, H = o.h ?? 0.46, t = o.t ?? 0.06;
  const nb = Math.max(1, Math.round(D / 0.2));
  for (let i = 0; i < nb; i++) {
    const z = -D / 2 + D * (i + 0.5) / nb;
    block(kit.get('oak'), sub(F, [0, H - t / 2, z + rnd.sym(0.004)]), L, t, D / nb - 0.006, { r: 0.008, rs: 1, seg: [0.3, t, 0.1], seed: rnd(), noise: 0.0015, nf: 4, chip: 0.004 });
  }
  for (const sx of [-1, 1]) {
    const x = sx * (L / 2 - 0.18);
    for (const sz of [-1, 1]) member(kit, sub(F, [x, 0, sz * (D / 2 - 0.06)], [0, 1, 0], [-1, 0, 0]), [0, 0], [H - t, sz * 0.05], 0.06, 0.06, rnd, { mat: 'oakDark', proud: 0.03 });
    member(kit, sub(F, [x, 0, 0], [0, 0, 1], [0, 1, 0]), [-D / 2 + 0.04, 0.12], [D / 2 - 0.04, 0.12], 0.05, 0.05, rnd, { mat: 'oakDark', proud: 0.025 });
  }
  member(kit, sub(F, [0, 0.12, 0], [1, 0, 0], [0, 1, 0]), [-L / 2 + 0.18, 0], [L / 2 - 0.18, 0], 0.05, 0.05, rnd, { mat: 'oakDark', proud: 0.025 });
}

/** A three-legged stool. */
export function stool(kit, F, rnd, o = {}) {
  const H = o.h ?? 0.42, R = o.r ?? 0.17;
  lathe(kit.get('oak'), sub(F, [0, H - 0.045, 0]), [[0, 0], [R, 0], [R + 0.004, 0.02], [R, 0.045], [0, 0.046]], 20, { seed: rnd(), wobble: 0.01 });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.3;
    const top = [Math.cos(a) * R * 0.55, H - 0.04, Math.sin(a) * R * 0.55], bot = [Math.cos(a) * R * 1.15, 0, Math.sin(a) * R * 1.15];
    tube(kit.get('oakDark'), [xf(F, ...bot), xf(F, ...top)], (t) => 0.02 - 0.004 * t, { sides: 7, caps: true, seed: rnd() });
  }
}

/** The nest's bedding frame (inner half sizes A x B, the boards' top TOP, board thickness BT). */
export const NEST = { A: 1.25, B: 1.0, TOP: 0.34, BT: 0.06 };
/** Height of the straw bed inside the frame (nest-local x, z) - the offline cloth bake uses the same. */
export function nestBedY(x, z) {
  const sx = x / NEST.A, sz = z / NEST.B;
  const dome = 0.17 * Math.max(0, 1 - sx * sx) * Math.max(0, 1 - sz * sz);
  return 0.3 + dome + 0.018 * Math.sin(x * 7.3 + 1.0) * Math.sin(z * 6.1 + 0.5) + 0.01 * Math.sin(x * 13.1 - z * 11.3 + 2.0);
}

/**
 * Straw: stalks 5-40 cm long, 1.5-4 mm thick, bent, kinked and broken, in three colour families
 * (the straw material reads the family from the seed's third), laid in clumps of a common
 * direction. yAt(x, z) -> the surface under a point. Returns the number of stalks.
 */
export function strawClumps(acc, F, rnd, n, place, yAt, o = {}) {
  let count = 0;
  for (let c = 0; c < n; c++) {
    const pl = place(rnd);
    if (!pl) continue;
    const [cx, cz] = pl;
    const fam = Math.floor(rnd() * 3 * 0.999);
    const dir0 = rnd() * Math.PI * 2, ns = 4 + Math.floor(rnd() * 9);
    for (let i = 0; i < ns; i++) {
      // (mostly short pieces - trodden, broken - a few long whole stalks; laid one way in a clump)
      const dir = dir0 + rnd.sym(0.3), l = Math.pow(rnd(), 2.2) * 0.3 + 0.04;
      const x0 = cx + rnd.sym(0.06), z0 = cz + rnd.sym(0.06);
      if (o.skip && o.skip(x0, z0)) continue;
      const bend = rnd.sym(0.25) * l, kink = rnd() < 0.3 ? rnd.range(0.3, 0.8) : -1;
      const pts = [];
      const np = 5;
      const ux = Math.cos(dir), uz = Math.sin(dir);
      let ok = true;
      for (let k = 0; k < np; k++) {
        const t = k / (np - 1);
        // a bow across the stalk, and a broken stalk turns sharply at its kink
        const off = bend * Math.sin(Math.PI * t) + (kink > 0 && t > kink ? (t - kink) * l * 0.9 : 0);
        const x = x0 + ux * l * t - uz * off, z = z0 + uz * l * t + ux * off;
        if (o.skip && o.skip(x, z)) { ok = false; break; }
        const lift = (k === 0 || k === np - 1 ? 0.0015 : 0.003 + rnd() * 0.006) + (o.loft ? o.loft * rnd() : 0);
        pts.push(xf(F, x, yAt(x, z) + lift, z));
      }
      if (!ok || pts.length < 2) continue;
      tube(acc, pts, rnd.range(0.0012, 0.0026), { sides: 3, seed: (fam + 0.05 + 0.9 * rnd()) / 3 });
      count++;
    }
  }
  return count;
}

/**
 * The prepared nest: a plain bedding frame - four heavy oak boards on edge pegged into corner posts
 * (a crib for bedding, nothing more) - full of straw heaped high in the middle and spilling over the
 * boards onto the flags, a linen sheet laid over part of it (cloth-simulated: offline/nest_cloth.py).
 * F at the frame's centre on the floor. o: cloth (the bake). Returns { r, top }.
 */
export function nest(kit, F, rnd, o = {}) {
  const { A, B, TOP, BT } = NEST;
  // the frame: two boards per side (edge-jointed), pegged to corner posts a little proud of them
  for (const [cx, cz, L, along] of [[0, B + BT / 2, 2 * A + 2 * BT, 'x'], [0, -B - BT / 2, 2 * A + 2 * BT, 'x'], [A + BT / 2, 0, 2 * B, 'z'], [-A - BT / 2, 0, 2 * B, 'z']]) {
    const X = along === 'x' ? [1, 0, 0] : [0, 0, 1];
    for (const [y0, hh] of [[0.0, 0.17], [0.172, 0.168]]) {
      block(kit.get(rnd() < 0.5 ? 'oak' : 'oakDark'), sub(F, [cx, y0 + hh / 2, cz], X, [0, 1, 0]), L - 0.01, hh - 0.004, BT, { r: rnd.range(0.005, 0.012), rs: 1, seg: [0.25, hh, BT], seed: rnd(), noise: 0.0015, chip: 0.008, axis: [1, 0, 0] });
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    block(kit.get('oakDark'), sub(F, [sx * (A + BT / 2), (TOP + 0.08) / 2, sz * (B + BT / 2)]), 0.12, TOP + 0.08, 0.12, { r: 0.012, rs: 1, seg: [0.06, 0.15, 0.06], seed: rnd(), noise: 0.0015, chip: 0.01, axis: [0, 1, 0] });
    for (const yy of [0.09, 0.26]) tube(kit.get('oakPeg'), [xf(F, sx * (A + BT / 2) + sx * 0.0, yy, sz * (B + BT + 0.003)), xf(F, sx * (A + BT / 2), yy, sz * (B + BT + 0.007))], 0.012, { sides: 7, caps: true, seed: rnd() });
  }
  // the straw bed under it all (a matte surface, nearly hidden by the stalks)
  grid(kit.get('strawBed'), 60, 48, (u, v) => {
    const x = -A + 2 * A * u, z = -B + 2 * B * v;
    return { p: xf(F, x, nestBedY(x, z) - 0.008, z), uv: [x, z], seed: 0.31, ao: 0.6 + 0.4 * Math.min(1, Math.min(A - Math.abs(x), B - Math.abs(z)) / 0.3) };
  }, [1, 0, 0], true);        // (round 2: wound to face up - it faced down and was culled: the floor showed through the stalks)
  // the linen's real footprint (2 cm cells under its draped quads), eroded 6 cm: straw runs in under
  // its edges and lies over them
  let cover = null;
  const CS = 0.02;
  if (o.cloth && o.cloth.bed === 2) {
    const { nx, ny, positions: P } = o.cloth;
    cover = new Set();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
      for (const k of [j * (nx + 1) + i, j * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i, (j + 1) * (nx + 1) + i + 1]) {
        a0 = Math.min(a0, P[k * 3]); a1 = Math.max(a1, P[k * 3]); b0 = Math.min(b0, P[k * 3 + 2]); b1 = Math.max(b1, P[k * 3 + 2]);
      }
      for (let gx = Math.floor(a0 / CS); gx <= Math.floor(a1 / CS); gx++) for (let gz = Math.floor(b0 / CS); gz <= Math.floor(b1 / CS); gz++) cover.add(gx * 4096 + gz);
    }
  }
  const onCloth = (x, z) => {
    if (!cover) return false;
    const gx = Math.floor(x / CS), gz = Math.floor(z / CS);
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (!cover.has((gx + i) * 4096 + gz + j)) return false;
    return true;
  };
  // the surface under a stalk: the bed inside, the boards' top, the floor outside
  const surf = (x, z) => {
    const ex = Math.abs(x) - A, ez = Math.abs(z) - B;
    if (ex <= 0 && ez <= 0) return nestBedY(x, z);
    if (ex <= BT && ez <= BT) return TOP + 0.004;
    return 0.004;
  };
  const acc = kit.get('straw');
  // inside: dense clumps over the whole bed (not on the linen), heaped against the boards
  strawClumps(acc, F, rnd, o.clumps ?? 1500, (r) => [r.sym(A - 0.03), r.sym(B - 0.03)], surf, { skip: onCloth });
  // over the boards and out onto the flags: stalks pulled out of the bed when it was made
  strawClumps(acc, F, rnd, 380, (r) => {
    const side = Math.floor(r() * 4), t = r.sym(1);
    const out = Math.pow(r(), 1.7) * 0.75 + 0.02;
    return side === 0 ? [A + BT * 0.5 + out * 0.6 - 0.05, t * B] : side === 1 ? [-A - BT * 0.5 - out * 0.6 + 0.05, t * B] : side === 2 ? [t * A, B + BT * 0.5 + out * 0.6 - 0.05] : [t * A, -B - BT * 0.5 - out * 0.6 + 0.05];
  }, surf, { skip: onCloth });
  // linen laid over the bed: the cloth-simulated drape when baked
  if (cover) {
    const { nx, ny, positions: P } = o.cloth;
    const yAt = (k) => P[k + 1] + 0.003;
    grid(kit.get('linen'), nx, ny, (u, v) => {
      const i = Math.round(u * nx), j = Math.round(v * ny), k = (j * (nx + 1) + i) * 3;
      return { p: xf(F, P[k], yAt(k), P[k + 2]), uv: [u * 1.5, v * 1.15], seed: 0.62, ao: 0.85 };
    }, [1, 0, 0], false);
    // a few stray stems lying on the linen
    for (let s2 = 0; s2 < 30; s2++) {
      const i = 3 + Math.floor(rnd() * (nx - 5)), j = 2 + Math.floor(rnd() * (ny - 4)), di = rnd() < 0.5 ? 1 : -1, dj = Math.floor(rnd() * 3) - 1;
      const k0 = (j * (nx + 1) + i) * 3, k1 = ((j + dj * 2) * (nx + 1) + i + di * 3) * 3, km = (((j + dj)) * (nx + 1) + i + di) * 3;
      tube(acc, [xf(F, P[k0], yAt(k0) + 0.003, P[k0 + 2]), xf(F, (P[k0] + P[k1]) / 2, yAt(km) + 0.005, (P[k0 + 2] + P[k1 + 2]) / 2), xf(F, P[k1], yAt(k1) + 0.003, P[k1 + 2])], rnd.range(0.0009, 0.0016), { sides: 3, seed: (Math.floor(rnd() * 3) + 0.5) / 3 });
    }
  } else {
    // (procedural fallback) linen in soft folds over the middle of the bed
    grid(kit.get('linen'), 40, 30, (u, v) => {
      const x = (u - 0.5) * 1.4 + 0.5, z = (v - 0.5) * 1.1;
      const y = nestBedY(Math.max(-A, Math.min(A, x)), z) + 0.02 + 0.015 * Math.sin(x * 7 + z * 3) * Math.cos(z * 5);
      return { p: xf(F, x, y, z), uv: [x, z], seed: 0.62, ao: 0.8 };
    }, [1, 0, 0], false);
  }
  return { r: Math.hypot(A, B), top: nestBedY(0, 0) };
}

/**
 * The birthing chamber. o: w (7.2), d (6.2), h (6.6), window: { wall: 'east', x, y, w, h },
 * door: { wall: 'south', x, w, h, open }, lod, seed, lampLight (intensity, cd), cloth (the baked
 * nest linen: await loadArchCache('nest_cloth')).
 */
export function birthingChamber(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 301);
  // (round 2: the ceiling comes down to 5.6 m - its beams are in the wide shots)
  const w = o.w ?? 7.2, d = o.d ?? 6.2, h = o.h ?? 5.6, T = 0.9;
  const lod = o.lod || 'mid';
  const local = new Kit(0);
  const win = { wall: 'east', x: 2.2, y: 3.15, w: 1.1, h: 1.6, ...(o.window || {}) };
  const dr = { wall: 'south', x: 4.6, w: 1.4, h: 2.7, open: 0.35, ...(o.door || {}) };
  const hw = h + 0.4;                     // the walls run up past the ceiling boards (no light leaks)
  const C = courses(rnd, hw, { min: 0.2, max: 0.34, plinth: 0.36 });
  // lamp niches: arched recesses in the west and north walls (the lamps stand in them)
  const niches = { west: { x: 3.25, y: 1.42, w: 0.42, h: 0.6 }, north: { x: 1.7, y: 1.42, w: 0.42, h: 0.6 } };
  const nicheLamps = [];
  for (const wl of roomWalls(w, d)) {
    const Fw = sub(frame([0, 0, 0]), wl.o, wl.X, [0, 1, 0]);
    const ops = [];
    if (wl.key === win.wall) ops.push({ x: win.x, y: win.y, w: win.w, h: win.h, head: 'arch', reveal: T, archDepth: T, sill: false });
    if (wl.key === dr.wall) ops.push({ x: dr.x, y: 0, w: dr.w, h: dr.h, head: 'arch', reveal: T * 0.6 });
    const nc = niches[wl.key];
    if (nc) ops.push({ x: nc.x, y: nc.y, w: nc.w, h: nc.h, head: 'arch', reveal: 0.3, niche: 0.3, jamb: false, sill: true });
    masonryFace(local, Fw, wl.L, hw, { courses: C, style: 'washed', mat: 'stoneWashed', dressedMat: 'stonePale', mortar: 'mortarWashed', T, lod, seed: rnd() * 999, openings: ops, back: true, backMat: 'mortarPale', quoinStart: () => 0.04, quoinEnd: () => 0.04 });
    if (nc) {
      // the lamp on the niche floor, the soot it has laid on the wall above the niche over the years
      const Fl = sub(Fw, [nc.x + nc.w / 2 - 0.08, nc.y + 0.004, -0.17], [1, 0, 0], [0, 1, 0]);
      nicheLamps.push(xf(Fl, ...oilLamp(local, Fl, rnd)));
      grid(local.get('sootStain'), 10, 16, (u, v) => {
        const x = (u - 0.5) * (0.4 + 0.95 * v), y = nc.y + nc.h - 0.12 + v * 1.7;
        return { p: xf(Fw, nc.x + nc.w / 2 + x, y, 0.03 + 0.004 * v), uv: [u, v], seed: rnd(), ao: 1 };
      }, [1, 0, 0], false);
      // oil spilled and soaked into the niche floor's front edge
      stain(local, Fw, nc.x + nc.w / 2, nc.y - 0.1, nc.w * 0.8, 0.35, 'dirt', { strength: 0.45, seed: rnd(), z: 0.03 });
    }
    if (wl.key === dr.wall) door(local, sub(Fw, [dr.x, 0, 0]), { w: dr.w, h: dr.h, arch: true, inset: T * 0.6, open: dr.open, hingeLeft: false, room: true, wallT: T, seed: rnd() * 999 });
    // a threshold slab through the reveal (the floor runs on to the room behind the portal)
    if (wl.key === dr.wall) block(local.get('stoneFloor'), sub(Fw, [dr.x + dr.w / 2, -0.066, -T / 2]), dr.w + 0.1, 0.14, T, { r: 0.012, seg: [0.2, 0.07, 0.2], seed: 0.37, noise: 0.003, chip: 0.008 });
    // a splayed sill for the high window: the bottom of the reveal slopes down into the room
    if (wl.key === win.wall) block(local.get('stonePale'), sub(Fw, [win.x + win.w / 2, win.y - 0.12, -T / 2 + 0.02], [1, 0, 0], [0, Math.cos(0.45), Math.sin(0.45)]), win.w + 0.06, 0.12, T * 1.05, { r: 0.012, seg: [0.2, 0.06, 0.2], seed: rnd(), noise: 0.003, chip: 0.01 });
  }
  flagFloor(local, frame([0, 0, 0]), w, d, rnd, { path: [w / 2 - dr.x - dr.w / 2, d / 2 - 0.3, -0.6, 0.3] });
  beamCeiling(local, frame([0, 0, 0]), w, d, h, rnd);
  // the nest (centre slightly toward the west wall), the bench along the north wall
  const nestC = o.nest || [-0.6, 0, 0.3];
  const nst = nest(local, frame(nestC), rnd, { cloth: o.cloth });
  // straw and chaff trodden about the floor: round the nest and along the way from the door
  {
    const acc = local.get('straw');
    strawClumps(acc, frame([0, 0, 0]), rnd, 260, (r) => {
      if (r() < 0.65) { const a = r() * Math.PI * 2, rr = 1.5 + Math.pow(r(), 1.5) * 1.6; return [nestC[0] + Math.cos(a) * rr * 1.1, nestC[2] + Math.sin(a) * rr * 0.9]; }
      const t = r(); return [w / 2 - dr.x - dr.w / 2 + (nestC[0] - (w / 2 - dr.x - dr.w / 2)) * t + r.sym(0.4), d / 2 - 0.3 + (nestC[2] - d / 2 + 0.3) * t + r.sym(0.4)];
    }, () => 0.004, { skip: (x, z) => Math.abs(x - nestC[0]) < NEST.A + NEST.BT + 0.02 && Math.abs(z - nestC[2]) < NEST.B + NEST.BT + 0.02 });
  }
  const lamps = [];
  {
    const bF = frame([-0.4, 0, -d / 2 + 0.5]);
    bench(local, bF, rnd, { L: 2.2, d: 0.42, h: 0.62 });
    bowl(local, sub(bF, [-0.6, 0.62, 0.02]), rnd, { r: 0.17 });
    bowl(local, sub(bF, [-0.15, 0.62, -0.04]), rnd, { r: 0.14, h: 0.07 });
    jug(local, sub(bF, [0.25, 0.62, 0.05]), rnd);
    foldedCloths(local, sub(bF, [0.75, 0.62, 0.0]), rnd, 4);
    lamps.push(xf(sub(bF, [-0.95, 0.62, 0.08]), ...oilLamp(local, sub(bF, [-0.95, 0.62, 0.08]), rnd)));
  }
  stool(local, frame([nestC[0] + 2.05, 0, nestC[2] + 0.6]), rnd, { h: 0.4 });
  foldedCloths(local, frame([nestC[0] + 1.95, 0, nestC[2] - 0.55]), rnd, 3, { w: 0.4, d: 0.3 });
  bowl(local, frame([nestC[0] + 1.8, 0, nestC[2] - 1.25]), rnd, { r: 0.19, h: 0.09 });
  for (const p of nicheLamps) lamps.push(p);
  // a lamp on an iron bracket driven into a joint of the east wall
  for (const [wx, wz, ry] of [[w / 2 - 0.02, 1.4, -Math.PI / 2]]) {
    const Fb = frame([wx, 1.75, wz], [Math.cos(ry), 0, -Math.sin(ry)], [0, 1, 0]);
    // the bracket: a bar out of the wall and a little iron shelf
    tube(local.get('iron'), [xf(Fb, 0, 0, 0), xf(Fb, 0, 0, 0.42)], 0.012, { sides: 6 });
    tube(local.get('iron'), [xf(Fb, 0, -0.2, 0), xf(Fb, 0, -0.01, 0.28)], 0.01, { sides: 6 });
    block(local.get('iron'), sub(Fb, [0, 0.004, 0.36]), 0.16, 0.008, 0.14, { r: 0.002, seg: [0.16, 0.008, 0.14], seed: rnd() });
    // the soot plume the flame has laid on the wall above it over years (a soft fan)
    grid(local.get('sootStain'), 10, 16, (u, v) => {
      const x = (u - 0.5) * (0.4 + 0.95 * v), y = 0.05 + v * 1.7;
      return { p: xf(Fb, x, y, 0.03 + 0.004 * v), uv: [u, v], seed: rnd(), ao: 1 };
    }, [1, 0, 0], false);
    const Fl = sub(Fb, [0, 0.008, 0.35], [0, 0, 1], [0, 1, 0]);
    lamps.push(xf(Fl, ...oilLamp(local, Fl, rnd)));
  }
  kit.merge(local, F);
  const lights = lamps.map((p) => {
    const l = new THREE.PointLight(new THREE.Color(1.0, 0.5, 0.18), o.lampLight ?? 2.2, 7.0, 2);
    const q = xf(F, p[0], p[1], p[2]);
    l.position.set(q[0], q[1] + 0.03, q[2]);
    l.castShadow = false;
    return l;
  });
  return { lights, anchors: { nest: xf(F, ...nestC), nestTop: nst.top, window: win, door: dr, w, d, h, T } };
}

/**
 * The treatment room. o: w (5.6), d (4.6), h (3.3), window { wall: 'west', x, y, w, h },
 * door { wall: 'east', x, w, h, open }, lod, seed.
 */
export function treatmentRoom(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 311);
  const w = o.w ?? 5.6, d = o.d ?? 4.6, h = o.h ?? 3.3, T = 0.75;
  const lod = o.lod || 'mid';
  const local = new Kit(0);
  const win = { wall: 'west', x: 1.5, y: 0.85, w: 1.25, h: 1.45, ...(o.window || {}) };
  const dr = { wall: 'east', x: 2.6, w: 1.05, h: 2.15, open: 0.85, ...(o.door || {}) };
  const hw = h + 0.4;
  const C = courses(rnd, hw, { min: 0.2, max: 0.32 });
  for (const wl of roomWalls(w, d)) {
    const Fw = sub(frame([0, 0, 0]), wl.o, wl.X, [0, 1, 0]);
    const ops = [];
    // the window is splayed: 30 cm wider each side and lower at the sill on the room face than the
    // window itself at the back of the wall (it spreads the daylight)
    const SP = 0.3, SS = 0.22, SH = 0.12;
    if (wl.key === win.wall) ops.push({ x: win.x, y: win.y, w: win.w, h: win.h, head: 'lintel', reveal: T, sill: false, splay: SP, sillSplay: SS, headSplay: SH, jamb: false });
    if (wl.key === dr.wall) ops.push({ x: dr.x, y: 0, w: dr.w, h: dr.h, head: 'lintel', reveal: T * 0.5 });
    // stone walls with a lime plaster coat over most of it (bare stone where it has fallen)
    // rubble walling under the lime plaster (it shows where the coat has fallen)
    masonryFace(local, Fw, wl.L, hw, { courses: C, style: 'washed', mat: 'stoneWashed', dressedMat: 'stoneWashed', mortar: 'mortarWashed', T, lod: 'mid', seed: rnd() * 999, openings: ops, back: true, backMat: 'mortarPale', quoinStart: () => 0.04, quoinEnd: () => 0.04 });
    plasterCoat(local, Fw, wl.L, h, ops.map((op) => (op.splay ? { ...op, x: op.x - SP, w: op.w + 2 * SP, y: op.y - SS, h: op.h + SS + SH } : op)), rnd, { inset: 0.03, mat: 'plasterInt' });
    if (wl.key === dr.wall) door(local, sub(Fw, [dr.x, 0, 0]), { w: dr.w, h: dr.h, inset: T * 0.5, open: dr.open, hingeLeft: true, room: true, wallT: T, seed: rnd() * 999 });
    // a threshold slab through the reveal (the floor runs on to the room behind the portal)
    if (wl.key === dr.wall) block(local.get('stoneFloor'), sub(Fw, [dr.x + dr.w / 2, -0.066, -T / 2]), dr.w + 0.1, 0.14, T, { r: 0.012, seg: [0.2, 0.07, 0.2], seed: 0.53, noise: 0.003, chip: 0.008 });
    if (wl.key === win.wall) {
      // the deep reveal is plastered; inside shutters folded back against the splay
      const Fo = sub(Fw, [win.x, win.y, 0]);
      // the stone sill: slabs falling from the window down the splay into the room, worn smooth
      {
        const ang = Math.atan2(SS, T), Ls = Math.hypot(SS, T);
        let x0 = -SP * 0.5;
        while (x0 < win.w + SP * 0.5 - 0.05) {
          const lw = Math.min(win.w + SP * 0.5 - x0, rnd.range(0.4, 0.7));
          block(local.get('stoneFloor'), sub(Fo, [x0 + lw / 2, -SS / 2 - 0.035, -T / 2], [1, 0, 0], [0, Math.cos(ang), -Math.sin(ang)]), lw - 0.01, 0.07, Ls + 0.02, { r: 0.012, rs: 1, seg: [0.15, 0.07, 0.2], seed: rnd(), noise: 0.002, chip: 0.012 });
          x0 += lw;
        }
      }
      for (const sx of [0, 1]) {
        // folded back flat against the inside wall face either side of the splayed opening
        const Fl = sub(Fo, [sx ? win.w + SP + 0.03 : -SP - 0.03, 0.02, 0.07], sx ? [1, 0, 0.04] : [-1, 0, 0.04], [0, 1, 0]);
        for (let i = 0; i < 3; i++) block(local.get('oakDark'), sub(Fl, [0.1 + i * 0.205, win.h / 2 - 0.02, 0.012]), 0.2, win.h - 0.06, 0.025, { r: 0.004, seg: [0.2, 0.5, 0.025], seed: rnd(), noise: 0.0015, axis: [0, 1, 0] });
        // ledges, strap hinges with nail heads, the pintles leaded into the reveal
        for (const fy of [0.18, 0.82]) {
          block(local.get('oakDark'), sub(Fl, [0.31, win.h * fy, 0.035]), 0.58, 0.1, 0.022, { r: 0.004, seg: [0.3, 0.1, 0.022], seed: rnd(), noise: 0.0015, axis: [1, 0, 0] });
          block(local.get('iron'), sub(Fl, [0.24, win.h * fy, 0.05]), 0.46, 0.04, 0.006, { r: 0.002, seg: [0.1, 0.04, 0.006], seed: rnd(), warp: (lx, ly, lz) => [lx, ly * (1 - 0.3 * (lx / 0.46 + 0.5)), lz] });
          for (let k = 0; k < 3; k++) tube(local.get('iron'), [xf(Fl, 0.08 + k * 0.14, win.h * fy, 0.052), xf(Fl, 0.08 + k * 0.14, win.h * fy, 0.06)], 0.007, { sides: 5, caps: true });
          tube(local.get('iron'), [xf(Fl, -0.01, win.h * fy - 0.05, 0.012), xf(Fl, -0.01, win.h * fy + 0.05, 0.012)], 0.011, { sides: 6, caps: true });
        }
      }
    }
  }
  flagFloor(local, frame([0, 0, 0]), w, d, rnd, { mat: 'stoneFloor', path: [w / 2 - 0.4, -d / 2 + dr.x + dr.w / 2, -w / 2 + 1.4, 0.4] });
  beamCeiling(local, frame([0, 0, 0]), w, d, h, rnd, { beamSpacing: 1.3 });
  // a settle (high-backed bench) under the window wall's neighbour, stools, a table
  const settle = frame([-0.9, 0, d / 2 - 0.42], [-1, 0, 0], [0, 1, 0]);
  bench(local, settle, rnd, { L: 1.7, d: 0.45, h: 0.46 });
  for (let i = 0; i < 6; i++) block(local.get('oak'), sub(settle, [-0.85 + 0.03 + i * 0.29 + 0.14, 0.76, 0.23], [1, 0, 0], [0, 1, 0]), 0.28, 0.6, 0.03, { r: 0.004, seg: [0.28, 0.4, 0.03], seed: rnd(), noise: 0.0015, axis: [0, 1, 0] });
  // the patient's chair by the window light, facing the room (+x): a joined oak armchair, a cushion
  // on the seat, its LEFT arm (-z) built up with a folded pad where her injured left arm rests (2B)
  const seatP = [-w / 2 + 1.35, 0, 0.4];
  const chairF = frame(seatP);
  armChair(local, chairF, rnd, { pad: 'left' });
  const armF = sub(chairF, [0.0, 0, -0.29]);
  stool(local, frame([0.9, 0, 1.4]), rnd, { h: 0.44 });
  const table = frame([0.6, 0, -d / 2 + 0.75]);
  bench(local, table, rnd, { L: 1.6, d: 0.75, h: 0.76, t: 0.07 });
  bowl(local, sub(table, [-0.3, 0.76, 0.05]), rnd, { r: 0.22, h: 0.1 });
  jug(local, sub(table, [0.15, 0.76, -0.12]), rnd);
  foldedCloths(local, sub(table, [0.5, 0.76, 0.1]), rnd, 5, { w: 0.34, d: 0.26 });
  // a clean cloth on the table, hanging over its front edge: cloth-simulated (offline/table_cloth.py)
  if (o.tableCloth) {
    const { nx, ny, positions: P } = o.tableCloth;
    grid(local.get('linen'), nx, ny, (u, v) => {
      const i = Math.round(u * nx), j = Math.round(v * ny), k = (j * (nx + 1) + i) * 3;
      return { p: xf(table, P[k], P[k + 1] + 0.002, P[k + 2]), uv: [u * 0.8, v * 0.95], seed: 0.4, ao: 0.9 };
    }, [1, 0, 0], false);
  } else grid(local.get('linen'), 24, 16, (u, v) => {
    const x = (u - 0.5) * 0.55, z = v * 0.65;
    const over = Math.max(0, z - 0.32);
    const p = xf(table, -0.55 + x, 0.765 - over * 1.6 + 0.005 * Math.sin(x * 30), -0.05 + Math.min(z, 0.38) + over * 0.05);
    return { p, uv: [x, z], seed: 0.4, ao: 0.85 };
  }, [1, 0, 0], true);
  // shelves on the north wall with jars and bundles
  for (const y of [1.25, 1.75]) {
    block(local.get('oak'), frame([-1.4, y, -d / 2 + 0.17]), 1.5, 0.04, 0.3, { r: 0.004, seg: [0.5, 0.04, 0.3], seed: rnd(), noise: 0.0015 });
    for (let i = 0; i < 4; i++) {
      const jx = -2.0 + i * 0.36 + rnd.sym(0.05);
      const js = rnd.range(0.7, 1.35), jt = rnd.range(0.8, 1.4);
      if (rnd() < 0.6) lathe(local.get('clayware'), frame([jx, y + 0.02, -d / 2 + 0.17]), [[0, 0], [0.05 * js, 0], [0.065 * js, 0.06 * jt], [0.06 * js * rnd.range(0.85, 1.1), 0.12 * jt], [0.04 * js, 0.15 * jt], [0.045 * js, 0.17 * jt], [0.0, 0.17 * jt]], 16, { seed: rnd(), wobble: 0.02 + rnd() * 0.03 });
      else block(local.get('linen'), frame([jx, y + 0.06, -d / 2 + 0.17]), 0.14, 0.1, 0.14, { r: 0.04, rs: 1, seg: [0.05, 0.05, 0.05], seed: rnd(), noise: 0.004 });
    }
    for (const sx of [-2.05, -0.75]) block(local.get('iron'), frame([sx, y - 0.08, -d / 2 + 0.12]), 0.03, 0.16, 0.2, { r: 0.004, seg: [0.03, 0.16, 0.2], seed: rnd() });
  }
  kit.merge(local, F);
  return { lights: [], anchors: { window: win, door: dr, settle: xf(settle, 0, 0.46, 0), seat: xf(F, seatP[0], 0.47, seatP[2]), armSupport: xf(F, ...xf(armF, 0, 0.78, 0)), w, d, h, T } };
}

/**
 * Lime plaster coat on an inward wall face (holes for the openings, bare patches where it has
 * fallen). The patches have ragged, smooth outlines (the grid vertices on a patch edge are moved
 * onto the contour of the "loss" field) and a broken edge with the coat's thickness.
 */
function plasterCoat(kit, F, L, H, ops, rnd, o = {}) {
  const acc = kit.get(o.mat || 'plaster');
  const step = 0.06;
  const nx = Math.ceil(L / step), ny = Math.ceil(H / step);
  const seed = rnd();
  const so = seed * 100;
  // > 0: the plaster has fallen (low down along the floor, and in a few ragged patches)
  const loss = (x, y) => Math.sin(x * 1.3 + seed * 20) * Math.sin(y * 1.7 + seed * 9) + 0.6 * Math.sin(x * 3.1 - y * 2.3)
    + 0.45 * fbm3(x * 2.2 + so, y * 2.2, 0.5, 3) - 1.42 + Math.max(0, 0.12 - y) * 12;
  const inOp = (x, y) => ops.some((op) => x > op.x - 0.02 && x < op.x + op.w + 0.02 && y > op.y - 0.02 && y < op.y + op.h + 0.02);
  const keep = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const cx = Math.min(L, (i + 0.5) * step), cy = Math.min(H, (j + 0.5) * step);
    keep[j * nx + i] = inOp(cx, cy) ? 0 : loss(cx, cy) > 0 ? 0 : 1;
  }
  const kept = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && keep[j * nx + i] === 1;
  const lossCell = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && keep[j * nx + i] === 0 && !inOp(Math.min(L, (i + 0.5) * step), Math.min(H, (j + 0.5) * step));
  const thick = 0.035;
  const ids = new Int32Array((nx + 1) * (ny + 1)).fill(-1);
  const pos = new Float32Array((nx + 1) * (ny + 1) * 2);
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    let x = Math.min(L, i * step), y = Math.min(H, j * step);
    // on a loss edge: move onto the contour (one Newton step along the gradient, clamped)
    const nK = kept(i - 1, j - 1) + kept(i, j - 1) + kept(i - 1, j) + kept(i, j);
    const nL = lossCell(i - 1, j - 1) + lossCell(i, j - 1) + lossCell(i - 1, j) + lossCell(i, j);
    if (nK && nL && x > 0 && x < L && y > 0 && y < H) {
      const f = loss(x, y), e = 0.01;
      const gx = (loss(x + e, y) - loss(x - e, y)) / (2 * e), gy = (loss(x, y + e) - loss(x, y - e)) / (2 * e);
      const g2 = gx * gx + gy * gy;
      if (g2 > 1e-6) {
        let dx = -f * gx / g2, dy = -f * gy / g2;
        const dl = Math.hypot(dx, dy), m = step * 0.49;
        if (dl > m) { dx *= m / dl; dy *= m / dl; }
        x += dx; y += dy;
      }
    }
    pos[(j * (nx + 1) + i) * 2] = x; pos[(j * (nx + 1) + i) * 2 + 1] = y;
    const z = thick + 0.004 * Math.sin(x * 5.1 + y * 3.3 + seed) + 0.003 * Math.sin(x * 11 - y * 7);
    const p = xf(F, x, y, z);
    ids[j * (nx + 1) + i] = acc.v(p[0], p[1], p[2], x, y, seed, 1, 0, F[3], F[4], F[5]);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!kept(i, j)) continue;
    acc.q(ids[j * (nx + 1) + i], ids[j * (nx + 1) + i + 1], ids[(j + 1) * (nx + 1) + i + 1], ids[(j + 1) * (nx + 1) + i]);
  }
  // the broken edge: the coat's thickness down to the wall along every kept/lost boundary
  // the broken edge: feathered - it slopes from the coat's face down to the wall over 1.5-2.5 cm
  // into the loss (dx, dy: toward the lost side), in plaster colour, one face toward the room
  const edge = (a, b, dx, dy) => {
    const ax = pos[a * 2], ay = pos[a * 2 + 1], bx = pos[b * 2], by = pos[b * 2 + 1];
    const v = (x, y, z, ao) => { const p = xf(F, x, y, z); return acc.v(p[0], p[1], p[2], x, y + z, seed, ao, 0, F[3], F[4], F[5]); };
    const f = 0.015 + 0.01 * Math.abs(Math.sin(ax * 37 + ay * 23));
    const a0 = v(ax, ay, thick, 0.95), b0 = v(bx, by, thick, 0.95), a1 = v(ax + dx * f, ay + dy * f, 0.004, 0.85), b1 = v(bx + dx * f, by + dy * f, 0.004, 0.85);
    // (wound to face out of the wall and toward the loss)
    const crossZ = (bx - ax) * dy - (by - ay) * dx;
    if (crossZ > 0) acc.q(a0, a1, b1, b0); else acc.q(a0, b0, b1, a1);
  };
  const vid = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!kept(i, j)) continue;
    if (lossCell(i - 1, j)) edge(vid(i, j), vid(i, j + 1), -1, 0);
    if (lossCell(i + 1, j)) edge(vid(i + 1, j), vid(i + 1, j + 1), 1, 0);
    if (lossCell(i, j - 1)) edge(vid(i, j), vid(i + 1, j), 0, -1);
    if (lossCell(i, j + 1)) edge(vid(i, j + 1), vid(i + 1, j + 1), 0, 1);
  }
}
void sagLine;
