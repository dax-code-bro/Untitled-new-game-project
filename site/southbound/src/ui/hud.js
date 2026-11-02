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
    mm.fillStyle = '#ff5a3c';
    for (const c of st.traffic) mm.fillRect((c.x + WORLD.half) / s - 1.2, (c.z + WORLD.half) / s - 1.2, 2.4, 2.4);
    if (st.police) {
      mm.fillStyle = (performance.now() / 250) % 2 < 1 ? '#3b7bff' : '#ff3b3b';
      for (const c of st.police) mm.fillRect((c.x + WORLD.half) / s - 2, (c.z + WORLD.half) / s - 2, 4, 4);
    }
    if (st.blips) {
      for (const b of st.blips) {
        mm.fillStyle = b.color; mm.strokeStyle = '#000'; mm.lineWidth = 0.8;
        mm.beginPath(); mm.arc((b.x + WORLD.half) / s, (b.z + WORLD.half) / s, b.size * 0.8, 0, Math.PI * 2); mm.fill(); mm.stroke();
      }
    }
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
      bc.save(); bc.translate(px, pz); bc.rotate(-st.heading + Math.PI);
      bc.fillStyle = '#ff3b2f'; bc.strokeStyle = '#fff'; bc.lineWidth = 2;
      bc.beginPath(); bc.moveTo(0, -12); bc.lineTo(8, 9); bc.lineTo(0, 4); bc.lineTo(-8, 9); bc.closePath(); bc.fill(); bc.stroke();
      bc.restore();
    }

    // speedometer
    this.speedo.classList.toggle('show', st.driving);
    if (st.driving) {
      const mph = this.settings.units === 'mph';
      this.speedEl.textContent = Math.round(Math.abs(st.speed) * (mph ? 2.237 : 3.6));
      this.speedUnit.textContent = mph ? 'MPH' : 'KM/H';
    }
    // clock
    const h = Math.floor(st.hour), m = Math.floor((st.hour - h) * 60);
    const ampm = h >= 12 ? 'PM' : 'AM', h12 = ((h + 11) % 12) + 1;
    this.clockEl.textContent = `Day ${st.day} · ${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    // region banner
    const reg = regionAt(st.pos.x, st.pos.z);
    if (reg.name !== this.lastRegion) {
      this.lastRegion = reg.name;
      this.regionEl.innerHTML = `<b>${reg.name}</b><span>${reg.sub}</span>`;
      this.regionEl.classList.add('show');
      this.regionTimer = 4;
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
        this.moneyEl.textContent = '$' + st.money.toLocaleString('en-US');
      }
      this.stars.forEach((el, i) => el.classList.toggle('on', i < st.wanted));
      this.wantedEl.classList.toggle('flash', !!st.wantedLost);
      this.wicon.textContent = st.weaponIcon;
      const wl = st.ammo ? `${st.weaponName || ''}  ${st.ammo}` : '';
      if (wl !== this._wl) { this._wl = wl; this.ammoEl.textContent = wl; }
      this.cross.classList.toggle('show', !!st.aiming);
      if (st.hitMarker) { this.cross.classList.add('hit'); clearTimeout(this._hm); this._hm = setTimeout(() => this.cross.classList.remove('hit'), 120); }
    }
    this.fpsEl.style.display = this.settings.showFps ? 'block' : 'none';
    if (this.settings.showFps) this.fpsEl.textContent = st.fpsText;
  }
}
