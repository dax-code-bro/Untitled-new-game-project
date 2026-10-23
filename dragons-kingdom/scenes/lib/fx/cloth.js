// FX library - cloth: banners and festival cloth pulled loose and blown by a dragon's wake (3C),
// torn along a line, flying, falling and settling on the paving or over a shape (R18-03: "a banner
// torn down in the first pass lies over a man-sized shape"), and cloth draped over the dead (R21).
//
//   fx.cloth.banner({ hoist: [[x,y,z], [x,y,z]] (the pole / rope edge), size: [w, h], t0 (released),
//                     wind: (t, p) => [x,y,z] | [x,y,z], gust: { t, at, dir, strength, radius, dur, lift },
//                     tear: { t, from: [u,v], to: [u,v], dur, ragged }, colliders: [{ type: 'capsule',
//                     a, b, r } | { type: 'sphere', c, r }], material | fabric + color + border,
//                     seed, until (s simulated), res: [nx, ny], density (kg/m^2) })
//   fx.cloth.drape({ body: { at, yaw } | at + over: colliders, size, t0, settle })   cloth dropped
//                     over a person lying on the ground (or any shapes) and settled; bodyColliders()
//   fabricMaterial({ fabric: 'wool'|'linen'|'twill', color, border: { at, width, color }, dirt, seed })
//
// Deterministic pre-simulation: a Verlet mass-spring grid (structure, shear, bend) with per-
// triangle aerodynamic pressure against a gusty wind field, ground friction and capsule / sphere
// colliders, pins released at t0. A tear splits the grid properly: the vertices along a ragged
// line are doubled, each side's triangles and springs use their own copy, and a glue spring
// between the two copies parts progressively from `from` to `to` - two real edges that separate
// and flog (no gap of missing triangles). Integrated ONCE in setup at 240 Hz from a little
// before the first event to `until`, stored at 60 Hz and interpolated at t (any frame alone; the
// same bytes on every machine). Tiers scale the grid resolution. No self-collision (brief shots).
import * as THREE from 'three';
import { Effect } from './core/manager.js';
import { hash01, arr3, clamp, smoothstep, noise1, norm3, cross3 } from './core/util.js';
import { libTexture, NOISE_GLSL } from '../humans/materials.js';

const STORE_HZ = 60, SIM_HZ = 240;

function windAt(o, t, p) {
  const w = typeof o.wind === 'function' ? arr3(o.wind(t, p)) : arr3(o.wind ?? [3, 0, 1]);
  // gustiness: slow swells + quick flutters (deterministic noise of time and position)
  const g = 1 + 0.35 * noise1(t * 0.7 + p[0] * 0.05, 11) * 2 + 0.15 * noise1(t * 3.1 + p[2] * 0.2, 12) * 2;
  let x = w[0] * g, y = w[1] * g, z = w[2] * g;
  // a dragon's wake: a short, violent blast from a point (radial, or along a direction)
  const G = o.gust;
  if (G) {
    const a = t - G.t;
    if (a > 0 && a < (G.dur ?? 1.5)) {
      const c = arr3(G.at), d = G.dir ? norm3(arr3(G.dir)) : null;
      const rx = p[0] - c[0], ry = p[1] - c[1], rz = p[2] - c[2], rl = Math.hypot(rx, ry, rz) || 1;
      const env = Math.exp(-a / ((G.dur ?? 1.5) * 0.35)) * smoothstep(0, 0.05, a) * (G.strength ?? 25) / (1 + (rl / (G.radius ?? 20)) ** 2);
      x += (d ? d[0] : rx / rl) * env; y += (d ? d[1] : ry / rl) * env + env * (G.lift ?? 0.05); z += (d ? d[2] : rz / rl) * env;
    }
  }
  return [x, y, z];
}

