// Quadruped rig for the wildlife: species-specific bodies with fur, four IK legs that plant on the
// terrain through walk / trot / gallop / bound gaits, spine flex, head bob, grazing and alert
// looks, ear twitches, tail physics, breathing, and a verlet ragdoll on death.
import * as THREE from 'three';
import { orient, ik, Spring, groundAt, Verlet, rigid, furTexture, limb, rboxGeo, at, mergeParts } from './rig.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

// Dimensions in metres at the species' catalog size.
// hf/hh: front (withers) / hind (hip) height, len: hip-to-withers, r: chest radius (vertical), w: width factor,
// neck: [length, angle up], head: [length, skull radius], ear, tail: [length, radius, droop], hoof: hooves vs paws
const SPECIES = {
  deer: { hf: 0.95, hh: 0.92, len: 0.8, r: 0.2, rh: 0.17, w: 0.72, neck: [0.42, 0.95], head: [0.3, 0.075], snout: 0.55, ear: [0.13, 0.04], tail: [0.12, 0.035, 0.6], hoof: true, gait: [1.1, 3.4], antler: 'deer', belly: 0xd8cbb0, tailWhite: true },
  moose: { hf: 1.85, hh: 1.65, len: 1.4, r: 0.42, rh: 0.33, w: 0.68, neck: [0.5, 0.35], head: [0.62, 0.13], snout: 0.62, ear: [0.18, 0.06], tail: [0.1, 0.05, 0.9], hoof: true, gait: [1.4, 4], antler: 'palmate', hump: 0.14, dewlap: true },
  wolf: { hf: 0.78, hh: 0.74, len: 0.72, r: 0.17, rh: 0.13, w: 0.7, neck: [0.28, 0.55], head: [0.26, 0.075], snout: 0.55, ear: [0.09, 0.035, true], tail: [0.42, 0.05, 1.0], hoof: false, gait: [1.2, 3.6], bushy: true },
  sandwolf: { hf: 0.74, hh: 0.71, len: 0.7, r: 0.16, rh: 0.12, w: 0.68, neck: [0.27, 0.55], head: [0.25, 0.07], snout: 0.55, ear: [0.1, 0.035, true], tail: [0.4, 0.045, 1.0], hoof: false, gait: [1.2, 3.6], bushy: true },
  coyote: { hf: 0.6, hh: 0.58, len: 0.56, r: 0.13, rh: 0.1, w: 0.66, neck: [0.22, 0.55], head: [0.21, 0.06], snout: 0.58, ear: [0.09, 0.03, true], tail: [0.35, 0.04, 1.1], hoof: false, gait: [1.1, 3.4], bushy: true },
  bear: { hf: 1.0, hh: 0.95, len: 1.1, r: 0.4, rh: 0.36, w: 0.85, neck: [0.25, 0.2], head: [0.36, 0.13], snout: 0.42, ear: [0.06, 0.04], tail: [0.08, 0.04, 0.8], hoof: false, plantigrade: true, gait: [1.0, 2.8], hump: 0.12 },
  raccoon: { hf: 0.24, hh: 0.3, len: 0.36, r: 0.12, rh: 0.12, w: 0.85, neck: [0.07, 0.3], head: [0.13, 0.055], snout: 0.45, ear: [0.04, 0.02], tail: [0.3, 0.04, 0.6], hoof: false, plantigrade: true, gait: [1.2, 3], ringTail: true, mask: true },
  rabbit: { hf: 0.13, hh: 0.16, len: 0.2, r: 0.075, rh: 0.085, w: 0.85, neck: [0.04, 0.8], head: [0.09, 0.042], snout: 0.35, ear: [0.11, 0.022], tail: [0.04, 0.03, -0.5], hoof: false, gait: [0.6, 1.2], hop: true, puff: true },
  squirrel: { hf: 0.08, hh: 0.1, len: 0.13, r: 0.042, rh: 0.045, w: 0.85, neck: [0.025, 0.8], head: [0.05, 0.026], snout: 0.4, ear: [0.025, 0.012, true], tail: [0.2, 0.04, -1.6], hoof: false, gait: [0.6, 1.2], hop: true, bushy: true },
};
// reference catalog sizes the numbers above were written for
const REF = { deer: 1.6, moose: 2.6, wolf: 1.3, sandwolf: 1.25, coyote: 1.0, bear: 2.2, raccoon: 0.6, rabbit: 0.45, squirrel: 0.3 };

