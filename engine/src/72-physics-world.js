/* ============================================================
   PHYSICS WORLD — bodies, broadphase, sequential-impulse solver,
   joints, sleeping, raycasts.
   ============================================================ */

let _bodyId = 0;

class Body {
  constructor(shape, opts = {}) {
    this.id = _bodyId++;
    this.shape = shape;
    this.position = Vec3.from(opts.position || [0, 0, 0]);
    this.quaternion = Quat.from(opts.rotation || opts.quaternion || null);
    this.velocity = Vec3.from(opts.velocity || [0, 0, 0]);
    this.angularVelocity = Vec3.from(opts.angularVelocity || [0, 0, 0]);

    this.isStatic = !!opts.static;
    this.isKinematic = !!opts.kinematic;
    this.isTrigger = !!opts.trigger;

    const density = opts.density != null ? opts.density : 1000;
    let mass = opts.mass != null ? opts.mass : (Number.isFinite(shape.volume) ? shape.volume * density : 0);
    if (this.isStatic || this.isKinematic) mass = 0;
    this.mass = mass;
    this.invMass = mass > 0 ? 1 / mass : 0;

    // Inertia is stored as the diagonal in body space; the world tensor is
    // rebuilt each step from the current orientation.
    this.invInertiaLocal = new Vec3();
    if (mass > 0) {
      const li = shape.localInertia;
      this.invInertiaLocal.set(
        li.x > 1e-9 ? 1 / (li.x * mass) : 0,
        li.y > 1e-9 ? 1 / (li.y * mass) : 0,
        li.z > 1e-9 ? 1 / (li.z * mass) : 0,
      );
    }
    this.invInertiaWorld = new Mat3().setDiagonal(0, 0, 0);

    this.restitution = opts.restitution != null ? opts.restitution : 0.12;
    this.friction = opts.friction != null ? opts.friction : 0.55;
    this.linearDamping = opts.linearDamping != null ? opts.linearDamping : 0.02;
    this.angularDamping = opts.angularDamping != null ? opts.angularDamping : 0.06;
    this.gravityScale = opts.gravityScale != null ? opts.gravityScale : 1;
    // Locking rotation is how you get a character that does not tip over.
    this.lockRotation = !!opts.lockRotation;

    this.force = new Vec3();
    this.torque = new Vec3();
    this.pseudoVelocity = new Vec3();
    this.pseudoAngular = new Vec3();

    this.awake = true;
    this.sleepTimer = 0;
    // Whether this body was below the sleep thresholds at the end of the
    // last step. Fresh bodies count as moving so they wake what they land on.
    this.slowLastStep = false;
    this.canSleep = opts.canSleep !== false;
    this.aabb = new Aabb();
    this.collisionGroup = opts.group != null ? opts.group : 1;
    this.collisionMask = opts.mask != null ? opts.mask : 0xffffffff;

    this.actor = null;      // back-pointer to the render-side Actor
    this.userData = opts.userData || null;
    this.onCollide = opts.onCollide || null;
    // Peak impulse received this step, which is what fracture thresholds read.
    this.impactImpulse = 0;
    this.updateAabb();
  }

  get dynamic() { return !this.isStatic && !this.isKinematic; }

  updateInertiaWorld() {
    if (this.lockRotation || this.invMass === 0) {
      this.invInertiaWorld.setDiagonal(0, 0, 0);
      return;
    }
    this.invInertiaWorld.setRotatedDiagonal(
      this.quaternion, this.invInertiaLocal.x, this.invInertiaLocal.y, this.invInertiaLocal.z,
    );
  }

  updateAabb() {
    const r = this.shape.boundRadius;
    if (!Number.isFinite(r)) {
      // Infinite plane: an unbounded AABB keeps it in every broadphase cell
      // it should be in without special-casing the grid.
      this.aabb.min.set(-1e6, -1e6, -1e6);
      this.aabb.max.set(1e6, 1e6, 1e6);
      return;
    }
    this.aabb.min.set(this.position.x - r, this.position.y - r, this.position.z - r);
    this.aabb.max.set(this.position.x + r, this.position.y + r, this.position.z + r);
  }

  wake() {
    if (!this.dynamic) return;
    this.awake = true;
    this.sleepTimer = 0;
  }
  sleep() {
    this.awake = false;
    this.velocity.setScalar(0);
    this.angularVelocity.setScalar(0);
  }

  applyForce(f, worldPoint) {
    this.force.add(f);
    if (worldPoint) {
      const r = _pv[0].subVectors(worldPoint, this.position);
      this.torque.add(_pv[1].crossVectors(r, f));
    }
    this.wake();
  }

  applyImpulse(impulse, worldPoint) {
    if (!this.dynamic) return;
    this.velocity.addScaled(impulse, this.invMass);
    if (worldPoint && !this.lockRotation) {
      const r = _pv[0].subVectors(worldPoint, this.position);
      const t = _pv[1].crossVectors(r, impulse);
      this.invInertiaWorld.transformVec3(t, _pv[2]);
      this.angularVelocity.add(_pv[2]);
    }
    this.wake();
  }

