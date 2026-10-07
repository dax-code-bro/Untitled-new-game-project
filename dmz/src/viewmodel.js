// First-person weapon model attached to the camera: ADS, sway, bob, recoil, reload/switch animations.
import * as THREE from 'three';
import { lerp } from './rng.js';

const MAT = {
  dark: new THREE.MeshLambertMaterial({ color: 0x3b3e44 }),
  metal: new THREE.MeshLambertMaterial({ color: 0x5c6068 }),
  wood: new THREE.MeshLambertMaterial({ color: 0x7a4a26 }),
  tan: new THREE.MeshLambertMaterial({ color: 0x8c7a5a }),
  skin: new THREE.MeshLambertMaterial({ color: 0xc8956a }),
  glove: new THREE.MeshLambertMaterial({ color: 0x3a3a32 }),
  lens: new THREE.MeshBasicMaterial({ color: 0x88aaff }),
};

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export function buildGunMesh(def, scale = 1) {
  const g = new THREE.Group();
  const L = def.len;
  const body = def.wood ? MAT.wood : def.shotgun ? MAT.tan : MAT.dark;
  if (def.pistol) {
    box(0.04, 0.05, 0.2, MAT.dark, 0, 0.02, -0.06, g);
    box(0.035, 0.11, 0.05, MAT.dark, 0, -0.05, 0.02, g).rotation.x = 0.2;
    box(0.012, 0.015, 0.012, MAT.metal, 0, 0.052, -0.15, g);
    g.userData.muzzleZ = -0.17;
    g.userData.sightY = 0.06;
  } else {
    box(0.06, 0.08, L * 0.45, body, 0, 0, -L * 0.12, g);
    box(0.026, 0.026, L * 0.55, MAT.metal, 0, 0.015, -L * 0.12 - L * 0.48, g);
    if (def.shotgun) box(0.045, 0.04, L * 0.3, MAT.dark, 0, -0.035, -L * 0.45, g);
    else box(0.04, 0.05, L * 0.28, body, 0, -0.01, -L * 0.42, g); // handguard
    if (!def.shotgun) box(0.035, 0.15, 0.06, MAT.dark, 0, -0.1, -L * 0.1, g).rotation.x = def.wood ? 0.3 : 0.1;
    box(0.035, 0.1, 0.045, MAT.dark, 0, -0.07, 0.07, g).rotation.x = 0.3;
    box(0.04, 0.075, 0.22, def.wood ? MAT.wood : MAT.dark, 0, -0.02, 0.2, g);
    if (def.scope) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.24, 10), MAT.dark);
      s.rotation.x = Math.PI / 2; s.position.set(0, 0.075, -0.08); g.add(s);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 10), MAT.lens);
      lens.position.set(0, 0.075, -0.201); lens.rotation.y = Math.PI; g.add(lens);
      g.userData.sightY = 0.075;
    } else {
      box(0.03, 0.035, 0.05, MAT.dark, 0, 0.055, -0.02, g);
      box(0.008, 0.02, 0.008, MAT.metal, 0, 0.055, -L * 0.62, g);
      g.userData.sightY = 0.074;
    }
    g.userData.muzzleZ = -L * 0.12 - L * 0.76;
  }
  g.scale.setScalar(scale);
  return g;
}

export class Viewmodel {
  constructor(camera) {
    this.root = new THREE.Group();
    camera.add(this.root);
    this.gun = null;
    this.kickT = 0;
    this.flashT = 0;
    this.raise = 0;
    this.sway = new THREE.Vector2();
    this.flash = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.05, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    this.light = new THREE.PointLight(0xffb060, 0, 9, 1.5);
    this.muzzle = new THREE.Object3D();
  }

  setWeapon(def) {
    if (this.gun) this.root.remove(this.gun);
    const g = buildGunMesh(def);
    // hands
    box(0.07, 0.07, 0.12, MAT.glove, 0.0, -0.08, def.pistol ? 0.03 : 0.08, g);
    if (!def.pistol) box(0.07, 0.06, 0.12, MAT.glove, 0.0, -0.045, -def.len * 0.42, g);
    box(0.08, 0.08, 0.35, MAT.tan, 0.05, -0.12, def.pistol ? 0.22 : 0.27, g);
    this.muzzle.position.set(0, 0.015, g.userData.muzzleZ);
    g.add(this.muzzle);
    this.flash.position.copy(this.muzzle.position);
    this.light.position.copy(this.muzzle.position);
    g.add(this.flash); g.add(this.light);
    this.flash.visible = false;
    const S = 0.52;
    g.scale.setScalar(S);
    this.gun = g;
    this.def = def;
    this.sightY = g.userData.sightY * S;
    this.root.add(g);
    this.raise = 0;
  }

  kick() { this.kickT = 1; this.flashT = 0.045; this.flash.rotation.z = Math.random() * 3; }

  muzzleWorld(v) { return this.muzzle.getWorldPosition(v); }

  update(dt, st) {
    if (!this.gun) return;
    const a = st.adsT;
    this.raise = Math.min(1, this.raise + dt * 3.2);
    this.kickT = Math.max(0, this.kickT - dt * 10);
    this.sway.x = lerp(this.sway.x, -st.mdx * 0.0006, Math.min(1, dt * 10));
    this.sway.y = lerp(this.sway.y, st.mdy * 0.0006, Math.min(1, dt * 10));
    const swayK = 1 - a * 0.85;
    const bob = st.moving ? Math.sin(st.bob) * 0.012 * swayK : 0;
    const bobY = st.moving ? Math.abs(Math.cos(st.bob)) * 0.01 * swayK : 0;
    const hip = [0.12, -0.12, -0.3];
    const ads = [0, -this.sightY, -0.17];
    let x = lerp(hip[0], ads[0], a) + bob + this.sway.x * swayK;
    let y = lerp(hip[1], ads[1], a) - bobY + this.sway.y * swayK - (1 - this.raise) * 0.25;
    let z = lerp(hip[2], ads[2], a) + this.kickT * (this.def.shotgun || this.def.scope ? 0.07 : 0.035);
    let rx = this.kickT * 0.05, ry = 0, rz = 0;
    if (st.sprint > 0) { x += 0.05 * st.sprint; y -= 0.05 * st.sprint; ry = 0.7 * st.sprint; rx -= 0.25 * st.sprint; }
    if (st.reload > 0) { const s = Math.sin(Math.PI * st.reload); y -= 0.12 * s; rx += 0.6 * s; rz = 0.4 * s; }
    if (st.plate > 0) { const s = Math.sin(Math.PI * st.plate); y -= 0.25 * s; }
    this.root.position.set(x, y, z);
    this.root.rotation.set(rx, ry, rz);
    this.root.visible = !(this.def.scope && a > 0.92);
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    this.light.intensity = this.flashT > 0 ? 6 : 0;
  }
}
