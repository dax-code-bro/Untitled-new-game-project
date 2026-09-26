/* ============================================================
   ANIMATION — skeletons, clips, blending, IK, and a facial rig.
   Skinning happens on the GPU via a bone texture; expressions and
   visemes are CPU blendshapes on a low-poly head, which is cheap
   because a head is a few hundred vertices.
   ============================================================ */

class Bone {
  constructor(name, parent, localPosition, localRotation) {
    this.name = name;
    this.parent = parent;          // index, -1 for root
    this.localPosition = Vec3.from(localPosition || [0, 0, 0]);
    this.localRotation = Quat.from(localRotation || null);
    this.localScale = new Vec3(1, 1, 1);
    // Bind pose, captured once; skinning needs its inverse.
    this.bindMatrix = new Mat4();
    this.inverseBind = new Mat4();
    this.worldMatrix = new Mat4();
    this.length = 0.2;
  }
}

class Skeleton {
  constructor(bones = []) {
    this.bones = bones;
    this.byName = new Map();
    bones.forEach((b, i) => this.byName.set(b.name, i));
    this.matrices = new Float32Array(Math.max(1, bones.length) * 16);
    this.texture = null;
    this._texData = new Float32Array(Math.max(1, bones.length) * 16);
    this._scratch = new Mat4();
    this.computeBindPose();
  }

  index(name) { const i = this.byName.get(name); return i === undefined ? -1 : i; }
  bone(name) { const i = this.index(name); return i < 0 ? null : this.bones[i]; }

  computeBindPose() {
    for (let i = 0; i < this.bones.length; i++) {
      const b = this.bones[i];
      b.bindMatrix.compose(b.localPosition, b.localRotation, b.localScale);
      if (b.parent >= 0) {
        this._scratch.mulMatrices(this.bones[b.parent].bindMatrix, b.bindMatrix);
        b.bindMatrix.copy(this._scratch);
      }
      b.inverseBind.copy(b.bindMatrix).invert();
    }
  }

  /* Recompute world matrices and the skinning palette. Bones are stored in
     parent-before-child order, so one linear pass suffices. */
  update() {
    const M = this.matrices;
    for (let i = 0; i < this.bones.length; i++) {
      const b = this.bones[i];
      b.worldMatrix.compose(b.localPosition, b.localRotation, b.localScale);
      if (b.parent >= 0) {
        this._scratch.mulMatrices(this.bones[b.parent].worldMatrix, b.worldMatrix);
        b.worldMatrix.copy(this._scratch);
      }
      // Skinning matrix = world * inverseBind.
      this._scratch.mulMatrices(b.worldMatrix, b.inverseBind);
      M.set(this._scratch.e, i * 16);
    }
    return this;
  }

  /* Upload the palette as an RGBA32F texture. A uniform array would cap the
     bone count at whatever the device allows; a texture has no such limit. */
  /* ONCE PER SKELETON PER FRAME, not once per actor.
   *
     A character is not one skinned mesh. It is a body, a neck, and a
     piece of kit for every material it wears -- five or six actors, all
     hanging off the SAME skeleton -- and the renderer called this for
     each of them. Measured in a twelve-player match: sixty-two skinned
     draws uploading an RGBA32F texture apiece, when there are only
     twelve skeletons in the scene. Fifty of those uploads were the same
     bytes going to the same texture in the same frame.

     A texture upload is a pipeline stall on most drivers, which is why
     this costs so much more than the triangle count suggests it should
     -- the map is 311k triangles in 64 instanced groups and is not the
     expensive part. `_texFrame` is set by the renderer at the top of
     each frame; the first actor to ask uploads, the rest get the
     texture that is already on the card. */
  uploadTexture(gl, frame) {
    if (!this.texture) {
      this.texture = new Texture(gl, {
        internalFormat: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT,
        wrap: gl.CLAMP_TO_EDGE, minFilter: gl.NEAREST, magFilter: gl.NEAREST, mips: false,
      });
      this._texFrame = -1;
    }
    if (frame !== undefined && this._texFrame === frame) return this.texture;
    this._texFrame = frame;
    const width = Math.max(1, this.bones.length * 4);
    this.texture.upload(this.matrices, width, 1);
    return this.texture;
  }

  worldPosition(index, out = new Vec3()) {
    return this.bones[index].worldMatrix.getTranslation(out);
  }

  /* Two-bone analytic IK — the workhorse for planting feet on uneven ground
     and reaching a hand to a target. */
  solveIK(upperIdx, lowerIdx, endIdx, targetWorld, poleWorld = null) {
    const bones = this.bones;
    const upper = bones[upperIdx], lower = bones[lowerIdx];
    const rootPos = upper.worldMatrix.getTranslation(_ik[0]);
    const midPos = lower.worldMatrix.getTranslation(_ik[1]);
    const endPos = bones[endIdx].worldMatrix.getTranslation(_ik[2]);

    const lenUpper = rootPos.distanceTo(midPos);
    const lenLower = midPos.distanceTo(endPos);
    const target = _ik[3].copy(targetWorld);
    const toTarget = _ik[4].subVectors(target, rootPos);
    let dist = toTarget.length();
    if (dist < 1e-5) return;
    // Clamp inside the reachable annulus so acos never goes out of domain.
    const maxReach = (lenUpper + lenLower) * 0.999;
    const minReach = Math.abs(lenUpper - lenLower) * 1.001 + 1e-4;
    dist = clamp(dist, minReach, maxReach);
    toTarget.normalize();

    // Law of cosines for the shoulder/hip angle.
    const cosA = clamp((lenUpper * lenUpper + dist * dist - lenLower * lenLower) / (2 * lenUpper * dist), -1, 1);
    const angleA = Math.acos(cosA);

    // Bend plane: defined by the pole vector, else by the current bend.
    const pole = poleWorld
      ? _ik[5].subVectors(poleWorld, rootPos)
      : _ik[5].subVectors(midPos, rootPos);
    let axis = _ik[6].crossVectors(toTarget, pole);
    if (axis.lengthSq() < 1e-8) toTarget.perpendicular(axis);
    axis.normalize();

    // Rotate the direction-to-target by angleA about the bend axis to get
    // where the upper bone must point.
    const upperDir = _ik[7].copy(toTarget).applyQuat(_ikQ.setAxisAngle(axis, angleA));
    const newMid = _ik[8].copy(rootPos).addScaled(upperDir, lenUpper);

    // Convert the two world-space aims back into local rotations. The
    // child index goes with each one -- see aimBoneAt for why assuming
    // an axis instead cost this solver its entire working life.
    aimBoneAt(this, upperIdx, lowerIdx, newMid);
    this.update();
    aimBoneAt(this, lowerIdx, endIdx, target);
    this.update();
  }
}

/* Rotate a bone so that the limb it carries points at a world target.
 *
 * "THE LIMB IT CARRIES", NOT "ITS +Y AXIS", AND THAT WAS THE WHOLE BUG.
 * This used to take the bone's +Y as the direction being aimed, on the
 * usual convention that a bone points along +Y towards its child. The
 * procedural humanoid below does the opposite: upperArm sits at
 * [0.103, -0.052, 0.002] under the shoulder and lowerArm at
 * [0.016, -0.262, 0.004] under that, so every arm and every leg runs
 * DOWN its parent's -Y, and the rest rotations are identity. Aiming +Y
 * at a target therefore pointed the actual limb 180 degrees away from
 * it.
 *
 * Measured, on a man asked to bring a rifle to his shoulder: target
 * 0.398 m up and forward of the joint, hand solved to 0.502 m straight
 * DOWN from it -- a fully extended arm, hanging, with the elbow exactly
 * half way. Not a near miss; the precise opposite, at full stretch,
 * which is what a sign error looks like when the solver is otherwise
 * correct. The clamp to the reachable annulus even hid it: with the
 * target unreachable in that direction the arm just locked straight,
 * and a straight arm hanging at the side is indistinguishable from an
 * idle pose. It read as "the IK never ran".
 *
 * It had never run. solveIK is documented here as the workhorse for
 * planting feet on uneven ground, and had no caller anywhere in the
 * project -- sixty weapons, four maps, a whole multiplayer mode, and
 * this was the first thing to ask it for anything.
 *
 * So stop assuming an axis. The direction the limb actually points is
 * the direction from this bone to the one it drives, which the caller
 * knows and the hierarchy can be asked for. That is correct for a +Y
 * rig too, so nothing has to agree with a convention. */
function aimBoneAt(skeleton, boneIdx, childIdx, worldTarget) {
  const bone = skeleton.bones[boneIdx];
  const world = bone.worldMatrix.getTranslation(_ik[9]);
  const desired = _ik[10].subVectors(worldTarget, world);
  if (desired.lengthSq() < 1e-10) return;
  desired.normalize();

  // Where the limb points now: this joint towards the next one.
  const child = skeleton.bones[childIdx].worldMatrix.getTranslation(_ik[13]);
  const current = _ik[11].subVectors(child, world);
  if (current.lengthSq() < 1e-10) return;
  current.normalize();
  const delta = _ikQ.setFromUnitVectors(current, desired);

  // Move the correction into the parent's frame before applying it locally.
  if (bone.parent >= 0) {
    const parentWorld = skeleton.bones[bone.parent].worldMatrix;
    const inv = _ikM.copy(parentWorld).invert();
    const localAxis = _ik[12].set(delta.x, delta.y, delta.z);
    const len = localAxis.length();
    if (len > 1e-8) {
      localAxis.applyMat4Dir(inv).normalize();
      const angle = 2 * Math.acos(clamp(delta.w, -1, 1));
      _ikQ2.setAxisAngle(localAxis, angle);
      bone.localRotation.premul(_ikQ2).normalize();
      return;
    }
  }
  bone.localRotation.premul(delta).normalize();
}

const _ik = [];
for (let i = 0; i < 16; i++) _ik.push(new Vec3());
const _ikQ = new Quat();
const _ikQ2 = new Quat();
const _ikM = new Mat4();

/* ---------------- clips ---------------- */

/* A clip is a set of per-bone keyframe tracks. Clips are generated
   procedurally by the engine (walk, run, idle) rather than imported, which
   keeps a game one file with no downloads. */
class AnimationClip {
  constructor(name, duration, tracks = {}, opts = {}) {
    this.name = name;
    this.duration = duration;
    this.tracks = tracks;   // boneName -> { times:[], rotations:[Quat], positions:[Vec3] }
    this.loop = opts.loop !== false;
    /* How far over the ground one cycle of this clip carries the body,
       in metres, for the cycles where that means anything. It is not a
       decoration: the planted foot in these clips is planted, so the
       only playback rate at which the feet do not skate is the one where
       stride/duration matches how fast the body is actually moving. The
       controller reads it. */
    this.stride = opts.stride || 0;
  }

  /* Sample into a target pose object: { boneName: {rotation, position} }.

     SMOOTH, not linear. This used to slerp straight from one key to the
     next, which means the speed of every joint was CONSTANT across each
     segment and changed instantaneously at every key. Measured across the
     fifty clips in this engine, the worst of those steps was the sprint's
     left knee: 1737 degrees per second of angular velocity appearing in
     a single frame. That is what "the animation looks cartoonish" is --
     not the poses, which were fine, but a body whose every joint jerks to
     a new speed eight times a second.

     So each segment is a cubic Hermite through the two keys it spans,
     with tangents taken from the neighbouring keys. The curve still
     passes exactly through every authored pose -- nothing is softened
     away -- but velocity is now continuous across the whole clip, and
     the ease in and out of each extreme comes for free.

     Tangents are the weighted three-point form rather than the plain
     centred difference. Key spacing here is wildly uneven (a sprint has
     keys at 0, 0.08, 0.22, 0.36 ... in the same track), and the centred
     difference overshoots badly when a short segment sits next to a long
     one -- a knee authored to 140 degrees swinging out past 160. The
     weighted form biases the tangent toward the shorter neighbour and
     keeps the overshoot to a degree or two, which is follow-through
     rather than a glitch. */
  sample(time, out) {
    const dur = this.duration;
    const t = this.loop ? ((time % dur) + dur) % dur : clamp(time, 0, dur);
    /* A POSE OBJECT IS REUSED, SO CLEAR WHAT ANOTHER CLIP LEFT IN IT.
       The animator samples every clip into the same two objects, and
       this only ever wrote the bones this clip has tracks for -- so a
       bone the new clip does not key kept the last value the old one
       gave it, and the animator applied that as if it were keyed. An
       idle, which keys no pelvis, stood on whatever height the run
       before it happened to stop at: 57 mm down on one bot, 26 on the
       next, and the support hand's reach down a rifle moved with it
       (hold.test.js, 16 cm against 20). Cleared once per change of
       clip, so a steady cycle allocates nothing. */
    if (out.__clip !== this) {
      for (const k in out) delete out[k];
      if (!Object.prototype.hasOwnProperty.call(out, '__clip')) {
        Object.defineProperty(out, '__clip', { value: this, writable: true, enumerable: false });
      } else out.__clip = this;
    }
    for (const name in this.tracks) {
      const track = this.tracks[name];
      const times = track.times;
      const n = times.length;
      let i = 0;
      while (i < n - 1 && times[i + 1] < t) i++;
      const j = Math.min(i + 1, n - 1);
      const t1 = times[i], t2 = times[j];
      const span = t2 - t1;
      const f = span > 1e-6 ? (t - t1) / span : 0;

      /* The keys either side, for the tangents. A looping clip wraps --
         and its first and last key hold the SAME pose, so the wrap has to
         step over one of them or the tangent at the seam is computed
         across a zero-length segment and the loop point pops. */
      let h = i - 1, k = j + 1, tPrev, tNext;
      if (h < 0) {
        if (this.loop && n > 2) { h = n - 2; tPrev = times[n - 2] - dur; }
        else { h = i; tPrev = t1 - (span > 1e-6 ? span : 1); }
      } else tPrev = times[h];
      if (k > n - 1) {
        if (this.loop && n > 2) { k = 1; tNext = times[1] + dur; }
        else { k = j; tNext = t2 + (span > 1e-6 ? span : 1); }
      } else tNext = times[k];

      let slot = out[name];
      if (!slot) { slot = out[name] = { rotation: new Quat(), position: new Vec3(), hasPosition: false }; }
      if (track.rotations) {
        hermiteQuat(slot.rotation, track.rotations, h, i, j, k, tPrev, t1, t2, tNext, f);
      }
      if (track.positions) {
        hermiteVec3(slot.position, track.positions, h, i, j, k, tPrev, t1, t2, tNext, f);
        slot.hasPosition = true;
      } else {
        slot.hasPosition = false;
      }
    }
    return out;
  }
}

/* The Hermite basis, and the weighted three-point tangent that feeds it.
   `a` is the value at t1 with the key before it at t0; `b` the value at
   t2 with the key after it at t3. Shared by both channels so the rotation
   and the position of one bone cannot drift out of step. */
function hermiteWeights(t0, t1, t2, t3, f) {
  const s2 = f * f, s3 = s2 * f;
  const span = t2 - t1;
  return {
    h00: 2 * s3 - 3 * s2 + 1,
    h10: (s3 - 2 * s2 + f) * span,
    h01: -2 * s3 + 3 * s2,
    h11: (s3 - s2) * span,
    dA: t1 - t0, dB: span, dC: t3 - t2,
  };
}
/* One scalar channel: value, and the two tangents around it.

   SHAPE-PRESERVING. The plain weighted tangent still overshoots, and on
   these clips it overshot a lot -- the wave's right upper arm sailed
   37.5 degrees past the pose it was aimed at, which is precisely the
   "over-exaggerated" this whole pass is about. So the tangents are
   limited the Fritsch-Carlson way: zero at a local extreme, and
   otherwise no steeper than three times the shallower neighbouring
   secant. That makes the cubic monotone on every segment, so it CANNOT
   leave the box its two keys define. What survives is the easing --
   speed coming off at each extreme and building through the middle,
   which is what a limb does and a straight line never did. */
function hermiteScalar(w, p0, p1, p2, p3) {
  const dA = w.dA > 1e-9 ? w.dA : w.dB, dC = w.dC > 1e-9 ? w.dC : w.dB;
  const dB = w.dB > 1e-9 ? w.dB : 1;
  const s0 = (p1 - p0) / dA, s1 = (p2 - p1) / dB, s2 = (p3 - p2) / dC;
  let m1, m2;
  if (s0 * s1 <= 0) m1 = 0;
  else {
    m1 = (s0 * dB + s1 * dA) / (dA + dB);
    const lim = 3 * Math.min(Math.abs(s0), Math.abs(s1));
    if (m1 > lim) m1 = lim; else if (m1 < -lim) m1 = -lim;
  }
  if (s1 * s2 <= 0) m2 = 0;
  else {
    m2 = (s1 * dC + s2 * dB) / (dB + dC);
    const lim = 3 * Math.min(Math.abs(s1), Math.abs(s2));
    if (m2 > lim) m2 = lim; else if (m2 < -lim) m2 = -lim;
  }
  return w.h00 * p1 + w.h10 * m1 + w.h01 * p2 + w.h11 * m2;
}

