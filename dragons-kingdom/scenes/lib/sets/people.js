// People for sets: posed MakeHuman figures (CC0 base mesh, built by the
// creature rider builder) in period clothing, with a few everyday actions,
// for wide and medium shots.
//
//   const human = await loadHuman();
//   const remi = person(human, OUTFITS.remi, 'reachUp');
//   placePerson(remi, x, groundY, z, yaw);
//   const extra = person(human, randomOutfit(rng), 'lookUp', { headYaw: 0.3 });
//
// Clothing follows 15th-century working dress: a tunic (MakeHuman's skirt
// proxy, knee or mid-thigh length) over hose, hair short or tied back, plain
// natural dyes. Poses are bone rotations (Euler YXZ, radians) relative to
// MakeHuman's rest pose. Faces are untextured placeholders: keep people at a
// distance, in profile, backlit or soft - as every style frame here does.
import * as THREE from 'three';
import { createRider, applyRiderPose } from '../creatures/rider.js';

const HIP = 0.88;        // MakeHuman origin (hips) above the soles, metres

// linear-light colours of natural dyes and undyed cloth
export const DYES = {
  undyed: [0.42, 0.37, 0.29], oatmeal: [0.36, 0.31, 0.23], brown: [0.12, 0.075, 0.045], russet: [0.2, 0.065, 0.035],
  madder: [0.3, 0.06, 0.04], woad: [0.07, 0.11, 0.2], darkwoad: [0.035, 0.05, 0.1], weld: [0.42, 0.33, 0.08],
  sage: [0.13, 0.155, 0.1], moss: [0.08, 0.1, 0.045], grey: [0.15, 0.145, 0.14], black: [0.025, 0.022, 0.022],
  ochre: [0.34, 0.2, 0.07], plum: [0.12, 0.05, 0.07],
};
export const SKIN = [[0.45, 0.29, 0.21], [0.5, 0.33, 0.24], [0.36, 0.22, 0.15], [0.24, 0.14, 0.09], [0.55, 0.38, 0.29], [0.3, 0.18, 0.12]];
export const HAIR = [[0.03, 0.02, 0.013], [0.06, 0.035, 0.018], [0.12, 0.07, 0.035], [0.02, 0.015, 0.012], [0.22, 0.17, 0.11], [0.25, 0.24, 0.22]];

export const OUTFITS = {
  // the screenplay's suggestions: Remi dark riding clothes, muted blue outer layer; Abby muted
  // green outer layer (kept a grey sage, distinct from Leaf's olive)
  remi: { name: 'remi', jacket: [0.085, 0.12, 0.18], trousers: [0.028, 0.026, 0.026], boots: [0.02, 0.014, 0.01], gloves: [0.03, 0.022, 0.016], hair: HAIR[0], skin: [0.42, 0.27, 0.19], belt: [0.05, 0.032, 0.02], hairMode: 'cap', skirt: -0.42 },
  abby: { name: 'abby', jacket: [0.14, 0.165, 0.115], trousers: [0.05, 0.038, 0.028], boots: [0.025, 0.017, 0.011], gloves: [0.045, 0.03, 0.02], hair: HAIR[1], skin: [0.45, 0.29, 0.21], belt: [0.06, 0.038, 0.022], hairMode: 'bun', skirt: -0.42 },
  keeper: { name: 'keeper', jacket: DYES.undyed, trousers: DYES.brown, boots: [0.03, 0.02, 0.014], gloves: SKIN[2], hair: HAIR[2], skin: SKIN[2], belt: [0.05, 0.03, 0.02], hairMode: 'cap', skirt: -0.5 },
};

/** A plausible villager / crowd outfit from a seeded rng. */
export function randomOutfit(rng, opts = {}) {
  const pick = (a) => a[Math.floor(rng() * a.length) % a.length];
  const tunics = ['undyed', 'oatmeal', 'brown', 'russet', 'madder', 'woad', 'darkwoad', 'weld', 'sage', 'moss', 'grey', 'ochre', 'plum'];
  const legs = ['brown', 'grey', 'black', 'undyed', 'darkwoad', 'russet', 'moss'];
  const skin = pick(SKIN);
  const female = opts.female ?? rng() < 0.45;
  const v = 0.7 + rng() * 0.35;      // fading / wear: natural dyes, sun-faded and dirty
  const tint = (c) => { const l = (c[0] + c[1] + c[2]) / 3; return c.map((x) => (l + (x - l) * 0.7) * v); };
  // most people of the time covered their heads: women a linen coif and veil, men a cloth cap or hood
  const covered = rng() < (female ? 0.75 : 0.5);
  const veil = covered && female && rng() < 0.7;
  const hair = covered ? (veil ? [0.62, 0.6, 0.54].map((x) => x * (0.85 + 0.15 * v)) : tint(DYES[pick(['undyed', 'oatmeal', 'darkwoad', 'madder', 'brown', 'grey', 'moss'])])) : pick(HAIR);
  return {
    name: 'villager',
    jacket: tint(DYES[pick(tunics)]), trousers: tint(DYES[pick(legs)]), boots: [0.025 + rng() * 0.02, 0.018 + rng() * 0.012, 0.012 + rng() * 0.008],
    gloves: skin, skin, hair,
    belt: [0.05, 0.032, 0.02],
    hairMode: veil ? 'veil' : female ? 'bun' : 'cap',
    skirt: female ? -0.78 : (rng() < 0.6 ? -0.5 : -0.35),
    female,
  };
}

