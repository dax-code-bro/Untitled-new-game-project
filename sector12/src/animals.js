// Wildlife. Spawns are rolled from per-region percentage tables (data/world.js) so animals stay rare.
// Realistic-ish hunting: head/vitals/body/leg zones, bleeding with blood trails, harvesting.
import * as THREE from 'three';
import { ANIMALS, ANIMAL_SPAWN, RABBIT_VARIANTS } from './data/world.js';
import { heightAt, regionAt } from './terrain.js';
import { waterLevelAt } from './physics.js';
import { rand, randi, clamp, wrapAngle } from './rng.js';
import { QuadRig } from './animalRig.js';


export class Animal {
  constructor(game, species, x, z, region) {
    this.game = game;
    this.species = species;
    this.def = ANIMALS[species];
    this.name = species === 'rabbit' ? (RABBIT_VARIANTS[region] || RABBIT_VARIANTS.hub).name : this.def.name;
    this.color = species === 'rabbit' ? (RABBIT_VARIANTS[region] || RABBIT_VARIANTS.hub).color : this.def.color;
    this.hp = this.def.hp;
    this.pos = new THREE.Vector3(x, heightAt(x, z), z);
    this.yaw = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.state = 'wander';
    this.t = rand(1, 4);
    this.bleed = 0;
    this.bloodT = 0;
    this.provoked = false;
    this.attackT = 0;
    this.dead = false;
    this.harvested = false;
    this.phase = 0;
    const s = this.def.size;
    this.half = { x: s * 0.22, y: s * 0.55, z: s * 0.5 };
    this.buildMesh();
  }

  buildMesh() {
    this.rig = new QuadRig(this.game.scene, this.species, this.def.size, this.color);
    Object.assign(this, this.rig.metrics);
    this.mesh = this.rig.root;
    this.vel = new THREE.Vector3();
  }

