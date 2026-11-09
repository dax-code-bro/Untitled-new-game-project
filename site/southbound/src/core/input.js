// Keyboard + mouse, touch (virtual joystick, look pad, buttons) and gamepad.
export class Input {
  constructor(canvas, touchRoot, settings) {
    this.settings = settings;
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.look = { x: 0, y: 0 };
    this.wheel = 0;
    this.move = { x: 0, y: 0 };
    this.touchMove = { x: 0, y: 0 };
    this.touchButtons = new Set();
    this.touchPressed = new Set();
    this.lastLookTime = 0;
    this.locked = false;
    this.canvas = canvas;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    // A menu on screen (title, loading, pause, settings) always has the mouse: never capture it then, and
    // let go if a capture lands after a menu opened (click the game, then Esc/P straight away). With the
    // mouse captured, clicks go to the game, not the menu: the owner couldn't click a setting on their PC
    const menuUp = () => !!document.querySelector('.screen.show');
    canvas.addEventListener('click', () => { if (!settings.isTouch && canvas.requestPointerLock && !menuUp()) canvas.requestPointerLock(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked && menuUp()) document.exitPointerLock();
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.look.x += e.movementX; this.look.y += e.movementY; this.lastLookTime = performance.now();
    });
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    this.mouse = new Set();
    this.mousePressed = new Set();
    canvas.addEventListener('mousedown', (e) => { if (this.locked) { this.mouse.add(e.button); this.mousePressed.add(e.button); } });
    addEventListener('mouseup', (e) => this.mouse.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.touchAim = false;

    if (touchRoot) this.setupTouch(touchRoot);
  }

  setupTouch(root) {
    const stick = root.querySelector('#stick'), knob = root.querySelector('#knob'), pad = root.querySelector('#lookpad');
    let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0;
    const R = 55;
    stick.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0]; stickId = t.identifier;
      const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2;
      e.preventDefault();
    }, { passive: false });
    pad.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0]; lookId = t.identifier; lx = t.clientX; ly = t.clientY; e.preventDefault();
    }, { passive: false });
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          let dx = t.clientX - sx, dy = t.clientY - sy;
          const d = Math.hypot(dx, dy);
          if (d > R) { dx *= R / d; dy *= R / d; }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.touchMove.x = dx / R; this.touchMove.y = -dy / R;
        } else if (t.identifier === lookId) {
          this.look.x += (t.clientX - lx) * 2.2; this.look.y += (t.clientY - ly) * 2.2;
          lx = t.clientX; ly = t.clientY; this.lastLookTime = performance.now();
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { stickId = null; this.touchMove.x = this.touchMove.y = 0; knob.style.transform = ''; }
        if (t.identifier === lookId) lookId = null;
      }
    };
    addEventListener('touchend', end); addEventListener('touchcancel', end);
    // drag from the weapon button to point at a wheel slot
    this.wheelDrag = { id: null, x0: 0, y0: 0, dx: 0, dy: 0 };
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === this.wheelDrag.id) { this.wheelDrag.dx = t.clientX - this.wheelDrag.x0; this.wheelDrag.dy = t.clientY - this.wheelDrag.y0; }
    }, { passive: true });
    const endDrag = (e) => { for (const t of e.changedTouches) if (t.identifier === this.wheelDrag.id) { this.wheelDrag.id = null; this.touchButtons.delete('weapon'); } };
    addEventListener('touchend', endDrag); addEventListener('touchcancel', endDrag);
    root.querySelectorAll('[data-btn]').forEach((b) => {
      const id = b.dataset.btn;
      b.addEventListener('touchstart', (e) => {
        if (id === 'weapon') { const t = e.changedTouches[0]; Object.assign(this.wheelDrag, { id: t.identifier, x0: t.clientX, y0: t.clientY, dx: 0, dy: 0 }); }
        this.touchButtons.add(id); this.touchPressed.add(id);
        if (id === 'aim') { this.touchAim = !this.touchAim; b.classList.toggle('on', this.touchAim); }
        e.preventDefault();
      }, { passive: false });
      b.addEventListener('touchend', () => this.touchButtons.delete(id));
    });
  }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  btn(id) { return this.touchButtons.has(id); }
  btnHit(id) { return this.touchPressed.has(id); }

  // Gather everything into one action state for this frame.
  poll() {
    const k = (c) => this.keys.has(c);
    let mx = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
    let my = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
    mx += this.touchMove.x; my += this.touchMove.y;
    const a = {
      moveX: mx, moveY: my,
      sprint: k('ShiftLeft') || k('ShiftRight') || this.btn('sprint') || Math.hypot(this.touchMove.x, this.touchMove.y) > 0.92,
      walk: k('AltLeft') || k('CapsLock'),
      jump: this.hit('Space') || this.btnHit('jump'),
      handbrake: k('Space') || this.btn('jump'),
      enter: this.hit('KeyF') || this.hit('Enter') || this.btnHit('enter') || this.btnHit('interact'),
      map: this.hit('KeyM') || this.btnHit('map'),
      pause: this.hit('Escape') || this.hit('KeyP') || this.btnHit('pause'),
      camera: this.hit('KeyV'),
      horn: k('KeyH'),
      lookX: this.look.x, lookY: this.look.y,
      zoom: this.wheel,
      throttle: 0, brake: 0,
      aim: this.mouse.has(2) || this.touchAim || k('KeyE'),
      fire: this.mouse.has(0) || this.btn('fire') || k('ControlLeft'),
      firePressed: this.mousePressed.has(0) || this.btnHit('fire') || this.hit('ControlLeft'),
      // weapon wheel: held open with Tab / Q / the gun button / LB
      wheel: k('Tab') || k('KeyQ') || this.btn('weapon'),
      wheelDX: this.wheelDrag ? this.wheelDrag.dx : 0, wheelDY: this.wheelDrag ? this.wheelDrag.dy : 0, wheelTouch: !!(this.wheelDrag && this.wheelDrag.id !== null),
      wheelPrev: this.hit('KeyZ'), wheelNext: this.hit('KeyX'),
      holster: this.hit('KeyH') || this.hit('Digit1'),
      reload: this.hit('KeyR') || this.btnHit('reload'),
      interact: k('KeyF') || this.btn('interact'),
      interactHit: this.hit('KeyF') || this.btnHit('interact'),
      greet: this.hit('KeyG') || this.btnHit('greet'),
      antag: this.hit('KeyT') || this.btnHit('antag'),
    };
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const g of pads) {
      if (!g) continue;
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      a.moveX += dz(g.axes[0]); a.moveY -= dz(g.axes[1]);
      a.lookX += dz(g.axes[2]) * 14; a.lookY += dz(g.axes[3]) * 14;
      if (dz(g.axes[2]) || dz(g.axes[3])) this.lastLookTime = performance.now();
      a.throttle = Math.max(a.throttle, g.buttons[7]?.value || 0);
      a.brake = Math.max(a.brake, g.buttons[6]?.value || 0);
      if (g.buttons[0]?.pressed && !this._padA) a.jump = true;
      if (g.buttons[3]?.pressed && !this._padY) a.enter = true;
      if (g.buttons[9]?.pressed && !this._padStart) a.pause = true;
      a.handbrake = a.handbrake || g.buttons[0]?.pressed || g.buttons[5]?.pressed;
      a.sprint = a.sprint || g.buttons[10]?.pressed;
      if ((g.buttons[6]?.value || 0) > 0.5) a.aim = true;
      if ((g.buttons[7]?.value || 0) > 0.5) { a.fire = true; a.firePressed = a.firePressed || !this._padRT; }
      this._padRT = (g.buttons[7]?.value || 0) > 0.5;
      if (g.buttons[4]?.pressed) a.wheel = true; // LB: weapon wheel
      if (g.buttons[2]?.pressed && !this._padX) a.reload = true;
      this._padX = g.buttons[2]?.pressed;
      if (g.buttons[1]?.pressed) a.interact = true; // B: hold to interact
      if (g.buttons[1]?.pressed && !this._padB) a.interactHit = true;
      if (g.buttons[12]?.pressed && !this._padUp) a.greet = true;
      if (g.buttons[13]?.pressed && !this._padDn) a.antag = true;
      this._padUp = g.buttons[12]?.pressed; this._padDn = g.buttons[13]?.pressed;
      this._padB = g.buttons[1]?.pressed;
      if (g.buttons[11]?.pressed && !this._padRS) a.camera = true; // R3: camera / first person
      this._padRS = g.buttons[11]?.pressed;
      this._padA = g.buttons[0]?.pressed; this._padY = g.buttons[3]?.pressed; this._padStart = g.buttons[9]?.pressed;
    }
    a.moveX = Math.max(-1, Math.min(1, a.moveX));
    a.moveY = Math.max(-1, Math.min(1, a.moveY));
    a.throttle = Math.max(a.throttle, Math.max(0, a.moveY));
    a.brake = Math.max(a.brake, Math.max(0, -a.moveY));
    this.look.x = this.look.y = 0;
    this.wheel = 0;
    this.pressed.clear();
    this.touchPressed.clear();
    this.mousePressed.clear();
    return a;
  }
}
