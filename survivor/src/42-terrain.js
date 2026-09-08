/* ============================================================
   TERRAIN — an island that water carved, not one that noise drew.

   Fractal noise on its own gives you lumps. Real landscapes are
   the record of water running downhill for a long time: valleys
   that branch and join, ridges that sharpen between them, fans of
   sediment where the gradient dies, cliffs where the rock could
   not hold its own angle. So this generates the noise and then
   erodes it, and what comes out has drainage — which is why the
   rivers on the finished map run downhill to the sea without
   anybody drawing them.

   The erosion pass also produces the two fields the rest of the
   world is built on: how much water has flowed over each point,
   and how much sediment settled there. Those are what decide where
   the meadows are, where the marsh is, where the good soil is, and
   where the only thing that will grow is scrub.
   ============================================================ */

class Heightmap {
  constructor(size, worldSizeM) {
    this.size = size;                       // samples per side
    this.worldSizeM = worldSizeM;
    this.cellM = worldSizeM / (size - 1);
    this.height = new Float32Array(size * size);
    this.water = new Float32Array(size * size);      // accumulated flow
    this.sediment = new Float32Array(size * size);   // deposited material
    this.hardness = new Float32Array(size * size);   // resistance to erosion
  }

  idx(c, r) { return r * this.size + c; }
  get(c, r) {
    const s = this.size;
    return this.height[clampTo(r, 0, s - 1) * s + clampTo(c, 0, s - 1)];
  }

  /* Bilinear sample in world coordinates, matching the engine's terrain
     layout so the mesh, the collider and every query agree. */
  heightAtWorld(x, z) {
    const s = this.size;
    const fx = (x / this.worldSizeM + 0.5) * (s - 1);
    const fz = (z / this.worldSizeM + 0.5) * (s - 1);
    const c = Math.floor(fx), r = Math.floor(fz);
    const u = fx - c, v = fz - r;
    const h00 = this.get(c, r), h10 = this.get(c + 1, r);
    const h01 = this.get(c, r + 1), h11 = this.get(c + 1, r + 1);
    return lerpN(lerpN(h00, h10, u), lerpN(h01, h11, u), v);
  }

  slopeAtWorld(x, z) {
    const d = this.cellM;
    const dx = (this.heightAtWorld(x + d, z) - this.heightAtWorld(x - d, z)) / (2 * d);
    const dz = (this.heightAtWorld(x, z + d) - this.heightAtWorld(x, z - d)) / (2 * d);
    return Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI;
  }

  bounds() {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < this.height.length; i++) {
      if (this.height[i] < lo) lo = this.height[i];
      if (this.height[i] > hi) hi = this.height[i];
    }
    return { min: lo, max: hi };
  }

  /* Flatten a disc — how a POI claims its ground. A neighbourhood is graded
     before it is built, and so is a runway. The rim is feathered so the pad
     joins the landscape instead of standing on a plinth. */
  flatten(x, z, radiusM, targetY = null, feather = 0.4) {
    const s = this.size;
    const target = targetY != null ? targetY : this.heightAtWorld(x, z);
    const c0 = Math.max(0, Math.floor(((x - radiusM) / this.worldSizeM + 0.5) * (s - 1)));
    const c1 = Math.min(s - 1, Math.ceil(((x + radiusM) / this.worldSizeM + 0.5) * (s - 1)));
    const r0 = Math.max(0, Math.floor(((z - radiusM) / this.worldSizeM + 0.5) * (s - 1)));
    const r1 = Math.min(s - 1, Math.ceil(((z + radiusM) / this.worldSizeM + 0.5) * (s - 1)));
    for (let r = r0; r <= r1; r++) {
      const wz = (r / (s - 1) - 0.5) * this.worldSizeM;
      for (let c = c0; c <= c1; c++) {
        const wx = (c / (s - 1) - 0.5) * this.worldSizeM;
        const d = Math.hypot(wx - x, wz - z);
        if (d > radiusM) continue;
        const t = 1 - smootherstep(clamp01((d / radiusM - (1 - feather)) / Math.max(feather, 1e-6)));
        const i = r * s + c;
        this.height[i] = lerpN(this.height[i], target, t);
      }
    }
    return target;
  }
}

