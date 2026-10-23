// Shot director - the ACTION VOCABULARY: turns a blocking state (blocking.js) into a pose of a
// humans-library character or a creatures-library dragon, as a pure function of t.
//
// Humans (scenes/lib/humans): every character is built offline in its own drape pose (cloth
// simulated on it); at render time we only add deltas from that pose (idle.js does breathing,
// sway, saccades, blinks). This module layers on top, in this order:
//   1. idle (ch.update)          2. root: position, facing, posture drop
//   3. legs: gait (procedural walk with planted feet: two-bone leg IK), crouch / kneel / sit
//   4. spine: bow / lean, walk counter-rotation        5. arms: overlays by two-bone arm IK
//   6. head: eye-line (lookAtPoint)
// Garments are skinned to the same bones, so moderate changes are fine; big ones (a deep kneel in a
// gown) stretch cloth that was simulated standing - keep those soft, small or off-frame.
//
// The PERFORMANCE track (scenes/lib/humans animation / face / lip-sync) can replace any action:
//   registerHumanAction('walk', (ch, state, t, ctx) => {...})   // or 'gait', 'crouch', 'face', ...
// A registered function runs instead of the built-in one. lipSync hooks: registerHumanAction('face',
// (ch, { mouth, role, placed, t }) => {...}) gets the mouth envelope / placed words of the shot.
//
// Creatures (scenes/lib/creatures/poses.js): the base action names map to pose functions:
//   stand/idle, walk, sit, crouch, lie, rear, pushUp, struggle, fire, flight, glide, bank, dive,
//   strike, sprint, bite (mouthHold), takeoff (launch), land - blended over `blend` seconds.
import * as THREE from 'three';
import { limbIK, lookAtPoint, rotateWorld, relaxHand } from '../sets/cast.js';
import { clamp, ease, lerp } from './timeline.js';

const HUMAN_ACTIONS = new Map();
/** Replace / add a human action (performance track hook). fn(ch, state, t, env, info) */
export function registerHumanAction(name, fn) { HUMAN_ACTIONS.set(name, fn); }
export function humanAction(name) { return HUMAN_ACTIONS.get(name) || null; }

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const wpos = (b, v = new THREE.Vector3()) => v.setFromMatrixPosition(b.matrixWorld);

/**
 * Rest measurements of a character in its drape pose (root at the origin, facing +z): hip height,
 * foot positions, shoulder points, arm length. Cached on the character.
 */
export function humanRig(ch) {
  if (ch._dirRig) return ch._dirRig;
  const r0 = ch.root.position.clone(), q0 = ch.root.quaternion.clone(), s0 = ch.root.scale.clone();
  ch.root.position.set(0, 0, 0); ch.root.quaternion.identity(); ch.root.scale.set(1, 1, 1);
  ch.bones.forEach((b, i) => { b.quaternion.copy(ch.drape.q[i]); b.position.copy(ch.drape.p[i]); });
  ch.root.updateMatrixWorld(true);
  const P = (n) => (ch.bone(n) ? wpos(ch.bone(n)) : null);
  const rig = {
    pelvis: P('root'), head: P('head'), neck: P('neck01'),
    foot: { L: P('foot.L'), R: P('foot.R') }, hip: { L: P('upperleg01.L'), R: P('upperleg01.R') },
    knee: { L: P('lowerleg01.L'), R: P('lowerleg01.R') },
    shoulder: { L: P('upperarm01.L'), R: P('upperarm01.R') }, elbow: { L: P('lowerarm01.L'), R: P('lowerarm01.R') }, wrist: { L: P('wrist.L'), R: P('wrist.R') },
    height: ch.meta?.height || (P('head') ? P('head').y + 0.12 : 1.7),
  };
  rig.legLen = rig.hip.L.distanceTo(rig.knee.L) + rig.knee.L.distanceTo(rig.foot.L);
  rig.armLen = rig.shoulder.R.distanceTo(rig.elbow.R) + rig.elbow.R.distanceTo(rig.wrist.R);
  ch.root.position.copy(r0); ch.root.quaternion.copy(q0); ch.root.scale.copy(s0);
  ch.root.updateMatrixWorld(true);
  ch._dirRig = rig;
  return rig;
}

