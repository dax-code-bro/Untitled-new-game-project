// Procedural trees for the nature library - temperate coastal species, wind-shaped where exposed.
//
//   const kit = await treeKit(ctx, 'hawthorn', { variants: 3, exposure: 0.9 });
//   const t = kit.instance(lod, variant)  -> THREE.Group (bark mesh + leaf mesh), base at y = 0
//   scene.add(scatterTrees(ctx, [kit, ...], placements).group)       // instanced, LOD by distance
//
// How a tree is grown (generateTree): a trunk (or several stems for hawthorn), then scaffold limbs,
// branches and twigs, each a curved tube. Children leave their parent in a spiral (phyllotaxis) at a
// species' angle, lengths follow the crown shape, radii follow the pipe model (cross-sections are
// conserved through forks), branches bend under gravity and toward light, and every growing tip is
// clipped to a crown envelope that the wind shears leeward and squashes on the windward side - the
// way salt wind prunes a clifftop hawthorn into a flag. Twigs carry leaf-cluster cards drawn at setup
// on a canvas (lobed hawthorn, palmate sycamore, lobed oak, pinnate ash, needle tufts for pine),
// lit with light through the leaves; bark is a scanned ambientCG bark (CC0) with moss and lichen.
import * as THREE from 'three';
import { mulberry, makeNoise, smoothstep, clamp } from './noise.js';
import { loadPBR } from '../assets.js';
import { GLSL_NOISE } from '../sets/materials.js';

/** direction the prevailing wind comes FROM (the sea, +x); leeward is the opposite */
export const WIND_FROM = new THREE.Vector3(1, 0, 0.25).normalize();