function smootherstep(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

/* ------------------------------------------------------------------
   SOIL

   What the droplets accumulated is how much material passed through a
   cell, which is not a depth. Soil depth is set by two things: what
   was deposited there, and whether the ground is flat enough to hold
   it. Steep ground sheds its soil to the slope below no matter how
   much water crossed it, which is why hillsides are thin and stony
   and valley floors are deep — and why the meadows in this world end
   up at the bottom of the drainage rather than scattered at random.

   The deposition term is rank-normalised rather than divided by the
   maximum, because the distribution has a long tail: one gully with a
   hundred times the mean would otherwise leave the whole rest of the
   island reading as bare rock.
   ------------------------------------------------------------------ */
function buildSoil(map) {
  const S = map.size;
  const n = S * S;

  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  const dep = map.sediment;
  const sorted = Array.from(order).sort((a, b) => dep[a] - dep[b]);
  const rank = new Float32Array(n);
  for (let k = 0; k < n; k++) rank[sorted[k]] = k / (n - 1);

  for (let r = 0; r < S; r++) {
    for (let c = 0; c < S; c++) {
      const i = r * S + c;
      const hL = map.get(c - 1, r), hR = map.get(c + 1, r);
      const hD = map.get(c, r - 1), hU = map.get(c, r + 1);
      const slopeDeg = Math.atan(Math.hypot((hR - hL) / (2 * map.cellM), (hU - hD) / (2 * map.cellM)))
        * 180 / Math.PI;
      const retention = Math.pow(1 - clamp01(slopeDeg / 42), 1.6);
      map.sediment[i] = (0.12 + 1.85 * rank[i]) * retention;
    }
  }
  return map;
}

/* ------------------------------------------------------------------
   PIT FILLING

   Droplet erosion leaves closed depressions, and a river traced down
   a surface with pits in it stops in the first one it meets. Priority
   flood is the standard hydrological fix: process cells outward from
   the map edge in order of height, raising any cell below the level
   it was reached at, so every point ends up with a downhill path to
   the sea. The epsilon keeps a slight gradient across filled ground
   instead of a dead flat lake, which is what lets a river cross it.

   The filled surface is kept separately from the real one — the pits
   are genuine terrain and the player should be able to fall into
   them. It is only the flow routing that needs them gone.
   ------------------------------------------------------------------ */
function fillDepressions(map, opts = {}) {
  const S = map.size;
  const eps = opts.epsilon != null ? opts.epsilon : 0.0015;
  const filled = new Float32Array(map.height);

  // A bucketed queue is enough here and avoids a general heap: heights span
  // a few hundred metres and centimetre buckets resolve them fully.
  const bucketM = 0.05;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < filled.length; i++) {
    if (filled[i] < lo) lo = filled[i];
    if (filled[i] > hi) hi = filled[i];
  }
  const nBuckets = Math.max(2, Math.ceil((hi - lo) / bucketM) + 2);
  const buckets = new Array(nBuckets);
  const closed = new Uint8Array(S * S);
  const push = (i, h) => {
    const b = clampTo(Math.floor((h - lo) / bucketM), 0, nBuckets - 1);
    if (!buckets[b]) buckets[b] = [];
    buckets[b].push(i);
  };

  // Seed from the map edge — the sea is the outlet.
  for (let c = 0; c < S; c++) {
    for (const i of [c, (S - 1) * S + c, c * S, c * S + S - 1]) {
      if (closed[i]) continue;
      closed[i] = 1;
      push(i, filled[i]);
    }
  }

  for (let b = 0; b < nBuckets; b++) {
    const bucket = buckets[b];
    if (!bucket) continue;
    for (let k = 0; k < bucket.length; k++) {
      const i = bucket[k];
      const r = (i / S) | 0, c = i % S;
      const h = filled[i];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= S || nc >= S) continue;
          const j = nr * S + nc;
          if (closed[j]) continue;
          closed[j] = 1;
          if (filled[j] <= h) filled[j] = h + eps;
          push(j, filled[j]);
          // A neighbour raised to this bucket's level belongs in this
          // bucket, so append rather than deferring it.
          const nb = clampTo(Math.floor((filled[j] - lo) / bucketM), 0, nBuckets - 1);
          if (nb === b) bucket.push(j);
        }
      }
    }
    buckets[b] = null;
  }
  return filled;
}

