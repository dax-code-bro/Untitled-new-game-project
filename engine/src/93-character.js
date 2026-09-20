/* ============================================================
   CHARACTER — procedurally skinned humanoids.
   The body mesh is generated as tapered tubes along the bind-pose
   skeleton, then skin weights are solved from vertex-to-bone
   distances. That gives a real GPU-skinned character with no
   authored model file.
   ============================================================ */

/* Bones that get geometry, and how thick each is at its two ends. */
const LIMB_SEGMENTS = [
  ['hips', 'spine', 0.135, 0.120],
  ['spine', 'chest', 0.120, 0.135],
  ['chest', 'neck', 0.135, 0.070],
  ['neck', 'head', 0.052, 0.058],
  ['shoulderL', 'upperArmL', 0.075, 0.058],
  ['upperArmL', 'lowerArmL', 0.055, 0.042],
  ['lowerArmL', 'handL', 0.042, 0.033],
  ['shoulderR', 'upperArmR', 0.075, 0.058],
  ['upperArmR', 'lowerArmR', 0.055, 0.042],
  ['lowerArmR', 'handR', 0.042, 0.033],
  ['hips', 'upperLegL', 0.100, 0.086],
  ['upperLegL', 'lowerLegL', 0.086, 0.058],
  ['lowerLegL', 'footL', 0.058, 0.045],
  ['hips', 'upperLegR', 0.100, 0.086],
  ['upperLegR', 'lowerLegR', 0.086, 0.058],
  ['lowerLegR', 'footR', 0.058, 0.045],
];

/* A tapered tube between two points, appended to `g`. */
function appendLimb(g, from, to, r0, r1, sides = 8) {
  const axis = new Vec3().subVectors(to, from);
  const len = axis.length();
  if (len < 1e-5) return;
  axis.scale(1 / len);
  const right = axis.perpendicular(new Vec3());
  const up = new Vec3().crossVectors(axis, right).normalize();

  const base = g.positions.length / 3;
  for (let ring = 0; ring <= 1; ring++) {
    const c = ring === 0 ? from : to;
    const r = ring === 0 ? r0 : r1;
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = right.x * ca + up.x * sa;
      const ny = right.y * ca + up.y * sa;
      const nz = right.z * ca + up.z * sa;
      g.vert(c.x + nx * r, c.y + ny * r, c.z + nz * r, nx, ny, nz, s / sides * 2, ring);
    }
  }
  const row = sides + 1;
  for (let s = 0; s < sides; s++) {
    const a = base + s;
    g.quad(a, a + 1, a + row + 1, a + row);
  }
  // Rounded caps keep joints from showing gaps when a limb bends.
  for (const [ring, c, r, dir] of [[0, from, r0, -1], [1, to, r1, 1]]) {
    const centre = g.vert(
      c.x + axis.x * r * dir * 0.7, c.y + axis.y * r * dir * 0.7, c.z + axis.z * r * dir * 0.7,
      axis.x * dir, axis.y * dir, axis.z * dir, 0.5, 0.5,
    );
    const capBase = base + ring * row;
    for (let s = 0; s < sides; s++) {
      if (dir > 0) g.tri(centre, capBase + s, capBase + s + 1);
      else g.tri(centre, capBase + s + 1, capBase + s);
    }
  }
}

/* Build a skinned humanoid mesh in the skeleton's bind pose.

   The surface comes from the anatomical loft in 94-human.js; this
   function's job is to bind it to the skeleton. */
/* Body parts, for skin binding. The problem they solve: in the bind pose an
   arm hangs against the flank, so a vertex on the ribs at shoulder height is
   genuinely nearer the upper-arm bone than the spine — about 60 mm against
   100 mm, which under an inverse-fourth-power falloff makes the arm seven
   times the stronger claim. Bind by distance alone and the upper flank is
   welded to the arm, so raising the arm drags a sheet of torso up with it:
   the webbing between chest and wrist that made every reaching zombie look
   like it had wings.

   The builders know exactly which piece of anatomy they are emitting, so
   they say so, and each part may only bind to the bones that actually move
   it. */
const PART = { BODY: 0, ARM_L: 1, ARM_R: 2, LEG_L: 3, LEG_R: 4, NECK: 5 };

