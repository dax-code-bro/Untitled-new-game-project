// Body motion for the humans library: procedural locomotion with planted feet, standing weight
// shift, postures (crouch, kneel, cower, stagger, fall), arm gestures and head look-at - layered on
// the build's drape pose, every frame a pure function of t.
//
// How a walk works (no state between frames):
//   * the root follows a TRAJECTORY (a path walked at a speed with a smooth start and stop, a
//     function of t from the director's blocking, or a baked crowd simulation), sampled at 60 Hz
//     when the schedule is compiled (first apply()).
//   * a GAIT PHASE phi(t) is integrated over the samples (cadence from speed and body height; it
//     holds at a double-support phase while standing, finishing the last step first). Foot k of
//     side s is on the ground for phi in [k + off_s, k + off_s + duty]; its PLANT (where it stands)
//     is the trajectory position at mid-stance, offset sideways: the foot is fixed in the world for
//     the whole stance, whatever the speed or curvature - no sliding.
//   * stance: heel strike (toe up, rolling about the heel), flat, heel off (rolling about the ball,
//     toes stay down); swing: toe-off pose -> heel-strike pose on a minimum-jerk path with toe
//     clearance (a running stride kicks the heel up behind).
//   * pelvis: height with the double bump of walking (highest at mid-stance) or the compression of
//     running (lowest at mid-stance), side shift over the stance foot, rotation and list; legs by
//     two-bone IK to the ankle targets; spine counter-rotation and lean; arms swing opposite the legs
//     (bent 90 degrees when running); head stabilised toward the look target / heading.
//
//   import { createBody } from './motion.js';
//   const body = createBody(ch, { ground: (x, z) => 0 });
//   body.place(0, 0, Math.PI);                      // where it stands before the first walk
//   body.walk([[0, 0], [2, 3], [2, 6]], 1.0, { speed: 1.3, endYaw: 0 });
//   body.gesture('point', 4.0, { side: 'R', at: [5, 2, 0], dur: 1.5 });
//   body.posture('kneel', 7.0, { hold: 3 });
//   update(t): body.apply(t)
import * as THREE from 'three';
import { twoBoneIK, rotateWorld, setWorldQuat, wpos, wquat, handShape, orientHand, hash01, noise1, clamp01, smooth, smoother, lerp } from './rig.js';
import { hashStr } from './loader.js';

const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const sstep = (a, b, x) => smooth((x - a) / (b - a));
const DT = 1 / 60;
const PHI_REST = [0.07, 0.57];
// Gait shape constants (walking end of the walk -> run blend; tuned against normative walking
// kinematics: knee ~5 deg at heel strike, ~15-20 in loading, near straight mid-stance, ~35-40 at
// toe-off, a 60-65 deg peak early in the swing, straight again before the strike).
export const GAIT = {
  mid: 0.41,          // the hip passes over the ankle at this fraction of a walking stance (0.32 running)
  heelOff: 0.7,       // the heel leaves the ground at this fraction of a walking stance
  toeOff: 1.2,        // foot pitch scale (rad; x0.9 = heel up about the ball at toe-off), walking
  liftPeak: 0.2,      // the walking swing lift peaks at this q (< 0: the old sin lift, peak ~0.42)
  liftB: 5,           // decay exponent of the walking swing lift (q^a (1-q)^b)
  lowerQ: 0.8,        // the toe-off height falls to the strike height by this q
  pitchFlat: 0.45,    // the swing foot is level by this q, then turns toe-up for the strike
  drop: 0.5,          // scale of the walking pelvis drop (the legs' reach lowers it where needed)
  reach: 0.992,         // a stance leg may reach this fraction of its length before the pelvis drops
};

// ------------------------------------------------------------- gait model --
/** Gait parameters for speed v (m/s) and body height h (m). run 0..1 = walk -> run blend. */
export function gaitParams(v, h = 1.75) {
  const s = h / 1.75;
  const run = sstep(1.9 * s, 2.7 * s, v);
  const vw = Math.min(v, 2.2 * s);
  const fw = Math.max(0.78, Math.min(1.25, 0.95 * Math.pow(Math.max(0.3, vw) / (1.35 * s), 0.55) / Math.sqrt(s)));
  const fr = Math.max(1.3, Math.min(1.7, (1.42 + 0.07 * (v / s - 3)) / Math.sqrt(s)));
  const f = lerp(fw, fr, run);
  const lowV = clamp01((v / s - 0.4) / 1.2);
  return {
    v, run, f, S: v / f,
    duty: lerp(lerp(0.66, 0.6, lowV), 0.37 - 0.025 * clamp01(v / s - 3), run),
    width: lerp(0.1, 0.05, run) * s,
    bob: lerp(0.02 * Math.min(1.4, Math.max(0.35, v / 1.3)), 0.045, run) * s,
    drop: lerp((0.012 + 0.012 * lowV) * GAIT.drop, 0.07, run) * s,
    lift: lerp(0.06 + 0.04 * lowV, 0.2, run) * s,
    kick: run * 0.22 * s,
    lean: lerp(0.03 + 0.04 * lowV, 0.2 + 0.03 * Math.max(0, v / s - 3), run),
    armA: lerp(0.22 * Math.min(1.5, v / 1.3), 0.62, run),
    elbow: lerp(0.18 + 0.1 * lowV, 1.45, run),
    yawA: lerp(0.06, 0.11, run), rollA: lerp(0.045, 0.025, run), sway: lerp(0.024, 0.008, run) * s,
    strike: lerp(0.3, 0.1, run), toeOff: lerp(GAIT.toeOff, 0.85, run), mid: lerp(GAIT.mid, 0.32, run), heelOff: lerp(GAIT.heelOff, 0.62, run), reach: lerp(GAIT.reach, 0.992, run),
  };
}

// ------------------------------------------------------------ trajectories --
/**
 * A sampled root trajectory (60 Hz): x, z (ground position of the pelvis), yaw (unwrapped), and
 * derived speed v and yaw rate w. at(t) clamps to the ends.
 */
export class Trajectory {
  constructor(t0, x, z, yaw) {
    this.t0 = t0; this.dt = DT; this.n = x.length;
    this.x = x; this.z = z; this.yaw = yaw;
    const n = this.n;
    this.v = new Float64Array(n); this.w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
      const dt = (b - a) * DT || 1;
      this.v[i] = Math.hypot(x[b] - x[a], z[b] - z[a]) / dt;
      this.w[i] = (yaw[b] - yaw[a]) / dt;
    }
  }
  get t1() { return this.t0 + (this.n - 1) * this.dt; }
  at(t, o = {}) {
    const u = (t - this.t0) / this.dt;
    const i = Math.max(0, Math.min(this.n - 2, Math.floor(u)));
    const f = Math.max(0, Math.min(1, u - i));
    o.x = this.x[i] + (this.x[i + 1] - this.x[i]) * f;
    o.z = this.z[i] + (this.z[i + 1] - this.z[i]) * f;
    o.yaw = this.yaw[i] + (this.yaw[i + 1] - this.yaw[i]) * f;
    o.v = this.v[i] + (this.v[i + 1] - this.v[i]) * f;
    o.w = this.w[i] + (this.w[i + 1] - this.w[i]) * f;
    return o;
  }
  /** Sample a function fn(t) -> { x, z, yaw } over [t0, t1]. */
  static fromFn(fn, t0, t1) {
    const n = Math.max(2, Math.ceil((t1 - t0) / DT) + 1);
    const x = new Float64Array(n), z = new Float64Array(n), yaw = new Float64Array(n);
    let prev = null;
    for (let i = 0; i < n; i++) {
      const p = fn(t0 + i * DT);
      x[i] = p.x; z[i] = p.z;
      let y = p.yaw;
      if (prev !== null) y = prev + wrap(y - prev);
      yaw[i] = y; prev = y;
    }
    return new Trajectory(t0, x, z, yaw);
  }
}

