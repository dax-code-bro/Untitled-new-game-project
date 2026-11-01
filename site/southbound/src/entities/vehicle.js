// Procedural cars + arcade driving physics.
import * as THREE from 'three';
import { clamp, lerp } from '../util.js';

export const CAR_TYPES = {
  sedan: {
    name: 'Calvera Meridian', len: 4.6, width: 1.84, wheelR: 0.34, wf: 1.42, wr: -1.36,
    body: [[-2.3, 0.3], [2.25, 0.3], [2.32, 0.55], [2.25, 0.82], [1.0, 0.98], [-1.75, 1.02], [-2.3, 0.95]],
    cabin: [[1.02, 0.97], [0.35, 1.40], [-0.95, 1.43], [-1.78, 1.0]], roof: [-0.95, 0.35, 1.42],
    accel: 9, top: 52, grip: 7.5, mass: 1400,
  },
  sports: {
    name: 'Vantor GT', len: 4.45, width: 1.92, wheelR: 0.34, wf: 1.38, wr: -1.32,
    body: [[-2.2, 0.25], [2.25, 0.25], [2.32, 0.42], [2.2, 0.6], [0.75, 0.8], [-1.7, 0.86], [-2.22, 0.8]],
    cabin: [[0.8, 0.79], [0.05, 1.16], [-0.8, 1.18], [-1.6, 0.85]], roof: [-0.8, 0.05, 1.17],
    accel: 14, top: 78, grip: 9, mass: 1250,
  },
  suv: {
    name: 'Brazos Trailhand', len: 4.9, width: 1.98, wheelR: 0.42, wf: 1.5, wr: -1.5,
    body: [[-2.45, 0.45], [2.4, 0.45], [2.48, 0.75], [2.4, 1.05], [1.25, 1.15], [-2.45, 1.18]],
    cabin: [[1.22, 1.14], [0.55, 1.75], [-2.28, 1.78], [-2.42, 1.17]], roof: [-2.28, 0.55, 1.77],
    accel: 8, top: 46, grip: 6.5, mass: 2100,
  },
  pickup: {
    name: 'Ranchero 2500', len: 5.4, width: 2.0, wheelR: 0.42, wf: 1.75, wr: -1.75,
    body: [[-2.7, 0.45], [2.6, 0.45], [2.68, 0.75], [2.6, 1.05], [1.3, 1.12], [-2.7, 1.12]],
    cabin: [[1.27, 1.1], [0.75, 1.72], [-0.5, 1.74], [-0.65, 1.1]], roof: [-0.5, 0.75, 1.73],
    accel: 8.5, top: 47, grip: 6.2, mass: 2300,
  },
  van: {
    name: 'Coastline Hauler', len: 5.0, width: 2.0, wheelR: 0.36, wf: 1.75, wr: -1.6,
    body: [[-2.5, 0.4], [2.45, 0.4], [2.5, 0.7], [2.4, 1.0], [1.9, 1.1], [-2.5, 1.1]],
    cabin: [[1.9, 1.08], [1.35, 1.95], [-2.45, 2.0], [-2.5, 1.09]], roof: [-2.45, 1.35, 1.99],
    accel: 7, top: 40, grip: 6, mass: 2400,
  },
};
const TYPE_WEIGHTS = [['sedan', 5], ['suv', 3], ['pickup', 3], ['sports', 1], ['van', 1.5]];
export function randomCarType(rnd) {
  let t = rnd() * TYPE_WEIGHTS.reduce((a, b) => a + b[1], 0);
  for (const [k, w] of TYPE_WEIGHTS) { if ((t -= w) <= 0) return k; }
  return 'sedan';
}
export const PAINTS = [0xe8e8e8, 0x111214, 0x9a9da2, 0x5b5f66, 0x1d2e52, 0x7a1414, 0xb9ad94, 0x22402f, 0x2f6fb0, 0xc2410f, 0xd8b21a];

