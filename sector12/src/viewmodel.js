// First-person weapon + arms.
//
// The held weapon is the full detailed model (weapons.js); two arms (sleeve, glove with curled
// fingers) are solved with IK every frame so the hands stay on the grip and the handguard. On top
// of a hip / ADS / sprint pose the view adds layered procedural motion: equip raise, mouse-lag sway,
// walk bob (figure-eight), breathing, crouch / jump / landing springs and spring-driven recoil. The
// action is worked for real: slides and bolts cycle, hammers fall and re-cock, revolver cylinders
// index, pumps rack, bolt-actions lift-pull-push, empty pistols lock back, dust covers pop open,
// casings fly out of the port, and every reload is its own choreography (mag drop + fresh mag +
// charging handle, shell-by-shell into a tube, revolver crane out + rounds + flick closed,
// break-action barrel drop). Melee slashes / chops, throws and every medical item have their own
// motions too.
import * as THREE from 'three';
import { ITEMS } from './data/catalog.js';
import { buildWeapon, compactWeapon, restParts } from './weapons.js';
import { ik, limb, rboxGeo, at, mergeParts, camoTexture, PALETTES } from './rig.js';
import { Hand, sleeveGeometry, cuffGeometry, elbowPadGeometry, watchGeometry } from './hands.js';
import { lerp } from './rng.js';

// kept for the POB printer display and other callers
export function buildItemModel(def, inst = null) { return buildWeapon(def, inst); }

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const bell = (t) => Math.sin(Math.PI * clamp(t, 0, 1));
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

class S1 { // scalar spring
  constructor(k = 200, d = null) { this.x = 0; this.v = 0; this.k = k; this.d = d ?? 2 * Math.sqrt(k); }
  update(dt, target = 0) { this.v += ((target - this.x) * this.k - this.v * this.d) * dt; this.x += this.v * dt; return this.x; }
}

const S = 0.62; // the whole view is modelled at real size and shrunk towards the eye (less wall clipping)
const ARM = { upper: 0.3, fore: 0.28 };

// medical items shown in the left hand while treating
function medModel(id) {
  const g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  if (id === 'adrenaline' || id === 'numbing' || id === 'scalpel') {
    if (id === 'scalpel') { add(new THREE.BoxGeometry(0.008, 0.012, 0.11), M(0xb8bcc0, { metalness: 1, roughness: 0.2 }), 0, 0, -0.03); add(new THREE.BoxGeometry(0.002, 0.012, 0.03), M(0xe0e4e8, { metalness: 1, roughness: 0.1 }), 0, 0, -0.1); }
    else {
      add(new THREE.CylinderGeometry(0.011, 0.011, 0.11, 12), M(id === 'adrenaline' ? 0xff4a2a : 0x3a8aff, { transparent: true, opacity: 0.85 }), 0, 0, -0.02, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.0015, 0.0015, 0.04, 6), M(0xd0d0d0, { metalness: 1 }), 0, 0, -0.095, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.016, 0.016, 0.006, 12), M(0x222222), 0, 0, 0.04, Math.PI / 2);
      g.userData.plunger = add(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), M(0xeeeeee), 0, 0, 0.065, Math.PI / 2);
    }
  } else if (id === 'medkit') {
    add(new THREE.BoxGeometry(0.16, 0.1, 0.06), M(0xb01e1e), 0, 0.02, -0.02);
    add(new THREE.BoxGeometry(0.06, 0.016, 0.062), M(0xf0f0f0), 0, 0.02, -0.02);
    add(new THREE.BoxGeometry(0.016, 0.06, 0.062), M(0xf0f0f0), 0, 0.02, -0.02);
  } else if (id === 'tourniquet') {
    add(new THREE.TorusGeometry(0.045, 0.012, 6, 18), M(0x1a1a1a), 0, 0, -0.03, 0.4);
    add(new THREE.BoxGeometry(0.012, 0.012, 0.08), M(0xc83a1a), 0.045, 0, -0.03);
  } else if (id === 'meat') {
    const s = new THREE.SphereGeometry(0.05, 10, 8); s.scale(1.4, 0.7, 1);
    add(s, M(0x8a3a2a, { roughness: 0.4 }), 0, 0, -0.03);
  } else if (id === 'handwarmer') {
    add(new THREE.BoxGeometry(0.07, 0.012, 0.09), M(0xd86a1a), 0, 0, -0.03);
  } else {
    // bandage / gauze roll with a loose tail
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 16), M(id === 'gauze' ? 0xf4f4ee : 0xe8dcc8, { roughness: 0.95 }), 0, 0, -0.03, 0, 0, Math.PI / 2);
    g.userData.tail = add(new THREE.PlaneGeometry(0.055, 0.12), M(0xf0ece4, { side: THREE.DoubleSide, roughness: 0.95 }), 0, -0.06, -0.03, 0.2);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}

// casing types -> geometry (made on demand by effects)
export const CASINGS = { rifle: [0.0055, 0.045], pistol: [0.0058, 0.022], big: [0.011, 0.1], shell: [0.0105, 0.065] };

