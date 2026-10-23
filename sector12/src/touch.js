// Touch controls for phones and tablets.
//
// Left side: a floating move stick (it appears where your thumb lands; push it to the rim to sprint).
// Right side: drag anywhere to look. Buttons: fire (you can keep dragging to aim while holding it),
// aim (toggle), jump, crouch, reload, use (appears when there's something to interact with), and a
// top bar for weapon swap, quick-heal, ammo type, inventory, map and pause. Everything feeds the same
// input object the keyboard and mouse use, so the game itself doesn't know the difference.

export const isTouchDevice = () => {
  try {
    const q = new URLSearchParams(location.search);
    if (q.has('touch')) return true;
    if (q.has('mouse')) return false;
    return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  } catch (e) { return false; }
};

const LOOK = 2.2;      // look speed multiplier for finger drags (on top of the sensitivity setting)
const STICK_R = 56;    // px: full deflection

export class TouchControls {
  // opts: {input, getGame, pause, audio}
  constructor(opts) {
    this.o = opts;
    this.input = opts.input;
    this.touches = new Map(); // identifier -> {role, x, y, ox, oy, code}
    this.aimOn = false;
    document.body.classList.add('touch');
    this.build();
    this.input.stick = null;
    requestAnimationFrame(() => this.tick());
  }

  build() {
    const root = (this.root = document.createElement('div'));
    root.id = 'touchui';
    root.className = 'hidden';
    root.innerHTML = `
      <div id="t-look"></div>
      <div id="t-stickzone"></div>
      <div id="t-stick" class="off"><i></i></div>
      <div id="t-top">
        <button data-k="KeyQ" aria-label="Swap weapon">SWAP</button>
        <button data-k="KeyF" aria-label="Quick heal">HEAL</button>
        <button data-k="KeyT" aria-label="Switch ammo type">AMMO</button>
        <button data-k="Tab" aria-label="Inventory">BAG</button>
        <button data-k="KeyM" aria-label="Map">MAP</button>
        <button data-act="pause" aria-label="Pause">II</button>
      </div>
      <button id="t-close" data-act="close" class="hidden">✕ CLOSE</button>
      <button id="t-fire" data-fire="1" aria-label="Fire">FIRE</button>
      <button id="t-fire2" data-fire="1" aria-label="Fire">FIRE</button>
      <button id="t-aim" data-act="aim" aria-label="Aim">AIM</button>
      <button id="t-jump" data-k="Space" aria-label="Jump">JUMP</button>
      <button id="t-crouch" data-k="KeyC" aria-label="Crouch">CROUCH</button>
      <button id="t-reload" data-k="KeyR" aria-label="Reload">RELOAD</button>
      <button id="t-pump" data-k="KeyV" class="hidden" aria-label="Pump">PUMP</button>
      <button id="t-use" data-k="KeyE" class="hidden" aria-label="Use">USE</button>
    `;
    document.body.appendChild(root);
    this.stickEl = root.querySelector('#t-stick');
    this.knob = this.stickEl.querySelector('i');
    const opt = { passive: false };
    root.addEventListener('touchstart', (e) => this.start(e), opt);
    root.addEventListener('touchmove', (e) => this.move(e), opt);
    root.addEventListener('touchend', (e) => this.end(e), opt);
    root.addEventListener('touchcancel', (e) => this.end(e), opt);
    // panels (inventory, terminal, loot) are tapped like a mouse; just keep the page from scrolling
    document.addEventListener('touchmove', (e) => { if (!e.target.closest || !e.target.closest('#panel, #title, #pause')) e.preventDefault(); }, opt);
    this.rotate = document.createElement('div');
    this.rotate.id = 'rotate';
    this.rotate.innerHTML = '<div><b>Turn your phone sideways</b><br>Sector 12 plays in landscape.</div>';
    document.body.appendChild(this.rotate);
  }

  show(v) { this.root.classList.toggle('hidden', !v); if (!v) this.reset(); }

  reset() {
    for (const t of this.touches.values()) if (t.code) this.input.keys[t.code] = false;
    this.touches.clear();
    this.input.lmb = false;
    this.input.stick = null;
    this.stickEl.classList.add('off');
  }

  get game() { return this.o.getGame(); }

  press(code) {
    const g = this.game;
    if (!g || g.paused) return;
    this.input.keys[code] = true;
    this.input.pressed.add(code);
    g.onKey(code);
  }

