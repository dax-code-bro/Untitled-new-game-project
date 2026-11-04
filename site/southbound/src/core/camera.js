// Third-person camera for on foot and in vehicles, with collision.
import * as THREE from 'three';
import { clamp, lerp, wrapAngle } from '../util.js';

export class CameraRig {
  constructor(camera, settings) {
    this.camera = camera;
    this.settings = settings;
    this.yaw = 0;
    this.pitch = 0.18;
    this.dist = 4.6;
    this.zoom = 1;
    this.target = new THREE.Vector3();
    this.shake = 0;
    this.mode = 0; // 0 normal, 1 far, 2 close, 3 first person (on foot)
    this._dir = new THREE.Vector3();
  }

  update(dt, a, focus, opts, collision) {
    // opts: {vehicle, heading, speed, lastLook}
    const s = this.settings.sensitivity * 0.0026;
    this.yaw -= a.lookX * s;
    this.pitch += a.lookY * s * (this.settings.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -0.6, 1.25);
    this.zoom = clamp(this.zoom + a.zoom * 0.1, 0.6, 2.2);
    if (a.camera) this.mode = (this.mode + 1) % 4;
    this.fp = (this.mode === 3 || opts.scope > 0) && !opts.vehicle && !!opts.eye;
    const modeK = [1, 1.6, 0.7, 1][this.mode];
    // in the car, the fourth view is from the driver's seat: dash, wheel and mirrors
    this.cab = this.mode === 3 && !!opts.vehicle && !!opts.cabEye;
    if (this.cab) {
      const cam = this.camera;
      if (!this.free && performance.now() - opts.lastLook > 1400) { this.yaw += wrapAngle(opts.heading - this.yaw) * Math.min(1, dt * 3); this.pitch += (0.12 - this.pitch) * Math.min(1, dt * 2); }
      const rel = clamp(wrapAngle(this.yaw - opts.heading), -2.3, 2.3), pt = clamp(this.pitch - 0.12, -0.55, 0.6);
      const q = opts.cabQ;
      const d = this._dir.set(Math.sin(rel) * Math.cos(pt), -Math.sin(pt), Math.cos(rel) * Math.cos(pt)).applyQuaternion(q);
      cam.up.set(0, 1, 0).applyQuaternion(q);
      cam.position.copy(opts.cabEye);
      cam.lookAt(cam.position.x + d.x, cam.position.y + d.y, cam.position.z + d.z);
      cam.up.set(0, 1, 0);
      if (cam.near !== 0.12) { cam.near = 0.12; cam.updateProjectionMatrix(); } // your own collar and hair stay out of the shot
      const fov = this.settings.fov + 4 + Math.min(Math.abs(opts.speed) * 0.12, 6);
      if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = lerp(cam.fov, fov, Math.min(1, dt * 4)); cam.updateProjectionMatrix(); }
      this.dist = 0.1;
      return;
    }
    if (this.fp) {
      // first person: from the eyes, a touch in front so the head never shows
      const cam = this.camera;
      // through a scope: breathing sway (hold your breath to steady it)
      this.swayT = (this.swayT || 0) + dt;
      const sw = opts.scope > 0 ? 0.0035 * (1 - (opts.steady || 0) * 0.85) * (1 + opts.scope * 0.08) : 0;
      const yaw = this.yaw + Math.sin(this.swayT * 1.1) * sw + Math.sin(this.swayT * 2.7) * sw * 0.3;
      const pitch = this.pitch + Math.sin(this.swayT * 0.8 + 1.3) * sw * 0.7;
      const fx = Math.sin(yaw), fz = Math.cos(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const d = this._dir.set(fx * cp, -sp, fz * cp);
      cam.position.copy(opts.eye).addScaledVector(d, 0.1);
      cam.position.x += fx * 0.04; cam.position.z += fz * 0.04;
      cam.lookAt(cam.position.x + d.x, cam.position.y + d.y, cam.position.z + d.z);
      const fov = opts.scope > 0 ? Math.max(3, 58 / opts.scope) : this.settings.fov + 6 - (opts.aiming ? 22 : 0);
      if (cam.near !== 0.04) { cam.near = 0.04; cam.updateProjectionMatrix(); }
      if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = lerp(cam.fov, fov, Math.min(1, dt * 12)); cam.updateProjectionMatrix(); }
      this.dist = 0.1;
      return;
    }
    if (this.camera.near !== 0.3) { this.camera.near = 0.3; this.camera.updateProjectionMatrix(); }

    let height = 1.55, dist = 4.6 * this.zoom * modeK, side = 0.45;
    if (opts.aiming) { dist = 2.2; side = 0.75; height = 1.6; }
    if (opts.vehicle) {
      height = 1.5 + opts.vehicle.spec.width * 0.2;
      dist = (6.8 + opts.vehicle.spec.len * 0.35 + Math.min(Math.abs(opts.speed) * 0.05, 2.2)) * this.zoom * modeK;
      side = 0;
      // swing back behind the car when the player is not looking around
      if (!this.free && performance.now() - opts.lastLook > 1400 && Math.abs(opts.speed) > 2) {
        const behind = opts.speed < -2 ? opts.heading + Math.PI : opts.heading;
        this.yaw += wrapAngle(behind - this.yaw) * Math.min(1, dt * 2.2);
        this.pitch += (0.16 - this.pitch) * Math.min(1, dt * 1.5);
      }
    }
    this.dist = lerp(this.dist, dist, Math.min(1, dt * (opts.aiming ? 12 : 4)));
    this.side = lerp(this.side ?? side, side, Math.min(1, dt * 10)); side = this.side;
    const tgt = this.target.set(focus.x, focus.y + height, focus.z);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    let cx = tgt.x - fx * cp * this.dist - fz * side, cy = tgt.y + sp * this.dist, cz = tgt.z - fz * cp * this.dist + fx * side;
    // don't clip through buildings
    const t = collision.raycast(tgt.x, tgt.y, tgt.z, cx, cy, cz);
    if (t < 1) { const k = Math.max(0.1, t - 0.08); cx = tgt.x + (cx - tgt.x) * k; cy = tgt.y + (cy - tgt.y) * k; cz = tgt.z + (cz - tgt.z) * k; }
    const g = collision.hm.height(cx, cz) + 0.4;
    if (cy < g) cy = g;
    const cam = this.camera;
    cam.position.set(cx, cy, cz);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.3;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.3;
    }
    cam.lookAt(tgt.x - fz * side * 0.4, tgt.y, tgt.z + fx * side * 0.4);
    const fov = this.settings.fov + (opts.vehicle ? Math.min(Math.abs(opts.speed) * 0.25, 12) : 0) - (opts.aiming ? 14 : 0);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = lerp(cam.fov, fov, Math.min(1, dt * (opts.aiming ? 10 : 3))); cam.updateProjectionMatrix(); }
  }
}
