// Shot director - camera rigs, lens and focus pulls (pure functions of the shot time t).
//
// A shot's `cam` spec (positions in the set's world frame, metres; anything that is a position
// may also be a NAME that the set resolves - a mark ('door', 'nest'), an actor ('alexandria'),
// an actor part ('alexandria.head', 'hatchling.eye', 'abby.hand.R') - or a key list
// [[t, value, ease?], ...] mixing both):
//
//   rig      'static' | 'pan' | 'tilt' | 'dolly' | 'push' | 'track' | 'crane' | 'handheld' |
//            'drone' | 'follow' | 'orbit' | 'boat'   - names a default shake and ease; the
//            motion itself is whatever pos / look / orbit / follow say
//   pos      [x, y, z] | name | keys          camera position
//   look     [x, y, z] | name | keys          aim point
//   offset   [dx, dy, dz]                     added to pos (world), e.g. pos: 'nest', offset: [...]
//   follow   { target, offset: [dx, dy, dz], lookOffset, local: true, lag, yawLag, yaw }   tracking /
//            drone follow: pos = the target's ground point + offset (in the target's own frame, x = its
//            LEFT, z = forward, if local), look = ground point + lookOffset (same frame; default 1.2 m
//            up); lag / yawLag: the operator trails the subject's position / turns by that many seconds
//   orbit    { center, radius, height, angle (deg, keys ok) }  pos on a circle round center
//   mount    'boat' | actor name                 the camera rides that object: numeric pos / look are in its
//            own frame (a boat-mounted camera, a camera on a dragon's back); names and { at: [x, y, z] }
//            stay world points
//   push     0.05 | keys                      move this fraction of the way toward `look` over the shot
//   roll     degrees (keys ok)
//   mm       focal length (keys = a zoom), sensor ('super35'), fstop, shutter (deg), iso
//   focus    name | metres | keys of either   (a focus pull: keys [[0, 'egg'], [2.5, 'alexandria.head']])
//   focusOffset  metres added to the focus distance (- = nearer: a mark at an object's centre, focus on
//            its near surface)
//   shake    { kind: 'handheld'|'vehicle'|'wind'|'aerial'|'dragonback', amount, seed } (dk/camera.js)
//   ease     default ease for the keys ('sine')
//
// evalCamera() writes the camera and ctx.lens; it returns { pos, look, focusDist }.
import * as THREE from 'three';
import { applyShake } from 'dk/camera.js';
import { keyed, isKeyList, ease as easeFn, clamp } from './timeline.js';

const RIG_DEFAULTS = {
  static: {}, pan: {}, tilt: {}, dolly: {}, push: {}, track: {}, crane: {},
  handheld: { shake: { kind: 'handheld', amount: 0.7 } },
  boat: { shake: { kind: 'vehicle', amount: 0.35 } },
  drone: { shake: { kind: 'aerial', amount: 0.5 } },
  follow: { shake: { kind: 'aerial', amount: 0.3 } },
  orbit: {},
};

const _v = new THREE.Vector3();

/**
 * Resolve a position spec at time t. env.point(name, t) -> Vector3 for names.
 * Key lists may mix points and names: each key is resolved, then interpolated.
 */
export function resolvePoint(spec, t, env, opts = {}) {
  if (spec == null) return null;
  if (typeof spec === 'string') return env.point(spec, t);
  if (spec.isVector3) return spec.clone();
  if (isKeyList(spec)) {
    const keys = spec;
    if (t <= keys[0][0]) return resolvePoint(keys[0][1], t, env);
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, e1] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        const a = resolvePoint(v0, t, env), b = resolvePoint(v1, t, env);
        const w = t1 > t0 ? easeFn(e1 || opts.ease || 'sine', (t - t0) / (t1 - t0)) : 1;
        return a.lerp(b, w);
      }
    }
    return resolvePoint(keys[keys.length - 1][1], t, env);
  }
  if (Array.isArray(spec) && typeof spec[0] === 'number') return new THREE.Vector3(spec[0], spec[1], spec[2]);
  if (typeof spec === 'object' && spec.at !== undefined) {
    // { at: name|point, offset: [..] }
    const p = resolvePoint(spec.at, t, env);
    if (spec.offset) p.add(new THREE.Vector3(...spec.offset));
    return p;
  }
  throw new Error(`camera: cannot resolve position ${JSON.stringify(spec)}`);
}

/** numeric position(s) (not names): what a mount transforms */
const isLocalSpec = (v) => Array.isArray(v) && (typeof v[0] === 'number' || (isKeyList(v) && v.every((k) => Array.isArray(k[1]))));

/** A number, or keys of numbers. */
const num = (v, t, e) => (v == null ? null : typeof v === 'number' ? v : keyed(t, v, { ease: e }));

