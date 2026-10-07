// Map generation, static geometry batching, collision and raycasting.
// The map is seeded, so every raid uses the same layout (learnable, like DMZ),
// while loot and enemies are randomized per raid.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

const CELL = 16;
const _c = new THREE.Color();

const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
// u x v = n so corners wind counter-clockwise when seen from outside.
const FACES = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
];

// Merges thousands of axis-aligned boxes into one vertex-colored mesh (1 draw call).
class Batcher {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; this.n = 0; }
  box(x0, y0, z0, x1, y1, z1, color, tint, rng) {
    _c.set(color);
    const k = 1 + (rng() - 0.5) * 2 * tint;
    const r = _c.r * k, g = _c.g * k, b = _c.b * k;
    const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const e = [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2];
    for (const f of FACES) {
      if (f.n[1] === -1 && y0 <= 0.001) continue; // bottom faces on the ground are never seen
      const base = this.n;
      for (const [su, sv] of CORNERS) {
        for (let i = 0; i < 3; i++) this.pos.push(c[i] + (f.n[i] + su * f.u[i] + sv * f.v[i]) * e[i]);
        this.nor.push(f.n[0], f.n[1], f.n[2]);
        this.col.push(r, g, b);
        this.n++;
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(new THREE.Uint32BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }
}

// Ray vs axis-aligned box (slab test). Returns entry distance or Infinity.
export function rayBox(ox, oy, oz, ix, iy, iz, x0, y0, z0, x1, y1, z1) {
  let t1 = (x0 - ox) * ix, t2 = (x1 - ox) * ix;
  let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
  t1 = (y0 - oy) * iy; t2 = (y1 - oy) * iy;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (z0 - oz) * iz; t2 = (z1 - oz) * iz;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  if (tmin >= 0 && tmin <= tmax) return tmin;
  return Infinity;
}

const safeInv = (d) => 1 / (Math.abs(d) < 1e-9 ? 1e-9 : d);
const overlap = (a, b, g = 0) => a.x0 < b.x1 + g && a.x1 > b.x0 - g && a.z0 < b.z1 + g && a.z1 > b.z0 - g;
const rect = (x0, z0, x1, z1) => ({ x0, z0, x1, z1 });

const PAL = {
  house: [0xd8c8a8, 0xcbb894, 0xe0d4bc, 0xbfae8e, 0xd2b48c, 0xc9b49a],
  roof: 0x7d6a55, floor: 0x8f8170, concrete: 0x9b9a92, metal: 0x858b91, barn: 0x8b3a2b,
  road: 0x4a4741, line: 0xd9cf9f, rock: 0x857a6a, cliff: 0x8a7458, sand: 0xb8a27a,
  containers: [0xa33a2a, 0x2a5a8a, 0x3f7a3a, 0xc27c2a, 0x6a6a6a],
  cars: [0x7d4b32, 0x5a5f66, 0x8a7a5c, 0x3c4a5c, 0x9a3d2a, 0xb9b4a6],
};

export class World {
  constructor(scene, seed = 7331, assets = null) {
    this.scene = scene;
    this.assets = assets;
    this.rng = mulberry32(seed);              // layout: same map every raid
    this.tintRng = mulberry32(seed ^ 0x5bd1e995); // color variation only, so it never shifts the layout
    this.propRng = mulberry32(seed + 17);     // which scan goes where; adding scans keeps the layout identical
    this.props = [];
    this.H = 320;
    this.colliders = [];
    this.grid = new Map();
    this._stamp = 0;
    this.buildings = [];
    this.roads = [];
    this.occupied = [];
    this.lootSpots = [];
    this.treePts = [];
    this.batch = new Batcher();
    this.pois = [
      { name: 'Dustwater', x: -170, z: -150, r: 62, threat: 1, kind: 'town' },
      { name: 'Rustworks', x: 170, z: -150, r: 66, threat: 2, kind: 'industrial' },
      { name: 'Hollow Farms', x: -170, z: 160, r: 62, threat: 1, kind: 'farm' },
      { name: 'Ridgeback Comms', x: 170, z: 160, r: 55, threat: 2, kind: 'comms' },
      { name: 'Fort Kessler', x: 0, z: 0, r: 46, threat: 3, kind: 'fort' },
    ];
    this.exfils = [
      { name: 'Alpha', x: 0, z: -292 },
      { name: 'Bravo', x: 292, z: 0 },
      { name: 'Charlie', x: 0, z: 292 },
      { name: 'Delta', x: -292, z: 0 },
    ];
    this.playerSpawns = [
      { x: -280, z: -280 }, { x: 280, z: -280 }, { x: -280, z: 280 }, { x: 280, z: 280 },
      { x: -292, z: -70 }, { x: 292, z: 80 }, { x: 70, z: -292 }, { x: -70, z: 292 },
    ];
    this.generate();
    this.build();
  }

  r(a, b) { return a + this.rng() * (b - a); }
  ri(a, b) { return Math.floor(this.r(a, b + 1)); }
  pk(arr) { return arr[Math.floor(this.rng() * arr.length)]; }

  // ---------- collision ----------
  solid(x0, y0, z0, x1, y1, z1, color, collide = true, tint = 0.06) {
    this.batch.box(x0, y0, z0, x1, y1, z1, color, tint, this.tintRng);
    if (collide) this.addCollider({ min: [x0, y0, z0], max: [x1, y1, z1] });
  }

  addCollider(c) {
    c._s = 0;
    this.colliders.push(c);
    const cx0 = Math.floor(c.min[0] / CELL), cx1 = Math.floor(c.max[0] / CELL);
    const cz0 = Math.floor(c.min[2] / CELL), cz1 = Math.floor(c.max[2] / CELL);
    for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) {
      const k = x * 4096 + z;
      let cell = this.grid.get(k);
      if (!cell) this.grid.set(k, (cell = []));
      cell.push(c);
    }
    return c;
  }

  query(x0, z0, x1, z1) {
    const s = ++this._stamp;
    const out = [];
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL);
    const cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) {
      const cell = this.grid.get(x * 4096 + z);
      if (!cell) continue;
      for (const c of cell) if (c._s !== s) { c._s = s; out.push(c); }
    }
    return out;
  }

  overlaps(x, y, z, r, h) {
    for (const c of this.query(x - r, z - r, x + r, z + r)) {
      if (x - r < c.max[0] && x + r > c.min[0] && z - r < c.max[2] && z + r > c.min[2] &&
          y < c.max[1] && y + h > c.min[1]) return true;
    }
    return false;
  }

  isFree(x, z, r = 0.6) {
    if (Math.abs(x) > this.H - 8 || Math.abs(z) > this.H - 8) return false;
    return !this.overlaps(x, 0.05, z, r, 1.8);
  }

  // Moves a body {pos, vel, r, h, onGround} with step-up and sliding.
  moveBody(b, dt) {
    const STEP = 0.5;
    b.blocked = false;
    b.pos.x += b.vel.x * dt; this._resolve(b, 0, STEP);
    b.pos.z += b.vel.z * dt; this._resolve(b, 2, STEP);
    b.pos.y += b.vel.y * dt;
    b.onGround = false;
    this._resolveY(b);
    if (b.pos.y <= 0) { b.pos.y = 0; if (b.vel.y < 0) b.vel.y = 0; b.onGround = true; }
  }

  _resolve(b, axis, step) {
    const p = b.pos, r = b.r;
    for (const c of this.query(p.x - r, p.z - r, p.x + r, p.z + r)) {
      if (p.x - r >= c.max[0] || p.x + r <= c.min[0] || p.z - r >= c.max[2] || p.z + r <= c.min[2] ||
          p.y >= c.max[1] || p.y + b.h <= c.min[1]) continue;
      const rise = c.max[1] - p.y;
      if (b.onGround && rise <= step && !this.overlaps(p.x, c.max[1] + 0.01, p.z, r * 0.9, b.h)) {
        p.y = c.max[1];
        continue;
      }
      const v = axis === 0 ? b.vel.x : b.vel.z;
      const pc = axis === 0 ? p.x : p.z;
      const lo = c.min[axis] - r, hi = c.max[axis] + r;
      let np;
      if (v > 0) np = lo; else if (v < 0) np = hi; else np = (pc - lo < hi - pc) ? lo : hi;
      if (axis === 0) { p.x = np; } else { p.z = np; }
      b.blocked = true;
    }
  }

  _resolveY(b) {
    const p = b.pos, r = b.r;
    for (const c of this.query(p.x - r, p.z - r, p.x + r, p.z + r)) {
      if (p.x - r >= c.max[0] || p.x + r <= c.min[0] || p.z - r >= c.max[2] || p.z + r <= c.min[2] ||
          p.y >= c.max[1] || p.y + b.h <= c.min[1]) continue;
      const up = c.max[1] - p.y;
      const down = p.y + b.h - c.min[1];
      if (up <= down) {
        p.y = c.max[1];
        if (b.vel.y < 0) b.vel.y = 0;
        b.onGround = true;
      } else {
        p.y = c.min[1] - b.h;
        if (b.vel.y > 0) b.vel.y = 0;
      }
    }
  }

  // Ray against all static geometry + ground. Returns {t} or null.
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT, hit = false;
    if (dy < 0) { const t = -oy / dy; if (t < best) { best = t; hit = true; } }
    const ix = safeInv(dx), iy = safeInv(dy), iz = safeInv(dz);
    for (const c of this.colliders) {
      const t = rayBox(ox, oy, oz, ix, iy, iz, c.min[0], c.min[1], c.min[2], c.max[0], c.max[1], c.max[2]);
      if (t < best) { best = t; hit = true; }
    }
    return hit ? { t: best } : null;
  }

  // Buildings that contain the point, outermost first (fort compound before its inner buildings).
  containing(x, z) {
    const out = [];
    for (const b of this.buildings) {
      if (x > b.x0 + 0.2 && x < b.x1 - 0.2 && z > b.z0 + 0.2 && z < b.z1 - 0.2) out.push(b);
    }
    out.sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0));
    return out;
  }

  // ---------- generation ----------
  generate() {
    const H = this.H, W = 10;
    for (const z of [-150, 0, 160]) this.addRoad(-H, z - W / 2, H, z + W / 2, 0.04, true);
    for (const x of [-170, 0, 170]) this.addRoad(x - W / 2, -H, x + W / 2, H, 0.045, false);
    for (const e of this.exfils) this.occupied.push(rect(e.x - 18, e.z - 18, e.x + 18, e.z + 18));
    for (const s of this.playerSpawns) this.occupied.push(rect(s.x - 4, s.z - 4, s.x + 4, s.z + 4));

    this.buildFort(this.pois[4]);
    this.buildTown(this.pois[0]);
    this.buildIndustrial(this.pois[1]);
    this.buildFarm(this.pois[2]);
    this.buildComms(this.pois[3]);
    this.buildCars();
    this.buildRocks();
    this.buildTrees();
    this.buildCliffs();
  }

  addRoad(x0, z0, x1, z1, y, horiz) {
    this.roads.push(rect(x0, z0, x1, z1));
    this.solid(x0, 0, z0, x1, y, z1, PAL.road, false, 0.02);
    // dashed center line
    if (horiz) {
      const zc = (z0 + z1) / 2;
      for (let x = x0 + 2; x < x1 - 4; x += 9) this.solid(x, y, zc - 0.12, x + 4, y + 0.01, zc + 0.12, PAL.line, false, 0.02);
    } else {
      const xc = (x0 + x1) / 2;
      for (let z = z0 + 2; z < z1 - 4; z += 9) this.solid(xc - 0.12, y, z, xc + 0.12, y + 0.012, z + 4, PAL.line, false, 0.02);
    }
  }

  freeRect(rc, gap = 3, roadGap = 2) {
    if (Math.abs(rc.x0) > this.H - 25 || Math.abs(rc.x1) > this.H - 25 ||
        Math.abs(rc.z0) > this.H - 25 || Math.abs(rc.z1) > this.H - 25) return false;
    for (const r of this.roads) if (overlap(rc, r, roadGap)) return false;
    for (const o of this.occupied) if (overlap(rc, o, gap)) return false;
    return true;
  }

  place(poi, w, d, gap = 3, roadGap = 2, rad = poi.r) {
    for (let i = 0; i < 120; i++) {
      const a = this.rng() * Math.PI * 2, rr = rad * Math.sqrt(this.rng());
      const x = poi.x + Math.cos(a) * rr, z = poi.z + Math.sin(a) * rr;
      const rc = rect(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
      if (this.freeRect(rc, gap, roadGap)) { this.occupied.push(rc); return rc; }
    }
    return null;
  }

  wallX(a, b, z, h, ops, col, t = 0.35) {
    let cur = a;
    ops.sort((p, q) => p.c - q.c);
    for (const o of ops) {
      const oa = o.c - o.w / 2, ob = o.c + o.w / 2;
      if (oa > cur) this.solid(cur, 0, z - t / 2, oa, h, z + t / 2, col);
      if (o.b > 0) this.solid(oa, 0, z - t / 2, ob, o.b, z + t / 2, col);
      if (o.t < h) this.solid(oa, o.t, z - t / 2, ob, h, z + t / 2, col);
      cur = ob;
    }
    if (cur < b) this.solid(cur, 0, z - t / 2, b, h, z + t / 2, col);
  }

  wallZ(a, b, x, h, ops, col, t = 0.35) {
    let cur = a;
    ops.sort((p, q) => p.c - q.c);
    for (const o of ops) {
      const oa = o.c - o.w / 2, ob = o.c + o.w / 2;
      if (oa > cur) this.solid(x - t / 2, 0, cur, x + t / 2, h, oa, col);
      if (o.b > 0) this.solid(x - t / 2, 0, oa, x + t / 2, o.b, ob, col);
      if (o.t < h) this.solid(x - t / 2, o.t, oa, x + t / 2, h, ob, col);
      cur = ob;
    }
    if (cur < b) this.solid(x - t / 2, 0, cur, x + t / 2, h, b, col);
  }

  // Generic single-storey building with doors, windows, roof, interior props and loot spots.
  building(rc, h, color, poi, o = {}) {
    const { x0, z0, x1, z1 } = rc;
    const t = 0.35;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const door = o.door || { w: 1.6, t: 2.4 };
    const win = o.win === undefined ? { w: 1.2, b: 1.0, t: 2.0 } : o.win;
    const dx = poi.x - cx, dz = poi.z - cz;
    const front = o.front || (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'e' : 'w') : (dz > 0 ? 's' : 'n'));
    const opp = { n: 's', s: 'n', e: 'w', w: 'e' };
    const doorSides = [front];
    if (o.backDoor) doorSides.push(opp[front]);

    const doors = [];
    const sides = {
      n: { a: x0, b: x1, fixed: z0 + t / 2, along: 'x' },
      s: { a: x0, b: x1, fixed: z1 - t / 2, along: 'x' },
      e: { a: z0 + t, b: z1 - t, fixed: x1 - t / 2, along: 'z' },
      w: { a: z0 + t, b: z1 - t, fixed: x0 + t / 2, along: 'z' },
    };
    for (const key of ['n', 's', 'e', 'w']) {
      const s = sides[key];
      const L = s.b - s.a;
      const ops = [];
      const dIdx = doorSides.indexOf(key);
      if (dIdx >= 0) {
        const dw = dIdx === 0 ? door.w : (o.backDoorW || 1.6);
        const dt = dIdx === 0 ? door.t : 2.4;
        const slack = Math.max(0, L / 2 - dw / 2 - 1.2);
        const c = (s.a + s.b) / 2 + (this.rng() - 0.5) * slack;
        ops.push({ c, w: dw, b: 0, t: dt });
        const outD = 1.4, inD = 1.4;
        if (key === 'n') doors.push({ out: { x: c, z: z0 - outD }, in: { x: c, z: z0 + inD } });
        if (key === 's') doors.push({ out: { x: c, z: z1 + outD }, in: { x: c, z: z1 - inD } });
        if (key === 'e') doors.push({ out: { x: x1 + outD, z: c }, in: { x: x1 - inD, z: c } });
        if (key === 'w') doors.push({ out: { x: x0 - outD, z: c }, in: { x: x0 + inD, z: c } });
      }
      if (win) {
        const n = Math.floor(L / 4.5);
        for (let i = 0; i < n; i++) {
          const c = s.a + (i + 0.5) * (L / n);
          if (c - win.w / 2 < s.a + 0.6 || c + win.w / 2 > s.b - 0.6) continue;
          if (ops.some((q) => Math.abs(q.c - c) < (q.w + win.w) / 2 + 0.6)) continue;
          if (this.rng() < 0.75) ops.push({ c, w: win.w, b: win.b, t: win.t });
        }
      }
      if (s.along === 'x') this.wallX(s.a, s.b, s.fixed, h, ops, color, t);
      else this.wallZ(s.a, s.b, s.fixed, h, ops, color, t);
    }
    this.solid(x0 - 0.25, h, z0 - 0.25, x1 + 0.25, h + 0.25, z1 + 0.25, o.roof || PAL.roof);
    this.solid(x0 + t, 0, z0 + t, x1 - t, 0.06, z1 - t, o.floor || PAL.floor, false, 0.03);

    const b = { x0, z0, x1, z1, doors, poi, h, kind: o.kind || 'house' };
    this.buildings.push(b);

    const nearDoor = (x, z, d) => doors.some((dd) => Math.hypot(dd.in.x - x, dd.in.z - z) < d);

    // interior props (cover)
    const props = o.props ?? this.ri(0, 2);
    for (let i = 0; i < props; i++) {
      const pw = this.r(1.2, 2.2), pd = this.r(0.7, 1.1), ph = this.r(0.8, 1.2);
      const px = this.r(x0 + 2.2, x1 - 2.2), pz = this.r(z0 + 2.2, z1 - 2.2);
      if (x1 - x0 < 6 || z1 - z0 < 6 || nearDoor(px, pz, 2.5)) continue;
      this.solid(px - pw / 2, 0, pz - pd / 2, px + pw / 2, ph, pz + pd / 2, 0x6b5a45);
    }
    if (o.interior) o.interior(b, nearDoor);

    // loot spots in corners / along walls
    const inset = 0.9;
    let spots = [
      [x0 + inset, z0 + inset], [x1 - inset, z0 + inset], [x0 + inset, z1 - inset], [x1 - inset, z1 - inset],
    ];
    if (x1 - x0 > 14) spots.push([cx, z0 + inset], [cx, z1 - inset]);
    if (z1 - z0 > 14) spots.push([x0 + inset, cz], [x1 - inset, cz]);
    spots = spots.filter(([x, z]) => !nearDoor(x, z, 2.6));
    for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
    const [lmin, lmax] = o.loot || [1, 2];
    const n = Math.min(spots.length, this.ri(lmin, lmax));
    const kinds = o.lootKinds || { duffel: 3, toolbox: 3, crate: 1, safe: 0.3 };
    for (let i = 0; i < n; i++) {
      const kind = o.lootList ? o.lootList[i % o.lootList.length] : this.weightedKey(kinds);
      this.lootSpots.push({ x: spots[i][0], z: spots[i][1], poi, kind, building: b });
    }
    return b;
  }

  weightedKey(table) {
    let total = 0;
    for (const k in table) total += table[k];
    let r = this.rng() * total;
    for (const k in table) { r -= table[k]; if (r <= 0) return k; }
    return Object.keys(table)[0];
  }

  outdoorLoot(poi, n, kinds) {
    for (let i = 0; i < n; i++) {
      const rc = this.place(poi, 1.4, 1.4, 1, 1.5);
      if (rc) this.lootSpots.push({ x: (rc.x0 + rc.x1) / 2, z: (rc.z0 + rc.z1) / 2, poi, kind: this.weightedKey(kinds) });
    }
  }

  buildTown(poi) {
    for (let i = 0; i < 13; i++) {
      const rc = this.place(poi, this.r(8, 12), this.r(8, 11), 3.5);
      if (rc) this.building(rc, 3.3, this.pk(PAL.house), poi, { loot: [1, 2], props: this.ri(1, 2) });
    }
    // low courtyard walls for cover
    for (let i = 0; i < 10; i++) {
      const long = this.r(4, 8), along = this.rng() < 0.5;
      const rc = this.place(poi, along ? long : 0.4, along ? 0.4 : long, 1.5, 1.5);
      if (rc) this.solid(rc.x0, 0, rc.z0, rc.x1, 1.15, rc.z1, 0xc2b08e);
    }
    this.outdoorLoot(poi, 3, { crate: 2, duffel: 1 });
  }

  buildIndustrial(poi) {
    for (let i = 0; i < 5; i++) {
      const w = this.r(18, 26), d = this.r(13, 18);
      const rc = this.place(poi, w, d, 5);
      if (!rc) continue;
      this.building(rc, 7, PAL.metal, poi, {
        kind: 'warehouse', door: { w: 5, t: 5 }, backDoor: true, win: { w: 2, b: 4.6, t: 5.8 },
        roof: 0x5d6166, floor: 0x77746c, loot: [3, 5], props: 0,
        lootKinds: { crate: 4, toolbox: 3, weapon: 1.2, duffel: 1 },
        interior: (b) => {
          const rows = Math.floor((b.z1 - b.z0 - 6) / 4);
          for (let r = 0; r < rows; r++) {
            const z = b.z0 + 4 + r * 4;
            const gapC = this.r(b.x0 + 6, b.x1 - 6);
            this.solid(b.x0 + 3, 0, z, gapC - 1.4, 2.4, z + 0.9, 0x4f5b6b);
            this.solid(gapC + 1.4, 0, z, b.x1 - 3, 2.4, z + 0.9, 0x4f5b6b);
          }
        },
      });
    }
    for (let i = 0; i < 16; i++) {
      const along = this.rng() < 0.5;
      const rc = this.place(poi, along ? 6.1 : 2.5, along ? 2.5 : 6.1, 1.2, 2);
      if (!rc) continue;
      const col = this.pk(PAL.containers);
      this.solid(rc.x0, 0, rc.z0, rc.x1, 2.6, rc.z1, col, true, 0.1);
      if (this.rng() < 0.3) this.solid(rc.x0, 2.6, rc.z0, rc.x1, 5.2, rc.z1, this.pk(PAL.containers), true, 0.1);
    }
    this.outdoorLoot(poi, 4, { crate: 3, toolbox: 1 });
  }

  buildFarm(poi) {
    for (let i = 0; i < 5; i++) {
      const rc = this.place(poi, this.r(9, 12), this.r(8, 10), 5);
      if (rc) this.building(rc, 3.2, this.pk([0xe6e0d2, 0xd9d2c0, 0xcfc4ab]), poi, { loot: [1, 2] });
    }
    for (let i = 0; i < 3; i++) {
      const rc = this.place(poi, this.r(11, 14), this.r(15, 18), 6);
      if (rc) this.building(rc, 6, PAL.barn, poi, {
        kind: 'barn', door: { w: 4, t: 4.2 }, backDoor: true, win: null, roof: 0x5a2a20,
        loot: [2, 3], lootKinds: { crate: 3, toolbox: 2, duffel: 2, weapon: 0.5 }, props: 0,
      });
    }
    for (let i = 0; i < 18; i++) {
      const rc = this.place(poi, 1.3, 1.3, 0.5, 1.5);
      if (!rc) continue;
      this.solid(rc.x0, 0, rc.z0, rc.x1, 1.2, rc.z1, 0xd8c070, true, 0.1);
      if (this.rng() < 0.3) this.solid(rc.x0 + 0.1, 1.2, rc.z0 + 0.1, rc.x1 - 0.1, 2.4, rc.z1 - 0.1, 0xd0b860, true, 0.1);
    }
    this.outdoorLoot(poi, 2, { crate: 1, duffel: 1 });
  }

  buildComms(poi) {
    for (let i = 0; i < 5; i++) {
      const rc = this.place(poi, this.r(7, 9), this.r(7, 9), 5);
      if (rc) this.building(rc, 2.9, PAL.concrete, poi, {
        kind: 'bunker', win: { w: 1.6, b: 1.5, t: 1.9 }, roof: 0x7d7d76, props: 0,
        loot: [2, 3], lootKinds: { crate: 3, weapon: 1.5, safe: 0.6, toolbox: 1 },
      });
    }
    const tw = this.place(poi, 5, 5, 3);
    if (tw) {
      const x = (tw.x0 + tw.x1) / 2, z = (tw.z0 + tw.z1) / 2, s = 1.8, H = 34;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.solid(x + sx * s - 0.2, 0, z + sz * s - 0.2, x + sx * s + 0.2, H, z + sz * s + 0.2, 0xa04030, true, 0);
      for (let y = 4; y < H; y += 4) {
        this.solid(x - s, y, z - s - 0.08, x + s, y + 0.15, z - s + 0.08, 0xb0b0b0, false, 0);
        this.solid(x - s, y, z + s - 0.08, x + s, y + 0.15, z + s + 0.08, 0xb0b0b0, false, 0);
        this.solid(x - s - 0.08, y, z - s, x - s + 0.08, y + 0.15, z + s, 0xb0b0b0, false, 0);
        this.solid(x + s - 0.08, y, z - s, x + s + 0.08, y + 0.15, z + s, 0xb0b0b0, false, 0);
      }
      this.solid(x - 0.15, H, z - 0.15, x + 0.15, H + 8, z + 0.15, 0xdddddd, false, 0);
    }
    for (let i = 0; i < 10; i++) {
      const along = this.rng() < 0.5;
      const rc = this.place(poi, along ? 3.2 : 0.9, along ? 0.9 : 3.2, 1.5, 1.5);
      if (rc) this.solid(rc.x0, 0, rc.z0, rc.x1, 0.95, rc.z1, 0x9c8a62, true, 0.1);
    }
    this.outdoorLoot(poi, 3, { crate: 3, weapon: 0.5 });
  }

  buildFort(poi) {
    const S = 46, T = 1.2, Hh = 5, G = 12;
    const wallCol = 0xa79c86;
    this.solid(-S, 0, -S, S, 0.03, S, 0x8d8579, false, 0.02);
    this.wallX(-S, S, -S + T / 2, Hh, [{ c: 0, w: G, b: 0, t: 99 }], wallCol, T);
    this.wallX(-S, S, S - T / 2, Hh, [{ c: 0, w: G, b: 0, t: 99 }], wallCol, T);
    this.wallZ(-S + T, S - T, S - T / 2, Hh, [{ c: 0, w: G, b: 0, t: 99 }], wallCol, T);
    this.wallZ(-S + T, S - T, -S + T / 2, Hh, [{ c: 0, w: G, b: 0, t: 99 }], wallCol, T);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = sx * (S - 2), z = sz * (S - 2);
      this.solid(x - 3, 0, z - 3, x + 3, 9, z + 3, 0x8f846f);
      this.solid(x - 3.4, 9, z - 3.4, x + 3.4, 9.6, z + 3.4, 0x6f6455);
    }
    // jersey barriers at gates
    for (const [gx, gz, along] of [[0, -S - 6, true], [0, S + 6, true], [S + 6, 0, false], [-S - 6, 0, false]]) {
      for (const off of [-4, 4]) {
        const x = along ? gx + off : gx + (off > 0 ? 1.5 : -1.5);
        const z = along ? gz + (off > 0 ? 1.5 : -1.5) : gz + off;
        if (along) this.solid(x - 1.4, 0, z - 0.35, x + 1.4, 0.95, z + 0.35, 0xb7b2a6);
        else this.solid(x - 0.35, 0, z - 1.4, x + 0.35, 0.95, z + 1.4, 0xb7b2a6);
      }
    }
    const fort = { x0: -S, z0: -S, x1: S, z1: S, poi, kind: 'compound', h: Hh, doors: [
      { out: { x: 0, z: -S - 2.5 }, in: { x: 0, z: -S + 2.5 } },
      { out: { x: 0, z: S + 2.5 }, in: { x: 0, z: S - 2.5 } },
      { out: { x: S + 2.5, z: 0 }, in: { x: S - 2.5, z: 0 } },
      { out: { x: -S - 2.5, z: 0 }, in: { x: -S + 2.5, z: 0 } },
    ] };
    this.buildings.push(fort);
    this.occupied.push(rect(-S - 8, -S - 8, S + 8, S + 8));

    // central HQ (boss)
    this.building(rect(-8, -8, 8, 8), 4.5, 0x9a8f7b, poi, {
      kind: 'hq', front: 'n', backDoor: true, roof: 0x5e564a, props: 2,
      loot: [4, 4], lootList: ['safe', 'weapon', 'weapon', 'crate'],
    });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = sx * 26, cz = sz * 27;
      this.building(rect(cx - 8, cz - 4.5, cx + 8, cz + 4.5), 3.6, 0xa89c84, poi, {
        kind: 'barracks', front: sx > 0 ? 'w' : 'e', roof: 0x6a5f50,
        loot: [2, 2], lootKinds: { crate: 2, weapon: 1, duffel: 1, safe: 0.3 },
      });
    }
    // sandbag cover in the yard
    for (const [x, z, along] of [[-14, -20, true], [14, -20, true], [-14, 20, true], [14, 20, true], [-20, 0, false], [20, 0, false]]) {
      if (along) this.solid(x - 2, 0, z - 0.45, x + 2, 1.0, z + 0.45, 0x9c8a62, true, 0.1);
      else this.solid(x - 0.45, 0, z - 2, x + 0.45, 1.0, z + 2, 0x9c8a62, true, 0.1);
    }
    for (const [x, z] of [[-34, -12], [34, 12], [-12, 36], [12, -36]]) this.lootSpots.push({ x, z, poi, kind: 'crate' });
  }

  hasScan(slot) { return !!(this.assets && this.assets.has(slot)); }

  // Places a scanned asset inside the footprint `rc` (already reserved), with a collider
  // that hugs the scan's scaled bounds. q = quarter turns; `along` forces the long axis.
  scanProp(slot, rc, { maxH = Infinity, along = null, fill = 1.1 } = {}) {
    const list = this.assets.forSlot(slot);
    const a = list[Math.floor(this.propRng() * list.length)];
    const [sx, sy, sz] = a.size;
    let q = Math.floor(this.propRng() * 4);
    if (along) {
      const longX = sx >= sz;
      const wantX = along === 'x';
      if ((q % 2 === 0) !== (longX === wantX)) q = (q + 1) % 4;
    }
    const fw = q % 2 ? sz : sx, fd = q % 2 ? sx : sz;
    const w = rc.x1 - rc.x0, d = rc.z1 - rc.z0;
    const s = Math.min((w / fw) * fill, (d / fd) * fill, maxH / sy);
    const cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2;
    this.props.push({ a, x: cx, z: cz, s, yaw: q * Math.PI / 2 });
    const hx = fw * s * 0.42, hz = fd * s * 0.42;
    this.addCollider({ min: [cx - hx, 0, cz - hz], max: [cx + hx, sy * s * 0.92, cz + hz] });
  }

  buildCars() {
    for (let i = 0; i < 40; i++) {
      const road = this.pk(this.roads);
      const horiz = road.x1 - road.x0 > road.z1 - road.z0;
      const x = horiz ? this.r(road.x0 + 20, road.x1 - 20) : this.r(road.x0 + 2, road.x1 - 2);
      const z = horiz ? this.r(road.z0 + 2, road.z1 - 2) : this.r(road.z0 + 20, road.z1 - 20);
      const L = 4.4, Wd = 1.9;
      const rc = horiz ? rect(x - L / 2, z - Wd / 2, x + L / 2, z + Wd / 2) : rect(x - Wd / 2, z - L / 2, x + Wd / 2, z + L / 2);
      if (this.occupied.some((o) => overlap(rc, o, 2))) continue;
      this.occupied.push(rc);
      const col = this.pk(PAL.cars);
      if (this.hasScan('car')) { this.scanProp('car', rc, { along: horiz ? 'x' : 'z', fill: 1.0 }); continue; }
      this.solid(rc.x0, 0.3, rc.z0, rc.x1, 1.1, rc.z1, col, true, 0.15);
      const sh = 0.6;
      if (horiz) this.solid(x - L / 2 + 1.0, 1.1, z - Wd / 2 + 0.12, x + L / 2 - 1.3, 1.1 + sh, z + Wd / 2 - 0.12, col, true, 0.15);
      else this.solid(x - Wd / 2 + 0.12, 1.1, z - L / 2 + 1.0, x + Wd / 2 - 0.12, 1.1 + sh, z + L / 2 - 1.3, col, true, 0.15);
      // wheels
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const wx = horiz ? x + a * 1.4 : x + a * 0.85, wz = horiz ? z + b * 0.85 : z + b * 1.4;
        this.solid(wx - 0.35, 0, wz - 0.35, wx + 0.35, 0.6, wz + 0.35, 0x1d1d1d, false, 0);
      }
    }
  }

  buildRocks() {
    for (let i = 0; i < 90; i++) {
      const x = this.r(-this.H + 20, this.H - 20), z = this.r(-this.H + 20, this.H - 20);
      const w = this.r(1.5, 5), d = this.r(1.5, 5), h = this.r(1, 3.4);
      const rc = rect(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
      if (!this.freeRect(rc, 3, 3)) continue;
      this.occupied.push(rc);
      const stacked = this.rng() < 0.5;
      const top = stacked ? h + this.r(0.5, 1.5) : h;
      if (this.hasScan('rock')) { this.scanProp('rock', rc, { maxH: top * 1.2 }); continue; }
      this.solid(rc.x0, 0, rc.z0, rc.x1, h, rc.z1, PAL.rock, true, 0.12);
      if (stacked) this.solid(rc.x0 + w * 0.2, h, rc.z0 + d * 0.15, rc.x1 - w * 0.25, top, rc.z1 - d * 0.3, PAL.rock, true, 0.12);
    }
  }

  buildTrees() {
    for (let i = 0; i < 420; i++) {
      const x = this.r(-this.H + 12, this.H - 12), z = this.r(-this.H + 12, this.H - 12);
      const rc = rect(x - 1.2, z - 1.2, x + 1.2, z + 1.2);
      if (!this.freeRect(rc, 1, 3)) continue;
      this.occupied.push(rect(x - 0.4, z - 0.4, x + 0.4, z + 0.4));
      const s = this.r(0.8, 1.35);
      this.treePts.push({ x, z, s });
      this.solid(x - 0.22 * s, 0, z - 0.22 * s, x + 0.22 * s, 2.4 * s, z + 0.22 * s, 0x5a4330, true, 0.1);
    }
  }

  buildCliffs() {
    const H = this.H;
    for (const side of [0, 1, 2, 3]) {
      let a = -H - 40;
      while (a < H + 40) {
        const len = this.r(18, 36), depth = this.r(10, 22), hgt = this.r(10, 26);
        const b = a + len;
        if (side === 0) this.solid(a, 0, -H - depth, b, hgt, -H, PAL.cliff, true, 0.1);
        if (side === 1) this.solid(a, 0, H, b, hgt, H + depth, PAL.cliff, true, 0.1);
        if (side === 2) this.solid(-H - depth, 0, a, -H, hgt, b, PAL.cliff, true, 0.1);
        if (side === 3) this.solid(H, 0, a, H + depth, hgt, b, PAL.cliff, true, 0.1);
        a = b - 2;
      }
    }
  }

  build() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1100, 1100),
      new THREE.MeshLambertMaterial({ color: 0xffffff, map: groundTexture() }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const mesh = this.batch.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.staticMesh = mesh;
    this.batch = null;

    for (const p of this.props) {
      const o = this.assets.instance(p.a, p.s, p.yaw);
      o.position.set(p.x, 0, p.z);
      this.scene.add(o);
    }
    if (this.hasScan('tree')) {
      // scanned trees: scale each to the placeholder's height (~7.8 m at s = 1)
      for (const tp of this.treePts) {
        const list = this.assets.forSlot('tree');
        const a = list[Math.floor(this.propRng() * list.length)];
        const o = this.assets.instance(a, (7.8 * tp.s) / a.size[1], this.propRng() * Math.PI * 2);
        o.position.set(tp.x, 0, tp.z);
        this.scene.add(o);
      }
      return;
    }

    const n = this.treePts.length;
    const cone1 = new THREE.ConeGeometry(2.3, 4.6, 7);
    const cone2 = new THREE.ConeGeometry(1.6, 3.4, 7);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const t1 = new THREE.InstancedMesh(cone1, mat, n);
    const t2 = new THREE.InstancedMesh(cone2, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    const rng = mulberry32(99);
    this.treePts.forEach((tp, i) => {
      sc.set(tp.s, tp.s, tp.s);
      p.set(tp.x, (2.2 + 2.3) * tp.s, tp.z); m.compose(p, q, sc); t1.setMatrixAt(i, m);
      p.set(tp.x, (2.2 + 4.6) * tp.s, tp.z); m.compose(p, q, sc); t2.setMatrixAt(i, m);
      col.setHSL(0.24 + rng() * 0.06, 0.32 + rng() * 0.15, 0.24 + rng() * 0.08);
      t1.setColorAt(i, col); t2.setColorAt(i, col);
    });
    for (const t of [t1, t2]) { t.castShadow = true; t.receiveShadow = true; this.scene.add(t); }
  }

  // Top-down map image (for minimap + tactical map).
  renderMap(px = 1024) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const g = cv.getContext('2d');
    const H = this.H, s = px / (2 * H);
    const X = (x) => (x + H) * s, Z = (z) => (z + H) * s;
    g.fillStyle = '#a8946c'; g.fillRect(0, 0, px, px);
    g.fillStyle = 'rgba(0,0,0,0.06)';
    for (let i = 0; i < 1400; i++) g.fillRect(Math.random() * px, Math.random() * px, 3, 3);
    g.fillStyle = '#55524b';
    for (const r of this.roads) g.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
    g.fillStyle = '#4f6b35';
    for (const t of this.treePts) { g.beginPath(); g.arc(X(t.x), Z(t.z), 2.2 * t.s * s, 0, 7); g.fill(); }
    for (const b of this.buildings) {
      if (b.kind === 'compound') { g.fillStyle = 'rgba(80,70,60,0.25)'; }
      else g.fillStyle = '#7d705e';
      g.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
    }
    g.fillStyle = '#3d3830';
    for (const c of this.colliders) {
      if (c.max[1] < 0.9 || c.max[1] - c.min[1] > 40) continue;
      if (Math.abs(c.min[0]) > H || Math.abs(c.min[2]) > H) continue;
      g.fillRect(X(c.min[0]), Z(c.min[2]), Math.max(1, (c.max[0] - c.min[0]) * s), Math.max(1, (c.max[2] - c.min[2]) * s));
    }
    g.fillStyle = '#6a5a44';
    g.fillRect(0, 0, px, 2); g.fillRect(0, px - 2, px, 2); g.fillRect(0, 0, 2, px); g.fillRect(px - 2, 0, 2, px);
    return cv;
  }
}

function groundTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#b8a27a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? `rgba(90,70,40,${Math.random() * 0.12})` : `rgba(240,225,190,${Math.random() * 0.12})`;
    const s = Math.random() * 4 + 1;
    g.fillRect(Math.random() * 256, Math.random() * 256, s, s);
  }
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(100,110,60,${Math.random() * 0.15})`;
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, Math.random() * 6 + 2, 0, 7); g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(90, 90);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