// leg order: LH, RH, LF, RF. gait phase offsets and duty factor (fraction of the cycle on the ground)
const GAITS = {
  walk: { off: [0, 0.5, 0.25, 0.75], duty: 0.68, stride: 1.1 },
  trot: { off: [0, 0.5, 0.5, 0], duty: 0.48, stride: 1.7 },
  gallop: { off: [0, 0.12, 0.55, 0.67], duty: 0.32, stride: 2.8 },
  bound: { off: [0, 0.04, 0.5, 0.55], duty: 0.3, stride: 2.4 },
};

const GEOC = new Map();
const MATC = new Map();

function materials(species, color, belly) {
  const key = species + color;
  if (MATC.has(key)) return MATC.get(key);
  const fur = furTexture();
  const c = new THREE.Color(color);
  const M = {
    fur: new THREE.MeshStandardMaterial({ map: fur, color: c, roughness: 0.95 }),
    belly: new THREE.MeshStandardMaterial({ map: fur, color: new THREE.Color(belly ?? color).lerp(new THREE.Color(0xffffff), belly ? 0 : 0.18), roughness: 0.95 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 0.5 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 0.05, metalness: 0.2 }),
    hoof: new THREE.MeshStandardMaterial({ color: 0x1e1814, roughness: 0.6 }),
    antler: new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 0.7 }),
    white: new THREE.MeshStandardMaterial({ map: fur, color: 0xf0ece4, roughness: 0.95 }),
    ring: new THREE.MeshStandardMaterial({ map: fur, color: 0x221d18, roughness: 0.95 }),
  };
  MATC.set(key, M);
  return M;
}

function antlerGeo(kind, s) {
  const parts = [];
  const tine = (x0, y0, z0, x1, y1, z1, r) => {
    const a = V(x0, y0, z0), b = V(x1, y1, z1);
    const g = new THREE.CylinderGeometry(r * 0.6, r, a.distanceTo(b), 6);
    g.translate(0, a.distanceTo(b) / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, V().subVectors(b, a).normalize());
    g.applyQuaternion(q); g.translate(a.x, a.y, a.z);
    parts.push(g);
  };
  for (const sx of [-1, 1]) {
    if (kind === 'palmate') {
      tine(sx * 0.08, 0, 0, sx * 0.3, 0.1, -0.05, 0.03);
      const palm = new THREE.SphereGeometry(0.2, 10, 6); palm.scale(1.4, 0.25, 0.9);
      parts.push(at(palm, sx * 0.42, 0.18, -0.02, 0, 0, sx * 0.35));
      for (let i = 0; i < 6; i++) tine(sx * (0.3 + i * 0.05), 0.2 + i * 0.01, 0.12 - i * 0.04, sx * (0.38 + i * 0.07), 0.38 + (i % 2) * 0.05, 0.1 - i * 0.05, 0.018);
    } else {
      tine(sx * 0.03, 0, 0, sx * 0.14, 0.18, -0.06, 0.018);
      tine(sx * 0.14, 0.18, -0.06, sx * 0.18, 0.38, 0.04, 0.014);
      tine(sx * 0.18, 0.38, 0.04, sx * 0.12, 0.52, 0.12, 0.01);
      tine(sx * 0.15, 0.24, -0.04, sx * 0.1, 0.36, 0.08, 0.01);
      tine(sx * 0.17, 0.33, 0.0, sx * 0.24, 0.47, -0.02, 0.009);
      tine(sx * 0.06, 0.06, 0.0, sx * 0.05, 0.16, 0.08, 0.009);
    }
  }
  parts.forEach((g) => g.scale(s, s, s));
  return parts;
}

