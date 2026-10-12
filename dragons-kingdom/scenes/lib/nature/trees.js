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
import { mulberry, makeNoise, smoothstep, clamp, hash3 } from './noise.js';
import { loadPBR, libUrl } from '../assets.js';
import { GLSL_NOISE } from '../sets/materials.js';

/** direction the prevailing wind comes FROM (the sea, +x); leeward is the opposite */
export const WIND_FROM = new THREE.Vector3(1, 0, 0.25).normalize();

export const SPECIES = {
  // hawthorn: ONE gnarled trunk with a root flare, forking low into 2-3 unequal stems; kinked,
  // zig-zag twigs; on the clifftop a salt-pruned wedge with dead grey twigs to windward
  hawthorn: {
    height: [3.2, 5.5], stems: [1, 1], fork: { at: [0.5, 1.2], n: [2, 3] }, trunkFrac: 0.28, lean: 0.35,
    crown: { center: 0.62, rx: 0.55, ry: 0.42, base: 0.18 }, gaps: 0.42,
    levels: [
      { segs: 8, kids: 8, start: 0.25, down: [42, 15], len: 0.7, rad: 0.55, curve: 0.18, up: 0.03, kink: 0.2 },
      { segs: 6, kids: 9, start: 0.12, down: [48, 15], len: 0.55, rad: 0.5, curve: 0.25, up: 0.02, kink: 0.28 },
      { segs: 4, kids: 8, start: 0.1, down: [52, 20], len: 0.5, rad: 0.5, curve: 0.3, up: 0.0, kink: 0.3 },
      { segs: 2, kids: 0, start: 0.1, down: [55, 20], len: 0.5, rad: 0.5, curve: 0.35, up: 0.0 },
    ],
    radius: 0.16, leaf: { kind: 'hawthorn', size: 0.32, perM: 24, fromLevel: 2 }, bark: 'pbr/acg_bark001', barkTint: [0.55, 0.53, 0.5],
    leafCol: [0.07, 0.11, 0.035],
  },
  // sycamore: dense upswept dome on a straight bole, smooth grey-pink flaking bark
  sycamore: {
    height: [11, 16], stems: [1, 1], trunkFrac: 0.32, lean: 0.12,
    crown: { center: 0.56, rx: 0.6, ry: 0.46, base: 0.2 }, gaps: 0.5,
    levels: [
      { segs: 12, kids: 10, start: 0.24, down: [42, 10], len: 0.78, rad: 0.55, curve: 0.1, up: 0.05 },
      { segs: 7, kids: 9, start: 0.15, down: [40, 12], len: 0.55, rad: 0.5, curve: 0.15, up: 0.07 },
      { segs: 4, kids: 8, start: 0.12, down: [42, 15], len: 0.5, rad: 0.5, curve: 0.2, up: 0.05 },
      { segs: 2, kids: 0, start: 0.1, down: [48, 15], len: 0.45, rad: 0.5, curve: 0.25, up: 0.05 },
    ],
    radius: 0.32, leaf: { kind: 'sycamore', size: 0.6, perM: 11, fromLevel: 2 }, bark: 'pbr/acg_bark006', barkTint: [0.66, 0.6, 0.58],
    leafCol: [0.09, 0.14, 0.04],
  },
  // oak: short bole, 3-5 heavy sinuous limbs spreading near-horizontal, broad crown, fissured bark
  oak: {
    height: [9, 14], stems: [1, 1], trunkFrac: 0.25, lean: 0.15,
    crown: { center: 0.5, rx: 0.85, ry: 0.46, base: 0.18 }, gaps: 0.45,
    levels: [
      { segs: 12, kids: 5, start: 0.24, down: [62, 14], len: 1.0, rad: 0.72, curve: 0.32, up: 0.0, kink: 0.08 },
      { segs: 8, kids: 10, start: 0.12, down: [50, 18], len: 0.55, rad: 0.5, curve: 0.32, up: 0.02, kink: 0.1 },
      { segs: 4, kids: 8, start: 0.1, down: [50, 20], len: 0.5, rad: 0.5, curve: 0.35, up: 0.03, kink: 0.12 },
      { segs: 2, kids: 0, start: 0.1, down: [50, 20], len: 0.45, rad: 0.5, curve: 0.35, up: 0.0 },
    ],
    radius: 0.42, leaf: { kind: 'oak', size: 0.55, perM: 12, fromLevel: 2 }, bark: 'pbr/acg_bark001', barkTint: [0.5, 0.48, 0.45],
    leafCol: [0.07, 0.11, 0.035],
  },
  // ash: tall, open crown with upswept tips, pale ridged bark
  ash: {
    height: [12, 18], stems: [1, 1], trunkFrac: 0.38, lean: 0.1,
    crown: { center: 0.6, rx: 0.46, ry: 0.42, base: 0.28 }, gaps: 0.25,
    levels: [
      { segs: 12, kids: 8, start: 0.3, down: [50, 10], len: 0.74, rad: 0.5, curve: 0.08, up: 0.08 },
      { segs: 7, kids: 6, start: 0.18, down: [38, 12], len: 0.55, rad: 0.5, curve: 0.12, up: 0.1 },
      { segs: 4, kids: 7, start: 0.14, down: [42, 15], len: 0.5, rad: 0.5, curve: 0.2, up: 0.08 },
      { segs: 2, kids: 0, start: 0.1, down: [42, 15], len: 0.5, rad: 0.5, curve: 0.2, up: 0.06 },
    ],
    radius: 0.28, leaf: { kind: 'ash', size: 0.62, perM: 7, fromLevel: 2 }, bark: 'pbr/acg_bark006', barkTint: [0.68, 0.68, 0.64],
    leafCol: [0.08, 0.13, 0.04],
  },
  // Scots pine: tall bare bole, orange plated upper bark, a flat irregular crown on a few near-
  // horizontal limbs, needle tufts at the shoot ends, dead drooping lower branches
  pine: {
    height: [13, 19], stems: [1, 1], trunkFrac: 0.66, lean: 0.12, deadLower: 0.55,
    crown: { center: 0.82, rx: 0.36, ry: 0.2, base: 0.62 }, gaps: 0.2,
    levels: [
      { segs: 12, kids: 11, start: 0.42, down: [80, 10], len: 0.42, rad: 0.45, curve: 0.14, up: 0.05, kink: 0.06 },
      { segs: 5, kids: 9, start: 0.2, down: [55, 15], len: 0.55, rad: 0.5, curve: 0.2, up: 0.08 },
      { segs: 3, kids: 5, start: 0.2, down: [45, 15], len: 0.45, rad: 0.5, curve: 0.2, up: 0.12 },
      { segs: 2, kids: 0, start: 0.1, down: [40, 15], len: 0.45, rad: 0.5, curve: 0.2, up: 0.1 },
    ],
    radius: 0.3, leaf: { kind: 'pine', size: 0.6, perM: 26, fromLevel: 1 }, bark: 'pbr/acg_bark014', barkTint: [0.8, 0.6, 0.48],
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
    radius: 0.022, basal: true, leaf: { kind: 'gorse', size: 0.26, perM: 30, fromLevel: 1 }, bark: 'pbr/acg_bark001', barkTint: [0.55, 0.5, 0.42],
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
    height: [0.7, 1.3], stems: [10, 16], trunkFrac: 0, lean: 0.15, spread: 0.85,
    crown: { center: 0.5, rx: 1.2, ry: 0.7, base: 0.0 },
    levels: [
      { segs: 6, kids: 0, start: 0.4, down: [30, 10], len: 0.5, rad: 0.5, curve: 0.25, up: -0.12 },
    ],
    radius: 0.006, leaf: { kind: 'bracken', size: 0.8, perM: 3.2, fromLevel: 0 }, bark: 'pbr/acg_bark001', barkTint: [0.35, 0.4, 0.2],
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
    radius: 0.05, basal: true, leaf: { kind: 'blackthorn', size: 0.26, perM: 28, fromLevel: 1 }, bark: 'pbr/acg_bark001', barkTint: [0.45, 0.42, 0.4],
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
  // squashed on the windward side; on exposed trees a salt-pruned WEDGE: the top slopes down to
  // windward (the crown streams out to leeward). Returns > 1 outside.
  const env = (p) => {
    const sh = expo * 0.75 * Math.max(0, p.y - C.base * H);
    const q = p.clone().addScaledVector(lee, -sh);
    const cy = C.center * H * (1 - 0.15 * expo);
    const ry = C.ry * H * (1 - 0.25 * expo), rx = C.rx * H * (1 + 0.15 * expo);
    const wind = q.x * WIND_FROM.x + q.z * WIND_FROM.z;     // > 0 on the windward side
    const rxx = wind > 0 ? rx * (1 - 0.55 * expo) : rx;
    let e = Math.hypot(Math.hypot(q.x, q.z) / rxx, (q.y - cy) / ry);
    if (expo > 0.3) {
      const w0 = p.x * WIND_FROM.x + p.z * WIND_FROM.z;
      const lowY = C.base * H + 0.3 * H, highY = H * 1.02;
      const topAt = lowY + (highY - lowY) * clamp((rx * 0.6 - w0) / (rx * 1.6), 0, 1);
      e = Math.max(e, 1 + ((p.y - topAt) / (0.22 * H)) * smoothstep(0.3, 0.8, expo));
    }
    return e;
  };
  const up = new THREE.Vector3(0, 1, 0);
  const perp = (d) => { const a = Math.abs(d.y) < 0.9 ? up : new THREE.Vector3(1, 0, 0); return new THREE.Vector3().crossVectors(d, a).normalize(); };
  const cc = new THREE.Vector3(0, C.center * H, 0);
  // gaps in the crown: clusters of foliage with sky between them, not a uniform dome
  const gapN = (p) => N.n3(p.x / (H * 0.16) + 3.1, p.y / (H * 0.16), p.z / (H * 0.16) - 1.7) + 0.5 * N.n3(p.x / (H * 0.07), p.y / (H * 0.07) + 9, p.z / (H * 0.07));
  const addLeaf = (pos, dirHint, scaleK = 1) => {
    if (S.gaps && gapN(pos) < -S.gaps) return;
    // cards face outward from the crown centre, tipped toward the sky
    const n0 = pos.clone().sub(cc).normalize().lerp(up, 0.35 + 0.3 * r()).lerp(dirHint, 0.15).normalize();
    leaves.push({ p: pos, n: n0, s: S.leaf.size * (0.7 + 0.6 * r()) * scaleK, r: r() * Math.PI * 2, v: Math.floor(r() * 4), shade: r(), depth: env(pos) });
  };

  function grow(level, origin, dir, length, radius, phase, flags = {}) {
    const L = S.levels[level];
    const pts = [origin.clone()], rad = [radius];
    const d = dir.clone();
    const seg = length / L.segs;
    const p = origin.clone();
    for (let i = 1; i <= L.segs; i++) {
      const t = i / L.segs;
      // random curvature (smooth along the branch), kinks (hawthorn: 10-25 degrees a segment),
      // gravity on long horizontal limbs, light, wind
      const w = new THREE.Vector3(N.n2(phase + t * 2.3, 1.7), N.n2(phase + t * 2.3, 9.1) * 0.6, N.n2(phase + t * 2.3, 4.4));
      d.addScaledVector(w, L.curve);
      if (L.kink) d.addScaledVector(perp(d).applyAxisAngle(d, r() * Math.PI * 2), Math.tan(L.kink * (0.5 + r())));
      d.y += L.up - 0.08 * level * (1 - Math.abs(d.y)) * (level > 0 ? 1 : 0) - (flags.droop ? 0.12 : 0);
      d.addScaledVector(lee, expo * 0.12 * (level === 0 ? 1.5 : 1));
      d.normalize();
      p.addScaledVector(d, seg);
      pts.push(p.clone());
      rad.push(radius * Math.pow(1 - t * 0.85, level === 0 ? 0.9 : 1.1) + 0.003);
    }
    // windward dieback: twigs pointing into the salt wind on an exposed tree are dead, bare, grey
    let dead = !!flags.dead;
    if (!dead && level >= 2 && expo > 0.5) {
      const tip = pts[pts.length - 1];
      const into = (d.x * WIND_FROM.x + d.z * WIND_FROM.z) / Math.max(0.2, Math.hypot(d.x, d.z));
      if (into > 0.2 && env(tip) > 0.8 && r() < 0.75 * expo) dead = true;
    }
    const br = { pts, rad, level, dead };
    branches.push(br);
    // leaves along the twigs, and a cluster at every growing tip
    if ((level >= S.leaf.fromLevel || (S.basal && level === 0)) && !dead) {
      const basal = level < S.leaf.fromLevel;
      const n = Math.max(1, Math.round(length * S.leaf.perM * (level === S.levels.length - 1 ? 1.0 : 0.45) * (basal ? 0.6 : 1)));
      for (let k = 0; k < n; k++) {
        // (shrubs: leafy right down to the ground - suckers and basal shoots, no bare stems on stilts)
        const t = (basal ? 0.04 : 0.25) + (basal ? 0.5 : 0.75) * ((k + r()) / n);
        const pp = pointAt(pts, t);
        const off = perp(d).applyAxisAngle(d, r() * Math.PI * 2).multiplyScalar(0.03 + 0.06 * r());
        addLeaf(pp.add(off), d);
      }
      if (level === S.levels.length - 1) addLeaf(pts[pts.length - 1].clone().addScaledVector(d, 0.03), d, 1.1);
    }
    if (level + 1 >= S.levels.length || flags.noKids) return;
    const K = S.levels[level + 1];
    const nk = Math.round(L.kids * (0.75 + 0.5 * r()) * (level === 0 ? 1 : clamp(length / (H * 0.3), 0.4, 1.3)));
    let rot = r() * Math.PI * 2;
    for (let k = 0; k < nk; k++) {
      const t = L.start + (1 - L.start) * ((k + 0.3 + 0.4 * r()) / nk);
      const pos = pointAt(pts, t);
      const pd = dirAt(pts, t);
      rot += 2.4 + (r() - 0.5) * 0.6;               // ~137.5 degrees
      // the lowest limbs of a conifer (or any shaded lower limb of a dense species) are dead and droop
      const lowDead = level === 0 && S.deadLower && pos.y < S.deadLower * H;
      const down = ((K.down[0] + (r() - 0.5) * 2 * K.down[1]) * Math.PI) / 180 * (1 - 0.35 * t) + (lowDead ? 0.35 : 0);
      const ax = perp(pd).applyAxisAngle(pd, rot);
      const cd = pd.clone().applyAxisAngle(ax, down).normalize();
      // length: the crown shape, then clipped to the wind envelope
      const shape = level === 0 ? (S === SPECIES.pine ? 1 - 0.85 * t : Math.sin(Math.PI * (0.25 + 0.75 * t)) * 0.75 + 0.35) : 1 - 0.45 * t;
      let len = length * L.len * shape * (0.75 + 0.5 * r()) * (lowDead ? 0.45 : 1);
      const lim = Math.max(1, env(pos) + 0.08);
      if (env(pos.clone().addScaledVector(cd, len)) > lim) { let lo = 0, hi = len; for (let it = 0; it < 10; it++) { const m = (lo + hi) / 2; if (env(pos.clone().addScaledVector(cd, m)) > lim) hi = m; else lo = m; } len = Math.max(lo, len * 0.18) * (0.9 + 0.1 * r()); }
      if (len < 0.05) continue;
      const rl = radiusAt(rad, t);
      const crad = Math.min(rl * 0.8, rl * Math.pow(len / Math.max(length, 0.01), 1.1) * 1.25) * L.rad * 1.6;
      grow(level + 1, pos, cd, len, Math.max(crad, 0.004), phase + 3.7 * (k + 1), lowDead ? { dead: true, droop: true, noKids: r() < 0.5 } : {});
    }
  }
  const r0 = S.radius * (H / ((S.height[0] + S.height[1]) / 2)) * (opts.girth ?? 1);
  if (S.fork) {
    // ONE leaning, gnarled trunk with a root flare that splits at 0.5-1.2 m into 2-3 unequal stems
    // (cross-sections conserved: r0^2.5 = sum ri^2.5), plus surface roots
    const fh = (S.fork.at[0] + (S.fork.at[1] - S.fork.at[0]) * r()) * Math.min(1, H / 4);
    const td = new THREE.Vector3((r() - 0.5) * 0.2, 1, (r() - 0.5) * 0.2).addScaledVector(lee, 0.15 + S.lean * expo).normalize();
    const tp = [], tr = [], nseg = 6;
    for (let i = 0; i <= nseg; i++) {
      const t = Math.pow(i / nseg, 1.5);
      const q = td.clone().multiplyScalar(fh * t / td.y);
      q.x += 0.06 * N.n2(t * 3, 2.2) * fh; q.z += 0.06 * N.n2(t * 3, 5.1) * fh;
      tp.push(q); tr.push(r0 * (1 - 0.12 * t));
    }
    branches.push({ pts: tp, rad: tr, level: 0, trunk: true });
    const fp = tp[nseg];
    const ns = Math.round(S.fork.n[0] + r() * (S.fork.n[1] - S.fork.n[0]));
    const wts = []; for (let k = 0; k < ns; k++) wts.push(k === 0 ? 1.6 + r() : 0.5 + r());
    const wsum = wts.reduce((a2, b2) => a2 + b2, 0);
    let a0 = r() * Math.PI * 2;
    for (let k = 0; k < ns; k++) {
      const wk = wts[k] / wsum;
      const rk = r0 * 0.88 * Math.pow(wk, 1 / 2.5);
      a0 += (Math.PI * 2) / ns + (r() - 0.5) * 0.8;
      const spread = 0.28 + 0.45 * r() * (k ? 1 : 0.4);
      const d = new THREE.Vector3(Math.cos(a0) * spread, 1, Math.sin(a0) * spread).addScaledVector(lee, S.lean * expo + 0.05).normalize();
      grow(0, fp.clone().addScaledVector(d, -rk * 0.6), d, (H - fp.y) * (0.75 + 0.35 * wk) , rk, r() * 100);
    }
    // surface roots: short, flattened, diving into the ground
    const nr = 4 + Math.floor(r() * 3);
    for (let k = 0; k < nr; k++) {
      const a = (k / nr) * Math.PI * 2 + (r() - 0.5) * 0.6;
      const pts = [], rad = [];
      const len = r0 * (3 + 4 * r());
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        pts.push(new THREE.Vector3(Math.cos(a) * (r0 * 0.6 + len * t), 0.25 * r0 * (1 - t) - 0.12 * r0 * t * t * 3, Math.sin(a) * (r0 * 0.6 + len * t)));
        rad.push(r0 * 0.42 * (1 - 0.8 * t) + 0.004);
      }
      branches.push({ pts, rad, level: 1, root: true });
    }
  } else {
    // stems from the base (shrubs: many; trees: one), leaning leeward
    const ns = Math.round(S.stems[0] + r() * (S.stems[1] - S.stems[0]));
    for (let s = 0; s < ns; s++) {
      const a = r() * Math.PI * 2, spread = ns > 1 ? (S.spread ?? 0.25) * (0.6 + 0.8 * r()) : 0.04;
      const d = new THREE.Vector3(Math.cos(a) * spread, 1, Math.sin(a) * spread).addScaledVector(lee, S.lean * expo + 0.05).normalize();
      const base = new THREE.Vector3(Math.cos(a) * 0.12 * (ns > 1 ? 1 : 0), 0, Math.sin(a) * 0.12 * (ns > 1 ? 1 : 0));
      grow(0, base, d, H * (ns > 1 ? 0.85 + 0.15 * r() : 1), r0 * (ns > 1 ? 0.65 : 1), r() * 100, ns === 1 ? { trunk: true } : {});
    }
    if (ns === 1) branches[0].trunk = true;
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
    const sides = sidesFor(b.rad[0], b.level) * (b.trunk && lod === 0 ? 2 : 1);
    let P = b.pts, R = b.rad;
    // the trunk base: extra rings over the first segment so the root flare has a profile
    if (b.trunk && P.length > 1 && P[1].distanceTo(P[0]) > 0.3) {
      const P2 = [P[0]], R2 = [R[0]];
      for (const f of [0.06, 0.15, 0.32, 0.6]) { P2.push(P[0].clone().lerp(P[1], f)); R2.push(R[0] + (R[1] - R[0]) * f); }
      P = P2.concat(P.slice(1)); R = R2.concat(R.slice(1));
    }
    const n = P.length;
    const ph = (b.pts[0].x * 13.1 + b.pts[0].z * 7.7) % 6.28;
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
      let rr = R[i];
      // root flare on the trunk: r(h) = r0 (1 + 1.2 e^(-h/0.4)) with 5 buttress lobes, flutes up the bole
      const hgt = Math.max(0, P[i].y);
      const flare = b.trunk ? 1.2 * Math.exp(-hgt / Math.max(0.25, 2.2 * R[0])) : 0;
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const dx = Math.cos(a), dy = Math.sin(a);
        const nx = Nn.x * dx + B.x * dy, ny = Nn.y * dx + B.y * dy, nz = Nn.z * dx + B.z * dy;
        // a little bark relief in the silhouette of big limbs; buttresses and flutes on the trunk
        let bump = rr > 0.08 ? 1 + 0.05 * Math.sin(a * 7 + s * 3) * Math.sin(a * 3.1 + s) : 1;
        if (b.trunk) {
          const lobe = Math.pow(Math.max(0, Math.cos(5 * a + ph + 0.4 * Math.sin(2 * a))), 3);
          bump *= 1 + flare * (0.45 + 0.75 * lobe) + 0.07 * Math.cos(7 * a + ph * 2 + s * 0.9) * (1 - Math.exp(-hgt / 0.6));
        }
        pos.push(P[i].x + nx * rr * bump, P[i].y + ny * rr * bump, P[i].z + nz * rr * bump);
        nrm.push(nx, ny, nz);
        uv.push((k / sides) * rep, s / tile);
        ax.push(b.dead ? 5 : b.level);
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
  let li = -1;
  for (const L of tree.leaves) {
    li++;
    if (r() > keep) continue;
    // each card tilted at random off the crown-outward normal: real sprays face every way, and a
    // coherent orientation shows as rows of edge-on slivers wherever the crown turns away
    const n = L.n.clone().add(new THREE.Vector3(hash3(li, 1, 0, 77) - 0.5, hash3(li, 2, 0, 77) - 0.5, hash3(li, 3, 0, 77) - 0.5).multiplyScalar(1.1)).normalize();
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
      shade.push(0.35 * L.shade + 0.65 * smoothstep(0.35, 1.0, L.depth ?? 1));
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
// Photographed leaf sprays (assets-lib texture/eztree_leaves, MIT: EZ-Tree, D. Greenheck): oak,
// ash, aspen and spruce twigs cut out with alpha. Each species gets a 2x2 atlas built from one of
// them at its own leaf scale (hawthorn and blackthorn are small-leaved: two or three sprays at
// 55-62 % size fanned from the twig), recoloured to a muted photographic summer green with a
// per-cell hue / value shift; the brown twigs in the photos stay twig coloured.
const PHOTO_LEAVES = {
  hawthorn: { src: 'oak', scale: 0.6, n: 3, col: [56, 78, 33], keepChroma: 0.25 },
  oak: { src: 'oak', scale: 1.0, n: 1, col: [56, 76, 32], keepChroma: 0.35 },
  ash: { src: 'ash', scale: 1.0, n: 1, col: [62, 84, 38], keepChroma: 0.35 },
  sycamore: { src: 'aspen', scale: 1.0, n: 1, col: [58, 82, 34], keepChroma: 0.0 },
  pine: { src: 'pine', scale: 0.95, n: 1, col: [46, 66, 48], keepChroma: 0.3 },
  blackthorn: { src: 'ash', scale: 0.55, n: 3, col: [48, 66, 32], keepChroma: 0.25 },
  // heather (ling): the fine scale-leaved shoots of the spruce photo, small and fanned, dark olive
  heather: { src: 'pine', scale: 0.5, n: 3, col: [64, 64, 40], keepChroma: 0.15 },
};
const photoCache = new Map();
async function photoBitmap(name) {
  if (!photoCache.has(name)) {
    photoCache.set(name, (async () => {
      const r = await fetch(libUrl(`texture/eztree_leaves/${name}.png`));
      if (!r.ok) throw new Error(`leaf photo ${name}.png missing: run  node assets-lib/fetch.mjs --only texture/eztree_leaves`);
      return createImageBitmap(await r.blob());
    })());
  }
  return photoCache.get(name);
}
/** 2x2 atlas of photographed leaf sprays for a species (async); null when the species has none. */
export async function photoLeafAtlas(kind, size = 1024) {
  const P = PHOTO_LEAVES[kind];
  if (!P) return null;
  const img = await photoBitmap(P.src);
  const cv = new OffscreenCanvas(size, size);
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, size, size);
  const half = size / 2;
  const tints = [];
  for (let v = 0; v < 4; v++) {
    const r = mulberry(v * 211 + kind.length * 13 + 5);
    g.save();
    g.translate((v % 2) * half, Math.floor(v / 2) * half);
    g.beginPath(); g.rect(0, 0, half, half); g.clip();
    const n = P.n + (P.n > 1 && r() < 0.5 ? -1 : 0);
    for (let k = 0; k < n; k++) {
      g.save();
      // the twig end at the bottom centre of the cell (where the card meets its branch)
      g.translate(half * (0.5 + (r() - 0.5) * 0.08), half * 0.99);
      const fan = n > 1 ? (k - (n - 1) / 2) * 0.55 + (r() - 0.5) * 0.25 : (r() - 0.5) * 0.35;
      g.rotate(fan);
      const sc = P.scale * (0.9 + 0.2 * r()) * (v === 2 && n === 1 ? 1.3 : 1);
      if ((v + k) % 2) g.scale(-1, 1);
      const w = half * sc;
      // v = 2 (single sprays): the leafy upper part of the photo enlarged
      if (v === 2 && n === 1) g.drawImage(img, 0, 0, img.width, img.height * 0.72, -w / 2, -w * 0.72, w, w * 0.72);
      else g.drawImage(img, -w / 2, -w, w, w);
      g.restore();
    }
    g.restore();
    tints.push([1 + (r() - 0.5) * 0.14, 1 + (r() - 0.5) * 0.1, 1 + (r() - 0.5) * 0.16, 0.85 + 0.3 * r()]);
  }
  // recolour: leaf pixels to the species' muted green keeping the photo's light and shade; twigs
  // (redder than green) darkened toward bark brown
  const id = g.getImageData(0, 0, size, size), d = id.data;
  let sum = 0, cnt = 0;
  for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 128) { const L = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; sum += L; cnt++; }
  const meanL = cnt ? sum / cnt : 128;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    if (d[i + 3] === 0) continue;
    const R = d[i], Gc = d[i + 1], Bc = d[i + 2];
    const L = (0.3 * R + 0.59 * Gc + 0.11 * Bc) / meanL;
    const t = tints[(x >= half ? 1 : 0) + (y >= half ? 2 : 0)];
    // twigs: redder than green - but the aspen's autumn leaves are yellow-orange too, so there a twig
    // must also be darker than the leaves
    const Lr = 0.3 * R + 0.59 * Gc + 0.11 * Bc;
    const twig = P.src === 'aspen' ? (R > Gc * 1.12 && Lr < meanL * 0.62 ? 1 : 0) : P.src === 'pine' ? (R > Gc * 1.05 ? 1 : 0) : (R > Gc * 1.15 ? 1 : 0);
    let o;
    if (twig) o = [R * 0.55, Gc * 0.5, Bc * 0.45];
    else {
      const k = Math.pow(L, 1.1) * t[3];
      o = [P.col[0] * t[0] * k, P.col[1] * t[1] * k, P.col[2] * t[2] * k];
      if (P.keepChroma > 0) { const c = P.keepChroma * 0.5; o = [o[0] * (1 - c) + R * c * P.col[0] / 70, o[1] * (1 - c) + Gc * c * P.col[1] / 110, o[2] * (1 - c) + Bc * c * P.col[2] / 60]; }
      // a muted, photographic green (a saturated leaf colour read as Kelly-green clip-art)
      const lo = 0.3 * o[0] + 0.59 * o[1] + 0.11 * o[2];
      o = [o[0] * 0.85 + lo * 0.15, o[1] * 0.85 + lo * 0.15, o[2] * 0.85 + lo * 0.15];
    }
    d[i] = Math.min(255, o[0]); d[i + 1] = Math.min(255, o[1]); d[i + 2] = Math.min(255, o[2]);
  }
  g.putImageData(id, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  tex.userData.photo = P.src;
  return tex;
}

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
      // in flower: dense clusters of pea-flowers along the outer half of the shoots
      const nfl = c % 2 ? 15 : 5;
      for (let i = 0; i < nfl; i++) {
        const t = 0.45 + 0.55 * r();
        const fx = cx + (bx - cx) * t + (r() - 0.5) * S * 0.07, fy = cy + (by - cy) * t + (r() - 0.5) * S * 0.07;
        g.fillStyle = `rgb(${236 + 18 * r() | 0},${192 + 26 * r() | 0},${28 + 30 * r() | 0})`;
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
    // one card in three: last year's dead frond, rusty brown, under the green ones
    const dead = r() < 0.3;
    g.strokeStyle = dead ? 'rgb(105,70,40)' : 'rgb(110,120,50)'; g.lineWidth = S * 0.01;
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
            g.fillStyle = dead ? `rgb(${128 * k2 | 0},${82 * k2 | 0},${42 * k2 | 0})` : `rgb(${92 * k2 | 0},${132 * k2 | 0},${40 * k2 | 0})`;
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
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aLevel; varying vec3 vTW; varying vec3 vTN; varying float vLvl;')
      .replace('#include <project_vertex>', `#include <project_vertex>
vLvl = aLevel;
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
varying vec3 vTW; varying vec3 vTN; varying float vLvl; uniform float tMoss;
${GLSL_NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  // young shoots and twigs: smooth dark red-brown / purple-grey bark, not the pale grey of the
  // old stems (thin pale twigs read as wires against the leaves)
  float tw = clamp((vLvl - 0.6) / 1.6, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.115, 0.09) * (0.8 + 0.4 * dkVN3(vTW * 13.0)), tw * 0.85 * (1.0 - step(4.5, vLvl)));
  // dead, salt-killed twigs: bleached silver-grey wood
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.41, 0.38) * (0.8 + 0.4 * dkVN3(vTW * 9.0)), step(4.5, vLvl) * 0.85);
  // moss and green algae on the upper and windward (sea) side, grey-orange lichen patches
  float upw = smoothstep(-0.1, 0.8, vTN.y) * 0.6 + smoothstep(0.0, 0.9, dot(vTN, normalize(vec3(1.0, 0.0, 0.25)))) * 0.5;
  float m = smoothstep(0.45, 0.75, dkVN3(vTW * 6.0) * 0.6 + dkVN3(vTW * 1.5) * 0.4 + upw * 0.35 - 0.2) * tMoss;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.14, 0.04) * (0.7 + 0.6 * dkVN3(vTW * 20.0)), m * 0.75);
  float li = smoothstep(0.7, 0.8, dkVN3(vTW * 9.0 + 4.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.62, 0.55), li * 0.35);
}`);
  };
  mat.customProgramCacheKey = () => `nature-bark-v3-${S.bark}`;
  return mat;
}

