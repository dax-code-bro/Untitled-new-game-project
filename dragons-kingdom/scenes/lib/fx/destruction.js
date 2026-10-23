// FX library - destruction of the Cling set (F6: 3C-11, 3C-12, 3C-27, R15, R16, and the after-state
// of 3D / X27 / X28), built ON the architecture and props libraries instead of next to them:
//
//   const cap = fx.debris.damageCapture((x, y, z) => inHole(x, y, z));
//   const set = await clingSquare(ctx, { damage: cap.damage });        // the set with the hole
//   const roof = await fx.debris.roofline({ capture: cap, set: set.group, t0: 1.2,
//       impact: [x, y, z], dir: [0.3, -0.5, 1], speed: 9 });
//   fx.debris.object({ object: stall.group, t0: 1.6, dir: [0.2, 0.25, 1], speed: 7, spin: [0, 1.5, 4] });
//
// * damageCapture wraps the set's damage function: the architecture asks it about every roof
//   tile it lays (roof.js `damageAt`), and every tile it is told to leave out is recorded with its
//   place on the roof. roofline() puts those very tiles back as FX pieces - same size, same clay
//   batch (read from the set's own tile mesh), sitting where the set's neighbours sit - HELD in
//   place until the failure reaches them. So the shot can open on an intact roofline, and the
//   hole the set was built with is exactly the hole the tiles leave.
// * Near the impact the tiles, battens, rafters and deck boards are blasted along `dir`; beyond
//   it the roof lets go in sheets: each patch slides down the slope (constant acceleration
//   g (sin a - mu cos a)) to the eaves and tips off it, the patches below going first. Brittle
//   pieces shatter where they hit the paving; everything lands on what came down before it
//   (debris.js piles).
// * object() throws a whole prop (the vendor's stall, a crate, a spear, the watchman's cup) with
//   the same closed-form flight / bounce / slide / rest solver; it is held where the set put it
//   until t0.
// * the after-state is the same simulation evaluated late: build the same cues with t0 far in
//   the past (e.g. -100) in the 3D / X27 / X28 set-ups and every piece lies where it came to rest
//   in 3C - consistent shot to shot without placing anything by hand.
import * as THREE from 'three';
import { Effect } from './core/manager.js';
import { ParticleLayer } from './core/particles.js';
import { DebrisEffect, solvePiece, poseAt, prepWalls } from './debris.js';
import { hash01, arr3, clamp, norm3, dot3, cross3, len3, coneDir } from './core/util.js';

const UP = [0, 1, 0];

// ------------------------------------------------------------------ capture --
/**
 * Wrap a damage region for the architecture: region(x, y, z) -> bool in world coordinates.
 * Pass `cap.damage` as clingSquare's `damage` (called with x, y, z) or as house()'s `damage`
 * (called with [x, y, z] in the house's local frame: give o.toWorld([x, y, z]) -> [x, y, z]).
 * Every query is recorded in order ([x, y, z, removed]); roofline() reads them. o.name registers
 * the capture for the director's 'debris-roofline' cue (params.capture: that name).
 */
const CAPTURES = new Map();
/** A capture registered by name (damageCapture(region, { name })) - the director's cues use it. */
export const captureByName = (name) => CAPTURES.get(name) || null;
export function damageCapture(region, o = {}) {
  const calls = [];
  const damage = (a, b, c) => {
    let p = Array.isArray(a) ? a : [a, b, c];
    if (o.toWorld) p = o.toWorld(p);
    const r = !!region(p[0], p[1], p[2]);
    calls.push([p[0], p[1], p[2], r ? 1 : 0]);
    return r;
  };
  const cap = { damage, calls, region, name: o.name || null };
  if (o.name) CAPTURES.set(o.name, cap);
  return cap;
}

// ------------------------------------------------------------------ geometry helpers --
/** Eigen-decomposition of a symmetric 3x3 (Jacobi). Returns { values, vectors (columns) }. */
function eigSym3(A) {
  const a = A.map((r) => r.slice());
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] * a[p][q];
    if (off < 1e-18) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], vectors: [0, 1, 2].map((k) => [V[0][k], V[1][k], V[2][k]]) };
}
/** Best-fit plane of points: { m (centroid), n (unit normal, pointing up) }. */
function fitPlane(pts) {
  const m = [0, 0, 0];
  for (const p of pts) for (let k = 0; k < 3; k++) m[k] += p[k] / pts.length;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += (p[i] - m[i]) * (p[j] - m[j]);
  const { values, vectors } = eigSym3(C);
  let k = 0; for (let i = 1; i < 3; i++) if (values[i] < values[k]) k = i;
  let n = norm3(vectors[k]);
  if (n[1] < 0) n = n.map((x) => -x);
  return { m, n };
}
const median = (a) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

/**
 * The runs of a capture: the architecture lays a roof slope course by course from the eaves up,
 * so the queries for one slope come in one run (y never drops by more than a few cm, never
 * jumps up by more than a course). Each run with removed tiles gets its plane, slope frame and
 * tile size.
 */
