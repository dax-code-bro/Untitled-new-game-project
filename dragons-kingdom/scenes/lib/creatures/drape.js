// Folded-wing drape: how a wing membrane hangs when the wing is folded.
//
// Linear-blend skinning alone squeezes a folded membrane into stiff, flat
// panels between the finger bones ("a dark board with sticks"). A real folded
// patagium is slack skin: it sags between the fingers, gathers into soft folds
// and drapes over the flank. This module relaxes the membrane once at setup,
// with the skeleton in a folded pose, using position-based dynamics (the
// standard real-time cloth solver):
//   * vertices on the bones (arm, fingers, body attachment) stay pinned to
//     their skinned positions;
//   * the rest of the sheet keeps its spread-pose edge lengths (stiff against
//     stretching, softer against compression, so the extra skin buckles into
//     folds), with a weak bending constraint that keeps the folds broad;
//   * gravity pulls the slack down; spheres fitted to the body sculpt and the
//     ground plane push it out of the body.
// The result is stored as a morph target in bind space (inverse skinning), so
// the draped shape rides on the bones for any similar pose. Deterministic.
import * as THREE from 'three';

const _m = new THREE.Matrix4();

/** Bone skinning matrices relative to the creature root: S_k = root^-1 * bone_k.world * boneInverse_k (column-major 16). */
function skinMatrices(c) {
  const rootInv = new THREE.Matrix4().copy(c.root.matrixWorld).invert();
  return c.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(rootInv, b.matrixWorld).multiply(c.skeleton.boneInverses[i]).elements.slice());
}

function lbs(S, pos, si, sw, n, out) {
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let ox = 0, oy = 0, oz = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw[v * 4 + k];
      if (w <= 0) continue;
      const e = S[si[v * 4 + k]];
      ox += w * (e[0] * x + e[4] * y + e[8] * z + e[12]);
      oy += w * (e[1] * x + e[5] * y + e[9] * z + e[13]);
      oz += w * (e[2] * x + e[6] * y + e[10] * z + e[14]);
    }
    out[v * 3] = ox; out[v * 3 + 1] = oy; out[v * 3 + 2] = oz;
  }
}

/** Collision spheres from the creature's sculpt primitives (posed). */
export function bodyColliders(c, S, box, margin) {
  const prims = c.anatomy.sdf.prims;
  const out = [];
  const push = (p, r, bone) => {
    const bi = c.boneIndex[bone];
    if (bi === undefined) return;
    const e = S[bi];
    const x = e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12], y = e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13], z = e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14];
    if (x + r < box[0] - margin || x - r > box[3] + margin || y + r < box[1] - margin || y - r > box[4] + margin || z + r < box[2] - margin || z - r > box[5] + margin) return;
    out.push(x, y, z, r);
  };
  for (const p of prims) {
    if (p.op !== 'add' || !p.bone) continue;
    if (/^w_|_t\d$/.test(p.bone) || p.chain === 'skull' || p.chain === 'jaw' || p.tag === 'toe') continue;
    if (p.kind === 'cone') {
      const m = Math.max(p.sx, p.sy) * 0.5 + Math.min(p.sx, p.sy) * 0.5;
      const d = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]);
      const n = Math.max(1, Math.ceil(d / (Math.min(p.ra, p.rb) * 0.8)));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        push([p.a[0] + (p.b[0] - p.a[0]) * t, p.a[1] + (p.b[1] - p.a[1]) * t, p.a[2] + (p.b[2] - p.a[2]) * t], (p.ra + (p.rb - p.ra) * t) * m, p.bone);
      }
    } else {
      // ellipsoid: spheres along its longest axis, radius = the mean of the other two
      const r = p.r, ax = [p.ax, p.ay, p.az];
      let l = 0; for (let k = 1; k < 3; k++) if (r[k] > r[l]) l = k;
      const o = [0, 1, 2].filter((k) => k !== l);
      const rr = Math.sqrt(r[o[0]] * r[o[1]]);
      const n = Math.max(1, Math.round(r[l] / rr));
      for (let i = -n + 1; i <= n - 1; i++) {
        const t = (i / n) * r[l];
        const f = Math.sqrt(Math.max(0.05, 1 - (t / r[l]) ** 2));
        push([p.c[0] + ax[l][0] * t, p.c[1] + ax[l][1] * t, p.c[2] + ax[l][2] * t], rr * f, p.bone);
      }
    }
  }
  return Float64Array.from(out);
}

/**
 * Drape one membrane mesh in the creature's current pose.
 * opts: { res (m, membrane edge length), iters, ground (y in the root frame or null) }
 * Returns { delta, dnormal } in bind space (Float32Array, 3 per vertex).
 */
