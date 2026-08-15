/* ============================================================
   GRASS — instanced blades with wind and noise-driven clumping.
   One draw call for the whole field; the bend is computed in the
   vertex shader so the CPU never touches a blade after placement.

   Fields come in three families, each with variants, all still a
   single instanced draw call — the variety is per-blade data:
     standard : healthy green, sways      (normal | tall | trampled)
     dead     : sun-bleached, beat down,  (normal | tall | trampled |
                bare patches over hardpan  insects | mixed)
     mud      : dark seagrass over mud    (normal | duckweed | frogs |
                                           puddles)
   Insects/frogs/puddles/sticks are decorations the engine scatters
   separately; the preset here carries which ones it wants.
   ============================================================ */

const GRASS_PRESETS = {
  standard: {
    colorLow: 0x2f5d24, colorHigh: 0x86a83c,
    height: 0.42, width: 0.05, density: 1,
    windScale: 1, lean: 0.14, bare: 0,        // no bald patches
    trampled: 0, weedChance: 0, heightJitter: [0.65, 1.45],
    // A healthy meadow is a forest floor of grass, not scattered tufts —
    // high clump chance and a wide overlap radius means neighboring clumps
    // blend into each other and true gaps almost never show, while the
    // per-clump height bias still keeps it reading as real growth instead
    // of a uniform lawn.
    clumpSize: 0.4, clumpChance: 0.97, clumpSpread: 1.1,
    ground: 'grass',
  },
  dead: {
    // Sun-bleached straw over savanna hardpan. Barely sways: dead stalks
    // are dry and stiff, and half of them are broken over anyway.
    colorLow: 0x6e6349, colorHigh: 0xa39a72,
    height: 0.3, width: 0.032, density: 0.8,
    windScale: 0.22, lean: 0.4, bare: 0.4,     // hard bald patches
    trampled: 0.28, weedChance: 0, heightJitter: [0.35, 1.6],
    clumpSize: 0.55, clumpChance: 0.48, clumpSpread: 0.5,
    ground: 'savanna',
  },
  mud: {
    // Sparse dark seagrass strands out of churned wet earth, with a
    // scatter of taller weed clumps.
    colorLow: 0x2e4020, colorHigh: 0x567538,
    height: 0.5, width: 0.03, density: 0.42,
    windScale: 0.55, lean: 0.22, bare: 0.3,
    trampled: 0.08, weedChance: 0.14, heightJitter: [0.5, 1.5],
    weedLow: 0x24371c, weedHigh: 0x44603a,
    clumpSize: 0.48, clumpChance: 0.46, clumpSpread: 0.5,
    ground: 'mud',
  },
};

// Deterministic integer hash -> [0,1). Looking up the same (cellX, cellZ,
// salt) always returns the same value, so clump centers can be reconstructed
// on demand for any candidate blade instead of stored in a grid array —
// the field stays infinite and stateless.
function clumpHash(ix, iz, salt) {
  let h = (ix * 374761393 + iz * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 1000000) / 1000000;
}

/* Variant modifiers stack on top of a family preset. `decor` names the
   living extras the engine should scatter around the field. */
const GRASS_VARIANTS = {
  normal:   {},
  tall:     { heightMul: 2.3, widthMul: 1.35, windScale: 0.8, densityMul: 0.7 },
  trampled: { trampled: 0.6, heightMul: 0.85 },
  insects:  { decor: ['insects'] },
  bugs:     { decor: ['insects'] },
  mixed:    { trampled: 0.34, weedChance: 0.1, tallChance: 0.12, decor: ['insects'] },
  duckweed: { decor: ['duckweed'] },
  frogs:    { decor: ['frogs'] },
  puddles:  { decor: ['puddles'] },
};