export function captureRuns(calls) {
  const runs = [];
  let cur = null, prev = null;
  for (const c of calls) {
    if (!prev || c[1] < prev[1] - 0.03 || c[1] > prev[1] + 0.4 || Math.hypot(c[0] - prev[0], c[2] - prev[2]) > 16) { cur = { pts: [] }; runs.push(cur); }
    cur.pts.push(c); prev = c;
  }
  const out = [];
  for (const R of runs) {
    const hit = R.pts.filter((p) => p[3]);
    if (!hit.length || R.pts.length < 6) continue;
    const { m, n } = fitPlane(R.pts);
    if (n[1] > 0.995) continue;                                   // flat (not a roof slope)
    const d = norm3([n[0] * n[1], n[1] * n[1] - 1, n[2] * n[1]]); // down the slope: -UP projected on the plane
    const a = norm3(cross3(n, d));                                // along the courses
    const pitch = Math.acos(clamp(n[1], -1, 1));
    // courses (the queries of one course share their height) and the spacing inside them
    const pts = R.pts.map((p) => ({ p, w: NaN, g: NaN, f: 0 }));
    const courses = [];
    for (let i = 0; i < pts.length; i++) {
      if (!i || Math.abs(pts[i].p[1] - pts[i - 1].p[1]) > 0.004) courses.push({ y: pts[i].p[1], list: [] });
      courses[courses.length - 1].list.push(pts[i]);
    }
    const sp = [];
    for (const C of courses) {
      const L = C.list;
      for (let i = 0; i < L.length; i++) {
        const dd = (j) => (j >= 0 && j < L.length ? Math.hypot(L[j].p[0] - L[i].p[0], L[j].p[2] - L[i].p[2], L[j].p[1] - L[i].p[1]) : Infinity);
        const w = Math.min(dd(i - 1), dd(i + 1));
        L[i].w = w < 1.2 ? w : NaN;
        if (Number.isFinite(L[i].w)) sp.push(L[i].w);
      }
    }
    // gauge: the distance along the slope to the next course up
    for (let c = 0; c < courses.length; c++) {
      const up = courses[c + 1] || null, dn = courses[c - 1] || null;
      const g = up ? (up.y - courses[c].y) / Math.max(0.2, Math.sin(pitch)) : dn ? (courses[c].y - dn.y) / Math.max(0.2, Math.sin(pitch)) : 0.1;
      for (const q of courses[c].list) { q.g = g; q.f = 1 - c / Math.max(1, courses.length - 1); }
    }
    const tw = median(sp) || 0.17;
    const mean = sp.reduce((x, y) => x + y, 0) / Math.max(1, sp.length);
    const cv = Math.sqrt(sp.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, sp.length)) / Math.max(1e-6, mean);
    const sEave = Math.max(...R.pts.map((p) => dot3(p, d)));
    const info = new Map(pts.map((q) => [q.p, q]));
    out.push({ pts: R.pts, hit, info, m, n, d, a, tw, cv, sEave, pitch, coverGuess: cv > 0.14 ? 'slate' : 'clay', ts: tw > 0.235 ? 1.7 : 1 });
  }
  return out;
}

/**
 * Read the set's own roof covering near the removed tiles: clay or stone slate (whichever lies
 * there), the batch (the 1/20 bucket of the per-tile seed - roof.js) and the height of the top
 * faces (the roof as built: sagged, settled).
 */
function scanSetTiles(set, runs) {
  const meshes = [];
  set.traverse((m) => { if (m.isMesh && m.material && !Array.isArray(m.material) && /tile-(clay|slate)/.test(String(m.material.name)) && m.geometry.attributes.aInfo) meshes.push(m); });
  if (!meshes.length) return false;
  for (const R of runs) {
    // bounds: the removed tiles' box grown by 1.2 m
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of R.hit) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k] - 1.2); hi[k] = Math.max(hi[k], p[k] + 1.2); }
    const near = { clay: [], slate: [] }, buckets = { clay: new Map(), slate: new Map() };
    for (const mesh of meshes) {
      const kind = /tile-slate/.test(mesh.material.name) ? 'slate' : 'clay';
      mesh.updateWorldMatrix(true, false);
      const e = mesh.matrixWorld.elements;
      const P = mesh.geometry.attributes.position.array, I = mesh.geometry.attributes.aInfo.array, Nn = mesh.geometry.attributes.normal?.array;
      for (let i = 0, k = 0; k < P.length; i++, k += 3) {
        const x = e[0] * P[k] + e[4] * P[k + 1] + e[8] * P[k + 2] + e[12];
        if (x < lo[0] || x > hi[0]) continue;
        const z = e[2] * P[k] + e[6] * P[k + 1] + e[10] * P[k + 2] + e[14];
        if (z < lo[2] || z > hi[2]) continue;
        const y = e[1] * P[k] + e[5] * P[k + 1] + e[9] * P[k + 2] + e[13];
        if (y < lo[1] || y > hi[1]) continue;
        const s = (x - R.m[0]) * R.n[0] + (y - R.m[1]) * R.n[1] + (z - R.m[2]) * R.n[2];
        if (Math.abs(s) > 0.35) continue;
        const b = Math.floor(I[i * 4] * 20);
        buckets[kind].set(b, (buckets[kind].get(b) || 0) + 1);
        // top faces only (normal along the roof's normal)
        if (Nn) { const nx = e[0] * Nn[k] + e[4] * Nn[k + 1] + e[8] * Nn[k + 2], ny = e[1] * Nn[k] + e[5] * Nn[k + 1] + e[9] * Nn[k + 2], nz = e[2] * Nn[k] + e[6] * Nn[k + 1] + e[10] * Nn[k + 2]; if (nx * R.n[0] + ny * R.n[1] + nz * R.n[2] < 0.8) continue; }
        near[kind].push([x, y, z, s]);
      }
    }
    const nC = [...buckets.clay.values()].reduce((x, y) => x + y, 0), nS = [...buckets.slate.values()].reduce((x, y) => x + y, 0);
    if (!nC && !nS) continue;
    const kind = nS > nC ? 'slate' : 'clay';
    R.coverScan = kind;
    R.near = near[kind];
    let best = null, bn = 0;
    for (const [b, c] of buckets[kind]) if (c > bn) { bn = c; best = b; }
    R.bucket = best;
    R.sTop = median(R.near.map((v) => v[3]));
  }
  return true;
}

// ------------------------------------------------------------------ tiles in the set's own material --
const archLibs = new WeakMap();
/**
 * Clay tiles (and their shards) built with the architecture's own block() and tile material, in
 * the roof's clay batch: they are indistinguishable from the set's tiles while they are held.
 * Returns { kind: [variants...] } entries for the debris library (plain meshes: the arch shader
 * reads modelMatrix, so these pieces are not instanced).
 */
