// Vehicles: procedural car bodies (assets/carbuilder.js) + arcade driving physics.
import * as THREE from 'three';
import { clamp, lerp } from '../util.js';
import { VEHICLES } from '../assets/library.js';
import { makeBodyMaterial, makeCabinDepthMaterial, randomPaint, FIXED_PAINT, SECOND_PAINT, buildCar, buildCarGen, wheelGeometry, hasSpec } from '../assets/carbuilder.js';
import { cabinLayout, splitDoors, POSE } from '../assets/cabin.js';

// ---- the catalogue warms up in the background: each design is built a few milliseconds at a time
// across frames (a whole one is 100-350 ms, a stall if built when a car spawns), and traffic and
// parked cars pick only from the ones already built
let _lib = null, _gen = null, _genType = null;
const _queue = [];
export function initCarWarmup(lib) {
  _lib = lib;
  const todo = Object.entries(VEHICLES).filter(([k, v]) => v.weight > 0 && !lib.cars[k] && hasSpec(k)).map(([k]) => k);
  for (let i = todo.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [todo[i], todo[j]] = [todo[j], todo[i]]; }
  _queue.push(...todo);
}
export function warmCars(budgetMs = 3) {
  if (!_lib) return;
  const t0 = performance.now();
  while (performance.now() - t0 < budgetMs) {
    if (!_gen) {
      _genType = _queue.shift();
      if (!_genType) return;
      if (_lib.cars[_genType]) continue;
      _gen = buildCarGen(_genType, _lib.quality);
    }
    const r = _gen.next();
    if (r.done) { if (!_lib.cars[_genType]) _lib.cars[_genType] = r.value; _gen = null; }
  }
}
export const carsWarming = () => _queue.length + (_gen ? 1 : 0);
export function randomCarType(rnd) {
  const list = Object.entries(VEHICLES).filter(([k, v]) => v.weight > 0 && (!_lib || _lib.cars[k] || !hasSpec(k)));
  let t = rnd() * list.reduce((a, [, v]) => a + v.weight, 0);
  for (const [k, v] of list) { if ((t -= v.weight) <= 0) return k; }
  return 'sedan';
}

