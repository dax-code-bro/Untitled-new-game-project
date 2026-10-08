// Man-made structures: every point of interest is built here from merged boxes/cylinders
// (one draw call for all of them) with matching colliders in the physics world.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { POIS } from './terrain.js';

const _c = new THREE.Color();
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const FACES = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
];

// Merges boxes and arbitrary geometries into one vertex-colored mesh, positioned relative to an origin
// (keeps float precision good far from the map center).
export class Batcher {
  constructor(ox = 0, oz = 0) { this.ox = ox; this.oz = oz; this.pos = []; this.nor = []; this.col = []; this.idx = []; this.n = 0; }
  box(x0, y0, z0, x1, y1, z1, color, tint = 0.06, rng = Math.random) {
    _c.set(color);
    const k = 1 + (rng() - 0.5) * 2 * tint;
    const r = _c.r * k, g = _c.g * k, b = _c.b * k;
    const c = [(x0 + x1) / 2 - this.ox, (y0 + y1) / 2, (z0 + z1) / 2 - this.oz];
    const e = [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2];
    for (const f of FACES) {
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
  geometry(geo, matrix, color, tint = 0.05, rng = Math.random) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position, nrm = g.attributes.normal;
    const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(matrix);
    _c.set(color);
    const k = 1 + (rng() - 0.5) * 2 * tint;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.pos.push(v.x - this.ox, v.y, v.z - this.oz);
      v.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize();
      this.nor.push(v.x, v.y, v.z);
      this.col.push(_c.r * k, _c.g * k, _c.b * k);
      this.idx.push(this.n++);
    }
  }
  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.position.set(this.ox, 0, this.oz);
    return m;
  }
}

const PAL = {
  concrete: 0x9b9a92, metal: 0x7d848b, rust: 0x8a5a3a, wood: 0x7a5a3a, darkwood: 0x4f3a26, stone: 0x8f8a7c,
  mossy: 0x6f7a5a, roof: 0x5d544a, white: 0xd8d8d2, red: 0xa33a2a, sandstone: 0xc7a777, canvas: 0x6f6a4a,
};

// Builds one POI into its own batch. Loot spots and interactables are reported back.
class POIBuilder {
  constructor(poi, physics) {
    this.poi = poi;
    this.physics = physics;
    this.b = new Batcher(poi.x, poi.z);
    this.rng = mulberry32(Math.floor(poi.x * 13 + poi.z * 7) >>> 0);
    this.y = poi.h;
    this.loot = [];
    this.buildings = [];
    this.lights = [];
  }
  r(a, b) { return a + this.rng() * (b - a); }
  ri(a, b) { return Math.floor(this.r(a, b + 1)); }
  pk(a) { return a[Math.floor(this.rng() * a.length)]; }

  // local coords relative to POI center; y relative to pad height
  solid(x0, y0, z0, x1, y1, z1, color, collide = true, tint = 0.06) {
    const P = this.poi, Y = this.y;
    this.b.box(P.x + x0, Y + y0, P.z + z0, P.x + x1, Y + y1, P.z + z1, color, tint, this.rng);
    if (collide) this.physics.addBox([P.x + x0, Y + y0, P.z + z0], [P.x + x1, Y + y1, P.z + z1]);
  }

  cyl(x, z, r, h, color, y0 = 0, collide = true, seg = 12) {
    const P = this.poi;
    const m = new THREE.Matrix4().makeTranslation(P.x + x, this.y + y0 + h / 2, P.z + z);
    this.b.geometry(new THREE.CylinderGeometry(r, r, h, seg), m, color, 0.04, this.rng);
    if (collide) this.physics.addBox([P.x + x - r * 0.85, this.y + y0, P.z + z - r * 0.85], [P.x + x + r * 0.85, this.y + y0 + h, P.z + z + r * 0.85]);
  }

  wallX(a, b, z, h, ops, col, t = 0.35, y0 = 0) {
    let cur = a;
    ops.sort((p, q) => p.c - q.c);
    for (const o of ops) {
      const oa = o.c - o.w / 2, ob = o.c + o.w / 2;
      if (oa > cur) this.solid(cur, y0, z - t / 2, oa, y0 + h, z + t / 2, col);
      if (o.b > 0) this.solid(oa, y0, z - t / 2, ob, y0 + o.b, z + t / 2, col);
      if (o.t < h) this.solid(oa, y0 + o.t, z - t / 2, ob, y0 + h, z + t / 2, col);
      cur = ob;
    }
    if (cur < b) this.solid(cur, y0, z - t / 2, b, y0 + h, z + t / 2, col);
  }

