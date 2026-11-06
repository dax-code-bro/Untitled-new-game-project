// On-foot player controller (animated Quaternius character).
import * as THREE from 'three';
import { Human, locomotion } from './human.js';
import { clamp, wrapAngle } from '../util.js';

export class Player {
  constructor(scene, lib, modelId = 'hero') {
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
    this.stepOff = 0; // visual smoothing when stepping up/down curbs and stairs
    this.mantle = null; // active vault/mantle/climb
    this.pushT = 0;
    this._res = {};
  }

  // Can we get on top of the obstacle we just walked into? Needs a ledge to
  // grab (a box top no higher than 2.5 m: 6'3" plus two-foot arms) and clear
  // space above it for the whole body.
  tryMantle(r, collision) {
    const b = r.box, top = b.y1, rise = top - this.pos.y;
    if (rise <= 0.4 || rise > 2.5) return false;
    const tx = this.pos.x - r.nx * 0.6, tz = this.pos.z - r.nz * 0.6;
    if (tx < b.minX + 0.15 || tx > b.maxX - 0.15 || tz < b.minZ + 0.15 || tz > b.maxZ - 0.15) return false; // too thin to stand on
    let blocked = false;
    collision.query(tx, tz, 0.5, (it) => {
      if (it === b || blocked) return;
      if (it.t === 0) {
        const over = tx > it.minX - 0.3 && tx < it.maxX + 0.3 && tz > it.minZ - 0.3 && tz < it.maxZ + 0.3;
        if (over && it.y0 < top + 1.85 && it.y1 > top + 0.05) blocked = true;
      } else if (it.t === 1 && Math.hypot(tx - it.x, tz - it.z) < it.r + 0.3) blocked = true;
    });
    // nothing overhead on the way up either
    collision.query(this.pos.x, this.pos.z, 0.4, (it) => {
      if (it !== b && it.t === 0 && this.pos.x > it.minX && this.pos.x < it.maxX && this.pos.z > it.minZ && this.pos.z < it.maxZ && it.y0 > this.pos.y + 1.7 && it.y0 < top + 1.85) blocked = true;
    });
    if (blocked) return false;
    const kind = rise <= 1.0 ? 'vault' : rise <= 1.6 ? 'mantle' : 'climb';
    const dur = { vault: 0.42, mantle: 0.72, climb: 1.15 }[kind];
    this.mantle = { t: 0, dur, kind, rise, fx: this.pos.x, fy: this.pos.y, fz: this.pos.z, tx, ty: top, tz, face: Math.atan2(-r.nx, -r.nz) };
    this.vel.set(0, 0, 0);
    this.h.play(kind === 'vault' ? 'Jump_Start' : 'Jump_Loop', 0.08, kind === 'vault' ? 1.5 : 1.0, true);
    if (this.h.locked !== undefined) this.h.locked = dur;
    return true;
  }

  updateMantle(dt) {
    const m = this.mantle;
    m.t += dt;
    const k = Math.min(1, m.t / m.dur);
    // rise first (pulling up against the ledge), then roll forward onto the top
    const up = m.kind === 'vault' ? 0.55 : m.kind === 'mantle' ? 0.62 : 0.7;
    const ky = Math.min(1, k / up), kf = Math.max(0, (k - up * 0.6) / (1 - up * 0.6));
    const ease = (t) => t * t * (3 - 2 * t);
    this.pos.y = m.fy + (m.ty + 0.06 - m.fy) * (1 - Math.pow(1 - ky, 2.2));
    this.pos.x = m.fx + (m.tx - m.fx) * ease(kf);
    this.pos.z = m.fz + (m.tz - m.fz) * ease(kf);
    this.heading += wrapAngle(m.face - this.heading) * Math.min(1, dt * 20);
    if (m.kind !== 'vault' && k > up && !m.crouched) { m.crouched = true; this.h.play('Crouch_Idle_Loop', 0.15, 1, true); }
    if (k >= 1) {
      this.pos.y = m.ty; this.vel.set(0, 0, 0); this.grounded = true; this.mantle = null;
      this.h.play('Jump_Land', 0.1, 1.6, true);
    }
  }

  damage(amount) {
    if (this.gearArmor) { this.health = Math.max(0, this.health - amount); return; } // the armory system handles plates
    const toArmor = Math.min(this.armor, amount * 0.7);
    this.armor -= toArmor;
    this.health = Math.max(0, this.health - (amount - toArmor));
  }