// Builds per-species geometry at a given scale (segments along +Y, +Z = up for body/head)
function speciesGeometry(species, S) {
  const key = species + S.toFixed(3);
  if (GEOC.has(key)) return GEOC.get(key);
  const D = SPECIES[species];
  const k = S;
  const r = D.r * k, rh = D.rh * k, len = D.len * k;
  const G = {};
  // body: hips (y=0) to withers (y=len); local Z = up. rump / belly / ribcage / chest
  const prof = [[-0.22, 0.0], [-0.18, 0.55], [-0.1, 0.9], [0.0, 1.0], [0.25, 0.98], [0.55, 1.08], [0.85, 1.12], [1.05, 1.0], [1.18, 0.65], [1.24, 0.0]].map(([y, f]) => [y * len, f * lerp(rh, r, clamp((y + 0.2) / 1.2, 0, 1))]);
  const body = limb(prof, D.w, 1, 18);
  body.translate(0, 0, -r * 0.08);
  const bp = { fur: [body], belly: [] };
  const belly = limb(prof.slice(2, 8).map(([y, rr]) => [y, rr * 0.96]), D.w * 0.98, 0.7, 14);
  bp.belly.push(at(belly, 0, 0, -r * 0.33));
  if (D.hump) { const h = new THREE.SphereGeometry(r * 0.75, 12, 8); h.scale(D.w, 1.2, 0.8); bp.fur.push(at(h, 0, len * 0.92, r * 0.55 + D.hump * k)); }
  G.body = mergeParts(bp);
  // neck along +Y, Z up
  const nl = D.neck[0] * k, nr = r * (species === 'bear' ? 0.75 : species === 'moose' ? 0.55 : 0.48);
  G.neck = mergeParts({ fur: [limb([[-nr * 0.6, 0], [-nr * 0.4, nr * 1.15], [nl * 0.5, nr * 0.95], [nl, nr * 0.75], [nl + nr * 0.4, 0]], D.w * 0.95, 1, 12)], belly: [], dark: D.dewlap ? [at(new THREE.ConeGeometry(nr * 0.4, nr * 1.4, 8), 0, nl * 0.8, -nr * 1.1, Math.PI)] : [] });
  // head: origin at the back of the skull, +Y along the snout, +Z up
  const hl = D.head[0] * k, hr = D.head[1] * k;
  const hp = { fur: [], dark: [], eye: [], antler: [], belly: [], ring: [] };
  const skull = new THREE.SphereGeometry(hr, 16, 12); skull.scale(1, 1.1, 0.95);
  hp.fur.push(at(skull, 0, hr * 0.9, 0));
  const sn = D.snout;
  hp.fur.push(limb([[hr * 0.6, hr * 0.85], [hl * 0.6, hr * (0.55 + (1 - sn) * 0.4)], [hl * 0.95, hr * 0.45], [hl, 0]], 0.95, 0.85, 12, -hr * 0.12));
  hp.dark.push(at(new THREE.SphereGeometry(hr * 0.24, 10, 8), 0, hl * 0.97, -hr * 0.05));
  if (D.mask) hp.ring.push(at(rboxGeo(hr * 2.1, hr * 0.5, hr * 0.5, hr * 0.2), 0, hr * 1.25, hr * 0.32));
  for (const sx of [-1, 1]) {
    hp.eye.push(at(new THREE.SphereGeometry(hr * 0.13, 8, 6), sx * hr * 0.62, hr * 1.25, hr * 0.35));
    // ears: pointed (canines/squirrel), long (rabbit) or round
    const el = D.ear[0] * k, ew = D.ear[1] * k;
    const ear = D.ear[2] ? new THREE.ConeGeometry(ew, el, 6) : new THREE.SphereGeometry(ew, 8, 6);
    if (!D.ear[2]) ear.scale(1, el / ew * 0.5, 0.45);
    ear.translate(0, el / 2, 0);
    G['ear' + sx] = mergeParts({ fur: [ear] });
  }
  if (D.antler) for (const g of antlerGeo(D.antler, k * (D.antler === 'palmate' ? 0.8 : 1.0))) hp.antler.push(at(g.rotateX(Math.PI / 2).rotateZ(Math.PI), 0, hr * 0.8, hr * 0.8));
  G.head = mergeParts(hp);
  // legs: upper / lower / foot, along +Y from the proximal joint
  const legR = r * (species === 'bear' ? 0.42 : species === 'moose' ? 0.3 : 0.27);
  G.upper = (L) => mergeParts({ fur: [limb([[-legR * 0.5, 0], [-legR * 0.2, legR * 1.15], [L * 0.6, legR * 0.85], [L, legR * 0.6], [L + legR * 0.25, 0]], 0.85, 1, 10)] });
  G.lower = (L) => mergeParts({ fur: [limb([[-legR * 0.25, 0], [0, legR * 0.55], [L, legR * 0.42], [L + legR * 0.15, 0]], 0.9, 1, 8)] });
  G.foot = () => {
    if (D.hoof) { const h = new THREE.CylinderGeometry(legR * 0.38, legR * 0.5, legR * 0.7, 8); return mergeParts({ hoof: [at(h, 0, -legR * 0.35, 0)] }); }
    const p = new THREE.SphereGeometry(legR * (D.plantigrade ? 0.9 : 0.6), 10, 6); p.scale(1, 0.45, D.plantigrade ? 1.8 : 1.3);
    return mergeParts({ fur: [at(p, 0, -legR * 0.15, legR * 0.25)], dark: [at(new THREE.SphereGeometry(legR * 0.25, 6, 4), 0, -legR * 0.35, legR * (D.plantigrade ? 0.9 : 0.6))] });
  };
  // tail segment (along +Y)
  const tl = D.tail[0] * k, tr = D.tail[1] * k;
  const tailMat = D.tailWhite ? 'white' : 'fur';
  G.tail = (i, n) => {
    const r0 = tr * (D.bushy ? 0.7 + Math.sin(((i + 0.5) / n) * Math.PI) * 0.9 : 1 - i / n * 0.5), r1 = tr * (D.bushy ? 0.7 + Math.sin(((i + 1) / n) * Math.PI) * 0.9 : 1 - (i + 1) / n * 0.5);
    const seg = tl / n;
    const g = limb([[-r0 * 0.5, 0], [0, r0], [seg, r1], [seg + r1 * 0.5, 0]], 1, 1, 8);
    const mat = D.ringTail && i % 2 ? 'ring' : D.puff ? 'white' : tailMat;
    return mergeParts({ [mat]: [g] });
  };
  G.dims = { r, rh, len, nl, nr, hl, hr, tl, legR };
  GEOC.set(key, G);
  return G;
}

