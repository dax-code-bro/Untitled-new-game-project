// FX library - rigid debris and destruction: roof tiles and shards, snapped oak beams and stall
// boards, lime plaster and daub, stone rubble, torn turf and clods, every piece a real mesh that
// flies, tumbles, bounces, skids and comes to rest LYING FLAT on the ground - a pure function of t.
//
//   fx.debris.burst({ at, dir, t0, pieces: { tile: 30, tileShard: 40, beam: 2, board: 5, plaster: 20, stone: 10 }, speed, spread })
//   fx.debris.collapse({ box: [[x0,y0,z0],[x1,y1,z1]], t0, dir, ... })   a roofline coming down
//   fx.debris.boards({ at, dir, t0, count })                              stage boards scything over paving
//   fx.debris.turf({ at, radius, t0, bursts })                            take-off: turf, clods, stones
//
// Trajectories are solved ONCE in setup (deterministic, closed-form pieces): a drag ballistic
// flight; at each ground contact the normal speed is reversed with restitution e and the tangential
// speed loses friction (Coulomb impulse), spin is re-drawn from the impact; below ~1.5 m/s normal
// speed the piece slides, decelerating at mu*g, while it settles from its tumbling attitude onto
// its nearest flat face; then it rests. update(t) only evaluates the segment t falls in, so any
// frame can be drawn alone. Impacts throw grit and a puff of dust (impact events, also pure in t).
// Geometry: the props library's breakables (scenes/lib/props/festival.js: the same tiles, beams and
// boards the Cling set is dressed with) when available, else built here; plaster, stone and turf are
// built here. One InstancedMesh per variant and material; they cast shadows and get motion blur.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { Effect } from './core/manager.js';
import { ParticleLayer } from './core/particles.js';
import { hash01, arr3, clamp, smoothstep, ballistic, coneDir, norm3, dot3, len3, cross3 } from './core/util.js';

const G = [0, -9.81, 0];

// ------------------------------------------------------------------ materials --
const FRAG_GLSL = /* glsl */`
float dbH(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float dbN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dbH(i), dbH(i + vec3(1,0,0)), f.x), mix(dbH(i + vec3(0,1,0)), dbH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dbH(i + vec3(0,0,1)), dbH(i + vec3(1,0,1)), f.x), mix(dbH(i + vec3(0,1,1)), dbH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float dbF(vec3 p) { return dbN(p) * 0.5 + dbN(p * 2.07 + 3.1) * 0.3 + dbN(p * 4.3 + 7.7) * 0.2; }
`;

/**
 * A lit material for fragments: vertex colours (per-face zones baked by the builders) mottled by
 * object-space noise; roughness and a small normal wobble from the same noise.
 */
function fragmentMaterial(name, o = {}) {
  const m = new THREE.MeshStandardMaterial({ name, vertexColors: true, roughness: o.roughness ?? 0.85, metalness: 0 });
  const U = { uMot: { value: o.mottle ?? 0.3 }, uMotF: { value: o.freq ?? 30 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vObjP; uniform float uMot, uMotF;\n${FRAG_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float dbm = dbF(vObjP * uMotF);
diffuseColor.rgb *= 1.0 - uMot * 0.5 + uMot * dbm;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (dbm - 0.5) * 0.2, 0.05, 1.0);');
  };
  m.customProgramCacheKey = () => 'fx-debris-frag';
  return m;
}

// ------------------------------------------------------------------ geometry builders --
function colorize(geo, fn) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const col = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), i);
    c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
/** Irregular convex lump (stone, clod): hull of jittered points on an ellipsoid. */
function lumpGeometry(seed, size, flat = 0.6) {
  const pts = [];
  const n = 18;
  for (let i = 0; i < n; i++) {
    const u = hash01(seed, i, 1) * 2 - 1, a = hash01(seed, i, 2) * Math.PI * 2, r = 0.7 + 0.3 * hash01(seed, i, 3);
    const s = Math.sqrt(1 - u * u);
    pts.push(new THREE.Vector3(Math.cos(a) * s * size[0] * r, u * size[1] * r * flat, Math.sin(a) * s * size[2] * r));
  }
  const g = new ConvexGeometry(pts);
  return g.toNonIndexed ? g : g;
}
/** A slab with a ragged outline (plaster, turf): top face, bottom face, ragged sides. */
function slabGeometry(seed, w, d, th, rag = 0.25) {
  const N = 14;
  const ring = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = 1 - rag * hash01(seed, i, 4) - rag * 0.5 * (i % 2 ? hash01(seed, i, 5) : 0);
    ring.push([Math.cos(a) * w * 0.5 * r, Math.sin(a) * d * 0.5 * r]);
  }
  const P = [], I = [];
  const topY = (x, z) => th * 0.5 + th * 0.12 * (hash01(seed, Math.round(x * 50), Math.round(z * 50)) - 0.5);
  // top centre, ring top, ring bottom, bottom centre
  P.push(0, th * 0.5, 0);
  for (const [x, z] of ring) P.push(x, topY(x, z), z);
  for (const [x, z] of ring) P.push(x * 0.95, -th * 0.5, z * 0.95);
  P.push(0, -th * 0.5, 0);
  const top = 0, rt = 1, rb = 1 + N, bot = 1 + 2 * N;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    I.push(top, rt + j, rt + i);
    I.push(bot, rb + i, rb + j);
    I.push(rt + i, rt + j, rb + j, rt + i, rb + j, rb + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
}
/** Fallback timber piece (when the props kit is not used): a box with splintered ends. */
function timberGeometry(seed, L, h, w) {
  const g = new THREE.BoxGeometry(L, h, w, 12, 2, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    if (Math.abs(x) > L * 0.45) {
      const sgn = Math.sign(x);
      const sp = hash01(seed, Math.round(p.getY(i) * 400), Math.round(p.getZ(i) * 400)) * 0.12 * L;
      p.setX(i, x + sgn * sp);
    }
  }
  g.computeVertexNormals();
  return g;
}

