// Ragdolls: when someone dies, or a car hits them, physics takes over from the animation.
//
// A light particle ragdoll (Verlet): fifteen joints (pelvis, chest, neck, head, shoulders,
// elbows, wrists, hips, knees, ankles) joined by stiff bones, with cross-bracing so the torso
// stays a torso. It falls under gravity, lands on the real ground (collision.surface), slides
// and settles. Each frame the skeleton's bones are turned to follow it, so the character's own
// skinned mesh crumples. The push goes in where the body was struck: a head shot snaps the head
// back, a leg shot takes the legs out, a car scoops the legs and throws the body over the bonnet,
// a blast lifts everyone outward. So no two deaths look the same.
import * as THREE from 'three';

// joint -> the bone it sits on (MakeHuman game rig first, then the Quaternius/UAL names)
const J = {
  pelvis: ['root', 'Hips', 'hips', 'pelvis'], chest: ['spine01', 'Chest', 'spine_03', 'Spine2'], neck: ['neck01', 'Neck', 'neck'], head: ['head', 'Head'],
  shL: ['upperarm01L', 'UpperArm.L', 'upperarm_l', 'LeftArm'], elL: ['lowerarm01L', 'LowerArm.L', 'lowerarm_l', 'LeftForeArm'], wrL: ['wristL', 'Hand.L', 'hand_l', 'LeftHand'],
  shR: ['upperarm01R', 'UpperArm.R', 'upperarm_r', 'RightArm'], elR: ['lowerarm01R', 'LowerArm.R', 'lowerarm_r', 'RightForeArm'], wrR: ['wristR', 'Hand.R', 'hand_r', 'RightHand'],
  hipL: ['upperleg01L', 'UpperLeg.L', 'thigh_l', 'LeftUpLeg'], knL: ['lowerleg01L', 'LowerLeg.L', 'calf_l', 'LeftLeg'], anL: ['footL', 'Foot.L', 'foot_l', 'LeftFoot'],
  hipR: ['upperleg01R', 'UpperLeg.R', 'thigh_r', 'RightUpLeg'], knR: ['lowerleg01R', 'LowerLeg.R', 'calf_r', 'RightLeg'], anR: ['footR', 'Foot.R', 'foot_r', 'RightFoot'],
};
const NAMES = Object.keys(J);
// bones as sticks (and the bone that turns to follow each)
const LIMBS = [['shL', 'elL'], ['elL', 'wrL'], ['shR', 'elR'], ['elR', 'wrR'], ['hipL', 'knL'], ['knL', 'anL'], ['hipR', 'knR'], ['knR', 'anR'], ['neck', 'head']];
const BRACE = [['pelvis', 'chest'], ['chest', 'neck'], ['hipL', 'hipR'], ['shL', 'shR'], ['hipL', 'shL'], ['hipR', 'shR'], ['hipL', 'shR'], ['hipR', 'shL'],
  ['pelvis', 'hipL'], ['pelvis', 'hipR'], ['chest', 'shL'], ['chest', 'shR'], ['neck', 'shL'], ['neck', 'shR'], ['head', 'chest'], ['pelvis', 'shL'], ['pelvis', 'shR'],
  ['hipL', 'anL'], ['hipR', 'anR'], ['shL', 'wrL'], ['shR', 'wrR']]; // the last four only stop limbs folding flat (see minOnly)
const MIN_ONLY = new Set(['hipL-anL', 'hipR-anR', 'shL-wrL', 'shR-wrR']);

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();

function findBone(root, names) { for (const n of names) { const b = root.getObjectByName(n); if (b) return b; } return null; }

export class Ragdoll {
  // model: the skinned character's root object; ground(x, z, y) -> height
  constructor(model, ground) {
    this.model = model; this.ground = ground;
    model.updateMatrixWorld(true);
    this.b = {}; this.p = {}; this.o = {};
    for (const n of NAMES) {
      const bone = findBone(model, J[n]);
      if (!bone) { this.ok = false; return; }
      this.b[n] = bone;
      this.p[n] = bone.getWorldPosition(new THREE.Vector3());
      this.o[n] = this.p[n].clone();
    }
    // the head particle sits up in the skull, not at the neck joint
    _v.subVectors(this.p.head, this.p.neck).normalize();
    this.p.head.addScaledVector(_v, 0.12); this.o.head.copy(this.p.head);
    this.ok = true;
    this.sticks = [...LIMBS, ...BRACE].map(([a, b]) => ({ a, b, len: this.p[a].distanceTo(this.p[b]), minOnly: MIN_ONLY.has(a + '-' + b) }));
    // each limb bone's rest direction, in its own frame, towards the joint it points at
    this.aim = [['shL', 'elL'], ['elL', 'wrL'], ['shR', 'elR'], ['elR', 'wrR'], ['hipL', 'knL'], ['knL', 'anL'], ['hipR', 'knR'], ['knR', 'anR'], ['neck', 'head']].map(([a, b]) => {
      const bone = this.b[a];
      bone.getWorldQuaternion(_q);
      return { bone, a, b, dir: _v.subVectors(this.p[b], this.p[a]).normalize().applyQuaternion(_q.invert()).clone() };
    });
    // the torso's rest frame (pelvis bone and chest bone)
    this.pelvisFrame = this.frame('hipL', 'hipR', 'chest');
    this.chestFrame = this.frame('shL', 'shR', 'neck', 'pelvis');
    this.b.pelvis.getWorldQuaternion(_q); this.pelvisRest = this.pelvisFrame.clone().invert().multiply(_q);
    this.b.chest.getWorldQuaternion(_q); this.chestRest = this.chestFrame.clone().invert().multiply(_q);
    this.still = 0; this.done = false; this.age = 0;
  }

