/* ============================================================
   WATER VOLUMES — simulated surfaces with real wave physics.

   Where the particle Fluid (86) is a bucket of individual drops,
   a WaterVolume is a BODY of water: a rectangular region whose
   surface is a live 2D wave simulation. Nothing here is a looping
   animation — every ripple is computed, travels, reflects off the
   walls and interferes with every other ripple, so waves genuinely
   build up, and no two seconds ever look the same.

   What a volume does:
   - waves: wind pumps energy into the surface (deep water rolls,
     swamp barely moves); any disturbance ripples outward.
   - buoyancy: dynamic bodies that enter float, drag and bob, and
     get pushed by the local wave slope.
   - splashes: bodies breaking the surface throw droplets and ring
     waves; games can call splashAt() for bullets and explosions.
   - holes & draining: addHole() lets water pour out (Torricelli
     outflow — the jet weakens as the level falls), which is what
     makes the shot-aquarium moment work.
   - life: fish that swim while there is water and flop when there
     is not; scum pads and rising bubbles for the murkier types.
   ============================================================ */

const WATER_PRESETS = {
  deep: {
    // Open dark water: low damping and strong wind coupling, so energy
    // accumulates into rolling swell instead of dying as ripples.
    color: 0x0d2f4e, opacity: 0.86, roughness: 0.06,
    speed: 6.0, damping: 0.07, energy: 2.6, edgeAbsorb: true,
    buoy: 1.18, drag: 1.5,
  },
  shallow: {
    // Clear and quick: ripples spread fast and die fast.
    color: 0x2f9db0, opacity: 0.46, roughness: 0.05,
    speed: 7.0, damping: 0.55, energy: 0.16, edgeAbsorb: true,
    buoy: 1.06, drag: 1.1,
  },
  desert: {
    // An oasis pool: nearly still glass that only moves when touched.
    color: 0x1fae9d, opacity: 0.5, roughness: 0.04,
    speed: 6.5, damping: 0.5, energy: 0.05, edgeAbsorb: true,
    buoy: 1.06, drag: 1.0,
  },
  swamp: {
    // Thick and sluggish: waves crawl and die, scum rides the surface,
    // and the bottom occasionally lets a bubble go.
    color: 0x33451f, opacity: 0.94, roughness: 0.35,
    speed: 2.6, damping: 1.6, energy: 0.05, edgeAbsorb: true,
    buoy: 1.3, drag: 3.5, scum: true, bubbles: 0.5,
  },
  contaminated: {
    // Glowing runoff: viscous, restless with bubbles, and flagged toxic
    // so games can hurt whatever swims in it.
    color: 0x2f8f1c, opacity: 0.9, roughness: 0.2, emissive: 0x1a4d08,
    speed: 3.6, damping: 0.9, energy: 0.14, edgeAbsorb: true,
    buoy: 1.2, drag: 2.2, bubbles: 1.3, toxic: true,
  },
};

const WATER_RES = { low: 56, medium: 72, high: 96, ultra: 120 };