function resolveGrassSpec(spec) {
  // Accepts true, 'dead', 'dead-insects', or {preset, variant, ...opts}.
  let preset = 'standard', variant = 'normal', extra = {};
  if (spec === true || spec == null) { /* defaults */ }
  else if (typeof spec === 'string') {
    const parts = spec.toLowerCase().split(/[-_ ]+/).filter(Boolean);
    if (parts.length && GRASS_PRESETS[parts[0]]) { preset = parts.shift(); }
    if (parts.length && GRASS_VARIANTS[parts[0]]) { variant = parts.shift(); }
  } else if (typeof spec === 'object') {
    preset = GRASS_PRESETS[spec.preset] ? spec.preset : 'standard';
    variant = GRASS_VARIANTS[spec.variant] ? spec.variant : 'normal';
    extra = spec;
  }
  const p = Object.assign({}, GRASS_PRESETS[preset]);
  const v = GRASS_VARIANTS[variant];
  if (v.heightMul) p.height *= v.heightMul;
  if (v.widthMul) p.width *= v.widthMul;
  if (v.densityMul) p.density *= v.densityMul;
  if (v.windScale != null) p.windScale *= v.windScale;
  if (v.trampled != null) p.trampled = v.trampled;
  if (v.weedChance != null) p.weedChance = Math.max(p.weedChance, v.weedChance);
  p.tallChance = v.tallChance || 0;
  p.decor = v.decor || [];
  p.preset = preset;
  p.variant = variant;
  return Object.assign(p, extra);
}

class Grass {
  constructor(gl, opts = {}) {
    this.gl = gl;
    this.count = 0;
    this.max = opts.max || 40000;
    this.area = opts.area || 40;
    this.center = Vec3.from(opts.center || [0, 0, 0]);
    this.heightFn = opts.heightFn || null;
    // opts normally arrive pre-resolved (engine.ground → resolveGrassSpec),
    // but a bare string/absent preset is resolved here so the class stands alone.
    const resolved = (opts.bare != null || opts.trampled != null)
      ? opts
      : Object.assign({}, resolveGrassSpec(opts.preset), opts);
    this.P = Object.assign({}, GRASS_PRESETS.standard, resolved);
    this.density = this.P.density;
    this.bladeHeight = opts.height || this.P.height;
    this.bladeWidth = opts.width || this.P.width;
    this.windScale = this.P.windScale != null ? this.P.windScale : 1;
    this.colorLow = parseColor(opts.colorLow != null ? opts.colorLow : this.P.colorLow);
    this.colorHigh = parseColor(opts.colorHigh != null ? opts.colorHigh : this.P.colorHigh);
    this.weedLow = parseColor(this.P.weedLow != null ? this.P.weedLow : 0x24371c);
    this.weedHigh = parseColor(this.P.weedHigh != null ? this.P.weedHigh : 0x44603a);
    this.rng = new Rng(opts.seed || 31337);
    this.noise = new Noise(opts.seed || 31337);

    const geo = Shapes.grassBlade(this.bladeHeight, this.bladeWidth, opts.segments || 4);
    this.mesh = new GpuMesh(gl, geo);
    this.mesh.setupInstancing(20);
    this.instances = new Float32Array(this.max * 20);
    this.material = new Material(gl, {
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0,
      subsurface: opts.subsurface != null ? opts.subsurface : 0.5,
      doubleSided: true,
      castShadow: opts.castShadow !== false,
    });
    this.scatter(opts);
  }

