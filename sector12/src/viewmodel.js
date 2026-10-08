// Weapon/tool models (first-person, AI, printer display) and the first-person viewmodel animation.
import * as THREE from 'three';
import { ITEMS } from './data/catalog.js';
import { lerp } from './rng.js';

const matCache = new Map();
function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(k);
}
const BASIC = { lens: new THREE.MeshBasicMaterial({ color: 0x88aaff }), red: new THREE.MeshBasicMaterial({ color: 0xff2020 }), flare: new THREE.MeshBasicMaterial({ color: 0xff6a2a }) };

function box(w, h, d, m, x, y, z, parent, rx = 0) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  b.rotation.x = rx;
  parent.add(b);
  return b;
}
function cyl(r, len, m, x, y, z, parent, axis = 'z', seg = 10) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m);
  if (axis === 'z') c.rotation.x = Math.PI / 2;
  if (axis === 'x') c.rotation.z = Math.PI / 2;
  c.position.set(x, y, z);
  parent.add(c);
  return c;
}

// Builds a weapon/tool model. -Z is forward. Returns a group with userData {muzzleZ, sightY}.
// inst (optional): {att: {mag, optic}, camo}
export function buildItemModel(def, inst = null) {
  const g = new THREE.Group();
  const camo = inst && inst.camo ? ITEMS[inst.camo] : null;
  const dark = mat(camo ? camo.skin : 0x2e3136);
  const metal = mat(camo && camo.accent ? camo.accent : camo && camo.metal ? camo.skin : 0x5c6068);
  const wood = mat(camo ? camo.skin : 0x7a4a26);
  const tan = mat(camo ? camo.skin : 0x8c7a5a);
  let muzzleZ = -0.3, sightY = 0.07, railY = 0.05, railZ = -0.05;
  const shape = def.shape || 'pistol';
  const magMul = inst && inst.att && inst.att.mag ? ITEMS[inst.att.mag].magMul : 1;
  const drum = inst && inst.att && inst.att.mag === 'drum';
  const magBox = (x, y, z, w, h, d, m = dark, rx = 0) => {
    if (drum) cyl(0.07, 0.06, m, x, y - 0.03, z, g, 'x', 14);
    else box(w, h * (0.6 + 0.4 * magMul), d, m, x, y - (h * (magMul - 1)) * 0.2, z, g, rx);
  };
  switch (shape) {
    case 'pistol': case 'pistol_big': {
      const s = shape === 'pistol_big' ? 1.3 : 1;
      box(0.04 * s, 0.05 * s, 0.2 * s, dark, 0, 0.02 * s, -0.06 * s, g);
      box(0.035 * s, 0.11 * s, 0.05 * s, dark, 0, -0.05 * s, 0.02 * s, g, 0.2);
      if (magMul > 1) magBox(0, -0.12 * s, 0.03 * s, 0.03, 0.06, 0.04);
      box(0.012, 0.015, 0.012, metal, 0, 0.052 * s, -0.15 * s, g);
      muzzleZ = -0.17 * s; sightY = 0.06 * s; railY = 0.05 * s; railZ = -0.04;
      break;
    }
    case 'flaregun': {
      const o = mat(0xff6a1a);
      cyl(0.025, 0.2, o, 0, 0.02, -0.07, g);
      box(0.035, 0.11, 0.05, o, 0, -0.05, 0.03, g, 0.2);
      muzzleZ = -0.17; sightY = 0.055;
      break;
    }
    case 'revolver': case 'revolver_big': {
      const s = shape === 'revolver_big' ? 1.35 : 1;
      cyl(0.012 * s, 0.17 * s, metal, 0, 0.03 * s, -0.11 * s, g);
      box(0.02 * s, 0.03 * s, 0.17 * s, metal, 0, 0.045 * s, -0.11 * s, g);
      cyl(0.03 * s, 0.05 * s, metal, 0, 0.022 * s, -0.01 * s, g, 'z', 8);
      box(0.03 * s, 0.1 * s, 0.045 * s, wood, 0, -0.05 * s, 0.04 * s, g, 0.35);
      muzzleZ = -0.2 * s; sightY = 0.065 * s; railY = 0.06 * s; railZ = -0.06;
      break;
    }
    case 'dual': {
      for (const side of [-1, 1]) {
        const h = new THREE.Group(); h.position.x = side * 0.16; g.add(h);
        box(0.045, 0.06, 0.26, dark, 0, 0.02, -0.08, h);
        box(0.03, 0.1, 0.045, dark, 0, -0.05, 0.03, h, 0.2);
        box(0.025, 0.12, 0.035, dark, 0, -0.07, -0.08, h);
        cyl(0.012, 0.06, metal, 0, 0.03, -0.24, h);
      }
      muzzleZ = -0.27; sightY = 0.06;
      break;
    }
    case 'rifle': case 'rifle_wood': case 'rifle_pump': {
      const body = shape === 'rifle_wood' ? wood : dark;
      box(0.06, 0.08, 0.3, dark, 0, 0, -0.08, g);
      cyl(0.014, 0.36, metal, 0, 0.015, -0.42, g);
      box(0.055, 0.06, 0.2, body, 0, 0, -0.32, g);
      if (shape === 'rifle_wood') magBox(0, -0.1, -0.13, 0.035, 0.16, 0.06, dark, -0.35);
      else magBox(0, -0.1, -0.1, 0.035, 0.15, 0.06);
      box(0.035, 0.1, 0.045, dark, 0, -0.07, 0.06, g, 0.3);
      box(0.045, 0.08, 0.24, body, 0, -0.02, 0.18, g);
      if (shape === 'rifle_pump') {
        cyl(0.016, 0.3, metal, 0, -0.04, -0.36, g); // shotgun tube
        box(0.06, 0.05, 0.12, mat(0x3a3a32), 0, -0.045, -0.3, g).name = 'pump';
      }
      if (shape === 'rifle_wood') box(0.008, 0.025, 0.008, metal, 0, 0.055, -0.5, g);
      muzzleZ = -0.6; sightY = 0.074; railY = 0.05; railZ = -0.07;
      break;
    }
    case 'shotgun': case 'shotgun_semi': {
      const body = shape === 'shotgun' ? wood : dark;
      box(0.06, 0.07, 0.24, dark, 0, 0, -0.08, g);
      cyl(0.017, 0.5, metal, 0, 0.02, -0.43, g);
      cyl(0.016, 0.4, metal, 0, -0.02, -0.38, g);
      box(0.055, 0.045, 0.14, shape === 'shotgun' ? tan : dark, 0, -0.025, -0.34, g).name = 'pump';
      box(0.04, 0.08, 0.26, body, 0, -0.03, 0.17, g, 0.08);
      muzzleZ = -0.68; sightY = 0.06; railY = 0.04;
      break;
    }
    case 'breaker': {
      cyl(0.02, 0.62, metal, 0, 0.02, -0.4, g);
      box(0.05, 0.06, 0.14, metal, 0, 0, -0.04, g);
      box(0.045, 0.085, 0.32, wood, 0, -0.03, 0.18, g, 0.12);
      box(0.04, 0.03, 0.22, wood, 0, -0.01, -0.22, g);
      muzzleZ = -0.72; sightY = 0.055; railY = 0.045; railZ = -0.1;
      break;
    }
    case 'sniper': {
      box(0.07, 0.09, 0.4, dark, 0, 0, -0.06, g);
      cyl(0.022, 0.62, metal, 0, 0.02, -0.56, g);
      box(0.05, 0.04, 0.07, metal, 0, 0.02, -0.89, g); // muzzle brake
      magBox(0, -0.09, -0.05, 0.045, 0.1, 0.09);
      box(0.05, 0.1, 0.32, dark, 0, -0.02, 0.27, g);
      box(0.01, 0.12, 0.01, metal, 0.03, -0.08, -0.5, g, -0.5);
      box(0.01, 0.12, 0.01, metal, -0.03, -0.08, -0.5, g, -0.5);
      muzzleZ = -0.93; sightY = 0.09; railY = 0.06; railZ = -0.06;
      break;
    }
    case 'knife': {
      box(0.012, 0.03, 0.17, mat(0xc8ccd0), 0, 0.01, -0.13, g);
      box(0.025, 0.035, 0.11, mat(0x2a2420), 0, 0, 0.0, g);
      muzzleZ = -0.23; sightY = 0.05;
      break;
    }
    case 'hatchet': {
      box(0.03, 0.03, 0.38, wood, 0, 0, -0.12, g);
      box(0.012, 0.11, 0.08, mat(0xb8bcc0), 0, 0.05, -0.29, g);
      muzzleZ = -0.32; sightY = 0.05;
      break;
    }
    default:
      box(0.1, 0.1, 0.1, dark, 0, 0, 0, g);
  }
  // optics
  const optic = (inst && inst.att && inst.att.optic) || def.builtinOptic;
  if (optic && !def.melee) {
    const o = ITEMS[optic];
    if (o.scoped || optic === 'scope1') {
      const len = optic === 'scope10' ? 0.32 : optic === 'scope6' ? 0.27 : optic === 'scope4' ? 0.22 : 0.16;
      const r = optic === 'scope10' ? 0.032 : 0.026;
      cyl(r, len, mat(0x1a1c1f), 0, railY + r + 0.012, railZ, g, 'z', 12);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(r * 0.85, 12), BASIC.lens);
      lens.position.set(0, railY + r + 0.012, railZ - len / 2 - 0.001); lens.rotation.y = Math.PI; g.add(lens);
      sightY = railY + r + 0.012;
    } else {
      box(0.032, 0.035, 0.05, mat(0x1a1c1f), 0, railY + 0.017, railZ, g);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.003, 6, 4), BASIC.red);
      dot.position.set(0, railY + 0.028, railZ - 0.026); g.add(dot);
      sightY = railY + 0.028;
    }
  }
  g.userData.muzzleZ = muzzleZ;
  g.userData.sightY = sightY;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Viewmodel {
  constructor(camera) {
    this.root = new THREE.Group();
    camera.add(this.root);
    this.model = null;
    this.kickT = 0;
    this.flashT = 0;
    this.raise = 0;
    this.sway = new THREE.Vector2();
    this.flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.95, depthWrite: false }));
    this.light = new THREE.PointLight(0xffb060, 0, 9, 1.5);
    this.muzzle = new THREE.Object3D();
    this.def = null;
  }

  // def: catalog def; inst: inventory instance (attachments/camo) or null for empty hands
  set(def, inst) {
    if (this.model) this.root.remove(this.model);
    this.model = null;
    this.def = def;
    if (!def) return;
    const g = buildItemModel(def, inst);
    const glove = mat(0x3a3a32), sleeve = mat(0x5a5a46);
    if (def.shape === 'dual') {
      for (const s of [-1, 1]) { box(0.07, 0.07, 0.12, glove, s * 0.16, -0.08, 0.03, g); box(0.08, 0.08, 0.35, sleeve, s * 0.18, -0.12, 0.22, g); }
    } else {
      box(0.07, 0.07, 0.12, glove, 0, -0.08, def.melee || def.shape?.startsWith('pistol') || def.shape?.startsWith('revolver') ? 0.03 : 0.08, g);
      if (['rifle', 'rifle_wood', 'rifle_pump', 'shotgun', 'shotgun_semi', 'breaker', 'sniper'].includes(def.shape)) box(0.07, 0.06, 0.12, glove, 0, -0.05, -0.32, g);
      if (!def.melee && !def.shape?.startsWith('pistol') && !def.shape?.startsWith('revolver') && def.shape !== 'flaregun') box(0.08, 0.08, 0.35, sleeve, 0.05, -0.12, 0.25, g);
      else box(0.07, 0.07, 0.2, sleeve, 0.02, -0.1, 0.16, g);
    }
    this.muzzle.position.set(0, 0.015, g.userData.muzzleZ);
    g.add(this.muzzle);
    this.flash.position.copy(this.muzzle.position);
    this.light.position.copy(this.muzzle.position);
    g.add(this.flash, this.light);
    this.flash.visible = false;
    const small = !['rifle', 'rifle_wood', 'rifle_pump', 'shotgun', 'shotgun_semi', 'breaker', 'sniper'].includes(def.shape);
    const S = small ? 0.42 : 0.5;
    g.scale.setScalar(S);
    g.traverse((o) => { o.castShadow = false; });
    this.model = g;
    this.sightY = g.userData.sightY * S;
    this.pump = g.getObjectByName('pump');
    this.root.add(g);
    this.raise = 0;
  }

  kick() { this.kickT = 1; this.flashT = 0.045; this.flash.rotation.z = Math.random() * 3; }
  muzzleWorld(v) { return this.muzzle.getWorldPosition(v); }

  update(dt, st) {
    if (!this.model) return;
    const a = st.adsT;
    this.raise = Math.min(1, this.raise + dt * 3.2);
    this.kickT = Math.max(0, this.kickT - dt * 10);
    this.sway.x = lerp(this.sway.x, -st.mdx * 0.0006, Math.min(1, dt * 10));
    this.sway.y = lerp(this.sway.y, st.mdy * 0.0006, Math.min(1, dt * 10));
    const swayK = 1 - a * 0.85;
    const bob = st.moving ? Math.sin(st.bob) * 0.012 * swayK : 0;
    const bobY = st.moving ? Math.abs(Math.cos(st.bob)) * 0.01 * swayK : 0;
    const dual = this.def.shape === 'dual';
    const small = this.def.melee || ['pistol', 'pistol_big', 'revolver', 'revolver_big', 'flaregun'].includes(this.def.shape);
    const hip = dual ? [0, -0.13, -0.32] : small ? [0.13, -0.13, -0.36] : [0.12, -0.12, -0.32];
    const ads = dual ? [0, -0.1, -0.26] : [0, -this.sightY, -0.17];
    let x = lerp(hip[0], ads[0], a) + bob + this.sway.x * swayK;
    let y = lerp(hip[1], ads[1], a) - bobY + this.sway.y * swayK - (1 - this.raise) * 0.25;
    let z = lerp(hip[2], ads[2], a) + this.kickT * (this.def.recoil > 0.04 ? 0.07 : 0.035);
    let rx = this.kickT * 0.05, ry = 0, rz = 0;
    if (st.sprint > 0) { x += 0.05 * st.sprint; y -= 0.05 * st.sprint; ry = 0.7 * st.sprint; rx -= 0.25 * st.sprint; }
    if (st.reload > 0) { const s = Math.sin(Math.PI * st.reload); y -= 0.12 * s; rx += 0.6 * s; rz = 0.4 * s; }
    if (st.busy > 0) { const s = Math.sin(Math.PI * st.busy); y -= 0.25 * s; }
    if (st.swing > 0) { const s = Math.sin(Math.PI * st.swing); x -= 0.12 * s; z -= 0.18 * s; ry = 0.9 * s; rx -= 0.4 * s; }
    if (this.pump) this.pump.position.z = (this.def.shape === 'rifle_pump' ? -0.3 : -0.34) + (st.pump > 0 ? Math.sin(Math.PI * st.pump) * 0.08 : 0);
    this.root.position.set(x, y, z);
    this.root.rotation.set(rx, ry, rz);
    this.root.visible = !(st.scoped && a > 0.92);
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    this.light.intensity = this.flashT > 0 ? 6 : 0;
  }
}
