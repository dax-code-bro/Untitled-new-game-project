// Gun store: what you see after telling the gunsmith "I'm interested in buying
// something". Left: categories and a scrolling list (grey silhouette, firing
// mode, a line about the gun, price). Right: the gun itself, spinning (drag to
// turn it), its stats, and buying / customising (attachments, ammo, skins,
// paint, custom colour). You can own up to three of the same gun; some guns
// unlock as the story goes on.
import * as THREE from 'three';
import { WEAPONS, CATEGORIES, ATTACHMENTS, SKINS, buildWeaponModel, applyFinish } from '../entities/arsenal.js';

const CSS = `
#gunstore{position:fixed;inset:0;z-index:45;display:none;background:radial-gradient(ellipse at 70% 40%,rgba(40,32,26,.94),rgba(8,7,6,.97));color:#eee6da;font:14px Inter,system-ui,sans-serif}
#gunstore.show{display:grid;grid-template-rows:auto auto 1fr}
#gunstore header{display:flex;align-items:center;gap:14px;padding:14px 22px 6px}
#gunstore h2{margin:0;font:400 28px Anton,Impact,sans-serif;letter-spacing:.05em;flex:1}
#gunstore h2 small{display:block;font:500 11px Inter,sans-serif;letter-spacing:.2em;color:#c9a96a;text-transform:uppercase;margin-top:2px}
#gunstore .money{font:400 24px Anton,Impact,sans-serif;color:#86e08f}
#gunstore button{background:rgba(255,255,255,.06);color:#eee6da;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:8px 13px;font:600 13px Inter,sans-serif;cursor:pointer}
#gunstore button:hover{background:rgba(255,255,255,.12)}
#gunstore button.go{background:#c2402a;border-color:#c2402a}#gunstore button.go:disabled{opacity:.4;cursor:default}
#gunstore .tabs{display:flex;gap:6px;padding:6px 22px 10px;overflow-x:auto;border-bottom:1px solid rgba(255,255,255,.08)}
#gunstore .tabs button.on{background:#eee6da;color:#151210;border-color:#eee6da}
#gunstore .body{display:grid;grid-template-columns:minmax(300px,42%) 1fr;min-height:0}
#gunstore .list{overflow-y:auto;padding:8px 10px 24px 22px}
#gunstore .item{display:grid;grid-template-columns:118px 1fr auto;gap:12px;align-items:center;padding:10px 10px;border-radius:10px;cursor:pointer;border:1px solid transparent}
#gunstore .item:hover,#gunstore .item.sel{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.1)}
#gunstore .item img{width:118px;height:40px;object-fit:contain;opacity:.85}
#gunstore .item b{display:block;font-size:14px}#gunstore .item small{display:block;color:#b8a892;font-size:11.5px;margin-top:2px}
#gunstore .item .p{font:400 17px Anton,Impact,sans-serif;color:#e8d3a8;text-align:right}
#gunstore .item.lock{opacity:.55}#gunstore .item .own{color:#86e08f;font:600 11px Inter,sans-serif;display:block;text-align:right}
#gunstore .item .desc{grid-column:2/4;color:#cfc2b0;font-size:12px;line-height:1.4;display:none}
#gunstore .item:hover .desc,#gunstore .item.sel .desc{display:block}
#gunstore .side{display:grid;grid-template-rows:minmax(200px,46%) auto 1fr;min-height:0;border-left:1px solid rgba(255,255,255,.08)}
#gunstore canvas.view{width:100%;height:100%;display:block;cursor:grab;touch-action:none}
#gunstore .info{padding:10px 22px}
#gunstore .info h3{margin:0;font:400 24px Anton,Impact,sans-serif;letter-spacing:.03em}
#gunstore .info .tags{color:#c9a96a;font:600 11px Inter,sans-serif;letter-spacing:.12em;text-transform:uppercase;margin:4px 0 8px}
#gunstore .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 18px;margin:6px 0 10px}
#gunstore .stat span{font-size:10.5px;color:#b8a892;text-transform:uppercase;letter-spacing:.08em}
#gunstore .stat i{display:block;height:5px;border-radius:3px;background:rgba(255,255,255,.1);margin-top:3px;overflow:hidden}
#gunstore .stat i b{display:block;height:100%;background:#e0a24a}
#gunstore .acts{display:flex;gap:8px;flex-wrap:wrap}
#gunstore .cust{overflow-y:auto;padding:0 22px 22px}
#gunstore .cust h4{margin:14px 0 6px;font:600 11px Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#c9a96a}
#gunstore .chips{display:flex;flex-wrap:wrap;gap:6px}
#gunstore .chips button{padding:6px 10px;font-size:12px}#gunstore .chips button.on{border-color:#e0a24a;background:rgba(224,162,74,.18)}
#gunstore .sw{width:26px;height:26px;border-radius:50%;padding:0;border:2px solid rgba(255,255,255,.25)}
#gunstore .row2{display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:12px;color:#cfc2b0}
#gunstore input[type=range]{width:120px}
@media (max-width:760px){#gunstore .body{grid-template-columns:1fr}#gunstore .side{display:none}#gunstore .side.show{display:grid;position:fixed;inset:0;z-index:46;background:#14100d}}
`;