async function archTiles(fx, { bucket, ts = 1, cover = 'clay', seed = 1 }) {
  if (!archLibs.has(fx)) archLibs.set(fx, new Map());
  const cache = archLibs.get(fx);
  const key = `${cover}:${bucket}:${ts}`;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const [{ Kit, frame, block, makeRand }, { archMaterials }] = await Promise.all([import('../architecture/core.js'), import('../architecture/materials.js')]);
    const M = await archMaterials(fx.ctx);
    const slate = cover === 'slate';
    const mname = slate ? 'slate' : 'clay';
    const mat = M[mname];
    // clay: the plain tile at the roof's size; slate: a unit slate scaled per piece (SLATE_UNIT)
    const tl = slate ? SLATE_UNIT[2] : 0.27 * ts, tw = slate ? SLATE_UNIT[0] : 0.17 * ts, th = slate ? SLATE_UNIT[1] : 0.013;
    const sb = (bucket ?? Math.floor(hash01(seed, 5) * 20)) / 20 + 0.001;
    const one = (w, l, sd, shard) => {
      const kit = new Kit(0);
      const rnd = makeRand(sd);
      const camber = slate ? 0.002 * rnd() : 0.004 + rnd() * 0.004, lon = 0.003 * rnd();
      // shards: ragged broken edges; slates: ragged dressed edges as on the roof
      const ir = shard ? 0.25 * Math.min(w, l) : slate ? 0.012 : 0;
      const c4 = [rnd.sym(ir), rnd.sym(ir), rnd.sym(ir * 0.8), rnd.sym(ir * 0.8)];
      block(kit.get(mname), frame([0, 0, 0]), w, th, l, {
        r: 0, rs: 1, seg: [w / 3, th, l / 3], seed: sb + rnd() * 0.045, noise: 0.0015, nf: 7, chip: shard ? 0.01 : slate ? 0.008 : 0.002, axis: [0, 0, 1],
        aoFn: (lx, ly, lz) => 0.7 + 0.3 * THREE.MathUtils.smoothstep((lz + l / 2) / l, 0.45, 0.75),
        uvFn: (lx, ly, lz) => [lx + w / 2, lz + l / 2],
        warp: (lx, ly, lz) => {
          const u = lx / (w / 2), v = lz / (l / 2);
          const yy = ly + camber * (1 - u * u) + lon * (1 - v * v);
          return [lx + (c4[2] * (1 - v) + c4[3] * (1 + v)) * 0.5 * u * u, yy, lz + (c4[0] * (1 - u) + c4[1] * (1 + u)) * 0.5 * Math.max(0, v)];
        },
      });
      const grp = kit.build({ [mname]: mat }, { name: 'fx-roof-tile', origin: [0, 0, 0] });
      const m = grp.children[0];
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox, c = b.getCenter(new THREE.Vector3());
      m.geometry.translate(-c.x, -c.y, -c.z);
      const s = b.getSize(new THREE.Vector3());
      return { meshes: [{ geometry: m.geometry, material: mat }], half: [s.x / 2, s.y / 2, s.z / 2], instanced: false };
    };
    const tiles = [], shards = [];
    const nV = Math.max(4, Math.round(6 * fx.tier.fracture));
    for (let i = 0; i < nV; i++) tiles.push(one(tw - (slate ? 0 : 0.004), tl, seed * 31 + i * 0.137 + bucket * 0.01, false));
    for (let i = 0; i < nV + 2; i++) {
      const h = (k) => hash01(seed, i, 900 + k);
      shards.push(one(tw * (0.35 + 0.4 * h(0)), tl * (0.3 + 0.35 * h(1)), seed * 53 + i * 0.173 + bucket * 0.01, true));
    }
    tiles.as = 'tile'; shards.as = 'tileShard';
    return { tiles, shards };
  })();
  cache.set(key, p);
  return p;
}
// the unit stone slate [w, th, l] the slate pieces are scaled from
const SLATE_UNIT = [0.3, 0.026, 0.42];

// ------------------------------------------------------------------ roofline --
const rq = (seed, i) => {
  const u1 = hash01(seed, i, 41), u2 = hash01(seed, i, 42), u3 = hash01(seed, i, 43);
  const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
  return new THREE.Quaternion(s1 * Math.sin(2 * Math.PI * u2), s1 * Math.cos(2 * Math.PI * u2), s2 * Math.sin(2 * Math.PI * u3), s2 * Math.cos(2 * Math.PI * u3));
};
const randW = (seed, i, rate) => { const a = coneDir([0, 1, 0], Math.PI, hash01(seed, i, 51), hash01(seed, i, 52)); const r = rate * (0.3 + 0.7 * hash01(seed, i, 53)); return [a[0] * r, a[1] * r, a[2] * r]; };

/**
 * The roofline section of a house coming down where a dragon strikes it (3C-11).
 * o: capture (damageCapture), set (the built set group: matches clay batch + tile height),
 *    t0 (the strike), impact [x,y,z], dir (the force), speed (m/s at the impact),
 *    blast (m: radius blown out along dir, default 1.8), runSpeed (m/s the failure spreads,
 *    default 9), mu (tile-on-tile friction while sliding, default 0.25), sheet ([across, down]
 *    m: patches that slide together, default [0.9, 0.7]), cover 'clay' | 'slate',
 *    structure (true: battens, rafters, deck boards and splinters from the blast; or counts
 *    { rafter, batten, board, splinter }), dust (true: the cloud of roof-space dust and lime),
 *    walls (faces pieces bounce off), seed, tiles: false (no tiles: only the structure).
 * Returns the DebrisEffect (its .tiles: the number of roof tiles that come down).
 */
