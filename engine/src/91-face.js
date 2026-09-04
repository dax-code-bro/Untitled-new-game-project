/* ============================================================
   FACE — blendshape expressions, viseme lipsync, gaze and blinks.

   Heads are a few hundred vertices, so morph targets are applied
   on the CPU and the position/normal buffers are re-uploaded each
   frame. That is far simpler than GPU morphing and, at this vertex
   count, indistinguishable in cost.
   ============================================================ */

/* A head is far narrower across than it is deep: about 0.67 of its height
   in breadth against 0.85 in length. The sculpt in makeHeadGeometry is laid
   out in a wider space — keeping the feature coordinates round numbers is
   worth a lot when tuning them — and squeezed to the real ratio in one pass
   at the end. Anything that indexes into the *finished* head by x has to
   carry the same factor; see dist2 below. */
const HEAD_SQUEEZE_X = 0.82;

/* Region weights let a blendshape affect only the part of the face it
   should. Each returns 0..1 for a vertex in head-local space, where the
   head is roughly a unit-ish blob centred on the origin. */
const FaceRegions = {
  brow: (p) => Math.max(0, 1 - dist2(p, 0, 0.115, 0.215) / 0.026) * smoothstep(-0.02, 0.10, p.z),
  eyeL: (p) => Math.max(0, 1 - dist2(p, 0.096, 0.030, 0.212) / 0.009),
  eyeR: (p) => Math.max(0, 1 - dist2(p, -0.096, 0.030, 0.212) / 0.009),
  upperLid: (p) => Math.max(0, 1 - dist2(p, 0.096, 0.064, 0.210) / 0.008)
                 + Math.max(0, 1 - dist2(p, -0.096, 0.064, 0.210) / 0.008),
  cheek: (p) => (Math.max(0, 1 - dist2(p, 0.150, -0.020, 0.150) / 0.020)
               + Math.max(0, 1 - dist2(p, -0.150, -0.020, 0.150) / 0.020)),
  mouth: (p) => Math.max(0, 1 - dist2(p, 0, -0.190, 0.235) / 0.014),
  mouthCornerL: (p) => Math.max(0, 1 - dist2(p, 0.076, -0.188, 0.212) / 0.008),
  mouthCornerR: (p) => Math.max(0, 1 - dist2(p, -0.076, -0.188, 0.212) / 0.008),
  upperLip: (p) => Math.max(0, 1 - dist2(p, 0, -0.170, 0.245) / 0.006),
  lowerLip: (p) => Math.max(0, 1 - dist2(p, 0, -0.212, 0.240) / 0.006),
  jaw: (p) => smoothstep(-0.08, -0.32, p.y) * smoothstep(-0.14, 0.12, p.z),
  nose: (p) => Math.max(0, 1 - dist2(p, 0, -0.075, 0.270) / 0.008),
};

/* Squared distance from a vertex to a region centre. The centre's x is
   given in pre-squeeze sculpt space — the same numbers makeHeadGeometry
   uses — and scaled here, so region constants and sculpt constants stay
   directly comparable. */
function dist2(p, x, y, z) {
  const dx = p.x - x * HEAD_SQUEEZE_X, dy = p.y - y, dz = p.z - z;
  return dx * dx + dy * dy + dz * dz;
}

/* A blendshape is a displacement field: for each vertex, a direction scaled
   by a region weight. Generating them procedurally means any head mesh gets
   a full expression set without authored morph targets. */
function buildBlendshape(positions, fn) {
  const n = positions.length / 3;
  const deltas = new Float32Array(n * 3);
  const p = new Vec3();
  const d = new Vec3();
  for (let i = 0; i < n; i++) {
    p.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    d.set(0, 0, 0);
    fn(p, d);
    deltas[i * 3] = d.x;
    deltas[i * 3 + 1] = d.y;
    deltas[i * 3 + 2] = d.z;
  }
  return deltas;
}

