/* ============================================================
   ANIMALS — articulated creatures with real gaits and real brains.

   Each animal is a set of primitive parts (body, neck, head, ears,
   legs, tail, eyes, antlers) posed procedurally every frame in
   world space: walk/trot/bound cycles with correct leg phasing,
   head bobbing while grazing, ear flicks, tail flicks, eye blinks.
   Every part is an instanced primitive, so a whole herd costs
   almost nothing to draw.

   The brain is a state machine per animal:
     graze -> wander -> alert -> flee            (prey)
   with herds that drift together and fawns that shadow their
   mothers. Anything close counts as a threat — by default the
   camera, so walking up to a deer works like real life: the head
   snaps up, a frozen beat, then bounding flight, tail flagged.

   Species so far: deer (male/female/fawn, small/medium/large —
   antler points grow with size; mule variant) and rabbit. Every
   later animal plugs into this same machinery.

   Convention: yaw 0 faces +Z; forward is (sin yaw, 0, cos yaw).
   ============================================================ */

const ANIMAL_SPECIES = {
  deer: {
    shoulder: 0.95, bodyLen: 1.2, bodyR: 0.26, legR: 0.045,
    neckLen: 0.42, headLen: 0.30,
    coat: { male: 0x6b4f2e, female: 0x7a5c38, fawn: 0x8f6c40 },
    earScale: 1.0, tailColor: 0xe8e0d0,
    walkSpeed: 0.9, runSpeed: 6.2, gait: 'quad',
    alertR: 6.5, safeR: 13, grazes: true,
  },
  rabbit: {
    shoulder: 0.2, bodyLen: 0.36, bodyR: 0.11, legR: 0.02,
    neckLen: 0.05, headLen: 0.13,
    coat: { male: 0x7d6a52, female: 0x8a765c, fawn: 0x96826a },
    earScale: 2.4, tailColor: 0xefe9dc,
    walkSpeed: 0.55, runSpeed: 4.6, gait: 'hop',
    alertR: 4.5, safeR: 9, grazes: true,
  },
};

const ANIMAL_SIZES = { small: 0.8, medium: 1.0, large: 1.18 };
/* Antler points per side by size: a small buck is a two-point,
   a large one carries a full rack. */
const ANTLER_POINTS = { small: 2, medium: 4, large: 6 };

function antlerMesh(engine, points, side) {
  return engine._mesh(`antler:${points}:${side}`, () => {
    const g = new Geometry();
    const sx = side;                       // mirror across the skull midline
    // Main beam sweeps up, out and back (forward is +Z, so back is -Z).
    const beam = [
      new Vec3(0, 0, 0),
      new Vec3(0.06 * sx, 0.14, -0.04),
      new Vec3(0.14 * sx, 0.27, -0.12),
      new Vec3(0.25 * sx, 0.35, -0.22),
    ];
    for (let i = 0; i < beam.length - 1; i++) {
      appendLimb(g, beam[i], beam[i + 1], 0.024 * (1 - i * 0.2), 0.018 * (1 - i * 0.2), 6);
    }
    for (let t = 0; t < points; t++) {
      const f = (t + 1) / (points + 0.5);
      const base = new Vec3().copy(beam[1]).lerp(beam[3], f);
      const tip = new Vec3(base.x + 0.03 * sx, base.y + 0.17 - f * 0.05, base.z + 0.02);
      appendLimb(g, base, tip, 0.012, 0.004, 5);
    }
    return g.finalize();
  });
}

let _animalId = 0;

