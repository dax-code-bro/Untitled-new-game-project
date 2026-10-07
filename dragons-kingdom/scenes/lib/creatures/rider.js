// Human rider placeholder + saddle / riding rig.
//
// The rider is the CC0 MakeHuman base mesh (assets-lib/human/makehuman_base:
// base.obj + default rig + weights, CC0 1.0) built into a three.js
// SkinnedMesh, posed by bone rotations into a riding pose, and dressed by
// region (outer layer, trousers, boots, gloves; MakeHuman's own CC0 helper
// meshes give the trouser layer and a hair cap). Good for wide and medium
// shots; faces are untextured placeholders (the face rig is a separate job).
//
// Outfits follow the screenplay's suggestion: Remi = practical dark riding
// clothes with a muted BLUE outer layer (kept light enough to read against
// black Charcoal); Abby = riding clothes with a muted GREEN outer layer (a
// grey sage, deliberately different from Leaf's olive green).
//
// The saddle is generated on the creature: its underside follows the back
// (sampled from the creature's SDF), girth and breast straps follow the real
// body cross-section, and every vertex is skinned like the nearest body
// vertex, so the tack moves and breathes with the dragon. A big dragon gets
// a "riding rig" instead: a padded seat block strapped on with broad bands.
//
//   const human = await loadHuman();                    // in setup()
//   const remi = createRider(human, { outfit: 'remi' });
//   const tack = createSaddle(charcoal, { });           // adds to charcoal.root
//   mountRider(charcoal, tack, remi);                    // rider follows the dragon
import * as THREE from 'three';
import { LIB_URL } from '../assets.js';

const ID = 'human/makehuman_base/';

/** Fetch and parse the MakeHuman data (call once in setup). */
export async function loadHuman() {
  const [obj, rig, weights] = await Promise.all([
    fetch(new URL(ID + 'base.obj', LIB_URL)).then((r) => { if (!r.ok) throw new Error('MakeHuman base.obj not downloaded (node assets-lib/fetch.mjs)'); return r.text(); }),
    fetch(new URL(ID + 'rig.default.json', LIB_URL)).then((r) => r.json()),
    fetch(new URL(ID + 'weights.default.json', LIB_URL)).then((r) => r.json()),
  ]);
  return parseHuman(obj, rig, weights);
}

/** Parse MakeHuman OBJ text + rig JSON + weights JSON (usable outside the browser too). */
export function parseHuman(obj, rig, weights) {
  // OBJ: y up, decimetres, faces +z, character's left = +x
  const V = [];
  const groups = {};
  let g = null;
  for (const line of obj.split('\n')) {
    if (line.startsWith('v ')) { const p = line.split(/\s+/); V.push(+p[1] * 0.1, +p[2] * 0.1, +p[3] * 0.1); }
    else if (line.startsWith('g ')) { g = line.slice(2).trim(); groups[g] = groups[g] || []; }
    else if (line.startsWith('f ') && g) {
      const idx = line.trim().split(/\s+/).slice(1).map((t) => parseInt(t, 10) - 1);
      for (let i = 1; i < idx.length - 1; i++) groups[g].push(idx[0], idx[i], idx[i + 1]);
    }
  }
  // rig: Blender coordinates (z up, -y forward), metres -> three: (x, z, -y)
  const toT = (p) => [p[0], p[2], -p[1]];
  const bones = Object.entries(rig).map(([name, b]) => ({ name, parent: b.parent || null, head: toT(b.head.default_position), tail: toT(b.tail.default_position) }));
  return { V: Float32Array.from(V), groups, bones, weights: weights.weights };
}

// region colours (linear) per outfit
const OUTFITS = {
  remi: { jacket: [0.075, 0.105, 0.16], trousers: [0.028, 0.026, 0.026], boots: [0.02, 0.014, 0.01], gloves: [0.03, 0.022, 0.016], hair: [0.03, 0.02, 0.013], skin: [0.42, 0.27, 0.19], belt: [0.05, 0.032, 0.02] },
  abby: { jacket: [0.13, 0.155, 0.11], trousers: [0.05, 0.038, 0.028], boots: [0.025, 0.017, 0.011], gloves: [0.045, 0.03, 0.02], hair: [0.05, 0.03, 0.018], skin: [0.45, 0.29, 0.21], belt: [0.06, 0.038, 0.022] },
  fall: { jacket: [0.06, 0.05, 0.06], trousers: [0.03, 0.028, 0.03], boots: [0.018, 0.014, 0.012], gloves: [0.025, 0.02, 0.018], hair: [0.02, 0.015, 0.012], skin: [0.4, 0.26, 0.18], belt: [0.04, 0.03, 0.02] },
  scout: { jacket: [0.06, 0.055, 0.045], trousers: [0.045, 0.04, 0.032], boots: [0.022, 0.017, 0.012], gloves: [0.035, 0.028, 0.02], hair: [0.05, 0.045, 0.035], skin: [0.06, 0.05, 0.04], belt: [0.04, 0.03, 0.02], hood: true },
};
const REGION = { skin: 0, jacket: 1, trousers: 2, boots: 3, gloves: 4, hair: 5, belt: 6 };