/** A smoothed polyline with arc-length lookup (Catmull-Rom through the points). */
export function smoothPath(points, step = 0.05) {
  const P = points.map((p) => [p[0], p.length > 2 ? p[2] : p[1]]);
  if (P.length === 1) P.push([P[0][0], P[0][1] + 1e-4]);
  const pts = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const segL = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const m = Math.max(2, Math.ceil(segL / step));
    for (let j = 0; j < m; j++) {
      const u = j / m, u2 = u * u, u3 = u2 * u;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      pts.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push(P[P.length - 1]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1];
  const at = (s) => {
    s = Math.max(0, Math.min(L, s));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const f = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
    return [lerp(pts[lo][0], pts[hi][0], f), lerp(pts[lo][1], pts[hi][1], f)];
  };
  const dir = (s, win = 0.3) => {
    const a = at(s - win), b = at(s + win);
    let dx = b[0] - a[0], dz = b[1] - a[1];
    let n = Math.hypot(dx, dz);
    if (n < 1e-6) { dx = P[P.length - 1][0] - P[0][0]; dz = P[P.length - 1][1] - P[0][1]; n = Math.hypot(dx, dz) || 1; }
    return Math.atan2(dx / n, dz / n);
  };
  return { length: L, at, dir, pts };
}

/**
 * Speed profile along a path: accelerate over `accel` s, cruise at v, decelerate over `decel` s.
 * Returns { s(dt), v(dt), T }.
 */
export function speedProfile(L, v, accel = 0.6, decel = 0.7) {
  let va = v, ta = accel, td = decel;
  let da = va * ta / 2, dd = va * td / 2;
  if (da + dd > L) { const k = Math.sqrt(L / (da + dd)); va *= k; ta *= k; td *= k; da = va * ta / 2; dd = va * td / 2; }
  const tc = Math.max(0, (L - da - dd) / va);
  const T = ta + tc + td;
  // speed ramps as smoothstep: distance = integral
  const S = (dt) => {
    if (dt <= 0) return 0;
    if (dt < ta) { const u = dt / ta; return va * ta * (u * u * u - u * u * u * u / 2); }
    if (dt < ta + tc) return da + va * (dt - ta);
    if (dt < T) { const u = (dt - ta - tc) / td; return L - dd + va * td * (u - u * u * u + u * u * u * u / 2); }
    return L;
  };
  const V = (dt) => {
    if (dt <= 0 || dt >= T) return 0;
    if (dt < ta) { const u = dt / ta; return va * u * u * (3 - 2 * u); }
    if (dt < ta + tc) return va;
    const u = (dt - ta - tc) / td; return va * (1 - u * u * (3 - 2 * u));
  };
  return { S, V, T, v: va };
}

// ----------------------------------------------------------- measurements --
/** Drape-pose measurements in the character frame (root at the origin, facing +z), cached. */
export function bodyRig(ch) {
  if (ch._bodyRig) return ch._bodyRig;
  const H = ch.header.bones, idx = ch.index;
  const P = (n) => { const b = H[idx[n]]; return b ? new THREE.Vector3(...b.p) : null; };
  const Q = (n) => { const b = H[idx[n]]; return b ? new THREE.Quaternion(b.q[1], b.q[2], b.q[3], b.q[0]) : null; };
  const r = { P, Q };
  r.pelvis = P('root');
  r.height = ch.meta?.height || 1.7;
  for (const s of ['L', 'R']) {
    r[`hip${s}`] = P(`upperleg01.${s}`); r[`knee${s}`] = P(`lowerleg01.${s}`); r[`ankle${s}`] = P(`foot.${s}`);
    const toes = [1, 2, 3, 4, 5].map((k) => P(`toe${k}-1.${s}`)).filter(Boolean);
    const ball = toes.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, toes.length));
    r[`ball${s}`] = ball;
    r[`shoulder${s}`] = P(`upperarm01.${s}`); r[`elbow${s}`] = P(`lowerarm01.${s}`); r[`wrist${s}`] = P(`wrist.${s}`);
    r[`footQ${s}`] = Q(`foot.${s}`);
    r[`toeQ${s}`] = [1, 2, 3, 4, 5].map((k) => Q(`toe${k}-1.${s}`));
  }
  const thigh = r.hipL.distanceTo(r.kneeL), shin = r.kneeL.distanceTo(r.ankleL);
  r.thigh = thigh; r.shin = shin; r.legLen = thigh + shin;
  r.upper = r.shoulderR.distanceTo(r.elbowR); r.fore = r.elbowR.distanceTo(r.wristR); r.armLen = r.upper + r.fore;
  // the foot's own frame: forward = ankle -> ball (horizontal), heel 6 cm behind the ankle on the ground
  for (const s of ['L', 'R']) {
    const a = r[`ankle${s}`], b = r[`ball${s}`];
    const f = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
    const len = f.length() || 0.12;
    f.normalize();
    r[`footYaw${s}`] = Math.atan2(f.x, f.z);                 // toe-out of the drape stance
    r[`ankleH${s}`] = a.y;
    r[`ballFwd${s}`] = len; r[`ballH${s}`] = Math.max(0.0, b.y);
    r[`heelBack${s}`] = 0.055 * r.height / 1.75;
  }
  r.ankleH = (r.ankleHL + r.ankleHR) / 2;
  r.legReach = r.hipL.y - r.ankleH;        // standing hip-to-ankle height in the drape
  // the torso's front surface (clothes included) ahead of spine02 at its height, and its half
  // width: where an arm held against the body has to go (a child, a slim queen and a stout
  // villager differ by 10 cm)
  const sp2 = P('spine02') || r.pelvis.clone().add(new THREE.Vector3(0, 0.2, 0.05));
  let front = 0.1;
  for (const m of ch.header.meshes) {
    if (m.kind !== 'skin' && m.kind !== 'cloth') continue;
    const mesh = ch.meshes.find((x) => x.name.endsWith(':' + m.name));
    const pos = mesh?.geometry?.attributes?.position;
    if (!pos) continue;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (Math.abs(x - sp2.x) < 0.035 && Math.abs(y - sp2.y) < 0.025 && z - sp2.z > front && z - sp2.z < 0.35) front = z - sp2.z;
    }
  }
  r.chestFront = front;
  r.chestHalfW = 0.39 * r.shoulderL.distanceTo(r.shoulderR);
  ch._bodyRig = r;
  return r;
}

// --------------------------------------------------------------- the body --
/**
 * opts: { ground(x, z) -> y (0), arms: 'auto' | 'hang' | 'drape' (auto: hang while walking, the
 * drape pose while standing), idle (opts for applyIdle), seed, weightShift (1: standing weight
 * shift amount), headLook (true) }
 */
export function createBody(ch, opts = {}) {
  const rig = bodyRig(ch);
  const seed = hashStr(ch.id + ':body:' + (opts.seed ?? ''));
  const ground = opts.ground || (() => 0);
  const S = {
    ch, rig, seed, ground, opts,
    start: null, walks: [], follows: [], gestures: [], postures: [], looks: [], staggers: [], falls: [],
    compiled: null,
  };
  const dirty = () => { S.compiled = null; };
  const body = {
    S,
    /** Where the character stands before (and between) walks. */
    place(x, z, yaw = 0) { S.start = { x, z, yaw }; dirty(); return body; },
    /** Walk (or run: speed > ~2.2 m/s) through points [[x, z], ...] starting at t0. o: { speed (1.3),
     *  accel, decel, endYaw (turn to face it after arriving), startYaw } -> { t1 (arrival) } */
    walk(points, t0, o = {}) {
      const path = smoothPath(points);
      const prof = speedProfile(path.length, o.speed ?? 1.3, o.accel ?? (o.speed > 2.2 ? 1.4 : 1.0), o.decel ?? (o.speed > 2.2 ? 1.2 : 0.9));
      const w = { path, prof, t0, t1: t0 + prof.T, o };
      S.walks.push(w); S.walks.sort((a, b) => a.t0 - b.t0); dirty();
      return { t1: w.t1, length: path.length };
    },
    /** Follow an external root motion fn(t) -> { x, z, yaw } over [t0, t1] (director blocking). */
    follow(fn, t0, t1) { S.follows.push({ fn, t0, t1 }); dirty(); return body; },
    /** Use a pre-baked Trajectory (crowd simulation). */
    trajectory(tr) { S.traj = tr; dirty(); return body; },
    /** Arm / hand gesture: name in GESTURES, o: { dur (hold s), in, out, side, at, ... } */
    gesture(name, t0, o = {}) {
      if (!GESTURES[name]) throw new Error(`motion: unknown gesture "${name}" (${Object.keys(GESTURES).join(', ')})`);
      S.gestures.push({ name, t0, o }); return body;
    },
    /** Whole-body posture: 'crouch' | 'kneel' | 'cower' | 'hunch' (o: { hold, in, out, ... }) */
    posture(name, t0, o = {}) { S.postures.push({ name, t0, o }); return body; },
    /** A shove / blast knocks the body dir [x, z] (world) by dist metres: the feet step to catch it. */
    stagger(t0, o = {}) { S.staggers.push({ t0, dir: o.dir || [0, -1], dist: o.dist ?? 0.6, dur: o.dur ?? 0.7 }); dirty(); return body; },
    /** Fall to the ground at t0: o: { dir [x, z] world direction, dur (0.95), still (true: lies still) } */
    fall(t0, o = {}) { S.falls.push({ t0, dir: o.dir || null, dur: o.dur ?? 0.95, o }); return body; },
    /** Head (+ chest) look target from t0: Vector3 | [x,y,z] | fn(t) | { ch, bone } | null (heading) */
    look(target, t0 = -1e9, o = {}) { S.looks.push({ target, t0, amount: o.amount ?? 0.85, blend: o.blend ?? 0.45, chest: o.chest ?? 0.3 }); S.looks.sort((a, b) => a.t0 - b.t0); return body; },
    /** Where the root is at t ({ x, z, yaw, v }). */
    rootAt(t) { compile(S); return S.compiled.traj.at(t, {}); },
    apply(t, o = {}) { compile(S); return applyBody(S, t, o); },
  };
  return body;
}