const PART_BONES = {
  0: ['hips', 'spine', 'chest', 'neck', 'shoulderL', 'shoulderR'],
  1: ['shoulderL', 'upperArmL', 'lowerArmL', 'handL'],
  2: ['shoulderR', 'upperArmR', 'lowerArmR', 'handR'],
  3: ['hips', 'upperLegL', 'lowerLegL', 'footL'],
  4: ['hips', 'upperLegR', 'lowerLegR', 'footR'],
  5: ['chest', 'neck', 'head'],
};

/* Bind an arbitrary geometry to a skeleton in its current bind pose. Split
   out of makeHumanoidMesh so an imported model can be skinned by the same
   solver the procedural bodies use. */
function solveSkinWeights(g, skeleton) {
  const segments = [];
  const pa = new Vec3(), pb = new Vec3();
  for (const [fromName, toName] of LIMB_SEGMENTS) {
    const fi = skeleton.index(fromName), ti = skeleton.index(toName);
    if (fi < 0 || ti < 0) continue;
    skeleton.bones[fi].bindMatrix.getTranslation(pa);
    skeleton.bones[ti].bindMatrix.getTranslation(pb);
    segments.push({ a: pa.clone(), b: pb.clone(), boneA: fi, boneB: ti });
  }

  const n = g.positions.length / 3;
  const joints = new Float32Array(n * 4);
  const weights = new Float32Array(n * 4);
  const p = new Vec3(), closest = new Vec3();
  const scores = [];

  const allow = {};
  for (const key in PART_BONES) {
    const set = new Set();
    for (const name of PART_BONES[key]) { const bi = skeleton.index(name); if (bi >= 0) set.add(bi); }
    allow[key] = set;
  }
  /* Part tags are advisory and opt-in: a geometry whose builder never set
     one leaves them all at BODY, and honouring that would bind an entire
     model to the spine. Only restrict when something actually tagged. */
  const parts = g.parts && g.parts.length === n && g.parts.some((v) => v !== 0) ? g.parts : null;

  for (let i = 0; i < n; i++) {
    p.set(g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]);
    scores.length = 0;
    const ok = parts ? allow[parts[i]] : null;
    for (const seg of segments) {
      if (ok && !ok.has(seg.boneA) && !ok.has(seg.boneB)) continue;
      closestPointOnSegment(p, seg.a, seg.b, closest);
      const d2 = Math.max(closest.distanceToSq(p), 1e-5);
      const t = clamp(seg.a.distanceTo(closest) / Math.max(seg.a.distanceTo(seg.b), 1e-5), 0, 1);
      const w = 1 / (d2 * d2);
      if (!ok || ok.has(seg.boneA)) scores.push({ bone: seg.boneA, w: w * (1 - t) });
      if (!ok || ok.has(seg.boneB)) scores.push({ bone: seg.boneB, w: w * t });
    }
    const merged = new Map();
    for (const s of scores) merged.set(s.bone, (merged.get(s.bone) || 0) + s.w);
    const top = Array.from(merged.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let sum = 0;
    for (const [, w] of top) sum += w;
    if (sum < 1e-9) { joints[i * 4] = 0; weights[i * 4] = 1; continue; }
    for (let k = 0; k < 4; k++) {
      joints[i * 4 + k] = top[k] ? top[k][0] : 0;
      weights[i * 4 + k] = top[k] ? top[k][1] / sum : 0;
    }
  }
  g.joints = joints;
  g.weights = weights;
  return g;
}

