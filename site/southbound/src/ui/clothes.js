// Clothing store: pick a slot (tops, jackets, pants, shoes, hats, eyewear,
// neckwear, gloves), a style, a pattern and a colour, and see John wearing it
// on the right (drag to turn him). Buy it and you wear it; everything you own
// is in the Wardrobe tab.
import * as THREE from 'three';
import { Human } from '../entities/human.js';
import { SLOTS, SLOT, COLORS, FRAME_COLORS, CATALOG_SIZE, slotCount, itemKey, parseKey, itemName, itemPrice, makeOutfitter } from '../entities/clothing.js';

const CSS = `
#clothes{position:fixed;inset:0;z-index:45;display:none;background:radial-gradient(ellipse at 72% 40%,rgba(38,34,30,.94),rgba(8,7,6,.97));color:#eee6da;font:14px Inter,system-ui,sans-serif}
#clothes.show{display:grid;grid-template-rows:auto auto 1fr}
#clothes header{display:flex;align-items:center;gap:14px;padding:14px 22px 6px}
#clothes h2{margin:0;font:400 28px Anton,Impact,sans-serif;letter-spacing:.05em;flex:1}
#clothes h2 small{display:block;font:500 11px Inter,sans-serif;letter-spacing:.2em;color:#9fc4c0;text-transform:uppercase;margin-top:2px}
#clothes .money{font:400 24px Anton,Impact,sans-serif;color:#86e08f}
#clothes button{background:rgba(255,255,255,.06);color:#eee6da;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:8px 13px;font:600 13px Inter,sans-serif;cursor:pointer}
#clothes button:hover{background:rgba(255,255,255,.12)}
#clothes button.go{background:#2f7d74;border-color:#2f7d74}#clothes button.go:disabled{opacity:.4;cursor:default}
#clothes .tabs{display:flex;gap:6px;padding:6px 22px 10px;overflow-x:auto;border-bottom:1px solid rgba(255,255,255,.08)}
#clothes .tabs button{white-space:nowrap}#clothes .tabs button small{opacity:.6;font-weight:500;margin-left:4px}
#clothes .tabs button.on{background:#eee6da;color:#151210;border-color:#eee6da}
#clothes .body{display:grid;grid-template-columns:minmax(320px,44%) 1fr;min-height:0}
#clothes .left{overflow-y:auto;padding:10px 12px 24px 22px}
#clothes .styles{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
#clothes .st{padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.1);cursor:pointer;background:rgba(255,255,255,.03)}
#clothes .st:hover,#clothes .st.sel{background:rgba(255,255,255,.08);border-color:rgba(159,196,192,.6)}
#clothes .st b{display:block;font-size:13.5px}#clothes .st small{display:block;color:#b8a892;font-size:11.5px;margin-top:3px;line-height:1.35}
#clothes .st .p{font:400 15px Anton,Impact,sans-serif;color:#e8d3a8;margin-top:4px;display:block}
#clothes h4{margin:16px 0 7px;font:600 11px Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#9fc4c0}
#clothes .chips{display:flex;flex-wrap:wrap;gap:6px}
#clothes .chips button{padding:6px 10px;font-size:12px}#clothes .chips button.on{border-color:#9fc4c0;background:rgba(159,196,192,.18)}
#clothes .sws{display:grid;grid-template-columns:repeat(auto-fill,26px);gap:6px}
#clothes .sw{width:26px;height:26px;border-radius:50%;padding:0;border:2px solid rgba(255,255,255,.2)}
#clothes .sw.on{border-color:#fff;box-shadow:0 0 0 2px #2f7d74}
#clothes .sw.own::after{content:'';display:block;width:6px;height:6px;border-radius:50%;background:#86e08f;margin:16px 0 0 16px}
#clothes .right{display:grid;grid-template-rows:1fr auto;min-height:0;border-left:1px solid rgba(255,255,255,.08)}
#clothes canvas{width:100%;height:100%;display:block;cursor:grab;touch-action:none}
#clothes .buy{padding:12px 22px 18px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
#clothes .buy .nm{flex:1 1 100%;font:400 20px Anton,Impact,sans-serif;letter-spacing:.03em}
#clothes .buy .nm small{display:block;font:500 12px Inter,sans-serif;color:#b8a892;letter-spacing:0;margin-top:2px}
#clothes .ward .row{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06)}
#clothes .ward .row i{width:16px;height:16px;border-radius:50%;flex:none}
#clothes .ward .row span{flex:1}#clothes .ward .row em{font-style:normal;color:#86e08f;font-size:12px}
#clothes .count{color:#b8a892;font-size:12px;margin:2px 0 10px}
@media (max-width:760px){#clothes .body{grid-template-columns:1fr;grid-template-rows:42vh 1fr}#clothes .right{grid-row:1;border-left:0}#clothes .left{grid-row:2}}
`;

