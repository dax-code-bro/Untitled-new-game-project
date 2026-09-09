/* ============================================================
   GAMEPAD

   The browser hands you a flat array of button objects and a
   flat array of axes, polled rather than evented, with no edge
   detection, no deadzone, no rumble helper and a "standard
   mapping" that most pads honour and some do not. This turns
   that into something a game can actually be built on.

   Three things here are worth stating because getting them
   wrong is what makes a pad feel bad rather than look broken:

   The deadzone is radial, not per-axis. A deadzone applied to
   each axis separately cuts a square hole out of the middle of
   a round stick, so pushing diagonally at low deflection gives
   you movement on one axis and nothing on the other, and the
   character snaps to the compass points. Taking the magnitude
   of the vector, subtracting the deadzone from that and
   rescaling what is left back to 0..1 keeps the direction the
   player is actually pointing and keeps the full range of
   speeds available.

   Look is exponential, not linear. A stick pushed halfway
   should turn you slowly enough to track a deer at two hundred
   metres, and pushed fully should turn you fast enough to
   check behind you. One linear mapping cannot do both, so the
   normalised deflection is raised to a power before it becomes
   a turn rate.

   Look is a rate, movement is a position. Holding the right
   stick over turns you continuously — the value is degrees per
   second and has to be multiplied by the frame time. Holding
   the left stick over does not walk you continuously faster;
   the value is how far the stick is pushed. Treating either
   like the other is the single most common gamepad bug.
   ============================================================ */

/* Indices into the standard mapping. These are positions on the pad, not
   printed labels: button 0 is always the bottom face button, whatever a
   given manufacturer has written on it. The labels live in PAD_LAYOUT. */
const PAD_BUTTON = {
  a: 0, b: 1, x: 2, y: 3,
  lb: 4, rb: 5, lt: 6, rt: 7,
  back: 8, start: 9, ls: 10, rs: 11,
  up: 12, down: 13, left: 14, right: 15,
  guide: 16,
};

/* Aliases, so a game can say `rt` or `r2` and mean the same trigger. */
const PAD_ALIAS = {
  cross: 'a', circle: 'b', square: 'x', triangle: 'y',
  l1: 'lb', r1: 'rb', l2: 'lt', r2: 'rt',
  l3: 'ls', r3: 'rs', share: 'back', options: 'start', select: 'back',
  create: 'back', menu: 'start', view: 'back', ps: 'guide', home: 'guide',
  dpadup: 'up', dpaddown: 'down', dpadleft: 'left', dpadright: 'right',
};

/* What to print on screen for each position, by pad family. Nintendo's
   physical A and B sit where an Xbox pad's B and A sit, which is why the
   labels have to be a per-family table rather than one set of names: the
   index is the position, the glyph is what is written there. */
const PAD_LAYOUT = {
  xbox: {
    name: 'Xbox',
    a: 'A', b: 'B', x: 'X', y: 'Y',
    lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT',
    back: 'View', start: 'Menu', ls: 'LS', rs: 'RS',
    up: '↑', down: '↓', left: '←', right: '→', guide: 'Xbox',
  },
  playstation: {
    name: 'PlayStation',
    a: '✕', b: '○', x: '□', y: '△',
    lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2',
    back: 'Create', start: 'Options', ls: 'L3', rs: 'R3',
    up: '↑', down: '↓', left: '←', right: '→', guide: 'PS',
  },
  nintendo: {
    name: 'Nintendo',
    // Physically swapped relative to Xbox: the bottom button is B.
    a: 'B', b: 'A', x: 'Y', y: 'X',
    lb: 'L', rb: 'R', lt: 'ZL', rt: 'ZR',
    back: '−', start: '+', ls: 'L3', rs: 'R3',
    up: '↑', down: '↓', left: '←', right: '→', guide: 'Home',
  },
  generic: {
    name: 'Gamepad',
    a: 'A', b: 'B', x: 'X', y: 'Y',
    lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2',
    back: 'Select', start: 'Start', ls: 'L3', rs: 'R3',
    up: '↑', down: '↓', left: '←', right: '→', guide: 'Home',
  },
};