const _hq = [0, 0, 0, 0];
function hermiteQuat(outQ, arr, h, i, j, k, t0, t1, t2, t3, f) {
  const q1 = arr[i];
  if (t2 - t1 <= 1e-9) { outQ.copy(q1).normalize(); return; }
  /* Align the four onto one hemisphere, as a CHAIN. Aligning each one to
     q1 independently is wrong once a clip turns far enough for q2 to
     flip: q3 then has to follow q2, not q1. */
  const sgn = (a, b) => (a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1);
  const s0 = sgn(q1, arr[h]);
  const q2 = arr[j], s2 = sgn(q1, q2);
  const s3 = s2 * (q2.x * arr[k].x + q2.y * arr[k].y + q2.z * arr[k].z + q2.w * arr[k].w < 0 ? -1 : 1);
  const w = hermiteWeights(t0, t1, t2, t3, f);
  const A = arr[h], B = q1, C = q2, D = arr[k];
  _hq[0] = hermiteScalar(w, s0 * A.x, B.x, s2 * C.x, s3 * D.x);
  _hq[1] = hermiteScalar(w, s0 * A.y, B.y, s2 * C.y, s3 * D.y);
  _hq[2] = hermiteScalar(w, s0 * A.z, B.z, s2 * C.z, s3 * D.z);
  _hq[3] = hermiteScalar(w, s0 * A.w, B.w, s2 * C.w, s3 * D.w);
  outQ.set(_hq[0], _hq[1], _hq[2], _hq[3]).normalize();
}
function hermiteVec3(outV, arr, h, i, j, k, t0, t1, t2, t3, f) {
  if (t2 - t1 <= 1e-9) { outV.copy(arr[i]); return; }
  const w = hermiteWeights(t0, t1, t2, t3, f);
  const A = arr[h], B = arr[i], C = arr[j], D = arr[k];
  outV.set(
    hermiteScalar(w, A.x, B.x, C.x, D.x),
    hermiteScalar(w, A.y, B.y, C.y, D.y),
    hermiteScalar(w, A.z, B.z, C.z, D.z),
  );
}

/* Plays and cross-fades clips onto a skeleton. */
class Animator {
  constructor(skeleton) {
    this.skeleton = skeleton;
    this.clips = new Map();
    this.current = null;
    this.previous = null;
    this.time = 0;
    this.prevTime = 0;
    this.fade = 1;
    this.fadeDuration = 0.2;
    this.speed = 1;
    this._poseA = {};
    this._poseB = {};
    // Rest pose, so bones no clip touches snap back instead of drifting.
    this.restRotations = skeleton.bones.map((b) => b.localRotation.clone());
    this.restPositions = skeleton.bones.map((b) => b.localPosition.clone());
  }

  add(clip) { this.clips.set(clip.name, clip); return this; }

  play(name, fadeDuration = 0.22) {
    const clip = this.clips.get(name);
    if (!clip || this.current === clip) return this;
    if (this.current && fadeDuration > 0) {
      this.previous = this.current;
      this.prevTime = this.time;
      this.fade = 0;
      this.fadeDuration = fadeDuration;
    } else {
      this.previous = null;
      this.fade = 1;
    }
    /* PHASE-MATCHED between cycles. Walk, run and sprint are all solved
       from the same foot paths with the same foot planted at t = 0, so a
       change of gait should carry on from the SAME point in the stride
       -- the left foot still halfway through its swing -- rather than
       restart the new cycle at its beginning. Restarting was a pop at
       every walk/run/sprint change: for the length of the fade, one clip
       had the left foot down and the other the right. Only between two
       looping cycles that both carry a stride; anything else (a jump, a
       death, an idle) still starts at the top. */
    const from = this.current;
    if (from && from.loop && clip.loop && from.stride > 0 && clip.stride > 0 && from.duration > 0) {
      const phase = ((this.time / from.duration) % 1 + 1) % 1;
      this.current = clip;
      this.time = phase * clip.duration;
      return this;
    }
    this.current = clip;
    this.time = 0;
    return this;
  }

  update(dt) {
    if (!this.current) return;
    this.time += dt * this.speed;
    if (this.previous) {
      this.prevTime += dt * this.speed;
      this.fade = Math.min(1, this.fade + dt / Math.max(this.fadeDuration, 1e-4));
      if (this.fade >= 1) this.previous = null;
    }

    const bones = this.skeleton.bones;
    // Start from rest so untouched bones do not accumulate drift.
    for (let i = 0; i < bones.length; i++) {
      bones[i].localRotation.copy(this.restRotations[i]);
      bones[i].localPosition.copy(this.restPositions[i]);
    }

    const a = this.current.sample(this.time, this._poseA);
    if (this.previous && this.fade < 1) {
      const b = this.previous.sample(this.prevTime, this._poseB);
      /* The blend weight EASED, not linear: a linear crossfade leaves and
         arrives at full speed, so every transition has a visible corner
         at each end. Smoothstep takes the corners off without moving the
         start or the finish. */
      const w = this.fade * this.fade * (3 - 2 * this.fade);
      for (const name in b) {
        const idx = this.skeleton.index(name);
        if (idx < 0) continue;
        const target = a[name];
        const bone = bones[idx];
        if (target) {
          bone.localRotation.copy(b[name].rotation).slerp(target.rotation, w);
          if (target.hasPosition && b[name].hasPosition) {
            bone.localPosition.copy(b[name].position).lerp(target.position, w);
          }
        } else {
          bone.localRotation.copy(this.restRotations[idx]).slerp(b[name].rotation, 1 - w);
        }
      }
      for (const name in a) {
        if (b[name]) continue;
        const idx = this.skeleton.index(name);
        if (idx < 0) continue;
        bones[idx].localRotation.copy(this.restRotations[idx]).slerp(a[name].rotation, w);
        if (a[name].hasPosition) bones[idx].localPosition.lerp(a[name].position, w);
      }
    } else {
      for (const name in a) {
        const idx = this.skeleton.index(name);
        if (idx < 0) continue;
        bones[idx].localRotation.copy(a[name].rotation);
        if (a[name].hasPosition) bones[idx].localPosition.copy(a[name].position);
      }
    }
    this.skeleton.update();
    /* The physically-driven layer (90b-dynamics.js): lean, bank, lag,
       gaze and breath, added to whatever the clips produced. Before the
       correction hook, so a hand solved onto a rifle still has the last
       word over an arm that was trailing a change of speed. */
    if (this.dynamics) { this.dynamics.apply(dt, this); this.skeleton.update(); }
    /* THE LAST WORD ON THE POSE.
     *
       Anything that corrects a clip -- a hand reaching for a weapon, a
       foot planted on a slope -- has to run AFTER the sample or the
       next update wipes it, and the engine updates every actor's
       animator itself (95-engine.js), well after the game has had its
       turn. I solved a pair of arms onto a rifle in the match's update
       and watched them snap back to the clip every single frame
       before working out why.

       So the correction belongs here, at the end of the pipeline,
       where it cannot be overwritten by the thing that produced the
       pose it is correcting. */
    if (this.onPosed) this.onPosed(this);
  }
}

/* ---------------- procedural humanoid ---------------- */

const HUMANOID_BONES = [
  ['hips', -1, [0, 0, 0]],
  ['spine', 0, [0, 0.16, 0]],
  ['chest', 1, [0, 0.18, 0]],
  ['neck', 2, [0, 0.16, 0]],
  ['head', 3, [0, 0.11, 0]],
  /* Arms hang at the sides in bind pose rather than straight out. A
     T-pose rig would need every clip to rotate the arms down 80
     degrees before doing anything else, and any bone a clip does not
     touch would snap back to the T -- which is exactly what
     "unfinished character" looks like.

     THE SHOULDER JOINTS WERE TEN CENTIMETRES TOO FAR IN, and that one
     number is most of why every man in this game reads as a tube with
     legs. Measured off a photograph of a standing operator: the
     shoulder joint sat 0.155 from the midline (0.13 at this body's
     scale) with an upper arm 0.060 thick, so the arm's outer surface
     was at 0.163 -- inside the trunk, whose deltoid shelf was 0.204
     wide. The arms were geometrically BURIED. You could see a hand at
     the hip and nothing else, which is the complaint: "no arms".

     Biacromial breadth on a 1.75 m adult is about 0.40, so the joint
     belongs at 0.175 and the arm's outer surface at about 0.235 --
     outside a trunk that has been narrowed to 0.176 at the clavicles
     (see buildTorso). The arm is then the silhouette, which on a real
     person it is. */
  ['shoulderL', 2, [0.072, 0.128, 0.006]],
  ['upperArmL', 5, [0.103, -0.052, 0.002]],
  ['lowerArmL', 6, [0.016, -0.262, 0.004]],
  ['handL', 7, [0.006, -0.240, 0.010]],
  ['shoulderR', 2, [-0.072, 0.128, 0.006]],
  ['upperArmR', 9, [-0.103, -0.052, 0.002]],
  ['lowerArmR', 10, [-0.016, -0.262, 0.004]],
  ['handR', 11, [-0.006, -0.240, 0.010]],
  ['upperLegL', 0, [0.09, -0.04, 0]],
  ['lowerLegL', 13, [0, -0.42, 0]],
  ['footL', 14, [0, -0.40, 0]],
  ['upperLegR', 0, [-0.09, -0.04, 0]],
  ['lowerLegR', 16, [0, -0.42, 0]],
  ['footR', 17, [0, -0.40, 0]],
];

function makeHumanoidSkeleton(scale = 1) {
  const bones = HUMANOID_BONES.map(([name, parent, pos]) => new Bone(
    name, parent, [pos[0] * scale, pos[1] * scale, pos[2] * scale], null,
  ));
  return new Skeleton(bones);
}

/* Build a clip from compact per-bone keyframe descriptions. Angles are in
   degrees around the given axis, which makes hand-authored motion readable. */
function buildClip(name, duration, spec, opts = {}) {
  const tracks = {};
  for (const boneName in spec) {
    const entry = spec[boneName];
    const times = [];
    const rotations = [];
    for (const key of entry.keys) {
      times.push(key[0] * duration);
      const q = new Quat();
      if (key.length === 4) q.setEuler(key[1] * DEG, key[2] * DEG, key[3] * DEG);
      else q.setAxisAngle(Vec3.from(entry.axis || [1, 0, 0]), key[1] * DEG);
      rotations.push(q);
    }
    /* An optional position track on the same bone: [t, x, y, z] in metres,
       absolute in the bone's parent space. A track carries one time array
       for both channels, so the position keys are resampled onto the
       rotation key times rather than forcing the two to line up by hand.

       This is what lets a walk have a bob. Rotations alone can only ever
       swing a skeleton around a pelvis nailed to one height, which is what
       makes a rotation-only walk cycle read as gliding. */
    if (entry.pos && entry.pos.length) {
      const pk = entry.pos;
      const positions = times.map((tAbs) => {
        const tN = duration > 1e-6 ? tAbs / duration : 0;
        let i = 0;
        while (i < pk.length - 1 && pk[i + 1][0] < tN) i++;
        const a = pk[i], b = pk[Math.min(i + 1, pk.length - 1)];
        const span = b[0] - a[0];
        const f = span > 1e-6 ? clamp((tN - a[0]) / span, 0, 1) : 0;
        return new Vec3(
          a[1] + (b[1] - a[1]) * f,
          a[2] + (b[2] - a[2]) * f,
          a[3] + (b[3] - a[3]) * f,
        );
      });
      tracks[boneName] = { times, rotations, positions };
    } else {
      tracks[boneName] = { times, rotations };
    }
  }
  return new AnimationClip(name, duration, tracks, opts);
}

/* How fast to play a locomotion clip so its planted foot stays planted.

   The clip states how far one cycle carries the body; divide by the
   duration and that is the speed at which the animation is TRUE. Any
   other rate is a foot sliding on the floor, and the further from it the
   worse. The clamp is there because the alternative to a little sliding
   at the edges is a man moving his legs at a speed no man moves them --
   a clip stretched past about 1.8 stops reading as running and starts
   reading as a cartoon, which is the whole complaint this pass answers. */
function gaitRate(clip, speed, lo = 0.55, hi = 1.80) {
  if (!clip || !clip.stride || clip.duration <= 0) return 1;
  const natural = clip.stride / clip.duration;
  return clamp(speed / natural, lo, hi);
}

/* The stock locomotion set. Enough for a character to read as alive without
   any authored animation data. */