export const SPECIES = {
  hawthorn: {
    height: [3.2, 5.5], stems: [1, 3], trunkFrac: 0.28, lean: 0.35,
    crown: { center: 0.62, rx: 0.55, ry: 0.42, base: 0.18 },
    levels: [
      { segs: 9, kids: 9, start: 0.3, down: [48, 15], len: 0.66, rad: 0.55, curve: 0.22, up: 0.03 },
      { segs: 6, kids: 9, start: 0.12, down: [48, 15], len: 0.55, rad: 0.5, curve: 0.3, up: 0.02 },
      { segs: 4, kids: 8, start: 0.1, down: [52, 20], len: 0.5, rad: 0.5, curve: 0.35, up: 0.0 },
      { segs: 2, kids: 0, start: 0.1, down: [55, 20], len: 0.5, rad: 0.5, curve: 0.4, up: 0.0 },
    ],
    radius: 0.12, leaf: { kind: 'hawthorn', size: 0.3, perM: 20, fromLevel: 2 }, bark: 'pbr/acg_bark001', barkTint: [0.55, 0.53, 0.5],
    leafCol: [0.07, 0.11, 0.035],
  },
  sycamore: {
    height: [11, 16], stems: [1, 1], trunkFrac: 0.32, lean: 0.12,
    crown: { center: 0.58, rx: 0.5, ry: 0.44, base: 0.25 },
    levels: [
      { segs: 12, kids: 12, start: 0.28, down: [62, 12], len: 0.62, rad: 0.55, curve: 0.1, up: 0.05 },
      { segs: 7, kids: 9, start: 0.15, down: [48, 15], len: 0.55, rad: 0.5, curve: 0.15, up: 0.05 },
      { segs: 4, kids: 8, start: 0.12, down: [45, 15], len: 0.5, rad: 0.5, curve: 0.2, up: 0.04 },
      { segs: 2, kids: 0, start: 0.1, down: [50, 15], len: 0.45, rad: 0.5, curve: 0.25, up: 0.05 },
    ],
    radius: 0.32, leaf: { kind: 'sycamore', size: 0.6, perM: 11, fromLevel: 2 }, bark: 'pbr/acg_bark006', barkTint: [0.6, 0.6, 0.58],
    leafCol: [0.09, 0.14, 0.04],
  },
  oak: {
    height: [9, 14], stems: [1, 1], trunkFrac: 0.25, lean: 0.15,
    crown: { center: 0.55, rx: 0.66, ry: 0.44, base: 0.2 },
    levels: [
      { segs: 12, kids: 10, start: 0.25, down: [65, 12], len: 0.7, rad: 0.58, curve: 0.25, up: 0.02 },
      { segs: 8, kids: 9, start: 0.12, down: [50, 18], len: 0.55, rad: 0.5, curve: 0.3, up: 0.02 },
      { segs: 4, kids: 8, start: 0.1, down: [50, 20], len: 0.5, rad: 0.5, curve: 0.35, up: 0.03 },
      { segs: 2, kids: 0, start: 0.1, down: [50, 20], len: 0.45, rad: 0.5, curve: 0.35, up: 0.0 },
    ],
    radius: 0.4, leaf: { kind: 'oak', size: 0.55, perM: 12, fromLevel: 2 }, bark: 'pbr/acg_bark001', barkTint: [0.55, 0.53, 0.5],
    leafCol: [0.07, 0.11, 0.035],
  },
  ash: {
    height: [12, 18], stems: [1, 1], trunkFrac: 0.38, lean: 0.1,
    crown: { center: 0.65, rx: 0.36, ry: 0.4, base: 0.35 },
    levels: [
      { segs: 12, kids: 10, start: 0.35, down: [48, 10], len: 0.58, rad: 0.5, curve: 0.08, up: 0.1 },
      { segs: 7, kids: 8, start: 0.18, down: [42, 12], len: 0.55, rad: 0.5, curve: 0.12, up: 0.08 },
      { segs: 4, kids: 8, start: 0.14, down: [45, 15], len: 0.5, rad: 0.5, curve: 0.2, up: 0.06 },
      { segs: 2, kids: 0, start: 0.1, down: [45, 15], len: 0.5, rad: 0.5, curve: 0.2, up: 0.05 },
    ],
    radius: 0.28, leaf: { kind: 'ash', size: 0.7, perM: 9, fromLevel: 2 }, bark: 'pbr/acg_bark006', barkTint: [0.6, 0.6, 0.58],
    leafCol: [0.08, 0.13, 0.04],
  },
  pine: {
    height: [12, 18], stems: [1, 1], trunkFrac: 0.62, lean: 0.12,
    crown: { center: 0.78, rx: 0.32, ry: 0.24, base: 0.55 },
    levels: [
      { segs: 12, kids: 16, start: 0.5, down: [75, 10], len: 0.36, rad: 0.45, curve: 0.12, up: 0.06 },
      { segs: 5, kids: 8, start: 0.2, down: [50, 15], len: 0.5, rad: 0.5, curve: 0.2, up: 0.1 },
      { segs: 3, kids: 4, start: 0.2, down: [45, 15], len: 0.45, rad: 0.5, curve: 0.2, up: 0.12 },
      { segs: 2, kids: 0, start: 0.1, down: [40, 15], len: 0.45, rad: 0.5, curve: 0.2, up: 0.1 },
    ],
    radius: 0.28, leaf: { kind: 'pine', size: 0.55, perM: 14, fromLevel: 1 }, bark: 'pbr/acg_bark014', barkTint: [0.75, 0.62, 0.55],
    leafCol: [0.05, 0.08, 0.03],
  },
  // shrubs grown the same way (many stems from the ground, dense small foliage cards)
  gorse: {
    height: [0.8, 1.7], stems: [9, 15], trunkFrac: 0, lean: 0.3, spread: 0.55,
    crown: { center: 0.45, rx: 0.75, ry: 0.55, base: 0.0 },
    levels: [
      { segs: 5, kids: 6, start: 0.25, down: [35, 15], len: 0.6, rad: 0.5, curve: 0.35, up: 0.06 },
      { segs: 3, kids: 4, start: 0.2, down: [40, 15], len: 0.5, rad: 0.5, curve: 0.35, up: 0.05 },
      { segs: 2, kids: 0, start: 0.1, down: [40, 15], len: 0.5, rad: 0.5, curve: 0.3, up: 0.05 },
    ],
    radius: 0.022, leaf: { kind: 'gorse', size: 0.26, perM: 30, fromLevel: 1 }, bark: 'pbr/acg_bark001', barkTint: [0.55, 0.5, 0.42],
    leafCol: [0.05, 0.075, 0.025],
  },
  heather: {
    height: [0.25, 0.5], stems: [10, 18], trunkFrac: 0, lean: 0.2, spread: 0.9,
    crown: { center: 0.35, rx: 1.1, ry: 0.5, base: 0.0 },
    levels: [
      { segs: 4, kids: 5, start: 0.3, down: [35, 15], len: 0.55, rad: 0.5, curve: 0.4, up: 0.05 },
      { segs: 2, kids: 0, start: 0.2, down: [40, 15], len: 0.5, rad: 0.5, curve: 0.4, up: 0.05 },
    ],
    radius: 0.008, leaf: { kind: 'heather', size: 0.14, perM: 45, fromLevel: 0 }, bark: 'pbr/acg_bark001', barkTint: [0.4, 0.34, 0.28],
    leafCol: [0.06, 0.06, 0.035],
  },
  bracken: {
    height: [0.7, 1.3], stems: [5, 9], trunkFrac: 0, lean: 0.15, spread: 0.7,
    crown: { center: 0.5, rx: 1.2, ry: 0.7, base: 0.0 },
    levels: [
      { segs: 6, kids: 0, start: 0.4, down: [30, 10], len: 0.5, rad: 0.5, curve: 0.25, up: -0.12 },
    ],
    radius: 0.006, leaf: { kind: 'bracken', size: 0.75, perM: 2.2, fromLevel: 0 }, bark: 'pbr/acg_bark001', barkTint: [0.35, 0.4, 0.2],
    leafCol: [0.11, 0.15, 0.04],
  },
  blackthorn: {
    height: [1.6, 3.4], stems: [3, 7], trunkFrac: 0, lean: 0.4, spread: 0.45,
    crown: { center: 0.55, rx: 0.7, ry: 0.5, base: 0.1 },
    levels: [
      { segs: 7, kids: 7, start: 0.25, down: [40, 15], len: 0.6, rad: 0.5, curve: 0.3, up: 0.03 },
      { segs: 4, kids: 7, start: 0.15, down: [50, 18], len: 0.5, rad: 0.5, curve: 0.35, up: 0.02 },
      { segs: 2, kids: 0, start: 0.1, down: [55, 20], len: 0.5, rad: 0.5, curve: 0.4, up: 0.0 },
    ],
    radius: 0.05, leaf: { kind: 'blackthorn', size: 0.24, perM: 26, fromLevel: 1 }, bark: 'pbr/acg_bark001', barkTint: [0.45, 0.42, 0.4],
    leafCol: [0.05, 0.08, 0.03],
  },
};

