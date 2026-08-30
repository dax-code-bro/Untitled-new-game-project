/* ============================================================
   PARTICLES — sparks, dust, smoke and fire.
   Simulated on the CPU into a flat buffer and drawn as one
   instanced call, so ten thousand particles cost one draw.
   ============================================================ */

const PARTICLE = { SPARK: 0, SMOKE: 1, FIRE: 2 };

class ParticleSystem {
  constructor(gl, capacity = 4000) {
    this.gl = gl;
    this.capacity = capacity;
    this.count = 0;

    // Structure-of-arrays: the update loop is a linear sweep, and this keeps
    // it cache-friendly instead of chasing one object per particle.
    this.px = new Float32Array(capacity);
    this.py = new Float32Array(capacity);
    this.pz = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.sizeEnd = new Float32Array(capacity);
    this.r = new Float32Array(capacity);
    this.g = new Float32Array(capacity);
    this.b = new Float32Array(capacity);
    this.rEnd = new Float32Array(capacity);
    this.gEnd = new Float32Array(capacity);
    this.bEnd = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.rot = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.type = new Float32Array(capacity);
    this.seed = new Float32Array(capacity);
    this.bounce = new Float32Array(capacity);

    // Interleaved instance data: posSize(4) + color(4) + extra(4).
    this.instances = new Float32Array(capacity * 12);
    this.rng = new Rng(9182);
    this.groundY = null;   // optional cheap floor for bouncing sparks

    this._initGl(gl);
  }

  _initGl(gl) {
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, 1, 1,
      -1, -1, 1, 1, -1, 1,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instances.byteLength, gl.DYNAMIC_DRAW);
    const stride = 12 * 4;
    for (let i = 0; i < 3; i++) {
      const loc = 8 + i;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, i * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    this.quadBuffer = quad;
  }

  /* Spawn one particle. Returns false when the pool is full — callers are
     expected to keep going rather than treat it as an error, because
     dropping the newest particle is the right behaviour under load. */
  spawn(opts) {
    if (this.count >= this.capacity) return false;
    const i = this.count++;
    const p = opts.position;
    this.px[i] = p.x; this.py[i] = p.y; this.pz[i] = p.z;
    const v = opts.velocity || Vec3.ZERO;
    this.vx[i] = v.x; this.vy[i] = v.y; this.vz[i] = v.z;
    const life = opts.life != null ? opts.life : 1;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = opts.size != null ? opts.size : 0.1;
    this.sizeEnd[i] = opts.sizeEnd != null ? opts.sizeEnd : this.size[i];
    const c = opts.color || _pOne;
    this.r[i] = c.x; this.g[i] = c.y; this.b[i] = c.z;
    const ce = opts.colorEnd || c;
    this.rEnd[i] = ce.x; this.gEnd[i] = ce.y; this.bEnd[i] = ce.z;
    this.alpha[i] = opts.alpha != null ? opts.alpha : 1;
    this.rot[i] = opts.rotation != null ? opts.rotation : this.rng.range(0, TAU);
    this.spin[i] = opts.spin != null ? opts.spin : this.rng.range(-2, 2);
    this.drag[i] = opts.drag != null ? opts.drag : 0.6;
    this.gravity[i] = opts.gravity != null ? opts.gravity : -9.8;
    this.type[i] = opts.type != null ? opts.type : PARTICLE.SPARK;
    this.seed[i] = this.rng.next();
    this.bounce[i] = opts.bounce != null ? opts.bounce : 0;
    return true;
  }