function makeHumanoidMesh(skeleton, opts = {}) {
  // A zombie build is a different body, not the same body scaled — its own
  // cross-section stack, its own neck, and its own clothes.
  const g = opts.armorOnly
    ? buildZombieArmorGeometry(skeleton, { build: opts.zombieBuild, girth: opts.girth, seed: opts.seed, segments: opts.segments })
    : opts.bloodOnly
    ? buildZombieBloodGeometry(skeleton, { build: opts.zombieBuild, girth: opts.girth, seed: opts.seed })
    : opts.clothOnly
    ? buildZombieClothGeometry(skeleton, { build: opts.zombieBuild, girth: opts.girth,
      seed: opts.seed, segments: opts.segments, outfit: opts.outfit,
      /* A survivor's clothes are not a corpse's. `blood: false` is
         already how a caller says this body is alive, so the cloth
         builder takes the same word. */
      intact: opts.blood === false })
    : opts.zombieBuild
      ? buildZombieBodyGeometry(skeleton, { build: opts.zombieBuild, girth: opts.girth, seed: opts.seed, segments: opts.segments, rot: opts.rot })
      : makeHumanBodyGeometry(skeleton, opts);

  /* STATURE.
   *
     makeHumanoidSkeleton(scale) scales every bone offset, and every one
     of these builders lays its rings out at fixed coordinates -- so a
     character asked for at scale 1.075 got a skeleton seven and a half
     per cent taller than the body hanging off it, and the two only
     agreed at scale exactly 1. Measured on the operators: the body mesh
     topped out at y = 0.620 for all of them while the head bone sat at
     0.656, 0.610 and 0.583, so the tall one's head floated two and a
     half centimetres clear of his shoulders and the short one's was
     buried five centimetres into them.

     It also quietly wrecked the skin solve, which measures vertex-to-
     bone distance in the bind pose: with the skeleton stretched and the
     mesh not, every weight in the body was solved against a rig the
     surface did not sit on.

     Scaled here, once, after the build and before the solve -- so the
     bind pose the solver sees is the one the renderer will use. */
  const st = opts.stature != null ? opts.stature : 1;
  if (Math.abs(st - 1) > 1e-6) {
    for (let i = 0; i < g.positions.length; i++) g.positions[i] *= st;
    if (g.bounds) g.computeBounds && g.computeBounds();
  }

  /* SPLIT THE NECK OFF, so it can be skin.
   *
     It is emitted into the body mesh, the body mesh carries one
     material, and that material is whatever the character is wearing --
     so every head in this game has met a neck of a completely different
     colour at the jaw. A hard seam right under the chin, on every
     character, for as long as there have been characters.

     The triangles whose corners are all tagged NECK come out into their
     own geometry; the body keeps everything else. Both are skinned
     against the same skeleton afterwards, so they move as one piece. */
  if (!opts.clothOnly && !opts.armorOnly && !opts.bloodOnly && g.parts && g.indices) {
    const isNeck = (v) => g.parts[v] === PART.NECK;
    const keepT = [], neckT = [];
    for (let t = 0; t < g.indices.length; t += 3) {
      const a = g.indices[t], b = g.indices[t + 1], c = g.indices[t + 2];
      (isNeck(a) && isNeck(b) && isNeck(c) ? neckT : keepT).push(a, b, c);
    }
    if (neckT.length) {
      const ng = new Geometry();
      const remap = new Map();
      for (const v of neckT) {
        if (!remap.has(v)) {
          remap.set(v, ng.positions.length / 3);
          ng.part = PART.NECK;
          ng.vert(
            g.positions[v * 3], g.positions[v * 3 + 1], g.positions[v * 3 + 2],
            g.normals ? g.normals[v * 3] : 0, g.normals ? g.normals[v * 3 + 1] : 1,
            g.normals ? g.normals[v * 3 + 2] : 0,
            g.uvs ? g.uvs[v * 2] : 0, g.uvs ? g.uvs[v * 2 + 1] : 0,
          );
        }
      }
      for (let t = 0; t < neckT.length; t += 3) {
        ng.tri(remap.get(neckT[t]), remap.get(neckT[t + 1]), remap.get(neckT[t + 2]));
      }
      ng.finalize();
      /* A PLAIN ARRAY, not `new (g.indices.constructor)(keepT)`.
         g.indices is a plain Array at this point, and `new Array(arr)`
         does not copy it -- it makes a one-element array CONTAINING it.
         The body came back with an index count of exactly 1 and every
         character in the game rendered as a floating neck. */
      g.indices = keepT.length ? keepT : g.indices;
      g.neck = solveSkinWeights(ng, skeleton);
    }
  }

  return solveSkinWeights(g, skeleton);
}

/* ---------------- character controller ---------------- */