const EXPRESSION_BUILDERS = {
  smile: (p, d) => {
    const cl = FaceRegions.mouthCornerL(p), cr = FaceRegions.mouthCornerR(p);
    d.x += (cl - cr) * 0.035;
    d.y += (cl + cr) * 0.045;
    d.y += FaceRegions.cheek(p) * 0.022;
    d.z += FaceRegions.cheek(p) * 0.010;
    // Real smiles narrow the eyes — this is the difference between a warm
    // expression and an unsettling one.
    d.y += FaceRegions.upperLid(p) * -0.010;
  },
  frown: (p, d) => {
    const cl = FaceRegions.mouthCornerL(p), cr = FaceRegions.mouthCornerR(p);
    d.y -= (cl + cr) * 0.040;
    d.y += FaceRegions.brow(p) * -0.016;
    d.x += FaceRegions.brow(p) * (p.x > 0 ? -0.010 : 0.010);
  },
  angry: (p, d) => {
    const b = FaceRegions.brow(p);
    d.y -= b * 0.030;
    // Inner brow pulls down and together.
    d.x += b * (p.x > 0 ? -0.020 : 0.020);
    d.y -= FaceRegions.mouthCornerL(p) * 0.020;
    d.y -= FaceRegions.mouthCornerR(p) * 0.020;
    d.z += FaceRegions.nose(p) * 0.012;
  },
  surprised: (p, d) => {
    const b = FaceRegions.brow(p);
    d.y += b * 0.036;
    d.y += FaceRegions.upperLid(p) * 0.014;
    d.y -= FaceRegions.jaw(p) * 0.055;
    d.z += FaceRegions.mouth(p) * 0.012;
  },
  sad: (p, d) => {
    const b = FaceRegions.brow(p);
    // Inner brow up, outer down — the classic sad brow.
    d.y += b * (Math.abs(p.x) < 0.06 ? 0.024 : -0.014);
    d.y -= FaceRegions.mouthCornerL(p) * 0.028;
    d.y -= FaceRegions.mouthCornerR(p) * 0.028;
    d.y -= FaceRegions.upperLid(p) * 0.008;
  },
  blink: (p, d) => {
    d.y -= FaceRegions.upperLid(p) * 0.030;
  },
  jawOpen: (p, d) => {
    d.y -= FaceRegions.jaw(p) * 0.075;
    d.z -= FaceRegions.jaw(p) * 0.010;
  },
  // Visemes — mouth shapes for speech.
  vAA: (p, d) => { d.y -= FaceRegions.jaw(p) * 0.055; d.y += FaceRegions.upperLip(p) * 0.010; },
  vEE: (p, d) => {
    d.x += FaceRegions.mouthCornerL(p) * 0.032;
    d.x -= FaceRegions.mouthCornerR(p) * 0.032;
    d.y -= FaceRegions.jaw(p) * 0.014;
  },
  vOH: (p, d) => {
    d.x -= FaceRegions.mouthCornerL(p) * 0.028;
    d.x += FaceRegions.mouthCornerR(p) * 0.028;
    d.z += FaceRegions.mouth(p) * 0.024;
    d.y -= FaceRegions.jaw(p) * 0.034;
  },
  vFV: (p, d) => {
    d.y += FaceRegions.lowerLip(p) * 0.016;
    d.z -= FaceRegions.lowerLip(p) * 0.008;
  },
  vMB: (p, d) => {
    d.y += FaceRegions.lowerLip(p) * 0.010;
    d.y -= FaceRegions.upperLip(p) * 0.008;
    d.z += FaceRegions.mouth(p) * 0.004;
  },
  vL: (p, d) => { d.y -= FaceRegions.jaw(p) * 0.024; d.z += FaceRegions.upperLip(p) * 0.010; },
};

/* Which viseme each letter maps to. Crude compared to a real phoneme
   analyser, but at conversational speed it reads correctly. */
const LETTER_VISEME = {
  a: 'vAA', á: 'vAA', e: 'vEE', i: 'vEE', y: 'vEE',
  o: 'vOH', u: 'vOH', w: 'vOH',
  f: 'vFV', v: 'vFV',
  m: 'vMB', b: 'vMB', p: 'vMB',
  l: 'vL', n: 'vL', d: 'vL', t: 'vL',
};

class Face {
  constructor(gl, geometry, opts = {}) {
    this.gl = gl;
    this.geometry = geometry;
    this.basePositions = new Float32Array(geometry.positions);
    this.baseNormals = new Float32Array(geometry.normals);
    this.workPositions = new Float32Array(geometry.positions);
    this.workNormals = new Float32Array(geometry.normals);
    this.vertexCount = this.basePositions.length / 3;

    this.shapes = new Map();
    this.weights = new Map();
    this.targetWeights = new Map();
    for (const name in EXPRESSION_BUILDERS) {
      this.shapes.set(name, buildBlendshape(this.basePositions, EXPRESSION_BUILDERS[name]));
      this.weights.set(name, 0);
      this.targetWeights.set(name, 0);
    }

    this.blinkTimer = opts.blinkInterval || 3.2;
    this.blinkPhase = -1;      // -1 = not blinking
    this.rng = new Rng(opts.seed || 77);
    this.speaking = null;
    this.speakTime = 0;
    this.gaze = new Vec3(0, 0, 1);
    this.gazeTarget = new Vec3(0, 0, 1);
    this.emotion = 'neutral';
    this.emotionStrength = 0;
    this.dirty = true;
    this.mesh = null;
  }

  /* Set the dominant emotion. Others decay to zero, so expressions never
     pile up into an unreadable mush. */
  setEmotion(name, strength = 1) {
    this.emotion = name;
    this.emotionStrength = clamp(strength, 0, 1);
    for (const key of ['smile', 'frown', 'angry', 'surprised', 'sad']) {
      this.targetWeights.set(key, key === name ? this.emotionStrength : 0);
    }
    // Friendly aliases.
    if (name === 'happy' || name === 'joy') this.targetWeights.set('smile', this.emotionStrength);
    if (name === 'neutral') for (const key of ['smile', 'frown', 'angry', 'surprised', 'sad']) this.targetWeights.set(key, 0);
    return this;
  }

  /* Drive the mouth from text. Duration defaults to a natural reading pace. */
  say(text, opts = {}) {
    const chars = String(text).toLowerCase().replace(/[^a-z\s]/g, '');
    const rate = opts.rate || 13;       // letters per second
    this.speaking = { chars, rate, duration: chars.length / rate };
    this.speakTime = 0;
    this.onSpeakEnd = opts.onEnd || null;
    return this;
  }

  stopSpeaking() {
    this.speaking = null;
    for (const key of Object.keys(LETTER_VISEME)) {
      const v = LETTER_VISEME[key];
      if (this.targetWeights.has(v)) this.targetWeights.set(v, 0);
    }
    this.targetWeights.set('jawOpen', 0);
    return this;
  }

  lookAt(worldDir) { this.gazeTarget.copy(Vec3.from(worldDir)).normalize(); return this; }

