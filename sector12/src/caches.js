// Filament caches dropped by a cargo helicopter, plus the summit extraction.
import * as THREE from 'three';
import { CACHE } from './data/world.js';
import { heightAt, regionAt, islandD, POIS, REGIONS } from './terrain.js';
import { waterLevelAt } from './physics.js';
import { rand, randi, weighted } from './rng.js';

// Cargo / extraction helicopter: lathed fuselage, tapered tail boom, main + tail rotors with motion
// blur discs, skids, glazing. animateHeli() flies it: rotors spin up, nose pitches with
// acceleration, it banks into turns, bobs in the hover and kicks up rotor wash near the ground.
export function buildHeli(scene, color = 0x3d4430) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1e1f1c, roughness: 0.5, metalness: 0.6 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x1a2630, roughness: 0.05, metalness: 0.2, clearcoat: 1, transparent: true, opacity: 0.8 });
  const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, p = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; p.add(o); return o; };
  // fuselage: a lathe along Z (nose at -Z), squashed a little sideways
  const prof = [[0, -5.6], [0.9, -5.2], [1.45, -4.2], [1.6, -2.5], [1.62, 1.5], [1.4, 3.0], [0.9, 4.2], [0.55, 4.8], [0, 5.0]].map(([r, z]) => new THREE.Vector2(r, z));
  const fus = new THREE.LatheGeometry(prof, 24); fus.rotateX(Math.PI / 2); fus.scale(0.92, 1, 1);
  add(fus, body, 0, 2.2, 0);
  const canopy = new THREE.SphereGeometry(1.35, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42); canopy.scale(0.95, 0.75, 1.6);
  add(canopy, glass, 0, 2.55, -3.6, -1.15);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.9, 1.4), glass, s * 1.48, 2.6, -1.4);
  // tail boom, fin, stabiliser, tail rotor
  add(new THREE.CylinderGeometry(0.28, 0.6, 7.5, 14), body, 0, 2.75, 8.2, Math.PI / 2 - 0.04);
  add(new THREE.BoxGeometry(0.18, 2.4, 1.3), body, 0, 3.85, 11.6, -0.35);
  add(new THREE.BoxGeometry(2.4, 0.1, 0.8), body, 0, 2.95, 10.6);
  const tail = new THREE.Group(); tail.position.set(0.35, 3.9, 11.7); g.add(tail);
  for (const a of [0, Math.PI / 2]) add(new THREE.BoxGeometry(0.06, 2.4, 0.22), dark, 0, 0, 0, a, 0, 0, tail);
  // engine housing, exhausts, skids
  add(new THREE.CapsuleGeometry(0.8, 2.4, 4, 12), body, 0, 3.75, 0.6, Math.PI / 2);
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.22, 0.26, 0.6, 10), dark, s * 0.6, 3.9, 2.0, Math.PI / 2);
    add(new THREE.CapsuleGeometry(0.09, 6, 3, 8), dark, s * 1.35, 0.15, -0.3, Math.PI / 2);
    for (const z of [-1.8, 1.4]) add(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 6), dark, s * 1.2, 0.85, z, 0, 0, s * 0.3);
  }
  // main rotor: hub, four blades, and a translucent blur disc that fades in with RPM
  const rotor = new THREE.Group(); rotor.position.set(0, 4.75, 0.2); g.add(rotor);
  add(new THREE.CylinderGeometry(0.35, 0.45, 0.5, 12), dark, 0, 0, 0, 0, 0, 0, rotor);
  for (let i = 0; i < 4; i++) { const bl = add(new THREE.BoxGeometry(7.6, 0.06, 0.45), dark, 0, 0.1, 0, 0, (i * Math.PI) / 2, 0, rotor); bl.geometry.translate(3.9, 0, 0); bl.rotation.x = 0.04; }
  const blurMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const blur = new THREE.Mesh(new THREE.CircleGeometry(8.2, 48), blurMat); blur.rotation.x = -Math.PI / 2; blur.position.set(0, 4.85, 0.2); g.add(blur);
  g.userData = { rotor, tail, blur, rpm: 1, vel: new THREE.Vector3(), bank: 0, pitch: 0, t: Math.random() * 10, last: null };
  scene.add(g);
  return g;
}