// ------------------------------------------------------------- compiling --
function compile(S) {
  if (S.compiled) return;
  const { rig } = S;
  let traj = S.traj || null;
  if (!traj) {
    // merge place / walks / follows into one root function
    const segs = [];
    let cur = S.start ? { ...S.start } : { x: 0, z: 0, yaw: 0 };
    const start = { ...cur };
    for (const w of S.walks) {
      const p0 = w.path.at(0);
      const yaw0 = w.o.startYaw ?? cur.yaw;
      const seg = { ...w, from: { ...cur }, yaw0, p0 };
      segs.push(seg);
      const pe = w.path.at(w.path.length);
      cur = { x: pe[0], z: pe[1], yaw: w.o.endYaw ?? w.path.dir(w.path.length) };
    }
    const turnT = 0.8;
    const fn = (t) => {
      for (const f of S.follows) if (t >= f.t0 && t <= f.t1) return f.fn(t);
      let st = start;
      for (let i = 0; i < segs.length; i++) {
        const w = segs[i];
        if (t < w.t0) break;
        const dt = t - w.t0;
        const s = w.prof.S(dt);
        const p = w.path.at(s);
        const heading = w.path.dir(s);
        // turn from the previous facing into the path over the start; after arriving, turn to endYaw
        let yaw = heading;
        const ks = smooth(dt / 0.5);
        yaw = w.yaw0 + wrap(heading - w.yaw0) * ks;
        if (dt > w.prof.T && w.o.endYaw !== undefined) {
          const ke = smooth((dt - w.prof.T) / turnT);
          const hEnd = w.path.dir(w.path.length);
          yaw = hEnd + wrap(w.o.endYaw - hEnd) * ke;
        }
        st = { x: p[0], z: p[1], yaw };
      }
      return st;
    };
    let t0 = -2, t1 = 2;
    for (const w of segs) { t0 = Math.min(t0, w.t0 - 2); t1 = Math.max(t1, w.t1 + turnT + 3); }
    for (const f of S.follows) { t0 = Math.min(t0, f.t0 - 1); t1 = Math.max(t1, f.t1 + 3); }
    for (const sg of S.staggers) t1 = Math.max(t1, sg.t0 + sg.dur + 3);
    traj = Trajectory.fromFn(fn, t0, t1);
  }
  // staggers: displacements added to the trajectory (the gait steps to catch them)
  if (S.staggers.length) {
    const x = Float64Array.from(traj.x), z = Float64Array.from(traj.z);
    for (let i = 0; i < traj.n; i++) {
      const t = traj.t0 + i * DT;
      for (const sg of S.staggers) {
        const u = clamp01((t - sg.t0) / sg.dur);
        if (u <= 0) continue;
        const k = 1 - Math.pow(1 - u, 2.2);           // a hard push that decays
        const n = Math.hypot(sg.dir[0], sg.dir[1]) || 1;
        x[i] += (sg.dir[0] / n) * sg.dist * k; z[i] += (sg.dir[1] / n) * sg.dist * k;
      }
    }
    traj = new Trajectory(traj.t0, x, z, traj.yaw);
  }
  // gait phase table
  const n = traj.n, h = rig.height;
  const phi = new Float64Array(n), hold = new Uint8Array(n), vg = new Float64Array(n);
  let p = PHI_REST[1];
  let fLast = 0.7;
  for (let i = 0; i < n; i++) {
    const v = traj.v[i], w = Math.abs(traj.w[i]);
    const veff = Math.max(v, w * 0.32 * h / 1.75);
    vg[i] = veff;
    if (i > 0) {
      if (veff > 0.06) {
        const g = gaitParams(Math.max(veff, 0.45), h);
        // recovery steps after a shove are quick and short
        const t = traj.t0 + i * DT;
        let boost = 1;
        for (const sg of S.staggers) { const u = (t - sg.t0) / (sg.dur + 0.4); if (u >= 0 && u <= 1) boost = Math.max(boost, 1 + 1.3 * Math.sin(Math.PI * Math.min(1, u * 1.4))); }
        fLast = g.f * boost;
        p += g.f * boost * DT;
      } else {
        // finish the step in progress at the last cadence, then hold at double support
        const fr = p - Math.floor(p);
        const atRest = PHI_REST.some((r) => Math.abs(fr - r) < 1e-6);
        if (!atRest) {
          const f = Math.max(0.65, fLast);
          const next = PHI_REST.map((r) => Math.floor(p) + r + (r <= fr + 1e-9 ? 1 : 0)).reduce((a, b) => Math.min(a, b));
          p = Math.min(next, p + f * DT);
        } else hold[i] = 1;
      }
    } else hold[i] = 1;
    phi[i] = p;
  }
  // holds: the first sample of each run of held samples
  const holdStart = new Float64Array(n);
  let hs = -1;
  for (let i = 0; i < n; i++) { if (hold[i]) { if (hs < 0) hs = i; holdStart[i] = hs; } else { hs = -1; holdStart[i] = -1; } }
  S.compiled = { traj, phi, hold, holdStart, vg, plants: new Map() };
}

/** First sample index with phi >= value (clamped). */
function phiIndex(C, value) {
  const a = C.phi;
  let lo = 0, hi = a.length - 1;
  if (a[0] >= value) return 0;
  if (a[hi] < value) return hi;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m] >= value) hi = m; else lo = m; }
  return hi;
}

/** Where foot side s (0 = L, 1 = R) stands in cycle k: { x, z, y, yaw, duty, rest } (cached). */
function plant(S, s, k) {
  const C = S.compiled;
  const key = s * 1e6 + k;
  let P = C.plants.get(key);
  if (P) return P;
  const { rig } = S;
  const off = s ? 0.5 : 0;
  const strike = k + off;
  const iS = phiIndex(C, strike);
  const g = gaitParams(Math.max(0.45, C.vg[iS]), rig.height);
  const iM = phiIndex(C, strike + g.duty * g.mid);
  let iRef = iM, rest = false;
  if (C.phi[0] >= strike) { iRef = 0; rest = true; }
  else {
    for (let i = iS; i <= iM; i++) if (C.hold[i]) { iRef = i; rest = true; break; }
  }
  const t = C.traj.t0 + iRef * DT;
  const r = C.traj.at(t, {});
  const sd = s ? 'R' : 'L';
  // sideways: the drape stance at rest, a narrow walking track when moving
  const gw = rest ? 0 : clamp01(C.vg[iRef] / 0.5);
  const dx = rig[`ankle${sd}`].x, dz = rig[`ankle${sd}`].z;
  const lat = lerp(dx, (s ? -1 : 1) * g.width / 2, gw);
  const fwd = lerp(dz, dz * 0.5, gw);
  const c = Math.cos(r.yaw), sn = Math.sin(r.yaw);
  const x = r.x + c * lat + sn * fwd, z = r.z - sn * lat + c * fwd;
  const toe = lerp(rig[`footYaw${sd}`], (s ? -1 : 1) * 0.07, gw * 0.6);
  P = { x, z, y: S.ground(x, z), yaw: r.yaw + toe, duty: g.duty, rest, t, k };
  C.plants.set(key, P);
  return P;
}

/**
 * The ankle position + foot pitch of a planted foot rolling on the ground. pitch > 0: toe up about
 * the heel; pitch < 0: heel up about the ball. Returns { pos (world ankle), pitch, yaw }.
 */
function footOnGround(S, sd, P, pitch, out) {
  const { rig } = S;
  const aH = rig[`ankle${sd}`].y, back = rig[`heelBack${sd}`], ballF = rig[`ballFwd${sd}`], ballH = rig[`ballH${sd}`];
  // in the foot's vertical plane: u forward, w up; ankle at (0, aH) with the foot flat
  let u = 0, w = aH;
  if (pitch > 0) {        // about the heel (-back, 0)
    const c = Math.cos(pitch), s = Math.sin(pitch);
    u = -back + back * c - aH * s; w = back * s + aH * c;
  } else if (pitch < 0) { // about the ball (ballF, ballH)
    const a = -pitch, c = Math.cos(a), s = Math.sin(a);
    const du = -ballF, dw = aH - ballH;            // the ankle relative to the ball, rotated clockwise by a
    u = ballF + du * c + dw * s; w = ballH - du * s + dw * c;
  }
  const cy = Math.cos(P.yaw), sy = Math.sin(P.yaw);
  out.set(P.x + sy * u, P.y + w, P.z + cy * u);
  return out;
}

// gait-phase helpers
const mj = (x) => { x = clamp01(x); return x * x * x * (10 + x * (-15 + 6 * x)); };

