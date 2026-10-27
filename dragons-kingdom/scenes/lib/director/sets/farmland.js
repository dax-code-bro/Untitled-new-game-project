// Shot director - FARMED LAND helpers (pure: no THREE, testable in Node; used by prologue-vistas.js,
// reusable by any set that shows worked country from 150 m - 2 km).
//
// Seen from a distance a worked landscape reads by its PATCHWORK: irregular fields of different use
// (grazed pasture, hay meadow, rough grazing, ploughed strips), hedges along their boundaries with gaps
// and gateways, a tree in the hedge now and then. One texture over a smooth slope reads as CG.
//
//   const F = fieldsVoronoi({ cell: 64, rot: 0.22, stretch: 1.7, seed: 3 });  // (x, z) -> { id, edge }
//   const LU = landUse(F, [0.5, 0.7, 0.9]);                                    // (x, z) -> { k, f }
//   FIELD_USE[k]                                                               // albedo multiplier
//   const h = hedgePlacements({ x: [x0, x1], z: [z0, z1], F, H, noise, seed, where }); // instances
//
// fieldsVoronoi: an anisotropic jittered-grid Voronoi (fields are longer than wide: `stretch`; the
// grid turned by `rot`), `id` 0..1 per field (stable), `edge` ~ metres to the nearest boundary.

/** integer hash -> [0, 1) */
export function hash01(i, j, k) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function fieldsVoronoi({ cell = 90, rot = 0.3, stretch = 1.6, seed = 1 } = {}) {
  const c = Math.cos(rot), sn = Math.sin(rot), ks = Math.sqrt(stretch);
  return (x, z) => {
    const u = (x * c - z * sn) / cell, v = (x * sn + z * c) / cell;
    const iu = Math.floor(u), iv = Math.floor(v);
    let d1 = 1e9, d2 = 1e9, id = 0;
    for (let a = -2; a <= 2; a++) for (let b = -1; b <= 1; b++) {
      const pu = iu + a + 0.1 + 0.8 * hash01(iu + a, iv + b, seed), pv = iv + b + 0.1 + 0.8 * hash01(iu + a, iv + b, seed + 7);
      const d = Math.hypot((u - pu) / ks, (v - pv) * ks);
      if (d < d1) { d2 = d1; d1 = d; id = hash01(iu + a, iv + b, seed + 13); } else if (d < d2) d2 = d;
    }
    return { id, edge: 0.5 * (d2 - d1) * cell / ks };
  };
}

/** field colours (x the grass layer of the terrain): grazed pasture, hay meadow (paler, yellower),
 *  rough grazing (darker, tussocky), ploughed (the soil layer carries it), moor (heather / bracken) */
export const FIELD_USE = { pasture: [0.92, 1.02, 0.86], hay: [1.3, 1.16, 0.8], rough: [0.74, 0.8, 0.6], plough: [1, 1, 1], moor: [1.02, 0.84, 0.62] };

/** field use by the field's id: mix = [pasture below, hay below, rough below] (the rest ploughed) */
export function landUse(F, mix) {
  return (x, z) => {
    const f = F(x, z);
    const k = f.id < mix[0] ? 'pasture' : f.id < mix[1] ? 'hay' : f.id < mix[2] ? 'rough' : 'plough';
    return { k, f };
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Hedges on the field boundaries: overlapping bushes of mixed size every ~`step` m (a continuous lumpy
 * band; same-size bushes at a wider step read as a string of beads), gaps and gateways where
 * noise(x, z) < -0.45, a hedgerow tree with probability treeP.
 * `align: true` lays each bush as a loaf along its boundary (yaw `r` from the edge field's gradient, long
 * axis 3-6 m, 1.7-2.6 m thick, 1.5-2.6 m tall): from 400 m on, round bushes of mixed size each shade as a lit dome and the
 * hedges read as rows of pebbles (P-11); loaves overlap into one band with a lumpy top. Same random
 * sequence, so the places and the trees do not move.
 * o: { x: [x0, x1], z: [z0, z1], F, H(x, z), noise(x, z) -> -1..1, where(x, z) -> bool, seed, step, width, treeP, align }
 * Returns { bushes: [[{ p, s, c, r? }...], [...]] (two geometry variants), trees: [[x, y, z]...], count }.
 */
export function hedgePlacements(o) {
  const pts = [[], []], trees = [];
  const rr = mulberry32(o.seed || 5);
  const st = o.step || 1.25, wd = o.width ?? 0.75;
  for (let z = o.z[0]; z < o.z[1]; z += st) for (let x = o.x[0]; x < o.x[1]; x += st) {
    const jx = x + (rr() - 0.5) * st, jz = z + (rr() - 0.5) * st;
    if (o.where && !o.where(jx, jz)) continue;
    const f = o.F(jx, jz);
    if (f.edge > wd) continue;
    if (o.noise && o.noise(jx, jz) < -0.45) continue;
    const y = o.H(jx, jz);
    const s = 1.9 + 2.4 * rr() * rr() + 0.6 * rr();
    const k = rr() < 0.5 ? 0 : 1, a = rr(), b = rr(), c = [0.7 + 0.4 * rr(), 0.8 + 0.25 * rr(), 0.7 + 0.35 * rr()];
    if (o.align) {
      // the boundary runs across the gradient of the distance to it
      const d = 0.5, gx = o.F(jx + d, jz).edge - o.F(jx - d, jz).edge, gz = o.F(jx, jz + d).edge - o.F(jx, jz - d).edge;
      const r = Math.hypot(gx, gz) > 1e-3 ? Math.atan2(gx, gz) : a * 6.283;   // local x along (-gz, gx)
      pts[k].push({ p: [jx, y - 0.35, jz], s: [1.2 * s + 0.5, 2.0 + 1.4 * a, 1.7 + 0.9 * b], c, r });
    } else pts[k].push({ p: [jx, y - 0.4, jz], s: [s, s * (0.55 + 0.45 * a), s * (0.8 + 0.4 * b)], c });
    if (rr() < (o.treeP ?? 0.03)) trees.push([jx, y, jz]);
  }
  return { bushes: pts, trees, count: pts[0].length + pts[1].length };
}
