// Procedural character animation.
//
// Nothing here is a canned clip: every frame the rig solves a pose from what the body is doing.
// Feet are planted in the world and stepped with a gait cycle (no foot sliding, they follow the
// terrain), legs and arms are two-bone IK, the pelvis bobs/sways/leans with speed and acceleration,
// the spine twists into a bladed shooting stance, hands stay on the weapon's grip and handguard,
// reloads move the support hand and the magazine, recoil and hit flinches are springs, and on death
// the same joints become a verlet ragdoll that collapses onto the terrain.
//
// Body parts are meshes modelled along +Y (segment axis) with +Z as "front"; each frame they are
// placed between joints with orient().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt } from './terrain.js';
import { buildWeapon, compactWeapon, restParts } from './weapons.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- math helpers
const _ox = V(), _oy = V(), _oz = V();
// Set o.matrix: origin p, local +Y along yAxis, local +Z as close to zHint as possible.
export function orient(o, p, yAxis, zHint, sy = 1) {
  _oy.copy(yAxis);
  if (_oy.lengthSq() < 1e-10) _oy.set(0, 1, 0);
  _oy.normalize();
  _oz.copy(zHint).addScaledVector(_oy, -zHint.dot(_oy));
  if (_oz.lengthSq() < 1e-8) { _oz.set(0, 0, 1).addScaledVector(_oy, -_oy.z); if (_oz.lengthSq() < 1e-8) _oz.set(1, 0, 0); }
  _oz.normalize();
  _ox.crossVectors(_oy, _oz);
  const e = o.matrix.elements;
  e[0] = _ox.x; e[1] = _ox.y; e[2] = _ox.z; e[3] = 0;
  e[4] = _oy.x * sy; e[5] = _oy.y * sy; e[6] = _oy.z * sy; e[7] = 0;
  e[8] = _oz.x; e[9] = _oz.y; e[10] = _oz.z; e[11] = 0;
  e[12] = p.x; e[13] = p.y; e[14] = p.z; e[15] = 1;
  o.matrixWorldNeedsUpdate = true;
}

const _d = V(), _b = V();
// Two-bone IK: root A reaching for T with bone lengths l1, l2; the middle joint bends towards pole.
export function ik(A, T, l1, l2, pole, mid, end) {
  _d.subVectors(T, A);
  let dist = _d.length();
  dist = clamp(dist, Math.abs(l1 - l2) + 0.01, (l1 + l2) * 0.999);
  if (_d.lengthSq() < 1e-10) _d.set(0, -1, 0);
  _d.normalize();
  end.copy(A).addScaledVector(_d, dist);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _b.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_b.lengthSq() < 1e-8) _b.set(0, 0, 1);
  _b.normalize();
  mid.copy(A).addScaledVector(_d, a).addScaledVector(_b, h);
}

// Critically damped spring on a vector.
export class Spring {
  constructor(k = 120, d = null) { this.x = V(); this.v = V(); this.k = k; this.d = d ?? 2 * Math.sqrt(k); }
  update(dt, target = null) {
    const ax = (target ? target.x : 0) - this.x.x, ay = (target ? target.y : 0) - this.x.y, az = (target ? target.z : 0) - this.x.z;
    this.v.x += (ax * this.k - this.v.x * this.d) * dt; this.v.y += (ay * this.k - this.v.y * this.d) * dt; this.v.z += (az * this.k - this.v.z * this.d) * dt;
    this.x.addScaledVector(this.v, dt);
    return this.x;
  }
  kick(x, y, z) { this.v.x += x; this.v.y += y; this.v.z += z; }
}

// Ground under a body: terrain, or the floor it's standing on when that's well above the terrain.
export function groundAt(x, z, floorY = null) {
  const h = heightAt(x, z);
  return floorY !== null && floorY > h + 0.25 ? floorY : h;
}

// ---------------------------------------------------------------- verlet ragdoll
// particles: [{p, q (previous), r (radius), m (inverse mass)}], links: [[i, j, len, stiffness, kind]]
// kind 0 = rigid distance, 1 = minimum distance only (stops limbs folding through themselves)
export class Verlet {
  constructor(points, links, floorY) {
    this.P = points.map((p) => ({ p: p.p.clone(), q: p.p.clone().sub(p.v || V()), r: p.r || 0.06, m: p.m ?? 1 }));
    this.L = links;
    this.floorY = floorY;
    this.sleep = 0;
    this.asleep = false;
    this.age = 0;
  }
  // origin: world position of the local frame the particles live in
  step(dt, origin) {
    if (this.asleep) return;
    dt = Math.min(dt, 1 / 30);
    this.age += dt;
    const g = -9.8 * dt * dt;
    let energy = 0;
    for (const a of this.P) {
      const vx = (a.p.x - a.q.x) * 0.995, vy = (a.p.y - a.q.y) * 0.995, vz = (a.p.z - a.q.z) * 0.995;
      a.q.copy(a.p);
      a.p.x += vx; a.p.y += vy + g; a.p.z += vz;
      energy += vx * vx + vy * vy + vz * vz;
    }
    for (let it = 0; it < 10; it++) {
      for (const l of this.L) {
        const A = this.P[l[0]], B = this.P[l[1]];
        const dx = B.p.x - A.p.x, dy = B.p.y - A.p.y, dz = B.p.z - A.p.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (l[4] === 1 && d >= l[2]) continue;
        const w = A.m + B.m;
        if (!w) continue;
        const k = ((d - l[2]) / d) * (l[3] ?? 1) / w;
        A.p.x += dx * k * A.m; A.p.y += dy * k * A.m; A.p.z += dz * k * A.m;
        B.p.x -= dx * k * B.m; B.p.y -= dy * k * B.m; B.p.z -= dz * k * B.m;
      }
      for (const a of this.P) {
        const gy = groundAt(origin.x + a.p.x, origin.z + a.p.z, this.floorY) - origin.y + a.r;
        if (a.p.y < gy) {
          a.p.y = gy;
          // ground friction: bleed off sliding
          a.q.x = lerp(a.q.x, a.p.x, 0.25); a.q.z = lerp(a.q.z, a.p.z, 0.25);
          if (a.q.y < a.p.y - 0.001) a.q.y = a.p.y + (a.p.y - a.q.y) * 0.15; // tiny bounce
        }
      }
    }
    this.sleep = energy < 2e-6 * this.P.length ? this.sleep + dt : 0;
    if (this.sleep > 1.2 || this.age > 20) this.asleep = true;
  }
  impulse(i, v) { const a = this.P[i]; if (a) { a.q.sub(v); this.asleep = false; this.sleep = 0; } }
}

