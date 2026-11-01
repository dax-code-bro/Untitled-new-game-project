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
    this.mode = 0; // 0 normal, 1 far, 2 close
  }

  update(dt, a, focus, opts, collision) {
    // opts: {vehicle, heading, speed, lastLook}
    const s = this.settings.sensitivity * 0.0026;
    this.yaw -= a.lookX * s;
    this.pitch += a.lookY * s * (this.settings.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -0.6, 1.25);
    this.zoom = clamp(this.zoom + a.zoom * 0.1, 0.6, 2.2);
    if (a.camera) this.mode = (this.mode + 1) % 3;
    const modeK = [1, 1.6, 0.7][this.mode];

    let height = 1.55, dist = 4.6 * this.zoom * modeK, side = 0.45;
    if (opts.vehicle) {
      height = 1.5 + opts.vehicle.spec.width * 0.2;
      dist = (6.8 + opts.vehicle.spec.len * 0.35 + Math.min(Math.abs(opts.speed) * 0.05, 2.2)) * this.zoom * modeK;
      side = 0;
      // swing back behind the car when the player is not looking around
      if (performance.now() - opts.lastLook > 1400 && Math.abs(opts.speed) > 2) {
        const behind = opts.speed < -2 ? opts.heading + Math.PI : opts.heading;
        this.yaw += wrapAngle(behind - this.yaw) * Math.min(1, dt * 2.2);
        this.pitch += (0.16 - this.pitch) * Math.min(1, dt * 1.5);
      }
    }
    this.dist = lerp(this.dist, dist, Math.min(1, dt * 4));
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
    const fov = this.settings.fov + (opts.vehicle ? Math.min(Math.abs(opts.speed) * 0.25, 12) : 0);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = lerp(cam.fov, fov, Math.min(1, dt * 3)); cam.updateProjectionMatrix(); }
  }
}
