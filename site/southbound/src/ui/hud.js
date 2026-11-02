// HUD: minimap, full map, speedometer, clock, region banner, prompts, FPS.
import { WORLD, CITY, TOWN, regionAt, LAKE } from '../world/layout.js';

const MAP = 1024;

export class HUD {
  constructor(root, hm, graph, buildings, settings) {
    this.root = root;
    this.settings = settings;
    this.el = (id) => root.querySelector(id);
    this.mini = this.el('#minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.big = this.el('#bigmap');
    this.bigCtx = this.big.getContext('2d');
    this.speedEl = this.el('#speed');
    this.speedUnit = this.el('#speedunit');
    this.speedo = this.el('#speedo');
    this.clockEl = this.el('#clock');
    this.regionEl = this.el('#region');
    this.promptEl = this.el('#prompt');
    this.fpsEl = this.el('#fps');
    this.toastEl = this.el('#toast');
    this.lastRegion = '';
    this.regionTimer = 0;
    this.toastTimer = 0;
    this.mapOpen = false;
    this.worldMap = this.renderWorldMap(hm, graph, buildings);
    this.hp = this.el('#hpbar'); this.armorEl = this.el('#armorbar');
    this.moneyEl = this.el('#money'); this.wantedEl = this.el('#wanted'); this.stars = [...this.wantedEl.children];
    this.wicon = this.el('#wicon'); this.ammoEl = this.el('#ammo');
    this.cross = this.el('#crosshair'); this.big = this.el('#bigmsg');
    this.shownMoney = -1;
    this.vehPanel = this.el('#vehpanel');
    this.vehCtx = this.el('#vehsil').getContext('2d');
    this.moneyT = 0; this.regionT = 0;
  }

  // top-down silhouette of the vehicle, filling red where it is damaged
  drawVehicle(kind, dmg) {
    const c = this.vehCtx, W = 140, H = 200;
    c.clearRect(0, 0, W, H);
    c.save();
    c.beginPath();
    if (kind === 'boat') { c.moveTo(70, 8); c.quadraticCurveTo(118, 60, 112, 120); c.lineTo(108, 190); c.lineTo(32, 190); c.lineTo(28, 120); c.quadraticCurveTo(22, 60, 70, 8); }
    else if (kind === 'plane') { c.ellipse(70, 100, 12, 92, 0, 0, Math.PI * 2); c.rect(6, 62, 128, 22); c.rect(38, 168, 64, 14); }
    else if (kind === 'heli') { c.ellipse(70, 62, 34, 50, 0, 0, Math.PI * 2); c.rect(64, 100, 12, 86); c.rect(48, 176, 44, 10); }
    else { const r = 22; c.moveTo(38 + r, 14); c.arcTo(104, 14, 104, 186, r); c.arcTo(104, 186, 36, 186, r); c.arcTo(36, 186, 36, 14, r); c.arcTo(36, 14, 104, 14, r); }
    c.closePath();
    c.fillStyle = 'rgba(190,190,190,0.85)'; c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(20,20,20,0.85)'; c.stroke();
    c.clip();
    // damage zones (front = top)
    const z = dmg || {};
    const zone = (v, x, y, w, h) => { if (v > 0.02) { c.fillStyle = `rgba(220,30,25,${Math.min(0.95, 0.25 + v * 0.75)})`; c.fillRect(x, y, w, h); } };
    zone(z.front, 0, 0, W, 66); zone(z.rear, 0, 134, W, 66); zone(z.left, 0, 66, W / 2, 68); zone(z.right, W / 2, 66, W / 2, 68);
    if (kind === 'car') { c.fillStyle = 'rgba(30,34,40,0.55)'; c.fillRect(46, 60, 48, 22); c.fillRect(48, 128, 44, 16); }
    c.restore();
  }

  renderWorldMap(hm, graph, buildings) {
    const c = document.createElement('canvas');
    c.width = c.height = MAP;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(MAP, MAP);
    const s = WORLD.size / MAP;
    for (let j = 0; j < MAP; j++) for (let i = 0; i < MAP; i++) {
      const x = -WORLD.half + i * s, z = -WORLD.half + j * s;
      const h = hm.height(x, z), w = hm.waterLevel(x, z);
      let r, g, b;
      if (h < w - 0.2) { const d = Math.min((w - h) / 20, 1); r = 40 - d * 25; g = 92 - d * 40; b = 120 - d * 30; }
      else {
        const f = hm.splatAt(x, z, 1), dry = hm.splatAt(x, z, 2), sand = hm.splatAt(x, z, 0), paved = hm.splatAt(x, z, 3);
        const shade = 0.85 + Math.min(h / 250, 1) * 0.35;
        r = (70 + dry * 70 - f * 30 + sand * 90) * shade; g = (95 + dry * 40 - f * 20 + sand * 60) * shade; b = (55 + dry * 10 - f * 15 + sand * 50) * shade;
        if (paved > 0.5) { r = g = b = 58; }
        if (h > 190) { r = g = b = 200; }
      }
      const k = (j * MAP + i) * 4;
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const toMap = (v) => (v + WORLD.half) / s;
    ctx.lineCap = 'round';
    for (const e of graph.edges) {
      ctx.strokeStyle = e.kind === 'highway' ? '#e3c26a' : '#cfcfcf';
      ctx.lineWidth = e.kind === 'highway' ? 3.2 : 2.2;
      ctx.beginPath();
      e.pts.forEach(([x, z], i) => (i ? ctx.lineTo(toMap(x), toMap(z)) : ctx.moveTo(toMap(x), toMap(z))));
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,40,46,0.9)';
    for (const b of buildings) ctx.fillRect(toMap(b.x - b.w / 2), toMap(b.z - b.d / 2), Math.max(1, b.w / s), Math.max(1, b.d / s));
    this.miniMap = document.createElement('canvas');
    this.miniMap.width = this.miniMap.height = MAP;
    this.miniMap.getContext('2d').drawImage(c, 0, 0);
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    const label = (t, x, z) => { ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(t, toMap(x), toMap(z)); ctx.fillStyle = '#fff'; ctx.fillText(t, toMap(x), toMap(z)); };
    label('PORT CALVERA', CITY.x0 + 384, CITY.z0 - 30);
    label('MILL CREEK', TOWN.x0 + 144, TOWN.z0 - 24);
    label('LAKE ARDEN', LAKE.x, LAKE.z);
    label('PINEWOOD HOLLOW', -1350, -1350);
    label('REDGRASS PLAINS', 1150, -650);
    label('BAYOU VERDE', -1350, 1000);
    label('GULF OF CALVERA', 300, 1800);
    label('SIERRA NORTE', 400, -1850);
    return c;
  }

  toast(msg, secs = 3) { this.toastEl.textContent = msg; this.toastEl.classList.add('show'); this.toastTimer = secs; }

  bigMessage(title, sub, secs = 4) {
    this.big.querySelector('b').textContent = title;
    this.big.querySelector('span').textContent = sub;
    this.big.classList.add('show');
    clearTimeout(this._big);
    this._big = setTimeout(() => this.big.classList.remove('show'), secs * 1000);
  }

  toggleMap() {
    this.mapOpen = !this.mapOpen;
    this.big.parentElement.classList.toggle('open', this.mapOpen);
  }

  update(dt, st) {
    // st: {pos, yaw, heading, driving, speed, hour, day, prompt, fps, traffic}
    const mm = this.miniCtx, W = this.mini.width;
    const s = WORLD.size / MAP;
    const zoom = st.driving ? 0.55 + Math.min(Math.abs(st.speed) / 60, 0.4) : 0.45; // map px per world px
    mm.save();
    mm.clearRect(0, 0, W, W);
    mm.beginPath(); mm.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2); mm.clip();
    mm.fillStyle = '#20384a'; mm.fillRect(0, 0, W, W);
    mm.translate(W / 2, W / 2);
    mm.rotate(st.yaw + Math.PI);
    const k = 1 / (s * zoom);
    mm.scale(k * s, k * s);
    mm.translate(-(st.pos.x + WORLD.half) / s, -(st.pos.z + WORLD.half) / s);
    mm.drawImage(this.miniMap, 0, 0);
    // project world points to minimap pixels (icons are then drawn upright)
    const T = mm.getTransform();
    const proj = (x, z) => T.transformPoint(new DOMPoint((x + WORLD.half) / s, (z + WORLD.half) / s));
    mm.restore();
    mm.save();
    mm.beginPath(); mm.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2); mm.clip();
    const icon = (p, glyph, bg, size = 15) => {
      mm.fillStyle = bg; mm.strokeStyle = 'rgba(0,0,0,0.8)'; mm.lineWidth = 1.5;
      mm.beginPath(); mm.arc(p.x, p.y, size * 0.62, 0, Math.PI * 2); mm.fill(); mm.stroke();
      mm.font = `${Math.round(size * 0.78)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`; mm.textAlign = 'center'; mm.textBaseline = 'middle';
      mm.fillText(glyph, p.x, p.y + 1);
    };
    for (const b of st.blips || []) { const p = proj(b.x, b.z); if (b.icon) icon(p, b.icon, b.bg || 'rgba(20,16,12,0.85)', b.size > 6 ? 18 : 15); else { mm.fillStyle = b.color; mm.beginPath(); mm.arc(p.x, p.y, 4, 0, Math.PI * 2); mm.fill(); } }
    for (const a of st.animals || []) {
      const p = proj(a.x, a.z);
      mm.save(); mm.translate(p.x, p.y); mm.rotate(Math.PI / 4); mm.fillStyle = '#f2c230'; mm.strokeStyle = '#111'; mm.lineWidth = 1.5; mm.fillRect(-6, -6, 12, 12); mm.strokeRect(-6, -6, 12, 12); mm.restore();
      mm.font = '9px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; mm.textAlign = 'center'; mm.textBaseline = 'middle'; mm.fillText(a.icon, p.x, p.y + 0.5);
    }
    for (const v of st.myVehicles || []) {
      const p = proj(v.x, v.z);
      mm.save(); mm.translate(p.x, p.y); mm.rotate(-(v.heading - st.yaw) + Math.PI);
      mm.fillStyle = '#fff'; mm.strokeStyle = '#000'; mm.lineWidth = 1.2;
      mm.beginPath(); mm.roundRect ? mm.roundRect(-3.5, -6, 7, 12, 2.5) : mm.rect(-3.5, -6, 7, 12); mm.fill(); mm.stroke(); mm.restore();
    }
    mm.fillStyle = '#3b7bff'; for (const c of st.police || []) { const p = proj(c.x, c.z); mm.beginPath(); mm.arc(p.x, p.y, 3.5, 0, Math.PI * 2); mm.fill(); }
    mm.fillStyle = '#ff2b2b'; for (const c of st.hostiles || []) { const p = proj(c.x, c.z); mm.beginPath(); mm.arc(p.x, p.y, 3.5, 0, Math.PI * 2); mm.fill(); }
    mm.restore();
    // player arrow
    mm.save();
    mm.translate(W / 2, W / 2);
    mm.rotate(-(st.heading - st.yaw));
    mm.fillStyle = '#fff'; mm.strokeStyle = '#000'; mm.lineWidth = 2;
    mm.beginPath(); mm.moveTo(0, -9); mm.lineTo(6, 7); mm.lineTo(0, 3); mm.lineTo(-6, 7); mm.closePath(); mm.fill(); mm.stroke();
    mm.restore();
    // north marker
    const na = st.yaw + Math.PI;
    mm.fillStyle = '#fff'; mm.font = 'bold 14px system-ui'; mm.textAlign = 'center'; mm.textBaseline = 'middle';
    mm.fillText('N', W / 2 + Math.sin(na) * (W / 2 - 14), W / 2 - Math.cos(na) * (W / 2 - 14));

    if (this.mapOpen) {
      const B = this.big, bc = this.bigCtx;
      bc.drawImage(this.worldMap, 0, 0, B.width, B.height);
      const px = ((st.pos.x + WORLD.half) / WORLD.size) * B.width, pz = ((st.pos.z + WORLD.half) / WORLD.size) * B.height;
      bc.font = '18px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; bc.textAlign = 'center'; bc.textBaseline = 'middle';
      for (const b of st.blips || []) if (b.icon) { const bx = ((b.x + WORLD.half) / WORLD.size) * B.width, bz = ((b.z + WORLD.half) / WORLD.size) * B.height; bc.fillStyle = 'rgba(20,16,12,0.85)'; bc.beginPath(); bc.arc(bx, bz, 12, 0, Math.PI * 2); bc.fill(); bc.fillText(b.icon, bx, bz + 1); }
      bc.save(); bc.translate(px, pz); bc.rotate(-st.heading + Math.PI);
      bc.fillStyle = '#ff3b2f'; bc.strokeStyle = '#fff'; bc.lineWidth = 2;
      bc.beginPath(); bc.moveTo(0, -12); bc.lineTo(8, 9); bc.lineTo(0, 4); bc.lineTo(-8, 9); bc.closePath(); bc.fill(); bc.stroke();
      bc.restore();
    }

    // speedometer
    this.vehPanel.classList.toggle('show', !!st.driving);
    if (st.driving) {
      const key = `${st.vehKind}|${JSON.stringify(st.vehDmg || {})}`;
      if (key !== this._vehKey) { this._vehKey = key; this.drawVehicle(st.vehKind, st.vehDmg); }
      const mph = this.settings.units === 'mph';
      this.speedEl.textContent = Math.round(Math.abs(st.speed) * (mph ? 2.237 : 3.6));
      this.speedUnit.textContent = mph ? 'MPH' : 'KM/H';
    }
    // clock
    const h = Math.floor(st.hour), m = Math.floor((st.hour - h) * 60);
    const ampm = h >= 12 ? 'PM' : 'AM', h12 = ((h + 11) % 12) + 1;
    this.clockEl.textContent = `Day ${st.day} · ${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    // area card: name, local time and wanted level for 10 s when you enter a new area
    const reg = regionAt(st.pos.x, st.pos.z);
    if (reg.name !== this.lastRegion) {
      this.lastRegion = reg.name;
      this.regionEl.querySelector('b').textContent = reg.name;
      this.regionEl.querySelector('.when').textContent = `${h12}:${String(m).padStart(2, '0')} ${ampm} · ${reg.sub}`;
      this.regionEl.querySelector('.stars').textContent = st.wanted > 0 ? '★'.repeat(st.wanted) + '☆'.repeat(5 - st.wanted) : '';
      this.regionEl.classList.add('show');
      this.regionTimer = 10;
    }
    if (this.regionTimer > 0 && (this.regionTimer -= dt) <= 0) this.regionEl.classList.remove('show');
    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0) this.toastEl.classList.remove('show');
    this.promptEl.textContent = st.prompt || '';
    this.promptEl.classList.toggle('show', !!st.prompt);
    // action HUD
    if (st.health !== undefined) {
      this.hp.style.setProperty('--v', `${Math.max(0, st.health)}%`);
      this.hp.classList.toggle('low', st.health < 25);
      this.armorEl.style.setProperty('--v', `${Math.max(0, st.armor)}%`);
      if (st.money !== this.shownMoney) {
        if (st.money > this.shownMoney && this.shownMoney >= 0) { this.moneyEl.classList.remove('gain'); void this.moneyEl.offsetWidth; this.moneyEl.classList.add('gain'); }
        this.shownMoney = st.money;
        this.moneyEl.classList.add('flash'); this.moneyT = 4;
        this.moneyEl.textContent = '$' + st.money.toLocaleString('en-US');
      }
      this.stars.forEach((el, i) => el.classList.toggle('on', i < st.wanted));
      this.wantedEl.classList.toggle('active', st.wanted > 0);
      this.el('#weapon').classList.toggle('armed', !!st.armed);
      this.wantedEl.classList.toggle('flash', !!st.wantedLost);
      this.wicon.textContent = st.weaponIcon;
      const wl = st.ammo ? `${st.weaponName || ''}  ${st.ammo}` : '';
      if (wl !== this._wl) { this._wl = wl; this.ammoEl.textContent = wl; }
      this.cross.classList.toggle('show', !!st.aiming);
      if (st.hitMarker) { this.cross.classList.add('hit'); clearTimeout(this._hm); this._hm = setTimeout(() => this.cross.classList.remove('hit'), 120); }
    }
    if (this.moneyT > 0 && (this.moneyT -= dt) <= 0) this.moneyEl.classList.remove('flash');
    this.fpsEl.style.display = this.settings.showFps ? 'block' : 'none';
    if (this.settings.showFps) this.fpsEl.textContent = st.fpsText;
  }
}