function classify(boneName, y) {
  if (/^(head|jaw|neck|eye|oculi|tongue|orbicularis|levator|temporalis|risorius|oris|special)/.test(boneName)) return 'skin';
  if (/^(wrist|metacarpal|finger)/.test(boneName)) return 'gloves';
  if (/^(foot|toe)/.test(boneName)) return 'boots';
  if (/^lowerleg/.test(boneName)) return y < -0.42 ? 'boots' : 'trousers';
  if (/^(upperleg|pelvis)/.test(boneName)) return y > -0.06 ? 'jacket' : 'trousers';
  return 'jacket';
}

/**
 * Build a posed rider. opts.outfit 'remi'|'abby'|'fall'|'scout';
 * opts.pose: 'ride' (default) or 'stand'; opts.lean (rad), opts.reach (0..1).
 */
export function createRider(human, opts = {}) {
  // outfit: a name from OUTFITS or an object with the same region colours (sets/people.js)
  const outfit = typeof opts.outfit === 'object' && opts.outfit ? opts.outfit : OUTFITS[opts.outfit || 'remi'];
  const outfitName = typeof opts.outfit === 'object' && opts.outfit ? (opts.outfit.name || 'custom') : (opts.outfit || 'remi');
  const { V, groups, bones: rb, weights } = human;
  // --- bones (identity rest orientation)
  const index = {}, pos = {};
  rb.forEach((b, i) => { index[b.name] = i; pos[b.name] = b.head; });
  const bones = rb.map((b) => { const o = new THREE.Bone(); o.name = b.name; return o; });
  let rootBone = null;
  rb.forEach((b, i) => {
    const o = bones[i];
    if (b.parent && index[b.parent] !== undefined) {
      const pp = pos[b.parent];
      o.position.set(b.head[0] - pp[0], b.head[1] - pp[1], b.head[2] - pp[2]);
      bones[index[b.parent]].add(o);
    } else { o.position.set(...b.head); rootBone = o; }
  });
  // --- per-vertex top-4 weights
  const nV = V.length / 3;
  const lists = Array.from({ length: nV }, () => []);
  for (const [bn, arr] of Object.entries(weights)) {
    const bi = index[bn];
    if (bi === undefined) continue;
    for (const [vi, w] of arr) if (vi < nV) lists[vi].push([bi, w]);
  }
  const si = new Uint16Array(nV * 4), sw = new Float32Array(nV * 4), region = new Float32Array(nV);
  for (let v = 0; v < nV; v++) {
    const l = lists[v].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const s = l.reduce((q, e) => q + e[1], 0) || 1;
    for (let k = 0; k < 4; k++) { si[v * 4 + k] = l[k] ? l[k][0] : (l[0] ? l[0][0] : 0); sw[v * 4 + k] = l[k] ? l[k][1] / s : 0; }
    region[v] = REGION[l[0] ? classify(rb[l[0][0]].name, V[v * 3 + 1]) : 'jacket'];
  }

  const root = new THREE.Group();
  root.name = `rider:${outfitName}`;
  root.add(rootBone);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const mat = riderMaterial(outfit);
  const parts = [];
  const make = (gname, regionOverride, inflate = 0, keepTri = null) => {
    let tri = groups[gname];
    if (tri && keepTri) { const k = []; for (let i = 0; i < tri.length; i += 3) if (keepTri(tri[i], tri[i + 1], tri[i + 2])) k.push(tri[i], tri[i + 1], tri[i + 2]); tri = k; }
    if (!tri || !tri.length) return null;
    // compact the vertex set of this group
    const map = new Map(), P = [], I = [], S = [], W = [], R = [];
    for (const v of tri) {
      if (!map.has(v)) {
        map.set(v, P.length / 3);
        P.push(V[v * 3], V[v * 3 + 1], V[v * 3 + 2]);
        for (let k = 0; k < 4; k++) { S.push(si[v * 4 + k]); W.push(sw[v * 4 + k]); }
        R.push(regionOverride ?? region[v]);
      }
      I.push(map.get(v));
    }
    // loose clothing (opts.clothSmooth = iterations): Laplacian-smooth the clothed regions so the
    // garment hangs over the body instead of showing its anatomy (sets/people.js uses it)
    if (opts.clothSmooth && gname === 'body') {
      const nV = P.length / 3, sets = Array.from({ length: nV }, () => new Set());
      for (let i = 0; i < I.length; i += 3) { const a = I[i], b = I[i + 1], c = I[i + 2]; sets[a].add(b).add(c); sets[b].add(a).add(c); sets[c].add(a).add(b); }
      const nb = sets.map((st) => Int32Array.from(st));
      const cloth = (r) => r === REGION.jacket || r === REGION.trousers;
      // the base mesh has dense vertex clusters (nipples): a uniform Laplacian step barely moves
      // them while the coarse surface around them shrinks, which leaves them standing proud -
      // dense vertices get extra sub-steps so the smoothing acts at the same physical rate
      const sub = new Uint8Array(nV);
      for (let v = 0; v < nV; v++) {
        if (!cloth(R[v]) || !nb[v].length) continue;
        let h = 0;
        for (const u of nb[v]) h += Math.hypot(P[u * 3] - P[v * 3], P[u * 3 + 1] - P[v * 3 + 1], P[u * 3 + 2] - P[v * 3 + 2]);
        h /= nb[v].length;
        sub[v] = Math.max(1, Math.min(40, Math.round((0.012 / Math.max(h, 1e-4)) ** 2)));
      }
      const maxSub = sub.reduce((m, x) => Math.max(m, x), 1);
      let cur = Float32Array.from(P), nx = new Float32Array(P.length);
      const k = 0.55;
      for (let it = 0; it < opts.clothSmooth; it++) {
        for (let s = 0; s < maxSub; s++) {
          nx.set(cur);
          for (let v = 0; v < nV; v++) {
            if (sub[v] <= s) continue;
            let x = 0, y = 0, z = 0;
            for (const u of nb[v]) { x += cur[u * 3]; y += cur[u * 3 + 1]; z += cur[u * 3 + 2]; }
            const n = nb[v].length;
            nx[v * 3] += k * (x / n - cur[v * 3]); nx[v * 3 + 1] += k * (y / n - cur[v * 3 + 1]); nx[v * 3 + 2] += k * (z / n - cur[v * 3 + 2]);
          }
          const t = cur; cur = nx; nx = t;
        }
      }
      for (let i = 0; i < P.length; i++) P[i] = cur[i];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setIndex(I);
    geo.computeVertexNormals();
    if (inflate) {
      const p = geo.attributes.position, n = geo.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        const r = R[i];
        const d = typeof inflate === 'function' ? inflate(r, p.getY(i)) : inflate;
        p.setXYZ(i, p.getX(i) + n.getX(i) * d, p.getY(i) + n.getY(i) * d, p.getZ(i) + n.getZ(i) * d);
      }
      geo.computeVertexNormals();
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(S, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(W, 4));
    geo.setAttribute('aRegion', new THREE.Float32BufferAttribute(R, 1));
    const m = new THREE.SkinnedMesh(geo, mat);
    m.name = `${root.name}:${gname}`;
    m.castShadow = m.receiveShadow = true;
    m.frustumCulled = false;
    root.add(m);
    m.bind(skeleton, new THREE.Matrix4());
    parts.push(m);
    return m;
  };
  // body: clothes are the body surface pushed out a little (jacket loosest)
  const cs = opts.clothSmooth ? 1 : 0;
  make('body', null, (r, y) => (r === REGION.jacket ? 0.012 + 0.02 * cs + (y < 0.15 ? 0.008 : 0) : r === REGION.trousers ? 0.006 + 0.004 * cs : r === REGION.boots ? 0.007 : r === REGION.gloves ? 0.002 : 0));
  // trousers: the tights helper below the waist only (above it the jacket covers the body)
  if (!opts.clothSmooth) make('helper-tights', REGION.trousers, 0.004, (a, b, c) => Math.max(V[a * 3 + 1], V[b * 3 + 1], V[c * 3 + 1]) < 0.06);
  // hair: 'helper' = MakeHuman's long-hair proxy (the original look); 'cap' = short hair / a cap
  // following the skull (head vertices above the hairline, pushed out); 'bun' = cap + hair tied
  // back in a bun; 'none'
  const hairMode = opts.hair ?? outfit.hairMode ?? 'helper';
  if (hairMode === 'helper') make('helper-hair', REGION.hair, 0.004);
  else if (hairMode === 'cap' || hairMode === 'bun' || hairMode === 'veil') {
    const clamp01 = (x) => Math.min(1, Math.max(0, x));
    const top = 0.849;      // MakeHuman base mesh: top of the head (metres above the hips)
    const front = hairMode === 'veil' ? 0.078 : 0.068;   // a coif comes down a little lower on the brow
    const inCap = (i) => { const x = V[i * 3], y = V[i * 3 + 1], z = V[i * 3 + 2]; const back = clamp01((0.09 - z) / 0.13); return y > top - (front + 0.115 * back) && Math.abs(x) < 0.12 && y > 0.55; };
    make('body', REGION.hair, (r, y) => 0.005 + 0.012 * clamp01((y - 0.72) / 0.12), (a, b, c) => inCap(a) && inCap(b) && inCap(c));
    if (hairMode === 'bun') {
      const g = new THREE.SphereGeometry(0.048, 14, 10);
      g.scale(1.0, 0.85, 0.8);
      g.translate(0, 0.75, -0.075);
      const n = g.attributes.position.count, hb = index.head ?? 0;
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0).map((_, k) => (k % 4 === 0 ? hb : 0)), 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n * 4).fill(0).map((_, k) => (k % 4 === 0 ? 1 : 0)), 4));
      g.setAttribute('aRegion', new THREE.Float32BufferAttribute(new Array(n).fill(REGION.hair), 1));
      const m = new THREE.SkinnedMesh(g, mat);
      m.name = `${root.name}:bun`; m.castShadow = m.receiveShadow = true; m.frustumCulled = false;
      root.add(m); m.bind(skeleton, new THREE.Matrix4()); parts.push(m);
    }
    if (hairMode === 'veil') {
      // a linen veil over the coif: open at the face, falling over the back of the head, the
      // neck and the shoulders (rings of an elliptical drape around the head/neck axis, with a
      // few soft folds toward the hem); upper part follows the head, lower part the chest
      const rings = [
        // y      ax     az     zc     open (half-angle round the back)
        [0.866, 0.036, 0.044, 0.054, 2.1], [0.842, 0.072, 0.09, 0.056, 2.02], [0.802, 0.093, 0.112, 0.058, 1.98],
        [0.752, 0.102, 0.12, 0.058, 1.94], [0.70, 0.104, 0.12, 0.052, 1.88], [0.645, 0.11, 0.114, 0.04, 1.8],
        [0.598, 0.13, 0.11, 0.028, 1.72], [0.562, 0.17, 0.118, 0.022, 1.66], [0.528, 0.195, 0.128, 0.016, 1.6],
        [0.49, 0.2, 0.134, 0.01, 1.52], [0.45, 0.196, 0.136, 0.004, 1.42],
      ];
      const NU = 40, seed = (opts.seed ?? 3) * 1.37;
      const pos = [], idx = [], skI = [], skW = [];
      const hb = index.head ?? 0, sb = index.spine01 ?? hb;
      rings.forEach(([y, ax, az, zc, open], j) => {
        const v = j / (rings.length - 1);
        for (let i = 0; i <= NU; i++) {
          const ph = -open + (2 * open * i) / NU;
          const fold = 1 + v * v * 0.07 * Math.sin(ph * 6 + seed) + v * 0.025 * Math.sin(ph * 11 + seed * 2.1);
          pos.push(Math.sin(ph) * ax * fold, y - v * v * 0.012 * (1 + Math.cos(ph * 5 + seed)), zc - Math.cos(ph) * az * fold);
          const wh = Math.min(1, Math.max(0, (y - 0.585) / 0.105));
          skI.push(hb, sb, 0, 0); skW.push(wh, 1 - wh, 0, 0);
        }
      });
      for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < NU; i++) {
        const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skI, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skW, 4));
      // shaded as cloth (the jacket slot of its own material, coloured like the coif)
      g.setAttribute('aRegion', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(REGION.jacket), 1));
      const vm = riderMaterial({ ...outfit, jacket: outfit.hair }); vm.side = THREE.DoubleSide;
      const m = new THREE.SkinnedMesh(g, vm);
      m.name = `${root.name}:veil`; m.castShadow = m.receiveShadow = true; m.frustumCulled = false;
      root.add(m); m.bind(skeleton, new THREE.Matrix4()); parts.push(m);
    }
  }
  // a tunic / gown skirt from MakeHuman's skirt proxy (opts.skirt: true = to below the knee,
  // or a number = lowest height in metres relative to the hips, e.g. -0.35 for mid-thigh)
  if (opts.skirt) {
    const low = typeof opts.skirt === 'number' ? opts.skirt : -1;
    make('helper-skirt', REGION.jacket, (r, y) => 0.008 + 0.006 * Math.min(1, Math.max(0, -y / 0.6)), (a, b, c) => Math.min(V[a * 3 + 1], V[b * 3 + 1], V[c * 3 + 1]) > low);
  }
  const rider = { root, skeleton, bones, index, parts, restHead: pos, outfit: outfitName };
  rider.setPose = (p) => applyRiderPose(rider, p);
  rider.setPose(opts.pose === 'stand' ? standPose(opts) : ridePose(opts));
  return rider;
}

