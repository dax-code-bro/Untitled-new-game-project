// AI operators: the other "players" on Sector 12. They roam, loot, contest filament caches and
// fight. Killing one pays filament: headshot 10, body 5, explosive or mid-air kill 30.
import * as THREE from 'three';
import { ITEMS, AMMO, ammoOptions } from './data/catalog.js';
import { OPERATOR_TIERS, OPERATOR_NAMES } from './data/world.js';
import { buildItemModel } from './viewmodel.js';
import { makeItem } from './inventory.js';
import { applyHit, newStatus, statusDrain, randomZone, zoneFromHit } from './damage.js';
import { heightAt, regionAt, POIS } from './terrain.js';
import { rand, randi, pick, clamp, wrapAngle } from './rng.js';

const geo = new Map();
const bx = (w, h, d) => { const k = `${w},${h},${d}`; if (!geo.has(k)) geo.set(k, new THREE.BoxGeometry(w, h, d)); return geo.get(k); };
const skin = new THREE.MeshLambertMaterial({ color: 0xb98a64 });
const revealMat = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.45, depthTest: false });

export const SAFE_ZONE = 150; // m around the POB: operators keep out

export class Operator {
  constructor(game, x, z, region) {
    this.game = game;
    const tier = OPERATOR_TIERS[region] || OPERATOR_TIERS.hub;
    this.tier = tier;
    this.name = pick(OPERATOR_NAMES) + (Math.random() < 0.4 ? randi(1, 99) : '');
    this.pos = new THREE.Vector3(x, heightAt(x, z), z);
    this.vel = new THREE.Vector3();
    this.r = 0.38; this.h = 1.8; this.onGround = true;
    this.yaw = Math.random() * Math.PI * 2;
    this.hp = 100;
    this.status = newStatus();
    const vl = randi(...tier.vest), hl = randi(...tier.helmet);
    this.vest = vl ? { level: vl, dur: 40 + vl * 25 } : null;
    this.helmet = hl ? { level: hl, dur: 40 + hl * 25 } : null;
    this.suit = region === 'n' && Math.random() < 0.3 ? 'camo_winter' : region === 'w' && Math.random() < 0.15 ? 'camo_desert' : null;
    this.weapon = makeItem(pick(tier.weapons));
    this.wdef = ITEMS[this.weapon.id];
    this.weapon.mag = this.wdef.mag;
    this.ammoType = ammoOptions(this.wdef)[0];
    this.acc = tier.acc;
    this.filament = randi(...tier.filament);
    this.range = this.wdef.id === 'bg850' ? 320 : this.wdef.ammoClass === 'shotgun' ? 35 : this.wdef.sub === 'Pistol' || this.wdef.sub === 'Revolver' ? 60 : 110;
    this.pref = this.wdef.id === 'bg850' ? 150 : this.wdef.ammoClass === 'shotgun' ? 8 : this.wdef.sub === 'Pistol' ? 14 : 28;
    this.state = 'roam';
    this.dest = null;
    this.awareness = 0;
    this.canSee = false;
    this.lastKnown = new THREE.Vector3();
    this.lastSeen = -99;
    this.thinkT = Math.random() * 0.3;
    this.burstLeft = 0; this.pauseT = rand(0.3, 0.8); this.shotT = 0; this.reactT = rand(0.5, 1);
    this.strafeT = 0; this.strafeDir = 0; this.stuckT = 0; this.detourT = 0; this.detourDir = 1;
    this.walk = 0;
    this.dead = false; this.deathT = 0;
    this.lastShotT = -99;
    this.revealedUntil = -1;
    this.buildMesh();
  }

