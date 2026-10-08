// Collision + raycasting against terrain (analytic heightfield), box colliders (buildings, props)
// and tree trunks (vertical cylinders). Bodies are {pos, vel, r, h, onGround}.
import { heightAt, islandD, WORLD } from './terrain.js';

const CELL = 32;
const key = (cx, cz) => cx * 100003 + cz;

export function rayBox(ox, oy, oz, ix, iy, iz, b) {
  let t1 = (b.min[0] - ox) * ix, t2 = (b.max[0] - ox) * ix;
  let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
  t1 = (b.min[1] - oy) * iy; t2 = (b.max[1] - oy) * iy;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (b.min[2] - oz) * iz; t2 = (b.max[2] - oz) * iz;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  return tmin >= 0 && tmin <= tmax ? [tmin, tmax] : null;
}
const inv = (d) => 1 / (Math.abs(d) < 1e-9 ? 1e-9 : d);

// Water surface height at x,z, or null if dry land.
export function waterLevelAt(x, z, ground = heightAt(x, z)) {
  if (ground < WORLD.sea) return WORLD.sea;
  if (ground < WORLD.lake && islandD(x, z) < 0.82) return WORLD.lake;
  return null;
}

export class Physics {
  constructor() {
    this.boxes = new Map(); // grid key -> colliders
    this.trunks = new Map(); // grid key -> trunks
    this.all = new Set();
    this._s = 0;
    this._rs = 0;
  }

  // ---------------------------------------------------------------- registration
  addBox(min, max, data = {}) {
    const c = { min, max, _s: 0, ...data };
    c.thin = Math.min(max[0] - min[0], max[2] - min[2]) < 0.5;
    this.all.add(c);
    for (const k of this.cellsOf(min[0], min[2], max[0], max[2])) {
      let a = this.boxes.get(k);
      if (!a) this.boxes.set(k, (a = []));
      a.push(c);
    }
    return c;
  }