  update(dt) {
    /* --- blinking --- */
    if (this.blinkPhase >= 0) {
      this.blinkPhase += dt;
      const T = 0.13;
      // Down fast, up slower — a symmetric blink looks mechanical.
      const w = this.blinkPhase < T * 0.35
        ? this.blinkPhase / (T * 0.35)
        : Math.max(0, 1 - (this.blinkPhase - T * 0.35) / (T * 0.65));
      this.targetWeights.set('blink', w);
      if (this.blinkPhase > T) { this.blinkPhase = -1; this.targetWeights.set('blink', 0); }
    } else {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkPhase = 0;
        this.blinkTimer = this.rng.range(2.2, 6.0);
      }
    }

    /* --- lipsync --- */
    if (this.speaking) {
      this.speakTime += dt;
      const idx = Math.floor(this.speakTime * this.speaking.rate);
      for (const v of ['vAA', 'vEE', 'vOH', 'vFV', 'vMB', 'vL']) this.targetWeights.set(v, 0);
      if (idx >= this.speaking.chars.length) {
        this.stopSpeaking();
        if (this.onSpeakEnd) { const cb = this.onSpeakEnd; this.onSpeakEnd = null; cb(); }
      } else {
        const ch = this.speaking.chars[idx];
        const viseme = LETTER_VISEME[ch];
        if (viseme) {
          this.targetWeights.set(viseme, 0.85);
          // Jaw follows the vowels, which carries most of the visible motion.
          this.targetWeights.set('jawOpen', viseme === 'vAA' ? 0.7 : viseme === 'vOH' ? 0.45 : 0.2);
        } else {
          this.targetWeights.set('jawOpen', 0.08);
        }
      }
    }

    /* --- smooth every weight toward its target --- */
    // Visemes must move faster than emotions or speech turns to mumbling.
    let changed = false;
    for (const [name, target] of this.targetWeights) {
      const cur = this.weights.get(name);
      const speed = name.startsWith('v') || name === 'blink' || name === 'jawOpen' ? 26 : 7;
      const next = cur + (target - cur) * Math.min(1, speed * dt);
      if (Math.abs(next - cur) > 1e-4) changed = true;
      this.weights.set(name, next);
    }
    this.gaze.lerp(this.gazeTarget, Math.min(1, 8 * dt));

    if (changed) this.dirty = true;
    if (this.dirty) { this._applyShapes(); this.dirty = false; }
  }

  _applyShapes() {
    const P = this.workPositions, B = this.basePositions;
    P.set(B);
    for (const [name, w] of this.weights) {
      if (w < 0.002) continue;
      const delta = this.shapes.get(name);
      for (let i = 0; i < P.length; i++) P[i] += delta[i] * w;
    }
    this._recomputeNormals();
    if (this.mesh) this._upload();
  }

  /* Recompute smooth normals from the deformed positions. Skipping this
     leaves the lighting flat and the whole expression stops reading. */
  _recomputeNormals() {
    const P = this.workPositions, N = this.workNormals;
    const I = this.geometry.indices;
    N.fill(0);
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      N[a] += nx; N[a + 1] += ny; N[a + 2] += nz;
      N[b] += nx; N[b + 1] += ny; N[b + 2] += nz;
      N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
    }
    for (let i = 0; i < N.length; i += 3) {
      const l = Math.sqrt(N[i] * N[i] + N[i + 1] * N[i + 1] + N[i + 2] * N[i + 2]);
      if (l > 1e-8) { N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
      else { N[i] = 0; N[i + 1] = 1; N[i + 2] = 0; }
    }
    weldNormals(N, this.geometry.weldGroups);
  }

  attach(mesh) {
    this.mesh = mesh;
    // Positions and normals become dynamic; the mesh was built static.
    const gl = this.gl;
    gl.bindVertexArray(mesh.vao);
    this.posBuffer = mesh.buffers[0];
    this.nrmBuffer = mesh.buffers[1];
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.workPositions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nrmBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.workNormals, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    return this;
  }

  _upload() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.workPositions);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nrmBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.workNormals);
  }
}

/* An anatomical head.

   Built by displacing an ellipsoid with a set of named features, each a
   soft ellipsoidal falloff pushing the surface in a direction. Ordering
   matters: the skull is shaped first, then the face is cut into it, so a
   later feature never fights an earlier one for the same vertices.

   Proportions are real. A head is markedly taller than it is wide and
   deeper than it is wide — getting that one ratio wrong is most of what
   makes a procedural head read as an egg. */

/* Soft ellipsoidal falloff, 1 at the centre and 0 at the boundary. */
function featureFalloff(p, cx, cy, cz, rx, ry, rz, power) {
  const dx = (p.x - cx) / rx, dy = (p.y - cy) / ry, dz = (p.z - cz) / rz;
  const d = dx * dx + dy * dy + dz * dz;
  if (d >= 1) return 0;
  // Smoothstep rather than a linear cone: a cone's falloff is widest at its
  // base, which spreads every feature into the surrounding face and is most
  // of why sculpted-by-displacement faces look soft.
  const f = 1 - Math.sqrt(d);
  const sm = f * f * (3 - 2 * f);
  return power && power !== 1 ? Math.pow(sm, power) : sm;
}

