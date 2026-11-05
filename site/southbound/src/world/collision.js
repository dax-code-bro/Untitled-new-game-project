// Spatial hash of static colliders: boxes (buildings), circles (trunks, poles),
// and bridge decks (walkable/drivable surfaces above the terrain).
import { distToSeg, lerp } from '../util.js';
import { CITY, TOWN } from './layout.js';

const CELL = 32;
const key = (i, j) => i * 73856093 ^ j * 19349663;

export class CollisionWorld {
  constructor(hm) {
    this.hm = hm;
    this.cells = new Map();
    this.boxes = [];
    this.terrainCell = 0;
  }
  // Height of the terrain exactly as the terrain mesh draws it (its triangles,
  // not the bilinear heightmap), so feet and tyres sit on the visible ground.
  terrainY(x, z) {
    const c = this.terrainCell, hm = this.hm;
    if (!c) return hm.height(x, z);
    const half = hm.half;
    const u = (x + half) / c, v = (z + half) / c;
    const i = Math.floor(u), j = Math.floor(v), fx = u - i, fz = v - j;
    const x0 = -half + i * c, z0 = -half + j * c;
    if (fx + fz <= 1) {
      const ha = hm.height(x0, z0), hb = hm.height(x0 + c, z0), hc = hm.height(x0, z0 + c);
      return ha + (hb - ha) * fx + (hc - ha) * fz;
    }
    const hd = hm.height(x0 + c, z0 + c), hb = hm.height(x0 + c, z0), hc = hm.height(x0, z0 + c);
    return hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz);
  }
  // City/town paving: streets (+0.10), curb rim (+0.18), sidewalk slabs (+0.22)
  paved(x, z) {
    for (const G of [CITY, TOWN]) {
      const lx = x - G.x0, lz = z - G.z0, hs = G.street / 2;
      if (lx < -hs || lz < -hs || lx > G.nx * G.pitch + hs || lz > G.nz * G.pitch + hs) continue;
      const i = Math.floor(lx / G.pitch), j = Math.floor(lz / G.pitch);
      if (i >= 0 && i < G.nx && j >= 0 && j < G.nz) {
        const m = Math.max(Math.abs(lx - (i + 0.5) * G.pitch), Math.abs(lz - (j + 0.5) * G.pitch)), w = (G.pitch - G.street) / 2;
        if (G === CITY && this.parks && this.parks.has(i + ',' + j) && m < w - 3.5) {
          // a park: lawn at ground level, the two paths across it just proud of the grass
          const dx = Math.abs(lx - (i + 0.5) * G.pitch), dz = Math.abs(lz - (j + 0.5) * G.pitch);
          return dx < 1.5 || dz < 1.5 ? G.height + 0.08 : null;
        }
        if (G === TOWN && m < w - 3) return null; // Mill Creek: lawns behind the sidewalk
        if (m < w) return G.height + 0.22;
        if (m < w + 0.2) return G.height + 0.18;
      }
      return G.height + 0.1;
    }
    return null;
  }
  // road ribbons (drawn 0.1 m above the shaped terrain)
  addRoad(pts, ys, width, lane = false) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], hw = width / 2;
      this._insert(Math.min(a[0], b[0]) - hw, Math.min(a[1], b[1]) - hw, Math.max(a[0], b[0]) + hw, Math.max(a[1], b[1]) + hw,
        { t: 3, ax: a[0], az: a[1], bx: b[0], bz: b[1], ya: ys[i], yb: ys[i + 1], hw, lane });
    }
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
    const pv = this.paved(x, z);
    let h = pv !== null ? pv : this.terrainY(x, z);
    this.query(x, z, 1, (it) => {
      if (it.t === 3) {
        if (pv !== null) return;
        const r = distToSeg(x, z, it.ax, it.az, it.bx, it.bz);
        if (r.d < it.hw) {
          const dy = lerp(it.ya, it.yb, r.t) + 0.1;
          if (dy > h && dy < y + 1.0) h = dy;
        }
      } else if (it.t === 2) {
        const r = distToSeg(x, z, it.ax, it.az, it.bx, it.bz);
        if (r.d < it.hw) {
          const dy = lerp(it.ya, it.yb, r.t) + 0.1;
          if (dy > h && dy < y + 1.6) h = dy;
        }
      } else if (it.t === 0) {
        if (x > it.minX && x < it.maxX && z > it.minZ && z < it.maxZ && it.y1 < y + 0.6 && it.y1 > h) h = it.y1;
      }
    });
    return h;
  }

  // Push a circle (x,z,r) at height range [y, y+height] out of colliders.
  // Returns {x, z, hit, nx, nz}
  resolve(x, z, r, y, height, out = {}) {
    out.hit = false; out.nx = 0; out.nz = 0; out.box = null;
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
          out.hit = true; out.nx = dx; out.nz = dz; out.box = it;
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

  // Oriented box (a vehicle's exact footprint) vs boxes and circles.
  // c: centre, hx/hz: half width/length, ang: heading. Returns push-out like resolve().
  resolveOBB(x, z, hx, hz, ang, y, height, out = {}) {
    out.hit = false; out.nx = 0; out.nz = 0;
    const fx = Math.sin(ang), fz = Math.cos(ang), rx = Math.cos(ang), rz = -Math.sin(ang);
    const R = Math.hypot(hx, hz);
    for (let iter = 0; iter < 3; iter++) {
      this.query(x, z, R + 1, (it) => {
        if (it.t === 0) {
          if (y + height < it.y0 || y > it.y1 - 0.4) return;
          const bx = (it.minX + it.maxX) / 2, bz = (it.minZ + it.maxZ) / 2, bhx = (it.maxX - it.minX) / 2, bhz = (it.maxZ - it.minZ) / 2;
          const m = obbOverlap(x, z, hx, hz, fx, fz, rx, rz, bx, bz, bhx, bhz, 0, 1, 1, 0);
          if (!m) return;
          x += m.nx * m.d; z += m.nz * m.d;
          out.hit = true; out.nx = m.nx; out.nz = m.nz;
        } else if (it.t === 1) {
          // circle (tree trunk, pole): closest point of the box to its centre
          const dx = it.x - x, dz = it.z - z;
          const lu = Math.max(-hz, Math.min(hz, dx * fx + dz * fz)), lv = Math.max(-hx, Math.min(hx, dx * rx + dz * rz));
          const px = x + fx * lu + rx * lv, pz = z + fz * lu + rz * lv;
          let ex = px - it.x, ez = pz - it.z, d = Math.hypot(ex, ez);
          if (d >= it.r) return;
          if (d < 1e-6) { ex = -dx; ez = -dz; d = Math.hypot(ex, ez) || 1; }
          const push = it.r - d;
          x += (ex / d) * push; z += (ez / d) * push;
          out.hit = true; out.nx = ex / d; out.nz = ez / d;
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

  // Segment vs boxes for bullets: which box, which face (normal), and where the
  // ray leaves it again (so a thin wall can be shot through). Boxes the segment
  // starts inside are skipped when skipInside is set (continuing after a wall).
  raycastHit(ax, ay, az, bx, by, bz, skipInside = false) {
    let best = null;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / CELL));
    const visited = new Set();
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.query(ax + dx * t, az + dz * t, 2, (it) => {
        if (it.t !== 0 || visited.has(it) || (it.data && it.data.walkable)) return;
        visited.add(it);
        let t0 = -Infinity, t1 = Infinity, axis = -1, sign = 0;
        const o = [ax, ay, az], d = [dx, dy, dz], mn = [it.minX, it.y0, it.minZ], mx = [it.maxX, it.y1, it.maxZ];
        for (let k = 0; k < 3; k++) {
          if (Math.abs(d[k]) < 1e-9) { if (o[k] < mn[k] || o[k] > mx[k]) return; continue; }
          let a = (mn[k] - o[k]) / d[k], b = (mx[k] - o[k]) / d[k], sg = -1;
          if (a > b) { [a, b] = [b, a]; sg = 1; }
          if (a > t0) { t0 = a; axis = k; sign = sg; }
          t1 = Math.min(t1, b);
        }
        if (t0 > t1 || t1 < 0 || t0 > 1) return;
        if (t0 < 0) { if (skipInside) return; t0 = 0; }
        if (!best || t0 < best.t) best = { t: t0, tExit: t1, box: it, axis, sign };
      });
    }
    return best;
  }
}

// Separating-axis test between two oriented rectangles A and B (2D, x/z).
// Each: centre, half sizes along its forward (f) and right (r) axes.
// Returns the minimum push for A out of B { nx, nz, d } or null.
export function obbOverlap(ax, az, ahx, ahz, afx, afz, arx, arz, bx, bz, bhx, bhz, bfx, bfz, brx, brz) {
  const axes = [[afx, afz], [arx, arz], [bfx, bfz], [brx, brz]];
  const dx = ax - bx, dz = az - bz;
  let best = null;
  for (const [ux, uz] of axes) {
    const ra = ahz * Math.abs(afx * ux + afz * uz) + ahx * Math.abs(arx * ux + arz * uz);
    const rb = bhz * Math.abs(bfx * ux + bfz * uz) + bhx * Math.abs(brx * ux + brz * uz);
    const dist = dx * ux + dz * uz;
    const o = ra + rb - Math.abs(dist);
    if (o <= 0) return null;
    if (!best || o < best.d) best = { d: o, nx: dist < 0 ? -ux : ux, nz: dist < 0 ? -uz : uz };
  }
  return best;
}

// A vehicle's exact footprint as an oriented rectangle
export function vehicleOBB(v) {
  const a = v.heading, w = v.spec.width || 2, l = v.spec.len || 4.5;
  return { x: v.pos.x, z: v.pos.z, hx: w / 2, hz: l / 2, fx: Math.sin(a), fz: Math.cos(a), rx: Math.cos(a), rz: -Math.sin(a) };
}
export function vehiclesOverlap(a, b) {
  const A = vehicleOBB(a), B = vehicleOBB(b);
  return obbOverlap(A.x, A.z, A.hx, A.hz, A.fx, A.fz, A.rx, A.rz, B.x, B.z, B.hx, B.hz, B.fx, B.fz, B.rx, B.rz);
}