const geoCache = new Map();
function extrude(pts, depth, bevel) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}
function typeGeometry(type) {
  if (geoCache.has(type)) return geoCache.get(type);
  const t = CAR_TYPES[type];
  const g = {
    body: extrude(t.body, t.width - 0.12, 0.06),
    cabin: extrude(t.cabin, t.width - 0.22, 0.03),
    roof: new THREE.BoxGeometry(t.width - 0.2, 0.06, t.roof[1] - t.roof[0]).translate(0, t.roof[2], (t.roof[0] + t.roof[1]) / 2),
    tire: new THREE.CylinderGeometry(t.wheelR, t.wheelR, 0.26, 18).rotateZ(Math.PI / 2),
    rim: new THREE.CylinderGeometry(t.wheelR * 0.62, t.wheelR * 0.62, 0.27, 10).rotateZ(Math.PI / 2),
    light: new THREE.BoxGeometry(0.34, 0.12, 0.06),
  };
  geoCache.set(type, g);
  return g;
}

const shared = {};
function sharedMats() {
  if (shared.glass) return shared;
  shared.glass = new THREE.MeshStandardMaterial({ color: 0x0b1016, roughness: 0.05, metalness: 0.9 });
  shared.tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  shared.rim = new THREE.MeshStandardMaterial({ color: 0xb0b4b8, roughness: 0.3, metalness: 0.9 });
  shared.head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 0.4 });
  shared.tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a0a, emissiveIntensity: 0.4 });
  return shared;
}