  buildMesh() {
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    const uniCol = this.suit === 'camo_winter' ? 0xe6ebef : this.suit === 'camo_desert' ? 0xc9ac78 : pick([0x4f5a3a, 0x5a4f3f, 0x3f4a55, 0x6a6a5a, 0x2f3a2f]);
    const uni = new THREE.MeshLambertMaterial({ color: uniCol });
    const vest = new THREE.MeshLambertMaterial({ color: this.vest ? (this.vest.level >= 7 ? 0x1f2422 : 0x3a4030) : uniCol });
    const add = (gg, m, x, y, z, p = g) => { const o = new THREE.Mesh(gg, m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
    this.legs = [];
    for (const sx of [-0.12, 0.12]) {
      const hip = new THREE.Group(); hip.position.set(sx, 0.92, 0); g.add(hip);
      add(bx(0.18, 0.92, 0.2), uni, 0, -0.46, 0, hip);
      this.legs.push(hip);
    }
    add(bx(0.5, 0.62, 0.3), uni, 0, 1.24, 0);
    if (this.vest) add(bx(0.55, 0.46, 0.36), vest, 0, 1.28, 0);
    add(bx(0.24, 0.26, 0.24), skin, 0, 1.68, 0);
    if (this.helmet) add(bx(0.3, 0.14, 0.3), new THREE.MeshLambertMaterial({ color: this.helmet.level >= 6 ? 0x1a1a1a : 0x45503a }), 0, 1.83, 0);
    add(bx(0.13, 0.13, 0.5), uni, 0.2, 1.33, -0.2).rotation.x = 0.2;
    add(bx(0.13, 0.13, 0.5), uni, -0.12, 1.3, -0.3).rotation.y = 0.5;
    const gun = buildItemModel(this.wdef, this.weapon);
    gun.scale.setScalar(1.2);
    gun.position.set(0.08, 1.36, -0.45);
    g.add(gun);
    this.gunMesh = gun;
    // red outline for flare reveals: a slightly bigger silhouette drawn through walls
    const ghost = new THREE.Mesh(bx(0.7, 1.95, 0.45), revealMat);
    ghost.position.y = 0.97; ghost.visible = false; ghost.renderOrder = 10;
    g.add(ghost);
    this.ghost = ghost;
    this.mesh = g;
    this.game.scene.add(g);
  }

  update(dt) {
    const game = this.game, P = game.player, t = game.time;
    if (this.dead) {
      if (this.deathT < 1) { this.deathT = Math.min(1, this.deathT + dt * 3); this.mesh.rotation.x = -Math.PI / 2 * this.deathT; this.mesh.position.y = this.pos.y + 0.12 * this.deathT; }
      return;
    }
    this.ghost.visible = t < this.revealedUntil;
    const drain = statusDrain(this.status);
    if (drain > 0) { this.hp -= drain * dt; if (this.hp <= 0) return this.die({ bleed: true }); }
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.dist = dist;
    this.mesh.visible = dist < 900;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { const tdt = 0.25 - this.thinkT; this.thinkT = rand(0.2, 0.3); this.perceive(dist, tdt); }

    let mx = 0, mz = 0, speed = 0, face = null;
    if (this.state === 'combat' && P.alive) {
      if (this.canSee) {
        face = P.pos;
        if (dist > this.pref + 12) { [mx, mz] = this.dirTo(P.pos); speed = 4.2; }
        else if (dist < this.pref * 0.5) { mx = -dx / dist; mz = -dz / dist; speed = 2.5; }
        else {
          this.strafeT -= dt;
          if (this.strafeT <= 0) { this.strafeT = rand(0.8, 2.2); this.strafeDir = pick([-1, 0, 1, 1, -1]); }
          if (this.strafeDir) { mx = (-dz / dist) * this.strafeDir; mz = (dx / dist) * this.strafeDir; speed = 2.2; }
        }
        this.updateShooting(dt, dist);
      } else {
        this.burstLeft = 0;
        this.reactT = Math.max(this.reactT, rand(0.3, 0.6));
        const ld = Math.hypot(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z);
        if (t - this.lastSeen > 25 || ld < 2) { this.state = 'search'; this.searchT = rand(10, 18); this.dest = null; }
        else if (t - this.lastSeen > 1.5) { [mx, mz] = this.dirTo(this.lastKnown); speed = 4.4; face = this.lastKnown; }
      }
    } else {
      if (this.state === 'combat') this.state = 'roam';
      if (this.state === 'search') { this.searchT -= dt; if (this.searchT <= 0) this.state = 'roam'; }
      if (this.state === 'alert' && this.dest && Math.hypot(this.dest.x - this.pos.x, this.dest.z - this.pos.z) < 3) { this.state = 'search'; this.searchT = rand(8, 14); this.dest = null; }
      if (!this.dest || Math.hypot(this.dest.x - this.pos.x, this.dest.z - this.pos.z) < 3) this.dest = this.pickDest();
      if (this.dest) { [mx, mz] = this.dirTo(this.dest); speed = this.state === 'roam' ? 2.6 : 3.6; }
    }
    // keep out of the POB safe zone
    const pd = Math.hypot(this.pos.x - game.pob.origin.x, this.pos.z - game.pob.origin.z);
    if (pd < SAFE_ZONE) { mx = (this.pos.x - game.pob.origin.x) / pd; mz = (this.pos.z - game.pob.origin.z) / pd; speed = Math.max(speed, 3); }

    if (speed > 0 && this.detourT > 0) {
      this.detourT -= dt;
      const ox = mx, oz = mz;
      mx = -oz * this.detourDir * 0.8 + ox * 0.2; mz = ox * this.detourDir * 0.8 + oz * 0.2;
    }
    const fr = this.status.fracture ? 0.6 : 1;
    this.vel.x = mx * speed * fr;
    this.vel.z = mz * speed * fr;
    this.vel.y -= 19 * dt;
    const px = this.pos.x, pz = this.pos.z;
    game.physics.moveBody(this, dt);
    if (this.swimming) this.pos.y = this.waterLevel - 1.3;
    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
    if (speed > 0 && moved < speed * dt * 0.3) {
      this.stuckT += dt;
      if (this.stuckT > 0.5) { this.stuckT = 0; this.detourT = rand(0.6, 1.4); this.detourDir = Math.random() < 0.5 ? -1 : 1; if (this.state !== 'combat') this.dest = null; }
    } else this.stuckT = Math.max(0, this.stuckT - dt);

    let want;
    if (face) want = Math.atan2(-(face.x - this.pos.x), -(face.z - this.pos.z));
    else if (speed > 0) want = Math.atan2(-mx, -mz);
    if (want !== undefined) {
      const d = wrapAngle(want - this.yaw), turn = (this.state === 'combat' ? 6 : 3.5) * dt;
      this.yaw += clamp(d, -turn, turn);
    }
    if (speed > 0 && moved > 0.001) this.walk += moved * 3.2;
    const sw = speed > 0 ? Math.sin(this.walk) * 0.6 : 0;
    this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
  }

  dirTo(p) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    return [dx / d, dz / d];
  }

  pickDest() {
    const game = this.game;
    // go for a filament cache if one is close
    const c = game.caches ? game.caches.nearestCache(this.pos, 1500) : null;
    if (c && Math.random() < 0.7) return { x: c.pos.x + rand(-3, 3), z: c.pos.z + rand(-3, 3) };
    // otherwise drift towards a point of interest in this region, or wander
    if (Math.random() < 0.4) {
      const reg = regionAt(this.pos.x, this.pos.z);
      const poi = POIS.filter((p) => p.region === reg && p.kind !== 'pob' && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 1200);
      if (poi.length) { const p = pick(poi); return { x: p.x + rand(-p.r, p.r) * 0.6, z: p.z + rand(-p.r, p.r) * 0.6 }; }
    }
    const a = Math.random() * Math.PI * 2, r = rand(40, 160);
    return { x: this.pos.x + Math.cos(a) * r, z: this.pos.z + Math.sin(a) * r };
  }

  perceive(dist, tdt) {
    const game = this.game, P = game.player;
    let see = false;
    if (P.alive && dist < this.range * 1.3 && !game.inSafeZone(P.pos)) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const dot = ((P.pos.x - this.pos.x) * fx + (P.pos.z - this.pos.z) * fz) / Math.max(0.01, dist);
      if (dot > 0.35 || dist < 7 || this.state === 'combat') {
        const eye = { x: this.pos.x, y: this.pos.y + 1.65, z: this.pos.z };
        see = game.physics.lineOfSight(eye, { x: P.pos.x, y: P.pos.y + P.eye - 0.1, z: P.pos.z }) ||
              game.physics.lineOfSight(eye, { x: P.pos.x, y: P.pos.y + P.eye * 0.55, z: P.pos.z });
      }
    }
    this.canSee = see;
    if (see) {
      if (this.state !== 'combat') {
        let rate = 1.5 / (0.3 + dist / 22);
        if (P.crouch) rate *= 0.5;
        if (P.sprinting) rate *= 1.4;
        const suit = P.inv.suit ? ITEMS[P.inv.suit.id] : null;
        if (suit) rate *= suit.camo === (P.region === 'e' ? 's' : P.region) ? 0.35 : 0.75;
        if (this.state === 'alert' || this.state === 'search') rate *= 2;
        if (game.time - P.lastShot < 2) rate *= 2;
        this.awareness += rate * tdt;
        if (this.awareness >= 1) this.engage(P.pos, true);
      } else { this.lastKnown.copy(P.pos); this.lastSeen = game.time; }
    } else if (this.state !== 'combat') this.awareness = Math.max(0, this.awareness - 0.1 * tdt);
  }

