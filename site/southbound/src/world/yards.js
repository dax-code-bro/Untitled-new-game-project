// Front yards (G11): what a lived-in street has between the pavement and the front door.
// Every house that faces a street gets, depending on the lot:
//  - a concrete front walk from the porch steps to the pavement, and a driveway down one side
//    of the house (most with a car in it: kerbside.js parks real, stealable cars there, and an
//    oil stain where the car usually stands)
//  - a mailbox on a post at the kerb by the driveway, and wheelie bins against the side wall
//  - a white picket fence or a clipped hedge along the front of the lot (or an open lawn)
//  - shrubs along the foundation and in front of the porch (planted by vegetation.js)
//  - an air-conditioning unit on a pad at the side, a lantern by the door that comes on at dusk,
//    rocking chairs on some porches, a basketball hoop by some driveways, a hose reel, a kid's
//    bike left on the lawn
// Two phases, so the yard oaks and the shrubs (vegetation.js) and the solid pieces don't fight:
// planYards() before the trees go in (it hands vegetation the shrub list), buildYards() after
// (it leaves out a fence section or a mailbox where a tree trunk now stands).
// Everything is instanced and only the pieces near the camera are drawn (core/nearinst.js),
// so it costs the same on Low as on Ultra.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nearInstances, NEAR_RANGE } from '../core/nearinst.js';
import { TOWN } from './layout.js';

const TOWN_WALK = 3; // Mill Creek's sidewalk (roads.js)
function hash(a, b) { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }

// ---------------------------------------------------------------- plan
export function planYards(B, { hm, graph }) {
  const houses = [], bushes = [];
  if (!graph) return { houses, bushes };
  // road segments in a coarse grid (centre line + half width)
  const segs = [], SC = 48, sgrid = new Map();
  for (const e of graph.edges) for (let i = 1; i < e.pts.length; i++) segs.push([e.pts[i - 1][0], e.pts[i - 1][1], e.pts[i][0], e.pts[i][1], e.width / 2]);
  segs.forEach((sg, k) => {
    for (let gx = Math.floor((Math.min(sg[0], sg[2]) - 20) / SC); gx <= Math.floor((Math.max(sg[0], sg[2]) + 20) / SC); gx++)
      for (let gz = Math.floor((Math.min(sg[1], sg[3]) - 20) / SC); gz <= Math.floor((Math.max(sg[1], sg[3]) + 20) / SC); gz++) {
        const key = gx + ',' + gz; if (!sgrid.has(key)) sgrid.set(key, []); sgrid.get(key).push(k);
      }
  });
  const onRoad = (x, z, pad = 0) => {
    for (const k of sgrid.get(Math.floor(x / SC) + ',' + Math.floor(z / SC)) || []) {
      const [ax, az, bx, bz, hw] = segs[k], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      if (Math.hypot(ax + dx * t - x, az + dz * t - z) < hw + pad) return true;
    }
    return false;
  };
  // buildings in a grid, for keeping driveways and fences off the neighbours
  const BC = 32, bgrid = new Map();
  B.forEach((o, k) => {
    for (let gx = Math.floor((o.x - o.w / 2 - 4) / BC); gx <= Math.floor((o.x + o.w / 2 + 4) / BC); gx++)
      for (let gz = Math.floor((o.z - o.d / 2 - 4) / BC); gz <= Math.floor((o.z + o.d / 2 + 4) / BC); gz++) {
        const key = gx + ',' + gz; if (!bgrid.has(key)) bgrid.set(key, []); bgrid.get(key).push(k);
      }
  });
  const inBuilding = (x, z, pad, self) => {
    for (const k of bgrid.get(Math.floor(x / BC) + ',' + Math.floor(z / BC)) || []) {
      const o = B[k]; if (o === self) continue;
      if (Math.abs(x - o.x) < o.w / 2 + pad && Math.abs(z - o.z) < o.d / 2 + pad) return true;
    }
    return false;
  };
  const inTown = (x, z) => x > TOWN.x0 - 8 && x < TOWN.x0 + TOWN.nx * TOWN.pitch + 8 && z > TOWN.z0 - 8 && z < TOWN.z0 + TOWN.nz * TOWN.pitch + 8;
  // the wall nearest a street (the same rule as the front door in facades.js)
  const frontOf = (b) => {
    let best = null, bd = Infinity;
    for (const e of graph.edges) {
      const P = e.pts;
      for (let i = 1; i < P.length; i++) {
        const ax = P[i - 1][0], az = P[i - 1][1], dx = P[i][0] - ax, dz = P[i][1] - az, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((b.x - ax) * dx + (b.z - az) * dz) / L2));
        const px = ax + dx * t, pz = az + dz * t, d = (px - b.x) ** 2 + (pz - b.z) ** 2;
        if (d < bd) { bd = d; best = [px, pz]; }
      }
    }
    if (!best) return -1;
    const dx = best[0] - b.x, dz = best[1] - b.z;
    if (Math.abs(dx) / b.w > Math.abs(dz) / b.d) return dx > 0 ? 2 : 3;
    return dz >= 0 ? 0 : 1;
  };
  const drives = []; // driveway rectangles already taken: [cx, cz, hx, hz]
  const driveHits = (cx, cz, hx, hz) => drives.some(([x, z, a, c]) => Math.abs(cx - x) < hx + a + 0.3 && Math.abs(cz - z) < hz + c + 0.3);

  B.forEach((b, bi) => {
    if (b.style !== 4 || Math.min(b.w, b.d) < 5.5 || b.h > 7.5) return; // houses (not trailers or barns)
    if (b.y - hm.height(b.x, b.z) > 1.2) return;
    const k = frontOf(b);
    if (k < 0) return;
    const N = [[0, 1], [0, -1], [1, 0], [-1, 0]][k], U = k < 2 ? [1, 0] : [0, 1];
    const flen = k < 2 ? b.w : b.d, hd = k < 2 ? b.d / 2 : b.w / 2;
    const ox = b.x + N[0] * hd, oz = b.z + N[1] * hd;
    const P = (u, t) => [ox + U[0] * u + N[0] * t, oz + U[1] * u + N[1] * t];
    // how far out the road starts
    let D = -1;
    for (let t = 1; t <= 30; t += 0.5) { const [x, z] = P(0, t); if (onRoad(x, z)) { D = t; break; } }
    if (D < 3.5) return;
    const town = inTown(b.x, b.z);
    const walkW = town ? TOWN_WALK : 0;
    const tL = D - walkW - 0.25; // the front lot line (the back of the pavement in town, the verge out here)
    if (tL < 2.8) return;
    const seed = hash(b.x, b.z), h2 = hash(b.z * 0.77, b.x * 1.31), h3 = hash(b.x * 2.11 + 3.3, b.z * 0.53);
    const porch = seed < 0.72 && flen >= 6;
    const pl = Math.min(flen * 0.72, 7.5), pd = 2.2;
    const H = { bi, b, k, N, U, flen, hd, ox, oz, D, tL, town, porch, pl, pd, seed, h2, h3, y: b.y };
    // driveway down one side, if there's room (else the other side, else none)
    const pref = h2 < 0.5 ? -1 : 1;
    for (const sd of [pref, -pref]) {
      const uc = sd * (flen / 2 + 2.4), t0 = -hd * 1.15, t1 = D - 0.05;
      let ok = true;
      for (let t = t0; t <= t1 && ok; t += 1) for (const du of [-1.5, 0, 1.5]) {
        const [x, z] = P(uc + du, t);
        if (inBuilding(x, z, 0.35, b) || (t < tL - 0.5 && onRoad(x, z, 0.3))) { ok = false; break; }
      }
      if (!ok) continue;
      const [ca, cb] = P(uc, (t0 + t1) / 2), along = (t1 - t0) / 2;
      const hx = k < 2 ? 1.5 : along, hz = k < 2 ? along : 1.5;
      if (driveHits(ca, cb, hx, hz)) continue;
      drives.push([ca, cb, hx, hz]);
      H.drive = { sd, uc, t0, t1 };
      break;
    }
    // lot width along the street: to the driveway's far edge on that side, ~2.6 m past the wall on the other
    const sd = H.drive ? H.drive.sd : (h2 < 0.5 ? -1 : 1);
    H.uMin = -(flen / 2 + (H.drive && sd < 0 ? 4.4 : 2.6));
    H.uMax = flen / 2 + (H.drive && sd > 0 ? 4.4 : 2.6);
    const fk = hash(b.z, b.x * 0.37);
    H.fence = fk < 0.38 ? 'picket' : fk < 0.6 ? 'hedge' : null;
    // shrubs along the foundation (not under the porch deck or across the door)
    const shrubH = (s) => 0.75 + hash(s, b.x) * 0.4;
    for (let u = -flen / 2 + 0.7; u <= flen / 2 - 0.69; u += 1.45) {
      if (porch ? Math.abs(u) < pl / 2 + 0.35 : Math.abs(u) < 1.05) continue;
      const [x, z] = P(u, 0.85); bushes.push([x, z, shrubH(u)]);
    }
    if (porch && pl / 2 - 0.45 > 1.35) for (const s of [-1, 1]) { const [x, z] = P(s * (pl / 2 - 0.45), pd + 0.75); bushes.push([x, z, shrubH(s * 3.1)]); }
    // a clipped hedge along the front instead of a fence
    if (H.fence === 'hedge') {
      for (const [a, c] of fenceRuns(H)) for (let u = a + 0.5; u <= c - 0.4; u += 0.95) {
        const [x, z] = P(u, tL - 0.45);
        if (!onRoad(x, z, 0.6) && !inBuilding(x, z, 0.6, null)) bushes.push([x, z, 1.0 + hash(u, b.z) * 0.25]);
      }
    }
    houses.push(H);
  });
  return { houses, bushes };
}

