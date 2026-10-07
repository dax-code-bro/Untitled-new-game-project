// AI combatants. States: patrol -> alert (heard something) -> combat -> search -> patrol.
import * as THREE from 'three';
import { ENEMIES, WEAPONS } from './data.js';
import { rand, randi, pick, clamp, wrapAngle } from './rng.js';
import { buildGunMesh } from './viewmodel.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const geoCache = new Map();
function bx(w, h, d) {
  const k = `${w},${h},${d}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
}
const skinMat = new THREE.MeshLambertMaterial({ color: 0xb98a64 });
const darkMat = new THREE.MeshLambertMaterial({ color: 0x222428 });
const visorMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });

export class Enemy {
  constructor(raid, type, x, z, opts = {}) {
    this.raid = raid;
    this.type = type;
    this.def = ENEMIES[type];
    this.name = opts.name || this.def.name;
    this.hvt = !!opts.hvt;
    this.hp = opts.hp || this.def.hp;
    this.maxHp = this.hp;
    this.armor = opts.armor ?? this.def.armor;
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.r = 0.38;
    this.h = 1.8;
    this.onGround = true;
    this.yaw = Math.random() * Math.PI * 2;
    this.weaponId = pick(this.def.weapons);
    this.anchor = opts.anchor || { x, z, r: 20 };
    this.squad = opts.squad || [];
    this.state = 'patrol';
    this.target = null;
    this.idleT = rand(0, 3);
    this.awareness = 0;
    this.canSee = false;
    this.lastKnown = new THREE.Vector3();
    this.lastSeen = -99;
    this.thinkT = Math.random() * 0.2;
    this.burstLeft = 0;
    this.pauseT = rand(0.3, 0.8);
    this.shotT = 0;
    this.reactT = rand(...this.def.react);
    this.strafeT = 0;
    this.strafeDir = 0;
    this.searchT = 0;
    this.stuckT = 0;
    this.detourT = 0;
    this.detourDir = 1;
    this.walkPhase = 0;
    this.dead = false;
    this.deathT = 0;
    this.lastShotT = -99;
    this.scale = this.def.boss ? 1.15 : 1;
    this.buildMesh();
  }

  buildMesh() {
    const g = new THREE.Group();
    const uni = new THREE.MeshLambertMaterial({ color: this.def.color });
    const vest = new THREE.MeshLambertMaterial({ color: this.armor > 0 ? 0x2f3528 : 0x5c4d38 });
    const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    this.legs = [];
    for (const sx of [-0.12, 0.12]) {
      const hip = new THREE.Group(); hip.position.set(sx, 0.92, 0); g.add(hip);
      add(bx(0.18, 0.92, 0.2), uni, 0, -0.46, 0, hip);
      this.legs.push(hip);
    }
    add(bx(0.5, 0.62, 0.3), uni, 0, 1.24, 0);
    add(bx(0.54, 0.46, 0.34), vest, 0, 1.28, 0);
    add(bx(0.24, 0.26, 0.24), skinMat, 0, 1.68, 0);
    add(bx(0.3, 0.14, 0.3), this.def.boss ? darkMat : uni, 0, 1.83, 0);
    if (this.def.boss || this.hvt) add(bx(0.2, 0.05, 0.02), visorMat, 0, 1.7, -0.13);
    // arms holding the rifle forward
    add(bx(0.13, 0.13, 0.5), uni, 0.2, 1.33, -0.2).rotation.x = 0.2;
    add(bx(0.13, 0.13, 0.5), uni, -0.12, 1.3, -0.3).rotation.y = 0.5;
    const gun = buildGunMesh(WEAPONS[this.weaponId], 1.25);
    gun.position.set(0.08, 1.36, -0.5);
    g.add(gun);
    this.gunMesh = gun;
    g.scale.setScalar(this.scale);
    g.rotation.order = 'YXZ';
    this.mesh = g;
    this.raid.scene.add(g);
  }

  get forward() { return _a.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  update(dt) {
    const raid = this.raid, P = raid.player;
    if (this.dead) {
      if (this.deathT < 1) {
        this.deathT = Math.min(1, this.deathT + dt * 3);
        this.mesh.rotation.x = -Math.PI / 2 * this.deathT;
        this.mesh.position.y = this.pos.y + 0.12 * this.deathT;
      }
      return;
    }
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.dist = dist;
    const far = dist > 190;
    this.mesh.visible = dist < 330;
    if (far && this.state === 'patrol') return; // dormant when far away

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      const tdt = 0.2 - this.thinkT;
      this.thinkT = rand(0.15, 0.25);
      this.perceive(dist, tdt);
    }

    let mx = 0, mz = 0, speed = 0, face = null;
    const t = raid.time;

    if (this.state === 'combat') {
      if (this.canSee) {
        face = P.pos;
        const pref = this.def.pref;
        if (dist > pref + 10) { [mx, mz] = this.steer(P.pos); speed = this.def.speed * 0.85; }
        else if (dist < 6) { mx = -dx / dist; mz = -dz / dist; speed = 2; }
        else {
          this.strafeT -= dt;
          if (this.strafeT <= 0) { this.strafeT = rand(0.8, 2.2); this.strafeDir = pick([-1, 0, 1, 1, -1]); }
          if (this.strafeDir) { mx = (-dz / dist) * this.strafeDir; mz = (dx / dist) * this.strafeDir; speed = 2; }
        }
        this.updateShooting(dt, dist);
      } else {
        this.reactT = Math.max(this.reactT, rand(0.25, 0.5));
        this.burstLeft = 0;
        if (t - this.lastSeen > 22) { this.startSearch(this.lastKnown); }
        else {
          const ld = Math.hypot(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z);
          if (ld < 2) this.startSearch(this.lastKnown);
          else if (t - this.lastSeen > 1.2) { [mx, mz] = this.steer(this.lastKnown); speed = this.def.speed; }
          face = this.lastKnown;
        }
      }
    } else if (this.state === 'alert') {
      const ld = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z);
      if (ld < 2.5) this.startSearch(this.target);
      else { [mx, mz] = this.steer(this.target); speed = this.def.speed * 0.8; }
    } else if (this.state === 'search' || this.state === 'patrol') {
      const searching = this.state === 'search';
      if (searching) { this.searchT -= dt; if (this.searchT <= 0) { this.state = 'patrol'; this.target = null; this.awareness = 0.2; } }
      if (!this.target) {
        this.idleT -= dt;
        if (this.idleT <= 0) {
          const c = searching ? this.searchCenter : this.anchor;
          const r = searching ? 14 : this.anchor.r;
          this.target = raid.randomFree(c.x, c.z, r) || null;
          this.idleT = searching ? rand(0.5, 1.5) : rand(2, 6);
        }
      } else {
        const ld = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z);
        if (ld < 1.2) this.target = null;
        else { [mx, mz] = this.steer(this.target); speed = searching ? 2.6 : 1.5; }
      }
    }

    // stuck handling: sidestep if we're not making progress
    if (speed > 0 && this.detourT > 0) {
      this.detourT -= dt;
      const ox = mx, oz = mz;
      mx = -oz * this.detourDir * 0.8 + ox * 0.2; mz = ox * this.detourDir * 0.8 + oz * 0.2;
    }
    this.vel.x = mx * speed;
    this.vel.z = mz * speed;
    this.vel.y -= 19 * dt;
    const px = this.pos.x, pz = this.pos.z;
    raid.world.moveBody(this, dt);
    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
    if (speed > 0 && moved < speed * dt * 0.3) {
      this.stuckT += dt;
      if (this.stuckT > 0.5) { this.stuckT = 0; this.detourT = rand(0.6, 1.2); this.detourDir = Math.random() < 0.5 ? -1 : 1; if (this.state === 'patrol') this.target = null; }
    } else this.stuckT = Math.max(0, this.stuckT - dt);

    // facing
    let want;
    if (face) want = Math.atan2(-(face.x - this.pos.x), -(face.z - this.pos.z));
    else if (speed > 0) want = Math.atan2(-mx, -mz);
    if (want !== undefined) {
      const d = wrapAngle(want - this.yaw);
      const turn = (this.state === 'combat' ? 7 : 4) * dt;
      this.yaw += clamp(d, -turn, turn);
    }

    // animation
    if (speed > 0 && moved > 0.001) this.walkPhase += moved * 3.2;
    const sw = speed > 0 ? Math.sin(this.walkPhase) * 0.6 : 0;
    this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
  }

  perceive(dist, tdt) {
    const raid = this.raid, P = raid.player;
    let see = false;
    if (P.alive && dist < this.def.range * 1.25) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const dot = ((P.pos.x - this.pos.x) * fx + (P.pos.z - this.pos.z) * fz) / Math.max(0.01, dist);
      const inFov = dot > 0.42 || dist < 6 || this.state === 'combat';
      if (inFov) see = this.losTo(P.pos.x, P.pos.y + P.eye - 0.1, P.pos.z) || this.losTo(P.pos.x, P.pos.y + P.eye * 0.6, P.pos.z);
    }
    this.canSee = see;
    if (see) {
      if (this.state !== 'combat') {
        let rate = 1.6 / (0.3 + dist / 16);
        if (P.crouch) rate *= 0.5;
        if (P.sprinting) rate *= 1.4;
        if (this.state === 'alert' || this.state === 'search') rate *= 2.2;
        if (raid.time - P.lastShot < 2) rate *= 2;
        this.awareness += rate * tdt;
        if (this.awareness >= 1) this.enterCombat(P.pos, true);
      } else {
        this.lastKnown.copy(P.pos);
        this.lastSeen = raid.time;
      }
    } else if (this.state !== 'combat') {
      this.awareness = Math.max(0, this.awareness - 0.12 * tdt);
    }
  }

  losTo(x, y, z) {
    const ex = this.pos.x, ey = this.pos.y + 1.65 * this.scale, ez = this.pos.z;
    _b.set(x - ex, y - ey, z - ez);
    const d = _b.length();
    _b.divideScalar(d);
    const hit = this.raid.world.raycast(ex, ey, ez, _b.x, _b.y, _b.z, d);
    return !hit || hit.t >= d - 0.4;
  }

  enterCombat(pos, seen = false, spread = true) {
    if (this.dead) return;
    const was = this.state;
    this.state = 'combat';
    this.awareness = 1;
    this.lastKnown.copy(pos);
    if (seen) this.lastSeen = this.raid.time;
    else if (this.raid.time - this.lastSeen > 20) this.lastSeen = this.raid.time - 2;
    if (was !== 'combat') {
      this.reactT = rand(...this.def.react);
      if (spread) {
        for (const m of this.squad) if (m !== this && !m.dead && m.state !== 'combat') m.enterCombat(pos, false, false);
        for (const e of this.raid.enemies) {
          if (e !== this && !e.dead && e.state !== 'combat' && e.pos.distanceTo(this.pos) < 30) e.enterCombat(pos, false, false);
        }
      }
    }
  }

  hear(pos, dist, radius) {
    if (this.dead || this.state === 'combat') return;
    if (dist < radius * 0.35) { this.enterCombat(pos, false); return; }
    this.state = 'alert';
    this.awareness = Math.max(this.awareness, 0.5);
    this.target = { x: pos.x + rand(-6, 6), z: pos.z + rand(-6, 6) };
  }

  startSearch(c) {
    this.state = 'search';
    this.searchCenter = { x: c.x, z: c.z };
    this.searchT = rand(12, 20);
    this.target = null;
    this.idleT = 0.5;
    this.awareness = 0.6;
  }

  // Next movement direction towards a goal, routing through doors when inside/outside buildings differ.
  steer(goal) {
    const wp = this.raid.nav(this.pos, goal);
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    return [dx / d, dz / d];
  }

  updateShooting(dt, dist) {
    this.reactT -= dt;
    if (this.reactT > 0) return;
    const want = Math.atan2(-(this.raid.player.pos.x - this.pos.x), -(this.raid.player.pos.z - this.pos.z));
    if (Math.abs(wrapAngle(want - this.yaw)) > 0.3) return;
    if (this.burstLeft <= 0) {
      this.pauseT -= dt;
      if (this.pauseT <= 0) this.burstLeft = randi(...this.def.burst);
      return;
    }
    this.shotT -= dt;
    if (this.shotT > 0) return;
    this.shotT = 60 / this.def.rpm * (WEAPONS[this.weaponId].auto ? 1 : 2.2);
    this.burstLeft--;
    if (this.burstLeft <= 0) this.pauseT = rand(0.6, 1.4);
    this.fire(dist);
  }

  fire(dist) {
    const raid = this.raid, P = raid.player;
    const wdef = WEAPONS[this.weaponId];
    const muzzle = this.gunMesh.localToWorld(_b.set(0, 0.015, this.gunMesh.userData.muzzleZ)).clone();
    let p = this.def.acc * clamp(1.15 - dist / this.def.range, 0.12, 1);
    if (P.moving) p *= 0.75;
    if (P.sprinting) p *= 0.75;
    if (P.crouch) p *= 0.8;
    if (dist < 10) p = Math.max(p, 0.55);
    // the first shots of an engagement are less accurate (gives the player a moment to react)
    if (raid.time - this.lastShotT > 3) p *= 0.5;
    this.lastShotT = raid.time;
    const hit = Math.random() < p;
    const tgt = new THREE.Vector3(P.pos.x, P.pos.y + P.eye * 0.75, P.pos.z);
    if (!hit) tgt.add(new THREE.Vector3(rand(-1.5, 1.5), rand(-0.6, 1.4), rand(-1.5, 1.5)));
    raid.effects.tracer(muzzle, tgt, 0xffb070, 0.06);
    raid.effects.puff(muzzle, 0xffc070, 0.08, 0.05, 0, 1);
    const ang = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z);
    raid.audio.shot(wdef.ammo, dist, clamp(-Math.sin(ang - P.yaw), -1, 1) * 0.8);
    raid.noise(this.pos, 50, this);
    if (hit) {
      const fall = clamp(1.2 - dist / (this.def.range * 1.4), 0.5, 1);
      P.damage(this.def.dmg * fall * (wdef.pellets ? 2.2 : 1), this.pos, this.name);
    }
  }

  // Returns {kill, armorHit}
  takeDamage(amount, head) {
    if (this.dead) return { kill: false, armorHit: false };
    let armorHit = false;
    if (this.armor > 0 && !head) {
      const a = Math.min(this.armor, amount);
      this.armor -= a;
      amount -= a;
      armorHit = true;
    }
    this.hp -= amount;
    if (this.state !== 'combat') this.enterCombat(this.raid.player.pos, false);
    else { this.lastKnown.copy(this.raid.player.pos); }
    if (this.hp <= 0) { this.die(); return { kill: true, armorHit }; }
    return { kill: false, armorHit };
  }

  die() {
    this.dead = true;
    this.hp = 0;
    this.legs[0].rotation.x = this.legs[1].rotation.x = 0;
    this.raid.onEnemyKilled(this);
  }
}