/** Foot targets for side sd at t: { pos, pitch, yaw, toeFlat (0..1), stance } */
function footAt(S, sd, t, phiT, gNow, amp) {
  const s = sd === 'L' ? 0 : 1;
  const u = phiT - (s ? 0.5 : 0);
  const k = Math.floor(u), p = u - k;
  const P0 = plant(S, s, k);
  const D = P0.duty;
  const g = gaitParams(Math.max(0.45, gNow), S.rig.height);
  const res = { pos: new THREE.Vector3(), pitch: 0, yaw: P0.yaw, toeFlat: 1, stance: true, P: P0 };
  if (p < D) {
    const f = p / D;
    let pitch = 0;
    if (f < 0.14) pitch = g.strike * (1 - smooth(f / 0.14));
    else if (f > g.heelOff) pitch = -g.toeOff * Math.pow(smooth((f - g.heelOff) / (1 - g.heelOff)), 1.3) * 0.9;
    pitch *= amp;
    footOnGround(S, sd, P0, pitch, res.pos);
    res.pitch = pitch;
    res.toeFlat = 1;
    return res;
  }
  // swing from P0 (toe-off) to P1 (heel strike)
  const P1 = plant(S, s, k + 1);
  const q = (p - D) / (1 - D);
  const a = footOnGround(S, sd, P0, -g.toeOff * 0.9 * amp, new THREE.Vector3());
  const b = footOnGround(S, sd, P1, g.strike * amp, new THREE.Vector3());
  // horizontal: cubic Hermite in the world, leaving the ground with some of the body's speed and
  // slowing before the strike (a min-jerk start left a running foot far behind the hip)
  const T = (1 - D) / Math.max(0.3, g.f);
  const dx = b.x - a.x, dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const ux = dist > 1e-6 ? dx / dist : 0, uz = dist > 1e-6 ? dz / dist : 0;
  const m0 = lerp(0.25, 0.85, g.run) * gNow, m1 = lerp(0.15, 0.35, g.run) * gNow;
  const q2 = q * q, q3 = q2 * q;
  const h01 = -2 * q3 + 3 * q2, h10 = q3 - 2 * q2 + q, h11 = q3 - q2;
  let along = dist * h01 + T * (m0 * h10 + m1 * h11);
  along = Math.max(-0.15 * dist, Math.min(dist * 1.05, along));
  res.pos.set(a.x + ux * along, lerp(a.y, b.y, h01), a.z + uz * along);
  // clearance: the foot lifts (early peak); a running heel comes up toward the buttock
  const liftK = Math.min(1, dist / 0.25);
  const yRun = (g.lift * Math.sin(Math.PI * Math.pow(q, 0.8)) + g.kick * Math.sin(Math.PI * Math.min(1, q / 0.62)) * (1 - q)) * liftK * amp;
  const pRun = lerp(-g.toeOff * 0.9, g.strike, smooth(q)) * amp - 0.25 * g.run * Math.sin(Math.PI * q) * amp;
  if (GAIT.liftPeak > 0 && g.run < 1) {
    // walking swing: the heel comes up behind (highest early in the swing, the knee folding), the
    // foot falls to a low clearance as it passes the stance foot, levels, then reaches out toe-up
    // and the knee straightens before the strike
    const pa = GAIT.liftPeak, pb = GAIT.liftB, ea = pb * pa / (1 - pa);
    const bump = Math.pow(q, ea) * Math.pow(1 - q, pb) / (Math.pow(pa, ea) * Math.pow(1 - pa, pb));
    const yW = (b.y - res.pos.y) + (a.y - b.y) * (1 - smooth(q / GAIT.lowerQ)) + g.lift * bump * liftK * amp;
    const pW = (-g.toeOff * 0.9 * (1 - smooth(q / GAIT.pitchFlat)) + g.strike * smooth((q - GAIT.pitchFlat * 0.8) / (1 - GAIT.pitchFlat * 0.8))) * amp;
    res.pos.y += lerp(yW, yRun, g.run);
    res.pitch = lerp(pW, pRun, g.run);
  } else {
    res.pos.y += yRun;
    res.pitch = pRun;
  }
  res.yaw = P0.yaw + wrap(P1.yaw - P0.yaw) * smooth(q);
  res.toeFlat = 0;
  res.stance = false;
  res.q = q;
  return res;
}

// --------------------------------------------------------------- gestures --
// Each gesture gives arm targets in the BODY frame at weight w; o = the gesture's options.
// frame F: { pelvis, chest, fwd, left, up, sh: { L, R }, t, dt, w, ch, rig }
const v3 = (a) => (a?.isVector3 ? a.clone() : Array.isArray(a) ? new THREE.Vector3(a[0], a[1], a[2]) : null);
function pointOf(target, t) {
  if (!target) return null;
  if (target.isVector3 || Array.isArray(target)) return v3(target);
  if (typeof target === 'function') { const p = target(t); return p ? v3(p) : null; }
  if (target.ch) {
    const b = target.ch.bone(target.bone || 'head');
    if (!b) return null;
    b.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
    if (target.offset) {
      // offset in the target character's body frame (x left, y up, z forward)
      const q = target.ch.root.getWorldQuaternion(new THREE.Quaternion());
      p.add(new THREE.Vector3(...target.offset).applyQuaternion(q));
    }
    return p;
  }
  if (target.object) { target.object.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(target.object.matrixWorld); }
  return null;
}

export const GESTURES = {
  /** point at o.at (world) with the index finger */
  point(F, o, sd) {
    const at = pointOf(o.at, F.t) || F.sh[sd].clone().addScaledVector(F.fwd, 3);
    const d = at.clone().sub(F.sh[sd]).normalize();
    return { [sd]: { hand: F.sh[sd].clone().addScaledVector(d, F.rig.armLen * 0.97), fingers: d, palm: new THREE.Vector3(0, -1, 0).addScaledVector(F.left, sd === 'L' ? -0.3 : 0.3).normalize(), shape: 'point', pole: F.sh[sd].clone().add(new THREE.Vector3(0, -0.5, 0)).addScaledVector(F.left, sd === 'L' ? 0.4 : -0.4) } };
  },
  /** a raised waving hand (forearm sways about the elbow) */
  wave(F, o, sd) {
    const sg = sd === 'L' ? 1 : -1;
    const sw = Math.sin(F.dt * (o.rate ?? 2.3) * Math.PI * 2) * 0.12;
    const hand = F.sh[sd].clone().addScaledVector(F.left, sg * (0.24 + sw)).addScaledVector(F.fwd, 0.12).add(new THREE.Vector3(0, 0.36, 0));
    return { [sd]: { hand, fingers: new THREE.Vector3(0, 1, 0).addScaledVector(F.left, sg * sw * 2).normalize(), palm: F.fwd.clone(), shape: 'wave', pole: F.sh[sd].clone().addScaledVector(F.left, sg * 0.6).add(new THREE.Vector3(0, -0.4, 0)) } };
  },
  /** reach a hand to a point (world / fn / { ch, bone, offset }); o.palm [x,y,z] world, o.shape */
  reach(F, o, sd) {
    const at = pointOf(o.at, F.t);
    if (!at) return {};
    const sg = sd === 'L' ? 1 : -1;
    return { [sd]: { hand: at, palm: o.palm ? v3(o.palm).normalize() : null, fingers: o.fingers ? v3(o.fingers).normalize() : null, shape: o.shape || 'cup', pole: F.sh[sd].clone().add(new THREE.Vector3(0, -0.5, 0)).addScaledVector(F.left, sg * 0.35).addScaledVector(F.fwd, -0.25) } };
  },
  /** hold / support another person: like reach, the hand closes round the point (o.at = { ch, bone, offset }) */
  support(F, o, sd) {
    const r = GESTURES.reach(F, { shape: 'clutch', ...o }, sd);
    return r;
  },
  /** cradle the injured arm (o.side = the HURT arm, default 'L'): the hurt forearm across the belly,
   *  the other hand under it near the wrist, shoulders drawn in */
  cradle(F, o) {
    // the classic guard of a broken forearm: the hurt upper arm hangs close at the side, the elbow
    // bent a little past 90 degrees so the forearm lies level across the lower ribs, just clear of
    // the clothes; the hurt hand hangs limp from the wrist at the far edge of the torso; the good
    // hand cups the forearm from below between wrist and mid-forearm (palm up, fingers round it);
    // the hurt shoulder is drawn up and forward. Sizes from the build (bodyRig: chestFront, chestHalfW).
    const hurt = o.side || 'L', good = hurt === 'L' ? 'R' : 'L';
    const sh = hurt === 'L' ? 1 : -1;            // +left for the hurt side
    const R = F.rig;
    const hw = R.chestHalfW, fr = R.chestFront + (o.clear ?? 0.045);
    const lvl = F.chest.clone().addScaledVector(F.up, (o.height ?? 0) - 0.015 * (1 - (o.low ?? 0)) - 0.06 * (o.low ?? 0));
    const tremble = noise1(F.seed + 7, F.t * 7) * 0.003 * (o.tremble ?? 1);
    // the hurt wrist: at the far edge of the torso front, a little higher than the elbow
    const hurtWrist = lvl.clone().addScaledVector(F.fwd, fr + 0.01).addScaledVector(F.left, -sh * hw * 0.55).addScaledVector(F.up, 0.02 + tremble);
    // where the elbow should go: by the hurt side, under the shoulder, a little forward
    const elbowAim = lvl.clone().addScaledVector(F.left, sh * (hw + 0.02)).addScaledVector(F.fwd, fr * 0.45);
    elbowAim.y = F.sh[hurt].y - R.upper * 0.93;
    const foreDir = hurtWrist.clone().sub(elbowAim).normalize();
    // the good hand holds the forearm from below 35 % of the way from the wrist like a tray: palm up
    // under its axis, fingers pointing away from the body (a little toward the elbow) so that their
    // curl wraps them round the front of the forearm; the wrist sits a palm's length behind
    const fingersGood = F.fwd.clone().addScaledVector(F.left, sh * 0.55).addScaledVector(F.up, 0.1).normalize();
    const under = hurtWrist.clone().lerp(elbowAim, 0.35).addScaledVector(F.up, -0.05).addScaledVector(fingersGood, -0.05 * R.height / 1.7);
    // limp hurt hand: fingers carry on from the forearm and droop ~35 degrees; palm toward the body;
    // the fingers fall together and flex the way a hand at rest does, the little finger most (a
    // lighter curl with MakeHuman's splayed rest fingers read as a claw in the 4K still)
    const droop = foreDir.clone().addScaledVector(F.up, -0.7).normalize();
    return {
      [hurt]: { hand: hurtWrist, pole: elbowAim.clone().addScaledVector(F.left, sh * 0.35).addScaledVector(F.up, -0.2).addScaledVector(F.fwd, -0.15), fingers: droop, palm: F.fwd.clone().multiplyScalar(-1).addScaledVector(F.up, -0.3).normalize(), shape: { curl: [0.25, 0.42, 0.47, 0.52, 0.58], spread: -0.12, thumbIn: 0.3 }, shoulder: { up: 0.016, fwd: 0.02 } },
      [good]: { hand: under, pole: F.sh[good].clone().addScaledVector(F.left, -sh * 0.35).addScaledVector(F.up, -0.45).addScaledVector(F.fwd, -0.1), fingers: fingersGood, palm: F.up.clone().addScaledVector(F.fwd, -0.1).normalize(), shape: { curl: [0.35, 0.75, 0.82, 0.85, 0.85], spread: -0.1, thumbIn: 0.05 }, shoulder: { fwd: 0.012 } },
    };
  },
  /** both hands up to the face (grief / shock) */
  handsToFace(F, o) {
    const out = {};
    for (const sd of ['L', 'R']) {
      const sg = sd === 'L' ? 1 : -1;
      const p = F.head.clone().addScaledVector(F.fwd, 0.1).addScaledVector(F.left, sg * 0.045).add(new THREE.Vector3(0, -0.06, 0));
      out[sd] = { hand: p, palm: F.fwd.clone().multiplyScalar(-1), fingers: new THREE.Vector3(0, 1, 0), shape: 'relaxed', pole: F.sh[sd].clone().add(new THREE.Vector3(0, -0.4, 0)).addScaledVector(F.left, sg * 0.2) };
    }
    return out;
  },
  /** arms over the head (cower / falling debris) */
  protectHead(F, o) {
    const out = {};
    for (const sd of ['L', 'R']) {
      const sg = sd === 'L' ? 1 : -1;
      const p = F.head.clone().add(new THREE.Vector3(0, 0.1, 0)).addScaledVector(F.fwd, -0.02).addScaledVector(F.left, sg * 0.07);
      out[sd] = { hand: p, palm: new THREE.Vector3(0, -1, 0), fingers: F.left.clone().multiplyScalar(-sg).addScaledVector(F.fwd, -0.3).normalize(), shape: 'relaxed', pole: F.sh[sd].clone().addScaledVector(F.fwd, 0.6).addScaledVector(F.left, sg * 0.2) };
    }
    return out;
  },
  /** arms thrown out for balance (stagger) */
  flail(F, o) {
    const out = {};
    for (const sd of ['L', 'R']) {
      const sg = sd === 'L' ? 1 : -1;
      const ph = noise1(F.seed + (sg > 0 ? 3 : 4), F.dt * 3);
      const p = F.sh[sd].clone().addScaledVector(F.left, sg * 0.5).add(new THREE.Vector3(0, -0.05 + 0.15 * ph, 0)).addScaledVector(F.fwd, 0.12 * ph);
      out[sd] = { hand: p, shape: 'open', pole: F.sh[sd].clone().add(new THREE.Vector3(0, -0.3, 0)).addScaledVector(F.fwd, -0.3) };
    }
    return out;
  },
  /** carry: both forearms forward as a seat (the carried child is posed by carryChild) */
  carry(F, o) {
    const out = {};
    const seat = F.pelvis.clone().addScaledVector(F.fwd, 0.22).addScaledVector(F.up, 0.16);
    out.R = { hand: seat.clone().addScaledVector(F.left, 0.08), palm: F.up.clone(), fingers: F.left.clone(), shape: 'cup', pole: F.sh.R.clone().add(new THREE.Vector3(0, -0.4, 0)).addScaledVector(F.left, -0.35) };
    out.L = { hand: F.chest.clone().addScaledVector(F.fwd, 0.3).addScaledVector(F.left, 0.04).add(new THREE.Vector3(0, 0.02, 0)), palm: F.fwd.clone().multiplyScalar(-1), fingers: F.left.clone().multiplyScalar(-1).add(new THREE.Vector3(0, 0.4, 0)).normalize(), shape: 'relaxed', pole: F.sh.L.clone().add(new THREE.Vector3(0, -0.4, 0)).addScaledVector(F.left, 0.4) };
    return out;
  },
  /** a talking hand: the forearm comes up, palm up-in, and settles (o.side) */
  explain(F, o, sd) {
    const sg = sd === 'L' ? 1 : -1;
    const a = Math.sin(Math.PI * clamp01(F.dt / (o.beat ?? 0.9)));
    const p = F.sh[sd].clone().addScaledVector(F.fwd, 0.26 + 0.06 * a).addScaledVector(F.left, sg * (0.1 + 0.06 * a)).add(new THREE.Vector3(0, -0.34 + 0.07 * a, 0));
    return { [sd]: { hand: p, palm: new THREE.Vector3(0, 1, 0).addScaledVector(F.left, -sg * 0.6).normalize(), shape: 'relaxed', pole: F.sh[sd].clone().add(new THREE.Vector3(0, -0.5, 0)).addScaledVector(F.left, sg * 0.3).addScaledVector(F.fwd, -0.2) } };
  },
};