/** Simulate a rectangular cloth; returns { N, nx, ny, uv, frames: Float32Array[], tStart, dt, tris, twins }. */
export function simulateCloth(o) {
  const [nx, ny] = o.res;
  const NG = nx * ny;
  const seed = o.seed ?? 1;
  const idx = (i, j) => j * nx + i;
  const hoist = o.hoist.map(arr3);
  const [W, H] = o.size;
  // grid: u along the hoist (0..1), v away from it (down / out to the fly end)
  const along = [hoist[1][0] - hoist[0][0], hoist[1][1] - hoist[0][1], hoist[1][2] - hoist[0][2]];
  const hl = Math.hypot(...along) || 1;
  const ua = along.map((v) => v / hl);
  const dn = o.hangDir ? norm3(arr3(o.hangDir)) : [0, -1, 0];
  const nrm = norm3(cross3(ua, dn));
  // ---- tear chain: one grid vertex per row (or column) along a ragged line, each doubled
  const twinOf = new Int32Array(NG).fill(-1), side = new Int8Array(NG), tearAt = new Float64Array(NG).fill(Infinity);
  const twins = [];
  let N = NG;
  const tear = o.tear;
  let chainTime = null;
  if (tear) {
    const A = [tear.from[0] * (nx - 1), tear.from[1] * (ny - 1)], B = [tear.to[0] * (nx - 1), tear.to[1] * (ny - 1)];
    const byRow = Math.abs(B[1] - A[1]) >= Math.abs(B[0] - A[0]);
    const mA = byRow ? A[1] : A[0], mB = byRow ? B[1] : B[0], cA = byRow ? A[0] : A[1], cB = byRow ? B[0] : B[1];
    const nM = byRow ? ny : nx, nC = byRow ? nx : ny;
    const m0 = Math.round(mA), m1 = Math.round(mB), st = m1 >= m0 ? 1 : -1;
    const chain = new Map();
    chainTime = new Map();
    let walk = 0, prev = null;
    for (let m = m0; m !== m1 + st; m += st) {
      if (m < 0 || m >= nM) continue;
      const f = (m - m0) / ((m1 - m0) || 1);
      // a ragged edge: a bounded random walk about the line, never more than one cell per row
      if (hash01(seed, m, 78) < (tear.ragged ?? 0.45)) walk = clamp(walk + (hash01(seed, m, 77) < 0.5 ? -1 : 1), -2, 2);
      let c = Math.round(cA + (cB - cA) * f + walk);
      if (prev !== null) c = Math.max(prev - 1, Math.min(prev + 1, c));
      c = Math.max(1, Math.min(nC - 2, c));
      chain.set(m, c); prev = c;
      const tm = tear.t + (tear.dur ?? 0.3) * f;
      chainTime.set(m, tm);
      const v = byRow ? idx(c, m) : idx(m, c);
      twinOf[v] = N++;
      tearAt[v] = tm;
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const m = byRow ? j : i, c = byRow ? i : j;
      if (!chain.has(m)) continue;
      side[idx(i, j)] = Math.sign(c - chain.get(m));
    }
    chainTime.byRow = byRow;
  }
  const P = new Float64Array(N * 3), Q = new Float64Array(N * 3), R = new Float64Array(N * 3);   // position, previous, flat rest
  const uv = new Float32Array(N * 2);
  // smooth starting folds (a few long waves across the cloth, growing away from the hoist) so the
  // first settling already breaks it into soft pleats rather than a flat sheet or fine corduroy
  const ph = [0, 1, 2, 3].map((k) => hash01(seed, 911, k) * Math.PI * 2);
  const amp = o.crumple ?? 0.035;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const u = i / (nx - 1), v = j / (ny - 1);
    const k = idx(i, j) * 3;
    const fold = amp * (o.pin === false ? 1 : smoothstep(0, 0.3, v)) * (0.6 * Math.sin(u * W * 7.5 + ph[0] + v * 1.5) + 0.4 * Math.sin(u * W * 13 + v * H * 3 + ph[1]) + 0.35 * Math.sin(v * H * 5 + ph[2]) * Math.sin(u * W * 4 + ph[3]));
    for (let c = 0; c < 3; c++) {
      R[k + c] = hoist[0][c] + ua[c] * u * W + dn[c] * v * H;
      P[k + c] = R[k + c] + nrm[c] * fold;
    }
    uv[idx(i, j) * 2] = u; uv[idx(i, j) * 2 + 1] = v;
  }
  for (let v = 0; v < NG; v++) if (twinOf[v] >= 0) {
    const w = twinOf[v];
    for (let c = 0; c < 3; c++) { P[w * 3 + c] = P[v * 3 + c]; R[w * 3 + c] = R[v * 3 + c]; }
    uv[w * 2] = uv[v * 2]; uv[w * 2 + 1] = uv[v * 2 + 1];
    twins.push([v, w, tearAt[v]]);
  }
  Q.set(P);
  const pinned = new Uint8Array(N);
  if (o.pin !== false) for (let i = 0; i < nx; i++) { pinned[idx(i, 0)] = 1; if (twinOf[idx(i, 0)] >= 0) pinned[twinOf[idx(i, 0)]] = 1; }
  // ---- springs: [a, b, rest, kind, tearTime]
  const S = [];
  const rest = (a, b) => Math.hypot(R[a * 3] - R[b * 3], R[a * 3 + 1] - R[b * 3 + 1], R[a * 3 + 2] - R[b * 3 + 2]);
  const crossT = (a, b) => {
    const by = chainTime.byRow;
    const ma = by ? Math.floor(a / nx) : a % nx, mb = by ? Math.floor(b / nx) : b % nx;
    return Math.min(chainTime.get(ma) ?? Infinity, chainTime.get(mb) ?? Infinity);
  };
  const add = (a, b, kind) => {
    const La = twinOf[a] >= 0, Lb = twinOf[b] >= 0;
    if (!La && !Lb) {
      // a spring across the tear line parts when the tear passes it
      S.push([a, b, rest(a, b), kind, side[a] * side[b] < 0 ? crossT(a, b) : Infinity]);
    } else if (La && Lb) {
      S.push([a, b, rest(a, b), kind, Infinity], [twinOf[a], twinOf[b], rest(a, b), kind, Infinity]);
    } else {
      // one end on the chain: the far side's springs hold its own copy
      const l = La ? a : b, other = La ? b : a;
      S.push([side[other] > 0 ? twinOf[l] : l, other, rest(a, b), kind, Infinity]);
    }
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (i + 1 < nx) add(idx(i, j), idx(i + 1, j), 0);
    if (j + 1 < ny) add(idx(i, j), idx(i, j + 1), 0);
    if (i + 1 < nx && j + 1 < ny) { add(idx(i, j), idx(i + 1, j + 1), 1); add(idx(i + 1, j), idx(i, j + 1), 1); }
    if (i + 2 < nx) add(idx(i, j), idx(i + 2, j), 2);
    if (j + 2 < ny) add(idx(i, j), idx(i, j + 2), 2);
  }
  for (const [v, w, tt] of twins) S.push([v, w, 0, 0, tt]);         // the glue that parts
  // ---- triangles: the cell diagonal follows the chain where it steps; a triangle touching the
  // chain on the far side uses the copies
  const T = [];
  const tri = (a, b, c) => {
    const s = (twinOf[a] >= 0 ? 0 : side[a]) + (twinOf[b] >= 0 ? 0 : side[b]) + (twinOf[c] >= 0 ? 0 : side[c]);
    const f = (x) => (s > 0 && twinOf[x] >= 0 ? twinOf[x] : x);
    T.push(f(a), f(b), f(c));
  };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
    if (twinOf[b] >= 0 && twinOf[d] >= 0) { tri(a, b, d); tri(b, c, d); } else { tri(a, b, c); tri(a, c, d); }
  }
  const mass = (o.density ?? 0.25) * W * H / NG;             // kg per particle (wool ~250 g/m^2)
  // simulate from a little before the first thing that happens (release, gust, tear) - the cloth
  // has settled by then - to `until`
  const first = Math.min(o.t0 ?? Infinity, o.gust?.t ?? Infinity, o.tear?.t ?? Infinity);
  const tStart = o.tStart ?? (Number.isFinite(first) ? first : 0) - 3;
  const tEnd = Math.max(tStart + 0.5, o.until ?? (Number.isFinite(first) ? first : 0) + 12);
  const dt = 1 / SIM_HZ, steps = Math.ceil((tEnd - tStart) * SIM_HZ);
  const frames = [];
  const F = new Float64Array(N * 3);
  const ground = o.ground || (() => 0);
  const cols = (o.colliders || []).map((c) => ({ ...c, a: c.a && arr3(c.a), b: c.b && arr3(c.b), c: c.c && arr3(c.c) }));
  const thick = o.thickness ?? 0.01;
  const iters = o.iterations ?? 6;
  const t0 = o.t0 ?? Infinity;
  const store = () => { const f = new Float32Array(N * 3); for (let k = 0; k < N * 3; k++) f[k] = P[k]; frames.push(f); };
  const perStore = SIM_HZ / STORE_HZ;
  const stiffK = [1, 0.4, o.bend ?? 0.06];
  for (let s = 0; s <= steps; s++) {
    const t = tStart + s * dt;
    if (s % perStore === 0) store();
    if (s === steps) break;
    // forces: gravity + aerodynamics per triangle
    F.fill(0);
    for (let k = 0; k < N; k++) F[k * 3 + 1] -= 9.81 * mass;
    for (let q = 0; q < T.length; q += 3) {
      const a = T[q] * 3, b = T[q + 1] * 3, c = T[q + 2] * 3;
      const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
      const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      const n0 = e1y * e2z - e1z * e2y, n1 = e1z * e2x - e1x * e2z, n2 = e1x * e2y - e1y * e2x;
      const area2 = Math.hypot(n0, n1, n2) || 1e-9;
      const cx = (P[a] + P[b] + P[c]) / 3, cy = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
      const w = windAt(o, t, [cx, cy, cz]);
      const rx = w[0] - ((P[a] - Q[a]) + (P[b] - Q[b]) + (P[c] - Q[c])) / 3 / dt;
      const ry = w[1] - ((P[a + 1] - Q[a + 1]) + (P[b + 1] - Q[b + 1]) + (P[c + 1] - Q[c + 1])) / 3 / dt;
      const rz = w[2] - ((P[a + 2] - Q[a + 2]) + (P[b + 2] - Q[b + 2]) + (P[c + 2] - Q[c + 2])) / 3 / dt;
      const nx_ = n0 / area2, ny_ = n1 / area2, nz_ = n2 / area2;
      const vn = rx * nx_ + ry * ny_ + rz * nz_;
      // pressure along the normal (~ 0.5 rho Cd |vn| vn A) + a little tangential skin drag
      const k = 0.5 * 1.2 * 1.2 * (area2 / 2) * Math.abs(vn) * vn / 3;
      const kt = 0.02 * (area2 / 2) / 3 * Math.hypot(rx, ry, rz);
      const fx_ = k * nx_ + kt * (rx - vn * nx_), fy_ = k * ny_ + kt * (ry - vn * ny_), fz_ = k * nz_ + kt * (rz - vn * nz_);
      for (const pi of [a, b, c]) { F[pi] += fx_; F[pi + 1] += fy_; F[pi + 2] += fz_; }
    }
    // Verlet step
    const damp = 0.998;
    for (let p = 0; p < N; p++) {
      const k = p * 3;
      if (pinned[p] && t < t0) continue;
      for (let m = 0; m < 3; m++) {
        const x = P[k + m], vx = (x - Q[k + m]) * damp;
        Q[k + m] = x;
        P[k + m] = x + vx + (F[k + m] / mass) * dt * dt;
      }
    }
    // constraints
    for (let it = 0; it < iters; it++) {
      for (const sp of S) {
        if (t >= sp[4]) continue;                          // torn
        const a = sp[0] * 3, b = sp[1] * 3;
        const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
        const L = Math.hypot(dx, dy, dz) || 1e-9;
        // cloth hardly stretches but compresses freely (buckles into folds); bending resists only
        // a little and never pushes a fold open
        if (sp[3] !== 1 && L < sp[2]) continue;
        const wa = (pinned[sp[0]] && t < t0) ? 0 : 1, wb = (pinned[sp[1]] && t < t0) ? 0 : 1;
        const ws = wa + wb; if (!ws) continue;
        const diff = (L - sp[2]) / L * stiffK[sp[3]] / ws;
        P[a] += dx * diff * wa; P[a + 1] += dy * diff * wa; P[a + 2] += dz * diff * wa;
        P[b] -= dx * diff * wb; P[b + 1] -= dy * diff * wb; P[b + 2] -= dz * diff * wb;
      }
      // collisions: ground (with friction) and shapes
      for (let p = 0; p < N; p++) {
        const k = p * 3;
        const gy = ground(P[k], P[k + 2]) + thick;
        if (P[k + 1] < gy) {
          P[k + 1] = gy;
          // friction: pull the previous position toward the current (kills sliding)
          Q[k] += (P[k] - Q[k]) * 0.6; Q[k + 2] += (P[k + 2] - Q[k + 2]) * 0.6;
        }
        for (const c of cols) {
          let cx, cy, cz;
          if (c.type === 'sphere') { cx = c.c[0]; cy = c.c[1]; cz = c.c[2]; }
          else {
            const abx = c.b[0] - c.a[0], aby = c.b[1] - c.a[1], abz = c.b[2] - c.a[2], L2 = abx * abx + aby * aby + abz * abz || 1;
            const tt = clamp(((P[k] - c.a[0]) * abx + (P[k + 1] - c.a[1]) * aby + (P[k + 2] - c.a[2]) * abz) / L2);
            cx = c.a[0] + abx * tt; cy = c.a[1] + aby * tt; cz = c.a[2] + abz * tt;
          }
          const dx = P[k] - cx, dy = P[k + 1] - cy, dz = P[k + 2] - cz, d = Math.hypot(dx, dy, dz) || 1e-9, r = c.r + thick;
          if (d < r) {
            P[k] = cx + dx / d * r; P[k + 1] = cy + dy / d * r; P[k + 2] = cz + dz / d * r;
            Q[k] += (P[k] - Q[k]) * 0.5; Q[k + 1] += (P[k + 1] - Q[k + 1]) * 0.5; Q[k + 2] += (P[k + 2] - Q[k + 2]) * 0.5;
          }
        }
      }
    }
  }
  return { N, nx, ny, uv, frames, tStart, dt: 1 / STORE_HZ, tris: T, twins };
}