function padFamily(id) {
  const s = String(id || '').toLowerCase();
  if (/dualsense|dualshock|playstation|\bps[345]\b|054c/.test(s)) return 'playstation';
  if (/switch|joy-con|joycon|nintendo|057e|pro controller/.test(s)) return 'nintendo';
  if (/xbox|xinput|045e|microsoft/.test(s)) return 'xbox';
  return 'generic';
}

/* Radial deadzone and response curve, returning the corrected vector and
   its magnitude. Below the deadzone it is exactly zero — a stick that does
   not centre perfectly must not creep — and at the edge it is exactly one,
   so full deflection is reachable on a worn stick. */
function padStick(x, y, deadzone, curve, outerZone) {
  const mag = Math.hypot(x, y);
  if (!(mag > deadzone)) return { x: 0, y: 0, mag: 0 };
  const outer = outerZone != null ? outerZone : 0.96;
  const n = Math.min(1, (mag - deadzone) / Math.max(1e-4, outer - deadzone));
  const shaped = curve === 1 ? n : Math.pow(n, curve);
  const k = shaped / mag;
  return { x: x * k, y: y * k, mag: shaped };
}


class Pad {
  constructor(opts = {}) {
    this.index = null;               // which slot the live pad is in
    this.id = '';
    this.family = 'generic';
    this.connected = false;
    /* True only after the player has actually touched the pad. A pad can be
       plugged in and idle while someone plays on the keyboard, and the HUD
       should not switch to button glyphs until it is being used. */
    this.active = false;
    this.lastInputAt = 0;

    this.deadzone = opts.deadzone != null ? opts.deadzone : 0.16;
    this.triggerThreshold = opts.triggerThreshold != null ? opts.triggerThreshold : 0.35;
    this.moveCurve = opts.moveCurve != null ? opts.moveCurve : 1.5;
    this.lookCurve = opts.lookCurve != null ? opts.lookCurve : 2.2;
    this.vibration = opts.vibration !== false;

    this.left = { x: 0, y: 0, mag: 0 };
    this.right = { x: 0, y: 0, mag: 0 };
    this.triggers = { lt: 0, rt: 0 };

    this._down = new Set();
    this._pressed = new Set();
    this._released = new Set();
    this._values = new Float32Array(20);
    this._rumbleUntil = 0;
    this._rumbleStrength = 0;
    this._listeners = [];

    if (typeof window !== 'undefined' && window.addEventListener) {
      const onConnect = (e) => { this._adopt(e.gamepad); };
      const onDisconnect = (e) => {
        if (e.gamepad && e.gamepad.index === this.index) {
          this.index = null; this.connected = false; this.active = false;
          this._down.clear(); this.left = { x: 0, y: 0, mag: 0 }; this.right = { x: 0, y: 0, mag: 0 };
        }
      };
      window.addEventListener('gamepadconnected', onConnect);
      window.addEventListener('gamepaddisconnected', onDisconnect);
      this._listeners.push([window, 'gamepadconnected', onConnect],
        [window, 'gamepaddisconnected', onDisconnect]);
    }
  }

  _adopt(raw) {
    if (!raw) return;
    this.index = raw.index;
    this.id = raw.id || '';
    this.family = padFamily(this.id);
    this.connected = true;
  }