export function leafMaterial(S, atlas) {
  const mat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.62, metalness: 0, color: 0xffffff, envMapIntensity: 0.75 });
  const photo = !!atlas.userData?.photo;
  const U = { lTrans: { value: new THREE.Color(0.42, 0.55, 0.12) }, lTint: { value: photo ? new THREE.Color(0.95, 0.95, 0.9) : new THREE.Color(0.74, 0.78, 0.6) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aShade; varying float vSh;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSh = aShade;');
    let fs = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSh; uniform vec3 lTrans; uniform vec3 lTint;')
      .replace('#include <color_fragment>', `#include <color_fragment>
// crown depth (baked per card): the inside of a crown is in its own shade; the undersides of the
// leaves are a paler, yellower green (never the grey of a back-lit card)
diffuseColor.rgb *= lTint * (0.4 + 0.68 * vSh);
if (!gl_FrontFacing) diffuseColor.rgb *= vec3(1.06, 1.1, 0.9);`)
      // leaf cuticle sheen is weak and broken up by the leaf's microrelief: the grazing-angle Fresnel of
      // a smooth dielectric turns edge-on cards into white flecks (reads as blossom from a distance)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectSpecular *= 0.3; reflectedLight.directSpecular *= 0.55;`);
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
  mat.customProgramCacheKey = () => `nature-leaf-v3-${S.leaf.kind}${photo ? '-photo' : ''}`;
  return mat;
}

/** far-crown material: foliage-mass shading (gaps, darker inside and below), light through the edge */
export function crownMaterial(S) {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...S.leafCol).multiplyScalar(1.4), roughness: 0.8, metalness: 0, envMapIntensity: 0.6 });
  const U = { cLeaf: { value: 1.6 / Math.max(0.2, S.leaf.size) }, cTrans: { value: new THREE.Color(0.18, 0.26, 0.05) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aH; attribute float aTrunk; varying float vH; varying float vTr; varying vec3 vCW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = aH; vTr = aTrunk;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{ vec4 w = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  w = instanceMatrix * w;
#endif
  vCW = (modelMatrix * w).xyz; }`);
    let fs = sh.fragmentShader.replace('#include <common>', `#include <common>
varying float vH; varying float vTr; varying vec3 vCW; uniform float cLeaf; uniform vec3 cTrans;
${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float n1 = dkVN3(vCW * cLeaf), n2 = dkVN3(vCW * cLeaf * 2.6 + 7.0), n3 = dkVN3(vCW * 0.35 + 3.0);
  diffuseColor.rgb *= mix(0.3, 1.3, smoothstep(0.25, 0.75, n1 * 0.6 + n2 * 0.4)) * (0.8 + 0.4 * n3);
  diffuseColor.rgb *= mix(0.45, 1.05, smoothstep(0.0, 0.8, vH));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.04, 0.03), vTr);
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 b = vec3(dkVN3(vCW * cLeaf * 1.2) - 0.5, dkVN3(vCW * cLeaf * 1.2 + 5.0) - 0.5, dkVN3(vCW * cLeaf * 1.2 + 9.0) - 0.5);
  normal = normalize(normal + (viewMatrix * vec4(b * 1.1 * (1.0 - vTr), 0.0)).xyz);
}`);
    const chunk = THREE.ShaderChunk.lights_fragment_begin;
    const a0 = chunk.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
    const b0 = a0 >= 0 ? chunk.indexOf('#endif', chunk.indexOf('#pragma unroll_loop_end', a0)) : -1;
    if (a0 >= 0 && b0 > a0) {
      let block = chunk.slice(a0, b0 + '#endif'.length);
      block = block.replace(/RE_Direct\(\s*directLight[^;]*;/, 'reflectedLight.directDiffuse += directLight.color * cTrans * diffuseColor.rgb * 2.5 * pow(saturate(dot(-geometryViewDir, directLight.direction)), 2.0) * (1.0 - vTr) * RECIPROCAL_PI;');
      fs = fs.replace('#include <lights_fragment_begin>', '#include <lights_fragment_begin>\n{\n' + block + '\n}\n');
    }
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `nature-crown-${S.leaf.kind}`;
  return mat;
}

// ------------------------------------------------------------------ kits ---
/** far LOD: the crown as 5-10 foliage masses (clusters of the real leaf positions, with sky between
 *  them) on the tree's own trunk and main limbs at their true girth - not one ball on a stick */
export function crownGeometry(tree) {
  const L = tree.leaves;
  const pts = L.map((l) => l.p);
  const bb = new THREE.Box3().setFromPoints(pts.length ? pts : [new THREE.Vector3(0, tree.height * 0.6, 0)]);
  const sz = bb.getSize(new THREE.Vector3());
  const N = makeNoise(5);
  // cluster the leaves: farthest-point seeds, then nearest-seed assignment
  const K = clamp(Math.round(L.length / 260), 4, 10);
  const seeds = [];
  if (pts.length) {
    seeds.push(pts[0].clone());
    const dmin = pts.map((p) => p.distanceToSquared(seeds[0]));
    while (seeds.length < Math.min(K, pts.length)) {
      let bi = 0; for (let i = 1; i < pts.length; i++) if (dmin[i] > dmin[bi]) bi = i;
      seeds.push(pts[bi].clone());
      for (let i = 0; i < pts.length; i++) dmin[i] = Math.min(dmin[i], pts[i].distanceToSquared(seeds[seeds.length - 1]));
    }
  } else seeds.push(new THREE.Vector3(0, tree.height * 0.6, 0));
  const acc = seeds.map(() => ({ n: 0, s: new THREE.Vector3(), q: new THREE.Vector3() }));
  for (const p of pts) {
    let bi = 0, bd = Infinity;
    seeds.forEach((c, i) => { const d = p.distanceToSquared(c); if (d < bd) { bd = d; bi = i; } });
    const A = acc[bi]; A.n++; A.s.add(p); A.q.add(new THREE.Vector3(p.x * p.x, p.y * p.y, p.z * p.z));
  }
  const pos = [], aH = [], aT = [];
  const pushGeo = (g, trunk) => {
    const gp = (g.index ? g.toNonIndexed() : g).attributes.position;
    for (let i = 0; i < gp.count; i++) {
      pos.push(gp.getX(i), gp.getY(i), gp.getZ(i));
      aH.push(clamp((gp.getY(i) - bb.min.y) / Math.max(sz.y, 0.1), 0, 1));
      aT.push(trunk ? 1 : 0);
    }
  };
  acc.forEach((A, k) => {
    if (A.n < 6) return;
    const c = A.s.clone().multiplyScalar(1 / A.n);
    const v = A.q.clone().multiplyScalar(1 / A.n).sub(new THREE.Vector3(c.x * c.x, c.y * c.y, c.z * c.z));
    const rx = Math.sqrt(Math.max(v.x, 0.01)) * 1.9, ry = Math.sqrt(Math.max(v.y, 0.01)) * 1.8, rz = Math.sqrt(Math.max(v.z, 0.01)) * 1.9;
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position, w = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      w.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
      const kk = 0.82 + 0.3 * N.n3(w.x * 2.2 + k, w.y * 2.2, w.z * 2.2) + 0.12 * N.n3(w.x * 5 + k, w.y * 5, w.z * 5);
      // flat-bottomed masses (the underside of a foliage cluster is shaded and cut off)
      const yy = w.y < -0.3 ? -0.3 + (w.y + 0.3) * 0.45 : w.y;
      p.setXYZ(i, c.x + w.x * rx * kk, c.y + yy * ry * kk, c.z + w.z * rz * kk);
    }
    pushGeo(g, false);
  });
  // the trunk and the main limbs (4-sided tubes)
  for (const b of tree.branches) {
    if (b.level > 1 || b.rad[0] < 0.05 || b.root) continue;
    for (let i = 0; i < b.pts.length - 1; i++) {
      const a0 = b.pts[i], a1 = b.pts[i + 1];
      const len = a0.distanceTo(a1);
      if (len < 1e-3) continue;
      const cyl = new THREE.CylinderGeometry(b.rad[i + 1] * (b.trunk && i === 0 ? 1.4 : 1), b.rad[i] * (b.trunk && i === 0 ? 1.9 : 1), len, b.level === 0 ? 6 : 4, 1, true);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), a1.clone().sub(a0).normalize());
      cyl.applyQuaternion(q); cyl.translate((a0.x + a1.x) / 2, (a0.y + a1.y) / 2, (a0.z + a1.z) / 2);
      pushGeo(cyl, true);
    }
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('aH', new THREE.Float32BufferAttribute(aH, 1));
  merged.setAttribute('aTrunk', new THREE.Float32BufferAttribute(aT, 1));
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

const kitCache = new Map();
/**
 * A species kit: variants x LODs of bark + leaf geometry with shared materials.
 * opts: variants (3), exposure (0..1), scale, seed.
 */
export async function treeKit(ctx, species, opts = {}) {
  const key = `${species}|${opts.variants ?? 3}|${opts.exposure ?? 0}|${opts.scale ?? 1}|${opts.seed ?? 0}`;
  if (kitCache.has(key)) return kitCache.get(key);
  const S = SPECIES[species];
  const atlas = (await photoLeafAtlas(S.leaf.kind)) || leafAtlas(S.leaf.kind);
  const bark = await barkMaterial(ctx, S);
  const leaf = leafMaterial(S, atlas);
  const nv = opts.variants ?? 3;
  const vars = [];
  for (let v = 0; v < nv; v++) {
    const tree = generateTree(species, { seed: (opts.seed ?? 0) * 100 + v + 1, exposure: opts.exposure ?? 0, scale: opts.scale ?? 1 });
    const lods = [0, 1, 2].map((l) => ({ bark: barkGeometry(tree, l), leaves: leafGeometry(tree, l) }));
    lods.push({ crown: crownGeometry(tree) });
    vars.push({ tree, lods });
  }
  const kit = {
    species, S, bark, leaf, atlas, variants: vars, crown: crownMaterial(S),
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
    const lod = d < (opts.lod0 ?? 60) ? 0 : d < (opts.lod1 ?? 300) ? 1 : d < (opts.lod2 ?? 650) ? 2 : 3;
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
    const parts = lod === 3 ? [[L.crown, kit.crown]] : [[L.bark, kit.bark], [L.leaves, kit.leaf]];
    for (const [geo, mat] of parts) {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((mm, i) => mesh.setMatrixAt(i, mm));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = lod < 3 || opts.farShadows !== false; mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  return { group };
}