// rigid cluster: every pair linked
export function rigid(links, idx, P) {
  for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) links.push([idx[a], idx[b], P[idx[a]].distanceTo(P[idx[b]]), 1, 0]);
}

// ---------------------------------------------------------------- textures: camo + fur
const TEXC = new Map();
export function camoTexture(palette) {
  const key = palette.join(',');
  if (TEXC.has(key)) return TEXC.get(key);
  const n = 256, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  g.fillStyle = palette[0]; g.fillRect(0, 0, n, n);
  let s = 1234;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let layer = 1; layer < palette.length; layer++) {
    g.fillStyle = palette[layer];
    for (let k = 0; k < 26; k++) {
      const x = rnd() * n, y = rnd() * n, r = 10 + rnd() * 22;
      for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
        g.beginPath();
        for (let a = 0; a < 9; a++) {
          const ang = (a / 9) * Math.PI * 2, rr = r * (0.55 + rnd() * 0.7);
          const px = x + ox + Math.cos(ang) * rr * 1.5, py = y + oy + Math.sin(ang) * rr;
          if (a === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath(); g.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  TEXC.set(key, t);
  return t;
}

export function furTexture() {
  if (TEXC.has('fur')) return TEXC.get('fur');
  const n = 256, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  g.fillStyle = '#b0b0b0'; g.fillRect(0, 0, n, n);
  let s = 99;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 5000; k++) {
    const x = rnd() * n, y = rnd() * n, l = 4 + rnd() * 9, v = Math.floor(120 + rnd() * 135);
    g.strokeStyle = `rgba(${v},${v},${v},0.55)`; g.lineWidth = 1 + rnd();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y + l); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  TEXC.set('fur', t);
  return t;
}

// ---------------------------------------------------------------- geometry helpers (shared)
export function prepGeo(g) {
  let n = g.index ? g.toNonIndexed() : g.clone();
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
}
// lathe around +Y. pts: [y, radius]; sx/sz scale the cross-section; zOff pushes it forward
export function limb(pts, sx = 1, sz = 1, seg = 14, zOff = 0) {
  const g = new THREE.LatheGeometry(pts.map(([y, r]) => new THREE.Vector2(Math.max(0.0005, r), y)), seg);
  g.scale(sx, 1, sz);
  if (zOff) g.translate(0, 0, zOff);
  g.computeVertexNormals();
  return g;
}
export function rboxGeo(w, h, d, r = 0.01) {
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const p = g.attributes.position, v = V(), c = V();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    const dd = v.sub(c);
    if (dd.lengthSq() > 0) dd.setLength(r);
    p.setXYZ(i, c.x + dd.x, c.y + dd.y, c.z + dd.z);
  }
  g.computeVertexNormals();
  return g;
}
export const at = (g, x, y, z, rx = 0, ry = 0, rz = 0, s = null) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), s ? new THREE.Vector3(...s) : new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
};
// parts: {matKey: [geometries]} -> one geometry with a group per material, and the material key order
export function mergeParts(parts) {
  const keys = Object.keys(parts).filter((k) => parts[k].length);
  const geos = keys.map((k) => mergeGeometries(parts[k].map(prepGeo), false));
  return { geo: mergeGeometries(geos, true), keys };
}

// ---------------------------------------------------------------- human body
export const HB = { thigh: 0.44, shin: 0.43, ankle: 0.085, hipW: 0.095, spine: 0.52, shW: 0.185, shDrop: 0.06, upper: 0.29, fore: 0.27, neck: 0.1, hipY: 0.985 };

