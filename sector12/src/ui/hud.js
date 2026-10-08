// In-game HUD, minimap/tactical map, inventory + loot panels. The POB terminal lives in terminal.js.
import { ITEMS, AMMO, ammoOptions, BACKPACK_SLOTS } from '../data/catalog.js';
import { describeItem, magSize, isGun } from '../inventory.js';
import { gunParams } from '../player.js';
import { POIS, REGIONS, WORLD } from '../terrain.js';
import { renderTerminal, onTerminalClick, onTerminalInput } from './terminal.js';

const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmtHour = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
const WEATHER_ICON = { rain: '🌧', blizzard: '❄', sandstorm: '🌪', tornado: '🌀' };

export class HUD {
  constructor(audio) {
    this.audio = audio;
    this.root = $('hud');
    this.compass = $('compass').getContext('2d');
    this.mini = $('minimap').getContext('2d');
    this.bigmap = $('bigmap-canvas').getContext('2d');
    this.cache = {};
    this.hitT = 0;
    this.game = null;
    this.term = { tab: 'print', cat: 'all', q: '', sort: 'name', sel: null };
    $('panel').addEventListener('click', (e) => this.onPanelClick(e));
    $('panel').addEventListener('input', (e) => { if (this.game && this.game.ui === 'terminal') onTerminalInput(this, e); });
    $('panel').addEventListener('change', (e) => { if (this.game && this.game.ui === 'terminal') onTerminalInput(this, e); });
    // map images are built by a worker from the real terrain
    this.islandImg = null;
    this.tile = null;
    this.tileReq = null;
    try {
      this.mapWorker = new Worker(new URL('../terrainWorker.js', import.meta.url), { type: 'module' });
      this.mapWorker.onmessage = (e) => this.onMap(e.data);
      this.mapWorker.postMessage({ type: 'map', id: 'island', cx: 0, cz: 0, span: WORLD.size, px: 768 });
    } catch (e) { this.mapWorker = null; }
  }