export async function roofline(fx, o, { library }) {
  const cap = o.capture;
  if (!cap?.calls?.length) throw new Error('fx roofline: o.capture (fx.debris.damageCapture) has recorded nothing - pass cap.damage to the set before calling roofline()');
  const runs = captureRuns(cap.calls);
  if (!runs.length) console.warn('[fx] roofline: no roof tiles were removed by the damage region');
  const scanned = o.set ? scanSetTiles(o.set, runs) : false;
  const seed = o.seed ?? 1;
  const base = await library(o);
  const lib = Object.create(base);
  const I = arr3(o.impact ?? runs[0]?.m ?? [0, 0, 0]);
  const D = norm3(arr3(o.dir ?? [0, -0.3, 1]));
  const V = o.speed ?? 8;
  const Rb = o.blast ?? 1.8;
  const runSpeed = o.runSpeed ?? 9;
  const t0 = o.t0 ?? 0;
  const sheet = o.sheet ?? [0.9, 0.7];
  const pieces = [];
  let nTiles = 0;
  for (let ri = 0; ri < runs.length; ri++) {
    const R = runs[ri];
    const bucket = R.bucket ?? o.batch ?? Math.floor(hash01(seed, ri, 3) * 20);
    const cover = o.cover || R.coverScan || R.coverGuess;
    const slate = cover === 'slate';
    const ts = slate ? 1 : R.ts;
    R.cover = cover;
    const kind = `roofTile:${cover}:${bucket}:${ts}`;
    if (!lib[kind]) {
      const A = await archTiles(fx, { bucket, ts, cover, seed });
      lib[kind] = A.tiles; lib[`${kind}:shard`] = A.shards;
    }
    // centres: up the slope from the queried tail, at the height of the set's own tiles
    const cells = new Map();
    const tiles = R.hit.map((p, j) => {
      // size: a plain tile; a stone slate from its course (gauge -> length) and its neighbours
      let tl, tw, th, scale = 1;
      if (slate) {
        const q = R.info.get(p) || { w: 0.3, g: 0.17, f: 0.5 };
        tw = clamp(Number.isFinite(q.w) ? q.w - 0.008 : 0.3, 0.12, 0.7);
        tl = clamp((Number.isFinite(q.g) ? q.g : 0.17) / 0.42, 0.18, 0.75);
        th = 0.018 + 0.016 * q.f;
        scale = [tw / SLATE_UNIT[0], th / SLATE_UNIT[1], tl / SLATE_UNIT[2]];
      } else { tl = 0.27 * ts; tw = 0.17 * ts; th = 0.013; }
      const tilt = Math.atan2(th * 1.6, tl);
      // the tile frame: x along the course, y out of the roof (leaning uphill: the tail sits on
      // the course below), z down the slope
      const X = R.a, Y = norm3([R.n[0] * Math.cos(tilt) - R.d[0] * Math.sin(tilt), R.n[1] * Math.cos(tilt) - R.d[1] * Math.sin(tilt), R.n[2] * Math.cos(tilt) - R.d[2] * Math.sin(tilt)]);
      const Z = cross3(X, Y);
      const q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...X), new THREE.Vector3(...Y), new THREE.Vector3(...Z)));
      const c = [p[0] - R.d[0] * tl * 0.5, p[1] - R.d[1] * tl * 0.5, p[2] - R.d[2] * tl * 0.5];
      const s0 = (c[0] - R.m[0]) * R.n[0] + (c[1] - R.m[1]) * R.n[1] + (c[2] - R.m[2]) * R.n[2];
      let target = s0 + 0.03;
      if (scanned && R.near?.length) {
        const loc = [];
        for (const v of R.near) { const dx = v[0] - c[0], dy = v[1] - c[1], dz = v[2] - c[2]; if (dx * dx + dy * dy + dz * dz < 1.0) loc.push(v[3]); }
        const top = loc.length >= 8 ? median(loc) : R.sTop;
        if (Number.isFinite(top)) target = top - th * 0.6;
      }
      for (let k = 0; k < 3; k++) c[k] += R.n[k] * (target - s0);
      // sheets: patches of tiles (a few battens' worth) that let go and slide together
      const ca = Math.floor(dot3(c, R.a) / sheet[0] + 0.5 * hash01(seed, ri, 7)), cd = Math.floor(dot3(c, R.d) / sheet[1]);
      const ck = `${ca}:${cd}`;
      if (!cells.has(ck)) cells.set(ck, { ca, cd, list: [] });
      const T = { p: c, j, ck, q0, scale, tl };
      cells.get(ck).list.push(T);
      return T;
    });
    // release time per sheet: the failure spreads from the impact; a patch never lets go after
    // the one above it has slid onto it (lowest patches of a column first)
    const sinA = Math.sin(R.pitch), cosA = Math.cos(R.pitch);
    for (const C of cells.values()) {
      const cc = [0, 0, 0];
      for (const T of C.list) for (let k = 0; k < 3; k++) cc[k] += T.p[k] / C.list.length;
      C.c = cc;
      C.r = Math.hypot(cc[0] - I[0], cc[1] - I[1], cc[2] - I[2]);
      C.te = t0 + Math.max(0, C.r - Rb * 0.5) / runSpeed + 0.06 * hash01(seed, C.ca, C.cd, 1);
      C.mu = (o.mu ?? 0.25) * (0.8 + 0.4 * hash01(seed, C.ca, C.cd, 2));
      C.acc = 9.81 * (sinA - C.mu * cosA);
      C.v0 = 0.15 + 0.5 * hash01(seed, C.ca, C.cd, 3);
    }
    const byCol = new Map();
    for (const C of cells.values()) { if (!byCol.has(C.ca)) byCol.set(C.ca, []); byCol.get(C.ca).push(C); }
    for (const col of byCol.values()) {
      col.sort((x, y) => dot3(y.c, R.d) - dot3(x.c, R.d));     // lowest (nearest the eaves) first
      for (let i = 1; i < col.length; i++) {
        const lower = col[i - 1], upper = col[i];
        if (upper.r < Rb) continue;
        if (lower.te > upper.te) lower.te = upper.te + 0.02;
      }
    }
    for (const T of R.hit.length ? tiles : []) {
      const C = cells.get(T.ck);
      const r = Math.hypot(T.p[0] - I[0], T.p[1] - I[1], T.p[2] - I[2]);
      const h = (k) => hash01(seed * 977 + ri, T.j, k);
      const P = { kind, variant: (h(0) * 97) | 0, p0: T.p, q0: T.q0, hold: true, scale: T.scale };
      if (r < Rb && o.tiles !== false) {
        // blown out along the strike
        const f = Math.sqrt(1 - r / Rb);
        const dd = coneDir(D, 0.55, h(1), h(2));
        const sp = V * (0.35 + 0.65 * h(3)) * (0.4 + 0.6 * f);
        P.te = t0 + r / (runSpeed * 3) + 0.03 * h(4);
        P.v0 = [dd[0] * sp + R.n[0] * 1.2 * h(5), dd[1] * sp + R.n[1] * 1.2 * h(5), dd[2] * sp + R.n[2] * 1.2 * h(5)];
        P.w0 = randW(seed * 7 + ri, T.j, 10 + 14 * h(6));
      } else if (o.tiles !== false) {
        // slides with its sheet to the eaves and tips off
        P.te = C.te + 0.015 * h(4);
        const dist = Math.max(0, R.sEave + 0.04 - dot3(T.p, R.d) + T.tl * 0.5);
        P.incline = { d: R.d, a: Math.max(0.6, C.acc), dist, v0: C.v0 };
        P.v0 = [R.n[0] * 0.25 * h(5), R.n[1] * 0.25 * h(5), R.n[2] * 0.25 * h(5)];
        const tip = 2.5 + 4 * h(6);
        P.w0 = [R.a[0] * tip + (h(7) - 0.5) * 2, R.a[1] * tip + (h(8) - 0.5) * 2, R.a[2] * tip + (h(9) - 0.5) * 2];
      } else continue;
      pieces.push(P); nTiles++;
    }
  }
  // the structure behind the tiles: battens, rafters, deck boards, splinters, blown from the strike
  if (o.structure !== false && runs.length) {
    const area = runs.reduce((s, R) => s + R.hit.length * R.tw * 0.1 * R.ts, 0);
    const S = typeof o.structure === 'object' ? o.structure : {
      rafter: Math.min(4, 1 + Math.round(area / 3)), batten: Math.min(18, 3 + Math.round(area * 2)),
      board: Math.min(6, 1 + Math.round(area / 1.5)), splinter: Math.min(40, 8 + Math.round(area * 4)),
    };
    const near = [];
    for (const R of runs) for (const p of R.hit) if (Math.hypot(p[0] - I[0], p[1] - I[1], p[2] - I[2]) < Rb * 1.4) near.push(p);
    const src = near.length ? near : runs[0].hit;
    let i = 0;
    for (const [kind, n0] of Object.entries(S)) {
      if (!lib[kind]) continue;
      const n = kind === 'rafter' || kind === 'board' ? n0 : Math.max(1, Math.round(n0 * fx.tier.fracture));
      for (let c = 0; c < n; c++, i++) {
        const h = (k) => hash01(seed * 131, i, k);
        const p = src[(h(0) * src.length) | 0];
        const r = Math.hypot(p[0] - I[0], p[1] - I[1], p[2] - I[2]);
        const dd = coneDir(D, 0.7, h(1), h(2));
        const heavy = kind === 'rafter' ? 0.35 : kind === 'board' ? 0.6 : 1;
        const sp = V * (0.3 + 0.7 * h(3)) * heavy * Math.max(0.3, 1 - r / (Rb * 1.4));
        pieces.push({
          kind, variant: (h(4) * 97) | 0, te: t0 + r / (runSpeed * 3) + 0.06 * h(5), p0: [p[0] - 0.1 * runs[0].n[0], p[1] - 0.12, p[2] - 0.1 * runs[0].n[2]],
          v0: [dd[0] * sp, dd[1] * sp, dd[2] * sp], q0: rq(seed * 3, i), w0: randW(seed * 3, i, (kind === 'rafter' ? 3 : kind === 'splinter' ? 25 : 9) * (0.5 + h(6))), scale: 0.8 + 0.4 * h(7),
        });
      }
    }
  }
  const eff = fx.add(new DebrisEffect(fx, { name: 'fx-roofline', maxImpacts: 220, ...o, pieces }, lib));
  eff.tiles = nTiles;
  eff.runs = runs.map((R) => ({ cover: R.cover, n: R.n.map((v) => +v.toFixed(3)), tiles: R.hit.length, bucket: R.bucket, ts: R.ts, cv: +R.cv.toFixed(3), sTop: R.sTop }));
  if (o.dust !== false && runs.length) {
    // the dust of a century in the roof space (soot, lime, old mortar): grey-brown, thrown with
    // the strike and thinning fast in the open air; curtains of it pouring off the eaves with
    // each sheet; lime and grit where the roof lands; then a haze settling over the square
    const dz = typeof o.dust === 'object' ? o.dust : {};
    const ROOF = dz.color ?? [0.5, 0.47, 0.42], LIME = dz.color2 ?? [0.6, 0.57, 0.52];
    const s = dz.strength ?? 1;
    eff.dust = [
      fx.dust.cloud({ at: I, t0: t0 + 0.02, radius: dz.radius ?? (1.3 + Rb * 0.5), dir: D, spread: 1.5, speed: V * 0.4, color: ROOF, life: 8, grow: 0.75, thin: 1.6, fall: 0.45, strength: 0.5 * s, puffs: dz.puffs ?? 240, seed: seed * 5 + 1 }),
    ];
    // curtains: the biggest sheets, where and when they go over the eaves
    const curtains = [];
    for (const P of eff.pieces) {
      if (!P.incline || P.shard) continue;
      const s0 = P.sol.segs[0];
      if (s0.type !== 3) continue;
      const tEdge = s0.t1, e = [s0.p[0] + s0.d[0] * P.incline.dist, s0.p[1] + s0.d[1] * P.incline.dist, s0.p[2] + s0.d[2] * P.incline.dist];
      const key = `${Math.round(e[0] / 0.9)}:${Math.round(tEdge / 0.25)}`;
      const c = curtains.find((x) => x.key === key);
      if (c) { c.n++; continue; }
      curtains.push({ key, t: tEdge, p: e, d: s0.d, n: 1 });
    }
    curtains.sort((x, y) => y.n - x.n);
    for (const [k, c] of curtains.slice(0, dz.curtains ?? 6).entries()) {
      eff.dust.push(fx.dust.cloud({ at: c.p, t0: c.t - 0.05, radius: 0.7 + 0.04 * c.n, dir: [c.d[0], -0.9, c.d[2]], spread: 0.7, speed: 3.5, color: ROOF, life: 5, grow: 0.8, thin: 1.4, fall: 0.6, strength: 0.4 * s, puffs: 36, seed: seed * 17 + k }));
    }
    // where the roof lands: the first heavy contacts under the eaves
    const hits = eff.events.filter((ev) => !ev.wall && ev.speed > 4);
    if (hits.length) {
      const c = [0, 0, 0];
      let tl = Infinity;
      for (const ev of hits) { for (let k = 0; k < 3; k++) c[k] += ev.p[k] / hits.length; tl = Math.min(tl, ev.t); }
      c[1] = fx.ground(c[0], c[2]) + 0.1;
      eff.dust.push(fx.dust.cloud({ at: c, t0: tl, radius: dz.radius2 ?? 2.4, dir: [D[0] * 0.4, 0.5, D[2] * 0.4], spread: 1.4, speed: 3, color: LIME, life: 9, grow: 1.0, thin: 0.9, strength: 0.6 * s, puffs: dz.puffs2 ?? 120, seed: seed * 5 + 2 }));
      if (dz.haze !== false) {
        const r = 4 + Rb;
        eff.dust.push(fx.dust.haze({ box: [[c[0] - r, c[1] - 0.1, c[2] - r], [c[0] + r, c[1] + 3.5, c[2] + r]], t0: tl + 1.5, t1: tl + 60, density: 0.035 * s, color: LIME, puffs: 90, seed: seed * 5 + 3 }));
      }
    }
  }
  return eff;
}