// ---------------------------------------------------------------- material --
// Woven cloth for FX cloth: the asset library's photo weave (normal + roughness + fibre variation)
// at its real thread scale on the cloth's metre UVs, uneven dye, an optional woven / painted
// border band (festival banners), dirt and wear. All patterns ride the cloth's own UVs, so
// nothing swims as it flies.
const FABRICS = {
  // lum: mean linear luminance of the photo albedo (as measured by the humans library)
  wool: { id: 'pbr/acg_fabric37', base: 'Fabric37', tile: 0.18, sheen: 0.35, rough: 0.9, lum: 0.062 },
  linen: { id: 'pbr/acg_fabric36', base: 'Fabric36', tile: 0.12, sheen: 0.25, rough: 0.82, lum: 0.5 },
  twill: { id: 'pbr/acg_fabric40', base: 'Fabric40', tile: 0.15, sheen: 0.4, rough: 0.86, lum: 0.09 },
};
export function fabricMaterial(o = {}) {
  const f = FABRICS[o.fabric || 'wool'] || FABRICS.wool;
  const col = o.color || [0.3, 0.05, 0.035];
  const m = Math.max(...col, 1e-4), k = Math.min(1, 0.55 / m);
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(...col), roughness: o.rough ?? f.rough, metalness: 0,
    sheen: o.sheen ?? f.sheen, sheenRoughness: 0.75, sheenColor: new THREE.Color(col[0] * k, col[1] * k, col[2] * k).lerp(new THREE.Color(0.5, 0.5, 0.5), 0.12),
    side: THREE.DoubleSide,
  });
  mat.normalMap = libTexture(`${f.id}/${f.base}_nrm.jpg`, { color: false, repeat: true, flipY: true });
  mat.normalScale = new THREE.Vector2(o.weave ?? 0.9, -(o.weave ?? 0.9));
  mat.roughnessMap = libTexture(`${f.id}/${f.base}_rgh.jpg`, { color: false, repeat: true, flipY: true });
  const B = o.border || null;
  const U = {
    uTile: { value: 1 / (o.tile ?? f.tile) },
    uAlb: { value: libTexture(`${f.id}/${f.base}_col.jpg`, { color: true, repeat: true, flipY: true }) },
    uLum: { value: f.lum }, uSeed: { value: (o.seed ?? 1) * 0.37 },
    uBorder: { value: new THREE.Vector3(B ? (B.at ?? 0.06) : -1, B ? (B.width ?? 0.05) : 0, B?.edges ?? 1) },
    uBorderCol: { value: new THREE.Vector3(...(B?.color || [0.5, 0.36, 0.08])) },
    uSize: { value: new THREE.Vector2(...(o.size || [1, 1])) },
    uDirt: { value: o.dirt ?? 0.2 },
  };
  mat.userData.fabric = U;
  mat.customProgramCacheKey = () => 'dk-fx-fabric';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTile; uniform vec2 uSize; varying vec2 vFab;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