class Animal {
  /* opts: { species, sex: 'male'|'female'|'fawn', size: 'small'|'medium'|
     'large', at, mother (Animal), mule, herd ({cx,cz}), groundY, seed } */
  constructor(engine, opts = {}) {
    this.engine = engine;
    this.id = _animalId++;
    const S = ANIMAL_SPECIES[opts.species] ? opts.species : 'deer';
    this.species = S;
    this.spec = ANIMAL_SPECIES[S];
    this.sex = opts.sex || (Math.random() < 0.5 ? 'male' : 'female');
    this.sizeName = ANIMAL_SIZES[opts.size] ? opts.size : 'medium';
    this.isBaby = this.sex === 'fawn';
    this.k = (opts.scaleMul || 1) * ANIMAL_SIZES[this.sizeName] * (this.isBaby ? 0.45 : 1);
    this.mother = opts.mother || null;
    this.mule = !!opts.mule;
    this.rng = new Rng(opts.seed || (7000 + this.id * 131));

    const at = Vec3.from(opts.at || [0, 0, 0]);
    this.x = at.x; this.z = at.z;
    this.groundY = typeof opts.groundY === 'function' ? opts.groundY : null;
    this.baseY = typeof opts.groundY === 'number' ? opts.groundY : at.y;
    this.yaw = this.rng.range(0, TAU);
    this.speed = 0;
    this.state = 'graze';
    this.stateT = this.rng.range(0, 2);
    this.phase = this.rng.range(0, 1);
    this.headDown = this.spec.grazes ? 1 : 0;
    this.blinkT = this.rng.range(1, 4); this.blink = 0;
    this.earT = this.rng.range(1, 5); this.earFlick = 0;
    this.tailT = this.rng.range(2, 6); this.tailFlick = 0;
    this.herd = opts.herd || null;
    this.dead = false;

    this._build();
    this._pose();
  }

  _groundAt(x, z) { return this.groundY ? this.groundY(x, z) : this.baseY; }

  _build() {
    const e = this.engine, sp = this.spec, k = this.k;
    const coat = this.isBaby ? sp.coat.fawn : (sp.coat[this.sex] || sp.coat.female);
    const coatM = e.material({ color: this.mule ? 0x655a48 : coat, roughness: 0.92 });
    const darkM = e.material({ color: 0x1c130c, roughness: 0.55 });
    const boneM = e.material({ color: 0xcfc4a8, roughness: 0.7 });
    const tailM = e.material({ color: sp.tailColor, roughness: 0.92 });
    const sphere = e._mesh('sphere', () => Shapes.sphere(0.5, 20, 28));
    const box = e._mesh('box', () => Shapes.box(1, 1, 1, 1));
    const part = (mesh, mat) => {
      const a = new Actor(e, { mesh, material: mat, name: `animal${this.id}` });
      a.boundRadius = 1.2;
      e.actors.push(a);
      return a;
    };

    this.body = part(sphere, coatM);
    this.parts = [this.body];
    const add = (mesh, mat) => { const a = part(mesh, mat); this.parts.push(a); return a; };
    this.neck = add(box, coatM);
    this.head = add(sphere, coatM);
    this.snout = add(box, coatM);
    this.tail = add(sphere, tailM);
    this.ears = [add(box, coatM), add(box, coatM)];
    this.eyes = [add(sphere, darkM), add(sphere, darkM)];
    this.legs = [];
    for (let i = 0; i < 4; i++) this.legs.push(add(box, coatM));
    this.antlers = [];
    if (this.species === 'deer' && this.sex === 'male' && !this.isBaby) {
      this.antlers = [
        add(antlerMesh(e, ANTLER_POINTS[this.sizeName], 1), boneM),
        add(antlerMesh(e, ANTLER_POINTS[this.sizeName], -1), boneM),
      ];
    }
  }

  /* ---------------- the brain ---------------- */

  _threatInfo() {
    const e = this.engine;
    const t = e.animalThreat || (e.camera && e.camera.position);
    if (!t) return null;
    const dx = this.x - t.x, dz = this.z - t.z;
    return { dx, dz, d: Math.sqrt(dx * dx + dz * dz) };
  }

  spook(from) {
    if (from) { const p = Vec3.from(from); this.yaw = Math.atan2(this.x - p.x, this.z - p.z); }
    this.state = 'flee';
    this.stateT = this.rng.range(2.2, 3.6);
  }