export class QuadRig {
  constructor(scene, species, size, color) {
    this.scene = scene;
    this.species = species;
    this.D = SPECIES[species] || SPECIES.deer;
    const S = size / (REF[species] || size);
    this.S = S;
    const G = speciesGeometry(species, S), M = materials(species, color, this.D.belly);
    this.G = G;
    this.dims = G.dims;
    this.hf = this.D.hf * S; this.hh = this.D.hh * S;
    this.root = new THREE.Group();
    scene.add(this.root);
    const mk = (b) => {
      const m = new THREE.Mesh(b.geo, b.keys.map((k) => M[k]));
      m.matrixAutoUpdate = false; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      this.root.add(m);
      return m;
    };
    this.m = { body: mk(G.body), neck: mk(G.neck), head: mk(G.head), earL: mk(G['ear-1']), earR: mk(G['ear1']), legs: [], tail: [] };
    // legs: LH, RH, LF, RF
    const W = this.dims.r * this.D.w * 0.62;
    this.legs = [0, 1, 2, 3].map((i) => {
      const front = i >= 2, side = i % 2 ? 1 : -1, H = front ? this.hf : this.hh;
      const L1 = H * (this.D.plantigrade ? 0.5 : 0.42), L2 = H * (this.D.plantigrade ? 0.45 : 0.4), L3 = H * (this.D.plantigrade ? 0.05 : 0.22);
      const leg = { front, side, L1, L2, L3, W, plant: null, from: V(), to: V(), u: 1, dur: 0.3, swing: false, root: V(), mid: V(), low: V(), foot: V() };
      leg.mU = mk(G.upper(L1)); leg.mL = mk(G.lower(L2)); leg.mF = mk(G.foot());
      leg.mC = this.D.plantigrade ? null : mk(G.lower(L3));
      return leg;
    });
    const tn = this.D.bushy || this.D.ringTail ? 4 : 2;
    for (let i = 0; i < tn; i++) this.m.tail.push(mk(G.tail(i, tn)));
    this.tailP = Array.from({ length: tn + 1 }, () => V());
    this.tailV = Array.from({ length: tn + 1 }, () => V());
    this.phase = 0;
    this.gait = 'walk';
    this.t = Math.random() * 100;
    this.headTarget = V(0, 0, 1);
    this.headDir = V(0, 0, 1);
    this.graze = 0;
    this.grazeT = 2 + Math.random() * 5;
    this.earT = [0, 0];
    this.earK = [0, 0];
    this.flex = new Spring(60);
    this.bodyY = this.hh;
    this.ragdoll = null;
    this.skip = 0;
    this.j = {};
  }

  dispose() { this.scene.remove(this.root); }