// the stretches of the front lot line a fence or hedge runs along (gaps for the walk and the driveway)
function fenceRuns(H) {
  const gaps = [[-0.8, 0.8]];
  if (H.drive) gaps.push([H.drive.uc - 1.65, H.drive.uc + 1.65]);
  gaps.sort((a, b) => a[0] - b[0]);
  const runs = []; let u = H.uMin;
  for (const [a, c] of gaps) { if (a - u > 0.6) runs.push([u, a]); u = Math.max(u, c); }
  if (H.uMax - u > 0.6) runs.push([u, H.uMax]);
  return runs;
}

// ---------------------------------------------------------------- geometry
const tint = (g, hex) => {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const bx = (w, h, d, x, y, z, hex) => tint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
const cyl = (r0, r1, h, seg, hex) => tint(new THREE.CylinderGeometry(r0, r1, h, seg), hex);

// local frame for every piece: +z faces the street, +x along it, origin on the ground
function mailboxGeo(boxC, postC) {
  return mergeGeometries([
    bx(0.09, 1.08, 0.09, 0, 0.54, 0, postC),
    bx(0.3, 0.05, 0.12, 0, 1.06, 0, postC),
    bx(0.21, 0.15, 0.48, 0, 1.165, 0.04, boxC),
    tint(new THREE.CylinderGeometry(0.105, 0.105, 0.48, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, 1.24, 0.04), boxC),
    bx(0.015, 0.16, 0.04, 0.115, 1.27, -0.08, 0xb3261c), bx(0.015, 0.06, 0.1, 0.115, 1.33, -0.03, 0xb3261c), // the flag
  ]);
}
function binGeo(c) {
  const dark = 0x1e2021;
  return mergeGeometries([
    tint(new THREE.CylinderGeometry(0.41, 0.36, 0.92, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1.18).translate(0, 0.5, 0), c),
    bx(0.62, 0.05, 0.74, 0, 0.985, 0.0, c),
    bx(0.5, 0.04, 0.04, 0, 0.93, -0.38, dark),                                     // handle at the back
    cyl(0.1, 0.1, 0.07, 10, dark).rotateZ(Math.PI / 2).translate(0.27, 0.1, -0.33),
    cyl(0.1, 0.1, 0.07, 10, dark).rotateZ(Math.PI / 2).translate(-0.27, 0.1, -0.33),
  ]);
}
function acGeo() {
  const parts = [bx(0.82, 0.72, 0.82, 0, 0.44, 0, 0xc9cac4), cyl(0.31, 0.31, 0.02, 16, 0x26282a).translate(0, 0.81, 0)];
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) parts.push(bx(0.7, 0.025, 0.01, 0, 0.2 + i * 0.09, s * 0.415, 0x55585a));
  parts.push(bx(1.0, 0.08, 1.0, 0, 0.04, 0, 0x9a968e));                           // the pad
  parts.push(cyl(0.025, 0.025, 0.6, 6, 0x8a6a3a).rotateX(Math.PI / 2).translate(0.25, 0.55, -0.6)); // lines to the house
  return mergeGeometries(parts);
}
function lanternGeo() { // the frame (the glass is its own emissive mesh)
  return mergeGeometries([bx(0.12, 0.04, 0.12, 0, 0.15, 0.08, 0x1c1c1c), bx(0.13, 0.03, 0.13, 0, -0.12, 0.08, 0x1c1c1c), bx(0.04, 0.12, 0.08, 0, 0, 0.02, 0x1c1c1c)]);
}
function chairGeo(c) {
  const p = [bx(0.55, 0.05, 0.5, 0, 0.45, 0, c), bx(0.55, 0.62, 0.05, 0, 0.8, -0.24, c)];
  for (const s of [-1, 1]) {
    p.push(bx(0.05, 0.42, 0.05, s * 0.25, 0.23, 0.2, c), bx(0.05, 0.42, 0.05, s * 0.25, 0.23, -0.2, c));
    p.push(bx(0.06, 0.04, 0.95, s * 0.25, 0.03, 0.0, c).rotateX(0.0));                 // rockers
    p.push(bx(0.06, 0.04, 0.5, s * 0.29, 0.66, 0.02, c));                              // arms
  }
  return mergeGeometries(p);
}
function hoopGeo() {
  return mergeGeometries([
    cyl(0.06, 0.07, 3.2, 8, 0x3a3d40).translate(0, 1.6, 0),
    bx(0.08, 0.08, 0.55, 0, 3.05, 0.3, 0x3a3d40),
    bx(1.12, 0.74, 0.04, 0, 3.1, 0.58, 0xf2f2ee),
    bx(0.46, 0.34, 0.045, 0, 3.0, 0.585, 0xc23a24),
    tint(new THREE.TorusGeometry(0.23, 0.012, 6, 18).rotateX(Math.PI / 2).translate(0, 2.92, 0.84), 0xd1561e),
  ]);
}
function reelGeo() {
  return mergeGeometries([
    cyl(0.22, 0.22, 0.14, 14, 0x2f7a3a).rotateZ(Math.PI / 2).translate(0, 0.32, 0),
    bx(0.3, 0.05, 0.05, 0, 0.32, 0, 0x2f2f2f),
    bx(0.04, 0.34, 0.2, 0.16, 0.17, 0, 0x2f2f2f), bx(0.04, 0.34, 0.2, -0.16, 0.17, 0, 0x2f2f2f),
    tint(new THREE.TorusGeometry(0.16, 0.02, 5, 14).rotateY(Math.PI / 2).translate(0, 0.32, 0), 0x3f8f45),
  ]);
}
function bikeGeo(c) { // a kid's bike lying on its side on the lawn
  const g = mergeGeometries([
    tint(new THREE.TorusGeometry(0.25, 0.03, 5, 16).translate(-0.42, 0.25, 0), 0x1c1c1c),
    tint(new THREE.TorusGeometry(0.25, 0.03, 5, 16).translate(0.42, 0.25, 0), 0x1c1c1c),
    bx(0.62, 0.035, 0.035, 0, 0.42, 0, c).rotateZ(0.0),
    bx(0.5, 0.035, 0.035, -0.15, 0.36, 0, c).rotateZ(0.0).applyMatrix4(new THREE.Matrix4().makeRotationZ(0.6)).translate(-0.12, -0.06, 0),
    bx(0.035, 0.32, 0.035, 0.36, 0.5, 0, c), bx(0.035, 0.035, 0.42, 0.36, 0.66, 0, 0x2a2a2a),
    bx(0.2, 0.04, 0.09, -0.18, 0.6, 0, 0x1c1c1c),
  ]);
  return g.rotateX(Math.PI / 2).translate(0, 0.04, 0);
}
function picketGeo(c) { // a 2 m section of picket fence, starting at x=0 with a post
  const p = [bx(2.0, 0.07, 0.03, 1.0, 0.28, -0.03, c), bx(2.0, 0.07, 0.03, 1.0, 0.74, -0.03, c), bx(0.1, 1.08, 0.1, 0, 0.54, -0.03, c), bx(0.13, 0.04, 0.13, 0, 1.1, -0.03, c)];
  for (let i = 0; i < 12; i++) {
    const x = 0.16 + i * (1.84 / 11.5);
    p.push(bx(0.075, 0.88, 0.02, x, 0.5, 0, c));
    p.push(tint(new THREE.BoxGeometry(0.053, 0.053, 0.02).rotateZ(Math.PI / 4).translate(x, 0.94, 0), c));
  }
  return mergeGeometries(p);
}
// a soft dark stain (oil under where the car stands)
function stainTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------- build
export function buildYards(plan, { scene, hm, collision, quality: q, surf, power = null }) {
  const pieces = new Map(); // key -> { geo, list: [Matrix4] }
  const slabs = [];         // concrete: [Matrix4, shade]
  const stains = [];
  const lamps = [];
  const drives = [];        // car slots for kerbside.js
  const weedSpots = [];     // world/streetclutter.js grows weeds here
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), v3 = new THREE.Vector3();
  const put = (key, make, x, y, z, ry, sx = 1, sy = 1, sz = 1) => {
    let p = pieces.get(key); if (!p) pieces.set(key, (p = { make, list: [] }));
    p.list.push(new THREE.Matrix4().compose(v3.set(x, y, z), qq.setFromAxisAngle(UP, ry), new THREE.Vector3(sx, sy, sz)));
  };
  // a tree trunk, pole or post already there
  const trunkNear = (x, z, r) => { let hit = false; collision.query(x, z, r + 2, (it) => { if (!hit && it.t === 1 && it.r > 0 && Math.hypot(it.x - x, it.z - z) < it.r + r) hit = true; }); return hit; };
  const ground = (x, z) => hm.height(x, z);
  const sideY = TOWN.height + 0.22; // the top of Mill Creek's sidewalks
  const counts = { houses: 0, walks: 0, drives: 0, cars: 0, mailboxes: 0, bins: 0, fences: 0, hedges: 0, ac: 0, lanterns: 0, chairs: 0, hoops: 0, reels: 0, bikes: 0 };

  for (const H of plan.houses) {
    const { b, N, U, flen, hd, ox, oz, D, tL, porch, pl, pd, seed, h2, h3 } = H;
    const P = (u, t) => [ox + U[0] * u + N[0] * t, oz + U[1] * u + N[1] * t];
    const face = Math.atan2(N[0], N[1]); // ry that turns a piece's +z to face the street
    const toward = (s) => Math.atan2(s * U[0], s * U[1]); // ry that turns a piece's +z along +U (s = 1) or -U
    const alongX = H.k < 2;
    // a concrete strip running out from the house (t0 -> t1), centred on u: it follows the slope of the
    // lot (a straight line between its ends, lifted so no bump of ground pokes through), never floats
    const strip = (u, wid, t0, t1, lift, th, shade, flatY = null) => {
      const n = 6, ts = [], gs = [];
      for (let i = 0; i <= n; i++) { const t = t0 + (t1 - t0) * i / n; ts.push(t); gs.push(flatY ?? ground(...P(u, t))); }
      const s = (gs[n] - gs[0]) / ((t1 - t0) || 1);
      let up = 0; for (let i = 0; i <= n; i++) up = Math.max(up, gs[i] - (gs[0] + s * (ts[i] - t0)));
      const yc = (gs[0] + gs[n]) / 2 + up + lift, [x, z] = P(u, (t0 + t1) / 2), len = Math.hypot(t1 - t0, gs[n] - gs[0]);
      const e = new THREE.Euler(-Math.atan(s), face, 0, 'YXZ');
      // the box's local y is up through the slab: drop it by half its thickness along that axis
      const dn = new THREE.Vector3(0, 1, 0).applyEuler(e).multiplyScalar(-th / 2);
      slabs.push([new THREE.Matrix4().compose(new THREE.Vector3(x + dn.x, yc + dn.y, z + dn.z), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(wid, th, len)), shade]);
      return yc;
    };
    counts.houses++;
    // weeds where the walls meet the ground, at a couple of corners
    for (const [cu, ct] of [[-flen / 2 - 0.15, 0.15], [flen / 2 + 0.15, -hd * 1.5]]) if (hash(b.x + cu, b.z + ct) < 0.6) weedSpots.push(P(cu, ct));
    // the front walk: porch steps (or the door) to the pavement
    const tw0 = porch ? pd + 0.75 : 0.55;
    if (tL - tw0 > 0.6) { strip(0, 1.2, tw0, tL + 0.02, 0.035, 0.3, 0.98); counts.walks++; }
    // the driveway (and across the pavement in town: the apron)
    if (H.drive) {
      const { sd, uc, t0 } = H.drive;
      strip(uc, 3.0, t0, tL + 0.02, 0.03, 0.5, 0.9);
      if (H.town) strip(uc, 3.0, tL, D - 0.05, 0.012, 0.1, 0.9, sideY);
      counts.drives++;
      // where the car stands: nose to the house, a few metres in from the street
      const tc = Math.max(t0 + 2.6, Math.min(tL - 3.0, 1.8));
      const [cx, cz] = P(uc, tc);
      const y = ground(cx, cz) + 0.04;
      const car = h3 < 0.6;
      drives.push({ x: cx, z: cz, y, heading: Math.atan2(-N[0], -N[1]) + (h3 < 0.12 ? Math.PI : 0), car, seed: Math.floor(h3 * 1e6), apron: P(uc, D - 0.3) });
      if (car || h3 < 0.75) stains.push([cx, y + 0.012, cz, hash(cx, cz) * 6.28, 1.1 + h2 * 0.6]);
      if (car) counts.cars++;
      // the mailbox at the kerb on the walk side of the driveway, wheelie bins against the side wall
      const [mx, mz] = P(uc - sd * 2.0, D - 0.45);
      if (!trunkNear(mx, mz, 0.5)) {
        const my = H.town ? sideY : ground(mx, mz);
        const mk = (seed * 7) % 1 < 0.45 ? 'mbBlack' : (seed * 7) % 1 < 0.75 ? 'mbSilver' : 'mbWhite';
        put(mk, () => mailboxGeo(mk === 'mbBlack' ? 0x1d1f20 : mk === 'mbSilver' ? 0xa9adb0 : 0xe8e6e0, mk === 'mbWhite' ? 0xe8e6e0 : 0x2a2622), mx, my, mz, face);
        collision.addCircle(mx, mz, 0.12); counts.mailboxes++;
      }
      const nb = h2 < 0.3 ? 1 : 2;
      for (let i = 0; i < nb; i++) {
        const [x2, z2] = P(sd * (flen / 2 + 0.47), -0.9 - i * 0.78);
        const key = ['binGreen', 'binBlack', 'binBlue', 'binGrey'][Math.floor(hash(b.x + i, b.z) * 4)];
        put(key, () => binGeo({ binGreen: 0x2f5a35, binBlack: 0x232527, binBlue: 0x24497a, binGrey: 0x6d7174 }[key]), x2, ground(x2, z2), z2, toward(sd) + (hash(i, b.x) - 0.5) * 0.3);
        collision.addBox(x2 - 0.33, z2 - 0.33, x2 + 0.33, z2 + 0.33, ground(x2, z2), ground(x2, z2) + 1.05, { prop: 'bin' });
        counts.bins++;
      }
      // a basketball hoop at the street end of some driveways, the board facing the house
      if (h2 > 0.84) {
        const [hx, hz] = P(uc + sd * 1.85, tL - 0.4);
        if (!trunkNear(hx, hz, 0.4)) { put('hoop', hoopGeo, hx, ground(hx, hz), hz, face + Math.PI); collision.addCircle(hx, hz, 0.08); counts.hoops++; }
      }
    }
    // the air conditioner on the side away from the driveway, towards the back
    const as = H.drive ? -H.drive.sd : (h2 < 0.5 ? 1 : -1);
    {
      const [x, z] = P(as * (flen / 2 + 0.6), -hd * 0.55);
      let clear = !trunkNear(x, z, 0.7);
      if (clear) collision.query(x, z, 6, (it) => { if (clear && it.t === 0 && it.data?.building && x > it.minX - 0.45 && x < it.maxX + 0.45 && z > it.minZ - 0.45 && z < it.maxZ + 0.45) clear = false; });
      if (clear) {
        put('ac', acGeo, x, ground(x, z), z, toward(as));
        collision.addBox(x - 0.45, z - 0.45, x + 0.45, z + 0.45, ground(x, z), ground(x, z) + 0.8, { prop: 'ac' }); counts.ac++;
      }
    }
    // the lantern by the door (lit after dark)
    {
      const [x, z] = P(0.82, 0.02);
      lamps.push([x, b.y + 0.3 + 1.95, z, face]); counts.lanterns++;
    }
    // rocking chairs on some porches
    if (porch && pl > 4.2 && seed < 0.45) {
      const ck = hash(seed, 9.1) < 0.6 ? 'chairWhite' : 'chairWood';
      for (const s of [-1, 1]) {
        const [x, z] = P(s * (pl / 2 - 0.9), 1.05);
        put(ck, () => chairGeo(ck === 'chairWhite' ? 0xeceae2 : 0x6e4e33), x, b.y + 0.34, z, face + s * 0.35);
        counts.chairs++;
      }
    }
    // a hose reel at the front corner, a bike on the lawn
    if (h3 > 0.62) {
      const [x, z] = P(-as * (flen / 2 - 0.45), 0.4);
      put('reel', reelGeo, x, ground(x, z), z, toward(1)); counts.reels++;
    }
    if (h3 > 0.9 && tL > 4) {
      const [x, z] = P((h2 - 0.5) * flen * 0.6, tL * 0.55);
      if (!trunkNear(x, z, 0.8)) { const bk = h2 < 0.5 ? 'bikeRed' : 'bikeBlue'; put(bk, () => bikeGeo(bk === 'bikeRed' ? 0xb32a22 : 0x2a56a8), x, ground(x, z), z, hash(x, z) * 6.28); counts.bikes++; }
    }
    // the picket fence along the front of the lot (a section is left out where a tree stands)
    if (H.fence === 'picket') {
      const fc = hash(b.x, 4.4) < 0.75 ? 'picketWhite' : 'picketCream';
      const tf = tL - 0.12;
      for (const [a, c] of fenceRuns(H)) {
        const len = c - a, n = Math.max(1, Math.round(len / 2)), sl = len / n;
        for (let i = 0; i < n; i++) {
          const u = a + i * sl, [x, z] = P(u, tf), [x1, z1] = P(u + sl, tf), [xm, zm] = P(u + sl / 2, tf);
          if (trunkNear(xm, zm, 0.55)) continue;
          if (hash(x, z) < 0.45) weedSpots.push([x + (hash(z, x) - 0.5) * 0.3, z + (hash(x, 7) - 0.5) * 0.3]); // weeds at the posts
          // the section runs along +x in its own frame: turn it to run along the street
          const ry = alongX ? 0 : -Math.PI / 2;
          put(fc, () => picketGeo(fc === 'picketWhite' ? 0xf1efe8 : 0xe4dccb), x, Math.min(ground(x, z), ground(x1, z1)), z, ry, sl / 2, 1, 1);
          collision.addBox(Math.min(x, x1) - 0.06, Math.min(z, z1) - 0.06, Math.max(x, x1) + 0.06, Math.max(z, z1) + 0.06, ground(xm, zm), ground(xm, zm) + 1.0, { prop: 'fence' });
          counts.fences++;
        }
      }
    } else if (H.fence === 'hedge') counts.hedges++;
  }

  // ---- service drops: a sagging wire from the nearest pole in front of the house to its eave
  const wire = [];
  if (power && power.poles && power.poles.length) {
    const PH = power.H || 9.2;
    for (const H of plan.houses) {
      const { b, N, U, flen, ox, oz } = H;
      let best = null, bd = 46;
      for (const p of power.poles) {
        const dx = p.x - ox, dz = p.z - oz, t = dx * N[0] + dz * N[1], u = dx * U[0] + dz * U[1];
        if (t < 2 || Math.abs(u) > flen / 2 + 20) continue; // in front, not across the next lots
        const d = Math.hypot(dx, dz); if (d < bd) { bd = d; best = p; }
      }
      if (!best) continue;
      const u = Math.sign((best.x - ox) * U[0] + (best.z - oz) * U[1]) * (flen / 2 - 0.45) || flen / 2 - 0.45;
      const a = new THREE.Vector3(ox + U[0] * u + N[0] * 0.08, b.y + (b.h > 5 ? b.h - 0.55 : b.h - 0.3), oz + U[1] * u + N[1] * 0.08);
      const dir = new THREE.Vector3(a.x - best.x, 0, a.z - best.z).normalize();
      const c = new THREE.Vector3(best.x + dir.x * 0.18, best.y - 0.4 + PH - 1.5, best.z + dir.z * 0.18);
      const len = a.distanceTo(c), sag = 0.25 + len * 0.012, n = 10;
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const p0 = c.clone().lerp(a, t0), p1 = c.clone().lerp(a, t1);
        p0.y -= sag * 4 * t0 * (1 - t0); p1.y -= sag * 4 * t1 * (1 - t1);
        wire.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      }
      counts.drops = (counts.drops || 0) + 1;
    }
  }
  if (wire.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.8 }));
    lines.userData.noHit = true; lines.userData.noReflect = true; scene.add(lines);
  }

  // ---- meshes
  const near = NEAR_RANGE[q.label] || 140;
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0 });
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.55 });
  const METAL = new Set(['mbSilver', 'hoop']);
  const meshes = [];
  for (const [key, p] of pieces) {
    const im = new THREE.InstancedMesh(p.make(), METAL.has(key) ? metal : paint, p.list.length);
    im.castShadow = q.shadows > 0 && !key.startsWith('bike'); im.receiveShadow = true; im.userData.noReflect = true;
    nearInstances(im, p.list, key.startsWith('picket') ? near * 1.3 : near).update(v3.set(0, 0, 0), true);
    scene.add(im); meshes.push(im);
  }
  // concrete: walks, driveways and aprons (flat, so they're drawn at any distance)
  if (slabs.length) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 });
    const C = surf && surf.concrete && surf.concrete.real ? surf.concrete : null;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tYC = { value: C ? C.color : null };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vYW; varying vec3 vYL;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvYW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; vYL = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vYW; varying vec3 vYL;' + (C ? '\nuniform sampler2D tYC;' : ''))
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            // poured concrete, cut into squares by control joints every ~1.5 m, a little weathered
            ${C ? 'vec3 con = texture2D(tYC, vYW.xz / 2.2).rgb * 1.12;' : 'vec3 con = vec3(0.62, 0.6, 0.57);'}
            vec2 jg = abs(fract(vYW.xz / 1.5 + 0.5) - 0.5) * 1.5;
            float joint = 1.0 - smoothstep(0.0, 0.025, min(jg.x, jg.y)) * 1.0;
            diffuseColor.rgb *= con * (1.0 - joint * 0.35) * (abs(vYL.y) < 0.49 ? 0.85 : 1.0);
          }`);
    };
    mat.customProgramCacheKey = () => 'sbyardslab';
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, slabs.length);
    const col = new THREE.Color();
    slabs.forEach(([mm, shade], i) => {
      im.setMatrixAt(i, mm);
      im.setColorAt(i, col.setRGB(shade, shade * 0.99, shade * 0.97));
    });
    im.receiveShadow = true; im.userData.noReflect = true;
    scene.add(im); meshes.push(im);
  }
  if (stains.length) {
    const mat = new THREE.MeshBasicMaterial({ map: stainTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, color: 0x2a2622 });
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, stains.length);
    const list = stains.map(([x, y, z, r, s]) => new THREE.Matrix4().compose(v3.set(x, y, z), qq.setFromAxisAngle(UP, r), new THREE.Vector3(s, 1, s * 1.4)));
    im.renderOrder = 1; im.userData.noReflect = true;
    nearInstances(im, list, near).update(v3.set(0, 0, 0), true);
    scene.add(im); meshes.push(im);
  }
  // door lanterns: a dark frame, and the glass glows warm after dark
  let glassMat = null;
  if (lamps.length) {
    glassMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.3, emissive: 0xffc27a, emissiveIntensity: 0 });
    const frames = new THREE.InstancedMesh(lanternGeo(), paint, lamps.length), glass = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.22, 0.1).translate(0, 0.015, 0.08), glassMat, lamps.length);
    const list = lamps.map(([x, y, z, ry]) => new THREE.Matrix4().compose(v3.set(x, y, z), qq.setFromAxisAngle(UP, ry), new THREE.Vector3(1, 1, 1)));
    nearInstances(frames, list, near).update(v3.set(0, 0, 0), true);
    nearInstances(glass, list, near * 1.6).update(v3.set(0, 0, 0), true);
    frames.userData.noReflect = glass.userData.noReflect = true;
    scene.add(frames, glass); meshes.push(frames, glass);
  }
  return {
    counts,
    drives,
    weedSpots,
    meshes,
    lampK: () => (glassMat ? glassMat.emissiveIntensity : 0),
    // the lanterns come on at dusk (sky.night: 0 day .. 1 night)
    update(night) { if (glassMat) glassMat.emissiveIntensity = 2.4 * Math.min(1, Math.max(0, (night - 0.15) * 2)); },
  };
}