// MakeHuman's rest pose has the upper arms 49 degrees below horizontal and the forearms bent
// 47 degrees forward; these rotations bring the arms down along the sides with the elbows soft.
// (Euler YXZ in the bone's rest frame; the R side mirrors y and z.)
const ARM_DOWN = { 'upperarm01.L': [0.0, 0.0, -0.68], 'upperarm01.R': [0.0, 0.0, 0.68], 'lowerarm01.L': [0.78, 0.0, 0.0], 'lowerarm01.R': [0.78, 0.0, 0.0] };
function relax(o = {}) {
  return {
    ...ARM_DOWN,
    'upperleg01.L': [0.0, 0.0, -0.075], 'upperleg01.R': [0.0, 0.0, 0.075],
    'foot.L': [0, 0, 0.04], 'foot.R': [0, 0, -0.04],
    head: [o.headPitch ?? 0, o.headYaw ?? 0, 0],
  };
}
const pose = (o, extra) => ({ bones: { ...relax(o), ...extra } });
const sym = (n, x, y, z) => ({ [`${n}.L`]: [x, y, z], [`${n}.R`]: [x, -y, -z] });

export const ACTIONS = {
  stand: (o) => pose(o, {}),
  // weight on one leg, head turned (a ground keeper waiting at the field edge)
  wait: (o) => pose(o, { 'upperleg01.R': [0.05, -0.05, 0.14], 'lowerleg01.R': [0.14, 0, 0], 'upperleg01.L': [0.0, 0.0, -0.03], spine03: [0.0, 0.05, 0.02], 'lowerarm01.L': [0.5, 0, 0], head: [0.0, o.headYaw ?? 0.2, 0] }),
  // right arm raised forward-up to a strap above head height; looking up at it
  reachUp: (o) => pose(o, {
    'clavicle.R': [0, 0, -0.3], 'upperarm01.R': [-2.35, 0.2, 0.2], 'lowerarm01.R': [-0.35, 0.2, 0], 'wrist.R': [0.25, 0, 0],
    spine03: [-0.06, 0.06, 0], spine02: [-0.04, 0.0, 0], neck01: [-0.15, 0.05, 0], head: [-0.32, 0.08, 0],
  }),
  // both hands forward at chest height working on a buckle / strap (Abby fixing her equipment)
  handsWork: (o) => pose(o, {
    ...sym('upperarm01', -0.55, -0.15, -0.55), ...sym('lowerarm01', -0.35, -0.55, 0.0),
    spine03: [0.06, 0, 0], neck01: [0.1, 0, 0], head: [0.3, o.headYaw ?? 0, 0],
  }),
  // pointing up and ahead with the right arm (the watchman)
  point: (o) => pose(o, {
    'clavicle.R': [0, 0, -0.25], 'upperarm01.R': [-2.0, 0.45, 0.35], 'lowerarm01.R': [-0.08, 0.1, 0],
    spine03: [-0.05, -0.1, 0], neck01: [-0.12, -0.05, 0], head: [-0.28, -0.05, 0],
  }),
  // looking up, a half step back
  lookUp: (o) => pose(o, { 'upperleg01.L': [0.12, 0, -0.06], 'lowerleg01.L': [0.08, 0, 0], neck01: [-0.22, 0, 0], head: [-0.38, o.headYaw ?? 0, 0], spine03: [-0.06, 0, 0] }),
  // carrying something at the waist with both hands
  carry: (o) => pose(o, { ...sym('upperarm01', -0.25, -0.1, -0.6), ...sym('lowerarm01', -0.35, -0.35, 0.0), head: [0.05, o.headYaw ?? 0, 0] }),
  // walking mid-stride
  walk: (o) => pose(o, { 'upperleg01.L': [-0.38, 0.03, -0.06], 'upperleg01.R': [0.28, -0.03, 0.06], 'lowerleg01.L': [0.12, 0, 0], 'lowerleg01.R': [0.45, 0, 0], 'foot.R': [-0.25, 0, -0.04], 'upperarm01.L': [0.3, 0.0, -0.68], 'upperarm01.R': [-0.3, 0.0, 0.68], head: [0, o.headYaw ?? 0, 0] }),
};

/** A posed person. outfit: an OUTFITS entry or a randomOutfit(); opts: { headYaw, headPitch, hair, skirt }. */
export function person(human, outfit, action = 'stand', opts = {}) {
  const p = createRider(human, { outfit, pose: 'stand', hair: opts.hair ?? outfit.hairMode ?? 'cap', skirt: opts.skirt ?? outfit.skirt ?? false, clothSmooth: opts.clothSmooth ?? 60, seed: opts.seed });
  setAction(p, action, opts);
  return p;
}