  // an orthonormal frame from three joints (left, right, up), as a quaternion
  frame(l, r, u, down) {
    const x = _a.subVectors(this.p[r], this.p[l]).normalize();
    const up = down ? _b.subVectors(this.p[u], this.p[down]) : _b.subVectors(this.p[u], _v.addVectors(this.p[l], this.p[r]).multiplyScalar(0.5));
    const z = new THREE.Vector3().crossVectors(x, up).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(x, y, z));
  }

  // velocity in m/s: to everything (vAll), and extra to the joint nearest `at`
  push(vAll, at = null, vHit = null, spin = 0) {
    const h = this.sub || 1 / 60; // velocity lives in (position - previous position) / substep
    for (const n of NAMES) {
      this.o[n].addScaledVector(vAll, -h);
      if (spin) this.o[n].add(_v.set((Math.random() - 0.5) * spin, 0, (Math.random() - 0.5) * spin).multiplyScalar(h));
    }
    if (at && vHit) {
      let best = null, bd = 1e9;
      for (const n of NAMES) { const d = this.p[n].distanceToSquared(at); if (d < bd) { bd = d; best = n; } }
      this.o[best].addScaledVector(vHit, -h);
      // the joints next to it go with it, less
      for (const st of this.sticks) {
        const other = st.a === best ? st.b : st.b === best ? st.a : null;
        if (other && !st.minOnly) this.o[other].addScaledVector(vHit, -0.35 * h);
      }
    }
    this.still = 0; this.done = false;
  }

  step(dt) {
    if (!this.ok || this.done) return;
    this.age += dt;
    const h = Math.min(dt, 1 / 30), sub = 2, s = h / sub;
    this.sub = s;
    let moved = 0;
    for (let k = 0; k < sub; k++) {
      // integrate (velocity from the last two positions, a little air drag)
      for (const n of NAMES) {
        const p = this.p[n], o = this.o[n];
        _v.subVectors(p, o).multiplyScalar(0.995);
        o.copy(p);
        p.add(_v);
        p.y -= 9.8 * s * s; // gravity
      }
      // bones keep their lengths (a few passes)
      for (let it = 0; it < 4; it++) {
        for (const st of this.sticks) {
          const A = this.p[st.a], B = this.p[st.b];
          _v.subVectors(B, A); const d = _v.length() || 1e-6;
          if (st.minOnly && d > st.len * 0.55) continue; // a limb may bend, but not fold through itself
          const target = st.minOnly ? st.len * 0.55 : st.len;
          const k2 = ((d - target) / d) * 0.5;
          A.addScaledVector(_v, k2); B.addScaledVector(_v, -k2);
        }
        // the ground: nothing below it, and friction where it touches
        for (const n of NAMES) {
          const p = this.p[n], r = n === 'head' ? 0.11 : n === 'pelvis' || n === 'chest' ? 0.14 : 0.06;
          const g = this.ground(p.x, p.z, p.y + 0.6) + r;
          if (p.y < g) {
            p.y = g;
            const o = this.o[n];
            o.x = p.x - (p.x - o.x) * 0.55; o.z = p.z - (p.z - o.z) * 0.55; // ground friction
            if (o.y < p.y) o.y = p.y + (p.y - o.y) * 0.15; // a small bounce
          }
        }
      }
    }
    for (const n of NAMES) moved = Math.max(moved, this.p[n].distanceToSquared(this.o[n]));
    this.still = moved < 1e-6 ? this.still + dt : 0;
    if (this.still > 0.8 || this.age > 12) this.done = true;
    this.pose();
  }

  // turn the skeleton's bones to follow the ragdoll
  pose() {
    const root = this.model;
    // pelvis: its position and orientation from the hips and chest
    const pb = this.b.pelvis;
    _q.copy(this.frame('hipL', 'hipR', 'chest')).multiply(this.pelvisRest);
    setWorld(pb, this.p.pelvis, _q, root);
    // chest bone: from the shoulders
    _q.copy(this.frame('shL', 'shR', 'neck', 'pelvis')).multiply(this.chestRest);
    setWorld(this.b.chest, null, _q, root);
    // limbs and neck: point each bone at its next joint
    for (const a of this.aim) {
      a.bone.parent.updateWorldMatrix(true, false);
      a.bone.getWorldQuaternion(_q);
      _a.copy(a.dir).applyQuaternion(_q); // where it points now
      _b.subVectors(this.p[a.b], this.p[a.a]).normalize(); // where it should
      _q2.setFromUnitVectors(_a, _b).multiply(_q);
      setWorld(a.bone, null, _q2, root);
    }
  }
}

// set a bone's world rotation (and position) through its parent
const _pq = new THREE.Quaternion(), _pp = new THREE.Vector3(), _ps = new THREE.Vector3(), _pm = new THREE.Matrix4();
function setWorld(bone, pos, quat, root) {
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.matrixWorld.decompose(_pp, _pq, _ps);
  bone.quaternion.copy(_pq.invert()).multiply(quat);
  if (pos) {
    _pm.copy(bone.parent.matrixWorld).invert();
    bone.position.copy(pos).applyMatrix4(_pm);
  }
  bone.updateMatrixWorld(true);
  void root;
}
