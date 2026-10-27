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
import { solveFraming, suggestFrom } from './framing.js';

export { solveFraming, suggestFrom };
// one side search per framing spec (the warning's suggestion)
const SIDE_SEARCHED = new WeakSet();

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
      // the wider lens also loses depth of field: background blur scales ~ (focal length)^2 at the same
      // f-stop and subject size - a DOF-staged shot (soft faces behind) can come out sharp (1A-24)
      if (fr.mm && env.warnOnce) env.warnOnce(`framing: ${mm0} mm cannot hold the framing here; a ${fr.mm} mm lens does (worst subject ${fr.worst.toFixed(2)} screen units off; background blur ~${Math.round(100 * (fr.mm / mm0) ** 2)} % of the ${mm0} mm look)`);
    }
    s.mm = fr.mm ?? s.mm;
    pos = fr.pos; look = fr.look;
    if (fr.worst > 0.15 && env.warnOnce) {
      // say which side WOULD hold it (the asked screen order may only work from elsewhere: 1A-22's
      // first render put the hatchling and Abby the wrong way round from 320, 0.68 off). A suggestion
      // only - the picture keeps the authored side; searched once per framing spec
      let hint = '';
      if (!s.frame.track && !SIDE_SEARCHED.has(s.frame)) {
        SIDE_SEARCHED.add(s.frame);
        const alt = suggestFrom(s.frame, fr.mm ?? mm0, env, t, s.bounds || null);
        if (alt && alt.worst < fr.worst * 0.6) hint = `; from ${alt.from} would hold it at ${fr.mm ?? mm0} mm (${alt.worst.toFixed(2)} off)`;
      }
      env.warnOnce(`framing: a subject lands ${fr.worst.toFixed(2)} screen units from its place (lens too long for the room, or the subjects too far apart${hint})`);
    }
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