/** Riding pose: hips flexed and spread to straddle, knees bent, heels down, hands forward at the pommel. */
export function ridePose(o = {}) {
  const lean = o.lean ?? 0.12, reach = o.reach ?? 0.35, spread = o.spread ?? 0.42;
  const r = {};
  const sym = (n, x, y, z) => { r[`${n}.L`] = [x, y, z]; r[`${n}.R`] = [x, -y, -z]; };
  sym('upperleg01', -1.25, 0.18, spread);
  sym('lowerleg01', 1.5, 0, -spread * 0.35);
  sym('foot', -0.3, 0, 0);
  r.spine05 = [lean * 0.3, 0, 0]; r.spine04 = [lean * 0.3, 0, 0]; r.spine03 = [lean * 0.25, 0, 0]; r.spine02 = [lean * 0.15, 0, 0];
  r.neck01 = [-lean * 0.4, 0, 0]; r.head = [-lean * 0.5, 0, 0];
  sym('upperarm01', -0.3 - 0.4 * reach, -0.15, -0.95);
  sym('lowerarm01', -0.7 - 0.5 * reach, -0.55, 0.0);
  sym('wrist', 0.1, 0, 0.15);
  for (const f of ['finger2-1', 'finger3-1', 'finger4-1', 'finger5-1', 'finger2-2', 'finger3-2', 'finger4-2', 'finger5-2']) sym(f, 0, 0, -0.9);
  return { bones: r };
}