function makeHeadGeometry(opts = {}) {
  const rings = opts.rings || 56;
  const sectors = opts.sectors || 72;
  const g = new Geometry();
  const noise = new Noise(opts.seed || 5);

  /* Archetype. One sculptor, three sets of numbers — a wider jaw and heavier
     brow, a finer jaw and softer brow, or a broad skull with a full lower
     face. Reusing the sculpt rather than authoring three heads is what keeps
     a crowd of individuals affordable. */
  const T = opts.type || 'male';
  const A = T === 'female'
    ? { rx: 0.238, ry: 0.330, rz: 0.268, brow: 0.026, jaw: 0.165, chin: 0.050, cheek: 0.024 }
    : T === 'heavy'
      ? { rx: 0.268, ry: 0.322, rz: 0.286, brow: 0.040, jaw: 0.085, chin: 0.048, cheek: 0.030 }
      : { rx: 0.246, ry: 0.336, rz: 0.276, brow: 0.040, jaw: 0.135, chin: 0.062, cheek: 0.019 };
  // A per-head nudge so no two of the same archetype are identical.
  const vary = ((opts.seed || 5) % 7) / 7 - 0.5;
  // Base skull. Half-extents: narrow across, tall, deep.
  const RX = A.rx * (1 + vary * 0.05), RY = A.ry * (1 - vary * 0.04), RZ = A.rz * (1 + vary * 0.03);
  const mirrored = (fn) => (p) => fn(p, Math.abs(p.x), p.x < 0 ? -1 : 1);

  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * PI;
    const sp = Math.sin(phi), cp = Math.cos(phi);
    for (let s = 0; s <= sectors; s++) {
      const th = (s / sectors) * TAU;
      const nx = sp * Math.cos(th), ny = cp, nz = sp * Math.sin(th);

      let x = nx * RX, y = ny * RY, z = nz * RZ;

      /* --- skull mass --- */

      // The cranium's horizontal cross-section is a rounded box, not an
      // ellipse: there is a real corner where the flat temporal plane turns
      // into the back of the head, and another at the brow. Squaring the
      // section up is what puts planes on a skull, and it is the absence of
      // planes — far more than any proportion — that makes a smooth
      // ellipsoid read as a ball with a face drawn on it. Continuous at
      // both ends, since exponent 2 is exactly the ellipse it starts from.
      if (sp > 1e-4) {
        const cx0 = nx / sp, cz0 = nz / sp;
        // Rear half only. The face is genuinely ellipsoidal across the brow
        // and cheeks, and squaring it up there both widens the head and
        // shifts the eye region out from under its own socket.
        const boxy = smoothstep(-0.12, 0.10, y) * (1 - smoothstep(0.22, 0.33, y))
                   * smoothstep(0.45, 0.0, cz0);
        const k = 2 / (2 + boxy * 0.75);
        x += (Math.sign(cx0) * Math.pow(Math.abs(cx0), k) - cx0) * sp * RX;
        z += (Math.sign(cz0) * Math.pow(Math.abs(cz0), k) - cz0) * sp * RZ;
      }

      // A cranium is not an ellipsoid, and the ways it departs from one are
      // exactly what the eye uses to tell a head from an egg.

      // The face plane is flatter; the back of the head is fuller and squarer.
      // Blended, not branched: `if (z < 0)` puts a hard step in the surface
      // exactly at z = 0, which shows up as a crease running down the side
      // of the head that no amount of normal-smoothing will remove.
      const back = smoothstep(0.06, -0.12, z);
      z *= 1 + back * 0.035;
      x *= 1 + back * 0.030;

      // Breadth peaks at the parietal eminences — above and a little behind
      // the ears — and tucks back in toward the crown. An ellipsoid is widest
      // at its equator instead, which is why one reads as pinched up top and
      // bulbous through the middle.
      x *= 1 + Math.exp(-Math.pow((y - 0.130) / 0.180, 2)) * 0.085;
      const vault = smoothstep(0.19, 0.34, y);
      x *= 1 - vault * 0.115;
      z *= 1 - vault * 0.070;
      // The crown is a flattened dome rather than the pole of a sphere.
      y -= smoothstep(0.60, 1.0, ny) * 0.028;

      // The forehead rises close to vertical out of the brow before it turns
      // back. A sphere starts curving away immediately above the eyes, which
      // reads as a head permanently leaning backwards.
      // The front-facing weight has to ease in: clamping at nz = 0 leaves a
      // derivative discontinuity down the side of the skull, which lights up
      // as a crease arcing from the brow to the temple.
      z += smoothstep(0.06, 0.19, y) * (1 - smoothstep(0.22, 0.33, y))
         * smoothstep(0, 0.55, nz) * 0.022;

      // Occiput: the skull projects furthest back at about ear height, and
      // the vault above it slopes forward to the crown. Putting the bulge at
      // the top instead — the usual guess — gives a conehead in profile.
      z -= featureFalloff({ x, y, z }, 0, 0.06, -0.27, 0.22, 0.19, 0.12, 1) * 0.024;
      z += featureFalloff({ x, y, z }, 0, 0.27, -0.22, 0.22, 0.16, 0.14, 1) * 0.022;
      // Below the occiput the skull tucks hard in toward the neck. Leaving
      // that hollow out is what makes a profile read as a ball on a stick:
      // every real head has a concave step between cranium and nape.
      z += featureFalloff({ x, y, z }, 0, -0.235, -0.205, 0.20, 0.135, 0.135, 1) * 0.055;

      // Jaw: the lower head narrows and comes forward into a chin.
      // Eased, and it keeps more width than it takes: too much taper here
      // and the head reads as a skull rather than a face.
      const jaw = smoothstep(0.02, -0.32, y);
      x *= 1 - jaw * A.jaw;
      z *= 1 - jaw * 0.055;
      y -= jaw * 0.008;

      const P = { x, y, z };

      /* --- face --- */
      // Brow ridge, strongest over the eyes and fading at the temples.
      const brow = featureFalloff(P, 0, 0.112, 0.205, 0.150, 0.058, 0.15, 1);
      z += brow * A.brow;
      y += brow * 0.004;
      // Glabella: the flat between the brows, which stops them merging into
      // one shelf across the face.
      z -= featureFalloff(P, 0, 0.098, 0.230, 0.026, 0.045, 0.06, 1) * 0.014;

      // Eye sockets, cut deeper now that a real eyeball and lids fill them.
      // Eye sockets. These have to be genuinely deep — the orbit floor needs
      // to sit behind the lids and the cornea, or the whole eye assembly is
      // swallowed by the surrounding face and the head comes out blank-eyed.
      // Narrow enough across not to flatten the bridge of the nose.
      for (const sx of [1, -1]) {
        const socket = featureFalloff(P, sx * 0.091, 0.034, 0.205, 0.072, 0.062, 0.12, 1);
        z -= socket * 0.085;
      }

      // The upper-lid fold — the crease between lid and brow. It is a small
      // feature and it does more for the eye than the socket does, because
      // it gives the lid an edge to end on instead of blending into the brow.
      for (const sx of [1, -1]) {
        z -= featureFalloff(P, sx * 0.091, 0.072, 0.208, 0.062, 0.016, 0.07, 1) * 0.014;
      }

      // Temples, gently hollowed.
      for (const sx of [1, -1]) {
        x -= sx * featureFalloff(P, sx * 0.185, 0.120, 0.070, 0.075, 0.100, 0.12, 1) * 0.014;
      }


      // Cheekbones.
      for (const sx of [1, -1]) {
        const cheek = featureFalloff(P, sx * 0.150, -0.020, 0.130, 0.090, 0.080, 0.13, 1);
        x += sx * cheek * A.cheek;
        z += cheek * 0.012;
      }


      // Chin, and the mentolabial sulcus — the crease between lip and chin
      // that gives the lower face two planes instead of one.
      // The chin has to clear the lips in profile. Under-projecting it is
      // what makes a face read as weak-jawed and slightly simian.
      const chin = featureFalloff(P, 0, -0.282, 0.196, 0.072, 0.070, 0.12, 1);
      z += chin * A.chin;
      x += (P.x > 0 ? 1 : -1) * chin * 0.006;
      z -= featureFalloff(P, 0, -0.238, 0.212, 0.055, 0.020, 0.06, 1) * 0.022;

      // Nasolabial folds, running from the nose wings past the mouth corners.
      for (const sx of [1, -1]) {
        z -= featureFalloff(P, sx * 0.062, -0.150, 0.212, 0.030, 0.062, 0.07, 1) * 0.017;
      }
      // Philtrum, the groove beneath the nose.
      z -= featureFalloff(P, 0, -0.148, 0.232, 0.014, 0.026, 0.05, 1) * 0.015;

      // Jawline: a defined corner where the jaw turns up toward the ear.
      for (const sx of [1, -1]) {
        const angle = featureFalloff(P, sx * 0.135, -0.212, 0.000, 0.070, 0.078, 0.13, 1);
        x += sx * angle * 0.026;
        y -= angle * 0.014;
        z -= angle * 0.008;
      }

      /* --- and then it died ---
       *
       * Every zombie in the game was wearing a living face with a green
       * material on it. The head is well sculpted and that is exactly the
       * problem: it is a healthy head, tinted. What separates a corpse from
       * a person is not colour, it is where the flesh has gone -- the eyes
       * sink back into their orbits, the temples hollow, the cheeks fall in
       * against the bone so the cheekbone and the jaw angle stand out, the
       * lips shrink back off the teeth, and the whole surface goes to
       * leather.
       *
       * All of it on the same feature falloffs the living face is built
       * from, so it deforms the sculpt rather than fighting it. The
       * asymmetry is seeded: one side of every face has taken more than the
       * other, which is most of why a crowd stops reading as one model. */
      if (opts.rot) {
        const R = Math.max(0, Math.min(1, opts.rot));
        const lean = ((opts.seed || 5) % 5) / 4 - 0.5;      // which side went first
        const Q = { x, y, z };
        for (const sx of [1, -1]) {
          const side = R * (1 + sx * lean * 0.55);
          // Eyes back into the skull, and the orbit rim left standing.
          z -= featureFalloff(Q, sx * 0.091, 0.030, 0.205, 0.058, 0.052, 0.10, 1) * 0.040 * side;
          // Temples caved in.
          x -= sx * featureFalloff(Q, sx * 0.182, 0.118, 0.062, 0.070, 0.095, 0.12, 1) * 0.026 * side;
          // Cheek fallen in under the bone, which is what throws the
          // cheekbone and the jaw angle into relief without moving either.
          x -= sx * featureFalloff(Q, sx * 0.118, -0.108, 0.150, 0.070, 0.085, 0.12, 1) * 0.030 * side;
          z -= featureFalloff(Q, sx * 0.118, -0.108, 0.150, 0.070, 0.085, 0.12, 1) * 0.024 * side;
          // The hollow behind the jaw angle, under the ear.
          z -= featureFalloff(Q, sx * 0.150, -0.150, 0.010, 0.060, 0.080, 0.11, 1) * 0.018 * side;
        }
        // Lips shrunk back off the teeth: the whole mouth region retreats.
        z -= featureFalloff(Q, 0, -0.196, 0.226, 0.078, 0.048, 0.09, 1) * 0.026 * R;
        // The throat under the chin falls away with everything else.
        z -= featureFalloff(Q, 0, -0.300, 0.120, 0.090, 0.080, 0.14, 1) * 0.020 * R;
        // And the skin over the vault dries onto the bone.
        const dry = smoothstep(0.10, 0.34, y);
        x *= 1 - dry * 0.022 * R; z *= 1 - dry * 0.020 * R;
      }

      // A whisper of noise so the surface is not machine-perfect. A dead
      // one is not smooth at all -- the skin has dried and drawn into
      // ridges, so the roughness comes up with the rot.
      const rough = 1 + (opts.rot ? opts.rot * 2.6 : 0);
      const n = noise.fbm(nx * 3.4, ny * 3.4, nz * 3.4, 3) * 0.0035 * rough
        + (opts.rot ? noise.fbm(nx * 11.0, ny * 11.0, nz * 11.0, 2) * 0.0022 * opts.rot : 0);
      x += nx * n; y += ny * n; z += nz * n;

      g.vert(x, y, z, nx, ny, nz, s / sectors, r / rings);
    }
  }

  const row = sectors + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const a = r * row + s;
      if (r !== 0) g.tri(a, a + 1, a + row);
      if (r !== rings - 1) g.tri(a + 1, a + row + 1, a + row);
    }
  }

  // The features that a displaced sphere physically cannot produce, built
  // as their own geometry and dropped in.
  buildNose(g);
  buildLips(g);
  buildEyelids(g);

  // Eyeballs. A socket on its own is a dent; the dome inside it is what
  // the eye reads as an eye, because it catches a highlight where a face
  // is supposed to have one. Cheap, and it does more for "this is a head"
  // than any amount of extra sculpting on the surrounding skull.
  for (const sx of [1, -1]) {
    // The globe, sat back so its front pole falls just behind the lid
    // aperture, and the cornea — a tighter cap bulging through the opening.
    // The cornea is doing most of the work here: on an untextured grey head
    // there is no iris colour to read, so the eye has to be legible from a
    // specular highlight and the hard circular limbus where the cap meets
    // the globe. Both come free from intersecting two spheres.
    const parts = [
      { r: EYE.globeR, z: EYE.globeZ, flat: EYE.globeFlatten, seg: [14, 18] },
      { r: EYE.corneaR, z: EYE.globeZ + EYE.corneaOffset, flat: 1, seg: [10, 14] },
    ];
    for (const part of parts) {
      const eye = Shapes.sphere(part.r, part.seg[0], part.seg[1]);
      const src = eye.positions;
      const base = g.positions.length / 3;
      for (let i = 0; i < src.length; i += 3) {
        g.vert(
          src[i] + sx * EYE.sx, src[i + 1] + EYE.cy, src[i + 2] * part.flat + part.z,
          eye.normals[i], eye.normals[i + 1], eye.normals[i + 2],
          eye.uvs[(i / 3) * 2], eye.uvs[(i / 3) * 2 + 1],
        );
      }
      for (let i = 0; i < eye.indices.length; i += 3) {
        g.tri(base + eye.indices[i], base + eye.indices[i + 1], base + eye.indices[i + 2]);
      }
    }
  }

  /* ---------------- hair ----------------

     Every character in the game was bald, living and dead, and a bald
     head is the single loudest thing a crowd of them can have in common.
     Four builds, four outfits, ten skin tones and a seeded rot pass, all
     of it undone by everybody having the same scalp.

     Built as a second shell over the skull's OWN vertices rather than as
     a sampled cap: the grid is already there, already sculpted, and
     already carries a normal, so pushing the masked part of it outward
     gives hair that follows the head exactly and cannot drift off it.
     Where the mask cuts, the skull shows through, which is what a bald
     patch is; the shell faces outward only, so the skull under it is
     what you see there rather than the inside of a wig.

     The mask is a hairline that runs high at the front and low at the
     nape, minus noise patches, minus however far gone the head is -- a
     corpse that has been out a while has lost most of it in clumps, and
     the clumps are the point. */
  if (opts.hair !== false) {
    const HAIR = [0x2a2118, 0x1c1a18, 0x4a3a28, 0x6b5f4e, 0x8a8378, 0x3a2a22];
    const hairCol = HAIR[(opts.seed || 5) % HAIR.length];
    const R = Math.max(0, Math.min(1, opts.rot || 0));
    const row = sectors + 1;
    const P = g.positions, N = g.normals;
    // How receded this one is, before the rot takes its share.
    const recede = ((opts.seed || 5) % 4) * 0.028;
    const maskAt = (i) => {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      const len = Math.sqrt(x * x + y * y + z * z) || 1;
      const dz = z / len;
      const front = Math.max(0, dz), back = Math.max(0, -dz);
      /* The hairline: high over the brow, dropping down the sides, and
         low at the nape. A widow's peak at the middle of the forehead. */
      const peak = (1 - smoothstep(0.02, 0.12, Math.abs(x))) * front * 0.030;
      const lineY = 0.086 + front * 0.048 - back * 0.170 + recede - peak;
      let m = smoothstep(lineY - 0.020, lineY + 0.055, y);
      // Never over an ear.
      m *= smoothstep(0.055, 0.135, y + Math.abs(x) * 0.35);
      // Clumps: what is left comes away in patches, not evenly.
      const patch = noise.fbm(x * 21.0, y * 21.0, z * 21.0, 3) * 0.5 + 0.5;
      /* First cut at this thresholded at 0.52 to 0.79 on an fbm that
         rarely reaches 0.79, so what survived was a scatter of specks on
         the crown. Most of the scalp should have hair on it; the clumps
         that are gone are the exception, and the rot decides how many. */
      m *= smoothstep(0.12 + R * 0.20, 0.40 + R * 0.20, patch);
      return m;
    };
    const mask = new Float32Array((rings + 1) * row);
    for (let i = 0; i < mask.length; i++) mask[i] = maskAt(i);
    g.setColor(hairCol);
    const base = g.positions.length / 3;
    const idx = new Int32Array(mask.length).fill(-1);
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] <= 0.004) continue;
      /* Thickness, plus a fine ripple so it reads as matted strands and
         not as a swim cap. */
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      const strand = noise.fbm(x * 90.0, y * 34.0, z * 90.0, 2) * 0.5 + 0.5;
      /* Thickness has to go to ZERO at the edge of the mask. Clamping it
         to full thickness over most of the range left every boundary quad
         standing at its full height, and since a quad is either emitted or
         not, the result was a crenellated wall -- a battlement round the
         crown, which is what a wig looks like when it is quantised to the
         grid it is built on. Squared, so it feathers. */
      const t = (0.011 + strand * 0.012) * mask[i] * mask[i];
      idx[i] = g.positions.length / 3;
      g.vert(x + N[i * 3] * t, y + N[i * 3 + 1] * t, z + N[i * 3 + 2] * t,
        N[i * 3], N[i * 3 + 1], N[i * 3 + 2],
        (i % row) / sectors, ((i / row) | 0) / rings);
    }
    for (let r = 0; r < rings; r++) {
      for (let sct = 0; sct < sectors; sct++) {
        const a = r * row + sct, b2 = a + 1, c2 = a + row, d2 = a + row + 1;
        if (idx[a] < 0 || idx[b2] < 0 || idx[c2] < 0 || idx[d2] < 0) continue;
        // Average, not all-four: with the thickness feathering to nothing
        // the edge fades out instead of stopping at a grid line.
        if ((mask[a] + mask[b2] + mask[c2] + mask[d2]) * 0.25 < 0.05) continue;
        g.tri(idx[a], idx[b2], idx[c2]);
        g.tri(idx[b2], idx[d2], idx[c2]);
      }
    }
    g.setColor(null);
    void base;
  }

  // Ears sit on the skull surface, which the parietal widening above pushes
  // out past RX at this height — not at some fraction of it. Placing them
  // inboard buries them inside the head.
  if (opts.ears !== false) buildEars(g, { x: RX * 1.02, y: -0.005, z: -0.030 });

  /* Squeeze the whole head — skull, nose, lips, lids, eyeballs and ears
     together — to a real head's breadth-to-length ratio. Doing it once at
     the end rather than baking it into every constant keeps the sculpt
     coordinates above legible, and applying it to the merged features too
     is what keeps the nose and the eye spacing consistent with the skull.
     Normals are recomputed below, so the non-uniform scale is safe here. */
  for (let i = 0; i < g.positions.length; i += 3) g.positions[i] *= HEAD_SQUEEZE_X;

  g.finalize();
  g.computeWeldGroups();
  // Recompute smooth normals from the sculpted positions — the ellipsoid
  // normals carried through the loop no longer match the surface.
  const face = { workPositions: g.positions, workNormals: g.normals, geometry: g };
  Face.prototype._recomputeNormals.call(face);
  /* Bake the face's own shadows in, AFTER the normals are right -- the
     pass needs a correct normal per vertex to know which side is "above"
     the surface. This is what turns the sculpt into a face: the nostrils,
     the eye apertures, the gap between the lips, the ear canal and the
     shelf under the brow all go dark, and the form stops depending on a
     directional light happening to rake across it. On a head this small
     the radius is a couple of centimetres. */
  bakeCavityAO(g, { radius: 0.052, strength: 0.95, floor: 0.22, samples: 900 });
  return g;
}