  engage(pos, seen) {
    if (this.dead) return;
    if (this.state !== 'combat') this.reactT = rand(0.45, 0.9);
    this.state = 'combat';
    this.awareness = 1;
    this.lastKnown.copy(pos);
    if (seen) this.lastSeen = this.game.time;
    else if (this.game.time - this.lastSeen > 25) this.lastSeen = this.game.time - 2;
  }

  hear(pos, dist, radius) {
    if (this.dead || this.state === 'combat') return;
    if (this.game.inSafeZone(pos)) return;
    if (dist < radius * 0.3) { this.engage(pos, false); return; }
    this.state = 'alert';
    this.awareness = Math.max(this.awareness, 0.5);
    this.dest = { x: pos.x + rand(-10, 10), z: pos.z + rand(-10, 10) };
  }

  updateShooting(dt, dist) {
    this.reactT -= dt;
    if (this.reactT > 0) return;
    const P = this.game.player;
    const want = Math.atan2(-(P.pos.x - this.pos.x), -(P.pos.z - this.pos.z));
    if (Math.abs(wrapAngle(want - this.yaw)) > 0.3) return;
    if (this.burstLeft <= 0) {
      this.pauseT -= dt;
      if (this.pauseT <= 0) this.burstLeft = this.wdef.mode === 'auto' ? randi(3, 7) : randi(1, 3);
      return;
    }
    this.shotT -= dt;
    if (this.shotT > 0) return;
    if (this.weapon.mag <= 0) {
      if (this.wdef.noReload) { this.weapon = makeItem('m1911'); this.wdef = ITEMS.m1911; this.weapon.mag = 7; this.ammoType = 'medium'; }
      else { this.weapon.mag = this.wdef.mag; this.shotT = this.wdef.reload * (this.wdef.perRound ? this.wdef.mag * 0.6 : 1); }
      return;
    }
    const rpm = Math.min(this.wdef.rpm, this.wdef.mode === 'auto' ? 700 : 240);
    this.shotT = 60 / rpm;
    this.burstLeft--;
    this.weapon.mag--;
    if (this.burstLeft <= 0) this.pauseT = rand(0.6, 1.5);
    this.fire(dist);
  }

