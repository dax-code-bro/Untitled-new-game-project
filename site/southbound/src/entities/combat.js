// Weapons, hit detection and impact effects.
import * as THREE from 'three';
import { clamp } from '../util.js';

import { WEAPONS, buildWeaponModel, gunModelFor, gunRel, applyFinish } from './arsenal.js';
import { loaded, Q } from '../assets/open.js';
import { raycastObjects, raycastStatic } from '../core/hits.js';
export { WEAPONS };

// Starter loadout: one of each kind (the rest of the catalog is bought in the arsenal)
const STARTER = ['fists']; // the 9mm comes from Rico in the prologue; everything else from the gunsmiths

// Ammo types change damage and penetration (and a few other things)
export const AMMO = {
  FMJ: { dmg: 1, pen: 0 }, 'Hollow point': { dmg: 1.25, pen: -1 }, 'Armor piercing': { dmg: 0.9, pen: 2 }, Subsonic: { dmg: 0.85, pen: 0, quiet: true },
  Buckshot: { dmg: 1, pen: 0 }, Birdshot: { dmg: 0.35, pen: -1, pellets: 2 }, Slug: { dmg: 0.85, pen: 1, slug: true }, Flechette: { dmg: 0.9, pen: 1 },
  Broadhead: { dmg: 1.1, pen: 0 }, 'Small game': { dmg: 0.6, pen: -1 }, 'Fire arrow': { dmg: 1, pen: 0, fire: true },
  HE: { dmg: 1, pen: 0 }, HEAT: { dmg: 1, pen: 3, vehicle: 1.6, radius: 0.7 },
};

export class Combat {
  constructor(scene, hm, collision, settings, audio) {
    this.scene = scene; this.hm = hm; this.collision = collision; this.settings = settings; this.audio = audio;
    this.owned = [];
    this.ammo = {};
    for (const id of STARTER) this.give(id);
    this.weapon = 'fists';
    this.ammoType = {}; // weapon id -> AMMO key
    this.holstered = true; // RDR-style: guns stay holstered until drawn from the wheel
    this.dual = false; // two sidearms at once
    this.offhand = null; // the left-hand sidearm when dual wielding
    this.slots = {}; // weapon wheel: chosen weapon per slot
    this.cooldown = 0;
    this.reloading = 0;
    this.reloadDur = 1.4;
    this._side = 0;
    this.models = {};
    this.gun = null;
    this.pending = [];
    this.projGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.7, 6).rotateX(Math.PI / 2);
    this.projMat = new THREE.MeshStandardMaterial({ color: 0x555048, roughness: 0.6, emissive: 0x000000 });
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
  // a gun is out in the hands (not holstered, not fists)
  get drawn() { return !this.holstered && !this.def.melee; }

  // wheel slot a weapon belongs to
  static slotOf(id) {
    const w = WEAPONS[id];
    if (!w || w.melee) return 'unarmed';
    return { pistol: 'sidearm', rifle: 'long', shotgun: 'shotgun', sniper: 'sniper', marksman: 'sniper', bow: 'bow', launcher: 'heavy' }[w.cat] || 'long';
  }
  ownedIn(slot) { return this.owned.filter((id) => Combat.slotOf(id) === slot); }
  slotWeapon(slot) {
    const list = this.ownedIn(slot);
    if (!list.length) return null;
    if (!list.includes(this.slots[slot])) this.slots[slot] = list[0];
    return this.slots[slot];
  }
  // equip from the wheel ('unarmed' holsters)
  equip(slot, dual = false) {
    if (slot === 'unarmed') { this.holstered = true; this.dual = false; return; }
    const id = this.slotWeapon(slot);
    if (!id) return;
    this.weapon = id; this.holstered = false; this.reloading = 0;
    this.dual = false; this.offhand = null;
    if (dual && slot === 'sidearm') {
      const others = this.ownedIn('sidearm').filter((x) => x !== id);
      this.offhand = others[0] || id;
      this.dual = true;
    }
  }

  give(id) {
    const w = WEAPONS[id];
    if (!w) return false;
    if (!this.owned.includes(id)) this.owned.push(id);
    if (!w.melee) {
      const a = this.ammo[id] || (this.ammo[id] = { clip: w.clip, reserve: 0 });
      a.reserve += w.clip * (w.cat === 'launcher' ? 4 : 6);
    }
    return true;
  }

