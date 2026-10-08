// Architecture kit - weathering laid over the built surfaces: stains that run down a wall from
// where the water leaves it (the ends of a sill, a lintel, an iron ring, a cramp, a spout, the
// underside of a jetty) - drawn as transparent decals (materials.js stainMaterial) a few mm in
// front of the face, so the proudest stones break the streaks the way they do on a real wall.
//
//   stain(kit, F, x, y, w, len, 'dirt' | 'rust' | 'lime' | 'algae', { strength, z, seed })
//   F: a face frame (x along, y up, z out of the wall); the streaks start at (x, y) and run down.
import { xf } from './core.js';

const KIND = { dirt: 0, rust: 1, lime: 2, algae: 3 };

/** One stain decal: w wide (centred on x), running len down from y. */
export function stain(kit, F, x, y, w, len, kind = 'dirt', o = {}) {
  const acc = kit.get('stain');
  const k = KIND[kind] ?? 0;
  // the kind in the seed's quarter (snapped in the shader: keep clear of the quarter's edges)
  const seed = (k + 0.08 + 0.84 * (o.seed ?? 0.5)) / 4;
  const z = o.z ?? 0.012;
  const st = o.strength ?? 0.7;
  const nu = 1, nv = 1;
  const base = acc.vcount;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const px = x - w / 2 + w * i / nu, py = y - len * j / nv;
    const p = xf(F, px, py, z);
    acc.v(p[0], p[1], p[2], w * i / nu, j / nv, seed, st, w, F[3], F[4], F[5]);
  }
  acc.q(base, base + 2, base + 3, base + 1);
}

/** A band of grime under an overhang (a jetty, a hood, an arch): several overlapping decals. */
export function grimeBand(kit, F, x0, x1, y, len, rnd, o = {}) {
  let x = x0;
  while (x < x1 - 0.05) {
    const w = Math.min(x1 - x, rnd.range(0.6, 1.4));
    stain(kit, F, x + w / 2, y, w * 1.15, len * rnd.range(0.7, 1.2), o.kind || 'dirt', { strength: (o.strength ?? 0.5) * rnd.range(0.7, 1.1), seed: rnd(), z: o.z });
    x += w * 0.85;
  }
}