/** Character-local direction (x right... in the rest frame: +x = character's LEFT, +z = forward) to world. */
function toWorldDir(ch, v) { return v.clone().applyQuaternion(ch.root.quaternion); }
function toWorld(ch, v) { return v.clone().applyMatrix4(ch.root.matrixWorld); }

/** Keep a bone's world orientation (after its parents moved): rotate it back to qWorld. */
function restoreWorldQuat(b, qWorld) {
  b.updateMatrixWorld(true);
  const now = b.getWorldQuaternion(new THREE.Quaternion());
  rotateWorld(b, qWorld.clone().multiply(now.invert()));
}

/** Gait cycle frequency (Hz) and cycle length (m) for a walking speed v (m/s) and body height h. */
export function gaitOf(v, h = 1.7) {
  const f = clamp(0.92 * Math.pow(Math.max(0.2, v) / 1.3, 0.45) * Math.pow(1.7 / h, 0.5), 0.6, 1.6);
  return { f, S: Math.max(0.3, v / f) };
}

/**
 * Pose a human for blocking state `st` at shot time t.
 * env: { point(name, t) -> Vector3, ground(x, z) }, info: { mouth?, placed?, role?, idle? }
 */
export function poseHuman(ch, st, t, env, info = {}) {
  const rig = humanRig(ch);
  // 1. idle (resets to the drape pose)
  ch.update(t, info.idle || {});
  // 2. root
  const post = st.posture;
  const sit = post.sit, crouch = post.crouch, kneel = post.kneel;
  ch.root.position.set(st.x, st.y, st.z);
  ch.root.rotation.set(0, st.yaw, 0);
  ch.root.updateMatrixWorld(true);
  const fwd = new THREE.Vector3(Math.sin(st.yaw), 0, Math.cos(st.yaw));
  const left = new THREE.Vector3(Math.cos(st.yaw), 0, -Math.sin(st.yaw));
  const rootB = ch.bone('root');
  const custom = (n) => { const f = HUMAN_ACTIONS.get(n); if (f) { f(ch, st, t, env, info); return true; } return false; };

  // 3. pelvis drop + legs
  const drop = sit * (rig.pelvis.y - 0.55) + crouch * rig.legLen * 0.42 + kneel * rig.legLen * 0.5;
  const back = sit * 0.12 + crouch * 0.12 + kneel * 0.05;
  const walkW = clamp(st.moving ?? 0);
  let bob = 0, sway = 0, twist = 0, phase = 0;
  const gait = gaitOf(Math.max(0.6, st.speed || 1.2), rig.height);
  if (walkW > 0) {
    phase = st.dist / gait.S;
    bob = -0.022 * (0.5 + 0.5 * Math.cos(4 * Math.PI * phase)) * walkW * Math.min(1.4, (st.speed || 1) / 1.2);
    sway = 0.018 * Math.sin(2 * Math.PI * phase) * walkW;
    twist = 0.07 * Math.sin(2 * Math.PI * phase) * walkW;
  }
  if (rootB && (drop || back || bob || sway)) {
    // move the pelvis in world space: down, back, bob and sway
    const d = new THREE.Vector3(0, -drop + bob, 0).addScaledVector(fwd, -back).addScaledVector(left, sway);
    const pw = wpos(rootB).add(d);
    rootB.parent.updateMatrixWorld(true);
    rootB.position.copy(rootB.parent.worldToLocal(pw));
    ch.root.updateMatrixWorld(true);
  }
  if (rootB && twist) { rotateWorld(rootB, _q.setFromAxisAngle(UP, twist * 0.5)); ch.root.updateMatrixWorld(true); }
  const footQ = { L: ch.bone('foot.L')?.getWorldQuaternion(new THREE.Quaternion()), R: ch.bone('foot.R')?.getWorldQuaternion(new THREE.Quaternion()) };
  if (!custom('legs')) {
    for (const sd of ['L', 'R']) {
      if (!ch.bone(`foot.${sd}`)) continue;
      const restF = toWorld(ch, rig.foot[sd]);          // where the foot is in the drape pose (root placed)
      let target = restF.clone();
      // walk: the foot's offset along the walking direction (planted feet stay still in the world)
      if (walkW > 0) {
        const p = (((phase + (sd === 'L' ? 0 : 0.5)) % 1) + 1) % 1;
        const duty = 0.62;
        let off, lift = 0, pitch = 0;
        if (p < duty) { off = gait.S * (0.31 - (p / duty) * 0.62); pitch = lerp(0.0, -0.25, ease('in', clamp((p - duty + 0.18) / 0.18))); }
        else { const q = (p - duty) / (1 - duty); off = gait.S * (-0.31 + ease('sine', q) * 0.62); lift = 0.11 * Math.sin(Math.PI * q) * (0.8 + 0.2 * (st.speed || 1)); pitch = lerp(-0.3, 0.2, q); }
        target.addScaledVector(fwd, off * walkW).add(new THREE.Vector3(0, lift * walkW, 0));
        footQ[sd] = _q.setFromAxisAngle(left, pitch * walkW).clone().multiply(footQ[sd]);
      }
      // crouch / kneel / sit: the feet stay where they stand; kneel puts the right knee down
      if (kneel > 0 && sd === 'R') target.addScaledVector(fwd, -0.38 * kneel).add(new THREE.Vector3(0, 0.07 * kneel, 0));
      if (kneel > 0 && sd === 'L') target.addScaledVector(fwd, 0.22 * kneel);
      if (sit > 0) target.addScaledVector(fwd, 0.28 * sit);
      if (walkW > 0 || drop > 0.005 || back > 0.005) {
        const knee = toWorld(ch, rig.knee[sd]).addScaledVector(fwd, 0.8).add(new THREE.Vector3(0, 0.2, 0));
        limbIK(ch, 'leg', sd, target, knee);
        if (footQ[sd]) restoreWorldQuat(ch.bone(`foot.${sd}`), footQ[sd]);
      }
    }
  }
  // 4. spine
  if (!custom('spine')) {
    const bow = post.bow + crouch * 0.45 + kneel * 0.15 + post.lean * 0.5 + walkW * 0.05 * Math.min(1.5, st.speed || 1);
    if (bow) {
      for (const [n, w] of [['spine04', 0.3], ['spine03', 0.3], ['spine02', 0.25], ['spine01', 0.15]]) {
        const b = ch.bone(n); if (!b) continue;
        rotateWorld(b, _q.setFromAxisAngle(left, bow * 0.55 * w)); ch.root.updateMatrixWorld(true);
      }
    }
    if (twist) {
      const b = ch.bone('spine03');
      if (b) { rotateWorld(b, _q.setFromAxisAngle(UP, -twist)); ch.root.updateMatrixWorld(true); }
    }
  }
  // 5. arms: walk swing, then overlays by IK
  const armBusy = { L: 0, R: 0 };
  for (const ov of st.overlays) {
    if (ov.w <= 0.001) continue;
    if (custom(ov.name)) { armBusy.L = armBusy.R = 1; continue; }
    applyOverlay(ch, rig, ov, t, env, fwd, left, armBusy);
  }
  if (walkW > 0 && info.armSwing !== 0 && !custom('armSwing')) {
    const amp = (info.armSwing ?? 1) * 0.28 * walkW * Math.min(1.4, (st.speed || 1) / 1.2);
    for (const sd of ['L', 'R']) {
      const free = 1 - armBusy[sd];
      if (free <= 0) continue;
      const p = phase + (sd === 'L' ? 0.5 : 0);
      const b = ch.bone(`upperarm01.${sd}`);
      if (b) { rotateWorld(b, _q.setFromAxisAngle(left, -amp * free * Math.sin(2 * Math.PI * p))); ch.root.updateMatrixWorld(true); }
      const e = ch.bone(`lowerarm01.${sd}`);
      if (e) { rotateWorld(e, _q.setFromAxisAngle(left, -0.12 * free * walkW * (0.6 + 0.4 * Math.sin(2 * Math.PI * p)))); ch.root.updateMatrixWorld(true); }
    }
  }
  // 6. head: eye-line
  if (!custom('look') && st.look && st.look.at != null) {
    const target = env.point(st.look.at, t);
    if (target) {
      const k = st.look.t0 != null ? ease('smooth', clamp((t - st.look.t0) / (st.look.blend || 0.5))) : 1;
      lookAtPoint(ch, target, (st.look.amount ?? 0.85) * k, { limit: 1.3 });
    }
  }
  for (const ov of st.overlays) if ((ov.name === 'nod' || ov.name === 'headShake') && ov.w > 0) headGesture(ch, ov, left);
  custom('face');
  ch.root.updateMatrixWorld(true);
}