  // weapon model (built on first use; rebuilt once its open-source model has loaded)
  model(id = this.weapon, tag = '') {
    const w = WEAPONS[id];
    if (!w || w.melee) return null;
    const key = id + tag;
    let m = this.models[key];
    const G = gunModelFor(w);
    if (m && !m.userData.open && G && loaded(gunRel(G))) { this.scene.remove(m); m = null; }
    if (!m) { m = buildWeaponModel(w); m.visible = false; this.scene.add(m); this.models[key] = m; if (this.finishOf) applyFinish(m, this.finishOf(id)); }
    return m;
  }
  hideAll(except = []) { for (const m of Object.values(this.models)) if (!except.includes(m)) m.visible = false; }

  cycle() {
    const i = this.owned.indexOf(this.weapon);
    this.weapon = this.owned[(i + 1) % this.owned.length];
    this.holstered = this.def.melee; this.dual = false;
    this.reloading = 0;
  }

  reload() {
    const a = this.ammo[this.weapon];
    const b = this.dual && this.offhand ? this.ammo[this.offhand] : null;
    const full = (x, id) => !x || x.clip === WEAPONS[id].clip || x.reserve <= 0;
    if (this.reloading > 0 || (full(a, this.weapon) && (!b || full(b, this.offhand)))) return false;
    // each action type takes its own time
    const w = this.def, info = this.models[this.weapon]?.userData.hold;
    const missing = w.clip - (a ? a.clip : 0);
    this.reloadDur = w.cat === 'pistol' ? (info?.revolver ? 2.3 : 1.5) * (this.dual ? 1.6 : 1)
      : w.cat === 'shotgun' ? 1.2 + Math.min(missing, 6) * 0.35
      : w.cat === 'sniper' ? 2.6 : w.cat === 'launcher' ? 2.8 : w.cat === 'bow' ? 0.9 : 2.1;
    this.reloading = this.reloadDur;
    return true;
  }

  // Place the gun in the player's right hand, pointing along `dir`
  holdGun(human, dir, visible) {
    const m = this.model();
    if (this.gun && this.gun !== m) this.gun.visible = false;
    this.gun = m;
    if (!m) return;
    m.visible = visible;
    if (!visible || !human.handR) return;
    human.handR.getWorldPosition(this.gun.position);
    this.gun.lookAt(this.gun.position.x + dir.x, this.gun.position.y + dir.y, this.gun.position.z + dir.z);
  }

  muzzleWorld(out) { return this.gun ? out.copy(this.gun.userData.muzzle).applyMatrix4(this.gun.matrixWorld) : out; }

