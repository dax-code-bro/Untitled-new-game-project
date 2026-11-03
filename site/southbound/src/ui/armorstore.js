// Armour store: plate carriers and vests, helmets, bags that hide your guns,
// holsters and medical supplies. John stands on the right wearing whatever
// you're looking at (drag to turn him).
import * as THREE from 'three';
import { Human } from '../entities/human.js';
import { makeOutfitter } from '../entities/clothing.js';
import { ARMOR, HELMETS, BAGS, HOLSTERS, MEDS, wearGear } from '../entities/gear.js';

const CSS = `
#armory{position:fixed;inset:0;z-index:45;display:none;background:radial-gradient(ellipse at 72% 40%,rgba(36,36,28,.95),rgba(8,8,6,.97));color:#ece8da;font:14px Inter,system-ui,sans-serif}
#armory.show{display:grid;grid-template-rows:auto auto 1fr}
#armory header{display:flex;align-items:center;gap:14px;padding:14px 22px 6px}
#armory h2{margin:0;font:400 28px Anton,Impact,sans-serif;letter-spacing:.05em;flex:1}
#armory h2 small{display:block;font:500 11px Inter,sans-serif;letter-spacing:.2em;color:#c8b46a;text-transform:uppercase;margin-top:2px}
#armory .money{font:400 24px Anton,Impact,sans-serif;color:#86e08f}
#armory button{background:rgba(255,255,255,.06);color:#ece8da;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:8px 13px;font:600 13px Inter,sans-serif;cursor:pointer}
#armory button:hover{background:rgba(255,255,255,.12)}#armory button:disabled{opacity:.4;cursor:default}
#armory button.go{background:#6b7a2e;border-color:#6b7a2e}
#armory .tabs{display:flex;gap:6px;padding:6px 22px 10px;overflow-x:auto;border-bottom:1px solid rgba(255,255,255,.08)}
#armory .tabs button.on{background:#ece8da;color:#151510;border-color:#ece8da}
#armory .body{display:grid;grid-template-columns:minmax(330px,46%) 1fr;min-height:0}
#armory .list{overflow-y:auto;padding:10px 12px 24px 22px}
#armory .it{display:grid;grid-template-columns:1fr auto;gap:4px 12px;padding:11px 12px;border-radius:10px;border:1px solid transparent;cursor:pointer}
#armory .it:hover,#armory .it.sel{background:rgba(255,255,255,.06);border-color:rgba(200,180,106,.45)}
#armory .it b{font-size:14px}#armory .it .p{font:400 17px Anton,Impact,sans-serif;color:#e8d3a8;text-align:right}
#armory .it small{grid-column:1/3;color:#b8ae92;font-size:12px;line-height:1.4}
#armory .tag{display:inline-block;font:700 10px Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:2px 6px;border-radius:4px;margin-right:6px;background:rgba(255,255,255,.08);color:#d8cfae}
#armory .tag.lv{background:#3a4a24;color:#d9f0a8}#armory .tag.own{background:#1f3a24;color:#86e08f}
#armory .right{display:grid;grid-template-rows:1fr auto;min-height:0;border-left:1px solid rgba(255,255,255,.08)}
#armory canvas{width:100%;height:100%;display:block;cursor:grab;touch-action:none}
#armory .buy{padding:12px 22px 18px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
#armory .buy .nm{flex:1 1 100%;font:400 20px Anton,Impact,sans-serif;letter-spacing:.03em}
#armory .buy .nm small{display:block;font:500 12px Inter,sans-serif;color:#b8ae92;letter-spacing:0;margin-top:3px;line-height:1.4}
@media (max-width:760px){#armory .body{grid-template-columns:1fr;grid-template-rows:38vh 1fr}#armory .right{grid-row:1;border-left:0}#armory .list{grid-row:2}}
`;
const TABS = [
  { k: 'armor', label: 'Plate carriers & vests', list: ARMOR },
  { k: 'helmet', label: 'Helmets', list: HELMETS },
  { k: 'bag', label: 'Bags (hide your guns)', list: BAGS },
  { k: 'holster', label: 'Holsters', list: HOLSTERS.filter((h) => h.price > 0) },
  { k: 'med', label: 'Medical', list: MEDS },
];
const LV = (l) => (l >= 4 ? 'IV' : l >= 3.5 ? 'III+' : l >= 3 ? 'III' : l >= 2 ? 'IIIA' : '—');