const SOIL = [0.11, 0.075, 0.045], SOIL_DRY = [0.2, 0.155, 0.11], GRASS = [0.12, 0.16, 0.05];
const PLASTER = [0.62, 0.6, 0.55], DAUB = [0.28, 0.21, 0.14];
const STONE = [0.42, 0.39, 0.34];

/** Build the fragment library: { kind: [{ meshes: [{ geometry, material }], half: [hx,hy,hz] }] } */
async function buildLibrary(fx, o) {
  const lib = {};
  const tier = fx.tier;
  const mats = {
    plaster: fragmentMaterial('fx-plaster', { roughness: 0.9, mottle: 0.25, freq: 40 }),
    stone: fragmentMaterial('fx-stone', { roughness: 0.82, mottle: 0.35, freq: 18 }),
    turf: fragmentMaterial('fx-turf', { roughness: 0.95, mottle: 0.45, freq: 55 }),
    timber: fragmentMaterial('fx-timber', { roughness: 0.8, mottle: 0.3, freq: 12 }),
    tile: fragmentMaterial('fx-tile', { roughness: 0.85, mottle: 0.3, freq: 25 }),
  };
  const half = (g) => { g.computeBoundingBox(); const b = g.boundingBox; return [(b.max.x - b.min.x) / 2, (b.max.y - b.min.y) / 2, (b.max.z - b.min.z) / 2]; };
  const centre = (g) => { g.computeBoundingBox(); const c = g.boundingBox.getCenter(new THREE.Vector3()); g.translate(-c.x, -c.y, -c.z); return g; };
  // props breakables (the Cling set's own tiles / beams / boards)
  let fk = null;
  if (o.props !== false) {
    try {
      const { festivalKit } = await import('../props/festival.js');
      const { Kit, frame, rng } = await import('../props/core.js');
      fk = { api: await festivalKit(fx.ctx), Kit, frame, rng };
    } catch (e) { console.warn('[fx] debris: props kit not available, using built-in pieces:', e.message); }
  }
  const fromKit = (kind, seed, opts = {}) => {
    const kit = new fk.Kit();
    const rnd = fk.rng(seed);
    fk.api.breakables(kit, fk.frame([0, 0, 0]), rnd, kind, opts);
    const grp = kit.build(fk.api.mats, { name: `fx-${kind}` });
    // centre the piece on its bounding box (all meshes together)
    const box = new THREE.Box3().setFromObject(grp);
    const c = box.getCenter(new THREE.Vector3());
    const meshes = grp.children.map((m) => { m.geometry.translate(-c.x, -c.y, -c.z); return { geometry: m.geometry, material: m.material }; });
    const s = box.getSize(new THREE.Vector3());
    return { meshes, half: [s.x / 2, s.y / 2, s.z / 2] };
  };
  const V = (n) => Math.max(1, Math.round(n * Math.min(1.5, 0.6 + 0.4 * tier.fracture)));
  // tiles
  lib.tile = []; lib.tileShard = [];
  for (let i = 0; i < V(2); i++) {
    if (fk) lib.tile.push(fromKit('tile', 11 + i));
    else { const g = centre(colorize(new THREE.BoxGeometry(0.265, 0.014, 0.165), () => [0.2, 0.09, 0.05])); lib.tile.push({ meshes: [{ geometry: g, material: mats.tile }], half: half(g) }); }
  }
  for (let i = 0; i < V(5); i++) {
    if (fk) lib.tileShard.push(fromKit('tileShard', 31 + i));
    else { const g = centre(colorize(slabGeometry(31 + i, 0.14, 0.12, 0.013, 0.35), () => [0.2, 0.09, 0.05])); lib.tileShard.push({ meshes: [{ geometry: g, material: mats.tile }], half: half(g) }); }
  }
  // timber
  lib.beam = []; lib.board = [];
  for (let i = 0; i < V(3); i++) {
    if (fk) lib.beam.push(fromKit('beam', 51 + i, { l: 0.8 + 0.9 * hash01(51, i), ends: i % 2 ? [-1, 1] : [1] }));
    else { const g = centre(colorize(timberGeometry(51 + i, 1.2, 0.16, 0.14), () => [0.2, 0.13, 0.075])); lib.beam.push({ meshes: [{ geometry: g, material: mats.timber }], half: half(g) }); }
  }
  for (let i = 0; i < V(3); i++) {
    if (fk) lib.board.push(fromKit('board', 71 + i, { l: 0.7 + 0.8 * hash01(71, i), w: 0.18 + 0.1 * hash01(72, i), ends: i % 2 ? [-1, 1] : [1] }));
    else { const g = centre(colorize(timberGeometry(71 + i, 1.0, 0.03, 0.22), () => [0.2, 0.18, 0.15])); lib.board.push({ meshes: [{ geometry: g, material: mats.timber }], half: half(g) }); }
  }
  // splinters: thin sticks
  lib.splinter = [];
  for (let i = 0; i < V(3); i++) {
    const L = 0.08 + 0.2 * hash01(91, i), g = centre(colorize(timberGeometry(91 + i, L, 0.008 + 0.01 * hash01(92, i), 0.012), () => [0.42, 0.31, 0.18]));
    lib.splinter.push({ meshes: [{ geometry: g, material: mats.timber }], half: half(g) });
  }
  // lime plaster / daub chunks: white limewashed face (+y), brown daub behind
  lib.plaster = [];
  for (let i = 0; i < V(5); i++) {
    const w = 0.08 + 0.22 * hash01(101, i), d = w * (0.6 + 0.5 * hash01(102, i)), th = 0.02 + 0.025 * hash01(103, i);
    const g = centre(colorize(slabGeometry(101 + i, w, d, th, 0.3), (x, y, z, nx, ny) => {
      if (ny > 0.6) return PLASTER;
      if (ny < -0.6) return DAUB;
      return y > th * 0.25 ? PLASTER.map((c) => c * 0.9) : DAUB;
    }));
    lib.plaster.push({ meshes: [{ geometry: g, material: mats.plaster }], half: half(g) });
  }
  // stone rubble
  lib.stone = [];
  for (let i = 0; i < V(5); i++) {
    const s = 0.04 + 0.12 * hash01(121, i);
    const g = centre(colorize(lumpGeometry(121 + i, [s, s, s * (0.7 + 0.5 * hash01(122, i))], 0.7), () => STONE.map((c, k) => c * (0.85 + 0.3 * hash01(123, i, k)))));
    lib.stone.push({ meshes: [{ geometry: g, material: mats.stone }], half: half(g) });
  }
  // torn turf: soil slab, grass on top
  lib.turf = []; lib.clod = [];
  for (let i = 0; i < V(4); i++) {
    const w = 0.18 + 0.4 * hash01(141, i), d = w * (0.5 + 0.5 * hash01(142, i)), th = 0.05 + 0.06 * hash01(143, i);
    const g = centre(colorize(slabGeometry(141 + i, w, d, th, 0.35), (x, y, z, nx, ny) => (ny > 0.5 ? GRASS : ny < -0.5 ? SOIL : y > th * 0.3 ? [0.1, 0.1, 0.05] : SOIL)));
    lib.turf.push({ meshes: [{ geometry: g, material: mats.turf }], half: half(g) });
  }
  for (let i = 0; i < V(4); i++) {
    const s = 0.03 + 0.08 * hash01(161, i);
    const g = centre(colorize(lumpGeometry(161 + i, [s, s * 0.8, s], 0.8), (x, y, z, nx, ny) => (ny > 0.7 && hash01(162, i) > 0.5 ? GRASS : hash01(163, i) > 0.5 ? SOIL : SOIL_DRY)));
    lib.clod.push({ meshes: [{ geometry: g, material: mats.turf }], half: half(g) });
  }
  return lib;
}
const libs = new WeakMap();
function library(fx, o) {
  if (!libs.has(fx)) libs.set(fx, buildLibrary(fx, o));
  return libs.get(fx);
}