  fire(dist) {
    const game = this.game, P = game.player;
    const muzzle = this.gunMesh.localToWorld(new THREE.Vector3(0, 0.015, this.gunMesh.userData.muzzleZ));
    const A = AMMO[this.ammoType];
    let p = this.acc * clamp(1.2 - dist / (this.range * 1.1), 0.1, 1);
    if (this.wdef.id === 'bg850') p = this.acc * clamp(1.15 - dist / 600, 0.2, 1);
    if (P.moving) p *= 0.75;
    if (P.sprinting) p *= 0.75;
    if (P.crouch) p *= 0.8;
    if (dist < 8) p = Math.max(p, 0.6);
    if (game.time - this.lastShotT > 3) p *= 0.5; // first shots are wild: time to react
    this.lastShotT = game.time;
    const hit = Math.random() < p;
    const tgt = new THREE.Vector3(P.pos.x, P.pos.y + P.eye * 0.75, P.pos.z);
    if (!hit) tgt.add(new THREE.Vector3(rand(-1.5, 1.5), rand(-0.6, 1.4), rand(-1.5, 1.5)));
    game.effects.tracer(muzzle, tgt, 0xffb070, 0.06);
    game.effects.puff(muzzle, 0xffc070, 0.08, 0.05, 0, 1);
    const ang = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z);
    game.audio.shot(this.ammoType, dist, clamp(-Math.sin(ang - P.yaw), -1, 1) * 0.8, false, this.wdef.id === 'bg850');
    game.noise(this.pos, 90, this);
    if (!hit) return;
    const pellets = A.shot ? (this.wdef.pellets || 8) : 1;
    const landed = A.shot ? Math.max(1, Math.round(pellets * clamp(1.2 - dist / 25, 0.15, 0.9))) : 1;
    const fall = clamp(1.2 - dist / (Math.max(this.wdef.range, 20) * 2.5), 0.45, 1);
    for (let i = 0; i < landed; i++) {
      P.takeHit({ dmg: this.wdef.dmg * fall, pen: A.pen + (this.wdef.penBonus || 0), ammo: this.ammoType, explosive: A.explosive, shot: A.shot }, this.pos, this.name);
      if (!P.alive) break;
    }
    if (A.explosive) game.explode(tgt, A.blast, A.blastDmg, this);
  }

  // hit: {dmg, pen, ammo, zone, explosive, blast, shot}; info: {byPlayer, airborne}
  takeHit(hit, info = {}) {
    if (this.dead) return { killed: false };
    const r = applyHit(this, hit);
    if (this.state !== 'combat' && info.byPlayer) this.engage(this.game.player.pos, false);
    else if (info.byPlayer) this.lastKnown.copy(this.game.player.pos);
    if (this.hp <= 0) { this.die({ ...info, zone: hit.zone, explosive: hit.explosive || hit.blast }); return { ...r, killed: true }; }
    return r;
  }

  zoneAt(point) {
    const lateral = Math.hypot(point.x - this.pos.x, point.z - this.pos.z);
    return zoneFromHit(point.y - this.pos.y, lateral);
  }

  die(info) {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.legs[0].rotation.x = this.legs[1].rotation.x = 0;
    this.ghost.visible = false;
    this.game.onOperatorKilled(this, info);
  }

  lootTable() {
    const out = [];
    const w = { ...this.weapon, mag: 0 };
    out.push(w);
    const pack = Object.values(ITEMS).find((d) => d.cat === 'ammo' && d.ammo === this.ammoType);
    if (pack) out.push(makeItem(pack.id, { count: randi(Math.ceil(pack.amount * 0.5), pack.amount * 2) }));
    if (this.filament > 0) out.push({ uid: 'f' + Math.random(), id: 'filament', count: this.filament });
    if (Math.random() < 0.5) out.push(makeItem('bandage', { count: randi(1, 3) }));
    if (Math.random() < 0.25) out.push(makeItem(pick(['gauze', 'tourniquet', 'medkit', 'adrenaline'])));
    if (Math.random() < 0.35) out.push(makeItem('cloth', { count: randi(1, 3) }));
    if (this.vest && this.vest.dur > 0 && Math.random() < 0.5) out.push(makeItem(`vest${this.vest.level}`, { dur: this.vest.dur }));
    if (this.helmet && this.helmet.dur > 0 && Math.random() < 0.4) out.push(makeItem(`helmet${this.helmet.level}`, { dur: this.helmet.dur }));
    if (this.suit && Math.random() < 0.5) out.push(makeItem(this.suit));
    return out;
  }

  dispose() { this.game.scene.remove(this.mesh); }
}
