// Sky, day/night (one game day = 30 real minutes) and regional weather events.
import * as THREE from 'three';
import { TIME, WEATHER, WEATHER_ROLL } from './data/world.js';
import { heightAt, temperatureAt, smooth } from './terrain.js';
import { rand, pick } from './rng.js';

const C = (h) => new THREE.Color(h);
const PALETTE = {
  day: { top: C(0x3f7fcf), horizon: C(0xc4d8e8), sun: C(0xfff1d6), sunI: 2.7, hemi: 1.15 },
  dusk: { top: C(0x2a3a6e), horizon: C(0xf09a5a), sun: C(0xff9a5a), sunI: 1.4, hemi: 0.6 },
  night: { top: C(0x060b18), horizon: C(0x22324e), sun: C(0x9ab6e6), sunI: 0.55, hemi: 0.42 },
};

const REGION_CENTER = { n: [0, -10000, 9000], s: [0, 10500, 9000], e: [10500, 0, 8500], w: [-10500, 0, 8500], hub: [0, 0, 3500] };

export class Environment {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.hour = TIME.startHour;
    // sky dome
    this.skyUniforms = {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color() }, haze: { value: 0 },
    };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(40000, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float haze; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y, -0.2, 1.0); vec3 c = mix(horizon, top, pow(max(h,0.0), 0.55));
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          c += sunColor * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.25) * (1.0 - haze);
          c = mix(c, horizon, haze);
          gl_FragColor = vec4(c, 1.0); }`,
    }));
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    scene.add(this.sky);
    scene.fog = new THREE.Fog(0xc4d8e8, 400, 9000);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x5a5040, 1.1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -70; sc.right = sc.top = 70; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun, this.sun.target);

    // weather
    this.events = [];
    this.rollT = 20;
    this.local = { rain: 0, snow: 0, sand: 0, tornado: 0, fog: 1, temp: 0, overcast: 0 };
    this.flashT = 0;
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

  // ----------------------------------------------------------------
  update(dt, time) {
    const g = this.game, cam = g.camera.position;
    this.hour = (TIME.startHour + (time / TIME.dayLength) * 24) % 24;
    this.updateWeather(dt, cam);
    this.updateSky(cam);
    this.updateParticles(dt, cam);
  }

  get dayKey() { return this.hour >= 6 && this.hour < 18 ? 'day' : 'night'; }

  updateSky(cam) {
    const theta = ((this.hour - 6) / 12) * Math.PI;
    const sy = Math.sin(theta);
    const dir = new THREE.Vector3(Math.cos(theta), sy, 0.3).normalize();
    let a, b, k;
    if (sy > 0.2) { a = PALETTE.day; b = PALETTE.day; k = 0; }
    else if (sy > -0.05) { a = PALETTE.dusk; b = PALETTE.day; k = smooth(-0.05, 0.2, sy); }
    else { a = PALETTE.night; b = PALETTE.dusk; k = smooth(-0.25, -0.05, sy); }
    const L = this.local;
    const top = a.top.clone().lerp(b.top, k), hor = a.horizon.clone().lerp(b.horizon, k);
    const grey = new THREE.Color(0x8d939a).multiplyScalar(sy > 0 ? 1 : 0.25);
    top.lerp(grey, L.overcast * 0.8); hor.lerp(grey, L.overcast * 0.6);
    let fogCol = hor.clone();
    if (L.sand > 0) fogCol.lerp(new THREE.Color(0xc9a46a).multiplyScalar(sy > 0 ? 1 : 0.3), Math.min(1, L.sand));
    if (L.snow > 0.3) fogCol.lerp(new THREE.Color(0xdfe6ee).multiplyScalar(sy > 0 ? 1 : 0.3), Math.min(1, L.snow));
    const U = this.skyUniforms;
    U.top.value.copy(top); U.horizon.value.copy(fogCol); U.sunColor.value.copy(a.sun.clone().lerp(b.sun, k)); U.sunDir.value.copy(dir);
    U.haze.value = Math.min(1, L.overcast * 0.6 + (1 - L.fog) * 0.9);
    this.sky.position.copy(cam);
    const scene = this.game.scene;
    scene.fog.color.copy(fogCol);
    scene.fog.far = 9000 * L.fog + 60;
    scene.fog.near = Math.min(400, scene.fog.far * 0.05);
    // lights: the sun below the horizon becomes the moon
    const night = sy < -0.05;
    const ld = night ? dir.clone().multiplyScalar(-1).setY(Math.max(0.35, -sy)) : dir.clone().setY(Math.max(0.08, sy));
    const p = this.game.player ? this.game.player.pos : cam;
    this.sun.position.set(p.x + ld.x * 300, p.y + ld.y * 300, p.z + ld.z * 300);
    this.sun.target.position.set(p.x, p.y, p.z);
    this.sun.color.copy(a.sun).lerp(b.sun, k);
    this.sun.intensity = (a.sunI + (b.sunI - a.sunI) * k) * (1 - L.overcast * 0.65);
    this.hemi.intensity = (a.hemi + (b.hemi - a.hemi) * k) * (1 - L.overcast * 0.3) + (this.flashT > 0 ? 3 : 0);
    this.hemi.color.copy(top).lerp(new THREE.Color(0xffffff), 0.5);
    this.flashT -= 0.016;
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