/* Value noise with fractal octaves. Deterministic from a seed so a world is
   reproducible from its number, which matters when the design says the map
   never regenerates: the same seed has to give the same island forever. */
class ValueNoise {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.perm = new Uint16Array(512);
    const p = new Uint16Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = this.seed || 1;
    for (let i = 255; i > 0; i--) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const j = s % (i + 1);
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  _hash(x, y) { return this.perm[(this.perm[x & 255] + (y & 255)) & 255] / 255; }

  value2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = smootherstep(xf), v = smootherstep(yf);
    const a = this._hash(xi, yi), b = this._hash(xi + 1, yi);
    const c = this._hash(xi, yi + 1), d = this._hash(xi + 1, yi + 1);
    return lerpN(lerpN(a, b, u), lerpN(c, d, u), v) * 2 - 1;
  }

  fbm(x, y, octaves = 6, lacunarity = 2.03, gain = 0.5) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.value2(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  }

  /* Ridged noise, for the spine of the island. Folding the absolute value
     turns the smooth troughs of fbm into sharp crests, which is what a
     mountain range looks like from a distance. */
  ridged(x, y, octaves = 5, lacunarity = 2.07, gain = 0.5) {
    let sum = 0, amp = 1, freq = 1, norm = 0, prev = 1;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.value2(x * freq, y * freq));
      sum += n * n * amp * prev;
      prev = n;
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return (sum / norm) * 2 - 1;
  }
}


const ISLAND_DEFAULTS = {
  /* The design says the island is 100 m across. A gated community of 26
     houses needs about 300 m on its own, a downtown with towers needs 600,
     and a cattle prairie needs 500 — so 100 m would be a single house's
     garden. Four kilometres a side puts every named location on the map
     with real wilderness between them and still lets a player walk the
     whole thing in a bit over one game-day, which is the pace the survival
     systems are tuned for. It is one number: change `worldSizeM` and
     everything downstream scales with it. */
  worldSizeM: 4000,
  resolution: 513,
  seaLevelM: 0,
  peakM: 205,
  seed: 20260908,
  erosionDroplets: 75000,
};


