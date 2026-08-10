/* ============================================================
   FACE — blendshape expressions, viseme lipsync, gaze and blinks.

   Heads are a few hundred vertices, so morph targets are applied
   on the CPU and the position/normal buffers are re-uploaded each
   frame. That is far simpler than GPU morphing and, at this vertex
   count, indistinguishable in cost.
   ============================================================ */

/* Region weights let a blendshape affect only the part of the face it
   should. Each returns 0..1 for a vertex in head-local space, where the
   head is roughly a unit-ish blob centred on the origin. */
const FaceRegions = {
  brow: (p) => smoothstep(0.10, 0.30, p.y) * smoothstep(0.42, 0.24, p.y) * smoothstep(-0.05, 0.22, p.z),
  eyeL: (p) => Math.max(0, 1 - dist2(p, 0.115, 0.13, 0.20) / 0.010),
  eyeR: (p) => Math.max(0, 1 - dist2(p, -0.115, 0.13, 0.20) / 0.010),
  upperLid: (p) => Math.max(0, 1 - dist2(p, 0.115, 0.155, 0.20) / 0.012)
                 + Math.max(0, 1 - dist2(p, -0.115, 0.155, 0.20) / 0.012),
  cheek: (p) => (Math.max(0, 1 - dist2(p, 0.17, -0.02, 0.16) / 0.030)
               + Math.max(0, 1 - dist2(p, -0.17, -0.02, 0.16) / 0.030)),
  mouth: (p) => Math.max(0, 1 - dist2(p, 0, -0.16, 0.21) / 0.026),
  mouthCornerL: (p) => Math.max(0, 1 - dist2(p, 0.085, -0.155, 0.19) / 0.012),
  mouthCornerR: (p) => Math.max(0, 1 - dist2(p, -0.085, -0.155, 0.19) / 0.012),
  upperLip: (p) => Math.max(0, 1 - dist2(p, 0, -0.125, 0.215) / 0.014),
  lowerLip: (p) => Math.max(0, 1 - dist2(p, 0, -0.195, 0.212) / 0.014),
  jaw: (p) => smoothstep(-0.10, -0.34, p.y) * smoothstep(-0.10, 0.16, p.z),
  nose: (p) => Math.max(0, 1 - dist2(p, 0, -0.02, 0.25) / 0.012),
};

function dist2(p, x, y, z) {
  const dx = p.x - x, dy = p.y - y, dz = p.z - z;
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

/* A stylised head with the topology the blendshape regions expect: eye
   sockets, a brow ridge, a nose and a mouth line, all at positions the
   region functions above are tuned against. */
function makeHeadGeometry(opts = {}) {
  const rings = opts.rings || 26;
  const sectors = opts.sectors || 32;
  const g = new Geometry();
  const noise = new Noise(opts.seed || 5);

  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * PI;
    const sp = Math.sin(phi), cp = Math.cos(phi);
    for (let s = 0; s <= sectors; s++) {
      const th = (s / sectors) * TAU;
      let nx = sp * Math.cos(th), ny = cp, nz = sp * Math.sin(th);

      // Base head proportions: taller than wide, flatter at the back.
      let x = nx * 0.30, y = ny * 0.36, z = nz * 0.30;
      if (z < 0) z *= 0.86;                        // flatter cranium behind
      if (y < -0.1) { x *= 0.86; z *= 0.92; }      // jaw tapers in

      // Brow ridge.
      const browAmt = Math.max(0, 1 - dist2({ x, y, z }, 0, 0.16, 0.26) / 0.05);
      z += browAmt * 0.020;
      y += browAmt * 0.004;

      // Eye sockets, pressed in on both sides.
      for (const sx of [1, -1]) {
        const socket = Math.max(0, 1 - dist2({ x, y, z }, sx * 0.115, 0.125, 0.235) / 0.014);
        z -= socket * 0.030;
      }

      // Nose.
      const nose = Math.max(0, 1 - dist2({ x, y, z }, 0, -0.01, 0.26) / 0.016);
      z += nose * 0.045;
      const nostril = Math.max(0, 1 - dist2({ x, y, z }, 0, -0.07, 0.27) / 0.004);
      z -= nostril * 0.012;

      // Mouth line: a shallow crease so the lips have an edge to move around.
      const mouth = Math.max(0, 1 - dist2({ x, y, z }, 0, -0.16, 0.255) / 0.020);
      z -= mouth * 0.016;

      // Chin.
      const chin = Math.max(0, 1 - dist2({ x, y, z }, 0, -0.28, 0.20) / 0.020);
      z += chin * 0.018;
      y -= chin * 0.006;

      // Cheekbones.
      for (const sx of [1, -1]) {
        const cheek = Math.max(0, 1 - dist2({ x, y, z }, sx * 0.18, 0.02, 0.18) / 0.030);
        z += cheek * 0.012;
        x += cheek * sx * 0.008;
      }

      // A whisper of noise so the surface is not machine-perfect.
      const n = noise.fbm(nx * 3, ny * 3, nz * 3, 3) * 0.004;
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

  g.finalize();
  // Recompute smooth normals from the sculpted positions — the sphere
  // normals carried through the loop no longer match the surface.
  const face = { workPositions: g.positions, workNormals: g.normals, geometry: g };
  Face.prototype._recomputeNormals.call(face);
  return g;
}