  update(dt, a, camYaw, hm, collision, armed) {
    if (this.h.ragdoll) { this.h.update(dt); this.pos.copy(this.h.root.position); this.vel.set(0, 0, 0); this.speed = 0; return; } // dead: the body is physics
    if (this.mantle) {
      this.updateMantle(dt);
      this.h.update(dt);
      this.h.root.position.copy(this.pos);
      this.h.root.rotation.y = this.heading;
      this.speed = 0;
      return;
    }
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const mx = a.moveX, my = a.moveY;
    const mag = Math.min(1, Math.hypot(mx, my));
    // camera forward = (fx, fz); camera right = (-fz, fx)
    let dx = fx * my - fz * mx, dz = fz * my + fx * mx;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-3) { dx /= dl; dz /= dl; }
    this.aiming = !!a.aim && !this.swimming;
    // the ground decides too (systems/footing.js): steep, slick, deep or narrow footing slows you
    const F = this.footing && !this.swimming && dt > 0 ? this.footing.before(this, dx, dz, mag, a, dt) : null;
    let top = this.swimming ? 2.2 : this.aiming ? 2.4 : a.walk ? 1.7 : a.sprint ? 7.2 : 4.4;
    if (F) top = Math.min(top, Math.max(1.7, 7.2 * F.sprintCap)) * F.speed;
    const want = mag * top;
    const accel = (this.grounded || this.swimming ? 14 : 3) * (F ? F.accel : 1);
    this.vel.x += clamp(dx * want - this.vel.x, -accel * dt, accel * dt);
    this.vel.z += clamp(dz * want - this.vel.z, -accel * dt, accel * dt);
    if (this.aiming) this.heading += wrapAngle(camYaw - this.heading) * Math.min(1, dt * 18);
    else if (mag > 0.05) this.heading += wrapAngle(Math.atan2(dx, dz) - this.heading) * Math.min(1, dt * 10);

    if (a.jump && this.grounded && !this.swimming && !this.aiming) {
      // a real hop: about half a metre, not a cartoon leap
      this.vel.y = 4.3; this.grounded = false; this.airT = 0;
      this.runJump = this.speed > 1.2;
      if (!this.runJump) this.h.play('Jump_Start', 0.1, 1.5, true);
    }
    this.vel.y -= 18 * dt;
    const px = this.pos.x, pz = this.pos.z, py = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    const r = collision.resolve(this.pos.x, this.pos.z, 0.35, this.pos.y, 1.8, this._res);
    this.pos.x = r.x; this.pos.z = r.z;
    // walking into a ledge: vault / mantle / climb onto it automatically
    if (r.hit && r.box && this.grounded && !this.swimming && !this.aiming && mag > 0.3 && -(dx * r.nx + dz * r.nz) > 0.55) {
      const rise = r.box.y1 - this.pos.y;
      this.pushT += dt;
      if (rise > 0.4 && rise <= 2.5 && (a.jump || this.pushT > (rise > 1.3 ? 0.3 : 0.1)) && this.tryMantle(r, collision)) return this.update(0, a, camYaw, hm, collision, armed);
    } else this.pushT = 0;
    if (F) this.footing.after(this, px, pz, py, a, dt); // stop at ledges, slip back off what's too steep
    const prevY = this.pos.y;
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
      if (!wasAir && ground - prevY < 0.5) this.stepOff += prevY - ground; // curb/stair step: ease the body up
      this.pos.y = ground; this.vel.y = 0; this.grounded = true;
      if (wasAir) { this.h.layer('Jump_Loop', 0); if (this.fallV < -7.5) this.h.play('Jump_Land', 0.05, 1.5, true); } // only a real drop gets a heavy landing
    } else if (this.grounded && this.pos.y - ground < 0.45 && this.vel.y <= 0) {
      this.stepOff += this.pos.y - ground;
      this.pos.y = ground; this.vel.y = 0;
    } else this.grounded = false;
    this.stepOff = Math.max(-0.5, Math.min(0.5, this.stepOff)) * Math.exp(-dt * 16);

    const lim = 2000;
    this.pos.x = clamp(this.pos.x, -lim, lim);
    this.pos.z = clamp(this.pos.z, -lim, lim);
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // animation
    const h = this.h;
    if (this.swimming) h.play(this.speed > 0.4 ? 'Swim_Fwd_Loop' : 'Swim_Idle_Loop', 0.3);
    else if (!this.grounded) {
      // in the air: keep the stride (running jump) and tuck the legs a little
      this.airT = (this.airT || 0) + dt; this.fallV = this.vel.y;
      if (this.runJump) { if (h.current) h.current.timeScale = 0.35; h.layer('Jump_Loop', Math.min(0.4, this.airT * 2)); }
      else if (h.locked <= 0) { h.play('Idle_Loop', 0.25); h.layer('Jump_Loop', 0.45); }
    }
    else if (this.aiming && this.speed > 0.3) {
      // walking with the gun up: the legs walk (backwards when you back up), the arms stay on the gun
      const fwd = (this.vel.x * Math.sin(this.heading) + this.vel.z * Math.cos(this.heading)) / Math.max(0.01, this.speed);
      if (h.locked <= 0) h.play('Walk_Loop', 0.15, (fwd >= -0.25 ? 1 : -1) * Math.max(0.6, this.speed / 1.5) * (Math.abs(fwd) < 0.4 ? 0.8 : 1));
    }
    else if (this.aiming && armed) { if (h.locked <= 0) h.play('Pistol_Aim_Neutral', 0.12); }
    else if (h.locked <= 0) {
      const [clip, sp] = locomotion(this.speed);
      h.play(armed && clip === 'Idle_Loop' ? 'Pistol_Idle_Loop' : clip, 0.22, sp);
    }
    h.update(dt);
    h.root.position.copy(this.pos);
    h.root.position.y += this.stepOff;
    if (this.swimming) h.root.position.y -= 0.35;
    h.root.rotation.y = this.heading;
  }
}
