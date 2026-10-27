// Shot director - the FRAMING SOLVER (pure: three.js maths only, no runtime / browser imports, so the
// self-test and Node tools can run it): put subjects at chosen places on the screen the way a camera
// operator frames, and suggest the side that holds a framing the authored side cannot.
// camera.js re-exports both; evalCamera() uses them for `cam.frame` shots.
import * as THREE from 'three';

// ------------------------------------------------------------- framing ---
/**
 * FRAMING SOLVER: put subjects at chosen places on the screen, the way a camera operator frames.
 *   frame: {
 *     subjects: [['alexandria.head', [0.35, 0.25]], ['egg', [-0.2, -0.3]]],   // screen x, y in -1..1
 *     from: 200,          // degrees: the side the camera looks FROM (0 = from the north, 90 = from the east)
 *     height: 1.4,        // camera height (m); or rise: metres above the first subject
 *     dist: 2.5,          // distance to the FIRST subject (one subject: exact; two or more: a soft target)
 *     minDist: 0.55,      // the camera keeps at least this far from every subject (default 0.55 m)
 *     tolerance: 0.12,    // worst screen error accepted before a wider lens is tried (autoLens: false = never)
 *     at: 0,              // shot time the subjects are measured at (static camera); track: true re-solves every frame
 *     search: true,       // opt-in: a GLOBAL search - Levenberg-Marquardt from a fan of starts (every 30 deg round the
 *                         //   subjects x three distances, pulled inside the room) as well as the one on the `from` side;
 *                         //   small rooms with three subjects trapped the single start against a wall (session 6)
 *     clear: ['remi.head', 'remi.chest'] | true,   // opt-in: points that must not stand IN FRONT of a subject on
 *                         //   screen (an occluder within ~0.22 m, nearer the lens); true = env.occluders() (the
 *                         //   stage: every other cast member's head and chest) - 1A-28 hid Abby behind Remi
 *   }
 * Lens: the shot's mm on super 35 (16:9). Two subjects: camera x/z, yaw and pitch are solved
 * (Levenberg-Marquardt from a start on the `from` side) for the height; one subject: placed at
 * `dist` from it on the `from` side and aimed so it lands on its screen place. Deterministic.
 */