  // s: {pos, vel, fwd (unit, horizontal), state ('wander'|'flee'|'attack'|'idle'), look (world point or null), dist}
  update(dt, s) {
    this.root.position.copy(s.pos);
    if (this.ragdoll) return this.updateRagdoll(dt, s);
    if (this.dead || !s.vel) return; // killed before it was ever animated
    const lod = s.dist > 120 ? 2 : s.dist > 50 ? 1 : 0;
    this.skip += dt;
    if (lod === 2 && this.skip < 0.12) return;
    dt = this.skip; this.skip = 0;
    this.t += dt;
    const D = this.D, dims = this.dims, pos = s.pos;
    const f = V().copy(s.fwd).setY(0).normalize(), r = V().crossVectors(f, UP).normalize(); // r = right
    const velH = V(s.vel.x, 0, s.vel.z), speed = velH.length();
    const rel = speed / Math.max(0.3, this.hh);
    // pick a gait from relative speed
    const want = speed < 0.12 ? this.gait : D.hop ? (rel > 0.4 ? 'bound' : 'walk') : rel < D.gait[0] ? 'walk' : rel < D.gait[1] ? 'trot' : 'gallop';
    if (want !== this.gait) this.gait = want;
    const G = GAITS[this.gait];
    const cycle = Math.max(0.05, G.stride * this.hh);
    const prev = this.phase;
    if (speed > 0.1) this.phase = (this.phase + (speed * dt) / cycle) % 1;
    const swingFrac = 1 - G.duty;

    // ---- feet
    const hipZ = -dims.len * 0.02, shZ = dims.len * 0.92;
    for (let i = 0; i < 4; i++) {
      const L = this.legs[i];
      const oz = L.front ? shZ : hipZ;
      const hx = pos.x + f.x * oz + r.x * L.side * L.W, hz = pos.z + f.z * oz + r.z * L.side * L.W;
      if (!L.plant) L.plant = V(hx, groundAt(hx, hz), hz);
      const lp = (this.phase + G.off[i]) % 1, plp = (prev + G.off[i]) % 1;
      const dx = L.plant.x - hx, dz = L.plant.z - hz;
      // step on the gait's beat, or straight away if this foot has been left behind
      const behind = speed > 0.1 ? -(dx * velH.x + dz * velH.z) / speed : 0;
      if (speed > 0.1 && !L.swing && ((lp < swingFrac && (lp < plp || plp >= swingFrac)) || (behind > G.duty * cycle * 0.62 && this.legs.filter((o) => o.swing).length < 2))) { L.swing = true; L.u = 0; L.from.copy(L.plant); L.dur = Math.max(0.06, (swingFrac * cycle) / speed); }
      if (speed <= 0.1 && !L.swing && dx * dx + dz * dz > (0.12 * this.hh) ** 2 + 0.002 && !this.legs.some((o) => o.swing && o.front === L.front)) { L.swing = true; L.u = 0; L.from.copy(L.plant); L.dur = 0.25; }
      if (dx * dx + dz * dz > (this.hh * 2.5) ** 2) { L.plant.set(hx, groundAt(hx, hz), hz); L.swing = false; }
      if (L.swing) {
        L.u = Math.min(1, L.u + dt / L.dur);
        const lead = speed > 0.1 ? (G.duty * cycle) / 2 + speed * L.dur * (1 - L.u) : 0;
        const vx = speed > 0.1 ? velH.x / speed : 0, vz = speed > 0.1 ? velH.z / speed : 0;
        L.to.set(hx + vx * lead, 0, hz + vz * lead);
        L.to.y = groundAt(L.to.x, L.to.z);
        const e = smooth(L.u), lift = Math.sin(Math.PI * L.u) * this.hh * (this.gait === 'gallop' || this.gait === 'bound' ? 0.32 : 0.16);
        L.plant.set(lerp(L.from.x, L.to.x, e), lerp(L.from.y, L.to.y, e) + lift, lerp(L.from.z, L.to.z, e));
        if (L.u >= 1) { L.swing = false; L.plant.y = L.to.y; }
      }
    }

    // ---- body: heights from the feet under it, pitch with the slope, flex while galloping
    const gy = (L) => (L.swing ? lerp(L.from.y, L.to.y, L.u) : L.plant.y);
    const gH = (gy(this.legs[0]) + gy(this.legs[1])) / 2 - pos.y, gF = (gy(this.legs[2]) + gy(this.legs[3])) / 2 - pos.y;
    const stalk = s.state === 'attack' && speed < 2 && s.dist > 6 ? 0.12 : 0;
    let hipY = gH + this.hh * (1 - stalk), witY = gF + this.hf * (1 - stalk * 1.4);
    const bounce = speed > 0.1 ? (this.gait === 'gallop' || this.gait === 'bound' ? Math.sin(this.phase * Math.PI * 2) * 0.06 : (0.5 - 0.5 * Math.cos(this.phase * Math.PI * 4)) * -0.015) * this.hh : 0;
    const flexA = this.gait === 'gallop' || this.gait === 'bound' ? Math.sin(this.phase * Math.PI * 2 + 1) * 0.08 * this.hh : 0;
    hipY += bounce + flexA; witY += bounce - flexA;
    if (D.hop && this.gait === 'bound') { const k = Math.sin(this.phase * Math.PI * 2); hipY += Math.max(0, k) * 0.35 * this.hh; witY += Math.max(0, -k) * 0.25 * this.hh + Math.max(0, k) * 0.2 * this.hh; }
    this.bodyY = lerp(this.bodyY, hipY, Math.min(1, dt * 12));
    const H = V().addScaledVector(f, hipZ).setY(this.bodyY);
    const Wt = V().addScaledVector(f, shZ).setY(witY);
    // keep the body length
    const bd = V().subVectors(Wt, H).normalize();
    const W = V().copy(H).addScaledVector(bd, dims.len);
    const breathe = 1 + Math.sin(this.t * (s.state === 'flee' || s.state === 'attack' ? 6 : 1.6)) * 0.02;
    this.j.H = H; this.j.W = W;
    const bodyUp = V().crossVectors(r, bd).normalize();
    orient(this.m.body, H, bd, bodyUp);
    this.m.body.matrix.scale(V(breathe, 1, breathe));

    // ---- head and neck: grazing, alert looks at the player, bob with the stride
    this.grazeT -= dt;
    if (this.grazeT <= 0) { this.grazeT = 2 + Math.random() * 6; this.graze = !this.graze && s.state === 'wander' && speed < 0.3 && !D.bushy ? 1 : 0; }
    if (s.state !== 'wander' || speed > 0.6) this.graze = 0;
    const neckBase = V().copy(W).addScaledVector(bodyUp, dims.r * 0.45).addScaledVector(bd, dims.r * 0.15);
    let nd = V().copy(bd).multiplyScalar(Math.cos(D.neck[1])).addScaledVector(bodyUp, Math.sin(D.neck[1]));
    if (this.graze) nd = V().copy(bd).multiplyScalar(0.7).addScaledVector(UP, -0.7).normalize();
    if (this.gait === 'gallop') nd.addScaledVector(bd, 0.6).normalize();
    nd.addScaledVector(UP, speed > 0.1 ? Math.sin(this.phase * Math.PI * 4) * 0.08 : 0).normalize();
    if (this.nd) nd = this.nd.lerp(nd, Math.min(1, dt * 4)).normalize();
    this.nd = nd.clone();
    const headBase = V().copy(neckBase).addScaledVector(nd, dims.nl);
    orient(this.m.neck, neckBase, nd, bodyUp);
    // look target
    let hdir = V().copy(nd).addScaledVector(bd, 1.4).addScaledVector(UP, -0.6).normalize();
    if (this.graze) hdir = V(0, -1, 0).addScaledVector(bd, 0.4).normalize();
    if (s.look && !this.graze) {
      const tgt = V().subVectors(s.look, pos).sub(headBase).normalize();
      if (tgt.dot(f) > -0.2) hdir.lerp(tgt, 0.7).normalize();
    }
    this.headDir.lerp(hdir, Math.min(1, dt * 6)).normalize();
    const hUp = V().crossVectors(r, this.headDir).normalize();
    orient(this.m.head, headBase, this.headDir, hUp);
    this.j.head = headBase;
    // ears: twitch now and then, pin back when attacking or fleeing
    for (let e = 0; e < 2; e++) {
      this.earT[e] -= dt;
      if (this.earT[e] <= 0) { this.earT[e] = 0.8 + Math.random() * 4; this.earK[e] = (Math.random() - 0.5) * 1.2; }
      const pin = s.state === 'attack' || s.state === 'flee' ? 0.9 : 0;
      const side = e ? 1 : -1;
      const ep = V().copy(headBase).addScaledVector(this.headDir, dims.hr * 0.6).addScaledVector(hUp, dims.hr * 0.9).addScaledVector(V().crossVectors(this.headDir, hUp), side * dims.hr * 0.6);
      const ed = V().copy(hUp).addScaledVector(this.headDir, -0.3 - pin).addScaledVector(V().crossVectors(this.headDir, hUp), side * (0.35 + this.earK[e] * 0.4)).normalize();
      orient(e ? this.m.earR : this.m.earL, ep, ed, V().copy(this.headDir).negate());
    }

    // ---- legs
    for (const L of this.legs) {
      const rootP = V().copy(L.front ? W : H).addScaledVector(r, L.side * L.W).addScaledVector(bodyUp, -dims.r * 0.2);
      if (L.front) rootP.addScaledVector(bd, -dims.r * 0.2);
      const foot = V(L.plant.x - pos.x, L.plant.y - pos.y + this.dims.legR * 0.35, L.plant.z - pos.z);
      const low = V().copy(foot).addScaledVector(UP, L.L3).addScaledVector(f, L.front ? 0.0 : -L.L3 * 0.25);
      if (L.swing) low.addScaledVector(f, (L.front ? -1 : 1) * Math.sin(Math.PI * L.u) * L.L3 * 0.5);
      const pole = V().copy(f).multiplyScalar(L.front ? -1 : 1);
      const mid = V(), end = V();
      ik(rootP, low, L.L1, L.L2, pole, mid, end);
      orient(L.mU, rootP, V().subVectors(mid, rootP), UP);
      orient(L.mL, mid, V().subVectors(end, mid), UP);
      if (L.mC) orient(L.mC, end, V().subVectors(foot, end), f);
      orient(L.mF, L.mC ? foot : end, UP, f);
      L.root.copy(rootP); L.mid.copy(mid); L.low.copy(end); L.foot.copy(foot);
    }

    // ---- tail: a little chain with springs; wags, flags or hangs
    const tb = V().copy(H).addScaledVector(bd, -dims.len * 0.2).addScaledVector(bodyUp, dims.rh * 0.5);
    const n = this.m.tail.length, seg = dims.tl / n;
    let wag = 0, lift = D.tail[2];
    if (D.bushy && speed > 0.2) wag = Math.sin(this.t * 5) * 0.25;
    if (s.state === 'flee' && D.tailWhite) lift = -1.2; // white flag
    if (s.state === 'attack' && D.bushy) lift = 0.2;
    this.tailP[0].copy(tb);
    let dir = V().copy(bd).negate().multiplyScalar(Math.cos(lift)).addScaledVector(UP, -Math.sin(lift)).addScaledVector(r, wag).normalize();
    for (let i = 1; i <= n; i++) {
      const target = V().copy(this.tailP[i - 1]).addScaledVector(dir, seg);
      const v = this.tailV[i];
      if (this.tailP[i].lengthSq() === 0) this.tailP[i].copy(target);
      v.addScaledVector(V().subVectors(target, this.tailP[i]), dt * 140).multiplyScalar(Math.max(0, 1 - dt * 14));
      this.tailP[i].addScaledVector(v, dt);
      const d = V().subVectors(this.tailP[i], this.tailP[i - 1]).setLength(seg);
      this.tailP[i].copy(this.tailP[i - 1]).add(d);
      orient(this.m.tail[i - 1], this.tailP[i - 1], d, bodyUp);
      dir = d.normalize().lerp(V().copy(dir).addScaledVector(UP, D.bushy ? -0.15 : -0.3), 0.3).normalize();
    }
    this.frame = { f, r, bd, bodyUp };
  }