vFab = uv * uSize;
#ifdef USE_NORMALMAP
  vNormalMapUv = vFab * uTile;
#endif
#ifdef USE_ROUGHNESSMAP
  vRoughnessMapUv = vFab * uTile;
#endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
${NOISE_GLSL}
uniform sampler2D uAlb; uniform float uLum, uSeed, uTile, uDirt; uniform vec3 uBorder, uBorderCol; uniform vec2 uSize;
varying vec2 vFab;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 a = texture2D(uAlb, vFab * uTile).rgb;
  float fib = clamp(dot(a, vec3(0.2126, 0.7152, 0.0722)) / uLum, 0.25, 2.5);
  vec3 c = diffuseColor.rgb;
  // woven border band (inside the hem on all sides; edges = 0 for the long sides only)
  if (uBorder.x >= 0.0) {
    vec2 e = min(vFab, uSize - vFab);
    float d = uBorder.z > 0.5 ? min(e.x, e.y) : e.x;
    float band = smoothstep(uBorder.x - 0.004, uBorder.x, d) * (1.0 - smoothstep(uBorder.x + uBorder.y, uBorder.x + uBorder.y + 0.004, d));
    c = mix(c, uBorderCol, band);
  }
  c *= mix(1.0, fib, 0.45);
  float n1 = hFbm(vec3(vFab * 5.0, uSeed)), n2 = hFbm(vec3(vFab * 19.0, uSeed + 3.0));
  c *= 0.88 + 0.24 * n1;
  // grime: grey-brown patches, heavier toward the hem and the fly end (v = 1)
  float dirt = uDirt * smoothstep(0.45, 0.85, hFbm(vec3(vFab * 2.3, uSeed + 7.0)) + 0.25 * vFab.y / uSize.y) * (0.6 + 0.4 * n2);
  c = mix(c, vec3(0.16, 0.135, 0.105) * (0.7 + 0.6 * n2), clamp(dirt, 0.0, 0.7));
  diffuseColor.rgb = c;
}`);
  };
  return mat;
}

// ------------------------------------------------------------------ effect --
export class ClothEffect extends Effect {
  constructor(fx, o = {}) {
    super(fx, { name: o.name || 'fx-cloth', ...o });
    this.velocityPose = true;
    const k = Math.sqrt(fx.tier.cloth ?? 1), r0 = o.cells ?? 30;
    const mx = Math.max(o.size[0], o.size[1]);
    const res = o.res || [Math.max(8, Math.round(r0 * k * o.size[0] / mx)), Math.max(8, Math.round(r0 * k * o.size[1] / mx))];
    this.sim = simulateCloth({ ...o, res, ground: o.groundFn || ((x, z) => fx.ground(x, z)) });
    const { N, uv, tris } = this.sim;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(tris);
    this.geo = geo;
    const mat = o.material || fabricMaterial({ fabric: o.fabric, color: o.color, border: o.border, dirt: o.dirt, seed: o.seed, size: o.size });
    if (mat.userData.fabric) mat.userData.fabric.uSize.value.set(o.size[0], o.size[1]);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.mesh.name = this.object.name;
    this.object.add(this.mesh);
    this.casters.push(this.mesh);
  }
  update(t) {
    const S = this.sim;
    const vis = this.enabled && (this.o.visibleFrom == null || t >= this.o.visibleFrom);
    this.mesh.visible = vis;
    if (!vis) return;
    const f = clamp((t - S.tStart) / S.dt, 0, S.frames.length - 1);
    const i0 = Math.floor(f), i1 = Math.min(S.frames.length - 1, i0 + 1), u = f - i0;
    const A = S.frames[i0], B = S.frames[i1], pos = this.geo.attributes.position.array;
    for (let k = 0; k < pos.length; k++) pos[k] = A[k] + (B[k] - A[k]) * u;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    // the two copies along a tear share one normal until they part (no seam line before the tear)
    const nr = this.geo.attributes.normal.array;
    for (const [v, w, tt] of S.twins) {
      if (t >= tt) continue;
      for (let c = 0; c < 3; c++) { const m = (nr[v * 3 + c] + nr[w * 3 + c]) * 0.5; nr[v * 3 + c] = m; nr[w * 3 + c] = m; }
    }
    this.geo.computeBoundingSphere();
  }
}

/**
 * Capsule / sphere colliders for a person lying on their back (a covered body, R18-03 / R21):
 * head toward `yaw` (radians about +y; 0 = +x), `at` the middle of the body on the ground.
 */
export function bodyColliders({ at = [0, 0, 0], yaw = 0, height = 1.75, side = 0 } = {}) {
  const c = arr3(at), s = height / 1.75;
  const ax = [Math.cos(yaw), 0, -Math.sin(yaw)], ac = [Math.sin(yaw), 0, Math.cos(yaw)];
  // (f along the body from its middle, l to its left, y up) -> world
  const P = (f, l, y) => [c[0] + (ax[0] * f + ac[0] * l) * s, c[1] + y * s, c[2] + (ax[2] * f + ac[2] * l) * s];
  const cap = (a, b, r) => ({ type: 'capsule', a, b, r: r * s });
  const sph = (p, r) => ({ type: 'sphere', c: p, r: r * s });
  const tilt = side * 0.05;      // head turned / one shoulder a little higher
  return [
    sph(P(0.78, tilt, 0.11), 0.105),                               // head
    cap(P(0.06, 0, 0.12), P(0.5, 0, 0.13 + tilt), 0.14),            // torso, pelvis to chest
    cap(P(0.5, 0.17, 0.08), P(-0.02, 0.26, 0.06), 0.05),            // arms at the sides
    cap(P(0.5, -0.17, 0.08), P(-0.02, -0.26, 0.06), 0.05),
    cap(P(0.0, 0.1, 0.08), P(-0.78, 0.12, 0.06), 0.075),            // legs
    cap(P(0.0, -0.1, 0.08), P(-0.78, -0.14, 0.06), 0.075),
    cap(P(-0.84, 0.12, 0.05), P(-0.86, 0.14, 0.17), 0.045),         // feet, toes up
    cap(P(-0.84, -0.14, 0.05), P(-0.85, -0.2, 0.16), 0.045),
  ];
}

export function clothApi(fx) {
  return {
    banner: (o) => fx.add(new ClothEffect(fx, { name: 'fx-banner', ...o })),
    /**
     * A cloth dropped from above onto shapes and settled before t0: `over` colliders, or
     * `body: { at, yaw, height }` for a person lying under it. Dropped a little tilted (it lands
     * feet end first and slides into folds over the shape).
     */
    drape: (o = {}) => {
      const body = o.body ? bodyColliders(o.body) : [];
      const c = arr3(o.at ?? o.body?.at), [w, h] = o.size || [1.2, 2.2], hgt = o.height ?? 0.7;
      // the cloth's long side (h) runs along `yaw` (the body under it), its short side across
      const yaw = o.yaw ?? o.body?.yaw ?? 0, ax = [Math.cos(yaw), 0, -Math.sin(yaw)], ac = [Math.sin(yaw), 0, Math.cos(yaw)];
      const tilt = o.tilt ?? 0.25;
      const hd = norm3([-ax[0], -tilt, -ax[2]]);
      const a = [c[0] - ac[0] * w / 2 + ax[0] * h / 2, c[1] + hgt + tilt * h / 2, c[2] - ac[2] * w / 2 + ax[2] * h / 2];
      const b = [a[0] + ac[0] * w, a[1], a[2] + ac[2] * w];
      const { body: _b, ...rest } = o;
      return fx.add(new ClothEffect(fx, {
        name: 'fx-drape', hoist: [a, b], size: [w, h], hangDir: hd, pin: false, t0: o.t0 ?? 0, tStart: (o.t0 ?? 0) - (o.settle ?? 4), until: (o.t0 ?? 0) + 1,
        wind: [0, 0, 0], crumple: 0.04, cells: 36, fabric: 'linen', color: [0.3, 0.25, 0.18], ...rest, colliders: [...body, ...(o.over || [])],
      }));
    },
  };
}