// ------------------------------------------------------------------ growth ---
/**
 * Grow one tree. opts: seed, exposure (0 sheltered .. 1 clifftop gale), scale.
 * Returns { branches: [{ pts: Vector3[], rad: number[], level }], leaves: [{ p, n, s, r }], height }.
 */
export function generateTree(speciesName, opts = {}) {
  const S = SPECIES[speciesName];
  const r = mulberry((opts.seed ?? 1) * 7349 + speciesName.length * 31);
  const N = makeNoise((opts.seed ?? 1) + 17);
  const expo = opts.exposure ?? 0;
  const H = (S.height[0] + (S.height[1] - S.height[0]) * r()) * (opts.scale ?? 1) * (1 - 0.2 * expo);
  const lee = WIND_FROM.clone().negate();
  const branches = [], leaves = [];
  const C = S.crown;
  // crown envelope (tree-local, base at origin): an ellipsoid sheared leeward by the wind and
  // squashed on the windward side; returns > 1 outside
  const env = (p) => {
    const sh = expo * 0.75 * Math.max(0, p.y - C.base * H);
    const q = p.clone().addScaledVector(lee, -sh);
    const cy = C.center * H * (1 - 0.15 * expo);
    const ry = C.ry * H * (1 - 0.25 * expo), rx = C.rx * H * (1 + 0.15 * expo);
    const wind = q.x * WIND_FROM.x + q.z * WIND_FROM.z;     // > 0 on the windward side
    const rxx = wind > 0 ? rx * (1 - 0.55 * expo) : rx;
    return Math.hypot(Math.hypot(q.x, q.z) / rxx, (q.y - cy) / ry);
  };
  const up = new THREE.Vector3(0, 1, 0);
  const tmpQ = new THREE.Quaternion();
  const perp = (d) => { const a = Math.abs(d.y) < 0.9 ? up : new THREE.Vector3(1, 0, 0); return new THREE.Vector3().crossVectors(d, a).normalize(); };

  function grow(level, origin, dir, length, radius, phase) {
    const L = S.levels[level];
    const pts = [origin.clone()], rad = [radius];
    const d = dir.clone();
    const seg = length / L.segs;
    const p = origin.clone();
    for (let i = 1; i <= L.segs; i++) {
      const t = i / L.segs;
      // random curvature (smooth along the branch), gravity on long horizontal limbs, light, wind
      const w = new THREE.Vector3(N.n2(phase + t * 2.3, 1.7), N.n2(phase + t * 2.3, 9.1) * 0.6, N.n2(phase + t * 2.3, 4.4));
      d.addScaledVector(w, L.curve);
      d.y += L.up - 0.08 * level * (1 - Math.abs(d.y)) * (level > 0 ? 1 : 0);
      d.addScaledVector(lee, expo * 0.12 * (level === 0 ? 1.5 : 1));
      d.normalize();
      p.addScaledVector(d, seg);
      pts.push(p.clone());
      rad.push(radius * Math.pow(1 - t * 0.85, level === 0 ? 0.9 : 1.1) + 0.003);
    }
    const br = { pts, rad, level };
    branches.push(br);
    // leaves along the twigs
    if (level >= S.leaf.fromLevel) {
      const n = Math.max(1, Math.round(length * S.leaf.perM * (level === S.levels.length - 1 ? 1.0 : 0.45)));
      for (let k = 0; k < n; k++) {
        const t = 0.25 + 0.75 * ((k + r()) / n);
        const pp = pointAt(pts, t);
        const off = perp(d).applyAxisAngle(d, r() * Math.PI * 2).multiplyScalar(0.03 + 0.06 * r());
        const pos = pp.add(off);
        // cards face outward from the crown centre, tipped toward the sky
        const cc = new THREE.Vector3(0, C.center * H, 0);
        const n0 = pos.clone().sub(cc).normalize().lerp(up, 0.35 + 0.3 * r()).normalize();
        leaves.push({ p: pos, n: n0, s: S.leaf.size * (0.7 + 0.6 * r()), r: r() * Math.PI * 2, v: Math.floor(r() * 4), shade: r() });
      }
    }
    if (level + 1 >= S.levels.length) return;
    const K = S.levels[level + 1];
    const nk = Math.round(L.kids * (0.75 + 0.5 * r()) * (level === 0 ? 1 : clamp(length / (H * 0.3), 0.4, 1.3)));
    let rot = r() * Math.PI * 2;
    for (let k = 0; k < nk; k++) {
      const t = L.start + (1 - L.start) * ((k + 0.3 + 0.4 * r()) / nk);
      const pos = pointAt(pts, t);
      const pd = dirAt(pts, t);
      rot += 2.4 + (r() - 0.5) * 0.6;               // ~137.5 degrees
      const down = ((K.down[0] + (r() - 0.5) * 2 * K.down[1]) * Math.PI) / 180 * (1 - 0.35 * t);
      const ax = perp(pd).applyAxisAngle(pd, rot);
      const cd = pd.clone().applyAxisAngle(ax, down).normalize();
      // length: the crown shape, then clipped to the wind envelope
      const shape = level === 0 ? (S === SPECIES.pine ? 1 - 0.85 * t : Math.sin(Math.PI * (0.25 + 0.75 * t)) * 0.75 + 0.35) : 1 - 0.45 * t;
      let len = length * L.len * shape * (0.75 + 0.5 * r());
      const lim = Math.max(1, env(pos) + 0.08);
      if (env(pos.clone().addScaledVector(cd, len)) > lim) { let lo = 0, hi = len; for (let it = 0; it < 10; it++) { const m = (lo + hi) / 2; if (env(pos.clone().addScaledVector(cd, m)) > lim) hi = m; else lo = m; } len = Math.max(lo, len * 0.18) * (0.9 + 0.1 * r()); }
      if (len < 0.05) continue;
      const rl = radiusAt(rad, t);
      const crad = Math.min(rl * 0.8, rl * Math.pow(len / Math.max(length, 0.01), 1.1) * 1.25) * L.rad * 1.6;
      grow(level + 1, pos, cd, len, Math.max(crad, 0.004), phase + 3.7 * (k + 1));
    }
  }
  // stems: hawthorn often several from the base, leaning leeward
  const ns = Math.round(S.stems[0] + r() * (S.stems[1] - S.stems[0]));
  for (let s = 0; s < ns; s++) {
    const a = r() * Math.PI * 2, spread = ns > 1 ? (S.spread ?? 0.25) * (0.6 + 0.8 * r()) : 0.04;
    const d = new THREE.Vector3(Math.cos(a) * spread, 1, Math.sin(a) * spread).addScaledVector(lee, S.lean * expo + 0.05).normalize();
    const base = new THREE.Vector3(Math.cos(a) * 0.12 * (ns > 1 ? 1 : 0), 0, Math.sin(a) * 0.12 * (ns > 1 ? 1 : 0));
    grow(0, base, d, H * (ns > 1 ? 0.85 + 0.15 * r() : 1), S.radius * (H / ((S.height[0] + S.height[1]) / 2)) * (ns > 1 ? 0.65 : 1) * (opts.girth ?? 1), r() * 100);
  }
  return { branches, leaves, height: H, species: speciesName };
}
function pointAt(pts, t) {
  const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), u = f - i;
  return pts[i].clone().lerp(pts[i + 1], u);
}
function dirAt(pts, t) {
  const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f));
  return pts[i + 1].clone().sub(pts[i]).normalize();
}
function radiusAt(rad, t) {
  const f = t * (rad.length - 1), i = Math.min(rad.length - 2, Math.floor(f)), u = f - i;
  return rad[i] * (1 - u) + rad[i + 1] * u;
}

