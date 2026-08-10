/* ============================================================
   FLUID — Position Based Fluids (Macklin & Müller 2013).

   Particles are projected onto a density constraint each step
   rather than integrated from pressure forces, which is what
   makes it stable at large timesteps — the reason this approach
   is viable in a browser at 60fps.

   The surface is not meshed; it is reconstructed in screen space
   by the renderer from these particles.
   ============================================================ */

class Fluid {
  constructor(gl, opts = {}) {
    this.gl = gl;
    this.capacity = opts.capacity || 3000;
    this.count = 0;

    // Smoothing radius. Everything else is derived from it, so this single
    // number sets the scale of the whole simulation.
    this.h = opts.radius || 0.22;
    this.h2 = this.h * this.h;
    this.particleRadius = this.h * 0.52;
    this.restDensity = opts.restDensity || 1000;
    this.mass = this.restDensity * (this.h * 0.5) ** 3 * 0.8;
    // The spacing at which a lattice of these particles already sits at rest
    // density. Seeding at any other spacing hands the solver a large
    // constraint violation on frame one, and the correction that follows is
    // what launches particles out of the tank.
    this.restSpacing = Math.cbrt(this.mass / this.restDensity);
    this.iterations = opts.iterations || 3;
    this.viscosity = opts.viscosity != null ? opts.viscosity : 0.02;
    this.vorticity = opts.vorticity != null ? opts.vorticity : 0.12;
    this.relaxation = opts.relaxation || 600;
    this.gravity = Vec3.from(opts.gravity || [0, -9.8, 0]);
    this.damping = opts.damping != null ? opts.damping : 0.02;
    this.maxSpeed = opts.maxSpeed || 14;

    // Tensile instability correction: without it particles clump into
    // strings and the surface goes lumpy.
    this.sCorrK = 0.0008;
    this.sCorrN = 4;
    this.sCorrQ = 0.2 * this.h;

    const c = this.capacity;
    this.px = new Float32Array(c); this.py = new Float32Array(c); this.pz = new Float32Array(c);
    this.qx = new Float32Array(c); this.qy = new Float32Array(c); this.qz = new Float32Array(c);
    this.vx = new Float32Array(c); this.vy = new Float32Array(c); this.vz = new Float32Array(c);
    this.dx = new Float32Array(c); this.dy = new Float32Array(c); this.dz = new Float32Array(c);
    this.wx = new Float32Array(c); this.wy = new Float32Array(c); this.wz = new Float32Array(c);
    this.density = new Float32Array(c);
    this.lambda = new Float32Array(c);
    this.alive = new Uint8Array(c);

    // Neighbour lists, flat with a fixed cap per particle.
    this.maxNeighbors = 48;
    this.neighbors = new Int32Array(c * this.maxNeighbors);
    this.neighborCount = new Int32Array(c);

    // Spatial hash, counting-sorted each step. The prefix-sum and shift
    // passes are O(tableSize) regardless of particle count, so the table is
    // sized from capacity rather than fixed large.
    this.tableSize = 1024;
    while (this.tableSize < c * 2 && this.tableSize < 32768) this.tableSize <<= 1;
    this.cellStart = new Int32Array(this.tableSize + 1);
    this.cellEntries = new Int32Array(c);

    this.bounds = opts.bounds
      ? { min: Vec3.from(opts.bounds.min), max: Vec3.from(opts.bounds.max) }
      : { min: new Vec3(-1e4, -1e4, -1e4), max: new Vec3(1e4, 1e4, 1e4) };

    this.colliders = [];   // physics bodies the fluid should respect
    this.instances = new Float32Array(c * 4);
    this.rng = new Rng(4242);
    this._initGl(gl);

    // Kernel normalisation constants, precomputed.
    this.poly6 = 315 / (64 * PI * Math.pow(this.h, 9));
    this.spiky = -45 / (PI * Math.pow(this.h, 6));
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
    gl.enableVertexAttribArray(8);
    gl.vertexAttribPointer(8, 4, gl.FLOAT, false, 16, 0);
    gl.vertexAttribDivisor(8, 1);
    gl.bindVertexArray(null);
  }

