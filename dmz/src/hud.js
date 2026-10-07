// In-raid HUD: vitals, ammo, compass, minimap, tactical map, prompts, inventory/loot panel.
import { AMMO, RARITY, RAID, MAX_PLATES } from './data.js';
import { describe } from './loot.js';
import { fmtTime, fmtCash, clamp } from './rng.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class HUD {
  constructor(audio) {
    this.audio = audio;
    this.root = $('hud');
    this.compass = $('compass').getContext('2d');
    this.mini = $('minimap').getContext('2d');
    this.bigmap = $('bigmap-canvas').getContext('2d');
    this.cache = {};
    this.hitT = 0;
    this.raid = null;
    $('panel').addEventListener('click', (e) => this.onPanelClick(e));
  }

  show() { this.root.classList.remove('hidden'); $('banner').className = 'hidden'; $('toasts').innerHTML = ''; $('killfeed').innerHTML = ''; }
  hide() {
    this.root.classList.add('hidden');
    $('panel').classList.add('hidden');
    $('bigmap').classList.add('hidden');
    $('banner').className = 'hidden';
  }

  set(id, html) {
    if (this.cache[id] === html) return;
    this.cache[id] = html;
    $(id).innerHTML = html;
  }

  update(raid, dt) {
    this.raid = raid;
    const P = raid.player;
    const g = P.gun;

    // vitals
    $('hpfill').style.width = `${clamp(P.hp, 0, 100)}%`;
    $('hpfill').style.background = P.hp < 35 ? '#ff4a3a' : '#e8e8e8';
    const segs = $('armor').children;
    for (let i = 0; i < MAX_PLATES; i++) segs[i].firstChild.style.width = `${clamp((P.armor - i * 50) / 50, 0, 1) * 100}%`;
    this.set('kit', `<span title="Spare plates">▣ ${P.plates}</span><span title="Self-revive">✚ ${P.revives}</span><span class="cash">${fmtCash(P.cash)}</span><span title="Backpack">🎒 ${P.bag.length}/${P.bagCap}</span>`);

    // weapon
    const reserve = P.ammo[g.def.ammo];
    const low = g.mag <= Math.ceil(g.def.mag * 0.25);
    this.set('wname', `${esc(g.def.name)} <small>${AMMO[g.def.ammo].name}</small>`);
    this.set('wammo', `<b class="${low ? 'low' : ''}">${g.mag}</b><span>/ ${reserve}</span>`);
    let status = '';
    if (P.reloadT > 0) status = 'RELOADING';
    else if (P.plateT > 0) status = 'APPLYING PLATE';
    else if (g.mag === 0 && reserve === 0) status = 'NO AMMO';
    else if (low) status = 'RELOAD [R]';
    this.set('wstatus', status);

    // timer / contract
    const left = RAID.duration - raid.time;
    let radTxt = raid.time < RAID.radStart ? `Radiation in ${fmtTime(RAID.radStart - raid.time)}` : 'RADIATION CLOSING';
    this.set('timer', `<b>${fmtTime(left)}</b><span class="${raid.time >= RAID.radStart ? 'warn' : ''}">${radTxt}</span>`);
    const c = raid.contract;
    let cstage = c.done ? '<i class="ok">✓ COMPLETE</i>' : c.stage === 'exfil' ? '<i class="go">→ EXFIL WITH THE INTEL</i>' : '';
    this.set('contract', `<h4>CONTRACT · ${esc(c.title)}</h4><p>${esc(c.desc)}</p>${cstage}`);

    // prompt
    let prompt = '';
    const f = raid.focus;
    if (f && f.type === 'container') {
      const n = f.c.items.length;
      prompt = f.c.opened ? `<kbd>E</kbd> Loot ${esc(f.c.name)} <small>(${n})</small>` : `<kbd>E</kbd> Search ${esc(f.c.name)}`;
    } else if (f && f.type === 'exfil') prompt = `<kbd>E</kbd> Call Exfil ${esc(f.ex.name)}`;
    this.set('prompt', prompt);

    // exfil status
    const ex = raid.activeExfil;
    let exs = '';
    if (ex) {
      if (ex.state === 'called') exs = `EXFIL ${ex.name.toUpperCase()} · Chopper inbound <b>${fmtTime(ex.t)}</b><br><small>Defend the LZ</small>`;
      else if (ex.state === 'arriving') exs = `EXFIL ${ex.name.toUpperCase()} · Chopper landing…`;
      else if (ex.state === 'landed') exs = `GET IN THE CHOPPER · leaves in <b>${fmtTime(ex.t)}</b><div class="bar"><div style="width:${(ex.board / RAID.board) * 100}%"></div></div>`;
      else if (ex.state === 'leaving') exs = 'Chopper departing';
    }
    this.set('exfil', exs);

    // crosshair / scope
    const ads = P.adsT;
    const sp = (g.def.spread + P.bloom) * (P.moving ? 1.5 : 1) * (P.crouch ? 0.75 : 1);
    const gap = 6 + sp * 900;
    const ch = $('crosshair');
    ch.style.setProperty('--gap', `${gap}px`);
    ch.style.opacity = P.downed ? 0 : 1 - ads * 1.6;
    $('scope').style.display = g.def.scope && ads > 0.92 ? 'block' : 'none';

    // damage / radiation / down overlays
    $('vignette').style.opacity = clamp((60 - P.hp) / 60, 0, 0.85);
    $('radtint').style.opacity = raid.inRad ? 0.35 : 0;
    $('downed').style.display = P.downed ? 'flex' : 'none';
    if (P.downed) this.set('downed', `DOWNED<small>Self-reviving… ${P.reviveT.toFixed(1)}s</small>`);

    this.hitT -= dt;
    if (this.hitT <= 0) $('hitmarker').style.opacity = 0;

    this.drawCompass(raid);
    this.drawMinimap(raid);
    if (raid.mapOpen) this.drawBigMap(raid);
  }

  // ---------- events
  hitmarker(kill, head, armor) {
    const h = $('hitmarker');
    h.style.opacity = 1;
    h.style.color = kill ? '#ff3b2f' : head ? '#ffd23f' : armor ? '#7fb8ff' : '#ffffff';
    h.style.transform = `translate(-50%,-50%) scale(${kill ? 1.5 : 1})`;
    this.hitT = kill ? 0.3 : 0.12;
  }

  damageFrom(pos) {
    const raid = this.raid;
    if (!raid) return;
    const P = raid.player;
    const ang = Math.atan2(pos.x - P.pos.x, -(pos.z - P.pos.z)) + P.yaw; // radians, 0 = ahead
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
    setTimeout(() => el.remove(), 5000);
  }

  banner(title, sub, ok) {
    const b = $('banner');
    b.className = ok ? 'ok' : 'bad';
    b.innerHTML = `<h1>${esc(title)}</h1><p>${esc(sub)}</p>`;
  }

  showMap(open, raid) {
    $('bigmap').classList.toggle('hidden', !open);
    if (open) this.drawBigMap(raid);
  }

  // ---------- compass
  drawCompass(raid) {
    const g = this.compass, W = g.canvas.width, H = g.canvas.height;
    g.clearRect(0, 0, W, H);
    const P = raid.player;
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
    for (const m of raid.markers()) {
      if (m.kind === 'enemy') continue;
      const dx = m.x - P.pos.x, dz = m.z - P.pos.z;
      const b = ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360;
      let x = xOf(b);
      x = clamp(x, 8, W - 8);
      g.fillStyle = m.color;
      g.beginPath(); g.moveTo(x, 24); g.lineTo(x + 5, 30); g.lineTo(x, 36); g.lineTo(x - 5, 30); g.fill();
      g.font = '10px ui-monospace, Menlo, monospace';
      g.fillText(`${Math.round(Math.hypot(dx, dz))}m`, x, 47);
    }
    g.fillStyle = '#fff';
    g.fillRect(W / 2 - 1, 0, 2, 22);
    g.font = '11px ui-monospace, Menlo, monospace';
  }

  // ---------- minimap (rotates with the player)
  drawMinimap(raid) {
    const g = this.mini, S = g.canvas.width, R = S / 2;
    const P = raid.player, img = raid.mapImg, H = raid.world.H;
    const k = img.width / (2 * H); // map px per meter
    const view = 85; // meters radius
    const s = R / view; // canvas px per meter
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#2a261f'; g.fillRect(0, 0, S, S);
    g.translate(R, R);
    g.rotate(P.yaw);
    g.drawImage(img, (P.pos.x + H) * k - view * 1.5 * k, (P.pos.z + H) * k - view * 1.5 * k, view * 3 * k, view * 3 * k,
      -view * 1.5 * s, -view * 1.5 * s, view * 3 * s, view * 3 * s);
    // radiation edge
    g.strokeStyle = 'rgba(124,255,74,0.8)'; g.lineWidth = 2;
    g.beginPath(); g.arc((raid.rad.x - P.pos.x) * s, (raid.rad.z - P.pos.z) * s, raid.rad.r * s, 0, Math.PI * 2); g.stroke();
    for (const m of raid.markers()) {
      let x = (m.x - P.pos.x) * s, z = (m.z - P.pos.z) * s;
      const d = Math.hypot(x, z);
      if (m.kind === 'objective' && m.r) {
        g.fillStyle = 'rgba(255,210,63,0.18)';
        g.beginPath(); g.arc(x, z, m.r * s, 0, 7); g.fill();
      }
      if (d > R - 8) { if (m.kind === 'enemy') continue; x *= (R - 8) / d; z *= (R - 8) / d; }
      g.fillStyle = m.color;
      g.beginPath();
      if (m.kind === 'enemy') g.arc(x, z, 3.5, 0, 7);
      else { g.save(); g.translate(x, z); g.rotate(-P.yaw); g.rect(-4, -4, 8, 8); g.restore(); }
      g.fill();
    }
    g.restore();
    // player arrow (always up)
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(R, R - 8); g.lineTo(R + 5, R + 6); g.lineTo(R, R + 3); g.lineTo(R - 5, R + 6); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.stroke();
  }

  drawBigMap(raid) {
    const g = this.bigmap, S = g.canvas.width;
    const P = raid.player, H = raid.world.H, s = S / (2 * H);
    const X = (x) => (x + H) * s, Z = (z) => (z + H) * s;
    g.drawImage(raid.mapImg, 0, 0, S, S);
    // radiation
    g.save();
    g.fillStyle = 'rgba(90,200,60,0.28)';
    g.beginPath(); g.rect(0, 0, S, S); g.arc(X(raid.rad.x), Z(raid.rad.z), raid.rad.r * s, 0, Math.PI * 2, true); g.fill('evenodd');
    g.strokeStyle = '#7cff4a'; g.lineWidth = 2;
    g.beginPath(); g.arc(X(raid.rad.x), Z(raid.rad.z), raid.rad.r * s, 0, Math.PI * 2); g.stroke();
    g.restore();
    g.textAlign = 'center';
    g.font = '700 14px ui-monospace, Menlo, monospace';
    for (const poi of raid.world.pois) {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      const w = g.measureText(poi.name.toUpperCase()).width + 12;
      g.fillRect(X(poi.x) - w / 2, Z(poi.z) - poi.r * s - 22, w, 18);
      g.fillStyle = ['#fff', '#fff', '#ffcf6a', '#ff7a5a'][poi.threat];
      g.fillText(poi.name.toUpperCase(), X(poi.x), Z(poi.z) - poi.r * s - 8);
    }
    for (const m of raid.markers()) {
      if (m.kind === 'enemy') { g.fillStyle = m.color; g.beginPath(); g.arc(X(m.x), Z(m.z), 4, 0, 7); g.fill(); continue; }
      if (m.r) { g.fillStyle = 'rgba(255,210,63,0.25)'; g.beginPath(); g.arc(X(m.x), Z(m.z), m.r * s, 0, 7); g.fill(); }
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
  }

  // ---------- inventory / loot panel
  renderPanel(raid) {
    this.raid = raid;
    const el = $('panel');
    if (!raid.ui) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const P = raid.player;
    const slot = (it, i) => {
      const d = describe(it);
      const btns = it.kind === 'weapon'
        ? `<button data-act="equip" data-i="${i}" data-slot="0">Primary</button><button data-act="equip" data-i="${i}" data-slot="1">Secondary</button>`
        : '';
      return `<div class="slot" style="--rc:${RARITY[d.rarity].color}">
        <div class="nm">${esc(d.name)}</div><div class="vl">${d.quest ? 'CONTRACT ITEM' : d.value ? fmtCash(d.value) : ''}${d.sub ? ' · ' + d.sub : ''}</div>
        <div class="acts">${btns}<button data-act="drop" data-i="${i}">Drop</button></div></div>`;
    };
    let bag = P.bag.map(slot).join('');
    for (let i = P.bag.length; i < P.bagCap; i++) bag += '<div class="slot empty"></div>';
    const bagValue = P.bag.reduce((s, it) => s + describe(it).value, 0);
    const wl = (gn, label) => gn ? `<div class="wrow"><span>${label}</span><b>${esc(gn.def.name)}</b><small>${gn.mag}/${gn.def.mag}</small></div>` : `<div class="wrow"><span>${label}</span><i>empty</i></div>`;
    const ammo = Object.keys(AMMO).filter((k) => P.ammo[k] > 0).map((k) => `${AMMO[k].name}: ${P.ammo[k]}`).join(' · ') || 'none';
    let html = `<div class="pcol">
      <h3>Backpack <span>${P.bag.length}/${P.bagCap} · ${fmtCash(bagValue)}</span></h3>
      <div class="slots">${bag}</div>
      <h3>Loadout</h3>
      ${wl(P.weapons[0], 'Primary')}${wl(P.weapons[1], 'Secondary')}
      <div class="wrow"><span>Ammo</span><small>${ammo}</small></div>
      <div class="wrow"><span>Armor</span><b>${Math.ceil(P.armor)}/150</b><small>${P.plates} spare plates · ${P.revives} self-revive</small></div>
      <div class="wrow"><span>Cash</span><b class="cash">${fmtCash(P.cash)}</b><small>lost if you die</small></div>
    </div>`;
    if (raid.ui === 'loot' && raid.lootTarget) {
      const c = raid.lootTarget;
      const rows = c.items.map((it, i) => {
        const d = describe(it);
        return `<div class="lrow" style="--rc:${RARITY[d.rarity].color}" data-act="take" data-i="${i}">
          <div><div class="nm">${esc(d.name)}</div><div class="vl">${d.quest ? 'CONTRACT ITEM' : d.value ? fmtCash(d.value) : ''}${d.sub ? ' · ' + d.sub : ''}</div></div><button data-act="take" data-i="${i}">Take</button></div>`;
      }).join('') || '<p class="emptytxt">Empty</p>';
      html += `<div class="pcol loot"><h3>${esc(c.name)}</h3>${rows}
        ${c.items.length ? '<button class="big" data-act="takeall">Take All</button>' : ''}</div>`;
    }
    html += '<div class="phint"><kbd>E</kbd>/<kbd>Tab</kbd>/<kbd>Esc</kbd> close · the world keeps moving while you loot</div>';
    el.innerHTML = html;
  }

  onPanelClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || !this.raid) return;
    e.stopPropagation();
    const raid = this.raid, i = +b.dataset.i;
    const act = b.dataset.act;
    if (act === 'take') raid.takeItem(raid.lootTarget, i);
    if (act === 'takeall') raid.takeAll(raid.lootTarget);
    if (act === 'drop') raid.dropFromBag(i);
    if (act === 'equip') raid.equipFromBag(i, +b.dataset.slot);
    this.renderPanel(raid);
  }
}
