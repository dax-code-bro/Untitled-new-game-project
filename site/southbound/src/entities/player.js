// On-foot player controller.
import * as THREE from 'three';
import { createCharacter } from './character.js';
import { clamp, wrapAngle } from '../util.js';

export class Player {
  constructor(scene) {
    this.char = createCharacter({ shirt: 0x6b3a2a, pants: 0x2c3442 });
    scene.add(this.char.root);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.grounded = true;
    this.swimming = false;
    this.speed = 0;
  }

  update(dt, a, camYaw, hm, collision) {
    // camera-relative movement
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    let mx = a.moveX, my = a.moveY;
    const mag = Math.min(1, Math.hypot(mx, my));
    // camera forward = (fx, fz); camera right = (-fz, fx)
    let dx = fx * my - fz * mx, dz = fz * my + fx * mx;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-3) { dx /= dl; dz /= dl; }
    const top = this.swimming ? 2.2 : a.walk ? 1.7 : a.sprint ? 7.2 : 4.4;
    const want = mag * top;
    const accel = this.grounded || this.swimming ? 14 : 3;
    const tvx = dx * want, tvz = dz * want;
    this.vel.x += clamp(tvx - this.vel.x, -accel * dt, accel * dt);
    this.vel.z += clamp(tvz - this.vel.z, -accel * dt, accel * dt);
    if (mag > 0.05) this.heading += wrapAngle(Math.atan2(dx, dz) - this.heading) * Math.min(1, dt * 10);

    if (a.jump && this.grounded && !this.swimming) { this.vel.y = 5.2; this.grounded = false; }
    this.vel.y -= 18 * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    const r = collision.resolve(this.pos.x, this.pos.z, 0.35, this.pos.y, 1.8);
    this.pos.x = r.x; this.pos.z = r.z;

    const ground = collision.surface(this.pos.x, this.pos.z, this.pos.y);
    const wl = hm.waterLevel(this.pos.x, this.pos.z);
    this.swimming = wl - ground > 1.35 && this.pos.y < wl - 1.0;
    if (this.swimming) {
      this.pos.y = Math.max(this.pos.y, wl - 1.25);
      if (this.pos.y > wl - 1.25) this.pos.y += (wl - 1.25 - this.pos.y) * Math.min(1, dt * 6);
      this.vel.y = Math.max(this.vel.y, 0);
      this.grounded = false;
    } else if (this.pos.y <= ground + 0.05) {
      // step up small ledges, slide on steep slopes
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    } else if (this.grounded && this.pos.y - ground < 0.45 && this.vel.y <= 0) {
      this.pos.y = ground; this.vel.y = 0; // stick to the ground going downhill
    } else this.grounded = false;

    // keep inside the playable map
    const lim = 2000;
    this.pos.x = clamp(this.pos.x, -lim, lim);
    this.pos.z = clamp(this.pos.z, -lim, lim);

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.y = this.heading;
    this.char.animate(dt, this.speed, this.swimming ? 'swim' : this.grounded ? 'ground' : 'air');
  }
}