  removeBox(c) {
    this.all.delete(c);
    for (const k of this.cellsOf(c.min[0], c.min[2], c.max[0], c.max[2])) {
      const a = this.boxes.get(k);
      if (a) { const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); }
    }
  }

  // trunks: [{x, z, r, h, base}] owned by a scatter cell (so they can be removed together)
  addTrunks(owner, list) {
    for (const t of list) {
      t.owner = owner;
      const k = key(Math.floor(t.x / CELL), Math.floor(t.z / CELL));
      let a = this.trunks.get(k);
      if (!a) this.trunks.set(k, (a = []));
      a.push(t);
    }
  }

  removeTrunks(owner, list) {
    const seen = new Set();
    for (const t of list) {
      const k = key(Math.floor(t.x / CELL), Math.floor(t.z / CELL));
      if (seen.has(k)) continue;
      seen.add(k);
      const a = this.trunks.get(k);
      if (a) this.trunks.set(k, a.filter((u) => u.owner !== owner));
    }
  }

  *cellsOf(x0, z0, x1, z1) {
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL), cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) yield key(x, z);
  }

  queryBoxes(x0, z0, x1, z1) {
    const s = ++this._s, out = [];
    for (const k of this.cellsOf(x0, z0, x1, z1)) {
      const a = this.boxes.get(k);
      if (!a) continue;
      for (const c of a) if (c._s !== s) { c._s = s; out.push(c); }
    }
    return out;
  }

  queryTrunks(x0, z0, x1, z1) {
    const out = [];
    for (const k of this.cellsOf(x0, z0, x1, z1)) { const a = this.trunks.get(k); if (a) for (const t of a) out.push(t); }
    return out;
  }

  // ---------------------------------------------------------------- bodies
  overlapsBox(x, y, z, r, h) {
    for (const c of this.queryBoxes(x - r, z - r, x + r, z + r)) {
      if (x - r < c.max[0] && x + r > c.min[0] && z - r < c.max[2] && z + r > c.min[2] && y < c.max[1] && y + h > c.min[1]) return true;
    }
    return false;
  }

  moveBody(b, dt, opts = {}) {
    const STEP = opts.step ?? 0.55;
    b.blocked = false;
    b.pos.x += b.vel.x * dt; this._resolve(b, 0, STEP);
    b.pos.z += b.vel.z * dt; this._resolve(b, 2, STEP);
    if (!opts.noTrunks) this._trunks(b);
    b.pos.y += b.vel.y * dt;
    const wasGround = b.onGround;
    b.onGround = false;
    this._resolveY(b);
    const g = heightAt(b.pos.x, b.pos.z);
    b.ground = g;
    if (b.pos.y <= g) {
      b.pos.y = g;
      if (b.vel.y < 0) { b.landSpeed = -b.vel.y; b.vel.y = 0; }
      b.onGround = true;
    } else if (wasGround && b.vel.y <= 0 && b.pos.y - g < 0.6 && !b.swimming) {
      b.pos.y = g; // stick to the ground walking downhill
      b.onGround = true;
    }
    // water
    const wl = waterLevelAt(b.pos.x, b.pos.z, g);
    b.waterLevel = wl;
    b.inWater = wl !== null && b.pos.y < wl - 0.3;
    b.swimming = wl !== null && b.pos.y < wl - (b.h * 0.7);
  }

  _resolve(b, axis, step) {
    const p = b.pos, r = b.r;
    for (const c of this.queryBoxes(p.x - r, p.z - r, p.x + r, p.z + r)) {
      if (p.x - r >= c.max[0] || p.x + r <= c.min[0] || p.z - r >= c.max[2] || p.z + r <= c.min[2] ||
          p.y >= c.max[1] || p.y + b.h <= c.min[1]) continue;
      if (c.ladder) continue;
      const rise = c.max[1] - p.y;
      if (b.onGround && rise <= step && !this.overlapsBox(p.x, c.max[1] + 0.01, p.z, r * 0.9, b.h)) { p.y = c.max[1]; continue; }
      const v = axis === 0 ? b.vel.x : b.vel.z;
      const pc = axis === 0 ? p.x : p.z;
      const lo = c.min[axis] - r, hi = c.max[axis] + r;
      const np = v > 0 ? lo : v < 0 ? hi : (pc - lo < hi - pc ? lo : hi);
      if (axis === 0) p.x = np; else p.z = np;
      b.blocked = true;
    }
  }

  _resolveY(b) {
    const p = b.pos, r = b.r;
    for (const c of this.queryBoxes(p.x - r, p.z - r, p.x + r, p.z + r)) {
      if (p.x - r >= c.max[0] || p.x + r <= c.min[0] || p.z - r >= c.max[2] || p.z + r <= c.min[2] ||
          p.y >= c.max[1] || p.y + b.h <= c.min[1]) continue;
      if (c.ladder) continue;
      if (c.max[1] - p.y <= p.y + b.h - c.min[1]) {
        p.y = c.max[1];
        if (b.vel.y < 0) { b.landSpeed = -b.vel.y; b.vel.y = 0; }
        b.onGround = true;
      } else {
        p.y = c.min[1] - b.h;
        if (b.vel.y > 0) b.vel.y = 0;
      }
    }
  }

  _trunks(b) {
    const p = b.pos;
    for (const t of this.queryTrunks(p.x - 2, p.z - 2, p.x + 2, p.z + 2)) {
      if (p.y > t.base + t.h || p.y + b.h < t.base - 1) continue;
      const dx = p.x - t.x, dz = p.z - t.z, rr = t.r + b.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      p.x = t.x + (dx / d) * rr;
      p.z = t.z + (dz / d) * rr;
      b.blocked = true;
    }
  }

  ladderAt(x, y, z, r) {
    for (const c of this.queryBoxes(x - r, z - r, x + r, z + r)) {
      if (c.ladder && x + r > c.min[0] && x - r < c.max[0] && z + r > c.min[2] && z - r < c.max[2] && y < c.max[1] && y + 1.8 > c.min[1]) return c;
    }
    return null;
  }

  // ---------------------------------------------------------------- rays
  rayTerrain(ox, oy, oz, dx, dy, dz, maxT) {
    let t = 0, prev = 0;
    let h = heightAt(ox, oz);
    if (oy < h) return 0;
    for (let i = 0; i < 260 && t < maxT; i++) {
      prev = t;
      const diff = oy + dy * t - heightAt(ox + dx * t, oz + dz * t);
      t += Math.min(30, Math.max(0.35, diff * 0.45));
      if (t > maxT) t = maxT;
      if (oy + dy * t < heightAt(ox + dx * t, oz + dz * t)) {
        let a = prev, b = t;
        for (let k = 0; k < 12; k++) {
          const m = (a + b) / 2;
          if (oy + dy * m < heightAt(ox + dx * m, oz + dz * m)) b = m; else a = m;
        }
        return b;
      }
      if (t >= maxT) break;
    }
    return Infinity;
  }

  // All obstacles a ray passes through (sorted), for bullet penetration.
  rayAll(o, d, maxT, { terrain = true } = {}) {
    const hits = [];
    const rs = ++this._rs;
    const tT = terrain ? this.rayTerrain(o.x, o.y, o.z, d.x, d.y, d.z, maxT) : Infinity;
    const end = Math.min(maxT, tT);
    const ix = inv(d.x), iy = inv(d.y), iz = inv(d.z);
    // boxes: walk the cells the ray covers
    const seen = new Set();
    const steps = Math.ceil(end / (CELL * 0.5)) + 1;
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(end, (i / steps) * end);
      const px = o.x + d.x * t, pz = o.z + d.z * t;
      for (const k of this.cellsOf(px - 1, pz - 1, px + 1, pz + 1)) {
        if (seen.has(k)) continue;
        seen.add(k);
        const a = this.boxes.get(k);
        if (a) for (const c of a) {
          if (c._ray === rs) continue;
          c._ray = rs;
          if (c.ladder || c.noBullet) continue;
          const r = rayBox(o.x, o.y, o.z, ix, iy, iz, c);
          if (r && r[0] < end) hits.push({ t: r[0], kind: 'box', box: c, thick: r[1] - r[0] });
        }
        const tr = this.trunks.get(k);
        if (tr) for (const tk of tr) {
          const fx = o.x - tk.x, fz = o.z - tk.z;
          const a2 = d.x * d.x + d.z * d.z;
          if (a2 < 1e-9) continue;
          const bq = 2 * (fx * d.x + fz * d.z), cq = fx * fx + fz * fz - tk.r * tk.r;
          const disc = bq * bq - 4 * a2 * cq;
          if (disc < 0) continue;
          const tt = (-bq - Math.sqrt(disc)) / (2 * a2);
          if (tt < 0 || tt > end) continue;
          const y = o.y + d.y * tt;
          if (y < tk.base - 0.5 || y > tk.base + tk.h) continue;
          hits.push({ t: tt, kind: 'trunk', trunk: tk, thick: tk.r * 2 });
        }
      }
    }
    hits.sort((a, b) => a.t - b.t);
    if (tT < maxT) hits.push({ t: tT, kind: 'terrain', thick: Infinity });
    // de-dup trunks counted from two cells
    return hits.filter((h, i) => !(h.kind === 'trunk' && i > 0 && hits[i - 1].trunk === h.trunk));
  }

  // Nearest blocking hit (for line of sight).
  raycast(o, d, maxT) {
    const all = this.rayAll(o, d, maxT);
    return all.length ? all[0] : null;
  }

  lineOfSight(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const L = Math.hypot(dx, dy, dz);
    const hit = this.raycast(a, { x: dx / L, y: dy / L, z: dz / L }, L);
    return !hit || hit.t >= L - 0.3;
  }
}