const STAT_MAX = { dmg: 280, pen: 5, rate: 15, range: 1200, acc: 1, mag: 60 };

export class GunStore {
  // g: { combat, career, getMoney(), spend(n), pause(b), silhouette(id, model), storyDone() }
  constructor(g) {
    this.g = g;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = this.el = document.createElement('div'); el.id = 'gunstore';
    el.innerHTML = `<header><h2></h2><span class="money"></span><button data-close>Leave</button></header><div class="tabs"></div>
      <div class="body"><div class="list"></div><div class="side"><canvas class="view"></canvas><div class="info"></div><div class="cust"></div></div></div>`;
    document.body.appendChild(el);
    el.querySelector('[data-close]').onclick = () => this.close();
    addEventListener('keydown', (e) => { if (this.open && e.code === 'Escape') { e.stopPropagation(); this.close(); } }, true);
    this.open = false; this.cat = 'pistol'; this.sel = null; this.mode = 'info';
    this.canvas = el.querySelector('canvas.view');
    // spin with mouse / finger
    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; this.canvas.setPointerCapture(e.pointerId); this.spinV = 0; });
    this.canvas.addEventListener('pointermove', (e) => { if (!drag) return; this.yaw += (e.clientX - drag.x) * 0.012; this.pitch = Math.max(-0.8, Math.min(0.8, this.pitch + (e.clientY - drag.y) * 0.008)); drag = { x: e.clientX, y: e.clientY }; });
    this.canvas.addEventListener('pointerup', () => { drag = null; this.spinV = 0.35; });
    this.canvas.addEventListener('wheel', (e) => { this.zoom = Math.max(0.6, Math.min(1.8, this.zoom + Math.sign(e.deltaY) * 0.08)); e.preventDefault(); }, { passive: false });
    this.yaw = 0.6; this.pitch = 0.12; this.zoom = 1; this.spinV = 0.35;
  }

  get P() { return this.g.career.p; }
  countOf(id) { const c = this.P.weapons.count || (this.P.weapons.count = {}); return c[id] || (this.g.combat.owned.includes(id) ? 1 : 0); }
  finishOf(id) { const f = this.P.weapons.finish || (this.P.weapons.finish = {}); return f[id] || (f[id] = {}); }
  price(w) { return Math.round((w.price * this.store.priceK) / 10) * 10; }

  show(store) {
    this.store = store;
    this.open = true;
    this.el.classList.add('show');
    this.g.pause(true);
    this.el.querySelector('h2').innerHTML = `${store.name.toUpperCase()}<small>${store.keeper} · ${store.blurb}</small>`;
    const tabs = this.el.querySelector('.tabs');
    tabs.innerHTML = '';
    const cats = CATEGORIES.filter((c) => store.cats.includes(c.k));
    for (const c of cats) {
      const n = store.ids.filter((id) => WEAPONS[id].cat === c.k).length;
      const b = document.createElement('button'); b.textContent = `${c.label} (${n})`; b.dataset.k = c.k;
      b.onclick = () => { this.cat = c.k; this.sel = null; this.mode = 'info'; this.render(); };
      tabs.appendChild(b);
    }
    if (!cats.some((c) => c.k === this.cat)) this.cat = cats[0].k;
    this.ensureViewer();
    this.render();
    const loop = () => { if (!this.open) return; this.drawViewer(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  close() { this.open = false; this.el.classList.remove('show'); this.g.pause(false); }

  ensureViewer() {
    if (this.r) return;
    this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a2018, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2, 3, 2); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffd9a0, 1.6); rim.position.set(-3, 1, -2); this.scene.add(rim);
    // soft reflections for metal
    const pm = new THREE.PMREMGenerator(this.r);
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(5, 16, 8), new THREE.MeshBasicMaterial({ color: 0x4a3c30, side: THREE.BackSide })));
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(3, 1), new THREE.MeshBasicMaterial({ color: 0xffffff })); lamp.position.set(0, 3, 0); lamp.lookAt(0, 0, 0); env.add(lamp);
    this.scene.environment = pm.fromScene(env, 0.04).texture;
    this.holder = new THREE.Group(); this.scene.add(this.holder);
  }
  setViewerGun(id) {
    if (this.viewId === id) return;
    this.viewId = id;
    this.holder.clear();
    const m = buildWeaponModel(WEAPONS[id]);
    m.position.set(0, 0, 0); m.quaternion.identity();
    applyFinish(m, this.finishOf(id));
    const b = new THREE.Box3().setFromObject(m), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    m.position.sub(c);
    this.holder.add(m);
    this.viewModel = m;
    this.viewSize = Math.max(s.x, s.y, s.z);
  }
  drawViewer() {
    if (!this.r || !this.viewModel) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this.canvas.width !== Math.round(w * devicePixelRatio)) this.r.setSize(w, h, false), this.r.setPixelRatio(Math.min(2, devicePixelRatio));
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    this.yaw += this.spinV * (1 / 60);
    const d = this.viewSize * 2.1 * this.zoom;
    this.cam.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * d, Math.sin(this.pitch) * d, Math.cos(this.yaw) * Math.cos(this.pitch) * d);
    this.cam.lookAt(0, 0, 0);
    this.r.render(this.scene, this.cam);
  }

  render() {
    const g = this.g, store = this.store;
    this.el.querySelector('.money').textContent = '$' + g.getMoney().toLocaleString('en-US');
    this.el.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.k === this.cat));
    const done = g.storyDone();
    const ids = store.ids.filter((id) => WEAPONS[id].cat === this.cat);
    if (!this.sel || !ids.includes(this.sel)) this.sel = ids[0];
    const list = this.el.querySelector('.list');
    list.innerHTML = ids.map((id) => {
      const w = WEAPONS[id], n = this.countOf(id), locked = (w.unlock || 0) > done;
      const img = g.silhouette(id);
      return `<div class="item ${id === this.sel ? 'sel' : ''} ${locked ? 'lock' : ''}" data-id="${id}">
        <img src="${img}" alt="">
        <div><b>${w.name}</b><small>${w.fireMode || ''} · ${w.caliber || ''}${w.scope ? ` · ${w.scope}x scope` : ''}</small></div>
        <div><span class="p">${locked ? '🔒' : '$' + this.price(w).toLocaleString('en-US')}</span>${n ? `<span class="own">Owned ${n}/3</span>` : ''}</div>
        <div class="desc">${w.desc || ''}${locked ? `<br><b>Unlocks after ${w.unlock} story missions</b> (you've done ${done}).` : ''}</div></div>`;
    }).join('');
    list.querySelectorAll('.item').forEach((it) => {
      it.onclick = () => { this.sel = it.dataset.id; this.mode = 'info'; this.render(); if (innerWidth < 760) this.el.querySelector('.side').classList.add('show'); };
      it.onmouseenter = () => this.setViewerGun(it.dataset.id);
    });
    this.setViewerGun(this.sel);
    this.renderSide();
  }

  renderSide() {
    const id = this.sel, w = WEAPONS[id], g = this.g;
    if (!w) return;
    const n = this.countOf(id), locked = (w.unlock || 0) > g.storyDone();
    const dmg = Math.round(w.damage * w.pellets);
    const st = [['Damage', `${Math.round(dmg * 0.8)}–${Math.round(dmg * 1.15)}`, dmg / STAT_MAX.dmg], ['Penetration', `${w.pen || 1} / 5`, (w.pen || 1) / 5], ['Fire rate', `${Math.round(60 / w.rate)} rpm`, 1 / w.rate / STAT_MAX.rate],
      ['Range', `${w.range} m`, w.range / STAT_MAX.range], ['Accuracy', '', 1 - Math.min(1, w.spread * 9)], ['Magazine', `${w.clip}`, w.clip / STAT_MAX.mag]];
    const info = this.el.querySelector('.info');
    info.innerHTML = `<h3>${w.name}</h3><div class="tags">${w.fireMode || ''} · ${w.caliber || ''} · ${w.platform}</div>
      <div class="stats">${st.map(([k, v, f]) => `<div class="stat"><span>${k} ${v}</span><i><b style="width:${Math.max(4, Math.min(100, f * 100)).toFixed(0)}%"></b></i></div>`).join('')}</div>
      <div class="acts">
        <button class="go" data-a="buy" ${locked || n >= 3 ? 'disabled' : ''}>${locked ? 'Locked' : n >= 3 ? 'You own 3 (max)' : `Buy · $${this.price(w).toLocaleString('en-US')}`}</button>
        ${n ? '<button data-a="equip">Equip</button><button data-a="cust">Customize</button>' : ''}
        ${!w.melee ? `<button data-a="ammo">Ammo · $${Math.round(this.price(w) * 0.03 + 20)}</button>` : ''}
        <button data-a="back" class="mob">Back</button>
      </div>`;
    info.querySelectorAll('button[data-a]').forEach((b) => { b.onclick = () => this.action(b.dataset.a); });
    this.renderCustom();
  }

  action(a) {
    const id = this.sel, w = WEAPONS[id], g = this.g, c = g.combat;
    if (a === 'back') { this.el.querySelector('.side').classList.remove('show'); return; }
    if (a === 'buy') {
      const n = this.countOf(id);
      if (n >= 3 || (w.unlock || 0) > g.storyDone()) return;
      // ordered remotely: the store's own hook takes the money and sends a courier
      if (this.store.deliver) { if (this.store.deliver(id, this.price(w)) === false) return; this.P.weapons.count[id] = n + 1; g.career.saveSoon(); return; }
      if (!g.spend(this.price(w))) return;
      c.give(id);
      this.P.weapons.count[id] = n + 1;
      this.mode = 'cust';
      g.toast?.(`Bought: ${w.name}${n ? ` (#${n + 1})` : ''}`);
    } else if (a === 'equip') { c.weapon = id; c.holstered = false; c.dual = false; }
    else if (a === 'cust') this.mode = this.mode === 'cust' ? 'info' : 'cust';
    else if (a === 'ammo') { if (g.spend(Math.round(this.price(w) * 0.03 + 20))) { const am = c.ammo[id] || (c.ammo[id] = { clip: w.clip, reserve: 0 }); am.reserve += w.clip * 3; } }
    g.career.saveSoon();
    this.render();
  }

  renderCustom() {
    const box = this.el.querySelector('.cust'), id = this.sel, w = WEAPONS[id], g = this.g;
    if (this.mode !== 'cust' || !this.countOf(id)) { box.innerHTML = this.mode === 'cust' ? '' : `<h4>About</h4><p style="color:#cfc2b0;line-height:1.5;margin:0">${w.desc || ''}</p>`; return; }
    const f = this.finishOf(id);
    const fitted = g.combat.mods?.[id] || {};
    const slots = [...new Set(ATTACHMENTS.map((a) => a.slot))];
    const AMMO = w.cat === 'shotgun' ? ['Buckshot', 'Birdshot', 'Slug', 'Flechette'] : w.cat === 'bow' ? ['Broadhead', 'Small game', 'Fire arrow'] : w.cat === 'launcher' ? ['HE', 'HEAT'] : ['FMJ', 'Hollow point', 'Armor piercing', 'Subsonic'];
    const ammoSel = (this.P.weapons.ammoType || {})[id] || AMMO[0];
    box.innerHTML = `
      <h4>Skins</h4><div class="chips">${SKINS.map(([n]) => `<button data-skin="${n}" class="${(f.skin || 'Factory') === n ? 'on' : ''}">${n}</button>`).join('')}</div>
      <h4>Paint</h4><div class="chips">${['#1b1b1d', '#3d3a33', '#6b5a3e', '#38422c', '#7a1d18', '#1d2f5c', '#c9c9c4', '#b48a3a'].map((c) => `<button class="sw" data-paint="${c}" style="background:${c}"></button>`).join('')}
        <label class="row2">Custom <input type="color" data-custom value="${f.paint ? '#' + new THREE.Color(...f.paint).getHexString() : '#2a2a2a'}"></label></div>
      <div class="row2" style="margin-top:8px"><label>Metal <input type="range" min="0" max="1" step="0.05" data-metal value="${f.metal ?? 0.8}"></label><label>Gloss <input type="range" min="0" max="1" step="0.05" data-gloss value="${1 - (f.rough ?? 0.35)}"></label><button data-reset>Reset</button></div>
      <h4>Ammo type</h4><div class="chips">${AMMO.map((a) => `<button data-ammo="${a}" class="${ammoSel === a ? 'on' : ''}">${a}</button>`).join('')}</div>
      ${w.melee || w.cat === 'bow' ? '' : slots.map((sl) => `<h4>${sl}</h4><div class="chips">${ATTACHMENTS.filter((a) => a.slot === sl && /^[^ ]+( [^ ]+)?$/.test(a.name) && !/Mk|Elite|Custom/.test(a.name)).map((a) => `<button data-att="${a.id}" class="${fitted[sl] === a.id ? 'on' : ''}">${a.name} · $${a.price}</button>`).join('')}</div>`).join('')}`;
    const refresh = () => { this.viewId = null; this.setViewerGun(id); g.applyFinishTo?.(id); g.career.saveSoon(); };
    box.querySelectorAll('[data-skin]').forEach((b) => { b.onclick = () => { f.skin = b.dataset.skin === 'Factory' ? null : b.dataset.skin; f.paint = null; delete f.metal; delete f.rough; refresh(); this.renderCustom(); }; });
    box.querySelectorAll('[data-paint]').forEach((b) => { b.onclick = () => { const c = new THREE.Color(b.dataset.paint); f.paint = [c.r, c.g, c.b]; refresh(); }; });
    box.querySelector('[data-custom]').oninput = (e) => { const c = new THREE.Color(e.target.value); f.paint = [c.r, c.g, c.b]; refresh(); };
    box.querySelector('[data-metal]').oninput = (e) => { f.metal = +e.target.value; refresh(); };
    box.querySelector('[data-gloss]').oninput = (e) => { f.rough = 1 - +e.target.value; refresh(); };
    box.querySelector('[data-reset]').onclick = () => { for (const k of Object.keys(f)) delete f[k]; refresh(); this.renderCustom(); };
    box.querySelectorAll('[data-ammo]').forEach((b) => { b.onclick = () => { const t = this.P.weapons.ammoType || (this.P.weapons.ammoType = {}); t[id] = b.dataset.ammo; g.combat.ammoType = g.combat.ammoType || {}; g.combat.ammoType[id] = b.dataset.ammo; g.career.saveSoon(); this.renderCustom(); }; });
    box.querySelectorAll('[data-att]').forEach((b) => { b.onclick = () => { g.fitAttachment?.(id, b.dataset.att); this.render(); }; });
  }
}
