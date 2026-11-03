// RDR-style weapon wheel. Hold Tab / Q (PC), hold LB (gamepad) or press and
// hold the gun button (phone) to open it; time slows down while it is open.
// Point at a slot (mouse, right stick or drag) and let go to draw that weapon.
// Scroll / Q-E / the small arrows change which weapon a slot holds.
import { WEAPONS } from '../entities/arsenal.js';
import { Combat } from '../entities/combat.js';

export const SLOTS = [
  { k: 'unarmed', label: 'Holster', icon: '✋' },
  { k: 'sidearm', label: 'Sidearm', icon: '🔫' },
  { k: 'dual', label: 'Dual sidearms', icon: '🔫🔫' },
  { k: 'long', label: 'Rifle', icon: '🪖' },
  { k: 'shotgun', label: 'Shotgun', icon: '💥' },
  { k: 'sniper', label: 'Long range', icon: '🎯' },
  { k: 'bow', label: 'Bow', icon: '🏹' },
  { k: 'heavy', label: 'Heavy', icon: '🚀' },
];

export class WeaponWheel {
  constructor(root, combat, onPick) {
    this.combat = combat;
    this.onPick = onPick;
    this.open = false;
    this.sel = 0;
    this.vx = 0; this.vy = 0;
    const el = document.createElement('div');
    el.id = 'wheel';
    const R = 150, r0 = 62;
    const seg = (i) => {
      const a0 = ((i - 0.5) / SLOTS.length) * Math.PI * 2 - Math.PI / 2 + 0.012, a1 = ((i + 0.5) / SLOTS.length) * Math.PI * 2 - Math.PI / 2 - 0.012;
      const p = (a, rr) => `${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`;
      return `M${p(a0, r0)} L${p(a0, R)} A${R},${R} 0 0 1 ${p(a1, R)} L${p(a1, r0)} A${r0},${r0} 0 0 0 ${p(a0, r0)}Z`;
    };
    el.innerHTML = `<svg viewBox="-160 -160 320 320">${SLOTS.map((s, i) => `<path class="seg" data-i="${i}" d="${seg(i)}"/>`).join('')}</svg>
      ${SLOTS.map((s, i) => { const a = (i / SLOTS.length) * Math.PI * 2 - Math.PI / 2; return `<div class="slot" data-i="${i}" style="left:${50 + Math.cos(a) * 33}%;top:${50 + Math.sin(a) * 33}%"><span class="ic">${s.icon}</span><small></small></div>`; }).join('')}
      <div class="mid"><b></b><span></span><em></em></div>
      <button class="cyc prev" aria-label="previous">‹</button><button class="cyc next" aria-label="next">›</button>`;
    root.appendChild(el);
    this.el = el;
    this.segs = [...el.querySelectorAll('.seg')];
    this.slotEls = [...el.querySelectorAll('.slot')];
    this.midB = el.querySelector('.mid b'); this.midS = el.querySelector('.mid span'); this.midE = el.querySelector('.mid em');
    el.querySelector('.prev').addEventListener('touchstart', (e) => { this.cycle(-1); e.stopPropagation(); e.preventDefault(); }, { passive: false });
    el.querySelector('.next').addEventListener('touchstart', (e) => { this.cycle(1); e.stopPropagation(); e.preventDefault(); }, { passive: false });
  }

  available(i) {
    const k = SLOTS[i].k;
    if (k === 'unarmed') return true;
    if (k === 'dual') return this.combat.ownedIn('sidearm').length >= 1;
    return this.combat.ownedIn(k).length > 0;
  }

  show() {
    if (this.open) return;
    this.open = true; this.vx = this.vy = 0;
    const c = this.combat;
    // start on what's in your hands
    const cur = c.holstered ? 'unarmed' : c.dual ? 'dual' : Combat.slotOf(c.weapon);
    this.sel = Math.max(0, SLOTS.findIndex((s) => s.k === cur));
    this.el.classList.add('show');
    this.render();
  }
  hide(pick = true) {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('show');
    if (pick && this.available(this.sel)) {
      const k = SLOTS[this.sel].k;
      this.onPick(k === 'dual' ? 'sidearm' : k, k === 'dual');
    }
  }
  // pointer / stick movement selects a slot by direction
  point(dx, dy, absolute = false) {
    if (absolute) { this.vx = dx; this.vy = dy; } else { this.vx = Math.max(-140, Math.min(140, this.vx + dx)); this.vy = Math.max(-140, Math.min(140, this.vy + dy)); }
    if (Math.hypot(this.vx, this.vy) < 22) return;
    const a = Math.atan2(this.vy, this.vx) + Math.PI / 2;
    const i = ((Math.round((a / (Math.PI * 2)) * SLOTS.length) % SLOTS.length) + SLOTS.length) % SLOTS.length;
    if (i !== this.sel) { this.sel = i; this.render(); }
  }
  // change the weapon held in the selected slot
  cycle(dir) {
    const k = SLOTS[this.sel].k === 'dual' ? 'sidearm' : SLOTS[this.sel].k;
    const list = this.combat.ownedIn(k);
    if (list.length < 2) return;
    const cur = this.combat.slotWeapon(k);
    this.combat.slots[k] = list[(list.indexOf(cur) + dir + list.length) % list.length];
    this.render();
  }

  render() {
    const c = this.combat;
    SLOTS.forEach((s, i) => {
      const ok = this.available(i);
      this.segs[i].classList.toggle('on', i === this.sel);
      this.segs[i].classList.toggle('off', !ok);
      this.slotEls[i].classList.toggle('off', !ok);
      const k = s.k === 'dual' ? 'sidearm' : s.k;
      const id = k === 'unarmed' ? null : c.slotWeapon(k);
      const n = k === 'unarmed' ? '' : c.ownedIn(k).length;
      this.slotEls[i].querySelector('small').textContent = s.k === 'unarmed' ? 'Holster' : id ? (n > 1 ? `${n} owned` : '1 owned') : 'empty';
    });
    const s = SLOTS[this.sel], k = s.k === 'dual' ? 'sidearm' : s.k;
    const id = k === 'unarmed' ? null : c.slotWeapon(k);
    const w = id ? WEAPONS[id] : null;
    this.midB.textContent = s.k === 'unarmed' ? 'Holster weapons' : w ? (s.k === 'dual' ? 'Dual · ' : '') + w.name : s.label;
    const a = id ? c.ammo[id] : null;
    this.midS.textContent = w && a ? `${a.clip} / ${a.reserve}` : s.k === 'unarmed' ? 'hands free · cops won’t open fire' : 'none owned';
    this.midE.textContent = w && c.ownedIn(k).length > 1 ? 'scroll or ‹ › to switch' : '';
  }
}