// fly one frame: target position, facing yaw, game for effects
export function animateHeli(h, dt, game) {
  const U = h.userData;
  U.t += dt;
  const pos = h.position;
  const vel = U.last ? pos.clone().sub(U.last).divideScalar(Math.max(dt, 1e-3)) : new THREE.Vector3();
  const acc = vel.clone().sub(U.vel).divideScalar(Math.max(dt, 1e-3));
  U.vel.lerp(vel, Math.min(1, dt * 4));
  U.last = pos.clone();
  // body frame
  const fwd = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), h.rotation.y);
  const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), h.rotation.y);
  const speed = U.vel.dot(fwd);
  const wantPitch = THREE.MathUtils.clamp(-speed * 0.004 - acc.dot(fwd) * 0.02, -0.3, 0.25);
  const wantBank = THREE.MathUtils.clamp(-acc.dot(right) * 0.03, -0.45, 0.45);
  U.pitch += (wantPitch - U.pitch) * Math.min(1, dt * 2);
  U.bank += (wantBank - U.bank) * Math.min(1, dt * 2);
  h.rotation.order = 'YXZ';
  h.rotation.x = -U.pitch + Math.sin(U.t * 0.9) * 0.012;
  h.rotation.z = U.bank + Math.sin(U.t * 0.7) * 0.015;
  // rotors (RPM 0..1)
  U.rotor.rotation.y += dt * 32 * U.rpm;
  U.tail.rotation.x += dt * 90 * U.rpm;
  U.blur.material.opacity = 0.22 * Math.max(0, U.rpm - 0.4);
  // rotor wash: dust/snow/spray thrown out under a low helicopter
  if (game && U.rpm > 0.5) {
    const gy = heightAt(pos.x, pos.z), agl = pos.y - gy;
    U.washT = (U.washT || 0) - dt;
    if (agl < 30 && U.washT <= 0) {
      U.washT = 0.05;
      const k = 1 - agl / 30;
      const reg = regionAt(pos.x, pos.z, gy);
      const col = reg === 'n' ? [0.95, 0.96, 1] : reg === 'w' || reg === 'beach' ? [0.8, 0.7, 0.5] : [0.55, 0.5, 0.42];
      for (let i = 0; i < 6 * k + 1; i++) {
        const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 6;
        game.effects.smoke.emit({ pos: new THREE.Vector3(pos.x + Math.cos(a) * r, gy + 0.3, pos.z + Math.sin(a) * r), vel: new THREE.Vector3(Math.cos(a) * 14 * k, 0.8 + Math.random(), Math.sin(a) * 14 * k), color: col, life: 1.6 + Math.random(), size: 0.8, grow: 3.5, alpha: 0.45 * k, drag: 1.2 });
      }
    }
  }
}

