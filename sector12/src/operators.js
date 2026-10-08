// AI operators: the other "players" on Sector 12. They roam, loot, contest filament caches and
// fight. Killing one pays filament: headshot 10, body 5, explosive or mid-air kill 30.
import * as THREE from 'three';
import { ITEMS, AMMO, ammoOptions } from './data/catalog.js';
import { OPERATOR_TIERS, OPERATOR_NAMES } from './data/world.js';
import { HumanRig, PALETTES } from './rig.js';
import { makeItem } from './inventory.js';
import { applyHit, newStatus, statusDrain, randomZone, zoneFromHit } from './damage.js';
import { heightAt, regionAt, POIS } from './terrain.js';
import { rand, randi, pick, clamp, wrapAngle } from './rng.js';

const SKIN = [0xc69a74, 0x8a5a3a, 0xe0b090, 0x5a3a26, 0xb07850, 0xd8a880];
const ghostGeo = new THREE.CapsuleGeometry(0.36, 1.2, 4, 10);
const revealMat = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.45, depthTest: false });

export const SAFE_ZONE = 150; // m around the POB: operators keep out

export class Operator {
  constructor(game, x, z, region) {
    this.game = game;
    const tier = OPERATOR_TIERS[region] || OPERATOR_TIERS.hub;
    this.tier = tier;
    this.region = region;
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
    const region = this.region;
    const palette = this.suit === 'camo_winter' ? 'winter' : this.suit === 'camo_desert' ? 'desert'
      : region === 'n' ? pick(['winter', 'urban', 'black']) : region === 'w' ? pick(['desert', 'multicam']) : region === 'e' ? pick(['woodland', 'ranger', 'multicam'])
      : pick(['woodland', 'ranger', 'multicam', 'urban', 'black']);
    const vl = this.vest ? this.vest.level : 0, hl = this.helmet ? this.helmet.level : 0;
    this.rig = new HumanRig(this.game.scene, this.game.tex, {
      palette: PALETTES[palette], skin: pick(SKIN), vest: vl, helmet: hl, pack: randi(0, 3),
      goggles: region === 'n' || region === 'w' ? Math.random() < 0.6 : Math.random() < 0.15,
      balaclava: palette === 'winter' || (region === 'n' && Math.random() < 0.5), cap: !hl && Math.random() < 0.5,
      holster: this.wdef.sub === 'Pistol' || Math.random() < 0.4,
      vestColor: vl >= 7 ? 0x1f2422 : palette === 'desert' ? 0x8a7a5a : palette === 'winter' ? 0xcfd6dc : 0x3a4030,
      helmColor: hl >= 6 ? 0x1a1a1a : palette === 'winter' ? 0xe0e4e8 : palette === 'desert' ? 0x9a8a6a : 0x45503a,
      gearColor: palette === 'desert' ? 0x6a5a40 : palette === 'winter' ? 0xa8b0b6 : 0x2a2d26,
    });
    this.rig.setWeapon(this.wdef, this.weapon);
    this.rig.onStep = (p, speed) => { if (this.dist < 35 && this.game.audio.footstep) this.game.audio.footstep(p, speed, this.dist); };
    // red outline for flare reveals: a slightly bigger silhouette drawn through walls
    const ghost = new THREE.Mesh(ghostGeo, revealMat);
    ghost.visible = false; ghost.renderOrder = 10;
    this.game.scene.add(ghost);
    this.ghost = ghost;
    this.mesh = this.rig.root;
    this.reloadT = 0; this.reloadDur = 1;
    this.aimPitch = 0;
  }

  get gunMesh() { return this.rig.gun; }

  rigState(dt, speed) {
    const P = this.game.player;
    const aiming = this.state === 'combat' && this.canSee;
    let aimYaw = this.yaw, aimPitch = 0;
    if (aiming || this.state === 'combat') {
      const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, dy = P.pos.y + P.eye * 0.75 - (this.pos.y + 1.45);
      aimYaw = Math.atan2(-dx, -dz);
      aimPitch = Math.atan2(dy, Math.hypot(dx, dz));
    }
    this.aimPitch += (aimPitch - this.aimPitch) * Math.min(1, dt * 8);
    const ground = heightAt(this.pos.x, this.pos.z);
    return {
      pos: this.pos, vel: this.vel, yaw: this.yaw, aimYaw, aimPitch: this.aimPitch,
      crouch: this.state === 'search' || (aiming && this.dist > this.pref && this.strafeDir === 0 && this.wdef.id === 'bg850'),
      aiming, sprint: speed > 4, reload: this.reloadT > 0 ? 1 - this.reloadT / this.reloadDur : -1, reloadKind: this.wdef.perRound ? 'shell' : 'mag', rounds: this.wdef.mag,
      grounded: this.onGround !== false, swim: this.swimming, dist: this.dist ?? 0, floorY: this.pos.y > ground + 0.3 ? this.pos.y : null,
    };
  }