  update(dt) {
    if (this.dead) return;
    const sp = this.spec, k = this.k;
    this.stateT -= dt;
    const th = this._threatInfo();

    if (this.mother && !this.mother.dead) {
      const m = this.mother;
      if (m.state === 'flee' && this.state !== 'flee') { this.state = 'flee'; this.stateT = 2.5; }
      if (this.state !== 'flee') {
        const dx = m.x - this.x, dz = m.z - this.z;
        if (dx * dx + dz * dz > 2.2) { this.state = 'follow'; this.yaw = Math.atan2(dx, dz); }
        else if (this.state === 'follow') { this.state = 'graze'; this.stateT = this.rng.range(1, 3); }
      }
    }

    switch (this.state) {
      case 'graze':
        this.speed = lerp(this.speed, 0, dt * 6);
        this.headDown = lerp(this.headDown, 1, dt * 2.5);
        if (th && th.d < sp.alertR) { this.state = 'alert'; this.stateT = this.rng.range(0.5, 1.2); }
        else if (this.stateT <= 0) { this.state = 'wander'; this.stateT = this.rng.range(1.5, 3.5); this.yaw += this.rng.range(-1.2, 1.2); }
        break;
      case 'wander': {
        this.speed = lerp(this.speed, sp.walkSpeed * k, dt * 3);
        this.headDown = lerp(this.headDown, 0.25, dt * 2);
        if (this.herd) {
          const hx = this.herd.cx - this.x, hz = this.herd.cz - this.z;
          if (hx * hx + hz * hz > 36) this.yaw = lerp(this.yaw, Math.atan2(hx, hz), dt * 0.8);
        }
        if (th && th.d < sp.alertR) { this.state = 'alert'; this.stateT = this.rng.range(0.4, 1); }
        else if (this.stateT <= 0) { this.state = 'graze'; this.stateT = this.rng.range(2, 5); }
        break;
      }
      case 'alert':
        this.speed = lerp(this.speed, 0, dt * 10);
        this.headDown = lerp(this.headDown, 0, dt * 8);
        if (th && th.d < sp.alertR * 0.55) this.spook({ x: this.x - th.dx, y: 0, z: this.z - th.dz });
        else if (this.stateT <= 0) {
          if (th && th.d < sp.alertR) { this.stateT = this.rng.range(1, 2.5); }
          else { this.state = 'graze'; this.stateT = this.rng.range(1, 2.5); }
        }
        break;
      case 'follow':
        this.speed = lerp(this.speed, sp.walkSpeed * 1.7 * k, dt * 4);
        this.headDown = lerp(this.headDown, 0.1, dt * 3);
        break;
      case 'flee': {
        this.speed = lerp(this.speed, sp.runSpeed * k, dt * 4);
        this.headDown = lerp(this.headDown, 0, dt * 10);
        if (th) {
          const away = Math.atan2(th.dx, th.dz);
          this.yaw = lerp(this.yaw, away + Math.sin(this.engine.time * 2.1 + this.id) * 0.35, dt * 3);
        }
        if (this.stateT <= 0 && (!th || th.d > sp.safeR)) { this.state = 'alert'; this.stateT = this.rng.range(0.8, 1.6); }
        break;
      }
    }

    this.x += Math.sin(this.yaw) * this.speed * dt;
    this.z += Math.cos(this.yaw) * this.speed * dt;

    // Gait phase advances with distance covered, so feet never skate.
    const stride = (sp.gait === 'hop' ? 0.7 : 1.4) * k;
    if (this.speed > 0.03) this.phase = (this.phase + (this.speed / stride) * dt) % 1;

    // Micro-life.
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.12; this.blinkT = this.rng.range(1.5, 5); }
    this.blink = Math.max(0, this.blink - dt);
    this.earT -= dt;
    if (this.earT <= 0) { this.earFlick = 0.3; this.earT = this.rng.range(2, 6); }
    this.earFlick = Math.max(0, this.earFlick - dt);
    this.tailT -= dt;
    if (this.tailT <= 0) { this.tailFlick = 0.5; this.tailT = this.rng.range(2, 7); }
    this.tailFlick = Math.max(0, this.tailFlick - dt);

