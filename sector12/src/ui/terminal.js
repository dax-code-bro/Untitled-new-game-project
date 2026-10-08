// The POB touchscreen: print catalog (categories, search, sort), print queue, locker.
import { CATEGORIES, ITEMS, AMMO, craftable, fmtDuration, armorDurability, BACKPACK_SLOTS } from '../data/catalog.js';
import { describeItem, isGun } from '../inventory.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SORTS = { name: 'Name', cost: 'Cost ↑', costd: 'Cost ↓', time: 'Print time', cat: 'Category' };

function stats(d) {
  const rows = [];
  if (isGun(d)) {
    rows.push(['Caliber', d.caliber], ['Ammo', d.ammoClass === 'slug' ? 'Slugs only' : d.ammoClass === 'shotgun' ? 'Shells / slugs' : `${d.ammoClass[0].toUpperCase()}${d.ammoClass.slice(1)} ammo`],
      ['Damage', d.pellets ? `${d.dmg} × ${d.pellets}` : d.dmg], ['Fire rate', `${d.rpm} RPM`], ['Action', d.mode], ['Magazine', d.noReload ? `${d.mag} (no reload)` : d.mag],
      ['Effective range', `${d.range} m`]);
    if (d.penBonus) rows.push(['Penetration', `+${d.penBonus}`]);
    if (d.tube) rows.push(['Underbarrel', `${d.tube.mag}-shell 12 ga tube`]);
    const att = [...(d.mags || []), ...(d.optics || [])].map((a) => ITEMS[a].name);
    rows.push(['Attachments', att.length ? att.join(', ') : 'none']);
  } else if (d.melee) rows.push(['Damage', d.dmg], ...(d.shootRange ? [['Blade launch', `${d.shootDmg} dmg, straight to ${d.shootRange} m`]] : []));
  if (d.wear === 'vest' || d.wear === 'helmet') rows.push(['Protection level', d.level], ['Durability', armorDurability(d.level)], ['Stops', d.level >= 10 ? 'Everything; .50 cal needs two hits' : `Up to penetration ${d.level - 1}`]);
  if (d.wear === 'pack') rows.push(['Slots', BACKPACK_SLOTS[d.level]]);
  if (d.cold) rows.push(['Cold protection', `+${d.cold} °C`]);
  if (d.heat) rows.push(['Heat protection', `${d.heat > 0 ? '+' : ''}${d.heat} °C`]);
  if (d.cat === 'ammo') rows.push(['Penetration', AMMO[d.ammo].pen], ...(AMMO[d.ammo].explosive ? [['Explosive', `${AMMO[d.ammo].blastDmg} dmg, ${AMMO[d.ammo].blast} m`]] : []));
  if (d.cloth) rows.push(['Cloth needed', d.cloth]);
  return rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
}