/* ============================================================
   HAIR AND FACIAL HAIR

   Built from the head's OWN surface, not from a second ellipsoid
   dropped over it. The head is a sculpt -- squared cranium,
   brow ridge, jaw planes -- and a smooth shell placed over it
   floats off the temples and cuts through the occiput. Taking a
   patch of the head's own triangles and pushing them out along
   their normals gives a piece that hugs it exactly, at any size
   and on any archetype, for nothing.

   Regions are given in NORMALISED head coordinates -- u from
   sole to crown of the head's own bounding box, w from back to
   front -- so the same numbers are right for a fine female
   skull and a heavy male one without a table per archetype.
   ============================================================ */

/* WHERE THINGS ARE ON A HEAD, in the head's own bounding box, chin at
   0 and crown at 1. Got wrong the first time and worth writing down:
   the face occupies the LOWER two thirds. A real hairline sits at about
   0.70, the brow at 0.55, the eyes at 0.50, the nose tip at 0.42, the
   mouth at 0.30 and the point of the chin at 0.05. The first pass cut
   the hair at 0.43-0.55, which put the hairline across the eyebrows and
   gave all ten of them a pale band over the brow where the edge of the
   patch caught the light. */
const HAIR_STYLES = {
  bald:    null,
  crop:    { cut: 0.760, back: 0.700, thick: 0.008 },   // shorn to the wood
  short:   { cut: 0.735, back: 0.660, thick: 0.014 },
  swept:   { cut: 0.715, back: 0.640, thick: 0.022, lean: 0.010 },
  thick:   { cut: 0.700, back: 0.615, thick: 0.030 },
  long:    { cut: 0.700, back: 0.420, thick: 0.030, fall: 0.055 },
  tied:    { cut: 0.720, back: 0.580, thick: 0.020, knot: 0.075 },
};

