// Arsenal / gun store: browse every weapon and attachment, buy, equip, mod.
// Open with B or the store button on the HUD. The game pauses while it is open.
import { WEAPONS, CATEGORIES, ATTACHMENTS } from '../entities/arsenal.js';

const CSS = `
#arsenal{position:fixed;inset:0;z-index:40;display:none;background:rgba(8,6,5,.88);backdrop-filter:blur(6px);color:#f3e9da;font:14px Inter,system-ui,sans-serif}
#arsenal.show{display:flex;flex-direction:column}
#arsenal header{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid #3a2c22}
#arsenal h2{font:400 26px Anton,Impact,sans-serif;letter-spacing:.04em;margin:0;flex:1}
#arsenal .money{font:400 22px Anton,Impact,sans-serif;color:#7ee08a}
#arsenal .tabs{display:flex;gap:6px;padding:10px 18px;overflow-x:auto}
#arsenal .tabs button,#arsenal .row button,#arsenal header button{background:#2a201a;color:#f3e9da;border:1px solid #4a382b;border-radius:8px;padding:8px 12px;font:600 13px Inter,sans-serif;cursor:pointer;white-space:nowrap}
#arsenal .tabs button.on{background:#e2572b;border-color:#e2572b}
#arsenal .list{flex:1;overflow-y:auto;padding:4px 18px 24px}
#arsenal .row{display:grid;grid-template-columns:minmax(150px,1.4fr) repeat(4,minmax(60px,1fr)) 92px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #2a201a}
#arsenal .row .n b{display:block}#arsenal .row .n small{color:#b9a58f}
#arsenal .bar{height:6px;background:#2a201a;border-radius:3px;overflow:hidden}#arsenal .bar i{display:block;height:100%;background:#e8a33d}
#arsenal .lbl{font-size:10px;color:#a8957f;text-transform:uppercase;letter-spacing:.06em}
#arsenal .row button.own{background:#1f3a24;border-color:#2f6a3a}
@media (max-width:640px){#arsenal .row{grid-template-columns:1fr 1fr 80px}#arsenal .row .s2,#arsenal .row .s3{display:none}}
#arsenalBtn{position:fixed;right:16px;top:150px;z-index:20;background:rgba(20,14,10,.7);color:#fff;border:1px solid #4a382b;border-radius:10px;padding:6px 10px;font:600 13px Inter,sans-serif;cursor:pointer}
`;