    this._pose();
  }

  /* ---------------- the puppeteer (all world-space) ---------------- */

  _pose() {
    const sp = this.spec, k = this.k;
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    /* local (lx = left/right, ly = up, lz = forward) -> world */
    const W = (a, lx, ly, lz) => a._position.set(
      this.x + cosY * lx + sinY * lz,
      this._y + ly,
      this.z - sinY * lx + cosY * lz);

    const running = this.speed > sp.walkSpeed * k * 2.2;
    const ph = this.phase * TAU;
    const legLen = sp.shoulder * k;
    const hop = sp.gait === 'hop'
      ? (this.speed > 0.1 ? Math.abs(Math.sin(ph)) * 0.14 * k * (1 + this.speed * 0.5) : 0)
      : (running ? Math.abs(Math.sin(ph)) * 0.3 * k : 0);
    this._y = this._groundAt(this.x, this.z) + legLen + sp.bodyR * k * 0.6 + hop;

    // Body: a stretched sphere; pitches with the bound while running.
    W(this.body, 0, 0, 0);
    this.body._rotation.setEuler(running ? Math.sin(ph) * 0.12 : 0, this.yaw, 0);
    this.body.scale.set(sp.bodyR * 2 * k, sp.bodyR * 2.3 * k, sp.bodyLen * k);

    // Legs. Walk: lateral sequence; run/hop: front and hind pairs.
    const phases = sp.gait === 'hop'
      ? [0.05, 0, 0.5, 0.55]
      : (running ? [0, 0.12, 0.55, 0.65] : [0, 0.5, 0.75, 0.25]);
    const amp = this.speed < 0.05 ? 0 : (running ? 0.85 : 0.5);
    const hz = sp.bodyLen * 0.32 * k, hx = sp.bodyR * 0.6 * k;
    const hips = [[hx, hz], [-hx, hz], [hx, -hz], [-hx, -hz]];
    for (let i = 0; i < 4; i++) {
      const swing = Math.sin((this.phase + phases[i]) * TAU) * amp;
      const leg = this.legs[i];
      const hipY = -sp.bodyR * k * 0.7;
      W(leg, hips[i][0], hipY - Math.cos(swing) * legLen * 0.5, hips[i][1] + Math.sin(swing) * legLen * 0.5);
      leg._rotation.setEuler(swing, this.yaw, 0);
      leg.scale.set(sp.legR * 2 * k, legLen, sp.legR * 2 * k);
    }

    // Neck and head: buried in the grass or held high, nodding as it walks.
    const nod = this.speed > 0.05 && !running ? Math.sin(ph * 2) * 0.05 : 0;
    const down = this.headDown;
    const neckPitch = lerp(-0.85, 0.9, down);        // -up ... +down
    const nBase = sp.bodyLen * 0.42 * k;
    W(this.neck, 0, sp.bodyR * k * (1 - down) * 0.9 - down * 0.1 * k, nBase);
    this.neck._rotation.setEuler(neckPitch, this.yaw, 0);
    this.neck.scale.set(sp.bodyR * 0.55 * k, sp.neckLen * k * 1.35, sp.bodyR * 0.6 * k);
    const hY = sp.bodyR * k * (1 - down) * 1.7 - down * legLen * 0.62 + nod * k;
    const hZ = nBase + sp.neckLen * k * (0.5 + down * 0.4);
    W(this.head, 0, hY, hZ);
    this.head._rotation.setEuler(down * 0.5, this.yaw, 0);
    this.head.scale.set(sp.headLen * 0.72 * k, sp.headLen * 0.72 * k, sp.headLen * k);
    W(this.snout, 0, hY - sp.headLen * k * 0.14 - down * 0.03, hZ + sp.headLen * k * 0.55);
    this.snout._rotation.setEuler(down * 0.5, this.yaw, 0);
    this.snout.scale.set(sp.headLen * 0.34 * k, sp.headLen * 0.3 * k, sp.headLen * 0.42 * k);

    // Ears — rabbits wear them tall; the flick is a quick rotation shiver.
    const flick = this.earFlick > 0 ? Math.sin(this.earFlick * 24) * 0.5 : 0;
    const earL = sp.headLen * 0.6 * sp.earScale * k;
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      W(this.ears[i], s * sp.headLen * 0.35 * k, hY + sp.headLen * 0.5 * k + earL * 0.4, hZ - sp.headLen * 0.2 * k);
      this.ears[i]._rotation.setEuler(-0.25, this.yaw, s * (0.3 + (i === 0 ? flick : flick * 0.4)));
      this.ears[i].scale.set(earL * 0.32, earL, earL * 0.14);
    }

    // Eyes, with blinks (a blink is a vertical squash of the eye).
    const lid = this.blink > 0 ? 0.15 : 1;
    const eyeR = sp.headLen * 0.16 * k;
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      W(this.eyes[i], s * sp.headLen * 0.37 * k, hY + sp.headLen * 0.1 * k, hZ + sp.headLen * 0.28 * k);
      this.eyes[i].scale.set(eyeR, eyeR * lid, eyeR);
    }

    // Tail: relaxed normally, flagged high in flight (the whitetail flag).
    const flag = this.state === 'flee' ? 1 : (this.tailFlick > 0 ? Math.abs(Math.sin(this.tailFlick * 14)) * 0.5 : 0);
    W(this.tail, 0, sp.bodyR * k * (0.4 + flag * 0.9), -sp.bodyLen * 0.5 * k);
    this.tail._rotation.setEuler(-0.6 - flag * 0.9, this.yaw, 0);
    this.tail.scale.set(sp.bodyR * 0.7 * k, sp.bodyR * 0.9 * k, sp.bodyR * 0.7 * k);

    // Antlers ride the skull.
    for (let i = 0; i < this.antlers.length; i++) {
      const s = i === 0 ? 1 : -1;
      const a = this.antlers[i];
      W(a, s * sp.headLen * 0.22 * k, hY + sp.headLen * 0.42 * k, hZ - sp.headLen * 0.15 * k);
      a._rotation.setEuler(0, this.yaw, 0);
      a.scale.set(k, k, k);
    }
  }

  destroy() {
    this.dead = true;
    for (const p of this.parts) p.destroy();
  }
}