  onMap(m) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = m.w;
    cv.getContext('2d').putImageData(new ImageData(m.px, m.w, m.w), 0, 0);
    if (m.id === 'island') this.islandImg = cv;
    else { this.tile = { img: cv, ...this.tileReq }; this.tileReq = null; }
  }

  show() { this.root.classList.remove('hidden'); $('banner').className = 'hidden'; $('toasts').innerHTML = ''; $('killfeed').innerHTML = ''; }
  hide() { this.root.classList.add('hidden'); $('panel').classList.add('hidden'); $('bigmap').classList.add('hidden'); $('banner').className = 'hidden'; }

  set(id, html) {
    if (this.cache[id] === html) return;
    this.cache[id] = html;
    $(id).innerHTML = html;
  }

  // ---------------------------------------------------------------- per frame
  update(game, dt) {
    this.game = game;
    const P = game.player, inv = P.inv, st = P.status;

    // top-left: where / when / how cold
    const reg = REGIONS[P.region] || REGIONS.hub;
    const w = game.env.local;
    const wx = Object.entries({ rain: w.rain, blizzard: w.snow > 0.3 ? w.snow : 0, sandstorm: w.sand, tornado: w.tornado }).filter(([, v]) => v > 0.2).map(([k]) => WEATHER_ICON[k]).join(' ');
    const temp = Math.round(P.ambient);
    const tcol = temp < 0 ? '#9fd0ff' : temp > 38 ? '#ff9a5a' : '#e8e8e8';
    this.set('where', `<b style="color:${reg.color}">${reg.name}</b><span>${fmtHour(game.hour)} · <i style="color:${tcol}">${temp}°C</i> ${wx}${game.inSafeZone(P.pos) ? ' · <i class="safe">SAFE ZONE</i>' : ''}</span>`);

    // vitals
    $('hpfill').style.width = `${clamp(P.hp, 0, 100)}%`;
    $('hpfill').style.background = P.hp < 35 ? '#ff4a3a' : '#e8e8e8';
    const armorBar = (it) => it ? `<span class="ab"><i style="width:${clamp((it.dur / (40 + it.level * 25)) * 100, 0, 100)}%"></i><em>L${it.level}</em></span>` : '<span class="ab none"><em>—</em></span>';
    this.set('armor', `${armorBar(inv.vest)}${armorBar(inv.helmet)}`);
    const tags = [];
    if (st.bleedHeavy) tags.push(`<b class="t-red">HEAVY BLEED${st.bleedHeavy > 1 ? ' ×' + st.bleedHeavy : ''}</b>`);
    if (st.bleedLight) tags.push(`<b class="t-org">BLEEDING${st.bleedLight > 1 ? ' ×' + st.bleedLight : ''}</b>`);
    if (st.fracture) tags.push('<b class="t-org">FRACTURE</b>');
    if (st.fragments) tags.push(`<b class="t-org">FRAGMENTS ×${st.fragments}</b>`);
    if (P.coldEx > 1) tags.push(`<b class="t-blue">COLD ${Math.round(P.coldEx)}%</b>`);
    if (P.heatEx > 1) tags.push(`<b class="t-org">HEAT ${Math.round(P.heatEx)}%</b>`);
    if (st.adrenaline) tags.push(`<b class="t-grn">ADRENALINE ${Math.ceil(st.adrenaline)}s</b>`);
    if (st.numb) tags.push(`<b class="t-grn">NUMB ${Math.ceil(st.numb)}s</b>`);
    if (st.warm) tags.push(`<b class="t-grn">WARMERS ${Math.ceil(st.warm / 60)}m</b>`);
    if (P.busyT > 0) tags.push('<b class="t-cyan">TREATING…</b>');
    this.set('status', tags.join(''));
    this.set('kit', `<span class="fil">◆ ${inv.filament} filament</span><span>🎒 ${inv.bag.length}/${inv.capacity}</span><span>✚ ${inv.meds.bandage + inv.meds.gauze + inv.meds.medkit}</span>`);

    // weapon
    const it = P.held, d = it ? ITEMS[it.id] : null;
    if (d && isGun(d)) {
      const Pm = gunParams(it), type = it.alt ? it.tubeAmmo : it.ammo, A = AMMO[type];
      const loaded = it.alt ? it.tube : it.mag, cap = it.alt ? d.tube.mag : magSize(it);
      this.set('wname', `${esc(d.name)}${it.alt ? ' <small>12G TUBE</small>' : ''}`);
      this.set('wammo', `<b class="${loaded <= Math.ceil(cap * 0.25) ? 'low' : ''}">${loaded}</b><span>/ ${P.inv.ammo[type]}</span><em style="color:${A.color}">${A.short}</em>`);
      let s = '';
      if (P.reloadT > 0) s = 'RELOADING';
      else if (d.noReload && loaded === 0) s = 'EMPTY — CAN\'T RELOAD';
      else if (loaded === 0) s = P.inv.ammo[type] ? 'RELOAD [R]' : `NO ${A.short} AMMO · [T] SWITCH`;
      else if (Pm.mode === 'pump' || Pm.mode === 'bolt') s = Pm.mode.toUpperCase();
      this.set('wstatus', s);
    } else if (d) {
      this.set('wname', esc(d.name));
      this.set('wammo', d.throwable ? `<b>${it.count}</b>` : it.id === 'flaregun' ? `<b>${it.shots}</b><span>/ 2</span>` : it.id === 'co2knife' ? `<b>${it.loaded ? 1 : 0}</b><span>blade</span>` : '');
      this.set('wstatus', it.id === 'co2knife' ? '[RMB] FIRE BLADE' : '');
    } else { this.set('wname', 'Unarmed'); this.set('wammo', ''); this.set('wstatus', ''); }
    this.set('slots', ['w0', 'w1', 'melee', 'throw', 'flare'].map((s, i) => { const x = P.itemIn(s); return `<span class="${P.slot === s ? 'on' : ''} ${x ? '' : 'empty'}">${i + 1}</span>`; }).join(''));

    // prompt + extraction
    this.set('prompt', game.focus ? `<kbd>E</kbd> ${esc(game.focus.label)}` : '');
    this.set('exfil', game.extraction.status());

    // crosshair / scope
    const ch = $('crosshair');
    if (d && isGun(d)) {
      const Pm = gunParams(it);
      ch.style.setProperty('--gap', `${6 + (Pm.spread + P.bloom) * (P.moving ? 1.5 : 1) * 900}px`);
      ch.style.opacity = 1 - P.adsT * 1.6;
    } else { ch.style.setProperty('--gap', '4px'); ch.style.opacity = 0.7; }
    $('scope').style.display = P.scoped ? 'block' : 'none';
    $('vignette').style.opacity = clamp((60 - P.hp) / 60, 0, 0.85);
    $('frost').style.opacity = clamp((P.coldEx - 30) / 70, 0, 0.8);
    $('heat').style.opacity = clamp((P.heatEx - 30) / 70, 0, 0.7);
    this.hitT -= dt;
    if (this.hitT <= 0) $('hitmarker').style.opacity = 0;

    this.drawCompass(game);
    this.drawMinimap(game);
    if (game.mapOpen) this.drawBigMap(game);
  }

  // ---------------------------------------------------------------- events
  hitmarker(kill, head, armor) {
    const h = $('hitmarker');
    h.style.opacity = 1;
    h.style.color = kill ? '#ff3b2f' : head ? '#ffd23f' : armor ? '#7fb8ff' : '#ffffff';
    h.style.transform = `translate(-50%,-50%) scale(${kill ? 1.5 : 1})`;
    this.hitT = kill ? 0.3 : 0.12;
  }

  damageFrom(pos) {
    const g = this.game;
    if (!g) return;
    const P = g.player;
    const ang = Math.atan2(pos.x - P.pos.x, -(pos.z - P.pos.z)) + P.yaw;
    const el = document.createElement('div');
    el.className = 'dmgarc';
    el.style.transform = `translate(-50%,-50%) rotate(${ang}rad)`;
    $('dmgdirs').appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  toast(msg, color = '#fff', dur = 2.5) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.color = color;
    el.textContent = msg;
    const box = $('toasts');
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.classList.add('fade'), dur * 1000);
    setTimeout(() => el.remove(), dur * 1000 + 600);
  }

  feed(msg, color) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.color = color;
    const box = $('killfeed');
    box.prepend(el);
    while (box.children.length > 5) box.lastChild.remove();
    setTimeout(() => el.remove(), 6000);
  }

  banner(title, sub, ok) {
    const b = $('banner');
    b.className = ok ? 'ok' : 'bad';
    b.innerHTML = `<h1>${esc(title)}</h1><p>${esc(sub)}</p>`;
  }

  showMap(open, game) {
    $('bigmap').classList.toggle('hidden', !open);
    if (open) this.drawBigMap(game);
  }

  // ---------------------------------------------------------------- compass
  drawCompass(game) {
    const g = this.compass, W = g.canvas.width;
    g.clearRect(0, 0, W, g.canvas.height);
    const P = game.player;
    const heading = ((-P.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const ppd = W / 180;
    const xOf = (deg) => { let d = deg - heading; d = ((d + 540) % 360) - 180; return W / 2 + d * ppd; };
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, W, 22);
    g.textAlign = 'center';
    g.font = '600 12px ui-monospace, Menlo, monospace';
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = 0; d < 360; d += 15) {
      const x = xOf(d);
      if (x < 0 || x > W) continue;
      if (names[d] !== undefined) { g.fillStyle = d === 0 ? '#ffd23f' : '#fff'; g.fillText(names[d], x, 15); }
      else { g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x - 0.5, 5, 1, 10); }
    }
    for (const m of game.markers()) {
      if (m.kind === 'enemy') continue;
      const dx = m.x - P.pos.x, dz = m.z - P.pos.z;
      const b = ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360;
      const x = clamp(xOf(b), 8, W - 8);
      g.fillStyle = m.color;
      g.beginPath(); g.moveTo(x, 24); g.lineTo(x + 5, 30); g.lineTo(x, 36); g.lineTo(x - 5, 30); g.fill();
      g.font = '10px ui-monospace, Menlo, monospace';
      const dist = Math.hypot(dx, dz);
      g.fillText(dist > 1000 ? `${(dist / 1000).toFixed(1)}km` : `${Math.round(dist)}m`, x, 47);
    }
    g.fillStyle = '#fff';
    g.fillRect(W / 2 - 1, 0, 2, 22);
  }

  // ---------------------------------------------------------------- minimap (local terrain tile, rotates with you)
  drawMinimap(game) {
    const g = this.mini, S = g.canvas.width, R = S / 2;
    const P = game.player;
    const SPAN = 1400, VIEW = 160; // tile span (m), view radius (m)
    if (this.mapWorker && !this.tileReq && (!this.tile || Math.hypot(P.pos.x - this.tile.cx, P.pos.z - this.tile.cz) > SPAN * 0.3)) {
      this.tileReq = { cx: P.pos.x, cz: P.pos.z, span: SPAN };
      this.mapWorker.postMessage({ type: 'map', id: 'tile', cx: P.pos.x, cz: P.pos.z, span: SPAN, px: 320 });
    }
    const s = R / VIEW;
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#1d5f80'; g.fillRect(0, 0, S, S);
    g.translate(R, R);
    g.rotate(P.yaw);
    const t = this.tile;
    if (t) {
      const k = t.img.width / t.span;
      const x0 = (t.cx - t.span / 2), z0 = (t.cz - t.span / 2);
      g.drawImage(t.img, (P.pos.x - VIEW * 1.5 - x0) * k, (P.pos.z - VIEW * 1.5 - z0) * k, VIEW * 3 * k, VIEW * 3 * k, -VIEW * 1.5 * s, -VIEW * 1.5 * s, VIEW * 3 * s, VIEW * 3 * s);
    }
    for (const m of game.markers()) {
      let x = (m.x - P.pos.x) * s, z = (m.z - P.pos.z) * s;
      const d = Math.hypot(x, z);
      if (d > R - 8) { if (m.kind === 'enemy') continue; x *= (R - 8) / d; z *= (R - 8) / d; }
      g.fillStyle = m.color;
      g.beginPath();
      if (m.kind === 'enemy') g.arc(x, z, 3.5, 0, 7);
      else { g.save(); g.translate(x, z); g.rotate(-P.yaw); g.rect(-4, -4, 8, 8); g.restore(); }
      g.fill();
    }
    g.restore();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(R, R - 8); g.lineTo(R + 5, R + 6); g.lineTo(R, R + 3); g.lineTo(R - 5, R + 6); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.stroke();
  }

  drawBigMap(game) {
    const g = this.bigmap, S = g.canvas.width;
    const P = game.player, H = WORLD.half, s = S / WORLD.size;
    const X = (x) => (x + H) * s, Z = (z) => (z + H) * s;
    g.fillStyle = '#1d5f80'; g.fillRect(0, 0, S, S);
    if (this.islandImg) g.drawImage(this.islandImg, 0, 0, S, S);
    else { g.fillStyle = '#fff'; g.font = '16px monospace'; g.fillText('Charting Sector 12…', 20, 30); }
    // weather
    for (const w of game.env.markers()) {
      g.fillStyle = w.type === 'tornado' ? 'rgba(255,80,60,0.5)' : w.type === 'sandstorm' ? 'rgba(230,180,100,0.22)' : w.type === 'blizzard' ? 'rgba(230,240,255,0.25)' : 'rgba(120,150,200,0.22)';
      g.beginPath(); g.arc(X(w.x), Z(w.z), Math.max(5, w.r * s), 0, 7); g.fill();
    }
    g.textAlign = 'center';
    // region names
    g.font = '700 16px ui-monospace, Menlo, monospace';
    for (const [k, [x, z]] of Object.entries({ n: [0, -15500], s: [0, 16000], e: [15000, -6000], w: [-15000, -6000] })) {
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillText(REGIONS[k].name.toUpperCase(), X(x) + 1, Z(z) + 1);
      g.fillStyle = REGIONS[k].color; g.fillText(REGIONS[k].name.toUpperCase(), X(x), Z(z));
    }
    g.font = '11px ui-monospace, Menlo, monospace';
    for (const p of POIS) {
      if (p.kind === 'pob' || p.kind === 'extract') continue;
      g.fillStyle = '#fff'; g.fillRect(X(p.x) - 2, Z(p.z) - 2, 4, 4);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(p.name, X(p.x) + 1, Z(p.z) - 6);
      g.fillStyle = '#f2f2f2'; g.fillText(p.name, X(p.x), Z(p.z) - 7);
    }
    for (const m of game.markers()) {
      if (m.kind === 'enemy') { g.fillStyle = m.color; g.beginPath(); g.arc(X(m.x), Z(m.z), 4, 0, 7); g.fill(); continue; }
      g.fillStyle = m.color;
      g.fillRect(X(m.x) - 6, Z(m.z) - 6, 12, 12);
      g.font = '700 12px ui-monospace, Menlo, monospace';
      g.fillStyle = '#000'; g.fillText(m.label, X(m.x) + 1, Z(m.z) + 22);
      g.fillStyle = m.color; g.fillText(m.label, X(m.x), Z(m.z) + 21);
    }
    g.save();
    g.translate(X(P.pos.x), Z(P.pos.z));
    g.rotate(-P.yaw);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.stroke(); g.fill();
    g.restore();
    // scale bar
    g.fillStyle = '#fff'; g.fillRect(20, S - 24, 5000 * s, 3);
    g.font = '11px monospace'; g.textAlign = 'left'; g.fillText('5 km', 20, S - 30);
  }

  // ---------------------------------------------------------------- panels
  renderPanel(game) {
    this.game = game;
    const el = $('panel');
    if (!game.ui) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    if (game.ui === 'terminal') { el.innerHTML = renderTerminal(this, game); return; }
    el.innerHTML = this.renderInventory(game) + (game.ui === 'loot' && game.lootTarget ? this.renderLoot(game.lootTarget) : '') +
      '<div class="phint"><kbd>E</kbd>/<kbd>Tab</kbd>/<kbd>Esc</kbd> close · the world keeps moving while you look</div>';
  }

  renderInventory(game) {
    const P = game.player, inv = P.inv;
    const gunRow = (it, slot) => {
      if (!it) return `<div class="slotrow empty"><span>${slot === 0 ? 'Primary' : 'Secondary'}</span><i>empty</i></div>`;
      const d = ITEMS[it.id];
      const att = it.att ? ['mag', 'optic'].filter((k) => it.att[k]).map((k) => `<button data-act="detach" data-w="${slot}" data-k="${k}">${esc(ITEMS[it.att[k]].name)} ✕</button>`).join('') : '';
      const loaded = d.noReload ? `${it.mag}/${d.mag}` : `${it.mag}/${magSize(it)}`;
      return `<div class="slotrow"><span>${slot === 0 ? 'Primary' : 'Secondary'}</span><b>${esc(describeItem(it))}</b><small>${loaded} · ${AMMO[it.ammo] ? AMMO[it.ammo].short : ''}</small><div class="acts">${att}<button data-act="unequip" data-w="${slot}">To bag</button></div></div>`;
    };
    const wearRow = (key, label) => {
      const it = inv[key];
      return `<div class="slotrow ${it ? '' : 'empty'}"><span>${label}</span>${it ? `<b>${esc(describeItem(it))}</b><div class="acts"><button data-act="unwear" data-k="${key}">Remove</button></div>` : '<i>none</i>'}</div>`;
    };
    const simple = (key, label, extra = '') => {
      const it = inv[key];
      return `<div class="slotrow ${it ? '' : 'empty'}"><span>${label}</span>${it ? `<b>${esc(describeItem(it))}</b><small>${extra}</small>` : '<i>none</i>'}</div>`;
    };
    const bag = inv.bag.map((it, i) => {
      const d = ITEMS[it.id];
      const acts = [];
      if (isGun(d)) acts.push(`<button data-act="equipgun" data-i="${i}" data-w="0">Primary</button><button data-act="equipgun" data-i="${i}" data-w="1">Secondary</button>`);
      if (d.wear) acts.push(`<button data-act="wear" data-i="${i}">Wear</button>`);
      if (d.melee && !d.throwable) acts.push(`<button data-act="melee" data-i="${i}">Equip</button>`);
      if (d.cat === 'attachments') for (const w of [0, 1]) { const g = inv.weapons[w]; if (g && (ITEMS[g.id].mags || []).concat(ITEMS[g.id].optics || []).includes(it.id)) acts.push(`<button data-act="attach" data-i="${i}" data-w="${w}">On ${esc(ITEMS[g.id].name)}</button>`); }
      if (d.cat === 'camo') for (const w of [0, 1]) { const g = inv.weapons[w]; if (g) acts.push(`<button data-act="camo" data-i="${i}" data-w="${w}">Paint ${esc(ITEMS[g.id].name)}</button>`); }
      if (d.deploy) acts.push(`<button data-act="place" data-i="${i}">Place</button>`);
      if (it.id === 'flaregun') acts.push(`<button data-act="flare" data-i="${i}">Equip</button>`);
      acts.push(`<button data-act="drop" data-i="${i}">Drop</button>`);
      return `<div class="slot"><div class="nm">${esc(describeItem(it))}</div><div class="vl">${esc(d.sub || d.cat)}</div><div class="acts">${acts.join('')}</div></div>`;
    }).join('') + Array.from({ length: Math.max(0, inv.capacity - inv.bag.length) }, () => '<div class="slot empty"></div>').join('');
    const ammo = Object.entries(inv.ammo).filter(([, v]) => v > 0).map(([k, v]) => `<span style="color:${AMMO[k].color}">${AMMO[k].short} ${v}</span>`).join('') || '<i>none</i>';
    const meds = Object.entries(inv.meds).filter(([, v]) => v > 0).map(([k, v]) => `<button data-act="med" data-k="${k}">${esc(ITEMS[k].name)} ×${v}</button>`).join('') || '<i>none</i>';
    return `<div class="pcol">
      <h3>Equipped</h3>
      ${gunRow(inv.weapons[0], 0)}${gunRow(inv.weapons[1], 1)}
      ${simple('melee', 'Melee')}${simple('throwing', 'Throwing')}${simple('flare', 'Flare gun', inv.flare ? `${inv.flare.shots}/2 shots` : '')}
      ${wearRow('vest', 'Vest')}${wearRow('helmet', 'Helmet')}${wearRow('pack', 'Backpack')}${wearRow('clothing', 'Clothing')}${wearRow('suit', 'Camo suit')}
      <h3>Pouch</h3>
      <div class="pouch"><span class="fil">◆ ${inv.filament} filament</span><span>🧵 ${inv.cloth} cloth</span></div>
      <div class="pouch">${ammo}</div>
      <div class="pouch meds">${meds}</div>
    </div>
    <div class="pcol">
      <h3>Backpack <span>${inv.bag.length}/${inv.capacity}</span></h3>
      <div class="slots">${bag}</div>
    </div>`;
  }

  renderLoot(c) {
    const rows = (c.items || []).map((it, i) => `<div class="lrow" data-act="take" data-i="${i}"><div class="nm">${esc(describeItem(it))}</div><button data-act="take" data-i="${i}">Take</button></div>`).join('') || '<p class="emptytxt">Empty</p>';
    return `<div class="pcol loot"><h3>${esc(c.name)}</h3>${rows}${c.items && c.items.length ? '<button class="big" data-act="takeall">Take All</button>' : ''}</div>`;
  }

  onPanelClick(e) {
    const g = this.game;
    if (!g) return;
    if (g.ui === 'terminal') { onTerminalClick(this, g, e); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    e.stopPropagation();
    const P = g.player, inv = P.inv, i = +b.dataset.i, w = +b.dataset.w;
    const act = b.dataset.act;
    const toBag = (it) => { if (inv.bagFull) { g.hud.toast('Backpack full', '#ff6a5a'); return false; } inv.bag.push(it); return true; };
    switch (act) {
      case 'take': g.takeItem(g.lootTarget, i); break;
      case 'takeall': g.takeAll(g.lootTarget); break;
      case 'drop': g.dropFromBag(i); break;
      case 'equipgun': { const it = inv.bag[i]; const old = inv.weapons[w]; inv.weapons[w] = it; inv.bag.splice(i, 1); if (old) inv.bag.push(old); break; }
      case 'unequip': { const it = inv.weapons[w]; if (it && toBag(it)) inv.weapons[w] = null; break; }
      case 'wear': { const old = inv.equip(inv.bag[i]); if (old) g.dropFromBag(inv.bag.push(old) - 1); break; }
      case 'unwear': { const k = b.dataset.k; if (inv[k] && toBag(inv[k])) inv[k] = null; break; }
      case 'melee': { const it = inv.bag.splice(i, 1)[0]; if (inv.melee) inv.bag.push(inv.melee); inv.melee = it; break; }
      case 'flare': { const it = inv.bag.splice(i, 1)[0]; if (inv.flare) inv.bag.push(inv.flare); inv.flare = it; break; }
      case 'attach': {
        const att = inv.bag[i], gun = inv.weapons[w], slot = ITEMS[att.id].slot;
        inv.bag.splice(i, 1);
        if (gun.att[slot]) inv.bag.push({ uid: att.uid + 'o', id: gun.att[slot] });
        gun.att[slot] = att.id;
        if (slot === 'mag') { const cap = magSize(gun); if (gun.mag > cap) { inv.ammo[gun.ammo] += gun.mag - cap; gun.mag = cap; } }
        this.audio.pickup();
        break;
      }
      case 'detach': {
        const gun = inv.weapons[w], k = b.dataset.k;
        if (inv.bagFull) { g.hud.toast('Backpack full', '#ff6a5a'); break; }
        inv.bag.push({ uid: 'a' + Math.random(), id: gun.att[k] });
        gun.att[k] = null;
        if (k === 'mag') { const cap = magSize(gun); if (gun.mag > cap) { inv.ammo[gun.ammo] += gun.mag - cap; gun.mag = cap; } }
        break;
      }
      case 'camo': { const c = inv.bag.splice(i, 1)[0]; inv.weapons[w].camo = c.id; this.audio.pickup(); g.hud.toast(`${ITEMS[c.id].name} applied`, '#46ffb0'); break; }
      case 'place': g.placeBuilding(i); break;
      case 'med': P.useMed(b.dataset.k); break;
    }
    P.refreshHeld();
    this.renderPanel(g);
  }
}