// ------------------------------------------------------------------ thrown objects --
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion();

/**
 * A whole prop thrown by the blast (3C-12 the vendor's stall swept into the square, R16b the
 * guard's spear, X23 the watchman's cup): held where the set put it until t0, then the same
 * closed-form flight / bounce / slide / rest as the debris. The object stays the object (its own
 * meshes and materials); only its transform is driven.
 * o: object, t0, v0 | (dir, speed), w0 | spin ([x,y,z] rad/s, world), e, mu, k (drag), bounces,
 *    walls, half (override of the box), impactDust (true), dustScale, topple (default: an object
 *    standing on the ground tips over its far bottom edge before it tumbles; { w0, past } or
 *    false), carry (fraction of the push's velocity it keeps when it leaves the edge, 0.4).
 */
export class ThrownObject extends Effect {
  constructor(fx, o) {
    super(fx, { name: 'fx-thrown', ...o });
    this.velocityPose = true;
    const obj = o.object;
    obj.updateWorldMatrix(true, true);
    const inv = obj.matrixWorld.clone().invert();
    const box = new THREE.Box3();
    obj.traverse((m) => {
      if (!m.isMesh || !m.geometry) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox.clone().applyMatrix4(_m.multiplyMatrices(inv, m.matrixWorld)));
    });
    const cL = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    obj.matrixWorld.decompose(pos, quat, scl);
    this.obj = obj; this.cL = cL; this.scl = scl;
    this.home = { p: obj.position.clone(), q: obj.quaternion.clone(), s: obj.scale.clone() };
    const half = o.half || [size.x / 2 * scl.x, size.y / 2 * scl.y, size.z / 2 * scl.z];
    const p0 = cL.clone().applyMatrix4(obj.matrixWorld).toArray();
    const dir = norm3(arr3(o.dir ?? [0, 0.3, 1]));
    const v0 = o.v0 ? arr3(o.v0) : dir.map((x) => x * (o.speed ?? 5));
    const w0 = arr3(o.w0 ?? o.spin ?? [0, 0, 0]);
    // standing on the ground and pushed sideways: it tips over its bottom edge on the far side
    // first (a stall does not hop off the paving), then tumbles (o.topple: false to throw it clear)
    let pivot = null;
    const vh = Math.hypot(v0[0], v0[2]);
    const bottom = cL.clone().setY(box.min.y).applyMatrix4(obj.matrixWorld);
    if (o.topple !== false && vh > 0.3 && Math.abs(bottom.y - fx.ground(bottom.x, bottom.z)) < 0.05) {
      const n = [v0[0] / vh, 0, v0[2] / vh];
      // the bottom edge (of the object's own box) facing the push
      let best = null;
      for (const [k, sgn] of [[0, 1], [0, -1], [2, 1], [2, -1]]) {
        const loc = new THREE.Vector3(...[0, 1, 2].map((i) => (i === k ? sgn : 0)));
        const wd = loc.clone().transformDirection(obj.matrixWorld);
        const sc = wd.x * n[0] + wd.z * n[2];
        if (!best || sc > best.sc) best = { sc, k, sgn, wd };
      }
      const e = cL.clone();
      e.setComponent(best.k, best.sgn > 0 ? box.max.getComponent(best.k) : box.min.getComponent(best.k));
      e.y = box.min.y;
      const E = e.applyMatrix4(obj.matrixWorld).toArray();
      const out = norm3([best.wd.x, 0, best.wd.z]);
      const axis = norm3(cross3(UP, out));
      const r = Math.hypot(p0[0] - E[0], p0[1] - E[1], p0[2] - E[2]);
      pivot = { E, axis, w0: o.topple?.w0 ?? vh / Math.max(0.3, r), past: o.topple?.past ?? 0.35, carry: [v0[0] * (o.carry ?? 0.4), Math.max(0, v0[1]) * (o.carry ?? 0.4), v0[2] * (o.carry ?? 0.4)] };
    }
    this.sol = solvePiece(p0, v0, quat, w0, half, o.t0 ?? 0, { ground: (x, z) => fx.ground(x, z), k: o.k ?? 0.08, e: o.e ?? 0.15, mu: o.mu ?? 0.55, bounces: o.bounces ?? 4, walls: prepWalls(o.walls), hold: true, pivot });
    this.half = half;
    obj.traverse((m) => { if (m.isMesh) this.casters.push(m); });
    // impacts: grit and dust where it hits (the debris effect's own drawing)
    const mass = half[0] * half[1] * half[2] * 8;
    this.events = this.sol.events.filter((ev) => ev.speed > 1).map((ev, i) => ({ ...ev, kind: o.material || 'board', mass: Math.min(mass, 0.05), i }));
    this.grit = o.grit === false ? null : this.layer(new ParticleLayer(fx, { max: Math.max(8, this.events.length * 8), mode: 'chip', name: 'fx-thrown-grit', soft: 0.02, shading: { albedo: [1, 1, 1] } }));
    this.dust = o.impactDust === false ? null : this.layer(new ParticleLayer(fx, {
      max: Math.max(3, this.events.length * 3), mode: 'puff', name: 'fx-thrown-dust', soft: 0.3,
      shading: { albedo: [1, 1, 1], ms: 0.75, sigma: 2.2, g: 0.5, noiseScale: 1.6, noiseAmt: 1.0, evolve: 0.4, billow: 0.75, edge: 0.7 },
    }));
    this.dustScale = o.dustScale ?? 2;
    this._p = [0, 0, 0];
  }
  /** Put the object back where the set has it (the director, when the cue is not running). */
  restore() { const obj = this.obj; obj.position.copy(this.home.p); obj.quaternion.copy(this.home.q); obj.scale.copy(this.home.s); obj.updateMatrixWorld(true); }
  /** Where it ends up (the after-state). */
  restPose() { const s = this.sol.segs[this.sol.segs.length - 1]; return s.type === 2 ? { p: s.p.slice(), q: s.q.clone() } : null; }
  update(t, cam) {
    for (const l of this.layers) l.begin();
    const obj = this.obj;
    if (poseAt(this.sol, t, this._p, _q)) {
      // world = T(centre) R S T(-centre in the object's frame), then into the parent's frame
      _m.compose(_v.set(...this._p), _q, this.scl);
      _m.multiply(_m2.makeTranslation(-this.cL.x, -this.cL.y, -this.cL.z));
      if (obj.parent) { obj.parent.updateWorldMatrix(true, false); _m.premultiply(_m2.copy(obj.parent.matrixWorld).invert()); }
      _m.decompose(obj.position, obj.quaternion, obj.scale);
    } else { obj.position.copy(this.home.p); obj.quaternion.copy(this.home.q); obj.scale.copy(this.home.s); }
    obj.updateMatrixWorld(true);
    if (!this.fx.shutterOpenPass) DebrisEffect.prototype.drawImpacts.call(this, t);
    for (const l of this.layers) l.end(cam);
  }
}