function generateIsland(opts = {}) {
  const o = Object.assign({}, ISLAND_DEFAULTS, opts);
  const map = new Heightmap(o.resolution, o.worldSizeM);
  const noise = new ValueNoise(o.seed);
  const detail = new ValueNoise(o.seed ^ 0x9e3779b9);
  const S = o.resolution;

  /* 1. The land mass.

     A radial falloff makes an island; distorting the radius with noise stops
     it being a circle, and gives it bays, headlands and a spit or two. */
  for (let r = 0; r < S; r++) {
    const nz = r / (S - 1);
    for (let c = 0; c < S; c++) {
      const nx = c / (S - 1);
      const dx = nx - 0.5, dz = nz - 0.5;
      let dist = Math.hypot(dx, dz) * 2;                 // 0 centre, 1 edge

      // Warp the coastline so it is not a disc.
      const coastWarp = noise.fbm(nx * 2.6, nz * 2.6, 4) * 0.28
        + detail.fbm(nx * 7.0, nz * 7.0, 3) * 0.09;
      dist += coastWarp;

      // Land above the shelf, sea below, with a beach in between.
      const land = 1 - smootherstep(clamp01((dist - 0.52) / 0.30));

      // Relief: a ridged spine with fbm hills over it.
      const spine = Math.max(0, noise.ridged(nx * 2.2 + 11.3, nz * 2.2 - 4.7, 5));
      const hills = (noise.fbm(nx * 4.5, nz * 4.5, 6) * 0.5 + 0.5);
      const fine = detail.fbm(nx * 16, nz * 16, 4) * 0.5 + 0.5;

      // Store the raw shaped field; it is normalised and scaled below, so
      // that `peakM` is the height of the actual summit rather than the
      // height a summit would reach if the noise ever hit its maximum.
      map.height[r * S + c] = land * (spine * 0.62 + hills * 0.30 + fine * 0.08);
      map.water[r * S + c] = land;      // parked here; overwritten by erosion

      /* Rock hardness varies, and that is what makes erosion produce
         interesting shapes rather than uniform smoothing: hard bands become
         cliffs and waterfalls, soft ground becomes valley floor. */
      map.hardness[r * S + c] = clamp01(0.35 + 0.55 * (noise.fbm(nx * 5.5 + 40, nz * 5.5 - 20, 3) * 0.5 + 0.5));
    }
  }

  /* 1b. Normalise and scale.

     The shaping curve is applied after normalisation so it redistributes
     height without also silently scaling it down — raising the exponent
     flattens the lowlands and sharpens the summits, which is what it is
     for, and does not cost 40% of the relief on the way. */
  let rawMax = 0;
  for (let i = 0; i < map.height.length; i++) if (map.height[i] > rawMax) rawMax = map.height[i];
  rawMax = Math.max(rawMax, 1e-6);
  const shelf = o.peakM * 0.16;
  for (let i = 0; i < map.height.length; i++) {
    const land = map.water[i];
    const n = Math.pow(clamp01(map.height[i] / rawMax), 1.25);
    // Erosion will take a fair slice off the top, so the pre-erosion peak is
    // set above the target and the finished island lands near it.
    map.height[i] = n * o.peakM * 1.22 - (1 - land) * (34 + shelf);
  }
  map.water.fill(0);

  /* 2. Erode it. */
  thermalErosion(map, { iterations: o.thermalIterations != null ? o.thermalIterations : 45 });
  hydraulicErosion(map, {
    droplets: o.erosionDroplets, seed: o.seed ^ 0x5bf03635,
  });
  thermalErosion(map, { iterations: 12, talusDeg: 40 });

  /* Turn the raw deposition tally into a soil depth in metres. What the
     droplets accumulated is a count of how much material passed through, not
     a thickness; the biome rules want a thickness, and confusing the two put
     three metres of topsoil on every hillside. */
  buildSoil(map);

  return { map, opts: o, noise, detail };
}


/* ------------------------------------------------------------------
   THERMAL EROSION

   Rock that is piled steeper than it can hold slides. The angle it
   can hold is the talus angle — around 34 degrees for loose scree,
   higher for competent rock — and material above it moves downhill
   until the slope is stable. This is what turns noise cliffs into
   real slopes with scree at their feet.
   ------------------------------------------------------------------ */
function thermalErosion(map, opts = {}) {
  const iterations = opts.iterations != null ? opts.iterations : 40;
  const talusDeg = opts.talusDeg != null ? opts.talusDeg : 34;
  const S = map.size;
  const h = map.height;
  const maxDrop = Math.tan((talusDeg * Math.PI) / 180) * map.cellM;
  const rate = opts.rate != null ? opts.rate : 0.5;

  const delta = new Float32Array(h.length);
  for (let it = 0; it < iterations; it++) {
    delta.fill(0);
    for (let r = 1; r < S - 1; r++) {
      for (let c = 1; c < S - 1; c++) {
        const i = r * S + c;
        const hi = h[i];
        // Harder rock holds a steeper face, which is where cliffs come from.
        const limit = maxDrop * (0.7 + 0.9 * map.hardness[i]);

        let total = 0;
        const diffs = [0, 0, 0, 0];
        const nb = [i - 1, i + 1, i - S, i + S];
        for (let k = 0; k < 4; k++) {
          const d = hi - h[nb[k]];
          if (d > limit) { diffs[k] = d - limit; total += diffs[k]; }
        }
        if (total <= 0) continue;
        const move = Math.min(total * rate * 0.5, (hi - h[nb[0]]) * 0.5 + total * 0.25);
        for (let k = 0; k < 4; k++) {
          if (diffs[k] <= 0) continue;
          const share = (diffs[k] / total) * move;
          delta[i] -= share;
          delta[nb[k]] += share;
        }
      }
    }
    for (let i = 0; i < h.length; i++) h[i] += delta[i];
  }
  return map;
}


