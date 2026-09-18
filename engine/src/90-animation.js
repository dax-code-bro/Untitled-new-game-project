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

    // Convert the two world-space aims back into local rotations.
    aimBoneAt(this, upperIdx, newMid);
    this.update();
    aimBoneAt(this, lowerIdx, target);
    this.update();
  }
}

/* Rotate a bone so its local +Y axis points at a world target. */
function aimBoneAt(skeleton, boneIdx, worldTarget) {
  const bone = skeleton.bones[boneIdx];
  const world = bone.worldMatrix.getTranslation(_ik[9]);
  const desired = _ik[10].subVectors(worldTarget, world);
  if (desired.lengthSq() < 1e-10) return;
  desired.normalize();

  // Current world-space direction of the bone's +Y.
  const current = _ik[11].set(0, 1, 0).applyMat4Dir(bone.worldMatrix).normalize();
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
  }

  /* Sample into a target pose object: { boneName: {rotation, position} }. */
  sample(time, out) {
    const t = this.loop ? ((time % this.duration) + this.duration) % this.duration : clamp(time, 0, this.duration);
    for (const name in this.tracks) {
      const track = this.tracks[name];
      const times = track.times;
      let i = 0;
      while (i < times.length - 1 && times[i + 1] < t) i++;
      const t0 = times[i], t1 = times[Math.min(i + 1, times.length - 1)];
      const span = t1 - t0;
      const f = span > 1e-6 ? (t - t0) / span : 0;
      const j = Math.min(i + 1, times.length - 1);

      let slot = out[name];
      if (!slot) { slot = out[name] = { rotation: new Quat(), position: new Vec3(), hasPosition: false }; }
      if (track.rotations) {
        slot.rotation.copy(track.rotations[i]).slerp(track.rotations[j], f);
      }
      if (track.positions) {
        slot.position.copy(track.positions[i]).lerp(track.positions[j], f);
        slot.hasPosition = true;
      } else {
        slot.hasPosition = false;
      }
    }
    return out;
  }
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
      for (const name in b) {
        const idx = this.skeleton.index(name);
        if (idx < 0) continue;
        const target = a[name];
        const bone = bones[idx];
        if (target) {
          bone.localRotation.copy(b[name].rotation).slerp(target.rotation, this.fade);
          if (target.hasPosition && b[name].hasPosition) {
            bone.localPosition.copy(b[name].position).lerp(target.position, this.fade);
          }
        } else {
          bone.localRotation.copy(this.restRotations[idx]).slerp(b[name].rotation, 1 - this.fade);
        }
      }
      for (const name in a) {
        if (b[name]) continue;
        const idx = this.skeleton.index(name);
        if (idx < 0) continue;
        bones[idx].localRotation.copy(this.restRotations[idx]).slerp(a[name].rotation, this.fade);
        if (a[name].hasPosition) bones[idx].localPosition.lerp(a[name].position, this.fade);
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
    lowerArmL: { keys: [[0, 8, 0, 0], [0.5, 12, 0, 0], [1, 8, 0, 0]] },
    lowerArmR: { keys: [[0, 8, 0, 0], [0.5, 12, 0, 0], [1, 8, 0, 0]] },
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

  clips.push(buildClip('walk', 1.06, {
    hips: {
      /* Rotation keys sit at the position keys' times, because the
         builder resamples position ONTO the rotation times and a bob
         sampled at the quarters comes out as a third of itself. */
      keys: [
        [0.00, 4, -4.0, 0.0], [0.10, 4, -3.2, 3.0], [0.25, 4, 0.0, 4.0],
        [0.38, 4, 2.6, 2.6], [0.50, 4, 4.0, 0.0], [0.60, 4, 3.2, -3.0],
        [0.72, 4, 0.0, -4.0], [0.86, 4, -2.6, -2.6], [1.00, 4, -4.0, 0.0],
      ],
      /* Up at each mid-stance over a straight supporting leg, down at
         each double support. Twice a cycle, 46mm, and about 19mm of
         sway toward whichever foot is carrying the weight -- +X is the
         left side of this skeleton (upperLegL sits at x +0.09). */
      pos: [
        [0.00, 0.000, -0.031, 0], [0.10, 0.012, -0.016, 0], [0.25, 0.019, 0.015, 0],
        [0.38, 0.012, 0.002, 0], [0.50, 0.000, -0.031, 0], [0.60, -0.012, -0.016, 0],
        [0.72, -0.019, 0.015, 0], [0.86, -0.012, 0.002, 0], [1.00, 0.000, -0.031, 0],
      ],
    },
    spine: { keys: [[0, 3, 2.5, 0], [0.25, 3, 0, 0], [0.5, 3, -2.5, 0], [0.75, 3, 0, 0], [1, 3, 2.5, 0]] },
    chest: { keys: [[0, 2, 5, -1], [0.25, 2, 0, 0], [0.5, 2, -5, 1], [0.75, 2, 0, 0], [1, 2, 5, -1]] },
    /* The head does not rotate with the shoulders. It stays pointed
       where the man is going, which is what the neck is for. */
    neck: { keys: [[0, -2, -3, 0], [0.5, -2, 3, 0], [1, -2, -3, 0]] },
    head: { keys: [[0, -1, -2, 0], [0.5, -1, 2, 0], [1, -1, -2, 0]] },

    // Left: strike at 0, toe-off at 0.62, swing through to strike again.
    upperLegL: {
      keys: [[0.00, 28, 0, 0], [0.10, 22, 0, 0], [0.25, 12, 0, 0], [0.38, 0, 0, 0],
        [0.50, -10, 0, 0], [0.60, -12, 0, 0], [0.72, 8, 0, 0], [0.86, 30, 0, 0],
        [1.00, 28, 0, 0]],
    },
    /* Two flexion waves, not one. The small one early in stance is the
       knee taking the landing, and leaving it out is most of what makes
       a walk look like a pair of scissors. */
    lowerLegL: {
      keys: [[0.00, 5, 0, 0], [0.10, 17, 0, 0], [0.25, 8, 0, 0], [0.38, 5, 0, 0],
        [0.50, 14, 0, 0], [0.60, 40, 0, 0], [0.72, 62, 0, 0], [0.86, 28, 0, 0],
        [1.00, 5, 0, 0]],
    },
    footL: {
      keys: [[0.00, -4, 0, 0], [0.10, 4, 0, 0], [0.25, -2, 0, 0], [0.38, -9, 0, 0],
        [0.50, -6, 0, 0], [0.60, 14, 0, 0], [0.72, -6, 0, 0], [0.86, -8, 0, 0],
        [1.00, -4, 0, 0]],
    },
    // Right: the same curve, half a cycle along.
    upperLegR: {
      keys: [[0.00, -10, 0, 0], [0.10, -12, 0, 0], [0.22, 8, 0, 0], [0.36, 30, 0, 0],
        [0.50, 28, 0, 0], [0.60, 22, 0, 0], [0.75, 12, 0, 0], [0.88, 0, 0, 0],
        [1.00, -10, 0, 0]],
    },
    lowerLegR: {
      keys: [[0.00, 14, 0, 0], [0.10, 40, 0, 0], [0.22, 62, 0, 0], [0.36, 28, 0, 0],
        [0.50, 5, 0, 0], [0.60, 17, 0, 0], [0.75, 8, 0, 0], [0.88, 5, 0, 0],
        [1.00, 14, 0, 0]],
    },
    footR: {
      keys: [[0.00, -6, 0, 0], [0.10, 14, 0, 0], [0.22, -6, 0, 0], [0.36, -8, 0, 0],
        [0.50, -4, 0, 0], [0.60, 4, 0, 0], [0.75, -2, 0, 0], [0.88, -9, 0, 0],
        [1.00, -6, 0, 0]],
    },

    /* CONTRALATERAL, and the sign was settled by measuring rather than
       by reading the numbers -- twice. A positive upper arm is FORWARD
       on this rig, so the left arm is at -16 (back) while the left leg
       is at +28 (forward). The check in gait.test.js correlates how far
       ahead the left FOOT is against how far ahead the left HAND is,
       over the whole cycle, and contralateral is a negative
       correlation. Reading it off the keys got it backwards; the
       correlation does not care what I think the sign means. */
    upperArmL: { keys: [[0, -16, 0, -7], [0.25, -4, 0, -7], [0.5, 11, 0, -7], [0.75, -4, 0, -7], [1, -16, 0, -7]] },
    upperArmR: { keys: [[0, 11, 0, 7], [0.25, -4, 0, 7], [0.5, -16, 0, 7], [0.75, -4, 0, 7], [1, 11, 0, 7]] },
    lowerArmL: { keys: [[0, 14, 0, 0], [0.5, 26, 0, 0], [1, 14, 0, 0]] },
    lowerArmR: { keys: [[0, 26, 0, 0], [0.5, 14, 0, 0], [1, 26, 0, 0]] },
  }));

  clips.push(buildClip('run', 0.70, {
    hips: {
      keys: [
        [0.00, 9, -6, 2], [0.12, 9, -5, 3], [0.22, 9, -3, 2], [0.35, 9, 1, 0],
        [0.50, 9, 6, -2], [0.62, 9, 5, -3], [0.72, 9, 3, -2], [0.85, 9, -1, 0],
        [1.00, 9, -6, 2],
      ],
      // Lowest over the loaded knee at mid-stance, highest in flight.
      pos: [
        [0.00, 0, -0.010, 0], [0.12, 0, -0.042, 0], [0.22, 0, -0.014, 0],
        [0.35, 0, 0.026, 0], [0.50, 0, -0.010, 0], [0.62, 0, -0.042, 0],
        [0.72, 0, -0.014, 0], [0.85, 0, 0.026, 0], [1.00, 0, -0.010, 0],
      ],
    },
    spine: { keys: [[0, 10, 4, 0], [0.5, 10, -4, 0], [1, 10, 4, 0]] },
    chest: { keys: [[0, 5, 7, -1], [0.5, 5, -7, 1], [1, 5, 7, -1]] },
    neck: { keys: [[0, -8, -6, 0], [0.5, -8, 6, 0], [1, -8, -6, 0]] },
    head: { keys: [[0, -4, -5, 0], [0.5, -4, 5, 0], [1, -4, -5, 0]] },

    upperLegL: {
      keys: [[0.00, 55, 0, 0], [0.12, 38, 0, 0], [0.22, 18, 0, 0], [0.35, -12, 0, 0],
        [0.50, -20, 0, 0], [0.62, -6, 0, 0], [0.72, 20, 0, 0], [0.85, 46, 0, 0],
        [1.00, 55, 0, 0]],
    },
    lowerLegL: {
      keys: [[0.00, 22, 0, 0], [0.12, 40, 0, 0], [0.22, 26, 0, 0], [0.35, 22, 0, 0],
        [0.50, 78, 0, 0], [0.62, 112, 0, 0], [0.72, 96, 0, 0], [0.85, 48, 0, 0],
        [1.00, 22, 0, 0]],
    },
    footL: {
      keys: [[0.00, -14, 0, 0], [0.12, 6, 0, 0], [0.22, 12, 0, 0], [0.35, 26, 0, 0],
        [0.50, 4, 0, 0], [0.62, -14, 0, 0], [0.72, -18, 0, 0], [0.85, -16, 0, 0],
        [1.00, -14, 0, 0]],
    },
    upperLegR: {
      keys: [[0.00, -20, 0, 0], [0.12, -6, 0, 0], [0.22, 20, 0, 0], [0.35, 46, 0, 0],
        [0.50, 55, 0, 0], [0.62, 38, 0, 0], [0.72, 18, 0, 0], [0.85, -12, 0, 0],
        [1.00, -20, 0, 0]],
    },
    lowerLegR: {
      keys: [[0.00, 78, 0, 0], [0.12, 112, 0, 0], [0.22, 96, 0, 0], [0.35, 48, 0, 0],
        [0.50, 22, 0, 0], [0.62, 40, 0, 0], [0.72, 26, 0, 0], [0.85, 22, 0, 0],
        [1.00, 78, 0, 0]],
    },
    footR: {
      keys: [[0.00, 4, 0, 0], [0.12, -14, 0, 0], [0.22, -18, 0, 0], [0.35, -16, 0, 0],
        [0.50, -14, 0, 0], [0.62, 6, 0, 0], [0.72, 12, 0, 0], [0.85, 26, 0, 0],
        [1.00, 4, 0, 0]],
    },

    upperArmL: { keys: [[0, -44, 0, -10], [0.25, -5, 0, -12], [0.5, 42, 0, -12], [0.75, -5, 0, -12], [1, -44, 0, -10]] },
    upperArmR: { keys: [[0, 42, 0, 12], [0.25, -5, 0, 12], [0.5, -44, 0, 10], [0.75, -5, 0, 12], [1, 42, 0, 12]] },
    lowerArmL: { keys: [[0, 68, 0, 0], [0.5, 92, 0, 0], [1, 68, 0, 0]] },
    lowerArmR: { keys: [[0, 92, 0, 0], [0.5, 68, 0, 0], [1, 92, 0, 0]] },
    shoulderL: { keys: [[0, 0, 0, -3], [0.5, 0, 0, 4], [1, 0, 0, -3]] },
    shoulderR: { keys: [[0, 0, 0, -4], [0.5, 0, 0, 3], [1, 0, 0, -4]] },
  }));

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
  clips.push(buildClip('sprint', 0.46, {
    hips: {
      /* The rotation keys are at the POSITION keys' times, not at the
         quarters they would otherwise sit at. A track carries ONE time
         array for both channels and the builder resamples position onto
         the rotation times -- so a seven-centimetre rise sampled at
         0, 1/4, 1/2, 3/4 came out as fifteen millimetres of nothing,
         because both extremes fall between those samples. Measured, or
         it would have shipped looking like a glide. */
      keys: [
        [0.00, 10, 8, 4], [0.12, 10, 6, 3], [0.30, 10, 3, 1],
        [0.50, 10, -8, -4], [0.62, 10, -6, -3], [0.80, 10, -3, -1],
        [1.00, 10, 8, 4],
      ],
      // Two rises per cycle -- one per step. Lowest at mid-stance when
      // the supporting knee is loaded, highest in the flight phase.
      pos: [
        [0.00, 0, -0.010, 0], [0.12, 0, -0.050, 0], [0.30, 0, 0.032, 0],
        [0.50, 0, -0.010, 0], [0.62, 0, -0.050, 0], [0.80, 0, 0.032, 0],
        [1.00, 0, -0.010, 0],
      ],
    },
    /* Twenty-eight degrees of lean by the chest and thirty-five by the
       neck, against the run's eighteen. The first pass used twenty and
       measured within a millimetre of the run at the chest, which is
       the whole difference being invisible. */
    spine: { keys: [[0.00, 18, -6, 0], [0.50, 18, 6, 0], [1.00, 18, -6, 0]] },
    chest: { keys: [[0.00, 7, -10, 0], [0.50, 7, 10, 0], [1.00, 7, -10, 0]] },
    /* And the neck and the head between them give nearly all of it
       back, so the eyes stay on the horizon. It has to be split across
       BOTH: the head bone's own rotation turns the face but does not
       move the head, so putting all of it on the head left the skull
       sitting thirty-five degrees out over the chest with the face
       pointing back at the sky. The neck is what stands the head up. */
    neck: { keys: [[0.00, -18, 2, 0], [0.50, -18, -2, 0], [1.00, -18, 2, 0]] },
    head: { keys: [[0.00, -10, 4, 0], [0.50, -10, -4, 0], [1.00, -10, 4, 0]] },

    upperLegL: {
      keys: [[0.00, 80, 0, 0], [0.12, 62, 0, 0], [0.22, 40, 0, 0],
        [0.35, 0, 0, 0], [0.48, -42, 0, 0], [0.58, -30, 0, 0],
        [0.72, 10, 0, 0], [0.86, 55, 0, 0], [1.00, 80, 0, 0]],
    },
    lowerLegL: {
      keys: [[0.00, 85, 0, 0], [0.12, 35, 0, 0], [0.22, 5, 0, 0],
        [0.35, 8, 0, 0], [0.48, 12, 0, 0], [0.58, 95, 0, 0],
        [0.72, 140, 0, 0], [0.86, 118, 0, 0], [1.00, 85, 0, 0]],
    },
    footL: {
      keys: [[0.00, -20, 0, 0], [0.22, 2, 0, 0], [0.48, 30, 0, 0],
        [0.62, 12, 0, 0], [1.00, -20, 0, 0]],
    },

    upperLegR: {
      keys: [[0.00, -42, 0, 0], [0.08, -30, 0, 0], [0.22, 10, 0, 0],
        [0.36, 55, 0, 0], [0.50, 80, 0, 0], [0.62, 62, 0, 0],
        [0.72, 40, 0, 0], [0.85, 0, 0, 0], [1.00, -42, 0, 0]],
    },
    lowerLegR: {
      keys: [[0.00, 12, 0, 0], [0.08, 95, 0, 0], [0.22, 140, 0, 0],
        [0.36, 118, 0, 0], [0.50, 85, 0, 0], [0.62, 35, 0, 0],
        [0.72, 5, 0, 0], [0.85, 8, 0, 0], [1.00, 12, 0, 0]],
    },
    footR: {
      keys: [[0.00, 30, 0, 0], [0.12, 12, 0, 0], [0.50, -20, 0, 0],
        [0.72, 2, 0, 0], [1.00, 30, 0, 0]],
    },

    /* Elbows locked near a right angle and tightening as the hand comes
       forward. The arm that swings back belongs to the leg that is
       forward -- and this clip had them the wrong way round, with a
       comment underneath explaining why it was right. A positive upper
       arm is FORWARD, so the left arm is at -72 (hand back by the hip)
       while upperLegL is at +80 (leg forward). Measured, this time:
       gait.test.js correlates foot lead against hand lead and wants a
       negative number. */
    upperArmL: { keys: [[0.00, -72, 0, -14], [0.50, 52, 0, -9], [1.00, -72, 0, -14]] },
    upperArmR: { keys: [[0.00, 52, 0, 9], [0.50, -72, 0, 14], [1.00, 52, 0, 9]] },
    // Tighter when the hand is up at the cheek, which for L is at 0.5.
    lowerArmL: { keys: [[0.00, 92, 0, 0], [0.50, 112, 0, 0], [1.00, 92, 0, 0]] },
    lowerArmR: { keys: [[0.00, 112, 0, 0], [0.50, 92, 0, 0], [1.00, 112, 0, 0]] },
    shoulderL: { keys: [[0.00, 0, 0, -4], [0.50, 0, 0, 6], [1.00, 0, 0, -4]] },
    shoulderR: { keys: [[0.00, 0, 0, -6], [0.50, 0, 0, 4], [1.00, 0, 0, -6]] },
  }));

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

    // Lead leg out front, knee just off straight.
    upperLegL: { keys: [[0.00, 24, 0, 0], [0.20, 82, 0, 8], [0.80, 78, 0, 8], [1.00, 44, 0, 3]] },
    lowerLegL: { keys: [[0.00, 20, 0, 0], [0.20, 14, 0, 0], [1.00, 26, 0, 0]] },
    footL:     { keys: [[0.00, 0, 0, 0], [0.20, -14, 0, 0], [1.00, -4, 0, 0]] },

    // Trail leg folded under the body, toe pointed so it drags.
    upperLegR: { keys: [[0.00, -10, 0, 0], [0.20, 30, 0, -14], [0.80, 28, 0, -14], [1.00, 6, 0, -5]] },
    /* The recovery key had the trailing knee STRAIGHTENING, which
       drives the shin down: 20 degrees of knee put the foot 170mm
       under, worse than the 50 it replaced. It wants more bend, not
       less -- the leg is coming up under him. */
    lowerLegR: { keys: [[0.00, 24, 0, 0], [0.20, 115, 0, 0], [0.80, 112, 0, 0], [1.00, 70, 0, 0]] },
    footR:     { keys: [[0.00, 0, 0, 0], [0.20, 35, 0, 0], [1.00, 26, 0, 0]] },

    // Off arm back and out; gun arm holds its carry.
    upperArmL: { keys: [[0.00, 0, 0, -8], [0.22, 38, 0, -26], [1.00, 14, 0, -14]] },
    lowerArmL: { keys: [[0.00, 14, 0, 0], [0.22, 34, 0, 0], [1.00, 22, 0, 0]] },
    upperArmR: { keys: [[0.00, -30, 0, 10], [0.22, -46, 0, 16], [1.00, -36, 0, 12]] },
    lowerArmR: { keys: [[0.00, 60, 0, 0], [0.22, 74, 0, 0], [1.00, 66, 0, 0]] },
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

  const CR_HIP = -0.42;              // how far the hips drop, in metres
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
    upperLegL: { keys: [[0.00, -72, 0, 5], [0.50, -73, 0, 5], [1.00, -72, 0, 5]] },
    upperLegR: { keys: [[0.00, -72, 0, -5], [0.50, -73, 0, -5], [1.00, -72, 0, -5]] },
    lowerLegL: { keys: [[0.00, 122, 0, 0], [0.50, 120, 0, 0], [1.00, 122, 0, 0]] },
    lowerLegR: { keys: [[0.00, 122, 0, 0], [0.50, 120, 0, 0], [1.00, 122, 0, 0]] },
    footL: { keys: [[0.00, -64, 0, 0], [0.50, -62, 0, 0], [1.00, -64, 0, 0]] },
    footR: { keys: [[0.00, -64, 0, 0], [0.50, -62, 0, 0], [1.00, -64, 0, 0]] },
    upperArmL: { keys: [[0.00, 0, 0, -10], [0.50, 0, 0, -12], [1.00, 0, 0, -10]] },
    upperArmR: { keys: [[0.00, 0, 0, 10], [0.50, 0, 0, 12], [1.00, 0, 0, 10]] },
    lowerArmL: { keys: [[0.00, 14, 0, 0], [0.50, 17, 0, 0], [1.00, 14, 0, 0]] },
    lowerArmR: { keys: [[0.00, 14, 0, 0], [0.50, 17, 0, 0], [1.00, 14, 0, 0]] },
  }));

  /* A duck walk: short steps, the hips barely rise, and the trunk
     stays where it is so the sights do not wander. 1.20s because the
     stride is short and the cadence is slow. */
  clips.push(buildClip('crouchWalk', 1.20, {
    hips: {
      keys: [[0.00, 14, -3, 0], [0.25, 14, 0, 3], [0.50, 14, 3, 0],
        [0.75, 14, 0, -3], [1.00, 14, -3, 0]],
      pos: [[0.00, 0, CR_HIP, 0.008], [0.25, 0.012, CR_HIP + 0.018, 0],
        [0.50, 0, CR_HIP, -0.008], [0.75, -0.012, CR_HIP + 0.018, 0],
        [1.00, 0, CR_HIP, 0.008]],
    },
    spine: { keys: [[0.00, -6, 2, 0], [0.50, -6, -2, 0], [1.00, -6, 2, 0]] },
    chest: { keys: [[0.00, -4, -2, 0], [0.50, -4, 2, 0], [1.00, -4, -2, 0]] },
    head:  { keys: [[0.00, -2, 0, 0], [0.50, -2, 0, 0], [1.00, -2, 0, 0]] },
    /* Same correction as the crouch stance, and the same method: the
       thigh swings 72 forward at the front of the step to 44 at
       toe-off, and at every key the shank is SOLVED so the planted
       ankle lands on -0.860 rather than picked to look right. The
       swing key at 0.75 is the only one allowed off the floor, and by
       0.10m, which is as high as a man steps when he is trying not to
       be seen. */
    upperLegL: { keys: [[0.00, -86, 0, 5], [0.25, -72, 0, 5], [0.50, -58, 0, 5],
      [0.75, -80, 0, 5], [1.00, -86, 0, 5]] },
    upperLegR: { keys: [[0.00, -58, 0, -5], [0.25, -80, 0, -5], [0.50, -86, 0, -5],
      [0.75, -72, 0, -5], [1.00, -58, 0, -5]] },
    lowerLegL: { keys: [[0.00, 120, 0, 0], [0.25, 119, 0, 0], [0.50, 120, 0, 0],
      [0.75, 134, 0, 0], [1.00, 120, 0, 0]] },
    lowerLegR: { keys: [[0.00, 120, 0, 0], [0.25, 134, 0, 0], [0.50, 120, 0, 0],
      [0.75, 119, 0, 0], [1.00, 120, 0, 0]] },
    footL: { keys: [[0.00, -56, 0, 0], [0.25, -61, 0, 0], [0.50, -54, 0, 0],
      [0.75, -58, 0, 0], [1.00, -56, 0, 0]] },
    footR: { keys: [[0.00, -54, 0, 0], [0.25, -58, 0, 0], [0.50, -56, 0, 0],
      [0.75, -61, 0, 0], [1.00, -54, 0, 0]] },
    /* Contralateral, and small -- a crouched man's arms hardly move,
       because both hands are on the weapon. */
    upperArmL: { keys: [[0.00, -7, 0, -10], [0.50, 7, 0, -10], [1.00, -7, 0, -10]] },
    upperArmR: { keys: [[0.00, 7, 0, 10], [0.50, -7, 0, 10], [1.00, 7, 0, 10]] },
    lowerArmL: { keys: [[0.00, 16, 0, 0], [0.50, 12, 0, 0], [1.00, 16, 0, 0]] },
    lowerArmR: { keys: [[0.00, 12, 0, 0], [0.50, 16, 0, 0], [1.00, 12, 0, 0]] },
  }));

  /* Crouch-running: longer steps, the trunk pitched further forward,
     and the hips come up a little because you cannot run as low as you
     can walk. */
  clips.push(buildClip('crouchRun', 0.86, {
    hips: {
      keys: [[0.00, 20, -5, 0], [0.25, 20, 0, 5], [0.50, 20, 5, 0],
        [0.75, 20, 0, -5], [1.00, 20, -5, 0]],
      pos: [[0.00, 0, CR_HIP + 0.07, 0.018], [0.25, 0.020, CR_HIP + 0.10, 0],
        [0.50, 0, CR_HIP + 0.07, -0.018], [0.75, -0.020, CR_HIP + 0.10, 0],
        [1.00, 0, CR_HIP + 0.07, 0.018]],
    },
    spine: { keys: [[0.00, -10, 4, 0], [0.50, -10, -4, 0], [1.00, -10, 4, 0]] },
    chest: { keys: [[0.00, -6, -4, 0], [0.50, -6, 4, 0], [1.00, -6, -4, 0]] },
    head:  { keys: [[0.00, 4, 0, 0], [0.50, 4, 0, 0], [1.00, 4, 0, 0]] },
    /* The hips are 70mm higher than the crouch walk's, which is why
       the thigh can reach 78 degrees forward and the stride can be
       0.53m end to end instead of 0.20m. Solved against a -0.860
       ankle at every stance key, the same as the other two. */
    upperLegL: { keys: [[0.00, -98, 0, 4], [0.25, -70, 0, 4], [0.50, -42, 0, 4],
      [0.75, -90, 0, 4], [1.00, -98, 0, 4]] },
    upperLegR: { keys: [[0.00, -42, 0, -4], [0.25, -90, 0, -4], [0.50, -98, 0, -4],
      [0.75, -70, 0, -4], [1.00, -42, 0, -4]] },
    lowerLegL: { keys: [[0.00, 95, 0, 0], [0.25, 105, 0, 0], [0.50, 100, 0, 0],
      [0.75, 134, 0, 0], [1.00, 95, 0, 0]] },
    lowerLegR: { keys: [[0.00, 100, 0, 0], [0.25, 134, 0, 0], [0.50, 95, 0, 0],
      [0.75, 105, 0, 0], [1.00, 100, 0, 0]] },
    footL: { keys: [[0.00, -27, 0, 0], [0.25, -55, 0, 0], [0.50, -52, 0, 0],
      [0.75, -52, 0, 0], [1.00, -27, 0, 0]] },
    footR: { keys: [[0.00, -52, 0, 0], [0.25, -52, 0, 0], [0.50, -27, 0, 0],
      [0.75, -55, 0, 0], [1.00, -52, 0, 0]] },
    upperArmL: { keys: [[0.00, -16, 0, -12], [0.50, 16, 0, -12], [1.00, -16, 0, -12]] },
    upperArmR: { keys: [[0.00, 16, 0, 12], [0.50, -16, 0, 12], [1.00, 16, 0, 12]] },
    lowerArmL: { keys: [[0.00, 24, 0, 0], [0.50, 16, 0, 0], [1.00, 24, 0, 0]] },
    lowerArmR: { keys: [[0.00, 16, 0, 0], [0.50, 24, 0, 0], [1.00, 16, 0, 0]] },
  }));

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
    head:  { keys: [[0.00, 0, 0, 0], [0.40, -32, 0, 0], [1.00, -58, 0, 0]] },
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
    upperArmL: { keys: [[0.00, 0, 0, -10], [0.40, -12, 0, 4], [1.00, -20, 0, 14]] },
    upperArmR: { keys: [[0.00, 0, 0, 10], [0.40, -10, 0, -2], [1.00, -18, 0, -12]] },
    lowerArmL: { keys: [[0.00, 14, 0, 0], [1.00, 62, 0, 0]] },
    lowerArmR: { keys: [[0.00, 14, 0, 0], [1.00, 66, 0, 0]] },
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
    head:  { keys: [[0.00, -58, 0, 0], [0.50, -57, 2, 0], [1.00, -58, 0, 0]] },
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
    upperArmL: { keys: [[0.00, -20, 0, 14], [1.00, -20, 0, 14]] },
    upperArmR: { keys: [[0.00, -18, 0, -12], [1.00, -18, 0, -12]] },
    lowerArmL: { keys: [[0.00, 62, 0, 0], [1.00, 62, 0, 0]] },
    lowerArmR: { keys: [[0.00, 66, 0, 0], [1.00, 66, 0, 0]] },
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
    head:  { keys: [[0.00, -56, -3, 0], [0.50, -56, 3, 0], [1.00, -56, -3, 0]] },
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
    upperArmL: { keys: [[0.00, -20, 0, 14], [0.25, -34, 0, 22], [0.50, -12, 0, 10],
      [1.00, -20, 0, 14]] },
    lowerArmL: { keys: [[0.00, 62, 0, 0], [0.25, 86, 0, 0], [0.50, 48, 0, 0],
      [1.00, 62, 0, 0]] },
    upperArmR: { keys: [[0.00, -18, 0, -12], [0.50, -24, 0, -16], [1.00, -18, 0, -12]] },
    lowerArmR: { keys: [[0.00, 66, 0, 0], [0.50, 74, 0, 0], [1.00, 66, 0, 0]] },
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
    head:  { keys: [[0.00, -58, 0, 0], [1.00, -2, 0, 0]] },
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
    footL: { keys: [[0.00, 8, 0, 0], [0.25, 5, 0, 0], [0.50, 5, 0, 0], [1.00, -64, 0, 0]] },
    footR: { keys: [[0.00, 8, 0, 0], [0.25, 5, 0, 0], [0.50, 5, 0, 0], [1.00, -64, 0, 0]] },
    upperArmL: { keys: [[0.00, -20, 0, 14], [1.00, 0, 0, -10]] },
    upperArmR: { keys: [[0.00, -18, 0, -12], [1.00, 0, 0, 10]] },
    lowerArmL: { keys: [[0.00, 62, 0, 0], [1.00, 14, 0, 0]] },
    lowerArmR: { keys: [[0.00, 66, 0, 0], [1.00, 14, 0, 0]] },
  }, { loop: false }));

  clips.push(buildClip('jump', 0.9, {
    hips: { keys: [[0, 0, 0, 0], [0.2, -14, 0, 0], [0.5, 6, 0, 0], [1, 0, 0, 0]] },
    /* The crouch before the leap had the knee going BACK and the shin
       forward, the same inversion the crouch stance had. Thigh 35
       forward with 85 in the knee is a man loading a jump; 20 and 50
       in the air is the tuck. */
    upperLegL: { keys: [[0, 0, 0, 0], [0.2, -21, 0, 0], [0.5, -26, 0, 0], [1, 0, 0, 0]] },
    upperLegR: { keys: [[0, 0, 0, 0], [0.2, -21, 0, 0], [0.5, -26, 0, 0], [1, 0, 0, 0]] },
    lowerLegL: { keys: [[0, 0, 0, 0], [0.2, 85, 0, 0], [0.5, 50, 0, 0], [1, 0, 0, 0]] },
    lowerLegR: { keys: [[0, 0, 0, 0], [0.2, 85, 0, 0], [0.5, 50, 0, 0], [1, 0, 0, 0]] },
    upperArmL: { keys: [[0, 0, 0, -8], [0.25, -110, 0, -22], [0.6, -70, 0, -18], [1, 0, 0, -8]] },
    upperArmR: { keys: [[0, 0, 0, 8], [0.25, -110, 0, 22], [0.6, -70, 0, 18], [1, 0, 0, 8]] },
  }, { loop: false }));

  clips.push(buildClip('wave', 1.6, {
    upperArmR: { keys: [[0, 0, 0, 10], [0.2, -140, 0, 40], [1, -140, 0, 40]] },
    lowerArmR: { keys: [[0, 10, 0, 0], [0.35, 20, 0, -28], [0.55, 20, 0, 22], [0.75, 20, 0, -28], [1, 10, 0, 0]] },
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
    lowerArmL: { keys: [[0, 14, 0, 0], [0.4, 46, 0, 0], [1, 28, 0, 0]] },
    lowerArmR: { keys: [[0, 14, 0, 0], [0.44, 40, 0, 0], [1, 24, 0, 0]] },
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
    spine: { keys: [[0, 0, 0, 0], [0.32, -12, 0, 3], [0.66, -24, 0, 5], [1, -18, 0, 4]] },
    chest: { keys: [[0, 0, 0, 0], [0.34, -10, 0, 4], [0.7, -22, 0, 6], [1, -16, 0, 5]] },
    neck: { keys: [[0, 0, 0, 0], [0.4, 8, 0, -3], [0.85, -20, 0, -5], [1, -16, 0, -4]] },
    head: { keys: [[0, 0, 0, 0], [0.45, 10, 0, -4], [0.9, -14, 0, -6], [1, -10, 0, -5]] },
    /* Same again, face down: -86 is flat, -46 was both legs held clear
       of the ground behind him. */
    upperLegL: { keys: [[0, 0, 0, 0], [0.24, -12, 0, -4], [0.64, -2, 0, -7], [1, 0, 0, -6]] },
    upperLegR: { keys: [[0, 0, 0, 0], [0.28, -10, 0, 5], [0.66, 0, 0, 9], [1, 2, 0, 8]] },
    lowerLegL: { keys: [[0, 5, 0, 0], [0.32, 28, 0, 0], [0.74, 2, 0, 0], [1, -4, 0, 0]] },
    lowerLegR: { keys: [[0, 5, 0, 0], [0.36, 24, 0, 0], [0.76, 0, 0, 0], [1, -6, 0, 0]] },
    upperArmL: { keys: [[0, -8, 0, -7], [0.3, 26, 0, -18], [0.72, 54, 0, -14], [1, 50, 0, -13]] },
    upperArmR: { keys: [[0, -8, 0, 7], [0.34, 22, 0, 16], [0.76, 50, 0, 13], [1, 46, 0, 12]] },
    lowerArmL: { keys: [[0, 14, 0, 0], [0.42, 62, 0, 0], [1, 40, 0, 0]] },
    lowerArmR: { keys: [[0, 14, 0, 0], [0.46, 56, 0, 0], [1, 36, 0, 0]] },
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
    lowerArmR: { keys: [[0, 8, 0, 0], [0.24, 58, 0, 0], [0.58, 66, 0, 0], [0.85, 26, 0, 0], [1, 8, 0, 0]] },
    handR: { keys: [[0, 0, 0, 0], [0.4, 0, 0, -14], [0.6, 0, 0, -10], [1, 0, 0, 0]] },
    neck: { keys: [[0, 0, 0, 0], [0.45, 5, 0, 0], [0.7, 4, 0, 0], [1, 0, 0, 0]] },
    head: { keys: [[0, 0, 0, 0], [0.45, 7, 0, 0], [0.7, 5, 0, 0], [1, 0, 0, 0]] },
    chest: { keys: [[0, 0, 0, 1], [0.5, 3, 0, 1], [1, 0, 0, 1]] },
  }, { loop: false }));

  return clips;
}
