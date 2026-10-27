// Face rig: the CC0 MakeHuman face pose units on our builds' face bones (pure functions of the
// weights you give it; no state between frames).
//
// Every build carries MakeHuman's default skeleton with its 60-odd face bones (jaw, oris*, levator*,
// risorius*, orbicularis* (lids), oculi* (brows), tongue*) skinned with MakeHuman's own face weights;
// the lower teeth ride on the jaw, the tongue on the tongue bones, the lashes on the lid bones.
// MakeHuman's 'Standard face pose units' (offline/poseunits.py -> data/face-units.json) say how far
// each of those bones turns for one unit at weight 1 (JawDrop, LipsKiss, MouthLeftPullUp, ...).
// A face pose here is a set of unit weights; per bone the units' rotation vectors are summed
// (log-quaternion blend: commutative, so the order of layers never matters) and applied on top of
// the bone's drape pose:  bone.q = drape.q * exp(sum_u w_u * log(q_u)).
//
//   import { loadFaceUnits, createFaceRig } from '../lib/humans/face.js';
//   const units = await loadFaceUnits();               // setup (cached)
//   const face = createFaceRig(ch, units);
//   face.apply({ JawDrop: 0.4, LipsKiss: 0.3 });       // update(t), AFTER ch.update(t) (idle resets bones)
//
// Unit names: see UNIT_NAMES (data/face-units.json). Left/Right are the CHARACTER's sides.
import * as THREE from 'three';

export const FACE_UNITS_URL = new URL('./data/face-units.json', import.meta.url).href;

let unitsPromise = null;
/** Fetch + prepare the unit table (cached): { names: [...], unit: { name: [[boneName, rx, ry, rz], ...] } } */
export function loadFaceUnits(url = FACE_UNITS_URL) {
  if (!unitsPromise) {
    unitsPromise = (async () => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`face units: ${url} (${r.status})`);
      const doc = await r.json();
      const unit = {};
      for (const [name, bones] of Object.entries(doc.units)) {
        unit[name] = Object.entries(bones).map(([b, q]) => {
          // log map of a unit quaternion -> rotation vector (axis * angle)
          const [x, y, z, w] = q;
          const s = Math.sqrt(x * x + y * y + z * z);
          const ang = 2 * Math.atan2(s, w);
          const k = s > 1e-9 ? ang / s : 2;
          return [b, x * k, y * k, z * k];
        });
      }
      // derived units: the jaw alone (JawDrop also pulls the lower-lip centre down into a V)
      if (unit.JawDrop) unit.JawOpen = unit.JawDrop.filter(([b]) => b === 'jaw');
      // the lids' share of the eye units (the lids follow the gaze; the eye bones themselves are
      // turned by the performance layer): <Side>LidsDown / LidsUp / LidsIn / LidsOut
      for (const s of ['Left', 'Right']) {
        const lids = (u) => (unit[u] || []).filter(([b]) => !/^eye\./.test(b));
        unit[`${s}LidsDown`] = lids(`${s}EyeDown`);
        unit[`${s}LidsUp`] = lids(`${s}EyeUp`);
        unit[`${s}LidsTurnLeft`] = lids(`${s}EyeturnLeft`);
        unit[`${s}LidsTurnRight`] = lids(`${s}EyeturnRight`);
      }
      return { names: Object.keys(unit), unit, license: doc.license, source: doc.source };
    })();
  }
  return unitsPromise;
}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3();

/**
 * A face rig for one character. Eye-bone units (Left/RightEye*) are left out: gaze is the
 * performance layer's job (perform.js), it turns the eye bones itself.
 * Returns { apply(weights), bones: [bone names], units }.
 */
export function createFaceRig(ch, units, opts = {}) {
  const skip = opts.skip || /Eye(Down|Up|turnRight|turnLeft)$/;
  const slots = new Map();   // bone index -> slot
  const table = {};
  for (const [name, list] of Object.entries(units.unit)) {
    if (skip.test(name)) continue;
    const ent = [];
    for (const [bn, rx, ry, rz] of list) {
      const i = ch.index[bn];
      if (i === undefined) continue;
      if (!slots.has(i)) slots.set(i, { i, x: 0, y: 0, z: 0 });
      ent.push([slots.get(i), rx, ry, rz]);
    }
    table[name] = ent;
  }
  const S = [...slots.values()];
  // sculpted mouth shapes (mouthshapes.js: CC0 MakeHuman expression targets as morphs on the skin,
  // when the character has the sidecar): driven by name like the units ('mouth-pursing': 0.6)
  const morphs = [];
  for (const m of ch.meshes) {
    const d = m.morphTargetDictionary;
    if (!d) continue;
    for (const name in d) if (name.startsWith('mouth-')) morphs.push([m, d[name], name]);
  }
  function apply(weights) {
    for (const s of S) { s.x = 0; s.y = 0; s.z = 0; }
    for (const name in weights) {
      const w = weights[name];
      if (!w) continue;
      const ent = table[name];
      if (!ent) continue;
      for (const [s, rx, ry, rz] of ent) { s.x += w * rx; s.y += w * ry; s.z += w * rz; }
    }
    for (const [m, i, name] of morphs) m.morphTargetInfluences[i] = Math.max(-0.5, Math.min(1.5, weights[name] || 0));
    if (ch.mouthU) ch.mouthU.value = Math.min(1, Math.max(0, (weights.JawDrop || 0) + (weights.JawOpen || 0) + 0.6 * (weights.JawDropStretched || 0)));
    for (const s of S) {
      const b = ch.bones[s.i];
      const a = Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
      if (a < 1e-7) { b.quaternion.copy(ch.drape.q[s.i]); continue; }
      _v.set(s.x / a, s.y / a, s.z / a);
      _q.setFromAxisAngle(_v, a);
      b.quaternion.copy(ch.drape.q[s.i]).multiply(_q);
    }
  }
  return { apply, units: Object.keys(table).concat(morphs.map((x) => x[2])), bones: S.map((s) => ch.bones[s.i].name), shapes: morphs.map((x) => x[2]) };
}

/** Mirror a weight set left <-> right (unit names with Left/Right). */
export function mirrorUnits(w) {
  const out = {};
  for (const [k, v] of Object.entries(w)) {
    const m = k.replace(/Left|Right/g, (s) => (s === 'Left' ? 'Right' : 'Left'));
    out[m] = (out[m] || 0) + v;
  }
  return out;
}

/** Add weight set b * k into a (in place). */
export function addUnits(a, b, k = 1) {
  if (!b || !k) return a;
  for (const n in b) a[n] = (a[n] || 0) + b[n] * k;
  return a;
}

/** Both sides of a 'Left'/'Right' pair at once: sym('MouthPullUp', 0.4) */
export function sym(base, w, bias = 0) {
  const L = base.replace('*', 'Left'), R = base.replace('*', 'Right');
  return { [L]: w * (1 + bias), [R]: w * (1 - bias) };
}
