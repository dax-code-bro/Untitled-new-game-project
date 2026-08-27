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
function makeHumanoidMesh(skeleton, opts = {}) {
  const g = makeHumanBodyGeometry(skeleton, opts);

  // Bone segments used only for solving skin weights below.
  const segments = [];
  const pa = new Vec3(), pb = new Vec3();
  for (const [fromName, toName] of LIMB_SEGMENTS) {
    const fi = skeleton.index(fromName), ti = skeleton.index(toName);
    if (fi < 0 || ti < 0) continue;
    skeleton.bones[fi].bindMatrix.getTranslation(pa);
    skeleton.bones[ti].bindMatrix.getTranslation(pb);
    segments.push({ a: pa.clone(), b: pb.clone(), boneA: fi, boneB: ti });
  }

  /* Skin weights. For each vertex, score every bone segment by inverse
     squared distance to it and keep the four strongest. This is a cheap
     stand-in for bone-heat diffusion and holds up well on a tube-shaped
     body where every vertex is genuinely near its own bone. */
  const n = g.positions.length / 3;
  const joints = new Float32Array(n * 4);
  const weights = new Float32Array(n * 4);
  const p = new Vec3(), closest = new Vec3();
  const scores = [];

  for (let i = 0; i < n; i++) {
    p.set(g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]);
    scores.length = 0;
    for (const seg of segments) {
      closestPointOnSegment(p, seg.a, seg.b, closest);
      const d2 = Math.max(closest.distanceToSq(p), 1e-5);
      // Which end of the segment the vertex is nearer decides which of the
      // two bones it leans toward, so elbows and knees bend properly.
      const t = clamp(seg.a.distanceTo(closest) / Math.max(seg.a.distanceTo(seg.b), 1e-5), 0, 1);
      const w = 1 / (d2 * d2);
      scores.push({ bone: seg.boneA, w: w * (1 - t) });
      scores.push({ bone: seg.boneB, w: w * t });
    }
    // Merge duplicates, then take the top four.
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
    this.jumpSpeed = opts.jumpSpeed || 7.6;
    this.acceleration = opts.acceleration || 34;
    this.airControl = opts.airControl != null ? opts.airControl : 0.28;
    this.turnSpeed = opts.turnSpeed || 12;

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
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    /* Horizontal movement: accelerate toward the desired velocity rather
       than setting it, so the character has weight. */
    const speed = this._running ? this.runSpeed : this.moveSpeed;
    const targetVx = this._desired.x * speed;
    const targetVz = this._desired.z * speed;
    const control = this.grounded ? 1 : this.airControl;
    const accel = this.acceleration * control * dt;
    body.velocity.x += clamp(targetVx - body.velocity.x, -accel, accel);
    body.velocity.z += clamp(targetVz - body.velocity.z, -accel, accel);

    // Ground friction only when there is no input, so stopping is crisp but
    // moving does not feel like wading.
    if (this.grounded && this._desired.lengthSq() < 1e-6) {
      const damp = Math.pow(0.0016, dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }

    /* Jump, with coyote time and input buffering — both are what separate a
       platformer that feels responsive from one that feels broken. */
    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0)) {
      body.velocity.y = this.jumpSpeed;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.grounded = false;
      if (this.onJump) this.onJump();
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

    /* Animation state. */
    const planar = Math.sqrt(body.velocity.x ** 2 + body.velocity.z ** 2);
    let state;
    if (!this.grounded) state = 'jump';
    else if (planar > this.moveSpeed * 1.12) state = 'run';
    else if (planar > 0.35) state = 'walk';
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
    // Match stride to actual speed so the feet do not skate.
    if (this.animator && this.autoAnimate === false) { /* owner drives speed */ }
    else if (this.animator && (state === 'walk' || state === 'run')) {
      this.animator.speed = clamp(planar / (state === 'run' ? this.runSpeed : this.moveSpeed), 0.45, 1.9);
    } else if (this.animator) {
      this.animator.speed = 1;
    }

    if (!wasGrounded && this.grounded && this.onLand) this.onLand(Math.abs(body.velocity.y));
  }

  get position() { return this.body.position; }
  teleport(p) { this.body.setPosition(p); this.body.velocity.setScalar(0); }
}

const _cc = [new Vec3(), new Vec3(), new Vec3()];