  /* The live pad object. It has to be re-read from the browser every frame:
     the objects handed back by getGamepads() are snapshots in Chrome and
     live in Firefox, and holding on to one gives you stale buttons in one
     browser and not the other. */
  _raw() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    let pads;
    try { pads = navigator.getGamepads(); } catch (e) { return null; }
    if (!pads) return null;
    if (this.index != null && pads[this.index]) return pads[this.index];
    // No adopted pad, or it went away: take the first one that is connected.
    for (const p of pads) {
      if (p && p.connected !== false) { this._adopt(p); return p; }
    }
    this.connected = false;
    return null;
  }

  /* Poll once per frame, before the game reads anything. */
  poll(now) {
    this._pressed.clear();
    this._released.clear();
    const raw = this._raw();
    if (!raw) {
      if (this._down.size) { for (const b of this._down) this._released.add(b); this._down.clear(); }
      this.left = { x: 0, y: 0, mag: 0 };
      this.right = { x: 0, y: 0, mag: 0 };
      this.triggers.lt = 0; this.triggers.rt = 0;
      return this;
    }
    this.connected = true;

    const ax = raw.axes || [];
    this.left = padStick(ax[0] || 0, ax[1] || 0, this.deadzone, this.moveCurve);
    this.right = padStick(ax[2] || 0, ax[3] || 0, this.deadzone, this.lookCurve);

    const buttons = raw.buttons || [];
    let touched = this.left.mag > 0 || this.right.mag > 0;

    for (const name of Object.keys(PAD_BUTTON)) {
      const i = PAD_BUTTON[name];
      const b = buttons[i];
      /* An analogue trigger reports a value even when `pressed` is false, and
         some pads never set `pressed` on the triggers at all — so a trigger
         is down when it is pushed past the threshold, whatever the flag says. */
      const value = b ? (typeof b.value === 'number' ? b.value : (b.pressed ? 1 : 0)) : 0;
      const isTrigger = name === 'lt' || name === 'rt';
      const held = isTrigger
        ? value >= this.triggerThreshold
        : !!(b && (b.pressed || value > 0.5));
      this._values[i] = value;
      if (isTrigger) this.triggers[name] = value;

      if (held) {
        if (!this._down.has(name)) this._pressed.add(name);
        this._down.add(name);
        touched = true;
      } else if (this._down.has(name)) {
        this._down.delete(name);
        this._released.add(name);
      }
    }

    if (touched) {
      this.active = true;
      this.lastInputAt = now || 0;
    }
    return this;
  }

  _key(name) {
    const n = String(name || '').toLowerCase();
    return PAD_ALIAS[n] || n;
  }

  down(name) { return this._down.has(this._key(name)); }
  justPressed(name) { return this._pressed.has(this._key(name)); }
  justReleased(name) { return this._released.has(this._key(name)); }
  /* 0..1 for a trigger, 0 or 1 for a digital button. */
  value(name) {
    const k = this._key(name);
    const i = PAD_BUTTON[k];
    return i == null ? 0 : this._values[i];
  }
  get anyPressed() { return this._pressed.size > 0; }

  /* What to print for a button, in this pad's own language. */
  glyph(name) {
    const layout = PAD_LAYOUT[this.family] || PAD_LAYOUT.generic;
    return layout[this._key(name)] || String(name).toUpperCase();
  }
  get layoutName() { return (PAD_LAYOUT[this.family] || PAD_LAYOUT.generic).name; }

  /* Turn rate in radians for this frame: deflection shaped by the curve,
     times a sensitivity in radians per second, times the frame time. */
  lookDelta(dt, sensitivity = 3.2, invertY = false) {
    if (!this.right.mag) return { yaw: 0, pitch: 0 };
    return {
      yaw: -this.right.x * sensitivity * dt,
      pitch: (invertY ? -1 : 1) * this.right.y * sensitivity * dt,
    };
  }

  /* Rumble. Louder or longer wins: a heartbeat must not cut off the
     recoil of a rifle, and a rifle should override a heartbeat. */
  rumble(strength = 0.5, seconds = 0.2, opts = {}) {
    if (!this.vibration) return false;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    if (now < this._rumbleUntil && strength < this._rumbleStrength) return false;
    const raw = this._raw();
    const act = raw && (raw.vibrationActuator
      || (raw.hapticActuators && raw.hapticActuators[0]));
    if (!act || !act.playEffect) return false;
    const s = Math.max(0, Math.min(1, strength));
    this._rumbleUntil = now + seconds;
    this._rumbleStrength = s;
    try {
      act.playEffect('dual-rumble', {
        startDelay: 0,
        duration: Math.round(seconds * 1000),
        // The heavy motor carries impact, the light one carries texture.
        strongMagnitude: opts.strong != null ? opts.strong : s,
        weakMagnitude: opts.weak != null ? opts.weak : s * 0.6,
      });
    } catch (e) {
      return false;
    }
    return true;
  }

  stopRumble() {
    const raw = this._raw();
    const act = raw && raw.vibrationActuator;
    if (act && act.reset) { try { act.reset(); } catch (e) { /* not supported */ } }
    this._rumbleUntil = 0;
    this._rumbleStrength = 0;
  }

  dispose() {
    this.stopRumble();
    for (const [t, type, fn] of this._listeners) t.removeEventListener(type, fn);
    this._listeners.length = 0;
  }
}