export function renderTerminal(hud, game) {
  const T = hud.term, save = game.save, pob = game.pob;
  const tabs = ['print', 'queue', 'locker'].map((t) => `<button class="ttab ${T.tab === t ? 'on' : ''}" data-tact="tab" data-v="${t}">${t.toUpperCase()}${t === 'queue' && save.queue.length ? ` (${save.queue.length})` : ''}${t === 'locker' && save.locker.length ? ` (${save.locker.length})` : ''}</button>`).join('');
  let body = '';
  if (T.tab === 'print') {
    const cats = CATEGORIES.map((c) => `<button class="chip ${T.cat === c.id ? 'on' : ''}" data-tact="cat" data-v="${c.id}">${c.name}</button>`).join('');
    let list = craftable().filter((d) => (T.cat === 'all' || d.cat === T.cat) && (!T.q || `${d.name} ${d.sub || ''} ${d.caliber || ''} ${d.desc || ''}`.toLowerCase().includes(T.q.toLowerCase())));
    if (T.afford) list = list.filter((d) => d.cost <= save.bank && (!d.cloth || (save.cloth || 0) >= d.cloth));
    const order = CATEGORIES.map((c) => c.id);
    const sorters = {
      name: (a, b) => a.name.localeCompare(b.name), cost: (a, b) => a.cost - b.cost, costd: (a, b) => b.cost - a.cost,
      time: (a, b) => a.time - b.time, cat: (a, b) => order.indexOf(a.cat) - order.indexOf(b.cat) || a.cost - b.cost,
    };
    list.sort(sorters[T.sort]);
    if (!T.sel || !ITEMS[T.sel]) T.sel = list[0] ? list[0].id : null;
    const rows = list.map((d) => {
      const ok = d.cost <= save.bank && (!d.cloth || (save.cloth || 0) >= d.cloth);
      return `<div class="trow ${T.sel === d.id ? 'sel' : ''} ${ok ? '' : 'poor'}" data-tact="sel" data-v="${d.id}">
        <span class="tn">${esc(d.name)}<small>${esc(d.sub || CATEGORIES.find((c) => c.id === d.cat).name)}</small></span>
        <span class="tc">◆ ${d.cost}${d.cloth ? ` +${d.cloth}🧵` : ''}</span><span class="tt">${fmtDuration(d.time)}</span></div>`;
    }).join('') || '<p class="emptytxt">Nothing matches.</p>';
    const d = T.sel ? ITEMS[T.sel] : null;
    const err = d ? pob.canPrint(d.id) : null;
    const detail = d ? `<h2>${esc(d.name)}</h2><p class="tdesc">${esc(d.desc || '')}</p><table class="tstats">${stats(d)}</table>
      <div class="tcost"><span>◆ ${d.cost} filament</span><span>⏱ ${fmtDuration(d.time)}</span></div>
      <button class="big" data-tact="print" ${err ? 'disabled' : ''}>PRINT</button>${err ? `<p class="terr">${esc(err)}</p>` : ''}` : '';
    body = `<div class="tcats">${cats}</div>
      <div class="tbar"><input id="tsearch" type="search" placeholder="Search ${list.length} blueprints…" value="${esc(T.q)}" data-tin="q">
        <select data-tin="sort">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${T.sort === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <label class="tcheck"><input type="checkbox" data-tin="afford" ${T.afford ? 'checked' : ''}> Affordable only</label></div>
      <div class="tsplit"><div class="tlist">${rows}</div><div class="tdetail">${detail}</div></div>`;
  } else if (T.tab === 'queue') {
    const now = Date.now();
    body = save.queue.length ? save.queue.map((j, i) => {
      const d = ITEMS[j.id], running = now >= j.start;
      const p = running ? Math.min(1, (now - j.start) / (j.end - j.start)) : 0;
      return `<div class="qrow"><b>${esc(d.name)}</b><div class="qbar"><i style="width:${p * 100}%"></i></div>
        <span>${running ? `${Math.floor(p * 100)}% · ${fmtDuration((j.end - now) / 1000)} left` : `starts in ${fmtDuration((j.start - now) / 1000)}`}</span>
        <button data-tact="cancel" data-v="${i}">Cancel (refund)</button></div>`;
    }).join('') : '<p class="emptytxt">The printer is idle. Pick something in PRINT.</p>';
    body = `<div class="tqueue">${body}</div><p class="note">Prints keep running in real time, even when you're out in the field or the game is closed. Finished items go to your locker.</p>`;
  } else {
    const inv = game.player.inv;
    const locker = save.locker.map((it, i) => `<div class="lrow"><div class="nm">${esc(describeItem(it))}</div><button data-tact="take" data-v="${i}">Take</button></div>`).join('') || '<p class="emptytxt">Locker is empty.</p>';
    const carried = [];
    inv.weapons.forEach((w, i) => { if (w) carried.push([`w${i}`, w]); });
    for (const k of ['melee', 'throwing', 'flare', 'vest', 'helmet', 'pack', 'clothing', 'suit']) if (inv[k]) carried.push([k, inv[k]]);
    inv.bag.forEach((it, i) => carried.push([`b${i}`, it]));
    const mine = carried.map(([k, it]) => `<div class="lrow"><div class="nm">${esc(describeItem(it))}</div><button data-tact="store" data-v="${k}">Store</button></div>`).join('') || '<p class="emptytxt">You carry nothing storable.</p>';
    body = `<div class="tsplit"><div class="tlist"><h3>Locker (${save.locker.length})</h3>${locker}</div><div class="tlist"><h3>Carried</h3>${mine}
      <button class="wide" data-tact="storeammo">Store all ammo &amp; meds</button></div></div>`;
  }
  return `<div class="terminal">
    <header><div class="tlogo">POB TERMINAL <span>Printing Operations Base · Sector 12</span></div>
      <div class="tbank">◆ ${save.bank} <small>filament</small> · 🧵 ${save.cloth || 0} <small>cloth</small></div></header>
    <nav>${tabs}</nav>${body}
    <p class="phint">Deposit filament at the yellow crate next to the screen · <kbd>E</kbd>/<kbd>Esc</kbd> close</p></div>`;
}

export function onTerminalClick(hud, game, e) {
  const b = e.target.closest('[data-tact]');
  if (!b) return;
  const T = hud.term, v = b.dataset.v;
  const inv = game.player.inv, save = game.save;
  switch (b.dataset.tact) {
    case 'tab': T.tab = v; break;
    case 'cat': T.cat = v; T.sel = null; break;
    case 'sel': T.sel = v; break;
    case 'print': {
      const err = game.pob.enqueue(T.sel);
      if (err) game.hud.toast(err, '#ff6a5a'); else { game.audio.deposit(); game.hud.toast(`Queued: ${ITEMS[T.sel].name}`, '#46ffb0'); }
      break;
    }
    case 'cancel': game.pob.cancel(+v); break;
    case 'take': {
      const it = save.locker[+v];
      if (it && inv.add(it)) { save.locker.splice(+v, 1); game.audio.pickup(); } else game.hud.toast('No room — backpack full', '#ff6a5a');
      break;
    }
    case 'store': {
      let it = null;
      if (v[0] === 'w') { it = inv.weapons[+v[1]]; inv.weapons[+v[1]] = null; }
      else if (v[0] === 'b') { it = inv.bag.splice(+v.slice(1), 1)[0]; }
      else { it = inv[v]; inv[v] = null; }
      if (it) save.locker.push(it);
      break;
    }
    case 'storeammo': {
      const before = inv.allItems().filter((it) => ITEMS[it.id] && (ITEMS[it.id].cat === 'ammo' || ITEMS[it.id].cat === 'medical'));
      save.locker.push(...before);
      for (const k in inv.ammo) inv.ammo[k] = 0;
      for (const k in inv.meds) inv.meds[k] = 0;
      break;
    }
  }
  game.player.refreshHeld();
  game.saveCarry();
  hud.renderPanel(game);
}

export function onTerminalInput(hud, e) {
  const k = e.target.dataset.tin;
  if (!k) return;
  const T = hud.term;
  if (k === 'q') {
    T.q = e.target.value;
    const pos = e.target.selectionStart;
    hud.renderPanel(hud.game);
    const el = document.getElementById('tsearch');
    if (el) { el.focus(); el.setSelectionRange(pos, pos); }
    return;
  }
  if (k === 'sort') T.sort = e.target.value;
  if (k === 'afford') T.afford = e.target.checked;
  hud.renderPanel(hud.game);
}