/**
 * opts.vary (0..1) + opts.seed: deterministic per-person variation on top of the action - weight
 * shift, spine and head turn, arm hang - so a crowd never stands in identical poses.
 */
export function setAction(p, action, opts = {}) {
  const f = ACTIONS[action];
  if (!f) throw new Error(`unknown action ${action}`);
  const pose = f(opts);
  const v = opts.vary ?? 0;
  if (v > 0) {
    let a = ((opts.seed ?? 1) * 2654435761) >>> 0;
    const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296 - 0.5; };
    const add = (n, x, y, z) => { const b = pose.bones[n] || [0, 0, 0]; pose.bones[n] = [b[0] + x * v, b[1] + y * v, b[2] + z * v]; };
    add('spine03', r() * 0.12, r() * 0.35, r() * 0.1); add('spine05', r() * 0.1, r() * 0.2, r() * 0.08);
    add('head', r() * 0.3, r() * 0.7, r() * 0.15); add('neck01', r() * 0.15, r() * 0.3, 0);
    if (!/reachUp|point/.test(action)) {
      add('upperarm01.L', r() * 0.5, r() * 0.3, r() * 0.25); add('upperarm01.R', r() * 0.5, r() * 0.3, r() * 0.25);
      add('lowerarm01.L', Math.abs(r()) * 0.9, 0, 0); add('lowerarm01.R', Math.abs(r()) * 0.9, 0, 0);
    }
    const shift = r() * 0.15; add('upperleg01.L', r() * 0.15, 0, shift); add('upperleg01.R', r() * 0.15, 0, shift);
  }
  applyRiderPose(p, pose);
}

/** Stand a person on the ground at (x, groundY, z), facing yaw (radians, 0 = +z). */
export function placePerson(p, x, groundY, z, yaw = 0, scale = 1) {
  p.root.position.set(x, groundY + HIP * scale, z);
  p.root.rotation.set(0, yaw, 0);
  p.root.scale.setScalar(scale);
  p.root.updateMatrixWorld(true);
  return p;
}

// ------------------------------------------------------------------ IK --
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qp = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const restPos = (p, n) => new THREE.Vector3(...p.restHead[n]);

/**
 * Two-bone arm IK (call after placePerson / pose, pure): puts the wrist of arm `side` ('L'|'R')
 * at the world point `target`, the elbow bending toward the world point `pole`. Upper arm and
 * forearm rotations are set by shortest-arc rotations of their rest directions (the rig's rest
 * orientation is identity, so world = parent-world * local). opts.wristPitch bends the hand.
 */
export function armIK(p, side, target, pole, opts = {}) {
  const B = (n) => p.bones[p.index[`${n}.${side}`]];
  const up = B('upperarm01'), up2 = B('upperarm02'), lo = B('lowerarm01'), lo2 = B('lowerarm02'), wr = B('wrist');
  up2.quaternion.identity(); lo2.quaternion.identity();
  up.quaternion.identity(); lo.quaternion.identity();
  p.root.updateMatrixWorld(true);
  const S = new THREE.Vector3().setFromMatrixPosition(up.matrixWorld);
  const rs = restPos(p, `upperarm01.${side}`), re = restPos(p, `lowerarm01.${side}`), rw = restPos(p, `wrist.${side}`);
  const sc = p.root.scale.x;
  const l1 = re.distanceTo(rs) * sc, l2 = rw.distanceTo(re) * sc;
  const T = target.clone();
  let dist = T.distanceTo(S);
  const maxR = (l1 + l2) * 0.999;
  if (dist > maxR) { T.sub(S).setLength(maxR).add(S); dist = maxR; }
  // elbow: in the plane of S, T and the pole
  const dir = _a.copy(T).sub(S).normalize();
  const pl = _b.copy(pole).sub(S); pl.addScaledVector(dir, -pl.dot(dir)).normalize();
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const E = new THREE.Vector3().copy(S).addScaledVector(dir, x).addScaledVector(pl, h);
  // upper arm: rest direction (in its parent's world frame) -> S->E
  up.parent.getWorldQuaternion(_qp);
  const r1 = _c.copy(re).sub(rs).normalize().applyQuaternion(_qp);
  _q1.setFromUnitVectors(r1, _d.copy(E).sub(S).normalize());            // world delta
  up.quaternion.copy(_qp).invert().multiply(_q1).multiply(_qp);
  p.root.updateMatrixWorld(true);
  // forearm
  lo.parent.getWorldQuaternion(_qp);
  const r2 = _c.copy(rw).sub(re).normalize().applyQuaternion(_qp);
  const Ew = new THREE.Vector3().setFromMatrixPosition(lo.matrixWorld);
  _q2.setFromUnitVectors(r2, _e.copy(T).sub(Ew).normalize());
  lo.quaternion.copy(_qp).invert().multiply(_q2).multiply(_qp);
  if (opts.wristPitch) wr.quaternion.setFromEuler(new THREE.Euler(opts.wristPitch, 0, opts.wristRoll ?? 0));
  p.root.updateMatrixWorld(true);
  return { elbow: E, wrist: new THREE.Vector3().setFromMatrixPosition(wr.matrixWorld) };
}