  setPosition(p) { this.position.copy(Vec3.from(p)); this.updateAabb(); this.wake(); return this; }
  setVelocity(v) { this.velocity.copy(Vec3.from(v)); this.wake(); return this; }

  /* Velocity of the material point at a world position — needed for
     friction at a contact and for spawning sparks with the right motion. */
  pointVelocity(worldPoint, out = new Vec3()) {
    const r = _pv[3].subVectors(worldPoint, this.position);
    out.crossVectors(this.angularVelocity, r).add(this.velocity);
    return out;
  }
}

const _pv = [];
for (let i = 0; i < 16; i++) _pv.push(new Vec3());

/* ---------------- joints ---------------- */

class Joint {
  constructor(type, a, b, opts = {}) {
    this.type = type;
    this.a = a; this.b = b;
    this.localA = Vec3.from(opts.pivotA || [0, 0, 0]);
    this.localB = Vec3.from(opts.pivotB || [0, 0, 0]);
    this.axisA = Vec3.from(opts.axis || [0, 1, 0]).normalize();
    this.distance = opts.distance != null ? opts.distance : 1;
    this.stiffness = opts.stiffness != null ? opts.stiffness : 1;
    this.breakForce = opts.breakForce != null ? opts.breakForce : Infinity;
    this.broken = false;
    this.accumulated = new Vec3();
  }
}

/* ---------------- world ---------------- */

class PhysicsWorld {
  constructor(opts = {}) {
    this.gravity = Vec3.from(opts.gravity != null ? opts.gravity : [0, -19.6, 0]);
    this.bodies = [];
    this.joints = [];
    this.pool = new ManifoldPool();
    this.manifolds = new Map();     // pairKey -> { a, b, contacts[] }
    this.velocityIterations = opts.velocityIterations || 8;
    this.positionIterations = opts.positionIterations || 3;
    this.fixedStep = opts.fixedStep || 1 / 60;
    this.maxSubSteps = opts.maxSubSteps || 4;
    this.accumulator = 0;
    this.cellSize = opts.cellSize || 4;
    this.grid = new Map();
    this.slop = 0.008;
    this.baumgarte = 0.22;
    this.maxCorrection = 4;
    this.sleepLinear = 0.055;
    this.sleepAngular = 0.12;
    this.sleepTime = 0.65;
    this.contactEvents = [];
    // Flat triples [bodyA, bodyB, key, ...] — one array instead of one
    // tuple allocation per pair per step.
    this._pairs = [];
    this._seen = new Set();
    this._movable = [];
    this._cellPool = [];
    this._dead = [];
    this._staticPlanes = [];
    this._islandIndex = new Map();
    this._islandParent = [];
    this._islandCanSleep = new Map();
    // Monotonic step counter, used to invalidate per-step caches.
    this.stamp = 0;
  }

  add(body) {
    this.bodies.push(body);
    if (body.shape.type === SHAPE.PLANE) this._staticPlanes.push(body);
    return body;
  }

  remove(body) {
    const i = this.bodies.indexOf(body);
    if (i >= 0) this.bodies.splice(i, 1);
    const j = this._staticPlanes.indexOf(body);
    if (j >= 0) this._staticPlanes.splice(j, 1);
    // Drop cached manifolds by identity — matching on the string key would
    // mis-handle ids that are prefixes of one another (1 vs 10).
    for (const [key, m] of Array.from(this.manifolds.entries())) {
      if (m.a === body || m.b === body) this.manifolds.delete(key);
    }
    this.joints = this.joints.filter((jt) => jt.a !== body && jt.b !== body);
  }

  addJoint(type, a, b, opts) {
    const j = new Joint(type, a, b, opts);
    this.joints.push(j);
    return j;
  }

  /* ---------------- broadphase ---------------- */

  /* Pair keys are numbers, not strings. At a few hundred bodies the string
     concatenation and hashing dominated the whole step. */
  _pairKey(a, b) {
    return a.id < b.id ? a.id * 2097152 + b.id : b.id * 2097152 + a.id;
  }

