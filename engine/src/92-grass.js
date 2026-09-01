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
      this.anyPressed = true;
      /* The PRIMARY button only. This set `down` for any button at all, and
         `down` is what games read as "fire" -- so right-clicking to aim
         also pulled the trigger, on every game built on this engine. Touch
         and pen report button 0 as well, so they still work. */
      if (e.button != null && e.button !== 0) { this.pointer.rightDown = e.button === 2 || this.pointer.rightDown; return; }
      this.pointer.down = true;
      this.pointer.justDown = true;
    });
    this._on(target, 'pointerup', (e) => {
      if (e && e.button === 2) this.pointer.rightDown = false;
      if (e && e.button != null && e.button !== 0) return;
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
      /* Every index below is only true of the STANDARD mapping, and this
         never asked whether it had one.

         The W3C gamepad spec defines `mapping === 'standard'` precisely so
         a game knows the layout: axes 0/1 left stick, 2/3 right stick,
         buttons 6/7 triggers, and the sixteen-button order below. A pad
         the browser cannot recognise reports `mapping: ''` and hands over
         whatever order the device happens to use -- which is common on
         Bluetooth pads, phone clip-ons, and anything not an Xbox
         controller.

         Read blind, that puts the LEFT stick on axes 2 and 3 on a good
         number of pads, and axes 2/3 is where this game reads LOOK from.
         So the movement stick aims. And a face or d-pad button landing on
         index 0 or 3 becomes `a` or `y`, both of which the legacy fold
         below presses SPACE for, which is jump. Both halves of "the move
         button acts as my aiming input and my character goes up" fall out
         of the same missing check.

         There is no honest way to guess a layout the browser could not
         identify, so this does not try. Non-standard pads keep the two
         things that are near-universal -- axes 0/1 for the left stick and
         the raw button list -- and lose the parts that are pure
         convention: the right stick, the analog triggers, and the fold
         onto keyboard keys. A pad that only walks is a great deal better
         than one that aims when you try to walk. `pad.standard` says
         which you have, so the HUD can tell the player. */
      pad.standard = gp.mapping === 'standard';
      [pad.lx, pad.ly] = stick(0, 1, 0.18);
      [pad.rx, pad.ry] = pad.standard ? stick(2, 3, 0.14) : [0, 0];

      const btn = (i) => (gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0);
      const held = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      // Triggers are analog on every modern pad; some old ones report them
      // as axes 4/5 instead, so fall back to that.
      if (pad.standard) {
        pad.lt = gp.buttons.length > 6 ? btn(6) : Math.max(0, (gp.axes[4] || -1) * 0.5 + 0.5);
        pad.rt = gp.buttons.length > 7 ? btn(7) : Math.max(0, (gp.axes[5] || -1) * 0.5 + 0.5);
      } else {
        /* Not guessed. On an unknown layout button 6 is as likely to be a
           shoulder or a d-pad direction as a trigger, and `lt` is the aim
           button -- so a wrong guess here is the reported bug wearing a
           different hat. */
        pad.lt = 0; pad.rt = 0;
      }

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
      /* Only on a pad whose layout the browser vouches for. The fold is
         what turns a button index into a keyboard key, so on an unknown
         layout it is a machine for pressing the wrong key -- and the key
         it presses most is space, because two of the four face buttons
         are folded onto it. */
      if (pad.standard) {
        const press = (on, key) => { if (on) { if (!this.keys.has(key)) this.pressed.add(key); this.keys.add(key); } };
        press(B.a, ' '); press(B.b, 'x'); press(B.x, 'x'); press(B.y, ' ');
        press(B.up, 'arrowup'); press(B.down, 'arrowdown');
        press(B.left, 'arrowleft'); press(B.right, 'arrowright');
      }
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

  /* White noise, and it used to be minted fresh on every call.
   *
   * Almost everything in here is a noise burst -- every report, every
   * impact, every breath and fricative in a spoken line -- and each one was
   * allocating a buffer and filling it a sample at a time. A single spoken
   * sentence with breath on it is twenty-odd buffers, and a gun firing at
   * eight hundred rounds a minute is thirteen a second, all of them thrown
   * away immediately.
   *
   * Four two-second buffers, made once, picked at random. Random because
   * one shared buffer would mean every burst is the same noise, and the ear
   * hears a repeated noise texture as a loop rather than as noise. Anything
   * longer than the pool still gets its own buffer, which nothing currently
   * asks for. */
  _noiseBuffer(duration) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    if (duration <= 2) {
      if (!this._noisePool || this._noiseRate !== rate) {
        this._noiseRate = rate;
        this._noisePool = [];
        for (let k = 0; k < 4; k++) {
          const b = ctx.createBuffer(1, Math.floor(rate * 2), rate);
          const d = b.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
          this._noisePool.push(b);
        }
      }
      return this._noisePool[(Math.random() * 4) | 0];
    }
    const len = Math.max(1, Math.floor(rate * duration));
    const buf = ctx.createBuffer(1, len, rate);
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

  /* ---------------- speech ----------------

     A voice, synthesised from formants, so a character sounds the same on
     every machine that runs the game.

     The browser has a speech synthesiser built into it and it says real
     words, which is worth having -- but the VOICE it uses belongs to the
     player's operating system, so the same character is a different person
     on Windows, on a Mac and on a phone, and on some devices there is no
     voice at all. An eighty-year-old man cannot be made to sound eighty by
     asking politely for a lower pitch.

     So the voice is built here instead. Speech is a buzzing source shaped
     by the resonances of the throat and mouth -- the formants -- and the
     vowel you hear is decided almost entirely by where the first two of
     them sit. Move F1 and F2 and you move between "ee" and "ah" and "oo"
     without changing anything else. That is what makes this a voice rather
     than a beep: three bandpass filters over a glottal buzz, the buzz
     given jitter so it is a throat and not an oscillator, and consonants
     as short noise bursts between the vowels.

     What a character IS comes out of six numbers:

       pitch     the larynx. 80 Hz is a big man, 210 a young woman.
       tract     vocal tract length, which scales every formant. A long
                 tract is a large body and a dark voice; short is small
                 and bright. This is the number that carries age and size,
                 and it is why simply lowering the pitch of a young voice
                 sounds like a slowed-down recording rather than an old man.
       rasp      irregularity in the glottal pulse: smoke, age, damage.
       breath    unvoiced air leaking through, which is what makes a
                 whisper a whisper.
       rate      syllables a second.
       swing     how far the pitch moves across a line. Flat is deadpan;
                 wide is theatrical.
  */
  /* How long speak() will take, without saying anything.
   *
   * Needed because a queue of lines has to be laid out BEFORE any of them
   * is spoken, and the only alternative is an estimate from the character
   * count -- which is wrong by whole seconds for a slow speaker, and puts
   * the next line on screen while the last one is still being said. Same
   * arithmetic as speak(), deliberately: if one changes the other has to. */
  speakLength(text, V = {}) {
    const rate = (V && V.rate) || 5.2;
    const syl = this._syllables(text);
    let total = 0;
    for (const S of syl) {
      const len = (1 / rate) * S.len;
      total += len;
      if (S.pause) total += len * 0.9;
    }
    return total;
  }

  speak(text, V = {}) {
    if (!this.enabled) return 0;
    const ctx = this.ensure();
    if (!ctx) return 0;
    const now = ctx.currentTime;

    const pitch = V.pitch || 130;
    const tract = V.tract || 1;
    const rasp = V.rasp || 0;
    const breath = V.breath || 0;
    const rate = V.rate || 5.2;
    const swing = V.swing != null ? V.swing : 0.14;
    const vol = (V.volume != null ? V.volume : 1) * 0.16;

    /* Turn the written line into something to say. Real speech is not
       needed and is not wanted -- the subtitle carries the words. What is
       needed is the right NUMBER of syllables with the right shapes, so
       the rhythm matches the sentence being read. */
    const syl = this._syllables(text);
    if (!syl.length) return 0;

    const out = ctx.createGain();
    out.gain.value = vol;
    out.connect(this.master);

    /* A telephone or a radio is a band, not a voice: everything outside
       300-3000 Hz is simply not there, and that missing bottom is most of
       what makes a radio sound like a radio. */
    let sink = out;
    if (V.radio) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 480; hp.Q.value = 0.9;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.9;
      const drive = ctx.createWaveShaper();
      const curve = new Float32Array(257);
      for (let i = 0; i <= 256; i++) {
        const x = i / 128 - 1;
        curve[i] = Math.tanh(x * 2.6) * 0.85;
      }
      drive.curve = curve;
      hp.connect(lp).connect(drive).connect(out);
      sink = hp;
    }

    let t = now;
    let total = 0;
    for (let i = 0; i < syl.length; i++) {
      const S = syl[i];
      const len = (1 / rate) * S.len;
      // A falling contour across the sentence, with a lift at a question.
      const frac = i / Math.max(1, syl.length - 1);
      const shape = V.rise ? frac : (1 - frac * 0.75);
      const f0 = pitch * (1 + (shape - 0.5) * swing * 2)
        * (1 + (Math.random() - 0.5) * (0.03 + rasp * 0.16));

      if (S.stop) {
        // A plosive: silence, then a click. The silence is the sound.
        t += len * 0.45;
        const cl = ctx.createBufferSource();
        cl.buffer = this._noiseBuffer(0.03);
        const cf = ctx.createBiquadFilter();
        cf.type = 'bandpass';
        cf.frequency.value = 1400 / tract; cf.Q.value = 0.8;
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.9, t);
        cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
        cl.connect(cf).connect(cg).connect(sink);
        cl.start(t); cl.stop(t + 0.04);
        t += len * 0.55;
        total += len;
        continue;
      }

      /* The voiced part. A sawtooth is a decent glottal source -- it has
         the harmonic series a vocal fold does -- and the formants pick
         three of those harmonics out of it. */
      const src = ctx.createOscillator();
      src.type = 'sawtooth';
      src.frequency.setValueAtTime(f0, t);
      src.frequency.linearRampToValueAtTime(f0 * (0.94 + Math.random() * 0.1), t + len);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.9, t + len * 0.16);
      env.gain.setValueAtTime(0.9, t + len * 0.55);
      env.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(env);

      // Three formants. Their frequencies are the vowel; the tract scales
      // all of them together, which is body size.
      for (let k = 0; k < 3; k++) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = S.f[k] / tract;
        bp.Q.value = [7, 9, 11][k];
        const g = ctx.createGain();
        g.gain.value = [1, 0.55, 0.22][k];
        env.connect(bp).connect(g).connect(sink);
      }
      src.start(t); src.stop(t + len + 0.02);

      // Breath: unvoiced air through the same formants.
      if (breath > 0) {
        const air = ctx.createBufferSource();
        air.buffer = this._noiseBuffer(len + 0.02);
        const af = ctx.createBiquadFilter();
        af.type = 'bandpass';
        af.frequency.value = S.f[1] / tract; af.Q.value = 1.2;
        const ag = ctx.createGain();
        ag.gain.setValueAtTime(0.0001, t);
        ag.gain.exponentialRampToValueAtTime(breath * 0.5, t + len * 0.2);
        ag.gain.exponentialRampToValueAtTime(0.0001, t + len);
        air.connect(af).connect(ag).connect(sink);
        air.start(t); air.stop(t + len + 0.02);
      }

      // A fricative on the way out of the syllable: s, f, sh.
      if (S.fric) {
        const fr = ctx.createBufferSource();
        fr.buffer = this._noiseBuffer(0.07);
        const ff = ctx.createBiquadFilter();
        ff.type = 'highpass';
        ff.frequency.value = S.fric === 's' ? 4200 : 2200;
        const fg = ctx.createGain();
        fg.gain.setValueAtTime(0.0001, t + len * 0.7);
        fg.gain.exponentialRampToValueAtTime(0.45, t + len * 0.8);
        fg.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.05);
        fr.connect(ff).connect(fg).connect(sink);
        fr.start(t + len * 0.7); fr.stop(t + len + 0.07);
      }

      t += len;
      total += len;
      if (S.pause) { t += len * 0.9; total += len * 0.9; }
    }
    return total;
  }

  /* The written line, turned into syllables to say.
   *
   * Not a pronunciation dictionary -- the subtitle already carries the
   * words. What this needs to get right is the RHYTHM: the same number of
   * beats as the sentence has, stresses in roughly the right places, and
   * the punctuation heard as pauses. Vowel letters choose the formant
   * pair, so a line with a lot of "ee" in it sounds brighter than one full
   * of "oh", which is enough to stop every line sounding identical.
   */
  _syllables(text) {
    // F1/F2/F3 for the vowels, in Hz, for a neutral adult tract.
    const VOW = {
      a: [730, 1090, 2440], e: [530, 1840, 2480], i: [390, 1990, 2550],
      o: [570, 840, 2410], u: [440, 1020, 2240], y: [440, 1700, 2400],
    };
    const out = [];
    const words = String(text).toLowerCase().split(/\s+/).filter(Boolean);
    for (let w = 0; w < words.length; w++) {
      const word = words[w];
      const ends = /[.!?,;:]$/.test(word);
      const letters = word.replace(/[^a-z]/g, '');
      if (!letters) continue;
      let made = 0;
      for (let i = 0; i < letters.length; i++) {
        const c = letters[i];
        if (!VOW[c]) continue;
        // Run of vowels counts once.
        if (i > 0 && VOW[letters[i - 1]]) continue;
        const nxt = letters[i + 1] || '';
        out.push({
          f: VOW[c],
          len: 0.75 + (made === 0 ? 0.35 : 0),          // first syllable stressed
          fric: (nxt === 's' || nxt === 'z') ? 's' : (nxt === 'f' || nxt === 'h') ? 'f' : null,
          stop: false,
          pause: false,
        });
        made++;
      }
      // A word with no vowel in it at all still takes a beat.
      if (!made) out.push({ f: VOW.u, len: 0.7, fric: null, stop: false, pause: false });
      // Plosives between words give speech its edges.
      if (/^[bdgkpt]/.test(letters) && out.length > 1) out[out.length - 1].stop = false;
      if (ends && out.length) out[out.length - 1].pause = true;
    }
    // Long lines are trimmed: past about twenty syllables it stops being a
    // line of dialogue and starts being a monologue nobody waits through.
    return out.slice(0, 22);
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
