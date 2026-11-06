// Weapons, hit detection and impact effects.
import * as THREE from 'three';
import { clamp } from '../util.js';

import { WEAPONS, buildWeaponModel, gunModelFor, gunRel, applyFinish } from './arsenal.js';
import { loaded, Q } from '../assets/open.js';
import { raycastObjects, raycastStatic } from '../core/hits.js';
import { HOLE } from '../world/holes.js';
import { SUBSTRATES, scanObject, scanGround, fromSurf } from '../core/substrate.js';
export { WEAPONS };

// What a round has to get through. need: penetration (gun 1-5 plus ammo) to go
// through at all; keep: share of the energy left on the far side; loss: what the
// round loses in penetration doing it; max: the thickest piece it can get through;
// thin: thickness to assume for one-sided panels. Studs in walls are harder.
export const SURF = {
  glass: { need: 0, keep: 0.9, loss: 0, max: 0.05, thin: 0.01, hole: HOLE.glass },
  drywall: { need: 1, keep: 0.78, loss: 0, max: 0.26, thin: 0.12, hole: HOLE.drywall, stud: { need: 2, keep: 0.55, loss: 1 } },
  door: { need: 1, keep: 0.8, loss: 0, max: 0.08, thin: 0.045, hole: HOLE.wood },
  frame: { need: 1, keep: 0.55, loss: 1, max: 0.3, thin: 0.18, hole: HOLE.wood, inner: HOLE.frame, stud: { need: 3, keep: 0.35, loss: 2 } },
  metal: { need: 1, keep: 0.7, loss: 0, max: 0.06, thin: 0.02, hole: HOLE.metal },
  stucco: { need: 2, keep: 0.45, loss: 1, max: 0.3, thin: 0.2, hole: HOLE.concrete },
  wood: { need: 2, keep: 0.6, loss: 1, max: 0.14, thin: 0.05, hole: HOLE.wood },
  brick: { need: 4, keep: 0.3, loss: 2, max: 0.3, thin: 0.23, hole: HOLE.brick },
  block: { need: 4, keep: 0.25, loss: 2, max: 0.3, thin: 0.2, hole: HOLE.concrete },
  floor: { need: 99, hole: HOLE.wood }, masonry: { need: 99, hole: HOLE.concrete }, stone: { need: 99, hole: HOLE.concrete }, tree: { need: 99, hole: HOLE.wood }, steel: { need: 99, hole: HOLE.metal },
  // what the substrate scanner finds on things nobody tagged
  plastic: { need: 0, keep: 0.85, loss: 0, max: 0.05, thin: 0.005, hole: HOLE.metal },
  fabric: { need: 0, keep: 0.95, loss: 0, max: 0.12, thin: 0.02, hole: -1 },
  soil: { need: 99, hole: -1 }, water: { need: 99, hole: -1 },
};
// a tag if the object has one, else whatever the substrate scanner reads off it
const surfOf = (o) => {
  if (!o) return 'masonry';
  const t = o.userData.surf || o.material?.userData?.surf || (o.parent && o.parent.userData.surf);
  if (t) return t;
  const pen = scanObject(o).sub.pen;
  return SURF[pen] ? pen : 'masonry';
};
// what the debris of an impact looks like, per kind of substrate
const DEBRIS = {
  sparks: { n: 7, speed: 1.7, life: 0.22, grav: 0.6 }, splinters: { n: 6, speed: 1.0, life: 0.6, grav: 1.4 }, shards: { n: 7, speed: 1.3, life: 0.5, grav: 1.6 },
  dust: { n: 6, speed: 1.0, life: 0.5, grav: 1 }, dirt: { n: 8, speed: 0.9, life: 0.55, grav: 1.6, up: 1.4 }, leaves: { n: 5, speed: 0.6, life: 0.9, grav: 0.35 },
  splash: { n: 9, speed: 0.8, life: 0.45, grav: 1.5, up: 2.0 }, splat: { n: 6, speed: 0.9, life: 0.5, grav: 1.4 }, chips: { n: 5, speed: 1.1, life: 0.45, grav: 1.5 },
};
const PROP_SUB = { cone: 'plastic', can: 'sheet-metal', news: 'sheet-metal', crate: 'wood', barrel: 'sheet-metal', chair: 'plastic' };
const _dc = new THREE.Color();
const _bray = new THREE.Raycaster(); _bray.firstHitOnly = true;
const _nm = new THREE.Matrix3(), _im = new THREE.Matrix4();