/** Relaxed standing pose (arms down from MakeHuman's A-pose, weight on one leg). */
export function standPose(o = {}) {
  const r = {};
  const sym = (n, x, y, z) => { r[`${n}.L`] = [x, y, z]; r[`${n}.R`] = [x, -y, -z]; };
  sym('upperarm01', 0.06, -0.1, -0.95);
  sym('lowerarm01', -0.22, -0.3, 0.05);
  r['upperleg01.L'] = [-0.04, 0.05, 0.02]; r['upperleg01.R'] = [0.03, -0.08, -0.05];
  r['lowerleg01.L'] = [0.06, 0, 0];
  r.head = [o.headPitch ?? -0.05, o.headYaw ?? 0, 0];
  return { bones: r };
}

const _e = new THREE.Euler();
export function applyRiderPose(rider, p) {
  for (const b of rider.bones) b.quaternion.identity();
  for (const [n, v] of Object.entries(p.bones || {})) {
    const i = rider.index[n];
    if (i === undefined) continue;
    rider.bones[i].quaternion.setFromEuler(_e.set(v[0], v[1], v[2], 'YXZ'));
  }
  rider.root.updateMatrixWorld(true);
}

function riderMaterial(o) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
  const U = {
    uCol: { value: [o.skin, o.jacket, o.trousers, o.boots, o.gloves, o.hair, o.belt].map((c) => new THREE.Vector3(...c)) },
    uRough: { value: [0.5, 0.82, 0.8, 0.45, 0.6, 0.7, 0.5] },
  };
  mat.customProgramCacheKey = () => 'dk-rider';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCol = U.uCol; sh.uniforms.uRough = U.uRough;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aRegion; varying float vRegion; varying vec3 vRestP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = aRegion; vRestP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying float vRegion; varying vec3 vRestP;