  /* Place blades. A meadow doesn't grow as an even carpet — it grows in
     tufts, with visible ground or shorter cover between them. Blades are
     scattered continuously, but each candidate is accepted or rejected by
     distance to the nearest procedural clump center, so the field reads as
     hand-placed grass clumps rather than a lawn of individually-scattered
     blades. Large-scale noise still layers lush/dry variation on top. */
  scatter(opts = {}) {
    // Clumping concentrates blades into tufts rather than spreading them
    // evenly, so the raw per-area budget goes up — a tuft needs several
    // blades packed close together to read as a clump instead of a sprig.
    const target = Math.min(this.max, opts.count || Math.floor(this.area * this.area * 26 * this.density));
    const half = this.area / 2;
    const buf = this.instances;
    let n = 0;
    const pos = new Vec3();
    const quat = new Quat();
    const scale = new Vec3();
    const mat = new Mat4();
    const color = new Vec3();
    const up = new Vec3(0, 1, 0);

    const P = this.P;
    const jit = P.heightJitter || [0.65, 1.45];
    const cs = P.clumpSize || 0.55;
    const clumpChance = P.clumpChance != null ? P.clumpChance : 0.6;
    const clumpRadius = cs * (P.clumpSpread != null ? P.clumpSpread : 0.65);
    const saltBase = (opts.seed || 31337) * 4;
    // Clumping rejects most candidates between tufts, so many more attempts
    // are needed to reach the target blade count than a uniform scatter.
    const attempts = target * 7;
    for (let i = 0; i < attempts && n < target; i++) {
      const x = this.center.x + this.rng.range(-half, half);
      const z = this.center.z + this.rng.range(-half, half);

      // Nearest clump center among this cell and its 8 neighbors. Cells
      // roll their own presence, so most cells are empty gaps between tufts.
      const cellX = Math.floor(x / cs), cellZ = Math.floor(z / cs);
      let bestDist = Infinity, clumpBias = 0.5;
      for (let dcx = -1; dcx <= 1; dcx++) {
        for (let dcz = -1; dcz <= 1; dcz++) {
          const gx = cellX + dcx, gz = cellZ + dcz;
          if (clumpHash(gx, gz, saltBase + 1) > clumpChance) continue;
          const ccx = (gx + 0.5) * cs + (clumpHash(gx, gz, saltBase + 2) - 0.5) * cs;
          const ccz = (gz + 0.5) * cs + (clumpHash(gx, gz, saltBase + 3) - 0.5) * cs;
          const d = Math.hypot(x - ccx, z - ccz);
          if (d < bestDist) { bestDist = d; clumpBias = clumpHash(gx, gz, saltBase + 4); }
        }
      }
      if (bestDist === Infinity) continue;                    // gap between tufts
      const clumpFalloff = Math.exp(-(bestDist * bestDist) / (clumpRadius * clumpRadius));
      if (this.rng.next() > clumpFalloff) continue;

      const mask = this.noise.fbm(x * 0.05, 0, z * 0.05, 3) * 0.5 + 0.5;
      if (opts.mask && !opts.mask(x, z)) continue;

      // Hard bald patches: dead fields show bare hardpan, mud shows mud.
      // A sharp threshold (not a fade) is what reads as a real bare patch.
      if (P.bare > 0) {
        const bareN = this.noise.fbm(x * 0.07, 7.7, z * 0.07, 3) * 0.5 + 0.5;
        if (bareN < P.bare) continue;
      }

      const y = this.heightFn ? this.heightFn(x, z) : this.center.y;

      // Trampled clusters: flattened blades lying near the ground, clumped
      // by noise so they read as trails and rest spots, not static.
      let flattened = false;
      if (P.trampled > 0) {
        const tramp = this.noise.fbm(x * 0.11, 11.3, z * 0.11, 2) * 0.5 + 0.5;
        flattened = tramp < P.trampled;
      }

      // Weed clumps (mud seagrass) and occasional talls in mixed fields.
      const isWeed = P.weedChance > 0 && this.rng.next() < P.weedChance;
      const isTall = !isWeed && P.tallChance > 0 && this.rng.next() < P.tallChance;

      const lean = P.lean != null ? P.lean : 0.14;
      if (flattened) {
        // Bent over: pitched almost to the ground in a random direction,
        // shorter, and it barely sways.
        quat.setEuler(
          this.rng.range(1.15, 1.42),
          this.rng.range(0, TAU),
          this.rng.range(-0.2, 0.2),
        );
      } else {
        quat.setEuler(
          this.rng.range(-lean, lean),
          this.rng.range(0, TAU),
          this.rng.range(-lean, lean),
        );
      }

      // Blades in the same tuft share a height bias (clumpBias, stable per
      // clump center) on top of their own random jitter, so a tuft reads as
      // one coherent clump instead of independent blades that happen to be
      // near each other.
      let h = this.rng.range(jit[0], jit[1]) * (mask * 0.5 + 0.75) * lerp(0.82, 1.18, clumpBias);
      let w = this.rng.range(0.8, 1.2);
      if (isWeed) { h *= this.rng.range(2.0, 3.1); w *= 1.6; }
      if (isTall) { h *= this.rng.range(1.8, 2.4); w *= 1.3; }
      if (flattened) { h *= this.rng.range(0.55, 0.85); }
      scale.set(w, h, 1);
      pos.set(x, y, z);
      mat.compose(pos, quat, scale);
      buf.set(mat.e, n * 20);

      // Tint by height and a large-scale patch noise: dry patches, lush ones.
      const t = clamp(this.noise.fbm(x * 0.09, 3.1, z * 0.09, 2) * 0.5 + 0.5, 0, 1);
      if (isWeed) {
        color.copy(this.weedLow).lerp(this.weedHigh, t * 0.8 + this.rng.range(0, 0.2));
      } else {
        color.copy(this.colorLow).lerp(this.colorHigh, t * 0.8 + this.rng.range(0, 0.2));
      }
      // Trampled blades read duller: pulled toward gray-brown.
      if (flattened) {
        color.x = lerp(color.x, 0.32, 0.35);
        color.y = lerp(color.y, 0.28, 0.35);
        color.z = lerp(color.z, 0.20, 0.35);
      }
      buf[n * 20 + 16] = color.x;
      buf[n * 20 + 17] = color.y;
      buf[n * 20 + 18] = color.z;
      buf[n * 20 + 19] = this.rng.next();   // per-blade wind phase seed
      n++;
    }

    this.count = n;
    this.mesh.uploadInstances(this.instances.subarray(0, n * 20), n);
    return n;
  }