function envelopeW(dt, o) {
  const tin = o.in ?? 0.45, hold = o.dur ?? o.hold ?? 1.5, tout = o.out ?? 0.55;
  if (dt < 0) return 0;
  if (dt < tin) return smoother(dt / tin);
  if (dt < tin + hold) return 1;
  const u = (dt - tin - hold) / tout;
  return u >= 1 ? 0 : 1 - smoother(u);
}

// ---------------------------------------------------------------- applying --
/**
 * The legs must reach their planted feet: lower the pelvis (root bone, already placed) where a
 * stance leg would over-extend - this, not a formula, makes the walk's dip at double support; a
 * smooth max keeps it C1.
 */
function reachDrop(S, feet, g) {
  const { ch, rig } = S;
  const rootB = ch.bone('root');
  if (!rootB) return 0;
  let over = -1;
  for (const sd of ['L', 'R']) {
    const Ft = feet[sd];
    const wS = Ft.stance || Ft.kneeDown ? 1 : Math.max((1 - smooth(Ft.q / 0.22)) * (1 - g.run), smooth((Ft.q - 0.75) / 0.25));
    if (wS <= 0) continue;
    const hip = wpos(ch.bone(`upperleg01.${sd}`), _v);
    const horiz = Math.hypot(hip.x - Ft.pos.x, hip.z - Ft.pos.z);
    const Lmax = rig.legLen * (Ft.kneeDown ? 0.999 : g.reach);
    const maxY = Ft.pos.y + Math.sqrt(Math.max(0, Lmax * Lmax - horiz * horiz));
    over = Math.max(over, (hip.y - maxY) * wS);
  }
  const eps = 0.016;
  const drop = 0.5 * (over + Math.sqrt(over * over + eps * eps));      // smooth max(0, over), >= over
  if (drop > 0) {
    // in world space (the root bone's parent frame may be turned: an actor parented to a boat)
    const d = Math.min(drop, rig.legLen * 0.28);
    const pw = wpos(rootB, new THREE.Vector3());
    pw.y -= d;
    rootB.parent.updateMatrixWorld(true);
    rootB.position.copy(rootB.parent.worldToLocal(pw));
    ch.root.updateMatrixWorld(true);
  }
  return drop;
}

/** Legs by two-bone IK to the foot targets, feet turned to the plant's yaw and rolled by its pitch. */
function solveLegs(S, feet) {
  const { ch, rig } = S;
  for (const sd of ['L', 'R']) {
    const F = feet[sd];
    const kneePole = F.pos.clone().addScaledVector(new THREE.Vector3(Math.sin(F.yaw), 0, Math.cos(F.yaw)), 1.0).add(new THREE.Vector3(0, 0.5, 0));
    if (F.kneeDown) kneePole.add(new THREE.Vector3(0, -1.2 * F.kneeDown, 0));
    twoBoneIK(ch, 'leg', sd, F.pos, kneePole, { soft: 0.015 });
    // foot orientation: yaw of the plant, pitch about the foot's lateral axis
    const fb = ch.bone(`foot.${sd}`);
    if (fb) {
      const F0 = rig[`footQ${sd}`];
      const yawRel = F.yaw - rig[`footYaw${sd}`];
      _q.setFromAxisAngle(_v.set(0, 1, 0), yawRel);
      const lat = _v2.set(1, 0, 0).applyAxisAngle(UP, F.yaw);
      _q2.setFromAxisAngle(lat, -F.pitch);
      const q = _q2.clone().multiply(_q).multiply(F0);
      fb.parent.updateWorldMatrix(true, false);
      setWorldQuat(fb, q);
      // toes stay flat on the ground while the heel is up
      if (F.pitch < 0) {
        const toeQ = _q.clone();          // yaw only (flat)
        for (let k = 1; k <= 5; k++) {
          const tb = ch.bone(`toe${k}-1.${sd}`);
          if (!tb) continue;
          const T0 = rig[`toeQ${sd}`][k - 1];
          const flat = toeQ.clone().multiply(T0);
          const bent = _q2.clone().multiply(toeQ).multiply(T0);
          setWorldQuat(tb, bent.slerp(flat, 0.85 * F.toeFlat));
        }
      }
    }
  }
}