export class Viewmodel {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.scale.setScalar(S);
    camera.add(this.root);
    this.model = null;
    this.def = null;
    this.flashT = 0;
    // muzzle flash: three crossed flame cards + a core, and a light
    this.flash = new THREE.Group();
    const flameTex = flashTexture();
    const fm = new THREE.MeshBasicMaterial({ map: flameTex, color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    for (let i = 0; i < 3; i++) { const q = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.22), fm); q.rotation.set(Math.PI / 2, (i / 3) * Math.PI, 0); q.position.z = -0.1; this.flash.add(q); }
    const front = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), new THREE.MeshBasicMaterial({ map: flameTex, color: 0xffe0a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.flash.add(front);
    this.flash.visible = false;
    this.light = new THREE.PointLight(0xffa850, 0, 10, 1.6);
    this.muzzle = new THREE.Object3D();
    // arms
    // arms: folded fabric sleeves with cuffs and elbow pads, a watch on the left wrist, and fully
    // articulated gloved hands (five fingers, three joints each)
    this.armMat = {};
    this.setSleeves(null);
    const M = this.armMat;
    const group = () => { const g = new THREE.Group(); g.matrixAutoUpdate = false; this.root.add(g); return g; };
    const mesh = (g, geo, mat) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; g.add(m); return m; };
    const upperGeo = sleeveGeometry('upper'), foreGeo = sleeveGeometry('fore'), cuffGeo = cuffGeometry(), padGeo = elbowPadGeometry();
    const mkUpper = () => { const g = group(); mesh(g, upperGeo, M.sleeve); mesh(g, padGeo, M.plate); return g; };
    const mkFore = (watch) => {
      const g = group(); mesh(g, foreGeo, M.sleeve); mesh(g, cuffGeo, M.sleeve);
      if (watch) { const W = watchGeometry(); mesh(g, W.band, M.strap); mesh(g, W.dial, M.dial); }
      return g;
    };
    this.handR = new Hand(1, M); this.handL = new Hand(-1, M);
    this.root.add(this.handR.root, this.handL.root);
    this.handR.root.traverse((o) => { o.frustumCulled = false; }); this.handL.root.traverse((o) => { o.frustumCulled = false; });
    this.arm = { upR: mkUpper(), foR: mkFore(false), hR: this.handR.root, upL: mkUpper(), foL: mkFore(true), hL: this.handL.root };
    this.lastKick = -9; this.idleT = 0; this.tapT = 0; this.reachT = 0;
    // springs
    this.sp = { x: new S1(140), y: new S1(140), z: new S1(160), rx: new S1(180), ry: new S1(140), rz: new S1(140) };
    this.rec = { z: new S1(320, 22), rx: new S1(260, 18), ry: new S1(200, 18), rz: new S1(200, 16) };
    this.land = new S1(120, 10);
    this.swayP = V(); this.swayR = V();
    this.t = 0;
    this.equip = 0;
    this.cycle = 1; this.cyclePart = null;
    this.dustOpen = false;
    this.cylIndex = 0; this.cylAngle = 0;
    this.cylOpen = 0;
    this.swingSide = 1; this.lastSwing = 0;
    this.lastReload = 0; this.reloadEmpty = false;
    this.ejectedThisCycle = false;
    this.med = null; this.medId = null;
    this.mag = null;
    this.inspect = 0;
  }

  // sleeve camo follows the worn suit
  setSleeves(suitId) {
    const pal = suitId === 'camo_winter' ? PALETTES.winter : suitId === 'camo_desert' ? PALETTES.desert : suitId === 'camo_forest' ? PALETTES.woodland : PALETTES.ranger;
    const key = pal.join(',');
    if (this.sleeveKey === key) return;
    this.sleeveKey = key;
    this.armMat.sleeve = this.armMat.sleeve || new THREE.MeshStandardMaterial({ roughness: 0.92 });
    this.armMat.sleeve.map = camoTexture(pal);
    this.armMat.sleeve.needsUpdate = true;
    this.armMat.glove = this.armMat.glove || new THREE.MeshStandardMaterial({ color: 0x55513f, roughness: 0.8 });
    this.armMat.strap = this.armMat.strap || new THREE.MeshStandardMaterial({ color: 0x3a3a34, roughness: 0.7 });
    this.armMat.plate = this.armMat.plate || new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.42, metalness: 0.1 });
    this.armMat.skin = this.armMat.skin || new THREE.MeshStandardMaterial({ color: 0xc89a78, roughness: 0.55 });
    if (!this.armMat.dial) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#0d1210'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
      g.strokeStyle = '#9affc8'; g.lineWidth = 3;
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48); g.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); g.stroke(); }
      g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 30, 64 - 18); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 - 8, 64 - 46); g.stroke();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      this.armMat.dial = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
    }
  }

  // def: catalog def; inst: inventory instance (attachments/camo) or null for empty hands
  set(def, inst) {
    if (this.model) this.root.remove(this.model);
    this.model = null;
    this.def = def;
    this.inst = inst;
    if (!def) { this.equip = 0; return; }
    const g = compactWeapon(buildWeapon(def, inst));
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    this.muzzle.position.set(0, 0.0, g.userData.muzzleZ);
    g.add(this.muzzle);
    this.flash.position.copy(this.muzzle.position);
    this.light.position.copy(this.muzzle.position);
    g.add(this.flash, this.light);
    this.model = g;
    this.ud = g.userData;
    this.P = g.userData.parts;
    this.kind = g.userData.kind;
    this.sightY = g.userData.sightY;
    this.root.add(g);
    this.equip = 0;
    this.dustOpen = false;
    this.cylIndex = 0;
    this.cylOpen = 0;
  }

  kick() {
    const d = this.def;
    if (!d) return;
    this.flashT = d.melee ? 0 : 0.05;
    this.flash.rotation.z = Math.random() * 3;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.5);
    const r = (d.recoil || 0.02) * (this.kind === 'pistol' ? 1.4 : 1);
    const ads = this.adsT || 0;
    this.rec.z.v += (2.2 + r * 60) * (1 - ads * 0.35);
    this.rec.rx.v += (3 + r * 140) * (1 - ads * 0.5);
    this.rec.ry.v += (Math.random() - 0.5) * (1 + r * 40);
    this.rec.rz.v += (Math.random() - 0.5) * (2 + r * 50);
    this.lastKick = this.t;
    // work the action
    this.cycle = 0;
    this.ejectedThisCycle = false;
    if (this.P && this.P.dust) this.dustOpen = true;
    if (this.P && this.P.cylinder) this.cylIndex++;
  }

  muzzleWorld(v) { return this.muzzle.getWorldPosition(v); }

  // ---------------------------------------------------------------- per frame
  update(dt, st) {
    this.t += dt;
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    this.light.intensity = this.flashT > 0 ? 8 : 0;
    if (st.suit !== undefined) this.setSleeves(st.suit);
    const visible = !(st.scoped && st.adsT > 0.92);
    this.root.visible = visible;
    this.reachT = Math.max(0, this.reachT - dt / 0.7);
    if (!this.model) { this.updateUnarmed(dt, st); return; }
    const d = this.def, ud = this.ud, P = this.P;
    const a = (this.adsT = st.adsT || 0);
    this.equip = Math.min(1, this.equip + dt * 2.8);
    restParts(P);

    // ---- base pose (gun origin, in root units) for hip / ADS / sprint
    const kind = this.kind;
    const dual = kind === 'dual', melee = kind === 'melee';
    const hip = dual ? V(0, -0.19, -0.5) : melee ? V(0.19, -0.22, -0.45) : kind === 'pistol' ? V(0.14, -0.17, -0.46) : V(0.14, -0.17, -0.38);
    const ads = dual ? V(0, -0.17, -0.44) : V(0, -this.sightY, kind === 'pistol' ? -0.42 : d.id === 'bg850' ? -0.2 : -0.27);
    const pos = V().copy(hip).lerp(ads, sm(a));
    let rx = 0, ry = 0, rz = 0;
    // walking bob: a figure-eight, much smaller while aiming
    const moveK = st.moving ? 1 : 0;
    this.moveK = lerp(this.moveK || 0, moveK, Math.min(1, dt * 6));
    const bobK = this.moveK * (1 - a * 0.85) * (st.sprint ? 1.8 : 1);
    pos.x += Math.sin(st.bob) * 0.012 * bobK;
    pos.y += -Math.abs(Math.cos(st.bob)) * 0.012 * bobK;
    rz += Math.sin(st.bob) * 0.02 * bobK;
    // breathing
    const breath = (1 - a * 0.8) * (1 + (st.tired || 0));
    pos.y += Math.sin(this.t * 1.6) * 0.0025 * breath;
    rx += Math.sin(this.t * 1.6 + 0.5) * 0.004 * breath;
    // mouse sway: the gun lags behind the view and rolls into turns
    const sx = clamp(-(st.mdx || 0) * 0.0009, -0.06, 0.06), sy = clamp((st.mdy || 0) * 0.0009, -0.06, 0.06);
    const swK = 1 - a * 0.75;
    pos.x += this.sp.x.update(dt, sx * swK);
    pos.y += this.sp.y.update(dt, sy * swK);
    ry += this.sp.ry.update(dt, sx * 2.2 * swK);
    rx += this.sp.rx.update(dt, -sy * 1.6 * swK);
    rz += this.sp.rz.update(dt, sx * 3 * swK);
    // sprint: rifle canted across, pistol tucked
    const spr = st.sprint ? 1 : 0;
    this.sprK = lerp(this.sprK || 0, spr, Math.min(1, dt * 7));
    pos.x += 0.06 * this.sprK; pos.y -= 0.06 * this.sprK; pos.z += 0.04 * this.sprK;
    ry += (kind === 'pistol' ? 0.2 : 0.7) * this.sprK; rx -= 0.35 * this.sprK; rz += 0.25 * this.sprK;
    // crouch dip and landing thump
    this.crK = lerp(this.crK || 0, st.crouch ? 1 : 0, Math.min(1, dt * 8));
    pos.y -= 0.015 * this.crK; rz -= 0.05 * this.crK * (1 - a);
    if (st.landed) this.land.v -= Math.min(2.5, st.landed * 0.25);
    pos.y += this.land.update(dt) * 0.04; rx += this.land.x * 0.15;
    if (st.airborne) { pos.y += 0.012; rx += 0.03; }
    // recoil springs
    pos.z += this.rec.z.update(dt) * 0.018;
    rx += this.rec.rx.update(dt) * 0.006;
    ry += this.rec.ry.update(dt) * 0.006;
    rz += this.rec.rz.update(dt) * 0.006;
    // equip: swing up from below
    const e = sm(this.equip);
    pos.y -= (1 - e) * 0.35; rx -= (1 - e) * 0.9; rz += (1 - e) * 0.4;

    // ---- actions
    const left = { target: null, pose: null };
    const right = { target: null };
    this.cycle = Math.min(1, this.cycle + dt / this.cycleTime(d));
    this.workAction(dt, st, pos);
    let medK = 0;
    if (st.busy > 0) medK = this.animMed(dt, st, pos, left);
    else this.dropMed();
    if (!medK && st.reload > 0) this.animReload(st, left, right);
    else if (!medK) this.reloadDone(st);
    if (st.pump > 0) this.animPump(st, right, left);
    if (st.swing > 0) { const r = this.animSwing(st); pos.add(r.p); rx += r.rx; ry += r.ry; rz += r.rz; }
    else this.lastSwing = 0;
    if (st.reload > 0) { const k = this.reloadTilt(st.reload); pos.add(k.p); rx += k.rx; ry += k.ry; rz += k.rz; }
    if (medK) { pos.y -= 0.45 * medK; rx -= 0.8 * medK; pos.x += 0.08 * medK; }
    if (this.inspect > 0) { this.inspect = Math.max(0, this.inspect - dt / 3.2); const k = bell(1 - this.inspect); ry -= 0.9 * k; rz += 0.5 * k; pos.x -= 0.08 * k; pos.z += 0.06 * k; }
    // trigger finger
    if (P.trigger && st.trigger) P.trigger.rotation.x = 0.35;

    this.model.position.copy(pos);
    this.model.rotation.set(rx, ry, rz, 'YXZ');
    this.model.updateMatrix();
    this.model.updateMatrixWorld(true);

    // ---- arms
    const toRoot = (v) => v.applyMatrix4(this.model.matrix);
    const gripR = toRoot((ud.grip || V()).clone());
    let gripL;
    if (dual) gripL = toRoot(ud.gripL.clone());
    else if (left.target) gripL = left.target;
    else if (ud.fore) gripL = toRoot(ud.fore.clone().add(P.pump && ud.fore.distanceTo(P.pump.position) < 0.15 ? V(0, 0, P.pump.position.z - P.pump.userData.rest.p.z) : V()));
    else if (melee) gripL = null;
    else gripL = toRoot(ud.grip.clone().add(V(-0.03, -0.012, 0.005)));
    if (right.target) gripR.copy(right.target);
    // reaching out to grab / open something with the support hand
    if (this.reachT > 0 && !medK && !(st.reload > 0) && !dual) {
      const k = bell(1 - this.reachT);
      const grab = V(-0.06, -0.1, -0.5);
      gripL = gripL ? V().copy(gripL).lerp(grab, k) : grab;
      left.pose = k > 0.6 && this.reachT < 0.5 ? 'mag' : 'reach';
      left.fwd = V(0.1, -0.2, -1).normalize(); left.up = V(0, 1, 0);
    }
    const gunFwd = V(0, 0, -1).applyQuaternion(this.model.quaternion), gunUp = V(0, 1, 0).applyQuaternion(this.model.quaternion);
    this.solveArm('R', V(0.2, -0.42, 0.12), gripR, gunFwd, gunUp, true);
    if (gripL) { this.arm.upL.visible = this.arm.foL.visible = this.arm.hL.visible = true; this.solveArm('L', V(-0.24, -0.44, 0.05), gripL, left.fwd || gunFwd, left.up || gunUp, true); }
    else this.arm.upL.visible = this.arm.foL.visible = this.arm.hL.visible = false;
    if (this.med) { this.med.matrix.copy(this.arm.hL.matrix).multiply(new THREE.Matrix4().makeTranslation(0.0, -0.03, 0.08)); this.med.matrixWorldNeedsUpdate = true; }
    // ---- fingers
    const busy = st.sprint > 0 || st.reload > 0 || st.busy > 0 || this.equip < 1 || st.swing > 0 || this.inspect > 0;
    let rp;
    if (melee) rp = d.throwable && st.swing > 0.45 ? 'open' : 'knife';
    else if (right.target) rp = 'pinch';
    else if (busy) rp = 'gripSafe';
    else if (st.trigger) rp = 'gripPull';
    else rp = 'grip';
    this.handR.setPose(rp);
    let lp = left.pose;
    if (!lp) lp = dual ? (st.trigger ? 'gripPull' : 'grip') : kind === 'pistol' ? 'cup' : 'fore';
    this.handL.setPose(lp);
    // idle fidget: the support hand drums its fingers on the handguard now and then
    const still = !st.moving && !st.trigger && !(st.reload > 0) && !(st.busy > 0) && a < 0.1;
    this.idleT = still ? this.idleT + dt : 0;
    if (this.idleT > 5 && this.tapT <= 0 && Math.random() < dt * 0.5) this.tapT = 1;
    this.tapT = Math.max(0, this.tapT - dt / 1.2);
    const tap = this.tapT > 0 ? ((1 - this.tapT) * 3) % 1 : 0;
    const squeeze = Math.max(0, 1 - (this.t - this.lastKick) * 6);
    this.handR.update(dt, squeeze, 0);
    this.handL.update(dt, squeeze * 0.6, lp === 'fore' ? tap : 0);
  }

  // no weapon: both hands down in front, swinging gently as you walk; they reach out to use things
  updateUnarmed(dt, st) {
    const walk = st.moving ? 1 : 0;
    this.moveK = lerp(this.moveK || 0, walk, Math.min(1, dt * 6));
    const sw = Math.sin(st.bob) * 0.04 * this.moveK * (st.sprint ? 2 : 1);
    const breathe = Math.sin(this.t * 1.6) * 0.004;
    const k = bell(1 - this.reachT);
    // hands held loosely in front, backs of the hands towards you, fingers relaxed
    const rT = V(0.14 - k * 0.1, -0.2 + breathe + sw + k * 0.1, -0.38 - k * 0.16);
    const lT = V(-0.15, -0.21 + breathe - sw, -0.36);
    const upR = V(-0.35, 1, 0.5).normalize(), upL = V(0.35, 1, 0.5).normalize();
    this.solveArm('R', V(0.2, -0.42, 0.12), rT, V(-0.25, -0.15 + k * 0.3, -1).normalize(), upR, false);
    this.arm.upL.visible = this.arm.foL.visible = this.arm.hL.visible = true;
    this.solveArm('L', V(-0.24, -0.44, 0.05), lT, V(0.25, -0.15, -1).normalize(), upL, false);
    this.handR.setPose(k > 0.5 && this.reachT < 0.5 ? 'mag' : this.reachT > 0 ? 'open' : 'relaxed');
    this.handL.setPose('relaxed');
    this.handR.update(dt); this.handL.update(dt);
    if (this.med) this.dropMed();
  }

  // the support hand reaches out (opening a crate, picking up a print, harvesting...)
  reach() { this.reachT = 1; }

  cycleTime(d) {
    if (!d || d.melee) return 0.1;
    return clamp(60 / (d.rpm || 400) * 0.8, 0.03, 0.12);
  }

  // slides / bolts / hammers / cylinders running with the shots
  workAction(dt, st, pos) {
    const P = this.P, d = this.def, c = this.cycle;
    const back = c < 1 ? bell(c) : 0;
    if (P.slide) {
      P.slide.position.z += back * 0.05;
      if (st.empty && c >= 0.5) P.slide.position.z = P.slide.userData.rest.p.z + 0.045; // locked back
    }
    if (P.bolt && (d.id === 'ka43' || d.shape === 'shotgun_semi')) P.bolt.position.z += back * (d.id === 'ka43' ? 0.11 : 0.07);
    if (P.dust && this.dustOpen) P.dust.rotation.x = -1.3;
    if (P.hammer) {
      const cocked = d.mode === 'revolver' || d.mode === 'break' || d.shape === 'shotgun' ? (c >= 1 ? 1 : sm(seg(c, 0.4, 1))) : (c >= 1 ? 1 : c < 0.3 ? 0 : 1);
      P.hammer.rotation.x = -0.65 * cocked;
    }
    if (P.cylinder) {
      const n = d.id === 'guillotine' ? 5 : 6;
      const target = (this.cylIndex * Math.PI * 2) / n;
      this.cylAngle += (target - this.cylAngle) * Math.min(1, dt * 18);
      P.cylinder.rotation.z = this.cylAngle;
    }
    // casing out of the port mid-cycle (not for pumps / bolts / revolvers / breaks: those eject by hand)
    if (!this.ejectedThisCycle && c > 0.35 && c < 1 && this.ud.casing && ['auto', 'semi'].includes(d.mode)) {
      this.ejectedThisCycle = true;
      this.eject(this.ud.casing);
    }
  }

  eject(kind, strength = 1) {
    if (!this.onEject || !this.ud.eject) return;
    this.model.updateMatrixWorld(true);
    const p = this.ud.eject.clone();
    const port = this.model.localToWorld(p);
    const q = this.model.getWorldQuaternion(new THREE.Quaternion());
    const vel = V(2.4 + Math.random(), 1.6 + Math.random(), 0.6 + Math.random() * 0.4).multiplyScalar(strength).applyQuaternion(q);
    this.onEject(port, vel, kind);
  }

  // ---------------------------------------------------------------- reloads
  reloadTilt(t) {
    const k = bell(seg(t, 0.0, 1.0));
    const kind = this.kind, d = this.def;
    if (d.mode === 'revolver') return { p: V(-0.06 * k, 0.04 * k, 0.05 * k), rx: 0.5 * k, ry: 0.15 * k, rz: 0.9 * k };
    if (d.perRound) return { p: V(-0.04 * k, 0.0, 0.04 * k), rx: 0.15 * k, ry: 0.1 * k, rz: -1.1 * k }; // roll the loading port up
    if (d.mode === 'break') return { p: V(-0.05 * k, 0.03 * k, 0.06 * k), rx: 0.35 * k, ry: 0.2 * k, rz: 0.3 * k };
    if (kind === 'pistol') return { p: V(-0.05 * k, 0.03 * k, 0.07 * k), rx: 0.25 * k, ry: 0.2 * k, rz: 0.55 * k };
    return { p: V(-0.06 * k, 0.02 * k, 0.06 * k), rx: 0.18 * k, ry: 0.25 * k, rz: 0.7 * k };
  }

  animReload(st, left, right) {
    const t = st.reload, P = this.P, d = this.def, ud = this.ud;
    if (t < this.lastReload - 0.5 || !this.lastReload) { this.reloadEmpty = !!st.empty; this.dropped = false; }
    this.lastReload = t;
    const toRoot = (v) => v.applyMatrix4(this.model.matrix);
    const pouch = V(-0.28, -0.6, -0.15);
    const lerpV = (a, b, u) => V().copy(a).lerp(b, sm(u));
    const fore = ud.fore ? toRoot(ud.fore.clone()) : toRoot(ud.grip.clone().add(V(-0.03, -0.01, 0)));
    if (d.mode === 'revolver') {
      // crane swings out, round goes in, (closing happens when the reload finishes)
      this.cylOpen = Math.min(1, this.cylOpen + 0.08);
      P.crane.rotation.z = -1.1 * sm(this.cylOpen);
      const cyl = toRoot(P.crane.position.clone().add(V(-0.03, 0.0, 0.0)));
      left.target = t < 0.5 ? lerpV(pouch, cyl, t * 2) : lerpV(cyl, pouch, (t - 0.5) * 2);
      left.pose = t < 0.55 ? 'pinch' : 'reach';
      if (t > 0.45 && t < 0.55) this.cylIndex = Math.round(this.cylIndex) + 0; // seat the round
      return;
    }
    if (d.perRound) {
      // shell from the belt into the loading port, thumb it home
      const port = toRoot((ud.magWell || V(0, -0.05, -0.05)).clone().add(V(0, -0.03, 0)));
      left.target = t < 0.45 ? lerpV(pouch, port, t / 0.45) : t < 0.65 ? V().copy(port).add(V(0, 0.02 * bell(seg(t, 0.45, 0.65)), -0.03 * seg(t, 0.45, 0.65))) : lerpV(port, pouch, (t - 0.65) / 0.35);
      left.up = V(0, -1, 0);
      left.pose = t < 0.62 ? 'pinch' : 'reach';
      return;
    }
    if (d.mode === 'break') {
      // lever, barrel drops, empty pops out, fresh one in, snap shut
      if (P.lever) P.lever.rotation.y = 0.6 * bell(seg(t, 0.0, 0.25));
      const open = sm(seg(t, 0.08, 0.2)) * (1 - sm(seg(t, 0.82, 0.92)));
      if (P.barrel) P.barrel.rotation.x = -0.55 * open;
      if (!this.dropped && t > 0.22) { this.dropped = true; if (ud.casing !== null || d.ammoClass) this.eject('shell', 0.4); }
      const breech = toRoot(V(0, 0.0, -0.1).add(P.barrel ? V(0, 0.03, 0) : V()));
      left.target = t < 0.3 ? fore : t < 0.5 ? lerpV(fore, pouch, (t - 0.3) / 0.2) : t < 0.72 ? lerpV(pouch, breech, (t - 0.5) / 0.22) : t < 0.86 ? V().copy(breech).add(V(0, 0.05 * seg(t, 0.72, 0.86), 0)) : lerpV(breech, fore, (t - 0.86) / 0.14);
      left.pose = t < 0.3 ? 'fore' : t < 0.48 ? 'reach' : t < 0.8 ? 'pinch' : t < 0.88 ? 'flat' : 'fore';
      return;
    }
    // magazine guns
    const well = toRoot((ud.magWell || V(0, -0.06, -0.1)).clone().add(V(0, -0.05, 0)));
    const mag = P.mag;
    if (mag) {
      const rest = mag.userData.rest.p;
      // out: slide down; gone while the hand is at the pouch; in: back up
      if (t > 0.14 && t < 0.3) mag.position.y = rest.y - sm(seg(t, 0.14, 0.3)) * 0.35;
      mag.visible = !(t >= 0.3 && t < 0.42);
      if (t >= 0.42 && t < 0.6) mag.position.y = rest.y - (1 - sm(seg(t, 0.42, 0.6))) * 0.18;
      if (!this.dropped && t > 0.22) { this.dropped = true; this.dropMag(); }
      if (P.magL) { P.magL.position.y = mag.position.y; P.magL.visible = mag.visible; }
    }
    const handle = P.bolt ? toRoot(P.bolt.position.clone().add(V(0.0, 0.0, 0.0))) : well;
    const charge = this.reloadEmpty && P.bolt;
    if (this.kind === 'pistol' && P.slide && this.reloadEmpty && t > 0.7) {
      // rack the slide over the top
      const sl = toRoot(V(0, 0.03, 0.02));
      P.slide.position.z = P.slide.userData.rest.p.z + 0.05 * bell(seg(t, 0.75, 0.9));
      left.target = t < 0.75 ? lerpV(well, sl, (t - 0.7) / 0.05) : t < 0.9 ? V().copy(sl).add(V(0, 0, 0.05 * bell(seg(t, 0.75, 0.9)))) : lerpV(sl, fore, (t - 0.9) / 0.1);
      left.pose = t < 0.9 ? 'pinch' : 'cup';
      left.up = V(0, -1, 0);
      return;
    }
    if (P.slide && t > 0.6 && !this.reloadEmpty) P.slide.position.z = P.slide.userData.rest.p.z;
    // fingers: reach for the mag, hold it, reach into the pouch, hold the fresh one, slap it home, pinch the handle
    left.pose = t < 0.1 ? 'reach' : t < 0.3 ? 'mag' : t < 0.38 ? 'reach' : t < 0.6 ? 'mag' : t < 0.66 ? 'flat' : t < 0.72 && this.reloadEmpty ? 'reach' : t < 0.88 && this.reloadEmpty ? 'pinch' : 'reach';
    if (t < 0.12) left.target = lerpV(fore, well, t / 0.12);
    else if (t < 0.3) left.target = V().copy(well).add(V(0, -sm(seg(t, 0.12, 0.3)) * 0.2, 0));
    else if (t < 0.42) left.target = lerpV(V().copy(well).add(V(0, -0.2, 0)), pouch, (t - 0.3) / 0.12);
    else if (t < 0.6) left.target = lerpV(pouch, well, (t - 0.42) / 0.18);
    else if (t < 0.66) left.target = V().copy(well).add(V(0, 0.015 * bell(seg(t, 0.6, 0.66)), 0)); // slap
    else if (charge && t < 0.88) {
      const pull = bell(seg(t, 0.74, 0.86));
      if (P.bolt) P.bolt.position.z = P.bolt.userData.rest.p.z + pull * (this.def.id === 'xm9' || this.def.shape === 'rifle_pump' ? 0.08 : 0.1);
      const hp = toRoot(P.bolt.position.clone());
      left.target = t < 0.74 ? lerpV(well, hp, (t - 0.66) / 0.08) : hp;
      left.up = V(0, -1, 0);
    } else left.target = lerpV(charge ? handle : well, fore, (t - (charge ? 0.88 : 0.66)) / (charge ? 0.12 : 0.34));
  }

  reloadDone(st) {
    // revolver closes with a flick once loading stops
    if (this.cylOpen > 0 && !(st.reload > 0)) {
      this.cylOpen = Math.max(0, this.cylOpen - 0.12);
      if (this.P.crane) this.P.crane.rotation.z = -1.1 * sm(this.cylOpen);
      if (this.cylOpen > 0) this.model.rotation.z += 0.3 * bell(this.cylOpen);
    }
    this.lastReload = 0;
  }

  dropMag() {
    const mag = this.P.mag;
    if (!mag || !this.onDropMag) return;
    this.model.updateMatrixWorld(true);
    const wp = mag.getWorldPosition(V()), wq = mag.getWorldQuaternion(new THREE.Quaternion());
    const clone = mag.clone(true);
    clone.position.set(0, 0, 0); clone.rotation.set(0, 0, 0);
    clone.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.onDropMag(clone, wp, wq, S);
  }

  // pump-action rack / bolt-action cycle after a shot (or the Patriot switching feeds)
  animPump(st, right, left) {
    const t = st.pump, P = this.P, d = this.def;
    const toRoot = (v) => v.applyMatrix4(this.model.matrix);
    if (d.mode === 'bolt' && P.bolt) {
      const lift = sm(seg(t, 0.0, 0.2)) * (1 - sm(seg(t, 0.8, 1.0)));
      const pull = sm(seg(t, 0.2, 0.45)) * (1 - sm(seg(t, 0.55, 0.8)));
      P.bolt.rotation.z = 1.2 * lift;
      P.bolt.position.z = P.bolt.userData.rest.p.z + pull * 0.11;
      if (!this.boltEjected && t > 0.45) { this.boltEjected = true; this.eject('big', 0.8); }
      if (t < 0.1) this.boltEjected = false;
      right.target = toRoot(P.bolt.position.clone().add(V(0.042, 0.0, 0.0)));
      this.model.rotation.z -= 0.15 * bell(t);
      return;
    }
    if (P.pump) {
      const k = bell(t);
      P.pump.position.z = P.pump.userData.rest.p.z + k * 0.09;
      if (!this.pumpEjected && t > 0.45) { this.pumpEjected = true; this.eject(d.ammoClass === 'shotgun' || d.tube ? 'shell' : 'rifle', 0.9); }
      if (t < 0.1) this.pumpEjected = false;
      this.model.position.z += 0.012 * k;
      this.model.rotation.x += 0.03 * k;
    }
  }

  // ---------------------------------------------------------------- melee / throws
  animSwing(st) {
    const t = st.swing, d = this.def;
    if (t < this.lastSwing) this.swingSide = -this.swingSide;
    if (!this.lastSwing || t < this.lastSwing) this.swingSide = this.swingSide || 1;
    this.lastSwing = t;
    const out = { p: V(), rx: 0, ry: 0, rz: 0 };
    if (d.throwable) {
      // wind up over the shoulder, snap forward, follow through
      const w = sm(seg(t, 0, 0.4)), thr = sm(seg(t, 0.4, 0.6)), f = seg(t, 0.6, 1);
      out.p.set(0.05 * w - 0.1 * thr, 0.12 * w - 0.2 * thr + 0.1 * f, 0.15 * w - 0.35 * thr + 0.2 * f);
      out.rx = 1.1 * w - 1.9 * thr + 0.8 * f;
      return out;
    }
    if (d.shape === 'hatchet') {
      // overhead chop
      const up = sm(seg(t, 0, 0.35)), down = sm(seg(t, 0.35, 0.55)), rec = sm(seg(t, 0.6, 1));
      out.p.set(-0.05 * up, 0.25 * up - 0.35 * down + 0.1 * rec, 0.05 * up - 0.15 * down + 0.1 * rec);
      out.rx = 1.3 * up - 2.2 * down + 0.9 * rec;
      out.rz = 0.2 * up;
      return out;
    }
    // knife: diagonal slash, alternating direction
    const s = this.swingSide;
    const wind = sm(seg(t, 0, 0.3)), cut = sm(seg(t, 0.3, 0.55)), rec = sm(seg(t, 0.6, 1));
    out.p.set(s * (0.12 * wind - 0.32 * cut + 0.2 * rec), 0.08 * wind - 0.12 * cut + 0.04 * rec, 0.02 * wind - 0.12 * cut + 0.1 * rec);
    out.ry = s * (0.6 * wind - 1.5 * cut + 0.9 * rec);
    out.rz = s * (0.5 * wind - 0.9 * cut + 0.4 * rec);
    out.rx = -0.3 * cut + 0.3 * rec;
    return out;
  }

  // ---------------------------------------------------------------- medical
  animMed(dt, st, pos, left) {
    const id = st.busyKind || 'bandage', t = st.busy;
    if (this.medId !== id) { this.dropMed(); this.med = medModel(id); this.med.matrixAutoUpdate = false; this.root.add(this.med); this.medId = id; }
    const k = sm(seg(t, 0, 0.12)) * (1 - sm(seg(t, 0.9, 1)));
    let hand;
    left.pose = id === 'adrenaline' || id === 'numbing' || id === 'scalpel' ? 'syringe' : id === 'tourniquet' ? 'pinch' : 'hold';
    const base = V(-0.07, -0.1, -0.42);
    if (id === 'adrenaline' || id === 'numbing') {
      // into the thigh: raise, stab, push the plunger
      const stab = sm(seg(t, 0.35, 0.45)), out = sm(seg(t, 0.75, 0.85));
      hand = V().copy(base).add(V(0.0, 0.05 * k - 0.35 * stab + 0.35 * out, 0.1 * stab - 0.1 * out));
      if (this.med.userData.plunger) this.med.userData.plunger.position.z = 0.065 - 0.05 * seg(t, 0.45, 0.7);
      left.fwd = V(0, -0.7 + stab, -0.5).normalize(); left.up = V(1, 0, 0);
    } else if (id === 'medkit') {
      hand = V().copy(base).add(V(0, Math.sin(this.t * 3) * 0.01, 0));
      left.fwd = V(0.2, 0.3, -1).normalize(); left.up = V(0, 1, 0.3).normalize();
    } else if (id === 'meat') {
      const bite = bell(seg(t, 0.3, 0.5)) + bell(seg(t, 0.55, 0.75));
      hand = V().copy(base).add(V(0.06 * bite, 0.12 * bite, 0.18 * bite));
      left.fwd = V(0.3, 0.2, -1).normalize(); left.up = V(0, 1, 0);
    } else if (id === 'tourniquet') {
      const pull = bell(seg(t, 0.4, 0.8));
      hand = V().copy(base).add(V(-0.05 - 0.08 * pull, -0.1, 0.05));
      left.fwd = V(-0.3, -0.4, -1).normalize(); left.up = V(0, 1, 0);
    } else {
      // bandage / gauze: wind around the limb
      const a = this.t * 7;
      hand = V().copy(base).add(V(Math.cos(a) * 0.06, -0.03 + Math.sin(a) * 0.04, 0));
      left.fwd = V(Math.cos(a) * 0.4, Math.sin(a) * 0.4, -1).normalize(); left.up = V(0, 1, 0);
      if (this.med.userData.tail) this.med.userData.tail.rotation.x = 0.2 + Math.sin(a * 2) * 0.4;
    }
    hand.y -= (1 - k) * 0.35;
    left.target = hand;
    return k;
  }

  dropMed() {
    if (this.med) { this.root.remove(this.med); this.med = null; this.medId = null; }
  }

  // ---------------------------------------------------------------- IK arms (root space)
  solveArm(side, shoulder, target, fwd, up, onGun) {
    const R = side === 'R';
    const reach = (ARM.upper + ARM.fore) * 0.97;
    // the wrist sits behind the grip point along the weapon
    const wrist = V().copy(target).addScaledVector(fwd, -0.075).addScaledVector(up, 0.012);
    const sh = shoulder.clone();
    if (sh.distanceTo(wrist) > reach) sh.copy(wrist).add(V().subVectors(sh, wrist).setLength(reach)); // shoulders follow out of view
    const elbow = V(), end = V();
    const pole = V(R ? 0.6 : -0.6, -1, 0.25);
    ik(sh, wrist, ARM.upper, ARM.fore, pole, elbow, end);
    const m = this.arm;
    const place = (mesh, a, b, z) => {
      const y = V().subVectors(b, a).normalize();
      const zz = V().copy(z).addScaledVector(y, -z.dot(y)).normalize();
      const x = V().crossVectors(y, zz);
      mesh.matrix.makeBasis(x, y, zz).setPosition(a);
      mesh.matrixWorldNeedsUpdate = true;
    };
    place(R ? m.upR : m.upL, sh, elbow, V(0, 1, 0));
    place(R ? m.foR : m.foL, elbow, end, V(0, 1, 0));
    // hand: +Z along fingers (the weapon's forward, tipped down into the grip), +Y back of the hand
    const hf = onGun ? V().copy(fwd).addScaledVector(up, -0.6).normalize() : V().copy(fwd).normalize();
    const hu = onGun ? V().copy(up).applyAxisAngle(fwd, R ? -0.5 : 0.5) : V().copy(up);
    const z = hf, y = V().copy(hu).addScaledVector(z, -hu.dot(z)).normalize(), x = V().crossVectors(y, z);
    (R ? m.hR : m.hL).matrix.makeBasis(x, y, z).setPosition(end);
    (R ? m.hR : m.hL).matrixWorldNeedsUpdate = true;
  }
}

let FLASH = null;
function flashTexture() {
  if (FLASH) return FLASH;
  const n = 128, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  grd.addColorStop(0, 'rgba(255,255,230,1)'); grd.addColorStop(0.25, 'rgba(255,200,90,0.9)'); grd.addColorStop(0.6, 'rgba(255,120,30,0.35)'); grd.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = grd;
  for (let i = 0; i < 7; i++) { g.save(); g.translate(n / 2, n / 2); g.rotate((i / 7) * Math.PI * 2); g.scale(1, 0.25 + Math.random() * 0.2); g.beginPath(); g.arc(0, 0, n / 2, 0, Math.PI * 2); g.fill(); g.restore(); }
  FLASH = new THREE.CanvasTexture(c);
  FLASH.colorSpace = THREE.SRGBColorSpace;
  return FLASH;
}