/* Facial hair, as a region of the same surface.
   `u` is height up the head, `w` is how far forward, and x is how far
   off the centre line -- all normalised. `xMin` exists for chops: a
   sideburn is a thing at the SIDE of a face, and a region with only an
   upper x bound includes the middle of it, which is how the first pass
   drew Hank a bar across the bridge of his nose. */
const BEARD_STYLES = {
  stubble:   { u: [0.04, 0.40], w: [0.40, 1.00], x: 0.62, thick: 0.004 },
  moustache: { u: [0.295, 0.380], w: [0.72, 1.00], x: 0.22, thick: 0.011 },
  goatee:    { u: [0.03, 0.345], w: [0.70, 1.00], x: 0.20, thick: 0.016 },
  chops:     { u: [0.16, 0.52], w: [0.24, 0.68], xMin: 0.34, x: 0.82, thick: 0.014 },
  full:      { u: [0.02, 0.40], w: [0.38, 1.00], x: 0.62, thick: 0.020 },
  heavy:     { u: [0.00, 0.425], w: [0.32, 1.00], x: 0.66, thick: 0.032 },
};

/* One patch of a geometry, pushed out along its normals.
   `keep(u, w, xn, i)` decides, per vertex, whether it is in. A
   triangle is emitted when all three of its corners are. */