/* A capsule body with locked rotation, plus ground detection and the state
   machine that picks which animation should be playing. */
class CharacterController {
  constructor(engine, opts = {}) {
    this.engine = engine;
    this.height = opts.height || 1.75;
    this.radius = opts.radius || 0.3;
    this.moveSpeed = opts.speed || 4.2;
    this.runSpeed = opts.runSpeed || 8;
    /* Set by the owner for the duration of a slide. The controller does
       not decide when a slide happens -- the game's movement rules do --
       it only needs to know, so the pose matches what the body is
       actually doing. */
    this.sliding = false;
    this.jumpSpeed = opts.jumpSpeed || 7.6;
    this.acceleration = opts.acceleration || 34;
    this.airControl = opts.airControl != null ? opts.airControl : 0.28;
    this.turnSpeed = opts.turnSpeed || 12;
    /* How tall a step this thing will walk up without being asked. Anything
       taller is a wall. A stair with a 24 cm riser needs at least that. */
    this.stepHeight = opts.stepHeight != null ? opts.stepHeight : 0.42;

    this.grounded = false;
    this.groundNormal = new Vec3(0, 1, 0);
    this.facing = 0;
    this.wantJump = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.state = 'idle';

    this.body = new Body(Shape.capsuleApprox(this.radius, this.height), {
      position: opts.position || [0, this.height / 2 + 0.2, 0],
      mass: opts.mass || 70,
      lockRotation: true,
      friction: 0.0,          // movement friction is handled explicitly
      restitution: 0,
      linearDamping: 0.0,
      canSleep: false,
    });
    this.body.userData = { character: this };
    engine.physics.add(this.body);
    this._desired = new Vec3();
    /* A SHOVE THE CONTROLLER KNOWS ABOUT.
     *
       Recoil, a blast, a charging body: something pushes the man and he
       has to go, and then he has to get his feet back. Adding straight
       to body.velocity does not do it -- the accelerate-toward-target
       line below pulls a 2 m/s shove back to zero in about three
       frames, which at sixty frames a second is five hundredths of a
       second and is not felt at all.

       So the push is held here, decayed on its own clock, and carried
       ALONGSIDE the walking velocity rather than inside it: the
       controller's own accel and friction act on the walk, and the
       shove is added on top afterwards. Grounded you plant a foot and
       kill it in about a third of a second; airborne there is nothing
       to plant, so it holds for most of a second and you genuinely
       drift. */
    this.external = new Vec3();
    this.externalDamp = opts.externalDamp != null ? opts.externalDamp : 0.004;
    this.externalDampAir = opts.externalDampAir != null ? opts.externalDampAir : 0.35;
    this._extApplied = new Vec3();
  }

  /* Shove the body in world XZ. Metres per second, added to whatever
     shove is already on it, so a burst stacks. */
  impulse(x, z) {
    this.external.x += x;
    this.external.z += z;
  }

  /* Feed a movement intent in world XZ, magnitude 0..1. */
  move(x, z, run = false) {
    this._desired.set(x, 0, z);
    if (this._desired.lengthSq() > 1) this._desired.normalize();
    this._running = run;
  }

  jump() { this.jumpBuffer = 0.14; }

