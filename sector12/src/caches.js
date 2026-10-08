// Filament caches dropped by a cargo helicopter, plus the summit extraction.
import * as THREE from 'three';
import { CACHE } from './data/world.js';
import { heightAt, regionAt, islandD, POIS, REGIONS } from './terrain.js';
import { waterLevelAt } from './physics.js';
import { rand, randi, weighted } from './rng.js';

export function buildHeli(scene, color = 0x3d4430) {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1e1f1c });
  const add = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
  add(3, 2.8, 9, body, 0, 2, 0);
  add(0.8, 0.8, 8, body, 0, 2.6, 8);
  add(0.25, 2.2, 1.6, body, 0, 3.6, 11.6);
  add(2.6, 1.1, 2, new THREE.MeshLambertMaterial({ color: 0x223040 }), 0, 2.6, -4.2);
  add(0.15, 0.15, 6, dark, 1.4, 0.2, 0); add(0.15, 0.15, 6, dark, -1.4, 0.2, 0);
  const rotor = new THREE.Group(); rotor.position.set(0, 3.7, 0);
  for (const a of [0, Math.PI / 2]) { const bl = new THREE.Mesh(new THREE.BoxGeometry(16, 0.07, 0.5), dark); bl.rotation.y = a; rotor.add(bl); }
  g.add(rotor);
  g.userData.rotor = rotor;
  scene.add(g);
  return g;
}

function crateMesh(color, big) {
  const g = new THREE.Group();
  const s = big ? 1.6 : 1.1;
  const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.75, s), new THREE.MeshLambertMaterial({ color: 0x2a2e33 }));
  crate.position.y = s * 0.375; crate.castShadow = true; g.add(crate);
  const band = new THREE.Mesh(new THREE.BoxGeometry(s * 1.02, s * 0.12, s * 1.02), new THREE.MeshBasicMaterial({ color }));
  band.position.y = s * 0.55; g.add(band);
  const chute = new THREE.Mesh(new THREE.SphereGeometry(3.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xe8e2d0, side: THREE.DoubleSide }));
  chute.position.y = 7; chute.name = 'chute'; g.add(chute);
  return g;
}

export class CacheSystem {
  constructor(game) {
    this.game = game;
    this.timer = CACHE.heliInterval * 0.35; // the first pass comes early
    this.helis = [];
    this.caches = [];
    this.passes = 0;
  }

  nearestCache(pos, maxD) {
    let best = null, bd = maxD;
    for (const c of this.caches) {
      if (c.looted || !c.landed) continue;
      const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  pickDrop() {
    const regions = CACHE.regions;
    const reg = weighted(Object.fromEntries(Object.entries(regions).map(([k, v]) => [k, v.weight])));
    const sizeW = {};
    for (const [k, s] of Object.entries(CACHE.sizes)) sizeW[k] = s.chance * regions[reg].sizeMul[k];
    const size = weighted(sizeW);
    const centers = { n: [0, -9000], s: [0, 10000], e: [10000, 0], w: [-10000, 0] };
    for (let i = 0; i < 60; i++) {
      const x = centers[reg][0] + rand(-6000, 6000), z = centers[reg][1] + rand(-6000, 6000);
      const h = heightAt(x, z);
      if (islandD(x, z) > 0.85 || waterLevelAt(x, z, h) !== null || regionAt(x, z, h) !== reg) continue;
      return { x, z, region: reg, size };
    }
    return null;
  }

  update(dt) {
    const game = this.game;
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = CACHE.heliInterval; this.pass(); }
    for (let i = this.helis.length - 1; i >= 0; i--) {
      const h = this.helis[i];
      h.t += dt;
      const k = h.t / h.dur;
      h.mesh.position.lerpVectors(h.from, h.to, k);
      h.mesh.userData.rotor.rotation.y += dt * 30;
      if (h.drop && !h.dropped && k >= 0.5) { h.dropped = true; this.spawnCache(h.drop, h.mesh.position); }
      if (h.sound) h.sound.set(h.mesh.position.distanceTo(game.camera.position));
      if (k >= 1) { game.scene.remove(h.mesh); if (h.sound) h.sound.stop(); this.helis.splice(i, 1); }
    }
    for (const c of this.caches) {
      if (c.landed) {
        c.smokeT -= dt;
        if (c.smokeT <= 0 && !c.looted) { c.smokeT = 0.5; game.effects.puff(c.pos.clone().setY(c.pos.y + 1.2), c.color, 0.6, 5, 4, 4, 0.5); }
        continue;
      }
      c.mesh.position.y -= dt * 9;
      const g = heightAt(c.mesh.position.x, c.mesh.position.z);
      if (c.mesh.position.y <= g) {
        c.mesh.position.y = g;
        c.landed = true;
        c.pos.set(c.mesh.position.x, g + 0.5, c.mesh.position.z);
        c.mesh.remove(c.mesh.getObjectByName('chute'));
        c.container = game.addContainer({ kind: 'cache', name: c.name, pos: c.pos, items: [{ uid: 'f' + Math.random(), id: 'filament', count: c.amount }], mesh: c.mesh, cache: c });
      }
    }
  }

  pass() {
    const game = this.game;
    this.passes++;
    let drop = null;
    if (Math.random() < CACHE.dropChance) drop = this.pickDrop();
    // the summit sometimes gets the abominable cache
    if (Math.random() < CACHE.abominable.chance) this.dropAbominable();
    if (!drop) { if (game.debugCaches) game.hud.toast('Cargo helicopter passed — no drop', '#888'); return; }
    // fly a 6 km line through the drop point, at 300 m
    const ang = Math.random() * Math.PI * 2;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const y = Math.max(heightAt(drop.x, drop.z) + 300, 350);
    const from = new THREE.Vector3(drop.x - dx * 3000, y, drop.z - dz * 3000);
    const to = new THREE.Vector3(drop.x + dx * 3000, y, drop.z + dz * 3000);
    const mesh = buildHeli(game.scene);
    mesh.rotation.y = Math.atan2(-dx, -dz) + Math.PI;
    this.helis.push({ mesh, from, to, t: 0, dur: 75, drop, dropped: false, sound: game.audio.startHeli() });
    const S = CACHE.sizes[drop.size];
    game.hud.toast(`Cargo heli inbound — ${S.name} dropping in ${REGIONS[drop.region].name}`, '#' + S.color.toString(16).padStart(6, '0'), 6);
    game.audio.alert();
  }

  dropAbominable() {
    const s = POIS.find((p) => p.id === 'summit');
    const A = CACHE.abominable;
    const pos = new THREE.Vector3(s.x + rand(-8, 8), s.h + 250, s.z + rand(-8, 8));
    this.spawnCache({ x: pos.x, z: pos.z, size: 'abominable' }, pos);
    this.game.hud.toast(`!!! ${A.name} (${A.amount.toLocaleString()} filament) dropping on Frostfang Summit !!!`, '#ffb02e', 8);
    this.game.audio.alert();
  }

  spawnCache(drop, at) {
    const big = drop.size === 'large' || drop.size === 'abominable';
    const S = drop.size === 'abominable' ? CACHE.abominable : CACHE.sizes[drop.size];
    const amount = drop.size === 'abominable' ? S.amount : randi(S.min, S.max);
    const mesh = crateMesh(S.color, big);
    mesh.position.copy(at);
    this.game.scene.add(mesh);
    this.caches.push({ name: S.name, amount, size: drop.size, color: S.color, mesh, pos: at.clone(), landed: false, looted: false, smokeT: 0 });
  }

  markers() {
    return this.caches.filter((c) => !c.looted).map((c) => ({
      x: c.pos.x, z: c.pos.z, color: '#' + c.color.toString(16).padStart(6, '0'), label: c.size === 'abominable' ? 'ABOMINABLE CACHE' : `${c.size.toUpperCase()} CACHE`, kind: 'cache',
    }));
  }

  clear() {
    for (const h of this.helis) { this.game.scene.remove(h.mesh); if (h.sound) h.sound.stop(); }
    for (const c of this.caches) this.game.scene.remove(c.mesh);
    this.helis = []; this.caches = [];
  }
}

// Extraction at the very tip of Frostfang: call the bird, survive, board.
export class Extraction {
  constructor(game) {
    this.game = game;
    this.site = POIS.find((p) => p.id === 'summit');
    this.state = 'idle';
    this.t = 0;
    this.board = 0;
    this.heli = null;
    this.pos = new THREE.Vector3(this.site.x, this.site.h, this.site.z);
    this.callPos = this.pos.clone().add(new THREE.Vector3(12, 1.5, -8));
  }

