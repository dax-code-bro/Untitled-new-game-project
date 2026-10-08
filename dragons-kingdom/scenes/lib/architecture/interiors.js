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

/** A stack of folded linen cloths (each a soft slab). */
export function foldedCloths(kit, F, rnd, n = 3, o = {}) {
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = 0.03 + rnd() * 0.02;
    const w = (o.w ?? 0.36) + rnd.sym(0.03), d = (o.d ?? 0.26) + rnd.sym(0.02);
    block(kit.get('linen'), sub(F, [rnd.sym(0.015), y + t / 2, rnd.sym(0.015)], [Math.cos(rnd.sym(0.08)), 0, Math.sin(rnd.sym(0.08))], [0, 1, 0]), w, t, d, {
      r: t * 0.48, rs: 2, seg: [0.06, t / 2, 0.06], seed: rnd(), noise: 0.003, nf: 18,
      warp: (lx, ly, lz) => [lx, ly - 0.004 * (lx * lx + lz * lz) / 0.05 + 0.002 * Math.sin(lx * 40 + lz * 23), lz],
    });
    y += t;
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

/** The prepared nest: a low ring curb of dressed stones, a straw bed, linen laid over it. */
export function nest(kit, F, rnd, o = {}) {
  const R = o.r ?? 1.25, ch = o.h ?? 0.34;
  // the kerb: straight dressed stones of different lengths set round a polygon (a built kerb, not a
  // turned ring), each with a crisp chamfer on its top arrises, a little out of line
  {
    const startA = rnd() * Math.PI * 2, end = startA + Math.PI * 2;
    let a = startA;
    while (a < end - 0.05) {
      let da = rnd.range(0.38, 0.72);
      if (end - (a + da) < 0.3) da = end - a;
      const a0 = a, a1 = a + da;
      const p0 = [Math.cos(a0) * R, Math.sin(a0) * R], p1 = [Math.cos(a1) * R, Math.sin(a1) * R];
      const chord = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), L = chord - 0.008;
      const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2, ux = (p1[0] - p0[0]) / chord, uz = (p1[1] - p0[1]) / chord;
      const hh = ch * rnd.range(0.94, 1.04);
      const tw = 0.24 + rnd.sym(0.02);
      block(kit.get('stonePale'), sub(F, [mx + rnd.sym(0.01), hh / 2, mz + rnd.sym(0.01)], [ux, 0, uz], [0, 1, 0]), L, hh, tw, {
        r: 0.006, rs: 1, seg: [Math.max(0.1, L / 5), 0.1, 0.08], seed: rnd(), noise: 0.002, nf: 6, chip: 0.012, pillow: 0.0015,
        // the chamfer: the top outer and inner arrises cut back at 45 degrees
        warp: (lx, ly, lz) => { const c = 0.035; const e = Math.abs(lz) - (tw / 2 - c); return [lx, ly - (ly > hh / 2 - c && e > 0 ? Math.min(e, ly - (hh / 2 - c)) : 0), lz]; },
      });
      a = a1;
    }
  }
  // the straw bed: a domed mound filling the curb (its surface strewn with loose straws)
  // (the mound spills over the kerb a little: lumpy, with tufts)
  // (the same dome the linen was cloth-simulated over: anything higher pokes through the cloth)
  const domeAt = (a, r) => ch * 0.85 + 0.12 * (1 - (r / R) ** 2) + 0.025 * Math.sin(a * 5 + r * 9) * (r / R);
  grid(kit.get('strawBed'), 72, 30, (u, v) => {
    const a = u * Math.PI * 2, r = v * (R + 0.06);
    const y = r < R - 0.1 ? domeAt(a, r) : Math.max(domeAt(a, R - 0.1), ch + 0.03) - (r - (R - 0.1)) * 0.3;
    const p = xf(F, Math.cos(a) * r, y, Math.sin(a) * r);
    return { p, uv: [a * r, r], seed: 0.31, ao: 0.55 + 0.45 * (1 - (r / R) ** 2) };
  }, [1, 0, 0], false);
  // straw: thousands of stems in clumps (each clump laid one way, its stems bent and crossing),
  // heaped deeper toward the kerb, spilling over it onto the flags; none on the linen
  const acc = kit.get('straw');
  let cloth = null;
  if (o.cloth) {
    const P = o.cloth.positions; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let k = 0; k < P.length; k += 3) { x0 = Math.min(x0, P[k]); x1 = Math.max(x1, P[k]); z0 = Math.min(z0, P[k + 2]); z1 = Math.max(z1, P[k + 2]); }
    cloth = [x0 + 0.06, x1 - 0.06, z0 + 0.06, z1 - 0.06];
  }
  const onCloth = (x, z) => cloth && x > cloth[0] && x < cloth[1] && z > cloth[2] && z < cloth[3];
  const yOn = (x, z, out) => { const rr = Math.hypot(x, z), aa = Math.atan2(z, x); return out ? 0.006 : rr > R - 0.12 ? ch + 0.03 : domeAt(aa, Math.min(rr, R - 0.1)) + 0.004; };
  const nClumps = o.clumps ?? 2000;
  for (let c = 0; c < nClumps; c++) {
    const out = rnd() < 0.22;
    const a = rnd() * Math.PI * 2, r = out ? R + 0.1 + Math.pow(rnd(), 1.8) * 0.65 : Math.sqrt(rnd()) * (R + 0.02);
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    if (onCloth(cx, cz)) continue;
    const dir0 = rnd() * Math.PI * 2, ns = out ? 3 + Math.floor(rnd() * 5) : 5 + Math.floor(rnd() * 9);
    for (let i = 0; i < ns; i++) {
      const dir = dir0 + rnd.sym(0.8), l = rnd.range(0.06, 0.22);
      const x0 = cx + rnd.sym(0.05), z0 = cz + rnd.sym(0.05), x1 = x0 + Math.cos(dir) * l, z1 = z0 + Math.sin(dir) * l;
      if (onCloth(x1, z1)) continue;
      const bw = rnd.sym(0.3) * l, xm = (x0 + x1) / 2 - Math.sin(dir) * bw * 0.3, zm = (z0 + z1) / 2 + Math.cos(dir) * bw * 0.3;
      const lift = Math.pow(rnd(), 2) * 0.012;
      const p0 = xf(F, x0, yOn(x0, z0, out) + lift * 0.3, z0), pm = xf(F, xm, yOn(xm, zm, out) + 0.004 + lift + rnd() * 0.01, zm), p1 = xf(F, x1, yOn(x1, z1, out) + lift * 0.5 + rnd() * 0.012, z1);
      tube(acc, [p0, pm, p1], rnd.range(0.0016, 0.0028), { sides: 3, seed: rnd() });
    }
  }
  // linen laid over the bed: the cloth-simulated drape (offline/nest_cloth.py) when baked
  if (o.cloth) {
    const { nx, ny, positions: P } = o.cloth;
    grid(kit.get('linen'), nx, ny, (u, v) => {
      const i = Math.round(u * nx), j = Math.round(v * ny), k = (j * (nx + 1) + i) * 3;
      const p = xf(F, P[k], P[k + 1] + 0.004, P[k + 2]);
      return { p, uv: [u * 2.0, v * 1.6], seed: 0.62, ao: 0.85 };
    }, [1, 0, 0], false);
    return { r: R, top: ch * 0.85 + 0.12 };
  }
  // (procedural fallback) linen in soft folds, a corner hanging over the curb
  grid(kit.get('linen'), 40, 30, (u, v) => {
    const x = (u - 0.5) * 2.0, z = (v - 0.5) * 1.6;
    const r = Math.hypot(x, z);
    const inside = R - 0.05;
    let y = r < inside ? ch * 0.85 + 0.12 * (1 - (r / R) ** 2) + 0.03 : ch + 0.03 - (r - inside) * 0.9;
    y += 0.018 * Math.sin(x * 7 + z * 3) * Math.cos(z * 5) + 0.012 * Math.sin(x * 13 - z * 9);
    const p = xf(F, x * 0.9 + 0.25, Math.max(0.01, y), z * 0.9 - 0.1);
    return { p, uv: [x, z], seed: 0.62, ao: 0.8 };
  }, [1, 0, 0], true);
  return { r: R, top: ch * 0.85 + 0.12 };
}