/* ---------------- engine surface ---------------- */

Engine.prototype.animal = function (opts = {}) {
  if (!this.animals) {
    this.animals = [];
    this.onUpdate((dt) => {
      let cx = 0, cz = 0, n = 0;
      for (const a of this.animals) if (!a.dead && a.herd) { cx += a.x; cz += a.z; n++; }
      for (const a of this.animals) {
        if (a.dead) continue;
        if (a.herd && n) { a.herd.cx = cx / n; a.herd.cz = cz / n; }
        a.update(dt);
      }
    });
  }
  const a = new Animal(this, opts);
  this.animals.push(a);
  return a;
};

/* A natural mixed group: bucks, does and their fawns. */
Engine.prototype.herdOf = function (opts = {}) {
  const n = opts.count || 6;
  const at = Vec3.from(opts.at || [0, 0, 0]);
  const spread = opts.spread || 4;
  const herd = { cx: at.x, cz: at.z };
  const rng = new Rng(opts.seed || 99);
  const out = [];
  const sizes = ['small', 'medium', 'large'];
  for (let i = 0; i < n; i++) {
    const sex = i === 0 ? 'male' : (rng.next() < 0.55 ? 'female' : 'male');
    const a = this.animal(Object.assign({}, opts, {
      sex, size: sizes[(rng.next() * 3) | 0], herd,
      at: [at.x + rng.range(-spread, spread), at.y, at.z + rng.range(-spread, spread)],
      seed: (opts.seed || 99) * 31 + i,
    }));
    out.push(a);
    if (sex === 'female' && rng.next() < 0.6) {
      out.push(this.animal(Object.assign({}, opts, {
        sex: 'fawn', size: 'small', herd, mother: a,
        at: [a.x + rng.range(-1, 1), at.y, a.z + rng.range(-1, 1)],
        seed: (opts.seed || 99) * 57 + i,
      })));
    }
  }
  return out;
};

/* Test plate: a blank simulation slab, up to 10 square miles, ready to
   build on. */
Engine.prototype.testPlate = function (opts = {}) {
  const miles = clamp(opts.miles || 1, 0.02, 10);
  const side = Math.sqrt(miles) * 1609.34;
  const g = this.ground(Object.assign({ size: side }, opts));
  g.userData = { testPlate: true, miles, side };
  return g;
};