  call() {
    if (this.state !== 'idle') return;
    this.state = 'called';
    this.t = 60;
    this.game.hud.toast('Extraction called — chopper inbound in 60 s. Everyone heard that.', '#4dff7a', 5);
    this.game.audio.alert();
    this.game.noise(this.pos, 900, null, true);
  }

  update(dt) {
    const game = this.game, P = game.player;
    if (this.state === 'idle') return;
    this.t -= dt;
    if (this.state === 'called' && this.t <= 0) {
      this.state = 'arriving';
      this.t = 10;
      this.heli = buildHeli(game.scene, 0x2f3a28);
      this.from = this.pos.clone().add(new THREE.Vector3(-600, 200, 300));
      this.to = this.pos.clone().add(new THREE.Vector3(0, 0.3, 0));
      this.heli.rotation.y = Math.atan2(-(this.to.x - this.from.x), -(this.to.z - this.from.z)) + Math.PI;
      this.sound = game.audio.startHeli();
    } else if (this.state === 'arriving') {
      const k = 1 - Math.pow(Math.max(0, this.t) / 10, 3);
      this.heli.position.lerpVectors(this.from, this.to, k);
      if (this.t <= 0) { this.state = 'landed'; this.t = 30; this.board = 0; game.hud.toast('Extraction chopper is down — get on board!', '#4dff7a', 4); }
    } else if (this.state === 'landed') {
      const near = P.alive && P.pos.distanceTo(this.to) < 7;
      this.board = near ? this.board + dt : Math.max(0, this.board - dt * 2);
      if (this.board >= 3) { this.state = 'done'; game.extracted(); }
      if (this.t <= 0) { this.state = 'leaving'; this.t = 8; game.hud.toast('The extraction chopper left without you', '#ff6a5a', 4); }
    } else if (this.state === 'leaving') {
      this.heli.position.y += dt * 15;
      this.heli.position.x += dt * 30;
      if (this.t <= 0) { this.clearHeli(); this.state = 'idle'; }
    }
    if (this.heli) {
      this.heli.userData.rotor.rotation.y += dt * 30;
      if (this.sound) this.sound.set(this.heli.position.distanceTo(game.camera.position));
    }
  }

  clearHeli() {
    if (this.heli) this.game.scene.remove(this.heli);
    if (this.sound) this.sound.stop();
    this.heli = null; this.sound = null;
  }

  status() {
    switch (this.state) {
      case 'called': return `EXTRACTION · chopper inbound ${Math.ceil(this.t)}s`;
      case 'arriving': return 'EXTRACTION · chopper landing…';
      case 'landed': return `GET IN THE CHOPPER · ${Math.ceil(this.t)}s · boarding ${Math.floor((this.board / 3) * 100)}%`;
      default: return '';
    }
  }
}