/**
 * The birthing chamber. o: w (7.2), d (6.2), h (6.6), window: { wall: 'east', x, y, w, h },
 * door: { wall: 'south', x, w, h, open }, lod, seed, lampLight (intensity, cd), cloth (the baked
 * nest linen: await loadArchCache('nest_cloth')).
 */
export function birthingChamber(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 301);
  const w = o.w ?? 7.2, d = o.d ?? 6.2, h = o.h ?? 6.6, T = 0.9;
  const lod = o.lod || 'mid';
  const local = new Kit(0);
  const win = { wall: 'east', x: 2.2, y: 3.6, w: 1.1, h: 1.7, ...(o.window || {}) };
  const dr = { wall: 'south', x: 4.6, w: 1.4, h: 2.7, open: 0.35, ...(o.door || {}) };
  const hw = h + 0.4;                     // the walls run up past the ceiling boards (no light leaks)
  const C = courses(rnd, hw, { min: 0.2, max: 0.34, plinth: 0.36 });
  for (const wl of roomWalls(w, d)) {
    const Fw = sub(frame([0, 0, 0]), wl.o, wl.X, [0, 1, 0]);
    const ops = [];
    if (wl.key === win.wall) ops.push({ x: win.x, y: win.y, w: win.w, h: win.h, head: 'arch', reveal: T, archDepth: T, sill: false });
    if (wl.key === dr.wall) ops.push({ x: dr.x, y: 0, w: dr.w, h: dr.h, head: 'arch', reveal: T * 0.6 });
    // a niche for a lamp
    masonryFace(local, Fw, wl.L, hw, { courses: C, style: 'washed', mat: 'stoneWashed', dressedMat: 'stonePale', mortar: 'mortarWashed', T, lod, seed: rnd() * 999, openings: ops, back: true, backMat: 'mortarPale', quoinStart: () => 0.04, quoinEnd: () => 0.04 });
    if (wl.key === dr.wall) door(local, sub(Fw, [dr.x, 0, 0]), { w: dr.w, h: dr.h, arch: true, inset: T * 0.6, open: dr.open, hingeLeft: false, room: true, wallT: T, seed: rnd() * 999 });
    // a splayed sill for the high window: the bottom of the reveal slopes down into the room
    if (wl.key === win.wall) block(local.get('stonePale'), sub(Fw, [win.x + win.w / 2, win.y - 0.12, -T / 2 + 0.02], [1, 0, 0], [0, Math.cos(0.45), Math.sin(0.45)]), win.w + 0.06, 0.12, T * 1.05, { r: 0.012, seg: [0.2, 0.06, 0.2], seed: rnd(), noise: 0.003, chip: 0.01 });
  }
  flagFloor(local, frame([0, 0, 0]), w, d, rnd, { path: [w / 2 - dr.x - dr.w / 2, d / 2 - 0.3, -0.6, 0.3] });
  beamCeiling(local, frame([0, 0, 0]), w, d, h, rnd);
  // the nest (centre slightly toward the west wall), the bench along the north wall
  const nestC = o.nest || [-0.6, 0, 0.3];
  const nst = nest(local, frame(nestC), rnd, { cloth: o.cloth });
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
  stool(local, frame([nestC[0] + 1.65, 0, nestC[2] + 0.55]), rnd, { h: 0.4 });
  foldedCloths(local, frame([nestC[0] + 1.5, 0, nestC[2] - 0.6]), rnd, 3, { w: 0.4, d: 0.3 });
  bowl(local, frame([nestC[0] + 1.35, 0, nestC[2] - 1.05]), rnd, { r: 0.19, h: 0.09 });
  // lamps in iron brackets on the walls
  for (const [wx, wz, ry] of [[-w / 2 + 0.02, -0.8, Math.PI / 2], [w / 2 - 0.02, 1.4, -Math.PI / 2], [1.8, -d / 2 + 0.02, 0]]) {
    const Fb = frame([wx, 1.75, wz], [Math.cos(ry), 0, -Math.sin(ry)], [0, 1, 0]);
    // the bracket: a bar out of the wall and a little iron shelf
    tube(local.get('iron'), [xf(Fb, 0, 0, 0), xf(Fb, 0, 0, 0.42)], 0.012, { sides: 6 });
    tube(local.get('iron'), [xf(Fb, 0, -0.2, 0), xf(Fb, 0, -0.01, 0.28)], 0.01, { sides: 6 });
    block(local.get('iron'), sub(Fb, [0, 0.004, 0.36]), 0.16, 0.008, 0.14, { r: 0.002, seg: [0.16, 0.008, 0.14], seed: rnd() });
    // the soot plume the flame has laid on the wall above it over years
    grid(local.get('sootStain'), 10, 16, (u, v) => {
      const x = (u - 0.5) * (0.25 + 0.55 * v), y = 0.05 + v * 1.4;
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
    if (wl.key === win.wall) ops.push({ x: win.x, y: win.y, w: win.w, h: win.h, head: 'lintel', reveal: T, sill: false });
    if (wl.key === dr.wall) ops.push({ x: dr.x, y: 0, w: dr.w, h: dr.h, head: 'lintel', reveal: T * 0.5 });
    // stone walls with a lime plaster coat over most of it (bare stone where it has fallen)
    // rubble walling under the lime plaster (it shows where the coat has fallen)
    masonryFace(local, Fw, wl.L, hw, { courses: C, style: 'washed', mat: 'stoneWashed', dressedMat: 'stoneWashed', mortar: 'mortarWashed', T, lod: 'mid', seed: rnd() * 999, openings: ops, back: true, backMat: 'mortarPale', quoinStart: () => 0.04, quoinEnd: () => 0.04 });
    plasterCoat(local, Fw, wl.L, h, ops, rnd, { inset: 0.03, mat: 'plasterInt' });
    if (wl.key === dr.wall) door(local, sub(Fw, [dr.x, 0, 0]), { w: dr.w, h: dr.h, inset: T * 0.5, open: dr.open, hingeLeft: true, room: true, wallT: T, seed: rnd() * 999 });
    if (wl.key === win.wall) {
      // the deep reveal is plastered; inside shutters folded back against the splay
      const Fo = sub(Fw, [win.x, win.y, 0]);
      block(local.get('oak'), sub(Fo, [win.w / 2, -0.03, -T / 2]), win.w + 0.1, 0.06, T + 0.08, { r: 0.006, seg: [0.4, 0.06, 0.3], seed: rnd(), noise: 0.0015 });
      for (const sx of [0, 1]) {
        // folded back flat against the inside wall face either side of the opening
        const Fl = sub(Fo, [sx ? win.w + 0.03 : -0.03, 0.02, 0.07], sx ? [1, 0, 0.04] : [-1, 0, 0.04], [0, 1, 0]);
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
  // the patient's stool by the window light, facing the room (+x); at her LEFT (-z) a low trestle
  // with a folded cloth pad where her injured left arm rests (2B)
  const seatP = [-w / 2 + 1.35, 0, 0.4];
  stool(local, frame(seatP), rnd);
  const armF = frame([seatP[0] + 0.05, 0, seatP[2] - 0.52], [1, 0, 0], [0, 1, 0]);
  bench(local, armF, rnd, { L: 0.62, d: 0.34, h: 0.62, t: 0.05 });
  foldedCloths(local, sub(armF, [0.02, 0.62, 0.0]), rnd, 3, { w: 0.48, d: 0.28 });
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
  return { lights: [], anchors: { window: win, door: dr, settle: xf(settle, 0, 0.46, 0), seat: xf(F, seatP[0], 0.42, seatP[2]), armSupport: xf(armF, 0, 0.62 + 0.1, 0), w, d, h, T } };
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
    + 0.45 * fbm3(x * 2.2 + so, y * 2.2, 0.5, 3) - 1.2 + Math.max(0, 0.16 - y) * 12;
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
  const edge = (a, b) => {
    const ax = pos[a * 2], ay = pos[a * 2 + 1], bx = pos[b * 2], by = pos[b * 2 + 1];
    const v = (x, y, z, ao) => { const p = xf(F, x, y, z); return acc.v(p[0], p[1], p[2], x, y + z, seed, ao, 0, F[3], F[4], F[5]); };
    // the broken edge in plaster colour, a little shaded at its foot (no black outline)
    const a0 = v(ax, ay, thick, 0.95), b0 = v(bx, by, thick, 0.95), a1 = v(ax, ay, 0.004, 0.8), b1 = v(bx, by, 0.004, 0.8);
    acc.q(a0, b0, b1, a1); acc.q(a0, a1, b1, b0);               // both windings: the side is seen from either way
  };
  const vid = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!kept(i, j)) continue;
    if (lossCell(i - 1, j)) edge(vid(i, j), vid(i, j + 1));
    if (lossCell(i + 1, j)) edge(vid(i + 1, j), vid(i + 1, j + 1));
    if (lossCell(i, j - 1)) edge(vid(i, j), vid(i + 1, j));
    if (lossCell(i, j + 1)) edge(vid(i, j + 1), vid(i + 1, j + 1));
  }
}
void sagLine;