/* ------------------------------------------------------------------
   HYDRAULIC EROSION

   Droplet simulation. Each drop starts somewhere on the map and runs
   downhill, gaining speed on steep ground. Its capacity to carry
   sediment scales with slope and speed; where it exceeds capacity it
   picks material up, where it falls short it drops it. Over enough
   drops this cuts branching valley networks, deposits fans where the
   gradient dies, and leaves behind a record of how much water crossed
   every point — which is where the rivers and the marsh are.

   This is the standard particle-based method and it is used here
   because it is the only cheap way to get drainage that is actually
   connected. Noise cannot do it: noise has no memory of where water
   went.
   ------------------------------------------------------------------ */
function hydraulicErosion(map, opts = {}) {
  const S = map.size;
  const h = map.height;
  const droplets = opts.droplets != null ? opts.droplets : 100000;
  const maxSteps = opts.maxSteps != null ? opts.maxSteps : 64;
  const inertia = opts.inertia != null ? opts.inertia : 0.06;
  const capacityFactor = opts.capacity != null ? opts.capacity : 4.0;
  /* The floor on effective slope decides how much a drop can carry across
     flat ground. Set it high and the whole map is scoured and re-blanketed
     into a plain; set it low and the drop keeps what it has until it reaches
     somewhere the gradient actually dies, which is where a real alluvial fan
     is. */
  const minSlope = 0.003;
  const erodeRate = opts.erodeRate != null ? opts.erodeRate : 0.30;
  const depositRate = opts.depositRate != null ? opts.depositRate : 0.16;
  const evaporation = opts.evaporation != null ? opts.evaporation : 0.015;
  const gravity = 4;
  const radius = opts.radius != null ? opts.radius : 2;

  let seed = (opts.seed || 1) >>> 0;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  // Precompute the deposition brush so eroding a point spreads over a small
  // disc rather than punching a single-cell hole.
  const brush = [];
  let brushWeight = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      const w = 1 - d / radius;
      brush.push({ dx, dy, w });
      brushWeight += w;
    }
  }
  for (const b of brush) b.w /= brushWeight;

  const gradient = (x, y) => {
    const cx = Math.min(Math.max(Math.floor(x), 0), S - 2);
    const cy = Math.min(Math.max(Math.floor(y), 0), S - 2);
    const u = x - cx, v = y - cy;
    const i = cy * S + cx;
    const nw = h[i], ne = h[i + 1], sw = h[i + S], se = h[i + S + 1];
    return {
      gx: (ne - nw) * (1 - v) + (se - sw) * v,
      gy: (sw - nw) * (1 - u) + (se - ne) * u,
      height: nw * (1 - u) * (1 - v) + ne * u * (1 - v) + sw * (1 - u) * v + se * u * v,
      cx, cy, u, v,
    };
  };

  for (let d = 0; d < droplets; d++) {
    let x = rand() * (S - 2) + 0.5;
    let y = rand() * (S - 2) + 0.5;
    let dirX = 0, dirY = 0;
    let speed = 1, water = 1, sediment = 0;

    for (let step = 0; step < maxSteps; step++) {
      const g = gradient(x, y);
      const nodeIndex = g.cy * S + g.cx;

      // Momentum keeps a drop from turning on every pixel, which is what
      // makes a channel rather than a scribble.
      dirX = dirX * inertia - g.gx * (1 - inertia);
      dirY = dirY * inertia - g.gy * (1 - inertia);
      const len = Math.hypot(dirX, dirY);
      if (len < 1e-8) break;
      dirX /= len; dirY /= len;

      const nx = x + dirX, ny = y + dirY;
      if (nx < 1 || nx >= S - 2 || ny < 1 || ny >= S - 2) break;

      const newHeight = gradient(nx, ny).height;
      const deltaH = newHeight - g.height;

      // Below sea level the water stops carving and drops what it carries.
      if (newHeight < -1) {
        h[nodeIndex] += sediment * 0.4;
        break;
      }

      const capacity = Math.max(-deltaH, minSlope) * speed * water * capacityFactor;

      if (sediment > capacity || deltaH > 0) {
        // Uphill or over capacity: put material down. Going uphill it can
        // only fill the dip it just tried to climb, which is how lakes and
        // flat valley floors form.
        const amount = deltaH > 0
          ? Math.min(deltaH, sediment)
          : (sediment - capacity) * depositRate;
        sediment -= amount;
        // Bilinear deposit, so the fill is smooth.
        h[nodeIndex] += amount * (1 - g.u) * (1 - g.v);
        h[nodeIndex + 1] += amount * g.u * (1 - g.v);
        h[nodeIndex + S] += amount * (1 - g.u) * g.v;
        h[nodeIndex + S + 1] += amount * g.u * g.v;
        map.sediment[nodeIndex] += amount;
      } else {
        // Under capacity: cut. Hard rock resists, which is what leaves
        // waterfalls and knickpoints in the finished river.
        const hard = map.hardness[nodeIndex];
        const amount = Math.min((capacity - sediment) * erodeRate * (1.25 - hard), -deltaH);
        for (const b of brush) {
          const bx = g.cx + b.dx, by = g.cy + b.dy;
          if (bx < 0 || by < 0 || bx >= S || by >= S) continue;
          const bi = by * S + bx;
          const take = Math.min(h[bi] + 40, amount * b.w);
          h[bi] -= take;
          sediment += take;
        }
      }

      // Water accumulation is the map of where the rivers are.
      map.water[nodeIndex] += water;

      speed = Math.sqrt(Math.max(0, speed * speed + -deltaH * gravity));
      water *= (1 - evaporation);
      if (water < 0.02) break;
      x = nx; y = ny;
    }
  }
  return map;
}


