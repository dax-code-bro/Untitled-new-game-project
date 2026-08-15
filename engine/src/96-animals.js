/* ============================================================
   ANIMALS — sculpted, skinned, furred creatures with real brains.

   v2: every animal is ONE connected mesh — a body sculpted with
   lofted rings around a real quadruped skeleton (the same pipeline
   the human character uses), auto-skinned by bone distance, and
   posed by driving bone rotations from the gait system. No more
   floating parts: neck flows out of the chest, legs grow out of
   the shoulders and hips, and everything bends at real joints.

   Fur comes from the procedural 'fur' texture: dense strands
   running along the body, clumping, hide-tone patches and pale
   guard hairs, with the strand field driving the normal map so
   raking light shimmers across the coat.

   The brain (graze -> wander -> alert -> flee, herds, fawns that
   shadow their mothers, blinking, ear and tail flicks) carries
   over from v1 unchanged.

   Convention: yaw 0 faces +Z; forward is (sin yaw, 0, cos yaw).
   ============================================================ */

/* Proportions are taken from the real animals. Whitetail reference
   (a mature buck): shoulder height ~0.95m, torso ~1.15m, chest girth depth
   ~0.47m but only ~0.32m WIDE — deer are slab-sided, not barrels — a long
   ~0.55m neck carried high, a ~0.29m wedge head, and thin legs whose cannon
   bones are barely 5cm across. bodyW/bodyD are half-width/half-depth. */
const ANIMAL_SPECIES = {
  deer: {
    shoulder: 0.95, bodyLen: 1.15, bodyW: 0.16, bodyD: 0.235,
    neckLen: 0.55, headLen: 0.29, earScale: 1.0, tailLen: 0.25, legW: 0.024,
    furLen: 0.02, shells: 6,
    coat: { male: 0x8a6a42, female: 0x97754c, fawn: 0xa8815a },
    texture: { male: 'fur', female: 'fur', fawn: 'furFawn' },
    walkSpeed: 0.9, runSpeed: 6.2, gait: 'quad',
    alertR: 6.5, safeR: 13, grazes: true,
  },
  rabbit: {
    shoulder: 0.2, bodyLen: 0.38, bodyW: 0.085, bodyD: 0.115,
    neckLen: 0.07, headLen: 0.13, earScale: 2.6, tailLen: 0.05, legW: 0.013,
    furLen: 0.014, shells: 5,
    coat: { male: 0x9c8768, female: 0xa8946f, fawn: 0xb4a17e },
    texture: { male: 'fur', female: 'fur', fawn: 'fur' },
    walkSpeed: 0.55, runSpeed: 4.6, gait: 'hop',
    alertR: 4.5, safeR: 9, grazes: true,
  },
};

const ANIMAL_SIZES = { small: 0.8, medium: 1.0, large: 1.18 };
const ANTLER_POINTS = { small: 2, medium: 4, large: 6 };

/* ---------------- skeleton ---------------- */

function makeQuadSkeleton(sp, k) {
  const W = sp.bodyW * k, D = sp.bodyD * k, BL = sp.bodyLen * k, NL = sp.neckLen * k, HL = sp.headLen * k;
  // The shoulder measurement is to the TOP of the withers; the spine line
  // sits half a chest below it, and the legs own everything under the belly.
  const spineY = sp.shoulder * k - D * 0.45;
  const legTop = spineY - D * 0.35;
  const upper = legTop * 0.52, lower = legTop * 0.46;
  const B = [];
  const bone = (name, parent, pos) => { B.push([name, parent, pos]); return B.length - 1; };

  const hips = bone('hips', -1, [0, spineY, -BL * 0.34]);
  const spine = bone('spine', hips, [0, 0.01 * k, BL * 0.3]);
  const chest = bone('chest', spine, [0, 0.01 * k, BL * 0.3]);
  // A deer's neck leaves the chest at ~55 degrees and is over half a metre
  // long — most of what makes the silhouette read "deer" lives here.
  const neck1 = bone('neck1', chest, [0, D * 0.55, BL * 0.1]);
  const neck2 = bone('neck2', neck1, [0, NL * 0.44, NL * 0.28]);
  const head = bone('head', neck2, [0, NL * 0.44, NL * 0.26]);
  bone('muzzle', head, [0, -HL * 0.08, HL * 0.65]);
  bone('earL', head, [HL * 0.3, HL * 0.42, -HL * 0.14]);
  bone('earR', head, [-HL * 0.3, HL * 0.42, -HL * 0.14]);
  const tail1 = bone('tail1', hips, [0, D * 0.42, -BL * 0.2]);
  bone('tail2', tail1, [0, -0.02 * k, -sp.tailLen * k]);
  for (const side of [1, -1]) {
    const s = side > 0 ? 'L' : 'R';
    const fu = bone('fUp' + s, chest, [side * W * 0.6, -D * 0.35, BL * 0.05]);
    const fl = bone('fLo' + s, fu, [0, -upper, 0]);
    bone('fFt' + s, fl, [0, -lower, 0.015 * k]);
    const ru = bone('rUp' + s, hips, [side * W * 0.62, -D * 0.3, -BL * 0.03]);
    const rl = bone('rLo' + s, ru, [0, -upper, -0.02 * k]);
    bone('rFt' + s, rl, [0, -lower, 0.02 * k]);
  }
  return new Skeleton(B.map(([n, p, pos]) => new Bone(n, p, pos, null)));
}

