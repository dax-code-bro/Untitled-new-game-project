// Spatial hash of static colliders: boxes (buildings), circles (trunks, poles),
// and bridge decks (walkable/drivable surfaces above the terrain).
import { distToSeg, lerp } from '../util.js';

const CELL = 32;
const key = (i, j) => i * 73856093 ^ j * 19349663;

export class CollisionWorld {
  constructor(hm) {
    this.hm = hm;
    this.cells = new Map();
    this.boxes = [];
  }
  _insert(minX, minZ, maxX, maxZ, item) {
    const i0 = Math.floor(minX / CELL), i1 = Math.floor(maxX / CELL);
    const j0 = Math.floor(minZ / CELL), j1 = Math.floor(maxZ / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j);
      let c = this.cells.get(k);
      if (!c) this.cells.set(k, (c = []));
      c.push(item);
    }
  }
  addBox(minX, minZ, maxX, maxZ, y0, y1, data) {
    const b = { t: 0, minX, minZ, maxX, maxZ, y0, y1, data };
    this.boxes.push(b);
    this._insert(minX, minZ, maxX, maxZ, b);
    return b;
  }
  addCircle(x, z, r) { this._insert(x - r, z - r, x + r, z + r, { t: 1, x, z, r }); }
  addBridge(b) {
    this._insert(Math.min(b.ax, b.bx) - b.hw, Math.min(b.az, b.bz) - b.hw, Math.max(b.ax, b.bx) + b.hw, Math.max(b.az, b.bz) + b.hw, { t: 2, ...b });
  }
  query(x, z, r, fn) {
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const c = this.cells.get(key(i, j));
      if (!c) continue;
      for (const it of c) { if (!seen.has(it)) { seen.add(it); fn(it); } }
    }
  }

  // Ground height under (x,z) for something currently at height y.
  surface(x, z, y) {
    let h = this.hm.height(x, z);
    this.query(x, z, 1, (it) => {
      if (it.t === 2) {
        const r = distToSeg(x, z, it.ax, it.az, it.bx, it.bz);
        if (r.d < it.hw) {
          const dy = lerp(it.ya, it.yb, r.t) + 0.1;
          if (dy > h && dy < y + 1.6) h = dy;
        }
      } else if (it.t === 0 && it.data && it.data.walkable) {
        if (x > it.minX && x < it.maxX && z > it.minZ && z < it.maxZ && it.y1 < y + 0.6 && it.y1 > h) h = it.y1;
      }
    });
    return h;
  }

  // Push a circle (x,z,r) at height range [y, y+height] out of colliders.
  // Returns {x, z, hit, nx, nz}
  resolve(x, z, r, y, height, out = {}) {
    out.hit = false; out.nx = 0; out.nz = 0;
    for (let iter = 0; iter < 2; iter++) {
      this.query(x, z, r + 1, (it) => {
        if (it.t === 0) {
          if (y + height < it.y0 || y > it.y1 - 0.4) return;
          const cx = Math.max(it.minX, Math.min(x, it.maxX)), cz = Math.max(it.minZ, Math.min(z, it.maxZ));
          let dx = x - cx, dz = z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) return;
          if (d2 < 1e-6) {
            // centre inside the box: push out along the shortest axis
            const l = x - it.minX, rr = it.maxX - x, t = z - it.minZ, b = it.maxZ - z;
            const m = Math.min(l, rr, t, b);
            if (m === l) { x = it.minX - r; dx = -1; dz = 0; } else if (m === rr) { x = it.maxX + r; dx = 1; dz = 0; }
            else if (m === t) { z = it.minZ - r; dx = 0; dz = -1; } else { z = it.maxZ + r; dx = 0; dz = 1; }
          } else {
            const d = Math.sqrt(d2);
            dx /= d; dz /= d;
            x = cx + dx * r; z = cz + dz * r;
          }
          out.hit = true; out.nx = dx; out.nz = dz;
        } else if (it.t === 1) {
          let dx = x - it.x, dz = z - it.z;
          const d = Math.hypot(dx, dz), R = r + it.r;
          if (d >= R || d < 1e-6) return;
          dx /= d; dz /= d;
          x = it.x + dx * R; z = it.z + dz * R;
          out.hit = true; out.nx = dx; out.nz = dz;
        }
      });
    }
    out.x = x; out.z = z;
    return out;
  }

  // Segment vs boxes (for the camera). Returns fraction 0..1 of first hit.
  raycast(ax, ay, az, bx, by, bz) {
    let best = 1;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / CELL));
    const visited = new Set();
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.query(ax + dx * t, az + dz * t, 2, (it) => {
        if (it.t !== 0 || visited.has(it) || (it.data && it.data.walkable)) return;
        visited.add(it);
        let t0 = 0, t1 = 1;
        const slab = (o, d, mn, mx) => {
          if (Math.abs(d) < 1e-8) return o >= mn && o <= mx;
          let a = (mn - o) / d, b = (mx - o) / d;
          if (a > b) [a, b] = [b, a];
          t0 = Math.max(t0, a); t1 = Math.min(t1, b);
          return t0 <= t1;
        };
        if (slab(ax, dx, it.minX, it.maxX) && slab(ay, dy, it.y0, it.y1) && slab(az, dz, it.minZ, it.maxZ)) best = Math.min(best, t0);
      });
    }
    return best;
  }
}