function applyBody(S, t, o) {
  const { ch, rig, seed } = S;
  const C = S.compiled;
  // 1. idle from the drape pose (breathing, sway, head drift); eyes / blinks are the face layer's
  ch.update(t, { ...(S.opts.idle || {}), ...(o.idle || {}) });
  const r = C.traj.at(t, {});
  const gy = S.ground(r.x, r.z);
  // falls rotate the whole body: computed first so the root carries them
  ch.root.position.set(r.x, gy, r.z);
  ch.root.rotation.set(0, r.yaw, 0);
  ch.root.updateMatrixWorld(true);
  const fwd = new THREE.Vector3(Math.sin(r.yaw), 0, Math.cos(r.yaw));
  const left = new THREE.Vector3(Math.cos(r.yaw), 0, -Math.sin(r.yaw));
  // gait state
  const u = (t - C.traj.t0) / DT;
  const i0 = Math.max(0, Math.min(C.traj.n - 2, Math.floor(u)));
  const fi = clamp01(u - i0);
  const phiT = C.phi[i0] + (C.phi[i0 + 1] - C.phi[i0]) * fi;
  const vNow = C.vg[i0] + (C.vg[i0 + 1] - C.vg[i0]) * fi;
  const gw = sstep(0.02, 0.5, vNow);                   // gait weight (0 standing)
  const g = gaitParams(Math.max(0.45, vNow), rig.height);
  const stepping = C.phi[Math.min(C.traj.n - 1, i0 + 1)] !== C.phi[Math.max(0, i0 - 1)];
  const amp = Math.max(gw, stepping ? 0.35 : 0);
  // posture weights
  const post = { crouch: 0, kneel: 0, cower: 0, hunch: 0 };
  for (const p of S.postures) { const w = envelopeW(t - p.t0, { in: 0.7, out: 0.8, hold: Infinity, ...p.o }); if (w > post[p.name]) post[p.name] = w; }
  const fall = fallState(S, t);
  // 2. feet: planted feet (gait), standing feet, or posture feet
  const feet = {};
  for (const sd of ['L', 'R']) feet[sd] = footAt(S, sd, t, phiT, vNow, amp);
  // postures move the feet: kneel puts the right knee down, the left foot forward
  for (const sd of ['L', 'R']) {
    const F = feet[sd];
    if (post.kneel > 0) {
      const k = post.kneel;
      if (sd === 'L') { F.pos.addScaledVector(fwd, 0.3 * smooth(k * 1.6)); }
      else {
        // right knee on the ground ~8 cm behind the hip line; the foot behind it, toes down
        const kneeG = new THREE.Vector3(r.x, gy + 0.06, r.z).addScaledVector(left, -0.1).addScaledVector(fwd, -0.12);
        const ankleK = kneeG.clone().addScaledVector(fwd, -rig.shin * 0.93).add(new THREE.Vector3(0, 0.1, 0));
        F.pos.lerp(ankleK, smooth(clamp01(k * 1.4 - 0.25)));
        F.pitch = lerp(F.pitch, -0.95, smooth(clamp01(k * 1.4 - 0.25)));
        F.kneeDown = k;
      }
    }
  }
  // 3. pelvis
  const rootB = ch.bone('root');
  const D = g.duty;
  const ph2 = 2 * Math.PI * (phiT - D / 2);
  let bob = (1 - g.run) * g.bob * Math.cos(2 * ph2) - g.run * g.bob * Math.cos(2 * ph2) * 0.9;
  bob = bob * gw - g.drop * gw;
  const lat = g.sway * Math.cos(ph2) * gw;
  // standing weight shift: the pelvis drifts over one foot every few seconds
  const ws = (S.opts.weightShift ?? 1) * (1 - gw) * (1 - post.kneel) * (1 - fall.w);
  const shiftU = noise1(seed + 1, t * 0.11) * 0.8 + noise1(seed + 2, t * 0.27) * 0.2;
  const latStand = 0.025 * shiftU * ws;
  const fallBuckle = fall.w > 0 ? smooth(fall.dt / fall.f.dur / 0.3) * (1 - 0.7 * clamp01((fall.dt / fall.f.dur - 0.18) / 0.82)) : 0;
  const pelvisDrop = fallBuckle * 0.24 + post.crouch * rig.legLen * 0.38 + post.cower * rig.legLen * 0.5 + post.kneel * (rig.pelvis.y - (0.06 + rig.thigh * 0.95 + 0.0)) + post.hunch * 0.03 + Math.abs(shiftU) * 0.004 * ws;
  const pelvisBack = post.crouch * 0.12 + post.cower * 0.16 - post.kneel * 0.02;
  if (rootB) {
    const d0 = ch.drape.p[ch.index.root];
    rootB.position.set(d0.x + lat + latStand, d0.y + bob - pelvisDrop, d0.z - pelvisBack);
    const yawP = -g.yawA * Math.cos(2 * Math.PI * phiT) * gw;
    const rollP = g.rollA * Math.cos(ph2) * gw + 0.035 * shiftU * ws;
    _q.setFromAxisAngle(_v.set(0, 1, 0), yawP);
    _q2.setFromAxisAngle(_v.set(0, 0, 1), rollP);
    _q3.setFromAxisAngle(_v.set(1, 0, 0), 0.06 * gw + post.crouch * 0.25 + post.cower * 0.35 + post.kneel * 0.05);
    rootB.quaternion.copy(ch.drape.q[ch.index.root]).premultiply(_q3).premultiply(_q2).premultiply(_q);
    ch.root.updateMatrixWorld(true);
    reachDrop(S, feet, g);
  }
  // 4. legs by IK to the foot targets
  solveLegs(S, feet);
  ch.root.updateMatrixWorld(true);
  // 5. spine: lean with speed, counter-rotation, postures
  const spineBend = g.lean * gw + post.crouch * 0.35 + post.cower * 0.75 + post.hunch * 0.28 + post.kneel * 0.08;
  const counter = g.yawA * 0.9 * Math.cos(2 * Math.PI * phiT) * gw;
  const latBend = -0.6 * g.rollA * Math.cos(ph2) * gw - 0.02 * shiftU * ws;
  for (const [n, w] of [['spine04', 0.25], ['spine03', 0.3], ['spine02', 0.3], ['spine01', 0.15]]) {
    const b = ch.bone(n); if (!b) continue;
    if (spineBend) rotateWorld(b, _q.setFromAxisAngle(left, spineBend * w));
    if (counter) rotateWorld(b, _q.setFromAxisAngle(UP, counter * w));
    if (latBend) rotateWorld(b, _q.setFromAxisAngle(fwd, latBend * w));
  }
  // head down a little when cowering / hunched
  const headDown = post.cower * 0.45 + post.hunch * 0.15;
  if (headDown) for (const [n, w] of [['neck01', 0.5], ['head', 0.5]]) { const b = ch.bone(n); if (b) rotateWorld(b, _q.setFromAxisAngle(left, headDown * w)); }
  ch.root.updateMatrixWorld(true);
  // 6. arms: base (hang + swing while moving), then gestures
  const armsMode = S.opts.arms || 'auto';
  const hangW = armsMode === 'drape' ? 0 : armsMode === 'hang' ? 1 : Math.max(gw, post.cower, fall.w);
  const F = frameOf(S, t, fwd, left);
  const targets = { L: null, R: null };
  if (hangW > 0.001) {
    for (const sd of ['L', 'R']) {
      const sg = sd === 'L' ? 1 : -1;
      const swing = g.armA * Math.cos(2 * Math.PI * phiT) * (sd === 'L' ? -1 : 1) * gw;
      const sh = F.sh[sd];
      // relaxed hanging arm, slightly forward and out; elbow bends more as it swings forward
      const down = new THREE.Vector3(0, -1, 0);
      const elb = g.elbow + Math.max(0, swing) * 0.6;
      const upperDir = down.clone().applyAxisAngle(left, -swing).addScaledVector(left, sg * 0.1).normalize();
      const elbowP = sh.clone().addScaledVector(upperDir, rig.upper);
      const foreDir = upperDir.clone().applyAxisAngle(left, -elb).addScaledVector(left, -sg * 0.12 * g.run).normalize();
      const hand = elbowP.clone().addScaledVector(foreDir, rig.fore * 0.98);
      targets[sd] = { hand, w: hangW, pole: elbowP.clone().addScaledVector(fwd, -0.4).addScaledVector(left, sg * 0.15), shape: g.run > 0.5 ? 'clutch' : 'relaxed', fingers: foreDir, palm: left.clone().multiplyScalar(-sg).addScaledVector(fwd, -0.2).normalize() };
    }
  }
  // gestures: the strongest active one per arm wins over the base
  const gest = { L: null, R: null };
  for (const ge of S.gestures) {
    const dt = t - ge.t0;
    const w = envelopeW(dt, ge.o);
    if (w <= 0) continue;
    F.dt = dt; F.w = w;
    const res = GESTURES[ge.name](F, ge.o, ge.o.side || 'R');
    for (const sd of ['L', 'R']) if (res[sd] && (!gest[sd] || w >= gest[sd].w)) gest[sd] = { ...res[sd], w, name: ge.name };
  }
  // postures with arm poses
  if (post.cower > 0.01) {
    F.dt = t; const res = GESTURES.protectHead(F, {});
    for (const sd of ['L', 'R']) if (!gest[sd] || gest[sd].w < post.cower) gest[sd] = { ...res[sd], w: post.cower };
  }
  // a reach beyond the arm bends the trunk toward it (picking something up, a hand to the ground)
  for (const sd of ['L', 'R']) {
    const ge = gest[sd];
    if (!ge || !ge.hand || !(ge.name === 'reach' || ge.name === 'support')) continue;
    const sh = wpos(ch.bone(`upperarm01.${sd}`), new THREE.Vector3());
    const deficit = sh.distanceTo(ge.hand) - rig.armLen * 0.93;
    if (deficit <= 0) continue;
    const below = clamp01((sh.y - ge.hand.y) / 0.4);
    const ang = Math.min(0.9, deficit / 0.45) * ge.w * (0.4 + 0.6 * below);
    const toT = ge.hand.clone().sub(F.pelvis).setY(0).normalize();
    const ax = new THREE.Vector3().crossVectors(UP, toT).normalize();
    for (const [n, k] of [['spine04', 0.2], ['spine03', 0.3], ['spine02', 0.3], ['spine01', 0.2]]) { const b = ch.bone(n); if (b) rotateWorld(b, _q.setFromAxisAngle(ax, ang * k)); }
    ch.root.updateMatrixWorld(true);
  }
  for (const sd of ['L', 'R']) {
    const base = targets[sd], ge = gest[sd];
    if (base) solveArm(ch, sd, base, base.w);
    if (ge) {
      if (ge.shoulder) shrug(ch, sd, ge.shoulder, ge.w, fwd);
      solveArm(ch, sd, ge, ge.w);
    }
  }
  ch.root.updateMatrixWorld(true);
  // 7. falls (whole-body topple about the feet)
  if (fall.w > 0) applyFall(S, fall, t, fwd, left);
  // 8. head look / stabilisation
  if (S.opts.headLook !== false) applyLook(S, t, fwd, left, gw, fall);
  ch.root.updateMatrixWorld(true);
  return { phi: phiT, v: vNow, gait: gw, feet, post, fall: fall.w, root: r };
}

