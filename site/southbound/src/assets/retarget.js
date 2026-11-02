// Bakes animation clips from one humanoid skeleton onto another.
// Both rigs must share the same rest pose (here: T-pose). Each target bone
// copies the source bone's world-space rotation *relative to its rest*,
// so differences in bone axes between the two rigs don't matter.
import * as THREE from 'three';

// Quaternius Universal Animation Library (Rigify DEF-*) -> Quaternius modular characters
export const UAL_TO_MODULAR = {
  'DEF-hips': 'Hips', 'DEF-spine001': 'Abdomen', 'DEF-spine002': 'Torso', 'DEF-spine003': 'Chest',
  'DEF-neck': 'Neck', 'DEF-head': 'Head',
  'DEF-shoulderL': 'ShoulderL', 'DEF-upper_armL': 'UpperArmL', 'DEF-forearmL': 'LowerArmL', 'DEF-handL': 'HandL',
  'DEF-shoulderR': 'ShoulderR', 'DEF-upper_armR': 'UpperArmR', 'DEF-forearmR': 'LowerArmR', 'DEF-handR': 'HandR',
  'DEF-thighL': 'UpperLegL', 'DEF-shinL': 'LowerLegL', 'DEF-footL': 'FootL',
  'DEF-thighR': 'UpperLegR', 'DEF-shinR': 'LowerLegR', 'DEF-footR': 'FootR',
};

// Quaternius Universal Animation Library -> MakeHuman default skeleton (our realistic player)
export const UAL_TO_MH = {
  'DEF-hips': 'root', 'DEF-spine001': 'spine04', 'DEF-spine002': 'spine02', 'DEF-spine003': 'spine01',
  'DEF-neck': 'neck01', 'DEF-head': 'head',
  'DEF-shoulderL': 'clavicleL', 'DEF-upper_armL': 'upperarm01L', 'DEF-forearmL': 'lowerarm01L', 'DEF-handL': 'wristL',
  'DEF-shoulderR': 'clavicleR', 'DEF-upper_armR': 'upperarm01R', 'DEF-forearmR': 'lowerarm01R', 'DEF-handR': 'wristR',
  'DEF-thighL': 'upperleg01L', 'DEF-shinL': 'lowerleg01L', 'DEF-footL': 'footL',
  'DEF-thighR': 'upperleg01R', 'DEF-shinR': 'lowerleg01R', 'DEF-footR': 'footR',
};
// fingers too, so hands relax / grip with the animation instead of staying in
// the model's curled rest pose (MakeHuman: finger1 = thumb ... finger5 = pinky)
for (const side of ['L', 'R']) {
  ['thumb', 'f_index', 'f_middle', 'f_ring', 'f_pinky'].forEach((f, i) => {
    for (let s = 1; s <= 3; s++) UAL_TO_MH[`DEF-${f}0${s}${side}`] = `finger${i + 1}-${s}${side}`;
  });
}

function restWorld(root) {
  root.updateMatrixWorld(true);
  const m = new Map();
  root.traverse((o) => { m.set(o, { q: o.getWorldQuaternion(new THREE.Quaternion()), p: o.getWorldPosition(new THREE.Vector3()) }); });
  return m;
}