let HUMAN_GEO = null;
function humanGeometry() {
  if (HUMAN_GEO) return HUMAN_GEO;
  const G = {};
  // torso from the pelvis (y=0) up to the neck base (y = spine): hips, waist, ribcage, chest, shoulders
  G.torso = (o) => {
    const p = { uni: [], vest: [], gear: [], pack: [] };
    p.uni.push(limb([[-0.13, 0.0], [-0.12, 0.1], [-0.06, 0.165], [0.02, 0.172], [0.12, 0.152], [0.24, 0.165], [0.34, 0.185], [0.43, 0.19], [0.48, 0.17], [0.515, 0.11], [0.53, 0.06], [0.54, 0.0]], 1, 0.64, 16));
    if (o.vest) {
      const lv = o.vest;
      const t = 0.03 + lv * 0.003;
      p.vest.push(at(rboxGeo(0.3, 0.3, t, 0.012), 0, 0.3, 0.125 + t / 2, 0.06));
      p.vest.push(at(rboxGeo(0.3, 0.32, t, 0.012), 0, 0.3, -0.12 - t / 2, -0.04));
      for (const s of [-1, 1]) {
        p.vest.push(at(rboxGeo(0.03, 0.14, 0.24, 0.008), s * 0.16, 0.23, 0)); // cummerbund
        p.vest.push(at(rboxGeo(0.05, 0.015, 0.25, 0.005), s * 0.1, 0.46, 0.0, 0, 0, s * 0.15)); // shoulder straps
      }
      // magazine pouches and a radio / admin pouch
      for (let i = -1; i <= 1; i++) p.gear.push(at(rboxGeo(0.072, 0.11, 0.04, 0.008), i * 0.08, 0.22, 0.16 + t));
      p.gear.push(at(rboxGeo(0.12, 0.08, 0.03, 0.008), 0.0, 0.36, 0.155 + t));
      if (lv >= 5) { p.gear.push(at(rboxGeo(0.06, 0.13, 0.05, 0.01), -0.17, 0.27, 0.07)); p.vest.push(at(rboxGeo(0.12, 0.06, 0.08, 0.02), 0, 0.535, 0.02)); } // radio + collar
      if (lv >= 8) for (const s of [-1, 1]) p.vest.push(at(rboxGeo(0.07, 0.1, 0.14, 0.02), s * 0.21, 0.42, 0, 0, 0, s * 0.35)); // shoulder armor
    }
    // belt with pouches
    p.gear.push(at(limb([[0, 0.172], [0.045, 0.172]], 1.04, 0.69, 16), 0, -0.02, 0));
    p.gear.push(at(rboxGeo(0.07, 0.08, 0.04, 0.008), 0.15, 0.0, 0.05, 0, 0.9));
    p.gear.push(at(rboxGeo(0.07, 0.08, 0.04, 0.008), -0.15, 0.0, 0.05, 0, -0.9));
    p.gear.push(at(rboxGeo(0.06, 0.07, 0.04, 0.008), -0.08, 0.0, -0.12));
    if (o.pack) {
      const s = 0.8 + o.pack * 0.06;
      const back = -0.125 - (o.vest ? 0.045 : 0.0) - 0.085 * s;
      p.pack.push(at(rboxGeo(0.3 * s, 0.4 * s, 0.17 * s, 0.04), 0, 0.3, back));
      p.pack.push(at(rboxGeo(0.26 * s, 0.12 * s, 0.07 * s, 0.025), 0, 0.17, back - 0.085 * s - 0.03));
      p.gear.push(at(rboxGeo(0.06, 0.4, 0.02, 0.008), 0.09, 0.32, -0.15));
      p.gear.push(at(rboxGeo(0.06, 0.4, 0.02, 0.008), -0.09, 0.32, -0.15));
    }
    return mergeParts(p);
  };
  // head: neck, skull, jaw, nose, ears. origin at the neck base, +Y up, +Z face
  G.head = (o) => {
    const p = { skin: [], uni: [], helm: [], dark: [], gear: [] };
    const face = o.balaclava ? p.uni : p.skin;
    face.push(limb([[0, 0.055], [0.1, 0.05], [0.12, 0.0]], 1, 1, 12));
    const skull = new THREE.SphereGeometry(0.105, 20, 14); skull.scale(0.92, 1.12, 1.02);
    face.push(at(skull, 0, 0.19, 0.01));
    const jaw = new THREE.SphereGeometry(0.07, 14, 10); jaw.scale(1.05, 0.9, 1.0);
    face.push(at(jaw, 0, 0.13, 0.04));
    if (!o.balaclava) {
      p.skin.push(at(new THREE.ConeGeometry(0.018, 0.045, 8), 0, 0.175, 0.112, Math.PI / 2 + 0.3));
      for (const s of [-1, 1]) p.skin.push(at(new THREE.SphereGeometry(0.025, 8, 6), s * 0.098, 0.185, 0.0, 0, 0, 0, [0.4, 1, 0.7]));
    }
    for (const s of [-1, 1]) p.dark.push(at(new THREE.SphereGeometry(0.011, 8, 6), s * 0.035, 0.2, 0.098));
    if (o.helmet) {
      const lv = o.helmet;
      const shell = new THREE.SphereGeometry(0.13, 22, 12, 0, Math.PI * 2, 0, Math.PI * (lv >= 6 ? 0.56 : 0.5));
      shell.scale(1, 0.95, 1.08);
      p.helm.push(at(shell, 0, 0.2, 0.0));
      p.helm.push(at(new THREE.TorusGeometry(0.128, 0.008, 6, 28), 0, 0.2 - (lv >= 6 ? 0.025 : 0), 0, Math.PI / 2, 0, 0, [1, 1.08, 1]));
      for (const s of [-1, 1]) p.gear.push(at(rboxGeo(0.012, 0.03, 0.09, 0.004), s * 0.128, 0.215, 0)); // rails
      p.gear.push(at(rboxGeo(0.04, 0.04, 0.02, 0.006), 0, 0.27, 0.125, -0.5)); // NVG mount
      if (lv >= 4) for (const s of [-1, 1]) p.gear.push(at(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 14), s * 0.112, 0.17, 0, 0, 0, Math.PI / 2)); // ear pro
      if (lv >= 7) { const visor = new THREE.SphereGeometry(0.14, 18, 8, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.45, Math.PI * 0.22); visor.scale(1, 1, 1.08); p.dark.push(at(visor, 0, 0.21, 0)); }
    } else if (o.cap) {
      const cap = new THREE.SphereGeometry(0.112, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.45); cap.scale(1, 0.9, 1.05);
      p.uni.push(at(cap, 0, 0.215, 0.005));
      p.uni.push(at(new THREE.CylinderGeometry(0.075, 0.08, 0.008, 16, 1, false, -Math.PI / 2, Math.PI), 0, 0.235, 0.09, 0.1));
    }
    if (o.goggles) {
      p.dark.push(at(rboxGeo(0.15, 0.045, 0.03, 0.012), 0, 0.2, 0.1));
      p.gear.push(at(new THREE.TorusGeometry(0.112, 0.008, 4, 24), 0, 0.2, 0.0, Math.PI / 2, 0, 0, [1, 1.08, 1]));
    }
    return mergeParts(p);
  };
  // limbs: along +Y from the proximal joint
  G.upper = () => mergeParts({ uni: [limb([[-0.03, 0.0], [-0.02, 0.05], [0.04, 0.062], [0.14, 0.055], [0.26, 0.046], [0.3, 0.0]], 1, 0.95, 12)], gear: [] });
  G.fore = () => mergeParts({ uni: [limb([[-0.02, 0.0], [-0.01, 0.046], [0.08, 0.048], [0.2, 0.04], [0.24, 0.038], [0.25, 0.0]], 1, 0.9, 12)], gear: [at(limb([[0, 0.034], [0.05, 0.036]], 1, 0.85, 12), 0, 0.22, 0)] });
  // gloved hand closed around a grip: origin at the wrist, +Z along the fingers, +Y back of the hand
  G.hand = () => {
    const p = { glove: [] };
    p.glove.push(at(rboxGeo(0.075, 0.03, 0.09, 0.012), 0, 0.0, 0.05));
    p.glove.push(at(rboxGeo(0.072, 0.045, 0.04, 0.014), 0, -0.022, 0.1, 0.5));
    p.glove.push(at(rboxGeo(0.024, 0.024, 0.06, 0.01), -0.04, -0.012, 0.055, 0.2, -0.5));
    return mergeParts(p);
  };
  G.thigh = (o) => {
    const p = { uni: [limb([[-0.04, 0.0], [-0.03, 0.08], [0.02, 0.092], [0.18, 0.08], [0.36, 0.062], [0.44, 0.055], [0.46, 0.0]], 1, 0.95, 14)], gear: [] };
    if (o && o.holster) { p.gear.push(at(rboxGeo(0.05, 0.16, 0.12, 0.012), 0.085, 0.16, 0.0)); p.gear.push(at(rboxGeo(0.03, 0.08, 0.05, 0.008), 0.1, 0.06, 0.03)); }
    return mergeParts(p);
  };
  G.shin = () => mergeParts({ uni: [limb([[-0.02, 0.0], [-0.01, 0.06], [0.1, 0.064], [0.25, 0.055], [0.38, 0.05], [0.43, 0.048], [0.44, 0.0]], 1, 0.95, 14)], gear: [at(rboxGeo(0.1, 0.12, 0.035, 0.012), 0, 0.04, 0.055)] });
  // boot: origin at the ankle, +Z toes, +Y up
  G.foot = () => {
    const p = { boot: [], sole: [] };
    p.sole.push(at(rboxGeo(0.105, 0.03, 0.29, 0.012), 0, -HB.ankle + 0.015, 0.05));
    p.boot.push(at(rboxGeo(0.1, 0.07, 0.25, 0.03), 0, -HB.ankle + 0.06, 0.055));
    p.boot.push(at(limb([[0, 0.058], [0.12, 0.055], [0.13, 0.0]], 1, 1.05, 12), 0, -HB.ankle + 0.04, -0.01));
    return mergeParts(p);
  };
  HUMAN_GEO = G;
  return G;
}