// cargo crate with a hinged lid, ratchet straps, a strobe and its parachute (canopy + rigging lines)
function crateMesh(color, big) {
  const g = new THREE.Group();
  const s = big ? 1.6 : 1.1;
  const shell = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.6, metalness: 0.5 });
  const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.65, s), shell);
  crate.position.y = s * 0.325; crate.castShadow = true; g.add(crate);
  const lid = new THREE.Group(); lid.position.set(0, s * 0.65, -s / 2); lid.name = 'lid'; g.add(lid);
  const lm = new THREE.Mesh(new THREE.BoxGeometry(s * 1.02, s * 0.12, s * 1.02), shell); lm.position.set(0, s * 0.06, s / 2); lm.castShadow = true; lid.add(lm);
  const band = new THREE.Mesh(new THREE.BoxGeometry(s * 1.04, s * 0.08, s * 0.12), new THREE.MeshBasicMaterial({ color })); band.position.set(0, s * 0.06, s / 2); lid.add(band);
  for (const x of [-0.3, 0.3]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.05, s * 0.67, s * 1.03), new THREE.MeshStandardMaterial({ color: 0xa08a3a, roughness: 0.8 })); st.position.set(x * s, s * 0.33, 0); g.add(st); }
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color })); strobe.position.set(s * 0.4, s * 0.8, s * 0.4); strobe.name = 'strobe'; g.add(strobe);
  // parachute: canopy dome + lines, swings as a pendulum on the way down
  const chute = new THREE.Group(); chute.name = 'chute'; chute.position.y = s * 0.7; g.add(chute);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), new THREE.MeshStandardMaterial({ color: 0xe8e2d0, side: THREE.DoubleSide, roughness: 0.9 }));
  dome.position.y = 6; dome.name = 'dome'; dome.castShadow = true; chute.add(dome);
  const pts = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; pts.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * 3.3, 6.6, Math.sin(a) * 3.3)); }
  chute.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x555048 })));
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
      animateHeli(h.mesh, dt, game);
      if (h.drop && !h.dropped && k >= 0.5) { h.dropped = true; this.spawnCache(h.drop, h.mesh.position); }
      if (h.sound) h.sound.set(h.mesh.position.distanceTo(game.camera.position));
      if (k >= 1) { game.scene.remove(h.mesh); if (h.sound) h.sound.stop(); this.helis.splice(i, 1); }
    }
    for (const c of this.caches) {
      c.t = (c.t || 0) + dt;
      const strobe = c.mesh.getObjectByName('strobe');
      if (strobe) strobe.visible = !c.looted && (c.t % 1.2) < 0.12;
      if (c.landed) {
        // the canopy collapses and drifts down beside the crate
        const ch = c.mesh.getObjectByName('chute');
        if (ch) {
          c.fold = Math.min(1, (c.fold || 0) + dt * 0.5);
          ch.scale.set(1 + c.fold * 0.3, Math.max(0.02, 1 - c.fold), 1 + c.fold * 0.3);
          ch.position.x = c.fold * 3; ch.rotation.z = -c.fold * 0.4;
          if (c.fold >= 1) c.mesh.remove(ch);
        }
        // lid swings open once it's been looted
        const lid = c.mesh.getObjectByName('lid');
        if (lid && c.looted) lid.rotation.x += (-1.9 - lid.rotation.x) * Math.min(1, dt * 3);
        c.smokeT -= dt;
        if (c.smokeT <= 0 && !c.looted) {
          c.smokeT = 0.12;
          const col = new THREE.Color(c.color);
          game.effects.smoke.emit({ pos: c.pos.clone().setY(c.pos.y + 0.9), vel: new THREE.Vector3(Math.random() - 0.5, 2.5 + Math.random(), Math.random() - 0.5), color: [col.r, col.g, col.b], life: 6, size: 0.4, grow: 4, alpha: 0.55, drag: 0.4, gravity: -0.2 });
        }
        continue;
      }
      // descending under canopy: ~6 m/s, swinging like a pendulum, canopy breathing
      c.mesh.position.y -= dt * 6;
      const sw = Math.sin(c.t * 1.3) * 0.18, sw2 = Math.cos(c.t * 1.1) * 0.12;
      c.mesh.rotation.set(sw, c.t * 0.15, sw2);
      c.mesh.position.x += Math.sin(c.t * 0.4) * dt * 0.8;
      const dome = c.mesh.getObjectByName('dome');
      if (dome) dome.scale.set(1 + Math.sin(c.t * 3) * 0.03, 1 - Math.sin(c.t * 3) * 0.05, 1 + Math.sin(c.t * 3) * 0.03);
      const g = heightAt(c.mesh.position.x, c.mesh.position.z);
      if (c.mesh.position.y <= g) {
        c.mesh.position.y = g;
        c.mesh.rotation.set(0, c.mesh.rotation.y, 0);
        c.landed = true;
        c.pos.set(c.mesh.position.x, g + 0.5, c.mesh.position.z);
        game.effects.impact(c.mesh.position.clone(), new THREE.Vector3(0, 1, 0), regionAt(c.pos.x, c.pos.z) === 'n' ? 'snow' : 'terrain', new THREE.Vector3(0, -1, 0), 4);
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
    mesh.rotation.y = Math.atan2(-dx, -dz);
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
      this.heli.rotation.y = Math.atan2(-(this.to.x - this.from.x), -(this.to.z - this.from.z));
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
      if (this.state === 'landed') this.heli.userData.rpm = Math.max(0.75, this.heli.userData.rpm - dt * 0.05);
      else this.heli.userData.rpm = Math.min(1, this.heli.userData.rpm + dt * 0.2);
      animateHeli(this.heli, dt, game);
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
