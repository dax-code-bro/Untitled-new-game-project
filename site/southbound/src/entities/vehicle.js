// Vehicles: Kenney Car Kit models (CC0) + arcade driving physics.
import * as THREE from 'three';
import { clamp, lerp } from '../util.js';
import { VEHICLES } from '../assets/library.js';

export function randomCarType(rnd) {
  const list = Object.entries(VEHICLES).filter(([, v]) => v.weight > 0);
  let t = rnd() * list.reduce((a, [, v]) => a + v.weight, 0);
  for (const [k, v] of list) { if ((t -= v.weight) <= 0) return k; }
  return 'sedan';
}

const lightMats = {};
function mats() {
  if (lightMats.head) return lightMats;
  lightMats.head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 0.3 });
  lightMats.red = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1010, emissiveIntensity: 0 });
  lightMats.blue = new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x1040ff, emissiveIntensity: 0 });
  return lightMats;
}
const _box = new THREE.Box3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _qs = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);

export class Vehicle {
  constructor(lib, type) {
    this.type = type;
    const v = VEHICLES[type] || VEHICLES.sedan;
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    const model = lib.cars[type].clone(true);
    // scale the toy-sized Kenney model to real-world length
    _box.setFromObject(model);
    const size = _box.getSize(new THREE.Vector3());
    const k = v.len / size.z;
    model.scale.setScalar(k);
    model.position.y = -_box.min.y * k;
    this.body.add(model);
    this.wheels = [];
    let wf = 0, wr = 0, wheelR = 0.35;
    model.traverse((o) => {
      const m = /^wheel-(front|back)-(left|right)$/.exec(o.name);
      if (!m) return;
      _box.setFromObject(o);
      wheelR = (_box.max.y - _box.min.y) / 2 * k;
      // which way does this wheel's local X point? (mirrored wheels spin the other way)
      const sign = _v.copy(X).applyQuaternion(o.quaternion).x >= 0 ? 1 : -1;
      this.wheels.push({ node: o, base: o.quaternion.clone(), front: m[1] === 'front', sign });
      if (m[1] === 'front') wf = o.position.z * k; else wr = o.position.z * k;
    });
    const w = size.x * k, h = size.y * k;
    this.spec = { ...v, width: w, height: h, wf: wf || v.len * 0.3, wr: wr || -v.len * 0.3, wheelR };
    // lights
    const L = mats();
    const lamp = (mat, x, y, z, sx = 0.28, sy = 0.12) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.05), mat);
      m.position.set(x, y, z); this.body.add(m); return m;
    };
    this.tail = L.red.clone();
    for (const s of [-1, 1]) {
      lamp(L.head, s * (w / 2 - 0.3), h * 0.42, v.len / 2 + 0.01);
      lamp(this.tail, s * (w / 2 - 0.25), h * 0.45, -v.len / 2 - 0.01);
    }
    this.siren = null;
    if (type === 'police' || type === 'ambulance' || type === 'firetruck') {
      this.sirenRed = L.red.clone(); this.sirenBlue = L.blue.clone();
      const red = new THREE.Mesh(new THREE.BoxGeometry(w * 0.32, 0.12, 0.25), this.sirenRed);
      const blue = new THREE.Mesh(new THREE.BoxGeometry(w * 0.32, 0.12, 0.25), this.sirenBlue);
      const top = h + 0.06, z = type === 'police' ? -0.15 : v.len * 0.3;
      red.position.set(-w * 0.17, top, z); blue.position.set(w * 0.17, top, z);
      this.body.add(red, blue);
      this.siren = false;
    }
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();
    this.heading = 0; this.pitch = 0; this.roll = 0;
    this.vy = 0; this.speed = 0; this.steer = 0; this.braking = false;
    this.airborne = false; this.drowned = false; this.wheelSpin = 0;
    this.lean = 0; this.impact = 0; this.health = 100; this.night = 0;
    this.radius = w / 2 + 0.1;
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
    this.group.rotation.order = 'YXZ';
    this.group.rotation.set(-this.pitch, this.heading, this.roll);
    this.body.rotation.z = this.lean;
    for (const w of this.wheels) {
      _qs.setFromAxisAngle(X, this.wheelSpin * w.sign);
      w.node.quaternion.copy(w.base).multiply(_qs);
      if (w.front) w.node.quaternion.premultiply(_q.setFromAxisAngle(Y, this.steer));
    }
    this.tail.emissiveIntensity = this.braking ? 3.5 : 0.5 + this.night * 1.5;
    if (this.siren !== null) {
      const t = performance.now() * 0.008;
      const on = this.siren ? 1 : 0;
      this.sirenRed.emissiveIntensity = on * (Math.sin(t) > 0 ? 6 : 0.2);
      this.sirenBlue.emissiveIntensity = on * (Math.sin(t) > 0 ? 0.2 : 6);
    }
  }

  dispose() { this.tail.dispose(); if (this.sirenRed) { this.sirenRed.dispose(); this.sirenBlue.dispose(); } }
}
