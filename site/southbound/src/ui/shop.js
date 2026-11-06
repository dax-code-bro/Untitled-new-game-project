// Generic full-screen store / menu used by the garage, hardware store, real
// estate office, butcher, fish market, job board and mission log.
//
// Stores that can show what they sell (cfg.model) open as a showroom, the way the gun store does:
// on the left the list, on the right the thing itself turning on a stand (drag to turn it), with
// its details and the buy button under it. Menus without models (jobs, missions) stay a plain list.
import { showOnStand, hideStand } from './viewer.js';

const CSS = `
.sbshop{position:fixed;inset:0;z-index:40;display:none;background:rgba(8,6,5,.9);backdrop-filter:blur(6px);color:#f3e9da;font:14px Inter,system-ui,sans-serif}
.sbshop.show{display:flex;flex-direction:column}
.sbshop header{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid #3a2c22}
.sbshop h2{font:400 26px Anton,Impact,sans-serif;letter-spacing:.04em;margin:0;flex:1}
.sbshop .money{font:400 22px Anton,Impact,sans-serif;color:#7ee08a}
.sbshop .tabs{display:flex;gap:6px;padding:10px 18px;overflow-x:auto;flex-shrink:0}
.sbshop button{background:#2a201a;color:#f3e9da;border:1px solid #4a382b;border-radius:8px;padding:8px 12px;font:600 13px Inter,sans-serif;cursor:pointer;white-space:nowrap}
.sbshop .tabs button.on{background:#e2572b;border-color:#e2572b}
.sbshop .note{padding:0 18px 6px;color:#c9b59d;font-size:13px}
.sbshop .list{flex:1;overflow-y:auto;padding:4px 18px 24px}
.sbshop .row{display:grid;grid-template-columns:minmax(150px,1.5fr) repeat(3,minmax(60px,1fr)) 110px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #2a201a}
.sbshop .row .n b{display:block}.sbshop .row .n small{color:#b9a58f}
.sbshop .bar{height:6px;background:#2a201a;border-radius:3px;overflow:hidden}.sbshop .bar i{display:block;height:100%;background:#e8a33d}
.sbshop .lbl{font-size:10px;color:#a8957f;text-transform:uppercase;letter-spacing:.06em}
.sbshop button.own{background:#1f3a24;border-color:#2f6a3a}.sbshop button.dis{opacity:.45}
@media (max-width:640px){.sbshop .row{grid-template-columns:1fr 1fr 96px}.sbshop .row .s1,.sbshop .row .s2{display:none}}
/* showroom */
.sbshop.room{background:radial-gradient(ellipse at 72% 38%,rgba(44,36,30,.95),rgba(8,7,6,.97))}
.sbshop .main{flex:1;min-height:0;display:flex;flex-direction:column}
.sbshop .left{flex:1;min-height:0;display:flex;flex-direction:column}
.sbshop.room .main{display:grid;grid-template-columns:minmax(300px,42%) 1fr}
.sbshop.room .left{display:flex;flex-direction:column;min-height:0;border-right:1px solid rgba(255,255,255,.06)}
.sbshop.room .row{grid-template-columns:1fr auto;padding:9px 10px;border:1px solid transparent;border-radius:10px;border-bottom-color:#241b15;cursor:pointer}
.sbshop.room .row:hover,.sbshop.room .row.sel{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.1)}
.sbshop.room .row .s0,.sbshop.room .row .s1,.sbshop.room .row .s2{display:none}
.sbshop .side{display:none}
.sbshop.room .side{display:flex;flex-direction:column;min-height:0}
.sbshop .stage{position:relative;flex:1;min-height:220px}
.sbshop .stage canvas{position:absolute;inset:0;width:100%;height:100%;cursor:grab;touch-action:none}
.sbshop .stage .hint{position:absolute;right:14px;bottom:8px;font-size:11px;color:#8f7f6c}
.sbshop .detail{padding:12px 22px 20px;border-top:1px solid rgba(255,255,255,.06)}
.sbshop .detail h3{margin:0;font:400 26px Anton,Impact,sans-serif;letter-spacing:.03em}
.sbshop .detail .sub{color:#c9b59d;font-size:13px;margin:2px 0 10px}
.sbshop .detail .desc{color:#d8ccbb;font-size:13px;line-height:1.45;margin:0 0 10px}
.sbshop .detail .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px 18px;margin-bottom:12px}
.sbshop .detail .acts button{font-size:15px;padding:10px 18px;background:#c2402a;border-color:#c2402a}
.sbshop .detail .acts button.own{background:#1f3a24;border-color:#2f6a3a}.sbshop .detail .acts button.dis{opacity:.45;background:#2a201a;border-color:#4a382b}
.sbshop .detail .mob{display:none}
@media (max-width:760px){
  .sbshop.room .main{grid-template-columns:1fr}
  .sbshop.room .side{position:absolute;inset:56px 0 0 0;background:rgba(10,8,7,.98);z-index:2;display:none}
  .sbshop.room .side.show{display:flex}
  .sbshop .detail .mob{display:inline-block;margin-left:8px;background:#2a201a;border-color:#4a382b}
}
`;
let styled = false;

