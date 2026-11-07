// Generates the terrain height field, water levels and the material splat map.
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { WORLD, CITY, TOWN, LAKE, AIRFIELD, FOREST, PLAINS, BAYOU, CHANNELS, coastZ, lakeRadius } from './layout.js';
import { clamp, lerp, smoothstep, distToSeg, nextFrame } from '../util.js';
import { erode } from './erosion.js';

const perlin = new ImprovedNoise();
const N = (x, z, s) => perlin.noise(x, z, s);
function fbm(x, z, oct, seed) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * N(x * f, z * f, seed + i * 7.1); f *= 2.02; a *= 0.5; }
  return s;
}
function ridged(x, z, oct, seed) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(N(x * f, z * f, seed + i * 3.3)); s += a * n * n; f *= 2.1; a *= 0.5; }
  return s;
}

export function forestMask(x, z) {
  const d = Math.hypot(x - FOREST.x, z - FOREST.z) / FOREST.r;
  const core = 1 - smoothstep(0.55, 1.05, d + fbm(x * 0.004, z * 0.004, 2, 11) * 0.35);
  const patches = smoothstep(0.12, 0.32, fbm(x * 0.0028, z * 0.0028, 3, 21)) * 0.85;
  return clamp(Math.max(core, patches), 0, 1);
}
export function plainsMask(x, z) {
  const d = Math.hypot(x - PLAINS.x, z - PLAINS.z) / PLAINS.r;
  return 1 - smoothstep(0.6, 1.1, d + fbm(x * 0.003, z * 0.003, 2, 31) * 0.3);
}
export function bayouMask(x, z) {
  const d = Math.hypot(x - BAYOU.x, z - BAYOU.z) / BAYOU.r;
  return 1 - smoothstep(0.55, 1.0, d + fbm(x * 0.005, z * 0.005, 2, 41) * 0.25);
}

// Raw terrain before regions, rivers and roads shape it. Also used for the
// distant horizon terrain outside the playable map.
export function baseHeight(x, z) {
  const dIn = coastZ(x) - z;
  if (dIn < 0) return Math.max(-45, 1.5 + dIn * 0.07 + fbm(x * 0.01, z * 0.01, 2, 5) * 1.5);
  const north = smoothstep(-400, -2300, z);
  const fm = forestMask(x, z), pm = plainsMask(x, z);
  let h = 1.5 + 24 * smoothstep(0, 700, dIn) + north * 25;
  h += fbm(x * 0.0024, z * 0.0024, 5, 1) * (12 + 40 * north + 22 * fm - 6 * pm);
  h += Math.pow(ridged(x * 0.0011, z * 0.0011, 4, 3), 2) * 260 * Math.pow(north, 1.6);
  h += fbm(x * 0.02, z * 0.02, 3, 9) * 1.2;
  const b = bayouMask(x, z);
  if (b > 0) h = lerp(h, 1.2 + fbm(x * 0.01, z * 0.01, 2, 13) * 1.6, b);
  return h;
}

export class Heightmap {
  constructor() {
    this.res = WORLD.res;
    this.n = WORLD.res + 1;
    this.half = WORLD.half;
    this.cell = WORLD.size / WORLD.res;
    this.h = new Float32Array(this.n * this.n);
    this.wl = new Float32Array(this.n * this.n).fill(-1e4);
    this.splat = new Uint8Array(this.n * this.n * 4);
    this.bridges = [];
  }

  idx(i, j) { return j * this.n + i; }
  toGrid(x) { return (x + this.half) / this.cell; }

  height(x, z) {
    const gx = clamp(this.toGrid(x), 0, this.res - 0.001), gz = clamp(this.toGrid(z), 0, this.res - 0.001);
    const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j;
    const n = this.n, h = this.h, k = j * n + i;
    return lerp(lerp(h[k], h[k + 1], fx), lerp(h[k + n], h[k + n + 1], fx), fz);
  }
  // terrain before the outer-neighbourhood streets were cut in (see shapeRoads)
  heightBase(x, z) {
    if (!this.h0) return this.height(x, z);
    const gx = clamp(this.toGrid(x), 0, this.res - 0.001), gz = clamp(this.toGrid(z), 0, this.res - 0.001);
    const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j;
    const n = this.n, h = this.h0, k = j * n + i;
    return lerp(lerp(h[k], h[k + 1], fx), lerp(h[k + n], h[k + n + 1], fx), fz);
  }
  normal(x, z, out) {
    const e = this.cell;
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    out.set(-hx, 2 * e, -hz).normalize();
    return out;
  }
  waterLevel(x, z) {
    const gx = clamp(Math.round(this.toGrid(x)), 0, this.res), gz = clamp(Math.round(this.toGrid(z)), 0, this.res);
    return Math.max(0, this.wl[gz * this.n + gx]);
  }