// the contact shadow: a rounded rectangle, darkest under the middle, fading out past the body
let _shGeo = null, _shMat = null;
const SHADOW_GEO = () => _shGeo || (_shGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
const SHADOW_MAT = () => {
  if (_shMat) return _shMat;
  const W = 64, Hh = 128, c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const x = c.getContext('2d'), img = x.createImageData(W, Hh);
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    // signed distance to a rounded rectangle inset from the edges, then a soft falloff
    const px = Math.abs((i + 0.5) / W - 0.5) * 2, pz = Math.abs((j + 0.5) / Hh - 0.5) * 2;
    const qx = Math.max(px - 0.55, 0), qz = Math.max(pz - 0.72, 0), d = Math.hypot(qx / 0.45, qz / 0.28);
    const a = Math.max(0, 1 - d) ** 1.6 * (0.75 + 0.25 * (1 - Math.min(1, Math.hypot(px, pz * 0.8))));
    const k = (j * W + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 0; img.data[k + 3] = Math.round(a * 255);
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  _shMat = new THREE.MeshBasicMaterial({ map: t, color: 0x000000, transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  return _shMat;
};

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
const _sq = new THREE.Quaternion(), _sv = new THREE.Vector3(), _sv2 = new THREE.Vector3(), _sq2 = new THREE.Quaternion();

export class Vehicle {
  constructor(lib, type) {
    this.type = type;
    const v = VEHICLES[type] || VEHICLES.sedan;
    this.group = new THREE.Group();
    this.group.userData.vehicle = true; // core/detail.js thins out far vehicles' small parts
    this.body = new THREE.Group();
    this.group.add(this.body);
    if (!lib.cars[type]) { if (hasSpec(type)) lib.cars[type] = buildCar(type, lib.quality); else type = 'sedan-sports'; } // catalog models: built on first use
    this.type = type;
    const proto = lib.cars[type];
    const model = proto.clone(true);
    this.procedural = !!proto.userData.procedural;
    if (this.procedural) {
      // each car gets its own paint (and its own brake/indicator state)
      const spec = proto.userData.spec;
      const pm = proto.getObjectByName('body').levels[0].object.material;
      this.bodyMat = makeBodyMaterial(spec, pm.isMeshPhysicalMaterial);
      const u = this.bodyMat.userData.u;
      const paint = FIXED_PAINT[type] || spec.paint || randomPaint();
      u.uPaint.value.setRGB(paint[0], paint[1], paint[2]); u.uMetal.value = paint[3];
      if (SECOND_PAINT[type]) u.uPaint2.value.setRGB(...SECOND_PAINT[type]);
      else if (spec.paint2) u.uPaint2.value.setRGB(...spec.paint2);
      model.getObjectByName('body').traverse((o) => { if (o.isMesh && o.userData.shell) o.material = this.bodyMat; });
      this.procSpec = spec;
      // the close-up level: clear glass and a cabin you can see into
      const cab = model.getObjectByName('cabin');
      if (cab) {
        this.cabinMat = makeBodyMaterial(spec, pm.isMeshPhysicalMaterial, 'cabin', u);
        this.glassMat = makeBodyMaterial(spec, true, 'glass', u);
        cab.material = this.cabinMat;
        cab.customDepthMaterial = makeCabinDepthMaterial(u);
        const glass = cab.getObjectByName('cabin-glass'); glass.material = this.glassMat;
        this.cab = { mesh: cab, glass, inner: cab.getObjectByName('cabin-int'), wheel: cab.getObjectByName('cabin-wheel'), spin: cab.getObjectByName('cabin-spin'),
          dials: cab.getObjectByName('cabin-dials'), spd: cab.getObjectByName('needle-spd'), rpm: cab.getObjectByName('needle-rpm'), clear: null, doors: null, doorGlass: [] };
        this.cabLayout = cabinLayout(spec);
        this.setClear(true);
      }
    }
    if (proto.userData.paintable) {
      // per-car paint on the realistic model's body panels
      const paint = FIXED_PAINT[type] || randomPaint();
      model.traverse((o) => { if (o.isMesh && /^Paint/.test(o.material.name)) { o.material = o.material.clone(); o.material.color.setRGB(paint[0], paint[1], paint[2]); o.material.metalness = Math.max(o.material.metalness, paint[3] * 0.6); } });
    }
    // scale the model to its real-world length
    _box.setFromObject(model);
    const size = _box.getSize(new THREE.Vector3());
    const k = v.len / size.z;
    const ctr = _box.getCenter(new THREE.Vector3());
    model.scale.setScalar(k);
    // centre the model on the vehicle's origin so its footprint and hitbox line up exactly
    model.position.set(-ctr.x * k, -_box.min.y * k, -ctr.z * k);
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
      if (m[1] === 'front') wf = (o.position.z - ctr.z) * k; else wr = (o.position.z - ctr.z) * k;
    });
    const w = size.x * k, h = size.y * k;
    this.spec = { ...v, width: this.procSpec ? this.procSpec.W * k : w, height: h, wf: wf || v.len * 0.3, wr: wr || -v.len * 0.3, wheelR };
    // lights
    const L = mats();
    const lamp = (mat, x, y, z, sx = 0.28, sy = 0.12) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.05), mat);
      m.position.set(x, y, z); this.body.add(m); return m;
    };
    this.tail = L.red.clone();
    if (!this.procedural && !proto.userData.hasLights) for (const s of [-1, 1]) {
      lamp(L.head, s * (w / 2 - 0.3), h * 0.42, v.len / 2 + 0.01);
      lamp(this.tail, s * (w / 2 - 0.25), h * 0.45, -v.len / 2 - 0.01);
    }
    this.siren = null;
    if (type === 'police' || type === 'ambulance' || type === 'firetruck') {
      if (this.procedural) this.siren = false;
    }
    if (!this.procedural && (type === 'police' || type === 'ambulance' || type === 'firetruck')) {
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
    this.lean = 0; this.impact = 0; this.health = 100; this.maxHealth = 100; this.night = 0;
    this.dirt = Math.random() * Math.random() * 0.55; // cars out in the world aren't showroom-clean
    this.nitro = 0; this.nitroTank = 1; this.spoiler = null;
    this.radius = w / 2 + 0.1;
    // a soft contact shadow on the ground under the car (G12): the dark where the body meets the road
    // that the sun's shadow map is too coarse to draw, on every preset
    const sh = new THREE.Mesh(SHADOW_GEO(), SHADOW_MAT());
    sh.scale.set(this.spec.width + 0.55, 1, v.len + 0.7);
    sh.position.y = 0.035; sh.renderOrder = 1; sh.userData.noHit = true; sh.userData.noReflect = true; sh.castShadow = false;
    this.group.add(sh); this.contactShadow = sh;
    if (this.procSpec?.spoiler) this.setSpoiler(this.procSpec.spoiler); // a factory spoiler (catalog.js designs)
  }

  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  // ---- the cabin
  // clear glass with the interior showing, or the old tinted look (traffic with nobody at the wheel)
  setClear(on) {
    const c = this.cab;
    if (!c || c.clear === on) return;
    c.clear = on;
    this.bodyMat.userData.u.uClear.value = on ? 1 : 0;
    c.glass.visible = c.inner.visible = c.wheel.visible = c.dials.visible = on;
    for (const g of c.doorGlass) g.visible = on;
  }
  // split the front doors out of the body so they can swing open
  openableDoors() {
    const c = this.cab;
    if (!c || c.doors) return;
    const d = splitDoors(this.procSpec, c.mesh.geometry);
    c.doors = [];
    if (!d) return;
    c.mesh.geometry = d.body; c.glass.geometry = d.body;
    for (const D of d.doors) {
      const pivot = new THREE.Group(); pivot.name = D.name; pivot.position.set(D.hinge[0], 0, D.hinge[1]); pivot.userData.open = D.open;
      const skin = new THREE.Mesh(D.geo, this.cabinMat); skin.position.set(-D.hinge[0], 0, -D.hinge[1]);
      skin.castShadow = skin.receiveShadow = true; skin.customDepthMaterial = c.mesh.customDepthMaterial;
      const gl = new THREE.Mesh(D.geo, this.glassMat); gl.position.copy(skin.position); gl.userData.noHit = true; gl.renderOrder = 2; gl.visible = !!c.clear;
      pivot.add(skin, gl); c.mesh.add(pivot); c.doorGlass.push(gl); c.doors.push(pivot);
    }
  }
  door(name) { this.openableDoors(); return this.group.getObjectByName(name); }
  // sit a person in seat i (0 driver, 1 front passenger, 2.. rear), hips on the cushion, leaning back with the seat
  seat(h, i = 0) {
    const L = this.cabLayout;
    if (!L) return false;
    const st = L.seats[Math.min(i, L.seats.length - 1)];
    const m = this.body.children[0];
    m.updateWorldMatrix(true, false);
    _sq.setFromAxisAngle(X, -st.th);
    const sc = _sv2.copy(h.root.scale).multiply(h.model.scale); // body size lives on the root (weight) or the model (crew)
    // bigger people, and hats, sink a little deeper so their heads clear the roof
    const sink = Math.max(0, sc.y - 1) * 0.84 + (h.acc && h.acc.some((a) => a.userData.at && a.userData.at[1] > 0.08) ? 0.06 : 0);
    _sv.set(-POSE.pelvis[0] * sc.x, -POSE.pelvis[1] * sc.y, -POSE.pelvis[2] * sc.z).applyQuaternion(_sq).add(_sv2.set(st.x, st.y - sink, st.z));
    m.localToWorld(h.root.position.copy(_sv));
    m.getWorldQuaternion(_sq2);
    h.root.quaternion.copy(_sq2).multiply(_sq);
    return true;
  }
  // the driver's eyes, for the cockpit camera
  eyeWorld(out) {
    const L = this.cabLayout;
    if (!L) return null;
    const m = this.body.children[0];
    m.updateWorldMatrix(true, false);
    return m.localToWorld(out.set(L.eye.x, L.eye.y, L.eye.z));
  }
  // steering wheel turns with the front wheels, needles follow speed and revs
  updateCabin(dt) {
    const c = this.cab;
    if (!c) return;
    const turn = -this.steer * 5.2;
    c.spin.rotation.z = turn;
    if (!c.spd.visible) c.spd.visible = c.rpm.visible = true;
    const sp = Math.abs(this.speed || 0), mph = sp * 2.237, top = Math.max(20, this.spec.top || 50);
    c.spd.rotation.z = 0.75 * Math.PI - 1.5 * Math.PI * Math.min(1, mph / 140);
    const gear = Math.min(5, Math.floor(sp / (top / 5))), within = (sp - gear * (top / 5)) / (top / 5);
    const rpm = sp < 0.5 ? 0.1 + Math.sin(performance.now() * 0.02) * 0.004 : 0.2 + within * 0.55 + gear * 0.02;
    this._rpm = lerp(this._rpm || 0.1, rpm, Math.min(1, dt * 6));
    c.rpm.rotation.z = 0.75 * Math.PI - 1.5 * Math.PI * this._rpm;
  }
  // the driver's hands ride the rim as it turns (two-bone IK)
  handsOnWheel(pose) {
    const c = this.cab;
    if (!c || !pose || !pose.ok) return;
    c.wheel.updateWorldMatrix(true, false);
    const k = this.cabLayout.wheel.R * Math.SQRT1_2, a = Math.max(-0.9, Math.min(0.9, c.spin.rotation.z));
    const q = this.group.quaternion;
    const F = { fw: new THREE.Vector3(0, 0, 1).applyQuaternion(q), right: new THREE.Vector3(-1, 0, 0).applyQuaternion(q), up: new THREE.Vector3(0, 1, 0).applyQuaternion(q), chest: pose.chest.getWorldPosition(new THREE.Vector3()) };
    const col = new THREE.Vector3(0, 0, 1).transformDirection(c.wheel.matrixWorld);
    for (const [side, sx] of [['L', 1], ['R', -1]]) {
      const lx = sx * k, ly = k;
      const rx = lx * Math.cos(a) - ly * Math.sin(a), ry = lx * Math.sin(a) + ly * Math.cos(a);
      // the wrist sits just behind and inside the rim, so the palm lies on it and the fingers wrap it
      const p = c.wheel.localToWorld(new THREE.Vector3(rx * 0.86, ry * 0.86, -0.045));
      pose.reach(side === 'L' ? pose.L : pose.R, p, F, side);
    }
  }

  // tuning: swap rims, fit a spoiler
  setRims(spokes) {
    const spec = this.procSpec;
    if (!spec) return;
    // every level of detail gets the new rims (the wheel is a THREE.LOD: near, mid, far)
    for (const w of this.wheels) w.node.traverse((o) => { if (o.isLOD) o.levels.forEach((lv, i) => { lv.object.geometry = wheelGeometry(spec, spokes, i); }); else if (o.isMesh && !o.parent?.isLOD) o.geometry = wheelGeometry(spec, spokes); });
  }
  setSpoiler(level) {
    if (this.spoiler) { this.body.remove(this.spoiler); this.spoiler = null; }
    const spec = this.procSpec;
    if (!level || !spec || spec.box || spec.bed) return;
    const mat = this.bodyMat;
    const g = new THREE.Group();
    const w = spec.W * (level === 1 ? 0.8 : 0.92), deckY = spec.deck, z = -spec.L / 2 + 0.25;
    if (level === 1) { const lip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 0.12), mat); lip.position.set(0, deckY + 0.03, z); g.add(lip); }
    else {
      const h = level === 2 ? 0.18 : 0.32;
      const wing = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, level === 2 ? 0.22 : 0.3), mat); wing.position.set(0, deckY + h, z - 0.05); wing.rotation.x = -0.08; g.add(wing);
      for (const sx of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, 0.08), mat); st.position.set(sx * w * 0.35, deckY + h / 2, z); g.add(st); }
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.spoiler = g;
    this.body.children[0].add(g);
  }

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
        else {
          // nitrous: Shift while driving, drains a tank that refills over time
          const boost = input.nitro && this.nitro > 0 && this.nitroTank > 0 ? 1.8 : 1;
          if (boost > 1) this.nitroTank = Math.max(0, this.nitroTank - dt * 0.25);
          vF += t.accel * boost * thr * Math.max(0, 1 - vF / (t.top * (boost > 1 ? 1.15 : 1))) * dt * (vF < 8 ? 1.25 : 1);
        }
      }
      if (brk > 0) {
        if (vF > 0.5) { vF -= 22 * (t.brakeK || 1) * brk * dt; this.braking = true; }
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

    // collisions with buildings, trees, poles: the car's exact footprint (oriented box)
    this.impact = 0;
    let cx = 0, cz = 0, hits = 0, nx = 0, nz = 0;
    {
      const res = collision.resolveOBB(this.pos.x, this.pos.z, t.width / 2, t.len / 2, this.heading, this.pos.y, Math.min(t.height || 1.6, 2.5));
      if (res.hit) { cx = res.x - this.pos.x; cz = res.z - this.pos.z; nx = res.nx; nz = res.nz; hits = 1; }
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
    if (this.contactShadow) this.contactShadow.visible = !this.airborne && !this.drowned;
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
    if (this.bodyMat) {
      const u = this.bodyMat.userData.u;
      u.uBrake.value = this.braking ? 1 : 0;
      u.uLights.value = this.night;
      if (u.uDirt) u.uDirt.value = this.dirt || 0;
      const on = this.siren ? 1 : 0, t = performance.now() * 0.008;
      u.uSirenR.value = on * (Math.sin(t) > 0 ? 1 : 0.05);
      u.uSirenB.value = on * (Math.sin(t) > 0 ? 0.05 : 1);
    } else if (this.siren !== null) {
      const t = performance.now() * 0.008;
      const on = this.siren ? 1 : 0;
      this.sirenRed.emissiveIntensity = on * (Math.sin(t) > 0 ? 6 : 0.2);
      this.sirenBlue.emissiveIntensity = on * (Math.sin(t) > 0 ? 0.2 : 6);
    }
  }

  dispose() { this.tail.dispose(); if (this.bodyMat) this.bodyMat.dispose(); if (this.cabinMat) { this.cabinMat.dispose(); this.glassMat.dispose(); this.cab.mesh.customDepthMaterial?.dispose(); } if (this.sirenRed) { this.sirenRed.dispose(); this.sirenBlue.dispose(); } }
}
