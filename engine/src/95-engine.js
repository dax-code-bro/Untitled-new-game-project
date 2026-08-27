/* ============================================================
   ENGINE — the layer everything else is written against.

   The design rule here: the common thing is one line, and the
   uncommon thing is still possible. `game.box({at:[0,3,0]})`
   creates geometry, a material, a rigid body, shadow casting and
   an instanced draw — because that is what someone asking for a
   box actually wants.
   ============================================================ */

let _actorId = 0;

class Actor {
  constructor(engine, opts = {}) {
    this.id = _actorId++;
    this.engine = engine;
    this.name = opts.name || `actor${this.id}`;
    this.mesh = opts.mesh || null;
    this.material = opts.material || null;
    this.body = opts.body || null;
    this.visible = opts.visible !== false;
    this.scale = Vec3.from(opts.scale != null ? opts.scale : 1);
    this.tint = parseColor(opts.tint != null ? opts.tint : 0xffffff);
    this.custom = 0;

    // Actors without a body carry their own transform.
    this._position = Vec3.from(opts.at || opts.position || [0, 0, 0]);
    this._rotation = Quat.from(opts.rotation || null);
    this.matrix = new Mat4();

    this.skeleton = opts.skeleton || null;
    this.animator = opts.animator || null;
    this.face = opts.face || null;
    this.destructible = opts.destructible || null;
    this.controller = opts.controller || null;
    this.parentBone = opts.parentBone != null ? opts.parentBone : -1;
    this.parent = opts.parent || null;
    this.localOffset = Vec3.from(opts.offset || [0, 0, 0]);
    this.lifetime = opts.lifetime != null ? opts.lifetime : Infinity;
    this.onUpdate = opts.onUpdate || null;
    this.userData = opts.userData || null;
    this.boundRadius = opts.boundRadius != null ? opts.boundRadius : 1;
    this.dead = false;

    if (this.body) this.body.actor = this;
  }

  get position() { return this.body ? this.body.position : this._position; }
  get rotation() { return this.body ? this.body.quaternion : this._rotation; }

  setPosition(p) {
    const v = Vec3.from(p);
    if (this.body) this.body.setPosition(v); else this._position.copy(v);
    return this;
  }
  setRotation(r) {
    const q = Quat.from(r);
    if (this.body) { this.body.quaternion.copy(q); this.body.wake(); } else this._rotation.copy(q);
    return this;
  }
  setScale(s) { this.scale.copy(Vec3.from(s)); return this; }
  setTint(c) { parseColor(c, this.tint); return this; }

  /* Impulse expressed in "how fast should this end up moving" rather than
     raw N·s, because hand-tuned impulses are meaningless once density
     changes the mass. */
  push(direction, speed = 5, atPoint = null) {
    if (!this.body) return this;
    const d = Vec3.from(direction);
    if (d.lengthSq() > 1e-9) d.normalize();
    this.body.applyImpulse(d.scale(speed * this.body.mass), atPoint ? Vec3.from(atPoint) : null);
    return this;
  }
  setVelocity(v) { if (this.body) this.body.setVelocity(v); return this; }
  get velocity() { return this.body ? this.body.velocity : Vec3.ZERO; }

  updateMatrix() {
    if (this.controller) {
      // A character's visual transform comes from its controller, not from
      // the rigid body's orientation: the body has rotation locked (so it
      // cannot topple), which means its quaternion is always identity and
      // carries no facing information at all.
      _aPos.copy(this.controller.body.position);
      if (this.visualOffset) _aPos.add(this.visualOffset);
      _aQuat.setEuler(0, this.controller.facing, 0);
      this.matrix.compose(_aPos, _aQuat, this.scale);
      return this.matrix;
    }
    if (this.parent && this.parentBone >= 0 && this.parent.skeleton) {
      // Follow a bone: used for heads, held items and attached effects.
      const bone = this.parent.skeleton.bones[this.parentBone];
      _aTmp.compose(this.localOffset, this._rotation, this.scale);
      _aTmp2.mulMatrices(this.parent.matrix, bone.worldMatrix);
      this.matrix.mulMatrices(_aTmp2, _aTmp);
    } else if (this.parent) {
      _aTmp.compose(this._position, this._rotation, this.scale);
      this.matrix.mulMatrices(this.parent.matrix, _aTmp);
    } else {
      this.matrix.compose(this.position, this.rotation, this.scale);
    }
    return this.matrix;
  }

  writeInstance(buffer, offset) {
    buffer.set(this.matrix.e, offset);
    buffer[offset + 16] = this.tint.x;
    buffer[offset + 17] = this.tint.y;
    buffer[offset + 18] = this.tint.z;
    buffer[offset + 19] = this.custom;
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    if (this.body) this.engine.physics.remove(this.body);
    this.engine._removeActor(this);
  }
}

const _aTmp = new Mat4();
const _aTmp2 = new Mat4();
const _aPos = new Vec3();
const _aQuat = new Quat();

/* ---------------- sky presets ---------------- */