export function bakeClips(srcRoot, clips, dstRoot, map, fps = 30) {
  const byName = (root) => { const m = new Map(); root.traverse((o) => m.set(o.name, o)); return m; };
  const S = byName(srcRoot), D = byName(dstRoot);
  const pairs = [];
  dstRoot.traverse((o) => { // parent-first order
    const src = Object.keys(map).find((k) => map[k] === o.name);
    if (src && S.get(src)) pairs.push({ s: S.get(src), d: o });
  });
  const hips = pairs.find((p) => p.d.name === (map['DEF-hips'] || 'Hips'));
  const srcRest = restWorld(srcRoot), dstRest = restWorld(dstRoot);
  // Rest-pose alignment: rotate each target bone's rest direction onto the
  // source's (e.g. MakeHuman A-pose arms -> T-pose arms) before copying motion.
  const mappedChild = (bone, mapping) => {
    let found = null;
    bone.traverse((o) => { if (!found && o !== bone && mapping.has(o)) found = o; });
    return found;
  };
  const srcSet = new Map(pairs.map((p) => [p.s, p])), dstSet = new Map(pairs.map((p) => [p.d, p]));
  for (const p of pairs) {
    p.align = new THREE.Quaternion();
    const sc = mappedChild(p.s, srcSet);
    if (!sc) {
      // end bones (finger tips) follow their parent's rest alignment
      const pp = pairs.find((o) => o.d === p.d.parent);
      if (pp && pp.align) p.align.copy(pp.align);
      continue;
    }
    const dc = srcSet.get(sc).d;
    const ds = srcRest.get(sc).p.clone().sub(srcRest.get(p.s).p);
    const dd = dstRest.get(dc).p.clone().sub(dstRest.get(p.d).p);
    if (ds.lengthSq() < 1e-8 || dd.lengthSq() < 1e-8) continue;
    p.align.setFromUnitVectors(dd.normalize(), ds.normalize());
  }
  void dstSet;
  const dstLocalRest = new Map(pairs.map((p) => [p.d, { q: p.d.quaternion.clone(), p: p.d.position.clone() }]));
  // scale hip motion by hip height (works even when the source has no mesh)
  const hipH = (root, bone) => bone.getWorldPosition(new THREE.Vector3()).y - root.getWorldPosition(new THREE.Vector3()).y;
  const ratio = hipH(dstRoot, hips.d) / Math.max(1e-3, hipH(srcRoot, hips.s));
  const mixer = new THREE.AnimationMixer(srcRoot);
  const q = new THREE.Quaternion(), pq = new THREE.Quaternion(), w = new THREE.Vector3();
  const out = [];
  for (const clip of clips) {
    mixer.stopAllAction();
    const action = mixer.clipAction(clip); action.play();
    const n = Math.max(2, Math.round(clip.duration * fps) + 1);
    const times = new Float32Array(n);
    const qv = pairs.map(() => new Float32Array(n * 4));
    const hp = new Float32Array(n * 3);
    for (let f = 0; f < n; f++) {
      const t = Math.min(clip.duration, f / fps);
      times[f] = t;
      mixer.setTime(t);
      srcRoot.updateMatrixWorld(true);
      pairs.forEach((p, i) => {
        const sr = srcRest.get(p.s).q, dr = dstRest.get(p.d).q;
        p.s.getWorldQuaternion(q);
        q.multiply(pq.copy(sr).invert()).multiply(p.align).multiply(dr); // delta * align * dstRest
        p.d.parent.getWorldQuaternion(pq);
        p.d.quaternion.copy(pq.invert().multiply(q));
        p.d.updateMatrixWorld(true);
        p.d.quaternion.toArray(qv[i], f * 4);
      });
      // hips translation (scaled to the target's height)
      hips.s.getWorldPosition(w).sub(srcRest.get(hips.s).p).multiplyScalar(ratio).add(dstRest.get(hips.d).p);
      hips.d.parent.worldToLocal(w);
      w.toArray(hp, f * 3);
    }
    const tracks = pairs.map((p, i) => new THREE.QuaternionKeyframeTrack(`${p.d.name}.quaternion`, times, qv[i]));
    tracks.push(new THREE.VectorKeyframeTrack(`${hips.d.name}.position`, times, hp));
    out.push(new THREE.AnimationClip(clip.name, clip.duration, tracks));
    action.stop();
  }
  // restore the target's rest pose
  for (const [b, r] of dstLocalRest) { b.quaternion.copy(r.q); b.position.copy(r.p); }
  dstRoot.updateMatrixWorld(true);
  return out;
}
