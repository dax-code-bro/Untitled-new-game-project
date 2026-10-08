// Sky, day/night (one game day = 30 real minutes) and regional weather events.
import * as THREE from 'three';
import { TIME, WEATHER, WEATHER_ROLL } from './data/world.js';
import { heightAt, temperatureAt, smooth } from './terrain.js';
import { rand, pick } from './rng.js';

const REGION_CENTER = { n: [0, -10000, 9000], s: [0, 10500, 9000], e: [10500, 0, 8500], w: [-10500, 0, 8500], hub: [0, 0, 3500] };

const col = (h) => new THREE.Color(h);
const SKY = {
  dayZenith: col(0x2a66c0), dayHorizon: col(0xb7cfe3), nightZenith: col(0x040814), nightHorizon: col(0x17233a),
  sunset: col(0xf39a5a), sunLow: col(0xff8a4a), sunHigh: col(0xfff4e2), moon: col(0x8ea8e0), overcast: col(0x8a9198),
  sand: col(0xc9a46a), snow: col(0xdbe4ee),
};

export class Environment {
  constructor(game) {
    this.game = game;
    this.hour = TIME.startHour;
    this.events = [];
    this.rollT = 20;
    this.local = { rain: 0, snow: 0, sand: 0, tornado: 0, fog: 1, temp: 0, overcast: 0 };
    this.flashT = 0;
    this.atm = {
      sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), sunColor: new THREE.Color(), lightColor: new THREE.Color(),
      zenith: new THREE.Color(), horizon: new THREE.Color(), ambientGround: new THREE.Color(),
    };
    this.buildParticles();
  }

  buildParticles() {
    const scene = this.game.scene;
    const N = 4000;
    // rain streaks
    const rp = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) { const x = rand(-40, 40), y = rand(-5, 35), z = rand(-40, 40); rp.set([x, y, z, x, y - 0.7, z], i * 6); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.35 }));
    // snow / sand flakes
    const mk = (color, size) => {
      const p = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) p.set([rand(-40, 40), rand(-5, 30), rand(-40, 40)], i * 3);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      return new THREE.Points(g, new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.85, depthWrite: false }));
    };
    this.snow = mk(0xffffff, 0.12);
    this.sand = mk(0xd9b87a, 0.09);
    for (const o of [this.rain, this.snow, this.sand]) { o.frustumCulled = false; o.visible = false; scene.add(o); }
    // tornado funnel
    const t = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: 0x6a6258, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 9; i++) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(3 + i * 4.2, 2 + i * 3.6, 22, 16, 1, true), m);
      ring.position.y = 11 + i * 21;
      t.add(ring);
    }
    t.visible = false;
    scene.add(t);
    this.funnel = t;
  }

  update(dt, time) {
    const g = this.game, cam = g.camera.position;
    this.hour = (TIME.startHour + (time / TIME.dayLength) * 24) % 24;
    this.updateWeather(dt, cam);
    this.updateSky(dt, cam);
    this.updateParticles(dt, cam);
  }

  get dayKey() { return this.hour >= 6 && this.hour < 18 ? 'day' : 'night'; }

  // Computes the atmosphere for this hour + weather and hands it to the renderer.
  updateSky(dt, cam) {
    const A = this.atm, L = this.local;
    const theta = ((this.hour - 6) / 12) * Math.PI;
    A.sunDir.set(Math.cos(theta), Math.sin(theta), 0.32).normalize();
    A.moonDir.set(-A.sunDir.x, -A.sunDir.y, -0.2).normalize();
    const sy = A.sunDir.y;
    const day = smooth(-0.1, 0.22, sy);
    const night = 1 - smooth(-0.22, -0.02, sy);
    const sunset = (1 - smooth(0.04, 0.32, sy)) * smooth(-0.16, 0.0, sy);
    A.sunColor.copy(SKY.sunLow).lerp(SKY.sunHigh, smooth(0.02, 0.45, sy));
    A.zenith.copy(SKY.nightZenith).lerp(SKY.dayZenith, day);
    A.horizon.copy(SKY.nightHorizon).lerp(SKY.dayHorizon, day).lerp(SKY.sunset, sunset * 0.55);
    // weather greys things out and tints the haze
    const oc = L.overcast;
    A.zenith.lerp(SKY.overcast.clone().multiplyScalar(0.25 + day * 0.75), oc * 0.75);
    A.horizon.lerp(SKY.overcast.clone().multiplyScalar(0.25 + day * 0.75), oc * 0.6);
    if (L.sand > 0) A.horizon.lerp(SKY.sand.clone().multiplyScalar(0.3 + day * 0.7), Math.min(1, L.sand));
    if (L.snow > 0.3) A.horizon.lerp(SKY.snow.clone().multiplyScalar(0.3 + day * 0.7), Math.min(1, L.snow));
    A.lightColor.copy(night > 0.5 ? SKY.moon : A.sunColor);
    A.sunI = (day * 3.4 * (1 - oc * 0.7) + night * 0.45) * (1 - L.sand * 0.5);
    A.hemiI = 0.06 + day * 0.18 + night * 0.12;
    A.envI = 0.12 + day * 0.85;
    A.ambientGround.copy(A.horizon).multiplyScalar(0.35);
    A.night = night;
    A.sunsetK = sunset;
    A.haze = Math.min(1, oc * 0.5 + (1 - L.fog) * 1.2);
    A.cloudCover = 0.32 + oc * 0.55 + L.snow * 0.2;
    // fog: a thin sea-level haze normally, a wall of weather around you in a storm
    A.fogDensity = 0.00011 / Math.max(0.012, L.fog);
    const storm = 1 - L.fog;
    const py = this.game.player ? this.game.player.pos.y : cam.y;
    A.fogBase = storm * (py - 40);
    A.fogHeightK = 0.0016 * (1 - storm * 0.8);
    if (this.flashT > 0) { A.sunI += 6; A.hemiI += 2; }
    this.flashT -= dt;
    const focus = this.game.player ? this.game.player.pos : cam;
    this.game.gfx.setAtmosphere(A, dt, focus);
    this.game.gfx.grade.cold.value = this.game.player ? Math.min(1, this.game.player.coldEx / 100) * 0.6 : 0;
  }

  // ---------------------------------------------------------------- weather
  updateWeather(dt, cam) {
    const g = this.game;
    this.rollT -= dt;
    if (this.rollT <= 0) {
      this.rollT = WEATHER_ROLL;
      for (const [type, w] of Object.entries(WEATHER)) {
        if (Math.random() > w.chance) continue;
        const region = pick(w.regions);
        if (this.events.some((e) => e.type === type && e.region === region)) continue;
        this.start(type, region);
      }
    }
    const L = { rain: 0, snow: 0, sand: 0, tornado: 0, fog: 1, temp: 0, overcast: 0 };
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      e.t += dt;
      if (e.t >= e.dur) { if (e.type === 'tornado') this.funnel.visible = false; this.events.splice(i, 1); continue; }
      const ramp = Math.min(1, e.t / 20, (e.dur - e.t) / 20);
      if (e.type === 'tornado') this.moveTornado(e, dt);
      const d = Math.hypot(cam.x - e.x, cam.z - e.z);
      const k = ramp * smooth(e.r, e.r * 0.75, d);
      if (k <= 0) continue;
      const W = WEATHER[e.type];
      L.fog = Math.min(L.fog, 1 - k * (1 - W.fog));
      L.temp += W.temp * k;
      L.overcast = Math.max(L.overcast, k * (e.type === 'sandstorm' ? 0.3 : 0.8));
      if (e.type === 'rain') L.rain = Math.max(L.rain, k);
      if (e.type === 'blizzard') L.snow = Math.max(L.snow, k);
      if (e.type === 'sandstorm') L.sand = Math.max(L.sand, k);
      if (e.type === 'tornado') L.tornado = Math.max(L.tornado, k);
    }
    // the north is always a little snowy up high
    const alt = g.player ? g.player.pos.y : 0;
    if (g.player && g.player.region === 'n' && alt > 300) L.snow = Math.max(L.snow, 0.25);
    this.local = L;
    if (L.rain > 0.5 && Math.random() < dt * 0.04) { this.flashT = 0.12; setTimeout(() => g.audio.thunder(), 600 + Math.random() * 2500); }
  }

  start(type, region, dur) {
    const W = WEATHER[type];
    const [cx, cz, r] = REGION_CENTER[region];
    const e = { type, region, x: cx, z: cz, r, t: 0, dur: dur || rand(...W.duration) };
    if (type === 'tornado') {
      e.r = 2600;
      e.x = cx + rand(-3000, 3000); e.z = cz + rand(-3000, 3000);
      const p = this.game.player;
      if (p && Math.random() < 0.5) { e.x = p.pos.x + rand(-900, 900); e.z = p.pos.z + rand(-900, 900); } // keep it interesting
      e.vx = rand(-9, 9); e.vz = rand(-9, 9);
      this.funnel.visible = true;
    }
    this.events.push(e);
    const near = this.game.player && Math.hypot(this.game.player.pos.x - e.x, this.game.player.pos.z - e.z) < e.r * 1.3;
    if (near) this.game.hud.toast(`${W.name} rolling in`, type === 'tornado' ? '#ff6a5a' : '#9fe8ff', 4);
    return e;
  }

  moveTornado(e, dt) {
    e.vx += rand(-3, 3) * dt; e.vz += rand(-3, 3) * dt;
    const sp = Math.hypot(e.vx, e.vz);
    if (sp > 12) { e.vx *= 12 / sp; e.vz *= 12 / sp; }
    e.x += e.vx * dt; e.z += e.vz * dt;
    this.funnel.position.set(e.x, heightAt(e.x, e.z), e.z);
    this.funnel.rotation.y += dt * 2.5;
    this.funnel.children.forEach((c, i) => { c.position.x = Math.sin(this.game.time * 0.7 + i * 0.5) * i * 1.2; });
    // pull and hurt whoever gets close
    const P = this.game.player;
    if (!P || !P.alive) return;
    const dx = e.x - P.pos.x, dz = e.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d < 80) {
      const pull = (1 - d / 80) * 9;
      P.vel.x += (dx / d) * pull * dt * 4; P.vel.z += (dz / d) * pull * dt * 4;
      if (d < 14) { P.vel.y = Math.max(P.vel.y, 9); P.hurt(12 * dt, 'Caught in a tornado'); }
    }
  }

  tempAt(pos) {
    return temperatureAt(pos.x, pos.z, pos.y, this.hour) + this.local.temp;
  }

  updateParticles(dt, cam) {
    const L = this.local;
    this.rain.visible = L.rain > 0.05;
    this.snow.visible = L.snow > 0.05;
    this.sand.visible = L.sand > 0.05;
    const wrap = (v, c, r) => (v - c > r ? v - 2 * r : v - c < -r ? v + 2 * r : v);
    if (this.rain.visible) {
      const a = this.rain.geometry.attributes.position.array;
      this.rain.material.opacity = 0.35 * L.rain;
      for (let i = 0; i < a.length; i += 6) {
        let y = a[i + 1] - 24 * dt;
        let x = wrap(a[i], cam.x, 40), z = wrap(a[i + 2], cam.z, 40);
        if (y < cam.y - 8) y += 40;
        if (y > cam.y + 34) y -= 40;
        a[i] = x; a[i + 1] = y; a[i + 2] = z; a[i + 3] = x + 0.08; a[i + 4] = y - 0.7; a[i + 5] = z;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    for (const [o, k, fall, wind] of [[this.snow, L.snow, 2.6, 2 + L.snow * 9], [this.sand, L.sand, 0.4, 20]]) {
      if (!o.visible) continue;
      o.material.opacity = 0.85 * Math.min(1, k * 1.5);
      const a = o.geometry.attributes.position.array, t = this.game.time;
      for (let i = 0; i < a.length; i += 3) {
        a[i] = wrap(a[i] + wind * dt + Math.sin(t + i) * 0.02, cam.x, 40);
        let y = a[i + 1] - fall * dt;
        if (y < cam.y - 6) y += 36;
        if (y > cam.y + 30) y -= 36;
        a[i + 1] = y;
        a[i + 2] = wrap(a[i + 2] + Math.cos(t * 0.7 + i) * 0.02, cam.z, 40);
      }
      o.geometry.attributes.position.needsUpdate = true;
    }
  }

  markers() {
    return this.events.map((e) => ({ x: e.x, z: e.z, r: e.type === 'tornado' ? 80 : e.r, kind: 'weather', type: e.type, label: WEATHER[e.type].name }));
  }
}
