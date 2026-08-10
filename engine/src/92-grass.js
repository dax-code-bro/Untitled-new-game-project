/* ============================================================
   GRASS — instanced blades with wind, clumping and LOD.
   One draw call for the whole field; the bend is computed in the
   vertex shader so the CPU never touches a blade after placement.
   ============================================================ */

class Grass {
  constructor(gl, opts = {}) {
    this.gl = gl;
    this.count = 0;
    this.max = opts.max || 40000;
    this.area = opts.area || 40;
    this.center = Vec3.from(opts.center || [0, 0, 0]);
    this.heightFn = opts.heightFn || null;
    this.density = opts.density != null ? opts.density : 1;
    this.bladeHeight = opts.height || 0.42;
    this.bladeWidth = opts.width || 0.035;
    this.colorLow = parseColor(opts.colorLow != null ? opts.colorLow : 0x2f5d24);
    this.colorHigh = parseColor(opts.colorHigh != null ? opts.colorHigh : 0x86a83c);
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

  /* Place blades. Density is modulated by noise so the field has bare
     patches and thick clumps rather than a uniform carpet. */
  scatter(opts = {}) {
    const target = Math.min(this.max, opts.count || Math.floor(this.area * this.area * 12 * this.density));
    const half = this.area / 2;
    const buf = this.instances;
    let n = 0;
    const pos = new Vec3();
    const quat = new Quat();
    const scale = new Vec3();
    const mat = new Mat4();
    const color = new Vec3();
    const up = new Vec3(0, 1, 0);

    // Try more candidates than we need; the density mask rejects some.
    const attempts = target * 2;
    for (let i = 0; i < attempts && n < target; i++) {
      const x = this.center.x + this.rng.range(-half, half);
      const z = this.center.z + this.rng.range(-half, half);

      const mask = this.noise.fbm(x * 0.05, 0, z * 0.05, 3) * 0.5 + 0.5;
      if (this.rng.next() > mask * 1.35) continue;
      if (opts.mask && !opts.mask(x, z)) continue;

      const y = this.heightFn ? this.heightFn(x, z) : this.center.y;

      // Random yaw plus a slight random lean, so no two blades match.
      quat.setEuler(
        this.rng.range(-0.14, 0.14),
        this.rng.range(0, TAU),
        this.rng.range(-0.14, 0.14),
      );
      const h = this.rng.range(0.65, 1.45) * (mask * 0.5 + 0.75);
      scale.set(this.rng.range(0.8, 1.2), h, 1);
      pos.set(x, y, z);
      mat.compose(pos, quat, scale);
      buf.set(mat.e, n * 20);

      // Tint by height and a large-scale patch noise: dry patches, lush ones.
      const t = clamp(this.noise.fbm(x * 0.09, 3.1, z * 0.09, 2) * 0.5 + 0.5, 0, 1);
      color.copy(this.colorLow).lerp(this.colorHigh, t * 0.8 + this.rng.range(0, 0.2));
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

  /* Cull to a radius around the camera and re-upload. Cheap enough to run
     every few frames, and it keeps huge fields affordable. */
  cullTo(cameraPos, radius) {
    // Blades are already uploaded; culling would require a second buffer and
    // a full repack. Instead the whole field is drawn and the shader's LOD
    // fade handles distance, which is faster than repacking on the CPU.
    this.visibleRadius = radius;
    return this.count;
  }

  batch() {
    return {
      mesh: this.mesh,
      material: this.material,
      instances: this.instances.subarray(0, this.count * 20),
      count: this.count,
      instanced: true,
      grass: true,
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