const SKY_PRESETS = {
  day: {
    zenith: 0x2a5aa8, horizon: 0xa8c4e0, ground: 0x4a453c,
    sun: [0.42, 0.78, 0.46], sunColor: 0xfff2dd, sunIntensity: 3.6,
    fog: 0xa8c0dc, fogDensity: 0.0045, clouds: 0.4, exposure: 1.0,
  },
  sunset: {
    // Golden hour, not dusk. At 8 degrees of elevation the sun contributes
    // almost nothing to an upward-facing surface and the whole scene falls
    // back to ambient, which reads as muddy rather than warm.
    zenith: 0x1e3266, horizon: 0xff9a4a, ground: 0x4a3628,
    sun: [0.80, 0.36, 0.32], sunColor: 0xffc078, sunIntensity: 4.4,
    fog: 0xe08a50, fogDensity: 0.0055, clouds: 0.55, exposure: 1.15,
  },
  night: {
    zenith: 0x06091a, horizon: 0x141c38, ground: 0x0a0c14,
    sun: [0.3, 0.6, 0.4], sunColor: 0x8fa8d8, sunIntensity: 0.45,
    fog: 0x0c1226, fogDensity: 0.010, clouds: 0.3, exposure: 1.5,
  },
  overcast: {
    zenith: 0x8a94a2, horizon: 0xa8b0ba, ground: 0x494c50,
    sun: [0.3, 0.85, 0.4], sunColor: 0xd8dce4, sunIntensity: 1.4,
    fog: 0x9aa4b0, fogDensity: 0.011, clouds: 0.95, exposure: 1.05,
  },
  dawn: {
    zenith: 0x2a4a80, horizon: 0xffc8a0, ground: 0x4c473c,
    sun: [-0.66, 0.38, 0.46], sunColor: 0xffd8b0, sunIntensity: 3.4,
    fog: 0xd8c0b0, fogDensity: 0.008, clouds: 0.45, exposure: 1.1,
  },
  hell: {
    zenith: 0x200608, horizon: 0x8a1c08, ground: 0x3a1408,
    sun: [0.4, 0.55, 0.6], sunColor: 0xff7030, sunIntensity: 3.0,
    fog: 0x601408, fogDensity: 0.015, clouds: 0.7, exposure: 1.1,
  },
  space: {
    zenith: 0x02030a, horizon: 0x060814, ground: 0x02030a,
    sun: [0.5, 0.4, 0.6], sunColor: 0xffffff, sunIntensity: 5.5,
    fog: 0x02030a, fogDensity: 0.0, clouds: 0, exposure: 1.1,
  },
  toxic: {
    zenith: 0x1a3020, horizon: 0x86b040, ground: 0x2a3418,
    sun: [0.4, 0.6, 0.5], sunColor: 0xc8e070, sunIntensity: 2.4,
    fog: 0x7a9a40, fogDensity: 0.013, clouds: 0.6, exposure: 1.0,
  },
};

/* ---------------- Engine ---------------- */