export class ClothingStore {
  // g: { lib, career, getMoney(), spend(n), pause(b), toast(t), wear(outfit), skinHex }
  constructor(g) {
    this.g = g;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = (this.el = document.createElement('div'));
    el.id = 'clothes';
    el.innerHTML = `<header><h2></h2><span class="money"></span><button data-close>Leave</button></header><div class="tabs"></div>
      <div class="body"><div class="left"></div><div class="right"><canvas></canvas><div class="buy"></div></div></div>`;
    document.body.appendChild(el);
    el.querySelector('[data-close]').onclick = () => this.close();
    addEventListener('keydown', (e) => { if (this.open && e.code === 'Escape') { e.stopPropagation(); this.close(); } }, true);
    this.canvas = el.querySelector('canvas');
    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => { drag = e.clientX; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => { if (drag == null) return; this.yaw += (e.clientX - drag) * 0.012; drag = e.clientX; });
    this.canvas.addEventListener('pointerup', () => { drag = null; });
    this.yaw = 0.3; this.open = false; this.slot = 'top';
  }
  get P() { return this.g.career.p; }
  owned(key) { return this.P.wardrobe.includes(key); }

  show(store) {
    this.store = store;
    this.open = true; this.el.classList.add('show'); this.g.pause(true);
    this.try = { ...this.P.outfit };
    this.el.querySelector('h2').innerHTML = `${store.name.toUpperCase()}<small>${store.keeper} · ${store.blurb}</small>`;
    const tabs = this.el.querySelector('.tabs'); tabs.innerHTML = '';
    const slots = SLOTS.filter((s) => store.slots.includes(s.k));
    for (const s of [...slots, { k: 'ward', label: 'Wardrobe' }]) {
      const b = document.createElement('button'); b.dataset.k = s.k;
      b.innerHTML = `${s.label}${s.k !== 'ward' ? `<small>${slotCount(s).toLocaleString('en-US')}</small>` : ''}`;
      b.onclick = () => { this.slot = s.k; this.pick = null; this.render(); };
      tabs.appendChild(b);
    }
    if (!slots.some((s) => s.k === this.slot)) this.slot = slots[0].k;
    this.pick = null;
    this.ensureViewer();
    this.render();
    const loop = (t) => { if (!this.open) return; this.draw(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  close() { this.open = false; this.el.classList.remove('show'); this.g.pause(false); }

  ensureViewer() {
    if (this.r) return;
    this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(28, 1, 0.05, 30);
    this.scene.add(new THREE.HemisphereLight(0xfff4e8, 0x302820, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1.5, 3, 2.5); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfe0ff, 1.2); rim.position.set(-2, 2, -2); this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; this.scene.add(floor);
    this.h = new Human(this.g.lib, 'hero', { alwaysVisible: true });
    this.h.play('Idle_Loop', 0);
    this.scene.add(this.h.root);
    this.fit = makeOutfitter(this.h, this.g.skinHex);
    this.last = 0;
  }
  draw(t) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this.canvas.width !== Math.round(w * Math.min(2, devicePixelRatio))) { this.r.setPixelRatio(Math.min(2, devicePixelRatio)); this.r.setSize(w, h, false); }
    const dt = Math.min(0.05, (t - (this.last || t)) / 1000); this.last = t;
    this.h.update(dt);
    this.h.root.rotation.y = this.yaw;
    // frame the part you're shopping for
    const focus = { hat: [1.6, 1.05], eye: [1.62, 0.75], neck: [1.42, 1.05], shoes: [0.3, 1.4], gloves: [0.95, 1.7] }[this.slot] || [0.98, 4.0];
    const cy = focus[0], d = focus[1];
    this.camY = this.camY == null ? cy : this.camY + (cy - this.camY) * Math.min(1, dt * 6);
    this.camD = this.camD == null ? d : this.camD + (d - this.camD) * Math.min(1, dt * 6);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    this.cam.position.set(0, this.camY + 0.05, this.camD); this.cam.lookAt(0, this.camY, 0);
    this.r.render(this.scene, this.cam);
  }

  render() {
    const g = this.g;
    this.el.querySelector('.money').textContent = '$' + g.getMoney().toLocaleString('en-US');
    this.el.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.k === this.slot));
    this.fit.apply(this.try);
    const left = this.el.querySelector('.left'), buy = this.el.querySelector('.buy');
    if (this.slot === 'ward') { this.renderWardrobe(left, buy); return; }
    const S = SLOT[this.slot], pal = S.frames ? FRAME_COLORS : COLORS;
    const cur = parseKey(this.try[this.slot]);
    if (!this.pick) this.pick = cur && cur.slot === S ? { style: cur.style.id, pat: cur.pat, col: cur.col } : { style: S.styles[0].id, pat: 0, col: 0 };
    const key = itemKey(S.k, this.pick.style, this.pick.pat, this.pick.col);
    left.innerHTML = `<div class="count">${CATALOG_SIZE.toLocaleString('en-US')} pieces in the catalog · ${slotCount(S).toLocaleString('en-US')} ${S.label.toLowerCase()} · you own ${this.P.wardrobe.length}</div>
      <div class="styles">${S.styles.map((s) => `<div class="st ${s.id === this.pick.style ? 'sel' : ''}" data-s="${s.id}"><b>${s.name}</b><small>${s.desc}</small><span class="p">from $${itemPrice(itemKey(S.k, s.id, 0, 0), this.store.priceK)}</span></div>`).join('')}</div>
      <h4>${S.frames ? 'Lens' : 'Pattern'}</h4><div class="chips">${S.patterns.map((p, i) => `<button data-p="${i}" class="${i === this.pick.pat ? 'on' : ''}">${p}</button>`).join('')}</div>
      <h4>${S.frames ? 'Frame colour' : 'Colour'} · ${pal[this.pick.col][0]}</h4><div class="sws">${pal.map((c, i) => `<button class="sw ${i === this.pick.col ? 'on' : ''} ${this.owned(itemKey(S.k, this.pick.style, this.pick.pat, i)) ? 'own' : ''}" data-c="${i}" title="${c[0]}" style="background:#${c[1].toString(16).padStart(6, '0')}"></button>`).join('')}</div>`;
    const tryOn = () => { this.try[S.k] = itemKey(S.k, this.pick.style, this.pick.pat, this.pick.col); this.render(); };
    left.querySelectorAll('.st').forEach((e) => { e.onclick = () => { this.pick.style = e.dataset.s; tryOn(); }; });
    left.querySelectorAll('[data-p]').forEach((e) => { e.onclick = () => { this.pick.pat = +e.dataset.p; tryOn(); }; });
    left.querySelectorAll('[data-c]').forEach((e) => { e.onclick = () => { this.pick.col = +e.dataset.c; tryOn(); }; });
    const price = itemPrice(key, this.store.priceK), own = this.owned(key), wearing = this.P.outfit[S.k] === key;
    const optional = ['outer', 'hat', 'eye', 'neck', 'gloves', 'top'].includes(S.k);
    buy.innerHTML = `<div class="nm">${itemName(key)}<small>${own ? 'In your wardrobe' : `$${price}`}${wearing ? ' · wearing it' : ''}</small></div>
      ${own ? `<button class="go" data-a="wear" ${wearing ? 'disabled' : ''}>${wearing ? 'Wearing' : 'Wear it'}</button>` : `<button class="go" data-a="buy">Buy & wear · $${price}</button>`}
      ${optional && this.P.outfit[S.k] ? '<button data-a="off">Take off</button>' : ''}
      <button data-a="reset">Put my clothes back on</button>`;
    buy.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => this.action(b.dataset.a, key, price); });
  }
  renderWardrobe(left, buy) {
    const byslot = SLOTS.map((s) => [s, this.P.wardrobe.filter((k) => k.startsWith(s.k + ':'))]).filter(([, l]) => l.length);
    left.innerHTML = `<div class="count">You own ${this.P.wardrobe.length} pieces. Tap one to put it on.</div><div class="ward">${byslot.map(([s, l]) => `<h4>${s.label}</h4>${l.map((k) => { const it = parseKey(k); return `<div class="row" data-k="${k}"><i style="background:#${it.color[1].toString(16).padStart(6, '0')}"></i><span>${itemName(k)}</span>${this.try[s.k] === k ? '<em>on</em>' : ''}<button data-k="${k}">${this.try[s.k] === k ? 'Take off' : 'Wear'}</button></div>`; }).join('')}`).join('')}</div>`;
    left.querySelectorAll('button[data-k]').forEach((b) => {
      b.onclick = () => { const k = b.dataset.k, s = k.split(':')[0]; if (this.try[s] === k && !['bottom', 'shoes'].includes(s)) this.try[s] = null; else this.try[s] = k; this.commit(); this.render(); };
    });
    buy.innerHTML = '<div class="nm">Wardrobe<small>Changes save as soon as you make them.</small></div>';
  }
  commit() { this.P.outfit = { ...this.try }; this.g.wear(this.P.outfit); this.g.career.saveSoon(); }
  action(a, key, price) {
    const s = key.split(':')[0];
    if (a === 'buy') { if (!this.g.spend(price)) return; this.P.wardrobe.push(key); this.try[s] = key; this.commit(); this.g.toast(`Bought: ${itemName(key)}`); }
    else if (a === 'wear') { this.try[s] = key; this.commit(); }
    else if (a === 'off') { this.try[s] = null; this.commit(); }
    else if (a === 'reset') { this.try = { ...this.P.outfit }; this.pick = null; }
    this.render();
  }
}
