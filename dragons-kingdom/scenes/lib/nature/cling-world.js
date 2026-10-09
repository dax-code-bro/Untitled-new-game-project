// The land around Cling (a small kingdom inland in Scrapper): the town on a level shelf, a stream
// valley to the south, farmland rolling up to wooded hills in the north (the backdrop of the square
// in shot list 3A/3B: the camera on the king's steps looks north). 1400s-style field system:
// hedged closes near the town, open furlongs of long strips (ridge and furrow) further out, hay
// meadows along the stream, woods and rough grazing on the hilltops, the broad road leaving the
// east gate and climbing over the hills, lanes.
//
// Frame: the CLING layout (scenes/lib/architecture/cling.js): the square at the origin, y = 0 on the
// square, north = -z, the east gate at x 20 -> the broad road runs east.
import { makeNoise, mulberry, smoothstep, clamp, lerp, hash2 } from './noise.js';

export const CLING_LAND = { x: [-2600, 2600], z: [-3400, 1400], cell: 4, town: { r: 110 } };

export function createClingWorld() {
  const N = makeNoise(901), N2 = makeNoise(902), N3 = makeNoise(903);
  /** the broad road: from the east gate, east then north-east over the hills (control points) */
  const road = [[22, 4.75], [70, 6], [160, -6], [300, -40], [470, -120], [640, -260], [790, -440], [930, -700], [1100, -980], [1300, -1260], [1520, -1560], [1800, -1880], [2200, -2300], [2700, -2800]];
  const lane = [[-22, 16.5], [-80, 30], [-180, 20], [-320, -40], [-470, -160], [-600, -330], [-700, -560], [-760, -820], [-900, -1100], [-1100, -1400], [-1400, -1800]];
  function distToPolyline(pl, x, z) {
    let best = 1e9, along = 0, acc = 0, bestAlong = 0;
    for (let i = 0; i < pl.length - 1; i++) {
      const [ax, az] = pl[i], [bx, bz] = pl[i + 1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, L = Math.sqrt(L2);
      const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < best) { best = d; bestAlong = acc + t * L; }
      acc += L;
    }
    void along;
    return [best, bestAlong];
  }
  // the road meanders a little between its control points
  const roadD = (x, z) => distToPolyline(road, x + 14 * N.n2(x / 160, z / 160), z + 14 * N.n2(x / 160 + 5, z / 160))[0];
  const laneD = (x, z) => distToPolyline(lane, x + 10 * N.n2(x / 120, z / 120), z + 10 * N.n2(x / 120 + 5, z / 120))[0];

  function base(x, z) {
    const r = Math.hypot(x, z);
    // the stream valley south of the town (flowing east), the hills rising north
    const valleyZ = 260 + 60 * Math.sin(x / 420);
    const valley = -14 * Math.exp(-(((z - valleyZ) / 110) ** 2));
    const north = 95 * smoothstep(120, 2600, -z) * (0.7 + 0.3 * N.fbm2(x / 900, z / 900, 3));
    const roll = 26 * N2.fbm2(x / 520, z / 520, 4) * smoothstep(80, 500, r) + 9 * N3.fbm2(x / 160, z / 160, 3) * smoothstep(100, 400, r);
    const ridge = 45 * N3.ridged2(x / 900 + 2, z / 900, 4) * smoothstep(500, 2200, -z);
    let h = north + roll + ridge + valley + 0.004 * x;
    // the town shelf: level ground under the town and its gardens
    h = lerp(0, h, smoothstep(90, 230, r));
    return h;
  }
  let land = null;
  const installLand = (s) => { land = s; };
  const height = (x, z) => {
    let h = land ? land.sample(x, z) : base(x, z);
    // the road and the lane are cut a little into the slopes (hollow ways) and graded
    const rd = Math.min(roadD(x, z), laneD(x, z));
    h -= 0.6 * Math.exp(-((rd / 4) ** 2));
    return h + 0.12 * N3.n2(x / 3, z / 3);
  };

  // ------------------------------------------------------------- field system ---
  // sites: small closes near the town, big furlongs further out, each with a use
  const sites = [];
  {
    const r = mulberry(55);
    const add = (x, z, kind) => sites.push({ x, z, kind, id: sites.length, h: r(), dir: r() * Math.PI, crop: 0 });
    for (let i = 0; i < 2600; i++) {
      const x = (r() - 0.5) * 5400, z = -3500 + r() * 5000;
      const d = Math.hypot(x, z);
      if (d < 120) continue;
      const dens = d < 450 ? 1 : d < 900 ? 0.35 : 0.12;      // closes small near the town, furlongs bigger out
      if (r() > dens) continue;
      add(x, z, d < 420 ? 'close' : 'furlong');
    }
    for (const s of sites) {
      const u = r();
      if (s.kind === 'close') s.crop = u < 0.5 ? 'pasture' : u < 0.68 ? 'meadow' : u < 0.84 ? 'plough' : 'wheat';
      else s.crop = u < 0.32 ? 'wheat' : u < 0.48 ? 'barley' : u < 0.62 ? 'fallow' : u < 0.78 ? 'plough' : u < 0.9 ? 'pasture' : 'meadow';
      // strips run across the slope (ridge and furrow follow the contour of a furlong)
      const e = 6;
      const gx = base(s.x + e, s.z) - base(s.x - e, s.z), gz = base(s.x, s.z + e) - base(s.x, s.z - e);
      if (Math.hypot(gx, gz) > 0.05) s.dir = Math.atan2(gz, gx) + Math.PI / 2 + (r() - 0.5) * 0.4;
    }
  }
  const G = 160, grid = new Map();
  for (const s of sites) { const k = `${Math.floor(s.x / G)},${Math.floor(s.z / G)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s); }
  /** nearest and second nearest field site (Voronoi), with the distance to the border between them */
  function fieldAt(x, z) {
    const gi = Math.floor(x / G), gj = Math.floor(z / G);
    let a = null, b = null, da = 1e18, db = 1e18;
    for (let j = gj - 2; j <= gj + 2; j++) for (let i = gi - 2; i <= gi + 2; i++) {
      const L = grid.get(`${i},${j}`); if (!L) continue;
      for (const s of L) {
        // warped distance: field edges wander a little
        const d = (s.x - x) ** 2 + (s.z - z) ** 2;
        if (d < da) { db = da; b = a; da = d; a = s; } else if (d < db) { db = d; b = s; }
      }
    }
    if (!a) return null;
    // distance to the perpendicular bisector between a and b
    let edge = 1e9;
    if (b) { const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, nx = b.x - a.x, nz = b.z - a.z, l = Math.hypot(nx, nz); edge = ((mx - x) * nx + (mz - z) * nz) / l; }
    return { site: a, other: b, edge };
  }
  /** woods: hilltops and steep ground in the north, a few copses */
  function wood(x, z) {
    const w = smoothstep(0.15, 0.4, N.fbm2(x / 380 + 3, z / 380, 4) + 0.35 * smoothstep(400, 2400, -z) - 0.2);
    return w * smoothstep(250, 600, Math.hypot(x, z));
  }
  return { N, N2, N3, base, height, installLand, road, lane, roadD, laneD, sites, fieldAt, wood, distToPolyline };
}