function offsetPatch(src, keep, thick, warp) {
  const P = src.positions, N = src.normals, I = src.indices;
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < P.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (P[i + k] < lo[k]) lo[k] = P[i + k];
      if (P[i + k] > hi[k]) hi[k] = P[i + k];
    }
  }
  const sy = Math.max(1e-6, hi[1] - lo[1]);
  const sz = Math.max(1e-6, hi[2] - lo[2]);
  const sx = Math.max(1e-6, hi[0] - lo[0]);
  const n = P.length / 3;
  const inside = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    const u = (P[v * 3 + 1] - lo[1]) / sy;
    const w = (P[v * 3 + 2] - lo[2]) / sz;
    const xn = Math.abs((P[v * 3] - lo[0]) / sx - 0.5) * 2;
    inside[v] = keep(u, w, xn) ? 1 : 0;
  }

  const g = new Geometry();
  const remap = new Int32Array(n).fill(-1);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (!inside[a] || !inside[b] || !inside[c]) continue;
    for (const v of [a, b, c]) {
      if (remap[v] < 0) {
        remap[v] = g.positions.length / 3;
        const px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2];
        const nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
        let ox = px + nx * thick, oy = py + ny * thick, oz = pz + nz * thick;
        if (warp) {
          const u = (py - lo[1]) / sy, w = (pz - lo[2]) / sz;
          const d = warp(u, w);
          ox += d[0]; oy += d[1]; oz += d[2];
        }
        g.positions.push(ox, oy, oz);
        g.normals.push(nx, ny, nz);
        g.uvs.push(src.uvs && src.uvs.length ? src.uvs[v * 2] : 0,
          src.uvs && src.uvs.length ? src.uvs[v * 2 + 1] : 0);
      }
      g.indices.push(remap[v]);
    }
  }
  if (!g.indices.length) return null;
  g.finalize();
  return g;
}

