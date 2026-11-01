// Weapons, hit detection and impact effects.
import * as THREE from 'three';
import { clamp } from '../util.js';

export const WEAPONS = {
  fists: { name: 'Fists', icon: '👊', damage: 26, range: 1.6, rate: 0.55, melee: true },
  pistol: { name: 'Calvera 9mm', icon: '🔫', damage: 34, range: 160, rate: 0.28, clip: 12, spread: 0.012 },
};

function makePistol() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.35, metalness: 0.8 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.8 });
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.035, 0.19), metal); slide.position.set(0, 0.03, 0.06);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.16), metal); frame.position.set(0, 0.005, 0.05);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.045), grip); handle.position.set(0, -0.04, -0.005); handle.rotation.x = -0.25;
  g.add(slide, frame, handle);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.muzzle = new THREE.Vector3(0, 0.03, 0.16);
  return g;
}

export class Combat {
  constructor(scene, hm, collision, settings, audio) {
    this.scene = scene; this.hm = hm; this.collision = collision; this.settings = settings; this.audio = audio;
    this.owned = ['fists', 'pistol'];
    this.weapon = 'fists';
    this.ammo = { pistol: { clip: 12, reserve: 96 } };
    this.cooldown = 0;
    this.reloading = 0;
    this.gun = makePistol();
    this.gun.visible = false;
    scene.add(this.gun);
    this.fx = [];
    this.flash = new THREE.PointLight(0xffc070, 0, 4, 2);
    scene.add(this.flash);
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.9 });
    this.puffGeo = new THREE.SphereGeometry(0.06, 6, 4);
    this.dustMat = new THREE.MeshBasicMaterial({ color: 0xb8ab90, transparent: true });
    this.bloodMat = new THREE.MeshBasicMaterial({ color: 0x6a0606, transparent: true });
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true });
  }

  get def() { return WEAPONS[this.weapon]; }

  cycle() {
    const i = this.owned.indexOf(this.weapon);
    this.weapon = this.owned[(i + 1) % this.owned.length];
    this.reloading = 0;
  }

  reload() {
    const a = this.ammo[this.weapon];
    if (!a || a.clip === WEAPONS[this.weapon].clip || a.reserve <= 0 || this.reloading > 0) return false;
    this.reloading = 1.4;
    return true;
  }

  // Place the gun in the player's right hand, pointing along `dir`
  holdGun(human, dir, visible) {
    this.gun.visible = visible && this.weapon === 'pistol';
    if (!this.gun.visible || !human.handR) return;
    human.handR.getWorldPosition(this.gun.position);
    this.gun.lookAt(this.gun.position.x + dir.x, this.gun.position.y + dir.y, this.gun.position.z + dir.z);
  }

  muzzleWorld(out) { return out.copy(this.gun.userData.muzzle).applyMatrix4(this.gun.matrixWorld); }

  // Hitscan along a ray. targets: {peds, vehicles[]}. Returns the first hit.
  trace(origin, dir, maxT, targets) {
    let best = { t: maxT, kind: 'none' };
    const ph = targets.peds.raycast(origin, dir, maxT);
    if (ph && ph.t < best.t) best = { t: ph.t, kind: 'ped', ped: ph.p, head: ph.head };
    for (const v of targets.vehicles) {
      if (!v) continue;
      const c = v.pos.clone(); c.y += v.spec.height * 0.5;
      const oc = c.sub(origin);
      const tca = oc.dot(dir);
      if (tca < 0) continue;
      const r = Math.min(v.spec.len, 6) * 0.42;
      const d2 = oc.lengthSq() - tca * tca;
      if (d2 > r * r) continue;
      const t = tca - Math.sqrt(r * r - d2);
      if (t > 0 && t < best.t) best = { t, kind: 'vehicle', vehicle: v };
    }
    const end = origin.clone().addScaledVector(dir, best.t);
    const f = this.collision.raycast(origin.x, origin.y, origin.z, end.x, end.y, end.z);
    if (f < 1) best = { t: best.t * f, kind: 'building' };
    // terrain
    for (let s = 1; s < best.t; s += 1.5) {
      const x = origin.x + dir.x * s, y = origin.y + dir.y * s, z = origin.z + dir.z * s;
      if (y < this.hm.height(x, z)) { best = { t: s, kind: 'ground' }; break; }
    }
    best.point = origin.clone().addScaledVector(dir, best.t);
    return best;
  }

  // Player attack. Returns a hit (or null) so the game can react (crimes etc.)
  attack(origin, dir, muzzle, targets, from) {
    const w = this.def;
    if (this.cooldown > 0 || this.reloading > 0) return null;
    if (w.melee) {
      this.cooldown = w.rate;
      // hit the closest ped in front within reach
      let best = null, bd = w.range;
      for (const p of targets.peds.list) {
        if (p.mode === 'dead') continue;
        const dx = p.pos.x - from.x, dz = p.pos.z - from.z, d = Math.hypot(dx, dz);
        if (d < bd && (dx * dir.x + dz * dir.z) / (d || 1) > 0.5) { bd = d; best = p; }
      }
      if (best) {
        const killed = targets.peds.damage(best, w.damage, from);
        this.audio?.thud(0.4);
        return { kind: 'ped', ped: best, killed, melee: true };
      }
      return { kind: 'swing', melee: true };
    }
    const a = this.ammo[this.weapon];
    if (a.clip <= 0) { this.reload(); return null; }
    a.clip--;
    this.cooldown = w.rate;
    const d = dir.clone();
    d.x += (Math.random() - 0.5) * w.spread; d.y += (Math.random() - 0.5) * w.spread; d.z += (Math.random() - 0.5) * w.spread;
    d.normalize();
    const hit = this.trace(origin, d, w.range, targets);
    this.audio?.gunshot();
    // effects: muzzle flash + tracer from the gun to the hit point
    this.flash.position.copy(muzzle); this.flash.intensity = 4; this.flashT = 0.05;
    const g = new THREE.BufferGeometry().setFromPoints([muzzle, hit.point]);
    const line = new THREE.Line(g, this.tracerMat.clone());
    this.scene.add(line);
    this.fx.push({ obj: line, t: 0.06, max: 0.06 });
    if (hit.kind === 'ped') {
      hit.killed = targets.peds.damage(hit.ped, w.damage * (hit.head ? 3 : 1), from);
      this.burst(hit.point, this.settings.gore ? this.bloodMat : this.dustMat, this.settings.gore ? 10 : 4);
    } else if (hit.kind === 'vehicle') {
      hit.vehicle.health -= 8;
      this.burst(hit.point, this.sparkMat, 6);
    } else if (hit.kind !== 'none') {
      this.burst(hit.point, this.dustMat, 6);
    }
    if (a.clip === 0) this.reload();
    return hit;
  }

  burst(at, mat, n) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.puffGeo, mat.clone());
      m.position.copy(at);
      const v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3);
      this.scene.add(m);
      this.fx.push({ obj: m, t: 0.5, max: 0.5, v });
    }
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading > 0 && (this.reloading -= dt) <= 0) {
      const a = this.ammo[this.weapon];
      if (a) { const need = WEAPONS[this.weapon].clip - a.clip, take = Math.min(need, a.reserve); a.clip += take; a.reserve -= take; }
      this.reloading = 0;
    }
    if (this.flashT > 0 && (this.flashT -= dt) <= 0) this.flash.intensity = 0;
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t -= dt;
      if (f.v) { f.v.y -= 9 * dt; f.obj.position.addScaledVector(f.v, dt); }
      f.obj.material.opacity = clamp(f.t / f.max, 0, 1);
      if (f.t <= 0) { this.scene.remove(f.obj); f.obj.material.dispose(); if (f.obj.isLine) f.obj.geometry.dispose(); this.fx.splice(i, 1); }
    }
  }
}