function headGesture(ch, ov, left) {
  const b = ch.bone('head'); if (!b) return;
  const f = ov.o.rate ?? 2.2, amp = (ov.o.amount ?? 0.12) * ov.w;
  const s = Math.sin(2 * Math.PI * f * ov.dt);
  rotateWorld(b, _q.setFromAxisAngle(ov.name === 'nod' ? left : UP, (ov.name === 'nod' ? 1 : 1) * amp * s));
  ch.root.updateMatrixWorld(true);
}

/** Arm overlays (two-bone IK toward a target, weight = the overlay envelope). */
function applyOverlay(ch, rig, ov, t, env, fwd, left, busy) {
  const o = ov.o || {};
  const sides = o.side === 'both' || ov.name === 'carry' || ov.name === 'handsTo' || ov.name === 'clasp' ? ['L', 'R'] : [o.side || 'R'];
  for (const sd of sides) {
    const sh = wpos(ch.bone(`upperarm01.${sd}`));
    const sgn = sd === 'L' ? 1 : -1;                                  // +left for the left arm
    let target = null, pole = sh.clone().addScaledVector(left, sgn * 0.4).add(new THREE.Vector3(0, -0.6, 0)).addScaledVector(fwd, -0.2);
    let palm = null, fingers = null;
    switch (ov.name) {
      case 'raiseHand':       // a small raised hand ("stop" / "wait")
        target = sh.clone().addScaledVector(fwd, 0.32).addScaledVector(left, sgn * 0.08).add(new THREE.Vector3(0, 0.02, 0));
        palm = fwd.clone(); fingers = new THREE.Vector3(0, 1, 0).addScaledVector(fwd, 0.2).normalize();
        pole = sh.clone().addScaledVector(left, sgn * 0.5).add(new THREE.Vector3(0, -0.5, 0));
        break;
      case 'wave':
        target = sh.clone().addScaledVector(fwd, 0.15).addScaledVector(left, sgn * 0.25).add(new THREE.Vector3(0, 0.35 + 0.04 * Math.sin(ov.dt * 9), 0));
        palm = fwd.clone(); fingers = UP.clone();
        break;
      case 'point': {
        const at = env.point(o.at, t) || sh.clone().addScaledVector(fwd, 2);
        const d = at.clone().sub(sh).normalize();
        target = sh.clone().addScaledVector(d, rig.armLen * 0.97);
        fingers = d; palm = new THREE.Vector3(0, -1, 0);
        break;
      }
      case 'reach': case 'touch': case 'shove': {
        const at = env.point(o.at || o.to, t);
        if (!at) break;
        target = at.clone();
        if (o.offset) target.add(new THREE.Vector3(...o.offset));
        if (ov.name === 'shove') { const k = Math.sin(Math.PI * clamp(ov.dt / (o.dur ?? 0.45))); target = sh.clone().lerp(target, 0.6 + 0.4 * k); }
        palm = o.palm ? new THREE.Vector3(...o.palm) : null;
        break;
      }
      case 'handsTo': {
        const at = env.point(o.at || o.to, t);
        if (!at) break;
        target = at.clone().addScaledVector(left, sgn * (o.spread ?? 0.09));
        palm = o.palm ? new THREE.Vector3(...o.palm) : new THREE.Vector3(0, 1, 0);
        break;
      }
      case 'carry':
        target = sh.clone().addScaledVector(fwd, 0.33).addScaledVector(left, sgn * -0.04).add(new THREE.Vector3(0, -0.32, 0));
        palm = new THREE.Vector3(0, 1, 0);
        break;
      case 'clasp': case 'hold':
        target = wpos(ch.bone('spine02')).addScaledVector(fwd, 0.26).add(new THREE.Vector3(0, -0.12, 0)).addScaledVector(left, sgn * 0.03);
        break;
      case 'cradle':          // the injured arm held in against the body by the other hand
        if (sd === (o.side || 'L')) target = wpos(ch.bone('spine02')).addScaledVector(fwd, 0.2).addScaledVector(left, sgn * 0.02).add(new THREE.Vector3(0, -0.05, 0));
        break;
      case 'gesture': {
        const a = Math.sin(Math.PI * clamp(ov.dt / (o.dur ?? 1.0)));
        target = sh.clone().addScaledVector(fwd, 0.25 + 0.12 * a).addScaledVector(left, sgn * (0.05 + 0.12 * a)).add(new THREE.Vector3(0, -0.38 + 0.12 * a, 0));
        palm = new THREE.Vector3(0, 1, 0).addScaledVector(left, -sgn * 0.6).normalize();
        break;
      }
      default: break;
    }
    if (!target) continue;
    limbIK(ch, 'arm', sd, target, pole, { reach: ov.w });
    if ((palm || fingers) && ov.w > 0.3) relaxHand(ch, sd, { palm, fingers, curl: o.curl ?? 0.25, keepFingers: o.keepFingers ?? false });
    busy[sd] = Math.max(busy[sd], ov.w);
  }
}