  start(e) {
    e.preventDefault();
    if (this.o.audio) this.o.audio.init();
    const g = this.game;
    for (const t of e.changedTouches) {
      const el = document.elementFromPoint(t.clientX, t.clientY) || e.target;
      const btn = el.closest ? el.closest('button') : null;
      const rec = { x: t.clientX, y: t.clientY, ox: t.clientX, oy: t.clientY, role: 'look' };
      if (btn && btn.dataset.fire) { rec.role = 'fire'; this.input.lmb = true; btn.classList.add('on'); rec.btn = btn; }
      else if (btn && btn.dataset.k) { rec.role = 'button'; rec.code = btn.dataset.k; rec.btn = btn; btn.classList.add('on'); this.press(rec.code); }
      else if (btn && btn.dataset.act) {
        rec.role = 'button'; rec.btn = btn; btn.classList.add('on');
        const a = btn.dataset.act;
        if (a === 'pause') this.o.pause();
        else if (a === 'aim') { this.aimOn = !this.aimOn; this.input.rmb = this.aimOn; }
        else if (a === 'close' && g) { if (g.mapOpen) g.onKey('KeyM'); else if (g.ui) g.closeUI(); }
      } else if (t.clientX < innerWidth * 0.42 && t.clientY > innerHeight * 0.25 && ![...this.touches.values()].some((r) => r.role === 'stick')) {
        rec.role = 'stick';
        this.stickEl.classList.remove('off');
        this.stickEl.style.left = `${t.clientX}px`; this.stickEl.style.top = `${t.clientY}px`;
        this.knob.style.transform = 'translate(-50%, -50%)';
        this.input.stick = { x: 0, y: 0, sprint: false };
      }
      this.touches.set(t.identifier, rec);
    }
  }

  move(e) {
    e.preventDefault();
    const g = this.game;
    for (const t of e.changedTouches) {
      const r = this.touches.get(t.identifier);
      if (!r) continue;
      const dx = t.clientX - r.x, dy = t.clientY - r.y;
      r.x = t.clientX; r.y = t.clientY;
      if (r.role === 'stick') {
        let sx = (t.clientX - r.ox) / STICK_R, sy = (t.clientY - r.oy) / STICK_R;
        const l = Math.hypot(sx, sy);
        if (l > 1) { sx /= l; sy /= l; }
        this.input.stick = { x: sx, y: -sy, sprint: l > 1.25 && -sy > 0.6 };
        this.knob.style.transform = `translate(calc(-50% + ${sx * STICK_R}px), calc(-50% + ${sy * STICK_R}px))`;
        this.stickEl.classList.toggle('sprint', this.input.stick.sprint);
      } else if ((r.role === 'look' || r.role === 'fire') && g && !g.ui && !g.paused) {
        this.input.mdx += dx * LOOK;
        this.input.mdy += dy * LOOK;
      }
    }
  }

  end(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const r = this.touches.get(t.identifier);
      if (!r) continue;
      this.touches.delete(t.identifier);
      if (r.btn) r.btn.classList.remove('on');
      if (r.role === 'fire' && ![...this.touches.values()].some((x) => x.role === 'fire')) this.input.lmb = false;
      if (r.role === 'button' && r.code) this.input.keys[r.code] = false;
      if (r.role === 'stick') { this.input.stick = null; this.stickEl.classList.add('off'); this.stickEl.classList.remove('sprint'); }
    }
  }

  // context buttons: USE when there's something to interact with, PUMP on the Patriot, CLOSE over panels
  tick() {
    requestAnimationFrame(() => this.tick());
    const g = this.game;
    if (!g) return;
    const $ = (id) => this.root.querySelector(id);
    const use = $('#t-use');
    const f = g.focus;
    use.classList.toggle('hidden', !f || !!g.ui);
    if (f && f.label) use.textContent = f.label.length > 18 ? 'USE' : f.label.toUpperCase();
    const d = g.player && g.player.heldDef;
    $('#t-pump').classList.toggle('hidden', !(d && d.tube));
    const panel = !!g.ui || !!g.mapOpen;
    $('#t-close').classList.toggle('hidden', !panel);
    this.root.classList.toggle('panel', panel);
    if (panel) this.input.lmb = false; else this.input.rmb = this.aimOn;
    // aim toggle drops when you sprint or swap
    if (this.aimOn && g.player && g.player.sprinting) { this.aimOn = false; this.input.rmb = false; }
    $('#t-aim').classList.toggle('on', this.aimOn);
  }
}