  _remove(i) {
    // Swap-with-last: O(1) removal, and draw order does not matter for
    // premultiplied-alpha particles.
    const last = --this.count;
    if (i === last) return;
    const A = ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'life', 'maxLife', 'size', 'sizeEnd',
      'r', 'g', 'b', 'rEnd', 'gEnd', 'bEnd', 'alpha', 'rot', 'spin', 'drag', 'gravity', 'type', 'seed', 'bounce'];
    for (const k of A) this[k][i] = this[k][last];
  }

  update(dt, wind) {
    const wx = wind ? wind.x : 0, wy = wind ? wind.y : 0, wz = wind ? wind.z : 0;
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this._remove(i); i--; continue; }

      const d = Math.exp(-this.drag[i] * dt);
      this.vy[i] += this.gravity[i] * dt;
      // Smoke and fire are pushed around by wind; heavy sparks barely notice.
      const windScale = this.type[i] === PARTICLE.SPARK ? 0.1 : 1;
      this.vx[i] = (this.vx[i] + wx * windScale * dt) * d;
      this.vy[i] = (this.vy[i] + wy * windScale * dt) * d;
      this.vz[i] = (this.vz[i] + wz * windScale * dt) * d;

      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.spin[i] * dt;

      if (this.groundY != null && this.py[i] < this.groundY && this.bounce[i] > 0) {
        this.py[i] = this.groundY;
        this.vy[i] = Math.abs(this.vy[i]) * this.bounce[i];
        this.vx[i] *= 0.6; this.vz[i] *= 0.6;
        if (Math.abs(this.vy[i]) < 0.4) this.bounce[i] = 0;
      }
    }
  }

  /* Pack into the interleaved instance buffer and upload. */
  flush() {
    const gl = this.gl;
    if (!this.count) return;
    const buf = this.instances;
    for (let i = 0; i < this.count; i++) {
      const o = i * 12;
      const t = 1 - this.life[i] / this.maxLife[i];
      buf[o] = this.px[i];
      buf[o + 1] = this.py[i];
      buf[o + 2] = this.pz[i];
      buf[o + 3] = lerp(this.size[i], this.sizeEnd[i], t);
      buf[o + 4] = lerp(this.r[i], this.rEnd[i], t);
      buf[o + 5] = lerp(this.g[i], this.gEnd[i], t);
      buf[o + 6] = lerp(this.b[i], this.bEnd[i], t);
      // Fade in briefly then out, so nothing pops into existence.
      const fadeIn = Math.min(1, (1 - t) * 12);
      buf[o + 7] = this.alpha[i] * (1 - t) * Math.min(1, fadeIn);
      buf[o + 8] = this.rot[i];
      buf[o + 9] = t;
      buf[o + 10] = this.type[i];
      buf[o + 11] = this.seed[i];
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf, 0, this.count * 12);
  }

  draw() {
    if (!this.count) return;
    this.flush();
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
  }

  clear() { this.count = 0; }

  /* ---------------- presets ---------------- */

  /* A burst of hot sparks — impacts, ricochets, welding. */
  sparks(position, opts = {}) {
    const n = opts.count || 24;
    const speed = opts.speed || 6;
    const color = parseColor(opts.color != null ? opts.color : 0xffc061);
    const dir = opts.direction ? Vec3.from(opts.direction).normalize() : null;
    const spread = opts.spread != null ? opts.spread : 1;
    const v = new Vec3();
    for (let i = 0; i < n; i++) {
      this.rng.unitVec3(v);
      if (dir) v.lerp(dir, 1 - spread * 0.5).normalize();
      v.scale(speed * this.rng.range(0.35, 1));
      this.spawn({
        position,
        velocity: v,
        life: this.rng.range(0.25, 0.75) * (opts.life || 1),
        size: this.rng.range(0.02, 0.06) * (opts.size || 1),
        sizeEnd: 0.005,
        color,
        colorEnd: parseColor(opts.colorEnd != null ? opts.colorEnd : 0xff3300),
        alpha: 1,
        drag: 1.1,
        gravity: -14,
        type: PARTICLE.SPARK,
        bounce: opts.bounce != null ? opts.bounce : 0.35,
      });
    }
  }

  /* Dust and debris cloud — the signature of anything breaking. */
  dust(position, opts = {}) {
    const n = opts.count || 18;
    const speed = opts.speed || 2.2;
    const color = parseColor(opts.color != null ? opts.color : 0xa89e90);
    const v = new Vec3();
    for (let i = 0; i < n; i++) {
      this.rng.unitVec3(v);
      v.y = Math.abs(v.y) * 0.8 + 0.25;
      v.scale(speed * this.rng.range(0.3, 1));
      this.spawn({
        position,
        velocity: v,
        life: this.rng.range(0.9, 2.1) * (opts.life || 1),
        size: this.rng.range(0.25, 0.6) * (opts.size || 1),
        sizeEnd: this.rng.range(1.1, 2.4) * (opts.size || 1),
        color,
        colorEnd: parseColor(opts.colorEnd != null ? opts.colorEnd : 0x6b6459),
        alpha: opts.alpha != null ? opts.alpha : 0.5,
        drag: 1.9,
        gravity: -0.7,
        spin: this.rng.range(-1.2, 1.2),
        type: PARTICLE.SMOKE,
      });
    }
  }

  /* Blood.
   *
   * Three things happen when a bullet goes into a body and they look
   * nothing alike, so they are three emitters rather than one:
   *
   *   spray   heavy droplets thrown out along the bullet's path, fast,
   *           falling fast, bouncing once off whatever they land on.
   *           This is the part that reads as an impact.
   *   mist    a fine cloud that hangs for a moment where the round went
   *           in, drifting and fading. Without it the spray reads as
   *           confetti; with it there is a shape in the air.
   *   gouts   for a killing blow or a limb coming off -- fewer, bigger,
   *           slower, arcing further and landing wet.
   *
   * Directional by default: `direction` is the way the round was
   * travelling, and most of what comes out follows it. Blood that sprays
   * evenly in all directions looks like a burst pipe rather than a hit.
   */
  blood(position, opts = {}) {
    const n = opts.count || 16;
    const speed = opts.speed || 5.5;
    const dir = opts.direction ? Vec3.from(opts.direction).normalize() : null;
    const spread = opts.spread != null ? opts.spread : 0.55;
    const color = parseColor(opts.color != null ? opts.color : 0x8e0f0a);
    const colorEnd = parseColor(opts.colorEnd != null ? opts.colorEnd : 0x36070a);
    const v = new Vec3();
    for (let i = 0; i < n; i++) {
      this.rng.unitVec3(v);
      if (dir) v.lerp(dir, 1 - spread).normalize();
      v.scale(speed * this.rng.range(0.30, 1));
      v.y += this.rng.range(0.2, 1.6);
      this.spawn({
        position,
        velocity: v,
        life: this.rng.range(0.5, 1.3) * (opts.life || 1),
        size: this.rng.range(0.020, 0.055) * (opts.size || 1),
        sizeEnd: this.rng.range(0.010, 0.026) * (opts.size || 1),
        color,
        colorEnd,
        alpha: 1,
        drag: 0.5,
        gravity: -13,
        type: PARTICLE.SPARK,
        bounce: 0.12,
      });
    }
    // The mist that hangs where the round went in.
    const m = opts.mist != null ? opts.mist : Math.max(3, Math.round(n * 0.4));
    for (let i = 0; i < m; i++) {
      this.rng.unitVec3(v);
      if (dir) v.lerp(dir, 0.55).normalize();
      v.scale(this.rng.range(0.25, 1.1));
      this.spawn({
        position,
        velocity: v,
        life: this.rng.range(0.35, 0.85),
        size: this.rng.range(0.05, 0.12) * (opts.size || 1),
        sizeEnd: this.rng.range(0.18, 0.34) * (opts.size || 1),
        color,
        colorEnd: parseColor(0x4a1512),
        alpha: 0.42,
        drag: 2.6,
        gravity: -1.2,
        spin: this.rng.range(-2, 2),
        type: PARTICLE.SMOKE,
      });
    }
  }

  /* A killing blow, or something coming off. Fewer pieces, heavier, and
     they travel -- this is the one that should make a mess of the floor. */
  gore(position, opts = {}) {
    const n = opts.count || 10;
    const speed = opts.speed || 4.2;
    const dir = opts.direction ? Vec3.from(opts.direction).normalize() : null;
    const v = new Vec3();
    for (let i = 0; i < n; i++) {
      this.rng.unitVec3(v);
      if (dir) v.lerp(dir, 0.45).normalize();
      v.scale(speed * this.rng.range(0.4, 1));
      v.y += this.rng.range(1.2, 3.4);
      this.spawn({
        position,
        velocity: v,
        life: this.rng.range(1.1, 2.2) * (opts.life || 1),
        size: this.rng.range(0.045, 0.105) * (opts.size || 1),
        sizeEnd: this.rng.range(0.030, 0.070) * (opts.size || 1),
        color: parseColor(opts.color != null ? opts.color : 0x6f0c09),
        colorEnd: parseColor(0x2a0607),
        alpha: 1,
        drag: 0.35,
        gravity: -15,
        spin: this.rng.range(-6, 6),
        type: PARTICLE.SPARK,
        bounce: 0.06,
      });
    }
    this.blood(position, Object.assign({}, opts, { count: (opts.count || 10) * 2, speed: 6.5 }));
  }

  smoke(position, opts = {}) {
    const n = opts.count || 10;
    const v = new Vec3();
    for (let i = 0; i < n; i++) {
      this.rng.unitVec3(v);
      v.scale(0.5);
      v.y = Math.abs(v.y) + 1.2;   // smoke always rises
      this.spawn({
        position,
        velocity: v,
        life: this.rng.range(1.6, 3.4) * (opts.life || 1),
        size: this.rng.range(0.3, 0.7) * (opts.size || 1),
        sizeEnd: this.rng.range(1.6, 3.2) * (opts.size || 1),
        color: parseColor(opts.color != null ? opts.color : 0x40403c),
        colorEnd: parseColor(opts.colorEnd != null ? opts.colorEnd : 0x14141a),
        alpha: opts.alpha != null ? opts.alpha : 0.42,
        drag: 1.2,
        gravity: 0.6,
        type: PARTICLE.SMOKE,
      });
    }
  }

  fire(position, opts = {}) {
    const n = opts.count || 8;
    const v = new Vec3();
    for (let i = 0; i < n; i++) {
      this.rng.unitVec3(v);
      v.scale(0.7);
      v.y = Math.abs(v.y) + 2.2;
      this.spawn({
        position,
        velocity: v,
        life: this.rng.range(0.4, 0.9) * (opts.life || 1),
        size: this.rng.range(0.25, 0.5) * (opts.size || 1),
        sizeEnd: this.rng.range(0.05, 0.15) * (opts.size || 1),
        color: parseColor(opts.color != null ? opts.color : 0xffb020),
        colorEnd: parseColor(opts.colorEnd != null ? opts.colorEnd : 0xd02000),
        alpha: 0.9,
        drag: 0.9,
        gravity: 2.4,
        type: PARTICLE.FIRE,
      });
    }
  }

  /* Explosion = fire core + smoke shell + sparks, spawned together. */
  explosion(position, opts = {}) {
    const scale = opts.scale || 1;
    this.fire(position, { count: Math.round(26 * scale), size: 1.6 * scale, life: 1.1 });
    this.smoke(position, { count: Math.round(20 * scale), size: 1.5 * scale, life: 1.6 });
    this.sparks(position, { count: Math.round(40 * scale), speed: 12 * scale, size: 1.4 });
  }
}

const _pOne = new Vec3(1, 1, 1);