  _broadphase() {
    this.grid.clear();
    this._pairs.length = 0;
    this._seen.clear();
    this._cellPool.length = 0;
    const inv = 1 / this.cellSize;

    const movable = this._movable;
    movable.length = 0;
    for (const b of this.bodies) {
      if (b.shape.type === SHAPE.PLANE) continue;
      b.updateAabb();
      movable.push(b);
      const x0 = Math.floor(b.aabb.min.x * inv), x1 = Math.floor(b.aabb.max.x * inv);
      const y0 = Math.floor(b.aabb.min.y * inv), y1 = Math.floor(b.aabb.max.y * inv);
      const z0 = Math.floor(b.aabb.min.z * inv), z1 = Math.floor(b.aabb.max.z * inv);
      // Guard against an object flung to infinity filling the grid.
      if ((x1 - x0) > 64 || (y1 - y0) > 64 || (z1 - z0) > 64) continue;
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          for (let z = z0; z <= z1; z++) {
            // Standard spatial hash. Distinct cells may collide onto one
            // bucket, which only costs a redundant AABB test — never a miss,
            // since equal cells always hash equally.
            const key = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
            let cell = this.grid.get(key);
            if (!cell) { cell = []; this.grid.set(key, cell); }
            cell.push(b);
          }
        }
      }
    }

    for (const cell of this.grid.values()) {
      for (let i = 0; i < cell.length; i++) {
        const a = cell[i];
        for (let j = i + 1; j < cell.length; j++) {
          const b = cell[j];
          if (!this._shouldCollide(a, b)) continue;
          if (!a.aabb.overlaps(b.aabb)) continue;
          const key = this._pairKey(a, b);
          if (this._seen.has(key)) continue;
          this._seen.add(key);
          this._pairs.push(a.id < b.id ? a : b, a.id < b.id ? b : a, key);
        }
      }
    }

    // Planes are unbounded, so they are paired against everything directly
    // rather than being inserted into the grid.
    for (const plane of this._staticPlanes) {
      for (const b of movable) {
        if (!this._shouldCollide(plane, b)) continue;
        const key = this._pairKey(plane, b);
        if (this._seen.has(key)) continue;
        this._seen.add(key);
        this._pairs.push(plane.id < b.id ? plane : b, plane.id < b.id ? b : plane, key);
      }
    }
    return this._pairs;
  }

  _shouldCollide(a, b) {
    if (!a.dynamic && !b.dynamic) return false;
    if (!a.awake && !b.awake) return false;
    if ((a.collisionGroup & b.collisionMask) === 0) return false;
    if ((b.collisionGroup & a.collisionMask) === 0) return false;
    return true;
  }

  /* ---------------- narrowphase + manifold caching ---------------- */

  _narrowphase(pairs) {
    this.pool.reset();
    const live = this._seen;
    live.clear();
    this.contactEvents.length = 0;

    for (let pi = 0; pi < pairs.length; pi += 3) {
      const a = pairs[pi], b = pairs[pi + 1], key = pairs[pi + 2];
      const contacts = [];
      collide(a, b, contacts, this.pool, this.stamp);
      if (!contacts.length) { this.manifolds.delete(key); continue; }

      let m = this.manifolds.get(key);
      if (!m) {
        m = { a, b, contacts: [], cache: [], firstTouch: true };
        this.manifolds.set(key, m);
      } else {
        m.firstTouch = false;
      }

      // Warm starting: carry accumulated impulses from last step onto the
      // nearest matching contact. Without this, stacks sink and shiver.
      // The source is `cache` — a persistent snapshot — because `contacts`
      // holds pooled objects that this step's pool.reset() already recycled.
      const prev = m.cache;
      for (const c of contacts) {
        let best = null, bestD = 0.0016; // 4 cm², generous but not sloppy
        for (const p of prev) {
          if (p.id !== c.id) continue;
          const d = p.point.distanceToSq(c.point);
          if (d < bestD) { bestD = d; best = p; }
        }
        if (!best) {
          // Feature ids shift when the contact slides onto a new face, so
          // fall back to pure proximity rather than dropping the impulse.
          for (const p of prev) {
            const d = p.point.distanceToSq(c.point);
            if (d < bestD) { bestD = d; best = p; }
          }
        }
        c.normalImpulse = best ? best.normalImpulse : 0;
        c.tangentImpulse[0] = best ? best.tangentImpulse[0] : 0;
        c.tangentImpulse[1] = best ? best.tangentImpulse[1] : 0;
      }

      m.contacts = contacts;
      live.add(key);

      // Waking rule. A merely *touching* neighbour must not wake anything —
      // otherwise every resting body keeps its neighbours (and itself) awake
      // forever and nothing in the scene ever sleeps. Only a brand-new
      // contact, or a neighbour that is genuinely moving, counts.
      //
      // "Moving" is read from `slowLastStep`, recorded at the end of the
      // previous step, NOT from the current velocity: gravity is integrated
      // before this runs, so every resting body is carrying a full step of
      // fall speed here and would look like it is moving.
      const aMoving = a.dynamic && a.awake && !a.slowLastStep;
      const bMoving = b.dynamic && b.awake && !b.slowLastStep;
      if (m.firstTouch || aMoving || bMoving) { a.wake(); b.wake(); }
      if (m.firstTouch) this.contactEvents.push(m);
    }

    // Deleting while iterating a Map is safe, but collect first so the
    // key list is not rebuilt into a throwaway array every step.
    const dead = this._dead;
    dead.length = 0;
    for (const key of this.manifolds.keys()) if (!live.has(key)) dead.push(key);
    for (let i = 0; i < dead.length; i++) this.manifolds.delete(dead[i]);
  }

  /* ---------------- solver ---------------- */

  _prepareContacts(dt) {
    const invDt = dt > 0 ? 1 / dt : 0;
    for (const m of this.manifolds.values()) {
      const { a, b } = m;
      if (a.isTrigger || b.isTrigger) continue;
      // A pair with no awake dynamic body has nothing to solve. Static
      // bodies are permanently 'awake', so test for dynamic-and-awake.
      if (!((a.dynamic && a.awake) || (b.dynamic && b.awake))) continue;
      // Mixing rules: geometric mean for friction, max for restitution —
      // a bouncy ball should bounce off a dull floor.
      m.friction = Math.sqrt(a.friction * b.friction);
      m.restitution = Math.max(a.restitution, b.restitution);

      for (const c of m.contacts) {
        c.rA = c.rA || new Vec3();
        c.rB = c.rB || new Vec3();
        c.rA.subVectors(c.point, a.position);
        c.rB.subVectors(c.point, b.position);

        c.normalMass = effectiveMass(a, b, c.rA, c.rB, c.normal);

        // Two tangents spanning the contact plane.
        c.t1 = c.t1 || new Vec3();
        c.t2 = c.t2 || new Vec3();
        c.normal.perpendicular(c.t1);
        c.t2.crossVectors(c.normal, c.t1).normalize();
        c.tangentMass = [
          effectiveMass(a, b, c.rA, c.rB, c.t1),
          effectiveMass(a, b, c.rA, c.rB, c.t2),
        ];

        // Restitution uses the approach speed measured before solving.
        const rv = relativeVelocity(a, b, c.rA, c.rB, _pv[4]);
        const vn = rv.dot(c.normal);
        c.velocityBias = 0;
        if (vn < -1.2) c.velocityBias = -m.restitution * vn;

        // Baumgarte term drives penetration out through pseudo-velocities,
        // so recovery never injects real kinetic energy into the scene.
        const pen = Math.max(0, c.depth - this.slop);
        c.positionBias = this.baumgarte * invDt * Math.min(pen, this.maxCorrection);
        // Pooled contacts are recycled, so this accumulator must be cleared
        // explicitly or it carries another pair's impulse into this one.
        c.pseudoImpulse = 0;
      }
    }
  }

  _warmStart() {
    const imp = _pv[5];
    for (const m of this.manifolds.values()) {
      const { a, b } = m;
      if (a.isTrigger || b.isTrigger) continue;
      // A pair with no awake dynamic body has nothing to solve. Static
      // bodies are permanently 'awake', so test for dynamic-and-awake.
      if (!((a.dynamic && a.awake) || (b.dynamic && b.awake))) continue;
      for (const c of m.contacts) {
        imp.copy(c.normal).scale(c.normalImpulse)
          .addScaled(c.t1, c.tangentImpulse[0])
          .addScaled(c.t2, c.tangentImpulse[1]);
        applyPairImpulse(a, b, c.rA, c.rB, imp, -1);
        applyPairImpulse(a, b, c.rA, c.rB, imp, 1);
      }
    }
  }

  /* The hot loop of the whole engine. Written in scalars rather than Vec3
     calls: at eight iterations over a few hundred manifolds this runs tens
     of thousands of times per step, and the method-call and property-load
     overhead of the vector API dominated everything else. */
  _solveVelocity() {
    const iterations = this.velocityIterations;
    for (let iter = 0; iter < iterations; iter++) {
      for (const j of this.joints) this._solveJoint(j);

      for (const m of this.manifolds.values()) {
        const a = m.a, b = m.b;
        if (a.isTrigger || b.isTrigger) continue;
        if (!((a.dynamic && a.awake) || (b.dynamic && b.awake))) continue;

        const imA = a.dynamic ? a.invMass : 0;
        const imB = b.dynamic ? b.invMass : 0;
        const IA = a.invInertiaWorld.e, IB = b.invInertiaWorld.e;
        const av = a.velocity, aw = a.angularVelocity;
        const bv = b.velocity, bw = b.angularVelocity;
        let avx = av.x, avy = av.y, avz = av.z;
        let awx = aw.x, awy = aw.y, awz = aw.z;
        let bvx = bv.x, bvy = bv.y, bvz = bv.z;
        let bwx = bw.x, bwy = bw.y, bwz = bw.z;
        const friction = m.friction;
        const contacts = m.contacts;

        for (let ci = 0; ci < contacts.length; ci++) {
          const c = contacts[ci];
          const rax = c.rA.x, ray = c.rA.y, raz = c.rA.z;
          const rbx = c.rB.x, rby = c.rB.y, rbz = c.rB.z;

          // Friction is solved first, clamped against the normal impulse
          // carried from the previous iteration. Solving it after the normal
          // pass makes the friction cone lag by one iteration and lets
          // resting boxes creep.
          for (let k = 0; k < 2; k++) {
            const t = k === 0 ? c.t1 : c.t2;
            const tx = t.x, ty = t.y, tz = t.z;
            const rvx = (bvx + bwy * rbz - bwz * rby) - (avx + awy * raz - awz * ray);
            const rvy = (bvy + bwz * rbx - bwx * rbz) - (avy + awz * rax - awx * raz);
            const rvz = (bvz + bwx * rby - bwy * rbx) - (avz + awx * ray - awy * rax);
            const vt = rvx * tx + rvy * ty + rvz * tz;

            const maxF = friction * c.normalImpulse;
            const old = c.tangentImpulse[k];
            let next = old - vt * c.tangentMass[k];
            next = next < -maxF ? -maxF : (next > maxF ? maxF : next);
            c.tangentImpulse[k] = next;
            const lambda = next - old;
            if (lambda !== 0) {
              const jx = tx * lambda, jy = ty * lambda, jz = tz * lambda;
              if (imA > 0) {
                avx -= jx * imA; avy -= jy * imA; avz -= jz * imA;
                const cx = -(ray * jz - raz * jy), cy = -(raz * jx - rax * jz), cz = -(rax * jy - ray * jx);
                awx += IA[0] * cx + IA[3] * cy + IA[6] * cz;
                awy += IA[1] * cx + IA[4] * cy + IA[7] * cz;
                awz += IA[2] * cx + IA[5] * cy + IA[8] * cz;
              }
              if (imB > 0) {
                bvx += jx * imB; bvy += jy * imB; bvz += jz * imB;
                const cx = rby * jz - rbz * jy, cy = rbz * jx - rbx * jz, cz = rbx * jy - rby * jx;
                bwx += IB[0] * cx + IB[3] * cy + IB[6] * cz;
                bwy += IB[1] * cx + IB[4] * cy + IB[7] * cz;
                bwz += IB[2] * cx + IB[5] * cy + IB[8] * cz;
              }
            }
          }

          // Normal.
          const nx = c.normal.x, ny = c.normal.y, nz = c.normal.z;
          const rvx = (bvx + bwy * rbz - bwz * rby) - (avx + awy * raz - awz * ray);
          const rvy = (bvy + bwz * rbx - bwx * rbz) - (avy + awz * rax - awx * raz);
          const rvz = (bvz + bwx * rby - bwy * rbx) - (avz + awx * ray - awy * rax);
          const vn = rvx * nx + rvy * ny + rvz * nz;

          const old = c.normalImpulse;
          // Contacts push, never pull.
          let next = old - (vn - c.velocityBias) * c.normalMass;
          if (next < 0) next = 0;
          c.normalImpulse = next;
          const lambda = next - old;
          if (lambda !== 0) {
            const jx = nx * lambda, jy = ny * lambda, jz = nz * lambda;
            if (imA > 0) {
              avx -= jx * imA; avy -= jy * imA; avz -= jz * imA;
              const cx = -(ray * jz - raz * jy), cy = -(raz * jx - rax * jz), cz = -(rax * jy - ray * jx);
              awx += IA[0] * cx + IA[3] * cy + IA[6] * cz;
              awy += IA[1] * cx + IA[4] * cy + IA[7] * cz;
              awz += IA[2] * cx + IA[5] * cy + IA[8] * cz;
            }
            if (imB > 0) {
              bvx += jx * imB; bvy += jy * imB; bvz += jz * imB;
              const cx = rby * jz - rbz * jy, cy = rbz * jx - rbx * jz, cz = rbx * jy - rby * jx;
              bwx += IB[0] * cx + IB[3] * cy + IB[6] * cz;
              bwy += IB[1] * cx + IB[4] * cy + IB[7] * cz;
              bwz += IB[2] * cx + IB[5] * cy + IB[8] * cz;
            }
          }

          if (next > a.impactImpulse) a.impactImpulse = next;
          if (next > b.impactImpulse) b.impactImpulse = next;
        }

        av.x = avx; av.y = avy; av.z = avz;
        aw.x = awx; aw.y = awy; aw.z = awz;
        bv.x = bvx; bv.y = bvy; bv.z = bvz;
        bw.x = bwx; bw.y = bwy; bw.z = bwz;
      }
    }
  }

  /* Split impulse: penetration is resolved on a separate velocity channel
     that is integrated into position and then discarded, so deep overlaps
     do not turn into launch energy. */
  _solvePosition() {
    const rv = _pv[8], imp = _pv[9];
    for (let iter = 0; iter < this.positionIterations; iter++) {
      for (const m of this.manifolds.values()) {
        const { a, b } = m;
        if (a.isTrigger || b.isTrigger) continue;
      // A pair with no awake dynamic body has nothing to solve. Static
      // bodies are permanently 'awake', so test for dynamic-and-awake.
      if (!((a.dynamic && a.awake) || (b.dynamic && b.awake))) continue;
        for (const c of m.contacts) {
          if (c.positionBias <= 0) continue;
          pseudoRelativeVelocity(a, b, c.rA, c.rB, rv);
          const vn = rv.dot(c.normal);
          let lambda = (c.positionBias - vn) * c.normalMass;
          const old = c.pseudoImpulse || 0;
          const next = Math.max(0, old + lambda);
          lambda = next - old;
          c.pseudoImpulse = next;
          imp.copy(c.normal).scale(lambda);
          applyPseudoImpulse(a, b, c.rA, c.rB, imp, -1);
          applyPseudoImpulse(a, b, c.rA, c.rB, imp, 1);
        }
      }
    }
  }

  _solveJoint(j) {
    if (j.broken) return;
    const { a, b } = j;
    const pa = _pv[10].copy(j.localA).applyQuat(a.quaternion).add(a.position);
    const pb = _pv[11].copy(j.localB).applyQuat(b.quaternion).add(b.position);
    const rA = _pv[12].subVectors(pa, a.position);
    const rB = _pv[13].subVectors(pb, b.position);
    const delta = _pv[14].subVectors(pb, pa);

    if (j.type === 'distance') {
      const dist = delta.length();
      if (dist < 1e-6) return;
      const n = delta.scale(1 / dist);
      const err = dist - j.distance;
      // A rope only pulls; a rod also pushes.
      if (j.rope && err < 0) return;
      const mass = effectiveMass(a, b, rA, rB, n);
      relativeVelocity(a, b, rA, rB, _pv[15]);
      const vn = _pv[15].dot(n);
      const bias = 0.25 * err / Math.max(this.fixedStep, 1e-5);
      const lambda = -(vn + bias) * mass * j.stiffness;
      const imp = _pv[0].copy(n).scale(lambda);
      if (Math.abs(lambda) > j.breakForce) { j.broken = true; return; }
      applyPairImpulse(a, b, rA, rB, imp, -1);
      applyPairImpulse(a, b, rA, rB, imp, 1);
      return;
    }

    // Ball/hinge: drive the two anchor points together on all three axes.
    const axes = [_pv[0].set(1, 0, 0), _pv[1].set(0, 1, 0), _pv[2].set(0, 0, 1)];
    let total = 0;
    for (const n of axes) {
      const mass = effectiveMass(a, b, rA, rB, n);
      relativeVelocity(a, b, rA, rB, _pv[15]);
      const vn = _pv[15].dot(n);
      const err = delta.dot(n);
      const bias = 0.22 * err / Math.max(this.fixedStep, 1e-5);
      const lambda = -(vn + bias) * mass * j.stiffness;
      total += Math.abs(lambda);
      const imp = _pv[3].copy(n).scale(lambda);
      applyPairImpulse(a, b, rA, rB, imp, -1);
      applyPairImpulse(a, b, rA, rB, imp, 1);
    }
    if (total > j.breakForce) j.broken = true;

    if (j.type === 'hinge') {
      // Kill angular velocity off the hinge axis so it behaves like a door.
      const axis = _pv[4].copy(j.axisA).applyQuat(a.quaternion).normalize();
      const relAng = _pv[5].subVectors(b.angularVelocity, a.angularVelocity);
      const along = axis.dot(relAng);
      const perp = _pv[6].copy(relAng).addScaled(axis, -along).scale(0.5 * j.stiffness);
      if (a.dynamic && !a.lockRotation) a.angularVelocity.add(perp);
      if (b.dynamic && !b.lockRotation) b.angularVelocity.sub(perp);
    }
  }

  /* ---------------- integration ---------------- */

  _integrateVelocities(dt) {
    for (const b of this.bodies) {
      if (!b.dynamic || !b.awake) continue;
      b.velocity.addScaled(this.gravity, dt * b.gravityScale);
      b.velocity.addScaled(b.force, b.invMass * dt);
      if (!b.lockRotation) {
        b.invInertiaWorld.transformVec3(b.torque, _pv[0]);
        b.angularVelocity.addScaled(_pv[0], dt);
      }
      // Exponential damping is stable at any timestep, unlike v *= (1 - k*dt).
      const ld = Math.pow(Math.max(0, 1 - b.linearDamping), dt * 60);
      const ad = Math.pow(Math.max(0, 1 - b.angularDamping), dt * 60);
      b.velocity.scale(ld);
      b.angularVelocity.scale(ad);
      b.force.setScalar(0);
      b.torque.setScalar(0);
    }
  }

  _integratePositions(dt) {
    for (const b of this.bodies) {
      if (!b.dynamic || !b.awake) continue;

      // Speed clamp: a body that outruns its own size in one step tunnels
      // straight through walls, and no solver can recover from that.
      const maxSpeed = Math.max(2, b.shape.boundRadius) / Math.max(dt, 1e-5) * 0.45;
      if (b.velocity.lengthSq() > maxSpeed * maxSpeed) b.velocity.setLength(maxSpeed);
      const maxSpin = 32;
      if (b.angularVelocity.lengthSq() > maxSpin * maxSpin) b.angularVelocity.setLength(maxSpin);

      b.position.addScaled(b.velocity, dt);
      b.position.addScaled(b.pseudoVelocity, dt);
      if (!b.lockRotation) {
        b.quaternion.integrate(b.angularVelocity, dt);
        if (b.pseudoAngular.lengthSq() > 1e-12) b.quaternion.integrate(b.pseudoAngular, dt);
      }
      b.pseudoVelocity.setScalar(0);
      b.pseudoAngular.setScalar(0);

      if (!b.position.isFinite()) {
        // Numerical blowup: park the body rather than poisoning the world.
        b.position.set(0, 0, 0);
        b.velocity.setScalar(0);
        b.angularVelocity.setScalar(0);
      }
      b.updateInertiaWorld();
    }
  }

  /* Sleeping is decided per *island* — a connected group of bodies touching
     through contacts or joints — not per body.

     A sleeping body is skipped during integration but still has finite mass
     in the solver, so it silently absorbs the impulses its neighbours push
     into it. Let the bottom box of a stack sleep on its own and everything
     above it loses support and drops. Islands make that impossible: either
     the whole stack is asleep or none of it is. */
  _updateSleep(dt) {
    const bodies = this.bodies;

    for (const b of bodies) {
      if (!b.dynamic) continue;
      const slow = b.velocity.lengthSq() < this.sleepLinear * this.sleepLinear
        && b.angularVelocity.lengthSq() < this.sleepAngular * this.sleepAngular;
      // Recorded after the solver has settled the step, so the next step's
      // wake test sees resting bodies as resting.
      b.slowLastStep = slow;
      if (slow) b.sleepTimer += dt;
      else b.sleepTimer = 0;
    }

    // Union-find over contacts and joints.
    const index = this._islandIndex;
    const parent = this._islandParent;
    index.clear();
    parent.length = 0;
    for (const b of bodies) {
      if (!b.dynamic) continue;
      index.set(b, parent.length);
      parent.push(parent.length);
    }
    if (!parent.length) return;

    const find = (x) => {
      let r = x;
      while (parent[r] !== r) r = parent[r];
      while (parent[x] !== r) { const n = parent[x]; parent[x] = r; x = n; }
      return r;
    };
    const union = (x, y) => {
      const rx = find(x), ry = find(y);
      if (rx !== ry) parent[ry] = rx;
    };
    const link = (a, b) => {
      // Static bodies do not join islands: they are shared by everything and
      // would merge the entire scene into one island that never sleeps.
      if (!a.dynamic || !b.dynamic) return;
      union(index.get(a), index.get(b));
    };

    for (const m of this.manifolds.values()) link(m.a, m.b);
    for (const j of this.joints) if (!j.broken) link(j.a, j.b);

    // Fold each island down to "can the whole group sleep?".
    const canSleep = this._islandCanSleep;
    canSleep.clear();
    for (const b of bodies) {
      if (!b.dynamic) continue;
      const root = find(index.get(b));
      const ok = b.canSleep && b.sleepTimer > this.sleepTime;
      if (!canSleep.has(root)) canSleep.set(root, ok);
      else if (!ok) canSleep.set(root, false);
    }

    for (const b of bodies) {
      if (!b.dynamic) continue;
      const ok = canSleep.get(find(index.get(b)));
      if (ok) { if (b.awake) b.sleep(); }
      else b.awake = true;
    }
  }

  /* One fixed step. */
  fixedUpdate(dt) {
    this.stamp++;
    for (const b of this.bodies) {
      b.impactImpulse = 0;
      if (b.dynamic && b.awake) b.updateInertiaWorld();
    }
    this._integrateVelocities(dt);
    const pairs = this._broadphase();
    this._narrowphase(pairs);
    this._prepareContacts(dt);
    this._warmStart();
    this._solveVelocity();
    this._solvePosition();
    this._cacheImpulses();
    this._integratePositions(dt);
    this._updateSleep(dt);
    this.joints = this.joints.filter((j) => !j.broken);
  }

  /* Snapshot solved impulses into storage that survives the next
     pool.reset(), so the following step can warm-start from them. */
  _cacheImpulses() {
    for (const m of this.manifolds.values()) {
      const n = m.contacts.length;
      while (m.cache.length < n) m.cache.push({ point: new Vec3(), id: 0, normalImpulse: 0, tangentImpulse: [0, 0] });
      if (m.cache.length > n) m.cache.length = n;
      for (let i = 0; i < n; i++) {
        const c = m.contacts[i], s = m.cache[i];
        s.point.copy(c.point);
        s.id = c.id;
        s.normalImpulse = c.normalImpulse;
        s.tangentImpulse[0] = c.tangentImpulse[0];
        s.tangentImpulse[1] = c.tangentImpulse[1];
      }
    }
  }

  /* Accumulator-driven stepping keeps simulation deterministic regardless of
     display refresh rate, and caps work so a slow frame cannot spiral. */
  step(frameDt) {
    const dt = this.fixedStep;
    this.accumulator += Math.min(frameDt, 0.25);
    let steps = 0;
    while (this.accumulator >= dt && steps < this.maxSubSteps) {
      this.fixedUpdate(dt);
      this.accumulator -= dt;
      steps++;
    }
    if (steps === this.maxSubSteps) this.accumulator = 0;
    return steps;
  }

  /* ---------------- queries ---------------- */

  raycast(origin, direction, maxDist = 1000, filter = null) {
    const o = Vec3.from(origin);
    const d = Vec3.from(direction).normalize();
    let best = null, bestT = maxDist;
    const localO = new Vec3(), localD = new Vec3(), n = new Vec3();

    for (const b of this.bodies) {
      if (filter && !filter(b)) continue;
      if (b.isTrigger) continue;

      if (b.shape.type === SHAPE.SPHERE) {
        const t = raySphere(o, d, b.position, b.shape.radius);
        if (t >= 0 && t < bestT) {
          bestT = t;
          const p = new Vec3().copy(o).addScaled(d, t);
          const nn = new Vec3().subVectors(p, b.position).normalize();
          best = { body: b, distance: t, point: p, normal: nn };
        }
      } else if (b.shape.type === SHAPE.PLANE) {
        const pn = new Vec3().copy(b.shape.normal).applyQuat(b.quaternion);
        const denom = pn.dot(d);
        if (Math.abs(denom) < 1e-8) continue;
        const offset = b.shape.offset + pn.dot(b.position);
        const t = (offset - pn.dot(o)) / denom;
        if (t >= 0 && t < bestT) {
          bestT = t;
          best = {
            body: b, distance: t,
            point: new Vec3().copy(o).addScaled(d, t),
            normal: denom < 0 ? pn : pn.clone().negate(),
          };
        }
      } else {
        // Cheap reject against the bounding sphere before the face walk.
        if (raySphere(o, d, b.position, b.shape.boundRadius) < 0) continue;
        worldToLocal(b, o, localO);
        localD.copy(d).applyQuatInv(b.quaternion);
        const t = rayConvex(localO, localD, b.shape, n);
        if (t >= 0 && t < bestT) {
          bestT = t;
          best = {
            body: b, distance: t,
            point: new Vec3().copy(o).addScaled(d, t),
            normal: n.clone().applyQuat(b.quaternion),
          };
        }
      }
    }
    return best;
  }

  /* Every body whose bounding sphere touches the given sphere. */
  overlapSphere(center, radius, filter = null) {
    const c = Vec3.from(center);
    const found = [];
    for (const b of this.bodies) {
      if (filter && !filter(b)) continue;
      if (b.shape.type === SHAPE.PLANE) continue;
      const r = radius + b.shape.boundRadius;
      if (b.position.distanceToSq(c) <= r * r) found.push(b);
    }
    return found;
  }

  /* Radial impulse — the standard "something exploded here" primitive. */
  explode(center, radius, strength, upBias = 0.35) {
    const c = Vec3.from(center);
    const dir = new Vec3();
    const affected = [];
    for (const b of this.bodies) {
      if (!b.dynamic) continue;
      dir.subVectors(b.position, c);
      const dist = dir.length();
      if (dist > radius) continue;
      if (dist < 1e-4) dir.set(0, 1, 0); else dir.scale(1 / dist);
      dir.y += upBias;
      dir.normalize();
      // Linear falloff reads better than inverse-square: the blast edge is
      // visible, which players need in order to judge it.
      const falloff = 1 - dist / radius;
      const j = strength * falloff * Math.max(b.mass, 0.1);
      b.applyImpulse(dir.clone().scale(j), b.position);
      b.impactImpulse = Math.max(b.impactImpulse, j);
      affected.push(b);
    }
    return affected;
  }
}