class Engine {
  constructor(opts = {}) {
    this.canvas = resolveCanvas(opts.canvas);
    this.renderer = new Renderer(this.canvas, opts);
    this.gl = this.renderer.gl;
    this.physics = new PhysicsWorld({
      gravity: opts.gravity != null
        ? (typeof opts.gravity === 'number' ? [0, opts.gravity, 0] : opts.gravity)
        : [0, -19.6, 0],
      fixedStep: opts.fixedStep || 1 / 60,
    });
    this.camera = new Camera(opts.camera || {});
    this.input = new Input(window);
    this.audio = new Audio();
    this.particles = new ParticleSystem(this.gl, opts.maxParticles || 4000);
    this.fluid = null;
    this.grass = null;

    this.actors = [];
    this.materialCache = new Map();
    this.meshCache = new Map();
    this._batchGroups = new Map();
    // Fracture patterns are expensive to compute and identical for identical
    // shapes, so they are baked once and shared. Seeds are folded into a
    // small set of variants: six distinct shatter patterns reused across
    // hundreds of objects is indistinguishable from a unique one each.
    this._fractureCache = new Map();
    this._batchList = [];
    this._individual = [];
    this._planes = new Float32Array(24);

    this.time = 0;
    this.frame = 0;
    this.running = false;
    this.paused = false;
    this._updateHooks = [];
    this._lateHooks = [];
    this._lastTime = 0;
    this.timeScale = 1;
    this.wind = { direction: new Vec3(1, 0, 0.35).normalize(), strength: 0.35 };
    this.renderer.wind = this.wind;

    this.chunkBudget = opts.chunkBudget || 260;
    this.activeChunks = [];
    this.frustumCulling = opts.frustumCulling !== false;
    this.stats = { fps: 0, actors: 0, draws: 0, bodies: 0, particles: 0 };
    this._fpsAccum = 0;
    this._fpsFrames = 0;

    // Camera control state.
    this._camMode = 'manual';
    this._camTarget = null;
    this._camConfig = {};
    this._camYaw = 0;
    this._camPitch = 0.32;
    this._camDist = 8;

    this.setSky(opts.sky || 'day');
    this._bindResize();
    this._bindCameraInput();

    // The first user gesture is the only moment audio may legally start.
    const unlock = () => { this.audio.ensure(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  /* ---------------- environment ---------------- */

  setSky(name, overrides = {}) {
    const p = typeof name === 'string' ? (SKY_PRESETS[name] || SKY_PRESETS.day) : name;
    const cfg = Object.assign({}, p, overrides);
    const r = this.renderer;
    parseColor(cfg.zenith, r.sky.zenith);
    parseColor(cfg.horizon, r.sky.horizon);
    parseColor(cfg.ground, r.sky.ground);
    r.sky.clouds = cfg.clouds != null ? cfg.clouds : r.sky.clouds;
    r.sun.direction.copy(Vec3.from(cfg.sun)).normalize();
    parseColor(cfg.sunColor, r.sun.color);
    r.sun.intensity = cfg.sunIntensity != null ? cfg.sunIntensity : r.sun.intensity;
    parseColor(cfg.fog, r.fog.color);
    if (cfg.fogDensity != null) r.fog.density = cfg.fogDensity;
    if (cfg.exposure != null) r.post.exposure = cfg.exposure;
    this.skyName = typeof name === 'string' ? name : 'custom';
    return this;
  }

  /* Move the sun by time of day, 0..24. Handy for day/night cycles. */
  setTimeOfDay(hours) {
    const t = ((hours % 24) + 24) / 24 % 1;
    const angle = (t - 0.25) * TAU;
    const elev = Math.sin(angle);
    this.renderer.sun.direction.set(Math.cos(angle) * 0.7, elev, 0.35).normalize();
    // Warm and dim at the horizon, white and bright overhead.
    const day = clamp(elev * 2 + 0.15, 0, 1);
    this.renderer.sun.intensity = lerp(0.15, 3.8, day);
    this.renderer.sky.intensity = lerp(0.12, 1, clamp(elev * 3 + 0.2, 0, 1));
    const warm = 1 - clamp(Math.abs(elev) * 2.2, 0, 1);
    this.renderer.sun.color.set(1, lerp(0.94, 0.62, warm), lerp(0.86, 0.34, warm));
    return this;
  }

  setWind(direction, strength) {
    if (direction) this.wind.direction.copy(Vec3.from(direction)).normalize();
    if (strength != null) this.wind.strength = strength;
    return this;
  }

  light(opts = {}) {
    const l = {
      position: Vec3.from(opts.at || opts.position || [0, 3, 0]),
      color: parseColor(opts.color != null ? opts.color : 0xffd6a0),
      intensity: opts.intensity != null ? opts.intensity : 12,
      radius: opts.radius != null ? opts.radius : 12,
    };
    this.renderer.lights.push(l);
    return l;
  }

  /* ---------------- resources ---------------- */

  material(spec) { return resolveMaterial(this.gl, spec, this.materialCache); }

  /* Meshes are cached by key and always unit-sized: size is applied through
     the transform, so every box in the scene shares one mesh and therefore
     one instanced draw call. */
  _mesh(key, build) {
    let m = this.meshCache.get(key);
    if (!m) {
      const geo = build();
      m = new GpuMesh(this.gl, geo);
      m.setupInstancing(20);
      m.__key = key;
      this.meshCache.set(key, m);
    }
    return m;
  }

  /* ---------------- actor factories ---------------- */

  _spawn(opts, mesh, shape, boundRadius) {
    const material = this.material(opts.material != null ? opts.material : 0xcccccc);
    let body = null;
    if (opts.physics !== false && shape) {
      body = new Body(shape, {
        position: opts.at || opts.position || [0, 0, 0],
        rotation: opts.rotation,
        static: !!opts.static || opts.mass === 0,
        kinematic: !!opts.kinematic,
        trigger: !!opts.trigger,
        mass: opts.mass,
        density: opts.density,
        restitution: opts.bounce != null ? opts.bounce : opts.restitution,
        friction: opts.friction,
        velocity: opts.velocity,
        lockRotation: opts.lockRotation,
        gravityScale: opts.gravityScale,
        canSleep: opts.canSleep,
        group: opts.group,
        mask: opts.mask,
      });
      this.physics.add(body);
    }

    const actor = new Actor(this, {
      name: opts.name,
      mesh,
      material,
      body,
      visible: opts.visible,
      at: opts.at || opts.position,
      rotation: opts.rotation,
      scale: opts.scale,
      tint: opts.tint,
      lifetime: opts.lifetime,
      onUpdate: opts.onUpdate,
      userData: opts.userData,
      boundRadius,
    });

    if (opts.breakable || opts.destructible) {
      const d = typeof opts.breakable === 'object' ? opts.breakable : (opts.destructible || {});
      actor.destructible = new Destructible(actor, Object.assign({ seed: actor.id + 1 }, d));
      actor.destructible.sourceShape = shape;
      actor.destructible.sourceOpts = opts;
      this.prewarmFracture(actor);
    }

    this.actors.push(actor);
    return actor;
  }

  box(opts = {}) {
    const size = Vec3.from(opts.size != null ? opts.size : 1);
    const mesh = this._mesh('box', () => Shapes.box(1, 1, 1, 1));
    const shape = opts.physics === false ? null : Shape.box(size.x / 2, size.y / 2, size.z / 2);
    const a = this._spawn(opts, mesh, shape, size.length() * 0.5);
    a.scale.copy(size);
    // Texture density should follow object size, or a big wall looks blurry
    // next to a small crate.
    if (a.material.uvScale === 1 && !opts.uvScale) a.material.uvScale = 1;
    return a;
  }

  sphere(opts = {}) {
    const r = opts.radius != null ? opts.radius : (opts.size != null ? opts.size / 2 : 0.5);
    const mesh = this._mesh('sphere', () => Shapes.sphere(0.5, 20, 28));
    const shape = opts.physics === false ? null : Shape.sphere(r);
    const a = this._spawn(opts, mesh, shape, r);
    a.scale.setScalar(r * 2);
    return a;
  }

  cylinder(opts = {}) {
    const r = opts.radius != null ? opts.radius : 0.5;
    const h = opts.height != null ? opts.height : 1;
    const mesh = this._mesh('cylinder', () => Shapes.cylinder(0.5, 1, 20));
    const shape = opts.physics === false ? null : Shape.cylinder(r, h, 12);
    const a = this._spawn(opts, mesh, shape, Math.sqrt(r * r + h * h / 4));
    a.scale.set(r * 2, h, r * 2);
    return a;
  }

  cone(opts = {}) {
    const r = opts.radius != null ? opts.radius : 0.5;
    const h = opts.height != null ? opts.height : 1;
    const mesh = this._mesh('cone', () => Shapes.cone(0.5, 1, 20));
    const pts = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      pts.push(new Vec3(Math.cos(a) * r, -h / 2, Math.sin(a) * r));
    }
    pts.push(new Vec3(0, h / 2, 0));
    const shape = opts.physics === false ? null : Shape.convex(pts);
    const a = this._spawn(opts, mesh, shape, Math.sqrt(r * r + h * h));
    a.scale.set(r * 2, h, r * 2);
    return a;
  }

  capsule(opts = {}) {
    const r = opts.radius != null ? opts.radius : 0.35;
    const h = opts.height != null ? opts.height : 1.6;
    const key = `capsule:${r.toFixed(3)}:${h.toFixed(3)}`;
    const mesh = this._mesh(key, () => Shapes.capsule(r, h, 8, 16));
    const shape = opts.physics === false ? null : Shape.capsuleApprox(r, h);
    return this._spawn(opts, mesh, shape, h / 2);
  }

  rock(opts = {}) {
    const r = opts.radius != null ? opts.radius : 0.5;
    const seed = opts.seed != null ? opts.seed : 7;
    const key = `rock:${seed}`;
    const mesh = this._mesh(key, () => Shapes.rock(0.5, seed, opts.detail || 2));
    // Physics uses a cheap hull of the same silhouette rather than the full
    // display mesh — a 250-triangle collider would be pointless precision.
    const pts = [];
    const rng = new Rng(seed);
    for (let i = 0; i < 14; i++) pts.push(rng.unitVec3().scale(r * rng.range(0.78, 1.12)));
    const shape = opts.physics === false ? null : Shape.convex(pts);
    const a = this._spawn(Object.assign({ material: 'rock' }, opts), mesh, shape, r * 1.2);
    a.scale.setScalar(r * 2);
    return a;
  }

  /* Infinite ground plane plus a visible slab. */
  ground(opts = {}) {
    const size = opts.size != null ? opts.size : 200;
    const segments = opts.segments || (opts.heightFn ? 96 : 1);
    const heightFn = opts.heightFn || null;
    const key = `ground:${size}:${segments}:${heightFn ? 'h' + (opts.seed || 0) : 'flat'}`;
    const mesh = this._mesh(key, () => Shapes.terrain(size, segments, heightFn || (() => 0), opts.uvScale || 0.35));

    const actor = new Actor(this, {
      name: 'ground',
      mesh,
      material: this.material(opts.material != null ? opts.material : 'grass'),
      at: opts.at || [0, 0, 0],
      boundRadius: size,
    });
    actor.noCull = true;
    this.actors.push(actor);

    if (opts.physics !== false) {
      if (heightFn) {
        // A displaced terrain cannot be a plane; approximate with a plane at
        // the minimum height plus static boxes is overkill, so the plane sits
        // at the average and the mesh is decorative above it.
        actor.body = null;
        const plane = new Body(Shape.plane([0, 1, 0], opts.groundLevel != null ? opts.groundLevel : 0), {
          static: true, friction: opts.friction != null ? opts.friction : 0.7,
        });
        this.physics.add(plane);
        this.groundBody = plane;
      } else {
        const plane = new Body(Shape.plane([0, 1, 0], (opts.at ? Vec3.from(opts.at).y : 0)), {
          static: true,
          friction: opts.friction != null ? opts.friction : 0.7,
          restitution: opts.bounce != null ? opts.bounce : 0,
        });
        this.physics.add(plane);
        this.groundBody = plane;
        plane.actor = actor;
      }
      this.particles.groundY = (opts.at ? Vec3.from(opts.at).y : 0) + 0.02;
    }

    if (opts.grass) {
      const g = typeof opts.grass === 'object' ? opts.grass : {};
      this.addGrass(Object.assign({
        area: Math.min(size, 90),
        heightFn,
        center: opts.at || [0, 0, 0],
      }, g));
    }
    return actor;
  }

  addGrass(opts = {}) {
    const max = Math.min(opts.max || this.renderer.quality.maxGrass, this.renderer.quality.maxGrass);
    this.grass = new Grass(this.gl, Object.assign({}, opts, { max }));
    return this.grass;
  }

  /* Water volume. Particle count is capped by quality tier. */
  water(opts = {}) {
    const cap = { low: 900, medium: 2000, high: 3600, ultra: 6000 }[this.renderer.qualityName] || 2000;
    if (!this.fluid) {
      this.fluid = new Fluid(this.gl, {
        capacity: opts.capacity || cap,
        radius: opts.radius || 0.24,
        viscosity: opts.viscosity,
        vorticity: opts.vorticity,
        bounds: opts.bounds,
      });
      // Water collides with the same bodies everything else does.
      this.fluid.colliders = this.physics.bodies;
    }
    if (opts.at || opts.size) {
      const at = Vec3.from(opts.at || [0, 2, 0]);
      const size = Vec3.from(opts.size != null ? opts.size : 2);
      this.fluid.fillBox(
        new Vec3(at.x - size.x / 2, at.y - size.y / 2, at.z - size.z / 2),
        new Vec3(at.x + size.x / 2, at.y + size.y / 2, at.z + size.z / 2),
        { velocity: opts.velocity ? Vec3.from(opts.velocity) : null },
      );
    }
    if (opts.color) parseColor(opts.color, this.renderer.water.color);
    if (opts.deepColor) parseColor(opts.deepColor, this.renderer.water.deep);
    return this.fluid;
  }

  /* A humanoid with a skinned body, an expressive head, and a controller. */
  character(opts = {}) {
    const scale = opts.scale != null ? opts.scale : 1;
    const skeleton = makeHumanoidSkeleton(scale);
    // `zombie: true` swaps in the starved silhouette and torn clothing.
    const geo = makeHumanoidMesh(skeleton, opts.zombie
      ? { gaunt: 0.82, rags: true, ragSeed: (opts.seed || 3) * 7 + 1 }
      : { thickness: opts.build || 1 });
    const mesh = new GpuMesh(this.gl, geo);

    const animator = new Animator(skeleton);
    for (const clip of makeHumanoidClips()) animator.add(clip);
    // The dead get their own set: shamble, sprint, crawl, tear, lunge, spit.
    if (opts.zombie) for (const clip of makeZombieClips()) animator.add(clip);
    animator.play('idle', 0);

    const controller = new CharacterController(this, {
      position: opts.at || opts.position || [0, 1.1, 0],
      height: opts.height != null ? opts.height : 1.75 * scale,
      radius: opts.radius != null ? opts.radius : 0.3 * scale,
      speed: opts.speed,
      runSpeed: opts.runSpeed,
      jumpSpeed: opts.jumpSpeed,
    });
    controller.animator = animator;

    const actor = new Actor(this, {
      name: opts.name || 'character',
      mesh,
      material: this.material(opts.material != null ? opts.material : { preset: 'fabric', color: opts.color != null ? opts.color : 0x3a6ea8 }),
      skeleton,
      animator,
      controller,
      body: controller.body,
      boundRadius: 1.4 * scale,
    });
    // The body mesh is authored with its soles at exactly -0.875 (half of
    // 1.75), which is where the centred capsule's bottom already is — so
    // the visual needs no vertical correction at all.
    actor.visualOffset = new Vec3(0, 0, 0);
    this.actors.push(actor);

    if (opts.face !== false) {
      const headGeo = makeHeadGeometry({ seed: opts.seed || 5 });
      const headMesh = new GpuMesh(this.gl, headGeo);
      // A head with no expression rig has neither skeleton nor face, so the
      // renderer batches it through the instanced path — which needs an
      // instance buffer this mesh would otherwise never be given, and the
      // draw silently produces nothing. Every static-faced character came
      // out headless because of it.
      headMesh.setupInstancing(20);   // stride in floats, matching _mesh()
      // face: 'static' renders the head but skips the expression rig — no
      // blendshape build, no per-frame morphing. A crowd of NPCs costs a
      // fraction of one talking hero, which is exactly the trade a horde
      // wants to make.
      let face = null;
      if (opts.face !== 'static') {
        face = new Face(this.gl, headGeo, { seed: opts.seed || 5 });
        face.attach(headMesh);
      }
      // Size the head from the skeleton rather than guessing. The head mesh
      // is authored ~0.72 units tall (the blendshape regions are tuned to
      // those coordinates, so the mesh is scaled rather than rebuilt). In the
      // bind pose the head bone sits 1.47 above the feet on a 1.75-tall rig,
      // leaving 0.28 for the head — about a seventh of total height, which is
      // what a human actually is.
      const HEAD_MESH_HEIGHT = 0.72;
      const headHeight = 1.75 - 1.47;
      const headScale = (headHeight / HEAD_MESH_HEIGHT) * scale;
      const headActor = new Actor(this, {
        name: 'head',
        mesh: headMesh,
        material: this.material(opts.skin != null ? opts.skin : 'skin'),
        face,
        parent: actor,
        parentBone: skeleton.index('head'),
        // Lift by half a head so the jaw meets the neck instead of the
        // skull's centre sitting on it.
        offset: [0, headHeight * 0.5 * scale, 0.006 * scale],
        scale: headScale,
        boundRadius: 0.4 * scale,
      });
      this.actors.push(headActor);
      actor.head = headActor;
      actor.face = face;
    }

    controller.actor = actor;
    return actor;
  }

  /* Arbitrary convex from a point cloud — useful for level geometry that is
     not a primitive. */
  convex(points, opts = {}) {
    const pts = points.map((p) => Vec3.from(p));
    const shape = Shape.convex(pts);
    const geo = hullToGeometry({ points: shape.vertices, indices: facesToTriangles(shape.faces) }, opts.uvScale || 1);
    const mesh = new GpuMesh(this.gl, geo);
    mesh.setupInstancing(20);
    return this._spawn(opts, mesh, opts.physics === false ? null : shape, shape.boundRadius);
  }

  /* ---------------- destruction ---------------- */

  /* Look up (or bake) a chunk set for a half-extent box. */
  _fracturePattern(half, pieces, pattern, seed) {
    const key = `${half.x.toFixed(3)},${half.y.toFixed(3)},${half.z.toFixed(3)}:${pieces}:${pattern}:${seed % 6}`;
    let chunks = this._fractureCache.get(key);
    if (!chunks) {
      chunks = Fracture.shatterBox(half, {
        pieces, pattern, seed: (seed % 6) * 7919 + 13,
        focus: pattern === 'radial' ? new Vec3(0, 0, 0) : null,
      });
      this._fractureCache.set(key, chunks);
    }
    return chunks;
  }

  /* Bake a breakable object's chunks up front so breaking is instant. A
     12-piece Voronoi decomposition costs tens of milliseconds; paying that
     at the moment of impact is exactly the wrong time. */
  prewarmFracture(actor) {
    const d = actor.destructible;
    const shape = d && d.sourceShape;
    if (!shape || !shape.vertices) return;
    const bounds = new Aabb();
    for (const v of shape.vertices) bounds.expandPoint(v);
    this._fracturePattern(bounds.extents(), d.pieces, d.pattern, d.seed);
  }

  /* Replace an actor with its Voronoi chunks. */
  shatter(actor, opts = {}) {
    const d = actor.destructible;
    const shape = (d && d.sourceShape) || (actor.body && actor.body.shape);
    if (!shape || !shape.vertices) { actor.destroy(); return []; }

    const bounds = new Aabb();
    for (const v of shape.vertices) bounds.expandPoint(v);
    const half = bounds.extents();

    const chunks = this._fracturePattern(
      half,
      (d && d.pieces) || opts.pieces || 12,
      (d && d.pattern) || 'uniform',
      (d && d.seed) || 1,
    );

    const created = [];
    const worldPos = actor.position.clone();
    const worldRot = actor.rotation.clone();
    const parentVel = actor.body ? actor.body.velocity.clone() : new Vec3();
    const parentAng = actor.body ? actor.body.angularVelocity.clone() : new Vec3();
    const impactWorld = opts.point ? Vec3.from(opts.point) : worldPos.clone();
    const generation = d ? d.generation : 0;
    const scale = actor.scale;

    for (const chunk of chunks) {
      if (this.activeChunks.length >= this.chunkBudget) break;
      const offsetWorld = chunk.offset.clone().mul(scale).applyQuat(worldRot).add(worldPos);

      const geo = hullToGeometry(
        { points: chunk.shape.vertices, indices: facesToTriangles(chunk.shape.faces) },
        actor.material.uvScale || 1,
      );
      const mesh = new GpuMesh(this.gl, geo);
      mesh.setupInstancing(20);

      const body = new Body(chunk.shape, {
        position: offsetWorld,
        rotation: worldRot,
        density: opts.density || 800,
        restitution: 0.05,
        friction: 0.7,
      });
      this.physics.add(body);

      // Inherit the parent's motion, then blow outward from the impact.
      body.velocity.copy(parentVel);
      body.velocity.add(_eTmp.crossVectors(parentAng, _eTmp2.subVectors(offsetWorld, worldPos)));
      _eTmp.subVectors(offsetWorld, impactWorld);
      const dist = _eTmp.length();
      if (dist > 1e-5) _eTmp.scale(1 / dist); else _eTmp.set(0, 1, 0);
      const force = (opts.force != null ? opts.force : 3.2) / (1 + dist * 1.6);
      body.velocity.addScaled(_eTmp, force);
      body.velocity.y += force * 0.35;
      body.angularVelocity.set(
        (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9,
      );

      const chunkActor = new Actor(this, {
        name: 'chunk',
        mesh,
        material: actor.material,
        body,
        tint: actor.tint,
        lifetime: (d && d.chunkLifetime) || 14,
        boundRadius: chunk.shape.boundRadius,
      });
      chunkActor.isChunk = true;
      chunkActor.ownMesh = mesh;

      // Chunks can break again, but only so many generations deep or a
      // single wall turns into thousands of bodies.
      if (d && generation < d.maxGeneration && chunk.shape.boundRadius > 0.16) {
        chunkActor.destructible = new Destructible(chunkActor, {
          pieces: Math.max(4, Math.round(d.pieces * 0.5)),
          threshold: d.threshold * 1.7,
          generation: generation + 1,
          maxGeneration: d.maxGeneration,
          seed: d.seed + created.length + 1,
          chunkLifetime: d.chunkLifetime,
        });
        chunkActor.destructible.sourceShape = chunk.shape;
      }

      this.actors.push(chunkActor);
      this.activeChunks.push(chunkActor);
      created.push(chunkActor);
    }

    if (!d || d.spawnDust) {
      this.particles.dust(impactWorld, { count: 14 + created.length, size: Math.max(half.x, half.y, half.z) * 1.2 });
    }
    this.audio.shatter(clamp(created.length / 12, 0.25, 1));
    if (d && d.onBreak) d.onBreak(actor, created);
    actor.destroy();
    return created;
  }

  /* Radial blast: impulses on bodies, breakage on destructibles, and the
     visual effect, in one call. */
  explode(at, opts = {}) {
    const center = Vec3.from(at);
    const radius = opts.radius != null ? opts.radius : 6;
    const strength = opts.strength != null ? opts.strength : 12;
    const affected = this.physics.explode(center, radius, strength, opts.upBias);

    this.particles.explosion(center, { scale: opts.scale || radius / 5 });
    this.audio.impact(1);

    // Break anything destructible inside the blast, strongest first so the
    // chunk budget goes to the most visible pieces.
    const breakables = [];
    for (const b of affected) {
      const a = b.actor;
      if (a && a.destructible && !a.destructible.broken) {
        const dist = a.position.distanceTo(center);
        breakables.push({ actor: a, dist });
      }
    }
    breakables.sort((x, y) => x.dist - y.dist);
    for (const { actor, dist } of breakables) {
      const falloff = 1 - dist / radius;
      if (falloff * strength * 260 < actor.destructible.threshold) continue;
      this.shatter(actor, { point: center, force: strength * falloff * 0.6 });
    }

    if (opts.light !== false) {
      const l = this.light({ at: center, color: 0xffa040, intensity: 90 * (opts.scale || 1), radius: radius * 1.6 });
      l._decay = 0.35;
    }
    // Water reacts too.
    if (this.fluid) {
      for (let i = 0; i < this.fluid.count; i++) {
        const dx = this.fluid.px[i] - center.x, dy = this.fluid.py[i] - center.y, dz = this.fluid.pz[i] - center.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > radius || d < 1e-4) continue;
        const f = (1 - d / radius) * strength * 0.6;
        this.fluid.vx[i] += (dx / d) * f;
        this.fluid.vy[i] += (dy / d) * f + f * 0.4;
        this.fluid.vz[i] += (dz / d) * f;
      }
    }
    return affected;
  }

  /* ---------------- queries ---------------- */

  raycast(origin, direction, maxDist = 500, filter) {
    const hit = this.physics.raycast(origin, direction, maxDist, filter);
    if (hit) hit.actor = hit.body.actor || null;
    return hit;
  }

  /* Ray through a screen pixel — for click-to-select and click-to-shoot. */
  raycastScreen(screenX, screenY, maxDist = 500) {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((screenY - rect.top) / rect.height) * 2;
    const near = new Vec3(ndcX, ndcY, -1).applyMat4(this.camera.invViewProj);
    const far = new Vec3(ndcX, ndcY, 1).applyMat4(this.camera.invViewProj);
    const dir = far.sub(near).normalize();
    return this.raycast(near, dir, maxDist);
  }

  /* ---------------- camera ---------------- */

  follow(actor, opts = {}) {
    this._camMode = 'follow';
    this._camTarget = actor;
    this._camConfig = Object.assign({ distance: 7, height: 2.6, lag: 7, lookHeight: 1.2 }, opts);
    this._camDist = this._camConfig.distance;
    return this;
  }
  orbit(opts = {}) {
    this._camMode = 'orbit';
    this._camTarget = opts.target || null;
    this._camConfig = Object.assign({ distance: 12, height: 4, autoRotate: 0 }, opts);
    this._camDist = this._camConfig.distance;
    return this;
  }
  firstPerson(actor, opts = {}) {
    this._camMode = 'first';
    this._camTarget = actor;
    this._camConfig = Object.assign({ eyeHeight: 1.6 }, opts);
    return this;
  }
  lookAt(position, target) {
    this._camMode = 'manual';
    this.camera.position.copy(Vec3.from(position));
    this.camera.target.copy(Vec3.from(target));
    return this;
  }

  _bindCameraInput() {
    let dragging = false;
    const onDown = (e) => { dragging = true; this._dragX = e.clientX; this._dragY = e.clientY; };
    const onMove = (e) => {
      if (!dragging || this._camMode === 'manual' || this._camConfig.userControl === false) return;
      const dx = e.clientX - this._dragX, dy = e.clientY - this._dragY;
      this._dragX = e.clientX; this._dragY = e.clientY;
      this._camYaw -= dx * 0.006;
      this._camPitch = clamp(this._camPitch + dy * 0.005, -1.35, 1.4);
    };
    const onUp = () => { dragging = false; };
    const onWheel = (e) => {
      if (this._camMode === 'manual') return;
      this._camDist = clamp(this._camDist * (1 + Math.sign(e.deltaY) * 0.12), 1.5, 120);
      e.preventDefault();
    };

    // Tracked so dispose() can detach them. The window-level listeners in
    // particular outlive the canvas, so a page that swaps scenes would end up
    // with every disposed engine still steering the camera.
    this._camListeners = [
      [this.canvas, 'pointerdown', onDown, undefined],
      [window, 'pointermove', onMove, undefined],
      [window, 'pointerup', onUp, undefined],
      [this.canvas, 'wheel', onWheel, { passive: false }],
    ];
    for (const [t, type, fn, opts] of this._camListeners) t.addEventListener(type, fn, opts);
  }

  _updateCamera(dt) {
    const cam = this.camera;
    const cfg = this._camConfig;

    if (this._camMode === 'follow' && this._camTarget) {
      const t = this._camTarget.position;
      const yaw = this._camYaw;
      const pitch = this._camPitch;
      const dist = this._camDist;
      const desired = _eTmp.set(
        t.x + Math.sin(yaw) * Math.cos(pitch) * dist,
        t.y + cfg.height + Math.sin(pitch) * dist,
        t.z + Math.cos(yaw) * Math.cos(pitch) * dist,
      );
      // Exponential smoothing, frame-rate independent.
      const k = 1 - Math.exp(-cfg.lag * dt);
      cam.position.lerp(desired, k);
      _eTmp2.set(t.x, t.y + cfg.lookHeight, t.z);
      cam.target.lerp(_eTmp2, Math.min(1, k * 1.6));

      // Do not let the camera sit inside geometry.
      const toCam = _eTmp.subVectors(cam.position, _eTmp2);
      const len = toCam.length();
      if (len > 0.1) {
        const hit = this.physics.raycast(_eTmp2, toCam.scale(1 / len), len,
          (b) => !b.isTrigger && b !== (this._camTarget.controller && this._camTarget.controller.body));
        if (hit && hit.distance < len) {
          cam.position.copy(_eTmp2).addScaled(toCam, Math.max(0.6, hit.distance - 0.25));
        }
      }
    } else if (this._camMode === 'orbit') {
      if (cfg.autoRotate) this._camYaw += cfg.autoRotate * dt;
      const t = this._camTarget ? this._camTarget.position : (cfg.center ? Vec3.from(cfg.center) : Vec3.ZERO);
      const dist = this._camDist;
      cam.position.set(
        t.x + Math.sin(this._camYaw) * Math.cos(this._camPitch) * dist,
        t.y + cfg.height + Math.sin(this._camPitch) * dist,
        t.z + Math.cos(this._camYaw) * Math.cos(this._camPitch) * dist,
      );
      cam.target.copy(t);
    } else if (this._camMode === 'first' && this._camTarget) {
      const t = this._camTarget.position;
      cam.position.set(t.x, t.y + cfg.eyeHeight - 0.875, t.z);
      const cp = Math.cos(-this._camPitch);
      cam.target.set(
        cam.position.x + Math.sin(this._camYaw) * cp,
        cam.position.y + Math.sin(-this._camPitch),
        cam.position.z + Math.cos(this._camYaw) * cp,
      );
    }
  }

  get cameraYaw() { return this._camYaw; }
  set cameraYaw(v) { this._camYaw = v; }

  /* ---------------- loop ---------------- */

  onUpdate(fn) { this._updateHooks.push(fn); return this; }
  onLateUpdate(fn) { this._lateHooks.push(fn); return this; }

  _bindResize() {
    const doResize = () => {
      const w = this.canvas.clientWidth || window.innerWidth;
      const h = this.canvas.clientHeight || window.innerHeight;
      this.renderer.resize(w, h);
      this.camera.update(w / Math.max(1, h));
    };
    this._doResize = doResize;
    window.addEventListener('resize', doResize);
    doResize();
  }

  _removeActor(actor) {
    const i = this.actors.indexOf(actor);
    if (i >= 0) this.actors.splice(i, 1);
    const c = this.activeChunks.indexOf(actor);
    if (c >= 0) this.activeChunks.splice(c, 1);
    // Chunk meshes are unique per chunk, so they must be released or the
    // GPU leaks a buffer set for every piece of debris ever created.
    if (actor.ownMesh) actor.ownMesh.dispose();
  }

  _updateActors(dt) {
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      if (a.dead) continue;
      if (a.lifetime !== Infinity) {
        a.lifetime -= dt;
        if (a.lifetime <= 0) { a.destroy(); i--; continue; }
      }
      if (a.controller) a.controller.update(dt);
      if (a.animator) a.animator.update(dt);
      if (a.face) a.face.update(dt);
      if (a.onUpdate) a.onUpdate(a, dt);
    }

    // Trim the oldest debris when the budget is exceeded.
    while (this.activeChunks.length > this.chunkBudget) {
      const oldest = this.activeChunks.shift();
      if (oldest && !oldest.dead) oldest.destroy();
    }
  }

  _processDestruction() {
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      if (!a.destructible || a.destructible.broken || !a.body) continue;
      const impulse = a.body.impactImpulse;
      if (impulse <= 0) continue;
      if (a.destructible.damage(impulse, a.body.position)) {
        this.shatter(a, { point: a.destructible.breakPoint, force: clamp(impulse / 900, 1, 8) });
        i--;
      }
    }
  }