  update(dt) {
    const body = this.body;

    /* Ground check: a short ray from just inside the capsule bottom. */
    const origin = _cc[0].copy(body.position);
    origin.y -= this.height * 0.5 - this.radius * 0.6;
    const hit = this.engine.physics.raycast(origin, _cc[1].set(0, -1, 0), this.radius * 0.9 + 0.12,
      (b) => b !== body && !b.isTrigger);
    const wasGrounded = this.grounded;
    this.grounded = !!hit && hit.normal.y > 0.4;
    if (this.grounded) {
      this.groundNormal.copy(hit.normal);
      this.coyote = 0.12;
    } else {
      this.coyote = Math.max(0, this.coyote - dt);
    }
    /* Snap down off a nosing. Walking off the edge of a tread launches a
       capsule into a short fall, and on a flight of fifteen that is fifteen
       little hops where there should be a walk — and a body that is airborne
       cannot step up, so it never climbs the next one either. If we were on
       the ground last frame and there is ground within a step below us, we
       are still on the ground. */
    /* Only far enough to bridge a nosing. Given the whole step height to
       play with it reaches past the tread you have just climbed onto and
       drags you back down to the one below, and you and the step-up spend
       the rest of the flight undoing each other. */
    if (!this.grounded && wasGrounded && body.velocity.y <= 0.2) {
      const reach = this.radius * 0.9 + 0.12 + 0.20;
      const snap = this.engine.physics.raycast(origin, _cc[1].set(0, -1, 0), reach,
        (b) => b !== body && !b.isTrigger);
      if (snap && snap.normal.y > 0.6) {
        body.position.y = snap.point.y + this.height * 0.5;
        if (body.velocity.y < 0) body.velocity.y = 0;
        this.grounded = true;
        this.groundNormal.copy(snap.normal);
      }
    }
    if (this.grounded) this.coyote = 0.12;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    /* Horizontal movement: accelerate toward the desired velocity rather
       than setting it, so the character has weight. */
    const speed = this._running ? this.runSpeed : this.moveSpeed;
    const targetVx = this._desired.x * speed;
    const targetVz = this._desired.z * speed;
    const control = this.grounded ? 1 : this.airControl;
    const accel = this.acceleration * control * dt;

    /* Take last frame's shove back out before the walk is worked out,
       so the accel clamp and the friction below see the WALKING
       velocity and not the walk plus the push -- otherwise the push is
       read as speed the man is carrying and scrubbed off as such.

       Only as much of it as is still there, though. A shove into a wall
       is stopped by the collision solver, and subtracting a push that
       the wall has already taken out would leave the body travelling
       backwards away from a surface it merely touched. */
    const ea = this._extApplied;
    const undo = (v, e) => (e === 0 ? 0 : (e > 0 ? Math.min(e, Math.max(0, v)) : Math.max(e, Math.min(0, v))));
    body.velocity.x -= undo(body.velocity.x, ea.x);
    body.velocity.z -= undo(body.velocity.z, ea.z);

    body.velocity.x += clamp(targetVx - body.velocity.x, -accel, accel);
    body.velocity.z += clamp(targetVz - body.velocity.z, -accel, accel);

    // Ground friction only when there is no input, so stopping is crisp but
    // moving does not feel like wading.
    if (this.grounded && this._desired.lengthSq() < 1e-6) {
      const damp = Math.pow(0.0016, dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }

    /* And put the shove back on top, one frame older. */
    const ek = Math.pow(this.grounded ? this.externalDamp : this.externalDampAir, dt);
    this.external.x *= ek;
    this.external.z *= ek;
    if (Math.abs(this.external.x) < 1e-4) this.external.x = 0;
    if (Math.abs(this.external.z) < 1e-4) this.external.z = 0;
    body.velocity.x += this.external.x;
    body.velocity.z += this.external.z;
    ea.set(this.external.x, 0, this.external.z);

    /* Jump, with coyote time and input buffering — both are what separate a
       platformer that feels responsive from one that feels broken. */
    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0)) {
      body.velocity.y = this.jumpSpeed;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.grounded = false;
      if (this.onJump) this.onJump();
    }

    /* Stairs.

       There was no step-up here at all: a capsule walked into a riser and
       stopped, and only ever got over it when the solver happened to squeeze
       it up — which is why climbing a flight felt like a ritual of jiggling
       against every tread, and why nothing that was not being driven by a
       player ever got up one at all.

       Probe ahead at ankle height. If the way is blocked by something steep
       but there is walkable ground within stepHeight above the obstruction,
       lift onto it and keep the horizontal speed. This is a teleport of a
       few centimetres a frame, which is what every character controller
       does and what makes stairs feel like a ramp rather than a wall. */
    if (this.grounded && this._desired.lengthSq() > 1e-4 && this.jumpBuffer <= 0) {
      const dir = _cc[2].copy(this._desired).normalize();
      const feet = body.position.y - this.height * 0.5;
      const ahead = _cc[3].set(
        body.position.x, feet + 0.06, body.position.z);
      const blocked = this.engine.physics.raycast(ahead, dir, this.radius + 0.24,
        (b) => b !== body && !b.isTrigger);
      if (blocked && Math.abs(blocked.normal.y) < 0.55) {
        // Something steep in the way. Is its top within a step?
        const probe = _cc[4].set(
          body.position.x + dir.x * (this.radius + 0.20),
          feet + this.stepHeight + 0.12,
          body.position.z + dir.z * (this.radius + 0.20));
        const top = this.engine.physics.raycast(probe, _cc[5].set(0, -1, 0), this.stepHeight + 0.16,
          (b) => b !== body && !b.isTrigger);
        if (top && top.normal.y > 0.6) {
          const rise = top.point.y - feet;
          if (rise > 0.008 && rise <= this.stepHeight) {
            body.position.y += rise + 0.015;
            if (body.velocity.y < 0) body.velocity.y = 0;
            this.grounded = true;
          }
        }
      }
    }