  async generate(progress, opts = {}) {
    const { n, half, cell, h } = this;
    // 1. Base terrain
    for (let j = 0; j < n; j++) {
      const z = -half + j * cell;
      for (let i = 0; i < n; i++) h[j * n + i] = baseHeight(-half + i * cell, z);
      if ((j & 63) === 0) { progress(0.05 + 0.35 * j / n, 'Raising the land'); await nextFrame(); }
    }
    // 1b. Hydraulic erosion: gullies, ridges and valley floors
    progress(0.4, 'Eroding hills and valleys');
    await nextFrame();
    const drops = opts.erosionDrops ?? 220000;
    for (let pass = 0; pass < 4; pass++) {
      erode(this.h, n, { drops: drops / 4, seed: 7 + pass });
      progress(0.4 + 0.04 * (pass + 1), 'Eroding hills and valleys');
      await nextFrame();
    }
    // soften grid-scale rills the drops leave (keeps the big gullies and valleys)
    for (let pass = 0; pass < 2; pass++) {
      const src = h.slice();
      for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
        const k = j * n + i;
        h[k] = src[k] * 0.4 + (src[k - 1] + src[k + 1] + src[k - n] + src[k + n]) * 0.1 + (src[k - n - 1] + src[k - n + 1] + src[k + n - 1] + src[k + n + 1]) * 0.05;
      }
    }
    // 2. Flatten the city, the town, and the lake basin
    TOWN.height = Math.round(this.height(TOWN.x0 + 144, TOWN.z0 + 108)) + 1;
    LAKE.level = Math.round(this.height(LAKE.x, LAKE.z)) - 1;
    this.flattenRect(CITY.x0 - 8, CITY.z0 - 8, CITY.x0 + CITY.nx * CITY.pitch + 8, CITY.z0 + CITY.nz * CITY.pitch + 8, CITY.height, 70);
    this.flattenRect(TOWN.x0 - 6, TOWN.z0 - 6, TOWN.x0 + TOWN.nx * TOWN.pitch + 6, TOWN.z0 + TOWN.nz * TOWN.pitch + 6, TOWN.height, 60);
    AIRFIELD.height = Math.round(this.height((AIRFIELD.x0 + AIRFIELD.x1) / 2, AIRFIELD.z)) + 1;
    this.flattenRect(AIRFIELD.x0 - 40, AIRFIELD.z - 70, AIRFIELD.x1 + 40, AIRFIELD.z + 40, AIRFIELD.height, 90);
    this.carveLake();
    progress(0.45, 'Filling Lake Arden');
    await nextFrame();
    // 3. Rivers and creeks
    for (const c of CHANNELS) this.carveChannel(c);
    progress(0.55, 'Cutting rivers and creeks');
    await nextFrame();
  }

  forEachCellIn(minX, minZ, maxX, maxZ, fn) {
    const { n, half, cell } = this;
    const i0 = clamp(Math.floor((minX + half) / cell), 0, n - 1), i1 = clamp(Math.ceil((maxX + half) / cell), 0, n - 1);
    const j0 = clamp(Math.floor((minZ + half) / cell), 0, n - 1), j1 = clamp(Math.ceil((maxZ + half) / cell), 0, n - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * n + i, -half + i * cell, -half + j * cell);
  }

  flattenRect(x0, z0, x1, z1, target, margin) {
    this.forEachCellIn(x0 - margin, z0 - margin, x1 + margin, z1 + margin, (k, x, z) => {
      const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
      const w = 1 - smoothstep(0, margin, Math.hypot(dx, dz));
      this.h[k] = lerp(this.h[k], target, w);
    });
  }

  carveLake() {
    const R = LAKE.r * 1.5, L = LAKE.level;
    this.forEachCellIn(LAKE.x - R, LAKE.z - R, LAKE.x + R, LAKE.z + R, (k, x, z) => {
      const dx = x - LAKE.x, dz = z - LAKE.z;
      const d = Math.hypot(dx, dz) / lakeRadius(Math.atan2(dz, dx));
      if (d < 1) {
        this.h[k] = L - 0.8 - 16 * smoothstep(0, 1, 1 - d) - 2 * smoothstep(0.85, 1, 1 - d);
      } else if (d < 1.45) {
        const w = smoothstep(1.0, 1.45, d);
        this.h[k] = lerp(L + 0.6, Math.max(this.h[k], L + 0.6), w);
      }
      if (d < 1.06) this.wl[k] = Math.max(this.wl[k], L);
    });
  }

  carveChannel(c) {
    const pts = c.pts;
    // Water level along the channel: never flows uphill, ends at sea or lake level.
    const wl = [];
    let run = c.fromLake ? LAKE.level : Infinity;
    const floor = c.end === 'lake' ? LAKE.level : 0;
    for (let i = 0; i < pts.length; i++) {
      const g = this.height(pts[i][0], pts[i][1]);
      run = Math.min(run, g - (c.fromLake ? 2.2 : 0.9));
      if (c.fromLake && i < 6) run = LAKE.level;
      wl.push(Math.max(run, floor));
    }
    // The last stretch eases down to the destination level
    const tail = Math.min(25, pts.length - 1);
    for (let i = pts.length - tail; i < pts.length; i++) {
      const t = (i - (pts.length - tail)) / (tail - 1);
      wl[i] = lerp(wl[i], floor, t * t);
    }
    c.wl = wl;
    const hw = c.width / 2, reach = hw + c.bank;
    for (let s = 0; s < pts.length - 1; s++) {
      const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
      this.forEachCellIn(Math.min(ax, bx) - reach, Math.min(az, bz) - reach, Math.max(ax, bx) + reach, Math.max(az, bz) + reach, (k, x, z) => {
        const r = distToSeg(x, z, ax, az, bx, bz);
        if (r.d > reach) return;
        const w = lerp(wl[s], wl[s + 1], r.t);
        if (r.d < hw) {
          const q = r.d / hw;
          this.h[k] = Math.min(this.h[k], w - 0.4 - c.depth * (1 - q * q));
        } else {
          const t = smoothstep(hw, reach, r.d);
          this.h[k] = Math.min(this.h[k], lerp(w + 0.25, Math.max(this.h[k], w + 0.25), t));
        }
        if (r.d < hw + 3) this.wl[k] = Math.max(this.wl[k], w);
      });
    }
  }

  // Road profile: smooth grades, bridges over water, then cut/fill the terrain.
  shapeRoads(graph) {
    for (const e of graph.edges) {
      // the newer outer-neighbourhood streets come last: keep the terrain as it was before
      // them, so the older generators see the same ground and place the same buildings
      if (e.lane && !this.h0) this.h0 = this.h.slice();
      const pts = e.pts;
      let ys = pts.map(([x, z]) => this.height(x, z));
      if (e.kind === 'highway') {
        const y0 = ys[0], y1 = ys[ys.length - 1];
        for (let pass = 0; pass < 10; pass++) {
          const nys = ys.slice();
          for (let i = 1; i < ys.length - 1; i++) {
            let s = 0, c = 0;
            for (let k = -3; k <= 3; k++) { const q = ys[clamp(i + k, 0, ys.length - 1)]; s += q; c++; }
            nys[i] = s / c;
          }
          nys[0] = y0; nys[ys.length - 1] = y1;
          // Bridges stay clear of the water
          for (let i = 0; i < pts.length; i++) {
            const w = this.wl[this.idx(clamp(Math.round(this.toGrid(pts[i][0])), 0, this.res), clamp(Math.round(this.toGrid(pts[i][1])), 0, this.res))];
            if (w > -1e3) nys[i] = Math.max(nys[i], w + 4.5);
            const g = this.height(pts[i][0], pts[i][1]);
            if (g < 0.5) nys[i] = Math.max(nys[i], 4.5);
          }
          ys = nys;
        }
      }
      e.ys = ys;
      // Cut/fill — but leave the gap under bridges open. Each terrain cell
      // follows its NEAREST road segment only (blending every nearby segment
      // drags climbing roads' terrain upward).
      const hw = e.width / 2, reach = hw + 10;
      const near = new Map(); // cell -> [dist, roadY]
      for (let s = 0; s < pts.length - 1; s++) {
        const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
        const ga = this.height(ax, az), gb = this.height(bx, bz);
        const bridge = (ys[s] - ga > 3.5) || (ys[s + 1] - gb > 3.5);
        if (bridge) {
          this.bridges.push({ ax, az, bx, bz, ya: ys[s], yb: ys[s + 1], hw: hw + 0.5, edge: e.id });
          continue;
        }
        this.forEachCellIn(Math.min(ax, bx) - reach, Math.min(az, bz) - reach, Math.max(ax, bx) + reach, Math.max(az, bz) + reach, (k, x, z) => {
          const r = distToSeg(x, z, ax, az, bx, bz);
          if (r.d > reach) return;
          const prev = near.get(k);
          if (!prev || r.d < prev[0]) near.set(k, [r.d, lerp(ys[s], ys[s + 1], r.t)]);
        });
      }
      for (const [k, [d, y]] of near) {
        const w = 1 - smoothstep(hw + 1.5, reach, d);
        this.h[k] = lerp(this.h[k], y - 0.15, w);
        // (a gravel lane is only marked paved down the middle, where the gravel hides it: the 4 m terrain
        // grid would smear pavement out past the edges as a dark strip; its verges are dry grass and dirt)
        if (e.gravel) { if (d < hw - 4) this.splat[k * 4 + 3] = 255; else if (d < hw + 2) { this.splat[k * 4 + 2] = Math.max(this.splat[k * 4 + 2], 170); this.splat[k * 4] = Math.max(this.splat[k * 4], 60); } }
        else if (d < hw + 1.5) this.splat[k * 4 + 3] = 255;
      }
    }
  }

  // RGBA = sand/mud, forest floor, dry grass, paved/road
  buildSplat() {
    const { n, half, cell, h, wl, splat } = this;
    const cx0 = CITY.x0 - 10, cx1 = CITY.x0 + CITY.nx * CITY.pitch + 10;
    const cz0 = CITY.z0 - 10, cz1 = CITY.z0 + CITY.nz * CITY.pitch + 10;
    const tx0 = TOWN.x0 - 8, tx1 = TOWN.x0 + TOWN.nx * TOWN.pitch + 8;
    const tz0 = TOWN.z0 - 8, tz1 = TOWN.z0 + TOWN.nz * TOWN.pitch + 8;
    for (let j = 0; j < n; j++) {
      const z = -half + j * cell;
      for (let i = 0; i < n; i++) {
        const x = -half + i * cell, k = j * n + i, y = h[k];
        const w = Math.max(0, wl[k]);
        const nearWater = y < w + 1.4 || y < 2.2;
        const bay = bayouMask(x, z);
        const sand = (nearWater ? 1 : smoothstep(3.5, 2.2, y - Math.max(w, 0))) * (1 - bay * 0.85);
        const forest = Math.max(forestMask(x, z), bay * 0.9);
        const dry = clamp(plainsMask(x, z) * 0.9 + fbm(x * 0.004, z * 0.004, 2, 51) * 0.6, 0, 1) * (1 - forest);
        let paved = splat[k * 4 + 3] / 255;
        if (x > AIRFIELD.x0 && x < AIRFIELD.x1 && Math.abs(z - AIRFIELD.z) < AIRFIELD.w / 2) paved = 1;
        if (x > AIRFIELD.x1 - 120 && x < AIRFIELD.x1 && z > AIRFIELD.z - 60 && z < AIRFIELD.z - 16) paved = 1; // apron
        if (x > cx0 && x < cx1 && z > cz0 && z < cz1) paved = 1;
        // the port yard between the last blocks and the water: concrete, not a field
        if (x > cx0 + 6 && x < cx1 - 6 && z >= cz1 && z < cz1 + 78 && z < coastZ(x) - 8) paved = 1;
        if (x > tx0 && x < tx1 && z > tz0 && z < tz1) {
          // streets and the sidewalk along them; the yards behind are grass
          const lx = x - TOWN.x0, lz = z - TOWN.z0, bi = Math.floor(lx / TOWN.pitch), bj = Math.floor(lz / TOWN.pitch);
          const inBlock = bi >= 0 && bi < TOWN.nx && bj >= 0 && bj < TOWN.nz;
          const m = Math.max(Math.abs(lx - (bi + 0.5) * TOWN.pitch), Math.abs(lz - (bj + 0.5) * TOWN.pitch));
          if (!inBlock || m > (TOWN.pitch - TOWN.street) / 2 - 3.5) paved = Math.max(paved, 0.85);
        }
        splat[k * 4] = sand * 255;
        splat[k * 4 + 1] = forest * 255;
        splat[k * 4 + 2] = dry * 255;
        splat[k * 4 + 3] = paved * 255;
      }
    }
  }

  splatAt(x, z, ch) {
    const gx = clamp(Math.round(this.toGrid(x)), 0, this.res), gz = clamp(Math.round(this.toGrid(z)), 0, this.res);
    return this.splat[(gz * this.n + gx) * 4 + ch] / 255;
  }
}