  _playImpactSounds() {
    for (const m of this.physics.contactEvents) {
      const impulse = Math.max(m.a.impactImpulse, m.b.impactImpulse);
      if (impulse < 200) continue;
      this.audio.impact(clamp(impulse / 5000, 0.05, 1));
      // A hard scrape or hit throws sparks off metal.
      const mat = (m.a.actor && m.a.actor.material) || (m.b.actor && m.b.actor.material);
      if (mat && mat.metalness > 0.6 && impulse > 2500 && m.contacts.length) {
        this.particles.sparks(m.contacts[0].point, { count: 8, speed: 4 });
      }
    }
  }

  /* ---------------- batching ---------------- */

  _buildBatches() {
    const groups = this._batchGroups;
    for (const g of groups.values()) g.count = 0;
    this._individual.length = 0;

    if (this.frustumCulling) this.camera.extractPlanes(this._planes);
    const planes = this._planes;
    const camPos = this.camera.position;

    /* Transforms first, for every actor, visible or not. Updating inside
       the visibility filter below looks equivalent and is not: an invisible
       actor is a legitimate parent — a group root, a mount point, a hidden
       pivot — and skipping it leaves its children composing against a stale
       matrix, so a whole assembly silently renders somewhere else. */
    for (const actor of this.actors) {
      if (!actor.dead) actor.updateMatrix();
    }

    for (const actor of this.actors) {
      if (!actor.visible || !actor.mesh || actor.dead) continue;

      if (this.frustumCulling && !actor.noCull) {
        // Cull against the matrix translation, not actor.position. A
        // parented actor (a head on a neck bone, a held item) has no
        // position of its own — its world location only exists once the
        // parent chain is composed. Testing actor.position culls it against
        // the origin, so a close-up of a character's face makes the head
        // disappear while the body stays.
        const m = actor.matrix.e;
        const px = m[12], py = m[13], pz = m[14];
        // Scale inflates the bounding radius; use the largest axis.
        const sc = Math.max(actor.scale.x, actor.scale.y, actor.scale.z);
        const r = actor.boundRadius * Math.max(1, sc);
        let outside = false;
        for (let i = 0; i < 6; i++) {
          const d = planes[i * 4] * px + planes[i * 4 + 1] * py + planes[i * 4 + 2] * pz + planes[i * 4 + 3];
          if (d < -r) { outside = true; break; }
        }
        if (outside) continue;
      }

      // Skinned and morphed meshes cannot be instanced: each needs its own
      // bone texture or its own vertex buffer.
      if (actor.skeleton || actor.face) {
        this._individual.push(actor);
        continue;
      }

      const key = `${actor.mesh.__key || actor.mesh.__uid || (actor.mesh.__uid = ++_meshUid)}|${actor.material.id}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          mesh: actor.mesh,
          material: actor.material,
          data: new Float32Array(64 * 20),
          count: 0,
          instanced: true,
          grass: false,
          alphaClip: false,
          sortKey: 0,
          cx: 0, cy: 0, cz: 0,
        };
        groups.set(key, g);
      }
      // Running centroid, so transparent groups can be depth-sorted against
      // each other. A whole instanced group shares one sort key, so this is
      // approximate by construction — but it is the group's own position,
      // which is the best approximation available without splitting draws.
      const ap = actor.position;
      g.cx += ap.x; g.cy += ap.y; g.cz += ap.z;
      if ((g.count + 1) * 20 > g.data.length) {
        const bigger = new Float32Array(g.data.length * 2);
        bigger.set(g.data);
        g.data = bigger;
      }
      actor.writeInstance(g.data, g.count * 20);
      g.count++;
    }

    const list = this._batchList;
    list.length = 0;
    for (const g of groups.values()) {
      if (!g.count) continue;
      g.instances = g.data.subarray(0, g.count * 20);
      // Transparent batches sort back to front; opaque order does not matter.
      if (g.material.transparent) {
        const dx = camPos.x - g.cx / g.count;
        const dy = camPos.y - g.cy / g.count;
        const dz = camPos.z - g.cz / g.count;
        g.sortKey = dx * dx + dy * dy + dz * dz;
      } else {
        g.sortKey = 0;
      }
      g.cx = 0; g.cy = 0; g.cz = 0;
      list.push(g);
    }

    for (const actor of this._individual) {
      const batch = {
        mesh: actor.mesh,
        material: actor.material,
        model: actor.matrix,
        params: [actor.tint.x, actor.tint.y, actor.tint.z, actor.custom],
        count: 1,
        instanced: false,
        skinned: !!actor.skeleton,
        grass: false,
        alphaClip: false,
        sortKey: camPos.distanceToSq(actor.position),
      };
      if (actor.skeleton) {
        batch.boneTexture = actor.skeleton.uploadTexture(this.gl);
        batch.boneCount = actor.skeleton.bones.length;
      }
      list.push(batch);
    }

    if (this.grass && this.grass.count) list.push(this.grass.batch());
    return list;
  }

  /* ---------------- frame ---------------- */

  step(dt) {
    const scaled = dt * this.timeScale;
    this.time += scaled;
    this.frame++;

    this.input.beginFrame();
    this.renderer.beginFrame(scaled);

    for (const fn of this._updateHooks) fn(scaled, this);

    this.physics.step(scaled);
    this._playImpactSounds();
    this._processDestruction();
    this._updateActors(scaled);

    if (this.fluid) this.fluid.step(scaled);
    this.particles.update(scaled, _eTmp.copy(this.wind.direction).scale(this.wind.strength * 3));

    // Decaying lights (explosion flashes) fade and remove themselves.
    for (let i = this.renderer.lights.length - 1; i >= 0; i--) {
      const l = this.renderer.lights[i];
      if (l._decay) {
        l.intensity -= l.intensity * scaled / l._decay;
        if (l.intensity < 0.5) this.renderer.lights.splice(i, 1);
      }
    }

    this._updateCamera(scaled);
    for (const fn of this._lateHooks) fn(scaled, this);

    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.update(w / Math.max(1, h));

    const batches = this._buildBatches();
    this.renderer.renderShadows(batches, this.camera);
    this.renderer.renderScene(batches, this.camera);
    if (this.fluid && this.fluid.count) this.renderer.renderFluid(this.fluid, this.camera);
    this.renderer.renderParticles(this.particles, this.camera);
    this.renderer.present();

    this.input.endFrame();

    this.stats.actors = this.actors.length;
    this.stats.bodies = this.physics.bodies.length;
    this.stats.draws = this.renderer.stats.draws;
    this.stats.particles = this.particles.count + (this.fluid ? this.fluid.count : 0);
    this._fpsAccum += dt;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this.stats.fps = Math.round(this._fpsFrames / this._fpsAccum);
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }
  }

  start() {
    if (this.running) return this;
    this.running = true;
    this._lastTime = 0;
    const loop = (now) => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      const t = now * 0.001;
      // First frame has no previous timestamp; a 1/60 guess avoids a huge dt.
      let dt = this._lastTime ? t - this._lastTime : 1 / 60;
      this._lastTime = t;
      // Clamp so a backgrounded tab does not resume with a one-second step.
      dt = Math.min(dt, 0.1);
      if (!this.paused) {
        try {
          this.step(dt);
        } catch (err) {
          // One bad frame should not kill the game loop permanently, but a
          // silent infinite error loop is worse — so report and stop.
          this.running = false;
          console.error('[LegendEngine] frame failed:', err);
          throw err;
        }
      }
    };
    this._raf = requestAnimationFrame(loop);
    return this;
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    return this;
  }

  dispose() {
    this.stop();
    this.input.dispose();
    window.removeEventListener('resize', this._doResize);
    for (const [t, type, fn, opts] of this._camListeners || []) t.removeEventListener(type, fn, opts);
    this._camListeners = null;
    for (const m of this.meshCache.values()) m.dispose();
    for (const m of this.materialCache.values()) m.dispose();
    // Chunk debris carries its own mesh, which the shared caches do not own.
    for (const a of this.actors) if (a.ownMesh) a.ownMesh.dispose();
    if (this.grass) this.grass.dispose();
    this.actors.length = 0;
    this.physics.bodies.length = 0;
  }
}

const _eTmp = new Vec3();
const _eTmp2 = new Vec3();
let _meshUid = 0;

/* Convert merged polygon faces back to a triangle list. */
function facesToTriangles(faces) {
  const out = [];
  for (const f of faces) {
    for (let i = 1; i < f.verts.length - 1; i++) {
      out.push(f.verts[0], f.verts[i], f.verts[i + 1]);
    }
  }
  return out;
}

function resolveCanvas(spec) {
  if (spec instanceof HTMLCanvasElement) return spec;
  if (typeof spec === 'string') {
    const el = document.querySelector(spec);
    if (el) return el;
  }
  // No canvas given: make a full-screen one. This is the common case for a
  // generated game, and having to write the boilerplate is pure friction.
  const c = document.createElement('canvas');
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none;background:#000';
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
  document.body.appendChild(c);
  return c;
}

/* ---------------- top-level entry points ---------------- */

function createEngine(opts = {}) {
  return new Engine(opts);
}

/* The smallest possible complete scene, for sanity checks and as a
   starting point someone can edit one line at a time. */
function quickStart(opts = {}) {
  const game = createEngine(opts);
  game.ground({ material: 'grass', size: 120, grass: true });
  for (let i = 0; i < 12; i++) {
    game.box({
      at: [((i % 4) - 1.5) * 1.4, 0.5 + Math.floor(i / 4) * 1.05, 0],
      size: 1,
      material: i % 2 ? 'brick' : 'concrete',
      breakable: { pieces: 10 },
    });
  }
  game.orbit({ center: [0, 1.5, 0], distance: 12, height: 2, autoRotate: 0.15 });
  game.start();
  return game;
}
