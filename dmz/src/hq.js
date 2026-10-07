// Between-raid HQ: loadout, insurance, stash, shop, record, debrief.
import { WEAPONS, ITEMS, RARITY, BACKPACKS, PRICES } from './data.js';
import { fmtCash, fmtTime } from './rng.js';
import * as Save from './save.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tag = (uid) => (uid ? '#' + uid.slice(-4).toUpperCase() : '');

export class HQ {
  constructor(root, save, actions) {
    this.root = root;
    this.save = save;
    this.actions = actions;
    this.tab = 'loadout';
    this.debrief = null;
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('change', (e) => this.onChange(e));
    root.addEventListener('input', (e) => this.onInput(e));
  }

  show(debrief = null) { this.debrief = debrief; this.root.classList.remove('hidden'); this.render(); }
  hide() { this.root.classList.add('hidden'); }

  wname(w) { return `${WEAPONS[w.id].name} ${tag(w.uid)}`; }

  render() {
    const s = this.save;
    const lvl = Save.level(s.xp);
    const tabs = ['loadout', 'stash', 'shop', 'record'].map((t) => `<button class="tab ${this.tab === t ? 'on' : ''}" data-act="tab" data-v="${t}">${t.toUpperCase()}</button>`).join('');
    let body = '';
    if (this.tab === 'loadout') body = this.renderLoadout();
    if (this.tab === 'stash') body = this.renderStash();
    if (this.tab === 'shop') body = this.renderShop();
    if (this.tab === 'record') body = this.renderRecord();
    this.root.innerHTML = `
      <div class="hq-wrap">
        <header>
          <div class="logo">EXFIL<span>DMZ-style extraction</span></div>
          <div class="hq-stats"><span>LVL <b>${lvl}</b></span><span>XP <b>${s.xp.toLocaleString()}</b></span><span class="cash">${fmtCash(s.cash)}</span></div>
        </header>
        <nav>${tabs}</nav>
        <main>
          <section class="hq-body">${body}</section>
          <aside>
            <button class="deploy" data-act="deploy">DEPLOY ▸</button>
            <p class="warn">Everything you bring can be lost. Only your <b>insured</b> weapon returns if you die.</p>
            <h4>Controls</h4>
            <ul class="controls">
              <li><kbd>WASD</kbd> move · <kbd>Shift</kbd> sprint</li>
              <li><kbd>C</kbd>/<kbd>Ctrl</kbd> crouch · <kbd>Space</kbd> jump</li>
              <li><kbd>LMB</kbd> fire · <kbd>RMB</kbd> aim</li>
              <li><kbd>R</kbd> reload · <kbd>1</kbd><kbd>2</kbd>/<kbd>Q</kbd> swap</li>
              <li><kbd>F</kbd> armor plate (hold to chain)</li>
              <li><kbd>E</kbd> loot / call exfil</li>
              <li><kbd>Tab</kbd> backpack · <kbd>M</kbd> map</li>
              <li><kbd>Esc</kbd> pause</li>
            </ul>
            <h4>How a raid works</h4>
            <ol class="howto">
              <li>Loot containers & bodies for cash, valuables, weapons and plates.</li>
              <li>Complete your contract for a big payout.</li>
              <li>Call a helicopter at an exfil (green), survive the reinforcements, board it.</li>
              <li>The radiation zone closes in after ${Math.round(8)} minutes. Don't get caught.</li>
            </ol>
          </aside>
        </main>
      </div>
      ${this.debrief ? this.renderDebrief() : ''}`;
  }