// ------------------------------------------------------------------ trajectory solver --
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/** Orientation q advanced by angular velocity w (world, rad/s) for time dt. */
function spinQ(q0, w, dt, out) {
  const wl = len3(w);
  if (wl < 1e-6 || dt <= 0) return out.copy(q0);
  _v.set(w[0] / wl, w[1] / wl, w[2] / wl);
  _q2.setFromAxisAngle(_v, wl * dt);
  return out.copy(_q2).multiply(q0);
}
/** Lowest point of the piece below its centre (oriented box half extents h). */
function lowExtent(q, h) {
  let s = 0;
  for (let k = 0; k < 3; k++) { _v.set(...AXES[k]).applyQuaternion(q); s += Math.abs(_v.y) * h[k]; }
  return s;
}
/**
 * Rest attitude: a piece comes to rest on a STABLE face - a thin tile or board always lies flat,
 * a beam never stands on its end; among the stable faces the one nearest to its current attitude.
 * Returns { q, h } (h = height of the centre above the ground).
 */
function restQ(q, h) {
  const order = [0, 1, 2].sort((a, b) => h[a] - h[b]);      // thinnest .. longest
  const [kMin, kMid, kMax] = order;
  let cands;
  if (h[kMin] < 0.45 * h[kMid]) cands = [kMin];               // slab: lies flat
  else if (h[kMax] > 1.6 * h[kMid]) cands = [kMin, kMid];      // stick: on a long side
  else cands = [0, 1, 2];                                      // lump: any face
  let best = cands[0], bs = 1, bd = -1;
  for (const k of cands) {
    _v.set(...AXES[k]).applyQuaternion(q);
    const sc = Math.abs(_v.y);
    if (sc > bd) { bd = sc; best = k; bs = Math.sign(_v.y) || 1; }
  }
  _v.set(...AXES[best]).applyQuaternion(q);
  const target = new THREE.Vector3(0, bs, 0);
  const fix = new THREE.Quaternion().setFromUnitVectors(_v.clone().normalize(), target);
  return { q: fix.multiply(q.clone()), h: h[best] };
}