// ------------------------------------------------------------------ geometry ---
/** bark tubes; lod 0: full, 1: no twigs and fewer sides, 2: limbs only */
export function barkGeometry(tree, lod = 0, opts = {}) {
  const tile = opts.tile ?? 0.6;
  const pos = [], nrm = [], uv = [], ax = [], idx = [];
  const sidesFor = (r, level) => (lod === 0 ? (r > 0.15 ? 12 : r > 0.05 ? 8 : r > 0.02 ? 5 : 3) : lod === 1 ? (r > 0.12 ? 8 : r > 0.03 ? 5 : 3) : (r > 0.1 ? 6 : 3));
  const maxLevel = lod === 0 ? 9 : lod === 1 ? 2 : 1;
  for (const b of tree.branches) {
    if (b.level > maxLevel) continue;
    if (lod > 0 && b.rad[0] < (lod === 1 ? 0.012 : 0.04)) continue;
    const sides = sidesFor(b.rad[0], b.level);
    const P = b.pts, n = P.length;
    // frames along the curve (parallel transport)
    let T = P[1].clone().sub(P[0]).normalize();
    let Nn = new THREE.Vector3(0, 1, 0).cross(T); if (Nn.lengthSq() < 1e-6) Nn.set(1, 0, 0); Nn.normalize();
    let s = 0;
    const base = pos.length / 3;
    const rep = Math.max(1, Math.round((2 * Math.PI * b.rad[0]) / tile));
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        const T2 = P[Math.min(n - 1, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(T, T2);
        Nn.applyQuaternion(q); T = T2;
        s += P[i].distanceTo(P[i - 1]);
      }
      const B = new THREE.Vector3().crossVectors(T, Nn);
      // root flare on the trunk base
      let rr = b.rad[i];
      if (b.level === 0 && i === 0) rr *= 1.45;
      if (b.level === 0 && i === 1) rr *= 1.12;
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const dx = Math.cos(a), dy = Math.sin(a);
        const nx = Nn.x * dx + B.x * dy, ny = Nn.y * dx + B.y * dy, nz = Nn.z * dx + B.z * dy;
        // a little bark relief in the silhouette of big limbs
        const bump = rr > 0.08 ? 1 + 0.05 * Math.sin(a * 7 + s * 3) * Math.sin(a * 3.1 + s) : 1;
        pos.push(P[i].x + nx * rr * bump, P[i].y + ny * rr * bump, P[i].z + nz * rr * bump);
        nrm.push(nx, ny, nz);
        uv.push((k / sides) * rep, s / tile);
        ax.push(b.level);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
      const a = base + i * (sides + 1) + k, c = a + sides + 1;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aLevel', new THREE.Float32BufferAttribute(ax, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** leaf-cluster cards; lod 1/2 keep fewer, bigger cards so the crown mass stays the same */
export function leafGeometry(tree, lod = 0) {
  const keep = [1, 0.35, 0.1][lod], grow = 1 / Math.sqrt(keep);
  const pos = [], nrm = [], uv = [], shade = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  let i = 0;
  const r = mulberry(1234 + lod);
  for (const L of tree.leaves) {
    if (r() > keep) continue;
    const n = L.n.clone();
    const t = new THREE.Vector3().crossVectors(Math.abs(n.y) < 0.95 ? up : new THREE.Vector3(1, 0, 0), n).normalize();
    t.applyAxisAngle(n, L.r);
    const b = new THREE.Vector3().crossVectors(n, t);
    const s = L.s * grow * (lod ? 1.1 : 1);
    // the card's twig end sits on the branch: offset the card outward by half its size
    const c = L.p.clone().addScaledVector(b, s * 0.45);
    const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    const u0 = (L.v % 2) * 0.5, v0 = Math.floor(L.v / 2) * 0.5;
    for (const [a, bb] of corners) {
      // a slight bend: the card's corners droop away from the twig
      const bend = -0.12 * s * (a * a + bb * bb);
      pos.push(c.x + t.x * a * s + b.x * bb * s + n.x * bend, c.y + t.y * a * s + b.y * bb * s + n.y * bend, c.z + t.z * a * s + b.z * bb * s + n.z * bend);
      nrm.push(n.x, n.y, n.z);
      uv.push(u0 + (a + 0.5) * 0.5, v0 + (bb + 0.5) * 0.5);
      shade.push(L.shade);
    }
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    i += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ leaf atlas ---
/** 2x2 atlas of leaf-cluster cards drawn on a canvas (deterministic). */
export function leafAtlas(kind, size = 1024) {
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const g = cv.getContext('2d');
  g.clearRect(0, 0, size, size);
  const half = size / 2;
  for (let v = 0; v < 4; v++) {
    const r = mulberry(v * 101 + kind.length * 7);
    g.save();
    g.translate((v % 2) * half, Math.floor(v / 2) * half);
    g.beginPath(); g.rect(0, 0, half, half); g.clip();
    drawCluster(g, kind, half, r);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function leafPath(g, kind, L, r) {
  // a leaf of length L along +y from the origin (the petiole end)
  g.beginPath();
  if (kind === 'hawthorn' || kind === 'oak') {
    const lobes = kind === 'oak' ? 5 : 3;
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;                                 // 0 base -> 1 tip -> back
      const side = t < 0.5 ? 1 : -1, u = t < 0.5 ? t * 2 : (1 - t) * 2;
      let w = Math.sin(Math.PI * Math.pow(u, kind === 'oak' ? 0.8 : 0.7)) * (kind === 'oak' ? 0.36 : 0.42);
      const lob = Math.abs(Math.sin(u * Math.PI * lobes));
      w *= kind === 'oak' ? 0.62 + 0.38 * Math.pow(lob, 0.6) : 0.45 + 0.55 * Math.pow(lob, 0.9);
      pts.push([side * w * L, u * L]);
    }
    g.moveTo(0, 0); for (const [x, y] of pts) g.lineTo(x, y); g.closePath();
  } else if (kind === 'sycamore') {
    for (let i = 0; i <= 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      const lob = Math.pow(Math.abs(Math.cos(a * 2.5)), 0.6);
      const rr = L * (0.28 + 0.27 * lob) * (a > Math.PI * 0.85 && a < Math.PI * 1.15 ? 0.6 : 1);
      const x = Math.sin(a) * rr, y = L * 0.5 - Math.cos(a) * rr;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
  } else {
    // lanceolate leaflet (ash) / needle (pine): long and thin
    const wmax = kind === 'pine' ? 0.025 : kind === 'blackthorn' ? 0.26 : kind === 'gorse' ? 0.03 : 0.16;
    g.moveTo(0, 0);
    for (let i = 0; i <= 20; i++) { const u = i / 20; g.lineTo(Math.sin(Math.PI * Math.pow(u, 0.8)) * wmax * L, u * L); }
    for (let i = 20; i >= 0; i--) { const u = i / 20; g.lineTo(-Math.sin(Math.PI * Math.pow(u, 0.8)) * wmax * L, u * L); }
    g.closePath();
  }
}
function drawLeaf(g, kind, x, y, ang, L, r, shade) {
  g.save();
  g.translate(x, y); g.rotate(ang);
  leafPath(g, kind, L, r);
  const base = kind === 'sycamore' ? [72, 104, 38] : kind === 'ash' ? [78, 112, 42] : kind === 'pine' ? [52, 80, 38] : kind === 'oak' ? [66, 96, 36] : kind === 'gorse' ? [46, 72, 30] : kind === 'bracken' ? [92, 130, 40] : kind === 'heather' ? [62, 66, 40] : [58, 92, 30];
  const k = 0.75 + 0.5 * shade;
  const grd = g.createLinearGradient(0, 0, 0, L);
  grd.addColorStop(0, `rgb(${base[0] * k * 0.8 | 0},${base[1] * k * 0.85 | 0},${base[2] * k * 0.7 | 0})`);
  grd.addColorStop(1, `rgb(${base[0] * k * 1.08 | 0},${base[1] * k * 1.05 | 0},${base[2] * k * 0.9 | 0})`);
  g.fillStyle = grd; g.fill();
  // veins
  if (kind !== 'pine' && kind !== 'gorse' && kind !== 'heather') {
    g.strokeStyle = `rgba(${base[0] + 60},${base[1] + 60},${base[2] + 40},0.45)`;
    g.lineWidth = Math.max(1, L * 0.02);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, L * 0.92); g.stroke();
    g.lineWidth = Math.max(0.6, L * 0.008);
    const nv = kind === 'sycamore' ? 4 : 5;
    for (let i = 1; i <= nv; i++) {
      const t = i / (nv + 1);
      for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(0, L * t); g.lineTo(sd * L * 0.22, L * (t + 0.12)); g.stroke(); }
    }
  }
  g.restore();
}
function drawCluster(g, kind, S, r) {
  const cx = S / 2, cy = S * 0.95;
  g.lineCap = 'round';
  if (kind === 'ash') {
    // a pinnate leaf: rachis with 4-5 pairs of leaflets and a terminal one
    for (let c = 0; c < 2; c++) {
      const a0 = -0.35 + c * 0.7 + (r() - 0.5) * 0.3, len = S * (0.75 + 0.15 * r());
      g.strokeStyle = 'rgb(70,80,40)'; g.lineWidth = S * 0.008;
      const ex = cx + Math.sin(a0) * len, ey = cy - Math.cos(a0) * len;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
      for (let i = 1; i <= 5; i++) {
        const t = 0.25 + 0.14 * i;
        const px = cx + Math.sin(a0) * len * t, py = cy - Math.cos(a0) * len * t;
        for (const sd of [-1, 1]) drawLeaf(g, kind, px, py, Math.PI + a0 + sd * 1.15, S * 0.2, r, r());
      }
      drawLeaf(g, kind, ex, ey, Math.PI + a0, S * 0.2, r, r());
    }
    return;
  }
  if (kind === 'gorse') {
    // spiny green shoots with yellow pea-flowers toward the tips
    for (let c = 0; c < 5; c++) {
      const bx = cx + (r() - 0.5) * S * 0.7, by = S * (0.1 + 0.35 * r());
      g.strokeStyle = 'rgb(60,72,36)'; g.lineWidth = S * 0.012;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(bx, by); g.stroke();
      for (let i = 0; i < 55; i++) {
        const t = r(), a = (r() - 0.5) * Math.PI * 1.4;
        drawLeaf(g, kind, cx + (bx - cx) * t, cy + (by - cy) * t, Math.PI + a, S * (0.05 + 0.05 * r()), r, r());
      }
      for (let i = 0; i < 9; i++) {
        const t = 0.55 + 0.45 * r();
        const fx = cx + (bx - cx) * t + (r() - 0.5) * S * 0.06, fy = cy + (by - cy) * t + (r() - 0.5) * S * 0.06;
        g.fillStyle = `rgb(${235 + 20 * r() | 0},${185 + 30 * r() | 0},${20 + 30 * r() | 0})`;
        g.beginPath(); g.ellipse(fx, fy, S * 0.022, S * 0.03, r() * 3, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(200,140,10,0.7)';
        g.beginPath(); g.ellipse(fx + S * 0.006, fy + S * 0.01, S * 0.01, S * 0.014, 0, 0, Math.PI * 2); g.fill();
      }
    }
    return;
  }
  if (kind === 'heather') {
    // wiry sprays clothed in tiny scale leaves, a few pink buds
    for (let c = 0; c < 7; c++) {
      const bx = cx + (r() - 0.5) * S * 0.8, by = S * (0.08 + 0.3 * r());
      g.strokeStyle = 'rgb(70,50,40)'; g.lineWidth = S * 0.006;
      g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo((cx + bx) / 2 + (r() - 0.5) * S * 0.2, (cy + by) / 2, bx, by); g.stroke();
      for (let i = 0; i < 90; i++) {
        const t = 0.2 + 0.8 * r();
        const px = cx + (bx - cx) * t + (r() - 0.5) * S * 0.035, py = cy + (by - cy) * t + (r() - 0.5) * S * 0.035;
        const k = 0.6 + 0.6 * r();
        g.fillStyle = r() < 0.06 ? `rgb(${160 * k | 0},${80 * k | 0},${120 * k | 0})` : `rgb(${(55 + 30 * r()) * k | 0},${(70 + 25 * r()) * k | 0},${40 * k | 0})`;
        g.beginPath(); g.ellipse(px, py, S * 0.008, S * 0.014, r() * 3, 0, Math.PI * 2); g.fill();
      }
    }
    return;
  }
  if (kind === 'bracken') {
    // one frond: a rachis with pinnae, each cut into pinnules, the tip curling over
    const len = S * 0.95;
    g.strokeStyle = 'rgb(110,120,50)'; g.lineWidth = S * 0.01;
    g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx + S * 0.05, cy - len * 0.5, cx + S * 0.02, cy - len); g.stroke();
    for (let i = 1; i <= 11; i++) {
      const t = i / 12, py = cy - len * t, px = cx + S * 0.05 * Math.sin(t * 3);
      const pl = S * 0.42 * Math.sin(Math.PI * (0.15 + 0.85 * (1 - t))) * (1 - 0.3 * t);
      for (const sd of [-1, 1]) {
        const a = sd * (1.25 - 0.35 * t);
        g.save(); g.translate(px, py); g.rotate(-a);
        g.strokeStyle = 'rgb(100,115,45)'; g.lineWidth = S * 0.004;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -pl); g.stroke();
        for (let k = 1; k <= 8; k++) {
          const u = k / 9, w = pl * 0.16 * (1 - u * 0.7);
          for (const s2 of [-1, 1]) {
            const k2 = 0.8 + 0.4 * r();
            g.fillStyle = `rgb(${92 * k2 | 0},${132 * k2 | 0},${40 * k2 | 0})`;
            g.beginPath(); g.ellipse(s2 * w * 0.55, -pl * u, w * 0.5, w * 0.24, s2 * 0.5, 0, Math.PI * 2); g.fill();
          }
        }
        g.restore();
      }
    }
    return;
  }
  if (kind === 'pine') {
    for (let c = 0; c < 4; c++) {
      const bx = cx + (r() - 0.5) * S * 0.5, by = S * (0.35 + 0.4 * r());
      g.strokeStyle = 'rgb(95,70,45)'; g.lineWidth = S * 0.012;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(bx, by); g.stroke();
      for (let i = 0; i < 70; i++) {
        const a = (r() - 0.5) * Math.PI * 1.6, L = S * (0.12 + 0.08 * r());
        const t = r();
        drawLeaf(g, kind, cx + (bx - cx) * (0.4 + 0.6 * t), cy + (by - cy) * (0.4 + 0.6 * t), Math.PI + a, L, r, r());
      }
    }
    return;
  }
  // twig with leaves
  const n = kind === 'sycamore' ? 4 : kind === 'oak' ? 6 : 11;
  const L0 = kind === 'sycamore' ? S * 0.42 : kind === 'oak' ? S * 0.36 : S * 0.2;
  g.strokeStyle = 'rgb(80,68,52)'; g.lineWidth = S * 0.012;
  const tx = cx + (r() - 0.5) * S * 0.2, ty = S * 0.15;
  g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx + (r() - 0.5) * S * 0.3, S * 0.5, tx, ty); g.stroke();
  for (let i = 0; i < n; i++) {
    const t = 0.2 + 0.8 * (i / n) + 0.05 * r();
    const px = cx + (tx - cx) * t + (r() - 0.5) * S * 0.08, py = cy + (ty - cy) * t;
    const side = i % 2 ? 1 : -1;
    const a = Math.PI + side * (0.6 + 0.6 * r()) + (r() - 0.5) * 0.4;
    // petiole
    g.strokeStyle = 'rgb(84,90,50)'; g.lineWidth = S * 0.005;
    const pl = L0 * (kind === 'sycamore' ? 0.45 : 0.12);
    const qx = px + Math.sin(-a + Math.PI) * pl * -1, qy = py + Math.cos(a) * -pl;
    g.beginPath(); g.moveTo(px, py); g.lineTo(qx, qy); g.stroke();
    drawLeaf(g, kind, qx, qy, a, L0 * (0.75 + 0.45 * r()), r, r());
  }
}

// ------------------------------------------------------------------ materials ---
export async function barkMaterial(ctx, S) {
  const base = await loadPBR(S.bark, ctx, { repeat: 1, anisotropy: 8 });
  const mat = base;
  mat.color.setRGB(...S.barkTint);
  const U = { tMoss: { value: 0.6 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW; varying vec3 vTN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{ vec4 w = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  w = instanceMatrix * w;
#endif
  vTW = (modelMatrix * w).xyz;
  mat3 m = mat3(modelMatrix);
#ifdef USE_INSTANCING
  m = m * mat3(instanceMatrix);
#endif
  vTN = normalize(m * objectNormal); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vTW; varying vec3 vTN; uniform float tMoss;
${GLSL_NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  // moss and green algae on the upper and windward (sea) side, grey-orange lichen patches
  float upw = smoothstep(-0.1, 0.8, vTN.y) * 0.6 + smoothstep(0.0, 0.9, dot(vTN, normalize(vec3(1.0, 0.0, 0.25)))) * 0.5;
  float m = smoothstep(0.45, 0.75, dkVN3(vTW * 6.0) * 0.6 + dkVN3(vTW * 1.5) * 0.4 + upw * 0.35 - 0.2) * tMoss;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.14, 0.04) * (0.7 + 0.6 * dkVN3(vTW * 20.0)), m * 0.75);
  float li = smoothstep(0.7, 0.8, dkVN3(vTW * 9.0 + 4.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.62, 0.55), li * 0.35);
}`);
  };
  mat.customProgramCacheKey = () => `nature-bark-${S.bark}`;
  return mat;
}

export function leafMaterial(S, atlas) {
  const mat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7, metalness: 0, color: 0xffffff, envMapIntensity: 0.7 });
  const U = { lTrans: { value: new THREE.Color(0.42, 0.55, 0.12) }, lTint: { value: new THREE.Color(0.82, 0.86, 0.72) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aShade; varying float vSh;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSh = aShade;');
    let fs = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSh; uniform vec3 lTrans; uniform vec3 lTint;')
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= lTint * (0.7 + 0.6 * vSh);`);
    // light through the leaf toward the camera (sun behind the foliage): the brightest thing in a
    // real backlit tree
    const chunk = THREE.ShaderChunk.lights_fragment_begin;
    const a0 = chunk.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
    const b0 = a0 >= 0 ? chunk.indexOf('#endif', chunk.indexOf('#pragma unroll_loop_end', a0)) : -1;
    if (a0 >= 0 && b0 > a0) {
      let block = chunk.slice(a0, b0 + '#endif'.length);
      block = block.replace(/RE_Direct\(\s*directLight[^;]*;/, 'reflectedLight.directDiffuse += directLight.color * lTrans * diffuseColor.rgb * 2.2 * (0.35 + 0.65 * pow(saturate(dot(-geometryViewDir, directLight.direction)), 2.0)) * saturate(-dot(normal, directLight.direction) + 0.2) * RECIPROCAL_PI;');
      fs = fs.replace('#include <lights_fragment_begin>', '#include <lights_fragment_begin>\n{\n' + block + '\n}\n');
    }
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `nature-leaf-${S.leaf.kind}`;
  return mat;
}

// ------------------------------------------------------------------ kits ---
const kitCache = new Map();
/**
 * A species kit: variants x LODs of bark + leaf geometry with shared materials.
 * opts: variants (3), exposure (0..1), scale, seed.
 */
export async function treeKit(ctx, species, opts = {}) {
  const key = `${species}|${opts.variants ?? 3}|${opts.exposure ?? 0}|${opts.scale ?? 1}|${opts.seed ?? 0}`;
  if (kitCache.has(key)) return kitCache.get(key);
  const S = SPECIES[species];
  const atlas = leafAtlas(S.leaf.kind);
  const bark = await barkMaterial(ctx, S);
  const leaf = leafMaterial(S, atlas);
  const nv = opts.variants ?? 3;
  const vars = [];
  for (let v = 0; v < nv; v++) {
    const tree = generateTree(species, { seed: (opts.seed ?? 0) * 100 + v + 1, exposure: opts.exposure ?? 0, scale: opts.scale ?? 1 });
    const lods = [0, 1, 2].map((l) => ({ bark: barkGeometry(tree, l), leaves: leafGeometry(tree, l) }));
    vars.push({ tree, lods });
  }
  const kit = {
    species, S, bark, leaf, atlas, variants: vars,
    instance(lod = 0, v = 0) {
      const g = new THREE.Group();
      const L = vars[v % nv].lods[lod];
      const b = new THREE.Mesh(L.bark, bark); b.castShadow = b.receiveShadow = true;
      const l = new THREE.Mesh(L.leaves, leaf); l.castShadow = true; l.receiveShadow = true;
      g.add(b, l);
      return g;
    },
  };
  kitCache.set(key, kit);
  return kit;
}

/**
 * Instanced trees. placements: [{ kit, x, y, z, yaw?, scale? }]; opts.views [[x,y,z]] picks the LOD
 * per tree (< 60 m: 0, < 300 m: 1, else 2).
 */
export function scatterTrees(placements, opts = {}) {
  const views = (opts.views || [[0, 0, 0]]).map((v) => new THREE.Vector3(...v));
  const groups = new Map();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const pl of placements) {
    let d = Infinity; for (const v of views) d = Math.min(d, Math.hypot(v.x - pl.x, v.y - pl.y, v.z - pl.z));
    const lod = d < (opts.lod0 ?? 60) ? 0 : d < (opts.lod1 ?? 300) ? 1 : 2;
    const vi = pl.variant ?? 0;
    const key = `${pl.kit.species}|${pl.kit.S === SPECIES[pl.kit.species] ? '' : ''}${lod}|${vi % pl.kit.variants.length}|${groups.size && 0}`;
    const k2 = `${key}|${pl.kit.variants.length}|${pl.kit.leaf.uuid}`;
    if (!groups.has(k2)) groups.set(k2, { kit: pl.kit, lod, v: vi % pl.kit.variants.length, list: [] });
    q.setFromAxisAngle(up, pl.yaw ?? 0);
    const sc = pl.scale ?? 1;
    m4.compose(p.set(pl.x, pl.y - 0.05, pl.z), q, s.set(sc, sc, sc));
    groups.get(k2).list.push(m4.clone());
  }
  const group = new THREE.Group();
  group.name = 'trees';
  for (const { kit, lod, v, list } of groups.values()) {
    const L = kit.variants[v].lods[lod];
    for (const [geo, mat] of [[L.bark, kit.bark], [L.leaves, kit.leaf]]) {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((mm, i) => mesh.setMatrixAt(i, mm));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  return { group };
}