  emit(position, opts = {}) {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    const jitter = opts.jitter != null ? opts.jitter : 0;
    this.px[i] = position.x + (jitter ? this.rng.range(-jitter, jitter) : 0);
    this.py[i] = position.y + (jitter ? this.rng.range(-jitter, jitter) : 0);
    this.pz[i] = position.z + (jitter ? this.rng.range(-jitter, jitter) : 0);
    const v = opts.velocity || Vec3.ZERO;
    this.vx[i] = v.x; this.vy[i] = v.y; this.vz[i] = v.z;
    this.alive[i] = 1;
    return i;
  }

  /* Fill an axis-aligned volume with a lattice of particles. Slight jitter
     breaks the grid symmetry, which otherwise takes many steps to relax. */
  fillBox(min, max, opts = {}) {
    const lo = Vec3.from(min), hi = Vec3.from(max);
    const spacing = opts.spacing || this.restSpacing;
    const jitter = spacing * 0.12;
    let n = 0;
    for (let x = lo.x; x <= hi.x; x += spacing) {
      for (let y = lo.y; y <= hi.y; y += spacing) {
        for (let z = lo.z; z <= hi.z; z += spacing) {
          if (this.count >= this.capacity) return n;
          this.emit(new Vec3(x, y, z), { jitter, velocity: opts.velocity });
          n++;
        }
      }
    }
    return n;
  }

  remove(i) {
    const last = --this.count;
    if (i !== last) {
      for (const k of ['px', 'py', 'pz', 'vx', 'vy', 'vz']) this[k][i] = this[k][last];
    }
  }

  /* ---------------- neighbour search ---------------- */