  rigState(dt) {
    const P = this.game.player;
    const alert = this.state === 'wander' && this.dist < 45 && P.alive;
    return { pos: this.pos, vel: this.vel, fwd: new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), state: this.state, look: alert || this.state === 'attack' ? P.pos.clone().setY(P.pos.y + 1.4) : null, dist: this.dist ?? 0 };
  }

  update(dt) {
    const game = this.game, P = game.player, def = this.def;
    if (this.dead) {
      this.dist = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
      this.rig.update(dt, { pos: this.pos, dist: this.dist });
      return;
    }
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    this.dist = dist;
    if (this.bleed > 0) {
      this.hp -= this.bleed * dt;
      this.bloodT -= dt;
      if (this.bloodT <= 0) { this.bloodT = 0.6; game.effects.blood(this.pos); }
      if (this.hp <= 0) return this.die();
    }
    this.t -= dt;
    let want = this.yaw, speed = 0;
    const scared = P.alive && (dist < (def.size < 0.7 ? 18 : 35) && (P.sprinting || !P.crouch) || (dist < 70 && game.time - P.lastShot < 1.5));
    const hostile = (def.behavior === 'hunt' && P.alive && dist < def.aggro && !game.inSafeZone(P.pos)) ||
                    (def.behavior === 'defend' && P.alive && (this.provoked || dist < def.aggro));
    if (hostile) {
      this.state = 'attack';
      want = Math.atan2(dx, dz);
      speed = dist > 1.8 ? def.speed * (this.bleed > 0 ? 0.75 : 1) : 0;
      this.attackT -= dt;
      if (dist < 2.2 + def.size * 0.4 && this.attackT <= 0) {
        this.attackT = 1.2;
        P.takeHit({ dmg: def.dmg, pen: 1, ammo: 'shell', zone: Math.random() < 0.6 ? 'leg' : 'arm' }, this.pos, `a ${def.name}`);
        game.audio.bite();
      }
    } else if (def.behavior !== 'hunt' && (scared || this.provoked)) {
      this.state = 'flee';
      want = Math.atan2(-dx, -dz) + Math.sin(game.time * 2 + this.pos.x) * 0.5;
      speed = def.speed * (this.bleed > 0 ? 0.7 : 1);
      if (dist > 160) this.provoked = false;
    } else {
      this.state = 'wander';
      if (this.t <= 0) { this.t = rand(2, 6); this.wanderYaw = this.yaw + rand(-1.5, 1.5); this.walking = Math.random() < 0.6; }
      want = this.wanderYaw ?? this.yaw;
      speed = this.walking ? def.speed * 0.18 : 0;
    }
    // turn (animals face the way they move; +Z forward here)
    this.yaw += clamp(wrapAngle(want - this.yaw), -4 * dt, 4 * dt);
    const vx = Math.sin(this.yaw) * speed, vz = Math.cos(this.yaw) * speed;
    const nx = this.pos.x + vx * dt, nz = this.pos.z + vz * dt;
    const nh = heightAt(nx, nz);
    if (waterLevelAt(nx, nz, nh) !== null || nh - this.pos.y > 1.2) { this.yaw += Math.PI * 0.6; this.wanderYaw = this.yaw; this.vel.set(0, 0, 0); }
    else { this.vel.set(vx, 0, vz); this.pos.x = nx; this.pos.z = nz; this.pos.y = nh; }
    this.mesh.visible = dist < 600;
    if (this.mesh.visible) this.rig.update(dt, this.rigState(dt));
  }

  // ray hit test (axis-aligned, rotation ignored: animals are small)
  hitBoxes() {
    const s = this.def.size, p = this.pos;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const hx = p.x + fx * this.headZ, hz = p.z + fz * this.headZ;
    const hs = Math.max(0.06, s * 0.13);
    // the body runs from the hips (at pos) forward to the withers
    const cx = p.x + fx * this.bodyOff, cz = p.z + fz * this.bodyOff;
    const r = Math.max(this.half.x, this.half.z * Math.abs(fx) + this.half.x * Math.abs(fz), this.half.z * Math.abs(fz) + this.half.x * Math.abs(fx));
    return [
      { zone: 'head', min: [hx - hs, p.y + this.headY - hs, hz - hs], max: [hx + hs, p.y + this.headY + hs, hz + hs] },
      { zone: 'body', min: [cx - r * 0.9, p.y + this.legH * 0.6, cz - r * 0.9], max: [cx + r * 0.9, p.y + this.legH + this.bodyH, cz + r * 0.9] },
    ];
  }

  // zone: head | vitals | body | leg
  takeDamage(dmg, zone, byPlayer = true) {
    if (this.dead) return { killed: false };
    this.lastHit = { dmg, zone };
    const mul = { head: 2.5, vitals: 1.8, body: 1, leg: 0.6 }[zone] || 1;
    this.hp -= dmg * mul;
    if (zone !== 'head') this.bleed += zone === 'vitals' ? 4 : zone === 'leg' ? 0.8 : 1.6;
    if (byPlayer) this.provoked = true;
    if (this.hp <= 0) { this.die(); return { killed: true }; }
    return { killed: false };
  }

  die() {
    this.dead = true;
    this.hp = 0;
    const P = this.game.player;
    const dir = new THREE.Vector3(this.pos.x - P.pos.x, 0, this.pos.z - P.pos.z).normalize();
    const k = Math.min(4, (this.lastHit ? this.lastHit.dmg : 30) / 25) / Math.max(0.5, this.def.size);
    this.rig.die(dir.multiplyScalar(k).add(this.vel.clone().multiplyScalar(0.6)).setY(0.5));
    this.game.onAnimalKilled(this);
  }

  harvest() {
    if (this.harvested) return [];
    this.harvested = true;
    const out = [];
    if (this.def.meat) out.push({ id: 'meat', count: this.def.meat });
    if (this.def.hide) out.push({ id: 'cloth', count: this.def.hide });
    return out;
  }

  dispose() { this.rig.dispose(); }
}

// Keeps a handful of animals around the player, rolled from the region's spawn table.
export class Wildlife {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.t = 1;
    this.max = 22;
  }

  update(dt) {
    const P = this.game.player;
    for (const a of this.list) a.update(dt);
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1.5;
    // despawn far animals (and old carcasses)
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      if (a.dist > 480 || (a.dead && a.harvested && a.dist > 60)) { a.dispose(); this.list.splice(i, 1); }
    }
    if (this.list.filter((a) => !a.dead).length >= this.max) return;
    const ang = Math.random() * Math.PI * 2, d = rand(110, 280);
    const x = P.pos.x + Math.cos(ang) * d, z = P.pos.z + Math.sin(ang) * d;
    const h = heightAt(x, z);
    if (waterLevelAt(x, z, h) !== null) return;
    if (this.game.inSafeZone({ x, z })) return;
    const region = regionAt(x, z, h);
    const table = ANIMAL_SPAWN[region];
    if (!table) return;
    let roll = Math.random() * 100;
    for (const [sp, pct] of Object.entries(table)) {
      if (roll < pct) { this.spawn(sp, x, z, region); return; }
      roll -= pct;
    }
  }

  spawn(species, x, z, region) {
    const def = ANIMALS[species];
    const n = def.pack ? randi(...def.pack) : 1;
    for (let i = 0; i < n; i++) this.list.push(new Animal(this.game, species, x + rand(-4, 4), z + rand(-4, 4), region));
  }

  clear() { for (const a of this.list) a.dispose(); this.list = []; }
}