// --------------------------------------------------------------- creatures --
const POSE_ALIASES = { idle: 'stand', takeoff: 'launch', bite: 'mouthHold', bank: 'glide', hover: 'flight', fly: 'flight', breathe: 'stand', still: 'lie' };

/**
 * Pose a creature (creatures library) from its blocking state: the last base act names the pose,
 * the previous one blends out over the act's `blend` seconds. Pose params come from the act's
 * options (+ t). Root: st.x / st.y / st.z / st.yaw (+ o.lift metres, o.pitch / o.roll radians).
 */
export function poseCreature(c, poses, st, t, info = {}) {
  const acts = st.baseActs.filter((a) => !['walk', 'turn', 'place', 'look', 'hide', 'show', 'stand-still'].includes(a[1]) || a[1] === 'walk');
  const mk = (a) => {
    if (!a) return poses.stand(c, { t, ...(info.defaults || {}) });
    const [t0, name0, o = {}] = a;
    const name = POSE_ALIASES[name0] || name0;
    const fn = poses[name];
    if (!fn) throw new Error(`creature action "${name0}" has no pose in creatures/poses.js`);
    const o2 = { ...(info.defaults || {}), ...(info.look ? { look: info.look } : {}), ...o };
    if (name0 === 'bank' && o2.bank == null) o2.bank = 0.4;
    // a pose's own clock: t (absolute shot time) or since the act started (o.local)
    return fn(c, { ...o2, t: o.local ? t - t0 : t + (o.tOffset || 0) });
  };
  const cur = acts[acts.length - 1], prev = acts[acts.length - 2];
  let p = mk(cur);
  if (prev && cur) {
    const bl = cur[2]?.blend ?? 0.6;
    const w = clamp((t - cur[0]) / bl);
    if (w < 1 && poses.blend) p = poses.blend(c, mk(prev), p, ease('smooth', w));
  }
  if (info.mutate) info.mutate(p);
  c.setPose(p);
  const o = cur?.[2] || {};
  c.root.position.set(st.x, st.y + (o.lift || 0), st.z);
  c.root.rotation.set((o.pitch || 0) + (st.pitch || 0), st.yaw, (o.roll || 0) + (st.roll || 0), 'YXZ');
  c.root.updateMatrixWorld(true);
  return p;
}