class WaterVolume {
  /* opts: { type, at:[x, surfaceY, z], size:[width, length], depth,
            walls (true = closed tank: waves slosh and reflect),
            fish (count), seed } */
  constructor(engine, opts = {}) {
    this.engine = engine;
    this.type = WATER_PRESETS[opts.type] ? opts.type : 'deep';
    this.P = Object.assign({}, WATER_PRESETS[this.type], opts);
    this.center = Vec3.from(opts.at || [0, 0.5, 0]);
    const size = opts.size != null ? opts.size : [20, 20];
    this.W = Array.isArray(size) ? size[0] : size;
    this.L = Array.isArray(size) ? (size[1] != null ? size[1] : size[0]) : size;
    this.depth = opts.depth != null ? opts.depth : 2;
    this.level = this.center.y;              // surface height, falls as it drains
    this.floorY = this.center.y - this.depth;
    this.walls = !!opts.walls;
    this.toxic = !!this.P.toxic;
    this.rng = new Rng(opts.seed || 4242);

    // ---- wave grid ----
    const q = engine.renderer.qualityName || 'medium';
    this.res = opts.res || WATER_RES[q] || 72;
    const n = this.res * this.res;
    this.h = new Float32Array(n);            // height offset from level
    this.v = new Float32Array(n);            // vertical velocity per cell
    this._gustT = 0;

    // ---- surface mesh (positions/normals re-uploaded each frame) ----
    const res = this.res;
    const g = new Geometry();
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const x = this.center.x + (i / (res - 1) - 0.5) * this.W;
        const z = this.center.z + (j / (res - 1) - 0.5) * this.L;
        g.vert(x, this.level, z, 0, 1, 0, i / (res - 1) * 4, j / (res - 1) * 4);
      }
    }
    for (let j = 0; j < res - 1; j++) {
      for (let i = 0; i < res - 1; i++) {
        const a = j * res + i;
        g.quad(a, a + res, a + res + 1, a + 1);
      }
    }
    const geo = g.finalize();
    this.positions = geo.positions;          // kept CPU-side for updates
    this.normals = geo.normals;
    // Foam rides in the color buffer's red channel (WATER_FX shader define)
    // rather than being a second mesh — one draw call still does both the
    // glassy water and the whitecaps on top of it.
    this.foam = new Float32Array(n);
    geo.colors = new Float32Array(n * 3);
    this.mesh = new GpuMesh(engine.gl, geo);
    this.material = new Material(engine.gl, {
      color: this.P.color, opacity: this.P.opacity, transparent: true,
      roughness: this.P.roughness, metalness: 0,
      emissive: this.P.emissive || 0x000000, emissiveStrength: this.P.emissive ? 0.6 : 0,
      doubleSided: true, castShadow: false,
    });
    this._model = new Mat4();
    this._params = [1, 1, 1, 0];

    this.holes = [];
    this.fish = [];
    this.scum = [];
    this._bubbleT = 0;
    this._splashColor = parseColor(this.P.color).lerp(new Vec3(1, 1, 1), 0.55);

    if (opts.fish) this._spawnFish(opts.fish);
    if (this.P.scum) this._spawnScum();
  }

  /* ---------------- queries & actions (the game-facing API) ---------------- */

  contains(x, z) {
    return Math.abs(x - this.center.x) <= this.W / 2 && Math.abs(z - this.center.z) <= this.L / 2;
  }

  /* Surface height at a world position, waves included. */
  heightAt(x, z) {
    const res = this.res;
    const fx = clamp((x - this.center.x) / this.W + 0.5, 0, 1) * (res - 1);
    const fz = clamp((z - this.center.z) / this.L + 0.5, 0, 1) * (res - 1);
    const i = Math.min(res - 2, fx | 0), j = Math.min(res - 2, fz | 0);
    const tx = fx - i, tz = fz - j;
    const h00 = this.h[j * res + i], h10 = this.h[j * res + i + 1];
    const h01 = this.h[(j + 1) * res + i], h11 = this.h[(j + 1) * res + i + 1];
    return this.level + lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  /* Push the surface: radius in world units, strength in m/s of vertical
     kick (negative pushes down — a body plunging in; positive lifts). */
  disturb(x, z, radius = 0.5, strength = -2) {
    const res = this.res;
    const cw = this.W / (res - 1), cl = this.L / (res - 1);
    const ci = ((x - this.center.x) / this.W + 0.5) * (res - 1);
    const cj = ((z - this.center.z) / this.L + 0.5) * (res - 1);
    const ri = Math.max(1, Math.ceil(radius / cw)), rj = Math.max(1, Math.ceil(radius / cl));
    for (let j = Math.max(0, cj - rj | 0); j <= Math.min(res - 1, cj + rj | 0); j++) {
      for (let i = Math.max(0, ci - ri | 0); i <= Math.min(res - 1, ci + ri | 0); i++) {
        const dx = (i - ci) * cw, dz = (j - cj) * cl;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > radius) continue;
        this.v[j * res + i] += strength * (Math.cos(d / radius * PI) * 0.5 + 0.5);
      }
    }
  }

  /* Bullet / explosion entry point: ring wave + droplets + sound. */
  splashAt(pos, strength = 1) {
    const p = Vec3.from(pos);
    if (!this.contains(p.x, p.z)) return false;
    const s = clamp(strength, 0.1, 6);
    this.disturb(p.x, p.z, 0.3 + s * 0.35, -3.5 * s);
    this._droplets(p.x, this.heightAt(p.x, p.z), p.z, Math.round(8 + s * 10), 2 + s * 1.6);
    this.engine.audio.splash(clamp(s / 3, 0.15, 1));
    return true;
  }

  /* Punch a hole (e.g. a shot container wall): water pours out of it and
     the level falls until it reaches the hole. */
  addHole(pos, radius = 0.1) {
    const p = Vec3.from(pos);
    this.holes.push({ x: p.x, y: p.y, z: p.z, r: radius });
    this.disturb(p.x, p.z, radius * 3, -1.5);
  }

  /* ---------------- internals ---------------- */

  _droplets(x, y, z, count, speed) {
    const P = this.engine.particles;
    const v = new Vec3();
    for (let i = 0; i < count; i++) {
      this.rng.unitVec3(v);
      v.y = Math.abs(v.y) * 1.4 + 0.6;
      v.scale(speed * this.rng.range(0.4, 1.1));
      P.spawn({
        position: { x: x + this.rng.range(-0.15, 0.15), y, z: z + this.rng.range(-0.15, 0.15) },
        velocity: v, life: this.rng.range(0.4, 0.9),
        size: this.rng.range(0.03, 0.09), sizeEnd: 0.01,
        color: this._splashColor, alpha: 0.9, gravity: -13, drag: 0.4,
      });
    }
  }

  _spawnFish(count) {
    for (let i = 0; i < count; i++) {
      const x = this.center.x + this.rng.range(-this.W, this.W) * 0.35;
      const z = this.center.z + this.rng.range(-this.L, this.L) * 0.35;
      const a = this.engine.box({
        at: [x, this.level - this.depth * 0.5, z],
        size: [0.22, 0.07, 0.05],
        material: { color: i % 2 ? 0xd0722a : 0xd8a13a, roughness: 0.35 },
        physics: false, castShadow: false,
      });
      this.fish.push({
        a, x, z, y: this.level - this.depth * 0.5,
        ang: this.rng.range(0, TAU), speed: this.rng.range(0.5, 1.1),
        turn: 0, flop: 0, ph: this.rng.range(0, TAU),
      });
    }
  }

  _spawnScum() {
    for (let i = 0; i < 12; i++) {
      const x = this.center.x + this.rng.range(-this.W, this.W) * 0.42;
      const z = this.center.z + this.rng.range(-this.L, this.L) * 0.42;
      const r = this.rng.range(0.25, 0.7);
      const a = this.engine.sphere({
        at: [x, this.level + 0.01, z], radius: r,
        material: { color: 0x4a5c22, roughness: 0.95 },
        physics: false, castShadow: false,
      });
      a.scale.set(r * 2, 0.02, r * 2);
      this.scum.push({ a, x, z, dx: this.rng.range(-0.03, 0.03), dz: this.rng.range(-0.03, 0.03) });
    }
  }

  update(dt) {
    const res = this.res, h = this.h, v = this.v, P = this.P;
    const cell = this.W / (res - 1);

    // ---- wind pumping: random gust cells inject energy so open water
    // builds real, non-repeating swell. ----
    this._gustT -= dt;
    if (this._gustT <= 0 && P.energy > 0) {
      this._gustT = 0.18;
      const wind = this.engine.wind ? this.engine.wind.strength : 0.3;
      const kicks = Math.max(1, (res * res / 900) | 0);
      for (let k = 0; k < kicks; k++) {
        const i = 1 + (this.rng.next() * (res - 2)) | 0;
        const j = 1 + (this.rng.next() * (res - 2)) | 0;
        v[j * res + i] += this.rng.range(-1, 1) * P.energy * wind * 2.2;
      }
    }

    // ---- wave equation (fixed substep for stability) ----
    const c2 = P.speed * P.speed;
    const step = 1 / 60;
    let remaining = Math.min(dt, 0.1);
    while (remaining > 0) {
      const sdt = Math.min(step, remaining);
      remaining -= sdt;
      const k = c2 * sdt / (cell * cell) * 0.5;
      for (let j = 0; j < res; j++) {
        for (let i = 0; i < res; i++) {
          const idx = j * res + i;
          // Clamped-edge neighbours make walls reflect, which is exactly
          // what a closed tank should do (sloshing).
          const l = h[j * res + Math.max(0, i - 1)], r = h[j * res + Math.min(res - 1, i + 1)];
          const u = h[Math.max(0, j - 1) * res + i], d = h[Math.min(res - 1, j + 1) * res + i];
          v[idx] += (l + r + u + d - 4 * h[idx]) * k;
          v[idx] -= v[idx] * P.damping * sdt;
        }
      }
      for (let i = 0; i < res * res; i++) h[i] += v[i] * sdt;
      // Open water: soak up energy near the rim so waves roll out instead
      // of bouncing back forever.
      if (!this.walls && P.edgeAbsorb) {
        const band = 3;
        for (let j = 0; j < res; j++) {
          for (let i = 0; i < res; i++) {
            const e = Math.min(i, j, res - 1 - i, res - 1 - j);
            if (e < band) { const f = 1 - (band - e) * 0.05; const idx = j * res + i; h[idx] *= f; v[idx] *= f; }
          }
        }
      }
    }

    // ---- draining through holes ----
    if (this.holes.length && this.level > this.floorY + 0.01) {
      const area = this.W * this.L;
      for (const hole of this.holes) {
        const head = this.level - hole.y;
        if (head <= 0) continue;
        const q = 2.6 * hole.r * hole.r * Math.sqrt(2 * 9.8 * head);   // Torricelli
        this.level = Math.max(this.floorY, this.level - (q / area) * dt * 60);
        // The escaping jet.
        if (this.rng.next() < 0.8) {
          const out = new Vec3(hole.x - this.center.x, 0, hole.z - this.center.z);
          if (out.lengthSq() < 1e-4) out.set(1, 0, 0); out.normalize();
          this.engine.particles.spawn({
            position: { x: hole.x, y: hole.y, z: hole.z },
            velocity: { x: out.x * (1.2 + head), y: -0.4, z: out.z * (1.2 + head) },
            life: this.rng.range(0.5, 1), size: 0.07, sizeEnd: 0.02,
            color: this._splashColor, alpha: 0.9, gravity: -12, drag: 0.2,
          });
        }
        if (this.rng.next() < 0.15) this.disturb(hole.x, hole.z, 0.5, -0.4);
      }
    }

    // ---- buoyancy, drag and splash-in for dynamic bodies ----
    for (const b of this.engine.physics.bodies) {
      if (b.isStatic || !b.invMass) continue;
      const p = b.position;
      if (!this.contains(p.x, p.z)) { b._inWater = false; continue; }
      const surf = this.heightAt(p.x, p.z);
      const r = (b.shape && b.shape.boundRadius) || 0.5;
      const bottom = p.y - r;
      if (bottom > surf) { if (b._inWater) b._inWater = false; continue; }
      const sub = clamp((surf - bottom) / (r * 2), 0, 1);

      if (!b._inWater && b.velocity.y < -1.2) {
        const s = clamp(-b.velocity.y * r * 0.35, 0.3, 4);
        this.disturb(p.x, p.z, r * 1.6, -2.2 * s);
        this._droplets(p.x, surf, p.z, Math.round(6 + s * 8), 1.6 + s);
        this.engine.audio.splash(clamp(s / 3, 0.1, 1));
      }
      b._inWater = true;

      const mass = b.invMass > 0 ? 1 / b.invMass : 1;
      // Buoyancy fights gravity; slightly over 1 means most things float.
      const g = Math.abs(this.engine.physics.gravity ? this.engine.physics.gravity.y : 19.6) || 19.6;
      b.velocity.y += g * sub * this.P.buoy * dt;
      // Water resists motion in every direction.
      const dragK = clamp(1 - this.P.drag * sub * dt, 0.5, 1);
      b.velocity.scale(dragK);
      // Wave slope shoves floaters around, which is what sells the swell.
      const gx = this.heightAt(p.x + 0.4, p.z) - this.heightAt(p.x - 0.4, p.z);
      const gz = this.heightAt(p.x, p.z + 0.4) - this.heightAt(p.x, p.z - 0.4);
      b.velocity.x += -gx * 6 * sub * dt * 60 * 0.16;
      b.velocity.z += -gz * 6 * sub * dt * 60 * 0.16;
      if (b.wake) b.wake();
      // A moving body stirs the surface it passes through.
      const sp = Math.sqrt(b.velocity.x * b.velocity.x + b.velocity.z * b.velocity.z);
      if (sp > 1.5 && this.rng.next() < 0.3) this.disturb(p.x, p.z, r * 1.2, -sp * 0.25);
    }

    // ---- bubbles (swamp / contaminated) ----
    if (this.P.bubbles) {
      this._bubbleT -= dt;
      if (this._bubbleT <= 0) {
        this._bubbleT = 0.5 / this.P.bubbles;
        const x = this.center.x + this.rng.range(-this.W, this.W) * 0.4;
        const z = this.center.z + this.rng.range(-this.L, this.L) * 0.4;
        this.engine.particles.spawn({
          position: { x, y: Math.max(this.floorY, this.level - this.depth * 0.8), z },
          velocity: { x: 0, y: this.rng.range(0.5, 1.1), z: 0 },
          life: this.rng.range(0.8, 1.6), size: this.rng.range(0.04, 0.1), sizeEnd: 0.12,
          color: this._splashColor, alpha: 0.5, gravity: 1.5, drag: 0.6,
        });
        if (this.rng.next() < 0.5) this.disturb(x, z, 0.3, 0.5);
      }
    }

    // ---- fish: swim while wet, flop when stranded ----
    const waterDepth = this.level - this.floorY;
    for (const f of this.fish) {
      if (waterDepth > 0.16) {
        f.turn += (this.rng.next() - 0.5) * 1.6 * dt;
        f.ang += f.turn * dt * 60 * 0.05;
        f.x += Math.cos(f.ang) * f.speed * dt;
        f.z += Math.sin(f.ang) * f.speed * dt;
        // Stay in the pool, comfortably under the surface.
        const mX = this.W * 0.46, mZ = this.L * 0.46;
        if (Math.abs(f.x - this.center.x) > mX || Math.abs(f.z - this.center.z) > mZ) {
          f.ang += PI * 0.5; f.x = clamp(f.x, this.center.x - mX, this.center.x + mX); f.z = clamp(f.z, this.center.z - mZ, this.center.z + mZ);
        }
        const targetY = Math.min(this.level - 0.12, this.floorY + waterDepth * (0.35 + 0.3 * Math.sin(this.engine.time * 0.7 + f.ph)));
        f.y = lerp(f.y, Math.max(this.floorY + 0.05, targetY), dt * 2);
        f.a.setPosition([f.x, f.y, f.z]);
        f.a.setRotation(new Quat().setEuler(0, -f.ang, 0));
      } else {
        // Beached: frantic flipping that slowly tires out.
        f.flop += dt;
        const tired = Math.max(0.2, 1 - f.flop * 0.08);
        const hop = Math.abs(Math.sin(f.flop * 9 * tired + f.ph)) * 0.09 * tired;
        f.x += this.rng.range(-0.5, 0.5) * dt * tired;
        f.z += this.rng.range(-0.5, 0.5) * dt * tired;
        f.a.setPosition([f.x, this.floorY + 0.04 + hop, f.z]);
        f.a.setRotation(new Quat().setEuler(Math.sin(f.flop * 9 * tired) * 1.2, -f.ang, Math.sin(f.flop * 7) * 0.6));
      }
    }

    // ---- scum rides the surface ----
    for (const s of this.scum) {
      s.x += s.dx * dt; s.z += s.dz * dt;
      s.a.setPosition([s.x, this.heightAt(s.x, s.z) + 0.01, s.z]);
    }

    // ---- write the surface mesh (+ foam: wave-crest whitecaps and, in a
    // walled tank, a sloshing waterline where the surface meets the wall) ----
    const pos = this.positions, nrm = this.normals, foam = this.foam, colors = this.mesh.__colorBuf || (this.mesh.__colorBuf = new Float32Array(res * res * 3));
    const inv2c = 1 / (2 * cell);
    // Steeper/faster water foams more readily; calm pools barely foam at all.
    const crestFoam = 1.6 + P.speed * 0.12;
    const velFoam = 0.9;
    const decay = clamp(1 - 1.6 * dt, 0, 1);
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const idx = j * res + i, vi = idx * 3;
        pos[vi + 1] = this.level + h[idx];
        const l = h[j * res + Math.max(0, i - 1)], r = h[j * res + Math.min(res - 1, i + 1)];
        const u = h[Math.max(0, j - 1) * res + i], d = h[Math.min(res - 1, j + 1) * res + i];
        let nx = (l - r) * inv2c, nz = (u - d) * inv2c;
        const len = Math.sqrt(nx * nx + 1 + nz * nz);
        nrm[vi] = nx / len; nrm[vi + 1] = 1 / len; nrm[vi + 2] = nz / len;

        // Whitecaps: tall, fast-moving crests foam; everything else doesn't.
        let inject = Math.max(0, h[idx] * crestFoam - 0.5) + Math.max(0, Math.abs(v[idx]) * velFoam - 0.7);
        // A walled tank always shows a thin foam line at the waterline.
        if (this.walls) {
          const edge = Math.min(i, j, res - 1 - i, res - 1 - j);
          if (edge < 2) inject = Math.max(inject, (Math.abs(v[idx]) + 0.15) * 0.4);
        }
        foam[idx] = clamp(Math.max(foam[idx] * decay, Math.min(1, inject)), 0, 1);
        colors[vi] = foam[idx]; colors[vi + 1] = foam[idx]; colors[vi + 2] = foam[idx];
      }
    }
    this.mesh.updateAttrib(ATTR.POSITION, pos);
    this.mesh.updateAttrib(ATTR.COLOR, colors);
    this.mesh.updateAttrib(ATTR.NORMAL, nrm);
  }

  batch() {
    return {
      mesh: this.mesh, material: this.material,
      model: this._model, params: this._params,
      count: 1, instanced: false, grass: false, alphaClip: false, waterFx: true, sortKey: 1,
    };
  }

  dispose() {
    this.mesh.dispose();
    this.material.dispose();
  }
}