/**
 * Solve one piece: launch at te from p0 with v0, attitude q0, spin w0 (world). Returns segments.
 * o: { e (restitution), mu (friction), k (drag 1/s), ground(x,z), bounces, wind }
 */
export function solvePiece(p0, v0, q0, w0, half, te, o) {
  const segs = [];
  const ground = o.ground;
  const k = o.k ?? 0.05, e = o.e ?? 0.3, mu = o.mu ?? 0.5, wind = o.wind || [0, 0, 0];
  let p = p0.slice(), v = v0.slice(), q = q0.clone(), w = w0.slice(), t = te;
  const pp = [0, 0, 0], vv = [0, 0, 0], qq = new THREE.Quaternion();
  const events = [];
  const tmax = o.tmax ?? 12;
  for (let b = 0; b <= (o.bounces ?? 4); b++) {
    // flight until the lowest point touches the ground
    const gap = (tt) => {
      ballistic(p, v, G, k, wind, tt, pp);
      spinQ(q, w, tt, qq);
      return pp[1] - lowExtent(qq, half) - ground(pp[0], pp[2]);
    };
    let th = Infinity;
    if (gap(0) > 0.0) {
      let a = 0, dt = 0.01;
      for (let tt = dt; tt <= tmax; tt += dt) { if (gap(tt) <= 0) { th = tt; break; } a = tt; dt = Math.min(0.05, dt * 1.25); }
      if (Number.isFinite(th)) { let lo = a, hi = th; for (let i = 0; i < 22; i++) { const m = 0.5 * (lo + hi); if (gap(m) > 0) lo = m; else hi = m; } th = 0.5 * (lo + hi); }
    } else th = 0;
    segs.push({ type: 0, t0: t, t1: t + (Number.isFinite(th) ? th : tmax), p: p.slice(), v: v.slice(), q: q.clone(), w: w.slice(), k });
    if (!Number.isFinite(th)) return { segs, events };
    // contact
    ballistic(p, v, G, k, wind, th, pp, vv);
    spinQ(q, w, th, qq);
    t += th;
    p = pp.slice(); q = qq.clone();
    const vn = vv[1], vt = [vv[0], 0, vv[2]], vtl = len3(vt);
    const speed = len3(vv);
    events.push({ t, p: p.slice(), speed, vn: -vn });
    if (-vn < (o.slideBelow ?? 1.5) || b === (o.bounces ?? 4)) {
      // slide: tangential speed after a last frictional impulse, then deceleration mu*g
      const keep = vtl > 1e-4 ? Math.max(0, 1 - mu * (1 + e) * Math.abs(vn) / vtl) : 0;
      const vs = [vt[0] * keep, 0, vt[2] * keep];
      const vsl = len3(vs);
      const acc = Math.max(0.5, mu * 9.81);
      const ts = vsl / acc;
      const R = restQ(q, half);
      const gy = ground(p[0], p[2]);
      segs.push({ type: 1, t0: t, t1: t + Math.max(ts, 0.25), p: [p[0], gy + R.h, p[2]], v: vs, acc, ts, qa: q.clone(), qb: R.q, yaw: (hash01(t * 997, 3) - 0.5) * vsl * 2.0, h: R.h, y0: p[1] });
      const pe = [p[0] + vs[0] * ts * 0.5, gy + R.h, p[2] + vs[2] * ts * 0.5];
      const qe = R.q.clone();
      if (Math.abs(segs[segs.length - 1].yaw) > 1e-4) qe.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), segs[segs.length - 1].yaw * ts * 0.5));
      segs.push({ type: 2, t0: t + Math.max(ts, 0.25), t1: Infinity, p: pe, q: qe });
      return { segs, events };
    }
    // bounce: Coulomb impulse on the tangential part, restitution on the normal
    const jn = (1 + e) * -vn;
    const keep = vtl > 1e-4 ? Math.max(0, 1 - mu * jn / vtl) : 0;
    v = [vt[0] * keep, -vn * e, vt[2] * keep];
    // spin after the hit: rolling-ish about the axis across the travel, plus a random kick
    const h1 = hash01(t * 1000, b, 1), h2 = hash01(t * 1000, b, 2), h3 = hash01(t * 1000, b, 3);
    const across = vtl > 1e-3 ? norm3(cross3([0, 1, 0], vt)) : [1, 0, 0];
    const rad = Math.max(0.03, (half[0] + half[1] + half[2]) / 3);
    const spin = (vtl * keep) / rad * (0.4 + 0.5 * h1);
    w = [across[0] * spin + (h2 - 0.5) * spin * 0.8, (h3 - 0.5) * spin * 0.6, across[2] * spin + (h1 - 0.5) * spin * 0.8];
    p[1] += 0.002;
  }
  return { segs, events };
}