/** Focus distance at t: a name / point (distance from the camera), metres, or keys of either. */
export function resolveFocus(spec, t, camPos, env, e = 'sine') {
  if (spec == null) return null;
  if (typeof spec === 'number') return spec;
  if (isKeyList(spec)) {
    const keys = spec;
    const d = (v) => resolveFocus(v, t, camPos, env, e);
    if (t <= keys[0][0]) return d(keys[0][1]);
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, e1] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        const w = t1 > t0 ? easeFn(e1 || e, (t - t0) / (t1 - t0)) : 1;
        return d(v0) + (d(v1) - d(v0)) * w;
      }
    }
    return d(keys[keys.length - 1][1]);
  }
  const p = resolvePoint(spec, t, env);
  return p ? Math.max(0.05, p.distanceTo(camPos)) : null;
}

/**
 * Pose the camera for shot time t (u = t / shot length). ctx: the runtime ctx (camera, lens).
 * env: { point(name, t), actorFrame?(name, t) -> { pos: Vector3, yaw } }.
 */
export function evalCamera(spec, t, u, ctx, env, shotSeconds = 1) {
  const s = { ...(RIG_DEFAULTS[spec.rig] || {}), ...spec };
  const e = s.ease || 'sine';
  const cam = ctx.camera;
  let pos, look;
  if (s.follow) {
    // the actor's ground frame (root on the ground, facing yaw); the operator lags `lag` s behind
    // the subject's position and `yawLag` s behind its turns (pure: the blocking is evaluated at
    // those earlier times, nothing is remembered between frames)
    const f = s.follow;
    const frameAt = (tt) => (env.actorFrame ? env.actorFrame(f.target, tt) : { pos: env.point(f.target, tt), yaw: 0 });
    const fr = frameAt(t);
    const frP = f.lag ? frameAt(t - f.lag) : fr;
    let yaw = fr.yaw || 0;
    if (f.yawLag) { const a = frameAt(t - f.yawLag).yaw || 0; yaw = a + Math.atan2(Math.sin(yaw - a), Math.cos(yaw - a)) * 0.5; }
    if (f.yaw != null) yaw = (num(f.yaw, t, e) * Math.PI) / 180;          // a fixed world direction instead
    const rot = (v) => (f.local !== false ? v.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw) : v);
    const off = rot(new THREE.Vector3(...(num(f.offset, t, e) || [0, 2, -6])));
    pos = frP.pos.clone().add(off);
    look = s.look != null ? resolvePoint(s.look, t, env, { ease: e }) : fr.pos.clone().add(rot(new THREE.Vector3(...(num(f.lookOffset, t, e) || [0, 1.2, 0]))));
  } else if (s.orbit) {
    const o = s.orbit;
    const c = resolvePoint(o.center, t, env, { ease: e });
    const ang = (num(o.angle, t, e) * Math.PI) / 180;
    const r = num(o.radius, t, e), h = num(o.height ?? 0, t, e);
    pos = new THREE.Vector3(c.x + Math.sin(ang) * r, c.y + h, c.z + Math.cos(ang) * r);
    look = s.look != null ? resolvePoint(s.look, t, env, { ease: e }) : c;
  } else if (s.frame) {
    // solved framing; pos / look keys may still move it (offsets added below), push works as usual
    const mm0 = num(s.mm ?? 35, s.frame.track ? t : (s.frame.at ?? 0), e);
    let fr = solveFraming(s.frame, mm0, env, t, 16 / 9, 24.89, s.bounds || null);
    // a lens too long for the room: like a camera crew, go wider (static framings only, so the lens
    // never jumps between frames); s.frame.autoLens: false keeps the lens and accepts the error
    const tol = s.frame.tolerance ?? 0.12;
    if (fr.worst > tol && !s.frame.track && s.frame.autoLens !== false && typeof (s.mm ?? 35) === 'number') {
      for (const mm of [40, 35, 32, 28, 24, 21, 18].filter((m) => m < mm0 && m >= Math.max(18, mm0 * (s.frame.minLensRatio ?? 0.5)))) {
        const f2 = solveFraming(s.frame, mm, env, t, 16 / 9, 24.89, s.bounds || null);
        if (f2.worst < fr.worst) { fr = f2; fr.mm = mm; }
        if (f2.worst <= tol) break;
      }
      if (fr.mm && env.warnOnce) env.warnOnce(`framing: ${mm0} mm cannot hold the framing here; a ${fr.mm} mm lens does (worst subject ${fr.worst.toFixed(2)} screen units off)`);
    }
    s.mm = fr.mm ?? s.mm;
    pos = fr.pos; look = fr.look;
    if (fr.worst > 0.15 && env.warnOnce) env.warnOnce(`framing: a subject lands ${fr.worst.toFixed(2)} screen units from its place (lens too long for the room, or the subjects too far apart)`);
    if (s.frame.move) {
      // a move relative to the solved set-up: keys of [dx, dy, dz] in the camera's own frame (right, up, back)
      const m = keyed(t, s.frame.move, { ease: e });
      const fwd = look.clone().sub(pos).normalize(), right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(right, fwd);
      const d = right.multiplyScalar(m[0]).add(up.multiplyScalar(m[1])).add(fwd.multiplyScalar(-m[2]));
      pos.add(d); look.add(d);
    }
    if (s.frame.tilt) {
      // a tilt / pan relative to the solved aim: keys of [panDeg, tiltDeg]
      const a = keyed(t, s.frame.tilt, { ease: e });
      const dir = look.clone().sub(pos);
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (-a[0] * Math.PI) / 180);
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      dir.applyAxisAngle(right, (a[1] * Math.PI) / 180);
      look = pos.clone().add(dir);
    }
  } else {
    pos = resolvePoint(s.pos, t, env, { ease: e });
    look = resolvePoint(s.look, t, env, { ease: e });
    // mount: the camera rides an object (a boat, a cart, a dragon's back): numeric positions are in
    // that object's own frame (names stay world points)
    if (s.mount) {
      const M = env.objectMatrix?.(s.mount);
      if (!M) throw new Error(`camera: mount "${s.mount}" is not an object or actor of this set`);
      if (isLocalSpec(s.pos)) pos.applyMatrix4(M);
      if (isLocalSpec(s.look)) look.applyMatrix4(M);
    }
  }
  if (!pos || !look) throw new Error('camera: pos and look are required');
  if (s.offset) pos.add(_v.set(...s.offset));
  if (s.push) {
    const k = typeof s.push === 'number' ? s.push * easeFn(e, u) : num(s.push, t, e);
    const tgt = s.frame ? (env.approxPoint || env.point)(s.frame.subjects[0][0], s.frame.track ? t : (s.frame.at ?? 0)) : look;
    const d = tgt.clone().sub(pos).multiplyScalar(k);
    pos.add(d); look.add(d);
  }
  if (s.bounds) {
    // keep the camera inside the set (a room's walls): clamp, keeping the aim direction
    const b = s.bounds, before = pos.clone();
    pos.set(clamp(pos.x, b[0][0], b[1][0]), clamp(pos.y, b[0][1], b[1][1]), clamp(pos.z, b[0][2], b[1][2]));
    look.add(pos.clone().sub(before));
  }
  cam.position.copy(pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(look);
  const roll = num(s.roll, t, e);
  if (roll) cam.rotateZ((roll * Math.PI) / 180);
  cam.updateMatrixWorld(true);
  if (s.shake && (s.shake.amount ?? 1) > 0) {
    applyShake(cam, t + (s.shake.offset ?? 0), { kind: s.shake.kind || 'handheld', amount: s.shake.amount ?? 1, seed: s.shake.seed ?? 3 });
    cam.updateMatrixWorld(true);
  }
  // lens
  const L = ctx.lens;
  L.sensor = s.sensor || 'super35';
  L.focalLength = num(s.mm ?? 35, t, e);
  if (s.fstop != null) L.fstop = num(s.fstop, t, e);
  L.shutterAngle = s.shutter ?? 180;
  if (s.iso != null) L.iso = s.iso;
  const fd = resolveFocus(s.focus ?? (s.frame ? s.frame.subjects[0][0] : s.look), t, cam.position, env, e);
  L.focusTarget = null;
  L.focus = Math.max(0.05, (fd ?? look.distanceTo(cam.position)) + (num(s.focusOffset, t, e) ?? 0));
  return { pos: cam.position.clone(), look, focusDist: L.focus };
}

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
 *   }
 * Lens: the shot's mm on super 35 (16:9). Two subjects: camera x/z, yaw and pitch are solved
 * (Levenberg-Marquardt from a start on the `from` side) for the height; one subject: placed at
 * `dist` from it on the `from` side and aimed so it lands on its screen place. Deterministic.
 */