const HMAT = new Map();
function humanMaterials(o, T) {
  const key = [o.palette.join(','), o.skin, o.vestColor, o.helmColor].join('|');
  if (HMAT.has(key)) return HMAT.get(key);
  const nm = T && T.fabric ? { normalMap: T.fabric.nr, normalScale: new THREE.Vector2(0.6, 0.6) } : {};
  const camo = camoTexture(o.palette);
  const M = {
    uni: new THREE.MeshStandardMaterial({ map: camo, roughness: 0.92, ...nm }),
    vest: new THREE.MeshStandardMaterial({ color: o.vestColor, roughness: 0.85, ...nm }),
    gear: new THREE.MeshStandardMaterial({ color: o.gearColor || 0x2a2d26, roughness: 0.8, ...nm }),
    pack: new THREE.MeshStandardMaterial({ map: camo, color: 0xb0b0b0, roughness: 0.9, ...nm }),
    skin: new THREE.MeshStandardMaterial({ color: o.skin, roughness: 0.55, metalness: 0 }),
    helm: new THREE.MeshStandardMaterial({ color: o.helmColor, roughness: 0.6, metalness: 0.1, ...nm }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.2, metalness: 0.4 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x23241f, roughness: 0.75, ...nm }),
    boot: new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.7, ...nm }),
    sole: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 }),
  };
  HMAT.set(key, M);
  return M;
}

export const PALETTES = {
  woodland: ['#4f5a3a', '#2f3a24', '#6a5a3a', '#1f201a'],
  desert: ['#c9ac78', '#a88a5a', '#8a6a4a', '#d8c49a'],
  winter: ['#e6ebef', '#c8d0d6', '#9aa4ac', '#f4f6f8'],
  multicam: ['#8a8064', '#5f6a48', '#a89a76', '#4a3e2e'],
  urban: ['#5a5e64', '#3a3e44', '#7a7e84', '#2a2c30'],
  ranger: ['#5a6248', '#4a5238', '#6a6a54', '#3a3e2e'],
  black: ['#2a2c30', '#1e2024', '#34363a', '#18191c'],
};

// ---------------------------------------------------------------- human rig
// Joint indices (shared by the pose solver and the ragdoll)
const J = { pelvis: 0, hipL: 1, hipR: 2, neck: 3, shL: 4, shR: 5, head: 6, elL: 7, haL: 8, elR: 9, haR: 10, knL: 11, anL: 12, knR: 13, anR: 14, toeL: 15, toeR: 16, gunA: 17, gunB: 18 };

export class HumanRig {
  // o: {palette, skin, vest (level|0), helmet (level|0), pack, balaclava, goggles, cap, holster, vestColor, helmColor}
  constructor(scene, T, o) {
    this.scene = scene;
    this.o = o;
    const G = humanGeometry(), M = humanMaterials(o, T);
    this.root = new THREE.Group();
    scene.add(this.root);
    const mk = (built) => {
      const m = new THREE.Mesh(built.geo, built.keys.map((k) => M[k]));
      m.matrixAutoUpdate = false;
      m.castShadow = true; m.receiveShadow = true;
      m.frustumCulled = false;
      this.root.add(m);
      return m;
    };
    this.m = {
      torso: mk(G.torso(o)), head: mk(G.head(o)),
      upL: mk(G.upper()), upR: mk(G.upper()), foL: mk(G.fore()), foR: mk(G.fore()), hL: mk(G.hand()), hR: mk(G.hand()),
      thL: mk(G.thigh()), thR: mk(G.thigh(o)), shL: mk(G.shin()), shR: mk(G.shin()), ftL: mk(G.foot()), ftR: mk(G.foot()),
    };
    this.j = Array.from({ length: 19 }, () => V());
    this.feet = [0, 1].map((i) => ({ plant: null, from: V(), to: V(), u: 1, dur: 0.3, swing: false, side: i ? 1 : -1 }));
    this.phase = 0;
    this.pelvisY = HB.hipY;
    this.pelvisVel = 0;
    this.lean = new Spring(40);
    this.accel = new Spring(30);
    this.lastVel = V();
    this.recoil = new Spring(260, 18);
    this.flinch = new Spring(90, 9);
    this.aimK = 0;
    this.sprintK = 0;
    this.crouchK = 0;
    this.twist = 0;
    this.headLook = V(0, 0, -1);
    this.t = Math.random() * 10;
    this.gun = null;
    this.gunDef = null;
    this.ragdoll = null;
    this.lod = 0;
    this.skip = 0;
    this.blink = 0;
  }

  setWeapon(def, inst) {
    if (this.gun) { this.root.remove(this.gun); this.gun = null; }
    this.gunDef = def;
    if (!def) return;
    const g = compactWeapon(buildWeapon(def, inst));
    g.matrixAutoUpdate = false;
    this.root.add(g);
    this.gun = g;
    this.kind = g.userData.kind;
  }