export class ArmorStore {
  // g: { lib, career, getMoney(), spend(n), pause(b), toast(t), changed(), skinHex }
  constructor(g) {
    this.g = g;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = (this.el = document.createElement('div')); el.id = 'armory';
    el.innerHTML = `<header><h2></h2><span class="money"></span><button data-close>Leave</button></header><div class="tabs"></div>
      <div class="body"><div class="list"></div><div class="right"><canvas></canvas><div class="buy"></div></div></div>`;
    document.body.appendChild(el);
    el.querySelector('[data-close]').onclick = () => this.close();
    addEventListener('keydown', (e) => { if (this.open && e.code === 'Escape') { e.stopPropagation(); this.close(); } }, true);
    const tabs = el.querySelector('.tabs');
    for (const t of TABS) { const b = document.createElement('button'); b.textContent = t.label; b.dataset.k = t.k; b.onclick = () => { this.tab = t.k; this.sel = null; this.render(); }; tabs.appendChild(b); }
    this.canvas = el.querySelector('canvas');
    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => { drag = e.clientX; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => { if (drag == null) return; this.yaw += (e.clientX - drag) * 0.012; drag = e.clientX; });
    this.canvas.addEventListener('pointerup', () => { drag = null; });
    this.yaw = 2.6; this.tab = 'armor'; this.open = false;
  }
  get P() { return this.g.career.p; }
  show(store) {
    this.store = store; this.open = true; this.el.classList.add('show'); this.g.pause(true);
    this.el.querySelector('h2').innerHTML = `${store.name.toUpperCase()}<small>${store.keeper} · ${store.blurb}</small>`;
    this.ensureViewer(); this.render();
    const loop = (t) => { if (!this.open) return; this.draw(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  close() { this.open = false; this.el.classList.remove('show'); this.g.pause(false); }
  ensureViewer() {
    if (this.r) { this.fit.apply(this.P.outfit); return; }
    this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.r.toneMapping = THREE.AgXToneMapping; this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(28, 1, 0.05, 30);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x302820, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(1.5, 3, 2.5); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xdfe8ff, 1.3); rim.position.set(-2, 2, -2); this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshStandardMaterial({ color: 0x2a2a22, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; this.scene.add(floor);
    this.h = new Human(this.g.lib, 'hero', { alwaysVisible: true }); this.h.play('Idle_Loop', 0); this.scene.add(this.h.root);
    this.fit = makeOutfitter(this.h, this.g.skinHex); this.fit.apply(this.P.outfit);
    this.gear = wearGear(this.h, {});
  }
  draw(t) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight; if (!w || !h) return;
    if (this.canvas.width !== Math.round(w * Math.min(2, devicePixelRatio))) { this.r.setPixelRatio(Math.min(2, devicePixelRatio)); this.r.setSize(w, h, false); }
    const dt = Math.min(0.05, (t - (this.last || t)) / 1000); this.last = t;
    this.h.update(dt); this.h.root.rotation.y = this.yaw;
    const f = this.tab === 'helmet' ? [1.6, 1.1] : this.tab === 'armor' ? [1.25, 2.0] : [1.05, 3.6];
    this.camY = this.camY == null ? f[0] : this.camY + (f[0] - this.camY) * Math.min(1, dt * 6);
    this.camD = this.camD == null ? f[1] : this.camD + (f[1] - this.camD) * Math.min(1, dt * 6);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    this.cam.position.set(0, this.camY + 0.05, this.camD); this.cam.lookAt(0, this.camY, 0);
    this.r.render(this.scene, this.cam);
  }
  owned(k, id) { return (this.P.gearOwned || []).includes(k + ':' + id); }
  render() {
    const P = this.P, g = this.g, tab = TABS.find((t) => t.k === this.tab);
    this.el.querySelector('.money').textContent = '$' + g.getMoney().toLocaleString('en-US');
    this.el.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.k === this.tab));
    if (!this.sel || !tab.list.some((x) => x.id === this.sel)) this.sel = tab.list[0].id;
    const it = tab.list.find((x) => x.id === this.sel), k = this.store.priceK || 1;
    const price = (x) => Math.round((x.price * k) / 5) * 5;
    const spec = (x) => {
      if (this.tab === 'armor') return `<span class="tag lv">${x.level ? 'Level ' + LV(x.level) : 'No armour'}</span><span class="tag">${x.weight} kg</span>${x.hidden ? '<span class="tag">concealable</span>' : ''}`;
      if (this.tab === 'helmet') return `<span class="tag lv">${x.level ? 'Level ' + LV(x.level) : 'Not ballistic'}</span>`;
      if (this.tab === 'bag') return `<span class="tag lv">hides ${x.slots} gun${x.slots > 1 ? 's' : ''}</span><span class="tag">up to ${Math.round(x.len * 100)} cm</span>`;
      if (this.tab === 'holster') return `<span class="tag lv">${{ untucked: 'untucked shirt or jacket', jacket: 'under a jacket', 'long-pants': 'under long pants' }[x.conceal]}</span>`;
      return `<span class="tag lv">carrying ${P.med?.[x.id] || 0} / ${x.max}</span>`;
    };
    const ownTag = (x) => this.tab !== 'med' && this.owned(this.tab, x.id) ? `<span class="tag own">${P.gear?.[this.tab] === x.id ? 'wearing' : 'owned'}</span>` : '';
    this.el.querySelector('.list').innerHTML = tab.list.map((x) => `<div class="it ${x.id === this.sel ? 'sel' : ''}" data-id="${x.id}"><b>${x.name}</b><span class="p">$${price(x).toLocaleString('en-US')}</span><small>${ownTag(x)}${spec(x)}<br>${x.desc}</small></div>`).join('');
    this.el.querySelectorAll('.it').forEach((e) => { e.onclick = () => { this.sel = e.dataset.id; this.render(); }; });
    // try it on
    const tryGear = { ...(P.gear || {}) };
    if (['armor', 'helmet', 'bag'].includes(this.tab)) tryGear[this.tab] = this.sel;
    this.gear.apply(tryGear);
    const buy = this.el.querySelector('.buy');
    if (this.tab === 'med') {
      const n = P.med?.[it.id] || 0;
      buy.innerHTML = `<div class="nm">${it.name}<small>${it.desc} You carry ${n} of ${it.max}. Use them from the phone's Inventory, or press H to treat yourself.</small></div>
        <button class="go" data-a="buy1" ${n >= it.max ? 'disabled' : ''}>Buy 1 · $${price(it)}</button><button data-a="fill" ${n >= it.max ? 'disabled' : ''}>Fill up (${it.max - n}) · $${price(it) * (it.max - n)}</button>`;
    } else {
      const own = this.owned(this.tab, it.id), on = P.gear?.[this.tab] === it.id;
      buy.innerHTML = `<div class="nm">${it.name}<small>${it.desc}</small></div>
        ${own ? `<button class="go" data-a="wear" ${on ? 'disabled' : ''}>${on ? (this.tab === 'holster' ? 'In use' : 'Wearing') : this.tab === 'holster' ? 'Use this holster' : 'Put it on'}</button>${on ? '<button data-a="off">Take it off</button>' : ''}` : `<button class="go" data-a="buy">Buy · $${price(it).toLocaleString('en-US')}</button>`}`;
    }
    buy.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => this.action(b.dataset.a, it, price(it)); });
  }
  action(a, it, price) {
    const P = this.P, g = this.g;
    P.gear = P.gear || {}; P.gearOwned = P.gearOwned || []; P.med = P.med || {};
    if (a === 'buy') { if (!g.spend(price)) return; P.gearOwned.push(this.tab + ':' + it.id); P.gear[this.tab] = it.id; g.toast(`Bought: ${it.name}`); }
    else if (a === 'wear') P.gear[this.tab] = it.id;
    else if (a === 'off') P.gear[this.tab] = this.tab === 'holster' ? 'owb' : null;
    else if (a === 'buy1') { if (!g.spend(price)) return; P.med[it.id] = (P.med[it.id] || 0) + 1; }
    else if (a === 'fill') { const n = it.max - (P.med[it.id] || 0); if (n > 0 && g.spend(price * n)) P.med[it.id] = it.max; }
    g.changed(); g.career.saveSoon(); this.render();
  }
}