export function solveFraming(fr, mm, env, t, aspect = 16 / 9, sensorW = 24.89, bounds = null) {
  const tt = fr.track ? t : (fr.at ?? 0);
  const P = fr.subjects.map(([n, s]) => ({ p: (env.approxPoint || env.point)(n, tt), s }));
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
  let q = [c0.x + fromDir.x * d0, c0.z + fromDir.z * d0, Math.atan2(-fromDir.x, -fromDir.z), 0];
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
    // stay inside the set (a room's walls): a stiff penalty outside the box
    if (bounds) {
      const pv = [qq[0], y, qq[1]];
      for (let k = 0; k < 3; k++) out.push(4 * (Math.max(0, bounds[0][k] - pv[k]) + Math.max(0, pv[k] - bounds[1][k])));
    }
    return out;
  };
  let lambda = 1e-2;
  let r0 = res(q), e0 = r0.reduce((a, b) => a + b * b, 0);
  for (let it = 0; it < 60 && e0 > 1e-10; it++) {
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
 * A quick framing helper for authoring: a camera position `dist` metres from `target` along the
 * horizontal direction `fromDeg` (0 = from the north looking south, 90 = from the east), `h` metres
 * above the target point. Returns [x, y, z].
 */
export function placeFrom(target, fromDeg, dist, h = 0) {
  const a = (fromDeg * Math.PI) / 180;
  return [target[0] + Math.sin(a) * dist, target[1] + h, target[2] - Math.cos(a) * dist];
}

/** Field of view (vertical, degrees) of a focal length on super 35 16:9 (for framing maths). */
export function vfovDeg(mm, sensorW = 24.89) {
  const h = sensorW * 9 / 16;
  return (2 * Math.atan(h / 2 / mm) * 180) / Math.PI;
}
export { clamp };