/* ---------------- solver maths ---------------- */

const _em = [new Vec3(), new Vec3(), new Vec3(), new Vec3()];

/* 1 / (nᵀ K n) for the two-body contact Jacobian. */
function effectiveMass(a, b, rA, rB, n) {
  let m = a.invMass + b.invMass;
  if (a.invMass > 0 && !a.lockRotation) {
    const c = _em[0].crossVectors(rA, n);
    a.invInertiaWorld.transformVec3(c, _em[1]);
    m += _em[1].cross(rA).dot(n);
  }
  if (b.invMass > 0 && !b.lockRotation) {
    const c = _em[2].crossVectors(rB, n);
    b.invInertiaWorld.transformVec3(c, _em[3]);
    m += _em[3].cross(rB).dot(n);
  }
  return m > 1e-12 ? 1 / m : 0;
}

function relativeVelocity(a, b, rA, rB, out) {
  out.crossVectors(b.angularVelocity, rB).add(b.velocity);
  const va = _em[0].crossVectors(a.angularVelocity, rA).add(a.velocity);
  return out.sub(va);
}

function pseudoRelativeVelocity(a, b, rA, rB, out) {
  out.crossVectors(b.pseudoAngular, rB).add(b.pseudoVelocity);
  const va = _em[0].crossVectors(a.pseudoAngular, rA).add(a.pseudoVelocity);
  return out.sub(va);
}

/* sign = -1 applies -impulse to A, sign = +1 applies +impulse to B. */
function applyPairImpulse(a, b, rA, rB, impulse, sign) {
  const body = sign < 0 ? a : b;
  if (!body.dynamic) return;
  const r = sign < 0 ? rA : rB;
  const s = sign < 0 ? -1 : 1;
  body.velocity.addScaled(impulse, body.invMass * s);
  if (!body.lockRotation) {
    const t = _em[1].crossVectors(r, impulse).scale(s);
    body.invInertiaWorld.transformVec3(t, _em[2]);
    body.angularVelocity.add(_em[2]);
  }
}

function applyPseudoImpulse(a, b, rA, rB, impulse, sign) {
  const body = sign < 0 ? a : b;
  if (!body.dynamic) return;
  const r = sign < 0 ? rA : rB;
  const s = sign < 0 ? -1 : 1;
  body.pseudoVelocity.addScaled(impulse, body.invMass * s);
  if (!body.lockRotation) {
    const t = _em[1].crossVectors(r, impulse).scale(s);
    body.invInertiaWorld.transformVec3(t, _em[2]);
    body.pseudoAngular.add(_em[2]);
  }
}