  fire() { this.recoil.kick(0, 0, 1.6 + (this.gunDef ? this.gunDef.recoil || 0.02 : 0.02) * 40); }
  hit(dir, strength = 1) { this.flinch.kick(dir.x * 2.2 * strength, 0.4 * strength, dir.z * 2.2 * strength); this.stagger = 0.25; }

  dispose() { this.scene.remove(this.root); }
  set visible(v) { this.root.visible = v; }

  // s: {pos, vel, yaw, aimYaw, aimPitch, crouch, aiming, sprint, reload (0..1 or <0), reloadKind, floorY, dt, dist, swim}
  update(dt, s) {
    this.root.position.copy(s.pos);
    if (this.ragdoll) return this.updateRagdoll(dt, s);
    if (!s.vel) return;
    // cheaper updates far away
    this.lod = s.dist > 140 ? 2 : s.dist > 60 ? 1 : 0;
    this.skip += dt;
    if (this.lod === 2 && this.skip < 0.1) return;
    dt = this.skip; this.skip = 0;
    this.t += dt;
    this.solve(dt, s);
    this.skin(s);
  }

  // ---------------------------------------------------------------- pose solver
  solve(dt, s) {
    const j = this.j, pos = s.pos;
    const f = V().set(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
    const r = V().set(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
    const velH = V().set(s.vel.x, 0, s.vel.z);
    const speed = s.swim ? 0 : velH.length();
    const crouch = (this.crouchK = lerp(this.crouchK, s.crouch ? 1 : 0, Math.min(1, dt * 8)));
    this.aimK = lerp(this.aimK, s.aiming ? 1 : 0, Math.min(1, dt * 7));
    this.sprintK = lerp(this.sprintK, s.sprint ? 1 : 0, Math.min(1, dt * 5));
    // acceleration lean
    const acc = V().subVectors(velH, this.lastVel).divideScalar(Math.max(dt, 1e-3));
    this.lastVel.copy(velH);
    this.accel.update(dt, acc.clampLength(0, 12).multiplyScalar(0.012));

    // ---- feet: gait cycle with planted feet
    const stepLen = clamp(0.42 + 0.13 * speed, 0.42, 1.25) * (1 - crouch * 0.25);
    const cycle = stepLen * 2;
    const swingFrac = clamp(0.36 + speed * 0.045, 0.36, 0.64);
    const prevPhase = this.phase;
    if (speed > 0.2) this.phase = (this.phase + (speed * dt) / cycle) % 1;
    const floorY = s.floorY ?? null;
    for (let i = 0; i < 2; i++) {
      const F = this.feet[i];
      const homeX = pos.x + r.x * F.side * 0.11, homeZ = pos.z + r.z * F.side * 0.11;
      if (!F.plant) { F.plant = V(homeX, groundAt(homeX, homeZ, floorY), homeZ); F.u = 1; }
      if (s.swim || !s.grounded) {
        // dangling / treading water: feet hang under the hips
        F.swing = false;
        F.plant.set(homeX - f.x * 0.05 + Math.sin(this.t * 3 + i * 3) * 0.08 * (s.swim ? 1 : 0), pos.y + 0.12 + (s.swim ? Math.sin(this.t * 3 + i * 3) * 0.1 : 0.06), homeZ - f.z * 0.05);
        continue;
      }
      const off = i * 0.5;
      const lp = (this.phase + off) % 1, plp = (prevPhase + off) % 1;
      const dx = F.plant.x - homeX, dz = F.plant.z - homeZ;
      // step on the gait's beat, or straight away if this foot has been left behind
      const behind = speed > 0.2 ? -(dx * velH.x + dz * velH.z) / speed : 0;
      if (speed > 0.2 && !F.swing && !this.feet[1 - i].swing && ((lp < swingFrac && (lp < plp || plp >= swingFrac)) || behind > (1 - swingFrac) * cycle * 0.62)) {
        F.swing = true; F.u = 0; F.from.copy(F.plant); F.dur = Math.max(0.1, (swingFrac * cycle) / speed);
      }
      // idle: step back under the body when we drift off or turn
      if (speed <= 0.2 && !F.swing && !this.feet[1 - i].swing && (dx * dx + dz * dz > 0.045 || this.stagger > 0)) {
        F.swing = true; F.u = 0; F.from.copy(F.plant); F.dur = 0.26;
        this.stagger = 0;
      }
      if (dx * dx + dz * dz > 2.5) { F.plant.set(homeX, groundAt(homeX, homeZ, floorY), homeZ); F.swing = false; } // teleported
      if (F.swing) {
        F.u = Math.min(1, F.u + dt / F.dur);
        // aim the landing so the foot lands ahead of the hip by half a stance
        const lead = speed > 0.2 ? ((1 - swingFrac) * cycle) / 2 + speed * F.dur * (1 - F.u) : 0;
        const vx = speed > 0.2 ? velH.x / speed : 0, vz = speed > 0.2 ? velH.z / speed : 0;
        F.to.set(homeX + vx * lead, 0, homeZ + vz * lead);
        F.to.y = groundAt(F.to.x, F.to.z, floorY);
        const e = smooth(F.u);
        const lift = Math.sin(Math.PI * F.u) * clamp(0.07 + speed * 0.035, 0.07, 0.24) * (1 - crouch * 0.3);
        F.plant.set(lerp(F.from.x, F.to.x, e), lerp(F.from.y, F.to.y, e) + lift, lerp(F.from.z, F.to.z, e));
        if (F.u >= 1) { F.swing = false; F.plant.y = F.to.y; if (this.onStep && s.dist < 60) this.onStep(F.plant, speed); }
      }
    }

    // ---- pelvis height: as tall as both legs allow, bobbing twice a cycle
    const legLen = HB.thigh + HB.shin;
    let want = HB.hipY * (1 - crouch * 0.3) - this.sprintK * 0.04;
    if (speed > 0.2) want -= (0.5 + 0.5 * Math.cos(this.phase * Math.PI * 4)) * clamp(speed * 0.012, 0.01, 0.05);
    for (const F of this.feet) {
      const hx = F.plant.x - pos.x, hz = F.plant.z - pos.z;
      const lat = Math.hypot(hx, hz);
      const reach = F.plant.y - pos.y + HB.ankle + Math.sqrt(Math.max(0, (legLen * 0.985) ** 2 - lat * lat));
      if (!F.swing) want = Math.min(want, reach);
    }
    if (s.swim) want = 0.95;
    this.pelvisY = lerp(this.pelvisY, want, Math.min(1, dt * 14));
    const sway = speed > 0.2 ? Math.sin(this.phase * Math.PI * 2) * 0.025 * clamp(1.6 - speed * 0.2, 0.3, 1) : 0;
    j[J.pelvis].set(sway * r.x, this.pelvisY, sway * r.z);

    // ---- spine: lean with speed / acceleration / crouch, twist into the shooting stance
    const twistWant = this.kind === 'rifle' ? 0.42 * this.aimK * (1 - this.sprintK) : 0.1 * this.aimK;
    this.twist = lerp(this.twist, twistWant, Math.min(1, dt * 6));
    const leanF = clamp(speed * 0.035, 0, 0.18) + this.sprintK * 0.16 + crouch * 0.28 - s.aimPitch * 0.25 * this.aimK;
    const fl = this.flinch.update(dt);
    const rc = this.recoil.update(dt);
    const sp = V().copy(UP).addScaledVector(f, Math.tan(leanF)).add(this.accel.x).addScaledVector(fl, 0.08);
    sp.addScaledVector(f, -rc.z * 0.006);
    sp.normalize();
    const breath = Math.sin(this.t * (1.4 + this.sprintK * 1.2)) * (0.004 + this.sprintK * 0.006);
    j[J.neck].copy(j[J.pelvis]).addScaledVector(sp, HB.spine + breath);
    // hips point a little to the right of the aim in a rifle stance; chest squares back up
    const hipYaw = s.yaw - this.twist;
    const hf = V(-Math.sin(hipYaw), 0, -Math.cos(hipYaw)), hr = V(Math.cos(hipYaw), 0, -Math.sin(hipYaw));
    const chestYaw = s.yaw - this.twist * 0.25 + (s.aimYaw !== undefined ? clamp(wrap(s.aimYaw - s.yaw), -0.6, 0.6) * this.aimK : 0);
    const cf = V(-Math.sin(chestYaw), 0, -Math.cos(chestYaw));
    cf.addScaledVector(sp, -cf.dot(sp)).normalize();
    const cr = V().crossVectors(cf, sp).normalize();
    this.frame = { f, r, hf, hr, sp, cf, cr };
    j[J.hipL].copy(j[J.pelvis]).addScaledVector(hr, -HB.hipW).addScaledVector(sp, -0.03);
    j[J.hipR].copy(j[J.pelvis]).addScaledVector(hr, HB.hipW).addScaledVector(sp, -0.03);
    const shrug = this.kind === 'rifle' ? 0.02 * this.aimK : 0;
    j[J.shL].copy(j[J.neck]).addScaledVector(cr, -HB.shW).addScaledVector(sp, -HB.shDrop);
    j[J.shR].copy(j[J.neck]).addScaledVector(cr, HB.shW).addScaledVector(sp, -HB.shDrop + shrug);

    // ---- legs
    const lp = V(), le = V();
    for (let i = 0; i < 2; i++) {
      const F = this.feet[i], hip = j[i ? J.hipR : J.hipL];
      const ankle = V(F.plant.x - pos.x, F.plant.y - pos.y + HB.ankle, F.plant.z - pos.z);
      // toe-off / heel-strike: ankle rises and the foot pitches during the swing
      const pitch = F.swing ? Math.sin(F.u * Math.PI * 2) * 0.5 : 0;
      ik(hip, ankle, HB.thigh, HB.shin, lp.copy(hf).addScaledVector(hr, F.side * 0.15), j[i ? J.knR : J.knL], le);
      j[i ? J.anR : J.anL].copy(le);
      const toeDir = V().copy(hf).addScaledVector(hr, F.side * 0.18).normalize();
      toeDir.y = -pitch * 0.6;
      j[i ? J.toeR : J.toeL].copy(le).addScaledVector(toeDir.normalize(), 0.2);
    }

    // ---- head: look where we aim, within what the neck allows
    const aimDir = V(-Math.sin(s.aimYaw ?? s.yaw) * Math.cos(s.aimPitch), Math.sin(s.aimPitch), -Math.cos(s.aimYaw ?? s.yaw) * Math.cos(s.aimPitch));
    this.headLook.lerp(aimDir, Math.min(1, dt * 10)).normalize();
    j[J.head].copy(j[J.neck]).addScaledVector(sp, 0.02);

    // ---- weapon
    this.solveWeapon(dt, s, aimDir);
  }

  solveWeapon(dt, s, aimDir) {
    const j = this.j, { sp, cf, cr, f } = this.frame;
    const kind = this.kind || 'none';
    const gunPos = V(), gunFwd = V(), gunUp = V();
    const rc = this.recoil.x;
    const reloading = s.reload >= 0 && s.reload < 1;
    if (this.gun) {
      const ud = this.gun.userData;
      // aim pose and low-ready pose, blended
      const low = V().copy(aimDir).addScaledVector(UP, -0.75).addScaledVector(cr, -0.35).normalize();
      if (this.sprintK > 0.01) low.lerp(V().copy(f).addScaledVector(UP, -0.8).addScaledVector(cr, -0.9).normalize(), this.sprintK).normalize();
      gunFwd.copy(low).lerp(aimDir, this.aimK * (1 - this.sprintK)).normalize();
      let base;
      if (kind === 'rifle') base = V().copy(j[J.neck]).addScaledVector(cr, lerp(0.14, 0.05, this.aimK)).addScaledVector(sp, lerp(-0.2, 0.025, this.aimK)).addScaledVector(gunFwd, lerp(0.28, 0.24, this.aimK));
      else if (kind === 'pistol') base = V().copy(j[J.neck]).addScaledVector(cr, lerp(0.08, 0.02, this.aimK)).addScaledVector(sp, lerp(-0.22, -0.02, this.aimK)).addScaledVector(gunFwd, lerp(0.3, 0.46, this.aimK));
      else if (kind === 'dual') base = V().copy(j[J.neck]).addScaledVector(sp, lerp(-0.25, -0.12, this.aimK)).addScaledVector(gunFwd, lerp(0.3, 0.42, this.aimK));
      else base = V().copy(j[J.neck]).addScaledVector(cr, 0.2).addScaledVector(sp, -0.3).addScaledVector(gunFwd, 0.25);
      gunPos.copy(base);
      gunUp.copy(UP).addScaledVector(gunFwd, -gunFwd.y).normalize();
      // recoil: back into the shoulder and muzzle climb
      gunPos.addScaledVector(gunFwd, -rc.z * 0.022);
      gunFwd.addScaledVector(gunUp, rc.z * 0.035).normalize();
      // reload: tilt the gun in towards the chest
      if (reloading) {
        const k = Math.sin(Math.PI * clamp(s.reload * 1.15, 0, 1));
        gunPos.addScaledVector(sp, -0.08 * k).addScaledVector(cr, -0.06 * k);
        gunFwd.addScaledVector(UP, 0.25 * k).normalize();
        gunUp.applyAxisAngle(gunFwd, 0.55 * k);
      }
      gunUp.addScaledVector(gunFwd, -gunUp.dot(gunFwd)).normalize();
      orient(this.gun, gunPos, gunUp, V().copy(gunFwd).negate());
      this.gun.updateMatrixWorld(true);
      const toLocal = (v) => v.applyMatrix4(this.gun.matrix);
      // right hand on the grip
      const grip = toLocal(ud.grip.clone());
      // support hand on the handguard, or cupping the pistol grip
      let support = ud.fore ? toLocal(ud.fore.clone()) : toLocal(V().copy(ud.gripL || ud.grip).add(V(ud.gripL ? 0 : -0.025, -0.01, 0.0)));
      if (kind === 'melee' || this.sprintK > 0.6) support = V().copy(j[J.hipL]).addScaledVector(this.frame.hf, 0.05).addScaledVector(sp, -0.05);
      if (reloading && kind !== 'dual') support = this.reloadHand(s, support);
      this.armIK(J.shR, J.elR, J.haR, grip, 1, gunFwd, gunUp);
      this.armIK(J.shL, J.elL, J.haL, support, -1, gunFwd, gunUp);
    } else {
      // empty hands swing opposite to the legs
      for (const [sh, el, ha, side] of [[J.shL, J.elL, J.haL, -1], [J.shR, J.elR, J.haR, 1]]) {
        const swing = Math.sin(this.phase * Math.PI * 2 + (side > 0 ? 0 : Math.PI)) * clamp(this.lastVel.length() * 0.08, 0, 0.35);
        const hand = V().copy(j[sh]).addScaledVector(sp, -0.52).addScaledVector(cf, swing + 0.05).addScaledVector(cr, side * 0.06);
        this.armIK(sh, el, ha, hand, side, cf, sp);
      }
    }
  }

  // reload choreography for the support hand (gun-space waypoints)
  reloadHand(s, fore) {
    const ud = this.gun.userData, P = ud.parts, t = s.reload;
    const toWorld = (v) => v.applyMatrix4(this.gun.matrix);
    const well = ud.magWell ? toWorld(ud.magWell.clone().add(V(0, -0.03, 0))) : fore.clone();
    const pouch = V().copy(this.j[J.pelvis]).addScaledVector(this.frame.cf, 0.2).addScaledVector(this.frame.cr, -0.06).addScaledVector(this.frame.sp, 0.2);
    const seg = (a, b, u) => V().copy(a).lerp(b, smooth(clamp(u, 0, 1)));
    if (s.reloadKind === 'shell') {
      // one round at a time: pouch -> loading port, repeatedly
      const n = Math.max(1, s.rounds || 3), u = (t * n) % 1;
      return u < 0.5 ? seg(pouch, well, u * 2) : seg(well, pouch, (u - 0.5) * 2);
    }
    if (P && P.mag) {
      const rest = P.mag.userData.rest.p;
      P.mag.visible = !(t > 0.28 && t < 0.42);
      P.mag.position.copy(rest);
      if (t > 0.12 && t < 0.28) P.mag.position.y -= smooth((t - 0.12) / 0.16) * 0.15;
      if (t >= 0.42 && t < 0.62) P.mag.position.y -= (1 - smooth((t - 0.42) / 0.2)) * 0.15;
    }
    if (P && P.bolt) { P.bolt.position.copy(P.bolt.userData.rest.p); if (t > 0.7 && t < 0.86) P.bolt.position.z += Math.sin(Math.PI * (t - 0.7) / 0.16) * 0.07; }
    if (t < 0.12) return seg(fore, well, t / 0.12);
    if (t < 0.28) return V().copy(well).add(V(0, -smooth((t - 0.12) / 0.16) * 0.15, 0));
    if (t < 0.42) return seg(V().copy(well).add(V(0, -0.15, 0)), pouch, (t - 0.28) / 0.14);
    if (t < 0.62) return seg(pouch, well, (t - 0.42) / 0.2);
    if (t < 0.7) return well;
    if (t < 0.86) { const bolt = P && P.bolt ? toWorld(P.bolt.position.clone()) : well; return seg(well, bolt, (t - 0.7) / 0.05); }
    return seg(well, fore, (t - 0.86) / 0.14);
  }

  armIK(sh, el, ha, target, side, fwd, up) {
    const j = this.j, { sp, cf, cr } = this.frame;
    // the hand's wrist sits a little behind the grip point
    const wrist = V().copy(target).addScaledVector(fwd, -0.06).addScaledVector(up, 0.01);
    const pole = V().copy(sp).multiplyScalar(-1).addScaledVector(cr, side * 0.3).addScaledVector(cf, -0.25);
    ik(j[sh], wrist, HB.upper, HB.fore, pole, j[el], j[ha]);
    if (side > 0) this.handR = { fwd: fwd.clone(), up: up.clone() }; else this.handL = { fwd: fwd.clone(), up: up.clone().applyAxisAngle(fwd, -0.6) };
  }

  // ---------------------------------------------------------------- skinning
  skin() {
    const j = this.j, m = this.m;
    const fr = this.frame;
    const tf = fr ? fr.cf : V(0, 0, -1);
    const up = V().subVectors(j[J.neck], j[J.pelvis]);
    // torso frame: forward from the shoulders and hips
    const sideV = V().subVectors(j[J.shR], j[J.shL]).add(V().subVectors(j[J.hipR], j[J.hipL]));
    const fwd = V().crossVectors(up, sideV).normalize();
    if (fwd.lengthSq() < 0.5) fwd.copy(tf);
    orient(m.torso, j[J.pelvis], up, fwd, up.length() / HB.spine);
    const headUp = V().copy(up).normalize().lerp(V(0, 1, 0), 0.3).addScaledVector(this.headLook || fwd, 0.15);
    const look = this.ragdoll ? fwd : V().copy(this.headLook).lerp(fwd, 0.25);
    orient(m.head, j[J.neck], headUp, look);
    orient(m.upL, j[J.shL], V().subVectors(j[J.elL], j[J.shL]), fwd);
    orient(m.upR, j[J.shR], V().subVectors(j[J.elR], j[J.shR]), fwd);
    orient(m.foL, j[J.elL], V().subVectors(j[J.haL], j[J.elL]), fwd);
    orient(m.foR, j[J.elR], V().subVectors(j[J.haR], j[J.elR]), fwd);
    const hand = (mesh, wrist, elbow, info) => {
      const d = V().subVectors(wrist, elbow).normalize();
      const hf = info && !this.ragdoll ? V().copy(info.fwd).lerp(d, 0.35) : d;
      const hu = info && !this.ragdoll ? info.up : V().copy(fwd);
      orient(mesh, wrist, hu, hf);
    };
    hand(m.hL, j[J.haL], j[J.elL], this.handL);
    hand(m.hR, j[J.haR], j[J.elR], this.handR);
    orient(m.thL, j[J.hipL], V().subVectors(j[J.knL], j[J.hipL]), fwd);
    orient(m.thR, j[J.hipR], V().subVectors(j[J.knR], j[J.hipR]), fwd);
    orient(m.shL, j[J.knL], V().subVectors(j[J.anL], j[J.knL]), fwd);
    orient(m.shR, j[J.knR], V().subVectors(j[J.anR], j[J.knR]), fwd);
    for (const [mesh, an, toe, kn] of [[m.ftL, J.anL, J.toeL, J.knL], [m.ftR, J.anR, J.toeR, J.knR]]) {
      const tdir = V().subVectors(j[toe], j[an]);
      const legUp = V().subVectors(j[kn], j[an]).normalize();
      const fu = V().crossVectors(tdir, V().crossVectors(legUp, tdir)).normalize();
      orient(mesh, j[an], fu.lengthSq() > 0.5 ? fu : UP, tdir);
    }
  }

  // ---------------------------------------------------------------- death
  // impulse: world-space velocity kick (m/s) applied at joint `at` ('head' | 'chest' | 'legs')
  die(impulse, at = 'chest', bodyVel = null) {
    if (this.ragdoll || !this.frame) return;
    const j = this.j;
    const dtGuess = 1 / 60;
    const pts = j.map((p) => ({ p, v: V(), r: 0.07 }));
    pts[J.head].r = 0.11; pts[J.pelvis].r = 0.12; pts[J.neck].r = 0.12;
    pts[J.toeL].r = pts[J.toeR].r = 0.04; pts[J.anL].r = pts[J.anR].r = 0.06; pts[J.haL].r = pts[J.haR].r = 0.045;
    // the gun becomes two particles (butt + muzzle) that fall free
    if (this.gun) {
      const ud = this.gun.userData;
      j[J.gunA].copy(V(0, 0, 0.2).applyMatrix4(this.gun.matrix));
      j[J.gunB].copy(V(0, 0, ud.muzzleZ).applyMatrix4(this.gun.matrix));
      pts[J.gunA].p = j[J.gunA]; pts[J.gunB].p = j[J.gunB];
      pts[J.gunA].r = pts[J.gunB].r = 0.03;
    }
    for (const p of pts) { if (bodyVel) p.v.copy(bodyVel).multiplyScalar(dtGuess); }
    const kickAt = at === 'head' ? [J.head, J.neck] : at === 'legs' ? [J.knL, J.knR, J.pelvis] : [J.neck, J.shL, J.shR, J.pelvis];
    for (const i of kickAt) pts[i].v.addScaledVector(impulse, dtGuess / kickAt.length * 2);
    const L = [];
    const P = j;
    rigid(L, [J.pelvis, J.hipL, J.hipR, J.neck, J.shL, J.shR], P);
    const bone = (a, b, k = 1) => L.push([a, b, P[a].distanceTo(P[b]), k, 0]);
    const minD = (a, b, d) => L.push([a, b, d, 1, 1]);
    bone(J.neck, J.head); bone(J.shL, J.head, 0.6); bone(J.shR, J.head, 0.6);
    bone(J.shL, J.elL); bone(J.elL, J.haL); bone(J.shR, J.elR); bone(J.elR, J.haR);
    bone(J.hipL, J.knL); bone(J.knL, J.anL); bone(J.anL, J.toeL); bone(J.knL, J.toeL, 0.8);
    bone(J.hipR, J.knR); bone(J.knR, J.anR); bone(J.anR, J.toeR); bone(J.knR, J.toeR, 0.8);
    // joint limits (approximate): knees and elbows can't fold flat, head can't sink into the chest
    minD(J.hipL, J.anL, 0.42); minD(J.hipR, J.anR, 0.42); minD(J.shL, J.haL, 0.2); minD(J.shR, J.haR, 0.2);
    minD(J.head, J.pelvis, 0.6); minD(J.knL, J.knR, 0.12); minD(J.anL, J.anR, 0.1);
    if (this.gun) bone(J.gunA, J.gunB);
    this.ragdoll = new Verlet(pts, L, this.lastFloor ?? null);
    this.handL = this.handR = null;
    for (const k in this.m) this.m[k].castShadow = true;
  }

  updateRagdoll(dt, s) {
    const R = this.ragdoll;
    R.floorY = s.floorY ?? R.floorY;
    if (!R.asleep) {
      R.step(dt, s.pos);
      for (let i = 0; i < this.j.length; i++) this.j[i].copy(R.P[i].p);
      this.skin();
      if (this.gun) {
        const a = this.j[J.gunA], b = this.j[J.gunB];
        const fwd = V().subVectors(b, a).normalize();
        const side = V().crossVectors(fwd, UP);
        const up = V().crossVectors(side, fwd);
        const pos = V().copy(a).addScaledVector(fwd, 0.2);
        orient(this.gun, pos, up.lengthSq() > 0.01 ? up : UP, fwd.negate());
      }
    }
  }
}

function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
export { J as HUMAN_JOINTS, restParts };