/* The hair on top. `style` is a key of HAIR_STYLES. */
function makeHairGeometry(headGeo, style) {
  const S = HAIR_STYLES[style];
  if (!S) return null;
  /* The cut line is not level. It sits lower at the back than at
     the front, because a hairline does -- level all the way round
     is a swimming cap. `back` is where it sits at the occiput and
     `cut` where it sits at the brow, interpolated on w. */
  const keep = (u, w) => u > (S.back + (S.cut - S.back) * w);
  const warp = (S.fall || S.lean || S.knot) ? (u, w) => {
    let dy = 0, dz = 0;
    // Long hair hangs: the further down the back, the further it falls.
    if (S.fall) { const b = Math.max(0, 0.55 - w) / 0.55; dy = -S.fall * b * b; dz = -S.fall * 0.35 * b; }
    // A swept style has more of itself at the front.
    if (S.lean) dz += S.lean * Math.max(0, w - 0.5) * 2;
    // Tied back: a knot behind the crown.
    if (S.knot && w < 0.28 && u > 0.62) dz -= S.knot;
    return [0, dy, dz];
  } : null;
  return offsetPatch(headGeo, keep, S.thick, warp);
}

/* The beard, moustache, chops or stubble. */
function makeBeardGeometry(headGeo, style) {
  const S = BEARD_STYLES[style];
  if (!S) return null;
  const keep = (u, w, xn) => u > S.u[0] && u < S.u[1] && w > S.w[0] && w < S.w[1]
    && xn < S.x && xn > (S.xMin || 0);
  return offsetPatch(headGeo, keep, S.thick, null);
}