  // Hitscan along a ray. targets: {peds, vehicles[]}. Returns the first hit.
  // Exact hit test: real triangles of people (animated pose), animals, vehicles,
  // trunks, rocks, poles and furniture; buildings are boxes; terrain is refined
  // to the surface.
  trace(origin, dir, maxT, targets) {
    let best = { t: maxT, kind: 'none' };
    const objs = [];
    const up = (v, h) => new THREE.Vector3(v.x, v.y + h, v.z);
    for (const p of targets.peds.list) {
      if (p.mode === 'dead' || !p.h || !p.h.root.visible) continue;
      if (Math.abs(p.pos.x - origin.x) > maxT || Math.abs(p.pos.z - origin.z) > maxT) continue;
      objs.push({ root: p.h.root, center: up(p.pos, 0.9), radius: 1.25, kind: 'ped', ped: p });
    }
    for (const an of targets.animals || []) {
      if (an.dead) continue;
      objs.push({ root: an.group, center: an.center(), radius: Math.max(an.size.x, an.size.y, an.size.z) * 0.75 + 0.2, kind: 'animal', animal: an });
    }
    for (const v of targets.vehicles) {
      if (!v || !v.group) continue;
      const h = v.spec.height || 1.6;
      objs.push({ root: v.group, center: up(v.pos, h / 2), radius: Math.hypot(v.spec.len || 4.5, v.spec.width || 2, h) / 2 + 0.6, kind: 'vehicle', vehicle: v });
    }
    const hit = raycastObjects(origin, dir, maxT, objs);
    if (hit) {
      const o = hit.target;
      best = { t: hit.distance, kind: o.kind, ped: o.ped, animal: o.animal, vehicle: o.vehicle };
      if (o.kind === 'ped') best.head = hit.point.y - o.ped.pos.y > 1.47;
    }
    const sh = targets.statics && targets.statics.length ? raycastStatic(origin, dir, best.t, targets.statics) : null;
    if (sh && sh.distance < best.t) best = { t: sh.distance, kind: 'building' };
    const end = origin.clone().addScaledVector(dir, best.t);
    const f = this.collision.raycast(origin.x, origin.y, origin.z, end.x, end.y, end.z);
    if (f < 1) best = { t: best.t * f, kind: 'building' };
    // terrain: march, then bisect to the surface
    for (let s = 0.5; s < best.t; s += 1.0) {
      const y = origin.y + dir.y * s;
      if (y < this.hm.height(origin.x + dir.x * s, origin.z + dir.z * s)) {
        let lo = Math.max(0, s - 1.0), hi = s;
        for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (origin.y + dir.y * m < this.hm.height(origin.x + dir.x * m, origin.z + dir.z * m)) hi = m; else lo = m; }
        best = { t: hi, kind: 'ground' };
        break;
      }
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
    let a = this.ammo[this.weapon];
    if (this.dual && this.offhand) {
      // alternate hands; the left gun spends its own magazine
      this._side ^= 1;
      if (this._side && this.ammo[this.offhand]?.clip > 0) a = this.ammo[this.offhand];
    }
    if (a.clip <= 0) { this.reload(); return null; }
    a.clip--;
    this.cooldown = w.rate;
    const am = AMMO[this.ammoType[this.weapon]] || AMMO.FMJ;
    if (!w.silent) this.audio?.gunshot((w.cat === 'launcher' || w.cat === 'sniper' ? 1.4 : w.cat === 'pistol' ? 0.9 : 1.1) * (am.quiet ? 0.5 : 1));
    this.flash.position.copy(muzzle); this.flash.intensity = w.silent ? 0 : 4; this.flashT = 0.05;
    let first = null;
    const pellets = am.slug ? 1 : Math.round(w.pellets * (am.pellets || 1));
    const spread = am.slug ? w.spread * 0.3 : w.spread, range = am.slug ? w.range * 2 : w.range;
    for (let k = 0; k < pellets; k++) {
      const d = dir.clone();
      d.x += (Math.random() - 0.5) * spread; d.y += (Math.random() - 0.5) * spread; d.z += (Math.random() - 0.5) * spread;
      d.normalize();
      const hit = this.trace(origin, d, range, targets);
      hit.dir = d; hit.origin = origin; hit.ammo = am; hit.slugDmg = am.slug ? w.pellets : 1;
      if (!first) first = hit;
      if (w.speed > 0) {
        // rockets and arrows fly: show the projectile, apply the hit when it lands
        const p = new THREE.Mesh(this.projGeo, this.projMat);
        p.position.copy(muzzle); p.lookAt(hit.point);
        this.scene.add(p);
        this.pending.push({ obj: p, from: muzzle.clone(), hit, t: 0, T: muzzle.distanceTo(hit.point) / w.speed, w, targets, src: from.clone() });
      } else {
        if (k < 3) {
          const g = new THREE.BufferGeometry().setFromPoints([muzzle, hit.point]);
          const line = new THREE.Line(g, this.tracerMat.clone());
          this.scene.add(line);
          this.fx.push({ obj: line, t: 0.06, max: 0.06 });
        }
        this.impact(hit, w, targets, from);
      }
    }
    const hit = first;
    if (a.clip === 0) this.reload();
    return hit;
  }