    /* Face the movement direction. */
    if (this._desired.lengthSq() > 1e-4) {
      const want = Math.atan2(this._desired.x, this._desired.z);
      let diff = want - this.facing;
      // Take the short way round.
      while (diff > PI) diff -= TAU;
      while (diff < -PI) diff += TAU;
      this.facing += diff * Math.min(1, this.turnSpeed * dt);
    }

    /* Animation state.

       WHICH CLIP, AND HOW FAST, BOTH COME FROM THE CLIPS THEMSELVES.
       They used to come from the controller's own moveSpeed and
       runSpeed, and those are game numbers, not gait numbers: this
       game's characters move at 4.6 m/s, which is not a walk, it is a
       sprint. So a man crossing a room at 4.6 played the WALK clip,
       stretched to its 1.9x ceiling, and his feet covered 1.9 metres a
       second while the floor went past at 4.6. That is the skate.

       Every locomotion clip now states how far one cycle carries the
       body (AnimationClip.stride), because the generator that built it
       knows -- the planted foot is planted, and stride over duration is
       the speed at which that is true. Pick the clip whose natural speed
       is nearest what the body is doing, then scale to close the gap. */
    const planar = Math.sqrt(body.velocity.x ** 2 + body.velocity.z ** 2);
    let state;
    if (this.sliding) state = 'slide';
    else if (!this.grounded) state = 'jump';
    else if (planar > 0.35) state = this._gaitFor(planar);
    else state = 'idle';
    if (state !== this.state) {
      this.state = state;
      // autoAnimate: false leaves clip choice to the owner. Without it this
      // state machine reclaims the animator the moment a character's speed
      // crosses a threshold, and any custom clip — a shamble, a crawl, a
      // reload — is silently replaced by 'idle' or 'walk' mid-motion.
      if (this.animator && this.autoAnimate !== false) {
        this.animator.play(state, state === 'jump' ? 0.08 : 0.2);
      }
    }
    if (this.animator && this.autoAnimate === false) { /* owner drives speed */ }
    else if (this.animator && (state === 'walk' || state === 'run' || state === 'sprint')) {
      this.animator.speed = gaitRate(this.animator.clips.get(state), planar);
    } else if (this.animator) {
      this.animator.speed = 1;
    }

    if (!wasGrounded && this.grounded && this.onLand) this.onLand(Math.abs(body.velocity.y));
  }

  /* The cycle whose own travelling speed is closest to this one, in log
     terms -- a clip asked to run at half speed and one asked to run at
     double are equally wrong, and a linear comparison says otherwise. */
  _gaitFor(planar) {
    const A = this.animator;
    if (!A) return 'walk';
    let best = 'walk', bestErr = Infinity;
    for (const name of ['walk', 'run', 'sprint']) {
      const clip = A.clips.get(name);
      if (!clip || !clip.stride) continue;
      const natural = clip.stride / clip.duration;
      const err = Math.abs(Math.log(Math.max(planar, 0.2) / natural));
      if (err < bestErr) { bestErr = err; best = name; }
    }
    return best;
  }

  get position() { return this.body.position; }
  teleport(p) {
    this.body.setPosition(p);
    this.body.velocity.setScalar(0);
    // A shove does not survive being put somewhere else.
    this.external.setScalar(0);
    this._extApplied.setScalar(0);
  }
}

const _cc = [new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3()];
