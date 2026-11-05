// How a person holds, aims, reloads and inspects each weapon.
//
// The animation library only has pistol clips, so every other hold is posed
// on top of the animation each frame: the gun is placed relative to the body
// (shouldered when aiming, low-ready, carried across the chest when
// sprinting), then both arms reach for it with two-bone IK and both hands
// turn to grip it. Hand orientation is measured from the knuckle positions
// (wrist -> knuckles, pinky -> index), so it works on any rig.
import * as THREE from 'three';
import { clamp, lerp } from '../util.js';

const V = () => new THREE.Vector3();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _f = V(), _g = V(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const smooth = (t) => t * t * (3 - 2 * t);

// apply a world-space rotation to a bone, keeping its children attached
function rotateWorld(bone, delta) {
  bone.getWorldQuaternion(_q);
  _q.premultiply(delta);
  bone.parent.getWorldQuaternion(_pq).invert();
  bone.quaternion.copy(_pq.multiply(_q));
  bone.updateMatrixWorld(true);
}

// classic analytic two-bone IK (shoulder -> elbow -> wrist) with a pole for the elbow
export function twoBoneIK(upper, lower, end, target, pole) {
  const A = upper.getWorldPosition(_a), B = lower.getWorldPosition(_b), C = end.getWorldPosition(_c);
  const la = A.distanceTo(B), lb = B.distanceTo(C);
  const toT = _d.copy(target).sub(A);
  const d = clamp(toT.length(), Math.abs(la - lb) + 1e-3, la + lb - 1e-3);
  const dir = toT.normalize();
  const cosA = clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const pv = _e.copy(pole).sub(A);
  pv.addScaledVector(dir, -pv.dot(dir));
  if (pv.lengthSq() < 1e-6) pv.set(0, -1, 0).addScaledVector(dir, -dir.y);
  pv.normalize();
  const elbow = _f.copy(A).addScaledVector(dir, cosA * la).addScaledVector(pv, sinA * la);
  // swing the upper arm so the elbow lands on `elbow`
  _q2.setFromUnitVectors(_g.copy(B).sub(A).normalize(), elbow.sub(A).normalize());
  rotateWorld(upper, _q2);
  // swing the forearm so the wrist lands on the target
  lower.getWorldPosition(B); end.getWorldPosition(C);
  _q2.setFromUnitVectors(_g.copy(C).sub(B).normalize(), _d.copy(target).sub(B).normalize());
  rotateWorld(lower, _q2);
}

// current hand frame: F = wrist -> knuckles, S = pinky -> index (orthogonal)
function handBasis(h, out) {
  const W = h.wrist.getWorldPosition(_a), I = h.index.getWorldPosition(_b), P = h.pinky.getWorldPosition(_c);
  const F = _d.copy(I).add(P).multiplyScalar(0.5).sub(W).normalize();
  const S = _e.copy(I).sub(P); S.addScaledVector(F, -S.dot(F)).normalize();
  return out.makeBasis(F, S, _f.crossVectors(F, S));
}
function basisFrom(F, S, out) {
  const f = _d.copy(F).normalize(), s = _e.copy(S);
  s.addScaledVector(f, -s.dot(f)).normalize();
  return out.makeBasis(f, s, _f.crossVectors(f, s));
}
// turn the wrist so the hand frame matches (F, S) in world space
function orientHand(h, F, S) {
  handBasis(h, _m);
  const cur = new THREE.Quaternion().setFromRotationMatrix(_m);
  basisFrom(F, S, _m2);
  const want = new THREE.Quaternion().setFromRotationMatrix(_m2);
  rotateWorld(h.wrist, want.multiply(cur.invert()));
}

// Grip frames in gun space (+Z muzzle, +Y up, +X the gun's left side)
const GRIP = {
  // right hand on a pistol grip: knuckles forward-down, index on top
  pistol: { F: new THREE.Vector3(0, -0.35, 0.94), S: new THREE.Vector3(0, 1, 0.3) },
  // support hand cupping the shooting hand from the left
  cup: { F: new THREE.Vector3(-0.62, -0.38, 0.62), S: new THREE.Vector3(0, 0.9, 0.35) },
  // support hand under a handguard / pump: knuckles wrap round to the right, index forward
  fore: { F: new THREE.Vector3(-0.72, 0.6, 0.2), S: new THREE.Vector3(0, 0, 1) },
};

const _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3(), _c3 = new THREE.Vector3(), _fq1 = new THREE.Quaternion(), _fq2 = new THREE.Quaternion(), _fq3 = new THREE.Quaternion();
export class GunPose {
  constructor(human) {
    const m = human.model;
    const b = (n) => m.getObjectByName(n);
    const hand = (s) => ({ upper: b('upperarm01' + s), lower: b('lowerarm01' + s), wrist: b('wrist' + s), index: b('finger2-1' + s), pinky: b('finger5-1' + s), clav: b('clavicle' + s) });
    this.R = hand('R'); this.L = hand('L');
    // finger chains (thumb, index, middle, ring, pinky), three joints each
    this.F = {}; for (const s of ['R', 'L']) this.F[s] = [1, 2, 3, 4, 5].map((n) => [1, 2, 3].map((j) => b(`finger${n}-${j}${s}`)).filter(Boolean));
    this.chest = b('spine01'); this.neck = b('neck01'); this.head = b('head');
    this.ok = !!(this.R.upper && this.R.lower && this.R.wrist && this.R.index && this.R.pinky && this.L.upper && this.L.wrist && this.chest);
    this.human = human;
    this.blend = 0; // 0 = animation only .. 1 = full weapon pose
    this.t = 0;
    this.lastInspect = 0;
  }

  // body frame: chest position, forward (aim yaw), right, up
  frame(heading) {
    const fw = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    const right = new THREE.Vector3(-fw.z, 0, fw.x); // character's right (models face +Z, so right is -X)
    const chest = this.chest.getWorldPosition(new THREE.Vector3());
    return { fw, right, up: new THREE.Vector3(0, 1, 0), chest };
  }

  // Put the gun where it should be for this state, then the hands on it.
  //  s: { gun, gunL, info, state: 'aim'|'ready'|'sprint'|'reload'|'inspect'|'holster', aimDir, heading, reload (0..1), inspect (0..1), fp, dt, dual }
  apply(s) {
    if (!this.ok || !s.gun) return;
    const info = s.info;
    const F = this.frame(s.heading);
    const dir = new THREE.Vector3();
    const gun = s.gun;
    const long = info.kind === 'long';
    const shR = this.R.upper.getWorldPosition(new THREE.Vector3()), shL = this.L.upper.getWorldPosition(new THREE.Vector3());
    let pos = new THREE.Vector3(), roll = 0;
    const aim = s.aimDir || F.fw;

    if (info.kind === 'bow') {
      // bow: held vertically in the left hand, string hand at the cheek when drawn
      dir.copy(s.state === 'aim' ? aim : F.fw.clone().multiplyScalar(0.6).addScaledVector(F.up, -0.8)).normalize();
      pos.copy(shL).addScaledVector(dir, s.state === 'aim' ? 0.62 : 0.45).addScaledVector(F.up, s.state === 'aim' ? 0.02 : -0.25);
      this.place(gun, pos, dir, F.up, 0);
      this.reach(this.L, gun.localToWorld(_g.set(0, 0, 0)), F, 'L');
      orientHand(this.L, gunVec(gun, 0, 0.3, 1), gunVec(gun, 0, 1, 0));
      if (s.state === 'aim') {
        const cheek = this.head.getWorldPosition(new THREE.Vector3()).addScaledVector(F.right, 0.08).addScaledVector(F.up, -0.06).addScaledVector(dir, 0.05);
        this.reach(this.R, cheek, F, 'R');
      }
      return;
    }

    if (long) {
      // shoulder pocket: just inside the right shoulder joint
      const pocket = shR.clone().addScaledVector(F.right, -0.07).addScaledVector(F.up, -0.04).addScaledVector(F.fw, 0.06);
      if (s.state === 'aim') {
        dir.copy(aim);
        if (s.fp) {
          // first person: line the sights up with the camera
          pos.copy(s.eye).addScaledVector(dir, 0.18 + info.sightZ * 0.4).addScaledVector(F.up, -info.sightY);
          this.place(gun, pos, dir, F.up, 0, info.sight);
        } else this.place(gun, pocket, dir, F.up, 0, info.butt);
      } else if (s.state === 'sprint') {
        // port arms: diagonally across the chest, muzzle up-left
        dir.copy(F.up).multiplyScalar(0.62).addScaledVector(F.right, -0.62).addScaledVector(F.fw, 0.45).normalize();
        pos.copy(F.chest).addScaledVector(F.fw, 0.3).addScaledVector(F.up, -0.18);
        this.place(gun, pos, dir, F.fw.clone().negate(), 0.2, info.mid);
      } else if (s.state === 'inspect') {
        const k = s.inspect, st = info.inspectStyle;
        dir.copy(F.fw).multiplyScalar(0.6).addScaledVector(F.right, -0.75).addScaledVector(F.up, 0.15 + Math.sin(k * Math.PI) * 0.35 * (st === 1 ? 1 : 0.3)).normalize();
        roll = Math.sin(k * Math.PI * 2) * (st === 0 ? 1.1 : 0.6) + (st === 2 ? Math.sin(k * Math.PI) * 1.2 : 0);
        pos.copy(F.chest).addScaledVector(F.fw, 0.38).addScaledVector(F.up, -0.12).addScaledVector(F.right, 0.05);
        this.place(gun, pos, dir, F.up, roll, info.mid);
      } else {
        // low ready (also while reloading, tilted to show the action)
        dir.copy(F.fw).multiplyScalar(0.8).addScaledVector(F.up, -0.5).addScaledVector(F.right, -0.32).normalize();
        roll = s.state === 'reload' ? 0.55 * Math.sin(Math.min(1, s.reload * 1.2) * Math.PI) : 0;
        pos.copy(pocket).addScaledVector(F.up, -0.16).addScaledVector(F.fw, 0.05);
        this.place(gun, pos, dir, F.up, roll, info.butt);
      }
      // hands: right on the grip, left on the fore-end (or busy reloading)
      gun.updateMatrixWorld(true);
      const rT = gun.localToWorld(_g.set(0, 0, 0)).clone();
      this.reach(this.R, rT, F, 'R');
      orientHand(this.R, gunVec(gun, GRIP.pistol.F), gunVec(gun, GRIP.pistol.S));
      let lT = gun.localToWorld(info.fore.clone());
      let lGrip = GRIP.fore;
      if (s.state === 'reload') {
        const p = reloadPath(info, s.reload, gun, F);
        lT = p.pos; lGrip = p.grip;
      }
      this.reach(this.L, lT, F, 'L');
      orientHand(this.L, gunVec(gun, lGrip.F), gunVec(gun, lGrip.S));
      return;
    }

    // ---- handguns
    if (s.dual) {
      // one in each hand, both arms out when aiming
      const gL = s.gunL;
      if (s.state === 'aim') {
        const rp = shR.clone().addScaledVector(aim, 0.56).addScaledVector(F.right, -0.08).addScaledVector(F.up, -0.04);
        const lp = shL.clone().addScaledVector(aim, 0.56).addScaledVector(F.right, 0.08).addScaledVector(F.up, -0.04);
        this.place(gun, rp, aim, F.up, -0.12);
        if (gL) this.place(gL, lp, aim, F.up, 0.12);
      } else {
        const d2 = F.fw.clone().multiplyScalar(0.55).addScaledVector(F.up, -0.83).normalize();
        this.place(gun, shR.clone().addScaledVector(F.up, -0.5).addScaledVector(F.fw, 0.12), d2, F.fw.clone().negate(), 0);
        if (gL) this.place(gL, shL.clone().addScaledVector(F.up, -0.5).addScaledVector(F.fw, 0.12), d2, F.fw.clone().negate(), 0);
      }
      this.reach(this.R, gun.localToWorld(_g.set(0, 0, 0)).clone(), F, 'R');
      orientHand(this.R, gunVec(gun, GRIP.pistol.F), gunVec(gun, GRIP.pistol.S));
      if (gL) {
        this.reach(this.L, gL.localToWorld(_g.set(0, 0, 0)).clone(), F, 'L');
        orientHand(this.L, gunVec(gL, GRIP.pistol.F), gunVec(gL, GRIP.pistol.S));
      }
      return;
    }
    if (s.state === 'aim') {
      // two-handed isosceles stance in front of the chest
      pos.copy(F.chest).addScaledVector(aim, 0.52).addScaledVector(F.up, 0.06).addScaledVector(F.right, 0.03);
      if (s.fp) pos.copy(s.eye).addScaledVector(aim, 0.42).addScaledVector(F.up, -info.sightY - 0.005);
      this.place(gun, pos, aim, F.up, 0, s.fp ? info.sight : null);
      this.reach(this.R, gun.localToWorld(_g.set(0, 0, 0)).clone(), F, 'R');
      orientHand(this.R, gunVec(gun, GRIP.pistol.F), gunVec(gun, GRIP.pistol.S));
      this.reach(this.L, gun.localToWorld(_g.set(0.045, -0.03, -0.01)).clone(), F, 'L');
      orientHand(this.L, gunVec(gun, GRIP.cup.F), gunVec(gun, GRIP.cup.S));
      return;
    }
    if (s.state === 'inspect') {
      const k = s.inspect, st = info.inspectStyle;
      dir.copy(F.fw).multiplyScalar(0.7).addScaledVector(F.right, -0.6).addScaledVector(F.up, 0.2).normalize();
      pos.copy(F.chest).addScaledVector(F.fw, 0.36).addScaledVector(F.up, -0.1).addScaledVector(F.right, 0.1);
      roll = st === 2 && info.revolver ? -k * Math.PI * 4 * (k < 0.5 ? 1 : 0) : Math.sin(k * Math.PI * 2) * 1.2;
      this.place(gun, pos, dir, F.up, roll);
      this.reach(this.R, gun.localToWorld(_g.set(0, 0, 0)).clone(), F, 'R');
      orientHand(this.R, gunVec(gun, GRIP.pistol.F), gunVec(gun, GRIP.pistol.S));
      if (st !== 2) { this.reach(this.L, gun.localToWorld(_g.set(0.05, 0.02, 0.06)).clone(), F, 'L'); orientHand(this.L, gunVec(gun, GRIP.fore.F), gunVec(gun, GRIP.fore.S)); }
      return;
    }
    // first person, not aiming: a two-handed low ready in front of the chest (the third-person idle
    // clip seen from the eyes showed the pistol canted 60 degrees with the fingers off the grip)
    if (s.fp && s.state !== 'reload') {
      dir.copy(aim).multiplyScalar(0.86).addScaledVector(F.up, -0.5).normalize();
      pos.copy(s.eye).addScaledVector(aim, 0.4).addScaledVector(F.up, -0.3).addScaledVector(F.right, 0.07);
      this.place(gun, pos, dir, F.up, 0);
      this.reach(this.R, gun.localToWorld(_g.set(0, 0, 0)).clone(), F, 'R');
      orientHand(this.R, gunVec(gun, GRIP.pistol.F), gunVec(gun, GRIP.pistol.S));
      this.reach(this.L, gun.localToWorld(_g.set(0.045, -0.03, -0.01)).clone(), F, 'L');
      orientHand(this.L, gunVec(gun, GRIP.cup.F), gunVec(gun, GRIP.cup.S));
      return;
    }
    // relaxed / reload: the clip moves the right arm; the gun follows the hand
    this.attachToHand(gun, this.R);
    if (s.state === 'reload') {
      const k = s.reload;
      // tip the gun over so the magwell faces the fresh magazine, then back
      const tilt = Math.sin(Math.min(1, k / 0.75) * Math.PI);
      gun.rotateZ(-tilt * 0.55); gun.rotateX(tilt * 0.18); gun.updateMatrixWorld(true);
      const well = gun.localToWorld(_g.set(0, -0.12, 0.0)).clone();
      const pouch = F.chest.clone().addScaledVector(F.up, -0.45).addScaledVector(F.right, -0.15).addScaledVector(F.fw, 0.05);
      const t = k < 0.3 ? smooth(k / 0.3) : k < 0.6 ? 1 - smooth((k - 0.3) / 0.3) : 0;
      const lT = well.clone().lerp(pouch, t);
      this.reach(this.L, lT, F, 'L');
      orientHand(this.L, gunVec(gun, GRIP.cup.F), gunVec(gun, GRIP.cup.S));
    }
  }

  // Curl the fingers after the arms are placed. Flexion turns each joint about
  // the knuckle line, so it works whatever the bones' own axes are.
  //   grip: 'pistol' (right hand on a grip), 'fore' (left hand on a handguard), 'cup' (left hand under a pistol)
  curl(side, grip, trigger = 0) {
    if (!this.ok) return;
    const chains = this.F[side]; if (!chains || chains.length < 5) return;
    const H = side === 'R' ? this.R : this.L;
    H.index.getWorldPosition(_c1); H.pinky.getWorldPosition(_c2);
    const axis = _c3.subVectors(_c1, _c2).normalize().multiplyScalar(side === 'R' ? 1 : -1);
    const A = {
      pistol: [[0.35, 0.45, 0.3], trigger > 0.3 ? [0.55, 0.85, 0.5] : [0.12, 0.08, 0.04], [1.05, 1.2, 0.8], [1.1, 1.25, 0.85], [1.15, 1.3, 0.9]],
      fore: [[0.25, 0.3, 0.2], [0.75, 0.9, 0.6], [0.85, 1.0, 0.7], [0.9, 1.05, 0.75], [0.95, 1.1, 0.8]],
      cup: [[0.2, 0.25, 0.2], [0.55, 0.7, 0.45], [0.6, 0.75, 0.5], [0.65, 0.8, 0.55], [0.7, 0.85, 0.6]],
    }[grip];
    chains.forEach((chain, f) => {
      chain.forEach((bone, j) => {
        const ang = A[f][j] * (f === 0 ? 0.6 : 1);
        bone.getWorldQuaternion(_fq1);
        _fq2.setFromAxisAngle(axis, ang).multiply(_fq1);
        bone.parent.getWorldQuaternion(_fq3).invert();
        bone.quaternion.copy(_fq3.multiply(_fq2));
        bone.updateMatrixWorld(true);
      });
    });
  }

  // gun transform: `anchor` (gun-local point) goes to `pos`, barrel along dir
  place(gun, pos, dir, up, roll, anchor = null) {
    _m.lookAt(_a.set(0, 0, 0), _b.copy(dir).negate(), up); // three's lookAt makes -Z face the target; flip
    gun.quaternion.setFromRotationMatrix(_m);
    if (roll) gun.quaternion.multiply(_q.setFromAxisAngle(_c.set(0, 0, 1), roll));
    gun.position.copy(pos);
    if (anchor) gun.position.sub(_d.copy(anchor).applyQuaternion(gun.quaternion));
    gun.updateMatrixWorld(true);
  }

  // gun follows the (animated) right hand
  attachToHand(gun, h) {
    handBasis(h, _m);
    const handQ = new THREE.Quaternion().setFromRotationMatrix(_m);
    basisFrom(GRIP.pistol.F, GRIP.pistol.S, _m2);
    const gripQ = new THREE.Quaternion().setFromRotationMatrix(_m2);
    gun.quaternion.copy(handQ.multiply(gripQ.invert()));
    h.wrist.getWorldPosition(gun.position);
    gun.updateMatrixWorld(true);
  }

  // arm IK with a natural elbow: out to the side and down
  reach(h, target, F, side) {
    const pole = h.upper.getWorldPosition(new THREE.Vector3()).addScaledVector(F.up, -0.6).addScaledVector(F.right, side === 'R' ? 0.45 : -0.45).addScaledVector(F.fw, -0.2);
    twoBoneIK(h.upper, h.lower, h.wrist, target, pole);
  }
}

function gunVec(gun, x, y, z) {
  const v = x instanceof THREE.Vector3 ? x.clone() : new THREE.Vector3(x, y, z);
  return v.applyQuaternion(gun.quaternion).normalize();
}

// left hand path during a long-gun reload (per action type)
function reloadPath(info, k, gun, F) {
  const fore = gun.localToWorld(info.fore.clone());
  const well = gun.localToWorld(info.well.clone());
  const pouch = F.chest.clone().addScaledVector(F.up, -0.42).addScaledVector(F.right, 0.12).addScaledVector(F.fw, 0.08);
  const bolt = gun.localToWorld(info.bolt.clone());
  const P = (a, b, t) => a.clone().lerp(b, smooth(clamp(t, 0, 1)));
  let pos, grip = GRIP.fore;
  if (info.action === 'pump') {
    // shells into the loading port, then rack the pump
    if (k < 0.15) pos = P(fore, well, k / 0.15);
    else if (k < 0.75) { const c = ((k - 0.15) / 0.6) * 3, ph = c % 1; pos = ph < 0.5 ? P(well, pouch, ph * 2) : P(pouch, well, (ph - 0.5) * 2); }
    else if (k < 0.85) pos = P(well, fore, (k - 0.75) / 0.1);
    else { const pump = Math.sin(((k - 0.85) / 0.15) * Math.PI); pos = fore.clone().addScaledVector(gunVec(gun, 0, 0, -1), pump * 0.1); }
  } else if (info.action === 'bolt') {
    // fresh magazine, then work the bolt
    if (k < 0.2) pos = P(fore, well, k / 0.2);
    else if (k < 0.4) pos = P(well, pouch, (k - 0.2) / 0.2);
    else if (k < 0.6) pos = P(pouch, well, (k - 0.4) / 0.2);
    else if (k < 0.75) pos = P(well, bolt, (k - 0.6) / 0.15);
    else if (k < 0.88) pos = bolt.clone().addScaledVector(gunVec(gun, 0, 0, -1), Math.sin(((k - 0.75) / 0.13) * Math.PI) * 0.09);
    else pos = P(bolt, fore, (k - 0.88) / 0.12);
    grip = k > 0.6 && k < 0.88 ? GRIP.cup : GRIP.fore;
  } else {
    // box magazine: out, to the pouch, in, charging handle
    if (k < 0.18) pos = P(fore, well, k / 0.18);
    else if (k < 0.4) pos = P(well, pouch, (k - 0.18) / 0.22);
    else if (k < 0.62) pos = P(pouch, well, (k - 0.4) / 0.22);
    else if (k < 0.78) pos = P(well, bolt, (k - 0.62) / 0.16);
    else pos = P(bolt, fore, (k - 0.78) / 0.22);
  }
  return { pos, grip };
}

// lerp helper exported for callers that blend states
export { lerp };