function frameOf(S, t, fwd, left) {
  const { ch } = S;
  const P = (n) => { const b = ch.bone(n); b.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(b.matrixWorld); };
  return {
    t, ch, rig: S.rig, seed: S.seed, fwd, left, up: UP.clone(),
    pelvis: P('root'), chest: P('spine02'), head: P('head'),
    sh: { L: P('upperarm01.L'), R: P('upperarm01.R') },
  };
}

/**
 * Planted-foot legs for a character whose root, pelvis and spine someone else posed for time t (the
 * shot director's poseHuman): the feet come from this body's own trajectory (body.follow() of the
 * director's blocking), so a stance foot stays fixed in the world whatever the path, speed or turn;
 * the pelvis is lowered where a stance leg would over-extend; feet roll heel-to-toe. post: { crouch,
 * kneel, sit } (0..1, the blocking's posture ramps) move the feet like the director's own stances
 * (kneel: right knee down, left foot forward; sit: feet forward). Blocking coordinates are in the
 * frame of ch.root's parent (an actor aboard a boat), converted to world here.
 */
export function legsNow(body, t, post = {}) {
  const S = body.S;
  compile(S);
  const C = S.compiled, { ch, rig } = S;
  const u = (t - C.traj.t0) / DT;
  const i0 = Math.max(0, Math.min(C.traj.n - 2, Math.floor(u)));
  const fi = clamp01(u - i0);
  const phiT = C.phi[i0] + (C.phi[i0 + 1] - C.phi[i0]) * fi;
  const vNow = C.vg[i0] + (C.vg[i0 + 1] - C.vg[i0]) * fi;
  const gw = sstep(0.02, 0.5, vNow);
  const g = gaitParams(Math.max(0.45, vNow), rig.height);
  const stepping = C.phi[Math.min(C.traj.n - 1, i0 + 1)] !== C.phi[Math.max(0, i0 - 1)];
  const amp = Math.max(gw, stepping ? 0.35 : 0);
  const feet = { L: footAt(S, 'L', t, phiT, vNow, amp), R: footAt(S, 'R', t, phiT, vNow, amp) };
  const par = ch.root.parent;
  let yawP = 0;
  if (par) {
    par.updateMatrixWorld(true);
    const pq = par.getWorldQuaternion(new THREE.Quaternion());
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(pq);
    yawP = Math.atan2(f.x, f.z);
    for (const sd of ['L', 'R']) { feet[sd].pos.applyMatrix4(par.matrixWorld); feet[sd].yaw += yawP; }
  }
  const rq = ch.root.getWorldQuaternion(new THREE.Quaternion());
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rq).setY(0).normalize();
  const kneel = post.kneel || 0, sit = post.sit || 0;
  if (kneel > 0) {
    feet.L.pos.addScaledVector(fwd, 0.22 * kneel);
    feet.R.pos.addScaledVector(fwd, -0.38 * kneel).y += 0.07 * kneel;
    feet.R.pitch = lerp(feet.R.pitch, -0.95, smooth(clamp01(kneel * 1.4 - 0.25)));
    feet.R.kneeDown = kneel;
  }
  if (sit > 0) for (const sd of ['L', 'R']) feet[sd].pos.addScaledVector(fwd, 0.28 * sit);
  ch.root.updateMatrixWorld(true);
  reachDrop(S, feet, g);
  solveLegs(S, feet);
  ch.root.updateMatrixWorld(true);
  return { feet, phi: phiT, v: vNow, gait: gw };
}

/**
 * Pose one GESTURES entry on a character as it stands now (root, legs and spine already posed by
 * someone else - e.g. the shot director's poseHuman): builds the body frame from the current bones,
 * shrugs and solves the arms by IK at weight w. dt = seconds since the gesture began.
 */
export function gestureNow(ch, name, o = {}, w = 1, t = 0, dt = 0) {
  if (!GESTURES[name] || w <= 0.001) return null;
  ch.root.updateMatrixWorld(true);
  const rq = ch.root.getWorldQuaternion(new THREE.Quaternion());
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rq).setY(0).normalize();
  const left = new THREE.Vector3(fwd.z, 0, -fwd.x);
  const S = { ch, rig: bodyRig(ch), seed: hashStr(ch.id + ':body:') };
  const F = frameOf(S, t, fwd, left);
  F.dt = dt; F.w = w;
  const res = GESTURES[name](F, o, o.side || 'R');
  for (const sd of ['L', 'R']) {
    const g = res[sd];
    if (!g) continue;
    if (g.shoulder) shrug(ch, sd, g.shoulder, w, fwd);
    solveArm(ch, sd, g, w);
  }
  ch.root.updateMatrixWorld(true);
  return res;
}

function solveArm(ch, sd, tg, w) {
  if (!tg.hand || w <= 0.001) return;
  const pole = tg.pole || wpos(ch.bone(`upperarm01.${sd}`), new THREE.Vector3()).add(new THREE.Vector3(0, -0.5, 0));
  twoBoneIK(ch, 'arm', sd, tg.hand, pole, { reach: w, soft: 0.02 });
  if (tg.shape) handShape(ch, sd, tg.shape, Math.min(1, w * 1.2));
  if (tg.fingers || tg.palm) orientHand(ch, sd, tg.fingers || null, tg.palm || null, Math.min(1, w));
}

/** Raise / bring forward a shoulder (clavicle) by metres at its tip. */
function shrug(ch, sd, o, w, fwd) {
  const c = ch.bone(`clavicle.${sd}`);
  if (!c) return;
  const sg = sd === 'L' ? 1 : -1;
  const up = (o.up ?? 0) * w, fw = (o.fwd ?? 0) * w;
  const len = 0.16;
  const left = new THREE.Vector3(fwd.z, 0, -fwd.x);
  // left clavicle tip at +left: about fwd by +a lifts it; about up by -a brings it forward (mirrored for R)
  rotateWorld(c, _q.setFromAxisAngle(fwd, sg * Math.atan2(up, len)));
  rotateWorld(c, _q.setFromAxisAngle(UP, -sg * Math.atan2(fw, len)));
  void left;
}

// --------------------------------------------------------------- look / head --
function applyLook(S, t, fwd, left, gw, fall) {
  const { ch } = S;
  let cur = null, prev = null;
  for (const L of S.looks) if (L.t0 <= t) { prev = cur; cur = L; }
  const head = ch.bone('head');
  if (!head) return;
  head.updateWorldMatrix(true, false);
  const hp = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
  let target = cur ? pointOf(cur.target, t) : null;
  let amount = cur ? cur.amount : 0;
  if (cur && prev && t - cur.t0 < cur.blend) {
    const k = smooth((t - cur.t0) / cur.blend);
    const p0 = pointOf(prev.target, t);
    if (p0 && target) target = p0.lerp(target, k);
    else if (!target) amount *= 1 - k;
    amount = lerp(prev.amount, amount, k);
  } else if (cur && !prev && t - cur.t0 < cur.blend) amount *= smooth((t - cur.t0) / cur.blend);
  // walking without a target: eyes on the path ahead (stabilised head, slightly down)
  if (!target && gw > 0.05) { target = hp.clone().addScaledVector(fwd, 5).add(new THREE.Vector3(0, -0.6, 0)); amount = 0.7 * gw; }
  if (!target || amount <= 0 || fall.w > 0.5) return;
  const to = target.clone().sub(hp);
  const yawT = Math.atan2(to.x, to.z), pitchT = Math.atan2(to.y, Math.hypot(to.x, to.z));
  // the head's current facing: the root's forward carried by the head's rotation since the drape
  const hq = head.getWorldQuaternion(new THREE.Quaternion());
  const rootQ = ch.root.getWorldQuaternion(new THREE.Quaternion());
  const delta = hq.clone().multiply(rootQ.clone().multiply(S.rig.Q('head')).invert());
  const hf = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ).applyQuaternion(delta);
  const yawC = Math.atan2(hf.x, hf.z), pitchC = Math.atan2(hf.y, Math.hypot(hf.x, hf.z));
  const lim = 1.35;
  let dy = Math.max(-lim, Math.min(lim, wrap(yawT - yawC))) * amount;
  const dp = Math.max(-0.7, Math.min(0.6, pitchT - pitchC)) * amount;
  // the chest takes part of a big turn
  const chestW = (cur?.chest ?? 0.3) * clamp01((Math.abs(dy) - 0.5) / 0.8);
  if (chestW > 0) {
    const ys = dy * chestW;
    for (const [n, w] of [['spine03', 0.35], ['spine02', 0.35], ['spine01', 0.3]]) { const b = ch.bone(n); if (b) rotateWorld(b, _q.setFromAxisAngle(UP, ys * w)); }
    dy -= ys;
  }
  for (const [n, w] of [['neck01', 0.25], ['neck02', 0.2], ['head', 0.55]]) {
    const b = ch.bone(n); if (!b) continue;
    rotateWorld(b, _q.setFromAxisAngle(UP, dy * w));
    b.updateWorldMatrix(true, false);
    const side = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, yawT);
    rotateWorld(b, _q.setFromAxisAngle(side, -dp * w));
  }
}