  renderLoadout() {
    const s = this.save, W = s.stash.weapons;
    const opt = (sel, allowNone, noneLabel) => {
      let h = allowNone ? `<option value="">${noneLabel}</option>` : '';
      for (const w of W) h += `<option value="${w.uid}" ${sel === w.uid ? 'selected' : ''}>${esc(this.wname(w))}</option>`;
      return h;
    };
    const plates = Math.min(s.stash.plates, 6);
    return `
      <h2>Loadout</h2>
      <div class="card">
        <label>Primary weapon<select data-set="primary">${opt(s.loadout.primary, true, '— None —')}</select></label>
        <label>Secondary weapon<select data-set="secondary">${opt(s.loadout.secondary, true, 'P-9 Pistol (free, never lost)')}</select></label>
        <label>Insured weapon <small>returns to your stash if you die</small><select data-set="insured">${opt(s.insured, true, '— None —')}</select></label>
      </div>
      <div class="card grid2">
        <div><b>${Math.min(3, plates)}</b> plates equipped · <b>${Math.max(0, plates - 3)}</b> spare <small>(${s.stash.plates} in stash)</small></div>
        <div><b>${Math.min(1, s.stash.revives)}</b> self-revive kit <small>(${s.stash.revives} in stash)</small></div>
        <div>${BACKPACKS[s.backpackTier].name} · <b>${BACKPACKS[s.backpackTier].slots}</b> slots</div>
      </div>
      ${W.length === 0 ? '<p class="note">No weapons in your stash — you will deploy with the free P-9. Buy weapons in the Shop or find them in the zone.</p>' : ''}`;
  }

  renderStash() {
    const s = this.save;
    const wl = s.stash.weapons.map((w) => {
      const d = WEAPONS[w.id];
      const flags = [s.loadout.primary === w.uid && 'PRIMARY', s.loadout.secondary === w.uid && 'SECONDARY', s.insured === w.uid && 'INSURED'].filter(Boolean).join(' · ');
      return `<div class="row" style="--rc:${RARITY[d.rarity].color}"><div><b>${esc(this.wname(w))}</b><small>${d.cls}${flags ? ' · ' + flags : ''}</small></div><button data-act="sellw" data-v="${w.uid}">Sell ${fmtCash(d.value)}</button></div>`;
    }).join('') || '<p class="note">No weapons.</p>';
    const groups = {};
    for (const it of s.stash.items) (groups[it.id] = groups[it.id] || []).push(it);
    const il = Object.entries(groups).sort((a, b) => ITEMS[b[0]].value - ITEMS[a[0]].value).map(([id, arr]) => {
      const d = ITEMS[id];
      return `<div class="row" style="--rc:${RARITY[d.rarity].color}"><div><b>${esc(d.name)}</b> ×${arr.length}<small>${fmtCash(d.value)} each</small></div><button data-act="selli" data-v="${id}">Sell 1</button></div>`;
    }).join('') || '<p class="note">No valuables. Extract with loot to fill your stash.</p>';
    const total = s.stash.items.reduce((a, it) => a + ITEMS[it.id].value, 0);
    return `
      <h2>Stash</h2>
      <div class="card"><h3>Weapons</h3>${wl}</div>
      <div class="card"><h3>Valuables <span>${fmtCash(total)}</span></h3>${il}
        ${s.stash.items.length ? `<button class="wide" data-act="sellall">Sell all valuables for ${fmtCash(total)}</button>` : ''}</div>
      <div class="card grid2"><div>Armor plates: <b>${s.stash.plates}</b></div><div>Self-revive kits: <b>${s.stash.revives}</b></div></div>`;
  }