/* ------------------------------------------------------------------
   BIOMES

   Assigned from what the terrain actually is — height, slope, how much
   water crosses it, how much sediment settled there and how far it is
   from salt water — rather than painted on. Which means the marsh is
   where the drainage ends, the meadows are on the deep soil, and the
   scrub is on the thin stuff, because that is where those things are.
   ------------------------------------------------------------------ */
const BIOME = {
  ocean: { id: 'ocean', name: 'ocean', colour: 0x14384f, walkable: false },
  beach: { id: 'beach', name: 'beach', colour: 0xd8c9a0, terrainFactor: 2.1, cover: 0.02 },
  dune: { id: 'dune', name: 'dunes', colour: 0xc9bb92, terrainFactor: 1.9, cover: 0.2 },
  saltMarsh: { id: 'saltMarsh', name: 'salt marsh', colour: 0x6f7a4a, terrainFactor: 1.8, cover: 0.5, water: true },
  freshMarsh: { id: 'freshMarsh', name: 'marsh', colour: 0x5f7a44, terrainFactor: 1.8, cover: 0.6, water: true },
  riverbank: { id: 'riverbank', name: 'riverbank', colour: 0x6b7f4e, terrainFactor: 1.3, cover: 0.4, water: true },
  meadow: { id: 'meadow', name: 'meadow', colour: 0x6e8b45, terrainFactor: 1.3, cover: 0.25, grass: 1.0 },
  prairie: { id: 'prairie', name: 'prairie', colour: 0x8a9150, terrainFactor: 1.25, cover: 0.2, grass: 1.0 },
  woodland: { id: 'woodland', name: 'woodland', colour: 0x3f6136, terrainFactor: 1.4, cover: 0.7, browse: 1.0, mast: 0.8 },
  deepForest: { id: 'deepForest', name: 'deep forest', colour: 0x2c4a2a, terrainFactor: 1.5, cover: 0.9, browse: 0.8, mast: 1.0 },
  pineForest: { id: 'pineForest', name: 'pine forest', colour: 0x2f4a3c, terrainFactor: 1.45, cover: 0.8, browse: 0.5, mast: 0.3 },
  scrub: { id: 'scrub', name: 'scrub', colour: 0x6a6b40, terrainFactor: 1.5, cover: 0.45, browse: 0.6 },
  rockyHill: { id: 'rockyHill', name: 'rocky hillside', colour: 0x6e6a5e, terrainFactor: 1.7, cover: 0.25, browse: 0.2 },
  scree: { id: 'scree', name: 'scree', colour: 0x7a7568, terrainFactor: 1.9, cover: 0.1 },
  cliff: { id: 'cliff', name: 'cliff', colour: 0x5e5a52, terrainFactor: 3.0, cover: 0.1, walkable: false },
  alpine: { id: 'alpine', name: 'alpine', colour: 0x8a9184, terrainFactor: 1.6, cover: 0.15, grass: 0.3 },
};