export class ShopUI {
  // cfg: { title, tabs: [{k, label}], items(tabKey) -> [], row(item) -> {name, sub, stats:[[label, 0..1, text]], btn, cls, desc?},
  //        act(item, tabKey), note?(tabKey), getMoney(), pause(bool), model?(item, tabKey) -> Object3D | null, key?(item) -> string }
  constructor(cfg) {
    this.cfg = cfg;
    if (!styled) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); styled = true; }
    this.el = document.createElement('div'); this.el.className = 'sbshop' + (cfg.model ? ' room' : '');
    this.el.innerHTML = `<header><h2></h2><span class="money"></span><button data-close>Close</button></header><div class="tabs"></div><div class="note"></div>
      <div class="main"><div class="left"><div class="list"></div></div><div class="side"><div class="stage"><span class="hint">drag to turn</span></div><div class="detail"></div></div></div>`;
    document.body.appendChild(this.el);
    this.el.querySelector('[data-close]').addEventListener('click', () => this.close());
    this.el.querySelector('.list').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b) { const item = this.items[+b.dataset.i]; if (item) { this.cfg.act(item, this.tab); this.render(); } return; }
      const r = e.target.closest('.row[data-r]');
      if (r && this.cfg.model) { this.sel = +r.dataset.r; this.render(); if (innerWidth <= 760) this.el.querySelector('.side').classList.add('show'); }
    });
    this.el.querySelector('.detail').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'back') { this.el.querySelector('.side').classList.remove('show'); return; }
      const item = this.items[this.sel]; if (item && b.dataset.a === 'act') { this.cfg.act(item, this.tab); this.render(); }
    });
    addEventListener('keydown', (e) => { if (this.open && (e.code === 'Escape' || e.code === 'KeyF')) { e.stopPropagation(); this.close(); } }, true);
    this.open = false; this.tab = cfg.tabs[0]?.k; this.items = []; this.sel = 0; this.shown = null;
  }
  show(tab, title) {
    if (tab && tab !== this.tab) { this.tab = tab; this.sel = 0; }
    this.title = title || this.cfg.title;
    this.open = true; this.el.classList.add('show'); this.cfg.pause(true); this.shown = null; this.render();
  }
  close() {
    this.open = false; this.el.classList.remove('show'); this.cfg.pause(false);
    if (this.cfg.model) { hideStand(); this.dropModel(); }
  }
  dropModel() { if (this.model) { this.model.userData.dispose?.(); this.model = null; } this.shown = null; }
  render() {
    const c = this.cfg;
    this.el.querySelector('h2').textContent = this.title || c.title;
    this.el.querySelector('.money').textContent = '$' + c.getMoney().toLocaleString('en-US');
    const tabs = this.el.querySelector('.tabs');
    const tabList = typeof c.tabs === 'function' ? c.tabs() : c.tabs;
    tabs.innerHTML = '';
    for (const t of tabList) {
      const b = document.createElement('button'); b.textContent = t.label; b.className = t.k === this.tab ? 'on' : '';
      b.onclick = () => { if (this.tab !== t.k) { this.tab = t.k; this.sel = 0; } this.render(); };
      tabs.appendChild(b);
    }
    this.el.querySelector('.note').textContent = c.note ? c.note(this.tab) : '';
    this.items = c.items(this.tab);
    if (this.sel >= this.items.length) this.sel = 0;
    const bar = (v) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, v * 100)).toFixed(0)}%"></i></div>`;
    const room = !!c.model;
    this.el.querySelector('.list').innerHTML = this.items.map((it, i) => {
      const r = c.row(it, this.tab);
      const st = (r.stats || []).slice(0, 3);
      while (st.length < 3) st.push(null);
      return `<div class="row ${room && i === this.sel ? 'sel' : ''}" data-r="${i}"><div class="n"><b>${r.name}</b><small>${r.sub || ''}</small></div>${st.map((s, k) => `<div class="s${k}">${s ? `<span class="lbl">${s[0]}${s[2] !== undefined ? ' ' + s[2] : ''}</span>${s[1] !== null ? bar(s[1]) : ''}` : ''}</div>`).join('')}
        <button data-i="${i}" class="${r.cls || ''}">${r.btn}</button></div>`;
    }).join('') || '<p class="note">Nothing here yet.</p>';
    if (room) this.renderSide(bar);
  }
  // the right-hand side: the selected thing on its stand, and its details
  renderSide(bar) {
    const c = this.cfg, it = this.items[this.sel], det = this.el.querySelector('.detail');
    if (!it) { det.innerHTML = ''; this.dropModel(); showOnStand(this.el.querySelector('.stage'), null); return; }
    const r = c.row(it, this.tab);
    det.innerHTML = `<h3>${r.name}</h3><div class="sub">${r.sub || ''}</div>${r.desc ? `<p class="desc">${r.desc}</p>` : ''}
      <div class="stats">${(r.stats || []).map((s) => `<div><span class="lbl">${s[0]}${s[2] !== undefined ? ' ' + s[2] : ''}</span>${s[1] !== null && s[1] !== undefined ? bar(s[1]) : ''}</div>`).join('')}</div>
      <div class="acts"><button data-a="act" class="${r.cls || ''}">${r.btn}</button><button data-a="back" class="mob">Back</button></div>`;
    const key = (c.key ? c.key(it) : r.name) + '|' + this.tab;
    if (this.shown === key) return;
    this.dropModel();
    let m = null;
    try { m = c.model(it, this.tab); } catch (e) { console.warn('showroom model', e); }
    this.model = m; this.shown = key;
    showOnStand(this.el.querySelector('.stage'), m);
  }
}