  wallZ(a, b, x, h, ops, col, t = 0.35, y0 = 0) {
    let cur = a;
    ops.sort((p, q) => p.c - q.c);
    for (const o of ops) {
      const oa = o.c - o.w / 2, ob = o.c + o.w / 2;
      if (oa > cur) this.solid(x - t / 2, y0, cur, x + t / 2, y0 + h, oa, col);
      if (o.b > 0) this.solid(x - t / 2, y0, oa, x + t / 2, y0 + o.b, ob, col);
      if (o.t < h) this.solid(x - t / 2, y0 + o.t, oa, x + t / 2, y0 + h, ob, col);
      cur = ob;
    }
    if (cur < b) this.solid(x - t / 2, y0, cur, x + t / 2, y0 + h, b, col);
  }

  // A single-storey building centered at (cx, cz). Door faces the POI center.
  house(cx, cz, w, d, h, color, o = {}) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, t = 0.35, y0 = o.y0 || 0;
    const door = o.door || { w: 1.6, t: 2.4 };
    const win = o.win === undefined ? { w: 1.2, b: 1.0, t: 2.0 } : o.win;
    const front = o.front || (Math.abs(cx) > Math.abs(cz) ? (cx > 0 ? 'w' : 'e') : (cz > 0 ? 'n' : 's'));
    const sides = {
      n: { a: x0, b: x1, f: z0 + t / 2, ax: 'x' }, s: { a: x0, b: x1, f: z1 - t / 2, ax: 'x' },
      e: { a: z0 + t, b: z1 - t, f: x1 - t / 2, ax: 'z' }, w: { a: z0 + t, b: z1 - t, f: x0 + t / 2, ax: 'z' },
    };
    for (const k of ['n', 's', 'e', 'w']) {
      const s = sides[k], L = s.b - s.a, ops = [];
      if (k === front) ops.push({ c: (s.a + s.b) / 2, w: door.w, b: 0, t: door.t });
      if (win) {
        const n = Math.floor(L / 4);
        for (let i = 0; i < n; i++) {
          const c = s.a + (i + 0.5) * (L / n);
          if (ops.some((q) => Math.abs(q.c - c) < (q.w + win.w) / 2 + 0.5)) continue;
          if (c - win.w / 2 > s.a + 0.5 && c + win.w / 2 < s.b - 0.5) ops.push({ c, w: win.w, b: win.b, t: win.t });
        }
      }
      if (s.ax === 'x') this.wallX(s.a, s.b, s.f, h, ops, color, t, y0); else this.wallZ(s.a, s.b, s.f, h, ops, color, t, y0);
    }
    if (o.roof !== false) this.solid(x0 - 0.3, y0 + h, z0 - 0.3, x1 + 0.3, y0 + h + 0.3, z1 + 0.3, o.roofColor || PAL.roof);
    this.solid(x0 + t, y0, z0 + t, x1 - t, y0 + 0.05, z1 - t, o.floor || 0x6e6253, false);
    // loot in the back corners
    const n = o.loot ?? this.ri(1, 2);
    const spots = [[x0 + 0.9, z0 + 0.9], [x1 - 0.9, z0 + 0.9], [x0 + 0.9, z1 - 0.9], [x1 - 0.9, z1 - 0.9]];
    for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
    for (let i = 0; i < Math.min(n, spots.length); i++) this.lootAt(spots[i][0], spots[i][1], o.table, y0);
    this.buildings.push({ x0: this.poi.x + x0, z0: this.poi.z + z0, x1: this.poi.x + x1, z1: this.poi.z + z1 });
  }

  lootAt(x, z, table, y = 0) {
    this.loot.push({ x: this.poi.x + x, y: this.y + y, z: this.poi.z + z, table: table || this.defaultTable() });
  }

  defaultTable() {
    const r = this.poi.region;
    return r === 'n' ? 'arctic' : this.rng() < 0.35 ? 'military' : 'common';
  }

  // non-overlapping random placement inside the pad
  spots(n, minGap, rad = this.poi.r - 8) {
    const out = [];
    for (let i = 0; i < n * 40 && out.length < n; i++) {
      const a = this.rng() * Math.PI * 2, rr = rad * Math.sqrt(this.rng());
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (out.every((p) => Math.hypot(p[0] - x, p[1] - z) > minGap)) out.push([x, z]);
    }
    return out;
  }

  build() {
    const k = this.poi.kind;
    if (this[k]) this[k]();
    const mesh = this.b.build(this.physics.structMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // ---------------------------------------------------------------- layouts
  pob() {
    // concrete apron around the printer; the printer itself is built by POB (pob.js)
    this.solid(-16, -0.6, -16, 16, 0.08, 16, PAL.concrete, false, 0.02);
    for (const [x, z] of [[-24, -10], [24, -10], [-24, 14], [24, 14]]) {
      this.house(x, z, 8, 6, 3, PAL.metal, { roofColor: 0x4a4f55, loot: 1, table: 'common', front: x < 0 ? 'e' : 'w' });
    }
    for (const [x, z] of [[-34, 0], [34, 0], [0, -34], [0, 34]]) this.cyl(x, z, 0.12, 7, 0x333333, 0, false, 6); // lamp posts
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const x = Math.cos(a) * 46, z = Math.sin(a) * 46;
      this.solid(x - 1.5, 0, z - 0.45, x + 1.5, 1.0, z + 0.45, 0x9c8a62, true, 0.1);
    }
  }

  extract() {
    this.solid(-9, -0.8, -9, 9, 0.15, 9, 0x55585c, true, 0.02);
    this.solid(-6, 0.15, -0.3, 6, 0.18, 0.3, 0xeeeeee, false, 0); // H
    this.solid(-6, 0.15, -4, -5, 0.18, 4, 0xeeeeee, false, 0);
    this.solid(5, 0.15, -4, 6, 0.18, 4, 0xeeeeee, false, 0);
    this.house(-14, 6, 5, 4, 2.6, PAL.white, { loot: 2, table: 'arctic', front: 'e', win: null });
    this.cyl(12, -8, 0.15, 9, 0x333333, 0, false, 6);
  }

  outpost() {
    for (const [x, z] of this.spots(this.ri(3, 5), 15)) {
      const along = this.rng() < 0.5;
      this.house(x, z, along ? 10 : 6.5, along ? 6.5 : 10, 3, this.poi.region === 'n' ? PAL.white : PAL.metal,
        { roofColor: this.poi.region === 'n' ? 0xe8eef3 : 0x4a4f55, loot: this.ri(1, 3) });
    }
    const [mx, mz] = this.spots(1, 1, 10)[0] || [0, 0];
    this.cyl(mx, mz, 0.25, 22, 0xa04030, 0, true, 6);
    for (const [x, z] of this.spots(6, 8)) this.solid(x - 1.6, 0, z - 0.45, x + 1.6, 1, z + 0.45, 0x9c8a62, true, 0.1);
  }

  depot() {
    for (const [x, z] of this.spots(2, 28, this.poi.r - 16)) {
      this.house(x, z, 22, 14, 7, PAL.metal, { door: { w: 5, t: 5 }, win: { w: 2, b: 4.6, t: 5.8 }, roofColor: 0x5d6166, loot: this.ri(3, 4), table: 'arctic' });
    }
    for (const [x, z] of this.spots(8, 7)) {
      const along = this.rng() < 0.5, col = this.pk([0xa33a2a, 0x2a5a8a, 0x3f7a3a, 0xc27c2a]);
      this.solid(x - (along ? 3 : 1.25), 0, z - (along ? 1.25 : 3), x + (along ? 3 : 1.25), 2.6, z + (along ? 1.25 : 3), col, true, 0.1);
    }
  }

  airfield() {
    this.solid(-95, -0.5, -12, 95, 0.1, 12, 0x3c3b38, false, 0.02);
    for (let x = -88; x < 88; x += 12) this.solid(x, 0.1, -0.3, x + 6, 0.12, 0.3, 0xe8e2c0, false, 0);
    for (const x of [-45, 0]) {
      // hangar: open on the runway side
      this.solid(x - 15, 0, 22, x + 15, 10, 22.6, PAL.metal);
      this.solid(x - 15, 0, 22.6, x - 14.4, 10, 48, PAL.metal);
      this.solid(x + 14.4, 0, 22.6, x + 15, 10, 48, PAL.metal);
      this.solid(x - 15, 0, 47.4, x + 15, 10, 48, PAL.metal);
      this.solid(x - 15.3, 10, 21.7, x + 15.3, 10.5, 48.3, 0x5d6166);
      this.lootAt(x - 12, 45, 'military'); this.lootAt(x + 12, 45, 'military');
    }
    // control tower
    this.solid(45, 0, 25, 51, 13, 31, PAL.concrete);
    this.solid(44, 13, 24, 52, 16, 32, 0x2f3d4a);
    this.solid(43.5, 16, 23.5, 52.5, 16.4, 32.5, PAL.roof);
    // a parked cargo plane for cover
    this.solid(-30, 1, -40, 8, 5, -34, 0xcfcfc8);
    this.solid(-14, 3.5, -56, -10, 4.2, -18, 0xbfbfb8);
    this.lootAt(-20, -32, 'military');
    for (const [x, z] of this.spots(4, 20)) if (Math.abs(z) > 16) this.house(x, z, 7, 6, 3, PAL.sandstone, { loot: 1 });
  }

  industrial() {
    for (const [x, z] of this.spots(5, 16, this.poi.r - 14)) {
      const r = this.r(4, 7);
      this.cyl(x, z, r, this.r(6, 12), this.pk([0xbdb8ac, 0x9a958a, PAL.rust]), 0, true, 18);
    }
    for (const [x, z] of this.spots(2, 30, this.poi.r - 18)) this.house(x, z, 18, 12, 6, PAL.rust, { door: { w: 4, t: 4.5 }, win: { w: 2, b: 3.8, t: 5 }, loot: 3 });
    for (let i = 0; i < 6; i++) { const x = this.r(-40, 40); this.cyl(x, this.r(-40, 40), 0.4, 3, 0x5a5a5a, 0, true, 8); }
  }

  village() {
    const huts = this.ri(5, 8);
    const jungle = this.poi.region === 'e';
    for (const [x, z] of this.spots(huts, 13)) {
      const w = this.r(6, 9), d = this.r(5, 8);
      if (jungle) {
        // stilt hut
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.solid(x + sx * (w / 2 - 0.3) - 0.15, 0, z + sz * (d / 2 - 0.3) - 0.15, x + sx * (w / 2 - 0.3) + 0.15, 1.5, z + sz * (d / 2 - 0.3) + 0.15, PAL.darkwood);
        this.solid(x - w / 2, 1.5, z - d / 2, x + w / 2, 1.7, z + d / 2, PAL.wood);
        this.b.box(this.poi.x + x - w / 2 - 0.4, this.y + 4.2, this.poi.z + z - d / 2 - 0.4, this.poi.x + x + w / 2 + 0.4, this.y + 4.6, this.poi.z + z + d / 2 + 0.4, 0x8a7a3a, 0.1, this.rng);
        this.physics.addBox([this.poi.x + x - w / 2 - 0.4, this.y + 4.2, this.poi.z + z - d / 2 - 0.4], [this.poi.x + x + w / 2 + 0.4, this.y + 4.6, this.poi.z + z + d / 2 + 0.4]);
        for (const [sx, sz] of [[-1, -1], [1, 1]]) this.solid(x + sx * (w / 2) - 0.12, 1.7, z + sz * (d / 2) - 0.12, x + sx * (w / 2) + 0.12, 4.2, z + sz * (d / 2) + 0.12, PAL.darkwood);
        this.solid(x - w / 2 - 0.1, 1.5, z - 1.2, x - w / 2 + 1.2, 1.7, z + 1.2, PAL.wood); // landing (step up from a crate-height)
        this.solid(x - w / 2 - 1.4, 0, z - 0.7, x - w / 2 - 0.1, 0.75, z + 0.7, PAL.wood);
        this.loot.push({ x: this.poi.x + x + w / 4, y: this.y + 1.7, z: this.poi.z + z, table: this.defaultTable() });
      } else {
        this.house(x, z, w, d, 3, this.poi.region === 'w' ? PAL.sandstone : PAL.wood, { roofColor: this.poi.region === 'w' ? 0xb09060 : 0x5a4030 });
      }
    }
    if (this.poi.region === 'w') {
      // the well that names the place
      this.cyl(0, 0, 2, 0.9, PAL.stone, 0, true, 14);
      this.lootAt(3, 3, 'common');
    }
  }

  ruins() {
    // stepped temple
    for (let i = 0; i < 5; i++) { const s = 18 - i * 3.2; this.solid(-s, i * 2.2, -s, s, (i + 1) * 2.2, s, i % 2 ? PAL.mossy : PAL.stone, true, 0.08); }
    this.house(0, 0, 6, 6, 3, PAL.mossy, { y0: 11, front: 's', win: null, loot: 2, table: 'military' });
    // staircase up the south face (0.44 m steps)
    for (let i = 0; i < 25; i++) { const zf = 22 - i * 0.67; this.solid(-2, 0, zf - 0.67, 2, (i + 1) * 0.44, zf, PAL.stone, true, 0.05); }
    for (const [x, z] of this.spots(14, 6, this.poi.r - 6)) {
      if (Math.abs(x) < 20 && Math.abs(z) < 20) continue;
      const h = this.r(1, 5), along = this.rng() < 0.5;
      this.solid(x - (along ? 3 : 0.5), 0, z - (along ? 0.5 : 3), x + (along ? 3 : 0.5), h, z + (along ? 0.5 : 3), this.pk([PAL.stone, PAL.mossy]), true, 0.1);
    }
    for (const [x, z] of this.spots(6, 12)) if (Math.abs(x) > 20 || Math.abs(z) > 20) this.cyl(x, z, 0.7, this.r(3, 7), PAL.stone, 0, true, 8);
    this.lootAt(-21, 0, 'military'); this.lootAt(21, 5, 'common');
  }

  lodge() {
    this.house(0, 0, 20, 12, 4.5, PAL.darkwood, { roofColor: 0x3a2a1c, loot: 3, front: 's' });
    for (const [x, z] of this.spots(4, 14)) if (Math.hypot(x, z) > 16) this.house(x, z, 6, 5, 2.8, PAL.wood, { loot: 1 });
    for (const [x, z] of this.spots(3, 10)) if (Math.hypot(x, z) > 14) this.solid(x - 1, 0, z - 1, x + 1, 1.2, z + 1, 0x6e5232);
  }

  camp() {
    for (const [x, z] of this.spots(this.ri(4, 6), 9)) {
      // tents: two slanted boxes approximated by a low box + ridge
      this.solid(x - 1.6, 0, z - 1.2, x + 1.6, 1.2, z + 1.2, PAL.canvas, true, 0.12);
      this.solid(x - 1.6, 1.2, z - 0.5, x + 1.6, 1.9, z + 0.5, PAL.canvas, true, 0.12);
      if (this.rng() < 0.6) this.lootAt(x + 2.2, z, 'common');
    }
    this.cyl(0, 0, 1.1, 0.3, 0x3a3a3a, 0, false, 10); // fire pit
    // a fixed hunting stand
    const [hx, hz] = this.spots(1, 1, 18)[0] || [12, 12];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.solid(hx + sx * 1 - 0.1, 0, hz + sz * 1 - 0.1, hx + sx * 1 + 0.1, 4.5, hz + sz * 1 + 0.1, PAL.darkwood);
    this.solid(hx - 1.2, 4.5, hz - 1.2, hx + 1.2, 4.7, hz + 1.2, PAL.wood);
    this.physics.addBox([this.poi.x + hx - 1.35, this.y, this.poi.z + hz + 1.0], [this.poi.x + hx - 0.65, this.y + 4.7, this.poi.z + hz + 1.4], { ladder: true });
    this.b.box(this.poi.x + hx - 1.3, this.y, this.poi.z + hz + 1.15, this.poi.x + hx - 0.7, this.y + 4.6, this.poi.z + hz + 1.25, PAL.wood, 0.05, this.rng);
    this.loot.push({ x: this.poi.x + hx, y: this.y + 4.7, z: this.poi.z + hz, table: 'military' });
  }

  wreck() {
    // a beached cargo ship hull in pieces
    this.solid(-30, 0, -6, 18, 7, -5.4, PAL.rust);
    this.solid(-30, 0, 5.4, 18, 7, 6, PAL.rust);
    this.solid(-30, 0, -6, -29.4, 7, 6, PAL.rust);
    this.solid(-29, 0, -5.4, 17, 0.4, 5.4, 0x5a4a3a);
    this.solid(10, 7, -6, 18, 12, 6, 0xd8d8d0);
    for (let i = 0; i < 6; i++) this.lootAt(this.r(-26, 14), this.r(-4, 4), this.rng() < 0.5 ? 'military' : 'common');
    for (const [x, z] of this.spots(6, 8)) if (Math.abs(z) > 9) this.solid(x - 1.25, 0, z - 3, x + 1.25, 2.6, z + 3, this.pk([0xa33a2a, 0x2a5a8a, 0xc27c2a]), true, 0.1);
  }

  lighthouse() {
    this.cyl(0, 0, 3.2, 26, 0xf2f2ee, 0, true, 16);
    this.cyl(0, 0, 3.6, 1, 0xa33a2a, 8, false, 16);
    this.cyl(0, 0, 3.6, 1, 0xa33a2a, 17, false, 16);
    this.cyl(0, 0, 2.2, 3, 0x2f3d4a, 26, false, 12);
    this.house(10, 6, 7, 6, 3, PAL.white, { roofColor: 0xa33a2a, loot: 2 });
  }
}

export function buildStructures(scene, physics) {
  physics.structMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const out = { loot: [], buildings: [], meshes: [] };
  for (const poi of POIS) {
    const pb = new POIBuilder(poi, physics);
    const mesh = pb.build();
    scene.add(mesh);
    out.meshes.push(mesh);
    out.loot.push(...pb.loot);
    out.buildings.push(...pb.buildings);
  }
  return out;
}