/* `waterFlow` is normalised 0..1 against the map's own peak accumulation, so
   the thresholds here mean "a tenth of the biggest watercourse on the island"
   rather than a raw droplet count that changes with the erosion budget. */
function classifyBiome(heightM, slopeDeg, waterFlow, sedimentM, distToCoastM, seaLevelM = 0, peakM = 250) {
  const h = heightM - seaLevelM;
  if (h < -0.4) return BIOME.ocean;
  if (h < 2.5 && distToCoastM < 90) return BIOME.beach;
  if (h < 6 && distToCoastM < 170 && slopeDeg < 12) return BIOME.dune;
  // Where drainage ends near the sea, it is salt marsh; inland, fresh.
  if (h < 3.5 && waterFlow > 0.18 && slopeDeg < 6) {
    return distToCoastM < 260 ? BIOME.saltMarsh : BIOME.freshMarsh;
  }
  if (slopeDeg > 52) return BIOME.cliff;
  if (slopeDeg > 38) return h > 150 ? BIOME.scree : BIOME.rockyHill;

  if (waterFlow > 0.30 && slopeDeg < 20) return BIOME.riverbank;

  // Deep soil grows trees; thin soil on a slope grows scrub.
  const soil = sedimentM;
  /* Vegetation zones scale with the island's own relief, not with absolute
     metres. A treeline sits at a couple of thousand metres in the temperate
     latitudes, so a two-hundred-metre island has no alpine zone at all —
     it is wooded to the summit, and calling its high ground "alpine" put
     bare grey rock on the top of every hill. Above about eight hundred
     metres the zones become real and the thresholds start to bite. */
  const highGround = h / Math.max(peakM, 1);
  if (peakM > 900 && h > 1900) return slopeDeg > 30 ? BIOME.scree : BIOME.alpine;
  if (highGround > 0.72 && h > 220) return slopeDeg > 22 ? BIOME.rockyHill : BIOME.pineForest;
  if (soil > 1.15 && slopeDeg < 14) return BIOME.deepForest;
  if (soil > 0.8) return slopeDeg < 11 ? BIOME.meadow : BIOME.woodland;
  if (soil > 0.45) return slopeDeg < 9 ? BIOME.prairie : BIOME.woodland;
  if (slopeDeg > 24) return BIOME.rockyHill;
  return soil > 0.2 ? BIOME.scrub : BIOME.rockyHill;
}