/* ---------------- sculpt ---------------- */

/* One connected body built around the bind pose: torso, neck and head as
   lofted tubes that overlap into each other (overlap is what hides seams),
   legs and ears as tapered lofts, tail as a limb. */
function makeQuadGeometry(skeleton, sp, k, opts = {}) {
  const g = new Geometry();
  const W = sp.bodyW * k, D = sp.bodyD * k, BL = sp.bodyLen * k, NL = sp.neckLen * k, HL = sp.headLen * k;
  const P = (name) => { const v = new Vec3(); skeleton.bones[skeleton.index(name)].bindMatrix.getTranslation(v); return v; };

  const hips = P('hips'), chest = P('chest'), neck1 = P('neck1'), neck2 = P('neck2');
  const headP = P('head'), muzzle = P('muzzle'), tail1 = P('tail1'), tail2 = P('tail2');
  const spineY = hips.y;

  // Torso, matched to the real animal: slab-sided (much deeper than wide),
  // deepest at the chest girth, tucked at the waist, rounded at the rump,
  // with a level topline.
  const ring = (z, y, w, d, e, uv) => ({ p: new Vec3(0, y, z), w, d, e: e || 2.2, uv });
  loftRings(g, [
    ring(hips.z - BL * 0.22, spineY - D * 0.02, W * 0.5, D * 0.62, 2.0, 0),
    ring(hips.z - BL * 0.06, spineY, W * 0.95, D * 0.95, 2.2, 0.07),
    ring(hips.z + BL * 0.22, spineY - D * 0.02, W * 0.88, D * 0.8, 2.2, 0.17),   // the waist tuck
    ring(chest.z - BL * 0.06, spineY - D * 0.05, W * 0.95, D * 1.05, 2.3, 0.28), // chest girth, deepest
    ring(chest.z + BL * 0.1, spineY + D * 0.02, W * 0.8, D * 0.95, 2.1, 0.36),
    ring(chest.z + BL * 0.2, spineY + D * 0.05, W * 0.55, D * 0.7, 2.0, 0.4),
  ], 16, true, true);

  // Neck: long and slim, oval in cross-section (deeper than wide), rooted
  // wide at the chest and tapering hard toward the skull.
  const nr = (t, w, d) => {
    const p = new Vec3().copy(neck1).lerp(headP, t);
    return { p, w, d, e: 2.0, uv: 0.42 + t * 0.14 };
  };
  loftRings(g, [
    { p: new Vec3(neck1.x, neck1.y - D * 0.5, neck1.z - D * 0.35), w: W * 0.72, d: D * 0.8, e: 2.1, uv: 0.4 },
    nr(0.22, W * 0.5, D * 0.55), nr(0.55, W * 0.38, D * 0.42), nr(1.0, HL * 0.3, HL * 0.36),
  ], 14, true, true);

  // Head: skull -> brow -> muzzle -> nose.
  const headRing = (t, w, d, e) => {
    const p = new Vec3().copy(headP).lerp(muzzle, t);
    return { p, w, d, e: e || 2.0, uv: 0.58 + t * 0.1 };
  };
  loftRings(g, [
    headRing(-0.22, HL * 0.3, HL * 0.34),
    headRing(0.05, HL * 0.36, HL * 0.42),      // skull, widest at the brow
    headRing(0.4, HL * 0.26, HL * 0.3),
    headRing(0.75, HL * 0.15, HL * 0.17),      // the wedge toward the muzzle
    headRing(1.02, HL * 0.09, HL * 0.1),       // nose
  ], 14, true, true);

  // Legs: a muscled thigh buried in the body collapsing fast to the thin
  // cannon bone that gives deer legs their signature delicacy, with a small
  // flare at the fetlock and a hoof.
  const LW = sp.legW * k;   // cannon-bone radius — genuinely thin
  for (const s of ['L', 'R']) {
    for (const f of ['f', 'r']) {
      const up = P(f + 'Up' + s), lo = P(f + 'Lo' + s), ft = P(f + 'Ft' + s);
      const hoof = new Vec3(ft.x, 0.004, ft.z + 0.02 * k);
      const thighW = f === 'r' ? LW * 3.4 : LW * 2.6;   // hindquarters are heavier
      loftRings(g, [
        { p: new Vec3(up.x, up.y + D * 0.45, up.z), w: thighW, d: thighW * 1.5, e: 2.1, uv: 0.7 },
        { p: up.clone().lerp(lo, 0.5), w: LW * 1.5, d: LW * 1.9, e: 2.0, uv: 0.78 },
        { p: lo, w: LW * 1.05, d: LW * 1.2, e: 2.0, uv: 0.84 },
        { p: lo.clone().lerp(ft, 0.55), w: LW * 0.85, d: LW * 0.95, e: 2.0, uv: 0.9 },
        { p: ft, w: LW * 1.0, d: LW * 1.1, e: 2.0, uv: 0.95 },
        { p: hoof, w: LW * 1.15, d: LW * 1.25, e: 1.6, uv: 1.0 },
      ], 10, true, true);
    }
  }

  // Ears: flattened petals off the skull.
  const earL = P('earL'), earR = P('earR');
  const earLen = HL * 0.55 * sp.earScale;
  for (const [e, s] of [[earL, 1], [earR, -1]]) {
    const tip = new Vec3(e.x + s * earLen * 0.35, e.y + earLen, e.z - earLen * 0.15);
    loftRings(g, [
      { p: e, w: HL * 0.16, d: HL * 0.07, e: 1.8, uv: 0.6 },
      { p: new Vec3().copy(e).lerp(tip, 0.5), w: HL * 0.2, d: HL * 0.06, e: 1.8, uv: 0.62 },
      { p: tip, w: HL * 0.05, d: HL * 0.03, e: 1.8, uv: 0.64 },
    ], 8, true, true);
  }

  // Tail.
  appendLimb(g, tail1, new Vec3(tail2.x, tail2.y, tail2.z - 0.02), D * 0.2, D * 0.07, 8);

  smoothNormals(g);
  const geo = g.finalize();

  /* Auto-skin: score every bone segment by inverse-quartic distance and
     keep the strongest four — the same scheme the human uses. */
  const SEGS = [
    ['hips', 'spine'], ['spine', 'chest'], ['chest', 'neck1'], ['neck1', 'neck2'],
    ['neck2', 'head'], ['head', 'muzzle'], ['hips', 'tail1'], ['tail1', 'tail2'],
    ['head', 'earL'], ['head', 'earR'],
  ];
  for (const s of ['L', 'R']) for (const f of ['f', 'r']) {
    SEGS.push([f + 'Up' + s, f + 'Lo' + s], [f + 'Lo' + s, f + 'Ft' + s]);
  }
  const segments = [];
  const pa = new Vec3(), pb = new Vec3();
  for (const [a, b] of SEGS) {
    const ai = skeleton.index(a), bi = skeleton.index(b);
    if (ai < 0 || bi < 0) continue;
    skeleton.bones[ai].bindMatrix.getTranslation(pa);
    skeleton.bones[bi].bindMatrix.getTranslation(pb);
    segments.push({ a: pa.clone(), b: pb.clone(), boneA: ai, boneB: bi });
  }
  const n = geo.positions.length / 3;
  const joints = new Float32Array(n * 4);
  const weights = new Float32Array(n * 4);
  const p = new Vec3(), closest = new Vec3();
  for (let i = 0; i < n; i++) {
    p.set(geo.positions[i * 3], geo.positions[i * 3 + 1], geo.positions[i * 3 + 2]);
    const merged = new Map();
    for (const seg of segments) {
      closestPointOnSegment(p, seg.a, seg.b, closest);
      const d2 = Math.max(closest.distanceToSq(p), 1e-5);
      const t = clamp(seg.a.distanceTo(closest) / Math.max(seg.a.distanceTo(seg.b), 1e-5), 0, 1);
      const w = 1 / (d2 * d2);
      merged.set(seg.boneA, (merged.get(seg.boneA) || 0) + w * (1 - t));
      merged.set(seg.boneB, (merged.get(seg.boneB) || 0) + w * t);
    }
    const top = Array.from(merged.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let sum = 0; for (const [, w] of top) sum += w;
    if (sum < 1e-9) { joints[i * 4] = 0; weights[i * 4] = 1; continue; }
    for (let q = 0; q < 4; q++) {
      joints[i * 4 + q] = top[q] ? top[q][0] : 0;
      weights[i * 4 + q] = top[q] ? top[q][1] / sum : 0;
    }
  }
  geo.joints = joints;
  geo.weights = weights;
  return geo;
}

/* ---------------- antlers (bone-parented attachment) ---------------- */

function antlerMesh(engine, points, side) {
  return engine._mesh(`antler:${points}:${side}`, () => {
    const g = new Geometry();
    const sx = side;
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

/* ---------------- the animal ---------------- */

let _animalId = 0;

class Animal {
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
  }

  _groundAt(x, z) { return this.groundY ? this.groundY(x, z) : this.baseY; }

  _build() {
    const e = this.engine, sp = this.spec, k = this.k;
    // One skeleton per animal (it holds this animal's pose), but the sculpted
    // skinned mesh is cached per species+size, so a herd shares geometry.
    this.skeleton = makeQuadSkeleton(sp, k);
    const meshKey = `quad:${this.species}:${k.toFixed(2)}`;
    this.mesh = e._mesh(meshKey, () => makeQuadGeometry(this.skeleton, sp, k));

    const coat = this.isBaby ? sp.coat.fawn : (sp.coat[this.sex] || sp.coat.female);
    const tex = (sp.texture && sp.texture[this.isBaby ? 'fawn' : this.sex]) || 'fur';
    this.actor = new Actor(e, {
      name: `animal${this.id}`,
      mesh: this.mesh,
      material: e.material({ texture: tex, color: this.mule ? 0x7d7261 : coat, roughness: 0.95, uvScale: 1 }),
      skeleton: this.skeleton,
      animator: { update: (dt) => this._drive(dt), add() {}, play() {} },
      at: [this.x, this.baseY, this.z],
      boundRadius: 2.2 * k,
    });
    // Shell fur: extra inflated, strand-clipped passes give the coat real
    // depth — hair tips physically break the silhouette.
    this.actor.furShells = sp.shells || 5;
    this.actor.furLength = (sp.furLen || 0.02) * k;
    e.actors.push(this.actor);
    this.parts = [this.actor];

    // Eyes and antlers ride the head bone.
    const headIdx = this.skeleton.index('head');
    const HL = sp.headLen * k;
    const eyeM = e.material({ color: 0x150f09, roughness: 0.25 });
    const sphereMesh = e._mesh('sphere', () => Shapes.sphere(0.5, 20, 28));
    this.eyes = [];
    for (const s of [1, -1]) {
      const eye = new Actor(e, {
        mesh: sphereMesh, material: eyeM,
        parent: this.actor, parentBone: headIdx,
        offset: [s * HL * 0.36, HL * 0.16, HL * 0.34],
      });
      eye.scale.setScalar(HL * 0.16);
      e.actors.push(eye); this.parts.push(eye); this.eyes.push(eye);
    }
    this.antlers = [];
    if (this.species === 'deer' && this.sex === 'male' && !this.isBaby) {
      const boneM = e.material({ color: 0xcfc4a8, roughness: 0.7 });
      for (const s of [1, -1]) {
        const a = new Actor(e, {
          mesh: antlerMesh(e, ANTLER_POINTS[this.sizeName], s), material: boneM,
          parent: this.actor, parentBone: headIdx,
          offset: [s * HL * 0.2, HL * 0.34, -HL * 0.12],
        });
        a.scale.setScalar(k);
        e.actors.push(a); this.parts.push(a); this.antlers.push(a);
      }
    }
  }

  /* ---------------- the brain (unchanged from v1) ---------------- */

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

    const stride = (sp.gait === 'hop' ? 0.7 : 1.4) * k;
    if (this.speed > 0.03) this.phase = (this.phase + (this.speed / stride) * dt) % 1;

    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.12; this.blinkT = this.rng.range(1.5, 5); }
    this.blink = Math.max(0, this.blink - dt);
    this.earT -= dt;
    if (this.earT <= 0) { this.earFlick = 0.3; this.earT = this.rng.range(2, 6); }
    this.earFlick = Math.max(0, this.earFlick - dt);
    this.tailT -= dt;
    if (this.tailT <= 0) { this.tailFlick = 0.5; this.tailT = this.rng.range(2, 7); }
    this.tailFlick = Math.max(0, this.tailFlick - dt);
  }

  /* ---------------- bone driver (runs as the actor's animator) ---------------- */

  _drive() {
    const sp = this.spec, k = this.k, sk = this.skeleton;
    const running = this.speed > sp.walkSpeed * k * 2.2;
    const ph = this.phase * TAU;

    const hop = sp.gait === 'hop'
      ? (this.speed > 0.1 ? Math.abs(Math.sin(ph)) * 0.14 * k * (1 + this.speed * 0.5) : 0)
      : (running ? Math.abs(Math.sin(ph)) * 0.28 * k : 0);
    this.actor.setPosition([this.x, this._groundAt(this.x, this.z) + hop, this.z]);
    this.actor.setRotation(new Quat().setEuler(0, this.yaw, 0));

    const bone = (name) => sk.bones[sk.index(name)];

    // Torso: a touch of pitch with the bound.
    bone('spine').localRotation.setEuler(running ? Math.sin(ph) * 0.08 : 0, 0, 0);
    bone('chest').localRotation.setEuler(running ? Math.sin(ph) * 0.06 : 0, 0, 0);

    // Neck chain: bind pose is the natural half-raised carry; positive pitch
    // lowers the nose into the grass, negative lifts to full alarm.
    const down = this.headDown;
    const nod = this.speed > 0.05 && !running ? Math.sin(ph * 2) * 0.05 : 0;
    bone('neck1').localRotation.setEuler(lerp(-0.25, 0.9, down) + nod, 0, 0);
    bone('neck2').localRotation.setEuler(lerp(-0.15, 0.55, down), 0, 0);
    bone('head').localRotation.setEuler(lerp(0.1, -0.5, down), 0, 0);

    // Legs: walk is a lateral sequence, running is bounding pairs. The lower
    // leg folds as the upper swings back, which is what makes a stride read
    // as a stride instead of a pendulum.
    const phases = sp.gait === 'hop'
      ? [0.05, 0, 0.5, 0.55]
      : (running ? [0, 0.12, 0.55, 0.65] : [0, 0.5, 0.75, 0.25]);
    const amp = this.speed < 0.05 ? 0 : (running ? 0.8 : 0.45);
    const legNames = [['fUpL', 'fLoL'], ['fUpR', 'fLoR'], ['rUpL', 'rLoL'], ['rUpR', 'rLoR']];
    for (let i = 0; i < 4; i++) {
      const swing = Math.sin((this.phase + phases[i]) * TAU) * amp;
      const fold = Math.max(0, Math.sin((this.phase + phases[i]) * TAU + 1.9)) * amp * (running ? 1.2 : 0.8);
      bone(legNames[i][0]).localRotation.setEuler(swing, 0, 0);
      bone(legNames[i][1]).localRotation.setEuler(i < 2 ? fold * 0.7 : -fold * 0.7, 0, 0);
    }

    // Ears and tail.
    const flick = this.earFlick > 0 ? Math.sin(this.earFlick * 24) * 0.6 : 0;
    bone('earL').localRotation.setEuler(0, 0, 0.25 + flick);
    bone('earR').localRotation.setEuler(0, 0, -0.25 - flick * 0.4);
    const flag = this.state === 'flee' ? 1 : (this.tailFlick > 0 ? Math.abs(Math.sin(this.tailFlick * 14)) * 0.5 : 0);
    bone('tail1').localRotation.setEuler(-flag * 1.3, this.tailFlick > 0 ? Math.sin(this.tailFlick * 18) * 0.3 : 0, 0);

    sk.update();

    // Blink: the lids are a vertical squash of the eye.
    const lid = this.blink > 0 ? 0.15 : 1;
    const HL = sp.headLen * k;
    for (const eye of this.eyes) eye.scale.set(HL * 0.16, HL * 0.16 * lid, HL * 0.16);
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

Engine.prototype.testPlate = function (opts = {}) {
  const miles = clamp(opts.miles || 1, 0.02, 10);
  const side = Math.sqrt(miles) * 1609.34;
  const g = this.ground(Object.assign({ size: side }, opts));
  g.userData = { testPlate: true, miles, side };
  return g;
};
