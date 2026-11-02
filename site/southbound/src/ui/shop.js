// Generic full-screen store / menu used by the garage, hardware store, real
// estate office, butcher, fish market, job board and mission log.
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
`;
let styled = false;

export class ShopUI {
  // cfg: { title, tabs: [{k, label}], items(tabKey) -> [], row(item) -> {name, sub, stats:[[label, 0..1, text]], btn, cls}, act(item, tabKey), note?(tabKey), getMoney(), pause(bool) }
  constructor(cfg) {
    this.cfg = cfg;
    if (!styled) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); styled = true; }
    this.el = document.createElement('div'); this.el.className = 'sbshop';
    this.el.innerHTML = `<header><h2></h2><span class="money"></span><button data-close>Close</button></header><div class="tabs"></div><div class="note"></div><div class="list"></div>`;
    document.body.appendChild(this.el);
    this.el.querySelector('[data-close]').addEventListener('click', () => this.close());
    this.el.querySelector('.list').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]'); if (!b) return;
      const item = this.items[+b.dataset.i];
      if (item) { this.cfg.act(item, this.tab); this.render(); }
    });
    addEventListener('keydown', (e) => { if (this.open && (e.code === 'Escape' || e.code === 'KeyF')) { e.stopPropagation(); this.close(); } }, true);
    this.open = false; this.tab = cfg.tabs[0].k; this.items = [];
  }
  show(tab, title) {
    if (tab) this.tab = tab;
    this.title = title || this.cfg.title;
    this.open = true; this.el.classList.add('show'); this.cfg.pause(true); this.render();
  }
  close() { this.open = false; this.el.classList.remove('show'); this.cfg.pause(false); }
  render() {
    const c = this.cfg;
    this.el.querySelector('h2').textContent = this.title || c.title;
    this.el.querySelector('.money').textContent = '$' + c.getMoney().toLocaleString('en-US');
    const tabs = this.el.querySelector('.tabs');
    const tabList = typeof c.tabs === 'function' ? c.tabs() : c.tabs;
    tabs.innerHTML = '';
    for (const t of tabList) {
      const b = document.createElement('button'); b.textContent = t.label; b.className = t.k === this.tab ? 'on' : '';
      b.onclick = () => { this.tab = t.k; this.render(); };
      tabs.appendChild(b);
    }
    this.el.querySelector('.note').textContent = c.note ? c.note(this.tab) : '';
    this.items = c.items(this.tab);
    const bar = (v) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, v * 100)).toFixed(0)}%"></i></div>`;
    this.el.querySelector('.list').innerHTML = this.items.map((it, i) => {
      const r = c.row(it, this.tab);
      const st = (r.stats || []).slice(0, 3);
      while (st.length < 3) st.push(null);
      return `<div class="row"><div class="n"><b>${r.name}</b><small>${r.sub || ''}</small></div>${st.map((s, k) => `<div class="s${k}">${s ? `<span class="lbl">${s[0]}${s[2] !== undefined ? ' ' + s[2] : ''}</span>${s[1] !== null ? bar(s[1]) : ''}` : ''}</div>`).join('')}
        <button data-i="${i}" class="${r.cls || ''}">${r.btn}</button></div>`;
    }).join('') || '<p class="note">Nothing here yet.</p>';
  }
}