export class Vehicle {
  constructor(type, color, quality) {
    this.type = type;
    this.spec = CAR_TYPES[type];
    const g = typeGeometry(type), m = sharedMats();
    const paint = quality.physicalPaint
      ? new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 })
      : new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.35 });
    this.paint = paint;
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    const add = (geo, mat, parent = this.body) => { const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };
    add(g.body, paint); add(g.cabin, m.glass); add(g.roof, paint);
    const t = this.spec;
    this.tail = m.tail.clone();
    for (const side of [-1, 1]) {
      const h = add(g.light, m.head); h.position.set(side * (t.width / 2 - 0.32), t.body[3][1] - 0.08, t.len / 2 + 0.02);
      const tl = add(g.light, this.tail); tl.position.set(side * (t.width / 2 - 0.3), t.body[t.body.length - 1][1] - 0.12, -t.len / 2 - 0.02);
    }
    this.wheels = [];
    for (const [z, front] of [[t.wf, true], [t.wr, false]]) for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (t.width / 2 - 0.12), t.wheelR, z);
      const spin = new THREE.Group();
      pivot.add(spin);
      add(g.tire, m.tire, spin); add(g.rim, m.rim, spin);
      this.group.add(pivot);
      this.wheels.push({ pivot, spin, front });
    }
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();
    this.heading = 0; this.pitch = 0; this.roll = 0;
    this.vy = 0; this.speed = 0; this.steer = 0; this.braking = false;
    this.airborne = false; this.drowned = false; this.wheelSpin = 0;
    this.lean = 0; this.impact = 0;
    this.radius = t.width / 2 + 0.1;
  }

  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  // Player driving
  physics(dt, input, hm, collision) {
    const t = this.spec;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const sx = Math.cos(this.heading), sz = -Math.sin(this.heading);
    let vF = this.vel.x * fx + this.vel.y * fz;
    let vR = this.vel.x * sx + this.vel.y * sz;
    const grounded = !this.airborne;
    const thr = input.throttle, brk = input.brake;
    this.braking = false;
    if (grounded && !this.drowned) {
      if (thr > 0) {
        if (vF < -0.5) { vF += 18 * thr * dt; this.braking = true; }
        else vF += t.accel * thr * Math.max(0, 1 - vF / t.top) * dt * (vF < 8 ? 1.25 : 1);
      }
      if (brk > 0) {
        if (vF > 0.5) { vF -= 22 * brk * dt; this.braking = true; }
        else vF = Math.max(vF - 6 * brk * dt, -9);
      }
      if (input.handbrake) { vF -= Math.sign(vF) * 6 * dt; this.braking = true; }
      // rolling resistance + aero drag
      vF -= Math.sign(vF) * Math.min(Math.abs(vF), (0.9 + Math.abs(vF) * Math.abs(vF) * 0.0012) * dt * (thr > 0 ? 0.3 : 1));
      // steering
      const maxSteer = 0.62 / (1 + Math.abs(vF) * 0.055);
      this.steer = lerp(this.steer, input.steer * maxSteer, Math.min(1, dt * 7));
      const wheelbase = t.wf - t.wr;
      const yaw = (vF / wheelbase) * Math.tan(this.steer);
      this.heading += yaw * dt * (input.handbrake ? 1.35 : 1);
      // lateral grip (low grip = drift)
      const grip = input.handbrake ? 1.4 : t.grip;
      vR *= Math.exp(-grip * dt);
      this.lean = lerp(this.lean, clamp(-yaw * vF * 0.004, -0.06, 0.06), Math.min(1, dt * 5));
    }
    if (this.drowned) { vF *= Math.exp(-2 * dt); vR *= Math.exp(-2 * dt); }
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    const nsx = Math.cos(this.heading), nsz = -Math.sin(this.heading);
    this.vel.set(nfx * vF + nsx * vR, nfz * vF + nsz * vR);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;

    // collisions with buildings, trees, poles (front + rear circles)
    this.impact = 0;
    const r = this.radius;
    let cx = 0, cz = 0, hits = 0, nx = 0, nz = 0;
    for (const off of [t.len / 2 - r, -(t.len / 2 - r)]) {
      const px = this.pos.x + nfx * off, pz = this.pos.z + nfz * off;
      const res = collision.resolve(px, pz, r, this.pos.y, 1.6);
      if (res.hit) { cx += res.x - px; cz += res.z - pz; nx += res.nx; nz += res.nz; hits++; }
    }
    if (hits) {
      this.pos.x += cx; this.pos.z += cz;
      const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      const vn = this.vel.x * nx + this.vel.y * nz;
      if (vn < 0) {
        this.vel.x -= nx * vn * 1.25; this.vel.y -= nz * vn * 1.25;
        this.vel.multiplyScalar(0.75);
        this.impact = -vn;
      }
    }

    // ground: sample under the four wheels
    const hw = t.width / 2 - 0.15;
    const sample = (lz, lx) => collision.surface(this.pos.x + nfx * lz + nsx * lx, this.pos.z + nfz * lz + nsz * lx, this.pos.y + 0.5);
    const fl = sample(t.wf, -hw), fr = sample(t.wf, hw), rl = sample(t.wr, -hw), rr = sample(t.wr, hw);
    const ground = (fl + fr + rl + rr) / 4;
    const targetPitch = Math.atan2(((fl + fr) - (rl + rr)) / 2, t.wf - t.wr);
    const targetRoll = Math.atan2(((fr + rr) - (fl + rl)) / 2, hw * 2);
    if (!this.airborne) {
      const predicted = this.pos.y + this.vy * dt;
      if (predicted > ground + 0.25 && this.vy > 3) { this.airborne = true; this.pos.y = predicted; }
      else {
        this.vy = clamp((ground - this.pos.y) / Math.max(dt, 1e-3), -20, 20);
        this.pos.y = ground;
        this.pitch = lerp(this.pitch, targetPitch, Math.min(1, dt * 12));
        this.roll = lerp(this.roll, targetRoll, Math.min(1, dt * 12));
      }
    } else {
      this.vy -= 22 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) { this.pos.y = ground; this.airborne = false; this.impact = Math.max(this.impact, -this.vy * 0.5); this.vy = 0; }
    }
    // water
    const wl = hm.waterLevel(this.pos.x, this.pos.z);
    if (wl - ground > 1.1 && this.pos.y < wl - 0.3) {
      this.drowned = true;
      this.pos.y = Math.max(this.pos.y, wl - 1.1);
    } else if (wl - ground < 0.5) this.drowned = false;

    this.speed = vF;
    this.wheelSpin += (vF / t.wheelR) * dt;
  }

  sync(dt) {
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, 0, 0);
    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = this.heading;
    this.group.rotation.x = -this.pitch;
    this.group.rotation.z = this.roll;
    this.body.rotation.z = this.lean;
    for (const w of this.wheels) {
      w.spin.rotation.x = this.wheelSpin;
      if (w.front) w.pivot.rotation.y = this.steer;
    }
    this.tail.emissiveIntensity = this.braking ? 3.5 : 0.6 + (this.night || 0) * 1.4;
  }
}