  // a tracer line (enemy fire)
  tracer(a, b) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 1.5, (Math.random() - 0.5) * 3))]), this.tracerMat.clone());
    this.scene.add(line);
    this.fx.push({ obj: line, t: 0.07, max: 0.07 });
  }

  impact(hit, w, targets, from) {
    if (w.explosive) return this.explode(hit.point, w, targets, from);
    if (hit.kind === 'animal') {
      hit.killed = hit.animal.hurt(w.damage, w);
      this.burst(hit.point, this.settings.gore ? this.bloodMat : this.dustMat, this.settings.gore ? 8 : 3);
      return;
    }
    if (hit.kind === 'ped') {
      // no fixed damage: spread, distance falloff, where it hit, ammo, armour vs penetration
      const am = hit.ammo || AMMO.FMJ;
      const fall = 1 - 0.5 * Math.min(1, Math.max(0, (hit.t - w.range * 0.4) / (w.range * 0.6)));
      const legs = hit.point.y - hit.ped.pos.y < 0.85;
      const zone = hit.head ? 3 : legs ? 0.65 : 1;
      const pen = Math.max(0, (w.pen || 1) + am.pen);
      const armor = hit.head ? 0 : (hit.ped.armor || 0);
      const vs = pen >= armor ? 1 : 0.4;
      const dmg = w.damage * (hit.slugDmg || 1) * am.dmg * (0.8 + Math.random() * 0.35) * fall * zone * vs;
      hit.killed = targets.peds.damage(hit.ped, dmg, from);
      this.burst(hit.point, this.settings.gore ? this.bloodMat : this.dustMat, this.settings.gore ? 10 : 4);
    } else if (hit.kind === 'vehicle') {
      const v = hit.vehicle;
      v.health -= w.damage * 0.25 * ((hit.ammo && hit.ammo.vehicle) || 1);
      this.burst(hit.point, this.sparkMat, 6);
      // through the glass (or thin doors, with enough penetration) to whoever is inside
      this.onVehicleHit?.(hit, w);
      if (v.health <= 0) this.onVehicleDestroyed?.(v, hit.point);
    } else if (hit.kind !== 'none') {
      this.burst(hit.point, this.dustMat, 6);
      if (hit.kind === 'building') this.onStaticHit?.(hit);
    }
  }

  explode(at, w, targets, from) {
    const R = w.explosive;
    for (const p of targets.peds.list) {
      if (p.mode === 'dead') continue;
      const d = p.pos.distanceTo(at);
      if (d < R) targets.peds.damage(p, w.damage * (1 - d / R), from);
    }
    for (const an of targets.animals || []) if (!an.dead && an.pos.distanceTo(at) < R) an.hurt(w.damage, w);
    for (const v of targets.vehicles) {
      if (v && v.pos.distanceTo(at) < R) {
        v.health -= w.damage * (1 - v.pos.distanceTo(at) / R) * 1.4;
        v.impact = Math.max(v.impact, 6);
        if (v.health <= 0) this.onVehicleDestroyed?.(v, at, true);
      }
    }
    this.burst(at, this.sparkMat, 26);
    this.burst(at, this.dustMat, 30);
    this.flash.position.copy(at); this.flash.intensity = 60; this.flash.distance = 40; this.flashT = 0.18;
    this.audio?.gunshot(2.5); this.audio?.thud(1);
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
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t += dt;
      p.obj.position.lerpVectors(p.from, p.hit.point, Math.min(1, p.t / Math.max(p.T, 1e-3)));
      if (p.t >= p.T) { this.scene.remove(p.obj); this.impact(p.hit, p.w, p.targets, p.src); this.pending.splice(i, 1); }
    }
    if (this.reloading > 0 && (this.reloading -= dt) <= 0) {
      for (const id of this.dual && this.offhand ? [this.weapon, this.offhand] : [this.weapon]) {
        const a = this.ammo[id];
        if (a) { const need = WEAPONS[id].clip - a.clip, take = Math.min(need, a.reserve); a.clip += take; a.reserve -= take; }
      }
      this.reloading = 0;
    }
    if (this.flashT > 0 && (this.flashT -= dt) <= 0) { this.flash.intensity = 0; this.flash.distance = 4; }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t -= dt;
      if (f.v) { f.v.y -= 9 * dt; f.obj.position.addScaledVector(f.v, dt); }
      f.obj.material.opacity = clamp(f.t / f.max, 0, 1);
      if (f.t <= 0) { this.scene.remove(f.obj); f.obj.material.dispose(); if (f.obj.isLine) f.obj.geometry.dispose(); this.fx.splice(i, 1); }
    }
  }
}