/** Pose of a solved piece at time t -> writes position (array) and quaternion; false before launch. */
export function poseAt(sol, t, pos, q) {
  const segs = sol.segs;
  if (t < segs[0].t0) return false;
  let s = segs[segs.length - 1];
  for (const sg of segs) if (t < sg.t1) { s = sg; break; }
  const dt = Math.max(0, t - s.t0);
  if (s.type === 0) {
    ballistic(s.p, s.v, G, s.k, null, dt, pos);
    spinQ(s.q, s.w, dt, q);
  } else if (s.type === 1) {
    const tt = Math.min(dt, s.ts);
    pos[0] = s.p[0] + s.v[0] * (tt - 0.5 * tt * tt / Math.max(s.ts, 1e-4));
    pos[2] = s.p[2] + s.v[2] * (tt - 0.5 * tt * tt / Math.max(s.ts, 1e-4));
    // settle: from the contact attitude onto the rest face within ~0.25 s, the centre sinking with it
    const u = smoothstep(0, 0.25, dt);
    q.copy(s.qa).slerp(s.qb, u);
    if (Math.abs(s.yaw) > 1e-4) { _q.setFromAxisAngle(_v.set(0, 1, 0), s.yaw * (tt - 0.5 * tt * tt / Math.max(s.ts, 1e-4))); q.premultiply(_q); }
    pos[1] = s.y0 + (s.p[1] - s.y0) * u;
  } else {
    pos[0] = s.p[0]; pos[1] = s.p[1]; pos[2] = s.p[2]; q.copy(s.q);
  }
  return true;
}

// ------------------------------------------------------------------ the effect --
const KIND_PHYS = {
  tile: { e: 0.25, mu: 0.55, k: 0.25, spin: 14 }, tileShard: { e: 0.2, mu: 0.6, k: 0.3, spin: 18 },
  beam: { e: 0.18, mu: 0.6, k: 0.02, spin: 3 }, board: { e: 0.2, mu: 0.45, k: 0.06, spin: 6 }, splinter: { e: 0.3, mu: 0.5, k: 0.6, spin: 25 },
  plaster: { e: 0.15, mu: 0.7, k: 0.2, spin: 12 }, stone: { e: 0.3, mu: 0.6, k: 0.05, spin: 10 },
  turf: { e: 0.08, mu: 0.9, k: 0.3, spin: 6 }, clod: { e: 0.1, mu: 0.8, k: 0.25, spin: 12 },
};
// what an impact throws up: chip colours (grit) and dust colour
const KIND_GRIT = {
  tile: [[0.22, 0.1, 0.06], [0.3, 0.16, 0.1]], tileShard: [[0.22, 0.1, 0.06], [0.3, 0.16, 0.1]],
  beam: [[0.42, 0.31, 0.18]], board: [[0.4, 0.3, 0.18]], splinter: [[0.42, 0.31, 0.18]],
  plaster: [[0.62, 0.6, 0.55], [0.3, 0.22, 0.15]], stone: [[0.42, 0.39, 0.34]],
  turf: [[0.11, 0.075, 0.045], [0.12, 0.16, 0.05]], clod: [[0.11, 0.075, 0.045], [0.2, 0.155, 0.11]],
};
const KIND_DUST = { plaster: [0.66, 0.63, 0.57], tile: [0.45, 0.33, 0.26], tileShard: [0.45, 0.33, 0.26], stone: [0.55, 0.52, 0.47], turf: [0.4, 0.34, 0.26], clod: [0.4, 0.34, 0.26], beam: [0.5, 0.45, 0.38], board: [0.5, 0.45, 0.38], splinter: [0.5, 0.45, 0.38] };