/* Build the biome field, plus the coast distance transform it needs. */
function classifyTerrain(map, opts = {}) {
  const S = map.size;
  const seaLevel = opts.seaLevelM || 0;
  const biome = new Uint8Array(S * S);
  const biomeIds = Object.keys(BIOME);
  const idIndex = {};
  biomeIds.forEach((k, i) => { idIndex[k] = i; });

  /* Distance to the sea, by two-pass chamfer transform. Cheap, and accurate
     enough for deciding what a beach is. */
  const dist = new Float32Array(S * S).fill(1e9);
  for (let i = 0; i < S * S; i++) if (map.height[i] <= seaLevel) dist[i] = 0;
  const d1 = map.cellM, d2 = map.cellM * Math.SQRT2;
  for (let r = 1; r < S; r++) {
    for (let c = 1; c < S - 1; c++) {
      const i = r * S + c;
      dist[i] = Math.min(dist[i], dist[i - S] + d1, dist[i - 1] + d1,
        dist[i - S - 1] + d2, dist[i - S + 1] + d2);
    }
  }
  for (let r = S - 2; r >= 0; r--) {
    for (let c = S - 2; c >= 1; c--) {
      const i = r * S + c;
      dist[i] = Math.min(dist[i], dist[i + S] + d1, dist[i + 1] + d1,
        dist[i + S + 1] + d2, dist[i + S - 1] + d2);
    }
  }

  let peakFlow = 0;
  for (let i = 0; i < map.water.length; i++) if (map.water[i] > peakFlow) peakFlow = map.water[i];
  peakFlow = Math.max(peakFlow, 1e-6);
  const peakElevation = Math.max(1, map.bounds().max - seaLevel);

  for (let r = 0; r < S; r++) {
    for (let c = 0; c < S; c++) {
      const i = r * S + c;
      const hL = map.get(c - 1, r), hR = map.get(c + 1, r);
      const hD = map.get(c, r - 1), hU = map.get(c, r + 1);
      const slope = Math.atan(Math.hypot((hR - hL) / (2 * map.cellM), (hU - hD) / (2 * map.cellM)))
        * 180 / Math.PI;
      const b = classifyBiome(map.height[i], slope, map.water[i] / peakFlow,
        map.sediment[i], dist[i], seaLevel, peakElevation);
      biome[i] = idIndex[b.id];
    }
  }
  return { biome, biomeIds, coastDistance: dist, at: (c, r) => BIOME[biomeIds[biome[r * S + c]]] };
}

/* Trace rivers from the accumulated-flow field: start where a lot of water
   is high up, and follow the steepest descent to the sea. These are the
   watercourses the fishery and the water sources are placed on. */
function traceRivers(map, opts = {}) {
  const S = map.size;
  /* Threshold as a fraction of the map's own peak accumulation, so it does
     not have to be retuned every time the droplet budget changes. */
  let peakFlow = 0;
  for (let i = 0; i < map.water.length; i++) if (map.water[i] > peakFlow) peakFlow = map.water[i];
  const minFlow = opts.minFlow != null ? opts.minFlow : peakFlow * 0.35;
  const maxRivers = opts.maxRivers != null ? opts.maxRivers : 8;
  const seaLevel = opts.seaLevelM || 0;

  const sources = [];
  for (let r = 2; r < S - 2; r++) {
    for (let c = 2; c < S - 2; c++) {
      const i = r * S + c;
      if (map.water[i] < minFlow || map.height[i] < seaLevel + 18) continue;
      sources.push({ c, r, flow: map.water[i], h: map.height[i] });
    }
  }
  sources.sort((a, b) => b.flow * b.h - a.flow * a.h);

  /* Route on the depression-filled surface so a river cannot stop halfway
     down the mountain in a hole the erosion left. */
  const routing = opts.routingSurface || fillDepressions(map);

  const rivers = [];
  const used = new Set();
  for (const s of sources) {
    if (rivers.length >= maxRivers) break;
    const key = `${(s.c / 12) | 0}:${(s.r / 12) | 0}`;
    if (used.has(key)) continue;
    used.add(key);

    const path = [];
    let c = s.c, r = s.r;
    for (let step = 0; step < S * 2; step++) {
      const i = r * S + c;
      path.push({
        x: (c / (S - 1) - 0.5) * map.worldSizeM,
        z: (r / (S - 1) - 0.5) * map.worldSizeM,
        y: map.height[i],
        flow: map.water[i],
      });
      if (map.height[i] <= seaLevel) break;
      // Steepest descent among the eight neighbours.
      let bc = c, br = r, best = routing[i];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const nc = c + dc, nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= S || nr >= S) continue;
          const nh = routing[nr * S + nc];
          if (nh < best) { best = nh; bc = nc; br = nr; }
        }
      }
      if (bc === c && br === r) break;      // landlocked: this is a lake
      c = bc; r = br;
    }
    if (path.length > 12) rivers.push({ path, sourceFlow: s.flow, reachesSea: path[path.length - 1].y <= seaLevel });
  }
  return rivers;
}