export function drapeMembrane(c, mesh, opts = {}) {
  const g = mesh.geometry;
  const pos = g.attributes.position.array, n = pos.length / 3;
  const si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array;
  const edgeA = g.attributes.aEdge.array, wingA = g.attributes.aWing.array;
  const idx = g.index.array;
  const L = c.L, res = opts.res ?? L * 0.006;
  c.root.updateMatrixWorld(true);
  const S = skinMatrices(c);
  const X0 = new Float64Array(n * 3);
  lbs(S, pos, si, sw, n, X0);
  // pinned: on (or right next to) a bone or the body attachment line
  const pinD = res * 0.6;
  const inv = new Float64Array(n);
  for (let v = 0; v < n; v++) inv[v] = edgeA[v * 4] < pinD ? 0 : 1;
  // edges + bending pairs from the triangles
  const ekey = new Map();
  const tri = idx.length / 3;
  const E = [], B = [];
  for (let t = 0; t < tri; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], cc = idx[t * 3 + 2];
    for (const [p, q, o] of [[a, b, cc], [b, cc, a], [cc, a, b]]) {
      const k = p < q ? p * n + q : q * n + p;
      const prev = ekey.get(k);
      if (prev === undefined) { ekey.set(k, o); E.push(p, q); } else if (prev >= 0) { B.push(prev, o); ekey.set(k, -1); }
    }
  }
  const restLen = (p, q) => Math.hypot(pos[p * 3] - pos[q * 3], pos[p * 3 + 1] - pos[q * 3 + 1], pos[p * 3 + 2] - pos[q * 3 + 2]);
  const shrink = opts.shrink ?? 0.45;            // elastic skin (elastin) contracts when the bones close
  const El = new Float64Array(E.length / 2), Bl = new Float64Array(B.length / 2);
  for (let i = 0; i < El.length; i++) El[i] = restLen(E[i * 2], E[i * 2 + 1]) * shrink;
  for (let i = 0; i < Bl.length; i++) Bl[i] = restLen(B[i * 2], B[i * 2 + 1]) * shrink;
  // start: skinned positions, panels pushed out and down (the slack falls away from the body)
  const side = opts.side ?? 1;
  const x = Float64Array.from(X0), xp = Float64Array.from(X0);
  const seed = new THREE.Vector3(side * 0.6, -1, 0).normalize();
  for (let v = 0; v < n; v++) {
    if (!inv[v]) continue;
    const a = wingA[v * 4 + 3] * res * 2.0;
    x[v * 3] += seed.x * a; x[v * 3 + 1] += seed.y * a; x[v * 3 + 2] += seed.z * a;
    xp[v * 3] = x[v * 3]; xp[v * 3 + 1] = x[v * 3 + 1]; xp[v * 3 + 2] = x[v * 3 + 2];
  }
  // colliders around the membrane
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let v = 0; v < n; v++) for (let k = 0; k < 3; k++) { box[k] = Math.min(box[k], X0[v * 3 + k]); box[3 + k] = Math.max(box[3 + k], X0[v * 3 + k]); }
  const span = Math.max(box[3] - box[0], box[4] - box[1], box[5] - box[2]);
  const col = bodyColliders(c, S, box, span * 0.6);
  const nc = col.length / 4;
  const pad = opts.pad ?? res * 0.6;
  // uniform grid over the colliders (each sphere listed in every cell it touches)
  const cell = res * 3;
  const gmin = [box[0] - span * 0.6, box[1] - span * 0.6, box[2] - span * 0.6];
  const gdim = [0, 1, 2].map((k) => Math.max(1, Math.ceil((box[3 + k] - box[k] + span * 1.2) / cell)));
  const cells = new Map();
  for (let k = 0; k < nc; k++) {
    const r = col[k * 4 + 3] + pad;
    const lo = [0, 1, 2].map((a) => Math.max(0, Math.floor((col[k * 4 + a] - r - gmin[a]) / cell)));
    const hi = [0, 1, 2].map((a) => Math.min(gdim[a] - 1, Math.floor((col[k * 4 + a] + r - gmin[a]) / cell)));
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let l = lo[2]; l <= hi[2]; l++) {
      const key = i + gdim[0] * (j + gdim[1] * l);
      let a = cells.get(key); if (!a) { a = []; cells.set(key, a); } a.push(k);
    }
  }
  const EMPTY = [];
  const near = (px, py, pz) => {
    const i = Math.floor((px - gmin[0]) / cell), j = Math.floor((py - gmin[1]) / cell), l = Math.floor((pz - gmin[2]) / cell);
    if (i < 0 || j < 0 || l < 0 || i >= gdim[0] || j >= gdim[1] || l >= gdim[2]) return EMPTY;
    return cells.get(i + gdim[0] * (j + gdim[1] * l)) || EMPTY;
  };
  const ground = opts.ground ?? null;
  const iters = opts.iters ?? 140;
  const gStep = res * (opts.gravity ?? 0.05);
  const damp = 0.9;
  for (let it = 0; it < iters; it++) {
    // integrate (Verlet with damping)
    for (let v = 0; v < n; v++) {
      if (!inv[v]) continue;
      const i3 = v * 3;
      const vx = (x[i3] - xp[i3]) * damp, vy = (x[i3 + 1] - xp[i3 + 1]) * damp, vz = (x[i3 + 2] - xp[i3 + 2]) * damp;
      xp[i3] = x[i3]; xp[i3 + 1] = x[i3 + 1]; xp[i3 + 2] = x[i3 + 2];
      x[i3] += vx; x[i3 + 1] += vy - gStep; x[i3 + 2] += vz;
    }
    for (let pass = 0; pass < 2; pass++) {
      // stretch (stiff) / compression (softer)
      for (let i = 0; i < El.length; i++) {
        const p = E[i * 2], q = E[i * 2 + 1];
        const wp = inv[p], wq = inv[q], ws = wp + wq;
        if (!ws) continue;
        const dx = x[q * 3] - x[p * 3], dy = x[q * 3 + 1] - x[p * 3 + 1], dz = x[q * 3 + 2] - x[p * 3 + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        const err = d - El[i];
        const k = err > 0 ? 1.0 : 0.2;
        const s = k * err / d / ws;
        x[p * 3] += dx * s * wp; x[p * 3 + 1] += dy * s * wp; x[p * 3 + 2] += dz * s * wp;
        x[q * 3] -= dx * s * wq; x[q * 3 + 1] -= dy * s * wq; x[q * 3 + 2] -= dz * s * wq;
      }
      // bending: keep the distance across each shared edge (broad, soft folds)
      for (let i = 0; i < Bl.length; i++) {
        const p = B[i * 2], q = B[i * 2 + 1];
        const wp = inv[p], wq = inv[q], ws = wp + wq;
        if (!ws) continue;
        const dx = x[q * 3] - x[p * 3], dy = x[q * 3 + 1] - x[p * 3 + 1], dz = x[q * 3 + 2] - x[p * 3 + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        const err = d - Bl[i];
        const s = (err > 0 ? 0.25 : 0.08) * err / d / ws;
        x[p * 3] += dx * s * wp; x[p * 3 + 1] += dy * s * wp; x[p * 3 + 2] += dz * s * wp;
        x[q * 3] -= dx * s * wq; x[q * 3 + 1] -= dy * s * wq; x[q * 3 + 2] -= dz * s * wq;
      }
    }
    // collisions: body spheres and the ground
    for (let v = 0; v < n; v++) {
      if (!inv[v]) continue;
      const i3 = v * 3;
      const list = near(x[i3], x[i3 + 1], x[i3 + 2]);
      for (let q = 0; q < list.length; q++) {
        const k = list[q];
        const cx = col[k * 4], cy = col[k * 4 + 1], cz = col[k * 4 + 2], r = col[k * 4 + 3] + pad;
        const dx = x[i3] - cx, dy = x[i3 + 1] - cy, dz = x[i3 + 2] - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2) || 1e-9;
        const f = r / d;
        x[i3] = cx + dx * f; x[i3 + 1] = cy + dy * f; x[i3 + 2] = cz + dz * f;
      }
      if (ground !== null && x[i3 + 1] < ground + pad) x[i3 + 1] = ground + pad;
    }
  }
  // normals of the draped sheet (same winding as the mesh)
  const nr = new Float64Array(n * 3);
  for (let t = 0; t < tri; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], cc = idx[t * 3 + 2];
    const ux = x[b * 3] - x[a * 3], uy = x[b * 3 + 1] - x[a * 3 + 1], uz = x[b * 3 + 2] - x[a * 3 + 2];
    const vx = x[cc * 3] - x[a * 3], vy = x[cc * 3 + 1] - x[a * 3 + 1], vz = x[cc * 3 + 2] - x[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, cc]) { nr[q * 3] += nx; nr[q * 3 + 1] += ny; nr[q * 3 + 2] += nz; }
  }
  // inverse skinning -> bind-space morph delta
  const delta = new Float32Array(n * 3), dnormal = new Float32Array(n * 3);
  const rn = g.attributes.normal.array;
  const M = new THREE.Matrix4(), Mi = new THREE.Matrix4(), N3 = new THREE.Matrix3();
  const pv = new THREE.Vector3(), nv = new THREE.Vector3();
  for (let v = 0; v < n; v++) {
    const e = new Float64Array(16);
    for (let k = 0; k < 4; k++) {
      const w = sw[v * 4 + k];
      if (w <= 0) continue;
      const s = S[si[v * 4 + k]];
      for (let j = 0; j < 16; j++) e[j] += w * s[j];
    }
    M.fromArray(e);
    Mi.copy(M).invert();
    pv.set(x[v * 3], x[v * 3 + 1], x[v * 3 + 2]).applyMatrix4(Mi);
    delta[v * 3] = pv.x - pos[v * 3]; delta[v * 3 + 1] = pv.y - pos[v * 3 + 1]; delta[v * 3 + 2] = pv.z - pos[v * 3 + 2];
    N3.setFromMatrix4(Mi);
    nv.set(nr[v * 3], nr[v * 3 + 1], nr[v * 3 + 2]).applyMatrix3(N3).normalize();
    if (!(nv.lengthSq() > 0.5)) nv.set(rn[v * 3], rn[v * 3 + 1], rn[v * 3 + 2]);
    dnormal[v * 3] = nv.x - rn[v * 3]; dnormal[v * 3 + 1] = nv.y - rn[v * 3 + 1]; dnormal[v * 3 + 2] = nv.z - rn[v * 3 + 2];
  }
  void _m;
  return { delta, dnormal, colliders: nc };
}