// Starter loadout: one of each kind (the rest of the catalog is bought in the arsenal)
const STARTER = ['fists']; // you start with nothing: every gun comes from a gunsmith (or Runr)

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
    this.dustMat = new THREE.MeshLambertMaterial({ color: 0xb8ab90, transparent: true }); // lit: unlit dust and blood glowed at night
    this.bloodMat = new THREE.MeshLambertMaterial({ color: 0x6a0606, transparent: true });
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true });
  }

  get def() { return WEAPONS[this.weapon]; }
  // a gun is out in the hands (not holstered, not fists)
  get drawn() { return !this.holstered && !this.def.melee; }

  // wheel slot a weapon belongs to
  static slotOf(id) {
    const w = WEAPONS[id];
    if (!w || id === 'fists') return 'unarmed';
    if (w.melee) return 'melee';
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
    if (!w || id === 'fists') return null; // knives and other hand weapons have models too
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
  trace(origin, dir, maxT, targets, depth = 0) {
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
      best = { t: hit.distance, kind: o.kind, ped: o.ped, animal: o.animal, vehicle: o.vehicle, mesh: hit.object, meshFace: hit.face };
      if (o.kind === 'ped') best.head = hit.point.y - o.ped.pos.y > 1.47;
    }
    const sh = targets.statics && targets.statics.length ? raycastStatic(origin, dir, best.t, targets.statics) : null;
    if (sh && sh.distance < best.t) best = { t: sh.distance, kind: 'building', obj: sh.object, face: sh.face, inst: sh.instanceId };
    const end = origin.clone().addScaledVector(dir, best.t);
    const ch = this.collision.raycastHit ? this.collision.raycastHit(origin.x, origin.y, origin.z, end.x, end.y, end.z, depth > 0) : null;
    if (ch && ch.t < 1 && !(best.obj && best.t - best.t * ch.t < 0.08)) {
      const n = new THREE.Vector3(); n.setComponent(ch.axis, ch.sign);
      best = { t: best.t * ch.t, kind: 'building', box: ch.box, tExit: best.t * ch.tExit, normal: n };
    } else if (!ch && !this.collision.raycastHit) {
      const f = this.collision.raycast(origin.x, origin.y, origin.z, end.x, end.y, end.z);
      if (f < 1) best = { t: best.t * f, kind: 'building' };
    }
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
    const ph = this.rayProps?.(origin, dir, best.t);
    if (ph) best = { t: ph.t, kind: 'prop', prop: ph.p };
    best.point = origin.clone().addScaledVector(dir, best.t);
    if (best.kind === 'building') this.wallInfo(best, dir);
    // through the wall: a round with the penetration for this material carries on, weaker
    if (best.kind === 'building' && this._pen != null && depth < 3 && best.surf) {
      const S = SURF[best.surf] || SURF.masonry;
      const R = best.stud && S.stud ? { ...S, ...S.stud } : S;
      if (this._pen >= R.need && best.thick <= (S.max || 0)) {
        const exit = best.point.clone().addScaledVector(dir, best.thick + 0.012);
        const left = maxT - best.t - best.thick;
        if (left > 0.1) {
          this._pen -= R.loss;
          const rest = this.trace(exit, dir, left, targets, depth + 1);
          rest.t += best.t + best.thick;
          rest.through = [{ point: best.point, exit, normal: best.normal, surf: best.surf, stud: best.stud }, ...(rest.through || [])];
          rest.keep = (rest.keep ?? 1) * R.keep;
          rest.penLoss = (rest.penLoss || 0) + R.loss;
          return rest;
        }
      }
    }
    return best;
  }

  // what was hit (material), which way the surface faces, how thick it is along the shot,
  // and for walls whether the round met a stud
  wallInfo(hit, dir) {
    if (hit.obj) {
      hit.surf = surfOf(hit.obj);
      const o = hit.obj;
      if (hit.face && hit.inst === undefined) { _nm.getNormalMatrix(o.matrixWorld); hit.normal = hit.face.normal.clone().applyMatrix3(_nm).normalize(); }
      else if (hit.face && o.isInstancedMesh) { o.getMatrixAt(hit.inst, _im); _im.premultiply(o.matrixWorld); _nm.getNormalMatrix(_im); hit.normal = hit.face.normal.clone().applyMatrix3(_nm).normalize(); }
      const S = SURF[hit.surf] || SURF.masonry;
      if (S.max) {
        // cast back from beyond the wall to find its far face
        _bray.set(hit.point.clone().addScaledVector(dir, S.max), dir.clone().negate()); _bray.near = 0; _bray.far = S.max;
        const back = [];
        o.raycast(_bray, back);
        hit.thick = back.length ? Math.max(0.005, S.max - Math.min(...back.map((b) => b.distance))) : S.thin;
      } else hit.thick = 99;
    } else if (hit.box) {
      const d = hit.box.data;
      hit.surf = (d && d.surf) || (d && d.shop ? 'masonry' : d && d.building ? 'masonry' : 'masonry');
      hit.thick = Math.max(0, hit.tExit - hit.t);
    } else { hit.surf = 'masonry'; hit.thick = 99; }
    if (!hit.normal) hit.normal = dir.clone().negate();
    if (hit.normal.dot(dir) > 0) hit.normal.negate();
    // studs every 16 inches along a wall (world-aligned, so they line up hole to hole)
    if (hit.surf === 'drywall' || hit.surf === 'frame') {
      const n = hit.normal, t = new THREE.Vector3(-n.z, 0, n.x);
      if (t.lengthSq() > 1e-4) { t.normalize(); const along = hit.point.dot(t) / 0.4064; hit.stud = Math.abs(along - Math.round(along)) * 0.4064 < 0.024; }
    }
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
        const killed = targets.peds.damage(best, w.damage * (0.85 + Math.random() * 0.3), from, w.id === 'fists' ? null : { part: w.kind === 'blade' ? 'torso' : 'torso', melee: true, blade: w.kind === 'blade' });
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
    this.audio?.gunshot(am.quiet ? 0.55 : 1, w.silent ? { ...w, silent: true, id: w.id } : w);
    this.fired = w; // the game applies recoil for this shot
    this.flash.position.copy(muzzle); this.flash.intensity = w.silent ? 0 : 14; this.flash.distance = 9; this.flashT = 0.05; // lights up walls, faces and the ground for a frame
    let first = null;
    const pellets = am.slug ? 1 : Math.round(w.pellets * (am.pellets || 1));
    const spread = (am.slug ? w.spread * 0.3 : w.spread) * (this.spreadMul || 1), range = am.slug ? w.range * 2 : w.range;
    for (let k = 0; k < pellets; k++) {
      const d = dir.clone();
      d.x += (Math.random() - 0.5) * spread; d.y += (Math.random() - 0.5) * spread; d.z += (Math.random() - 0.5) * spread;
      d.normalize();
      this._pen = Math.max(0, (w.pen || 1) + am.pen) + (am.slug ? 1 : 0);
      const hit = this.trace(origin, d, range, targets);
      this._pen = null;
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
    // every wall it went through: an entry hole, an exit hole blown out the far side, dust
    const cal = w.cat === 'shotgun' ? 0.006 : (w.pen || 1) >= 4 ? 0.011 : (w.pen || 1) >= 3 ? 0.009 : 0.012;
    for (const th of hit.through || []) {
      const S = SURF[th.surf] || SURF.masonry;
      const back = th.normal.clone().negate();
      if (S.hole >= 0) {
        this.holes?.add(th.point, th.normal, th.surf === 'drywall' ? HOLE.drywall : S.hole, cal);
        this.holes?.add(th.exit.clone().addScaledVector(back, -0.004), back, th.surf === 'drywall' || th.surf === 'frame' ? HOLE.drywallExit : S.hole, cal * 1.3);
      }
      this.debris(th.exit, SUBSTRATES[fromSurf(th.surf)] || SUBSTRATES.concrete, null, 0.7);
      this.onWallPierced?.(th, w);
    }
    if (hit.kind === 'animal') {
      hit.killed = hit.animal.hurt(w.damage, w);
      this.burst(hit.point, this.settings.gore ? this.bloodMat : this.dustMat, this.settings.gore ? 8 : 3);
      return;
    }
    if (hit.kind === 'ped') {
      // no fixed damage: spread, distance falloff, where it hit, ammo, armour vs penetration
      const am = hit.ammo || AMMO.FMJ;
      const fall = 1 - 0.5 * Math.min(1, Math.max(0, (hit.t - w.range * 0.4) / (w.range * 0.6)));
      // where it hit: head, torso, an arm (out to the side at chest height) or a leg
      const pd = hit.ped, dy = hit.point.y - pd.pos.y;
      const lat = (hit.point.x - pd.pos.x) * Math.cos(pd.heading || 0) - (hit.point.z - pd.pos.z) * Math.sin(pd.heading || 0);
      const part = hit.head ? 'head' : dy < 0.85 ? 'leg' : Math.abs(lat) > 0.2 && dy > 0.95 && dy < 1.5 ? 'arm' : 'torso';
      const pen = Math.max(0, (w.pen || 1) + am.pen - (hit.penLoss || 0));
      // armour by NIJ level: a plate stops what it's rated for; helmets cover the head only
      const level = part === 'torso' ? (pd.armor || 0) : part === 'head' ? (pd.helmet || 0) : 0;
      const stopped = level > 0 && (pen <= Math.floor(level) || (level % 1 > 0 && pen <= level + 0.5 && Math.random() < 0.6));
      const zone = { head: stopped ? 0.25 : 3, torso: stopped ? 0.1 : 1, arm: 0.55, leg: 0.6 }[part];
      const dmg = w.damage * (hit.slugDmg || 1) * am.dmg * (0.8 + Math.random() * 0.35) * fall * zone * (hit.keep ?? 1);
      hit.part = part; hit.stopped = stopped;
      hit.killed = targets.peds.damage(pd, dmg, from, { part, stopped, side: lat > 0 ? 'R' : 'L', pen });
      if (stopped) this.burst(hit.point, this.sparkMat, 5);
      else this.burst(hit.point, this.settings.gore ? this.bloodMat : this.dustMat, this.settings.gore ? 10 : 4);
    } else if (hit.kind === 'vehicle') {
      const v = hit.vehicle;
      v.health -= w.damage * 0.25 * ((hit.ammo && hit.ammo.vehicle) || 1) * (hit.keep ?? 1);
      this.impactFx(hit); // sparks off the body, glass off the windows, rubber off the tyres
      // through the glass (or thin doors, with enough penetration) to whoever is inside
      this.onVehicleHit?.(hit, w);
      if (v.health <= 0) this.onVehicleDestroyed?.(v, hit.point);
    } else if (hit.kind !== 'none') {
      this.impactFx(hit);
      if (hit.kind === 'building' && hit.normal) {
        const S = SURF[hit.surf] || SURF.masonry;
        // stopped in the wall: the entry hole (in a wall over a stud the round sits in the wood)
        if (S.hole >= 0) this.holes?.add(hit.point, hit.normal, hit.surf === 'frame' ? HOLE.wood : S.hole, cal * (S.hole === HOLE.concrete || S.hole === HOLE.brick ? 1.2 : 1));
      }
      if (hit.kind === 'building') this.onStaticHit?.(hit);
      if (hit.kind === 'prop') this.onPropHit?.(hit, w);
    }
  }

  explode(at, w, targets, from) {
    this.onExplosion?.(at, w.explosive || 5);
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

  burst(at, mat, n, o = null) {
    const sp = o?.speed ?? 1, life = o?.life ?? 0.5, up = o?.up ?? 1;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.puffGeo, mat.clone());
      if (o?.color) m.material.color.copy(o.color);
      if (o?.size) m.scale.setScalar(o.size * (0.6 + Math.random() * 0.8));
      m.position.copy(at);
      const v = new THREE.Vector3((Math.random() - 0.5) * 3 * sp, Math.random() * 2.5 * sp * up, (Math.random() - 0.5) * 3 * sp);
      this.scene.add(m);
      this.fx.push({ obj: m, t: life, max: life, v, g: o?.grav ?? 1 });
    }
  }

  // What a hit struck, read by the substrate scanner (whatever kind of thing it was):
  // { sub, how, confidence }
  scanHit(hit) {
    if (!hit || hit.kind === 'none') return null;
    const R = (id, how = 'kind', c = 0.9) => ({ sub: SUBSTRATES[id], how, confidence: c });
    if (hit.kind === 'ped' || hit.kind === 'animal') return R('flesh');
    if (hit.kind === 'vehicle') return hit.mesh ? scanObject(hit.mesh, hit.meshFace?.materialIndex || 0) : R('sheet-metal', 'kind', 0.6);
    if (hit.kind === 'ground') return scanGround(hit.point.x, hit.point.z);
    if (hit.kind === 'prop') return R(PROP_SUB[hit.prop?.type] || 'plastic', 'tag', 1);
    if (hit.obj) return scanObject(hit.obj, hit.face?.materialIndex || 0);
    const id = fromSurf(hit.surf);
    return id ? R(id, 'tag', 1) : R('concrete', 'default', 0.3);
  }
  substrateOf(hit) { return this.scanHit(hit)?.sub || null; }

  // Debris off whatever was hit: sparks off steel, splinters off wood, shards off glass, grit off
  // stone, dirt off the ground, a splash off water. Painted things shed chips of their own colour.
  impactFx(hit) {
    const sub = this.substrateOf(hit);
    hit.substrate = sub;
    if (!sub) return;
    const mat = hit.obj?.material || hit.mesh?.material;
    this.debris(hit.point, sub, Array.isArray(mat) ? mat[0] : mat, 1);
  }
  debris(at, sub, mat, k = 1) {
    const kind = sub.debris ? sub.debris[1] : 'chips';
    const D = DEBRIS[kind] || DEBRIS.dust;
    if (sub.debris) _dc.setHex(sub.debris[0]); else if (mat?.color) _dc.copy(mat.color); else _dc.setHex(0xb8ab90);
    const n = Math.max(1, Math.round(D.n * k));
    if (kind === 'sparks') {
      this.burst(at, this.sparkMat, n, { speed: D.speed, life: D.life, grav: D.grav, size: 0.5 });
      this.burst(at, this.dustMat, 2, { speed: 0.5, life: 0.5, color: _dc.setHex(0x8a8680) }); // and a puff of paint and scale
    } else if (sub.id === 'flesh') {
      this.burst(at, this.settings.gore ? this.bloodMat : this.dustMat, this.settings.gore ? n : 3, { speed: D.speed, life: D.life, grav: D.grav });
    } else {
      this.burst(at, this.dustMat, n, { speed: D.speed, life: D.life, grav: D.grav, up: D.up, color: _dc, size: kind === 'dust' || kind === 'dirt' || kind === 'splash' ? 1 : 0.55 });
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
      if (f.v) { f.v.y -= 9 * (f.g ?? 1) * dt; f.obj.position.addScaledVector(f.v, dt); }
      f.obj.material.opacity = clamp(f.t / f.max, 0, 1);
      if (f.t <= 0) { this.scene.remove(f.obj); f.obj.material.dispose(); if (f.obj.isLine) f.obj.geometry.dispose(); this.fx.splice(i, 1); }
    }
  }
}