  // ---------------------------------------------------------------- death
  die(impulse) {
    if (this.ragdoll || !this.frame) { this.dead = true; return; }
    const { r, bd, bodyUp } = this.frame;
    const dims = this.dims;
    const P = [], idx = {};
    const add = (name, p, rad) => { idx[name] = P.length; P.push({ p: p.clone(), v: V(), r: rad }); };
    const H = this.j.H, W = this.j.W;
    const wR = dims.r * this.D.w * 0.8;
    add('H', H, dims.rh * 0.8); add('W', W, dims.r * 0.8);
    add('HL', V().copy(H).addScaledVector(r, -wR), dims.rh * 0.5); add('HR', V().copy(H).addScaledVector(r, wR), dims.rh * 0.5);
    add('WL', V().copy(W).addScaledVector(r, -wR), dims.r * 0.5); add('WR', V().copy(W).addScaledVector(r, wR), dims.r * 0.5);
    add('top', V().copy(H).lerp(W, 0.5).addScaledVector(bodyUp, dims.r), dims.r * 0.4);
    add('head', this.j.head, dims.hr);
    add('nose', V().copy(this.j.head).addScaledVector(this.headDir, dims.hl), dims.hr * 0.5);
    this.legs.forEach((L, i) => { add('r' + i, L.root, dims.legR); add('m' + i, L.mid, dims.legR * 0.7); add('l' + i, L.low, dims.legR * 0.5); add('f' + i, L.foot, dims.legR * 0.4); });
    add('tail', this.tailP[this.tailP.length - 1], 0.02);
    const pts = P.map((p) => p.p);
    const links = [];
    rigid(links, ['H', 'W', 'HL', 'HR', 'WL', 'WR', 'top'].map((k) => idx[k]), pts);
    const bone = (a, b, k = 1) => links.push([idx[a], idx[b], pts[idx[a]].distanceTo(pts[idx[b]]), k, 0]);
    bone('W', 'head', 0.7); bone('top', 'head', 0.4); bone('head', 'nose');
    this.legs.forEach((L, i) => { bone(L.front ? 'W' : 'H', 'r' + i); bone(L.front ? (L.side < 0 ? 'WL' : 'WR') : (L.side < 0 ? 'HL' : 'HR'), 'r' + i); bone('r' + i, 'm' + i); bone('m' + i, 'l' + i); bone('l' + i, 'f' + i); links.push([idx['r' + i], idx['l' + i], (L.L1 + L.L2) * 0.45, 1, 1]); });
    bone('H', 'tail', 0.3);
    // shove: impulse plus a roll onto the side
    for (const p of P) p.v.set(0, 0, 0);
    const kick = V().copy(impulse || V()).multiplyScalar(1 / 60);
    for (const k of ['H', 'W', 'top', 'head']) P[idx[k]].v.add(kick);
    P[idx.top].v.addScaledVector(r, (Math.random() < 0.5 ? -1 : 1) * 0.03);
    this.ragdoll = new Verlet(P, links, null);
    this.ridx = idx;
  }