// ------------------------------------------------------------------ loose parts --
/**
 * Split a built prop (one merged mesh per material, as the props / architecture kits build them)
 * into its loose parts: the triangles' connected pieces (welded at 1 mm), grouped by overlapping
 * bounds (overlap > -gap: a hoop on its barrel, apples inside their basket, the rails through
 * the posts) - but a loaf merely resting ON the counter stays a part of its own. The parts
 * replace the object in its parent (same materials, positions unchanged).
 * Returns the parts, largest first.
 */
export function splitObject(object, o = {}) {
  const gap = o.gap ?? -0.003;
  object.updateWorldMatrix(true, true);
  const comps = [];                              // { mesh, tris: [triangle indices], box }
  object.traverse((m) => {
    if (!m.isMesh || !m.geometry?.attributes?.position) return;
    const g = m.geometry, P = g.attributes.position, idx = g.index ? g.index.array : null;
    const nt = (idx ? idx.length : P.count) / 3;
    // union-find on vertices, welded by position
    const par = new Int32Array(P.count);
    for (let i = 0; i < P.count; i++) par[i] = i;
    const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
    const weld = new Map();
    for (let i = 0; i < P.count; i++) {
      const k = `${Math.round(P.getX(i) * 1000)},${Math.round(P.getY(i) * 1000)},${Math.round(P.getZ(i) * 1000)}`;
      const j = weld.get(k);
      if (j === undefined) weld.set(k, i); else uni(i, j);
    }
    const vi = (t, c) => (idx ? idx[t * 3 + c] : t * 3 + c);
    for (let t = 0; t < nt; t++) { uni(vi(t, 0), vi(t, 1)); uni(vi(t, 0), vi(t, 2)); }
    const byRoot = new Map();
    const v = new THREE.Vector3();
    for (let t = 0; t < nt; t++) {
      const r = find(vi(t, 0));
      let c = byRoot.get(r);
      if (!c) { c = { mesh: m, tris: [], box: new THREE.Box3() }; byRoot.set(r, c); comps.push(c); }
      c.tris.push(t);
      for (let k = 0; k < 3; k++) c.box.expandByPoint(v.fromBufferAttribute(P, vi(t, k)).applyMatrix4(m.matrixWorld));
    }
  });
  // group components whose bounds overlap (by more than -gap)
  const n = comps.length, par = new Int32Array(n);
  for (let i = 0; i < n; i++) par[i] = i;
  const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const order = comps.map((c, i) => i).sort((a, b) => comps[a].box.min.x - comps[b].box.min.x);
  for (let a = 0; a < n; a++) {
    const A = comps[order[a]].box;
    for (let b = a + 1; b < n; b++) {
      const B = comps[order[b]].box;
      if (B.min.x > A.max.x + gap) break;
      if (A.min.y <= B.max.y + gap && B.min.y <= A.max.y + gap && A.min.z <= B.max.z + gap && B.min.z <= A.max.z + gap && A.min.x <= B.max.x + gap) {
        const ra = find(order[a]), rb = find(order[b]); if (ra !== rb) par[ra] = rb;
      }
    }
  }
  const groups = new Map();
  comps.forEach((c, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(c); });
  // build one Group per part: per source mesh, the part's triangles as their own geometry
  const parts = [];
  const parent = object.parent;
  for (const list of groups.values()) {
    const grp = new THREE.Group();
    grp.name = `${object.name || 'prop'}:part${parts.length}`;
    const byMesh = new Map();
    for (const c of list) { if (!byMesh.has(c.mesh)) byMesh.set(c.mesh, []); byMesh.get(c.mesh).push(...c.tris); }
    const box = new THREE.Box3();
    for (const [m, tris] of byMesh) {
      const g = m.geometry, idx = g.index ? g.index.array : null;
      const ng = new THREE.BufferGeometry();
      const keep = new Map(), remap = [];
      const I = new Uint32Array(tris.length * 3);
      tris.forEach((t, j) => { for (let k = 0; k < 3; k++) { const vi = idx ? idx[t * 3 + k] : t * 3 + k; let ni = keep.get(vi); if (ni === undefined) { ni = remap.length; keep.set(vi, ni); remap.push(vi); } I[j * 3 + k] = ni; } });
      for (const [name, attr] of Object.entries(g.attributes)) {
        const isz = attr.itemSize, src = attr.array, out = new src.constructor(remap.length * isz);
        remap.forEach((vi, j) => { for (let k = 0; k < isz; k++) out[j * isz + k] = src[vi * isz + k]; });
        ng.setAttribute(name, new THREE.BufferAttribute(out, isz, attr.normalized));
      }
      ng.setIndex(new THREE.BufferAttribute(I, 1));
      ng.userData = { ...g.userData };
      const nm = new THREE.Mesh(ng, m.material);
      nm.name = m.name; nm.castShadow = m.castShadow; nm.receiveShadow = m.receiveShadow;
      // the part keeps the source mesh's world placement (expressed in the object's parent)
      const M = m.matrixWorld.clone();
      if (parent) { parent.updateWorldMatrix(true, false); M.premultiply(parent.matrixWorld.clone().invert()); }
      M.decompose(nm.position, nm.quaternion, nm.scale);
      grp.add(nm);
      for (const c of list) if (c.mesh === m) box.union(c.box);
    }
    grp.userData.box = box;
    grp.userData.size = box.getSize(new THREE.Vector3()).length();
    parts.push(grp);
  }
  parts.sort((a, b) => b.userData.size - a.userData.size);
  if (parent) { parent.remove(object); for (const p of parts) parent.add(p); }
  return parts;
}

