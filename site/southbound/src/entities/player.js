// On-foot player controller (animated Quaternius character).
import * as THREE from 'three';
import { Human, locomotion } from './human.js';
import { clamp, wrapAngle } from '../util.js';

export class Player {
  constructor(scene, lib, modelId = 'm_casual') {
    this.h = new Human(lib, modelId, { alwaysVisible: true });
    this.char = { root: this.h.root };
    scene.add(this.h.root);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.grounded = true;
    this.swimming = false;
    this.speed = 0;
    this.health = 100;
    this.armor = 50;
    this.aiming = false;
  }

  damage(amount) {
    const toArmor = Math.min(this.armor, amount * 0.7);
    this.armor -= toArmor;
    this.health = Math.max(0, this.health - (amount - toArmor));
  }

  update(dt, a, camYaw, hm, collision, armed) {
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const mx = a.moveX, my = a.moveY;
    const mag = Math.min(1, Math.hypot(mx, my));
    // camera forward = (fx, fz); camera right = (-fz, fx)
    let dx = fx * my - fz * mx, dz = fz * my + fx * mx;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-3) { dx /= dl; dz /= dl; }
    this.aiming = !!a.aim && !this.swimming;
    const top = this.swimming ? 2.2 : this.aiming ? 2.4 : a.walk ? 1.7 : a.sprint ? 7.2 : 4.4;
    const want = mag * top;
    const accel = this.grounded || this.swimming ? 14 : 3;
    this.vel.x += clamp(dx * want - this.vel.x, -accel * dt, accel * dt);
    this.vel.z += clamp(dz * want - this.vel.z, -accel * dt, accel * dt);
    if (this.aiming) this.heading += wrapAngle(camYaw - this.heading) * Math.min(1, dt * 18);
    else if (mag > 0.05) this.heading += wrapAngle(Math.atan2(dx, dz) - this.heading) * Math.min(1, dt * 10);

    if (a.jump && this.grounded && !this.swimming && !this.aiming) { this.vel.y = 5.2; this.grounded = false; this.h.play('Jump_Start', 0.08, 1.3, true); }
    this.vel.y -= 18 * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    const r = collision.resolve(this.pos.x, this.pos.z, 0.35, this.pos.y, 1.8);
    this.pos.x = r.x; this.pos.z = r.z;
    const ground = collision.surface(this.pos.x, this.pos.z, this.pos.y);
    const wl = hm.waterLevel(this.pos.x, this.pos.z);
    const wasAir = !this.grounded;
    this.swimming = wl - ground > 1.35 && this.pos.y < wl - 1.0;
    if (this.swimming) {
      this.pos.y = Math.max(this.pos.y, wl - 1.25);
      this.pos.y += (wl - 1.25 - this.pos.y) * Math.min(1, dt * 6);
      this.vel.y = Math.max(this.vel.y, 0);
      this.grounded = false;
    } else if (this.pos.y <= ground + 0.05) {
      this.pos.y = ground; this.vel.y = 0; this.grounded = true;
      if (wasAir) this.h.play('Jump_Land', 0.05, 1.6, true);
    } else if (this.grounded && this.pos.y - ground < 0.45 && this.vel.y <= 0) {
      this.pos.y = ground; this.vel.y = 0;
    } else this.grounded = false;

    const lim = 2000;
    this.pos.x = clamp(this.pos.x, -lim, lim);
    this.pos.z = clamp(this.pos.z, -lim, lim);
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // animation
    const h = this.h;
    if (this.swimming) h.play(this.speed > 0.4 ? 'Swim_Fwd_Loop' : 'Swim_Idle_Loop', 0.3);
    else if (!this.grounded) { if (h.locked <= 0) h.play('Jump_Loop', 0.2); }
    else if (this.aiming && armed) { if (h.locked <= 0) h.play('Pistol_Aim_Neutral', 0.12); }
    else if (h.locked <= 0) {
      const [clip, sp] = locomotion(this.speed);
      h.play(armed && clip === 'Idle_Loop' ? 'Pistol_Idle_Loop' : clip, 0.22, sp);
    }
    h.update(dt);
    h.root.position.copy(this.pos);
    if (this.swimming) h.root.position.y -= 0.35;
    h.root.rotation.y = this.heading;
  }
}