  batch() {
    return {
      mesh: this.mesh,
      material: this.material,
      instances: this.instances.subarray(0, this.count * 20),
      count: this.count,
      instanced: true,
      grass: true,
      windScale: this.windScale,
      alphaClip: false,
      sortKey: 0,
    };
  }

  dispose() {
    this.mesh.dispose();
    this.material.dispose();
  }
}

/* ============================================================
   INPUT — keyboard, pointer and gamepad.
   Legend's on-screen touch controls deliver standard keyboard
   events, so a game that reads keys works on phones for free.
   ============================================================ */

class Input {
  constructor(target = window) {
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.pointer = { x: 0, y: 0, dx: 0, dy: 0, down: false, justDown: false, justUp: false };
    this.axes = { x: 0, y: 0 };
    this.anyPressed = false;
    this._listeners = [];
    this._bind(target);
  }

  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._listeners.push([target, type, fn, opts]);
  }

  _bind(target) {
    this._on(target, 'keydown', (e) => {
      const k = normalizeKey(e.key, e.code);
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      this.anyPressed = true;
      // Arrows and space scroll the page otherwise, which is fatal in a
      // full-screen game.
      if (PREVENT_KEYS.has(k)) e.preventDefault();
    });
    this._on(target, 'keyup', (e) => {
      const k = normalizeKey(e.key, e.code);
      this.keys.delete(k);
      this.released.add(k);
    });
    // A window that loses focus never delivers keyup, leaving keys stuck on.
    this._on(window, 'blur', () => { this.keys.clear(); });

    const pointerPos = (e) => {
      const t = e.touches && e.touches[0] ? e.touches[0] : e;
      const nx = t.clientX, ny = t.clientY;
      this.pointer.dx = nx - this.pointer.x;
      this.pointer.dy = ny - this.pointer.y;
      this.pointer.x = nx;
      this.pointer.y = ny;
    };
    this._on(target, 'pointermove', pointerPos);
    this._on(target, 'pointerdown', (e) => {
      pointerPos(e);
      this.pointer.down = true;
      this.pointer.justDown = true;
      this.anyPressed = true;
    });
    this._on(target, 'pointerup', () => {
      this.pointer.down = false;
      this.pointer.justUp = true;
    });
    this._on(target, 'touchstart', () => { this.anyPressed = true; }, { passive: true });
  }

  /* Gamepad state is polled, not evented, so it is sampled once per frame
     and folded into the same key set the keyboard fills. */
  _pollGamepad() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (!pad) continue;
      const dz = 0.22;
      const lx = pad.axes[0] || 0, ly = pad.axes[1] || 0;
      if (Math.abs(lx) > dz) this.axes.x += lx;
      if (Math.abs(ly) > dz) this.axes.y += ly;
      const press = (i, key) => { if (pad.buttons[i] && pad.buttons[i].pressed) { if (!this.keys.has(key)) this.pressed.add(key); this.keys.add(key); this.anyPressed = true; } };
      press(0, ' '); press(1, 'x'); press(2, 'x'); press(3, ' ');
      press(12, 'arrowup'); press(13, 'arrowdown'); press(14, 'arrowleft'); press(15, 'arrowright');
      break;
    }
  }

  /* Call once per frame, before game logic. */
  beginFrame() {
    this.axes.x = 0;
    this.axes.y = 0;
    this._pollGamepad();
    // Keyboard contribution, so WASD and a stick feed the same axes.
    if (this.down('a') || this.down('arrowleft')) this.axes.x -= 1;
    if (this.down('d') || this.down('arrowright')) this.axes.x += 1;
    if (this.down('w') || this.down('arrowup')) this.axes.y -= 1;
    if (this.down('s') || this.down('arrowdown')) this.axes.y += 1;
    this.axes.x = clamp(this.axes.x, -1, 1);
    this.axes.y = clamp(this.axes.y, -1, 1);
  }

  /* Call once per frame, after game logic, to clear edge-triggered state. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.pointer.justDown = false;
    this.pointer.justUp = false;
    this.pointer.dx = 0;
    this.pointer.dy = 0;
    this.anyPressed = false;
  }

  down(key) { return this.keys.has(normalizeKey(key, key)); }
  justPressed(key) { return this.pressed.has(normalizeKey(key, key)); }
  justReleased(key) { return this.released.has(normalizeKey(key, key)); }
  get action() { return this.down(' '); }
  get actionPressed() { return this.justPressed(' '); }
  get secondaryPressed() { return this.justPressed('x'); }

  dispose() {
    for (const [t, type, fn, opts] of this._listeners) t.removeEventListener(type, fn, opts);
    this._listeners.length = 0;
  }
}

const PREVENT_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ']);

function normalizeKey(key, code) {
  if (!key) return '';
  let k = String(key).toLowerCase();
  if (k === 'spacebar' || code === 'Space') k = ' ';
  return k;
}

/* ============================================================
   AUDIO — procedural impact and ambience.
   Sounds are synthesised with the Web Audio API rather than
   loaded, so a game stays a single file.
   ============================================================ */