  _hash(x, y, z) {
    // Same construction as the rigid-body broadphase: collisions only cost
    // extra distance checks, never missed neighbours.
    return (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) & (this.tableSize - 1)) >>> 0;
  }

  _buildNeighbors() {
    const n = this.count;
    const inv = 1 / this.h;
    const start = this.cellStart;
    start.fill(0);

    // Counting sort: histogram, prefix sum, scatter.
    for (let i = 0; i < n; i++) {
      const h = this._hash(
        Math.floor(this.qx[i] * inv), Math.floor(this.qy[i] * inv), Math.floor(this.qz[i] * inv),
      );
      start[h]++;
    }
    let sum = 0;
    for (let i = 0; i <= this.tableSize; i++) {
      const c = i < this.tableSize ? start[i] : 0;
      start[i] = sum;
      sum += c;
    }
    for (let i = 0; i < n; i++) {
      const h = this._hash(
        Math.floor(this.qx[i] * inv), Math.floor(this.qy[i] * inv), Math.floor(this.qz[i] * inv),
      );
      this.cellEntries[start[h]++] = i;
    }
    // Undo the increments so start[h] points at the beginning again.
    for (let i = this.tableSize; i > 0; i--) start[i] = start[i - 1];
    start[0] = 0;

    const maxN = this.maxNeighbors;
    for (let i = 0; i < n; i++) {
      const xi = this.qx[i], yi = this.qy[i], zi = this.qz[i];
      const cx = Math.floor(xi * inv), cy = Math.floor(yi * inv), cz = Math.floor(zi * inv);
      let cnt = 0;
      const base = i * maxN;
      for (let ox = -1; ox <= 1 && cnt < maxN; ox++) {
        for (let oy = -1; oy <= 1 && cnt < maxN; oy++) {
          for (let oz = -1; oz <= 1 && cnt < maxN; oz++) {
            const h = this._hash(cx + ox, cy + oy, cz + oz);
            const s = start[h], e = start[h + 1];
            for (let k = s; k < e && cnt < maxN; k++) {
              const j = this.cellEntries[k];
              if (j === i) continue;
              const dx = this.qx[j] - xi, dy = this.qy[j] - yi, dz = this.qz[j] - zi;
              if (dx * dx + dy * dy + dz * dz < this.h2) this.neighbors[base + cnt++] = j;
            }
          }
        }
      }
      this.neighborCount[i] = cnt;
    }
  }

  /* ---------------- boundaries ---------------- */

  /* Push a predicted position out of the world box and out of any registered
     rigid body. Reusing the rigid-body Shape data means water respects the
     exact same geometry the player collides with. */
  _resolveCollisions(i) {
    const r = this.particleRadius;
    const b = this.bounds;
    if (this.qx[i] < b.min.x + r) this.qx[i] = b.min.x + r;
    if (this.qx[i] > b.max.x - r) this.qx[i] = b.max.x - r;
    if (this.qy[i] < b.min.y + r) this.qy[i] = b.min.y + r;
    if (this.qy[i] > b.max.y - r) this.qy[i] = b.max.y - r;
    if (this.qz[i] < b.min.z + r) this.qz[i] = b.min.z + r;
    if (this.qz[i] > b.max.z - r) this.qz[i] = b.max.z - r;

    for (let c = 0; c < this.colliders.length; c++) {
      const body = this.colliders[c];
      const shape = body.shape;
      _fp.set(this.qx[i], this.qy[i], this.qz[i]);

      if (shape.type === SHAPE.PLANE) {
        _fn.copy(shape.normal).applyQuat(body.quaternion);
        const offset = shape.offset + _fn.dot(body.position);
        const d = _fn.dot(_fp) - offset;
        if (d < r) {
          const push = r - d;
          this.qx[i] += _fn.x * push; this.qy[i] += _fn.y * push; this.qz[i] += _fn.z * push;
        }
      } else if (shape.type === SHAPE.SPHERE) {
        _fn.subVectors(_fp, body.position);
        const dist = _fn.length();
        const target = shape.radius + r;
        if (dist < target && dist > 1e-6) {
          _fn.scale((target - dist) / dist);
          this.qx[i] += _fn.x; this.qy[i] += _fn.y; this.qz[i] += _fn.z;
        }
      } else if (shape.vertices) {
        // Convex: work in local space, find the least-penetrated face.
        _fl.copy(_fp).sub(body.position).applyQuatInv(body.quaternion);
        let maxD = -Infinity, face = null;
        for (const f of shape.faces) {
          const d = _fl.dot(f.normal) - f.offset;
          if (d > maxD) { maxD = d; face = f; }
          if (maxD > r) break;
        }
        if (face && maxD < r) {
          _fn.copy(face.normal).applyQuat(body.quaternion);
          const push = r - maxD;
          this.qx[i] += _fn.x * push; this.qy[i] += _fn.y * push; this.qz[i] += _fn.z * push;
          // Reaction on a dynamic body: this is what makes a boat bob and a
          // crate get shoved by a wave rather than ignoring the water.
          if (body.dynamic && body.invMass > 0) {
            _fn.scale(-push * this.mass * 22);
            body.applyImpulse(_fn, _fp);
          }
        }
      }
    }
  }

  /* ---------------- step ---------------- */

  step(dt) {
    const n = this.count;
    if (!n) return;
    // A fixed internal timestep keeps the constraint solve well conditioned
    // no matter what the display is doing.
    const h = Math.min(dt, 1 / 50);

    // 1. Predict.
    for (let i = 0; i < n; i++) {
      this.vx[i] += this.gravity.x * h;
      this.vy[i] += this.gravity.y * h;
      this.vz[i] += this.gravity.z * h;
      const sp = Math.sqrt(this.vx[i] ** 2 + this.vy[i] ** 2 + this.vz[i] ** 2);
      if (sp > this.maxSpeed) {
        const s = this.maxSpeed / sp;
        this.vx[i] *= s; this.vy[i] *= s; this.vz[i] *= s;
      }
      this.qx[i] = this.px[i] + this.vx[i] * h;
      this.qy[i] = this.py[i] + this.vy[i] * h;
      this.qz[i] = this.pz[i] + this.vz[i] * h;
    }

    this._buildNeighbors();

    const maxN = this.maxNeighbors;
    const invRest = 1 / this.restDensity;
    // No single constraint iteration may move a particle further than a
    // fraction of the smoothing radius.
    const maxDelta = this.h * 0.35;
    const maxDelta2 = maxDelta * maxDelta;

    // 2. Constraint projection.
    for (let iter = 0; iter < this.iterations; iter++) {
      // Density and lambda.
      for (let i = 0; i < n; i++) {
        const xi = this.qx[i], yi = this.qy[i], zi = this.qz[i];
        let rho = this.poly6 * Math.pow(this.h2, 3) * this.mass; // self contribution
        const base = i * maxN, cnt = this.neighborCount[i];
        let gradSumX = 0, gradSumY = 0, gradSumZ = 0, sumGrad2 = 0;

        for (let k = 0; k < cnt; k++) {
          const j = this.neighbors[base + k];
          const dx = xi - this.qx[j], dy = yi - this.qy[j], dz = zi - this.qz[j];
          const r2 = dx * dx + dy * dy + dz * dz;
          if (r2 >= this.h2) continue;
          const diff = this.h2 - r2;
          rho += this.mass * this.poly6 * diff * diff * diff;

          const r = Math.sqrt(r2);
          if (r < 1e-6) continue;
          const coeff = this.spiky * (this.h - r) * (this.h - r) / r * this.mass * invRest;
          const gx = coeff * dx, gy = coeff * dy, gz = coeff * dz;
          gradSumX += gx; gradSumY += gy; gradSumZ += gz;
          sumGrad2 += gx * gx + gy * gy + gz * gz;
        }

        this.density[i] = rho;
        sumGrad2 += gradSumX * gradSumX + gradSumY * gradSumY + gradSumZ * gradSumZ;
        // Clamped to zero: an under-dense particle is not violating
        // incompressibility, and letting the constraint pull inward turns
        // the free surface into a cohesive blob that periodically collapses
        // and then explodes.
        const C = Math.max(0, rho * invRest - 1);
        // Relaxation term keeps the denominator away from zero where the
        // gradient sum vanishes (isolated particles).
        this.lambda[i] = -C / (sumGrad2 + 1 / this.relaxation);
      }

      // Position deltas.
      for (let i = 0; i < n; i++) {
        const xi = this.qx[i], yi = this.qy[i], zi = this.qz[i];
        const li = this.lambda[i];
        const base = i * maxN, cnt = this.neighborCount[i];
        let ax = 0, ay = 0, az = 0;

        for (let k = 0; k < cnt; k++) {
          const j = this.neighbors[base + k];
          const dx = xi - this.qx[j], dy = yi - this.qy[j], dz = zi - this.qz[j];
          const r2 = dx * dx + dy * dy + dz * dz;
          if (r2 >= this.h2 || r2 < 1e-12) continue;
          const r = Math.sqrt(r2);

          // Artificial pressure: pushes particles apart at close range so
          // they cannot collapse into clusters.
          const diffQ = this.h2 - this.sCorrQ * this.sCorrQ;
          const wq = this.poly6 * diffQ * diffQ * diffQ;
          const diff = this.h2 - r2;
          const w = this.poly6 * diff * diff * diff;
          const sCorr = -this.sCorrK * Math.pow(w / Math.max(wq, 1e-12), this.sCorrN);

          const coeff = this.spiky * (this.h - r) * (this.h - r) / r;
          const scale = (li + this.lambda[j] + sCorr) * coeff * invRest * this.mass;
          ax += scale * dx; ay += scale * dy; az += scale * dz;
        }
        // Clamp the correction. A particle spawned inside a dense clump can
        // otherwise be handed a delta many times the smoothing radius and be
        // fired out of the simulation — the single most common way a
        // position-based fluid explodes.
        const d2 = ax * ax + ay * ay + az * az;
        if (d2 > maxDelta2) {
          const s = maxDelta / Math.sqrt(d2);
          ax *= s; ay *= s; az *= s;
        }
        this.dx[i] = ax; this.dy[i] = ay; this.dz[i] = az;
      }

      for (let i = 0; i < n; i++) {
        this.qx[i] += this.dx[i];
        this.qy[i] += this.dy[i];
        this.qz[i] += this.dz[i];
        this._resolveCollisions(i);
      }
    }

    // 3. Update velocities from the corrected positions.
    const invH = 1 / h;
    const maxV2 = this.maxSpeed * this.maxSpeed;
    for (let i = 0; i < n; i++) {
      let vx = (this.qx[i] - this.px[i]) * invH;
      let vy = (this.qy[i] - this.py[i]) * invH;
      let vz = (this.qz[i] - this.pz[i]) * invH;
      // Positions were corrected by the solver, so the implied velocity can
      // spike well past anything the integrator ever produced.
      const s2 = vx * vx + vy * vy + vz * vz;
      if (s2 > maxV2) {
        const s = this.maxSpeed / Math.sqrt(s2);
        vx *= s; vy *= s; vz *= s;
      }
      this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    }

    // 4. Vorticity confinement: PBF is heavily damped and looks like syrup
    //    without something to put the swirls back.
    if (this.vorticity > 0) {
      for (let i = 0; i < n; i++) {
        const xi = this.qx[i], yi = this.qy[i], zi = this.qz[i];
        const base = i * maxN, cnt = this.neighborCount[i];
        let cx = 0, cy = 0, cz = 0;
        for (let k = 0; k < cnt; k++) {
          const j = this.neighbors[base + k];
          const dx = xi - this.qx[j], dy = yi - this.qy[j], dz = zi - this.qz[j];
          const r2 = dx * dx + dy * dy + dz * dz;
          if (r2 >= this.h2 || r2 < 1e-12) continue;
          const r = Math.sqrt(r2);
          const coeff = this.spiky * (this.h - r) * (this.h - r) / r;
          const gx = coeff * dx, gy = coeff * dy, gz = coeff * dz;
          const vijx = this.vx[j] - this.vx[i];
          const vijy = this.vy[j] - this.vy[i];
          const vijz = this.vz[j] - this.vz[i];
          cx += vijy * gz - vijz * gy;
          cy += vijz * gx - vijx * gz;
          cz += vijx * gy - vijy * gx;
        }
        this.wx[i] = cx; this.wy[i] = cy; this.wz[i] = cz;
      }
      for (let i = 0; i < n; i++) {
        // Gradient of |omega| via neighbour differences gives the direction
        // to push toward high-vorticity regions.
        const xi = this.qx[i], yi = this.qy[i], zi = this.qz[i];
        const base = i * maxN, cnt = this.neighborCount[i];
        let nx = 0, ny = 0, nz = 0;
        for (let k = 0; k < cnt; k++) {
          const j = this.neighbors[base + k];
          const dx = xi - this.qx[j], dy = yi - this.qy[j], dz = zi - this.qz[j];
          const r2 = dx * dx + dy * dy + dz * dz;
          if (r2 >= this.h2 || r2 < 1e-12) continue;
          const mag = Math.sqrt(this.wx[j] ** 2 + this.wy[j] ** 2 + this.wz[j] ** 2);
          const r = Math.sqrt(r2);
          const coeff = this.spiky * (this.h - r) * (this.h - r) / r * mag;
          nx += coeff * dx; ny += coeff * dy; nz += coeff * dz;
        }
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len < 1e-6) continue;
        nx /= len; ny /= len; nz /= len;

        // Omega is normalised before the cross product. The raw curl carries
        // the spiky kernel's normalisation constant (order 1e5 at these
        // radii), so using it directly makes the confinement force dwarf
        // every other term and blows the simulation apart. Only its
        // direction is meaningful here; the strength is set by `vorticity`.
        let wx = this.wx[i], wy = this.wy[i], wz = this.wz[i];
        const wlen = Math.sqrt(wx * wx + wy * wy + wz * wz);
        if (wlen < 1e-6) continue;
        wx /= wlen; wy /= wlen; wz /= wlen;
        const strength = this.vorticity * 6;
        const fx = (ny * wz - nz * wy) * strength;
        const fy = (nz * wx - nx * wz) * strength;
        const fz = (nx * wy - ny * wx) * strength;
        this.vx[i] += fx * h; this.vy[i] += fy * h; this.vz[i] += fz * h;
      }
    }

    // 5. XSPH viscosity: blend each particle toward its neighbourhood's
    //    average velocity, which is what makes the flow look coherent.
    if (this.viscosity > 0) {
      for (let i = 0; i < n; i++) {
        const xi = this.qx[i], yi = this.qy[i], zi = this.qz[i];
        const base = i * maxN, cnt = this.neighborCount[i];
        let ax = 0, ay = 0, az = 0;
        for (let k = 0; k < cnt; k++) {
          const j = this.neighbors[base + k];
          const dx = xi - this.qx[j], dy = yi - this.qy[j], dz = zi - this.qz[j];
          const r2 = dx * dx + dy * dy + dz * dz;
          if (r2 >= this.h2) continue;
          const diff = this.h2 - r2;
          // XSPH weights each neighbour by m/rho_j. Dropping that leaves the
          // raw kernel value, which is ~1e2 here, and the "blend toward the
          // neighbourhood average" turns into a huge velocity injection.
          const w = this.poly6 * diff * diff * diff * (this.mass / Math.max(this.density[j], 1e-3));
          ax += (this.vx[j] - this.vx[i]) * w;
          ay += (this.vy[j] - this.vy[i]) * w;
          az += (this.vz[j] - this.vz[i]) * w;
        }
        this.dx[i] = ax * this.viscosity;
        this.dy[i] = ay * this.viscosity;
        this.dz[i] = az * this.viscosity;
      }
      for (let i = 0; i < n; i++) {
        this.vx[i] += this.dx[i];
        this.vy[i] += this.dy[i];
        this.vz[i] += this.dz[i];
      }
    }

    const damp = Math.pow(1 - this.damping, h * 60);
    for (let i = 0; i < n; i++) {
      this.vx[i] *= damp; this.vy[i] *= damp; this.vz[i] *= damp;
      // Final backstop, applied after vorticity and viscosity have had their
      // say. Clamping only mid-step leaves those later terms unbounded.
      const s2 = this.vx[i] ** 2 + this.vy[i] ** 2 + this.vz[i] ** 2;
      if (s2 > maxV2) {
        const sc = this.maxSpeed / Math.sqrt(s2);
        this.vx[i] *= sc; this.vy[i] *= sc; this.vz[i] *= sc;
      }
      this.px[i] = this.qx[i];
      this.py[i] = this.qy[i];
      this.pz[i] = this.qz[i];
      if (!Number.isFinite(this.px[i]) || !Number.isFinite(this.py[i]) || !Number.isFinite(this.pz[i])) {
        // A single NaN would spread through the neighbour graph within a
        // step or two, so reset the offender immediately.
        this.px[i] = 0; this.py[i] = this.bounds.min.y + 1; this.pz[i] = 0;
        this.vx[i] = 0; this.vy[i] = 0; this.vz[i] = 0;
      }
    }
  }

  /* ---------------- rendering ---------------- */

  flush() {
    if (!this.count) return;
    const buf = this.instances;
    const r = this.particleRadius * 1.55;   // slight overlap so the surface closes
    for (let i = 0; i < this.count; i++) {
      const o = i * 4;
      buf[o] = this.px[i];
      buf[o + 1] = this.py[i];
      buf[o + 2] = this.pz[i];
      buf[o + 3] = r;
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf, 0, this.count * 4);
  }

  drawParticles() {
    if (!this.count) return;
    this.flush();
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
  }

  /* Average velocity magnitude — useful for driving splash sounds and for
     deciding when the water has settled. */
  averageSpeed() {
    if (!this.count) return 0;
    let s = 0;
    for (let i = 0; i < this.count; i++) {
      s += Math.sqrt(this.vx[i] ** 2 + this.vy[i] ** 2 + this.vz[i] ** 2);
    }
    return s / this.count;
  }
}

const _fp = new Vec3();
const _fn = new Vec3();
const _fl = new Vec3();
