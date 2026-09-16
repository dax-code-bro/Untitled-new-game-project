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
  // Arms hang at the sides in bind pose rather than straight out. A T-pose
  // rig would need every clip to rotate the arms down 80 degrees before doing
  // anything else, and any bone a clip does not touch would snap back to the
  // T — which is exactly what "unfinished character" looks like.
  ['shoulderL', 2, [0.08, 0.12, 0]],
  ['upperArmL', 5, [0.075, -0.045, 0]],
  ['lowerArmL', 6, [0.035, -0.255, 0]],
  ['handL', 7, [0.015, -0.235, 0]],
  ['shoulderR', 2, [-0.08, 0.12, 0]],
  ['upperArmR', 9, [-0.075, -0.045, 0]],
  ['lowerArmR', 10, [-0.035, -0.255, 0]],
  ['handR', 11, [-0.015, -0.235, 0]],
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

  clips.push(buildClip('walk', 1.0, {
    hips: { keys: [[0, 0, 0, 2], [0.25, 0, 0, 0], [0.5, 0, 0, -2], [0.75, 0, 0, 0], [1, 0, 0, 2]] },
    spine: { keys: [[0, 3, 0, 0], [0.5, 3, 0, 0], [1, 3, 0, 0]] },
    upperLegL: { keys: [[0, 26, 0, 0], [0.5, -22, 0, 0], [1, 26, 0, 0]] },
    lowerLegL: { keys: [[0, -6, 0, 0], [0.3, -4, 0, 0], [0.6, 42, 0, 0], [1, -6, 0, 0]] },
    footL: { keys: [[0, -12, 0, 0], [0.5, 8, 0, 0], [1, -12, 0, 0]] },
    upperLegR: { keys: [[0, -22, 0, 0], [0.5, 26, 0, 0], [1, -22, 0, 0]] },
    lowerLegR: { keys: [[0, 42, 0, 0], [0.1, 4, 0, 0], [0.5, -6, 0, 0], [1, 42, 0, 0]] },
    footR: { keys: [[0, 8, 0, 0], [0.5, -12, 0, 0], [1, 8, 0, 0]] },
    upperArmL: { keys: [[0, -24, 0, -8], [0.5, 24, 0, -8], [1, -24, 0, -8]] },
    upperArmR: { keys: [[0, 24, 0, 8], [0.5, -24, 0, 8], [1, 24, 0, 8]] },
    lowerArmL: { keys: [[0, 14, 0, 0], [0.5, 22, 0, 0], [1, 14, 0, 0]] },
    lowerArmR: { keys: [[0, 22, 0, 0], [0.5, 14, 0, 0], [1, 22, 0, 0]] },
  }));

  clips.push(buildClip('run', 0.62, {
    hips: { keys: [[0, 8, 0, 3], [0.25, 8, 0, 0], [0.5, 8, 0, -3], [0.75, 8, 0, 0], [1, 8, 0, 3]] },
    spine: { keys: [[0, 10, 0, 0], [0.5, 10, 0, 0], [1, 10, 0, 0]] },
    upperLegL: { keys: [[0, 52, 0, 0], [0.5, -38, 0, 0], [1, 52, 0, 0]] },
    lowerLegL: { keys: [[0, -18, 0, 0], [0.28, -10, 0, 0], [0.62, 78, 0, 0], [1, -18, 0, 0]] },
    footL: { keys: [[0, -18, 0, 0], [0.5, 14, 0, 0], [1, -18, 0, 0]] },
    upperLegR: { keys: [[0, -38, 0, 0], [0.5, 52, 0, 0], [1, -38, 0, 0]] },
    lowerLegR: { keys: [[0, 78, 0, 0], [0.12, 10, 0, 0], [0.5, -18, 0, 0], [1, 78, 0, 0]] },
    footR: { keys: [[0, 14, 0, 0], [0.5, -18, 0, 0], [1, 14, 0, 0]] },
    upperArmL: { keys: [[0, -58, 0, -12], [0.5, 48, 0, -12], [1, -58, 0, -12]] },
    upperArmR: { keys: [[0, 48, 0, 12], [0.5, -58, 0, 12], [1, 48, 0, 12]] },
    lowerArmL: { keys: [[0, 62, 0, 0], [0.5, 78, 0, 0], [1, 62, 0, 0]] },
    lowerArmR: { keys: [[0, 78, 0, 0], [0.5, 62, 0, 0], [1, 78, 0, 0]] },
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

    // Elbows locked near a right angle and tightening as the hand comes
    // forward. The arm that swings back belongs to the leg that is
    // forward, which is why L is at +52 while upperLegL is at +80.
    upperArmL: { keys: [[0.00, 52, 0, -9], [0.50, -72, 0, -14], [1.00, 52, 0, -9]] },
    upperArmR: { keys: [[0.00, -72, 0, 14], [0.50, 52, 0, 9], [1.00, -72, 0, 14]] },
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
      pos: [[0.00, 0, 0, 0], [0.20, 0, -0.55, 0], [0.80, 0, -0.55, 0],
        [1.00, 0, -0.34, 0]],
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
    lowerLegR: { keys: [[0.00, 24, 0, 0], [0.20, 115, 0, 0], [0.80, 112, 0, 0], [1.00, 50, 0, 0]] },
    footR:     { keys: [[0.00, 0, 0, 0], [0.20, 35, 0, 0], [1.00, 14, 0, 0]] },

    // Off arm back and out; gun arm holds its carry.
    upperArmL: { keys: [[0.00, 0, 0, -8], [0.22, 38, 0, -26], [1.00, 14, 0, -14]] },
    lowerArmL: { keys: [[0.00, 14, 0, 0], [0.22, 34, 0, 0], [1.00, 22, 0, 0]] },
    upperArmR: { keys: [[0.00, -30, 0, 10], [0.22, -46, 0, 16], [1.00, -36, 0, 12]] },
    lowerArmR: { keys: [[0.00, 60, 0, 0], [0.22, 74, 0, 0], [1.00, 66, 0, 0]] },
  }, { loop: false }));

  clips.push(buildClip('jump', 0.9, {
    hips: { keys: [[0, 0, 0, 0], [0.2, -14, 0, 0], [0.5, 6, 0, 0], [1, 0, 0, 0]] },
    upperLegL: { keys: [[0, 0, 0, 0], [0.2, 42, 0, 0], [0.5, -14, 0, 0], [1, 0, 0, 0]] },
    upperLegR: { keys: [[0, 0, 0, 0], [0.2, 42, 0, 0], [0.5, -14, 0, 0], [1, 0, 0, 0]] },
    lowerLegL: { keys: [[0, 0, 0, 0], [0.2, -58, 0, 0], [0.5, 8, 0, 0], [1, 0, 0, 0]] },
    lowerLegR: { keys: [[0, 0, 0, 0], [0.2, -58, 0, 0], [0.5, 8, 0, 0], [1, 0, 0, 0]] },
    upperArmL: { keys: [[0, 0, 0, -8], [0.25, -110, 0, -22], [0.6, -70, 0, -18], [1, 0, 0, -8]] },
    upperArmR: { keys: [[0, 0, 0, 8], [0.25, -110, 0, 22], [0.6, -70, 0, 18], [1, 0, 0, 8]] },
  }, { loop: false }));

  clips.push(buildClip('wave', 1.6, {
    upperArmR: { keys: [[0, 0, 0, 10], [0.2, -140, 0, 40], [1, -140, 0, 40]] },
    lowerArmR: { keys: [[0, 10, 0, 0], [0.35, 20, 0, -28], [0.55, 20, 0, 22], [0.75, 20, 0, -28], [1, 10, 0, 0]] },
    head: { keys: [[0, 0, 0, 0], [0.5, 0, -12, 0], [1, 0, 0, 0]] },
  }, { loop: false }));

  return clips;
}
