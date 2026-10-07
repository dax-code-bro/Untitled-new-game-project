// Deterministic idle motion for characters (pure functions of t; no state, no Math.random).
//
// On top of the drape pose (the bind pose, see loader.js):
//   breathing  - chest rise (spine02/spine01 extension, clavicles up), ~12-18 breaths/min
//   sway       - slow balance sway of the trunk over planted feet (sum of incommensurate sines)
//   head       - small drifts and occasional re-settles of the head
//   eyes       - saccades: the gaze jumps between fixation points every 0.6-3 s
//   blinks     - irregular blinks (close 70 ms, open 160 ms) via the blink morph targets
// Per-character phases come from a hash of the character id, so two people never breathe or
// blink in sync. opts: { amount (1), breath (rate Hz), blink (true), gaze: [yaw, pitch] rad,
// lookAt: Vector3 (world) - head and eyes turn toward it, within limits }.
import * as THREE from 'three';
import { hashStr } from './loader.js';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _ax = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _pq = new THREE.Quaternion(), _m = new THREE.Matrix4();

function h01(seed, i) {
  let x = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i + 1, 0xc2b2ae35)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0; x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Rotate bone b by angle about an axis given in its PARENT's frame (premultiply). */
function rotParent(b, axis, ang) {
  if (!b || !ang) return;
  _q.setFromAxisAngle(_ax.set(...axis).normalize(), ang);
  b.quaternion.premultiply(_q);
}

/** Blink weight at time t for a seeded irregular schedule. */
export function blinkAt(t, seed) {
  // blinks every 2-6 s; evaluate the blink whose window contains t (only neighbours matter)
  const period = 3.6;
  const k = Math.floor(t / period);
  let w = 0;
  for (let j = k - 1; j <= k + 1; j++) {
    const t0 = j * period + h01(seed, j * 7 + 1) * period * 0.9;
    const dt = t - t0;
    if (dt < 0 || dt > 0.3) continue;
    const close = 0.07, open = 0.17;
    w = Math.max(w, dt < close ? Math.sin((dt / close) * Math.PI / 2) : Math.max(0, 1 - (dt - close) / open) ** 1.4);
  }
  return w;
}

/** Saccade target (yaw, pitch) at t: piecewise-constant with quick transitions. */
function gazeAt(t, seed, amp = 0.12) {
  const seg = 1.4;
  const k = Math.floor(t / seg);
  const start = k * seg + h01(seed, k * 13 + 5) * 0.8;
  const pick = (j) => [(h01(seed, j * 3 + 11) - 0.5) * 2 * amp, (h01(seed, j * 3 + 12) - 0.5) * amp];
  const a = pick(k - 1), b = pick(k);
  const s = Math.min(1, Math.max(0, (t - start) / 0.05));   // a saccade takes ~50 ms
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
}

/**
 * Pose the character for time t (drape pose + idle deltas). Call every frame from update(t).
 */
export function applyIdle(ch, t, o = {}) {
  const A = o.amount ?? 1;
  const seed = hashStr(ch.id + (o.seed ?? ''));
  // reset to the drape pose
  ch.bones.forEach((b, i) => { b.quaternion.copy(ch.drape.q[i]); b.position.copy(ch.drape.p[i]); });
  const B = (n) => ch.bone(n);
  const ph = (i) => h01(seed, i) * Math.PI * 2;
  // breathing
  const rate = o.breath ?? 0.22 + 0.08 * h01(seed, 2);
  const br = Math.sin(t * rate * Math.PI * 2 + ph(3));
  const inh = 0.5 + 0.5 * br;
  if (A) {
    rotParent(B('spine02'), [1, 0, 0], -0.012 * inh * A);
    rotParent(B('spine01'), [1, 0, 0], -0.01 * inh * A);
    rotParent(B('neck01'), [1, 0, 0], 0.016 * inh * A);
    rotParent(B('clavicle.L'), [0, 0, 1], 0.012 * inh * A);
    rotParent(B('clavicle.R'), [0, 0, 1], -0.012 * inh * A);
    // balance sway (trunk over planted feet)
    const s1 = Math.sin(t * 0.13 * Math.PI * 2 + ph(4)) * 0.6 + Math.sin(t * 0.31 * Math.PI * 2 + ph(5)) * 0.4;
    const s2 = Math.sin(t * 0.09 * Math.PI * 2 + ph(6)) * 0.7 + Math.sin(t * 0.23 * Math.PI * 2 + ph(7)) * 0.3;
    rotParent(B('spine05'), [0, 0, 1], 0.006 * s1 * A);
    rotParent(B('spine04'), [1, 0, 0], 0.006 * s2 * A);
    rotParent(B('spine03'), [0, 1, 0], 0.01 * s1 * A);
    // head drift (counter-sways a little: people keep their eyes level)
    const hy = (Math.sin(t * 0.07 * Math.PI * 2 + ph(8)) * 0.6 + Math.sin(t * 0.19 * Math.PI * 2 + ph(9)) * 0.4) * 0.05;
    const hp = (Math.sin(t * 0.11 * Math.PI * 2 + ph(10)) * 0.7 + Math.sin(t * 0.27 * Math.PI * 2 + ph(11)) * 0.3) * 0.03;
    rotParent(B('head'), [0, 1, 0], (hy - 0.01 * s1) * A);
    rotParent(B('head'), [1, 0, 0], (hp - 0.004 * s2 - 0.01 * inh) * A);
    // fingers: a slow, tiny drift so hands never look frozen
    const f = Math.sin(t * 0.17 * Math.PI * 2 + ph(12)) * 0.02 * A;
    for (const s of ['L', 'R']) for (const k of [2, 3, 4, 5]) rotParent(B(`finger${k}-2.${s}`), [1, 0, 0], f * (k * 0.25));
  }
  // eyes: saccades + optional gaze offset
  if (o.eyes !== false) {
    const g = gazeAt(t, seed, o.saccade ?? 0.08);
    const gy = (o.gaze?.[0] ?? 0) + g[0], gp = (o.gaze?.[1] ?? 0) + g[1];
    for (const s of ['L', 'R']) {
      const e = B(`eye.${s}`);
      if (!e) continue;
      rotParent(e, [0, 1, 0], gy);
      rotParent(e, [1, 0, 0], -gp);
    }
  }
  // blinks
  const bw = o.blink === false ? 0 : blinkAt(t, seed);
  const lidRest = o.lid ?? 0.12;
  for (const m of ch.meshes) {
    if (!m.morphTargetDictionary) continue;
    const d = m.morphTargetDictionary;
    if (d.blinkL !== undefined) m.morphTargetInfluences[d.blinkL] = Math.min(1, lidRest + (1 - lidRest) * bw);
    if (d.blinkR !== undefined) m.morphTargetInfluences[d.blinkR] = Math.min(1, lidRest + (1 - lidRest) * bw);
  }
  ch.root.updateMatrixWorld(true);
}