  renderShop() {
    const s = this.save;
    const ws = Object.entries(WEAPONS).map(([id, d]) => `
      <div class="row" style="--rc:${RARITY[d.rarity].color}"><div><b>${d.name}</b><small>${d.cls} · ${d.dmg}${d.pellets ? '×' + d.pellets : ''} dmg · ${d.rpm} rpm · ${d.mag} rnd</small></div>
      <button data-act="buyw" data-v="${id}" ${s.cash < d.price ? 'disabled' : ''}>${fmtCash(d.price)}</button></div>`).join('');
    const next = BACKPACKS[s.backpackTier + 1];
    return `
      <h2>Shop</h2>
      <div class="card"><h3>Weapons</h3>${ws}</div>
      <div class="card"><h3>Gear</h3>
        <div class="row"><div><b>Armor Plate</b><small>Each plate absorbs 50 damage. You carry up to 3 equipped + 3 spare into a raid.</small></div>
          <span><button data-act="buyp" data-v="1" ${s.cash < PRICES.plate ? 'disabled' : ''}>1× ${fmtCash(PRICES.plate)}</button>
          <button data-act="buyp" data-v="3" ${s.cash < PRICES.plate * 3 ? 'disabled' : ''}>3× ${fmtCash(PRICES.plate * 3)}</button></span></div>
        <div class="row"><div><b>Self-Revive Kit</b><small>Get back up once when downed.</small></div>
          <button data-act="buyr" ${s.cash < PRICES.revive ? 'disabled' : ''}>${fmtCash(PRICES.revive)}</button></div>
        <div class="row"><div><b>${next ? next.name : 'Backpack maxed'}</b><small>${next ? `Permanent upgrade to ${next.slots} slots` : 'You have the largest backpack.'}</small></div>
          ${next ? `<button data-act="buyb" ${s.cash < next.price ? 'disabled' : ''}>${fmtCash(next.price)}</button>` : ''}</div>
      </div>`;
  }

  renderRecord() {
    const st = this.save.stats;
    const rate = st.raids ? Math.round((st.extracts / st.raids) * 100) : 0;
    return `
      <h2>Service Record</h2>
      <div class="card stats">
        <div><b>${st.raids}</b><small>Raids</small></div>
        <div><b>${st.extracts}</b><small>Extractions</small></div>
        <div><b>${rate}%</b><small>Survival rate</small></div>
        <div><b>${st.kills}</b><small>Kills</small></div>
        <div><b>${st.deaths}</b><small>Deaths</small></div>
        <div><b>${fmtCash(st.bestHaul)}</b><small>Best haul</small></div>
      </div>
      <div class="card">
        <h3>Settings</h3>
        <label>Mouse sensitivity <b id="sensv">${this.save.settings.sens.toFixed(2)}</b><input type="range" min="0.2" max="3" step="0.05" value="${this.save.settings.sens}" data-range="sens"></label>
        <label>Volume <b id="volv">${Math.round(this.save.settings.volume * 100)}%</b><input type="range" min="0" max="1" step="0.05" value="${this.save.settings.volume}" data-range="volume"></label>
      </div>
      <button class="danger" data-act="reset">Reset all progress</button>`;
  }

  renderDebrief() {
    const r = this.debrief;
    const items = r.items.map((it) => `<li style="color:${RARITY[ITEMS[it.id].rarity].color}">${esc(ITEMS[it.id].name)} <small>${fmtCash(ITEMS[it.id].value)}</small></li>`).join('');
    const weapons = r.weapons.filter((w) => w.uid).map((w) => `<li style="color:${RARITY[WEAPONS[w.id].rarity].color}">${esc(WEAPONS[w.id].name)}</li>`).join('');
    const lost = (r.lost || []).map((n) => `<li>${esc(n)}</li>`).join('');
    return `<div class="modal"><div class="debrief ${r.success ? 'ok' : 'bad'}">
      <h1>${r.success ? 'EXTRACTED' : 'KILLED IN ACTION'}</h1>
      <p class="sub">${esc(r.reason)} · ${fmtTime(r.duration)} in the zone</p>
      <div class="stats">
        <div><b>${r.kills}</b><small>Kills</small></div>
        <div><b>+${r.xp.toLocaleString()}</b><small>XP</small></div>
        <div><b>${fmtCash(r.cash + r.bonus)}</b><small>Cash secured</small></div>
        <div><b>${r.contract.done ? '✓' : '✗'}</b><small>${esc(r.contract.title)}</small></div>
      </div>
      ${r.success ? `
        ${r.bonus ? `<p class="bonus">Contract bonus: ${fmtCash(r.bonus)}</p>` : ''}
        ${weapons ? `<h3>Weapons secured</h3><ul>${weapons}</ul>` : ''}
        ${items ? `<h3>Valuables secured</h3><ul>${items}</ul>` : ''}
        ${r.plates || r.revives ? `<p>${r.plates} plates · ${r.revives} self-revives returned to stash</p>` : ''}
      ` : `
        ${lost ? `<h3>Lost</h3><ul class="lost">${lost}</ul>` : ''}
        ${r.insuredReturned ? `<p class="bonus">Insurance returned your ${esc(r.insuredReturned)}.</p>` : '<p>No insured weapon was recovered.</p>'}
      `}
      <button class="deploy" data-act="closedebrief">CONTINUE</button>
    </div></div>`;
  }

  onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const s = this.save, v = b.dataset.v;
    this.actions.audio.init();
    this.actions.audio.ui();
    switch (b.dataset.act) {
      case 'tab': this.tab = v; break;
      case 'deploy': this.actions.deploy(); return;
      case 'closedebrief': this.debrief = null; break;
      case 'sellw': {
        const i = s.stash.weapons.findIndex((w) => w.uid === v);
        if (i < 0) break;
        if (!confirm(`Sell ${WEAPONS[s.stash.weapons[i].id].name}?`)) break;
        s.cash += WEAPONS[s.stash.weapons[i].id].value;
        s.stash.weapons.splice(i, 1);
        for (const k of ['primary', 'secondary']) if (s.loadout[k] === v) s.loadout[k] = null;
        if (s.insured === v) s.insured = null;
        break;
      }
      case 'selli': {
        const i = s.stash.items.findIndex((it) => it.id === v);
        if (i >= 0) { s.cash += ITEMS[v].value; s.stash.items.splice(i, 1); }
        break;
      }
      case 'sellall':
        for (const it of s.stash.items) s.cash += ITEMS[it.id].value;
        s.stash.items = [];
        this.actions.audio.cash();
        break;
      case 'buyw': {
        const d = WEAPONS[v];
        if (s.cash < d.price) break;
        s.cash -= d.price;
        const w = { uid: Save.newUid(), id: v };
        s.stash.weapons.push(w);
        if (!s.loadout.primary) s.loadout.primary = w.uid;
        this.actions.audio.cash();
        break;
      }
      case 'buyp': {
        const n = +v;
        if (s.cash < PRICES.plate * n) break;
        s.cash -= PRICES.plate * n; s.stash.plates += n;
        break;
      }
      case 'buyr':
        if (s.cash < PRICES.revive) break;
        s.cash -= PRICES.revive; s.stash.revives++;
        break;
      case 'buyb': {
        const next = BACKPACKS[s.backpackTier + 1];
        if (!next || s.cash < next.price) break;
        s.cash -= next.price; s.backpackTier++;
        break;
      }
      case 'reset':
        if (!confirm('Erase all progress?')) break;
        Object.assign(s, Save.defaultSave());
        break;
    }
    Save.store(s);
    this.render();
  }

  onChange(e) {
    const k = e.target.dataset.set;
    if (!k) return;
    const s = this.save, v = e.target.value || null;
    if (k === 'insured') s.insured = v;
    else {
      s.loadout[k] = v;
      const other = k === 'primary' ? 'secondary' : 'primary';
      if (v && s.loadout[other] === v) s.loadout[other] = null;
    }
    Save.store(s);
    this.render();
  }

  onInput(e) {
    const k = e.target.dataset.range;
    if (!k) return;
    const v = +e.target.value;
    this.save.settings[k] = v;
    if (k === 'sens') document.getElementById('sensv').textContent = v.toFixed(2);
    if (k === 'volume') { document.getElementById('volv').textContent = `${Math.round(v * 100)}%`; this.actions.audio.setVolume(v); }
    Save.store(this.save);
  }
}