export class ArsenalUI {
  // game: { combat, getMoney(), spend(n), pause(bool) }
  constructor(game) {
    this.g = game;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.el = document.createElement('div'); this.el.id = 'arsenal';
    this.el.innerHTML = `<header><h2>ARSENAL · Calvera Arms Exchange</h2><span class="money"></span><button data-close>Close (B)</button></header><div class="tabs"></div><div class="list"></div>`;
    document.body.appendChild(this.el);
    this.btn = document.createElement('button'); this.btn.id = 'arsenalBtn'; this.btn.textContent = '🛒 Arsenal';
    this.btn.style.display = 'none';
    document.body.appendChild(this.btn);
    this.btn.addEventListener('click', () => this.toggle());
    this.el.querySelector('[data-close]').addEventListener('click', () => this.toggle(false));
    this.tab = 'pistol';
    const tabs = this.el.querySelector('.tabs');
    for (const c of [...CATEGORIES, { k: 'att', label: 'Attachments', ids: ATTACHMENTS }]) {
      const b = document.createElement('button'); b.textContent = `${c.label} (${c.ids.length})`; b.dataset.k = c.k;
      b.addEventListener('click', () => { this.tab = c.k; this.render(); });
      tabs.appendChild(b);
    }
    this.el.querySelector('.list').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]'); if (!b) return;
      this.act(b.dataset.id, b.dataset.kind);
    });
    addEventListener('keydown', (e) => { if (e.code === 'KeyB' && this.enabled) this.toggle(); });
    this.open = false; this.enabled = false;
  }

  enable() { this.enabled = true; this.btn.style.display = 'block'; }

  toggle(force) {
    this.open = force ?? !this.open;
    this.el.classList.toggle('show', this.open);
    this.g.pause(this.open);
    if (this.open) this.render();
  }

  act(id, kind) {
    const c = this.g.combat;
    if (kind === 'att') {
      const a = ATTACHMENTS.find((x) => x.id === id), w = c.def;
      if (!a || w.melee || !this.g.spend(a.price)) return;
      // the part replaces whatever was in that slot on the equipped weapon
      const mods = c.mods || (c.mods = {});
      const slots = mods[c.weapon] || (mods[c.weapon] = {});
      slots[a.slot] = a.id;
      const base = c.base || (c.base = {});
      if (!base[c.weapon]) base[c.weapon] = { ...w };
      const b = base[c.weapon];
      Object.assign(w, b);
      for (const pid of Object.values(slots)) {
        const m = ATTACHMENTS.find((x) => x.id === pid).mods;
        if (m.damage) w.damage = Math.round(w.damage * m.damage);
        if (m.spread) w.spread *= m.spread;
        if (m.range) w.range = Math.round(w.range * m.range);
        if (m.rate) w.rate *= m.rate;
        if (m.clip) w.clip = Math.round(w.clip * m.clip);
        if (m.recoil) w.recoil *= m.recoil;
        if (m.silent) w.silent = true;
        if (m.zoom) w.scope = m.zoom;
      }
    } else if (c.owned.includes(id)) {
      c.weapon = id; c.reloading = 0;
    } else if (this.g.spend(WEAPONS[id].price)) {
      c.give(id); c.weapon = id;
    }
    this.render();
  }

  render() {
    const c = this.g.combat;
    this.el.querySelector('.money').textContent = '$' + this.g.getMoney().toLocaleString('en-US');
    this.el.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.k === this.tab));
    const list = this.el.querySelector('.list');
    const bar = (v, max) => `<div class="bar"><i style="width:${Math.min(100, (v / max) * 100).toFixed(0)}%"></i></div>`;
    if (this.tab === 'att') {
      const w = c.def;
      list.innerHTML = `<p class="lbl" style="padding:10px 0">Fitting to: <b>${w.melee ? 'equip a gun first' : w.name}</b></p>` + ATTACHMENTS.map((a) => {
        const fitted = c.mods?.[c.weapon]?.[a.slot] === a.id;
        const fx = Object.entries(a.mods).map(([k, v]) => typeof v === 'number' && k !== 'zoom' && v !== 1 ? `${k} ${v > 1 ? '+' : ''}${Math.round((v - 1) * 100)}%` : k === 'zoom' ? `${v}x zoom` : k).join(' · ');
        return `<div class="row"><div class="n"><b>${a.name}</b><small>${a.slot}</small></div><div class="s1" style="grid-column:span 4"><small>${fx}</small></div>
          <button data-id="${a.id}" data-kind="att" class="${fitted ? 'own' : ''}">${fitted ? 'Fitted' : '$' + a.price.toLocaleString('en-US')}</button></div>`;
      }).join('');
      return;
    }
    const cat = CATEGORIES.find((x) => x.k === this.tab);
    const mx = (f) => Math.max(...cat.ids.map((id) => f(WEAPONS[id])));
    const mD = mx((w) => w.damage * w.pellets), mR = mx((w) => 1 / w.rate), mG = mx((w) => w.range), mP = mx((w) => (w.damage * w.pellets) / w.rate);
    list.innerHTML = cat.ids.map((id) => {
      const w = WEAPONS[id], own = c.owned.includes(id), eq = c.weapon === id;
      const dps = (w.damage * w.pellets) / w.rate;
      return `<div class="row"><div class="n"><b>${w.name}</b><small>${w.platform} · ${w.clip} rd${w.silent ? ' · silent' : ''}${w.scope ? ` · ${w.scope}x` : ''}</small></div>
        <div class="s0"><span class="lbl">Damage ${Math.round(w.damage * w.pellets)}</span>${bar(w.damage * w.pellets, mD)}</div>
        <div class="s1"><span class="lbl">Fire rate</span>${bar(1 / w.rate, mR)}</div>
        <div class="s2"><span class="lbl">Range</span>${bar(w.range, mG)}</div>
        <div class="s3"><span class="lbl">DPS ${Math.round(dps)}</span>${bar(dps, mP)}</div>
        <button data-id="${id}" class="${own ? 'own' : ''}">${eq ? 'Equipped' : own ? 'Equip' : '$' + w.price.toLocaleString('en-US')}</button></div>`;
    }).join('');
  }
}