  updateRagdoll(dt, s) {
    const R = this.ragdoll;
    if (R.asleep) return;
    R.step(dt, s.pos);
    const g = (k) => R.P[this.ridx[k]].p;
    const H = g('H'), W = g('W');
    const bd = V().subVectors(W, H);
    const side = V().subVectors(g('WR'), g('WL')).add(V().subVectors(g('HR'), g('HL')));
    const up = V().crossVectors(side, bd).normalize();
    orient(this.m.body, H, bd, up);
    const head = g('head'), nose = g('nose');
    orient(this.m.neck, W, V().subVectors(head, W), up);
    orient(this.m.head, head, V().subVectors(nose, head), up);
    for (const e of [this.m.earL, this.m.earR]) orient(e, head, up, V().subVectors(head, nose));
    this.legs.forEach((L, i) => {
      const a = g('r' + i), b = g('m' + i), c = g('l' + i), d = g('f' + i);
      orient(L.mU, a, V().subVectors(b, a), up);
      orient(L.mL, b, V().subVectors(c, b), up);
      if (L.mC) orient(L.mC, c, V().subVectors(d, c), up);
      orient(L.mF, d, up, V().subVectors(d, c));
    });
    const tb = V().copy(H).addScaledVector(bd.normalize(), -this.dims.len * 0.2), te = g('tail');
    const n = this.m.tail.length;
    for (let i = 0; i < n; i++) orient(this.m.tail[i], V().copy(tb).lerp(te, i / n), V().subVectors(te, tb).multiplyScalar(1 / n), up);
  }

  // body measurements for hit boxes (in the old Animal convention)
  get metrics() {
    const d = this.dims;
    return { bodyOff: d.len * 0.45, legH: this.hh - d.rh * 0.9, bodyH: d.r * 2, headY: this.hf + Math.sin(this.D.neck[1]) * d.nl + d.r * 0.4, headZ: d.len * 0.92 + Math.cos(this.D.neck[1]) * d.nl + d.hl * 0.5, half: { x: d.r * this.D.w, y: d.r, z: d.len * 0.65 } };
  }
}

export const ANIMAL_SPECIES = SPECIES;