/**
 * DebrisEffect: o.pieces = [{ kind, variant, p0, v0, q0 (THREE.Quaternion), w0, te, scale }]
 * (presets build these), o.impactDust / o.grit (default true), o.ground (function).
 */
export class DebrisEffect extends Effect {
  constructor(fx, o, lib) {
    super(fx, { name: o.name || 'fx-debris', ...o });
    this.velocityPose = true;     // rigid meshes: motion blur from the shutter-open pose
    this.lib = lib;
    const ground = o.groundFn || ((x, z) => fx.ground(x, z));
    this.pieces = o.pieces.map((P, i) => {
      const L = lib[P.kind][P.variant % lib[P.kind].length];
      const half = L.half.map((h, k) => h * (Array.isArray(P.scale) ? P.scale[k] : P.scale ?? 1));
      const ph = { ...KIND_PHYS[P.kind], ...(o.physics || {}) };
      const sol = solvePiece(P.p0, P.v0, P.q0, P.w0, half, P.te, { ground, k: ph.k, e: ph.e, mu: ph.mu, bounces: o.bounces ?? 4, wind: null });
      return { ...P, L, half, sol, i };
    });
    // instanced meshes per (kind, variant, sub-mesh)
    const groups = new Map();
    for (const P of this.pieces) {
      const key = `${P.kind}:${P.variant % this.lib[P.kind].length}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(P);
    }
    this.inst = [];
    for (const [key, list] of groups) {
      const L = list[0].L;
      for (const sm of L.meshes) {
        const im = new THREE.InstancedMesh(sm.geometry, sm.material, list.length);
        im.name = `fx-debris:${key}`;
        im.castShadow = o.castShadow ?? true; im.receiveShadow = true;
        im.frustumCulled = false;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.object.add(im);
        this.casters.push(im);
        this.inst.push({ im, list });
      }
    }
    // impacts: grit + dust puffs
    this.events = [];
    for (const P of this.pieces) for (const ev of P.sol.events) {
      const mass = P.half[0] * P.half[1] * P.half[2] * 8;
      if (ev.speed > 1.2) this.events.push({ ...ev, kind: P.kind, mass, i: P.i });
    }
    this.events.sort((a, b) => b.mass * b.speed - a.mass * a.speed);
    this.events = this.events.slice(0, Math.round((o.maxImpacts ?? 160) * fx.tier.particles + 20));
    const nGrit = o.grit === false ? 0 : this.events.length * 8;
    this.grit = nGrit ? this.layer(new ParticleLayer(fx, { max: nGrit, mode: 'chip', name: 'fx-debris-grit', soft: 0.02, shading: { albedo: [1, 1, 1] } })) : null;
    const nDust = o.impactDust === false ? 0 : this.events.length * 3;
    this.dust = nDust ? this.layer(new ParticleLayer(fx, {
      max: nDust, mode: 'puff', name: 'fx-debris-dust', soft: 0.3,
      shading: { albedo: [1, 1, 1], ms: 0.75, sigma: 2.2, g: 0.5, noiseScale: 1.6, noiseAmt: 1.0, evolve: 0.4, billow: 0.75, edge: 0.7 },
    })) : null;
    this.dustScale = o.dustScale ?? 1;
    this._p = [0, 0, 0];
    this._q = new THREE.Quaternion();
  }

  update(t, cam) {
    for (const l of this.layers) l.begin();
    const pos = this._p, q = this._q;
    for (const { im, list } of this.inst) {
      let n = 0;
      for (const P of list) {
        if (!poseAt(P.sol, t, pos, q)) { _m.makeScale(0, 0, 0); im.setMatrixAt(n++, _m); continue; }
        const sc = P.scale ?? 1;
        _s.set(...(Array.isArray(sc) ? sc : [sc, sc, sc]));
        _m.compose(_v.set(pos[0], pos[1], pos[2]), q, _s);
        im.setMatrixAt(n++, _m);
      }
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere?.();
    }
    if (!this.fx.shutterOpenPass) this.drawImpacts(t);
    for (const l of this.layers) l.end(cam);
  }

  drawImpacts(t) {
    const fx = this.fx;
    const [ta, tb] = fx.shutter(t);
    const pa = [0, 0, 0], pb = [0, 0, 0], d = [0, 0, 0];
    this.events.forEach((ev, j) => {
      const a1 = tb - ev.t;
      if (a1 < 0) return;
      const a0 = Math.max(0, ta - ev.t);
      const en = Math.min(1, Math.sqrt(ev.mass * 40) * ev.speed / 6);
      // grit: a few crumbs thrown up and out
      if (this.grit && a1 < 1.5) {
        const cols = KIND_GRIT[ev.kind] || [[0.4, 0.38, 0.34]];
        for (let k = 0; k < 8; k++) {
          const h = (m) => hash01(j * 13 + 7, k, m);
          if (h(0) > en) continue;
          coneDir([0, 1, 0], 1.2, h(1), h(2), d);
          const sp = ev.speed * (0.15 + 0.35 * h(3));
          const v0 = [d[0] * sp, d[1] * sp, d[2] * sp];
          ballistic(ev.p, v0, G, 1.0, null, a0, pa); ballistic(ev.p, v0, G, 1.0, null, a1, pb);
          const gy = fx.ground(ev.p[0], ev.p[2]);
          const r = 0.004 + 0.012 * h(4) * h(4);
          if (pb[1] < gy + r) { pb[1] = gy + r * 0.5; if (pa[1] < gy + r) pa[1] = gy + r * 0.5; }
          this.grit.push(pa, pb, r, h(5) * 6.28, 1, h(6), 0, cols[(h(7) * cols.length) | 0]);
        }
      }
      // dust: a low puff rolling out from the contact
      if (this.dust && a1 < 6) {
        const col = KIND_DUST[ev.kind] || [0.6, 0.57, 0.52];
        for (let k = 0; k < 3; k++) {
          const h = (m) => hash01(j * 17 + 3, k, m);
          const ang = h(0) * 6.283;
          const R = (0.15 + 0.5 * en) * this.dustScale;
          const grow = 1 - Math.exp(-a1 / 0.5);
          pb[0] = ev.p[0] + Math.cos(ang) * R * grow * (0.4 + 0.6 * h(1));
          pb[2] = ev.p[2] + Math.sin(ang) * R * grow * (0.4 + 0.6 * h(1));
          pb[1] = fx.ground(ev.p[0], ev.p[2]) + R * (0.25 + 0.35 * grow) + 0.08 * a1 * h(2);
          for (let m = 0; m < 3; m++) pb[m] += fx.wind[m] * a1;
          const size = R * (0.35 + 0.5 * h(3)) * (0.5 + 0.8 * Math.sqrt(grow));
          const dens = en * smoothstep(0, 0.06, a1) * (1 - smoothstep(1.5, 6, a1)) / (1 + 0.8 * a1) * 0.9;
          if (dens < 0.004) continue;
          this.dust.push(pb, pb, size, h(4) * 6.28, dens, h(5), Math.min(1, a1 / 6), col);
        }
      }
    });
  }
}

// ------------------------------------------------------------------ presets --
const rq = (seed, i) => {
  const u1 = hash01(seed, i, 41), u2 = hash01(seed, i, 42), u3 = hash01(seed, i, 43);
  const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
  return new THREE.Quaternion(s1 * Math.sin(2 * Math.PI * u2), s1 * Math.cos(2 * Math.PI * u2), s2 * Math.sin(2 * Math.PI * u3), s2 * Math.cos(2 * Math.PI * u3));
};
const randW = (seed, i, rate) => { const a = coneDir([0, 1, 0], Math.PI, hash01(seed, i, 51), hash01(seed, i, 52)); const r = rate * (0.3 + 0.7 * hash01(seed, i, 53)); return [a[0] * r, a[1] * r, a[2] * r]; };

/**
 * burst: pieces thrown from a point / volume along a cone.
 * o: { at, box: [[..],[..]] (spawn volume instead of a point), dir, spread (rad), speed, t0,
 *      duration (s, launches spread over it), pieces: { kind: count }, size (scale), seed }
 */
function burstPieces(fx, o, lib) {
  const seed = o.seed ?? 1;
  const dir = norm3(arr3(o.dir ?? [0, 1, 0]));
  const out = [];
  let i = 0;
  for (const [kind, count0] of Object.entries(o.pieces || { stone: 20 })) {
    if (!lib[kind]) throw new Error(`fx debris: unknown piece kind "${kind}"`);
    const count = Math.max(count0 > 0 ? 1 : 0, Math.round(count0 * (kind === 'beam' || kind === 'board' ? 1 : fx.tier.fracture)));
    for (let c = 0; c < count; c++, i++) {
      const h = (k) => hash01(seed * 7717, i, k);
      const te = (o.t0 ?? 0) + (o.duration ?? 0.15) * Math.pow(h(0), o.lag ?? 1.5);
      let p0;
      if (o.box) { const b = o.box; p0 = [0, 1, 2].map((k) => b[0][k] + (b[1][k] - b[0][k]) * h(10 + k)); }
      else { const a = fx.at(o.at, te); const r = o.radius ?? 0.2; p0 = [a[0] + (h(1) - 0.5) * r * 2, a[1] + (h(2) - 0.5) * r, a[2] + (h(3) - 0.5) * r * 2]; }
      const d = coneDir(dir, (o.spread ?? 0.6) * Math.sqrt(h(4)), h(5), h(6));
      const ph = KIND_PHYS[kind];
      const heavy = kind === 'beam' ? 0.45 : kind === 'board' ? 0.7 : 1;
      const sp = (o.speed ?? 8) * (0.35 + 0.75 * h(7)) * heavy;
      const base = o.velocity ? arr3(o.velocity) : [0, 0, 0];
      out.push({
        kind, variant: (h(8) * 97) | 0, te, p0, v0: [base[0] + d[0] * sp, base[1] + d[1] * sp, base[2] + d[2] * sp],
        q0: rq(seed, i), w0: randW(seed, i, (o.spin ?? 1) * ph.spin * heavy), scale: (o.size ?? 1) * (0.75 + 0.5 * h(9)),
      });
    }
  }
  return out;
}

export function debrisApi(fx) {
  const make = async (o, pieces) => {
    const lib = await library(fx, o);
    return fx.add(new DebrisEffect(fx, { ...o, pieces: typeof pieces === 'function' ? pieces(lib) : pieces }, lib));
  };
  return {
    /** Library of fragment shapes (await once in setup to pre-build). */
    library: (o = {}) => library(fx, o),
    burst: (o = {}) => make(o, (lib) => burstPieces(fx, o, lib)),
    /**
     * A roofline / timber front coming down (3C-11): the struck edge goes first and the failure
     * runs along the box from `from` (fraction 0..1 along the box's long axis) at `runSpeed`.
     * o: { box, t0, dir (the force), speed, from: 0, runSpeed (m/s), pieces }
     */
    collapse: (o = {}) => make(o, (lib) => {
      const b = o.box;
      const lx = b[1][0] - b[0][0], lz = b[1][2] - b[0][2];
      const along = lx >= lz ? 0 : 2;
      const span = Math.max(lx, lz);
      const pieces = burstPieces(fx, { spread: 0.9, speed: 4, duration: 0, ...o, box: b, pieces: o.pieces || { tile: 50, tileShard: 70, beam: 3, board: 4, plaster: 30, splinter: 25 } }, lib);
      const from = (o.from ?? 0) * span + b[0][along];
      for (const P of pieces) {
        const dist = Math.abs(P.p0[along] - from);
        P.te = (o.t0 ?? 0) + dist / (o.runSpeed ?? 12) + 0.15 * hash01(P.p0[0] * 100, P.p0[2] * 100);
      }
      return pieces;
    }),
    /** Boards / planks skimming along the ground, spinning flat (R16-01). o: { at, dir, t0, count, speed } */
    boards: (o = {}) => make({ bounces: 6, ...o }, (lib) => {
      const ps = burstPieces(fx, { spread: 0.35, speed: 10, ...o, dir: o.dir ?? [1, 0.15, 0], pieces: { board: o.count ?? 5, splinter: (o.count ?? 5) * 3 } }, lib);
      for (const P of ps) if (P.kind === 'board') { P.q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash01(P.te * 1000, 5) * 6.28); P.w0 = [0, (hash01(P.te * 999, 6) - 0.5) * 18, 0]; }
      return ps;
    }),
    /** Take-off / landing: turf, clods and loose stones thrown out from under a dragon. */
    turf: (o = {}) => make({ bounces: 3, maxImpacts: 120, ...o }, (lib) => {
      const R = o.radius ?? 12;
      const bursts = o.bursts || [0];
      const out = [];
      bursts.forEach((bt, bi) => {
        const ps = burstPieces(fx, { seed: (o.seed ?? 1) * 31 + bi, at: o.at, radius: R * 0.35, dir: [0, 1, 0], spread: 1.25, speed: (o.speed ?? 9) * Math.sqrt(R / 12), duration: 0.12, t0: (o.t0 ?? 0) + bt, pieces: o.pieces || { turf: 24, clod: 60, stone: 18 } }, lib);
        const c = fx.at(o.at, (o.t0 ?? 0) + bt);
        for (const P of ps) {
          // thrown outward from under the body (radial), low and fast
          const dx = P.p0[0] - c[0], dz = P.p0[2] - c[2], dl = Math.hypot(dx, dz) || 1;
          const sp = len3(P.v0);
          const up = 0.25 + 0.55 * hash01(P.te * 1e3, 77);
          P.v0 = [dx / dl * sp * (1 - up * 0.5), sp * up, dz / dl * sp * (1 - up * 0.5)];
          P.p0[1] = fx.ground(P.p0[0], P.p0[2]) + 0.05;
        }
        out.push(...ps);
      });
      return out;
    }),
  };
}