uniform vec3 uCol[7]; uniform float uRough[7];
float rH(vec3 p) { p = fract(p * 0.3183 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rH(i), rH(i + vec3(1,0,0)), f.x), mix(rH(i + vec3(0,1,0)), rH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(rH(i + vec3(0,0,1)), rH(i + vec3(1,0,1)), f.x), mix(rH(i + vec3(0,1,1)), rH(i + vec3(1,1,1)), f.x), f.y), f.z); }
int rIdx;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
rIdx = int(vRegion + 0.5);
vec3 rc = uCol[0];
for (int i = 0; i < 7; i++) if (i == rIdx) rc = uCol[i];
float wear = rN(vRestP * 40.0) * 0.5 + rN(vRestP * 7.0) * 0.5;
diffuseColor.rgb = rc * (0.8 + 0.4 * wear);`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = 0.7;
for (int i = 0; i < 7; i++) if (i == rIdx) roughnessFactor = uRough[i];`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (rIdx == 1 || rIdx == 2) {   // cloth folds
  float h = rN(vRestP * vec3(25.0, 60.0, 25.0)) * 0.002 + rN(vRestP * 300.0) * 0.0002;
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  vec2 g = vec2(dFdx(h), dFdy(h)) / vec2(max(length(dpx), 1e-6), max(length(dpy), 1e-6));
  vec3 R1 = cross(normalize(dpy), normal), R2 = cross(normal, normalize(dpx));
  float det = dot(normalize(dpx), R1) * faceDirection;
  normal = normalize(abs(det) * normal - sign(det) * (g.x * R1 + g.y * R2));
}`);
  };
  return mat;
}

// ------------------------------------------------------------------ saddle
/**
 * Build tack for a creature. opts.kind 'saddle' (rider straddles the neck
 * base, for creatures up to ~12 m) or 'rig' (a seat block strapped onto a
 * giant's withers); default by size. Returns { group, seat: {bone, local
 * position Vector3 (seat point in the bone's rest frame)}, meshes }.
 */
export function createSaddle(c, opts = {}) {
  const L = c.L;
  const kind = opts.kind ?? (L > 14 ? 'rig' : 'saddle');
  const anat = c.anatomy;
  const sdf = anat.sdf;
  // the body without the wing arms (in the rest pose the wings are spread sideways, and a girth
  // must not follow them out)
  const noWing = (l) => l.filter((i) => !/^w_/.test(sdf.prims[i].bone || ''));
  const f = (x, y, z) => { const l = noWing(sdf.cull(x, y, z, x, y, z, L * 0.05)); return l.length ? Math.min(sdf.evalList(x, y, z, l), L * 0.04) : L * 0.04; };
  // seat position: just behind the neck base, on the dorsal midline
  const sp = anat.bonePos[opts.bone ?? 'neck_0'];
  const fwd = new THREE.Vector3(0, 0, 1);
  const seatZ = sp[2] + (opts.offsetZ ?? (kind === 'rig' ? -0.022 : -0.062)) * L;
  // find the dorsal surface height above (x, z) by marching down
  let seatY0 = null;
  const surfY = (x, z) => {
    const top = sp[1] + L * 0.2;
    let y = top;
    let hit = false;
    for (let i = 0; i < 300; i++) { const d = f(x, y, z); if (d < L * 1e-4) { hit = true; break; } y -= Math.max(d * 0.9, L * 2e-4); if (y < top - L * 0.45) break; }
    // off the body (narrow backs): fall away smoothly from the centre line instead
    if (seatY0 !== null) { const fb = seatY0 - 0.35 * Math.abs(x) - 0.04 * Math.abs(x) / 0.3; if (!hit || y < fb) y = fb; }
    return y;
  };
  const seatY = surfY(0, seatZ);
  seatY0 = seatY;
  // body cross-section contour at z (for girths): march inward from a circle
  const contour = (z, n = 48, cy = seatY - L * 0.04) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const dx = Math.sin(a), dy = Math.cos(a);
      let r = L * 0.15;
      for (let k = 0; k < 120; k++) { const d = f(dx * r, cy + dy * r, z); if (Math.abs(d) < L * 2e-4) break; r -= d * 0.9; if (r < 0) { r = 0; break; } }
      pts.push(new THREE.Vector3(dx * r, cy + dy * r, z));
    }
    return pts;
  };
  const group = new THREE.Group();
  group.name = `${c.name}:tack`;
  const leather = leatherMaterial(opts.leatherColor ?? [0.09, 0.05, 0.028]);
  const strapMat = leatherMaterial([0.055, 0.035, 0.022], 0.6);
  const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.35, 0.33, 0.3), roughness: 0.38, metalness: 1 });
  const geos = [];
  const H = 1.7;    // human scale (metres) - tack is sized for the rider, not the dragon

  // ---- seat
  let halfBody = 0;
  for (let x = 0; x < L * 0.2; x += L * 0.002) { if (f(x, seatY - L * 0.01, seatZ) > 0) break; halfBody = x; }
  const seatLen = kind === 'rig' ? 1.35 : 0.62, seatW = kind === 'rig' ? 0.75 : Math.min(0.5, Math.max(0.3, halfBody * 2.2)), block = kind === 'rig' ? 0.38 : 0.0;
  {
    const nu = 28, nv = 22;
    const P = [], I = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;                                    // back (0) -> front (1)
      const z = seatZ + (u - 0.5) * seatLen;
      for (let j = 0; j <= nv; j++) {
        const v = j / nv;                                  // left -> right across
        const x = (v - 0.5) * seatW * (1 - 0.25 * Math.pow(Math.abs(u - 0.5) * 2, 3));
        const base = surfY(x, z);
        // padded top: cantle (back) and pommel (front) raised, seat dished, edges rolled
        const edge = Math.sin(Math.PI * v);
        const cant = Math.exp(-Math.pow((u - 0.06) / 0.08, 2)) * 0.11 + Math.exp(-Math.pow((u - 0.94) / 0.06, 2)) * 0.13;
        const top = block + 0.05 + 0.04 * edge + cant * (0.6 + 0.4 * (1 - Math.abs(v - 0.5) * 2));
        P.push(x, base + top * Math.pow(edge, 0.35), z);
      }
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    geos.push([g, leather]);
    // saddle flaps / skirts hanging down both sides
    for (const sd of [1, -1]) {
      const Pf = [], If = [];
      const nz = 12, ny = 10;
      for (let i = 0; i <= nz; i++) {
        const z = seatZ + (i / nz - 0.5) * seatLen * 0.8;
        const x0 = sd * seatW * 0.45;
        for (let j = 0; j <= ny; j++) {
          // follow the body surface downward from the seat edge
          const t = j / ny;
          const a = t * 0.9;
          let r = L * 0.2;
          const cx = 0, cy = seatY - L * 0.04;
          const dx = sd * Math.sin(0.35 + a), dy = Math.cos(0.35 + a);
          for (let k = 0; k < 80; k++) { const d = f(cx + dx * r, cy + dy * r, z); if (Math.abs(d) < L * 2e-4) break; r -= d * 0.9; }
          const off = 0.012 + 0.02 * (1 - t);
          Pf.push(cx + dx * (r + off), cy + dy * (r + off), z);
          if (j === 0) { Pf[Pf.length - 3] = x0; }
        }
      }
      // keep only the part within ~0.45 m below the seat edge
      for (let i = 0; i < nz; i++) for (let j = 0; j < ny; j++) { const a = i * (ny + 1) + j, b = a + ny + 1; if (sd > 0) If.push(a, a + 1, b, a + 1, b + 1, b); else If.push(a, b, a + 1, a + 1, b, b + 1); }
      const gf = new THREE.BufferGeometry(); gf.setAttribute('position', new THREE.Float32BufferAttribute(Pf, 3)); gf.setIndex(If); gf.computeVertexNormals();
      clipToDistance(gf, new THREE.Vector3(sd * seatW * 0.45, seatY, seatZ), kind === 'rig' ? 0.9 : 0.3);
      geos.push([gf, leather]);
    }
  }
  // ---- girth strap(s): bands around the real body cross-section
  const strap = (z, width, thick = 0.008) => {
    const ring = contour(z);
    const P = [], I = [];
    const n = ring.length;
    // centroid for outward offsets
    const cen = ring.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / n);
    for (let i = 0; i <= n; i++) {
      const p = ring[i % n];
      const out = p.clone().sub(cen); out.z = 0; out.normalize();
      const q = p.clone().addScaledVector(out, thick + 0.004);
      P.push(q.x, q.y, q.z - width / 2, q.x, q.y, q.z + width / 2);
    }
    for (let i = 0; i < n; i++) { const a = i * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    geos.push([g, strapMat]);
  };
  if (kind === 'rig') { strap(seatZ - 0.35, 0.32); strap(seatZ + 0.45, 0.32); strap(seatZ + 1.6, 0.25); }
  else { strap(seatZ - Math.max(0.05, L * 0.032), 0.1); }      // one girth, behind the forelegs
  // ---- stirrups (saddle) / foot boards (rig)
  if (opts.stirrups) for (const sd of [1, -1]) {
    const side = new THREE.Vector3(sd * (seatW * 0.5 + (kind === 'rig' ? 0.05 : 0.02)), seatY + block * 0.6, seatZ + 0.02);
    const drop = kind === 'rig' ? 0.55 : 0.62;
    const sx = side.x + sd * (kind === 'rig' ? 0.02 : 0.06);
    const strapG = new THREE.BoxGeometry(0.008, drop, 0.03); strapG.translate(sx, side.y - drop / 2, side.z);
    geos.push([strapG, strapMat]);
    const iron = new THREE.TorusGeometry(0.065, 0.007, 6, 20); iron.rotateY(Math.PI / 2); iron.translate(sx, side.y - drop - 0.05, side.z);
    geos.push([iron, metal]);
  }
  if (kind === 'rig') {
    // grab handle in front of the seat
    const bar = new THREE.TorusGeometry(0.16, 0.018, 8, 24, Math.PI); bar.rotateY(Math.PI / 2); bar.rotateZ(0); bar.translate(0, seatY + block + 0.12, seatZ + seatLen * 0.45);
    geos.push([bar, metal]);
  }

  // ---- skin everything to the nearest body vertex of the creature
  const body = c.meshes[0];
  const bp = body.geometry.attributes.position, bsi = body.geometry.attributes.skinIndex, bsw = body.geometry.attributes.skinWeight;
  const cell = L * 0.02;
  const hash = new Map();
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const box = new THREE.Box3(new THREE.Vector3(-seatW * 2 - L * 0.12, seatY - L * 0.2, seatZ - 2.5 - L * 0.05), new THREE.Vector3(seatW * 2 + L * 0.12, seatY + 1, seatZ + 2.5 + L * 0.05));
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    if (!box.containsPoint(new THREE.Vector3(x, y, z))) continue;
    const k = key(x, y, z);
    if (!hash.has(k)) hash.set(k, []);
    hash.get(k).push(i);
  }
  const nearest = (x, y, z) => {
    let best = -1, bd = Infinity;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    for (let r = 1; r <= 6 && best < 0; r++) {
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
        const list = hash.get(`${cx + i},${cy + j},${cz + k}`);
        if (!list) continue;
        for (const v of list) { const dx = bp.getX(v) - x, dy = bp.getY(v) - y, dz = bp.getZ(v) - z; const d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = v; } }
      }
    }
    return best;
  };
  const meshes = [];
  for (const [g, m] of geos) {
    const p = g.attributes.position;
    const S = new Uint16Array(p.count * 4), W = new Float32Array(p.count * 4);
    // the tack rides the trunk: each vertex takes the skinning of the nearest body vertex, but
    // only its trunk bones (thorax, ribs) - following the neck or the shoulders would fold the
    // seat up like a fin when the neck bends and drag the straps off with the forelegs
    const rigid = c.boneIndex[opts.rigidBone ?? 'thorax'];
    const trunk = new Set(['thorax', 'rib_thorax', 'rib_body', 'body', 'rib_lumbar', 'lumbar'].map((n) => c.boneIndex[n]).filter((x) => x !== undefined));
    const boneW = new Map();
    for (let i = 0; i < p.count; i++) {
      const v = nearest(p.getX(i), p.getY(i), p.getZ(i));
      if (v < 0 || opts.rigid === true) { S[i * 4] = rigid ?? c.boneIndex[opts.bone ?? 'neck_0']; W[i * 4] = 1; continue; }
      boneW.clear();
      for (let k = 0; k < 4; k++) {
        const w = bsw.getComponent(v, k); if (w <= 0) continue;
        const b0 = bsi.getComponent(v, k), b = trunk.has(b0) ? b0 : rigid;
        boneW.set(b, (boneW.get(b) || 0) + w);
      }
      const ent = [...boneW.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = ent.reduce((q, e) => q + e[1], 0) || 1;
      for (let k = 0; k < 4; k++) { S[i * 4 + k] = ent[k] ? ent[k][0] : rigid; W[i * 4 + k] = ent[k] ? ent[k][1] / sum : 0; }
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(S, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(W, 4));
    const sm = new THREE.SkinnedMesh(g, m);
    sm.castShadow = sm.receiveShadow = true;
    sm.frustumCulled = false;
    c.root.add(sm);
    sm.bind(c.skeleton, new THREE.Matrix4());
    meshes.push(sm);
  }
  const seatPoint = new THREE.Vector3(0, seatY + block + 0.07, seatZ - seatLen * 0.08);
  // the seat follows the bone that owns the nearest body vertex at the seat
  const sv = nearest(0, seatY, seatZ);
  let seatBone = opts.rigid !== false && c.boneIndex[opts.rigidBone ?? 'thorax'] !== undefined ? c.bones[c.boneIndex[opts.rigidBone ?? 'thorax']]
    : (sv >= 0 ? c.bones[bsi.getComponent(sv, 0)] : c.bones[c.boneIndex['neck_0']]);
  if (/^rib_/.test(seatBone.name)) seatBone = seatBone.parent;      // never ride a breathing (scaled) bone
  return { kind, meshes, seatPoint, seatBone, seatZ, seatY, block, seatLen };
}

function clipToDistance(g, center, maxD) {
  const p = g.attributes.position, idx = g.index.array, keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    let ok = true;
    for (let k = 0; k < 3; k++) { const v = idx[t + k]; const d = Math.hypot(p.getX(v) - center.x, p.getY(v) - center.y, p.getZ(v) - center.z); if (d > maxD) ok = false; }
    if (ok) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  g.setIndex(keep);
}

function leatherMaterial(col, rough = 0.5) {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...col), roughness: rough, metalness: 0 });
  mat.customProgramCacheKey = () => 'dk-leather';
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vLP;
float lH(vec3 p) { p = fract(p * 0.3183 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float lN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lH(i), lH(i + vec3(1,0,0)), f.x), mix(lH(i + vec3(0,1,0)), lH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(lH(i + vec3(0,0,1)), lH(i + vec3(1,0,1)), f.x), mix(lH(i + vec3(0,1,1)), lH(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float lw = lN(vLP * 9.0) * 0.6 + lN(vLP * 45.0) * 0.4;
diffuseColor.rgb *= 0.7 + 0.6 * lw;`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness * (0.8 + 0.4 * lN(vLP * 30.0));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ float h = lN(vLP * 400.0) * 0.00025 + lN(vLP * 60.0) * 0.0006;
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  vec2 g = vec2(dFdx(h), dFdy(h)) / vec2(max(length(dpx), 1e-6), max(length(dpy), 1e-6));
  vec3 R1 = cross(normalize(dpy), normal), R2 = cross(normal, normalize(dpx));
  float det = dot(normalize(dpx), R1) * faceDirection;
  normal = normalize(abs(det) * normal - sign(det) * (g.x * R1 + g.y * R2)); }`);
  };
  return mat;
}

/**
 * Seat the rider on the tack: the rider becomes a child of the seat bone,
 * positioned at the seat point in the bone's REST frame (the bone's current
 * world matrix is undone by its rest inverse), so it rides along with every
 * pose of the creature.
 */
export function mountRider(c, tack, rider, opts = {}) {
  const bone = tack.seatBone;
  const holder = new THREE.Group();
  holder.name = `${rider.root.name}:mount`;
  // rest-pose world position of the bone = its bind position
  const bi = c.bones.indexOf(bone);
  const inv = c.skeleton.boneInverses[bi];
  const restWorld = new THREE.Matrix4().copy(inv).invert();
  const local = tack.seatPoint.clone().applyMatrix4(inv);
  holder.position.copy(local);
  // pelvis (MakeHuman root bone head ~0.05 m above the mesh origin) over the seat
  rider.root.position.set(0, -(rider.restHead.root?.[1] ?? 0.05) + 0.1 + (opts.raise ?? 0), 0);
  holder.add(rider.root);
  bone.add(holder);
  void restWorld;
  c.root.updateMatrixWorld(true);
  if (opts.grip !== false) addGrip(tack, rider, holder);
  c.root.updateMatrixWorld(true);
  return holder;
}

/**
 * A leather-wrapped grab bar exactly where the seated rider's hands are, held by two straps
 * from the pommel (riders hold on; hands floating in the air read wrong). Built in the mount
 * holder's frame, so it rides with the seat like the rider does.
 */
function addGrip(tack, rider, holder) {
  const find = (n) => (rider.character?.bone ? rider.character.bone(n) : null) || (rider.bones || []).find((b) => b.name === n);
  rider.update?.(0);
  holder.updateMatrixWorld(true);
  rider.root.updateMatrixWorld(true);
  const palm = (sd) => {
    const w = find(`wrist.${sd}`), f = find(`finger3-1.${sd}`);
    if (!w || !f) return null;
    const a = w.getWorldPosition(new THREE.Vector3()), b = f.getWorldPosition(new THREE.Vector3());
    return rider.root.worldToLocal(a.lerp(b, 0.85));
  };
  const pl = palm('L'), pr = palm('R');
  if (!pl || !pr) return;
  // the pommel's front edge in the rider root's frame (the holder sits at the seat point); the
  // grip is the rider's child, so it shows and hides with the rider
  const pom = new THREE.Vector3(0, 0.1, (tack.seatLen ?? 0.62) * 0.5).sub(rider.root.position);
  const mid = pl.clone().add(pr).multiplyScalar(0.5);
  if (mid.distanceTo(pom) > 0.9 || pl.distanceTo(pr) > 0.7) return;
  const leather = leatherMaterial([0.05, 0.032, 0.02], 0.55);
  const across = pr.clone().sub(pl);
  const len = across.length() + 0.14;
  const bar = new THREE.CylinderGeometry(0.017, 0.017, len, 12, 1);
  bar.rotateZ(Math.PI / 2);
  const m = new THREE.Mesh(bar, leather);
  m.position.copy(mid);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), across.clone().normalize());
  const g = new THREE.Group();
  g.name = 'grip';
  g.add(m);
  // two straps from the bar ends down to the pommel
  for (const sd of [-1, 1]) {
    const top = mid.clone().addScaledVector(across.clone().normalize(), sd * (len * 0.5 - 0.03));
    const bot = pom.clone().add(new THREE.Vector3(sd * 0.07, 0, 0));
    const d = top.clone().sub(bot), l = d.length();
    const st = new THREE.BoxGeometry(0.035, l, 0.007);
    const sm = new THREE.Mesh(st, leather);
    sm.position.copy(top).add(bot).multiplyScalar(0.5);
    sm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    g.add(sm);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  rider.root.add(g);
}