class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.5;
    this._lastPlay = 0;
  }

  /* Browsers require a user gesture before audio starts, so this is called
     lazily from the first input rather than at construction. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return null; }
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.enabled = false;
    }
    return this.ctx;
  }

  _noiseBuffer(duration) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* A thud: filtered noise burst with a fast decay. Pitch and brightness
     scale with impact strength, which is most of what makes hits feel real. */
  impact(strength = 1, opts = {}) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    // Rate limit: a collapsing wall generates hundreds of contacts and would
    // otherwise produce a wall of clipping noise.
    const now = ctx.currentTime;
    if (now - this._lastPlay < 0.018) return;
    this._lastPlay = now;

    const s = clamp(strength, 0, 1);
    const dur = lerp(0.08, 0.34, s);
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lerp(320, 2400, s * s);
    filter.Q.value = 1.1;

    const gain = ctx.createGain();
    const vol = lerp(0.06, 0.42, s) * (opts.volume != null ? opts.volume : 1);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    // A low sine under the noise gives the hit weight.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(lerp(60, 160, s), now);
    osc.frequency.exponentialRampToValueAtTime(lerp(38, 70, s), now + dur * 0.8);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(vol * 0.8, now);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.9);

    src.connect(filter).connect(gain).connect(this.master);
    osc.connect(oscGain).connect(this.master);
    src.start(now); src.stop(now + dur);
    osc.start(now); osc.stop(now + dur);
  }

  /* Shattering: a cloud of short, bright, detuned pings. */
  shatter(strength = 1) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const n = Math.round(lerp(4, 12, clamp(strength, 0, 1)));
    for (let i = 0; i < n; i++) {
      const t = now + Math.random() * 0.12;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 900 + Math.random() * 2600;
      const g = ctx.createGain();
      const dur = 0.05 + Math.random() * 0.16;
      g.gain.setValueAtTime(0.10 * strength, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.master);
      osc.start(t); osc.stop(t + dur);
    }
  }

  splash(strength = 1) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 0.35;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    // Sweeping the band upward is what reads as "water" rather than "static".
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.exponentialRampToValueAtTime(3200, now + dur);
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16 * clamp(strength, 0, 1), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(now); src.stop(now + dur);
  }

  /* A short melodic blip for pickups and UI. */
  tone(frequency = 660, duration = 0.12, type = 'square', volume = 0.14) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g).connect(this.master);
    osc.start(now); osc.stop(now + duration);
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.master) this.master.gain.value = this.volume;
  }
}