/**
 * A prop swept by a blast (3C-12: the vendor's stall swept into the square): split into its loose
 * parts; the frame topples over its far edge and tumbles, everything loose on it or beside it
 * (goods, baskets, a barrel, a crate, sacks) is thrown with the gust, the lighter the further.
 * o: object, t0, dir, speed, spread (rad), seed, gap (splitObject), keep (parts smaller than this
 * diagonal, m, stay where they are: crumbs, default 0.04), walls, + ThrownObject options for the frame.
 * Returns { parts, effects }.
 */
export function sweepObject(fx, o) {
  const parts = splitObject(o.object, { gap: o.gap });
  const effects = [];
  const dir = norm3(arr3(o.dir ?? [0, 0.3, 1]));
  const speed = o.speed ?? 7, seed = o.seed ?? 1;
  parts.forEach((part, i) => {
    const size = part.userData.size;
    if (size < (o.keep ?? 0.04)) return;
    if (i === 0) { effects.push(fx.add(new ThrownObject(fx, { ...o, object: part, dir, speed }))); return; }
    const h = (k) => hash01(seed * 71 + i, 17, k);
    // lighter (smaller) things go faster and higher; each a little later as the gust reaches it
    const light = clamp(0.6 / Math.max(0.15, size), 0.6, 1.6);
    const d = coneDir(norm3([dir[0], dir[1] + 0.25 + 0.3 * h(0), dir[2]]), o.spread ?? 0.35, h(1), h(2));
    const sp = speed * light * (0.6 + 0.5 * h(3));
    const rate = (6 + 8 * h(4)) * light;
    const a = coneDir([0, 1, 0], Math.PI, h(5), h(6));
    effects.push(fx.add(new ThrownObject(fx, {
      object: part, t0: (o.t0 ?? 0) + 0.05 + 0.12 * h(7), v0: d.map((x) => x * sp), w0: a.map((x) => x * rate),
      topple: false, e: 0.2, mu: 0.6, walls: o.walls, impactDust: size > 0.3, material: o.material,
    })));
  });
  return { parts, effects };
}