function makeHumanoidClips() {
  const clips = [];

  clips.push(buildClip('idle', 3.2, {
    spine: { keys: [[0, 0, 0, 0], [0.5, 1.5, 0, 0], [1, 0, 0, 0]] },
    chest: { keys: [[0, 0, 0, 1], [0.5, -1.5, 0, -1], [1, 0, 0, 1]] },
    head: { keys: [[0, 0, 0, 0], [0.35, 1, 4, 0], [0.7, 0, -3, 0], [1, 0, 0, 0]] },
    upperArmL: { keys: [[0, 0, 0, -6], [0.5, 0, 0, -9], [1, 0, 0, -6]] },
    upperArmR: { keys: [[0, 0, 0, 6], [0.5, 0, 0, 9], [1, 0, 0, 6]] },
    /* NEGATIVE. On this rig a positive lower arm is HYPEREXTENSION --
       the forearm swinging backwards past straight -- and every clip in
       this file had it positive, 59 keys of it, up to +86 in the crawl.
       An arm at rest hangs with the elbow a little flexed, which is a
       small NEGATIVE number. */
    lowerArmL: { keys: [[0, -13, 0, 0], [0.5, -17, 0, 0], [1, -13, 0, 0]] },
    lowerArmR: { keys: [[0, -13, 0, 0], [0.5, -17, 0, 0], [1, -13, 0, 0]] },
  }));

  /* WALK AND RUN.
     ================================================================
     "Every animation is cartoonish." Four reasons, and they are all in
     the numbers rather than in the taste:

       THE ARMS SWING WITH THE WRONG LEG. upperArmL was -24 at the same
       instant upperLegL was +26 -- and on this rig a positive upper arm
       is BACK while a positive upper leg is FORWARD, so the left arm
       went forward with the left leg. Same side, same time, for the
       walk and the run both. That is a toy soldier, and it is the
       single loudest wrong thing a walk cycle can do.

       THE PELVIS WAS NAILED TO ONE HEIGHT. No position track at all, so
       the hips never rose or fell and the whole man glided. A real walk
       lifts the body about 46mm twice a cycle, at each mid-stance, and
       a run about 70mm.

       THE KNEES BARELY BENT. Peak swing flexion was 42 degrees walking
       and 78 running, against a measured 60-65 and 100-120. Stiff legs
       swinging from long hips is a march.

       THE TORSO WAS A PLANK. No transverse rotation anywhere: the
       pelvis and the shoulder girdle counter-rotate against each other
       through the whole of gait, and without it the arms look bolted
       to a post.

     Everything below is the Winter gait tables rounded to the degree:
     hip +28/-12 walking and +55/-20 running, knee 5/62 and 22/112,
     ankle -9/+14 and -18/+26, pelvic list 4 degrees and rotation 4,
     stance 62 per cent of the cycle. Phase convention is the sprint's:
     t=0 is left foot strike. */

  /* ------------------------------------------------------------------
     LOCOMOTION. Every cycle below -- walk, run, sprint and the two
     crouches -- is GENERATED from where the foot goes, not written as a
     table of hip and knee degrees. Two things forced that.

     The first is that the hand-written ones were mirrored. Two comments
     in this file asserted that a positive upper leg is forward. It is
     not: upperLegL.x = +20 puts that foot at z -0.280, which is BEHIND.
     Measured across the finished clips, neither foot in the walk ever
     reached in front of the pelvis (z -0.59..-0.02) and neither did in
     the run (-0.77..-0.12). Both men were being dragged along by the
     shoulders. The arms were mirrored by the same wrong belief, which is
     why the contralateral check in gait.test.js still passed: two
     errors, one on each limb, cancelling in the correlation.

     The second is that angles cannot express the thing that matters. A
     planted foot must not move, must not sink through the floor, and
     must be somewhere the leg can actually reach. Those are properties
     of the foot's PATH; write angles and you are guessing at all three
     at once. So the path is the input -- planted and carried backwards
     through stance, arcing clear through swing, its height solved from
     its own pitch so whichever end of the sole is lower rests exactly on
     the floor -- and the hip and knee are solved to put the ankle on it.

     The pelvis height is solved too, from the stance knee: given where
     the planted ankle is and how far the knee over it is bent, the hip
     can only be in one place. Author the shock absorber (19 degrees of
     knee in a walk, 43 in a run) and the bob falls out of it -- 57 mm
     for the walk, 88 for the run, which is what a person does. In the
     air, where no leg constrains anything, the gap is bridged with the
     parabola gravity draws.

     Measured on the result: no foot anywhere in the five clips goes
     below the floor, and no leg is asked for more than 99.7% of its own
     length. See engine/test/motion.test.js, which holds all of it.
     ------------------------------------------------------------------ */
  clips.push(buildClip('walk', 0.9, {
    hips: {
      keys: [[0.00, 4, -4, 0], [0.05, 4, -3.2, 0.6], [0.10, 4, -2.4, 1.2], [0.15, 4, -1.6, 1.8],
                 [0.20, 4, -0.8, 2.4], [0.25, 4, 0, 3], [0.30, 4, 0.8, 2.4], [0.35, 4, 1.6, 1.8],
                 [0.40, 4, 2.4, 1.2], [0.45, 4, 3.2, 0.6], [0.50, 4, 4, 0], [0.55, 4, 3.2, -0.6],
                 [0.60, 4, 2.4, -1.2], [0.65, 4, 1.6, -1.8], [0.70, 4, 0.8, -2.4],
                 [0.75, 4, 0, -3], [0.80, 4, -0.8, -2.4], [0.85, 4, -1.6, -1.8],
                 [0.90, 4, -2.4, -1.2], [0.95, 4, -3.2, -0.6], [1.00, 4, -4, 0]],
      pos: [[0.00, 0, -0.049, 0], [0.05, 0.004, -0.057, 0], [0.10, 0.007, -0.057, 0],
                 [0.15, 0.011, -0.05, 0], [0.20, 0.014, -0.038, 0], [0.25, 0.018, -0.025, 0],
                 [0.30, 0.014, -0.018, 0], [0.35, 0.011, -0.017, 0], [0.40, 0.007, -0.024, 0],
                 [0.45, 0.004, -0.037, 0], [0.50, 0, -0.049, 0], [0.55, -0.004, -0.057, 0],
                 [0.60, -0.007, -0.057, 0], [0.65, -0.011, -0.05, 0], [0.70, -0.014, -0.038, 0],
                 [0.75, -0.018, -0.025, 0], [0.80, -0.014, -0.018, 0], [0.85, -0.011, -0.017, 0],
                 [0.90, -0.007, -0.024, 0], [0.95, -0.004, -0.037, 0], [1.00, 0, -0.049, 0]],
    },
    spine: { keys: [[0.00, 0.9, 1.8, 0], [0.13, 0.9, 0.9, -0.4], [0.25, 0.9, 0, -0.9], [0.38, 0.9, -0.9, -0.4], [0.50, 0.9, -1.8, 0], [0.63, 0.9, -0.9, 0.4], [0.75, 0.9, 0, 0.9], [0.88, 0.9, 0.9, 0.4], [1.00, 0.9, 1.8, 0]] },
    chest: { keys: [[0.00, 0.6, 3.3, 0], [0.13, 0.6, 1.6, -0.7], [0.25, 0.6, 0, -1.4], [0.38, 0.6, -1.6, -0.7], [0.50, 0.6, -3.3, 0], [0.63, 0.6, -1.6, 0.7], [0.75, 0.6, 0, 1.4], [0.88, 0.6, 1.6, 0.7], [1.00, 0.6, 3.3, 0]] },
    neck: { keys: [[0.00, -2.5, -1.5, 0], [0.13, -2.5, -0.8, 0.6], [0.25, -2.5, 0, 1.2], [0.38, -2.5, 0.8, 0.6], [0.50, -2.5, 1.5, 0], [0.63, -2.5, 0.8, -0.6], [0.75, -2.5, 0, -1.2], [0.88, -2.5, -0.8, -0.6], [1.00, -2.5, -1.5, 0]] },
    head: { keys: [[0.00, -1.2, -1.1, 0], [0.13, -1.2, -0.6, 0.4], [0.25, -1.2, 0, 0.7], [0.38, -1.2, 0.6, 0.4], [0.50, -1.2, 1.1, 0], [0.63, -1.2, 0.6, -0.4], [0.75, -1.2, 0, -0.7], [0.88, -1.2, -0.6, -0.4], [1.00, -1.2, -1.1, 0]] },
    upperLegL: { keys: [[0.00, -32.7, 0, 0], [0.05, -35, 0, 0], [0.10, -34.7, 0, 0], [0.15, -31.9, 0, 0],
             [0.20, -27.3, 0, 0], [0.25, -21.8, 0, 0], [0.30, -16.6, 0, 0], [0.35, -12.6, 0, 0],
             [0.40, -11.1, 0, 0], [0.45, -10.3, 0, 0], [0.50, -8.8, 0, 0], [0.55, -6.9, 0, 0],
             [0.60, -3.6, 0, 0], [0.65, -6, 0, 0], [0.70, -15.6, 0, 0], [0.75, -27.8, 0, 0],
             [0.80, -37.7, 0, 0], [0.85, -39.7, 0, 0], [0.90, -38.7, 0, 0], [0.95, -35.9, 0, 0],
             [1.00, -32.7, 0, 0]] },
    lowerLegL: { keys: [[0.00, 17.4, 0, 0], [0.05, 28.9, 0, 0], [0.10, 35.3, 0, 0], [0.15, 37, 0, 0],
             [0.20, 35.1, 0, 0], [0.25, 31.4, 0, 0], [0.30, 28, 0, 0], [0.35, 26.9, 0, 0],
             [0.40, 31.1, 0, 0], [0.45, 37.3, 0, 0], [0.50, 41.8, 0, 0], [0.55, 45.4, 0, 0],
             [0.60, 45.2, 0, 0], [0.65, 53.2, 0, 0], [0.70, 65.2, 0, 0], [0.75, 72.7, 0, 0],
             [0.80, 70.2, 0, 0], [0.85, 53.5, 0, 0], [0.90, 36.3, 0, 0], [0.95, 22.5, 0, 0],
             [1.00, 17.4, 0, 0]] },
    footL: { keys: [[0.00, 3.3, 0, 0], [0.05, 0.8, 0, 0], [0.10, -4.2, 0, 0], [0.15, -8.3, 0, 0],
             [0.20, -10.5, 0, 0], [0.25, -11.7, 0, 0], [0.30, -13, 0, 0], [0.35, -15.5, 0, 0],
             [0.40, -18.5, 0, 0], [0.45, -20.8, 0, 0], [0.50, -21.7, 0, 0], [0.55, -18.8, 0, 0],
             [0.60, -13.8, 0, 0], [0.65, -5.4, 0, 0], [0.70, -4, 0, 0], [0.75, -6.1, 0, 0],
             [0.80, -8.3, 0, 0], [0.85, -10.1, 0, 0], [0.90, -10.7, 0, 0], [0.95, -8.2, 0, 0],
             [1.00, 3.3, 0, 0]] },
    upperLegR: { keys: [[0.00, -8.8, 0, 0], [0.05, -6.9, 0, 0], [0.10, -3.6, 0, 0], [0.15, -6, 0, 0],
             [0.20, -15.6, 0, 0], [0.25, -27.8, 0, 0], [0.30, -37.7, 0, 0], [0.35, -39.7, 0, 0],
             [0.40, -38.7, 0, 0], [0.45, -35.9, 0, 0], [0.50, -32.7, 0, 0], [0.55, -35, 0, 0],
             [0.60, -34.7, 0, 0], [0.65, -31.9, 0, 0], [0.70, -27.3, 0, 0], [0.75, -21.8, 0, 0],
             [0.80, -16.6, 0, 0], [0.85, -12.6, 0, 0], [0.90, -11.1, 0, 0], [0.95, -10.3, 0, 0],
             [1.00, -8.8, 0, 0]] },
    lowerLegR: { keys: [[0.00, 41.8, 0, 0], [0.05, 45.4, 0, 0], [0.10, 45.2, 0, 0], [0.15, 53.2, 0, 0],
             [0.20, 65.2, 0, 0], [0.25, 72.7, 0, 0], [0.30, 70.2, 0, 0], [0.35, 53.5, 0, 0],
             [0.40, 36.3, 0, 0], [0.45, 22.5, 0, 0], [0.50, 17.4, 0, 0], [0.55, 28.9, 0, 0],
             [0.60, 35.3, 0, 0], [0.65, 37, 0, 0], [0.70, 35.1, 0, 0], [0.75, 31.4, 0, 0],
             [0.80, 28, 0, 0], [0.85, 26.9, 0, 0], [0.90, 31.1, 0, 0], [0.95, 37.3, 0, 0],
             [1.00, 41.8, 0, 0]] },
    footR: { keys: [[0.00, -21.7, 0, 0], [0.05, -18.8, 0, 0], [0.10, -13.8, 0, 0], [0.15, -5.4, 0, 0],
             [0.20, -4, 0, 0], [0.25, -6.1, 0, 0], [0.30, -8.3, 0, 0], [0.35, -10.1, 0, 0],
             [0.40, -10.7, 0, 0], [0.45, -8.2, 0, 0], [0.50, 3.3, 0, 0], [0.55, 0.8, 0, 0],
             [0.60, -4.2, 0, 0], [0.65, -8.3, 0, 0], [0.70, -10.5, 0, 0], [0.75, -11.7, 0, 0],
             [0.80, -13, 0, 0], [0.85, -15.5, 0, 0], [0.90, -18.5, 0, 0], [0.95, -20.8, 0, 0],
             [1.00, -21.7, 0, 0]] },
    shoulderL: { keys: [[0.00, 0, 2.5, 1.5], [0.13, 0, 1.3, 1.5], [0.25, 0, 0, 1.5], [0.38, 0, -1.3, 1.5], [0.50, 0, -2.5, 1.5], [0.63, 0, -1.3, 1.5], [0.75, 0, 0, 1.5], [0.88, 0, 1.3, 1.5], [1.00, 0, 2.5, 1.5]] },
    shoulderR: { keys: [[0.00, 0, 2.5, -1.5], [0.13, 0, 1.3, -1.5], [0.25, 0, 0, -1.5], [0.38, 0, -1.3, -1.5], [0.50, 0, -2.5, -1.5], [0.63, 0, -1.3, -1.5], [0.75, 0, 0, -1.5], [0.88, 0, 1.3, -1.5], [1.00, 0, 2.5, -1.5]] },
    upperArmL: { keys: [[0.00, 14, 0, 7], [0.13, 7, 0, 7], [0.25, 0, 0, 7], [0.38, -10, 0, 7], [0.50, -20, 0, 7], [0.63, -10, 0, 7], [0.75, 0, 0, 7], [0.88, 7, 0, 7], [1.00, 14, 0, 7]] },
    lowerArmL: { keys: [[0.00, -20, 0, 0], [0.13, -23.5, 0, 0], [0.25, -27, 0, 0], [0.38, -30.5, 0, 0], [0.50, -34, 0, 0], [0.63, -30.5, 0, 0], [0.75, -27, 0, 0], [0.88, -23.5, 0, 0], [1.00, -20, 0, 0]] },
    handL: { keys: [[0.00, -6, 0, 4], [0.13, -3, 0, 4], [0.25, 0, 0, 4], [0.38, 3, 0, 4], [0.50, 6, 0, 4], [0.63, 3, 0, 4], [0.75, 0, 0, 4], [0.88, -3, 0, 4], [1.00, -6, 0, 4]] },
    upperArmR: { keys: [[0.00, -20, 0, -7], [0.13, -10, 0, -7], [0.25, 0, 0, -7], [0.38, 7, 0, -7], [0.50, 14, 0, -7], [0.63, 7, 0, -7], [0.75, 0, 0, -7], [0.88, -10, 0, -7], [1.00, -20, 0, -7]] },
    lowerArmR: { keys: [[0.00, -34, 0, 0], [0.13, -30.5, 0, 0], [0.25, -27, 0, 0], [0.38, -23.5, 0, 0], [0.50, -20, 0, 0], [0.63, -23.5, 0, 0], [0.75, -27, 0, 0], [0.88, -30.5, 0, 0], [1.00, -34, 0, 0]] },
    handR: { keys: [[0.00, 6, 0, -4], [0.13, 3, 0, -4], [0.25, 0, 0, -4], [0.38, -3, 0, -4], [0.50, -6, 0, -4], [0.63, -3, 0, -4], [0.75, 0, 0, -4], [0.88, 3, 0, -4], [1.00, 6, 0, -4]] },
  }, { stride: 0.98 }));

  clips.push(buildClip('run', 0.7, {
    hips: {
      keys: [[0.00, 9, -6.5, 0], [0.05, 9, -5.2, 0.8], [0.10, 9, -3.9, 1.6], [0.15, 9, -2.6, 2.4],
                 [0.20, 9, -1.3, 3.2], [0.25, 9, 0, 4], [0.30, 9, 1.3, 3.2], [0.35, 9, 2.6, 2.4],
                 [0.40, 9, 3.9, 1.6], [0.45, 9, 5.2, 0.8], [0.50, 9, 6.5, 0], [0.55, 9, 5.2, -0.8],
                 [0.60, 9, 3.9, -1.6], [0.65, 9, 2.6, -2.4], [0.70, 9, 1.3, -3.2],
                 [0.75, 9, 0, -4], [0.80, 9, -1.3, -3.2], [0.85, 9, -2.6, -2.4],
                 [0.90, 9, -3.9, -1.6], [0.95, 9, -5.2, -0.8], [1.00, 9, -6.5, 0]],
      pos: [[0.00, 0, -0.096, 0], [0.05, 0.003, -0.079, 0], [0.10, 0.005, -0.064, 0],
                 [0.15, 0.008, -0.057, 0], [0.20, 0.01, -0.061, 0], [0.25, 0.013, -0.074, 0],
                 [0.30, 0.01, -0.091, 0], [0.35, 0.008, -0.106, 0], [0.40, 0.005, -0.113, 0],
                 [0.45, 0.003, -0.109, 0], [0.50, 0, -0.096, 0], [0.55, -0.003, -0.079, 0],
                 [0.60, -0.005, -0.064, 0], [0.65, -0.008, -0.057, 0], [0.70, -0.01, -0.061, 0],
                 [0.75, -0.013, -0.074, 0], [0.80, -0.01, -0.091, 0], [0.85, -0.008, -0.106, 0],
                 [0.90, -0.005, -0.113, 0], [0.95, -0.003, -0.109, 0], [1.00, 0, -0.096, 0]],
    },
    spine: { keys: [[0.00, 2, 3.1, 0], [0.13, 2, 1.6, -0.6], [0.25, 2, 0, -1.2], [0.38, 2, -1.6, -0.6], [0.50, 2, -3.1, 0], [0.63, 2, -1.6, 0.6], [0.75, 2, 0, 1.2], [0.88, 2, 1.6, 0.6], [1.00, 2, 3.1, 0]] },
    chest: { keys: [[0.00, 1.4, 5.9, 0], [0.13, 1.4, 2.9, -0.9], [0.25, 1.4, 0, -1.8], [0.38, 1.4, -2.9, -0.9], [0.50, 1.4, -5.9, 0], [0.63, 1.4, -2.9, 0.9], [0.75, 1.4, 0, 1.8], [0.88, 1.4, 2.9, 0.9], [1.00, 1.4, 5.9, 0]] },
    neck: { keys: [[0.00, -5.6, -2.7, 0], [0.13, -5.6, -1.3, 0.9], [0.25, -5.6, 0, 1.8], [0.38, -5.6, 1.3, 0.9], [0.50, -5.6, 2.7, 0], [0.63, -5.6, 1.3, -0.9], [0.75, -5.6, 0, -1.8], [0.88, -5.6, -1.3, -0.9], [1.00, -5.6, -2.7, 0]] },
    head: { keys: [[0.00, -3.8, -2, 0], [0.13, -3.8, -1, 0.5], [0.25, -3.8, 0, 1.1], [0.38, -3.8, 1, 0.5], [0.50, -3.8, 2, 0], [0.63, -3.8, 1, -0.5], [0.75, -3.8, 0, -1.1], [0.88, -3.8, -1, -0.5], [1.00, -3.8, -2, 0]] },
    upperLegL: { keys: [[0.00, -49.1, 0, 0], [0.05, -41.4, 0, 0], [0.10, -32.7, 0, 0], [0.15, -25.5, 0, 0],
             [0.20, -19.6, 0, 0], [0.25, -13.2, 0, 0], [0.30, -5.1, 0, 0], [0.35, 4.2, 0, 0],
             [0.40, 16.4, 0, 0], [0.45, 22.6, 0, 0], [0.50, 15.1, 0, 0], [0.55, 4.5, 0, 0],
             [0.60, -8.9, 0, 0], [0.65, -24.5, 0, 0], [0.70, -40.8, 0, 0], [0.75, -54.1, 0, 0],
             [0.80, -60.8, 0, 0], [0.85, -60.4, 0, 0], [0.90, -57.5, 0, 0], [0.95, -53.4, 0, 0],
             [1.00, -49.1, 0, 0]] },
    lowerLegL: { keys: [[0.00, 51.6, 0, 0], [0.05, 50.5, 0, 0], [0.10, 46.7, 0, 0], [0.15, 45.9, 0, 0],
             [0.20, 47.6, 0, 0], [0.25, 48.4, 0, 0], [0.30, 45.6, 0, 0], [0.35, 39.5, 0, 0],
             [0.40, 25.8, 0, 0], [0.45, 23, 0, 0], [0.50, 43, 0, 0], [0.55, 62.2, 0, 0],
             [0.60, 79.6, 0, 0], [0.65, 93.2, 0, 0], [0.70, 100.4, 0, 0], [0.75, 98.5, 0, 0],
             [0.80, 88.4, 0, 0], [0.85, 72.6, 0, 0], [0.90, 59.5, 0, 0], [0.95, 51.5, 0, 0],
             [1.00, 51.6, 0, 0]] },
    footL: { keys: [[0.00, -7.5, 0, 0], [0.05, -16.1, 0, 0], [0.10, -22.7, 0, 0], [0.15, -25, 0, 0],
             [0.20, -25, 0, 0], [0.25, -25, 0, 0], [0.30, -25, 0, 0], [0.35, -20.6, 0, 0],
             [0.40, -9.2, 0, 0], [0.45, -3.2, 0, 0], [0.50, -1.2, 0, 0], [0.55, -3.1, 0, 0],
             [0.60, -6.1, 0, 0], [0.65, -9.2, 0, 0], [0.70, -12.2, 0, 0], [0.75, -14.1, 0, 0],
             [0.80, -14.5, 0, 0], [0.85, -14.9, 0, 0], [0.90, -15.3, 0, 0], [0.95, -11.8, 0, 0],
             [1.00, -7.5, 0, 0]] },
    upperLegR: { keys: [[0.00, 15.1, 0, 0], [0.05, 4.5, 0, 0], [0.10, -8.9, 0, 0], [0.15, -24.5, 0, 0],
             [0.20, -40.8, 0, 0], [0.25, -54.1, 0, 0], [0.30, -60.8, 0, 0], [0.35, -60.4, 0, 0],
             [0.40, -57.5, 0, 0], [0.45, -53.4, 0, 0], [0.50, -49.1, 0, 0], [0.55, -41.4, 0, 0],
             [0.60, -32.7, 0, 0], [0.65, -25.5, 0, 0], [0.70, -19.6, 0, 0], [0.75, -13.2, 0, 0],
             [0.80, -5.1, 0, 0], [0.85, 4.2, 0, 0], [0.90, 16.4, 0, 0], [0.95, 22.6, 0, 0],
             [1.00, 15.1, 0, 0]] },
    lowerLegR: { keys: [[0.00, 43, 0, 0], [0.05, 62.2, 0, 0], [0.10, 79.6, 0, 0], [0.15, 93.2, 0, 0],
             [0.20, 100.4, 0, 0], [0.25, 98.5, 0, 0], [0.30, 88.4, 0, 0], [0.35, 72.6, 0, 0],
             [0.40, 59.5, 0, 0], [0.45, 51.5, 0, 0], [0.50, 51.6, 0, 0], [0.55, 50.5, 0, 0],
             [0.60, 46.7, 0, 0], [0.65, 45.9, 0, 0], [0.70, 47.6, 0, 0], [0.75, 48.4, 0, 0],
             [0.80, 45.6, 0, 0], [0.85, 39.5, 0, 0], [0.90, 25.8, 0, 0], [0.95, 23, 0, 0],
             [1.00, 43, 0, 0]] },
    footR: { keys: [[0.00, -1.2, 0, 0], [0.05, -3.1, 0, 0], [0.10, -6.1, 0, 0], [0.15, -9.2, 0, 0],
             [0.20, -12.2, 0, 0], [0.25, -14.1, 0, 0], [0.30, -14.5, 0, 0], [0.35, -14.9, 0, 0],
             [0.40, -15.3, 0, 0], [0.45, -11.8, 0, 0], [0.50, -7.5, 0, 0], [0.55, -16.1, 0, 0],
             [0.60, -22.7, 0, 0], [0.65, -25, 0, 0], [0.70, -25, 0, 0], [0.75, -25, 0, 0],
             [0.80, -25, 0, 0], [0.85, -20.6, 0, 0], [0.90, -9.2, 0, 0], [0.95, -3.2, 0, 0],
             [1.00, -1.2, 0, 0]] },
    shoulderL: { keys: [[0.00, 0, 4, 1.5], [0.13, 0, 2, 1.5], [0.25, 0, 0, 1.5], [0.38, 0, -2, 1.5], [0.50, 0, -4, 1.5], [0.63, 0, -2, 1.5], [0.75, 0, 0, 1.5], [0.88, 0, 2, 1.5], [1.00, 0, 4, 1.5]] },
    shoulderR: { keys: [[0.00, 0, 4, -1.5], [0.13, 0, 2, -1.5], [0.25, 0, 0, -1.5], [0.38, 0, -2, -1.5], [0.50, 0, -4, -1.5], [0.63, 0, -2, -1.5], [0.75, 0, 0, -1.5], [0.88, 0, 2, -1.5], [1.00, 0, 4, -1.5]] },
    upperArmL: { keys: [[0.00, 34, 0, 9], [0.13, 17, 0, 9], [0.25, 0, 0, 9], [0.38, -22, 0, 9], [0.50, -44, 0, 9], [0.63, -22, 0, 9], [0.75, 0, 0, 9], [0.88, 17, 0, 9], [1.00, 34, 0, 9]] },
    lowerArmL: { keys: [[0.00, -64, 0, 0], [0.13, -70, 0, 0], [0.25, -76, 0, 0], [0.38, -82, 0, 0], [0.50, -88, 0, 0], [0.63, -82, 0, 0], [0.75, -76, 0, 0], [0.88, -70, 0, 0], [1.00, -64, 0, 0]] },
    handL: { keys: [[0.00, -6, 0, 4], [0.13, -3, 0, 4], [0.25, 0, 0, 4], [0.38, 3, 0, 4], [0.50, 6, 0, 4], [0.63, 3, 0, 4], [0.75, 0, 0, 4], [0.88, -3, 0, 4], [1.00, -6, 0, 4]] },
    upperArmR: { keys: [[0.00, -44, 0, -9], [0.13, -22, 0, -9], [0.25, 0, 0, -9], [0.38, 17, 0, -9], [0.50, 34, 0, -9], [0.63, 17, 0, -9], [0.75, 0, 0, -9], [0.88, -22, 0, -9], [1.00, -44, 0, -9]] },
    lowerArmR: { keys: [[0.00, -88, 0, 0], [0.13, -82, 0, 0], [0.25, -76, 0, 0], [0.38, -70, 0, 0], [0.50, -64, 0, 0], [0.63, -70, 0, 0], [0.75, -76, 0, 0], [0.88, -82, 0, 0], [1.00, -88, 0, 0]] },
    handR: { keys: [[0.00, 6, 0, -4], [0.13, 3, 0, -4], [0.25, 0, 0, -4], [0.38, -3, 0, -4], [0.50, -6, 0, -4], [0.63, -3, 0, -4], [0.75, 0, 0, -4], [0.88, 3, 0, -4], [1.00, 6, 0, -4]] },
  }, { stride: 1.78 }));

  /* A sprint is not a fast run, and speeding the run clip up does not
     make one. Three things separate them and all three are geometry,
     not tempo:

       - The heel snaps to the backside. A sprinter's recovering shin
         folds to a hundred and forty degrees so the leg swings through
         as a SHORT pendulum; a jogger's stays at forty and swings
         through as a long one. This is the single strongest read, and
         it is why a sped-up run looks like a cartoon: the legs go
         round faster but they never fold.
       - There is a flight phase. Both feet leave the ground once per
         step, so the hips rise and fall twice a cycle. A rotation-only
         cycle keeps the pelvis nailed at one height and the whole
         thing reads as a man on rails.
       - The trunk leans and the head does not. Twenty-six degrees of
         forward lean through hips, spine and chest, and then the neck
         takes sixteen of it back so the eyes stay on the horizon.

     Arms drive from the shoulder with the elbow locked near a right
     angle, hand travelling hip to cheek. The pelvis counter-rotates
     against the shoulders -- eight degrees each way, opposed -- which
     is what stops the torso reading as a plank bolted to the legs.

     Phase convention matches walk and run: t=0 is left leg forward. */
  clips.push(buildClip('sprint', 0.5, {
    hips: {
      keys: [[0.00, 15, -8.5, 0], [0.05, 15, -6.8, 1], [0.10, 15, -5.1, 2], [0.15, 15, -3.4, 3],
                 [0.20, 15, -1.7, 4], [0.25, 15, 0, 5], [0.30, 15, 1.7, 4], [0.35, 15, 3.4, 3],
                 [0.40, 15, 5.1, 2], [0.45, 15, 6.8, 1], [0.50, 15, 8.5, 0], [0.55, 15, 6.8, -1],
                 [0.60, 15, 5.1, -2], [0.65, 15, 3.4, -3], [0.70, 15, 1.7, -4], [0.75, 15, 0, -5],
                 [0.80, 15, -1.7, -4], [0.85, 15, -3.4, -3], [0.90, 15, -5.1, -2],
                 [0.95, 15, -6.8, -1], [1.00, 15, -8.5, 0]],
      pos: [[0.00, 0, -0.061, 0], [0.05, 0.002, -0.052, 0], [0.10, 0.004, -0.058, 0],
                 [0.15, 0.005, -0.076, 0], [0.20, 0.007, -0.099, 0], [0.25, 0.009, -0.119, 0],
                 [0.30, 0.007, -0.128, 0], [0.35, 0.005, -0.122, 0], [0.40, 0.004, -0.104, 0],
                 [0.45, 0.002, -0.081, 0], [0.50, 0, -0.061, 0], [0.55, -0.002, -0.052, 0],
                 [0.60, -0.004, -0.058, 0], [0.65, -0.005, -0.076, 0], [0.70, -0.007, -0.099, 0],
                 [0.75, -0.009, -0.119, 0], [0.80, -0.007, -0.128, 0], [0.85, -0.005, -0.122, 0],
                 [0.90, -0.004, -0.104, 0], [0.95, -0.002, -0.081, 0], [1.00, 0, -0.061, 0]],
    },
    spine: { keys: [[0.00, 3.3, 4.2, 0], [0.13, 3.3, 2.1, -0.8], [0.25, 3.3, 0, -1.5], [0.38, 3.3, -2.1, -0.8], [0.50, 3.3, -4.2, 0], [0.63, 3.3, -2.1, 0.8], [0.75, 3.3, 0, 1.5], [0.88, 3.3, 2.1, 0.8], [1.00, 3.3, 4.2, 0]] },
    chest: { keys: [[0.00, 2.4, 7.8, 0], [0.13, 2.4, 3.9, -1.1], [0.25, 2.4, 0, -2.3], [0.38, 2.4, -3.9, -1.1], [0.50, 2.4, -7.8, 0], [0.63, 2.4, -3.9, 1.1], [0.75, 2.4, 0, 2.3], [0.88, 2.4, 3.9, 1.1], [1.00, 2.4, 7.8, 0]] },
    neck: { keys: [[0.00, -9.3, -3.6, 0], [0.13, -9.3, -1.8, 1.1], [0.25, -9.3, 0, 2.2], [0.38, -9.3, 1.8, 1.1], [0.50, -9.3, 3.6, 0], [0.63, -9.3, 1.8, -1.1], [0.75, -9.3, 0, -2.2], [0.88, -9.3, -1.8, -1.1], [1.00, -9.3, -3.6, 0]] },
    head: { keys: [[0.00, -7.8, -2.6, 0], [0.13, -7.8, -1.3, 0.7], [0.25, -7.8, 0, 1.3], [0.38, -7.8, 1.3, 0.7], [0.50, -7.8, 2.6, 0], [0.63, -7.8, 1.3, -0.7], [0.75, -7.8, 0, -1.3], [0.88, -7.8, -1.3, -0.7], [1.00, -7.8, -2.6, 0]] },
    upperLegL: { keys: [[0.00, -51.9, 0, 0], [0.05, -41.9, 0, 0], [0.10, -31.7, 0, 0], [0.15, -25.2, 0, 0],
             [0.20, -14.8, 0, 0], [0.25, -0.8, 0, 0], [0.30, 17.9, 0, 0], [0.35, 22.1, 0, 0],
             [0.40, 22.1, 0, 0], [0.45, 17.6, 0, 0], [0.50, 8.3, 0, 0], [0.55, -5.2, 0, 0],
             [0.60, -23.1, 0, 0], [0.65, -45.5, 0, 0], [0.70, -67.9, 0, 0], [0.75, -78.6, 0, 0],
             [0.80, -77, 0, 0], [0.85, -70.5, 0, 0], [0.90, -63.6, 0, 0], [0.95, -54.1, 0, 0],
             [1.00, -51.9, 0, 0]] },
    lowerLegL: { keys: [[0.00, 48.2, 0, 0], [0.05, 47.9, 0, 0], [0.10, 46.8, 0, 0], [0.15, 53.2, 0, 0],
             [0.20, 51.8, 0, 0], [0.25, 41.5, 0, 0], [0.30, 18, 0, 0], [0.35, 32, 0, 0],
             [0.40, 48.1, 0, 0], [0.45, 64.7, 0, 0], [0.50, 82.6, 0, 0], [0.55, 100.5, 0, 0],
             [0.60, 116.4, 0, 0], [0.65, 126.9, 0, 0], [0.70, 125.9, 0, 0], [0.75, 111.7, 0, 0],
             [0.80, 90.1, 0, 0], [0.85, 68.7, 0, 0], [0.90, 53, 0, 0], [0.95, 39.9, 0, 0],
             [1.00, 48.2, 0, 0]] },
    footL: { keys: [[0.00, 2.7, 0, 0], [0.05, -12.6, 0, 0], [0.10, -24.7, 0, 0], [0.15, -25, 0, 0],
             [0.20, -25, 0, 0], [0.25, -20.5, 0, 0], [0.30, -1, 0, 0], [0.35, 2.7, 0, 0],
             [0.40, 2.6, 0, 0], [0.45, -0.7, 0, 0], [0.50, -4.3, 0, 0], [0.55, -7.9, 0, 0],
             [0.60, -11.4, 0, 0], [0.65, -15, 0, 0], [0.70, -16.4, 0, 0], [0.75, -17, 0, 0],
             [0.80, -17.6, 0, 0], [0.85, -18.2, 0, 0], [0.90, -16.5, 0, 0], [0.95, -7.2, 0, 0],
             [1.00, 2.7, 0, 0]] },
    upperLegR: { keys: [[0.00, 8.3, 0, 0], [0.05, -5.2, 0, 0], [0.10, -23.1, 0, 0], [0.15, -45.5, 0, 0],
             [0.20, -67.9, 0, 0], [0.25, -78.6, 0, 0], [0.30, -77, 0, 0], [0.35, -70.5, 0, 0],
             [0.40, -63.6, 0, 0], [0.45, -54.1, 0, 0], [0.50, -51.9, 0, 0], [0.55, -41.9, 0, 0],
             [0.60, -31.7, 0, 0], [0.65, -25.2, 0, 0], [0.70, -14.8, 0, 0], [0.75, -0.8, 0, 0],
             [0.80, 17.9, 0, 0], [0.85, 22.1, 0, 0], [0.90, 22.1, 0, 0], [0.95, 17.6, 0, 0],
             [1.00, 8.3, 0, 0]] },
    lowerLegR: { keys: [[0.00, 82.6, 0, 0], [0.05, 100.5, 0, 0], [0.10, 116.4, 0, 0], [0.15, 126.9, 0, 0],
             [0.20, 125.9, 0, 0], [0.25, 111.7, 0, 0], [0.30, 90.1, 0, 0], [0.35, 68.7, 0, 0],
             [0.40, 53, 0, 0], [0.45, 39.9, 0, 0], [0.50, 48.2, 0, 0], [0.55, 47.9, 0, 0],
             [0.60, 46.8, 0, 0], [0.65, 53.2, 0, 0], [0.70, 51.8, 0, 0], [0.75, 41.5, 0, 0],
             [0.80, 18, 0, 0], [0.85, 32, 0, 0], [0.90, 48.1, 0, 0], [0.95, 64.7, 0, 0],
             [1.00, 82.6, 0, 0]] },
    footR: { keys: [[0.00, -4.3, 0, 0], [0.05, -7.9, 0, 0], [0.10, -11.4, 0, 0], [0.15, -15, 0, 0],
             [0.20, -16.4, 0, 0], [0.25, -17, 0, 0], [0.30, -17.6, 0, 0], [0.35, -18.2, 0, 0],
             [0.40, -16.5, 0, 0], [0.45, -7.2, 0, 0], [0.50, 2.7, 0, 0], [0.55, -12.6, 0, 0],
             [0.60, -24.7, 0, 0], [0.65, -25, 0, 0], [0.70, -25, 0, 0], [0.75, -20.5, 0, 0],
             [0.80, -1, 0, 0], [0.85, 2.7, 0, 0], [0.90, 2.6, 0, 0], [0.95, -0.7, 0, 0],
             [1.00, -4.3, 0, 0]] },
    shoulderL: { keys: [[0.00, 0, 6, 1.5], [0.13, 0, 3, 1.5], [0.25, 0, 0, 1.5], [0.38, 0, -3, 1.5], [0.50, 0, -6, 1.5], [0.63, 0, -3, 1.5], [0.75, 0, 0, 1.5], [0.88, 0, 3, 1.5], [1.00, 0, 6, 1.5]] },
    shoulderR: { keys: [[0.00, 0, 6, -1.5], [0.13, 0, 3, -1.5], [0.25, 0, 0, -1.5], [0.38, 0, -3, -1.5], [0.50, 0, -6, -1.5], [0.63, 0, -3, -1.5], [0.75, 0, 0, -1.5], [0.88, 0, 3, -1.5], [1.00, 0, 6, -1.5]] },
    upperArmL: { keys: [[0.00, 52, 0, 11], [0.13, 26, 0, 11], [0.25, 0, 0, 11], [0.38, -37, 0, 11], [0.50, -74, 0, 11], [0.63, -37, 0, 11], [0.75, 0, 0, 11], [0.88, 26, 0, 11], [1.00, 52, 0, 11]] },
    lowerArmL: { keys: [[0.00, -86, 0, 0], [0.13, -91, 0, 0], [0.25, -96, 0, 0], [0.38, -101, 0, 0], [0.50, -106, 0, 0], [0.63, -101, 0, 0], [0.75, -96, 0, 0], [0.88, -91, 0, 0], [1.00, -86, 0, 0]] },
    handL: { keys: [[0.00, -6, 0, 4], [0.13, -3, 0, 4], [0.25, 0, 0, 4], [0.38, 3, 0, 4], [0.50, 6, 0, 4], [0.63, 3, 0, 4], [0.75, 0, 0, 4], [0.88, -3, 0, 4], [1.00, -6, 0, 4]] },
    upperArmR: { keys: [[0.00, -74, 0, -11], [0.13, -37, 0, -11], [0.25, 0, 0, -11], [0.38, 26, 0, -11], [0.50, 52, 0, -11], [0.63, 26, 0, -11], [0.75, 0, 0, -11], [0.88, -37, 0, -11], [1.00, -74, 0, -11]] },
    lowerArmR: { keys: [[0.00, -106, 0, 0], [0.13, -101, 0, 0], [0.25, -96, 0, 0], [0.38, -91, 0, 0], [0.50, -86, 0, 0], [0.63, -91, 0, 0], [0.75, -96, 0, 0], [0.88, -101, 0, 0], [1.00, -106, 0, 0]] },
    handR: { keys: [[0.00, 6, 0, -4], [0.13, 3, 0, -4], [0.25, 0, 0, -4], [0.38, -3, 0, -4], [0.50, -6, 0, -4], [0.63, -3, 0, -4], [0.75, 0, 0, -4], [0.88, 3, 0, -4], [1.00, 6, 0, -4]] },
  }, { stride: 2.5 }));

  /* The slide. A slide is a controlled fall onto the outside of the
     trailing thigh, and the thing that makes a bad one look bad is
     that the pelvis stays at standing height and the legs merely
     splay -- a man doing the splits while gliding. So the hips drop
     fifty-five centimetres in the first fifth of a second, which is
     the entry, and everything else hangs off that.

     Lead leg extends forward and slightly across; trail leg folds
     underneath at a hundred and fifteen degrees and its foot points
     so the toe drags rather than digs. The trunk leans BACK against
     the hips' forward pitch so the net torso reads close to upright,
     which is what keeps the sights anywhere near usable. The off arm
     comes back and out for balance; the gun arm stays in.

     Non-looping, and 0.72s long to match the slide the match rules
     run -- the animation ends exactly when the movement does. */
  clips.push(buildClip('slide', 0.72, {
    hips: {
      keys: [[0.00, -4, 6, 2], [0.22, -20, 24, 11], [0.72, -20, 26, 12],
        [1.00, -12, 18, 7]],
      /* -0.55 put the trailing knee 74mm through the concrete for the
         whole of the slide and the trailing foot 150mm through it on
         the recovery. The pelvis rolls and yaws hard here, so where
         the knee actually ends up is not something to work out on
         paper -- it was measured, and the hips came up 80mm. */
      pos: [[0.00, 0, 0, 0], [0.20, 0, -0.47, 0], [0.80, 0, -0.47, 0],
        [1.00, 0, -0.26, 0]],
    },
    spine: { keys: [[0.00, 0, -4, 0], [0.25, -6, -14, -5], [1.00, -2, -10, -3]] },
    chest: { keys: [[0.00, 0, -2, 0], [0.25, 8, -8, -3], [1.00, 4, -6, -2]] },
    head:  { keys: [[0.00, 0, 0, 0], [0.25, 12, -6, 0], [1.00, 6, -4, 0]] },

    /* Lead leg out front, knee just off straight -- and it was not.
       The comment said "out front" above upperLegL = +82, and on this
       rig a POSITIVE upper leg swings the thigh BACK, so the lead leg
       was raked eighty-two degrees behind him. Solved now, by
       engine/tools/pose-solve.js, for a heel skidding on the floor
       0.60 m in front of the pelvis. */
    upperLegL: { keys: [[0.00, -52.0, 0, 0], [0.20, -62.7, 0, 8], [0.80, -59.0, 0, 8], [1.00, -38.0, 0, 3]] },
    lowerLegL: { keys: [[0.00, 40.1, 0, 0], [0.20, 37.6, 0, 0], [0.80, 28.8, 0, 0], [1.00, 44.0, 0, 0]] },
    footL:     { keys: [[0.00, 16.0, 0, 0], [0.20, 33.1, 0, 0], [0.80, 38.3, 0, 0], [1.00, 10.0, 0, 0]] },

    // Trail leg folded under the body, toe pointed so it drags.
    upperLegR: { keys: [[0.00, 5.0, 0, 0], [0.20, 26.4, 0, -14], [0.80, 26.0, 0, -14], [1.00, 10.0, 0, -5]] },
    /* The recovery key had the trailing knee STRAIGHTENING, which
       drives the shin down: 20 degrees of knee put the foot 170mm
       under, worse than the 50 it replaced. It wants more bend, not
       less -- the leg is coming up under him. */
    lowerLegR: { keys: [[0.00, 85, 0, 0], [0.20, 111.6, 0, 0], [0.80, 110, 0, 0], [1.00, 78, 0, 0]] },
    footR:     { keys: [[0.00, -20, 0, 0], [0.20, -25, 0, 0], [0.80, -24, 0, 0], [1.00, -18, 0, 0]] },

    /* Off arm back and OUT -- and it was going in. A rotation about Z
       sends the left arm's hand to +X, which is away from the body, so
       "out" on the left is POSITIVE and on the right NEGATIVE. Both were
       the other way, and with the elbows now flexing forwards instead of
       backwards the left forearm tracked straight through the ribs. */
    upperArmL: { keys: [[0.00, 0, 0, 10], [0.22, 38, 0, 30], [1.00, 14, 0, 18]] },
    lowerArmL: { keys: [[0.00, -18, 0, 0], [0.22, -44, 0, 0], [1.00, -30, 0, 0]] },
    upperArmR: { keys: [[0.00, -30, 0, -12], [0.22, -46, 0, -20], [1.00, -36, 0, -15]] },
    lowerArmR: { keys: [[0.00, -72, 0, 0], [0.22, -86, 0, 0], [1.00, -78, 0, 0]] },
  }, { loop: false }));

  /* ================================================================
     CROUCHED, AND FLAT
     ================================================================
     Five clips the game had none of, and without them a crouched man
     was a standing man with the camera lowered and a prone man was a
     standing man half inside the floor.

     THE NUMBERS. A deep tactical crouch puts the hips about 0.42m
     below standing, hip flexion around 62 degrees, knee around 88, and
     the trunk pitched 14 forward over them so the weapon stays up. A
     combat crawl takes the hips down 1.02m -- chest on the ground --
     with the lead leg drawn up to about 70 degrees of hip and the
     trailing leg straight, and the whole body rolls 6 degrees onto the
     firing side so the shoulder can take the stock.

     All three crouch clips share the hip and knee base so that walking
     out of a crouched idle does not pop the legs: only the cycle is
     added on top. */

  /* How far the hips drop, in metres. -0.42 with a flat sole needed 64
     degrees of ankle dorsiflexion; an ankle has 25. This is the depth
     the crouch CYCLES solve to, and the sole comes off the floor at the
     heel, which is what a person in a crouch this deep is standing on. */
  const CR_HIP = -0.346;
  clips.push(buildClip('crouchIdle', 3.4, {
    hips: {
      keys: [[0.00, 14, 0, 0], [0.50, 15, 1, 0], [1.00, 14, 0, 0]],
      pos: [[0.00, 0, CR_HIP, 0], [0.50, 0, CR_HIP + 0.012, 0], [1.00, 0, CR_HIP, 0]],
    },
    spine: { keys: [[0.00, -6, 0, 0], [0.50, -7, 1, 0], [1.00, -6, 0, 0]] },
    chest: { keys: [[0.00, -4, 0, 1], [0.50, -3, -1, -1], [1.00, -4, 0, 1]] },
    head:  { keys: [[0.00, -2, 0, 0], [0.35, -2, 4, 0], [0.70, -2, -3, 0], [1.00, -2, 0, 0]] },
    /* THE KNEES POINTED BACKWARDS. A photograph with a post planted at
       +Z settled it: this man was squatting with his thighs raked 76
       degrees BEHIND him and his feet 122mm through the floor, which
       is what "the legs go off the character" looks like when you
       finally stand where you can see it.

       The sign is the whole of it. On this rig a bone's world angle
       is minus the sum of the pelvis key and the bone's own key, so a
       positive upper-leg key swings the thigh BACK. The numbers below
       were solved rather than dialled: with the hips 0.42m down the
       hip joint is at -0.46, the thigh is 0.42 long and the shank
       0.40, and the ankle has to come out at -0.860, which is where
       it rests standing. Thigh 58 degrees forward and shank 64 back
       puts it at -0.858, four millimetres behind the hips. The foot
       key then cancels the shank so the sole is flat. */
    /* Solved, by engine/tools/pose-solve.js, from where the pelvis is
       and where the foot has to be -- the same arithmetic the crouch
       cycles use, so walking out of this idle does not pop the legs.
       The heel is up: at a 122 degree knee the shin rakes 60 degrees
       back, and holding the sole flat from there wanted 64 degrees of
       dorsiflexion against an ankle's 25. */
    upperLegL: { keys: [[0.00, -83.2, 0, 5], [0.50, -82.3, 0, 5], [1.00, -83.2, 0, 5]] },
    upperLegR: { keys: [[0.00, -83.2, 0, -5], [0.50, -82.3, 0, -5], [1.00, -83.2, 0, -5]] },
    lowerLegL: { keys: [[0.00, 121.8, 0, 0], [0.50, 119.8, 0, 0], [1.00, 121.8, 0, 0]] },
    lowerLegR: { keys: [[0.00, 121.8, 0, 0], [0.50, 119.8, 0, 0], [1.00, 121.8, 0, 0]] },
    footL: { keys: [[0.00, -20.5, 0, 0], [0.50, -19.5, 0, 0], [1.00, -20.5, 0, 0]] },
    footR: { keys: [[0.00, -20.5, 0, 0], [0.50, -19.5, 0, 0], [1.00, -20.5, 0, 0]] },
    upperArmL: { keys: [[0.00, 0, 0, -10], [0.50, 0, 0, -12], [1.00, 0, 0, -10]] },
    upperArmR: { keys: [[0.00, 0, 0, 10], [0.50, 0, 0, 12], [1.00, 0, 0, 10]] },
    lowerArmL: { keys: [[0.00, -19, 0, 0], [0.50, -23, 0, 0], [1.00, -19, 0, 0]] },
    lowerArmR: { keys: [[0.00, -19, 0, 0], [0.50, -23, 0, 0], [1.00, -19, 0, 0]] },
  }));

  /* A duck walk: short steps, the hips barely rise, and the trunk
     stays where it is so the sights do not wander. 1.20s because the
     stride is short and the cadence is slow. */
  clips.push(buildClip('crouchWalk', 1.1, {
    hips: {
      keys: [[0.00, 22, -3, 0], [0.05, 22, -2.4, 0.4], [0.10, 22, -1.8, 0.8], [0.15, 22, -1.2, 1.2],
                 [0.20, 22, -0.6, 1.6], [0.25, 22, 0, 2], [0.30, 22, 0.6, 1.6],
                 [0.35, 22, 1.2, 1.2], [0.40, 22, 1.8, 0.8], [0.45, 22, 2.4, 0.4],
                 [0.50, 22, 3, 0], [0.55, 22, 2.4, -0.4], [0.60, 22, 1.8, -0.8],
                 [0.65, 22, 1.2, -1.2], [0.70, 22, 0.6, -1.6], [0.75, 22, 0, -2],
                 [0.80, 22, -0.6, -1.6], [0.85, 22, -1.2, -1.2], [0.90, 22, -1.8, -0.8],
                 [0.95, 22, -2.4, -0.4], [1.00, 22, -3, 0]],
      pos: [[0.00, 0, -0.37, 0], [0.05, 0.004, -0.389, 0], [0.10, 0.008, -0.391, 0],
                 [0.15, 0.012, -0.376, 0], [0.20, 0.016, -0.35, 0], [0.25, 0.02, -0.323, 0],
                 [0.30, 0.016, -0.304, 0], [0.35, 0.012, -0.302, 0], [0.40, 0.008, -0.316, 0],
                 [0.45, 0.004, -0.343, 0], [0.50, 0, -0.37, 0], [0.55, -0.004, -0.389, 0],
                 [0.60, -0.008, -0.391, 0], [0.65, -0.012, -0.376, 0], [0.70, -0.016, -0.35, 0],
                 [0.75, -0.02, -0.323, 0], [0.80, -0.016, -0.304, 0], [0.85, -0.012, -0.302, 0],
                 [0.90, -0.008, -0.316, 0], [0.95, -0.004, -0.343, 0], [1.00, 0, -0.37, 0]],
    },
    spine: { keys: [[0.00, 4.8, 1.2, 0], [0.13, 4.8, 0.6, -0.3], [0.25, 4.8, 0, -0.6], [0.38, 4.8, -0.6, -0.3], [0.50, 4.8, -1.2, 0], [0.63, 4.8, -0.6, 0.3], [0.75, 4.8, 0, 0.6], [0.88, 4.8, 0.6, 0.3], [1.00, 4.8, 1.2, 0]] },
    chest: { keys: [[0.00, 3.5, 2.3, 0], [0.13, 3.5, 1.1, -0.5], [0.25, 3.5, 0, -0.9], [0.38, 3.5, -1.1, -0.5], [0.50, 3.5, -2.3, 0], [0.63, 3.5, -1.1, 0.5], [0.75, 3.5, 0, 0.9], [0.88, 3.5, 1.1, 0.5], [1.00, 3.5, 2.3, 0]] },
    neck: { keys: [[0.00, -13.6, -1.1, 0], [0.13, -13.6, -0.5, 0.5], [0.25, -13.6, 0, 1], [0.38, -13.6, 0.5, 0.5], [0.50, -13.6, 1.1, 0], [0.63, -13.6, 0.5, -0.5], [0.75, -13.6, 0, -1], [0.88, -13.6, -0.5, -0.5], [1.00, -13.6, -1.1, 0]] },
    head: { keys: [[0.00, -15.4, -0.8, 0], [0.13, -15.4, -0.4, 0.3], [0.25, -15.4, 0, 0.6], [0.38, -15.4, 0.4, 0.3], [0.50, -15.4, 0.8, 0], [0.63, -15.4, 0.4, -0.3], [0.75, -15.4, 0, -0.6], [0.88, -15.4, -0.4, -0.3], [1.00, -15.4, -0.8, 0]] },
    upperLegL: { keys: [[0.00, -115.3, 0, 0], [0.05, -115.8, 0, 0], [0.10, -113.3, 0, 0], [0.15, -107.5, 0, 0],
             [0.20, -99.7, 0, 0], [0.25, -91.6, 0, 0], [0.30, -84.5, 0, 0], [0.35, -78.5, 0, 0],
             [0.40, -73.3, 0, 0], [0.45, -67.9, 0, 0], [0.50, -61.6, 0, 0], [0.55, -55.2, 0, 0],
             [0.60, -48.9, 0, 0], [0.65, -42.9, 0, 0], [0.70, -43.1, 0, 0], [0.75, -54.3, 0, 0],
             [0.80, -73.1, 0, 0], [0.85, -91.5, 0, 0], [0.90, -100.8, 0, 0],
             [0.95, -104.8, 0, 0], [1.00, -115.3, 0, 0]] },
    lowerLegL: { keys: [[0.00, 110.7, 0, 0], [0.05, 117.7, 0, 0], [0.10, 122.1, 0, 0], [0.15, 123.6, 0, 0],
             [0.20, 122.6, 0, 0], [0.25, 120.2, 0, 0], [0.30, 118.4, 0, 0], [0.35, 118.5, 0, 0],
             [0.40, 120.5, 0, 0], [0.45, 123.6, 0, 0], [0.50, 125.9, 0, 0], [0.55, 126.5, 0, 0],
             [0.60, 124.1, 0, 0], [0.65, 118.7, 0, 0], [0.70, 117.1, 0, 0], [0.75, 122.6, 0, 0],
             [0.80, 127.7, 0, 0], [0.85, 124.6, 0, 0], [0.90, 114.5, 0, 0], [0.95, 107.4, 0, 0],
             [1.00, 110.7, 0, 0]] },
    footL: { keys: [[0.00, 36.6, 0, 0], [0.05, 31.7, 0, 0], [0.10, 26.2, 0, 0], [0.15, 20.2, 0, 0],
             [0.20, 14.2, 0, 0], [0.25, 9.1, 0, 0], [0.30, 4.5, 0, 0], [0.35, -0.7, 0, 0],
             [0.40, -7.3, 0, 0], [0.45, -14.5, 0, 0], [0.50, -21.9, 0, 0], [0.55, -25, 0, 0],
             [0.60, -25, 0, 0], [0.65, -23.8, 0, 0], [0.70, -5, 0, 0], [0.75, 0.5, 0, 0],
             [0.80, -1.1, 0, 0], [0.85, -2.3, 0, 0], [0.90, -3.6, 0, 0], [0.95, -0.3, 0, 0],
             [1.00, 36.6, 0, 0]] },
    upperLegR: { keys: [[0.00, -61.6, 0, 0], [0.05, -55.2, 0, 0], [0.10, -48.9, 0, 0], [0.15, -42.9, 0, 0],
             [0.20, -43.1, 0, 0], [0.25, -54.3, 0, 0], [0.30, -73.1, 0, 0], [0.35, -91.5, 0, 0],
             [0.40, -100.8, 0, 0], [0.45, -104.8, 0, 0], [0.50, -115.3, 0, 0],
             [0.55, -115.8, 0, 0], [0.60, -113.3, 0, 0], [0.65, -107.5, 0, 0],
             [0.70, -99.7, 0, 0], [0.75, -91.6, 0, 0], [0.80, -84.5, 0, 0], [0.85, -78.5, 0, 0],
             [0.90, -73.3, 0, 0], [0.95, -67.9, 0, 0], [1.00, -61.6, 0, 0]] },
    lowerLegR: { keys: [[0.00, 125.9, 0, 0], [0.05, 126.5, 0, 0], [0.10, 124.1, 0, 0], [0.15, 118.7, 0, 0],
             [0.20, 117.1, 0, 0], [0.25, 122.6, 0, 0], [0.30, 127.7, 0, 0], [0.35, 124.6, 0, 0],
             [0.40, 114.5, 0, 0], [0.45, 107.4, 0, 0], [0.50, 110.7, 0, 0], [0.55, 117.7, 0, 0],
             [0.60, 122.1, 0, 0], [0.65, 123.6, 0, 0], [0.70, 122.6, 0, 0], [0.75, 120.2, 0, 0],
             [0.80, 118.4, 0, 0], [0.85, 118.5, 0, 0], [0.90, 120.5, 0, 0], [0.95, 123.6, 0, 0],
             [1.00, 125.9, 0, 0]] },
    footR: { keys: [[0.00, -21.9, 0, 0], [0.05, -25, 0, 0], [0.10, -25, 0, 0], [0.15, -23.8, 0, 0],
             [0.20, -5, 0, 0], [0.25, 0.5, 0, 0], [0.30, -1.1, 0, 0], [0.35, -2.3, 0, 0],
             [0.40, -3.6, 0, 0], [0.45, -0.3, 0, 0], [0.50, 36.6, 0, 0], [0.55, 31.7, 0, 0],
             [0.60, 26.2, 0, 0], [0.65, 20.2, 0, 0], [0.70, 14.2, 0, 0], [0.75, 9.1, 0, 0],
             [0.80, 4.5, 0, 0], [0.85, -0.7, 0, 0], [0.90, -7.3, 0, 0], [0.95, -14.5, 0, 0],
             [1.00, -21.9, 0, 0]] },
    shoulderL: { keys: [[0.00, 0, 1.5, 1.5], [0.13, 0, 0.8, 1.5], [0.25, 0, 0, 1.5], [0.38, 0, -0.8, 1.5], [0.50, 0, -1.5, 1.5], [0.63, 0, -0.8, 1.5], [0.75, 0, 0, 1.5], [0.88, 0, 0.8, 1.5], [1.00, 0, 1.5, 1.5]] },
    shoulderR: { keys: [[0.00, 0, 1.5, -1.5], [0.13, 0, 0.8, -1.5], [0.25, 0, 0, -1.5], [0.38, 0, -0.8, -1.5], [0.50, 0, -1.5, -1.5], [0.63, 0, -0.8, -1.5], [0.75, 0, 0, -1.5], [0.88, 0, 0.8, -1.5], [1.00, 0, 1.5, -1.5]] },
    upperArmL: { keys: [[0.00, 8, 0, 6], [0.13, 4, 0, 6], [0.25, 0, 0, 6], [0.38, -6, 0, 6], [0.50, -12, 0, 6], [0.63, -6, 0, 6], [0.75, 0, 0, 6], [0.88, 4, 0, 6], [1.00, 8, 0, 6]] },
    lowerArmL: { keys: [[0.00, -30, 0, 0], [0.13, -32.5, 0, 0], [0.25, -35, 0, 0], [0.38, -37.5, 0, 0], [0.50, -40, 0, 0], [0.63, -37.5, 0, 0], [0.75, -35, 0, 0], [0.88, -32.5, 0, 0], [1.00, -30, 0, 0]] },
    handL: { keys: [[0.00, -6, 0, 4], [0.13, -3, 0, 4], [0.25, 0, 0, 4], [0.38, 3, 0, 4], [0.50, 6, 0, 4], [0.63, 3, 0, 4], [0.75, 0, 0, 4], [0.88, -3, 0, 4], [1.00, -6, 0, 4]] },
    upperArmR: { keys: [[0.00, -12, 0, -6], [0.13, -6, 0, -6], [0.25, 0, 0, -6], [0.38, 4, 0, -6], [0.50, 8, 0, -6], [0.63, 4, 0, -6], [0.75, 0, 0, -6], [0.88, -6, 0, -6], [1.00, -12, 0, -6]] },
    lowerArmR: { keys: [[0.00, -40, 0, 0], [0.13, -37.5, 0, 0], [0.25, -35, 0, 0], [0.38, -32.5, 0, 0], [0.50, -30, 0, 0], [0.63, -32.5, 0, 0], [0.75, -35, 0, 0], [0.88, -37.5, 0, 0], [1.00, -40, 0, 0]] },
    handR: { keys: [[0.00, 6, 0, -4], [0.13, 3, 0, -4], [0.25, 0, 0, -4], [0.38, -3, 0, -4], [0.50, -6, 0, -4], [0.63, -3, 0, -4], [0.75, 0, 0, -4], [0.88, 3, 0, -4], [1.00, 6, 0, -4]] },
  }, { stride: 0.9 }));

  /* Crouch-running: longer steps, the trunk pitched further forward,
     and the hips come up a little because you cannot run as low as you
     can walk. */
  clips.push(buildClip('crouchRun', 0.84, {
    hips: {
      keys: [[0.00, 26, -5, 0], [0.05, 26, -4, 0.6], [0.10, 26, -3, 1.2], [0.15, 26, -2, 1.8],
                 [0.20, 26, -1, 2.4], [0.25, 26, 0, 3], [0.30, 26, 1, 2.4], [0.35, 26, 2, 1.8],
                 [0.40, 26, 3, 1.2], [0.45, 26, 4, 0.6], [0.50, 26, 5, 0], [0.55, 26, 4, -0.6],
                 [0.60, 26, 3, -1.2], [0.65, 26, 2, -1.8], [0.70, 26, 1, -2.4], [0.75, 26, 0, -3],
                 [0.80, 26, -1, -2.4], [0.85, 26, -2, -1.8], [0.90, 26, -3, -1.2],
                 [0.95, 26, -4, -0.6], [1.00, 26, -5, 0]],
      pos: [[0.00, 0, -0.384, 0], [0.05, 0.003, -0.379, 0], [0.10, 0.006, -0.356, 0],
                 [0.15, 0.009, -0.326, 0], [0.20, 0.012, -0.3, 0], [0.25, 0.015, -0.287, 0],
                 [0.30, 0.012, -0.293, 0], [0.35, 0.009, -0.315, 0], [0.40, 0.006, -0.345, 0],
                 [0.45, 0.003, -0.371, 0], [0.50, 0, -0.384, 0], [0.55, -0.003, -0.379, 0],
                 [0.60, -0.006, -0.356, 0], [0.65, -0.009, -0.326, 0], [0.70, -0.012, -0.3, 0],
                 [0.75, -0.015, -0.287, 0], [0.80, -0.012, -0.293, 0], [0.85, -0.009, -0.315, 0],
                 [0.90, -0.006, -0.345, 0], [0.95, -0.003, -0.371, 0], [1.00, 0, -0.384, 0]],
    },
    spine: { keys: [[0.00, 5.7, 2.1, 0], [0.13, 5.7, 1, -0.4], [0.25, 5.7, 0, -0.9], [0.38, 5.7, -1, -0.4], [0.50, 5.7, -2.1, 0], [0.63, 5.7, -1, 0.4], [0.75, 5.7, 0, 0.9], [0.88, 5.7, 1, 0.4], [1.00, 5.7, 2.1, 0]] },
    chest: { keys: [[0.00, 4.2, 3.9, 0], [0.13, 4.2, 2, -0.7], [0.25, 4.2, 0, -1.4], [0.38, 4.2, -2, -0.7], [0.50, 4.2, -3.9, 0], [0.63, 4.2, -2, 0.7], [0.75, 4.2, 0, 1.4], [0.88, 4.2, 2, 0.7], [1.00, 4.2, 3.9, 0]] },
    neck: { keys: [[0.00, -16.1, -1.8, 0], [0.13, -16.1, -0.9, 0.7], [0.25, -16.1, 0, 1.4], [0.38, -16.1, 0.9, 0.7], [0.50, -16.1, 1.8, 0], [0.63, -16.1, 0.9, -0.7], [0.75, -16.1, 0, -1.4], [0.88, -16.1, -0.9, -0.7], [1.00, -16.1, -1.8, 0]] },
    head: { keys: [[0.00, -18.7, -1.3, 0], [0.13, -18.7, -0.7, 0.4], [0.25, -18.7, 0, 0.8], [0.38, -18.7, 0.7, 0.4], [0.50, -18.7, 1.3, 0], [0.63, -18.7, 0.7, -0.4], [0.75, -18.7, 0, -0.8], [0.88, -18.7, -0.7, -0.4], [1.00, -18.7, -1.3, 0]] },
    upperLegL: { keys: [[0.00, -119.8, 0, 0], [0.05, -115.8, 0, 0], [0.10, -107.9, 0, 0], [0.15, -97.6, 0, 0],
             [0.20, -87.1, 0, 0], [0.25, -77.4, 0, 0], [0.30, -68.5, 0, 0], [0.35, -59.6, 0, 0],
             [0.40, -51.5, 0, 0], [0.45, -42.8, 0, 0], [0.50, -33.5, 0, 0], [0.55, -27.5, 0, 0],
             [0.60, -30.4, 0, 0], [0.65, -41.2, 0, 0], [0.70, -60.2, 0, 0], [0.75, -85.1, 0, 0],
             [0.80, -103.2, 0, 0], [0.85, -109.6, 0, 0], [0.90, -110.5, 0, 0],
             [0.95, -114.2, 0, 0], [1.00, -119.8, 0, 0]] },
    lowerLegL: { keys: [[0.00, 110.6, 0, 0], [0.05, 116.9, 0, 0], [0.10, 119.5, 0, 0], [0.15, 118.8, 0, 0],
             [0.20, 116.7, 0, 0], [0.25, 114.9, 0, 0], [0.30, 114.5, 0, 0], [0.35, 115.1, 0, 0],
             [0.40, 116.3, 0, 0], [0.45, 115.2, 0, 0], [0.50, 110, 0, 0], [0.55, 109.6, 0, 0],
             [0.60, 115.8, 0, 0], [0.65, 126, 0, 0], [0.70, 135.6, 0, 0], [0.75, 138.5, 0, 0],
             [0.80, 130.2, 0, 0], [0.85, 116.8, 0, 0], [0.90, 105.6, 0, 0], [0.95, 105.1, 0, 0],
             [1.00, 110.6, 0, 0]] },
    footL: { keys: [[0.00, 27.2, 0, 0], [0.05, 19.6, 0, 0], [0.10, 11.9, 0, 0], [0.15, 4, 0, 0],
             [0.20, -2.8, 0, 0], [0.25, -9.1, 0, 0], [0.30, -16.1, 0, 0], [0.35, -23.2, 0, 0],
             [0.40, -25, 0, 0], [0.45, -25, 0, 0], [0.50, -25, 0, 0], [0.55, -13.5, 0, 0],
             [0.60, -1, 0, 0], [0.65, -2.2, 0, 0], [0.70, -3.3, 0, 0], [0.75, -4.4, 0, 0],
             [0.80, -5.6, 0, 0], [0.85, -6.7, 0, 0], [0.90, -7.8, 0, 0], [0.95, 4.7, 0, 0],
             [1.00, 27.2, 0, 0]] },
    upperLegR: { keys: [[0.00, -33.5, 0, 0], [0.05, -27.5, 0, 0], [0.10, -30.4, 0, 0], [0.15, -41.2, 0, 0],
             [0.20, -60.2, 0, 0], [0.25, -85.1, 0, 0], [0.30, -103.2, 0, 0],
             [0.35, -109.6, 0, 0], [0.40, -110.5, 0, 0], [0.45, -114.2, 0, 0],
             [0.50, -119.8, 0, 0], [0.55, -115.8, 0, 0], [0.60, -107.9, 0, 0],
             [0.65, -97.6, 0, 0], [0.70, -87.1, 0, 0], [0.75, -77.4, 0, 0], [0.80, -68.5, 0, 0],
             [0.85, -59.6, 0, 0], [0.90, -51.5, 0, 0], [0.95, -42.8, 0, 0], [1.00, -33.5, 0, 0]] },
    lowerLegR: { keys: [[0.00, 110, 0, 0], [0.05, 109.6, 0, 0], [0.10, 115.8, 0, 0], [0.15, 126, 0, 0],
             [0.20, 135.6, 0, 0], [0.25, 138.5, 0, 0], [0.30, 130.2, 0, 0], [0.35, 116.8, 0, 0],
             [0.40, 105.6, 0, 0], [0.45, 105.1, 0, 0], [0.50, 110.6, 0, 0], [0.55, 116.9, 0, 0],
             [0.60, 119.5, 0, 0], [0.65, 118.8, 0, 0], [0.70, 116.7, 0, 0], [0.75, 114.9, 0, 0],
             [0.80, 114.5, 0, 0], [0.85, 115.1, 0, 0], [0.90, 116.3, 0, 0], [0.95, 115.2, 0, 0],
             [1.00, 110, 0, 0]] },
    footR: { keys: [[0.00, -25, 0, 0], [0.05, -13.5, 0, 0], [0.10, -1, 0, 0], [0.15, -2.2, 0, 0],
             [0.20, -3.3, 0, 0], [0.25, -4.4, 0, 0], [0.30, -5.6, 0, 0], [0.35, -6.7, 0, 0],
             [0.40, -7.8, 0, 0], [0.45, 4.7, 0, 0], [0.50, 27.2, 0, 0], [0.55, 19.6, 0, 0],
             [0.60, 11.9, 0, 0], [0.65, 4, 0, 0], [0.70, -2.8, 0, 0], [0.75, -9.1, 0, 0],
             [0.80, -16.1, 0, 0], [0.85, -23.2, 0, 0], [0.90, -25, 0, 0], [0.95, -25, 0, 0],
             [1.00, -25, 0, 0]] },
    shoulderL: { keys: [[0.00, 0, 3, 1.5], [0.13, 0, 1.5, 1.5], [0.25, 0, 0, 1.5], [0.38, 0, -1.5, 1.5], [0.50, 0, -3, 1.5], [0.63, 0, -1.5, 1.5], [0.75, 0, 0, 1.5], [0.88, 0, 1.5, 1.5], [1.00, 0, 3, 1.5]] },
    shoulderR: { keys: [[0.00, 0, 3, -1.5], [0.13, 0, 1.5, -1.5], [0.25, 0, 0, -1.5], [0.38, 0, -1.5, -1.5], [0.50, 0, -3, -1.5], [0.63, 0, -1.5, -1.5], [0.75, 0, 0, -1.5], [0.88, 0, 1.5, -1.5], [1.00, 0, 3, -1.5]] },
    upperArmL: { keys: [[0.00, 20, 0, 8], [0.13, 10, 0, 8], [0.25, 0, 0, 8], [0.38, -14, 0, 8], [0.50, -28, 0, 8], [0.63, -14, 0, 8], [0.75, 0, 0, 8], [0.88, 10, 0, 8], [1.00, 20, 0, 8]] },
    lowerArmL: { keys: [[0.00, -52, 0, 0], [0.13, -56.5, 0, 0], [0.25, -61, 0, 0], [0.38, -65.5, 0, 0], [0.50, -70, 0, 0], [0.63, -65.5, 0, 0], [0.75, -61, 0, 0], [0.88, -56.5, 0, 0], [1.00, -52, 0, 0]] },
    handL: { keys: [[0.00, -6, 0, 4], [0.13, -3, 0, 4], [0.25, 0, 0, 4], [0.38, 3, 0, 4], [0.50, 6, 0, 4], [0.63, 3, 0, 4], [0.75, 0, 0, 4], [0.88, -3, 0, 4], [1.00, -6, 0, 4]] },
    upperArmR: { keys: [[0.00, -28, 0, -8], [0.13, -14, 0, -8], [0.25, 0, 0, -8], [0.38, 10, 0, -8], [0.50, 20, 0, -8], [0.63, 10, 0, -8], [0.75, 0, 0, -8], [0.88, -14, 0, -8], [1.00, -28, 0, -8]] },
    lowerArmR: { keys: [[0.00, -70, 0, 0], [0.13, -65.5, 0, 0], [0.25, -61, 0, 0], [0.38, -56.5, 0, 0], [0.50, -52, 0, 0], [0.63, -56.5, 0, 0], [0.75, -61, 0, 0], [0.88, -65.5, 0, 0], [1.00, -70, 0, 0]] },
    handR: { keys: [[0.00, 6, 0, -4], [0.13, 3, 0, -4], [0.25, 0, 0, -4], [0.38, -3, 0, -4], [0.50, -6, 0, -4], [0.63, -3, 0, -4], [0.75, 0, 0, -4], [0.88, 3, 0, -4], [1.00, 6, 0, -4]] },
  }, { stride: 1.4 }));

  /* THE DROP. Non-looping and short: 0.42s from upright to flat, which
     is the same third-of-a-second the match refuses to let you fire
     through, plus the landing. The trunk goes first and the legs
     follow, because a man diving leads with his chest. */
  /* A PRONE MAN'S PELVIS IS 0.12m OFF THE DECK, NOT BURIED.
   *
     This was -1.02, which puts the hips 0.145m BELOW the ground: the
     photograph of proneIdle is a head and one shoulder sticking out
     of the concrete and nothing else. And the legs made it worse --
     they still hung straight DOWN, eight degrees off vertical, so the
     pose was not a man lying down at all, it was a man standing up
     with the floor raised to his neck.

     0.875 is where the hips rest standing, so -0.805 puts the pelvis
     0.14 above the ground, which is where it sits when a man is flat.
     The legs go out BEHIND him, which on this rig means a world angle
     near -88 rather than the -8 they had -- they were still hanging
     straight down.

     Getting the pelvis right is not enough on its own. At -0.755 the
     SUPPORTING HANDS were 54mm under the floor, and at -0.675 they
     cleared it but the SHOULDERS stood 0.55 above the deck, which is
     twice a prone man's and is why the head was at 0.65 while the
     match put his eye at 0.38. The trunk is raked down to 17 degrees
     here so the shoulders land near 0.30 and the head near 0.40, and
     the arms reach FORWARD onto the ground instead of down. */
  const PR_HIP = -0.805;
  clips.push(buildClip('drop', 0.42, {
    hips: {
      keys: [[0.00, 6, 0, 0], [0.35, 58, 0, 2], [0.70, 84, 0, 5], [1.00, 82, 0, 6]],
      pos: [[0.00, 0, 0, 0], [0.35, 0, -0.40, 0.22], [0.70, 0, -0.68, 0.38],
        [1.00, 0, PR_HIP, 0.40]],
    },
    spine: { keys: [[0.00, 0, 0, 0], [0.40, -8, 0, -2], [1.00, -9, 0, -4]] },
    chest: { keys: [[0.00, 0, 0, 0], [0.40, 2, 0, -1], [1.00, 5, 0, -2]] },
    /* A head craned 58 degrees back is past where a neck goes. A prone
       man gets there the way a prone man does -- half from the neck,
       half from the skull on top of it. */
    neck:  { keys: [[0.00, 0, 0, 0], [0.40, -14, 0, 0], [1.00, -26, 0, 0]] },
    head:  { keys: [[0.00, 0, 0, 0], [0.40, -18, 0, 0], [1.00, -32, 0, 0]] },
    /* Trailing further behind him at every step down, and flat out by
       the end: world -40 at the halfway point and -86 on the deck. */
    upperLegL: { keys: [[0.00, 0, 0, 5], [0.40, -18, 0, 10], [1.00, 4, 0, 12]] },
    upperLegR: { keys: [[0.00, 0, 0, -5], [0.40, -16, 0, -8], [1.00, 6, 0, -6]] },
    lowerLegL: { keys: [[0.00, 0, 0, 0], [0.40, 30, 0, 0], [1.00, 6, 0, 0]] },
    lowerLegR: { keys: [[0.00, 0, 0, 0], [0.40, 26, 0, 0], [1.00, 6, 0, 0]] },
    footL: { keys: [[0.00, 0, 0, 0], [1.00, 8, 0, 0]] },
    footR: { keys: [[0.00, 0, 0, 0], [1.00, 8, 0, 0]] },
    /* Hands stay on the weapon the whole way down -- a man who drops
       and lets go of his rifle has not dropped, he has fallen. */
    upperArmL: { keys: [[0.00, 0, 0, -10], [0.40, -34, 0, 24], [1.00, -60, 0, 60]] },
    upperArmR: { keys: [[0.00, 0, 0, 10], [0.40, -32, 0, -22], [1.00, -60, 0, -60]] },
    lowerArmL: { keys: [[0.00, -18, 0, 0], [0.40, -62, 0, 0], [1.00, -115, 0, 0]] },
    lowerArmR: { keys: [[0.00, -18, 0, 0], [0.40, -62, 0, 0], [1.00, -115, 0, 0]] },
  }, { loop: false }));

  /* Flat and still, breathing. The whole body is 6 degrees onto the
     firing side. */
  clips.push(buildClip('proneIdle', 4.0, {
    hips: {
      keys: [[0.00, 82, 0, 6], [0.50, 82, 0, 6.6], [1.00, 82, 0, 6]],
      pos: [[0.00, 0, PR_HIP, 0.40], [0.50, 0, PR_HIP + 0.010, 0.40],
        [1.00, 0, PR_HIP, 0.40]],
    },
    spine: { keys: [[0.00, -9, 0, -4], [0.50, -8, 0, -4], [1.00, -9, 0, -4]] },
    chest: { keys: [[0.00, 5, 0, -2], [0.50, 7, 0, -2], [1.00, 5, 0, -2]] },
    neck:  { keys: [[0.00, -26, 0, 0], [0.50, -26, 1, 0], [1.00, -26, 0, 0]] },
    head:  { keys: [[0.00, -32, 0, 0], [0.50, -31, 1, 0], [1.00, -32, 0, 0]] },
    /* Out behind him and flat: world -86 and -88, which is the leg
       lying along the ground rather than hanging off the pelvis. The
       feet are turned out a little, toes to the side, which is what
       happens when a man's legs go slack on a hard surface. */
    upperLegL: { keys: [[0.00, 4, 0, 12], [1.00, 4, 0, 12]] },
    upperLegR: { keys: [[0.00, 6, 0, -6], [1.00, 6, 0, -6]] },
    lowerLegL: { keys: [[0.00, 6, 0, 0], [1.00, 6, 0, 0]] },
    lowerLegR: { keys: [[0.00, 6, 0, 0], [1.00, 6, 0, 0]] },
    footL: { keys: [[0.00, 8, 0, 0], [1.00, 8, 0, 0]] },
    footR: { keys: [[0.00, 8, 0, 0], [1.00, 8, 0, 0]] },
    /* Down onto the elbows and forward onto the weapon. */
    /* PROPPED, not hanging. The shoulder in this pose is 150 mm above
       the floor and the upper arm is 260 long, so any arm pointing
       downward puts the elbow through the concrete -- which is what
       flexing these elbows the right way first produced, hands 130 mm
       under. A prone man's arms lie along the ground: both segments near
       horizontal, elbows out wide, forearms forward. Searched for, not
       guessed: elbow 35 mm clear of the floor, hand 27 mm. */
    upperArmL: { keys: [[0.00, -60, 0, 60], [0.50, -58, 0, 61], [1.00, -60, 0, 60]] },
    upperArmR: { keys: [[0.00, -60, 0, -60], [0.50, -62, 0, -59], [1.00, -60, 0, -60]] },
    lowerArmL: { keys: [[0.00, -115, 0, 0], [0.50, -113, 0, 0], [1.00, -115, 0, 0]] },
    lowerArmR: { keys: [[0.00, -115, 0, 0], [0.50, -117, 0, 0], [1.00, -115, 0, 0]] },
  }));

  /* The combat crawl: elbow and opposite knee, then the other pair.
     Slow -- 1.9 seconds a cycle -- because it is, and the body rocks
     side to side as each elbow takes the weight. */
  clips.push(buildClip('crawl', 1.90, {
    hips: {
      keys: [[0.00, 82, -4, 6], [0.25, 82, 0, 9], [0.50, 82, 4, 6],
        [0.75, 82, 0, 3], [1.00, 82, -4, 6]],
      pos: [[0.00, 0, PR_HIP, 0.40], [0.25, 0.020, PR_HIP + 0.020, 0.40],
        [0.50, 0, PR_HIP, 0.40], [0.75, -0.020, PR_HIP + 0.020, 0.40],
        [1.00, 0, PR_HIP, 0.40]],
    },
    spine: { keys: [[0.00, -9, 5, -4], [0.50, -9, -5, -4], [1.00, -9, 5, -4]] },
    chest: { keys: [[0.00, 5, -6, -2], [0.50, 5, 6, -2], [1.00, 5, -6, -2]] },
    neck:  { keys: [[0.00, -25, -2, 0], [0.50, -25, 2, 0], [1.00, -25, -2, 0]] },
    head:  { keys: [[0.00, -31, -1, 0], [0.50, -31, 1, 0], [1.00, -31, -1, 0]] },
    /* Lead knee comes up, pushes, straightens; then the other. */
    /* Rebased onto the flat leg. The knee that is working comes up to
       world -55 with 65 degrees in it and the foot flattens; the other
       stays out along the deck. */
    upperLegL: { keys: [[0.00, 4, 0, 26], [0.25, -27, 0, 34], [0.50, 4, 0, 12],
      [1.00, 4, 0, 26]] },
    upperLegR: { keys: [[0.00, 6, 0, -6], [0.50, 6, 0, -22], [0.75, -25, 0, -30],
      [1.00, 6, 0, -6]] },
    lowerLegL: { keys: [[0.00, 6, 0, 0], [0.25, 65, 0, 0], [0.50, 6, 0, 0],
      [1.00, 6, 0, 0]] },
    lowerLegR: { keys: [[0.00, 6, 0, 0], [0.50, 8, 0, 0], [0.75, 63, 0, 0],
      [1.00, 6, 0, 0]] },
    footL: { keys: [[0.00, 8, 0, 0], [0.25, -18, 0, 0], [1.00, 8, 0, 0]] },
    footR: { keys: [[0.00, 8, 0, 0], [0.75, -18, 0, 0], [1.00, 8, 0, 0]] },
    /* The elbows do the work. The gun hand keeps its grip; the support
       hand reaches and pulls. */
    upperArmL: { keys: [[0.00, -60, 0, 60], [0.25, -70, 0, 64], [0.50, -52, 0, 55],
      [1.00, -60, 0, 60]] },
    lowerArmL: { keys: [[0.00, -115, 0, 0], [0.25, -124, 0, 0], [0.50, -106, 0, 0],
      [1.00, -115, 0, 0]] },
    upperArmR: { keys: [[0.00, -60, 0, -60], [0.50, -68, 0, -63], [1.00, -60, 0, -60]] },
    lowerArmR: { keys: [[0.00, -115, 0, 0], [0.50, -121, 0, 0], [1.00, -115, 0, 0]] },
  }));

  /* Getting up. The reverse of the drop, and slower, because standing
     up from flat takes about twice as long as going down. */
  clips.push(buildClip('standUp', 0.80, {
    hips: {
      /* A key at a quarter, and the hips come up sooner. Without it
         the legs interpolated from flat-out-behind to folded-under
         while the pelvis was still on the deck, and both shins spent
         a sixth of a second 160mm inside the floor. */
      keys: [[0.00, 82, 0, 6], [0.25, 66, 0, 5], [0.45, 52, 0, 3], [1.00, 14, 0, 0]],
      pos: [[0.00, 0, PR_HIP, 0.40], [0.25, 0, -0.55, 0.28], [0.45, 0, -0.50, 0.18],
        [1.00, 0, CR_HIP, 0]],
    },
    spine: { keys: [[0.00, -9, 0, -4], [1.00, -6, 0, 0]] },
    chest: { keys: [[0.00, 5, 0, -2], [1.00, -4, 0, 1]] },
    neck:  { keys: [[0.00, -26, 0, 0], [0.45, -10, 0, 0], [1.00, 0, 0, 0]] },
    head:  { keys: [[0.00, -32, 0, 0], [0.45, -12, 0, 0], [1.00, -2, 0, 0]] },
    /* Flat at the start, the new crouch at the end, and a kneel in
       between -- the thigh comes forward through +25 with 120 degrees
       in the knee, which is a man getting a foot under himself. */
    upperLegL: { keys: [[0.00, 4, 0, 12], [0.25, -20, 0, 10], [0.50, -72, 0, 8],
      [1.00, -72, 0, 5]] },
    upperLegR: { keys: [[0.00, 6, 0, -6], [0.25, -20, 0, -6], [0.50, -72, 0, -6],
      [1.00, -72, 0, -5]] },
    lowerLegL: { keys: [[0.00, 6, 0, 0], [0.25, 55, 0, 0], [0.50, 118, 0, 0],
      [1.00, 122, 0, 0]] },
    lowerLegR: { keys: [[0.00, 6, 0, 0], [0.25, 55, 0, 0], [0.50, 118, 0, 0],
      [1.00, 122, 0, 0]] },
    /* -64 was an ankle dorsiflexed two and a half times as far as an
       ankle goes, and it was there to hold a sole flat under a crouch
       too deep for a flat sole. It ends in the crouch idle's pose now,
       which is solved. */
    footL: { keys: [[0.00, 8, 0, 0], [0.25, 5, 0, 0], [0.50, -21.2, 0, 0], [1.00, -20.5, 0, 0]] },
    footR: { keys: [[0.00, 8, 0, 0], [0.25, 5, 0, 0], [0.50, -21.2, 0, 0], [1.00, -20.5, 0, 0]] },
    upperArmL: { keys: [[0.00, -60, 0, 60], [0.35, -34, 0, 24], [1.00, 0, 0, -10]] },
    upperArmR: { keys: [[0.00, -60, 0, -60], [0.35, -32, 0, -22], [1.00, 0, 0, 10]] },
    lowerArmL: { keys: [[0.00, -115, 0, 0], [0.35, -62, 0, 0], [1.00, -19, 0, 0]] },
    lowerArmR: { keys: [[0.00, -115, 0, 0], [0.35, -62, 0, 0], [1.00, -19, 0, 0]] },
  }, { loop: false }));

  /* THE JUMP, which had four bones in it and no pelvis, no feet, no
     elbows and no trunk. A man going up came out of a standing pose with
     his knees bending underneath him and everything else nailed still --
     no crouch, because the hips had no position track and could not go
     down; no push, because the ankles had no track and could not
     plantarflex; no wind-up, because the arms went straight up from rest
     with nothing behind them.

     A jump is five beats and the first one is the one that sells it.
     LOAD: the pelvis drops 105 mm, the knees fold to 60, the arms swing
     BACK. DRIVE: the legs extend and the ankles come up onto the toes
     44 degrees, which is the whole of the push. TUCK: knees up under
     him in the air. REACH: the legs go down for the floor, toes first.
     ABSORB: the pelvis takes 150 mm out of the landing and gives it
     back. The contact poses are solved by engine/tools/pose-solve.js so
     the foot is on the floor at load, at drive and at landing, and not
     wherever the interpolation happened to leave it. */
  clips.push(buildClip('jump', 0.9, {
    hips: {
      keys: [[0.00, 2, 0, 0], [0.16, 18, 0, 0], [0.28, -2, 0, 0], [0.46, 8, 0, 0],
        [0.64, 6, 0, 0], [0.80, 8, 0, 0], [0.88, 16, 0, 0], [1.00, 6, 0, 0]],
      pos: [[0.00, 0, -0.005, 0], [0.16, 0, -0.105, 0], [0.28, 0, 0.030, 0],
        [0.46, 0, 0.015, 0], [0.64, 0, 0.005, 0], [0.80, 0, -0.020, 0],
        [0.88, 0, -0.128, 0], [1.00, 0, -0.040, 0]],
    },
    spine: { keys: [[0.00, 0, 0, 0], [0.16, -5, 0, 0], [0.28, 2, 0, 0], [0.46, 4, 0, 0],
      [0.80, 0, 0, 0], [0.88, -5, 0, 0], [1.00, -2, 0, 0]] },
    chest: { keys: [[0.00, 0, 0, 0], [0.16, -4, 0, 0], [0.28, 3, 0, 0], [0.46, 3, 0, 0],
      [0.80, 0, 0, 0], [0.88, -4, 0, 0], [1.00, -1, 0, 0]] },
    /* And the head stays level through all of it, which is what makes a
       jump read as a body moving rather than a camera being thrown. */
    neck: { keys: [[0.00, -1, 0, 0], [0.16, -7, 0, 0], [0.28, 1, 0, 0], [0.46, -4, 0, 0],
      [0.88, -6, 0, 0], [1.00, -3, 0, 0]] },
    head: { keys: [[0.00, 0, 0, 0], [0.16, -4, 0, 0], [0.28, 0, 0, 0], [0.46, -2, 0, 0],
      [0.88, -3, 0, 0], [1.00, -1, 0, 0]] },

    upperLegL: { keys: [[0.00, -9.3, 0, 1], [0.16, -49.7, 0, 3], [0.28, -8, 0, 1],
      [0.46, -52, 0, 4], [0.64, -40, 0, 3], [0.80, -30, 0, 2], [0.88, -58.7, 0, 3], [1.00, -25.4, 0, 1]] },
    upperLegR: { keys: [[0.00, -9.3, 0, -1], [0.16, -48.0, 0, -3], [0.28, -8, 0, -1],
      [0.46, -49, 0, -4], [0.64, -38, 0, -3], [0.80, -29, 0, -2], [0.88, -57.0, 0, -3], [1.00, -24.0, 0, -1]] },
    lowerLegL: { keys: [[0.00, 15, 0, 0], [0.16, 60.2, 0, 0], [0.28, 10, 0, 0],
      [0.46, 66, 0, 0], [0.64, 40, 0, 0], [0.80, 22, 0, 0], [0.88, 70.1, 0, 0], [1.00, 36.7, 0, 0]] },
    lowerLegR: { keys: [[0.00, 15, 0, 0], [0.16, 58.4, 0, 0], [0.28, 10, 0, 0],
      [0.46, 63, 0, 0], [0.64, 38, 0, 0], [0.80, 21, 0, 0], [0.88, 68.0, 0, 0], [1.00, 35.4, 0, 0]] },
    footL: { keys: [[0.00, -7.7, 0, 0], [0.16, -25, 0, 0], [0.28, 44, 0, 0],
      [0.46, -16, 0, 0], [0.64, -10, 0, 0], [0.80, -6, 0, 0], [0.88, -25, 0, 0], [1.00, -17.4, 0, 0]] },
    footR: { keys: [[0.00, -7.7, 0, 0], [0.16, -24, 0, 0], [0.28, 42, 0, 0],
      [0.46, -15, 0, 0], [0.64, -10, 0, 0], [0.80, -6, 0, 0], [0.88, -24, 0, 0], [1.00, -17.0, 0, 0]] },

    /* The arms go BACK before they go up. Anticipation is the whole of
       why a jump reads as effort; without it the arms rise out of a
       standing pose and the man looks lifted rather than launched. */
    upperArmL: { keys: [[0.00, 0, 0, 8], [0.16, 42, 0, 14], [0.30, -108, 0, 22],
      [0.60, -68, 0, 18], [0.88, 18, 0, 12], [1.00, 0, 0, 8]] },
    upperArmR: { keys: [[0.00, 0, 0, -8], [0.16, 40, 0, -14], [0.30, -110, 0, -22],
      [0.60, -66, 0, -18], [0.88, 16, 0, -12], [1.00, 0, 0, -8]] },
    lowerArmL: { keys: [[0.00, -13, 0, 0], [0.16, -32, 0, 0], [0.30, -22, 0, 0],
      [0.60, -40, 0, 0], [0.88, -46, 0, 0], [1.00, -13, 0, 0]] },
    lowerArmR: { keys: [[0.00, -13, 0, 0], [0.16, -30, 0, 0], [0.30, -24, 0, 0],
      [0.60, -38, 0, 0], [0.88, -44, 0, 0], [1.00, -13, 0, 0]] },
  }, { loop: false }));

  clips.push(buildClip('wave', 1.6, {
    upperArmR: { keys: [[0, 0, 0, 10], [0.2, -140, 0, 40], [1, -140, 0, 40]] },
    lowerArmR: { keys: [[0, -14, 0, 0], [0.35, -34, 0, -20], [0.55, -34, 0, 18], [0.75, -34, 0, -20], [1, -14, 0, 0]] },
    head: { keys: [[0, 0, 0, 0], [0.5, 0, -12, 0], [1, 0, 0, 0]] },
  }, { loop: false }));

  /* DYING.
     ================================================================
     A man who is shot does not lie down. His legs stop carrying him
     first, so he drops -- the pelvis falls most of a metre in under
     half a second, which is nearly free-fall -- and everything above
     the hips arrives afterwards, because it is still travelling when
     the hips stop.

     That lag is the whole read. A body that rotates to flat while it
     descends is a plank being lowered; a body whose hips land and
     whose chest and head keep going for another fifth of a second is
     somebody falling over.

     Ends flat and STAYS there: non-looping, and the last key is held.
     Two of them, because being shot from the front and from behind are
     different events and playing the same collapse for both is how
     every death in a game starts to look identical. */
  clips.push(buildClip('deathBack', 1.05, {
    hips: {
      keys: [
        [0.00, 0, 0, 0], [0.12, -14, 0, 4], [0.30, -46, 0, 7],
        [0.52, -74, 0, 6], [0.72, -86, 0, 3], [1.00, -88, 0, 2],
      ],
      /* Down, and not in a straight line: the knees buckle first and
         the drop accelerates into the floor. */
      pos: [
        [0.00, 0, 0.000, 0], [0.12, 0, -0.085, -0.02], [0.30, 0, -0.330, -0.09],
        [0.52, 0, -0.620, -0.17], [0.72, 0, -0.740, -0.22], [1.00, 0, -0.755, -0.24],
      ],
    },
    // The trunk is still going when the hips stop.
    spine: { keys: [[0, 0, 0, 0], [0.3, 10, 0, -3], [0.62, 22, 0, -5], [1, 16, 0, -4]] },
    chest: { keys: [[0, 0, 0, 0], [0.3, 8, 0, -4], [0.68, 20, 0, -7], [1, 14, 0, -5]] },
    neck: { keys: [[0, 0, 0, 0], [0.35, -6, 0, 3], [0.8, 26, 0, 6], [1, 20, 0, 5]] },
    head: { keys: [[0, 0, 0, 0], [0.4, -8, 0, 4], [0.85, 18, 0, 8], [1, 14, 0, 6]] },
    /* He ends up ON THE GROUND. These finished at a world thigh angle
       of +30, which with the pelvis rolled onto its back is a corpse
       holding both legs 58 degrees in the air; +86 is a corpse lying
       down. */
    /* HIS FEET STAY ON THE GROUND UNTIL HE IS ON IT.
       The keys are on the hips' own times now, and at each one the
       leg is solved so the ankle sits just above the floor rather
       than wherever the interpolation left it -- at 0.375 both feet
       were 170mm inside the concrete, which for a man falling over
       backwards is his heels ploughing a furrow. Knees come UP as the
       pelvis drops, which is what a backward fall looks like, then
       the legs flop flat. */
    upperLegL: { keys: [[0, 0, 0, 0], [0.12, -2, 0, 2], [0.30, -10, 0, 4],
      [0.52, -36, 0, 7], [0.72, -9, 0, 9], [1, 2, 0, 8]] },
    upperLegR: { keys: [[0, 0, 0, 0], [0.12, -1, 0, -2], [0.30, -8, 0, -5],
      [0.52, -34, 0, -8], [0.72, -7, 0, -11], [1, 4, 0, -10]] },
    lowerLegL: { keys: [[0, 5, 0, 0], [0.12, 33, 0, 0], [0.30, 96, 0, 0],
      [0.52, 110, 0, 0], [0.72, 35, 0, 0], [1, 2, 0, 0]] },
    lowerLegR: { keys: [[0, 5, 0, 0], [0.12, 30, 0, 0], [0.30, 92, 0, 0],
      [0.52, 106, 0, 0], [0.72, 32, 0, 0], [1, 4, 0, 0]] },
    /* ARMS GO WHERE THEY ARE THROWN -- AND OUT, NOT ACROSS.
       The Z key was the wrong way round. Swept one rotation at a time
       from the rest pose, a POSITIVE Z on the left shoulder takes the
       elbow out to 0.41m and a negative one brings it in to 0.02m, so
       -44 on the left and +46 on the right were both arms folded 45
       degrees across the chest: the elbows finished 11mm and 33mm
       from the spine, which is inside the ribs. A man knocked onto
       his back lands with his arms out. */
    upperArmL: { keys: [[0, -8, 0, 7], [0.28, -54, 0, 26], [0.7, -22, 0, 52], [1, -18, 0, 50]] },
    upperArmR: { keys: [[0, -8, 0, -7], [0.32, -48, 0, -24], [0.74, -16, 0, -54], [1, -12, 0, -52]] },
    lowerArmL: { keys: [[0, -18, 0, 0], [0.4, -58, 0, 0], [1, -36, 0, 0]] },
    lowerArmR: { keys: [[0, -18, 0, 0], [0.44, -52, 0, 0], [1, -32, 0, 0]] },
  }, { loop: false }));

  /* Shot from behind: he goes down onto his face, and the arms do not
     come up in time. */
  clips.push(buildClip('deathFace', 1.00, {
    hips: {
      keys: [
        [0.00, 0, 0, 0], [0.14, 16, 0, -3], [0.34, 44, 0, -6],
        [0.58, 72, 0, -5], [0.78, 84, 0, -3], [1.00, 86, 0, -2],
      ],
      pos: [
        [0.00, 0, 0.000, 0], [0.14, 0, -0.095, 0.03], [0.34, 0, -0.350, 0.12],
        [0.58, 0, -0.640, 0.22], [0.78, 0, -0.740, 0.28], [1.00, 0, -0.755, 0.30],
      ],
    },
    spine: { keys: [[0, 0, 0, 0], [0.32, -11, 0, 3], [0.66, -21, 0, 5], [1, -16, 0, 4]] },
    chest: { keys: [[0, 0, 0, 0], [0.34, -10, 0, 4], [0.7, -22, 0, 6], [1, -16, 0, 5]] },
    neck: { keys: [[0, 0, 0, 0], [0.4, 8, 0, -3], [0.85, -20, 0, -5], [1, -16, 0, -4]] },
    head: { keys: [[0, 0, 0, 0], [0.45, 10, 0, -4], [0.9, -14, 0, -6], [1, -10, 0, -5]] },
    /* Same again, face down: -86 is flat, -46 was both legs held clear
       of the ground behind him. */
    upperLegL: { keys: [[0, 0, 0, 0], [0.24, -12, 0, -4], [0.64, -2, 0, -7], [1, 0, 0, -6]] },
    upperLegR: { keys: [[0, 0, 0, 0], [0.28, -10, 0, 5], [0.66, 0, 0, 9], [1, 2, 0, 8]] },
    lowerLegL: { keys: [[0, 5, 0, 0], [0.32, 28, 0, 0], [0.74, 2, 0, 0], [1, -4, 0, 0]] },
    lowerLegR: { keys: [[0, 5, 0, 0], [0.36, 24, 0, 0], [0.76, 0, 0, 0], [1, -6, 0, 0]] },
    /* The arms splay as he lands -- the elbows go OUT, not under. This
       clip keys no hands or shoulders, and until the animator stopped
       reusing stale pose slots (AnimationClip.sample) it was quietly
       borrowing both from whichever clip ran before it; posed honestly,
       at the old roll the right hand finished inside his own chest.
       Rolled 15 degrees the other way (this rig's sign), they land
       beside it. */
    upperArmL: { keys: [[0, -8, 0, -7], [0.3, 26, 0, -6], [0.72, 54, 0, 2], [1, 50, 0, 2]] },
    upperArmR: { keys: [[0, -8, 0, 7], [0.34, 22, 0, 6], [0.76, 50, 0, -2], [1, 46, 0, -2]] },
    lowerArmL: { keys: [[0, -18, 0, 0], [0.42, -74, 0, 0], [1, -50, 0, 0]] },
    lowerArmR: { keys: [[0, -18, 0, 0], [0.46, -68, 0, 0], [1, -46, 0, 0]] },
  }, { loop: false }));

  /* STANDING STILL IS NOT STANDING STILL.
     ================================================================
     A man waiting does not hold one pose. He shifts his weight off the
     leg that is tired, he glances at what is behind him, he checks the
     kit on his chest without thinking about it. None of it is large --
     a few degrees, once every several seconds -- and all of it is the
     difference between a character and a mannequin.

     Three of them, short and non-looping, played over idle at
     intervals. Deliberately unequal lengths (2.4s, 1.9s, 2.8s) so that
     two operators standing side by side never fall into step, which is
     what makes a row of them read as a shop window. */

  /* The weight goes onto the other leg. The pelvis slides across and
     drops on the loaded side, the spine counters so the head stays
     where it was, and it comes back. */
  clips.push(buildClip('idleShift', 2.4, {
    hips: {
      keys: [[0, 2, 0, 0], [0.22, 2, 0, -3.5], [0.55, 2, 0, -4], [0.82, 2, 0, -1.5], [1, 2, 0, 0]],
      pos: [[0, 0, 0, 0], [0.22, -0.021, -0.008, 0], [0.55, -0.026, -0.010, 0],
        [0.82, -0.012, -0.004, 0], [1, 0, 0, 0]],
    },
    spine: { keys: [[0, 0, 0, 0], [0.3, 0, 0, 2.2], [0.6, 0, 0, 2.6], [1, 0, 0, 0]] },
    chest: { keys: [[0, 0, 0, 1], [0.35, 0, 0, 2.4], [0.65, 0, 0, 2.2], [1, 0, 0, 1]] },
    neck: { keys: [[0, 0, 0, 0], [0.4, 0, 0, -1.6], [1, 0, 0, 0]] },
    upperLegL: { keys: [[0, 0, 0, 0], [0.5, -2, 0, 1.5], [1, 0, 0, 0]] },
    upperLegR: { keys: [[0, 0, 0, 0], [0.5, 3, 0, -1], [1, 0, 0, 0]] },
    lowerLegR: { keys: [[0, 4, 0, 0], [0.5, 11, 0, 0], [1, 4, 0, 0]] },
  }, { loop: false }));

  /* Something moved. The eyes go first and the head follows, which is
     why the head turn starts after the neck one and lags it all the
     way back. */
  clips.push(buildClip('idleGlance', 1.9, {
    neck: { keys: [[0, 0, 0, 0], [0.18, 0, -12, 0], [0.42, 0, -17, 1], [0.72, 0, -6, 0], [1, 0, 0, 0]] },
    head: { keys: [[0, 0, 0, 0], [0.26, 0, -13, -1], [0.5, 0, -19, -2], [0.8, 0, -5, 0], [1, 0, 0, 0]] },
    chest: { keys: [[0, 0, 0, 1], [0.5, 0, -4, 1], [1, 0, 0, 1]] },
    upperArmL: { keys: [[0, 0, 0, -6], [0.5, 0, 0, -8], [1, 0, 0, -6]] },
  }, { loop: false }));

  /* A hand goes to the chest rig and comes back. The elbow does the
     work; the shoulder barely moves, which is what stops it reading as
     a salute. */
  clips.push(buildClip('idleCheck', 2.8, {
    upperArmR: { keys: [[0, 0, 0, 6], [0.24, -18, 0, 16], [0.55, -22, 0, 19], [0.82, -8, 0, 10], [1, 0, 0, 6]] },
    lowerArmR: { keys: [[0, -13, 0, 0], [0.24, -70, 0, 0], [0.58, -80, 0, 0], [0.85, -34, 0, 0], [1, -13, 0, 0]] },
    handR: { keys: [[0, 0, 0, 0], [0.4, 0, 0, -14], [0.6, 0, 0, -10], [1, 0, 0, 0]] },
    neck: { keys: [[0, 0, 0, 0], [0.45, 5, 0, 0], [0.7, 4, 0, 0], [1, 0, 0, 0]] },
    head: { keys: [[0, 0, 0, 0], [0.45, 7, 0, 0], [0.7, 5, 0, 0], [1, 0, 0, 0]] },
    chest: { keys: [[0, 0, 0, 1], [0.5, 3, 0, 1], [1, 0, 0, 1]] },
  }, { loop: false }));

  return clips;
}