export function solveFraming(fr, mm, env, t, aspect = 16 / 9, sensorW = 24.89, bounds = null) {
  const tt = fr.track ? t : (fr.at ?? 0);
  const pt = (n) => (env.approxPoint || env.point)(n, tt);
  const P = fr.subjects.map(([n, s]) => ({ p: pt(n), s, actor: String(n).split('.')[0] }));
  // occluders (clear): points that must not cover a subject; never a subject's own actor
  const occNames = fr.clear === true ? (env.occluders ? env.occluders() : []) : (fr.clear || []);
  const O = occNames.map((n) => ({ p: pt(n), actor: String(n).split('.')[0], r: fr.clearRadius ?? 0.22 })).filter((o) => o.p);
  const tanH = (sensorW / 2) / mm, tanV = tanH / aspect;
  const fromA = ((fr.from ?? 180) * Math.PI) / 180;
  const fromDir = new THREE.Vector3(Math.sin(fromA), 0, -Math.cos(fromA));   // from the subject toward the camera
  const c0 = P.reduce((a, x) => a.add(x.p), new THREE.Vector3()).multiplyScalar(1 / P.length);
  const proj = (cx, cy, cz, yaw, pitch, p) => {
    const d = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
    // right = d x up (normalised), up' = right x d
    let r = [-d[2], 0, d[0]]; const rl = Math.hypot(r[0], r[2]) || 1; r = [r[0] / rl, 0, r[2] / rl];
    const u = [r[1] * d[2] - r[2] * d[1], r[2] * d[0] - r[0] * d[2], r[0] * d[1] - r[1] * d[0]];
    const v = [p.x - cx, p.y - cy, p.z - cz];
    const z = v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
    const x = v[0] * r[0] + v[2] * r[2], y = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
    return [x / (Math.max(0.05, z) * tanH), y / (Math.max(0.05, z) * tanV), z];
  };
  const camY = (x) => (fr.height != null ? fr.height : P[0].p.y + (fr.rise ?? 0.1));
  if (P.length === 1) {
    const dist = fr.dist ?? 2;
    const pos = P[0].p.clone().addScaledVector(fromDir, dist);
    pos.y = fr.height != null ? fr.height : P[0].p.y + (fr.rise ?? 0);
    // aim so the subject sits at s: rotate the direction to the subject by the screen offset
    const toS = P[0].p.clone().sub(pos);
    const yaw0 = Math.atan2(toS.x, toS.z), pitch0 = Math.atan2(toS.y, Math.hypot(toS.x, toS.z));
    const yaw = yaw0 + Math.atan(P[0].s[0] * tanH), pitch = pitch0 - Math.atan(P[0].s[1] * tanV);
    const look = pos.clone().add(new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)));
    return { pos, look };
  }
  // two (or more) subjects: unknowns q = [x, z, yaw, pitch] (y = height), LM on the screen error
  const spread = P.reduce((m, a) => Math.max(m, a.p.distanceTo(c0)), 0.3);
  const d0 = (spread / Math.max(0.15, tanH * 0.5)) * 1.1 + 0.3;
  const startAt = (dir, d) => [c0.x + dir.x * d, c0.z + dir.z * d, Math.atan2(-dir.x, -dir.z), 0];
  let q = startAt(fromDir, d0);
  const res = (qq) => {
    const y = camY(qq);
    const out = [];
    for (const s of P) { const [x, yy, z] = proj(qq[0], y, qq[1], qq[2], qq[3], s.p); out.push(x - s.s[0], yy - s.s[1], z < 0.1 ? 10 : 0); }
    // keep to the chosen side: a weak pull of the camera toward the `from` direction
    const w = fr.sideWeight ?? 0.02;
    const cx = qq[0] - c0.x, cz = qq[1] - c0.z, L = Math.hypot(cx, cz) || 1;
    out.push(w * (1 - (cx * fromDir.x + cz * fromDir.z) / L));
    // dist: the distance to the FIRST subject (the one the shot is about: an OTS shoulder, a face)
    if (fr.dist) out.push(0.3 * (Math.hypot(qq[0] - P[0].p.x, qq[1] - P[0].p.z) - fr.dist));
    // never inside or against a subject (heads are ~0.25 m across; a lens needs some air)
    const minD = fr.minDist ?? 0.55;
    for (const sj of P) { const dd = Math.hypot(qq[0] - sj.p.x, y - sj.p.y, qq[1] - sj.p.z); if (dd < minD) out.push(3 * (minD - dd)); else out.push(0); }
    // occlusion: an occluder nearer the lens than a subject and within its own screen radius of it
    for (const o of O) {
      const [ox, oy, oz] = proj(qq[0], y, qq[1], qq[2], qq[3], o.p);
      for (const sj of P) {
        if (sj.actor === o.actor) continue;
        const [sx, sy, sz] = proj(qq[0], y, qq[1], qq[2], qq[3], sj.p);
        // clear by the occluder's half-width plus the subject's own (a head ~0.12 m), in screen units (x)
        const rad = o.r / (Math.max(0.05, oz) * tanH) + 0.12 / (Math.max(0.05, sz) * tanH);
        const sep = Math.hypot(sx - ox, (sy - oy) / 1.78);
        out.push(sz > oz + 0.1 && sep < rad ? (fr.clearWeight ?? 6) * (rad - sep) : 0);
      }
    }
    // stay inside the set (a room's walls): a stiff penalty outside the box
    if (bounds) {
      const pv = [qq[0], y, qq[1]];
      for (let k = 0; k < 3; k++) out.push(4 * (Math.max(0, bounds[0][k] - pv[k]) + Math.max(0, pv[k] - bounds[1][k])));
    }
    return out;
  };
  const lm = (qStart, iters) => {
  let q = qStart.slice();
  let lambda = 1e-2;
  let r0 = res(q), e0 = r0.reduce((a, b) => a + b * b, 0);
  for (let it = 0; it < iters && e0 > 1e-10; it++) {
    const J = [];
    const h = [1e-4, 1e-4, 1e-5, 1e-5];
    for (let k = 0; k < 4; k++) { const q2 = q.slice(); q2[k] += h[k]; const r2 = res(q2); J.push(r2.map((v, i) => (v - r0[i]) / h[k])); }
    // (J^T J + lambda I) dq = -J^T r
    const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], g = [0, 0, 0, 0];
    for (let a = 0; a < 4; a++) { for (let b = 0; b < 4; b++) { let s = 0; for (let i = 0; i < r0.length; i++) s += J[a][i] * J[b][i]; A[a][b] = s; } let s = 0; for (let i = 0; i < r0.length; i++) s += J[a][i] * r0[i]; g[a] = -s; }
    for (let a = 0; a < 4; a++) A[a][a] *= 1 + lambda;
    const dq = solve4(A, g);
    if (!dq) break;
    const q2 = q.map((v, k) => v + dq[k]);
    const r2 = res(q2), e2 = r2.reduce((a, b) => a + b * b, 0);
    if (e2 < e0) { q = q2; r0 = r2; e0 = e2; lambda = Math.max(1e-7, lambda * 0.3); } else lambda = Math.min(1e6, lambda * 8);
  }
  return { q, e0 };
  };
  let best = lm(q, 60);
  if (fr.search) {
    // a fan of starts round the subjects (the authored side first, then wider), each refined; the
    // start inside the room keeps the walls' penalty from trapping the solve; deterministic order
    // starts are pulled inside the room (0.25 m off the walls): in a small room most of the fan lies
    // beyond the walls, and a start outside stays pinned to the wall it hits
    const clampIn = (st) => {
      if (!bounds) return st;
      const cl = (v, k) => Math.min(bounds[1][k] - 0.25, Math.max(bounds[0][k] + 0.25, v));
      return [cl(st[0], 0), cl(st[1], 2), Math.atan2(c0.x - cl(st[0], 0), c0.z - cl(st[1], 2)), st[3]];
    };
    const seen = new Set();
    for (const da of [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180]) {
      const a = fromA + (da * Math.PI) / 180;
      const dir = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
      for (const k of [0.35, 0.6, 1.0]) {
        const st = clampIn(startAt(dir, d0 * k));
        const key = `${st[0].toFixed(2)},${st[1].toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const r = lm(st, 40);
        if (r.e0 < best.e0 - 1e-9) best = r;
      }
    }
  }
  q = best.q; const e0 = best.e0;
  const pos = new THREE.Vector3(q[0], camY(q), q[1]);
  const look = pos.clone().add(new THREE.Vector3(Math.cos(q[3]) * Math.sin(q[2]), Math.sin(q[3]), Math.cos(q[3]) * Math.cos(q[2])));
  // how well the subjects landed (screen units): reported once per shot by the stage
  let worst = 0;
  for (const sj of P) { const [x, y] = proj(q[0], camY(q), q[1], q[2], q[3], sj.p); worst = Math.max(worst, Math.hypot(x - sj.s[0], y - sj.s[1])); }
  return { pos, look, error: Math.sqrt(e0), worst };
}
function solve4(A, b) {
  const n = 4, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/**
 * The camera side (`from`, degrees) that best holds a framing the authored side cannot: tries the
 * authored side +-30..180 deg at the same lens. Returns { from, worst } or null. Authoring aid
 * (reported in the framing warning); never changes a picture.
 */
export function suggestFrom(fr, mm, env, t, bounds = null) {
  const f0 = fr.from ?? 180;
  let best = null;
  for (const d of [30, -30, 60, -60, 90, -90, 135, -135, 180]) {
    const from = (((f0 + d) % 360) + 360) % 360;
    const r = solveFraming({ ...fr, from }, mm, env, t, 16 / 9, 24.89, bounds);
    if (!best || r.worst < best.worst) best = { from, worst: r.worst };
  }
  return best;
}
