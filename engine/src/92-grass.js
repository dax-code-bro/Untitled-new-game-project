/* ============================================================
   GRASS — instanced blades with wind and noise-driven clumping.
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
    /* Full controller state, for games that want more than the WASD fold:
       analog sticks, analog triggers, and edge-triggered named buttons. */
    this.pad = {
      connected: false, id: '',
      lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0,
      buttons: {}, pressed: {}, released: {}, _prev: {},
    };
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

  /* Gamepad state is polled, not evented, so it is sampled once per frame.
     Two surfaces come out of it: `pad`, the full analog state a first-person
     game needs, and the legacy fold into the keyboard's key set so a game
     written for WASD keeps working on a controller with no changes. */
  _pollGamepad() {
    const pad = this.pad;
    pad.connected = false;
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (const gp of pads) {
      if (!gp) continue;
      pad.connected = true;
      pad.id = gp.id;

      // Radial dead zone, rescaled so the stick still reaches 1.0 at the rim.
      // Per-axis dead zones are what make diagonal movement feel notchy.
      const stick = (ax, ay, dz) => {
        const x = gp.axes[ax] || 0, y = gp.axes[ay] || 0;
        const m = Math.hypot(x, y);
        if (m < dz) return [0, 0];
        const k = ((m - dz) / (1 - dz)) / m;
        return [clamp(x * k, -1, 1), clamp(y * k, -1, 1)];
      };
      [pad.lx, pad.ly] = stick(0, 1, 0.18);
      [pad.rx, pad.ry] = stick(2, 3, 0.14);

      const btn = (i) => (gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0);
      const held = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      // Triggers are analog on every modern pad; some old ones report them
      // as axes 4/5 instead, so fall back to that.
      pad.lt = gp.buttons.length > 6 ? btn(6) : Math.max(0, (gp.axes[4] || -1) * 0.5 + 0.5);
      pad.rt = gp.buttons.length > 7 ? btn(7) : Math.max(0, (gp.axes[5] || -1) * 0.5 + 0.5);

      const B = pad.buttons;
      const prev = pad._prev;
      const names = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'back', 'start', 'ls', 'rs', 'up', 'down', 'left', 'right'];
      for (let i = 0; i < names.length; i++) {
        const n = names[i];
        const on = i === 6 ? pad.lt > 0.5 : i === 7 ? pad.rt > 0.5 : held(i);
        B[n] = on;
        pad.pressed[n] = on && !prev[n];
        pad.released[n] = !on && prev[n];
        prev[n] = on;
        if (on) this.anyPressed = true;
      }

      // Legacy fold: left stick drives the same axes as WASD, and the face
      // buttons press the same keys the keyboard-only path listens for.
      if (Math.abs(pad.lx) > 0.01) this.axes.x += pad.lx;
      if (Math.abs(pad.ly) > 0.01) this.axes.y += pad.ly;
      const press = (on, key) => { if (on) { if (!this.keys.has(key)) this.pressed.add(key); this.keys.add(key); } };
      press(B.a, ' '); press(B.b, 'x'); press(B.x, 'x'); press(B.y, ' ');
      press(B.up, 'arrowup'); press(B.down, 'arrowdown');
      press(B.left, 'arrowleft'); press(B.right, 'arrowright');
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
    for (const k in this.pad.pressed) this.pad.pressed[k] = false;
    for (const k in this.pad.released) this.pad.released[k] = false;
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
  padDown(name) { return !!this.pad.buttons[name]; }
  padPressed(name) { return !!this.pad.pressed[name]; }

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

  /* A gunshot.

     Not a tone. Every gun in this game was a stack of oscillators, and an
     oscillator is a buzz — the shotgun in particular was a 950 Hz sawtooth,
     which is a kazoo. A real report is a wideband noise transient: a bright
     crack that is over in forty milliseconds, a body with some low in it
     that is the part which carries down a corridor, and a thump you feel
     rather than hear. `bore` walks it from a pistol's snap at 0 to a
     shotgun's boom at 1.

     Its own rate limit, kept apart from impact()'s: a belt gun at twelve
     hundred a minute must not be starved by falling masonry, and neither
     should stack into clipping. */
  /* A gunshot, built from the four things a gunshot is made of.
   *
   * This took one number -- bore, nought to one -- so every weapon in the
   * game was the same sound at a different size, and a 9 mm submachine gun
   * and a .50 revolver differed only in how loud and how long. They do not
   * sound like the same event at all. What separates them is:
   *
   *   crack   the supersonic snap off the bullet. Sharp and very short.
   *           High and thin on a rifle, almost absent on a subsonic
   *           pistol round, and it is the part that travels.
   *   body    the muzzle blast: expanding gas, filtered noise sweeping
   *           down as the pressure falls. Its length is the powder.
   *   thump   the low pressure wave you feel rather than hear. Deep on a
   *           big straight-walled case, barely there on a small one.
   *   mech    the gun working -- a bolt, a slide, a link stripping. On an
   *           open-bolt Thompson this is half the sound of firing it.
   *   tail    the room answering. Concrete gives a hard slap back; the
   *           bigger the charge the longer it rings.
   *
   * Everything has a default so the old single-argument calls still work.
   */
  report(bore = 0.5, opts = {}) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const gap = opts.minGap != null ? opts.minGap : 0.014;
    if (now - (this._lastShot || 0) < gap) return;
    this._lastShot = now;

    const b = clamp(bore, 0, 1);
    const vol = (opts.volume != null ? opts.volume : 1) * lerp(0.24, 0.46, b);
    const dur = opts.dur != null ? opts.dur : lerp(0.11, 0.40, b);

    // Crack: the snap. `crack` scales it, `crackHz` places it.
    const crackAmt = opts.crack != null ? opts.crack : 0.85;
    if (crackAmt > 0) {
      const crack = ctx.createBufferSource();
      crack.buffer = this._noiseBuffer(0.05);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = opts.crackHz != null ? opts.crackHz : lerp(2800, 1100, b);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(vol * crackAmt, now);
      cg.gain.exponentialRampToValueAtTime(0.0001, now + (opts.crackLen || 0.045));
      crack.connect(hp).connect(cg).connect(this.master);
      crack.start(now); crack.stop(now + 0.05);
    }

    // Body: the blast, sweeping down as the gas leaves.
    const body = ctx.createBufferSource();
    body.buffer = this._noiseBuffer(dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(opts.bodyHz0 != null ? opts.bodyHz0 : lerp(1600, 850, b), now);
    lp.frequency.exponentialRampToValueAtTime(
      opts.bodyHz1 != null ? opts.bodyHz1 : lerp(300, 120, b), now + dur);
    lp.Q.value = opts.bodyQ != null ? opts.bodyQ : 0.8;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(vol * (opts.body != null ? opts.body : 1), now);
    bg.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    body.connect(lp).connect(bg).connect(this.master);
    body.start(now); body.stop(now + dur);

    // Thump: the pressure wave.
    const thumpAmt = opts.thump != null ? opts.thump : 0.7;
    if (thumpAmt > 0) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const f0 = opts.thumpHz != null ? opts.thumpHz : lerp(155, 76, b);
      osc.frequency.setValueAtTime(f0, now);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.42, now + dur * 0.7);
      const og = ctx.createGain();
      og.gain.setValueAtTime(vol * thumpAmt, now);
      og.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.8);
      osc.connect(og).connect(this.master);
      osc.start(now); osc.stop(now + dur);
    }

    /* Mech: the action working. Bandpassed noise with a fast attack, a
       few milliseconds behind the shot because the bolt has not moved
       yet at the instant the primer goes. */
    if (opts.mech > 0) {
      const at = now + (opts.mechDelay != null ? opts.mechDelay : 0.018);
      const ml = opts.mechLen || 0.05;
      const m = ctx.createBufferSource();
      m.buffer = this._noiseBuffer(ml + 0.02);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = opts.mechHz || 1900;
      bp.Q.value = 1.4;
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(0.0001, at);
      mg.gain.exponentialRampToValueAtTime(vol * opts.mech, at + 0.004);
      mg.gain.exponentialRampToValueAtTime(0.0001, at + ml);
      m.connect(bp).connect(mg).connect(this.master);
      m.start(at); m.stop(at + ml + 0.02);
    }

    /* Tail: the room. A long, quiet, dark noise decay behind everything
       else -- the difference between a shot fired in a field and one
       fired in a concrete box, and this game is set in a concrete box. */
    if (opts.tail > 0) {
      const tl = opts.tailLen || (dur * 3.5);
      const tn = ctx.createBufferSource();
      tn.buffer = this._noiseBuffer(tl);
      const tf = ctx.createBiquadFilter();
      tf.type = 'lowpass';
      tf.frequency.setValueAtTime(opts.tailHz || 900, now);
      tf.frequency.exponentialRampToValueAtTime(160, now + tl);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.0001, now);
      tg.gain.exponentialRampToValueAtTime(vol * opts.tail, now + 0.03);
      tg.gain.exponentialRampToValueAtTime(0.0001, now + tl);
      tn.connect(tf).connect(tg).connect(this.master);
      tn.start(now); tn.stop(now + tl);
    }
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