  update(dt) {
    const game = this.game, P = game.player, t = game.time;
    if (this.dead) {
      this.dist = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
      this.rig.update(dt, { pos: this.pos, dist: this.dist });
      return;
    }
    this.ghost.visible = t < this.revealedUntil;
    if (this.ghost.visible) this.ghost.position.set(this.pos.x, this.pos.y + 0.95, this.pos.z);
    if (this.reloadT > 0) this.reloadT = Math.max(0, this.reloadT - dt);
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
    // the rig wants the velocity we actually moved at (blocked bodies shouldn't moonwalk)
    if (dt > 0) { this.vel.x = (this.pos.x - px) / dt; this.vel.z = (this.pos.z - pz) / dt; }
    if (this.mesh.visible) this.rig.update(dt, this.rigState(dt, moved / Math.max(dt, 1e-3)));
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
      else { this.weapon.mag = this.wdef.mag; this.shotT = this.wdef.reload * (this.wdef.perRound ? this.wdef.mag * 0.6 : 1); this.reloadT = this.reloadDur = Math.max(0.8, this.shotT); }
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
    this.rig.fire();
    const g = this.gunMesh;
    const muzzle = g ? new THREE.Vector3(0, 0.0, g.userData.muzzleZ).applyMatrix4(g.matrix).add(this.pos) : this.pos.clone().setY(this.pos.y + 1.4);
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
    // misses go somewhere near you: they kick up dirt, snap past, smack the tree you're behind
    if (!hit) tgt.add(new THREE.Vector3(rand(-1.6, 1.6), rand(-1.2, 1.4), rand(-1.6, 1.6)));
    const dir = tgt.clone().sub(muzzle).normalize();
    game.effects.muzzle(muzzle, dir, this.wdef.id === 'bg850' ? 2 : A.shot ? 1.4 : 1);
    if (dist < 40 && g && g.userData.eject) {
      const port = g.userData.eject.clone().applyMatrix4(g.matrix).add(this.pos);
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      if (g.userData.casing && this.wdef.mode !== 'pump' && this.wdef.mode !== 'bolt') game.effects.casing(port, right.multiplyScalar(2.5).add(new THREE.Vector3(0, 1.8, 0)), g.userData.casing);
    }
    // sound arrives at the speed of sound; a supersonic round can beat it
    const ang = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z);
    const pan = clamp(-Math.sin(ang - P.yaw), -1, 1) * 0.8, big = this.wdef.id === 'bg850';
    const snd = () => game.audio.shot(this.ammoType, dist, pan, false, big);
    if (dist > 25) game.later.push({ t: dist / 343, fn: snd }); else snd();
    game.noise(this.pos, 90, this);
    const pellets = A.shot ? (this.wdef.pellets || 8) : 1;
    const landed = A.shot ? Math.max(1, Math.round(pellets * clamp(1.2 - dist / 25, 0.15, 0.9))) : 1;
    const fall = clamp(1.2 - dist / (Math.max(this.wdef.range, 20) * 2.5), 0.45, 1);
    const name = this.name, from = this.pos.clone(), wdef = this.wdef, ammo = this.ammoType, self = this;
    const onHit = () => {
      for (let i = 0; i < landed; i++) {
        P.takeHit({ dmg: wdef.dmg * fall, pen: A.pen + (wdef.penBonus || 0), ammo, explosive: A.explosive, shot: A.shot }, from, name);
        if (!P.alive) break;
      }
      if (A.explosive) game.explode(new THREE.Vector3(P.pos.x, P.pos.y + 1, P.pos.z), A.blast, A.blastDmg, self);
    };
    const shots = A.shot ? 3 : 1;
    for (let i = 0; i < shots; i++) {
      const d = i ? dir.clone().add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(this.wdef.spread || 0.05)).normalize() : dir;
      game.fireBullet({ origin: muzzle.clone(), dir: d, muzzle: muzzle.clone(), dmg: wdef.dmg, pen: A.pen + (wdef.penBonus || 0), ammo, range: wdef.range, explosive: A.explosive && !hit, blast: A.blast, blastDmg: A.blastDmg, shot: !!A.shot, shooter: this, def: wdef, tracer: Math.random() < 0.25, hitPlayer: hit && i === 0 ? onHit : null });
    }
  }

  // hit: {dmg, pen, ammo, zone, explosive, blast, shot}; info: {byPlayer, airborne}
  takeHit(hit, info = {}) {
    if (this.dead) return { killed: false };
    const r = applyHit(this, hit);
    const from = this.game.player.pos;
    this.hitDir = new THREE.Vector3(this.pos.x - from.x, 0, this.pos.z - from.z).normalize();
    this.rig.hit(this.hitDir, Math.min(2, hit.dmg / 30));
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
    this.ghost.visible = false;
    // the body goes limp: momentum + the hit's push become a ragdoll
    const dir = this.hitDir || new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const push = info.explosive ? 7 : info.zone === 'head' ? 3.2 : 2.2;
    const imp = dir.clone().multiplyScalar(push).setY(info.explosive ? 5 : 0.6);
    this.rig.die(imp, info.zone === 'head' ? 'head' : info.zone === 'leg' ? 'legs' : 'chest', this.vel);
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

  dispose() { this.rig.dispose(); this.game.scene.remove(this.ghost); }
}