// ------------------------------------------------------------------- falls --
function fallState(S, t) {
  let best = { w: 0 };
  for (const f of S.falls) {
    const dt = t - f.t0;
    if (dt < 0) continue;
    best = { w: 1, dt, f };
  }
  return best;
}

/**
 * Fall: knees buckle (0 - 0.3 of dur), the body topples about the feet with the hips folding
 * (0.2 - 1.0, gravity-like ease-in), hands reach for the ground, a small bounce, then it lies (prone
 * for a forward fall, on the back for a backward one). Applied after the legs and arms: the whole
 * root is turned about a pivot on the ground, the limbs then re-aimed at ground targets.
 */
function applyFall(S, fs, t, fwd, left) {
  const { ch, rig } = S;
  const f = fs.f, dt = fs.dt, T = f.dur;
  const dirW = f.dir ? new THREE.Vector3(f.dir[0], 0, f.dir[1]).normalize() : fwd.clone();
  const forward = dirW.dot(fwd) >= -0.2;
  const u = dt / T;
  const buckle = smooth(u / 0.3);
  let topple = clamp01((u - 0.18) / 0.82);
  topple = topple * topple;                        // falling accelerates
  const bounce = u > 1 ? Math.exp(-(dt - T) * 9) * Math.sin((dt - T) * 22) * 0.04 : 0;
  const ang = (forward ? 1.42 : 1.48) * topple + bounce * (topple > 0.99 ? 1 : 0);
  // pivot: the ground under the feet's midpoint (forward: in front of the toes; back: the heels)
  const fl = wpos(ch.bone('foot.L'), new THREE.Vector3()), fr = wpos(ch.bone('foot.R'), new THREE.Vector3());
  const piv = fl.add(fr).multiplyScalar(0.5);
  piv.y = S.ground(piv.x, piv.z);
  piv.addScaledVector(dirW, forward ? 0.1 : -0.06);
  void buckle;   // (the knees buckle in applyBody: the pelvis drops with the feet planted)
  const axis = new THREE.Vector3().crossVectors(UP, dirW).normalize();   // rotating about it tips the top toward dir
  // hips fold during the topple (forward: the trunk goes down first)
  const fold = (forward ? 0.55 : -0.25) * Math.sin(Math.PI * Math.min(1, topple * 1.1)) * 0.8 + (forward ? 0.12 : 0) * topple;
  for (const [n, w] of [['spine04', 0.4], ['spine03', 0.35], ['spine02', 0.25]]) { const b = ch.bone(n); if (b) rotateWorld(b, _q.setFromAxisAngle(axis, fold * w)); }
  ch.root.updateMatrixWorld(true);
  // the whole body about the pivot
  const q = new THREE.Quaternion().setFromAxisAngle(axis, ang);
  const rp = ch.root.position.clone().sub(piv).applyQuaternion(q).add(piv);
  ch.root.position.copy(rp);
  ch.root.quaternion.premultiply(q);
  // keep the lowest point on the ground: lift so nothing sinks (pelvis / chest about 0.12 m up)
  ch.root.updateMatrixWorld(true);
  const ch2 = wpos(ch.bone('spine02'), new THREE.Vector3());
  const minY = S.ground(ch2.x, ch2.z) + 0.13;
  if (ch2.y < minY) { ch.root.position.y += (minY - ch2.y) * smooth(topple * 1.5); ch.root.updateMatrixWorld(true); }
  // once down, the legs lie along the ground behind the pelvis (not folded up in the air)
  const down = smooth((topple - 0.7) / 0.3);
  if (down > 0) {
    for (const sd of ['L', 'R']) {
      const sg = sd === 'L' ? 1 : -1;
      const hip = wpos(ch.bone(`upperleg01.${sd}`), new THREE.Vector3());
      // the feet are on the pivot side (opposite the direction of the fall) either way
      const tgt = hip.clone().addScaledVector(dirW, -rig.legLen * 0.93).addScaledVector(axis, sg * 0.06);
      tgt.y = S.ground(tgt.x, tgt.z) + 0.09;
      // prone: knees toward the ground; on the back: knees up a little
      const pole = hip.clone().addScaledVector(dirW, -0.4).add(new THREE.Vector3(0, forward ? -0.6 : 0.6, 0));
      twoBoneIK(ch, 'leg', sd, tgt, pole, { reach: down });
    }
    const pel = wpos(ch.bone('root'), new THREE.Vector3());
    const pmin = S.ground(pel.x, pel.z) + 0.11;
    if (pel.y < pmin) { ch.root.position.y += pmin - pel.y; ch.root.updateMatrixWorld(true); }
  }
  // hands reach for the ground ahead (forward) / out to the sides (back)
  const reach = smooth((u - 0.25) / 0.45);
  if (reach > 0) {
    for (const sd of ['L', 'R']) {
      const sg = sd === 'L' ? 1 : -1;
      const sh = wpos(ch.bone(`upperarm01.${sd}`), new THREE.Vector3());
      const tgt = sh.clone().addScaledVector(dirW, forward ? 0.25 : -0.05).addScaledVector(axis, sg * (forward ? 0.12 : 0.35));
      tgt.y = S.ground(tgt.x, tgt.z) + 0.05;
      const pole = sh.clone().add(new THREE.Vector3(0, 0.4, 0)).addScaledVector(axis, sg * 0.4);
      twoBoneIK(ch, 'arm', sd, tgt, pole, { reach: reach * (u < 1.3 ? 1 : 0.8), soft: 0.03 });
      handShape(ch, sd, 'open', reach);
    }
  }
  // the head turns to one side lying down
  const hb = ch.bone('head');
  if (hb && topple > 0.8) rotateWorld(hb, _q.setFromAxisAngle(dirW, 0.5 * smooth((topple - 0.8) / 0.2) * (hash01(S.seed, 77) < 0.5 ? 1 : -1)));
  ch.root.updateMatrixWorld(true);
}

// ------------------------------------------------------------ carry a child --
/**
 * Pose a carried child on an adult's hip / forearm (call after both apply(t)): the child sits on the
 * adult's right forearm, facing the adult, legs either side of the adult's waist, arms round the
 * adult's neck. w: 0..1 (blend in from the child's own pose).
 */
export function carryChild(adult, child, w = 1) {
  if (w <= 0) return;
  const A = adult.S.ch, Cc = child.S.ch;
  A.root.updateMatrixWorld(true);
  const rq = A.root.getWorldQuaternion(new THREE.Quaternion());
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rq).setY(0).normalize();
  const left = new THREE.Vector3(fwd.z, 0, -fwd.x);
  const pelvis = wpos(A.bone('root'), new THREE.Vector3());
  // seat on the adult's right front, child facing the adult's chest, turned a little to the side
  const seat = pelvis.clone().addScaledVector(fwd, 0.2).addScaledVector(left, -0.1).add(new THREE.Vector3(0, 0.12, 0));
  const cyaw = Math.atan2(-fwd.x, -fwd.z) - 0.5;
  const cr = child.S.rig;
  // place the child's root so its pelvis sits on the seat
  const cq = new THREE.Quaternion().setFromAxisAngle(UP, cyaw);
  const pelOff = cr.pelvis.clone().applyQuaternion(cq);
  const want = seat.clone().sub(pelOff);
  Cc.root.position.lerp(want, w);
  const q0 = Cc.root.quaternion.clone();
  Cc.root.quaternion.copy(q0.slerp(cq, w));
  Cc.root.updateMatrixWorld(true);
  const cf = new THREE.Vector3(0, 0, 1).applyQuaternion(Cc.root.quaternion);
  const cl = new THREE.Vector3(cf.z, 0, -cf.x);
  // legs round the waist: knees forward and apart, feet behind the adult's hips
  for (const sd of ['L', 'R']) {
    const sg = sd === 'L' ? 1 : -1;
    const hip = wpos(Cc.bone(`upperleg01.${sd}`), new THREE.Vector3());
    const foot = hip.clone().addScaledVector(cf, cr.thigh * 0.75).addScaledVector(cl, sg * 0.22).add(new THREE.Vector3(0, -cr.shin * 0.75, 0));
    const pole = hip.clone().addScaledVector(cf, 1).addScaledVector(cl, sg * 0.5);
    twoBoneIK(Cc, 'leg', sd, foot, pole, { reach: w });
  }
  // arms round the adult's neck / shoulder
  for (const sd of ['L', 'R']) {
    const sg = sd === 'L' ? 1 : -1;
    const nk = wpos(A.bone(sg > 0 ? 'clavicle.L' : 'neck02'), new THREE.Vector3());
    const tgt = nk.clone().addScaledVector(fwd, -0.04).add(new THREE.Vector3(0, 0.03, 0));
    const sh = wpos(Cc.bone(`upperarm01.${sd}`), new THREE.Vector3());
    twoBoneIK(Cc, 'arm', sd, tgt, sh.clone().add(new THREE.Vector3(0, -0.4, 0)).addScaledVector(cl, sg * 0.3), { reach: w });
    handShape(Cc, sd, 'clutch', w);
  }
  // head rests toward the adult's shoulder
  const hb = Cc.bone('head');
  if (hb) rotateWorld(hb, _q.setFromAxisAngle(cl, 0.25 * w));
  Cc.root.updateMatrixWorld(true);
}
